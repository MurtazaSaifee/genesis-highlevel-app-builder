import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type AuthError,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

function mapFirebaseError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const authError = error as AuthError;
    switch (authError.code) {
      case "auth/email-already-in-use":
        return "This email is already registered. Please sign in instead.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/operation-not-allowed":
        return "Email and password authentication is not enabled.";
      case "auth/weak-password":
        return "Password is too weak. Please use at least 6 characters.";
      case "auth/user-disabled":
        return "This account has been disabled. Please contact support.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password. Please verify your credentials.";
      case "auth/too-many-requests":
        return "Too many unsuccessful attempts. Please wait a moment and try again.";
      case "auth/network-request-failed":
        return "Network connection issue. Please check your emulator or connection.";
      default:
        return authError.message || "An unexpected authentication error occurred.";
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected authentication error occurred.";
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);
  const isInitialized = ref<boolean>(false);

  // Multi-tenancy seam: holds currently active HighLevel Location ID for scoped operations
  const activeLocationId = ref<string | null>(null);

  const isAuthenticated = computed(() => !!user.value);
  const userEmail = computed(() => user.value?.email ?? "");
  const userId = computed(() => user.value?.uid ?? "");

  let authReadyResolver: (() => void) | null = null;
  const authReadyPromise = new Promise<void>((resolve) => {
    authReadyResolver = resolve;
  });

  let unsubscribe: (() => void) | null = null;

  function initAuth(): Promise<void> {
    if (unsubscribe) {
      return isInitialized.value ? Promise.resolve() : authReadyPromise;
    }

    loading.value = true;
    unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        user.value = firebaseUser;
        loading.value = false;
        isInitialized.value = true;
        if (authReadyResolver) {
          authReadyResolver();
          authReadyResolver = null;
        }
      },
      (err) => {
        console.error("[AuthStore] onAuthStateChanged error:", err);
        error.value = mapFirebaseError(err);
        loading.value = false;
        isInitialized.value = true;
        if (authReadyResolver) {
          authReadyResolver();
          authReadyResolver = null;
        }
      }
    );

    return authReadyPromise;
  }

  function waitForAuthInit(): Promise<void> {
    if (isInitialized.value) {
      return Promise.resolve();
    }
    initAuth();
    return authReadyPromise;
  }

  function clearError() {
    error.value = null;
  }

  function setActiveLocation(locationId: string | null) {
    activeLocationId.value = locationId;
  }

  async function signUp(email: string, pass: string): Promise<User> {
    if (loading.value) {
      throw new Error("Authentication operation already in progress.");
    }
    loading.value = true;
    error.value = null;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      user.value = userCredential.user;
      return userCredential.user;
    } catch (err) {
      const message = mapFirebaseError(err);
      error.value = message;
      throw new Error(message);
    } finally {
      loading.value = false;
    }
  }

  async function signIn(email: string, pass: string): Promise<User> {
    if (loading.value) {
      throw new Error("Authentication operation already in progress.");
    }
    loading.value = true;
    error.value = null;
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), pass);
      user.value = userCredential.user;
      return userCredential.user;
    } catch (err) {
      const message = mapFirebaseError(err);
      error.value = message;
      throw new Error(message);
    } finally {
      loading.value = false;
    }
  }

  async function signOut(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await firebaseSignOut(auth);
      user.value = null;
      activeLocationId.value = null;
    } catch (err) {
      const message = mapFirebaseError(err);
      error.value = message;
      throw new Error(message);
    } finally {
      loading.value = false;
    }
  }

  return {
    user,
    loading,
    error,
    isInitialized,
    isAuthenticated,
    userEmail,
    userId,
    activeLocationId,
    setActiveLocation,
    initAuth,
    waitForAuthInit,
    clearError,
    signUp,
    signIn,
    signOut,
  };
});
