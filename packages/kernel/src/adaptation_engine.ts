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
import type { JsonObject } from "./action_types.js";
import {
  ADAPTATION_EVALUATOR_VERSION,
  procedureReadinessChecks
} from "./adaptation_evaluation.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

export { ADAPTATION_EVALUATOR_VERSION } from "./adaptation_evaluation.js";

/**
 * The exact Growth Procedure binding a Kernel Run may receive.  It is created
 * once, before the first loop, and stays authoritative across continuations.
 */
export interface GrowthRunBinding {
  selection: ProcedureSelectionReceipt;
  context: string;
}

/**
 * Owns the runtime-facing half of Growth.  Candidate proposal, evaluation,
 * activation, observation, and retirement remain in AdaptationEngine; this
 * surface intentionally only binds an already-active artifact to one Run.
 */
export class GrowthLifecycle {
  constructor(private readonly store: SqliteRuntimeStore) {}

  /**
   * Bind the active procedure at initial Run creation.  A Run without an
   * active procedure records no binding, so a later activation cannot alter a
   * continuation of that Run.
   */
  bindInitialRun(runId: string, turnId: string): ProcedureSelectionReceipt | null {
    return this.store.bindInitialProcedureSelection(runId.trim(), turnId.trim());
  }

  /**
   * Read an existing binding only.  This never consults the active registry
   * and therefore cannot select a newly activated procedure on continuation.
   */
  readRunBinding(runId: string): GrowthRunBinding | null {
    const selection = this.store.readProcedureSelectionForRun(runId.trim());
    return selection ? this.bindingFor(selection) : null;
  }

  renderRuntimeContext(binding: GrowthRunBinding): JsonObject {
    return {
      selection_id: binding.selection.id,
      selection_digest: binding.selection.digest,
      target_slot: binding.selection.target_slot,
      version_id: binding.selection.version_id,
      artifact_digest: binding.selection.artifact_digest,
      candidate_id: binding.selection.candidate_id,
      candidate_digest: binding.selection.candidate_digest,
      context_digest: binding.selection.growth_context_digest,
      context: binding.context
    };
  }

  private bindingFor(selection: ProcedureSelectionReceipt): GrowthRunBinding {
    return {
      selection,
      context: this.store.renderSelectedProcedureContext(selection.id)
    };
  }
}

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
