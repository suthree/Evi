import type { Opportunity, Trigger, TurnSnapshot } from "./schemas.js";
import { allowedActions } from "./action_contracts.js";
export { allowedActions } from "./action_contracts.js";
import { deriveContextBudget, type ContextBudgetSummary } from "./context_budget.js";
import {
  getCapabilityCatalog,
  type CapabilityCategory,
  type CapabilitySummary
} from "./capabilities.js";
import { listLatestDreamSnapshots } from "./dreams.js";
import {
  getGaProjectDesignReadModel,
  type GaProjectDesignPlanPacket
} from "./ga_project_design.js";
import { getSelfEvolutionScorecard } from "./self_evolution_scorecard.js";
import { getLatestSelfEvolutionIteration } from "./self_evolution_iterations.js";
import {
  listBackgroundReviews,
  type BackgroundReviewHistorySummary
} from "./background_review_history.js";
import {
  readLatestCompletionVerificationSummaries,
  type CompletionVerificationHistorySummary
} from "./completion_verification_history.js";
import { utcNow } from "./ids.js";
import {
  listLiveRunTraces,
  type LiveRunTraceSummary
} from "./live_run_trace.js";
import {
  listHarnessReplayAudits,
  type HarnessReplayAuditReport
} from "./harness_replay.js";
import {
  listContextPressure,
  type ContextPressureSummary
} from "./context_pressure.js";
import type { EpisodeArchiveRecord } from "./memory_store.js";
import {
  getOpportunityBacklog,
  type DraftSopReadinessBacklogSummary,
  type OpportunityBacklogItem,
  type ReusedSkillCoverageBacklogSummary
} from "./opportunity_backlog.js";
import {
  annotateReviewInboxDuplicates,
  latestReviewInboxDuplicateDecision,
  type ReviewInboxDuplicateGroup
} from "./review_inbox_duplicates.js";
import {
  latestReviewInboxDecision,
  readReviewInboxDecisions,
  suppressReviewInboxDecision,
  type ReviewInboxDecisionWithRef
} from "./review_inbox_decisions.js";
import {
  listReviewTicks,
  type ReviewTickHistorySummary
} from "./review_tick_history.js";
import {
  listPipelineRuns,
  type PipelineHistorySummary
} from "./pipeline_history.js";
import { turnSnapshotSchema, workingCheckpointSchema } from "./schemas.js";
import type { SkillResolverLike } from "./skill_resolver.js";
import {
  inspectSopEvolutionConfirmationGate,
  type SopEvolutionConfirmationGate
} from "./sop_confirmation_readiness.js";
import { getServiceHealth } from "./service_health.js";
import {
  getWorkspaceStatus,
  type WorkspaceChangeSummary,
  type WorkspaceStatusResult
} from "./workspace_status.js";
import {
  latestSopRecoveryDecision,
  readSopRecoveryDecisions,
  type SopRecoveryDecisionWithRef
} from "./sop_recovery_decisions.js";
import {
  getSopEvolutionLedger,
  renderSopEvolutionLedgerMarkdown
} from "./sop_evolution_ledger.js";
import { getDraftSopReadiness } from "./draft_sop_readiness.js";
import { getReusedSkillCoverage } from "./reused_skill_coverage.js";
import { AgentStore } from "./store.js";
import { renderTaskContextReferences } from "./task_context_references.js";
import { renderCoreToolExamples } from "./tool_contracts.js";

interface ContextSelection {
  memory_hits?: MemoryRecallHit[];
  skill_refs?: string[];
  skill_hits?: Array<Record<string, unknown>>;
  discipline?: {
    mode: "query_todo";
    query_ref: string;
    todo_ref: string;
  };
}

export interface MemoryRecallHit {
  id: string;
  session_id: string;
  kind: string;
  summary: string;
  artifact_refs: string[];
  score?: number;
  created_at?: string | null;
}

interface ContextSection {
  title: string;
  body: string;
  refs: string[];
  item_count?: number;
}

interface ContextRenderOptions {
  vaultRoot?: SkillResolverLike;
  runtimeConfig?: ContextRuntimeConfigSummary;
}

export interface ContextRuntimeConfigSummary {
  runtime: {
    promotion_enabled: boolean;
    structured_output: boolean;
    review_tick_enabled: boolean;
    review_tick_interval_ms: number;
    review_tick_limit: number;
    content_daily_enabled: boolean;
    content_daily_interval_ms: number;
    content_daily_dry_run: boolean;
    content_daily_preflight: boolean;
    content_daily_topic: string;
    content_daily_source_urls: string[];
    content_daily_tickers: string[];
    content_daily_image_model?: string;
    content_daily_publish_enabled: boolean;
    content_daily_external_write_confirmed: boolean;
    content_daily_publish_adapter: "xiaohongshu-mcp";
    content_daily_publish_server_url: string;
    content_daily_publish_tool: string;
    content_feedback_refresh_enabled: boolean;
    content_feedback_refresh_interval_ms: number;
    content_feedback_refresh_limit: number;
    content_feedback_refresh_min_follow_up_age_ms: number;
    content_feedback_refresh_server_url: string;
    content_creator_metrics_enabled: boolean;
    content_creator_metrics_interval_ms: number;
    content_creator_metrics_limit: number;
    content_creator_metrics_creator_url: string;
    content_creator_metrics_browser_session_name: string;
    content_creator_metrics_browser_auto_connect: boolean;
    content_creator_metrics_browser_cdp_port?: string;
    source_ref: string;
    defaulted_fields: string[];
  };
  active_model: {
    id: string | null;
    provider?: string;
    api?: string;
    model?: string;
    base_url?: string;
    auth_id?: string;
    context_window_tokens?: number;
    max_output_tokens?: number;
    context_budget?: ContextBudgetSummary | null;
    selector_ref?: string;
    source_ref?: string;
  };
  active_channel: {
    id: string | null;
    kind?: string;
    transport?: string;
    mode?: string;
    auth_id?: string;
    followup_queue_size?: number;
    selector_ref?: string;
    source_ref?: string;
  };
  active_scenario: {
    id: string | null;
    model_id?: string;
    discipline?: string;
    concurrency?: string;
    selector_ref?: string;
    source_ref?: string;
  };
  vault: {
    mode: string;
    active_root: string;
    seed_roots: string[];
    source_ref: string;
  };
  refs: string[];
  restart_guidance: string;
  boundary: string;
}

export interface ContextSectionManifest {
  title: string;
  chars: number;
  refs: string[];
  item_count: number;
}

export interface ContextBundleManifest {
  version: 1;
  created_at: string;
  session_id: string;
  turn_id: string;
  total_chars: number;
  section_count: number;
  sections: ContextSectionManifest[];
  recall: {
    memory_hit_count: number;
    memory_refs: string[];
    skill_ref_count: number;
    skill_refs: string[];
    archive_ref_count: number;
    archive_refs: string[];
    opportunity_ref_count: number;
    opportunity_refs: string[];
    discipline_active: boolean;
  };
  context_budget?: ContextBudgetSummary | null;
}

export interface RenderedContextBundle {
  markdown: string;
  manifest: ContextBundleManifest;
}

export async function buildTurnSnapshot(
  store: AgentStore,
  trigger: Trigger,
  acceptedGoal: string,
  opportunity: Opportunity,
  selection: ContextSelection = {}
): Promise<TurnSnapshot> {
  const stopSignal = await readStopSignal(store);
  const workingCheckpoint = await readLatestWorkingCheckpoint(store);
  return turnSnapshotSchema.parse({
    trigger_id: trigger.id,
    selected_opportunity_id: opportunity.id,
    stable_context: {
      soul_digest_ref: "core/soul.md",
      memory_policy_ref: "core/memory.md",
      runtime_contract_ref: "docs/RUNTIME_CONTRACT.md"
    },
    task_context: {
      accepted_goal: acceptedGoal,
      budget: opportunity.budget_hint,
      stop_signal_active: Boolean(stopSignal),
      stop_signal_ref: stopSignal ? "autonomy/runs/pause_signal.json" : null,
      stop_signal: stopSignal
    },
    overlay_context: {
      project_overlay_refs: [],
      host_instruction_refs: []
    },
    recall_context: {
      resident_index_ref: "memory/index.md",
      memory_index_ref: "memory/index/episodes.sqlite",
      memory_refs: (selection.memory_hits ?? []).map((hit) => hit.id),
      memory_hits: selection.memory_hits ?? [],
      sop_refs: [],
      skill_refs: selection.skill_refs ?? [],
      skill_hits: selection.skill_hits ?? []
    },
    working_context: {
      checkpoint: workingCheckpoint?.checkpoint.current_step ?? "New live run; no previous checkpoint selected.",
      checkpoint_ref: workingCheckpoint?.ref ?? null,
      checkpoint_record: workingCheckpoint?.checkpoint ?? null,
      open_constraints: workingCheckpoint?.checkpoint.known_constraints ?? [],
      discipline: selection.discipline ?? null
    },
    available_actions: allowedActions
  });
}

export async function renderContextBundle(
  store: AgentStore,
  snapshot: TurnSnapshot,
  options: ContextRenderOptions = {}
): Promise<string> {
  return (await renderContextBundleWithManifest(store, snapshot, options)).markdown;
}

export async function renderContextBundleWithManifest(
  store: AgentStore,
  snapshot: TurnSnapshot,
  options: ContextRenderOptions = {}
): Promise<RenderedContextBundle> {
  const sections = await buildContextSections(store, snapshot, options);
  const markdown = sections.map((section) => `## ${section.title}\n\n${section.body}`).join("\n\n");
  const archiveSection = sections.find((section) => section.title === "Episode Archives");
  const opportunitySection = sections.find((section) => section.title === "Opportunity Backlog");
  const contextBudget = contextBudgetFromOptions(options);
  return {
    markdown,
    manifest: {
      version: 1,
      created_at: utcNow(),
      session_id: snapshot.session_id,
      turn_id: snapshot.id,
      total_chars: markdown.length,
      section_count: sections.length,
      sections: sections.map((section) => ({
        title: section.title,
        chars: section.body.length,
        refs: unique(section.refs),
        item_count: section.item_count ?? 0
      })),
      recall: {
        memory_hit_count: getRecordArray(snapshot.recall_context.memory_hits).length,
        memory_refs: getStringArray(snapshot.recall_context.memory_refs),
        skill_ref_count: getStringArray(snapshot.recall_context.skill_refs).length,
        skill_refs: getStringArray(snapshot.recall_context.skill_refs),
        archive_ref_count: archiveSection?.item_count ?? 0,
        archive_refs: archiveSection?.refs ?? [],
        opportunity_ref_count: opportunitySection?.item_count ?? 0,
        opportunity_refs: opportunitySection?.refs ?? [],
        discipline_active: isQueryTodoDiscipline(snapshot.working_context.discipline)
      },
      context_budget: contextBudget
    }
  };
}

async function buildContextSections(
  store: AgentStore,
  snapshot: TurnSnapshot,
  options: ContextRenderOptions
): Promise<ContextSection[]> {
  const skillRefs = getStringArray(snapshot.recall_context.skill_refs);
  const taskReferences = await taskReferencesSection(store, snapshot);
  const harnessReplayAudits = await harnessReplayAuditSection(store);
  const attentionPlan = await attentionPlanSection(store, snapshot, options);
  const gaPlan = await gaProjectDesignPlanSection(store);
  return [
    {
      title: "Stable Core",
      body: await stableCore(store),
      refs: ["core/soul.md", "core/memory.md", "docs/RUNTIME_CONTRACT.md"],
      item_count: 3
    },
    {
      title: "Resident Index",
      body: refBlock("memory/index.md", await store.readRepoText("memory/index.md", 1400)),
      refs: ["memory/index.md"],
      item_count: 1
    },
    await serviceRuntimeSection(store),
    await workspaceStatusSection(store),
    runtimeConfigSection(options.runtimeConfig),
    ...(attentionPlan ? [attentionPlan] : []),
    capabilityCatalogSection(),
    await semanticMemorySection(store),
    await dreamSection(store),
    await selfEvolutionScorecardSection(store, options.vaultRoot),
    ...(gaPlan ? [gaPlan] : []),
    ...(await selfEvolutionIterationSection(store)),
    ...(taskReferences ? [taskReferences] : []),
    await opportunityBacklogSection(store, options.vaultRoot),
    await backgroundReviewHistorySection(store),
    await reviewTickHistorySection(store),
    await pipelineHistorySection(store),
    await liveRunTraceSection(store),
    ...((harnessReplayAudits.item_count ?? 0) > 0 ? [harnessReplayAudits] : []),
    await governanceQueueSection(store, options.vaultRoot),
    await governanceOutcomesSection(store),
    await sopEvolutionLedgerSection(store, options.vaultRoot),
    {
      title: "Turn Snapshot",
      body: JSON.stringify(snapshot, null, 2),
      refs: [],
      item_count: 1
    },
    workingCheckpointSection(snapshot),
    await completionVerificationSection(store),
    {
      title: "Query/Todo Discipline",
      body: await queryTodoDiscipline(store, snapshot),
      refs: disciplineRefs(snapshot),
      item_count: isQueryTodoDiscipline(snapshot.working_context.discipline) ? 2 : 0
    },
    {
      title: "Episode Recall",
      body: episodeRecall(snapshot),
      refs: episodeRecallRefs(snapshot),
      item_count: getRecordArray(snapshot.recall_context.memory_hits).length
    },
    await episodeArchiveSection(store),
    {
      title: "Selected Skills",
      body: await selectedSkills(store, snapshot),
      refs: skillRefs,
      item_count: skillRefs.length
    },
    {
      title: "Output Contract",
      body: outputContract(),
      refs: ["packages/core/src/tool_contracts.ts"],
      item_count: allowedActions.length
    }
  ];
}

async function serviceRuntimeSection(store: AgentStore): Promise<ContextSection> {
  const health = await getServiceHealth(store);
  const runtimeBuild = health.im.runtime_build ?? null;
  const deployment = health.im.deployment;
  const sourceCommit = runtimeBuild?.source_commit;
  const sourceCommitShort = runtimeBuild?.source_commit_short ?? sourceCommit?.slice(0, 12);
  if (health.refs.length === 0) {
    return {
      title: "Service Runtime",
      body: "No resident IM service runtime state selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  const reviewTickAutoActionItem = health.review_tick.last_auto_action_opportunity_kind && health.review_tick.last_auto_action_opportunity_id
    ? `${health.review_tick.last_auto_action_opportunity_kind}:${health.review_tick.last_auto_action_opportunity_id}`
    : "none";
  const reviewTickAutoActionParts = [
    health.review_tick.last_auto_action_status ?? "unknown",
    `item=${reviewTickAutoActionItem}`,
    `result=${health.review_tick.last_auto_action_result_ref ?? "none"}`
  ];
  if (health.review_tick.last_auto_action_summary) {
    reviewTickAutoActionParts.push(`summary=${truncate(health.review_tick.last_auto_action_summary, 120)}`);
  }
  const reviewTickFocusCurrentParts = [
    health.review_tick.last_focus_current_status ?? "unknown"
  ];
  if (health.review_tick.last_focus_current_backlog_status) {
    reviewTickFocusCurrentParts.push(`backlog=${health.review_tick.last_focus_current_backlog_status}`);
  }
  const reviewTickNext = health.review_tick.next_wake_at
    ? ` next=${health.review_tick.next_wake_at}`
    : "";
  const reviewTickInboxParts = [];
  if (
    typeof health.review_tick.last_active_inbox_count === "number"
    && typeof health.review_tick.last_inactive_tick_inbox_count === "number"
  ) {
    reviewTickInboxParts.push(`inbox=${health.review_tick.last_active_inbox_count}/${health.review_tick.last_inactive_tick_inbox_count}`);
  } else if (typeof health.review_tick.last_active_inbox_count === "number") {
    reviewTickInboxParts.push(`inbox=${health.review_tick.last_active_inbox_count}`);
  } else if (typeof health.review_tick.last_inactive_tick_inbox_count === "number") {
    reviewTickInboxParts.push(`inactive=${health.review_tick.last_inactive_tick_inbox_count}`);
  }
  if (health.review_tick.last_inactive_tick_inbox_reasons) {
    reviewTickInboxParts.push(`why=${renderCompactReviewTickReasonCounts(health.review_tick.last_inactive_tick_inbox_reasons)}`);
  }
  const reviewTickInbox = reviewTickInboxParts.length > 0 ? ` ${reviewTickInboxParts.join(" ")}` : "";
  const feedbackRefreshSkip = health.content_feedback_refresh.last_top_skip_reason
    ? ` skip=${health.content_feedback_refresh.last_top_skip_reason}:${health.content_feedback_refresh.last_skipped_count ?? "unknown"}`
    : "";
  const lines = [
    "Read-only service runtime health.",
    `- service_health: ${health.status}`,
    `- im_state: ${health.im.state}`,
    `- pid: ${health.im.pid ?? "unknown"}`,
    `- channel: ${health.im.channel_id ?? "unknown"}`,
    `- scenario: ${health.im.scenario_id ?? "unknown"}`,
    `- heartbeat_freshness: ${health.im.heartbeat_freshness}`,
    `- heartbeat_age_ms: ${health.im.heartbeat_age_ms ?? "unknown"}`,
    `- heartbeat_updated_at: ${health.im.heartbeat_updated_at ?? "unknown"}`,
    `- deployment_status: ${deployment.status}`,
    `- deployment_reason: ${deployment.reason}`,
    `- repo_commit: ${deployment.repo_commit_short ?? "unknown"}`,
    `- repo_branch: ${deployment.repo_branch ?? "unknown"}`,
    `- review_tick: ${health.review_tick.state}${reviewTickNext}${reviewTickInbox}`,
    `- review_tick_focus: ${reviewTickFocusCurrentParts.join(" ")}`,
    `- review_tick_auto: ${reviewTickAutoActionParts.join(" ")}`,
    `- content_daily: ${health.content_daily.state} enabled=${health.content_daily.enabled} last=${health.content_daily.last_job_status ?? "unknown"} effective=${health.content_daily.last_effective_job_status ?? "unknown"} count=${health.content_daily.last_job_count ?? "unknown"} strategy=${health.content_daily.last_applied_strategy_count ?? "unknown"} blocked=${health.content_daily.last_blocked_strategy_count ?? "unknown"}`,
    `- feedback_refresh: ${health.content_feedback_refresh.state} enabled=${health.content_feedback_refresh.enabled} queue=${health.content_feedback_refresh.last_queue_count ?? "unknown"} due=${health.content_feedback_refresh.last_due_count ?? "unknown"} next=${health.content_feedback_refresh.next_due_at ?? "none"}${feedbackRefreshSkip}`,
    `- feedback_strategy: suggestions=${health.content_feedback_refresh.last_strategy_suggestion_count ?? "unknown"} high=${health.content_feedback_refresh.last_strategy_high_priority_count ?? "unknown"} top=${health.content_feedback_refresh.last_strategy_top_posture ?? "unknown"} title=${health.content_feedback_refresh.last_strategy_top_title ?? "unknown"}`,
    `- autonomy_pause_active: ${health.autonomy_pause.active}`
  ];
  if (serviceLoopHasState(health.content_creator_metrics)) {
    lines.push(`- creator_metrics: ${health.content_creator_metrics.state} enabled=${health.content_creator_metrics.enabled} queue=${health.content_creator_metrics.last_queue_count ?? "unknown"} captured=${health.content_creator_metrics.last_captured_count ?? "unknown"} blocked=${health.content_creator_metrics.last_blocked_count ?? "unknown"} failed=${health.content_creator_metrics.last_failed_count ?? "unknown"}`);
  }
  if (health.content_daily.last_skip_reason) lines.push(`- content_daily_last_skip_reason: ${health.content_daily.last_skip_reason}`);
  if (health.content_daily.current_step) {
    lines.push(`- content_daily_current_step: ${health.content_daily.current_step}`);
    lines.push(`- content_daily_current_step_status: ${health.content_daily.current_step_status ?? "unknown"}`);
    lines.push(`- content_daily_current_track: ${health.content_daily.current_track_id ?? "default"} ${health.content_daily.current_track_index ?? "?"}/${health.content_daily.current_track_count ?? "?"}`);
    lines.push(`- content_daily_current_step_age_ms: ${health.content_daily.current_step_age_ms ?? "unknown"}`);
    lines.push(`- content_daily_current_step_freshness: ${health.content_daily.current_step_freshness ?? "unknown"}`);
  }
  if (health.autonomy_pause.reason) lines.push(`- autonomy_pause_reason: ${truncate(health.autonomy_pause.reason, 220)}`);
  if (runtimeBuild) {
    lines.push(`- runtime_commit: ${sourceCommitShort ?? "unknown"}`);
    lines.push(`- runtime_branch: ${runtimeBuild.source_branch ?? "unknown"}`);
    lines.push(`- runtime_dirty: ${stringifyOptionalBoolean(runtimeBuild.source_is_dirty ?? null)}`);
    lines.push(`- runtime_built_at: ${runtimeBuild.built_at ?? "unknown"}`);
  } else {
    lines.push("- runtime_build: unknown");
  }
  if (deployment.status === "stale") lines.push(`- restart_command: ${deployment.restart_command}`);
  return {
    title: "Service Runtime",
    body: lines.join("\n"),
    refs: health.refs,
    item_count: health.refs.length
  };
}

async function workspaceStatusSection(store: AgentStore): Promise<ContextSection> {
  const status = await getWorkspaceStatus(store, { limit: 8 });
  const lines = [
    "Read-only fixed workspace diagnostic. pre-write orientation only; it cannot authorize git mutation or prove resident runtime deployment.",
    `- workspace_status: ${status.status}`,
    `- branch: ${status.branch ?? "unknown"}`,
    `- upstream: ${status.upstream ?? "none"}`,
    `- ahead: ${status.ahead ?? 0}`,
    `- behind: ${status.behind ?? 0}`,
    `- changed_files: ${status.changed_file_count}`,
    `- staged: ${status.staged_count}`,
    `- unstaged: ${status.unstaged_count}`,
    `- untracked: ${status.untracked_count}`,
    `- conflicts: ${status.conflict_count}`,
    `- truncated: ${status.truncated}`,
    `- command: ${status.command}`,
    "- boundary: fixed git status only; no file bodies, git mutation, state/repo/vault writes, model calls, or deployment proof"
  ];
  if (status.status === "not_git_repo") lines.push("- diagnostic: repo root is not a git worktree");
  else if (status.error) lines.push(`- error: ${truncate(status.error, 160)}`);
  if (status.status === "error" && status.stderr) lines.push(`- stderr: ${truncate(status.stderr.trim(), 160)}`);
  if (status.changes.length > 0) {
    lines.push("- changes:");
    for (const change of status.changes) lines.push(`  - ${renderWorkspaceChange(change)}`);
  }
  return {
    title: "Workspace Status",
    body: lines.join("\n"),
    refs: unique([
      "packages/core/src/workspace_status.ts",
      ...status.changes.map((change) => change.path)
    ]),
    item_count: status.changed_file_count
  };
}

function serviceLoopHasState(loop: { state: string; enabled: boolean }): boolean {
  return loop.enabled || loop.state !== "unknown";
}

function renderWorkspaceChange(change: WorkspaceChangeSummary): string {
  return [
    `${change.status_code} ${truncate(change.path, 220)}`,
    change.original_path ? ` (from ${truncate(change.original_path, 180)})` : "",
    ` [${change.category}]`
  ].join("");
}

function runtimeConfigSection(summary: ContextRuntimeConfigSummary | undefined): ContextSection {
  if (!summary) {
    return {
      title: "Runtime Config",
      body: "No runtime config summary selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  const lines = [
    "Read-only effective runtime config. Use this for orientation before changing self-evolution settings; do not read auth, mutate config, restart services, run review tick, or treat selectors as secrets.",
    `- active_model: ${summary.active_model.id ?? "none"}`,
    ...(summary.active_model.model ? [`- model: ${summary.active_model.model}`] : []),
    ...(summary.active_model.api ? [`- model_api: ${summary.active_model.api}`] : []),
    ...(summary.active_model.provider ? [`- model_provider: ${summary.active_model.provider}`] : []),
    ...(summary.active_model.base_url ? [`- model_base_url: ${summary.active_model.base_url}`] : []),
    ...(summary.active_model.auth_id ? [`- model_auth_id: ${summary.active_model.auth_id}`] : []),
    ...(summary.active_model.context_window_tokens ? [`- model_context_window_tokens: ${summary.active_model.context_window_tokens}`] : []),
    ...(summary.active_model.max_output_tokens ? [`- model_max_output_tokens: ${summary.active_model.max_output_tokens}`] : []),
    ...(summary.active_model.context_budget
      ? [
        `- model_input_budget_tokens: ${summary.active_model.context_budget.estimated_input_budget_tokens}`,
        `- context_soft_limit_chars: ${summary.active_model.context_budget.total_soft_limit_chars}`,
        `- context_hard_limit_chars: ${summary.active_model.context_budget.total_hard_limit_chars}`
      ]
      : []),
    `- active_channel: ${summary.active_channel.id ?? "none"}`,
    ...(summary.active_channel.kind ? [`- channel_kind: ${summary.active_channel.kind}`] : []),
    ...(summary.active_channel.transport ? [`- channel_transport: ${summary.active_channel.transport}`] : []),
    ...(summary.active_channel.mode ? [`- channel_mode: ${summary.active_channel.mode}`] : []),
    ...(summary.active_channel.auth_id ? [`- channel_auth_id: ${summary.active_channel.auth_id}`] : []),
    ...(summary.active_channel.followup_queue_size ? [`- channel_followup_queue_size: ${summary.active_channel.followup_queue_size}`] : []),
    `- active_scenario: ${summary.active_scenario.id ?? "none"}`,
    ...(summary.active_scenario.model_id ? [`- scenario_model_id: ${summary.active_scenario.model_id}`] : []),
    ...(summary.active_scenario.discipline ? [`- scenario_discipline: ${summary.active_scenario.discipline}`] : []),
    ...(summary.active_scenario.concurrency ? [`- scenario_concurrency: ${summary.active_scenario.concurrency}`] : []),
    `- promotion_enabled: ${summary.runtime.promotion_enabled}`,
    `- structured_output: ${summary.runtime.structured_output}`,
    `- review_tick_enabled: ${summary.runtime.review_tick_enabled}`,
    `- review_tick_interval_ms: ${summary.runtime.review_tick_interval_ms}`,
    `- review_tick_limit: ${summary.runtime.review_tick_limit}`,
    `- content_daily_enabled: ${summary.runtime.content_daily_enabled}`,
    `- content_daily_interval_ms: ${summary.runtime.content_daily_interval_ms}`,
    `- content_daily_dry_run: ${summary.runtime.content_daily_dry_run}`,
    `- content_daily_preflight: ${summary.runtime.content_daily_preflight}`,
    `- content_daily_topic: ${summary.runtime.content_daily_topic}`,
    `- content_daily_source_urls: ${summary.runtime.content_daily_source_urls.join(",") || "none"}`,
    `- content_daily_tickers: ${summary.runtime.content_daily_tickers.join(",") || "none"}`,
    ...(summary.runtime.content_daily_image_model ? [`- content_daily_image_model: ${summary.runtime.content_daily_image_model}`] : []),
    `- content_daily_publish_enabled: ${summary.runtime.content_daily_publish_enabled}`,
    `- content_daily_external_write_confirmed: ${summary.runtime.content_daily_external_write_confirmed}`,
    `- content_daily_publish_adapter: ${summary.runtime.content_daily_publish_adapter}`,
    `- content_daily_publish_server_url: ${summary.runtime.content_daily_publish_server_url}`,
    `- content_daily_publish_tool: ${summary.runtime.content_daily_publish_tool}`,
    `- content_feedback_refresh_enabled: ${summary.runtime.content_feedback_refresh_enabled}`,
    `- content_feedback_refresh_interval_ms: ${summary.runtime.content_feedback_refresh_interval_ms}`,
    `- content_feedback_refresh_limit: ${summary.runtime.content_feedback_refresh_limit}`,
    `- content_feedback_refresh_min_follow_up_age_ms: ${summary.runtime.content_feedback_refresh_min_follow_up_age_ms}`,
    `- content_feedback_refresh_server_url: ${summary.runtime.content_feedback_refresh_server_url}`,
    `- content_creator_metrics: enabled=${summary.runtime.content_creator_metrics_enabled} interval_ms=${summary.runtime.content_creator_metrics_interval_ms} limit=${summary.runtime.content_creator_metrics_limit} session=${summary.runtime.content_creator_metrics_browser_session_name} auto_connect=${summary.runtime.content_creator_metrics_browser_auto_connect}${summary.runtime.content_creator_metrics_browser_cdp_port ? ` cdp=${summary.runtime.content_creator_metrics_browser_cdp_port}` : ""}`,
    `- content_creator_metrics_creator_url: ${summary.runtime.content_creator_metrics_creator_url}`,
    `- runtime_source: ${summary.runtime.source_ref}`,
    `- runtime_defaulted_fields: ${summary.runtime.defaulted_fields.length > 0 ? summary.runtime.defaulted_fields.join(",") : "none"}`,
    `- vault_mode: ${summary.vault.mode}`,
    `- vault_active_root: ${summary.vault.active_root}`,
    `- vault_seed_roots: ${summary.vault.seed_roots.join(",") || "none"}`,
    `- restart_guidance: ${truncate(summary.restart_guidance, 240)}`,
    `- boundary: ${summary.boundary}`
  ];
  return {
    title: "Runtime Config",
    body: lines.join("\n"),
    refs: summary.refs,
    item_count: summary.refs.length
  };
}

async function attentionPlanSection(
  store: AgentStore,
  snapshot: TurnSnapshot,
  options: ContextRenderOptions
): Promise<ContextSection | null> {
  const contextBudget = contextBudgetFromOptions(options);
  const pressureResult = await listContextPressure(store, {
    limit: 1,
    contextBudget
  });
  const pressure = pressureResult.pressures[0] ?? null;
  const working = snapshot.working_context;
  const checkpoint = isRecord(working.checkpoint_record) ? working.checkpoint_record : null;
  const workingCheckpointRef = getString(working.checkpoint_ref);
  const workingCheckpointText = getString(working.checkpoint) ?? "none";
  const acceptedGoal = getString((snapshot.task_context as Record<string, unknown>).accepted_goal) ?? "";
  const stopSignalActive = Boolean((snapshot.task_context as Record<string, unknown>).stop_signal_active);
  const memoryHits = getRecordArray(snapshot.recall_context.memory_hits).length;
  const selectedSkills = getStringArray(snapshot.recall_context.skill_refs).length;
  const disciplineActive = isQueryTodoDiscipline(snapshot.working_context.discipline);
  if (!pressure && !checkpoint && !contextBudget) return null;
  const focusOrder = attentionFocusOrder({
    pressure,
    checkpoint,
    selectedSkills,
    disciplineActive
  });
  const lines = [
    "Read-only attention plan; no compaction, raw artifact reads, tool calls, or mutation.",
    `- goal: ${truncate(acceptedGoal, 180)}`,
    `- stop_signal_active: ${stopSignalActive}`,
    `- selected: memory=${memoryHits} skills=${selectedSkills} discipline=${disciplineActive}`,
    `- focus_order: ${focusOrder.join(" -> ")}`
  ];
  if (contextBudget) {
    lines.push(`- budget: input_tokens=${contextBudget.estimated_input_budget_tokens} soft_chars=${contextBudget.total_soft_limit_chars} hard_chars=${contextBudget.total_hard_limit_chars}`);
    if (contextBudget.warning) lines.push(`- context_budget_warning: ${contextBudget.warning}`);
  }
  if (pressure) {
    lines.push(`- prior_context_pressure: ${pressure.status}`);
    lines.push(`- prior_context: session=${pressure.session_id} manifest=${pressure.ref} chars=${pressure.total_chars}`);
    lines.push(`- prior_context_largest_section: ${pressure.largest_section.title}`);
    lines.push(`- prior_context_largest: chars=${pressure.largest_section.chars} share=${pressure.largest_section.share}`);
    lines.push(`- prior_context_pressure_sections: ${pressure.pressure_sections.map((section) => section.title).join(", ") || "none"}`);
    lines.push(`- prior_context_mitigation: ${pressure.operator_guidance.mitigation_kind}`);
    lines.push(`- prior_context_inspect: ${pressure.operator_guidance.inspect_command}`);
    lines.push(`- attention_hint: ${attentionHintForPressure(pressure)}`);
  } else {
    lines.push("- prior_context_pressure: none");
  }
  if (checkpoint) {
    lines.push(`- working_checkpoint: ref=${workingCheckpointRef ?? "none"} step=${truncate(getString(checkpoint.current_step) ?? workingCheckpointText, 160)}`);
    lines.push(`- working_next: ${truncate(getString(checkpoint.next_action) ?? "none", 180)} questions=${getStringArray(checkpoint.open_questions).length} evidence=${getStringArray(checkpoint.recent_evidence_refs).length}`);
  }

  return {
    title: "Attention Plan",
    body: lines.join("\n"),
    refs: unique([
      "packages/core/src/context.ts",
      "packages/core/src/context_pressure.ts",
      ...(pressure ? [pressure.ref] : []),
      ...(workingCheckpointRef ? [workingCheckpointRef] : []),
      ...(options.runtimeConfig?.active_model.source_ref ? [options.runtimeConfig.active_model.source_ref] : [])
    ]),
    item_count: [
      acceptedGoal ? "goal" : "",
      pressure ? "context_pressure" : "",
      checkpoint ? "working_checkpoint" : "",
      contextBudget ? "context_budget" : "",
      selectedSkills > 0 ? "selected_skills" : "",
      memoryHits > 0 ? "episode_recall" : "",
      disciplineActive ? "discipline" : ""
    ].filter(Boolean).length
  };
}

function contextBudgetFromOptions(options: ContextRenderOptions): ContextBudgetSummary | null {
  return options.runtimeConfig?.active_model.context_budget ?? deriveContextBudget({
    model_id: options.runtimeConfig?.active_model.id ?? null,
    model: options.runtimeConfig?.active_model.model,
    source_ref: options.runtimeConfig?.active_model.source_ref,
    context_window_tokens: options.runtimeConfig?.active_model.context_window_tokens,
    max_output_tokens: options.runtimeConfig?.active_model.max_output_tokens
  });
}

function attentionFocusOrder(args: {
  pressure: ContextPressureSummary | null;
  checkpoint: Record<string, unknown> | null;
  selectedSkills: number;
  disciplineActive: boolean;
}): string[] {
  const focus = ["accepted_goal"];
  if (args.disciplineActive) focus.push("query_todo");
  if (args.checkpoint) focus.push("working_checkpoint");
  if (args.pressure?.status === "over_budget") focus.push("context_pressure");
  if (args.selectedSkills > 0) focus.push("selected_skill_metadata");
  if (args.pressure?.status === "watch") focus.push("context_pressure_watch");
  focus.push("allowed_actions");
  return focus;
}

function attentionHintForPressure(pressure: ContextPressureSummary): string {
  if (pressure.operator_guidance.mitigation_kind === "reduce_episode_recall") {
    return "Previous context pressure came from recall; prefer the current goal, checkpoint, archive summaries, and cited refs before adding more episode recall.";
  }
  if (pressure.operator_guidance.mitigation_kind === "narrow_selected_skills") {
    return "Previous context pressure came from selected skills; use selected-skill metadata first and avoid broad skill-body dependence unless the task directly needs it.";
  }
  return "Previous context pressure was section-balanced; inspect the manifest metadata before changing context assembly or adding broad sections.";
}

function capabilityCatalogSection(): ContextSection {
  const catalog = getCapabilityCatalog();
  return {
    title: "Capability Catalog",
    body: [
      "do not infer extra authority; /capabilities for detail.",
      `- count: ${catalog.count}; local-only read model`,
      "",
      ...catalog.categories.map(renderCapabilityCatalogCategory)
    ].join("\n"),
    refs: catalog.refs,
    item_count: catalog.count
  };
}

function renderCapabilityCatalogCategory(category: CapabilityCategory): string {
  return `- ${category.title}: ${capabilityCatalogSample(category).join(",")}`;
}

function renderCapabilityId(capability: CapabilitySummary): string {
  return capability.id;
}

function capabilityCatalogSample(category: CapabilityCategory): string[] {
  if (category.id === "core_tools") return category.capabilities.slice(0, 4).map(renderCapabilityId);
  if (category.id === "memory_and_learning") {
    return category.capabilities
      .filter((capability) => ["semantic.memory", "dream.snapshots", "sop.evolution", "self_evolution.scorecard"].includes(capability.id))
      .map(renderCapabilityId);
  }
  if (category.id === "context_read_models") {
    return category.capabilities
      .filter((capability) => ["context.manifests", "context.health", "review.history", "expert.orchestration_contract"].includes(capability.id))
      .map(renderCapabilityId);
  }
  if (category.id === "runtime_service") {
    return category.capabilities
      .filter((capability) => ["service.lifecycle", "service.health", "workspace.status"].includes(capability.id))
      .map(renderCapabilityId);
  }
  return category.capabilities.slice(0, 4).map(renderCapabilityId);
}

async function taskReferencesSection(store: AgentStore, snapshot: TurnSnapshot): Promise<ContextSection | null> {
  const acceptedGoal = getString((snapshot.task_context as Record<string, unknown>).accepted_goal);
  if (!acceptedGoal) return null;
  const rendered = await renderTaskContextReferences(store, acceptedGoal);
  if (!rendered) return null;
  return {
    title: "Task References",
    body: rendered.markdown,
    refs: rendered.refs,
    item_count: rendered.item_count
  };
}

async function pipelineHistorySection(store: AgentStore): Promise<ContextSection> {
  const result = await listPipelineRuns(store, { limit: 3 });
  if (result.runs.length === 0) {
    return {
      title: "Pipeline History",
      body: "No recent pipeline history selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  return {
    title: "Pipeline History",
    body: [
      "Read-only StageRunner pipeline history. Use this to understand recent staged harness work; do not rerun pipeline, invoke the model, or read raw stage artifacts from context alone.",
      `- selected_runs: ${result.runs.length}`,
      "",
      ...result.runs.map(renderPipelineHistoryItem)
    ].join("\n"),
    refs: unique(result.runs.flatMap((run) => [
      run.pipeline_ref,
      run.checkpoint_ref,
      ...run.stage_run_refs,
      ...(run.final_response_ref ? [run.final_response_ref] : []),
      ...(run.query_ref ? [run.query_ref] : []),
      ...(run.todo_ref ? [run.todo_ref] : [])
    ])),
    item_count: result.runs.length
  };
}

function renderPipelineHistoryItem(run: PipelineHistorySummary, index: number): string {
  const lines = [
    `### ${index + 1}. ${run.run_id}`,
    `- status: ${run.status}`,
    `- verdict: ${run.verdict}`,
    `- task: ${truncate(run.task, 220)}`,
    `- pipeline_ref: ${run.pipeline_ref}`,
    `- checkpoint_ref: ${run.checkpoint_ref}`,
    `- stages: ${run.stage_count} (${renderCountMap(run.stage_status_counts)})`,
    `- evidence_refs: ${run.evidence_ref_count}`,
    `- updated_at: ${run.updated_at}`
  ];
  if (run.blocked_stage_id) lines.push(`- blocked_stage_id: ${run.blocked_stage_id}`);
  if (run.failed_stage_ids.length > 0) lines.push(`- failed_stages: ${run.failed_stage_ids.join(", ")}`);
  if (run.query_ref) lines.push(`- query_ref: ${run.query_ref}`);
  if (run.todo_ref) lines.push(`- todo_ref: ${run.todo_ref}`);
  if (run.final_response_ref) lines.push(`- final_response_ref: ${run.final_response_ref}`);
  return lines.join("\n");
}

async function liveRunTraceSection(store: AgentStore): Promise<ContextSection> {
  const result = await listLiveRunTraces(store, { limit: 3 });
  if (result.traces.length === 0) {
    return {
      title: "Live Run Trace",
      body: "No recent live run trace selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  return {
    title: "Live Run Trace",
    body: [
      "Read-only recent live harness trace. Use this to understand prior run shape and evidence refs; do not read raw model responses, tool bodies, final responses, or rerun actions from context alone.",
      `- selected_runs: ${result.traces.length}`,
      "",
      ...result.traces.map(renderLiveRunTraceItem)
    ].join("\n"),
    refs: unique(result.traces.flatMap((trace) => trace.refs)),
    item_count: result.traces.length
  };
}

function renderLiveRunTraceItem(trace: LiveRunTraceSummary, index: number): string {
  const lines = [
    `### ${index + 1}. ${trace.session_id}`,
    `- report_ref: ${trace.report_ref}`,
    `- created_at: ${trace.created_at}`,
    `- completion_status: ${trace.completion_status}`,
    `- verification_status: ${trace.verification_status}`,
    `- verified: ${trace.verified}`,
    `- summary: ${truncate(trace.summary, 360)}`,
    `- context_ref: ${trace.context_ref ?? "none"}`,
    `- context_manifest_ref: ${trace.context_manifest_ref ?? "none"}`,
    `- final_response_ref: ${trace.final_response_ref ?? "none"}`,
    `- events: ${trace.event_count} (${renderCountMap(trace.event_kind_counts)})`,
    `- observations: ${trace.observation_ref_count}`,
    `- tool_results: ${trace.tool_result_count}`,
    `- delegated_results: ${trace.delegated_result_count}`,
    `- delegated_results_passed: ${trace.delegated_result_passed_count}`,
    `- delegated_results_failed: ${trace.delegated_result_failed_count}`,
    `- harness_state_actions: ${trace.harness_action_count}`,
    `- model_diagnostics: ${trace.model_diagnostic_count}`,
    `- repo_write_guards: ${trace.repo_write_guard_count}`,
    `- boundary: ${trace.boundary}`
  ];
  for (const diagnostic of trace.model_diagnostics.slice(0, 3)) {
    lines.push(`- model_diagnostic: round=${diagnostic.round} stage=${diagnostic.stage} kind=${diagnostic.failure_kind} ref=${diagnostic.diagnostic_ref}`);
    if (diagnostic.response_ref) lines.push(`  response_ref: ${diagnostic.response_ref}`);
    if (diagnostic.error_preview) lines.push(`  error_preview: ${truncate(diagnostic.error_preview, 220)}`);
  }
  for (const guard of trace.repo_write_guards.slice(0, 3)) {
    lines.push(`- repo_write_guard: ${truncate(guard.path, 180)} before=${guard.before_status} after=${guard.after_status} changed_files=${guard.before_changed_file_count}->${guard.after_changed_file_count} delta=${guard.changed_file_count_delta} preexisting_dirty=${guard.preexisting_dirty} target_changed=${guard.target_changed_after_write}`);
  }
  for (const round of trace.rounds.slice(0, 3)) {
    lines.push(`- round_${round.round}: ${round.envelope_ref}`);
    lines.push(`  action_counts: ${renderCountMap(round.action_counts)}`);
    lines.push(`  completion_status: ${round.completion_status}`);
    lines.push(`  summary: ${truncate(round.summary, 220)}`);
    if (round.harness_action_types.length > 0) {
      lines.push(`  harness_action_types: ${round.harness_action_types.join(", ")}`);
    }
  }
  return lines.join("\n");
}

async function harnessReplayAuditSection(store: AgentStore): Promise<ContextSection> {
  const result = await listHarnessReplayAudits(store, { limit: 3 });
  if (result.replays.length === 0) {
    return {
      title: "Harness Replay Audits",
      body: "No harness replay audits selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  return {
    title: "Harness Replay Audits",
    body: [
      "Read-only harness replay audit history. Use this to understand which prior live runs were replay-audited from bounded metadata; do not rerun traces, invoke the model, execute tools, or read raw artifacts from context alone.",
      `- selected_replays: ${result.replays.length}`,
      "",
      ...result.replays.map(renderHarnessReplayAuditItem)
    ].join("\n"),
    refs: unique(result.replays.flatMap((replay) => [
      replay.artifact_refs.json_ref,
      replay.trace_ref,
      ...replay.refs
    ])),
    item_count: result.replays.length
  };
}

function renderHarnessReplayAuditItem(replay: HarnessReplayAuditReport, index: number): string {
  const lines = [
    `### ${index + 1}. ${replay.id}`,
    `- status: ${replay.status}`,
    `- created_at: ${replay.created_at}`,
    `- trace_ref: ${replay.trace_ref}`,
    `- completion_id: ${replay.completion_id}`,
    `- session_id: ${replay.session_id}`,
    `- replay_result: ${replay.replay_result}`,
    `- summary: ${truncate(replay.summary, 300)}`,
    `- metrics: rounds=${replay.metrics.rounds}, events=${replay.metrics.events}, tool_results=${replay.metrics.tool_results}, delegated_failed=${replay.metrics.delegated_results_failed}, repo_write_guards=${replay.metrics.repo_write_guards}`,
    `- report_ref: ${replay.artifact_refs.json_ref}`,
    `- boundary: ${replay.boundary}`
  ];
  for (const check of replay.checks.slice(0, 5)) {
    lines.push(`- replay_check: ${check.id}=${check.status}`);
    lines.push(`  summary: ${truncate(check.summary, 220)}`);
  }
  return lines.join("\n");
}

async function backgroundReviewHistorySection(store: AgentStore): Promise<ContextSection> {
  const result = await listBackgroundReviews(store, { limit: 3 });
  if (result.reviews.length === 0) {
    return {
      title: "Background Review History",
      body: "No recent background review history selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  return {
    title: "Background Review History",
    body: [
      "Read-only background review history. Use this to understand recent review reports and proposal summaries; do not run review, request confirmations, or execute follow-ups from context alone.",
      `- selected_reviews: ${result.reviews.length}`,
      "",
      ...result.reviews.map(renderBackgroundReviewHistoryItem)
    ].join("\n"),
    refs: result.review_refs,
    item_count: result.reviews.length
  };
}

function renderBackgroundReviewHistoryItem(review: BackgroundReviewHistorySummary, index: number): string {
  const lines = [
    `### ${index + 1}. ${review.id}`,
    `- created_at: ${review.created_at}`,
    `- mode: ${review.mode}`,
    `- query: ${review.query ?? "n/a"}`,
    `- session_id: ${review.session_id ?? "n/a"}`,
    `- review_ref: ${review.review_ref}`,
    `- events_reviewed: ${review.events_reviewed}`,
    `- sessions_seen: ${review.sessions_seen}`,
    `- failure_signals: ${review.failure_signal_count}`,
    `- sop_signals: ${review.sop_signal_count}`,
    `- proposals: ${review.proposal_count}`,
    `- proposal_types: ${renderCountMap(review.proposal_types)}`,
    `- chain_summaries: ${review.chain_summary_count}`
  ];
  if (review.working_checkpoint_ref) lines.push(`- working_checkpoint: ${review.working_checkpoint_ref}`);
  for (const proposal of review.proposal_summaries.slice(0, 3)) {
    lines.push(`- proposal: ${proposal.type}/${proposal.id} - ${truncate(proposal.title, 180)}`);
    lines.push(`  next_action: ${truncate(proposal.next_action, 240)}`);
    if (proposal.focus_action_chain && proposal.focus_action_chain.length > 0) {
      lines.push(`  chain: ${renderActionChainSummary(proposal.focus_action_chain)}`);
    }
    lines.push(`  evidence_refs: ${proposal.evidence_ref_count}`);
  }
  if (review.evidence_event_id) lines.push(`- evidence: ${review.evidence_event_id}`);
  return lines.join("\n");
}

async function reviewTickHistorySection(store: AgentStore): Promise<ContextSection> {
  const result = await listReviewTicks(store, { limit: 3 });
  if (result.ticks.length === 0) {
    return {
      title: "Review Tick History",
      body: "No recent review tick history selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  return {
    title: "Review Tick History",
    body: [
      "Read-only review tick history. Use this to understand recent autonomous review focus and inbox materialization; do not run review tick, request confirmations, or execute follow-ups from context alone.",
      `- selected_ticks: ${result.ticks.length}`,
      "",
      ...result.ticks.map(renderReviewTickHistoryItem)
    ].join("\n"),
    refs: result.tick_refs,
    item_count: result.ticks.length
  };
}

function renderReviewTickHistoryItem(tick: ReviewTickHistorySummary, index: number): string {
  const lines = [
    `### ${index + 1}. ${tick.id}`,
    `- created_at: ${tick.created_at}`,
    `- mode: ${tick.mode}`,
    `- query: ${tick.query ?? "n/a"}`,
    `- session_id: ${tick.session_id ?? "n/a"}`,
    `- tick_ref: ${tick.tick_ref}`,
    `- review_ref: ${tick.review_ref}`,
    `- focus_source: ${tick.focus.source}`,
    `- focus_reason: ${truncate(tick.focus.reason, 260)}`,
    `- focus_query: ${tick.focus.query ?? "n/a"}`,
    `- proposals: ${tick.proposal_count}`,
    `- inbox_items: ${tick.inbox_count}`,
    `- new_items: ${tick.new_items}`,
    `- updated_items: ${tick.updated_items}`
  ];
  if (tick.focus.opportunity) {
    lines.push(`- focus_opportunity: ${tick.focus.opportunity.kind}:${tick.focus.opportunity.id}`);
    lines.push(`- focus_ref: ${tick.focus.opportunity.ref}`);
  }
  if (tick.inbox_item_refs.length > 0) lines.push(`- inbox_refs: ${tick.inbox_item_refs.slice(0, 4).join(", ")}`);
  if (tick.evidence_event_id) lines.push(`- evidence: ${tick.evidence_event_id}`);
  return lines.join("\n");
}

async function sopEvolutionLedgerSection(
  store: AgentStore,
  vaultRoot: SkillResolverLike | undefined
): Promise<ContextSection> {
  const ledger = await getSopEvolutionLedger(store, {
    limit: 4,
    vaultRoot: vaultRoot ?? "vault"
  });
  return {
    title: "SOP Evolution Ledger",
    body: [
      "Read-only SOP and skill evolution ledger. Use this as state orientation only; explicit review or confirmation commands are still required before mutation.",
      "",
      renderSopEvolutionLedgerMarkdown(ledger, { includeTitle: false })
    ].join("\n"),
    refs: unique([
      ...ledger.entries.flatMap((item) => [
        item.sop_ref,
        ...item.audit_refs,
        ...item.review_refs,
        ...item.followup_refs,
        ...item.skill_refs,
        ...item.skill_event_refs
      ]),
      ...ledger.latest_followups.map((item) => item.ref),
      ...ledger.latest_skill_events.map((item) => item.ref)
    ]),
    item_count: ledger.entries.length + ledger.latest_followups.length + ledger.latest_skill_events.length
  };
}

async function queryTodoDiscipline(store: AgentStore, snapshot: TurnSnapshot): Promise<string> {
  const discipline = snapshot.working_context.discipline;
  if (!isQueryTodoDiscipline(discipline)) return "No query/todo discipline active for this turn.";

  return [
    "Discipline mode is active. The harness has loaded these files as mandatory current context.",
    refBlock(discipline.query_ref, await store.readStateText(discipline.query_ref, 4000)),
    refBlock(discipline.todo_ref, await store.readStateText(discipline.todo_ref, 5000))
  ].join("\n\n");
}

async function opportunityBacklogSection(
  store: AgentStore,
  vaultRoot: SkillResolverLike | undefined
): Promise<ContextSection> {
  const backlog = await getOpportunityBacklog(store, {
    limit: 5,
    vaultRoot: vaultRoot ?? "vault"
  });
  if (backlog.items.length === 0) {
    return {
      title: "Opportunity Backlog",
      body: "No opportunity backlog items selected for this turn.",
      refs: [],
      item_count: 0
    };
  }

  return {
    title: "Opportunity Backlog",
    body: [
      "Read-only opportunity backlog. Scores rank local self-evolution attention only; do not execute confirmations, run review tick, or mutate memory/SOP/skill state from context alone.",
      `- selected_items: ${backlog.items.length}`,
      `- created_at: ${backlog.created_at}`,
      "",
      ...backlog.items.map(renderOpportunityBacklogItem)
    ].join("\n"),
    refs: backlog.item_refs,
    item_count: backlog.items.length
  };
}

function renderOpportunityBacklogItem(item: OpportunityBacklogItem, index: number): string {
  const lines = [
    `### ${index + 1}. ${item.kind}: ${item.id}`,
    `- status: ${item.status}`,
    `- score: ${item.score}`,
    `- title: ${truncate(item.title, 220)}`,
    `- summary: ${truncate(item.summary, 260)}`,
    `- ref: ${item.ref}`,
    `- budget: turns=${item.budget_hint.max_turns}, tools=${item.budget_hint.max_tool_calls}, side_effect=${item.budget_hint.side_effect_level}`,
    `- next_step: ${truncate(item.next_step, 300)}`
  ];
  if (item.action_kind) lines.push(`- action: ${item.action_kind}`);
  if (item.decision_command) lines.push(`- decision_command: ${item.decision_command}`);
  appendActionChainLines(lines, item.action_chain);
  if (item.opportunity_decision) {
    lines.push(`- opportunity_decision: ${item.opportunity_decision.status}`);
    lines.push(`- opportunity_decision_reason: ${truncate(item.opportunity_decision.reason, 220)}`);
    lines.push(`- opportunity_decision_ref: ${item.opportunity_decision.ref}`);
    if (item.opportunity_decision.action_chain_snapshot && item.opportunity_decision.action_chain_snapshot.length > 0) {
      lines.push(`- opportunity_decision_action_chain: ${renderActionChainSummary(item.opportunity_decision.action_chain_snapshot)}`);
    }
  }
  if (item.sop_evolution_gate) {
    lines.push(`- sop_evolution_gate: ${item.sop_evolution_gate.status}`);
    lines.push(`- gate_reason_code: ${item.sop_evolution_gate.reason_code}`);
    lines.push(`- gate_reason: ${truncate(item.sop_evolution_gate.reason, 220)}`);
  }
  if (item.sop_recovery_decision) {
    lines.push(`- recovery_decision: ${item.sop_recovery_decision.status}`);
    lines.push(`- recovery_decision_reason: ${truncate(item.sop_recovery_decision.reason, 220)}`);
    lines.push(`- recovery_decision_ref: ${item.sop_recovery_decision.ref}`);
  }
  appendReusedSkillCoverageLines(lines, item.reused_skill_coverage);
  appendServiceHealthLines(lines, item.service_health);
  appendArchiveHealthLines(lines, item.archive_health);
  appendSkillRegistryHealthLines(lines, item.skill_registry_health);
  appendContextHealthLines(lines, item.context_health);
  appendContextPressureLines(lines, item.context_pressure);
  appendWorkingCheckpointLines(lines, item.working_checkpoint);
  appendPipelineRunLines(lines, item.pipeline_run);
  appendRepoWriteGuardLines(lines, item.repo_write_guard);
  appendSelectedSkillDriftLines(lines, item.selected_skill_drift);
  appendSelectedSkillOutcomeLines(lines, item.selected_skill_outcome);
  appendCompletionVerificationLines(lines, item.completion_verification);
  appendDraftSopReadinessLines(lines, item.draft_sop_readiness);
  if (item.source_ref) lines.push(`- source_ref: ${item.source_ref}`);
  if (item.score_reasons.length > 0) lines.push(`- score_reasons: ${item.score_reasons.slice(0, 4).join("; ")}`);
  if (item.updated_at) lines.push(`- updated_at: ${item.updated_at}`);
  else if (item.created_at) lines.push(`- created_at: ${item.created_at}`);
  return lines.join("\n");
}

function appendActionChainLines(
  lines: string[],
  actionChain: OpportunityBacklogItem["action_chain"] | undefined
): void {
  if (!actionChain || actionChain.length === 0) return;
  lines.push(`- action_chain: ${actionChain.map((step) => step.label).join(" -> ")}`);
  for (const step of actionChain.filter((item) => item.label !== "record_decision").slice(0, 4)) {
    lines.push(`- action_${step.label}: ${renderActionCommand(step.command)} [${step.effect}]`);
  }
}

function renderActionChainSummary(actionChain: Array<{ label: string; effect: string }>): string {
  return actionChain.map((step) => `${step.label}/${step.effect}`).join(" -> ");
}

function renderActionCommand(command: string): string {
  return truncate(command.replace(/[\r\n]+/g, " ").trim(), 260);
}

function appendServiceHealthLines(
  lines: string[],
  health: OpportunityBacklogItem["service_health"] | undefined
): void {
  if (!health) return;
  lines.push(`- service_health: ${health.status}`);
  lines.push(`- service_health_im_state: ${health.im_state}`);
  lines.push(`- service_health_heartbeat: ${health.heartbeat_freshness}`);
  lines.push(`- service_health_heartbeat_age_ms: ${health.heartbeat_age_ms ?? "unknown"}`);
  lines.push(`- service_health_runtime_commit: ${health.runtime_commit ?? "unknown"}`);
  lines.push(`- service_health_runtime_dirty: ${stringifyOptionalBoolean(health.runtime_dirty)}`);
  lines.push(`- service_health_review_tick: ${health.review_tick_state}`);
  lines.push(`- service_health_content_daily: ${health.content_daily_state}`);
  if (health.content_daily_current_step) {
    lines.push(`- service_health_content_daily_step: ${health.content_daily_current_step}`);
    lines.push(`- service_health_content_daily_step_status: ${health.content_daily_current_step_status ?? "unknown"}`);
    lines.push(`- service_health_content_daily_step_freshness: ${health.content_daily_current_step_freshness ?? "unknown"}`);
    lines.push(`- service_health_content_daily_step_age_ms: ${health.content_daily_current_step_age_ms ?? "unknown"}`);
    lines.push(`- service_health_content_daily_track: ${health.content_daily_current_track_id ?? "unknown"}`);
    if (health.content_daily_current_job_ref) lines.push(`- service_health_content_daily_job_ref: ${health.content_daily_current_job_ref}`);
    if (health.content_daily_current_run_ref) lines.push(`- service_health_content_daily_run_ref: ${health.content_daily_current_run_ref}`);
  }
  lines.push(`- service_health_feedback_refresh: ${health.content_feedback_refresh_state}`);
  if (health.content_creator_metrics_enabled || health.content_creator_metrics_state !== "unknown") {
    lines.push(`- service_health_creator_metrics: ${health.content_creator_metrics_state}`);
  }
  lines.push(`- service_health_pause_active: ${health.autonomy_pause_active}`);
  lines.push(`- service_health_inspect: ${health.inspect_command}`);
}

function appendCompletionVerificationLines(
  lines: string[],
  completion: OpportunityBacklogItem["completion_verification"] | undefined
): void {
  if (!completion) return;
  lines.push(`- completion_report: ${completion.report_ref}`);
  lines.push(`- completion_status: ${completion.completion_status}`);
  lines.push(`- completion_verification_status: ${completion.verification_status}`);
  if (completion.failed_check_ids.length > 0) lines.push(`- completion_failed_checks: ${completion.failed_check_ids.join(", ")}`);
  if (completion.warning_check_ids.length > 0) lines.push(`- completion_warning_checks: ${completion.warning_check_ids.join(", ")}`);
  lines.push(`- completion_model_diagnostics: ${completion.model_diagnostic_count}`);
  for (const diagnostic of completion.model_diagnostics.slice(0, 3)) {
    lines.push(`- completion_model_diagnostic: round=${diagnostic.round} stage=${diagnostic.stage} kind=${diagnostic.failure_kind} ref=${diagnostic.diagnostic_ref}`);
    if (diagnostic.error_preview) lines.push(`  error_preview: ${truncate(diagnostic.error_preview, 180)}`);
  }
  lines.push(`- completion_inspect: ${completion.inspect_command}`);
  lines.push(`- completion_trace: ${completion.trace_command}`);
}

function appendArchiveHealthLines(
  lines: string[],
  health: OpportunityBacklogItem["archive_health"] | undefined
): void {
  if (!health) return;
  lines.push(`- archive_health: ${health.issue_status}`);
  lines.push(`- archive_health_kind: ${health.issue_kind}`);
  lines.push(`- archive_health_date: ${health.date ?? "unknown"}`);
  lines.push(`- archive_health_archive: ${health.archive_ref ?? "none"}`);
  lines.push(`- archive_health_source_events: ${health.source_event_count ?? "unknown"}`);
  lines.push(`- archive_health_archive_events: ${health.archive_event_count ?? "unknown"}`);
  lines.push(`- archive_health_reason: ${truncate(health.reason, 220)}`);
  lines.push(`- archive_health_inspect: ${health.inspect_command}`);
  if (health.refresh_command) lines.push(`- archive_health_refresh: ${health.refresh_command}`);
}

function appendSkillRegistryHealthLines(
  lines: string[],
  health: OpportunityBacklogItem["skill_registry_health"] | undefined
): void {
  if (!health) return;
  lines.push(`- skill_registry_health: ${health.issue_status}`);
  lines.push(`- skill_registry_health_kind: ${health.issue_kind}`);
  lines.push(`- skill_registry_health_skill: ${health.skill_name ?? "unknown"}`);
  lines.push(`- skill_registry_health_instructions: ${health.instructions_ref ?? "none"}`);
  lines.push(`- skill_registry_health_registry: ${health.registry_ref ?? "none"}`);
  lines.push(`- skill_registry_health_event: ${health.event_ref ?? "none"}`);
  lines.push(`- skill_registry_health_reason: ${truncate(health.reason, 220)}`);
  lines.push(`- skill_registry_health_inspect: ${health.inspect_command}`);
  if (health.sync_command) lines.push(`- skill_registry_health_sync: ${health.sync_command}`);
  if (health.retire_event_command) lines.push(`- skill_registry_health_retire_event: ${health.retire_event_command}`);
}

function appendContextPressureLines(
  lines: string[],
  pressure: OpportunityBacklogItem["context_pressure"] | undefined
): void {
  if (!pressure) return;
  lines.push(`- context_pressure: ${pressure.status}`);
  lines.push(`- context_pressure_session: ${pressure.session_id}`);
  lines.push(`- context_pressure_total_chars: ${pressure.total_chars}`);
  lines.push(`- context_pressure_largest_section: ${pressure.largest_section_title}`);
  lines.push(`- context_pressure_largest_chars: ${pressure.largest_section_chars}`);
  lines.push(`- context_pressure_sections: ${pressure.pressure_section_count}`);
  lines.push(`- context_pressure_inspect: ${pressure.inspect_command}`);
  lines.push(`- context_pressure_mitigation: ${pressure.operator_guidance.mitigation_kind}`);
  lines.push(`- context_pressure_complete: ${pressure.operator_guidance.complete_after_external_mitigation_command}`);
  lines.push(`- context_pressure_retire: ${pressure.operator_guidance.retire_historical_pressure_command}`);
  lines.push(`- context_pressure_future_gate: ${pressure.operator_guidance.future_mitigation_gate}`);
}

function appendContextHealthLines(
  lines: string[],
  health: OpportunityBacklogItem["context_health"] | undefined
): void {
  if (!health) return;
  lines.push(`- context_health: ${health.issue_status}`);
  lines.push(`- context_health_kind: ${health.issue_kind}`);
  lines.push(`- context_health_manifest: ${health.manifest_ref ?? "none"}`);
  lines.push(`- context_health_context: ${health.context_ref ?? "none"}`);
  lines.push(`- context_health_reason: ${truncate(health.reason, 220)}`);
  lines.push(`- context_health_inspect: ${health.inspect_command}`);
  lines.push(`- context_health_resolution: ${health.operator_guidance.resolution_kind}`);
  if (health.operator_guidance.repair_manifest_command) {
    lines.push(`- context_health_repair_manifest: ${health.operator_guidance.repair_manifest_command}`);
  }
  lines.push(`- context_health_complete_after_external_repair: ${health.operator_guidance.complete_after_external_repair_command}`);
  lines.push(`- context_health_retire_historical: ${health.operator_guidance.retire_historical_issue_command}`);
}

function appendWorkingCheckpointLines(
  lines: string[],
  checkpoint: OpportunityBacklogItem["working_checkpoint"] | undefined
): void {
  if (!checkpoint) return;
  lines.push(`- working_checkpoint: ${checkpoint.checkpoint_ref}`);
  lines.push(`- working_checkpoint_step: ${checkpoint.current_step}`);
  lines.push(`- working_checkpoint_next: ${truncate(checkpoint.next_action, 220)}`);
  lines.push(`- working_checkpoint_open_questions: ${checkpoint.open_question_count}`);
  lines.push(`- working_checkpoint_evidence_refs: ${checkpoint.recent_evidence_ref_count}`);
  lines.push(`- working_checkpoint_inspect: ${checkpoint.inspect_command}`);
}

function appendPipelineRunLines(
  lines: string[],
  pipelineRun: OpportunityBacklogItem["pipeline_run"] | undefined
): void {
  if (!pipelineRun) return;
  lines.push(`- pipeline_run: ${pipelineRun.run_id}`);
  lines.push(`- pipeline_id: ${pipelineRun.pipeline_id}`);
  lines.push(`- pipeline_status: ${pipelineRun.status}`);
  lines.push(`- pipeline_checkpoint: ${pipelineRun.checkpoint_ref}`);
  lines.push(`- pipeline_ref: ${pipelineRun.pipeline_ref}`);
  if (pipelineRun.blocked_stage_id) lines.push(`- pipeline_blocked_stage: ${pipelineRun.blocked_stage_id}`);
  if (pipelineRun.failed_stage_ids.length > 0) lines.push(`- pipeline_failed_stages: ${pipelineRun.failed_stage_ids.join(", ")}`);
  if (pipelineRun.query_ref) lines.push(`- pipeline_query_ref: ${pipelineRun.query_ref}`);
  if (pipelineRun.todo_ref) lines.push(`- pipeline_todo_ref: ${pipelineRun.todo_ref}`);
  lines.push(`- pipeline_inspect_command: ${pipelineRun.inspect_command}`);
  lines.push(`- pipeline_resume_command: ${pipelineRun.resume_command}`);
}

function appendRepoWriteGuardLines(
  lines: string[],
  guard: OpportunityBacklogItem["repo_write_guard"] | undefined
): void {
  if (!guard) return;
  lines.push(`- repo_write_guard: ${guard.path}`);
  lines.push(`- repo_write_guard_trace: ${guard.trace_ref}`);
  lines.push(`- repo_write_guard_event: ${guard.event_id}`);
  lines.push(`- repo_write_guard_status: before=${guard.before_status} after=${guard.after_status}`);
  lines.push(`- repo_write_guard_changed_files: ${guard.before_changed_file_count}->${guard.after_changed_file_count} delta=${guard.changed_file_count_delta}`);
  lines.push(`- repo_write_guard_preexisting_dirty: ${guard.preexisting_dirty}`);
  lines.push(`- repo_write_guard_target_changed: ${guard.target_changed_after_write}`);
  lines.push(`- repo_write_guard_inspect: ${guard.inspect_command}`);
}

async function semanticMemorySection(store: AgentStore): Promise<ContextSection> {
  const refs = (await store.listStateFiles("memory/semantic/accepted"))
    .filter((ref) => ref.endsWith(".json"));
  const memories: Array<Record<string, unknown> & { ref: string }> = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    if (isAcceptedSemanticMemory(raw)) memories.push({ ...raw, ref });
  }
  const selected = memories
    .sort((left, right) => getString(right.accepted_at)?.localeCompare(getString(left.accepted_at) ?? "") ?? 0)
    .slice(0, 5);
  if (selected.length === 0) {
    return {
      title: "Semantic Memory",
      body: "No accepted semantic memory selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  return {
    title: "Semantic Memory",
    body: selected.map((memory, index) => [
      `### ${index + 1}. ${getString(memory.id) ?? "semantic_memory"}`,
      `- scope: ${getString(memory.scope) ?? "local"}`,
      `- accepted_at: ${getString(memory.accepted_at) ?? "unknown"}`,
      `- ref: ${memory.ref}`,
      `- summary: ${truncate(getString(memory.summary) ?? "", 500)}`,
      "",
      truncate(getString(memory.content) ?? "", 900)
    ].join("\n")).join("\n\n"),
    refs: selected.map((memory) => memory.ref),
    item_count: selected.length
  };
}

async function dreamSection(store: AgentStore): Promise<ContextSection> {
  const dreams = await listLatestDreamSnapshots(store, 3);
  if (dreams.length === 0) {
    return {
      title: "Dreams",
      body: "No dream snapshots selected for this turn.",
      refs: [],
      item_count: 0
    };
  }
  return {
    title: "Dreams",
    body: dreams.map((dream, index) => [
      `### ${index + 1}. ${dream.id}`,
      ...dream.axes.slice(0, 1).map((axis) => `- axis: ${axis.title} ${axis.status}`)
    ].join("\n")).join("\n\n"),
    refs: dreams.map((dream) => dream.ref),
    item_count: dreams.length
  };
}

async function selfEvolutionScorecardSection(
  store: AgentStore,
  vaultRoot: SkillResolverLike | undefined
): Promise<ContextSection> {
  const scorecard = await getSelfEvolutionScorecard(store, { limit: 3, vaultRoot });
  const core = scorecard.dimensions.find((dimension) => dimension.id === "core_ga_design");
  const basic = scorecard.dimensions.find((dimension) => dimension.id === "basic_runtime_substrate");
  const expert = scorecard.dimensions.find((dimension) => dimension.id === "multi_expert_orchestration");
  return {
    title: "Self-Evolution Scorecard",
    body: [
      `core_ga_design=${core?.stage ?? "unknown"};basic_runtime_substrate=${basic?.stage ?? "unknown"};multi_expert=${expert?.stage ?? "unknown"}`
    ].join("\n"),
    refs: scorecard.refs.slice(0, 8),
    item_count: scorecard.dimensions.length
  };
}

const COMPACT_GA_PLAN_CHECK_PREFIXES = [
  "source_artifact_verified=",
  "source_artifact_evidence=",
  "source_artifact_warning_thresholds="
];

const COMPACT_GA_PLAN_REASON_PREFIXES = [
  "source_status=",
  "source_artifact_quality="
];

const COMPACT_GA_PLAN_ACCEPTANCE_PREFIXES = [
  "goal_scope:",
  "current_state:",
  "verification_scope:",
  "learning_persistence:"
];

const COMPACT_GA_PLAN_CRITICAL_ACCEPTANCE_PARTS = [
  "instead of copied from the source artifact",
  "external adapters remain application slices"
];

const COMPACT_GA_PLAN_CRITICAL_NON_GOAL_PARTS = [
  "does not promote SOPs",
  "does not promote one-off external adapter behavior",
  "no external-tool execution",
  "no automatic SOP, skill, memory, or dream promotion",
  "no completion proof without executed verification"
];

function compactGaPlanPrefixedItems(items: string[], prefixes: string[]): string[] {
  const selected: string[] = [];
  for (const prefix of prefixes) {
    const item = items.find((candidate) => candidate.startsWith(prefix));
    if (item) selected.push(item);
  }
  for (const item of items) {
    if (selected.length >= prefixes.length) break;
    if (!selected.includes(item)) selected.push(item);
  }
  return selected;
}

export function compactGaPlanNonGoals(nonGoals: string[]): string[] {
  const selected: string[] = [];
  for (const part of COMPACT_GA_PLAN_CRITICAL_NON_GOAL_PARTS) {
    const item = nonGoals.find((candidate) => candidate.includes(part));
    if (item) selected.push(item);
  }
  return selected;
}

export function compactGaPlanSelectionChecks(selectionChecks: string[]): string[] {
  return compactGaPlanPrefixedItems(selectionChecks, COMPACT_GA_PLAN_CHECK_PREFIXES);
}

export function compactGaPlanSelectionReasons(selectionReasons: string[]): string[] {
  return compactGaPlanPrefixedItems(selectionReasons, COMPACT_GA_PLAN_REASON_PREFIXES);
}

export function compactGaPlanSourceTruth(
  plan: Pick<GaProjectDesignPlanPacket,
    "source_artifact_id" | "source_iteration_ref" | "source_proposed_slice" | "proposed_slice" | "selection_checks" | "selection_reasons">
): string {
  const sourceStatus = plan.selection_reasons
    .find((reason) => reason.startsWith("source_status="))
    ?.replace("source_status=", "");
  const sourceQuality = plan.selection_reasons
    .find((reason) => reason.startsWith("source_artifact_quality="))
    ?.replace("source_artifact_quality=", "");
  const freshSuccessor = plan.selection_checks
    .find((check) => check.startsWith("fresh_successor_slice="))
    ?.match(/^fresh_successor_slice=([^;]+)/)?.[1];
  return `artifact=${plan.source_artifact_id}; ref=${plan.source_iteration_ref}; source_slice=${plan.source_proposed_slice}; target_slice=${plan.proposed_slice}; status=${sourceStatus ?? "unknown"}; quality=${sourceQuality ?? "unknown"}; fresh_successor=${freshSuccessor ?? "unknown"}`;
}

export function compactGaPlanAcceptanceCriteria(acceptanceCriteria: string[]): string[] {
  const selected = compactGaPlanPrefixedItems(acceptanceCriteria, COMPACT_GA_PLAN_ACCEPTANCE_PREFIXES);
  for (const part of COMPACT_GA_PLAN_CRITICAL_ACCEPTANCE_PARTS) {
    const item = acceptanceCriteria.find((candidate) => candidate.includes(part));
    if (item && !selected.includes(item)) selected.push(item);
  }
  return selected;
}

export function compactGaPlanAntiDriftChecks(
  plan: Pick<GaProjectDesignPlanPacket, "iteration_focus">
): string {
  return plan.iteration_focus.anti_drift_checks.slice(0, 3).join(" | ");
}

export function compactGaPlanGoalScope(
  plan: Pick<GaProjectDesignPlanPacket, "goal_scope">
): string {
  const scope = plan.goal_scope;
  const source = scope.source_of_truth.slice(0, 2).join("|");
  const success = scope.success_evidence[0] ?? "unknown";
  return `objective=${scope.objective}; owner=${scope.owner_surface}; source=${source}; success=${success}`;
}

export function compactGaPlanLayerGuard(
  plan: Pick<GaProjectDesignPlanPacket, "layer_decision">
): string {
  const decision = plan.layer_decision;
  return `stage=${decision.stage}; source=${decision.source_layer}/${decision.source_owner_surface}; selected=${decision.selected_layer}/${decision.selected_owner_surface}`;
}

export function compactGaPlanAuditRequirements(
  plan: Pick<GaProjectDesignPlanPacket, "completion_audit_seeds">
): string {
  return plan.completion_audit_seeds
    .map((seed) => `${seed.id}=${seed.requirement}`)
    .join("; ");
}

export function compactGaPlanAuditEvidence(
  plan: Pick<GaProjectDesignPlanPacket, "completion_audit_seeds">
): string {
  return plan.completion_audit_seeds
    .map((seed) => `${seed.id}=${compactGaPlanAuditEvidenceItem(seed)}`)
    .join("; ");
}

function compactGaPlanAuditEvidenceItem(
  seed: GaProjectDesignPlanPacket["completion_audit_seeds"][number]
): string {
  if (seed.id === "current_state") {
    return seed.evidence_needed.find((evidence) => evidence.includes("service health is a required verification command"))
      ?? seed.evidence_needed[0]
      ?? "unknown";
  }
  if (seed.id === "verification_scope") {
    return seed.evidence_needed.find((evidence) => evidence.includes("required verification entrypoint"))
      ?? seed.evidence_needed[0]
      ?? "unknown";
  }
  return seed.evidence_needed[0] ?? "unknown";
}

export function compactGaPlanAuditRejects(
  plan: Pick<GaProjectDesignPlanPacket, "completion_audit_seeds">
): string {
  return plan.completion_audit_seeds
    .map((seed) => `${seed.id}=${compactGaPlanAuditReject(seed)}`)
    .join("; ");
}

function compactGaPlanAuditReject(
  seed: GaProjectDesignPlanPacket["completion_audit_seeds"][number]
): string {
  if (seed.id === "current_state") {
    return seed.reject_if.find((reject) => reject.includes("service health is a required verification command"))
      ?? seed.reject_if[0]
      ?? "unknown";
  }
  if (seed.id === "verification_scope") {
    return seed.reject_if.find((reject) => reject.includes("required verification entrypoint"))
      ?? seed.reject_if[0]
      ?? "unknown";
  }
  return seed.reject_if[0] ?? "unknown";
}

export function compactGaPlanStageExitCriteria(
  plan: Pick<GaProjectDesignPlanPacket, "capability_stage_plan">
): string {
  const core = plan.capability_stage_plan.core_capabilities
    .map((item) => `${item.id}=${item.exit_criteria[0] ?? "unknown"}`)
    .join(",");
  const basic = plan.capability_stage_plan.basic_capabilities
    .map((item) => `${item.id}=${item.exit_criteria[0] ?? "unknown"}`)
    .join(",");
  return `core=${core}; basic=${basic}`;
}

export function compactGaPlanRuntimeObservabilityGuard(
  plan: Pick<GaProjectDesignPlanPacket, "capability_stage_plan">
): string | null {
  const capability = plan.capability_stage_plan.basic_capabilities
    .find((item) => item.id === "runtime_observability");
  if (!capability) return null;
  return `stage=${capability.stage}; current=${capability.current_state}; next=${capability.next_iteration}; exit=${capability.exit_criteria[1] ?? capability.exit_criteria[0] ?? "unknown"}`;
}

export function compactGaPlanPhaseForbids(
  plan: Pick<GaProjectDesignPlanPacket, "phase_gates">
): string {
  return plan.phase_gates
    .map((gate) => `${gate.phase_id}=${gate.forbidden_shortcuts[0] ?? "unknown"}`)
    .join("; ");
}

export function compactGaPlanReviewGate(
  plan: Pick<GaProjectDesignPlanPacket, "iteration_record_status" | "selection_checks">
): string | null {
  if (plan.iteration_record_status.status !== "open_iteration_available") return null;
  const required = plan.selection_checks
    .find((check) => check.startsWith("verification_entrypoints="))
    ?.replace("verification_entrypoints=", "");
  return `blocked; blockers=outcome_record,outcome_verification_command_coverage${required ? `; required=${required}` : ""}; outcome_status=${plan.iteration_record_status.outcome_status ?? "not_recorded"}`;
}

export function compactGaPlanVerificationCommands(
  plan: Pick<GaProjectDesignPlanPacket, "verification_commands" | "iteration_record_status">
): string[] {
  const iterationId = plan.iteration_record_status.status === "open_iteration_available"
    ? plan.iteration_record_status.id
    : undefined;
  return plan.verification_commands.map((command) => {
    if (command.includes("governance project-design")) {
      const artifact = command.match(/--artifact\s+(\S+)/)?.[1];
      return artifact ? `project-design=${artifact}` : "project-design";
    }
    if (command.includes("governance scorecard")) return "scorecard";
    if (command.includes("governance iterations")) {
      const iteration = iterationId ?? command.match(/--iteration\s+(\S+)/)?.[1] ?? "<iteration-ref>";
      const auditSeed = command.match(/--audit-seed\s+(\S+)/)?.[1];
      return `iterations=${iteration}${auditSeed ? `;audit=${auditSeed}` : ""}`;
    }
    if (command.includes("service health")) {
      const target = command.match(/--target\s+(\S+)/)?.[1];
      return target ? `service-health=${target}` : "service-health";
    }
    if (command.includes("pnpm run check")) return "check";
    return command;
  });
}

export function compactGaPlanAfterVerifyCommand(
  plan: Pick<GaProjectDesignPlanPacket, "iteration_record_status">
): string | null {
  if (plan.iteration_record_status.status !== "open_iteration_available" || !plan.iteration_record_status.id) return null;
  return `pnpm run runtime -- governance record-iteration-outcome --iteration ${plan.iteration_record_status.id} --outcome-status verified --summary "..." --evidence-ref <ref...> --verification-command "<command...>" --next-move "..." --state-root <state-root>`;
}

export function compactGaPlanEvidenceRefs(refs: string[]): string[] {
  return refs.slice(0, 4);
}

export function compactGaPlanProofBoundary(
  plan: Pick<GaProjectDesignPlanPacket, "iteration_record_status">
): string | null {
  if (plan.iteration_record_status.status !== "open_iteration_available") return null;
  return "evidence_basis=candidate_refs_only; require=verified_outcome,outcome_evidence_refs,plan_ref_coverage,outcome_verification_command_coverage";
}

async function gaProjectDesignPlanSection(store: AgentStore): Promise<ContextSection | null> {
  const readModel = await getGaProjectDesignReadModel(store, { limit: 3 });
  const plan = readModel.next_core_basic_plan;
  if (!plan) return null;
  const auditCommand = plan.iteration_record_status.audit_command;
  const freshSuccessorCheck = plan.selection_checks.find((check) => check.startsWith("fresh_successor_slice="));
  const targetLayerCheck = plan.selection_checks.find((check) => check.startsWith("target_layer="));
  const verificationEntryPoints = plan.selection_checks.find((check) => check.startsWith("verification_entrypoints="));
  const compactSelectionReasons = compactGaPlanSelectionReasons(plan.selection_reasons);
  const compactSelectionChecks = compactGaPlanSelectionChecks(plan.selection_checks);
  const sourceTruth = compactGaPlanSourceTruth(plan);
  const compactAcceptanceCriteria = compactGaPlanAcceptanceCriteria(plan.acceptance_criteria);
  const compactNonGoals = compactGaPlanNonGoals(plan.non_goals);
  const compactAntiDriftChecks = compactGaPlanAntiDriftChecks(plan);
  const compactGoalScope = compactGaPlanGoalScope(plan);
  const compactLayerGuard = compactGaPlanLayerGuard(plan);
  const compactAuditRequirements = compactGaPlanAuditRequirements(plan);
  const compactAuditEvidence = compactGaPlanAuditEvidence(plan);
  const compactAuditRejects = compactGaPlanAuditRejects(plan);
  const compactStageExitCriteria = compactGaPlanStageExitCriteria(plan);
  const runtimeObservabilityGuard = compactGaPlanRuntimeObservabilityGuard(plan);
  const compactPhaseForbids = compactGaPlanPhaseForbids(plan);
  const reviewGate = compactGaPlanReviewGate(plan);
  const compactVerificationCommands = compactGaPlanVerificationCommands(plan);
  const afterVerifyCommand = compactGaPlanAfterVerifyCommand(plan);
  const evidenceRefs = compactGaPlanEvidenceRefs(plan.refs);
  const proofBoundary = compactGaPlanProofBoundary(plan);
  return {
    title: "GA Project Design Plan",
    body: [
      `plan: ${plan.id}`,
      `layer: ${plan.layer}; owner: ${plan.owner_surface}; slice: ${plan.proposed_slice}`,
      `source_artifact: ${plan.source_artifact_id}`,
      `source_truth: ${sourceTruth}`,
      `goal_scope: ${compactGoalScope}`,
      `planning_basis: ${plan.planning_basis}`,
      `focus: ${plan.iteration_focus.direction}`,
      `focus_next: ${plan.iteration_focus.next_steps.slice(0, 2).join(" | ")}`,
      ...(compactAntiDriftChecks ? [`anti_drift: ${compactAntiDriftChecks}`] : []),
      ...(compactNonGoals.length ? [`non_goals: ${compactNonGoals.join(" | ")}`] : []),
      `capability_stage: core=${plan.capability_stage_plan.core_capabilities.map((item) => `${item.id}:${item.stage}`).join(",")}; basic=${plan.capability_stage_plan.basic_capabilities.map((item) => `${item.id}:${item.stage}`).join(",")}`,
      ...(runtimeObservabilityGuard ? [`runtime_guard: ${runtimeObservabilityGuard}`] : []),
      `stage_exit: ${compactStageExitCriteria}`,
      `stage_next: ${plan.capability_stage_plan.next_iteration_plan.slice(0, 2).join(" | ")}`,
      `phase_forbid: ${compactPhaseForbids}`,
      `scorecard_basis: ${plan.scorecard_basis.slice(0, 2).join(" | ")}`,
      `layer_decision: ${plan.layer_decision.core_identity}; ${plan.layer_decision.application_boundaries[0]}`,
      `layer_guard: ${compactLayerGuard}`,
      `selection: ${plan.selection_status}; ${compactSelectionReasons.join(" | ")}`,
      `checks: ${compactSelectionChecks.join(" | ")}`,
      ...(freshSuccessorCheck ? [`successor: ${freshSuccessorCheck}`] : []),
      ...(targetLayerCheck ? [`target: ${targetLayerCheck}`] : []),
      ...(verificationEntryPoints ? [`verify: ${verificationEntryPoints}`] : []),
      ...(compactVerificationCommands.length ? [`verify_commands: ${compactVerificationCommands.join(" | ")}`] : []),
      `iteration_record_status: ${plan.iteration_record_status.status}${plan.iteration_record_status.id ? `; ${plan.iteration_record_status.id}` : ""}`,
      ...(reviewGate ? [`review_gate: ${reviewGate}`] : []),
      ...(auditCommand ? [`audit_command: ${auditCommand}`] : []),
      ...(afterVerifyCommand ? [`after_verify: ${afterVerifyCommand}`] : []),
      ...(evidenceRefs.length ? [`evidence_basis: ${evidenceRefs.join(" | ")}`] : []),
      ...(proofBoundary ? [`proof_boundary: ${proofBoundary}`] : []),
      `audit: ${plan.completion_audit_seeds.map((seed) => seed.id).join(",")}`,
      `audit_require: ${compactAuditRequirements}`,
      `audit_evidence: ${compactAuditEvidence}`,
      `audit_reject: ${compactAuditRejects}`,
      `acceptance: ${compactAcceptanceCriteria.join(" | ")}`,
      `next_command: ${plan.next_command}`
    ].join("\n"),
    refs: plan.refs.slice(0, 6),
    item_count: 1
  };
}

async function selfEvolutionIterationSection(store: AgentStore): Promise<ContextSection[]> {
  const iteration = await getLatestSelfEvolutionIteration(store);
  if (!iteration) return [];
  return [{
    title: "Self-Evolution Iteration",
    body: [
      `iteration: ${iteration.id}`,
      `layer: ${iteration.layer}; owner: ${iteration.owner_surface}; slice: ${iteration.proposed_slice}`,
      `summary: ${iteration.summary}`,
      `experts: ${iteration.advisory_expert_roles.join(",")}`,
      `verify: ${iteration.verification_commands.slice(0, 2).join(" | ")}`
    ].join("\n"),
    refs: [
      iteration.ref,
      ...iteration.evidence_refs.slice(0, 4)
    ],
    item_count: 1
  }];
}

async function governanceQueueSection(
  store: AgentStore,
  vaultRoot: SkillResolverLike | undefined
): Promise<ContextSection> {
  const [memoryCandidates, memoryConfirmations, reviewInbox, reviewConfirmations, pauseSignal] = await Promise.all([
    listGovernanceItems(store, "memory/semantic/candidates", memoryCandidateContextItem),
    listGovernanceItems(store, "memory/semantic/confirmations", memoryConfirmationContextItem),
    listReviewInboxContextItems(store, vaultRoot ?? "vault"),
    listReviewConfirmationContextItems(store, vaultRoot ?? "vault"),
    readActivePauseContextItem(store)
  ]);
  const selected = [
    ...memoryCandidates.slice(0, 3),
    ...memoryConfirmations.slice(0, 3),
    ...reviewInbox.slice(0, 3),
    ...reviewConfirmations.slice(0, 3),
    ...(pauseSignal ? [pauseSignal] : [])
  ];

  if (selected.length === 0) {
    return {
      title: "Governance Queue",
      body: "No pending governance queue items selected for this turn.",
      refs: [],
      item_count: 0
    };
  }

  return {
    title: "Governance Queue",
    body: [
      "Read-only local governance queue. These refs are visibility only; do not execute confirmations or mutate SOP/skill/memory state from context alone.",
      `- memory_candidates: ${memoryCandidates.length}`,
      `- memory_confirmations_pending: ${memoryConfirmations.length}`,
      `- review_inbox_active: ${reviewInbox.length}`,
      `- review_confirmations_pending: ${reviewConfirmations.length}`,
      `- autonomy_pause_active: ${pauseSignal ? "true" : "false"}`,
      "",
      ...selected.map(renderGovernanceQueueItem)
    ].join("\n"),
    refs: selected.map((item) => item.ref),
    item_count: selected.length
  };
}

interface GovernanceQueueItem {
  kind: string;
  ref: string;
  id: string;
  status: string;
  source?: string;
  title?: string;
  summary?: string;
  action_kind?: string;
  created_at?: string;
  updated_at?: string;
  source_ref?: string;
  sop_id?: string;
  sop_ref?: string;
  sop_evolution_gate?: SopEvolutionConfirmationGate;
  sop_recovery_decision?: SopRecoveryDecisionWithRef;
  draft_sop_readiness?: DraftSopReadinessBacklogSummary;
  reused_skill_coverage?: ReusedSkillCoverageBacklogSummary;
  review_inbox_decision?: ReviewInboxDecisionWithRef;
  review_inbox_duplicate_group?: ReviewInboxDuplicateGroup;
  focus_action_chain?: Array<{ label: string; effect: string; reason?: string }>;
}

type FocusActionChainStep = { label: string; effect: string; reason?: string };

async function listGovernanceItems(
  store: AgentStore,
  rel: string,
  toItem: (ref: string, value: unknown) => GovernanceQueueItem | null
): Promise<GovernanceQueueItem[]> {
  const refs = (await store.listStateFiles(rel)).filter((ref) => ref.endsWith(".json"));
  const items: GovernanceQueueItem[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const item = toItem(ref, raw);
    if (item) items.push(item);
  }
  return items.sort(compareGovernanceItems);
}

function memoryCandidateContextItem(ref: string, value: unknown): GovernanceQueueItem | null {
  if (!isRecord(value)) return null;
  if (value.action_type !== "propose_memory") return null;
  const status = getString(value.status);
  const id = getString(value.id);
  if (!id || !status || status === "accepted") return null;
  return {
    kind: "memory_candidate",
    ref,
    id,
    status,
    summary: getString(value.summary) ?? undefined,
    created_at: getString(value.created_at) ?? undefined
  };
}

function memoryConfirmationContextItem(ref: string, value: unknown): GovernanceQueueItem | null {
  if (!isRecord(value)) return null;
  if (value.action_type !== "promote_memory_candidate" || value.status !== "pending") return null;
  const id = getString(value.id);
  if (!id) return null;
  return {
    kind: "memory_confirmation",
    ref,
    id,
    status: "pending",
    summary: getString(value.candidate_id) ?? getString(value.candidate_ref) ?? undefined,
    created_at: getString(value.created_at) ?? undefined,
    source_ref: getString(value.candidate_ref) ?? undefined
  };
}

function reviewInboxContextItem(
  ref: string,
  value: unknown,
  decision?: ReviewInboxDecisionWithRef,
  duplicateGroup?: ReviewInboxDuplicateGroup
): GovernanceQueueItem | null {
  if (!isRecord(value)) return null;
  const status = getString(value.status);
  const id = getString(value.id);
  if (!id || !status || status === "executed" || value.source !== "review_tick") return null;
  if (suppressReviewInboxDecision(decision)) return null;
  return {
    kind: "review_inbox",
    ref,
    id,
    status: decision?.status === "deferred" ? "deferred" : status,
    title: getString(value.title) ?? getString(value.proposal_title) ?? undefined,
    action_kind: getString(value.action_kind) ?? undefined,
    updated_at: decision?.created_at ?? getString(value.updated_at) ?? undefined,
    source_ref: getString(value.latest_review_ref) ?? undefined,
    review_inbox_decision: decision,
    review_inbox_duplicate_group: duplicateGroup,
    focus_action_chain: focusActionChainField(value.focus_action_chain)
  };
}

async function listReviewInboxContextItems(
  store: AgentStore,
  vaultRoot: SkillResolverLike
): Promise<GovernanceQueueItem[]> {
  const refs = (await store.listStateFiles("autonomy/inbox")).filter((ref) => ref.endsWith(".json"));
  const decisions = await readReviewInboxDecisions(store);
  const sources: ReviewInboxContextSource[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const source = reviewInboxContextSource(ref, raw, decisions);
    if (source) sources.push(source);
  }
  const items: GovernanceQueueItem[] = [];
  const visibleSources = annotateReviewInboxDuplicates(sources)
    .filter((source) => !source.duplicate_group || source.duplicate_group.canonical_id === source.id);
  for (const source of visibleSources) {
    const latestDecision = latestReviewInboxDuplicateDecision(decisions, source, source.duplicate_group)
      ?? source.latest_decision;
    if (suppressReviewInboxDecision(latestDecision)) continue;
    const item = reviewInboxContextItem(source.ref, source.value, latestDecision, source.duplicate_group);
    if (item) {
      const withCoverage = await withGovernanceReusedSkillCoverage(store, vaultRoot, item, source.value);
      items.push(await withGovernanceDraftSopReadiness(store, withCoverage, source.value));
    }
  }
  return items.sort(compareGovernanceItems);
}

interface ReviewInboxContextSource {
  id: string;
  ref: string;
  value: Record<string, unknown>;
  status: string;
  action_kind?: string;
  title?: string;
  rationale?: string;
  command?: string | null;
  required_refs?: string[];
  would_write?: string[];
  updated_at?: string;
  created_at?: string;
  latest_decision?: ReviewInboxDecisionWithRef;
}

function reviewInboxContextSource(
  ref: string,
  value: unknown,
  decisions: ReviewInboxDecisionWithRef[]
): ReviewInboxContextSource | null {
  if (!isRecord(value)) return null;
  const status = getString(value.status);
  const id = getString(value.id);
  if (!id || !status || status === "executed" || value.source !== "review_tick") return null;
  const decision = latestReviewInboxDecision(decisions, ref, id);
  return {
    id,
    ref,
    value,
    status,
    action_kind: getString(value.action_kind) ?? undefined,
    title: getString(value.title) ?? getString(value.proposal_title) ?? undefined,
    rationale: getString(value.rationale) ?? undefined,
    command: getString(value.command) ?? null,
    required_refs: getStringArray(value.required_refs),
    would_write: getStringArray(value.would_write),
    updated_at: decision?.created_at ?? getString(value.updated_at) ?? undefined,
    created_at: getString(value.created_at) ?? undefined,
    latest_decision: decision
  };
}

function reviewConfirmationContextItem(ref: string, value: unknown): GovernanceQueueItem | null {
  if (!isRecord(value)) return null;
  if (value.status !== "pending" || value.confirmation_required !== true || value.execution_allowed !== false) return null;
  const id = getString(value.id);
  if (!id) return null;
  const action = isRecord(value.action) ? value.action : null;
  return {
    kind: "review_confirmation",
    ref,
    id,
    status: "pending",
    source: getString(value.source) ?? "review_proposal",
    title: getString(action?.title) ?? undefined,
    action_kind: getString(value.action_kind) ?? undefined,
    created_at: getString(value.created_at) ?? undefined,
    source_ref: getString(value.review_ref) ?? undefined,
    sop_id: getString(value.sop_id) ?? undefined,
    sop_ref: getString(value.sop_ref) ?? undefined
  };
}

async function listReviewConfirmationContextItems(
  store: AgentStore,
  vaultRoot: SkillResolverLike
): Promise<GovernanceQueueItem[]> {
  const refs = (await store.listStateFiles("autonomy/followups")).filter((ref) => ref.endsWith(".json"));
  const recoveryDecisions = await readSopRecoveryDecisions(store);
  const items: GovernanceQueueItem[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const item = reviewConfirmationContextItem(ref, raw);
    if (!item) continue;
    item.sop_evolution_gate = await inspectSopEvolutionConfirmationGate(store, raw, { vaultRoot });
    if (item.sop_evolution_gate?.status === "stale") {
      item.sop_recovery_decision = latestSopRecoveryDecision(recoveryDecisions, ref, item.id);
    }
    const withCoverage = await withGovernanceReusedSkillCoverage(store, vaultRoot, item, raw);
    items.push(await withGovernanceDraftSopReadiness(store, withCoverage, raw));
  }
  return items.sort(compareGovernanceItems);
}

async function withGovernanceReusedSkillCoverage(
  store: AgentStore,
  vaultRoot: SkillResolverLike,
  item: GovernanceQueueItem,
  record: unknown
): Promise<GovernanceQueueItem> {
  if (item.action_kind !== "revise_skill" || !isRecord(record)) return item;
  const action = isRecord(record.action) ? record.action : null;
  const sopRef = reusedSkillCoverageSopRef(record, action);
  if (!sopRef) return item;
  try {
    const coverage = await getReusedSkillCoverage(store, {
      sopRef,
      vaultRoot
    });
    return {
      ...item,
      reused_skill_coverage: {
        sop_id: coverage.sop_id,
        sop_ref: coverage.sop_ref,
        status: coverage.coverage_status,
        current_duplicate_skill_ref: coverage.current_duplicate_skill_ref,
        recorded_duplicate_skill_refs: coverage.recorded_duplicate_skill_refs,
        missing_skill_refs: coverage.missing_skill_refs,
        next_step: coverage.next_step
      }
    };
  } catch {
    return item;
  }
}

async function withGovernanceDraftSopReadiness(
  store: AgentStore,
  item: GovernanceQueueItem,
  record: unknown
): Promise<GovernanceQueueItem> {
  if (item.action_kind !== "draft_sop" || !isRecord(record)) return item;
  const action = isRecord(record.action) ? record.action : null;
  try {
    const readiness = await getDraftSopReadiness(store, {
      reviewRef: draftSopReadinessReviewRef(record),
      proposalId: getString(record.proposal_id),
      requiredRefs: uniqueStringArray([
        ...getStringArray(record.required_refs),
        ...getStringArray(action?.required_refs)
      ])
    });
    return {
      ...item,
      draft_sop_readiness: {
        review_ref: readiness.review_ref,
        proposal_id: readiness.proposal_id,
        proposal_title: readiness.proposal_title,
        proposal_type: readiness.proposal_type,
        status: readiness.status,
        failure_signal_count: readiness.failure_signal_count,
        sop_signal_count: readiness.sop_signal_count,
        evidence_ref_count: readiness.evidence_ref_count,
        required_ref_count: readiness.required_ref_count,
        existing_sop_refs: readiness.existing_sop_refs,
        existing_skill_refs: readiness.existing_skill_refs,
        next_step: readiness.next_step
      }
    };
  } catch {
    return item;
  }
}

async function readActivePauseContextItem(store: AgentStore): Promise<GovernanceQueueItem | null> {
  const signal = await store.readStateJson<unknown>("autonomy/runs/pause_signal.json");
  if (!isRecord(signal) || signal.status !== "active") return null;
  return {
    kind: "autonomy_pause",
    ref: "autonomy/runs/pause_signal.json",
    id: getString(signal.id) ?? "pause_signal",
    status: "active",
    summary: getString(signal.reason) ?? undefined,
    created_at: getString(signal.created_at) ?? undefined
  };
}

function renderGovernanceQueueItem(item: GovernanceQueueItem, index: number): string {
  const lines = [
    `### ${index + 1}. ${item.kind}: ${item.id}`,
    `- status: ${item.status}`,
    `- ref: ${item.ref}`
  ];
  if (item.source) lines.push(`- source: ${item.source}`);
  if (item.action_kind) lines.push(`- action: ${item.action_kind}`);
  if (item.sop_id) lines.push(`- sop: ${item.sop_id}`);
  if (item.sop_ref) lines.push(`- sop_ref: ${item.sop_ref}`);
  if (item.sop_evolution_gate) {
    lines.push(`- sop_evolution_gate: ${item.sop_evolution_gate.status}`);
    lines.push(`- gate_reason_code: ${item.sop_evolution_gate.reason_code}`);
    lines.push(`- gate_reason: ${truncate(item.sop_evolution_gate.reason, 220)}`);
  }
  if (item.sop_recovery_decision) {
    lines.push(`- recovery_decision: ${item.sop_recovery_decision.status}`);
    lines.push(`- recovery_decision_reason: ${truncate(item.sop_recovery_decision.reason, 220)}`);
    lines.push(`- recovery_decision_ref: ${item.sop_recovery_decision.ref}`);
  }
  appendReusedSkillCoverageLines(lines, item.reused_skill_coverage);
  appendDraftSopReadinessLines(lines, item.draft_sop_readiness);
  if (item.review_inbox_decision) {
    lines.push(`- review_inbox_decision: ${item.review_inbox_decision.status}`);
    lines.push(`- review_inbox_decision_reason: ${truncate(item.review_inbox_decision.reason, 220)}`);
    lines.push(`- review_inbox_decision_ref: ${item.review_inbox_decision.ref}`);
  }
  if (item.review_inbox_duplicate_group) {
    lines.push(`- review_inbox_duplicates: ${item.review_inbox_duplicate_group.duplicate_count}`);
    lines.push(`- review_inbox_duplicate_refs: ${item.review_inbox_duplicate_group.duplicate_refs.join(", ") || "none"}`);
  }
  if (item.focus_action_chain && item.focus_action_chain.length > 0) {
    lines.push(`- focus_action_chain: ${item.focus_action_chain.map((step) => `${step.label}[${step.effect}]`).join(" -> ")}`);
  }
  if (item.title) lines.push(`- title: ${truncate(item.title, 220)}`);
  if (item.summary) lines.push(`- summary: ${truncate(item.summary, 260)}`);
  if (item.source_ref) lines.push(`- source_ref: ${item.source_ref}`);
  if (item.updated_at) lines.push(`- updated_at: ${item.updated_at}`);
  else if (item.created_at) lines.push(`- created_at: ${item.created_at}`);
  return lines.join("\n");
}

function appendReusedSkillCoverageLines(
  lines: string[],
  coverage: ReusedSkillCoverageBacklogSummary | undefined
): void {
  if (!coverage) return;
  lines.push(`- reused_skill_coverage: ${coverage.status}`);
  lines.push(`- coverage_sop: ${coverage.sop_id}`);
  if (coverage.current_duplicate_skill_ref) {
    lines.push(`- coverage_current_duplicate: ${coverage.current_duplicate_skill_ref}`);
  }
  if (coverage.recorded_duplicate_skill_refs.length > 0) {
    lines.push(`- coverage_recorded_duplicates: ${coverage.recorded_duplicate_skill_refs.slice(0, 3).join(", ")}`);
  }
  if (coverage.missing_skill_refs.length > 0) {
    lines.push(`- coverage_missing_skills: ${coverage.missing_skill_refs.slice(0, 3).join(", ")}`);
  }
}

function focusActionChainField(value: unknown): FocusActionChainStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value
    .map((item) => {
      if (!isRecord(item)) return null;
      const label = getString(item.label);
      const effect = getString(item.effect);
      if (!label || !effect) return null;
      const step: FocusActionChainStep = { label, effect };
      const reason = getString(item.reason);
      if (reason) step.reason = reason;
      return step;
    })
    .filter((item): item is FocusActionChainStep => item !== null);
  return steps.length > 0 ? steps : undefined;
}

function appendSelectedSkillOutcomeLines(
  lines: string[],
  outcome: OpportunityBacklogItem["selected_skill_outcome"] | undefined
): void {
  if (!outcome) return;
  lines.push(`- selected_skill: ${outcome.skill_name}`);
  lines.push(`- selected_skill_ref: ${outcome.instructions_ref}`);
  lines.push(`- selected_skill_completion: ${outcome.completion_status}`);
  lines.push(`- selected_skill_verification: ${outcome.verification_status}`);
  lines.push(`- selected_skill_verified: ${outcome.verified}`);
  lines.push(`- selected_skill_verdict: ${outcome.verdict}`);
  if (outcome.context_manifest_ref) lines.push(`- selected_skill_context_manifest: ${outcome.context_manifest_ref}`);
  if (outcome.completion_report_ref) lines.push(`- selected_skill_completion_report: ${outcome.completion_report_ref}`);
  if (outcome.final_response_ref) lines.push(`- selected_skill_final_response: ${outcome.final_response_ref}`);
  if (outcome.use_count !== null) lines.push(`- selected_skill_use_count: ${outcome.use_count}`);
}

function appendSelectedSkillDriftLines(
  lines: string[],
  drift: OpportunityBacklogItem["selected_skill_drift"] | undefined
): void {
  if (!drift) return;
  lines.push(`- selected_skill_drift: ${drift.id}`);
  lines.push(`- drift_skill: ${drift.skill_name}`);
  lines.push(`- drift_skill_ref: ${drift.instructions_ref}`);
  lines.push(`- drift_attention_count: ${drift.attention_count}`);
  lines.push(`- drift_failed_count: ${drift.failed_count}`);
  lines.push(`- drift_latest_attention_outcome: ${drift.latest_attention_outcome_ref}`);
  lines.push(`- drift_completion_report: ${drift.latest_completion_report_ref}`);
  if (drift.use_count !== null) lines.push(`- drift_use_count: ${drift.use_count}`);
}

function appendDraftSopReadinessLines(
  lines: string[],
  readiness: DraftSopReadinessBacklogSummary | undefined
): void {
  if (!readiness) return;
  lines.push(`- draft_sop_readiness: ${readiness.status}`);
  if (readiness.review_ref) lines.push(`- draft_review: ${readiness.review_ref}`);
  if (readiness.proposal_id) lines.push(`- draft_proposal: ${readiness.proposal_id}`);
  lines.push(`- draft_evidence_refs: ${readiness.evidence_ref_count}`);
  lines.push(`- draft_failure_signals: ${readiness.failure_signal_count}`);
  lines.push(`- draft_sop_signals: ${readiness.sop_signal_count}`);
  if (readiness.existing_sop_refs.length > 0) {
    lines.push(`- draft_related_sops: ${readiness.existing_sop_refs.slice(0, 3).join(", ")}`);
  }
  if (readiness.existing_skill_refs.length > 0) {
    lines.push(`- draft_related_skills: ${readiness.existing_skill_refs.slice(0, 3).join(", ")}`);
  }
}

function compareGovernanceItems(left: GovernanceQueueItem, right: GovernanceQueueItem): number {
  const leftTime = left.updated_at ?? left.created_at ?? "";
  const rightTime = right.updated_at ?? right.created_at ?? "";
  return rightTime.localeCompare(leftTime) || right.ref.localeCompare(left.ref);
}

async function governanceOutcomesSection(store: AgentStore): Promise<ContextSection> {
  const [memoryAcceptances, reviewExecutions] = await Promise.all([
    listGovernanceOutcomeItems(store, "memory/semantic/confirmations", memoryAcceptanceOutcomeItem),
    listGovernanceOutcomeItems(store, "autonomy/followups", reviewExecutionOutcomeItem)
  ]);
  const selected = [
    ...memoryAcceptances.slice(0, 3),
    ...reviewExecutions.slice(0, 3)
  ].sort(compareGovernanceOutcomes);

  if (selected.length === 0) {
    return {
      title: "Governance Outcomes",
      body: "No executed governance outcomes selected for this turn.",
      refs: [],
      item_count: 0
    };
  }

  return {
    title: "Governance Outcomes",
    body: [
      "Read-only recent governance outcomes. These refs summarize completed local self-evolution decisions; do not treat them as permission to repeat or mutate state.",
      `- memory_acceptances: ${memoryAcceptances.length}`,
      `- review_follow_up_executions: ${reviewExecutions.length}`,
      "",
      ...selected.map(renderGovernanceOutcomeItem)
    ].join("\n"),
    refs: selected.flatMap((item) => [item.ref, ...item.result_refs]),
    item_count: selected.length
  };
}

interface GovernanceOutcomeItem {
  kind: string;
  ref: string;
  id: string;
  status: "executed";
  result_kind?: string;
  action_kind?: string;
  title?: string;
  source_ref?: string;
  result_refs: string[];
  evidence_event_id?: string;
  executed_at?: string;
  created_at?: string;
}

async function listGovernanceOutcomeItems(
  store: AgentStore,
  rel: string,
  toItem: (ref: string, value: unknown) => GovernanceOutcomeItem | null
): Promise<GovernanceOutcomeItem[]> {
  const refs = (await store.listStateFiles(rel)).filter((ref) => ref.endsWith(".json"));
  const items: GovernanceOutcomeItem[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const item = toItem(ref, raw);
    if (item) items.push(item);
  }
  return items.sort(compareGovernanceOutcomes);
}

function memoryAcceptanceOutcomeItem(ref: string, value: unknown): GovernanceOutcomeItem | null {
  if (!isRecord(value)) return null;
  if (value.action_type !== "promote_memory_candidate" || value.status !== "executed") return null;
  const execution = isRecord(value.execution_result) ? value.execution_result : null;
  const id = getString(value.id);
  if (!id || !execution) return null;
  return {
    kind: "memory_acceptance",
    ref,
    id,
    status: "executed",
    result_kind: getString(execution.kind) ?? undefined,
    source_ref: getString(value.candidate_ref) ?? undefined,
    result_refs: collectResultRefs(execution),
    evidence_event_id: getString(execution.evidence_event_id) ?? undefined,
    executed_at: getString(value.executed_at) ?? undefined,
    created_at: getString(value.created_at) ?? undefined
  };
}

function reviewExecutionOutcomeItem(ref: string, value: unknown): GovernanceOutcomeItem | null {
  if (!isRecord(value)) return null;
  if (value.status !== "executed" || value.confirmation_required !== true || value.execution_allowed !== false) return null;
  const execution = isRecord(value.execution_result) ? value.execution_result : null;
  const action = isRecord(value.action) ? value.action : null;
  const id = getString(value.id);
  if (!id || !execution) return null;
  return {
    kind: "review_follow_up",
    ref,
    id,
    status: "executed",
    result_kind: getString(execution.kind) ?? undefined,
    action_kind: getString(value.action_kind) ?? undefined,
    title: getString(action?.title) ?? undefined,
    source_ref: getString(value.review_ref) ?? undefined,
    result_refs: collectResultRefs(execution),
    evidence_event_id: getString(execution.evidence_event_id) ?? undefined,
    executed_at: getString(value.executed_at) ?? undefined,
    created_at: getString(value.created_at) ?? undefined
  };
}

function renderGovernanceOutcomeItem(item: GovernanceOutcomeItem, index: number): string {
  const lines = [
    `### ${index + 1}. ${item.kind}: ${item.id}`,
    `- status: ${item.status}`,
    `- ref: ${item.ref}`
  ];
  if (item.result_kind) lines.push(`- result: ${item.result_kind}`);
  if (item.action_kind) lines.push(`- action: ${item.action_kind}`);
  if (item.title) lines.push(`- title: ${truncate(item.title, 220)}`);
  if (item.source_ref) lines.push(`- source_ref: ${item.source_ref}`);
  if (item.result_refs.length > 0) lines.push(`- result_refs: ${item.result_refs.slice(0, 6).join(", ")}`);
  if (item.evidence_event_id) lines.push(`- evidence_event_id: ${item.evidence_event_id}`);
  if (item.executed_at) lines.push(`- executed_at: ${item.executed_at}`);
  else if (item.created_at) lines.push(`- created_at: ${item.created_at}`);
  return lines.join("\n");
}

function collectResultRefs(record: Record<string, unknown>): string[] {
  const refs: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key.endsWith("_ref") && typeof value === "string" && value.length > 0) refs.push(value);
    if (key.endsWith("_refs") && Array.isArray(value)) {
      refs.push(...value.filter((item): item is string => typeof item === "string" && item.length > 0));
    }
  }
  return unique(refs);
}

function compareGovernanceOutcomes(left: GovernanceOutcomeItem, right: GovernanceOutcomeItem): number {
  const leftTime = left.executed_at ?? left.created_at ?? "";
  const rightTime = right.executed_at ?? right.created_at ?? "";
  return rightTime.localeCompare(leftTime) || right.ref.localeCompare(left.ref);
}

interface SelectedWorkingCheckpoint {
  ref: string;
  checkpoint: {
    goal: string;
    current_step: string;
    known_constraints: string[];
    recent_evidence_refs: string[];
    open_questions: string[];
    next_action: string;
  };
}

async function readLatestWorkingCheckpoint(store: AgentStore): Promise<SelectedWorkingCheckpoint | null> {
  const current = await readWorkingCheckpoint(store, "memory/working/current.json");
  if (current) return current;

  const refs = (await store.listStateFiles("memory/working"))
    .filter((ref) => ref.endsWith(".json"))
    .filter((ref) => ref !== "memory/working/current.json")
    .sort()
    .reverse();
  for (const ref of refs) {
    const checkpoint = await readWorkingCheckpoint(store, ref);
    if (checkpoint) return checkpoint;
  }
  return null;
}

async function readWorkingCheckpoint(store: AgentStore, ref: string): Promise<SelectedWorkingCheckpoint | null> {
  const raw = await store.readStateJson<unknown>(ref);
  const parsed = workingCheckpointSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    ref,
    checkpoint: parsed.data
  };
}

function workingCheckpointSection(snapshot: TurnSnapshot): ContextSection {
  const working = isRecord(snapshot.working_context) ? snapshot.working_context : {};
  const checkpoint = isRecord(working.checkpoint_record) ? working.checkpoint_record : null;
  const checkpointRef = getString(working.checkpoint_ref);
  if (!checkpoint || !checkpointRef) {
    return {
      title: "Working Checkpoint",
      body: "No previous working checkpoint selected for this turn.",
      refs: [],
      item_count: 0
    };
  }

  const knownConstraints = getStringArray(checkpoint.known_constraints).slice(0, 8);
  const evidenceRefs = getStringArray(checkpoint.recent_evidence_refs).slice(0, 8);
  const openQuestions = getStringArray(checkpoint.open_questions).slice(0, 5);
  return {
    title: "Working Checkpoint",
    body: [
      "Latest bounded local working checkpoint. Use it as continuity context, not as proof that work is done.",
      `- ref: ${checkpointRef}`,
      `- goal: ${truncate(getString(checkpoint.goal) ?? "unknown", 500)}`,
      `- current_step: ${truncate(getString(checkpoint.current_step) ?? "unknown", 300)}`,
      `- next_action: ${truncate(getString(checkpoint.next_action) ?? "unknown", 500)}`,
      "",
      "Known constraints:",
      ...(knownConstraints.length > 0 ? knownConstraints.map((item) => `- ${truncate(item, 260)}`) : ["- none"]),
      "",
      "Recent evidence refs:",
      ...(evidenceRefs.length > 0 ? evidenceRefs.map((ref) => `- ${ref}`) : ["- none"]),
      "",
      "Open questions:",
      ...(openQuestions.length > 0 ? openQuestions.map((item) => `- ${truncate(item, 260)}`) : ["- none"])
    ].join("\n"),
    refs: [checkpointRef],
    item_count: 1
  };
}

async function completionVerificationSection(store: AgentStore): Promise<ContextSection> {
  const reports = await readLatestCompletionVerificationSummaries(store, 3);
  if (reports.length === 0) {
    return {
      title: "Completion Verification",
      body: "No recent completion verification reports selected for this turn.",
      refs: [],
      item_count: 0
    };
  }

  return {
    title: "Completion Verification",
    body: [
      "Read-only recent harness completion verification. Use this as orientation about prior done/not_done claims; do not treat it as replay authority or proof for the current task.",
      "",
      ...reports.flatMap((report, index) => renderCompletionVerificationItem(report, index))
    ].join("\n").trimEnd(),
    refs: unique(
      reports.flatMap((report) => [report.report_ref, report.envelope_ref, report.final_response_ref ?? ""]).filter(Boolean)
    ),
    item_count: reports.length
  };
}

function renderCompletionVerificationItem(
  item: CompletionVerificationHistorySummary,
  index: number
): string[] {
  const failedOrWarningChecks = [...item.failed_checks, ...item.warning_checks].slice(0, 5);
  return [
    `### ${index + 1}. ${item.id}`,
    `- ref: ${item.report_ref}`,
    `- completion_status: ${item.completion_status}`,
    `- verification_status: ${item.verification_status}`,
    `- verified: ${item.verified}`,
    `- summary: ${truncate(item.summary, 500)}`,
    `- final_response_ref: ${item.final_response_ref ?? "none"}`,
    `- claimed_verification_refs: ${item.claimed_verification_ref_count}`,
    `- observation_refs: ${item.observation_ref_count}`,
    "",
    "Failed or warning checks:",
    ...(failedOrWarningChecks.length > 0
      ? failedOrWarningChecks.map((check) => `- ${check.id}: ${check.status} - ${truncate(check.summary, 260)}`)
      : ["- none"]),
    ""
  ];
}

function episodeRecall(snapshot: TurnSnapshot): string {
  const hits = getRecordArray(snapshot.recall_context.memory_hits);
  if (hits.length === 0) return "No episode recall selected for this turn.";

  return hits.map((hit, index) => {
    const refs = getStringArray(hit.artifact_refs).slice(0, 5);
    const score = typeof hit.score === "number" ? `\n- score: ${hit.score}` : "";
    const createdAt = typeof hit.created_at === "string" ? `\n- created_at: ${hit.created_at}` : "";
    return [
      `### ${index + 1}. ${getString(hit.id) ?? "episode"}`,
      `- session_id: ${getString(hit.session_id) ?? "unknown"}`,
      `- kind: ${getString(hit.kind) ?? "unknown"}${score}${createdAt}`,
      `- summary: ${truncate(getString(hit.summary) ?? "", 500)}`,
      `- artifact_refs: ${refs.length > 0 ? refs.join(", ") : "none"}`
    ].join("\n");
  }).join("\n\n");
}

function episodeRecallRefs(snapshot: TurnSnapshot): string[] {
  return getRecordArray(snapshot.recall_context.memory_hits)
    .flatMap((hit) => getStringArray(hit.artifact_refs))
    .slice(0, 40);
}

async function episodeArchiveSection(store: AgentStore): Promise<ContextSection> {
  const archives: EpisodeArchiveRecord[] = [];
  const refs = (await store.listStateFiles("memory/archives")).filter((ref) => ref.endsWith(".json"));
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    if (isEpisodeArchive(raw)) archives.push(raw);
  }

  const selected = archives
    .sort((left, right) => right.date.localeCompare(left.date) || right.created_at.localeCompare(left.created_at))
    .slice(0, 3);

  if (selected.length === 0) {
    return {
      title: "Episode Archives",
      body: "No daily episode archives selected for this turn.",
      refs: [],
      item_count: 0
    };
  }

  return {
    title: "Episode Archives",
    body: [
      "Read-only daily episode archive summaries. Use these as long-term orientation, not as raw evidence or mutation authority.",
      "",
      ...selected.map(renderEpisodeArchiveContext)
    ].join("\n"),
    refs: selected.flatMap((archive) => [archive.archive_ref, archive.markdown_ref]),
    item_count: selected.length
  };
}

function renderEpisodeArchiveContext(archive: EpisodeArchiveRecord, index: number): string {
  const sessions = archive.sessions.slice(0, 3);
  const recent = archive.recent_events.slice(-5);
  return [
    `### ${index + 1}. ${archive.date}`,
    `- archive_ref: ${archive.archive_ref}`,
    `- markdown_ref: ${archive.markdown_ref}`,
    `- events: ${archive.event_count}`,
    `- sessions: ${archive.session_count}`,
    `- kinds: ${renderCountMap(archive.kind_counts)}`,
    `- first_event_at: ${archive.first_event_at ?? "unknown"}`,
    `- last_event_at: ${archive.last_event_at ?? "unknown"}`,
    "",
    "Top sessions:",
    ...(sessions.length > 0
      ? sessions.map((session) => [
        `- ${session.session_id}: ${session.event_count} events; kinds=${renderCountMap(session.kind_counts)}; summary=${truncate(session.summaries[0] ?? "", 180) || "none"}; refs=${session.artifact_refs.slice(0, 3).join(", ") || "none"}`
      ].join(""))
      : ["- none"]),
    "",
    "Recent archived events:",
    ...(recent.length > 0
      ? recent.map((event) => `- ${event.id} (${event.kind}, ${event.session_id}): ${truncate(event.summary, 220)}`)
      : ["- none"])
  ].join("\n");
}

function isEpisodeArchive(value: unknown): value is EpisodeArchiveRecord {
  if (!isRecord(value)) return false;
  return value.version === 1
    && typeof value.date === "string"
    && typeof value.source_ref === "string"
    && typeof value.archive_ref === "string"
    && typeof value.markdown_ref === "string"
    && typeof value.created_at === "string"
    && typeof value.event_count === "number"
    && typeof value.session_count === "number"
    && isRecord(value.kind_counts)
    && Array.isArray(value.sessions)
    && Array.isArray(value.recent_events);
}

function renderCountMap(counts: Record<string, unknown>): string {
  const entries = Object.entries(counts)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? entries.map(([key, count]) => `${key}=${count}`).join(", ") : "none";
}

function renderCompactReviewTickReasonCounts(counts: Record<string, number>): string {
  const labels: Record<string, string> = {
    duplicate_noncanonical: "duplicate",
    executed_status: "executed",
    terminal_decision_completed: "completed",
    terminal_decision_retired: "retired"
  };
  const entries = Object.entries(counts)
    .map(([key, count]) => [labels[key] ?? key, count] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? entries.map(([key, count]) => `${key}=${count}`).join(",") : "none";
}

async function selectedSkills(store: AgentStore, snapshot: TurnSnapshot): Promise<string> {
  const refs = getStringArray(snapshot.recall_context.skill_refs);
  if (refs.length === 0) return "No skill selected for this turn.";

  const hits = getRecordArray(snapshot.recall_context.skill_hits);
  const blocks = [];
  for (const [index, ref] of refs.entries()) {
    const hit = hits.find((item) => getString(item.instructions_ref) === ref);
    const score = getNumber(hit?.score);
    const baseScore = getNumber(hit?.base_score);
    const quality = getRecord(hit?.quality);
    const metadata = [
      `### ${index + 1}. ${getString(hit?.name) ?? ref.split("/").at(-2) ?? ref}`,
      `- instructions_ref: ${ref}`,
      `- metadata_ref: ${getString(hit?.metadata_ref) ?? "unknown"}`,
      `- source: ${getString(hit?.source) ?? "unknown"}`,
      `- score: ${score ?? "unknown"}`,
      ...(baseScore !== null && baseScore !== score ? [`- base_score: ${baseScore}`] : []),
      ...selectedSkillQualityLines(quality),
      "- boundary: selected procedure context only; usage telemetry is recorded by the harness after the run"
    ].join("\n");
    blocks.push([metadata, refBlock(ref, await readArtifactText(store, ref, 2400))].join("\n\n"));
  }
  return blocks.join("\n\n");
}

function selectedSkillQualityLines(quality: Record<string, unknown> | null): string[] {
  if (!quality) return [];
  const outcomeCount = getNumber(quality.outcome_count);
  if (outcomeCount === null || outcomeCount <= 0) return [];
  const lines = [
    `- outcome_quality: outcomes=${outcomeCount}; passed=${getNumber(quality.passed_count) ?? 0}; attention=${getNumber(quality.attention_count) ?? 0}; adjustment=${getNumber(quality.score_adjustment) ?? 0}`
  ];
  const latest = getString(quality.latest_outcome_ref);
  if (latest) lines.push(`- latest_outcome_ref: ${latest}`);
  return lines;
}

async function stableCore(store: AgentStore): Promise<string> {
  return [
    refBlock("core/soul.md", await store.readRepoText("core/soul.md", 1800)),
    refBlock("core/memory.md", await store.readRepoText("core/memory.md", 1500)),
    refBlock("docs/RUNTIME_CONTRACT.md", await store.readRepoText("docs/RUNTIME_CONTRACT.md", 2200))
  ].join("\n\n");
}

function disciplineRefs(snapshot: TurnSnapshot): string[] {
  const discipline = snapshot.working_context.discipline;
  return isQueryTodoDiscipline(discipline) ? [discipline.query_ref, discipline.todo_ref] : [];
}

function isQueryTodoDiscipline(value: unknown): value is { mode: "query_todo"; query_ref: string; todo_ref: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.mode === "query_todo"
    && typeof record.query_ref === "string"
    && typeof record.todo_ref === "string";
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function reusedSkillCoverageSopRef(
  record: Record<string, unknown>,
  action: Record<string, unknown> | null
): string | null {
  return getString(record.sop_id)
    ?? getString(record.sop_ref)
    ?? getStringArray(record.required_refs).find(isSopDraftRef)
    ?? getStringArray(action?.required_refs).find(isSopDraftRef)
    ?? null;
}

function draftSopReadinessReviewRef(record: Record<string, unknown>): string | null {
  return getString(record.latest_review_ref)
    ?? getString(record.review_ref)
    ?? getString(record.first_review_ref)
    ?? null;
}

function isSopDraftRef(ref: string): boolean {
  return ref.startsWith("sop/drafts/") || /^sop_[A-Za-z0-9_-]+$/.test(ref);
}

function uniqueStringArray(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringifyOptionalBoolean(value: boolean | null): string {
  return value === null ? "unknown" : String(value);
}

function isAcceptedSemanticMemory(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && value.action_type === "semantic_memory"
    && value.status === "accepted"
    && typeof value.id === "string"
    && typeof value.summary === "string"
    && typeof value.content === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars).trimEnd()}...` : value;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function refBlock(ref: string, body: string): string {
  return `[${ref}]\n${body.trim() || "Not found."}`;
}

async function readArtifactText(store: AgentStore, ref: string, maxChars: number): Promise<string> {
  const stateText = await store.readStateText(ref, maxChars);
  if (stateText) return stateText;
  return store.readRepoText(ref, maxChars);
}

async function readStopSignal(store: AgentStore): Promise<Record<string, unknown> | null> {
  const signal = await store.readStateJson<Record<string, unknown>>("autonomy/runs/pause_signal.json");
  if (!signal || signal.status !== "active") return null;
  return signal;
}

function outputContract(): string {
  return `Return only a JSON object matching ModelActionEnvelope. This is a json-only response contract.

Required top-level shape:
{
  "summary": "short intent summary",
  "actions": [
    {
      "type": "respond | use_tool | delegate_agent | update_working_state | record_evidence | propose_sop | propose_memory | request_audit | pause_autonomy",
      "rationale": "why this action is needed",
      "payload": {}
    }
  ],
  "completion_claim": {
    "status": "not_done | done | blocked",
    "verification_refs": []
  }
}

Available tools:
${renderCoreToolExamples()}

Harness policy:
- file.write_repo is only for requested repo edits.
- command.run must declare side_effect_level, timeout_ms, and max_output_chars.
- Use repo.search or file.read before source-file claims.
- A done completion claim is verified by the harness against final response and tool evidence.
- Failed write/run tool results block verified completion.
- respond.payload.markdown defaults to Simplified Chinese unless asked otherwise; keep commands, code, JSON fields, protocols, and quotes literal.

Available delegated agent action:
{
  "type": "delegate_agent",
  "rationale": "need a bounded critique or analysis subtask",
  "payload": {
    "task": "...",
    "context": "all relevant constraints and evidence"
  }
}

State-only harness actions:
{
  "type": "record_evidence",
  "rationale": "record a bounded note about the current run",
  "payload": {
    "summary": "...",
    "markdown": "...",
    "artifact_refs": ["optional existing refs"]
  }
}
{
  "type": "update_working_state",
  "rationale": "checkpoint current progress",
  "payload": {
    "checkpoint": {
      "goal": "...",
      "current_step": "...",
      "known_constraints": ["..."],
      "recent_evidence_refs": ["optional existing evidence ids or refs"],
      "open_questions": ["..."],
      "next_action": "..."
    }
  }
}

State-only harness actions write selected state evidence only; they do not mutate the repo, active vault, external systems, or verify done claims.

State-only governance actions:
{
  "type": "propose_memory",
  "rationale": "capture a candidate memory for later review",
  "payload": {
    "scope": "local",
    "summary": "...",
    "content": "...",
    "artifact_refs": ["optional existing refs"]
  }
}
{
  "type": "request_audit",
  "rationale": "ask the harness to record an audit request",
  "payload": {
    "target_type": "memory | sop | skill | governance",
    "target_ref": "...",
    "question": "...",
    "criteria": ["..."],
    "artifact_refs": ["optional existing refs"]
  }
}

The harness records propose_memory as a candidate and request_audit as a state-only request.
They do not update durable memory, core files, SOP status, skills, confirmations, or the active vault.

State-only stop signal:
{
  "type": "pause_autonomy",
  "rationale": "request a pause for future autonomous exploration",
  "payload": {
    "reason": "...",
    "scope": "autonomous_exploration",
    "resume_hint": "...",
    "artifact_refs": ["optional existing refs"]
  }
}

The harness records pause_autonomy as an active stop signal for later context assembly.
It does not stop the current explicit task, resident service, IM channel, or local operator commands.

For a data task with no Tool Observations, call use_tool first. After Tool Observations are present, include a respond action:
{
  "type": "respond",
  "rationale": "return the verified result",
  "payload": {
    "markdown": "..."
  }
}

For a live self-growth smoke run, include one propose_sop action. Its payload must contain:
{
  "title": "...",
  "trigger": "at least 40 characters describing when this SOP should run",
  "procedure": ["..."],
  "required_tools": ["..."],
  "verification": "at least 30 characters describing how the harness or next run verifies success",
  "failure_modes": [
    "include at least one concrete failure mode",
    "include at least one explicit revise, retire, archive, or rollback rule"
  ]
}

If Selected Skills contains a skill, use it as the preferred procedure for this turn. The harness records usage telemetry; do not claim that telemetry was written.

If Query/Todo Discipline is active, treat the loaded query.md as the authoritative user request and todo.md as the active checklist. Use file.write_state to update todo.md when the plan or checklist status changes. Before a done response, include a concise supervisor checklist in the respond markdown.

Do not claim that a skill is promoted. The harness decides promotion after autonomous audit.`;
}
