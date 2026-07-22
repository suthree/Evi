import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listRuntimeSessions,
  resolveRuntimeSession,
  type FeishuSessionSource,
  type RuntimeSessionSource
} from "../packages/core/src/runtime_sessions.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  createGoalIngress,
  GoalInteractionError,
  renderGoalIngressPresentation,
  type GoalIngressPort,
  type GoalRuntimePort
} from "../packages/runtime/src/goal_ingress.js";
import { GoalRuntime, type GoalView } from "../packages/runtime/src/goal_runtime.js";
import { startRuntimeWebConsole } from "../packages/runtime/src/web_console.js";
import { VNEXT_CANARY_DIAGNOSTIC_CHANNEL } from "../apps/cli/src/vnext_canary.js";

test("Goal ingress presentation exposes terminal receipt without an invalid continuation", () => {
  const rendered = renderGoalIngressPresentation(goalView("goal_done", {
    status: "completed",
    receipt: { summary: "Session work complete." } as GoalView["receipt"]
  }));

  assert.equal(rendered, [
    "Goal: goal_done",
    "Status: completed",
    "Result: Session work complete.",
    "Goal goal_done is completed; no continuation command is required."
  ].join("\n"));
});

test("Goal ingress errors preserve the Goal identity created before Continue", async () => {
  const commands: string[] = [];
  const latest = goalView("goal_started_before_failure", {
    status: "completed",
    receipt: { id: "goal_receipt_latest", summary: "latest canonical view" } as GoalView["receipt"]
  });
  const runtime: GoalRuntimePort = {
    async handle(command) {
      commands.push(command.type);
      if (command.type === "start") return goalView("goal_started_before_failure");
      throw new Error("continue failed");
    },
    async read() {
      commands.push("read");
      return latest;
    },
    async inspect() {
      throw new Error("ingress must not inspect around the canonical command result");
    }
  };

  await assert.rejects(createGoalIngress(runtime).submit("preserve failed Goal identity"), (error) => {
    assert.equal(error instanceof GoalInteractionError, true);
    assert.equal((error as GoalInteractionError).goalId, "goal_started_before_failure");
    assert.deepEqual((error as GoalInteractionError).goal, latest);
    assert.equal((error as Error).message, "continue failed");
    return true;
  });
  assert.deepEqual(commands, ["start", "continue", "read"]);
});

test("Goal ingress errors leave status unknown when canonical recovery also fails", async () => {
  const runtime: GoalRuntimePort = {
    async handle(command) {
      if (command.type === "start") return goalView("goal_identity_only");
      throw new Error("continue failed");
    },
    async read() {
      throw new Error("read failed");
    },
    async inspect() {
      throw new Error("inspect failed");
    }
  };

  await assert.rejects(createGoalIngress(runtime).submit("do not invent current Goal state"), (error) => {
    assert.equal(error instanceof GoalInteractionError, true);
    assert.equal((error as GoalInteractionError).goalId, "goal_identity_only");
    assert.equal((error as GoalInteractionError).goal, null);
    assert.equal((error as Error).message, "continue failed");
    return true;
  });
});

test("Goal interaction port translates read, Continue, manual Resume, and exact confirmation", async () => {
  const commands: Array<Record<string, unknown>> = [];
  const runtime: GoalRuntimePort = {
    async handle(command) {
      commands.push(command as unknown as Record<string, unknown>);
      return goalView("goal_interaction_123", {
        status: command.type === "resume" && command.confirm_effect_id ? "completed" : "active"
      });
    },
    async read(goalId) {
      commands.push({ type: "read", goal_id: goalId });
      return goalView(goalId);
    },
    async inspect() {
      throw new Error("interaction must not inspect");
    }
  };
  const interaction = createGoalIngress(runtime);

  await interaction.read("goal_interaction_123");
  await interaction.continue("goal_interaction_123");
  await interaction.resume("goal_interaction_123");
  await interaction.resume("goal_interaction_123", "goal_effect_interaction_123");
  assert.throws(() => interaction.resume("goal_interaction_123", ""), /goal confirmation requires an effect id/);

  assert.deepEqual(commands.map((command) => ({
    type: command.type,
    goal_id: command.goal_id,
    confirm_effect_id: command.confirm_effect_id ?? null
  })), [
    { type: "read", goal_id: "goal_interaction_123", confirm_effect_id: null },
    { type: "continue", goal_id: "goal_interaction_123", confirm_effect_id: null },
    { type: "resume", goal_id: "goal_interaction_123", confirm_effect_id: null },
    { type: "resume", goal_id: "goal_interaction_123", confirm_effect_id: "goal_effect_interaction_123" }
  ]);
  const commandIds = commands
    .filter((command) => typeof command.command_id === "string")
    .map((command) => command.command_id);
  assert.equal(new Set(commandIds).size, 3);
});

test("Feishu Goal presentation keeps canonical lifecycle separate from outcome prose", () => {
  const rendered = renderGoalIngressPresentation(goalView("goal_feishu_done", {
    status: "completed",
    receipt: {
      id: "goal_receipt_feishu_done",
      summary: "Model prose incorrectly says status=active."
    } as GoalView["receipt"]
  }), { surface: "feishu" });

  assert.equal(rendered, [
    "Goal: goal_feishu_done",
    "Canonical status: completed",
    "Receipt: goal_receipt_feishu_done",
    "Outcome (receipt content; canonical lifecycle is shown above): Model prose incorrectly says status=active.",
    "Goal goal_feishu_done is completed; no continuation command is required."
  ].join("\n"));
});

test("runtime web console preserves session reads and submits one canonical Goal ingress", async () => {
  const fixture = await createFixture();
  const canaryDispatches: unknown[] = [];
  const canaryChannel = channel(VNEXT_CANARY_DIAGNOSTIC_CHANNEL);
  const recordCanaryDispatch = (message: unknown) => canaryDispatches.push(message);
  canaryChannel.subscribe(recordCanaryDispatch);
  const source: FeishuSessionSource = {
    kind: "feishu", channelId: "feishu-test", conversationType: "group",
    conversationId: "oc_web", threadId: "main", actorId: "ou_operator"
  };
  const pending = await resolveRuntimeSession(fixture.store, {
    source, actorAuthorized: true, now: "2026-07-07T00:00:00.000Z"
  });
  assert.ok(pending.session);
  const submitted: string[] = [];
  const handle = await startRuntimeWebConsole({
    store: fixture.store,
    port: 0,
    goalIngress: goalIngress((task) => {
      submitted.push(task);
      return goalView("goal_web_123");
    })
  });
  try {
    const sessions = await getJson(`${handle.url}/api/sessions`);
    assert.equal(sessions.sessions.length, 1);
    const bind = await postJson(`${handle.url}/api/sessions/${pending.session.id}/profile`, { profile: "ops" });
    assert.equal(bind.binding.profile, "ops");
    assert.equal((await listRuntimeSessions(fixture.store))[0]?.status, "active");

    const response = await postJson(`${handle.url}/api/runs`, { task: "check canonical web Goal" });
    assert.deepEqual(submitted, ["check canonical web Goal"]);
    assert.equal(response.goal.goal_id, "goal_web_123");
    assert.match(response.continue_hint, /goal continue --goal goal_web_123/);
    assert.deepEqual(canaryDispatches, []);
    await assertNoLegacyWebOrchestration(fixture.stateRoot);
  } finally {
    canaryChannel.unsubscribe(recordCanaryDispatch);
    await handle.close();
    await fixture.cleanup();
  }
});

test("runtime web console returns status-aware canonical Goal guidance", async () => {
  const fixture = await createFixture();
  const pendingEffect = (state: "awaiting_confirmation" | "outcome_unknown", effectId: string) => ({
    effect_id: effectId,
    state
  }) as GoalView["pending_effect"];
  const views = [
    goalView("goal_active"),
    goalView("goal_manual_pause", { status: "paused" }),
    goalView("goal_confirm", {
      status: "paused",
      pending_effect: pendingEffect("awaiting_confirmation", "effect_confirm_123")
    }),
    goalView("goal_unknown", {
      status: "paused",
      pending_effect: pendingEffect("outcome_unknown", "effect_unknown_123")
    }),
    goalView("goal_completed", { status: "completed" }),
    goalView("goal_abandoned", { status: "abandoned" })
  ];
  const handle = await startRuntimeWebConsole({
    store: fixture.store,
    port: 0,
    goalIngress: goalIngress(() => {
      const view = views.shift();
      if (!view) throw new Error("unexpected extra Goal submission");
      return view;
    })
  });
  try {
    const html = await fetch(handle.url).then((response) => response.text());
    assert.match(html, /result\.continue_hint/);
    const hints: string[] = [];
    for (const task of ["active", "manual", "confirm", "unknown", "completed", "abandoned"]) {
      hints.push((await postJson(`${handle.url}/api/runs`, { task })).continue_hint);
    }
    assert.match(hints[0]!, /goal continue --goal goal_active/);
    assert.match(hints[1]!, /goal resume --goal goal_manual_pause/);
    assert.match(hints[2]!, /goal resume --goal goal_confirm --confirm-effect effect_confirm_123/);
    assert.match(hints[3]!, /No safe continuation command.*effect_unknown_123/);
    assert.doesNotMatch(hints[3]!, /goal (continue|resume)/);
    assert.match(hints[4]!, /completed; no continuation command/);
    assert.match(hints[5]!, /abandoned; no continuation command/);
    await assertNoLegacyWebOrchestration(fixture.stateRoot);
  } finally {
    await handle.close();
    await fixture.cleanup();
  }
});

test("runtime web console profile-binds provider-neutral channel sessions", async () => {
  const fixture = await createFixture();
  const cases: Array<{ profile: string; source: RuntimeSessionSource; routeKey: string }> = [
    { profile: "ops", source: { kind: "telegram", channelId: "telegram-main", conversationType: "supergroup", conversationId: "-100123", threadId: "main", actorId: "tg_operator" }, routeKey: "telegram:telegram-main:supergroup:-100123:main" },
    { profile: "community", source: { kind: "discord", channelId: "discord-main", conversationType: "guild_text", conversationId: "channel-1", threadId: "main", actorId: "discord-user" }, routeKey: "discord:discord-main:guild_text:channel-1:main" }
  ];
  const sessionIds: string[] = [];
  for (const item of cases) {
    const pending = await resolveRuntimeSession(fixture.store, { source: item.source, actorAuthorized: true, now: "2026-07-07T00:00:00.000Z" });
    assert.ok(pending.session);
    assert.equal(pending.session.source_route_key, item.routeKey);
    sessionIds.push(pending.session.id);
  }
  const handle = await startRuntimeWebConsole({ store: fixture.store, port: 0 });
  try {
    for (const [index, item] of cases.entries()) {
      const bind = await postJson(`${handle.url}/api/sessions/${sessionIds[index]}/profile`, { profile: item.profile });
      assert.equal(bind.binding.source_kind, item.source.kind);
      assert.equal(bind.binding.profile, item.profile);
    }
    assert.deepEqual((await listRuntimeSessions(fixture.store)).map((session) => session.status), ["active", "active"]);
  } finally {
    await handle.close();
    await fixture.cleanup();
  }
});

test("runtime web console writes only canonical Goal state for a new task", async () => {
  const fixture = await createFixture();
  await runGit(fixture.repoRoot, ["init", "-b", "develop"]);
  await runGit(fixture.repoRoot, ["config", "user.name", "Web Goal Test"]);
  await runGit(fixture.repoRoot, ["config", "user.email", "web-goal@example.test"]);
  await writeFile(join(fixture.repoRoot, "README.md"), "web goal fixture\n");
  await runGit(fixture.repoRoot, ["add", "README.md"]);
  await runGit(fixture.repoRoot, ["commit", "-m", "fixture base"]);
  const runtime = new GoalRuntime({
    store: fixture.store,
    cognition: { async next() { return { type: "blocked", summary: "Need one explicit next step.", next_action: "continue the same Goal" } as const; } },
    toolExecutor: { async execute() { throw new Error("blocked fixture does not execute tools"); } },
    verifier: { async verify() { throw new Error("blocked fixture does not verify"); } }
  });
  const handle = await startRuntimeWebConsole({ store: fixture.store, port: 0, goalIngress: createGoalIngress(runtime) });
  try {
    const response = await postJson(`${handle.url}/api/runs`, { task: "Keep this web task in one Goal." });
    assert.match(response.goal.goal_id, /^goal_/);
    assert.equal(response.goal.status, "active");
    const events = (await readFile(join(fixture.stateRoot, "goals/events.jsonl"), "utf8"))
      .trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(events.map((event) => event.event_type), ["goal_started", "goal_blocked"]);
    assert.equal(events.every((event) => event.goal_id === response.goal.goal_id), true);
    await assertNoLegacyWebOrchestration(fixture.stateRoot);
  } finally {
    await handle.close();
    await fixture.cleanup();
  }
});

test("runtime web console rejects new tasks when the canonical Goal ingress is absent", async () => {
  const fixture = await createFixture();
  const handle = await startRuntimeWebConsole({ store: fixture.store, port: 0 });
  try {
    const response = await fetch(`${handle.url}/api/runs`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "do not use legacy orchestration" })
    });
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Goal ingress is not configured/);
    await assertNoLegacyWebOrchestration(fixture.stateRoot);
  } finally {
    await handle.close();
    await fixture.cleanup();
  }
});

test("runtime web console rejects legacy execution fields instead of silently mapping authority", async () => {
  const fixture = await createFixture();
  let submissions = 0;
  const handle = await startRuntimeWebConsole({
    store: fixture.store,
    port: 0,
    goalIngress: goalIngress(() => {
      submissions += 1;
      return goalView("goal_must_not_start");
    })
  });
  try {
    for (const legacy of [
      { runtime_session_id: "runtime_session_legacy" },
      { execution_contract: { schema_version: 1 } }
    ]) {
      const response = await fetch(`${handle.url}/api/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "Do not translate legacy authority.", ...legacy })
      });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /legacy|cannot be mapped/);
    }
    assert.equal(submissions, 0);
    await assertNoLegacyWebOrchestration(fixture.stateRoot);
  } finally {
    await handle.close();
    await fixture.cleanup();
  }
});

function goalIngress(submit: (task: string) => GoalView): GoalIngressPort {
  return { submit: async (task) => submit(task) };
}

function goalView(goalId: string, overrides: Partial<GoalView> = {}): GoalView {
  return {
    goal_id: goalId,
    status: "active",
    pending_effect: null,
    ...overrides
  } as GoalView;
}

async function assertNoLegacyWebOrchestration(stateRoot: string): Promise<void> {
  for (const rel of ["runs/task_queue.jsonl", "runs/index.jsonl", "channels/outbox.jsonl"]) {
    assert.equal(await fileExists(join(stateRoot, rel)), false, `${rel} must not be written by a Web Goal`);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  assert.equal(response.ok, true);
  return response.json();
}

async function postJson(url: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) assert.fail(await response.text());
  return response.json();
}

async function createFixture(): Promise<{ repoRoot: string; stateRoot: string; store: AgentStore; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `local-runtime-web-console-${process.pid}-${Date.now()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return { repoRoot, stateRoot, store: new AgentStore(repoRoot, stateRoot), cleanup: () => rm(root, { recursive: true, force: true }) };
}

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
      else resolvePromise();
    });
  });
}
