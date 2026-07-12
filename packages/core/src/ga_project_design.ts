import { isDeepStrictEqual } from "node:util";
import type { CapabilityLayer } from "./capabilities.js";
import { delegateAgentActionContract, delegateAgentAuthoringContract } from "./action_contracts.js";
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
  source_implementation_contract?: GaProjectDesignImplementationContract;
  reusable_pattern: string;
  evidence_refs: string[];
  verification_commands: string[];
  next_use: string;
  source_next_moves: string[];
  non_goals: string[];
  boundary: string;
}

export type GaProjectDesignPlanSourceKind = "verified_artifact" | "fresh_bootstrap";

interface GaProjectDesignPlanSource {
  kind: GaProjectDesignPlanSourceKind;
  id: string;
  source_iteration_ref: string;
  source_status: "verified" | "bootstrap";
  layer: CapabilityLayer;
  owner_surface: string;
  proposed_slice: string;
  implementation_contract?: GaProjectDesignImplementationContract;
  next_use: string;
  source_next_moves: string[];
  evidence_refs: string[];
  verification_commands: string[];
  non_goals: string[];
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
  delegation_contract?: GaProjectDesignDelegationImplementationContract;
  implementation_scope: string[];
  deferred_scope: string[];
  delivery_standard: string[];
  boundary: string;
}

export interface GaProjectDesignDelegationImplementationContract {
  action: "delegate_agent";
  lifecycle_steps: string[];
  task_context: {
    payload_keys: string[];
    task_max_chars: number;
    context_max_chars: number;
    task_required: string[];
    context_required: string[];
  };
  result: {
    output_keys: string[];
    summary_max_chars: number;
    findings_max_chars: number;
    dispatch_failure_kinds: string[];
    result_failure_kinds: string[];
  };
  completion_verification: {
    authority: "main_harness";
    check_ids: string[];
    recovery_requires: string[];
    delegated_refs_are_proof: false;
  };
  trace_replay: {
    required_metadata: string[];
    checks: string[];
    reads_delegated_artifact_bodies: false;
  };
  boundary: string;
}

export interface GaProjectDesignSourceContinuation {
  source_layer: CapabilityLayer;
  source_owner_surface: string;
  source_proposed_slice: string;
  source_iteration_ref: string;
  next_use: string;
  source_next_moves: string[];
  source_contract?: GaProjectDesignImplementationContract;
  carry_forward: string[];
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

export interface GaProjectDesignGeneralDelegationLoop {
  action: "delegate_agent";
  layer: "core_runtime";
  stage: "active";
  lifecycle_steps: string[];
  max_actions_per_round: number;
  task_contract: {
    max_chars: number;
    required: string[];
    reject_if: string[];
  };
  context_contract: {
    max_chars: number;
    required: string[];
    reject_if: string[];
  };
  result_contract: {
    summary_max_chars: number;
    findings_max_chars: number;
    required: string[];
    reject_if: string[];
  };
  dispatch_failure_kind_contract: {
    field: "dispatch_failure_kind";
    values: string[];
    required: string[];
    reject_if: string[];
  };
  result_failure_kind_contract: {
    field: "result_failure_kind";
    values: string[];
    required: string[];
    reject_if: string[];
  };
  runner_enforcement_contract: {
    instruction_boundary: string[];
    input_contract: string[];
    result_handling: string[];
    completion_gate: string[];
  };
  recovery_contract: {
    inputs: string[];
    required: string[];
    reject_if: string[];
  };
  replay_audit_contract: {
    metadata_source: string;
    required_metadata: string[];
    checks: string[];
    proof_boundary: string[];
  };
  completion_authority: string[];
  deferred_scope: string[];
  evidence_refs: string[];
  boundary: string;
}

export interface GaProjectDesignIterationRecordStatus {
  status: "not_recorded" | "open_iteration_available";
  implementation_contract_status?: "aligned" | "missing" | "drifted";
  implementation_contract_attention?: string[];
  id?: string;
  ref?: string;
  outcome_status?: "not_recorded";
  inspect_command?: string;
  audit_command?: string;
  record_command: string;
  boundary: string;
}

export interface GaProjectDesignGovernanceCleanupItem {
  id: string;
  ref: string;
  proposed_slice: string;
  source_ref?: string;
  created_at: string;
  superseded_by_ref: string;
  suggested_outcome_status: "partial";
  reason: string;
  inspect_command: string;
  boundary: string;
}

export interface GaProjectDesignGovernanceCleanup {
  superseded_open_iterations: GaProjectDesignGovernanceCleanupItem[];
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
  target_dimension_id: GaProjectDesignTargetDimensionId;
  target_slice_id: GaProjectDesignTargetSliceId;
  layer: CapabilityLayer;
  owner_surface: string;
  proposed_slice: string;
  source_kind: GaProjectDesignPlanSourceKind;
  source_artifact_id: string;
  source_iteration_ref: string;
  source_proposed_slice: string;
  planning_basis: string;
  goal_scope: GaProjectDesignGoalScope;
  implementation_contract: GaProjectDesignImplementationContract;
  source_continuation: GaProjectDesignSourceContinuation;
  iteration_focus: GaProjectDesignIterationFocus;
  capability_stage_plan: GaProjectDesignCapabilityStagePlan;
  general_delegation_loop: GaProjectDesignGeneralDelegationLoop;
  scorecard_basis: string[];
  selection_status: "ready" | "needs_attention";
  selection_reasons: string[];
  selection_checks: string[];
  layer_decision: GaProjectDesignLayerDecision;
  learning_authority: GaProjectDesignLearningAuthority;
  iteration_record_status: GaProjectDesignIterationRecordStatus;
  governance_cleanup: GaProjectDesignGovernanceCleanup;
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
const PLAN_BOUNDARY = "read-only GA project design planning packet; derived from the contract plus either verified core/basic artifacts or a fresh-state bootstrap source only; does not record iterations, execute commands, invoke models, create projects, schedule experts, mutate state, write repo files, or prove completion";
const COMPLETED_SOURCE_SLICE_NON_GOAL_PREFIX = "does not repeat completed source slice ";
const MIN_SOURCE_ARTIFACT_EVIDENCE_REFS = 2;
const MIN_SOURCE_ARTIFACT_VERIFICATION_COMMANDS = 2;
const SOURCE_COMPLETION_NEXT_MOVE_PATTERNS = [
  /\bcommit\b.*\b(after this slice|slice|implementation|outcome|health|runtime|repo|file)\b/i,
  /\brestart(?: resident)? runtime\b.*\b(onto commit|after this slice|post-commit)\b/i,
  /\brerun service health\b.*\b(after|post-commit|restart|outcome|commit)\b/i,
  /\bpost-commit\b.*\b(health|outcome refs?|service health|restart|merge)\b/i,
  /\bmerge .*?\b(health refs?|outcome refs?|post-commit health|service health)\b/i
];
const BOOTSTRAP_SOURCE_ID = "ga_design_bootstrap_contract_source";
const BOOTSTRAP_SOURCE_REF = "docs/RUNTIME_CONTRACT.md";
const BOOTSTRAP_SOURCE_SLICE = "fresh_state_no_verified_iteration";
const BOOTSTRAP_PROPOSED_SLICE = "core_ga_design_fresh_bootstrap";
type GaProjectDesignTargetDimensionId = "core_ga_design" | "basic_runtime_substrate" | "general_agent_delegation";
export type GaProjectDesignTargetSliceId =
  | "next_slice_core_ga_design"
  | "next_slice_basic_runtime_substrate"
  | "next_slice_general_agent_delegation";
interface GaProjectDesignPlanTarget {
  target_dimension_id: GaProjectDesignTargetDimensionId;
  target_slice_id: GaProjectDesignTargetSliceId;
  layer: CapabilityLayer;
  owner_surface: string;
}
const NEXT_CORE_GA_DESIGN_TARGET = {
  target_dimension_id: "core_ga_design",
  target_slice_id: "next_slice_core_ga_design",
  layer: "core_runtime",
  owner_surface: "ga_project_design"
} as const satisfies GaProjectDesignPlanTarget;
const NEXT_BASIC_RUNTIME_SUBSTRATE_TARGET = {
  target_dimension_id: "basic_runtime_substrate",
  target_slice_id: "next_slice_basic_runtime_substrate",
  layer: "basic_entrypoint",
  owner_surface: "ga_project_design"
} as const satisfies GaProjectDesignPlanTarget;
const NEXT_GENERAL_DELEGATION_TARGET = {
  target_dimension_id: "general_agent_delegation",
  target_slice_id: "next_slice_general_agent_delegation",
  layer: "core_runtime",
  owner_surface: "ga_project_design"
} as const satisfies GaProjectDesignPlanTarget;
const BASIC_RUNTIME_HEALTH_COMMAND = "pnpm run runtime -- service health --target runtime --state-root <state-root>";
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
        objective: "Tie completion claims to harness-known evidence refs, inspected files, command output, tests, and runtime state.",
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
      "general-agent delegation may provide bounded self-report observations, but main-thread verification keeps completion authority",
      "expert roles and multi-agent scheduling stay deferred until the general delegation loop is stable"
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
      "packages/core/src/delegate_agent_completion_gate.ts",
      "packages/core/src/delegate_agent_contract.ts",
      "packages/core/src/self_evolution_iterations.ts",
      "packages/core/src/self_evolution_scorecard.ts",
      "packages/runtime/src/runner.ts"
    ],
    boundary: BOUNDARY
  };
}

export async function getGaProjectDesignArtifactPacket(
  store: AgentStore,
  args: { artifactRef: string; limit?: number; scorecardNextCoreBasicSliceId?: string | null }
): Promise<GaProjectDesignArtifactPacket> {
  const readModel = await getGaProjectDesignReadModel(store, {
    limit: args.limit,
    scorecardNextCoreBasicSliceId: args.scorecardNextCoreBasicSliceId
  });
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
  args: { limit?: number; scorecardNextCoreBasicSliceId?: string | null } = {}
): Promise<GaProjectDesignReadModel> {
  await store.ensureLayout();
  const limit = Math.max(0, args.limit ?? 10);
  const contract = getGaProjectDesignContract();
  const iterations = await listSelfEvolutionIterations(store);
  const allArtifacts = deriveGaProjectDesignArtifacts(iterations.iterations);
  const artifacts = allArtifacts.slice(0, limit);
  const nextCoreBasicPlan = buildNextCoreBasicPlan(contract, allArtifacts, iterations.iterations, args.scorecardNextCoreBasicSliceId);
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
  iterations: SelfEvolutionIterationContract[],
  scorecardNextCoreBasicSliceId?: string | null
): GaProjectDesignPlanPacket | null {
  const source = selectNextCoreBasicPlanSource(artifacts, iterations);
  if (!source) return null;
  const target = selectNextCoreBasicPlanTarget(source, iterations, scorecardNextCoreBasicSliceId);
  const proposedSlice = source.kind === "fresh_bootstrap"
    ? BOOTSTRAP_PROPOSED_SLICE
    : nextProposedSlice(source, target);
  const nextIterationSeed = buildNextIterationSeed(contract, source, target, proposedSlice);
  const implementationContract = buildImplementationContract(source, target, proposedSlice);
  const iterationRecordStatus = buildIterationRecordStatus(iterations, nextIterationSeed, implementationContract);
  const governanceCleanup = buildGovernanceCleanup(iterations, source);
  const isFreshSuccessor = proposedSlice !== source.proposed_slice;
  const isTargetLayerReady = isCoreBasicLayer(target.layer);
  const isOpenIterationContractReady = iterationRecordStatus.status !== "open_iteration_available"
    || iterationRecordStatus.implementation_contract_status === "aligned";
  const selectionStatus = isFreshSuccessor && isTargetLayerReady && isOpenIterationContractReady
    ? "ready"
    : "needs_attention";
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
    `source_kind=${source.kind}`,
    `source_status=${source.source_status}`,
    `source_artifact_quality=${sourceArtifactQuality}`,
    `fresh_successor_slice=${isFreshSuccessor}`,
    `target_layer=${target.layer}`,
    `owner_surface=${target.owner_surface}`,
    `iteration_record_status=${iterationRecordStatus.status}`,
    ...(iterationRecordStatus.implementation_contract_status
      ? [`iteration_contract_status=${iterationRecordStatus.implementation_contract_status}`]
      : [])
  ];
  const acceptanceTrace = buildAcceptanceTrace();
  return {
    schema_version: 1,
    action: "project-design-plan",
    status: "advisory",
    id: `ga_design_plan_${safeIdPart(source.id)}`,
    title: `Next core/basic GA planning packet: ${proposedSlice}`,
    target_dimension_id: target.target_dimension_id,
    target_slice_id: target.target_slice_id,
    layer: target.layer,
    owner_surface: target.owner_surface,
    proposed_slice: proposedSlice,
    source_kind: source.kind,
    source_artifact_id: source.id,
    source_iteration_ref: source.source_iteration_ref,
    source_proposed_slice: source.proposed_slice,
    planning_basis: buildPlanningBasis(source, proposedSlice),
    goal_scope: buildGoalScope(source, target, proposedSlice),
    implementation_contract: implementationContract,
    source_continuation: buildSourceContinuation(source),
    iteration_focus: buildIterationFocus(source, proposedSlice),
    capability_stage_plan: buildCapabilityStagePlan(source, target, proposedSlice),
    general_delegation_loop: buildGeneralDelegationLoop(),
    scorecard_basis: buildScorecardBasis(target, scorecardNextCoreBasicSliceId),
    selection_status: selectionStatus,
    selection_reasons: selectionReasons,
    selection_checks: [
      source.kind === "verified_artifact"
        ? `source_artifact_verified=${source.source_status}; ref=${source.source_iteration_ref}`
        : `source_bootstrap_contract=true; ref=${source.source_iteration_ref}; proposed_slice=${proposedSlice}`,
      `source_artifact_evidence=evidence_refs:${source.evidence_refs.length}; verification_commands:${source.verification_commands.length}`,
      `source_artifact_warning_thresholds=evidence_refs:${MIN_SOURCE_ARTIFACT_EVIDENCE_REFS}; verification_commands:${MIN_SOURCE_ARTIFACT_VERIFICATION_COMMANDS}`,
      ...sourceArtifactWarnings,
      `fresh_successor_slice=${isFreshSuccessor}; source_slice=${source.proposed_slice}; target_slice=${proposedSlice}`,
      `target_layer=${target.layer}; owner_surface=${target.owner_surface}`,
      `iteration_record_status=${iterationRecordStatus.status}${iterationRecordStatus.ref ? `; ref=${iterationRecordStatus.ref}` : ""}`,
      ...(iterationRecordStatus.implementation_contract_status
        ? [`iteration_contract_status=${iterationRecordStatus.implementation_contract_status}; attention=${iterationRecordStatus.implementation_contract_attention?.join(",") || "none"}`]
        : []),
      `governance_cleanup_superseded_open_iterations=${governanceCleanup.superseded_open_iterations.length}`,
      "verification_entrypoints=project-design,scorecard,iterations,service-health,check"
    ],
    layer_decision: buildLayerDecision(source, target, proposedSlice, selectionStatus),
    learning_authority: buildLearningAuthority(),
    iteration_record_status: iterationRecordStatus,
    governance_cleanup: governanceCleanup,
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
      "packages/core/src/action_contracts.ts",
      "packages/core/src/delegate_agent_completion_gate.ts",
      "packages/core/src/delegate_agent_contract.ts",
      "packages/core/src/schemas.ts",
      "packages/runtime/src/runner.ts",
      "packages/core/src/live_run_trace.ts",
      "packages/core/src/harness_replay.ts",
      iterationRecordStatus.ref,
      ...nextIterationSeed.evidence_refs
    ]),
    boundary: PLAN_BOUNDARY
  };
}

function selectNextCoreBasicPlanSource(
  artifacts: GaProjectDesignArtifact[],
  iterations: SelfEvolutionIterationContract[]
): GaProjectDesignPlanSource | null {
  const sourceArtifact = artifacts.find((artifact) => isCoreBasicLayer(artifact.layer));
  if (sourceArtifact) return planSourceFromArtifact(sourceArtifact);
  const freshBootstrap = buildFreshBootstrapSource();
  const openBootstrapIteration = iterations.find((iteration) =>
    !iteration.outcome
    && iteration.layer === NEXT_CORE_GA_DESIGN_TARGET.layer
    && iteration.owner_surface === NEXT_CORE_GA_DESIGN_TARGET.owner_surface
    && iteration.proposed_slice === BOOTSTRAP_PROPOSED_SLICE
    && (iteration.source_ref ?? "") === freshBootstrap.source_iteration_ref
  );
  if (openBootstrapIteration) return freshBootstrap;
  if (iterations.length === 0) return buildFreshBootstrapSource();
  return null;
}

function planSourceFromArtifact(artifact: GaProjectDesignArtifact): GaProjectDesignPlanSource {
  return {
    kind: "verified_artifact",
    id: artifact.id,
    source_iteration_ref: artifact.source_iteration_ref,
    source_status: artifact.source_outcome_status,
    layer: artifact.layer,
    owner_surface: artifact.owner_surface,
    proposed_slice: artifact.proposed_slice,
    implementation_contract: artifact.source_implementation_contract,
    next_use: artifact.next_use,
    source_next_moves: artifact.source_next_moves,
    evidence_refs: artifact.evidence_refs,
    verification_commands: artifact.verification_commands,
    non_goals: artifact.non_goals
  };
}

function buildSourceContinuation(source: GaProjectDesignPlanSource): GaProjectDesignSourceContinuation {
  return {
    source_layer: source.layer,
    source_owner_surface: source.owner_surface,
    source_proposed_slice: source.proposed_slice,
    source_iteration_ref: source.source_iteration_ref,
    next_use: source.next_use,
    source_next_moves: source.source_next_moves,
    ...(source.implementation_contract ? { source_contract: source.implementation_contract } : {}),
    carry_forward: compactRefs([
      `source=${source.layer}/${source.owner_surface}`,
      `completed_slice=${source.proposed_slice}`,
      source.implementation_contract ? `source_contract=${source.implementation_contract.proposed_slice}` : "source_contract=not_recorded",
      `source_next_move_candidates=${source.source_next_moves.length}`,
      "do not repeat completed source slice",
      "use source next_use and source_next_moves as direction, not completion proof"
    ]),
    boundary: "read-only source-continuation summary for GA planning; carries forward the verified source layer, owner, completed slice, next-use hints, and optional implementation contract without executing work, mutating state, or proving completion"
  };
}

function buildFreshBootstrapSource(): GaProjectDesignPlanSource {
  return {
    kind: "fresh_bootstrap",
    id: BOOTSTRAP_SOURCE_ID,
    source_iteration_ref: BOOTSTRAP_SOURCE_REF,
    source_status: "bootstrap",
    layer: NEXT_CORE_GA_DESIGN_TARGET.layer,
    owner_surface: NEXT_CORE_GA_DESIGN_TARGET.owner_surface,
    proposed_slice: BOOTSTRAP_SOURCE_SLICE,
    next_use: "Use the GA project design contract itself to open the first bounded core/basic iteration before any SOP, skill, memory, dream, expert, or application slice is treated as the source.",
    source_next_moves: [
      "Use the GA project design contract itself to open the first bounded core/basic iteration before any SOP, skill, memory, dream, expert, or application slice is treated as the source."
    ],
    evidence_refs: [
      "packages/core/src/ga_project_design.ts",
      "docs/RUNTIME_CONTRACT.md",
      "docs/README.cn.md"
    ],
    verification_commands: [
      "pnpm run runtime -- governance project-design --state-root <state-root>",
      "pnpm run runtime -- governance scorecard --state-root <state-root>",
      "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>",
      BASIC_RUNTIME_HEALTH_COMMAND,
      "pnpm run check"
    ],
    non_goals: [
      "does not claim a verified source artifact exists",
      "does not promote SOPs, skills, memory, dreams, experts, or application adapters",
      "does not prove bootstrap slice completion without a later verified outcome record"
    ]
  };
}

function buildProjectDesignInspectionCommand(source: GaProjectDesignPlanSource): string {
  if (source.kind === "verified_artifact") {
    return `pnpm run runtime -- governance project-design --artifact ${source.id} --state-root <state-root>`;
  }
  return "pnpm run runtime -- governance project-design --state-root <state-root>";
}

function buildPlanningBasis(source: GaProjectDesignPlanSource, proposedSlice: string): string {
  if (source.kind === "fresh_bootstrap") {
    return `Use the GA project design contract as bootstrap source, then open ${proposedSlice} as the first core/basic slice. ${source.next_use}`;
  }
  return `Use ${source.id} as evidence, then choose a new core/basic slice instead of repeating completed slice ${source.proposed_slice}. ${source.next_use}`;
}

function buildScorecardBasis(
  target: GaProjectDesignPlanTarget,
  scorecardNextCoreBasicSliceId?: string | null
): string[] {
  return [
    `next_core_basic_slice=${scorecardNextCoreBasicSliceId ?? target.target_slice_id}`,
    ...(scorecardNextCoreBasicSliceId && scorecardNextCoreBasicSliceId !== target.target_slice_id
      ? [`plan_target_slice=${target.target_slice_id}`]
      : []),
    `target_dimension=${target.target_dimension_id}`,
    `target_layer=${target.layer}`,
    "scorecard_command=pnpm run runtime -- governance scorecard --state-root <state-root>"
  ];
}

function buildImplementationContract(
  source: GaProjectDesignPlanSource,
  target: GaProjectDesignPlanTarget,
  proposedSlice: string
): GaProjectDesignImplementationContract {
  return {
    proposed_slice: proposedSlice,
    source_artifact_id: source.id,
    source_proposed_slice: source.proposed_slice,
    selected_layer: target.layer,
    owner_surface: target.owner_surface,
    improvement_type: "reusable_ga_design_contract",
    ...(target.target_dimension_id === "general_agent_delegation"
      ? { delegation_contract: getGaProjectDesignDelegationImplementationContract() }
      : {}),
    implementation_scope: [
      "change one reusable GA project-design contract or read-model surface",
      ...(target.target_dimension_id === "general_agent_delegation"
        ? [
          "for general_agent_delegation, constrain delegate_agent task, context, result, trace/replay, or completion-verification boundaries only",
          "for general_agent_delegation, sync implementation with the runner-enforced task/context/result contract and main-harness completion gate"
        ]
        : []),
      "carry the change through audit guidance or context only when it improves output standardization",
      "cover the change with targeted tests, docs, outcome evidence, and runtime health"
    ],
    deferred_scope: [
      "no external adapter or tool integration unless it names a reusable runtime contract",
      "no SOP, skill, memory, or dream promotion before verified reuse evidence exists",
      "no expert-agent scheduling or delegation automation",
      ...(target.target_dimension_id === "general_agent_delegation"
        ? [
          "no delegated tool/write/mutation authority, delegated completion authority, model fan-out, autonomous scheduler, or expert persona"
        ]
        : [])
    ],
    delivery_standard: [
      "future iterations can inspect the contract without inferring intent from the opaque slice id",
      ...(target.target_dimension_id === "general_agent_delegation"
        ? [
          "future delegation iterations can see the allowed task/context/result/completion-verification surface from implementation_contract alone"
        ]
        : []),
      "verification maps to project-design, scorecard, iterations, service-health, and check entrypoints",
      "a verified outcome is recorded before the contract is reused as future GA design evidence"
    ],
    boundary: "read-only GA implementation contract; constrains the next slice before implementation but does not execute commands, write outcomes, promote learning artifacts, schedule experts, or prove completion"
  };
}

export function getGaProjectDesignDelegationImplementationContract(): GaProjectDesignDelegationImplementationContract {
  const loop = buildGeneralDelegationLoop();
  return {
    action: loop.action,
    lifecycle_steps: [...loop.lifecycle_steps],
    task_context: {
      payload_keys: [...delegateAgentActionContract.payload_keys],
      task_max_chars: loop.task_contract.max_chars,
      context_max_chars: loop.context_contract.max_chars,
      task_required: [...loop.task_contract.required],
      context_required: [...loop.context_contract.required]
    },
    result: {
      output_keys: [...delegateAgentActionContract.output_keys],
      summary_max_chars: loop.result_contract.summary_max_chars,
      findings_max_chars: loop.result_contract.findings_max_chars,
      dispatch_failure_kinds: [...loop.dispatch_failure_kind_contract.values],
      result_failure_kinds: [...loop.result_failure_kind_contract.values]
    },
    completion_verification: {
      authority: "main_harness",
      check_ids: [...delegateAgentActionContract.completion_gate_check_ids],
      recovery_requires: [...loop.recovery_contract.required],
      delegated_refs_are_proof: false
    },
    trace_replay: {
      required_metadata: [...loop.replay_audit_contract.required_metadata],
      checks: [...loop.replay_audit_contract.checks],
      reads_delegated_artifact_bodies: false
    },
    boundary: "read-only delegate_agent implementation boundary copied from the shared GA delegation loop; does not dispatch models, read delegated artifact bodies, grant delegated authority, or prove completion"
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
      seed_id: "current_state",
      phase_id: "capability_layering",
      criterion: "current_state: implementation contract bounds allowed scope, deferred scope, and delivery standard before outcome",
      required_entrypoints: ["project-design", "iterations", "workspace"],
      outcome_claim_prefixes: ["project-design:", "iterations:", "workspace:"]
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
  source: GaProjectDesignPlanSource,
  target: GaProjectDesignPlanTarget,
  proposedSlice: string
): GaProjectDesignGoalScope {
  return {
    objective: CORE_BASIC_SELF_EVOLUTION_OBJECTIVE,
    owner_surface: target.owner_surface,
    source_of_truth: [
      "operator_objective=core_basic_self_evolution_first",
      `source_artifact=${source.id}`,
      `source_kind=${source.kind}`,
      `source_iteration_ref=${source.source_iteration_ref}`,
      `scorecard_target=${target.target_dimension_id}/${target.target_slice_id}`
    ],
    success_evidence: [
      `fresh_successor_slice=true; source_slice=${source.proposed_slice}; target_slice=${proposedSlice}`,
      `selected_layer=${target.layer}; owner_surface=${target.owner_surface}`,
      "verified outcome records evidence refs and verification command coverage before reuse"
    ]
  };
}

function buildIterationFocus(
  source: GaProjectDesignPlanSource,
  proposedSlice: string
): GaProjectDesignIterationFocus {
  return {
    direction_id: "core_basic_plan_clarity",
    direction: "Clarify the next core/basic GA design improvement before implementation.",
    rationale: source.kind === "fresh_bootstrap"
      ? `The bootstrap successor ${proposedSlice} should be opened from the GA project design contract because no verified source iteration exists yet.`
      : `The successor ${proposedSlice} should be chosen from verified GA design evidence, while ${source.proposed_slice} remains completed source context only.`,
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
  source: GaProjectDesignPlanSource,
  target: GaProjectDesignPlanTarget,
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
          "the next slice cites the latest operator objective, a verified source artifact, or a fresh bootstrap source",
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
          "service health is inspected for the resident runtime target",
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
      `core_runtime[current_state]: choose one reusable ${target.target_dimension_id} improvement, not an external adapter task`,
      "core_runtime[general_agent_delegation]: audit and sync existing runner-enforced delegate_agent task/context/result/trace/replay/completion contract before expert specialization",
      "basic_entrypoint[verification_scope]: verify with project-design, scorecard, iteration audit, service health, and pnpm run check",
      "local_learning[learning_persistence]: record an iteration outcome before any SOP, skill, memory, or dream reuse"
    ]
  };
}

function buildGeneralDelegationLoop(): GaProjectDesignGeneralDelegationLoop {
  return {
    action: "delegate_agent",
    layer: "core_runtime",
    stage: "active",
    lifecycle_steps: [...delegateAgentActionContract.lifecycle_steps],
    max_actions_per_round: delegateAgentActionContract.max_actions_per_round,
    task_contract: {
      max_chars: delegateAgentActionContract.task_max_chars,
      required: [...delegateAgentAuthoringContract.task.required],
      reject_if: [...delegateAgentAuthoringContract.task.reject_if]
    },
    context_contract: {
      max_chars: delegateAgentActionContract.context_max_chars,
      required: [...delegateAgentAuthoringContract.context.required],
      reject_if: [...delegateAgentAuthoringContract.context.reject_if]
    },
    result_contract: {
      summary_max_chars: delegateAgentActionContract.summary_max_chars,
      findings_max_chars: delegateAgentActionContract.findings_max_chars,
      required: [
        "structured summary",
        "bounded findings_text",
        "main-thread verification before reuse",
        "passed delegated self-reports remain advisory context, not verification proof",
        "sanitized delegated observations carry proof_boundary so advisory and recovery-only results cannot be confused with completion evidence"
      ],
      reject_if: [
        "delegated output is not valid structured JSON",
        "summary or findings_text is empty or over the configured max chars",
        "summary or findings_text claims delegated tool, write, mutation, command/test execution, completion, expert, multi-agent, model fan-out authority, hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs",
        "result is treated as tool evidence, final success, or mutation authority",
        "delegated result id or ref is used as completion verification proof"
      ]
    },
    dispatch_failure_kind_contract: {
      field: "dispatch_failure_kind",
      values: [...delegateAgentActionContract.dispatch_kinds],
      required: [
        "record dispatch_limit_exceeded when the per-round delegate limit rejects an action",
        "record input_contract_failed when payload validation fails before delegated model dispatch",
        "record none when there is no dispatch-layer failure, including delegated output contract or model request failures after dispatch",
        "record model_invoked=false for input_contract_failed or dispatch_limit_exceeded and model_invoked=true only after dispatch reaches the delegated model call",
        "harness replay checks dispatch_failure_kind coverage and pair consistency with result_failure_kind without reading delegated result bodies"
      ],
      reject_if: [
        "operators must infer dispatch failure type from free-form error text",
        "dispatch failure kind is treated as expert scheduling, retry authority, or completion proof"
      ]
    },
    result_failure_kind_contract: {
      field: "result_failure_kind",
      values: [...delegateAgentActionContract.result_kinds],
      required: [
        "record dispatch_limit_exceeded when the per-round delegate limit creates the failed result",
        "record input_contract_failed when payload or authority validation creates the failed result",
        "record delegated_output_contract_failed when the delegated model returned invalid or over-limit structured output",
        "record delegated_model_request_failed when the delegated model request failed before output validation",
        "record none for passed delegated results as an explicit no-result-failure kind",
        "mirror dispatch_failure_kind for dispatch-layer failures and require dispatch_failure_kind=none for delegated output/model failures"
      ],
      reject_if: [
        "operators must infer result failure type from raw delegated artifact bodies",
        "result failure kind grants retry, expert scheduling, or completion authority"
      ]
    },
    runner_enforcement_contract: {
      instruction_boundary: [
        "liveInstructions states the model proposes while the harness executes, verifies, audits, and promotes",
        "delegate_agent is separate from use_tool and does not grant tool/write/mutation/completion authority",
        "subagent instructions limit delegated analysis to the provided Task/Context text and named evidence refs already present there",
        "subagent instructions require exactly one strict JSON object with only summary/findings_text and no Markdown, code fence, wrapper prose, or extra keys",
        "delegated tasks cannot schedule expert or autonomous multi-agent work"
      ],
      input_contract: [...delegateAgentAuthoringContract.runner_input_contract],
      result_handling: [
        "delegate_agent contract helper scans the full delegated output before strict full JSON-object parsing, rejects wrapper prose, code fences, extra fields, or structured content that echo raw task/context or claim delegated output authority, command/test execution, or forbidden-source reliance, suppresses raw previews for unsupported output fields, and executeDelegation sanitizes successful summary/findings before persistence or observation",
        "rejectedDelegationResult records failed input contracts without calling the delegated model",
        "delegatedObservationForModelInput excludes raw task, context, output preview, and persisted artifact bodies while adding proof_boundary for advisory-only or recovery-only use"
      ],
      completion_gate: [
        "delegate_agent completion-gate helper fails a done claim when delegated failure lacks later main-harness recovery evidence",
        "delegate_agent completion-gate helper rejects exact delegated result ids or persisted delegated result refs as completion proof without treating substring lookalikes as delegated proof",
        "delegate_agent completion-gate helper fails a done claim after delegation without later harness-known non-delegated verification refs after the latest delegated result; successful write/run evidence only counts when its harness-known ref is cited, and failed delegation still requires later successful write/run recovery evidence plus bound non-delegated verification refs"
      ]
    },
    recovery_contract: {
      inputs: [
        "sanitized delegated observation",
        "proof_boundary",
        "result_failure_kind",
        "dispatch_failure_kind",
        "harness replay check status"
      ],
      required: [
        "failed delegated results may only guide a later main-harness model round as sanitized observation",
        delegateAgentAuthoringContract.recovery.failure_hint,
        "state-only harness actions and read-only tool refs can preserve context but cannot recover a failed delegated result",
        "a recovered claim must not cite the delegated result id or ref as completion proof"
      ],
      reject_if: [
        "state-only harness or governance actions are used as failed-delegation recovery evidence",
        "read-only tool refs are used as failed-delegation recovery evidence",
        "automatic retry, model fan-out, expert scheduling, or delegated completion is added",
        "raw delegated task, context, output preview, or artifact body is read to decide recovery"
      ]
    },
    replay_audit_contract: {
      metadata_source: "Live Run Trace delegated result refs and dispatch metadata derived from completion reports, harness-owned delegated_result event summaries, and delegate_agent action ids from model-action envelope metadata only",
      required_metadata: [
        "action_id",
        "envelope_ref",
        "delegated_action_ids",
        "delegated_action_sequence_by_id",
        "delegated_result_refs",
        "delegated_result_report_refs",
        "delegated_result_event_fallback_refs",
        "claimed_verification_refs",
        "verification_evidence_refs",
        "tool_result_id",
        "artifact_ref",
        "event_id",
        "round",
        "sequence",
        "task_chars",
        "context_chars",
        "model_invoked",
        "contract_status",
        "dispatch_failure_kind",
        "result_failure_kind",
        "recovery_guidance",
        "model_input",
        "side_effect_level",
        "is_write_run",
        "counts_as_independent_evidence",
        "counts_as_failed_delegation_recovery",
        "result_id",
        "result_ref",
        "ok"
      ],
      checks: [
        "delegated_completion_gate",
        "verification_evidence_lineage",
        "delegated_action_coverage",
        "delegated_result_ref_coverage",
        "delegated_dispatch_metadata",
        "delegated_model_invocation_boundary",
        "delegated_dispatch_lineage",
        "delegated_dispatch_failure_kind",
        "delegated_dispatch_round_limit",
        "delegated_result_failure_kind",
        "delegated_recovery_guidance",
        "delegated_observation_input_lineage",
        "model_action_envelope_integrity",
        "model_action_event_binding",
        "model_diagnostic_integrity",
        "delegated_results"
      ],
      proof_boundary: [
        "Live Run Trace exposes safe delegated dispatch metadata, model-action envelope refs, delegate_agent action ids and sequence mapping, failure kinds, exact result ids and refs, and per-round action counts without reading delegated artifact bodies",
        "completion reports keep delegated_result_refs separate from generic observation_refs so delegated self-reports remain advisory metadata rather than completion proof",
        "completion reports preserve verification_evidence_refs for harness-known tool result ids and artifact refs, including tool, round, event id, side-effect level, claimed flag, and independent/recovery proof flags",
        "replay audit warns when a passed delegated-independent gate lacks matching claimed tool-lineage metadata",
        "replay audit warns when delegated dispatch result refs are only recovered from delegated_result event fallback and missing from completion report delegated_result_refs",
        "replay audit warns when completion report delegated_result_refs do not match any delegated_result event dispatch result_ref",
        "trace and replay audit JSON preserve the full delegated dispatch metadata set, including exact delegated result ids and explicit persisted result refs; older evidence without result ids remains readable but receives replay attention",
        "replay audit warns when input-contract or per-round-limit rejected dispatches claim model_invoked=true or when a post-dispatch result claims model_invoked=false",
        "replay audit warns when a delegated dispatch lacks a model-action envelope ref, points at a missing model-action round, points at a round without delegate_agent actions, points at a different round envelope, uses an action_id not declared by the round envelope delegate_agent actions, or reports a sequence that does not match the declared delegate action order",
        "replay audit warns when a model-action envelope cannot be read or fails schema validation while preserving only its safe ref, never the envelope body or parser details",
        "trace inventories persisted current-session model-action envelopes so replay warns when an envelope lacks an event, has duplicate event bindings, or its event binds more than one envelope before trusting input metadata",
        "replay audit warns when a model-diagnostic artifact cannot be read while preserving only its safe ref, never the diagnostic body or read error",
        "replay audit warns when a delegated dispatch lacks a persisted delegated result JSON artifact ref",
        "operator Markdown/context views may cap rendered dispatch rows with an omitted count",
        "replay audit warns when dispatch_failure_kind and result_failure_kind are legal but semantically mismatched",
        "replay audit records only recovery_guidance=main_harness_recovery for failed delegated dispatches and warns when it is missing or inconsistent without persisting recovery hint text",
        "later model-action events persist only delegated observation result ids and recovery-guidance result ids; replay warns when their lineage disagrees without reading model input or delegated bodies",
        "replay audit must not read delegated result artifact bodies or raw delegated task/context/output"
      ]
    },
    completion_authority: [
      "main harness verifies delegated results before they influence a done claim",
        "failed delegated results block verified completion until later main-harness recovery evidence and bound non-delegated verification refs exist",
      "SOP audit, SOP promotion, skill promotion, and active-vault writes require verified done completion and cannot run from skipped, blocked, or failed-delegation-warning reports",
      "passed delegated results can inform the next model round but do not prove completion",
      "completion remains with iteration outcome plus completion_gate coverage"
    ],
    deferred_scope: [
      "no expert personas",
      "no autonomous multi-agent scheduling",
      "no tool access or external write authority for delegated self-reports"
    ],
    evidence_refs: [
      "packages/core/src/action_contracts.ts",
      "packages/core/src/delegate_agent_completion_gate.ts",
      "packages/core/src/delegate_agent_contract.ts",
      "packages/core/src/schemas.ts",
      "packages/core/src/live_run_trace.ts",
      "packages/runtime/src/runner.ts",
      "packages/core/src/harness_replay.ts",
      "tests/context_harness.test.ts",
      "tests/harness_replay.test.ts"
    ],
    boundary: "read-only general-agent delegation loop guard for project-design planning; describes delegate_agent task/context/result/completion standards only and does not spawn agents, execute tools, schedule experts, mutate state, or prove completion"
  };
}

function buildLayerDecision(
  source: GaProjectDesignPlanSource,
  target: GaProjectDesignPlanTarget,
  proposedSlice: string,
  selectionStatus: GaProjectDesignPlanPacket["selection_status"]
): GaProjectDesignLayerDecision {
  return {
    selected_layer: target.layer,
    selected_owner_surface: target.owner_surface,
    source_layer: source.layer,
    source_owner_surface: source.owner_surface,
    source_proposed_slice: source.proposed_slice,
    proposed_slice: proposedSlice,
    core_identity: "recurring_ga_project_design",
    stage: selectionStatus === "ready" ? "core_basic_successor_ready" : "needs_attention",
    reasons: [
      "core identity is the reusable GA project-design loop, not a single external adapter",
      "the next slice is a core/basic successor because it improves design classification, planning, or verification reuse",
      `source_layer=${source.layer}; selected_layer=${target.layer}`
    ],
    application_boundaries: [
      "external tools and adapters stay application slices unless a reusable runtime contract is named",
      "SOP, skill, memory, and dream promotion follows only after core/basic evidence supports reuse; expert and multi-agent scheduling follow after the general delegation loop is stable"
    ],
    required_before_outcome: [
      buildProjectDesignInspectionCommand(source),
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
  seed: GaProjectDesignIterationSeed,
  expectedContract: GaProjectDesignImplementationContract
): GaProjectDesignIterationRecordStatus {
  const openIteration = iterations.find((iteration) =>
    !iteration.outcome
    && iteration.layer === seed.layer
    && iteration.owner_surface === seed.owner_surface
    && iteration.proposed_slice === seed.proposed_slice
    && (iteration.source_ref ?? "") === seed.source_ref
  );
  if (openIteration) {
    let implementationContractStatus: NonNullable<GaProjectDesignIterationRecordStatus["implementation_contract_status"]> = "aligned";
    if (!openIteration.implementation_contract) implementationContractStatus = "missing";
    else if (!isDeepStrictEqual(openIteration.implementation_contract, expectedContract)) implementationContractStatus = "drifted";
    const implementationContractAttention: string[] = [];
    if (implementationContractStatus === "missing") implementationContractAttention.push("implementation_contract_missing");
    else if (implementationContractStatus === "drifted") implementationContractAttention.push("implementation_contract_differs_from_current_plan");
    return {
      status: "open_iteration_available",
      implementation_contract_status: implementationContractStatus,
      implementation_contract_attention: implementationContractAttention,
      id: openIteration.id,
      ref: openIteration.ref,
      outcome_status: "not_recorded",
      inspect_command: `pnpm run runtime -- governance iterations --iteration ${openIteration.id} --state-root <state-root>`,
      audit_command: `pnpm run runtime -- governance iterations --iteration ${openIteration.id} --audit-seed all --state-root <state-root>`,
      record_command: seed.record_command,
      boundary: "read-only GA project design iteration record status; detects a matching open iteration and compares its implementation contract with the current authoritative plan before selection; does not repair state, write outcomes, or prove completion"
    };
  }
  return {
    status: "not_recorded",
    record_command: seed.record_command,
    boundary: "read-only GA project design iteration record status; no matching open iteration was found; does not write state or prove completion"
  };
}

function buildGovernanceCleanup(
  iterations: SelfEvolutionIterationContract[],
  source: GaProjectDesignPlanSource
): GaProjectDesignGovernanceCleanup {
  const sourceIteration = iterations.find((iteration) => iteration.ref === source.source_iteration_ref);
  const superseded = sourceIteration
    ? iterations
      .filter((iteration) => isSupersededOpenGaIteration(iteration, sourceIteration, source))
      .map((iteration) => buildGovernanceCleanupItem(iteration, sourceIteration))
    : [];
  return {
    superseded_open_iterations: superseded.slice(0, 5),
    boundary: "read-only GA project-design governance cleanup summary; lists open GA iterations already superseded by a newer verified core/basic source artifact; does not record outcomes, mutate state, or prove cleanup completion"
  };
}

function isSupersededOpenGaIteration(
  candidate: SelfEvolutionIterationContract,
  sourceIteration: SelfEvolutionIterationContract,
  source: GaProjectDesignPlanSource
): boolean {
  return !candidate.outcome
    && isCoreBasicLayer(candidate.layer)
    && candidate.owner_surface === "ga_project_design"
    && isGaProjectDesignSuccessorSlice(candidate.proposed_slice)
    && candidate.created_at < sourceIteration.created_at
    && sourceMentionsCleanupCandidate(source, candidate);
}

function isGaProjectDesignSuccessorSlice(proposedSlice: string): boolean {
  return proposedSlice.startsWith("core_ga_design_next_slice_after_")
    || proposedSlice.startsWith("basic_runtime_substrate_hardening_after_")
    || proposedSlice.startsWith("general_agent_delegation_hardening_after_");
}

function sourceMentionsCleanupCandidate(
  source: GaProjectDesignPlanSource,
  candidate: SelfEvolutionIterationContract
): boolean {
  const sourceText = [
    source.next_use,
    ...source.source_next_moves,
    ...source.evidence_refs
  ].join("\n");
  return sourceText.includes(candidate.id) || sourceText.includes(candidate.ref);
}

function buildGovernanceCleanupItem(
  iteration: SelfEvolutionIterationContract,
  sourceIteration: SelfEvolutionIterationContract
): GaProjectDesignGovernanceCleanupItem {
  return {
    id: iteration.id,
    ref: iteration.ref,
    proposed_slice: iteration.proposed_slice,
    ...(iteration.source_ref ? { source_ref: iteration.source_ref } : {}),
    created_at: iteration.created_at,
    superseded_by_ref: sourceIteration.ref,
    suggested_outcome_status: "partial",
    reason: `Open GA iteration ${iteration.id} predates verified source ${sourceIteration.id}; keep it as governance cleanup instead of treating it as the active successor blocker.`,
    inspect_command: `pnpm run runtime -- governance iterations --iteration ${iteration.id} --state-root <state-root>`,
    boundary: "read-only superseded open iteration cleanup item; suggests partial outcome review but does not write state or verify the stale slice"
  };
}

function buildNextIterationSeed(
  contract: GaProjectDesignContract,
  source: GaProjectDesignPlanSource,
  target: GaProjectDesignPlanTarget,
  proposedSlice: string
): GaProjectDesignIterationSeed {
  return {
    summary: source.kind === "fresh_bootstrap"
      ? `Open first core/basic GA design bootstrap slice ${proposedSlice} from the GA project design contract.`
      : `Open next core/basic ${target.target_dimension_id} slice ${proposedSlice} from verified project-design artifact ${source.id}.`,
    layer: target.layer,
    owner_surface: target.owner_surface,
    proposed_slice: proposedSlice,
    source_ref: source.source_iteration_ref,
    evidence_refs: buildSuccessorEvidenceRefs(source),
    verification_commands: [
      buildProjectDesignInspectionCommand(source),
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
  source: GaProjectDesignPlanSource,
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
        `implementation_contract.proposed_slice=${proposedSlice}`,
        "implementation_contract names selected_layer, implementation_scope, deferred_scope, and delivery_standard before implementation",
        "outcome explains how the delivered change stayed inside implementation_scope and did not enter deferred_scope",
        "service health status and reasons when resident runtime behavior changed",
        "service health status and reasons when service health is a required verification command",
        "runtime attention classification is acceptable, repair_needed, or verification_blocker when service health is not healthy",
        "runtime attention handling says why acceptable is safe, what repair_needed follows up, or why verification_blocker stops the outcome",
        "repair_needed handling names a follow-up action or explains why no follow-up is required"
      ],
      reject_if: [
        "older memory is the only evidence",
        "implementation_contract.proposed_slice does not match the iteration proposed slice",
        "implementation_contract is missing selected_layer, implementation_scope, deferred_scope, or delivery_standard",
        "outcome claims changes outside implementation_contract without a later-layer iteration contract",
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
        "outcome maps each required verification entrypoint to a completion claim",
        "claimed verification refs resolve to harness-known tool result ids or tool artifact refs"
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
      const sourceNextMoves = sourcePlanningNextMoves(outcome.next_moves);
      return {
        id: `ga_design_artifact_${safeIdPart(iteration.id)}`,
        title: `Reusable GA project design: ${iteration.proposed_slice}`,
        source_iteration_ref: iteration.ref,
        source_outcome_status: "verified",
        layer: iteration.layer,
        owner_surface: iteration.owner_surface,
        proposed_slice: iteration.proposed_slice,
        ...(iteration.implementation_contract ? { source_implementation_contract: iteration.implementation_contract } : {}),
        reusable_pattern: describeReusablePattern(iteration),
        evidence_refs: buildArtifactEvidenceRefs(iteration, outcome),
        verification_commands: compactRefs([
          ...iteration.verification_commands,
          ...outcome.verification_commands
        ]),
        next_use: sourceNextMoves[0] ?? defaultSourcePlanningNextMove(),
        source_next_moves: sourceNextMoves,
        non_goals: compactRefs([
          ...dropHistoricalSourceSliceNonGoals(iteration.non_goals),
          "does not prove future GA project completion",
          "does not promote one-off external adapter behavior into core identity"
        ]),
        boundary: ARTIFACT_BOUNDARY
      };
    });
}

function sourcePlanningNextMoves(nextMoves: string[]): string[] {
  const filtered = nextMoves.filter((move) =>
    !SOURCE_COMPLETION_NEXT_MOVE_PATTERNS.some((pattern) => pattern.test(move))
  );
  return compactRefs(filtered.length > 0 ? filtered : [defaultSourcePlanningNextMove()]);
}

function defaultSourcePlanningNextMove(): string {
  return "Use this verified artifact as evidence for a fresh bounded core/basic successor slice without repeating the completed source slice.";
}

function hasReusableGaProjectDesignOutcome(iteration: SelfEvolutionIterationContract): boolean {
  return iteration.outcome?.status === "verified"
    && iteration.outcome.evidence_refs.length > 0
    && iteration.outcome.verification_commands.length > 0;
}

function buildSuccessorNonGoals(
  source: GaProjectDesignPlanSource,
  contract: GaProjectDesignContract,
  tail: string[]
): string[] {
  return compactRefs([
    ...dropHistoricalSourceSliceNonGoals(source.non_goals),
    ...contract.non_goals,
    source.kind === "verified_artifact"
      ? `${COMPLETED_SOURCE_SLICE_NON_GOAL_PREFIX}${source.proposed_slice}`
      : "does not treat the bootstrap source as a verified completed slice",
    ...tail
  ]);
}

function buildSuccessorEvidenceRefs(source: GaProjectDesignPlanSource): string[] {
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

function selectNextCoreBasicPlanTarget(
  source: GaProjectDesignPlanSource,
  iterations: SelfEvolutionIterationContract[],
  scorecardNextCoreBasicSliceId?: string | null
): GaProjectDesignPlanTarget {
  if (source.kind === "fresh_bootstrap") return NEXT_CORE_GA_DESIGN_TARGET;
  const openIterationTarget = selectOpenIterationPlanTarget(source, iterations);
  if (openIterationTarget) return openIterationTarget;
  if (scorecardNextCoreBasicSliceId === NEXT_GENERAL_DELEGATION_TARGET.target_slice_id) {
    return NEXT_GENERAL_DELEGATION_TARGET;
  }
  if (scorecardNextCoreBasicSliceId === NEXT_BASIC_RUNTIME_SUBSTRATE_TARGET.target_slice_id) {
    return NEXT_BASIC_RUNTIME_SUBSTRATE_TARGET;
  }
  if (scorecardNextCoreBasicSliceId === NEXT_CORE_GA_DESIGN_TARGET.target_slice_id) {
    return NEXT_CORE_GA_DESIGN_TARGET;
  }
  if (scorecardNextCoreBasicSliceId) return NEXT_CORE_GA_DESIGN_TARGET;
  return NEXT_GENERAL_DELEGATION_TARGET;
}

function selectOpenIterationPlanTarget(
  source: GaProjectDesignPlanSource,
  iterations: SelfEvolutionIterationContract[]
): GaProjectDesignPlanTarget | null {
  return [NEXT_GENERAL_DELEGATION_TARGET, NEXT_BASIC_RUNTIME_SUBSTRATE_TARGET, NEXT_CORE_GA_DESIGN_TARGET].find((target) =>
    iterations.some((iteration) =>
      !iteration.outcome
      && iteration.layer === target.layer
      && iteration.owner_surface === target.owner_surface
      && iteration.source_ref === source.source_iteration_ref
      && iteration.proposed_slice === nextProposedSlice(source, target)
    )
  ) ?? null;
}

function nextProposedSlice(source: GaProjectDesignPlanSource, target: GaProjectDesignPlanTarget): string {
  if (target.target_dimension_id === "general_agent_delegation") {
    return `general_agent_delegation_hardening_after_${sourceIterationSuffix(source)}`;
  }
  if (target.target_dimension_id === "basic_runtime_substrate") {
    return `basic_runtime_substrate_hardening_after_${sourceIterationSuffix(source)}`;
  }
  return nextCoreGaDesignProposedSlice(source);
}

function nextCoreGaDesignProposedSlice(source: GaProjectDesignPlanSource): string {
  return `core_ga_design_next_slice_after_${sourceIterationSuffix(source)}`;
}

function sourceIterationSuffix(source: GaProjectDesignPlanSource): string {
  const iterationId = sourceIterationId(source)
    ?? safeIdPart(source.id);
  const parts = iterationId.split("_");
  if (parts.length >= 4 && /^\d+$/.test(parts.at(-2) ?? "")) return parts.at(-1) ?? "source";
  return iterationId.replace(/^iteration_contract_/, "") || "source";
}

function sourceIterationFilename(source: GaProjectDesignArtifact | GaProjectDesignPlanSource): string | null {
  return source.source_iteration_ref.split("/").at(-1) ?? null;
}

function sourceIterationId(source: GaProjectDesignArtifact | GaProjectDesignPlanSource): string | null {
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
