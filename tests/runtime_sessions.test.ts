import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendRuntimeInboxEntry,
  bindRuntimeSessionSource,
  feishuRouteKey,
  feishuSourceKey,
  listRuntimeInbox,
  listRuntimeSessionBindings,
  listRuntimeSessions,
  listRuntimeTaskRuns,
  recordRuntimeTaskRun,
  resolveRuntimeSession,
  type FeishuSessionSource
} from "../packages/core/src/runtime_sessions.js";
import { AgentStore } from "../packages/core/src/store.js";

test("unknown Feishu group requires an authorized bootstrap before creating a pending session", async () => {
  const fixture = await createFixture();
  try {
    const source = groupSource({ actorId: "ou_member" });

    const denied = await resolveRuntimeSession(fixture.store, {
      source,
      actorAuthorized: false,
      now: "2026-07-07T00:00:00.000Z"
    });

    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "unauthorized_unknown_source");
    assert.equal((await listRuntimeSessions(fixture.store)).length, 0);

    const created = await resolveRuntimeSession(fixture.store, {
      source: { ...source, actorId: "ou_operator" },
      actorAuthorized: true,
      now: "2026-07-07T00:00:01.000Z"
    });

    assert.equal(created.ok, true);
    assert.equal(created.reason, "created_pending");
    assert.equal(created.session?.status, "pending");
    assert.equal(created.session?.profile, "unassigned");
    assert.equal(created.binding?.created_by_actor_id, "ou_operator");
    assert.equal(created.binding?.created_by_open_id, "ou_operator");
    assert.equal(created.binding?.route_key, feishuRouteKey(source));
    assert.equal(created.binding?.source_key, feishuSourceKey(source, "unassigned"));

    const sessions = await listRuntimeSessions(fixture.store);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.id, created.session?.id);
  } finally {
    await fixture.cleanup();
  }
});

test("binding a Feishu source profile activates the runtime session and future messages reuse it", async () => {
  const fixture = await createFixture();
  try {
    const source = groupSource({ actorId: "ou_operator" });
    const created = await resolveRuntimeSession(fixture.store, {
      source,
      actorAuthorized: true,
      now: "2026-07-07T00:00:01.000Z"
    });
    assert.ok(created.session);

    const binding = await bindRuntimeSessionSource(fixture.store, {
      source: { ...source, profile: "content-role" },
      runtimeSessionId: created.session.id,
      profile: "content-role",
      createdByActorId: "ou_operator",
      now: "2026-07-07T00:00:02.000Z"
    });

    assert.equal(binding.profile, "content-role");
    assert.equal(binding.source_key, feishuSourceKey({ ...source, profile: "content-role" }, "content-role"));

    const resolved = await resolveRuntimeSession(fixture.store, {
      source: { ...source, actorId: "ou_member" },
      actorAuthorized: false,
      now: "2026-07-07T00:00:03.000Z"
    });

    assert.equal(resolved.ok, true);
    assert.equal(resolved.reason, "bound");
    assert.equal(resolved.session?.id, created.session.id);
    assert.equal(resolved.session?.status, "active");
    assert.equal(resolved.session?.profile, "content-role");

    const activeBindings = await listRuntimeSessionBindings(fixture.store);
    assert.equal(activeBindings.length, 1);
    assert.equal(activeBindings[0]?.profile, "content-role");
  } finally {
    await fixture.cleanup();
  }
});

test("runtime sessions record Feishu inbox entries and task runs as local state", async () => {
  const fixture = await createFixture();
  try {
    const source = groupSource({ actorId: "ou_operator", profile: "ops" });
    const created = await resolveRuntimeSession(fixture.store, {
      source,
      actorAuthorized: true,
      now: "2026-07-07T00:00:01.000Z"
    });
    assert.ok(created.session);

    await appendRuntimeInboxEntry(fixture.store, {
      sessionId: created.session.id,
      source,
      messageId: "om_group_1",
      text: "/run check status",
      triggerKind: "run_command",
      runRequested: true,
      now: "2026-07-07T00:00:02.000Z"
    });

    await writeFile(join(fixture.stateRoot, "sessions/inbox", `${created.session.id}.jsonl`), "not-json\n", {
      flag: "a"
    });

    const run = await recordRuntimeTaskRun(fixture.store, {
      runtimeSessionId: created.session.id,
      sourceKind: "feishu",
      sourceKey: feishuSourceKey(source, "ops"),
      task: "check status",
      status: "queued",
      now: "2026-07-07T00:00:03.000Z"
    });

    const inbox = await listRuntimeInbox(fixture.store, created.session.id);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.message_id, "om_group_1");
    assert.equal(inbox[0]?.run_requested, true);
    assert.equal(inbox[0]?.trigger_kind, "run_command");

    const runs = await listRuntimeTaskRuns(fixture.store);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.id, run.id);
    assert.equal(runs[0]?.runtime_session_id, created.session.id);
    assert.equal(runs[0]?.status, "queued");
  } finally {
    await fixture.cleanup();
  }
});

test("runtime task run read model keeps the latest append-only status per run id", async () => {
  const fixture = await createFixture();
  try {
    const started = await recordRuntimeTaskRun(fixture.store, {
      runtimeSessionId: "runtime_session_1",
      sourceKind: "feishu",
      sourceKey: "feishu:default:group:oc_group:main:ops",
      task: "check daemon",
      status: "running",
      now: "2026-07-07T00:00:01.000Z"
    });
    await recordRuntimeTaskRun(fixture.store, {
      id: started.id,
      createdAt: started.created_at,
      runtimeSessionId: "runtime_session_1",
      sourceKind: "feishu",
      sourceKey: "feishu:default:group:oc_group:main:ops",
      task: "check daemon",
      status: "done",
      now: "2026-07-07T00:00:02.000Z"
    });

    const raw = await readFile(join(fixture.stateRoot, "runs/index.jsonl"), "utf8");
    assert.equal(raw.trim().split(/\r?\n/).length, 2);
    const runs = await listRuntimeTaskRuns(fixture.store);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.id, started.id);
    assert.equal(runs[0]?.status, "done");
    assert.equal(runs[0]?.created_at, "2026-07-07T00:00:01.000Z");
    assert.equal(runs[0]?.updated_at, "2026-07-07T00:00:02.000Z");
  } finally {
    await fixture.cleanup();
  }
});

test("runtime sessions accept provider-neutral channel sources", async () => {
  const fixture = await createFixture();
  try {
    const source = {
      kind: "telegram",
      channelId: "telegram-main",
      conversationType: "group",
      conversationId: "-100123",
      threadId: "main",
      actorId: "tg_operator",
      profile: "ops"
    } as const;

    const created = await resolveRuntimeSession(fixture.store, {
      source,
      actorAuthorized: true,
      now: "2026-07-07T00:00:01.000Z"
    });
    assert.ok(created.session);
    assert.equal(created.session.source_kind, "telegram");
    assert.equal(created.session.source_route_key, "telegram:telegram-main:group:-100123:main");

    await appendRuntimeInboxEntry(fixture.store, {
      sessionId: created.session.id,
      source,
      messageId: "tg_message_1",
      text: "check queue",
      triggerKind: "inbox_only",
      now: "2026-07-07T00:00:02.000Z"
    });

    const inbox = await listRuntimeInbox(fixture.store, created.session.id);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.source_kind, "telegram");
    assert.equal(inbox[0]?.conversation_type, "group");
    assert.equal(inbox[0]?.conversation_id, "-100123");
    assert.equal(inbox[0]?.sender_actor_id, "tg_operator");
    assert.equal(inbox[0]?.sender_id, "tg_operator");
  } finally {
    await fixture.cleanup();
  }
});

function groupSource(overrides: Partial<FeishuSessionSource> = {}): FeishuSessionSource {
  return {
    kind: "feishu",
    channelId: "default",
    conversationType: "group",
    conversationId: "oc_group",
    threadId: "main",
    actorId: "ou_user",
    ...overrides
  };
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-sessions-${process.pid}-${Date.now()}`);
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
