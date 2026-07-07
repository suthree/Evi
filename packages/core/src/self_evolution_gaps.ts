import { basename, dirname } from "node:path";
import {
  contentFeedbackEvidenceSchema,
  contentRunSchema,
  planContentFeedbackStrategy,
  type ContentFeedbackStrategySuggestion,
  type ContentFeedbackEvidence,
  type ContentFeedbackMetricName,
  type ContentRun
} from "./content_pipeline.js";
import { getCapabilityCatalog } from "./capabilities.js";
import { getServiceHealth, type ServiceHealthResult } from "./service_health.js";
import {
  listSelfEvolutionIterations,
  type SelfEvolutionIterationContract
} from "./self_evolution_iterations.js";
import { newId, slugify, utcNow } from "./ids.js";
import { AgentStore } from "./store.js";

export type SelfEvolutionGapStatus = "active" | "waiting";
export type SelfEvolutionGapEffectiveStatus = SelfEvolutionGapStatus | "deferred" | "completed" | "retired";
export type SelfEvolutionGapSource = "content_run" | "service_status" | "operator_correction" | "scorecard" | "iteration_outcome";
export type SelfEvolutionGapFollowUpKind = "act_next" | "sop_candidate" | "narrow_review" | "waiting";
export type SelfEvolutionGapOpportunityDecisionStatus = "open" | "deferred" | "completed" | "retired";

export interface SelfEvolutionGapOpportunityDecision {
  id: string;
  ref: string;
  opportunity_id: string;
  opportunity_ref: string;
  status: SelfEvolutionGapOpportunityDecisionStatus;
  previous_status: string;
  reason: string;
  created_at: string;
}

export interface SelfEvolutionGap {
  schema_version: 1;
  id: string;
  ref: string;
  title: string;
  status: SelfEvolutionGapStatus;
  effective_status?: SelfEvolutionGapEffectiveStatus;
  opportunity_decision?: SelfEvolutionGapOpportunityDecision;
  source: SelfEvolutionGapSource;
  source_ref: string;
  observed_problem: string;
  evidence_refs: string[];
  owner_surface: string;
  proposed_slice: string;
  follow_up_kind: SelfEvolutionGapFollowUpKind;
  acceptance: string[];
  non_goals: string[];
  verification_commands: string[];
  inspect_command: string;
  not_before_at?: string;
  created_at: string;
  updated_at: string;
  boundary: string;
}

export interface SelfEvolutionGapListResult {
  created_at: string;
  count: number;
  by_effective_status: Partial<Record<SelfEvolutionGapEffectiveStatus, number>>;
  gap_refs: string[];
  gaps: SelfEvolutionGap[];
  boundary: string;
}

export interface SelfEvolutionGapDetailResult {
  gap: SelfEvolutionGap;
  boundary: string;
}

export interface OperatorCorrectionRecord {
  schema_version: 1;
  id: string;
  ref: string;
  kind: "operator_correction";
  summary: string;
  source_ref?: string;
  owner_surface: string;
  proposed_slice: string;
  evidence_refs: string[];
  created_at: string;
  boundary: string;
}

export interface OperatorCorrectionRecordResult {
  action: "record-correction";
  correction: OperatorCorrectionRecord;
  gap_id: string;
  gap_ref: string;
  inspect_command: string;
  boundary: string;
}

interface ContentFeedbackRecord {
  ref: string;
  evidence: ContentFeedbackEvidence;
}

interface ContentStrategyPreviewReviewRecord {
  schema_version: 1;
  kind: "content_strategy_preview_review";
  generated_run_id: string;
  generated_run_ref: string;
  source_run_id: string;
  source_run_ref: string;
  created_at: string;
}

interface ContentFeedbackRefreshRouteReviewRecord {
  schema_version: 1;
  kind: "content_feedback_refresh_route_review";
  service_ref: string;
  status_updated_at: string;
  top_skip_reason: string;
  created_at: string;
}

const OPPORTUNITY_DECISIONS_REF = "autonomy/opportunity-decisions.jsonl";
const OPERATOR_CORRECTIONS_ROOT = "self-evolution/operator-corrections";
const SCORECARD_GENERAL_DELEGATION_GAP_ID = "gap_scorecard_general_agent_delegation_contract";
const SCORECARD_GENERAL_DELEGATION_CREATED_AT = "2026-07-06T00:00:00Z";
const SELF_EVOLUTION_GAP_BOUNDARY = "self-evolution gap metadata derived from bounded state refs, verified iteration outcomes, explicit operator corrections, scorecard metadata, and append-only opportunity decisions; listing is read-only and recording corrections writes only local state; it does not read draft bodies, invoke models, execute tools, publish externally, write repo files, or write the active vault";
const OPERATOR_CORRECTION_BOUNDARY = "explicit operator correction intake writes one bounded local state record only; it does not draft SOPs, update memory, mutate repo files, write the active vault, invoke models, execute tools, publish externally, or change services";
const POST_PUBLISH_FEEDBACK_STABLE_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function listSelfEvolutionGaps(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<SelfEvolutionGapListResult> {
  const correctionRecords = await readOperatorCorrectionRecords(store);
  const runs = await readContentRuns(store);
  const decisions = await readSelfEvolutionGapOpportunityDecisions(store);
  const feedbackByRunId = latestFeedbackByRunId(await readContentFeedbackRecords(store));
  const reviewedStrategyRunIds = reviewedStrategyPreviewRunIds(await readContentStrategyPreviewReviewRecords(store));
  const strategyByRunId = readyFeedbackStrategyByRunId(
    (await planContentFeedbackStrategy(store, { limit: Number.MAX_SAFE_INTEGER })).suggestions
  );
  const serviceHealth = await getServiceHealth(store);
  const routeReviewRecords = await readContentFeedbackRefreshRouteReviewRecords(store);
  const correctionGaps = correctionRecords.map(deriveGapFromOperatorCorrection);
  const scorecardGaps = await deriveGapsFromScorecardCatalog(store);
  const iterationOutcomeGaps = await deriveGapsFromVerifiedIterationOutcomes(store);
  const serviceGaps = deriveGapsFromServiceHealth(serviceHealth, routeReviewRecords);
  const runGaps = runs.flatMap((run) =>
    deriveGapsFromContentRun(
      run,
      runs,
      feedbackByRunId.get(run.id),
      strategyByRunId.get(run.id),
      reviewedStrategyRunIds
    )
  );
  const gaps = [
    ...correctionGaps,
    ...scorecardGaps,
    ...iterationOutcomeGaps,
    ...serviceGaps,
    ...runGaps
  ].map((gap) => withOpportunityDecision(gap, decisions));
  const limit = args.limit === undefined ? gaps.length : Math.max(0, args.limit);
  const selected = gaps.slice(0, limit);
  return {
    created_at: utcNow(),
    count: selected.length,
    by_effective_status: countByEffectiveStatus(selected),
    gap_refs: selected.map((gap) => gap.ref),
    gaps: selected,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

export async function recordOperatorCorrection(
  store: AgentStore,
  args: {
    summary: string;
    ownerSurface?: string;
    proposedSlice?: string;
    sourceRef?: string;
    evidenceRefs?: string[];
  }
): Promise<OperatorCorrectionRecordResult> {
  const summary = args.summary.trim();
  if (!summary) throw new Error("operator correction summary is required");
  const id = newId("operator_correction");
  const ref = `${OPERATOR_CORRECTIONS_ROOT}/${id}.json`;
  const record: OperatorCorrectionRecord = {
    schema_version: 1,
    id,
    ref,
    kind: "operator_correction",
    summary,
    ...(args.sourceRef ? { source_ref: args.sourceRef } : {}),
    owner_surface: args.ownerSurface?.trim() || "runtime_contract",
    proposed_slice: args.proposedSlice?.trim() || "operator_correction_to_sop_guard",
    evidence_refs: compactRefs(args.evidenceRefs ?? []),
    created_at: utcNow(),
    boundary: OPERATOR_CORRECTION_BOUNDARY
  };
  await store.writeJson(ref, record);
  const gap = deriveGapFromOperatorCorrection(record);
  return {
    action: "record-correction",
    correction: record,
    gap_id: gap.id,
    gap_ref: gap.ref,
    inspect_command: gap.inspect_command,
    boundary: OPERATOR_CORRECTION_BOUNDARY
  };
}

function withOpportunityDecision(
  gap: SelfEvolutionGap,
  decisions: SelfEvolutionGapOpportunityDecision[]
): SelfEvolutionGap {
  const decision = latestOpportunityDecisionForGap(gap, decisions);
  if (!decision) {
    return {
      ...gap,
      effective_status: gap.status
    };
  }
  return {
    ...gap,
    effective_status: decision.status === "open" ? gap.status : decision.status,
    opportunity_decision: decision
  };
}

function latestOpportunityDecisionForGap(
  gap: SelfEvolutionGap,
  decisions: SelfEvolutionGapOpportunityDecision[]
): SelfEvolutionGapOpportunityDecision | undefined {
  return decisions
    .filter((decision) =>
      (decision.opportunity_id === gap.id || decision.opportunity_ref === gap.ref)
    )
    .at(-1);
}

function countByEffectiveStatus(
  gaps: SelfEvolutionGap[]
): Partial<Record<SelfEvolutionGapEffectiveStatus, number>> {
  const counts: Partial<Record<SelfEvolutionGapEffectiveStatus, number>> = {};
  for (const gap of gaps) {
    const status = gap.effective_status ?? gap.status;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export async function getSelfEvolutionGap(
  store: AgentStore,
  args: { gapRef: string }
): Promise<SelfEvolutionGapDetailResult> {
  const requested = args.gapRef.trim();
  const all = await listSelfEvolutionGaps(store, { limit: Number.MAX_SAFE_INTEGER });
  const gap = all.gaps.find((item) =>
    item.id === requested
    || item.ref === requested
    || item.source_ref === requested
    || dirname(item.source_ref) === requested
    || basename(dirname(item.source_ref)) === requested
  );
  if (!gap) throw new Error(`Self-evolution gap not found: ${args.gapRef}`);
  return {
    gap,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function deriveGapsFromContentRun(
  run: ContentRun,
  runs: ContentRun[],
  feedback?: ContentFeedbackRecord,
  strategy?: ContentFeedbackStrategySuggestion,
  reviewedStrategyRunIds: Set<string> = new Set()
): SelfEvolutionGap[] {
  const sourceQualityGap = deriveSourceQualityGapFromContentRun(run, runs);
  const publishGap = deriveExternalPublishGapFromContentRun(run, runs);
  const feedbackGap = derivePostPublishFeedbackGapFromContentRun(run, feedback);
  const strategyGap = deriveFeedbackStrategyNextGenerationGapFromContentRun(run, runs, strategy);
  const strategyPreviewGap = deriveFeedbackStrategyPreviewReviewGapFromContentRun(run, reviewedStrategyRunIds);
  return [sourceQualityGap, publishGap, feedbackGap, strategyGap, strategyPreviewGap]
    .filter((gap): gap is SelfEvolutionGap => gap !== null);
}

function deriveGapsFromServiceHealth(
  health: ServiceHealthResult,
  routeReviews: ContentFeedbackRefreshRouteReviewRecord[]
): SelfEvolutionGap[] {
  const feedbackRefreshRouteGap = deriveFeedbackRefreshRouteReviewGapFromServiceHealth(health, routeReviews);
  return [feedbackRefreshRouteGap].filter((gap): gap is SelfEvolutionGap => gap !== null);
}

async function deriveGapsFromScorecardCatalog(store: AgentStore): Promise<SelfEvolutionGap[]> {
  if (!await hasActiveDreamSnapshot(store)) return [];
  const capabilities = getCapabilityCatalog().categories.flatMap((category) => category.capabilities);
  const hasDelegationVocabulary = capabilities.some((capability) => capability.id === "delegate_agent");
  if (hasDelegationVocabulary) return [];
  const id = SCORECARD_GENERAL_DELEGATION_GAP_ID;
  return [{
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "General-agent delegation needs a bounded contract",
    status: "active",
    source: "scorecard",
    source_ref: "packages/core/src/self_evolution_scorecard.ts",
    observed_problem: "Self-evolution scorecard cannot show general_agent_delegation as active because delegate_agent is missing from the harness action catalog.",
    evidence_refs: [
      "packages/core/src/self_evolution_scorecard.ts",
      "packages/core/src/action_contracts.ts",
      "packages/core/src/capabilities.ts"
    ],
    owner_surface: "core_runtime",
    proposed_slice: "general_agent_delegation_contract",
    follow_up_kind: "sop_candidate",
    acceptance: [
      "scorecard-derived gaps expose low-maturity core dimensions through the normal Opportunity Backlog",
      "delegate_agent defines bounded task, context, result, and completion-verification boundaries before any expert persona is added",
      "delegated output remains advisory until the main runtime verifies evidence and completion",
      "the gap can be deferred, completed, or retired through append-only opportunity decisions without rewriting scorecard history"
    ],
    non_goals: [
      "no expert persona or autonomous multi-agent scheduler in this slice",
      "no parallel model fan-out or new model provider contract",
      "no external tool expansion, browser automation, publishing, or service restart authority",
      "no completion claim based only on delegated output"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/self_evolution_gaps.test.ts tests/opportunity_backlog.test.ts tests/self_evolution_scorecard.test.ts",
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>",
      "pnpm run runtime -- governance scorecard --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: SCORECARD_GENERAL_DELEGATION_CREATED_AT,
    updated_at: SCORECARD_GENERAL_DELEGATION_CREATED_AT,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  }];
}

async function deriveGapsFromVerifiedIterationOutcomes(store: AgentStore): Promise<SelfEvolutionGap[]> {
  const [iterations, sopEvidenceRefs] = await Promise.all([
    listSelfEvolutionIterations(store, { limit: 10 }),
    readSopDraftEvidenceRefs(store)
  ]);
  return iterations.iterations
    .filter((iteration) => iteration.outcome?.status === "verified")
    .filter((iteration) => !sopEvidenceRefs.has(iteration.ref) && !sopEvidenceRefs.has(iteration.id))
    .map(deriveGapFromVerifiedIterationOutcome);
}

function deriveGapFromVerifiedIterationOutcome(iteration: SelfEvolutionIterationContract): SelfEvolutionGap {
  const outcome = iteration.outcome;
  if (!outcome) throw new Error(`verified iteration outcome missing for ${iteration.id}`);
  const id = `gap_iteration_outcome_sop_${safeGapIdPart(iteration.id)}`;
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Verified iteration outcome needs SOP candidate review",
    status: "active",
    source: "iteration_outcome",
    source_ref: iteration.ref,
    observed_problem: `Verified self-evolution iteration ${iteration.proposed_slice} has not yet been represented by a state-only SOP draft, so the reusable lesson can stall before the SOP/skill/memory gate.`,
    evidence_refs: compactRefs([
      iteration.ref,
      iteration.source_ref,
      ...iteration.evidence_refs,
      ...outcome.evidence_refs
    ]),
    owner_surface: iteration.owner_surface,
    proposed_slice: "verified_iteration_outcome_sop_candidate",
    follow_up_kind: "sop_candidate",
    acceptance: [
      "verified iteration outcomes can surface as SOP-candidate self-evolution gaps",
      "Opportunity Backlog and review tick can materialize the candidate without automatically drafting, auditing, promoting, or writing skills",
      "the SOP draft, if requested later, cites the iteration contract and verification evidence",
      "application-specific external tool lessons remain evidence or application slices unless the reusable runtime pattern is explicit"
    ],
    non_goals: [
      "auto-draft SOPs from every iteration outcome",
      "auto-audit, auto-promote, or write active-vault skills",
      "accept semantic memory without confirmation",
      "treat NASD, Xiaohongshu MCP, browser automation, or other external adapters as core runtime identity"
    ],
    verification_commands: compactRefs([
      ...outcome.verification_commands,
      "pnpm exec tsx --test tests/self_evolution_iterations.test.ts tests/self_evolution_gaps.test.ts tests/background_review.test.ts",
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
      "pnpm run runtime -- review tick --state-root <state-root>"
    ]),
    inspect_command: `pnpm run runtime -- governance iterations --iteration ${iteration.id} --state-root <state-root>`,
    created_at: outcome.recorded_at,
    updated_at: outcome.recorded_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

async function hasActiveDreamSnapshot(store: AgentStore): Promise<boolean> {
  for (const ref of (await store.listStateFiles("memory/dreams")).filter((item) => item.endsWith(".json"))) {
    const record = await store.readStateJson<unknown>(ref);
    if (isRecord(record) && record.action_type === "dream_snapshot" && record.status === "active") return true;
  }
  return false;
}

function deriveGapFromOperatorCorrection(record: OperatorCorrectionRecord): SelfEvolutionGap {
  const id = `gap_operator_correction_${safeGapIdPart(record.id)}`;
  const gapRef = `self-evolution/gaps/${id}.json`;
  return {
    schema_version: 1,
    id,
    ref: gapRef,
    title: "Operator correction needs self-evolution follow-up",
    status: "active",
    source: "operator_correction",
    source_ref: record.ref,
    observed_problem: record.summary,
    evidence_refs: compactRefs([record.ref, record.source_ref, ...record.evidence_refs]),
    owner_surface: record.owner_surface,
    proposed_slice: record.proposed_slice,
    follow_up_kind: "sop_candidate",
    acceptance: [
      "operator correction is recorded as bounded local state evidence",
      "governance gaps and Opportunity Backlog expose the correction as a SOP-candidate self-evolution item",
      "SOP drafting, auditing, promotion, and memory updates still require the existing review confirmation gates",
      "the correction intake path never mutates repo files, active vault, services, or external systems by itself"
    ],
    non_goals: [
      "auto-rewrite project memory or model-facing identity files from a correction",
      "auto-promote the correction into a SOP or skill without review",
      "invoke external tools, model calls, content publishing, browser automation, or service restarts",
      "classify application-specific tool adapters as core runtime capability"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/self_evolution_gaps.test.ts tests/cli.test.ts tests/capabilities.test.ts",
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: record.created_at,
    updated_at: record.created_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function deriveFeedbackRefreshRouteReviewGapFromServiceHealth(
  health: ServiceHealthResult,
  routeReviews: ContentFeedbackRefreshRouteReviewRecord[]
): SelfEvolutionGap | null {
  const feedbackRefresh = health.content_feedback_refresh;
  const dueCount = feedbackRefresh.last_due_count ?? 0;
  const skippedCount = feedbackRefresh.last_skipped_count ?? 0;
  const collectMoreCount = feedbackRefresh.last_strategy_collect_more_feedback_count ?? 0;
  if (!feedbackRefresh.enabled) return null;
  if (feedbackRefresh.state !== "skipped") return null;
  if (dueCount <= 0 || skippedCount <= 0) return null;
  if (feedbackRefresh.last_top_skip_reason !== "non_mcp_capture_route") return null;
  if (collectMoreCount <= 0 && feedbackRefresh.last_strategy_top_posture !== "collect_more_feedback") return null;
  if (isFeedbackRefreshRouteStatusReviewed(health, routeReviews)) return null;

  const updatedAt = feedbackRefresh.updated_at ?? health.created_at;
  const id = `gap_feedback_refresh_route_review_${safeGapIdPart(updatedAt)}`;
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Feedback refresh route skips need local review",
    status: "active",
    source: "service_status",
    source_ref: feedbackRefresh.ref,
    observed_problem: [
      `Resident content_feedback_refresh is enabled and found ${dueCount} due feedback item(s),`,
      `but skipped ${skippedCount} because ${feedbackRefresh.last_top_skip_reason}.`,
      `The strategy layer still recommends collect_more_feedback for ${collectMoreCount} item(s),`,
      "so the self-evolution loop needs a local route review instead of repeatedly presenting an external capture command."
    ].join(" "),
    evidence_refs: compactRefs([
      feedbackRefresh.ref,
      ...(feedbackRefresh.last_skipped_item_refs ?? []),
      ...(feedbackRefresh.last_deferred_item_refs ?? []),
      feedbackRefresh.last_strategy_top_run_ref,
      ...(feedbackRefresh.last_strategy_item_refs ?? [])
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: "feedback_refresh_route_review",
    follow_up_kind: "act_next",
    acceptance: [
      "self-evolution gaps derive resident feedback-refresh route skips from service health when enabled due items are skipped as non_mcp_capture_route",
      "governance opportunities expose the service-status gap with skip counts, strategy posture, and service evidence refs",
      "governance act-next writes a bounded local feedback-refresh route review artifact for the current service status",
      "the route review suppresses the same service-status gap until feedback-refresh status updates again",
      "the action remains local state only and never calls Xiaohongshu MCP, opens browsers, publishes, fetches platform state, writes repo files, or writes the active vault"
    ],
    non_goals: [
      "no Xiaohongshu MCP feedback capture or current-user feed probe from this review",
      "no agent-browser or Chrome automation from this review",
      "no external publication, reposting, editing, or deletion",
      "no full draft-body exposure in the review artifact",
      "no investment advice claims from market-content feedback"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/self_evolution_gaps.test.ts tests/opportunity_actions.test.ts tests/opportunity_backlog.test.ts",
      "pnpm run runtime -- service health --target im",
      `pnpm run runtime -- governance act-next --opportunity ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: updatedAt,
    updated_at: updatedAt,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function isFeedbackRefreshRouteStatusReviewed(
  health: ServiceHealthResult,
  routeReviews: ContentFeedbackRefreshRouteReviewRecord[]
): boolean {
  const updatedAt = health.content_feedback_refresh.updated_at;
  if (!updatedAt) return false;
  return routeReviews.some((review) =>
    review.service_ref === health.content_feedback_refresh.ref
    && review.status_updated_at === updatedAt
    && review.top_skip_reason === "non_mcp_capture_route"
  );
}

function deriveSourceQualityGapFromContentRun(run: ContentRun, runs: ContentRun[]): SelfEvolutionGap | null {
  if (!run.refs.source_evidence_ref) return null;
  const evidenceItems = contentRunSourceEvidenceItems(run);
  if (evidenceItems.length === 0) return null;

  const reasons = sourceQualityIssueReasons(evidenceItems);
  if (reasons.length === 0) return null;
  if (isSourceQualityGapSuperseded(run, runs)) return null;

  const id = `gap_active_exploration_source_quality_${run.id}`;
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Daily active exploration source quality is weak",
    status: "active",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: [
      `Content run ${run.id} captured bounded source evidence,`,
      `but the daily active-exploration source set is weak: ${reasons.join("; ")}.`
    ].join(" "),
    evidence_refs: compactRefs([
      run.refs.run_ref,
      run.refs.brief_ref,
      run.refs.source_evidence_ref
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: "active_exploration_source_quality_gate",
    follow_up_kind: "act_next",
    acceptance: [
      "source collection records per-source quality metadata and aggregate source index health",
      "source collection records freshness metadata, including latest_published_at, source_age_hours, and market quote timestamp freshness",
      "draft selection prefers usable, deduplicated news and market evidence instead of source order alone",
      "publish preflight requires fresh daily source coverage before external publication",
      "governance opportunities expose weak daily source coverage with evidence refs and verification commands",
      "quality gaps remain planning signals and never publish, call models, or mutate repository files"
    ],
    non_goals: [
      "no paid news, authenticated browser scraping, or platform-cookie storage",
      "no model-based source summarization inside source collection",
      "no automatic publication block when one non-critical source fails",
      "no investment advice claims from source-quality scoring"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
      "pnpm run runtime -- content run --dry-run --live-sources --topic \"daily AI news and semiconductor stock hotspots\" --state-root <state-root>",
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: run.created_at,
    updated_at: run.updated_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function sourceQualityIssueReasons(evidenceItems: Array<ContentRun["source_items"][number]>): string[] {
  const newsItems = evidenceItems.filter((item) => item.kind === "http_fetch");
  const quoteItems = evidenceItems.filter((item) => item.kind === "market_quote");
  const usableNews = newsItems.filter(isUsableSourceItem);
  const usableQuotes = quoteItems.filter(isUsableSourceItem);
  const failedItems = evidenceItems.filter((item) => item.fetched === false || Boolean(item.error));
  const duplicateItems = evidenceItems.filter((item) => Boolean(sourceQualityField(item, "duplicate_of")));
  const freshNewsItems = newsItems.filter((item) => sourceFreshnessStatus(item) === "fresh");
  const freshQuoteItems = quoteItems.filter((item) => sourceFreshnessStatus(item) === "fresh");
  const missingFreshnessItems = evidenceItems.filter((item) => sourceFreshnessStatus(item) === "unknown");
  const staleItems = evidenceItems.filter((item) => sourceFreshnessStatus(item) === "stale");
  const severeIssueThreshold = Math.max(2, Math.ceil(evidenceItems.length / 2));

  return [
    ...(newsItems.length > 0 && usableNews.length === 0 ? ["no usable AI news source survived source-quality scoring"] : []),
    ...(quoteItems.length > 0 && usableQuotes.length === 0 ? ["no usable market quote survived source-quality scoring"] : []),
    ...(newsItems.length > 0 && freshNewsItems.length === 0 ? ["no AI news source has fresh published_at evidence"] : []),
    ...(quoteItems.length > 0 && freshQuoteItems.length === 0 ? ["no market quote has fresh timestamp evidence"] : []),
    ...(staleItems.length >= severeIssueThreshold ? [`${staleItems.length} source items are outside the freshness window`] : []),
    ...(missingFreshnessItems.length >= severeIssueThreshold ? [`${missingFreshnessItems.length} source items lack published_at or normalized quote time`] : []),
    ...(failedItems.length >= severeIssueThreshold ? [`${failedItems.length}/${evidenceItems.length} bounded source fetches failed`] : []),
    ...(duplicateItems.length >= 2 ? [`${duplicateItems.length} source items were marked duplicate and skipped for draft use`] : [])
  ];
}

function isSourceQualityGapSuperseded(run: ContentRun, runs: ContentRun[]): boolean {
  return runs.some((candidate) => {
    if (candidate.id === run.id) return false;
    if (!isEquivalentSourceQualityRun(run, candidate)) return false;
    if (!isLaterContentRun(candidate, run)) return false;
    return hasStrongSourceQualityEvidence(candidate);
  });
}

function isEquivalentSourceQualityRun(run: ContentRun, candidate: ContentRun): boolean {
  return isEquivalentDailyWorkflow(run.workflow_id, candidate.workflow_id)
    && candidate.publish_adapter.kind === run.publish_adapter.kind;
}

function hasStrongSourceQualityEvidence(run: ContentRun): boolean {
  if (!run.refs.source_evidence_ref) return false;
  const evidenceItems = contentRunSourceEvidenceItems(run);
  return evidenceItems.length > 0 && sourceQualityIssueReasons(evidenceItems).length === 0;
}

function deriveExternalPublishGapFromContentRun(run: ContentRun, runs: ContentRun[]): SelfEvolutionGap | null {
  if (run.status === "published") return null;
  if (isLocalFeedbackStrategyDraft(run)) return null;
  if (run.publish_adapter.kind !== "xiaohongshu-mcp" && run.publish_adapter.kind !== "agent-browser-cli") return null;
  if (isExternalPublishGapSuperseded(run, runs)) return null;
  const id = `gap_external_publish_evidence_${run.id}`;
  const evidenceRefs = compactRefs([
    run.refs.run_ref,
    run.refs.publish_plan_ref,
    run.refs.source_evidence_ref,
    run.refs.publish_preflight_ref
  ]);
  const hasPreflight = Boolean(run.refs.publish_preflight_ref);
  const proposedSlice = hasPreflight ? "external_publish_execution_contract" : "external_publish_preflight_contract";
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: hasPreflight
      ? "External publishing lacks final execution evidence"
      : "External publishing lacks typed preflight evidence",
    status: "active",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: hasPreflight
      ? [
        `Content run ${run.id} has a ${run.publish_adapter.kind} publish preflight result,`,
        "but it still lacks a confirmed external-write execution result with platform proof."
      ].join(" ")
      : [
        `Content run ${run.id} can prepare a ${run.publish_adapter.kind} publish adapter plan,`,
        "but the runtime has no typed preflight evidence proving local publish readiness before external-write execution."
      ].join(" "),
    evidence_refs: evidenceRefs,
    owner_surface: "runtime_tools",
    proposed_slice: proposedSlice,
    follow_up_kind: hasPreflight ? "narrow_review" : "act_next",
    acceptance: hasPreflight
      ? [
        "publish execution is marked external_write and requires explicit operator confirmation",
        "completion verification accepts published only when adapter evidence includes ok=true and at least a platform id, URL, or screenshot ref",
        "failed execution records typed external_publish evidence without claiming publication",
        "Feishu and capability acceptance remain read-only guidance surfaces for publishing"
      ]
      : [
        "adapter preflight can check login or tool availability without publishing",
        "preflight records source refs, title/content limits, image existence, login status, and adapter availability as typed evidence",
        "preflight writes only state artifacts and never calls publish_content",
        "Feishu and capability acceptance remain read-only guidance surfaces for publishing"
      ],
    non_goals: [
      "no platform-cookie storage in repository files",
      "no automatic mass posting",
      "no browser or MCP execution from read-only Feishu/operator views",
      "no investment advice claims from market source evidence"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
      "pnpm run runtime -- content run --dry-run --live-sources --topic \"daily AI news and semiconductor stock hotspots\" --image-model gpt-image-2 --state-root <state-root>",
      `pnpm run runtime -- content publish-preflight --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: run.created_at,
    updated_at: run.updated_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function isLocalFeedbackStrategyDraft(run: ContentRun): boolean {
  return run.status === "dry_run"
    && run.strategy?.kind === "feedback_strategy"
    && run.strategy.applied === true
    && Boolean(run.strategy.source_run_id);
}

function derivePostPublishFeedbackGapFromContentRun(
  run: ContentRun,
  feedback?: ContentFeedbackRecord
): SelfEvolutionGap | null {
  if (run.status !== "published") return null;
  if (!run.refs.publish_evidence_ref) return null;
  if (!feedback) return missingPostPublishFeedbackGap(run);
  if (feedback.evidence.status === "failed") return failedPostPublishFeedbackGap(run, feedback);
  if (isCreatorMetricsIncompleteFeedback(feedback.evidence)) return creatorMetricsIncompleteGap(run, feedback);
  if (isWeakPostPublishFeedback(feedback.evidence)) {
    const notBeforeAt = postPublishFeedbackNotBeforeAt(feedback.evidence);
    if (notBeforeAt > utcNow()) return waitingPostPublishFeedbackGap(run, feedback, notBeforeAt);
    return weakPostPublishFeedbackGap(run, feedback);
  }
  return null;
}

function missingPostPublishFeedbackGap(run: ContentRun): SelfEvolutionGap {
  const id = `gap_post_publish_feedback_missing_${run.id}`;
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Published content lacks post-publish feedback",
    status: "active",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: [
      `Content run ${run.id} has typed publication proof,`,
      "but no post-publish feedback snapshot has been recorded for the active-exploration loop."
    ].join(" "),
    evidence_refs: compactRefs([
      run.refs.run_ref,
      run.refs.publish_evidence_ref
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: "post_publish_feedback_capture_contract",
    follow_up_kind: "act_next",
    acceptance: [
      "published content runs can record typed feedback snapshots with view and engagement metrics",
      "feedback-history and feedback-review expose bounded post-publish metrics without reading draft bodies or platform state",
      "governance opportunities surface published runs that lack feedback evidence",
      "feedback capture remains operator or adapter supplied and never reads cookies or opens a browser from governance views"
    ],
    non_goals: [
      "no automatic browser scraping from self-evolution gap reads",
      "no platform-cookie storage in repository files",
      "no automatic reposting or editing based on feedback",
      "no investment advice claims from market-content feedback"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
      `pnpm run runtime -- content feedback-evidence --run ${run.id} --views <count> --likes <count> --state-root <state-root>`,
      `pnpm run runtime -- content feedback-review --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: run.created_at,
    updated_at: run.updated_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function failedPostPublishFeedbackGap(run: ContentRun, feedback: ContentFeedbackRecord): SelfEvolutionGap {
  const id = `gap_post_publish_feedback_failed_${run.id}`;
  const routeToCreatorMetrics = shouldRouteFailedFeedbackToCreatorMetrics(feedback);
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: routeToCreatorMetrics
      ? "Post-publish feedback needs creator metrics fallback"
      : "Post-publish feedback capture failed",
    status: "active",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: [
      `Content run ${run.id} has a feedback snapshot,`,
      `but capture failed: ${feedback.evidence.error ?? "no error summary was recorded"}.`,
      ...(routeToCreatorMetrics
        ? ["Route the next repair attempt through creator-backend metrics instead of retrying the timed-out Xiaohongshu MCP feed."]
        : [])
    ].join(" "),
    evidence_refs: compactRefs([
      run.refs.run_ref,
      run.refs.publish_evidence_ref,
      feedback.ref
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: routeToCreatorMetrics
      ? "creator_metrics_capture_readiness_loop"
      : "post_publish_feedback_capture_contract",
    follow_up_kind: "act_next",
    acceptance: routeToCreatorMetrics
      ? [
        "failed Xiaohongshu MCP feedback snapshots preserve timeout evidence without claiming captured metrics",
        "creator-metrics-needed lists the failed MCP capture as high-priority browser or page-text recovery work",
        "governance act-next routes MCP current-user feed timeouts to creator-metrics-capture instead of retrying the same timed-out feed",
        "creator metrics fallback records typed feedback evidence without publishing or reading cookies directly"
      ]
      : [
        "failed feedback snapshots preserve error evidence without claiming captured metrics",
        "feedback capture can be retried with operator or adapter supplied metrics",
        "feedback-review distinguishes failed capture from weak content performance",
        "governance opportunities expose failed feedback capture without reading cookies or platform state"
      ],
    non_goals: [
      "no automatic browser scraping from self-evolution gap reads",
      "no platform-cookie storage in repository files",
      "no external publication side effects",
      "no automatic content strategy change from failed telemetry alone"
    ],
    verification_commands: routeToCreatorMetrics
      ? [
        "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
        `pnpm run runtime -- content creator-metrics-needed --run ${run.id} --captured-by xiaohongshu-mcp --state-root <state-root>`,
        "pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root <state-root>",
        `pnpm run runtime -- content creator-metrics-capture --run ${run.id} --state-root <state-root>`,
        `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`
      ]
      : [
        "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
        `pnpm run runtime -- content feedback-history --run ${run.id} --state-root <state-root>`,
        `pnpm run runtime -- content feedback-review --run ${run.id} --state-root <state-root>`,
        `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`
      ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: feedback.evidence.created_at,
    updated_at: feedback.evidence.created_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function shouldRouteFailedFeedbackToCreatorMetrics(feedback: ContentFeedbackRecord): boolean {
  return feedback.evidence.status === "failed"
    && feedback.evidence.captured_by === "xiaohongshu-mcp"
    && /\/api\/v1\/user\/me timed out/i.test(feedback.evidence.error ?? "");
}

function creatorMetricsIncompleteGap(run: ContentRun, feedback: ContentFeedbackRecord): SelfEvolutionGap {
  const id = `gap_creator_metrics_incomplete_${run.id}`;
  const missingMetrics = missingFeedbackMetrics(feedback.evidence.metrics);
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Creator metrics are missing from feedback",
    status: "active",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: [
      `Content run ${run.id} has a Xiaohongshu MCP feedback snapshot,`,
      `but creator-backend counters are incomplete. Missing creator metrics: ${missingMetrics.join(", ")}.`,
      "Current creator view state: view_count=unknown.",
      "Verify the browser-backed metrics route before treating unknown views as a content signal."
    ].join(" "),
    evidence_refs: compactRefs([
      run.refs.run_ref,
      run.refs.publish_evidence_ref,
      feedback.ref
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: "creator_metrics_capture_readiness_loop",
    follow_up_kind: "act_next",
    acceptance: [
      "creator-metrics-needed lists published posts whose typed feedback lacks creator-backend view_count",
      "channel-readiness proves Xiaohongshu MCP and agent-browser-cli readiness before browser-backed metric capture",
      "governance opportunities expose missing creator metrics as active work without waiting for the feedback stable window",
      "creator-metrics-capture records creator-backend view_count as typed feedback evidence before strategy treats unknown views as content performance"
    ],
    non_goals: [
      "no automatic browser scraping from self-evolution gap reads",
      "no platform-cookie storage in repository files",
      "no automatic content rewrite, reposting, or deletion from missing metrics",
      "no investment advice claims from market-content feedback"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
      `pnpm run runtime -- content creator-metrics-needed --run ${run.id} --captured-by xiaohongshu-mcp --state-root <state-root>`,
      "pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root <state-root>",
      `pnpm run runtime -- content creator-metrics-capture --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: feedback.evidence.created_at,
    updated_at: feedback.evidence.created_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function weakPostPublishFeedbackGap(run: ContentRun, feedback: ContentFeedbackRecord): SelfEvolutionGap {
  const id = `gap_post_publish_feedback_weak_${run.id}`;
  const viewSummary = feedback.evidence.metrics.view_count === undefined
    ? "view_count=unknown"
    : `views=${feedback.evidence.metrics.view_count}`;
  const engagement = feedbackEngagementCount(feedback.evidence.metrics);
  const missingMetrics = missingFeedbackMetrics(feedback.evidence.metrics);
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Post-publish feedback is too weak to learn from",
    status: "active",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: [
      `Content run ${run.id} has post-publish feedback,`,
      `but the latest snapshot is too sparse for strategy learning: ${viewSummary}, engagement=${engagement}.`,
      ...(missingMetrics.length > 0 ? [`Missing metrics: ${missingMetrics.join(", ")}.`] : [])
    ].join(" "),
    evidence_refs: compactRefs([
      run.refs.run_ref,
      run.refs.publish_evidence_ref,
      feedback.ref
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: "post_publish_feedback_review_loop",
    follow_up_kind: "sop_candidate",
    acceptance: [
      "feedback-review ranks recent published posts by views and engagement",
      "weak or early feedback recommends a later snapshot before changing daily content strategy",
      "feedback-strategy uses typed feedback refs to produce next-run title, cover hierarchy, opening hook, and CTA examples",
      "review remains read-only and never opens browsers, calls models, publishes, or mutates repository files"
    ],
    non_goals: [
      "no automatic browser scraping from self-evolution gap reads",
      "no automatic reposting, editing, or deletion of platform content",
      "no model-generated strategy changes without operator-visible evidence",
      "no investment advice claims from market-content feedback"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
      `pnpm run runtime -- content feedback-review --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- content feedback-strategy --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: feedback.evidence.created_at,
    updated_at: feedback.evidence.created_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function waitingPostPublishFeedbackGap(
  run: ContentRun,
  feedback: ContentFeedbackRecord,
  notBeforeAt: string
): SelfEvolutionGap {
  const id = `gap_post_publish_feedback_waiting_${run.id}`;
  const viewSummary = feedback.evidence.metrics.view_count === undefined
    ? "view_count=unknown"
    : `views=${feedback.evidence.metrics.view_count}`;
  const engagement = feedbackEngagementCount(feedback.evidence.metrics);
  const missingMetrics = missingFeedbackMetrics(feedback.evidence.metrics);
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Post-publish feedback is still maturing",
    status: "waiting",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: [
      `Content run ${run.id} has an early post-publish feedback snapshot,`,
      `but it should not drive strategy until ${notBeforeAt}: ${viewSummary}, engagement=${engagement}.`,
      ...(missingMetrics.length > 0 ? [`Missing metrics: ${missingMetrics.join(", ")}.`] : [])
    ].join(" "),
    evidence_refs: compactRefs([
      run.refs.run_ref,
      run.refs.publish_evidence_ref,
      feedback.ref
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: "post_publish_feedback_stable_window",
    follow_up_kind: "waiting",
    acceptance: [
      "early feedback snapshots surface a not-before timestamp instead of weak-content conclusions",
      "feedback-review and feedback-strategy remain visible while waiting for a stable viewing window",
      "weak-content gaps appear only after the stable window has elapsed and metrics remain sparse",
      "waiting gaps remain read-only and never open browsers, call models, publish, or mutate repository files"
    ],
    non_goals: [
      "no automatic browser scraping from self-evolution gap reads",
      "no automatic reposting, editing, or deletion of platform content",
      "no model-generated strategy changes before stable feedback evidence exists",
      "no investment advice claims from market-content feedback"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
      `pnpm run runtime -- content feedback-review --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- content feedback-strategy --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    not_before_at: notBeforeAt,
    created_at: feedback.evidence.created_at,
    updated_at: feedback.evidence.created_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function deriveFeedbackStrategyNextGenerationGapFromContentRun(
  run: ContentRun,
  runs: ContentRun[],
  strategy?: ContentFeedbackStrategySuggestion
): SelfEvolutionGap | null {
  if (!strategy) return null;
  if (isFeedbackStrategyGapSuperseded(run, runs)) return null;
  const id = `gap_feedback_strategy_next_generation_${run.id}`;
  const trackId = feedbackStrategyTrackId(strategy);
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Feedback strategy is ready for next generation",
    status: "active",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: [
      `Content run ${run.id} has a ${strategy.posture} feedback strategy,`,
      "but no later local content run has applied it as next-generation guidance."
    ].join(" "),
    evidence_refs: compactRefs([
      run.refs.run_ref,
      ...strategy.evidence_refs
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: "feedback_strategy_next_generation_ready",
    follow_up_kind: "act_next",
    acceptance: [
      "feedback-strategy exposes reusable or revisable guidance backed by typed feedback evidence",
      "governance opportunities surface ready feedback strategy until a later run records strategy.source_run_id for the source post",
      "governance act-next creates a local dry-run next-generation content run with strategy-from provenance",
      "the generated run records feedback strategy posture, guidance, evidence refs, and applied=true",
      "the action remains local state only and never publishes externally, calls models, opens browsers, reads cookies, writes repo files, or writes the active vault"
    ],
    non_goals: [
      "no external Xiaohongshu publication from strategy readiness",
      "no automatic image generation or GPT image API call",
      "no platform feedback capture or browser automation",
      "no automatic deletion or editing of the source post",
      "no investment advice claims from market-content feedback"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
      `pnpm run runtime -- content feedback-strategy --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- content daily --dry-run --track ${trackId} --strategy-from ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- governance act-next --opportunity ${id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: strategy.latest_feedback_at ?? run.updated_at,
    updated_at: strategy.latest_feedback_at ?? run.updated_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function deriveFeedbackStrategyPreviewReviewGapFromContentRun(
  run: ContentRun,
  reviewedStrategyRunIds: Set<string>
): SelfEvolutionGap | null {
  if (run.status !== "dry_run") return null;
  if (run.strategy?.kind !== "feedback_strategy" || run.strategy.applied !== true) return null;
  if (reviewedStrategyRunIds.has(run.id) || reviewedStrategyRunIds.has(run.refs.run_ref)) return null;

  const id = `gap_feedback_strategy_preview_review_${run.id}`;
  const trackId = feedbackStrategyTrackIdForRun(run);
  return {
    schema_version: 1,
    id,
    ref: `self-evolution/gaps/${id}.json`,
    title: "Feedback strategy dry-run needs local review",
    status: "active",
    source: "content_run",
    source_ref: run.refs.run_ref,
    observed_problem: [
      `Content run ${run.id} is a local dry-run generated from feedback strategy ${run.strategy.posture},`,
      "but no bounded strategy-preview review has recorded whether it is ready to become next daily guidance."
    ].join(" "),
    evidence_refs: compactRefs([
      run.refs.run_ref,
      run.strategy.source_run_ref,
      ...run.strategy.evidence_refs
    ]),
    owner_surface: "runtime_tools",
    proposed_slice: "feedback_strategy_preview_review",
    follow_up_kind: "act_next",
    acceptance: [
      "governance opportunities surface feedback-strategy dry-runs until a local preview review artifact exists",
      "governance act-next writes a bounded strategy-preview review with source and generated run refs",
      "the review records posture, applied status, title change, guidance guardrail, evidence refs, and next commands",
      "the review remains local state only and never publishes externally, calls models, opens browsers, reads cookies, writes repo files, or writes the active vault"
    ],
    non_goals: [
      "no external Xiaohongshu publication from preview review",
      "no automatic image generation or GPT image API call",
      "no platform feedback capture or browser automation",
      "no full draft-body exposure in the review artifact",
      "no investment advice claims from market-content feedback"
    ],
    verification_commands: [
      "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
      `pnpm run runtime -- content show --run ${run.id} --state-root <state-root>`,
      `pnpm run runtime -- governance act-next --opportunity ${id} --state-root <state-root>`,
      `pnpm run runtime -- content daily --dry-run --track ${trackId} --strategy-from ${run.strategy.source_run_id} --state-root <state-root>`,
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    inspect_command: `pnpm run runtime -- governance gaps --gap ${id} --state-root <state-root>`,
    created_at: run.updated_at,
    updated_at: run.updated_at,
    boundary: SELF_EVOLUTION_GAP_BOUNDARY
  };
}

function readyFeedbackStrategyByRunId(
  suggestions: ContentFeedbackStrategySuggestion[]
): Map<string, ContentFeedbackStrategySuggestion> {
  const byRun = new Map<string, ContentFeedbackStrategySuggestion>();
  for (const suggestion of suggestions) {
    if (!isReadyFeedbackStrategySuggestion(suggestion)) continue;
    if (!byRun.has(suggestion.run_id)) byRun.set(suggestion.run_id, suggestion);
  }
  return byRun;
}

function isReadyFeedbackStrategySuggestion(suggestion: ContentFeedbackStrategySuggestion): boolean {
  return suggestion.posture === "reuse_baseline" || suggestion.posture === "revise_next_post";
}

function isFeedbackStrategyGapSuperseded(run: ContentRun, runs: ContentRun[]): boolean {
  return runs.some((candidate) =>
    candidate.id !== run.id
    && candidate.strategy?.kind === "feedback_strategy"
    && candidate.strategy.source_run_id === run.id
    && candidate.strategy.applied === true
  );
}

function feedbackStrategyTrackId(strategy: ContentFeedbackStrategySuggestion): "ai_applications" | "ai_compute_market" {
  const text = [
    strategy.workflow_id,
    strategy.topic,
    strategy.title
  ].join(" ");
  return /(ai[_-]?applications?|applications?|agent tooling|product launches?|commercial adoption|commercialization|应用|智能体|产品)/i.test(text)
    ? "ai_applications"
    : "ai_compute_market";
}

function feedbackStrategyTrackIdForRun(run: ContentRun): "ai_applications" | "ai_compute_market" {
  const text = [
    run.workflow_id,
    run.topic,
    run.draft.title
  ].join(" ");
  return /(ai[_-]?applications?|applications?|agent tooling|product launches?|commercial adoption|commercialization|应用|智能体|产品)/i.test(text)
    ? "ai_applications"
    : "ai_compute_market";
}

function isExternalPublishGapSuperseded(run: ContentRun, runs: ContentRun[]): boolean {
  const hasPreflight = Boolean(run.refs.publish_preflight_ref);
  if (hasSameDayPublishCompletionProof(run, runs)) return true;
  return runs.some((candidate) => {
    if (candidate.id === run.id) return false;
    if (!isEquivalentPublishRun(run, candidate)) return false;
    if (!isLaterContentRun(candidate, run)) return false;
    return hasPreflight
      ? hasPublishCompletionProof(candidate)
      : hasPublishReadinessOrCompletionProof(candidate);
  });
}

function hasSameDayPublishCompletionProof(run: ContentRun, runs: ContentRun[]): boolean {
  return runs.some((candidate) =>
    candidate.id !== run.id
    && isEquivalentPublishRun(run, candidate)
    && contentRunDateKey(candidate) === contentRunDateKey(run)
    && hasPublishCompletionProof(candidate)
  );
}

function isEquivalentPublishRun(run: ContentRun, candidate: ContentRun): boolean {
  return isEquivalentDailyWorkflow(run.workflow_id, candidate.workflow_id)
    && candidate.draft.title === run.draft.title
    && candidate.publish_adapter.kind === run.publish_adapter.kind;
}

function isEquivalentDailyWorkflow(left: string, right: string): boolean {
  if (left === right) return true;
  return isDailyAiXhsWorkflow(left) && isDailyAiXhsWorkflow(right);
}

function isDailyAiXhsWorkflow(workflowId: string): boolean {
  return /^daily_ai_[a-z0-9_]*_xhs$/.test(workflowId);
}

function hasPublishReadinessOrCompletionProof(run: ContentRun): boolean {
  return hasPublishCompletionProof(run)
    || (run.evidence.publish_preflight_status === "preflight_ok" && Boolean(run.refs.publish_preflight_ref));
}

function hasPublishCompletionProof(run: ContentRun): boolean {
  return run.status === "published"
    && run.evidence.publish_status === "published"
    && Boolean(run.refs.publish_evidence_ref);
}

async function readContentFeedbackRecords(store: AgentStore): Promise<ContentFeedbackRecord[]> {
  const refs = await store.listStateFiles("content/runs");
  const records: ContentFeedbackRecord[] = [];
  for (const ref of refs.filter((item) => item.includes("/feedback/") && item.endsWith(".json")).sort()) {
    const parsed = contentFeedbackEvidenceSchema.safeParse(await store.readStateJson<unknown>(ref));
    if (parsed.success) records.push({ ref, evidence: parsed.data });
  }
  return records.sort(compareFeedbackRecords);
}

async function readContentStrategyPreviewReviewRecords(
  store: AgentStore
): Promise<ContentStrategyPreviewReviewRecord[]> {
  const refs = (await store.listStateFiles("content/strategy-reviews"))
    .filter((ref) => ref.endsWith(".json"));
  const records: ContentStrategyPreviewReviewRecord[] = [];
  for (const ref of refs) {
    const record = parseContentStrategyPreviewReviewRecord(await store.readStateJson<unknown>(ref));
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function readContentFeedbackRefreshRouteReviewRecords(
  store: AgentStore
): Promise<ContentFeedbackRefreshRouteReviewRecord[]> {
  const refs = (await store.listStateFiles("content/feedback-refresh-route-reviews"))
    .filter((ref) => ref.endsWith(".json"));
  const records: ContentFeedbackRefreshRouteReviewRecord[] = [];
  for (const ref of refs) {
    const record = parseContentFeedbackRefreshRouteReviewRecord(await store.readStateJson<unknown>(ref));
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function parseContentStrategyPreviewReviewRecord(value: unknown): ContentStrategyPreviewReviewRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ContentStrategyPreviewReviewRecord>;
  if (record.schema_version !== 1) return null;
  if (record.kind !== "content_strategy_preview_review") return null;
  if (typeof record.generated_run_id !== "string" || record.generated_run_id.length === 0) return null;
  if (typeof record.generated_run_ref !== "string" || record.generated_run_ref.length === 0) return null;
  if (typeof record.source_run_id !== "string" || record.source_run_id.length === 0) return null;
  if (typeof record.source_run_ref !== "string" || record.source_run_ref.length === 0) return null;
  if (typeof record.created_at !== "string" || record.created_at.length === 0) return null;
  return record as ContentStrategyPreviewReviewRecord;
}

function parseContentFeedbackRefreshRouteReviewRecord(value: unknown): ContentFeedbackRefreshRouteReviewRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ContentFeedbackRefreshRouteReviewRecord>;
  if (record.schema_version !== 1) return null;
  if (record.kind !== "content_feedback_refresh_route_review") return null;
  if (typeof record.service_ref !== "string" || record.service_ref.length === 0) return null;
  if (typeof record.status_updated_at !== "string" || record.status_updated_at.length === 0) return null;
  if (typeof record.top_skip_reason !== "string" || record.top_skip_reason.length === 0) return null;
  if (typeof record.created_at !== "string" || record.created_at.length === 0) return null;
  return record as ContentFeedbackRefreshRouteReviewRecord;
}

function reviewedStrategyPreviewRunIds(records: ContentStrategyPreviewReviewRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    ids.add(record.generated_run_id);
    ids.add(record.generated_run_ref);
  }
  return ids;
}

function latestFeedbackByRunId(records: ContentFeedbackRecord[]): Map<string, ContentFeedbackRecord> {
  const byRun = new Map<string, ContentFeedbackRecord>();
  for (const record of records) {
    if (!byRun.has(record.evidence.run_id)) byRun.set(record.evidence.run_id, record);
  }
  return byRun;
}

function compareFeedbackRecords(a: ContentFeedbackRecord, b: ContentFeedbackRecord): number {
  const created = b.evidence.created_at.localeCompare(a.evidence.created_at);
  if (created !== 0) return created;
  return feedbackRecordCompletenessScore(b.evidence) - feedbackRecordCompletenessScore(a.evidence)
    || b.ref.localeCompare(a.ref);
}

function feedbackRecordCompletenessScore(evidence: ContentFeedbackEvidence): number {
  const missingMetricCount = missingFeedbackMetrics(evidence.metrics).length;
  return (evidence.status === "captured" ? 20 : 0)
    + (evidence.metrics.view_count !== undefined ? 10 : 0)
    + (6 - missingMetricCount);
}

function isWeakPostPublishFeedback(evidence: ContentFeedbackEvidence): boolean {
  const viewCount = evidence.metrics.view_count;
  const engagement = feedbackEngagementCount(evidence.metrics);
  if (viewCount === undefined && engagement === 0) return true;
  return (viewCount ?? 0) < 10 && engagement === 0;
}

function isCreatorMetricsIncompleteFeedback(evidence: ContentFeedbackEvidence): boolean {
  return evidence.status === "captured"
    && evidence.captured_by === "xiaohongshu-mcp"
    && evidence.metrics.view_count === undefined;
}

function postPublishFeedbackNotBeforeAt(evidence: ContentFeedbackEvidence): string {
  return formatIsoNoMilliseconds(new Date(Date.parse(evidence.created_at) + POST_PUBLISH_FEEDBACK_STABLE_WINDOW_MS));
}

function formatIsoNoMilliseconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function feedbackEngagementCount(metrics: ContentFeedbackEvidence["metrics"]): number {
  return (metrics.like_count ?? 0)
    + (metrics.comment_count ?? 0)
    + (metrics.collect_count ?? 0)
    + (metrics.share_count ?? 0)
    + (metrics.follow_count ?? 0);
}

function missingFeedbackMetrics(metrics: ContentFeedbackEvidence["metrics"]): ContentFeedbackMetricName[] {
  const keys: ContentFeedbackMetricName[] = ["view_count", "like_count", "comment_count", "collect_count", "share_count"];
  return keys.filter((key) => metrics[key] === undefined);
}

function isLaterContentRun(candidate: ContentRun, run: ContentRun): boolean {
  const createdComparison = candidate.created_at.localeCompare(run.created_at);
  if (createdComparison !== 0) return createdComparison > 0;
  const updatedComparison = candidate.updated_at.localeCompare(run.updated_at);
  if (updatedComparison !== 0) return updatedComparison > 0;
  return candidate.id.localeCompare(run.id) > 0;
}

function contentRunSourceEvidenceItems(run: ContentRun): Array<ContentRun["source_items"][number]> {
  return run.source_items.filter((item) => item.kind === "http_fetch" || item.kind === "market_quote");
}

function contentRunDateKey(run: ContentRun): string {
  return run.created_at.slice(0, 10);
}

function isUsableSourceItem(item: ContentRun["source_items"][number]): boolean {
  const usable = sourceQualityField(item, "usable_for_draft");
  if (typeof usable === "boolean") return usable;
  return item.fetched === true && !item.error && !/^(Fetch|Quote) fetch failed:/i.test(item.summary);
}

function sourceQualityField(item: ContentRun["source_items"][number], key: string): unknown {
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const quality = metadata.source_quality;
  if (!isRecord(quality)) return undefined;
  return quality[key];
}

function sourceFreshnessStatus(item: ContentRun["source_items"][number]): "fresh" | "stale" | "unknown" {
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const status = metadata.freshness_status;
  return status === "fresh" || status === "stale" || status === "unknown" ? status : "unknown";
}

async function readContentRuns(store: AgentStore): Promise<ContentRun[]> {
  const refs = await store.listStateFiles("content/runs", "run.json");
  const runs: ContentRun[] = [];
  for (const ref of refs) {
    const parsed = contentRunSchema.safeParse(await store.readStateJson<unknown>(ref));
    if (parsed.success) runs.push(parsed.data);
  }
  return runs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function readOperatorCorrectionRecords(store: AgentStore): Promise<OperatorCorrectionRecord[]> {
  const refs = (await store.listStateFiles(OPERATOR_CORRECTIONS_ROOT))
    .filter((ref) => ref.endsWith(".json"));
  const records: OperatorCorrectionRecord[] = [];
  for (const ref of refs) {
    const record = parseOperatorCorrectionRecord(await store.readStateJson<unknown>(ref), ref);
    if (record) records.push(record);
  }
  return records.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function readSopDraftEvidenceRefs(store: AgentStore): Promise<Set<string>> {
  const refs = new Set<string>();
  for (const ref of (await store.listStateFiles("sop/drafts")).filter((item) => item.endsWith(".json"))) {
    let record: unknown;
    try {
      record = await store.readStateJson<unknown>(ref);
    } catch {
      continue;
    }
    if (!isRecord(record)) continue;
    const evidenceRefs = Array.isArray(record.evidence_refs) ? record.evidence_refs : [];
    for (const evidenceRef of evidenceRefs) {
      if (typeof evidenceRef === "string" && evidenceRef.trim()) refs.add(evidenceRef);
    }
  }
  return refs;
}

function parseOperatorCorrectionRecord(value: unknown, ref: string): OperatorCorrectionRecord | null {
  if (!isRecord(value)) return null;
  if (value.schema_version !== 1 || value.kind !== "operator_correction") return null;
  const id = stringField(value, "id");
  const summary = stringField(value, "summary");
  const ownerSurface = stringField(value, "owner_surface");
  const proposedSlice = stringField(value, "proposed_slice");
  const createdAt = stringField(value, "created_at");
  const boundary = stringField(value, "boundary") ?? OPERATOR_CORRECTION_BOUNDARY;
  if (!id || !summary || !ownerSurface || !proposedSlice || !createdAt) return null;
  const sourceRef = stringField(value, "source_ref") ?? undefined;
  const evidenceRefs = Array.isArray(value.evidence_refs)
    ? value.evidence_refs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return {
    schema_version: 1,
    id,
    ref: stringField(value, "ref") ?? ref,
    kind: "operator_correction",
    summary,
    ...(sourceRef ? { source_ref: sourceRef } : {}),
    owner_surface: ownerSurface,
    proposed_slice: proposedSlice,
    evidence_refs: compactRefs(evidenceRefs),
    created_at: createdAt,
    boundary
  };
}

async function readSelfEvolutionGapOpportunityDecisions(
  store: AgentStore
): Promise<SelfEvolutionGapOpportunityDecision[]> {
  const raw = await store.readStateText(OPPORTUNITY_DECISIONS_REF);
  if (!raw.trim()) return [];
  return raw.split(/\r?\n/)
    .map((line, index) => parseSelfEvolutionGapOpportunityDecision(line, index + 1))
    .filter((decision): decision is SelfEvolutionGapOpportunityDecision => decision !== null);
}

function parseSelfEvolutionGapOpportunityDecision(
  line: string,
  rowIndex: number
): SelfEvolutionGapOpportunityDecision | null {
  if (!line.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const opportunityKind = stringField(parsed, "opportunity_kind");
  if (opportunityKind && opportunityKind !== "self_evolution_gap") return null;
  const id = stringField(parsed, "id");
  const opportunityId = stringField(parsed, "opportunity_id");
  const opportunityRef = stringField(parsed, "opportunity_ref");
  const status = stringField(parsed, "status");
  const previousStatus = stringField(parsed, "previous_status");
  const reason = stringField(parsed, "reason");
  const createdAt = stringField(parsed, "created_at");
  if (!id || !opportunityId || !opportunityRef || !status || !previousStatus || !reason || !createdAt) {
    return null;
  }
  if (!isSelfEvolutionGapOpportunityDecisionStatus(status)) return null;
  return {
    id,
    ref: `${OPPORTUNITY_DECISIONS_REF}#${rowIndex}`,
    opportunity_id: opportunityId,
    opportunity_ref: opportunityRef,
    status,
    previous_status: previousStatus,
    reason,
    created_at: createdAt
  };
}

function isSelfEvolutionGapOpportunityDecisionStatus(
  value: string
): value is SelfEvolutionGapOpportunityDecisionStatus {
  return value === "open" || value === "deferred" || value === "completed" || value === "retired";
}

function compactRefs(refs: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ref of refs) {
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    result.push(ref);
  }
  return result;
}

function safeGapIdPart(value: string): string {
  return slugify(value).replace(/-/g, "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}
