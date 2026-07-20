import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadAppSecretAuth,
  loadConfig,
  loadConfigSelectors,
  loadGoalCognitionConfig,
  loadImageModelConfig,
  loadRuntimeAuthDiagnostics,
  loadRuntimeConfigSummary,
  updateRuntimeConfig
} from "../packages/runtime/src/config.js";

const DIRECT_AUTH_API_KEY_ENV = "AGENT_CONFIG_DIRECT_PRIORITY_API_KEY";
const DIRECT_AUTH_APP_ID_ENV = "AGENT_CONFIG_DIRECT_PRIORITY_FEISHU_APP_ID";
const DIRECT_AUTH_APP_SECRET_ENV = "AGENT_CONFIG_DIRECT_PRIORITY_FEISHU_APP_SECRET";

test("config selectors expand the shared Evi state-root declaration", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-config-shared-state-"));
  const configDir = join(root, "config");
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: join(root, "home") }),
      JSON.stringify({ type: "state", root: "~/.local-runtime/state/evi" })
    ].join("\n") + "\n", "utf8");

    const selectors = await loadConfigSelectors({ configDir });
    assert.equal(selectors.stateRoot, join(homedir(), ".local-runtime/state/evi"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime config summary reports effective non-secret config with source refs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-config-summary-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const homeConfigDir = join(homeRoot, "config");
  await mkdir(configDir, { recursive: true });
  await mkdir(homeConfigDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "vault", mode: "user", active_root: "${LOCAL_RUNTIME_HOME}/vault/evi", seed_roots: [] }),
      JSON.stringify({ type: "runtime", promotion_enabled: false, structured_output: true }),
      JSON.stringify({ type: "active_model", model_id: "local-model" }),
      JSON.stringify({ type: "active_image_model", model_id: "local-image-model" }),
      JSON.stringify({ type: "active_channel", channel_id: "feishu-main" }),
      JSON.stringify({ type: "active_scenario", scenario_id: "im-default" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(homeConfigDir, "config.jsonl"), `${JSON.stringify({
      type: "runtime",
      review_tick_enabled: true,
      review_tick_interval_ms: 60000,
      review_tick_limit: 7,
      content_daily_enabled: true,
      content_daily_interval_ms: 900000,
      content_daily_dry_run: false,
      content_daily_preflight: true,
      content_daily_topic: "daily AI apps and market hotspots",
      content_daily_source_urls: ["https://example.test/ai"],
      content_daily_tickers: ["NVDA", "MSFT"],
      content_daily_image_model: "local-image-model",
      content_daily_publish_enabled: true,
      content_daily_external_write_confirmed: false,
      content_daily_publish_adapter: "xiaohongshu-mcp",
      content_daily_publish_server_url: "http://localhost:18060/mcp",
      content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: true,
      content_creator_metrics_interval_ms: 30 * 60 * 1000,
      content_creator_metrics_limit: 4,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "local-runtime-test-creator",
      content_creator_metrics_browser_auto_connect: true,
      content_creator_metrics_browser_cdp_port: "9222"
    })}\n`, "utf8");
    await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
      type: "model",
      id: "local-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://api.example.test/v1",
      model: "gpt-test",
      auth_id: "model-secret",
      context_window_tokens: 32000
    })}\n${JSON.stringify({
      type: "image_model",
      id: "local-image-model",
      provider: "openai-compatible",
      api: "images_generations",
      base_url: "https://api.example.test/v1",
      model: "gpt-image-2",
      auth_id: "model-secret",
      size: "1024x1024",
      quality: "high"
    })}\n`, "utf8");
    await writeFile(join(configDir, "settings.jsonl"), [
      JSON.stringify({
        type: "channel",
        id: "feishu-main",
        kind: "feishu",
        transport: "websocket",
        auth_id: "feishu-secret",
        domain: "feishu",
        mode: "private_chat",
        followup_queue_size: 6
      }),
      JSON.stringify({
        type: "scenario",
        id: "im-default",
        channel_id: "feishu-main",
        model_id: "local-model",
        discipline: "query_todo",
        reply_policy: "final_response",
        concurrency: "per_sender"
      })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "auth.jsonl"), [
      JSON.stringify({ type: "api_key", id: "model-secret", key: "MODEL_SECRET_SHOULD_NOT_APPEAR" }),
      JSON.stringify({
        type: "app_secret",
        id: "feishu-secret",
        app_id: "APP_ID_SHOULD_NOT_APPEAR",
        app_secret: "APP_SECRET_SHOULD_NOT_APPEAR"
      })
    ].join("\n") + "\n", "utf8");

    const summary = await loadRuntimeConfigSummary({ configDir });
    assert.equal(summary.runtime.review_tick_enabled, true);
    assert.equal(summary.runtime.review_tick_interval_ms, 60000);
    assert.equal(summary.runtime.review_tick_limit, 7);
    assert.equal(summary.runtime.content_daily_enabled, true);
    assert.equal(summary.runtime.content_daily_interval_ms, 900000);
    assert.equal(summary.runtime.content_daily_dry_run, false);
    assert.equal(summary.runtime.content_daily_preflight, true);
    assert.equal(summary.runtime.content_daily_topic, "daily AI apps and market hotspots");
    assert.deepEqual(summary.runtime.content_daily_source_urls, ["https://example.test/ai"]);
    assert.deepEqual(summary.runtime.content_daily_tickers, ["NVDA", "MSFT"]);
    assert.equal(summary.runtime.content_daily_image_model, "local-image-model");
    assert.equal(summary.runtime.content_daily_publish_enabled, true);
    assert.equal(summary.runtime.content_daily_external_write_confirmed, false);
    assert.equal(summary.runtime.content_daily_publish_adapter, "xiaohongshu-mcp");
    assert.equal(summary.runtime.content_daily_publish_server_url, "http://localhost:18060/mcp");
    assert.equal(summary.runtime.content_daily_publish_tool, "publish_content");
    assert.equal(summary.runtime.content_feedback_refresh_enabled, false);
    assert.equal(summary.runtime.content_feedback_refresh_interval_ms, 60 * 60 * 1000);
    assert.equal(summary.runtime.content_feedback_refresh_limit, 10);
    assert.equal(summary.runtime.content_feedback_refresh_min_follow_up_age_ms, 6 * 60 * 60 * 1000);
    assert.equal(summary.runtime.content_feedback_refresh_server_url, "http://localhost:18060/mcp");
    assert.equal(summary.runtime.content_creator_metrics_enabled, true);
    assert.equal(summary.runtime.content_creator_metrics_interval_ms, 30 * 60 * 1000);
    assert.equal(summary.runtime.content_creator_metrics_limit, 4);
    assert.equal(summary.runtime.content_creator_metrics_creator_url, "https://creator.xiaohongshu.com/new/note-manager");
    assert.equal(summary.runtime.content_creator_metrics_browser_session_name, "local-runtime-test-creator");
    assert.equal(summary.runtime.content_creator_metrics_browser_auto_connect, true);
    assert.equal(summary.runtime.content_creator_metrics_browser_cdp_port, "9222");
    assert.equal(summary.runtime.source_ref, "home:config.jsonl#1");
    assert.deepEqual(summary.runtime.defaulted_fields, ["promotion_enabled", "structured_output"]);
    assert.equal(summary.runtime.promotion_enabled, false);
    assert.deepEqual(summary.goal_cognition, {
      provider: "active_model",
      source_ref: "default:goal_cognition",
      readiness: "runtime_check_required",
      timeout_ms: 120000,
      max_output_chars: 64000
    });
    assert.equal(summary.active_model.id, "local-model");
    assert.equal(summary.active_model.model, "gpt-test");
    assert.equal(summary.active_model.auth_id, "model-secret");
    assert.equal(summary.active_model.context_window_tokens, 32000);
    assert.equal(summary.active_model.max_output_tokens, 2400);
    assert.equal(summary.active_model.context_budget?.estimated_input_budget_tokens, 29600);
    assert.equal(summary.active_model.context_budget?.total_soft_limit_chars, 94720);
    assert.equal(summary.active_model.context_budget?.total_hard_limit_chars, 112480);
    assert.equal(summary.active_image_model.id, "local-image-model");
    assert.equal(summary.active_image_model.model, "gpt-image-2");
    assert.equal(summary.active_image_model.api, "images_generations");
    assert.equal(summary.active_image_model.auth_id, "model-secret");
    assert.equal(summary.active_image_model.size, "1024x1024");
    assert.equal(summary.active_image_model.quality, "high");
    assert.equal(summary.active_channel.id, "feishu-main");
    assert.equal(summary.active_channel.auth_id, "feishu-secret");
    assert.equal(summary.active_channel.followup_queue_size, 6);
    assert.equal(summary.active_scenario.discipline, "query_todo");
    assert.equal(summary.vault.active_root, join(homeRoot, "vault/evi"));
    assert.deepEqual(summary.vault.seed_roots, []);
    assert.equal(summary.refs.includes("repo:models.jsonl#1"), true);
    const serialized = JSON.stringify(summary);
    assert.doesNotMatch(serialized, /MODEL_SECRET_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(serialized, /APP_SECRET_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(serialized, /APP_ID_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("image model config resolves auth without exposing secrets in summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-image-config-"));
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "text-model" }),
      JSON.stringify({ type: "active_image_model", model_id: "image-model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), [
      JSON.stringify({
        type: "model",
        id: "text-model",
        provider: "openai-compatible",
        api: "responses",
        base_url: "https://api.example.test/v1",
        model: "gpt-test",
        auth_id: "model-auth"
      }),
      JSON.stringify({
        type: "image_model",
        id: "image-model",
        provider: "openai-compatible",
        api: "images_generations",
        base_url: "https://api.example.test/v1",
        model: "gpt-image-2",
        auth_id: "image-auth",
        size: "1536x1024",
        output_format: "png"
      })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "auth.jsonl"), [
      JSON.stringify({ type: "api_key", id: "model-auth", key: "TEXT_SECRET_SHOULD_NOT_APPEAR" }),
      JSON.stringify({ type: "api_key", id: "image-auth", key: "IMAGE_SECRET_SHOULD_NOT_APPEAR" })
    ].join("\n") + "\n", "utf8");

    const imageConfig = await loadImageModelConfig({ configDir });
    assert.equal(imageConfig.model, "gpt-image-2");
    assert.equal(imageConfig.api_key, "IMAGE_SECRET_SHOULD_NOT_APPEAR");
    assert.equal(imageConfig.size, "1536x1024");

    const summary = await loadRuntimeConfigSummary({ configDir });
    const serialized = JSON.stringify(summary);
    assert.equal(summary.active_image_model.model, "gpt-image-2");
    assert.equal(summary.active_image_model.auth_id, "image-auth");
    assert.doesNotMatch(serialized, /IMAGE_SECRET_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(serialized, /TEXT_SECRET_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repo-local ignored config overlays tracked defaults before home and state", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-local-config-overlay-"));
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "tracked-model" }),
      JSON.stringify({ type: "active_channel", channel_id: "tracked-channel" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "config.local.jsonl"), [
      JSON.stringify({ type: "active_model", model_id: "local-model" }),
      JSON.stringify({ type: "active_channel", channel_id: "local-channel" }),
      JSON.stringify({
        type: "goal_cognition",
        provider: "codex_cli",
        service_tier: "fast",
        credential_store: "keyring",
        reasoning_effort: "medium",
        timeout_ms: 45000,
        max_output_chars: 32000
      })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
      type: "model",
      id: "tracked-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://tracked.example.test/v1",
      model: "tracked",
      auth_id: "tracked-auth"
    })}\n`, "utf8");
    await writeFile(join(configDir, "models.local.jsonl"), `${JSON.stringify({
      type: "model",
      id: "local-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://local.example.test/v1",
      model: "local",
      auth_id: "local-auth"
    })}\n`, "utf8");
    await writeFile(join(configDir, "settings.jsonl"), `${JSON.stringify({
      type: "channel",
      id: "tracked-channel",
      kind: "feishu",
      transport: "websocket",
      auth_id: "tracked-feishu",
      domain: "feishu",
      mode: "private_chat"
    })}\n`, "utf8");
    await writeFile(join(configDir, "settings.local.jsonl"), `${JSON.stringify({
      type: "channel",
      id: "local-channel",
      kind: "feishu",
      transport: "websocket",
      auth_id: "local-feishu",
      domain: "feishu",
      mode: "private_chat"
    })}\n`, "utf8");
    await writeFile(join(configDir, "auth.local.jsonl"), `${JSON.stringify({
      type: "api_key",
      id: "local-auth",
      key: "LOCAL_SECRET_SHOULD_NOT_APPEAR"
    })}\n`, "utf8");

    const config = await loadConfig({ configDir });
    assert.equal(config.model.id, "local-model");
    assert.equal(config.model.api_key, "LOCAL_SECRET_SHOULD_NOT_APPEAR");

    const summary = await loadRuntimeConfigSummary({ configDir });
    const goalCognition = await loadGoalCognitionConfig({ configDir });
    assert.equal(summary.active_model.id, "local-model");
    assert.equal(summary.active_model.source_ref, "local:models.local.jsonl#1");
    assert.equal(summary.active_channel.id, "local-channel");
    assert.equal(summary.active_channel.source_ref, "local:settings.local.jsonl#1");
    assert.equal(summary.refs.includes("local:config.local.jsonl#1"), true);
    assert.deepEqual(summary.goal_cognition, {
      provider: "codex_cli",
      service_tier: "fast",
      credential_store: "keyring",
      source_ref: "local:config.local.jsonl#3",
      readiness: "runtime_check_required",
      reasoning_effort: "medium",
      timeout_ms: 45000,
      max_output_chars: 32000
    });
    assert.equal(goalCognition.provider, "codex_cli");
    assert.equal(goalCognition.service_tier, "fast");
    assert.equal(goalCognition.credential_store, "keyring");
    assert.equal(goalCognition.source_ref, "local:config.local.jsonl#3");
    assert.doesNotMatch(JSON.stringify(summary), /LOCAL_SECRET_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("goal cognition summary exposes a missing selected model without resolving auth", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-goal-cognition-gap-"));
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "missing-model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), "", "utf8");
    const summary = await loadRuntimeConfigSummary({ configDir });
    assert.equal(summary.goal_cognition.provider, "active_model");
    assert.equal(summary.goal_cognition.readiness, "missing_active_model");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("goal cognition config rejects unbounded process settings and unsupported reasoning", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-goal-cognition-bounds-"));
  const configDir = join(root, "config");
  await mkdir(configDir, { recursive: true });
  try {
    for (const invalid of [
      { timeout_ms: 600_001 },
      { max_output_chars: 1_000_001 },
      { reasoning_effort: "ultra" }
    ]) {
      await writeFile(join(configDir, "config.jsonl"), `${JSON.stringify({
        type: "goal_cognition",
        provider: "codex_cli",
        ...invalid
      })}\n`, "utf8");
      await assert.rejects(loadGoalCognitionConfig({ configDir }), /goal_cognition/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime config update appends safe content daily settings to home config", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-runtime-config-update-"));
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const homeConfigDir = join(homeRoot, "config");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "runtime", promotion_enabled: true, structured_output: true })
    ].join("\n") + "\n", "utf8");

    const result = await updateRuntimeConfig({
      configDir,
      patch: {
        review_tick_enabled: true,
        review_tick_interval_ms: 900000,
        review_tick_limit: 8,
        content_daily_enabled: true,
        content_daily_interval_ms: 1800000,
        content_daily_dry_run: true,
        content_daily_preflight: false,
        content_daily_topic: "daily frontier AI news and AI stock hotspots",
        content_daily_source_urls: ["https://example.test/ai"],
        content_daily_tickers: ["NVDA", "AMD"],
        content_daily_publish_enabled: false,
        content_daily_external_write_confirmed: false,
        content_feedback_refresh_enabled: true,
        content_feedback_refresh_interval_ms: 7200000,
        content_feedback_refresh_limit: 3,
        content_feedback_refresh_min_follow_up_age_ms: 21600000,
        content_feedback_refresh_server_url: "http://localhost:18061/mcp",
        content_creator_metrics_enabled: true,
        content_creator_metrics_interval_ms: 1800000,
        content_creator_metrics_limit: 2,
        content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
        content_creator_metrics_browser_session_name: "runtime-creator-metrics-test",
        content_creator_metrics_browser_auto_connect: true,
        content_creator_metrics_browser_cdp_port: "9222"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.config_file, join(homeConfigDir, "config.jsonl"));
    assert.equal(result.appended_ref, "home:config.jsonl#1");
    assert.deepEqual(result.changed_fields, [
      "review_tick_enabled",
      "review_tick_interval_ms",
      "review_tick_limit",
      "content_daily_enabled",
      "content_daily_interval_ms",
      "content_daily_topic",
      "content_daily_source_urls",
      "content_daily_tickers",
      "content_feedback_refresh_enabled",
      "content_feedback_refresh_interval_ms",
      "content_feedback_refresh_limit",
      "content_feedback_refresh_server_url",
      "content_creator_metrics_enabled",
      "content_creator_metrics_interval_ms",
      "content_creator_metrics_limit",
      "content_creator_metrics_browser_session_name",
      "content_creator_metrics_browser_auto_connect",
      "content_creator_metrics_browser_cdp_port"
    ]);
    assert.equal(result.after.review_tick_enabled, true);
    assert.equal(result.after.review_tick_interval_ms, 900000);
    assert.equal(result.after.review_tick_limit, 8);
    assert.equal(result.after.content_daily_enabled, true);
    assert.equal(result.after.content_daily_dry_run, true);
    assert.equal(result.after.content_daily_publish_enabled, false);
    assert.equal(result.after.content_feedback_refresh_enabled, true);
    assert.equal(result.after.content_feedback_refresh_limit, 3);
    assert.equal(result.boundary.includes("never reads or writes auth.jsonl"), true);

    const raw = await readFile(join(homeConfigDir, "config.jsonl"), "utf8");
    assert.equal(raw.trim().split("\n").length, 1);
    assert.equal(JSON.parse(raw).content_daily_topic, "daily frontier AI news and AI stock hotspots");
    assert.equal(JSON.parse(raw).review_tick_enabled, true);
    assert.equal(JSON.parse(raw).review_tick_interval_ms, 900000);
    assert.equal(JSON.parse(raw).review_tick_limit, 8);
    assert.equal(JSON.parse(raw).content_feedback_refresh_server_url, "http://localhost:18061/mcp");
    assert.equal(JSON.parse(raw).content_creator_metrics_enabled, true);
    assert.equal(JSON.parse(raw).content_creator_metrics_browser_session_name, "runtime-creator-metrics-test");

    const summary = await loadRuntimeConfigSummary({ configDir });
    assert.equal(summary.runtime.source_ref, "home:config.jsonl#1");
    assert.equal(summary.runtime.review_tick_enabled, true);
    assert.equal(summary.runtime.review_tick_interval_ms, 900000);
    assert.equal(summary.runtime.review_tick_limit, 8);
    assert.equal(summary.runtime.content_daily_enabled, true);
    assert.deepEqual(summary.runtime.content_daily_tickers, ["NVDA", "AMD"]);
    assert.equal(summary.runtime.content_feedback_refresh_enabled, true);
    assert.equal(summary.runtime.content_creator_metrics_enabled, true);
    assert.equal(summary.runtime.content_creator_metrics_browser_cdp_port, "9222");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime config update requires explicit confirmation for resident external writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-runtime-config-publish-guard-"));
  const configDir = join(root, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "runtime", promotion_enabled: true, structured_output: true })
    ].join("\n") + "\n", "utf8");

    await assert.rejects(
      updateRuntimeConfig({
        configDir,
        patch: {
          content_daily_dry_run: false,
          content_daily_preflight: true,
          content_daily_publish_enabled: true,
          content_daily_external_write_confirmed: true
        }
      }),
      /requires --external-write --confirmed/
    );

    await assert.rejects(
      updateRuntimeConfig({
        configDir,
        patch: {
          content_daily_dry_run: true,
          content_daily_preflight: true
        }
      }),
      /requires content_daily_dry_run=false/
    );

    const ok = await updateRuntimeConfig({
      configDir,
      confirmedExternalWrite: true,
      patch: {
        content_daily_dry_run: false,
        content_daily_preflight: true,
        content_daily_publish_enabled: true,
        content_daily_external_write_confirmed: true
      }
    });
    assert.equal(ok.after.content_daily_publish_enabled, true);
    assert.equal(ok.after.content_daily_external_write_confirmed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("direct auth fields win over explicitly named env-backed fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-config-direct-auth-"));
  const configDir = join(root, "config");
  const homeRoot = join(root, "home");
  const stateRoot = join(root, "state");
  const previousApiKey = process.env[DIRECT_AUTH_API_KEY_ENV];
  const previousAppId = process.env[DIRECT_AUTH_APP_ID_ENV];
  const previousAppSecret = process.env[DIRECT_AUTH_APP_SECRET_ENV];
  process.env[DIRECT_AUTH_API_KEY_ENV] = "env-api-key";
  process.env[DIRECT_AUTH_APP_ID_ENV] = "env-app-id";
  process.env[DIRECT_AUTH_APP_SECRET_ENV] = "env-app-secret";
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "direct-model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
      type: "model",
      id: "direct-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://api.example.test/v1",
      model: "gpt-test",
      auth_id: "direct-auth"
    })}\n`, "utf8");
    await writeFile(join(configDir, "auth.jsonl"), [
      JSON.stringify({
        type: "api_key",
        id: "direct-auth",
        key: "file-api-key",
        env: DIRECT_AUTH_API_KEY_ENV
      }),
      JSON.stringify({
        type: "app_secret",
        id: "feishu-main",
        app_id: "file-app-id",
        app_id_env: DIRECT_AUTH_APP_ID_ENV,
        app_secret: "file-app-secret",
        app_secret_env: DIRECT_AUTH_APP_SECRET_ENV
      })
    ].join("\n") + "\n", "utf8");

    const config = await loadConfig({ configDir });
    const appSecret = await loadAppSecretAuth({ configDir }, "feishu-main");
    assert.equal(config.model.api_key, "file-api-key");
    assert.equal(appSecret.appId, "file-app-id");
    assert.equal(appSecret.appSecret, "file-app-secret");
  } finally {
    restoreEnv(DIRECT_AUTH_API_KEY_ENV, previousApiKey);
    restoreEnv(DIRECT_AUTH_APP_ID_ENV, previousAppId);
    restoreEnv(DIRECT_AUTH_APP_SECRET_ENV, previousAppSecret);
    await rm(root, { recursive: true, force: true });
  }
});

test("auth diagnostics expose source metadata without secret values", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-config-auth-diagnostics-"));
  const configDir = join(root, "config");
  const homeRoot = join(root, "home");
  const stateRoot = join(root, "state");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "diagnostic-model" }),
      JSON.stringify({ type: "active_channel", channel_id: "feishu-main" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
      type: "model",
      id: "diagnostic-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://api.example.test/v1",
      model: "gpt-test",
      auth_id: "model-auth"
    })}\n`, "utf8");
    await writeFile(join(configDir, "settings.jsonl"), `${JSON.stringify({
      type: "channel",
      id: "feishu-main",
      kind: "feishu",
      transport: "websocket",
      auth_id: "feishu-auth",
      domain: "feishu",
      mode: "private_chat"
    })}\n`, "utf8");
    await writeFile(join(configDir, "auth.jsonl"), [
      JSON.stringify({ type: "api_key", id: "model-auth", key: "MODEL_SECRET_SHOULD_NOT_APPEAR" }),
      JSON.stringify({
        type: "app_secret",
        id: "feishu-auth",
        app_id: "APP_ID_SHOULD_NOT_APPEAR",
        app_secret: "APP_SECRET_SHOULD_NOT_APPEAR"
      })
    ].join("\n") + "\n", "utf8");

    const diagnostics = await loadRuntimeAuthDiagnostics({ configDir });
    assert.equal(diagnostics.active_model_auth?.source_ref, "repo:auth.jsonl#1");
    assert.equal(diagnostics.active_model_auth?.key.source, "direct");
    assert.equal(diagnostics.active_model_auth?.resolved, true);
    assert.equal(diagnostics.active_channel_auth?.source_ref, "repo:auth.jsonl#2");
    assert.equal(diagnostics.active_channel_auth?.app_id.source, "direct");
    assert.equal(diagnostics.active_channel_auth?.app_secret.source, "direct");
    assert.equal(diagnostics.active_channel_auth?.resolved, true);
    assert.equal(diagnostics.refs.includes("repo:auth.jsonl#1"), true);
    assert.equal(diagnostics.refs.includes("repo:auth.jsonl#2"), true);
    const serialized = JSON.stringify(diagnostics);
    assert.doesNotMatch(serialized, /MODEL_SECRET_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(serialized, /APP_ID_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(serialized, /APP_SECRET_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("auth diagnostics report explicitly named env-backed fields without rendering env values", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-config-env-auth-diagnostics-"));
  const configDir = join(root, "config");
  const homeRoot = join(root, "home");
  const stateRoot = join(root, "state");
  const envName = "AGENT_CONFIG_DIAGNOSTIC_ENV_SECRET";
  const previous = process.env[envName];
  process.env[envName] = "ENV_SECRET_SHOULD_NOT_APPEAR";
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "diagnostic-model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
      type: "model",
      id: "diagnostic-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://api.example.test/v1",
      model: "gpt-test",
      auth_id: "model-auth"
    })}\n`, "utf8");
    await writeFile(join(configDir, "auth.jsonl"), `${JSON.stringify({
      type: "api_key",
      id: "model-auth",
      env: envName
    })}\n`, "utf8");

    const diagnostics = await loadRuntimeAuthDiagnostics({ configDir });
    assert.equal(diagnostics.active_model_auth?.key.source, "env");
    assert.equal(diagnostics.active_model_auth?.key.env_name, envName);
    assert.equal(diagnostics.active_model_auth?.key.env_present, true);
    assert.doesNotMatch(JSON.stringify(diagnostics), /ENV_SECRET_SHOULD_NOT_APPEAR/);
  } finally {
    restoreEnv(envName, previous);
    await rm(root, { recursive: true, force: true });
  }
});

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
