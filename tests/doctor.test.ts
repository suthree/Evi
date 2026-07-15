import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runDoctor } from "../packages/runtime/src/doctor.js";

const TEST_ENV = "AGENT_DOCTOR_TEST_API_KEY";
const TEST_FEISHU_APP_ID_ENV = "AGENT_DOCTOR_TEST_FEISHU_APP_ID";
const TEST_FEISHU_APP_SECRET_ENV = "AGENT_DOCTOR_TEST_FEISHU_APP_SECRET";
const TEST_TELEGRAM_TOKEN_ENV = "AGENT_DOCTOR_TEST_TELEGRAM_BOT_TOKEN";
const TEST_DISCORD_TOKEN_ENV = "AGENT_DOCTOR_TEST_DISCORD_BOT_TOKEN";

test("doctor passes with readable config, auth, state parent, vault, and skills", async () => {
  const fixture = await createDoctorFixture();
  const previous = process.env[TEST_ENV];
  const previousFeishuAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousFeishuSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  process.env[TEST_ENV] = "test-key";
  process.env[TEST_FEISHU_APP_ID_ENV] = "cli_test_app_id";
  process.env[TEST_FEISHU_APP_SECRET_ENV] = "cli_test_app_secret";
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(report.ok, true);
    assert.equal(check(report, "config")?.level, "ok");
    assert.equal(check(report, "auth")?.level, "ok");
    assert.equal(check(report, "state_root")?.level, "warn");
    assert.equal(check(report, "memory_index")?.level, "ok");
    assert.equal(check(report, "skills_validate")?.level, "ok");
    assert.equal(check(report, "tool_contracts")?.level, "ok");
    assert.equal(check(report, "im")?.level, "ok");
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousFeishuAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousFeishuSecret);
    await fixture.cleanup();
  }
});

test("doctor accepts nested missing state root when nearest parent is writable", async () => {
  const fixture = await createDoctorFixture();
  const previous = process.env[TEST_ENV];
  process.env[TEST_ENV] = "test-key";
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: join(fixture.repoRoot, ".runtime/state"),
      requireAuth: false,
      requireIm: false
    });

    assert.equal(report.ok, true);
    assert.equal(check(report, "state_root")?.level, "warn");
    assert.equal(
      (check(report, "state_root")?.details as Record<string, unknown>).nearest_existing_parent,
      fixture.repoRoot
    );
  } finally {
    restoreEnv(TEST_ENV, previous);
    await fixture.cleanup();
  }
});

test("doctor reports missing active model auth as an error", async () => {
  const fixture = await createDoctorFixture();
  const previous = process.env[TEST_ENV];
  const previousFeishuAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousFeishuSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  delete process.env[TEST_ENV];
  process.env[TEST_FEISHU_APP_ID_ENV] = "cli_test_app_id";
  process.env[TEST_FEISHU_APP_SECRET_ENV] = "cli_test_app_secret";
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(report.ok, false);
    assert.equal(check(report, "config")?.level, "ok");
    assert.equal(check(report, "auth")?.level, "error");
    assert.equal(check(report, "memory_index")?.level, "ok");
    assert.equal(check(report, "im")?.level, "ok");
    assert.match(check(report, "auth")?.summary ?? "", new RegExp(TEST_ENV));
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousFeishuAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousFeishuSecret);
    await fixture.cleanup();
  }
});

test("doctor accepts missing user vault when its parent is writable", async () => {
  const fixture = await createDoctorFixture({
    userVault: true
  });
  const previous = process.env[TEST_ENV];
  const previousFeishuAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousFeishuSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  process.env[TEST_ENV] = "test-key";
  process.env[TEST_FEISHU_APP_ID_ENV] = "cli_test_app_id";
  process.env[TEST_FEISHU_APP_SECRET_ENV] = "cli_test_app_secret";
  try {
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(report.ok, true);
    assert.equal(check(report, "vault")?.level, "warn");
    assert.match(check(report, "vault")?.summary ?? "", /does not exist yet/);
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousFeishuAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousFeishuSecret);
    await fixture.cleanup();
  }
});

test("doctor checks IM by default and reports missing Feishu app auth", async () => {
  const fixture = await createDoctorFixture();
  const previous = process.env[TEST_ENV];
  const previousFeishuAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousFeishuSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  process.env[TEST_ENV] = "test-key";
  delete process.env[TEST_FEISHU_APP_ID_ENV];
  delete process.env[TEST_FEISHU_APP_SECRET_ENV];
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(report.ok, false);
    assert.equal(check(report, "auth")?.level, "ok");
    assert.equal(check(report, "im")?.level, "error");
    assert.match(check(report, "im")?.summary ?? "", new RegExp(TEST_FEISHU_APP_ID_ENV));
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousFeishuAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousFeishuSecret);
    await fixture.cleanup();
  }
});

test("doctor rejects an IM scenario whose model is absent from configured model layers", async () => {
  const fixture = await createDoctorFixture({ scenarioModelId: "missing-scenario-model" });
  const previous = process.env[TEST_ENV];
  const previousFeishuAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousFeishuSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  process.env[TEST_ENV] = "test-key";
  process.env[TEST_FEISHU_APP_ID_ENV] = "cli_test_app_id";
  process.env[TEST_FEISHU_APP_SECRET_ENV] = "cli_test_app_secret";
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(report.ok, false);
    assert.equal(check(report, "config")?.level, "ok");
    assert.equal(check(report, "im")?.level, "error");
    assert.match(check(report, "im")?.summary ?? "", /missing-scenario-model/);
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousFeishuAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousFeishuSecret);
    await fixture.cleanup();
  }
});

test("doctor resolves Discord IM provider with API-key channel auth", async () => {
  const fixture = await createDoctorFixture({ imProvider: "discord" });
  const previous = process.env[TEST_ENV];
  const previousDiscordToken = process.env[TEST_DISCORD_TOKEN_ENV];
  process.env[TEST_ENV] = "test-key";
  process.env[TEST_DISCORD_TOKEN_ENV] = "discord-test-token";
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      provider: "discord"
    });

    assert.equal(report.ok, true);
    assert.equal(check(report, "im")?.level, "ok");
    assert.equal(check(report, "im")?.summary, "IM scenario and discord auth resolved.");
    const details = check(report, "im")?.details as Record<string, unknown>;
    assert.equal(details.provider, "discord");
    assert.equal(details.channel_id, "discord-test");
    assert.equal(details.allowed_user_ids_count, 1);
    assert.equal(details.allowed_guild_ids_count, 1);
    assert.equal((details.active_channel_auth as Record<string, unknown>).auth_id, "discord-test");
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_DISCORD_TOKEN_ENV, previousDiscordToken);
    await fixture.cleanup();
  }
});

test("doctor resolves Telegram IM provider with API-key channel auth", async () => {
  const fixture = await createDoctorFixture({ imProvider: "telegram" });
  const previous = process.env[TEST_ENV];
  const previousTelegramToken = process.env[TEST_TELEGRAM_TOKEN_ENV];
  process.env[TEST_ENV] = "test-key";
  process.env[TEST_TELEGRAM_TOKEN_ENV] = "telegram-test-token";
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      provider: "telegram"
    });

    assert.equal(report.ok, true);
    assert.equal(check(report, "im")?.level, "ok");
    assert.equal(check(report, "im")?.summary, "IM scenario and telegram auth resolved.");
    const details = check(report, "im")?.details as Record<string, unknown>;
    assert.equal(details.provider, "telegram");
    assert.equal(details.channel_id, "telegram-test");
    assert.equal(details.allowed_user_ids_count, 1);
    assert.equal((details.active_channel_auth as Record<string, unknown>).auth_id, "telegram-test");
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_TELEGRAM_TOKEN_ENV, previousTelegramToken);
    await fixture.cleanup();
  }
});

test("doctor IM auth diagnostics follow the requested provider instead of stale active channel", async () => {
  const fixture = await createMultiProviderDoctorFixture();
  const previous = process.env[TEST_ENV];
  const previousFeishuAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousFeishuSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  const previousTelegramToken = process.env[TEST_TELEGRAM_TOKEN_ENV];
  process.env[TEST_ENV] = "test-key";
  process.env[TEST_FEISHU_APP_ID_ENV] = "cli_test_app_id";
  process.env[TEST_FEISHU_APP_SECRET_ENV] = "cli_test_app_secret";
  process.env[TEST_TELEGRAM_TOKEN_ENV] = "telegram-test-token";
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      provider: "telegram"
    });

    assert.equal(report.ok, true);
    const details = check(report, "im")?.details as Record<string, unknown>;
    assert.equal(details.provider, "telegram");
    assert.equal(details.channel_id, "telegram-test");
    assert.equal((details.active_channel_auth as Record<string, unknown>).auth_id, "telegram-test");
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousFeishuAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousFeishuSecret);
    restoreEnv(TEST_TELEGRAM_TOKEN_ENV, previousTelegramToken);
    await fixture.cleanup();
  }
});

test("doctor --no-im skips IM baseline checks explicitly", async () => {
  const fixture = await createDoctorFixture({ im: false });
  const previous = process.env[TEST_ENV];
  delete process.env[TEST_ENV];
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot,
      requireAuth: false,
      requireIm: false
    });

    assert.equal(report.ok, true);
    assert.equal(check(report, "auth")?.level, "warn");
    assert.equal(check(report, "im")?.level, "warn");
    assert.match(check(report, "im")?.summary ?? "", /--no-im/);
  } finally {
    restoreEnv(TEST_ENV, previous);
    await fixture.cleanup();
  }
});

test("doctor resolves local home config without process env secrets", async () => {
  const fixture = await createDoctorFixture({ localHomeConfig: true });
  const previous = process.env[TEST_ENV];
  const previousFeishuAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousFeishuSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  delete process.env[TEST_ENV];
  delete process.env[TEST_FEISHU_APP_ID_ENV];
  delete process.env[TEST_FEISHU_APP_SECRET_ENV];
  try {
    const report = await runDoctor({
      repoRoot: fixture.repoRoot,
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(report.ok, true);
    assert.equal(check(report, "auth")?.level, "ok");
    assert.equal(check(report, "im")?.level, "ok");
    assert.equal((check(report, "config")?.details as Record<string, unknown>).active_model, "local-model");
  } finally {
    restoreEnv(TEST_ENV, previous);
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousFeishuAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousFeishuSecret);
    await fixture.cleanup();
  }
});

async function createDoctorFixture(options: {
  vaultRecord?: Record<string, unknown>;
  userVault?: boolean;
  im?: boolean;
  imProvider?: "feishu" | "telegram" | "discord";
  localHomeConfig?: boolean;
  scenarioModelId?: string;
} = {}): Promise<{
  repoRoot: string;
  configDir: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const includeIm = options.im !== false;
  const imProvider = options.imProvider ?? "feishu";
  const channelId = imProvider === "discord"
    ? "discord-test"
    : imProvider === "telegram"
      ? "telegram-test"
      : "feishu-test";
  const vaultRecord = options.vaultRecord ?? (options.userVault
    ? {
      type: "vault",
      mode: "user",
      active_root: join(root, "agent-home/vault"),
      seed_roots: ["vault", "skills"],
      project_roots: []
    }
    : { type: "vault", root: "vault" });
  await mkdir(join(repoRoot, "vault/skills/example-skill"), { recursive: true });
  await mkdir(join(repoRoot, "vault/registry"), { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, "config.jsonl"), [
    JSON.stringify({ type: "home", root: homeRoot }),
    JSON.stringify({ type: "state", root: stateRoot }),
    JSON.stringify(vaultRecord),
    JSON.stringify({ type: "runtime", promotion_enabled: true, structured_output: true }),
    JSON.stringify({ type: "active_model", model_id: "test-model" }),
    ...(includeIm
      ? [
        JSON.stringify({ type: "active_channel", channel_id: channelId }),
        JSON.stringify({ type: "active_scenario", scenario_id: "im-default" })
      ]
      : [])
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
    type: "model",
    id: "test-model",
    provider: "openai-compatible",
    api: "responses",
    base_url: "https://example.com/v1",
    model: "test",
    auth_id: "test-auth"
  })}\n`, "utf8");
  await writeFile(join(configDir, "auth.jsonl"), [
    JSON.stringify({
      type: "api_key",
      id: "test-auth",
      env: TEST_ENV
    }),
    ...(includeIm
      ? [
        JSON.stringify(imAuthFixture(imProvider))
      ]
      : [])
  ].join("\n") + "\n", "utf8");
  if (includeIm) {
    await writeFile(join(configDir, "settings.jsonl"), [
      JSON.stringify(imChannelFixture(imProvider)),
      JSON.stringify({
        type: "scenario",
        id: "im-default",
        channel_id: channelId,
        model_id: options.scenarioModelId ?? "test-model",
        discipline: "query_todo",
        reply_policy: "final_response",
        concurrency: "per_sender"
      })
    ].join("\n") + "\n", "utf8");
  }
  if (options.localHomeConfig) {
    const homeConfigDir = join(homeRoot, "config");
    await mkdir(homeConfigDir, { recursive: true });
    await writeFile(join(homeConfigDir, "config.jsonl"), [
      JSON.stringify({ type: "active_model", model_id: "local-model" }),
      JSON.stringify({ type: "active_channel", channel_id: "feishu-local" }),
      JSON.stringify({ type: "active_scenario", scenario_id: "im-local" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(homeConfigDir, "models.jsonl"), `${JSON.stringify({
      type: "model",
      id: "local-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://local.example.com/v1",
      model: "local-test",
      auth_id: "local-auth"
    })}\n`, "utf8");
    await writeFile(join(homeConfigDir, "auth.jsonl"), [
      JSON.stringify({
        type: "api_key",
        id: "local-auth",
        key: "local-test-key"
      }),
      JSON.stringify({
        type: "app_secret",
        id: "feishu-local",
        app_id: "local-feishu-app",
        app_secret: "local-feishu-secret"
      })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(homeConfigDir, "settings.jsonl"), [
      JSON.stringify({
        type: "channel",
        id: "feishu-local",
        kind: "feishu",
        transport: "websocket",
        auth_id: "feishu-local",
        domain: "feishu",
        mode: "private_chat",
        allowed_open_ids: []
      }),
      JSON.stringify({
        type: "scenario",
        id: "im-local",
        channel_id: "feishu-local",
        model_id: "local-model",
        discipline: "query_todo",
        reply_policy: "final_response",
        concurrency: "per_sender"
      })
    ].join("\n") + "\n", "utf8");
  }
  await writeFile(join(repoRoot, "vault/skills/example-skill/SKILL.md"), [
    "---",
    "name: example-skill",
    "description: Use this fixture skill for doctor tests.",
    "---",
    "",
    "Read-only fixture skill."
  ].join("\n"), "utf8");

  return {
    repoRoot,
    configDir,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function createMultiProviderDoctorFixture(): Promise<{
  repoRoot: string;
  configDir: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  await mkdir(join(repoRoot, "vault/skills/example-skill"), { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, "config.jsonl"), [
    JSON.stringify({ type: "home", root: homeRoot }),
    JSON.stringify({ type: "state", root: stateRoot }),
    JSON.stringify({ type: "vault", root: "vault" }),
    JSON.stringify({ type: "runtime", promotion_enabled: true, structured_output: true }),
    JSON.stringify({ type: "active_model", model_id: "test-model" }),
    JSON.stringify({ type: "active_channel", channel_id: "feishu-test" }),
    JSON.stringify({ type: "active_scenario", scenario_id: "im-feishu" })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
    type: "model",
    id: "test-model",
    provider: "openai-compatible",
    api: "responses",
    base_url: "https://example.com/v1",
    model: "test",
    auth_id: "test-auth"
  })}\n`, "utf8");
  await writeFile(join(configDir, "auth.jsonl"), [
    JSON.stringify({
      type: "api_key",
      id: "test-auth",
      env: TEST_ENV
    }),
    JSON.stringify(imAuthFixture("feishu")),
    JSON.stringify(imAuthFixture("telegram"))
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "settings.jsonl"), [
    JSON.stringify(imChannelFixture("feishu")),
    JSON.stringify({
      type: "scenario",
      id: "im-feishu",
      channel_id: "feishu-test",
      model_id: "test-model",
      discipline: "query_todo",
      reply_policy: "final_response",
      concurrency: "per_sender"
    }),
    JSON.stringify(imChannelFixture("telegram")),
    JSON.stringify({
      type: "scenario",
      id: "im-telegram",
      channel_id: "telegram-test",
      model_id: "test-model",
      discipline: "query_todo",
      reply_policy: "final_response",
      concurrency: "per_sender"
    })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(repoRoot, "vault/skills/example-skill/SKILL.md"), [
    "---",
    "name: example-skill",
    "description: Use this fixture skill for doctor tests.",
    "---",
    "",
    "Read-only fixture skill."
  ].join("\n"), "utf8");

  return {
    repoRoot,
    configDir,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function imAuthFixture(provider: "feishu" | "telegram" | "discord"): Record<string, unknown> {
  if (provider === "discord") {
    return {
      type: "api_key",
      id: "discord-test",
      env: TEST_DISCORD_TOKEN_ENV
    };
  }
  if (provider === "telegram") {
    return {
      type: "api_key",
      id: "telegram-test",
      env: TEST_TELEGRAM_TOKEN_ENV
    };
  }
  return {
    type: "app_secret",
    id: "feishu-test",
    app_id_env: TEST_FEISHU_APP_ID_ENV,
    app_secret_env: TEST_FEISHU_APP_SECRET_ENV
  };
}

function imChannelFixture(provider: "feishu" | "telegram" | "discord"): Record<string, unknown> {
  if (provider === "discord") {
    return {
      type: "channel",
      id: "discord-test",
      kind: "discord",
      transport: "gateway",
      auth_id: "discord-test",
      mode: "bot",
      bot_user_id: "bot-test",
      allowed_user_ids: ["42"],
      allowed_guild_ids: ["guild-test"]
    };
  }
  if (provider === "telegram") {
    return {
      type: "channel",
      id: "telegram-test",
      kind: "telegram",
      transport: "long_poll",
      auth_id: "telegram-test",
      mode: "bot",
      allowed_user_ids: ["42"]
    };
  }
  return {
    type: "channel",
    id: "feishu-test",
    kind: "feishu",
    transport: "websocket",
    auth_id: "feishu-test",
    domain: "feishu",
    mode: "private_chat",
    allowed_open_ids: ["ou_allowed"]
  };
}

async function mkdirTemp(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "agent-doctor-"));
}

function check(report: Awaited<ReturnType<typeof runDoctor>>, name: string) {
  return report.checks.find((item) => item.name === name);
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
