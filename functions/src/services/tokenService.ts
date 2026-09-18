import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import axios, { AxiosError } from "axios";

/**
 * Token payload structure returned by HighLevel OAuth 2.0 /token endpoint
 */
export interface HighLevelOAuthTokens {
  access_token: string;
  token_type?: string;
  refresh_token: string;
  expires_in: number; // Lifetime in seconds (typically 86400 = 24h)
  scope?: string;
  userType?: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
}

/**
 * Firestore integration document schema stored at /users/{userId}/integrations/highlevel
 */
export interface HighLevelIntegrationDoc {
  userId: string; // Firebase UID
  locationId: string;
  companyId?: string;
  highLevelUserId?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  scopes: string[];
  isSandbox: boolean;
  status: "connected" | "disconnected" | "expired";
  connectedAt: FieldValue | Timestamp | string;
  updatedAt: FieldValue | Timestamp | string;
}

/**
 * Safe public view of the integration status without exposing secret tokens
 */
export interface PublicIntegrationStatus {
  isConnected: boolean;
  locationId: string | null;
  companyId: string | null;
  isSandbox: boolean;
  expiresAt: number | null;
  scopes: string[];
  status: "connected" | "disconnected" | "expired" | "not_connected";
}

/**
 * Environment configuration for HighLevel OAuth
 */
export function getHighLevelConfig() {
  const clientId = process.env.HIGHLEVEL_CLIENT_ID || "placeholder_client_id";
  const clientSecret = process.env.HIGHLEVEL_CLIENT_SECRET || "placeholder_client_secret";
  const redirectUri =
    process.env.HIGHLEVEL_REDIRECT_URI ||
    "http://127.0.0.1:5001/genesis-hl-builder-1/us-central1/oauthCallback";
  const apiBaseUrl = process.env.HIGHLEVEL_API_BASE_URL || "https://services.leadconnectorhq.com";
  const stateSecret =
    process.env.OAUTH_STATE_SECRET || clientSecret || "genesis_oauth_state_signing_key_default";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  return {
    clientId,
    clientSecret,
    redirectUri,
    apiBaseUrl,
    stateSecret,
    frontendUrl,
  };
}

/**
 * Firestore document reference helper for tenant isolation
 */
function getIntegrationDocRef(userId: string) {
  return admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("integrations")
    .doc("highlevel");
}

/**
 * In-flight promise map to deduplicate concurrent token refresh requests for the same user.
 * Prevents race conditions where simultaneous requests exhaust a one-time refresh token.
 */
const activeRefreshPromises = new Map<string, Promise<HighLevelIntegrationDoc>>();

/**
 * Exchange authorization code for HighLevel access & refresh tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<HighLevelOAuthTokens> {
  const config = getHighLevelConfig();

  const params = new URLSearchParams();
  params.append("client_id", config.clientId);
  params.append("client_secret", config.clientSecret);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", config.redirectUri);
  params.append("user_type", "Location");

  try {
    const response = await axios.post<HighLevelOAuthTokens>(
      `${config.apiBaseUrl}/oauth/token`,
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (error) {
    const axiosErr = error as AxiosError<{ message?: string; error?: string; error_description?: string }>;
    const errorDetails =
      axiosErr.response?.data?.error_description ||
      axiosErr.response?.data?.message ||
      axiosErr.response?.data?.error ||
      axiosErr.message;

    console.error("[TokenService] Code exchange failed:", {
      status: axiosErr.response?.status,
      details: errorDetails,
    });

    throw new Error(`HighLevel token exchange failed: ${errorDetails}`);
  }
}

/**
 * Persist HighLevel tokens into Firestore under /users/{userId}/integrations/highlevel
 */
export async function saveTokens(
  userId: string,
  tokens: HighLevelOAuthTokens,
  isSandbox = false
): Promise<HighLevelIntegrationDoc> {
  const docRef = getIntegrationDocRef(userId);
  const now = Date.now();
  // Compute exact expiration timestamp in ms
  const expiresAt = now + (tokens.expires_in || 86400) * 1000;

  const scopes = tokens.scope
    ? tokens.scope.split(" ").filter((s) => s.trim().length > 0)
    : [
        "contacts.readonly",
        "contacts.write",
        "conversations.readonly",
        "conversations.write",
        "calendars.readonly",
        "calendars.write",
        "locations.readonly",
      ];

  const integrationData: Partial<HighLevelIntegrationDoc> & {
    userId: string;
    locationId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    isSandbox: boolean;
    status: "connected";
    connectedAt: FieldValue;
    updatedAt: FieldValue;
  } = {
    userId,
    locationId: tokens.locationId || (isSandbox ? "sandbox-location-genesis" : ""),
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    scopes,
    isSandbox,
    status: "connected",
    connectedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (tokens.companyId) {
    integrationData.companyId = tokens.companyId;
  }
  if (tokens.userId) {
    integrationData.highLevelUserId = tokens.userId;
  }

  await docRef.set(integrationData, { merge: true });
  return integrationData;
}

/**
 * Retrieve the current integration document for a given user
 */
export async function getIntegration(userId: string): Promise<HighLevelIntegrationDoc | null> {
  const docRef = getIntegrationDocRef(userId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return null;
  }

  return snapshot.data() as HighLevelIntegrationDoc;
}

/**
 * Refresh expired access token using the stored refresh_token
 */
export async function refreshTokens(
  userId: string,
  currentRefreshToken: string
): Promise<HighLevelIntegrationDoc> {
  const config = getHighLevelConfig();

  const params = new URLSearchParams();
  params.append("client_id", config.clientId);
  params.append("client_secret", config.clientSecret);
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", currentRefreshToken);
  params.append("user_type", "Location");

  try {
    const response = await axios.post<HighLevelOAuthTokens>(
      `${config.apiBaseUrl}/oauth/token`,
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );

    const newTokens = response.data;
    const docRef = getIntegrationDocRef(userId);
    const expiresAt = Date.now() + (newTokens.expires_in || 86400) * 1000;

    const updatePayload: Partial<HighLevelIntegrationDoc> = {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || currentRefreshToken,
      expiresAt,
      status: "connected",
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (newTokens.locationId) {
      updatePayload.locationId = newTokens.locationId;
    }

    await docRef.set(updatePayload, { merge: true });

    const updated = await getIntegration(userId);
    if (!updated) {
      throw new Error("Failed to retrieve integration document after refresh.");
    }

    return updated;
  } catch (error) {
    const axiosErr = error as AxiosError<{ message?: string; error?: string }>;
    const errorDetails =
      axiosErr.response?.data?.message || axiosErr.response?.data?.error || axiosErr.message;

    console.error("[TokenService] Refresh token failed for user:", userId, errorDetails);

    // Mark status as expired if refresh token is invalid/revoked
    if (axiosErr.response?.status === 400 || axiosErr.response?.status === 401) {
      // CONCURRENCY CHECK: Verify another instance didn't already refresh the token
      const latestDoc = await getIntegration(userId);
      if (
        latestDoc &&
        latestDoc.refreshToken !== currentRefreshToken &&
        latestDoc.status === "connected"
      ) {
        console.info(
          `[TokenService] Concurrency detected: tokens already refreshed by peer instance for user ${userId}.`
        );
        return latestDoc;
      }

      await getIntegrationDocRef(userId).update({
        status: "expired",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    throw new Error(`Token refresh failed: ${errorDetails}`);
  }
}

/**
 * Returns a guaranteed valid access token and locationId for downstream API calls.
 * Automatically checks 5-minute pre-expiry buffer and deduplicates concurrent refresh requests.
 */
export async function getValidToken(userId: string): Promise<{
  accessToken: string;
  locationId: string;
  isSandbox: boolean;
  companyId?: string;
}> {
  const integration = await getIntegration(userId);

  if (!integration || integration.status !== "connected") {
    throw new Error(`HighLevel is not connected for user: ${userId}`);
  }

  // Sandbox demo tokens do not require external HTTP refresh
  if (integration.isSandbox) {
    return {
      accessToken: integration.accessToken,
      locationId: integration.locationId,
      isSandbox: true,
      companyId: integration.companyId,
    };
  }

  // 5-minute pre-expiry threshold (300,000 ms)
  const BUFFER_MS = 5 * 60 * 1000;
  const isExpiringSoon = Date.now() + BUFFER_MS >= integration.expiresAt;

  if (!isExpiringSoon) {
    return {
      accessToken: integration.accessToken,
      locationId: integration.locationId,
      isSandbox: false,
      companyId: integration.companyId,
    };
  }

  // Deduplicate concurrent refreshes using active promise map
  let refreshPromise = activeRefreshPromises.get(userId);
  if (!refreshPromise) {
    refreshPromise = refreshTokens(userId, integration.refreshToken).finally(() => {
      activeRefreshPromises.delete(userId);
    });
    activeRefreshPromises.set(userId, refreshPromise);
  }

  const refreshed = await refreshPromise;
  return {
    accessToken: refreshed.accessToken,
    locationId: refreshed.locationId,
    isSandbox: false,
    companyId: refreshed.companyId,
  };
}

/**
 * Connect Demo Sandbox fallback for reviewers to test without live Marketplace OAuth credentials
 */
export async function connectSandbox(
  userId: string,
  customLocationId?: string
): Promise<HighLevelIntegrationDoc> {
  const locationId = customLocationId?.trim() || "sandbox-location-genesis";

  const sandboxTokens: HighLevelOAuthTokens = {
    access_token: `sandbox_access_token_${Date.now()}`,
    refresh_token: `sandbox_refresh_token_${Date.now()}`,
    expires_in: 365 * 24 * 60 * 60, // 1 year
    locationId,
    companyId: "sandbox-company-genesis",
    userId: "sandbox-reviewer-user",
    scope:
      "contacts.readonly contacts.write conversations.readonly conversations.write calendars.readonly calendars.write locations.readonly",
  };

  return saveTokens(userId, sandboxTokens, true);
}

/**
 * Clear/disconnect HighLevel integration for a user
 */
export async function clearIntegration(userId: string): Promise<void> {
  const docRef = getIntegrationDocRef(userId);
  await docRef.delete();
}

/**
 * Retrieve sanitized public integration status for client consumption
 */
export async function getPublicStatus(userId: string): Promise<PublicIntegrationStatus> {
  const doc = await getIntegration(userId);

  if (!doc || doc.status === "disconnected") {
    return {
      isConnected: false,
      locationId: null,
      companyId: null,
      isSandbox: false,
      expiresAt: null,
      scopes: [],
      status: "not_connected",
    };
  }

  return {
    isConnected: doc.status === "connected",
    locationId: doc.locationId || null,
    companyId: doc.companyId || null,
    isSandbox: !!doc.isSandbox,
    expiresAt: doc.expiresAt || null,
    scopes: doc.scopes || [],
    status: doc.status,
  };
}
