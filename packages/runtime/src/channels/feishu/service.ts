import { resolve } from "node:path";
import { AgentStore } from "../../../../core/src/store.js";
import { loadImageModelConfig, type RuntimeConfig } from "../../config.js";
import { OpenAICompatibleClient, OpenAICompatibleImageClient } from "../../model.js";
import { LiveAgentRunner, type DisciplineMode } from "../../runner.js";
import {
  createContentDailyLoop,
  defaultContentDailyTracks,
  shouldUseDefaultContentDailyTracks
} from "../../content_daily_service.js";
import { createContentCreatorMetricsLoop } from "../../content_creator_metrics_service.js";
import { createContentFeedbackRefreshLoop } from "../../content_feedback_refresh_service.js";
import { createReviewTickLoop } from "../../review_tick_service.js";
import { readServiceRuntimeBuild, type ServiceRuntimeBuild } from "../../service_runtime_build.js";
import { XiaohongshuMcpClient } from "../../xiaohongshu_mcp.js";
import { assertFeishuConfigReady } from "./config.js";
import { LarkSdkFeishuTransport } from "./client.js";
import { FeishuPrivateChatAdapter } from "./adapter.js";
import type { FeishuChannelConfig } from "./types.js";

export async function serveFeishuPrivateChat(args: {
  repoRoot: string;
  config: RuntimeConfig;
  feishuConfig: FeishuChannelConfig;
  configDir?: string;
  discipline?: DisciplineMode;
  service?: {
    channelId?: string;
    scenarioId?: string;
  };
  runtimeBuildPath?: string;
}): Promise<void> {
  const feishuConfig = args.feishuConfig;
  assertFeishuConfigReady(feishuConfig);
  const repoRoot = resolve(args.repoRoot);
  const store = new AgentStore(repoRoot, args.config.state.root);
  const model = new OpenAICompatibleClient(args.config.model);
  const runner = new LiveAgentRunner({
    repoRoot,
    stateRoot: args.config.state.root,
    config: args.config,
    configDir: args.configDir,
    model,
    discipline: args.discipline ?? "query_todo"
  });
  const adapter = new FeishuPrivateChatAdapter({
    config: feishuConfig,
    transport: new LarkSdkFeishuTransport(feishuConfig),
    runner,
    store,
    vaultRoot: args.config.vault,
    homeRoot: args.config.home.root,
    configDir: args.configDir
  });

  const runtimeBuild = args.runtimeBuildPath ? await readServiceRuntimeBuild(args.runtimeBuildPath) : null;
  const heartbeat = createServiceHeartbeat(store, {
    repoRoot,
    stateRoot: args.config.state.root,
    channelId: args.service?.channelId,
    scenarioId: args.service?.scenarioId,
    runtimeBuild
  });
  const reviewTickLoop = createReviewTickLoop({
    repoRoot,
    stateRoot: args.config.state.root,
    enabled: args.config.runtime.review_tick_enabled,
    intervalMs: args.config.runtime.review_tick_interval_ms,
    limit: args.config.runtime.review_tick_limit,
    vaultRoot: args.config.vault
  });
  const contentDailyLoop = createContentDailyLoop({
    repoRoot,
    stateRoot: args.config.state.root,
    enabled: args.config.runtime.content_daily_enabled,
    intervalMs: args.config.runtime.content_daily_interval_ms,
    dryRun: args.config.runtime.content_daily_dry_run,
    preflight: args.config.runtime.content_daily_preflight,
    topic: args.config.runtime.content_daily_topic,
    sourceUrls: args.config.runtime.content_daily_source_urls,
    tickers: args.config.runtime.content_daily_tickers,
    tracks: shouldUseDefaultContentDailyTracks({
      topic: args.config.runtime.content_daily_topic,
      sourceUrls: args.config.runtime.content_daily_source_urls,
      tickers: args.config.runtime.content_daily_tickers
    }) ? defaultContentDailyTracks() : undefined,
    imageModel: args.config.runtime.content_daily_image_model,
    publishAdapter: args.config.runtime.content_daily_publish_adapter,
    publishServerUrl: args.config.runtime.content_daily_publish_server_url,
    publishTool: args.config.runtime.content_daily_publish_tool,
    publishEnabled: args.config.runtime.content_daily_publish_enabled,
    externalWriteConfirmed: args.config.runtime.content_daily_external_write_confirmed,
    imageClientFactory: async () => new OpenAICompatibleImageClient(await loadImageModelConfig({
      configDir: args.configDir,
      stateRoot: args.config.state.root
    })),
    publisherFactory: async () => new XiaohongshuMcpClient({
      serverUrl: args.config.runtime.content_daily_publish_server_url
    })
  });
  const contentFeedbackRefreshLoop = createContentFeedbackRefreshLoop({
    repoRoot,
    stateRoot: args.config.state.root,
    enabled: args.config.runtime.content_feedback_refresh_enabled,
    intervalMs: args.config.runtime.content_feedback_refresh_interval_ms,
    limit: args.config.runtime.content_feedback_refresh_limit,
    minFollowUpAgeMs: args.config.runtime.content_feedback_refresh_min_follow_up_age_ms,
    serverUrl: args.config.runtime.content_feedback_refresh_server_url,
    clientFactory: async () => new XiaohongshuMcpClient({
      serverUrl: args.config.runtime.content_feedback_refresh_server_url
    })
  });
  const contentCreatorMetricsLoop = createContentCreatorMetricsLoop({
    repoRoot,
    stateRoot: args.config.state.root,
    enabled: args.config.runtime.content_creator_metrics_enabled,
    intervalMs: args.config.runtime.content_creator_metrics_interval_ms,
    limit: args.config.runtime.content_creator_metrics_limit,
    minFollowUpAgeMs: args.config.runtime.content_feedback_refresh_min_follow_up_age_ms,
    creatorUrl: args.config.runtime.content_creator_metrics_creator_url,
    browserSessionName: args.config.runtime.content_creator_metrics_browser_session_name,
    browserAutoConnect: args.config.runtime.content_creator_metrics_browser_auto_connect,
    browserCdpPort: args.config.runtime.content_creator_metrics_browser_cdp_port
  });
  await heartbeat.write("starting");
  await adapter.start();
  heartbeat.start();
  reviewTickLoop.start();
  contentDailyLoop.start();
  contentFeedbackRefreshLoop.start();
  contentCreatorMetricsLoop.start();
  console.log("Feishu private-chat WebSocket adapter is running.");
  await waitForShutdown(async () => {
    contentCreatorMetricsLoop.stop();
    contentFeedbackRefreshLoop.stop();
    contentDailyLoop.stop();
    reviewTickLoop.stop();
    heartbeat.stop();
    await heartbeat.write("stopping");
    await adapter.stop();
    await heartbeat.write("stopped");
  });
}

type HeartbeatState = "starting" | "running" | "stopping" | "stopped";

function createServiceHeartbeat(
  store: AgentStore,
  args: {
    repoRoot: string;
    stateRoot: string;
    channelId?: string;
    scenarioId?: string;
    runtimeBuild?: ServiceRuntimeBuild | null;
  }
): {
  start: () => void;
  stop: () => void;
  write: (state: HeartbeatState) => Promise<void>;
} {
  const startedAt = new Date().toISOString();
  let timer: NodeJS.Timeout | null = null;

  const write = async (state: HeartbeatState): Promise<void> => {
    const payload: Record<string, unknown> = {
      service: "im",
      state,
      pid: process.pid,
      repo_root: args.repoRoot,
      state_root: args.stateRoot,
      channel_id: args.channelId,
      scenario_id: args.scenarioId,
      started_at: startedAt,
      updated_at: new Date().toISOString()
    };
    if (args.runtimeBuild) payload.runtime_build = args.runtimeBuild;
    await store.writeJson("services/im/heartbeat.json", payload);
  };

  return {
    start: () => {
      if (timer) return;
      void write("running").catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
      timer = setInterval(() => {
        void write("running").catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : String(error));
        });
      }, 30000);
      timer.unref();
    },
    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
    write
  };
}

function waitForShutdown(onShutdown: () => Promise<void>): Promise<never> {
  return new Promise((_, reject) => {
    let handled = false;
    const cleanup = (): void => {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    };
    const handleSignal = (): void => {
      if (handled) return;
      handled = true;
      cleanup();
      onShutdown().then(() => {
        process.exit(0);
      }, reject);
    };

    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
    // The Feishu SDK owns the websocket lifecycle until the OS asks us to stop.
  });
}
