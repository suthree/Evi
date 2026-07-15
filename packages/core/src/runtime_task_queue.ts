import { newId, utcNow } from "./ids.js";
import {
  runtimeChannelRouteKey,
  runtimeChannelSourceKey,
  type RuntimeChannelKind,
  type RuntimeChannelSource
} from "./runtime_channel_messages.js";
import { AgentStore } from "./store.js";

export type RuntimeTaskQueueSourceKind = RuntimeChannelKind | "local" | "runtime";
export type RuntimeTaskQueueStatus = "queued" | "running" | "done" | "blocked" | "failed";
export type RuntimeTaskQueueTerminalStatus = Exclude<RuntimeTaskQueueStatus, "queued" | "running">;

export interface RuntimeTaskQueueEntry {
  type: "runtime_task_queue";
  id: string;
  runtime_session_id: string | null;
  source_kind: RuntimeTaskQueueSourceKind;
  source_route_key: string | null;
  source_key: string | null;
  task: string;
  runner_task: string | null;
  status: RuntimeTaskQueueStatus;
  attempt: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  boundary: string;
}

const QUEUE_REF = "runs/task_queue.jsonl";
const QUEUE_BOUNDARY = "local runtime task queue ledger; single-machine JSONL state, not a remote broker";

export async function enqueueRuntimeTask(
  store: AgentStore,
  args: {
    id?: string;
    source?: RuntimeChannelSource | null;
    runtimeSessionId?: string | null;
    sourceKind?: RuntimeTaskQueueSourceKind;
    sourceRouteKey?: string | null;
    sourceKey?: string | null;
    task: string;
    runnerTask?: string | null;
    now?: string;
  }
): Promise<RuntimeTaskQueueEntry> {
  await store.ensureLayout();
  const now = args.now ?? utcNow();
  const source = args.source ?? null;
  const entry: RuntimeTaskQueueEntry = {
    type: "runtime_task_queue",
    id: args.id ?? newId("runtime_task"),
    runtime_session_id: args.runtimeSessionId ?? null,
    source_kind: source?.kind ?? args.sourceKind ?? "local",
    source_route_key: source ? runtimeChannelRouteKey(source) : args.sourceRouteKey ?? null,
    source_key: source ? runtimeChannelSourceKey(source) : args.sourceKey ?? null,
    task: args.task,
    runner_task: args.runnerTask ?? null,
    status: "queued",
    attempt: 0,
    error: null,
    created_at: now,
    updated_at: now,
    boundary: QUEUE_BOUNDARY
  };
  await store.appendJsonl(QUEUE_REF, entry);
  return entry;
}

export async function claimRuntimeTask(
  store: AgentStore,
  args: {
    id: string;
    now?: string;
  }
): Promise<RuntimeTaskQueueEntry | null> {
  const current = await getRuntimeTaskQueueEntry(store, args.id);
  if (!current || current.status !== "queued") return null;
  return appendRuntimeTaskQueueEntry(store, {
    ...current,
    status: "running",
    attempt: current.attempt + 1,
    error: null,
    updated_at: args.now ?? utcNow()
  });
}

export async function claimRecoverableRuntimeTask(
  store: AgentStore,
  args: {
    id: string;
    now?: string;
  }
): Promise<RuntimeTaskQueueEntry | null> {
  const current = await getRuntimeTaskQueueEntry(store, args.id);
  if (!current || (current.status !== "queued" && current.status !== "running")) return null;
  return appendRuntimeTaskQueueEntry(store, {
    ...current,
    status: "running",
    attempt: current.attempt + 1,
    error: null,
    updated_at: args.now ?? utcNow()
  });
}

export async function completeRuntimeTask(
  store: AgentStore,
  args: {
    id: string;
    status?: RuntimeTaskQueueTerminalStatus;
    now?: string;
  }
): Promise<RuntimeTaskQueueEntry | null> {
  const current = await getRuntimeTaskQueueEntry(store, args.id);
  if (!current || isFinalStatus(current.status)) return null;
  return appendRuntimeTaskQueueEntry(store, {
    ...current,
    status: args.status ?? "done",
    error: null,
    updated_at: args.now ?? utcNow()
  });
}

export async function requeueRuntimeTask(
  store: AgentStore,
  args: {
    id: string;
    error: string;
    runnerTask?: string;
    now?: string;
  }
): Promise<RuntimeTaskQueueEntry | null> {
  const current = await getRuntimeTaskQueueEntry(store, args.id);
  if (!current || current.status !== "running") return null;
  return appendRuntimeTaskQueueEntry(store, {
    ...current,
    runner_task: args.runnerTask ?? current.runner_task,
    status: "queued",
    error: args.error,
    updated_at: args.now ?? utcNow()
  });
}

export async function failRuntimeTask(
  store: AgentStore,
  args: {
    id: string;
    error?: string | null;
    now?: string;
  }
): Promise<RuntimeTaskQueueEntry | null> {
  const current = await getRuntimeTaskQueueEntry(store, args.id);
  if (!current || isFinalStatus(current.status)) return null;
  return appendRuntimeTaskQueueEntry(store, {
    ...current,
    status: "failed",
    error: args.error ?? null,
    updated_at: args.now ?? utcNow()
  });
}

export async function listRuntimeTaskQueue(store: AgentStore): Promise<RuntimeTaskQueueEntry[]> {
  const byId = new Map<string, RuntimeTaskQueueEntry>();
  for (const entry of await readRuntimeTaskQueueRows(store)) {
    const existing = byId.get(entry.id);
    if (!existing || existing.updated_at.localeCompare(entry.updated_at) <= 0) byId.set(entry.id, entry);
  }
  return Array.from(byId.values())
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export async function listRecoverableRuntimeTasks(
  store: AgentStore,
  args: {
    now?: string;
    runningStaleMs?: number;
  } = {}
): Promise<RuntimeTaskQueueEntry[]> {
  const nowMs = Date.parse(args.now ?? utcNow());
  const runningStaleMs = args.runningStaleMs ?? 30 * 60 * 1000;
  return (await listRuntimeTaskQueue(store)).filter((entry) => {
    if (entry.status === "queued") return true;
    if (entry.status !== "running") return false;
    const updatedMs = Date.parse(entry.updated_at);
    return Number.isFinite(nowMs) && Number.isFinite(updatedMs) && nowMs - updatedMs >= runningStaleMs;
  });
}

async function getRuntimeTaskQueueEntry(store: AgentStore, id: string): Promise<RuntimeTaskQueueEntry | null> {
  return (await listRuntimeTaskQueue(store)).find((entry) => entry.id === id) ?? null;
}

async function appendRuntimeTaskQueueEntry(store: AgentStore, entry: RuntimeTaskQueueEntry): Promise<RuntimeTaskQueueEntry> {
  await store.ensureLayout();
  await store.appendJsonl(QUEUE_REF, entry);
  return entry;
}

async function readRuntimeTaskQueueRows(store: AgentStore): Promise<RuntimeTaskQueueEntry[]> {
  const text = await store.readStateText(QUEUE_REF);
  if (!text.trim()) return [];
  const entries: RuntimeTaskQueueEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as RuntimeTaskQueueEntry;
      if (value.type === "runtime_task_queue") entries.push(value);
    } catch {
      // Keep the queue read model available even if an append is partially written.
    }
  }
  return entries;
}

function isFinalStatus(status: RuntimeTaskQueueStatus): status is RuntimeTaskQueueTerminalStatus {
  return status === "done" || status === "blocked" || status === "failed";
}
