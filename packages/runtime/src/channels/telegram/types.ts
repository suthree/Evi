import type { RunResult } from "../../../../core/src/schemas.js";

export interface TelegramChannelConfig {
  channelId: string;
  botToken: string;
  allowedUserIds: string[];
  ackText: string;
  busyText: string;
  pendingText: string;
  errorText: string;
  dedupCacheSize: number;
  pollTimeoutSeconds: number;
  textChunkLimit: number;
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel" | string;
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date?: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramSendResult {
  ok: boolean;
  messageId: string | null;
  summary: string;
  raw?: unknown;
}

export interface TelegramTransport {
  start(
    onUpdate: (update: TelegramUpdate) => void | Promise<void>,
    options?: { offset?: number | null }
  ): Promise<void>;
  stop(): Promise<void>;
  sendText(chatId: string, text: string, options?: { threadId?: string | null }): Promise<TelegramSendResult>;
}

export interface TaskRunner {
  runTask(task: string, options?: { recallQuery?: string }): Promise<RunResult>;
}
