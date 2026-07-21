import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertLocalLiveGoalRequest,
  createLocalGoalRuntime,
  executeLocalLiveGoalRequest,
  executeLocalGoalRequest,
  type GoalRuntimePort
} from "../apps/cli/src/goal.js";
import { parseArgs } from "../apps/cli/src/main.js";
import {
  GoalRuntime,
  type GoalCommand,
  type GoalView
} from "../packages/runtime/src/goal_runtime.js";
import { AgentStore } from "../packages/core/src/store.js";

test("goal CLI parses lifecycle identity, inspect, and exact effect confirmation", () => {
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

  const inspect = parseArgs(["goal", "inspect", "--goal", "goal_123"]);
  assert.equal(inspect.goalAction, "inspect");
  assert.equal(inspect.goalId, "goal_123");

  const constrainedStart = parseArgs([
    "goal",
    "start",
    "--task",
    "Run one supervised read evaluation.",
    "--read-file",
    "repo:README.md",
    "--read-tree",
    "repo:docs"
  ]);
  assert.equal(constrainedStart.goalAction, "start");
  assert.deepEqual(constrainedStart.goalReadReferences, [
    { scope: "repo", kind: "file", path: "README.md" },
    { scope: "repo", kind: "tree", path: "docs" }
  ]);
});

test("local goal CLI ingress translates intent and owns no lifecycle state", async () => {
  const handled: GoalCommand[] = [];
  const reads: string[] = [];
  const inspections: string[] = [];
  const view = { goal_id: "goal_123" } as GoalView;
  const inspection = { action: "inspect", goal: view } as Awaited<ReturnType<GoalRuntimePort["inspect"]>>;
  const runtime: GoalRuntimePort = {
    async handle(command) {
      handled.push(command);
      return view;
    },
    async read(goalId) {
      reads.push(goalId);
      return view;
    },
    async inspect(goalId) {
      inspections.push(goalId);
      return inspection;
    }
  };

  assert.equal(await executeLocalGoalRequest(runtime, {
    action: "start",
    commandId: "command_start",
    objective: "One bounded local goal.",
    readPolicy: {
      references: [{ scope: "repo", kind: "file", path: "README.md" }]
    }
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
  assert.equal(await executeLocalGoalRequest(runtime, {
    action: "inspect",
    commandId: "unused_for_inspect",
    goalId: "goal_123"
  }), inspection);

  assert.deepEqual(handled, [{
    type: "start",
    command_id: "command_start",
    objective: "One bounded local goal.",
    read_policy: {
      references: [{ scope: "repo", kind: "file", path: "README.md" }]
    }
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
  assert.deepEqual(inspections, ["goal_123"]);
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
    },
    async inspect() {
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

test("live ingress starts once and continues the same GoalRuntime identity once", async () => {
  const handled: GoalCommand[] = [];
  const started = { goal_id: "goal_live_123", status: "active" } as GoalView;
  const continued = {
    goal_id: "goal_live_123",
    status: "paused",
    continuation_reasons: ["effect_confirmation_required"]
  } as GoalView;
  const runtime: GoalRuntimePort = {
    async handle(command) {
      handled.push(command);
      return command.type === "start" ? started : continued;
    },
    async read() {
      throw new Error("live ingress must not read around the canonical command result");
    },
    async inspect() {
      throw new Error("live ingress must not inspect around the canonical command result");
    }
  };

  const result = await executeLocalLiveGoalRequest(runtime, {
    objective: "Run one bounded live Goal.",
    discipline: "none",
    startCommandId: "live_start",
    continueCommandId: "live_continue"
  });

  assert.equal(result, continued);
  assert.deepEqual(handled, [{
    type: "start",
    command_id: "live_start",
    objective: "Run one bounded live Goal."
  }, {
    type: "continue",
    command_id: "live_continue",
    goal_id: "goal_live_123"
  }]);
});

test("live ingress rejects legacy query/todo discipline before dispatch", async () => {
  let calls = 0;
  const runtime: GoalRuntimePort = {
    async handle() {
      calls += 1;
      throw new Error("must not dispatch");
    },
    async read() {
      calls += 1;
      throw new Error("must not read");
    },
    async inspect() {
      calls += 1;
      throw new Error("must not inspect");
    }
  };

  assert.throws(() => assertLocalLiveGoalRequest({
    objective: "Do not dual-write legacy discipline state.",
    discipline: "query_todo"
  }), /live now uses GoalRuntime.*without --query-todo.*goal continue or goal resume/);
  await assert.rejects(executeLocalLiveGoalRequest(runtime, {
    objective: "Do not dual-write legacy discipline state.",
    discipline: "query_todo",
    startCommandId: "legacy_live_start",
    continueCommandId: "legacy_live_continue"
  }), /does not support query\/todo discipline/);
  assert.equal(calls, 0);
});

test("live CLI rejects query/todo before repository or GoalRuntime construction", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-live-query-todo-rejection-"));
  const stateRoot = join(root, "state-must-not-exist");
  try {
    const result = await runRuntimeCli([
      "live",
      "--query-todo",
      "--task",
      "Reject legacy discipline before construction.",
      "--repo-root",
      join(root, "repo-must-not-exist"),
      "--config-dir",
      join(root, "config-must-not-exist"),
      "--state-root",
      stateRoot
    ]);

    assert.notEqual(result.error, null);
    assert.match(result.stderr, /live now uses GoalRuntime.*without --query-todo.*goal continue or goal resume/);
    assert.doesNotMatch(result.stderr, /ENOENT|config\.jsonl|repository/i);
    await assert.rejects(readdir(stateRoot), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live CLI routes through one canonical GoalRuntime identity without legacy state", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-live-cli-goal-runtime-"));
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  const repoRoot = join(root, "repo");
  const homeRoot = join(root, "home");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(repoRoot, { recursive: true });
  try {
    await runGit(repoRoot, ["init", "-b", "develop"]);
    await runGit(repoRoot, ["config", "user.name", "Live CLI Goal Test"]);
    await runGit(repoRoot, ["config", "user.email", "live-cli-goal@example.test"]);
    await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
    await writeFile(join(repoRoot, "README.md"), "live CLI goal fixture\n", "utf8");
    await runGit(repoRoot, ["add", "README.md"]);
    await runGit(repoRoot, ["commit", "-m", "fixture base"]);
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "missing-live-model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), "", "utf8");

    const cli = await runRuntimeCli([
      "live",
      "--task",
      "Keep one Goal identity when cognition is unavailable.",
      "--repo-root",
      repoRoot,
      "--config-dir",
      configDir,
      "--state-root",
      stateRoot
    ]);

    assert.equal(cli.error, null, cli.stderr);
    const result = JSON.parse(cli.stdout) as GoalView;
    assert.match(result.goal_id, /^goal_/);
    assert.equal(result.status, "active");
    assert.deepEqual(result.continuation_reasons, ["blocked"]);
    assert.match(result.checkpoint.summary, /Active model not found.*missing-live-model/);
    assert.equal(result.receipt, null);

    assert.deepEqual((await readdir(stateRoot)).sort(), ["goals"]);
    const goalEntries = (await readdir(join(stateRoot, "goals"))).sort();
    assert.deepEqual(goalEntries, ["checkpoints", "events.jsonl"]);
    const events = (await readFile(join(stateRoot, "goals/events.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(events.map((event) => event.event_type), ["goal_started", "goal_blocked"]);
    assert.equal(events.every((event) => event.goal_id === result.goal_id), true);
    assert.notEqual(events[0]?.command_id, events[1]?.command_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live GoalRuntime ingress writes only canonical goal state", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-live-goal-ingress-"));
  const stateRoot = join(root, "state");
  const repoRoot = join(root, "repo");
  await mkdir(stateRoot, { recursive: true });
  await mkdir(repoRoot, { recursive: true });
  try {
    await runGit(repoRoot, ["init", "-b", "develop"]);
    await runGit(repoRoot, ["config", "user.name", "Live Goal Ingress Test"]);
    await runGit(repoRoot, ["config", "user.email", "live-goal@example.test"]);
    await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
    await writeFile(join(repoRoot, "README.md"), "live goal fixture\n", "utf8");
    await runGit(repoRoot, ["add", "README.md"]);
    await runGit(repoRoot, ["commit", "-m", "fixture base"]);

    const runtime = new GoalRuntime({
      store: new AgentStore(repoRoot, stateRoot),
      cognition: {
        async next() {
          return {
            type: "outcome",
            outcome: {
              summary: "The bounded live Goal completed without legacy state.",
              runtime_result: {
                status: "healthy",
                summary: "The canonical GoalRuntime path is healthy."
              },
              residual_risks: []
            }
          };
        }
      },
      toolExecutor: {
        async execute() {
          throw new Error("outcome-only fixture must not execute a tool");
        }
      },
      verifier: {
        async verify(input) {
          return {
            status: "passed",
            summary: "Canonical Goal events support the deterministic outcome.",
            checks: [{
              id: "live_goal_ingress",
              status: "passed",
              summary: "One Goal identity reached one verified receipt.",
              evidence_event_ids: input.candidate.evidence_event_ids
            }],
            next_action: null
          };
        }
      }
    });

    const result = await executeLocalLiveGoalRequest(runtime, {
      objective: "Complete one deterministic live Goal.",
      discipline: "none",
      startCommandId: "canonical_live_start",
      continueCommandId: "canonical_live_continue"
    });

    assert.equal(result.status, "completed");
    assert.equal(result.receipt?.decision, "accepted");
    assert.deepEqual((await readdir(stateRoot)).sort(), ["goals"]);
    assert.deepEqual((await readdir(join(stateRoot, "goals"))).sort(), [
      "checkpoints",
      "events.jsonl",
      "receipts"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local goal lifecycle remains usable when the selected active model is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-goal-cli-missing-model-"));
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  const repoRoot = join(root, "repo");
  const homeRoot = join(root, "home");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(repoRoot, { recursive: true });
  try {
    await runGit(repoRoot, ["init", "-b", "develop"]);
    await runGit(repoRoot, ["config", "user.name", "Goal CLI Test"]);
    await runGit(repoRoot, ["config", "user.email", "goal-cli@example.test"]);
    await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
    await writeFile(join(repoRoot, "README.md"), "goal CLI fixture\n", "utf8");
    await runGit(repoRoot, ["add", "README.md"]);
    await runGit(repoRoot, ["commit", "-m", "fixture base"]);
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
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

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
        return;
      }
      resolvePromise();
    });
  });
}

function runRuntimeCli(args: string[]): Promise<{
  error: Error | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolvePromise) => {
    execFile(process.execPath, ["--import", "tsx", "apps/cli/src/main.ts", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      maxBuffer: 10 * 1024 * 1024
    }, (error, stdout, stderr) => {
      resolvePromise({ error, stdout, stderr });
    });
  });
}
