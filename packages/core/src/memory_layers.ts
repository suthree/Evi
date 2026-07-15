import { existsSync } from "node:fs";
import { getDreamFreshness } from "./dreams.js";
import {
  selectedSkillUsageOutcomeSchema,
  workingCheckpointSchema
} from "./schemas.js";
import type { AgentStore } from "./store.js";

const BOUNDARY = "read-only memory layer diagnostic; reads local state metadata and bounded JSON/JSONL records only; does not sync indexes, read raw episode artifacts, render semantic memory content, mutate state, invoke the model, or execute confirmations";

type LayerStatus = "empty" | "active" | "needs_attention" | "diagnostic_only";
type ContextRole = "selected_context" | "on_demand_recall" | "governance_context" | "recall_quality_signal" | "diagnostic_only";
type CountValue = string | number | boolean | null;

export interface MemoryLayerSummary {
  id: string;
  title: string;
  status: LayerStatus;
  context_role: ContextRole;
  selected_for_context: boolean;
  state_refs: string[];
  commands: string[];
  counts: Record<string, CountValue>;
  context_policy: string;
  recommendations: string[];
}

export interface MemoryLayerDiagnosticResult {
  action: "layers";
  repo_root: string;
  state_root: string;
  boundary: typeof BOUNDARY;
  layers: MemoryLayerSummary[];
  context_entry: {
    selected_context_layers: string[];
    governance_context_layers: string[];
    on_demand_layers: string[];
    diagnostic_only_layers: string[];
    attention_layer_ids: string[];
    notes: string[];
    recommended_commands: string[];
  };
}

interface EpisodeStats {
  source_ref: string;
  source_exists: boolean;
  total_rows: number;
  valid_events: number;
  skipped_rows: number;
  sessions: number;
  first_event_at: string | null;
  last_event_at: string | null;
  top_kinds: string;
}

export async function getMemoryLayerDiagnostics(store: AgentStore): Promise<MemoryLayerDiagnosticResult> {
  const [
    episodeStats,
    semanticLayer,
    governanceLayer,
    workingLayer,
    dreamLayer,
    archivesLayer,
    skillOutcomeLayer
  ] = await Promise.all([
    readEpisodeLayer(store),
    readSemanticMemoryLayer(store),
    readGovernanceQueueLayer(store),
    readWorkingCheckpointLayer(store),
    readDreamLayer(store),
    readArchiveLayer(store),
    readSelectedSkillOutcomeLayer(store)
  ]);
  const layers = [
    episodeStats,
    semanticLayer,
    governanceLayer,
    workingLayer,
    dreamLayer,
    archivesLayer,
    skillOutcomeLayer
  ];
  return {
    action: "layers",
    repo_root: store.repoRoot,
    state_root: store.stateRoot,
    boundary: BOUNDARY,
    layers,
    context_entry: {
      selected_context_layers: layers.filter((layer) => layer.context_role === "selected_context" && layer.selected_for_context).map((layer) => layer.id),
      governance_context_layers: layers.filter((layer) => layer.context_role === "governance_context" && layer.selected_for_context).map((layer) => layer.id),
      on_demand_layers: layers.filter((layer) => layer.context_role === "on_demand_recall" || layer.context_role === "recall_quality_signal").map((layer) => layer.id),
      diagnostic_only_layers: layers.filter((layer) => layer.context_role === "diagnostic_only").map((layer) => layer.id),
      attention_layer_ids: layers.filter((layer) => layer.status === "needs_attention").map((layer) => layer.id),
      notes: [
        "Spend prompt budget on selected semantic memory, dream snapshots, current working checkpoint, and bounded governance queue only.",
        "Keep episode events, archives, and selected-skill outcomes as on-demand or ranking signals unless a command asks for details."
      ],
      recommended_commands: unique(layers.flatMap((layer) => layer.recommendations))
    }
  };
}

async function readEpisodeLayer(store: AgentStore): Promise<MemoryLayerSummary> {
  const stats = await readEpisodeStats(store);
  const indexRef = "memory/index/episodes.sqlite";
  const indexExists = existsSync(store.statePath(indexRef));
  const recommendations = [
    ...(stats.skipped_rows > 0 ? ["pnpm run runtime -- memory status --state-root <state-root>"] : []),
    ...(!indexExists && stats.valid_events > 0 ? ["pnpm run runtime -- memory sync --state-root <state-root>"] : [])
  ];
  return {
    id: "episode_recall",
    title: "Episode recall",
    status: stats.valid_events > 0 ? "active" : "empty",
    context_role: "on_demand_recall",
    selected_for_context: false,
    state_refs: [stats.source_ref, indexRef],
    commands: [
      "pnpm run runtime -- memory status --state-root <state-root>",
      "pnpm run runtime -- memory search --query <query> --state-root <state-root>",
      "pnpm run runtime -- memory session --session <id> --state-root <state-root>"
    ],
    counts: {
      source_exists: stats.source_exists,
      total_rows: stats.total_rows,
      valid_events: stats.valid_events,
      skipped_rows: stats.skipped_rows,
      sessions: stats.sessions,
      index_exists: indexExists,
      first_event_at: stats.first_event_at,
      last_event_at: stats.last_event_at,
      top_kinds: stats.top_kinds
    },
    context_policy: "Task-driven recall may select a bounded number of episode summaries; raw episode artifacts stay out of context.",
    recommendations
  };
}

async function readSemanticMemoryLayer(store: AgentStore): Promise<MemoryLayerSummary> {
  const refs = await jsonRefs(store, "memory/semantic/accepted");
  let valid = 0;
  let latestAcceptedAt: string | null = null;
  for (const ref of refs) {
    const record = await readRecord(store, ref);
    if (record?.status !== "accepted") continue;
    valid += 1;
    latestAcceptedAt = maxString(latestAcceptedAt, getString(record.accepted_at));
  }
  return {
    id: "semantic_memory",
    title: "Semantic memory",
    status: valid > 0 ? "active" : "empty",
    context_role: "selected_context",
    selected_for_context: valid > 0,
    state_refs: ["memory/semantic/accepted"],
    commands: [
      "pnpm run runtime -- memory accepted --state-root <state-root>",
      "pnpm run runtime -- memory accepted --semantic <ref-or-id> --state-root <state-root>"
    ],
    counts: {
      accepted_files: refs.length,
      accepted_valid: valid,
      latest_accepted_at: latestAcceptedAt
    },
    context_policy: "The turn context selects the newest accepted semantic memories only; accepted content is not rendered by this diagnostic.",
    recommendations: valid > 5 ? ["pnpm run runtime -- memory accepted --state-root <state-root>"] : []
  };
}

async function readGovernanceQueueLayer(store: AgentStore): Promise<MemoryLayerSummary> {
  const candidateRefs = await jsonRefs(store, "memory/semantic/candidates");
  const confirmationRefs = await jsonRefs(store, "memory/semantic/confirmations");
  let pendingConfirmations = 0;
  let executedConfirmations = 0;
  for (const ref of confirmationRefs) {
    const record = await readRecord(store, ref);
    if (record?.status === "pending") pendingConfirmations += 1;
    else if (record?.status === "executed") executedConfirmations += 1;
  }
  const pendingCandidates = await countRecords(candidateRefs, store, (record) => record.status !== "accepted");
  const needsAttention = pendingCandidates > 0 || pendingConfirmations > 0;
  return {
    id: "memory_governance_queue",
    title: "Memory governance queue",
    status: needsAttention ? "needs_attention" : "empty",
    context_role: "governance_context",
    selected_for_context: needsAttention,
    state_refs: ["memory/semantic/candidates", "memory/semantic/confirmations"],
    commands: [
      "pnpm run runtime -- memory candidates --state-root <state-root>",
      "pnpm run runtime -- memory confirmations --state-root <state-root>"
    ],
    counts: {
      candidate_files: candidateRefs.length,
      pending_candidates: pendingCandidates,
      confirmation_files: confirmationRefs.length,
      pending_confirmations: pendingConfirmations,
      executed_confirmations: executedConfirmations
    },
    context_policy: "Pending candidates and confirmations can appear as bounded governance queue context, but they are not durable memory until explicitly accepted.",
    recommendations: needsAttention
      ? ["pnpm run runtime -- memory candidates --state-root <state-root>", "pnpm run runtime -- memory confirmations --state-root <state-root>"]
      : []
  };
}

async function readWorkingCheckpointLayer(store: AgentStore): Promise<MemoryLayerSummary> {
  const refs = await jsonRefs(store, "memory/working");
  let valid = 0;
  let currentExists = false;
  let openQuestions = 0;
  let knownConstraints = 0;
  let recentEvidenceRefs = 0;
  let currentStep: string | null = null;
  let nextAction: string | null = null;
  for (const ref of refs) {
    const parsed = workingCheckpointSchema.safeParse(await readStateJsonSafe(store, ref));
    if (!parsed.success) continue;
    valid += 1;
    if (ref === "memory/working/current.json") {
      currentExists = true;
      openQuestions = parsed.data.open_questions.length;
      knownConstraints = parsed.data.known_constraints.length;
      recentEvidenceRefs = parsed.data.recent_evidence_refs.length;
      currentStep = parsed.data.current_step;
      nextAction = parsed.data.next_action;
    }
  }
  const blockedSignal = hasBlockedSignal(currentStep, nextAction);
  const needsAttention = currentExists && (openQuestions > 0 || blockedSignal);
  return {
    id: "working_checkpoint",
    title: "Working checkpoint",
    status: needsAttention ? "needs_attention" : currentExists ? "active" : "empty",
    context_role: "selected_context",
    selected_for_context: currentExists,
    state_refs: ["memory/working/current.json", "memory/working"],
    commands: [
      "pnpm run runtime -- memory working --state-root <state-root>",
      "pnpm run runtime -- memory working --checkpoint memory/working/current.json --state-root <state-root>"
    ],
    counts: {
      checkpoint_files: refs.length,
      valid_checkpoints: valid,
      current_exists: currentExists,
      current_open_questions: openQuestions,
      current_known_constraints: knownConstraints,
      current_recent_evidence_refs: recentEvidenceRefs,
      blocked_signal: blockedSignal
    },
    context_policy: "The latest current checkpoint enters turn context as continuity, not as proof that work is complete.",
    recommendations: needsAttention ? ["pnpm run runtime -- memory working --state-root <state-root>"] : []
  };
}

async function readDreamLayer(store: AgentStore): Promise<MemoryLayerSummary> {
  const freshness = await getDreamFreshness(store);
  const refs = await jsonRefs(store, "memory/dreams");
  let valid = 0;
  let latestCreatedAt: string | null = null;
  for (const ref of refs) {
    const record = await readRecord(store, ref);
    if (record?.action_type !== "dream_snapshot" || record.status !== "active") continue;
    valid += 1;
    latestCreatedAt = maxString(latestCreatedAt, getString(record.created_at));
  }
  return {
    id: "dreams",
    title: "Dream snapshots",
    status: dreamLayerStatus(valid, freshness.status),
    context_role: "selected_context",
    selected_for_context: valid > 0,
    state_refs: ["memory/dreams"],
    commands: [
      "pnpm run runtime -- memory dream --state-root <state-root>",
      "pnpm run runtime -- memory dreams --state-root <state-root>"
    ],
    counts: {
      dream_files: refs.length,
      dream_valid: valid,
      latest_created_at: latestCreatedAt,
      latest_outcome_freshness: freshness.status,
      latest_dream_ref: freshness.latest_dream_ref,
      dream_iteration_ref: freshness.dream_iteration_ref,
      latest_verified_iteration_ref: freshness.latest_verified_iteration_ref,
      latest_verified_outcome_recorded_at: freshness.latest_verified_outcome_recorded_at
    },
    context_policy: "The turn context may select the newest dream snapshots as long-horizon direction; dreams are not execution plans or completion evidence.",
    recommendations: freshness.status === "current" ? [] : [freshness.refresh_command]
  };
}

function dreamLayerStatus(valid: number, freshness: "current" | "stale" | "missing"): LayerStatus {
  if (valid === 0) return "empty";
  return freshness === "current" ? "active" : "needs_attention";
}

async function readArchiveLayer(store: AgentStore): Promise<MemoryLayerSummary> {
  const refs = await jsonRefs(store, "memory/archives");
  let totalEvents = 0;
  let totalSessions = 0;
  let latestArchiveDate: string | null = null;
  for (const ref of refs) {
    const record = await readRecord(store, ref);
    totalEvents += getNumber(record?.event_count) ?? 0;
    totalSessions += getNumber(record?.session_count) ?? 0;
    latestArchiveDate = maxString(latestArchiveDate, getString(record?.date));
  }
  return {
    id: "episode_archives",
    title: "Episode archives",
    status: refs.length > 0 ? "diagnostic_only" : "empty",
    context_role: "diagnostic_only",
    selected_for_context: false,
    state_refs: ["memory/archives"],
    commands: [
      "pnpm run runtime -- memory archives --state-root <state-root>",
      "pnpm run runtime -- memory archive-health --state-root <state-root>"
    ],
    counts: {
      archive_files: refs.length,
      archived_events: totalEvents,
      archived_sessions: totalSessions,
      latest_archive_date: latestArchiveDate
    },
    context_policy: "Archives are long-horizon diagnostics and are inspected by explicit commands or backlog focus, not injected into normal turn context.",
    recommendations: refs.length > 0 ? ["pnpm run runtime -- memory archive-health --state-root <state-root>"] : []
  };
}

async function readSelectedSkillOutcomeLayer(store: AgentStore): Promise<MemoryLayerSummary> {
  const refs = await jsonRefs(store, "memory/skills/usage");
  let valid = 0;
  let passed = 0;
  let historicalAttention = 0;
  let latestSeenAt: string | null = null;
  const latestBySkill = new Map<string, { createdAt: string; needsAttention: boolean }>();
  const skillsWithHistoricalAttention = new Set<string>();
  for (const ref of refs) {
    const parsed = selectedSkillUsageOutcomeSchema.safeParse(await readStateJsonSafe(store, ref));
    if (!parsed.success) continue;
    valid += 1;
    latestSeenAt = maxString(latestSeenAt, parsed.data.created_at);
    const needsAttention = !(
      parsed.data.verified
      && parsed.data.verification_status === "passed"
      && parsed.data.completion_status === "done"
    );
    if (!needsAttention) {
      passed += 1;
    } else {
      historicalAttention += 1;
      skillsWithHistoricalAttention.add(parsed.data.skill_name);
    }
    const latest = latestBySkill.get(parsed.data.skill_name);
    if (!latest || parsed.data.created_at > latest.createdAt) {
      latestBySkill.set(parsed.data.skill_name, {
        createdAt: parsed.data.created_at,
        needsAttention
      });
    }
  }
  const currentAttentionSkills = [...latestBySkill.entries()]
    .filter(([, outcome]) => outcome.needsAttention)
    .map(([skillName]) => skillName)
    .sort();
  const recoveredSkillCount = [...skillsWithHistoricalAttention]
    .filter((skillName) => latestBySkill.get(skillName)?.needsAttention === false)
    .length;
  return {
    id: "selected_skill_outcomes",
    title: "Selected skill outcomes",
    status: currentAttentionSkills.length > 0 ? "needs_attention" : valid > 0 ? "active" : "empty",
    context_role: "recall_quality_signal",
    selected_for_context: false,
    state_refs: ["memory/skills/usage"],
    commands: [
      "pnpm run runtime -- skills outcomes --state-root <state-root>",
      "pnpm run runtime -- skills drifts --state-root <state-root>"
    ],
    counts: {
      outcome_files: refs.length,
      valid_outcomes: valid,
      passed_outcomes: passed,
      attention_outcomes: currentAttentionSkills.length,
      historical_attention_outcomes: historicalAttention,
      recovered_skill_count: recoveredSkillCount,
      attention_skills: currentAttentionSkills.join(","),
      latest_seen_at: latestSeenAt
    },
    context_policy: "Selected-skill outcomes tune future skill recall and backlog focus without injecting raw skill bodies, context Markdown, or final responses.",
    recommendations: currentAttentionSkills.length > 0
      ? ["pnpm run runtime -- skills outcomes --state-root <state-root>", "pnpm run runtime -- skills drifts --state-root <state-root>"]
      : []
  };
}

async function readEpisodeStats(store: AgentStore): Promise<EpisodeStats> {
  const sourceRef = "memory/episodes/events.jsonl";
  const raw = await store.readStateText(sourceRef);
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const sessions = new Set<string>();
  const kinds = new Map<string, number>();
  let validEvents = 0;
  let firstEventAt: string | null = null;
  let lastEventAt: string | null = null;
  for (const line of lines) {
    const parsed = parseJsonRecord(line);
    const summary = getString(parsed?.summary);
    if (!parsed || !summary?.trim()) continue;
    validEvents += 1;
    sessions.add(getString(parsed.session_id) ?? "unknown_session");
    const kind = getString(parsed.kind) ?? "unknown";
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    const createdAt = getString(parsed.created_at);
    if (createdAt) {
      firstEventAt = minString(firstEventAt, createdAt);
      lastEventAt = maxString(lastEventAt, createdAt);
    }
  }
  return {
    source_ref: sourceRef,
    source_exists: existsSync(store.statePath(sourceRef)),
    total_rows: lines.length,
    valid_events: validEvents,
    skipped_rows: lines.length - validEvents,
    sessions: sessions.size,
    first_event_at: firstEventAt,
    last_event_at: lastEventAt,
    top_kinds: renderTopKinds(kinds)
  };
}

async function jsonRefs(store: AgentStore, root: string): Promise<string[]> {
  return (await store.listStateFiles(root))
    .filter((ref) => ref.endsWith(".json"))
    .sort();
}

async function countRecords(
  refs: string[],
  store: AgentStore,
  predicate: (record: Record<string, unknown>) => boolean
): Promise<number> {
  let count = 0;
  for (const ref of refs) {
    const record = await readRecord(store, ref);
    if (record && predicate(record)) count += 1;
  }
  return count;
}

async function readRecord(store: AgentStore, ref: string): Promise<Record<string, unknown> | null> {
  return toRecord(await readStateJsonSafe(store, ref));
}

async function readStateJsonSafe(store: AgentStore, ref: string): Promise<unknown | null> {
  try {
    return await store.readStateJson<unknown>(ref);
  } catch {
    return null;
  }
}

function parseJsonRecord(line: string): Record<string, unknown> | null {
  try {
    return toRecord(JSON.parse(line) as unknown);
  } catch {
    return null;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function minString(left: string | null, right: string): string {
  return left === null || right.localeCompare(left) < 0 ? right : left;
}

function maxString(left: string | null, right: string | null): string | null {
  if (!right) return left;
  return left === null || right.localeCompare(left) > 0 ? right : left;
}

function renderTopKinds(kinds: Map<string, number>): string {
  return [...kinds.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(", ") || "none";
}

function hasBlockedSignal(currentStep: string | null, nextAction: string | null): boolean {
  return /\b(blocked|failed|not_done|unfinished|resume|stale|gap)\b/i.test(`${currentStep ?? ""}\n${nextAction ?? ""}`);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
