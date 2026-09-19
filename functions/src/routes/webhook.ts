/**
 * HighLevel Webhook Ingestion Endpoint (/hlWebhook)
 *
 * Receives and validates incoming webhooks from HighLevel (e.g. ContactCreate,
 * ContactDelete, AppointmentCreate, OpportunityStageUpdate).
 *
 * Persists normalized event logs into Firestore subcollection:
 *   /projects/{projectId}/events/{eventId}
 *
 * Enables real-time event-driven updates in active Live Preview and Workspace.
 */

import * as admin from "firebase-admin";
import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express";
import { rateLimitCheck } from "../middleware/rateLimiter";

export interface HighLevelWebhookPayload {
  type?: string;
  event?: string;
  locationId?: string;
  companyId?: string;
  id?: string;
  data?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  appointment?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WebhookEventRecord {
  id?: string;
  projectId: string;
  eventType: string;
  locationId: string | null;
  payload: HighLevelWebhookPayload;
  source: string;
  receivedAt: FirebaseFirestore.FieldValue | number;
  timestamp: number;
}

/**
 * Resolves the target projectId for an incoming webhook.
 * 1. Checks query parameter `projectId`.
 * 2. Checks top-level payload `projectId`.
 * 3. Looks up project by `locationId` in Firestore if available.
 * 4. Falls back to "global" if unassigned.
 */
export async function resolveTargetProjectId(
  req: Request,
  payload: HighLevelWebhookPayload,
  customDb?: FirebaseFirestore.Firestore
): Promise<string> {
  const queryProjectId = req.query?.projectId;
  if (typeof queryProjectId === "string" && queryProjectId.trim()) {
    return queryProjectId.trim();
  }

  if (typeof payload.projectId === "string" && payload.projectId.trim()) {
    return payload.projectId.trim();
  }

  const locationId = payload.locationId;
  if (locationId && typeof locationId === "string") {
    try {
      const db = customDb || admin.firestore();
      // Find a project that has this locationId configured
      const snapshot = await db
        .collection("projects")
        .where("locationId", "==", locationId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        return snapshot.docs[0].id;
      }
    } catch (err) {
      console.warn("[hlWebhook] Failed to query project by locationId:", err);
    }
  }

  return "global";
}

/**
 * Validates and normalizes the webhook payload.
 */
export function validateWebhookPayload(body: unknown): {
  valid: boolean;
  error?: string;
  eventType: string;
  payload: HighLevelWebhookPayload;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      error: "Malformed request: Body must be a non-empty JSON object.",
      eventType: "unknown",
      payload: {},
    };
  }

  const payload = body as HighLevelWebhookPayload;
  const eventType =
    (typeof payload.type === "string" && payload.type.trim()) ||
    (typeof payload.event === "string" && payload.event.trim()) ||
    "CustomEvent";

  return {
    valid: true,
    eventType,
    payload,
  };
}

/**
 * Records a validated webhook event into Firestore.
 * Guarantees idempotency by keying document ID on HighLevel event/entity ID if present.
 * Supports Firestore dependency injection for fast, offline unit testing.
 */
export async function recordWebhookEvent(
  projectId: string,
  eventData: Omit<WebhookEventRecord, "id">,
  db: FirebaseFirestore.Firestore = admin.firestore()
): Promise<string> {
  // ARCHITECTURE DECISION: Idempotent deduplication for at-least-once delivery
  const payload = eventData.payload || {};
  const rawId =
    payload.id ||
    payload.eventId ||
    (payload.appointment && typeof payload.appointment === "object" && (payload.appointment as Record<string, unknown>).id) ||
    (payload.contact && typeof payload.contact === "object" && (payload.contact as Record<string, unknown>).id) ||
    (payload.data && typeof payload.data === "object" && (payload.data as Record<string, unknown>).id);

  if (typeof rawId === "string" && rawId.trim()) {
    const safeDocId = `hl_${rawId.trim()}`;
    const docRef = db.collection("projects").doc(projectId).collection("events").doc(safeDocId);
    await docRef.set(eventData, { merge: true });
    return safeDocId;
  }

  const docRef = await db
    .collection("projects")
    .doc(projectId)
    .collection("events")
    .add(eventData);
  return docRef.id;
}

/**
 * Decoupled handler for /hlWebhook for direct execution & headless testing.
 */
export async function handleHlWebhook(
  req: Request,
  res: Response,
  customDb?: FirebaseFirestore.Firestore
): Promise<void> {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Only POST requests are valid for webhooks
  if (req.method !== "POST") {
    res.status(405).json({
      error: "Method Not Allowed",
      message: "HighLevel webhooks must be sent via POST.",
    });
    return;
  }

  // Rate Limiting (Guard against webhook floods / DDoS: 60 req/min per IP)
  const isAllowed = await rateLimitCheck(req, res, {
    max: 60,
    windowMs: 60000,
    message: "Webhook ingestion rate limit exceeded.",
  });
  if (!isAllowed) {
    return;
  }

  // Validate incoming payload
  const validation = validateWebhookPayload(req.body);
  if (!validation.valid) {
    res.status(400).json({
      error: "Bad Request",
      message: validation.error,
    });
    return;
  }

  const { eventType, payload } = validation;
  const db = customDb || admin.firestore();
  const projectId = await resolveTargetProjectId(req, payload, db);

  const now = Date.now();
  const eventData: Omit<WebhookEventRecord, "id"> = {
    projectId,
    eventType,
    locationId: typeof payload.locationId === "string" ? payload.locationId : null,
    payload,
    source: "highlevel-webhook",
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    timestamp: now,
  };

  try {
    const eventId = await recordWebhookEvent(projectId, eventData, db);

    res.status(200).json({
      success: true,
      eventId,
      projectId,
      eventType,
      timestamp: now,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[hlWebhook] Error writing event to project ${projectId}:`, msg);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to persist webhook event in Firestore.",
    });
  }
}

/**
 * Cloud Function HTTP Endpoint for HighLevel Webhook Ingestion.
 */
export const hlWebhook = onRequest(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  handleHlWebhook
);
