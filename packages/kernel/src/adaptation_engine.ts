import {
  materializeEvaluationReceipt,
  materializeProcedureCandidate,
  type AdaptationActivationReceipt,
  type AdaptationInspection,
  type EvaluationReceipt,
  type ProcedureCandidateInput,
  type ProcedureObservationReceipt,
  type ProcedureRetirementReceipt,
  type ProcedureSelectionReceipt
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

  activate(candidateId: string): AdaptationActivationReceipt {
    return this.store.activateAdaptationCandidate(candidateId.trim());
  }

  selectForRun(runId: string, turnId: string): ProcedureSelectionReceipt {
    return this.store.selectActiveProcedure(runId.trim(), turnId.trim());
  }

  renderSelectedContext(selectionId: string): string {
    return this.store.renderSelectedProcedureContext(selectionId.trim());
  }

  observe(selectionId: string, effectReceiptId: string): ProcedureObservationReceipt {
    return this.store.observeProcedureSelection(selectionId.trim(), effectReceiptId.trim());
  }

  retire(candidateId: string, observationId?: string): ProcedureRetirementReceipt {
    return this.store.retireAdaptationCandidate(candidateId.trim(), observationId?.trim());
  }

  inspectActivation(activationId: string): AdaptationActivationReceipt | null {
    return this.store.inspectAdaptationActivation(activationId.trim());
  }

  inspectSelection(selectionId: string): ProcedureSelectionReceipt | null {
    return this.store.inspectProcedureSelection(selectionId.trim());
  }

  inspectObservation(observationId: string): ProcedureObservationReceipt | null {
    return this.store.inspectProcedureObservation(observationId.trim());
  }

  inspectRetirement(retirementId: string): ProcedureRetirementReceipt | null {
    return this.store.inspectProcedureRetirement(retirementId.trim());
  }

  private requireCandidate(candidateId: string): AdaptationInspection {
    const inspection = this.inspect(candidateId.trim());
    if (!inspection) throw new Error(`Adaptation Candidate not found: ${candidateId}`);
    return inspection;
  }
}
