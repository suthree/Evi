import { createHash } from "node:crypto";
import { stableJson } from "./canonical_json.js";
import type { ExecutionLock, ExecutionLockInput } from "./contracts.js";
import type { ExecutionWorkerInspection } from "./execution_worker_types.js";
import { parseExecutionLock } from "./execution_lock.js";
import { deriveDiscussionWorkerLock } from "./orchestration_types.js";
import { validateRuntimeTimeoutDuration } from "./runtime_limits.js";

const TASK_SCHEMA_VERSION = 1;
const RESULT_SCHEMA_VERSION = 1;
const REVIEW_PACKET_SCHEMA_VERSION = 1;
const MAX_TEXT = 4_000;
const MAX_SHORT_TEXT = 240;
const MAX_REFS = 32;
const MAX_FINDINGS = 32;
export const REVIEW_EVIDENCE_PACKET_MAX_BYTES = 96 * 1024;

export interface ReviewTaskInput {
  execution_worker_id: string;
  checklist: string[];
  deadline_at: string;
  budget: {
    max_output_tokens: number;
    timeout_ms: number;
  };
}

export interface ReviewEvidenceFile {
  path: string;
  before_mode: string | null;
  after_mode: string | null;
  before: string | null;
  after: string | null;
}

export interface ReviewEvidencePacket {
  schema_version: typeof REVIEW_PACKET_SCHEMA_VERSION;
  execution_worker_id: string;
  execution_result_digest: string;
  lineage_id: string;
  lineage_digest: string;
  baseline_snapshot_digest: string;
  final_snapshot_digest: string;
  changed_paths: string[];
  files: ReviewEvidenceFile[];
  digest: string;
}

export interface ReviewTaskEnvelope {
  schema_version: typeof TASK_SCHEMA_VERSION;
  task_id: string;
  worker_kind: "review";
  parent_run_id: string;
  parent_turn_id: string;
  execution_worker_id: string;
  execution_task_digest: string;
  execution_result_digest: string;
  lineage_id: string;
  lineage_digest: string;
  baseline_snapshot_digest: string;
  final_snapshot_digest: string;
  verification_receipt_digests: string[];
  checklist: string[];
  review_packet: ReviewEvidencePacket;
  execution_target: "local_process";
  child_execution_lock_digest: string;
  deadline_at: string;
  budget: ReviewTaskInput["budget"];
  digest: string;
}

export interface ReviewFinding {
  priority: 0 | 1 | 2 | 3;
  path: string;
  line: number | null;
  title: string;
  rationale: string;
}

export interface ReviewDecision {
  verdict: "approved" | "changes_required";
  summary: string;
  findings: ReviewFinding[];
}

export interface ReviewResultEnvelope {
  schema_version: typeof RESULT_SCHEMA_VERSION;
  result_kind: "review";
  worker_id: string;
  child_run_id: string;
  status: "completed" | "failed";
  verdict: ReviewDecision["verdict"] | null;
  summary: string;
  findings: ReviewFinding[];
  task_envelope_digest: string;
  review_packet_digest: string;
  execution_worker_id: string;
  execution_result_digest: string;
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

export interface ReviewWorkerInspection {
  id: string;
  reservation_id: string;
  parent_run_id: string;
  parent_turn_id: string;
  status: "queued" | "running" | "completed" | "failed";
  task_envelope: ReviewTaskEnvelope;
  child_execution_lock: ExecutionLock;
  execution_worker_id: string;
  child_session_id: string | null;
  child_run_id: string | null;
  result_envelope: ReviewResultEnvelope | null;
  result_delivered_to_turn_id: string | null;
  lease_ordinal: number;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function normalizeReviewTaskInput(input: unknown): ReviewTaskInput {
  const value = record(input, "Review Task");
  exactKeys(value, ["execution_worker_id", "checklist", "deadline_at", "budget"], "Review Task");
  const budget = record(value.budget, "Review Task budget");
  exactKeys(budget, ["max_output_tokens", "timeout_ms"], "Review Task budget");
  const timeoutMs = positiveInteger(budget.timeout_ms, "Review Task timeout budget");
  validateRuntimeTimeoutDuration(timeoutMs, "Review Task");
  return {
    execution_worker_id: identifier(value.execution_worker_id, "Review Task execution Worker id", 240),
    checklist: stringArray(value.checklist, "Review Task checklist", MAX_REFS, MAX_SHORT_TEXT, true),
    deadline_at: timestamp(value.deadline_at, "Review Task deadline"),
    budget: {
      max_output_tokens: positiveInteger(budget.max_output_tokens, "Review Task output-token budget"),
      timeout_ms: timeoutMs
    }
  };
}

export function materializeReviewTaskEnvelope(input: ReviewTaskInput & {
  task_id: string;
  parent_run_id: string;
  parent_turn_id: string;
  child_execution_lock_digest: string;
  subject: ExecutionWorkerInspection;
  review_packet: ReviewEvidencePacket;
}): ReviewTaskEnvelope {
  const task = normalizeReviewTaskInput({
    execution_worker_id: input.execution_worker_id,
    checklist: input.checklist,
    deadline_at: input.deadline_at,
    budget: input.budget
  });
  const subject = input.subject;
  const result = subject.result_envelope;
  const packet = parseReviewEvidencePacket(input.review_packet);
  if (!result || subject.status !== "completed" || result.status !== "completed"
    || task.execution_worker_id !== subject.id
    || packet.execution_worker_id !== subject.id
    || packet.execution_result_digest !== result.digest
    || packet.lineage_id !== subject.lineage.id
    || packet.lineage_digest !== subject.lineage.digest
    || packet.baseline_snapshot_digest !== subject.task_envelope.baseline.digest
    || packet.final_snapshot_digest !== result.final_snapshot.digest
    || stableJson(packet.changed_paths) !== stableJson(result.final_snapshot.changed_paths)) {
    throw new Error(`Review Task subject identity is invalid: ${subject.id}`);
  }
  const body: Omit<ReviewTaskEnvelope, "digest"> = {
    schema_version: TASK_SCHEMA_VERSION,
    task_id: identifier(input.task_id, "Review Task id", 240),
    worker_kind: "review",
    parent_run_id: identifier(input.parent_run_id, "Review Task parent Run id", 240),
    parent_turn_id: identifier(input.parent_turn_id, "Review Task parent Turn id", 240),
    execution_worker_id: subject.id,
    execution_task_digest: subject.task_envelope.digest,
    execution_result_digest: result.digest,
    lineage_id: subject.lineage.id,
    lineage_digest: subject.lineage.digest,
    baseline_snapshot_digest: subject.task_envelope.baseline.digest,
    final_snapshot_digest: result.final_snapshot.digest,
    verification_receipt_digests: result.verification_receipts.map((receipt) => receipt.digest),
    checklist: task.checklist,
    review_packet: packet,
    execution_target: "local_process",
    child_execution_lock_digest: digest(input.child_execution_lock_digest, "Review Task child lock"),
    deadline_at: task.deadline_at,
    budget: task.budget
  };
  return { ...body, digest: sha256(stableJson(body)) };
}

export function parseReviewTaskEnvelope(input: unknown): ReviewTaskEnvelope {
  const value = record(input, "Review Task Envelope");
  exactKeys(value, [
    "schema_version", "task_id", "worker_kind", "parent_run_id", "parent_turn_id",
    "execution_worker_id", "execution_task_digest", "execution_result_digest",
    "lineage_id", "lineage_digest", "baseline_snapshot_digest", "final_snapshot_digest",
    "verification_receipt_digests", "checklist", "review_packet", "execution_target",
    "child_execution_lock_digest", "deadline_at", "budget", "digest"
  ], "Review Task Envelope");
  if (value.schema_version !== TASK_SCHEMA_VERSION
    || value.worker_kind !== "review"
    || value.execution_target !== "local_process") {
    throw new Error("Review Task Envelope schema is invalid.");
  }
  const packet = parseReviewEvidencePacket(value.review_packet);
  const task = normalizeReviewTaskInput({
    execution_worker_id: value.execution_worker_id,
    checklist: value.checklist,
    deadline_at: value.deadline_at,
    budget: value.budget
  });
  const body: Omit<ReviewTaskEnvelope, "digest"> = {
    schema_version: TASK_SCHEMA_VERSION,
    task_id: identifier(value.task_id, "Review Task id", 240),
    worker_kind: "review",
    parent_run_id: identifier(value.parent_run_id, "Review Task parent Run id", 240),
    parent_turn_id: identifier(value.parent_turn_id, "Review Task parent Turn id", 240),
    execution_worker_id: task.execution_worker_id,
    execution_task_digest: digest(value.execution_task_digest, "Review Task execution Task"),
    execution_result_digest: digest(value.execution_result_digest, "Review Task execution Result"),
    lineage_id: identifier(value.lineage_id, "Review Task lineage id", 240),
    lineage_digest: digest(value.lineage_digest, "Review Task lineage"),
    baseline_snapshot_digest: digest(value.baseline_snapshot_digest, "Review Task baseline"),
    final_snapshot_digest: digest(value.final_snapshot_digest, "Review Task final snapshot"),
    verification_receipt_digests: digestArray(
      value.verification_receipt_digests,
      "Review Task verification receipts"
    ),
    checklist: task.checklist,
    review_packet: packet,
    execution_target: "local_process",
    child_execution_lock_digest: digest(value.child_execution_lock_digest, "Review Task child lock"),
    deadline_at: task.deadline_at,
    budget: task.budget
  };
  const parsed = { ...body, digest: sha256(stableJson(body)) };
  if (parsed.digest !== value.digest
    || packet.execution_worker_id !== parsed.execution_worker_id
    || packet.execution_result_digest !== parsed.execution_result_digest
    || packet.lineage_id !== parsed.lineage_id
    || packet.lineage_digest !== parsed.lineage_digest
    || packet.baseline_snapshot_digest !== parsed.baseline_snapshot_digest
    || packet.final_snapshot_digest !== parsed.final_snapshot_digest) {
    throw new Error("Review Task Envelope digest or subject identity is invalid.");
  }
  return parsed;
}

export function parseReviewDecision(input: unknown, changedPaths: string[]): ReviewDecision {
  const value = typeof input === "string"
    ? record(JSON.parse(input), "Review Decision")
    : record(input, "Review Decision");
  exactKeys(value, ["verdict", "summary", "findings"], "Review Decision");
  if (value.verdict !== "approved" && value.verdict !== "changes_required") {
    throw new Error("Review Decision verdict is invalid.");
  }
  if (!Array.isArray(value.findings) || value.findings.length > MAX_FINDINGS) {
    throw new Error("Review Decision findings are invalid.");
  }
  const allowedPaths = new Set(changedPaths);
  const findings = value.findings.map((finding, index) => {
    const item = record(finding, `Review finding ${index}`);
    exactKeys(item, ["priority", "path", "line", "title", "rationale"], `Review finding ${index}`);
    const priority = nonNegativeInteger(item.priority, `Review finding ${index} priority`);
    if (priority > 3) throw new Error(`Review finding ${index} priority is invalid.`);
    const path = identifier(item.path, `Review finding ${index} path`, 500);
    if (!allowedPaths.has(path)) throw new Error(`Review finding ${index} path is outside the review packet.`);
    const line = item.line === null ? null : positiveInteger(item.line, `Review finding ${index} line`);
    return {
      priority: priority as ReviewFinding["priority"],
      path,
      line,
      title: text(item.title, `Review finding ${index} title`, MAX_SHORT_TEXT),
      rationale: text(item.rationale, `Review finding ${index} rationale`, MAX_TEXT)
    };
  });
  if ((value.verdict === "approved") !== (findings.length === 0)) {
    throw new Error("Review Decision verdict contradicts its findings.");
  }
  return {
    verdict: value.verdict,
    summary: text(value.summary, "Review Decision summary", MAX_TEXT),
    findings
  };
}

export function materializeReviewResultEnvelope(
  input: Omit<ReviewResultEnvelope, "schema_version" | "result_kind" | "digest">
): ReviewResultEnvelope {
  if (input.status !== "completed" && input.status !== "failed") {
    throw new Error("Review Result status is invalid.");
  }
  const findings = input.findings.map((finding) => parseReviewFinding(finding));
  if (input.status === "completed") {
    if ((input.verdict !== "approved" && input.verdict !== "changes_required")
      || ((input.verdict === "approved") !== (findings.length === 0))) {
      throw new Error("Review Result verdict contradicts its findings.");
    }
  } else if (input.verdict !== null || findings.length > 0) {
    throw new Error("Failed Review Result cannot claim a verdict or findings.");
  }
  const actual = record(input.actual_execution, "Review Result actual execution");
  exactKeys(actual, [
    "execution_id", "execution_ordinal", "model_dispatch_ids", "provider", "model"
  ], "Review Result actual execution");
  const consumed = record(input.consumed, "Review Result consumed budget");
  exactKeys(consumed, ["output_tokens", "duration_ms"], "Review Result consumed budget");
  const body: Omit<ReviewResultEnvelope, "digest"> = {
    schema_version: RESULT_SCHEMA_VERSION,
    result_kind: "review",
    worker_id: identifier(input.worker_id, "Review Result worker id", 240),
    child_run_id: identifier(input.child_run_id, "Review Result child Run id", 240),
    status: input.status,
    verdict: input.verdict,
    summary: text(input.summary, "Review Result summary", MAX_TEXT),
    findings,
    task_envelope_digest: digest(input.task_envelope_digest, "Review Result Task"),
    review_packet_digest: digest(input.review_packet_digest, "Review Result packet"),
    execution_worker_id: identifier(input.execution_worker_id, "Review Result subject", 240),
    execution_result_digest: digest(input.execution_result_digest, "Review Result execution Result"),
    actual_execution_lock_digest: digest(input.actual_execution_lock_digest, "Review Result child lock"),
    actual_execution: {
      execution_id: identifier(actual.execution_id, "Review Result execution id", 240),
      execution_ordinal: positiveInteger(actual.execution_ordinal, "Review Result execution ordinal"),
      model_dispatch_ids: identifierArray(actual.model_dispatch_ids, "Review Result model dispatch ids"),
      provider: nullableIdentifier(actual.provider, "Review Result provider"),
      model: nullableIdentifier(actual.model, "Review Result model")
    },
    consumed: {
      output_tokens: nonNegativeInteger(consumed.output_tokens, "Review Result output tokens"),
      duration_ms: nonNegativeInteger(consumed.duration_ms, "Review Result duration")
    },
    created_at: timestamp(input.created_at, "Review Result created at")
  };
  return { ...body, digest: sha256(stableJson(body)) };
}

export function parseReviewResultEnvelope(input: unknown): ReviewResultEnvelope {
  const value = record(input, "Review Result Envelope");
  exactKeys(value, [
    "schema_version", "result_kind", "worker_id", "child_run_id", "status", "verdict",
    "summary", "findings", "task_envelope_digest", "review_packet_digest",
    "execution_worker_id", "execution_result_digest", "actual_execution_lock_digest",
    "actual_execution", "consumed", "created_at", "digest"
  ], "Review Result Envelope");
  if (value.schema_version !== RESULT_SCHEMA_VERSION || value.result_kind !== "review") {
    throw new Error("Review Result Envelope schema is invalid.");
  }
  const parsed = materializeReviewResultEnvelope({
    worker_id: value.worker_id as string,
    child_run_id: value.child_run_id as string,
    status: value.status as ReviewResultEnvelope["status"],
    verdict: value.verdict as ReviewResultEnvelope["verdict"],
    summary: value.summary as string,
    findings: value.findings as ReviewFinding[],
    task_envelope_digest: value.task_envelope_digest as string,
    review_packet_digest: value.review_packet_digest as string,
    execution_worker_id: value.execution_worker_id as string,
    execution_result_digest: value.execution_result_digest as string,
    actual_execution_lock_digest: value.actual_execution_lock_digest as string,
    actual_execution: value.actual_execution as ReviewResultEnvelope["actual_execution"],
    consumed: value.consumed as ReviewResultEnvelope["consumed"],
    created_at: value.created_at as string
  });
  if (parsed.digest !== value.digest) throw new Error("Review Result Envelope digest is invalid.");
  return parsed;
}

export function parseReviewWorkerInspection(input: unknown): ReviewWorkerInspection {
  const value = record(input, "Review Worker inspection");
  const task = parseReviewTaskEnvelope(value.task_envelope);
  const lock = parseExecutionLock(value.child_execution_lock);
  const result = value.result_envelope === null ? null : parseReviewResultEnvelope(value.result_envelope);
  if (value.status !== "queued" && value.status !== "running"
    && value.status !== "completed" && value.status !== "failed") {
    throw new Error("Review Worker status is invalid.");
  }
  const inspection: ReviewWorkerInspection = {
    id: identifier(value.id, "Review Worker id", 240),
    reservation_id: identifier(value.reservation_id, "Review Worker reservation id", 240),
    parent_run_id: identifier(value.parent_run_id, "Review Worker parent Run id", 240),
    parent_turn_id: identifier(value.parent_turn_id, "Review Worker parent Turn id", 240),
    status: value.status,
    task_envelope: task,
    child_execution_lock: lock,
    execution_worker_id: identifier(value.execution_worker_id, "Review Worker subject id", 240),
    child_session_id: nullableIdentifier(value.child_session_id, "Review Worker child Session"),
    child_run_id: nullableIdentifier(value.child_run_id, "Review Worker child Run"),
    result_envelope: result,
    result_delivered_to_turn_id: nullableIdentifier(
      value.result_delivered_to_turn_id,
      "Review Worker delivery Turn"
    ),
    lease_ordinal: nonNegativeInteger(value.lease_ordinal, "Review Worker lease ordinal"),
    lease_expires_at: value.lease_expires_at === null
      ? null
      : timestamp(value.lease_expires_at, "Review Worker lease expiry"),
    created_at: timestamp(value.created_at, "Review Worker created at"),
    updated_at: timestamp(value.updated_at, "Review Worker updated at")
  };
  if (task.parent_run_id !== inspection.parent_run_id
    || task.parent_turn_id !== inspection.parent_turn_id
    || task.execution_worker_id !== inspection.execution_worker_id
    || task.child_execution_lock_digest !== lock.digest
    || (result !== null && (result.worker_id !== inspection.id
      || result.child_run_id !== inspection.child_run_id
      || result.task_envelope_digest !== task.digest
      || result.review_packet_digest !== task.review_packet.digest
      || result.execution_worker_id !== task.execution_worker_id
      || result.execution_result_digest !== task.execution_result_digest
      || result.actual_execution_lock_digest !== lock.digest))) {
    throw new Error("Review Worker inspection identity is invalid.");
  }
  return inspection;
}

export function deriveReviewWorkerLock(
  parent: ExecutionLock,
  childActions: ExecutionLockInput["actions"],
  budget: ReviewTaskInput["budget"]
): ExecutionLock {
  return deriveDiscussionWorkerLock(parent, childActions, budget);
}

function parseReviewEvidencePacket(input: unknown): ReviewEvidencePacket {
  const value = record(input, "Review evidence packet");
  exactKeys(value, [
    "schema_version", "execution_worker_id", "execution_result_digest", "lineage_id",
    "lineage_digest", "baseline_snapshot_digest", "final_snapshot_digest",
    "changed_paths", "files", "digest"
  ], "Review evidence packet");
  if (value.schema_version !== REVIEW_PACKET_SCHEMA_VERSION || !Array.isArray(value.files)) {
    throw new Error("Review evidence packet schema is invalid.");
  }
  const changedPaths = identifierArray(
    value.changed_paths,
    "Review evidence changed paths",
    128,
    500,
    true
  );
  const files = value.files.map((file, index) => {
    const item = record(file, `Review evidence file ${index}`);
    exactKeys(
      item,
      ["path", "before_mode", "after_mode", "before", "after"],
      `Review evidence file ${index}`
    );
    return {
      path: identifier(item.path, `Review evidence file ${index} path`, 500),
      before_mode: nullableMode(item.before_mode, `Review evidence file ${index} before mode`),
      after_mode: nullableMode(item.after_mode, `Review evidence file ${index} after mode`),
      before: nullableText(item.before, `Review evidence file ${index} before`),
      after: nullableText(item.after, `Review evidence file ${index} after`)
    };
  });
  if (stableJson(files.map((file) => file.path)) !== stableJson(changedPaths)
    || files.some((file) => file.before_mode === file.after_mode && file.before === file.after)) {
    throw new Error("Review evidence packet file identity is invalid.");
  }
  const body = {
    schema_version: REVIEW_PACKET_SCHEMA_VERSION as typeof REVIEW_PACKET_SCHEMA_VERSION,
    execution_worker_id: identifier(value.execution_worker_id, "Review evidence subject", 240),
    execution_result_digest: digest(value.execution_result_digest, "Review evidence execution Result"),
    lineage_id: identifier(value.lineage_id, "Review evidence lineage id", 240),
    lineage_digest: digest(value.lineage_digest, "Review evidence lineage"),
    baseline_snapshot_digest: digest(value.baseline_snapshot_digest, "Review evidence baseline"),
    final_snapshot_digest: digest(value.final_snapshot_digest, "Review evidence final snapshot"),
    changed_paths: changedPaths,
    files
  };
  if (Buffer.byteLength(stableJson(body), "utf8") > REVIEW_EVIDENCE_PACKET_MAX_BYTES) {
    throw new Error("Review evidence packet exceeds its bounded size.");
  }
  const parsed = { ...body, digest: sha256(stableJson(body)) };
  if (parsed.digest !== value.digest) throw new Error("Review evidence packet digest is invalid.");
  return parsed;
}

function parseReviewFinding(input: unknown): ReviewFinding {
  const value = record(input, "Review finding");
  exactKeys(value, ["priority", "path", "line", "title", "rationale"], "Review finding");
  const priority = nonNegativeInteger(value.priority, "Review finding priority");
  if (priority > 3) throw new Error("Review finding priority is invalid.");
  return {
    priority: priority as ReviewFinding["priority"],
    path: identifier(value.path, "Review finding path", 500),
    line: value.line === null ? null : positiveInteger(value.line, "Review finding line"),
    title: text(value.title, "Review finding title", MAX_SHORT_TEXT),
    rationale: text(value.rationale, "Review finding rationale", MAX_TEXT)
  };
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object.`);
  return input as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  if (stableJson(Object.keys(value).sort()) !== stableJson([...keys].sort())) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function text(input: unknown, label: string, max: number): string {
  if (typeof input !== "string" || !input.trim() || input.trim().length > max) {
    throw new Error(`${label} is invalid.`);
  }
  return input.trim();
}

function nullableText(input: unknown, label: string): string | null {
  if (input === null) return null;
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  return input;
}

function nullableMode(input: unknown, label: string): string | null {
  if (input === null) return null;
  if (input !== "100644" && input !== "100755" && input !== "120000") {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function identifier(input: unknown, label: string, max: number): string {
  return text(input, label, max);
}

function nullableIdentifier(input: unknown, label: string): string | null {
  return input === null ? null : identifier(input, label, 240);
}

function digest(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input)) throw new Error(`${label} is invalid.`);
  return input;
}

function timestamp(input: unknown, label: string): string {
  if (typeof input !== "string" || !Number.isFinite(Date.parse(input))
    || new Date(input).toISOString() !== input) throw new Error(`${label} is invalid.`);
  return input;
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

function stringArray(
  input: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
  requireItem = false
): string[] {
  if (!Array.isArray(input) || input.length > maxItems || (requireItem && input.length === 0)) {
    throw new Error(`${label} is invalid.`);
  }
  const values = input.map((item) => text(item, label, maxLength));
  if (stableJson(values) !== stableJson([...new Set(values)])) throw new Error(`${label} contains duplicates.`);
  return values;
}

function identifierArray(
  input: unknown,
  label: string,
  maxItems = MAX_REFS,
  maxLength = 240,
  requireItem = false
): string[] {
  return stringArray(input, label, maxItems, maxLength, requireItem);
}

function digestArray(input: unknown, label: string): string[] {
  if (!Array.isArray(input) || input.length > MAX_REFS) throw new Error(`${label} is invalid.`);
  return input.map((item) => digest(item, label));
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
