import { resolve } from "node:path";
import { AgentStore } from "../../core/src/store.js";
import { loadImageModelConfig, type RuntimeConfig } from "./config.js";
import {
  createContentDailyLoop,
  defaultContentDailyTracks,
  shouldUseDefaultContentDailyTracks
} from "./content_daily_service.js";
import { createContentCreatorMetricsLoop } from "./content_creator_metrics_service.js";
import { createContentFeedbackRefreshLoop } from "./content_feedback_refresh_service.js";
import { RuntimeMessageGateway, type RuntimeChannelAdapter, type RuntimeChannelHealth } from "./message_gateway.js";
import { createRuntimeImAdapter } from "./im_adapters.js";
import type { ImScenarioConfig } from "./im_config.js";
import { OpenAICompatibleClient, OpenAICompatibleImageClient } from "./model.js";
import { createReviewTickLoop } from "./review_tick_service.js";
import { LiveAgentRunner, type DisciplineMode } from "./runner.js";
import { createRuntimeTaskQueueWorker } from "./runtime_task_queue_worker.js";
import { readServiceRuntimeBuild, type ServiceRuntimeBuild } from "./service_runtime_build.js";
import { startRuntimeWebConsole, type RuntimeWebConsoleHandle } from "./web_console.js";
import { XiaohongshuMcpClient } from "./xiaohongshu_mcp.js";

export type RuntimeDaemonTarget = "runtime";

export interface RuntimeDaemonOptions {
  repoRoot: string;
  config: RuntimeConfig;
  configDir?: string;
  discipline?: DisciplineMode;
  target?: RuntimeDaemonTarget;
  service?: {
    channelId?: string;
    scenarioId?: string;
  };
  runtimeBuildPath?: string;
  im?: {
    enabled?: boolean;
    scenario: ImScenarioConfig;
  };
  web?: {
    enabled?: boolean;
    host?: string;
    port?: number;
  };
}

export interface RuntimeDaemonHandle {
  gateway: RuntimeMessageGateway;
  stop(): Promise<void>;
}

type HeartbeatState = "starting" | "running" | "stopping" | "stopped" | "error";

export async function startRuntimeDaemon(args: RuntimeDaemonOptions): Promise<RuntimeDaemonHandle> {
  const target = args.target ?? "runtime";
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
  const adapters: RuntimeChannelAdapter[] = [];

  if (args.im?.enabled !== false && args.im?.scenario) {
    adapters.push(createRuntimeImAdapter({
      scenario: args.im.scenario,
      runner,
      store,
      vaultRoot: args.config.vault,
      homeRoot: args.config.home.root,
      configDir: args.configDir
    }));
  }

  if (args.web?.enabled) {
    adapters.push(createWebConsoleChannel({
      store,
      runner,
      host: args.web.host,
      port: args.web.port
    }));
  }

  const gateway = new RuntimeMessageGateway(adapters);
  const runtimeBuild = args.runtimeBuildPath ? await readServiceRuntimeBuild(args.runtimeBuildPath) : null;
  const heartbeat = createServiceHeartbeat(store, {
    target,
    repoRoot,
    stateRoot: args.config.state.root,
    channelId: args.service?.channelId,
    scenarioId: args.service?.scenarioId,
    runtimeBuild,
    gatewayHealth: () => gateway.health()
  });
  const reviewTickLoop = createReviewTickLoop({
    repoRoot,
    stateRoot: args.config.state.root,
    enabled: args.config.runtime.review_tick_enabled,
    intervalMs: args.config.runtime.review_tick_interval_ms,
    limit: args.config.runtime.review_tick_limit,
    vaultRoot: args.config.vault,
    statusRef: serviceRef(target, "review_tick.json")
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
    statusRef: serviceRef(target, "content_daily.json"),
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
    statusRef: serviceRef(target, "content_feedback_refresh.json"),
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
    browserCdpPort: args.config.runtime.content_creator_metrics_browser_cdp_port,
    statusRef: serviceRef(target, "content_creator_metrics.json")
  });
  const taskQueueWorker = createRuntimeTaskQueueWorker({
    store,
    runTask: async (task) => runner.runTask(task),
    statusRef: serviceRef(target, "task_queue.json")
  });

  await heartbeat.write("starting");
  try {
    await gateway.start();
  } catch (error) {
    await heartbeat.write("error", errorMessage(error));
    throw error;
  }
  heartbeat.start();
  taskQueueWorker.start();
  reviewTickLoop.start();
  contentDailyLoop.start();
  contentFeedbackRefreshLoop.start();
  contentCreatorMetricsLoop.start();

  let stopped = false;
  return {
    gateway,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      contentCreatorMetricsLoop.stop();
      contentFeedbackRefreshLoop.stop();
      contentDailyLoop.stop();
      reviewTickLoop.stop();
      taskQueueWorker.stop();
      heartbeat.stop();
      await heartbeat.write("stopping");
      await gateway.stop();
      await heartbeat.write("stopped");
    }
  };
}

export async function serveRuntimeDaemon(args: RuntimeDaemonOptions): Promise<void> {
  const target = args.target ?? "runtime";
  const handle = await startRuntimeDaemon(args);
  console.log(`Runtime daemon is running for target ${target}.`);
  await waitForShutdown(handle.stop);
}

function createWebConsoleChannel(args: {
  store: AgentStore;
  runner: LiveAgentRunner;
  host?: string;
  port?: number;
}): RuntimeChannelAdapter {
  let handle: RuntimeWebConsoleHandle | null = null;
  let error: string | undefined;
  const channelId = `${args.host ?? "127.0.0.1"}:${args.port ?? 8765}`;
  return {
    kind: "web",
    channelId,
    start: async () => {
      error = undefined;
      try {
        handle = await startRuntimeWebConsole({
          store: args.store,
          host: args.host,
          port: args.port,
          runTask: async (task, runArgs) => args.runner.runTask(runArgs.runtimeSessionId
            ? [
              "Runtime session task submitted from the local web console.",
              `Runtime session ID: ${runArgs.runtimeSessionId}`,
              "",
              "Task:",
              task
            ].join("\n")
            : task)
        });
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        throw caught;
      }
    },
    stop: async () => {
      await handle?.close();
      handle = null;
    },
    health: (): RuntimeChannelHealth => ({
      kind: "web",
      channel_id: channelId,
      state: error ? "error" : handle ? "running" : "stopped",
      detail: error ?? handle?.url
    })
  };
}

function createServiceHeartbeat(
  store: AgentStore,
  args: {
    target: RuntimeDaemonTarget;
    repoRoot: string;
    stateRoot: string;
    channelId?: string;
    scenarioId?: string;
    runtimeBuild?: ServiceRuntimeBuild | null;
    gatewayHealth?: () => unknown;
  }
): {
  start: () => void;
  stop: () => void;
  write: (state: HeartbeatState, error?: string) => Promise<void>;
} {
  const startedAt = new Date().toISOString();
  let timer: NodeJS.Timeout | null = null;

  const write = async (state: HeartbeatState, error?: string): Promise<void> => {
    const payload: Record<string, unknown> = {
      service: args.target,
      state,
      pid: process.pid,
      repo_root: args.repoRoot,
      state_root: args.stateRoot,
      channel_id: args.channelId,
      scenario_id: args.scenarioId,
      gateway: args.gatewayHealth?.(),
      started_at: startedAt,
      updated_at: new Date().toISOString()
    };
    if (args.runtimeBuild) payload.runtime_build = args.runtimeBuild;
    if (error) payload.error = error;
    await store.writeJson(serviceRef(args.target, "heartbeat.json"), payload);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serviceRef(target: RuntimeDaemonTarget, file: string): string {
  return `services/${target}/${file}`;
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
  });
}
