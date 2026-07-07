import { AgentStore } from "../../core/src/store.js";
import { utcNow } from "../../core/src/ids.js";
import {
  getOpportunityBacklog,
  type OpportunityBacklogItem
} from "../../core/src/opportunity_backlog.js";
import {
  listSelfEvolutionGaps,
  type SelfEvolutionGapEffectiveStatus
} from "../../core/src/self_evolution_gaps.js";
import { listHarnessReplayAudits } from "../../core/src/harness_replay.js";
import {
  needsWorkingCheckpointAttention,
  listWorkingCheckpoints,
  type WorkingCheckpointSummary
} from "../../core/src/working_checkpoints.js";
import {
  getServiceHealth,
  type ServiceDeploymentSummary,
  type ServiceHeartbeatFreshness,
  type ServiceHealthStatus,
  type ServiceHealthResult,
  type ServiceRepoHeadSummary,
  type ServiceReviewTickFocusSummary,
  type ServiceRuntimeBuildSummary
} from "../../core/src/service_health.js";
import type { SkillResolverLike } from "../../core/src/skill_resolver.js";
import { BackgroundReviewRunner } from "./background_review.js";
import {
  listAcceptedSemanticMemories,
  listMemoryCandidateConfirmations,
  listMemoryCandidates
} from "./memory_candidates.js";

export interface GovernanceStatusResult {
  created_at: string;
  counts: {
    memory_candidates: StatusCounts;
    memory_confirmations: ConfirmationCounts;
    accepted_semantic_memory: {
      total: number;
    };
    review_inbox: StatusCounts & {
      active: number;
    };
    review_confirmations: ConfirmationCounts;
    opportunity_backlog: OpportunityBacklogCounts;
    working_checkpoints: {
      total: number;
    };
    harness_replays: {
      total: number;
      attention: number;
      clean: number;
    };
  };
  latest_refs: {
    memory_candidates: string[];
    memory_confirmations: string[];
    accepted_semantic_memory: string[];
    review_inbox: string[];
    review_confirmations: string[];
    opportunity_backlog: string[];
    working_checkpoints: string[];
    harness_replays: string[];
  };
  opportunity_backlog: {
    top_item?: GovernanceOpportunitySummary;
    actionable_item?: GovernanceOpportunitySummary;
    next_ready_at?: string;
    next_check?: GovernanceNextCheckSummary;
    attention_hint: string;
  };
  self_evolution_gaps: {
    total: number;
    by_effective_status: Partial<Record<SelfEvolutionGapEffectiveStatus, number>>;
    latest_refs: string[];
    attention_hint: string;
  };
  autonomy_pause: {
    active: boolean;
    ref: "autonomy/runs/pause_signal.json";
    reason?: string;
    resume_hint?: string;
    status?: string;
  };
  working_checkpoint: {
    current: WorkingCheckpointSummary | null;
    attention_hint: string;
    boundary: string;
  };
  service: {
    runtime: {
      state: string;
      pid?: number;
      channel_id?: string;
      scenario_id?: string;
      updated_at?: string;
      heartbeat_freshness: ServiceHeartbeatFreshness;
      heartbeat_age_ms?: number;
      health: ServiceHealthStatus;
      runtime_build?: ServiceRuntimeBuildSummary;
      repo_head: ServiceRepoHeadSummary;
      deployment: ServiceDeploymentSummary;
    };
    review_tick: {
      state: string;
      enabled: boolean;
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
  };
}

export interface StatusCounts {
  total: number;
  by_status: Record<string, number>;
}

export interface ConfirmationCounts {
  total: number;
  pending: number;
  executed: number;
}

export interface OpportunityBacklogCounts {
  total: number;
  by_kind: Record<string, number>;
  by_status: Record<string, number>;
}

export interface GovernanceOpportunitySummary {
  id: string;
  kind: OpportunityBacklogItem["kind"];
  ref: string;
  status: string;
  score: number;
  title: string;
  next_step: string;
  decision_command?: string;
  action_chain?: OpportunityBacklogItem["action_chain"];
  action_kind?: string;
  source_ref?: string;
  draft_sop_readiness?: OpportunityBacklogItem["draft_sop_readiness"];
  reused_skill_coverage?: OpportunityBacklogItem["reused_skill_coverage"];
  service_health?: OpportunityBacklogItem["service_health"];
  archive_health?: OpportunityBacklogItem["archive_health"];
  skill_registry_health?: OpportunityBacklogItem["skill_registry_health"];
  context_health?: OpportunityBacklogItem["context_health"];
  context_pressure?: OpportunityBacklogItem["context_pressure"];
  working_checkpoint?: OpportunityBacklogItem["working_checkpoint"];
  pipeline_run?: OpportunityBacklogItem["pipeline_run"];
  repo_write_guard?: OpportunityBacklogItem["repo_write_guard"];
  selected_skill_drift?: OpportunityBacklogItem["selected_skill_drift"];
  selected_skill_outcome?: OpportunityBacklogItem["selected_skill_outcome"];
  self_evolution_gap?: OpportunityBacklogItem["self_evolution_gap"];
  completion_verification?: OpportunityBacklogItem["completion_verification"];
  opportunity_decision?: OpportunityBacklogItem["opportunity_decision"];
}

export interface GovernanceNextCheckSummary {
  source: "review_tick" | "content_feedback_refresh" | "content_creator_metrics";
  state: string;
  next_wake_at: string;
  next_wake_delay_ms?: number;
  next_wake_reason?: string;
  next_due_at?: string;
  next_due_run_ref?: string;
}

export async function getGovernanceStatus(
  store: AgentStore,
  args: { limit?: number; vaultRoot?: SkillResolverLike } = {}
): Promise<GovernanceStatusResult> {
  await store.ensureLayout();
  const limit = args.limit ?? 10;
  const reviewRunner = new BackgroundReviewRunner({
    repoRoot: store.repoRoot,
    stateRoot: store.stateRoot,
    vaultRoot: args.vaultRoot
  });

  const [
    memoryCandidates,
    memoryConfirmations,
    acceptedMemory,
    reviewInboxAll,
    reviewInboxActive,
    reviewConfirmations,
    opportunityBacklog,
    selfEvolutionGaps,
    serviceHealth,
    workingCheckpoints,
    harnessReplays
  ] = await Promise.all([
    listMemoryCandidates(store),
    listMemoryCandidateConfirmations(store),
    listAcceptedSemanticMemories(store),
    reviewRunner.listReviewInbox({ status: "all" }),
    reviewRunner.listReviewInbox({ status: "active" }),
    reviewRunner.listReviewFollowUpConfirmations(),
    getOpportunityBacklog(store, { vaultRoot: args.vaultRoot }),
    listSelfEvolutionGaps(store, { limit: Math.max(limit, 10) }),
    getServiceHealth(store),
    listWorkingCheckpoints(store),
    listHarnessReplayAudits(store)
  ]);
  const topOpportunity = opportunityBacklog.items[0];
  const actionableOpportunity = opportunityBacklog.items.find(isActionableOpportunity);
  const nextReadyAt = nextWaitingOpportunityReadyAt(opportunityBacklog.items);
  const nextCheck = nextGovernanceResidentCheck(serviceHealth);

  return {
    created_at: utcNow(),
    counts: {
      memory_candidates: countStatuses(memoryCandidates.candidates),
      memory_confirmations: countConfirmations(memoryConfirmations.confirmations),
      accepted_semantic_memory: {
        total: acceptedMemory.memories.length
      },
      review_inbox: {
        ...countStatuses(reviewInboxAll.items),
        active: reviewInboxActive.items.length
      },
      review_confirmations: countConfirmations(reviewConfirmations.confirmations),
      opportunity_backlog: countOpportunityBacklog(opportunityBacklog.items),
      working_checkpoints: {
        total: workingCheckpoints.count
      },
      harness_replays: {
        total: harnessReplays.count,
        attention: harnessReplays.replays.filter((replay) => replay.status === "attention").length,
        clean: harnessReplays.replays.filter((replay) => replay.status === "clean").length
      }
    },
    latest_refs: {
      memory_candidates: memoryCandidates.candidate_refs.slice(0, limit),
      memory_confirmations: memoryConfirmations.confirmation_refs.slice(0, limit),
      accepted_semantic_memory: acceptedMemory.memory_refs.slice(0, limit),
      review_inbox: reviewInboxActive.item_refs.slice(0, limit),
      review_confirmations: reviewConfirmations.confirmation_refs.slice(0, limit),
      opportunity_backlog: opportunityBacklog.item_refs.slice(0, limit),
      working_checkpoints: workingCheckpoints.checkpoint_refs.slice(0, limit),
      harness_replays: harnessReplays.replay_refs.slice(0, limit)
    },
    opportunity_backlog: {
      top_item: topOpportunity ? summarizeOpportunity(topOpportunity) : undefined,
      actionable_item: actionableOpportunity ? summarizeOpportunity(actionableOpportunity) : undefined,
      next_ready_at: nextReadyAt,
      next_check: nextCheck,
      attention_hint: opportunityAttentionHint(topOpportunity, actionableOpportunity, nextCheck)
    },
    self_evolution_gaps: {
      total: selfEvolutionGaps.count,
      by_effective_status: selfEvolutionGaps.by_effective_status,
      latest_refs: selfEvolutionGaps.gap_refs.slice(0, limit),
      attention_hint: selfEvolutionGapAttentionHint(selfEvolutionGaps.by_effective_status, selfEvolutionGaps.count)
    },
    autonomy_pause: {
      active: serviceHealth.autonomy_pause.active,
      ref: "autonomy/runs/pause_signal.json",
      status: serviceHealth.autonomy_pause.status,
      reason: serviceHealth.autonomy_pause.reason,
      resume_hint: serviceHealth.autonomy_pause.resume_hint
    },
    working_checkpoint: {
      current: workingCheckpoints.current,
      attention_hint: workingCheckpointAttentionHint(workingCheckpoints.current),
      boundary: workingCheckpoints.boundary
    },
    service: {
      runtime: {
        state: serviceHealth.service.state,
        pid: serviceHealth.service.pid,
        channel_id: serviceHealth.service.channel_id,
        scenario_id: serviceHealth.service.scenario_id,
        updated_at: serviceHealth.service.heartbeat_updated_at,
        heartbeat_freshness: serviceHealth.service.heartbeat_freshness,
        heartbeat_age_ms: serviceHealth.service.heartbeat_age_ms,
        health: serviceHealth.status,
        runtime_build: serviceHealth.service.runtime_build,
        repo_head: serviceHealth.service.repo_head,
        deployment: serviceHealth.service.deployment
      },
      review_tick: {
        state: serviceHealth.review_tick.state,
        enabled: serviceHealth.review_tick.enabled,
        updated_at: serviceHealth.review_tick.updated_at,
        last_tick_ref: serviceHealth.review_tick.last_tick_ref,
        last_inbox_count: serviceHealth.review_tick.last_inbox_count,
        last_active_tick_inbox_count: serviceHealth.review_tick.last_active_tick_inbox_count,
        last_active_inbox_count: serviceHealth.review_tick.last_active_inbox_count,
        last_inactive_tick_inbox_count: serviceHealth.review_tick.last_inactive_tick_inbox_count,
        last_inactive_tick_inbox_reasons: serviceHealth.review_tick.last_inactive_tick_inbox_reasons,
        last_inactive_tick_inbox_refs: serviceHealth.review_tick.last_inactive_tick_inbox_refs,
        last_focus: serviceHealth.review_tick.last_focus,
        last_focus_current_status: serviceHealth.review_tick.last_focus_current_status,
        last_focus_current_ref: serviceHealth.review_tick.last_focus_current_ref,
        last_focus_current_backlog_status: serviceHealth.review_tick.last_focus_current_backlog_status,
        last_focus_current_reason: serviceHealth.review_tick.last_focus_current_reason,
        last_auto_action_status: serviceHealth.review_tick.last_auto_action_status,
        last_auto_action_ref: serviceHealth.review_tick.last_auto_action_ref,
        last_auto_action_opportunity_id: serviceHealth.review_tick.last_auto_action_opportunity_id,
        last_auto_action_opportunity_kind: serviceHealth.review_tick.last_auto_action_opportunity_kind,
        last_auto_action_result_ref: serviceHealth.review_tick.last_auto_action_result_ref,
        last_auto_action_summary: serviceHealth.review_tick.last_auto_action_summary,
        next_wake_at: serviceHealth.review_tick.next_wake_at,
        next_wake_delay_ms: serviceHealth.review_tick.next_wake_delay_ms,
        next_wake_reason: serviceHealth.review_tick.next_wake_reason,
        pause_signal_ref: serviceHealth.review_tick.pause_signal_ref
      }
    }
  };
}

function selfEvolutionGapAttentionHint(
  counts: Partial<Record<SelfEvolutionGapEffectiveStatus, number>>,
  total: number
): string {
  if (total === 0) return "No self-evolution gaps are derived from current bounded evidence.";
  const active = counts.active ?? 0;
  const waiting = counts.waiting ?? 0;
  const deferred = counts.deferred ?? 0;
  const openWork = active + waiting + deferred;
  if (openWork > 0) {
    return `Self-evolution gaps include open work (${renderEffectiveStatusCounts(counts)}); inspect governance gaps and Opportunity Backlog before new implementation.`;
  }
  return `Self-evolution gaps are decision-closed (${renderEffectiveStatusCounts(counts)}); an empty Opportunity Backlog is not hiding active gap work.`;
}

function renderEffectiveStatusCounts(counts: Partial<Record<SelfEvolutionGapEffectiveStatus, number>>): string {
  return Object.entries(counts)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}=${count}`)
    .join(", ") || "none";
}

function workingCheckpointAttentionHint(checkpoint: WorkingCheckpointSummary | null): string {
  if (!checkpoint) return "No current working checkpoint.";
  if (!needsWorkingCheckpointAttention(checkpoint)) {
    return `Current working checkpoint ${checkpoint.ref} is status history only; no checkpoint action is due.`;
  }
  return `Review working checkpoint ${checkpoint.ref} before resuming the local goal loop.`;
}

function isActionableOpportunity(item: OpportunityBacklogItem): boolean {
  return item.status !== "waiting";
}

function nextWaitingOpportunityReadyAt(items: OpportunityBacklogItem[]): string | undefined {
  return items
    .map((item) => item.self_evolution_gap?.not_before_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right))[0];
}

function opportunityAttentionHint(
  topOpportunity: OpportunityBacklogItem | undefined,
  actionableOpportunity: OpportunityBacklogItem | undefined,
  nextCheck: GovernanceNextCheckSummary | undefined
): string {
  if (!topOpportunity) {
    if (!nextCheck) return "No active opportunity backlog item.";
    return `No immediate opportunity action is due. Next resident check: ${nextCheck.source} at ${nextCheck.next_wake_at}.`;
  }
  if (topOpportunity.status !== "waiting") {
    return `Inspect ${topOpportunity.kind}:${topOpportunity.id} before starting new self-evolution work.`;
  }
  const notBefore = topOpportunity.self_evolution_gap?.not_before_at;
  const waitHint = notBefore
    ? `Top opportunity ${topOpportunity.kind}:${topOpportunity.id} is waiting until ${notBefore}.`
    : `Top opportunity ${topOpportunity.kind}:${topOpportunity.id} is waiting.`;
  if (actionableOpportunity) {
    return `${waitHint} Inspect actionable ${actionableOpportunity.kind}:${actionableOpportunity.id} next.`;
  }
  return `${waitHint} No immediate opportunity action is due.`;
}

function nextGovernanceResidentCheck(
  serviceHealth: ServiceHealthResult
): GovernanceNextCheckSummary | undefined {
  const candidates = [
    residentLoopNextCheck("review_tick", serviceHealth.review_tick),
    residentLoopNextCheck("content_feedback_refresh", serviceHealth.content_feedback_refresh),
    residentLoopNextCheck("content_creator_metrics", serviceHealth.content_creator_metrics)
  ].filter((value): value is GovernanceNextCheckSummary => Boolean(value));
  return candidates
    .sort((left, right) =>
      left.next_wake_at.localeCompare(right.next_wake_at)
      || left.source.localeCompare(right.source)
    )[0];
}

function residentLoopNextCheck(
  source: GovernanceNextCheckSummary["source"],
  loop: {
    state: string;
    enabled: boolean;
    next_wake_at?: string;
    next_wake_delay_ms?: number;
    next_wake_reason?: string;
    next_due_at?: string;
    next_due_run_ref?: string;
  }
): GovernanceNextCheckSummary | undefined {
  if (!loop.enabled || !loop.next_wake_at || !Number.isFinite(Date.parse(loop.next_wake_at))) {
    return undefined;
  }
  return {
    source,
    state: loop.state,
    next_wake_at: loop.next_wake_at,
    next_wake_delay_ms: loop.next_wake_delay_ms,
    next_wake_reason: loop.next_wake_reason,
    ...(loop.next_due_at ? { next_due_at: loop.next_due_at } : {}),
    ...(loop.next_due_run_ref ? { next_due_run_ref: loop.next_due_run_ref } : {})
  };
}

function countOpportunityBacklog(items: OpportunityBacklogItem[]): OpportunityBacklogCounts {
  const byKind: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const item of items) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  }
  return {
    total: items.length,
    by_kind: byKind,
    by_status: byStatus
  };
}

function summarizeOpportunity(item: OpportunityBacklogItem): GovernanceOpportunitySummary {
  return {
    id: item.id,
    kind: item.kind,
    ref: item.ref,
    status: item.status,
    score: item.score,
    title: item.title,
    next_step: item.next_step,
    decision_command: item.decision_command,
    action_chain: item.action_chain,
    action_kind: item.action_kind,
    source_ref: item.source_ref,
    draft_sop_readiness: item.draft_sop_readiness,
    reused_skill_coverage: item.reused_skill_coverage,
    service_health: item.service_health,
    archive_health: item.archive_health,
    skill_registry_health: item.skill_registry_health,
    context_health: item.context_health,
    context_pressure: item.context_pressure,
    working_checkpoint: item.working_checkpoint,
    pipeline_run: item.pipeline_run,
    repo_write_guard: item.repo_write_guard,
    selected_skill_drift: item.selected_skill_drift,
    selected_skill_outcome: item.selected_skill_outcome,
    self_evolution_gap: item.self_evolution_gap,
    completion_verification: item.completion_verification,
    opportunity_decision: item.opportunity_decision
  };
}

function countStatuses(items: Array<{ status: string }>): StatusCounts {
  const byStatus: Record<string, number> = {};
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  }
  return {
    total: items.length,
    by_status: byStatus
  };
}

function countConfirmations(items: Array<{ status: "pending" | "executed" }>): ConfirmationCounts {
  const counts: ConfirmationCounts = {
    total: items.length,
    pending: 0,
    executed: 0
  };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
