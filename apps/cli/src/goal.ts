import type { GoalCommand, GoalView } from "../../../packages/runtime/src/goal_runtime.js";

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
