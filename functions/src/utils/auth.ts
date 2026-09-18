import * as admin from "firebase-admin";
import { Request } from "firebase-functions/v2/https";

/**
 * Extracts and verifies the authenticated Firebase User ID from request headers or development payload.
 *
 * In production: Strictly verifies Firebase Bearer ID token.
 * In emulator/local dev: Supports Bearer ID token, or fallback userId in body/query for headless testing.
 */
export async function extractUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  const rawToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split("Bearer ")[1].trim()
      : (typeof req.body?.idToken === "string" ? req.body.idToken.trim() : null) ||
        (typeof req.query?.idToken === "string" ? req.query.idToken.trim() : null);

  if (rawToken) {
    try {
      const decoded = await admin.auth().verifyIdToken(rawToken);
      return decoded.uid;
    } catch (err) {
      console.warn("[Auth Util] Bearer token verification failed, rejecting:", err);
      return null;
    }
  }

  // Developer fallback for emulator testing and headless test runners
  const isEmulator =
    process.env.FUNCTIONS_EMULATOR === "true" ||
    process.env.VITE_USE_EMULATORS === "true" ||
    !process.env.NODE_ENV ||
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test";

  if (isEmulator) {
    const bodyUserId = req.body?.userId;
    const queryUserId = req.query?.userId;
    if (typeof bodyUserId === "string" && bodyUserId.trim().length > 0) {
      return bodyUserId.trim();
    }
    if (typeof queryUserId === "string" && queryUserId.trim().length > 0) {
      return queryUserId.trim();
    }
  }

  return null;
}
