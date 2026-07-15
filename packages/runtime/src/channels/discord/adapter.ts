import { recordRuntimeChannelOutbound, recordRuntimeChannelOutboundDelivery, type RuntimeChannelOutboundRecord } from "../../../../core/src/runtime_channel_outbox.js";
import type { RuntimeChannelSource } from "../../../../core/src/runtime_channel_messages.js";
import type { RuntimeSessionRecord, RuntimeSessionSource } from "../../../../core/src/runtime_sessions.js";
import { AgentStore } from "../../../../core/src/store.js";
import { utcNow } from "../../../../core/src/ids.js";
import type { RunResult } from "../../../../core/src/schemas.js";
import { dispatchRuntimeChannelMessage } from "../../channel_message_dispatcher.js";
import type { RuntimeChannelAdapter, RuntimeChannelHealth } from "../../message_gateway.js";
import { drainRuntimeChannelOutboxForAdapter } from "../../runtime_channel_outbox_drainer.js";
import { runRuntimeChannelTask } from "../../runtime_channel_task.js";
import type {
  DiscordChannelConfig,
  DiscordMessage,
  DiscordSendResult,
  DiscordTransport,
  TaskRunner
} from "./types.js";

export class DiscordBotAdapter implements RuntimeChannelAdapter {
  readonly kind = "discord" as const;
  readonly channelId: string;
  private readonly config: DiscordChannelConfig;
  private readonly transport: DiscordTransport;
  private readonly runner: TaskRunner;
  private readonly store: AgentStore;
  private readonly activeRuntimeSessionIds = new Set<string>();
  private readonly seenMessageIds: string[] = [];
  private readonly seenSet = new Set<string>();
  private running = false;
  private outboxPollTimer: ReturnType<typeof setInterval> | null = null;
  private outboxDrainActive = false;

  constructor(args: {
    config: DiscordChannelConfig;
    transport: DiscordTransport;
    runner: TaskRunner;
    store: AgentStore;
  }) {
    this.config = args.config;
    this.channelId = args.config.channelId;
    this.transport = args.transport;
    this.runner = args.runner;
    this.store = args.store;
  }

  async start(): Promise<void> {
    await this.store.ensureLayout();
    await this.transport.start((message) => {
      void this.handleMessage(message);
    });
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
      detail: `discord:${this.channelId}`
    };
  }

  async handleMessage(message: DiscordMessage): Promise<void> {
    const normalized = normalizeDiscordTextMessage(message);
    if (!normalized) {
      await this.recordEvent("ignored", "Ignored non-text Discord message.", { message_id: message.id });
      return;
    }
    if (this.isDuplicate(normalized.messageId)) return;
    this.markSeen(normalized.messageId);
    if (normalized.bot || normalized.actorId === this.config.botUserId) {
      await this.recordEvent("ignored", "Ignored bot-authored Discord message.", { message_id: normalized.messageId });
      return;
    }

    const actorAuthorized = this.isAllowed(normalized);
    const dispatched = await dispatchRuntimeChannelMessage(this.store, {
      message: {
        source: this.discordSessionSource(normalized),
        messageId: normalized.messageId,
        text: normalized.text,
        createdAt: normalized.createdAt
      },
      actorAuthorized,
      triggerOptions: {
        isMention: (text) => this.isBotMention(text),
        stripMention: (text) => this.stripBotMention(text)
      }
    });

    if (dispatched.kind === "denied") {
      await this.recordEvent("denied", `Denied Discord message ${normalized.messageId}.`, {
        message_id: normalized.messageId,
        channel_id: normalized.channelId,
        actor_id: normalized.actorId,
        reason: dispatched.reason
      });
      return;
    }

    if (dispatched.kind === "session_bound") {
      const outbound = await this.sendChunks(normalized, [
        `已绑定 runtime session: ${dispatched.session.id}`,
        `profile: ${dispatched.binding.profile}`,
        "后续普通消息会进入 inbox；使用 /run 或 bot mention 才会执行任务。"
      ].join("\n"));
      await this.recordEvent("session_bound", `Bound Discord channel ${normalized.channelId} to runtime session ${dispatched.session.id}.`, {
        message_id: normalized.messageId,
        runtime_session_id: dispatched.session.id,
        outbound
      });
      return;
    }

    if (dispatched.kind === "session_pending") {
      if (dispatched.notify) {
        const outbound = await this.sendChunks(normalized, this.config.pendingText);
        await this.recordEvent("session_pending", `Created pending Discord runtime session ${dispatched.session.id}.`, {
          message_id: normalized.messageId,
          runtime_session_id: dispatched.session.id,
          outbound
        });
      }
      return;
    }

    if (dispatched.kind === "session_inbox") {
      await this.recordEvent("session_inbox", `Recorded Discord message ${normalized.messageId} in runtime session inbox.`, {
        message_id: normalized.messageId,
        runtime_session_id: dispatched.session.id
      });
      return;
    }

    await this.runRuntimeSessionMessage(normalized, dispatched.session, dispatched.source, dispatched.taskText);
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
        sourceKind: "discord",
        channelId: this.channelId,
        limit,
        deliver: (entry, source) => this.deliverOutbox(entry, source)
      });
    } finally {
      this.outboxDrainActive = false;
    }
  }

  private async runRuntimeSessionMessage(
    message: NormalizedDiscordTextMessage,
    session: RuntimeSessionRecord,
    source: RuntimeSessionSource,
    taskText: string
  ): Promise<void> {
    if (this.activeRuntimeSessionIds.has(session.id)) {
      const outbound = await this.sendChunks(message, this.config.busyText);
      await this.recordEvent("session_busy", `Rejected concurrent Discord runtime session message ${message.messageId}.`, {
        message_id: message.messageId,
        runtime_session_id: session.id,
        outbound
      });
      return;
    }

    this.activeRuntimeSessionIds.add(session.id);
    try {
      await this.sendChunks(message, this.config.ackText);
      const task = renderDiscordTask(message, session, taskText);
      const executed = await runRuntimeChannelTask(this.store, {
        session,
        source,
        taskText,
        runnerTask: task,
        runTask: (runnerTask) => this.runner.runTask(runnerTask, { recallQuery: taskText })
      });
      const finalText = await this.finalTextForRun(executed.result);
      const sends = await this.sendChunks(message, finalText);
      const ref = await this.store.writeJson(`channels/discord/outbound/${message.messageId}.json`, {
        source_message_id: message.messageId,
        channel_id: message.channelId,
        guild_id: message.guildId,
        session_id: executed.result.session_id,
        turn_id: executed.result.turn_id,
        text: finalText,
        sends,
        created_at: utcNow()
      });
      await recordRuntimeChannelOutbound(this.store, {
        source,
        runtimeSessionId: session.id,
        taskRunId: executed.queued.id,
        inReplyToMessageId: message.messageId,
        purpose: "final",
        status: "sent",
        text: finalText,
        providerDeliveryRef: ref,
        providerMessageIds: sentMessageIds(sends)
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      const sends = await this.sendChunks(message, this.config.errorText);
      const ref = await this.store.writeJson(`channels/discord/errors/${message.messageId}.json`, {
        message_id: message.messageId,
        channel_id: message.channelId,
        guild_id: message.guildId,
        error: messageText,
        sends,
        created_at: utcNow()
      });
      await recordRuntimeChannelOutbound(this.store, {
        source,
        runtimeSessionId: session.id,
        inReplyToMessageId: message.messageId,
        purpose: "error",
        status: "sent",
        text: this.config.errorText,
        providerDeliveryRef: ref,
        providerMessageIds: sentMessageIds(sends),
        error: messageText
      });
      await this.recordEvent("error", `Discord runtime session message ${message.messageId} failed: ${messageText}`, {
        message_id: message.messageId,
        runtime_session_id: session.id,
        error: messageText
      });
    } finally {
      this.activeRuntimeSessionIds.delete(session.id);
    }
  }

  private async sendChunks(message: NormalizedDiscordTextMessage, text: string): Promise<DiscordSendResult[]> {
    return this.sendChunksToChannel(message.channelId, text);
  }

  private async sendChunksToChannel(channelId: string, text: string): Promise<DiscordSendResult[]> {
    const chunks = splitText(text, this.config.textChunkLimit);
    const results: DiscordSendResult[] = [];
    for (const chunk of chunks) {
      results.push(await this.transport.sendText(channelId, chunk));
    }
    return results;
  }

  private discordSessionSource(message: NormalizedDiscordTextMessage, profile?: string): RuntimeSessionSource {
    return {
      kind: "discord",
      channelId: this.channelId,
      conversationType: message.guildId ? "guild_text" : "dm",
      conversationId: message.channelId,
      threadId: null,
      actorId: message.actorId,
      profile
    };
  }

  private async deliverOutbox(
    entry: RuntimeChannelOutboundRecord,
    source: RuntimeChannelSource
  ): Promise<RuntimeChannelOutboundRecord> {
    try {
      const sends = await this.sendChunksToChannel(source.conversationId, entry.text);
      const failed = sends.find((send) => !send.ok);
      const ref = await this.store.writeJson(`channels/discord/outbox/${entry.id}.json`, {
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

  private async finalTextForRun(result: RunResult): Promise<string> {
    if (result.final_response_ref) {
      const text = await this.store.readStateText(result.final_response_ref, 20000);
      if (text.trim()) return text.trim();
    }
    return result.verdict;
  }

  private isAllowed(message: NormalizedDiscordTextMessage): boolean {
    if (!message.actorId) return false;
    const userAllowed = this.config.allowedUserIds.length === 0 || this.config.allowedUserIds.includes(message.actorId);
    const guildAllowed = !message.guildId || this.config.allowedGuildIds.length === 0 || this.config.allowedGuildIds.includes(message.guildId);
    return userAllowed && guildAllowed;
  }

  private isBotMention(text: string): boolean {
    if (!this.config.botUserId) return false;
    return text.includes(`<@${this.config.botUserId}>`) || text.includes(`<@!${this.config.botUserId}>`);
  }

  private stripBotMention(text: string): string {
    if (!this.config.botUserId) return text;
    return text
      .replaceAll(`<@${this.config.botUserId}>`, "")
      .replaceAll(`<@!${this.config.botUserId}>`, "")
      .trim();
  }

  private isDuplicate(messageId: string): boolean {
    return this.seenSet.has(messageId);
  }

  private markSeen(messageId: string): void {
    this.seenSet.add(messageId);
    this.seenMessageIds.push(messageId);
    while (this.seenMessageIds.length > this.config.dedupCacheSize) {
      const removed = this.seenMessageIds.shift();
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
    await this.store.appendJsonl("channels/discord/events.jsonl", {
      type: "discord_channel_event",
      kind,
      summary,
      details,
      created_at: utcNow()
    });
  }
}

interface NormalizedDiscordTextMessage {
  messageId: string;
  channelId: string;
  guildId: string | null;
  actorId: string | null;
  bot: boolean;
  text: string;
  createdAt: string | null;
}

function normalizeDiscordTextMessage(message: DiscordMessage): NormalizedDiscordTextMessage | null {
  if (!message.content?.trim()) return null;
  return {
    messageId: message.id,
    channelId: message.channel_id,
    guildId: message.guild_id ?? null,
    actorId: message.author?.id ?? null,
    bot: Boolean(message.author?.bot),
    text: message.content.trim(),
    createdAt: message.timestamp ?? null
  };
}

function renderDiscordTask(
  message: NormalizedDiscordTextMessage,
  session: RuntimeSessionRecord,
  taskText: string
): string {
  return [
    "Discord runtime session message received.",
    `Runtime session ID: ${session.id}`,
    `Runtime session profile: ${session.profile}`,
    `Discord channel id: ${message.channelId}`,
    ...(message.guildId ? [`Discord guild id: ${message.guildId}`] : []),
    ...(message.actorId ? [`Discord user id: ${message.actorId}`] : []),
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

function sentMessageIds(sends: DiscordSendResult[]): string[] {
  return sends
    .map((send) => send.messageId)
    .filter((value): value is string => Boolean(value));
}
