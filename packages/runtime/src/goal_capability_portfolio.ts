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

export type GoalCapabilityKind = "direct_tool" | "delegated_executor";
export type GoalCapabilityReadiness = "available" | "unavailable";
export type GoalCapabilityExecutionPurpose =
  | "orientation"
  | "verification"
  | "recovery"
  | "atomic_task"
  | "specialist_execution";

export interface GoalCapabilityCandidate {
  id: string;
  kind: GoalCapabilityKind;
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
}

export interface GoalCapabilityPortfolioProvider {
  resolve(input: GoalCapabilityPortfolioInput): Promise<GoalCapabilityPortfolio>;
}

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
  fallback: z.string().trim().min(1).max(2_000)
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
      selected_skills: selectedSkills
    });
  }
}

export function buildGoalCapabilityPortfolio(
  input: BuildGoalCapabilityPortfolioInput
): GoalCapabilityPortfolio {
  const competenceByTool = new Map(input.tool_competence.map((item) => [item.tool, item]));
  const capabilities = (input.tool_contracts ?? coreToolContracts)
    .filter((contract) => contract.tool !== "workspace.prepare"
      || isWorkspacePreparationMeaningful(
        input.repository_authority,
        input.execution_workspace ?? null
      ))
    .slice(0, MAX_GOAL_CAPABILITIES)
    .map((contract) => capabilityCandidate(
      contract,
      input.repository_authority,
      input.execution_workspace ?? null,
      competenceByTool.get(contract.tool) ?? null
    ));
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
  return selection;
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
    summary: contract.rationale,
    side_effect_level: contract.side_effect_level,
    workspace_placement: contract.goal_store_placement,
    arguments: contract.tool === "codex.run"
      ? { ...contract.arguments, model: "auto,new,required", reasoning_effort: "auto,new,required" }
      : structuredClone(contract.arguments),
    constraints: [...(contract.constraints ?? [])],
    readiness: delegatedUnavailable ? "unavailable" : "available",
    readiness_reason: delegatedUnavailable
      ? "codex.run requires the Goal to bind an isolated execution workspace before specialist execution"
      : "registered core capability is available within current Goal authority; EffectPolicy and tool validation still apply",
    competence: competence ? structuredClone(competence) : null
  };
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
