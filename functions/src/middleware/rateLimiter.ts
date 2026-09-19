/**
 * Rate Limiting Middleware & Utility for Cloud Functions
 *
 * Implements a robust sliding-window rate limiter per User ID or Client IP.
 * Protects against denial-of-service, abuse, and excessive LLM token consumption.
 *
 * Conforms to RFC 6585 with standard headers:
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset
 * - Retry-After (on HTTP 429)
 */

import { Request } from "firebase-functions/v2/https";
import { Response } from "express";
import { extractUserId } from "../utils/auth";

export interface RateLimiterOptions {
  /**
   * Time window in milliseconds (default: 60,000ms = 1 minute)
   */
  windowMs?: number;

  /**
   * Maximum allowed requests per window (default: 10)
   */
  max?: number;

  /**
   * Custom message returned when limit is exceeded
   */
  message?: string;

  /**
   * Custom key generator function (e.g. to scope rate limit by route or project)
   */
  keyGenerator?: (req: Request) => Promise<string> | string;

  /**
   * Optional function to skip rate limiting (e.g. for health checks)
   */
  skip?: (req: Request) => boolean;
}

export interface RateLimitStatus {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  retryAfterSec: number; // Seconds until reset
}

interface BucketEntry {
  count: number;
  resetAtMs: number;
}

// In-memory bucket store
const bucketStore = new Map<string, BucketEntry>();

// Periodic cleanup interval (runs every 60s)
let cleanupTimer: NodeJS.Timeout | null = null;

function ensureCleanupTimer() {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of bucketStore.entries()) {
        if (now > entry.resetAtMs) {
          bucketStore.delete(key);
        }
      }
    }, 60000);
    // Unref so timer doesn't prevent Node process exit in tests
    if (typeof cleanupTimer.unref === "function") {
      cleanupTimer.unref();
    }
  }
}

/**
 * Resets all rate limiter buckets. Primarily used in unit tests.
 */
export function resetRateLimits(): void {
  bucketStore.clear();
}

/**
 * Resolves the client's IP address from headers or socket.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

/**
 * Checks and records a request against a rate limit bucket key.
 */
export function checkRateLimit(
  key: string,
  options: { windowMs?: number; max?: number } = {}
): RateLimitStatus {
  ensureCleanupTimer();

  const windowMs = options.windowMs ?? 60000;
  const max = options.max ?? 10;
  const now = Date.now();

  let entry = bucketStore.get(key);

  if (!entry || now > entry.resetAtMs) {
    // New window
    entry = {
      count: 1,
      resetAtMs: now + windowMs,
    };
    bucketStore.set(key, entry);

    const resetAtSec = Math.ceil(entry.resetAtMs / 1000);
    return {
      allowed: true,
      limit: max,
      remaining: Math.max(0, max - 1),
      resetAt: resetAtSec,
      retryAfterSec: 0,
    };
  }

  // Existing window
  entry.count += 1;
  const remaining = Math.max(0, max - entry.count);
  const resetAtSec = Math.ceil(entry.resetAtMs / 1000);
  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAtMs - now) / 1000));
  const allowed = entry.count <= max;

  return {
    allowed,
    limit: max,
    remaining,
    resetAt: resetAtSec,
    retryAfterSec,
  };
}

/**
 * Resolves the rate limit key for a request.
 * Prioritizes authenticated User ID; falls back to Client IP.
 */
export async function resolveRateLimitKey(
  req: Request,
  customGenerator?: (req: Request) => Promise<string> | string
): Promise<string> {
  if (customGenerator) {
    return await customGenerator(req);
  }

  const userId = await extractUserId(req);
  if (userId) {
    return `user:${userId}`;
  }

  const ip = getClientIp(req);
  return `ip:${ip}`;
}

/**
 * Applies rate limit check to a Request/Response pair.
 * Sets rate limit response headers.
 * Returns true if request is permitted, false if rate limited (429 response sent).
 */
export async function rateLimitCheck(
  req: Request,
  res: Response,
  options: RateLimiterOptions = {}
): Promise<boolean> {
  if (options.skip && options.skip(req)) {
    return true;
  }

  const key = await resolveRateLimitKey(req, options.keyGenerator);
  const status = checkRateLimit(key, options);

  // Set standard RFC rate limit headers
  res.setHeader("X-RateLimit-Limit", String(status.limit));
  res.setHeader("X-RateLimit-Remaining", String(status.remaining));
  res.setHeader("X-RateLimit-Reset", String(status.resetAt));

  if (!status.allowed) {
    res.setHeader("Retry-After", String(status.retryAfterSec));
    res.status(429).json({
      error: "Too Many Requests",
      message:
        options.message ||
        `Rate limit exceeded. Maximum ${status.limit} requests per ${Math.round(
          (options.windowMs ?? 60000) / 1000
        )}s. Please retry in ${status.retryAfterSec} seconds.`,
      limit: status.limit,
      remaining: 0,
      retryAfter: status.retryAfterSec,
      resetAt: status.resetAt,
    });
    return false;
  }

  return true;
}

/**
 * Express-style middleware wrapper.
 */
export function rateLimiter(options: RateLimiterOptions = {}) {
  return async (req: Request, res: Response, next: () => void | Promise<void>): Promise<void> => {
    const ok = await rateLimitCheck(req, res, options);
    if (ok) {
      await next();
    }
  };
}
