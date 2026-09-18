const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

// Load local environment config matching Cloud Functions
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const admin = require("firebase-admin");
const { verifyOAuthState } = require("../lib/routes/oauth.js");
const { getHighLevelConfig } = require("../lib/services/tokenService.js");

// Direct Admin SDK to local emulator suite
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "genesis-hl-builder-1" });
}

const auth = admin.auth();
const db = admin.firestore();

const FUNCTIONS_BASE = "http://127.0.0.1:5001/genesis-hl-builder-1/us-central1";

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
  console.log("=== Running HighLevel OAuth End-to-End Integration Tests ===");

  // 1. Check functions health endpoint
  console.log("1. Testing Functions health endpoint...");
  const healthRes = await fetch(`${FUNCTIONS_BASE}/health`);
  assert.equal(healthRes.status, 200, "Health check should return 200");
  const healthData = await healthRes.json();
  assert.equal(healthData.status, "healthy");
  console.log("   ✓ Functions health endpoint is active");

  // 2. Register a test user and obtain Firebase ID Token
  console.log("2. Creating test user in Auth emulator...");
  const testEmail = `hl_tester_${Date.now()}@genesis.test`;
  const user = await auth.createUser({
    email: testEmail,
    password: "GenesisPassword123!",
  });
  const userId = user.uid;
  const idToken = await getIdTokenForUid(userId);
  assert.ok(idToken, "Firebase ID token should be generated");
  console.log("   ✓ Test user created with UID:", userId);

  // 3. Test getAuthUrl endpoint
  console.log("3. Testing /getAuthUrl endpoint...");
  const authUrlRes = await fetch(`${FUNCTIONS_BASE}/getAuthUrl`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  assert.equal(authUrlRes.status, 200, "getAuthUrl should return 200");
  const authUrlData = await authUrlRes.json();
  assert.ok(authUrlData.authUrl, "Should return authUrl");
  assert.ok(authUrlData.state, "Should return state token");

  const parsedUrl = new URL(authUrlData.authUrl);
  assert.equal(parsedUrl.hostname, "marketplace.gohighlevel.com");
  assert.equal(parsedUrl.pathname, "/oauth/chooselocation");
  assert.equal(parsedUrl.searchParams.get("response_type"), "code");
  assert.ok(parsedUrl.searchParams.get("client_id"), "Must include client_id");
  assert.ok(parsedUrl.searchParams.get("redirect_uri"), "Must include redirect_uri");
  assert.ok(parsedUrl.searchParams.get("scope")?.includes("contacts.readonly"), "Must include scopes");
  assert.equal(parsedUrl.searchParams.get("state"), authUrlData.state);

  // Verify HMAC state signature matches current user using same configured secret
  const config = getHighLevelConfig();
  const stateVerification = verifyOAuthState(authUrlData.state, config.stateSecret);
  assert.equal(stateVerification.valid, true, "OAuth state must be cryptographically valid");
  assert.equal(stateVerification.userId, userId, "OAuth state must bind to authenticated user UID");
  console.log("   ✓ /getAuthUrl generated correct URL with verified CSRF state binding");

  // 4. Test connectSandbox endpoint
  console.log("4. Testing /connectSandbox endpoint...");
  const sandboxLocId = `reviewer-sandbox-${Date.now()}`;
  const sandboxRes = await fetch(`${FUNCTIONS_BASE}/connectSandbox`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, locationId: sandboxLocId }),
  });

  assert.equal(sandboxRes.status, 200, "connectSandbox should return 200");
  const sandboxData = await sandboxRes.json();
  assert.equal(sandboxData.success, true);
  assert.equal(sandboxData.locationId, sandboxLocId);

  // Verify directly from Firestore emulator
  const integrationDocSnap = await db
    .collection("users")
    .doc(userId)
    .collection("integrations")
    .doc("highlevel")
    .get();
  assert.equal(integrationDocSnap.exists, true, "Firestore integration document must exist");
  const integrationDoc = integrationDocSnap.data();
  assert.equal(integrationDoc.locationId, sandboxLocId);
  assert.equal(integrationDoc.isSandbox, true);
  assert.equal(integrationDoc.status, "connected");
  assert.ok(integrationDoc.accessToken, "Must store access token");
  assert.ok(integrationDoc.refreshToken, "Must store refresh token");
  assert.ok(integrationDoc.expiresAt > Date.now(), "Token must not be expired");
  console.log("   ✓ /connectSandbox successfully created integration in Firestore scoped to user");

  // 5. Test getIntegrationStatus endpoint
  console.log("5. Testing /getIntegrationStatus endpoint...");
  const statusRes = await fetch(`${FUNCTIONS_BASE}/getIntegrationStatus`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  assert.equal(statusRes.status, 200, "getIntegrationStatus should return 200");
  const statusData = await statusRes.json();
  assert.equal(statusData.isConnected, true);
  assert.equal(statusData.locationId, sandboxLocId);
  assert.equal(statusData.isSandbox, true);
  assert.equal(statusData.accessToken, undefined, "Public status must NEVER leak accessToken");
  assert.equal(statusData.refreshToken, undefined, "Public status must NEVER leak refreshToken");
  console.log("   ✓ /getIntegrationStatus returned sanitized public status without secret leaks");

  // 6. Test oauthCallback error redirect
  console.log("6. Testing /oauthCallback error handling...");
  const errorCallbackRes = await fetch(
    `${FUNCTIONS_BASE}/oauthCallback?error=access_denied&error_description=User+declined`,
    { redirect: "manual" }
  );
  assert.equal(errorCallbackRes.status, 302, "Error callback should redirect (HTTP 302)");
  const redirectLoc = errorCallbackRes.headers.get("location");
  assert.ok(redirectLoc?.includes("hl_error="), `Redirect must contain hl_error query param: ${redirectLoc}`);
  console.log("   ✓ /oauthCallback handles access denied cleanly with browser redirect");

  // 7. Test oauthCallback tampered state redirect
  console.log("7. Testing /oauthCallback tampered state rejection...");
  const tamperedCallbackRes = await fetch(
    `${FUNCTIONS_BASE}/oauthCallback?code=mock_code&state=forged_state`,
    { redirect: "manual" }
  );
  assert.equal(tamperedCallbackRes.status, 302, "Tampered state callback should redirect");
  const tamperedLoc = tamperedCallbackRes.headers.get("location");
  assert.ok(tamperedLoc?.includes("hl_error="), "Redirect must contain hl_error for tampered state");
  console.log("   ✓ /oauthCallback successfully rejected forged state parameter");

  // 8. Test disconnectHighLevel endpoint
  console.log("8. Testing /disconnectHighLevel endpoint...");
  const disconnectRes = await fetch(`${FUNCTIONS_BASE}/disconnectHighLevel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });
  assert.equal(disconnectRes.status, 200, "disconnectHighLevel should return 200");

  const docAfterDisconnect = await db
    .collection("users")
    .doc(userId)
    .collection("integrations")
    .doc("highlevel")
    .get();
  assert.equal(docAfterDisconnect.exists, false, "Integration doc must be deleted upon disconnect");

  const finalStatusRes = await fetch(`${FUNCTIONS_BASE}/getIntegrationStatus`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const finalStatusData = await finalStatusRes.json();
  assert.equal(finalStatusData.isConnected, false);
  assert.equal(finalStatusData.status, "not_connected");
  console.log("   ✓ /disconnectHighLevel wiped credentials and reset integration status");

  console.log("\nAll 8 HighLevel OAuth end-to-end integration test cases passed successfully!\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
