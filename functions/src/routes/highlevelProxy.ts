import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express";
import axios, { AxiosError } from "axios";
import { extractUserId } from "../utils/auth";
import {
  getValidToken,
  getHighLevelConfig,
  HighLevelNotConnectedError,
  HighLevelTenantMismatchError,
  markIntegrationExpired,
} from "../services/tokenService";
import { handleSandboxRequest } from "../services/sandboxMockService";

/**
 * Clean Request DTO for HighLevel Proxy execution.
 * Decoupled from transport (Express req/res) for seamless testability and live pairing extension.
 */
export interface HighLevelProxyDTO {
  userId: string;
  method: string;
  endpoint: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export interface HighLevelProxyResult {
  statusCode: number;
  data: unknown;
}

/**
 * Normalizes an API path, stripping leading function route prefix if present.
 */
export function normalizeApiPath(rawPath: string): string {
  let path = (rawPath || "").trim();

  // Ensure starts with /
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  // Strip function endpoint prefix if present (e.g. /hlProxy/contacts -> /contacts)
  if (path.startsWith("/hlProxy")) {
    path = path.substring(8);
  }

  // Ensure starts with / again after stripping prefix
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  // Remove trailing slash if longer than 1 character
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  return path;
}

/**
 * Core Proxy Service logic decoupled from HTTP transport.
 * Handles auth token retrieval, automatic token refresh, sandbox routing, and live API forwarding.
 */
export async function executeHighLevelProxy(
  dto: HighLevelProxyDTO
): Promise<HighLevelProxyResult> {
  const { userId, method, endpoint, query = {}, body = {} } = dto;

  // 1. Retrieve guaranteed valid token and locationId (handles automatic token refresh if needed)
  const tokenInfo = await getValidToken(userId);

  const normalizedPath = normalizeApiPath(endpoint);
  const upperMethod = method.toUpperCase();

  // Multi-tenant boundary check: verify client did not attempt cross-tenant access
  if (query.locationId && String(query.locationId).trim() !== tokenInfo.locationId) {
    throw new HighLevelTenantMismatchError(String(query.locationId), tokenInfo.locationId);
  }
  if (body?.locationId && String(body.locationId).trim() !== tokenInfo.locationId) {
    throw new HighLevelTenantMismatchError(String(body.locationId), tokenInfo.locationId);
  }

  // 2. SANDBOX MODE DISPATCH
  if (tokenInfo.isSandbox) {
    const sandboxRes = handleSandboxRequest(
      tokenInfo.locationId,
      upperMethod,
      normalizedPath,
      query,
      body
    );
    return {
      statusCode: sandboxRes.statusCode,
      data: sandboxRes.data,
    };
  }

  // 3. LIVE HIGHLEVEL V2 API DISPATCH
  const config = getHighLevelConfig();
  const targetUrl = `${config.apiBaseUrl}${normalizedPath}`;

  // Clean and strictly inject authenticated tenant locationId
  const forwardQuery: Record<string, unknown> = { ...query };
  delete forwardQuery.userId;
  delete forwardQuery.endpoint;
  forwardQuery.locationId = tokenInfo.locationId;

  // Clean and strictly inject authenticated tenant locationId into body
  let forwardBody: unknown = undefined;
  if (["POST", "PUT", "PATCH"].includes(upperMethod) && body) {
    const cleanedBody = { ...body };
    delete cleanedBody.userId;
    cleanedBody.locationId = tokenInfo.locationId;
    forwardBody = cleanedBody;
  }

  try {
    const response = await axios({
      url: targetUrl,
      method: upperMethod,
      params: forwardQuery,
      data: forwardBody,
      headers: {
        Authorization: `Bearer ${tokenInfo.accessToken}`,
        Version: "2021-07-28",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    return {
      statusCode: response.status,
      data: response.data,
    };
  } catch (error) {
    const axiosErr = error as AxiosError;
    if (axiosErr.response) {
      // Upstream credential revocation detection: automatically mark integration as expired
      if (axiosErr.response.status === 401) {
        console.warn(
          `[HighLevel Proxy] Upstream 401 received for user ${userId}. Marking integration as expired.`
        );
        await markIntegrationExpired(userId).catch((err) => {
          console.error("[HighLevel Proxy] Failed to mark integration expired:", err);
        });
      }

      console.warn(`[HighLevel Proxy] Upstream API error (${axiosErr.response.status}):`, {
        url: targetUrl,
        method: upperMethod,
        errorData: axiosErr.response.data,
      });
      return {
        statusCode: axiosErr.response.status,
        data: axiosErr.response.data,
      };
    }

    console.error("[HighLevel Proxy] Network or upstream connection failure:", axiosErr.message);
    return {
      statusCode: 502,
      data: {
        error: "HighLevel upstream gateway error.",
        message: axiosErr.message,
      },
    };
  }
}

/**
 * Cloud Function HTTP Proxy Endpoint (/hlProxy)
 *
 * Exposes a unified, CORS-enabled gateway to HighLevel Contacts, Conversations, and Calendars.
 * Shields tokens & secrets, enforces multi-tenancy, and serves sandbox data for reviewers.
 */
export const hlProxy = onRequest({ cors: true }, async (req: Request, res: Response) => {
  try {
    // Authenticate user
    const userId = await extractUserId(req);
    if (!userId) {
      res.status(401).json({
        error: "Unauthorized. Valid Firebase authentication token required.",
      });
      return;
    }

    // Determine target API endpoint
    let endpoint = "";
    if (typeof req.query.endpoint === "string" && req.query.endpoint.trim().length > 0) {
      endpoint = req.query.endpoint.trim();
    } else if (typeof req.headers["x-hl-endpoint"] === "string") {
      endpoint = req.headers["x-hl-endpoint"].trim();
    } else {
      endpoint = req.path || "/";
    }

    // Execute through decoupled proxy engine
    const result = await executeHighLevelProxy({
      userId,
      method: req.method,
      endpoint,
      query: req.query as Record<string, unknown>,
      body: req.body as Record<string, unknown>,
    });

    res.status(result.statusCode).json(result.data);
  } catch (error) {
    if (error instanceof HighLevelNotConnectedError || error instanceof HighLevelTenantMismatchError) {
      res.status(error.statusCode).json({
        error: error.name,
        code: error.code,
        message: error.message,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Internal proxy error.";
    console.error("[HighLevel Proxy] Error handling proxy request:", message);

    res.status(500).json({
      error: "Internal HighLevel proxy error.",
      message,
    });
  }
});
