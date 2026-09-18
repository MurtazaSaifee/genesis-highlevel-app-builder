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

// Import compiled functions and services
const {
  executeHighLevelProxy,
  normalizeApiPath,
} = require("../lib/routes/highlevelProxy.js");
const {
  connectSandbox,
  clearIntegration,
} = require("../lib/services/tokenService.js");
const {
  listContacts,
  getContact,
  createContact,
  updateContact,
  listConversations,
  getConversationMessages,
  sendMessage,
  listCalendars,
  getCalendarEvents,
  getFreeSlots,
  resetMockStore,
} = require("../lib/services/sandboxMockService.js");

async function runTests() {
  console.log("=== Running HighLevel API Client & Backend Proxy Tests (Task 05) ===");

  // -------------------------------------------------------------
  // Test 1: URL Path Normalization
  // -------------------------------------------------------------
  console.log("1. Testing Path Normalization...");
  assert.equal(normalizeApiPath("/hlProxy/contacts"), "/contacts");
  assert.equal(normalizeApiPath("hlProxy/contacts/"), "/contacts");
  assert.equal(normalizeApiPath("/contacts/"), "/contacts");
  assert.equal(normalizeApiPath("contacts"), "/contacts");
  assert.equal(normalizeApiPath("/hlProxy/conversations/conv_1/messages"), "/conversations/conv_1/messages");
  assert.equal(normalizeApiPath("/calendars/events"), "/calendars/events");
  console.log("   ✓ normalizeApiPath correctly strips prefixes and normalizes slashes");

  // -------------------------------------------------------------
  // Test 2: Sandbox Mock Service — Direct Unit Verification
  // -------------------------------------------------------------
  console.log("2. Testing Sandbox Mock Engine Contacts...");
  const locId = "sandbox-test-loc-1";
  resetMockStore(locId);

  // 2a. Seeded contacts list
  const initialContacts = listContacts(locId, {});
  assert.ok(initialContacts.contacts.length >= 10, "Should have at least 10 seeded contacts");
  assert.equal(initialContacts.total, initialContacts.contacts.length);
  console.log(`   ✓ Seeded ${initialContacts.total} realistic contacts`);

  // 2b. Query / Search
  const searchSarah = listContacts(locId, { query: "Sarah" });
  assert.equal(searchSarah.contacts.length, 1);
  assert.equal(searchSarah.contacts[0].firstName, "Sarah");
  assert.equal(searchSarah.contacts[0].lastName, "Connor");
  console.log("   ✓ Search query correctly matched 'Sarah Connor'");

  // 2c. Pagination (limit + startAfterId)
  const page1 = listContacts(locId, { limit: 3 });
  assert.equal(page1.contacts.length, 3, "Page 1 should have exactly 3 contacts");
  assert.equal(page1.meta.hasMore, true, "Should have more contacts");
  assert.ok(page1.meta.startAfterId, "Should provide startAfterId");

  const page2 = listContacts(locId, { limit: 3, startAfterId: page1.meta.startAfterId });
  assert.equal(page2.contacts.length, 3, "Page 2 should have 3 contacts");
  // Verify disjoint
  const page1Ids = new Set(page1.contacts.map((c) => c.id));
  const hasOverlap = page2.contacts.some((c) => page1Ids.has(c.id));
  assert.equal(hasOverlap, false, "Page 2 must not overlap with Page 1");
  console.log("   ✓ Pagination using startAfterId slices pages without overlap");

  // 2d. Create Contact
  const created = createContact(locId, {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@computing.org",
    phone: "+15559998877",
    tags: ["vip", "inventor"],
    type: "customer",
  });
  assert.ok(created.contact.id.startsWith("contact_"), "Should assign contact ID");
  assert.equal(created.contact.name, "Ada Lovelace");
  assert.equal(created.contact.type, "customer");

  // 2e. Get Contact
  const fetched = getContact(locId, created.contact.id);
  assert.ok(fetched, "Should find created contact");
  assert.equal(fetched.contact.email, "ada@computing.org");

  // 2f. Update Contact
  const updated = updateContact(locId, created.contact.id, {
    tags: ["vip", "inventor", "pioneer"],
  });
  assert.ok(updated, "Update should succeed");
  assert.deepEqual(updated.contact.tags, ["vip", "inventor", "pioneer"]);
  console.log("   ✓ Contact CRUD (create, get, update) works in sandbox mock");

  // -------------------------------------------------------------
  // Test 3: Sandbox Mock Service — Conversations & Messaging
  // -------------------------------------------------------------
  console.log("3. Testing Sandbox Mock Engine Conversations & Messages...");
  const conversations = listConversations(locId, {});
  assert.ok(conversations.conversations.length >= 3, "Should have seeded conversations");

  const convId = conversations.conversations[0].id;
  const messagesBefore = getConversationMessages(locId, convId);
  const countBefore = messagesBefore.messages.messages.length;

  const sentResult = sendMessage(locId, {
    conversationId: convId,
    message: "Test reply from Genesis assistant",
    type: "SMS",
  });
  assert.equal(sentResult.status, "delivered");
  assert.ok(sentResult.messageId);

  const messagesAfter = getConversationMessages(locId, convId);
  assert.equal(
    messagesAfter.messages.messages.length,
    countBefore + 1,
    "Thread should include new outbound message"
  );
  console.log("   ✓ Conversations listing and message dispatch verified");

  // -------------------------------------------------------------
  // Test 4: Sandbox Mock Service — Calendars & Appointments
  // -------------------------------------------------------------
  console.log("4. Testing Sandbox Mock Engine Calendars & Appointments...");
  const calendars = listCalendars(locId);
  assert.ok(calendars.calendars.length >= 2, "Should have seeded calendars");
  assert.ok(calendars.calendars[0].name.includes("Demo"));

  const events = getCalendarEvents(locId, {});
  assert.ok(events.events.length >= 2, "Should have scheduled events");
  assert.ok(events.events[0].title);
  assert.ok(events.events[0].startTime);

  const freeSlots = getFreeSlots(locId, calendars.calendars[0].id, {
    startDate: "2026-10-01",
  });
  assert.ok(freeSlots["2026-10-01"], "Should return free slots for requested date");
  assert.ok(freeSlots["2026-10-01"].slots.length > 0);
  console.log("   ✓ Calendars, events, and free slot queries verified");

  // -------------------------------------------------------------
  // Test 5: Decoupled Proxy Engine (executeHighLevelProxy) with Sandbox Integration
  // -------------------------------------------------------------
  console.log("5. Testing HighLevel Proxy with User Integration...");
  const testUserId = `test_proxy_user_${Date.now()}`;

  // 5a. Disconnected user should throw "not connected"
  try {
    await executeHighLevelProxy({
      userId: testUserId,
      method: "GET",
      endpoint: "/contacts",
    });
    assert.fail("Should have thrown error for disconnected user");
  } catch (err) {
    assert.ok(
      err.message.includes("not connected"),
      `Expected 'not connected' error, got: ${err.message}`
    );
    console.log("   ✓ Disconnected user correctly blocked with error");
  }

  // 5b. Connect Demo Sandbox for user
  const sandboxLoc = `sandbox-loc-${Date.now()}`;
  await connectSandbox(testUserId, sandboxLoc);

  // 5c. Proxy Contacts List via Sandbox
  const proxyContactsRes = await executeHighLevelProxy({
    userId: testUserId,
    method: "GET",
    endpoint: "/hlProxy/contacts",
    query: { limit: 5 },
  });
  assert.equal(proxyContactsRes.statusCode, 200);
  assert.equal(proxyContactsRes.data.contacts.length, 5);
  console.log("   ✓ Proxy successfully routed GET /contacts in Sandbox mode");

  // 5c-2. Test Multi-Tenant Boundary: Reject unauthorized cross-tenant locationId
  try {
    await executeHighLevelProxy({
      userId: testUserId,
      method: "GET",
      endpoint: "/contacts",
      query: { locationId: "malicious_cross_tenant_location" },
    });
    assert.fail("Should have rejected cross-tenant location query");
  } catch (tenantErr) {
    assert.equal(tenantErr.code, "ERR_HL_TENANT_MISMATCH");
    console.log("   ✓ Cross-tenant location tampering rejected with ERR_HL_TENANT_MISMATCH");
  }

  // 5d. Proxy Contact Creation via Sandbox
  const proxyCreateRes = await executeHighLevelProxy({
    userId: testUserId,
    method: "POST",
    endpoint: "/contacts",
    body: {
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@navy.mil",
    },
  });
  assert.equal(proxyCreateRes.statusCode, 201);
  assert.equal(proxyCreateRes.data.contact.name, "Grace Hopper");
  console.log("   ✓ Proxy successfully routed POST /contacts in Sandbox mode");

  // 5e. Proxy Calendars List via Sandbox
  const proxyCalRes = await executeHighLevelProxy({
    userId: testUserId,
    method: "GET",
    endpoint: "/calendars",
  });
  assert.equal(proxyCalRes.statusCode, 200);
  assert.ok(proxyCalRes.data.calendars.length >= 2);
  console.log("   ✓ Proxy successfully routed GET /calendars in Sandbox mode");

  // 5f. Proxy Conversations List via Sandbox
  const proxyConvRes = await executeHighLevelProxy({
    userId: testUserId,
    method: "GET",
    endpoint: "/conversations",
  });
  assert.equal(proxyConvRes.statusCode, 200);
  assert.ok(proxyConvRes.data.conversations.length >= 3);
  console.log("   ✓ Proxy successfully routed GET /conversations in Sandbox mode");

  // Clean up test user integration
  await clearIntegration(testUserId);
  console.log("   ✓ Cleaned up test user integration document");

  console.log("\nAll HighLevel API Client & Backend Proxy test cases passed successfully!");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
