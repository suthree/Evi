import {
  completionVerificationReportSchema,
  type BudgetHint,
  type CompletionVerificationReport,
  type GrowthValue,
  type Opportunity
} from "./schemas.js";
import {
  listContextPressure,
  type ContextPressureOperatorGuidance,
  type ContextPressureSummary
} from "./context_pressure.js";
import {
  getContextHealth,
  type ContextHealthIssue,
  type ContextHealthOperatorGuidance
} from "./context_health.js";
import {
  getArchiveHealth,
  type ArchiveHealthIssue
} from "./archive_health.js";
import {
  getSkillRegistryHealth,
  type SkillRegistryHealthIssue
} from "./skill_registry_health.js";
import {
  hasWorkingCheckpointBlockedSignal,
  listWorkingCheckpoints,
  needsWorkingCheckpointAttention,
  type WorkingCheckpointSummary
} from "./working_checkpoints.js";
import {
  getServiceHealth,
  type ServiceHealthResult
} from "./service_health.js";
import type { SkillResolverLike } from "./skill_resolver.js";
import {
  inspectSopEvolutionConfirmationGate,
  type SopEvolutionConfirmationGate
} from "./sop_confirmation_readiness.js";
import {
  latestSopRecoveryDecision,
  readSopRecoveryDecisions,
  type SopRecoveryDecisionWithRef
} from "./sop_recovery_decisions.js";
import {
  latestReviewInboxDecision,
  readReviewInboxDecisions,
  suppressReviewInboxDecision,
  type ReviewInboxDecisionWithRef
} from "./review_inbox_decisions.js";
import {
  annotateReviewInboxDuplicates,
  latestReviewInboxDuplicateDecision,
  type ReviewInboxDuplicateGroup
} from "./review_inbox_duplicates.js";
import {
  getDraftSopReadiness,
  type DraftSopReadinessStatus
} from "./draft_sop_readiness.js";
import {
  getReusedSkillCoverage,
  type ReusedSkillCoverageStatus
} from "./reused_skill_coverage.js";
import {
  getSopEvolutionLedger,
  type OperatorNextCommand,
  type SopEvolutionLedgerEntry
} from "./sop_evolution_ledger.js";
import {
  listPipelineRuns,
  type PipelineHistorySummary
} from "./pipeline_history.js";
import {
  listLiveRunTraces,
  type LiveRunRepoWriteGuardSummary,
  type LiveRunTraceSummary
} from "./live_run_trace.js";
import {
  listSelectedSkillDrifts,
  type SelectedSkillDriftSummary
} from "./selected_skill_outcome_history.js";
import {
  listSelfEvolutionGaps,
  type SelfEvolutionGap
} from "./self_evolution_gaps.js";
import {
  listSelfEvolutionIterations,
  type SelfEvolutionIterationContract
} from "./self_evolution_iterations.js";
import { AgentStore } from "./store.js";
import { newId, utcNow } from "./ids.js";

const OPPORTUNITIES_REF = "autonomy/opportunities.jsonl";
const OPPORTUNITY_DECISIONS_REF = "autonomy/opportunity-decisions.jsonl";
const MAX_COMPLETION_VERIFICATION_ITEMS = 10;
const MAX_PIPELINE_BACKLOG_SCAN = 50;
const MAX_PIPELINE_BACKLOG_ITEMS = 10;
const MAX_REPO_WRITE_GUARD_ITEMS = 5;
const MAX_SELECTED_SKILL_OUTCOME_SCAN = 50;
const MAX_SELECTED_SKILL_OUTCOME_ITEMS = 10;
const MAX_CONTEXT_HEALTH_ITEMS = 5;
const MAX_CONTEXT_PRESSURE_ITEMS = 5;
const MAX_WORKING_CHECKPOINT_ITEMS = 5;
const MAX_ARCHIVE_HEALTH_ITEMS = 5;
const MAX_SKILL_REGISTRY_HEALTH_ITEMS = 5;
const MAX_SELF_EVOLUTION_GAP_ITEMS = 10;
const CORE_BASIC_ITERATION_LAYERS = new Set<SelfEvolutionIterationContract["layer"]>([
  "core_runtime",
  "basic_entrypoint"
]);
const ACT_NEXT_MCP_SERVER_URL = "http://localhost:18060/mcp";
const CREATOR_METRICS_BROWSER_SESSION_NAME = "runtime-creator-metrics";
const SUPPORTED_ACT_NEXT_SELF_EVOLUTION_SLICES = new Set([
  "active_exploration_source_quality_gate",
  "external_publish_preflight_contract",
  "post_publish_feedback_capture_contract",
  "creator_metrics_capture_readiness_loop",
  "feedback_strategy_next_generation_ready",
  "feedback_strategy_preview_review",
  "feedback_refresh_route_review"
]);

export type OpportunityBacklogKind =
  | "service_health"
  | "autonomy_pause"
  | "review_confirmation"
  | "memory_confirmation"
  | "review_inbox"
  | "memory_candidate"
  | "completion_verification"
  | "archive_health"
  | "skill_registry_health"
  | "context_health"
  | "context_pressure"
  | "working_checkpoint"
  | "pipeline_run"
  | "repo_write_guard"
  | "selected_skill_drift"
  | "selected_skill_outcome"
  | "self_evolution_gap"
  | "sop_evolution_chain"
  | "open_opportunity";

export interface OpportunityBacklogItem {
  id: string;
  kind: OpportunityBacklogKind;
  ref: string;
  status: string;
  title: string;
  summary: string;
  score: number;
  score_reasons: string[];
  growth_value: GrowthValue;
  budget_hint: BudgetHint;
  next_step: string;
  decision_command?: string;
  action_chain?: OpportunityActionChainStep[];
  next_command?: OperatorNextCommand;
  sop_evolution_gate?: SopEvolutionConfirmationGate;
  sop_recovery_decision?: SopRecoveryDecisionWithRef;
  draft_sop_readiness?: DraftSopReadinessBacklogSummary;
  reused_skill_coverage?: ReusedSkillCoverageBacklogSummary;
  service_health?: ServiceHealthBacklogSummary;
  archive_health?: ArchiveHealthBacklogSummary;
  skill_registry_health?: SkillRegistryHealthBacklogSummary;
  context_health?: ContextHealthBacklogSummary;
  context_pressure?: ContextPressureBacklogSummary;
  working_checkpoint?: WorkingCheckpointBacklogSummary;
  pipeline_run?: PipelineRunBacklogSummary;
  repo_write_guard?: RepoWriteGuardBacklogSummary;
  selected_skill_drift?: SelectedSkillDriftSummary;
  selected_skill_outcome?: SelectedSkillOutcomeBacklogSummary;
  self_evolution_gap?: SelfEvolutionGapBacklogSummary;
  completion_verification?: CompletionVerificationBacklogSummary;
  opportunity_decision?: OpportunityDecisionWithRef;
  review_inbox_decision?: ReviewInboxDecisionWithRef;
  review_inbox_duplicate_group?: ReviewInboxDuplicateGroup;
  action_kind?: string;
  source_ref?: string;
  created_at?: string;
  updated_at?: string;
}

export type OpportunityActionChainEffect =
  | "read_only"
  | "state_decision"
  | "local_write"
  | "runtime_execution"
  | "service_control";

export interface OpportunityActionChainStep {
  label: string;
  command: string;
  effect: OpportunityActionChainEffect;
  reason?: string;
}

export interface DraftSopReadinessBacklogSummary {
  review_ref: string | null;
  proposal_id: string | null;
  proposal_title: string | null;
  proposal_type: string | null;
  status: DraftSopReadinessStatus;
  failure_signal_count: number;
  sop_signal_count: number;
  evidence_ref_count: number;
  required_ref_count: number;
  existing_sop_refs: string[];
  existing_skill_refs: string[];
  next_step: string;
}

export interface ReusedSkillCoverageBacklogSummary {
  sop_id: string;
  sop_ref: string;
  status: ReusedSkillCoverageStatus;
  current_duplicate_skill_ref: string | null;
  recorded_duplicate_skill_refs: string[];
  missing_skill_refs: string[];
  next_step: string;
}

export interface ServiceHealthBacklogSummary {
  status: ServiceHealthResult["status"];
  runtime_state: string;
  heartbeat_freshness: ServiceHealthResult["service"]["heartbeat_freshness"];
  heartbeat_age_ms: number | null;
  heartbeat_updated_at: string | null;
  runtime_commit: string | null;
  runtime_branch: string | null;
  runtime_dirty: boolean | null;
  repo_commit: string | null;
  repo_branch: string | null;
  deployment_status: ServiceHealthResult["service"]["deployment"]["status"];
  deployment_reason: string;
  restart_command: string;
  review_tick_state: string;
  review_tick_enabled: boolean;
  content_daily_state: string;
  content_daily_enabled: boolean;
  content_daily_last_job_status: string | null;
  content_daily_last_effective_job_status: string | null;
  content_daily_last_job_count: number | null;
  content_daily_last_skip_reason: string | null;
  content_daily_current_step: string | null;
  content_daily_current_step_status: string | null;
  content_daily_current_step_summary: string | null;
  content_daily_current_step_age_ms: number | null;
  content_daily_current_step_freshness: string | null;
  content_daily_current_track_id: string | null;
  content_daily_current_job_ref: string | null;
  content_daily_current_run_ref: string | null;
  content_daily_updated_at: string | null;
  content_daily_error: string | null;
  content_feedback_refresh_state: string;
  content_feedback_refresh_enabled: boolean;
  content_feedback_refresh_last_queue_count: number | null;
  content_feedback_refresh_last_due_count: number | null;
  content_feedback_refresh_next_due_at: string | null;
  content_feedback_refresh_updated_at: string | null;
  content_feedback_refresh_error: string | null;
  content_creator_metrics_state: string;
  content_creator_metrics_enabled: boolean;
  content_creator_metrics_last_queue_count: number | null;
  content_creator_metrics_last_captured_count: number | null;
  content_creator_metrics_last_blocked_count: number | null;
  content_creator_metrics_last_failed_count: number | null;
  content_creator_metrics_updated_at: string | null;
  content_creator_metrics_error: string | null;
  autonomy_pause_active: boolean;
  inspect_command: string;
}

export interface ArchiveHealthBacklogSummary {
  issue_kind: ArchiveHealthIssue["kind"];
  issue_status: ArchiveHealthIssue["status"];
  date: string | null;
  archive_ref: string | null;
  source_event_count: number | null;
  archive_event_count: number | null;
  source_last_event_at: string | null;
  archive_last_event_at: string | null;
  reason: string;
  inspect_command: string;
  refresh_command: string | null;
}

export interface SkillRegistryHealthBacklogSummary {
  issue_kind: SkillRegistryHealthIssue["kind"];
  issue_status: SkillRegistryHealthIssue["status"];
  skill_name: string | null;
  instructions_ref: string | null;
  registry_ref: string | null;
  event_ref: string | null;
  reason: string;
  inspect_command: string;
  sync_command: string | null;
  retire_event_command: string | null;
}

export interface SelectedSkillOutcomeBacklogSummary {
  skill_name: string;
  instructions_ref: string;
  metadata_ref: string | null;
  completion_status: string;
  verification_status: string;
  verified: boolean;
  verdict: string;
  context_manifest_ref: string | null;
  completion_report_ref: string | null;
  final_response_ref: string | null;
  use_count: number | null;
}

export interface SelfEvolutionGapBacklogSummary {
  gap_id: string;
  gap_ref: string;
  source: SelfEvolutionGap["source"];
  source_ref: string;
  owner_surface: string;
  proposed_slice: string;
  follow_up_kind: SelfEvolutionGap["follow_up_kind"];
  evidence_refs: string[];
  evidence_ref_count: number;
  acceptance: string[];
  acceptance_count: number;
  non_goals: string[];
  non_goal_count: number;
  inspect_command: string;
  not_before_at?: string;
  verification_commands: string[];
  boundary: string;
}

export interface PipelineRunBacklogSummary {
  run_id: string;
  pipeline_id: string;
  status: PipelineHistorySummary["status"];
  pipeline_ref: string;
  checkpoint_ref: string;
  blocked_stage_id: string | null;
  failed_stage_ids: string[];
  stage_status_counts: PipelineHistorySummary["stage_status_counts"];
  evidence_ref_count: number;
  final_response_ref: string | null;
  query_ref: string | null;
  todo_ref: string | null;
  inspect_command: string;
  resume_command: string;
}

export interface RepoWriteGuardBacklogSummary {
  trace_ref: string;
  completion_id: string;
  session_id: string;
  turn_id: string;
  event_id: string;
  path: string;
  before_status: string;
  after_status: string;
  before_changed_file_count: number;
  after_changed_file_count: number;
  changed_file_count_delta: number;
  preexisting_dirty: boolean;
  target_changed_after_write: boolean;
  inspect_command: string;
}

export interface CompletionVerificationDiagnosticSummary {
  round: number;
  stage: string;
  failure_kind: string;
  diagnostic_ref: string;
  response_ref: string | null;
  error_preview: string;
}

export interface CompletionVerificationBacklogSummary {
  report_ref: string;
  completion_id: string;
  session_id: string;
  turn_id: string;
  completion_status: CompletionVerificationReport["completion_status"];
  verification_status: CompletionVerificationReport["verification_status"];
  failed_check_ids: string[];
  warning_check_ids: string[];
  model_diagnostic_count: number;
  model_diagnostics: CompletionVerificationDiagnosticSummary[];
  inspect_command: string;
  trace_command: string;
}

export interface ContextPressureBacklogSummary {
  session_id: string;
  turn_id: string;
  context_ref: string;
  status: ContextPressureSummary["status"];
  total_chars: number;
  largest_section_title: string;
  largest_section_chars: number;
  largest_section_share: number;
  pressure_section_count: number;
  inspect_command: string;
  operator_guidance: ContextPressureOperatorGuidance;
}

export interface ContextHealthBacklogSummary {
  issue_kind: ContextHealthIssue["kind"];
  issue_status: ContextHealthIssue["status"];
  manifest_ref: string | null;
  context_ref: string | null;
  session_id: string | null;
  turn_id: string | null;
  reason: string;
  inspect_command: string;
  operator_guidance: ContextHealthOperatorGuidance;
}

export interface WorkingCheckpointBacklogSummary {
  checkpoint_ref: string;
  current_step: string;
  next_action: string;
  known_constraint_count: number;
  recent_evidence_ref_count: number;
  open_question_count: number;
  open_questions: string[];
  evidence_event_refs: string[];
  inspect_command: string;
}

export interface OpportunityBacklogResult {
  created_at: string;
  count: number;
  item_refs: string[];
  items: OpportunityBacklogItem[];
}

export type OpportunityDecisionStatus = "open" | "deferred" | "completed" | "retired";

export interface OpportunityDecisionActionChainSnapshotStep {
  label: string;
  effect: OpportunityActionChainEffect;
  reason?: string;
}

export interface OpportunityDecisionRecord {
  id: string;
  opportunity_id: string;
  opportunity_ref: string;
  opportunity_kind?: OpportunityBacklogKind;
  status: OpportunityDecisionStatus;
  previous_status: string;
  reason: string;
  action_chain_snapshot?: OpportunityDecisionActionChainSnapshotStep[];
  created_at: string;
}

export type OpportunityDecisionWithRef = OpportunityDecisionRecord & { ref: string };

export interface OpportunityDecisionResult {
  action: "decide-opportunity";
  opportunity_id: string;
  opportunity_ref: string;
  previous_status: string;
  status: OpportunityDecisionStatus;
  reason: string;
  decision_ref: string;
  decision: OpportunityDecisionRecord;
}

export async function getOpportunityBacklog(
  store: AgentStore,
  args: { limit?: number; vaultRoot?: SkillResolverLike } = {}
): Promise<OpportunityBacklogResult> {
  await store.ensureLayout();
  const opportunityDecisions = await readOpportunityDecisions(store);
  const selectedSkillDriftItems = await readSelectedSkillDriftItems(store);
  const driftSkillNames = new Set(
    selectedSkillDriftItems
      .map((item) => item.selected_skill_drift?.skill_name)
      .filter((skillName): skillName is string => Boolean(skillName))
  );
  const items = [
    ...(await readServiceHealthItems(store)),
    ...(await readAutonomyPause(store)),
    ...(await listReviewConfirmationItems(store, args.vaultRoot ?? "vault")),
    ...(await listJsonItems(store, "memory/semantic/confirmations", memoryConfirmationItem)),
    ...(await listReviewInboxItems(store, args.vaultRoot ?? "vault")),
    ...(await listJsonItems(store, "memory/semantic/candidates", memoryCandidateItem)),
    ...(await readCompletionVerificationItems(store)),
    ...(await readArchiveHealthItems(store)),
    ...(await readSkillRegistryHealthItems(store, args.vaultRoot ?? "vault")),
    ...selectedSkillDriftItems,
    ...(await readSelectedSkillOutcomeItems(store, driftSkillNames)),
    ...(await readWorkingCheckpointItems(store)),
    ...(await readContextHealthItems(store)),
    ...(await readContextPressureItems(store)),
    ...(await readPipelineRunItems(store)),
    ...(await readRepoWriteGuardItems(store)),
    ...(await readSopEvolutionChainItems(store, args.vaultRoot ?? "vault")),
    ...(await readSelfEvolutionGapItems(store)),
    ...(await readOpenOpportunities(store))
  ]
    .map((item) => applyOpportunityDecision(item, opportunityDecisions))
    .filter((item): item is OpportunityBacklogItem => item !== null)
    .map(withOpportunityDecisionCommand)
    .map(withActionChain)
    .sort(compareBacklogItems);
  const limit = args.limit === undefined ? items.length : Math.max(0, args.limit);
  const selected = items.slice(0, limit);
  return {
    created_at: utcNow(),
    count: selected.length,
    item_refs: selected.map((item) => item.ref),
    items: selected
  };
}

export async function decideOpportunity(
  store: AgentStore,
  args: { opportunity: string; status: OpportunityDecisionStatus; reason: string }
): Promise<OpportunityDecisionResult> {
  await store.ensureLayout();
  const reason = args.reason.trim();
  if (!reason) throw new Error("Opportunity decision requires --reason");
  if (!isOpportunityDecisionStatus(args.status)) throw new Error(`Unsupported opportunity decision status: ${args.status}`);

  const records = await readOpportunityRecords(store);
  const record = resolveOpportunityRecord(records, args.opportunity);
  if (record) {
    if (record.original_status !== "open" && record.original_status !== "deferred") {
      throw new Error(`Opportunity decisions only support open/deferred records: ${record.ref} is ${record.original_status}`);
    }

    const decision: OpportunityDecisionRecord = {
      id: newId("opportunity_decision"),
      opportunity_id: record.id,
      opportunity_ref: record.ref,
      opportunity_kind: "open_opportunity",
      status: args.status,
      previous_status: record.current_status,
      reason,
      created_at: utcNow()
    };
    return writeOpportunityDecision(store, decision);
  }

  const backlog = await getOpportunityBacklog(store, { limit: Number.MAX_SAFE_INTEGER });
  const item = resolveOpportunityBacklogItem(backlog.items, args.opportunity);
  if (item) {
    if (!isDerivedDecidableBacklogItem(item)) {
      throw new Error(`Opportunity decisions are not supported for ${item.kind}:${item.id}; use its explicit gate instead`);
    }
    const decision: OpportunityDecisionRecord = {
      id: newId("opportunity_decision"),
      opportunity_id: item.id,
      opportunity_ref: item.ref,
      opportunity_kind: item.kind,
      status: args.status,
      previous_status: item.status,
      reason,
      ...(item.action_chain ? { action_chain_snapshot: actionChainSnapshot(item.action_chain) } : {}),
      created_at: utcNow()
    };
    return writeOpportunityDecision(store, decision);
  }

  const latestDecision = resolveLatestOpportunityDecision(await readOpportunityDecisions(store), args.opportunity);
  if (latestDecision && args.status === "open") {
    const decision: OpportunityDecisionRecord = {
      id: newId("opportunity_decision"),
      opportunity_id: latestDecision.opportunity_id,
      opportunity_ref: latestDecision.opportunity_ref,
      opportunity_kind: latestDecision.opportunity_kind,
      status: args.status,
      previous_status: latestDecision.status,
      reason,
      created_at: utcNow()
    };
    return writeOpportunityDecision(store, decision);
  }

  throw new Error(`Opportunity not found: ${args.opportunity}`);
}

async function writeOpportunityDecision(
  store: AgentStore,
  decision: OpportunityDecisionRecord
): Promise<OpportunityDecisionResult> {
  await store.appendJsonl(OPPORTUNITY_DECISIONS_REF, decision);
  const writtenDecision = (await readOpportunityDecisions(store)).find((item) => item.id === decision.id);
  const decisionRef = writtenDecision?.ref
    ?? `${OPPORTUNITY_DECISIONS_REF}#${await countJsonlRows(store, OPPORTUNITY_DECISIONS_REF)}`;
  return {
    action: "decide-opportunity",
    opportunity_id: decision.opportunity_id,
    opportunity_ref: decision.opportunity_ref,
    previous_status: decision.previous_status,
    status: decision.status,
    reason: decision.reason,
    decision_ref: decisionRef,
    decision
  };
}

async function readAutonomyPause(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const signal = await store.readStateJson<unknown>("autonomy/runs/pause_signal.json");
  if (!isRecord(signal) || signal.status !== "active") return [];
  return [buildItem({
    kind: "autonomy_pause",
    ref: "autonomy/runs/pause_signal.json",
    id: stringField(signal, "id") ?? "pause_signal",
    status: "active",
    title: "Review active autonomy pause",
    summary: stringField(signal, "reason") ?? "Autonomous exploration is paused.",
    growth_value: {
      capability_gain: 3,
      repeat_demand: 2,
      evidence_available: 5,
      urgency_or_unblock: 5,
      risk: 1,
      cost: 1
    },
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: "Inspect governance status and decide whether the pause still applies.",
    score_reasons: ["active stop signal", "blocks autonomous review tick"],
    created_at: stringField(signal, "created_at") ?? undefined
  })];
}

async function readServiceHealthItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const health = await getServiceHealth(store);
  if (!needsServiceHealthAttention(health)) return [];
  const runtime = health.service.runtime_build;
  const deployment = health.service.deployment;
  const ref = health.refs[0] ?? health.service.heartbeat_ref;
  const inspectCommand = "pnpm run runtime -- service health --target runtime";
  return [buildItem({
    kind: "service_health",
    ref,
    id: "service_health_runtime",
    status: health.status,
    title: "Inspect resident runtime service health",
    summary: [
      `health=${health.status}`,
      `runtime_state=${health.service.state}`,
      `heartbeat=${health.service.heartbeat_freshness}`,
      `deployment=${deployment.status}`,
      `runtime_dirty=${runtime?.source_is_dirty === true}`,
      `review_tick=${health.review_tick.state}`,
      `content_daily=${health.content_daily.state}`,
      ...(health.content_daily.current_step ? [
        `daily_step=${health.content_daily.current_step}:${health.content_daily.current_step_status ?? "unknown"}:${health.content_daily.current_step_freshness ?? "unknown"}`
      ] : []),
      `feedback_refresh=${health.content_feedback_refresh.state}`,
      `creator_metrics=${health.content_creator_metrics.state}`,
      `pause_active=${health.autonomy_pause.active}`
    ].join("; "),
    action_kind: "inspect_service_health",
    source_ref: health.refs[0] ?? health.service.heartbeat_ref,
    service_health: {
      status: health.status,
      runtime_state: health.service.state,
      heartbeat_freshness: health.service.heartbeat_freshness,
      heartbeat_age_ms: health.service.heartbeat_age_ms ?? null,
      heartbeat_updated_at: health.service.heartbeat_updated_at ?? null,
      runtime_commit: runtime?.source_commit_short ?? runtime?.source_commit?.slice(0, 12) ?? null,
      runtime_branch: runtime?.source_branch ?? null,
      runtime_dirty: runtime?.source_is_dirty ?? null,
      repo_commit: deployment.repo_commit_short ?? deployment.repo_commit?.slice(0, 12) ?? null,
      repo_branch: deployment.repo_branch ?? null,
      deployment_status: deployment.status,
      deployment_reason: deployment.reason,
      restart_command: deployment.restart_command,
      review_tick_state: health.review_tick.state,
      review_tick_enabled: health.review_tick.enabled,
      content_daily_state: health.content_daily.state,
      content_daily_enabled: health.content_daily.enabled,
      content_daily_last_job_status: health.content_daily.last_job_status ?? null,
      content_daily_last_effective_job_status: health.content_daily.last_effective_job_status ?? null,
      content_daily_last_job_count: health.content_daily.last_job_count ?? null,
      content_daily_last_skip_reason: health.content_daily.last_skip_reason ?? null,
      content_daily_current_step: health.content_daily.current_step ?? null,
      content_daily_current_step_status: health.content_daily.current_step_status ?? null,
      content_daily_current_step_summary: health.content_daily.current_step_summary ?? null,
      content_daily_current_step_age_ms: health.content_daily.current_step_age_ms ?? null,
      content_daily_current_step_freshness: health.content_daily.current_step_freshness ?? null,
      content_daily_current_track_id: health.content_daily.current_track_id ?? null,
      content_daily_current_job_ref: health.content_daily.current_job_ref ?? null,
      content_daily_current_run_ref: health.content_daily.current_run_ref ?? null,
      content_daily_updated_at: health.content_daily.updated_at ?? null,
      content_daily_error: health.content_daily.error ?? null,
      content_feedback_refresh_state: health.content_feedback_refresh.state,
      content_feedback_refresh_enabled: health.content_feedback_refresh.enabled,
      content_feedback_refresh_last_queue_count: health.content_feedback_refresh.last_queue_count ?? null,
      content_feedback_refresh_last_due_count: health.content_feedback_refresh.last_due_count ?? null,
      content_feedback_refresh_next_due_at: health.content_feedback_refresh.next_due_at ?? null,
      content_feedback_refresh_updated_at: health.content_feedback_refresh.updated_at ?? null,
      content_feedback_refresh_error: health.content_feedback_refresh.error ?? null,
      content_creator_metrics_state: health.content_creator_metrics.state,
      content_creator_metrics_enabled: health.content_creator_metrics.enabled,
      content_creator_metrics_last_queue_count: health.content_creator_metrics.last_queue_count ?? null,
      content_creator_metrics_last_captured_count: health.content_creator_metrics.last_captured_count ?? null,
      content_creator_metrics_last_blocked_count: health.content_creator_metrics.last_blocked_count ?? null,
      content_creator_metrics_last_failed_count: health.content_creator_metrics.last_failed_count ?? null,
      content_creator_metrics_updated_at: health.content_creator_metrics.updated_at ?? null,
      content_creator_metrics_error: health.content_creator_metrics.error ?? null,
      autonomy_pause_active: health.autonomy_pause.active,
      inspect_command: inspectCommand
    },
    growth_value: growthForServiceHealth(health),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: `Inspect bounded service health first: ${inspectCommand}. Read logs separately with service logs if needed; restart only through an explicit operator service command outside read-only views.`,
    score_reasons: [
      `service_health=${health.status}`,
      `runtime_state=${health.service.state}`,
      `heartbeat_freshness=${health.service.heartbeat_freshness}`,
      `deployment=${deployment.status}`,
      `runtime_dirty=${runtime?.source_is_dirty === true}`,
      `review_tick=${health.review_tick.state}`,
      `content_daily=${health.content_daily.state}`,
      ...(health.content_daily.current_step ? [
        `content_daily_current_step=${health.content_daily.current_step}`,
        `content_daily_current_step_freshness=${health.content_daily.current_step_freshness ?? "unknown"}`
      ] : []),
      `feedback_refresh=${health.content_feedback_refresh.state}`,
      `creator_metrics=${health.content_creator_metrics.state}`,
      `pause_active=${health.autonomy_pause.active}`
    ],
    created_at: health.service.heartbeat_updated_at ?? health.review_tick.updated_at ?? undefined,
    updated_at: health.service.heartbeat_updated_at ?? health.review_tick.updated_at ?? undefined
  })];
}

function needsServiceHealthAttention(health: ServiceHealthResult): boolean {
  const hasHeartbeat = health.refs.includes(health.service.heartbeat_ref);
  const reviewTickNeedsAttention = /^(error|failed|stale)$/i.test(health.review_tick.state);
  const contentDailyNeedsAttention = residentLoopNeedsAttention(health.content_daily, health.autonomy_pause.active);
  const contentDailyProgressNeedsAttention = health.content_daily.current_step_freshness === "stale";
  const feedbackRefreshNeedsAttention = residentLoopNeedsAttention(health.content_feedback_refresh, health.autonomy_pause.active);
  const creatorMetricsNeedsAttention = residentLoopNeedsAttention(health.content_creator_metrics, health.autonomy_pause.active);
  if (health.refs.length === 0) return false;
  if (!hasHeartbeat) {
    return reviewTickNeedsAttention
      || contentDailyNeedsAttention
      || contentDailyProgressNeedsAttention
      || feedbackRefreshNeedsAttention
      || creatorMetricsNeedsAttention;
  }
  if (health.service.state !== "unknown" && health.service.state !== "running") return true;
  if (health.service.heartbeat_freshness === "stale" || health.service.heartbeat_freshness === "invalid") return true;
  if (health.service.deployment.status === "stale") return true;
  if (health.service.runtime_build?.source_is_dirty === true) return true;
  if (reviewTickNeedsAttention) return true;
  if (contentDailyNeedsAttention) return true;
  if (contentDailyProgressNeedsAttention) return true;
  if (feedbackRefreshNeedsAttention) return true;
  if (creatorMetricsNeedsAttention) return true;
  if (health.status === "unknown" && health.refs.length > 0) return true;
  return false;
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

async function listJsonItems(
  store: AgentStore,
  root: string,
  toItem: (ref: string, value: unknown) => OpportunityBacklogItem | null
): Promise<OpportunityBacklogItem[]> {
  const refs = (await store.listStateFiles(root)).filter((ref) => ref.endsWith(".json"));
  const items: OpportunityBacklogItem[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const item = toItem(ref, raw);
    if (item) items.push(item);
  }
  return items;
}

function reviewConfirmationItem(
  ref: string,
  value: unknown,
  gate?: SopEvolutionConfirmationGate,
  recoveryDecision?: SopRecoveryDecisionWithRef
): OpportunityBacklogItem | null {
  if (!isRecord(value)) return null;
  if (value.status !== "pending" || value.confirmation_required !== true || value.execution_allowed !== false) return null;
  const id = stringField(value, "id");
  if (!id) return null;
  const action = isRecord(value.action) ? value.action : null;
  const actionKind = stringField(value, "action_kind") ?? "unknown";
  const staleGate = gate?.status === "stale";
  if (staleGate && recoveryDecision && suppressRecoveredStaleConfirmation(recoveryDecision)) return null;
  const sopRef = stringField(value, "sop_id") ?? stringField(value, "sop_ref") ?? stringField(value, "proposal_id") ?? ref;
  const coverageCommand = actionKind === "revise_skill" ? reusedSkillCoverageCommand(value, action) : null;
  const recoveryDecisionSummary = recoveryDecision
    ? ` Latest recovery decision: ${recoveryDecision.status} - ${recoveryDecision.reason}`
    : "";
  return buildItem({
    kind: "review_confirmation",
    ref,
    id,
    status: "pending",
    title: stringField(action, "title") ?? `Execute confirmed ${actionKind}`,
    summary: staleGate
      ? `Pending SOP evolution confirmation is stale: ${gate.reason}${recoveryDecisionSummary}`
      : stringField(action, "rationale") ?? `Pending confirmed self-evolution action ${actionKind}.`,
    action_kind: actionKind,
    source_ref: stringField(value, "review_ref") ?? undefined,
    growth_value: staleGate
      ? growthForStaleSopConfirmation(actionKind, recoveryDecision)
      : growthForActionKind(actionKind, "confirmation"),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: staleGate ? 1 : 2,
      side_effect_level: staleGate
        ? "none"
        : actionKind === "promote_sop" || actionKind === "revise_skill" ? "local_write" : "local_reversible"
    },
    next_step: staleGate
      ? recoveryDecision?.status === "deferred"
        ? `Revisit the deferred stale confirmation recovery, or update the decision explicitly: pnpm run runtime -- review decide-sop-recovery --confirmation ${ref} --status open --reason "..."`
        : `Request a fresh SOP evolution confirmation after inspecting the current ledger: pnpm run runtime -- review request-sop-confirmation --sop ${sopRef}`
      : coverageCommand
        ? `Inspect reused-skill coverage first: ${coverageCommand}. Then run explicitly if still valid: pnpm run runtime -- review execute-confirmed-follow-up --confirmation ${ref}`
      : `Inspect then run explicitly if still valid: pnpm run runtime -- review execute-confirmed-follow-up --confirmation ${ref}`,
    sop_evolution_gate: gate,
    sop_recovery_decision: staleGate ? recoveryDecision : undefined,
    score_reasons: [
      "pending confirmed follow-up",
      `action=${actionKind}`,
      ...(gate ? [`sop_evolution_gate=${gate.status}`, `gate_reason_code=${gate.reason_code}`, `gate_reason=${gate.reason}`] : []),
      ...(recoveryDecision ? [`recovery_decision=${recoveryDecision.status}`, `recovery_decision_ref=${recoveryDecision.ref}`] : [])
    ],
    created_at: stringField(value, "created_at") ?? undefined,
    updated_at: recoveryDecision?.created_at
  });
}

async function listReviewConfirmationItems(
  store: AgentStore,
  vaultRoot: SkillResolverLike
): Promise<OpportunityBacklogItem[]> {
  const refs = (await store.listStateFiles("autonomy/followups")).filter((ref) => ref.endsWith(".json"));
  const recoveryDecisions = await readSopRecoveryDecisions(store);
  const items: OpportunityBacklogItem[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const confirmationId = isRecord(raw) ? stringField(raw, "id") : null;
    const item = reviewConfirmationItem(
      ref,
      raw,
      await inspectSopEvolutionConfirmationGate(store, raw, { vaultRoot }),
      confirmationId ? latestSopRecoveryDecision(recoveryDecisions, ref, confirmationId) : undefined
    );
    const action = isRecord(raw) && isRecord(raw.action) ? raw.action : null;
    if (item) {
      const withCoverage = await withReusedSkillCoverage(store, vaultRoot, item, raw, action);
      items.push(await withDraftSopReadiness(store, withCoverage, raw, action));
    }
  }
  return items;
}

function memoryConfirmationItem(ref: string, value: unknown): OpportunityBacklogItem | null {
  if (!isRecord(value)) return null;
  if (value.action_type !== "promote_memory_candidate" || value.status !== "pending") return null;
  const id = stringField(value, "id");
  if (!id) return null;
  return buildItem({
    kind: "memory_confirmation",
    ref,
    id,
    status: "pending",
    title: "Accept confirmed semantic memory candidate",
    summary: stringField(value, "candidate_id") ?? stringField(value, "candidate_ref") ?? "Pending memory acceptance confirmation.",
    source_ref: stringField(value, "candidate_ref") ?? undefined,
    growth_value: {
      capability_gain: 4,
      repeat_demand: 2,
      evidence_available: 5,
      urgency_or_unblock: 3,
      risk: 1,
      cost: 1
    },
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "local_reversible"
    },
    next_step: `Inspect then run explicitly if still valid: pnpm run runtime -- memory execute-candidate-confirmation --confirmation ${ref}`,
    score_reasons: ["pending memory confirmation", "durable semantic memory candidate"],
    created_at: stringField(value, "created_at") ?? undefined
  });
}

async function listReviewInboxItems(
  store: AgentStore,
  vaultRoot: SkillResolverLike
): Promise<OpportunityBacklogItem[]> {
  const refs = (await store.listStateFiles("autonomy/inbox")).filter((ref) => ref.endsWith(".json"));
  const decisions = await readReviewInboxDecisions(store);
  const sources: ReviewInboxBacklogSource[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const source = reviewInboxBacklogSource(ref, raw, decisions);
    if (source) sources.push(source);
  }
  const items: OpportunityBacklogItem[] = [];
  const visibleSources = annotateReviewInboxDuplicates(sources)
    .filter((source) => !source.duplicate_group || source.duplicate_group.canonical_id === source.id);
  for (const source of visibleSources) {
    const latestDecision = latestReviewInboxDuplicateDecision(decisions, source, source.duplicate_group)
      ?? source.latest_decision;
    if (suppressReviewInboxDecision(latestDecision)) continue;
    const item = reviewInboxItem(source.ref, source.value, latestDecision, source.duplicate_group);
    if (item) {
      const withCoverage = await withReusedSkillCoverage(store, vaultRoot, item, source.value, null);
      const withDraftReadiness = await withDraftSopReadiness(store, withCoverage, source.value, null);
      items.push(await withNarrowReviewReadiness(store, withDraftReadiness, source.value));
    }
  }
  return items;
}

interface ReviewInboxBacklogSource {
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

function reviewInboxBacklogSource(
  ref: string,
  value: unknown,
  decisions: ReviewInboxDecisionWithRef[]
): ReviewInboxBacklogSource | null {
  if (!isRecord(value)) return null;
  if (value.source !== "review_tick") return null;
  const id = stringField(value, "id");
  const status = stringField(value, "status");
  if (!id || !status || status === "executed") return null;
  const decision = latestReviewInboxDecision(decisions, ref, id);
  return {
    id,
    ref,
    value,
    status,
    action_kind: stringField(value, "action_kind") ?? undefined,
    title: stringField(value, "title") ?? stringField(value, "proposal_title") ?? undefined,
    rationale: stringField(value, "rationale") ?? undefined,
    command: stringField(value, "command") ?? null,
    required_refs: stringList(value.required_refs),
    would_write: stringList(value.would_write),
    updated_at: decision?.created_at ?? stringField(value, "updated_at") ?? undefined,
    created_at: stringField(value, "created_at") ?? undefined,
    latest_decision: decision
  };
}

function reviewInboxItem(
  ref: string,
  value: unknown,
  decision?: ReviewInboxDecisionWithRef,
  duplicateGroup?: ReviewInboxDuplicateGroup
): OpportunityBacklogItem | null {
  if (!isRecord(value)) return null;
  if (value.source !== "review_tick") return null;
  const id = stringField(value, "id");
  const status = stringField(value, "status");
  if (!id || !status || status === "executed") return null;
  if (suppressReviewInboxDecision(decision)) return null;
  const actionKind = stringField(value, "action_kind") ?? "unknown";
  const decisionSummary = decision
    ? ` Latest operator decision: ${decision.status} - ${decision.reason}`
    : "";
  const duplicateSummary = duplicateGroup && duplicateGroup.duplicate_count > 0
    ? ` Duplicate group: ${duplicateGroup.duplicate_count} duplicate item(s) collapsed (${duplicateGroup.duplicate_refs.join(", ")}).`
    : "";
  const deferred = decision?.status === "deferred";
  const coverageCommand = actionKind === "revise_skill" ? reusedSkillCoverageCommand(value, null) : null;
  return buildItem({
    kind: "review_inbox",
    ref,
    id,
    status: deferred ? "deferred" : status,
    title: stringField(value, "title") ?? stringField(value, "proposal_title") ?? `Review inbox ${id}`,
    summary: `${stringField(value, "rationale") ?? "Self-evolution inbox item awaiting operator triage."}${decisionSummary}${duplicateSummary}`,
    action_kind: actionKind,
    source_ref: stringField(value, "latest_review_ref") ?? undefined,
    growth_value: growthForReviewInboxAction(actionKind, status, decision),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: deferred || status === "confirmation_requested" ? 1 : 2,
      side_effect_level: "none"
    },
    next_step: deferred
      ? `Revisit the deferred review inbox item, or reopen it explicitly: pnpm run runtime -- review decide-inbox --item ${id} --status open --reason "..."`
      : status === "confirmation_requested"
      ? "Inspect the pending confirmation before execution."
      : coverageCommand
      ? `Inspect reused-skill coverage first: ${coverageCommand}. Then request confirmation if still valid: pnpm run runtime -- review request-inbox-confirmation --item ${id}`
      : `Inspect and request confirmation if still valid: pnpm run runtime -- review request-inbox-confirmation --item ${id}`,
    review_inbox_decision: decision,
    review_inbox_duplicate_group: duplicateGroup,
    score_reasons: [
      `review inbox status=${status}`,
      `action=${actionKind}`,
      ...(decision ? [`review_inbox_decision=${decision.status}`, `review_inbox_decision_ref=${decision.ref}`] : []),
      ...(duplicateGroup && duplicateGroup.duplicate_count > 0
        ? [`review_inbox_duplicates=${duplicateGroup.duplicate_count}`, `review_inbox_duplicate_key=${duplicateGroup.key}`]
        : [])
    ],
    created_at: stringField(value, "created_at") ?? undefined,
    updated_at: decision?.created_at ?? stringField(value, "updated_at") ?? undefined
  });
}

function memoryCandidateItem(ref: string, value: unknown): OpportunityBacklogItem | null {
  if (!isRecord(value)) return null;
  if (value.action_type !== "propose_memory") return null;
  const status = stringField(value, "status");
  const id = stringField(value, "id");
  if (!id || !status || status === "accepted") return null;
  return buildItem({
    kind: "memory_candidate",
    ref,
    id,
    status,
    title: "Review memory proposal candidate",
    summary: stringField(value, "summary") ?? "Local memory candidate awaits triage.",
    source_ref: firstString(value.artifact_refs),
    growth_value: {
      capability_gain: 3,
      repeat_demand: 2,
      evidence_available: 4,
      urgency_or_unblock: status === "confirmation_requested" ? 3 : 2,
      risk: 1,
      cost: 1
    },
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: status === "confirmation_requested"
      ? "Inspect the pending memory confirmation."
      : `Inspect and request confirmation if still valid: pnpm run runtime -- memory request-candidate-confirmation --candidate ${ref}`,
    score_reasons: [`memory candidate status=${status}`, "candidate backed by local evidence"],
    created_at: stringField(value, "created_at") ?? undefined
  });
}

async function readCompletionVerificationItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const refs = (await store.listStateFiles("memory/episodes"))
    .filter((ref) => ref.endsWith("-completion-verification.json"))
    .sort()
    .reverse();
  const items: OpportunityBacklogItem[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = completionVerificationReportSchema.safeParse(raw);
    if (!parsed.success) continue;
    const item = await completionVerificationItem(store, ref, parsed.data);
    if (item) items.push(item);
    if (items.length >= MAX_COMPLETION_VERIFICATION_ITEMS) break;
  }
  return items;
}

async function completionVerificationItem(
  store: AgentStore,
  ref: string,
  report: CompletionVerificationReport
): Promise<OpportunityBacklogItem | null> {
  if (report.verification_status === "passed") return null;
  const failedChecks = report.checks.filter((check) => check.status === "fail");
  const warningChecks = report.checks.filter((check) => check.status === "warning");
  const diagnostics = await modelDiagnosticsForCompletionReport(store, report);
  const status = report.verification_status === "failed"
    ? "failed"
    : report.completion_status;
  const inspectCommand = `pnpm run runtime -- review completions --completion ${shellArg(report.id)} --state-root <state-root>`;
  const traceCommand = `pnpm run runtime -- review traces --trace ${shellArg(report.id)} --state-root <state-root>`;
  return buildItem({
    kind: "completion_verification",
    ref,
    id: report.id,
    status,
    title: titleForCompletionReport(report),
    summary: report.summary,
    action_kind: report.verification_status === "failed" ? "repair_completion" : "resume_task",
    source_ref: report.final_response_ref ?? report.envelope_ref,
    growth_value: growthForCompletionReport(report),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: report.verification_status === "failed" ? 2 : 1,
      side_effect_level: "none"
    },
    next_step: diagnostics.length > 0
      ? `Inspect the completion report ${ref} and bounded model diagnostic trace before retrying or revising SOPs: ${inspectCommand}`
      : `Inspect the completion report ${ref} and latest working checkpoint, then resume explicitly if still relevant: ${inspectCommand}`,
    completion_verification: {
      report_ref: ref,
      completion_id: report.id,
      session_id: report.session_id,
      turn_id: report.turn_id,
      completion_status: report.completion_status,
      verification_status: report.verification_status,
      failed_check_ids: failedChecks.map((check) => check.id),
      warning_check_ids: warningChecks.map((check) => check.id),
      model_diagnostic_count: diagnostics.length,
      model_diagnostics: diagnostics.slice(0, 5),
      inspect_command: inspectCommand,
      trace_command: traceCommand
    },
    score_reasons: [
      `completion_status=${report.completion_status}`,
      `verification_status=${report.verification_status}`,
      `failed_checks=${failedChecks.map((check) => check.id).join(",") || "none"}`,
      ...(warningChecks.length > 0 ? [`warning_checks=${warningChecks.map((check) => check.id).join(",")}`] : []),
      ...(diagnostics.length > 0 ? [
        `model_diagnostics=${diagnostics.length}`,
        `model_failure_kinds=${uniqueStringList(diagnostics.map((item) => item.failure_kind)).join(",")}`
      ] : [])
    ],
    created_at: report.created_at,
    updated_at: report.created_at
  });
}

async function modelDiagnosticsForCompletionReport(
  store: AgentStore,
  report: CompletionVerificationReport
): Promise<CompletionVerificationDiagnosticSummary[]> {
  const refs = uniqueStringList(report.observation_refs)
    .filter((ref) => ref.includes("-model-diagnostic-r") && ref.endsWith(".json"))
    .slice(0, 8);
  const diagnostics: CompletionVerificationDiagnosticSummary[] = [];
  for (const diagnosticRef of refs) {
    let raw: unknown;
    try {
      raw = await store.readStateJson<unknown>(diagnosticRef);
    } catch {
      continue;
    }
    const record = isRecord(raw) ? raw : {};
    diagnostics.push({
      round: numberField(record, "round") ?? modelDiagnosticRoundNumber(diagnosticRef),
      stage: stringField(record, "stage") ?? "unknown",
      failure_kind: stringField(record, "failure_kind") ?? "unknown",
      diagnostic_ref: diagnosticRef,
      response_ref: stringField(record, "response_ref"),
      error_preview: limitText(stringField(record, "error_preview") ?? "", 300)
    });
  }
  return diagnostics;
}

async function readArchiveHealthItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const result = await getArchiveHealth(store, { limit: MAX_ARCHIVE_HEALTH_ITEMS });
  return result.issues.map(archiveHealthItem);
}

async function readSkillRegistryHealthItems(
  store: AgentStore,
  vaultRoot: SkillResolverLike
): Promise<OpportunityBacklogItem[]> {
  const result = await getSkillRegistryHealth(store, {
    limit: MAX_SKILL_REGISTRY_HEALTH_ITEMS,
    vaultRoot
  });
  return result.issues.map(skillRegistryHealthItem);
}

function archiveHealthItem(issue: ArchiveHealthIssue): OpportunityBacklogItem {
  return buildItem({
    kind: "archive_health",
    ref: issue.ref,
    id: issue.id,
    status: issue.status,
    title: `Review archive health: ${issue.kind}`,
    summary: [
      `kind=${issue.kind}`,
      `date=${issue.date ?? "unknown"}`,
      `source_events=${issue.source_event_count ?? "unknown"}`,
      `archive_events=${issue.archive_event_count ?? "unknown"}`,
      `reason=${issue.reason}`
    ].join("; "),
    action_kind: "refresh_episode_archives",
    source_ref: issue.source_ref,
    archive_health: {
      issue_kind: issue.kind,
      issue_status: issue.status,
      date: issue.date,
      archive_ref: issue.archive_ref,
      source_event_count: issue.source_event_count,
      archive_event_count: issue.archive_event_count,
      source_last_event_at: issue.source_last_event_at,
      archive_last_event_at: issue.archive_last_event_at,
      reason: issue.reason,
      inspect_command: issue.inspect_command,
      refresh_command: issue.refresh_command
    },
    growth_value: growthForArchiveHealth(issue),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: issue.refresh_command ? "local_write" : "none"
    },
    next_step: issue.refresh_command
      ? `Inspect archive freshness first: ${issue.inspect_command}. If still relevant, refresh archives explicitly: ${issue.refresh_command}.`
      : `Inspect archive freshness first: ${issue.inspect_command}. Repair or retire the issue externally before marking it resolved.`,
    score_reasons: [
      `archive_health=${issue.status}`,
      `issue_kind=${issue.kind}`,
      `date=${issue.date ?? "unknown"}`,
      issue.reason
    ],
    created_at: issue.archive_created_at ?? issue.source_last_event_at ?? undefined,
    updated_at: issue.source_last_event_at ?? issue.archive_last_event_at ?? issue.archive_created_at ?? undefined
  });
}

function skillRegistryHealthItem(issue: SkillRegistryHealthIssue): OpportunityBacklogItem {
  return buildItem({
    kind: "skill_registry_health",
    ref: issue.ref,
    id: issue.id,
    status: issue.status,
    title: `Review skill registry health: ${issue.kind}`,
    summary: [
      `kind=${issue.kind}`,
      `status=${issue.status}`,
      `skill=${issue.skill_name ?? "unknown"}`,
      `reason=${issue.reason}`
    ].join("; "),
    action_kind: "inspect_skill_registry_health",
    source_ref: issue.instructions_ref ?? issue.event_ref ?? issue.registry_ref ?? issue.ref,
    skill_registry_health: {
      issue_kind: issue.kind,
      issue_status: issue.status,
      skill_name: issue.skill_name,
      instructions_ref: issue.instructions_ref,
      registry_ref: issue.registry_ref,
      event_ref: issue.event_ref,
      reason: issue.reason,
      inspect_command: issue.inspect_command,
      sync_command: issue.sync_command,
      retire_event_command: issue.retire_event_command
    },
    growth_value: growthForSkillRegistryHealth(issue),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: issue.next_step,
    score_reasons: [
      `skill_registry_health=${issue.status}`,
      `issue_kind=${issue.kind}`,
      issue.skill_name ? `skill=${issue.skill_name}` : "skill=unknown",
      issue.reason
    ],
    created_at: issue.created_at ?? undefined,
    updated_at: issue.updated_at ?? issue.created_at ?? undefined
  });
}

async function readSelectedSkillDriftItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const result = await listSelectedSkillDrifts(store, { limit: MAX_SELECTED_SKILL_OUTCOME_ITEMS });
  return result.drifts.map(selectedSkillDriftItem);
}

function selectedSkillDriftItem(drift: SelectedSkillDriftSummary): OpportunityBacklogItem {
  return buildItem({
    kind: "selected_skill_drift",
    ref: drift.latest_attention_outcome_ref,
    id: drift.id,
    status: drift.status,
    title: `Review selected skill drift: ${drift.skill_name}`,
    summary: [
      `${drift.skill_name} has ${drift.attention_count} selected-skill outcome(s) needing attention`,
      `failed=${drift.failed_count}`,
      `not_done=${drift.not_done_count}`,
      `blocked=${drift.blocked_count}`,
      `unverified=${drift.unverified_count}`
    ].join("; "),
    action_kind: "review_skill_drift",
    source_ref: drift.latest_completion_report_ref ?? drift.latest_attention_outcome_ref,
    growth_value: growthForSelectedSkillDrift(drift),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: `Inspect repeated selected-skill outcomes before proposing any skill revision: pnpm run runtime -- skills drifts --skill-name ${shellArg(drift.skill_name)} --state-root <state-root>`,
    selected_skill_drift: drift,
    score_reasons: [
      "selected_skill_drift=attention",
      `attention_count=${drift.attention_count}`,
      `failed_count=${drift.failed_count}`,
      `latest_attention_outcome=${drift.latest_attention_outcome_ref}`
    ],
    created_at: drift.first_seen_at,
    updated_at: drift.latest_seen_at
  });
}

async function readSelectedSkillOutcomeItems(
  store: AgentStore,
  suppressedSkillNames: Set<string> = new Set()
): Promise<OpportunityBacklogItem[]> {
  const refs = (await store.listStateFiles("memory/skills/usage"))
    .filter((ref) => ref.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, MAX_SELECTED_SKILL_OUTCOME_SCAN);
  const latestBySkill = new Map<string, { ref: string; value: Record<string, unknown>; createdAt: string }>();
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    if (!isRecord(raw)) continue;
    const skillName = stringField(raw, "skill_name");
    const createdAt = stringField(raw, "created_at");
    if (!skillName || !createdAt) continue;
    const latest = latestBySkill.get(skillName);
    if (!latest || createdAt > latest.createdAt) latestBySkill.set(skillName, { ref, value: raw, createdAt });
  }
  return [...latestBySkill.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.ref.localeCompare(left.ref))
    .map((outcome) => selectedSkillOutcomeItem(outcome.ref, outcome.value, suppressedSkillNames))
    .filter((item): item is OpportunityBacklogItem => item !== null)
    .slice(0, MAX_SELECTED_SKILL_OUTCOME_ITEMS);
}

function selectedSkillOutcomeItem(
  ref: string,
  value: unknown,
  suppressedSkillNames: Set<string> = new Set()
): OpportunityBacklogItem | null {
  if (!isRecord(value)) return null;
  const skillName = stringField(value, "skill_name");
  const instructionsRef = stringField(value, "instructions_ref");
  const completionStatus = stringField(value, "completion_status");
  const verificationStatus = stringField(value, "verification_status");
  const verdict = stringField(value, "verdict");
  const id = stringField(value, "id") ?? refId(ref);
  const verified = value.verified === true;
  if (!skillName || !instructionsRef || !completionStatus || !verificationStatus || !verdict) return null;
  if (suppressedSkillNames.has(skillName)) return null;
  if (!needsSelectedSkillOutcomeAttention({ completionStatus, verificationStatus, verified })) return null;

  const completionReportRef = stringField(value, "completion_report_ref");
  const contextManifestRef = stringField(value, "context_manifest_ref");
  const finalResponseRef = stringField(value, "final_response_ref");
  const metadataRef = stringField(value, "metadata_ref");
  const registryUpdate = isRecord(value.registry_update) ? value.registry_update : {};
  const useCount = numberField(registryUpdate, "use_count");
  const status = selectedSkillOutcomeStatus({ completionStatus, verificationStatus, verified });

  return buildItem({
    kind: "selected_skill_outcome",
    ref,
    id,
    status,
    title: `Review selected skill outcome: ${skillName}`,
    summary: [
      `${skillName} was injected into context and ended with completion=${completionStatus}`,
      `verification=${verificationStatus}`,
      `verified=${verified}`,
      `verdict=${verdict}`
    ].join("; "),
    action_kind: "review_skill_outcome",
    source_ref: completionReportRef ?? contextManifestRef ?? instructionsRef,
    growth_value: growthForSelectedSkillOutcome({ completionStatus, verificationStatus, verified }),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: `Inspect the selected skill outcome and linked completion report before proposing any skill revision: ${ref}`,
    selected_skill_outcome: {
      skill_name: skillName,
      instructions_ref: instructionsRef,
      metadata_ref: metadataRef,
      completion_status: completionStatus,
      verification_status: verificationStatus,
      verified,
      verdict,
      context_manifest_ref: contextManifestRef,
      completion_report_ref: completionReportRef,
      final_response_ref: finalResponseRef,
      use_count: useCount
    },
    score_reasons: [
      "selected_skill_outcome=attention",
      `completion_status=${completionStatus}`,
      `verification_status=${verificationStatus}`,
      `verified=${verified}`,
      `verdict=${verdict}`
    ],
    created_at: stringField(value, "created_at") ?? undefined,
    updated_at: stringField(value, "created_at") ?? undefined
  });
}

function needsSelectedSkillOutcomeAttention(args: {
  completionStatus: string;
  verificationStatus: string;
  verified: boolean;
}): boolean {
  return args.completionStatus !== "done"
    || args.verificationStatus !== "passed"
    || args.verified !== true;
}

function selectedSkillOutcomeStatus(args: {
  completionStatus: string;
  verificationStatus: string;
  verified: boolean;
}): string {
  if (args.verificationStatus === "failed") return "failed";
  if (args.completionStatus === "blocked") return "blocked";
  if (args.completionStatus === "not_done") return "not_done";
  if (args.verificationStatus === "skipped") return "skipped";
  return args.verified ? args.verificationStatus : "unverified";
}

function titleForCompletionReport(report: CompletionVerificationReport): string {
  if (report.verification_status === "failed") return "Review failed completion claim";
  if (report.completion_status === "blocked") return "Review blocked live run";
  return "Resume unfinished live run";
}

async function readWorkingCheckpointItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const result = await listWorkingCheckpoints(store);
  return result.checkpoints
    .filter(needsWorkingCheckpointAttention)
    .slice(0, MAX_WORKING_CHECKPOINT_ITEMS)
    .map(workingCheckpointItem);
}

function workingCheckpointItem(checkpoint: WorkingCheckpointSummary): OpportunityBacklogItem {
  const inspectCommand = `pnpm run runtime -- memory working --checkpoint ${shellArg(checkpoint.ref)} --state-root <state-root>`;
  return buildItem({
    kind: "working_checkpoint",
    ref: checkpoint.ref,
    id: `working_checkpoint_${checkpoint.id}`,
    status: "open",
    title: `Review working checkpoint: ${checkpoint.current_step}`,
    summary: [
      `step=${checkpoint.current_step}`,
      `open_questions=${checkpoint.open_question_count}`,
      `evidence_refs=${checkpoint.recent_evidence_ref_count}`
    ].join("; "),
    action_kind: "review_working_checkpoint",
    source_ref: checkpoint.evidence_event_refs[0] ?? checkpoint.ref,
    working_checkpoint: {
      checkpoint_ref: checkpoint.ref,
      current_step: checkpoint.current_step,
      next_action: checkpoint.next_action,
      known_constraint_count: checkpoint.known_constraint_count,
      recent_evidence_ref_count: checkpoint.recent_evidence_ref_count,
      open_question_count: checkpoint.open_question_count,
      open_questions: checkpoint.open_questions,
      evidence_event_refs: checkpoint.evidence_event_refs,
      inspect_command: inspectCommand
    },
    growth_value: growthForWorkingCheckpoint(checkpoint),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: `Inspect bounded working checkpoint before resuming or proposing follow-up work: ${inspectCommand}. Do not read raw evidence artifacts unless explicitly needed.`,
    score_reasons: [
      "working_checkpoint=attention",
      `current_step=${checkpoint.current_step}`,
      `open_questions=${checkpoint.open_question_count}`,
      `evidence_refs=${checkpoint.recent_evidence_ref_count}`
    ],
    created_at: checkpoint.created_at ?? undefined,
    updated_at: checkpoint.created_at ?? undefined
  });
}

async function readContextPressureItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const result = await listContextPressure(store, { limit: MAX_CONTEXT_PRESSURE_ITEMS });
  return result.pressures.map(contextPressureItem);
}

async function readContextHealthItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const result = await getContextHealth(store, { limit: MAX_CONTEXT_HEALTH_ITEMS });
  return result.issues.map(contextHealthItem);
}

function contextHealthItem(issue: ContextHealthIssue): OpportunityBacklogItem {
  const createdAt = issue.created_at ?? utcNow();
  return buildItem({
    kind: "context_health",
    ref: issue.ref,
    id: issue.id,
    status: issue.status,
    title: `Repair context health issue: ${issue.kind}`,
    summary: [
      `kind=${issue.kind}`,
      `status=${issue.status}`,
      `reason=${issue.reason}`
    ].join("; "),
    action_kind: "repair_context_health",
    source_ref: issue.context_ref ?? issue.manifest_ref ?? issue.ref,
    context_health: {
      issue_kind: issue.kind,
      issue_status: issue.status,
      manifest_ref: issue.manifest_ref,
      context_ref: issue.context_ref,
      session_id: issue.session_id,
      turn_id: issue.turn_id,
      reason: issue.reason,
      inspect_command: issue.inspect_command,
      operator_guidance: issue.operator_guidance
    },
    growth_value: growthForContextHealth(issue),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: issue.next_step,
    score_reasons: [
      `context_health=${issue.status}`,
      `issue_kind=${issue.kind}`,
      issue.reason
    ],
    created_at: createdAt,
    updated_at: createdAt
  });
}

function contextPressureItem(pressure: ContextPressureSummary): OpportunityBacklogItem {
  const inspectCommand = pressure.operator_guidance.inspect_command;
  return buildItem({
    kind: "context_pressure",
    ref: pressure.ref,
    id: pressure.id,
    status: pressure.status,
    title: `Review context pressure for ${pressure.session_id}`,
    summary: [
      `total_chars=${pressure.total_chars}`,
      `largest_section=${pressure.largest_section.title}:${pressure.largest_section.chars}`,
      `pressure_sections=${pressure.pressure_sections.length}`
    ].join("; "),
    action_kind: "review_context_pressure",
    source_ref: pressure.context_ref,
    context_pressure: {
      session_id: pressure.session_id,
      turn_id: pressure.turn_id,
      context_ref: pressure.context_ref,
      status: pressure.status,
      total_chars: pressure.total_chars,
      largest_section_title: pressure.largest_section.title,
      largest_section_chars: pressure.largest_section.chars,
      largest_section_share: pressure.largest_section.share,
      pressure_section_count: pressure.pressure_sections.length,
      inspect_command: inspectCommand,
      operator_guidance: pressure.operator_guidance
    },
    growth_value: growthForContextPressure(pressure),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: `${pressure.next_step} Do not read raw context Markdown unless explicitly needed.`,
    score_reasons: [
      `context_pressure=${pressure.status}`,
      `total_chars=${pressure.total_chars}`,
      `largest_section=${pressure.largest_section.title}:${pressure.largest_section.chars}`,
      ...pressure.reasons.slice(0, 2)
    ],
    created_at: pressure.created_at,
    updated_at: pressure.created_at
  });
}

async function readPipelineRunItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const history = await listPipelineRuns(store, { limit: MAX_PIPELINE_BACKLOG_SCAN });
  const items: OpportunityBacklogItem[] = [];
  for (const run of history.runs) {
    const item = pipelineRunItem(run);
    if (item) items.push(item);
    if (items.length >= MAX_PIPELINE_BACKLOG_ITEMS) break;
  }
  return items;
}

function pipelineRunItem(run: PipelineHistorySummary): OpportunityBacklogItem | null {
  if (run.status === "done") return null;
  const failedStages = run.failed_stage_ids.length > 0 ? run.failed_stage_ids.join(",") : "none";
  const stageCounts = renderStageCounts(run.stage_status_counts);
  const inspectCommand = `pnpm run runtime -- pipeline runs --pipeline ${shellArg(run.run_id)} --state-root <state-root>`;
  const resumeCommand = pipelineResumeCommand(run);
  return buildItem({
    kind: "pipeline_run",
    ref: run.checkpoint_ref,
    id: run.run_id,
    status: run.status,
    title: run.status === "blocked" ? "Review blocked pipeline run" : "Review failed pipeline run",
    summary: [
      `${run.verdict}: ${run.task || run.pipeline_id}`,
      `stages=${run.stage_count} (${stageCounts})`,
      `blocked_stage=${run.blocked_stage_id ?? "none"}`,
      `failed_stages=${failedStages}`,
      `evidence_refs=${run.evidence_ref_count}`
    ].join("; "),
    action_kind: run.status === "blocked" ? "resume_pipeline" : "repair_pipeline",
    source_ref: run.pipeline_ref,
    pipeline_run: {
      run_id: run.run_id,
      pipeline_id: run.pipeline_id,
      status: run.status,
      pipeline_ref: run.pipeline_ref,
      checkpoint_ref: run.checkpoint_ref,
      blocked_stage_id: run.blocked_stage_id,
      failed_stage_ids: run.failed_stage_ids,
      stage_status_counts: run.stage_status_counts,
      evidence_ref_count: run.evidence_ref_count,
      final_response_ref: run.final_response_ref,
      query_ref: run.query_ref,
      todo_ref: run.todo_ref,
      inspect_command: inspectCommand,
      resume_command: resumeCommand
    },
    growth_value: growthForPipelineRun(run),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: run.status === "blocked" ? 1 : 2,
      side_effect_level: "none"
    },
    next_step: run.status === "blocked"
      ? `Inspect the pipeline metadata first: ${inspectCommand}. If still valid, resume explicitly: ${resumeCommand}.`
      : `Inspect the pipeline metadata first: ${inspectCommand}. Repair the failed stage boundary, then resume explicitly: ${resumeCommand}.`,
    score_reasons: [
      `pipeline_status=${run.status}`,
      `stage_status_counts=${stageCounts}`,
      `blocked_stage=${run.blocked_stage_id ?? "none"}`,
      `failed_stages=${failedStages}`,
      `checkpoint_ref=${run.checkpoint_ref}`
    ],
    created_at: run.updated_at || undefined,
    updated_at: run.updated_at || undefined
  });
}

function pipelineResumeCommand(run: PipelineHistorySummary): string {
  const stage = run.blocked_stage_id ?? run.failed_stage_ids[0] ?? null;
  return [
    `pnpm run runtime -- pipeline resume --pipeline ${shellArg(run.run_id)}`,
    stage ? `--from-stage ${shellArg(stage)}` : null,
    "--state-root <state-root>"
  ].filter((part): part is string => Boolean(part)).join(" ");
}

async function readRepoWriteGuardItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const traces = await listLiveRunTraces(store, { limit: MAX_COMPLETION_VERIFICATION_ITEMS });
  const items: OpportunityBacklogItem[] = [];
  for (const trace of traces.traces) {
    for (const guard of trace.repo_write_guards) {
      const item = repoWriteGuardItem(trace, guard);
      if (item) items.push(item);
      if (items.length >= MAX_REPO_WRITE_GUARD_ITEMS) return items;
    }
  }
  return items;
}

function repoWriteGuardItem(
  trace: LiveRunTraceSummary,
  guard: LiveRunRepoWriteGuardSummary
): OpportunityBacklogItem | null {
  if (!guard.preexisting_dirty) return null;
  const inspectCommand = `pnpm run runtime -- review traces --trace ${shellArg(trace.completion_id)} --state-root <state-root>`;
  return buildItem({
    kind: "repo_write_guard",
    ref: `${trace.report_ref}#${guard.event_id}`,
    id: `repo_write_guard_${trace.completion_id}_${guard.event_id}`,
    status: "attention",
    title: "Review repo write on preexisting dirty workspace",
    summary: [
      `Repo write touched ${guard.path} while workspace was already ${guard.before_status}`,
      `changed_files=${guard.before_changed_file_count}->${guard.after_changed_file_count}`,
      `target_changed=${guard.target_changed_after_write}`
    ].join("; "),
    action_kind: "inspect_repo_write_guard",
    source_ref: trace.report_ref,
    repo_write_guard: {
      trace_ref: trace.report_ref,
      completion_id: trace.completion_id,
      session_id: trace.session_id,
      turn_id: trace.turn_id,
      event_id: guard.event_id,
      path: guard.path,
      before_status: guard.before_status,
      after_status: guard.after_status,
      before_changed_file_count: guard.before_changed_file_count,
      after_changed_file_count: guard.after_changed_file_count,
      changed_file_count_delta: guard.changed_file_count_delta,
      preexisting_dirty: guard.preexisting_dirty,
      target_changed_after_write: guard.target_changed_after_write,
      inspect_command: inspectCommand
    },
    growth_value: growthForRepoWriteGuard(guard),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 1,
      side_effect_level: "none"
    },
    next_step: `Inspect the bounded live run trace and current workspace status before further repo writes: ${inspectCommand}`,
    score_reasons: [
      "repo_write_guard=preexisting_dirty",
      `guard_path=${guard.path}`,
      `workspace=${guard.before_status}->${guard.after_status}`,
      `changed_files=${guard.before_changed_file_count}->${guard.after_changed_file_count}`,
      `trace_ref=${trace.report_ref}`
    ],
    created_at: guard.created_at,
    updated_at: trace.created_at
  });
}

async function readOpenOpportunities(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const records = await readOpportunityRecords(store);
  return records
    .filter((record) => record.current_status === "open" || record.current_status === "deferred")
    .map((record) => opportunityRecordItem(record))
    .filter((item): item is OpportunityBacklogItem => item !== null);
}

async function readSopEvolutionChainItems(
  store: AgentStore,
  vaultRoot: SkillResolverLike
): Promise<OpportunityBacklogItem[]> {
  const ledger = await getSopEvolutionLedger(store, {
    limit: Number.MAX_SAFE_INTEGER,
    vaultRoot
  });
  const pendingFollowupRefs = new Set(
    ledger.latest_followups
      .filter((item) => item.status === "pending")
      .map((item) => item.ref)
  );
  return ledger.entries
    .filter((entry) => isOpenSopEvolutionDecision(entry.latest_decision))
    .filter((entry) => entry.followup_refs.every((ref) => !pendingFollowupRefs.has(ref)))
    .map((entry) => sopEvolutionChainItem(entry));
}

async function readSelfEvolutionGapItems(store: AgentStore): Promise<OpportunityBacklogItem[]> {
  const [result, iterationResult] = await Promise.all([
    listSelfEvolutionGaps(store, { limit: MAX_SELF_EVOLUTION_GAP_ITEMS }),
    listSelfEvolutionIterations(store, { limit: MAX_SELF_EVOLUTION_GAP_ITEMS })
  ]);
  const iterationByRef = new Map<string, SelfEvolutionIterationContract>();
  for (const iteration of iterationResult.iterations) {
    iterationByRef.set(iteration.ref, iteration);
    iterationByRef.set(iteration.id, iteration);
  }
  return result.gaps.map((gap) => {
    const isWaiting = gap.status === "waiting";
    const actNextCommand = selfEvolutionActNextCommandForGap(gap);
    const actionKind = selfEvolutionActionKindForGap(gap, actNextCommand);
    const sourceIteration = iterationByRef.get(gap.source_ref);
    const isCoreBasicIterationOutcomeFollowUp = Boolean(
      sourceIteration
      && gap.source === "iteration_outcome"
      && gap.follow_up_kind === "sop_candidate"
      && CORE_BASIC_ITERATION_LAYERS.has(sourceIteration.layer)
    );
    const growthValue: GrowthValue = isCoreBasicIterationOutcomeFollowUp
      ? {
          capability_gain: 1,
          repeat_demand: 1,
          evidence_available: gap.evidence_refs.length > 0 ? 4 : 2,
          urgency_or_unblock: 0,
          risk: 2,
          cost: 1
        }
      : {
          capability_gain: isWaiting ? 2 : 4,
          repeat_demand: isWaiting ? 2 : 3,
          evidence_available: gap.evidence_refs.length > 0 ? 4 : 2,
          urgency_or_unblock: isWaiting ? 0 : 3,
          risk: 2,
          cost: 2
        };
    return buildItem({
      kind: "self_evolution_gap",
      ref: gap.ref,
      id: gap.id,
      status: gap.status,
      title: gap.title,
      summary: gap.observed_problem,
      action_kind: actionKind,
      source_ref: gap.source_ref,
      self_evolution_gap: {
        gap_id: gap.id,
        gap_ref: gap.ref,
        source: gap.source,
        source_ref: gap.source_ref,
        owner_surface: gap.owner_surface,
        proposed_slice: gap.proposed_slice,
        follow_up_kind: gap.follow_up_kind,
        evidence_refs: gap.evidence_refs,
        evidence_ref_count: gap.evidence_refs.length,
        acceptance: gap.acceptance,
        acceptance_count: gap.acceptance.length,
        non_goals: gap.non_goals,
        non_goal_count: gap.non_goals.length,
        inspect_command: gap.inspect_command,
        ...(gap.not_before_at ? { not_before_at: gap.not_before_at } : {}),
        verification_commands: gap.verification_commands,
        boundary: gap.boundary
      },
      growth_value: growthValue,
      budget_hint: {
        max_turns: 2,
        max_tool_calls: actNextCommand ? 3 : 2,
        side_effect_level: actNextCommand ? "local_write" : "none"
      },
      next_step: isCoreBasicIterationOutcomeFollowUp
        ? `Inspect the derived gap as a low-priority learning follow-up after the project-design plan: ${gap.inspect_command}. Do not draft a SOP unless the lesson recurs outside the core/basic project-design artifact.`
        : actNextCommand
        ? `Inspect the derived gap, then run the typed opportunity executor: ${actNextCommand}.`
        : actionKind === "draft_sop"
        ? `Inspect the derived gap, then run review tick to materialize a SOP candidate inbox item: pnpm run runtime -- review tick --state-root <state-root>.`
        : isWaiting && gap.not_before_at
        ? `Wait until ${gap.not_before_at}, then inspect the derived gap again: ${gap.inspect_command}.`
        : `Inspect the derived gap before implementation: ${gap.inspect_command}. Then decide whether to implement ${gap.proposed_slice}.`,
      score_reasons: [
        "self_evolution_gap",
        `owner_surface=${gap.owner_surface}`,
        `proposed_slice=${gap.proposed_slice}`,
        `follow_up_kind=${gap.follow_up_kind}`,
        `evidence_refs=${gap.evidence_refs.length}`,
        `source=${gap.source}`,
        ...(sourceIteration ? [`source_iteration_layer=${sourceIteration.layer}`] : []),
        ...(isCoreBasicIterationOutcomeFollowUp ? ["core_basic_iteration_outcome_followup=demoted"] : []),
        ...(gap.not_before_at ? [`not_before_at=${gap.not_before_at}`] : [])
      ],
      created_at: gap.created_at,
      updated_at: gap.updated_at
    });
  });
}

function sopEvolutionChainItem(entry: SopEvolutionLedgerEntry): OpportunityBacklogItem {
  return buildItem({
    kind: "sop_evolution_chain",
    ref: entry.sop_ref,
    id: entry.sop_id,
    status: entry.latest_decision,
    title: `Advance SOP evolution: ${entry.title}`,
    summary: `SOP chain is ${entry.latest_decision}; ${entry.next_action}`,
    action_kind: actionKindForSopDecision(entry.latest_decision),
    source_ref: sopEvolutionSourceRef(entry),
    growth_value: growthForSopEvolutionDecision(entry),
    budget_hint: {
      max_turns: 1,
      max_tool_calls: 2,
      side_effect_level: "none"
    },
    next_step: entry.next_action,
    next_command: entry.next_command,
    score_reasons: [
      `sop evolution latest=${entry.latest_decision}`,
      `sop_status=${entry.sop_status}`,
      entry.latest_audit_verdict ? `audit=${entry.latest_audit_verdict}` : "no latest audit"
    ],
    updated_at: entry.updated_at
  });
}

function sopEvolutionSourceRef(entry: SopEvolutionLedgerEntry): string | undefined {
  if (entry.audit_refs[0]) return entry.audit_refs[0];
  if (entry.review_refs[0]) return entry.review_refs[0];
  if (entry.event_ids[0]) return `memory/episodes/events.jsonl#${entry.event_ids[0]}`;
  return undefined;
}

interface OpportunityRecord {
  id: string;
  ref: string;
  value: Partial<Opportunity> & Record<string, unknown>;
  original_status: string;
  current_status: string;
  decision?: OpportunityDecisionWithRef;
}

async function readOpportunityRecords(store: AgentStore): Promise<OpportunityRecord[]> {
  const raw = await store.readStateText(OPPORTUNITIES_REF);
  if (!raw.trim()) return [];
  const decisions = await readOpportunityDecisions(store);
  return raw.split(/\r?\n/)
    .map((line, index) => parseOpportunityRecord(line, index + 1, decisions))
    .filter((record): record is OpportunityRecord => record !== null);
}

function parseOpportunityRecord(
  line: string,
  rowIndex: number,
  decisions: OpportunityDecisionWithRef[]
): OpportunityRecord | null {
  if (!line.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const status = stringField(parsed, "status");
  const id = stringField(parsed, "id");
  if (!id || !status) return null;
  const ref = `${OPPORTUNITIES_REF}#${rowIndex}`;
  const latestDecision = decisions
    .filter((decision) => decision.opportunity_id === id || decision.opportunity_ref === ref)
    .at(-1);
  return {
    id,
    ref,
    value: parsed as Partial<Opportunity> & Record<string, unknown>,
    original_status: status,
    current_status: latestDecision?.status ?? status,
    decision: latestDecision
  };
}

function opportunityRecordItem(record: OpportunityRecord): OpportunityBacklogItem | null {
  if (record.original_status !== "open" && record.original_status !== "deferred") return null;
  const opportunity = record.value;
  const growthValue = normalizeGrowthValue(opportunity.growth_value);
  const budgetHint = normalizeBudgetHint(opportunity.budget_hint);
  const description = stringField(opportunity, "description") ?? "Open local opportunity.";
  const decisionReason = record.decision?.reason;
  return buildItem({
    kind: "open_opportunity",
    ref: record.ref,
    id: record.id,
    status: record.current_status,
    title: stringField(opportunity, "source") ?? "Open opportunity",
    summary: decisionReason ? `${description} Decision: ${decisionReason}` : description,
    source_ref: firstString(opportunity.evidence_refs),
    opportunity_decision: record.decision,
    growth_value: growthValue,
    budget_hint: budgetHint,
    next_step: `Decide explicitly if this opportunity should stay visible: pnpm run runtime -- governance decide-opportunity --opportunity ${record.id} --status deferred --reason "..."`,
    score_reasons: [
      "open opportunity record",
      `status=${record.current_status}`,
      `source=${stringField(opportunity, "source") ?? "unknown"}`,
      ...(record.decision ? [`last_decision=${record.decision.status}`] : [])
    ],
    created_at: stringField(opportunity, "created_at") ?? undefined,
    updated_at: record.decision?.created_at
  });
}

function applyOpportunityDecision(
  item: OpportunityBacklogItem,
  decisions: OpportunityDecisionWithRef[]
): OpportunityBacklogItem | null {
  if (item.kind === "open_opportunity") return item;
  const decision = latestOpportunityDecisionForItem(decisions, item);
  if (!decision) return item;
  if (decision.status === "completed" || decision.status === "retired") return null;
  if (decision.status === "open") {
    return {
      ...item,
      opportunity_decision: decision,
      updated_at: decision.created_at
    };
  }
  return {
    ...item,
    status: "deferred",
    score: Math.min(item.score, 40),
    summary: `${item.summary} Decision: ${decision.reason}`,
    opportunity_decision: decision,
    next_step: `Reopen this backlog decision if it should become active again: pnpm run runtime -- governance decide-opportunity --opportunity ${shellArg(item.id)} --status open --reason "..."`,
    score_reasons: [
      ...item.score_reasons,
      `opportunity_decision=${decision.status}`,
      `opportunity_decision_ref=${decision.ref}`
    ],
    updated_at: decision.created_at
  };
}

function latestOpportunityDecisionForItem(
  decisions: OpportunityDecisionWithRef[],
  item: OpportunityBacklogItem
): OpportunityDecisionWithRef | undefined {
  return decisions
    .filter((decision) => opportunityDecisionMatchesItem(decision, item))
    .at(-1);
}

function opportunityDecisionMatchesItem(
  decision: OpportunityDecisionRecord,
  item: OpportunityBacklogItem
): boolean {
  if (decision.opportunity_kind && decision.opportunity_kind !== item.kind) return false;
  return decision.opportunity_id === item.id || decision.opportunity_ref === item.ref;
}

async function readOpportunityDecisions(store: AgentStore): Promise<OpportunityDecisionWithRef[]> {
  const raw = await store.readStateText(OPPORTUNITY_DECISIONS_REF);
  if (!raw.trim()) return [];
  return raw.split(/\r?\n/)
    .map((line, index) => parseOpportunityDecision(line, index + 1))
    .filter((record): record is OpportunityDecisionWithRef => record !== null);
}

function parseOpportunityDecision(line: string, rowIndex: number): OpportunityDecisionWithRef | null {
  if (!line.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const id = stringField(parsed, "id");
  const opportunityId = stringField(parsed, "opportunity_id");
  const opportunityRef = stringField(parsed, "opportunity_ref");
  const opportunityKind = opportunityKindField(parsed, "opportunity_kind");
  const status = stringField(parsed, "status");
  const previousStatus = stringField(parsed, "previous_status");
  const reason = stringField(parsed, "reason");
  const createdAt = stringField(parsed, "created_at");
  const actionChainSnapshot = actionChainSnapshotField(parsed.action_chain_snapshot);
  if (!id || !opportunityId || !opportunityRef || !status || !previousStatus || !reason || !createdAt) return null;
  if (!isOpportunityDecisionStatus(status)) return null;
  return {
    id,
    opportunity_id: opportunityId,
    opportunity_ref: opportunityRef,
    ...(opportunityKind ? { opportunity_kind: opportunityKind } : {}),
    status,
    previous_status: previousStatus,
    reason,
    ...(actionChainSnapshot ? { action_chain_snapshot: actionChainSnapshot } : {}),
    created_at: createdAt,
    ref: `${OPPORTUNITY_DECISIONS_REF}#${rowIndex}`
  };
}

function resolveOpportunityRecord(records: OpportunityRecord[], opportunity: string): OpportunityRecord | null {
  const normalized = opportunity.trim();
  if (!normalized) return null;
  return records.find((record) => record.ref === normalized || record.id === normalized) ?? null;
}

function resolveOpportunityBacklogItem(items: OpportunityBacklogItem[], opportunity: string): OpportunityBacklogItem | null {
  const normalized = opportunity.trim();
  if (!normalized) return null;
  return items.find((item) => item.ref === normalized || item.id === normalized) ?? null;
}

function resolveLatestOpportunityDecision(
  decisions: OpportunityDecisionWithRef[],
  opportunity: string
): OpportunityDecisionWithRef | null {
  const normalized = opportunity.trim();
  if (!normalized) return null;
  return decisions
    .filter((decision) => decision.opportunity_id === normalized || decision.opportunity_ref === normalized)
    .at(-1) ?? null;
}

export function opportunityDecisionCommand(
  item: Pick<OpportunityBacklogItem, "id" | "kind" | "status">
): string | null {
  if (!hasOpportunityDecisionCommand(item)) return null;
  const status: OpportunityDecisionStatus = item.status === "deferred" ? "open" : "deferred";
  return [
    "pnpm run runtime -- governance decide-opportunity",
    `--opportunity ${shellArg(item.id)}`,
    `--status ${status}`,
    "--reason \"...\"",
    "--state-root <state-root>"
  ].join(" ");
}

export function hasOpportunityDecisionCommand(item: Pick<OpportunityBacklogItem, "kind">): boolean {
  return item.kind === "open_opportunity" || isDerivedDecidableBacklogKind(item.kind);
}

function withOpportunityDecisionCommand(item: OpportunityBacklogItem): OpportunityBacklogItem {
  const decisionCommand = opportunityDecisionCommand(item);
  if (!decisionCommand) return item;
  return {
    ...item,
    decision_command: decisionCommand
  };
}

function withActionChain(item: OpportunityBacklogItem): OpportunityBacklogItem {
  const actionChain = opportunityActionChain(item);
  if (actionChain.length === 0) return item;
  return {
    ...item,
    action_chain: actionChain
  };
}

function opportunityActionChain(item: OpportunityBacklogItem): OpportunityActionChainStep[] {
  const steps: OpportunityActionChainStep[] = [];
  const inspectCommand = inspectCommandForItem(item);
  if (inspectCommand) {
    pushActionStep(steps, {
      label: "inspect",
      command: inspectCommand,
      effect: "read_only",
      reason: "Inspect the bounded read model before deciding or acting."
    });
  }
  if (item.completion_verification?.trace_command) {
    pushActionStep(steps, {
      label: "trace",
      command: item.completion_verification.trace_command,
      effect: "read_only",
      reason: "Inspect the bounded live-run trace before changing runtime behavior."
    });
  }
  for (const step of explicitActionStepsForItem(item)) pushActionStep(steps, step);
  if (item.decision_command) {
    pushActionStep(steps, {
      label: "record_decision",
      command: item.decision_command,
      effect: "state_decision",
      reason: "Record an append-only backlog decision when the issue is deferred, reopened, completed, or retired."
    });
  }
  return steps;
}

function actionChainSnapshot(actionChain: OpportunityActionChainStep[]): OpportunityDecisionActionChainSnapshotStep[] {
  return actionChain.map((step) => ({
    label: step.label,
    effect: step.effect,
    ...(step.reason ? { reason: step.reason } : {})
  }));
}

function inspectCommandForItem(item: OpportunityBacklogItem): string | null {
  return item.service_health?.inspect_command
    ?? item.archive_health?.inspect_command
    ?? item.skill_registry_health?.inspect_command
    ?? item.context_health?.inspect_command
    ?? item.context_pressure?.inspect_command
    ?? item.working_checkpoint?.inspect_command
    ?? item.pipeline_run?.inspect_command
    ?? item.repo_write_guard?.inspect_command
    ?? item.completion_verification?.inspect_command
    ?? item.self_evolution_gap?.inspect_command
    ?? null;
}

function explicitActionStepsForItem(item: OpportunityBacklogItem): OpportunityActionChainStep[] {
  const steps: OpportunityActionChainStep[] = [];
  if (item.service_health?.deployment_status === "stale") {
    steps.push({
      label: "restart_service",
      command: item.service_health.restart_command,
      effect: "service_control",
      reason: "Restart only after inspecting stale resident runtime health."
    });
  } else if (item.service_health?.content_daily_current_step_freshness === "stale") {
    steps.push({
      label: "restart_service",
      command: item.service_health.restart_command,
      effect: "service_control",
      reason: "Restart only after inspecting that the resident daily content step is still stale."
    });
  }
  if (item.archive_health?.refresh_command) {
    steps.push({
      label: "refresh_archives",
      command: item.archive_health.refresh_command,
      effect: "local_write",
      reason: "Refresh local archive summaries after confirming the archive issue is still current."
    });
  }
  if (item.skill_registry_health?.sync_command) {
    steps.push({
      label: "sync_skill_registry",
      command: item.skill_registry_health.sync_command,
      effect: "local_write",
      reason: "Sync active-vault registry metadata after inspecting registry drift."
    });
  }
  if (item.skill_registry_health?.retire_event_command) {
    steps.push({
      label: "retire_skill_event",
      command: item.skill_registry_health.retire_event_command,
      effect: "local_write",
      reason: "Append a retired skill registry event only after confirming the orphan event is historical."
    });
  }
  if (item.pipeline_run?.resume_command) {
    steps.push({
      label: "resume_pipeline",
      command: item.pipeline_run.resume_command,
      effect: "runtime_execution",
      reason: "Resume only after inspecting the blocked or failed pipeline checkpoint."
    });
  }
  const harnessReplayActNextCommand = harnessReplayActNextCommandForItem(item);
  if (harnessReplayActNextCommand) {
    steps.push({
      label: "act_next",
      command: harnessReplayActNextCommand,
      effect: "runtime_execution",
      reason: "Run the typed opportunity executor to create a bounded harness replay audit."
    });
  }
  const selfEvolutionActNextCommand = item.self_evolution_gap
    ? selfEvolutionActNextCommandForBacklogItem(item)
    : null;
  if (selfEvolutionActNextCommand) {
    steps.push({
      label: "act_next",
      command: selfEvolutionActNextCommand,
      effect: "runtime_execution",
      reason: "Run the typed opportunity executor only for supported self-evolution gap slices."
    });
  }
  if (item.self_evolution_gap?.follow_up_kind === "sop_candidate") {
    steps.push({
      label: "review_tick",
      command: "pnpm run runtime -- review tick --state-root <state-root>",
      effect: "local_write",
      reason: "Materialize the derived self-evolution gap as a SOP candidate inbox item without drafting or promoting it automatically."
    });
  }
  const selfEvolutionVerificationCommand = item.self_evolution_gap
    ? firstReadOnlyVerificationCommand(item.self_evolution_gap.verification_commands)
    : null;
  if (selfEvolutionVerificationCommand) {
    steps.push({
      label: "verify_gap",
      command: selfEvolutionVerificationCommand,
      effect: "read_only",
      reason: "Run the first bounded verification command before implementing or closing the derived gap."
    });
  }
  if (item.context_health?.operator_guidance.repair_manifest_command) {
    steps.push({
      label: "repair_context_manifest",
      command: item.context_health.operator_guidance.repair_manifest_command,
      effect: "local_write",
      reason: "Repair the missing context manifest sidecar only after inspecting the selected orphan context Markdown."
    });
  }
  if (item.context_health?.operator_guidance.complete_after_external_repair_command) {
    steps.push({
      label: "complete_after_repair",
      command: item.context_health.operator_guidance.complete_after_external_repair_command,
      effect: "state_decision",
      reason: "Mark the context issue completed only after external repair is confirmed."
    });
  }
  if (item.context_health?.operator_guidance.retire_historical_issue_command) {
    steps.push({
      label: "retire_historical",
      command: item.context_health.operator_guidance.retire_historical_issue_command,
      effect: "state_decision",
      reason: "Retire only when the issue is historical and no current repair is needed."
    });
  }
  if (item.context_pressure?.operator_guidance.complete_after_external_mitigation_command) {
    steps.push({
      label: "complete_after_mitigation",
      command: item.context_pressure.operator_guidance.complete_after_external_mitigation_command,
      effect: "state_decision",
      reason: "Mark context pressure completed only after an explicit external mitigation or assembly change is confirmed."
    });
  }
  if (item.context_pressure?.operator_guidance.retire_historical_pressure_command) {
    steps.push({
      label: "retire_historical",
      command: item.context_pressure.operator_guidance.retire_historical_pressure_command,
      effect: "state_decision",
      reason: "Retire only when the context pressure is historical and no current mitigation is needed."
    });
  }
  if (item.next_command) {
    steps.push({
      label: "request_confirmation",
      command: item.next_command.request_command,
      effect: "state_decision",
      reason: "Request explicit confirmation before mutating SOP evolution state."
    });
    steps.push({
      label: item.next_command.action_kind,
      command: item.next_command.command,
      effect: "local_write",
      reason: "Run only after the matching confirmation gate is ready."
    });
  }
  return steps;
}

function harnessReplayActNextCommandForItem(item: OpportunityBacklogItem): string | null {
  if (item.kind === "completion_verification" && item.completion_verification?.completion_id) {
    return [
      "pnpm run runtime -- governance act-next",
      `--opportunity ${shellArg(item.completion_verification.completion_id)}`,
      "--state-root <state-root>"
    ].join(" ");
  }
  if (item.kind === "repo_write_guard" && item.repo_write_guard?.trace_ref) {
    return [
      "pnpm run runtime -- governance act-next",
      `--opportunity ${shellArg(item.id)}`,
      "--state-root <state-root>"
    ].join(" ");
  }
  return null;
}

function selfEvolutionActNextCommandForBacklogItem(item: OpportunityBacklogItem): string | null {
  const gap = item.self_evolution_gap;
  if (!gap) return null;
  return selfEvolutionActNextCommand({
    id: gap.gap_id,
    status: item.status,
    proposed_slice: gap.proposed_slice,
    source_ref: gap.source_ref
  });
}

function selfEvolutionActNextCommandForGap(gap: SelfEvolutionGap): string | null {
  return selfEvolutionActNextCommand({
    id: gap.id,
    status: gap.status,
    proposed_slice: gap.proposed_slice,
    source_ref: gap.source_ref
  });
}

function selfEvolutionActionKindForGap(gap: SelfEvolutionGap, actNextCommand: string | null): string {
  if (gap.follow_up_kind === "act_next" && actNextCommand) return "act_next";
  if (gap.follow_up_kind === "sop_candidate") return "draft_sop";
  return "narrow_review";
}

function selfEvolutionActNextCommand(gap: {
  id: string;
  status: string;
  proposed_slice: string;
  source_ref?: string;
}): string | null {
  if (gap.status !== "active") return null;
  if (!gap.source_ref) return null;
  if (!SUPPORTED_ACT_NEXT_SELF_EVOLUTION_SLICES.has(gap.proposed_slice)) return null;
  const parts = [
    "pnpm run runtime -- governance act-next",
    `--opportunity ${shellArg(gap.id)}`
  ];
  if (gap.proposed_slice === "external_publish_preflight_contract"
    || gap.proposed_slice === "post_publish_feedback_capture_contract") {
    parts.push(`--server-url ${ACT_NEXT_MCP_SERVER_URL}`);
  }
  if (gap.proposed_slice === "creator_metrics_capture_readiness_loop") {
    parts.push("--browser-auto-connect");
    parts.push(`--browser-session-name ${CREATOR_METRICS_BROWSER_SESSION_NAME}`);
  }
  parts.push("--state-root <state-root>");
  return parts.join(" ");
}

function firstReadOnlyVerificationCommand(commands: string[]): string | null {
  return commands.find((command) =>
    !isTestCommand(command) && isReadOnlyVerificationCommand(command)
  ) ?? null;
}

function isTestCommand(command: string): boolean {
  return /\b(test|tsx --test|pnpm run check)\b/.test(command);
}

function isReadOnlyVerificationCommand(command: string): boolean {
  if (hasCliAction(command, "content run")) return false;
  if (hasCliAction(command, "content daily")) return false;
  if (hasCliAction(command, "content daily-advance")) return false;
  if (hasCliAction(command, "content generate-image")) return false;
  if (hasCliAction(command, "content publish-preflight")) return false;
  if (hasCliAction(command, "content publish-execute")) return false;
  if (hasCliAction(command, "content feedback-evidence")) return false;
  if (hasCliAction(command, "content feedback-capture")) return false;
  if (hasCliAction(command, "content feedback-refresh")) return false;
  if (hasCliAction(command, "content creator-metrics-capture")) return false;
  if (hasCliAction(command, "governance act-next")) return false;
  if (hasCliAction(command, "governance decide-opportunity")) return false;
  if (hasCliAction(command, "service restart")) return false;
  if (hasCliAction(command, "config set-runtime")) return false;
  return true;
}

function hasCliAction(command: string, action: string): boolean {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:\\s|$)`).test(command);
}

function pushActionStep(steps: OpportunityActionChainStep[], step: OpportunityActionChainStep): void {
  if (!step.command.trim()) return;
  if (steps.some((item) => item.command === step.command)) return;
  steps.push(step);
}

function isDerivedDecidableBacklogItem(item: OpportunityBacklogItem): boolean {
  return isDerivedDecidableBacklogKind(item.kind);
}

function isDerivedDecidableBacklogKind(kind: OpportunityBacklogKind): boolean {
  return kind === "service_health"
    || kind === "completion_verification"
    || kind === "archive_health"
    || kind === "skill_registry_health"
    || kind === "context_health"
    || kind === "context_pressure"
    || kind === "working_checkpoint"
    || kind === "pipeline_run"
    || kind === "repo_write_guard"
    || kind === "selected_skill_outcome"
    || kind === "selected_skill_drift"
    || kind === "self_evolution_gap";
}

async function countJsonlRows(store: AgentStore, ref: string): Promise<number> {
  const raw = await store.readStateText(ref);
  if (!raw.trim()) return 0;
  return raw.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function isOpportunityDecisionStatus(value: string): value is OpportunityDecisionStatus {
  return value === "open" || value === "deferred" || value === "completed" || value === "retired";
}

function actionChainSnapshotField(value: unknown): OpportunityDecisionActionChainSnapshotStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value
    .map((item): OpportunityDecisionActionChainSnapshotStep | null => {
      if (!isRecord(item)) return null;
      const label = stringField(item, "label");
      const effect = stringField(item, "effect");
      if (!label || !isOpportunityActionChainEffect(effect)) return null;
      const reason = stringField(item, "reason");
      return {
        label,
        effect,
        ...(reason ? { reason } : {})
      };
    })
    .filter((item): item is OpportunityDecisionActionChainSnapshotStep => item !== null);
  return steps.length > 0 ? steps : undefined;
}

function isOpportunityActionChainEffect(value: string | null): value is OpportunityActionChainEffect {
  return value === "read_only"
    || value === "state_decision"
    || value === "local_write"
    || value === "runtime_execution"
    || value === "service_control";
}

function suppressRecoveredStaleConfirmation(decision: SopRecoveryDecisionWithRef): boolean {
  return decision.status === "historical" || decision.status === "fresh_requested";
}

function reusedSkillCoverageCommand(
  confirmation: Record<string, unknown>,
  action: Record<string, unknown> | null
): string | null {
  const sopRef = reusedSkillCoverageSopRef(confirmation, action);
  if (!sopRef) return null;
  return `pnpm run runtime -- review coverage --sop ${shellArg(refId(sopRef))}`;
}

async function withReusedSkillCoverage(
  store: AgentStore,
  vaultRoot: SkillResolverLike,
  item: OpportunityBacklogItem,
  record: unknown,
  action: Record<string, unknown> | null
): Promise<OpportunityBacklogItem> {
  if (item.action_kind !== "revise_skill" || !isRecord(record)) return item;
  const sopRef = reusedSkillCoverageSopRef(record, action);
  if (!sopRef) return item;
  try {
    const coverage = await getReusedSkillCoverage(store, {
      sopRef,
      vaultRoot
    });
    const coveredReviewInbox = item.kind === "review_inbox" && coverage.coverage_status === "covered";
    return {
      ...item,
      ...(coveredReviewInbox ? {
        score: Math.min(item.score, 35),
        next_step: `Coverage is current; complete or retire this inbox item unless fresh drift evidence exists: pnpm run runtime -- review decide-inbox --item ${shellArg(item.id)} --status completed --reason "..."`
      } : {}),
      reused_skill_coverage: {
        sop_id: coverage.sop_id,
        sop_ref: coverage.sop_ref,
        status: coverage.coverage_status,
        current_duplicate_skill_ref: coverage.current_duplicate_skill_ref,
        recorded_duplicate_skill_refs: coverage.recorded_duplicate_skill_refs,
        missing_skill_refs: coverage.missing_skill_refs,
        next_step: coverage.next_step
      },
      score_reasons: [
        ...item.score_reasons,
        `reused_skill_coverage=${coverage.coverage_status}`
      ]
    };
  } catch {
    return item;
  }
}

async function withDraftSopReadiness(
  store: AgentStore,
  item: OpportunityBacklogItem,
  record: unknown,
  action: Record<string, unknown> | null
): Promise<OpportunityBacklogItem> {
  if (item.action_kind !== "draft_sop" || !isRecord(record)) return item;
  try {
    const readiness = await getDraftSopReadiness(store, {
      reviewRef: draftSopReadinessReviewRef(record),
      proposalId: stringField(record, "proposal_id"),
      requiredRefs: uniqueStringList([
        ...stringList(record.required_refs),
        ...stringList(action?.required_refs)
      ])
    });
    const score = readiness.status === "covered_by_existing_sop"
      ? Math.min(item.score, 35)
      : item.score;
    return {
      ...item,
      score,
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
      },
      score_reasons: [
        ...item.score_reasons,
        `draft_sop_readiness=${readiness.status}`
      ]
    };
  } catch {
    return item;
  }
}

function draftSopReadinessReviewRef(record: Record<string, unknown>): string | null {
  return stringField(record, "latest_review_ref")
    ?? stringField(record, "review_ref")
    ?? stringField(record, "first_review_ref")
    ?? null;
}

async function withNarrowReviewReadiness(
  store: AgentStore,
  item: OpportunityBacklogItem,
  record: unknown
): Promise<OpportunityBacklogItem> {
  if (item.action_kind !== "narrow_review" || !isRecord(record)) return item;
  const archiveRefs = stringList(record.required_refs).filter(isArchiveSummaryRef);
  if (archiveRefs.length === 0) return item;
  try {
    const healthChecks = await Promise.all(archiveRefs.map((archiveRef) =>
      getArchiveHealth(store, { archiveRef })
    ));
    if (healthChecks.some((health) => health.count > 0)) return item;
    return {
      ...item,
      score: Math.min(item.score, 35),
      next_step: `Required archive health is current; complete or retire this inbox item unless fresh archive drift exists: pnpm run runtime -- review decide-inbox --item ${shellArg(item.id)} --status completed --reason "Archive health is current after explicit refresh."`,
      score_reasons: [
        ...item.score_reasons,
        "narrow_review_archive_health=covered"
      ]
    };
  } catch {
    return item;
  }
}

function isArchiveSummaryRef(value: string): boolean {
  return /^memory\/archives\/[^/]+\.json$/.test(value);
}

function reusedSkillCoverageSopRef(
  record: Record<string, unknown>,
  action: Record<string, unknown> | null
): string | null {
  return stringField(record, "sop_id")
    ?? stringField(record, "sop_ref")
    ?? stringList(record.required_refs).find(isSopDraftRef)
    ?? stringList(action?.required_refs).find(isSopDraftRef)
    ?? null;
}

function growthForActionKind(actionKind: string, status: string): GrowthValue {
  const base: GrowthValue = {
    capability_gain: 3,
    repeat_demand: 2,
    evidence_available: 4,
    urgency_or_unblock: status === "confirmation_requested" || status === "confirmation" ? 3 : 2,
    risk: 1,
    cost: 1
  };
  if (actionKind === "promote_sop" || actionKind === "revise_skill") {
    return { ...base, capability_gain: 5, evidence_available: 5, risk: 2, cost: 2 };
  }
  if (actionKind === "draft_sop" || actionKind === "audit_sop") {
    return { ...base, capability_gain: 4, evidence_available: 5 };
  }
  if (actionKind === "narrow_review" || actionKind === "collect_evidence") {
    return { ...base, evidence_available: 3, risk: 0 };
  }
  return base;
}

function growthForStaleSopConfirmation(
  actionKind: string,
  recoveryDecision?: SopRecoveryDecisionWithRef
): GrowthValue {
  const base = growthForActionKind(actionKind, "confirmation");
  if (recoveryDecision?.status === "deferred") {
    return {
      ...base,
      capability_gain: Math.min(base.capability_gain, 2),
      urgency_or_unblock: 1,
      risk: 0
    };
  }
  return base;
}

function growthForReviewInboxAction(
  actionKind: string,
  status: string,
  decision?: ReviewInboxDecisionWithRef
): GrowthValue {
  const base = growthForActionKind(actionKind, status);
  if (decision?.status === "deferred") {
    return {
      ...base,
      capability_gain: Math.min(base.capability_gain, 2),
      urgency_or_unblock: 1,
      risk: 0
    };
  }
  return base;
}

function growthForSopEvolutionDecision(entry: SopEvolutionLedgerEntry): GrowthValue {
  const base: GrowthValue = {
    capability_gain: 4,
    repeat_demand: 2,
    evidence_available: entry.audit_refs.length > 0 || entry.event_ids.length > 0 ? 5 : 3,
    urgency_or_unblock: 3,
    risk: 1,
    cost: 1
  };
  if (entry.latest_decision === "audited") {
    return { ...base, capability_gain: 5, urgency_or_unblock: 4, risk: 2, cost: 2 };
  }
  if (entry.latest_decision === "revision_needed") {
    return { ...base, capability_gain: 4, urgency_or_unblock: 4, risk: 2 };
  }
  if (entry.latest_decision === "unknown") {
    return { ...base, evidence_available: 2, urgency_or_unblock: 2, risk: 2 };
  }
  return base;
}

function growthForArchiveHealth(issue: ArchiveHealthIssue): GrowthValue {
  const base: GrowthValue = {
    capability_gain: 1,
    repeat_demand: 1,
    evidence_available: 3,
    urgency_or_unblock: 1,
    risk: 2,
    cost: 2
  };
  if (issue.kind === "missing_archive" || issue.kind === "stale_archive") {
    return base;
  }
  if (issue.kind === "invalid_archive" || issue.kind === "invalid_event_row") {
    return {
      ...base,
      capability_gain: 2,
      evidence_available: 3,
      urgency_or_unblock: 2,
      risk: 2
    };
  }
  return { ...base, evidence_available: 3, risk: 0 };
}

function growthForSkillRegistryHealth(issue: SkillRegistryHealthIssue): GrowthValue {
  const base: GrowthValue = {
    capability_gain: 2,
    repeat_demand: 2,
    evidence_available: 4,
    urgency_or_unblock: 2,
    risk: 1,
    cost: 1
  };
  if (issue.status === "error") {
    return { ...base, capability_gain: 3, urgency_or_unblock: 4, risk: 2 };
  }
  if (issue.kind === "registry_metadata_drift" || issue.kind === "orphan_skill_package") {
    return { ...base, urgency_or_unblock: 2, risk: 1 };
  }
  return base;
}

function growthForCompletionReport(report: CompletionVerificationReport): GrowthValue {
  const base: GrowthValue = {
    capability_gain: 3,
    repeat_demand: 2,
    evidence_available: 5,
    urgency_or_unblock: 4,
    risk: 1,
    cost: 1
  };
  if (report.verification_status === "failed") {
    return { ...base, capability_gain: 4, urgency_or_unblock: 5, risk: 2 };
  }
  if (report.completion_status === "blocked") {
    return { ...base, urgency_or_unblock: 5, risk: 2, cost: 2 };
  }
  return base;
}

function growthForWorkingCheckpoint(checkpoint: WorkingCheckpointSummary): GrowthValue {
  const blocked = hasWorkingCheckpointBlockedSignal(checkpoint);
  return {
    capability_gain: 3,
    repeat_demand: 2,
    evidence_available: checkpoint.recent_evidence_ref_count > 0 || checkpoint.evidence_event_refs.length > 0 ? 5 : 3,
    urgency_or_unblock: blocked ? 4 : 3,
    risk: 1,
    cost: 1
  };
}

function growthForPipelineRun(run: PipelineHistorySummary): GrowthValue {
  const base: GrowthValue = {
    capability_gain: 3,
    repeat_demand: 2,
    evidence_available: run.stage_count > 0 ? 5 : 3,
    urgency_or_unblock: 4,
    risk: 1,
    cost: 1
  };
  if (run.status === "blocked") {
    return { ...base, capability_gain: 4, urgency_or_unblock: 5, risk: 2, cost: 2 };
  }
  return { ...base, capability_gain: 4, risk: 2 };
}

function growthForRepoWriteGuard(guard: LiveRunRepoWriteGuardSummary): GrowthValue {
  return {
    capability_gain: 2,
    repeat_demand: 1,
    evidence_available: 5,
    urgency_or_unblock: guard.changed_file_count_delta > 0 ? 3 : 2,
    risk: guard.before_status === "dirty" ? 2 : 1,
    cost: 1
  };
}

function growthForSelectedSkillOutcome(args: {
  completionStatus: string;
  verificationStatus: string;
  verified: boolean;
}): GrowthValue {
  const base: GrowthValue = {
    capability_gain: 4,
    repeat_demand: 2,
    evidence_available: 5,
    urgency_or_unblock: 4,
    risk: 2,
    cost: 1
  };
  if (args.completionStatus === "blocked" || args.completionStatus === "not_done") {
    return { ...base, urgency_or_unblock: 5, cost: 2 };
  }
  if (args.verificationStatus === "failed") {
    return { ...base, urgency_or_unblock: 5 };
  }
  if (!args.verified) {
    return { ...base, urgency_or_unblock: 4 };
  }
  return base;
}

function growthForSelectedSkillDrift(drift: SelectedSkillDriftSummary): GrowthValue {
  const repeatDemand = Math.min(5, Math.max(3, drift.attention_count));
  return {
    capability_gain: 4,
    repeat_demand: repeatDemand,
    evidence_available: 5,
    urgency_or_unblock: drift.failed_count > 0 || drift.blocked_count > 0 ? 5 : 4,
    risk: 2,
    cost: 2
  };
}

function growthForContextPressure(pressure: ContextPressureSummary): GrowthValue {
  if (pressure.status === "over_budget") {
    return {
      capability_gain: 3,
      repeat_demand: 2,
      evidence_available: 5,
      urgency_or_unblock: 3,
      risk: 2,
      cost: 2
    };
  }
  return {
    capability_gain: 2,
    repeat_demand: 1,
    evidence_available: 5,
    urgency_or_unblock: 2,
    risk: 2,
    cost: 2
  };
}

function growthForContextHealth(issue: ContextHealthIssue): GrowthValue {
  if (issue.status === "warning") {
    return {
      capability_gain: 1,
      repeat_demand: 1,
      evidence_available: 3,
      urgency_or_unblock: 1,
      risk: 1,
      cost: 1
    };
  }
  const base: GrowthValue = {
    capability_gain: 3,
    repeat_demand: 2,
    evidence_available: 5,
    urgency_or_unblock: 3,
    risk: 1,
    cost: 1
  };
  return { ...base, urgency_or_unblock: 4 };
}

function actionKindForSopDecision(decision: SopEvolutionLedgerEntry["latest_decision"]): string {
  if (decision === "drafted") return "audit_sop";
  if (decision === "audited") return "promote_sop";
  return "inspect_chain";
}

function isOpenSopEvolutionDecision(decision: SopEvolutionLedgerEntry["latest_decision"]): boolean {
  return decision === "drafted"
    || decision === "audited"
    || decision === "revision_needed"
    || decision === "unknown";
}

function growthForServiceHealth(health: ServiceHealthResult): GrowthValue {
  const base: GrowthValue = {
    capability_gain: 2,
    repeat_demand: 1,
    evidence_available: 3,
    urgency_or_unblock: 3,
    risk: 1,
    cost: 1
  };
  if (health.service.state !== "unknown" && health.service.state !== "running") {
    return { ...base, evidence_available: 4, urgency_or_unblock: 4 };
  }
  if (health.service.heartbeat_freshness === "invalid") {
    return { ...base, evidence_available: 2, urgency_or_unblock: 4 };
  }
  if (health.service.deployment.status === "stale") {
    return { ...base, evidence_available: 4, urgency_or_unblock: 4 };
  }
  if (health.service.runtime_build?.source_is_dirty === true) {
    return { ...base, evidence_available: 4, urgency_or_unblock: 2 };
  }
  if (health.content_daily.current_step_freshness === "stale") {
    return { ...base, evidence_available: 5, urgency_or_unblock: 4 };
  }
  if (residentLoopNeedsAttention(health.content_daily, health.autonomy_pause.active)
    || residentLoopNeedsAttention(health.content_feedback_refresh, health.autonomy_pause.active)
    || residentLoopNeedsAttention(health.content_creator_metrics, health.autonomy_pause.active)) {
    return { ...base, evidence_available: 4, urgency_or_unblock: 4 };
  }
  return base;
}

function buildItem(args: Omit<OpportunityBacklogItem, "score">): OpportunityBacklogItem {
  return {
    ...args,
    score: scoreGrowthValue(args.growth_value)
  };
}

function scoreGrowthValue(value: GrowthValue): number {
  const raw = value.capability_gain * 12
    + value.repeat_demand * 8
    + value.evidence_available * 10
    + value.urgency_or_unblock * 12
    - value.risk * 8
    - value.cost * 6;
  return Math.max(0, Math.min(100, raw));
}

function compareBacklogItems(left: OpportunityBacklogItem, right: OpportunityBacklogItem): number {
  return right.score - left.score
    || (right.updated_at ?? right.created_at ?? "").localeCompare(left.updated_at ?? left.created_at ?? "")
    || left.ref.localeCompare(right.ref);
}

function normalizeGrowthValue(value: unknown): GrowthValue {
  const record = isRecord(value) ? value : {};
  return {
    capability_gain: intField(record, "capability_gain"),
    repeat_demand: intField(record, "repeat_demand"),
    evidence_available: intField(record, "evidence_available"),
    urgency_or_unblock: intField(record, "urgency_or_unblock"),
    risk: intField(record, "risk"),
    cost: intField(record, "cost")
  };
}

function normalizeBudgetHint(value: unknown): BudgetHint {
  const record = isRecord(value) ? value : {};
  const sideEffect = stringField(record, "side_effect_level");
  return {
    max_turns: positiveIntField(record, "max_turns", 1),
    max_tool_calls: positiveIntField(record, "max_tool_calls", 3),
    side_effect_level: sideEffect === "none"
      || sideEffect === "local_reversible"
      || sideEffect === "local_write"
      || sideEffect === "external_write"
      ? sideEffect
      : "none"
  };
}

function intField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(5, value))
    : 0;
}

function positiveIntField(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function opportunityKindField(record: Record<string, unknown>, key: string): OpportunityBacklogKind | null {
  const value = stringField(record, key);
  if (!value) return null;
  return isOpportunityBacklogKind(value) ? value : null;
}

function isOpportunityBacklogKind(value: string): value is OpportunityBacklogKind {
  return value === "service_health"
    || value === "autonomy_pause"
    || value === "review_confirmation"
    || value === "memory_confirmation"
    || value === "review_inbox"
    || value === "memory_candidate"
    || value === "completion_verification"
    || value === "context_health"
    || value === "context_pressure"
    || value === "working_checkpoint"
    || value === "pipeline_run"
    || value === "repo_write_guard"
    || value === "selected_skill_drift"
    || value === "selected_skill_outcome"
    || value === "self_evolution_gap"
    || value === "sop_evolution_chain"
    || value === "open_opportunity";
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) ? value.find((item): item is string => typeof item === "string" && item.length > 0) : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function uniqueStringList(values: string[]): string[] {
  return Array.from(new Set(values));
}

function limitText(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars).trimEnd()}...` : value;
}

function modelDiagnosticRoundNumber(ref: string): number {
  const match = ref.match(/-model-diagnostic-r(\d+)\.json$/);
  return match ? Number(match[1]) : 0;
}

function renderStageCounts(counts: PipelineHistorySummary["stage_status_counts"]): string {
  const entries = Object.entries(counts).filter(([, count]) => count !== undefined && count > 0);
  return entries.length > 0 ? entries.map(([status, count]) => `${status}=${count}`).join(",") : "none";
}

function isSopDraftRef(ref: string): boolean {
  return ref.startsWith("sop/drafts/") || /^sop_[A-Za-z0-9_-]+$/.test(ref);
}

function refId(ref: string): string {
  return ref.split("#").at(-1)?.replace(/\.json$/, "").replace(/\.md$/, "").split("/").at(-1) ?? ref;
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
