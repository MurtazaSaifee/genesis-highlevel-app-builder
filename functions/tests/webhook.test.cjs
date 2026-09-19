const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  validateWebhookPayload,
  resolveTargetProjectId,
  handleHlWebhook,
} = require("../lib/routes/webhook.js");
const { resetRateLimits } = require("../lib/middleware/rateLimiter.js");

class MockRequest extends EventEmitter {
  constructor({ method = "POST", body = {}, query = {}, headers = {}, ip = "127.0.0.1" } = {}) {
    super();
    this.method = method;
    this.body = body;
    this.query = query;
    this.headers = headers;
    this.ip = ip;
    this.socket = { remoteAddress: ip };
  }
}

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.jsonData = null;
    this.writableEnded = false;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  setHeader(name, val) {
    this.headers[name.toLowerCase()] = val;
    return this;
  }

  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }

  json(data) {
    this.jsonData = data;
    this.writableEnded = true;
    this.emit("finish");
    return this;
  }

  end() {
    this.writableEnded = true;
    this.emit("finish");
    return this;
  }
}

function createMockFirestore(savedEvents = []) {
  return {
    collection: (colName) => ({
      doc: (docId) => ({
        collection: (subCol) => ({
          add: async (docData) => {
            const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            savedEvents.push({
              path: `${colName}/${docId}/${subCol}/${eventId}`,
              docId,
              data: docData,
            });
            return { id: eventId };
          },
          doc: (subDocId) => ({
            set: async (docData, options) => {
              const path = `${colName}/${docId}/${subCol}/${subDocId}`;
              const existing = savedEvents.find((e) => e.path === path);
              if (existing) {
                existing.data = { ...existing.data, ...docData };
              } else {
                savedEvents.push({
                  path,
                  docId,
                  subDocId,
                  data: docData,
                });
              }
              return { id: subDocId };
            },
          }),
        }),
      }),
      where: (field, op, val) => ({
        limit: () => ({
          get: async () => {
            if (val === "loc_linked_project") {
              return {
                empty: false,
                docs: [{ id: "proj_linked_123", data: () => ({ name: "Apex CRM" }) }],
              };
            }
            return { empty: true, docs: [] };
          },
        }),
      }),
    }),
  };
}

async function runTests() {
  console.log("=== Running HighLevel Webhook Ingestion Tests (/hlWebhook) ===");

  // 1. Validation of payload structures
  console.log("1. Testing webhook payload validation...");
  const invalidResult1 = validateWebhookPayload(null);
  assert.equal(invalidResult1.valid, false, "Null body must fail validation");

  const invalidResult2 = validateWebhookPayload("string-payload");
  assert.equal(invalidResult2.valid, false, "Primitive body must fail validation");

  const validPayload = {
    type: "ContactCreate",
    locationId: "loc_demo_123",
    contact: {
      id: "cnt_999",
      firstName: "Sarah",
      lastName: "Connor",
      email: "sarah@connor.io",
      phone: "+15551234567",
    },
  };
  const validResult = validateWebhookPayload(validPayload);
  assert.equal(validResult.valid, true, "Valid JSON payload must pass");
  assert.equal(validResult.eventType, "ContactCreate");
  console.log("   ✓ Webhook payload validation verified");

  // 2. Project ID resolution
  console.log("2. Testing project ID resolution precedence...");
  const mockDb = createMockFirestore();
  const reqWithQuery = new MockRequest({ query: { projectId: "proj-query-123" } });
  const resolvedQuery = await resolveTargetProjectId(reqWithQuery, validPayload, mockDb);
  assert.equal(resolvedQuery, "proj-query-123", "Query projectId must take highest precedence");

  const reqWithoutQuery = new MockRequest({ query: {} });
  const payloadWithProject = { ...validPayload, projectId: "proj-body-456" };
  const resolvedBody = await resolveTargetProjectId(reqWithoutQuery, payloadWithProject, mockDb);
  assert.equal(resolvedBody, "proj-body-456", "Payload projectId must take secondary precedence");

  const payloadWithLocation = { ...validPayload, locationId: "loc_linked_project" };
  const resolvedLocation = await resolveTargetProjectId(reqWithoutQuery, payloadWithLocation, mockDb);
  assert.equal(resolvedLocation, "proj_linked_123", "Project lookup by locationId must match linked project");

  const resolvedFallback = await resolveTargetProjectId(reqWithoutQuery, validPayload, mockDb);
  assert.equal(resolvedFallback, "global", "Fallback projectId must default to 'global'");
  console.log("   ✓ Project ID resolution precedence verified");

  // 3. HTTP Method enforcement
  console.log("3. Testing HTTP method enforcement (POST only)...");
  resetRateLimits();
  const getReq = new MockRequest({ method: "GET" });
  const getRes = new MockResponse();
  await handleHlWebhook(getReq, getRes, mockDb);
  assert.equal(getRes.statusCode, 405, "GET request must be rejected with 405");

  const optReq = new MockRequest({ method: "OPTIONS" });
  const optRes = new MockResponse();
  await handleHlWebhook(optReq, optRes, mockDb);
  assert.equal(optRes.statusCode, 204, "OPTIONS request must return 204 No Content");
  console.log("   ✓ Method rejection & CORS preflight verified");

  // 4. Ingestion and Firestore persistence
  console.log("4. Testing webhook event persistence to Firestore...");
  resetRateLimits();
  const savedEvents = [];
  const testDb = createMockFirestore(savedEvents);

  const webhookReq = new MockRequest({
    method: "POST",
    query: { projectId: "proj_apex_crm" },
    body: {
      type: "AppointmentCreate",
      locationId: "loc_888",
      appointment: {
        id: "apt_123",
        title: "Demo Strategy Session",
        startTime: "2026-09-20T10:00:00Z",
      },
    },
    ip: "198.51.100.22",
  });
  const webhookRes = new MockResponse();

  await handleHlWebhook(webhookReq, webhookRes, testDb);

  assert.equal(webhookRes.statusCode, 200, "Successful ingestion must return HTTP 200");
  assert.equal(webhookRes.jsonData.success, true);
  assert.equal(webhookRes.jsonData.projectId, "proj_apex_crm");
  assert.equal(webhookRes.jsonData.eventType, "AppointmentCreate");
  assert.ok(webhookRes.jsonData.eventId, "Must return created eventId");

  assert.equal(savedEvents.length, 1, "Must write exactly one event to Firestore");
  assert.equal(savedEvents[0].docId, "proj_apex_crm");
  assert.equal(savedEvents[0].data.eventType, "AppointmentCreate");
  assert.equal(savedEvents[0].data.source, "highlevel-webhook");
  assert.equal(savedEvents[0].data.locationId, "loc_888");
  console.log(`   ✓ Webhook persisted to Firestore: ${savedEvents[0].path}`);

  // Test 4b: Verify Idempotency - duplicate retry with same id
  const retryReq = new MockRequest({
    method: "POST",
    query: { projectId: "proj_apex_crm" },
    body: {
      id: "apt_123",
      type: "AppointmentCreate",
      locationId: "loc_888",
      appointment: {
        id: "apt_123",
        title: "Demo Strategy Session (Retry)",
      },
    },
    ip: "198.51.100.22",
  });
  const retryRes = new MockResponse();
  await handleHlWebhook(retryReq, retryRes, testDb);
  assert.equal(retryRes.statusCode, 200);
  assert.equal(retryRes.jsonData.eventId, "hl_apt_123");
  assert.equal(savedEvents.length, 1, "Duplicate webhook retry must merge and not create duplicate doc");
  console.log("   ✓ Idempotent deduplication verified (duplicate retry merged safely)");

  // 5. Rate limiting on webhook endpoint
  console.log("5. Testing rate limiting on /hlWebhook...");
  resetRateLimits();
  const floodReq = new MockRequest({
    method: "POST",
    body: { type: "ContactCreate" },
    ip: "203.0.113.99",
  });
  const floodDb = createMockFirestore();

  // Flood 60 requests (allowed)
  for (let i = 0; i < 60; i++) {
    const res = new MockResponse();
    await handleHlWebhook(floodReq, res, floodDb);
    assert.equal(res.statusCode, 200);
  }

  // 61st request should be rate limited
  const blockedRes = new MockResponse();
  await handleHlWebhook(floodReq, blockedRes, floodDb);
  assert.equal(blockedRes.statusCode, 429, "61st request within window must return HTTP 429");
  assert.equal(blockedRes.jsonData.error, "Too Many Requests");
  console.log("   ✓ Webhook flood protection (HTTP 429) verified");

  console.log("\n✓ All HighLevel Webhook Ingestion tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
