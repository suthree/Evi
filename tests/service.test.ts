import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildImServiceDefinition,
  parseLaunchdPid,
  renderLaunchdPlist,
  resolveServiceConfigSelectors,
  runServiceCommand
} from "../packages/runtime/src/service.js";

test("launchd plist uses explicit local runner and does not contain secrets", () => {
  const definition = buildImServiceDefinition({
    repoRoot: "/work/runtime",
    configDir: "/work/runtime/config",
    stateRoot: "/work/runtime/.runtime-state",
    homeRoot: "/home/user/.local-runtime",
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
  assert.match(plist, /<string>im<\/string>/);
  assert.match(plist, /<string>serve<\/string>/);
  assert.match(plist, /<string>--runtime-build<\/string>/);
  assert.match(plist, /<string>\/home\/user\/\.local-runtime\/service\/runtime\/current\/build\.json<\/string>/);
  assert.match(plist, /<key>LOCAL_RUNTIME_HOME<\/key>/);
  assert.doesNotMatch(plist, /tsx\/dist/);
  assert.doesNotMatch(plist, /api_key|app_secret|sk-test|cli_secret/i);
});

test("parseLaunchdPid reads launchctl print output", () => {
  assert.equal(parseLaunchdPid("state = running\npid = 12345\n"), 12345);
  assert.equal(parseLaunchdPid("state = waiting\n"), null);
});

test("service config selectors use home-scoped state by default and preserve explicit state roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-selectors-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const homeRoot = join(root, "home");
  const repoStateRoot = join(root, "repo-state");
  const explicitStateRoot = join(root, "explicit-state");
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: repoStateRoot })
    ].join("\n") + "\n", "utf8");

    const defaultSelectors = await resolveServiceConfigSelectors({
      target: "im",
      configDir
    });
    assert.equal(defaultSelectors.stateRoot, join(homeRoot, "state/runtime"));

    const explicitSelectors = await resolveServiceConfigSelectors({
      target: "im",
      configDir,
      stateRoot: explicitStateRoot
    });
    assert.equal(explicitSelectors.stateRoot, explicitStateRoot);
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
    await mkdir(join(stateRoot, "services/im"), { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "active_channel", channel_id: "feishu-main" }),
      JSON.stringify({ type: "active_scenario", scenario_id: "im-default" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(stateRoot, "services/im/heartbeat.json"), `${JSON.stringify({
      service: "im",
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
    await writeFile(join(homeRoot, "service/runtime/current/build.json"), `${JSON.stringify({
      schema_version: 1,
      target: "im",
      runtime_current_root: join(homeRoot, "service/runtime/current"),
      repo_root: repoRoot,
      built_at: "2026-06-29T00:00:10.000Z",
      node_version: "v24.0.0",
      source_commit: "0123456789abcdef0123456789abcdef01234567",
      source_commit_short: "0123456789ab",
      source_branch: "develop",
      source_is_dirty: false
    })}\n`, "utf8");
    await writeFile(join(stateRoot, "services/im/review_tick.json"), `${JSON.stringify({
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
    await writeFile(join(stateRoot, "services/im/content_daily.json"), `${JSON.stringify({
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
    await writeFile(join(stateRoot, "services/im/content_feedback_refresh.json"), `${JSON.stringify({
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
    await writeFile(join(stateRoot, "services/im/content_creator_metrics.json"), `${JSON.stringify({
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
      target: "im",
      configDir,
      repoRoot,
      stateRoot
    }, {
      platform: "darwin",
      run: async () => ({
        stdout: "state = running\npid = 12345\n",
        stderr: "",
        exitCode: 0
      })
    });

    assert.equal(result.ok, true);
    assert.equal(result.launchd?.loaded, true);
    assert.equal(result.launchd?.pid, 12345);
    assert.equal(result.heartbeat?.pid, 777);
    assert.equal(result.heartbeat?.state, "running");
    assert.equal(result.runtime?.source_commit_short, "0123456789ab");
    assert.equal(result.runtime?.source_branch, "develop");
    assert.equal(result.runtime?.source_is_dirty, false);
    assert.equal(result.runtime?.runtime_current_root, join(homeRoot, "service/runtime/current"));
    assert.equal(result.review_tick?.state, "ok");
    assert.equal(result.review_tick?.last_inbox_count, 2);
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
