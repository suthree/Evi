import { resolve } from "node:path";
import { newId } from "../../core/src/ids.js";
import { AgentStore } from "../../core/src/store.js";
import { loadConfigSelectors, loadRuntimeConfigSummary } from "./config.js";
import {
  ConfiguredGoalCognition,
  RuntimeGoalToolExecutor
} from "./goal_execution_adapters.js";
import { ConfiguredGoalCapabilityPortfolioProvider } from "./goal_capability_portfolio.js";
import {
  CanonicalGoalVerifier,
  GoalRuntime,
  type GoalCommand,
  type GoalRuntimePort,
  type GoalView
} from "./goal_runtime.js";

export type { GoalRuntimePort } from "./goal_runtime.js";

type GoalInteractionCommand = Extract<GoalCommand, { type: "continue" | "resume" }>;

export interface ConfiguredGoalRuntimeOptions {
  repoRoot: string;
  configDir?: string;
  stateRoot?: string;
}

export interface GoalIngressRequest {
  objective: string;
  startCommandId: string;
  continueCommandId: string;
}

/** A whole-goal ingress owns no state: it starts once and continues that same Goal once. */
export interface GoalIngressPort {
  submit(objective: string): Promise<GoalView>;
}

/** One interactive edge over the canonical GoalRuntime; owns command ids only. */
export interface GoalInteractionPort extends GoalIngressPort {
  read(goalId: string): Promise<GoalView>;
  continue(goalId: string): Promise<GoalView>;
  resume(goalId: string, confirmEffectId?: string): Promise<GoalView>;
}

/** Preserve the canonical Goal identity when an interactive command fails. */
export class GoalInteractionError extends Error {
  readonly goalId: string;
  readonly goal: GoalView | null;

  constructor(goalId: string, goal: GoalView | null, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "GoalInteractionError";
    this.goalId = goalId;
    this.goal = goal;
  }
}

export function goalFromInteractionError(error: unknown): GoalView | null {
  return error instanceof GoalInteractionError ? error.goal : null;
}

export function goalIdFromInteractionError(error: unknown): string | null {
  return error instanceof GoalInteractionError ? error.goalId : null;
}

/** Render one canonical Goal view for every interactive ingress without reviving RunResult. */
export function goalContinuationHint(goal: GoalView, surface: "cli" | "feishu" = "cli"): string {
  if (goal.status === "completed") return `Goal ${goal.goal_id} is completed; no continuation command is required.`;
  if (goal.status === "abandoned") return `Goal ${goal.goal_id} is abandoned; no continuation command is allowed.`;
  if (goal.status === "paused" && goal.pending_effect?.state === "awaiting_confirmation") {
    if (surface === "feishu") return `Send /goal confirm ${goal.goal_id} ${goal.pending_effect.effect_id} to confirm this exact effect.`;
    return `Run goal resume --goal ${goal.goal_id} --confirm-effect ${goal.pending_effect.effect_id} to confirm this exact effect.`;
  }
  if (goal.status === "paused" && goal.pending_effect?.state === "outcome_unknown") {
    return `No safe continuation command: effect ${goal.pending_effect.effect_id} has an unknown outcome and must be reconciled from evidence before any new action.`;
  }
  if (goal.status === "paused") {
    return surface === "feishu"
      ? `Send /goal resume ${goal.goal_id} to resume this manually paused Goal.`
      : `Run goal resume --goal ${goal.goal_id} to resume this manually paused Goal.`;
  }
  if (surface === "feishu") return `Send /goal continue ${goal.goal_id} to continue this Goal.`;
  return `Run goal continue --goal ${goal.goal_id} to continue this Goal.`;
}

export function renderGoalIngressPresentation(
  goal: GoalView,
  options: { surface?: "cli" | "feishu" } = {}
): string {
  const surface = options.surface ?? "cli";
  const detail = goal.receipt?.summary?.trim()
    ? `${surface === "feishu" ? "Outcome (receipt content; canonical lifecycle is shown above)" : "Result"}: ${goal.receipt.summary.trim()}`
    : goal.next_action?.trim()
      ? `Next: ${goal.next_action.trim()}`
      : null;
  return [
    `Goal: ${goal.goal_id}`,
    `${surface === "feishu" ? "Canonical status" : "Status"}: ${goal.status}`,
    ...(surface === "feishu" && goal.receipt?.id ? [`Receipt: ${goal.receipt.id}`] : []),
    ...(detail ? [detail] : []),
    goalContinuationHint(goal, surface)
  ].join("\n");
}

/** Build the configured control plane without resolving cognition until Continue. */
export async function createConfiguredGoalRuntime(options: ConfiguredGoalRuntimeOptions): Promise<GoalRuntimePort> {
  const selectors = await loadConfigSelectors({
    configDir: options.configDir,
    stateRoot: options.stateRoot
  });
  const config = await loadRuntimeConfigSummary({
    configDir: selectors.configDir,
    stateRoot: selectors.stateRoot
  });
  const store = new AgentStore(resolve(options.repoRoot), selectors.stateRoot);
  return new GoalRuntime({
    store,
    cognition: new ConfiguredGoalCognition({
      configDir: selectors.configDir,
      stateRoot: selectors.stateRoot
    }),
    capabilityPortfolioProvider: new ConfiguredGoalCapabilityPortfolioProvider(store, {
      configDir: selectors.configDir,
      stateRoot: selectors.stateRoot
    }),
    verifier: new CanonicalGoalVerifier(),
    toolExecutor: new RuntimeGoalToolExecutor(store, undefined, selectors.configDir),
    activeVaultRoot: config.vault.active_root
  });
}

/** Execute the canonical Start-plus-one-Continue protocol without a compatibility result mapper. */
export async function executeGoalIngressRequest(
  runtime: GoalRuntimePort,
  request: GoalIngressRequest
): Promise<GoalView> {
  const objective = required(request.objective, "goal ingress requires a task");
  const started = await runtime.handle({
    type: "start",
    command_id: request.startCommandId,
    objective
  });
  try {
    return await runtime.handle({
      type: "continue",
      command_id: request.continueCommandId,
      goal_id: started.goal_id
    });
  } catch (error) {
    let latest: GoalView | null = null;
    try {
      latest = await runtime.read(started.goal_id);
    } catch {
      // Preserve only the known identity when canonical current state is unreadable.
    }
    throw new GoalInteractionError(started.goal_id, latest, error);
  }
}

/** Bind generated command identities at the edge while preserving one reusable canonical ingress. */
export function createGoalIngress(runtime: GoalRuntimePort): GoalInteractionPort {
  return {
    submit: (objective) => executeGoalIngressRequest(runtime, {
      objective,
      startCommandId: newId("goal_command"),
      continueCommandId: newId("goal_command")
    }),
    read: (goalId) => readGoal(runtime, goalId),
    continue: (goalId) => executeNamedGoalCommand(runtime, {
      type: "continue",
      command_id: newId("goal_command"),
      goal_id: required(goalId, "goal continue requires a goal id")
    }),
    resume: (goalId, confirmEffectId) => executeNamedGoalCommand(runtime, {
      type: "resume",
      command_id: newId("goal_command"),
      goal_id: required(goalId, "goal resume requires a goal id"),
      ...(confirmEffectId !== undefined
        ? { confirm_effect_id: required(confirmEffectId, "goal confirmation requires an effect id") }
        : {})
    })
  };
}

export async function createConfiguredGoalIngress(options: ConfiguredGoalRuntimeOptions): Promise<GoalInteractionPort> {
  return createGoalIngress(await createConfiguredGoalRuntime(options));
}

async function readGoal(runtime: GoalRuntimePort, rawGoalId: string): Promise<GoalView> {
  const goalId = required(rawGoalId, "goal read requires a goal id");
  try {
    return await runtime.read(goalId);
  } catch (error) {
    throw new GoalInteractionError(goalId, null, error);
  }
}

async function executeNamedGoalCommand(runtime: GoalRuntimePort, command: GoalInteractionCommand): Promise<GoalView> {
  const goalId = command.goal_id;
  try {
    return await runtime.handle(command);
  } catch (error) {
    let latest: GoalView | null = null;
    try {
      latest = await runtime.read(goalId);
    } catch {
      // Preserve the named identity even when canonical current state is unreadable.
    }
    throw new GoalInteractionError(goalId, latest, error);
  }
}

function required(value: string, message: string): string {
  if (!value.trim()) throw new Error(message);
  return value.trim();
}
