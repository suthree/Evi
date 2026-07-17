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
  return runtime.handle({
    type: "continue",
    command_id: request.continueCommandId,
    goal_id: started.goal_id
  });
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
