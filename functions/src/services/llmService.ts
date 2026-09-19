/**
 * Provider-Agnostic LLM Orchestration Service
 *
 * Configures the official OpenAI SDK with configurable `baseURL` and BYOK support,
 * enabling seamless operation across:
 * 1. Google AI Studio Gemini Free Tier (https://generativelanguage.googleapis.com/v1beta/openai/)
 * 2. OpenAI Official API (https://api.openai.com/v1)
 * 3. Anthropic / OpenRouter / Custom OpenAI-compatible proxy endpoints
 */

import OpenAI from "openai";

export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  defaultTemperature?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  config?: LLMConfig;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface CreateChatOptions {
  messages: ChatMessage[];
  config?: LLMConfig;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export const DEFAULT_LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const DEFAULT_LLM_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_TEMPERATURE = 0.2;

export class LLMConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigurationError";
  }
}

export class LLMAPIError extends Error {
  public status?: number;
  public code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "LLMAPIError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Resolves the active configuration merging environment defaults with per-request BYOK overrides.
 */
export function resolveConfig(overrideConfig?: LLMConfig): {
  apiKey: string;
  baseURL: string;
  model: string;
  defaultTemperature: number;
} {
  const apiKey = (overrideConfig?.apiKey || process.env.LLM_API_KEY || "").trim();
  const baseURL = (overrideConfig?.baseURL || process.env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL).trim();
  const model = (overrideConfig?.model || process.env.LLM_MODEL || DEFAULT_LLM_MODEL).trim();
  const defaultTemperature =
    overrideConfig?.defaultTemperature !== undefined
      ? overrideConfig.defaultTemperature
      : DEFAULT_TEMPERATURE;

  return {
    apiKey,
    baseURL,
    model,
    defaultTemperature,
  };
}

/**
 * Instantiates an OpenAI SDK client instance configured for the resolved provider.
 */
export function getLlmClient(overrideConfig?: LLMConfig): OpenAI {
  const { apiKey, baseURL } = resolveConfig(overrideConfig);

  if (!apiKey) {
    throw new LLMConfigurationError(
      "No LLM API key configured. Provide an API key via environment variable LLM_API_KEY or BYOK request settings."
    );
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

/**
 * ARCHITECTURE DECISION:
 * We deliberately normalize third-party errors into structured domain errors (LLMAPIError).
 * This shields client interfaces from raw provider stack traces, enables Task 07's SSE
 * error channel to emit standardized error codes, and maps provider rate-limits cleanly.
 */
export function normalizeLlmError(err: unknown): Error {
  if (err instanceof LLMConfigurationError) {
    return err;
  }

  const errObj = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : {};
  const status = (typeof errObj.status === "number"
    ? errObj.status
    : typeof errObj.statusCode === "number"
    ? errObj.statusCode
    : typeof (errObj.response as Record<string, unknown> | undefined)?.status === "number"
    ? ((errObj.response as Record<string, unknown>).status as number)
    : undefined);

  const message = typeof errObj.message === "string"
    ? errObj.message
    : "Unknown error occurred while contacting LLM provider";

  if (status === 401) {
    return new LLMAPIError(
      "Authentication failed: Invalid or expired LLM API key. Check your server settings or BYOK credentials.",
      401,
      "INVALID_API_KEY"
    );
  }

  if (status === 429) {
    return new LLMAPIError(
      "Rate limit or quota exceeded with LLM provider. Please check your account quota or retry shortly.",
      429,
      "RATE_LIMIT_EXCEEDED"
    );
  }

  if (status === 404) {
    return new LLMAPIError(
      `Configured model or baseURL endpoint not found: ${message}`,
      404,
      "MODEL_NOT_FOUND"
    );
  }

  if (status && status >= 500) {
    return new LLMAPIError(
      `LLM provider upstream error (${status}): ${message}`,
      status,
      "UPSTREAM_PROVIDER_ERROR"
    );
  }

  if (errObj.name === "AbortError" || message.toLowerCase().includes("abort")) {
    return new LLMAPIError("LLM generation was cancelled by client request.", 499, "REQUEST_ABORTED");
  }

  return new LLMAPIError(message, status);
}

/**
 * Initiates a streaming chat completion, yielding tokens/chunks asynchronously.
 */
export async function streamChatCompletion(
  options: StreamChatOptions
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const { messages, config, temperature, maxTokens, signal } = options;
  const resolved = resolveConfig(config);
  const client = getLlmClient(config);

  try {
    const stream = await client.chat.completions.create(
      {
        model: resolved.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        temperature: temperature !== undefined ? temperature : resolved.defaultTemperature,
        max_tokens: maxTokens || 8192,
      },
      { signal }
    );

    return stream;
  } catch (error) {
    throw normalizeLlmError(error);
  }
}

/**
 * Executes a non-streaming chat completion, returning the complete assistant content.
 */
export async function createChatCompletion(options: CreateChatOptions): Promise<string> {
  const { messages, config, temperature, maxTokens, signal } = options;
  const resolved = resolveConfig(config);
  const client = getLlmClient(config);

  try {
    const response = await client.chat.completions.create(
      {
        model: resolved.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        temperature: temperature !== undefined ? temperature : resolved.defaultTemperature,
        max_tokens: maxTokens || 8192,
      },
      { signal }
    );

    const content = response.choices?.[0]?.message?.content || "";
    return content;
  } catch (error) {
    throw normalizeLlmError(error);
  }
}
