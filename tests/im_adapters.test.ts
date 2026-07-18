import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AgentStore } from "../packages/core/src/store.js";
import { AgentStore as Store } from "../packages/core/src/store.js";
import type { RunResult } from "../packages/core/src/schemas.js";
import type { FeishuSendResult, FeishuTransport, TaskRunner } from "../packages/runtime/src/channels/feishu/types.js";
import type { TelegramSendResult, TelegramTransport } from "../packages/runtime/src/channels/telegram/types.js";
import type { DiscordSendResult, DiscordTransport } from "../packages/runtime/src/channels/discord/types.js";
import {
  assertRuntimeImAdapterSupported,
  createRuntimeImAdapter
} from "../packages/runtime/src/im_adapters.js";
import type { DiscordImScenarioConfig, FeishuImScenarioConfig, TelegramImScenarioConfig } from "../packages/runtime/src/im_config.js";
import type { GoalIngressPort } from "../packages/runtime/src/goal_ingress.js";
import type { GoalView } from "../packages/runtime/src/goal_runtime.js";

test("runtime IM adapter seam creates Feishu adapters from provider-neutral scenarios", async () => {
  const fixture = await createFixture();
  try {
    const adapter = createRuntimeImAdapter({
      scenario: feishuScenario(),
      store: fixture.store,
      legacyPrivateRunner: new StubRunner(),
      goalIngress: stubGoalIngress(),
      feishuTransportFactory: () => new FakeFeishuTransport()
    });

    assert.equal(adapter.kind, "feishu");
    assert.equal(adapter.channelId, "feishu-main");
    assert.equal(adapter.health().state, "stopped");
  } finally {
    await fixture.cleanup();
  }
});

test("runtime IM adapter seam creates Telegram adapters from provider-neutral scenarios", async () => {
  const fixture = await createFixture();
  try {
    const adapter = createRuntimeImAdapter({
      scenario: telegramScenario(),
      store: fixture.store,
      goalIngress: stubGoalIngress(),
      telegramTransportFactory: () => new FakeTelegramTransport()
    });

    assert.equal(adapter.kind, "telegram");
    assert.equal(adapter.channelId, "telegram-main");
    assert.equal(adapter.health().state, "stopped");
  } finally {
    await fixture.cleanup();
  }
});

test("runtime IM adapter seam creates Discord adapters from provider-neutral scenarios", async () => {
  const fixture = await createFixture();
  try {
    const adapter = createRuntimeImAdapter({
      scenario: discordScenario(),
      store: fixture.store,
      goalIngress: stubGoalIngress(),
      discordTransportFactory: () => new FakeDiscordTransport()
    });

    assert.equal(adapter.kind, "discord");
    assert.equal(adapter.channelId, "discord-main");
    assert.equal(adapter.health().state, "stopped");
  } finally {
    await fixture.cleanup();
  }
});

function stubGoalIngress(): GoalIngressPort {
  return { submit: async () => ({ goal_id: "goal_adapter", status: "active", receipt: null } as GoalView) };
}

function feishuScenario(): FeishuImScenarioConfig {
  return {
    id: "im-default",
    provider: "feishu",
    channelId: "feishu-main",
    legacyPrivateModelId: "test-model",
    legacyPrivateDiscipline: "query_todo",
    legacyPrivateReplyPolicy: "final_response",
    legacyPrivateConcurrency: "per_sender",
    channelDescriptor: {
      id: "feishu-main",
      kind: "feishu",
      transport: "websocket",
      mode: "private_chat"
    },
    channel: {
      channelId: "feishu-main",
      appId: "app",
      appSecret: "secret",
      domain: "feishu",
      allowedOpenIds: [],
      ackText: "ack",
      busyText: "busy",
      queuedText: "queued",
      followupQueueSize: 8,
      unsupportedText: "unsupported",
      errorText: "error",
      dedupCacheSize: 32,
      textChunkLimit: 3900
    }
  };
}

function telegramScenario(): TelegramImScenarioConfig {
  return {
    id: "im-telegram",
    provider: "telegram",
    channelId: "telegram-main",
    channelDescriptor: {
      id: "telegram-main",
      kind: "telegram",
      transport: "long_poll",
      mode: "bot"
    },
    channel: {
      channelId: "telegram-main",
      botToken: "token",
      allowedUserIds: [],
      ackText: "ack",
      busyText: "busy",
      pendingText: "pending",
      errorText: "error",
      dedupCacheSize: 32,
      pollTimeoutSeconds: 1,
      textChunkLimit: 3900
    }
  };
}

function discordScenario(): DiscordImScenarioConfig {
  return {
    id: "im-discord",
    provider: "discord",
    channelId: "discord-main",
    channelDescriptor: {
      id: "discord-main",
      kind: "discord",
      transport: "gateway",
      mode: "bot"
    },
    channel: {
      channelId: "discord-main",
      botToken: "token",
      allowedUserIds: [],
      allowedGuildIds: [],
      gatewayUrl: "wss://gateway.discord.gg/?v=10&encoding=json",
      apiBaseUrl: "https://discord.com/api/v10",
      intents: 37376,
      ackText: "ack",
      busyText: "busy",
      pendingText: "pending",
      errorText: "error",
      dedupCacheSize: 32,
      textChunkLimit: 1900
    }
  };
}

class FakeFeishuTransport implements FeishuTransport {
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async sendText(): Promise<FeishuSendResult> {
    return { ok: true, messageId: "sent_1", summary: "sent" };
  }
  async sendTextToChat(): Promise<FeishuSendResult> {
    return { ok: true, messageId: "chat_sent_1", summary: "sent" };
  }
}

class FakeTelegramTransport implements TelegramTransport {
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async sendText(): Promise<TelegramSendResult> {
    return { ok: true, messageId: "sent_1", summary: "sent" };
  }
}

class FakeDiscordTransport implements DiscordTransport {
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async sendText(): Promise<DiscordSendResult> {
    return { ok: true, messageId: "sent_1", summary: "sent" };
  }
}

class StubRunner implements TaskRunner {
  async runTask(): Promise<RunResult> {
    return {
      trigger_id: "trigger_im_adapter",
      opportunity_id: "opp_im_adapter",
      session_id: "session_im_adapter",
      turn_id: "turn_im_adapter",
      context_ref: "memory/episodes/im-adapter-context.md",
      context_manifest_ref: null,
      model_response_ref: "memory/episodes/im-adapter-model.json",
      envelope_ref: "memory/episodes/im-adapter-envelope.json",
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
      verdict: "ok"
    };
  }
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-im-adapters-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    store: new Store(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
