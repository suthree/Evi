import { createHash } from "node:crypto";
import type { JsonObject } from "./action_types.js";
import { stableJson } from "./canonical_json.js";
import type { ExecutionLock, ExecutionLockInput } from "./contracts.js";
import {
  materializeExecutionLock,
  parseExecutionLock
} from "./execution_lock.js";

const TASK_ENVELOPE_SCHEMA_VERSION = 1;
const RESULT_ENVELOPE_SCHEMA_VERSION = 1;
const MAX_TEXT = 4_000;
const MAX_REFS = 32;
const MAX_ITEMS = 32;

export type WorkerStatus = "queued" | "running" | "needs_input" | "completed" | "failed";

export interface TaskEnvelope {
  schema_version: typeof TASK_ENVELOPE_SCHEMA_VERSION;
  task_id: string;
  worker_kind: "discussion";
  parent_run_id: string;
  parent_turn_id: string;
  objective: string;
  expected_result: string;
  context_refs: string[];
  artifact_refs: string[];
  constraints: string[];
  verification_requirements: string[];
  execution_target: "local_process";
  child_execution_lock_digest: string;
  deadline_at: string;
  budget: {
    max_output_tokens: number;
    timeout_ms: number;
  };
  digest: string;
}

export interface ResultEnvelope {
  schema_version: typeof RESULT_ENVELOPE_SCHEMA_VERSION;
  worker_id: string;
  child_run_id: string;
  status: "completed" | "failed" | "needs_input";
  summary: string;
  findings: JsonObject;
  artifact_refs: string[];
  evidence_refs: string[];
  unresolved_questions: string[];
  proposed_next_step: string | null;
  actual_execution_lock_digest: string;
  actual_execution: {
    execution_id: string;
    execution_ordinal: number;
    model_dispatch_ids: string[];
    provider: string | null;
    model: string | null;
  };
  consumed: {
    output_tokens: number;
    duration_ms: number;
  };
  created_at: string;
  digest: string;
}

export type ResultEnvelopeInput = Omit<ResultEnvelope, "schema_version" | "digest">;

export interface WorkerInspection {
  id: string;
  reservation_id: string;
  parent_run_id: string;
  parent_turn_id: string;
  status: WorkerStatus;
  task_envelope: TaskEnvelope;
  child_execution_lock: ExecutionLock;
  child_session_id: string | null;
  child_run_id: string | null;
  result_envelope: ResultEnvelope | null;
  result_delivered_to_turn_id: string | null;
  lease_ordinal: number;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerExecutionLease {
  worker_id: string;
  owner_token: string;
  ordinal: number;
  lease_expires_at: string;
}

export interface WorkerRunBinding {
  worker_id: string;
  owner_token: string;
}

export interface DiscussionTaskInput {
  objective: string;
  expected_result: string;
  context_refs?: string[];
  artifact_refs?: string[];
  constraints?: string[];
  verification_requirements?: string[];
  deadline_at: string;
  budget: {
    max_output_tokens: number;
    timeout_ms: number;
  };
}

export function materializeTaskEnvelope(input: DiscussionTaskInput & {
  task_id: string;
  parent_run_id: string;
  parent_turn_id: string;
  child_execution_lock_digest: string;
}): TaskEnvelope {
  const task = normalizeDiscussionTaskInput(input);
  const value: Omit<TaskEnvelope, "digest"> = {
    schema_version: TASK_ENVELOPE_SCHEMA_VERSION,
    task_id: identifier(input.task_id, "Task Envelope task id"),
    worker_kind: "discussion" as const,
    parent_run_id: identifier(input.parent_run_id, "Task Envelope parent Run id"),
    parent_turn_id: identifier(input.parent_turn_id, "Task Envelope parent Turn id"),
    objective: task.objective,
    expected_result: task.expected_result,
    context_refs: task.context_refs ?? [],
    artifact_refs: task.artifact_refs ?? [],
    constraints: task.constraints ?? [],
    verification_requirements: task.verification_requirements ?? [],
    execution_target: "local_process" as const,
    child_execution_lock_digest: digestValue(
      input.child_execution_lock_digest,
      "Task Envelope child Execution Lock digest"
    ),
    deadline_at: task.deadline_at,
    budget: task.budget
  };
  return { ...value, digest: sha256(stableJson(value)) };
}

export function normalizeDiscussionTaskInput(input: unknown): DiscussionTaskInput {
  const value = record(input, "Discussion Task");
  const budget = record(value.budget, "Discussion Task budget");
  assertExactKeys(budget, ["max_output_tokens", "timeout_ms"], "Discussion Task budget");
  return {
    objective: text(value.objective, "Task Envelope objective"),
    expected_result: text(value.expected_result, "Task Envelope expected result"),
    context_refs: stringArray(value.context_refs ?? [], "Task Envelope context refs", MAX_REFS),
    artifact_refs: stringArray(value.artifact_refs ?? [], "Task Envelope artifact refs", MAX_REFS),
    constraints: stringArray(value.constraints ?? [], "Task Envelope constraints", MAX_ITEMS),
    verification_requirements: stringArray(
      value.verification_requirements ?? [],
      "Task Envelope verification requirements",
      MAX_ITEMS
    ),
    deadline_at: timestamp(value.deadline_at, "Task Envelope deadline"),
    budget: {
      max_output_tokens: positiveInteger(
        budget.max_output_tokens,
        "Task Envelope output-token budget"
      ),
      timeout_ms: positiveInteger(budget.timeout_ms, "Task Envelope timeout budget")
    }
  };
}

export function parseTaskEnvelope(input: unknown): TaskEnvelope {
  const value = record(input, "Task Envelope");
  assertExactKeys(value, [
    "schema_version",
    "task_id",
    "worker_kind",
    "parent_run_id",
    "parent_turn_id",
    "objective",
    "expected_result",
    "context_refs",
    "artifact_refs",
    "constraints",
    "verification_requirements",
    "execution_target",
    "child_execution_lock_digest",
    "deadline_at",
    "budget",
    "digest"
  ], "Task Envelope");
  if (value.schema_version !== TASK_ENVELOPE_SCHEMA_VERSION
    || value.worker_kind !== "discussion"
    || value.execution_target !== "local_process") {
    throw new Error("Task Envelope schema is invalid.");
  }
  const parsed = materializeTaskEnvelope({
    task_id: value.task_id as string,
    parent_run_id: value.parent_run_id as string,
    parent_turn_id: value.parent_turn_id as string,
    objective: value.objective as string,
    expected_result: value.expected_result as string,
    context_refs: value.context_refs as string[],
    artifact_refs: value.artifact_refs as string[],
    constraints: value.constraints as string[],
    verification_requirements: value.verification_requirements as string[],
    child_execution_lock_digest: value.child_execution_lock_digest as string,
    deadline_at: value.deadline_at as string,
    budget: value.budget as DiscussionTaskInput["budget"]
  });
  if (parsed.digest !== value.digest) throw new Error("Task Envelope digest is invalid.");
  return parsed;
}

export function parseResultEnvelope(input: unknown): ResultEnvelope {
  const value = record(input, "Result Envelope");
  assertExactKeys(value, [
    "schema_version",
    "worker_id",
    "child_run_id",
    "status",
    "summary",
    "findings",
    "artifact_refs",
    "evidence_refs",
    "unresolved_questions",
    "proposed_next_step",
    "actual_execution_lock_digest",
    "actual_execution",
    "consumed",
    "created_at",
    "digest"
  ], "Result Envelope");
  if (value.schema_version !== RESULT_ENVELOPE_SCHEMA_VERSION) {
    throw new Error("Result Envelope schema is invalid.");
  }
  const status = value.status;
  if (status !== "completed" && status !== "failed" && status !== "needs_input") {
    throw new Error("Result Envelope status is invalid.");
  }
  const parsed = materializeResultEnvelope({
    worker_id: value.worker_id as string,
    child_run_id: value.child_run_id as string,
    status,
    summary: value.summary as string,
    findings: value.findings as JsonObject,
    artifact_refs: value.artifact_refs as string[],
    evidence_refs: value.evidence_refs as string[],
    unresolved_questions: value.unresolved_questions as string[],
    proposed_next_step: value.proposed_next_step as string | null,
    actual_execution_lock_digest: value.actual_execution_lock_digest as string,
    actual_execution: value.actual_execution as ResultEnvelope["actual_execution"],
    consumed: value.consumed as ResultEnvelope["consumed"],
    created_at: value.created_at as string
  });
  if (parsed.digest !== value.digest) throw new Error("Result Envelope digest is invalid.");
  return parsed;
}

export function materializeResultEnvelope(input: ResultEnvelopeInput): ResultEnvelope {
  if (input.status !== "completed" && input.status !== "failed" && input.status !== "needs_input") {
    throw new Error("Result Envelope status is invalid.");
  }
  const consumed = record(input.consumed, "Result Envelope consumed budget");
  assertExactKeys(consumed, ["output_tokens", "duration_ms"], "Result Envelope consumed budget");
  const actualExecution = record(input.actual_execution, "Result Envelope actual execution");
  assertExactKeys(actualExecution, [
    "execution_id",
    "execution_ordinal",
    "model_dispatch_ids",
    "provider",
    "model"
  ], "Result Envelope actual execution");
  const findings = jsonObject(input.findings, "Result Envelope findings");
  const proposedNextStep = input.proposed_next_step === null
    ? null
    : text(input.proposed_next_step, "Result Envelope proposed next step");
  const normalized: Omit<ResultEnvelope, "digest"> = {
    schema_version: RESULT_ENVELOPE_SCHEMA_VERSION,
    worker_id: identifier(input.worker_id, "Result Envelope worker id"),
    child_run_id: identifier(input.child_run_id, "Result Envelope child Run id"),
    status: input.status,
    summary: text(input.summary, "Result Envelope summary"),
    findings,
    artifact_refs: stringArray(input.artifact_refs, "Result Envelope artifact refs", MAX_REFS),
    evidence_refs: stringArray(input.evidence_refs, "Result Envelope evidence refs", MAX_REFS),
    unresolved_questions: stringArray(
      input.unresolved_questions,
      "Result Envelope unresolved questions",
      MAX_ITEMS
    ),
    proposed_next_step: proposedNextStep,
    actual_execution_lock_digest: digestValue(
      input.actual_execution_lock_digest,
      "Result Envelope Execution Lock digest"
    ),
    actual_execution: {
      execution_id: identifier(actualExecution.execution_id, "Result Envelope execution id"),
      execution_ordinal: positiveInteger(
        actualExecution.execution_ordinal,
        "Result Envelope execution ordinal"
      ),
      model_dispatch_ids: stringArray(
        actualExecution.model_dispatch_ids,
        "Result Envelope model dispatch ids",
        MAX_ITEMS
      ),
      provider: nullableIdentifier(actualExecution.provider, "Result Envelope provider"),
      model: nullableIdentifier(actualExecution.model, "Result Envelope model")
    },
    consumed: {
      output_tokens: nonNegativeInteger(consumed.output_tokens, "Result Envelope output tokens"),
      duration_ms: nonNegativeInteger(consumed.duration_ms, "Result Envelope duration")
    },
    created_at: timestamp(input.created_at, "Result Envelope created at")
  };
  const digest = sha256(stableJson(normalized));
  return { ...normalized, digest };
}

export function deriveDiscussionWorkerLock(
  parent: ExecutionLock,
  childActions: ExecutionLockInput["actions"],
  budget: DiscussionTaskInput["budget"]
): ExecutionLock {
  const maxOutputTokens = positiveInteger(
    budget.max_output_tokens,
    "Discussion worker output-token budget"
  );
  const timeoutMs = positiveInteger(budget.timeout_ms, "Discussion worker timeout budget");
  if (maxOutputTokens > parent.model.max_output_tokens || timeoutMs > parent.model.timeout_ms) {
    throw new Error("Discussion worker budget exceeds its parent Execution Lock.");
  }
  const input: ExecutionLockInput = {
    model: {
      ...parent.model,
      max_output_tokens: maxOutputTokens,
      timeout_ms: timeoutMs
    },
    authority: { ...parent.authority },
    configuration: {
      selector: parent.configuration.selector,
      source_refs: [...parent.configuration.source_refs]
    },
    actions: childActions.map((action) => ({ ...action }))
  };
  const child = materializeExecutionLock(input);
  assertExecutionLockNarrowing(parent, child);
  return child;
}

export function assertExecutionLockNarrowing(parent: ExecutionLock, childInput: unknown): void {
  const child = parseExecutionLock(childInput);
  for (const field of ["config_id", "provider", "api", "base_url", "model", "credential_ref"] as const) {
    if (child.model[field] !== parent.model[field]) {
      throw new Error(`Child Execution Lock expands or changes model authority: ${field}`);
    }
  }
  if (child.model.reasoning_effort !== parent.model.reasoning_effort
    || child.model.context_window_tokens !== parent.model.context_window_tokens
    || child.model.max_output_tokens > parent.model.max_output_tokens
    || child.model.timeout_ms > parent.model.timeout_ms) {
    throw new Error("Child Execution Lock expands model budget or reasoning authority.");
  }
  if (child.authority.cwd !== parent.authority.cwd
    || child.configuration.selector !== parent.configuration.selector
    || stableJson(child.configuration.source_refs) !== stableJson(parent.configuration.source_refs)) {
    throw new Error("Child Execution Lock changes parent authority or configuration provenance.");
  }
  for (const action of child.actions) {
    if (!parent.actions.some((candidate) => candidate.name === action.name
      && candidate.version === action.version
      && candidate.effect_class === action.effect_class)) {
      throw new Error(`Child Execution Lock expands Action authority: ${action.name}`);
    }
  }
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} is invalid.`);
  return input as Record<string, unknown>;
}

function assertExactKeys(input: Record<string, unknown>, allowed: string[], label: string): void {
  const expected = new Set(allowed);
  if (Object.keys(input).some((key) => !expected.has(key))
    || allowed.some((key) => !(key in input))) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const value = input.trim();
  if (!value || value.length > 240 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function nullableIdentifier(input: unknown, label: string): string | null {
  return input === null ? null : identifier(input, label);
}

function text(input: unknown, label: string): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const value = input.trim();
  if (!value || value.length > MAX_TEXT || /\u0000/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function stringArray(input: unknown, label: string, max: number): string[] {
  if (!Array.isArray(input) || input.length > max) throw new Error(`${label} are invalid.`);
  return [...new Set(input.map((value) => identifier(value, label)))].sort();
}

function positiveInteger(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input <= 0) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function nonNegativeInteger(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function timestamp(input: unknown, label: string): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const date = new Date(input);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== input) {
    throw new Error(`${label} must be canonical ISO 8601 UTC.`);
  }
  return input;
}

function digestValue(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input)) throw new Error(`${label} is invalid.`);
  return input;
}

function jsonObject(input: unknown, label: string): JsonObject {
  const value = record(input, label);
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body, "utf8") > 32 * 1024) throw new Error(`${label} is too large.`);
  return JSON.parse(body) as JsonObject;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
