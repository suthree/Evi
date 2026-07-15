export type ExpertOrchestrationRoleId =
  | "architect"
  | "runtime_operator"
  | "learning_curator"
  | "verification_reviewer"
  | "orchestration_planner";

export interface ExpertOrchestrationRole {
  id: ExpertOrchestrationRoleId;
  title: string;
  status: "implemented";
  focus: string;
  allowed_inputs: string[];
  responsibilities: string[];
  forbidden_authority: string[];
}

export interface ExpertDelegationGate {
  id: string;
  title: string;
  trigger: string;
  roles: ExpertOrchestrationRoleId[];
  required_inputs: string[];
  expected_output: string[];
  reject_if: string[];
  completion_authority: string;
}

export interface ExpertOrchestrationContract {
  schema_version: 1;
  contract_id: "expert_orchestration_contract";
  contract_version: "2026-07-06";
  action: "experts";
  status: "implemented";
  layer: "core_runtime";
  title: string;
  summary: string;
  roles: ExpertOrchestrationRole[];
  delegation_gates: ExpertDelegationGate[];
  scheduling_policy: string[];
  verification_policy: string[];
  non_goals: string[];
  commands: string[];
  refs: string[];
  boundary: string;
}

export interface ExpertDelegationPlan {
  schema_version: 1;
  action: "expert-delegation-plan";
  status: "advisory";
  gate_id: string;
  title: string;
  trigger: string;
  role_ids: ExpertOrchestrationRoleId[];
  roles: ExpertOrchestrationRole[];
  required_inputs: string[];
  expected_output: string[];
  reject_if: string[];
  completion_authority: string;
  verification_surface: string[];
  next_command: string;
  non_goals: string[];
  refs: string[];
  boundary: string;
}

const BOUNDARY = "read-only expert orchestration contract; does not invoke models, spawn agents, execute tools, schedule parallel work, mutate state, write repo files, write the active vault, manage services, promote SOPs, promote skills, or prove completion";

export function getExpertOrchestrationContract(): ExpertOrchestrationContract {
  return {
    schema_version: 1,
    contract_id: "expert_orchestration_contract",
    contract_version: "2026-07-06",
    action: "experts",
    status: "implemented",
    layer: "core_runtime",
    title: "Expert orchestration contract",
    summary: "Defines advisory expert roles, scheduling boundaries, and main-thread verification authority for future multi-expert project design work.",
    roles: [
      {
        id: "architect",
        title: "Architect",
        status: "implemented",
        focus: "Core project design, domain boundaries, and reusable runtime contracts.",
        allowed_inputs: [
          "capability catalog",
          "self-evolution scorecard",
          "runtime contract docs",
          "accepted semantic memory",
          "dream snapshots"
        ],
        responsibilities: [
          "separate core/runtime design work from application slices",
          "name the owner surface and bounded contract before implementation",
          "surface when a proposed slice would change agent identity or runtime authority"
        ],
        forbidden_authority: [
          "cannot redefine the self-growing agent core alone",
          "cannot approve external writes",
          "cannot close completion claims"
        ]
      },
      {
        id: "runtime_operator",
        title: "Runtime operator",
        status: "implemented",
        focus: "Local service, CLI, workspace, context, and health observability.",
        allowed_inputs: [
          "service health",
          "workspace status",
          "context manifests",
          "governance status",
          "targeted command output"
        ],
        responsibilities: [
          "state which local runtime checks must pass",
          "distinguish code/test readiness from credential-backed environment readiness",
          "keep resident service and operator surfaces observable after contract changes"
        ],
        forbidden_authority: [
          "cannot restart services without an explicit operator or harness action",
          "cannot read secrets",
          "cannot treat stale health as success"
        ]
      },
      {
        id: "learning_curator",
        title: "Learning curator",
        status: "implemented",
        focus: "SOP persistence, skill promotion, semantic memory, and dream continuity.",
        allowed_inputs: [
          "SOP evolution ledger",
          "skill registry health",
          "operator corrections",
          "accepted semantic memory",
          "dream snapshots"
        ],
        responsibilities: [
          "identify repeated corrections that deserve SOP candidates",
          "keep promoted skills and semantic memory evidence-backed",
          "prevent application-slice lessons from being mislabeled as core runtime capability"
        ],
        forbidden_authority: [
          "cannot promote SOPs or skills without explicit gates",
          "cannot accept semantic memory without confirmation",
          "cannot write the active vault"
        ]
      },
      {
        id: "verification_reviewer",
        title: "Verification reviewer",
        status: "implemented",
        focus: "Evidence strength, behavioral regressions, boundaries, and completion claims.",
        allowed_inputs: [
          "test results",
          "runtime command output",
          "evidence refs",
          "review history",
          "opportunity backlog items"
        ],
        responsibilities: [
          "state which claim remains unverified",
          "tie completion to executed evidence instead of model assertions",
          "flag when a proposed result only proves an application slice"
        ],
        forbidden_authority: [
          "cannot mark work complete without evidence",
          "cannot replace targeted checks with reasoning",
          "cannot suppress unresolved boundary risks"
        ]
      },
      {
        id: "orchestration_planner",
        title: "Orchestration planner",
        status: "implemented",
        focus: "When and how to request bounded expert critique without surrendering main-thread authority.",
        allowed_inputs: [
          "current goal",
          "available expert roles",
          "context budget",
          "risk and uncertainty notes",
          "scorecard next iterations"
        ],
        responsibilities: [
          "choose at most the roles that materially reduce uncertainty",
          "keep expert output advisory until verified by the main runtime",
          "avoid fan-out when a simple main-thread check is cheaper"
        ],
        forbidden_authority: [
          "cannot spawn autonomous experts",
          "cannot schedule parallel model calls",
          "cannot execute delegated recommendations"
        ]
      }
    ],
    delegation_gates: [
      {
        id: "core_boundary_review",
        title: "Core boundary review",
        trigger: "Use when proposed work could change core/basic/local-learning/application classification or promote an external adapter into core identity.",
        roles: ["architect", "verification_reviewer"],
        required_inputs: [
          "project design contract",
          "capability catalog",
          "self-evolution scorecard next_slices",
          "current worktree or runtime state when relevant"
        ],
        expected_output: [
          "recommended capability layer",
          "owner surface and proposed slice",
          "boundary risks and verification evidence to inspect"
        ],
        reject_if: [
          "the request is only an application-tool execution",
          "current state was not inspected when the claim depends on it",
          "the output tries to approve completion"
        ],
        completion_authority: "main runtime verifies with inspected evidence before any completion claim"
      },
      {
        id: "runtime_health_review",
        title: "Runtime health review",
        trigger: "Use when service, CLI, workspace, context, or operator surfaces change.",
        roles: ["runtime_operator", "verification_reviewer"],
        required_inputs: [
          "service health or workspace status",
          "targeted command output",
          "changed runtime contract refs"
        ],
        expected_output: [
          "runtime substrate versus application-slice assessment",
          "required restart or health-check command",
          "remaining attention reasons"
        ],
        reject_if: [
          "health data is stale or missing",
          "the output asks to read secrets or raw logs without a separate gate",
          "the output treats dirty or stale runtime state as success"
        ],
        completion_authority: "main runtime re-runs the relevant health or workspace check"
      },
      {
        id: "learning_persistence_review",
        title: "Learning persistence review",
        trigger: "Use when a correction or repeated gap might become SOP, skill, semantic memory, or dream context.",
        roles: ["learning_curator", "verification_reviewer"],
        required_inputs: [
          "operator correction or gap ref",
          "SOP evolution ledger",
          "skill registry or memory confirmation state",
          "latest dream when long-horizon direction matters"
        ],
        expected_output: [
          "whether the lesson is reusable or one-off",
          "the next explicit gate to request",
          "evidence refs required before promotion"
        ],
        reject_if: [
          "the lesson is only one application artifact",
          "promotion would skip audit or confirmation gates",
          "the output writes active-vault, skill, or memory state"
        ],
        completion_authority: "main runtime executes explicit SOP, skill, memory, or dream gates separately"
      },
      {
        id: "delegation_budget_review",
        title: "Delegation budget review",
        trigger: "Use when multiple expert lenses are possible and context or prompt budget matters.",
        roles: ["orchestration_planner", "verification_reviewer"],
        required_inputs: [
          "current goal",
          "scorecard next_slices",
          "known uncertainty",
          "available verification surface"
        ],
        expected_output: [
          "smallest useful role set",
          "reason delegation beats a direct main-thread check",
          "verification surface that can accept or reject the advice"
        ],
        reject_if: [
          "a single local command can resolve the uncertainty",
          "parallel fan-out is requested",
          "the output would execute delegated recommendations"
        ],
        completion_authority: "main runtime decides whether the delegation is worth using"
      }
    ],
    scheduling_policy: [
      "expert roles are advisory lenses selected by the main thread or future harness, not autonomous workers",
      "delegation gates must define trigger, required inputs, expected output, rejection cases, and completion authority before advice is used",
      "use the smallest role set that reduces a concrete uncertainty, especially around core/basic/application layer classification",
      "delegation may propose analysis or critique, but execution remains behind normal harness actions and operator gates",
      "parallel fan-out, background scheduling, and model-provider selection are out of scope for this contract"
    ],
    verification_policy: [
      "expert output cannot close a task, promote memory, promote SOPs, or prove completion by itself",
      "the main runtime must verify claims with code inspection, state refs, command output, tests, or explicit operator evidence",
      "when expert advice conflicts with runtime evidence, runtime evidence wins until the contract or evidence is updated",
      "completion summaries must cite the verification surface, not the expert role that suggested it"
    ],
    non_goals: [
      "no autonomous multi-agent scheduler",
      "no parallel model fan-out",
      "no new model provider contract",
      "no external tool expansion",
      "no service restart, publish, or active-vault write authority"
    ],
    commands: [
      "pnpm run runtime -- governance experts",
      "pnpm run runtime -- governance experts --gate <gate-id>"
    ],
    refs: [
      "CONTEXT.md",
      "docs/RUNTIME_CONTRACT.md",
      "packages/core/src/expert_orchestration.ts",
      "packages/core/src/action_contracts.ts",
      "packages/core/src/self_evolution_scorecard.ts",
      "packages/core/src/capabilities.ts"
    ],
    boundary: BOUNDARY
  };
}

export function getExpertDelegationPlan(gateId: string): ExpertDelegationPlan {
  const contract = getExpertOrchestrationContract();
  const gate = contract.delegation_gates.find((candidate) => candidate.id === gateId);
  if (!gate) {
    throw new Error(`Unknown expert delegation gate: ${gateId}`);
  }
  return {
    schema_version: 1,
    action: "expert-delegation-plan",
    status: "advisory",
    gate_id: gate.id,
    title: `${gate.title} delegation plan`,
    trigger: gate.trigger,
    role_ids: gate.roles,
    roles: gate.roles.map((roleId) => {
      const role = contract.roles.find((candidate) => candidate.id === roleId);
      if (!role) throw new Error(`Unknown expert role for gate ${gate.id}: ${roleId}`);
      return role;
    }),
    required_inputs: gate.required_inputs,
    expected_output: gate.expected_output,
    reject_if: gate.reject_if,
    completion_authority: gate.completion_authority,
    verification_surface: [
      "inspect the required inputs before accepting advice",
      "compare advisory output against reject_if cases",
      "run the main-runtime verification named by completion_authority"
    ],
    next_command: `pnpm run runtime -- governance experts --gate ${gate.id}`,
    non_goals: contract.non_goals,
    refs: contract.refs,
    boundary: BOUNDARY
  };
}
