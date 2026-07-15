import { basename } from "node:path";
import { AgentStore } from "./store.js";

export type ReviewTickHistoryMode = "recent" | "query" | "session";

export interface ReviewTickHistoryFocus {
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
    action_chain?: ReviewTickHistoryActionStep[];
  };
}

export interface ReviewTickHistoryActionStep {
  label: string;
  effect: string;
  reason?: string;
}

export interface ReviewTickHistoryRecord {
  id: string;
  mode: ReviewTickHistoryMode;
  query: string | null;
  session_id: string | null;
  created_at: string;
  focus: ReviewTickHistoryFocus;
  review_ref: string;
  review_markdown_ref?: string;
  proposal_count: number;
  inbox_item_refs: string[];
  inbox_items: Array<Record<string, unknown>>;
  stats: {
    new_items: number;
    updated_items: number;
  };
  artifact_refs: {
    json_ref: string;
    markdown_ref?: string;
  };
  evidence_event_id?: string;
}

export interface ReviewTickHistorySummary {
  tick_ref: string;
  id: string;
  mode: ReviewTickHistoryMode;
  query: string | null;
  session_id: string | null;
  created_at: string;
  focus: ReviewTickHistoryFocus;
  review_ref: string;
  proposal_count: number;
  inbox_count: number;
  new_items: number;
  updated_items: number;
  inbox_item_refs: string[];
  evidence_event_id?: string;
}

export interface ReviewTickHistoryListResult {
  count: number;
  tick_refs: string[];
  ticks: ReviewTickHistorySummary[];
}

export interface ReviewTickHistoryDetailResult {
  tick_ref: string;
  tick: ReviewTickHistoryRecord;
}

export async function listReviewTicks(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<ReviewTickHistoryListResult> {
  await store.ensureLayout();
  const refs = (await store.listStateFiles("autonomy/ticks"))
    .filter((ref) => ref.endsWith(".json"));
  const ticks: ReviewTickHistorySummary[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const tick = parseReviewTickRecord(raw);
    if (tick) ticks.push(summarizeReviewTick(ref, tick));
  }
  const selected = ticks
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
    .slice(0, args.limit ?? ticks.length);
  return {
    count: selected.length,
    tick_refs: selected.map((tick) => tick.tick_ref),
    ticks: selected
  };
}

export async function getReviewTick(
  store: AgentStore,
  args: { tickRef: string }
): Promise<ReviewTickHistoryDetailResult> {
  await store.ensureLayout();
  const tickRef = resolveReviewTickRef(args.tickRef);
  const raw = await store.readStateJson<unknown>(tickRef);
  const tick = parseReviewTickRecord(raw);
  if (!tick) throw new Error(`Review tick not found or invalid: ${tickRef}`);
  return {
    tick_ref: tickRef,
    tick
  };
}

export function resolveReviewTickRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--tick requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe review tick ref: ${value}`);
  }
  if (trimmed.startsWith("autonomy/ticks/") && trimmed.endsWith(".json")) return trimmed;
  const file = trimmed.endsWith(".json") ? basename(trimmed) : `${trimmed}.json`;
  return `autonomy/ticks/${file}`;
}

function summarizeReviewTick(ref: string, tick: ReviewTickHistoryRecord): ReviewTickHistorySummary {
  return {
    tick_ref: ref,
    id: tick.id,
    mode: tick.mode,
    query: tick.query,
    session_id: tick.session_id,
    created_at: tick.created_at,
    focus: tick.focus,
    review_ref: tick.review_ref,
    proposal_count: tick.proposal_count,
    inbox_count: tick.inbox_item_refs.length,
    new_items: tick.stats.new_items,
    updated_items: tick.stats.updated_items,
    inbox_item_refs: tick.inbox_item_refs,
    evidence_event_id: tick.evidence_event_id
  };
}

function parseReviewTickRecord(value: unknown): ReviewTickHistoryRecord | null {
  if (!isRecord(value)) return null;
  const id = stringField(value, "id");
  const mode = reviewTickModeField(value, "mode");
  const createdAt = stringField(value, "created_at");
  const focus = focusField(value.focus);
  const reviewRef = stringField(value, "review_ref");
  const proposalCount = numberField(value, "proposal_count");
  const stats = isRecord(value.stats) ? value.stats : null;
  const newItems = numberField(stats, "new_items");
  const updatedItems = numberField(stats, "updated_items");
  const artifactRefs = isRecord(value.artifact_refs) ? value.artifact_refs : null;
  const jsonRef = stringField(artifactRefs, "json_ref");
  if (
    !id
    || !mode
    || !createdAt
    || !focus
    || !reviewRef
    || proposalCount === null
    || newItems === null
    || updatedItems === null
    || !jsonRef
  ) return null;
  return {
    id,
    mode,
    query: stringField(value, "query"),
    session_id: stringField(value, "session_id"),
    created_at: createdAt,
    focus,
    review_ref: reviewRef,
    review_markdown_ref: stringField(value, "review_markdown_ref") ?? undefined,
    proposal_count: proposalCount,
    inbox_item_refs: stringArrayField(value.inbox_item_refs),
    inbox_items: recordArrayField(value.inbox_items),
    stats: {
      new_items: newItems,
      updated_items: updatedItems
    },
    artifact_refs: {
      json_ref: jsonRef,
      markdown_ref: stringField(artifactRefs, "markdown_ref") ?? undefined
    },
    evidence_event_id: stringField(value, "evidence_event_id") ?? undefined
  };
}

function focusField(value: unknown): ReviewTickHistoryFocus | null {
  if (!isRecord(value)) return null;
  const source = stringField(value, "source");
  const reason = stringField(value, "reason");
  if (!source || !reason) return null;
  const opportunity = opportunityField(value.opportunity);
  return {
    source,
    reason,
    query: stringField(value, "query"),
    opportunity: opportunity ?? undefined
  };
}

function opportunityField(value: unknown): ReviewTickHistoryFocus["opportunity"] | null {
  if (!isRecord(value)) return null;
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

function actionChainField(value: unknown): ReviewTickHistoryActionStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.flatMap((item): ReviewTickHistoryActionStep[] => {
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

function reviewTickModeField(record: Record<string, unknown>, key: string): ReviewTickHistoryMode | null {
  const value = record[key];
  return value === "recent" || value === "query" || value === "session" ? value : null;
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

function recordArrayField(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
