import { z } from "zod";
import { loadApiKeyAuth, loadConfigSelectors, loadSettingsRecords, type ConfigSourceOptions } from "../../config.js";
import type { DiscordChannelConfig } from "./types.js";

const DEFAULT_DISCORD_INTENTS = (1 << 9) | (1 << 12) | (1 << 15);

const channelRecordSchema = z.object({
  type: z.literal("channel"),
  id: z.string().min(1),
  kind: z.literal("discord"),
  transport: z.literal("gateway").default("gateway"),
  auth_id: z.string().min(1),
  mode: z.literal("bot").default("bot"),
  bot_user_id: z.string().min(1).optional(),
  allowed_user_ids: z.array(z.union([z.string(), z.number()])).default([]),
  allowed_guild_ids: z.array(z.union([z.string(), z.number()])).default([]),
  gateway_url: z.string().url().default("wss://gateway.discord.gg/?v=10&encoding=json"),
  api_base_url: z.string().url().default("https://discord.com/api/v10"),
  intents: z.number().int().positive().default(DEFAULT_DISCORD_INTENTS),
  ack_text: z.string().optional(),
  busy_text: z.string().optional(),
  pending_text: z.string().optional(),
  error_text: z.string().optional(),
  dedup_cache_size: z.number().int().positive().default(2048),
  text_chunk_limit: z.number().int().positive().default(1900)
});

type ChannelRecord = z.infer<typeof channelRecordSchema>;

export interface DiscordChannelLoadOptions extends ConfigSourceOptions {
  channelId?: string;
}

export async function loadDiscordChannelConfig(
  options: DiscordChannelLoadOptions = {}
): Promise<DiscordChannelConfig> {
  const selectors = await loadConfigSelectors(options);
  const channels = await loadSettingsRecords<ChannelRecord>(
    options,
    channelRecordSchema,
    "channel",
    (record) => record.kind === "discord"
  );
  const channel = options.channelId
    ? selectChannel(channels, options.channelId)
    : selectChannel(channels, selectors.activeChannelId) ?? selectChannel(channels, null);
  if (!channel) throw new Error("No Discord channel config found; add a channel record to settings.jsonl or pass --channel.");
  const auth = await loadApiKeyAuth(options, channel.auth_id);
  return {
    channelId: channel.id,
    botToken: auth.apiKey,
    botUserId: channel.bot_user_id,
    allowedUserIds: channel.allowed_user_ids.map((item) => String(item)),
    allowedGuildIds: channel.allowed_guild_ids.map((item) => String(item)),
    gatewayUrl: channel.gateway_url,
    apiBaseUrl: channel.api_base_url.replace(/\/+$/, ""),
    intents: channel.intents,
    ackText: channel.ack_text?.trim() || "收到，正在处理。",
    busyText: channel.busy_text?.trim() || "当前会话已有任务在运行，请等待完成后再发送下一条。",
    pendingText: channel.pending_text?.trim() || "已记录到 pending runtime session，请发送 /session use <profile> 绑定角色后再执行。",
    errorText: channel.error_text?.trim() || "处理这条消息时失败，请查看本地运行日志。",
    dedupCacheSize: clampInt(channel.dedup_cache_size, 32, 20000),
    textChunkLimit: clampInt(channel.text_chunk_limit, 500, 2000)
  };
}

export function assertDiscordConfigReady(config: DiscordChannelConfig): void {
  if (!config.botToken) throw new Error("Discord bot token is required in auth.jsonl.");
}

function selectChannel(records: ChannelRecord[], channelId: string | null): ChannelRecord | null {
  if (channelId) return [...records].reverse().find((item) => item.id === channelId) ?? null;
  return [...records].reverse().find((item) => item.kind === "discord") ?? null;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
