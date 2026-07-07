import type { CapabilityLayer } from "./capabilities.js";
import {
  listSelfEvolutionIterations,
  type SelfEvolutionIterationContract
} from "./self_evolution_iterations.js";
import type { AgentStore } from "./store.js";

export type GaProjectDesignPhaseId =
  | "goal_intake"
  | "capability_layering"
  | "contract_design"
  | "execution_plan"
  | "verification_review"
  | "learning_persistence";

export interface GaProjectDesignPhase {
  id: GaProjectDesignPhaseId;
  title: string;
  layer: CapabilityLayer | "cross_layer";
  objective: string;
  required_inputs: string[];
  exit_evidence: string[];
  forbidden_shortcuts: string[];
}

export interface GaProjectDesignContract {
  schema_version: 1;
  contract_id: "ga_project_design_contract";
  contract_version: "2026-07-06";
  action: "project-design";
  status: "implemented";
  layer: "core_runtime";
  title: string;
  summary: string;
  phases: GaProjectDesignPhase[];
  decision_rules: string[];
  verification_policy: string[];
  non_goals: string[];
  commands: string[];
  refs: string[];
  boundary: string;
}

export interface GaProjectDesignArtifact {
  id: string;
  title: string;
  source_iteration_ref: string;
  source_outcome_status: "verified";
  layer: CapabilityLayer;
  owner_surface: string;
  proposed_slice: string;
  reusable_pattern: string;
  evidence_refs: string[];
  verification_commands: string[];
  next_use: string;
  non_goals: string[];
  boundary: string;
}

export interface GaProjectDesignPlanPhaseGate {
  phase_id: GaProjectDesignPhaseId;
  title: string;
  layer: CapabilityLayer | "cross_layer";
  objective: string;
  required_inputs: string[];
  exit_evidence: string[];
  forbidden_shortcuts: string[];
}

export interface GaProjectDesignCompletionAuditSeed {
  id: "goal_scope" | "current_state" | "verification_scope" | "learning_persistence";
  phase_id: GaProjectDesignPhaseId;
  requirement: string;
  evidence_needed: string[];
  reject_if: string[];
}

export interface GaProjectDesignAcceptanceTrace {
  seed_id: GaProjectDesignCompletionAuditSeed["id"];
  phase_id: GaProjectDesignPhaseId;
  criterion: string;
  required_entrypoints: string[];
  outcome_claim_prefixes: string[];
}

export interface GaProjectDesignLayerDecision {
  selected_layer: CapabilityLayer;
  selected_owner_surface: string;
  source_layer: CapabilityLayer;
  source_owner_surface: string;
  source_proposed_slice: string;
  proposed_slice: string;
  core_identity: "recurring_ga_project_design";
  stage: "core_basic_successor_ready" | "needs_attention";
  reasons: string[];
  application_boundaries: string[];
  required_before_outcome: string[];
}

export interface GaProjectDesignLearningAuthority {
  process_scaffold: string;
  judgment_authority: string;
  completion_authority: string;
  promotion_gate: string;
  boundary: string;
}

export interface GaProjectDesignIterationFocus {
  direction_id: "core_basic_plan_clarity";
  direction: string;
  rationale: string;
  next_steps: string[];
  anti_drift_checks: string[];
}

export interface GaProjectDesignGoalScope {
  objective: string;
  owner_surface: string;
  source_of_truth: string[];
  success_evidence: string[];
}

export interface GaProjectDesignImplementationContract {
  proposed_slice: string;
  source_artifact_id: string;
  source_proposed_slice: string;
  selected_layer: CapabilityLayer;
  owner_surface: string;
  improvement_type: "reusable_ga_design_contract";
  implementation_scope: string[];
  deferred_scope: string[];
  delivery_standard: string[];
  boundary: string;
}

export interface GaProjectDesignCapabilityStage {
  id: string;
  title: string;
  layer: "core_runtime" | "basic_entrypoint";
  stage: "active" | "hardening" | "attention_guard";
  current_state: string;
  next_iteration: string;
  exit_criteria: string[];
  evidence_refs: string[];
}

export interface GaProjectDesignCapabilityStagePlan {
  core_capabilities: GaProjectDesignCapabilityStage[];
  basic_capabilities: GaProjectDesignCapabilityStage[];
  next_iteration_plan: string[];
}

export interface GaProjectDesignIterationRecordStatus {
  status: "not_recorded" | "open_iteration_available";
  id?: string;
  ref?: string;
  outcome_status?: "not_recorded";
  inspect_command?: string;
  audit_command?: string;
  record_command: string;
  boundary: string;
}

export interface GaProjectDesignIterationSeed {
  summary: string;
  layer: CapabilityLayer;
  owner_surface: string;
  proposed_slice: string;
  source_ref: string;
  evidence_refs: string[];
  verification_commands: string[];
  non_goals: string[];
  record_command: string;
  boundary: string;
}

export interface GaProjectDesignPlanPacket {
  schema_version: 1;
  action: "project-design-plan";
  status: "advisory";
  id: string;
  title: string;
  target_dimension_id: "core_ga_design";
  target_slice_id: "next_slice_core_ga_design";
  layer: CapabilityLayer;
  owner_surface: string;
  proposed_slice: string;
  source_artifact_id: string;
  source_iteration_ref: string;
  source_proposed_slice: string;
  planning_basis: string;
  goal_scope: GaProjectDesignGoalScope;
  implementation_contract: GaProjectDesignImplementationContract;
  iteration_focus: GaProjectDesignIterationFocus;
  capability_stage_plan: GaProjectDesignCapabilityStagePlan;
  scorecard_basis: string[];
  selection_status: "ready" | "needs_attention";
  selection_reasons: string[];
  selection_checks: string[];
  layer_decision: GaProjectDesignLayerDecision;
  learning_authority: GaProjectDesignLearningAuthority;
  iteration_record_status: GaProjectDesignIterationRecordStatus;
  next_iteration_seed: GaProjectDesignIterationSeed;
  phase_gates: GaProjectDesignPlanPhaseGate[];
  completion_audit_seeds: GaProjectDesignCompletionAuditSeed[];
  acceptance_criteria: string[];
  acceptance_trace: GaProjectDesignAcceptanceTrace[];
  verification_commands: string[];
  next_command: string;
  non_goals: string[];
  refs: string[];
  boundary: string;
}

export interface GaProjectDesignArtifactPacket {
  schema_version: 1;
  action: "project-design-artifact";
  status: "advisory";
  artifact: GaProjectDesignArtifact;
  source_for_next_core_basic_plan: boolean;
  next_core_basic_plan: GaProjectDesignPlanPacket | null;
  refs: string[];
  boundary: string;
}

export interface GaProjectDesignReadModel extends GaProjectDesignContract {
  artifact_count: number;
  listed_artifact_count: number;
  artifacts: GaProjectDesignArtifact[];
  next_core_basic_plan: GaProjectDesignPlanPacket | null;
  artifact_policy: string[];
}

const BOUNDARY = "read-only GA project design contract; does not invoke models, execute tools, mutate state, write repo files, write the active vault, manage services, promote SOPs, promote skills, create expert agents, or prove completion";
const ARTIFACT_BOUNDARY = "read-only derived GA project design artifact; derived from verified self-evolution iteration metadata only; does not write state, promote memory, draft SOPs, promote skills, execute tools, or prove future project completion";
const ARTIFACT_PACKET_BOUNDARY = "read-only GA project design artifact inspection packet; does not derive new artifacts, record iterations, execute tools, mutate state, write repo files, write the active vault, promote SOPs, promote skills, schedule experts, or prove completion";
const ITERATION_SEED_BOUNDARY = "read-only GA project design iteration seed; does not record iterations, execute tools, mutate state, write repo files, write the active vault, promote SOPs, promote skills, schedule experts, or prove completion";
const PLAN_BOUNDARY = "read-only GA project design planning packet; derived from the contract and verified core/basic artifacts only; does not record iterations, execute commands, invoke models, create projects, schedule experts, mutate state, write repo files, or prove completion";
const COMPLETED_SOURCE_SLICE_NON_GOAL_PREFIX = "does not repeat completed source slice ";
const MIN_SOURCE_ARTIFACT_EVIDENCE_REFS = 2;
const MIN_SOURCE_ARTIFACT_VERIFICATION_COMMANDS = 2;
const NEXT_CORE_GA_DESIGN_TARGET = {
  target_dimension_id: "core_ga_design",
  target_slice_id: "next_slice_core_ga_design",
  layer: "core_runtime",
  owner_surface: "ga_project_design"
} as const;
const BASIC_RUNTIME_HEALTH_COMMAND = "pnpm run runtime -- service health --target im --state-root <state-root>";
const CORE_BASIC_SELF_EVOLUTION_OBJECTIVE = "Continue self-evolution through core/basic GA project-design capability gains before SOP, skill, memory, or dream promotion.";

export function getGaProjectDesignContract(): GaProjectDesignContract {
  return {
    schema_version: 1,
    contract_id: "ga_project_design_contract",
    contract_version: "2026-07-06",
    action: "project-design",
    status: "implemented",
    layer: "core_runtime",
    title: "GA project design contract",
    summary: "Defines the reusable loop for turning an operator goal into a bounded GA project slice with layer classification, contract design, verification evidence, and durable learning.",
    phases: [
      {
        id: "goal_intake",
        title: "Goal intake",
        layer: "core_runtime",
        objective: "Restate the operator goal as concrete success criteria without shrinking the original scope.",
        required_inputs: [
          "latest operator objective",
          "current worktree/runtime state",
          "relevant docs or prior decisions"
        ],
        exit_evidence: [
          "success criteria or acceptance checks are named",
          "source of truth and owner surface are identified"
        ],
        forbidden_shortcuts: [
          "do not treat previous intent as current evidence",
          "do not redefine success around the easiest existing work"
        ]
      },
      {
        id: "capability_layering",
        title: "Capability layering",
        layer: "core_runtime",
        objective: "Classify the work as core runtime, basic entrypoint, local learning, application slice, or boundary before implementation.",
        required_inputs: [
          "capability catalog",
          "self-evolution scorecard",
          "service/workspace health when runtime state matters"
        ],
        exit_evidence: [
          "selected layer is explicit",
          "external adapters are kept as application slices unless the pattern generalizes"
        ],
        forbidden_shortcuts: [
          "do not promote Nasdaq, Xiaohongshu MCP, browser automation, or one adapter into core identity by default",
          "do not hide basic runtime failures under application progress"
        ]
      },
      {
        id: "contract_design",
        title: "Contract design",
        layer: "core_runtime",
        objective: "Name the smallest reusable contract that improves GA delivery across projects.",
        required_inputs: [
          "owner surface",
          "proposed slice",
          "non-goals",
          "advisory expert roles when uncertainty is material"
        ],
        exit_evidence: [
          "contract boundary says what it cannot do",
          "iteration record can cite evidence refs and verification commands"
        ],
        forbidden_shortcuts: [
          "do not add provider-specific glue when a runtime contract is the real missing piece",
          "do not create new expert personas without a bounded delegation contract"
        ]
      },
      {
        id: "execution_plan",
        title: "Execution plan",
        layer: "basic_entrypoint",
        objective: "Choose the minimum commands, tests, and runtime checks that can verify the slice.",
        required_inputs: [
          "targeted code paths",
          "expected state refs",
          "verification commands"
        ],
        exit_evidence: [
          "targeted tests are identified before broad checks",
          "runtime health check is included when services or operator surfaces change"
        ],
        forbidden_shortcuts: [
          "do not use a narrow test to support a broader claim",
          "do not skip service health after resident runtime contract changes"
        ]
      },
      {
        id: "verification_review",
        title: "Verification review",
        layer: "core_runtime",
        objective: "Tie completion claims to inspected files, command output, tests, and runtime state.",
        required_inputs: [
          "diff or touched file refs",
          "test output",
          "runtime command output when applicable"
        ],
        exit_evidence: [
          "claims are backed by direct evidence",
          "remaining attention reasons are named rather than hand-waved"
        ],
        forbidden_shortcuts: [
          "do not let model reasoning replace executed verification",
          "do not let advisory expert output close the task"
        ]
      },
      {
        id: "learning_persistence",
        title: "Learning persistence",
        layer: "local_learning",
        objective: "Persist reusable lessons through iteration outcomes, memory, dream snapshots, SOP candidates, or skills only when the evidence supports reuse.",
        required_inputs: [
          "verified or partial iteration outcome",
          "operator correction or repeated gap",
          "learning artifact refs"
        ],
        exit_evidence: [
          "iteration outcome records status, evidence, commands, and next move",
          "dream or scorecard refresh can use the result without claiming completion"
        ],
        forbidden_shortcuts: [
          "do not promote one-off application behavior to skill or semantic memory",
          "do not treat dream snapshots as execution plans",
          "do not let a self-evolution SOP or selected skill override project-design judgment or completion gates"
        ]
      }
    ],
    decision_rules: [
      "prefer core/basic contract improvement over one-off application glue when both solve the same recurring issue",
      "application slices are valid only when they validate, pressure-test, or consume the reusable runtime contract",
      "basic entrypoint health must stay observable before adding mutation or publishing authority",
      "major self-evolution work should start with an iteration contract and end with an outcome record",
      "self-evolution SOPs and skills may preserve repeatable procedure, but core layer judgment and completion authority stay with project-design, iteration outcomes, and current evidence",
      "multi-expert orchestration follows core/basic stability and learning-persistence gates; advisory output never replaces main-thread verification",
      "expert roles are advisory lenses; main-thread verification keeps completion authority"
    ],
    verification_policy: [
      "each project slice needs direct evidence for its own scope",
      "current worktree and runtime state outrank older memory or prior summaries",
      "tests are evidence only for the behavior they cover",
      "service-facing changes require a restart or health check when a resident service is active",
      "completion summaries must state unresolved attention reasons or missing evidence"
    ],
    non_goals: [
      "no project scheduler",
      "no model invocation",
      "no external-tool execution",
      "no automatic SOP, skill, memory, or dream promotion",
      "no completion proof without executed verification"
    ],
    commands: [
      "pnpm run runtime -- governance project-design",
      "pnpm run runtime -- governance project-design --artifact <artifact-or-iteration-ref>",
      "pnpm run runtime -- governance project-design --audit-seed <seed-id>"
    ],
    refs: [
      "CONTEXT.md",
      "docs/RUNTIME_CONTRACT.md",
      "docs/LOCAL_RUNTIME.md",
      "packages/core/src/ga_project_design.ts",
      "packages/core/src/capabilities.ts",
      "packages/core/src/self_evolution_iterations.ts",
      "packages/core/src/self_evolution_scorecard.ts",
      "packages/core/src/expert_orchestration.ts"
    ],
    boundary: BOUNDARY
  };
}

export async function getGaProjectDesignArtifactPacket(
  store: AgentStore,
  args: { artifactRef: string; limit?: number }
): Promise<GaProjectDesignArtifactPacket> {
  const readModel = await getGaProjectDesignReadModel(store, { limit: args.limit });
  const artifact = selectGaProjectDesignArtifact(readModel.artifacts, args.artifactRef);
  if (!artifact) throw new Error(`GA project design artifact not found: ${args.artifactRef}`);
  const plan = readModel.next_core_basic_plan?.source_artifact_id === artifact.id
    ? readModel.next_core_basic_plan
    : null;
  return {
    schema_version: 1,
    action: "project-design-artifact",
    status: "advisory",
    artifact,
    source_for_next_core_basic_plan: Boolean(plan),
    next_core_basic_plan: plan,
    refs: compactRefs([
      artifact.source_iteration_ref,
      ...artifact.evidence_refs,
      ...(plan?.refs ?? [])
    ]),
    boundary: ARTIFACT_PACKET_BOUNDARY
  };
}

export function selectGaProjectDesignArtifact(
  artifacts: GaProjectDesignArtifact[],
  artifactRef: string
): GaProjectDesignArtifact | null {
  const requested = artifactRef.trim();
  if (!requested) return null;
  return artifacts.find((artifact) =>
    artifact.id === requested
    || artifact.source_iteration_ref === requested
    || sourceIterationFilename(artifact) === requested
    || sourceIterationId(artifact) === requested
  ) ?? null;
}

export async function getGaProjectDesignReadModel(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<GaProjectDesignReadModel> {
  await store.ensureLayout();
  const limit = Math.max(0, args.limit ?? 10);
  const contract = getGaProjectDesignContract();
  const iterations = await listSelfEvolutionIterations(store);
  const allArtifacts = deriveGaProjectDesignArtifacts(iterations.iterations);
  const artifacts = allArtifacts.slice(0, limit);
  const nextCoreBasicPlan = buildNextCoreBasicPlan(contract, allArtifacts, iterations.iterations);
  return {
    ...contract,
    artifact_count: allArtifacts.length,
    listed_artifact_count: artifacts.length,
    artifacts,
    next_core_basic_plan: nextCoreBasicPlan,
    artifact_policy: [
      "only verified self-evolution iteration outcomes with outcome evidence refs and verification commands become project-design artifacts",
      "artifacts are reusable design memory for future GA slices, not completion proof",
      "external adapters remain application slices unless the artifact names a reusable core/basic contract"
    ],
    refs: compactRefs([
      ...contract.refs,
      ...artifacts.map((artifact) => artifact.source_iteration_ref),
      ...artifacts.flatMap((artifact) => artifact.evidence_refs),
      ...(nextCoreBasicPlan?.refs ?? [])
    ]),
    boundary: `${contract.boundary}; ${ARTIFACT_BOUNDARY}; ${PLAN_BOUNDARY}`
  };
}

function buildNextCoreBasicPlan(
  contract: GaProjectDesignContract,
  artifacts: GaProjectDesignArtifact[],
  iterations: SelfEvolutionIterationContract[]
): GaProjectDesignPlanPacket | null {
  const source = artifacts.find((artifact) => isCoreBasicLayer(artifact.layer));
  if (!source) return null;
  const proposedSlice = nextCoreGaDesignProposedSlice(source);
  const nextIterationSeed = buildNextIterationSeed(contract, source, proposedSlice);
  const iterationRecordStatus = buildIterationRecordStatus(iterations, nextIterationSeed);
  const isFreshSuccessor = proposedSlice !== source.proposed_slice;
  const isTargetLayerReady = isCoreBasicLayer(NEXT_CORE_GA_DESIGN_TARGET.layer);
  const selectionStatus = isFreshSuccessor && isTargetLayerReady ? "ready" : "needs_attention";
  const sourceArtifactWarnings = [
    ...(source.evidence_refs.length < MIN_SOURCE_ARTIFACT_EVIDENCE_REFS
      ? [`source_artifact_warning=thin_evidence_refs; minimum=${MIN_SOURCE_ARTIFACT_EVIDENCE_REFS}; actual=${source.evidence_refs.length}`]
      : []),
    ...(source.verification_commands.length < MIN_SOURCE_ARTIFACT_VERIFICATION_COMMANDS
      ? [`source_artifact_warning=thin_verification_commands; minimum=${MIN_SOURCE_ARTIFACT_VERIFICATION_COMMANDS}; actual=${source.verification_commands.length}`]
      : [])
  ];
  const sourceArtifactQuality = sourceArtifactWarnings.length ? "attention" : "ok";
  const selectionReasons = [
    `source_status=${source.source_outcome_status}`,
    `source_artifact_quality=${sourceArtifactQuality}`,
    `fresh_successor_slice=${isFreshSuccessor}`,
    `target_layer=${NEXT_CORE_GA_DESIGN_TARGET.layer}`,
    `owner_surface=${NEXT_CORE_GA_DESIGN_TARGET.owner_surface}`,
    `iteration_record_status=${iterationRecordStatus.status}`
  ];
  const acceptanceTrace = buildAcceptanceTrace();
  return {
    schema_version: 1,
    action: "project-design-plan",
    status: "advisory",
    id: `ga_design_plan_${safeIdPart(source.id)}`,
    title: `Next core/basic GA planning packet: ${proposedSlice}`,
    target_dimension_id: NEXT_CORE_GA_DESIGN_TARGET.target_dimension_id,
    target_slice_id: NEXT_CORE_GA_DESIGN_TARGET.target_slice_id,
    layer: NEXT_CORE_GA_DESIGN_TARGET.layer,
    owner_surface: NEXT_CORE_GA_DESIGN_TARGET.owner_surface,
    proposed_slice: proposedSlice,
    source_artifact_id: source.id,
    source_iteration_ref: source.source_iteration_ref,
    source_proposed_slice: source.proposed_slice,
    planning_basis: `Use ${source.id} as evidence, then choose a new core/basic slice instead of repeating completed slice ${source.proposed_slice}. ${source.next_use}`,
    goal_scope: buildGoalScope(source, proposedSlice),
    implementation_contract: buildImplementationContract(source, proposedSlice),
    iteration_focus: buildIterationFocus(source, proposedSlice),
    capability_stage_plan: buildCapabilityStagePlan(source, proposedSlice),
    scorecard_basis: [
      `next_core_basic_slice=${NEXT_CORE_GA_DESIGN_TARGET.target_slice_id}`,
      `target_dimension=${NEXT_CORE_GA_DESIGN_TARGET.target_dimension_id}`,
      `target_layer=${NEXT_CORE_GA_DESIGN_TARGET.layer}`,
      "scorecard_command=pnpm run runtime -- governance scorecard --state-root <state-root>"
    ],
    selection_status: selectionStatus,
    selection_reasons: selectionReasons,
    selection_checks: [
      `source_artifact_verified=${source.source_outcome_status}; ref=${source.source_iteration_ref}`,
      `source_artifact_evidence=evidence_refs:${source.evidence_refs.length}; verification_commands:${source.verification_commands.length}`,
      `source_artifact_warning_thresholds=evidence_refs:${MIN_SOURCE_ARTIFACT_EVIDENCE_REFS}; verification_commands:${MIN_SOURCE_ARTIFACT_VERIFICATION_COMMANDS}`,
      ...sourceArtifactWarnings,
      `fresh_successor_slice=${isFreshSuccessor}; source_slice=${source.proposed_slice}; target_slice=${proposedSlice}`,
      `target_layer=${NEXT_CORE_GA_DESIGN_TARGET.layer}; owner_surface=${NEXT_CORE_GA_DESIGN_TARGET.owner_surface}`,
      `iteration_record_status=${iterationRecordStatus.status}${iterationRecordStatus.ref ? `; ref=${iterationRecordStatus.ref}` : ""}`,
      "verification_entrypoints=project-design,scorecard,iterations,service-health,check"
    ],
    layer_decision: buildLayerDecision(source, proposedSlice, selectionStatus),
    learning_authority: buildLearningAuthority(),
    iteration_record_status: iterationRecordStatus,
    next_iteration_seed: nextIterationSeed,
    phase_gates: contract.phases.map((phase) => ({
      phase_id: phase.id,
      title: phase.title,
      layer: phase.layer,
      objective: phase.objective,
      required_inputs: phase.required_inputs,
      exit_evidence: phase.exit_evidence,
      forbidden_shortcuts: phase.forbidden_shortcuts
    })),
    completion_audit_seeds: buildCompletionAuditSeeds(source, proposedSlice),
    acceptance_criteria: acceptanceTrace.map((trace) => trace.criterion),
    acceptance_trace: acceptanceTrace,
    verification_commands: nextIterationSeed.verification_commands,
    next_command: iterationRecordStatus.inspect_command ?? nextIterationSeed.record_command,
    non_goals: buildSuccessorNonGoals(source, contract, ["does not execute the next slice"]),
    refs: compactRefs([
      "packages/core/src/ga_project_design.ts",
      iterationRecordStatus.ref,
      ...nextIterationSeed.evidence_refs
    ]),
    boundary: PLAN_BOUNDARY
  };
}

function buildImplementationContract(
  source: GaProjectDesignArtifact,
  proposedSlice: string
): GaProjectDesignImplementationContract {
  return {
    proposed_slice: proposedSlice,
    source_artifact_id: source.id,
    source_proposed_slice: source.proposed_slice,
    selected_layer: NEXT_CORE_GA_DESIGN_TARGET.layer,
    owner_surface: NEXT_CORE_GA_DESIGN_TARGET.owner_surface,
    improvement_type: "reusable_ga_design_contract",
    implementation_scope: [
      "change one reusable GA project-design contract or read-model surface",
      "carry the change through audit guidance or context only when it improves output standardization",
      "cover the change with targeted tests, docs, outcome evidence, and runtime health"
    ],
    deferred_scope: [
      "no external adapter or tool integration unless it names a reusable runtime contract",
      "no SOP, skill, memory, or dream promotion before verified reuse evidence exists",
      "no expert-agent scheduling or delegation automation"
    ],
    delivery_standard: [
      "future iterations can inspect the contract without inferring intent from the opaque slice id",
      "verification maps to project-design, scorecard, iterations, service-health, and check entrypoints",
      "a verified outcome is recorded before the contract is reused as future GA design evidence"
    ],
    boundary: "read-only GA implementation contract; constrains the next slice before implementation but does not execute commands, write outcomes, promote learning artifacts, schedule experts, or prove completion"
  };
}

function buildAcceptanceTrace(): GaProjectDesignAcceptanceTrace[] {
  return [
    {
      seed_id: "goal_scope",
      phase_id: "goal_intake",
      criterion: "goal_scope: operator goal is restated with owner surface, source of truth, and success evidence",
      required_entrypoints: ["project-design", "iterations"],
      outcome_claim_prefixes: ["project-design:", "iterations:"]
    },
    {
      seed_id: "goal_scope",
      phase_id: "goal_intake",
      criterion: "goal_scope: the next proposed slice is selected from current goal and scorecard evidence instead of copied from the source artifact",
      required_entrypoints: ["project-design", "scorecard", "iterations"],
      outcome_claim_prefixes: ["project-design:", "scorecard:", "iterations:"]
    },
    {
      seed_id: "current_state",
      phase_id: "capability_layering",
      criterion: "current_state: capability layer stays core_runtime or basic_entrypoint before implementation",
      required_entrypoints: ["project-design", "scorecard", "iterations"],
      outcome_claim_prefixes: ["project-design:", "scorecard:", "iterations:"]
    },
    {
      seed_id: "current_state",
      phase_id: "capability_layering",
      criterion: "current_state: external adapters remain application slices unless a reusable runtime contract is named",
      required_entrypoints: ["project-design", "scorecard", "service-health"],
      outcome_claim_prefixes: ["project-design:", "scorecard:", "service-health:", "workspace:"]
    },
    {
      seed_id: "verification_scope",
      phase_id: "verification_review",
      criterion: "verification_scope: verification commands are scoped to the slice and required entrypoints are covered by completion claims",
      required_entrypoints: ["project-design", "scorecard", "iterations", "service-health", "check"],
      outcome_claim_prefixes: ["project-design:", "scorecard:", "iterations:", "service-health:", "check:"]
    },
    {
      seed_id: "learning_persistence",
      phase_id: "learning_persistence",
      criterion: "learning_persistence: outcome is recorded before reuse",
      required_entrypoints: ["iterations"],
      outcome_claim_prefixes: ["iterations:"]
    },
    {
      seed_id: "learning_persistence",
      phase_id: "learning_persistence",
      criterion: "learning_persistence: SOP or skill artifacts preserve procedure only; project-design and verified outcomes retain judgment and completion authority",
      required_entrypoints: ["project-design", "iterations"],
      outcome_claim_prefixes: ["project-design:", "iterations:"]
    }
  ];
}

function buildGoalScope(
  source: GaProjectDesignArtifact,
  proposedSlice: string
): GaProjectDesignGoalScope {
  return {
    objective: CORE_BASIC_SELF_EVOLUTION_OBJECTIVE,
    owner_surface: NEXT_CORE_GA_DESIGN_TARGET.owner_surface,
    source_of_truth: [
      "operator_objective=core_basic_self_evolution_first",
      `source_artifact=${source.id}`,
      `source_iteration_ref=${source.source_iteration_ref}`,
      `scorecard_target=${NEXT_CORE_GA_DESIGN_TARGET.target_dimension_id}/${NEXT_CORE_GA_DESIGN_TARGET.target_slice_id}`
    ],
    success_evidence: [
      `fresh_successor_slice=true; source_slice=${source.proposed_slice}; target_slice=${proposedSlice}`,
      `selected_layer=${NEXT_CORE_GA_DESIGN_TARGET.layer}; owner_surface=${NEXT_CORE_GA_DESIGN_TARGET.owner_surface}`,
      "verified outcome records evidence refs and verification command coverage before reuse"
    ]
  };
}

function buildIterationFocus(
  source: GaProjectDesignArtifact,
  proposedSlice: string
): GaProjectDesignIterationFocus {
  return {
    direction_id: "core_basic_plan_clarity",
    direction: "Clarify the next core/basic GA design improvement before implementation.",
    rationale: `The successor ${proposedSlice} should be chosen from verified GA design evidence, while ${source.proposed_slice} remains completed source context only.`,
    next_steps: [
      "inspect the current project-design plan and matching open iteration",
      "pick one small reusable GA design contract improvement",
      "verify the slice with project-design, scorecard, iteration audit, service health, and broad checks before recording an outcome"
    ],
    anti_drift_checks: [
      "do not infer core identity from external adapter or MCP pressure",
      "do not promote SOP, skill, memory, or dream artifacts before verified core/basic reuse evidence exists",
      "do not claim completion until outcome verification commands cover the required project-design checks"
    ]
  };
}

function buildCapabilityStagePlan(
  source: GaProjectDesignArtifact,
  proposedSlice: string
): GaProjectDesignCapabilityStagePlan {
  const sharedEvidence = [
    "packages/core/src/ga_project_design.ts",
    source.source_iteration_ref
  ];
  return {
    core_capabilities: [
      {
        id: "goal_intake",
        title: "Goal intake",
        layer: "core_runtime",
        stage: "active",
        current_state: "Operator goals are preserved through project-design plans, audit seeds, and iteration outcomes.",
        next_iteration: "Keep the next slice tied to the original objective instead of completed-source convenience.",
        exit_criteria: [
          "the next slice cites the latest operator objective or a verified source artifact",
          "audit seeds reject success criteria that only describe completed source work"
        ],
        evidence_refs: sharedEvidence
      },
      {
        id: "capability_layering",
        title: "Capability layering",
        layer: "core_runtime",
        stage: "active",
        current_state: "Core/basic/local-learning/application boundaries are explicit before the next slice is claimed.",
        next_iteration: "Keep external adapter pressure out of core identity unless a reusable runtime contract is named.",
        exit_criteria: [
          "core/basic/local-learning/application layer is explicit before implementation",
          "external adapter pressure is named as application evidence unless a reusable runtime contract exists"
        ],
        evidence_refs: ["packages/core/src/capabilities.ts", source.source_iteration_ref]
      },
      {
        id: "contract_design",
        title: "Contract design",
        layer: "core_runtime",
        stage: "hardening",
        current_state: `The current successor ${proposedSlice} is open to improve reusable GA design contracts.`,
        next_iteration: "Pick one small reusable contract improvement and record verified outcome evidence before reuse.",
        exit_criteria: [
          "one reusable GA design contract improvement is implemented",
          "verified outcome evidence exists before the improvement is reused"
        ],
        evidence_refs: sharedEvidence
      },
      {
        id: "verification_review",
        title: "Verification review",
        layer: "core_runtime",
        stage: "active",
        current_state: "Completion gates require outcome evidence and outcome verification command coverage.",
        next_iteration: "Use iteration audit output to reject completion claims without covered outcome commands.",
        exit_criteria: [
          "iteration audit reports covered plan refs",
          "completion gate reaches ready_for_manual_review only after outcome verification command coverage is covered"
        ],
        evidence_refs: [
          "packages/core/src/self_evolution_iterations.ts",
          "apps/cli/src/main.ts",
          source.source_iteration_ref
        ]
      }
    ],
    basic_capabilities: [
      {
        id: "execution_plan",
        title: "Execution plan",
        layer: "basic_entrypoint",
        stage: "active",
        current_state: "Project-design plans include targeted commands before broad checks.",
        next_iteration: "Keep project-design, scorecard, iteration audit, service health, and check in the required verification set.",
        exit_criteria: [
          "targeted project-design and iteration audit checks run before the broad check",
          "pnpm run check passes before recording a verified outcome"
        ],
        evidence_refs: sharedEvidence
      },
      {
        id: "runtime_observability",
        title: "Runtime observability",
        layer: "basic_entrypoint",
        stage: "attention_guard",
        current_state: "Resident service health is the basic guard that keeps runtime attention visible before a core/basic outcome is reused.",
        next_iteration: "Name runtime attention reasons explicitly instead of hiding them behind application progress.",
        exit_criteria: [
          "service health is inspected for the resident IM target",
          "runtime attention reasons are named in the outcome instead of being treated as application progress"
        ],
        evidence_refs: [
          "docs/RUNTIME_CONTRACT.md",
          "packages/core/src/service_health.ts"
        ]
      }
    ],
    next_iteration_plan: [
      `core_runtime[goal_scope]: continue ${proposedSlice} as a ga_project_design hardening slice`,
      "core_runtime[current_state]: choose one reusable GA design contract improvement, not an external adapter task",
      "basic_entrypoint[verification_scope]: verify with project-design, scorecard, iteration audit, service health, and pnpm run check",
      "local_learning[learning_persistence]: record an iteration outcome before any SOP, skill, memory, or dream reuse",
      "multi_expert[orchestration]: defer expert scheduling until core/basic and learning-persistence gates are stable"
    ]
  };
}

function buildLayerDecision(
  source: GaProjectDesignArtifact,
  proposedSlice: string,
  selectionStatus: GaProjectDesignPlanPacket["selection_status"]
): GaProjectDesignLayerDecision {
  return {
    selected_layer: NEXT_CORE_GA_DESIGN_TARGET.layer,
    selected_owner_surface: NEXT_CORE_GA_DESIGN_TARGET.owner_surface,
    source_layer: source.layer,
    source_owner_surface: source.owner_surface,
    source_proposed_slice: source.proposed_slice,
    proposed_slice: proposedSlice,
    core_identity: "recurring_ga_project_design",
    stage: selectionStatus === "ready" ? "core_basic_successor_ready" : "needs_attention",
    reasons: [
      "core identity is the reusable GA project-design loop, not a single external adapter",
      "the next slice is a core/basic successor because it improves design classification, planning, or verification reuse",
      `source_layer=${source.layer}; selected_layer=${NEXT_CORE_GA_DESIGN_TARGET.layer}`
    ],
    application_boundaries: [
      "external tools and adapters stay application slices unless a reusable runtime contract is named",
      "SOP, skill, memory, and dream promotion follows only after core/basic evidence supports reuse; multi-expert orchestration follows those gates and remains advisory"
    ],
    required_before_outcome: [
      `pnpm run runtime -- governance project-design --artifact ${source.id} --state-root <state-root>`,
      "pnpm run runtime -- governance scorecard --state-root <state-root>",
      "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>",
      BASIC_RUNTIME_HEALTH_COMMAND,
      "pnpm run check"
    ]
  };
}

function buildLearningAuthority(): GaProjectDesignLearningAuthority {
  return {
    process_scaffold: "self-evolution SOPs and skills may preserve repeatable workflow after verified evidence recurs",
    judgment_authority: "core/basic layer selection stays with ga_project_design, scorecard, iteration contract, and current runtime evidence",
    completion_authority: "completion stays with verified iteration outcome plus completion_gate coverage, not SOP text, selected-skill recall, dream snapshots, or expert advice",
    promotion_gate: "SOP drafting, audit, promotion, semantic memory, dream refresh, and skill reuse remain later local-learning gates",
    boundary: "read-only learning authority boundary; does not draft SOPs, promote skills, accept memory, refresh dreams, select skills, invoke models, execute tools, or prove completion"
  };
}

function buildIterationRecordStatus(
  iterations: SelfEvolutionIterationContract[],
  seed: GaProjectDesignIterationSeed
): GaProjectDesignIterationRecordStatus {
  const openIteration = iterations.find((iteration) =>
    !iteration.outcome
    && iteration.layer === seed.layer
    && iteration.owner_surface === seed.owner_surface
    && iteration.proposed_slice === seed.proposed_slice
    && (iteration.source_ref ?? "") === seed.source_ref
  );
  if (openIteration) {
    return {
      status: "open_iteration_available",
      id: openIteration.id,
      ref: openIteration.ref,
      outcome_status: "not_recorded",
      inspect_command: `pnpm run runtime -- governance iterations --iteration ${openIteration.id} --state-root <state-root>`,
      audit_command: `pnpm run runtime -- governance iterations --iteration ${openIteration.id} --audit-seed all --state-root <state-root>`,
      record_command: seed.record_command,
      boundary: "read-only GA project design iteration record status; detects a matching open iteration by layer, owner surface, proposed slice, and source ref; does not write state or prove completion"
    };
  }
  return {
    status: "not_recorded",
    record_command: seed.record_command,
    boundary: "read-only GA project design iteration record status; no matching open iteration was found; does not write state or prove completion"
  };
}

function buildNextIterationSeed(
  contract: GaProjectDesignContract,
  source: GaProjectDesignArtifact,
  proposedSlice: string
): GaProjectDesignIterationSeed {
  return {
    summary: `Open next core/basic GA design slice ${proposedSlice} from verified project-design artifact ${source.id}.`,
    layer: NEXT_CORE_GA_DESIGN_TARGET.layer,
    owner_surface: NEXT_CORE_GA_DESIGN_TARGET.owner_surface,
    proposed_slice: proposedSlice,
    source_ref: source.source_iteration_ref,
    evidence_refs: buildSuccessorEvidenceRefs(source),
    verification_commands: [
      `pnpm run runtime -- governance project-design --artifact ${source.id} --state-root <state-root>`,
      "pnpm run runtime -- governance scorecard --state-root <state-root>",
      "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>",
      BASIC_RUNTIME_HEALTH_COMMAND,
      "pnpm run check"
    ],
    non_goals: buildSuccessorNonGoals(source, contract, [
      "does not execute the planned slice",
      "does not prove completion without a later outcome record"
    ]),
    record_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>",
    boundary: ITERATION_SEED_BOUNDARY
  };
}

function buildCompletionAuditSeeds(
  source: GaProjectDesignArtifact,
  proposedSlice: string
): GaProjectDesignCompletionAuditSeed[] {
  return [
    {
      id: "goal_scope",
      phase_id: "goal_intake",
      requirement: "Preserve the latest operator objective and do not redefine success around completed work.",
      evidence_needed: [
        `proposed_slice=${proposedSlice}`,
        `source_proposed_slice=${source.proposed_slice}`,
        "operator goal or accepted task states the intended end state",
        "next_core_basic_plan.goal_scope names objective, owner_surface, source_of_truth, and success_evidence",
        "goal_scope.success_evidence distinguishes the completed source slice from the successor slice"
      ],
      reject_if: [
        "success criteria only describe the completed source artifact",
        "the next slice is easier than the operator objective",
        "goal_scope is missing objective, owner_surface, source_of_truth, or success_evidence",
        "goal_scope success evidence does not distinguish source slice from successor slice"
      ]
    },
    {
      id: "current_state",
      phase_id: "capability_layering",
      requirement: "Use current worktree and runtime state, classify runtime attention, and name the handling policy before trusting older memory or prior summaries.",
      evidence_needed: [
        "workspace or git status when files changed",
        "service health status and reasons when resident runtime behavior changed",
        "service health status and reasons when service health is a required verification command",
        "runtime attention classification is acceptable, repair_needed, or verification_blocker when service health is not healthy",
        "runtime attention handling says why acceptable is safe, what repair_needed follows up, or why verification_blocker stops the outcome",
        "repair_needed handling names a follow-up action or explains why no follow-up is required"
      ],
      reject_if: [
        "older memory is the only evidence",
        "external adapter pressure is treated as core identity without a reusable contract",
        "worktree changes are present but the outcome omits workspace status or changed paths",
        "runtime attention reasons are omitted from the outcome when service health is not healthy",
        "service health is a required verification command but the outcome omits service health status or reasons",
        "runtime attention is named but not classified as acceptable, repair_needed, or verification_blocker",
        "runtime attention is classified without a handling policy",
        "repair_needed is classified without a follow-up action or no-follow-up rationale"
      ]
    },
    {
      id: "verification_scope",
      phase_id: "verification_review",
      requirement: "Match verification evidence to the scope of the completion claim.",
      evidence_needed: [
        "targeted checks cover the changed behavior",
        "broad check runs before a verified outcome is recorded",
        "outcome explains which completion claim each verification command supports",
        "outcome maps each required verification entrypoint to a completion claim"
      ],
      reject_if: [
        "a narrow command is used to prove a broader capability claim",
        "expert advice replaces executed verification",
        "verification commands are listed without claim coverage",
        "a required verification entrypoint is omitted from outcome claim coverage"
      ]
    },
    {
      id: "learning_persistence",
      phase_id: "learning_persistence",
      requirement: "Record the verified outcome before reusing the slice as future GA design evidence.",
      evidence_needed: [
        "record-iteration-outcome ref",
        "next moves preserve non-goals and boundaries",
        "learning_authority states that SOPs and skills preserve procedure while project-design and verified outcomes retain judgment and completion authority"
      ],
      reject_if: [
        "dream, SOP, skill, or memory artifacts are treated as completion proof",
        "one-off application behavior is promoted as core runtime identity",
        "a self-evolution SOP or selected skill overrides project-design layer judgment or the iteration completion gate"
      ]
    }
  ];
}

export function deriveGaProjectDesignArtifacts(
  iterations: SelfEvolutionIterationContract[]
): GaProjectDesignArtifact[] {
  return iterations
    .filter(hasReusableGaProjectDesignOutcome)
    .map((iteration) => {
      const outcome = iteration.outcome!;
      return {
        id: `ga_design_artifact_${safeIdPart(iteration.id)}`,
        title: `Reusable GA project design: ${iteration.proposed_slice}`,
        source_iteration_ref: iteration.ref,
        source_outcome_status: "verified",
        layer: iteration.layer,
        owner_surface: iteration.owner_surface,
        proposed_slice: iteration.proposed_slice,
        reusable_pattern: describeReusablePattern(iteration),
        evidence_refs: buildArtifactEvidenceRefs(iteration, outcome),
        verification_commands: compactRefs([
          ...iteration.verification_commands,
          ...outcome.verification_commands
        ]),
        next_use: outcome.next_moves[0] ?? "Use this artifact when planning a similar bounded GA project slice.",
        non_goals: compactRefs([
          ...dropHistoricalSourceSliceNonGoals(iteration.non_goals),
          "does not prove future GA project completion",
          "does not promote one-off external adapter behavior into core identity"
        ]),
        boundary: ARTIFACT_BOUNDARY
      };
    });
}

function hasReusableGaProjectDesignOutcome(iteration: SelfEvolutionIterationContract): boolean {
  return iteration.outcome?.status === "verified"
    && iteration.outcome.evidence_refs.length > 0
    && iteration.outcome.verification_commands.length > 0;
}

function buildSuccessorNonGoals(
  source: GaProjectDesignArtifact,
  contract: GaProjectDesignContract,
  tail: string[]
): string[] {
  return compactRefs([
    ...dropHistoricalSourceSliceNonGoals(source.non_goals),
    ...contract.non_goals,
    `${COMPLETED_SOURCE_SLICE_NON_GOAL_PREFIX}${source.proposed_slice}`,
    ...tail
  ]);
}

function buildSuccessorEvidenceRefs(source: GaProjectDesignArtifact): string[] {
  return compactRefs([
    source.source_iteration_ref,
    ...dropHistoricalIterationEvidenceRefs(source.evidence_refs, [source.source_iteration_ref])
  ]);
}

function buildArtifactEvidenceRefs(
  iteration: SelfEvolutionIterationContract,
  outcome: NonNullable<SelfEvolutionIterationContract["outcome"]>
): string[] {
  return compactRefs([
    iteration.ref,
    iteration.source_ref,
    ...dropHistoricalIterationEvidenceRefs(iteration.evidence_refs, [iteration.ref, iteration.source_ref]),
    ...dropHistoricalIterationEvidenceRefs(outcome.evidence_refs, [iteration.ref, iteration.source_ref])
  ]);
}

function dropHistoricalSourceSliceNonGoals(nonGoals: string[]): string[] {
  return nonGoals.filter((nonGoal) => !nonGoal.startsWith(COMPLETED_SOURCE_SLICE_NON_GOAL_PREFIX));
}

function dropHistoricalIterationEvidenceRefs(refs: string[], keepRefs: Array<string | undefined>): string[] {
  const keep = new Set(keepRefs.map((ref) => ref?.trim()).filter((ref): ref is string => Boolean(ref)));
  return refs.filter((ref) => keep.has(ref) || !isSelfEvolutionIterationRef(ref));
}

function isSelfEvolutionIterationRef(ref: string): boolean {
  return ref.startsWith("self-evolution/iterations/")
    || /(?:^|\/)iteration_contract_[^/]+\.json$/.test(ref);
}

function describeReusablePattern(iteration: SelfEvolutionIterationContract): string {
  return [
    `Layer ${iteration.layer} work under ${iteration.owner_surface}`,
    `with proposed slice ${iteration.proposed_slice}`,
    "must preserve explicit non-goals, cite direct evidence, run scoped verification, and persist the outcome before it is reused."
  ].join(" ");
}

function nextCoreGaDesignProposedSlice(source: GaProjectDesignArtifact): string {
  return `core_ga_design_next_slice_after_${sourceIterationSuffix(source)}`;
}

function sourceIterationSuffix(source: GaProjectDesignArtifact): string {
  const iterationId = sourceIterationId(source)
    ?? safeIdPart(source.id);
  const parts = iterationId.split("_");
  if (parts.length >= 4 && /^\d+$/.test(parts.at(-2) ?? "")) return parts.at(-1) ?? "source";
  return iterationId.replace(/^iteration_contract_/, "") || "source";
}

function sourceIterationFilename(source: GaProjectDesignArtifact): string | null {
  return source.source_iteration_ref.split("/").at(-1) ?? null;
}

function sourceIterationId(source: GaProjectDesignArtifact): string | null {
  return source.source_iteration_ref.match(/(iteration_contract_[^/.]+)/)?.[1] ?? null;
}

function safeIdPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function isCoreBasicLayer(layer: CapabilityLayer): boolean {
  return layer === "core_runtime" || layer === "basic_entrypoint";
}

function compactRefs(refs: Array<string | undefined>): string[] {
  return [...new Set(refs.map((ref) => ref?.trim()).filter((ref): ref is string => Boolean(ref)))];
}
