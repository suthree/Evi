import type { RuntimeConfig } from "./config.js";
import type { ImageModelConfig } from "./config.js";

export interface ModelRequest {
  instructions: string;
  input: string;
}

export interface ModelResponse {
  provider: string;
  api: string;
  model: string;
  responseId: string | null;
  outputText: string;
  requestAttempts?: number;
  recoveredRequestFailures?: string[];
  raw: unknown;
}

export interface ModelClient {
  create(request: ModelRequest): Promise<ModelResponse>;
}

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
}

export interface ImageGenerationResponse {
  provider: string;
  api: string;
  model: string;
  responseId: string | null;
  mimeType: string;
  bytes: Uint8Array;
  raw: unknown;
}

export interface ImageGenerationClient {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
}

export class OpenAICompatibleClient implements ModelClient {
  private readonly config: RuntimeConfig["model"];

  constructor(config: RuntimeConfig["model"]) {
    this.config = config;
  }

  async create(request: ModelRequest): Promise<ModelResponse> {
    if (this.config.api === "responses") {
      return this.createResponse(request);
    }
    return this.createChatCompletion(request);
  }

  private async createChatCompletion(request: ModelRequest): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: "system", content: request.instructions },
        { role: "user", content: request.input }
      ],
      max_tokens: this.config.max_output_tokens,
      temperature: 0
    };
    if (this.config.json_object) body.response_format = { type: "json_object" };
    if (this.config.reasoning_effort) body.reasoning_effort = this.config.reasoning_effort;

    const result = await this.postJson("chat/completions", body);
    const raw = result.payload;
    return {
      provider: this.config.provider,
      api: this.config.api,
      model: this.config.model,
      responseId: typeof raw.id === "string" ? raw.id : null,
      outputText: extractChatOutputText(raw),
      requestAttempts: result.attempts,
      recoveredRequestFailures: result.recoveredFailures,
      raw
    };
  }

  private async createResponse(request: ModelRequest): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      instructions: request.instructions,
      input: request.input,
      max_output_tokens: this.config.max_output_tokens,
      store: this.config.store
    };
    if (this.config.json_object) body.text = { format: { type: "json_object" } };
    if (this.config.reasoning_effort) body.reasoning = { effort: this.config.reasoning_effort };

    const result = await this.postJson("responses", body);
    const raw = result.payload;
    return {
      provider: this.config.provider,
      api: this.config.api,
      model: this.config.model,
      responseId: typeof raw.id === "string" ? raw.id : null,
      outputText: extractResponseOutputText(raw),
      requestAttempts: result.attempts,
      recoveredRequestFailures: result.recoveredFailures,
      raw
    };
  }

  private async postJson(path: string, body: Record<string, unknown>): Promise<{
    payload: Record<string, unknown>;
    attempts: number;
    recoveredFailures: string[];
  }> {
    const base = this.config.base_url.replace(/\/+$/, "");
    const recoveredFailures: string[] = [];
    for (let attempt = 1; attempt <= MODEL_REQUEST_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout_ms);
      try {
        const response = await fetch(`${base}/${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.api_key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const text = await response.text();
        let payload: unknown = text;
        try {
          payload = JSON.parse(text);
        } catch {
          // Keep raw text for diagnostics below.
        }
        if (!response.ok) {
          const failure = `http_${response.status}`;
          if (attempt < MODEL_REQUEST_MAX_ATTEMPTS && isRetryableModelStatus(response.status)) {
            recoveredFailures.push(failure);
            continue;
          }
          throw new Error(`Model request failed (${response.status} ${response.statusText}): ${redact(text)}`);
        }
        if (!isRecord(payload)) {
          throw new Error(`Model response was not a JSON object: ${text.slice(0, 300)}`);
        }
        return { payload, attempts: attempt, recoveredFailures };
      } catch (error) {
        if (attempt < MODEL_REQUEST_MAX_ATTEMPTS && isRetryableModelTransportError(error)) {
          recoveredFailures.push(modelTransportFailureKind(error));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error("Model request exhausted its bounded retry attempts.");
  }
}

const MODEL_REQUEST_MAX_ATTEMPTS = 2;

function isRetryableModelStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isRetryableModelTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError"
    || /fetch failed|econn|enotfound|eai_again|network|socket|connection reset/i.test(error.message);
}

function modelTransportFailureKind(error: unknown): string {
  return error instanceof Error && error.name === "AbortError" ? "timeout" : "network";
}

export class OpenAICompatibleImageClient implements ImageGenerationClient {
  private readonly config: ImageModelConfig;

  constructor(config: ImageModelConfig) {
    this.config = config;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const model = request.model ?? this.config.model;
    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      n: 1
    };
    if (this.config.size) body.size = this.config.size;
    if (this.config.quality) body.quality = this.config.quality;
    if (this.config.output_format) body.output_format = this.config.output_format;
    if (this.config.output_compression !== undefined) body.output_compression = this.config.output_compression;
    if (this.config.background) body.background = this.config.background;
    if (this.config.moderation) body.moderation = this.config.moderation;

    const raw = await this.postJson("images/generations", body);
    const image = extractImageBytes(raw);
    return {
      provider: this.config.provider,
      api: this.config.api,
      model,
      responseId: typeof raw.id === "string" ? raw.id : null,
      mimeType: image.mimeType,
      bytes: image.bytes,
      raw
    };
  }

  private async postJson(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const base = this.config.base_url.replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout_ms);
    try {
      const response = await fetch(`${base}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.api_key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = JSON.parse(text);
      } catch {
        // Keep raw text for diagnostics below.
      }
      if (!response.ok) {
        throw new Error(`Image generation failed (${response.status} ${response.statusText}): ${redact(text)}`);
      }
      if (!isRecord(payload)) {
        throw new Error(`Image generation response was not a JSON object: ${text.slice(0, 300)}`);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractChatOutputText(raw: Record<string, unknown>): string {
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const first = choices[0];
  if (!isRecord(first)) return "";
  const message = first.message;
  if (!isRecord(message)) return "";
  const content = message.content;
  return typeof content === "string" ? content.trim() : "";
}

function extractImageBytes(raw: Record<string, unknown>): { bytes: Uint8Array; mimeType: string } {
  const data = Array.isArray(raw.data) ? raw.data : [];
  const first = data.find(isRecord);
  if (!first) throw new Error("Image generation response did not include data[0].");
  if (typeof first.b64_json === "string" && first.b64_json.trim()) {
    return {
      bytes: Buffer.from(first.b64_json, "base64"),
      mimeType: "image/png"
    };
  }
  if (typeof first.url === "string" && first.url.trim()) {
    throw new Error("Image generation URL responses are unsupported; configure the image model to return b64_json.");
  }
  throw new Error("Image generation response did not include b64_json.");
}

function extractResponseOutputText(raw: Record<string, unknown>): string {
  if (typeof raw.output_text === "string") return raw.output_text.trim();
  const output = Array.isArray(raw.output) ? raw.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (isRecord(part) && typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

function redact(text: string): string {
  return text.replace(/(api[_-]?key|authorization|token)["':\s]+[^"',\s}]+/gi, "$1:[redacted]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
