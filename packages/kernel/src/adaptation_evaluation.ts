import { stableJson } from "./canonical_json.js";
import type {
  EvaluationCheck,
  EvaluationReceipt,
  ProcedureCandidate
} from "./adaptation_types.js";

export const ADAPTATION_EVALUATOR_VERSION = "procedure-readiness-v1";

export function procedureReadinessChecks(candidate: ProcedureCandidate): EvaluationCheck[] {
  return [
    check("completed_run_evidence", candidate.evidence_run_ids.length > 0,
      "Candidate cites at least one completed Run verified by the SQLite authority."),
    check("trigger_coverage", candidate.trigger_conditions.length > 0,
      "Candidate declares at least one reusable trigger condition."),
    check("bounded_steps", candidate.steps.length > 0,
      "Candidate declares at least one bounded procedure step."),
    check("expected_result", candidate.expected_result.length > 0,
      "Candidate declares an expected result."),
    check("verification_contract", candidate.verification_requirements.length > 0,
      "Candidate declares at least one verification requirement."),
    check("failure_contract", candidate.failure_modes.length > 0,
      "Candidate declares at least one known failure mode."),
    check("rollback_contract", candidate.rollback_rule.length > 0,
      "Candidate declares a rollback or retirement rule."),
    check("local_scope", candidate.scope === "local_node",
      "Candidate remains scoped to the local node and inactive Self Registry slot.")
  ];
}

export function assertCanonicalProcedureEvaluation(
  candidate: ProcedureCandidate,
  receipt: EvaluationReceipt
): void {
  if (receipt.evaluator_version !== ADAPTATION_EVALUATOR_VERSION
    || stableJson(receipt.checks) !== stableJson(procedureReadinessChecks(candidate))) {
    throw new Error(`Adaptation Evaluation policy drifted: ${receipt.id}`);
  }
}

function check(name: string, passed: boolean, reason: string): EvaluationCheck {
  return { name, status: passed ? "passed" : "failed", reason };
}
