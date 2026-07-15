import { z } from "zod";
import {
  loadAppSecretAuth,
  loadConfigSelectors,
  loadSettingsRecords,
  type ConfigSourceOptions
} from "../../config.js";
import type { FeishuChannelConfig } from "./types.js";

const channelRecordSchema = z.object({
  type: z.literal("channel"),
  id: z.string().min(1),
  kind: z.literal("feishu"),
  transport: z.literal("websocket").default("websocket"),
  auth_id: z.string().min(1),
  domain: z.enum(["feishu", "lark"]).default("feishu"),
  mode: z.literal("private_chat").default("private_chat"),
  allowed_open_ids: z.array(z.string()).default([]),
  ack_text: z.string().optional(),
  busy_text: z.string().optional(),
  queued_text: z.string().optional(),
  unsupported_text: z.string().optional(),
  error_text: z.string().optional(),
  followup_queue_size: z.number().int().positive().default(8),
  dedup_cache_size: z.number().int().positive().default(2048),
  text_chunk_limit: z.number().int().positive().default(3900)
});

const scenarioRecordSchema = z.object({
  type: z.literal("scenario"),
  id: z.string().min(1),
  channel_id: z.string().min(1),
  model_id: z.string().min(1).optional(),
  discipline: z.enum(["none", "query_todo"]).default("query_todo"),
  reply_policy: z.literal("final_response").default("final_response"),
  concurrency: z.literal("per_sender").default("per_sender")
});

type ChannelRecord = z.infer<typeof channelRecordSchema>;
type ScenarioRecord = z.infer<typeof scenarioRecordSchema>;

export interface FeishuChannelLoadOptions extends ConfigSourceOptions {
  channelId?: string;
  scenarioId?: string;
}

export interface FeishuScenarioConfig {
  id: string;
  channelId: string;
  modelId: string;
  discipline: "none" | "query_todo";
  replyPolicy: "final_response";
  concurrency: "per_sender";
  channel: FeishuChannelConfig;
}

export async function loadFeishuChannelConfig(options: FeishuChannelLoadOptions = {}): Promise<FeishuChannelConfig> {
  const selectors = await loadConfigSelectors(options);
  const channels = await loadSettingsRecords<ChannelRecord>(
    options,
    channelRecordSchema,
    "channel",
    (record) => record.kind === "feishu"
  );
  const channel = options.channelId
    ? selectChannel(channels, options.channelId)
    : selectChannel(channels, selectors.activeChannelId) ?? selectChannel(channels, null);
  if (!channel) throw new Error("No Feishu channel config found; add a channel record to settings.jsonl or pass --channel.");

  const auth = await loadAppSecretAuth(options, channel.auth_id);
  return {
    channelId: channel.id,
    appId: auth.appId,
    appSecret: auth.appSecret,
    domain: channel.domain,
    allowedOpenIds: channel.allowed_open_ids,
    ackText: channel.ack_text?.trim() || "收到，正在处理。",
    busyText: channel.busy_text?.trim() || "当前会话已有任务在运行，请等待完成后再发送下一条。",
    queuedText: channel.queued_text?.trim() || "当前会话已有任务在运行，这条消息已排队，会在当前任务完成后继续处理。",
    followupQueueSize: clampInt(channel.followup_queue_size, 1, 100),
    unsupportedText: channel.unsupported_text?.trim() || "第一版只支持飞书文本消息。",
    errorText: channel.error_text?.trim() || "处理这条消息时失败，请查看本地运行日志。",
    dedupCacheSize: clampInt(channel.dedup_cache_size, 32, 20000),
    textChunkLimit: clampInt(channel.text_chunk_limit, 500, 12000)
  };
}

export async function loadFeishuScenarioConfig(options: FeishuChannelLoadOptions = {}): Promise<FeishuScenarioConfig> {
  const selectors = await loadConfigSelectors(options);
  const scenarios = await loadSettingsRecords<ScenarioRecord>(options, scenarioRecordSchema, "scenario");
  const channels = await loadSettingsRecords<ChannelRecord>(
    options,
    channelRecordSchema,
    "channel",
    (record) => record.kind === "feishu"
  );
  const scenario = selectFeishuScenarioForRequest(scenarios, channels, {
    scenarioId: options.scenarioId ?? null,
    activeScenarioId: selectors.activeScenarioId,
    channelId: options.channelId ?? null
  });
  const channel = options.channelId
    ? selectChannel(channels, options.channelId)
    : scenario
      ? selectChannel(channels, scenario.channel_id)
      : selectChannel(channels, selectors.activeChannelId) ?? selectChannel(channels, null);
  if (!channel) throw new Error("No active Feishu channel found; set active_channel in config/config.jsonl or pass --channel.");
  if (scenario && scenario.channel_id !== channel.id) {
    throw new Error(`Configured Feishu scenario ${scenario.id} points to channel ${scenario.channel_id}, not selected channel ${channel.id}.`);
  }
  const modelId = scenario?.model_id ?? selectors.activeModelId;
  if (!modelId) throw new Error("No model found for Feishu scenario; set scenario.model_id or active_model.");
  return {
    id: scenario?.id ?? "default-feishu-scenario",
    channelId: channel.id,
    modelId,
    discipline: scenario?.discipline ?? "query_todo",
    replyPolicy: scenario?.reply_policy ?? "final_response",
    concurrency: scenario?.concurrency ?? "per_sender",
    channel: await loadFeishuChannelConfig({ ...options, channelId: channel.id })
  };
}

export function assertFeishuConfigReady(config: FeishuChannelConfig): void {
  if (!config.appId) throw new Error("Feishu app_id is required in auth.jsonl.");
  if (!config.appSecret) throw new Error("Feishu app_secret is required in auth.jsonl.");
}

function selectChannel(records: ChannelRecord[], channelId: string | null): ChannelRecord | null {
  if (channelId) {
    return [...records].reverse().find((item) => item.id === channelId) ?? null;
  }
  return [...records].reverse().find((item) => item.kind === "feishu") ?? null;
}

function selectScenario(records: ScenarioRecord[], scenarioId: string | null): ScenarioRecord | null {
  if (scenarioId) {
    return [...records].reverse().find((item) => item.id === scenarioId) ?? null;
  }
  return records.at(-1) ?? null;
}

function selectFeishuScenarioForRequest(
  records: ScenarioRecord[],
  channels: ChannelRecord[],
  args: { scenarioId: string | null; activeScenarioId: string | null; channelId: string | null }
): ScenarioRecord | null {
  if (args.scenarioId) return selectScenario(records, args.scenarioId);
  if (args.channelId) return [...records].reverse().find((item) => item.channel_id === args.channelId) ?? null;
  const active = selectScenario(records, args.activeScenarioId);
  if (active && hasChannel(channels, active.channel_id)) return active;
  return [...records].reverse().find((item) => hasChannel(channels, item.channel_id)) ?? null;
}

function hasChannel(records: ChannelRecord[], channelId: string): boolean {
  return records.some((item) => item.id === channelId);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
