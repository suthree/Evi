import {
  getArchiveHealth,
  type ArchiveHealthResult
} from "../../core/src/archive_health.js";
import {
  MemoryStore,
  type EpisodeArchiveResult
} from "../../core/src/memory_store.js";
import {
  getContentRun,
  planContentFeedbackStrategy,
  type ContentFeedbackStrategyPosture,
  type ContentRun,
  type ContentPublishPreflightEvidence
} from "../../core/src/content_pipeline.js";
import {
  getOpportunityBacklog,
  type OpportunityBacklogItem
} from "../../core/src/opportunity_backlog.js";
import {
  getServiceHealth,
  type ServiceHealthResult
} from "../../core/src/service_health.js";
import {
  runHarnessReplayAudit,
  type HarnessReplayAuditReport
} from "../../core/src/harness_replay.js";
import { newId, utcNow } from "../../core/src/ids.js";
import type { AgentStore } from "../../core/src/store.js";
import {
  captureCreatorMetrics,
  refreshContentFeedback,
  recordContentPublishPreflight,
  runContentDryRun,
  type CreatorMetricsCaptureClient,
  type CreatorMetricsCaptureStatus,
  type RefreshContentFeedbackResult
} from "./content_pipeline.js";
import {
  summarizeXiaohongshuProbe,
  XiaohongshuMcpClient,
  type ExternalFeedbackCaptureClient,
  type XiaohongshuMcpProbeResult
} from "./xiaohongshu_mcp.js";
import {
  BackgroundReviewRunner,
  type ReviewInboxDecisionResult
} from "./background_review.js";
import {
  repairContextManifest,
  type ContextManifestRepairResult
} from "./context_manifest.js";

const OPPORTUNITY_ACTIONS_DIR = "autonomy/opportunity-actions";
const SUPPORTED_SOURCE_QUALITY_SLICE = "active_exploration_source_quality_gate";
const SUPPORTED_PREFLIGHT_SLICE = "external_publish_preflight_contract";
const SUPPORTED_CREATOR_METRICS_SLICE = "creator_metrics_capture_readiness_loop";
const SUPPORTED_FEEDBACK_CAPTURE_SLICE = "post_publish_feedback_capture_contract";
const SUPPORTED_FEEDBACK_STRATEGY_NEXT_GENERATION_SLICE = "feedback_strategy_next_generation_ready";
const SUPPORTED_FEEDBACK_STRATEGY_PREVIEW_REVIEW_SLICE = "feedback_strategy_preview_review";
const SUPPORTED_FEEDBACK_REFRESH_ROUTE_REVIEW_SLICE = "feedback_refresh_route_review";
const SUPPORTED_CONTEXT_HEALTH_ISSUE_KIND = "orphan_context_markdown";
const CONTENT_STRATEGY_REVIEWS_DIR = "content/strategy-reviews";
const CONTENT_FEEDBACK_REFRESH_ROUTE_REVIEWS_DIR = "content/feedback-refresh-route-reviews";
const OPPORTUNITY_ACTION_BOUNDARY = [
  "typed opportunity action executor for bounded self-evolution gaps;",
  "each selected opportunity is classified by execution_policy so resident automation can distinguish auto-safe state closure from manual local writes and external reads;",
  "this version records source-quality diagnostics for active exploration runs, external publish preflight evidence for xiaohongshu-mcp content runs, xiaohongshu-mcp post-publish feedback evidence, browser-backed creator metrics for published Xiaohongshu posts, local feedback-strategy next-generation dry-runs, local feedback-strategy preview reviews, local feedback-refresh route reviews, covered review-inbox triage completion decisions, deterministic local episode archive refreshes, local context manifest sidecar repairs for orphan context Markdown, harness replay audits for bounded live-run traces, or SOP evolution confirmation requests;",
  "it never executes action_chain command strings, executes confirmations, publishes externally, calls models, mutates repository files, or writes the active vault"
].join(" ");

export type OpportunityActionStatus = "executed" | "skipped" | "blocked";
export type OpportunityActionExecutionMode = "manual" | "auto";
export type OpportunityActionExecutionRisk = "auto_safe" | "manual_local" | "manual_external" | "unsupported";

export interface OpportunityActionExecutionPolicy {
  supported: boolean;
  auto_executable: boolean;
  risk: OpportunityActionExecutionRisk;
  side_effect_level: OpportunityBacklogItem["budget_hint"]["side_effect_level"];
  external_io: boolean;
  reason: string;
}

export interface OpportunityPublishPreflightProbeClient {
  probe(args?: { publishTool?: string }): Promise<XiaohongshuMcpProbeResult>;
}

export interface ExecuteNextOpportunityActionArgs {
  opportunity?: string;
  limit?: number;
  allowedKinds?: OpportunityBacklogItem["kind"][];
  executionMode?: OpportunityActionExecutionMode;
  serverUrl?: string;
  tool?: string;
  probeClient?: OpportunityPublishPreflightProbeClient;
  feedbackClient?: ExternalFeedbackCaptureClient;
  creatorUrl?: string;
  pageText?: string;
  creatorMetricsClient?: CreatorMetricsCaptureClient;
  browserSessionName?: string;
  browserAutoConnect?: boolean;
  browserCdpPort?: string;
}

export interface OpportunityActionRecord {
  schema_version: 1;
  id: string;
  kind: "opportunity_action";
  action: "act-next";
  status: OpportunityActionStatus;
  selected_opportunity_id?: string;
  selected_opportunity_ref?: string;
  selected_gap_id?: string;
  selected_gap_ref?: string;
  proposed_slice?: string;
  selected_action_kind?: string;
  execution_policy?: OpportunityActionExecutionPolicy;
  run_id?: string;
  run_ref?: string;
  sop_id?: string;
  sop_ref?: string;
  confirmation_ref?: string;
  confirmation_markdown_ref?: string;
  confirmation_action_kind?: string;
  confirmation_would_write?: string[];
  context_health_issue_kind?: string;
  context_ref?: string;
  manifest_ref?: string;
  context_repair_status?: ContextManifestRepairResult["status"];
  context_repair_total_chars?: number;
  context_repair_section_count?: number;
  completion_id?: string;
  trace_ref?: string;
  replay_ref?: string;
  replay_markdown_ref?: string;
  replay_status?: HarnessReplayAuditReport["status"];
  replay_warning_count?: number;
  evidence_event_id?: string;
  publish_adapter?: string;
  publish_tool?: string;
  server_url?: string;
  creator_url?: string;
  capture_status?: CreatorMetricsCaptureStatus;
  capture_adapter?: "agent-browser-cli";
  capture_error?: string;
  feedback_adapter?: "xiaohongshu-mcp";
  feedback_captured_count?: number;
  feedback_failed_count?: number;
  feedback_skipped_count?: number;
  feedback_strategy_source_run_id?: string;
  feedback_strategy_source_run_ref?: string;
  feedback_strategy_generated_run_id?: string;
  feedback_strategy_generated_run_ref?: string;
  feedback_strategy_posture?: ContentFeedbackStrategyPosture;
  feedback_strategy_applied?: boolean;
  feedback_strategy_preview_review_ref?: string;
  feedback_strategy_preview_title_changed?: boolean;
  feedback_strategy_preview_guardrail?: string;
  feedback_refresh_route_review_ref?: string;
  feedback_refresh_route_state?: string;
  feedback_refresh_route_top_skip_reason?: string;
  feedback_refresh_route_due_count?: number;
  feedback_refresh_route_skipped_count?: number;
  review_inbox_item_id?: string;
  review_inbox_item_ref?: string;
  review_inbox_action_kind?: string;
  review_inbox_completion_kind?: string;
  review_inbox_decision_ref?: string;
  review_inbox_decision_status?: string;
  review_inbox_decision_reason?: string;
  archive_refresh_date?: string;
  archive_refresh_archive_ref?: string;
  archive_refresh_markdown_ref?: string;
  archive_refresh_event_count?: number;
  archive_refresh_day_count?: number;
  archive_refresh_total_events?: number;
  archive_refresh_health_status?: ArchiveHealthResult["status"];
  archive_refresh_remaining_issue_count?: number;
  source_quality_issue_count?: number;
  source_quality_usable_count?: number;
  source_quality_failed_count?: number;
  source_quality_stale_count?: number;
  result_ref?: string;
  next_commands?: string[];
  skipped_reason?: string;
  blocked_reason?: string;
  created_at: string;
  boundary: string;
}

export interface ExecuteNextOpportunityActionResult {
  created_at: string;
  status: OpportunityActionStatus;
  action: "act-next";
  selected_opportunity?: {
    id: string;
    ref: string;
    kind: OpportunityBacklogItem["kind"];
    title: string;
    status: string;
    proposed_slice?: string;
    action_kind?: string;
  };
  execution_policy?: OpportunityActionExecutionPolicy;
  preflight?: {
    evidence_ref: string;
    status: ContentPublishPreflightEvidence["status"];
    adapter: ContentPublishPreflightEvidence["adapter"];
    tool?: string;
    login_status: ContentPublishPreflightEvidence["login_status"];
  };
  creator_metrics?: {
    status: CreatorMetricsCaptureStatus;
    captured_by: "agent-browser-cli";
    evidence_ref?: string;
    view_count?: number;
    source_ref?: string;
    error?: string;
  };
  feedback_refresh?: {
    count: number;
    captured_count: number;
    failed_count: number;
    skipped_count: number;
    evidence_refs: string[];
    first_status?: "captured" | "failed";
    first_evidence_ref?: string;
    first_error?: string;
  };
  feedback_strategy_next_generation?: {
    source_run_id: string;
    source_run_ref: string;
    generated_run_id: string;
    generated_run_ref: string;
    posture: ContentFeedbackStrategyPosture;
    applied: boolean;
    draft_title: string;
    evidence_refs: string[];
  };
  feedback_strategy_preview_review?: {
    review_id: string;
    review_ref: string;
    source_run_id: string;
    source_run_ref: string;
    generated_run_id: string;
    generated_run_ref: string;
    posture: ContentFeedbackStrategyPosture;
    applied: boolean;
    title_changed: boolean;
    guardrail: string;
    evidence_refs: string[];
  };
  feedback_refresh_route_review?: {
    review_id: string;
    review_ref: string;
    service_ref: string;
    state: string;
    status_updated_at?: string;
    due_count: number;
    skipped_count: number;
    top_skip_reason: string;
    strategy_collect_more_feedback_count: number;
    strategy_top_posture?: string;
    next_due_run_ref?: string;
    skipped_item_refs: string[];
    deferred_item_refs: string[];
    next_commands: string[];
  };
  review_inbox_completion?: {
    item_id: string;
    item_ref: string;
    action_kind: string;
    completion_kind: string;
    decision_ref: string;
    status: ReviewInboxDecisionResult["status"];
    previous_status: string;
    reason: string;
  };
  archive_refresh?: {
    source_ref: string;
    archive_root_ref: string;
    total_events: number;
    archived_day_count: number;
    refreshed_date?: string;
    refreshed_archive_ref?: string;
    refreshed_markdown_ref?: string;
    refreshed_event_count?: number;
    health_status: ArchiveHealthResult["status"];
    remaining_issue_count: number;
  };
  source_quality?: SourceQualityActionSummary;
  sop_confirmation?: {
    confirmation_ref: string;
    confirmation_markdown_ref: string;
    evidence_event_id: string;
    action_kind: string;
    sop_id: string;
    sop_ref: string;
    would_write: string[];
    next_step: string;
  };
  context_repair?: {
    status: ContextManifestRepairResult["status"];
    context_ref: string;
    manifest_ref: string;
    total_chars: number;
    section_count: number;
  };
  replay_audit?: {
    status: HarnessReplayAuditReport["status"];
    replay_ref: string;
    markdown_ref: string;
    trace_ref: string;
    completion_id: string;
    warning_count: number;
    repo_write_guards: number;
    delegated_results_failed: number;
    model_diagnostics: number;
  };
  next_commands?: string[];
  audit_ref: string;
  record: OpportunityActionRecord;
  boundary: string;
}

export interface SourceQualityActionSummary {
  run_id: string;
  run_ref: string;
  source_evidence_ref?: string;
  source_item_count: number;
  usable_source_count: number;
  failed_source_count: number;
  stale_source_count: number;
  unknown_freshness_count: number;
  duplicate_source_count: number;
  usable_news_count: number;
  usable_market_count: number;
  issue_count: number;
  issues: string[];
}

export async function executeNextOpportunityAction(
  store: AgentStore,
  args: ExecuteNextOpportunityActionArgs = {}
): Promise<ExecuteNextOpportunityActionResult> {
  const createdAt = utcNow();
  const executionMode = args.opportunity ? (args.executionMode ?? "manual") : "auto";
  const selected = await selectOpportunity(store, { ...args, executionMode });
  if (!selected) {
    return writeActionResult(store, {
      createdAt,
      status: "skipped",
      skipped_reason: args.opportunity
        ? `requested opportunity not found: ${args.opportunity}`
        : "no auto-executable opportunity is ready for typed execution; pass --opportunity to run a manual act-next action"
    });
  }

  const gap = selected.self_evolution_gap;
  const proposedSlice = gap?.proposed_slice;
  const selectedSummary = summarizeOpportunity(selected);
  const executionPolicy = getOpportunityActionExecutionPolicy(selected);
  if (!executionPolicy.supported) {
    return writeActionResult(store, {
      createdAt,
      status: "skipped",
      selected,
      selectedSummary,
      execution_policy: executionPolicy,
      skipped_reason: `unsupported opportunity action: kind=${selected.kind} status=${selected.status} proposed_slice=${proposedSlice ?? "unknown"}`
    });
  }
  if (executionMode === "auto" && !executionPolicy.auto_executable) {
    return writeActionResult(store, {
      createdAt,
      status: "skipped",
      selected,
      selectedSummary,
      execution_policy: executionPolicy,
      skipped_reason: `auto execution not allowed: ${executionPolicy.reason}`
    });
  }
  if (selected.kind === "sop_evolution_chain") {
    return executeSopConfirmationAction(store, {
      createdAt,
      selected,
      selectedSummary
    });
  }
  if (selected.kind === "review_inbox") {
    return executeReviewInboxCompletionAction(store, {
      createdAt,
      selected,
      selectedSummary
    });
  }
  if (selected.kind === "archive_health") {
    return executeArchiveRefreshAction(store, {
      createdAt,
      selected,
      selectedSummary
    });
  }
  if (selected.kind === "context_health") {
    return executeContextHealthRepairAction(store, {
      createdAt,
      selected,
      selectedSummary
    });
  }
  if (selected.kind === "completion_verification" || selected.kind === "repo_write_guard") {
    return executeHarnessReplayAction(store, {
      createdAt,
      selected,
      selectedSummary
    });
  }
  const supportedGap = selected.self_evolution_gap;
  if (!supportedGap) {
    return writeActionResult(store, {
      createdAt,
      status: "blocked",
      selected,
      selectedSummary,
      blocked_reason: "supported typed opportunity lost self-evolution gap metadata"
    });
  }

  if (supportedGap.proposed_slice === SUPPORTED_CREATOR_METRICS_SLICE) {
    return executeCreatorMetricsAction(store, {
      createdAt,
      selected,
      selectedSummary,
      gap: supportedGap,
      args
    });
  }
  if (supportedGap.proposed_slice === SUPPORTED_FEEDBACK_CAPTURE_SLICE) {
    return executeFeedbackCaptureAction(store, {
      createdAt,
      selected,
      selectedSummary,
      gap: supportedGap,
      args
    });
  }
  if (supportedGap.proposed_slice === SUPPORTED_FEEDBACK_STRATEGY_NEXT_GENERATION_SLICE) {
    return executeFeedbackStrategyNextGenerationAction(store, {
      createdAt,
      selected,
      selectedSummary,
      gap: supportedGap
    });
  }
  if (supportedGap.proposed_slice === SUPPORTED_FEEDBACK_STRATEGY_PREVIEW_REVIEW_SLICE) {
    return executeFeedbackStrategyPreviewReviewAction(store, {
      createdAt,
      selected,
      selectedSummary,
      gap: supportedGap
    });
  }
  if (supportedGap.proposed_slice === SUPPORTED_FEEDBACK_REFRESH_ROUTE_REVIEW_SLICE) {
    return executeFeedbackRefreshRouteReviewAction(store, {
      createdAt,
      selected,
      selectedSummary,
      gap: supportedGap
    });
  }
  if (supportedGap.proposed_slice === SUPPORTED_SOURCE_QUALITY_SLICE) {
    return executeSourceQualityAction(store, {
      createdAt,
      selected,
      selectedSummary,
      gap: supportedGap
    });
  }

  try {
    const detail = await getContentRun(store, { runRef: supportedGap.source_ref });
    const run = detail.run;
    if (run.publish_adapter.kind !== "xiaohongshu-mcp") {
      return writeActionResult(store, {
        createdAt,
        status: "blocked",
        selected,
        selectedSummary,
        run_id: run.id,
        run_ref: run.refs.run_ref,
        publish_adapter: run.publish_adapter.kind,
        blocked_reason: `unsupported publish adapter for act-next: ${run.publish_adapter.kind}`
      });
    }
    if (run.refs.publish_preflight_ref) {
      return writeActionResult(store, {
        createdAt,
        status: "skipped",
        selected,
        selectedSummary,
        run_id: run.id,
        run_ref: run.refs.run_ref,
        publish_adapter: run.publish_adapter.kind,
        result_ref: run.refs.publish_preflight_ref,
        skipped_reason: "content run already has publish preflight evidence"
      });
    }
    if (!run.refs.image_evidence_ref || run.evidence.image_status !== "generated") {
      return writeActionResult(store, {
        createdAt,
        status: "blocked",
        selected,
        selectedSummary,
        run_id: run.id,
        run_ref: run.refs.run_ref,
        publish_adapter: run.publish_adapter.kind,
        blocked_reason: "content run needs generated image evidence before publish preflight"
      });
    }

    const tool = args.tool ?? run.publish_adapter.tool ?? "publish_content";
    const serverUrl = args.serverUrl ?? run.publish_adapter.server_url;
    const probe = await probeXiaohongshu({
      client: args.probeClient,
      serverUrl,
      tool
    });
    const preflight = await recordContentPublishPreflight(store, {
      runRef: run.id,
      adapter: "xiaohongshu-mcp",
      serverUrl,
      tool,
      loginStatus: probe?.login_status,
      adapterAvailable: probe?.adapter_available,
      adapterDiagnostics: probe ? summarizeXiaohongshuProbe(probe) : undefined,
      error: probe?.ok === false ? probe.error ?? "xiaohongshu-mcp probe failed" : undefined
    });

    return writeActionResult(store, {
      createdAt,
      status: "executed",
      selected,
      selectedSummary,
      run_id: preflight.run.id,
      run_ref: preflight.run.refs.run_ref,
      publish_adapter: preflight.evidence.adapter,
      publish_tool: preflight.evidence.tool,
      server_url: preflight.evidence.server_url,
      result_ref: preflight.evidence_ref,
      preflight: {
        evidence_ref: preflight.evidence_ref,
        status: preflight.evidence.status,
        adapter: preflight.evidence.adapter,
        tool: preflight.evidence.tool,
        login_status: preflight.evidence.login_status
      }
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt,
      status: "blocked",
      selected,
      selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeReviewInboxCompletionAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
  }
): Promise<ExecuteNextOpportunityActionResult> {
  const completion = reviewInboxCompletionReason(input.selected);
  if (!completion) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "skipped",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      skipped_reason: "review inbox item is not covered by typed completion evidence"
    });
  }

  try {
    const runner = new BackgroundReviewRunner({
      repoRoot: store.repoRoot,
      stateRoot: store.stateRoot
    });
    const decision = await runner.decideReviewInboxItem({
      itemRef: input.selected.ref,
      status: "completed",
      reason: completion.reason
    });
    const summary = {
      item_id: decision.item_id,
      item_ref: decision.item_ref,
      action_kind: decision.decision.action_kind,
      completion_kind: completion.completion_kind,
      decision_ref: decision.decision_ref,
      status: decision.status,
      previous_status: decision.previous_status,
      reason: decision.reason
    };
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "executed",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      review_inbox_item_id: summary.item_id,
      review_inbox_item_ref: summary.item_ref,
      review_inbox_action_kind: summary.action_kind,
      review_inbox_completion_kind: summary.completion_kind,
      review_inbox_decision_ref: summary.decision_ref,
      review_inbox_decision_status: summary.status,
      review_inbox_decision_reason: summary.reason,
      result_ref: summary.decision_ref,
      next_commands: [
        `pnpm run runtime -- review inbox --item ${summary.item_id} --state-root <state-root>`,
        "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
      ],
      review_inbox_completion: summary
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeArchiveRefreshAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
  }
): Promise<ExecuteNextOpportunityActionResult> {
  const health = input.selected.archive_health;
  if (
    input.selected.action_kind !== "refresh_episode_archives"
    || !health?.refresh_command
    || (health.issue_kind !== "missing_archive" && health.issue_kind !== "stale_archive")
  ) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: `unsupported archive health refresh: issue_kind=${health?.issue_kind ?? "unknown"}`
    });
  }

  const memory = new MemoryStore(store);
  try {
    const archive = await memory.archiveEpisodeEvents();
    const afterHealth = await getArchiveHealth(store, {
      archiveRef: health.date ?? input.selected.id
    });
    const summary = summarizeArchiveRefresh(archive, afterHealth, health.date ?? undefined);
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: afterHealth.count === 0 ? "executed" : "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      archive_refresh_date: summary.refreshed_date,
      archive_refresh_archive_ref: summary.refreshed_archive_ref,
      archive_refresh_markdown_ref: summary.refreshed_markdown_ref,
      archive_refresh_event_count: summary.refreshed_event_count,
      archive_refresh_day_count: summary.archived_day_count,
      archive_refresh_total_events: summary.total_events,
      archive_refresh_health_status: summary.health_status,
      archive_refresh_remaining_issue_count: summary.remaining_issue_count,
      result_ref: summary.refreshed_archive_ref,
      next_commands: [
        health.inspect_command,
        input.selected.decision_command ?? ""
      ].filter((command) => command.length > 0),
      blocked_reason: afterHealth.count === 0
        ? undefined
        : `archive refresh left ${afterHealth.count} issue(s) for ${health.date ?? input.selected.id}`,
      archive_refresh: summary
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  } finally {
    memory.close();
  }
}

async function executeSourceQualityAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
    gap: NonNullable<OpportunityBacklogItem["self_evolution_gap"]>;
  }
): Promise<ExecuteNextOpportunityActionResult> {
  try {
    const detail = await getContentRun(store, { runRef: input.gap.source_ref });
    const summary = summarizeSourceQualityAction(detail.run);
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "executed",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      run_id: summary.run_id,
      run_ref: summary.run_ref,
      source_quality_issue_count: summary.issue_count,
      source_quality_usable_count: summary.usable_source_count,
      source_quality_failed_count: summary.failed_source_count,
      source_quality_stale_count: summary.stale_source_count,
      result_ref: summary.source_evidence_ref,
      next_commands: [
        input.gap.inspect_command,
        ...input.gap.verification_commands.filter((command) =>
          command.includes("content run --dry-run")
          || command.includes("governance opportunities")
        )
      ],
      source_quality: summary
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeFeedbackStrategyNextGenerationAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
    gap: NonNullable<OpportunityBacklogItem["self_evolution_gap"]>;
  }
): Promise<ExecuteNextOpportunityActionResult> {
  try {
    const sourceDetail = await getContentRun(store, { runRef: input.gap.source_ref });
    const sourceRun = sourceDetail.run;
    const strategy = await planContentFeedbackStrategy(store, {
      runRef: sourceRun.id,
      limit: 1
    });
    const suggestion = strategy.suggestions[0];
    if (!suggestion || !feedbackStrategyCanApply(suggestion.posture)) {
      return writeActionResult(store, {
        createdAt: input.createdAt,
        status: "blocked",
        selected: input.selected,
        selectedSummary: input.selectedSummary,
        run_id: sourceRun.id,
        run_ref: sourceRun.refs.run_ref,
        blocked_reason: `feedback strategy is not ready for next-generation dry-run: posture=${suggestion?.posture ?? "missing"}`
      });
    }

    const generated = await runContentDryRun(store, {
      workflowId: sourceRun.workflow_id,
      topic: sourceRun.topic,
      strategyFromRunRef: sourceRun.id
    });
    const applied = generated.strategy?.applied === true
      && generated.strategy.source_run_id === sourceRun.id;
    const summary = {
      source_run_id: sourceRun.id,
      source_run_ref: sourceRun.refs.run_ref,
      generated_run_id: generated.id,
      generated_run_ref: generated.refs.run_ref,
      posture: suggestion.posture,
      applied,
      draft_title: generated.draft.title,
      evidence_refs: generated.strategy?.evidence_refs ?? suggestion.evidence_refs
    };
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: applied ? "executed" : "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      run_id: generated.id,
      run_ref: generated.refs.run_ref,
      feedback_strategy_source_run_id: sourceRun.id,
      feedback_strategy_source_run_ref: sourceRun.refs.run_ref,
      feedback_strategy_generated_run_id: generated.id,
      feedback_strategy_generated_run_ref: generated.refs.run_ref,
      feedback_strategy_posture: suggestion.posture,
      feedback_strategy_applied: applied,
      result_ref: generated.refs.run_ref,
      next_commands: [
        `pnpm run runtime -- content show --run ${generated.id} --state-root <state-root>`,
        `pnpm run runtime -- content daily --dry-run --track ${feedbackStrategyTrackId(suggestion)} --strategy-from ${sourceRun.id} --state-root <state-root>`,
        input.selected.decision_command ?? ""
      ].filter((command) => command.length > 0),
      blocked_reason: applied ? undefined : "generated run did not apply the selected feedback strategy",
      feedback_strategy_next_generation: summary
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeFeedbackStrategyPreviewReviewAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
    gap: NonNullable<OpportunityBacklogItem["self_evolution_gap"]>;
  }
): Promise<ExecuteNextOpportunityActionResult> {
  try {
    const generatedDetail = await getContentRun(store, { runRef: input.gap.source_ref });
    const generatedRun = generatedDetail.run;
    const strategy = generatedRun.strategy;
    if (generatedRun.status !== "dry_run" || strategy?.kind !== "feedback_strategy" || strategy.applied !== true) {
      return writeActionResult(store, {
        createdAt: input.createdAt,
        status: "blocked",
        selected: input.selected,
        selectedSummary: input.selectedSummary,
        run_id: generatedRun.id,
        run_ref: generatedRun.refs.run_ref,
        blocked_reason: "selected run is not an applied feedback-strategy dry-run"
      });
    }

    const sourceDetail = await getContentRun(store, { runRef: strategy.source_run_id });
    const sourceRun = sourceDetail.run;
    const reviewId = newId("content_strategy_preview_review");
    const reviewRef = `${CONTENT_STRATEGY_REVIEWS_DIR}/${reviewId}.json`;
    const titleChanged = sourceRun.draft.title !== generatedRun.draft.title;
    const nextCommands = [
      `pnpm run runtime -- content show --run ${generatedRun.id} --state-root <state-root>`,
      `pnpm run runtime -- content daily --dry-run --track ${feedbackStrategyTrackId({
        workflow_id: generatedRun.workflow_id,
        topic: generatedRun.topic,
        title: generatedRun.draft.title
      })} --strategy-from ${sourceRun.id} --state-root <state-root>`,
      input.selected.decision_command ?? ""
    ].filter((command) => command.length > 0);
    const review = {
      schema_version: 1,
      kind: "content_strategy_preview_review",
      id: reviewId,
      status: "reviewed",
      source_run_id: sourceRun.id,
      source_run_ref: sourceRun.refs.run_ref,
      source_title: sourceRun.draft.title,
      generated_run_id: generatedRun.id,
      generated_run_ref: generatedRun.refs.run_ref,
      generated_title: generatedRun.draft.title,
      posture: strategy.posture,
      applied: strategy.applied,
      title_changed: titleChanged,
      guidance: {
        example_title: strategy.guidance.example_title,
        example_cover_text: strategy.guidance.example_cover_text,
        example_opening_hook: strategy.guidance.example_opening_hook,
        example_cta: strategy.guidance.example_cta,
        source_focus: strategy.guidance.source_focus,
        guardrail: strategy.guidance.guardrail
      },
      evidence_refs: strategy.evidence_refs,
      next_commands: nextCommands,
      created_at: input.createdAt,
      boundary: "bounded local feedback-strategy preview review; reads source/generated content run metadata and strategy provenance only, never includes full draft body, calls models, opens browsers, fetches platform state, publishes externally, writes repo files, or writes the active vault"
    };
    await store.writeJson(reviewRef, review);
    const summary: NonNullable<ExecuteNextOpportunityActionResult["feedback_strategy_preview_review"]> = {
      review_id: reviewId,
      review_ref: reviewRef,
      source_run_id: sourceRun.id,
      source_run_ref: sourceRun.refs.run_ref,
      generated_run_id: generatedRun.id,
      generated_run_ref: generatedRun.refs.run_ref,
      posture: strategy.posture,
      applied: strategy.applied,
      title_changed: titleChanged,
      guardrail: strategy.guidance.guardrail,
      evidence_refs: strategy.evidence_refs
    };
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "executed",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      run_id: generatedRun.id,
      run_ref: generatedRun.refs.run_ref,
      feedback_strategy_source_run_id: sourceRun.id,
      feedback_strategy_source_run_ref: sourceRun.refs.run_ref,
      feedback_strategy_generated_run_id: generatedRun.id,
      feedback_strategy_generated_run_ref: generatedRun.refs.run_ref,
      feedback_strategy_posture: strategy.posture,
      feedback_strategy_applied: strategy.applied,
      feedback_strategy_preview_review_ref: reviewRef,
      feedback_strategy_preview_title_changed: titleChanged,
      feedback_strategy_preview_guardrail: strategy.guidance.guardrail,
      result_ref: reviewRef,
      next_commands: nextCommands,
      feedback_strategy_preview_review: summary
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeFeedbackRefreshRouteReviewAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
    gap: NonNullable<OpportunityBacklogItem["self_evolution_gap"]>;
  }
): Promise<ExecuteNextOpportunityActionResult> {
  try {
    const health = await getServiceHealth(store);
    const readiness = feedbackRefreshRouteReviewReadiness(health);
    if (!readiness.ready) {
      return writeActionResult(store, {
        createdAt: input.createdAt,
        status: "blocked",
        selected: input.selected,
        selectedSummary: input.selectedSummary,
        blocked_reason: readiness.reason
      });
    }

    const feedbackRefresh = health.content_feedback_refresh;
    const dueCount = feedbackRefresh.last_due_count ?? 0;
    const skippedCount = feedbackRefresh.last_skipped_count ?? 0;
    const collectMoreCount = feedbackRefresh.last_strategy_collect_more_feedback_count ?? 0;
    const skippedItemRefs = feedbackRefresh.last_skipped_item_refs ?? [];
    const deferredItemRefs = feedbackRefresh.last_deferred_item_refs ?? [];
    const nextCommands = [
      "pnpm run runtime -- service health --target runtime",
      ...(feedbackRefresh.last_strategy_top_run_ref
        ? [`pnpm run runtime -- content feedback-strategy --run ${feedbackRefresh.last_strategy_top_run_ref} --state-root <state-root>`]
        : []),
      input.selected.decision_command ?? "",
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ].filter((command) => command.length > 0);
    const reviewId = newId("content_feedback_refresh_route_review");
    const reviewRef = `${CONTENT_FEEDBACK_REFRESH_ROUTE_REVIEWS_DIR}/${reviewId}.json`;
    const review = {
      schema_version: 1,
      kind: "content_feedback_refresh_route_review",
      id: reviewId,
      status: "reviewed",
      service_ref: feedbackRefresh.ref,
      service_state: feedbackRefresh.state,
      status_updated_at: feedbackRefresh.updated_at,
      status_finished_at: feedbackRefresh.last_finished_at,
      last_queue_count: feedbackRefresh.last_queue_count,
      last_due_count: dueCount,
      last_deferred_count: feedbackRefresh.last_deferred_count,
      last_skipped_count: skippedCount,
      top_skip_reason: feedbackRefresh.last_top_skip_reason,
      skip_reason_counts: feedbackRefresh.last_skip_reason_counts ?? {},
      skipped_item_refs: skippedItemRefs,
      deferred_item_refs: deferredItemRefs,
      strategy: {
        created_at: feedbackRefresh.last_strategy_created_at,
        captured_by: feedbackRefresh.last_strategy_captured_by,
        suggestion_count: feedbackRefresh.last_strategy_suggestion_count ?? 0,
        high_priority_count: feedbackRefresh.last_strategy_high_priority_count ?? 0,
        collect_more_feedback_count: collectMoreCount,
        repair_feedback_capture_count: feedbackRefresh.last_strategy_repair_feedback_capture_count ?? 0,
        revise_next_post_count: feedbackRefresh.last_strategy_revise_next_post_count ?? 0,
        reuse_baseline_count: feedbackRefresh.last_strategy_reuse_baseline_count ?? 0,
        verify_metrics_count: feedbackRefresh.last_strategy_verify_metrics_count ?? 0,
        top_posture: feedbackRefresh.last_strategy_top_posture,
        top_priority: feedbackRefresh.last_strategy_top_priority,
        top_title: feedbackRefresh.last_strategy_top_title,
        top_run_ref: feedbackRefresh.last_strategy_top_run_ref,
        item_refs: feedbackRefresh.last_strategy_item_refs ?? []
      },
      next_due: {
        at: feedbackRefresh.next_due_at,
        run_id: feedbackRefresh.next_due_run_id,
        run_ref: feedbackRefresh.next_due_run_ref,
        reason: feedbackRefresh.next_due_reason
      },
      route_assessment: {
        status: "local_route_reviewed",
        diagnosis: "feedback refresh skipped due items because their capture route is not xiaohongshu-mcp while strategy still asks for more feedback.",
        next_local_action: "Use typed feedback strategy and service health to decide whether to wait for routed feedback evidence or change the strategy posture; do not retry MCP/browser capture from this review."
      },
      next_commands: nextCommands,
      created_at: input.createdAt,
      boundary: "bounded local feedback-refresh route review; reads resident service health and typed strategy counters only, never calls Xiaohongshu MCP, opens browsers, fetches platform state, publishes externally, reads draft bodies, writes repo files, or writes the active vault"
    };
    await store.writeJson(reviewRef, review);
    const summary: NonNullable<ExecuteNextOpportunityActionResult["feedback_refresh_route_review"]> = {
      review_id: reviewId,
      review_ref: reviewRef,
      service_ref: feedbackRefresh.ref,
      state: feedbackRefresh.state,
      ...(feedbackRefresh.updated_at ? { status_updated_at: feedbackRefresh.updated_at } : {}),
      due_count: dueCount,
      skipped_count: skippedCount,
      top_skip_reason: feedbackRefresh.last_top_skip_reason ?? "unknown",
      strategy_collect_more_feedback_count: collectMoreCount,
      ...(feedbackRefresh.last_strategy_top_posture ? { strategy_top_posture: feedbackRefresh.last_strategy_top_posture } : {}),
      ...(feedbackRefresh.next_due_run_ref ? { next_due_run_ref: feedbackRefresh.next_due_run_ref } : {}),
      skipped_item_refs: skippedItemRefs,
      deferred_item_refs: deferredItemRefs,
      next_commands: nextCommands
    };
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "executed",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      feedback_refresh_route_review_ref: reviewRef,
      feedback_refresh_route_state: feedbackRefresh.state,
      feedback_refresh_route_top_skip_reason: feedbackRefresh.last_top_skip_reason,
      feedback_refresh_route_due_count: dueCount,
      feedback_refresh_route_skipped_count: skippedCount,
      result_ref: reviewRef,
      next_commands: nextCommands,
      feedback_refresh_route_review: summary
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeHarnessReplayAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
  }
): Promise<ExecuteNextOpportunityActionResult> {
  const traceRef = replayTraceRefForOpportunity(input.selected);
  if (!traceRef) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: `missing replay trace ref for opportunity kind=${input.selected.kind}`
    });
  }
  try {
    const replay = await runHarnessReplayAudit(store, {
      traceRef
    });
    const warningCount = replay.checks.filter((check) => check.status === "warning").length;
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "executed",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      completion_id: replay.completion_id,
      trace_ref: replay.trace_ref,
      replay_ref: replay.artifact_refs.json_ref,
      replay_markdown_ref: replay.artifact_refs.markdown_ref,
      replay_status: replay.status,
      replay_warning_count: warningCount,
      result_ref: replay.artifact_refs.json_ref,
      next_commands: [
        `pnpm run runtime -- review replays --replay ${replay.id} --state-root <state-root>`,
        input.selected.decision_command ?? ""
      ].filter((command) => command.length > 0),
      replay_audit: {
        status: replay.status,
        replay_ref: replay.artifact_refs.json_ref,
        markdown_ref: replay.artifact_refs.markdown_ref,
        trace_ref: replay.trace_ref,
        completion_id: replay.completion_id,
        warning_count: warningCount,
        repo_write_guards: replay.metrics.repo_write_guards,
        delegated_results_failed: replay.metrics.delegated_results_failed,
        model_diagnostics: replay.metrics.model_diagnostics
      }
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      trace_ref: traceRef,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

function replayTraceRefForOpportunity(item: OpportunityBacklogItem): string | null {
  if (item.kind === "completion_verification") {
    return item.completion_verification?.completion_id
      ?? item.completion_verification?.report_ref
      ?? null;
  }
  if (item.kind === "repo_write_guard") {
    return item.repo_write_guard?.trace_ref
      ?? item.repo_write_guard?.completion_id
      ?? null;
  }
  return null;
}

async function executeContextHealthRepairAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
  }
): Promise<ExecuteNextOpportunityActionResult> {
  const health = input.selected.context_health;
  if (
    input.selected.action_kind !== "repair_context_health"
    || health?.issue_kind !== SUPPORTED_CONTEXT_HEALTH_ISSUE_KIND
    || !health.context_ref
    || !health.manifest_ref
  ) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      context_health_issue_kind: health?.issue_kind,
      context_ref: health?.context_ref ?? undefined,
      manifest_ref: health?.manifest_ref ?? undefined,
      blocked_reason: `unsupported context health act-next repair: issue_kind=${health?.issue_kind ?? "unknown"}`
    });
  }
  const contextRef = health.context_ref;
  const manifestRef = health.manifest_ref;

  try {
    const repaired = await repairContextManifest(store, {
      contextRef
    });
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "executed",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      context_health_issue_kind: health.issue_kind,
      context_ref: repaired.context_ref,
      manifest_ref: repaired.ref,
      context_repair_status: repaired.status,
      context_repair_total_chars: repaired.total_chars,
      context_repair_section_count: repaired.section_count,
      result_ref: repaired.ref,
      next_commands: [
        health.inspect_command,
        health.operator_guidance.complete_after_external_repair_command
      ],
      context_repair: {
        status: repaired.status,
        context_ref: repaired.context_ref,
        manifest_ref: repaired.ref,
        total_chars: repaired.total_chars,
        section_count: repaired.section_count
      }
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      context_health_issue_kind: health.issue_kind,
      context_ref: contextRef,
      manifest_ref: manifestRef,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeFeedbackCaptureAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
    gap: NonNullable<OpportunityBacklogItem["self_evolution_gap"]>;
    args: ExecuteNextOpportunityActionArgs;
  }
): Promise<ExecuteNextOpportunityActionResult> {
  try {
    const result = await refreshContentFeedback(store, {
      runRef: input.gap.source_ref,
      limit: 1,
      serverUrl: input.args.serverUrl,
      client: input.args.feedbackClient,
      notes: "feedback captured by governance act-next"
    });
    const first = result.refreshed[0];
    const actionStatus: OpportunityActionStatus = result.item_refs.length > 0 ? "executed" : "blocked";
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: actionStatus,
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      run_id: first?.run_id,
      run_ref: first?.run_ref ?? input.gap.source_ref,
      feedback_adapter: "xiaohongshu-mcp",
      feedback_captured_count: result.summary.captured_count,
      feedback_failed_count: result.summary.failed_count,
      feedback_skipped_count: result.summary.skipped_count,
      result_ref: first?.evidence_ref,
      next_commands: result.next_commands,
      blocked_reason: actionStatus === "blocked"
        ? feedbackCaptureBlockedReason(result)
        : undefined,
      feedback_refresh: summarizeFeedbackRefreshAction(result)
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeSopConfirmationAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
  }
): Promise<ExecuteNextOpportunityActionResult> {
  if (!input.selected.next_command?.request_command) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      sop_id: input.selected.id,
      sop_ref: input.selected.ref,
      blocked_reason: "SOP evolution chain has no confirmable next command"
    });
  }

  try {
    const runner = new BackgroundReviewRunner({
      repoRoot: store.repoRoot,
      stateRoot: store.stateRoot
    });
    const confirmation = await runner.requestSopNextCommandConfirmation({
      sopRef: input.selected.ref
    });
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "executed",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      sop_id: confirmation.confirmation.sop_id ?? input.selected.id,
      sop_ref: confirmation.confirmation.sop_ref ?? input.selected.ref,
      confirmation_ref: confirmation.confirmation_ref,
      confirmation_markdown_ref: confirmation.confirmation_markdown_ref,
      confirmation_action_kind: confirmation.confirmation.action_kind,
      confirmation_would_write: confirmation.confirmation.would_write,
      evidence_event_id: confirmation.evidence_event_id,
      result_ref: confirmation.confirmation_ref,
      next_commands: [confirmation.confirmation.next_step],
      sop_confirmation: {
        confirmation_ref: confirmation.confirmation_ref,
        confirmation_markdown_ref: confirmation.confirmation_markdown_ref,
        evidence_event_id: confirmation.evidence_event_id,
        action_kind: confirmation.confirmation.action_kind,
        sop_id: confirmation.confirmation.sop_id ?? input.selected.id,
        sop_ref: confirmation.confirmation.sop_ref ?? input.selected.ref,
        would_write: confirmation.confirmation.would_write,
        next_step: confirmation.confirmation.next_step
      }
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      sop_id: input.selected.id,
      sop_ref: input.selected.ref,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function executeCreatorMetricsAction(
  store: AgentStore,
  input: {
    createdAt: string;
    selected: OpportunityBacklogItem;
    selectedSummary: ExecuteNextOpportunityActionResult["selected_opportunity"];
    gap: NonNullable<OpportunityBacklogItem["self_evolution_gap"]>;
    args: ExecuteNextOpportunityActionArgs;
  }
): Promise<ExecuteNextOpportunityActionResult> {
  try {
    const result = await captureCreatorMetrics(store, {
      runRef: input.gap.source_ref,
      creatorUrl: input.args.creatorUrl,
      pageText: input.args.pageText,
      client: input.args.creatorMetricsClient,
      browserSessionName: input.args.browserSessionName,
      browserAutoConnect: input.args.browserAutoConnect,
      browserCdpPort: input.args.browserCdpPort,
      notes: "creator metrics captured by governance act-next"
    });
    const viewCount = result.evidence?.metrics.view_count ?? result.capture.metrics?.view_count;
    const actionStatus: OpportunityActionStatus = result.evidence_ref ? "executed" : "blocked";
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: actionStatus,
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      run_id: result.run.id,
      run_ref: result.run.run_ref,
      creator_url: input.args.creatorUrl,
      capture_status: result.status,
      capture_adapter: result.capture.adapter,
      capture_error: result.capture.error,
      result_ref: result.evidence_ref,
      next_commands: result.capture.next_commands,
      blocked_reason: result.evidence_ref ? undefined : result.capture.error ?? `creator metrics capture did not produce typed feedback evidence: ${result.status}`,
      creator_metrics: {
        status: result.status,
        captured_by: "agent-browser-cli",
        ...(result.evidence_ref ? { evidence_ref: result.evidence_ref } : {}),
        ...(viewCount !== undefined ? { view_count: viewCount } : {}),
        ...(result.capture.source_ref ? { source_ref: result.capture.source_ref } : {}),
        ...(result.capture.error ? { error: result.capture.error } : {})
      }
    });
  } catch (error) {
    return writeActionResult(store, {
      createdAt: input.createdAt,
      status: "blocked",
      selected: input.selected,
      selectedSummary: input.selectedSummary,
      blocked_reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function selectOpportunity(
  store: AgentStore,
  args: ExecuteNextOpportunityActionArgs
): Promise<OpportunityBacklogItem | null> {
  const backlog = await getOpportunityBacklog(store, {
    limit: args.limit ?? Number.MAX_SAFE_INTEGER
  });
  const items = args.allowedKinds && args.allowedKinds.length > 0
    ? backlog.items.filter((item) => args.allowedKinds?.includes(item.kind))
    : backlog.items;
  if (args.opportunity) {
    const requested = args.opportunity.trim();
    return items.find((item) =>
      item.id === requested
      || item.ref === requested
      || item.source_ref === requested
      || item.self_evolution_gap?.gap_id === requested
      || item.self_evolution_gap?.gap_ref === requested
      || item.self_evolution_gap?.source_ref === requested
    ) ?? null;
  }
  return items.find((item) => {
    const policy = getOpportunityActionExecutionPolicy(item);
    return policy.supported && (args.executionMode !== "auto" || policy.auto_executable);
  }) ?? null;
}

function isSupportedTypedOpportunity(item: OpportunityBacklogItem): boolean {
  if (item.kind === "review_inbox") {
    return isAutoCompletableReviewInbox(item);
  }
  if (item.kind === "archive_health") {
    return item.status === "error"
      && item.action_kind === "refresh_episode_archives"
      && (item.archive_health?.issue_kind === "missing_archive" || item.archive_health?.issue_kind === "stale_archive")
      && Boolean(item.archive_health.refresh_command);
  }
  if (item.kind === "sop_evolution_chain") {
    return Boolean(item.next_command?.request_command);
  }
  if (item.kind === "context_health") {
    return item.status === "warning"
      && item.action_kind === "repair_context_health"
      && item.context_health?.issue_kind === SUPPORTED_CONTEXT_HEALTH_ISSUE_KIND
      && Boolean(item.context_health.context_ref)
      && Boolean(item.context_health.manifest_ref)
      && Boolean(item.context_health.operator_guidance.repair_manifest_command);
  }
  if (item.kind === "completion_verification") {
    return Boolean(item.completion_verification?.completion_id || item.completion_verification?.report_ref);
  }
  if (item.kind === "repo_write_guard") {
    return item.status === "attention"
      && item.action_kind === "inspect_repo_write_guard"
      && Boolean(item.repo_write_guard?.trace_ref || item.repo_write_guard?.completion_id);
  }
  return item.kind === "self_evolution_gap"
    && item.status === "active"
    && (
      item.self_evolution_gap?.proposed_slice === SUPPORTED_SOURCE_QUALITY_SLICE
      || item.self_evolution_gap?.proposed_slice === SUPPORTED_PREFLIGHT_SLICE
      || item.self_evolution_gap?.proposed_slice === SUPPORTED_CREATOR_METRICS_SLICE
      || item.self_evolution_gap?.proposed_slice === SUPPORTED_FEEDBACK_CAPTURE_SLICE
      || item.self_evolution_gap?.proposed_slice === SUPPORTED_FEEDBACK_STRATEGY_NEXT_GENERATION_SLICE
      || item.self_evolution_gap?.proposed_slice === SUPPORTED_FEEDBACK_STRATEGY_PREVIEW_REVIEW_SLICE
      || item.self_evolution_gap?.proposed_slice === SUPPORTED_FEEDBACK_REFRESH_ROUTE_REVIEW_SLICE
    )
    && Boolean(item.self_evolution_gap?.source_ref);
}

export function isAutoCompletableReviewInbox(item: OpportunityBacklogItem): boolean {
  return reviewInboxCompletionReason(item) !== null;
}

export function isAutoExecutableOpportunityAction(item: OpportunityBacklogItem): boolean {
  return getOpportunityActionExecutionPolicy(item).auto_executable;
}

export function getOpportunityActionExecutionPolicy(item: OpportunityBacklogItem): OpportunityActionExecutionPolicy {
  if (!isSupportedTypedOpportunity(item)) {
    return {
      supported: false,
      auto_executable: false,
      risk: "unsupported",
      side_effect_level: item.budget_hint.side_effect_level,
      external_io: false,
      reason: `unsupported typed opportunity action for kind=${item.kind} status=${item.status}`
    };
  }
  if (item.kind === "review_inbox" && isAutoCompletableReviewInbox(item)) {
    return {
      supported: true,
      auto_executable: true,
      risk: "auto_safe",
      side_effect_level: "local_write",
      external_io: false,
      reason: "covered review inbox completion is append-only local state and removes the selected backlog item"
    };
  }
  if (
    item.kind === "archive_health"
    && item.action_kind === "refresh_episode_archives"
    && (item.archive_health?.issue_kind === "missing_archive" || item.archive_health?.issue_kind === "stale_archive")
    && item.archive_health.refresh_command
  ) {
    return {
      supported: true,
      auto_executable: true,
      risk: "auto_safe",
      side_effect_level: "local_write",
      external_io: false,
      reason: `episode archive ${item.archive_health.issue_kind} can be repaired by deterministic local archive rebuild`
    };
  }
  if (item.kind === "self_evolution_gap") {
    if (
      item.self_evolution_gap?.proposed_slice === SUPPORTED_PREFLIGHT_SLICE
      || item.self_evolution_gap?.proposed_slice === SUPPORTED_CREATOR_METRICS_SLICE
      || item.self_evolution_gap?.proposed_slice === SUPPORTED_FEEDBACK_CAPTURE_SLICE
    ) {
      return {
        supported: true,
        auto_executable: false,
        risk: "manual_external",
        side_effect_level: "local_write",
        external_io: true,
        reason: `requires operator-triggered external read/probe for proposed_slice=${item.self_evolution_gap.proposed_slice}`
      };
    }
    return {
      supported: true,
      auto_executable: false,
      risk: "manual_local",
      side_effect_level: "local_write",
      external_io: false,
      reason: `local typed action for proposed_slice=${item.self_evolution_gap?.proposed_slice ?? "unknown"} still needs operator-triggered act-next until a convergence gate exists`
    };
  }
  if (item.kind === "sop_evolution_chain") {
    return {
      supported: true,
      auto_executable: false,
      risk: "manual_local",
      side_effect_level: "local_write",
      external_io: false,
      reason: "SOP evolution only requests confirmation and must remain operator-triggered"
    };
  }
  if (item.kind === "context_health") {
    return {
      supported: true,
      auto_executable: false,
      risk: "manual_local",
      side_effect_level: "local_write",
      external_io: false,
      reason: "context manifest repair writes local state and requires an explicit act-next request"
    };
  }
  if (item.kind === "completion_verification" || item.kind === "repo_write_guard") {
    return {
      supported: true,
      auto_executable: false,
      risk: "manual_local",
      side_effect_level: "local_write",
      external_io: false,
      reason: "harness replay writes local audit artifacts and requires an explicit act-next request"
    };
  }
  return {
    supported: true,
    auto_executable: false,
    risk: "manual_local",
    side_effect_level: item.budget_hint.side_effect_level,
    external_io: false,
    reason: `typed action for kind=${item.kind} requires an explicit act-next request`
  };
}

function reviewInboxCompletionReason(item: OpportunityBacklogItem): {
  completion_kind: string;
  reason: string;
} | null {
  if (item.kind !== "review_inbox" || item.status !== "open") return null;
  if (item.action_kind === "narrow_review" && item.score_reasons.includes("narrow_review_archive_health=covered")) {
    return {
      completion_kind: "narrow_review_archive_health_covered",
      reason: "Archive health is current after explicit refresh."
    };
  }
  if (item.action_kind === "revise_skill" && item.reused_skill_coverage?.status === "covered") {
    return {
      completion_kind: "reused_skill_coverage_covered",
      reason: "Reused skill coverage is current; no fresh drift evidence."
    };
  }
  if (item.action_kind === "draft_sop" && item.draft_sop_readiness?.status === "covered_by_existing_sop") {
    return {
      completion_kind: "draft_sop_covered_by_existing_sop",
      reason: "Existing SOP or skill coverage already satisfies this SOP candidate."
    };
  }
  return null;
}

function summarizeFeedbackRefreshAction(
  result: RefreshContentFeedbackResult
): NonNullable<ExecuteNextOpportunityActionResult["feedback_refresh"]> {
  const first = result.refreshed[0];
  return {
    count: result.count,
    captured_count: result.summary.captured_count,
    failed_count: result.summary.failed_count,
    skipped_count: result.summary.skipped_count,
    evidence_refs: result.item_refs,
    ...(first ? { first_status: first.status } : {}),
    ...(first ? { first_evidence_ref: first.evidence_ref } : {}),
    ...(first?.error ? { first_error: first.error } : {})
  };
}

function summarizeArchiveRefresh(
  archive: EpisodeArchiveResult,
  health: ArchiveHealthResult,
  date?: string
): NonNullable<ExecuteNextOpportunityActionResult["archive_refresh"]> {
  const refreshed = date
    ? archive.archived_days.find((day) => day.date === date)
    : undefined;
  return {
    source_ref: archive.source_ref,
    archive_root_ref: archive.archive_root_ref,
    total_events: archive.total_events,
    archived_day_count: archive.archived_days.length,
    ...(refreshed ? { refreshed_date: refreshed.date } : {}),
    ...(refreshed ? { refreshed_archive_ref: refreshed.archive_ref } : {}),
    ...(refreshed ? { refreshed_markdown_ref: refreshed.markdown_ref } : {}),
    ...(refreshed ? { refreshed_event_count: refreshed.event_count } : {}),
    health_status: health.status,
    remaining_issue_count: health.count
  };
}

function feedbackCaptureBlockedReason(result: RefreshContentFeedbackResult): string {
  const skipped = result.skipped[0];
  if (skipped) return skipped.reason;
  if (result.summary.queued_count === 0) return "no feedback-needed queue item matched the selected opportunity";
  return "feedback refresh did not produce typed feedback evidence";
}

function feedbackStrategyCanApply(posture: ContentFeedbackStrategyPosture): boolean {
  return posture === "reuse_baseline" || posture === "revise_next_post";
}

function feedbackRefreshRouteReviewReadiness(health: ServiceHealthResult): {
  ready: boolean;
  reason?: string;
} {
  const feedbackRefresh = health.content_feedback_refresh;
  const dueCount = feedbackRefresh.last_due_count ?? 0;
  const skippedCount = feedbackRefresh.last_skipped_count ?? 0;
  const collectMoreCount = feedbackRefresh.last_strategy_collect_more_feedback_count ?? 0;
  if (!feedbackRefresh.enabled) {
    return { ready: false, reason: "content feedback refresh is disabled" };
  }
  if (feedbackRefresh.state !== "skipped") {
    return { ready: false, reason: `content feedback refresh is no longer skipped: state=${feedbackRefresh.state}` };
  }
  if (dueCount <= 0 || skippedCount <= 0) {
    return { ready: false, reason: `content feedback refresh has no due skipped items: due=${dueCount} skipped=${skippedCount}` };
  }
  if (feedbackRefresh.last_top_skip_reason !== "non_mcp_capture_route") {
    return { ready: false, reason: `content feedback refresh top skip reason changed: ${feedbackRefresh.last_top_skip_reason ?? "unknown"}` };
  }
  if (collectMoreCount <= 0 && feedbackRefresh.last_strategy_top_posture !== "collect_more_feedback") {
    return {
      ready: false,
      reason: `feedback strategy no longer asks to collect more feedback: top_posture=${feedbackRefresh.last_strategy_top_posture ?? "unknown"} collect_more=${collectMoreCount}`
    };
  }
  return { ready: true };
}

function feedbackStrategyTrackId(strategy: { workflow_id: string; topic: string; title: string }): "ai_applications" | "ai_compute_market" {
  const text = [strategy.workflow_id, strategy.topic, strategy.title].join(" ");
  return /(ai[_-]?applications?|applications?|agent tooling|product launches?|commercial adoption|commercialization|应用|智能体|产品)/i.test(text)
    ? "ai_applications"
    : "ai_compute_market";
}

function summarizeSourceQualityAction(run: ContentRun): SourceQualityActionSummary {
  const sourceItems = run.source_items.filter((item) =>
    item.kind === "http_fetch" || item.kind === "market_quote"
  );
  const newsItems = sourceItems.filter((item) => item.kind === "http_fetch");
  const marketItems = sourceItems.filter((item) => item.kind === "market_quote");
  const usableItems = sourceItems.filter(isUsableSourceItem);
  const failedItems = sourceItems.filter((item) => item.fetched === false || Boolean(item.error));
  const staleItems = sourceItems.filter((item) => sourceFreshnessStatus(item) === "stale");
  const unknownFreshnessItems = sourceItems.filter((item) => sourceFreshnessStatus(item) === "unknown");
  const duplicateItems = sourceItems.filter((item) => Boolean(sourceQualityField(item, "duplicate_of")));
  const usableNewsCount = newsItems.filter(isUsableSourceItem).length;
  const usableMarketCount = marketItems.filter(isUsableSourceItem).length;
  const issues = [
    ...(sourceItems.length === 0 ? ["no bounded source evidence items are attached to the run"] : []),
    ...(newsItems.length > 0 && usableNewsCount === 0 ? ["no usable AI news source survived source-quality scoring"] : []),
    ...(marketItems.length > 0 && usableMarketCount === 0 ? ["no usable market quote survived source-quality scoring"] : []),
    ...(failedItems.length > 0 ? [`${failedItems.length} source item(s) failed to fetch or parse`] : []),
    ...(staleItems.length > 0 ? [`${staleItems.length} source item(s) are stale`] : []),
    ...(unknownFreshnessItems.length > 0 ? [`${unknownFreshnessItems.length} source item(s) have unknown freshness`] : []),
    ...(duplicateItems.length > 0 ? [`${duplicateItems.length} source item(s) are duplicates and not usable for drafting`] : [])
  ];
  return {
    run_id: run.id,
    run_ref: run.refs.run_ref,
    ...(run.refs.source_evidence_ref ? { source_evidence_ref: run.refs.source_evidence_ref } : {}),
    source_item_count: sourceItems.length,
    usable_source_count: usableItems.length,
    failed_source_count: failedItems.length,
    stale_source_count: staleItems.length,
    unknown_freshness_count: unknownFreshnessItems.length,
    duplicate_source_count: duplicateItems.length,
    usable_news_count: usableNewsCount,
    usable_market_count: usableMarketCount,
    issue_count: issues.length,
    issues
  };
}

function isUsableSourceItem(item: ContentRun["source_items"][number]): boolean {
  const usable = sourceQualityField(item, "usable_for_draft");
  if (typeof usable === "boolean") return usable;
  return item.fetched === true && !item.error;
}

function sourceFreshnessStatus(item: ContentRun["source_items"][number]): "fresh" | "stale" | "unknown" {
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const status = metadata.freshness_status;
  return status === "fresh" || status === "stale" || status === "unknown" ? status : "unknown";
}

function sourceQualityField(item: ContentRun["source_items"][number], key: string): unknown {
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const quality = metadata.source_quality;
  if (!isRecord(quality)) return undefined;
  return quality[key];
}

async function probeXiaohongshu(args: {
  client?: OpportunityPublishPreflightProbeClient;
  serverUrl?: string;
  tool: string;
}): Promise<XiaohongshuMcpProbeResult | undefined> {
  const client = args.client ?? (args.serverUrl
    ? new XiaohongshuMcpClient({ serverUrl: args.serverUrl, timeoutMs: 15000 })
    : undefined);
  if (!client) return undefined;
  return client.probe({ publishTool: args.tool });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeOpportunity(item: OpportunityBacklogItem): ExecuteNextOpportunityActionResult["selected_opportunity"] {
  return {
    id: item.id,
    ref: item.ref,
    kind: item.kind,
    title: item.title,
    status: item.status,
    ...(item.action_kind ? { action_kind: item.action_kind } : {}),
    ...(item.self_evolution_gap?.proposed_slice ? { proposed_slice: item.self_evolution_gap.proposed_slice } : {})
  };
}

async function writeActionResult(
  store: AgentStore,
  args: {
    createdAt: string;
    status: OpportunityActionStatus;
    selected?: OpportunityBacklogItem;
    selectedSummary?: ExecuteNextOpportunityActionResult["selected_opportunity"];
    execution_policy?: OpportunityActionExecutionPolicy;
    run_id?: string;
    run_ref?: string;
    publish_adapter?: string;
    publish_tool?: string;
    server_url?: string;
    creator_url?: string;
    capture_status?: CreatorMetricsCaptureStatus;
    capture_adapter?: "agent-browser-cli";
    capture_error?: string;
    feedback_adapter?: "xiaohongshu-mcp";
    feedback_captured_count?: number;
    feedback_failed_count?: number;
    feedback_skipped_count?: number;
    feedback_strategy_source_run_id?: string;
    feedback_strategy_source_run_ref?: string;
    feedback_strategy_generated_run_id?: string;
    feedback_strategy_generated_run_ref?: string;
    feedback_strategy_posture?: ContentFeedbackStrategyPosture;
    feedback_strategy_applied?: boolean;
    feedback_strategy_preview_review_ref?: string;
    feedback_strategy_preview_title_changed?: boolean;
    feedback_strategy_preview_guardrail?: string;
    feedback_refresh_route_review_ref?: string;
    feedback_refresh_route_state?: string;
    feedback_refresh_route_top_skip_reason?: string;
    feedback_refresh_route_due_count?: number;
    feedback_refresh_route_skipped_count?: number;
    review_inbox_item_id?: string;
    review_inbox_item_ref?: string;
    review_inbox_action_kind?: string;
    review_inbox_completion_kind?: string;
    review_inbox_decision_ref?: string;
    review_inbox_decision_status?: string;
    review_inbox_decision_reason?: string;
    archive_refresh_date?: string;
    archive_refresh_archive_ref?: string;
    archive_refresh_markdown_ref?: string;
    archive_refresh_event_count?: number;
    archive_refresh_day_count?: number;
    archive_refresh_total_events?: number;
    archive_refresh_health_status?: ArchiveHealthResult["status"];
    archive_refresh_remaining_issue_count?: number;
    source_quality_issue_count?: number;
    source_quality_usable_count?: number;
    source_quality_failed_count?: number;
    source_quality_stale_count?: number;
    sop_id?: string;
    sop_ref?: string;
    confirmation_ref?: string;
    confirmation_markdown_ref?: string;
    confirmation_action_kind?: string;
    confirmation_would_write?: string[];
    context_health_issue_kind?: string;
    context_ref?: string;
    manifest_ref?: string;
    context_repair_status?: ContextManifestRepairResult["status"];
    context_repair_total_chars?: number;
    context_repair_section_count?: number;
    completion_id?: string;
    trace_ref?: string;
    replay_ref?: string;
    replay_markdown_ref?: string;
    replay_status?: HarnessReplayAuditReport["status"];
    replay_warning_count?: number;
    evidence_event_id?: string;
    result_ref?: string;
    next_commands?: string[];
    sop_confirmation?: ExecuteNextOpportunityActionResult["sop_confirmation"];
    context_repair?: ExecuteNextOpportunityActionResult["context_repair"];
    replay_audit?: ExecuteNextOpportunityActionResult["replay_audit"];
    creator_metrics?: ExecuteNextOpportunityActionResult["creator_metrics"];
    feedback_refresh?: ExecuteNextOpportunityActionResult["feedback_refresh"];
    feedback_strategy_next_generation?: ExecuteNextOpportunityActionResult["feedback_strategy_next_generation"];
    feedback_strategy_preview_review?: ExecuteNextOpportunityActionResult["feedback_strategy_preview_review"];
    feedback_refresh_route_review?: ExecuteNextOpportunityActionResult["feedback_refresh_route_review"];
    review_inbox_completion?: ExecuteNextOpportunityActionResult["review_inbox_completion"];
    archive_refresh?: ExecuteNextOpportunityActionResult["archive_refresh"];
    source_quality?: ExecuteNextOpportunityActionResult["source_quality"];
    preflight?: ExecuteNextOpportunityActionResult["preflight"];
    skipped_reason?: string;
    blocked_reason?: string;
  }
): Promise<ExecuteNextOpportunityActionResult> {
  const id = newId("opportunity_action");
  const gap = args.selected?.self_evolution_gap;
  const executionPolicy = args.execution_policy ?? (args.selected
    ? getOpportunityActionExecutionPolicy(args.selected)
    : undefined);
  const record: OpportunityActionRecord = {
    schema_version: 1,
    id,
    kind: "opportunity_action",
    action: "act-next",
    status: args.status,
    ...(args.selected ? { selected_opportunity_id: args.selected.id, selected_opportunity_ref: args.selected.ref } : {}),
    ...(gap ? { selected_gap_id: gap.gap_id, selected_gap_ref: gap.gap_ref, proposed_slice: gap.proposed_slice } : {}),
    ...(args.selected?.action_kind ? { selected_action_kind: args.selected.action_kind } : {}),
    ...(executionPolicy ? { execution_policy: executionPolicy } : {}),
    ...(args.run_id ? { run_id: args.run_id } : {}),
    ...(args.run_ref ? { run_ref: args.run_ref } : {}),
    ...(args.sop_id ? { sop_id: args.sop_id } : {}),
    ...(args.sop_ref ? { sop_ref: args.sop_ref } : {}),
    ...(args.confirmation_ref ? { confirmation_ref: args.confirmation_ref } : {}),
    ...(args.confirmation_markdown_ref ? { confirmation_markdown_ref: args.confirmation_markdown_ref } : {}),
    ...(args.confirmation_action_kind ? { confirmation_action_kind: args.confirmation_action_kind } : {}),
    ...(args.confirmation_would_write ? { confirmation_would_write: args.confirmation_would_write } : {}),
    ...(args.context_health_issue_kind ? { context_health_issue_kind: args.context_health_issue_kind } : {}),
    ...(args.context_ref ? { context_ref: args.context_ref } : {}),
    ...(args.manifest_ref ? { manifest_ref: args.manifest_ref } : {}),
    ...(args.context_repair_status ? { context_repair_status: args.context_repair_status } : {}),
    ...(args.context_repair_total_chars !== undefined ? { context_repair_total_chars: args.context_repair_total_chars } : {}),
    ...(args.context_repair_section_count !== undefined ? { context_repair_section_count: args.context_repair_section_count } : {}),
    ...(args.completion_id ? { completion_id: args.completion_id } : {}),
    ...(args.trace_ref ? { trace_ref: args.trace_ref } : {}),
    ...(args.replay_ref ? { replay_ref: args.replay_ref } : {}),
    ...(args.replay_markdown_ref ? { replay_markdown_ref: args.replay_markdown_ref } : {}),
    ...(args.replay_status ? { replay_status: args.replay_status } : {}),
    ...(args.replay_warning_count !== undefined ? { replay_warning_count: args.replay_warning_count } : {}),
    ...(args.evidence_event_id ? { evidence_event_id: args.evidence_event_id } : {}),
    ...(args.publish_adapter ? { publish_adapter: args.publish_adapter } : {}),
    ...(args.publish_tool ? { publish_tool: args.publish_tool } : {}),
    ...(args.server_url ? { server_url: args.server_url } : {}),
    ...(args.creator_url ? { creator_url: args.creator_url } : {}),
    ...(args.capture_status ? { capture_status: args.capture_status } : {}),
    ...(args.capture_adapter ? { capture_adapter: args.capture_adapter } : {}),
    ...(args.capture_error ? { capture_error: args.capture_error } : {}),
    ...(args.feedback_adapter ? { feedback_adapter: args.feedback_adapter } : {}),
    ...(args.feedback_captured_count !== undefined ? { feedback_captured_count: args.feedback_captured_count } : {}),
    ...(args.feedback_failed_count !== undefined ? { feedback_failed_count: args.feedback_failed_count } : {}),
    ...(args.feedback_skipped_count !== undefined ? { feedback_skipped_count: args.feedback_skipped_count } : {}),
    ...(args.feedback_strategy_source_run_id ? { feedback_strategy_source_run_id: args.feedback_strategy_source_run_id } : {}),
    ...(args.feedback_strategy_source_run_ref ? { feedback_strategy_source_run_ref: args.feedback_strategy_source_run_ref } : {}),
    ...(args.feedback_strategy_generated_run_id ? { feedback_strategy_generated_run_id: args.feedback_strategy_generated_run_id } : {}),
    ...(args.feedback_strategy_generated_run_ref ? { feedback_strategy_generated_run_ref: args.feedback_strategy_generated_run_ref } : {}),
    ...(args.feedback_strategy_posture ? { feedback_strategy_posture: args.feedback_strategy_posture } : {}),
    ...(args.feedback_strategy_applied !== undefined ? { feedback_strategy_applied: args.feedback_strategy_applied } : {}),
    ...(args.feedback_strategy_preview_review_ref ? { feedback_strategy_preview_review_ref: args.feedback_strategy_preview_review_ref } : {}),
    ...(args.feedback_strategy_preview_title_changed !== undefined ? { feedback_strategy_preview_title_changed: args.feedback_strategy_preview_title_changed } : {}),
    ...(args.feedback_strategy_preview_guardrail ? { feedback_strategy_preview_guardrail: args.feedback_strategy_preview_guardrail } : {}),
    ...(args.feedback_refresh_route_review_ref ? { feedback_refresh_route_review_ref: args.feedback_refresh_route_review_ref } : {}),
    ...(args.feedback_refresh_route_state ? { feedback_refresh_route_state: args.feedback_refresh_route_state } : {}),
    ...(args.feedback_refresh_route_top_skip_reason ? { feedback_refresh_route_top_skip_reason: args.feedback_refresh_route_top_skip_reason } : {}),
    ...(args.feedback_refresh_route_due_count !== undefined ? { feedback_refresh_route_due_count: args.feedback_refresh_route_due_count } : {}),
    ...(args.feedback_refresh_route_skipped_count !== undefined ? { feedback_refresh_route_skipped_count: args.feedback_refresh_route_skipped_count } : {}),
    ...(args.review_inbox_item_id ? { review_inbox_item_id: args.review_inbox_item_id } : {}),
    ...(args.review_inbox_item_ref ? { review_inbox_item_ref: args.review_inbox_item_ref } : {}),
    ...(args.review_inbox_action_kind ? { review_inbox_action_kind: args.review_inbox_action_kind } : {}),
    ...(args.review_inbox_completion_kind ? { review_inbox_completion_kind: args.review_inbox_completion_kind } : {}),
    ...(args.review_inbox_decision_ref ? { review_inbox_decision_ref: args.review_inbox_decision_ref } : {}),
    ...(args.review_inbox_decision_status ? { review_inbox_decision_status: args.review_inbox_decision_status } : {}),
    ...(args.review_inbox_decision_reason ? { review_inbox_decision_reason: args.review_inbox_decision_reason } : {}),
    ...(args.archive_refresh_date ? { archive_refresh_date: args.archive_refresh_date } : {}),
    ...(args.archive_refresh_archive_ref ? { archive_refresh_archive_ref: args.archive_refresh_archive_ref } : {}),
    ...(args.archive_refresh_markdown_ref ? { archive_refresh_markdown_ref: args.archive_refresh_markdown_ref } : {}),
    ...(args.archive_refresh_event_count !== undefined ? { archive_refresh_event_count: args.archive_refresh_event_count } : {}),
    ...(args.archive_refresh_day_count !== undefined ? { archive_refresh_day_count: args.archive_refresh_day_count } : {}),
    ...(args.archive_refresh_total_events !== undefined ? { archive_refresh_total_events: args.archive_refresh_total_events } : {}),
    ...(args.archive_refresh_health_status ? { archive_refresh_health_status: args.archive_refresh_health_status } : {}),
    ...(args.archive_refresh_remaining_issue_count !== undefined ? { archive_refresh_remaining_issue_count: args.archive_refresh_remaining_issue_count } : {}),
    ...(args.source_quality_issue_count !== undefined ? { source_quality_issue_count: args.source_quality_issue_count } : {}),
    ...(args.source_quality_usable_count !== undefined ? { source_quality_usable_count: args.source_quality_usable_count } : {}),
    ...(args.source_quality_failed_count !== undefined ? { source_quality_failed_count: args.source_quality_failed_count } : {}),
    ...(args.source_quality_stale_count !== undefined ? { source_quality_stale_count: args.source_quality_stale_count } : {}),
    ...(args.result_ref ? { result_ref: args.result_ref } : {}),
    ...(args.next_commands && args.next_commands.length > 0 ? { next_commands: args.next_commands } : {}),
    ...(args.skipped_reason ? { skipped_reason: args.skipped_reason } : {}),
    ...(args.blocked_reason ? { blocked_reason: args.blocked_reason } : {}),
    created_at: args.createdAt,
    boundary: OPPORTUNITY_ACTION_BOUNDARY
  };
  const auditRef = await store.writeJson(`${OPPORTUNITY_ACTIONS_DIR}/${id}.json`, record);
  return {
    created_at: args.createdAt,
    status: args.status,
    action: "act-next",
    ...(args.selectedSummary ? { selected_opportunity: args.selectedSummary } : {}),
    ...(executionPolicy ? { execution_policy: executionPolicy } : {}),
    ...(args.preflight ? { preflight: args.preflight } : {}),
    ...(args.feedback_refresh ? { feedback_refresh: args.feedback_refresh } : {}),
    ...(args.feedback_strategy_next_generation ? { feedback_strategy_next_generation: args.feedback_strategy_next_generation } : {}),
    ...(args.feedback_strategy_preview_review ? { feedback_strategy_preview_review: args.feedback_strategy_preview_review } : {}),
    ...(args.feedback_refresh_route_review ? { feedback_refresh_route_review: args.feedback_refresh_route_review } : {}),
    ...(args.review_inbox_completion ? { review_inbox_completion: args.review_inbox_completion } : {}),
    ...(args.archive_refresh ? { archive_refresh: args.archive_refresh } : {}),
    ...(args.source_quality ? { source_quality: args.source_quality } : {}),
    ...(args.creator_metrics ? { creator_metrics: args.creator_metrics } : {}),
    ...(args.sop_confirmation ? { sop_confirmation: args.sop_confirmation } : {}),
    ...(args.context_repair ? { context_repair: args.context_repair } : {}),
    ...(args.replay_audit ? { replay_audit: args.replay_audit } : {}),
    ...(args.next_commands && args.next_commands.length > 0 ? { next_commands: args.next_commands } : {}),
    audit_ref: auditRef,
    record,
    boundary: OPPORTUNITY_ACTION_BOUNDARY
  };
}
