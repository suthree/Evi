import type { RunResult } from "../../../../core/src/schemas.js";

export type FeishuDomain = "feishu" | "lark";

export interface FeishuChannelConfig {
  appId: string;
  appSecret: string;
  domain: FeishuDomain;
  allowedOpenIds: string[];
  ackText: string;
  busyText: string;
  queuedText: string;
  followupQueueSize: number;
  unsupportedText: string;
  errorText: string;
  dedupCacheSize: number;
  textChunkLimit: number;
}

export interface FeishuSenderId {
  open_id?: string;
  user_id?: string;
  union_id?: string;
}

export interface FeishuInboundMessage {
  message_id: string;
  chat_id: string;
  chat_type: string;
  message_type: string;
  content: string;
  create_time?: string;
}

export interface FeishuInboundEvent {
  event_id?: string;
  sender: {
    sender_id?: FeishuSenderId;
    sender_type?: string;
  };
  message: FeishuInboundMessage;
}

export interface NormalizedFeishuPrivateMessage {
  eventId: string | null;
  messageId: string;
  chatId: string;
  openId: string;
  text: string;
  raw: FeishuInboundEvent;
}

export interface FeishuSendResult {
  ok: boolean;
  messageId: string | null;
  summary: string;
  raw?: unknown;
}

export interface FeishuTransport {
  start(onMessage: (event: FeishuInboundEvent) => void | Promise<void>): Promise<void>;
  stop(): Promise<void>;
  sendText(openId: string, text: string): Promise<FeishuSendResult>;
}

export interface TaskRunner {
  runTask(task: string): Promise<RunResult>;
}
