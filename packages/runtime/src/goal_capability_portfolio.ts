import { dirname } from "node:path";
import { z } from "zod";
import { recallSkills, type SkillRecallHit } from "../../core/src/recall.js";
import type { SkillResolverLike } from "../../core/src/skill_resolver.js";
import { AgentStore } from "../../core/src/store.js";
import {
  coreToolContracts,
  type GoalToolStorePlacement,
  type ToolContract,
  type ToolSideEffectLevel
} from "../../core/src/tool_contracts.js";
import { loadRuntimeConfigSummary, type ConfigSourceOptions } from "./config.js";
import type { EffectAction } from "./effect_policy.js";
import type { GoalExecutionWorkspace } from "./goal_execution_workspace.js";
import type { GoalRepositoryAuthority } from "./repository_authority.js";
import type { GoalToolCompetence } from "./goal_tool_competence.js";

export const MAX_GOAL_CAPABILITIES = 10;
export const MAX_GOAL_SELECTED_SKILLS = 2;
export const MAX_GOAL_SELECTED_SKILL_BODY_CHARS = 2_400;
export const GOAL_HARNESS_SOP_CAPABILITY_ID = "harness.propose_sop";

/** Explicit Goal-start opt-in for one state-only Harness learning action. */
export type GoalLearningEffect = "propose_sop";

export type GoalCapabilityKind = "direct_tool" | "delegated_executor" | "harness_state";
export type GoalCapabilityReadiness = "available" | "unavailable";
export type GoalCapabilityOperationRole = "inspect" | "act" | "delegate";
export type GoalCapabilityExecutionPurpose =
  | "orientation"
  | "verification"
  | "recovery"
  | "atomic_task"
  | "specialist_execution";

export interface GoalCapabilityCandidate {
  id: string;
  kind: GoalCapabilityKind;
  operation_role: GoalCapabilityOperationRole;
  summary: string;
  side_effect_level: ToolSideEffectLevel;
  workspace_placement: GoalToolStorePlacement;
  arguments: Record<string, unknown>;
  constraints: string[];
  readiness: GoalCapabilityReadiness;
  readiness_reason: string;
  competence: GoalToolCompetence | null;
}

export interface GoalSelectedSkill {
  name: string;
  description: string;
  instructions_ref: string;
  metadata_ref: string;
  source: SkillRecallHit["source"];
  score: number;
  body: string;
}

export interface GoalCapabilityPortfolio {
  capabilities: GoalCapabilityCandidate[];
  selected_skills: GoalSelectedSkill[];
  selection_contract: {
    task_routing: "dynamic_not_keyword_mapped";
    owner: "goal_cognition_selects; GoalRuntime validates and owns acceptance";
    direct_action_purposes: Array<Exclude<GoalCapabilityExecutionPurpose, "specialist_execution">>;
    delegated_action_purpose: "specialist_execution";
    guidance: string;
  };
  boundary: "read-only capability decision context; no model invocation, tool execution, state write, effect authority, or completion authority";
}

export interface GoalCapabilityPortfolioInput {
  goal_id: string;
  objective: string;
  repository_authority: GoalRepositoryAuthority | null;
  execution_workspace?: GoalExecutionWorkspace | null;
  tool_competence: GoalToolCompetence[];
  learning_effects: GoalLearningEffect[];
}

export interface GoalCapabilityPortfolioProvider {
  resolve(input: GoalCapabilityPortfolioInput): Promise<GoalCapabilityPortfolio>;
}

const capabilityFitAssessmentSchema = z.object({
  considered_capability_ids: z.array(z.string().trim().min(1).max(128)).max(MAX_GOAL_CAPABILITIES),
  considered_skill_refs: z.array(z.string().trim().min(1).max(1_000)).max(MAX_GOAL_SELECTED_SKILLS),
  conclusion: z.string().trim().min(1).max(2_000)
}).strict().superRefine((value, context) => {
  if (new Set(value.considered_capability_ids).size !== value.considered_capability_ids.length) {
    context.addIssue({ code: "custom", path: ["considered_capability_ids"], message: "considered_capability_ids must be unique" });
  }
  if (new Set(value.considered_skill_refs).size !== value.considered_skill_refs.length) {
    context.addIssue({ code: "custom", path: ["considered_skill_refs"], message: "considered_skill_refs must be unique" });
  }
});

export const goalCapabilitySelectionSchema = z.object({
  capability_id: z.string().trim().min(1).max(128),
  execution_purpose: z.enum([
    "orientation",
    "verification",
    "recovery",
    "atomic_task",
    "specialist_execution"
  ]),
  skill_refs: z.array(z.string().trim().min(1).max(1_000)).max(MAX_GOAL_SELECTED_SKILLS),
  rationale: z.string().trim().min(1).max(2_000),
  verification_plan: z.string().trim().min(1).max(2_000),
  fallback: z.string().trim().min(1).max(2_000),
  capability_fit_assessment: capabilityFitAssessmentSchema.optional()
}).strict().superRefine((value, context) => {
  if (new Set(value.skill_refs).size !== value.skill_refs.length) {
    context.addIssue({ code: "custom", path: ["skill_refs"], message: "skill_refs must be unique" });
  }
});

export type GoalCapabilitySelection = z.infer<typeof goalCapabilitySelectionSchema>;

interface BuildGoalCapabilityPortfolioInput {
  repository_authority: GoalRepositoryAuthority | null;
  execution_workspace?: GoalExecutionWorkspace | null;
  tool_competence: GoalToolCompetence[];
  selected_skills: GoalSelectedSkill[];
  tool_contracts?: ToolContract[];
  learning_effects?: GoalLearningEffect[];
}

export class ConfiguredGoalCapabilityPortfolioProvider implements GoalCapabilityPortfolioProvider {
  constructor(
    private readonly store: AgentStore,
    private readonly options: ConfigSourceOptions = {}
  ) {}

  async resolve(input: GoalCapabilityPortfolioInput): Promise<GoalCapabilityPortfolio> {
    const config = await loadRuntimeConfigSummary(this.options);
    const vault: SkillResolverLike = {
      root: config.vault.active_root,
      seed_roots: config.vault.seed_roots,
      project_roots: config.vault.project_roots
    };
    const hits = await recallSkills(this.store, input.objective, MAX_GOAL_SELECTED_SKILLS, vault);
    const selectedSkills = await Promise.all(hits.map(async (hit) => ({
      name: hit.name,
      description: hit.description,
      instructions_ref: hit.instructions_ref,
      metadata_ref: hit.metadata_ref,
      source: hit.source,
      score: hit.score,
      body: await readSelectedSkillBody(this.store, hit.instructions_ref)
    })));
    return buildGoalCapabilityPortfolio({
      repository_authority: input.repository_authority,
      execution_workspace: input.execution_workspace,
      tool_competence: input.tool_competence,
      selected_skills: selectedSkills,
      learning_effects: input.learning_effects
    });
  }
}

export function buildGoalCapabilityPortfolio(
  input: BuildGoalCapabilityPortfolioInput
): GoalCapabilityPortfolio {
  const competenceByTool = new Map(input.tool_competence.map((item) => [item.tool, item]));
  const harnessCapabilities = input.learning_effects?.includes("propose_sop")
    ? [harnessSopCapability()]
    : [];
  const toolCapabilities = (input.tool_contracts ?? coreToolContracts)
    .filter(isDefaultGoalCapability)
    .filter((contract) => contract.tool !== "workspace.prepare"
      || isWorkspacePreparationMeaningful(
        input.repository_authority,
        input.execution_workspace ?? null
      ))
    .slice(0, MAX_GOAL_CAPABILITIES - harnessCapabilities.length)
    .map((contract) => capabilityCandidate(
      contract,
      input.repository_authority,
      input.execution_workspace ?? null,
      competenceByTool.get(contract.tool) ?? null
    ));
  const capabilities = [...toolCapabilities, ...harnessCapabilities];
  return {
    capabilities,
    selected_skills: input.selected_skills.slice(0, MAX_GOAL_SELECTED_SKILLS).map((skill) => ({
      ...skill,
      body: truncate(skill.body, MAX_GOAL_SELECTED_SKILL_BODY_CHARS)
    })),
    selection_contract: {
      task_routing: "dynamic_not_keyword_mapped",
      owner: "goal_cognition_selects; GoalRuntime validates and owns acceptance",
      direct_action_purposes: ["orientation", "verification", "recovery", "atomic_task"],
      delegated_action_purpose: "specialist_execution",
      guidance: "Choose from current capabilities and selected skills using the Goal, live evidence, readiness, competence, authority, cost, risk, and verifiability. The controlling Goal runtime owns judgment and acceptance; use direct tools only for bounded support or an atomic task, and prefer a suitable delegated executor for specialist production. If the best capability is unavailable, block or choose an explicit verified fallback instead of silently becoming the specialist executor."
    },
    boundary: "read-only capability decision context; no model invocation, tool execution, state write, effect authority, or completion authority"
  };
}

export function validateGoalCapabilitySelection(
  value: GoalCapabilitySelection,
  action: EffectAction,
  portfolio: GoalCapabilityPortfolio
): GoalCapabilitySelection {
  const selection = goalCapabilitySelectionSchema.parse(value);
  const capability = portfolio.capabilities.find((candidate) => candidate.id === selection.capability_id);
  if (!capability) {
    throw new Error(`Goal capability selection names unknown capability: ${selection.capability_id}`);
  }
  if (capability.readiness !== "available") {
    throw new Error(`Goal capability ${capability.id} is currently unavailable: ${capability.readiness_reason}`);
  }
  if (selection.capability_id !== action.tool) {
    throw new Error(`Goal capability selection ${selection.capability_id} does not match action tool ${action.tool}`);
  }
  if (capability.kind === "delegated_executor" && selection.execution_purpose !== "specialist_execution") {
    throw new Error(`Delegated capability ${capability.id} requires specialist_execution purpose`);
  }
  if (capability.kind === "direct_tool" && selection.execution_purpose === "specialist_execution") {
    throw new Error(`Direct capability ${capability.id} cannot claim specialist_execution purpose`);
  }
  const selectedSkillRefs = new Set(portfolio.selected_skills.map((skill) => skill.instructions_ref));
  const unselected = selection.skill_refs.find((ref) => !selectedSkillRefs.has(ref));
  if (unselected) throw new Error(`Goal capability selection cites unselected skill: ${unselected}`);
  if (capability.kind === "delegated_executor") {
    validateDelegatedCapabilityFitAssessment(selection, portfolio);
  }
  return selection;
}

/**
 * Validate the one opt-in Harness-state surface without treating it as a Tool
 * Contract or sending it through EffectPolicy. Its state writer remains owned
 * by GoalRuntime and is intentionally not a general local-write capability.
 */
export function validateGoalHarnessStateCapabilitySelection(
  value: GoalCapabilitySelection,
  capabilityId: typeof GOAL_HARNESS_SOP_CAPABILITY_ID,
  portfolio: GoalCapabilityPortfolio
): GoalCapabilitySelection {
  const selection = goalCapabilitySelectionSchema.parse(value);
  const capability = portfolio.capabilities.find((candidate) => candidate.id === selection.capability_id);
  if (!capability) {
    throw new Error(`Goal capability selection names unknown capability: ${selection.capability_id}`);
  }
  if (capability.readiness !== "available") {
    throw new Error(`Goal capability ${capability.id} is currently unavailable: ${capability.readiness_reason}`);
  }
  if (capability.kind !== "harness_state" || capability.id !== capabilityId || selection.capability_id !== capabilityId) {
    throw new Error(`Goal capability selection ${selection.capability_id} is not the declared Harness-state capability ${capabilityId}`);
  }
  if (selection.execution_purpose !== "atomic_task") {
    throw new Error(`Harness-state capability ${capabilityId} requires atomic_task purpose`);
  }
  if (selection.skill_refs.length > 0) {
    throw new Error(`Harness-state capability ${capabilityId} cannot apply selected skills`);
  }
  if (selection.capability_fit_assessment) {
    throw new Error(`Harness-state capability ${capabilityId} cannot carry a delegated capability fit assessment`);
  }
  return selection;
}

function validateDelegatedCapabilityFitAssessment(
  selection: GoalCapabilitySelection,
  portfolio: GoalCapabilityPortfolio
): void {
  const assessment = selection.capability_fit_assessment;
  if (!assessment) {
    throw new Error("Delegated capability selection requires capability_fit_assessment before specialist execution");
  }
  assertExactReferences(
    assessment.considered_capability_ids,
    portfolio.capabilities.map((candidate) => candidate.id),
    "capability_fit_assessment.considered_capability_ids"
  );
  assertExactReferences(
    assessment.considered_skill_refs,
    portfolio.selected_skills.map((skill) => skill.instructions_ref),
    "capability_fit_assessment.considered_skill_refs"
  );
}

function assertExactReferences(actual: string[], expected: string[], field: string): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== expectedSet.size
    || [...actualSet].some((item) => !expectedSet.has(item))) {
    throw new Error(`${field} must cover exactly the current Capability Portfolio`);
  }
}

function capabilityCandidate(
  contract: ToolContract,
  controlAuthority: GoalRepositoryAuthority | null,
  executionWorkspace: GoalExecutionWorkspace | null,
  competence: GoalToolCompetence | null
): GoalCapabilityCandidate {
  const kind: GoalCapabilityKind = contract.tool === "codex.run" ? "delegated_executor" : "direct_tool";
  const effectiveAuthority = executionWorkspace?.authority ?? controlAuthority;
  const delegatedUnavailable = kind === "delegated_executor" && !isLinkedWorktree(effectiveAuthority);
  return {
    id: contract.tool,
    kind,
    operation_role: capabilityOperationRole(contract.tool, kind),
    summary: contract.rationale,
    side_effect_level: contract.side_effect_level,
    workspace_placement: contract.goal_store_placement,
    arguments: contract.tool === "codex.run"
      ? {
          task: "bounded specialist task",
          task_shape: "bounded task shape"
        }
      : structuredClone(contract.arguments),
    constraints: contract.tool === "codex.run"
      ? [
          "Goal cognition supplies only task and task_shape; low-level Codex invocation fields are rejected",
          "GoalRuntime derives new or resume mode, worktree, branch, base commit, model/profile, authority handle, delegation plan, and budgets from bound authority and canonical evidence",
          "the typed tool adapter re-verifies derived authority before dispatch; delegated output remains untrusted until canonical observation and independent verification"
        ]
      : [...(contract.constraints ?? [])],
    readiness: delegatedUnavailable ? "unavailable" : "available",
    readiness_reason: delegatedUnavailable
      ? "codex.run requires the Goal to bind an isolated execution workspace before specialist execution"
      : "registered core capability is available within current Goal authority; EffectPolicy and tool validation still apply",
    competence: competence ? structuredClone(competence) : null
  };
}

function harnessSopCapability(): GoalCapabilityCandidate {
  return {
    id: GOAL_HARNESS_SOP_CAPABILITY_ID,
    kind: "harness_state",
    operation_role: "act",
    summary: "Create one state-only SOP draft from same-Goal nondelegated canonical observations; it cannot audit, promote, write the active vault, or complete the Goal.",
    side_effect_level: "local_write",
    workspace_placement: "control",
    arguments: {
      action: "propose_sop",
      completion_claim_status: "not_done",
      evidence_event_ids: "same-Goal successful nondelegated canonical observation ids"
    },
    constraints: [
      "available only when Goal Start explicitly declares learning_effects: [propose_sop]",
      "writes only the state-root sop/drafts JSON and Markdown pair",
      "every supplied evidence_event_id must name a prior successful same-Goal nondelegated canonical observation",
      "never audits, promotes, writes the active vault, creates a Skill, or completes the Goal",
      "a later normal Goal outcome requires independent Harness verification of the draft delivery"
    ],
    readiness: "available",
    readiness_reason: "explicit Goal-start learning effect exposes one bounded Harness-state draft action",
    competence: null
  };
}

function isDefaultGoalCapability(contract: ToolContract): boolean {
  // code.execute_node remains a registered, bounded runtime tool. It is an
  // implementation helper rather than a default Goal-level choice, so it
  // stays out of the cognition portfolio without changing its contract,
  // dispatch, or EffectPolicy validation.
  return contract.tool !== "code.execute_node";
}

function capabilityOperationRole(
  tool: string,
  kind: GoalCapabilityKind
): GoalCapabilityOperationRole {
  if (kind === "delegated_executor") return "delegate";
  if (tool === "file.read" || tool === "repo.search" || tool === "runtime.inspect" || tool === "http.fetch") {
    return "inspect";
  }
  return "act";
}

function isWorkspacePreparationMeaningful(
  controlAuthority: GoalRepositoryAuthority | null,
  executionWorkspace: GoalExecutionWorkspace | null
): boolean {
  return controlAuthority !== null
    && executionWorkspace === null
    && !isLinkedWorktree(controlAuthority);
}

function isLinkedWorktree(authority: GoalRepositoryAuthority | null): boolean {
  if (!authority) return false;
  return dirname(authority.git_common_dir) !== authority.worktree;
}

async function readSelectedSkillBody(store: AgentStore, ref: string): Promise<string> {
  const readLimit = MAX_GOAL_SELECTED_SKILL_BODY_CHARS - 4;
  return truncate(await store.readRepoText(ref, readLimit), MAX_GOAL_SELECTED_SKILL_BODY_CHARS);
}

function truncate(value: string, maxChars: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}
