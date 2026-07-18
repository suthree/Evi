import { basename } from "node:path";
import {
  selectedSkillUsageOutcomeSchema,
  type SelectedSkillUsageOutcome
} from "./schemas.js";
import { slugify } from "./ids.js";
import { AgentStore } from "./store.js";

export interface SelectedSkillOutcomeHistorySummary {
  outcome_ref: string;
  id: string;
  session_id: string;
  turn_id: string;
  created_at: string;
  skill_name: string;
  instructions_ref: string;
  metadata_ref: string | null;
  source: string;
  score: number;
  completion_status: SelectedSkillUsageOutcome["completion_status"];
  verification_status: SelectedSkillUsageOutcome["verification_status"];
  verified: boolean;
  verdict: string;
  context_manifest_ref: string;
  completion_report_ref: string;
  final_response_ref: string | null;
  envelope_ref: string;
  registry_ok: boolean;
  use_count: number | null;
  registry_last_used_at: string | null;
  boundary: string;
}

export interface SelectedSkillOutcomeHistoryListResult {
  count: number;
  outcome_refs: string[];
  outcomes: SelectedSkillOutcomeHistorySummary[];
}

export interface SelectedSkillOutcomeHistoryDetailResult {
  outcome_ref: string;
  outcome: SelectedSkillUsageOutcome;
}

export type SelectedSkillDriftStatus = "drifted";

export interface SelectedSkillDriftSummary {
  id: string;
  skill_name: string;
  instructions_ref: string;
  metadata_ref: string | null;
  status: SelectedSkillDriftStatus;
  outcome_count: number;
  attention_count: number;
  failed_count: number;
  skipped_count: number;
  not_done_count: number;
  blocked_count: number;
  unverified_count: number;
  passed_count: number;
  latest_outcome_ref: string;
  latest_attention_outcome_ref: string;
  latest_completion_report_ref: string;
  latest_final_response_ref: string | null;
  attention_outcome_refs: string[];
  outcome_refs: string[];
  verdicts: string[];
  first_seen_at: string;
  latest_seen_at: string;
  use_count: number | null;
  registry_last_used_at: string | null;
  next_step: string;
}

export interface SelectedSkillDriftListResult {
  count: number;
  drift_refs: string[];
  drifts: SelectedSkillDriftSummary[];
}

export async function listSelectedSkillOutcomes(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<SelectedSkillOutcomeHistoryListResult> {
  await store.ensureLayout();
  const summaries = await readSelectedSkillOutcomeSummaries(store);
  const selected = summaries.slice(0, args.limit ?? summaries.length);
  return {
    count: selected.length,
    outcome_refs: selected.map((outcome) => outcome.outcome_ref),
    outcomes: selected
  };
}

export async function listSelectedSkillDrifts(
  store: AgentStore,
  args: { limit?: number; skillName?: string } = {}
): Promise<SelectedSkillDriftListResult> {
  await store.ensureLayout();
  const summaries = await readSelectedSkillOutcomeSummaries(store);
  const groups = new Map<string, SelectedSkillOutcomeHistorySummary[]>();
  for (const outcome of summaries) {
    if (args.skillName && outcome.skill_name !== args.skillName) continue;
    const existing = groups.get(outcome.skill_name) ?? [];
    existing.push(outcome);
    groups.set(outcome.skill_name, existing);
  }
  const drifts = [...groups.values()]
    .map(summarizeSelectedSkillDrift)
    .filter((drift): drift is SelectedSkillDriftSummary => drift !== null)
    .sort((left, right) =>
      right.attention_count - left.attention_count
      || right.latest_seen_at.localeCompare(left.latest_seen_at)
      || left.id.localeCompare(right.id)
    );
  const selected = drifts.slice(0, args.limit ?? drifts.length);
  return {
    count: selected.length,
    drift_refs: selected.map((drift) => drift.latest_attention_outcome_ref),
    drifts: selected
  };
}

export async function getSelectedSkillOutcome(
  store: AgentStore,
  args: { outcomeRef: string }
): Promise<SelectedSkillOutcomeHistoryDetailResult> {
  await store.ensureLayout();
  const resolved = await resolveSelectedSkillOutcomeRef(store, args.outcomeRef);
  const raw = await store.readStateJson<unknown>(resolved);
  const parsed = selectedSkillUsageOutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Selected skill outcome not found or invalid: ${resolved}`);
  }
  return {
    outcome_ref: resolved,
    outcome: parsed.data
  };
}

function summarizeSelectedSkillDrift(
  outcomes: SelectedSkillOutcomeHistorySummary[]
): SelectedSkillDriftSummary | null {
  if (outcomes.length === 0) return null;
  const sorted = [...outcomes].sort((left, right) =>
    right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id) || right.outcome_ref.localeCompare(left.outcome_ref)
  );
  const attention: SelectedSkillOutcomeHistorySummary[] = [];
  for (const outcome of sorted) {
    if (!needsSelectedSkillOutcomeAttention(outcome)) break;
    attention.push(outcome);
  }
  if (attention.length < 2) return null;

  const latest = sorted[0];
  const latestAttention = attention[0];
  if (!latest || !latestAttention) return null;

  const oldest = sorted[sorted.length - 1] ?? latest;
  return {
    id: `selected_skill_drift_${slugify(latest.skill_name)}`,
    skill_name: latest.skill_name,
    instructions_ref: latest.instructions_ref,
    metadata_ref: latest.metadata_ref,
    status: "drifted",
    outcome_count: sorted.length,
    attention_count: attention.length,
    failed_count: sorted.filter((outcome) => outcome.verification_status === "failed").length,
    skipped_count: sorted.filter((outcome) => outcome.verification_status === "skipped").length,
    not_done_count: sorted.filter((outcome) => outcome.completion_status === "not_done").length,
    blocked_count: sorted.filter((outcome) => outcome.completion_status === "blocked").length,
    unverified_count: sorted.filter((outcome) => !outcome.verified || outcome.verification_status !== "passed").length,
    passed_count: sorted.filter((outcome) => outcome.verified && outcome.verification_status === "passed").length,
    latest_outcome_ref: latest.outcome_ref,
    latest_attention_outcome_ref: latestAttention.outcome_ref,
    latest_completion_report_ref: latestAttention.completion_report_ref,
    latest_final_response_ref: latestAttention.final_response_ref,
    attention_outcome_refs: attention.map((outcome) => outcome.outcome_ref).slice(0, 5),
    outcome_refs: sorted.map((outcome) => outcome.outcome_ref).slice(0, 5),
    verdicts: unique(sorted.map((outcome) => outcome.verdict)).slice(0, 5),
    first_seen_at: oldest.created_at,
    latest_seen_at: latest.created_at,
    use_count: latestAttention.use_count,
    registry_last_used_at: latestAttention.registry_last_used_at,
    next_step: `Inspect repeated selected-skill outcomes for ${latest.skill_name} before proposing any skill revision.`
  };
}

function needsSelectedSkillOutcomeAttention(outcome: SelectedSkillOutcomeHistorySummary): boolean {
  return outcome.completion_status !== "done"
    || outcome.verification_status !== "passed"
    || outcome.verified !== true;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function readLatestSelectedSkillOutcomeSummaries(
  store: AgentStore,
  limit: number
): Promise<SelectedSkillOutcomeHistorySummary[]> {
  const summaries = await readSelectedSkillOutcomeSummaries(store);
  return summaries.slice(0, Math.max(0, limit));
}

export async function resolveSelectedSkillOutcomeRef(store: AgentStore, value: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--outcome requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe selected skill outcome ref: ${value}`);
  }
  const candidate = directSelectedSkillOutcomeRef(trimmed);
  if (candidate) {
    const raw = await store.readStateJson<unknown>(candidate);
    if (selectedSkillUsageOutcomeSchema.safeParse(raw).success) return candidate;
  }

  const byId = await findSelectedSkillOutcomeRef(store, trimmed);
  if (byId) return byId;

  return candidate ?? `memory/skills/usage/${trimmed}.json`;
}

function directSelectedSkillOutcomeRef(value: string): string | null {
  if (value.startsWith("memory/skills/usage/") && value.endsWith(".json")) return value;
  const base = basename(value);
  const file = base.endsWith(".json") ? base : `${base}.json`;
  if (file.includes("/")) return null;
  return `memory/skills/usage/${file}`;
}

async function findSelectedSkillOutcomeRef(store: AgentStore, value: string): Promise<string | null> {
  for (const ref of await selectedSkillOutcomeRefs(store)) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = selectedSkillUsageOutcomeSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (
      parsed.data.id === value
      || parsed.data.session_id === value
      || parsed.data.skill_name === value
    ) return ref;
  }
  return null;
}

async function readSelectedSkillOutcomeSummaries(store: AgentStore): Promise<SelectedSkillOutcomeHistorySummary[]> {
  const summaries: SelectedSkillOutcomeHistorySummary[] = [];
  for (const ref of await selectedSkillOutcomeRefs(store)) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = selectedSkillUsageOutcomeSchema.safeParse(raw);
    if (parsed.success) summaries.push(summarizeSelectedSkillOutcome(ref, parsed.data));
  }
  return summaries.sort((left, right) =>
    right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id) || right.outcome_ref.localeCompare(left.outcome_ref)
  );
}

async function selectedSkillOutcomeRefs(store: AgentStore): Promise<string[]> {
  return (await store.listStateFiles("memory/skills/usage"))
    .filter((ref) => ref.endsWith(".json"))
    .sort()
    .reverse();
}

function summarizeSelectedSkillOutcome(
  ref: string,
  outcome: SelectedSkillUsageOutcome
): SelectedSkillOutcomeHistorySummary {
  return {
    outcome_ref: ref,
    id: outcome.id,
    session_id: outcome.session_id,
    turn_id: outcome.turn_id,
    created_at: outcome.created_at,
    skill_name: outcome.skill_name,
    instructions_ref: outcome.instructions_ref,
    metadata_ref: outcome.metadata_ref,
    source: outcome.source,
    score: outcome.score,
    completion_status: outcome.completion_status,
    verification_status: outcome.verification_status,
    verified: outcome.verified,
    verdict: outcome.verdict,
    context_manifest_ref: outcome.context_manifest_ref,
    completion_report_ref: outcome.completion_report_ref,
    final_response_ref: outcome.final_response_ref,
    envelope_ref: outcome.envelope_ref,
    registry_ok: outcome.registry_update.ok,
    use_count: outcome.registry_update.use_count,
    registry_last_used_at: outcome.registry_update.last_used_at,
    boundary: outcome.boundary
  };
}
