/**
 * Frontend Server-Sent Events (SSE) Streaming Client
 *
 * Connects to the /streamGenerate Cloud Function endpoint via fetch + ReadableStream.
 * Handles:
 * 1. Bearer ID token injection for multi-tenant Firebase authentication.
 * 2. Real-time token streaming and multi-file event decomposition (start, token, file_start, file_content, file_end, done, error).
 * 3. Client-side stream cancellation via native AbortController.
 * 4. Resilient chunk boundary assembly across TCP frames.
 */

export interface StreamStartEvent {
  prompt: string;
  model: string;
  timestamp: number;
  projectId?: string | null;
}

export interface StreamTokenEvent {
  chunk: string;
}

export interface StreamFileStartEvent {
  filename: string;
}

export interface StreamFileContentEvent {
  filename: string;
  chunk: string;
}

export interface StreamFileEndEvent {
  filename: string;
  fullContent: string;
}

export interface StreamDoneEvent {
  conversationText: string;
  files: Record<string, string>;
  stats: {
    durationMs: number;
    tokenCount: number;
    filesCount: number;
  };
}

export interface StreamErrorEvent {
  code: string;
  message: string;
}

export interface StreamEventCallbacks {
  onStart?: (event: StreamStartEvent) => void;
  onToken?: (event: StreamTokenEvent) => void;
  onFileStart?: (event: StreamFileStartEvent) => void;
  onFileContent?: (event: StreamFileContentEvent) => void;
  onFileEnd?: (event: StreamFileEndEvent) => void;
  onDone?: (event: StreamDoneEvent) => void;
  onError?: (event: StreamErrorEvent) => void;
}

export interface StreamGenerateRequestOptions {
  prompt: string;
  projectId?: string;
  existingFiles?: Record<string, string>;
  conversationHistory?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  byok?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  };
  baseUrl?: string;
  getIdToken?: () => Promise<string | null>;
  callbacks: StreamEventCallbacks;
}

export interface StreamController {
  abort: () => void;
  promise: Promise<StreamDoneEvent>;
}

/**
 * Resolves the default base URL for the streamGenerate Cloud Function.
 */
export function getDefaultStreamBaseUrl(): string {
  if (typeof window === "undefined") {
    return "/streamGenerate";
  }

  const metaEnv = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};
  const isEmulator =
    metaEnv.VITE_USE_EMULATORS !== undefined
      ? metaEnv.VITE_USE_EMULATORS === "true"
      : Boolean(metaEnv.DEV);

  if (isEmulator) {
    const projectId = metaEnv.VITE_FIREBASE_PROJECT_ID || "genesis-hl-builder-1";
    return `http://127.0.0.1:5001/${projectId}/us-central1/streamGenerate`;
  }

  return "/streamGenerate";
}

/**
 * Initiates an SSE streaming generation request.
 * Returns a controller allowing mid-stream cancellation and access to completion promise.
 */
export function streamGenerateApp(options: StreamGenerateRequestOptions): StreamController {
  const abortController = new AbortController();
  const baseUrl = options.baseUrl || getDefaultStreamBaseUrl();
  const callbacks = options.callbacks;

  const promise = (async (): Promise<StreamDoneEvent> => {
    // 1. Resolve Firebase Auth ID token
    let idToken: string | null = null;
    if (options.getIdToken) {
      idToken = await options.getIdToken();
    } else {
      try {
        const { auth } = await import("./firebase");
        idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      } catch {
        // Firebase instance not active in non-browser runner
      }
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };

    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const payload = {
      prompt: options.prompt,
      projectId: options.projectId,
      existingFiles: options.existingFiles,
      conversationHistory: options.conversationHistory,
      byok: options.byok,
    };

    let response: globalThis.Response;
    try {
      response = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });
    } catch (fetchErr: unknown) {
      const errObj = fetchErr as { name?: string; message?: string } | null;
      if (abortController.signal.aborted || errObj?.name === "AbortError") {
        const abortEvent: StreamErrorEvent = {
          code: "REQUEST_ABORTED",
          message: "Generation was cancelled by user.",
        };
        callbacks.onError?.(abortEvent);
        throw new Error(abortEvent.message);
      }
      const netError: StreamErrorEvent = {
        code: "NETWORK_ERROR",
        message: errObj?.message || "Failed to establish streaming connection with backend.",
      };
      callbacks.onError?.(netError);
      throw new Error(netError.message);
    }

    // 2. Handle HTTP-level errors (e.g., 401 Unauthorized, 400 Bad Request, 500)
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorCode = `HTTP_${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson.error) {
          errorMessage = errorJson.error;
        }
      } catch {
        // Body was not JSON, retain HTTP status message
      }

      const errPayload: StreamErrorEvent = {
        code: errorCode,
        message: errorMessage,
      };
      callbacks.onError?.(errPayload);
      throw new Error(errorMessage);
    }

    if (!response.body) {
      const err: StreamErrorEvent = {
        code: "EMPTY_STREAM",
        message: "No readable body received in streaming response.",
      };
      callbacks.onError?.(err);
      throw new Error(err.message);
    }

    // 3. Read and parse Server-Sent Events stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let completedEvent: StreamDoneEvent | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE messages are delimited by double newline (\n\n or \r\n\r\n)
        const parts = buffer.split(/\r?\n\r?\n/);
        // Keep the last partial chunk in the buffer
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;

          let eventName = "message";
          let dataStr = "";

          const lines = part.split(/\r?\n/);
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr = line.slice(5).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            switch (eventName) {
              case "start":
                callbacks.onStart?.(data as StreamStartEvent);
                break;
              case "token":
                callbacks.onToken?.(data as StreamTokenEvent);
                break;
              case "file_start":
                callbacks.onFileStart?.(data as StreamFileStartEvent);
                break;
              case "file_content":
                callbacks.onFileContent?.(data as StreamFileContentEvent);
                break;
              case "file_end":
                callbacks.onFileEnd?.(data as StreamFileEndEvent);
                break;
              case "done":
                completedEvent = data as StreamDoneEvent;
                callbacks.onDone?.(completedEvent);
                break;
              case "error":
                callbacks.onError?.(data as StreamErrorEvent);
                break;
            }
          } catch (parseErr) {
            console.warn("[SSE Client] Could not parse event data JSON:", dataStr, parseErr);
          }
        }
      }
    } catch (streamErr: unknown) {
      const errObj = streamErr as { name?: string; message?: string } | null;
      if (abortController.signal.aborted || errObj?.name === "AbortError") {
        const abortEvent: StreamErrorEvent = {
          code: "REQUEST_ABORTED",
          message: "Generation was cancelled by user.",
        };
        callbacks.onError?.(abortEvent);
        throw new Error(abortEvent.message);
      }
      const readErr: StreamErrorEvent = {
        code: "STREAM_READ_ERROR",
        message: errObj?.message || "Error reading from stream response.",
      };
      callbacks.onError?.(readErr);
      throw new Error(readErr.message);
    }

    if (completedEvent) {
      return completedEvent;
    }

    // If stream ended without explicit done event (e.g. truncated), return fallback
    const fallbackDone: StreamDoneEvent = {
      conversationText: "",
      files: {},
      stats: { durationMs: 0, tokenCount: 0, filesCount: 0 },
    };
    return fallbackDone;
  })();

  return {
    abort: () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    },
    promise,
  };
}
