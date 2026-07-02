import {
  listContentCreatorMetricsNeeded,
  listContentFeedbackNeeded,
  type ContentCreatorMetricsNeededItem,
  type ContentFeedbackNeededItem
} from "../../core/src/content_pipeline.js";
import { AgentStore } from "../../core/src/store.js";
import {
  captureCreatorMetrics,
  type CaptureCreatorMetricsResult,
  type CreatorMetricsCaptureClient
} from "./content_pipeline.js";
import {
  clearLoopTimer,
  nextDueDelayMs,
  nextWakeSummary,
  scheduleLoopTimer,
  type LoopTimerDriver
} from "./loop_schedule.js";

type ContentCreatorMetricsLoopState = "disabled" | "idle" | "running" | "ok" | "skipped" | "error" | "paused" | "stopped";
const DEFAULT_MIN_FOLLOW_UP_AGE_MS = 6 * 60 * 60 * 1000;

export interface ContentCreatorMetricsLoopOptions {
  repoRoot: string;
  stateRoot: string;
  enabled: boolean;
  intervalMs: number;
  limit: number;
  minFollowUpAgeMs?: number;
  creatorUrl: string;
  browserSessionName: string;
  browserAutoConnect: boolean;
  browserCdpPort?: string;
  clientFactory?: () => Promise<CreatorMetricsCaptureClient | undefined>;
  clock?: () => Date;
  timerDriver?: LoopTimerDriver;
  statusRef?: string;
}

export interface ContentCreatorMetricsLoopStatus {
  service: "content_creator_metrics";
  state: ContentCreatorMetricsLoopState;
  enabled: boolean;
  pid: number;
  repo_root: string;
  state_root: string;
  interval_ms: number;
  limit: number;
  min_follow_up_age_ms: number;
  creator_url: string;
  browser_session_name: string;
  browser_auto_connect: boolean;
  browser_cdp_port?: string;
  started_at: string;
  updated_at: string;
  last_started_at?: string;
  last_finished_at?: string;
  last_queue_count?: number;
  last_captured_count?: number;
  last_blocked_count?: number;
  last_failed_count?: number;
  last_item_refs?: string[];
  last_run_refs?: string[];
  last_feedback_refs?: string[];
  last_next_commands?: string[];
  next_due_at?: string;
  next_due_run_id?: string;
  next_due_run_ref?: string;
  next_due_command?: string;
  next_wake_at?: string;
  next_wake_delay_ms?: number;
  next_wake_reason?: "interval" | "next_due_at";
  pause_signal_ref?: string;
  pause_reason?: string;
  error?: string;
}

export interface ContentCreatorMetricsLoopHandle {
  readonly statusRef: string;
  start: () => void;
  stop: () => void;
  runOnce: (trigger?: string) => Promise<ContentCreatorMetricsLoopStatus>;
}

export function createContentCreatorMetricsLoop(
  options: ContentCreatorMetricsLoopOptions
): ContentCreatorMetricsLoopHandle {
  const store = new AgentStore(options.repoRoot, options.stateRoot);
  const statusRef = options.statusRef ?? "services/im/content_creator_metrics.json";
  const startedAt = new Date().toISOString();
  let timer: unknown | null = null;
  let started = false;
  let running = false;
  let lastStatus: ContentCreatorMetricsLoopStatus | null = null;

  const statusBase = (): Omit<ContentCreatorMetricsLoopStatus, "state" | "updated_at"> => ({
    service: "content_creator_metrics",
    enabled: options.enabled,
    pid: process.pid,
    repo_root: options.repoRoot,
    state_root: options.stateRoot,
    interval_ms: options.intervalMs,
    limit: options.limit,
    min_follow_up_age_ms: options.minFollowUpAgeMs ?? DEFAULT_MIN_FOLLOW_UP_AGE_MS,
    creator_url: options.creatorUrl,
    browser_session_name: options.browserSessionName,
    browser_auto_connect: options.browserAutoConnect,
    ...(options.browserCdpPort ? { browser_cdp_port: options.browserCdpPort } : {}),
    started_at: startedAt
  });

  const writeStatus = async (
    status: ContentCreatorMetricsLoopStatus
  ): Promise<ContentCreatorMetricsLoopStatus> => {
    lastStatus = status;
    await store.writeJson(statusRef, status);
    return status;
  };

  const buildStatus = (
    state: ContentCreatorMetricsLoopState,
    extra: Partial<ContentCreatorMetricsLoopStatus> = {}
  ): ContentCreatorMetricsLoopStatus => ({
    ...statusBase(),
    ...pickLastFields(lastStatus),
    ...extra,
    state,
    updated_at: new Date().toISOString()
  });

  const runOnce = async (_trigger = "interval"): Promise<ContentCreatorMetricsLoopStatus> => {
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
      const minFollowUpAgeMs = options.minFollowUpAgeMs ?? DEFAULT_MIN_FOLLOW_UP_AGE_MS;
      const now = options.clock?.() ?? new Date();
      const queue = await listCreatorMetricsQueue(store, {
        limit: options.limit,
        minFollowUpAgeMs,
        now
      });
      const nextDue = await nextCreatorMetricsFollowUpDue(store, {
        minFollowUpAgeMs,
        now
      });
      if (queue.length === 0) {
        return await writeStatus(buildStatus("skipped", {
          last_started_at: lastStartedAt,
          last_finished_at: new Date().toISOString(),
          last_queue_count: 0,
          last_captured_count: 0,
          last_blocked_count: 0,
          last_failed_count: 0,
          last_item_refs: [],
          last_run_refs: [],
          last_feedback_refs: [],
          last_next_commands: [],
          ...summarizeNextCreatorMetricsDue(nextDue),
          pause_signal_ref: undefined,
          pause_reason: undefined,
          error: undefined
        }));
      }

      const client = await options.clientFactory?.();
      const results: CaptureCreatorMetricsResult[] = [];
      for (const item of queue) {
        results.push(await captureCreatorMetrics(store, {
          runRef: item.run_id,
          creatorUrl: options.creatorUrl,
          client,
          browserSessionName: options.browserSessionName,
          browserAutoConnect: options.browserAutoConnect,
          browserCdpPort: options.browserCdpPort,
          notes: "creator metrics captured by resident content creator metrics loop"
        }));
      }

      return await writeStatus(buildStatus("ok", {
        last_started_at: lastStartedAt,
        last_finished_at: new Date().toISOString(),
        last_queue_count: queue.length,
        last_captured_count: countByStatus(results, "captured"),
        last_blocked_count: countByStatus(results, "blocked"),
        last_failed_count: countByStatus(results, "failed"),
        last_item_refs: queue.map((item) => item.item_ref),
        last_run_refs: queue.map((item) => item.run_ref),
        last_feedback_refs: compact(results.map((result) => result.evidence_ref)),
        last_next_commands: compactUnique([
          ...queue.flatMap((item) => item.next_commands),
          ...results.flatMap((result) => result.capture.next_commands ?? [])
        ]),
        ...summarizeNextCreatorMetricsDue(nextDue),
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
          logContentCreatorMetricsError(error);
          scheduleNext(options.intervalMs);
        });
    }, delayMs);
  };

  const scheduleAfterStatus = async (status: ContentCreatorMetricsLoopStatus): Promise<void> => {
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
        void writeStatus(buildStatus("disabled")).catch(logContentCreatorMetricsError);
        return;
      }
      started = true;
      void runOnce("startup")
        .then(scheduleAfterStatus)
        .catch((error) => {
          logContentCreatorMetricsError(error);
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
      })).catch(logContentCreatorMetricsError);
    },
    runOnce
  };
}

interface CreatorMetricsQueueItem {
  run_id: string;
  run_ref: string;
  item_ref: string;
  next_commands: string[];
}

interface NextCreatorMetricsFollowUpDue {
  due_at: string;
  item: ContentFeedbackNeededItem;
}

async function listCreatorMetricsQueue(
  store: AgentStore,
  args: {
    limit: number;
    minFollowUpAgeMs: number;
    now: Date;
  }
): Promise<CreatorMetricsQueueItem[]> {
  const missing = await listContentCreatorMetricsNeeded(store, {
    limit: args.limit,
    capturedBy: "xiaohongshu-mcp"
  });
  const queue = missing.items.map(creatorMetricsNeededQueueItem);
  const seenRunIds = new Set(queue.map((item) => item.run_id));
  if (queue.length >= args.limit) return queue.slice(0, args.limit);

  const feedbackNeeded = await listContentFeedbackNeeded(store, {
    limit: Number.MAX_SAFE_INTEGER
  });
  for (const item of feedbackNeeded.items) {
    if (queue.length >= args.limit) break;
    if (seenRunIds.has(item.run_id)) continue;
    if (!isDueCreatorMetricsFollowUp(item, args.now, args.minFollowUpAgeMs)) continue;
    queue.push(creatorMetricsFollowUpQueueItem(item));
    seenRunIds.add(item.run_id);
  }
  return queue;
}

async function nextCreatorMetricsFollowUpDue(
  store: AgentStore,
  args: {
    minFollowUpAgeMs: number;
    now: Date;
  }
): Promise<NextCreatorMetricsFollowUpDue | undefined> {
  const feedbackNeeded = await listContentFeedbackNeeded(store, {
    limit: Number.MAX_SAFE_INTEGER
  });
  return feedbackNeeded.items
    .map((item) => {
      if (!isCreatorMetricsFollowUp(item)) return undefined;
      const dueAt = feedbackFollowUpDueAt(item, args.minFollowUpAgeMs);
      return dueAt ? { due_at: dueAt, item } : undefined;
    })
    .filter((value): value is NextCreatorMetricsFollowUpDue => Boolean(value))
    .filter((value) => Date.parse(value.due_at) > args.now.getTime())
    .sort((left, right) =>
      left.due_at.localeCompare(right.due_at)
      || left.item.run_ref.localeCompare(right.item.run_ref)
    )[0];
}

function summarizeNextCreatorMetricsDue(
  nextDue: NextCreatorMetricsFollowUpDue | undefined
): Partial<ContentCreatorMetricsLoopStatus> {
  return {
    next_due_at: nextDue?.due_at,
    next_due_run_id: nextDue?.item.run_id,
    next_due_run_ref: nextDue?.item.run_ref,
    next_due_command: nextDue?.item.next_command
  };
}

function creatorMetricsNeededQueueItem(item: ContentCreatorMetricsNeededItem): CreatorMetricsQueueItem {
  return {
    run_id: item.run_id,
    run_ref: item.run_ref,
    item_ref: item.latest_feedback_ref,
    next_commands: item.next_commands
  };
}

function creatorMetricsFollowUpQueueItem(item: ContentFeedbackNeededItem): CreatorMetricsQueueItem {
  return {
    run_id: item.run_id,
    run_ref: item.run_ref,
    item_ref: item.latest_feedback_ref ?? item.run_ref,
    next_commands: [item.next_command]
  };
}

function isDueCreatorMetricsFollowUp(
  item: ContentFeedbackNeededItem,
  now: Date,
  minFollowUpAgeMs: number
): boolean {
  if (!isCreatorMetricsFollowUp(item)) return false;
  const dueAt = feedbackFollowUpDueAt(item, minFollowUpAgeMs);
  return Boolean(dueAt && Date.parse(dueAt) <= now.getTime());
}

function isCreatorMetricsFollowUp(item: ContentFeedbackNeededItem): boolean {
  return item.reason === "needs_follow_up"
    && item.next_command.includes("content creator-metrics-capture");
}

function feedbackFollowUpDueAt(
  item: ContentFeedbackNeededItem,
  minFollowUpAgeMs: number
): string | undefined {
  if (!item.latest_feedback_at) return undefined;
  const latestMs = Date.parse(item.latest_feedback_at);
  if (!Number.isFinite(latestMs)) return undefined;
  return new Date(latestMs + minFollowUpAgeMs).toISOString();
}

async function readPauseSignal(store: AgentStore): Promise<{ reason?: string } | null> {
  const signal = await store.readStateJson<Record<string, unknown>>("autonomy/runs/pause_signal.json");
  if (!signal || signal.status !== "active") return null;
  return {
    reason: typeof signal.reason === "string" ? signal.reason : undefined
  };
}

function pickLastFields(
  status: ContentCreatorMetricsLoopStatus | null
): Partial<ContentCreatorMetricsLoopStatus> {
  if (!status) return {};
  return {
    last_started_at: status.last_started_at,
    last_finished_at: status.last_finished_at,
    last_queue_count: status.last_queue_count,
    last_captured_count: status.last_captured_count,
    last_blocked_count: status.last_blocked_count,
    last_failed_count: status.last_failed_count,
    last_item_refs: status.last_item_refs,
    last_run_refs: status.last_run_refs,
    last_feedback_refs: status.last_feedback_refs,
    last_next_commands: status.last_next_commands,
    next_due_at: status.next_due_at,
    next_due_run_id: status.next_due_run_id,
    next_due_run_ref: status.next_due_run_ref,
    next_due_command: status.next_due_command,
    next_wake_at: status.next_wake_at,
    next_wake_delay_ms: status.next_wake_delay_ms,
    next_wake_reason: status.next_wake_reason,
    error: status.error
  };
}

function countByStatus(
  results: CaptureCreatorMetricsResult[],
  status: CaptureCreatorMetricsResult["status"]
): number {
  return results.filter((result) => result.status === status).length;
}

function compact<T>(items: Array<T | undefined>): T[] {
  return items.filter((item): item is T => item !== undefined);
}

function compactUnique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function logContentCreatorMetricsError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
}
