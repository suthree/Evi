import { createHash } from "node:crypto";
import { basename } from "node:path";
import { auditSop } from "../../core/src/audit.js";
import {
  getBackgroundReview,
  listBackgroundReviews,
  type BackgroundReviewHistoryDetailResult,
  type BackgroundReviewHistoryListResult
} from "../../core/src/background_review_history.js";
import {
  getCompletionVerificationReport,
  listCompletionVerificationReports,
  type CompletionVerificationHistoryDetailResult,
  type CompletionVerificationHistoryListResult
} from "../../core/src/completion_verification_history.js";
import { formatSopMarkdown } from "../../core/src/formatters.js";
import {
  getOpportunityBacklog,
  type OpportunityActionChainEffect,
  type OpportunityBacklogItem
} from "../../core/src/opportunity_backlog.js";
import {
  getDraftSopReadiness,
  type DraftSopReadinessReport
} from "../../core/src/draft_sop_readiness.js";
import {
  getReviewTick,
  listReviewTicks,
  type ReviewTickHistoryDetailResult,
  type ReviewTickHistoryListResult
} from "../../core/src/review_tick_history.js";
import { findDuplicateRecalledSkill, recallSkills } from "../../core/src/recall.js";
import { auditReportSchema, evidenceEventSchema, sopDraftSchema, workingCheckpointSchema, type AuditReport, type EvidenceEvent, type SOPDraft } from "../../core/src/schemas.js";
import { activeVaultRef, type SkillResolverLike } from "../../core/src/skill_resolver.js";
import { promoteSkillToVault, scanSkillRegistry, skillRegistryEventSchema } from "../../core/src/skill_registry.js";
import { inspectSopEvolutionConfirmationGate, type SopEvolutionConfirmationGate, type SopEvolutionConfirmationGateReasonCode, type SopEvolutionConfirmationGateStatus } from "../../core/src/sop_confirmation_readiness.js";
import {
  SOP_RECOVERY_DECISIONS_REF,
  countSopRecoveryDecisions,
  isSopRecoveryDecisionStatus,
  latestSopRecoveryDecision,
  readSopRecoveryDecisions,
  type SopRecoveryDecisionRecord,
  type SopRecoveryDecisionStatus,
  type SopRecoveryDecisionWithRef
} from "../../core/src/sop_recovery_decisions.js";
import {
  REVIEW_INBOX_DECISIONS_REF,
  countReviewInboxDecisions,
  isReviewInboxDecisionStatus,
  latestReviewInboxDecision,
  readReviewInboxDecisions,
  type ReviewInboxDecisionStatus as CoreReviewInboxDecisionStatus,
  type ReviewInboxDecisionWithRef
} from "../../core/src/review_inbox_decisions.js";
import {
  annotateReviewInboxDuplicates,
  collapseReviewInboxDuplicates,
  latestReviewInboxDuplicateDecision,
  reviewInboxDuplicateKey,
  type ReviewInboxDuplicateGroup
} from "../../core/src/review_inbox_duplicates.js";
import {
  getReusedSkillCoverage,
  type ReusedSkillCoverageReport
} from "../../core/src/reused_skill_coverage.js";
import { getSopEvolutionLedger, sopEvolutionNextCommandActionId, type SopEvolutionDecision, type SopEvolutionLedgerEntry } from "../../core/src/sop_evolution_ledger.js";
import { AgentStore } from "../../core/src/store.js";
import { MemoryStore, type EpisodeEventRecord } from "../../core/src/memory_store.js";
import { newId, slugify, utcNow } from "../../core/src/ids.js";

const REVIEW_TICK_BACKLOG_SCAN_LIMIT = 20;

export type BackgroundReviewMode = "recent" | "query" | "session";
export type BackgroundReviewProposalType = "sop_candidate" | "skill_revision" | "memory_gap" | "runtime_gap";

export interface BackgroundReviewOptions {
  repoRoot: string;
  stateRoot: string;
  query?: string;
  sessionId?: string;
  limit?: number;
}

export interface ReviewActionChainStepSummary {
  label: string;
  effect: OpportunityActionChainEffect;
  reason?: string;
}

export interface BackgroundReviewProposal {
  id: string;
  type: BackgroundReviewProposalType;
  title: string;
  rationale: string;
  evidence_refs: string[];
  next_action: string;
  focus_action_chain?: ReviewActionChainStepSummary[];
  self_evolution_gap?: BackgroundReviewProposalSelfEvolutionGap;
}

export interface BackgroundReviewProposalSelfEvolutionGap {
  gap_id: string;
  gap_ref: string;
  proposed_slice: string;
  owner_surface: string;
  source_ref: string;
  follow_up_kind: string;
  evidence_refs: string[];
  acceptance: string[];
  non_goals: string[];
  inspect_command: string;
  verification_commands: string[];
  boundary: string;
}

export interface ReviewSopDraftResult {
  review_ref: string;
  proposal_id: string;
  sop_ref: string;
  sop_json_ref: string;
  evidence_event_id: string;
  sop: SOPDraft;
}

export interface ReviewSopAuditResult {
  sop_ref: string;
  audit_ref: string;
  evidence_event_id: string;
  audit: AuditReport;
}

export interface ReviewSopPromotionResult {
  status: "promoted" | "reused_skill";
  sop_ref: string;
  audit_ref: string;
  evidence_event_id: string;
  skill_name: string;
  skill_ref: string | null;
  candidate_ref: string | null;
  registry_ref: string | null;
  event_ref: string | null;
  duplicate_skill_ref: string | null;
  sop: SOPDraft;
}

export interface ReviewSkillRevisionResult {
  status: "validated";
  review_ref: string;
  proposal_id: string;
  skill_refs: string[];
  event_refs: string[];
  evidence_event_id: string;
  summary: string;
}

export interface ReviewEvidenceCollectionReport {
  id: string;
  created_at: string;
  review_ref: string;
  proposal_id: string;
  proposal_type: BackgroundReviewProposalType;
  summary: string;
  source: {
    memory_sync: {
      source_ref: string;
      db_ref: string;
      total_rows: number;
      indexed_rows: number;
      skipped_rows: number;
    };
    stats: {
      events_count: number;
      sessions_count: number;
    };
  };
  evidence_refs: string[];
  recommended_intake: string[];
  artifact_refs: {
    json_ref: string;
    markdown_ref: string;
  };
  evidence_event_id?: string;
}

export interface BackgroundReviewWorkingCheckpoint {
  ref: string;
  goal: string;
  current_step: string;
  known_constraints: string[];
  recent_evidence_refs: string[];
  open_questions: string[];
  next_action: string;
}

export interface ReviewSopChainEvent extends EvidenceEvent {
  source_ref: string;
  row_index: number;
}

export interface ReviewSopChainResult {
  sop_ref: string;
  sop: SOPDraft;
  review_refs: string[];
  audit_refs: string[];
  skill_refs: string[];
  duplicate_skill_refs: string[];
  artifact_refs: string[];
  events: ReviewSopChainEvent[];
  status: {
    sop_status: SOPDraft["status"];
    event_count: number;
    audit_count: number;
    promotion_events: number;
    reuse_events: number;
    latest_decision: SopEvolutionDecision;
  };
}

export type ReviewFollowUpActionKind =
  | "inspect_chain"
  | "inspect_evidence"
  | "draft_sop"
  | "audit_sop"
  | "promote_sop"
  | "revise_skill"
  | "collect_evidence"
  | "narrow_review";

export interface ReviewFollowUpAction {
  id: string;
  kind: ReviewFollowUpActionKind;
  title: string;
  rationale: string;
  command: string | null;
  required_refs: string[];
  would_write: Array<"state" | "active_vault" | "repo">;
}

export type ReviewInboxItemStatus = "open" | "confirmation_requested" | "executed";
export type ReviewInboxStatusFilter = ReviewInboxItemStatus | "active" | "all";
export type ReviewInboxDecisionStatus = CoreReviewInboxDecisionStatus;

export interface ReviewInboxItem {
  id: string;
  created_at: string;
  updated_at: string;
  status: ReviewInboxItemStatus;
  source: "review_tick";
  first_review_ref: string;
  latest_review_ref: string;
  proposal_id: string;
  proposal_type: BackgroundReviewProposalType;
  proposal_title: string;
  action_id: string;
  action_kind: ReviewFollowUpActionKind;
  title: string;
  rationale: string;
  command: string | null;
  required_refs: string[];
  would_write: ReviewFollowUpAction["would_write"];
  seen_count: number;
  focus_action_chain?: ReviewActionChainStepSummary[];
  confirmation_ref?: string;
  confirmation_markdown_ref?: string;
  confirmation_requested_at?: string;
  executed_at?: string;
  execution_ref?: string;
  execution_markdown_ref?: string;
  execution_evidence_event_id?: string;
  execution_result?: ReviewFollowUpConfirmedExecutionSummary;
}

export type ReviewInboxItemView = ReviewInboxItem & {
  latest_decision?: ReviewInboxDecisionWithRef;
  duplicate_group?: ReviewInboxDuplicateGroup;
};

export interface ReviewInboxListResult {
  count: number;
  item_refs: string[];
  items: ReviewInboxItemView[];
}

export interface ReviewInboxRequestConfirmationResult {
  item_ref: string;
  item: ReviewInboxItem;
  confirmation_ref: string;
  confirmation_markdown_ref: string;
  evidence_event_id: string;
  confirmation: ReviewFollowUpConfirmationRequest;
}

export interface ReviewInboxDecisionResult {
  action: "decide-review-inbox";
  item_ref: string;
  item_id: string;
  previous_status: string;
  status: ReviewInboxDecisionStatus;
  reason: string;
  decision_ref: string;
  decision: ReviewInboxDecisionWithRef;
}

export interface ReviewTickResult {
  id: string;
  mode: BackgroundReviewMode;
  query: string | null;
  session_id: string | null;
  created_at: string;
  focus: ReviewTickFocus;
  review_ref: string;
  review_markdown_ref: string;
  proposal_count: number;
  inbox_item_refs: string[];
  inbox_items: ReviewInboxItem[];
  stats: {
    new_items: number;
    updated_items: number;
  };
  artifact_refs: {
    json_ref: string;
    markdown_ref: string;
  };
  evidence_event_id?: string;
}

export type ReviewTickFocusSource =
  | "explicit_query"
  | "explicit_session"
  | "opportunity_backlog"
  | "backlog_actionable"
  | "recent";

export interface ReviewTickFocus {
  source: ReviewTickFocusSource;
  reason: string;
  query: string | null;
  opportunity?: {
    ref: string;
    id: string;
    kind: OpportunityBacklogItem["kind"];
    status: string;
    score: number;
    action_kind?: string;
    source_ref?: string;
    self_evolution_gap?: OpportunityBacklogItem["self_evolution_gap"];
    action_chain?: ReviewActionChainStepSummary[];
  };
}

export interface ReviewFollowUpPlanResult {
  review_ref: string;
  proposal_id: string;
  proposal_type: BackgroundReviewProposalType;
  dry_run: true;
  summary: string;
  chain_summaries: BackgroundReviewChainSummary[];
  actions: ReviewFollowUpAction[];
}

export interface ReviewFollowUpExecutionResult {
  review_ref: string;
  proposal_id: string;
  action_id: string;
  action_kind: ReviewFollowUpActionKind;
  read_only: true;
  summary: string;
  action: ReviewFollowUpAction;
  result: ReviewSopChainResult;
}

export interface ReviewFollowUpConfirmationRequest {
  id: string;
  created_at: string;
  status: "pending" | "executed";
  source?: "review_proposal" | "sop_evolution_chain";
  review_ref: string;
  proposal_id: string;
  proposal_type: BackgroundReviewProposalType;
  action_id: string;
  action_kind: ReviewFollowUpActionKind;
  confirmation_required: true;
  execution_allowed: false;
  action: ReviewFollowUpAction;
  required_refs: string[];
  would_write: ReviewFollowUpAction["would_write"];
  safety_boundary: string[];
  next_step: string;
  draft_sop_readiness?: DraftSopReadinessReport;
  sop_ref?: string;
  sop_id?: string;
  executed_at?: string;
  execution_result?: ReviewFollowUpConfirmedExecutionSummary;
}

export interface ReviewFollowUpConfirmationResult {
  confirmation_ref: string;
  confirmation_markdown_ref: string;
  evidence_event_id: string;
  confirmation: ReviewFollowUpConfirmationRequest;
}

export interface ReviewFollowUpConfirmationSummary {
  confirmation_ref: string;
  id: string;
  status: "pending" | "executed";
  source: "review_proposal" | "sop_evolution_chain";
  created_at: string;
  executed_at?: string;
  review_ref: string;
  proposal_id: string;
  proposal_type: BackgroundReviewProposalType;
  action_id: string;
  action_kind: ReviewFollowUpActionKind;
  title: string;
  would_write: ReviewFollowUpAction["would_write"];
  required_refs: string[];
  sop_ref?: string;
  sop_id?: string;
  draft_sop_readiness?: DraftSopReadinessReport;
  sop_evolution_gate?: SopEvolutionConfirmationGate;
  sop_evolution_recovery?: ReviewFollowUpConfirmationRecovery;
  execution_kind?: ReviewFollowUpConfirmedExecutionSummary["kind"];
  evidence_event_id?: string;
}

export interface ReviewFollowUpConfirmationRecovery {
  action: "request_fresh_sop_confirmation";
  sop_id: string;
  sop_ref?: string;
  request_command: string;
  reason: string;
  playbook: ReviewFollowUpConfirmationRecoveryPlaybook;
  decision_command: string;
  latest_decision?: ReviewFollowUpConfirmationRecoveryDecisionWithRef;
}

export interface ReviewFollowUpConfirmationRecoveryPlaybook {
  reason_code: SopEvolutionConfirmationGateReasonCode;
  summary: string;
  inspect_command: string;
  next_steps: string[];
}

export type ReviewFollowUpConfirmationRecoveryDecisionStatus = SopRecoveryDecisionStatus;
export type ReviewFollowUpConfirmationRecoveryDecision = SopRecoveryDecisionRecord;
export type ReviewFollowUpConfirmationRecoveryDecisionWithRef = SopRecoveryDecisionWithRef;

export interface ReviewFollowUpConfirmationRecoveryDecisionResult {
  action: "decide-sop-recovery";
  confirmation_ref: string;
  confirmation_id: string;
  sop_id: string;
  sop_ref?: string;
  previous_status: ReviewFollowUpConfirmationRecoveryDecisionStatus | "none";
  status: ReviewFollowUpConfirmationRecoveryDecisionStatus;
  reason: string;
  decision_ref: string;
  decision: ReviewFollowUpConfirmationRecoveryDecision;
}

export type ReviewFollowUpConfirmationGateFilter = SopEvolutionConfirmationGateStatus | "all";

export interface ReviewFollowUpConfirmationGateReasonCount {
  status: SopEvolutionConfirmationGateStatus | "none";
  reason_code: SopEvolutionConfirmationGateReasonCode | "none";
  count: number;
}

export interface ReviewFollowUpConfirmationGateSummary {
  total: number;
  with_gate: number;
  without_gate: number;
  current: number;
  stale: number;
  executed: number;
  reasons: ReviewFollowUpConfirmationGateReasonCount[];
}

export interface ReviewFollowUpConfirmationListResult {
  count: number;
  total_matches: number;
  sop_evolution_gate_filter: ReviewFollowUpConfirmationGateFilter;
  sop_evolution_gate_summary: ReviewFollowUpConfirmationGateSummary;
  confirmation_refs: string[];
  confirmations: ReviewFollowUpConfirmationSummary[];
}

export interface ReviewFollowUpConfirmedExecutionResult {
  confirmation_ref: string;
  confirmation_markdown_ref: string;
  evidence_event_id: string;
  confirmation: ReviewFollowUpConfirmationRequest;
  result: BackgroundReviewReport | ReviewEvidenceCollectionReport | ReviewSopDraftResult | ReviewSopAuditResult | ReviewSopPromotionResult | ReviewSkillRevisionResult;
}

export type ReviewFollowUpConfirmedExecutionSummary =
  | {
    kind: "draft_sop";
    sop_ref: string;
    sop_json_ref: string;
    evidence_event_id: string;
  }
  | {
    kind: "audit_sop";
    sop_ref: string;
    audit_ref: string;
    evidence_event_id: string;
  }
  | {
    kind: "promote_sop";
    status: ReviewSopPromotionResult["status"];
    sop_ref: string;
    audit_ref: string;
    evidence_event_id: string;
    skill_name: string;
    skill_ref: string | null;
    candidate_ref: string | null;
    registry_ref: string | null;
    event_ref: string | null;
    duplicate_skill_ref: string | null;
  }
  | {
    kind: "narrow_review";
    review_ref: string;
    review_markdown_ref: string;
    evidence_event_id: string;
    query: string;
    proposal_count: number;
  }
  | {
    kind: "collect_evidence";
    report_ref: string;
    report_markdown_ref: string;
    evidence_event_id: string;
    events_count: number;
    sessions_count: number;
  }
  | {
    kind: "revise_skill";
    status: "validated";
    skill_refs: string[];
    event_refs: string[];
    evidence_event_id: string;
  };

export interface BackgroundReviewChainSummary {
  sop_ref: string;
  sop_id: string;
  title: string;
  sop_status: SOPDraft["status"];
  latest_decision: ReviewSopChainResult["status"]["latest_decision"];
  event_count: number;
  audit_count: number;
  promotion_events: number;
  reuse_events: number;
  review_refs: string[];
  audit_refs: string[];
  skill_refs: string[];
  duplicate_skill_refs: string[];
  event_ids: string[];
}

export interface BackgroundReviewReport {
  id: string;
  mode: BackgroundReviewMode;
  query: string | null;
  session_id: string | null;
  created_at: string;
  evidence_event_id?: string;
  stats: {
    events_reviewed: number;
    sessions_seen: number;
    kinds: Record<string, number>;
    failure_signal_count: number;
    sop_signal_count: number;
  };
  source: {
    memory_sync: {
      source_ref: string;
      db_ref: string;
      total_rows: number;
      indexed_rows: number;
      skipped_rows: number;
    };
    reviewed_event_ids: string[];
    working_checkpoint: BackgroundReviewWorkingCheckpoint | null;
  };
  chain_summaries: BackgroundReviewChainSummary[];
  proposals: BackgroundReviewProposal[];
  artifact_refs: {
    json_ref: string;
    markdown_ref: string;
  };
}

export class BackgroundReviewRunner {
  private readonly store: AgentStore;
  private readonly vaultRoot: SkillResolverLike;

  constructor(args: { repoRoot: string; stateRoot: string; vaultRoot?: SkillResolverLike }) {
    this.store = new AgentStore(args.repoRoot, args.stateRoot);
    this.vaultRoot = args.vaultRoot ?? "vault";
  }

  async run(
    options: Omit<BackgroundReviewOptions, "repoRoot" | "stateRoot"> & { extraProposals?: BackgroundReviewProposal[] } = {}
  ): Promise<BackgroundReviewReport> {
    await this.store.ensureLayout();
    const limit = options.limit ?? 20;
    const memory = new MemoryStore(this.store);
    try {
      const sync = await memory.syncEpisodeEvents();
      const mode: BackgroundReviewMode = options.sessionId ? "session" : options.query ? "query" : "recent";
      const events = await selectEvents(memory, {
        mode,
        query: options.query,
        sessionId: options.sessionId,
        limit
      });
      const chainSummaries = await this.buildChainSummaries(events);
      const workingCheckpoint = mode === "recent" ? await readLatestWorkingCheckpoint(this.store) : null;
      const id = newId("background_review");
      const root = `autonomy/reviews/${id}`;
      const proposals = mergeExtraProposals(
        buildProposals(events, mode, chainSummaries, workingCheckpoint),
        options.extraProposals ?? []
      );
      const report: BackgroundReviewReport = {
        id,
        mode,
        query: options.query ?? null,
        session_id: options.sessionId ?? null,
        created_at: utcNow(),
        stats: summarizeEvents(events),
        source: {
          memory_sync: {
            source_ref: sync.source_ref,
            db_ref: sync.db_ref,
            total_rows: sync.total_rows,
            indexed_rows: sync.indexed_rows,
            skipped_rows: sync.skipped_rows
          },
          reviewed_event_ids: events.map((event) => event.id),
          working_checkpoint: workingCheckpoint
        },
        chain_summaries: chainSummaries,
        proposals,
        artifact_refs: {
          json_ref: `${root}.json`,
          markdown_ref: `${root}.md`
        }
      };
      const markdownRef = await this.store.writeText(report.artifact_refs.markdown_ref, renderBackgroundReview(report, events));
      const jsonRef = await this.store.writeJson(report.artifact_refs.json_ref, report);
      report.artifact_refs.markdown_ref = markdownRef;
      report.artifact_refs.json_ref = jsonRef;

      const event = evidenceEventSchema.parse({
        session_id: report.id,
        turn_id: report.id,
        kind: "audit_result",
        summary: `Background review produced ${report.proposals.length} proposal(s) from ${events.length} episode event(s).`,
        artifact_refs: [report.artifact_refs.json_ref, report.artifact_refs.markdown_ref]
      });
      await this.store.appendJsonl("memory/episodes/events.jsonl", event);
      report.evidence_event_id = event.id;
      await this.store.writeJson(report.artifact_refs.json_ref, report);

      return report;
    } finally {
      memory.close();
    }
  }

  async runTick(options: Omit<BackgroundReviewOptions, "repoRoot" | "stateRoot"> = {}): Promise<ReviewTickResult> {
    await this.store.ensureLayout();
    const focus = await this.resolveReviewTickFocus(options);
    const focusProposal = buildReviewTickFocusProposal(focus);
    const review = await this.run({
      ...options,
      query: focus.query ?? options.query,
      extraProposals: focusProposal ? [focusProposal] : []
    });
    const now = utcNow();
    const inboxItems: ReviewInboxItem[] = [];
    let newItems = 0;
    let updatedItems = 0;

    for (const proposal of review.proposals) {
      const plan = await this.planProposalFollowUp({
        reviewRef: review.artifact_refs.json_ref,
        proposalId: proposal.id
      });
      for (const action of plan.actions) {
        const itemId = reviewInboxItemId({ proposal, action });
        const itemRef = reviewInboxItemRef(itemId);
        const existing = await this.store.readStateJson<unknown>(itemRef);
        const previous = isReviewInboxItem(existing) ? existing : null;
        const item: ReviewInboxItem = {
          id: itemId,
          created_at: previous?.created_at ?? now,
          updated_at: now,
          status: previous?.status ?? "open",
          source: "review_tick",
          first_review_ref: previous?.first_review_ref ?? review.artifact_refs.json_ref,
          latest_review_ref: review.artifact_refs.json_ref,
          proposal_id: proposal.id,
          proposal_type: proposal.type,
          proposal_title: proposal.title,
          action_id: action.id,
          action_kind: action.kind,
          title: action.title,
          rationale: action.rationale,
          command: action.command,
          required_refs: action.required_refs,
          would_write: action.would_write,
          seen_count: (previous?.seen_count ?? 0) + 1,
          focus_action_chain: proposal.focus_action_chain ?? previous?.focus_action_chain,
          confirmation_ref: previous?.confirmation_ref,
          confirmation_markdown_ref: previous?.confirmation_markdown_ref,
          confirmation_requested_at: previous?.confirmation_requested_at
        };
        await this.store.writeJson(itemRef, item);
        inboxItems.push(item);
        if (previous) updatedItems += 1;
        else newItems += 1;
      }
    }

    const id = newId("review_tick");
    const root = `autonomy/ticks/${id}`;
    const tick: ReviewTickResult = {
      id,
      mode: review.mode,
      query: review.query,
      session_id: review.session_id,
      created_at: now,
      focus,
      review_ref: review.artifact_refs.json_ref,
      review_markdown_ref: review.artifact_refs.markdown_ref,
      proposal_count: review.proposals.length,
      inbox_item_refs: inboxItems.map((item) => reviewInboxItemRef(item.id)),
      inbox_items: inboxItems,
      stats: {
        new_items: newItems,
        updated_items: updatedItems
      },
      artifact_refs: {
        json_ref: `${root}.json`,
        markdown_ref: `${root}.md`
      }
    };
    const markdownRef = await this.store.writeText(tick.artifact_refs.markdown_ref, renderReviewTick(tick));
    const jsonRef = await this.store.writeJson(tick.artifact_refs.json_ref, tick);
    tick.artifact_refs.markdown_ref = markdownRef;
    tick.artifact_refs.json_ref = jsonRef;

    const event = evidenceEventSchema.parse({
      session_id: tick.id,
      turn_id: tick.id,
      kind: "report",
      summary: `Review tick produced ${tick.inbox_items.length} inbox item(s) from ${tick.proposal_count} proposal(s).`,
      artifact_refs: [tick.artifact_refs.json_ref, tick.artifact_refs.markdown_ref, tick.review_ref, tick.review_markdown_ref, ...tick.inbox_item_refs]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
    tick.evidence_event_id = event.id;
    await this.store.writeJson(tick.artifact_refs.json_ref, tick);

    return tick;
  }

  private async resolveReviewTickFocus(
    options: Omit<BackgroundReviewOptions, "repoRoot" | "stateRoot">
  ): Promise<ReviewTickFocus> {
    if (options.sessionId) {
      return {
        source: "explicit_session",
        reason: "operator supplied --session; backlog focus is not used",
        query: null
      };
    }
    if (options.query) {
      return {
        source: "explicit_query",
        reason: "operator supplied --query; backlog focus is not used",
        query: options.query
      };
    }

    const backlog = await getOpportunityBacklog(this.store, {
      limit: REVIEW_TICK_BACKLOG_SCAN_LIMIT,
      vaultRoot: this.vaultRoot
    });
    const top = firstReviewTickFocusBacklogItem(backlog.items);
    if (!top) {
      const waiting = backlog.items.find(isReviewTickWaitingBacklogItem);
      if (waiting) {
        return {
          source: "recent",
          reason: reviewTickWaitingReason(waiting),
          query: null,
          opportunity: reviewTickOpportunitySummary(waiting)
        };
      }
      return {
        source: "recent",
        reason: "no opportunity backlog item was available",
        query: null
      };
    }
    const skippedWaitingCount = backlog.items
      .slice(0, backlog.items.indexOf(top))
      .filter(isReviewTickWaitingBacklogItem).length;
    const skippedActionableCount = backlog.items
      .slice(0, backlog.items.indexOf(top))
      .filter((item) => !isReviewTickWaitingBacklogItem(item) && !isReviewTickScopedBacklogItem(item))
      .length;
    const selectedReason = reviewTickSelectedBacklogReason(top, skippedWaitingCount, skippedActionableCount);
    if (top.kind === "working_checkpoint") {
      return {
        source: "opportunity_backlog",
        reason: `${selectedReason} as recent working-checkpoint focus`,
        query: null,
        opportunity: reviewTickOpportunitySummary(top)
      };
    }
    if (!isReviewTickQueryableBacklogItem(top)) {
      return {
        source: "backlog_actionable",
        reason: `${selectedReason} is already actionable as ${top.kind}; keeping recent review scope`,
        query: null,
        opportunity: reviewTickOpportunitySummary(top)
      };
    }
    return {
      source: "opportunity_backlog",
      reason: `${selectedReason} as review focus`,
      query: reviewTickQueryForBacklogItem(top),
      opportunity: reviewTickOpportunitySummary(top)
    };
  }

  async listReviewInbox(args: { limit?: number; status?: ReviewInboxStatusFilter } = {}): Promise<ReviewInboxListResult> {
    await this.store.ensureLayout();
    const status = args.status ?? "active";
    const items = await this.readReviewInboxViews(status);
    const visible = shouldCollapseReviewInboxDuplicates(status)
      ? collapseReviewInboxDuplicates(items)
      : annotateReviewInboxDuplicates(items);
    const sorted = visible
      .sort((left, right) => reviewInboxSortTime(right).localeCompare(reviewInboxSortTime(left)))
      .slice(0, args.limit ?? items.length);
    return {
      count: sorted.length,
      item_refs: sorted.map((item) => reviewInboxItemRef(item.id)),
      items: sorted
    };
  }

  async listReviewTicks(args: { limit?: number } = {}): Promise<ReviewTickHistoryListResult> {
    return listReviewTicks(this.store, args);
  }

  async getReviewTick(args: { tickRef: string }): Promise<ReviewTickHistoryDetailResult> {
    return getReviewTick(this.store, args);
  }

  async listBackgroundReviewReports(args: { limit?: number } = {}): Promise<BackgroundReviewHistoryListResult> {
    return listBackgroundReviews(this.store, args);
  }

  async getBackgroundReviewReport(args: { reviewRef: string }): Promise<BackgroundReviewHistoryDetailResult> {
    return getBackgroundReview(this.store, args);
  }

  async listCompletionVerificationReports(args: { limit?: number } = {}): Promise<CompletionVerificationHistoryListResult> {
    return listCompletionVerificationReports(this.store, args);
  }

  async getCompletionVerificationReport(args: { completionRef: string }): Promise<CompletionVerificationHistoryDetailResult> {
    return getCompletionVerificationReport(this.store, args);
  }

  async getReviewInboxItem(args: { itemRef: string }): Promise<{
    item_ref: string;
    item: ReviewInboxItem;
    latest_decision?: ReviewInboxDecisionWithRef;
    duplicate_group?: ReviewInboxDuplicateGroup;
  }> {
    await this.store.ensureLayout();
    const itemRef = resolveReviewInboxItemRef(args.itemRef);
    const raw = await this.store.readStateJson<unknown>(itemRef);
    if (!isReviewInboxItem(raw)) {
      throw new Error(`Review inbox item not found or invalid: ${itemRef}`);
    }
    const decisions = await readReviewInboxDecisions(this.store);
    const duplicateGroup = await this.reviewInboxDuplicateGroupForItem(raw.id);
    const latestDecision = latestReviewInboxDuplicateDecision(decisions, raw, duplicateGroup)
      ?? latestReviewInboxDecision(decisions, itemRef, raw.id);
    return {
      item_ref: itemRef,
      item: raw,
      latest_decision: latestDecision,
      duplicate_group: duplicateGroup
    };
  }

  async listReviewFollowUpConfirmations(
    args: { limit?: number; sopEvolutionGate?: ReviewFollowUpConfirmationGateFilter } = {}
  ): Promise<ReviewFollowUpConfirmationListResult> {
    await this.store.ensureLayout();
    const gateFilter = args.sopEvolutionGate ?? "all";
    const recoveryDecisions = await readSopRecoveryDecisions(this.store);
    const refs = (await this.store.listStateFiles("autonomy/followups"))
      .filter((ref) => ref.endsWith(".json"));
    const confirmations: ReviewFollowUpConfirmationSummary[] = [];
    for (const ref of refs) {
      const raw = await this.store.readStateJson<unknown>(ref);
      if (!isFollowUpConfirmationRequest(raw)) continue;
      const gate = await inspectSopEvolutionConfirmationGate(this.store, raw, { vaultRoot: this.vaultRoot });
      if (gateFilter !== "all" && gate?.status !== gateFilter) continue;
      confirmations.push(toFollowUpConfirmationSummary(
        ref,
        raw,
        gate,
        this.store.stateRoot,
        latestSopRecoveryDecision(recoveryDecisions, ref, raw.id)
      ));
    }
    const sorted = confirmations
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, args.limit ?? confirmations.length);
    return {
      count: sorted.length,
      total_matches: confirmations.length,
      sop_evolution_gate_filter: gateFilter,
      sop_evolution_gate_summary: summarizeFollowUpConfirmationGates(confirmations),
      confirmation_refs: sorted.map((confirmation) => confirmation.confirmation_ref),
      confirmations: sorted
    };
  }

  async getReviewFollowUpConfirmation(
    args: { confirmationRef: string }
  ): Promise<{
    confirmation_ref: string;
    confirmation: ReviewFollowUpConfirmationRequest;
    sop_evolution_gate?: SopEvolutionConfirmationGate;
    sop_evolution_recovery?: ReviewFollowUpConfirmationRecovery;
  }> {
    await this.store.ensureLayout();
    const confirmationRef = resolveFollowUpConfirmationRef(args.confirmationRef);
    const raw = await this.store.readStateJson<unknown>(confirmationRef);
    if (!isFollowUpConfirmationRequest(raw)) {
      throw new Error(`Follow-up confirmation request not found or invalid: ${confirmationRef}`);
    }
    const gate = await inspectSopEvolutionConfirmationGate(this.store, raw, { vaultRoot: this.vaultRoot });
    const recoveryDecisions = await readSopRecoveryDecisions(this.store);
    const latestDecision = latestSopRecoveryDecision(recoveryDecisions, confirmationRef, raw.id);
    return {
      confirmation_ref: confirmationRef,
      confirmation: raw,
      sop_evolution_gate: gate,
      sop_evolution_recovery: sopEvolutionConfirmationRecovery(raw, gate, this.store.stateRoot, confirmationRef, latestDecision)
    };
  }

  async decideSopRecovery(args: {
    confirmationRef: string;
    status: ReviewFollowUpConfirmationRecoveryDecisionStatus;
    reason: string;
  }): Promise<ReviewFollowUpConfirmationRecoveryDecisionResult> {
    await this.store.ensureLayout();
    const reason = args.reason.trim();
    if (!reason) throw new Error("SOP recovery decision requires --reason");
    if (!isSopRecoveryDecisionStatus(args.status)) {
      throw new Error(`Unsupported SOP recovery decision status: ${args.status}`);
    }
    const confirmationRef = resolveFollowUpConfirmationRef(args.confirmationRef);
    const raw = await this.store.readStateJson<unknown>(confirmationRef);
    if (!isFollowUpConfirmationRequest(raw)) {
      throw new Error(`Follow-up confirmation request not found or invalid: ${confirmationRef}`);
    }
    const gate = await inspectSopEvolutionConfirmationGate(this.store, raw, { vaultRoot: this.vaultRoot });
    if ((raw.source ?? "review_proposal") !== "sop_evolution_chain" || gate?.status !== "stale") {
      throw new Error(`SOP recovery decisions only support stale SOP evolution confirmations: ${confirmationRef}`);
    }
    const recoveryDecisions = await readSopRecoveryDecisions(this.store);
    const previous = latestSopRecoveryDecision(recoveryDecisions, confirmationRef, raw.id)?.status ?? "none";
    const sopId = raw.sop_id ?? (raw.sop_ref ? refId(raw.sop_ref) : raw.proposal_id);
    const decision: ReviewFollowUpConfirmationRecoveryDecision = {
      id: newId("sop_recovery_decision"),
      confirmation_id: raw.id,
      confirmation_ref: confirmationRef,
      sop_id: sopId,
      sop_ref: raw.sop_ref,
      status: args.status,
      previous_status: previous,
      gate_reason_code: gate.reason_code,
      gate_reason: gate.reason,
      reason,
      created_at: utcNow()
    };
    await this.store.appendJsonl(SOP_RECOVERY_DECISIONS_REF, decision);
    const writtenDecision = (await readSopRecoveryDecisions(this.store))
      .find((item) => item.id === decision.id);
    const decisionRef = writtenDecision?.ref
      ?? `${SOP_RECOVERY_DECISIONS_REF}#${await countSopRecoveryDecisions(this.store)}`;
    return {
      action: "decide-sop-recovery",
      confirmation_ref: confirmationRef,
      confirmation_id: raw.id,
      sop_id: sopId,
      sop_ref: raw.sop_ref,
      previous_status: previous,
      status: decision.status,
      reason: decision.reason,
      decision_ref: decisionRef,
      decision
    };
  }

  async decideReviewInboxItem(args: {
    itemRef: string;
    status: ReviewInboxDecisionStatus;
    reason: string;
  }): Promise<ReviewInboxDecisionResult> {
    await this.store.ensureLayout();
    const reason = args.reason.trim();
    if (!reason) throw new Error("Review inbox decision requires --reason");
    if (!isReviewInboxDecisionStatus(args.status)) {
      throw new Error(`Unsupported review inbox decision status: ${args.status}`);
    }
    const itemRef = resolveReviewInboxItemRef(args.itemRef);
    const item = await this.store.readStateJson<unknown>(itemRef);
    if (!isReviewInboxItem(item)) {
      throw new Error(`Review inbox item not found or invalid: ${itemRef}`);
    }
    if (item.status === "executed") {
      throw new Error(`Review inbox item already executed its confirmation: ${itemRef}`);
    }
    const decisions = await readReviewInboxDecisions(this.store);
    const previous = latestReviewInboxDecision(decisions, itemRef, item.id)?.status ?? item.status;
    const decision = {
      id: newId("review_inbox_decision"),
      item_id: item.id,
      item_ref: itemRef,
      duplicate_key: reviewInboxDuplicateKey(item),
      action_kind: item.action_kind,
      status: args.status,
      previous_status: previous,
      reason,
      created_at: utcNow()
    };
    await this.store.appendJsonl(REVIEW_INBOX_DECISIONS_REF, decision);
    const writtenDecision = (await readReviewInboxDecisions(this.store))
      .find((item) => item.id === decision.id);
    const decisionRef = writtenDecision?.ref
      ?? `${REVIEW_INBOX_DECISIONS_REF}#${await countReviewInboxDecisions(this.store)}`;
    return {
      action: "decide-review-inbox",
      item_ref: itemRef,
      item_id: item.id,
      previous_status: previous,
      status: decision.status,
      reason: decision.reason,
      decision_ref: decisionRef,
      decision: {
        ...decision,
        ref: decisionRef
      }
    };
  }

  async requestInboxItemConfirmation(args: { itemRef: string }): Promise<ReviewInboxRequestConfirmationResult> {
    await this.store.ensureLayout();
    const {
      item_ref: itemRef,
      item,
      latest_decision: latestDecision,
      duplicate_group: duplicateGroup
    } = await this.getReviewInboxItem({ itemRef: args.itemRef });
    if (duplicateGroup && duplicateGroup.canonical_id !== item.id) {
      throw new Error(`Review inbox item is duplicate of ${duplicateGroup.canonical_ref}; inspect or request the canonical item instead: ${itemRef}`);
    }
    if (latestDecision && latestDecision.status !== "open") {
      throw new Error(`Review inbox item has latest operator decision ${latestDecision.status}; reopen it before requesting confirmation: ${itemRef}`);
    }
    if (item.status === "confirmation_requested") {
      throw new Error(`Review inbox item already has a pending confirmation: ${itemRef}`);
    }
    if (item.status === "executed") {
      throw new Error(`Review inbox item already executed its confirmation: ${itemRef}`);
    }
    if (item.would_write.length === 0) {
      throw new Error(`Review inbox item does not require mutation confirmation: ${itemRef}`);
    }

    const confirmation = await this.requestFollowUpConfirmation({
      reviewRef: item.latest_review_ref,
      proposalId: item.proposal_id,
      actionId: item.action_id
    });
    const updatedItem: ReviewInboxItem = {
      ...item,
      updated_at: utcNow(),
      status: "confirmation_requested",
      confirmation_ref: confirmation.confirmation_ref,
      confirmation_markdown_ref: confirmation.confirmation_markdown_ref,
      confirmation_requested_at: confirmation.confirmation.created_at,
      executed_at: undefined,
      execution_ref: undefined,
      execution_markdown_ref: undefined,
      execution_evidence_event_id: undefined,
      execution_result: undefined
    };
    const writtenItemRef = await this.store.writeJson(itemRef, updatedItem);
    const event = evidenceEventSchema.parse({
      session_id: item.id,
      turn_id: item.action_id,
      kind: "report",
      summary: `Requested mutation confirmation from review inbox item ${item.id}; no follow-up action executed.`,
      artifact_refs: [
        writtenItemRef,
        confirmation.confirmation_ref,
        confirmation.confirmation_markdown_ref,
        item.latest_review_ref,
        ...item.required_refs
      ]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);

    return {
      item_ref: writtenItemRef,
      item: updatedItem,
      confirmation_ref: confirmation.confirmation_ref,
      confirmation_markdown_ref: confirmation.confirmation_markdown_ref,
      evidence_event_id: event.id,
      confirmation: confirmation.confirmation
    };
  }

  async draftSopFromProposal(args: { reviewRef: string; proposalId: string }): Promise<ReviewSopDraftResult> {
    await this.store.ensureLayout();
    const reviewRef = resolveReviewRef(args.reviewRef);
    const report = await this.store.readStateJson<BackgroundReviewReport>(reviewRef);
    if (!isBackgroundReviewReport(report)) {
      throw new Error(`Background review report not found or invalid: ${reviewRef}`);
    }

    const proposal = report.proposals.find((item) => item.id === args.proposalId);
    if (!proposal) throw new Error(`Proposal not found in ${reviewRef}: ${args.proposalId}`);
    if (proposal.evidence_refs.length === 0) {
      throw new Error(`Proposal has no evidence refs and cannot become an SOP draft: ${proposal.id}`);
    }
    if (proposal.type === "memory_gap" || proposal.type === "runtime_gap") {
      throw new Error(`Proposal type ${proposal.type} is not eligible for SOP draft creation: ${proposal.id}`);
    }

    const gap = proposal.self_evolution_gap;
    const sop = sopDraftSchema.parse({
      title: proposal.title,
      trigger: gap
        ? selfEvolutionGapSopTrigger(report.id, proposal, gap)
        : genericProposalSopTrigger(report.id, proposal),
      procedure: gap
        ? selfEvolutionGapSopProcedure(reviewRef, proposal, gap)
        : genericProposalSopProcedure(reviewRef, proposal),
      required_tools: gap
        ? ["governance.gaps", "review.background", "review.draft-sop", "review.audit-sop"]
        : ["memory.search", "review.background", "review.draft-sop", "review.audit-sop"],
      verification: gap
        ? selfEvolutionGapSopVerification(gap)
        : genericProposalSopVerification(),
      failure_modes: gap
        ? selfEvolutionGapSopFailureModes(gap)
        : genericProposalSopFailureModes(),
      evidence_refs: [reviewRef, ...proposal.evidence_refs]
    });

    const sopJsonRef = await this.store.writeJson(`sop/drafts/${sop.id}.json`, sop);
    const sopRef = await this.store.writeText(`sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
    const event = evidenceEventSchema.parse({
      session_id: report.id,
      turn_id: report.id,
      kind: "report",
      summary: `Drafted state-only SOP candidate ${sop.id} from background review proposal ${proposal.id}.`,
      artifact_refs: [reviewRef, sopJsonRef, sopRef, ...proposal.evidence_refs]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);

    return {
      review_ref: reviewRef,
      proposal_id: proposal.id,
      sop_ref: sopRef,
      sop_json_ref: sopJsonRef,
      evidence_event_id: event.id,
      sop
    };
  }

  async auditSopDraft(args: { sopRef: string }): Promise<ReviewSopAuditResult> {
    await this.store.ensureLayout();
    const sopRef = resolveSopJsonRef(args.sopRef);
    const rawSop = await this.store.readStateJson<unknown>(sopRef);
    if (!rawSop) throw new Error(`SOP draft JSON not found: ${sopRef}`);
    const sop = sopDraftSchema.parse(rawSop);
    const audit = auditSop(sop);
    const auditRef = await this.store.writeJson(`governance/audits/${audit.id}.json`, audit);
    const event = evidenceEventSchema.parse({
      session_id: sop.id,
      turn_id: audit.id,
      kind: "audit_result",
      summary: `State-only SOP audit verdict for ${sop.id}: ${audit.verdict}.`,
      artifact_refs: [sopRef, auditRef, ...sop.evidence_refs]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);

    return {
      sop_ref: sopRef,
      audit_ref: auditRef,
      evidence_event_id: event.id,
      audit
    };
  }

  async promoteAuditedSopDraft(args: {
    sopRef: string;
    auditRef: string;
    vaultRoot: SkillResolverLike;
    promotionEnabled: boolean;
    skillName?: string;
  }): Promise<ReviewSopPromotionResult> {
    await this.store.ensureLayout();
    if (!args.promotionEnabled) {
      throw new Error("SOP promotion is disabled by runtime config.");
    }

    const sopRef = resolveSopJsonRef(args.sopRef);
    const rawSop = await this.store.readStateJson<unknown>(sopRef);
    if (!rawSop) throw new Error(`SOP draft JSON not found: ${sopRef}`);
    const auditRef = resolveAuditRef(args.auditRef);
    const rawAudit = await this.store.readStateJson<unknown>(auditRef);
    if (!rawAudit) throw new Error(`Audit JSON not found: ${auditRef}`);

    const sop = sopDraftSchema.parse(rawSop);
    const audit = auditReportSchema.parse(rawAudit);
    if (audit.target_type !== "sop" || audit.target_ref !== sop.id) {
      throw new Error(`Audit ${auditRef} does not target SOP draft ${sop.id}.`);
    }
    if (audit.verdict !== "promote") {
      throw new Error(`Audit ${auditRef} verdict is ${audit.verdict}; only promote verdicts can be promoted.`);
    }

    const skillName = slugify(args.skillName ?? sop.title);
    const duplicateSkill = findDuplicateRecalledSkill(
      sop,
      await recallSkills(this.store, `${sop.title}\n${sop.trigger}\n${sop.verification}`, 5, args.vaultRoot),
      { skillName }
    );
    if (duplicateSkill) {
      if (sop.status !== "promoted") sop.status = "audited";
      const writtenSopRef = await this.writeSopDraftState(sopRef, sop);
      const event = evidenceEventSchema.parse({
        session_id: sop.id,
        turn_id: audit.id,
        kind: "report",
        summary: `Skipped explicit SOP promotion because recalled skill already covers this SOP: ${duplicateSkill.name}.`,
        artifact_refs: [writtenSopRef, auditRef, duplicateSkill.instructions_ref, duplicateSkill.metadata_ref]
      });
      await this.store.appendJsonl("memory/episodes/events.jsonl", event);
      return {
        status: "reused_skill",
        sop_ref: writtenSopRef,
        audit_ref: auditRef,
        evidence_event_id: event.id,
        skill_name: duplicateSkill.name,
        skill_ref: null,
        candidate_ref: null,
        registry_ref: null,
        event_ref: null,
        duplicate_skill_ref: duplicateSkill.instructions_ref,
        sop
      };
    }

    sop.status = "promoted";
    const writtenSopRef = await this.writeSopDraftState(sopRef, sop);
    const vaultDraftRef = activeVaultRef(args.vaultRoot, `sop/drafts/${sop.id}.md`);
    const vaultPromotedRef = activeVaultRef(args.vaultRoot, `sop/promoted/${sop.id}.md`);
    await this.store.writeRepoText(vaultDraftRef, formatSopMarkdown(sop));
    await this.store.writeRepoText(vaultPromotedRef, formatSopMarkdown(sop));

    const promoted = await promoteSkillToVault({
      store: this.store,
      vaultRoot: args.vaultRoot,
      skillName,
      sop,
      sopRef: vaultPromotedRef,
      audit,
      auditRef,
      evidenceRefs: [writtenSopRef, auditRef, ...sop.evidence_refs]
    });
    const event = evidenceEventSchema.parse({
      session_id: sop.id,
      turn_id: audit.id,
      kind: "report",
      summary: `Promoted audited state SOP ${sop.id} into vault skill ${promoted.entry.name}.`,
      artifact_refs: [
        writtenSopRef,
        auditRef,
        vaultDraftRef,
        vaultPromotedRef,
        promoted.skill_ref,
        promoted.candidate_ref,
        promoted.registry_ref,
        promoted.event_ref
      ]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);

    return {
      status: "promoted",
      sop_ref: writtenSopRef,
      audit_ref: auditRef,
      evidence_event_id: event.id,
      skill_name: promoted.entry.name,
      skill_ref: promoted.skill_ref,
      candidate_ref: promoted.candidate_ref,
      registry_ref: promoted.registry_ref,
      event_ref: promoted.event_ref,
      duplicate_skill_ref: null,
      sop
    };
  }

  async getSopChain(args: { sopRef: string }): Promise<ReviewSopChainResult> {
    await this.store.ensureLayout();
    const sopRef = resolveSopJsonRef(args.sopRef);
    const rawSop = await this.store.readStateJson<unknown>(sopRef);
    if (!rawSop) throw new Error(`SOP draft JSON not found: ${sopRef}`);
    const sop = sopDraftSchema.parse(rawSop);
    const ledger = await getSopEvolutionLedger(this.store, {
      vaultRoot: this.vaultRoot ?? "vault",
      limit: Number.MAX_SAFE_INTEGER
    });
    const ledgerEntry = ledger.entries.find((entry) => entry.sop_id === sop.id || entry.sop_ref === sopRef);
    const ledgerEventIds = new Set(ledgerEntry?.event_ids ?? []);
    const events = (await readEpisodeEvidenceEvents(this.store)).filter((event) => ledgerEventIds.has(event.id));
    const eventArtifactRefs = events.flatMap((event) => event.artifact_refs);
    const reviewRefs = ledgerEntry?.review_refs ?? dedupeRefs(sop.evidence_refs.filter(isReviewArtifactRef));
    const auditRefs = ledgerEntry?.audit_refs ?? [];
    const skillRefs = ledgerEntry?.skill_refs ?? [];
    const duplicateSkillRefs = ledgerEntry?.duplicate_skill_refs ?? [];
    const promotionEvents = events.filter((event) => /promoted audited state sop/i.test(event.summary));
    const reuseEvents = events.filter((event) => /skipped explicit sop promotion|already covers this sop/i.test(event.summary));

    return {
      sop_ref: sopRef,
      sop,
      review_refs: reviewRefs,
      audit_refs: auditRefs,
      skill_refs: skillRefs,
      duplicate_skill_refs: duplicateSkillRefs,
      artifact_refs: dedupeRefs([sopRef, sopMarkdownRefFromJsonRef(sopRef), ...sop.evidence_refs, ...eventArtifactRefs]),
      events,
      status: {
        sop_status: sop.status,
        event_count: events.length,
        audit_count: auditRefs.length,
        promotion_events: promotionEvents.length,
        reuse_events: reuseEvents.length,
        latest_decision: ledgerEntry?.latest_decision ?? latestSopDecisionFromStatus(sop.status)
      }
    };
  }

  async getReusedSkillCoverage(args: { sopRef: string }): Promise<ReusedSkillCoverageReport> {
    return getReusedSkillCoverage(this.store, {
      sopRef: args.sopRef,
      vaultRoot: this.vaultRoot
    });
  }

  async planProposalFollowUp(args: { reviewRef: string; proposalId: string }): Promise<ReviewFollowUpPlanResult> {
    const reviewRef = resolveReviewRef(args.reviewRef);
    const report = await this.store.readStateJson<BackgroundReviewReport>(reviewRef);
    if (!isBackgroundReviewReport(report)) {
      throw new Error(`Background review report not found or invalid: ${reviewRef}`);
    }
    const proposal = report.proposals.find((item) => item.id === args.proposalId);
    if (!proposal) throw new Error(`Proposal not found in ${reviewRef}: ${args.proposalId}`);
    const chains = chainsForProposal(report.chain_summaries ?? [], proposal);
    const actions = buildFollowUpActions({
      stateRoot: this.store.stateRoot,
      reviewRef,
      proposal,
      chains
    });
    return {
      review_ref: reviewRef,
      proposal_id: proposal.id,
      proposal_type: proposal.type,
      dry_run: true,
      summary: `Dry-run follow-up plan for ${proposal.type} proposal ${proposal.id}: ${actions.length} action(s).`,
      chain_summaries: chains,
      actions
    };
  }

  async executeFollowUpAction(args: { reviewRef: string; proposalId: string; actionId: string }): Promise<ReviewFollowUpExecutionResult> {
    const plan = await this.planProposalFollowUp({
      reviewRef: args.reviewRef,
      proposalId: args.proposalId
    });
    const action = plan.actions.find((item) => item.id === args.actionId);
    if (!action) throw new Error(`Follow-up action not found in plan: ${args.actionId}`);
    if (action.kind !== "inspect_chain" || action.would_write.length > 0) {
      throw new Error(`Follow-up action is not read-only executable: ${action.id} (${action.kind})`);
    }
    const sopRef = action.required_refs.find(isSopDraftArtifactRef);
    if (!sopRef) throw new Error(`Read-only follow-up action has no SOP draft ref: ${action.id}`);
    const result = await this.getSopChain({ sopRef });
    return {
      review_ref: plan.review_ref,
      proposal_id: plan.proposal_id,
      action_id: action.id,
      action_kind: action.kind,
      read_only: true,
      summary: `Executed read-only follow-up action ${action.id}.`,
      action,
      result
    };
  }

  async requestFollowUpConfirmation(args: { reviewRef: string; proposalId: string; actionId: string }): Promise<ReviewFollowUpConfirmationResult> {
    await this.store.ensureLayout();
    const plan = await this.planProposalFollowUp({
      reviewRef: args.reviewRef,
      proposalId: args.proposalId
    });
    const action = plan.actions.find((item) => item.id === args.actionId);
    if (!action) throw new Error(`Follow-up action not found in plan: ${args.actionId}`);
    if (action.would_write.length === 0) {
      throw new Error(`Follow-up action does not require mutation confirmation: ${action.id} (${action.kind})`);
    }
    const draftSopReadiness = action.kind === "draft_sop"
      ? await this.requireReadyDraftSopReadiness({
        reviewRef: plan.review_ref,
        proposalId: plan.proposal_id,
        requiredRefs: action.required_refs,
        operation: "request draft_sop confirmation"
      })
      : undefined;

    const confirmation: ReviewFollowUpConfirmationRequest = {
      id: newId("follow_up_confirmation"),
      created_at: utcNow(),
      status: "pending",
      source: "review_proposal",
      review_ref: plan.review_ref,
      proposal_id: plan.proposal_id,
      proposal_type: plan.proposal_type,
      action_id: action.id,
      action_kind: action.kind,
      confirmation_required: true,
      execution_allowed: false,
      action,
      required_refs: action.required_refs,
      would_write: action.would_write,
      safety_boundary: [
        "This request records operator intent only.",
        "It does not execute the selected follow-up action.",
        "It does not write the active vault.",
        "A later explicit command must re-read this request before any mutation.",
        ...(draftSopReadiness ? [
          "Draft SOP readiness was checked before this confirmation was requested.",
          "Execution must re-check draft SOP readiness before writing a state-only SOP draft."
        ] : [])
      ],
      draft_sop_readiness: draftSopReadiness,
      next_step: followUpConfirmationNextStep(action, this.store.stateRoot)
    };

    const root = `autonomy/followups/${confirmation.id}`;
    const confirmationRef = await this.store.writeJson(`${root}.json`, confirmation);
    const markdownRef = await this.store.writeText(`${root}.md`, renderFollowUpConfirmation(confirmation));
    const event = evidenceEventSchema.parse({
      session_id: confirmation.id,
      turn_id: confirmation.action_id,
      kind: "report",
      summary: `Requested mutation confirmation for follow-up action ${confirmation.action_id}; no mutation executed.`,
      artifact_refs: [confirmationRef, markdownRef, confirmation.review_ref, ...confirmation.required_refs]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);

    return {
      confirmation_ref: confirmationRef,
      confirmation_markdown_ref: markdownRef,
      evidence_event_id: event.id,
      confirmation
    };
  }

  async requestSopNextCommandConfirmation(args: { sopRef: string }): Promise<ReviewFollowUpConfirmationResult> {
    await this.store.ensureLayout();
    const { entry, action } = await this.sopEvolutionActionForConfirmation(args.sopRef);
    if (action.would_write.length === 0) {
      throw new Error(`SOP evolution action does not require mutation confirmation: ${action.id}`);
    }

    const confirmation: ReviewFollowUpConfirmationRequest = {
      id: newId("follow_up_confirmation"),
      created_at: utcNow(),
      status: "pending",
      source: "sop_evolution_chain",
      review_ref: "governance/evolution",
      proposal_id: entry.sop_id,
      proposal_type: "sop_candidate",
      action_id: action.id,
      action_kind: action.kind,
      confirmation_required: true,
      execution_allowed: false,
      action,
      required_refs: action.required_refs,
      would_write: action.would_write,
      safety_boundary: [
        "This request records operator intent only.",
        "It does not execute the selected SOP evolution command.",
        "A later explicit execute-confirmed-follow-up command must re-read this request and revalidate the current SOP chain.",
        ...(entry.next_command?.safety_boundary ?? [])
      ],
      next_step: "",
      sop_ref: entry.sop_ref,
      sop_id: entry.sop_id
    };

    const root = `autonomy/followups/${confirmation.id}`;
    confirmation.next_step = `Review this confirmation request, then run explicitly if still valid: pnpm run runtime -- review execute-confirmed-follow-up --confirmation ${root}.json --state-root ${shellArg(this.store.stateRoot)}`;
    const confirmationRef = await this.store.writeJson(`${root}.json`, confirmation);
    const markdownRef = await this.store.writeText(`${root}.md`, renderFollowUpConfirmation(confirmation));
    const event = evidenceEventSchema.parse({
      session_id: confirmation.id,
      turn_id: confirmation.action_id,
      kind: "report",
      summary: `Requested SOP evolution confirmation for ${entry.sop_id}; no mutation executed.`,
      artifact_refs: [confirmationRef, markdownRef, entry.sop_ref, ...confirmation.required_refs]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);

    return {
      confirmation_ref: confirmationRef,
      confirmation_markdown_ref: markdownRef,
      evidence_event_id: event.id,
      confirmation
    };
  }

  async executeConfirmedFollowUp(args: {
    confirmationRef: string;
    vaultRoot?: SkillResolverLike;
    promotionEnabled?: boolean;
    skillName?: string;
  }): Promise<ReviewFollowUpConfirmedExecutionResult> {
    await this.store.ensureLayout();
    const confirmationRef = resolveFollowUpConfirmationRef(args.confirmationRef);
    const rawConfirmation = await this.store.readStateJson<unknown>(confirmationRef);
    if (!isFollowUpConfirmationRequest(rawConfirmation)) {
      throw new Error(`Follow-up confirmation request not found or invalid: ${confirmationRef}`);
    }
    if (rawConfirmation.status !== "pending") {
      throw new Error(`Follow-up confirmation is not pending: ${confirmationRef}`);
    }
    if (
      rawConfirmation.action_kind !== "draft_sop"
      && rawConfirmation.action_kind !== "audit_sop"
      && rawConfirmation.action_kind !== "promote_sop"
      && rawConfirmation.action_kind !== "narrow_review"
      && rawConfirmation.action_kind !== "collect_evidence"
      && rawConfirmation.action_kind !== "revise_skill"
    ) {
      throw new Error(`Confirmed follow-up execution only supports collect_evidence, draft_sop, audit_sop, promote_sop, revise_skill, or narrow_review: ${rawConfirmation.action_kind}`);
    }

    if (rawConfirmation.source === "sop_evolution_chain") {
      const action = await this.revalidateSopEvolutionConfirmation(rawConfirmation);
      return this.executeConfirmedSopMutationAction({
        confirmationRef,
        rawConfirmation,
        action,
        vaultRoot: args.vaultRoot,
        promotionEnabled: args.promotionEnabled,
        skillName: args.skillName
      });
    }

    const plan = await this.planProposalFollowUp({
      reviewRef: rawConfirmation.review_ref,
      proposalId: rawConfirmation.proposal_id
    });
    const action = plan.actions.find((item) => item.id === rawConfirmation.action_id);
    if (!action) throw new Error(`Confirmed follow-up action no longer exists in plan: ${rawConfirmation.action_id}`);
    if (action.kind !== rawConfirmation.action_kind) {
      throw new Error(`Confirmed follow-up action kind changed: ${action.kind}`);
    }
    if (action.kind === "collect_evidence") {
      const proposal = await this.readReviewProposal(rawConfirmation.review_ref, rawConfirmation.proposal_id);
      if (proposal.type !== "memory_gap") {
        throw new Error(`Confirmed collect_evidence action requires memory_gap proposal: ${proposal.type}`);
      }
      const report = await this.collectEvidenceForProposal({
        reviewRef: rawConfirmation.review_ref,
        proposal
      });
      if (!report.evidence_event_id) throw new Error(`Confirmed evidence collection did not record evidence: ${report.id}`);
      const confirmation = await this.writeExecutedFollowUpConfirmation({
        confirmationRef,
        rawConfirmation,
        action,
        executionResult: {
          kind: "collect_evidence",
          report_ref: report.artifact_refs.json_ref,
          report_markdown_ref: report.artifact_refs.markdown_ref,
          evidence_event_id: report.evidence_event_id,
          events_count: report.source.stats.events_count,
          sessions_count: report.source.stats.sessions_count
        }
      });
      return {
        ...confirmation,
        result: report
      };
    }
    if (action.kind === "narrow_review") {
      const proposal = await this.readReviewProposal(rawConfirmation.review_ref, rawConfirmation.proposal_id);
      if (proposal.type !== "runtime_gap") {
        throw new Error(`Confirmed narrow_review action requires runtime_gap proposal: ${proposal.type}`);
      }
      const review = await this.run({ query: proposal.title });
      if (!review.evidence_event_id) throw new Error(`Confirmed narrow review did not record evidence: ${review.id}`);
      const confirmation = await this.writeExecutedFollowUpConfirmation({
        confirmationRef,
        rawConfirmation,
        action,
        executionResult: {
          kind: "narrow_review",
          review_ref: review.artifact_refs.json_ref,
          review_markdown_ref: review.artifact_refs.markdown_ref,
          evidence_event_id: review.evidence_event_id,
          query: proposal.title,
          proposal_count: review.proposals.length
        }
      });
      return {
        ...confirmation,
        result: review
      };
    }
    if (action.kind === "draft_sop") {
      const draftSopReadiness = await this.requireReadyDraftSopReadiness({
        reviewRef: rawConfirmation.review_ref,
        proposalId: rawConfirmation.proposal_id,
        requiredRefs: action.required_refs,
        operation: "execute draft_sop confirmation"
      });
      const draftResult = await this.draftSopFromProposal({
        reviewRef: rawConfirmation.review_ref,
        proposalId: rawConfirmation.proposal_id
      });
      const confirmation = await this.writeExecutedFollowUpConfirmation({
        confirmationRef,
        rawConfirmation: {
          ...rawConfirmation,
          draft_sop_readiness: draftSopReadiness
        },
        action,
        executionResult: {
          kind: "draft_sop",
          sop_ref: draftResult.sop_ref,
          sop_json_ref: draftResult.sop_json_ref,
          evidence_event_id: draftResult.evidence_event_id
        }
      });
      return {
        ...confirmation,
        result: draftResult
      };
    }
    if (action.kind === "revise_skill") {
      if (!args.vaultRoot) throw new Error("Confirmed revise_skill follow-up execution requires vaultRoot.");
      const proposal = await this.readReviewProposal(rawConfirmation.review_ref, rawConfirmation.proposal_id);
      if (proposal.type !== "skill_revision") {
        throw new Error(`Confirmed revise_skill action requires skill_revision proposal: ${proposal.type}`);
      }
      const revisionResult = await this.validateSkillRevisionCoverage({
        reviewRef: rawConfirmation.review_ref,
        proposal,
        action,
        vaultRoot: args.vaultRoot
      });
      const confirmation = await this.writeExecutedFollowUpConfirmation({
        confirmationRef,
        rawConfirmation,
        action,
        executionResult: {
          kind: "revise_skill",
          status: revisionResult.status,
          skill_refs: revisionResult.skill_refs,
          event_refs: revisionResult.event_refs,
          evidence_event_id: revisionResult.evidence_event_id
        }
      });
      return {
        ...confirmation,
        result: revisionResult
      };
    }

    return this.executeConfirmedSopMutationAction({
      confirmationRef,
      rawConfirmation,
      action,
      vaultRoot: args.vaultRoot,
      promotionEnabled: args.promotionEnabled,
      skillName: args.skillName
    });
  }

  private async executeConfirmedSopMutationAction(args: {
    confirmationRef: string;
    rawConfirmation: ReviewFollowUpConfirmationRequest;
    action: ReviewFollowUpAction;
    vaultRoot?: SkillResolverLike;
    promotionEnabled?: boolean;
    skillName?: string;
  }): Promise<ReviewFollowUpConfirmedExecutionResult> {
    if (args.action.kind !== "audit_sop" && args.action.kind !== "promote_sop") {
      throw new Error(`Confirmed SOP mutation action only supports audit_sop or promote_sop: ${args.action.kind}`);
    }
    const sopRef = args.action.required_refs.find(isSopDraftArtifactRef);
    if (!sopRef) throw new Error(`Confirmed ${args.action.kind} follow-up action has no SOP draft ref: ${args.action.id}`);
    if (args.action.kind === "promote_sop") {
      if (!args.vaultRoot) throw new Error("Confirmed promote follow-up execution requires vaultRoot.");
      const auditRef = args.action.required_refs.find(isAuditArtifactRef);
      if (!auditRef) throw new Error(`Confirmed promote follow-up action has no audit ref: ${args.action.id}`);
      const promotionResult = await this.promoteAuditedSopDraft({
        sopRef,
        auditRef,
        vaultRoot: args.vaultRoot,
        promotionEnabled: args.promotionEnabled ?? false,
        skillName: args.skillName
      });
      const confirmation = await this.writeExecutedFollowUpConfirmation({
        confirmationRef: args.confirmationRef,
        rawConfirmation: args.rawConfirmation,
        action: args.action,
        executionResult: {
          kind: "promote_sop",
          status: promotionResult.status,
          sop_ref: promotionResult.sop_ref,
          audit_ref: promotionResult.audit_ref,
          evidence_event_id: promotionResult.evidence_event_id,
          skill_name: promotionResult.skill_name,
          skill_ref: promotionResult.skill_ref,
          candidate_ref: promotionResult.candidate_ref,
          registry_ref: promotionResult.registry_ref,
          event_ref: promotionResult.event_ref,
          duplicate_skill_ref: promotionResult.duplicate_skill_ref
        }
      });
      return {
        ...confirmation,
        result: promotionResult
      };
    }

    const auditResult = await this.auditSopDraft({ sopRef });
    const confirmation = await this.writeExecutedFollowUpConfirmation({
      confirmationRef: args.confirmationRef,
      rawConfirmation: args.rawConfirmation,
      action: args.action,
      executionResult: {
        kind: "audit_sop",
        sop_ref: auditResult.sop_ref,
        audit_ref: auditResult.audit_ref,
        evidence_event_id: auditResult.evidence_event_id
      }
    });

    return {
      ...confirmation,
      result: auditResult
    };
  }

  private async revalidateSopEvolutionConfirmation(
    confirmation: ReviewFollowUpConfirmationRequest
  ): Promise<ReviewFollowUpAction> {
    const sopRef = confirmation.sop_ref
      ?? confirmation.action.required_refs.find(isSopDraftArtifactRef)
      ?? confirmation.required_refs.find(isSopDraftArtifactRef)
      ?? confirmation.proposal_id;
    const { action } = await this.sopEvolutionActionForConfirmation(sopRef);
    if (action.id !== confirmation.action_id) {
      throw new Error(`Confirmed SOP evolution action changed: ${confirmation.action_id}`);
    }
    if (action.kind !== confirmation.action_kind) {
      throw new Error(`Confirmed SOP evolution action kind changed: ${action.kind}`);
    }
    if (!sameStringArray(action.required_refs, confirmation.required_refs)) {
      throw new Error(`Confirmed SOP evolution required refs changed: ${confirmation.action_id}`);
    }
    if (!sameStringArray(action.would_write, confirmation.would_write)) {
      throw new Error(`Confirmed SOP evolution write boundary changed: ${confirmation.action_id}`);
    }
    return action;
  }

  private async requireReadyDraftSopReadiness(args: {
    reviewRef: string;
    proposalId: string;
    requiredRefs: string[];
    operation: string;
  }): Promise<DraftSopReadinessReport> {
    const readiness = await getDraftSopReadiness(this.store, {
      reviewRef: args.reviewRef,
      proposalId: args.proposalId,
      requiredRefs: args.requiredRefs
    });
    if (readiness.status !== "ready") {
      throw new Error(`Draft SOP readiness is ${readiness.status}; cannot ${args.operation}. ${readiness.next_step}`);
    }
    return readiness;
  }

  private async sopEvolutionActionForConfirmation(
    sopRef: string
  ): Promise<{ entry: SopEvolutionLedgerEntry; action: ReviewFollowUpAction }> {
    const ledger = await getSopEvolutionLedger(this.store, {
      limit: Number.MAX_SAFE_INTEGER,
      vaultRoot: this.vaultRoot
    });
    const normalizedRef = resolveSopJsonRef(sopRef);
    const normalizedId = refId(normalizedRef);
    const entry = ledger.entries.find((item) =>
      item.sop_ref === normalizedRef
      || item.sop_id === normalizedId
      || item.sop_id === sopRef
    );
    if (!entry) throw new Error(`SOP evolution chain not found: ${sopRef}`);
    if (!entry.next_command) {
      throw new Error(`SOP evolution chain has no confirmable next command: ${entry.sop_id}`);
    }
    const action = sopEvolutionNextCommandAction(entry);
    if (action.would_write.length === 0) {
      throw new Error(`SOP evolution next command has no mutation boundary: ${entry.sop_id}`);
    }
    return { entry, action };
  }

  private async writeExecutedFollowUpConfirmation(args: {
    confirmationRef: string;
    rawConfirmation: ReviewFollowUpConfirmationRequest;
    action: ReviewFollowUpAction;
    executionResult: ReviewFollowUpConfirmedExecutionSummary;
  }): Promise<Omit<ReviewFollowUpConfirmedExecutionResult, "result">> {
    const confirmation: ReviewFollowUpConfirmationRequest = {
      ...args.rawConfirmation,
      status: "executed",
      action: args.action,
      required_refs: args.action.required_refs,
      would_write: args.action.would_write,
      executed_at: utcNow(),
      execution_result: args.executionResult
    };
    const markdownRef = followUpConfirmationMarkdownRefFromJsonRef(args.confirmationRef);
    const writtenConfirmationRef = await this.store.writeJson(args.confirmationRef, confirmation);
    const writtenMarkdownRef = await this.store.writeText(markdownRef, renderFollowUpConfirmation(confirmation));
    const event = evidenceEventSchema.parse({
      session_id: confirmation.id,
      turn_id: confirmation.action_id,
      kind: "report",
      summary: `Executed confirmed ${confirmation.action_kind} follow-up action ${confirmation.action_id}; ${followUpExecutionMutationSummary(args.executionResult)}.`,
      artifact_refs: [
        writtenConfirmationRef,
        writtenMarkdownRef,
        ...followUpExecutionArtifactRefs(args.executionResult),
        `memory/episodes/events.jsonl#${args.executionResult.evidence_event_id}`
      ]
    });
    const inboxItemRefs = await this.markInboxItemsExecutedForConfirmation({
      confirmationRef: writtenConfirmationRef,
      confirmationMarkdownRef: writtenMarkdownRef,
      confirmation,
      executionEvidenceEventId: event.id
    });
    event.artifact_refs.push(...inboxItemRefs);
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);

    return {
      confirmation_ref: writtenConfirmationRef,
      confirmation_markdown_ref: writtenMarkdownRef,
      evidence_event_id: event.id,
      confirmation
    };
  }

  private async markInboxItemsExecutedForConfirmation(args: {
    confirmationRef: string;
    confirmationMarkdownRef: string;
    confirmation: ReviewFollowUpConfirmationRequest;
    executionEvidenceEventId: string;
  }): Promise<string[]> {
    const refs = (await this.store.listStateFiles("autonomy/inbox"))
      .filter((ref) => ref.endsWith(".json"));
    const updatedRefs: string[] = [];
    for (const ref of refs) {
      const raw = await this.store.readStateJson<unknown>(ref);
      if (!isReviewInboxItem(raw)) continue;
      if (raw.confirmation_ref !== args.confirmationRef) continue;
      const item: ReviewInboxItem = {
        ...raw,
        updated_at: args.confirmation.executed_at ?? utcNow(),
        status: "executed",
        confirmation_ref: args.confirmationRef,
        confirmation_markdown_ref: args.confirmationMarkdownRef,
        executed_at: args.confirmation.executed_at,
        execution_ref: args.confirmationRef,
        execution_markdown_ref: args.confirmationMarkdownRef,
        execution_evidence_event_id: args.executionEvidenceEventId,
        execution_result: args.confirmation.execution_result
      };
      updatedRefs.push(await this.store.writeJson(ref, item));
    }
    return updatedRefs;
  }

  private async readReviewInboxViews(status: ReviewInboxStatusFilter = "active"): Promise<ReviewInboxItemView[]> {
    const refs = (await this.store.listStateFiles("autonomy/inbox"))
      .filter((ref) => ref.endsWith(".json"));
    const decisions = await readReviewInboxDecisions(this.store);
    const items: ReviewInboxItemView[] = [];
    for (const ref of refs) {
      const raw = await this.store.readStateJson<unknown>(ref);
      if (!isReviewInboxItem(raw)) continue;
      if (status === "active" && raw.status === "executed") continue;
      if (status !== "active" && status !== "all" && raw.status !== status) continue;
      const latestDecision = latestReviewInboxDecision(decisions, ref, raw.id);
      items.push(withReviewInboxDecision(raw, latestDecision));
    }
    return annotateReviewInboxDuplicates(items)
      .map((item) => {
        const latestDecision = latestReviewInboxDuplicateDecision(decisions, item, item.duplicate_group)
          ?? item.latest_decision;
        return withReviewInboxDecision(item, latestDecision);
      })
      .filter((item) => status === "all"
        || item.status === "executed"
        || !isTerminalReviewInboxDecision(item.latest_decision));
  }

  private async reviewInboxDuplicateGroupForItem(itemId: string): Promise<ReviewInboxDuplicateGroup | undefined> {
    const refs = (await this.store.listStateFiles("autonomy/inbox"))
      .filter((ref) => ref.endsWith(".json"));
    const decisions = await readReviewInboxDecisions(this.store);
    const items: ReviewInboxItemView[] = [];
    for (const ref of refs) {
      const raw = await this.store.readStateJson<unknown>(ref);
      if (!isReviewInboxItem(raw) || raw.status === "executed") continue;
      items.push(withReviewInboxDecision(raw, latestReviewInboxDecision(decisions, ref, raw.id)));
    }
    return annotateReviewInboxDuplicates(items)
      .find((item) => item.id === itemId)
      ?.duplicate_group;
  }

  private async readReviewProposal(reviewRefValue: string, proposalId: string): Promise<BackgroundReviewProposal> {
    const reviewRef = resolveReviewRef(reviewRefValue);
    const report = await this.store.readStateJson<BackgroundReviewReport>(reviewRef);
    if (!isBackgroundReviewReport(report)) {
      throw new Error(`Background review report not found or invalid: ${reviewRef}`);
    }
    const proposal = report.proposals.find((item) => item.id === proposalId);
    if (!proposal) throw new Error(`Proposal not found in ${reviewRef}: ${proposalId}`);
    return proposal;
  }

  private async collectEvidenceForProposal(args: {
    reviewRef: string;
    proposal: BackgroundReviewProposal;
  }): Promise<ReviewEvidenceCollectionReport> {
    await this.store.ensureLayout();
    const memory = new MemoryStore(this.store);
    try {
      const sync = await memory.syncEpisodeEvents();
      const stats = await memory.getStats();
      const id = newId("evidence_collection");
      const root = `autonomy/reports/${id}`;
      const report: ReviewEvidenceCollectionReport = {
        id,
        created_at: utcNow(),
        review_ref: resolveReviewRef(args.reviewRef),
        proposal_id: args.proposal.id,
        proposal_type: args.proposal.type,
        summary: `Evidence collection request for memory-gap proposal ${args.proposal.id}.`,
        source: {
          memory_sync: {
            source_ref: sync.source_ref,
            db_ref: sync.db_ref,
            total_rows: sync.total_rows,
            indexed_rows: sync.indexed_rows,
            skipped_rows: sync.skipped_rows
          },
          stats: {
            events_count: stats.events_count,
            sessions_count: stats.sessions_count
          }
        },
        evidence_refs: args.proposal.evidence_refs,
        recommended_intake: [
          "Run a live, pipeline, or IM task that exercises the missing behavior.",
          "Ensure the run records episode evidence under memory/episodes/events.jsonl.",
          "Rerun review background with a query or session scope before drafting or changing SOPs."
        ],
        artifact_refs: {
          json_ref: `${root}.json`,
          markdown_ref: `${root}.md`
        }
      };
      const markdownRef = await this.store.writeText(report.artifact_refs.markdown_ref, renderEvidenceCollectionReport(report));
      const jsonRef = await this.store.writeJson(report.artifact_refs.json_ref, report);
      report.artifact_refs.markdown_ref = markdownRef;
      report.artifact_refs.json_ref = jsonRef;
      const event = evidenceEventSchema.parse({
        session_id: report.id,
        turn_id: args.proposal.id,
        kind: "report",
        summary: `Recorded evidence collection request for memory-gap proposal ${args.proposal.id}.`,
        artifact_refs: [report.artifact_refs.json_ref, report.artifact_refs.markdown_ref, report.review_ref, ...report.evidence_refs]
      });
      await this.store.appendJsonl("memory/episodes/events.jsonl", event);
      report.evidence_event_id = event.id;
      await this.store.writeJson(report.artifact_refs.json_ref, report);
      return report;
    } finally {
      memory.close();
    }
  }

  private async validateSkillRevisionCoverage(args: {
    reviewRef: string;
    proposal: BackgroundReviewProposal;
    action: ReviewFollowUpAction;
    vaultRoot: SkillResolverLike;
  }): Promise<ReviewSkillRevisionResult> {
    const reviewRef = resolveReviewRef(args.reviewRef);
    const skillRefs = dedupeRefs(args.action.required_refs.filter(isSkillArtifactRef));
    if (skillRefs.length === 0) {
      throw new Error(`Confirmed revise_skill action has no skill refs: ${args.action.id}`);
    }

    const registryEntries = await scanSkillRegistry(this.store, args.vaultRoot);
    const eventRefs: string[] = [];
    for (const skillRef of skillRefs) {
      const inferredName = skillNameFromSkillRef(skillRef);
      const entry = registryEntries.find((item) => item.instructions_ref === skillRef || item.name === inferredName);
      const skillName = entry?.name ?? inferredName;
      if (!skillName) continue;

      const event = skillRegistryEventSchema.parse({
        kind: "validated",
        skill_name: skillName,
        instructions_ref: entry?.instructions_ref ?? skillRef,
        source_sop_ref: entry?.source_sop_ref ?? null,
        audit_ref: null,
        evidence_refs: dedupeRefs([reviewRef, ...args.proposal.evidence_refs]),
        artifact_refs: dedupeRefs([reviewRef, ...skillRefs]),
        summary: `Validated reused-skill coverage before revision decision: ${skillName}.`
      });
      const eventLogRef = await this.store.appendRepoJsonl(activeVaultRef(args.vaultRoot, "registry/skill-events.jsonl"), event);
      eventRefs.push(`${eventLogRef}#${event.id}`);
    }

    if (eventRefs.length === 0) {
      throw new Error(`Confirmed revise_skill action did not match any skill refs: ${args.action.id}`);
    }

    const summary = `Validated reused-skill coverage for ${eventRefs.length} skill(s); no skill content rewritten.`;
    const evidence = evidenceEventSchema.parse({
      session_id: args.proposal.id,
      turn_id: args.action.id,
      kind: "report",
      summary,
      artifact_refs: [reviewRef, ...skillRefs, ...eventRefs]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", evidence);

    return {
      status: "validated",
      review_ref: reviewRef,
      proposal_id: args.proposal.id,
      skill_refs: skillRefs,
      event_refs: eventRefs,
      evidence_event_id: evidence.id,
      summary
    };
  }

  private async writeSopDraftState(sopJsonRef: string, sop: SOPDraft): Promise<string> {
    const writtenSopRef = await this.store.writeJson(sopJsonRef, sop);
    await this.store.writeText(sopMarkdownRefFromJsonRef(sopJsonRef), formatSopMarkdown(sop));
    return writtenSopRef;
  }

  private async buildChainSummaries(events: EpisodeEventRecord[]): Promise<BackgroundReviewChainSummary[]> {
    const summaries: BackgroundReviewChainSummary[] = [];
    for (const sopRef of extractSopRefsFromEvents(events)) {
      try {
        const chain = await this.getSopChain({ sopRef });
        if (summaries.some((summary) => summary.sop_id === chain.sop.id)) continue;
        summaries.push({
          sop_ref: chain.sop_ref,
          sop_id: chain.sop.id,
          title: chain.sop.title,
          sop_status: chain.status.sop_status,
          latest_decision: chain.status.latest_decision,
          event_count: chain.status.event_count,
          audit_count: chain.status.audit_count,
          promotion_events: chain.status.promotion_events,
          reuse_events: chain.status.reuse_events,
          review_refs: chain.review_refs,
          audit_refs: chain.audit_refs,
          skill_refs: chain.skill_refs,
          duplicate_skill_refs: chain.duplicate_skill_refs,
          event_ids: chain.events.map((event) => event.id)
        });
      } catch (error) {
        if (!isMissingSopDraftError(error)) throw error;
      }
    }
    return summaries;
  }
}

function chainsForProposal(
  chains: BackgroundReviewChainSummary[],
  proposal: BackgroundReviewProposal
): BackgroundReviewChainSummary[] {
  const proposalRefs = new Set(proposal.evidence_refs);
  const proposalSopIds = new Set(extractSopRefsFromValues(proposal.evidence_refs));
  const proposalTitle = normalizeComparableText(proposal.title);
  return chains.filter((chain) => {
    if (proposalTitle && normalizeComparableText(chain.title) === proposalTitle) return true;
    if (proposalRefs.has(chain.sop_ref) || proposalSopIds.has(chain.sop_id)) return true;
    return [
      ...chain.review_refs,
      ...chain.audit_refs,
      ...chain.skill_refs,
      ...chain.duplicate_skill_refs,
      ...chain.event_ids.map((id) => `memory/episodes/events.jsonl#${id}`)
    ].some((ref) => proposalRefs.has(ref));
  });
}

function buildFollowUpActions(args: {
  stateRoot: string;
  reviewRef: string;
  proposal: BackgroundReviewProposal;
  chains: BackgroundReviewChainSummary[];
}): ReviewFollowUpAction[] {
  const actions: ReviewFollowUpAction[] = [];
  for (const chain of args.chains) {
    actions.push({
      id: followUpActionId(args, "inspect_chain", [chain.sop_id]),
      kind: "inspect_chain",
      title: `Inspect SOP chain ${chain.sop_id}`,
      rationale: `Chain latest decision is ${chain.latest_decision}; inspect provenance before selecting a mutation command.`,
      command: `pnpm run runtime -- review chain --sop ${chain.sop_id} --state-root ${shellArg(args.stateRoot)}`,
      required_refs: [chain.sop_ref, ...chain.event_ids.map((id) => `memory/episodes/events.jsonl#${id}`)],
      would_write: []
    });
  }

  if (args.proposal.type === "memory_gap") {
    actions.push({
      id: followUpActionId(args, "collect_evidence", args.proposal.evidence_refs),
      kind: "collect_evidence",
      title: "Collect episode evidence before self-evolution",
      rationale: "The proposal has no evidence-backed chain or event pattern to act on.",
      command: null,
      required_refs: args.proposal.evidence_refs,
      would_write: ["state"]
    });
    return actions;
  }

  if (args.proposal.type === "runtime_gap") {
    actions.push({
      id: followUpActionId(args, "narrow_review", [args.proposal.title]),
      kind: "narrow_review",
      title: "Rerun background review with a narrower scope",
      rationale: "The current review scope is too broad for a mutation decision.",
      command: `pnpm run runtime -- review background --query ${shellArg(args.proposal.title)} --state-root ${shellArg(args.stateRoot)}`,
      required_refs: args.proposal.evidence_refs,
      would_write: ["state"]
    });
    return actions;
  }

  if (args.proposal.type === "sop_candidate") {
    const actionableChains = args.chains.filter((chain) => chain.latest_decision === "audited" || chain.latest_decision === "drafted");
    for (const chain of actionableChains) {
      if (chain.latest_decision === "audited" && chain.audit_refs[0]) {
        actions.push({
          id: followUpActionId(args, "promote_sop", [chain.sop_id, chain.audit_refs[0]]),
          kind: "promote_sop",
          title: `Complete promotion decision for ${chain.sop_id}`,
          rationale: "The chain has audit evidence but no promotion or reuse decision.",
          command: `pnpm run runtime -- review promote-sop --sop ${chain.sop_id} --audit ${refId(chain.audit_refs[0])} --state-root ${shellArg(args.stateRoot)}`,
          required_refs: [chain.sop_ref, chain.audit_refs[0]],
          would_write: ["state", "active_vault"]
        });
      } else if (chain.latest_decision === "drafted") {
        actions.push({
          id: followUpActionId(args, "audit_sop", [chain.sop_id]),
          kind: "audit_sop",
          title: `Audit draft SOP ${chain.sop_id}`,
          rationale: "The chain has a draft SOP but no audit evidence yet.",
          command: `pnpm run runtime -- review audit-sop --sop ${chain.sop_id} --state-root ${shellArg(args.stateRoot)}`,
          required_refs: [chain.sop_ref],
          would_write: ["state"]
        });
      }
    }
    if (args.chains.length === 0) {
      actions.push({
        id: followUpActionId(args, "draft_sop", [args.reviewRef, args.proposal.id]),
        kind: "draft_sop",
        title: "Draft a state-only SOP from this proposal",
        rationale: "No existing actionable SOP chain was found for this proposal.",
        command: `pnpm run runtime -- review draft-sop --review ${refId(args.reviewRef)} --proposal ${args.proposal.id} --state-root ${shellArg(args.stateRoot)}`,
        required_refs: [args.reviewRef, ...args.proposal.evidence_refs],
        would_write: ["state"]
      });
    }
    return actions;
  }

  if (args.proposal.type === "skill_revision") {
    const hasSelectedSkillTelemetry = args.proposal.evidence_refs.some(isSelectedSkillOutcomeArtifactRef);
    const title = hasSelectedSkillTelemetry
      ? "Validate selected-skill telemetry before revising metadata"
      : "Validate reused skill coverage before revising metadata";
    const rationale = hasSelectedSkillTelemetry
      ? "Selected-skill outcome telemetry needs operator validation before any skill metadata or instruction revision."
      : args.chains.length > 0
        ? "One or more SOP chains ended in reused_skill; confirm the duplicate skill still covers the trigger before changing SOPs."
        : "The proposal indicates duplicate-skill behavior, but no full SOP chain was available in this review.";
    actions.push({
      id: followUpActionId(
        args,
        "revise_skill",
        args.chains.length > 0 ? args.chains.map((chain) => chain.sop_id) : args.proposal.evidence_refs
      ),
      kind: "revise_skill",
      title,
      rationale,
      command: null,
      required_refs: args.chains.length > 0 ? chainEvidenceRefs(args.chains) : args.proposal.evidence_refs,
      would_write: ["active_vault"]
    });
    return actions;
  }

  actions.push({
    id: followUpActionId(args, "inspect_evidence", args.proposal.evidence_refs),
    kind: "inspect_evidence",
    title: "Inspect proposal evidence",
    rationale: "No specialized follow-up action matched this proposal.",
    command: null,
    required_refs: args.proposal.evidence_refs,
    would_write: []
  });
  return actions;
}

function followUpConfirmationNextStep(action: ReviewFollowUpAction, stateRoot: string): string {
  if (action.kind === "revise_skill") {
    const sopRef = action.required_refs.find(isSopDraftArtifactRef);
    if (sopRef) {
      return `Inspect reused-skill coverage first: pnpm run runtime -- review coverage --sop ${shellArg(refId(sopRef))} --state-root ${shellArg(stateRoot)}. Then execute this pending confirmation only if coverage is still valid.`;
    }
    const outcomeRef = action.required_refs.find(isSelectedSkillOutcomeArtifactRef);
    if (outcomeRef) {
      return `Inspect selected-skill telemetry first: pnpm run runtime -- skills outcomes --outcome ${shellArg(refId(outcomeRef))} --state-root ${shellArg(stateRoot)}. Then execute this pending confirmation only if revision validation is still valid.`;
    }
    return "Inspect reused-skill coverage first. Then execute this pending confirmation only if coverage is still valid.";
  }
  return action.command
    ? `Review this confirmation request, then run explicitly if still valid: ${action.command}`
    : "Review this confirmation request, then perform the mutation through a later explicit executor if still valid.";
}

function isReviewTickQueryableBacklogItem(item: OpportunityBacklogItem): boolean {
  return item.kind === "sop_evolution_chain"
    || item.kind === "open_opportunity"
    || item.kind === "completion_verification"
    || item.kind === "archive_health"
    || item.kind === "skill_registry_health"
    || item.kind === "context_health"
    || item.kind === "pipeline_run"
    || item.kind === "selected_skill_drift"
    || item.kind === "selected_skill_outcome"
    || (item.kind === "self_evolution_gap"
      && item.status === "active"
      && (item.action_kind === "narrow_review" || item.action_kind === "draft_sop"));
}

function firstReviewTickFocusBacklogItem(items: OpportunityBacklogItem[]): OpportunityBacklogItem | undefined {
  const nonWaiting = items.filter((item) => !isReviewTickWaitingBacklogItem(item));
  return nonWaiting.find(isReviewTickScopedBacklogItem) ?? nonWaiting[0];
}

function isReviewTickScopedBacklogItem(item: OpportunityBacklogItem): boolean {
  return item.kind === "working_checkpoint" || isReviewTickQueryableBacklogItem(item);
}

function isReviewTickWaitingBacklogItem(item: OpportunityBacklogItem): boolean {
  return item.status === "waiting";
}

function reviewTickWaitingReason(item: OpportunityBacklogItem): string {
  const notBeforeAt = item.self_evolution_gap?.not_before_at;
  return notBeforeAt
    ? `top backlog item ${item.kind}:${item.id} is waiting until ${notBeforeAt}; keeping recent review scope`
    : `top backlog item ${item.kind}:${item.id} is waiting; keeping recent review scope`;
}

function reviewTickSelectedBacklogReason(
  item: OpportunityBacklogItem,
  skippedWaitingCount: number,
  skippedActionableCount: number
): string {
  if (skippedWaitingCount > 0) {
    return [
      `selected first non-waiting backlog item ${item.kind}:${item.id}`,
      `after skipping ${skippedWaitingCount} waiting item(s)`
    ].join(" ");
  }
  if (skippedActionableCount > 0) {
    return [
      `selected first scoped backlog item ${item.kind}:${item.id}`,
      `after skipping ${skippedActionableCount} already-actionable item(s)`
    ].join(" ");
  }
  return `selected top backlog item ${item.kind}:${item.id}`;
}

function reviewTickQueryForBacklogItem(item: OpportunityBacklogItem): string {
  return compactText([
    item.kind,
    item.id,
    item.title,
    `status=${item.status}`,
    item.action_kind ? `action=${item.action_kind}` : "",
    item.source_ref ? `source=${item.source_ref}` : "",
    ...completionDiagnosticQueryParts(item),
    ...durableHealthQueryParts(item),
    ...selfEvolutionGapQueryParts(item),
    `ref=${item.ref}`,
    item.action_chain ? `action_chain=${renderFocusActionChainQuery(item.action_chain)}` : "",
    item.kind === "open_opportunity"
    || item.kind === "completion_verification"
    || item.kind === "archive_health"
    || item.kind === "skill_registry_health"
    || item.kind === "context_health"
    || item.kind === "pipeline_run"
    || item.kind === "selected_skill_drift"
    || item.kind === "selected_skill_outcome"
    || item.kind === "self_evolution_gap"
      ? item.summary
      : ""
  ].filter(Boolean).join(" "), 500);
}

function completionDiagnosticQueryParts(item: OpportunityBacklogItem): string[] {
  const completion = item.completion_verification;
  if (!completion || completion.model_diagnostic_count === 0) return [];
  const diagnostics = completion.model_diagnostics.slice(0, 3);
  return [
    `model_diagnostics=${completion.model_diagnostic_count}`,
    `model_failure_kinds=${dedupeRefs(diagnostics.map((diagnostic) => diagnostic.failure_kind)).join(",")}`,
    `model_failure_stages=${dedupeRefs(diagnostics.map((diagnostic) => diagnostic.stage)).join(",")}`,
    `model_diagnostic_refs=${diagnostics.map((diagnostic) => diagnostic.diagnostic_ref).join(",")}`
  ];
}

function durableHealthQueryParts(item: OpportunityBacklogItem): string[] {
  if (item.archive_health) {
    return [
      `archive_health_kind=${item.archive_health.issue_kind}`,
      `archive_health_status=${item.archive_health.issue_status}`,
      `archive_date=${item.archive_health.date ?? "unknown"}`,
      `archive_source_events=${item.archive_health.source_event_count ?? "unknown"}`,
      `archive_events=${item.archive_health.archive_event_count ?? "unknown"}`,
      `archive_ref=${item.archive_health.archive_ref ?? "none"}`,
      `archive_refresh=${item.archive_health.refresh_command ? "available" : "none"}`
    ];
  }
  if (item.skill_registry_health) {
    return [
      `skill_registry_issue=${item.skill_registry_health.issue_kind}`,
      `skill_registry_status=${item.skill_registry_health.issue_status}`,
      `skill=${item.skill_registry_health.skill_name ?? "unknown"}`,
      `instructions=${item.skill_registry_health.instructions_ref ?? "none"}`,
      `registry_ref=${item.skill_registry_health.registry_ref ?? "none"}`,
      `event_ref=${item.skill_registry_health.event_ref ?? "none"}`,
      `registry_sync=${item.skill_registry_health.sync_command ? "available" : "none"}`
    ];
  }
  return [];
}

function selfEvolutionGapQueryParts(item: OpportunityBacklogItem): string[] {
  const gap = item.self_evolution_gap;
  if (!gap) return [];
  return [
    `gap_id=${gap.gap_id}`,
    `proposed_slice=${gap.proposed_slice}`,
    `owner_surface=${gap.owner_surface}`,
    `gap_ref=${gap.gap_ref}`,
    `evidence_refs=${gap.evidence_refs.slice(0, 5).join(",")}`,
    `verification_commands=${gap.verification_commands.length}`
  ];
}

function reviewTickOpportunitySummary(item: OpportunityBacklogItem): ReviewTickFocus["opportunity"] {
  return {
    ref: item.ref,
    id: item.id,
    kind: item.kind,
    status: item.status,
    score: item.score,
    action_kind: item.action_kind,
    source_ref: item.source_ref,
    ...(item.self_evolution_gap ? { self_evolution_gap: item.self_evolution_gap } : {}),
    action_chain: summarizeFocusActionChain(item.action_chain)
  };
}

function summarizeFocusActionChain(
  actionChain: OpportunityBacklogItem["action_chain"] | undefined
): ReviewActionChainStepSummary[] | undefined {
  if (!actionChain || actionChain.length === 0) return undefined;
  return actionChain.slice(0, 5).map((step) => ({
    label: step.label,
    effect: step.effect,
    reason: step.reason
  }));
}

function renderFocusActionChain(
  actionChain: Array<Pick<ReviewActionChainStepSummary, "label" | "effect">>
): string {
  return actionChain.map((step) => `${step.label}[${step.effect}]`).join(" -> ");
}

function renderFocusActionChainQuery(
  actionChain: Array<Pick<ReviewActionChainStepSummary, "label" | "effect">>
): string {
  return actionChain.map((step) => `${step.label}:${step.effect}`).join(",");
}

function followUpActionId(
  args: { reviewRef: string; proposal: BackgroundReviewProposal },
  kind: ReviewFollowUpActionKind,
  idParts: string[]
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([args.reviewRef, args.proposal.id, kind, ...idParts]))
    .digest("hex")
    .slice(0, 12);
  return `follow_up_action_${kind}_${hash}`;
}

function sopEvolutionFollowUpActionId(entry: SopEvolutionLedgerEntry): string {
  return sopEvolutionNextCommandActionId(entry);
}

function sopEvolutionNextCommandAction(entry: SopEvolutionLedgerEntry): ReviewFollowUpAction {
  const nextCommand = entry.next_command;
  if (!nextCommand) throw new Error(`SOP evolution chain has no next command: ${entry.sop_id}`);
  return {
    id: sopEvolutionFollowUpActionId(entry),
    kind: nextCommand.action_kind,
    title: nextCommand.action_kind === "audit_sop"
      ? `Audit draft SOP ${entry.sop_id}`
      : `Complete promotion decision for ${entry.sop_id}`,
    rationale: nextCommand.action_kind === "audit_sop"
      ? "The SOP evolution chain has a draft SOP but no audit evidence yet."
      : "The SOP evolution chain has a promote audit verdict but no promotion or reuse decision.",
    command: nextCommand.command,
    required_refs: nextCommand.required_refs,
    would_write: followUpWriteSurfaces(nextCommand.would_write)
  };
}

function followUpWriteSurfaces(values: string[]): ReviewFollowUpAction["would_write"] {
  return values.filter((item): item is ReviewFollowUpAction["would_write"][number] =>
    item === "state" || item === "active_vault" || item === "repo"
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function reviewInboxItemId(args: { proposal: BackgroundReviewProposal; action: ReviewFollowUpAction }): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([
      args.proposal.type,
      args.proposal.title,
      args.proposal.next_action,
      args.action.kind,
      args.action.title,
      stableInboxRefs(args.action.required_refs),
      args.action.would_write
    ]))
    .digest("hex")
    .slice(0, 12);
  return `review_inbox_${hash}`;
}

function reviewInboxItemRef(id: string): string {
  return `autonomy/inbox/${id}.json`;
}

function stableInboxRefs(refs: string[]): string[] {
  return refs
    .filter((ref) => !isReviewArtifactRef(ref))
    .slice()
    .sort();
}

function renderFollowUpConfirmation(confirmation: ReviewFollowUpConfirmationRequest): string {
  return [
    `# Follow-Up Confirmation: ${confirmation.id}`,
    "",
    `- Status: ${confirmation.status}`,
    `- Source: ${confirmation.source ?? "review_proposal"}`,
    `- Review: ${confirmation.review_ref}`,
    `- Proposal: ${confirmation.proposal_id}`,
    ...(confirmation.sop_id ? [`- SOP: ${confirmation.sop_id}`] : []),
    ...(confirmation.sop_ref ? [`- SOP ref: ${confirmation.sop_ref}`] : []),
    `- Action: ${confirmation.action_id}`,
    `- Kind: ${confirmation.action_kind}`,
    `- Confirmation required: ${confirmation.confirmation_required ? "yes" : "no"}`,
    `- Execution allowed by this request: ${confirmation.execution_allowed ? "yes" : "no"}`,
    "",
    "## Action",
    "",
    `Title: ${confirmation.action.title}`,
    "",
    `Rationale: ${confirmation.action.rationale}`,
    "",
    `Suggested command: ${confirmation.action.command ?? "none"}`,
    "",
    "## Would Write",
    "",
    ...confirmation.would_write.map((surface) => `- ${surface}`),
    "",
    "## Required Refs",
    "",
    ...confirmation.required_refs.map((ref) => `- ${ref}`),
    "",
    ...(confirmation.draft_sop_readiness ? [
      "## Draft SOP Readiness",
      "",
      ...renderDraftSopReadinessSummary(confirmation.draft_sop_readiness),
      ""
    ] : []),
    "## Safety Boundary",
    "",
    ...confirmation.safety_boundary.map((item) => `- ${item}`),
    "",
    "## Next Step",
    "",
    confirmation.next_step,
    "",
    ...(confirmation.execution_result ? [
      "## Execution Result",
      "",
      ...renderFollowUpExecutionSummary(confirmation.execution_result),
      `- Executed at: ${confirmation.executed_at ?? "unknown"}`,
      ""
    ] : []),
    ""
  ].join("\n");
}

function renderDraftSopReadinessSummary(readiness: DraftSopReadinessReport): string[] {
  return [
    `- Status: ${readiness.status}`,
    `- Review: ${readiness.review_ref ?? "none"}`,
    `- Proposal: ${readiness.proposal_id ?? "none"}`,
    `- Evidence refs: ${readiness.evidence_ref_count}`,
    `- Failure signals: ${readiness.failure_signal_count}`,
    `- SOP signals: ${readiness.sop_signal_count}`,
    ...(readiness.existing_sop_refs.length > 0 ? [
      `- Related SOP refs: ${readiness.existing_sop_refs.slice(0, 5).join(", ")}`
    ] : []),
    ...(readiness.existing_skill_refs.length > 0 ? [
      `- Related skill refs: ${readiness.existing_skill_refs.slice(0, 5).join(", ")}`
    ] : []),
    `- Next step: ${readiness.next_step}`
  ];
}

function renderFollowUpExecutionSummary(summary: ReviewFollowUpConfirmedExecutionSummary): string[] {
  if (summary.kind === "draft_sop") {
    return [
      `- Kind: ${summary.kind}`,
      `- SOP: ${summary.sop_ref}`,
      `- SOP JSON: ${summary.sop_json_ref}`,
      `- Evidence: memory/episodes/events.jsonl#${summary.evidence_event_id}`
    ];
  }
  if (summary.kind === "promote_sop") {
    return [
      `- Kind: ${summary.kind}`,
      `- Status: ${summary.status}`,
      `- SOP: ${summary.sop_ref}`,
      `- Audit: ${summary.audit_ref}`,
      `- Skill: ${summary.skill_name}`,
      `- Skill ref: ${summary.skill_ref ?? "none"}`,
      `- Candidate ref: ${summary.candidate_ref ?? "none"}`,
      `- Registry ref: ${summary.registry_ref ?? "none"}`,
      `- Skill event ref: ${summary.event_ref ?? "none"}`,
      `- Duplicate skill ref: ${summary.duplicate_skill_ref ?? "none"}`,
      `- Evidence: memory/episodes/events.jsonl#${summary.evidence_event_id}`
    ];
  }
  if (summary.kind === "narrow_review") {
    return [
      `- Kind: ${summary.kind}`,
      `- Query: ${summary.query}`,
      `- Review: ${summary.review_ref}`,
      `- Review markdown: ${summary.review_markdown_ref}`,
      `- Proposal count: ${summary.proposal_count}`,
      `- Evidence: memory/episodes/events.jsonl#${summary.evidence_event_id}`
    ];
  }
  if (summary.kind === "collect_evidence") {
    return [
      `- Kind: ${summary.kind}`,
      `- Report: ${summary.report_ref}`,
      `- Report markdown: ${summary.report_markdown_ref}`,
      `- Events count: ${summary.events_count}`,
      `- Sessions count: ${summary.sessions_count}`,
      `- Evidence: memory/episodes/events.jsonl#${summary.evidence_event_id}`
    ];
  }
  if (summary.kind === "revise_skill") {
    return [
      `- Kind: ${summary.kind}`,
      `- Status: ${summary.status}`,
      `- Skill refs: ${summary.skill_refs.join(", ") || "none"}`,
      `- Skill event refs: ${summary.event_refs.join(", ") || "none"}`,
      `- Evidence: memory/episodes/events.jsonl#${summary.evidence_event_id}`
    ];
  }
  return [
    `- Kind: ${summary.kind}`,
    `- SOP: ${summary.sop_ref}`,
    `- Audit: ${summary.audit_ref}`,
    `- Evidence: memory/episodes/events.jsonl#${summary.evidence_event_id}`
  ];
}

function followUpExecutionArtifactRefs(summary: ReviewFollowUpConfirmedExecutionSummary): string[] {
  if (summary.kind === "draft_sop") return [summary.sop_json_ref, summary.sop_ref];
  if (summary.kind === "narrow_review") return [summary.review_ref, summary.review_markdown_ref];
  if (summary.kind === "collect_evidence") return [summary.report_ref, summary.report_markdown_ref];
  if (summary.kind === "revise_skill") return [...summary.skill_refs, ...summary.event_refs];
  if (summary.kind === "promote_sop") {
    return [
      summary.sop_ref,
      summary.audit_ref,
      summary.skill_ref,
      summary.candidate_ref,
      summary.registry_ref,
      summary.event_ref,
      summary.duplicate_skill_ref
    ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
  }
  return [summary.sop_ref, summary.audit_ref];
}

function followUpExecutionMutationSummary(summary: ReviewFollowUpConfirmedExecutionSummary): string {
  if (summary.kind === "collect_evidence") return "state evidence collection report written and active vault unchanged";
  if (summary.kind === "narrow_review") return "state review written and active vault unchanged";
  if (summary.kind === "revise_skill") return "active vault validation event written and skill content unchanged";
  if (summary.kind === "promote_sop") {
    return summary.status === "promoted"
      ? "active vault updated"
      : "duplicate skill reused and active vault unchanged";
  }
  return "active vault unchanged";
}

function toFollowUpConfirmationSummary(
  ref: string,
  confirmation: ReviewFollowUpConfirmationRequest,
  sopEvolutionGate: SopEvolutionConfirmationGate | undefined,
  stateRoot: string,
  latestRecoveryDecision?: ReviewFollowUpConfirmationRecoveryDecisionWithRef
): ReviewFollowUpConfirmationSummary {
  return {
    confirmation_ref: ref,
    id: confirmation.id,
    status: confirmation.status,
    source: confirmation.source ?? "review_proposal",
    created_at: confirmation.created_at,
    executed_at: confirmation.executed_at,
    review_ref: confirmation.review_ref,
    proposal_id: confirmation.proposal_id,
    proposal_type: confirmation.proposal_type,
    action_id: confirmation.action_id,
    action_kind: confirmation.action_kind,
    title: confirmation.action.title,
    would_write: confirmation.would_write,
    required_refs: confirmation.required_refs,
    sop_ref: confirmation.sop_ref,
    sop_id: confirmation.sop_id,
    draft_sop_readiness: confirmation.draft_sop_readiness,
    sop_evolution_gate: sopEvolutionGate,
    sop_evolution_recovery: sopEvolutionConfirmationRecovery(confirmation, sopEvolutionGate, stateRoot, ref, latestRecoveryDecision),
    execution_kind: confirmation.execution_result?.kind,
    evidence_event_id: confirmation.execution_result?.evidence_event_id
  };
}

function sopEvolutionConfirmationRecovery(
  confirmation: ReviewFollowUpConfirmationRequest,
  gate: SopEvolutionConfirmationGate | undefined,
  stateRoot: string,
  confirmationRef: string,
  latestDecision?: ReviewFollowUpConfirmationRecoveryDecisionWithRef
): ReviewFollowUpConfirmationRecovery | undefined {
  if ((confirmation.source ?? "review_proposal") !== "sop_evolution_chain") return undefined;
  if (gate?.status !== "stale") return undefined;
  const sopId = confirmation.sop_id ?? (confirmation.sop_ref ? refId(confirmation.sop_ref) : confirmation.proposal_id);
  const requestCommand = `pnpm run runtime -- review request-sop-confirmation --sop ${shellArg(sopId)} --state-root ${shellArg(stateRoot)}`;
  const decisionCommand = `pnpm run runtime -- review decide-sop-recovery --confirmation ${shellArg(confirmationRef)} --status deferred --reason "..." --state-root ${shellArg(stateRoot)}`;
  return {
    action: "request_fresh_sop_confirmation",
    sop_id: sopId,
    sop_ref: confirmation.sop_ref,
    request_command: requestCommand,
    reason: gate.reason,
    playbook: sopEvolutionRecoveryPlaybook(gate.reason_code, {
      sopId,
      stateRoot,
      requestCommand
    }),
    decision_command: decisionCommand,
    latest_decision: latestDecision
  };
}

function sopEvolutionRecoveryPlaybook(
  reasonCode: SopEvolutionConfirmationGateReasonCode,
  args: { sopId: string; stateRoot: string; requestCommand: string }
): ReviewFollowUpConfirmationRecoveryPlaybook {
  const inspectCommand = `pnpm run runtime -- governance evolution --state-root ${shellArg(args.stateRoot)}`;
  const requestStep = `If the current ledger still exposes a confirmable next command for ${args.sopId}, request a fresh confirmation explicitly: ${args.requestCommand}`;
  const shared = [
    `Inspect the current SOP Evolution Ledger: ${inspectCommand}`,
    "Do not execute the stale confirmation; execution-time revalidation will reject it."
  ];
  if (reasonCode === "chain_not_found") {
    return {
      reason_code: reasonCode,
      summary: "The SOP chain is no longer present in the current ledger.",
      inspect_command: inspectCommand,
      next_steps: [
        ...shared,
        "If the SOP was retired, deleted, or superseded, leave the stale confirmation as historical evidence.",
        requestStep
      ]
    };
  }
  if (reasonCode === "next_command_missing") {
    return {
      reason_code: reasonCode,
      summary: "The SOP chain is present but currently has no confirmable next command.",
      inspect_command: inspectCommand,
      next_steps: [
        ...shared,
        "If the SOP is retired, promoted, or otherwise complete, no replacement confirmation is needed.",
        "If more work is expected, create or update the chain state first, then request a fresh confirmation."
      ]
    };
  }
  if (
    reasonCode === "action_id_changed"
    || reasonCode === "action_kind_changed"
    || reasonCode === "required_refs_changed"
    || reasonCode === "write_boundary_changed"
  ) {
    return {
      reason_code: reasonCode,
      summary: "The ledger next command changed since this confirmation was requested.",
      inspect_command: inspectCommand,
      next_steps: [
        ...shared,
        "Compare the current action, required refs, and write boundary shown by the ledger with the stale confirmation.",
        requestStep
      ]
    };
  }
  if (reasonCode === "sop_ref_missing" || reasonCode === "confirmation_status_unsupported") {
    return {
      reason_code: reasonCode,
      summary: "The confirmation envelope cannot be safely tied to a current SOP chain.",
      inspect_command: inspectCommand,
      next_steps: [
        ...shared,
        "Inspect the confirmation artifact by ref before deciding whether it should remain only as evidence.",
        "Request a fresh confirmation from a known SOP id only after the current ledger identifies the intended chain."
      ]
    };
  }
  return {
    reason_code: reasonCode,
    summary: "The stale gate requires a fresh operator decision from the current ledger.",
    inspect_command: inspectCommand,
    next_steps: [
      ...shared,
      requestStep
    ]
  };
}

function summarizeFollowUpConfirmationGates(
  confirmations: ReviewFollowUpConfirmationSummary[]
): ReviewFollowUpConfirmationGateSummary {
  const reasons = new Map<string, ReviewFollowUpConfirmationGateReasonCount>();
  const summary: ReviewFollowUpConfirmationGateSummary = {
    total: confirmations.length,
    with_gate: 0,
    without_gate: 0,
    current: 0,
    stale: 0,
    executed: 0,
    reasons: []
  };
  for (const confirmation of confirmations) {
    const gate = confirmation.sop_evolution_gate;
    const status = gate?.status ?? "none";
    const reasonCode = gate?.reason_code ?? "none";
    if (!gate) {
      summary.without_gate += 1;
    } else {
      summary.with_gate += 1;
      summary[gate.status] += 1;
    }
    const key = `${status}:${reasonCode}`;
    const existing = reasons.get(key);
    if (existing) existing.count += 1;
    else reasons.set(key, {
      status,
      reason_code: reasonCode,
      count: 1
    });
  }
  summary.reasons = [...reasons.values()]
    .sort((left, right) => right.count - left.count || left.reason_code.localeCompare(right.reason_code));
  return summary;
}

function renderEvidenceCollectionReport(report: ReviewEvidenceCollectionReport): string {
  return [
    `# Evidence Collection ${report.id}`,
    "",
    `- review_ref: ${report.review_ref}`,
    `- proposal_id: ${report.proposal_id}`,
    `- proposal_type: ${report.proposal_type}`,
    `- created_at: ${report.created_at}`,
    `- events_count: ${report.source.stats.events_count}`,
    `- sessions_count: ${report.source.stats.sessions_count}`,
    `- indexed_rows: ${report.source.memory_sync.indexed_rows}`,
    `- skipped_rows: ${report.source.memory_sync.skipped_rows}`,
    "",
    "## Summary",
    "",
    report.summary,
    "",
    "## Evidence Refs",
    "",
    ...(report.evidence_refs.length > 0 ? report.evidence_refs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Recommended Intake",
    "",
    ...report.recommended_intake.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

function renderReviewTick(tick: ReviewTickResult): string {
  return [
    `# Review Tick ${tick.id}`,
    "",
    `- mode: ${tick.mode}`,
    `- query: ${tick.query ?? "n/a"}`,
    `- session_id: ${tick.session_id ?? "n/a"}`,
    `- focus_source: ${tick.focus.source}`,
    `- focus_reason: ${tick.focus.reason}`,
    `- focus_query: ${tick.focus.query ?? "n/a"}`,
    ...(tick.focus.opportunity ? [
      `- focus_opportunity: ${tick.focus.opportunity.kind}:${tick.focus.opportunity.id}`,
      `- focus_ref: ${tick.focus.opportunity.ref}`,
      `- focus_score: ${tick.focus.opportunity.score}`,
      `- focus_action: ${tick.focus.opportunity.action_kind ?? "n/a"}`,
      ...(tick.focus.opportunity.action_chain
        ? [`- focus_action_chain: ${renderFocusActionChain(tick.focus.opportunity.action_chain)}`]
        : [])
    ] : []),
    `- created_at: ${tick.created_at}`,
    `- review_ref: ${tick.review_ref}`,
    `- proposal_count: ${tick.proposal_count}`,
    `- inbox_items: ${tick.inbox_items.length}`,
    `- new_items: ${tick.stats.new_items}`,
    `- updated_items: ${tick.stats.updated_items}`,
    "",
    "## Inbox Items",
    "",
    ...(tick.inbox_items.length > 0 ? tick.inbox_items.flatMap((item) => [
      `- ${item.id}: ${item.action_kind} / ${item.title}`,
      `  - status: ${item.status}`,
      `  - proposal_type: ${item.proposal_type}`,
      `  - would_write: ${item.would_write.join(", ") || "none"}`,
      `  - seen_count: ${item.seen_count}`,
      `  - item_ref: ${reviewInboxItemRef(item.id)}`,
      `  - latest_review_ref: ${item.latest_review_ref}`,
      `  - confirmation_ref: ${item.confirmation_ref ?? "none"}`
    ]) : ["- none"]),
    ""
  ].join("\n");
}

async function readEpisodeEvidenceEvents(store: AgentStore): Promise<ReviewSopChainEvent[]> {
  const raw = await store.readStateText("memory/episodes/events.jsonl");
  if (!raw.trim()) return [];
  const events: ReviewSopChainEvent[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as unknown;
    const event = evidenceEventSchema.parse(parsed);
    events.push({
      ...event,
      source_ref: "memory/episodes/events.jsonl",
      row_index: index + 1
    });
  }
  return events;
}

function isReviewArtifactRef(ref: string): boolean {
  return ref.startsWith("autonomy/reviews/") && ref.endsWith(".json");
}

function isAuditArtifactRef(ref: string): boolean {
  return ref.startsWith("governance/audits/") && ref.endsWith(".json");
}

function isSkillArtifactRef(ref: string): boolean {
  return /(^|\/)skills\/[^/]+\/SKILL\.md$/.test(ref);
}

function isSelectedSkillOutcomeArtifactRef(ref: string): boolean {
  return ref.startsWith("memory/skills/usage/") && ref.endsWith(".json");
}

function skillNameFromSkillRef(ref: string): string | null {
  return ref.match(/(?:^|\/)skills\/([^/]+)\/SKILL\.md$/)?.[1] ?? null;
}

function isSopDraftArtifactRef(ref: string): boolean {
  return ref.startsWith("sop/drafts/")
    || /^sop_\d{14}_[a-f0-9]{8}(\.json|\.md)?$/.test(ref);
}

function latestSopDecisionFromStatus(status: SOPDraft["status"]): SopEvolutionDecision {
  if (status === "promoted") return "promoted";
  if (status === "audited") return "audited";
  if (status === "draft" || status === "trial") return "drafted";
  return "unknown";
}

async function selectEvents(
  memory: MemoryStore,
  args: { mode: BackgroundReviewMode; query?: string; sessionId?: string; limit: number }
): Promise<EpisodeEventRecord[]> {
  if (args.mode === "session") return memory.getSessionWindow(args.sessionId ?? "", args.limit);
  if (args.mode === "query") return memory.searchEpisodes(args.query ?? "", args.limit);
  return memory.getRecentEvents(args.limit);
}

async function readLatestWorkingCheckpoint(store: AgentStore): Promise<BackgroundReviewWorkingCheckpoint | null> {
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

async function readWorkingCheckpoint(store: AgentStore, ref: string): Promise<BackgroundReviewWorkingCheckpoint | null> {
  const raw = await store.readStateJson<unknown>(ref);
  const parsed = workingCheckpointSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    ref,
    ...parsed.data
  };
}

function summarizeEvents(events: EpisodeEventRecord[]): BackgroundReviewReport["stats"] {
  const kinds: Record<string, number> = {};
  const sessions = new Set<string>();
  let failureSignalCount = 0;
  let sopSignalCount = 0;
  for (const event of events) {
    kinds[event.kind] = (kinds[event.kind] ?? 0) + 1;
    sessions.add(event.session_id);
    if (hasFailureSignal(event)) failureSignalCount += 1;
    if (hasSopSignal(event)) sopSignalCount += 1;
  }
  return {
    events_reviewed: events.length,
    sessions_seen: sessions.size,
    kinds,
    failure_signal_count: failureSignalCount,
    sop_signal_count: sopSignalCount
  };
}

function buildProposals(
  events: EpisodeEventRecord[],
  mode: BackgroundReviewMode,
  chainSummaries: BackgroundReviewChainSummary[] = [],
  workingCheckpoint: BackgroundReviewWorkingCheckpoint | null = null
): BackgroundReviewProposal[] {
  const proposals: BackgroundReviewProposal[] = [];
  const selectedSkillGroups = selectedSkillAttentionGroups(events);
  const selectedSkillEventIds = new Set(selectedSkillGroups.flatMap((group) => group.events.map((event) => event.id)));
  const failureEvents = events.filter((event) => hasFailureSignal(event) && !selectedSkillEventIds.has(event.id));
  const sopEvents = events.filter(hasSopSignal);
  const skippedSkillEvents = events.filter((event) => /skipped skill promotion|already covers this sop/i.test(event.summary));
  const reusedSkillChains = chainSummaries.filter((chain) => chain.latest_decision === "reused_skill");
  const promotedReuseChains = chainSummaries.filter((chain) => chain.latest_decision === "promoted" && chain.reuse_events > 0);
  const auditedOpenChains = chainSummaries.filter((chain) => chain.latest_decision === "audited" && chain.audit_count > 0);
  const workingCheckpointProposal = workingCheckpoint ? buildWorkingCheckpointProposal(workingCheckpoint) : null;

  if (events.length === 0) {
    proposals.push({
      id: newId("review_proposal"),
      type: "memory_gap",
      title: "Collect episode evidence before reviewing self-evolution opportunities",
      rationale: "No episode events matched the review scope, so there is no evidence-backed change to propose.",
      evidence_refs: [],
      next_action: "Run a live, pipeline, or IM task first, then run background review again."
    });
    if (workingCheckpointProposal) proposals.push(workingCheckpointProposal);
    return proposals;
  }

  if (failureEvents.length > 0) {
    proposals.push({
      id: newId("review_proposal"),
      type: "sop_candidate",
      title: "Draft an SOP for recurring blocked or failed runtime paths",
      rationale: `${failureEvents.length} reviewed event(s) contain blocked, failed, error, or unverified signals.`,
      evidence_refs: evidenceRefs(failureEvents),
      next_action: "Inspect the referenced events and draft a focused SOP only if the failure pattern is repeatable."
    });
  }

  for (const group of selectedSkillGroups) {
    proposals.push({
      id: newId("review_proposal"),
      type: "skill_revision",
      title: group.events.length > 1
        ? `Review selected-skill drift for ${group.skill_name}`
        : `Review selected-skill outcome for ${group.skill_name}`,
      rationale: [
        `${group.events.length} selected-skill usage event(s) for ${group.skill_name} need attention.`,
        `failed=${group.failed_count}; unverified=${group.unverified_count}.`,
        "Revision should validate telemetry and registry coverage before changing skill metadata or instructions."
      ].join(" "),
      evidence_refs: evidenceRefs(group.events),
      next_action: "Inspect selected-skill outcome telemetry; request a revise_skill confirmation only if the skill still looks stale or harmful."
    });
  }

  if (reusedSkillChains.length > 0) {
    proposals.push({
      id: newId("review_proposal"),
      type: "skill_revision",
      title: "Review reused-skill coverage before changing SOPs",
      rationale: `${reusedSkillChains.length} SOP chain(s) contain reused-skill decisions; revision should focus on validating existing skill coverage before drafting or promoting another SOP.`,
      evidence_refs: chainEvidenceRefs(reusedSkillChains),
      next_action: "Run review chain for the cited SOP(s); keep reuse if the duplicate skill still covers the trigger, otherwise revise skill metadata or the SOP draft."
    });
  } else if (skippedSkillEvents.length > 0 && promotedReuseChains.length === 0) {
    proposals.push({
      id: newId("review_proposal"),
      type: "skill_revision",
      title: "Review duplicate-skill detection and naming clarity",
      rationale: `${skippedSkillEvents.length} event(s) show skill promotion was skipped because an existing skill was considered sufficient.`,
      evidence_refs: evidenceRefs(skippedSkillEvents),
      next_action: "Confirm the recalled skill actually covers the new trigger before revising registry metadata or SOP text."
    });
  }

  if (auditedOpenChains.length > 0) {
    proposals.push({
      id: newId("review_proposal"),
      type: "sop_candidate",
      title: "Complete audited SOP promotion decisions",
      rationale: `${auditedOpenChains.length} SOP chain(s) have audit evidence but no promotion or reuse decision yet.`,
      evidence_refs: chainEvidenceRefs(auditedOpenChains),
      next_action: "Inspect each chain; run review promote-sop when the promote verdict still holds, or revise the SOP before promotion."
    });
  } else if (sopEvents.length > 0 && reusedSkillChains.length === 0) {
    proposals.push({
      id: newId("review_proposal"),
      type: "sop_candidate",
      title: "Review SOP audit outcomes before promotion changes",
      rationale: `${sopEvents.length} event(s) mention SOP drafting, audit, promotion, or reuse decisions.`,
      evidence_refs: evidenceRefs(sopEvents),
      next_action: "Compare draft, audit, and final decision artifacts; keep this proposal review-only unless evidence is complete."
    });
  }

  if (mode === "recent" && events.length >= 10 && new Set(events.map((event) => event.session_id)).size > 1) {
    proposals.push({
      id: newId("review_proposal"),
      type: "runtime_gap",
      title: "Add scoped review filters before automatic background scheduling",
      rationale: "Recent review spans multiple sessions, which is useful for discovery but too broad for automatic SOP changes.",
      evidence_refs: evidenceRefs(events.slice(-5)),
      next_action: "Use --query or --session for the next review before turning a proposal into an SOP draft."
    });
  }

  if (workingCheckpointProposal) proposals.push(workingCheckpointProposal);

  if (proposals.length === 0) {
    proposals.push({
      id: newId("review_proposal"),
      type: "memory_gap",
      title: "No evidence-backed self-evolution proposal found",
      rationale: "Reviewed events did not show repeatable failure, SOP, skill, or runtime gap signals.",
      evidence_refs: evidenceRefs(events.slice(-3)),
      next_action: "Keep collecting episode evidence; rerun review with a narrower query when a repeated pattern appears."
    });
  }

  return proposals;
}

function buildWorkingCheckpointProposal(checkpoint: BackgroundReviewWorkingCheckpoint): BackgroundReviewProposal {
  return {
    id: newId("review_proposal"),
    type: "runtime_gap",
    title: `Review latest working checkpoint: ${compactText(checkpoint.current_step, 96)}`,
    rationale: [
      "The latest bounded working checkpoint records unfinished continuity context for a later run.",
      `Goal: ${compactText(checkpoint.goal, 160)}`,
      checkpoint.open_questions.length > 0 ? `Open questions: ${checkpoint.open_questions.length}.` : "Open questions: none."
    ].join(" "),
    evidence_refs: dedupeRefs([checkpoint.ref, ...checkpoint.recent_evidence_refs]),
    next_action: checkpoint.next_action
  };
}

function mergeExtraProposals(
  base: BackgroundReviewProposal[],
  extra: BackgroundReviewProposal[]
): BackgroundReviewProposal[] {
  if (extra.length === 0) return base;
  if (
    base.length === 1
    && base[0]?.type === "memory_gap"
    && base[0].evidence_refs.length === 0
  ) {
    return extra;
  }
  return [...base, ...extra];
}

function buildReviewTickFocusProposal(focus: ReviewTickFocus): BackgroundReviewProposal | null {
  const opportunity = focus.opportunity;
  if (focus.source !== "opportunity_backlog" || !opportunity) return null;
  const focusActionChain = opportunity.action_chain;
  if (opportunity.kind === "completion_verification" && focus.query?.includes("model_diagnostics=")) {
    const refs = dedupeRefs([opportunity.ref, opportunity.source_ref].filter((ref): ref is string => Boolean(ref)));
    return {
      id: newId("review_proposal"),
      type: "runtime_gap",
      title: `Review model failure diagnostics: ${compactText(opportunity.id, 96)}`,
      rationale: [
        "The top Opportunity Backlog item is a blocked or skipped completion report with bounded model failure diagnostics.",
        `Focus: ${compactText(focus.query ?? focus.reason, 260)}`
      ].join(" "),
      evidence_refs: refs,
      next_action: "Inspect the completion report and live run trace, then decide whether a provider/config/context/SOP update is needed. Do not retry or switch models from the review tick.",
      focus_action_chain: focusActionChain
    };
  }
  if (opportunity.kind === "archive_health" && focus.query?.includes("archive_health_kind=")) {
    const refs = dedupeRefs([opportunity.ref, opportunity.source_ref].filter((ref): ref is string => Boolean(ref)));
    return {
      id: newId("review_proposal"),
      type: "runtime_gap",
      title: `Review episode archive health: ${compactText(opportunity.id, 96)}`,
      rationale: [
        "The top Opportunity Backlog item is a bounded episode archive health issue.",
        `Focus: ${compactText(focus.query ?? focus.reason, 260)}`
      ].join(" "),
      evidence_refs: refs,
      next_action: "Inspect archive health and decide whether an explicit memory archive refresh or historical opportunity decision is needed. Do not refresh archives from the review tick.",
      focus_action_chain: focusActionChain
    };
  }
  if (opportunity.kind === "skill_registry_health" && focus.query?.includes("skill_registry_issue=")) {
    const refs = dedupeRefs([opportunity.ref, opportunity.source_ref].filter((ref): ref is string => Boolean(ref)));
    return {
      id: newId("review_proposal"),
      type: "runtime_gap",
      title: `Review skill registry health: ${compactText(opportunity.id, 96)}`,
      rationale: [
        "The top Opportunity Backlog item is a bounded active-vault skill registry health issue.",
        `Focus: ${compactText(focus.query ?? focus.reason, 260)}`
      ].join(" "),
      evidence_refs: refs,
      next_action: "Inspect skill registry health and decide whether explicit registry sync, package restore, or historical opportunity retirement is needed. Do not sync registry metadata or write the active vault from the review tick.",
      focus_action_chain: focusActionChain
    };
  }
  if (opportunity.kind === "self_evolution_gap" && opportunity.self_evolution_gap) {
    const gap = opportunity.self_evolution_gap;
    const refs = dedupeRefs([
      gap.gap_ref,
      opportunity.source_ref,
      ...gap.evidence_refs
    ].filter((ref): ref is string => Boolean(ref)));
    if (gap.follow_up_kind === "sop_candidate") {
      return {
        id: newId("review_proposal"),
        type: "sop_candidate",
        title: `Draft SOP for self-evolution gap: ${compactText(gap.proposed_slice, 96)}`,
        rationale: [
          "The top Opportunity Backlog item is a bounded self-evolution gap classified as a SOP candidate.",
          `Gap: ${gap.gap_id}.`,
          `Focus: ${compactText(focus.query ?? focus.reason, 260)}`
        ].join(" "),
        evidence_refs: refs,
        next_action: "Plan a state-only SOP draft from the bounded gap evidence, then require the normal draft/audit/promote confirmations before any active-vault mutation.",
        self_evolution_gap: {
          gap_id: gap.gap_id,
          gap_ref: gap.gap_ref,
          proposed_slice: gap.proposed_slice,
          owner_surface: gap.owner_surface,
          source_ref: gap.source_ref,
          follow_up_kind: gap.follow_up_kind,
          evidence_refs: gap.evidence_refs,
          acceptance: gap.acceptance,
          non_goals: gap.non_goals,
          inspect_command: gap.inspect_command,
          verification_commands: gap.verification_commands,
          boundary: gap.boundary
        },
        focus_action_chain: focusActionChain
      };
    }
    return {
      id: newId("review_proposal"),
      type: "runtime_gap",
      title: `Review self-evolution gap: ${compactText(gap.proposed_slice, 96)}`,
      rationale: [
        "The top Opportunity Backlog item is a bounded self-evolution gap without a typed act-next executor.",
        `Gap: ${gap.gap_id}.`,
        `Focus: ${compactText(focus.query ?? focus.reason, 260)}`
      ].join(" "),
      evidence_refs: refs,
      next_action: `Inspect the bounded gap and evidence refs, then decide whether to implement ${gap.proposed_slice} or record an opportunity decision. Do not execute publishing, browser, model, or active-vault mutations from the review tick.`,
      focus_action_chain: focusActionChain
    };
  }
  if (opportunity.kind !== "context_health") return null;
  const refs = dedupeRefs([opportunity.ref, opportunity.source_ref].filter((ref): ref is string => Boolean(ref)));
  return {
    id: newId("review_proposal"),
    type: "runtime_gap",
    title: `Review context health focus: ${compactText(opportunity.id, 96)}`,
    rationale: [
      "The top Opportunity Backlog item is a context manifest sidecar health issue.",
      `Focus: ${compactText(focus.query ?? focus.reason, 260)}`
    ].join(" "),
    evidence_refs: refs,
    next_action: "Inspect context health and decide whether to restore or retire sidecars through an explicit operator step. Do not read raw context Markdown unless explicitly required.",
    focus_action_chain: focusActionChain
  };
}

function renderBackgroundReview(report: BackgroundReviewReport, events: EpisodeEventRecord[]): string {
  return [
    `# Background Review ${report.id}`,
    "",
    `- mode: ${report.mode}`,
    `- query: ${report.query ?? "n/a"}`,
    `- session_id: ${report.session_id ?? "n/a"}`,
    `- created_at: ${report.created_at}`,
    `- events_reviewed: ${report.stats.events_reviewed}`,
    `- sessions_seen: ${report.stats.sessions_seen}`,
    `- failure_signal_count: ${report.stats.failure_signal_count}`,
    `- sop_signal_count: ${report.stats.sop_signal_count}`,
    `- working_checkpoint: ${report.source.working_checkpoint?.ref ?? "none"}`,
    "",
    "## Proposals",
    "",
    ...report.proposals.flatMap((proposal) => [
      `### ${proposal.title}`,
      "",
      `- type: ${proposal.type}`,
      `- rationale: ${proposal.rationale}`,
      `- evidence_refs: ${proposal.evidence_refs.length > 0 ? proposal.evidence_refs.join(", ") : "none"}`,
      ...(proposal.self_evolution_gap ? [
        `- self_evolution_gap: ${proposal.self_evolution_gap.gap_id}`,
        `- self_evolution_slice: ${proposal.self_evolution_gap.proposed_slice}`,
        `- self_evolution_verification_commands: ${proposal.self_evolution_gap.verification_commands.length}`
      ] : []),
      ...(proposal.focus_action_chain ? [`- focus_action_chain: ${renderFocusActionChain(proposal.focus_action_chain)}`] : []),
      `- next_action: ${proposal.next_action}`,
      ""
    ]),
    "## Chain Summaries",
    "",
    ...renderChainSummaries(report.chain_summaries),
    "## Reviewed Events",
    "",
    ...events.map((event) => `- ${event.id} (${event.kind}, ${basename(event.source_ref)}:${event.row_index}): ${event.summary.replace(/\s+/g, " ").slice(0, 220)}`)
  ].join("\n");
}

function genericProposalSopTrigger(reportId: string, proposal: BackgroundReviewProposal): string {
  return [
    `Use this SOP candidate when background review ${reportId} finds the same evidence-backed pattern.`,
    `Proposal rationale: ${proposal.rationale}`
  ].join(" ");
}

function genericProposalSopProcedure(reviewRef: string, proposal: BackgroundReviewProposal): string[] {
  return [
    `Open the background review artifact ${reviewRef}.`,
    "Inspect every cited episode evidence ref and confirm the pattern is still repeatable.",
    `Apply the proposed next action: ${proposal.next_action}`,
    "Run the smallest relevant verification command or manual check.",
    "Keep this draft in state until a later explicit audit or promotion step accepts it."
  ];
}

function genericProposalSopVerification(): string {
  return [
    "The draft is acceptable only when the cited review report and episode evidence refs still support the trigger,",
    "and the verification command or manual check is recorded before any later promotion."
  ].join(" ");
}

function genericProposalSopFailureModes(): string[] {
  return [
    "If cited evidence is weak, stale, or unrelated, revise this draft before use.",
    "If an active skill already covers the trigger, retire or archive this draft instead of promoting it.",
    "If verification cannot be reproduced, rollback by leaving the draft unpromoted and adding a review note."
  ];
}

function selfEvolutionGapSopTrigger(
  reportId: string,
  proposal: BackgroundReviewProposal,
  gap: BackgroundReviewProposalSelfEvolutionGap
): string {
  return [
    `Use this SOP candidate when self-evolution gap ${gap.gap_id} or proposed slice ${gap.proposed_slice} recurs.`,
    `The gap was materialized by background review ${reportId}.`,
    `Proposal rationale: ${proposal.rationale}`
  ].join(" ");
}

function selfEvolutionGapSopProcedure(
  reviewRef: string,
  proposal: BackgroundReviewProposal,
  gap: BackgroundReviewProposalSelfEvolutionGap
): string[] {
  return [
    `Open the background review artifact ${reviewRef}.`,
    `Inspect the self-evolution gap with: ${gap.inspect_command}.`,
    `Confirm the proposed slice still matches the current issue: ${gap.proposed_slice}.`,
    ...gap.acceptance.slice(0, 5).map((item) => `Confirm acceptance criterion: ${item}.`),
    `Apply the proposed next action: ${proposal.next_action}`,
    ...gap.verification_commands.slice(0, 4).map((command) => `Run or inspect verification command before audit: ${command}.`),
    "Keep this draft in state until a later explicit audit or promotion step accepts it."
  ];
}

function selfEvolutionGapSopVerification(gap: BackgroundReviewProposalSelfEvolutionGap): string {
  const commands = gap.verification_commands.slice(0, 3).join(" ; ");
  return [
    `The draft is acceptable only when self-evolution gap ${gap.gap_id} still supports proposed slice ${gap.proposed_slice}.`,
    commands
      ? `Record at least one bounded verification result from: ${commands}.`
      : "Record a bounded verification result before any later promotion."
  ].join(" ");
}

function selfEvolutionGapSopFailureModes(gap: BackgroundReviewProposalSelfEvolutionGap): string[] {
  return [
    "If the cited gap is already completed, retired, or superseded, complete or retire this SOP candidate instead of promoting it.",
    "If an active skill already covers the trigger, retire or archive this draft instead of promoting it.",
    ...gap.non_goals.slice(0, 5).map((item) => `Do not violate gap non-goal: ${item}.`),
    "If verification cannot be reproduced, rollback by leaving the draft unpromoted and adding a review note."
  ];
}

function renderChainSummaries(chains: BackgroundReviewChainSummary[]): string[] {
  if (chains.length === 0) return ["- none", ""];
  return chains.flatMap((chain) => [
    `- ${chain.sop_id}: latest=${chain.latest_decision}, status=${chain.sop_status}, audits=${chain.audit_count}, promotions=${chain.promotion_events}, reuse=${chain.reuse_events}`,
    `  - sop_ref: ${chain.sop_ref}`,
    `  - events: ${chain.event_ids.join(", ") || "none"}`,
    ""
  ]);
}

function hasFailureSignal(event: EpisodeEventRecord): boolean {
  return /blocked|failed|failure|error|unverified|missing|timeout|rejected|revise|失败|阻塞|错误|未验证|缺失/i.test(event.summary);
}

function hasSopSignal(event: EpisodeEventRecord): boolean {
  return /sop|skill promotion|promoted|promotion|audit verdict|recalled skill|duplicate|技能|审计|晋级|复用/i.test(event.summary);
}

interface SelectedSkillAttentionGroup {
  skill_name: string;
  events: EpisodeEventRecord[];
  failed_count: number;
  unverified_count: number;
}

function selectedSkillAttentionGroups(events: EpisodeEventRecord[]): SelectedSkillAttentionGroup[] {
  const groups = new Map<string, EpisodeEventRecord[]>();
  for (const event of events) {
    const skillName = selectedSkillNameFromUsageEvent(event);
    if (!skillName || !needsSelectedSkillAttention(event)) continue;
    const existing = groups.get(skillName) ?? [];
    existing.push(event);
    groups.set(skillName, existing);
  }

  return [...groups.entries()]
    .map(([skillName, groupEvents]) => ({
      skill_name: skillName,
      events: groupEvents.sort((left, right) =>
        (right.created_at ?? "").localeCompare(left.created_at ?? "") || right.id.localeCompare(left.id)
      ),
      failed_count: groupEvents.filter((event) => /verification=failed/i.test(event.summary)).length,
      unverified_count: groupEvents.filter((event) => /verified=false|verification=(failed|skipped)|completion=(not_done|blocked)/i.test(event.summary)).length
    }))
    .sort((left, right) =>
      right.events.length - left.events.length
      || (right.events[0]?.created_at ?? "").localeCompare(left.events[0]?.created_at ?? "")
      || left.skill_name.localeCompare(right.skill_name)
    );
}

function selectedSkillNameFromUsageEvent(event: EpisodeEventRecord): string | null {
  if (event.kind !== "skill_usage") return null;
  return event.summary.match(/^Selected skill outcome\s+([^:]+):/i)?.[1]?.trim() ?? null;
}

function needsSelectedSkillAttention(event: EpisodeEventRecord): boolean {
  return /completion=(not_done|blocked)|verification=(failed|skipped)|verified=false/i.test(event.summary);
}

function evidenceRefs(events: EpisodeEventRecord[]): string[] {
  return events.flatMap((event) => [`${event.source_ref}#${event.id}`, ...event.artifact_refs]).filter(unique);
}

function chainEvidenceRefs(chains: BackgroundReviewChainSummary[]): string[] {
  return chains.flatMap((chain) => [
    chain.sop_ref,
    ...chain.review_refs,
    ...chain.audit_refs,
    ...chain.skill_refs,
    ...chain.duplicate_skill_refs,
    ...chain.event_ids.map((id) => `memory/episodes/events.jsonl#${id}`)
  ]).filter(unique);
}

function extractSopRefsFromEvents(events: EpisodeEventRecord[]): string[] {
  return extractSopRefsFromValues(events.flatMap((event) => [event.summary, ...event.artifact_refs]));
}

function extractSopRefsFromValues(values: string[]): string[] {
  const refs: string[] = [];
  for (const value of values) {
    for (const match of value.matchAll(/sop_\d{14}_[a-f0-9]{8}/g)) {
      refs.push(match[0]);
    }
  }
  return refs.filter(unique);
}

function isMissingSopDraftError(error: unknown): boolean {
  return error instanceof Error && /SOP draft JSON not found/.test(error.message);
}

function unique(value: string, index: number, array: string[]): boolean {
  return array.indexOf(value) === index;
}

function dedupeRefs(values: string[]): string[] {
  return values.filter(unique);
}

function compactText(value: string, maxChars: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxChars) return compacted;
  return `${compacted.slice(0, Math.max(0, maxChars - 3))}...`;
}

function resolveReviewRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--review requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe review ref: ${value}`);
  }
  if (trimmed.startsWith("autonomy/reviews/") && trimmed.endsWith(".json")) return trimmed;
  const file = trimmed.endsWith(".json") ? basename(trimmed) : `${trimmed}.json`;
  return `autonomy/reviews/${file}`;
}

function resolveSopJsonRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--sop requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe SOP ref: ${value}`);
  }
  if (trimmed.startsWith("sop/drafts/")) return withJsonExtension(trimmed);
  return `sop/drafts/${withJsonExtension(basename(trimmed))}`;
}

function resolveAuditRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--audit requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe audit ref: ${value}`);
  }
  if (trimmed.startsWith("governance/audits/") && trimmed.endsWith(".json")) return trimmed;
  const file = trimmed.endsWith(".json") ? basename(trimmed) : `${trimmed}.json`;
  return `governance/audits/${file}`;
}

function resolveFollowUpConfirmationRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--confirmation requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe follow-up confirmation ref: ${value}`);
  }
  if (trimmed.startsWith("autonomy/followups/") && trimmed.endsWith(".json")) return trimmed;
  const file = trimmed.endsWith(".json") ? basename(trimmed) : `${trimmed}.json`;
  return `autonomy/followups/${file}`;
}

function resolveReviewInboxItemRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--item requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe review inbox item ref: ${value}`);
  }
  if (trimmed.startsWith("autonomy/inbox/") && trimmed.endsWith(".json")) return trimmed;
  const file = trimmed.endsWith(".json") ? basename(trimmed) : `${trimmed}.json`;
  return `autonomy/inbox/${file}`;
}

function withReviewInboxDecision(
  item: ReviewInboxItem,
  decision?: ReviewInboxDecisionWithRef
): ReviewInboxItemView {
  return decision ? { ...item, latest_decision: decision } : item;
}

function isTerminalReviewInboxDecision(decision: ReviewInboxDecisionWithRef | undefined): boolean {
  return decision?.status === "completed" || decision?.status === "retired";
}

function shouldCollapseReviewInboxDuplicates(status: ReviewInboxStatusFilter): boolean {
  return status !== "all" && status !== "executed";
}

function reviewInboxSortTime(item: ReviewInboxItemView): string {
  return item.latest_decision?.created_at ?? item.updated_at;
}

function withJsonExtension(value: string): string {
  if (value.endsWith(".json")) return value;
  if (value.endsWith(".md")) return `${value.slice(0, -3)}.json`;
  return `${value}.json`;
}

function sopMarkdownRefFromJsonRef(value: string): string {
  return value.endsWith(".json") ? `${value.slice(0, -5)}.md` : `${value}.md`;
}

function followUpConfirmationMarkdownRefFromJsonRef(value: string): string {
  return value.endsWith(".json") ? `${value.slice(0, -5)}.md` : `${value}.md`;
}

function refId(ref: string): string {
  return basename(ref).replace(/\.json$/, "");
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function normalizeComparableText(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim().replace(/\s+/g, " ");
  return normalized || null;
}

function isBackgroundReviewReport(value: unknown): value is BackgroundReviewReport {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && Array.isArray(value.proposals)
    && (value.chain_summaries === undefined || Array.isArray(value.chain_summaries))
    && isRecord(value.artifact_refs)
    && typeof value.artifact_refs.json_ref === "string"
    && typeof value.artifact_refs.markdown_ref === "string";
}

function isFollowUpConfirmationRequest(value: unknown): value is ReviewFollowUpConfirmationRequest {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.created_at === "string"
    && (value.status === "pending" || value.status === "executed")
    && typeof value.review_ref === "string"
    && typeof value.proposal_id === "string"
    && typeof value.action_id === "string"
    && typeof value.action_kind === "string"
    && value.confirmation_required === true
    && value.execution_allowed === false
    && isRecord(value.action)
    && Array.isArray(value.required_refs)
    && Array.isArray(value.would_write)
    && Array.isArray(value.safety_boundary)
    && typeof value.next_step === "string";
}

function isReviewInboxItem(value: unknown): value is ReviewInboxItem {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && (value.status === "open" || value.status === "confirmation_requested" || value.status === "executed")
    && value.source === "review_tick"
    && typeof value.created_at === "string"
    && typeof value.first_review_ref === "string"
    && typeof value.latest_review_ref === "string"
    && typeof value.action_id === "string"
    && typeof value.action_kind === "string"
    && Array.isArray(value.required_refs)
    && Array.isArray(value.would_write)
    && typeof value.seen_count === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
