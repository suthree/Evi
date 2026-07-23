import { createHash } from "node:crypto";
import type { JsonObject } from "./action_types.js";
import { stableJson } from "./canonical_json.js";
import type { ExecutionLock, ExecutionLockInput } from "./contracts.js";
import {
  parseDeliveryLineage,
  parseDeliveryLineageSnapshot,
  type DeliveryLineage,
  type DeliveryLineageInput,
  type DeliveryLineageSnapshot
} from "./delivery_lineage.js";
import {
  assertExecutionLockNarrowing,
  deriveDiscussionWorkerLock
} from "./orchestration_types.js";
import { parseExecutionLock } from "./execution_lock.js";
import { validateRuntimeTimeoutDuration } from "./runtime_limits.js";

const TASK_SCHEMA_VERSION = 1;
const RESULT_SCHEMA_VERSION = 1;
const MAX_TEXT = 4_000;
const MAX_REFS = 32;
const MAX_COMMANDS = 16;
const MAX_ARGS = 64;

export interface VerificationCommand {
  command: string;
  args: string[];
  cwd: string;
  timeout_ms: number;
}

export interface VerificationReceipt extends VerificationCommand {
  exit_code: number | null;
  signal: string | null;
  timed_out: boolean;
  stdout_digest: string;
  stderr_digest: string;
  duration_ms: number;
  digest: string;
}

export interface ExecutionTaskInput {
  objective: string;
  expected_result: string;
  context_refs?: string[];
  artifact_refs?: string[];
  constraints?: string[];
  verification_commands: VerificationCommand[];
  deadline_at: string;
  budget: {
    max_output_tokens: number;
    timeout_ms: number;
    max_tool_calls: number;
  };
  lineage: DeliveryLineageInput;
  rollback_instruction: string;
}

export interface ExecutionTaskEnvelope {
  schema_version: typeof TASK_SCHEMA_VERSION;
  task_id: string;
  worker_kind: "execution";
  parent_run_id: string;
  parent_turn_id: string;
  objective: string;
  expected_result: string;
  context_refs: string[];
  artifact_refs: string[];
  constraints: string[];
  verification_commands: VerificationCommand[];
  execution_target: "local_agent_process";
  child_execution_lock_digest: string;
  lineage: DeliveryLineage;
  baseline: DeliveryLineageSnapshot;
  rollback_instruction: string;
  deadline_at: string;
  budget: ExecutionTaskInput["budget"];
  digest: string;
}

export interface ExecutionAdapterResult {
  status: "done" | "blocked" | "failed";
  summary: string;
  changed_files: string[];
  tests: string[];
  blockers: string[];
  next_action: string;
  completion_authority: "supervisor";
  execution: {
    adapter: "local_agent_cli" | "injected_test";
    thread_id: string | null;
    requested_model: string;
    observed_model: string | null;
    event_count: number;
    tool_calls_observed: number;
  };
  consumed: {
    output_chars: number;
    duration_ms: number;
  };
}

export interface ExecutionResultEnvelope {
  schema_version: typeof RESULT_SCHEMA_VERSION;
  result_kind: "execution";
  worker_id: string;
  status: "completed" | "failed" | "needs_input";
  summary: string;
  findings: JsonObject;
  artifact_refs: string[];
  evidence_refs: string[];
  unresolved_questions: string[];
  proposed_next_step: string | null;
  task_envelope_digest: string;
  child_execution_lock_digest: string;
  lineage_id: string;
  lineage_digest: string;
  baseline_snapshot_digest: string;
  final_snapshot: DeliveryLineageSnapshot;
  verification_receipts: VerificationReceipt[];
  actual_execution: {
    attempt_id: string;
    lease_ordinal: number;
    adapter: "local_agent_cli" | "injected_test";
    thread_id: string | null;
    requested_model: string;
    observed_model: string | null;
    event_count: number;
    tool_calls_observed: number;
    executor_result_digest: string;
  };
  consumed: {
    output_chars: number;
    duration_ms: number;
  };
  created_at: string;
  digest: string;
}

export interface ExecutionWorkerInspection {
  id: string;
  reservation_id: string;
  parent_run_id: string;
  parent_turn_id: string;
  status: "queued" | "running" | "paused" | "needs_input" | "completed" | "failed";
  task_envelope: ExecutionTaskEnvelope;
  child_execution_lock: ExecutionLock;
  lineage: DeliveryLineage;
  child_session_id: null;
  child_run_id: null;
  result_envelope: ExecutionResultEnvelope | null;
  result_delivered_to_turn_id: string | null;
  lease_ordinal: number;
  lease_expires_at: string | null;
  attempt_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionWorkerLease {
  worker_id: string;
  lineage_id: string;
  owner_token: string;
  ordinal: number;
  attempt_id: string;
  lease_expires_at: string;
}

export function normalizeExecutionTaskInput(input: unknown): ExecutionTaskInput {
  const value = record(input, "Execution Task");
  const budget = record(value.budget, "Execution Task budget");
  assertExactKeys(budget, ["max_output_tokens", "timeout_ms", "max_tool_calls"], "Execution Task budget");
  const timeoutMs = positiveInteger(budget.timeout_ms, "Execution Task timeout budget");
  validateRuntimeTimeoutDuration(timeoutMs, "Execution Task");
  return {
    objective: text(value.objective, "Execution Task objective"),
    expected_result: text(value.expected_result, "Execution Task expected result"),
    context_refs: stringArray(value.context_refs ?? [], "Execution Task context refs", MAX_REFS),
    artifact_refs: stringArray(value.artifact_refs ?? [], "Execution Task artifact refs", MAX_REFS),
    constraints: stringArray(value.constraints ?? [], "Execution Task constraints", MAX_REFS),
    verification_commands: verificationCommands(value.verification_commands),
    deadline_at: timestamp(value.deadline_at, "Execution Task deadline"),
    budget: {
      max_output_tokens: positiveInteger(budget.max_output_tokens, "Execution Task output-token budget"),
      timeout_ms: timeoutMs,
      max_tool_calls: boundedInteger(budget.max_tool_calls, "Execution Task tool-call budget", 0, 64)
    },
    lineage: normalizeLineageInput(value.lineage),
    rollback_instruction: text(value.rollback_instruction, "Execution Task rollback instruction")
  };
}

export function materializeExecutionTaskEnvelope(input: ExecutionTaskInput & {
  task_id: string;
  parent_run_id: string;
  parent_turn_id: string;
  child_execution_lock_digest: string;
  materialized_lineage: DeliveryLineage;
  baseline: DeliveryLineageSnapshot;
}): ExecutionTaskEnvelope {
  const task = normalizeExecutionTaskInput(input);
  const lineage = parseDeliveryLineage(input.materialized_lineage);
  const baseline = parseDeliveryLineageSnapshot(input.baseline);
  if (baseline.lineage_id !== lineage.id || baseline.lineage_digest !== lineage.digest) {
    throw new Error("Execution Task baseline does not bind its Delivery Lineage.");
  }
  const body: Omit<ExecutionTaskEnvelope, "digest"> = {
    schema_version: TASK_SCHEMA_VERSION,
    task_id: identifier(input.task_id, "Execution Task id"),
    worker_kind: "execution",
    parent_run_id: identifier(input.parent_run_id, "Execution Task parent Run id"),
    parent_turn_id: identifier(input.parent_turn_id, "Execution Task parent Turn id"),
    objective: task.objective,
    expected_result: task.expected_result,
    context_refs: task.context_refs ?? [],
    artifact_refs: task.artifact_refs ?? [],
    constraints: task.constraints ?? [],
    verification_commands: task.verification_commands,
    execution_target: "local_agent_process",
    child_execution_lock_digest: digestValue(
      input.child_execution_lock_digest,
      "Execution Task child Execution Lock digest"
    ),
    lineage,
    baseline,
    rollback_instruction: task.rollback_instruction,
    deadline_at: task.deadline_at,
    budget: task.budget
  };
  return { ...body, digest: sha256(stableJson(body)) };
}

export function parseExecutionTaskEnvelope(input: unknown): ExecutionTaskEnvelope {
  const value = record(input, "Execution Task Envelope");
  assertExactKeys(value, [
    "schema_version", "task_id", "worker_kind", "parent_run_id", "parent_turn_id",
    "objective", "expected_result", "context_refs", "artifact_refs", "constraints",
    "verification_commands", "execution_target", "child_execution_lock_digest", "lineage",
    "baseline", "rollback_instruction", "deadline_at", "budget", "digest"
  ], "Execution Task Envelope");
  if (value.schema_version !== TASK_SCHEMA_VERSION
    || value.worker_kind !== "execution"
    || value.execution_target !== "local_agent_process") {
    throw new Error("Execution Task Envelope schema is invalid.");
  }
  const lineage = parseDeliveryLineage(value.lineage);
  const parsed = materializeExecutionTaskEnvelope({
    task_id: value.task_id as string,
    parent_run_id: value.parent_run_id as string,
    parent_turn_id: value.parent_turn_id as string,
    objective: value.objective as string,
    expected_result: value.expected_result as string,
    context_refs: value.context_refs as string[],
    artifact_refs: value.artifact_refs as string[],
    constraints: value.constraints as string[],
    verification_commands: value.verification_commands as VerificationCommand[],
    child_execution_lock_digest: value.child_execution_lock_digest as string,
    lineage: {
      worktree: lineage.worktree,
      branch: lineage.branch,
      base_commit: lineage.base_commit,
      writable_paths: lineage.writable_paths
    },
    materialized_lineage: lineage,
    baseline: value.baseline as DeliveryLineageSnapshot,
    rollback_instruction: value.rollback_instruction as string,
    deadline_at: value.deadline_at as string,
    budget: value.budget as ExecutionTaskInput["budget"]
  });
  if (parsed.digest !== value.digest) throw new Error("Execution Task Envelope digest is invalid.");
  return parsed;
}

export function deriveExecutionWorkerLock(
  parent: ExecutionLock,
  childActions: ExecutionLockInput["actions"],
  budget: ExecutionTaskInput["budget"]
): ExecutionLock {
  const child = deriveDiscussionWorkerLock(parent, childActions, budget);
  assertExecutionLockNarrowing(parent, child);
  return child;
}

export function materializeExecutionAdapterResult(input: ExecutionAdapterResult): ExecutionAdapterResult {
  const value = record(input, "Execution adapter result");
  assertExactKeys(value, [
    "status", "summary", "changed_files", "tests", "blockers", "next_action",
    "completion_authority", "execution", "consumed"
  ], "Execution adapter result");
  if (value.status !== "done" && value.status !== "blocked" && value.status !== "failed") {
    throw new Error("Execution adapter result status is invalid.");
  }
  if (value.completion_authority !== "supervisor") {
    throw new Error("Execution adapter completion authority must remain supervisor.");
  }
  const execution = record(value.execution, "Execution adapter lineage");
  assertExactKeys(execution, [
    "adapter", "thread_id", "requested_model", "observed_model", "event_count",
    "tool_calls_observed"
  ], "Execution adapter lineage");
  if (execution.adapter !== "local_agent_cli" && execution.adapter !== "injected_test") {
    throw new Error("Execution adapter identity is invalid.");
  }
  const consumed = record(value.consumed, "Execution adapter consumed budget");
  assertExactKeys(consumed, ["output_chars", "duration_ms"], "Execution adapter consumed budget");
  const blockers = stringArray(value.blockers, "Execution adapter blockers", MAX_REFS);
  if ((value.status === "done") !== (blockers.length === 0)) {
    throw new Error("Execution adapter status and blockers are inconsistent.");
  }
  return {
    status: value.status,
    summary: text(value.summary, "Execution adapter summary"),
    changed_files: stringArray(value.changed_files, "Execution adapter changed files", 128),
    tests: stringArray(value.tests, "Execution adapter tests", MAX_REFS),
    blockers,
    next_action: text(value.next_action, "Execution adapter next action"),
    completion_authority: "supervisor",
    execution: {
      adapter: execution.adapter,
      thread_id: nullableIdentifier(execution.thread_id, "Execution adapter thread id"),
      requested_model: identifier(execution.requested_model, "Execution adapter requested model"),
      observed_model: nullableIdentifier(execution.observed_model, "Execution adapter observed model"),
      event_count: nonNegativeInteger(execution.event_count, "Execution adapter event count"),
      tool_calls_observed: nonNegativeInteger(
        execution.tool_calls_observed,
        "Execution adapter tool-call count"
      )
    },
    consumed: {
      output_chars: nonNegativeInteger(consumed.output_chars, "Execution adapter output chars"),
      duration_ms: nonNegativeInteger(consumed.duration_ms, "Execution adapter duration")
    }
  };
}

export function materializeVerificationReceipt(
  commandInput: VerificationCommand,
  observation: Omit<VerificationReceipt, keyof VerificationCommand | "digest">
): VerificationReceipt {
  const command = verificationCommand(commandInput);
  const body: Omit<VerificationReceipt, "digest"> = {
    ...command,
    exit_code: nullableExitCode(observation.exit_code),
    signal: nullableIdentifier(observation.signal, "Verification signal"),
    timed_out: Boolean(observation.timed_out),
    stdout_digest: digestValue(observation.stdout_digest, "Verification stdout digest"),
    stderr_digest: digestValue(observation.stderr_digest, "Verification stderr digest"),
    duration_ms: nonNegativeInteger(observation.duration_ms, "Verification duration")
  };
  return { ...body, digest: sha256(stableJson(body)) };
}

export function parseVerificationReceipt(input: unknown): VerificationReceipt {
  const value = record(input, "Verification Receipt");
  assertExactKeys(value, [
    "command", "args", "cwd", "timeout_ms", "exit_code", "signal", "timed_out",
    "stdout_digest", "stderr_digest", "duration_ms", "digest"
  ], "Verification Receipt");
  const parsed = materializeVerificationReceipt(verificationCommand({
    command: value.command,
    args: value.args,
    cwd: value.cwd,
    timeout_ms: value.timeout_ms
  }), {
    exit_code: value.exit_code as number | null,
    signal: value.signal as string | null,
    timed_out: value.timed_out as boolean,
    stdout_digest: value.stdout_digest as string,
    stderr_digest: value.stderr_digest as string,
    duration_ms: value.duration_ms as number
  });
  if (parsed.digest !== value.digest) throw new Error("Verification Receipt digest is invalid.");
  return parsed;
}

export function materializeExecutionResultEnvelope(
  input: Omit<ExecutionResultEnvelope, "schema_version" | "result_kind" | "digest">
): ExecutionResultEnvelope {
  if (input.status !== "completed" && input.status !== "failed" && input.status !== "needs_input") {
    throw new Error("Execution Result status is invalid.");
  }
  const finalSnapshot = parseDeliveryLineageSnapshot(input.final_snapshot);
  const receipts = input.verification_receipts.map(parseVerificationReceipt);
  const actual = record(input.actual_execution, "Execution Result actual execution");
  assertExactKeys(actual, [
    "attempt_id", "lease_ordinal", "adapter", "thread_id", "requested_model",
    "observed_model", "event_count", "tool_calls_observed", "executor_result_digest"
  ], "Execution Result actual execution");
  if (actual.adapter !== "local_agent_cli" && actual.adapter !== "injected_test") {
    throw new Error("Execution Result adapter is invalid.");
  }
  const consumed = record(input.consumed, "Execution Result consumed budget");
  assertExactKeys(consumed, ["output_chars", "duration_ms"], "Execution Result consumed budget");
  const proposedNextStep = input.proposed_next_step === null
    ? null
    : text(input.proposed_next_step, "Execution Result proposed next step");
  const body: Omit<ExecutionResultEnvelope, "digest"> = {
    schema_version: RESULT_SCHEMA_VERSION,
    result_kind: "execution",
    worker_id: identifier(input.worker_id, "Execution Result worker id"),
    status: input.status,
    summary: text(input.summary, "Execution Result summary"),
    findings: jsonObject(input.findings, "Execution Result findings"),
    artifact_refs: stringArray(input.artifact_refs, "Execution Result artifact refs", MAX_REFS),
    evidence_refs: stringArray(input.evidence_refs, "Execution Result evidence refs", MAX_REFS),
    unresolved_questions: stringArray(
      input.unresolved_questions,
      "Execution Result unresolved questions",
      MAX_REFS
    ),
    proposed_next_step: proposedNextStep,
    task_envelope_digest: digestValue(input.task_envelope_digest, "Execution Result Task digest"),
    child_execution_lock_digest: digestValue(
      input.child_execution_lock_digest,
      "Execution Result child Execution Lock digest"
    ),
    lineage_id: identifier(input.lineage_id, "Execution Result Delivery Lineage id"),
    lineage_digest: digestValue(input.lineage_digest, "Execution Result Delivery Lineage digest"),
    baseline_snapshot_digest: digestValue(
      input.baseline_snapshot_digest,
      "Execution Result baseline snapshot digest"
    ),
    final_snapshot: finalSnapshot,
    verification_receipts: receipts,
    actual_execution: {
      attempt_id: identifier(actual.attempt_id, "Execution Result attempt id"),
      lease_ordinal: positiveInteger(actual.lease_ordinal, "Execution Result lease ordinal"),
      adapter: actual.adapter,
      thread_id: nullableIdentifier(actual.thread_id, "Execution Result thread id"),
      requested_model: identifier(actual.requested_model, "Execution Result requested model"),
      observed_model: nullableIdentifier(actual.observed_model, "Execution Result observed model"),
      event_count: nonNegativeInteger(actual.event_count, "Execution Result event count"),
      tool_calls_observed: nonNegativeInteger(
        actual.tool_calls_observed,
        "Execution Result tool-call count"
      ),
      executor_result_digest: digestValue(
        actual.executor_result_digest,
        "Execution Result executor result digest"
      )
    },
    consumed: {
      output_chars: nonNegativeInteger(consumed.output_chars, "Execution Result output chars"),
      duration_ms: nonNegativeInteger(consumed.duration_ms, "Execution Result duration")
    },
    created_at: timestamp(input.created_at, "Execution Result timestamp")
  };
  return { ...body, digest: sha256(stableJson(body)) };
}

export function parseExecutionResultEnvelope(input: unknown): ExecutionResultEnvelope {
  const value = record(input, "Execution Result Envelope");
  assertExactKeys(value, [
    "schema_version", "result_kind", "worker_id", "status", "summary", "findings",
    "artifact_refs", "evidence_refs", "unresolved_questions", "proposed_next_step",
    "task_envelope_digest", "child_execution_lock_digest", "lineage_id", "lineage_digest",
    "baseline_snapshot_digest", "final_snapshot", "verification_receipts", "actual_execution",
    "consumed", "created_at", "digest"
  ], "Execution Result Envelope");
  if (value.schema_version !== RESULT_SCHEMA_VERSION || value.result_kind !== "execution") {
    throw new Error("Execution Result Envelope schema is invalid.");
  }
  const parsed = materializeExecutionResultEnvelope({
    worker_id: value.worker_id as string,
    status: value.status as ExecutionResultEnvelope["status"],
    summary: value.summary as string,
    findings: value.findings as JsonObject,
    artifact_refs: value.artifact_refs as string[],
    evidence_refs: value.evidence_refs as string[],
    unresolved_questions: value.unresolved_questions as string[],
    proposed_next_step: value.proposed_next_step as string | null,
    task_envelope_digest: value.task_envelope_digest as string,
    child_execution_lock_digest: value.child_execution_lock_digest as string,
    lineage_id: value.lineage_id as string,
    lineage_digest: value.lineage_digest as string,
    baseline_snapshot_digest: value.baseline_snapshot_digest as string,
    final_snapshot: value.final_snapshot as DeliveryLineageSnapshot,
    verification_receipts: value.verification_receipts as VerificationReceipt[],
    actual_execution: value.actual_execution as ExecutionResultEnvelope["actual_execution"],
    consumed: value.consumed as ExecutionResultEnvelope["consumed"],
    created_at: value.created_at as string
  });
  if (parsed.digest !== value.digest) throw new Error("Execution Result Envelope digest is invalid.");
  return parsed;
}

export function parseExecutionWorkerInspection(input: {
  id: string;
  reservation_id: string;
  parent_run_id: string;
  parent_turn_id: string;
  status: ExecutionWorkerInspection["status"];
  task_envelope: unknown;
  child_execution_lock: unknown;
  lineage: unknown;
  child_session_id?: null;
  child_run_id?: null;
  result_envelope: unknown | null;
  result_delivered_to_turn_id: string | null;
  lease_ordinal: number;
  lease_expires_at: string | null;
  attempt_id: string | null;
  created_at: string;
  updated_at: string;
}): ExecutionWorkerInspection {
  const task = parseExecutionTaskEnvelope(input.task_envelope);
  const lock = parseExecutionLock(input.child_execution_lock);
  const lineage = parseDeliveryLineage(input.lineage);
  const result = input.result_envelope === null ? null : parseExecutionResultEnvelope(input.result_envelope);
  if (task.lineage.digest !== lineage.digest
    || task.child_execution_lock_digest !== lock.digest
    || task.parent_run_id !== input.parent_run_id
    || task.parent_turn_id !== input.parent_turn_id
    || (result !== null) !== ["completed", "failed", "needs_input"].includes(input.status)
    || (result && (result.worker_id !== input.id
      || result.status !== input.status
      || result.task_envelope_digest !== task.digest
      || result.child_execution_lock_digest !== lock.digest
      || result.lineage_digest !== lineage.digest))) {
    throw new Error(`Execution Worker stored identity is invalid: ${input.id}`);
  }
  return {
    ...input,
    child_session_id: null,
    child_run_id: null,
    task_envelope: task,
    child_execution_lock: lock,
    lineage,
    result_envelope: result
  };
}

export function executionAdapterResultDigest(input: ExecutionAdapterResult): string {
  return sha256(stableJson(materializeExecutionAdapterResult(input)));
}

function verificationCommands(input: unknown): VerificationCommand[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_COMMANDS) {
    throw new Error("Execution Task verification commands are invalid.");
  }
  return input.map(verificationCommand);
}

function verificationCommand(input: unknown): VerificationCommand {
  const value = record(input, "Execution Task verification command");
  assertExactKeys(value, ["command", "args", "cwd", "timeout_ms"], "Execution Task verification command");
  const command = identifier(value.command, "Verification command");
  if (!/^[A-Za-z0-9._+-]{1,80}$/u.test(command)) {
    throw new Error("Verification command must be one executable token without a shell.");
  }
  if (!Array.isArray(value.args) || value.args.length > MAX_ARGS) {
    throw new Error("Verification command arguments are invalid.");
  }
  const args = value.args.map((arg) => boundedString(arg, "Verification argument", 1_000));
  const cwd = value.cwd === "." ? "." : repoPath(value.cwd, "Verification cwd");
  const timeoutMs = positiveInteger(value.timeout_ms, "Verification timeout");
  validateRuntimeTimeoutDuration(timeoutMs, "Verification command");
  assertVerificationCommandAllowed(command, args);
  return { command, args, cwd, timeout_ms: timeoutMs };
}

function assertVerificationCommandAllowed(command: string, args: string[]): void {
  const safeScript = (value: string): boolean => /^[A-Za-z0-9:_-]{1,100}$/u.test(value);
  const safePath = (value: string): boolean => !value.startsWith("/")
    && !value.startsWith("-")
    && !value.split(/[\\/]/u).some((part) => !part || part === "." || part === "..");
  const pnpmRun = command === "pnpm"
    && args.length >= 2
    && args[0] === "run"
    && safeScript(args[1]!);
  const nodeTest = command === "node"
    && args.length >= 2
    && args[0] === "--test"
    && args.slice(1).every(safePath);
  const gitDiffCheck = command === "git"
    && stableJson(args) === stableJson(["diff", "--check"]);
  if (!pnpmRun && !nodeTest && !gitDiffCheck) {
    throw new Error(
      "Verification command must be pnpm run <script>, node --test <repo-path>, or git diff --check."
    );
  }
}

function normalizeLineageInput(input: unknown): DeliveryLineageInput {
  const value = record(input, "Execution Task Delivery Lineage");
  assertExactKeys(value, ["worktree", "branch", "base_commit", "writable_paths"], "Execution Task Delivery Lineage");
  if (!Array.isArray(value.writable_paths)) {
    throw new Error("Execution Task writable paths are invalid.");
  }
  return {
    worktree: boundedString(value.worktree, "Execution Task worktree", 2_000),
    branch: identifier(value.branch, "Execution Task branch"),
    base_commit: boundedString(value.base_commit, "Execution Task base commit", 40),
    writable_paths: value.writable_paths.map((path) => repoPath(path, "Execution Task writable path"))
  };
}

function repoPath(input: unknown, label: string): string {
  const value = boundedString(input, label, 500).replaceAll("\\", "/");
  if (value.startsWith("/") || value.endsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} must be repository-relative.`);
  }
  return value;
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} is invalid.`);
  return input as Record<string, unknown>;
}

function assertExactKeys(input: Record<string, unknown>, allowed: string[], label: string): void {
  const expected = new Set(allowed);
  if (Object.keys(input).some((key) => !expected.has(key)) || allowed.some((key) => !(key in input))) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function identifier(input: unknown, label: string): string {
  return boundedString(input, label, 240);
}

function nullableIdentifier(input: unknown, label: string): string | null {
  return input === null ? null : identifier(input, label);
}

function text(input: unknown, label: string): string {
  return boundedString(input, label, MAX_TEXT);
}

function boundedString(input: unknown, label: string, max: number): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const value = input.trim();
  if (!value || value.length > max || /\u0000/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function stringArray(input: unknown, label: string, max: number): string[] {
  if (!Array.isArray(input) || input.length > max) throw new Error(`${label} are invalid.`);
  return [...new Set(input.map((value) => identifier(value, label)))].sort();
}

function positiveInteger(input: unknown, label: string): number {
  return boundedInteger(input, label, 1, Number.MAX_SAFE_INTEGER);
}

function nonNegativeInteger(input: unknown, label: string): number {
  return boundedInteger(input, label, 0, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(input: unknown, label: string, min: number, max: number): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < min || input > max) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function nullableExitCode(input: unknown): number | null {
  return input === null ? null : boundedInteger(input, "Verification exit code", 0, 255);
}

function timestamp(input: unknown, label: string): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const parsed = new Date(input);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== input) {
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
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") > 32 * 1024) throw new Error(`${label} is too large.`);
  return JSON.parse(encoded) as JsonObject;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
