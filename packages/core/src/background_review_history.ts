import { basename } from "node:path";
import { AgentStore } from "./store.js";

export type BackgroundReviewHistoryMode = "recent" | "query" | "session";
export type BackgroundReviewProposalKind = "sop_candidate" | "skill_revision" | "memory_gap" | "runtime_gap";

export interface BackgroundReviewHistoryActionChainStep {
  label: string;
  effect: string;
  reason?: string;
}

export interface BackgroundReviewHistoryProposal {
  id: string;
  type: BackgroundReviewProposalKind;
  title: string;
  rationale: string;
  evidence_refs: string[];
  next_action: string;
  focus_action_chain?: BackgroundReviewHistoryActionChainStep[];
}

export interface BackgroundReviewHistoryChainSummary {
  sop_ref: string;
  sop_id: string;
  title: string;
  sop_status: string;
  latest_decision: string;
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

export interface BackgroundReviewHistoryRecord {
  id: string;
  mode: BackgroundReviewHistoryMode;
  query: string | null;
  session_id: string | null;
  created_at: string;
  stats: {
    events_reviewed: number;
    sessions_seen: number;
    failure_signal_count: number;
    sop_signal_count: number;
  };
  source: {
    reviewed_event_ids: string[];
    working_checkpoint_ref?: string;
  };
  chain_summaries: BackgroundReviewHistoryChainSummary[];
  proposals: BackgroundReviewHistoryProposal[];
  artifact_refs: {
    json_ref: string;
    markdown_ref?: string;
  };
  evidence_event_id?: string;
}

export interface BackgroundReviewHistorySummary {
  review_ref: string;
  id: string;
  mode: BackgroundReviewHistoryMode;
  query: string | null;
  session_id: string | null;
  created_at: string;
  events_reviewed: number;
  sessions_seen: number;
  failure_signal_count: number;
  sop_signal_count: number;
  proposal_count: number;
  proposal_types: Record<string, number>;
  proposal_summaries: Array<{
    id: string;
    type: BackgroundReviewProposalKind;
    title: string;
    evidence_ref_count: number;
    next_action: string;
    focus_action_chain?: BackgroundReviewHistoryActionChainStep[];
  }>;
  chain_summary_count: number;
  working_checkpoint_ref?: string;
  evidence_event_id?: string;
}

export interface BackgroundReviewHistoryListResult {
  count: number;
  review_refs: string[];
  reviews: BackgroundReviewHistorySummary[];
}

export interface BackgroundReviewHistoryDetailResult {
  review_ref: string;
  review: BackgroundReviewHistoryRecord;
}

export async function listBackgroundReviews(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<BackgroundReviewHistoryListResult> {
  await store.ensureLayout();
  const refs = (await store.listStateFiles("autonomy/reviews"))
    .filter((ref) => ref.endsWith(".json"));
  const reviews: BackgroundReviewHistorySummary[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const review = parseBackgroundReviewRecord(raw);
    if (review) reviews.push(summarizeBackgroundReview(ref, review));
  }
  const selected = reviews
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
    .slice(0, args.limit ?? reviews.length);
  return {
    count: selected.length,
    review_refs: selected.map((review) => review.review_ref),
    reviews: selected
  };
}

export async function getBackgroundReview(
  store: AgentStore,
  args: { reviewRef: string }
): Promise<BackgroundReviewHistoryDetailResult> {
  await store.ensureLayout();
  const reviewRef = resolveBackgroundReviewRef(args.reviewRef);
  const raw = await store.readStateJson<unknown>(reviewRef);
  const review = parseBackgroundReviewRecord(raw);
  if (!review) throw new Error(`Background review report not found or invalid: ${reviewRef}`);
  return {
    review_ref: reviewRef,
    review
  };
}

export function resolveBackgroundReviewRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--review requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe background review ref: ${value}`);
  }
  if (trimmed.startsWith("autonomy/reviews/") && trimmed.endsWith(".json")) return trimmed;
  const file = trimmed.endsWith(".json") ? basename(trimmed) : `${trimmed}.json`;
  return `autonomy/reviews/${file}`;
}

function summarizeBackgroundReview(
  ref: string,
  review: BackgroundReviewHistoryRecord
): BackgroundReviewHistorySummary {
  const proposalTypes: Record<string, number> = {};
  for (const proposal of review.proposals) {
    proposalTypes[proposal.type] = (proposalTypes[proposal.type] ?? 0) + 1;
  }
  return {
    review_ref: ref,
    id: review.id,
    mode: review.mode,
    query: review.query,
    session_id: review.session_id,
    created_at: review.created_at,
    events_reviewed: review.stats.events_reviewed,
    sessions_seen: review.stats.sessions_seen,
    failure_signal_count: review.stats.failure_signal_count,
    sop_signal_count: review.stats.sop_signal_count,
    proposal_count: review.proposals.length,
    proposal_types: proposalTypes,
    proposal_summaries: review.proposals.slice(0, 5).map((proposal) => {
      const summary: BackgroundReviewHistorySummary["proposal_summaries"][number] = {
        id: proposal.id,
        type: proposal.type,
        title: proposal.title,
        evidence_ref_count: proposal.evidence_refs.length,
        next_action: proposal.next_action
      };
      if (proposal.focus_action_chain) summary.focus_action_chain = proposal.focus_action_chain;
      return summary;
    }),
    chain_summary_count: review.chain_summaries.length,
    working_checkpoint_ref: review.source.working_checkpoint_ref,
    evidence_event_id: review.evidence_event_id
  };
}

function parseBackgroundReviewRecord(value: unknown): BackgroundReviewHistoryRecord | null {
  if (!isRecord(value)) return null;
  const id = stringField(value, "id");
  const mode = modeField(value, "mode");
  const createdAt = stringField(value, "created_at");
  const stats = statsField(value.stats);
  const source = sourceField(value.source);
  const artifactRefs = artifactRefsField(value.artifact_refs);
  if (!id || !mode || !createdAt || !stats || !source || !artifactRefs) return null;
  return {
    id,
    mode,
    query: stringField(value, "query"),
    session_id: stringField(value, "session_id"),
    created_at: createdAt,
    stats,
    source,
    chain_summaries: chainSummariesField(value.chain_summaries),
    proposals: proposalsField(value.proposals),
    artifact_refs: artifactRefs,
    evidence_event_id: stringField(value, "evidence_event_id") ?? undefined
  };
}

function statsField(value: unknown): BackgroundReviewHistoryRecord["stats"] | null {
  if (!isRecord(value)) return null;
  const eventsReviewed = numberField(value, "events_reviewed");
  const sessionsSeen = numberField(value, "sessions_seen");
  const failureSignalCount = numberField(value, "failure_signal_count");
  const sopSignalCount = numberField(value, "sop_signal_count");
  if (
    eventsReviewed === null
    || sessionsSeen === null
    || failureSignalCount === null
    || sopSignalCount === null
  ) return null;
  return {
    events_reviewed: eventsReviewed,
    sessions_seen: sessionsSeen,
    failure_signal_count: failureSignalCount,
    sop_signal_count: sopSignalCount
  };
}

function sourceField(value: unknown): BackgroundReviewHistoryRecord["source"] | null {
  if (!isRecord(value)) return null;
  const checkpoint = isRecord(value.working_checkpoint) ? stringField(value.working_checkpoint, "ref") : null;
  return {
    reviewed_event_ids: stringArrayField(value.reviewed_event_ids),
    working_checkpoint_ref: checkpoint ?? undefined
  };
}

function artifactRefsField(value: unknown): BackgroundReviewHistoryRecord["artifact_refs"] | null {
  if (!isRecord(value)) return null;
  const jsonRef = stringField(value, "json_ref");
  if (!jsonRef) return null;
  return {
    json_ref: jsonRef,
    markdown_ref: stringField(value, "markdown_ref") ?? undefined
  };
}

function proposalsField(value: unknown): BackgroundReviewHistoryProposal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = stringField(item, "id");
      const type = proposalKindField(item, "type");
      const title = stringField(item, "title");
      const rationale = stringField(item, "rationale");
      const nextAction = stringField(item, "next_action");
      if (!id || !type || !title || !rationale || !nextAction) return null;
      const proposal: BackgroundReviewHistoryProposal = {
        id,
        type,
        title,
        rationale,
        evidence_refs: stringArrayField(item.evidence_refs),
        next_action: nextAction
      };
      const actionChain = actionChainField(item.focus_action_chain);
      if (actionChain) proposal.focus_action_chain = actionChain;
      return proposal;
    })
    .filter((item): item is BackgroundReviewHistoryProposal => item !== null);
}

function actionChainField(value: unknown): BackgroundReviewHistoryActionChainStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value
    .map((item) => {
      if (!isRecord(item)) return null;
      const label = stringField(item, "label");
      const effect = stringField(item, "effect");
      if (!label || !effect) return null;
      const step: BackgroundReviewHistoryActionChainStep = { label, effect };
      const reason = stringField(item, "reason");
      if (reason) step.reason = reason;
      return step;
    })
    .filter((item): item is BackgroundReviewHistoryActionChainStep => item !== null);
  return steps.length > 0 ? steps : undefined;
}

function chainSummariesField(value: unknown): BackgroundReviewHistoryChainSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const sopRef = stringField(item, "sop_ref");
      const sopId = stringField(item, "sop_id");
      const title = stringField(item, "title");
      const sopStatus = stringField(item, "sop_status");
      const latestDecision = stringField(item, "latest_decision");
      const eventCount = numberField(item, "event_count");
      const auditCount = numberField(item, "audit_count");
      const promotionEvents = numberField(item, "promotion_events");
      const reuseEvents = numberField(item, "reuse_events");
      if (
        !sopRef
        || !sopId
        || !title
        || !sopStatus
        || !latestDecision
        || eventCount === null
        || auditCount === null
        || promotionEvents === null
        || reuseEvents === null
      ) return null;
      return {
        sop_ref: sopRef,
        sop_id: sopId,
        title,
        sop_status: sopStatus,
        latest_decision: latestDecision,
        event_count: eventCount,
        audit_count: auditCount,
        promotion_events: promotionEvents,
        reuse_events: reuseEvents,
        review_refs: stringArrayField(item.review_refs),
        audit_refs: stringArrayField(item.audit_refs),
        skill_refs: stringArrayField(item.skill_refs),
        duplicate_skill_refs: stringArrayField(item.duplicate_skill_refs),
        event_ids: stringArrayField(item.event_ids)
      };
    })
    .filter((item): item is BackgroundReviewHistoryChainSummary => item !== null);
}

function modeField(record: Record<string, unknown>, key: string): BackgroundReviewHistoryMode | null {
  const value = record[key];
  return value === "recent" || value === "query" || value === "session" ? value : null;
}

function proposalKindField(record: Record<string, unknown>, key: string): BackgroundReviewProposalKind | null {
  const value = record[key];
  return value === "sop_candidate" || value === "skill_revision" || value === "memory_gap" || value === "runtime_gap"
    ? value
    : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
