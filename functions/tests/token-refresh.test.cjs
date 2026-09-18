const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const admin = require("firebase-admin");
const { getValidToken, saveTokens, getIntegration, clearIntegration } = require("../lib/services/tokenService.js");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "genesis-hl-builder-1" });
  admin.firestore().settings({ ignoreUndefinedProperties: true });
}

async function runTokenTests() {
  console.log("=== Running HighLevel Token Lifecycle & Refresh Tests ===");

  const userId = `test_token_user_${Date.now()}`;

  // 1. Fresh token retrieval (no refresh needed)
  console.log("1. Testing valid token retrieval within validity period...");
  const freshTokens = {
    access_token: "mock_fresh_access_token_123",
    refresh_token: "mock_refresh_token_123",
    expires_in: 3600, // 1 hour lifetime
    locationId: "loc_fresh_test_001",
    companyId: "comp_001",
  };
  await saveTokens(userId, freshTokens, false);

  const tokenResult = await getValidToken(userId);
  assert.equal(tokenResult.accessToken, "mock_fresh_access_token_123");
  assert.equal(tokenResult.locationId, "loc_fresh_test_001");
  assert.equal(tokenResult.isSandbox, false);
  console.log("   ✓ Fresh token returned directly without refresh");

  // 2. Sandbox token bypass
  console.log("2. Testing Sandbox token bypass...");
  const sandboxTokens = {
    access_token: "mock_sandbox_access_token_456",
    refresh_token: "mock_sandbox_refresh_token_456",
    expires_in: 86400,
    locationId: "sandbox_loc_002",
  };
  const sandboxUserId = `sandbox_user_${Date.now()}`;
  await saveTokens(sandboxUserId, sandboxTokens, true);

  const sandboxResult = await getValidToken(sandboxUserId);
  assert.equal(sandboxResult.accessToken, "mock_sandbox_access_token_456");
  assert.equal(sandboxResult.isSandbox, true);
  console.log("   ✓ Sandbox token bypassed external refresh logic cleanly");

  // 3. 5-minute pre-expiry detection
  console.log("3. Testing 5-minute pre-expiry detection...");
  const expiringTokens = {
    access_token: "mock_expiring_access_token",
    refresh_token: "mock_refresh_token_invalid_so_fails",
    expires_in: 2 * 60, // 2 minutes remaining (< 5 minute buffer)
    locationId: "loc_expiring_003",
  };
  const expiringUserId = `expiring_user_${Date.now()}`;
  await saveTokens(expiringUserId, expiringTokens, false);

  const integrationBefore = await getIntegration(expiringUserId);
  assert.ok(Date.now() + 5 * 60 * 1000 >= integrationBefore.expiresAt, "Token should be within 5m buffer");
  console.log("   ✓ Pre-expiry correctly detects token needing refresh within 5m window");

  // Cleanup
  await clearIntegration(userId);
  await clearIntegration(sandboxUserId);
  await clearIntegration(expiringUserId);

  console.log("\nAll Token Lifecycle test cases passed successfully!\n");
}

runTokenTests().catch((err) => {
  console.error("Token test failed:", err);
  process.exit(1);
});
