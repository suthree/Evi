import { z } from "zod";
import { loadApiKeyAuth, loadConfigSelectors, loadSettingsRecords, type ConfigSourceOptions } from "../../config.js";
import type { TelegramChannelConfig } from "./types.js";

const channelRecordSchema = z.object({
  type: z.literal("channel"),
  id: z.string().min(1),
  kind: z.literal("telegram"),
  transport: z.literal("long_poll").default("long_poll"),
  auth_id: z.string().min(1),
  mode: z.literal("bot").default("bot"),
  allowed_user_ids: z.array(z.union([z.string(), z.number()])).default([]),
  ack_text: z.string().optional(),
  busy_text: z.string().optional(),
  pending_text: z.string().optional(),
  error_text: z.string().optional(),
  dedup_cache_size: z.number().int().positive().default(2048),
  poll_timeout_seconds: z.number().int().positive().default(25),
  text_chunk_limit: z.number().int().positive().default(3900)
});

type ChannelRecord = z.infer<typeof channelRecordSchema>;

export interface TelegramChannelLoadOptions extends ConfigSourceOptions {
  channelId?: string;
}

export async function loadTelegramChannelConfig(
  options: TelegramChannelLoadOptions = {}
): Promise<TelegramChannelConfig> {
  const selectors = await loadConfigSelectors(options);
  const channels = await loadSettingsRecords<ChannelRecord>(
    options,
    channelRecordSchema,
    "channel",
    (record) => record.kind === "telegram"
  );
  const channel = options.channelId
    ? selectChannel(channels, options.channelId)
    : selectChannel(channels, selectors.activeChannelId) ?? selectChannel(channels, null);
  if (!channel) throw new Error("No Telegram channel config found; add a channel record to settings.jsonl or pass --channel.");
  const auth = await loadApiKeyAuth(options, channel.auth_id);
  return {
    channelId: channel.id,
    botToken: auth.apiKey,
    allowedUserIds: channel.allowed_user_ids.map((item) => String(item)),
    ackText: channel.ack_text?.trim() || "收到，正在处理。",
    busyText: channel.busy_text?.trim() || "当前会话已有任务在运行，请等待完成后再发送下一条。",
    pendingText: channel.pending_text?.trim() || "已记录到 pending runtime session，请发送 /session use <profile> 绑定角色后再执行。",
    errorText: channel.error_text?.trim() || "处理这条消息时失败，请查看本地运行日志。",
    dedupCacheSize: clampInt(channel.dedup_cache_size, 32, 20000),
    pollTimeoutSeconds: clampInt(channel.poll_timeout_seconds, 1, 50),
    textChunkLimit: clampInt(channel.text_chunk_limit, 500, 12000)
  };
}

export function assertTelegramConfigReady(config: TelegramChannelConfig): void {
  if (!config.botToken) throw new Error("Telegram bot token is required in auth.jsonl.");
}

function selectChannel(records: ChannelRecord[], channelId: string | null): ChannelRecord | null {
  if (channelId) return [...records].reverse().find((item) => item.id === channelId) ?? null;
  return [...records].reverse().find((item) => item.kind === "telegram") ?? null;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
