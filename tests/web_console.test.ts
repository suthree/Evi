import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listRuntimeSessions,
  resolveRuntimeSession,
  type FeishuSessionSource
} from "../packages/core/src/runtime_sessions.js";
import type { RunResult } from "../packages/core/src/schemas.js";
import { AgentStore } from "../packages/core/src/store.js";
import { startRuntimeWebConsole } from "../packages/runtime/src/web_console.js";

test("runtime web console exposes sessions, binds pending profiles, and records local runs", async () => {
  const fixture = await createFixture();
  const source: FeishuSessionSource = {
    kind: "feishu",
    channelId: "feishu-test",
    chatType: "group",
    chatId: "oc_web",
    threadId: "main",
    openId: "ou_operator"
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
