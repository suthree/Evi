import { BackgroundReviewRunner, type ReviewTickFocus, type ReviewTickResult } from "./background_review.js";
import { getOpportunityBacklog, type OpportunityBacklogItem } from "../../core/src/opportunity_backlog.js";
import type { SkillResolverLike } from "../../core/src/skill_resolver.js";
import { AgentStore } from "../../core/src/store.js";
import {
  executeNextOpportunityAction,
  isAutoExecutableOpportunityAction,
  type ExecuteNextOpportunityActionResult
} from "./opportunity_actions.js";
import {
  clearLoopTimer,
  nextWakeSummary,
  scheduleLoopTimer,
  type LoopTimerDriver
} from "./loop_schedule.js";

type ReviewTickLoopState = "disabled" | "idle" | "running" | "ok" | "error" | "paused" | "stopped";
type ReviewTickFocusCurrentStatus = "not_applicable" | "active" | "resolved" | "covered_by_auto_action";

export interface ReviewTickLoopOptions {
  repoRoot: string;
  stateRoot: string;
  enabled: boolean;
  intervalMs: number;
  limit: number;
  vaultRoot?: SkillResolverLike;
  statusRef?: string;
  clock?: () => Date;
  timerDriver?: LoopTimerDriver;
}

export interface ReviewTickLoopStatus {
  service: "review_tick";
  state: ReviewTickLoopState;
  enabled: boolean;
  pid: number;
  repo_root: string;
  state_root: string;
  interval_ms: number;
  limit: number;
  started_at: string;
  updated_at: string;
  last_started_at?: string;
  last_finished_at?: string;
  last_tick_ref?: string;
  last_inbox_count?: number;
  last_active_tick_inbox_count?: number;
  last_active_inbox_count?: number;
  last_inactive_tick_inbox_count?: number;
  last_inactive_tick_inbox_reasons?: Record<string, number>;
  last_inactive_tick_inbox_refs?: string[];
  last_focus?: ReviewTickFocus;
  last_focus_current_status?: ReviewTickFocusCurrentStatus;
  last_focus_current_ref?: string;
  last_focus_current_backlog_status?: string;
  last_focus_current_reason?: string;
  last_auto_action_status?: "none" | ExecuteNextOpportunityActionResult["status"];
  last_auto_action_ref?: string;
  last_auto_action_opportunity_id?: string;
  last_auto_action_opportunity_kind?: string;
  last_auto_action_result_ref?: string;
  last_auto_action_summary?: string;
  next_wake_at?: string;
  next_wake_delay_ms?: number;
  next_wake_reason?: "interval";
  pause_signal_ref?: string;
  pause_reason?: string;
  error?: string;
}

export interface ReviewTickLoopHandle {
  readonly statusRef: string;
  start: () => void;
  stop: () => void;
  runOnce: (trigger?: string) => Promise<ReviewTickLoopStatus>;
}

export function createReviewTickLoop(options: ReviewTickLoopOptions): ReviewTickLoopHandle {
  const store = new AgentStore(options.repoRoot, options.stateRoot);
  const runner = new BackgroundReviewRunner({
    repoRoot: options.repoRoot,
    stateRoot: options.stateRoot,
    vaultRoot: options.vaultRoot
  });
  const statusRef = options.statusRef ?? "services/im/review_tick.json";
  const startedAt = new Date().toISOString();
  let timer: unknown | null = null;
  let started = false;
  let running = false;
  let lastStatus: ReviewTickLoopStatus | null = null;

  const statusBase = (): Omit<ReviewTickLoopStatus, "state" | "updated_at"> => ({
    service: "review_tick",
    enabled: options.enabled,
    pid: process.pid,
    repo_root: options.repoRoot,
    state_root: options.stateRoot,
    interval_ms: options.intervalMs,
    limit: options.limit,
    started_at: startedAt
  });

  const writeStatus = async (status: ReviewTickLoopStatus): Promise<ReviewTickLoopStatus> => {
    lastStatus = status;
    await store.writeJson(statusRef, status);
    return status;
  };

  const buildStatus = (state: ReviewTickLoopState, extra: Partial<ReviewTickLoopStatus> = {}): ReviewTickLoopStatus => ({
    ...statusBase(),
    ...pickLastFields(lastStatus),
    ...extra,
    state,
    updated_at: new Date().toISOString()
  });

  const runOnce = async (_trigger = "interval"): Promise<ReviewTickLoopStatus> => {
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
      const tick = await runner.runTick({ limit: options.limit });
      const autoAction = await runSafeAutoAction(store, options.limit);
      const activeInbox = await runner.listReviewInbox({ limit: Number.MAX_SAFE_INTEGER });
      const inboxDiagnosis = await diagnoseTickInbox(runner, tick, activeInbox.item_refs);
      const focusCurrent = await currentFocusStatus(store, tick.focus, autoAction, options.limit);
      return await writeStatus(buildStatus("ok", statusFromTick(
        tick,
        lastStartedAt,
        autoAction,
        focusCurrent,
        inboxDiagnosis
      )));
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
          logReviewTickError(error);
          scheduleNext(options.intervalMs);
        });
    }, delayMs);
  };

  const scheduleAfterStatus = async (status: ReviewTickLoopStatus): Promise<void> => {
    const now = options.clock?.() ?? new Date();
    const nextWake = nextWakeSummary({
      delayMs: options.intervalMs,
      intervalMs: options.intervalMs,
      now
    });
    await writeStatus({
      ...status,
      next_wake_at: nextWake.next_wake_at,
      next_wake_delay_ms: nextWake.next_wake_delay_ms,
      next_wake_reason: "interval",
      updated_at: new Date().toISOString()
    });
    scheduleNext(options.intervalMs);
  };

  return {
    statusRef,
    start: () => {
      if (started) return;
      if (!options.enabled) {
        void writeStatus(buildStatus("disabled")).catch(logReviewTickError);
        return;
      }
      started = true;
      void runOnce("startup")
        .then(scheduleAfterStatus)
        .catch((error) => {
          logReviewTickError(error);
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
      })).catch(logReviewTickError);
    },
    runOnce
  };
}

async function runSafeAutoAction(
  store: AgentStore,
  limit: number
): Promise<ExecuteNextOpportunityActionResult | null> {
  const backlog = await getOpportunityBacklog(store, { limit: Math.max(limit, 20) });
  const autoKindPriority: Array<"review_inbox" | "archive_health"> = ["review_inbox", "archive_health"];
  const item = autoKindPriority
    .map((kind) => backlog.items.find((candidate) =>
      candidate.kind === kind && isAutoExecutableOpportunityAction(candidate)
    ))
    .find((candidate) => candidate !== undefined);
  if (!item) return null;
  return executeNextOpportunityAction(store, {
    opportunity: item.id,
    executionMode: "auto",
    allowedKinds: autoKindPriority,
    limit: Number.MAX_SAFE_INTEGER
  });
}

async function readPauseSignal(store: AgentStore): Promise<{ reason?: string } | null> {
  const signal = await store.readStateJson<Record<string, unknown>>("autonomy/runs/pause_signal.json");
  if (!signal || signal.status !== "active") return null;
  return {
    reason: typeof signal.reason === "string" ? signal.reason : undefined
  };
}

function statusFromTick(
  tick: ReviewTickResult,
  lastStartedAt: string,
  autoAction: ExecuteNextOpportunityActionResult | null,
  focusCurrent: ReviewTickFocusCurrentSummary,
  inboxDiagnosis: ReviewTickInboxDiagnosis
): Partial<ReviewTickLoopStatus> {
  return {
    last_started_at: lastStartedAt,
    last_finished_at: new Date().toISOString(),
    last_tick_ref: tick.artifact_refs.json_ref,
    last_inbox_count: tick.inbox_items.length,
    last_active_tick_inbox_count: inboxDiagnosis.active_tick_inbox_count,
    last_active_inbox_count: inboxDiagnosis.active_inbox_count,
    last_inactive_tick_inbox_count: inboxDiagnosis.inactive_tick_inbox_count,
    last_inactive_tick_inbox_reasons: inboxDiagnosis.inactive_tick_inbox_reasons,
    last_inactive_tick_inbox_refs: inboxDiagnosis.inactive_tick_inbox_refs,
    last_focus: tick.focus,
    ...focusCurrent,
    ...statusFromAutoAction(autoAction),
    pause_signal_ref: undefined,
    pause_reason: undefined,
    error: undefined
  };
}

type ReviewTickFocusCurrentSummary = Pick<ReviewTickLoopStatus,
  | "last_focus_current_status"
  | "last_focus_current_ref"
  | "last_focus_current_backlog_status"
  | "last_focus_current_reason"
>;

interface ReviewTickInboxDiagnosis {
  active_tick_inbox_count: number;
  active_inbox_count: number;
  inactive_tick_inbox_count: number;
  inactive_tick_inbox_reasons: Record<string, number>;
  inactive_tick_inbox_refs: string[];
}

async function diagnoseTickInbox(
  runner: BackgroundReviewRunner,
  tick: ReviewTickResult,
  activeInboxRefs: string[]
): Promise<ReviewTickInboxDiagnosis> {
  const activeRefs = new Set(activeInboxRefs);
  const inactiveRefs = tick.inbox_item_refs.filter((ref) => !activeRefs.has(ref));
  const reasons: Record<string, number> = {};
  for (const ref of inactiveRefs) {
    incrementReason(reasons, await inactiveTickInboxReason(runner, ref));
  }
  return {
    active_tick_inbox_count: tick.inbox_item_refs.length - inactiveRefs.length,
    active_inbox_count: activeInboxRefs.length,
    inactive_tick_inbox_count: inactiveRefs.length,
    inactive_tick_inbox_reasons: reasons,
    inactive_tick_inbox_refs: inactiveRefs.slice(0, 10)
  };
}

async function inactiveTickInboxReason(
  runner: BackgroundReviewRunner,
  itemRef: string
): Promise<string> {
  try {
    const detail = await runner.getReviewInboxItem({ itemRef });
    if (detail.item.status === "executed") return "executed_status";
    if (detail.latest_decision?.status === "completed") return "terminal_decision_completed";
    if (detail.latest_decision?.status === "retired") return "terminal_decision_retired";
    if (detail.duplicate_group && detail.duplicate_group.canonical_id !== detail.item.id) {
      return "duplicate_noncanonical";
    }
    return "not_active_unknown";
  } catch {
    return "missing_detail";
  }
}

function incrementReason(reasons: Record<string, number>, reason: string): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

async function currentFocusStatus(
  store: AgentStore,
  focus: ReviewTickFocus,
  autoAction: ExecuteNextOpportunityActionResult | null,
  limit: number
): Promise<ReviewTickFocusCurrentSummary> {
  if (!focus.opportunity) {
    return {
      last_focus_current_status: "not_applicable",
      last_focus_current_ref: undefined,
      last_focus_current_backlog_status: undefined,
      last_focus_current_reason: "review tick focus did not select an opportunity backlog item"
    };
  }

  const focusOpportunity = focus.opportunity;
  const backlog = await getOpportunityBacklog(store, { limit: Math.max(limit, 20) });
  const current = backlog.items.find((item) => sameOpportunity(item, focusOpportunity));
  if (current) {
    return {
      last_focus_current_status: "active",
      last_focus_current_ref: current.ref,
      last_focus_current_backlog_status: current.status,
      last_focus_current_reason: "selected review tick focus is still present in the current opportunity backlog"
    };
  }

  if (
    autoAction?.status === "executed"
    && autoAction.selected_opportunity
    && sameOpportunity(autoAction.selected_opportunity, focusOpportunity)
  ) {
    return {
      last_focus_current_status: "covered_by_auto_action",
      last_focus_current_ref: autoAction.audit_ref,
      last_focus_current_backlog_status: undefined,
      last_focus_current_reason: "selected review tick focus was completed by the same tick auto-action"
    };
  }

  return {
    last_focus_current_status: "resolved",
    last_focus_current_ref: undefined,
    last_focus_current_backlog_status: undefined,
    last_focus_current_reason: "selected review tick focus is no longer present in the current opportunity backlog"
  };
}

function sameOpportunity(
  candidate: Pick<OpportunityBacklogItem, "id" | "kind" | "ref">,
  focus: NonNullable<ReviewTickFocus["opportunity"]>
): boolean {
  return (candidate.id === focus.id && candidate.kind === focus.kind) || candidate.ref === focus.ref;
}

function statusFromAutoAction(
  action: ExecuteNextOpportunityActionResult | null
): Pick<ReviewTickLoopStatus,
  | "last_auto_action_status"
  | "last_auto_action_ref"
  | "last_auto_action_opportunity_id"
  | "last_auto_action_opportunity_kind"
  | "last_auto_action_result_ref"
  | "last_auto_action_summary"
> {
  if (!action) {
    return {
      last_auto_action_status: "none",
      last_auto_action_ref: undefined,
      last_auto_action_opportunity_id: undefined,
      last_auto_action_opportunity_kind: undefined,
      last_auto_action_result_ref: undefined,
      last_auto_action_summary: undefined
    };
  }
  return {
    last_auto_action_status: action.status,
    last_auto_action_ref: action.audit_ref,
    last_auto_action_opportunity_id: action.selected_opportunity?.id,
    last_auto_action_opportunity_kind: action.selected_opportunity?.kind,
    last_auto_action_result_ref: action.record.result_ref,
    last_auto_action_summary: action.review_inbox_completion
      ? `${action.review_inbox_completion.completion_kind}: ${action.review_inbox_completion.reason}`
      : action.archive_refresh
      ? `archive_refresh: ${action.archive_refresh.health_status}, remaining=${action.archive_refresh.remaining_issue_count}`
      : action.record.blocked_reason ?? action.record.skipped_reason
  };
}

function pickLastFields(status: ReviewTickLoopStatus | null): Partial<ReviewTickLoopStatus> {
  if (!status) return {};
  return {
    last_started_at: status.last_started_at,
    last_finished_at: status.last_finished_at,
    last_tick_ref: status.last_tick_ref,
    last_inbox_count: status.last_inbox_count,
    last_active_tick_inbox_count: status.last_active_tick_inbox_count,
    last_active_inbox_count: status.last_active_inbox_count,
    last_inactive_tick_inbox_count: status.last_inactive_tick_inbox_count,
    last_inactive_tick_inbox_reasons: status.last_inactive_tick_inbox_reasons,
    last_inactive_tick_inbox_refs: status.last_inactive_tick_inbox_refs,
    last_focus: status.last_focus,
    last_focus_current_status: status.last_focus_current_status,
    last_focus_current_ref: status.last_focus_current_ref,
    last_focus_current_backlog_status: status.last_focus_current_backlog_status,
    last_focus_current_reason: status.last_focus_current_reason,
    last_auto_action_status: status.last_auto_action_status,
    last_auto_action_ref: status.last_auto_action_ref,
    last_auto_action_opportunity_id: status.last_auto_action_opportunity_id,
    last_auto_action_opportunity_kind: status.last_auto_action_opportunity_kind,
    last_auto_action_result_ref: status.last_auto_action_result_ref,
    last_auto_action_summary: status.last_auto_action_summary,
    next_wake_at: status.next_wake_at,
    next_wake_delay_ms: status.next_wake_delay_ms,
    next_wake_reason: status.next_wake_reason,
    error: status.error
  };
}

function logReviewTickError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
}
