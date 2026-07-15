import { AgentStore } from "./store.js";

export const REVIEW_INBOX_DECISIONS_REF = "autonomy/review-inbox-decisions.jsonl";

export type ReviewInboxDecisionStatus = "open" | "deferred" | "completed" | "retired";
export type ReviewInboxDecisionPreviousStatus = ReviewInboxDecisionStatus | "confirmation_requested" | "executed" | "none";

export interface ReviewInboxDecisionRecord {
  id: string;
  item_id: string;
  item_ref: string;
  duplicate_key?: string;
  action_kind: string;
  status: ReviewInboxDecisionStatus;
  previous_status: ReviewInboxDecisionPreviousStatus;
  reason: string;
  created_at: string;
}

export type ReviewInboxDecisionWithRef = ReviewInboxDecisionRecord & { ref: string };

export async function readReviewInboxDecisions(store: AgentStore): Promise<ReviewInboxDecisionWithRef[]> {
  const raw = await store.readStateText(REVIEW_INBOX_DECISIONS_REF);
  if (!raw.trim()) return [];
  const decisions: ReviewInboxDecisionWithRef[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isReviewInboxDecision(parsed)) {
        decisions.push({
          ...parsed,
          ref: `${REVIEW_INBOX_DECISIONS_REF}#${index + 1}`
        });
      }
    } catch {
      // Ignore malformed historical rows; decision logs are append-only diagnostics.
    }
  });
  return decisions;
}

export function latestReviewInboxDecision(
  decisions: ReviewInboxDecisionWithRef[],
  itemRef: string,
  itemId: string,
  duplicateKey?: string
): ReviewInboxDecisionWithRef | undefined {
  return decisions
    .filter((decision) => decision.item_ref === itemRef
      || decision.item_id === itemId
      || (duplicateKey !== undefined && decision.duplicate_key === duplicateKey))
    .at(-1);
}

export async function countReviewInboxDecisions(store: AgentStore): Promise<number> {
  const raw = await store.readStateText(REVIEW_INBOX_DECISIONS_REF);
  if (!raw.trim()) return 0;
  return raw.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

export function isReviewInboxDecisionStatus(value: unknown): value is ReviewInboxDecisionStatus {
  return value === "open" || value === "deferred" || value === "completed" || value === "retired";
}

export function suppressReviewInboxDecision(decision: ReviewInboxDecisionWithRef | undefined): boolean {
  return decision?.status === "completed" || decision?.status === "retired";
}

function isReviewInboxDecision(value: unknown): value is ReviewInboxDecisionRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.item_id === "string"
    && typeof value.item_ref === "string"
    && (value.duplicate_key === undefined || typeof value.duplicate_key === "string")
    && typeof value.action_kind === "string"
    && isReviewInboxDecisionStatus(value.status)
    && isReviewInboxPreviousStatus(value.previous_status)
    && typeof value.reason === "string"
    && typeof value.created_at === "string";
}

function isReviewInboxPreviousStatus(value: unknown): value is ReviewInboxDecisionPreviousStatus {
  return value === "none"
    || value === "confirmation_requested"
    || value === "executed"
    || isReviewInboxDecisionStatus(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
