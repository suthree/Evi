import { join } from "node:path";
import {
  AdaptationEngine,
  RuntimeSchemaIncompatibleError,
  RuntimeStateProfileIncompatibleError,
  SqliteRuntimeStore,
  type AdaptationInspection,
  type EvaluationReceipt,
  type ProcedureCandidateInput
} from "../../../packages/kernel/src/index.js";
import { DEFAULT_VNEXT_STATE_ROOT } from "./vnext_run.js";
import {
  resolveIsolatedVNextSqlite,
  type VNextStatePathBoundary
} from "./vnext_state.js";

export const VNEXT_ADAPTATION_MARKER = "vnext_adaptation";
export type VNextAdaptationAction = "propose" | "evaluate" | "inspect";

export interface VNextAdaptationRequest extends Partial<ProcedureCandidateInput> {
  action: VNextAdaptationAction;
  candidate_id?: string;
  evaluation_id?: string;
  state_root?: string;
}

export interface VNextAdaptationEnvelope {
  adaptation: {
    schema_version: 1;
    marker: typeof VNEXT_ADAPTATION_MARKER;
    surface: "cli";
    action: VNextAdaptationAction | null;
    status: "inactive" | "active" | "retired" | "passed" | "failed" | "not_found" | "error";
    candidate_id?: string;
    evaluation_id?: string;
    result?: AdaptationInspection | EvaluationReceipt;
    diagnostic?: { code: string; message: string };
    boundary: string;
  };
}

export interface VNextAdaptationDependencies {
  path_boundary?: VNextStatePathBoundary;
}

export async function executeVNextAdaptation(
  input: VNextAdaptationRequest,
  dependencies: VNextAdaptationDependencies = {}
): Promise<VNextAdaptationEnvelope> {
  const stateRoot = input.state_root?.trim() || DEFAULT_VNEXT_STATE_ROOT;
  const sqlite = await resolveIsolatedVNextSqlite(join(stateRoot, "runtime.sqlite"), {
    missing: "vnext adaptation requires an absolute independent state root",
    relative: "vNext adaptation state root must be absolute.",
    overlap: "vNext adaptation state must not overlap the v0.2 shared state root.",
    symlink_limit: "vNext adaptation state root contains too many symbolic links."
  }, dependencies.path_boundary);
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const engine = new AdaptationEngine(store);
    if (input.action === "propose") {
      const inspection = engine.propose(candidateInput(input));
      return envelope("propose", inspection.registry_version.state, {
        candidate_id: inspection.candidate.id,
        result: inspection
      });
    }
    if (input.action === "evaluate") {
      const candidateId = required(input.candidate_id, "vnext adaptation evaluate requires --candidate-id");
      const receipt = engine.evaluate(candidateId);
      return envelope("evaluate", receipt.status, {
        candidate_id: receipt.candidate_id,
        evaluation_id: receipt.id,
        result: receipt
      });
    }
    const candidateId = input.candidate_id?.trim();
    const evaluationId = input.evaluation_id?.trim();
    if (Boolean(candidateId) === Boolean(evaluationId)) {
      throw new Error("vnext adaptation inspect requires exactly one of --candidate-id or --evaluation-id");
    }
    if (candidateId) {
      const inspection = engine.inspect(candidateId);
      return inspection
        ? envelope("inspect", inspection.registry_version.state, { candidate_id: candidateId, result: inspection })
        : notFoundEnvelope({ candidate_id: candidateId });
    }
    const receipt = engine.inspectEvaluation(evaluationId!);
    return receipt
      ? envelope("inspect", receipt.status, {
        candidate_id: receipt.candidate_id,
        evaluation_id: receipt.id,
        result: receipt
      })
      : notFoundEnvelope({ evaluation_id: evaluationId });
  } finally {
    store.close();
  }
}

export function vnextAdaptationErrorEnvelope(
  error: unknown,
  action: VNextAdaptationAction | null
): VNextAdaptationEnvelope {
  return {
    adaptation: {
      schema_version: 1,
      marker: VNEXT_ADAPTATION_MARKER,
      surface: "cli",
      action,
      status: "error",
      diagnostic: {
        code: diagnosticCode(error),
        message: errorMessage(error)
      },
      boundary: boundary()
    }
  };
}

function candidateInput(input: VNextAdaptationRequest): ProcedureCandidateInput {
  return {
    target_slot: required(input.target_slot, "vnext adaptation propose requires --target-slot"),
    name: required(input.name, "vnext adaptation propose requires --name"),
    summary: required(input.summary, "vnext adaptation propose requires --summary"),
    trigger_conditions: input.trigger_conditions ?? [],
    steps: input.steps ?? [],
    expected_result: input.expected_result ?? "",
    verification_requirements: input.verification_requirements ?? [],
    failure_modes: input.failure_modes ?? [],
    rollback_rule: input.rollback_rule ?? "",
    evidence_run_ids: input.evidence_run_ids ?? []
  };
}

function envelope(
  action: VNextAdaptationAction,
  status: VNextAdaptationEnvelope["adaptation"]["status"],
  fields: Pick<VNextAdaptationEnvelope["adaptation"], "candidate_id" | "evaluation_id" | "result">
): VNextAdaptationEnvelope {
  return {
    adaptation: {
      schema_version: 1,
      marker: VNEXT_ADAPTATION_MARKER,
      surface: "cli",
      action,
      status,
      ...fields,
      boundary: boundary()
    }
  };
}

function notFoundEnvelope(
  fields: Pick<VNextAdaptationEnvelope["adaptation"], "candidate_id" | "evaluation_id">
): VNextAdaptationEnvelope {
  return {
    adaptation: {
      schema_version: 1,
      marker: VNEXT_ADAPTATION_MARKER,
      surface: "cli",
      action: "inspect",
      status: "not_found",
      ...fields,
      diagnostic: {
        code: "adaptation_not_found",
        message: "Requested vNext Adaptation record was not found."
      },
      boundary: boundary()
    }
  };
}

function diagnosticCode(error: unknown): string {
  if (error instanceof RuntimeSchemaIncompatibleError) return "schema_incompatible";
  if (error instanceof RuntimeStateProfileIncompatibleError) return "state_profile_incompatible";
  if (/not found/iu.test(errorMessage(error))) return "adaptation_not_found";
  if (/evidence Run is not completed/iu.test(errorMessage(error))) return "evidence_not_completed";
  return "invalid_adaptation";
}

function boundary(): string {
  return "The stable vNext Adaptation CLI may persist and evaluate one local procedure candidate as inactive evidence; it cannot activate, discover, execute, publish, or mutate source or the active vault.";
}

function required(value: string | undefined, message: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
