import { createHash } from "node:crypto";
import { stableJson } from "./canonical_json.js";

const CANDIDATE_SCHEMA_VERSION = 1;
const EVALUATION_SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ITEMS = 32;
const MAX_ITEM_TEXT = 4_000;

export interface ProcedureCandidateInput {
  target_slot: string;
  name: string;
  summary: string;
  trigger_conditions: string[];
  steps: string[];
  expected_result: string;
  verification_requirements: string[];
  failure_modes: string[];
  rollback_rule: string;
  evidence_run_ids: string[];
}

export interface ProcedureCandidate {
  schema_version: typeof CANDIDATE_SCHEMA_VERSION;
  id: string;
  kind: "procedure";
  scope: "local_node";
  lifecycle: "inactive";
  target_slot: string;
  name: string;
  summary: string;
  trigger_conditions: string[];
  steps: string[];
  expected_result: string;
  verification_requirements: string[];
  failure_modes: string[];
  rollback_rule: string;
  evidence_run_ids: string[];
  content_digest: string;
  created_at: string;
  digest: string;
}

export interface SelfRegistryVersion {
  id: string;
  target_slot: string;
  artifact_kind: "procedure";
  state: "inactive" | "active" | "retired";
  candidate_id: string;
  artifact_digest: string;
  created_at: string;
  updated_at: string;
}

export interface EvaluationCheck {
  name: string;
  status: "passed" | "failed";
  reason: string;
}

export interface EvaluationBaseline {
  kind: "none" | "self_registry_version";
  version_id: string | null;
  digest: string | null;
}

export interface EvaluationReceipt {
  schema_version: typeof EVALUATION_SCHEMA_VERSION;
  id: string;
  candidate_id: string;
  candidate_digest: string;
  target_slot: string;
  baseline: EvaluationBaseline;
  evaluator_version: string;
  checks: EvaluationCheck[];
  evidence_run_ids: string[];
  status: "passed" | "failed";
  created_at: string;
  digest: string;
}

export interface AdaptationInspection {
  candidate: ProcedureCandidate;
  registry_version: SelfRegistryVersion;
  evaluations: EvaluationReceipt[];
}

export function normalizeProcedureCandidateInput(input: unknown): ProcedureCandidateInput {
  const value = record(input, "Procedure Candidate");
  assertExactKeys(value, [
    "evidence_run_ids",
    "expected_result",
    "failure_modes",
    "name",
    "rollback_rule",
    "steps",
    "summary",
    "target_slot",
    "trigger_conditions",
    "verification_requirements"
  ], "Procedure Candidate");
  const normalized = {
    target_slot: targetSlot(value.target_slot),
    name: requiredText(value.name, 120, "Procedure Candidate name"),
    summary: requiredText(value.summary, 1_000, "Procedure Candidate summary"),
    trigger_conditions: textArray(value.trigger_conditions, "trigger conditions"),
    steps: textArray(value.steps, "steps"),
    expected_result: optionalText(value.expected_result, MAX_ITEM_TEXT, "expected result"),
    verification_requirements: textArray(value.verification_requirements, "verification requirements"),
    failure_modes: textArray(value.failure_modes, "failure modes"),
    rollback_rule: optionalText(value.rollback_rule, MAX_ITEM_TEXT, "rollback rule"),
    evidence_run_ids: evidenceRunIds(value.evidence_run_ids)
  };
  rejectCredentialShapedText(normalized);
  boundedBody(normalized, "Procedure Candidate");
  return normalized;
}

export function materializeProcedureCandidate(
  input: ProcedureCandidateInput,
  createdAt = new Date().toISOString()
): ProcedureCandidate {
  const normalized = normalizeProcedureCandidateInput(input);
  const contentDigest = sha256(stableJson(normalized));
  const value: Omit<ProcedureCandidate, "digest"> = {
    schema_version: CANDIDATE_SCHEMA_VERSION,
    id: `candidate_${contentDigest.slice(0, 32)}`,
    kind: "procedure",
    scope: "local_node",
    lifecycle: "inactive",
    ...normalized,
    content_digest: contentDigest,
    created_at: timestamp(createdAt, "Procedure Candidate created_at")
  };
  return { ...value, digest: sha256(stableJson(value)) };
}

export function parseProcedureCandidate(input: unknown): ProcedureCandidate {
  const value = record(input, "Procedure Candidate");
  assertExactKeys(value, [
    "content_digest",
    "created_at",
    "digest",
    "evidence_run_ids",
    "expected_result",
    "failure_modes",
    "id",
    "kind",
    "lifecycle",
    "name",
    "rollback_rule",
    "schema_version",
    "scope",
    "steps",
    "summary",
    "target_slot",
    "trigger_conditions",
    "verification_requirements"
  ], "Procedure Candidate");
  if (value.schema_version !== CANDIDATE_SCHEMA_VERSION
    || value.kind !== "procedure"
    || value.scope !== "local_node"
    || value.lifecycle !== "inactive") {
    throw new Error("Procedure Candidate schema is invalid.");
  }
  const parsed = materializeProcedureCandidate({
    target_slot: value.target_slot as string,
    name: value.name as string,
    summary: value.summary as string,
    trigger_conditions: value.trigger_conditions as string[],
    steps: value.steps as string[],
    expected_result: value.expected_result as string,
    verification_requirements: value.verification_requirements as string[],
    failure_modes: value.failure_modes as string[],
    rollback_rule: value.rollback_rule as string,
    evidence_run_ids: value.evidence_run_ids as string[]
  }, value.created_at as string);
  if (parsed.id !== value.id
    || parsed.content_digest !== value.content_digest
    || parsed.digest !== value.digest) {
    throw new Error("Procedure Candidate identity is invalid.");
  }
  return parsed;
}

export function materializeEvaluationReceipt(input: {
  candidate: ProcedureCandidate;
  baseline: EvaluationBaseline;
  evaluator_version: string;
  checks: EvaluationCheck[];
  created_at?: string;
}): EvaluationReceipt {
  const candidate = parseProcedureCandidate(input.candidate);
  const baseline = parseEvaluationBaseline(input.baseline);
  const evaluatorVersion = requiredText(input.evaluator_version, 80, "Evaluation evaluator version");
  const checks = input.checks.map(parseEvaluationCheck);
  if (checks.length === 0 || checks.length > MAX_ITEMS) {
    throw new Error("Evaluation checks are invalid.");
  }
  const identityDigest = sha256(stableJson({
    candidate_digest: candidate.digest,
    baseline,
    evaluator_version: evaluatorVersion
  }));
  const value: Omit<EvaluationReceipt, "digest"> = {
    schema_version: EVALUATION_SCHEMA_VERSION,
    id: `evaluation_${identityDigest.slice(0, 32)}`,
    candidate_id: candidate.id,
    candidate_digest: candidate.digest,
    target_slot: candidate.target_slot,
    baseline,
    evaluator_version: evaluatorVersion,
    checks,
    evidence_run_ids: [...candidate.evidence_run_ids],
    status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
    created_at: timestamp(input.created_at ?? new Date().toISOString(), "Evaluation created_at")
  };
  boundedBody(value, "Evaluation Receipt");
  return { ...value, digest: sha256(stableJson(value)) };
}

export function parseEvaluationReceipt(input: unknown): EvaluationReceipt {
  const value = record(input, "Evaluation Receipt");
  assertExactKeys(value, [
    "baseline",
    "candidate_digest",
    "candidate_id",
    "checks",
    "created_at",
    "digest",
    "evaluator_version",
    "evidence_run_ids",
    "id",
    "schema_version",
    "status",
    "target_slot"
  ], "Evaluation Receipt");
  if (value.schema_version !== EVALUATION_SCHEMA_VERSION) {
    throw new Error("Evaluation Receipt schema is invalid.");
  }
  if (value.status !== "passed" && value.status !== "failed") {
    throw new Error("Evaluation status is invalid.");
  }
  const checks = (value.checks as EvaluationCheck[]).map(parseEvaluationCheck);
  const baseline = parseEvaluationBaseline(value.baseline);
  const withoutDigest: Omit<EvaluationReceipt, "digest"> = {
    schema_version: EVALUATION_SCHEMA_VERSION,
    id: requiredText(value.id, 80, "Evaluation id"),
    candidate_id: requiredText(value.candidate_id, 80, "Evaluation candidate id"),
    candidate_digest: digest(value.candidate_digest, "Evaluation candidate digest"),
    target_slot: targetSlot(value.target_slot),
    baseline,
    evaluator_version: requiredText(value.evaluator_version, 80, "Evaluation evaluator version"),
    checks,
    evidence_run_ids: evidenceRunIds(value.evidence_run_ids),
    status: value.status,
    created_at: timestamp(value.created_at, "Evaluation created_at")
  };
  const identityDigest = sha256(stableJson({
    candidate_digest: withoutDigest.candidate_digest,
    baseline: withoutDigest.baseline,
    evaluator_version: withoutDigest.evaluator_version
  }));
  const expectedStatus = checks.every((check) => check.status === "passed") ? "passed" : "failed";
  if (withoutDigest.id !== `evaluation_${identityDigest.slice(0, 32)}`
    || withoutDigest.status !== expectedStatus
    || digest(value.digest, "Evaluation digest") !== sha256(stableJson(withoutDigest))) {
    throw new Error("Evaluation Receipt identity is invalid.");
  }
  boundedBody(withoutDigest, "Evaluation Receipt");
  return { ...withoutDigest, digest: value.digest as string };
}

export function parseSelfRegistryVersion(input: unknown): SelfRegistryVersion {
  const value = record(input, "Self Registry version");
  assertExactKeys(value, [
    "artifact_digest",
    "artifact_kind",
    "candidate_id",
    "created_at",
    "id",
    "state",
    "target_slot",
    "updated_at"
  ], "Self Registry version");
  if (value.artifact_kind !== "procedure"
    || (value.state !== "inactive" && value.state !== "active" && value.state !== "retired")) {
    throw new Error("Self Registry version schema is invalid.");
  }
  return {
    id: requiredText(value.id, 80, "Self Registry version id"),
    target_slot: targetSlot(value.target_slot),
    artifact_kind: "procedure",
    state: value.state,
    candidate_id: requiredText(value.candidate_id, 80, "Self Registry candidate id"),
    artifact_digest: digest(value.artifact_digest, "Self Registry artifact digest"),
    created_at: timestamp(value.created_at, "Self Registry created_at"),
    updated_at: timestamp(value.updated_at, "Self Registry updated_at")
  };
}

export function selfRegistryVersionFor(candidate: ProcedureCandidate): SelfRegistryVersion {
  const parsed = parseProcedureCandidate(candidate);
  return {
    id: `self_version_${parsed.content_digest.slice(0, 32)}`,
    target_slot: parsed.target_slot,
    artifact_kind: "procedure",
    state: "inactive",
    candidate_id: parsed.id,
    artifact_digest: parsed.digest,
    created_at: parsed.created_at,
    updated_at: parsed.created_at
  };
}

function parseEvaluationBaseline(input: unknown): EvaluationBaseline {
  const value = record(input, "Evaluation baseline");
  assertExactKeys(value, ["digest", "kind", "version_id"], "Evaluation baseline");
  if (value.kind === "none" && value.version_id === null && value.digest === null) {
    return { kind: "none", version_id: null, digest: null };
  }
  if (value.kind === "self_registry_version"
    && typeof value.version_id === "string"
    && typeof value.digest === "string") {
    return {
      kind: "self_registry_version",
      version_id: requiredText(value.version_id, 80, "Evaluation baseline version"),
      digest: digest(value.digest, "Evaluation baseline digest")
    };
  }
  throw new Error("Evaluation baseline identity is invalid.");
}

function parseEvaluationCheck(input: unknown): EvaluationCheck {
  const value = record(input, "Evaluation check");
  assertExactKeys(value, ["name", "reason", "status"], "Evaluation check");
  if (value.status !== "passed" && value.status !== "failed") {
    throw new Error("Evaluation check status is invalid.");
  }
  return {
    name: requiredText(value.name, 80, "Evaluation check name"),
    status: value.status,
    reason: requiredText(value.reason, 500, "Evaluation check reason")
  };
}

function evidenceRunIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_ITEMS) {
    throw new Error("Procedure Candidate evidence Run ids are invalid.");
  }
  const values = input.map((value) => {
    if (typeof value !== "string" || !/^run_[a-f0-9]{32}$/u.test(value)) {
      throw new Error("Procedure Candidate evidence Run id is invalid.");
    }
    return value;
  });
  if (new Set(values).size !== values.length) {
    throw new Error("Procedure Candidate evidence Run ids must be unique.");
  }
  return [...values].sort();
}

function textArray(input: unknown, label: string): string[] {
  if (!Array.isArray(input) || input.length > MAX_ITEMS) {
    throw new Error(`Procedure Candidate ${label} are invalid.`);
  }
  return input.map((value) => requiredText(value, MAX_ITEM_TEXT, `Procedure Candidate ${label}`));
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort();
  if (stableJson(actual) !== stableJson([...keys].sort())) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function targetSlot(input: unknown): string {
  const value = requiredText(input, 80, "Procedure Candidate target slot");
  if (!/^[a-z][a-z0-9._-]{1,79}$/u.test(value)) {
    throw new Error("Procedure Candidate target slot is invalid.");
  }
  return value;
}

function requiredText(input: unknown, max: number, label: string): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const value = input.trim();
  if (!value || value.length > max) throw new Error(`${label} is invalid.`);
  return value;
}

function optionalText(input: unknown, max: number, label: string): string {
  if (typeof input !== "string") throw new Error(`Procedure Candidate ${label} is invalid.`);
  const value = input.trim();
  if (value.length > max) throw new Error(`Procedure Candidate ${label} is invalid.`);
  return value;
}

function digest(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input)) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function timestamp(input: unknown, label: string): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const parsed = Date.parse(input);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== input) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function boundedBody(input: unknown, label: string): void {
  if (Buffer.byteLength(stableJson(input), "utf8") > MAX_BODY_BYTES) {
    throw new Error(`${label} exceeds ${MAX_BODY_BYTES} bytes.`);
  }
}

function rejectCredentialShapedText(input: ProcedureCandidateInput): void {
  const text = stableJson(input);
  const credentialPatterns = [
    /\b(?:sk|gh[pousr]|xox[baprs])-[A-Za-z0-9_-]{12,}\b/u,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/iu,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    /\b[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET)=[^\s"']+/u
  ];
  if (credentialPatterns.some((pattern) => pattern.test(text))) {
    throw new Error("Procedure Candidate contains credential-shaped text.");
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
