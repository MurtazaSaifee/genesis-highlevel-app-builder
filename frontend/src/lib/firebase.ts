import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const env: Record<string, string | undefined> =
  typeof import.meta !== "undefined" && import.meta.env
    ? (import.meta.env as unknown as Record<string, string | undefined>)
    : typeof process !== "undefined" && process.env
      ? (process.env as Record<string, string | undefined>)
      : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "genesis-hl-builder-1.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "genesis-hl-builder-1",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "genesis-hl-builder-1.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef123456",
};

// Initialize Firebase singleton
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");

// Determine if local emulator suite should be used
export const isUsingEmulators =
  env.VITE_USE_EMULATORS !== undefined
    ? env.VITE_USE_EMULATORS === "true"
    : Boolean(env.DEV);

// Track if emulators have already been attached to prevent multiple connections in HMR
let emulatorsConnected = false;

if (isUsingEmulators && !emulatorsConnected) {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    emulatorsConnected = true;
    console.info("[Firebase] Connected to local emulator suite (Auth: 9099, Firestore: 8080, Functions: 5001)");
  } catch (error) {
    console.warn("[Firebase] Could not connect to emulators:", error);
  }
}
