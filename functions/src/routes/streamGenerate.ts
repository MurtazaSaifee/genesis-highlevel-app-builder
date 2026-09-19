/**
 * Server-Sent Events (SSE) Real-Time Code Generation Endpoint
 *
 * Provides a production-grade streaming endpoint (/streamGenerate) that:
 * 1. Authenticates callers using Firebase Auth ID tokens (multi-tenant isolation).
 * 2. Formats and flushes Server-Sent Events (SSE) in real time.
 * 3. Deconstructs streaming tokens into live multi-file events via MultiFileStreamParser.
 * 4. Supports client abort/cancellation via AbortController, immediately halting upstream LLM consumption.
 * 5. Handles errors gracefully with normalized error codes (429, 401, quota, timeout).
 */

import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express";
import { extractUserId } from "../utils/auth";
import {
  streamChatCompletion,
  resolveConfig,
  normalizeLlmError,
  LLMConfig,
  ChatMessage,
} from "../services/llmService";
import {
  buildInitialAppPrompt,
  buildIterativeRefinementPrompt,
} from "../prompts/appContractPrompt";
import { MultiFileStreamParser } from "../utils/streamParser";
import { rateLimitCheck } from "../middleware/rateLimiter";

export interface StreamGeneratePayload {
  prompt: string;
  projectId?: string;
  existingFiles?: Record<string, string>;
  conversationHistory?: ChatMessage[];
  byok?: LLMConfig;
}

export interface StreamGenerateOptions {
  userId: string;
  prompt: string;
  existingFiles?: Record<string, string>;
  conversationHistory?: ChatMessage[];
  byok?: LLMConfig;
  projectId?: string;
  signal?: AbortSignal;
  onEvent: (event: string, data: unknown) => void;
}

export interface GenerationStats {
  durationMs: number;
  tokenCount: number;
  filesCount: number;
}

export interface GenerationResult {
  files: Record<string, string>;
  stats: GenerationStats;
}

/**
 * Sends a single formatted Server-Sent Event down the HTTP response stream.
 * Safely guards against writes to ended, closed, or destroyed sockets.
 */
export function sendSSE(res: Response, event: string, data: unknown): void {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  } catch (err) {
    console.warn("[SSE] Write failed (client socket likely closed):", err);
  }
}

/**
 * Decoupled stream generation runner.
 * Orchestrates prompt assembly, token parsing, and event emissions.
 * Decoupled from Express req/res for fast unit testing and composability.
 */
export async function runStreamGeneration(
  options: StreamGenerateOptions
): Promise<GenerationResult> {
  const {
    prompt,
    existingFiles,
    conversationHistory,
    byok,
    projectId,
    signal,
    onEvent,
  } = options;

  const startTime = Date.now();
  let tokenCount = 0;

  // 1. Build prompt messages based on whether this is an initial build or iterative refinement
  let messages: ChatMessage[];
  if (existingFiles && Object.keys(existingFiles).length > 0) {
    messages = buildIterativeRefinementPrompt(prompt, existingFiles);
  } else {
    messages = buildInitialAppPrompt(prompt);
  }

  // Inject conversation history if provided (inserted before user prompt)
  if (conversationHistory && conversationHistory.length > 0) {
    const systemMsg = messages[0];
    const latestUserMsg = messages[messages.length - 1];
    messages = [systemMsg, ...conversationHistory, latestUserMsg];
  }

  // 2. Resolve LLM model & emit start event
  const resolved = resolveConfig(byok);
  onEvent("start", {
    prompt,
    model: resolved.model,
    timestamp: startTime,
    projectId: projectId || null,
  });

  // 3. Setup multi-file stream parser
  const parser = new MultiFileStreamParser({
    onFileStart: (filename) => {
      onEvent("file_start", { filename });
    },
    onFileContent: (filename, chunk) => {
      onEvent("file_content", { filename, chunk });
    },
    onFileEnd: (filename) => {
      const allFiles = parser.getFiles();
      onEvent("file_end", {
        filename,
        fullContent: allFiles[filename] || "",
      });
    },
    onRawToken: (token) => {
      tokenCount++;
      onEvent("token", { chunk: token });
    },
  });

  // 4. Stream LLM tokens
  try {
    const stream = await streamChatCompletion({
      messages,
      config: byok,
      signal,
    });

    for await (const chunk of stream) {
      if (signal?.aborted) {
        break;
      }

      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta) {
        parser.ingest(delta);
      }
    }

    if (signal?.aborted) {
      return {
        files: parser.getFiles(),
        stats: {
          durationMs: Date.now() - startTime,
          tokenCount,
          filesCount: Object.keys(parser.getFiles()).length,
        },
      };
    }

    // 5. Finalize parser buffer and emit completion
    const finalFiles = parser.flush();
    const durationMs = Date.now() - startTime;
    const stats: GenerationStats = {
      durationMs,
      tokenCount,
      filesCount: Object.keys(finalFiles).length,
    };

    onEvent("done", {
      conversationText: "",
      files: finalFiles,
      stats,
    });

    return {
      files: finalFiles,
      stats,
    };
  } catch (err: unknown) {
    const errObj = err as { name?: string; code?: string; message?: string } | null;
    const isAbort =
      Boolean(signal?.aborted) ||
      errObj?.name === "AbortError" ||
      errObj?.code === "REQUEST_ABORTED" ||
      (typeof errObj?.message === "string" && errObj.message.toLowerCase().includes("abort"));

    // ARCHITECTURE DECISION:
    // If generation was aborted by client disconnect, suppress the error event
    // and return the partial files collected up to the cancellation point.
    if (isAbort) {
      console.log("[runStreamGeneration] Upstream LLM streaming aborted by client.");
      return {
        files: parser.getFiles(),
        stats: {
          durationMs: Date.now() - startTime,
          tokenCount,
          filesCount: Object.keys(parser.getFiles()).length,
        },
      };
    }

    const normalized = normalizeLlmError(err);
    const errorCode = (normalized as { code?: string }).code || "LLM_GENERATION_FAILED";
    onEvent("error", {
      code: errorCode,
      message: normalized.message,
    });

    throw normalized;
  }
}

/**
 * HTTP handler for streamGenerate.
 * Decoupled from onRequest wrapper for direct invocation and testing.
 */
export async function handleStreamGenerate(req: Request, res: Response): Promise<void> {
  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Only POST requests are permitted for generation
  if (req.method !== "POST") {
    res.status(405).json({
      error: "Method not allowed. streamGenerate accepts only POST requests.",
    });
    return;
  }

  // Authenticate caller (validates Firebase Auth ID Token)
  const userId = await extractUserId(req);
  if (!userId) {
    res.status(401).json({
      error: "Unauthorized: Missing or invalid Firebase authentication ID token.",
    });
    return;
  }

  // Rate Limiting (Guard against excessive LLM generation: 10 req/min per user)
  const isAllowed = await rateLimitCheck(req, res, {
    max: 10,
    windowMs: 60000,
    keyGenerator: () => `user:${userId}`,
    message: "Generation rate limit exceeded. Maximum 10 requests per minute.",
  });
  if (!isAllowed) {
    return;
  }

  // Validate request payload
  const body = req.body as StreamGeneratePayload | undefined;
  const prompt = (body?.prompt || "").trim();

  if (!prompt) {
    res.status(400).json({
      error: "Bad Request: prompt is required and must not be empty.",
    });
    return;
  }

  // Establish Server-Sent Events headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });

  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  // Connect client connection disconnect to AbortController
  const abortController = new AbortController();
  let isClientClosed = false;

  const onClientClose = () => {
    if (!isClientClosed) {
      isClientClosed = true;
      console.log(`[streamGenerate] Client disconnect for user ${userId}. Halting LLM generation.`);
      abortController.abort();
    }
  };

  req.on("close", onClientClose);
  req.on("aborted", onClientClose);

  try {
    await runStreamGeneration({
      userId,
      prompt,
      existingFiles: body?.existingFiles,
      conversationHistory: body?.conversationHistory,
      byok: body?.byok,
      projectId: body?.projectId,
      signal: abortController.signal,
      onEvent: (event, data) => sendSSE(res, event, data),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[streamGenerate] Error streaming to user ${userId}:`, errorMsg);
    // Notice: runStreamGeneration already emits the SSE "error" event before throwing.
  } finally {
    req.off("close", onClientClose);
    req.off("aborted", onClientClose);

    if (!res.writableEnded) {
      res.end();
    }
  }
}

/**
 * Cloud Function HTTP Endpoint for SSE Generation.
 * Wire up CORS, authentication, AbortController, and SSE connection lifecycle.
 */
export const streamGenerate = onRequest(
  {
    cors: true,
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  handleStreamGenerate
);
