import { resolve } from "node:path";
import { newId } from "../../core/src/ids.js";
import { AgentStore } from "../../core/src/store.js";
import { loadConfigSelectors } from "./config.js";
import {
  ConfiguredGoalCognition,
  RuntimeGoalToolExecutor
} from "./goal_execution_adapters.js";
import {
  CanonicalGoalVerifier,
  GoalRuntime,
  type GoalCommand,
  type GoalRuntimePort,
  type GoalView
} from "./goal_runtime.js";

export type { GoalRuntimePort } from "./goal_runtime.js";

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

/** Preserve the canonical Goal identity when a Continue fails after Start. */
export class GoalIngressError extends Error {
  readonly goalId: string;
  readonly goal: GoalView | null;

  constructor(goalId: string, goal: GoalView | null, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "GoalIngressError";
    this.goalId = goalId;
    this.goal = goal;
  }
}

export function goalFromIngressError(error: unknown): GoalView | null {
  return error instanceof GoalIngressError ? error.goal : null;
}

export function goalIdFromIngressError(error: unknown): string | null {
  return error instanceof GoalIngressError ? error.goalId : null;
}

/** Render one canonical Goal view for every interactive ingress without reviving RunResult. */
export function goalContinuationHint(goal: GoalView): string {
  if (goal.status === "completed") return `Goal ${goal.goal_id} is completed; no continuation command is required.`;
  if (goal.status === "abandoned") return `Goal ${goal.goal_id} is abandoned; no continuation command is allowed.`;
  if (goal.status === "paused" && goal.pending_effect?.state === "awaiting_confirmation") {
    return `Run goal resume --goal ${goal.goal_id} --confirm-effect ${goal.pending_effect.effect_id} to confirm this exact effect.`;
  }
  if (goal.status === "paused" && goal.pending_effect?.state === "outcome_unknown") {
    return `No safe continuation command: effect ${goal.pending_effect.effect_id} has an unknown outcome and must be reconciled from evidence before any new action.`;
  }
  if (goal.status === "paused") return `Run goal resume --goal ${goal.goal_id} to resume this manually paused Goal.`;
  return `Run goal continue --goal ${goal.goal_id} to continue this Goal.`;
}

export function renderGoalIngressPresentation(goal: GoalView): string {
  const detail = goal.receipt?.summary?.trim()
    ? `Result: ${goal.receipt.summary.trim()}`
    : goal.next_action?.trim()
      ? `Next: ${goal.next_action.trim()}`
      : null;
  return [
    `Goal: ${goal.goal_id}`,
    `Status: ${goal.status}`,
    ...(detail ? [detail] : []),
    goalContinuationHint(goal)
  ].join("\n");
}

/** Build the configured control plane without resolving cognition until Continue. */
export async function createConfiguredGoalRuntime(options: ConfiguredGoalRuntimeOptions): Promise<GoalRuntimePort> {
  const selectors = await loadConfigSelectors({
    configDir: options.configDir,
    stateRoot: options.stateRoot
  });
  const store = new AgentStore(resolve(options.repoRoot), selectors.stateRoot);
  return new GoalRuntime({
    store,
    cognition: new ConfiguredGoalCognition({
      configDir: selectors.configDir,
      stateRoot: selectors.stateRoot
    }),
    verifier: new CanonicalGoalVerifier(),
    toolExecutor: new RuntimeGoalToolExecutor(store)
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
    throw new GoalIngressError(started.goal_id, latest, error);
  }
}

/** Bind generated command identities at the edge while preserving one reusable canonical ingress. */
export function createGoalIngress(runtime: GoalRuntimePort): GoalIngressPort {
  return {
    submit: (objective) => executeGoalIngressRequest(runtime, {
      objective,
      startCommandId: newId("goal_command"),
      continueCommandId: newId("goal_command")
    })
  };
}

export async function createConfiguredGoalIngress(options: ConfiguredGoalRuntimeOptions): Promise<GoalIngressPort> {
  return createGoalIngress(await createConfiguredGoalRuntime(options));
}

function required(value: string, message: string): string {
  if (!value.trim()) throw new Error(message);
  return value.trim();
}
