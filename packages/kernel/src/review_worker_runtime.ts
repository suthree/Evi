import type { ActionGateway } from "./action_gateway.js";
import type { JsonObject } from "./action_types.js";
import type { AgentLoopFactory, RunExecutionResult, RunRecord } from "./contracts.js";
import { assertExecutionLockMatchesContracts } from "./execution_lock.js";
import { KernelRuntime } from "./kernel_runtime.js";
import { OrchestrationEngine } from "./orchestration_engine.js";
import type { WorkerExecutionLease } from "./orchestration_types.js";
import {
  materializeReviewResultEnvelope,
  parseReviewDecision,
  type ReviewResultEnvelope,
  type ReviewTaskEnvelope,
  type ReviewWorkerInspection
} from "./review_worker_types.js";
import { validateRuntimeLeaseDuration } from "./runtime_limits.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

const DEFAULT_WORKER_LEASE_MS = 30_000;
const MAX_TASK_EVIDENCE_BYTES = 128 * 1024;

export interface ReviewWorkerRuntimeOptions {
  worker_lease_ms?: number;
  run_execution_lease_ms?: number;
}

/** Executes one already-dispatched independent read-only Reviewer Worker. */
export class ReviewWorkerRuntime {
  private readonly workerLeaseMs: number;
  private readonly runExecutionLeaseMs: number | undefined;
  private readonly orchestration: OrchestrationEngine;

  constructor(
    private readonly store: SqliteRuntimeStore,
    private readonly actions: ActionGateway,
    private readonly loops: AgentLoopFactory,
    options: ReviewWorkerRuntimeOptions = {}
  ) {
    this.workerLeaseMs = options.worker_lease_ms ?? DEFAULT_WORKER_LEASE_MS;
    validateRuntimeLeaseDuration(this.workerLeaseMs, "Review Worker Runtime");
    this.runExecutionLeaseMs = options.run_execution_lease_ms;
    if (this.runExecutionLeaseMs !== undefined) {
      validateRuntimeLeaseDuration(this.runExecutionLeaseMs, "Review Worker Runtime");
    }
    if (this.actions.contracts().some((contract) => contract.effect_class !== "none"
      && contract.effect_class !== "local_read")) {
      throw new Error("Review Worker Runtime Actions must be none or local_read.");
    }
    this.orchestration = new OrchestrationEngine(this.store, this.actions.contracts());
  }

  async execute(workerId: string): Promise<ReviewWorkerInspection> {
    const claimed = this.orchestration.claimReview(workerId, this.workerLeaseMs);
    assertExecutionLockMatchesContracts(
      claimed.worker.child_execution_lock,
      this.actions.contracts()
    );
    let activeLease = claimed.lease;
    let heartbeatError: unknown;
    const heartbeat = setInterval(() => {
      if (heartbeatError) return;
      try {
        activeLease = this.orchestration.renewReview(activeLease, this.workerLeaseMs);
      } catch (error) {
        heartbeatError = error;
      }
    }, Math.max(50, Math.floor(this.workerLeaseMs / 3)));
    try {
      const result = await this.executeOrRecoverChild(claimed.worker, activeLease);
      if (heartbeatError) throw heartbeatError;
      if (result.status === "paused") {
        throw new Error(`Review Worker child Run is paused for exact reconciliation: ${workerId}`);
      }
      clearInterval(heartbeat);
      const current = this.requireWorker(workerId);
      return this.orchestration.completeReview(activeLease, this.resultEnvelope(current, result));
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async executeOrRecoverChild(
    worker: ReviewWorkerInspection,
    lease: WorkerExecutionLease
  ): Promise<RunExecutionResult> {
    const runtimeContext = materializeReviewTaskRuntimeContext(worker.task_envelope);
    const runtime = new KernelRuntime(
      this.store,
      this.actions,
      this.loops,
      this.runExecutionLeaseMs === undefined
        ? {
          runtime_budget: {
            max_output_tokens: worker.task_envelope.budget.max_output_tokens,
            deadline_at: workerRuntimeDeadline(worker)
          }
        }
        : {
          execution_lease_ms: this.runExecutionLeaseMs,
          runtime_budget: {
            max_output_tokens: worker.task_envelope.budget.max_output_tokens,
            deadline_at: workerRuntimeDeadline(worker)
          }
        }
    );
    if (worker.child_run_id) {
      const child = runtime.inspect(worker.child_run_id);
      if (!child || child.session_id !== worker.child_session_id
        || child.execution_lock_digest !== worker.child_execution_lock.digest) {
        throw new Error(`Review Worker child Run identity is invalid: ${worker.id}`);
      }
      if (child.status === "completed" || child.status === "failed") return terminalResult(child);
      return runtime.continueRun(child.id, runtimeContext);
    }
    return runtime.submit({
      request: [
        "Review the immutable execution evidence supplied as typed runtime context.",
        "Return only one JSON object with exact keys verdict, summary, findings.",
        "Each finding must have exact keys priority, path, line, title, rationale.",
        "Use verdict approved only when findings is empty; otherwise use changes_required."
      ].join(" "),
      execution_lock: worker.child_execution_lock
    }, {
      worker_id: worker.id,
      owner_token: lease.owner_token
    }, runtimeContext);
  }

  private resultEnvelope(
    worker: ReviewWorkerInspection,
    result: RunExecutionResult
  ): ReviewResultEnvelope {
    if (!worker.child_run_id || result.run_id !== worker.child_run_id) {
      throw new Error(`Review Worker child Run result identity is invalid: ${worker.id}`);
    }
    const child = this.store.inspectRun(result.run_id);
    if (!child || child.session_id !== worker.child_session_id
      || child.execution_lock_digest !== worker.child_execution_lock.digest) {
      throw new Error(`Review Worker child Run evidence is invalid: ${worker.id}`);
    }
    if (result.status === "waiting") {
      throw new Error(`Review Worker cannot wait on another Worker Session: ${worker.id}`);
    }
    if (result.status === "paused") {
      throw new Error(`Review Worker pause cannot become a terminal review: ${worker.id}`);
    }
    const observedOutputTokens = this.store.getObservedOutputTokens(child.session_id);
    const durationMs = Math.max(0, Date.now() - Date.parse(worker.created_at));
    const createdAt = new Date().toISOString();
    const budgetExceeded = observedOutputTokens > worker.task_envelope.budget.max_output_tokens
      || durationMs > worker.task_envelope.budget.timeout_ms
      || Date.parse(createdAt) > Date.parse(worker.task_envelope.deadline_at);
    let decision: ReturnType<typeof parseReviewDecision> | null = null;
    let protocolError: string | null = null;
    if (!budgetExceeded && result.status === "completed") {
      try {
        decision = parseReviewDecision(
          result.answer ?? "",
          worker.task_envelope.review_packet.changed_paths
        );
      } catch (error) {
        protocolError = error instanceof Error ? error.message : String(error);
      }
    }
    const status = !budgetExceeded && result.status === "completed" && decision
      ? "completed" as const
      : "failed" as const;
    const actualExecution = this.store.getResultProducingRunExecution(child.id);
    const providers = [...new Set(actualExecution.dispatches.map((dispatch) => dispatch.provider))];
    const models = [...new Set(actualExecution.dispatches.map((dispatch) => dispatch.model))];
    if (providers.length > 1 || models.length > 1) {
      throw new Error(`Review Worker model identity drifted across one execution: ${worker.id}`);
    }
    const summary = boundedSummary(decision?.summary
      ?? (budgetExceeded
        ? "Reviewer exceeded its bounded Task budget; no verdict is accepted."
        : result.status === "failed"
          ? result.error ?? "Reviewer child Run failed without a verdict."
          : `Reviewer returned invalid structured evidence: ${protocolError ?? "missing decision"}`));
    return materializeReviewResultEnvelope({
      worker_id: worker.id,
      child_run_id: child.id,
      status,
      verdict: status === "completed" ? decision!.verdict : null,
      summary,
      findings: status === "completed" ? decision!.findings : [],
      task_envelope_digest: worker.task_envelope.digest,
      review_packet_digest: worker.task_envelope.review_packet.digest,
      execution_worker_id: worker.execution_worker_id,
      execution_result_digest: worker.task_envelope.execution_result_digest,
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
      created_at: createdAt
    });
  }

  private requireWorker(workerId: string): ReviewWorkerInspection {
    const worker = this.store.inspectReviewWorker(workerId);
    if (!worker) throw new Error(`Review Worker Session not found: ${workerId}`);
    return worker;
  }
}

function boundedSummary(value: string): string {
  const normalized = value.trim() || "Reviewer failed without a usable summary.";
  return normalized.slice(0, 4_000);
}

function materializeReviewTaskRuntimeContext(task: ReviewTaskEnvelope): JsonObject {
  const context = {
    kind: "runtime_review_task_envelope",
    advisory_to_parent: true,
    parent_completion_authority: "supervisor_only",
    source_mutation_authority: "none",
    task
  };
  const evidence = JSON.stringify(context);
  if (Buffer.byteLength(evidence, "utf8") > MAX_TASK_EVIDENCE_BYTES) {
    throw new Error(`Review Task Envelope is too large: ${task.task_id}`);
  }
  return JSON.parse(evidence) as JsonObject;
}

function workerRuntimeDeadline(worker: ReviewWorkerInspection): string {
  const timeoutDeadline = Date.parse(worker.created_at) + worker.task_envelope.budget.timeout_ms;
  return new Date(Math.min(timeoutDeadline, Date.parse(worker.task_envelope.deadline_at))).toISOString();
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
