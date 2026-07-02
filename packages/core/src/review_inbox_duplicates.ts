import { createHash } from "node:crypto";
import type { ReviewInboxDecisionWithRef } from "./review_inbox_decisions.js";

export interface ReviewInboxDuplicateCandidate {
  id: string;
  status: string;
  action_kind?: string;
  title?: string;
  rationale?: string;
  command?: string | null;
  required_refs?: readonly unknown[];
  would_write?: readonly unknown[];
  updated_at?: string;
  created_at?: string;
  latest_decision?: ReviewInboxDecisionWithRef;
}

export interface ReviewInboxDuplicateGroup {
  key: string;
  canonical_id: string;
  canonical_ref: string;
  duplicate_count: number;
  item_ids: string[];
  item_refs: string[];
  duplicate_ids: string[];
  duplicate_refs: string[];
}

export type ReviewInboxDuplicateAnnotated<T> = T & {
  duplicate_group?: ReviewInboxDuplicateGroup;
};

export function annotateReviewInboxDuplicates<T extends ReviewInboxDuplicateCandidate>(
  items: T[]
): Array<ReviewInboxDuplicateAnnotated<T>> {
  const groups = groupReviewInboxDuplicates(items);
  return items.map((item) => {
    const group = groups.get(reviewInboxDuplicateKey(item));
    return group && group.duplicate_count > 0 ? { ...item, duplicate_group: group } : item;
  });
}

export function collapseReviewInboxDuplicates<T extends ReviewInboxDuplicateCandidate>(
  items: T[]
): Array<ReviewInboxDuplicateAnnotated<T>> {
  return annotateReviewInboxDuplicates(items)
    .filter((item) => !item.duplicate_group || item.duplicate_group.canonical_id === item.id);
}

export function latestReviewInboxDuplicateDecision(
  decisions: readonly ReviewInboxDecisionWithRef[],
  item: ReviewInboxDuplicateCandidate,
  group?: ReviewInboxDuplicateGroup
): ReviewInboxDecisionWithRef | undefined {
  const itemIds = new Set(group?.item_ids ?? [item.id]);
  const itemRefs = new Set(group?.item_refs ?? [reviewInboxItemRef(item.id)]);
  const duplicateKey = group?.key ?? reviewInboxDuplicateKey(item);
  return decisions
    .filter((decision) => itemIds.has(decision.item_id)
      || itemRefs.has(decision.item_ref)
      || decision.duplicate_key === duplicateKey)
    .at(-1);
}

export function reviewInboxDuplicateKey(item: ReviewInboxDuplicateCandidate): string {
  const actionKind = normalizeText(item.action_kind);
  const payload = {
    action_kind: actionKind,
    title: normalizeText(item.title),
    rationale: normalizeText(item.rationale),
    command: normalizeText(item.command ?? ""),
    required_refs: actionKind === "narrow_review" ? [] : normalizeStrings(item.required_refs),
    would_write: normalizeStrings(item.would_write)
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 12);
  return `review_inbox_duplicate_${hash}`;
}

function groupReviewInboxDuplicates<T extends ReviewInboxDuplicateCandidate>(
  items: T[]
): Map<string, ReviewInboxDuplicateGroup> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = reviewInboxDuplicateKey(item);
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  const groups = new Map<string, ReviewInboxDuplicateGroup>();
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort(compareCanonicalCandidates);
    const canonical = sorted[0];
    if (!canonical) continue;
    const itemIds = sorted.map((item) => item.id);
    const itemRefs = sorted.map((item) => reviewInboxItemRef(item.id));
    groups.set(key, {
      key,
      canonical_id: canonical.id,
      canonical_ref: reviewInboxItemRef(canonical.id),
      duplicate_count: Math.max(0, sorted.length - 1),
      item_ids: itemIds,
      item_refs: itemRefs,
      duplicate_ids: itemIds.filter((id) => id !== canonical.id),
      duplicate_refs: itemRefs.filter((ref) => ref !== reviewInboxItemRef(canonical.id))
    });
  }
  return groups;
}

function compareCanonicalCandidates(
  left: ReviewInboxDuplicateCandidate,
  right: ReviewInboxDuplicateCandidate
): number {
  return duplicatePriority(right) - duplicatePriority(left)
    || duplicateSortTime(right).localeCompare(duplicateSortTime(left))
    || left.id.localeCompare(right.id);
}

function duplicatePriority(item: ReviewInboxDuplicateCandidate): number {
  if (item.status === "confirmation_requested") return 50;
  if (item.latest_decision?.status === "open") return 45;
  if (!item.latest_decision && item.status === "open") return 40;
  if (item.latest_decision?.status === "deferred") return 20;
  return 10;
}

function duplicateSortTime(item: ReviewInboxDuplicateCandidate): string {
  return item.latest_decision?.created_at ?? item.updated_at ?? item.created_at ?? "";
}

function reviewInboxItemRef(id: string): string {
  return `autonomy/inbox/${id}.json`;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeStrings(values: readonly unknown[] | undefined): string[] {
  return (values ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeText(value))
    .sort();
}
