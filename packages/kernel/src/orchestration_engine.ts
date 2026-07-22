import { createHash } from "node:crypto";
import { Type } from "typebox";
import type {
  ActionDispatch,
  ActionHandler,
  ActionInvocation,
  ActionObservation,
  ActionToolContract,
  JsonObject
} from "./action_types.js";
import { stableJson } from "./canonical_json.js";
import type { RunRecord } from "./contracts.js";
import { executionLockActions } from "./execution_lock.js";
import {
  deriveDiscussionWorkerLock,
  materializeTaskEnvelope,
  normalizeDiscussionTaskInput,
  type DiscussionTaskInput,
  type ResultEnvelope,
  type WorkerExecutionLease,
  type WorkerInspection
} from "./orchestration_types.js";
import type { RunExecutionLease } from "./execution_types.js";
import { MAX_RUNTIME_TIMEOUT_MS } from "./runtime_limits.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

const parameters = Type.Object({
  objective: Type.String({ minLength: 1, maxLength: 4_000 }),
  expected_result: Type.String({ minLength: 1, maxLength: 4_000 }),
  context_refs: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 32 })),
  artifact_refs: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 32 })),
  constraints: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 32 })),
  verification_requirements: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 32 })
  ),
  deadline_at: Type.String({ minLength: 24, maxLength: 32 }),
  budget: Type.Object({
    max_output_tokens: Type.Integer({ minimum: 1 }),
    timeout_ms: Type.Integer({ minimum: 1, maximum: MAX_RUNTIME_TIMEOUT_MS })
  }, { additionalProperties: false })
}, { additionalProperties: false });

const workerInspectParameters = Type.Object({
  worker_id: Type.String({ minLength: 1, maxLength: 240 })
}, { additionalProperties: false });

const workerNeedsInputParameters = Type.Object({
  question: Type.String({ minLength: 1, maxLength: 240 }),
  proposed_next_step: Type.Optional(Type.String({ minLength: 1, maxLength: 4_000 }))
}, { additionalProperties: false });

export const WORKER_NEEDS_INPUT_CONTRACT: ActionToolContract = {
  name: "worker_needs_input",
  version: "1",
  label: "Request parent input",
  description: "Record one explicit typed input request from a discussion worker for its parent Supervisor.",
  parameters: workerNeedsInputParameters,
  effect_class: "none"
};

export interface SupervisorWorkerContinuation {
  run: RunRecord;
  execution: RunExecutionLease;
  request: string;
  runtime_context: JsonObject;
}

export class OrchestrationEngine {
  constructor(
    private readonly store: SqliteRuntimeStore,
    private readonly discussionWorkerActions: ActionToolContract[]
  ) {
    if (discussionWorkerActions.some((contract) => contract.effect_class !== "none"
      && contract.effect_class !== "local_read")) {
      throw new Error("Discussion worker Actions must be none or local_read.");
    }
  }

  prepare(parentRunId: string, invocationId: string, input: DiscussionTaskInput): JsonObject {
    if (Date.parse(input.deadline_at) <= Date.now()) {
      throw new Error("Discussion worker deadline must be in the future at dispatch.");
    }
    this.store.assertCanDispatchDiscussionWorker(parentRunId, invocationId);
    const parentLock = this.store.getExecutionLock(parentRunId);
    const childLock = deriveDiscussionWorkerLock(
      parentLock,
      executionLockActions(this.discussionWorkerActions),
      input.budget
    );
    return {
      ...input,
      worker_id: deriveWorkerId(parentRunId, invocationId),
      parent_execution_lock_digest: parentLock.digest,
      child_execution_lock_digest: childLock.digest
    } as unknown as JsonObject;
  }

  dispatch(reservation: ActionDispatch["reservation"], input: JsonObject): WorkerInspection {
    const task = normalizeDiscussionTaskInput(input);
    if (typeof input.worker_id !== "string") {
      throw new Error("Worker dispatch durable identity is missing.");
    }
    const parentLock = this.store.getExecutionLock(reservation.run_id);
    if (input.parent_execution_lock_digest !== parentLock.digest) {
      throw new Error("Worker dispatch parent Execution Lock identity drifted after reservation.");
    }
    const childLock = deriveDiscussionWorkerLock(
      parentLock,
      executionLockActions(this.discussionWorkerActions),
      task.budget
    );
    if (input.child_execution_lock_digest !== childLock.digest) {
      throw new Error("Worker dispatch child Execution Lock identity drifted after reservation.");
    }
    const taskEnvelope = materializeTaskEnvelope({
      ...task,
      task_id: `task_${reservation.id}`,
      parent_run_id: reservation.run_id,
      parent_turn_id: reservation.turn_id,
      child_execution_lock_digest: childLock.digest
    });
    return this.store.dispatchDiscussionWorker({
      worker_id: input.worker_id,
      reservation_id: reservation.id,
      task_envelope: taskEnvelope,
      child_execution_lock: childLock
    });
  }

  inspect(workerId: string): WorkerInspection | null {
    return this.store.inspectWorker(workerId);
  }

  inspectChildEvidence(parentRunId: string, workerId: string): JsonObject {
    const worker = this.inspect(workerId);
    if (!worker || worker.parent_run_id !== parentRunId) {
      return { worker_id: workerId, found: false };
    }
    const child = worker.child_run_id ? this.store.inspectRun(worker.child_run_id) : null;
    if (worker.child_run_id && (!child
      || child.session_id !== worker.child_session_id
      || child.execution_lock_digest !== worker.child_execution_lock.digest)) {
      throw new Error(`Worker child Run evidence identity is invalid: ${worker.id}`);
    }
    return {
      worker_id: worker.id,
      found: true,
      worker_status: worker.status,
      task_envelope_digest: worker.task_envelope.digest,
      result_envelope_digest: worker.result_envelope?.digest ?? null,
      result_status: worker.result_envelope?.status ?? null,
      child_run_id: worker.child_run_id,
      child_run_status: child?.status ?? null,
      child_execution_lock_digest: worker.child_execution_lock.digest,
      result_delivered_to_turn_id: worker.result_delivered_to_turn_id
    };
  }

  settleSupervisorTurn(execution: RunExecutionLease, checkpoint: string): RunRecord | null {
    if (!this.store.hasOutstandingWorkers(execution.run_id)
      || this.store.hasUnresolvedActions(execution.run_id)) {
      return null;
    }
    return this.store.waitRun(execution, checkpoint);
  }

  resumeSupervisor(runId: string, leaseMs: number): SupervisorWorkerContinuation | null {
    const results = this.store.getDeliverableWorkerResults(runId);
    if (results.length === 0) return null;
    const runtimeContext = materializeWorkerResultRuntimeContext(runId, results);
    const request = "Continue this same Supervisor Run by integrating the typed Worker Result runtime context.";
    const resumed = this.store.resumeWaitingRun({
      run_id: runId,
      worker_results: results.map((worker) => ({
        worker_id: worker.id,
        result_digest: worker.result_envelope!.digest
      })),
      request,
      evidence_digest: sha256(stableJson(runtimeContext)),
      lease_ms: leaseMs
    });
    return { ...resumed, request, runtime_context: runtimeContext };
  }

  pauseSupervisorIntegration(
    execution: RunExecutionLease,
    runtimeContext: JsonObject | undefined,
    error: string
  ): RunRecord | null {
    if (runtimeContext?.kind !== "runtime_worker_result_delivery") return null;
    const canonical = this.runtimeContextForTurn(execution.run_id, execution.turn_id);
    if (!canonical || stableJson(canonical) !== stableJson(runtimeContext)) {
      throw new Error(`Supervisor Worker Result runtime context drifted: ${execution.run_id}`);
    }
    return this.store.pauseWorkerResultIntegration(execution, error);
  }

  resumeSupervisorIntegration(
    runId: string,
    turnId: string,
    leaseMs: number
  ): SupervisorWorkerContinuation | null {
    const results = this.store.getDeliveredWorkerResults(runId, turnId);
    if (results.length === 0) return null;
    const runtimeContext = materializeWorkerResultRuntimeContext(runId, results);
    const request = "Retry this same Supervisor Turn using the unchanged typed Worker Result evidence.";
    const resumed = this.store.resumeWorkerResultIntegration({
      run_id: runId,
      turn_id: turnId,
      worker_results: results.map((worker) => ({
        worker_id: worker.id,
        result_digest: worker.result_envelope!.digest
      })),
      evidence_digest: sha256(stableJson(runtimeContext)),
      lease_ms: leaseMs
    });
    return resumed ? { ...resumed, request, runtime_context: runtimeContext } : null;
  }

  runtimeContextForTurn(runId: string, turnId: string): JsonObject | null {
    const results = this.store.getDeliveredWorkerResults(runId, turnId);
    return results.length === 0
      ? null
      : materializeWorkerResultRuntimeContext(runId, results);
  }

  claim(workerId: string, leaseMs: number): {
    worker: WorkerInspection;
    lease: WorkerExecutionLease;
  } {
    return this.store.claimWorker(workerId, leaseMs);
  }

  renew(lease: WorkerExecutionLease, leaseMs: number): WorkerExecutionLease {
    return this.store.renewWorkerLease(lease, leaseMs);
  }

  complete(lease: WorkerExecutionLease, result: ResultEnvelope): WorkerInspection {
    return this.store.completeWorker(lease, result);
  }

  prepareNeedsInput(childRunId: string, input: unknown): JsonObject {
    const worker = this.store.inspectWorkerByChildRun(childRunId);
    if (!worker || worker.status !== "running") {
      throw new Error("worker_needs_input requires one active discussion Worker child Run.");
    }
    if (this.store.getTerminalActionEvidence(childRunId, WORKER_NEEDS_INPUT_CONTRACT.name).length > 0) {
      throw new Error(`Discussion Worker already requested parent input: ${worker.id}`);
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("worker_needs_input arguments must be an object.");
    }
    const value = input as Record<string, unknown>;
    const keys = Object.keys(value);
    if (keys.some((key) => key !== "question" && key !== "proposed_next_step")
      || typeof value.question !== "string"
      || !value.question.trim()
      || value.question.trim().length > 240
      || (value.proposed_next_step !== undefined
        && (typeof value.proposed_next_step !== "string"
          || !value.proposed_next_step.trim()
          || value.proposed_next_step.trim().length > 4_000))) {
      throw new Error("worker_needs_input arguments are invalid.");
    }
    return {
      worker_id: worker.id,
      question: value.question.trim(),
      proposed_next_step: typeof value.proposed_next_step === "string"
        ? value.proposed_next_step.trim()
        : "The parent Supervisor must decide whether and how to provide the missing input."
    };
  }

  inspectNeedsInput(worker: WorkerInspection): {
    question: string;
    proposed_next_step: string;
  } | null {
    if (!worker.child_run_id) return null;
    const evidence = this.store.getTerminalActionEvidence(
      worker.child_run_id,
      WORKER_NEEDS_INPUT_CONTRACT.name
    );
    if (evidence.length === 0) return null;
    if (evidence.length !== 1) {
      throw new Error(`Discussion Worker has ambiguous input requests: ${worker.id}`);
    }
    const output = evidence[0]!.receipt.output;
    if (output.worker_id !== worker.id
      || typeof output.question !== "string"
      || typeof output.proposed_next_step !== "string") {
      throw new Error(`Discussion Worker input-request evidence is invalid: ${worker.id}`);
    }
    return {
      question: output.question,
      proposed_next_step: output.proposed_next_step
    };
  }
}

function materializeWorkerResultRuntimeContext(
  runId: string,
  workers: WorkerInspection[]
): JsonObject {
  return {
    kind: "runtime_worker_result_delivery",
    parent_run_id: runId,
    advisory: true,
    parent_completion_authority: "supervisor_only",
    worker_results: workers.map((worker) => ({
      worker_id: worker.id,
      parent_turn_id: worker.parent_turn_id,
      task_envelope_digest: worker.task_envelope.digest,
      result_envelope: worker.result_envelope!
    }))
  } as unknown as JsonObject;
}

function deriveWorkerId(parentRunId: string, invocationId: string): string {
  const digest = createHash("sha256")
    .update(`discussion-worker-v1\u0000${parentRunId}\u0000${invocationId}`)
    .digest("hex");
  return `worker_${digest.slice(0, 32)}`;
}

export function createDiscussionWorkerDispatchAction(engine: OrchestrationEngine): ActionHandler {
  const observe = async (dispatch: ActionDispatch): Promise<ActionObservation> => {
    const worker = engine.dispatch(dispatch.reservation, dispatch.arguments);
    return {
      outcome: "succeeded",
      summary: "One asynchronous read-only discussion worker was durably queued.",
      output: {
        worker_id: worker.id,
        status: worker.status,
        task_envelope_digest: worker.task_envelope.digest,
        child_execution_lock_digest: worker.child_execution_lock.digest
      }
    };
  };

  return {
    contract: {
      name: "worker_dispatch",
      version: "1",
      label: "Dispatch discussion worker",
      description: "Queue one asynchronous read-only discussion worker with a narrowed Execution Lock.",
      parameters,
      effect_class: "external_read"
    },
    prepare(argumentsInput: unknown, invocation?: ActionInvocation): JsonObject {
      const value = normalizeDiscussionTaskInput(argumentsInput);
      const keys = Object.keys(argumentsInput as Record<string, unknown>);
      const allowed = new Set([
        "objective",
        "expected_result",
        "context_refs",
        "artifact_refs",
        "constraints",
        "verification_requirements",
        "deadline_at",
        "budget"
      ]);
      if (keys.some((key) => !allowed.has(key))) {
        throw new Error("worker_dispatch arguments contain unsupported fields.");
      }
      if (!invocation) throw new Error("worker_dispatch requires Action invocation identity.");
      return engine.prepare(invocation.run_id, invocation.invocation_id, value);
    },
    execute: observe,
    reconcile: observe
  };
}

export function createWorkerInspectAction(engine: OrchestrationEngine): ActionHandler {
  const observe = async (dispatch: ActionDispatch): Promise<ActionObservation> => {
    const workerId = String(dispatch.arguments.worker_id);
    const evidence = engine.inspectChildEvidence(dispatch.reservation.run_id, workerId);
    return evidence.found === true
      ? {
        outcome: "succeeded",
        summary: "The parent inspected canonical Worker and child Run evidence locally.",
        output: evidence
      }
      : {
        outcome: "failed",
        summary: "The Worker Session was not found inside this parent Run authority.",
        output: evidence
      };
  };
  return {
    contract: {
      name: "worker_inspect",
      version: "1",
      label: "Inspect Worker evidence",
      description: "Inspect one Worker Session and its exact child Run status inside the current parent Run.",
      parameters: workerInspectParameters,
      effect_class: "local_read"
    },
    prepare(argumentsInput: unknown): JsonObject {
      if (!argumentsInput || typeof argumentsInput !== "object" || Array.isArray(argumentsInput)) {
        throw new Error("worker_inspect arguments must be an object.");
      }
      const value = argumentsInput as Record<string, unknown>;
      if (Object.keys(value).length !== 1
        || typeof value.worker_id !== "string"
        || !value.worker_id.trim()
        || value.worker_id.length > 240) {
        throw new Error("worker_inspect requires one valid worker_id.");
      }
      return { worker_id: value.worker_id.trim() };
    },
    execute: observe,
    reconcile: observe
  };
}

export function createWorkerNeedsInputAction(engine: OrchestrationEngine): ActionHandler {
  return {
    contract: WORKER_NEEDS_INPUT_CONTRACT,
    prepare(argumentsInput: unknown, invocation?: ActionInvocation): JsonObject {
      if (!invocation) throw new Error("worker_needs_input requires Action invocation identity.");
      return engine.prepareNeedsInput(invocation.run_id, argumentsInput);
    },
    execute: async (dispatch) => ({
      outcome: "succeeded",
      summary: "The discussion Worker recorded one explicit typed request for parent input.",
      output: dispatch.arguments
    }),
    reconcile: async (dispatch) => ({
      outcome: "succeeded",
      summary: "The exact discussion Worker input request was recovered.",
      output: dispatch.arguments
    })
  };
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
