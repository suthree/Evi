
export interface DiscordChannelConfig {
  channelId: string;
  botToken: string;
  botUserId?: string;
  allowedUserIds: string[];
  allowedGuildIds: string[];
  gatewayUrl: string;
  apiBaseUrl: string;
  intents: number;
  ackText: string;
  busyText: string;
  pendingText: string;
  errorText: string;
  dedupCacheSize: number;
  textChunkLimit: number;
}

export interface DiscordUser {
  id: string;
  username?: string;
  bot?: boolean;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  content?: string;
  timestamp?: string;
  author?: DiscordUser;
}

export interface DiscordGatewayReady {
  user?: DiscordUser;
}

export interface DiscordSendResult {
  ok: boolean;
  messageId: string | null;
  summary: string;
  raw?: unknown;
}

export interface DiscordTransport {
  start(onMessage: (message: DiscordMessage) => void | Promise<void>): Promise<void>;
  stop(): Promise<void>;
  sendText(channelId: string, text: string): Promise<DiscordSendResult>;
}
