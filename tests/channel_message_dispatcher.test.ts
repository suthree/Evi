import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listRuntimeInbox, listRuntimeSessions } from "../packages/core/src/runtime_sessions.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  dispatchRuntimeChannelMessage,
  classifyRuntimeChannelTrigger
} from "../packages/runtime/src/channel_message_dispatcher.js";

test("channel message dispatcher creates pending sessions and inbox entries for authorized sources", async () => {
  const fixture = await createFixture();
  try {
    const result = await dispatchRuntimeChannelMessage(fixture.store, {
      message: {
        source: {
          kind: "telegram",
          channelId: "telegram-main",
          conversationType: "group",
          conversationId: "-100123",
          actorId: "tg_operator"
        },
        messageId: "tg_1",
        text: "先记录这个群"
      },
      actorAuthorized: true,
      now: "2026-07-07T00:00:01.000Z"
    });

    assert.equal(result.kind, "session_pending");
    assert.equal(result.kind === "session_pending" ? result.notify : false, true);
    const sessions = await listRuntimeSessions(fixture.store);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.source_kind, "telegram");
    assert.equal(sessions[0]?.status, "pending");
    const inbox = await listRuntimeInbox(fixture.store, sessions[0]!.id);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.source_kind, "telegram");
    assert.equal(inbox[0]?.trigger_kind, "inbox_only");
  } finally {
    await fixture.cleanup();
  }
});

test("channel message dispatcher binds a source once and reuses it for run requests", async () => {
  const fixture = await createFixture();
  try {
    const source = {
      kind: "discord",
      channelId: "discord-main",
      conversationType: "channel",
      conversationId: "chan_123",
      actorId: "discord_operator"
    } as const;
    const bound = await dispatchRuntimeChannelMessage(fixture.store, {
      message: {
        source,
        messageId: "dc_bind",
        text: "/session use ops"
      },
      actorAuthorized: true,
      now: "2026-07-07T00:00:01.000Z"
    });

    assert.equal(bound.kind, "session_bound");
    assert.equal(bound.kind === "session_bound" ? bound.binding.profile : "", "ops");

    const run = await dispatchRuntimeChannelMessage(fixture.store, {
      message: {
        source: { ...source, actorId: "discord_member" },
        messageId: "dc_run",
        text: "/run check daemon"
      },
      actorAuthorized: false,
      now: "2026-07-07T00:00:02.000Z"
    });

    assert.equal(run.kind, "run_requested");
    assert.equal(run.kind === "run_requested" ? run.taskText : "", "check daemon");
    assert.equal(run.kind === "run_requested" ? run.session.profile : "", "ops");
    const inbox = await listRuntimeInbox(fixture.store, run.kind === "run_requested" ? run.session.id : "");
    assert.deepEqual(inbox.map((entry) => entry.trigger_kind), ["session_command", "run_command"]);
  } finally {
    await fixture.cleanup();
  }
});

test("channel message dispatcher uses adapter-provided mention rules", () => {
  const trigger = classifyRuntimeChannelTrigger("hello @bot check runtime", {
    isMention: (text) => text.includes("@bot"),
    stripMention: (text) => text.replace(/@bot\s*/, "").trim()
  });

  assert.equal(trigger.kind, "mention");
  assert.equal(trigger.runRequested, true);
  assert.equal(trigger.taskText, "hello check runtime");
});

test("channel message dispatcher denies unauthorized session binding without state writes", async () => {
  const fixture = await createFixture();
  try {
    const result = await dispatchRuntimeChannelMessage(fixture.store, {
      message: {
        source: {
          kind: "telegram",
          channelId: "telegram-main",
          conversationType: "group",
          conversationId: "-100999",
          actorId: "tg_member"
        },
        messageId: "tg_bind_denied",
        text: "/session use ops"
      },
      actorAuthorized: false
    });

    assert.equal(result.kind, "denied");
    assert.equal(result.kind === "denied" ? result.reason : "", "unauthorized_session_command");
    assert.equal((await listRuntimeSessions(fixture.store)).length, 0);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-channel-dispatcher-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
