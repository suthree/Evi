import type { SkillResolverLike } from "../../core/src/skill_resolver.js";
import type { AgentStore } from "../../core/src/store.js";
import { FeishuPrivateChatAdapter } from "./channels/feishu/adapter.js";
import { LarkSdkFeishuTransport } from "./channels/feishu/client.js";
import { assertFeishuConfigReady } from "./channels/feishu/config.js";
import type { FeishuChannelConfig, FeishuTransport } from "./channels/feishu/types.js";
import { TelegramBotAdapter } from "./channels/telegram/adapter.js";
import { TelegramBotApiTransport } from "./channels/telegram/client.js";
import { assertTelegramConfigReady } from "./channels/telegram/config.js";
import type { TelegramChannelConfig, TelegramTransport } from "./channels/telegram/types.js";
import { DiscordBotAdapter } from "./channels/discord/adapter.js";
import { DiscordGatewayTransport } from "./channels/discord/client.js";
import { assertDiscordConfigReady } from "./channels/discord/config.js";
import type { DiscordChannelConfig, DiscordTransport } from "./channels/discord/types.js";
import type { DiscordImScenarioConfig, FeishuImScenarioConfig, ImScenarioConfig, TelegramImScenarioConfig } from "./im_config.js";
import type { GoalInteractionPort } from "./goal_ingress.js";
import type { RuntimeChannelAdapter } from "./message_gateway.js";

export interface RuntimeImAdapterOptions {
  scenario: ImScenarioConfig;
  store: AgentStore;
  goalIngress: GoalInteractionPort;
  vaultRoot?: SkillResolverLike;
  homeRoot?: string;
  configDir?: string;
  feishuTransportFactory?: (config: FeishuChannelConfig) => FeishuTransport;
  telegramTransportFactory?: (config: TelegramChannelConfig) => TelegramTransport;
  discordTransportFactory?: (config: DiscordChannelConfig) => DiscordTransport;
}

export function assertRuntimeImAdapterSupported(
  scenario: ImScenarioConfig
): asserts scenario is FeishuImScenarioConfig | TelegramImScenarioConfig | DiscordImScenarioConfig {
  void scenario;
}

export function createRuntimeImAdapter(args: RuntimeImAdapterOptions): RuntimeChannelAdapter {
  assertRuntimeImAdapterSupported(args.scenario);
  if (args.scenario.provider === "feishu") {
    assertFeishuConfigReady(args.scenario.channel);
    return new FeishuPrivateChatAdapter({
      config: args.scenario.channel,
      transport: args.feishuTransportFactory?.(args.scenario.channel) ?? new LarkSdkFeishuTransport(args.scenario.channel),
      goalIngress: args.goalIngress,
      store: args.store,
      vaultRoot: args.vaultRoot,
      homeRoot: args.homeRoot,
      configDir: args.configDir
    });
  }
  if (args.scenario.provider === "telegram") {
    assertTelegramConfigReady(args.scenario.channel);
    return new TelegramBotAdapter({
      config: args.scenario.channel,
      transport: args.telegramTransportFactory?.(args.scenario.channel) ?? new TelegramBotApiTransport(args.scenario.channel),
      goalIngress: args.goalIngress,
      store: args.store
    });
  }
  assertDiscordConfigReady(args.scenario.channel);
  return new DiscordBotAdapter({
    config: args.scenario.channel,
    transport: args.discordTransportFactory?.(args.scenario.channel) ?? new DiscordGatewayTransport(args.scenario.channel),
    goalIngress: args.goalIngress,
    store: args.store
  });
}
