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
  const channels = await loadSettingsRecords<ChannelRecord>(options, channelRecordSchema, "channel");
  const channel = selectChannel(channels, options.channelId ?? selectors.activeChannelId);
  if (!channel) throw new Error("No Feishu channel config found; add a channel record to settings.jsonl or pass --channel.");

  const auth = await loadAppSecretAuth(options, channel.auth_id);
  return {
    appId: auth.appId,
    appSecret: auth.appSecret,
    domain: channel.domain,
    allowedOpenIds: channel.allowed_open_ids,
    ackText: channel.ack_text?.trim() || "收到，正在处理。",
    busyText: channel.busy_text?.trim() || "当前会话已有任务在运行，请等待完成后再发送下一条。",
    queuedText: channel.queued_text?.trim() || "当前会话已有任务在运行，这条消息已排队，会在当前任务完成后继续处理。",
    followupQueueSize: clampInt(channel.followup_queue_size, 1, 100),
    unsupportedText: channel.unsupported_text?.trim() || "第一版只支持飞书私聊文本消息。",
    errorText: channel.error_text?.trim() || "处理这条消息时失败，请查看本地运行日志。",
    dedupCacheSize: clampInt(channel.dedup_cache_size, 32, 20000),
    textChunkLimit: clampInt(channel.text_chunk_limit, 500, 12000)
  };
}

export async function loadFeishuScenarioConfig(options: FeishuChannelLoadOptions = {}): Promise<FeishuScenarioConfig> {
  const selectors = await loadConfigSelectors(options);
  const scenarios = await loadSettingsRecords<ScenarioRecord>(options, scenarioRecordSchema, "scenario");
  const scenario = selectScenario(scenarios, options.scenarioId ?? selectors.activeScenarioId);
  const channelId = options.channelId ?? scenario?.channel_id ?? selectors.activeChannelId;
  if (!channelId) throw new Error("No active Feishu channel found; set active_channel in config/config.jsonl or pass --channel.");
  const modelId = scenario?.model_id ?? selectors.activeModelId;
  if (!modelId) throw new Error("No model found for Feishu scenario; set scenario.model_id or active_model.");
  return {
    id: scenario?.id ?? "default-feishu-scenario",
    channelId,
    modelId,
    discipline: scenario?.discipline ?? "query_todo",
    replyPolicy: scenario?.reply_policy ?? "final_response",
    concurrency: scenario?.concurrency ?? "per_sender",
    channel: await loadFeishuChannelConfig({ ...options, channelId })
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

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
