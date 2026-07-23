import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import { createServer, type AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { getServiceHealth } from "../packages/core/src/service_health.js";
import { AgentStore } from "../packages/core/src/store.js";
import type { RuntimeConfig } from "../packages/runtime/src/config.js";
import { startRuntimeDaemon } from "../packages/runtime/src/runtime_daemon.js";
import { VNEXT_RUN_DIAGNOSTIC_CHANNEL } from "../apps/cli/src/vnext_run.js";

test("runtime daemon starts the Web channel and writes a running gateway heartbeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-daemon-web-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const configDir = join(root, "config");
  const heartbeatPath = join(stateRoot, "services/runtime/heartbeat.json");
  const projectionRoot = join(root, "projection");
  const stableDispatches: unknown[] = [];
  const stableChannel = channel(VNEXT_RUN_DIAGNOSTIC_CHANNEL);
  const recordStableDispatch = (message: unknown) => stableDispatches.push(message);
  stableChannel.subscribe(recordStableDispatch);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(configDir, { recursive: true });
    await initializeGitRepository(repoRoot);
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "missing-daemon-model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), "", "utf8");
    const handle = await startRuntimeDaemon({
      repoRoot,
      config: runtimeConfig({ stateRoot, homeRoot, assetProjectionRoot: projectionRoot }),
      configDir,
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

      const goalResponse = await fetch(`${gateway.channels[0]?.detail}/api/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "Keep daemon Web work in one Goal." })
      });
      assert.equal(goalResponse.ok, true);
      const goalPayload = await goalResponse.json() as Record<string, any>;
      assert.match(goalPayload.goal.goal_id, /^goal_/);
      assert.match(goalPayload.continue_hint, /goal continue --goal/);
      assert.equal(await fileExists(join(stateRoot, "runs/task_queue.jsonl")), false);
      assert.equal(await fileExists(join(stateRoot, "runs/index.jsonl")), false);
      assert.equal(await fileExists(join(stateRoot, "channels/outbox.jsonl")), false);
      assert.deepEqual(stableDispatches, []);

      const heartbeat = await readJsonEventually(heartbeatPath, (entry) => entry.state === "running");
      assert.equal(heartbeat.service, "runtime");
      assert.equal(heartbeat.asset_projection_root, projectionRoot);
      assert.equal(heartbeat.gateway?.state, "running");
      assert.deepEqual(
        heartbeat.gateway?.channels.map((channel: Record<string, unknown>) => `${channel.kind}:${channel.state}`),
        ["web:running"]
      );

      const health = await getServiceHealth(new AgentStore(repoRoot, stateRoot), { target: "runtime" });
      assert.equal(health.service.state, "running");
      assert.equal(health.service.gateway?.state, "running");
      assert.deepEqual(health.asset_projection, {
        configured: true,
        status: "absent",
        reason: "projection_root_missing"
      });
    } finally {
      await handle.stop();
    }
  } finally {
    stableChannel.unsubscribe(recordStableDispatch);
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime daemon stop awaits an inflight heartbeat write and leaves stopped as the final state", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-daemon-stop-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const heartbeatPath = join(stateRoot, "services/runtime/heartbeat.json");
  const runningWriteStarted = deferred<void>();
  const releaseRunningWrite = deferred<void>();
  const originalWriteJson = AgentStore.prototype.writeJson;
  let blockRunningWrite = true;
  let stateWriteCompletions = 0;
  let handle: Awaited<ReturnType<typeof startRuntimeDaemon>> | null = null;

  AgentStore.prototype.writeJson = async function (rel: string, value: unknown): Promise<string> {
    const record = value as Record<string, unknown>;
    if (
      this.stateRoot === stateRoot
      && rel === "services/runtime/heartbeat.json"
      && record.state === "running"
      && blockRunningWrite
    ) {
      blockRunningWrite = false;
      runningWriteStarted.resolve();
      await releaseRunningWrite.promise;
    }
    const ref = await originalWriteJson.call(this, rel, value);
    if (this.stateRoot === stateRoot) stateWriteCompletions += 1;
    return ref;
  };

  try {
    await mkdir(repoRoot, { recursive: true });
    handle = await startRuntimeDaemon({
      repoRoot,
      config: runtimeConfig({ stateRoot, homeRoot }),
      target: "runtime",
      web: {
        enabled: true,
        host: "127.0.0.1",
        port: 0
      }
    });
    await runningWriteStarted.promise;

    let stopReturned = false;
    const stopping = handle.stop().then(() => {
      stopReturned = true;
    });
    await delay(20);
    assert.equal(stopReturned, false);

    releaseRunningWrite.resolve();
    await stopping;
    const stopped = JSON.parse(await readFile(heartbeatPath, "utf8")) as Record<string, unknown>;
    assert.equal(stopped.state, "stopped");

    const writesAtStop = stateWriteCompletions;
    await delay(40);
    assert.equal(stateWriteCompletions, writesAtStop);
    const stillStopped = JSON.parse(await readFile(heartbeatPath, "utf8")) as Record<string, unknown>;
    assert.equal(stillStopped.state, "stopped");
  } finally {
    releaseRunningWrite.resolve();
    await handle?.stop().catch(() => undefined);
    AgentStore.prototype.writeJson = originalWriteJson;
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime daemon writes gateway error heartbeat when channel startup fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-daemon-"));
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

async function initializeGitRepository(repoRoot: string): Promise<void> {
  await runGit(repoRoot, ["init", "-b", "develop"]);
  await runGit(repoRoot, ["config", "user.name", "Daemon Web Goal Test"]);
  await runGit(repoRoot, ["config", "user.email", "daemon-web-goal@example.test"]);
  await writeFile(join(repoRoot, "README.md"), "daemon web goal fixture\n");
  await runGit(repoRoot, ["add", "README.md"]);
  await runGit(repoRoot, ["commit", "-m", "fixture base"]);
}

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
      else resolvePromise();
    });
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function runtimeConfig(args: { stateRoot: string; homeRoot: string; assetProjectionRoot?: string }): RuntimeConfig {
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
      content_creator_metrics_browser_auto_connect: false,
      asset_projection_root: args.assetProjectionRoot
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value?: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: (value) => resolve(value as T | PromiseLike<T>)
  };
}
