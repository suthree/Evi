import { basename } from "node:path";
import { getCapabilityCatalog } from "./capabilities.js";
import { getOpportunityBacklog, type OpportunityBacklogItem } from "./opportunity_backlog.js";
import { evidenceEventSchema } from "./schemas.js";
import {
  listSelfEvolutionIterations,
  type SelfEvolutionIterationContract
} from "./self_evolution_iterations.js";
import { AgentStore } from "./store.js";
import { newId, utcNow } from "./ids.js";

export type DreamAxisStatus = "active" | "emerging" | "planned";

export interface DreamAxis {
  id: string;
  title: string;
  status: DreamAxisStatus;
  summary: string;
  evidence_refs: string[];
  next_moves: string[];
}

export interface DreamHorizon {
  id: "near" | "next" | "later";
  title: string;
  objective: string;
  success_criteria: string[];
}

export interface DreamIterationOutcomeContext {
  iteration_ref: string;
  status: string;
  summary: string;
  evidence_refs: string[];
  next_moves: string[];
  recorded_at: string;
}

export interface DreamSnapshot {
  schema_version: 1;
  id: string;
  action_type: "dream_snapshot";
  status: "active";
  title: string;
  summary: string;
  created_at: string;
  source_refs: string[];
  semantic_memory_refs: string[];
  backlog_refs: string[];
  latest_iteration_outcome?: DreamIterationOutcomeContext;
  axes: DreamAxis[];
  horizons: DreamHorizon[];
  non_goals: string[];
  boundary: string;
}

export interface DreamSnapshotSummary {
  dream_ref: string;
  id: string;
  status: "active";
  title: string;
  summary: string;
  created_at: string;
  axis_count: number;
  horizon_count: number;
  source_refs: string[];
}

export interface DreamSnapshotResult {
  dream_ref: string;
  dream_markdown_ref: string;
  evidence_event_id: string;
  dream: DreamSnapshot;
}

export interface DreamSnapshotListResult {
  action: "dreams";
  count: number;
  dream_refs: string[];
  dreams: DreamSnapshotSummary[];
}

export type DreamLatestOutcomeFreshness = "current" | "stale" | "missing";

export interface DreamFreshnessResult {
  status: DreamLatestOutcomeFreshness;
  latest_dream_ref: string | null;
  dream_iteration_ref: string | null;
  dream_outcome_recorded_at: string | null;
  latest_verified_iteration_ref: string | null;
  latest_verified_outcome_recorded_at: string | null;
  refresh_command: string;
  boundary: string;
}

export async function createDreamSnapshot(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<DreamSnapshotResult> {
  await store.ensureLayout();
  const [semanticMemories, backlog, catalog, iterations] = await Promise.all([
    listAcceptedSemanticMemoryRefs(store),
    getOpportunityBacklog(store, { limit: args.limit ?? 5 }),
    Promise.resolve(getCapabilityCatalog()),
    listSelfEvolutionIterations(store)
  ]);
  const delegationRefs = [
    "packages/core/src/action_contracts.ts",
    "packages/runtime/src/runner.ts",
    "tests/context_harness.test.ts"
  ];
  const iterationRefs = iterations.iteration_refs.slice(0, 5);
  const latestIterationOutcome = latestIterationOutcomeContext(iterations.iterations);
  const sourceRefs = compactRefs([
    ...semanticMemories.map((memory) => memory.ref),
    ...iterationRefs,
    latestIterationOutcome?.iteration_ref,
    ...backlog.item_refs.slice(0, 5),
    "packages/core/src/capabilities.ts",
    ...delegationRefs,
    "docs/RUNTIME_CONTRACT.md"
  ]);
  const dream: DreamSnapshot = {
    schema_version: 1,
    id: newId("dream"),
    action_type: "dream_snapshot",
    status: "active",
    title: "Core self-evolution long-horizon plan",
    summary: [
      "Keep XingZhe focused on recurring GA project design, runtime self-evolution, SOP-to-skill persistence, semantic memory, dream planning, and bounded general-agent delegation.",
      "Treat external tools as application slices unless they become reusable runtime contracts."
    ].join(" "),
    created_at: utcNow(),
    source_refs: sourceRefs,
    semantic_memory_refs: semanticMemories.map((memory) => memory.ref),
    backlog_refs: backlog.item_refs.slice(0, 5),
    latest_iteration_outcome: latestIterationOutcome,
    axes: buildAxes(
      semanticMemories.map((memory) => memory.ref),
      iterationRefs,
      backlog.items.slice(0, 5),
      catalog.count,
      delegationRefs
    ),
    horizons: buildHorizons(),
    non_goals: [
      "Do not promote Nasdaq, Xiaohongshu MCP, or any single external adapter into core capability by default.",
      "Do not execute backlog work, external writes, service changes, SOP promotion, or skill promotion from a dream snapshot.",
      "Do not treat dream snapshots as completion evidence for the active goal."
    ],
    boundary: "local state dream snapshot; deterministic bounded planning context only; no model call, external write, service control, repo write, active-vault write, SOP promotion, skill promotion, or backlog execution"
  };
  const root = `memory/dreams/${dream.id}`;
  const dreamRef = await store.writeJson(`${root}.json`, dream);
  const dreamMarkdownRef = await store.writeText(`${root}.md`, renderDreamMarkdown(dream));
  const event = evidenceEventSchema.parse({
    session_id: dream.id,
    turn_id: dream.id,
    kind: "report",
    summary: `Recorded dream snapshot: ${dream.title}`,
    artifact_refs: compactRefs([dreamRef, dreamMarkdownRef, ...sourceRefs])
  });
  await store.appendJsonl("memory/episodes/events.jsonl", event);
  return {
    dream_ref: dreamRef,
    dream_markdown_ref: dreamMarkdownRef,
    evidence_event_id: event.id,
    dream
  };
}

function latestIterationOutcomeContext(
  iterations: SelfEvolutionIterationContract[]
): DreamIterationOutcomeContext | undefined {
  const iteration = latestVerifiedIteration(iterations);
  if (!iteration?.outcome) return undefined;
  return {
    iteration_ref: iteration.ref,
    status: iteration.outcome.status,
    summary: iteration.outcome.summary,
    evidence_refs: iteration.outcome.evidence_refs,
    next_moves: iteration.outcome.next_moves,
    recorded_at: iteration.outcome.recorded_at
  };
}

export async function getDreamFreshness(store: AgentStore): Promise<DreamFreshnessResult> {
  const [dreams, iterations] = await Promise.all([
    listLatestDreamSnapshots(store, 1),
    listSelfEvolutionIterations(store)
  ]);
  const dream = dreams[0];
  const latestVerified = latestVerifiedIteration(iterations.iterations);
  const dreamOutcome = dream?.latest_iteration_outcome;
  return {
    status: dreamFreshnessStatus(dream, latestVerified),
    latest_dream_ref: dream?.ref ?? null,
    dream_iteration_ref: dreamOutcome?.iteration_ref ?? null,
    dream_outcome_recorded_at: dreamOutcome?.recorded_at ?? null,
    latest_verified_iteration_ref: latestVerified?.ref ?? null,
    latest_verified_outcome_recorded_at: latestVerified?.outcome?.recorded_at ?? null,
    refresh_command: "pnpm run runtime -- memory dream --state-root <state-root>",
    boundary: "read-only same-state-root dream freshness; compares bounded dream and iteration outcome metadata only; does not generate dreams, invoke models, reconcile state roots, or mutate state"
  };
}

function dreamFreshnessStatus(
  dream: (DreamSnapshot & { ref: string }) | undefined,
  latestVerified: SelfEvolutionIterationContract | undefined
): DreamLatestOutcomeFreshness {
  if (!dream) return "missing";
  const latestOutcome = latestVerified?.outcome;
  if (!latestOutcome) return dream.latest_iteration_outcome ? "stale" : "current";
  const dreamOutcome = dream.latest_iteration_outcome;
  if (!dreamOutcome) return "stale";
  return dreamOutcome.iteration_ref === latestVerified.ref
    && dreamOutcome.status === latestOutcome.status
    && dreamOutcome.recorded_at === latestOutcome.recorded_at
    ? "current"
    : "stale";
}

function latestVerifiedIteration(
  iterations: SelfEvolutionIterationContract[]
): SelfEvolutionIterationContract | undefined {
  return iterations
    .filter((iteration) => iteration.outcome?.status === "verified")
    .sort((left, right) => (right.outcome?.recorded_at ?? "").localeCompare(left.outcome?.recorded_at ?? ""))[0];
}

export async function listDreamSnapshots(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<DreamSnapshotListResult> {
  await store.ensureLayout();
  const dreams: DreamSnapshotSummary[] = [];
  for (const ref of await dreamRefs(store)) {
    const dream = await readDream(store, ref);
    if (dream) dreams.push(toSummary(ref, dream));
  }
  const selected = dreams
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, args.limit ?? dreams.length);
  return {
    action: "dreams",
    count: selected.length,
    dream_refs: selected.map((dream) => dream.dream_ref),
    dreams: selected
  };
}

export async function getDreamSnapshot(
  store: AgentStore,
  args: { dreamRef: string }
): Promise<{ action: "dreams"; dream_ref: string; dream: DreamSnapshot }> {
  await store.ensureLayout();
  const dreamRef = await resolveDreamRef(store, args.dreamRef);
  const dream = await readDream(store, dreamRef);
  if (!dream) throw new Error(`Dream snapshot not found or invalid: ${dreamRef}`);
  return {
    action: "dreams",
    dream_ref: dreamRef,
    dream
  };
}

export async function listLatestDreamSnapshots(
  store: AgentStore,
  limit: number
): Promise<Array<DreamSnapshot & { ref: string }>> {
  const dreams: Array<DreamSnapshot & { ref: string }> = [];
  for (const ref of await dreamRefs(store)) {
    const dream = await readDream(store, ref);
    if (dream) dreams.push({ ...dream, ref });
  }
  return dreams
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}

function buildAxes(
  semanticRefs: string[],
  iterationRefs: string[],
  backlogItems: OpportunityBacklogItem[],
  capabilityCount: number,
  delegationRefs: string[]
): DreamAxis[] {
  const backlogRefs = backlogItems.map((item) => item.ref);
  const delegationActive = delegationRefs.length > 0;
  return [
    {
      id: "core_ga_design",
      title: "Core GA project design",
      status: "active",
      summary: `Capability catalog currently exposes ${capabilityCount} bounded capabilities; keep design work centered on reusable runtime contracts and GA delivery loops.`,
      evidence_refs: compactRefs(["packages/core/src/capabilities.ts", ...semanticRefs, ...iterationRefs]),
      next_moves: [
        "Make every major iteration state its core/basic/application layer before implementation.",
        "Prefer capability-contract changes over one-off external-tool glue when both solve the same recurring problem."
      ]
    },
    {
      id: "basic_runtime_substrate",
      title: "Basic runtime substrate",
      status: "active",
      summary: "CLI, resident runtime, service health, working checkpoints, context read models, and explicit gates remain the substrate for core evolution.",
      evidence_refs: ["docs/RUNTIME_CONTRACT.md"],
      next_moves: [
        "Keep resident/read-only surfaces observable before adding more mutation paths.",
        "Restart and health-check resident runtime after runtime-contract changes."
      ]
    },
    {
      id: "sop_skill_memory_loop",
      title: "SOP, skill, and memory loop",
      status: semanticRefs.length > 0 ? "active" : "emerging",
      summary: "Operator corrections should become gaps, audited SOPs, promoted skills, and accepted semantic memory when they prove reusable.",
      evidence_refs: semanticRefs,
      next_moves: [
        "Use accepted semantic memory as the guardrail for future self-recognition.",
        "Keep duplicate skill detection strict enough to avoid blocking genuinely new SOPs."
      ]
    },
    {
      id: "dream_planning",
      title: "Dream planning",
      status: iterationRefs.length > 0 ? "active" : "emerging",
      summary: "Dream snapshots convert accepted memory, self-evolution iteration contracts, and backlog pressure into bounded long-horizon direction without executing the plan.",
      evidence_refs: compactRefs(["memory/dreams", ...iterationRefs]),
      next_moves: [
        "Refresh the dream after major accepted memories or capability-layer changes.",
        "Use the latest dream as context, not as proof that work is complete."
      ]
    },
    {
      id: "general_agent_delegation",
      title: "General agent delegation",
      status: delegationActive ? "active" : "planned",
      summary: delegationActive
        ? "delegate_agent is the current bounded subtask path; execution and completion remain with the main harness."
        : "General delegation should exist before expert specialization or multi-agent scheduling.",
      evidence_refs: compactRefs([...delegationRefs, ...backlogRefs]),
      next_moves: [
        delegationActive
          ? "Harden delegate task, context, result, and verification boundaries."
          : "Define delegate_agent contracts before adding expert personas.",
        "Require main-thread verification before delegated output can close a task."
      ]
    }
  ];
}

function buildHorizons(): DreamHorizon[] {
  return [
    {
      id: "near",
      title: "Near horizon",
      objective: "Keep core/basic capability classification and semantic-memory guardrails stable during each iteration.",
      success_criteria: [
        "capability catalog exposes layer boundaries",
        "accepted semantic memory records reusable self-recognition decisions",
        "runtime checks pass after each core contract change"
      ]
    },
    {
      id: "next",
      title: "Next horizon",
      objective: "Make GA project design a repeatable runtime loop from goal intake to verified delivery and durable learning.",
      success_criteria: [
        "operator corrections can become backlog gaps",
        "audited SOPs can promote to skills without false duplicate reuse",
        "dream snapshots summarize long-horizon direction from durable memory"
      ]
    },
    {
      id: "later",
      title: "Later horizon",
      objective: "Evolve from a stable general local agent into later expert specialization and bounded multi-agent orchestration.",
      success_criteria: [
        "the general delegation loop has explicit task, context, result, and verification boundaries",
        "expert roles have explicit contracts and side-effect boundaries before they are introduced",
        "delegated output remains advisory until verified by the main runtime",
        "application slices remain downstream validation scenarios, not the core identity"
      ]
    }
  ];
}

async function listAcceptedSemanticMemoryRefs(store: AgentStore): Promise<Array<{ ref: string; accepted_at: string }>> {
  const rows: Array<{ ref: string; accepted_at: string }> = [];
  for (const ref of (await store.listStateFiles("memory/semantic/accepted")).filter((item) => item.endsWith(".json"))) {
    const raw = await store.readStateJson<unknown>(ref);
    if (!isRecord(raw) || raw.action_type !== "semantic_memory" || raw.status !== "accepted") continue;
    rows.push({ ref, accepted_at: getString(raw.accepted_at) ?? "" });
  }
  return rows.sort((left, right) => right.accepted_at.localeCompare(left.accepted_at)).slice(0, 5);
}

async function dreamRefs(store: AgentStore): Promise<string[]> {
  return (await store.listStateFiles("memory/dreams")).filter((ref) => ref.endsWith(".json"));
}

async function readDream(store: AgentStore, ref: string): Promise<DreamSnapshot | null> {
  const raw = await store.readStateJson<unknown>(ref);
  return isDreamSnapshot(raw) ? raw : null;
}

async function resolveDreamRef(store: AgentStore, value: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || trimmed.startsWith("/")) {
    throw new Error(`Unsafe dream ref: ${value}`);
  }
  if (trimmed.startsWith("memory/dreams/") && trimmed.endsWith(".json")) return trimmed;
  if (trimmed.endsWith(".json") && basename(trimmed) === trimmed) return `memory/dreams/${trimmed}`;
  if (/^dream_[A-Za-z0-9_-]+$/.test(trimmed)) {
    for (const ref of await dreamRefs(store)) {
      const dream = await readDream(store, ref);
      if (dream?.id === trimmed) return ref;
    }
    throw new Error(`Dream snapshot not found: ${trimmed}`);
  }
  throw new Error(`Unsafe dream ref: ${value}`);
}

function renderDreamMarkdown(dream: DreamSnapshot): string {
  return [
    `# Dream Snapshot: ${dream.id}`,
    "",
    `- Title: ${dream.title}`,
    `- Status: ${dream.status}`,
    `- Created at: ${dream.created_at}`,
    `- Boundary: ${dream.boundary}`,
    "",
    "## Summary",
    "",
    dream.summary,
    "",
    ...(dream.latest_iteration_outcome ? [
      "## Latest Iteration Outcome",
      "",
      `- iteration: ${dream.latest_iteration_outcome.iteration_ref}`,
      `- status: ${dream.latest_iteration_outcome.status}`,
      `- summary: ${dream.latest_iteration_outcome.summary}`,
      ...dream.latest_iteration_outcome.next_moves.map((move) => `- next: ${move}`),
      ""
    ] : []),
    "## Axes",
    "",
    ...dream.axes.flatMap((axis) => [
      `### ${axis.title}`,
      "",
      `- status: ${axis.status}`,
      `- summary: ${axis.summary}`,
      ...axis.next_moves.map((move) => `- next: ${move}`),
      ""
    ]),
    "## Horizons",
    "",
    ...dream.horizons.flatMap((horizon) => [
      `### ${horizon.title}`,
      "",
      horizon.objective,
      "",
      ...horizon.success_criteria.map((criterion) => `- ${criterion}`),
      ""
    ]),
    "## Non-goals",
    "",
    ...dream.non_goals.map((item) => `- ${item}`),
    "",
    "## Source Refs",
    "",
    ...dream.source_refs.map((ref) => `- ${ref}`),
    ""
  ].join("\n");
}

function toSummary(ref: string, dream: DreamSnapshot): DreamSnapshotSummary {
  return {
    dream_ref: ref,
    id: dream.id,
    status: dream.status,
    title: dream.title,
    summary: dream.summary,
    created_at: dream.created_at,
    axis_count: dream.axes.length,
    horizon_count: dream.horizons.length,
    source_refs: dream.source_refs
  };
}

function isDreamSnapshot(value: unknown): value is DreamSnapshot {
  return isRecord(value)
    && value.schema_version === 1
    && value.action_type === "dream_snapshot"
    && value.status === "active"
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.summary === "string"
    && typeof value.created_at === "string"
    && Array.isArray(value.axes)
    && Array.isArray(value.horizons)
    && Array.isArray(value.source_refs);
}

function compactRefs(refs: Array<string | null | undefined>): string[] {
  return [...new Set(refs.map((ref) => ref?.trim()).filter((ref): ref is string => Boolean(ref)))];
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
