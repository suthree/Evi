import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  assertDeliveryLineageBaseline,
  captureDeliveryLineageSnapshot,
  pathWithinWritableSet
} from "./delivery_lineage.js";
import {
  executionAdapterResultDigest,
  materializeExecutionAdapterResult,
  materializeExecutionResultEnvelope,
  materializeVerificationReceipt,
  type ExecutionAdapterResult,
  type ExecutionResultEnvelope,
  type ExecutionTaskEnvelope,
  type ExecutionWorkerInspection,
  type ExecutionWorkerLease,
  type VerificationCommand,
  type VerificationReceipt
} from "./execution_worker_types.js";
import { validateRuntimeLeaseDuration } from "./runtime_limits.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

const execFileAsync = promisify(execFile);
const DEFAULT_WORKER_LEASE_MS = 30_000;
const MAX_VERIFICATION_OUTPUT_BYTES = 256 * 1024;

export interface ExecutionWorkerExecutor {
  execute(task: ExecutionTaskEnvelope, signal: AbortSignal): Promise<ExecutionAdapterResult>;
}

export interface ExecutionWorkerRuntimeOptions {
  worker_lease_ms?: number;
}

/**
 * Executes one already-reserved source-mutating Worker.
 *
 * The executor is advisory. This runtime independently snapshots Git, runs the
 * exact verification commands without a shell, and only then materializes the
 * canonical Result that the parent Supervisor may inspect.
 */
export class ExecutionWorkerRuntime {
  private readonly workerLeaseMs: number;

  constructor(
    private readonly store: SqliteRuntimeStore,
    private readonly executor: ExecutionWorkerExecutor,
    options: ExecutionWorkerRuntimeOptions = {}
  ) {
    this.workerLeaseMs = options.worker_lease_ms ?? DEFAULT_WORKER_LEASE_MS;
    validateRuntimeLeaseDuration(this.workerLeaseMs, "Execution Worker Runtime");
  }

  async execute(workerId: string): Promise<ExecutionWorkerInspection> {
    const queued = this.requireWorker(workerId);
    if (queued.status !== "queued" && queued.status !== "running") {
      if (["completed", "failed", "needs_input"].includes(queued.status)) return queued;
      throw new Error(`Execution Worker cannot execute from ${queued.status}: ${workerId}`);
    }
    const observedBaseline = await captureDeliveryLineageSnapshot(queued.lineage);
    if (queued.status === "queued") {
      assertDeliveryLineageBaseline(queued.lineage, queued.task_envelope.baseline, observedBaseline);
    }
    const claimed = this.store.claimExecutionWorker(workerId, observedBaseline, this.workerLeaseMs);
    const startedAt = Date.now();
    let activeLease = claimed.lease;
    let heartbeatError: unknown;
    const heartbeat = setInterval(() => {
      if (heartbeatError) return;
      try {
        activeLease = this.store.renewExecutionWorkerLease(activeLease, this.workerLeaseMs);
      } catch (error) {
        heartbeatError = error;
      }
    }, Math.max(50, Math.floor(this.workerLeaseMs / 3)));
    const controller = new AbortController();
    const deadlineMs = Math.min(
      Date.parse(claimed.worker.task_envelope.deadline_at),
      startedAt + claimed.worker.task_envelope.budget.timeout_ms
    );
    const abortTimer = setTimeout(() => controller.abort(), Math.max(1, deadlineMs - Date.now()));

    try {
      const adapter = await this.executeAdapter(claimed.worker.task_envelope, controller.signal);
      if (heartbeatError) throw heartbeatError;
      const verification = await this.verify(claimed.worker.task_envelope);
      if (heartbeatError) throw heartbeatError;
      const finalSnapshot = await captureDeliveryLineageSnapshot(claimed.worker.lineage);
      if (heartbeatError) throw heartbeatError;
      const result = this.resultEnvelope(
        claimed.worker,
        activeLease,
        adapter,
        verification,
        finalSnapshot,
        Date.now() - startedAt
      );
      clearInterval(heartbeat);
      return this.store.completeExecutionWorker(activeLease, result);
    } finally {
      clearTimeout(abortTimer);
      clearInterval(heartbeat);
    }
  }

  private async executeAdapter(
    task: ExecutionTaskEnvelope,
    signal: AbortSignal
  ): Promise<ExecutionAdapterResult> {
    try {
      return materializeExecutionAdapterResult(await this.executor.execute(task, signal));
    } catch (error) {
      const message = bounded(error instanceof Error ? error.message : String(error), 1_000);
      return materializeExecutionAdapterResult({
        status: "failed",
        summary: "The bounded execution adapter failed before producing a valid terminal result.",
        changed_files: [],
        tests: [],
        blockers: [message || "Execution adapter failed without a diagnostic."],
        next_action: "Inspect the exact Delivery Lineage; do not replay this execution automatically.",
        completion_authority: "supervisor",
        execution: {
          adapter: "injected",
          thread_id: null,
          requested_model: "unknown",
          observed_model: null,
          event_count: 0,
          tool_calls_observed: 0
        },
        consumed: { output_chars: 0, duration_ms: 0 }
      });
    }
  }

  private async verify(task: ExecutionTaskEnvelope): Promise<VerificationReceipt[]> {
    const receipts: VerificationReceipt[] = [];
    for (const command of task.verification_commands) {
      receipts.push(await runVerificationCommand(task, command));
    }
    return receipts;
  }

  private resultEnvelope(
    worker: ExecutionWorkerInspection,
    lease: ExecutionWorkerLease,
    adapter: ExecutionAdapterResult,
    verification: VerificationReceipt[],
    finalSnapshot: Awaited<ReturnType<typeof captureDeliveryLineageSnapshot>>,
    durationMs: number
  ): ExecutionResultEnvelope {
    const task = worker.task_envelope;
    const identitySafe = finalSnapshot.repository_root === worker.lineage.repository_root
      && finalSnapshot.git_common_dir === worker.lineage.git_common_dir
      && finalSnapshot.worktree === worker.lineage.worktree
      && finalSnapshot.branch === worker.lineage.branch
      && finalSnapshot.head_commit === worker.lineage.base_commit;
    const pathsSafe = finalSnapshot.changed_paths.every((path) =>
      pathWithinWritableSet(path, worker.lineage.writable_paths)
    );
    const verificationPassed = verification.every((receipt) =>
      receipt.exit_code === 0 && receipt.signal === null && !receipt.timed_out
    );
    const createdAt = new Date().toISOString();
    const budgetViolation = {
      output_chars_exceeded: adapter.consumed.output_chars > task.budget.max_output_tokens * 4,
      timeout_exceeded: durationMs > task.budget.timeout_ms,
      tool_calls_exceeded: adapter.execution.tool_calls_observed > task.budget.max_tool_calls,
      deadline_exceeded: Date.parse(createdAt) > Date.parse(task.deadline_at)
    };
    const budgetSafe = !Object.values(budgetViolation).some(Boolean);
    const completed = adapter.status === "done"
      && identitySafe
      && pathsSafe
      && verificationPassed
      && budgetSafe
      && finalSnapshot.changed_paths.length > 0;
    const needsInput = adapter.status === "blocked" && identitySafe && pathsSafe && budgetSafe;
    const status = completed ? "completed" : needsInput ? "needs_input" : "failed";
    const unresolved = status === "needs_input"
      ? adapter.blockers.map((value) => bounded(value, 240)).filter(Boolean).slice(0, 32)
      : [];
    const findings = JSON.parse(JSON.stringify({
      adapter_result: adapter,
      canonical_policy: {
        identity_safe: identitySafe,
        paths_safe: pathsSafe,
        verification_passed: verificationPassed,
        changed_paths_present: finalSnapshot.changed_paths.length > 0,
        budget_violation: budgetViolation,
        worker_self_report_is_advisory: true,
        parent_completion_authority: "supervisor_only"
      }
    })) as import("./action_types.js").JsonObject;
    return materializeExecutionResultEnvelope({
      worker_id: worker.id,
      status,
      summary: status === "completed"
        ? adapter.summary
        : status === "needs_input"
          ? `Execution Worker needs Supervisor input: ${adapter.summary}`
          : `Execution Worker evidence is non-integrable: ${adapter.summary}`,
      findings,
      artifact_refs: task.artifact_refs,
      evidence_refs: [
        ...task.context_refs,
        ...task.artifact_refs,
        `lineage:${worker.lineage.digest}`,
        `snapshot:${finalSnapshot.digest}`,
        ...verification.map((receipt) => `verification:${receipt.digest}`)
      ],
      unresolved_questions: unresolved,
      proposed_next_step: status === "needs_input" ? adapter.next_action : null,
      task_envelope_digest: task.digest,
      child_execution_lock_digest: worker.child_execution_lock.digest,
      lineage_id: worker.lineage.id,
      lineage_digest: worker.lineage.digest,
      baseline_snapshot_digest: task.baseline.digest,
      final_snapshot: finalSnapshot,
      verification_receipts: verification,
      actual_execution: {
        attempt_id: lease.attempt_id,
        lease_ordinal: lease.ordinal,
        adapter: adapter.execution.adapter,
        thread_id: adapter.execution.thread_id,
        requested_model: adapter.execution.requested_model,
        observed_model: adapter.execution.observed_model,
        event_count: adapter.execution.event_count,
        tool_calls_observed: adapter.execution.tool_calls_observed,
        executor_result_digest: executionAdapterResultDigest(adapter)
      },
      consumed: {
        output_chars: adapter.consumed.output_chars,
        duration_ms: Math.max(durationMs, adapter.consumed.duration_ms)
      },
      created_at: createdAt
    });
  }

  private requireWorker(workerId: string): ExecutionWorkerInspection {
    const worker = this.store.inspectExecutionWorker(workerId);
    if (!worker) throw new Error(`Execution Worker Session not found: ${workerId}`);
    return worker;
  }
}

async function runVerificationCommand(
  task: ExecutionTaskEnvelope,
  command: VerificationCommand
): Promise<VerificationReceipt> {
  const startedAt = Date.now();
  const cwd = command.cwd === "."
    ? task.lineage.worktree
    : resolve(task.lineage.worktree, command.cwd);
  let safeCwd: string;
  try {
    safeCwd = await realpath(cwd);
    if (!isInside(task.lineage.worktree, safeCwd)) {
      throw new Error(`Verification cwd escapes Delivery Lineage: ${command.cwd}`);
    }
  } catch (error) {
    return materializeVerificationReceipt(command, {
      exit_code: null,
      signal: null,
      timed_out: false,
      stdout_digest: sha256(""),
      stderr_digest: sha256(error instanceof Error ? error.message : String(error)),
      duration_ms: Date.now() - startedAt
    });
  }
  try {
    const result = await execFileAsync(command.command, command.args, {
      cwd: safeCwd,
      encoding: "utf8",
      maxBuffer: MAX_VERIFICATION_OUTPUT_BYTES,
      timeout: command.timeout_ms,
      killSignal: "SIGTERM"
    });
    return materializeVerificationReceipt(command, {
      exit_code: 0,
      signal: null,
      timed_out: false,
      stdout_digest: sha256(result.stdout),
      stderr_digest: sha256(result.stderr),
      duration_ms: Date.now() - startedAt
    });
  } catch (error) {
    const failure = error as {
      code?: string | number;
      signal?: string;
      killed?: boolean;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };
    const stdout = toText(failure.stdout);
    const stderr = toText(failure.stderr) || failure.message || "Verification command failed.";
    return materializeVerificationReceipt(command, {
      exit_code: typeof failure.code === "number" ? failure.code : null,
      signal: typeof failure.signal === "string" ? failure.signal : null,
      timed_out: failure.killed === true || failure.code === "ETIMEDOUT",
      stdout_digest: sha256(stdout),
      stderr_digest: sha256(stderr),
      duration_ms: Date.now() - startedAt
    });
  }
}

function isInside(root: string, target: string): boolean {
  if (!isAbsolute(root) || !isAbsolute(target)) return false;
  const child = relative(root, target);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function bounded(input: string, max: number): string {
  const value = input.trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
