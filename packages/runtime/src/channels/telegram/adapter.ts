import { recordRuntimeChannelOutboundDelivery, type RuntimeChannelOutboundRecord } from "../../../../core/src/runtime_channel_outbox.js";
import type { RuntimeChannelSource } from "../../../../core/src/runtime_channel_messages.js";
import type { RuntimeSessionRecord, RuntimeSessionSource } from "../../../../core/src/runtime_sessions.js";
import { AgentStore } from "../../../../core/src/store.js";
import { utcNow } from "../../../../core/src/ids.js";
import { dispatchRuntimeChannelMessage } from "../../channel_message_dispatcher.js";
import type { RuntimeChannelAdapter, RuntimeChannelHealth } from "../../message_gateway.js";
import { drainRuntimeChannelOutboxForAdapter } from "../../runtime_channel_outbox_drainer.js";
import { renderGoalIngressPresentation, type GoalIngressPort } from "../../goal_ingress.js";
import type {
  TelegramChannelConfig,
  TelegramMessage,
  TelegramSendResult,
  TelegramTransport,
  TelegramUpdate
} from "./types.js";

interface TelegramOffsetState {
  next_update_id: number;
}

export class TelegramBotAdapter implements RuntimeChannelAdapter {
  readonly kind = "telegram" as const;
  readonly channelId: string;
  private readonly config: TelegramChannelConfig;
  private readonly transport: TelegramTransport;
  private readonly goalIngress: GoalIngressPort;
  private readonly store: AgentStore;
  private readonly activeRuntimeSessionIds = new Set<string>();
  private readonly seenUpdateIds: number[] = [];
  private readonly seenSet = new Set<number>();
  private running = false;
  private offset: number | null = null;
  private outboxPollTimer: ReturnType<typeof setInterval> | null = null;
  private outboxDrainActive = false;

  constructor(args: {
    config: TelegramChannelConfig;
    transport: TelegramTransport;
    goalIngress: GoalIngressPort;
    store: AgentStore;
  }) {
    this.config = args.config;
    this.channelId = args.config.channelId;
    this.transport = args.transport;
    this.goalIngress = args.goalIngress;
    this.store = args.store;
  }

  async start(): Promise<void> {
    await this.store.ensureLayout();
    await this.loadOffset();
    await this.transport.start((update) => {
      void this.handleUpdate(update);
    }, { offset: this.offset });
    this.running = true;
    await this.drainRuntimeChannelOutbox();
    this.startOutboxPoll();
  }

  async stop(): Promise<void> {
    this.stopOutboxPoll();
    try {
      await this.transport.stop();
    } finally {
      this.running = false;
    }
  }

  health(): RuntimeChannelHealth {
    return {
      kind: this.kind,
      channel_id: this.channelId,
      state: this.running ? "running" : "stopped",
      detail: `telegram:${this.channelId}`
    };
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (this.offset !== null && update.update_id < this.offset) return;
    if (this.isDuplicate(update.update_id)) return;
    this.markSeen(update.update_id);
    await this.saveOffset(update.update_id + 1);

    const message = normalizeTelegramTextMessage(update);
    if (!message) {
      await this.recordEvent("ignored", "Ignored non-text Telegram update.", { update_id: update.update_id });
      return;
    }

    const actorAuthorized = this.isAllowed(message.actorId);
    const dispatched = await dispatchRuntimeChannelMessage(this.store, {
      message: {
        source: this.telegramSessionSource(message),
        messageId: message.messageId,
        text: message.text,
        createdAt: message.createdAt
      },
      actorAuthorized
    });

    if (dispatched.kind === "denied") {
      await this.recordEvent("denied", `Denied Telegram message ${message.messageId}.`, {
        message_id: message.messageId,
        chat_id: message.chatId,
        actor_id: message.actorId,
        reason: dispatched.reason
      });
      return;
    }

    if (dispatched.kind === "session_bound") {
      const outbound = await this.sendChunks(message, [
        `已绑定 runtime session: ${dispatched.session.id}`,
        `profile: ${dispatched.binding.profile}`,
        "后续普通消息会进入 inbox；使用 /run 才会执行任务。"
      ].join("\n"));
      await this.recordEvent("session_bound", `Bound Telegram chat ${message.chatId} to runtime session ${dispatched.session.id}.`, {
        message_id: message.messageId,
        runtime_session_id: dispatched.session.id,
        outbound
      });
      return;
    }

    if (dispatched.kind === "session_pending") {
      if (dispatched.notify) {
        const outbound = await this.sendChunks(message, this.config.pendingText);
        await this.recordEvent("session_pending", `Created pending Telegram runtime session ${dispatched.session.id}.`, {
          message_id: message.messageId,
          runtime_session_id: dispatched.session.id,
          outbound
        });
      }
      return;
    }

    if (dispatched.kind === "session_inbox") {
      await this.recordEvent("session_inbox", `Recorded Telegram message ${message.messageId} in runtime session inbox.`, {
        message_id: message.messageId,
        runtime_session_id: dispatched.session.id
      });
      return;
    }

    await this.runRuntimeSessionMessage(message, dispatched.session, dispatched.taskText);
  }

  async drainRuntimeChannelOutbox(limit = 10): Promise<{
    queued_count: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    outbox_ids: string[];
  }> {
    if (this.outboxDrainActive) {
      return { queued_count: 0, sent_count: 0, failed_count: 0, skipped_count: 1, outbox_ids: [] };
    }
    this.outboxDrainActive = true;
    try {
      return await drainRuntimeChannelOutboxForAdapter(this.store, {
        sourceKind: "telegram",
        channelId: this.channelId,
        limit,
        deliver: (entry, source) => this.deliverOutbox(entry, source)
      });
    } finally {
      this.outboxDrainActive = false;
    }
  }

  private async runRuntimeSessionMessage(
    message: NormalizedTelegramTextMessage,
    session: RuntimeSessionRecord,
    taskText: string
  ): Promise<void> {
    if (this.activeRuntimeSessionIds.has(session.id)) {
      const outbound = await this.sendChunks(message, this.config.busyText);
      await this.recordEvent("session_busy", `Rejected concurrent Telegram runtime session message ${message.messageId}.`, {
        message_id: message.messageId,
        runtime_session_id: session.id,
        outbound
      });
      return;
    }

    this.activeRuntimeSessionIds.add(session.id);
    try {
      await this.sendChunks(message, this.config.ackText);
      const goal = await this.goalIngress.submit(renderTelegramTask(message, session, taskText));
      const finalText = renderGoalIngressPresentation(goal);
      const sends = await this.sendChunks(message, finalText);
      const ref = await this.store.writeJson(`channels/telegram/outbound/${message.messageId}.json`, {
        source_message_id: message.messageId,
        chat_id: message.chatId,
        thread_id: message.threadId,
        runtime_session_id: session.id,
        goal_id: goal.goal_id,
        goal_status: goal.status,
        receipt_id: goal.receipt?.id ?? null,
        text: finalText,
        sends,
        created_at: utcNow()
      });
      await this.recordEvent("goal_delivered", `Delivered Telegram Goal ${goal.goal_id}.`, {
        message_id: message.messageId, runtime_session_id: session.id, goal_id: goal.goal_id,
        goal_status: goal.status, receipt_id: goal.receipt?.id ?? null, provider_delivery_ref: ref,
        provider_message_ids: sentMessageIds(sends)
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      const sends = await this.sendChunks(message, this.config.errorText);
      const ref = await this.store.writeJson(`channels/telegram/errors/${message.messageId}.json`, {
        message_id: message.messageId,
        chat_id: message.chatId,
        error: messageText,
        sends,
        created_at: utcNow()
      });
      await this.recordEvent("error", `Telegram runtime session message ${message.messageId} failed: ${messageText}`, {
        message_id: message.messageId,
        runtime_session_id: session.id,
        error: messageText,
        provider_delivery_ref: ref,
        provider_message_ids: sentMessageIds(sends)
      });
    } finally {
      this.activeRuntimeSessionIds.delete(session.id);
    }
  }

  private async sendChunks(message: NormalizedTelegramTextMessage, text: string): Promise<TelegramSendResult[]> {
    return this.sendChunksToChat(message.chatId, text, message.threadId);
  }

  private async sendChunksToChat(chatId: string, text: string, threadId?: string | null): Promise<TelegramSendResult[]> {
    const chunks = splitText(text, this.config.textChunkLimit);
    const results: TelegramSendResult[] = [];
    for (const chunk of chunks) {
      results.push(await this.transport.sendText(chatId, chunk, { threadId }));
    }
    return results;
  }

  private telegramSessionSource(message: NormalizedTelegramTextMessage, profile?: string): RuntimeSessionSource {
    return {
      kind: "telegram",
      channelId: this.channelId,
      conversationType: message.chatType,
      conversationId: message.chatId,
      threadId: message.threadId,
      actorId: message.actorId,
      profile
    };
  }

  private async deliverOutbox(
    entry: RuntimeChannelOutboundRecord,
    source: RuntimeChannelSource
  ): Promise<RuntimeChannelOutboundRecord> {
    try {
      const sends = await this.sendChunksToChat(source.conversationId, entry.text, source.threadId);
      const failed = sends.find((send) => !send.ok);
      const ref = await this.store.writeJson(`channels/telegram/outbox/${entry.id}.json`, {
        outbox_id: entry.id,
        source_route_key: entry.source_route_key,
        source_key: entry.source_key,
        runtime_session_id: entry.runtime_session_id,
        task_run_id: entry.task_run_id,
        purpose: entry.purpose,
        text: entry.text,
        sends,
        created_at: utcNow()
      });
      if (failed) {
        return recordRuntimeChannelOutboundDelivery(this.store, entry, {
          status: "failed",
          providerDeliveryRef: ref,
          providerMessageIds: sentMessageIds(sends),
          error: failed.summary
        });
      }
      return recordRuntimeChannelOutboundDelivery(this.store, entry, {
        status: "sent",
        providerDeliveryRef: ref,
        providerMessageIds: sentMessageIds(sends)
      });
    } catch (error) {
      return recordRuntimeChannelOutboundDelivery(this.store, entry, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }


  private isAllowed(actorId: string | null): boolean {
    if (!actorId) return false;
    return this.config.allowedUserIds.length === 0 || this.config.allowedUserIds.includes(actorId);
  }

  private async loadOffset(): Promise<void> {
    const state = await this.store.readStateJson<TelegramOffsetState>("channels/telegram/offset.json");
    this.offset = state?.next_update_id ?? null;
  }

  private async saveOffset(nextUpdateId: number): Promise<void> {
    this.offset = nextUpdateId;
    await this.store.writeJson("channels/telegram/offset.json", {
      next_update_id: nextUpdateId,
      updated_at: utcNow()
    });
  }

  private isDuplicate(updateId: number): boolean {
    return this.seenSet.has(updateId);
  }

  private markSeen(updateId: number): void {
    this.seenSet.add(updateId);
    this.seenUpdateIds.push(updateId);
    while (this.seenUpdateIds.length > this.config.dedupCacheSize) {
      const removed = this.seenUpdateIds.shift();
      if (removed !== undefined) this.seenSet.delete(removed);
    }
  }

  private startOutboxPoll(): void {
    if (this.outboxPollTimer) return;
    this.outboxPollTimer = setInterval(() => {
      void this.drainRuntimeChannelOutbox().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    }, 5000);
    this.outboxPollTimer.unref?.();
  }

  private stopOutboxPoll(): void {
    if (!this.outboxPollTimer) return;
    clearInterval(this.outboxPollTimer);
    this.outboxPollTimer = null;
  }

  private async recordEvent(kind: string, summary: string, details: Record<string, unknown> = {}): Promise<void> {
    await this.store.appendJsonl("channels/telegram/events.jsonl", {
      type: "telegram_channel_event",
      kind,
      summary,
      details,
      created_at: utcNow()
    });
  }
}

interface NormalizedTelegramTextMessage {
  updateId: number;
  messageId: string;
  chatId: string;
  chatType: string;
  threadId: string | null;
  actorId: string | null;
  text: string;
  createdAt: string | null;
}

function normalizeTelegramTextMessage(update: TelegramUpdate): NormalizedTelegramTextMessage | null {
  const message = update.message;
  if (!message?.text?.trim()) return null;
  return {
    updateId: update.update_id,
    messageId: String(message.message_id),
    chatId: String(message.chat.id),
    chatType: message.chat.type,
    threadId: message.message_thread_id === undefined ? null : String(message.message_thread_id),
    actorId: message.from?.id === undefined ? null : String(message.from.id),
    text: message.text.trim(),
    createdAt: message.date ? new Date(message.date * 1000).toISOString() : null
  };
}

function renderTelegramTask(
  message: NormalizedTelegramTextMessage,
  session: RuntimeSessionRecord,
  taskText: string
): string {
  return [
    "Telegram runtime session message received.",
    `Runtime session ID: ${session.id}`,
    `Runtime session profile: ${session.profile}`,
    `Telegram chat type: ${message.chatType}`,
    `Telegram chat id: ${message.chatId}`,
    ...(message.threadId ? [`Telegram thread id: ${message.threadId}`] : []),
    ...(message.actorId ? [`Telegram user id: ${message.actorId}`] : []),
    "",
    "Task:",
    taskText
  ].join("\n");
}

function splitText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = rest.lastIndexOf("\n", limit);
    const index = cut > limit / 2 ? cut : limit;
    chunks.push(rest.slice(0, index));
    rest = rest.slice(index).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function sentMessageIds(sends: TelegramSendResult[]): string[] {
  return sends
    .map((send) => send.messageId)
    .filter((value): value is string => Boolean(value));
}
