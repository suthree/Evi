import {
  listContentFeedbackNeeded,
  planContentFeedbackStrategy,
  type ContentFeedbackEvidence,
  type ContentFeedbackNeededItem,
  type ContentFeedbackStrategyPosture,
  type ContentFeedbackStrategyResult
} from "../../core/src/content_pipeline.js";
import { AgentStore } from "../../core/src/store.js";
import {
  refreshContentFeedback,
  type RefreshContentFeedbackResult
} from "./content_pipeline.js";
import {
  XiaohongshuMcpClient,
  type ExternalFeedbackCaptureClient
} from "./xiaohongshu_mcp.js";
import {
  clearLoopTimer,
  nextDueDelayMs,
  nextWakeSummary,
  scheduleLoopTimer,
  type LoopTimerDriver
} from "./loop_schedule.js";

type ContentFeedbackRefreshLoopState = "disabled" | "idle" | "running" | "ok" | "skipped" | "error" | "paused" | "stopped";

export interface ContentFeedbackRefreshLoopOptions {
  repoRoot: string;
  stateRoot: string;
  enabled: boolean;
  intervalMs: number;
  limit: number;
  minFollowUpAgeMs: number;
  serverUrl?: string;
  clientFactory?: () => Promise<ExternalFeedbackCaptureClient | undefined>;
  clock?: () => Date;
  timerDriver?: LoopTimerDriver;
  statusRef?: string;
}

export interface ContentFeedbackRefreshLoopStatus {
  service: "content_feedback_refresh";
  state: ContentFeedbackRefreshLoopState;
  enabled: boolean;
  pid: number;
  repo_root: string;
  state_root: string;
  interval_ms: number;
  limit: number;
  min_follow_up_age_ms: number;
  server_url?: string;
  started_at: string;
  updated_at: string;
  last_started_at?: string;
  last_finished_at?: string;
  last_queue_count?: number;
  last_due_count?: number;
  last_deferred_count?: number;
  last_refreshed_count?: number;
  last_captured_count?: number;
  last_failed_count?: number;
  last_skipped_count?: number;
  last_top_skip_reason?: string;
  last_skip_reason_counts?: Record<string, number>;
  last_item_refs?: string[];
  last_skipped_item_refs?: string[];
  last_deferred_item_refs?: string[];
  last_strategy_created_at?: string;
  last_strategy_captured_by?: ContentFeedbackEvidence["captured_by"];
  last_strategy_suggestion_count?: number;
  last_strategy_high_priority_count?: number;
  last_strategy_collect_more_feedback_count?: number;
  last_strategy_repair_feedback_capture_count?: number;
  last_strategy_revise_next_post_count?: number;
  last_strategy_reuse_baseline_count?: number;
  last_strategy_verify_metrics_count?: number;
  last_strategy_top_posture?: ContentFeedbackStrategyPosture;
  last_strategy_top_priority?: "high" | "medium" | "low";
  last_strategy_top_title?: string;
  last_strategy_top_run_ref?: string;
  last_strategy_next_command?: string;
  last_strategy_item_refs?: string[];
  next_due_at?: string;
  next_due_run_id?: string;
  next_due_run_ref?: string;
  next_due_reason?: ContentFeedbackNeededItem["reason"];
  next_due_command?: string;
  next_wake_at?: string;
  next_wake_delay_ms?: number;
  next_wake_reason?: "interval" | "next_due_at";
  pause_signal_ref?: string;
  pause_reason?: string;
  error?: string;
}

export interface ContentFeedbackRefreshLoopHandle {
  readonly statusRef: string;
  start: () => void;
  stop: () => void;
  runOnce: (trigger?: string) => Promise<ContentFeedbackRefreshLoopStatus>;
}

export function createContentFeedbackRefreshLoop(
  options: ContentFeedbackRefreshLoopOptions
): ContentFeedbackRefreshLoopHandle {
  const store = new AgentStore(options.repoRoot, options.stateRoot);
  const statusRef = options.statusRef ?? "services/runtime/content_feedback_refresh.json";
  const startedAt = new Date().toISOString();
  let timer: unknown | null = null;
  let started = false;
  let running = false;
  let lastStatus: ContentFeedbackRefreshLoopStatus | null = null;

  const statusBase = (): Omit<ContentFeedbackRefreshLoopStatus, "state" | "updated_at"> => ({
    service: "content_feedback_refresh",
    enabled: options.enabled,
    pid: process.pid,
    repo_root: options.repoRoot,
    state_root: options.stateRoot,
    interval_ms: options.intervalMs,
    limit: options.limit,
    min_follow_up_age_ms: options.minFollowUpAgeMs,
    ...(options.serverUrl ? { server_url: options.serverUrl } : {}),
    started_at: startedAt
  });

  const writeStatus = async (
    status: ContentFeedbackRefreshLoopStatus
  ): Promise<ContentFeedbackRefreshLoopStatus> => {
    lastStatus = status;
    await store.writeJson(statusRef, status);
    return status;
  };

  const buildStatus = (
    state: ContentFeedbackRefreshLoopState,
    extra: Partial<ContentFeedbackRefreshLoopStatus> = {}
  ): ContentFeedbackRefreshLoopStatus => ({
    ...statusBase(),
    ...pickLastFields(lastStatus),
    ...extra,
    state,
    updated_at: new Date().toISOString()
  });

  const runOnce = async (_trigger = "interval"): Promise<ContentFeedbackRefreshLoopStatus> => {
    await store.ensureLayout();
    if (!options.enabled) {
      return writeStatus(buildStatus("disabled"));
    }
    const pauseSignal = await readPauseSignal(store);
    if (pauseSignal) {
      return writeStatus(buildStatus("paused", {
        last_finished_at: new Date().toISOString(),
        pause_signal_ref: "autonomy/runs/pause_signal.json",
        pause_reason: pauseSignal.reason,
        error: undefined
      }));
    }
    if (running) {
      return writeStatus(buildStatus("idle"));
    }

    running = true;
    const lastStartedAt = new Date().toISOString();
    await writeStatus(buildStatus("running", { last_started_at: lastStartedAt }));
    try {
      const now = options.clock?.() ?? new Date();
      const queue = await listContentFeedbackNeeded(store, {
        limit: options.limit
      });
      const due = queue.items.filter((item) => feedbackRefreshIsDue(item, now, options.minFollowUpAgeMs));
      const deferred = queue.items.filter((item) => !due.includes(item));
      const nextDue = nextFeedbackRefreshDue(queue.items, now, options.minFollowUpAgeMs);
      if (due.length === 0) {
        const strategyStatus = await contentFeedbackStrategyStatus(store, options.limit);
        return await writeStatus(buildStatus("skipped", {
          last_started_at: lastStartedAt,
          last_finished_at: new Date().toISOString(),
          last_queue_count: queue.items.length,
          last_due_count: 0,
          last_deferred_count: queue.items.length,
          last_refreshed_count: 0,
          last_captured_count: 0,
          last_failed_count: 0,
          last_skipped_count: 0,
          last_top_skip_reason: undefined,
          last_skip_reason_counts: undefined,
          last_item_refs: [],
          last_deferred_item_refs: deferred.map((item) => item.run_ref),
          ...strategyStatus,
          ...summarizeNextFeedbackRefreshDue(nextDue),
          pause_signal_ref: undefined,
          pause_reason: undefined,
          error: undefined
        }));
      }

      const autoRefreshable = due.filter(feedbackRefreshCanAutoCapture);
      const skippedDue = due.filter((item) => !feedbackRefreshCanAutoCapture(item));
      const results: RefreshContentFeedbackResult[] = [];
      if (autoRefreshable.length > 0) {
        const client = await resolveFeedbackClient(options);
        if (!client) throw new Error("content feedback refresh requires a configured Xiaohongshu feedback client");
        for (const item of autoRefreshable) {
          results.push(await refreshContentFeedback(store, {
            runRef: item.run_id,
            client,
            limit: 1,
            notes: "resident feedback refresh via xiaohongshu-mcp"
          }));
        }
      }

      const strategyStatus = await contentFeedbackStrategyStatus(store, options.limit);
      const skippedRefs = [
        ...skippedDue.map((item) => item.run_ref),
        ...results.flatMap((result) => result.skipped.map((item) => item.run_ref))
      ];
      const skipReasonSummary = summarizeFeedbackRefreshSkipReasons(
        skippedDue,
        results.flatMap((result) => result.skipped)
      );
      return await writeStatus(buildStatus(autoRefreshable.length > 0 ? "ok" : "skipped", {
        last_started_at: lastStartedAt,
        last_finished_at: new Date().toISOString(),
        last_queue_count: queue.items.length,
        last_due_count: due.length,
        last_deferred_count: queue.items.length - due.length,
        last_refreshed_count: sum(results, (result) => result.count),
        last_captured_count: sum(results, (result) => result.summary.captured_count),
        last_failed_count: sum(results, (result) => result.summary.failed_count),
        last_skipped_count: skippedDue.length + sum(results, (result) => result.summary.skipped_count),
        ...skipReasonSummary,
        last_item_refs: results.flatMap((result) => result.item_refs),
        last_skipped_item_refs: skippedRefs,
        last_deferred_item_refs: deferred.map((item) => item.run_ref),
        ...strategyStatus,
        ...summarizeNextFeedbackRefreshDue(nextDue),
        pause_signal_ref: undefined,
        pause_reason: undefined,
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

  const scheduleNext = (delayMs: number): void => {
    if (!started || timer) return;
    timer = scheduleLoopTimer(options.timerDriver, () => {
      timer = null;
      void runOnce("interval")
        .then(scheduleAfterStatus)
        .catch((error) => {
          logContentFeedbackRefreshError(error);
          scheduleNext(options.intervalMs);
        });
    }, delayMs);
  };

  const scheduleAfterStatus = async (status: ContentFeedbackRefreshLoopStatus): Promise<void> => {
    const now = options.clock?.() ?? new Date();
    const delayMs = nextDueDelayMs({
      intervalMs: options.intervalMs,
      nextDueAt: status.next_due_at,
      now
    });
    await writeStatus({
      ...status,
      ...nextWakeSummary({
        delayMs,
        intervalMs: options.intervalMs,
        nextDueAt: status.next_due_at,
        now
      }),
      updated_at: new Date().toISOString()
    });
    scheduleNext(delayMs);
  };

  return {
    statusRef,
    start: () => {
      if (started) return;
      if (!options.enabled) {
        void writeStatus(buildStatus("disabled")).catch(logContentFeedbackRefreshError);
        return;
      }
      started = true;
      void runOnce("startup")
        .then(scheduleAfterStatus)
        .catch((error) => {
          logContentFeedbackRefreshError(error);
          scheduleNext(options.intervalMs);
        });
    },
    stop: () => {
      started = false;
      if (timer) {
        clearLoopTimer(options.timerDriver, timer);
        timer = null;
      }
      void writeStatus(buildStatus("stopped", {
        next_wake_at: undefined,
        next_wake_delay_ms: undefined,
        next_wake_reason: undefined
      })).catch(logContentFeedbackRefreshError);
    },
    runOnce
  };
}

function feedbackRefreshIsDue(
  item: ContentFeedbackNeededItem,
  now: Date,
  minFollowUpAgeMs: number
): boolean {
  if (item.reason !== "needs_follow_up") return true;
  const nextDueAt = feedbackRefreshDueAt(item, minFollowUpAgeMs);
  return !nextDueAt || Date.parse(nextDueAt) <= now.getTime();
}

function feedbackRefreshCanAutoCapture(item: ContentFeedbackNeededItem): boolean {
  if (item.reason === "missing_snapshot") return true;
  return item.captured_by === "xiaohongshu-mcp"
    && item.next_command.includes("content feedback-capture");
}

function summarizeFeedbackRefreshSkipReasons(
  skippedDue: ContentFeedbackNeededItem[],
  refreshSkips: Array<{ reason: string }>
): Partial<ContentFeedbackRefreshLoopStatus> {
  const counts: Record<string, number> = {};
  for (const item of skippedDue) {
    incrementReason(counts, feedbackRefreshDueSkipReason(item));
  }
  for (const item of refreshSkips) {
    incrementReason(counts, feedbackRefreshResultSkipReason(item.reason));
  }
  const top = Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  return {
    last_top_skip_reason: top?.[0],
    last_skip_reason_counts: top ? counts : undefined
  };
}

function feedbackRefreshDueSkipReason(item: ContentFeedbackNeededItem): string {
  if (item.captured_by !== "xiaohongshu-mcp") return "non_mcp_capture_route";
  if (!item.next_command.includes("content feedback-capture")) return "unsupported_feedback_command";
  return "unknown_auto_capture_policy_miss";
}

function feedbackRefreshResultSkipReason(reason: string): string {
  if (reason.includes("not xiaohongshu-mcp")) return "non_mcp_capture_route";
  if (reason.includes("non-MCP feedback-refresh command")) return "unsupported_feedback_command";
  return "capture_refresh_error";
}

function incrementReason(counts: Record<string, number>, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

interface NextFeedbackRefreshDue {
  due_at: string;
  item: ContentFeedbackNeededItem;
}

function nextFeedbackRefreshDue(
  items: ContentFeedbackNeededItem[],
  now: Date,
  minFollowUpAgeMs: number
): NextFeedbackRefreshDue | undefined {
  const pending = items
    .map((item) => {
      const dueAt = feedbackRefreshDueAt(item, minFollowUpAgeMs);
      return dueAt ? { due_at: dueAt, item } : undefined;
    })
    .filter((value): value is NextFeedbackRefreshDue => Boolean(value))
    .filter((value) => Date.parse(value.due_at) > now.getTime())
    .sort((a, b) =>
      a.due_at.localeCompare(b.due_at)
      || a.item.run_ref.localeCompare(b.item.run_ref)
    );
  return pending[0];
}

function summarizeNextFeedbackRefreshDue(
  nextDue: NextFeedbackRefreshDue | undefined
): Partial<ContentFeedbackRefreshLoopStatus> {
  return {
    next_due_at: nextDue?.due_at,
    next_due_run_id: nextDue?.item.run_id,
    next_due_run_ref: nextDue?.item.run_ref,
    next_due_reason: nextDue?.item.reason,
    next_due_command: nextDue?.item.next_command
  };
}

function feedbackRefreshDueAt(
  item: ContentFeedbackNeededItem,
  minFollowUpAgeMs: number
): string | undefined {
  if (item.reason !== "needs_follow_up" || !item.latest_feedback_at) return undefined;
  const latestMs = Date.parse(item.latest_feedback_at);
  if (!Number.isFinite(latestMs)) return undefined;
  return new Date(latestMs + minFollowUpAgeMs).toISOString();
}

async function contentFeedbackStrategyStatus(
  store: AgentStore,
  limit: number
): Promise<Partial<ContentFeedbackRefreshLoopStatus>> {
  const strategy = await planContentFeedbackStrategy(store, {
    limit,
    capturedBy: "xiaohongshu-mcp"
  });
  return summarizeContentFeedbackStrategy(strategy);
}

function summarizeContentFeedbackStrategy(
  strategy: ContentFeedbackStrategyResult
): Partial<ContentFeedbackRefreshLoopStatus> {
  const top = strategy.suggestions[0];
  return {
    last_strategy_created_at: strategy.created_at,
    last_strategy_captured_by: "xiaohongshu-mcp",
    last_strategy_suggestion_count: strategy.summary.suggestion_count,
    last_strategy_high_priority_count: strategy.summary.high_priority_count,
    last_strategy_collect_more_feedback_count: strategy.summary.collect_more_feedback_count,
    last_strategy_repair_feedback_capture_count: strategy.summary.repair_feedback_capture_count,
    last_strategy_revise_next_post_count: strategy.summary.revise_next_post_count,
    last_strategy_reuse_baseline_count: strategy.summary.reuse_baseline_count,
    last_strategy_verify_metrics_count: strategy.summary.verify_metrics_count,
    ...(top ? {
      last_strategy_top_posture: top.posture,
      last_strategy_top_priority: top.priority,
      last_strategy_top_title: top.title,
      last_strategy_top_run_ref: top.run_ref,
      last_strategy_next_command: top.next_command
    } : {}),
    last_strategy_item_refs: strategy.item_refs
  };
}

async function resolveFeedbackClient(
  options: ContentFeedbackRefreshLoopOptions
): Promise<ExternalFeedbackCaptureClient | undefined> {
  const client = await options.clientFactory?.();
  if (client) return client;
  return options.serverUrl ? new XiaohongshuMcpClient({ serverUrl: options.serverUrl }) : undefined;
}

async function readPauseSignal(store: AgentStore): Promise<{ reason?: string } | null> {
  const signal = await store.readStateJson<Record<string, unknown>>("autonomy/runs/pause_signal.json");
  if (!signal || signal.status !== "active") return null;
  return {
    reason: typeof signal.reason === "string" ? signal.reason : undefined
  };
}

function pickLastFields(
  status: ContentFeedbackRefreshLoopStatus | null
): Partial<ContentFeedbackRefreshLoopStatus> {
  if (!status) return {};
  return {
    last_started_at: status.last_started_at,
    last_finished_at: status.last_finished_at,
    last_queue_count: status.last_queue_count,
    last_due_count: status.last_due_count,
    last_deferred_count: status.last_deferred_count,
    last_refreshed_count: status.last_refreshed_count,
    last_captured_count: status.last_captured_count,
    last_failed_count: status.last_failed_count,
    last_skipped_count: status.last_skipped_count,
    last_top_skip_reason: status.last_top_skip_reason,
    last_skip_reason_counts: status.last_skip_reason_counts,
    last_item_refs: status.last_item_refs,
    last_skipped_item_refs: status.last_skipped_item_refs,
    last_deferred_item_refs: status.last_deferred_item_refs,
    last_strategy_created_at: status.last_strategy_created_at,
    last_strategy_captured_by: status.last_strategy_captured_by,
    last_strategy_suggestion_count: status.last_strategy_suggestion_count,
    last_strategy_high_priority_count: status.last_strategy_high_priority_count,
    last_strategy_collect_more_feedback_count: status.last_strategy_collect_more_feedback_count,
    last_strategy_repair_feedback_capture_count: status.last_strategy_repair_feedback_capture_count,
    last_strategy_revise_next_post_count: status.last_strategy_revise_next_post_count,
    last_strategy_reuse_baseline_count: status.last_strategy_reuse_baseline_count,
    last_strategy_verify_metrics_count: status.last_strategy_verify_metrics_count,
    last_strategy_top_posture: status.last_strategy_top_posture,
    last_strategy_top_priority: status.last_strategy_top_priority,
    last_strategy_top_title: status.last_strategy_top_title,
    last_strategy_top_run_ref: status.last_strategy_top_run_ref,
    last_strategy_next_command: status.last_strategy_next_command,
    last_strategy_item_refs: status.last_strategy_item_refs,
    next_due_at: status.next_due_at,
    next_due_run_id: status.next_due_run_id,
    next_due_run_ref: status.next_due_run_ref,
    next_due_reason: status.next_due_reason,
    next_due_command: status.next_due_command,
    next_wake_at: status.next_wake_at,
    next_wake_delay_ms: status.next_wake_delay_ms,
    next_wake_reason: status.next_wake_reason,
    error: status.error
  };
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

function logContentFeedbackRefreshError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
}
