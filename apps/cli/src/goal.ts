import { resolve } from "node:path";
import { AgentStore } from "../../../packages/core/src/store.js";
import { loadConfigSelectors } from "../../../packages/runtime/src/config.js";
import {
  ConfiguredGoalCognition,
  RuntimeGoalToolExecutor
} from "../../../packages/runtime/src/goal_execution_adapters.js";
import {
  CanonicalGoalVerifier,
  GoalRuntime,
  type GoalCommand,
  type GoalView
} from "../../../packages/runtime/src/goal_runtime.js";

export type LocalGoalAction = "start" | "continue" | "read" | "pause" | "resume" | "abandon";

export interface LocalGoalRequest {
  action: LocalGoalAction;
  commandId: string;
  objective?: string;
  goalId?: string;
  reason?: string;
  confirmEffectId?: string;
}

export interface GoalRuntimePort {
  handle(command: GoalCommand): Promise<GoalView>;
  read(goalId: string): Promise<GoalView>;
}

export interface LocalGoalRuntimeOptions {
  repoRoot: string;
  configDir?: string;
  stateRoot?: string;
}

export interface LocalLiveGoalRequest {
  objective?: string;
  discipline?: string;
  startCommandId: string;
  continueCommandId: string;
}

/** Build the control plane without resolving cognition; provider readiness is a Continue concern. */
export async function createLocalGoalRuntime(options: LocalGoalRuntimeOptions): Promise<GoalRuntimePort> {
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

/** Thin local ingress: translate operator intent, never own lifecycle state. */
export async function executeLocalGoalRequest(
  runtime: GoalRuntimePort,
  request: LocalGoalRequest
): Promise<GoalView> {
  if (request.action === "read") return runtime.read(required(request.goalId, "goal read requires --goal"));
  if (request.action === "start") {
    return runtime.handle({
      type: "start",
      command_id: request.commandId,
      objective: required(request.objective, "goal start requires --task")
    });
  }
  const goalId = required(request.goalId, `goal ${request.action} requires --goal`);
  if (request.action === "continue") {
    return runtime.handle({ type: "continue", command_id: request.commandId, goal_id: goalId });
  }
  if (request.action === "pause") {
    return runtime.handle({
      type: "pause",
      command_id: request.commandId,
      goal_id: goalId,
      reason: required(request.reason, "goal pause requires --reason")
    });
  }
  if (request.action === "resume") {
    return runtime.handle({
      type: "resume",
      command_id: request.commandId,
      goal_id: goalId,
      ...(request.confirmEffectId ? { confirm_effect_id: request.confirmEffectId } : {})
    });
  }
  return runtime.handle({
    type: "abandon",
    command_id: request.commandId,
    goal_id: goalId,
    reason: required(request.reason, "goal abandon requires --reason")
  });
}

/** Whole-goal live ingress: start once, then execute exactly one bounded Continue tranche. */
export async function executeLocalLiveGoalRequest(
  runtime: GoalRuntimePort,
  request: LocalLiveGoalRequest
): Promise<GoalView> {
  assertLocalLiveGoalRequest(request);
  const started = await executeLocalGoalRequest(runtime, {
    action: "start",
    commandId: request.startCommandId,
    objective: request.objective
  });
  return executeLocalGoalRequest(runtime, {
    action: "continue",
    commandId: request.continueCommandId,
    goalId: started.goal_id
  });
}

/** Reject legacy discipline before constructing GoalRuntime or writing any goal state. */
export function assertLocalLiveGoalRequest(
  request: Pick<LocalLiveGoalRequest, "objective" | "discipline">
): void {
  required(request.objective, "live requires --task");
  if (request.discipline && request.discipline !== "none") {
    throw new Error(
      "live now uses GoalRuntime and does not support query/todo discipline; "
      + "run live --task without --query-todo, then use goal continue or goal resume with the returned goal_id"
    );
  }
}

export function isLocalGoalAction(value: string): value is LocalGoalAction {
  return value === "start"
    || value === "continue"
    || value === "read"
    || value === "pause"
    || value === "resume"
    || value === "abandon";
}

function required(value: string | undefined, message: string): string {
  if (!value?.trim()) throw new Error(message);
  return value.trim();
}
