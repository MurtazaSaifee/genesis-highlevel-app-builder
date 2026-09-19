const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

// Load local environment config matching Cloud Functions
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Setup emulator hosts
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({ projectId: "genesis-hl-builder-1" });
}

const auth = admin.auth();
const db = admin.firestore();

const FUNCTIONS_BASE = "http://127.0.0.1:5001/genesis-hl-builder-1/us-central1";

const { executeHighLevelProxy } = require("../lib/routes/highlevelProxy.js");
const { connectSandbox, clearIntegration } = require("../lib/services/tokenService.js");
const { runStreamGeneration, sendSSE } = require("../lib/routes/streamGenerate.js");
const llmService = require("../lib/services/llmService.js");
const { resetRateLimits, checkRateLimit, rateLimitCheck } = require("../lib/middleware/rateLimiter.js");

/**
 * Helper to exchange Firebase Custom Token for ID Token via local Auth emulator REST API
 */
async function getIdTokenForUid(uid) {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = await res.json();
  if (!data.idToken) {
    throw new Error(`Failed to exchange custom token: ${JSON.stringify(data)}`);
  }
  return data.idToken;
}

async function runTests() {
  console.log("=================================================================");
  console.log("=== Running Task 15 Backend End-to-End Sandbox Verification ===");
  console.log("=================================================================\n");

  resetRateLimits();

  // -------------------------------------------------------------
  // Test 1: Cloud Functions Health Check
  // -------------------------------------------------------------
  console.log("1. Testing Cloud Functions Health Endpoint...");
  const healthRes = await fetch(`${FUNCTIONS_BASE}/health`);
  assert.equal(healthRes.status, 200, "Health check must return HTTP 200");
  const healthData = await healthRes.json();
  assert.equal(healthData.status, "healthy");
  console.log("   ✓ Health check verified at", FUNCTIONS_BASE);

  // -------------------------------------------------------------
  // Test 2: User Authentication & Firebase ID Token Generation
  // -------------------------------------------------------------
  console.log("\n2. Testing Firebase User Auth & ID Token Provisioning...");
  const testEmail = `e2e_user_${Date.now()}@genesis.test`;
  const user = await auth.createUser({
    email: testEmail,
    password: "Password123!Secure",
    displayName: "E2E Lead Evaluator",
  });
  const userId = user.uid;
  const idToken = await getIdTokenForUid(userId);
  assert.ok(idToken, "Must produce valid Firebase ID token");
  console.log("   ✓ Provisioned user:", testEmail, "(UID:", userId + ")");

  // -------------------------------------------------------------
  // Test 3: HighLevel 1-Click Sandbox Connection (/connectSandbox)
  // -------------------------------------------------------------
  console.log("\n3. Testing HighLevel Sandbox Connection via /connectSandbox...");
  const sandboxLocId = `sandbox_loc_e2e_${Date.now()}`;
  const connectRes = await fetch(`${FUNCTIONS_BASE}/connectSandbox`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, locationId: sandboxLocId }),
  });
  assert.equal(connectRes.status, 200, "connectSandbox must return HTTP 200");
  const connectData = await connectRes.json();
  assert.equal(connectData.success, true);
  assert.equal(connectData.locationId, sandboxLocId);

  // Verify Firestore integration document directly
  const integrationDocSnap = await db
    .collection("users")
    .doc(userId)
    .collection("integrations")
    .doc("highlevel")
    .get();
  assert.equal(integrationDocSnap.exists, true, "Firestore integration document must exist");
  const integrationDoc = integrationDocSnap.data();
  assert.equal(integrationDoc.locationId, sandboxLocId);
  assert.equal(integrationDoc.isSandbox, true, "Must be tagged isSandbox: true");
  assert.equal(integrationDoc.status, "connected");
  assert.ok(integrationDoc.accessToken, "Must store encrypted accessToken");
  assert.ok(integrationDoc.refreshToken, "Must store encrypted refreshToken");
  console.log("   ✓ Sandbox connection persisted to Firestore with encrypted credentials");

  // -------------------------------------------------------------
  // Test 4: Project Scaffolding & Initial Snapshot in Firestore
  // -------------------------------------------------------------
  console.log("\n4. Testing Firestore Project Scaffolding & Initial Checkpoint...");
  const projectId = `proj_e2e_${Date.now()}`;
  const projectRef = db.collection("projects").doc(projectId);
  const starterFiles = {
    "index.html": "<!DOCTYPE html><html><body><h1>Starter App</h1></body></html>",
    "app.js": "console.log('Starter script');",
    "style.css": "body { margin: 0; }",
  };

  await projectRef.set({
    id: projectId,
    name: "HighLevel CRM Dashboard",
    description: "Multi-tenant CRM app",
    userId,
    locationId: sandboxLocId,
    files: starterFiles,
    activeFilename: "index.html",
    isDeleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Seed initial checkpoint snapshot
  const snap1Ref = projectRef.collection("snapshots").doc(`snap_init_${Date.now()}`);
  await snap1Ref.set({
    id: snap1Ref.id,
    projectId,
    userId,
    createdAt: Date.now(),
    trigger: "manual",
    description: "Initial Template Scaffolding",
    files: starterFiles,
    filesCount: 3,
  });

  const projectSnap = await projectRef.get();
  assert.equal(projectSnap.exists, true);
  assert.equal(projectSnap.data().locationId, sandboxLocId);
  console.log("   ✓ Project and initial snapshot document confirmed in Firestore");

  // -------------------------------------------------------------
  // Test 5: HighLevel Proxy Endpoints (/hlProxy)
  // -------------------------------------------------------------
  console.log("\n5. Testing HighLevel Proxy Endpoints (/hlProxy) in Sandbox Mode...");

  // 5a. Contacts List
  const contactsRes = await fetch(`${FUNCTIONS_BASE}/hlProxy/contacts?limit=5`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  assert.equal(contactsRes.status, 200, "GET /hlProxy/contacts must return HTTP 200");
  const contactsData = await contactsRes.json();
  assert.ok(Array.isArray(contactsData.contacts), "Must return contacts array");
  assert.equal(contactsData.contacts.length, 5);
  console.log("   ✓ GET /hlProxy/contacts returned 5 realistic contacts");

  // 5b. Contact Creation
  const newContactPayload = {
    firstName: "Ada",
    lastName: "Lovelace",
    email: `ada_${Date.now()}@computing.org`,
    phone: "+15559876543",
  };
  const createContactRes = await fetch(`${FUNCTIONS_BASE}/hlProxy/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newContactPayload),
  });
  assert.equal(createContactRes.status, 201, "POST /hlProxy/contacts must return HTTP 201");
  const createContactData = await createContactRes.json();
  assert.ok(createContactData.contact);
  assert.equal(createContactData.contact.name, "Ada Lovelace");
  console.log("   ✓ POST /hlProxy/contacts created contact 'Ada Lovelace'");

  // 5c. Calendars & Appointments
  const calRes = await fetch(`${FUNCTIONS_BASE}/hlProxy/calendars`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  assert.equal(calRes.status, 200, "GET /hlProxy/calendars must return HTTP 200");
  const calData = await calRes.json();
  assert.ok(calData.calendars.length >= 2, "Must return calendars list");

  const eventsRes = await fetch(`${FUNCTIONS_BASE}/hlProxy/calendars/events`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  assert.equal(eventsRes.status, 200, "GET /hlProxy/calendars/events must return HTTP 200");
  const eventsData = await eventsRes.json();
  assert.ok(eventsData.events.length >= 2, "Must return appointment events");
  console.log("   ✓ GET /hlProxy/calendars and events verified");

  // 5d. Conversations
  const convRes = await fetch(`${FUNCTIONS_BASE}/hlProxy/conversations`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  assert.equal(convRes.status, 200, "GET /hlProxy/conversations must return HTTP 200");
  const convData = await convRes.json();
  assert.ok(convData.conversations.length >= 3, "Must return conversations list");
  console.log("   ✓ GET /hlProxy/conversations verified");

  // 5e. Cross-Tenant Tampering Security Guard
  const tamperRes = await fetch(
    `${FUNCTIONS_BASE}/hlProxy/contacts?locationId=malicious_cross_tenant_location`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    }
  );
  assert.equal(tamperRes.status, 403, "Cross-tenant location query must return HTTP 403 Forbidden");
  console.log("   ✓ Cross-tenant location tampering blocked with HTTP 403");

  // -------------------------------------------------------------
  // Test 6: AI App Generation & SSE Streaming Protocol
  // -------------------------------------------------------------
  console.log("\n6. Testing AI App Generation & SSE Streaming Engine...");

  // Mock LLM stream chunks generating an executive HighLevel CRM app
  const mockGeneratedChunks = [
    { choices: [{ delta: { content: "Here is your generated HighLevel CRM application:\n\n<<<FILE:index.html>>>\n" } }] },
    { choices: [{ delta: { content: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n" } }] },
    { choices: [{ delta: { content: "  <meta charset=\"UTF-8\">\n  <title>HighLevel Executive CRM</title>\n" } }] },
    { choices: [{ delta: { content: "  <script src=\"https://cdn.tailwindcss.com\"></script>\n" } }] },
    { choices: [{ delta: { content: "  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n" } }] },
    { choices: [{ delta: { content: "<body class=\"bg-slate-900 text-white p-6\">\n  <div id=\"app\"></div>\n" } }] },
    { choices: [{ delta: { content: "  <script src=\"app.js\"></script>\n</body>\n</html>\n<<</FILE>>>\n" } }] },
    { choices: [{ delta: { content: "<<<FILE:app.js>>>\n" } }] },
    { choices: [{ delta: { content: "async function loadCrm() {\n" } }] },
    { choices: [{ delta: { content: "  const contacts = await window.highlevel.contacts.list({ limit: 10 });\n" } }] },
    { choices: [{ delta: { content: "  const appts = await window.highlevel.calendars.getAppointments({ limit: 5 });\n" } }] },
    { choices: [{ delta: { content: "  console.log('CRM Loaded:', contacts, appts);\n}\n" } }] },
    { choices: [{ delta: { content: "document.addEventListener('DOMContentLoaded', loadCrm);\n<<</FILE>>>\n" } }] },
    { choices: [{ delta: { content: "<<<FILE:style.css>>>\nbody { font-family: sans-serif; }\n<<</FILE>>>" } }] },
  ];

  // Intercept streamChatCompletion to verify generation protocol deterministically
  const originalStreamChat = llmService.streamChatCompletion;
  llmService.streamChatCompletion = async function mockStream() {
    async function* generate() {
      for (const chunk of mockGeneratedChunks) {
        yield chunk;
      }
    }
    return generate();
  };

  const recordedEvents = [];
  const genResult = await runStreamGeneration({
    userId,
    projectId,
    prompt: "Build an executive HighLevel CRM dashboard that lists recent contacts and appointments",
    onEvent: (event, data) => {
      recordedEvents.push({ event, data });
    },
  });

  // Restore original service
  llmService.streamChatCompletion = originalStreamChat;

  assert.ok(recordedEvents.some((e) => e.event === "start"), "Must emit 'start' event");
  assert.ok(recordedEvents.some((e) => e.event === "token"), "Must emit 'token' events");
  assert.ok(recordedEvents.some((e) => e.event === "file_start"), "Must emit 'file_start' events");
  assert.ok(recordedEvents.some((e) => e.event === "file_end"), "Must emit 'file_end' events");
  assert.ok(recordedEvents.some((e) => e.event === "done"), "Must emit 'done' event");

  // Validate generated code content
  assert.ok(genResult.files["index.html"]);
  assert.ok(genResult.files["app.js"]);
  assert.ok(genResult.files["style.css"]);
  assert.ok(
    genResult.files["app.js"].includes("window.highlevel.contacts.list"),
    "Generated code must call HighLevel Contacts API"
  );
  assert.ok(
    genResult.files["app.js"].includes("window.highlevel.calendars.getAppointments"),
    "Generated code must call HighLevel Calendars API"
  );
  console.log("   ✓ Multi-file generation verified: emitted 5 event types and valid HighLevel app contracts");

  // Save generated files and record post-generation snapshot in Firestore
  await projectRef.update({
    files: genResult.files,
    updatedAt: Date.now(),
  });
  const snap2Ref = projectRef.collection("snapshots").doc(`snap_gen_${Date.now()}`);
  await snap2Ref.set({
    id: snap2Ref.id,
    projectId,
    userId,
    createdAt: Date.now(),
    trigger: "generation",
    prompt: "Build an executive HighLevel CRM dashboard",
    description: "AI Generation: CRM Dashboard",
    files: genResult.files,
    filesCount: 3,
  });
  console.log("   ✓ Generated files persisted to project and post-generation snapshot captured");

  // -------------------------------------------------------------
  // Test 7: API Rate Limiting Middleware Throttling
  // -------------------------------------------------------------
  console.log("\n7. Testing API Rate Limiting Middleware...");
  resetRateLimits();

  // Test Rate Limiter Sliding Window and Quota Exhaustion
  const burstKey = `user:${userId}`;
  let lastStatus;
  for (let i = 0; i < 10; i++) {
    lastStatus = checkRateLimit(burstKey, { max: 10, windowMs: 60000 });
    assert.equal(lastStatus.allowed, true, `Request #${i + 1} within quota must be allowed`);
  }
  assert.equal(lastStatus.remaining, 0, "Remaining quota must be 0 after 10 requests");

  // 11th request triggers rate limiting
  const blockedStatus = checkRateLimit(burstKey, { max: 10, windowMs: 60000 });
  assert.equal(blockedStatus.allowed, false, "11th request must be blocked");
  assert.ok(blockedStatus.retryAfterSec > 0, "retryAfterSec must be set");

  // Verify full rateLimitCheck middleware with HTTP 429 response formatting
  const mockHeaders = {};
  let mockStatusCode = 200;
  let mockBody = null;
  const mockRes = {
    setHeader(k, v) { mockHeaders[k.toLowerCase()] = v; },
    getHeader(k) { return mockHeaders[k.toLowerCase()]; },
    status(code) { mockStatusCode = code; return this; },
    json(data) { mockBody = data; return this; },
  };

  const isAllowed = await rateLimitCheck(
    { headers: { authorization: `Bearer ${idToken}` }, ip: "127.0.0.1" },
    mockRes,
    { max: 10, windowMs: 60000, keyGenerator: () => burstKey }
  );

  assert.equal(isAllowed, false, "rateLimitCheck must reject throttled user");
  assert.equal(mockStatusCode, 429, "Must respond with HTTP 429 status code");
  assert.ok(mockHeaders["retry-after"], "Must set Retry-After header");
  assert.equal(mockHeaders["x-ratelimit-remaining"], "0");
  assert.equal(mockBody.error, "Too Many Requests");
  console.log(`   ✓ Rate limit enforced: HTTP 429 triggered with Retry-After: ${mockHeaders["retry-after"]}s`);

  // -------------------------------------------------------------
  // Test 8: HighLevel Webhook Ingestion (/hlWebhook)
  // -------------------------------------------------------------
  console.log("\n8. Testing HighLevel Webhook Ingestion (/hlWebhook)...");
  resetRateLimits();

  const webhookPayload = {
    type: "ContactCreate",
    locationId: sandboxLocId,
    projectId,
    contact: {
      id: `hl_contact_${Date.now()}`,
      name: "Webhook Ingested Lead",
      email: "lead@automated-hl.com",
    },
  };

  const webhookRes = await fetch(`${FUNCTIONS_BASE}/hlWebhook?projectId=${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });
  assert.equal(webhookRes.status, 200, "/hlWebhook must return HTTP 200");
  const webhookData = await webhookRes.json();
  assert.equal(webhookData.success, true);
  assert.ok(webhookData.eventId);

  // Verify Firestore event document
  const eventDocSnap = await projectRef.collection("events").doc(webhookData.eventId).get();
  assert.equal(eventDocSnap.exists, true, "Webhook event must be recorded in Firestore");
  const eventDoc = eventDocSnap.data();
  assert.equal(eventDoc.eventType, "ContactCreate");
  assert.equal(eventDoc.locationId, sandboxLocId);
  console.log("   ✓ /hlWebhook successfully ingested and logged event to Firestore:", webhookData.eventId);

  // -------------------------------------------------------------
  // Test 9: Snapshot History Verification & Multi-Tenancy
  // -------------------------------------------------------------
  console.log("\n9. Testing Snapshot History & Version Control Persistence...");
  const snapshotsSnap = await projectRef.collection("snapshots").get();
  assert.equal(snapshotsSnap.size, 2, "Must contain initial and generation snapshots");
  console.log("   ✓ Confirmed", snapshotsSnap.size, "point-in-time snapshots in Firestore subcollection");

  // -------------------------------------------------------------
  // Test 10: Clean Up
  // -------------------------------------------------------------
  console.log("\n10. Cleaning up test fixtures...");
  await clearIntegration(userId);
  await db.recursiveDelete(projectRef);
  await auth.deleteUser(userId);
  console.log("   ✓ Test user, project, and integration fixtures cleanly purged");

  console.log("\n=================================================================");
  console.log("🎉 ALL TASK 15 BACKEND END-TO-END SANDBOX VERIFICATIONS PASSED!");
  console.log("=================================================================\n");
}

runTests().catch((err) => {
  console.error("Backend E2E verification failed:", err);
  process.exit(1);
});
