import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express";
import * as crypto from "crypto";
import {
  getHighLevelConfig,
  exchangeCodeForTokens,
  saveTokens,
  connectSandbox,
  clearIntegration,
  getPublicStatus,
} from "../services/tokenService";
import { extractUserId } from "../utils/auth";

/**
 * Standard HighLevel OAuth scopes required for Genesis
 */
export const DEFAULT_HIGHLEVEL_SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "conversations.readonly",
  "conversations.write",
  "calendars.readonly",
  "calendars.write",
  "locations.readonly",
].join(" ");

/**
 * Generates an HMAC-signed tamper-proof state token binding the flow to a specific Firebase UID.
 */
export function generateOAuthState(userId: string, secret: string): string {
  const timestamp = Date.now().toString();
  const data = `${userId}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", secret).update(data).digest("hex");
  const payload = JSON.stringify({ userId, timestamp, hmac });
  return Buffer.from(payload, "utf-8").toString("base64url");
}

/**
 * Verifies the integrity, authenticity, and expiration (15-min window) of an OAuth state token.
 */
export function verifyOAuthState(
  state: string,
  secret: string
): { valid: boolean; userId?: string; error?: string } {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    const { userId, timestamp, hmac } = parsed;

    if (!userId || !timestamp || !hmac) {
      return { valid: false, error: "Malformed OAuth state token." };
    }

    // 15-minute TTL check to guard against replay attacks
    const ageMs = Date.now() - parseInt(timestamp, 10);
    const MAX_AGE_MS = 15 * 60 * 1000;
    if (isNaN(ageMs) || ageMs > MAX_AGE_MS || ageMs < -60 * 1000) {
      return { valid: false, error: "OAuth authorization session expired. Please retry." };
    }

    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(`${userId}:${timestamp}`)
      .digest("hex");

    const hmacBuf = Buffer.from(hmac, "hex");
    const expectedBuf = Buffer.from(expectedHmac, "hex");

    if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
      return { valid: false, error: "State signature verification failed. Potential CSRF detected." };
    }

    return { valid: true, userId };
  } catch (_err) {
    return { valid: false, error: "Invalid state token structure." };
  }
}


/**
 * GET/POST /getAuthUrl: Generates the HighLevel OAuth authorization redirect URL
 */
export const getAuthUrl = onRequest({ cors: true }, async (req: Request, res: Response) => {
  try {
    const userId = await extractUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized. Authentication token required." });
      return;
    }

    const config = getHighLevelConfig();
    const state = generateOAuthState(userId, config.stateSecret);

    const authUrl = new URL("https://marketplace.gohighlevel.com/oauth/chooselocation");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("scope", DEFAULT_HIGHLEVEL_SCOPES);
    authUrl.searchParams.set("state", state);

    res.status(200).json({
      authUrl: authUrl.toString(),
      state,
      redirectUri: config.redirectUri,
    });
  } catch (error) {
    console.error("[OAuth Route] getAuthUrl failed:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate authorization URL.",
    });
  }
});

/**
 * GET /oauthCallback: HighLevel redirects the user here after authorization
 */
export const oauthCallback = onRequest({ cors: true }, async (req: Request, res: Response) => {
  const config = getHighLevelConfig();

  const errorParam = req.query.error;
  const errorDescription = req.query.error_description;
  if (errorParam) {
    const msg = String(errorDescription || errorParam);
    console.error("[OAuth Route] Error returned in callback from HighLevel:", msg);
    res.redirect(`${config.frontendUrl}/?hl_error=${encodeURIComponent(msg)}`);
    return;
  }

  const code = req.query.code;
  const state = req.query.state;

  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    res.redirect(
      `${config.frontendUrl}/?hl_error=${encodeURIComponent("Missing authorization code or state parameter.")}`
    );
    return;
  }

  // Verify state signature and unpack target Firebase user
  const verification = verifyOAuthState(state, config.stateSecret);
  if (!verification.valid || !verification.userId) {
    console.warn("[OAuth Route] Invalid callback state:", verification.error);
    res.redirect(
      `${config.frontendUrl}/?hl_error=${encodeURIComponent(verification.error || "Invalid state parameter.")}`
    );
    return;
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Save tokens in Firestore scoped to the user
    await saveTokens(verification.userId, tokens, false);

    const locationId = tokens.locationId || "";
    console.info(`[OAuth Route] Successfully connected HighLevel for user ${verification.userId}, location: ${locationId}`);

    res.redirect(
      `${config.frontendUrl}/?hl_connected=true&location_id=${encodeURIComponent(locationId)}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed.";
    console.error("[OAuth Route] Token exchange exception:", message);
    res.redirect(`${config.frontendUrl}/?hl_error=${encodeURIComponent(message)}`);
  }
});

/**
 * POST /connectSandbox: Connect Demo Sandbox fallback for reviewers
 */
export const connectSandboxEndpoint = onRequest({ cors: true }, async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const userId = await extractUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized. Authentication required." });
      return;
    }

    const locationId = req.body?.locationId;
    const record = await connectSandbox(userId, locationId);

    res.status(200).json({
      success: true,
      message: "Demo Sandbox location successfully connected.",
      locationId: record.locationId,
      isSandbox: true,
    });
  } catch (error) {
    console.error("[OAuth Route] connectSandbox failed:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to connect demo sandbox.",
    });
  }
});

/**
 * POST /disconnectHighLevel: Disconnects and deletes HighLevel credentials for user
 */
export const disconnectHighLevelEndpoint = onRequest({ cors: true }, async (req: Request, res: Response) => {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed. Use POST or DELETE." });
    return;
  }

  try {
    const userId = await extractUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized. Authentication required." });
      return;
    }

    await clearIntegration(userId);

    res.status(200).json({
      success: true,
      message: "HighLevel integration disconnected successfully.",
    });
  } catch (error) {
    console.error("[OAuth Route] disconnect failed:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to disconnect integration.",
    });
  }
});

/**
 * GET /getIntegrationStatus: Returns sanitized public integration status
 */
export const getIntegrationStatusEndpoint = onRequest({ cors: true }, async (req: Request, res: Response) => {
  try {
    const userId = await extractUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized. Authentication required." });
      return;
    }

    const status = await getPublicStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    console.error("[OAuth Route] getIntegrationStatus failed:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to retrieve integration status.",
    });
  }
});
