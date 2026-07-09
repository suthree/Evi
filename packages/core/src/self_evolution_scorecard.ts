import {
  getCapabilityCatalog,
  resolveCapabilityLayer,
  type CapabilityLayer
} from "./capabilities.js";
import { listLatestDreamSnapshots } from "./dreams.js";
import {
  deriveGaProjectDesignArtifacts,
  getGaProjectDesignContract
} from "./ga_project_design.js";
import { getMemoryLayerDiagnostics } from "./memory_layers.js";
import { getOpportunityBacklog } from "./opportunity_backlog.js";
import {
  listSelfEvolutionIterations,
  type SelfEvolutionIterationContract
} from "./self_evolution_iterations.js";
import type { SkillResolverLike } from "./skill_resolver.js";
import { getSopEvolutionLedger } from "./sop_evolution_ledger.js";
import type { AgentStore } from "./store.js";
import { utcNow } from "./ids.js";

export type SelfEvolutionStage = "stable" | "active" | "emerging" | "planned" | "attention";

export interface SelfEvolutionDimension {
  id: string;
  title: string;
  stage: SelfEvolutionStage;
  layer: CapabilityLayer | "cross_layer";
  score: number;
  summary: string;
  evidence_refs: string[];
  next_moves: string[];
  latest_iteration?: {
    id: string;
    ref: string;
    outcome_status: string;
  };
}

export interface SelfEvolutionExpertLens {
  id: string;
  title: string;
  status: "active" | "planned";
  focus: string;
  current_question: string;
  evidence_refs: string[];
}

export interface SelfEvolutionNextSlice {
  id: string;
  dimension_id: string;
  title: string;
  layer: CapabilityLayer | "cross_layer";
  priority: number;
  reason: string;
  success_criteria: string[];
  evidence_refs: string[];
}

export interface SelfEvolutionScorecard {
  schema_version: 1;
  action: "scorecard";
  created_at: string;
  status: "evolving";
  summary: string;
  dimensions: SelfEvolutionDimension[];
  expert_lenses: SelfEvolutionExpertLens[];
  default_next_slice: SelfEvolutionNextSlice | null;
  next_iterations: string[];
  next_slices: SelfEvolutionNextSlice[];
  next_core_basic_slice: SelfEvolutionNextSlice | null;
  refs: string[];
  boundary: string;
}

const BOUNDARY = "read-only self-evolution scorecard; reads local capability catalog, memory-layer diagnostics, dream snapshots, self-evolution iteration outcome metadata, SOP evolution ledger, and opportunity backlog metadata only; does not invoke models, execute tools, mutate state, write repo files, write the active vault, manage services, promote SOPs, promote skills, or prove completion";

export async function getSelfEvolutionScorecard(
  store: AgentStore,
  args: { limit?: number; vaultRoot?: SkillResolverLike } = {}
): Promise<SelfEvolutionScorecard> {
  await store.ensureLayout();
  const limit = args.limit ?? 5;
  const [catalog, memoryLayers, dreams, sopLedger, backlog, iterations] = await Promise.all([
    Promise.resolve(getCapabilityCatalog()),
    getMemoryLayerDiagnostics(store),
    listLatestDreamSnapshots(store, limit),
    getSopEvolutionLedger(store, { limit, vaultRoot: args.vaultRoot }),
    getOpportunityBacklog(store, { limit, vaultRoot: args.vaultRoot }),
    listSelfEvolutionIterations(store)
  ]);
  const layerCounts = countCapabilitiesByLayer(catalog);
  const acceptedSemantic = countLayer(memoryLayers, "semantic_memory", "accepted_valid");
  const hasAcceptedSemanticMemory = acceptedSemantic > 0;
  const hasSopDrafts = sopLedger.counts.sop_drafts.total > 0;
  const hasSkillEvents = sopLedger.counts.skill_events.total > 0;
  const validDreams = countLayer(memoryLayers, "dreams", "dream_valid");
  const dreamHasVerifiedOutcome = dreams.some((dream) => dream.latest_iteration_outcome?.status === "verified");
  const attentionLayers = memoryLayers.context_entry.attention_layer_ids;
  const delegated = catalog.categories
    .flatMap((category) => category.capabilities)
    .some((capability) => capability.id === "delegate_agent");
  const projectDesignContract = getGaProjectDesignContract();
  const projectDesignArtifacts = deriveGaProjectDesignArtifacts(iterations.iterations);
  const latestCoreBasicProjectDesignArtifactIteration = latestCoreBasicProjectDesignArtifactSource(iterations.iterations, projectDesignArtifacts);
  const latestOpenIteration = iterations.iterations.find((iteration) => isOpenCoreBasicIteration(iteration));
  const latestBlockingOpenIteration = latestOpenIteration && !isSupersededOpenIteration(latestOpenIteration, latestCoreBasicProjectDesignArtifactIteration)
    ? latestOpenIteration
    : undefined;
  const latestSupersededOpenIteration = latestOpenIteration && isSupersededOpenIteration(latestOpenIteration, latestCoreBasicProjectDesignArtifactIteration)
    ? latestOpenIteration
    : undefined;
  const latestBasicIteration = iterations.iterations.find((iteration) => iteration.layer === "basic_entrypoint");
  const latestBasicStatus = describeIterationOutcomeStatus(latestBasicIteration);
  const latestOutcomeIteration = iterations.iterations.find((iteration) => iteration.outcome);
  const latestOutcome = latestOutcomeIteration?.outcome;

  const dimensions: SelfEvolutionDimension[] = [
    {
      id: "core_ga_design",
      title: "Core GA project design",
      stage: layerCounts.core_runtime > 0 ? "active" : "emerging",
      layer: "core_runtime",
      score: clampScore(
        1
        + Math.min(1, layerCounts.core_runtime)
        + 1
        + (projectDesignArtifacts.length > 0 ? 1 : 0)
        + (latestOutcome?.status === "verified" ? 1 : 0)
      ),
      summary: projectDesignArtifacts.length > 0
        ? `Core identity is recurring GA project design through ${projectDesignContract.contract_id} and ${projectDesignArtifacts.length} derived project-design artifact(s); latest outcome is ${latestOutcome?.status ?? "not_recorded"}.`
        : latestOutcome
        ? `Core identity is recurring GA project design through ${projectDesignContract.contract_id}, bounded contracts, and iteration outcomes; latest outcome is ${latestOutcome.status}.`
        : "Core identity is recurring GA project design through bounded contracts, iteration-layer declarations, verification, and durable learning, not external adapter usage.",
      evidence_refs: compactRefs([
        "packages/core/src/ga_project_design.ts",
        "packages/core/src/capabilities.ts",
        ...projectDesignArtifacts.map((artifact) => artifact.source_iteration_ref),
        ...dreams.map((dream) => dream.ref),
        ...iterations.iteration_refs.slice(0, 2)
      ]),
      next_moves: [
        coreGaDesignNextMove(latestBlockingOpenIteration, latestSupersededOpenIteration, latestOutcome),
        "Use scorecard deltas to choose the next bounded core-runtime slice."
      ]
    },
    {
      id: "basic_runtime_substrate",
      title: "Basic runtime substrate",
      stage: attentionLayers.length > 0 ? "attention" : "active",
      layer: "basic_entrypoint",
      score: clampScore(1 + Math.min(2, layerCounts.basic_entrypoint) + (attentionLayers.length === 0 ? 2 : 1)),
      summary: latestBasicIteration
        ? `CLI, resident service, context, health, and operator surfaces are the substrate that lets core evolution stay observable; latest basic iteration is ${latestBasicIteration.id} with outcome ${latestBasicStatus}.`
        : "CLI, resident service, context, health, and operator surfaces are the substrate that lets core evolution stay observable.",
      evidence_refs: compactRefs([
        "docs/RUNTIME_CONTRACT.md",
        "packages/core/src/memory_layers.ts",
        latestBasicIteration?.ref
      ]),
      ...(latestBasicIteration
        ? {
          latest_iteration: {
            id: latestBasicIteration.id,
            ref: latestBasicIteration.ref,
            outcome_status: latestBasicStatus
          }
        }
        : {}),
      next_moves: [
        latestBasicIteration && !latestBasicIteration.outcome
          ? `Close the basic iteration outcome for ${latestBasicIteration.id} before treating basic substrate progress as verified.`
          : "Keep resident health and workspace status visible after runtime-contract changes.",
        "Reduce attention layers before adding new mutation surfaces."
      ]
    },
    {
      id: "sop_skill_memory_loop",
      title: "SOP, skill, and memory loop",
      stage: sopLedger.counts.skill_events.total > 0 ? "active" : sopLedger.counts.sop_drafts.total > 0 ? "emerging" : "planned",
      layer: "local_learning",
      score: clampScore(2 + (hasAcceptedSemanticMemory ? 1 : 0) + (hasSopDrafts ? 1 : 0) + (hasSkillEvents ? 1 : 0)),
      summary: hasAcceptedSemanticMemory && hasSopDrafts && hasSkillEvents
        ? "Reusable corrections have visible semantic memory, SOP draft, and skill-event evidence; promotion still stays behind explicit gates."
        : "Reusable corrections should become gaps, audited SOPs, promoted skills, and accepted semantic memory.",
      evidence_refs: compactRefs([
        "packages/core/src/sop_evolution_ledger.ts",
        "packages/runtime/src/memory_candidates.ts",
        ...sopLedger.refs.skill_event_refs.slice(0, 3)
      ]),
      next_moves: [
        "Turn repeated operator corrections into SOP candidates before adding application logic.",
        "Promote only audited SOPs with explicit active-vault gates."
      ]
    },
    {
      id: "memory_dream_direction",
      title: "Memory and dream direction",
      stage: acceptedSemantic > 0 && validDreams > 0 ? "active" : acceptedSemantic > 0 || validDreams > 0 ? "emerging" : "planned",
      layer: "local_learning",
      score: clampScore(1 + Math.min(2, acceptedSemantic) + Math.min(2, validDreams) + (dreamHasVerifiedOutcome ? 2 : 0)),
      summary: dreamHasVerifiedOutcome
        ? "Accepted memory and dreams preserve durable self-recognition, long-horizon direction, and the latest verified iteration outcome across turns."
        : "Accepted memory and dreams preserve durable self-recognition and long-horizon direction across turns.",
      evidence_refs: compactRefs([
        "packages/core/src/memory_layers.ts",
        "packages/core/src/dreams.ts",
        ...dreams.map((dream) => dream.ref)
      ]),
      next_moves: [
        "Refresh dreams after major accepted-memory or capability-layer changes.",
        "Keep dreams as context, not execution plans or completion proof."
      ]
    },
    {
      id: "general_agent_delegation",
      title: "General agent delegation loop",
      stage: delegated ? "active" : "planned",
      layer: "core_runtime",
      score: delegated ? 5 : 1,
      summary: delegated
        ? "delegate_agent is a bounded general-agent subtask path: the main thread delegates explicit read-only analysis, review, inspection, comparison, summarization, or evaluation to a tool-less, memory-less subagent, records structured output, feeds it back as observation, and keeps completion authority in the main harness."
        : "The runtime still needs a bounded general-agent delegation action before expert specialization or multi-agent scheduling can be considered.",
      evidence_refs: compactRefs([
        "packages/core/src/action_contracts.ts",
        "packages/core/src/delegate_agent_completion_gate.ts",
        "packages/core/src/delegate_agent_contract.ts",
        "packages/runtime/src/runner.ts",
        "tests/context_harness.test.ts",
        "docs/RUNTIME_CONTRACT.md"
      ]),
      next_moves: [
        "Harden delegate_agent task, context, result, and completion-verification boundaries before widening subagent authority.",
        "Keep expert personas and multi-agent scheduling deferred until the general delegation loop is stable."
      ]
    }
  ];
  const nextSlices = buildNextSlices(dimensions);
  const nextCoreBasicSlice = selectNextCoreBasicSlice(
    dimensions,
    nextSlices,
    Boolean(latestBlockingOpenIteration)
  );
  const defaultNextSlice = nextCoreBasicSlice ?? nextSlices[0] ?? null;

  return {
    schema_version: 1,
    action: "scorecard",
    created_at: utcNow(),
    status: "evolving",
    summary: "Self-evolution is currently judged first by durable core/basic capability growth and a bounded general-agent delegation baseline; SOP-to-skill persistence and memory/dream continuity remain gated follow-up layers.",
    dimensions,
    expert_lenses: buildExpertLenses(
      dimensions,
      backlog.item_refs.slice(0, limit),
      dreams.map((dream) => dream.ref),
      delegated
    ),
    default_next_slice: defaultNextSlice,
    next_iterations: [
      firstNextMove(dimensions, "core_ga_design"),
      firstNextMove(dimensions, "general_agent_delegation"),
      firstNextMove(dimensions, "basic_runtime_substrate")
    ],
    next_slices: nextSlices,
    next_core_basic_slice: nextCoreBasicSlice,
    refs: compactRefs([
      "packages/core/src/self_evolution_scorecard.ts",
      "packages/core/src/ga_project_design.ts",
      "packages/core/src/capabilities.ts",
      "packages/core/src/delegate_agent_completion_gate.ts",
      "packages/core/src/delegate_agent_contract.ts",
      "packages/runtime/src/runner.ts",
      "packages/core/src/self_evolution_iterations.ts",
      "packages/core/src/memory_layers.ts",
      "packages/core/src/dreams.ts",
      "packages/core/src/sop_evolution_ledger.ts",
      ...backlog.item_refs.slice(0, limit),
      ...iterations.iteration_refs.slice(0, limit),
      ...dreams.map((dream) => dream.ref)
    ]),
    boundary: BOUNDARY
  };
}

function selectNextCoreBasicSlice(
  dimensions: SelfEvolutionDimension[],
  nextSlices: SelfEvolutionNextSlice[],
  hasBlockingOpenIteration: boolean
): SelfEvolutionNextSlice | null {
  const coreBasicSlices = nextSlices.filter((slice) =>
    slice.layer === "core_runtime"
    || slice.layer === "basic_entrypoint"
  );
  const attentionSlice = coreBasicSlices.find((slice) => dimensionStage(dimensions, slice.dimension_id) === "attention");
  if (attentionSlice) return attentionSlice;
  if (hasBlockingOpenIteration) return coreBasicSlices[0] ?? null;

  const coreGaDesign = dimensions.find((dimension) => dimension.id === "core_ga_design");
  const delegation = dimensions.find((dimension) => dimension.id === "general_agent_delegation");
  const delegationSlice = coreBasicSlices.find((slice) => slice.dimension_id === "general_agent_delegation");
  if (delegationSlice && delegation?.stage === "active" && coreGaDesign?.stage === "active" && coreGaDesign.score >= 5) {
    return delegationSlice;
  }

  return coreBasicSlices[0] ?? null;
}

function dimensionStage(dimensions: SelfEvolutionDimension[], dimensionId: string): SelfEvolutionStage | undefined {
  return dimensions.find((dimension) => dimension.id === dimensionId)?.stage;
}

function latestCoreBasicProjectDesignArtifactSource(
  iterations: SelfEvolutionIterationContract[],
  artifacts: ReturnType<typeof deriveGaProjectDesignArtifacts>
): SelfEvolutionIterationContract | undefined {
  const latestArtifact = artifacts.find((artifact) =>
    artifact.layer === "core_runtime"
    || artifact.layer === "basic_entrypoint"
  );
  if (!latestArtifact) return undefined;
  return iterations.find((iteration) => iteration.ref === latestArtifact.source_iteration_ref);
}

function isOpenCoreBasicIteration(iteration: SelfEvolutionIterationContract): boolean {
  return !iteration.outcome
    && (iteration.layer === "core_runtime" || iteration.layer === "basic_entrypoint")
    && iteration.owner_surface === "ga_project_design";
}

function describeIterationOutcomeStatus(iteration: SelfEvolutionIterationContract | undefined): string {
  if (!iteration) return "none";
  return iteration.outcome?.status ?? "not_recorded";
}

function isSupersededOpenIteration(
  openIteration: SelfEvolutionIterationContract,
  latestArtifactIteration: SelfEvolutionIterationContract | undefined
): boolean {
  return Boolean(latestArtifactIteration && latestArtifactIteration.created_at > openIteration.created_at);
}

function coreGaDesignNextMove(
  blockingOpenIteration: SelfEvolutionIterationContract | undefined,
  supersededOpenIteration: SelfEvolutionIterationContract | undefined,
  latestOutcome: SelfEvolutionIterationContract["outcome"] | undefined
): string {
  if (blockingOpenIteration) {
    return `Close the active iteration outcome for ${blockingOpenIteration.id} before claiming that slice as verified.`;
  }
  if (latestOutcome) {
    return supersededOpenIteration
      ? `Use the latest iteration outcome to choose the next bounded core/basic slice; resolve superseded open iteration ${supersededOpenIteration.id} separately as governance cleanup.`
      : "Use the latest iteration outcome to choose the next bounded core/basic slice.";
  }
  return "Record a verification outcome for the latest self-evolution iteration before opening another major slice.";
}

function buildNextSlices(dimensions: SelfEvolutionDimension[]): SelfEvolutionNextSlice[] {
  return [...dimensions]
    .sort(compareDimensionsForNextSlice)
    .map((dimension, index) => ({
      id: `next_slice_${dimension.id}`,
      dimension_id: dimension.id,
      title: `${dimension.title} next slice`,
      layer: dimension.layer,
      priority: index + 1,
      reason: nextSliceReason(dimension),
      success_criteria: nextSliceSuccessCriteria(dimension.id),
      evidence_refs: dimension.evidence_refs.slice(0, 5)
    }));
}

function compareDimensionsForNextSlice(a: SelfEvolutionDimension, b: SelfEvolutionDimension): number {
  return attentionPriority(a.stage) - attentionPriority(b.stage)
    || a.score - b.score
    || stagePriority(a.stage) - stagePriority(b.stage)
    || layerPriority(a.layer) - layerPriority(b.layer)
    || a.id.localeCompare(b.id);
}

function attentionPriority(stage: SelfEvolutionStage): number {
  return stage === "attention" ? 0 : 1;
}

function stagePriority(stage: SelfEvolutionStage): number {
  if (stage === "planned") return 0;
  if (stage === "emerging") return 1;
  if (stage === "active") return 2;
  if (stage === "stable") return 3;
  return 4;
}

function layerPriority(layer: CapabilityLayer | "cross_layer"): number {
  if (layer === "core_runtime") return 0;
  if (layer === "basic_entrypoint") return 1;
  if (layer === "local_learning") return 2;
  if (layer === "cross_layer") return 3;
  if (layer === "boundary") return 4;
  return 5;
}

function nextSliceReason(dimension: SelfEvolutionDimension): string {
  if (dimension.id === "general_agent_delegation") {
    return "General-agent delegation is the bounded delegation baseline; harden dispatch, recovery, and verification before expert specialization.";
  }
  if (dimension.stage === "attention") {
    return `${dimension.title} is attention-stage; resolve observable runtime or learning pressure before expanding authority.`;
  }
  if (dimension.score < 5) {
    return `${dimension.title} has score ${dimension.score}/5; choose a bounded slice that raises durable capability instead of application-only output.`;
  }
  return `${dimension.title} is stable enough for hardening; choose only a small slice with direct verification evidence.`;
}

function nextSliceSuccessCriteria(dimensionId: string): string[] {
  if (dimensionId === "core_ga_design") return [
    "the slice cites the GA project design contract, a derived project-design artifact, or a verified iteration outcome",
    "the owner surface and capability layer are explicit before implementation",
    "external adapters remain application slices unless the runtime contract is reusable"
  ];
  if (dimensionId === "basic_runtime_substrate") return [
    "service/workspace health exposes the relevant state without raw artifact reads",
    "runtime_substrate attention reasons are named and verified",
    "resident runtime is restarted or health-checked after service-facing changes"
  ];
  if (dimensionId === "sop_skill_memory_loop") return [
    "a repeated correction can become a SOP candidate with explicit audit gates",
    "skill promotion remains separate from drafting and verification",
    "application-specific lessons are not promoted as core runtime identity"
  ];
  if (dimensionId === "memory_dream_direction") return [
    "accepted semantic memory or latest dream refs are cited as context",
    "dream snapshots guide direction without executing work",
    "new durable memory remains behind confirmation gates"
  ];
  if (dimensionId === "general_agent_delegation") return [
    "delegate_agent requires a bounded task and context before any submodel call",
    "delegated results are persisted, fed back as observations, and verified by the main harness",
    "failed delegated results carry bounded result_failure_kind metadata and can only guide main-harness recovery",
    "no expert persona, autonomous scheduler, model fan-out, or delegated completion authority is added"
  ];
  return ["the slice has direct evidence refs, verification commands, and non-goals"];
}

function buildExpertLenses(
  dimensions: SelfEvolutionDimension[],
  backlogRefs: string[],
  dreamRefs: string[],
  delegationActive: boolean
): SelfEvolutionExpertLens[] {
  return [
    {
      id: "architect",
      title: "Architect lens",
      status: "active",
      focus: "Core GA project design and reusable runtime contracts.",
      current_question: "Does the next iteration improve a core/basic contract instead of only one external-tool slice?",
      evidence_refs: refsFor(dimensions, "core_ga_design")
    },
    {
      id: "runtime_operator",
      title: "Runtime operator lens",
      status: "active",
      focus: "Local service, CLI, workspace, context, and health observability.",
      current_question: "Can the operator verify the runtime state before trusting a capability claim?",
      evidence_refs: refsFor(dimensions, "basic_runtime_substrate")
    },
    {
      id: "learning_curator",
      title: "Learning curator lens",
      status: "active",
      focus: "SOP persistence, skill promotion, semantic memory, and dream continuity.",
      current_question: "Which repeated correction deserves an audited SOP or accepted memory next?",
      evidence_refs: compactRefs([...refsFor(dimensions, "sop_skill_memory_loop"), ...dreamRefs])
    },
    {
      id: "verification_reviewer",
      title: "Verification reviewer lens",
      status: "active",
      focus: "Evidence strength, boundaries, and completion claims.",
      current_question: "Which claim still depends on indirect evidence or an unverified backlog item?",
      evidence_refs: backlogRefs
    },
    {
      id: "delegation_flow_reviewer",
      title: "Delegation flow lens",
      status: delegationActive ? "active" : "planned",
      focus: "General-agent task dispatch, delegated self-report recovery, and main-harness verification.",
      current_question: "Can the main agent dispatch a bounded task and verify the delegated self-report without expert scheduling?",
      evidence_refs: refsFor(dimensions, "general_agent_delegation")
    }
  ];
}

function countCapabilitiesByLayer(catalog: ReturnType<typeof getCapabilityCatalog>): Record<CapabilityLayer, number> {
  const counts: Record<CapabilityLayer, number> = {
    core_runtime: 0,
    basic_entrypoint: 0,
    local_learning: 0,
    application_slice: 0,
    boundary: 0
  };
  for (const category of catalog.categories) {
    for (const capability of category.capabilities) {
      counts[resolveCapabilityLayer(category, capability)] += 1;
    }
  }
  return counts;
}

function countLayer(
  diagnostics: Awaited<ReturnType<typeof getMemoryLayerDiagnostics>>,
  layerId: string,
  countKey: string
): number {
  const value = diagnostics.layers.find((layer) => layer.id === layerId)?.counts[countKey];
  return typeof value === "number" ? value : 0;
}

function refsFor(dimensions: SelfEvolutionDimension[], id: string): string[] {
  return dimensions.find((dimension) => dimension.id === id)?.evidence_refs ?? [];
}

function firstNextMove(dimensions: SelfEvolutionDimension[], id: string): string {
  return dimensions.find((dimension) => dimension.id === id)?.next_moves[0] ?? "Inspect the self-evolution scorecard before choosing the next slice.";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(5, value));
}

function compactRefs(refs: Array<string | null | undefined>): string[] {
  return [...new Set(refs.map((ref) => ref?.trim()).filter((ref): ref is string => Boolean(ref)))];
}
