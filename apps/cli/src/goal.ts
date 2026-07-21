import {
  createConfiguredGoalRuntime,
  executeGoalIngressRequest,
  type ConfiguredGoalRuntimeOptions,
  type GoalRuntimePort
} from "../../../packages/runtime/src/goal_ingress.js";
import type { GoalInspection, GoalReadPolicy, GoalView } from "../../../packages/runtime/src/goal_runtime.js";

export type LocalGoalAction = "start" | "continue" | "read" | "inspect" | "pause" | "resume" | "abandon";

export interface LocalGoalRequest {
  action: LocalGoalAction;
  commandId: string;
  objective?: string;
  goalId?: string;
  reason?: string;
  confirmEffectId?: string;
  readPolicy?: GoalReadPolicy;
}

export type { GoalRuntimePort } from "../../../packages/runtime/src/goal_ingress.js";
export type LocalGoalRuntimeOptions = ConfiguredGoalRuntimeOptions;

export interface LocalLiveGoalRequest {
  objective?: string;
  discipline?: string;
  startCommandId: string;
  continueCommandId: string;
}

/** Build the control plane without resolving cognition; provider readiness is a Continue concern. */
export async function createLocalGoalRuntime(options: LocalGoalRuntimeOptions): Promise<GoalRuntimePort> {
  return createConfiguredGoalRuntime(options);
}

/** Thin local ingress: translate operator intent, never own lifecycle state. */
export async function executeLocalGoalRequest(
  runtime: GoalRuntimePort,
  request: LocalGoalRequest
): Promise<GoalView | GoalInspection> {
  if (request.action === "read") return runtime.read(required(request.goalId, "goal read requires --goal"));
  if (request.action === "inspect") return runtime.inspect(required(request.goalId, "goal inspect requires --goal"));
  if (request.action === "start") {
    return runtime.handle({
      type: "start",
      command_id: request.commandId,
      objective: required(request.objective, "goal start requires --task"),
      ...(request.readPolicy ? { read_policy: request.readPolicy } : {})
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
  return executeGoalIngressRequest(runtime, {
    objective: request.objective ?? "",
    startCommandId: request.startCommandId,
    continueCommandId: request.continueCommandId
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
    || value === "inspect"
    || value === "pause"
    || value === "resume"
    || value === "abandon";
}

function required(value: string | undefined, message: string): string {
  if (!value?.trim()) throw new Error(message);
  return value.trim();
}
