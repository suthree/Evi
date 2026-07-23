import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertRuntimeImAdapterSupported } from "../packages/runtime/src/im_adapters.js";
import { loadImScenarioConfig } from "../packages/runtime/src/im_config.js";
import { loadTelegramChannelConfig } from "../packages/runtime/src/channels/telegram/config.js";

test("IM scenario config resolves implemented Feishu provider through the provider-neutral loader", async () => {
  const fixture = await createFixture({
    channel: {
      type: "channel",
      id: "feishu-main",
      kind: "feishu",
      transport: "websocket",
      auth_id: "feishu-main",
      domain: "feishu",
      mode: "private_chat"
    },
    scenario: {
      type: "scenario",
      id: "im-default",
      channel_id: "feishu-main",
      model_id: "test-model",
      discipline: "query_todo"
    },
    auth: {
      type: "app_secret",
      id: "feishu-main",
      app_id: "cli_app",
      app_secret: "cli_secret"
    }
  });
  try {
    const scenario = await loadImScenarioConfig({
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      provider: "feishu"
    });

    assert.equal(scenario.provider, "feishu");
    assert.equal(scenario.channelId, "feishu-main");
    assert.equal("legacyPrivateModelId" in scenario, false);
    assertRuntimeImAdapterSupported(scenario);
    assert.equal(scenario.channel.appId, "cli_app");
  } finally {
    await fixture.cleanup();
  }
});

test("IM scenario config resolves Telegram provider through the provider-neutral loader", async () => {
  const fixture = await createFixture({
    channel: {
      type: "channel",
      id: "telegram-main",
      kind: "telegram",
      transport: "long_poll",
      mode: "bot",
      auth_id: "telegram-main",
      allowed_user_ids: [123]
    },
    scenario: {
      type: "scenario",
      id: "im-telegram",
      channel_id: "telegram-main",
      model_id: "test-model",
      discipline: "query_todo"
    },
    auth: {
      type: "api_key",
      id: "telegram-main",
      key: "telegram_token"
    }
  });
  try {
    const scenario = await loadImScenarioConfig({
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      provider: "telegram"
    });

    assert.equal(scenario.provider, "telegram");
    assert.equal(scenario.channelDescriptor.transport, "long_poll");
    assert.equal("modelId" in scenario, false);
    assert.equal("legacyPrivateModelId" in scenario, false);
    assertRuntimeImAdapterSupported(scenario);
    assert.equal(scenario.channel.botToken, "telegram_token");
    assert.deepEqual(scenario.channel.allowedUserIds, ["123"]);
  } finally {
    await fixture.cleanup();
  }
});

test("IM scenario config lets explicit provider override stale active selectors", async () => {
  const fixture = await createMultiProviderFixture();
  try {
    const scenario = await loadImScenarioConfig({
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      provider: "telegram"
    });

    assert.equal(scenario.provider, "telegram");
    assert.equal(scenario.id, "im-telegram");
    assert.equal(scenario.channelId, "telegram-main");
    assert.equal(scenario.channel.botToken, "telegram_token");
  } finally {
    await fixture.cleanup();
  }
});

test("Goal-backed Telegram scenario does not require an active or scenario execution model", async () => {
  const fixture = await createFixture({
    channel: {
      type: "channel", id: "telegram-main", kind: "telegram", transport: "long_poll",
      mode: "bot", auth_id: "telegram-main"
    },
    scenario: {
      type: "scenario", id: "im-telegram", channel_id: "telegram-main",
      model_id: "unused-missing-model"
    },
    auth: { type: "api_key", id: "telegram-main", key: "telegram_token" }
  });
  try {
    await writeFile(join(fixture.configDir, "config.jsonl"), [
      JSON.stringify({ type: "state", root: fixture.stateRoot }),
      JSON.stringify({ type: "active_channel", channel_id: "telegram-main" }),
      JSON.stringify({ type: "active_scenario", scenario_id: "im-telegram" })
    ].join("\n") + "\n", "utf8");

    const scenario = await loadImScenarioConfig({
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      provider: "telegram"
    });

    assert.equal(scenario.provider, "telegram");
    assert.equal(scenario.channel.botToken, "telegram_token");
    assert.equal("modelId" in scenario, false);
  } finally {
    await fixture.cleanup();
  }
});

test("IM scenario config rejects explicit scenario/channel mismatches", async () => {
  const fixture = await createMultiProviderFixture();
  try {
    await assert.rejects(
      loadImScenarioConfig({
        configDir: fixture.configDir,
        stateRoot: fixture.stateRoot,
        scenarioId: "im-feishu",
        channelId: "telegram-main",
        provider: "telegram"
      }),
      /scenario im-feishu points to channel feishu-main, not selected channel telegram-main/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("provider-specific channel loaders ignore stale active channels from other providers", async () => {
  const fixture = await createMultiProviderFixture();
  try {
    const channel = await loadTelegramChannelConfig({
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(channel.channelId, "telegram-main");
    assert.equal(channel.botToken, "telegram_token");
  } finally {
    await fixture.cleanup();
  }
});

test("IM scenario config resolves Discord provider through the provider-neutral loader", async () => {
  const fixture = await createFixture({
    channel: {
      type: "channel",
      id: "discord-main",
      kind: "discord",
      transport: "gateway",
      mode: "bot",
      auth_id: "discord-main",
      allowed_user_ids: ["42"],
      allowed_guild_ids: ["guild-1"]
    },
    scenario: {
      type: "scenario",
      id: "im-discord",
      channel_id: "discord-main",
      model_id: "test-model",
      discipline: "query_todo"
    },
    auth: {
      type: "api_key",
      id: "discord-main",
      key: "discord_token"
    }
  });
  try {
    const scenario = await loadImScenarioConfig({
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      provider: "discord"
    });

    assert.equal(scenario.provider, "discord");
    assert.equal(scenario.channelDescriptor.transport, "gateway");
    assert.equal("modelId" in scenario, false);
    assert.equal("legacyPrivateModelId" in scenario, false);
    assertRuntimeImAdapterSupported(scenario);
    assert.equal(scenario.channel.botToken, "discord_token");
    assert.deepEqual(scenario.channel.allowedUserIds, ["42"]);
    assert.deepEqual(scenario.channel.allowedGuildIds, ["guild-1"]);
  } finally {
    await fixture.cleanup();
  }
});

test("IM scenario config rejects provider/channel mismatches", async () => {
  const fixture = await createFixture({
    channel: {
      type: "channel",
      id: "feishu-main",
      kind: "feishu",
      transport: "websocket",
      auth_id: "feishu-main"
    },
    scenario: {
      type: "scenario",
      id: "im-default",
      channel_id: "feishu-main",
      model_id: "test-model"
    },
    auth: {
      type: "app_secret",
      id: "feishu-main",
      app_id: "cli_app",
      app_secret: "cli_secret"
    }
  });
  try {
    await assert.rejects(
      loadImScenarioConfig({
        configDir: fixture.configDir,
        stateRoot: fixture.stateRoot,
        provider: "telegram",
        channelId: "feishu-main"
      }),
      /not requested provider telegram/
    );
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(args: {
  channel: Record<string, unknown>;
  scenario: Record<string, unknown>;
  auth?: Record<string, unknown>;
}): Promise<{
  configDir: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-im-config-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await writeFile(join(configDir, "config.jsonl"), [
    JSON.stringify({ type: "state", root: stateRoot }),
    JSON.stringify({ type: "active_model", model_id: "fallback-model" }),
    JSON.stringify({ type: "active_channel", channel_id: args.channel.id }),
    JSON.stringify({ type: "active_scenario", scenario_id: args.scenario.id })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "settings.jsonl"), [
    JSON.stringify(args.channel),
    JSON.stringify(args.scenario)
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "auth.jsonl"), args.auth ? `${JSON.stringify(args.auth)}\n` : "", "utf8");
  return {
    configDir,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function createMultiProviderFixture(): Promise<{
  configDir: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-im-config-multi-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await writeFile(join(configDir, "config.jsonl"), [
    JSON.stringify({ type: "state", root: stateRoot }),
    JSON.stringify({ type: "active_model", model_id: "fallback-model" }),
    JSON.stringify({ type: "active_channel", channel_id: "feishu-main" }),
    JSON.stringify({ type: "active_scenario", scenario_id: "im-feishu" })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "settings.jsonl"), [
    JSON.stringify({
      type: "channel",
      id: "feishu-main",
      kind: "feishu",
      transport: "websocket",
      auth_id: "feishu-main"
    }),
    JSON.stringify({
      type: "scenario",
      id: "im-feishu",
      channel_id: "feishu-main",
      model_id: "test-model"
    }),
    JSON.stringify({
      type: "channel",
      id: "telegram-main",
      kind: "telegram",
      transport: "long_poll",
      mode: "bot",
      auth_id: "telegram-main"
    }),
    JSON.stringify({
      type: "scenario",
      id: "im-telegram",
      channel_id: "telegram-main",
      model_id: "test-model",
      discipline: "query_todo"
    })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "auth.jsonl"), [
    JSON.stringify({ type: "app_secret", id: "feishu-main", app_id: "cli_app", app_secret: "cli_secret" }),
    JSON.stringify({ type: "api_key", id: "telegram-main", key: "telegram_token" })
  ].join("\n") + "\n", "utf8");
  return {
    configDir,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
