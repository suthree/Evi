import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { getServiceHealth } from "../packages/core/src/service_health.js";
import { AgentStore } from "../packages/core/src/store.js";
import type { RuntimeConfig } from "../packages/runtime/src/config.js";
import { startRuntimeDaemon } from "../packages/runtime/src/runtime_daemon.js";

test("runtime daemon starts the Web channel and writes a running gateway heartbeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "xingzhe-runtime-daemon-web-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const heartbeatPath = join(stateRoot, "services/runtime/heartbeat.json");
  try {
    await mkdir(repoRoot, { recursive: true });
    const handle = await startRuntimeDaemon({
      repoRoot,
      config: runtimeConfig({ stateRoot, homeRoot }),
      target: "runtime",
      web: {
        enabled: true,
        host: "127.0.0.1",
        port: 0
      }
    });
    try {
      const gateway = handle.gateway.health();
      assert.equal(gateway.state, "running");
      assert.equal(gateway.channels.length, 1);
      assert.equal(gateway.channels[0]?.kind, "web");
      assert.equal(gateway.channels[0]?.state, "running");
      assert.match(gateway.channels[0]?.detail ?? "", /^http:\/\/127\.0\.0\.1:\d+$/);

      const response = await fetch(`${gateway.channels[0]?.detail}/api/sessions`);
      assert.equal(response.ok, true);
      const payload = await response.json() as Record<string, any>;
      assert.deepEqual(payload.sessions, []);
      assert.equal(payload.boundary, "local runtime session control state");

      const heartbeat = await readJsonEventually(heartbeatPath, (entry) => entry.state === "running");
      assert.equal(heartbeat.service, "runtime");
      assert.equal(heartbeat.gateway?.state, "running");
      assert.deepEqual(
        heartbeat.gateway?.channels.map((channel: Record<string, unknown>) => `${channel.kind}:${channel.state}`),
        ["web:running"]
      );

      const health = await getServiceHealth(new AgentStore(repoRoot, stateRoot), { target: "runtime" });
      assert.equal(health.service.state, "running");
      assert.equal(health.service.gateway?.state, "running");
    } finally {
      await handle.stop();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime daemon writes gateway error heartbeat when channel startup fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "xingzhe-runtime-daemon-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const blocker = createServer();
  try {
    await mkdir(repoRoot, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", () => {
        blocker.off("error", reject);
        resolve();
      });
    });
    const port = (blocker.address() as AddressInfo).port;

    await assert.rejects(
      startRuntimeDaemon({
        repoRoot,
        config: runtimeConfig({ stateRoot, homeRoot }),
        target: "runtime",
        web: {
          enabled: true,
          host: "127.0.0.1",
          port
        }
      }),
      /EADDRINUSE|address already in use/i
    );

    const heartbeat = JSON.parse(await readFile(join(stateRoot, "services/runtime/heartbeat.json"), "utf8")) as Record<string, any>;
    assert.equal(heartbeat.state, "error");
    assert.match(heartbeat.error, /EADDRINUSE|address already in use/i);
    assert.equal(heartbeat.gateway.state, "error");
    assert.deepEqual(heartbeat.gateway.channels.map((channel: Record<string, unknown>) => `${channel.kind}:${channel.state}`), [
      "web:error"
    ]);

    const health = await getServiceHealth(new AgentStore(repoRoot, stateRoot), { target: "runtime" });
    assert.equal(health.status, "attention");
    assert.equal(health.service.state, "error");
    assert.match(health.service.error ?? "", /EADDRINUSE|address already in use/i);
    assert.equal(health.service.gateway?.state, "error");
    assert.equal(health.status_reasons.includes("runtime_not_running"), true);
  } finally {
    await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve())).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

async function readJsonEventually(
  path: string,
  predicate: (entry: Record<string, any>) => boolean
): Promise<Record<string, any>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const entry = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
      if (predicate(entry)) return entry;
      lastError = new Error(`heartbeat predicate did not match: ${entry.state}`);
    } catch (error) {
      lastError = error;
    }
    await delay(25);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function runtimeConfig(args: { stateRoot: string; homeRoot: string }): RuntimeConfig {
  return {
    home: {
      root: args.homeRoot
    },
    state: {
      root: args.stateRoot
    },
    runtime: {
      promotion_enabled: true,
      structured_output: true,
      review_tick_enabled: false,
      review_tick_interval_ms: 30 * 60 * 1000,
      review_tick_limit: 20,
      content_daily_enabled: false,
      content_daily_interval_ms: 60 * 60 * 1000,
      content_daily_dry_run: true,
      content_daily_preflight: false,
      content_daily_topic: "daily AI news and AI stock hotspots",
      content_daily_source_urls: [],
      content_daily_tickers: [],
      content_daily_publish_enabled: false,
      content_daily_external_write_confirmed: false,
      content_daily_publish_adapter: "xiaohongshu-mcp",
      content_daily_publish_server_url: "http://localhost:18060/mcp",
      content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: false,
      content_creator_metrics_interval_ms: 60 * 60 * 1000,
      content_creator_metrics_limit: 10,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "runtime-creator-metrics",
      content_creator_metrics_browser_auto_connect: false
    },
    vault: {
      mode: "user",
      root: join(args.homeRoot, "vault"),
      active_root: join(args.homeRoot, "vault"),
      seed_roots: ["vault", "skills"],
      project_roots: []
    },
    model: {
      type: "model",
      id: "runtime-daemon-test",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://example.invalid/v1",
      model: "runtime-daemon-test",
      auth_id: "runtime-daemon-test",
      max_output_tokens: 2400,
      store: false,
      json_object: true,
      api_key: "test-key"
    }
  };
}
