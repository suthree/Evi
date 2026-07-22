import { createHash } from "node:crypto";
import {
  createModels,
  createProvider,
  type ApiKeyAuth,
  type Model,
  type Models,
  type ThinkingLevel
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import {
  AgentHarness,
  Session,
  SessionError,
  uuidv7,
  type AgentTool,
  type SessionEntryCursorOptions,
  type SessionMetadata,
  type SessionStats,
  type SessionStorage,
  type SessionTreeEntry
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { ActionGateway } from "./action_gateway.js";
import type { AgentLoop, AgentLoopFactory, ExecutionLock } from "./contracts.js";
import type { RunExecutionLease } from "./execution_types.js";
import {
  assistantText,
  reconcileInterruptedPiProtocol,
  toPiToolResult
} from "./pi_protocol_recovery.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

export interface PiAgentHarnessAdapterOptions {
  store: SqliteRuntimeStore;
  models: Models;
  model: Model<any>;
  cwd: string;
  system_prompt?: string;
  redact_text?: (value: string) => string;
  expected_execution_lock_digest?: string;
  thinking_level?: ThinkingLevel;
  timeout_ms?: number;
}

/**
 * Narrow production composition for the explicit vNext read-only canary.
 *
 * The caller supplies only an endpoint, model identifier, and environment
 * variable name. Pi resolves the credential at dispatch time; neither the key
 * nor a Pi credential store is introduced into runtime state.
 */
export interface ResponsesCompatiblePiLoopFactoryOptions {
  store: SqliteRuntimeStore;
  execution_lock: ExecutionLock;
  api_key_env: string;
  system_prompt?: string;
}

export function createResponsesCompatiblePiLoopFactory(
  input: ResponsesCompatiblePiLoopFactoryOptions
): PiAgentHarnessLoopFactory {
  const apiKeyEnv = validateApiKeyEnvironment(input.api_key_env);
  const apiKey = process.env[apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new Error(`Canary credential environment variable is not set: ${apiKeyEnv}`);
  }
  if (input.execution_lock.model.api !== "openai-responses"
    || input.execution_lock.model.credential_ref !== apiKeyEnv) {
    throw new Error("Canary model configuration does not match its immutable Execution Lock.");
  }
  return createLockedOpenAICompatiblePiLoopFactory({
    store: input.store,
    execution_lock: input.execution_lock,
    api_key: apiKey,
    system_prompt: input.system_prompt
  });
}

export interface LockedOpenAICompatiblePiLoopFactoryOptions {
  store: SqliteRuntimeStore;
  execution_lock: ExecutionLock;
  api_key: string;
  system_prompt?: string;
}

export function createLockedOpenAICompatiblePiLoopFactory(
  input: LockedOpenAICompatiblePiLoopFactoryOptions
): PiAgentHarnessLoopFactory {
  const lock = input.execution_lock;
  const apiKey = input.api_key.trim();
  if (!apiKey) throw new Error("Configured model credential is unavailable.");
  if (lock.model.api !== "openai-responses" && lock.model.api !== "openai-completions") {
    throw new Error("Configured model API is not supported by the OpenAI-compatible Pi Adapter.");
  }
  const api = lock.model.api;
  const model: Model<any> = {
    id: lock.model.model,
    name: lock.model.model,
    api,
    provider: lock.model.provider,
    baseUrl: lock.model.base_url,
    reasoning: lock.model.reasoning_effort !== null,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: lock.model.context_window_tokens,
    maxTokens: lock.model.max_output_tokens
  };
  const models = createModels();
  models.setProvider(createProvider({
    id: model.provider,
    name: `Locked ${lock.model.provider} provider`,
    baseUrl: lock.model.base_url,
    auth: { apiKey: fixedApiKeyAuth(apiKey) },
    models: [model],
    api: lock.model.api === "openai-responses" ? openAIResponsesApi() : openAICompletionsApi()
  }));
  return new PiAgentHarnessLoopFactory({
    store: input.store,
    models,
    model,
    cwd: lock.authority.cwd,
    system_prompt: input.system_prompt,
    redact_text: (value) => redactSecret(value, apiKey),
    expected_execution_lock_digest: lock.digest,
    ...(lock.model.reasoning_effort
      ? { thinking_level: lock.model.reasoning_effort as ThinkingLevel }
      : {}),
    timeout_ms: lock.model.timeout_ms
  });
}

function validateApiKeyEnvironment(value: string): string {
  const name = value.trim();
  if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(name)) {
    throw new Error("Canary --api-key-env must name one environment variable.");
  }
  return name;
}

function fixedApiKeyAuth(apiKey: string): ApiKeyAuth {
  return {
    name: "Configured model credential",
    async resolve() {
      return { auth: { apiKey }, source: "configured credential" };
    }
  };
}

export class PiAgentHarnessLoopFactory implements AgentLoopFactory {
  constructor(private readonly options: PiAgentHarnessAdapterOptions) {}

  create(input: {
    run_id: string;
    turn_id: string;
    session_id: string;
    action_gateway: ActionGateway;
    execution: RunExecutionLease;
    execution_lock: ExecutionLock;
  }): AgentLoop {
    this.assertExecutionLock(input.execution_lock);
    const storage = new SqlitePiSessionStorage(
      this.options.store,
      input.session_id,
      this.options.redact_text
    );
    const session = new Session(storage);
    const tools = createPiActionTools(input.action_gateway, input);
    const harness = new AgentHarness({
      env: new NodeExecutionEnv({ cwd: this.options.cwd }),
      session,
      models: this.options.models,
      model: this.options.model,
      ...(this.options.thinking_level ? { thinkingLevel: this.options.thinking_level } : {}),
      ...(this.options.timeout_ms ? { streamOptions: { timeoutMs: this.options.timeout_ms } } : {}),
      systemPrompt: this.options.system_prompt ?? "You are a concise and reliable local-first agent.",
      tools
    });
    let activeDispatchId: string | null = null;
    harness.on("before_provider_request", (event) => {
      const dispatch = this.options.store.startModelDispatch(input.execution, {
        provider: event.model.provider,
        model: event.model.id
      });
      activeDispatchId = dispatch.id;
      return undefined;
    });
    harness.on("after_provider_response", (event) => {
      if (!activeDispatchId) throw new Error("Provider response has no active model dispatch.");
      this.options.store.observeModelResponse(input.execution, activeDispatchId, event.status);
      return undefined;
    });
    harness.subscribe((event) => {
      if (event.type !== "message_end" || event.message.role !== "assistant" || !activeDispatchId) {
        return;
      }
      this.options.store.settleModelDispatch(input.execution, activeDispatchId, {
        stop_reason: event.message.stopReason,
        message_digest: createHash("sha256").update(JSON.stringify(event.message)).digest("hex")
      });
      activeDispatchId = null;
    });
    return {
      execute: async (request, signal) => {
        if (signal.aborted) throw new Error("Run execution aborted before Pi AgentHarness start.");
        const abortHarness = () => {
          void harness.abort().catch(() => undefined);
        };
        signal.addEventListener("abort", abortHarness, { once: true });
        try {
          try {
            const recoveredAnswer = await reconcileInterruptedPiProtocol({
              store: this.options.store,
              session,
              harness,
              gateway: input.action_gateway,
              execution: input.execution,
              run_id: input.run_id,
              turn_id: input.turn_id,
              signal
            });
            if (recoveredAnswer !== null) {
              return { answer: redactText(recoveredAnswer, this.options.redact_text) };
            }
            const response = await harness.prompt(request);
            if (response.stopReason === "error" || response.stopReason === "aborted") {
              throw new Error(response.errorMessage || `Pi AgentHarness stopped: ${response.stopReason}`);
            }
            const answer = redactText(assistantText(response), this.options.redact_text);
            if (!answer.trim()) throw new Error("Pi AgentHarness returned no text response.");
            return { answer };
          } catch (error) {
            throw new Error(redactText(errorMessage(error), this.options.redact_text));
          }
        } finally {
          signal.removeEventListener("abort", abortHarness);
        }
      }
    };
  }

  private assertExecutionLock(lock: ExecutionLock): void {
    if (this.options.expected_execution_lock_digest
      && lock.digest !== this.options.expected_execution_lock_digest) {
      throw new Error("Pi Adapter received a different immutable Execution Lock.");
    }
    if (this.options.model.provider !== lock.model.provider
      || this.options.model.id !== lock.model.model
      || this.options.model.api !== lock.model.api
      || this.options.model.baseUrl.replace(/\/$/u, "") !== lock.model.base_url
      || this.options.model.contextWindow !== lock.model.context_window_tokens
      || this.options.model.maxTokens !== lock.model.max_output_tokens
      || this.options.cwd !== lock.authority.cwd) {
      throw new Error("Pi Adapter configuration does not match the immutable Execution Lock.");
    }
  }
}

function createPiActionTools(
  gateway: ActionGateway,
  input: { run_id: string; turn_id: string; session_id: string }
): AgentTool[] {
  return gateway.contracts().map((contract): AgentTool => ({
    name: contract.name,
    label: contract.label,
    description: contract.description,
    parameters: contract.parameters,
    executionMode: "sequential",
    execute: async (toolCallId, arguments_, signal) => {
      const result = await gateway.invoke({
        run_id: input.run_id,
        turn_id: input.turn_id,
        invocation_id: toolCallId,
        action_name: contract.name,
        arguments: arguments_
      }, signal);
      return toPiToolResult(result);
    }
  }));
}

class SqlitePiSessionStorage implements SessionStorage<SessionMetadata> {
  constructor(
    private readonly store: SqliteRuntimeStore,
    private readonly sessionId: string,
    private readonly redactText?: (value: string) => string
  ) {
    if (!store.getPiSession(sessionId)) throw new SessionError("not_found", `Session not found: ${sessionId}`);
  }

  async getMetadata(): Promise<SessionMetadata> {
    const session = this.requireSession();
    return { id: session.id, createdAt: session.created_at };
  }

  async getLeafId(): Promise<string | null> {
    return this.requireSession().leaf_id;
  }

  async setLeafId(leafId: string | null): Promise<void> {
    if (leafId !== null && !this.store.getPiSessionEntry(this.sessionId, leafId)) {
      throw new SessionError("not_found", `Entry ${leafId} not found`);
    }
    const entry: SessionTreeEntry = {
      type: "leaf",
      id: await this.createEntryId(),
      parentId: await this.getLeafId(),
      timestamp: new Date().toISOString(),
      targetId: leafId
    };
    this.store.appendPiSessionEntry(this.sessionId, entry);
  }

  async createEntryId(): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = uuidv7().slice(-8);
      if (!this.store.getPiSessionEntry(this.sessionId, candidate)) return candidate;
    }
    return uuidv7();
  }

  async appendEntry(entry: SessionTreeEntry): Promise<void> {
    this.store.appendPiSessionEntry(this.sessionId, redactSessionEntry(entry, this.redactText));
  }

  async getEntry(id: string): Promise<SessionTreeEntry | undefined> {
    return (this.store.getPiSessionEntry(this.sessionId, id) as SessionTreeEntry | null) ?? undefined;
  }

  async findEntries<TType extends SessionTreeEntry["type"]>(
    type: TType
  ): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
    return this.store.getPiSessionEntries(this.sessionId)
      .filter((entry): entry is Extract<SessionTreeEntry, { type: TType }> =>
        typeof entry === "object" && entry !== null && "type" in entry && entry.type === type
      );
  }

  async getLabel(id: string): Promise<string | undefined> {
    return this.store.getPiSessionLabel(this.sessionId, id);
  }

  async getSessionName(): Promise<string | undefined> {
    const entries = await this.findEntries("session_info");
    return entries[entries.length - 1]?.name?.trim() || undefined;
  }

  async getSessionStats(): Promise<SessionStats> {
    let messageCount = 0;
    let cachedTokens = 0;
    let uncachedTokens = 0;
    let totalTokens = 0;
    let costTotal = 0;
    for (const entry of await this.getEntries()) {
      if (entry.type === "message") messageCount += 1;
      const usage = entry.type === "message"
        ? entry.message.role === "assistant" ? entry.message.usage : undefined
        : entry.type === "compaction" || entry.type === "branch_summary" ? entry.usage : undefined;
      if (!usage) continue;
      cachedTokens += usage.cacheRead;
      uncachedTokens += usage.input + usage.cacheWrite;
      totalTokens += usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
      costTotal += usage.cost.total;
    }
    return { messageCount, cachedTokens, uncachedTokens, totalTokens, costTotal };
  }

  async getPathToRootOrCompaction(leafId: string | null): Promise<SessionTreeEntry[]> {
    try {
      const path = this.store.getPiSessionPath(this.sessionId, leafId) as SessionTreeEntry[];
      let stopAtEntryId: string | null = null;
      const selected: SessionTreeEntry[] = [];
      for (let index = path.length - 1; index >= 0; index -= 1) {
        const entry = path[index]!;
        selected.unshift(entry);
        if (stopAtEntryId !== null && entry.id === stopAtEntryId) break;
        if (entry.type === "compaction") {
          if (entry.retainedTail) break;
          stopAtEntryId = entry.firstKeptEntryId ?? null;
        }
      }
      return selected;
    } catch (error) {
      throw new SessionError("invalid_session", errorMessage(error));
    }
  }

  async getEntries(options?: SessionEntryCursorOptions): Promise<SessionTreeEntry[]> {
    const entries = this.store.getPiSessionEntries(this.sessionId) as SessionTreeEntry[];
    const start = options?.afterEntrySeq ?? 0;
    const end = options?.limit === undefined ? undefined : start + options.limit;
    return entries.slice(start, end);
  }

  private requireSession() {
    const session = this.store.getPiSession(this.sessionId);
    if (!session) throw new SessionError("not_found", `Session not found: ${this.sessionId}`);
    return session;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactSecret(value: string, secret?: string): string {
  return secret ? value.replaceAll(secret, "[redacted]") : value;
}

function redactText(value: string, redactor?: (value: string) => string): string {
  return redactor ? redactor(value) : value;
}

function redactSessionEntry(
  entry: SessionTreeEntry,
  redactor?: (value: string) => string
): SessionTreeEntry {
  if (!redactor) return entry;
  return redactUnknown(entry, redactor) as SessionTreeEntry;
}

function redactUnknown(value: unknown, redactor: (value: string) => string): unknown {
  if (typeof value === "string") return redactor(value);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, redactor));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactUnknown(item, redactor)])
    );
  }
  return value;
}
