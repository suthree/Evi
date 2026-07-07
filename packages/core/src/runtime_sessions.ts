import { basename } from "node:path";
import { newId, utcNow } from "./ids.js";
import {
  runtimeChannelRouteKey,
  runtimeChannelSourceFromRouteKey,
  runtimeChannelSourceKey,
  type RuntimeChannelKind,
  type RuntimeChannelSource
} from "./runtime_channel_messages.js";
import type { RunResult } from "./schemas.js";
import { AgentStore } from "./store.js";

export type RuntimeSessionStatus = "pending" | "active" | "archived";
export type RuntimeSessionSourceKind = RuntimeChannelKind | "local" | "runtime";
export type InboxTriggerKind = "inbox_only" | "run_command" | "mention" | "authorized_direct" | "session_command";

export type RuntimeSessionSource = RuntimeChannelSource;
export type FeishuSessionSource = RuntimeChannelSource & { kind: "feishu" };

export interface RuntimeSessionRecord {
  type: "runtime_session";
  id: string;
  title: string;
  profile: string;
  status: RuntimeSessionStatus;
  source_kind: RuntimeSessionSourceKind;
  source_route_key: string | null;
  source_key: string | null;
  created_at: string;
  updated_at: string;
  boundary: string;
}

export interface RuntimeSessionBindingRecord {
  type: "session_binding";
  id: string;
  source_kind: RuntimeChannelKind;
  route_key: string;
  source_key: string;
  runtime_session_id: string;
  profile: string;
  status: "active" | "retired";
  created_by_actor_id: string | null;
  // Legacy Feishu-named alias kept for existing JSONL consumers.
  created_by_open_id: string | null;
  created_at: string;
  updated_at: string;
  boundary: string;
}

export interface RuntimeInboxEntry {
  type: "runtime_inbox";
  id: string;
  runtime_session_id: string;
  source_kind: RuntimeChannelKind;
  route_key: string;
  source_key: string;
  message_id: string;
  chat_type: string;
  conversation_type: string;
  conversation_id: string;
  thread_id: string | null;
  sender_actor_id: string | null;
  // Legacy Feishu-named alias kept for existing JSONL consumers.
  sender_open_id: string | null;
  sender_id: string | null;
  text: string;
  trigger_kind: InboxTriggerKind;
  run_requested: boolean;
  created_at: string;
  boundary: string;
}

export interface RuntimeTaskRunRecord {
  type: "runtime_task_run";
  id: string;
  runtime_session_id: string | null;
  source_kind: RuntimeSessionSourceKind;
  source_key: string | null;
  task: string;
  status: "queued" | "running" | "done" | "blocked" | "failed";
  live_session_id: string | null;
  turn_id: string | null;
  verdict: string | null;
  evidence_refs: string[];
  final_response_ref: string | null;
  completion_report_ref: string | null;
  created_at: string;
  updated_at: string;
  boundary: string;
}

export interface RuntimeSessionResolution {
  ok: boolean;
  reason: "bound" | "created_pending" | "created_local" | "unauthorized_unknown_source";
  session: RuntimeSessionRecord | null;
  binding: RuntimeSessionBindingRecord | null;
}

const SESSION_INDEX_REF = "sessions/index.jsonl";
const SESSION_BINDINGS_REF = "sessions/bindings.jsonl";
const RUN_INDEX_REF = "runs/index.jsonl";
const DEFAULT_PROFILE = "unassigned";
const STATE_BOUNDARY = "local runtime session control state; ignored by git, not a hosted or multi-user session database";

export function feishuRouteKey(source: FeishuSessionSource): string {
  return runtimeChannelRouteKey(source);
}

export function feishuSourceKey(source: FeishuSessionSource, profile = source.profile || DEFAULT_PROFILE): string {
  return runtimeChannelSourceKey(source, profile);
}

export function feishuSourceFromRouteKey(routeKey: string, profile?: string | null): FeishuSessionSource | null {
  const source = runtimeChannelSourceFromRouteKey(routeKey, profile);
  return source?.kind === "feishu" ? { ...source, kind: "feishu" } : null;
}

export async function resolveRuntimeSession(
  store: AgentStore,
  args: {
    source: RuntimeSessionSource;
    actorAuthorized: boolean;
    defaultProfile?: string;
    allowCreatePending?: boolean;
    title?: string;
    now?: string;
  }
): Promise<RuntimeSessionResolution> {
  await store.ensureLayout();
  const profile = normalizeProfile(args.source.profile || args.defaultProfile || DEFAULT_PROFILE);
  const routeKey = runtimeChannelRouteKey(args.source);
  const sourceKey = runtimeChannelSourceKey({ ...args.source, profile }, profile);
  const bindings = await listRuntimeSessionBindings(store);
  const binding = bindings.find((item) => item.route_key === routeKey && item.status === "active")
    ?? bindings.find((item) => item.source_key === sourceKey && item.status === "active")
    ?? null;
  const sessions = await listRuntimeSessions(store);
  if (binding) {
    const session = sessions.find((item) => item.id === binding.runtime_session_id) ?? null;
    if (session) return { ok: true, reason: "bound", session, binding };
  }
  if (!args.actorAuthorized || args.allowCreatePending === false) {
    return { ok: false, reason: "unauthorized_unknown_source", session: null, binding: null };
  }
  const now = args.now ?? utcNow();
  const session = await upsertRuntimeSession(store, {
    id: newId("runtime_session"),
    title: args.title?.trim() || defaultRuntimeSessionTitle(args.source),
    profile,
    status: profile === DEFAULT_PROFILE ? "pending" : "active",
    source_kind: args.source.kind,
    source_route_key: routeKey,
    source_key: sourceKey,
    created_at: now,
    updated_at: now
  });
  const createdBinding = await bindRuntimeSessionSource(store, {
    source: { ...args.source, profile },
    runtimeSessionId: session.id,
    profile,
    createdByActorId: args.source.actorId ?? null,
    now
  });
  return { ok: true, reason: "created_pending", session, binding: createdBinding };
}

export async function bindRuntimeSessionSource(
  store: AgentStore,
  args: {
    source: RuntimeSessionSource;
    runtimeSessionId: string;
    profile?: string;
    createdByActorId?: string | null;
    /** @deprecated Use createdByActorId for provider-neutral channel sources. */
    createdByOpenId?: string | null;
    now?: string;
  }
): Promise<RuntimeSessionBindingRecord> {
  await store.ensureLayout();
  const profile = normalizeProfile(args.profile || args.source.profile || DEFAULT_PROFILE);
  const routeKey = runtimeChannelRouteKey(args.source);
  const sourceKey = runtimeChannelSourceKey({ ...args.source, profile }, profile);
  const now = args.now ?? utcNow();
  const createdByActorId = args.createdByActorId ?? args.createdByOpenId ?? null;
  const binding: RuntimeSessionBindingRecord = {
    type: "session_binding",
    id: newId("session_binding"),
    source_kind: args.source.kind,
    route_key: routeKey,
    source_key: sourceKey,
    runtime_session_id: args.runtimeSessionId,
    profile,
    status: "active",
    created_by_actor_id: createdByActorId,
    created_by_open_id: createdByActorId,
    created_at: now,
    updated_at: now,
    boundary: STATE_BOUNDARY
  };
  await store.appendJsonl(SESSION_BINDINGS_REF, binding);
  const session = (await listRuntimeSessions(store)).find((item) => item.id === args.runtimeSessionId);
  if (session) {
    await upsertRuntimeSession(store, {
      ...session,
      profile,
      status: profile === DEFAULT_PROFILE ? "pending" : "active",
      source_route_key: routeKey,
      source_key: sourceKey,
      updated_at: now
    });
  }
  return binding;
}

export async function upsertRuntimeSession(
  store: AgentStore,
  input: Omit<RuntimeSessionRecord, "type" | "boundary">
): Promise<RuntimeSessionRecord> {
  await store.ensureLayout();
  const record: RuntimeSessionRecord = {
    ...input,
    type: "runtime_session",
    profile: normalizeProfile(input.profile),
    boundary: STATE_BOUNDARY
  };
  await store.appendJsonl(SESSION_INDEX_REF, record);
  return record;
}

export async function appendRuntimeInboxEntry(
  store: AgentStore,
  args: {
    sessionId: string;
    source: RuntimeSessionSource;
    messageId: string;
    text: string;
    triggerKind: InboxTriggerKind;
    runRequested?: boolean;
    now?: string;
  }
): Promise<RuntimeInboxEntry> {
  await store.ensureLayout();
  const profile = normalizeProfile(args.source.profile || DEFAULT_PROFILE);
  const entry: RuntimeInboxEntry = {
    type: "runtime_inbox",
    id: newId("runtime_inbox"),
    runtime_session_id: args.sessionId,
    source_kind: args.source.kind,
    route_key: runtimeChannelRouteKey(args.source),
    source_key: runtimeChannelSourceKey({ ...args.source, profile }, profile),
    message_id: args.messageId,
    chat_type: args.source.conversationType,
    conversation_type: args.source.conversationType,
    conversation_id: args.source.conversationId,
    thread_id: args.source.threadId ?? null,
    sender_actor_id: args.source.actorId ?? null,
    sender_open_id: args.source.actorId ?? null,
    sender_id: args.source.actorId ?? null,
    text: args.text,
    trigger_kind: args.triggerKind,
    run_requested: Boolean(args.runRequested),
    created_at: args.now ?? utcNow(),
    boundary: "runtime session inbox entry; local state only, not durable provider replay authority"
  };
  await store.appendJsonl(`sessions/inbox/${safeFilePart(args.sessionId)}.jsonl`, entry);
  return entry;
}

export async function recordRuntimeTaskRun(
  store: AgentStore,
  args: {
    runtimeSessionId?: string | null;
    sourceKind?: RuntimeTaskRunRecord["source_kind"];
    sourceKey?: string | null;
    task: string;
    status?: RuntimeTaskRunRecord["status"];
    runResult?: RunResult | null;
    id?: string;
    createdAt?: string;
    now?: string;
  }
): Promise<RuntimeTaskRunRecord> {
  await store.ensureLayout();
  const now = args.now ?? utcNow();
  const result = args.runResult ?? null;
  const record: RuntimeTaskRunRecord = {
    type: "runtime_task_run",
    id: args.id ?? newId("runtime_run"),
    runtime_session_id: args.runtimeSessionId ?? null,
    source_kind: args.sourceKind ?? "local",
    source_key: args.sourceKey ?? null,
    task: args.task,
    status: args.status ?? runtimeTaskRunStatusFromResult(result),
    live_session_id: result?.session_id ?? null,
    turn_id: result?.turn_id ?? null,
    verdict: result?.verdict ?? null,
    evidence_refs: result?.evidence_refs ?? [],
    final_response_ref: result?.final_response_ref ?? null,
    completion_report_ref: result?.completion_report_ref ?? null,
    created_at: args.createdAt ?? now,
    updated_at: now,
    boundary: "runtime task run index; points to existing run evidence and does not duplicate raw artifacts"
  };
  await store.appendJsonl(RUN_INDEX_REF, record);
  return record;
}

export async function listRuntimeSessions(store: AgentStore): Promise<RuntimeSessionRecord[]> {
  const records = await readJsonlRecords<RuntimeSessionRecord>(store, SESSION_INDEX_REF, "runtime_session");
  const byId = new Map<string, RuntimeSessionRecord>();
  for (const record of records) byId.set(record.id, record);
  return Array.from(byId.values())
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id));
}

export async function listRuntimeSessionBindings(store: AgentStore): Promise<RuntimeSessionBindingRecord[]> {
  const records = await readJsonlRecords<RuntimeSessionBindingRecord>(store, SESSION_BINDINGS_REF, "session_binding");
  const byRoute = new Map<string, RuntimeSessionBindingRecord>();
  for (const record of records) byRoute.set(record.route_key, record);
  return Array.from(byRoute.values())
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id));
}

export async function listRuntimeInbox(store: AgentStore, sessionId: string): Promise<RuntimeInboxEntry[]> {
  return readJsonlRecords<RuntimeInboxEntry>(store, `sessions/inbox/${safeFilePart(sessionId)}.jsonl`, "runtime_inbox");
}

export async function listRuntimeTaskRuns(store: AgentStore): Promise<RuntimeTaskRunRecord[]> {
  const byId = new Map<string, RuntimeTaskRunRecord>();
  for (const record of await readJsonlRecords<RuntimeTaskRunRecord>(store, RUN_INDEX_REF, "runtime_task_run")) {
    const existing = byId.get(record.id);
    if (!existing || existing.updated_at.localeCompare(record.updated_at) <= 0) byId.set(record.id, record);
  }
  return Array.from(byId.values())
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id));
}

async function readJsonlRecords<T extends { type?: string }>(store: AgentStore, ref: string, type: string): Promise<T[]> {
  const text = await store.readStateText(ref);
  if (!text.trim()) return [];
  const records: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as T;
      if (value.type === type) records.push(value);
    } catch {
      // Ignore malformed append-only rows; read models stay available.
    }
  }
  return records;
}

export function runtimeTaskRunStatusFromResult(result: RunResult | null): RuntimeTaskRunRecord["status"] {
  if (!result) return "done";
  if (result.verdict.includes("blocked")) return "blocked";
  if (result.verdict.includes("failed") || result.verdict.includes("unverified")) return "failed";
  return "done";
}

function defaultRuntimeSessionTitle(source: RuntimeSessionSource): string {
  const scope = source.conversationType === "p2p"
    ? `${source.kind} private chat`
    : `${source.kind} ${source.conversationType}`;
  return `${scope} ${basename(source.conversationId)}`;
}

function normalizeProfile(profile: string): string {
  return cleanPart(profile || DEFAULT_PROFILE);
}

function cleanPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.@-]+/g, "_") || "unknown";
}

function safeFilePart(value: string): string {
  return cleanPart(value).slice(0, 120);
}
