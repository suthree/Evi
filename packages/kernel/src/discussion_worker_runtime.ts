import type { ActionGateway } from "./action_gateway.js";
import type { JsonObject } from "./action_types.js";
import type {
  AgentLoopFactory,
  RunExecutionResult,
  RunRecord
} from "./contracts.js";
import { assertExecutionLockMatchesContracts } from "./execution_lock.js";
import { KernelRuntime } from "./kernel_runtime.js";
import { OrchestrationEngine } from "./orchestration_engine.js";
import {
  materializeResultEnvelope,
  type ResultEnvelope,
  type TaskEnvelope,
  type WorkerExecutionLease,
  type WorkerInspection
} from "./orchestration_types.js";
import { validateRuntimeLeaseDuration } from "./runtime_limits.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

const DEFAULT_WORKER_LEASE_MS = 30_000;
const MAX_SUMMARY_LENGTH = 4_000;
const MAX_QUESTION_LENGTH = 240;
const MAX_TASK_EVIDENCE_BYTES = 128 * 1024;

export interface DiscussionWorkerRuntimeOptions {
  worker_lease_ms?: number;
  run_execution_lease_ms?: number;
}

/**
 * Executes one already-dispatched read-only discussion Worker Session.
 *
 * SQLite owns claim/recovery identity, KernelRuntime owns the only Agent Loop,
 * and the resulting envelope remains advisory to the parent Supervisor Run.
 */
export class DiscussionWorkerRuntime {
  private readonly workerLeaseMs: number;
  private readonly runExecutionLeaseMs: number | undefined;
  private readonly orchestration: OrchestrationEngine;

  constructor(
    private readonly store: SqliteRuntimeStore,
    private readonly actions: ActionGateway,
    private readonly loops: AgentLoopFactory,
    options: DiscussionWorkerRuntimeOptions = {}
  ) {
    this.workerLeaseMs = options.worker_lease_ms ?? DEFAULT_WORKER_LEASE_MS;
    validateRuntimeLeaseDuration(this.workerLeaseMs, "Discussion Worker Runtime");
    this.runExecutionLeaseMs = options.run_execution_lease_ms;
    if (this.runExecutionLeaseMs !== undefined) {
      validateRuntimeLeaseDuration(this.runExecutionLeaseMs, "Discussion Worker Runtime");
    }
    if (this.actions.contracts().some((contract) => contract.effect_class !== "none"
      && contract.effect_class !== "local_read")) {
      throw new Error("Discussion Worker Runtime Actions must be none or local_read.");
    }
    this.orchestration = new OrchestrationEngine(this.store, this.actions.contracts());
  }

  async execute(workerId: string): Promise<WorkerInspection> {
    const claimed = this.orchestration.claim(workerId, this.workerLeaseMs);
    assertExecutionLockMatchesContracts(
      claimed.worker.child_execution_lock,
      this.actions.contracts()
    );
    let activeLease = claimed.lease;
    let heartbeatError: unknown;
    const heartbeat = setInterval(() => {
      if (heartbeatError) return;
      try {
        activeLease = this.orchestration.renew(activeLease, this.workerLeaseMs);
      } catch (error) {
        heartbeatError = error;
      }
    }, Math.max(50, Math.floor(this.workerLeaseMs / 3)));

    try {
      const result = await this.executeOrRecoverChild(claimed.worker, activeLease);
      if (heartbeatError) throw heartbeatError;
      if (result.status === "paused") {
        throw new Error(
          `Discussion Worker child Run is paused for exact reconciliation evidence: ${workerId}`
        );
      }
      clearInterval(heartbeat);
      const current = this.requireWorker(workerId);
      const envelope = this.resultEnvelope(current, result);
      return this.orchestration.complete(activeLease, envelope);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async executeOrRecoverChild(
    worker: WorkerInspection,
    lease: WorkerExecutionLease
  ): Promise<RunExecutionResult> {
    const runtimeContext = materializeTaskRuntimeContext(worker.task_envelope);
    const runtimeDeadline = workerRuntimeDeadline(worker);
    if (Date.parse(runtimeDeadline) <= Date.now()) {
      throw new Error(`Discussion Worker budget elapsed before child execution: ${worker.id}`);
    }
    const runtime = new KernelRuntime(
      this.store,
      this.actions,
      this.loops,
      this.runExecutionLeaseMs === undefined
        ? {
          runtime_budget: {
            max_output_tokens: worker.task_envelope.budget.max_output_tokens,
            deadline_at: runtimeDeadline
          }
        }
        : {
          execution_lease_ms: this.runExecutionLeaseMs,
          runtime_budget: {
            max_output_tokens: worker.task_envelope.budget.max_output_tokens,
            deadline_at: runtimeDeadline
          }
        }
    );
    if (worker.child_run_id) {
      const child = runtime.inspect(worker.child_run_id);
      if (!child || child.session_id !== worker.child_session_id
        || child.execution_lock_digest !== worker.child_execution_lock.digest) {
        throw new Error(`Worker child Run identity is invalid: ${worker.id}`);
      }
      if (child.status === "completed" || child.status === "failed") {
        return terminalResult(child);
      }
      return runtime.continueRun(child.id, runtimeContext);
    }

    return runtime.submit({
      request: "Execute the bounded discussion task supplied as typed runtime context.",
      execution_lock: worker.child_execution_lock
    }, {
      worker_id: worker.id,
      owner_token: lease.owner_token
    }, runtimeContext);
  }

  private resultEnvelope(
    worker: WorkerInspection,
    result: RunExecutionResult
  ): ResultEnvelope {
    if (!worker.child_run_id || result.run_id !== worker.child_run_id) {
      throw new Error(`Worker child Run result identity is invalid: ${worker.id}`);
    }
    const child = this.store.inspectRun(result.run_id);
    if (!child || child.session_id !== worker.child_session_id
      || child.execution_lock_digest !== worker.child_execution_lock.digest) {
      throw new Error(`Worker child Run evidence is invalid: ${worker.id}`);
    }
    if (result.status === "waiting") {
      throw new Error(`Discussion worker cannot wait on another Worker Session: ${worker.id}`);
    }
    if (result.status === "paused") {
      throw new Error(`Discussion Worker pause cannot be converted into needs_input: ${worker.id}`);
    }
    const observedOutputTokens = this.store.getObservedOutputTokens(child.session_id);
    const durationMs = Math.max(0, Date.now() - Date.parse(worker.created_at));
    if (observedOutputTokens > worker.task_envelope.budget.max_output_tokens
      || durationMs > worker.task_envelope.budget.timeout_ms
      || Date.now() > Date.parse(worker.task_envelope.deadline_at)) {
      throw new Error(`Discussion Worker exceeded its bounded budget: ${worker.id}`);
    }
    const actualExecution = this.store.getLatestSettledRunExecution(child.id);
    const providers = [...new Set(actualExecution.dispatches.map((dispatch) => dispatch.provider))];
    const models = [...new Set(actualExecution.dispatches.map((dispatch) => dispatch.model))];
    if (providers.length > 1 || models.length > 1) {
      throw new Error(`Discussion Worker model identity drifted across one execution: ${worker.id}`);
    }
    const needsInput = result.status === "completed"
      ? this.orchestration.inspectNeedsInput(worker)
      : null;
    const rawSummary = result.status === "completed"
      ? result.answer ?? "Discussion worker completed without a text answer."
      : result.error ?? `Discussion worker ended with status ${result.status}.`;
    const summary = boundedText(rawSummary, MAX_SUMMARY_LENGTH);
    return materializeResultEnvelope({
      worker_id: worker.id,
      child_run_id: result.run_id,
      status: needsInput ? "needs_input" : result.status,
      summary,
      findings: {
        child_run_status: result.status,
        answer_excerpt: result.answer === null ? null : summary,
        answer_truncated: result.answer !== null && result.answer.trim().length > summary.length
      },
      artifact_refs: [],
      evidence_refs: [
        ...worker.task_envelope.context_refs,
        ...worker.task_envelope.artifact_refs
      ],
      unresolved_questions: needsInput
        ? [boundedText(needsInput.question, MAX_QUESTION_LENGTH)]
        : [],
      proposed_next_step: needsInput
        ? needsInput.proposed_next_step
        : null,
      actual_execution_lock_digest: child.execution_lock_digest,
      actual_execution: {
        execution_id: actualExecution.execution_id,
        execution_ordinal: actualExecution.ordinal,
        model_dispatch_ids: actualExecution.dispatches.map((dispatch) => dispatch.id),
        provider: providers[0] ?? null,
        model: models[0] ?? null
      },
      consumed: {
        output_tokens: observedOutputTokens,
        duration_ms: durationMs
      },
      created_at: new Date().toISOString()
    });
  }

  private requireWorker(workerId: string): WorkerInspection {
    const worker = this.store.inspectWorker(workerId);
    if (!worker) throw new Error(`Worker Session not found: ${workerId}`);
    return worker;
  }
}

function materializeTaskRuntimeContext(task: TaskEnvelope): JsonObject {
  const context = {
    kind: "runtime_discussion_task_envelope",
    advisory_to_parent: true,
    parent_completion_authority: "supervisor_only",
    task
  };
  const evidence = JSON.stringify(context);
  if (Buffer.byteLength(evidence, "utf8") > MAX_TASK_EVIDENCE_BYTES) {
    throw new Error(`Discussion Task Envelope is too large: ${task.task_id}`);
  }
  return JSON.parse(evidence) as JsonObject;
}

function workerRuntimeDeadline(worker: WorkerInspection): string {
  const timeoutDeadline = Date.parse(worker.created_at) + worker.task_envelope.budget.timeout_ms;
  return new Date(Math.min(
    timeoutDeadline,
    Date.parse(worker.task_envelope.deadline_at)
  )).toISOString();
}

function terminalResult(input: RunRecord): RunExecutionResult {
  if (input.status !== "completed" && input.status !== "failed") {
    throw new Error(`Run is not terminal: ${input.id}/${input.status}`);
  }
  return {
    run_id: input.id,
    turn_id: input.turn_id,
    session_id: input.session_id,
    status: input.status,
    answer: input.answer,
    error: input.error
  };
}

function boundedText(input: string, maxLength: number): string {
  const value = input.trim();
  if (!value) return "Discussion worker returned no usable text evidence.";
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
