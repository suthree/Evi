import {
  claimRecoverableRuntimeTask,
  completeRuntimeTask,
  failRuntimeTask,
  listRecoverableRuntimeTasks,
  type RuntimeTaskQueueEntry,
  type RuntimeTaskQueueTerminalStatus
} from "../../core/src/runtime_task_queue.js";
import {
  recordRuntimeTaskRun,
  runtimeTaskRunStatusFromResult
} from "../../core/src/runtime_sessions.js";
import {
  runtimeChannelSourceFromRouteKey,
  type RuntimeChannelSource
} from "../../core/src/runtime_channel_messages.js";
import { recordRuntimeChannelOutbound } from "../../core/src/runtime_channel_outbox.js";
import type { RunResult } from "../../core/src/schemas.js";
import { AgentStore } from "../../core/src/store.js";

type RuntimeTaskQueueWorkerState = "idle" | "running" | "ok" | "skipped" | "error" | "stopped";

export interface RuntimeTaskQueueWorkerOptions {
  store: AgentStore;
  runTask: (task: string, entry: RuntimeTaskQueueEntry) => Promise<RunResult>;
  intervalMs?: number;
  limit?: number;
  queuedStaleMs?: number;
  runningStaleMs?: number;
  statusRef?: string;
  clock?: () => Date;
}

export interface RuntimeTaskQueueWorkerStatus {
  service: "runtime_task_queue";
  state: RuntimeTaskQueueWorkerState;
  enabled: true;
  pid: number;
  interval_ms: number;
  limit: number;
  queued_stale_ms: number;
  running_stale_ms: number;
  started_at: string;
  updated_at: string;
  last_started_at?: string;
  last_finished_at?: string;
  last_recoverable_count?: number;
  last_due_count?: number;
  last_claimed_count?: number;
  last_completed_count?: number;
  last_failed_count?: number;
  last_task_ids?: string[];
  next_wake_at?: string;
  error?: string;
}

export interface RuntimeTaskQueueWorkerHandle {
  readonly statusRef: string;
  start: () => void;
  stop: () => void;
  runOnce: (trigger?: string) => Promise<RuntimeTaskQueueWorkerStatus>;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_LIMIT = 1;
const DEFAULT_QUEUED_STALE_MS = 60_000;
const DEFAULT_RUNNING_STALE_MS = 6 * 60 * 60 * 1000;

export function createRuntimeTaskQueueWorker(options: RuntimeTaskQueueWorkerOptions): RuntimeTaskQueueWorkerHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const queuedStaleMs = options.queuedStaleMs ?? DEFAULT_QUEUED_STALE_MS;
  const runningStaleMs = options.runningStaleMs ?? DEFAULT_RUNNING_STALE_MS;
  const statusRef = options.statusRef ?? "services/runtime/task_queue.json";
  const startedAt = new Date().toISOString();
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let lastStatus: RuntimeTaskQueueWorkerStatus | null = null;

  const buildStatus = (
    state: RuntimeTaskQueueWorkerState,
    extra: Partial<RuntimeTaskQueueWorkerStatus> = {}
  ): RuntimeTaskQueueWorkerStatus => ({
    service: "runtime_task_queue",
    enabled: true,
    pid: process.pid,
    interval_ms: intervalMs,
    limit,
    queued_stale_ms: queuedStaleMs,
    running_stale_ms: runningStaleMs,
    started_at: startedAt,
    ...pickLastFields(lastStatus),
    ...extra,
    state,
    updated_at: new Date().toISOString()
  });

  const writeStatus = async (status: RuntimeTaskQueueWorkerStatus): Promise<RuntimeTaskQueueWorkerStatus> => {
    lastStatus = status;
    await options.store.writeJson(statusRef, status);
    return status;
  };

  const runOnce = async (_trigger = "interval"): Promise<RuntimeTaskQueueWorkerStatus> => {
    await options.store.ensureLayout();
    if (running) return writeStatus(buildStatus("idle"));
    running = true;
    const lastStartedAt = new Date().toISOString();
    await writeStatus(buildStatus("running", { last_started_at: lastStartedAt }));
    try {
      const result = await runRuntimeTaskQueueOnce({
        ...options,
        limit,
        queuedStaleMs,
        runningStaleMs
      });
      return await writeStatus(buildStatus(result.due_count ? "ok" : "skipped", {
        last_started_at: lastStartedAt,
        last_finished_at: new Date().toISOString(),
        last_recoverable_count: result.recoverable_count,
        last_due_count: result.due_count,
        last_claimed_count: result.claimed_count,
        last_completed_count: result.completed_count,
        last_failed_count: result.failed_count,
        last_task_ids: result.task_ids,
        next_wake_at: new Date(Date.now() + intervalMs).toISOString(),
        error: undefined
      }));
    } catch (error) {
      return await writeStatus(buildStatus("error", {
        last_started_at: lastStartedAt,
        last_finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      running = false;
    }
  };

  return {
    statusRef,
    start: () => {
      if (timer) return;
      void runOnce("startup").catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
      timer = setInterval(() => {
        void runOnce("interval").catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : String(error));
        });
      }, intervalMs);
      timer.unref();
    },
    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      void writeStatus(buildStatus("stopped", { next_wake_at: undefined })).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    },
    runOnce
  };
}

export async function runRuntimeTaskQueueOnce(options: RuntimeTaskQueueWorkerOptions): Promise<{
  recoverable_count: number;
  due_count: number;
  claimed_count: number;
  completed_count: number;
  failed_count: number;
  task_ids: string[];
}> {
  const now = (options.clock?.() ?? new Date()).toISOString();
  const nowMs = Date.parse(now);
  const queuedStaleMs = options.queuedStaleMs ?? DEFAULT_QUEUED_STALE_MS;
  const runningStaleMs = options.runningStaleMs ?? DEFAULT_RUNNING_STALE_MS;
  const recoverable = await listRecoverableRuntimeTasks(options.store, {
    now,
    runningStaleMs
  });
  const due = recoverable
    .filter((entry) => entry.status === "running" || isStale(entry.updated_at, nowMs, queuedStaleMs))
    .slice(0, options.limit ?? DEFAULT_LIMIT);

  let claimedCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  const taskIds: string[] = [];

  for (const entry of due) {
    const claimed = await claimRecoverableRuntimeTask(options.store, { id: entry.id, now });
    if (!claimed) continue;
    claimedCount += 1;
    taskIds.push(claimed.id);
    await recordRuntimeTaskRun(options.store, {
      id: claimed.id,
      createdAt: claimed.created_at,
      runtimeSessionId: claimed.runtime_session_id,
      sourceKind: claimed.source_kind,
      sourceKey: claimed.source_key,
      task: claimed.task,
      status: "running",
      now
    });

    try {
      const result = await options.runTask(renderRunnerTask(claimed), claimed);
      await completeRuntimeTask(options.store, {
        id: claimed.id,
        status: runtimeTaskRunStatusFromResult(result) as RuntimeTaskQueueTerminalStatus
      });
      await recordRuntimeTaskRun(options.store, {
        id: claimed.id,
        createdAt: claimed.created_at,
        runtimeSessionId: claimed.runtime_session_id,
        sourceKind: claimed.source_kind,
        sourceKey: claimed.source_key,
        task: claimed.task,
        runResult: result
      });
      await recordRuntimeChannelOutbound(options.store, {
        source: sourceFromQueueEntry(claimed),
        sourceKind: claimed.source_kind,
        sourceKey: claimed.source_key,
        runtimeSessionId: claimed.runtime_session_id,
        taskRunId: claimed.id,
        purpose: "final",
        status: shouldQueueProviderReply(claimed) ? "queued" : "skipped",
        text: result.verdict
      });
      completedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failRuntimeTask(options.store, { id: claimed.id, error: message });
      await recordRuntimeTaskRun(options.store, {
        id: claimed.id,
        createdAt: claimed.created_at,
        runtimeSessionId: claimed.runtime_session_id,
        sourceKind: claimed.source_kind,
        sourceKey: claimed.source_key,
        task: claimed.task,
        status: "failed"
      });
      await recordRuntimeChannelOutbound(options.store, {
        source: sourceFromQueueEntry(claimed),
        sourceKind: claimed.source_kind,
        sourceKey: claimed.source_key,
        runtimeSessionId: claimed.runtime_session_id,
        taskRunId: claimed.id,
        purpose: "error",
        status: shouldQueueProviderReply(claimed) ? "queued" : "skipped",
        text: message,
        error: message
      });
      failedCount += 1;
    }
  }

  return {
    recoverable_count: recoverable.length,
    due_count: due.length,
    claimed_count: claimedCount,
    completed_count: completedCount,
    failed_count: failedCount,
    task_ids: taskIds
  };
}

function renderRunnerTask(entry: RuntimeTaskQueueEntry): string {
  if (entry.runner_task) return entry.runner_task;
  if (!entry.runtime_session_id) return entry.task;
  return [
    "Recovered runtime session task from the local daemon queue.",
    `Runtime session ID: ${entry.runtime_session_id}`,
    `Source: ${entry.source_kind}${entry.source_key ? ` ${entry.source_key}` : ""}`,
    "",
    "Task:",
    entry.task
  ].join("\n");
}

function sourceFromQueueEntry(entry: RuntimeTaskQueueEntry): RuntimeChannelSource | null {
  return entry.source_route_key ? runtimeChannelSourceFromRouteKey(entry.source_route_key) : null;
}

function shouldQueueProviderReply(entry: RuntimeTaskQueueEntry): boolean {
  return Boolean(entry.source_route_key && (
    entry.source_kind === "feishu" ||
    entry.source_kind === "telegram" ||
    entry.source_kind === "discord"
  ));
}

function isStale(value: string, nowMs: number, staleMs: number): boolean {
  const updatedMs = Date.parse(value);
  return Number.isFinite(nowMs) && Number.isFinite(updatedMs) && nowMs - updatedMs >= staleMs;
}

function pickLastFields(status: RuntimeTaskQueueWorkerStatus | null): Partial<RuntimeTaskQueueWorkerStatus> {
  if (!status) return {};
  return {
    last_started_at: status.last_started_at,
    last_finished_at: status.last_finished_at,
    last_recoverable_count: status.last_recoverable_count,
    last_due_count: status.last_due_count,
    last_claimed_count: status.last_claimed_count,
    last_completed_count: status.last_completed_count,
    last_failed_count: status.last_failed_count,
    last_task_ids: status.last_task_ids
  };
}
