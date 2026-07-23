import { z } from "zod";
import type { RuntimeChannelKind } from "../../core/src/runtime_channel_messages.js";
import { loadConfigSelectors, loadSettingsRecords, type ConfigSourceOptions } from "./config.js";
import { loadFeishuChannelConfig } from "./channels/feishu/config.js";
import type { FeishuChannelConfig } from "./channels/feishu/types.js";
import { loadTelegramChannelConfig } from "./channels/telegram/config.js";
import type { TelegramChannelConfig } from "./channels/telegram/types.js";
import { loadDiscordChannelConfig } from "./channels/discord/config.js";
import type { DiscordChannelConfig } from "./channels/discord/types.js";

export type ImProvider = Extract<RuntimeChannelKind, "feishu" | "telegram" | "discord">;

const imProviderSchema = z.enum(["feishu", "telegram", "discord"]);

const channelDescriptorSchema = z.object({
  type: z.literal("channel"),
  id: z.string().min(1),
  kind: imProviderSchema,
  transport: z.string().min(1).optional(),
  mode: z.string().min(1).optional()
}).passthrough();

const scenarioRecordSchema = z.object({
  type: z.literal("scenario"),
  id: z.string().min(1),
  channel_id: z.string().min(1),
  model_id: z.string().min(1).optional(),
  discipline: z.enum(["none", "query_todo"]).default("query_todo"),
  reply_policy: z.literal("final_response").default("final_response"),
  concurrency: z.literal("per_sender").default("per_sender")
});

type ChannelDescriptorRecord = z.infer<typeof channelDescriptorSchema>;
type ScenarioRecord = z.infer<typeof scenarioRecordSchema>;

export interface ImScenarioLoadOptions extends ConfigSourceOptions {
  channelId?: string;
  scenarioId?: string;
  provider?: ImProvider;
}

export interface ImScenarioBase {
  id: string;
  provider: ImProvider;
  channelId: string;
  channelDescriptor: {
    id: string;
    kind: ImProvider;
    transport?: string;
    mode?: string;
  };
}

export type FeishuImScenarioConfig = ImScenarioBase & {
  provider: "feishu";
  channel: FeishuChannelConfig;
};

export type TelegramImScenarioConfig = ImScenarioBase & {
  provider: "telegram";
  channel: TelegramChannelConfig;
};

export type DiscordImScenarioConfig = ImScenarioBase & {
  provider: "discord";
  channel: DiscordChannelConfig;
};

export type ImScenarioConfig = FeishuImScenarioConfig | TelegramImScenarioConfig | DiscordImScenarioConfig;

export async function loadImScenarioConfig(options: ImScenarioLoadOptions = {}): Promise<ImScenarioConfig> {
  const selectors = await loadConfigSelectors(options);
  const scenarios = await loadSettingsRecords<ScenarioRecord>(options, scenarioRecordSchema, "scenario");
  const channels = await loadSettingsRecords<ChannelDescriptorRecord>(options, channelDescriptorSchema, "channel");
  const scenario = selectScenarioForRequest(scenarios, channels, {
    scenarioId: options.scenarioId ?? null,
    activeScenarioId: selectors.activeScenarioId,
    channelId: options.channelId ?? null,
    provider: options.provider
  });
  const channelId = options.channelId ?? scenario?.channel_id ?? (options.provider ? null : selectors.activeChannelId);
  const channel = selectChannel(channels, channelId, options.provider);
  if (!channel) {
    throw new Error("No IM channel config found; add a channel record to settings.jsonl or pass --channel.");
  }
  if (options.provider && channel.kind !== options.provider) {
    throw new Error(`Configured IM channel ${channel.id} is ${channel.kind}, not requested provider ${options.provider}.`);
  }
  if (scenario && scenario.channel_id !== channel.id) {
    throw new Error(`Configured IM scenario ${scenario.id} points to channel ${scenario.channel_id}, not selected channel ${channel.id}.`);
  }

  const base: ImScenarioBase = {
    id: scenario?.id ?? `default-${channel.kind}-scenario`,
    provider: channel.kind,
    channelId: channel.id,
    channelDescriptor: {
      id: channel.id,
      kind: channel.kind,
      transport: channel.transport,
      mode: channel.mode
    }
  };

  if (channel.kind === "feishu") {
    return {
      ...base,
      provider: "feishu",
      channel: await loadFeishuChannelConfig({ ...options, channelId: channel.id })
    };
  }
  if (channel.kind === "telegram") {
    return {
      ...base,
      provider: "telegram",
      channel: await loadTelegramChannelConfig({ ...options, channelId: channel.id })
    };
  }
  if (channel.kind === "discord") {
    return {
      ...base,
      provider: "discord",
      channel: await loadDiscordChannelConfig({ ...options, channelId: channel.id })
    };
  }
  throw new Error(`Unsupported IM channel kind: ${channel.kind}`);
}

export function parseImProvider(value: string): ImProvider {
  const parsed = imProviderSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(`Unsupported IM provider: ${value}`);
}

function selectChannel(
  records: ChannelDescriptorRecord[],
  channelId: string | null,
  provider?: ImProvider
): ChannelDescriptorRecord | null {
  if (channelId) return [...records].reverse().find((item) => item.id === channelId) ?? null;
  if (provider) return [...records].reverse().find((item) => item.kind === provider) ?? null;
  return [...records].reverse().find((item) => item.kind === "feishu") ?? records.at(-1) ?? null;
}

function selectScenario(records: ScenarioRecord[], scenarioId: string | null): ScenarioRecord | null {
  if (scenarioId) {
    return [...records].reverse().find((item) => item.id === scenarioId) ?? null;
  }
  return records.at(-1) ?? null;
}

function selectScenarioForRequest(
  records: ScenarioRecord[],
  channels: ChannelDescriptorRecord[],
  args: {
    scenarioId: string | null;
    activeScenarioId: string | null;
    channelId: string | null;
    provider?: ImProvider;
  }
): ScenarioRecord | null {
  if (args.scenarioId) return selectScenario(records, args.scenarioId);
  if (args.channelId) return selectScenarioByChannel(records, args.channelId);
  if (!args.provider) return selectScenario(records, args.activeScenarioId);

  const active = selectScenario(records, args.activeScenarioId);
  if (active && channelKind(channels, active.channel_id) === args.provider) return active;
  return [...records].reverse().find((item) => channelKind(channels, item.channel_id) === args.provider) ?? null;
}

function selectScenarioByChannel(records: ScenarioRecord[], channelId: string): ScenarioRecord | null {
  return [...records].reverse().find((item) => item.channel_id === channelId) ?? null;
}

function channelKind(records: ChannelDescriptorRecord[], channelId: string): ImProvider | null {
  return [...records].reverse().find((item) => item.id === channelId)?.kind ?? null;
}
