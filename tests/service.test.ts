import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildRuntimeServiceDefinition,
  parseLaunchdPid,
  prepareServiceRuntimeSource,
  renderLaunchdPlist,
  renderSupervisorLaunchdPlist,
  rollbackServiceRuntimeBundle,
  resolveServiceDefinition,
  resolveServiceConfigSelectors,
  rotateServiceLogs,
  runServiceCommand,
  syncServiceRuntimeBundle
} from "../packages/runtime/src/service.js";

const execFile = promisify(execFileCallback);

test("launchd plist uses explicit runtime daemon runner and does not contain secrets", () => {
  const definition = buildRuntimeServiceDefinition({
    repoRoot: "/work/runtime",
    configDir: "/work/runtime/config",
    stateRoot: "/work/runtime/.runtime/state",
    homeRoot: "/home/user/.local-runtime",
    provider: "feishu",
    channelId: "feishu-main",
    scenarioId: "im-default",
    discipline: "query_todo",
    nodePath: "/usr/local/bin/node",
    pathEnv: "/usr/local/bin:/usr/bin:/bin"
  });
  const plist = renderLaunchdPlist(definition);

  assert.match(plist, /<key>RunAtLoad<\/key>\n  <true\/>/);
  assert.match(plist, /<key>KeepAlive<\/key>\n  <true\/>/);
  assert.match(plist, /<string>\/usr\/local\/bin\/node<\/string>/);
  assert.match(plist, /<string>\/home\/user\/.local-runtime\/service\/runtime\/current\/dist\/apps\/cli\/src\/main\.js<\/string>/);
  assert.match(plist, /<string>daemon<\/string>/);
  assert.match(plist, /<string>serve<\/string>/);
  assert.match(plist, /<string>--runtime-build<\/string>/);
  assert.match(plist, /<string>--provider<\/string>/);
  assert.match(plist, /<string>feishu<\/string>/);
  assert.match(plist, /<string>\/home\/user\/\.local-runtime\/service\/runtime\/current\/build\.json<\/string>/);
  assert.match(plist, /<key>LOCAL_RUNTIME_HOME<\/key>/);
  assert.doesNotMatch(plist, /tsx\/dist/);
  assert.doesNotMatch(plist, /api_key|app_secret|sk-test|cli_secret/i);
});

test("runtime service definition starts the unified daemon with configurable channel surfaces", () => {
  const definition = buildRuntimeServiceDefinition({
    repoRoot: "/work/runtime",
    configDir: "/work/runtime/config",
    stateRoot: "/work/runtime/.runtime/state",
    homeRoot: "/home/user/.local-runtime",
    provider: "feishu",
    channelId: "feishu-main",
    scenarioId: "im-default",
    discipline: "query_todo",
    enableIm: false,
    webHost: "127.0.0.1",
    webPort: 9876,
    nodePath: "/usr/local/bin/node",
    pathEnv: "/usr/local/bin:/usr/bin:/bin"
  });
  const plist = renderLaunchdPlist(definition);

  assert.equal(definition.target, "runtime");
  assert.equal(definition.label, "local.runtime.runtime");
  assert.equal(definition.manifestPath, "/home/user/.local-runtime/service/runtime.json");
  assert.equal(definition.heartbeatPath, "/work/runtime/.runtime/state/services/runtime/heartbeat.json");
  assert.equal(definition.taskQueueStatusPath, "/work/runtime/.runtime/state/services/runtime/task_queue.json");
  assert.equal(definition.runtimePreviousRoot, "/home/user/.local-runtime/service/runtime/previous");
  assert.match(plist, /<string>daemon<\/string>/);
  assert.match(plist, /<string>serve<\/string>/);
  assert.match(plist, /<string>--no-im<\/string>/);
  assert.match(plist, /<string>--provider<\/string>/);
  assert.match(plist, /<string>feishu<\/string>/);
  assert.match(plist, /<string>--host<\/string>/);
  assert.match(plist, /<string>127\.0\.0\.1<\/string>/);
  assert.match(plist, /<string>--port<\/string>/);
  assert.match(plist, /<string>9876<\/string>/);
  assert.doesNotMatch(plist, /api_key|app_secret|sk-test|cli_secret/i);
});

test("deployment supervisor launchd job uses the stable copied controller without secrets", () => {
  const definition = buildRuntimeServiceDefinition({
    repoRoot: "/work/runtime",
    configDir: "/work/runtime/config",
    stateRoot: "/work/runtime/.runtime/state",
    homeRoot: "/home/user/.local-runtime",
    provider: "feishu",
    channelId: "feishu-main",
    scenarioId: "im-default",
    nodePath: "/usr/local/bin/node"
  });
  const plist = renderSupervisorLaunchdPlist(definition);
  assert.match(plist, /local\.runtime\.runtime\.supervisor/);
  assert.match(plist, /\/home\/user\/\.local-runtime\/service\/supervisor\/service_supervisor\.js/);
  assert.match(plist, /\/home\/user\/\.local-runtime\/service\/supervisor\/manifest\.json/);
  assert.doesNotMatch(plist, /runtime\/current\/dist\/apps\/cli/);
  assert.doesNotMatch(plist, /api_key|app_secret|sk-test|cli_secret/i);
});

test("parseLaunchdPid reads launchctl print output", () => {
  assert.equal(parseLaunchdPid("state = running\npid = 12345\n"), 12345);
  assert.equal(parseLaunchdPid("state = waiting\n"), null);
});

test("service runtime rollback swaps current and previous bundles reversibly", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-rollback-"));
  const definition = buildRuntimeServiceDefinition({
    repoRoot: join(root, "repo"),
    configDir: join(root, "repo/config"),
    stateRoot: join(root, "state"),
    homeRoot: join(root, "home"),
    nodePath: process.execPath
  });
  try {
    await writeTestRuntimeBundle(definition.runtimeCurrentRoot, "current-commit");
    await writeTestRuntimeBundle(definition.runtimePreviousRoot, "stable-commit");

    await rollbackServiceRuntimeBundle(definition);
    assert.equal(JSON.parse(await readFile(definition.runtimeBuildPath, "utf8")).source_commit, "stable-commit");
    assert.equal(JSON.parse(await readFile(definition.runtimePreviousBuildPath, "utf8")).source_commit, "current-commit");

    await rollbackServiceRuntimeBundle(definition);
    assert.equal(JSON.parse(await readFile(definition.runtimeBuildPath, "utf8")).source_commit, "current-commit");
    assert.equal(JSON.parse(await readFile(definition.runtimePreviousBuildPath, "utf8")).source_commit, "stable-commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service runtime rollback rejects a missing last known-good bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-rollback-missing-"));
  const definition = buildRuntimeServiceDefinition({
    repoRoot: join(root, "repo"),
    configDir: join(root, "repo/config"),
    stateRoot: join(root, "state"),
    homeRoot: join(root, "home"),
    nodePath: process.execPath
  });
  try {
    await writeTestRuntimeBundle(definition.runtimeCurrentRoot, "current-commit");
    await assert.rejects(() => rollbackServiceRuntimeBundle(definition), /last known-good runtime is unavailable or incomplete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service rollback retries transient launchd bootstrap failure after bundle swap", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-rollback-retry-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const definition = buildRuntimeServiceDefinition({ repoRoot, configDir, stateRoot, homeRoot, nodePath: process.execPath });
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot })
    ].join("\n") + "\n", "utf8");
    await writeTestRuntimeBundle(definition.runtimeCurrentRoot, "current-commit");
    await writeTestRuntimeBundle(definition.runtimePreviousRoot, "stable-commit");
    let loaded = true;
    let bootstrapAttempts = 0;
    const result = await runServiceCommand({
      action: "rollback",
      target: "runtime",
      repoRoot,
      configDir,
      stateRoot
    }, {
      platform: "darwin",
      run: async (_command, args) => {
        const action = args[0];
        if (action === "print") return loaded
          ? { stdout: "state = running\npid = 456\n", stderr: "", exitCode: 0 }
          : { stdout: "", stderr: "not loaded", exitCode: 1 };
        if (action === "bootout") {
          loaded = false;
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (action === "bootstrap") {
          bootstrapAttempts += 1;
          if (bootstrapAttempts === 1) return { stdout: "", stderr: "Bootstrap failed: 5", exitCode: 5 };
          loaded = true;
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }
    });

    assert.equal(bootstrapAttempts, 2);
    assert.equal(result.launchd?.loaded, true);
    assert.equal(result.runtime?.source_commit, "stable-commit");
    assert.equal(result.previous_runtime?.source_commit, "current-commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service rollback restores identities and service attempts when reconciliation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-rollback-reconcile-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const definition = buildRuntimeServiceDefinition({ repoRoot, configDir, stateRoot, homeRoot, nodePath: process.execPath });
  const reconciliationError = new Error("rollback ledger reconciliation rejected");
  const bootstrapPaths: string[] = [];
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot })
    ].join("\n") + "\n", "utf8");
    await writeTestRuntimeBundle(definition.runtimeCurrentRoot, "current-commit");
    await writeTestRuntimeBundle(definition.runtimePreviousRoot, "stable-commit");
    await mkdir(definition.supervisorRoot, { recursive: true });
    await writeFile(definition.supervisorManifestPath, "{}\n", "utf8");

    await assert.rejects(runServiceCommand({
      action: "rollback",
      target: "runtime",
      repoRoot,
      configDir,
      stateRoot
    }, {
      platform: "darwin",
      recordRollback: async () => {
        throw reconciliationError;
      },
      run: async (_command, args) => {
        const action = args[0];
        if (action === "print") return { stdout: "", stderr: "not loaded", exitCode: 1 };
        if (action === "bootstrap") {
          bootstrapPaths.push(args[2]);
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (action === "kickstart" && args[2]?.endsWith("/local.runtime.runtime")) {
          return { stdout: "", stderr: "runtime restart failed", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }
    }), (error: unknown) => error === reconciliationError);

    assert.equal(JSON.parse(await readFile(definition.runtimeBuildPath, "utf8")).source_commit, "current-commit");
    assert.equal(JSON.parse(await readFile(definition.runtimePreviousBuildPath, "utf8")).source_commit, "stable-commit");
    assert.deepEqual(bootstrapPaths, [definition.plistPath, definition.supervisorPlistPath]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service logs rotate at the lifecycle size cap and retain bounded history", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-log-"));
  const stdoutPath = join(root, "runtime.out.log");
  const stderrPath = join(root, "runtime.err.log");
  try {
    await writeFile(stdoutPath, "new-output", "utf8");
    await writeFile(`${stdoutPath}.1`, "old-output", "utf8");
    await writeFile(stderrPath, "small", "utf8");
    await rotateServiceLogs({ stdoutPath, stderrPath }, 8, 3);
    assert.equal(await readFile(`${stdoutPath}.1`, "utf8"), "new-output");
    assert.equal(await readFile(`${stdoutPath}.2`, "utf8"), "old-output");
    assert.equal(await readFile(stderrPath, "utf8"), "small");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime sync preserves only commit-bound verified current builds as last known-good", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-sync-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const definition = buildRuntimeServiceDefinition({
    repoRoot,
    configDir,
    stateRoot,
    homeRoot: join(root, "home"),
    nodePath: process.execPath
  });
  try {
    await mkdir(join(repoRoot, "dist/apps/cli/src"), { recursive: true });
    await mkdir(join(repoRoot, "node_modules"), { recursive: true });
    await mkdir(configDir, { recursive: true });
    await writeFile(join(repoRoot, "dist/apps/cli/src/main.js"), "export const version = 1;\n", "utf8");
    await writeFile(join(configDir, "config.jsonl"), "", "utf8");
    await writeTestRuntimeBundle(definition.runtimeCurrentRoot, "verified-commit", repoRoot);
    await mkdir(join(stateRoot, "governance/capability-acceptance"), { recursive: true });
    await writeFile(join(stateRoot, "governance/capability-acceptance/basic-entrypoints.json"), `${JSON.stringify({
      status: "verified",
      source_commit: "verified-commit",
      repo_root: repoRoot,
      state_root: stateRoot
    })}\n`, "utf8");

    await syncServiceRuntimeBundle(definition);
    assert.equal(JSON.parse(await readFile(definition.runtimePreviousBuildPath, "utf8")).source_commit, "verified-commit");

    await writeFile(join(repoRoot, "dist/apps/cli/src/main.js"), "export const version = 2;\n", "utf8");
    await syncServiceRuntimeBundle(definition);
    assert.equal(JSON.parse(await readFile(definition.runtimePreviousBuildPath, "utf8")).source_commit, "verified-commit");
    assert.match(await readFile(join(definition.runtimeCurrentRoot, "dist/apps/cli/src/main.js"), "utf8"), /version = 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime source preparation builds one unchanged clean commit before staging", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-build-source-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const definition = buildRuntimeServiceDefinition({
    repoRoot,
    configDir,
    stateRoot: join(root, "state"),
    homeRoot: join(root, "home"),
    nodePath: process.execPath
  });
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), "", "utf8");
    await writeFile(join(repoRoot, "source.ts"), "export const value = 1;\n", "utf8");
    await writeFile(join(repoRoot, ".gitignore"), "dist/\n", "utf8");
    await execFile("git", ["init", "-q"], { cwd: repoRoot });
    await execFile("git", ["config", "user.email", "test@example.invalid"], { cwd: repoRoot });
    await execFile("git", ["config", "user.name", "Test"], { cwd: repoRoot });
    await execFile("git", ["add", "."], { cwd: repoRoot });
    await execFile("git", ["commit", "-qm", "source"], { cwd: repoRoot });
    const commit = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
    let buildCalls = 0;
    const build = await prepareServiceRuntimeSource(definition, async (command, args, options) => {
      buildCalls += 1;
      assert.equal(command, "pnpm");
      assert.deepEqual(args, ["run", "build"]);
      assert.equal(options?.cwd, repoRoot);
      await mkdir(join(repoRoot, "dist/apps/cli/src"), { recursive: true });
      await mkdir(join(repoRoot, "dist/packages/runtime/src"), { recursive: true });
      await writeFile(join(repoRoot, "dist/apps/cli/src/main.js"), "export {};\n", "utf8");
      await writeFile(join(repoRoot, "dist/packages/runtime/src/service_supervisor.js"), "export {};\n", "utf8");
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    assert.equal(buildCalls, 1);
    assert.equal(build.source_commit, commit);
    assert.equal(build.source_is_dirty, false);
    assert.equal(build.build_command, "pnpm run build");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service restart preserves installed current and previous bundles", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-restart-installed-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const definition = buildRuntimeServiceDefinition({ repoRoot, configDir, stateRoot, homeRoot, nodePath: process.execPath });
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "test-model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
      type: "model",
      id: "test-model",
      provider: "openai-compatible",
      base_url: "https://api.example.test/v1",
      model: "test-model",
      auth_id: "model-main"
    })}\n`, "utf8");
    await writeTestRuntimeBundle(definition.runtimeCurrentRoot, "installed-commit", repoRoot);
    await writeTestRuntimeBundle(definition.runtimePreviousRoot, "previous-commit", repoRoot);
    let prepareCalls = 0;
    let loaded = true;
    const result = await runServiceCommand({
      action: "restart",
      target: "runtime",
      repoRoot,
      configDir,
      stateRoot,
      enableIm: false
    }, {
      platform: "darwin",
      prepareRuntimeSource: async () => {
        prepareCalls += 1;
        throw new Error("restart must not build repo source");
      },
      run: async (_command, args) => {
        if (args[0] === "print") return loaded
          ? { stdout: "state = running\npid = 456\n", stderr: "", exitCode: 0 }
          : { stdout: "", stderr: "not loaded", exitCode: 1 };
        if (args[0] === "bootout") loaded = false;
        if (args[0] === "bootstrap" || args[0] === "kickstart") loaded = true;
        return { stdout: "", stderr: "", exitCode: 0 };
      }
    });
    assert.equal(prepareCalls, 0);
    assert.equal(result.runtime?.source_commit, "installed-commit");
    assert.equal(result.previous_runtime?.source_commit, "previous-commit");
    assert.match(result.message ?? "", /repository source was not deployed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service definition accepts configured Discord IM providers with an adapter", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-provider-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  try {
    await mkdir(configDir, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "test-model" }),
      JSON.stringify({ type: "active_channel", channel_id: "discord-main" }),
      JSON.stringify({ type: "active_scenario", scenario_id: "im-discord" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "settings.jsonl"), [
      JSON.stringify({
        type: "channel",
        id: "discord-main",
        kind: "discord",
        transport: "gateway",
        mode: "bot",
        auth_id: "discord-main"
      }),
      JSON.stringify({
        type: "scenario",
        id: "im-discord",
        channel_id: "discord-main",
        model_id: "test-model",
        discipline: "query_todo"
      })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), [
      JSON.stringify({
        type: "model",
        id: "test-model",
        provider: "openai-compatible",
        base_url: "https://api.example.test/v1",
        model: "test-model",
        auth_id: "model-main"
      })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "auth.jsonl"), [
      JSON.stringify({ type: "api_key", id: "model-main", key: "sk-test" }),
      JSON.stringify({ type: "api_key", id: "discord-main", key: "discord-test" })
    ].join("\n") + "\n", "utf8");

    const definition = await resolveServiceDefinition({
      action: "start",
      target: "runtime",
      repoRoot,
      configDir,
      stateRoot,
      provider: "discord"
    }, true);

    assert.deepEqual(definition.programArguments.slice(-10, -2), [
      "--scenario",
      "im-discord",
      "--provider",
      "discord",
      "--channel",
      "discord-main",
      "--discipline",
      "query_todo"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime service provider flag overrides stale active IM selectors", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-provider-override-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  try {
    await mkdir(configDir, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "test-model" }),
      JSON.stringify({ type: "active_channel", channel_id: "feishu-main" }),
      JSON.stringify({ type: "active_scenario", scenario_id: "im-feishu" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "settings.jsonl"), [
      JSON.stringify({
        type: "channel",
        id: "feishu-main",
        kind: "feishu",
        transport: "websocket",
        mode: "private_chat",
        auth_id: "feishu-main"
      }),
      JSON.stringify({
        type: "scenario",
        id: "im-feishu",
        channel_id: "feishu-main",
        model_id: "test-model",
        discipline: "query_todo"
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
    await writeFile(join(configDir, "models.jsonl"), [
      JSON.stringify({
        type: "model",
        id: "test-model",
        provider: "openai-compatible",
        base_url: "https://api.example.test/v1",
        model: "test-model",
        auth_id: "model-main"
      })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "auth.jsonl"), [
      JSON.stringify({ type: "api_key", id: "model-main", key: "sk-test" }),
      JSON.stringify({ type: "api_key", id: "telegram-main", key: "telegram-test" })
    ].join("\n") + "\n", "utf8");

    const definition = await resolveServiceDefinition({
      action: "start",
      target: "runtime",
      repoRoot,
      configDir,
      stateRoot,
      provider: "telegram"
    }, true);

    const serviceArgs = definition.programArguments.slice(2);
    assert.deepEqual(serviceArgs.slice(serviceArgs.indexOf("--scenario"), serviceArgs.indexOf("--runtime-build")), [
      "--scenario",
      "im-telegram",
      "--provider",
      "telegram",
      "--channel",
      "telegram-main",
      "--discipline",
      "query_todo"
    ]);
    assert.equal(serviceArgs.includes("--no-im"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service config selectors prefer installed manifest state and preserve explicit state roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-selectors-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const homeRoot = join(root, "home");
  const repoStateRoot = join(root, "repo-state");
  const installedStateRoot = join(root, "installed-state");
  const explicitStateRoot = join(root, "explicit-state");
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: repoStateRoot })
    ].join("\n") + "\n", "utf8");

    const defaultSelectors = await resolveServiceConfigSelectors({
      target: "runtime",
      configDir
    });
    assert.equal(defaultSelectors.stateRoot, join(homeRoot, "state/runtime"));

    await mkdir(join(homeRoot, "service"), { recursive: true });
    await writeFile(join(homeRoot, "service/runtime.json"), `${JSON.stringify({
      target: "runtime",
      home_root: homeRoot,
      state_root: installedStateRoot
    })}\n`, "utf8");

    const installedSelectors = await resolveServiceConfigSelectors({
      target: "runtime",
      configDir
    });
    assert.equal(installedSelectors.stateRoot, installedStateRoot);

    const explicitSelectors = await resolveServiceConfigSelectors({
      target: "runtime",
      configDir,
      stateRoot: explicitStateRoot
    });
    assert.equal(explicitSelectors.stateRoot, explicitStateRoot);

    await writeFile(join(homeRoot, "service/runtime.json"), "{invalid\n", "utf8");
    const malformedManifestSelectors = await resolveServiceConfigSelectors({
      target: "runtime",
      configDir
    });
    assert.equal(malformedManifestSelectors.stateRoot, join(homeRoot, "state/runtime"));

    for (const manifest of [
      { target: "other", home_root: homeRoot, state_root: installedStateRoot },
      { target: "runtime", home_root: join(root, "other-home"), state_root: installedStateRoot },
      { target: "runtime", home_root: homeRoot, state_root: "relative-state" }
    ]) {
      await writeFile(join(homeRoot, "service/runtime.json"), `${JSON.stringify(manifest)}\n`, "utf8");
      const rejectedManifestSelectors = await resolveServiceConfigSelectors({
        target: "runtime",
        configDir
      });
      assert.equal(rejectedManifestSelectors.stateRoot, join(homeRoot, "state/runtime"));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service status combines launchd status and heartbeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  try {
    await mkdir(configDir, { recursive: true });
    await mkdir(join(stateRoot, "services/runtime"), { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_channel", channel_id: "feishu-main" }),
      JSON.stringify({ type: "active_scenario", scenario_id: "im-default" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(stateRoot, "services/runtime/heartbeat.json"), `${JSON.stringify({
      service: "runtime",
      state: "running",
      pid: 777,
      repo_root: repoRoot,
      state_root: stateRoot,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      started_at: "2026-06-29T00:00:00.000Z",
      updated_at: "2026-06-29T00:00:30.000Z"
    })}\n`, "utf8");
    await mkdir(join(homeRoot, "service/runtime/current"), { recursive: true });
    await writeFile(join(homeRoot, "service/runtime.json"), `${JSON.stringify({
      target: "runtime",
      home_root: homeRoot,
      state_root: stateRoot
    })}\n`, "utf8");
    await writeFile(join(homeRoot, "service/runtime/current/build.json"), `${JSON.stringify({
      schema_version: 1,
      target: "runtime",
      runtime_current_root: join(homeRoot, "service/runtime/current"),
      repo_root: repoRoot,
      built_at: "2026-06-29T00:00:10.000Z",
      node_version: "v24.0.0",
      source_commit: "0123456789abcdef0123456789abcdef01234567",
      source_commit_short: "0123456789ab",
      source_branch: "develop",
      source_is_dirty: false
    })}\n`, "utf8");
    await mkdir(join(homeRoot, "service/runtime/previous"), { recursive: true });
    await writeFile(join(homeRoot, "service/runtime/previous/build.json"), `${JSON.stringify({
      schema_version: 1,
      target: "runtime",
      runtime_current_root: join(homeRoot, "service/runtime/previous"),
      repo_root: repoRoot,
      built_at: "2026-06-28T00:00:10.000Z",
      node_version: "v24.0.0",
      source_commit: "abcdef0123456789abcdef0123456789abcdef01",
      source_commit_short: "abcdef012345",
      source_branch: "develop",
      source_is_dirty: false
    })}\n`, "utf8");
    await writeFile(join(stateRoot, "services/runtime/review_tick.json"), `${JSON.stringify({
      service: "review_tick",
      state: "ok",
      enabled: true,
      pid: 777,
      repo_root: repoRoot,
      state_root: stateRoot,
      interval_ms: 1800000,
      limit: 20,
      started_at: "2026-06-29T00:00:00.000Z",
      updated_at: "2026-06-29T00:00:30.000Z",
      last_tick_ref: "autonomy/ticks/review_tick_1.json",
      last_inbox_count: 2
    })}\n`, "utf8");
    await writeFile(join(stateRoot, "services/runtime/task_queue.json"), `${JSON.stringify({
      service: "runtime_task_queue",
      state: "ok",
      enabled: true,
      pid: 777,
      interval_ms: 30000,
      limit: 1,
      queued_stale_ms: 60000,
      running_stale_ms: 21600000,
      started_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:31.000Z",
      last_recoverable_count: 2,
      last_due_count: 1,
      last_claimed_count: 1,
      last_completed_count: 1,
      last_failed_count: 0,
      last_task_ids: ["runtime_task_1"]
    })}\n`, "utf8");
    await writeFile(join(stateRoot, "services/runtime/content_daily.json"), `${JSON.stringify({
      service: "content_daily",
      state: "ok",
      enabled: true,
      pid: 777,
      repo_root: repoRoot,
      state_root: stateRoot,
      interval_ms: 3600000,
      dry_run: true,
      preflight: false,
      started_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:30.000Z",
      last_date_key: "2026-07-01",
      last_job_ref: "content/daily/2026-07-01.json",
      last_run_ref: "content/runs/content_run_1/run.json",
      last_job_status: "preflight_ok"
    })}\n`, "utf8");
    await mkdir(join(stateRoot, "content/daily"), { recursive: true });
    await writeFile(join(stateRoot, "content/daily/2026-07-01.json"), `${JSON.stringify({
      status: "preflight_ok",
      run_id: "content_run_1",
      run_ref: "content/runs/content_run_1/run.json"
    })}\n`, "utf8");
    await mkdir(join(stateRoot, "content/runs/content_run_1"), { recursive: true });
    await writeFile(join(stateRoot, "content/runs/content_run_1/run.json"), `${JSON.stringify({
      status: "published",
      evidence: { publish_status: "published" }
    })}\n`, "utf8");
    await writeFile(join(stateRoot, "services/runtime/content_feedback_refresh.json"), `${JSON.stringify({
      service: "content_feedback_refresh",
      state: "ok",
      enabled: true,
      pid: 777,
      repo_root: repoRoot,
      state_root: stateRoot,
      interval_ms: 3600000,
      limit: 10,
      min_follow_up_age_ms: 21600000,
      server_url: "http://localhost:18060/mcp",
      started_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:30.000Z",
      last_queue_count: 2,
      last_due_count: 1,
      last_refreshed_count: 1,
      last_captured_count: 1
    })}\n`, "utf8");
    await writeFile(join(stateRoot, "services/runtime/content_creator_metrics.json"), `${JSON.stringify({
      service: "content_creator_metrics",
      state: "ok",
      enabled: true,
      pid: 777,
      repo_root: repoRoot,
      state_root: stateRoot,
      interval_ms: 3600000,
      limit: 10,
      creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      browser_session_name: "runtime-creator-metrics",
      browser_auto_connect: false,
      started_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:31.000Z",
      last_queue_count: 1,
      last_captured_count: 1,
      last_blocked_count: 0,
      last_failed_count: 0
    })}\n`, "utf8");
    await mkdir(join(stateRoot, "autonomy/runs"), { recursive: true });
    await writeFile(join(stateRoot, "autonomy/runs/pause_signal.json"), `${JSON.stringify({
      id: "pause_signal_test",
      action_type: "pause_autonomy",
      status: "active",
      scope: "autonomous_exploration",
      reason: "Operator should review the current self-evolution direction.",
      resume_hint: "Clear or replace the pause signal when review is complete.",
      requested_by: "model_action",
      created_at: "2026-06-29T00:00:31.000Z"
    })}\n`, "utf8");

    const result = await runServiceCommand({
      action: "status",
      target: "runtime",
      configDir,
      repoRoot
    }, {
      platform: "darwin",
      run: async () => ({
        stdout: "state = running\npid = 12345\n",
        stderr: "",
        exitCode: 0
      })
    });

    assert.equal(result.ok, true);
    assert.match(result.boundary, /local service lifecycle status/);
    assert.match(result.boundary, /use health_command for bounded runtime\/channel health/);
    assert.equal(result.health_command, "pnpm run runtime -- service health --target runtime");
    assert.equal(result.launchd?.loaded, true);
    assert.equal(result.launchd?.pid, 12345);
    assert.equal(result.state_root, stateRoot);
    assert.equal(result.heartbeat?.pid, 777);
    assert.equal(result.heartbeat?.state, "running");
    assert.equal(result.runtime?.source_commit_short, "0123456789ab");
    assert.equal(result.runtime?.source_branch, "develop");
    assert.equal(result.runtime?.source_is_dirty, false);
    assert.equal(result.runtime?.runtime_current_root, join(homeRoot, "service/runtime/current"));
    assert.equal(result.previous_runtime?.source_commit_short, "abcdef012345");
    assert.equal(result.review_tick?.state, "ok");
    assert.equal(result.review_tick?.last_inbox_count, 2);
    assert.equal(result.task_queue?.state, "ok");
    assert.equal(result.task_queue?.last_recoverable_count, 2);
    assert.deepEqual(result.task_queue?.last_task_ids, ["runtime_task_1"]);
    assert.equal(result.content_daily?.state, "ok");
    assert.equal(result.content_daily?.last_job_ref, "content/daily/2026-07-01.json");
    assert.equal(result.content_daily?.last_job_status, "preflight_ok");
    assert.equal(result.content_daily?.last_effective_job_status, "published");
    assert.equal(result.content_feedback_refresh?.state, "ok");
    assert.equal(result.content_feedback_refresh?.last_queue_count, 2);
    assert.equal(result.content_feedback_refresh?.last_captured_count, 1);
    assert.equal(result.content_creator_metrics?.state, "ok");
    assert.equal(result.content_creator_metrics?.last_queue_count, 1);
    assert.equal(result.content_creator_metrics?.last_captured_count, 1);
    assert.equal(result.autonomy_pause?.ref, "autonomy/runs/pause_signal.json");
    assert.equal(result.autonomy_pause?.status, "active");
    assert.equal(result.autonomy_pause?.reason, "Operator should review the current self-evolution direction.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime service status points operators to runtime bounded health", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-runtime-status-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "test-model" })
    ].join("\n") + "\n", "utf8");

    const result = await runServiceCommand({
      action: "status",
      target: "runtime",
      configDir,
      repoRoot,
      stateRoot
    }, {
      platform: "darwin",
      run: async () => ({
        stdout: "state = waiting\n",
        stderr: "",
        exitCode: 0
      })
    });

    assert.equal(result.ok, true);
    assert.equal(result.target, "runtime");
    assert.equal(result.health_command, "pnpm run runtime -- service health --target runtime");
    assert.match(result.boundary, /may inspect launchd/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeTestRuntimeBundle(root: string, sourceCommit: string, repoRoot = "/repo"): Promise<void> {
  await mkdir(join(root, "dist/apps/cli/src"), { recursive: true });
  await mkdir(join(root, "dist/packages/runtime/src"), { recursive: true });
  await mkdir(join(root, "node_modules"), { recursive: true });
  await mkdir(join(root, "config"), { recursive: true });
  await writeFile(join(root, "dist/apps/cli/src/main.js"), "export {};\n", "utf8");
  await writeFile(join(root, "dist/packages/runtime/src/service_supervisor.js"), "export {};\n", "utf8");
  await writeFile(join(root, "config/config.jsonl"), "", "utf8");
  await writeFile(join(root, "build.json"), `${JSON.stringify({
    schema_version: 1,
    target: "runtime",
    runtime_current_root: root,
    repo_root: repoRoot,
    built_at: "2026-07-14T00:00:00.000Z",
    node_version: process.version,
    source_commit: sourceCommit,
    source_commit_short: sourceCommit.slice(0, 12),
    source_branch: "develop",
    source_is_dirty: false
  })}\n`, "utf8");
}
