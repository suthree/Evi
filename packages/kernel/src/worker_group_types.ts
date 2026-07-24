import { createHash } from "node:crypto";
import { stableJson } from "./canonical_json.js";
import { validateRuntimeTimeoutDuration } from "./runtime_limits.js";

const WORKER_GROUP_SCHEMA_VERSION = 1;
const WORKER_GROUP_ALLOCATION_SCHEMA_VERSION = 1;
export const MAX_WORKERS_PER_GROUP = 4;
export const MAX_PARALLEL_WORKERS = 2;

export type WorkerKind = "discussion" | "execution" | "review";

export interface WorkerGroupBudget {
  max_output_tokens: number;
  max_duration_ms: number;
}

export interface WorkerGroupRequest {
  group_key: string;
  task_key: string;
  expected_worker_count: number;
  max_parallel: number;
  deadline_at: string;
  budget: WorkerGroupBudget;
}

export interface WorkerGroupEnvelope {
  schema_version: typeof WORKER_GROUP_SCHEMA_VERSION;
  id: string;
  parent_run_id: string;
  parent_turn_id: string;
  group_key: string;
  expected_worker_count: number;
  max_parallel: number;
  deadline_at: string;
  budget: WorkerGroupBudget;
  digest: string;
}

export interface WorkerGroupAllocation {
  schema_version: typeof WORKER_GROUP_ALLOCATION_SCHEMA_VERSION;
  group_id: string;
  group_digest: string;
  worker_id: string;
  worker_kind: WorkerKind;
  task_key: string;
  deadline_at: string;
  budget: {
    max_output_tokens: number;
    timeout_ms: number;
  };
  digest: string;
}

export interface PreparedWorkerGroup {
  request: WorkerGroupRequest;
  group: WorkerGroupEnvelope;
  allocation: WorkerGroupAllocation;
}

export interface WorkerGroupInspection {
  group: WorkerGroupEnvelope;
  worker_count: number;
  queued_count: number;
  running_count: number;
  terminal_count: number;
  reserved_budget: {
    max_output_tokens: number;
    timeout_ms: number;
  };
  available_budget: {
    max_output_tokens: number;
    duration_ms: number;
  };
  task: WorkerGroupAllocation | null;
}

export function normalizeWorkerGroupRequest(input: unknown): WorkerGroupRequest {
  const value = record(input, "Worker Group request");
  exactKeys(value, [
    "group_key",
    "task_key",
    "expected_worker_count",
    "max_parallel",
    "deadline_at",
    "budget"
  ], "Worker Group request");
  const expectedWorkerCount = boundedInteger(
    value.expected_worker_count,
    "Worker Group expected worker count",
    1,
    MAX_WORKERS_PER_GROUP
  );
  const maxParallel = boundedInteger(
    value.max_parallel,
    "Worker Group parallel claim limit",
    1,
    MAX_PARALLEL_WORKERS
  );
  if (maxParallel > expectedWorkerCount) {
    throw new Error("Worker Group parallel claim limit exceeds its expected worker count.");
  }
  const budget = record(value.budget, "Worker Group budget");
  exactKeys(budget, ["max_output_tokens", "max_duration_ms"], "Worker Group budget");
  const maxDurationMs = positiveInteger(budget.max_duration_ms, "Worker Group duration budget");
  validateRuntimeTimeoutDuration(maxDurationMs, "Worker Group");
  return {
    group_key: text(value.group_key, "Worker Group key"),
    task_key: text(value.task_key, "Worker Group task key"),
    expected_worker_count: expectedWorkerCount,
    max_parallel: maxParallel,
    deadline_at: timestamp(value.deadline_at, "Worker Group deadline"),
    budget: {
      max_output_tokens: positiveInteger(
        budget.max_output_tokens,
        "Worker Group output-token budget"
      ),
      max_duration_ms: maxDurationMs
    }
  };
}

export function singletonWorkerGroupRequest(input: {
  parent_run_id: string;
  invocation_id: string;
  worker_kind: WorkerKind;
  deadline_at: string;
  budget: { max_output_tokens: number; timeout_ms: number };
}): WorkerGroupRequest {
  const suffix = sha256(
    `${input.parent_run_id}\u0000${input.invocation_id}\u0000${input.worker_kind}`
  ).slice(0, 24);
  return normalizeWorkerGroupRequest({
    group_key: `singleton-${input.worker_kind}-${suffix}`,
    task_key: "only",
    expected_worker_count: 1,
    max_parallel: 1,
    deadline_at: input.deadline_at,
    budget: {
      max_output_tokens: input.budget.max_output_tokens,
      max_duration_ms: input.budget.timeout_ms
    }
  });
}

export function materializeWorkerGroupEnvelope(input: WorkerGroupRequest & {
  parent_run_id: string;
  parent_turn_id: string;
}): WorkerGroupEnvelope {
  const request = normalizeWorkerGroupRequest({
    group_key: input.group_key,
    task_key: input.task_key,
    expected_worker_count: input.expected_worker_count,
    max_parallel: input.max_parallel,
    deadline_at: input.deadline_at,
    budget: input.budget
  });
  const body: Omit<WorkerGroupEnvelope, "digest"> = {
    schema_version: WORKER_GROUP_SCHEMA_VERSION,
    id: workerGroupId(input.parent_run_id, input.parent_turn_id, request.group_key),
    parent_run_id: identifier(input.parent_run_id, "Worker Group parent Run id"),
    parent_turn_id: identifier(input.parent_turn_id, "Worker Group parent Turn id"),
    group_key: request.group_key,
    expected_worker_count: request.expected_worker_count,
    max_parallel: request.max_parallel,
    deadline_at: request.deadline_at,
    budget: request.budget
  };
  return { ...body, digest: sha256(stableJson(body)) };
}

export function parseWorkerGroupEnvelope(input: unknown): WorkerGroupEnvelope {
  const value = record(input, "Worker Group envelope");
  exactKeys(value, [
    "schema_version",
    "id",
    "parent_run_id",
    "parent_turn_id",
    "group_key",
    "expected_worker_count",
    "max_parallel",
    "deadline_at",
    "budget",
    "digest"
  ], "Worker Group envelope");
  if (value.schema_version !== WORKER_GROUP_SCHEMA_VERSION) {
    throw new Error("Worker Group envelope schema is invalid.");
  }
  const canonical = materializeWorkerGroupEnvelope({
    parent_run_id: value.parent_run_id as string,
    parent_turn_id: value.parent_turn_id as string,
    group_key: value.group_key as string,
    task_key: "parse-only",
    expected_worker_count: value.expected_worker_count as number,
    max_parallel: value.max_parallel as number,
    deadline_at: value.deadline_at as string,
    budget: value.budget as WorkerGroupBudget
  });
  if (value.id !== canonical.id || value.digest !== canonical.digest) {
    throw new Error("Worker Group envelope identity is invalid.");
  }
  return canonical;
}

export function materializeWorkerGroupAllocation(input: {
  group: WorkerGroupEnvelope;
  worker_id: string;
  worker_kind: WorkerKind;
  task_key: string;
  deadline_at: string;
  budget: { max_output_tokens: number; timeout_ms: number };
}): WorkerGroupAllocation {
  const group = parseWorkerGroupEnvelope(input.group);
  const deadlineAt = timestamp(input.deadline_at, "Worker Group task deadline");
  const timeoutMs = positiveInteger(input.budget.timeout_ms, "Worker Group task timeout budget");
  validateRuntimeTimeoutDuration(timeoutMs, "Worker Group task");
  if (Date.parse(deadlineAt) > Date.parse(group.deadline_at)) {
    throw new Error("Worker Group task deadline exceeds the group deadline.");
  }
  const body: Omit<WorkerGroupAllocation, "digest"> = {
    schema_version: WORKER_GROUP_ALLOCATION_SCHEMA_VERSION,
    group_id: group.id,
    group_digest: group.digest,
    worker_id: identifier(input.worker_id, "Worker Group Worker id"),
    worker_kind: workerKind(input.worker_kind),
    task_key: text(input.task_key, "Worker Group task key"),
    deadline_at: deadlineAt,
    budget: {
      max_output_tokens: positiveInteger(
        input.budget.max_output_tokens,
        "Worker Group task output-token budget"
      ),
      timeout_ms: timeoutMs
    }
  };
  return { ...body, digest: sha256(stableJson(body)) };
}

export function parseWorkerGroupAllocation(input: unknown): WorkerGroupAllocation {
  const value = record(input, "Worker Group allocation");
  exactKeys(value, [
    "schema_version",
    "group_id",
    "group_digest",
    "worker_id",
    "worker_kind",
    "task_key",
    "deadline_at",
    "budget",
    "digest"
  ], "Worker Group allocation");
  if (value.schema_version !== WORKER_GROUP_ALLOCATION_SCHEMA_VERSION) {
    throw new Error("Worker Group allocation schema is invalid.");
  }
  const budget = record(value.budget, "Worker Group allocation budget");
  exactKeys(budget, ["max_output_tokens", "timeout_ms"], "Worker Group allocation budget");
  const body: Omit<WorkerGroupAllocation, "digest"> = {
    schema_version: WORKER_GROUP_ALLOCATION_SCHEMA_VERSION,
    group_id: identifier(value.group_id, "Worker Group allocation group id"),
    group_digest: digest(value.group_digest, "Worker Group allocation group digest"),
    worker_id: identifier(value.worker_id, "Worker Group allocation Worker id"),
    worker_kind: workerKind(value.worker_kind),
    task_key: text(value.task_key, "Worker Group allocation task key"),
    deadline_at: timestamp(value.deadline_at, "Worker Group allocation deadline"),
    budget: {
      max_output_tokens: positiveInteger(
        budget.max_output_tokens,
        "Worker Group allocation output-token budget"
      ),
      timeout_ms: positiveInteger(budget.timeout_ms, "Worker Group allocation timeout budget")
    }
  };
  const canonical = { ...body, digest: sha256(stableJson(body)) };
  if (value.digest !== canonical.digest) {
    throw new Error("Worker Group allocation digest is invalid.");
  }
  return canonical;
}

export function materializePreparedWorkerGroup(input: {
  request: WorkerGroupRequest;
  parent_run_id: string;
  parent_turn_id: string;
  worker_id: string;
  worker_kind: WorkerKind;
  task_deadline_at: string;
  task_budget: { max_output_tokens: number; timeout_ms: number };
}): PreparedWorkerGroup {
  const request = normalizeWorkerGroupRequest(input.request);
  const group = materializeWorkerGroupEnvelope({
    ...request,
    parent_run_id: input.parent_run_id,
    parent_turn_id: input.parent_turn_id
  });
  const allocation = materializeWorkerGroupAllocation({
    group,
    worker_id: input.worker_id,
    worker_kind: input.worker_kind,
    task_key: request.task_key,
    deadline_at: input.task_deadline_at,
    budget: input.task_budget
  });
  if (allocation.budget.max_output_tokens > group.budget.max_output_tokens
    || allocation.budget.timeout_ms > group.budget.max_duration_ms) {
    throw new Error("Worker Group task allocation exceeds the group budget.");
  }
  return { request, group, allocation };
}

export function parsePreparedWorkerGroup(input: unknown): PreparedWorkerGroup {
  const value = record(input, "Prepared Worker Group");
  exactKeys(value, ["request", "group", "allocation"], "Prepared Worker Group");
  const request = normalizeWorkerGroupRequest(value.request);
  const group = parseWorkerGroupEnvelope(value.group);
  const allocation = parseWorkerGroupAllocation(value.allocation);
  if (request.group_key !== group.group_key
    || request.expected_worker_count !== group.expected_worker_count
    || request.max_parallel !== group.max_parallel
    || request.deadline_at !== group.deadline_at
    || stableJson(request.budget) !== stableJson(group.budget)
    || request.task_key !== allocation.task_key
    || allocation.group_id !== group.id
    || allocation.group_digest !== group.digest) {
    throw new Error("Prepared Worker Group identity is invalid.");
  }
  return { request, group, allocation };
}

export function workerGroupId(parentRunId: string, parentTurnId: string, groupKey: string): string {
  return `worker_group_${sha256(
    `worker-group-v1\u0000${identifier(parentRunId, "Worker Group parent Run id")}\u0000${identifier(parentTurnId, "Worker Group parent Turn id")}\u0000${text(groupKey, "Worker Group key")}`
  ).slice(0, 32)}`;
}

function workerKind(input: unknown): WorkerKind {
  if (input !== "discussion" && input !== "execution" && input !== "review") {
    throw new Error("Worker Group Worker kind is invalid.");
  }
  return input;
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  if (stableJson(Object.keys(value).sort()) !== stableJson([...keys].sort())) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function text(input: unknown, label: string, max = 240): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const value = input.trim();
  if (!value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function identifier(input: unknown, label: string): string {
  return text(input, label, 240);
}

function timestamp(input: unknown, label: string): string {
  if (typeof input !== "string" || !Number.isFinite(Date.parse(input))
    || new Date(input).toISOString() !== input) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function positiveInteger(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input <= 0) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function boundedInteger(input: unknown, label: string, min: number, max: number): number {
  const value = positiveInteger(input, label);
  if (value < min || value > max) throw new Error(`${label} is invalid.`);
  return value;
}

function digest(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input)) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
