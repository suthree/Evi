import type { Model, Models } from "@earendil-works/pi-ai";
import {
  AgentHarness,
  Session,
  SessionError,
  uuidv7,
  type AgentMessage,
  type AgentTool,
  type SessionEntryCursorOptions,
  type SessionMetadata,
  type SessionStats,
  type SessionStorage,
  type SessionTreeEntry
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import type { ActionGatewayResult, JsonObject } from "./action_types.js";
import { ActionGateway } from "./action_gateway.js";
import type { AgentLoop, AgentLoopFactory } from "./contracts.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

export interface PiAgentHarnessAdapterOptions {
  store: SqliteRuntimeStore;
  models: Models;
  model: Model<any>;
  cwd: string;
  system_prompt?: string;
}

export class PiAgentHarnessLoopFactory implements AgentLoopFactory {
  constructor(private readonly options: PiAgentHarnessAdapterOptions) {}

  create(input: {
    run_id: string;
    turn_id: string;
    session_id: string;
    action_gateway: ActionGateway;
  }): AgentLoop {
    const storage = new SqlitePiSessionStorage(this.options.store, input.session_id);
    const tools = createPiActionTools(input.action_gateway, input);
    const harness = new AgentHarness({
      env: new NodeExecutionEnv({ cwd: this.options.cwd }),
      session: new Session(storage),
      models: this.options.models,
      model: this.options.model,
      systemPrompt: this.options.system_prompt ?? "You are a concise and reliable local-first agent.",
      tools
    });
    return {
      execute: async (request) => {
        const response = await harness.prompt(request);
        if (response.stopReason === "error" || response.stopReason === "aborted") {
          throw new Error(response.errorMessage || `Pi AgentHarness stopped: ${response.stopReason}`);
        }
        const answer = assistantText(response);
        if (!answer.trim()) throw new Error("Pi AgentHarness returned no text response.");
        return { answer };
      }
    };
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

function toPiToolResult(result: ActionGatewayResult): { content: Array<{ type: "text"; text: string }>; details: JsonObject } {
  if (result.status === "denied") {
    throw new Error(`Action denied by Action Gateway: ${result.reason}`);
  }
  if (result.status === "outcome_unknown") {
    throw new Error(
      `Action outcome unknown for reservation ${result.reservation.id}; reconcile it without replay.`
    );
  }
  if (result.receipt.outcome === "failed") {
    throw new Error(`Action failed with receipt ${result.receipt.id}: ${result.receipt.summary}`);
  }
  return {
    content: [{
      type: "text",
      text: `${result.receipt.summary}\n${JSON.stringify(result.receipt.output)}`
    }],
    details: {
      reservation_id: result.reservation.id,
      receipt_id: result.receipt.id,
      outcome: result.receipt.outcome,
      reconciled: result.receipt.reconciled,
      output: result.receipt.output
    }
  };
}

class SqlitePiSessionStorage implements SessionStorage<SessionMetadata> {
  constructor(
    private readonly store: SqliteRuntimeStore,
    private readonly sessionId: string
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
    this.store.appendPiSessionEntry(this.sessionId, entry);
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

function assistantText(message: AgentMessage): string {
  if (message.role !== "assistant") return "";
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
