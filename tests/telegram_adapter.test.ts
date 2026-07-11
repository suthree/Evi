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
import { TelegramBotAdapter } from "../packages/runtime/src/channels/telegram/adapter.js";
import type {
  TaskRunner,
  TelegramChannelConfig,
  TelegramSendResult,
  TelegramTransport,
  TelegramUpdate
} from "../packages/runtime/src/channels/telegram/types.js";

test("Telegram group session bind and run use the provider-neutral runtime path", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner();
    const transport = new MockTelegramTransport();
    const adapter = new TelegramBotAdapter({
      config: testTelegramConfig({ allowedUserIds: ["42"] }),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleUpdate(telegramUpdate({
      updateId: 100,
      messageId: 10,
      chatId: -100123,
      chatType: "supergroup",
      userId: 42,
      text: "/session use ops"
    }));
    await adapter.handleUpdate(telegramUpdate({
      updateId: 101,
      messageId: 11,
      chatId: -100123,
      chatType: "supergroup",
      userId: 99,
      text: "/run check service status"
    }));

    const sessions = await listRuntimeSessions(fixture.store);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.source_kind, "telegram");
    assert.equal(sessions[0]?.profile, "ops");
    const inbox = await listRuntimeInbox(fixture.store, sessions[0]!.id);
    assert.deepEqual(inbox.map((entry) => entry.trigger_kind), ["session_command", "run_command"]);
    assert.equal(runner.tasks.length, 1);
    assert.match(runner.tasks[0], /Telegram runtime session message received/);
    assert.match(runner.tasks[0], /check service status/);
    assert.deepEqual(transport.sent.map((item) => item.text), [
      `已绑定 runtime session: ${sessions[0]!.id}\nprofile: ops\n后续普通消息会进入 inbox；使用 /run 才会执行任务。`,
      "收到，正在处理。",
      "telegram done"
    ]);

    const runs = await listRuntimeTaskRuns(fixture.store);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.source_kind, "telegram");
    assert.equal(runs[0]?.status, "done");
    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.source_kind, "telegram");
    assert.equal(tasks[0]?.source_route_key, "telegram:telegram-main:supergroup:-100123:main");
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.source_kind, "telegram");
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.task_run_id, runs[0]?.id);
    assert.equal(outbox[0]?.text, "telegram done");
  } finally {
    await fixture.cleanup();
  }
});

test("Telegram adapter drains queued provider-neutral outbox replies", async () => {
  const fixture = await createFixture();
  try {
    const transport = new MockTelegramTransport();
    const adapter = new TelegramBotAdapter({
      config: testTelegramConfig(),
      transport,
      runner: new StubRunner(),
      store: fixture.store
    });
    const queued = await recordRuntimeChannelOutbound(fixture.store, {
      source: {
        kind: "telegram",
        channelId: "telegram-main",
        conversationType: "supergroup",
        conversationId: "-100123",
        threadId: "7",
        profile: "ops"
      },
      sourceKey: "telegram:telegram-main:supergroup:-100123:7:ops",
      runtimeSessionId: "runtime_session_telegram",
      taskRunId: "runtime_task_telegram",
      purpose: "final",
      status: "queued",
      text: "Recovered Telegram final answer.",
      now: "2026-07-07T00:00:00.000Z"
    });

    const drained = await adapter.drainRuntimeChannelOutbox();

    assert.equal(drained.queued_count, 1);
    assert.equal(drained.sent_count, 1);
    assert.deepEqual(drained.outbox_ids, [queued.id]);
    assert.deepEqual(transport.sent.map((item) => ({
      chatId: item.chatId,
      threadId: item.threadId,
      text: item.text
    })), [{
      chatId: "-100123",
      threadId: "7",
      text: "Recovered Telegram final answer."
    }]);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.provider_delivery_ref, `channels/telegram/outbox/${queued.id}.json`);
    assert.deepEqual(outbox[0]?.provider_message_ids, ["telegram_sent_1"]);
  } finally {
    await fixture.cleanup();
  }
});

function testTelegramConfig(overrides: Partial<TelegramChannelConfig> = {}): TelegramChannelConfig {
  return {
    channelId: "telegram-main",
    botToken: "token",
    allowedUserIds: [],
    ackText: "收到，正在处理。",
    busyText: "busy",
    pendingText: "pending",
    errorText: "error",
    dedupCacheSize: 32,
    pollTimeoutSeconds: 1,
    textChunkLimit: 3900,
    ...overrides
  };
}

function telegramUpdate(args: {
  updateId: number;
  messageId: number;
  chatId: number;
  chatType: string;
  userId: number;
  text: string;
}): TelegramUpdate {
  return {
    update_id: args.updateId,
    message: {
      message_id: args.messageId,
      from: { id: args.userId },
      chat: { id: args.chatId, type: args.chatType },
      date: 1783400000,
      text: args.text
    }
  };
}

class MockTelegramTransport implements TelegramTransport {
  readonly sent: Array<{ chatId: string; text: string; threadId?: string | null }> = [];

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async sendText(chatId: string, text: string, options: { threadId?: string | null } = {}): Promise<TelegramSendResult> {
    this.sent.push({ chatId, text, threadId: options.threadId });
    return {
      ok: true,
      messageId: `telegram_sent_${this.sent.length}`,
      summary: "sent"
    };
  }
}

class StubRunner implements TaskRunner {
  readonly tasks: string[] = [];

  async runTask(task: string): Promise<RunResult> {
    this.tasks.push(task);
    return {
      trigger_id: "trigger_telegram",
      opportunity_id: "opp_telegram",
      session_id: "session_telegram",
      turn_id: "turn_telegram",
      context_ref: "memory/episodes/telegram-context.md",
      context_manifest_ref: null,
      model_response_ref: "memory/episodes/telegram-model.json",
      envelope_ref: "memory/episodes/telegram-envelope.json",
      evidence_refs: [],
      sop_ref: null,
      audit_ref: null,
      skill_ref: null,
      recalled_skill_refs: [],
      final_response_ref: null,
      completion_report_ref: null,
      discipline_refs: null,
      verdict: "telegram done"
    };
  }
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-telegram-adapter-${process.pid}-${Date.now()}-${Math.random()}`);
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
