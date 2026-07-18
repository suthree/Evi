import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listRuntimeChannelOutbox, recordRuntimeChannelOutbound } from "../packages/core/src/runtime_channel_outbox.js";
import { listRuntimeTaskQueue } from "../packages/core/src/runtime_task_queue.js";
import { listRuntimeInbox, listRuntimeSessions, listRuntimeTaskRuns } from "../packages/core/src/runtime_sessions.js";
import { AgentStore } from "../packages/core/src/store.js";
import { TelegramBotAdapter } from "../packages/runtime/src/channels/telegram/adapter.js";
import type { GoalIngressPort } from "../packages/runtime/src/goal_ingress.js";
import type { GoalView } from "../packages/runtime/src/goal_runtime.js";
import type {
  TelegramChannelConfig,
  TelegramSendResult,
  TelegramTransport,
  TelegramUpdate
} from "../packages/runtime/src/channels/telegram/types.js";

test("Telegram group session bind and run use the provider-neutral runtime path", async () => {
  const fixture = await createFixture();
  try {
    const goalIngress = stubGoalIngress("goal_telegram");
    const transport = new MockTelegramTransport();
    const adapter = new TelegramBotAdapter({
      config: testTelegramConfig({ allowedUserIds: ["42"] }),
      transport,
      goalIngress,
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
    assert.equal(goalIngress.objectives.length, 1);
    assert.match(goalIngress.objectives[0]!, /Telegram runtime session message received/);
    assert.match(goalIngress.objectives[0]!, /check service status/);
    assert.deepEqual(transport.sent.map((item) => item.text), [
      `已绑定 runtime session: ${sessions[0]!.id}\nprofile: ops\n后续普通消息会进入 inbox；使用 /run 才会执行任务。`,
      "收到，正在处理。",
      "Goal: goal_telegram\nStatus: active\nRun goal continue --goal goal_telegram to continue this Goal."
    ]);

    assert.equal((await listRuntimeTaskRuns(fixture.store)).length, 0);
    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks.length, 0);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.length, 0);
    const delivery = JSON.parse(await readFile(join(fixture.stateRoot, "channels/telegram/outbound/11.json"), "utf8"));
    assert.deepEqual({
      goal_id: delivery.goal_id,
      goal_status: delivery.goal_status,
      receipt_id: delivery.receipt_id
    }, { goal_id: "goal_telegram", goal_status: "active", receipt_id: null });
  } finally {
    await fixture.cleanup();
  }
});

test("Telegram session Goal failure stays out of legacy orchestration state", async () => {
  const fixture = await createFixture();
  try {
    const transport = new MockTelegramTransport();
    const adapter = new TelegramBotAdapter({
      config: testTelegramConfig({ allowedUserIds: ["42"] }),
      transport,
      goalIngress: failingGoalIngress("goal ingress failed"),
      store: fixture.store
    });

    await adapter.handleUpdate(telegramUpdate({
      updateId: 110, messageId: 20, chatId: -100123, chatType: "supergroup", userId: 42,
      text: "/session use ops"
    }));
    await adapter.handleUpdate(telegramUpdate({
      updateId: 111, messageId: 21, chatId: -100123, chatType: "supergroup", userId: 99,
      text: "/run fail safely"
    }));

    assert.deepEqual(transport.sent.map((item) => item.text).slice(-2), ["收到，正在处理。", "error"]);
    assert.equal((await listRuntimeTaskRuns(fixture.store)).length, 0);
    assert.equal((await listRuntimeTaskQueue(fixture.store)).length, 0);
    assert.equal((await listRuntimeChannelOutbox(fixture.store)).length, 0);
    const evidence = JSON.parse(await readFile(join(fixture.stateRoot, "channels/telegram/errors/21.json"), "utf8"));
    assert.equal(evidence.error, "goal ingress failed");
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
      goalIngress: stubGoalIngress("goal_telegram_compat"),
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

function stubGoalIngress(goalId: string): GoalIngressPort & { objectives: string[] } {
  const objectives: string[] = [];
  return { objectives, submit: async (objective) => {
    objectives.push(objective);
    return { goal_id: goalId, status: "active", receipt: null } as GoalView;
  } };
}

function failingGoalIngress(message: string): GoalIngressPort {
  return { submit: async () => { throw new Error(message); } };
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
