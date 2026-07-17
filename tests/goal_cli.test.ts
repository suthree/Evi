import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createLocalGoalRuntime,
  executeLocalGoalRequest,
  type GoalRuntimePort
} from "../apps/cli/src/goal.js";
import { parseArgs } from "../apps/cli/src/main.js";
import type { GoalCommand, GoalView } from "../packages/runtime/src/goal_runtime.js";

test("goal CLI parses lifecycle identity and exact effect confirmation", () => {
  const options = parseArgs([
    "goal",
    "resume",
    "--goal",
    "goal_123",
    "--confirm-effect",
    "goal_effect_456",
    "--command-id",
    "goal_command_789",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(options.command, "goal");
  assert.equal(options.goalAction, "resume");
  assert.equal(options.goalId, "goal_123");
  assert.equal(options.goalConfirmEffectId, "goal_effect_456");
  assert.equal(options.goalCommandId, "goal_command_789");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("local goal CLI ingress translates intent and owns no lifecycle state", async () => {
  const handled: GoalCommand[] = [];
  const reads: string[] = [];
  const view = { goal_id: "goal_123" } as GoalView;
  const runtime: GoalRuntimePort = {
    async handle(command) {
      handled.push(command);
      return view;
    },
    async read(goalId) {
      reads.push(goalId);
      return view;
    }
  };

  assert.equal(await executeLocalGoalRequest(runtime, {
    action: "start",
    commandId: "command_start",
    objective: "One bounded local goal."
  }), view);
  assert.equal(await executeLocalGoalRequest(runtime, {
    action: "continue",
    commandId: "command_continue",
    goalId: "goal_123"
  }), view);
  assert.equal(await executeLocalGoalRequest(runtime, {
    action: "resume",
    commandId: "command_resume",
    goalId: "goal_123",
    confirmEffectId: "goal_effect_456"
  }), view);
  assert.equal(await executeLocalGoalRequest(runtime, {
    action: "read",
    commandId: "unused_for_read",
    goalId: "goal_123"
  }), view);

  assert.deepEqual(handled, [{
    type: "start",
    command_id: "command_start",
    objective: "One bounded local goal."
  }, {
    type: "continue",
    command_id: "command_continue",
    goal_id: "goal_123"
  }, {
    type: "resume",
    command_id: "command_resume",
    goal_id: "goal_123",
    confirm_effect_id: "goal_effect_456"
  }]);
  assert.deepEqual(reads, ["goal_123"]);
});

test("local goal CLI ingress fails before dispatch when required intent is missing", async () => {
  let calls = 0;
  const runtime: GoalRuntimePort = {
    async handle() {
      calls += 1;
      throw new Error("must not dispatch");
    },
    async read() {
      calls += 1;
      throw new Error("must not dispatch");
    }
  };
  await assert.rejects(executeLocalGoalRequest(runtime, {
    action: "start",
    commandId: "missing_task"
  }), /requires --task/);
  await assert.rejects(executeLocalGoalRequest(runtime, {
    action: "pause",
    commandId: "missing_reason",
    goalId: "goal_123"
  }), /requires --reason/);
  assert.equal(calls, 0);
});

test("local goal lifecycle remains usable when the selected active model is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-goal-cli-missing-model-"));
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  const repoRoot = join(root, "repo");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(repoRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "primary-model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), "", "utf8");
    const runtime = await createLocalGoalRuntime({ repoRoot, configDir, stateRoot });
    const started = await runtime.handle({
      type: "start",
      command_id: "missing_model_start",
      objective: "Keep lifecycle control available."
    });
    assert.equal((await runtime.read(started.goal_id)).status, "active");

    const blocked = await runtime.handle({
      type: "continue",
      command_id: "missing_model_continue",
      goal_id: started.goal_id
    });
    assert.equal(blocked.status, "active");
    assert.equal(blocked.goal_id, started.goal_id);
    assert.deepEqual(blocked.continuation_reasons, ["blocked"]);
    assert.match(blocked.checkpoint.summary, /Active model not found.*primary-model/);

    const paused = await runtime.handle({
      type: "pause",
      command_id: "missing_model_pause",
      goal_id: started.goal_id,
      reason: "Operator retains lifecycle authority."
    });
    assert.equal(paused.status, "paused");
    const resumed = await runtime.handle({
      type: "resume",
      command_id: "missing_model_resume",
      goal_id: started.goal_id
    });
    assert.equal(resumed.status, "active");
    const abandoned = await runtime.handle({
      type: "abandon",
      command_id: "missing_model_abandon",
      goal_id: started.goal_id,
      reason: "Fixture complete."
    });
    assert.equal(abandoned.status, "abandoned");
    assert.equal(abandoned.goal_id, started.goal_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
