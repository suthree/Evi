import type { RuntimeConfig } from "../../config.js";
import type { DisciplineMode } from "../../runner.js";
import { serveRuntimeDaemon } from "../../runtime_daemon.js";
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
  await serveRuntimeDaemon({
    repoRoot: args.repoRoot,
    config: args.config,
    configDir: args.configDir,
    discipline: args.discipline,
    target: "runtime",
    service: args.service,
    runtimeBuildPath: args.runtimeBuildPath,
    im: {
      scenario: {
        id: args.service?.scenarioId ?? "default-feishu-scenario",
        provider: "feishu",
        channelId: args.service?.channelId ?? args.feishuConfig.channelId ?? "feishu",
        modelId: args.config.model.id,
        discipline: args.discipline ?? "query_todo",
        replyPolicy: "final_response",
        concurrency: "per_sender",
        channelDescriptor: {
          id: args.service?.channelId ?? args.feishuConfig.channelId ?? "feishu",
          kind: "feishu",
          transport: "websocket",
          mode: "private_chat"
        },
        channel: args.feishuConfig
      }
    },
    web: {
      enabled: false
    }
  });
}
