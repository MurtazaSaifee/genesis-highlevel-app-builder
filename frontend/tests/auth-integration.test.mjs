import assert from "node:assert/strict";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "genesis-hl-builder-1.firebaseapp.com",
  projectId: "genesis-hl-builder-1",
  appId: "1:123456789:web:abcdef123456",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Point to local auth emulator
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

async function runTests() {
  console.log("=== Running Firebase Auth Integration Tests ===");

  const timestamp = Date.now();
  const testEmail = `testuser_${timestamp}@genesis.app`;
  const testPassword = "GenesisSecurePassword123!";

  // 1. Test User Registration
  console.log("1. Testing user registration...");
  const cred = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
  assert.ok(cred.user, "User should be created");
  assert.equal(cred.user.email, testEmail, "Email should match");
  assert.ok(cred.user.uid, "UID should be generated");
  console.log("   ✓ User registration passed:", cred.user.uid);

  // 2. Test Duplicate Registration Prevention
  console.log("2. Testing duplicate email rejection...");
  try {
    await createUserWithEmailAndPassword(auth, testEmail, testPassword);
    assert.fail("Should have thrown auth/email-already-in-use");
  } catch (err) {
    assert.equal(err.code, "auth/email-already-in-use", "Error code must match");
    console.log("   ✓ Duplicate registration prevented (auth/email-already-in-use)");
  }

  // 3. Test Weak Password Validation
  console.log("3. Testing weak password rejection...");
  try {
    await createUserWithEmailAndPassword(auth, `weak_${timestamp}@genesis.app`, "123");
    assert.fail("Should have thrown auth/weak-password");
  } catch (err) {
    assert.equal(err.code, "auth/weak-password", "Error code must match");
    console.log("   ✓ Weak password rejected (auth/weak-password)");
  }

  // 4. Test Sign Out
  console.log("4. Testing sign out...");
  await signOut(auth);
  assert.equal(auth.currentUser, null, "Current user should be null after sign out");
  console.log("   ✓ Sign out passed");

  // 5. Test Sign In with Correct Password
  console.log("5. Testing sign in with correct password...");
  const signinCred = await signInWithEmailAndPassword(auth, testEmail, testPassword);
  assert.ok(signinCred.user, "User should be authenticated");
  assert.equal(signinCred.user.email, testEmail);
  console.log("   ✓ Sign in passed");

  // 6. Test Sign In with Wrong Password
  console.log("6. Testing sign in with invalid password...");
  try {
    await signInWithEmailAndPassword(auth, testEmail, "WrongPassword!");
    assert.fail("Should have thrown auth/invalid-credential");
  } catch (err) {
    assert.ok(
      err.code === "auth/invalid-credential" || err.code === "auth/wrong-password",
      `Expected invalid-credential or wrong-password, got ${err.code}`
    );
    console.log("   ✓ Invalid credentials rejected");
  }

  // Cleanup: sign out at end
  await signOut(auth);
  console.log("\nAll 6 Auth integration test cases passed successfully!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
