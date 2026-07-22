import { Type } from "typebox";
import type {
  ActionDispatch,
  ActionHandler,
  ActionInvocation,
  ActionObservation,
  ActionToolContract,
  JsonObject
} from "./action_types.js";
import { executionLockActions } from "./execution_lock.js";
import {
  deriveDiscussionWorkerLock,
  materializeTaskEnvelope,
  normalizeDiscussionTaskInput,
  type DiscussionTaskInput,
  type WorkerInspection
} from "./orchestration_types.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

const parameters = Type.Object({
  objective: Type.String({ minLength: 1, maxLength: 4_000 }),
  expected_result: Type.String({ minLength: 1, maxLength: 4_000 }),
  context_refs: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 32 })),
  constraints: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 32 })),
  verification_requirements: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 32 })
  ),
  deadline_at: Type.String({ minLength: 24, maxLength: 32 }),
  budget: Type.Object({
    max_output_tokens: Type.Integer({ minimum: 1 }),
    timeout_ms: Type.Integer({ minimum: 1 })
  }, { additionalProperties: false })
}, { additionalProperties: false });

const workerInspectParameters = Type.Object({
  worker_id: Type.String({ minLength: 1, maxLength: 240 })
}, { additionalProperties: false });

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
      parent_execution_lock_digest: parentLock.digest,
      child_execution_lock_digest: childLock.digest
    } as unknown as JsonObject;
  }

  dispatch(reservation: ActionDispatch["reservation"], input: JsonObject): WorkerInspection {
    const task = normalizeDiscussionTaskInput(input);
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
      reservation_id: reservation.id,
      task_envelope: taskEnvelope,
      child_execution_lock: childLock
    });
  }

  inspect(workerId: string): WorkerInspection | null {
    return this.store.inspectWorker(workerId);
  }

  inspectReservation(reservationId: string): WorkerInspection | null {
    return this.store.inspectWorkerByReservation(reservationId);
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
