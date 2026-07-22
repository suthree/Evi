import {
  materializeEvaluationReceipt,
  materializeProcedureCandidate,
  type AdaptationInspection,
  type EvaluationReceipt,
  type ProcedureCandidateInput
} from "./adaptation_types.js";
import {
  ADAPTATION_EVALUATOR_VERSION,
  procedureReadinessChecks
} from "./adaptation_evaluation.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

export { ADAPTATION_EVALUATOR_VERSION } from "./adaptation_evaluation.js";

export class AdaptationEngine {
  constructor(private readonly store: SqliteRuntimeStore) {}

  propose(input: ProcedureCandidateInput): AdaptationInspection {
    return this.store.proposeAdaptationCandidate(materializeProcedureCandidate(input));
  }

  evaluate(candidateId: string): EvaluationReceipt {
    const inspection = this.requireCandidate(candidateId);
    const receipt = materializeEvaluationReceipt({
      candidate: inspection.candidate,
      baseline: this.store.getAdaptationBaseline(inspection.candidate.target_slot),
      evaluator_version: ADAPTATION_EVALUATOR_VERSION,
      checks: procedureReadinessChecks(inspection.candidate)
    });
    return this.store.recordAdaptationEvaluation(receipt);
  }

  inspect(candidateId: string): AdaptationInspection | null {
    return this.store.inspectAdaptationCandidate(candidateId);
  }

  inspectEvaluation(evaluationId: string): EvaluationReceipt | null {
    return this.store.inspectAdaptationEvaluation(evaluationId);
  }

  private requireCandidate(candidateId: string): AdaptationInspection {
    const inspection = this.inspect(candidateId.trim());
    if (!inspection) throw new Error(`Adaptation Candidate not found: ${candidateId}`);
    return inspection;
  }
}
