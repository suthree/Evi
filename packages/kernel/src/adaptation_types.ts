import { createHash } from "node:crypto";
import { stableJson } from "./canonical_json.js";

const CANDIDATE_SCHEMA_VERSION = 1;
const EVALUATION_SCHEMA_VERSION = 1;
const ACTIVATION_SCHEMA_VERSION = 1;
const SELECTION_SCHEMA_VERSION = 1;
const OBSERVATION_SCHEMA_VERSION = 1;
const RETIREMENT_SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ITEMS = 32;
const MAX_ITEM_TEXT = 4_000;

export const PROCEDURE_RUNTIME_INSPECTION_SLOT = "procedure.runtime-inspection";

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

export interface AdaptationActivationReceipt {
  schema_version: typeof ACTIVATION_SCHEMA_VERSION;
  id: string;
  transition: "activated";
  candidate_id: string;
  candidate_digest: string;
  evaluation_id: string;
  evaluation_digest: string;
  target_slot: typeof PROCEDURE_RUNTIME_INSPECTION_SLOT;
  baseline: EvaluationBaseline;
  previous_version_id: string | null;
  previous_artifact_digest: string | null;
  activated_version_id: string;
  activated_artifact_digest: string;
  created_at: string;
  digest: string;
}

/**
 * A Run-scoped selection is immutable.  A later continuation may reuse it,
 * even if a newer Self Registry version becomes active in the meantime.
 */
export interface ProcedureSelectionReceipt {
  schema_version: typeof SELECTION_SCHEMA_VERSION;
  id: string;
  run_id: string;
  initial_turn_id: string;
  target_slot: typeof PROCEDURE_RUNTIME_INSPECTION_SLOT;
  version_id: string;
  artifact_digest: string;
  candidate_id: string;
  candidate_digest: string;
  growth_context_digest: string;
  created_at: string;
  digest: string;
}

export interface ProcedureObservationReceipt {
  schema_version: typeof OBSERVATION_SCHEMA_VERSION;
  id: string;
  selection_id: string;
  run_id: string;
  initial_turn_id: string;
  final_turn_id: string;
  target_slot: typeof PROCEDURE_RUNTIME_INSPECTION_SLOT;
  version_id: string;
  artifact_digest: string;
  candidate_id: string;
  candidate_digest: string;
  effect_receipt_id: string;
  effect_receipt_digest: string;
  outcome: "completed" | "failed";
  created_at: string;
  digest: string;
}

export type ProcedureRetirementReason =
  | "failed_evaluation"
  | "observed_failure"
  | "superseded";

export interface ProcedureRetirementReceipt {
  schema_version: typeof RETIREMENT_SCHEMA_VERSION;
  id: string;
  transition: "retired";
  target_slot: typeof PROCEDURE_RUNTIME_INSPECTION_SLOT;
  version_id: string;
  artifact_digest: string;
  candidate_id: string;
  reason: ProcedureRetirementReason;
  evaluation_id: string | null;
  observation_id: string | null;
  replacement_version_id: string | null;
  created_at: string;
  digest: string;
}

export interface AdaptationInspection {
  candidate: ProcedureCandidate;
  registry_version: SelfRegistryVersion;
  evaluations: EvaluationReceipt[];
  activation: AdaptationActivationReceipt | null;
  retirement: ProcedureRetirementReceipt | null;
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

export function renderProcedureGrowthContext(input: ProcedureCandidate): string {
  const candidate = parseProcedureCandidate(input);
  runtimeInspectionSlot(candidate.target_slot);
  return [
    `procedure=${candidate.target_slot}`,
    `candidate_digest=${candidate.digest}`,
    `name=${candidate.name}`,
    `summary=${candidate.summary}`,
    `trigger_conditions=${stableJson(candidate.trigger_conditions)}`,
    `steps=${stableJson(candidate.steps)}`,
    `expected_result=${candidate.expected_result}`,
    `verification_requirements=${stableJson(candidate.verification_requirements)}`,
    `failure_modes=${stableJson(candidate.failure_modes)}`,
    `rollback_rule=${candidate.rollback_rule}`
  ].join("\n");
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

export function materializeAdaptationActivationReceipt(input: {
  candidate: ProcedureCandidate;
  evaluation: EvaluationReceipt;
  previous_version: SelfRegistryVersion | null;
  activated_version: SelfRegistryVersion;
  created_at?: string;
}): AdaptationActivationReceipt {
  const candidate = parseProcedureCandidate(input.candidate);
  const evaluation = parseEvaluationReceipt(input.evaluation);
  const previous = input.previous_version === null ? null : parseSelfRegistryVersion(input.previous_version);
  const activated = parseSelfRegistryVersion(input.activated_version);
  const targetSlot = runtimeInspectionSlot(candidate.target_slot);
  if (evaluation.status !== "passed"
    || evaluation.candidate_id !== candidate.id
    || evaluation.candidate_digest !== candidate.digest
    || evaluation.target_slot !== targetSlot
    || activated.candidate_id !== candidate.id
    || activated.artifact_digest !== candidate.digest
    || activated.target_slot !== targetSlot
    || (previous !== null && previous.target_slot !== targetSlot)) {
    throw new Error("Adaptation Activation identity is invalid.");
  }
  const value: Omit<AdaptationActivationReceipt, "digest"> = {
    schema_version: ACTIVATION_SCHEMA_VERSION,
    id: activationId({
      candidate_id: candidate.id,
      candidate_digest: candidate.digest,
      evaluation_id: evaluation.id,
      evaluation_digest: evaluation.digest,
      target_slot: targetSlot,
      baseline: evaluation.baseline,
      previous_version_id: previous?.id ?? null,
      previous_artifact_digest: previous?.artifact_digest ?? null,
      activated_version_id: activated.id,
      activated_artifact_digest: activated.artifact_digest
    }),
    transition: "activated",
    candidate_id: candidate.id,
    candidate_digest: candidate.digest,
    evaluation_id: evaluation.id,
    evaluation_digest: evaluation.digest,
    target_slot: targetSlot,
    baseline: evaluation.baseline,
    previous_version_id: previous?.id ?? null,
    previous_artifact_digest: previous?.artifact_digest ?? null,
    activated_version_id: activated.id,
    activated_artifact_digest: activated.artifact_digest,
    created_at: timestamp(input.created_at ?? new Date().toISOString(), "Adaptation Activation created_at")
  };
  return { ...value, digest: sha256(stableJson(value)) };
}

export function parseAdaptationActivationReceipt(input: unknown): AdaptationActivationReceipt {
  const value = record(input, "Adaptation Activation");
  assertExactKeys(value, [
    "activated_artifact_digest", "activated_version_id", "baseline", "candidate_digest", "candidate_id",
    "created_at", "digest", "evaluation_digest", "evaluation_id", "id", "previous_artifact_digest",
    "previous_version_id", "schema_version", "target_slot", "transition"
  ], "Adaptation Activation");
  if (value.schema_version !== ACTIVATION_SCHEMA_VERSION || value.transition !== "activated") {
    throw new Error("Adaptation Activation schema is invalid.");
  }
  const withoutDigest: Omit<AdaptationActivationReceipt, "digest"> = {
    schema_version: ACTIVATION_SCHEMA_VERSION,
    id: requiredText(value.id, 80, "Adaptation Activation id"),
    transition: "activated",
    candidate_id: requiredText(value.candidate_id, 80, "Adaptation Activation candidate id"),
    candidate_digest: digest(value.candidate_digest, "Adaptation Activation candidate digest"),
    evaluation_id: requiredText(value.evaluation_id, 80, "Adaptation Activation evaluation id"),
    evaluation_digest: digest(value.evaluation_digest, "Adaptation Activation evaluation digest"),
    target_slot: runtimeInspectionSlot(value.target_slot),
    baseline: parseEvaluationBaseline(value.baseline),
    previous_version_id: nullableText(value.previous_version_id, 80, "Adaptation Activation previous version id"),
    previous_artifact_digest: nullableDigest(value.previous_artifact_digest, "Adaptation Activation previous artifact digest"),
    activated_version_id: requiredText(value.activated_version_id, 80, "Adaptation Activation version id"),
    activated_artifact_digest: digest(value.activated_artifact_digest, "Adaptation Activation artifact digest"),
    created_at: timestamp(value.created_at, "Adaptation Activation created_at")
  };
  if ((withoutDigest.previous_version_id === null) !== (withoutDigest.previous_artifact_digest === null)
    || withoutDigest.id !== activationId(activationIdentity(withoutDigest))
    || digest(value.digest, "Adaptation Activation digest") !== sha256(stableJson(withoutDigest))) {
    throw new Error("Adaptation Activation identity is invalid.");
  }
  return { ...withoutDigest, digest: value.digest as string };
}

export function materializeProcedureSelectionReceipt(input: {
  run_id: string;
  initial_turn_id: string;
  version: SelfRegistryVersion;
  candidate: ProcedureCandidate;
  created_at?: string;
}): ProcedureSelectionReceipt {
  const version = parseSelfRegistryVersion(input.version);
  const candidate = parseProcedureCandidate(input.candidate);
  const targetSlot = runtimeInspectionSlot(version.target_slot);
  if (version.target_slot !== PROCEDURE_RUNTIME_INSPECTION_SLOT
    || version.candidate_id !== candidate.id
    || version.artifact_digest !== candidate.digest
    || candidate.target_slot !== targetSlot) {
    throw new Error("Procedure Selection identity is invalid.");
  }
  const selectedRunId = runId(input.run_id, "Procedure Selection Run id");
  const selectedTurnId = turnId(input.initial_turn_id, "Procedure Selection initial Turn id");
  const value: Omit<ProcedureSelectionReceipt, "digest"> = {
    schema_version: SELECTION_SCHEMA_VERSION,
    id: selectionId(selectedRunId, version.target_slot),
    run_id: selectedRunId,
    initial_turn_id: selectedTurnId,
    target_slot: targetSlot,
    version_id: version.id,
    artifact_digest: version.artifact_digest,
    candidate_id: candidate.id,
    candidate_digest: candidate.digest,
    growth_context_digest: sha256(renderProcedureGrowthContext(candidate)),
    created_at: timestamp(input.created_at ?? new Date().toISOString(), "Procedure Selection created_at")
  };
  return { ...value, digest: sha256(stableJson(value)) };
}

export function parseProcedureSelectionReceipt(input: unknown): ProcedureSelectionReceipt {
  const value = record(input, "Procedure Selection");
  assertExactKeys(value, [
    "artifact_digest", "candidate_digest", "candidate_id", "created_at", "digest", "id",
    "growth_context_digest", "initial_turn_id", "run_id", "schema_version", "target_slot", "version_id"
  ], "Procedure Selection");
  if (value.schema_version !== SELECTION_SCHEMA_VERSION) {
    throw new Error("Procedure Selection schema is invalid.");
  }
  const withoutDigest: Omit<ProcedureSelectionReceipt, "digest"> = {
    schema_version: SELECTION_SCHEMA_VERSION,
    id: requiredText(value.id, 80, "Procedure Selection id"),
    run_id: runId(value.run_id, "Procedure Selection Run id"),
    initial_turn_id: turnId(value.initial_turn_id, "Procedure Selection initial Turn id"),
    target_slot: runtimeInspectionSlot(value.target_slot),
    version_id: requiredText(value.version_id, 80, "Procedure Selection version id"),
    artifact_digest: digest(value.artifact_digest, "Procedure Selection artifact digest"),
    candidate_id: requiredText(value.candidate_id, 80, "Procedure Selection candidate id"),
    candidate_digest: digest(value.candidate_digest, "Procedure Selection candidate digest"),
    growth_context_digest: digest(value.growth_context_digest, "Procedure Selection Growth Context digest"),
    created_at: timestamp(value.created_at, "Procedure Selection created_at")
  };
  if (withoutDigest.id !== selectionId(withoutDigest.run_id, withoutDigest.target_slot)
    || digest(value.digest, "Procedure Selection digest") !== sha256(stableJson(withoutDigest))) {
    throw new Error("Procedure Selection identity is invalid.");
  }
  return { ...withoutDigest, digest: value.digest as string };
}

export function materializeProcedureObservationReceipt(input: {
  selection: ProcedureSelectionReceipt;
  final_turn_id: string;
  effect_receipt_id: string;
  effect_receipt_digest: string;
  outcome: "completed" | "failed";
  created_at?: string;
}): ProcedureObservationReceipt {
  const selection = parseProcedureSelectionReceipt(input.selection);
  const finalTurnId = turnId(input.final_turn_id, "Procedure Observation final Turn id");
  const value: Omit<ProcedureObservationReceipt, "digest"> = {
    schema_version: OBSERVATION_SCHEMA_VERSION,
    id: observationId({
      selection_id: selection.id,
      effect_receipt_id: requiredText(input.effect_receipt_id, 80, "Procedure Observation Effect Receipt id"),
      effect_receipt_digest: digest(input.effect_receipt_digest, "Procedure Observation Effect Receipt digest")
    }),
    selection_id: selection.id,
    run_id: selection.run_id,
    initial_turn_id: selection.initial_turn_id,
    final_turn_id: finalTurnId,
    target_slot: selection.target_slot,
    version_id: selection.version_id,
    artifact_digest: selection.artifact_digest,
    candidate_id: selection.candidate_id,
    candidate_digest: selection.candidate_digest,
    effect_receipt_id: requiredText(input.effect_receipt_id, 80, "Procedure Observation Effect Receipt id"),
    effect_receipt_digest: digest(input.effect_receipt_digest, "Procedure Observation Effect Receipt digest"),
    outcome: input.outcome,
    created_at: timestamp(input.created_at ?? new Date().toISOString(), "Procedure Observation created_at")
  };
  return { ...value, digest: sha256(stableJson(value)) };
}

export function parseProcedureObservationReceipt(input: unknown): ProcedureObservationReceipt {
  const value = record(input, "Procedure Observation");
  assertExactKeys(value, [
    "artifact_digest", "candidate_digest", "candidate_id", "created_at", "digest", "final_turn_id",
    "effect_receipt_digest", "effect_receipt_id", "id", "initial_turn_id", "outcome", "run_id",
    "schema_version", "selection_id", "target_slot", "version_id"
  ], "Procedure Observation");
  if (value.schema_version !== OBSERVATION_SCHEMA_VERSION
    || (value.outcome !== "completed" && value.outcome !== "failed")) {
    throw new Error("Procedure Observation schema is invalid.");
  }
  const withoutDigest: Omit<ProcedureObservationReceipt, "digest"> = {
    schema_version: OBSERVATION_SCHEMA_VERSION,
    id: requiredText(value.id, 80, "Procedure Observation id"),
    selection_id: requiredText(value.selection_id, 80, "Procedure Observation selection id"),
    run_id: runId(value.run_id, "Procedure Observation Run id"),
    initial_turn_id: turnId(value.initial_turn_id, "Procedure Observation initial Turn id"),
    final_turn_id: turnId(value.final_turn_id, "Procedure Observation final Turn id"),
    target_slot: runtimeInspectionSlot(value.target_slot),
    version_id: requiredText(value.version_id, 80, "Procedure Observation version id"),
    artifact_digest: digest(value.artifact_digest, "Procedure Observation artifact digest"),
    candidate_id: requiredText(value.candidate_id, 80, "Procedure Observation candidate id"),
    candidate_digest: digest(value.candidate_digest, "Procedure Observation candidate digest"),
    effect_receipt_id: requiredText(value.effect_receipt_id, 80, "Procedure Observation Effect Receipt id"),
    effect_receipt_digest: digest(value.effect_receipt_digest, "Procedure Observation Effect Receipt digest"),
    outcome: value.outcome,
    created_at: timestamp(value.created_at, "Procedure Observation created_at")
  };
  if (withoutDigest.id !== observationId({
    selection_id: withoutDigest.selection_id,
    effect_receipt_id: withoutDigest.effect_receipt_id,
    effect_receipt_digest: withoutDigest.effect_receipt_digest
  })
    || digest(value.digest, "Procedure Observation digest") !== sha256(stableJson(withoutDigest))) {
    throw new Error("Procedure Observation identity is invalid.");
  }
  return { ...withoutDigest, digest: value.digest as string };
}

export function materializeProcedureRetirementReceipt(input: {
  version: SelfRegistryVersion;
  reason: ProcedureRetirementReason;
  evaluation_id?: string | null;
  observation_id?: string | null;
  replacement_version_id?: string | null;
  created_at?: string;
}): ProcedureRetirementReceipt {
  const version = parseSelfRegistryVersion(input.version);
  const targetSlot = runtimeInspectionSlot(version.target_slot);
  const evaluationId = nullableText(input.evaluation_id ?? null, 80, "Procedure Retirement evaluation id");
  const observationId = nullableText(input.observation_id ?? null, 80, "Procedure Retirement observation id");
  const replacementVersionId = nullableText(input.replacement_version_id ?? null, 80, "Procedure Retirement replacement version id");
  if (!isRetirementReason(input.reason)
    || (input.reason === "failed_evaluation" && (evaluationId === null || observationId !== null || replacementVersionId !== null))
    || (input.reason === "observed_failure" && (evaluationId !== null || observationId === null || replacementVersionId !== null))
    || (input.reason === "superseded" && (evaluationId !== null || observationId !== null || replacementVersionId === null))) {
    throw new Error("Procedure Retirement identity is invalid.");
  }
  const value: Omit<ProcedureRetirementReceipt, "digest"> = {
    schema_version: RETIREMENT_SCHEMA_VERSION,
    id: retirementId({
      version_id: version.id,
      artifact_digest: version.artifact_digest,
      candidate_id: version.candidate_id,
      reason: input.reason,
      evaluation_id: evaluationId,
      observation_id: observationId,
      replacement_version_id: replacementVersionId
    }),
    transition: "retired",
    target_slot: targetSlot,
    version_id: version.id,
    artifact_digest: version.artifact_digest,
    candidate_id: version.candidate_id,
    reason: input.reason,
    evaluation_id: evaluationId,
    observation_id: observationId,
    replacement_version_id: replacementVersionId,
    created_at: timestamp(input.created_at ?? new Date().toISOString(), "Procedure Retirement created_at")
  };
  return { ...value, digest: sha256(stableJson(value)) };
}

export function parseProcedureRetirementReceipt(input: unknown): ProcedureRetirementReceipt {
  const value = record(input, "Procedure Retirement");
  assertExactKeys(value, [
    "artifact_digest", "candidate_id", "created_at", "digest", "evaluation_id", "id", "observation_id",
    "reason", "replacement_version_id", "schema_version", "target_slot", "transition", "version_id"
  ], "Procedure Retirement");
  if (value.schema_version !== RETIREMENT_SCHEMA_VERSION || value.transition !== "retired" || !isRetirementReason(value.reason)) {
    throw new Error("Procedure Retirement schema is invalid.");
  }
  const withoutDigest: Omit<ProcedureRetirementReceipt, "digest"> = {
    schema_version: RETIREMENT_SCHEMA_VERSION,
    id: requiredText(value.id, 80, "Procedure Retirement id"),
    transition: "retired",
    target_slot: runtimeInspectionSlot(value.target_slot),
    version_id: requiredText(value.version_id, 80, "Procedure Retirement version id"),
    artifact_digest: digest(value.artifact_digest, "Procedure Retirement artifact digest"),
    candidate_id: requiredText(value.candidate_id, 80, "Procedure Retirement candidate id"),
    reason: value.reason,
    evaluation_id: nullableText(value.evaluation_id, 80, "Procedure Retirement evaluation id"),
    observation_id: nullableText(value.observation_id, 80, "Procedure Retirement observation id"),
    replacement_version_id: nullableText(value.replacement_version_id, 80, "Procedure Retirement replacement version id"),
    created_at: timestamp(value.created_at, "Procedure Retirement created_at")
  };
  const identity = retirementIdentity(withoutDigest);
  if (!retirementShapeIsValid(withoutDigest)
    || withoutDigest.id !== retirementId(identity)
    || digest(value.digest, "Procedure Retirement digest") !== sha256(stableJson(withoutDigest))) {
    throw new Error("Procedure Retirement identity is invalid.");
  }
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

function activationIdentity(value: Pick<AdaptationActivationReceipt,
  "candidate_id" | "candidate_digest" | "evaluation_id" | "evaluation_digest" | "target_slot"
  | "baseline" | "previous_version_id" | "previous_artifact_digest" | "activated_version_id"
  | "activated_artifact_digest">): Record<string, unknown> {
  return {
    candidate_id: value.candidate_id,
    candidate_digest: value.candidate_digest,
    evaluation_id: value.evaluation_id,
    evaluation_digest: value.evaluation_digest,
    target_slot: value.target_slot,
    baseline: value.baseline,
    previous_version_id: value.previous_version_id,
    previous_artifact_digest: value.previous_artifact_digest,
    activated_version_id: value.activated_version_id,
    activated_artifact_digest: value.activated_artifact_digest
  };
}

function activationId(identity: Record<string, unknown>): string {
  return `activation_${sha256(stableJson(identity)).slice(0, 32)}`;
}

function selectionId(runIdValue: string, targetSlotValue: string): string {
  return `selection_${sha256(stableJson({ run_id: runIdValue, target_slot: targetSlotValue })).slice(0, 32)}`;
}

function observationId(identity: {
  selection_id: string;
  effect_receipt_id: string;
  effect_receipt_digest: string;
}): string {
  return `observation_${sha256(stableJson(identity)).slice(0, 32)}`;
}

function retirementIdentity(value: Pick<ProcedureRetirementReceipt,
  "version_id" | "artifact_digest" | "candidate_id" | "reason" | "evaluation_id"
  | "observation_id" | "replacement_version_id">): Record<string, unknown> {
  return {
    version_id: value.version_id,
    artifact_digest: value.artifact_digest,
    candidate_id: value.candidate_id,
    reason: value.reason,
    evaluation_id: value.evaluation_id,
    observation_id: value.observation_id,
    replacement_version_id: value.replacement_version_id
  };
}

function retirementId(identity: Record<string, unknown>): string {
  return `retirement_${sha256(stableJson(identity)).slice(0, 32)}`;
}

function retirementShapeIsValid(value: Pick<ProcedureRetirementReceipt,
  "reason" | "evaluation_id" | "observation_id" | "replacement_version_id">): boolean {
  return (value.reason === "failed_evaluation"
      && value.evaluation_id !== null && value.observation_id === null && value.replacement_version_id === null)
    || (value.reason === "observed_failure"
      && value.evaluation_id === null && value.observation_id !== null && value.replacement_version_id === null)
    || (value.reason === "superseded"
      && value.evaluation_id === null && value.observation_id === null && value.replacement_version_id !== null);
}

function isRetirementReason(value: unknown): value is ProcedureRetirementReason {
  return value === "failed_evaluation" || value === "observed_failure" || value === "superseded";
}

function runId(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^run_[a-f0-9]{32}$/u.test(input)) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function turnId(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^turn_[a-f0-9]{32}$/u.test(input)) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function nullableText(input: unknown, max: number, label: string): string | null {
  if (input === null) return null;
  return requiredText(input, max, label);
}

function nullableDigest(input: unknown, label: string): string | null {
  if (input === null) return null;
  return digest(input, label);
}

function runtimeInspectionSlot(input: unknown): typeof PROCEDURE_RUNTIME_INSPECTION_SLOT {
  if (input !== PROCEDURE_RUNTIME_INSPECTION_SLOT) {
    throw new Error(`Growth Lifecycle target slot must be ${PROCEDURE_RUNTIME_INSPECTION_SLOT}.`);
  }
  return PROCEDURE_RUNTIME_INSPECTION_SLOT;
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
