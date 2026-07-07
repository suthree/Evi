import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { AgentStore } from "./store.js";

const DEFAULT_SERVICE_HEALTH_TARGET = "im";
const PAUSE_REF = "autonomy/runs/pause_signal.json";
const DEFAULT_HEARTBEAT_STALE_AFTER_MS = 90_000;
const DEFAULT_CONTENT_DAILY_STEP_STALE_AFTER_MS = 10 * 60_000;
const BOUNDARY = "read-only local service health; reads heartbeat, resident loop status, typed content daily job/run metadata, latest local opportunity action coverage metadata, autonomy pause state, and bounded repo git identity from .git/HEAD/refs only; does not inspect launchd, read logs, run shell commands, invoke the model, read source file bodies, open browsers, fetch platform state, publish externally, or mutate state";
const SUPPRESSING_MANUAL_ACTION_SLICES = new Set([
  "external_publish_preflight_contract",
  "post_publish_feedback_capture_contract",
  "creator_metrics_capture_readiness_loop",
  "feedback_strategy_next_generation_ready",
  "feedback_strategy_preview_review",
  "feedback_refresh_route_review"
]);

export type ServiceHealthStatus = "healthy" | "attention" | "paused" | "unknown";
export type ServiceHeartbeatFreshness = "fresh" | "stale" | "missing" | "invalid";
export type ServiceProgressFreshness = "fresh" | "stale" | "unknown";
export type ServiceRepoHeadReadStatus = "ok" | "missing" | "unreadable";
export type ServiceDeploymentStatus = "current" | "stale" | "unknown";
export type ContentDailyEffectiveJobStatus = "missing" | "drafted" | "image_generated" | "preflight_ok" | "published" | "blocked";
export type ServiceGatewayState = "running" | "stopped" | "error";
export type ServiceHealthTarget = "im" | "runtime";

export interface ServiceGatewayChannelSummary {
  kind: string;
  channel_id: string;
  state: ServiceGatewayState;
  detail?: string;
}

export interface ServiceGatewaySummary {
  state: ServiceGatewayState;
  channels: ServiceGatewayChannelSummary[];
}

export interface ServiceHealthLayerSummary {
  status: ServiceHealthStatus;
  reason_codes: string[];
}

export interface ServiceRuntimeBuildSummary {
  schema_version?: number;
  target?: string;
  runtime_current_root?: string;
  repo_root?: string;
  built_at?: string;
  node_version?: string;
  source_commit?: string;
  source_commit_short?: string;
  source_branch?: string;
  source_is_dirty?: boolean;
}

export interface ServiceRepoHeadSummary {
  repo_root: string;
  git_dir?: string;
  read_status: ServiceRepoHeadReadStatus;
  head_ref?: string;
  branch?: string;
  head_commit?: string;
  head_commit_short?: string;
  reason?: string;
}

export interface ServiceDeploymentSummary {
  status: ServiceDeploymentStatus;
  runtime_commit?: string;
  runtime_commit_short?: string;
  runtime_branch?: string;
  repo_commit?: string;
  repo_commit_short?: string;
  repo_branch?: string;
  reason: string;
  restart_command: string;
}

export interface ServiceReviewTickFocusSummary {
  source: string;
  reason: string;
  query: string | null;
  opportunity?: {
    ref: string;
    id: string;
    kind: string;
    status: string;
    score: number;
    action_kind?: string;
    source_ref?: string;
    action_chain?: ServiceReviewTickFocusActionStep[];
  };
}

export interface ServiceReviewTickFocusActionStep {
  label: string;
  effect: string;
  reason?: string;
}

interface ManualFocusCoverage {
  status: "covered_by_manual_action";
  ref: string;
  reason: string;
}

export interface ServiceHealthResult {
  created_at: string;
  target: ServiceHealthTarget;
  status: ServiceHealthStatus;
  status_reasons: string[];
  layers: {
    runtime_substrate: ServiceHealthLayerSummary;
    application_slices: ServiceHealthLayerSummary;
  };
  boundary: string;
  refs: string[];
  service: ServiceHealthServiceSummary;
  im: ServiceHealthServiceSummary;
  review_tick: {
    state: string;
    enabled: boolean;
    ref: string;
    updated_at?: string;
    last_tick_ref?: string;
    last_inbox_count?: number;
    last_active_tick_inbox_count?: number;
    last_active_inbox_count?: number;
    last_inactive_tick_inbox_count?: number;
    last_inactive_tick_inbox_reasons?: Record<string, number>;
    last_inactive_tick_inbox_refs?: string[];
    last_focus?: ServiceReviewTickFocusSummary;
    last_focus_current_status?: string;
    last_focus_current_ref?: string;
    last_focus_current_backlog_status?: string;
    last_focus_current_reason?: string;
    last_auto_action_status?: string;
    last_auto_action_ref?: string;
    last_auto_action_opportunity_id?: string;
    last_auto_action_opportunity_kind?: string;
    last_auto_action_result_ref?: string;
    last_auto_action_summary?: string;
    next_wake_at?: string;
    next_wake_delay_ms?: number;
    next_wake_reason?: string;
    pause_signal_ref?: string;
  };
  content_daily: {
    state: string;
    enabled: boolean;
    ref: string;
    updated_at?: string;
    last_finished_at?: string;
    last_date_key?: string;
    last_track_id?: string;
    last_job_status?: string;
    last_effective_job_status?: ContentDailyEffectiveJobStatus;
    last_job_count?: number;
    last_skip_reason?: string;
    last_applied_strategy_count?: number;
    last_applied_strategy_run_refs?: string[];
    last_applied_strategy_source_run_refs?: string[];
    last_applied_strategy_postures?: string[];
    last_applied_strategy_source_titles?: string[];
    last_blocked_strategy_count?: number;
    last_blocked_strategy_source_run_refs?: string[];
    last_blocked_strategy_postures?: string[];
    last_blocked_strategy_source_titles?: string[];
    last_blocked_strategy_reasons?: string[];
    last_blocked_strategy_next_commands?: string[];
    last_publish_count?: number;
    last_publish_published_count?: number;
    last_publish_direct_count?: number;
    last_publish_reconciled_count?: number;
    last_publish_failed_count?: number;
    last_publish_adapters?: string[];
    last_publish_tools?: string[];
    last_publish_run_refs?: string[];
    last_publish_latest_run_ref?: string;
    last_publish_latest_title?: string;
    last_publish_latest_route?: string;
    last_publish_latest_post_id?: string;
    last_publish_latest_post_url?: string;
    current_track_id?: string;
    current_track_index?: number;
    current_track_count?: number;
    current_step?: string;
    current_step_status?: string;
    current_step_summary?: string;
    current_step_started_at?: string;
    current_step_updated_at?: string;
    current_step_age_ms?: number;
    current_step_freshness?: ServiceProgressFreshness;
    current_job_ref?: string;
    current_run_ref?: string;
    error?: string;
  };
  content_feedback_refresh: {
    state: string;
    enabled: boolean;
    ref: string;
    updated_at?: string;
    last_finished_at?: string;
    last_queue_count?: number;
    last_due_count?: number;
    last_deferred_count?: number;
    last_skipped_count?: number;
    last_top_skip_reason?: string;
    last_skip_reason_counts?: Record<string, number>;
    last_captured_count?: number;
    last_skipped_item_refs?: string[];
    last_deferred_item_refs?: string[];
    last_strategy_created_at?: string;
    last_strategy_captured_by?: string;
    last_strategy_suggestion_count?: number;
    last_strategy_high_priority_count?: number;
    last_strategy_collect_more_feedback_count?: number;
    last_strategy_repair_feedback_capture_count?: number;
    last_strategy_revise_next_post_count?: number;
    last_strategy_reuse_baseline_count?: number;
    last_strategy_verify_metrics_count?: number;
    last_strategy_top_posture?: string;
    last_strategy_top_priority?: string;
    last_strategy_top_title?: string;
    last_strategy_top_run_ref?: string;
    last_strategy_next_command?: string;
    last_strategy_item_refs?: string[];
    next_due_at?: string;
    next_due_run_id?: string;
    next_due_run_ref?: string;
    next_due_reason?: string;
    next_due_command?: string;
    next_wake_at?: string;
    next_wake_delay_ms?: number;
    next_wake_reason?: string;
    error?: string;
  };
  content_creator_metrics: {
    state: string;
    enabled: boolean;
    ref: string;
    updated_at?: string;
    last_finished_at?: string;
    last_queue_count?: number;
    last_captured_count?: number;
    last_blocked_count?: number;
    last_failed_count?: number;
    last_run_refs?: string[];
    last_feedback_refs?: string[];
    last_next_commands?: string[];
    next_due_at?: string;
    next_due_run_id?: string;
    next_due_run_ref?: string;
    next_due_command?: string;
    next_wake_at?: string;
    next_wake_delay_ms?: number;
    next_wake_reason?: string;
    error?: string;
  };
  autonomy_pause: {
    active: boolean;
    ref: typeof PAUSE_REF;
    id?: string;
    status?: string;
    reason?: string;
    resume_hint?: string;
  };
}

export interface ServiceHealthServiceSummary {
  state: string;
  error?: string;
  pid?: number;
  channel_id?: string;
  scenario_id?: string;
  heartbeat_ref: string;
  heartbeat_updated_at?: string;
  heartbeat_age_ms?: number;
  heartbeat_freshness: ServiceHeartbeatFreshness;
  gateway?: ServiceGatewaySummary;
  runtime_build?: ServiceRuntimeBuildSummary;
  repo_head: ServiceRepoHeadSummary;
  deployment: ServiceDeploymentSummary;
}

interface ServiceHealthRefs {
  heartbeat: string;
  reviewTick: string;
  contentDaily: string;
  contentFeedbackRefresh: string;
  contentCreatorMetrics: string;
}

export async function getServiceHealth(
  store: AgentStore,
  args: {
    target?: ServiceHealthTarget;
    now?: Date | string;
    heartbeatStaleAfterMs?: number;
    contentDailyStepStaleAfterMs?: number;
  } = {}
): Promise<ServiceHealthResult> {
  const target = args.target ?? DEFAULT_SERVICE_HEALTH_TARGET;
  const serviceRefs = serviceHealthRefs(target);
  const now = args.now instanceof Date ? args.now : new Date(args.now ?? Date.now());
  const staleAfterMs = args.heartbeatStaleAfterMs ?? DEFAULT_HEARTBEAT_STALE_AFTER_MS;
  const contentDailyStepStaleAfterMs = args.contentDailyStepStaleAfterMs ?? DEFAULT_CONTENT_DAILY_STEP_STALE_AFTER_MS;
  const [heartbeat, reviewTick, contentDaily, contentFeedbackRefresh, contentCreatorMetrics, pauseSignal, repoHead] = await Promise.all([
    readStateRecord(store, serviceRefs.heartbeat),
    readStateRecord(store, serviceRefs.reviewTick),
    readStateRecord(store, serviceRefs.contentDaily),
    readStateRecord(store, serviceRefs.contentFeedbackRefresh),
    readStateRecord(store, serviceRefs.contentCreatorMetrics),
    readStateRecord(store, PAUSE_REF),
    readRepoHead(store.repoRoot)
  ]);
  const heartbeatFreshness = serviceHeartbeatFreshness(heartbeat, now, staleAfterMs);
  const activePause = stringField(pauseSignal.record, "status") === "active";
  const runtimeBuild = normalizeRuntimeBuild(recordField(heartbeat.record, "runtime_build"));
  const channelId = stringField(heartbeat.record, "channel_id") ?? undefined;
  const scenarioId = stringField(heartbeat.record, "scenario_id") ?? undefined;
  const deployment = summarizeDeployment(runtimeBuild, repoHead, {
    target,
    channelId,
    scenarioId
  });
  const contentDailyEffective = await summarizeContentDailyEffectiveStatus(store, contentDaily.record);
  const parsedReviewTickFocus = reviewTickFocus(recordField(reviewTick.record, "last_focus"));
  const storedFocusCurrentStatus = stringField(reviewTick.record, "last_focus_current_status") ?? undefined;
  const manualFocusCoverage = await readManualFocusCoverage(store, {
    focus: parsedReviewTickFocus,
    storedStatus: storedFocusCurrentStatus,
    reviewTickUpdatedAt: stringField(reviewTick.record, "updated_at") ?? undefined
  });
  const contentDailyProgress = serviceProgressFreshness(
    contentDaily.record,
    now,
    contentDailyStepStaleAfterMs
  );
  const service: ServiceHealthServiceSummary = {
    state: stringField(heartbeat.record, "state") ?? "unknown",
    error: stringField(heartbeat.record, "error") ?? undefined,
    pid: numberField(heartbeat.record, "pid") ?? undefined,
    channel_id: channelId,
    scenario_id: scenarioId,
    heartbeat_ref: serviceRefs.heartbeat,
    heartbeat_updated_at: stringField(heartbeat.record, "updated_at") ?? undefined,
    heartbeat_age_ms: heartbeatFreshness.ageMs,
    heartbeat_freshness: heartbeatFreshness.status,
    gateway: serviceGatewaySummary(recordField(heartbeat.record, "gateway")),
    runtime_build: runtimeBuild ?? undefined,
    repo_head: repoHead,
    deployment
  };
  const result: ServiceHealthResult = {
    created_at: now.toISOString(),
    target,
    status: "unknown",
    status_reasons: [],
    layers: {
      runtime_substrate: { status: "unknown", reason_codes: [] },
      application_slices: { status: "unknown", reason_codes: [] }
    },
    boundary: BOUNDARY,
    refs: [
      ...(heartbeat.exists ? [serviceRefs.heartbeat] : []),
      ...(reviewTick.exists ? [serviceRefs.reviewTick] : []),
      ...(contentDaily.exists ? [serviceRefs.contentDaily] : []),
      ...(contentFeedbackRefresh.exists ? [serviceRefs.contentFeedbackRefresh] : []),
      ...(contentCreatorMetrics.exists ? [serviceRefs.contentCreatorMetrics] : []),
      ...(pauseSignal.exists ? [PAUSE_REF] : [])
    ],
    service,
    im: service,
    review_tick: {
      state: stringField(reviewTick.record, "state") ?? "unknown",
      enabled: booleanField(reviewTick.record, "enabled") ?? false,
      ref: serviceRefs.reviewTick,
      updated_at: stringField(reviewTick.record, "updated_at") ?? undefined,
      last_tick_ref: stringField(reviewTick.record, "last_tick_ref") ?? undefined,
      last_inbox_count: numberField(reviewTick.record, "last_inbox_count") ?? undefined,
      last_active_tick_inbox_count: numberField(reviewTick.record, "last_active_tick_inbox_count") ?? undefined,
      last_active_inbox_count: numberField(reviewTick.record, "last_active_inbox_count") ?? undefined,
      last_inactive_tick_inbox_count: numberField(reviewTick.record, "last_inactive_tick_inbox_count") ?? undefined,
      last_inactive_tick_inbox_reasons: numberRecordField(reviewTick.record, "last_inactive_tick_inbox_reasons"),
      last_inactive_tick_inbox_refs: stringArrayField(reviewTick.record, "last_inactive_tick_inbox_refs"),
      last_focus: parsedReviewTickFocus ?? undefined,
      last_focus_current_status: manualFocusCoverage?.status ?? storedFocusCurrentStatus,
      last_focus_current_ref: manualFocusCoverage?.ref ?? stringField(reviewTick.record, "last_focus_current_ref") ?? undefined,
      last_focus_current_backlog_status: manualFocusCoverage ? undefined : stringField(reviewTick.record, "last_focus_current_backlog_status") ?? undefined,
      last_focus_current_reason: manualFocusCoverage?.reason ?? stringField(reviewTick.record, "last_focus_current_reason") ?? undefined,
      last_auto_action_status: stringField(reviewTick.record, "last_auto_action_status") ?? undefined,
      last_auto_action_ref: stringField(reviewTick.record, "last_auto_action_ref") ?? undefined,
      last_auto_action_opportunity_id: stringField(reviewTick.record, "last_auto_action_opportunity_id") ?? undefined,
      last_auto_action_opportunity_kind: stringField(reviewTick.record, "last_auto_action_opportunity_kind") ?? undefined,
      last_auto_action_result_ref: stringField(reviewTick.record, "last_auto_action_result_ref") ?? undefined,
      last_auto_action_summary: stringField(reviewTick.record, "last_auto_action_summary") ?? undefined,
      next_wake_at: stringField(reviewTick.record, "next_wake_at") ?? undefined,
      next_wake_delay_ms: numberField(reviewTick.record, "next_wake_delay_ms") ?? undefined,
      next_wake_reason: stringField(reviewTick.record, "next_wake_reason") ?? undefined,
      pause_signal_ref: stringField(reviewTick.record, "pause_signal_ref") ?? undefined
    },
    content_daily: {
      state: stringField(contentDaily.record, "state") ?? "unknown",
      enabled: booleanField(contentDaily.record, "enabled") ?? false,
      ref: serviceRefs.contentDaily,
      updated_at: stringField(contentDaily.record, "updated_at") ?? undefined,
      last_finished_at: stringField(contentDaily.record, "last_finished_at") ?? undefined,
      last_date_key: stringField(contentDaily.record, "last_date_key") ?? undefined,
      last_track_id: stringField(contentDaily.record, "last_track_id") ?? undefined,
      last_job_status: stringField(contentDaily.record, "last_job_status") ?? undefined,
      last_effective_job_status: contentDailyEffective.status,
      last_job_count: numberField(contentDaily.record, "last_job_count") ?? undefined,
      last_skip_reason: stringField(contentDaily.record, "last_skip_reason") ?? undefined,
      last_applied_strategy_count: numberField(contentDaily.record, "last_applied_strategy_count") ?? undefined,
      last_applied_strategy_run_refs: stringArrayField(contentDaily.record, "last_applied_strategy_run_refs"),
      last_applied_strategy_source_run_refs: stringArrayField(contentDaily.record, "last_applied_strategy_source_run_refs"),
      last_applied_strategy_postures: stringArrayField(contentDaily.record, "last_applied_strategy_postures"),
      last_applied_strategy_source_titles: stringArrayField(contentDaily.record, "last_applied_strategy_source_titles"),
      last_blocked_strategy_count: numberField(contentDaily.record, "last_blocked_strategy_count") ?? undefined,
      last_blocked_strategy_source_run_refs: stringArrayField(contentDaily.record, "last_blocked_strategy_source_run_refs"),
      last_blocked_strategy_postures: stringArrayField(contentDaily.record, "last_blocked_strategy_postures"),
      last_blocked_strategy_source_titles: stringArrayField(contentDaily.record, "last_blocked_strategy_source_titles"),
      last_blocked_strategy_reasons: stringArrayField(contentDaily.record, "last_blocked_strategy_reasons"),
      last_blocked_strategy_next_commands: stringArrayField(contentDaily.record, "last_blocked_strategy_next_commands"),
      last_publish_count: numberField(contentDaily.record, "last_publish_count") ?? undefined,
      last_publish_published_count: numberField(contentDaily.record, "last_publish_published_count") ?? undefined,
      last_publish_direct_count: numberField(contentDaily.record, "last_publish_direct_count") ?? undefined,
      last_publish_reconciled_count: numberField(contentDaily.record, "last_publish_reconciled_count") ?? undefined,
      last_publish_failed_count: numberField(contentDaily.record, "last_publish_failed_count") ?? undefined,
      last_publish_adapters: stringArrayField(contentDaily.record, "last_publish_adapters"),
      last_publish_tools: stringArrayField(contentDaily.record, "last_publish_tools"),
      last_publish_run_refs: stringArrayField(contentDaily.record, "last_publish_run_refs"),
      last_publish_latest_run_ref: stringField(contentDaily.record, "last_publish_latest_run_ref") ?? undefined,
      last_publish_latest_title: stringField(contentDaily.record, "last_publish_latest_title") ?? undefined,
      last_publish_latest_route: stringField(contentDaily.record, "last_publish_latest_route") ?? undefined,
      last_publish_latest_post_id: stringField(contentDaily.record, "last_publish_latest_post_id") ?? undefined,
      last_publish_latest_post_url: stringField(contentDaily.record, "last_publish_latest_post_url") ?? undefined,
      current_track_id: stringField(contentDaily.record, "current_track_id") ?? undefined,
      current_track_index: numberField(contentDaily.record, "current_track_index") ?? undefined,
      current_track_count: numberField(contentDaily.record, "current_track_count") ?? undefined,
      current_step: stringField(contentDaily.record, "current_step") ?? undefined,
      current_step_status: stringField(contentDaily.record, "current_step_status") ?? undefined,
      current_step_summary: stringField(contentDaily.record, "current_step_summary") ?? undefined,
      current_step_started_at: stringField(contentDaily.record, "current_step_started_at") ?? undefined,
      current_step_updated_at: stringField(contentDaily.record, "current_step_updated_at") ?? undefined,
      current_step_age_ms: contentDailyProgress.ageMs,
      current_step_freshness: contentDailyProgress.status,
      current_job_ref: stringField(contentDaily.record, "current_job_ref") ?? undefined,
      current_run_ref: stringField(contentDaily.record, "current_run_ref") ?? undefined,
      error: stringField(contentDaily.record, "error") ?? undefined
    },
    content_feedback_refresh: {
      state: stringField(contentFeedbackRefresh.record, "state") ?? "unknown",
      enabled: booleanField(contentFeedbackRefresh.record, "enabled") ?? false,
      ref: serviceRefs.contentFeedbackRefresh,
      updated_at: stringField(contentFeedbackRefresh.record, "updated_at") ?? undefined,
      last_finished_at: stringField(contentFeedbackRefresh.record, "last_finished_at") ?? undefined,
      last_queue_count: numberField(contentFeedbackRefresh.record, "last_queue_count") ?? undefined,
      last_due_count: numberField(contentFeedbackRefresh.record, "last_due_count") ?? undefined,
      last_deferred_count: numberField(contentFeedbackRefresh.record, "last_deferred_count") ?? undefined,
      last_skipped_count: numberField(contentFeedbackRefresh.record, "last_skipped_count") ?? undefined,
      last_top_skip_reason: stringField(contentFeedbackRefresh.record, "last_top_skip_reason") ?? undefined,
      last_skip_reason_counts: numberRecordField(contentFeedbackRefresh.record, "last_skip_reason_counts"),
      last_captured_count: numberField(contentFeedbackRefresh.record, "last_captured_count") ?? undefined,
      last_skipped_item_refs: stringArrayField(contentFeedbackRefresh.record, "last_skipped_item_refs"),
      last_deferred_item_refs: stringArrayField(contentFeedbackRefresh.record, "last_deferred_item_refs"),
      last_strategy_created_at: stringField(contentFeedbackRefresh.record, "last_strategy_created_at") ?? undefined,
      last_strategy_captured_by: stringField(contentFeedbackRefresh.record, "last_strategy_captured_by") ?? undefined,
      last_strategy_suggestion_count: numberField(contentFeedbackRefresh.record, "last_strategy_suggestion_count") ?? undefined,
      last_strategy_high_priority_count: numberField(contentFeedbackRefresh.record, "last_strategy_high_priority_count") ?? undefined,
      last_strategy_collect_more_feedback_count: numberField(contentFeedbackRefresh.record, "last_strategy_collect_more_feedback_count") ?? undefined,
      last_strategy_repair_feedback_capture_count: numberField(contentFeedbackRefresh.record, "last_strategy_repair_feedback_capture_count") ?? undefined,
      last_strategy_revise_next_post_count: numberField(contentFeedbackRefresh.record, "last_strategy_revise_next_post_count") ?? undefined,
      last_strategy_reuse_baseline_count: numberField(contentFeedbackRefresh.record, "last_strategy_reuse_baseline_count") ?? undefined,
      last_strategy_verify_metrics_count: numberField(contentFeedbackRefresh.record, "last_strategy_verify_metrics_count") ?? undefined,
      last_strategy_top_posture: stringField(contentFeedbackRefresh.record, "last_strategy_top_posture") ?? undefined,
      last_strategy_top_priority: stringField(contentFeedbackRefresh.record, "last_strategy_top_priority") ?? undefined,
      last_strategy_top_title: stringField(contentFeedbackRefresh.record, "last_strategy_top_title") ?? undefined,
      last_strategy_top_run_ref: stringField(contentFeedbackRefresh.record, "last_strategy_top_run_ref") ?? undefined,
      last_strategy_next_command: stringField(contentFeedbackRefresh.record, "last_strategy_next_command") ?? undefined,
      last_strategy_item_refs: stringArrayField(contentFeedbackRefresh.record, "last_strategy_item_refs"),
      next_due_at: stringField(contentFeedbackRefresh.record, "next_due_at") ?? undefined,
      next_due_run_id: stringField(contentFeedbackRefresh.record, "next_due_run_id") ?? undefined,
      next_due_run_ref: stringField(contentFeedbackRefresh.record, "next_due_run_ref") ?? undefined,
      next_due_reason: stringField(contentFeedbackRefresh.record, "next_due_reason") ?? undefined,
      next_due_command: stringField(contentFeedbackRefresh.record, "next_due_command") ?? undefined,
      next_wake_at: stringField(contentFeedbackRefresh.record, "next_wake_at") ?? undefined,
      next_wake_delay_ms: numberField(contentFeedbackRefresh.record, "next_wake_delay_ms") ?? undefined,
      next_wake_reason: stringField(contentFeedbackRefresh.record, "next_wake_reason") ?? undefined,
      error: stringField(contentFeedbackRefresh.record, "error") ?? undefined
    },
    content_creator_metrics: {
      state: stringField(contentCreatorMetrics.record, "state") ?? "unknown",
      enabled: booleanField(contentCreatorMetrics.record, "enabled") ?? false,
      ref: serviceRefs.contentCreatorMetrics,
      updated_at: stringField(contentCreatorMetrics.record, "updated_at") ?? undefined,
      last_finished_at: stringField(contentCreatorMetrics.record, "last_finished_at") ?? undefined,
      last_queue_count: numberField(contentCreatorMetrics.record, "last_queue_count") ?? undefined,
      last_captured_count: numberField(contentCreatorMetrics.record, "last_captured_count") ?? undefined,
      last_blocked_count: numberField(contentCreatorMetrics.record, "last_blocked_count") ?? undefined,
      last_failed_count: numberField(contentCreatorMetrics.record, "last_failed_count") ?? undefined,
      last_run_refs: stringArrayField(contentCreatorMetrics.record, "last_run_refs"),
      last_feedback_refs: stringArrayField(contentCreatorMetrics.record, "last_feedback_refs"),
      last_next_commands: stringArrayField(contentCreatorMetrics.record, "last_next_commands"),
      next_due_at: stringField(contentCreatorMetrics.record, "next_due_at") ?? undefined,
      next_due_run_id: stringField(contentCreatorMetrics.record, "next_due_run_id") ?? undefined,
      next_due_run_ref: stringField(contentCreatorMetrics.record, "next_due_run_ref") ?? undefined,
      next_due_command: stringField(contentCreatorMetrics.record, "next_due_command") ?? undefined,
      next_wake_at: stringField(contentCreatorMetrics.record, "next_wake_at") ?? undefined,
      next_wake_delay_ms: numberField(contentCreatorMetrics.record, "next_wake_delay_ms") ?? undefined,
      next_wake_reason: stringField(contentCreatorMetrics.record, "next_wake_reason") ?? undefined,
      error: stringField(contentCreatorMetrics.record, "error") ?? undefined
    },
    autonomy_pause: {
      active: activePause,
      ref: PAUSE_REF,
      id: stringField(pauseSignal.record, "id") ?? undefined,
      status: stringField(pauseSignal.record, "status") ?? undefined,
      reason: stringField(pauseSignal.record, "reason") ?? undefined,
      resume_hint: stringField(pauseSignal.record, "resume_hint") ?? undefined
    }
  };
  result.layers = serviceHealthLayers(result);
  result.status_reasons = compactUnique([
    ...result.layers.runtime_substrate.reason_codes,
    ...result.layers.application_slices.reason_codes
  ]);
  result.status = overallServiceHealth(result);
  return result;
}

export interface ContentDailyEffectiveStatusSummary {
  status?: ContentDailyEffectiveJobStatus;
  count: number;
  job_refs: string[];
  run_refs: string[];
}

export async function summarizeContentDailyEffectiveStatus(
  store: AgentStore,
  contentDailyRecord: Record<string, unknown> | null
): Promise<ContentDailyEffectiveStatusSummary> {
  const jobRefs = contentDailyJobRefs(contentDailyRecord);
  if (jobRefs.length === 0) {
    return {
      count: 0,
      job_refs: [],
      run_refs: []
    };
  }

  const statuses: ContentDailyEffectiveJobStatus[] = [];
  const runRefs: string[] = [];
  for (const jobRef of jobRefs) {
    const job = await readStateRecord(store, jobRef);
    const jobStatus = contentDailyJobStatus(stringField(job.record, "status")) ?? "missing";
    const runRef = stringField(job.record, "run_ref") ?? contentRunRefFromId(stringField(job.record, "run_id"));
    let effectiveStatus = jobStatus;
    if (runRef) {
      runRefs.push(runRef);
      const run = await readStateRecord(store, runRef);
      if (contentRunHasPublishedProof(run.record)) effectiveStatus = "published";
    }
    statuses.push(effectiveStatus);
  }

  return {
    status: summarizeContentDailyEffectiveStatuses(statuses),
    count: statuses.length,
    job_refs: jobRefs,
    run_refs: compactUnique(runRefs)
  };
}

function serviceHeartbeatFreshness(
  heartbeat: StateRecordRead,
  now: Date,
  staleAfterMs: number
): { status: ServiceHeartbeatFreshness; ageMs?: number } {
  if (!heartbeat.exists) return { status: "missing" };
  if (!heartbeat.record) return { status: "invalid" };
  const updatedAt = stringField(heartbeat.record, "updated_at");
  if (!updatedAt) return { status: "invalid" };
  const updatedAtMs = Date.parse(updatedAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(nowMs)) return { status: "invalid" };
  const ageMs = Math.max(0, nowMs - updatedAtMs);
  return {
    status: ageMs > staleAfterMs ? "stale" : "fresh",
    ageMs
  };
}

function serviceGatewaySummary(record: Record<string, unknown> | null): ServiceGatewaySummary | undefined {
  if (!record) return undefined;
  const state = serviceGatewayState(stringField(record, "state"));
  const rawChannels = Array.isArray(record.channels) ? record.channels : [];
  const channels = rawChannels.flatMap((item): ServiceGatewayChannelSummary[] => {
    if (!isRecord(item)) return [];
    const kind = stringField(item, "kind");
    const channelId = stringField(item, "channel_id");
    const channelState = serviceGatewayState(stringField(item, "state"));
    if (!kind || !channelId || !channelState) return [];
    return [{
      kind,
      channel_id: channelId,
      state: channelState,
      detail: stringField(item, "detail") ?? undefined
    }];
  });
  if (!state && channels.length === 0) return undefined;
  return {
    state: state ?? (channels.some((channel) => channel.state === "error")
      ? "error"
      : channels.some((channel) => channel.state === "running")
        ? "running"
        : "stopped"),
    channels
  };
}

function serviceGatewayState(value: string | null): ServiceGatewayState | null {
  return value === "running" || value === "stopped" || value === "error" ? value : null;
}

function overallServiceHealth(result: ServiceHealthResult): ServiceHealthStatus {
  if (result.autonomy_pause.active) return "paused";
  if (result.service.heartbeat_freshness === "missing" || result.service.heartbeat_freshness === "invalid") return "unknown";
  if (result.layers.runtime_substrate.status === "attention" || result.layers.application_slices.status === "attention") return "attention";
  return "healthy";
}

function serviceHealthLayers(result: ServiceHealthResult): ServiceHealthResult["layers"] {
  if (result.autonomy_pause.active) {
    return {
      runtime_substrate: { status: "paused", reason_codes: ["autonomy_pause_active"] },
      application_slices: { status: "paused", reason_codes: ["autonomy_pause_active"] }
    };
  }
  const runtimeReasons = runtimeSubstrateReasonCodes(result);
  const applicationReasons = applicationSliceReasonCodes(result);
  return {
    runtime_substrate: {
      status: result.service.heartbeat_freshness === "missing" || result.service.heartbeat_freshness === "invalid"
        ? "unknown"
        : runtimeReasons.length > 0 ? "attention" : "healthy",
      reason_codes: runtimeReasons
    },
    application_slices: {
      status: applicationReasons.length > 0 ? "attention" : "healthy",
      reason_codes: applicationReasons
    }
  };
}

function runtimeSubstrateReasonCodes(result: ServiceHealthResult): string[] {
  return compactUnique([
    result.service.heartbeat_freshness === "missing" ? "heartbeat_missing" : undefined,
    result.service.heartbeat_freshness === "invalid" ? "heartbeat_invalid" : undefined,
    result.service.state !== "running" ? `${result.target}_not_running` : undefined,
    result.service.heartbeat_freshness === "stale" ? "heartbeat_stale" : undefined,
    result.service.deployment.status === "stale" ? "deployment_stale" : undefined,
    result.service.runtime_build?.source_is_dirty === true ? "runtime_build_dirty" : undefined,
    result.review_tick.last_auto_action_status === "blocked" ? "review_tick_auto_action_blocked" : undefined
  ]);
}

function applicationSliceReasonCodes(result: ServiceHealthResult): string[] {
  return compactUnique([
    result.content_daily.current_step_freshness === "stale" ? "content_daily_current_step_stale" : undefined,
    residentLoopNeedsAttention(result.content_daily, result.autonomy_pause.active) ? "content_daily_loop_attention" : undefined,
    residentLoopNeedsAttention(result.content_feedback_refresh, result.autonomy_pause.active) ? "content_feedback_refresh_loop_attention" : undefined,
    residentLoopNeedsAttention(result.content_creator_metrics, result.autonomy_pause.active) ? "content_creator_metrics_loop_attention" : undefined
  ]);
}

function serviceProgressFreshness(
  record: Record<string, unknown> | null,
  now: Date,
  staleAfterMs: number
): { status?: ServiceProgressFreshness; ageMs?: number } {
  if (stringField(record, "state") !== "running") return {};
  const startedAt = stringField(record, "current_step_started_at");
  if (!startedAt) return { status: "unknown" };
  const startedAtMs = Date.parse(startedAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return { status: "unknown" };
  const ageMs = Math.max(0, nowMs - startedAtMs);
  return {
    status: ageMs > staleAfterMs ? "stale" : "fresh",
    ageMs
  };
}

function residentLoopNeedsAttention(
  loop: { state: string; enabled: boolean },
  autonomyPaused: boolean
): boolean {
  if (!loop.enabled) return /^(error|failed|stale)$/i.test(loop.state);
  if (/^(error|failed|stale|stopped)$/i.test(loop.state)) return true;
  if (loop.state === "paused" && !autonomyPaused) return true;
  return false;
}

async function readRepoHead(repoRoot: string): Promise<ServiceRepoHeadSummary> {
  const normalizedRoot = resolve(repoRoot);
  const gitEntryPath = resolve(normalizedRoot, ".git");
  const gitDir = await resolveGitDir(normalizedRoot, gitEntryPath);
  if (!gitDir) {
    return {
      repo_root: normalizedRoot,
      read_status: "missing",
      reason: ".git not found"
    };
  }

  const headText = (await readTextIfExists(resolve(gitDir, "HEAD"))).trim();
  if (!headText) {
    return {
      repo_root: normalizedRoot,
      git_dir: gitDir,
      read_status: "unreadable",
      reason: ".git/HEAD is missing or empty"
    };
  }

  if (headText.startsWith("ref:")) {
    const headRef = headText.slice("ref:".length).trim();
    if (!isSafeGitRef(headRef)) {
      return {
        repo_root: normalizedRoot,
        git_dir: gitDir,
        read_status: "unreadable",
        reason: ".git/HEAD points at an unsafe ref"
      };
    }
    const commit = await readGitRefCommit(gitDir, headRef);
    if (!commit) {
      return {
        repo_root: normalizedRoot,
        git_dir: gitDir,
        read_status: "unreadable",
        head_ref: headRef,
        branch: branchFromHeadRef(headRef),
        reason: `git ref ${headRef} is missing or unreadable`
      };
    }
    return {
      repo_root: normalizedRoot,
      git_dir: gitDir,
      read_status: "ok",
      head_ref: headRef,
      branch: branchFromHeadRef(headRef),
      head_commit: commit,
      head_commit_short: shortCommit(commit)
    };
  }

  const detachedCommit = normalizeCommit(headText);
  if (!detachedCommit) {
    return {
      repo_root: normalizedRoot,
      git_dir: gitDir,
      read_status: "unreadable",
      reason: ".git/HEAD is not a commit or ref"
    };
  }
  return {
    repo_root: normalizedRoot,
    git_dir: gitDir,
    read_status: "ok",
    head_commit: detachedCommit,
    head_commit_short: shortCommit(detachedCommit)
  };
}

async function resolveGitDir(repoRoot: string, gitEntryPath: string): Promise<string | null> {
  const entryStat = await stat(gitEntryPath).catch(() => null);
  if (!entryStat) return null;
  if (entryStat.isDirectory()) return gitEntryPath;
  if (!entryStat.isFile()) return null;

  const text = await readTextIfExists(gitEntryPath);
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
  if (!firstLine.startsWith("gitdir:")) return null;
  const rawGitDir = firstLine.slice("gitdir:".length).trim();
  if (!rawGitDir) return null;
  return isAbsolute(rawGitDir) ? rawGitDir : resolve(repoRoot, rawGitDir);
}

async function readGitRefCommit(gitDir: string, ref: string): Promise<string | null> {
  const looseRefPath = resolve(gitDir, ref);
  if (!isWithin(gitDir, looseRefPath)) return null;
  const looseRef = normalizeCommit((await readTextIfExists(looseRefPath)).trim());
  if (looseRef) return looseRef;
  return readPackedRefCommit(gitDir, ref);
}

async function readPackedRefCommit(gitDir: string, ref: string): Promise<string | null> {
  const text = await readTextIfExists(resolve(gitDir, "packed-refs"));
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("^")) continue;
    const [commit, name] = trimmed.split(/\s+/, 2);
    if (name === ref) return normalizeCommit(commit);
  }
  return null;
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function summarizeDeployment(
  runtimeBuild: ServiceRuntimeBuildSummary | null,
  repoHead: ServiceRepoHeadSummary,
  ids: { target: ServiceHealthTarget; channelId?: string; scenarioId?: string }
): ServiceDeploymentSummary {
  const restartCommand = serviceRestartCommand(ids);
  const runtimeCommit = runtimeBuild?.source_commit;
  const runtimeShort = runtimeBuild?.source_commit_short ?? (runtimeCommit ? shortCommit(runtimeCommit) : undefined);
  const base = {
    runtime_commit: runtimeCommit,
    runtime_commit_short: runtimeShort,
    runtime_branch: runtimeBuild?.source_branch,
    repo_commit: repoHead.head_commit,
    repo_commit_short: repoHead.head_commit_short,
    repo_branch: repoHead.branch,
    restart_command: restartCommand
  };
  if (!runtimeBuild) {
    return {
      status: "unknown",
      ...base,
      reason: "resident runtime build metadata is missing"
    };
  }
  if (!runtimeCommit) {
    return {
      status: "unknown",
      ...base,
      reason: "resident runtime build commit is missing"
    };
  }
  if (repoHead.read_status !== "ok" || !repoHead.head_commit) {
    return {
      status: "unknown",
      ...base,
      reason: repoHead.reason ?? "current repo HEAD could not be read"
    };
  }

  const status: ServiceDeploymentStatus = runtimeCommit.toLowerCase() === repoHead.head_commit.toLowerCase()
    ? "current"
    : "stale";
  return {
    status,
    ...base,
    reason: status === "current"
      ? "resident runtime build matches current repo HEAD"
      : "resident runtime build commit differs from current repo HEAD"
  };
}

function serviceRestartCommand(ids: { target: ServiceHealthTarget; channelId?: string; scenarioId?: string }): string {
  return [
    `pnpm run runtime -- service restart --target ${ids.target}`,
    ids.scenarioId ? `--scenario ${ids.scenarioId}` : "",
    ids.channelId ? `--channel ${ids.channelId}` : ""
  ].filter((part) => part.length > 0).join(" ");
}

function serviceHealthRefs(target: ServiceHealthTarget): ServiceHealthRefs {
  return {
    heartbeat: `services/${target}/heartbeat.json`,
    reviewTick: `services/${target}/review_tick.json`,
    contentDaily: `services/${target}/content_daily.json`,
    contentFeedbackRefresh: `services/${target}/content_feedback_refresh.json`,
    contentCreatorMetrics: `services/${target}/content_creator_metrics.json`
  };
}

function branchFromHeadRef(ref: string): string {
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

function isSafeGitRef(ref: string): boolean {
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) return false;
  if (ref.startsWith("/") || ref.endsWith("/")) return false;
  return !ref.split("/").some((part) => part === "" || part === "." || part === "..");
}

function normalizeCommit(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate && /^[0-9a-f]{40}$/i.test(candidate) ? candidate : null;
}

function shortCommit(commit: string): string {
  return commit.slice(0, 12);
}

function isWithin(root: string, child: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedRoot || normalizedChild.startsWith(`${normalizedRoot}/`);
}

interface StateRecordRead {
  exists: boolean;
  record: Record<string, unknown> | null;
}

async function readStateRecord(store: AgentStore, ref: string): Promise<StateRecordRead> {
  const text = await store.readStateText(ref);
  if (!text) return { exists: false, record: null };
  try {
    const value = JSON.parse(text) as unknown;
    return { exists: true, record: isRecord(value) ? value : null };
  } catch {
    return { exists: true, record: null };
  }
}

async function readManualFocusCoverage(
  store: AgentStore,
  args: {
    focus: ServiceReviewTickFocusSummary | null;
    storedStatus?: string;
    reviewTickUpdatedAt?: string;
  }
): Promise<ManualFocusCoverage | null> {
  const focusOpportunity = args.focus?.opportunity;
  if (!focusOpportunity || args.storedStatus !== "active") return null;
  const refs = (await store.listStateFiles("autonomy/opportunity-actions"))
    .filter((ref) => ref.endsWith(".json"));
  const candidates: Array<{ ref: string; createdAt: string; proposedSlice: string }> = [];
  for (const ref of refs) {
    let value: unknown;
    try {
      value = await store.readStateJson<unknown>(ref);
    } catch {
      continue;
    }
    if (!isRecord(value)) continue;
    const createdAt = stringField(value, "created_at");
    const proposedSlice = stringField(value, "proposed_slice");
    if (
      stringField(value, "kind") !== "opportunity_action"
      || stringField(value, "action") !== "act-next"
      || stringField(value, "status") !== "executed"
      || !createdAt
      || !proposedSlice
      || !SUPPRESSING_MANUAL_ACTION_SLICES.has(proposedSlice)
      || !manualActionMatchesFocus(value, focusOpportunity)
      || (args.reviewTickUpdatedAt && !isAtOrAfter(createdAt, args.reviewTickUpdatedAt))
    ) {
      continue;
    }
    candidates.push({ ref, createdAt, proposedSlice });
  }
  const latest = candidates.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!latest) return null;
  return {
    status: "covered_by_manual_action",
    ref: latest.ref,
    reason: `selected review tick focus was covered by a later manual opportunity action for ${latest.proposedSlice}`
  };
}

function manualActionMatchesFocus(
  record: Record<string, unknown>,
  focusOpportunity: NonNullable<ServiceReviewTickFocusSummary["opportunity"]>
): boolean {
  return stringField(record, "selected_opportunity_id") === focusOpportunity.id
    || stringField(record, "selected_opportunity_ref") === focusOpportunity.ref
    || stringField(record, "selected_gap_id") === focusOpportunity.id
    || stringField(record, "selected_gap_ref") === focusOpportunity.ref;
}

function isAtOrAfter(left: string, right: string): boolean {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime >= rightTime;
  }
  return left >= right;
}

function contentDailyJobRefs(record: Record<string, unknown> | null): string[] {
  return compactUnique([
    ...stringArrayField(record, "last_job_refs"),
    stringField(record, "last_job_ref")
  ]);
}

function contentDailyJobStatus(value: string | null): ContentDailyEffectiveJobStatus | null {
  return value === "drafted"
    || value === "image_generated"
    || value === "preflight_ok"
    || value === "published"
    || value === "blocked"
    || value === "missing"
    ? value
    : null;
}

function contentRunRefFromId(runId: string | null): string | null {
  return runId ? `content/runs/${runId}/run.json` : null;
}

function contentRunHasPublishedProof(record: Record<string, unknown> | null): boolean {
  return stringField(record, "status") === "published"
    || stringField(recordField(record, "evidence"), "publish_status") === "published";
}

function summarizeContentDailyEffectiveStatuses(
  statuses: ContentDailyEffectiveJobStatus[]
): ContentDailyEffectiveJobStatus | undefined {
  if (statuses.length === 0) return undefined;
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.every((status) => status === "published")) return "published";
  if (statuses.some((status) => status === "preflight_ok")) return "preflight_ok";
  if (statuses.some((status) => status === "image_generated")) return "image_generated";
  if (statuses.some((status) => status === "drafted")) return "drafted";
  return "missing";
}

function stringArrayField(record: Record<string, unknown> | null, key: string): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function numberRecordField(record: Record<string, unknown> | null, key: string): Record<string, number> | undefined {
  const value = recordField(record, key);
  if (!value) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, number] =>
    entry[0].length > 0
    && typeof entry[1] === "number"
    && Number.isFinite(entry[1])
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function compactUnique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function normalizeRuntimeBuild(value: Record<string, unknown> | null): ServiceRuntimeBuildSummary | null {
  if (!value) return null;
  return {
    schema_version: numberField(value, "schema_version") ?? undefined,
    target: stringField(value, "target") ?? undefined,
    runtime_current_root: stringField(value, "runtime_current_root") ?? undefined,
    repo_root: stringField(value, "repo_root") ?? undefined,
    built_at: stringField(value, "built_at") ?? undefined,
    node_version: stringField(value, "node_version") ?? undefined,
    source_commit: stringField(value, "source_commit") ?? undefined,
    source_commit_short: stringField(value, "source_commit_short") ?? undefined,
    source_branch: stringField(value, "source_branch") ?? undefined,
    source_is_dirty: booleanField(value, "source_is_dirty") ?? undefined
  };
}

function reviewTickFocus(value: Record<string, unknown> | null): ServiceReviewTickFocusSummary | null {
  if (!value) return null;
  const source = stringField(value, "source");
  const reason = stringField(value, "reason");
  if (!source || !reason) return null;
  const opportunity = reviewTickFocusOpportunity(recordField(value, "opportunity"));
  return {
    source,
    reason,
    query: stringField(value, "query"),
    opportunity: opportunity ?? undefined
  };
}

function reviewTickFocusOpportunity(value: Record<string, unknown> | null): ServiceReviewTickFocusSummary["opportunity"] | null {
  if (!value) return null;
  const ref = stringField(value, "ref");
  const id = stringField(value, "id");
  const kind = stringField(value, "kind");
  const status = stringField(value, "status");
  const score = numberField(value, "score");
  if (!ref || !id || !kind || !status || score === null) return null;
  return {
    ref,
    id,
    kind,
    status,
    score,
    action_kind: stringField(value, "action_kind") ?? undefined,
    source_ref: stringField(value, "source_ref") ?? undefined,
    action_chain: actionChainField(value.action_chain)
  };
}

function actionChainField(value: unknown): ServiceReviewTickFocusActionStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.flatMap((item): ServiceReviewTickFocusActionStep[] => {
    if (!isRecord(item)) return [];
    const label = stringField(item, "label");
    const effect = stringField(item, "effect");
    if (!label || !effect) return [];
    return [{
      label,
      effect,
      reason: stringField(item, "reason") ?? undefined
    }];
  });
  return steps.length > 0 ? steps : undefined;
}

function recordField(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return isRecord(value) ? value : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanField(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
