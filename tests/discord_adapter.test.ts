import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listRuntimeChannelOutbox, recordRuntimeChannelOutbound } from "../packages/core/src/runtime_channel_outbox.js";
import { listRuntimeTaskQueue } from "../packages/core/src/runtime_task_queue.js";
import { listRuntimeInbox, listRuntimeSessions, listRuntimeTaskRuns } from "../packages/core/src/runtime_sessions.js";
import type { RunResult } from "../packages/core/src/schemas.js";
import { AgentStore } from "../packages/core/src/store.js";
import { DiscordBotAdapter } from "../packages/runtime/src/channels/discord/adapter.js";
import type {
  DiscordChannelConfig,
  DiscordMessage,
  DiscordSendResult,
  DiscordTransport,
  TaskRunner
} from "../packages/runtime/src/channels/discord/types.js";

test("Discord guild channel session bind and run use the provider-neutral runtime path", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner();
    const transport = new MockDiscordTransport();
    const adapter = new DiscordBotAdapter({
      config: testDiscordConfig({ allowedUserIds: ["42"], allowedGuildIds: ["guild-1"], botUserId: "bot-1" }),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleMessage(discordMessage({
      messageId: "m-10",
      channelId: "channel-1",
      guildId: "guild-1",
      userId: "42",
      text: "/session use ops"
    }));
    await adapter.handleMessage(discordMessage({
      messageId: "m-11",
      channelId: "channel-1",
      guildId: "guild-1",
      userId: "99",
      text: "<@bot-1> check service status"
    }));

    const sessions = await listRuntimeSessions(fixture.store);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.source_kind, "discord");
    assert.equal(sessions[0]?.profile, "ops");
    const inbox = await listRuntimeInbox(fixture.store, sessions[0]!.id);
    assert.deepEqual(inbox.map((entry) => entry.trigger_kind), ["session_command", "mention"]);
    assert.equal(runner.tasks.length, 1);
    assert.match(runner.tasks[0], /Discord runtime session message received/);
    assert.match(runner.tasks[0], /check service status/);
    assert.deepEqual(transport.sent.map((item) => item.text), [
      `已绑定 runtime session: ${sessions[0]!.id}\nprofile: ops\n后续普通消息会进入 inbox；使用 /run 或 bot mention 才会执行任务。`,
      "收到，正在处理。",
      "discord done"
    ]);

    const runs = await listRuntimeTaskRuns(fixture.store);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.source_kind, "discord");
    assert.equal(runs[0]?.status, "done");
    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.source_kind, "discord");
    assert.equal(tasks[0]?.source_route_key, "discord:discord-main:guild_text:channel-1:main");
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.source_kind, "discord");
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.task_run_id, runs[0]?.id);
    assert.equal(outbox[0]?.text, "discord done");
  } finally {
    await fixture.cleanup();
  }
});

test("Discord adapter drains queued provider-neutral outbox replies", async () => {
  const fixture = await createFixture();
  try {
    const transport = new MockDiscordTransport();
    const adapter = new DiscordBotAdapter({
      config: testDiscordConfig(),
      transport,
      runner: new StubRunner(),
      store: fixture.store
    });
    const queued = await recordRuntimeChannelOutbound(fixture.store, {
      source: {
        kind: "discord",
        channelId: "discord-main",
        conversationType: "guild_text",
        conversationId: "channel-1",
        threadId: null,
        profile: "ops"
      },
      sourceKey: "discord:discord-main:guild_text:channel-1:main:ops",
      runtimeSessionId: "runtime_session_discord",
      taskRunId: "runtime_task_discord",
      purpose: "final",
      status: "queued",
      text: "Recovered Discord final answer.",
      now: "2026-07-07T00:00:00.000Z"
    });

    const drained = await adapter.drainRuntimeChannelOutbox();

    assert.equal(drained.queued_count, 1);
    assert.equal(drained.sent_count, 1);
    assert.deepEqual(drained.outbox_ids, [queued.id]);
    assert.deepEqual(transport.sent.map((item) => ({
      channelId: item.channelId,
      text: item.text
    })), [{
      channelId: "channel-1",
      text: "Recovered Discord final answer."
    }]);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.provider_delivery_ref, `channels/discord/outbox/${queued.id}.json`);
    assert.deepEqual(outbox[0]?.provider_message_ids, ["discord_sent_1"]);
  } finally {
    await fixture.cleanup();
  }
});

function testDiscordConfig(overrides: Partial<DiscordChannelConfig> = {}): DiscordChannelConfig {
  return {
    channelId: "discord-main",
    botToken: "token",
    allowedUserIds: [],
    allowedGuildIds: [],
    gatewayUrl: "wss://gateway.discord.gg/?v=10&encoding=json",
    apiBaseUrl: "https://discord.com/api/v10",
    intents: 37376,
    ackText: "收到，正在处理。",
    busyText: "busy",
    pendingText: "pending",
    errorText: "error",
    dedupCacheSize: 32,
    textChunkLimit: 1900,
    ...overrides
  };
}

function discordMessage(args: {
  messageId: string;
  channelId: string;
  guildId?: string;
  userId: string;
  text: string;
}): DiscordMessage {
  return {
    id: args.messageId,
    channel_id: args.channelId,
    guild_id: args.guildId,
    content: args.text,
    timestamp: "2026-07-07T00:00:00.000Z",
    author: { id: args.userId }
  };
}

class MockDiscordTransport implements DiscordTransport {
  readonly sent: Array<{ channelId: string; text: string }> = [];

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async sendText(channelId: string, text: string): Promise<DiscordSendResult> {
    this.sent.push({ channelId, text });
    return {
      ok: true,
      messageId: `discord_sent_${this.sent.length}`,
      summary: "sent"
    };
  }
}

class StubRunner implements TaskRunner {
  readonly tasks: string[] = [];

  async runTask(task: string): Promise<RunResult> {
    this.tasks.push(task);
    return {
      trigger_id: "trigger_discord",
      opportunity_id: "opp_discord",
      session_id: "session_discord",
      turn_id: "turn_discord",
      context_ref: "memory/episodes/discord-context.md",
      context_manifest_ref: null,
      model_response_ref: "memory/episodes/discord-model.json",
      envelope_ref: "memory/episodes/discord-envelope.json",
      evidence_refs: [],
      sop_ref: null,
      audit_ref: null,
      skill_ref: null,
      recalled_skill_refs: [],
      final_response_ref: null,
      completion_report_ref: null,
      discipline_refs: null,
      completion_status: "done",
      verification_status: "passed",
      worktree: null,
      working_checkpoint_ref: null,
      next_action: null,
      verdict: "discord done"
    };
  }
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-discord-adapter-${process.pid}-${Date.now()}-${Math.random()}`);
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
