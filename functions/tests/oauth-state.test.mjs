import assert from "node:assert/strict";
import { generateOAuthState, verifyOAuthState } from "../lib/routes/oauth.js";

console.log("=== Running HighLevel OAuth Cryptographic State Tests ===");

const secret = "test_signing_secret_genesis_123";
const userId = "firebase_user_abc123";

// 1. Valid state generation and verification
console.log("1. Testing valid state generation & verification...");
const state = generateOAuthState(userId, secret);
assert.ok(typeof state === "string", "State must be a string");
assert.ok(state.length > 20, "State must have non-trivial length");

const verification = verifyOAuthState(state, secret);
assert.equal(verification.valid, true, "State must be valid");
assert.equal(verification.userId, userId, "Extracted userId must match input userId");
console.log("   ✓ State verified successfully for userId:", verification.userId);

// 2. Tampered state token rejection
console.log("2. Testing tampered state token detection...");
// Flip a character in the base64 string
const tamperedState = state.slice(0, -3) + (state.slice(-3) === "abc" ? "xyz" : "abc");
const tamperedVerification = verifyOAuthState(tamperedState, secret);
assert.equal(tamperedVerification.valid, false, "Tampered state must fail validation");
assert.ok(tamperedVerification.error, "Error message must be present");
console.log("   ✓ Tampered state rejected correctly:", tamperedVerification.error);

// 3. Wrong secret verification rejection
console.log("3. Testing wrong secret rejection...");
const wrongSecretVerification = verifyOAuthState(state, "wrong_secret_key");
assert.equal(wrongSecretVerification.valid, false, "State with wrong secret must fail");
assert.equal(wrongSecretVerification.error, "State signature verification failed. Potential CSRF detected.");
console.log("   ✓ Wrong secret rejected correctly");

// 4. Expired state token rejection (> 15 minutes)
console.log("4. Testing expired state token rejection...");
// Construct an expired state token manually
import * as crypto from "crypto";
const pastTimestamp = (Date.now() - 16 * 60 * 1000).toString(); // 16 minutes ago
const data = `${userId}:${pastTimestamp}`;
const expiredHmac = crypto.createHmac("sha256", secret).update(data).digest("hex");
const expiredPayload = JSON.stringify({ userId, timestamp: pastTimestamp, hmac: expiredHmac });
const expiredState = Buffer.from(expiredPayload, "utf-8").toString("base64url");

const expiredVerification = verifyOAuthState(expiredState, secret);
assert.equal(expiredVerification.valid, false, "Expired state must fail validation");
assert.equal(expiredVerification.error, "OAuth authorization session expired. Please retry.");
console.log("   ✓ Expired state rejected correctly (15m TTL enforced)");

// 5. Future timestamp rejection
console.log("5. Testing future timestamp rejection...");
const futureTimestamp = (Date.now() + 10 * 60 * 1000).toString(); // 10 minutes in future
const futureData = `${userId}:${futureTimestamp}`;
const futureHmac = crypto.createHmac("sha256", secret).update(futureData).digest("hex");
const futurePayload = JSON.stringify({ userId, timestamp: futureTimestamp, hmac: futureHmac });
const futureState = Buffer.from(futurePayload, "utf-8").toString("base64url");

const futureVerification = verifyOAuthState(futureState, secret);
assert.equal(futureVerification.valid, false, "Future state must fail validation");
console.log("   ✓ Future state rejected correctly");

console.log("\nAll 5 OAuth state cryptographic test cases passed successfully!\n");
