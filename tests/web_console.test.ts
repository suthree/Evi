import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listRuntimeSessions,
  resolveRuntimeSession,
  type FeishuSessionSource,
  type RuntimeSessionSource
} from "../packages/core/src/runtime_sessions.js";
import { listRuntimeChannelOutbox } from "../packages/core/src/runtime_channel_outbox.js";
import { listRuntimeTaskQueue } from "../packages/core/src/runtime_task_queue.js";
import type { RunResult } from "../packages/core/src/schemas.js";
import { AgentStore } from "../packages/core/src/store.js";
import { startRuntimeWebConsole } from "../packages/runtime/src/web_console.js";

test("runtime web console exposes sessions, binds pending profiles, and records local runs", async () => {
  const fixture = await createFixture();
  const source: FeishuSessionSource = {
    kind: "feishu",
    channelId: "feishu-test",
    conversationType: "group",
    conversationId: "oc_web",
    threadId: "main",
    actorId: "ou_operator"
  };
  const pending = await resolveRuntimeSession(fixture.store, {
    source,
    actorAuthorized: true,
    now: "2026-07-07T00:00:00.000Z"
  });
  assert.ok(pending.session);

  const handle = await startRuntimeWebConsole({
    store: fixture.store,
    port: 0,
    runTask: async (task, args) => stubRunResult(task, args.runtimeSessionId)
  });
  try {
    const sessions = await getJson(`${handle.url}/api/sessions`);
    assert.equal(sessions.sessions.length, 1);
    assert.equal(sessions.sessions[0].status, "pending");

    const bind = await postJson(`${handle.url}/api/sessions/${pending.session.id}/profile`, {
      profile: "ops"
    });
    assert.equal(bind.binding.profile, "ops");
    assert.equal((await listRuntimeSessions(fixture.store))[0]?.status, "active");

    const run = await postJson(`${handle.url}/api/runs`, {
      runtime_session_id: pending.session.id,
      task: "check web console"
    });
    assert.equal(run.run.runtime_session_id, pending.session.id);
    assert.equal(run.run.status, "done");
    assert.equal(run.run.task, "check web console");

    const runs = await getJson(`${handle.url}/api/runs`);
    assert.equal(runs.runs.length, 1);
    assert.equal(runs.runs[0].verdict, "done");
    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.id, run.run.id);
    assert.equal(tasks[0]?.status, "done");
    const rawRuns = await readFile(join(fixture.stateRoot, "runs/index.jsonl"), "utf8");
    assert.equal(rawRuns.trim().split(/\r?\n/).length, 3);
    const rawQueue = await readJsonl(join(fixture.stateRoot, "runs/task_queue.jsonl"));
    assert.deepEqual(rawQueue.map((entry) => entry.status), ["queued", "running", "done"]);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.source_kind, "web");
    assert.equal(outbox[0]?.purpose, "final");
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.task_run_id, run.run.id);
    assert.equal(outbox[0]?.runtime_session_id, pending.session.id);
    assert.equal(outbox[0]?.text, "done");
  } finally {
    await handle.close();
    await fixture.cleanup();
  }
});

test("runtime web console profile-binds provider-neutral channel sessions", async () => {
  const fixture = await createFixture();
  const cases: Array<{ name: string; profile: string; source: RuntimeSessionSource; routeKey: string }> = [
    {
      name: "telegram",
      profile: "ops",
      source: {
        kind: "telegram",
        channelId: "telegram-main",
        conversationType: "supergroup",
        conversationId: "-100123",
        threadId: "main",
        actorId: "tg_operator"
      },
      routeKey: "telegram:telegram-main:supergroup:-100123:main"
    },
    {
      name: "discord",
      profile: "community",
      source: {
        kind: "discord",
        channelId: "discord-main",
        conversationType: "guild_text",
        conversationId: "channel-1",
        threadId: "main",
        actorId: "discord-user"
      },
      routeKey: "discord:discord-main:guild_text:channel-1:main"
    }
  ];
  const pendingSessionIds: string[] = [];
  for (const item of cases) {
    const pending = await resolveRuntimeSession(fixture.store, {
      source: item.source,
      actorAuthorized: true,
      now: "2026-07-07T00:00:00.000Z"
    });
    assert.ok(pending.session, item.name);
    assert.equal(pending.session.source_kind, item.source.kind);
    assert.equal(pending.session.source_route_key, item.routeKey);
    assert.equal(pending.session.status, "pending");
    pendingSessionIds.push(pending.session.id);
  }

  const handle = await startRuntimeWebConsole({
    store: fixture.store,
    port: 0
  });
  try {
    for (const [index, item] of cases.entries()) {
      const sessionId = pendingSessionIds[index];
      assert.ok(sessionId);
      const bind = await postJson(`${handle.url}/api/sessions/${sessionId}/profile`, {
        profile: item.profile
      });
      assert.equal(bind.binding.source_kind, item.source.kind);
      assert.equal(bind.binding.profile, item.profile);
      assert.equal(bind.binding.route_key, item.routeKey);
      const session = bind.sessions.find((entry: { id: string }) => entry.id === sessionId);
      assert.equal(session?.status, "active");
      assert.equal(session?.profile, item.profile);
    }

    const sessions = await listRuntimeSessions(fixture.store);
    assert.equal(sessions.length, 2);
    assert.deepEqual(sessions.map((session) => session.status), ["active", "active"]);
  } finally {
    await handle.close();
    await fixture.cleanup();
  }
});

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  assert.equal(response.ok, true);
  return response.json();
}

async function postJson(url: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) assert.fail(await response.text());
  return response.json();
}

function stubRunResult(task: string, runtimeSessionId: string | null): RunResult {
  return {
    trigger_id: "trigger_web",
    opportunity_id: "opp_web",
    session_id: runtimeSessionId ?? "session_web",
    turn_id: "turn_web",
    context_ref: "memory/episodes/web-context.md",
    context_manifest_ref: null,
    model_response_ref: "memory/episodes/web-model.json",
    envelope_ref: "memory/episodes/web-envelope.json",
    evidence_refs: [`task:${task}`],
    sop_ref: null,
    audit_ref: null,
    skill_ref: null,
    recalled_skill_refs: [],
    final_response_ref: null,
    completion_report_ref: null,
    discipline_refs: null,
    verdict: "done"
  };
}

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, any>);
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `xingzhe-web-console-${process.pid}-${Date.now()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    store: new AgentStore(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
