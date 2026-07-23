import { createHash } from "node:crypto";
import { newId, utcNow } from "./ids.js";
import {
  runtimeChannelRouteKey,
  runtimeChannelSourceKey,
  type RuntimeChannelKind,
  type RuntimeChannelSource
} from "./runtime_channel_messages.js";
import type { RunResult } from "./schemas.js";
import { AgentStore } from "./store.js";

export type RuntimeTaskQueueSourceKind = RuntimeChannelKind | "local" | "runtime";
export type RuntimeTaskQueueStatus = "queued" | "running" | "done" | "blocked" | "failed";
export type RuntimeTaskQueueTerminalStatus = Exclude<RuntimeTaskQueueStatus, "queued" | "running">;
export type RuntimeTaskSideEffectLevel = "none" | "local_reversible" | "local_write" | "external_write";

export interface RuntimeTaskExecutionContract {
  readonly schema_version: 1;
  readonly authority_digest: string;
  readonly decision_owner: "operator";
  readonly authority_basis: string;
  readonly allowed_effects: readonly string[];
  readonly forbidden_effects: readonly string[];
  readonly external_command_allowlist: readonly string[];
  readonly forbidden_command_arguments: readonly string[];
  readonly budget: {
    readonly max_model_rounds: number;
    readonly max_tool_calls: number;
  };
  readonly side_effect_ceiling: RuntimeTaskSideEffectLevel;
  readonly operator_confirmed: true;
  readonly expires_with_task: true;
}

export interface RuntimeTaskQueueEntry {
  type: "runtime_task_queue";
  id: string;
  runtime_session_id: string | null;
  source_kind: RuntimeTaskQueueSourceKind;
  source_route_key: string | null;
  source_key: string | null;
  task: string;
  runner_task: string | null;
  worktree: string;
  live_session_id: string | null;
  working_checkpoint_ref: string | null;
  next_action: string | null;
  execution_contract: RuntimeTaskExecutionContract | null;
  status: RuntimeTaskQueueStatus;
  attempt: number;
  max_attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  boundary: string;
}

export interface RuntimeTaskQueueSettlement {
  action: "requeued" | "completed";
  entry: RuntimeTaskQueueEntry;
  run_status: RuntimeTaskQueueTerminalStatus;
}

const QUEUE_REF = "runs/task_queue.jsonl";
const QUEUE_BOUNDARY = "local runtime task queue ledger; single-machine JSONL state, not a remote broker";
export const DEFAULT_RUNTIME_TASK_MAX_ATTEMPTS = 3;

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
    worktree?: string;
    maxAttempts?: number;
    executionContract?: RuntimeTaskExecutionContract | null;
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
    worktree: nonEmptyWorktree(args.worktree) ?? store.repoRoot,
    live_session_id: null,
    working_checkpoint_ref: null,
    next_action: null,
    execution_contract: args.executionContract
      ? parseRuntimeTaskExecutionContract(args.executionContract)
      : null,
    status: "queued",
    attempt: 0,
    max_attempts: normalizeMaxAttempts(args.maxAttempts),
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
  if (!current || current.status !== "queued" || current.attempt >= current.max_attempts) return null;
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
  if (
    !current
    || (current.status !== "queued" && current.status !== "running")
    || current.attempt >= current.max_attempts
  ) return null;
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
    liveSessionId?: string | null;
    workingCheckpointRef?: string | null;
    nextAction?: string | null;
    now?: string;
  }
): Promise<RuntimeTaskQueueEntry | null> {
  const current = await getRuntimeTaskQueueEntry(store, args.id);
  if (!current || current.status !== "running" || current.attempt >= current.max_attempts) return null;
  return appendRuntimeTaskQueueEntry(store, {
    ...current,
    runner_task: args.runnerTask ?? current.runner_task,
    live_session_id: current.live_session_id ?? args.liveSessionId ?? null,
    working_checkpoint_ref: args.workingCheckpointRef ?? current.working_checkpoint_ref,
    next_action: args.nextAction ?? current.next_action,
    status: "queued",
    error: args.error,
    updated_at: args.now ?? utcNow()
  });
}

export async function settleRuntimeTaskFromResult(
  store: AgentStore,
  args: {
    id: string;
    result: RunResult;
    now?: string;
  }
): Promise<RuntimeTaskQueueSettlement | null> {
  const current = await getRuntimeTaskQueueEntry(store, args.id);
  if (!current || current.status !== "running") return null;
  const runStatus = runtimeTaskTerminalStatusFromResult(args.result);
  const continuity = {
    worktree: nonEmptyWorktree(args.result.worktree) ?? current.worktree,
    live_session_id: current.live_session_id ?? args.result.session_id,
    working_checkpoint_ref: args.result.working_checkpoint_ref ?? current.working_checkpoint_ref,
    next_action: args.result.next_action ?? current.next_action
  };
  const now = args.now ?? utcNow();
  if (runStatus === "blocked" && current.attempt < current.max_attempts) {
    const entry = await appendRuntimeTaskQueueEntry(store, {
      ...current,
      ...continuity,
      status: "queued",
      error: `unfinished completion_status=${args.result.completion_status}`,
      updated_at: now
    });
    return { action: "requeued", entry, run_status: runStatus };
  }
  const entry = await appendRuntimeTaskQueueEntry(store, {
    ...current,
    ...continuity,
    status: runStatus,
    error: runStatus === "failed"
      ? `structured completion failed: completion_status=${args.result.completion_status}; verification_status=${args.result.verification_status}`
      : null,
    updated_at: now
  });
  return { action: "completed", entry, run_status: runStatus };
}

export function runtimeTaskTerminalStatusFromResult(
  result: RunResult | null
): RuntimeTaskQueueTerminalStatus {
  if (!result) return "failed";
  if (result.completion_status === "not_done" || result.completion_status === "blocked") return "blocked";
  return result.completion_status === "done" && result.verification_status === "passed"
    ? "done"
    : "failed";
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
      if (value.type === "runtime_task_queue") entries.push(normalizeRuntimeTaskQueueEntry(value, store.repoRoot));
    } catch {
      // Keep the queue read model available even if an append is partially written.
    }
  }
  return entries;
}

function normalizeRuntimeTaskQueueEntry(
  entry: RuntimeTaskQueueEntry,
  repoRoot: string
): RuntimeTaskQueueEntry {
  return {
    ...entry,
    worktree: nonEmptyWorktree(entry.worktree) ?? repoRoot,
    live_session_id: typeof entry.live_session_id === "string" ? entry.live_session_id : null,
    working_checkpoint_ref: typeof entry.working_checkpoint_ref === "string" ? entry.working_checkpoint_ref : null,
    next_action: typeof entry.next_action === "string" ? entry.next_action : null,
    execution_contract: normalizeStoredExecutionContract(entry.execution_contract),
    max_attempts: normalizeMaxAttempts(entry.max_attempts)
  };
}

export function parseRuntimeTaskExecutionContract(value: unknown): RuntimeTaskExecutionContract {
  if (!isRecord(value)) throw new Error("execution_contract must be an object");
  const allowedKeys = new Set([
    "schema_version",
    "authority_digest",
    "decision_owner",
    "authority_basis",
    "allowed_effects",
    "forbidden_effects",
    "external_command_allowlist",
    "forbidden_command_arguments",
    "budget",
    "side_effect_ceiling",
    "operator_confirmed",
    "expires_with_task"
  ]);
  const extra = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (extra.length > 0) throw new Error(`execution_contract contains unsupported fields: ${extra.join(", ")}`);
  if (value.schema_version !== 1) throw new Error("execution_contract schema_version must be 1");
  if (value.decision_owner !== "operator") throw new Error("execution_contract decision_owner must be operator");
  if (value.operator_confirmed !== true) throw new Error("execution_contract operator_confirmed must be true");
  if (value.expires_with_task !== true) throw new Error("execution_contract expires_with_task must be true");
  const authorityBasis = boundedString(value.authority_basis, "authority_basis", 20, 2_000);
  const allowedEffects = boundedStringList(value.allowed_effects, "allowed_effects", 1, 32, 120);
  const forbiddenEffects = boundedStringList(value.forbidden_effects, "forbidden_effects", 1, 32, 120);
  const externalCommands = boundedStringList(
    value.external_command_allowlist,
    "external_command_allowlist",
    0,
    16,
    80
  );
  for (const command of externalCommands) {
    if (!/^[A-Za-z0-9._+-]+$/.test(command)) {
      throw new Error("execution_contract external_command_allowlist entries must be binary names");
    }
  }
  const forbiddenArguments = boundedStringList(
    value.forbidden_command_arguments,
    "forbidden_command_arguments",
    0,
    32,
    120
  );
  if (!isRecord(value.budget)) throw new Error("execution_contract budget must be an object");
  const budgetExtra = Object.keys(value.budget).filter((key) => key !== "max_model_rounds" && key !== "max_tool_calls");
  if (budgetExtra.length > 0) throw new Error(`execution_contract budget contains unsupported fields: ${budgetExtra.join(", ")}`);
  const maxModelRounds = boundedInteger(value.budget.max_model_rounds, "max_model_rounds", 1, 8);
  const maxToolCalls = boundedInteger(value.budget.max_tool_calls, "max_tool_calls", 0, 32);
  const sideEffectCeiling = parseSideEffectLevel(value.side_effect_ceiling);
  if (!sideEffectCeiling) throw new Error("execution_contract side_effect_ceiling is invalid");
  if (sideEffectCeiling === "external_write" && externalCommands.length === 0) {
    throw new Error("execution_contract external_write requires external_command_allowlist");
  }
  const normalized = {
    schema_version: 1,
    decision_owner: "operator",
    authority_basis: authorityBasis,
    allowed_effects: Object.freeze([...allowedEffects]),
    forbidden_effects: Object.freeze([...forbiddenEffects]),
    external_command_allowlist: Object.freeze([...externalCommands]),
    forbidden_command_arguments: Object.freeze([...forbiddenArguments]),
    budget: Object.freeze({
      max_model_rounds: maxModelRounds,
      max_tool_calls: maxToolCalls
    }),
    side_effect_ceiling: sideEffectCeiling,
    operator_confirmed: true,
    expires_with_task: true
  } as const;
  const authorityDigest = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  if (value.authority_digest !== undefined && value.authority_digest !== authorityDigest) {
    throw new Error("execution_contract authority_digest does not match the normalized snapshot");
  }
  return Object.freeze({
    ...normalized,
    authority_digest: authorityDigest
  });
}

function normalizeStoredExecutionContract(value: unknown): RuntimeTaskExecutionContract | null {
  if (value === null || value === undefined) return null;
  try {
    return parseRuntimeTaskExecutionContract(value);
  } catch {
    // Keep legacy/corrupt queue rows inspectable without granting authority.
    return null;
  }
}

function parseSideEffectLevel(value: unknown): RuntimeTaskSideEffectLevel | null {
  return value === "none" || value === "local_reversible" || value === "local_write" || value === "external_write"
    ? value
    : null;
}

function boundedString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw new Error(`execution_contract ${field} must be ${min}-${max} chars`);
  }
  return value.trim();
}

function boundedStringList(
  value: unknown,
  field: string,
  minItems: number,
  maxItems: number,
  maxChars: number
): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new Error(`execution_contract ${field} must contain ${minItems}-${maxItems} entries`);
  }
  return [...new Set(value.map((item) => boundedString(item, field, 1, maxChars)))];
}

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`execution_contract ${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyWorktree(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeMaxAttempts(value: number | undefined): number {
  return Number.isInteger(value) && Number(value) > 0
    ? Math.min(Number(value), DEFAULT_RUNTIME_TASK_MAX_ATTEMPTS)
    : DEFAULT_RUNTIME_TASK_MAX_ATTEMPTS;
}

function isFinalStatus(status: RuntimeTaskQueueStatus): status is RuntimeTaskQueueTerminalStatus {
  return status === "done" || status === "blocked" || status === "failed";
}
