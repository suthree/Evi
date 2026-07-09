import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { MemoryStore, type EpisodeEventRecord, type EpisodeSearchHit } from "../../../../core/src/memory_store.js";
import {
  getOpportunityBacklog,
  type OpportunityBacklogItem,
  type OpportunityBacklogResult
} from "../../../../core/src/opportunity_backlog.js";
import {
  getContextHealth,
  type ContextHealthIssue
} from "../../../../core/src/context_health.js";
import {
  getArchiveHealth,
  type ArchiveHealthIssue
} from "../../../../core/src/archive_health.js";
import {
  listContextPressure,
  type ContextPressureSummary
} from "../../../../core/src/context_pressure.js";
import {
  getContextUsage,
  type ContextUsageManifestSummary,
  type ContextUsageResult
} from "../../../../core/src/context_usage.js";
import {
  getServiceHealth,
  summarizeContentDailyEffectiveStatus,
  type ContentDailyEffectiveJobStatus,
  type ServiceDeploymentSummary,
  type ServiceHealthResult,
  type ServiceReviewTickFocusSummary
} from "../../../../core/src/service_health.js";
import {
  getWorkingCheckpoint,
  listWorkingCheckpoints,
  type WorkingCheckpointSummary
} from "../../../../core/src/working_checkpoints.js";
import {
  getSessionRecap,
  type SessionRecapEventSummary,
  type SessionRecapResult
} from "../../../../core/src/session_recap.js";
import {
  getWorkspaceStatus,
  type WorkspaceStatusResult
} from "../../../../core/src/workspace_status.js";
import {
  contentDailyDateKey,
  getContentRun,
  listContentPublishHistory,
  listContentCreatorMetricsNeeded,
  type ContentCreatorMetricsNeededItem,
  type ContentPublishHistoryEvent,
  type ContentRunDetailResult
} from "../../../../core/src/content_pipeline.js";
import type { ReviewInboxDecisionWithRef } from "../../../../core/src/review_inbox_decisions.js";
import type { ReviewTickHistorySummary } from "../../../../core/src/review_tick_history.js";
import type { BackgroundReviewHistorySummary } from "../../../../core/src/background_review_history.js";
import type { CompletionVerificationHistorySummary } from "../../../../core/src/completion_verification_history.js";
import {
  getSelectedSkillOutcome,
  listSelectedSkillDrifts,
  listSelectedSkillOutcomes,
  type SelectedSkillDriftSummary,
  type SelectedSkillOutcomeHistorySummary
} from "../../../../core/src/selected_skill_outcome_history.js";
import {
  getSkillRegistryEvent,
  listSkillRegistryEvents,
  type SkillRegistryEventSummary
} from "../../../../core/src/skill_registry_events.js";
import {
  getSkillCatalogEntry,
  listSkillCatalog,
  type SkillCatalogSummary
} from "../../../../core/src/skill_catalog.js";
import {
  getSkillRegistryHealth,
  type SkillRegistryHealthIssue
} from "../../../../core/src/skill_registry_health.js";
import {
  getCapabilityAcceptanceAudit,
  getCapabilityCatalog,
  resolveCapabilityLayer,
  type CapabilityAcceptanceAudit,
  type CapabilityAcceptanceGate,
  type CapabilityNextSlice,
  type CapabilityCatalog,
  type CapabilityCategory,
  type CapabilitySummary
} from "../../../../core/src/capabilities.js";
import {
  getSopEvolutionLedger,
  renderSopEvolutionLedgerMarkdown
} from "../../../../core/src/sop_evolution_ledger.js";
import {
  recordRuntimeTaskRun,
  runtimeTaskRunStatusFromResult,
  type RuntimeSessionSource,
  type RuntimeSessionRecord
} from "../../../../core/src/runtime_sessions.js";
import {
  recordRuntimeChannelOutbound,
  recordRuntimeChannelOutboundDelivery,
  type RuntimeChannelOutboundRecord
} from "../../../../core/src/runtime_channel_outbox.js";
import {
  runtimeChannelRouteKey,
  runtimeChannelSourceKey,
  type RuntimeChannelSource
} from "../../../../core/src/runtime_channel_messages.js";
import {
  claimRuntimeTask,
  completeRuntimeTask,
  enqueueRuntimeTask,
  failRuntimeTask,
  type RuntimeTaskQueueEntry,
  type RuntimeTaskQueueTerminalStatus
} from "../../../../core/src/runtime_task_queue.js";
import {
  getPipelineRun,
  listPipelineRuns,
  renderPipelineHistoryDetail,
  renderPipelineHistoryList
} from "../../../../core/src/pipeline_history.js";
import {
  getLiveRunTrace,
  listLiveRunTraces,
  type LiveRunTraceRound,
  type LiveRunTraceSummary
} from "../../../../core/src/live_run_trace.js";
import {
  getHarnessReplayAudit,
  listHarnessReplayAudits,
  type HarnessReplayAuditReport
} from "../../../../core/src/harness_replay.js";
import { renderReusedSkillCoverageMarkdown } from "../../../../core/src/reused_skill_coverage.js";
import type { SopEvolutionConfirmationGate } from "../../../../core/src/sop_confirmation_readiness.js";
import { evidenceEventSchema, type RunResult } from "../../../../core/src/schemas.js";
import type { SkillResolverLike } from "../../../../core/src/skill_resolver.js";
import { AgentStore } from "../../../../core/src/store.js";
import { utcNow } from "../../../../core/src/ids.js";
import {
  BackgroundReviewRunner,
  type ReviewFollowUpConfirmationGateSummary,
  type ReviewFollowUpConfirmationGateFilter,
  type ReviewFollowUpConfirmationSummary,
  type ReviewFollowUpConfirmationRequest,
  type ReviewFollowUpConfirmedExecutionSummary,
  type ReviewInboxItem,
  type ReviewInboxItemView
} from "../../background_review.js";
import {
  getAcceptedSemanticMemory,
  getMemoryCandidate,
  getMemoryCandidateConfirmation,
  listAcceptedSemanticMemories,
  listMemoryCandidates,
  listMemoryCandidateConfirmations,
  type AcceptedSemanticMemorySummary,
  type MemoryCandidate,
  type MemoryCandidateConfirmationRequest,
  type MemoryCandidateConfirmationSummary,
  type MemoryCandidateSummary
} from "../../memory_candidates.js";
import {
  listContextManifests,
  showContextManifest,
  type ContextManifestSummary
} from "../../context_manifest.js";
import {
  listOperatorNotifications,
  markOperatorNotificationFailed,
  markOperatorNotificationSent,
  type OperatorNotificationEntry
} from "../../operator_notifications.js";
import {
  getEpisodeArchive,
  listEpisodeArchives,
  type EpisodeArchiveSummary
} from "../../episode_archives.js";
import { loadRuntimeConfigSummary, type RuntimeConfigSummary } from "../../config.js";
import type { DailyContentJobResult, DailyContentJobStep } from "../../content_pipeline.js";
import { getGovernanceStatus, type GovernanceOpportunitySummary, type GovernanceStatusResult } from "../../governance_status.js";
import { dispatchRuntimeChannelMessage } from "../../channel_message_dispatcher.js";
import type { RuntimeChannelAdapter, RuntimeChannelHealth } from "../../message_gateway.js";
import { drainRuntimeChannelOutboxForAdapter } from "../../runtime_channel_outbox_drainer.js";
import type {
  TaskRunner,
  FeishuChannelConfig,
  FeishuInboundEvent,
  FeishuSendResult,
  FeishuTransport,
  NormalizedFeishuTextMessage,
  NormalizedFeishuPrivateMessage
} from "./types.js";

interface SeenState {
  ids: string[];
}

interface FeishuConversationHistoryItem {
  role: "user" | "assistant";
  message_id: string;
  created_at: string;
  text: string;
}

interface FeishuQueuedFollowup {
  message: NormalizedFeishuPrivateMessage;
  queued_at: string;
  queue_ref: string;
}

interface OperatorNotificationDrainResult {
  queued_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  notifications: Array<{
    id: string;
    ref: string;
    status: "sent" | "failed" | "skipped";
    error?: string;
  }>;
}

export class FeishuPrivateChatAdapter implements RuntimeChannelAdapter {
  readonly kind = "feishu" as const;
  readonly channelId: string;
  private readonly config: FeishuChannelConfig;
  private readonly transport: FeishuTransport;
  private readonly runner: TaskRunner;
  private readonly store: AgentStore;
  private readonly vaultRoot: SkillResolverLike;
  private readonly homeRoot: string;
  private readonly configDir: string;
  private readonly reviewRunner: BackgroundReviewRunner;
  private readonly activeOpenIds = new Set<string>();
  private readonly activeRuntimeSessionIds = new Set<string>();
  private readonly followupQueues = new Map<string, FeishuQueuedFollowup[]>();
  private readonly seenMessageIds: string[] = [];
  private readonly seenSet = new Set<string>();
  private notificationPollTimer: ReturnType<typeof setInterval> | null = null;
  private outboxPollTimer: ReturnType<typeof setInterval> | null = null;
  private notificationDrainActive = false;
  private outboxDrainActive = false;
  private loaded = false;
  private running = false;

  constructor(args: {
    config: FeishuChannelConfig;
    transport: FeishuTransport;
    runner: TaskRunner;
    store: AgentStore;
    vaultRoot?: SkillResolverLike;
    homeRoot?: string;
    configDir?: string;
  }) {
    this.config = args.config;
    this.channelId = args.config.channelId ?? "feishu";
    this.transport = args.transport;
    this.runner = args.runner;
    this.store = args.store;
    this.vaultRoot = args.vaultRoot ?? "vault";
    this.homeRoot = resolve(args.homeRoot ?? process.env.LOCAL_RUNTIME_HOME ?? resolve(homedir(), ".local-runtime"));
    this.configDir = resolve(args.configDir ?? "config");
    this.reviewRunner = new BackgroundReviewRunner({
      repoRoot: args.store.repoRoot,
      stateRoot: args.store.stateRoot,
      vaultRoot: this.vaultRoot
    });
  }

  async start(): Promise<void> {
    await this.store.ensureLayout();
    await this.loadSeenState();
    await this.transport.start((event) => {
      void this.handleInboundEvent(event);
    });
    this.running = true;
    await this.drainOperatorNotifications();
    this.startOperatorNotificationPoll();
    await this.drainRuntimeChannelOutbox();
    this.startRuntimeChannelOutboxPoll();
  }

  async stop(): Promise<void> {
    this.stopOperatorNotificationPoll();
    this.stopRuntimeChannelOutboxPoll();
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
      detail: `${this.config.domain}:${this.config.channelId ?? this.channelId}`
    };
  }

  async drainOperatorNotifications(limit = 10): Promise<OperatorNotificationDrainResult> {
    if (this.notificationDrainActive) {
      return {
        queued_count: 0,
        sent_count: 0,
        failed_count: 0,
        skipped_count: 1,
        notifications: []
      };
    }
    this.notificationDrainActive = true;
    try {
      const queued = await listOperatorNotifications(this.store, {
        channel: "feishu",
        status: "queued",
        limit,
        oldestFirst: true
      });
      const result: OperatorNotificationDrainResult = {
        queued_count: queued.count,
        sent_count: 0,
        failed_count: 0,
        skipped_count: 0,
        notifications: []
      };
      for (const entry of queued.notifications) {
        const drained = await this.drainOperatorNotification(entry);
        if (drained.status === "sent") result.sent_count += 1;
        if (drained.status === "failed") result.failed_count += 1;
        if (drained.status === "skipped") result.skipped_count += 1;
        result.notifications.push(drained);
      }
      return result;
    } finally {
      this.notificationDrainActive = false;
    }
  }

  async drainRuntimeChannelOutbox(limit = 10): Promise<{
    queued_count: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    outbox_ids: string[];
  }> {
    if (this.outboxDrainActive) {
      return {
        queued_count: 0,
        sent_count: 0,
        failed_count: 0,
        skipped_count: 1,
        outbox_ids: []
      };
    }
    this.outboxDrainActive = true;
    try {
      return await drainRuntimeChannelOutboxForAdapter(this.store, {
        sourceKind: "feishu",
        channelId: this.channelId,
        limit,
        deliver: (entry, source) => this.deliverRuntimeChannelOutbox(entry, source)
      });
    } finally {
      this.outboxDrainActive = false;
    }
  }

  private startOperatorNotificationPoll(): void {
    if (this.notificationPollTimer) return;
    this.notificationPollTimer = setInterval(() => {
      void this.drainOperatorNotifications().catch((error: unknown) => {
        console.error(errorMessage(error));
      });
    }, 5000);
    this.notificationPollTimer.unref?.();
  }

  private stopOperatorNotificationPoll(): void {
    if (!this.notificationPollTimer) return;
    clearInterval(this.notificationPollTimer);
    this.notificationPollTimer = null;
  }

  private startRuntimeChannelOutboxPoll(): void {
    if (this.outboxPollTimer) return;
    this.outboxPollTimer = setInterval(() => {
      void this.drainRuntimeChannelOutbox().catch((error: unknown) => {
        console.error(errorMessage(error));
      });
    }, 5000);
    this.outboxPollTimer.unref?.();
  }

  private stopRuntimeChannelOutboxPoll(): void {
    if (!this.outboxPollTimer) return;
    clearInterval(this.outboxPollTimer);
    this.outboxPollTimer = null;
  }

  private async drainOperatorNotification(
    entry: OperatorNotificationEntry
  ): Promise<OperatorNotificationDrainResult["notifications"][number]> {
    const openId = entry.notification.target.open_id;
    if (!this.isAllowed(openId)) {
      const error = `Denied operator notification to unauthorized open_id ${openId}.`;
      await markOperatorNotificationFailed(this.store, entry, error);
      await this.recordChannelEvent("operator_notification_denied", error, {
        notification_id: entry.notification.id,
        notification_ref: entry.ref,
        open_id: openId,
        source: entry.notification.source
      });
      return {
        id: entry.notification.id,
        ref: entry.ref,
        status: "failed",
        error
      };
    }

    try {
      const sends = await this.sendChunks(openId, entry.notification.text);
      const failedSend = sends.find((send) => !send.ok);
      if (failedSend) {
        const failed = await markOperatorNotificationFailed(this.store, entry, failedSend.summary, sends);
        await this.recordChannelEvent("operator_notification_failed", failedSend.summary, {
          notification_id: failed.notification.id,
          notification_ref: failed.ref,
          open_id: openId,
          source: failed.notification.source,
          send_count: sends.length
        });
        return {
          id: failed.notification.id,
          ref: failed.ref,
          status: "failed",
          error: failedSend.summary
        };
      }

      const sent = await markOperatorNotificationSent(this.store, entry, sends);
      await this.recordChannelEvent("operator_notification_sent", `Sent operator notification ${sent.notification.id}.`, {
        notification_id: sent.notification.id,
        notification_ref: sent.ref,
        open_id: openId,
        source: sent.notification.source,
        send_count: sends.length
      });
      return {
        id: sent.notification.id,
        ref: sent.ref,
        status: "sent"
      };
    } catch (error) {
      const message = errorMessage(error);
      const failed = await markOperatorNotificationFailed(this.store, entry, message);
      await this.recordChannelEvent("operator_notification_failed", `Operator notification ${failed.notification.id} failed: ${message}`, {
        notification_id: failed.notification.id,
        notification_ref: failed.ref,
        open_id: openId,
        source: failed.notification.source
      });
      return {
        id: failed.notification.id,
        ref: failed.ref,
        status: "failed",
        error: message
      };
    }
  }

  async handleInboundEvent(event: FeishuInboundEvent): Promise<void> {
    await this.loadSeenState();
    const normalized = normalizeFeishuTextMessage(event);
    if (!normalized) {
      await this.recordChannelEvent("ignored", "Ignored non-text Feishu event.", { event });
      return;
    }

    if (this.isDuplicate(normalized.messageId)) {
      await this.recordChannelEvent("duplicate", `Dropped duplicate Feishu message ${normalized.messageId}.`, {
        message_id: normalized.messageId,
        open_id: normalized.openId
      });
      return;
    }
    await this.markSeen(normalized.messageId);

    if (normalized.chatType !== "p2p") {
      await this.handleGroupTextMessage(normalized);
      return;
    }
    const privateMessage = normalized as NormalizedFeishuPrivateMessage;

    if (!this.isAllowed(privateMessage.openId)) {
      await this.recordChannelEvent("denied", `Denied Feishu message from unauthorized open_id ${privateMessage.openId}.`, {
        message_id: privateMessage.messageId,
        open_id: privateMessage.openId
      });
      return;
    }

    const command = parseOperatorCommand(privateMessage.text);
    if (command) {
      await this.handleOperatorCommand(privateMessage, command);
      return;
    }

    if (this.activeOpenIds.has(privateMessage.openId)) {
      const queued = await this.enqueueFollowup(privateMessage);
      const outbound = await this.sendChunks(privateMessage.openId, queued.ok ? this.config.queuedText : this.config.busyText);
      await this.recordChannelEvent(queued.ok ? "queued_followup" : "busy", queued.ok
        ? `Queued Feishu follow-up message ${privateMessage.messageId}.`
        : `Rejected concurrent Feishu message ${privateMessage.messageId}; follow-up queue is full.`, {
        message_id: privateMessage.messageId,
        open_id: privateMessage.openId,
        queue_depth: queued.queueDepth,
        queue_ref: queued.queueRef ?? null,
        outbound
      });
      return;
    }

    await this.runMessageAndQueuedFollowups(privateMessage);
  }

  private async handleGroupTextMessage(message: NormalizedFeishuTextMessage): Promise<void> {
    const actorAuthorized = this.isAllowed(message.openId);
    const dispatched = await dispatchRuntimeChannelMessage(this.store, {
      message: {
        source: this.feishuSessionSource(message),
        messageId: message.messageId,
        text: message.text
      },
      actorAuthorized,
      triggerOptions: {
        isMention: isFeishuMention,
        stripMention: stripFeishuMention
      }
    });

    if (dispatched.kind === "denied") {
      await this.recordChannelEvent("denied", dispatched.reason === "unauthorized_session_command"
        ? `Denied Feishu session bind from unauthorized open_id ${message.openId}.`
        : `Denied unknown Feishu group ${message.chatId}.`, {
        message_id: message.messageId,
        chat_id: message.chatId,
        open_id: message.openId,
        reason: dispatched.reason
      });
      return;
    }

    if (dispatched.kind === "session_bound") {
      const outbound = await this.sendChunksToMessage(message, [
        `已绑定 runtime session: ${dispatched.session.id}`,
        `profile: ${dispatched.binding.profile}`,
        "后续普通群消息会进入 inbox；使用 /run 或 @bot 才会执行任务。"
      ].join("\n"));
      await this.recordChannelEvent("session_bound", `Bound Feishu group ${message.chatId} to runtime session ${dispatched.session.id}.`, {
        message_id: message.messageId,
        chat_id: message.chatId,
        open_id: message.openId,
        runtime_session_id: dispatched.session.id,
        profile: dispatched.binding.profile,
        outbound
      });
      return;
    }

    if (dispatched.kind === "session_pending") {
      if (dispatched.notify) {
        const outbound = await this.sendChunksToMessage(message, [
          `已记录到 pending runtime session: ${dispatched.session.id}`,
          "请由授权 operator 在群里发送 /session use <profile> 绑定角色后再执行。"
        ].join("\n"));
        await this.recordChannelEvent("session_pending", `Created pending Feishu runtime session ${dispatched.session.id}.`, {
          message_id: message.messageId,
          chat_id: message.chatId,
          open_id: message.openId,
          runtime_session_id: dispatched.session.id,
          outbound
        });
      }
      return;
    }

    if (dispatched.kind === "session_inbox") {
      await this.recordChannelEvent("session_inbox", `Recorded Feishu group message ${message.messageId} in runtime session inbox.`, {
        message_id: message.messageId,
        chat_id: message.chatId,
        open_id: message.openId,
        runtime_session_id: dispatched.session.id,
        profile: dispatched.session.profile
      });
      return;
    }

    await this.runRuntimeSessionMessage(message, dispatched.session, dispatched.source, dispatched.taskText);
  }

  private async runRuntimeSessionMessage(
    message: NormalizedFeishuTextMessage,
    session: RuntimeSessionRecord,
    source: RuntimeSessionSource,
    taskText: string
  ): Promise<void> {
    if (this.activeRuntimeSessionIds.has(session.id)) {
      const outbound = await this.sendChunksToMessage(message, this.config.busyText);
      await this.recordChannelEvent("session_busy", `Rejected concurrent Feishu runtime session message ${message.messageId}.`, {
        message_id: message.messageId,
        chat_id: message.chatId,
        open_id: message.openId,
        runtime_session_id: session.id,
        outbound
      });
      return;
    }

    this.activeRuntimeSessionIds.add(session.id);
    let inboundRef = "";
    let outboundRef = "";
    const sourceKey = runtimeChannelSourceKey(source, session.profile);
    let queued: RuntimeTaskQueueEntry | null = null;
    try {
      const task = renderAgentTask(message, [], session, taskText);
      queued = await enqueueRuntimeTask(this.store, {
        runtimeSessionId: session.id,
        source,
        task: taskText,
        runnerTask: task
      });
      await recordRuntimeTaskRun(this.store, {
        id: queued.id,
        createdAt: queued.created_at,
        runtimeSessionId: session.id,
        sourceKind: source.kind,
        sourceKey,
        task: taskText,
        status: "queued"
      });
      const claimed = await claimRuntimeTask(this.store, { id: queued.id });
      if (!claimed) throw new Error(`runtime task ${queued.id} could not be claimed`);
      await recordRuntimeTaskRun(this.store, {
        id: queued.id,
        createdAt: queued.created_at,
        runtimeSessionId: session.id,
        sourceKind: source.kind,
        sourceKey,
        task: taskText,
        status: "running"
      });
      inboundRef = await this.recordInbound(message);
      await this.sendChunksToMessage(message, this.config.ackText);
      const result = await this.runner.runTask(task);
      await completeRuntimeTask(this.store, {
        id: queued.id,
        status: runtimeTaskRunStatusFromResult(result) as RuntimeTaskQueueTerminalStatus
      });
      await recordRuntimeTaskRun(this.store, {
        id: queued.id,
        createdAt: queued.created_at,
        runtimeSessionId: session.id,
        sourceKind: source.kind,
        sourceKey,
        task: taskText,
        runResult: result
      });
      const finalText = await this.finalTextForRun(result);
      const outbound = await this.sendChunksToMessage(message, finalText);
      outboundRef = await this.recordOutbound(message, result, finalText, outbound, {
        source,
        runtimeSessionId: session.id,
        taskRunId: queued.id
      });
      await this.recordRunEvidence(result, {
        inboundRef,
        outboundRef,
        summary: `Handled Feishu runtime session message ${message.messageId} for ${session.id}.`
      });
    } catch (error) {
      const messageText = errorMessage(error);
      if (queued) {
        await failRuntimeTask(this.store, { id: queued.id, error: messageText });
        await recordRuntimeTaskRun(this.store, {
          id: queued.id,
          createdAt: queued.created_at,
          runtimeSessionId: session.id,
          sourceKind: source.kind,
          sourceKey,
          task: taskText,
          status: "failed"
        });
      }
      const outbound = await this.sendChunksToMessage(message, this.config.errorText);
      outboundRef = await this.store.writeJson(`channels/feishu/errors/${message.messageId}.json`, {
        message_id: message.messageId,
        chat_id: message.chatId,
        open_id: message.openId,
        runtime_session_id: session.id,
        error: messageText,
        outbound,
        inbound_ref: inboundRef || null,
        created_at: utcNow()
      });
      await recordRuntimeChannelOutbound(this.store, {
        source,
        runtimeSessionId: session.id,
        taskRunId: queued?.id ?? null,
        inReplyToMessageId: message.messageId,
        purpose: "error",
        status: "sent",
        text: this.config.errorText,
        providerDeliveryRef: outboundRef,
        providerMessageIds: sentMessageIds(outbound),
        error: messageText
      });
      await this.recordChannelEvent("error", `Feishu runtime session message ${message.messageId} failed: ${messageText}`, {
        message_id: message.messageId,
        chat_id: message.chatId,
        open_id: message.openId,
        runtime_session_id: session.id,
        inbound_ref: inboundRef || null,
        outbound_ref: outboundRef
      });
    } finally {
      this.activeRuntimeSessionIds.delete(session.id);
    }
  }

  private async runMessageAndQueuedFollowups(initial: NormalizedFeishuPrivateMessage): Promise<void> {
    this.activeOpenIds.add(initial.openId);
    try {
      let current: NormalizedFeishuPrivateMessage | null = initial;
      while (current) {
        await this.runSingleMessage(current);
        const queued = this.dequeueFollowup(initial.openId);
        current = queued?.message ?? null;
        if (queued) {
          await this.recordChannelEvent("dequeued_followup", `Dequeued Feishu follow-up message ${queued.message.messageId}.`, {
            message_id: queued.message.messageId,
            open_id: queued.message.openId,
            queued_at: queued.queued_at,
            queue_ref: queued.queue_ref,
            queue_depth: this.followupQueues.get(initial.openId)?.length ?? 0
          });
        }
      }
    } finally {
      this.activeOpenIds.delete(initial.openId);
    }
  }

  private async runSingleMessage(normalized: NormalizedFeishuPrivateMessage): Promise<void> {
    let inboundRef = "";
    let outboundRef = "";
    try {
      const history = await this.loadConversationHistory(normalized);
      inboundRef = await this.recordInbound(normalized);
      await this.sendChunks(normalized.openId, this.config.ackText);
      const task = renderAgentTask(normalized, history);
      const result = await this.runner.runTask(task);
      const finalText = await this.finalTextForRun(result);
      const outbound = await this.sendChunks(normalized.openId, finalText);
      outboundRef = await this.recordOutbound(normalized, result, finalText, outbound, {
        source: this.feishuSessionSource(normalized)
      });
      await this.recordRunEvidence(result, {
        inboundRef,
        outboundRef,
        summary: `Handled Feishu private message ${normalized.messageId}.`
      });
    } catch (error) {
      const message = errorMessage(error);
      const outbound = await this.sendChunks(normalized.openId, this.config.errorText);
      outboundRef = await this.store.writeJson(`channels/feishu/errors/${normalized.messageId}.json`, {
        message_id: normalized.messageId,
        open_id: normalized.openId,
        error: message,
        outbound,
        created_at: utcNow()
      });
      await recordRuntimeChannelOutbound(this.store, {
        source: this.feishuSessionSource(normalized),
        inReplyToMessageId: normalized.messageId,
        purpose: "error",
        status: "sent",
        text: this.config.errorText,
        providerDeliveryRef: outboundRef,
        providerMessageIds: sentMessageIds(outbound),
        error: message
      });
      await this.recordChannelEvent("error", `Feishu message ${normalized.messageId} failed: ${message}`, {
        message_id: normalized.messageId,
        open_id: normalized.openId,
        inbound_ref: inboundRef || null,
        outbound_ref: outboundRef
      });
    }
  }

  private async enqueueFollowup(message: NormalizedFeishuPrivateMessage): Promise<{ ok: boolean; queueDepth: number; queueRef?: string }> {
    const queue = this.followupQueues.get(message.openId) ?? [];
    if (queue.length >= this.config.followupQueueSize) {
      return { ok: false, queueDepth: queue.length };
    }
    const queuedAt = utcNow();
    const queueRef = await this.store.writeJson(`channels/feishu/queued/${message.messageId}.json`, {
      message_id: message.messageId,
      chat_id: message.chatId,
      open_id: message.openId,
      text: message.text,
      status: "queued",
      queued_at: queuedAt,
      queue_depth: queue.length + 1,
      boundary: "local in-memory follow-up queue trace; persisted for observability only and not replayed after process restart"
    });
    queue.push({ message, queued_at: queuedAt, queue_ref: queueRef });
    this.followupQueues.set(message.openId, queue);
    return { ok: true, queueDepth: queue.length, queueRef };
  }

  private dequeueFollowup(openId: string): FeishuQueuedFollowup | null {
    const queue = this.followupQueues.get(openId);
    if (!queue || queue.length === 0) return null;
    const next = queue.shift() ?? null;
    if (queue.length === 0) this.followupQueues.delete(openId);
    return next;
  }

  private async sendChunks(openId: string, text: string): Promise<FeishuSendResult[]> {
    const chunks = splitText(text, this.config.textChunkLimit);
    const results: FeishuSendResult[] = [];
    for (const chunk of chunks) {
      results.push(await this.transport.sendText(openId, chunk));
    }
    return results;
  }

  private async sendChunksToMessage(message: NormalizedFeishuTextMessage, text: string): Promise<FeishuSendResult[]> {
    if (message.chatType !== "p2p" && this.transport.sendTextToChat) {
      const chunks = splitText(text, this.config.textChunkLimit);
      const results: FeishuSendResult[] = [];
      for (const chunk of chunks) {
        results.push(await this.transport.sendTextToChat(message.chatId, chunk));
      }
      return results;
    }
    return this.sendChunks(message.openId, text);
  }

  private async sendChunksToSource(source: RuntimeChannelSource, text: string): Promise<FeishuSendResult[]> {
    if (this.transport.sendTextToChat) {
      const chunks = splitText(text, this.config.textChunkLimit);
      const results: FeishuSendResult[] = [];
      for (const chunk of chunks) {
        results.push(await this.transport.sendTextToChat(source.conversationId, chunk));
      }
      return results;
    }
    if (!source.actorId) throw new Error(`Feishu outbox ${runtimeChannelRouteKey(source)} has no actor open_id for p2p delivery.`);
    return this.sendChunks(source.actorId, text);
  }

  private async deliverRuntimeChannelOutbox(
    entry: RuntimeChannelOutboundRecord,
    source: RuntimeChannelSource
  ): Promise<RuntimeChannelOutboundRecord> {
    try {
      const sends = await this.sendChunksToSource(source, entry.text);
      const failedSend = sends.find((send) => !send.ok);
      const ref = await this.store.writeJson(`channels/feishu/outbox/${entry.id}.json`, {
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
      if (failedSend) {
        await this.recordChannelEvent("outbox_failed", failedSend.summary, {
          outbox_id: entry.id,
          artifact_ref: ref,
          source_route_key: entry.source_route_key,
          send_count: sends.length
        });
        return recordRuntimeChannelOutboundDelivery(this.store, entry, {
          status: "failed",
          providerDeliveryRef: ref,
          providerMessageIds: sentMessageIds(sends),
          error: failedSend.summary
        });
      }
      await this.recordChannelEvent("outbox_sent", `Sent Feishu outbox ${entry.id}.`, {
        outbox_id: entry.id,
        artifact_ref: ref,
        source_route_key: entry.source_route_key,
        send_count: sends.length
      });
      return recordRuntimeChannelOutboundDelivery(this.store, entry, {
        status: "sent",
        providerDeliveryRef: ref,
        providerMessageIds: sentMessageIds(sends)
      });
    } catch (error) {
      const message = errorMessage(error);
      await this.recordChannelEvent("outbox_failed", message, {
        outbox_id: entry.id,
        source_route_key: entry.source_route_key
      });
      return recordRuntimeChannelOutboundDelivery(this.store, entry, {
        status: "failed",
        error: message
      });
    }
  }

  private feishuSessionSource(message: NormalizedFeishuTextMessage, profile?: string): RuntimeSessionSource {
    return {
      kind: "feishu",
      channelId: this.channelId,
      conversationType: message.chatType,
      conversationId: message.chatId,
      threadId: message.threadId,
      actorId: message.openId,
      profile
    };
  }

  private async finalTextForRun(result: RunResult): Promise<string> {
    if (result.final_response_ref) {
      const text = await this.store.readStateText(result.final_response_ref, 20000);
      if (text.trim()) return text.trim();
    }
    return [
      "The run completed without a final response artifact.",
      "",
      `Verdict: ${result.verdict}`,
      `Session: ${result.session_id}`,
      `Evidence refs: ${result.evidence_refs.join(", ")}`
    ].join("\n");
  }

  private async handleOperatorCommand(
    message: NormalizedFeishuPrivateMessage,
    command: FeishuOperatorCommand
  ): Promise<void> {
    let inboundRef = "";
    let outboundRef = "";
    try {
      inboundRef = await this.recordInbound(message);
      const text = await this.renderOperatorCommand(command);
      const outbound = await this.sendChunks(message.openId, text);
      outboundRef = await this.store.writeJson(`channels/feishu/operator/${message.messageId}.json`, {
        source_message_id: message.messageId,
        open_id: message.openId,
        command,
        text,
        sends: outbound,
        inbound_ref: inboundRef,
        created_at: utcNow()
      });
      await this.recordChannelEvent("operator_command", `Handled Feishu operator command ${command.name}.`, {
        artifact_ref: outboundRef,
        inbound_ref: inboundRef,
        message_id: message.messageId,
        open_id: message.openId,
        command
      });
    } catch (error) {
      const errorText = errorMessage(error);
      const outbound = await this.sendChunks(message.openId, this.config.errorText);
      outboundRef = await this.store.writeJson(`channels/feishu/errors/${message.messageId}.json`, {
        message_id: message.messageId,
        open_id: message.openId,
        command,
        error: errorText,
        outbound,
        inbound_ref: inboundRef || null,
        created_at: utcNow()
      });
      await this.recordChannelEvent("error", `Feishu operator command ${command.name} failed: ${errorText}`, {
        message_id: message.messageId,
        open_id: message.openId,
        inbound_ref: inboundRef || null,
        outbound_ref: outboundRef,
        command
      });
    }
  }

  private async renderOperatorCommand(command: FeishuOperatorCommand): Promise<string> {
    if (command.name === "help") return renderOperatorHelp();
    if (command.name === "capabilities") return renderCapabilityCatalog(getCapabilityCatalog());
    if (command.name === "capability_acceptance") return renderCapabilityAcceptanceAudit(getCapabilityAcceptanceAudit());
    if (command.name === "status") return this.renderStatusCommand();
    if (command.name === "runtime_config") return this.renderRuntimeConfigCommand();
    if (command.name === "service_health") return this.renderServiceHealthCommand();
    if (command.name === "service_logs") return this.renderServiceLogsCommand(command.limit);
    if (command.name === "workspace_status") return this.renderWorkspaceStatusCommand();
    if (command.name === "content_daily") return this.renderContentDailyCommand(command.selection);
    if (command.name === "governance_status") return this.renderGovernanceStatusCommand();
    if (command.name === "sop_evolution") return this.renderSopEvolutionCommand();
    if (command.name === "opportunities") return this.renderOpportunitiesCommand();
    if (command.name === "context_manifests") return this.renderContextManifestsCommand(command.contextRef);
    if (command.name === "context_health") return this.renderContextHealthCommand(command.contextRef);
    if (command.name === "context_usage") return this.renderContextUsageCommand();
    if (command.name === "context_pressure") return this.renderContextPressureCommand();
    if (command.name === "working_checkpoint") return this.renderWorkingCheckpointCommand(command.checkpointRef);
    if (command.name === "pipeline_runs") return this.renderPipelineRunsCommand(command.pipelineRef);
    if (command.name === "session_recap") return this.renderSessionRecapCommand(command.sessionId);
    if (command.name === "episode_memory") return this.renderEpisodeMemoryCommand(command);
    if (command.name === "episode_archives") return this.renderEpisodeArchivesCommand(command.archiveRef);
    if (command.name === "episode_archive_health") return this.renderEpisodeArchiveHealthCommand(command.archiveRef);
    if (command.name === "memory_candidates") return this.renderMemoryCandidatesCommand(command.candidateRef);
    if (command.name === "memory_confirmations") return this.renderMemoryConfirmationsCommand(command.confirmationRef);
    if (command.name === "memory_accepted") return this.renderAcceptedMemoryCommand(command.semanticMemoryRef);
    if (command.name === "review_confirmations") return this.renderReviewConfirmationsCommand(command);
    if (command.name === "review_reports") return this.renderReviewReportsCommand(command.reviewRef);
    if (command.name === "completion_verifications") return this.renderCompletionVerificationsCommand(command.completionRef);
    if (command.name === "live_run_traces") return this.renderLiveRunTracesCommand(command.traceRef);
    if (command.name === "harness_replays") return this.renderHarnessReplaysCommand(command.replayRef);
    if (command.name === "skill_catalog") return this.renderSkillCatalogCommand(command.skillRef);
    if (command.name === "skill_registry_health") return this.renderSkillRegistryHealthCommand(command.skillName);
    if (command.name === "selected_skill_outcomes") return this.renderSelectedSkillOutcomesCommand(command.outcomeRef);
    if (command.name === "selected_skill_drifts") return this.renderSelectedSkillDriftsCommand(command.skillName);
    if (command.name === "skill_registry_events") return this.renderSkillRegistryEventsCommand(command.eventRef, command.skillName);
    if (command.name === "review_ticks") return this.renderReviewTicksCommand(command.tickRef);
    if (command.name === "reused_skill_coverage") return this.renderReusedSkillCoverageCommand(command.sopRef);
    return this.renderReviewInboxCommand(command);
  }

  private async renderStatusCommand(): Promise<string> {
    const heartbeat = await readOptionalStateRecord(this.store, "services/runtime/heartbeat.json");
    const reviewTick = await readOptionalStateRecord(this.store, "services/runtime/review_tick.json");
    const contentDaily = await readOptionalStateRecord(this.store, "services/runtime/content_daily.json");
    const feedbackRefresh = await readOptionalStateRecord(this.store, "services/runtime/content_feedback_refresh.json");
    const creatorMetrics = await readOptionalStateRecord(this.store, "services/runtime/content_creator_metrics.json");
    const pauseSignal = await readOptionalStateRecord(this.store, "autonomy/runs/pause_signal.json");
    const inbox = await this.reviewRunner.listReviewInbox({ limit: 5 });
    const contentDailyEffective = await summarizeContentDailyEffectiveStatus(this.store, contentDaily);
    const publishEvents = await listContentDailyPublishEvents(this.store, contentDaily, 5);
    return [
      "Local Runtime status",
      "",
      `Runtime: ${stringField(heartbeat, "state") ?? "unknown"}${numberField(heartbeat, "pid") ? ` (pid ${numberField(heartbeat, "pid")})` : ""}`,
      `Channel: ${stringField(heartbeat, "channel_id") ?? "unknown"}`,
      `Scenario: ${stringField(heartbeat, "scenario_id") ?? "unknown"}`,
      `Heartbeat: ${stringField(heartbeat, "updated_at") ?? "unknown"}`,
      ...renderRuntimeBuildStatus(heartbeat),
      `Review tick: ${stringField(reviewTick, "state") ?? "unknown"} (enabled=${booleanField(reviewTick, "enabled") ?? false})`,
      ...renderReviewTickInboxCounts(reviewTick),
      ...renderReviewTickInactiveDiagnosis(reviewTick),
      ...renderReviewTickWake(reviewTick),
      ...renderReviewTickFocus(reviewTick),
      ...renderContentDailyStatus(contentDaily, contentDailyEffective.status, publishEvents),
      ...renderContentFeedbackRefreshStatus(feedbackRefresh),
      ...renderContentCreatorMetricsStatus(creatorMetrics),
      ...renderAutonomyPauseStatus(pauseSignal, this.store.stateRoot),
      `Active review inbox: ${inbox.count}`,
      "",
      "This is a read-only local status view."
    ].join("\n");
  }

  private async renderRuntimeConfigCommand(): Promise<string> {
    const summary = await loadRuntimeConfigSummary({
      configDir: this.configDir,
      stateRoot: this.store.stateRoot
    });
    return renderRuntimeConfigSummary(summary);
  }

  private async renderGovernanceStatusCommand(): Promise<string> {
    const status = await getGovernanceStatus(this.store, { limit: 3, vaultRoot: this.vaultRoot });
    return renderGovernanceStatus(status);
  }

  private async renderServiceHealthCommand(): Promise<string> {
    const health = await getServiceHealth(this.store);
    const lines = [
      "Service health",
      "",
      `overall: ${health.status}`,
      `runtime_substrate: ${health.layers.runtime_substrate.status} reasons=${health.layers.runtime_substrate.reason_codes.join(",") || "none"}`,
      `application_slices: ${health.layers.application_slices.status} reasons=${health.layers.application_slices.reason_codes.join(",") || "none"}`,
      `runtime_state: ${health.service.state}`,
      `pid: ${health.service.pid ?? "unknown"}`,
      `channel: ${health.service.channel_id ?? "unknown"}`,
      `scenario: ${health.service.scenario_id ?? "unknown"}`,
      `heartbeat_freshness: ${health.service.heartbeat_freshness}`,
      `heartbeat_age_ms: ${health.service.heartbeat_age_ms ?? "unknown"}`,
      `heartbeat_updated_at: ${health.service.heartbeat_updated_at ?? "unknown"}`,
      ...renderRuntimeBuildLines(health.service.runtime_build ?? null),
      ...renderServiceDeploymentLines(health.service.deployment),
      `review_tick_state: ${health.review_tick.state}`,
      `review_tick_enabled: ${health.review_tick.enabled}`,
      `review_tick_updated_at: ${health.review_tick.updated_at ?? "unknown"}`,
      `review_tick_last_ref: ${health.review_tick.last_tick_ref ?? "none"}`,
      `review_tick_last_inbox_count: ${health.review_tick.last_inbox_count ?? "none"}`,
      `review_tick_last_active_tick_inbox_count: ${health.review_tick.last_active_tick_inbox_count ?? "none"}`,
      `review_tick_last_active_inbox_count: ${health.review_tick.last_active_inbox_count ?? "none"}`,
      `review_tick_last_inactive_tick_inbox_count: ${health.review_tick.last_inactive_tick_inbox_count ?? "none"}`,
      ...(health.review_tick.last_inactive_tick_inbox_reasons ? [
        `review_tick_last_inactive_tick_inbox_reasons: ${renderStatusCounts(health.review_tick.last_inactive_tick_inbox_reasons)}`
      ] : []),
      ...(health.review_tick.last_inactive_tick_inbox_refs?.length ? [
        `review_tick_last_inactive_tick_inbox_refs: ${health.review_tick.last_inactive_tick_inbox_refs.join(",")}`
      ] : []),
      `review_tick_next_wake_at: ${health.review_tick.next_wake_at ?? "none"}`,
      `review_tick_next_wake_delay_ms: ${health.review_tick.next_wake_delay_ms ?? "none"}`,
      `review_tick_next_wake_reason: ${health.review_tick.next_wake_reason ?? "none"}`,
      `review_tick_focus_current: ${health.review_tick.last_focus_current_status ?? "unknown"}`,
      ...(health.review_tick.last_focus_current_backlog_status ? [`review_tick_focus_backlog_status: ${health.review_tick.last_focus_current_backlog_status}`] : []),
      ...(health.review_tick.last_focus_current_ref ? [`review_tick_focus_current_ref: ${health.review_tick.last_focus_current_ref}`] : []),
      ...(health.review_tick.last_focus_current_reason ? [`review_tick_focus_current_reason: ${truncateText(health.review_tick.last_focus_current_reason, 180)}`] : []),
      `review_tick_auto_action: ${health.review_tick.last_auto_action_status ?? "unknown"}`,
      `review_tick_auto_action_item: ${health.review_tick.last_auto_action_opportunity_kind && health.review_tick.last_auto_action_opportunity_id ? `${health.review_tick.last_auto_action_opportunity_kind}:${health.review_tick.last_auto_action_opportunity_id}` : "none"}`,
      `review_tick_auto_action_result: ${health.review_tick.last_auto_action_result_ref ?? "none"}`,
      ...(health.review_tick.last_auto_action_summary ? [`review_tick_auto_action_summary: ${truncateText(health.review_tick.last_auto_action_summary, 180)}`] : []),
      ...(health.review_tick.last_auto_action_ref ? [`review_tick_auto_action_ref: ${health.review_tick.last_auto_action_ref}`] : []),
      ...renderServiceHealthFocus(health.review_tick.last_focus),
      `content_daily_state: ${health.content_daily.state}`,
      `content_daily_enabled: ${health.content_daily.enabled}`,
      `content_daily_last_job_status: ${health.content_daily.last_job_status ?? "unknown"}`,
      `content_daily_last_effective_job_status: ${health.content_daily.last_effective_job_status ?? "unknown"}`,
      `content_daily_last_job_count: ${health.content_daily.last_job_count ?? "unknown"}`,
      ...(health.content_daily.last_publish_count !== undefined ? [
        `content_daily_publish_counts: count=${health.content_daily.last_publish_count} published=${health.content_daily.last_publish_published_count ?? "unknown"} direct=${health.content_daily.last_publish_direct_count ?? "unknown"} reconciled=${health.content_daily.last_publish_reconciled_count ?? "unknown"} failed=${health.content_daily.last_publish_failed_count ?? "unknown"}`,
        ...(health.content_daily.last_publish_adapters?.length ? [
          `content_daily_publish_adapters: ${health.content_daily.last_publish_adapters.join(",")}`
        ] : []),
        ...(health.content_daily.last_publish_latest_run_ref ? [
          `content_daily_latest_publish: ${health.content_daily.last_publish_latest_title ?? "unknown"} / ${health.content_daily.last_publish_latest_route ?? "unknown"} / ${health.content_daily.last_publish_latest_run_ref}`
        ] : [])
      ] : []),
      `content_daily_strategy_counts: applied=${health.content_daily.last_applied_strategy_count ?? "unknown"} blocked=${health.content_daily.last_blocked_strategy_count ?? "unknown"}`,
      ...(health.content_daily.last_applied_strategy_postures?.length ? [
        `content_daily_applied_strategy_postures: ${health.content_daily.last_applied_strategy_postures.join(",")}`
      ] : []),
      ...(health.content_daily.last_applied_strategy_source_run_refs?.length ? [
        `content_daily_applied_strategy_sources: ${health.content_daily.last_applied_strategy_source_run_refs.join(",")}`
      ] : []),
      ...(health.content_daily.last_skip_reason ? [`content_daily_last_skip_reason: ${health.content_daily.last_skip_reason}`] : []),
      ...renderServiceHealthContentDailyProgress(health.content_daily),
      `content_daily_updated_at: ${health.content_daily.updated_at ?? "unknown"}`,
      ...(health.content_daily.error ? [`content_daily_error: ${truncateText(health.content_daily.error, 180)}`] : []),
      `feedback_refresh_state: ${health.content_feedback_refresh.state}`,
      `feedback_refresh_enabled: ${health.content_feedback_refresh.enabled}`,
      `feedback_refresh_queue_count: ${health.content_feedback_refresh.last_queue_count ?? "unknown"}`,
      `feedback_refresh_due_count: ${health.content_feedback_refresh.last_due_count ?? "unknown"}`,
      `feedback_refresh_skipped_count: ${health.content_feedback_refresh.last_skipped_count ?? "unknown"}`,
      ...(health.content_feedback_refresh.last_top_skip_reason ? [
        `feedback_refresh_top_skip_reason: ${health.content_feedback_refresh.last_top_skip_reason}`
      ] : []),
      ...(health.content_feedback_refresh.last_skip_reason_counts ? [
        `feedback_refresh_skip_reasons: ${renderStatusCounts(health.content_feedback_refresh.last_skip_reason_counts)}`
      ] : []),
      `feedback_refresh_next_due_at: ${health.content_feedback_refresh.next_due_at ?? "none"}`,
      `feedback_refresh_next_wake_at: ${health.content_feedback_refresh.next_wake_at ?? "none"}`,
      `feedback_refresh_next_wake_delay_ms: ${health.content_feedback_refresh.next_wake_delay_ms ?? "none"}`,
      `feedback_refresh_next_wake_reason: ${health.content_feedback_refresh.next_wake_reason ?? "none"}`,
      ...(health.content_feedback_refresh.next_due_run_ref ? [
        `feedback_refresh_next_due_run: ${health.content_feedback_refresh.next_due_run_ref}`,
        `feedback_refresh_next_due_reason: ${health.content_feedback_refresh.next_due_reason ?? "unknown"}`
      ] : []),
      ...(health.content_feedback_refresh.next_due_command ? [
        `feedback_refresh_next_due_command: ${health.content_feedback_refresh.next_due_command}`
      ] : []),
      `feedback_strategy_captured_by: ${health.content_feedback_refresh.last_strategy_captured_by ?? "unknown"}`,
      `feedback_strategy_suggestion_count: ${health.content_feedback_refresh.last_strategy_suggestion_count ?? "unknown"}`,
      `feedback_strategy_high_priority_count: ${health.content_feedback_refresh.last_strategy_high_priority_count ?? "unknown"}`,
      `feedback_strategy_collect_more_feedback_count: ${health.content_feedback_refresh.last_strategy_collect_more_feedback_count ?? "unknown"}`,
      `feedback_strategy_repair_feedback_capture_count: ${health.content_feedback_refresh.last_strategy_repair_feedback_capture_count ?? "unknown"}`,
      `feedback_strategy_revise_next_post_count: ${health.content_feedback_refresh.last_strategy_revise_next_post_count ?? "unknown"}`,
      `feedback_strategy_reuse_baseline_count: ${health.content_feedback_refresh.last_strategy_reuse_baseline_count ?? "unknown"}`,
      `feedback_strategy_verify_metrics_count: ${health.content_feedback_refresh.last_strategy_verify_metrics_count ?? "unknown"}`,
      ...(health.content_feedback_refresh.last_strategy_top_posture ? [
        `feedback_strategy_top: ${health.content_feedback_refresh.last_strategy_top_posture} / ${health.content_feedback_refresh.last_strategy_top_priority ?? "unknown"} / ${health.content_feedback_refresh.last_strategy_top_title ?? "unknown"}`,
        `feedback_strategy_top_run: ${health.content_feedback_refresh.last_strategy_top_run_ref ?? "unknown"}`
      ] : []),
      ...(health.content_feedback_refresh.last_strategy_next_command ? [
        `feedback_strategy_next_command: ${health.content_feedback_refresh.last_strategy_next_command}`
      ] : []),
      `feedback_refresh_updated_at: ${health.content_feedback_refresh.updated_at ?? "unknown"}`,
      ...(health.content_feedback_refresh.error ? [`feedback_refresh_error: ${truncateText(health.content_feedback_refresh.error, 180)}`] : []),
      `creator_metrics_state: ${health.content_creator_metrics.state}`,
      `creator_metrics_enabled: ${health.content_creator_metrics.enabled}`,
      `creator_metrics_queue_count: ${health.content_creator_metrics.last_queue_count ?? "unknown"}`,
      `creator_metrics_captured_count: ${health.content_creator_metrics.last_captured_count ?? "unknown"}`,
      `creator_metrics_blocked_count: ${health.content_creator_metrics.last_blocked_count ?? "unknown"}`,
      `creator_metrics_failed_count: ${health.content_creator_metrics.last_failed_count ?? "unknown"}`,
      `creator_metrics_next_due_at: ${health.content_creator_metrics.next_due_at ?? "none"}`,
      `creator_metrics_next_wake_at: ${health.content_creator_metrics.next_wake_at ?? "none"}`,
      `creator_metrics_next_wake_delay_ms: ${health.content_creator_metrics.next_wake_delay_ms ?? "none"}`,
      `creator_metrics_next_wake_reason: ${health.content_creator_metrics.next_wake_reason ?? "none"}`,
      ...(health.content_creator_metrics.next_due_run_ref ? [
        `creator_metrics_next_due_run: ${health.content_creator_metrics.next_due_run_ref}`
      ] : []),
      ...(health.content_creator_metrics.next_due_command ? [
        `creator_metrics_next_due_command: ${health.content_creator_metrics.next_due_command}`
      ] : []),
      ...(health.content_creator_metrics.last_run_refs && health.content_creator_metrics.last_run_refs.length > 0 ? [
        `creator_metrics_last_runs: ${health.content_creator_metrics.last_run_refs.join(",")}`
      ] : []),
      ...(health.content_creator_metrics.last_next_commands && health.content_creator_metrics.last_next_commands.length > 0 ? [
        `creator_metrics_next_command: ${health.content_creator_metrics.last_next_commands[0]}`
      ] : []),
      `creator_metrics_updated_at: ${health.content_creator_metrics.updated_at ?? "unknown"}`,
      ...(health.content_creator_metrics.error ? [`creator_metrics_error: ${truncateText(health.content_creator_metrics.error, 180)}`] : []),
      `autonomy_pause_active: ${health.autonomy_pause.active}`,
      ...(health.autonomy_pause.reason ? [`autonomy_pause_reason: ${truncateText(health.autonomy_pause.reason, 180)}`] : []),
      ...(health.autonomy_pause.resume_hint ? [`autonomy_pause_resume_hint: ${truncateText(health.autonomy_pause.resume_hint, 180)}`] : []),
      "",
      "Refs:",
      ...(health.refs.length > 0 ? health.refs.map((ref) => `- ${ref}`) : ["- none"]),
      "",
      `Boundary: ${health.boundary}`
    ];
    return lines.join("\n");
  }

  private async renderServiceLogsCommand(limit?: number): Promise<string> {
    const lineLimit = clampLogLimit(limit);
    const homeRoot = this.homeRoot;
    const stdoutPath = resolve(homeRoot, "logs/runtime.out.log");
    const stderrPath = resolve(homeRoot, "logs/runtime.err.log");
    const [stdoutTail, stderrTail] = await Promise.all([
      tailLogFile(stdoutPath, lineLimit),
      tailLogFile(stderrPath, lineLimit)
    ]);
    return [
      "Service logs",
      "",
      `home: ${homeRoot}`,
      `limit: ${lineLimit} lines per stream`,
      "",
      "stdout:",
      stdoutTail || "(empty)",
      "",
      "stderr:",
      stderrTail || "(empty)",
      "",
      "This command is read-only. It reads only LOCAL_RUNTIME_HOME service log tails and does not run shell commands, inspect launchd, restart services, invoke the model, or mutate state."
    ].join("\n");
  }

  private async renderWorkspaceStatusCommand(): Promise<string> {
    return renderWorkspaceStatus(await getWorkspaceStatus(this.store, { limit: 12 }));
  }

  private async renderContentDailyCommand(selection?: string): Promise<string> {
    const service = await readOptionalStateRecord(this.store, "services/runtime/content_daily.json");
    const serviceEffective = await summarizeContentDailyEffectiveStatus(this.store, service);
    const publishEvents = await listContentDailyPublishEvents(this.store, service, 5);
    const resolved = await this.resolveContentSelection(selection, service);
    if (resolved.kind === "run") {
      const creatorMetrics = await listContentCreatorMetricsNeeded(this.store, {
        runRef: resolved.detail.summary.id,
        limit: 3
      });
      return renderContentRunDetail(resolved.detail, this.store.stateRoot, creatorMetrics.items);
    }
    if (!resolved.job) {
      const recentRefs = await this.listRecentDailyJobRefs(5);
      return [
        "Content daily",
        "",
        ...renderContentDailyServiceLines(service, serviceEffective.status, publishEvents),
        selection ? `selection: ${selection}` : "selection: latest",
        "job: none",
        "",
        ...(recentRefs.length > 0 ? [
          "Recent daily jobs:",
          ...recentRefs.map((ref) => `- ${ref}`)
        ] : [
          "No daily content jobs found."
        ]),
        "",
        `Create command: pnpm run runtime -- content daily --dry-run --date ${contentDailyDateKey()} --state-root ${this.store.stateRoot}`,
        "",
        "This command is read-only. It does not generate images, call MCP, publish, invoke the model, or mutate state."
      ].join("\n");
    }

    let runDetail: ContentRunDetailResult | null = null;
    try {
      runDetail = await getContentRun(this.store, { runRef: resolved.job.run_id });
    } catch {
      runDetail = null;
    }
    const creatorMetrics = runDetail
      ? await listContentCreatorMetricsNeeded(this.store, {
        runRef: runDetail.summary.id,
        limit: 3
      })
      : null;
    return renderContentDailyJob(resolved.job, runDetail, service, this.store.stateRoot, creatorMetrics?.items ?? [], serviceEffective.status, publishEvents);
  }

  private async resolveContentSelection(
    selection: string | undefined,
    service: Record<string, unknown> | null
  ): Promise<
    | { kind: "job"; job: DailyContentJobResult | null }
    | { kind: "run"; detail: ContentRunDetailResult }
  > {
    const selected = selection?.trim();
    if (selected && (selected.startsWith("content_run_") || selected.includes("content/runs/"))) {
      return { kind: "run", detail: await getContentRun(this.store, { runRef: selected }) };
    }

    const jobRef = resolveContentDailyJobRef(selected, stringField(service, "last_job_ref"));
    if (!jobRef) return { kind: "job", job: null };
    const job = await this.store.readStateJson<DailyContentJobResult>(jobRef);
    return { kind: "job", job };
  }

  private async listRecentDailyJobRefs(limit: number): Promise<string[]> {
    return (await this.store.listStateFiles("content/daily"))
      .filter((ref) => ref.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);
  }

  private async renderOpportunitiesCommand(): Promise<string> {
    const result = await getOpportunityBacklog(this.store, {
      limit: 5,
      vaultRoot: this.vaultRoot
    });
    return renderOpportunityBacklog(result);
  }

  private async renderSopEvolutionCommand(): Promise<string> {
    const result = await getSopEvolutionLedger(this.store, {
      limit: 5,
      vaultRoot: this.vaultRoot
    });
    return renderSopEvolutionLedgerMarkdown(result);
  }

  private async renderPipelineRunsCommand(pipelineRef?: string): Promise<string> {
    if (pipelineRef) {
      return renderPipelineHistoryDetail(await getPipelineRun(this.store, { pipelineRef }));
    }
    return renderPipelineHistoryList(await listPipelineRuns(this.store, { limit: 5 }));
  }

  private async renderReusedSkillCoverageCommand(sopRef: string): Promise<string> {
    const result = await this.reviewRunner.getReusedSkillCoverage({ sopRef });
    return renderReusedSkillCoverageMarkdown(result);
  }

  private async renderContextManifestsCommand(contextRef?: string): Promise<string> {
    if (contextRef) {
      const result = await showContextManifest(this.store, contextLookup(contextRef));
      return [
        "Context manifest",
        "",
        `session: ${result.manifest.session_id}`,
        `turn: ${result.manifest.turn_id}`,
        `created: ${result.manifest.created_at}`,
        `ref: ${result.ref}`,
        `context: ${result.context_ref}`,
        `chars: ${result.manifest.total_chars}`,
        `sections: ${result.manifest.section_count}`,
        `memory_hits: ${result.manifest.recall.memory_hit_count}`,
        `archive_refs: ${result.manifest.recall.archive_ref_count}`,
        `opportunity_refs: ${result.manifest.recall.opportunity_ref_count ?? 0}`,
        `skill_refs: ${result.manifest.recall.skill_ref_count}`,
        `discipline: ${result.manifest.recall.discipline_active ? "active" : "inactive"}`,
        "",
        "Sections:",
        ...result.manifest.sections.flatMap((section, index) => [
          `${index + 1}. ${section.title}`,
          `   chars: ${section.chars}`,
          `   items: ${section.item_count}`,
          `   refs: ${section.refs.length > 0 ? section.refs.join(", ") : "none"}`
        ]),
        "",
        "This command is read-only and does not read raw context Markdown."
      ].join("\n");
    }

    const result = await listContextManifests(this.store, 5);
    if (result.manifests.length === 0) {
      return [
        "Context manifests",
        "",
        "No context manifests.",
        "",
        "This command is read-only and does not read raw context Markdown."
      ].join("\n");
    }
    return [
      "Context manifests",
      "",
      ...result.manifests.flatMap(renderContextManifestSummary),
      "",
      "This command is read-only. Use /context <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderContextPressureCommand(): Promise<string> {
    const contextBudget = await this.loadContextBudget();
    const result = await listContextPressure(this.store, { limit: 5, contextBudget });
    if (result.pressures.length === 0) {
      return [
        "Context pressure",
        "",
        "No context pressure found in recent manifests.",
        ...renderContextBudgetLines(contextBudget),
        "",
        "This command is read-only and reads context manifest metadata only."
      ].join("\n");
    }
    return [
      "Context pressure",
      "",
      ...renderContextBudgetLines(contextBudget),
      ...(contextBudget ? [""] : []),
      ...result.pressures.flatMap(renderContextPressureSummary),
      "",
      "This command is read-only. Inspect the manifest before changing context assembly."
    ].join("\n");
  }

  private async renderContextUsageCommand(): Promise<string> {
    const contextBudget = await this.loadContextBudget();
    const result = await getContextUsage(this.store, { limit: 5, contextBudget });
    return renderContextUsage(result);
  }

  private async loadContextBudget() {
    const summary = await loadRuntimeConfigSummary({
      configDir: this.configDir,
      stateRoot: this.store.stateRoot
    });
    return summary.active_model.context_budget ?? null;
  }

  private async renderContextHealthCommand(contextRef?: string): Promise<string> {
    const result = await getContextHealth(this.store, { limit: 5, contextRef });
    if (result.issues.length === 0) {
      return [
        "Context health",
        "",
        `status: ${result.status}`,
        `manifests: ${result.valid_manifest_count}/${result.manifest_count} valid`,
        contextRef ? `selection: ${contextRef}` : "selection: all",
        contextRef ? "issues: none matched" : "issues: none",
        "",
        "This command is read-only and does not read raw context Markdown."
      ].join("\n");
    }
    return [
      "Context health",
      "",
      `status: ${result.status}`,
      `manifests: ${result.valid_manifest_count}/${result.manifest_count} valid`,
      `invalid_manifests: ${result.invalid_manifest_count}`,
      `missing_contexts: ${result.missing_context_count}`,
      `orphan_contexts: ${result.orphan_context_count}`,
      contextRef ? `selection: ${contextRef}` : "selection: all",
      "",
      ...result.issues.flatMap((issue, index) => renderContextHealthIssue(issue, index, Boolean(contextRef))),
      "",
      "This command is read-only. Repair manifest sidecars before trusting context diagnostics."
    ].join("\n");
  }

  private async renderWorkingCheckpointCommand(checkpointRef?: string): Promise<string> {
    if (checkpointRef) {
      const result = await getWorkingCheckpoint(this.store, { checkpointRef });
      return [
        "Working checkpoint",
        "",
        ...renderWorkingCheckpointSummary(result.summary, 0),
        "",
        "Known constraints:",
        ...(result.checkpoint.known_constraints.length > 0
          ? result.checkpoint.known_constraints.slice(0, 8).map((item) => `- ${truncateText(item, 220)}`)
          : ["- none"]),
        "",
        "Open questions:",
        ...(result.checkpoint.open_questions.length > 0
          ? result.checkpoint.open_questions.slice(0, 5).map((item) => `- ${truncateText(item, 220)}`)
          : ["- none"]),
        "",
        "This command is read-only and does not read raw evidence artifacts."
      ].join("\n");
    }
    const result = await listWorkingCheckpoints(this.store, { limit: 5 });
    if (result.checkpoints.length === 0) {
      return [
        "Working checkpoints",
        "",
        "No working checkpoints.",
        "",
        "This command is read-only and reads bounded checkpoint JSON only."
      ].join("\n");
    }
    return [
      "Working checkpoints",
      "",
      ...result.checkpoints.flatMap(renderWorkingCheckpointSummary),
      "",
      "This command is read-only. Use /working <ref-or-id> to inspect one checkpoint."
    ].join("\n");
  }

  private async renderEpisodeMemoryCommand(command: Extract<FeishuOperatorCommand, { name: "episode_memory" }>): Promise<string> {
    const memory = new MemoryStore(this.store);
    try {
      if (command.mode === "session") {
        const events = await memory.recallSessionWindow(command.sessionId, 5);
        if (events.length === 0) {
          return [
            "Episode memory session",
            "",
            `session: ${command.sessionId}`,
            "No matching episode events.",
            "",
            "This command is read-only and does not rebuild the SQLite index."
          ].join("\n");
        }
        return [
          "Episode memory session",
          "",
          `session: ${command.sessionId}`,
          ...events.flatMap(renderEpisodeEvent),
          "",
          "This command is read-only and does not rebuild the SQLite index."
        ].join("\n");
      }

      const hits = await memory.recallEpisodes(command.query, 5);
      if (hits.length === 0) {
        return [
          "Episode memory search",
          "",
          `query: ${command.query}`,
          "No matching episode events.",
          "",
          "This command is read-only and does not rebuild the SQLite index."
        ].join("\n");
      }
      return [
        "Episode memory search",
        "",
        `query: ${command.query}`,
        ...hits.flatMap(renderEpisodeSearchHit),
        "",
        "This command is read-only and does not rebuild the SQLite index."
      ].join("\n");
    } finally {
      memory.close();
    }
  }

  private async renderSessionRecapCommand(sessionId?: string): Promise<string> {
    const result = await getSessionRecap(this.store, {
      sessionId,
      limit: 6
    });
    return renderSessionRecap(result);
  }

  private async renderEpisodeArchivesCommand(archiveRef?: string): Promise<string> {
    if (archiveRef) {
      const result = await getEpisodeArchive(this.store, { archiveRef });
      return [
        "Episode archive",
        "",
        `date: ${result.archive.date}`,
        `created: ${result.archive.created_at}`,
        `ref: ${result.archive_ref}`,
        `markdown: ${result.archive.markdown_ref}`,
        `source: ${result.archive.source_ref}`,
        `events: ${result.archive.event_count}`,
        `sessions: ${result.archive.session_count}`,
        `first_event_at: ${result.archive.first_event_at ?? "unknown"}`,
        `last_event_at: ${result.archive.last_event_at ?? "unknown"}`,
        `kinds: ${renderStatusCounts(result.archive.kind_counts)}`,
        "",
        "Top sessions:",
        ...(result.archive.sessions.length > 0
          ? result.archive.sessions.slice(0, 5).flatMap(renderArchiveSession)
          : ["No sessions archived."]),
        "",
        "Recent events:",
        ...(result.archive.recent_events.length > 0
          ? result.archive.recent_events.slice(-5).flatMap(renderArchiveEvent)
          : ["No recent events archived."]),
        "",
        "This command is read-only. It does not write archives, read raw episode artifacts, or rebuild the SQLite index."
      ].join("\n");
    }

    const result = await listEpisodeArchives(this.store, { limit: 5 });
    if (result.archives.length === 0) {
      return [
        "Episode archives",
        "",
        "No episode archives.",
        "",
        "This command is read-only. Use the local CLI memory archive command to generate summaries explicitly."
      ].join("\n");
    }
    return [
      "Episode archives",
      "",
      ...result.archives.flatMap(renderArchiveSummary),
      "",
      "This command is read-only. Use /memory archive <date-or-ref> to inspect one."
    ].join("\n");
  }

  private async renderEpisodeArchiveHealthCommand(archiveRef?: string): Promise<string> {
    const result = await getArchiveHealth(this.store, {
      limit: archiveRef ? 20 : 5,
      archiveRef
    });
    if (archiveRef) {
      if (result.issues.length === 0) {
        return [
          "Episode archive health",
          "",
          `No archive health issue found for ${archiveRef}.`,
          "",
          result.boundary
        ].join("\n");
      }
      return [
        "Episode archive health",
        "",
        `status: ${result.status}`,
        `checked_at: ${result.checked_at}`,
        `source_events: ${result.source_event_count}`,
        `source_days: ${result.source_day_count}`,
        `archives: ${result.valid_archive_count}/${result.archive_count} valid`,
        `missing: ${result.missing_archive_count}`,
        `stale: ${result.stale_archive_count}`,
        `invalid_archives: ${result.invalid_archive_count}`,
        `invalid_event_rows: ${result.invalid_event_row_count}`,
        "",
        ...result.issues.flatMap(renderArchiveHealthIssue),
        "",
        "This command is read-only. It does not generate archives, read raw episode artifacts, rebuild the SQLite index, invoke the model, or mutate state."
      ].join("\n");
    }

    if (result.issues.length === 0) {
      return [
        "Episode archive health",
        "",
        `status: ${result.status}`,
        `source_events: ${result.source_event_count}`,
        `source_days: ${result.source_day_count}`,
        `archives: ${result.valid_archive_count}/${result.archive_count} valid`,
        "",
        "No archive health issues.",
        "",
        "This command is read-only. Use the local CLI memory archive command to generate summaries explicitly."
      ].join("\n");
    }
    return [
      "Episode archive health",
      "",
      `status: ${result.status}`,
      `source_events: ${result.source_event_count}`,
      `source_days: ${result.source_day_count}`,
      `archives: ${result.valid_archive_count}/${result.archive_count} valid`,
      `missing: ${result.missing_archive_count}`,
      `stale: ${result.stale_archive_count}`,
      `orphan: ${result.orphan_archive_count}`,
      `invalid_archives: ${result.invalid_archive_count}`,
      `invalid_event_rows: ${result.invalid_event_row_count}`,
      "",
      ...result.issues.flatMap(renderArchiveHealthIssue),
      "",
      "This command is read-only. Use /memory archive health <date-or-ref> to inspect one issue group."
    ].join("\n");
  }

  private async renderReviewConfirmationsCommand(command: Extract<FeishuOperatorCommand, { name: "review_confirmations" }>): Promise<string> {
    if (command.confirmationRef) {
      const result = await this.reviewRunner.getReviewFollowUpConfirmation({ confirmationRef: command.confirmationRef });
      return [
        "Review confirmation",
        "",
        `id: ${result.confirmation.id}`,
        `status: ${result.confirmation.status}`,
        `created: ${result.confirmation.created_at}`,
        `executed: ${result.confirmation.executed_at ?? "none"}`,
        `ref: ${result.confirmation_ref}`,
        `source: ${result.confirmation.source ?? "review_proposal"}`,
        `review: ${result.confirmation.review_ref}`,
        `proposal: ${result.confirmation.proposal_id}`,
        ...(result.confirmation.sop_id ? [`sop: ${result.confirmation.sop_id}`] : []),
        ...(result.confirmation.sop_ref ? [`sop_ref: ${result.confirmation.sop_ref}`] : []),
        ...renderSopEvolutionGate(result.sop_evolution_gate),
        ...renderDraftSopReadiness(result.confirmation.draft_sop_readiness),
        `action: ${result.confirmation.action_kind} / ${result.confirmation.action_id}`,
        "",
        `title: ${result.confirmation.action.title}`,
        "",
        "Would write:",
        ...result.confirmation.would_write.map((surface) => `- ${surface}`),
        "",
        "Required refs:",
        ...result.confirmation.required_refs.map((ref) => `- ${ref}`),
        "",
        "Safety boundary:",
        ...result.confirmation.safety_boundary.map((item) => `- ${item}`),
        "",
        `Next step: ${result.confirmation.next_step}`,
        "",
        "Execution gate:",
        ...renderReviewConfirmationExecutionGate(result.confirmation, result.confirmation_ref, this.store.stateRoot, result.sop_evolution_gate, result.sop_evolution_recovery),
        ...(result.sop_evolution_recovery ? [
          "",
          "Recovery playbook:",
          ...renderSopEvolutionRecoveryPlaybook(result.sop_evolution_recovery)
        ] : []),
        ...(result.confirmation.execution_result ? [
          "",
          "Execution result:",
          ...renderReviewFollowUpExecutionSummary(result.confirmation.execution_result)
        ] : []),
        "",
        "This command is read-only. Use the CLI execution command for explicit mutation."
      ].join("\n");
    }

    const gate = command.sopEvolutionGate ?? "all";
    const result = await this.reviewRunner.listReviewFollowUpConfirmations({
      limit: 5,
      sopEvolutionGate: gate
    });
    const title = gate === "all" ? "Review confirmations" : `Review confirmations (${gate})`;
    if (result.confirmations.length === 0) {
      return [
        title,
        "",
        gate === "all" ? "No review confirmations." : `No ${gate} SOP evolution confirmations.`,
        "",
        "This command is read-only."
      ].join("\n");
    }
    return [
      title,
      "",
      ...renderReviewConfirmationGateSummary(result.sop_evolution_gate_summary),
      "",
      ...result.confirmations.flatMap(renderReviewConfirmationSummary),
      "",
      "This command is read-only. Use /review confirmation <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderReviewInboxCommand(command: Extract<FeishuOperatorCommand, { name: "review_inbox" }>): Promise<string> {
    if (command.itemRef) {
      const result = await this.reviewRunner.getReviewInboxItem({ itemRef: command.itemRef });
      return [
        "Review inbox item",
        "",
        `id: ${result.item.id}`,
        `status: ${result.item.status}`,
        `created: ${result.item.created_at}`,
        `updated: ${result.item.updated_at}`,
        `ref: ${result.item_ref}`,
        `source: ${result.item.source}`,
        `review: ${result.item.latest_review_ref}`,
        `first_review: ${result.item.first_review_ref}`,
        `proposal: ${result.item.proposal_type} / ${result.item.proposal_id}`,
        `action: ${result.item.action_kind} / ${result.item.action_id}`,
        `seen: ${result.item.seen_count}`,
        ...(result.item.focus_action_chain
          ? [`focus_action_chain: ${renderActionChainSummary(result.item.focus_action_chain)}`]
          : []),
        "",
        "Duplicate group:",
        ...renderReviewInboxDuplicateGroup(result.duplicate_group, result.item.id),
        "",
        `title: ${result.item.title}`,
        "",
        `rationale: ${truncateText(result.item.rationale, 800)}`,
        "",
        `suggested_command: ${result.item.command ?? "none"}`,
        `confirmation: ${result.item.confirmation_ref ?? "none"}`,
        `executed: ${result.item.executed_at ?? "none"}`,
        "",
        "Operator decision:",
        ...renderReviewInboxDecision(result.latest_decision, result.item.id, this.store.stateRoot),
        "",
        "Would write:",
        ...result.item.would_write.map((surface) => `- ${surface}`),
        "",
        "Required refs:",
        ...result.item.required_refs.map((ref) => `- ${ref}`),
        "",
        "Confirmation gate:",
        ...renderInboxConfirmationGate(result.item, this.store.stateRoot, result.latest_decision),
        ...(result.item.execution_result ? [
          "",
          "Execution result:",
          ...renderReviewFollowUpExecutionSummary(result.item.execution_result)
        ] : []),
        "",
        "This command is read-only. Use the CLI confirmation commands for mutations."
      ].join("\n");
    }

    const status = command.status ?? "active";
    const inbox = await this.reviewRunner.listReviewInbox({ limit: 5, status });
    if (inbox.items.length === 0) {
      return [
        `Review inbox (${status})`,
        "",
        "No matching review inbox items.",
        "",
        "This command is read-only. Use the CLI confirmation commands for mutations."
      ].join("\n");
    }

    return [
      `Review inbox (${status})`,
      "",
      ...inbox.items.flatMap((item, index) => renderInboxItem(item, index)),
      "",
      "This command is read-only. Use /review inbox <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderReviewTicksCommand(tickRef?: string): Promise<string> {
    if (tickRef) {
      const result = await this.reviewRunner.getReviewTick({ tickRef });
      const tick = result.tick;
      return [
        "Review tick",
        "",
        `id: ${tick.id}`,
        `mode: ${tick.mode}`,
        `query: ${tick.query ?? "n/a"}`,
        `session: ${tick.session_id ?? "n/a"}`,
        `created: ${tick.created_at}`,
        `ref: ${result.tick_ref}`,
        `review: ${tick.review_ref}`,
        `proposals: ${tick.proposal_count}`,
        `inbox_items: ${tick.inbox_item_refs.length}`,
        `new_items: ${tick.stats.new_items}`,
        `updated_items: ${tick.stats.updated_items}`,
        "",
        "Focus:",
        `source: ${tick.focus.source}`,
        `reason: ${truncateText(tick.focus.reason, 300)}`,
        `query: ${tick.focus.query ?? "n/a"}`,
        ...(tick.focus.opportunity ? [
          `item: ${tick.focus.opportunity.kind}:${tick.focus.opportunity.id}`,
          `item_ref: ${tick.focus.opportunity.ref}`,
          `item_score: ${tick.focus.opportunity.score}`,
          ...(tick.focus.opportunity.action_chain
            ? [`action_chain: ${renderActionChainSummary(tick.focus.opportunity.action_chain)}`]
            : [])
        ] : []),
        "",
        "Inbox refs:",
        ...(tick.inbox_item_refs.length > 0 ? tick.inbox_item_refs.map((ref) => `- ${ref}`) : ["- none"]),
        "",
        "This command is read-only. It reads tick JSON summaries only and does not run review tick or execute follow-ups."
      ].join("\n");
    }

    const result = await this.reviewRunner.listReviewTicks({ limit: 5 });
    if (result.ticks.length === 0) {
      return [
        "Review ticks",
        "",
        "No review ticks.",
        "",
        "This command is read-only. It does not run review tick."
      ].join("\n");
    }
    return [
      "Review ticks",
      "",
      ...result.ticks.flatMap(renderReviewTickSummary),
      "",
      "This command is read-only. Use /review tick <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderReviewReportsCommand(reviewRef?: string): Promise<string> {
    if (reviewRef) {
      const result = await this.reviewRunner.getBackgroundReviewReport({ reviewRef });
      const review = result.review;
      return [
        "Background review report",
        "",
        `id: ${review.id}`,
        `mode: ${review.mode}`,
        `query: ${review.query ?? "n/a"}`,
        `session: ${review.session_id ?? "n/a"}`,
        `created: ${review.created_at}`,
        `ref: ${result.review_ref}`,
        `events_reviewed: ${review.stats.events_reviewed}`,
        `sessions_seen: ${review.stats.sessions_seen}`,
        `failure_signals: ${review.stats.failure_signal_count}`,
        `sop_signals: ${review.stats.sop_signal_count}`,
        `working_checkpoint: ${review.source.working_checkpoint_ref ?? "none"}`,
        `evidence: ${review.evidence_event_id ?? "none"}`,
        "",
        "Proposals:",
        ...(review.proposals.length > 0
          ? review.proposals.flatMap((proposal) => [
            `- ${proposal.type}/${proposal.id}: ${truncateText(proposal.title, 220)}`,
            `  evidence_refs: ${proposal.evidence_refs.length}`,
            ...(proposal.focus_action_chain
              ? [`  focus_action_chain: ${renderActionChainSummary(proposal.focus_action_chain)}`]
              : []),
            `  next_action: ${truncateText(proposal.next_action, 260)}`
          ])
          : ["- none"]),
        "",
        "Chain summaries:",
        ...(review.chain_summaries.length > 0
          ? review.chain_summaries.flatMap((chain) => [
            `- ${chain.sop_id}: latest=${chain.latest_decision}, status=${chain.sop_status}, events=${chain.event_count}, audits=${chain.audit_count}, promotions=${chain.promotion_events}, reuse=${chain.reuse_events}`,
            `  sop_ref: ${chain.sop_ref}`,
            `  reviews: ${chain.review_refs.slice(0, 3).join(", ") || "none"}`,
            `  audits: ${chain.audit_refs.slice(0, 3).join(", ") || "none"}`,
            `  skills: ${chain.skill_refs.slice(0, 3).join(", ") || "none"}`,
            `  duplicate_skills: ${chain.duplicate_skill_refs.slice(0, 3).join(", ") || "none"}`,
            `  events: ${chain.event_ids.slice(0, 5).join(", ") || "none"}`
          ])
          : ["- none"]),
        "",
        "This command is read-only. It reads background review JSON summaries only and does not run review, request confirmations, execute follow-ups, or read raw review Markdown."
      ].join("\n");
    }

    const result = await this.reviewRunner.listBackgroundReviewReports({ limit: 5 });
    if (result.reviews.length === 0) {
      return [
        "Background review reports",
        "",
        "No background review reports.",
        "",
        "This command is read-only. It does not run background review."
      ].join("\n");
    }
    return [
      "Background review reports",
      "",
      ...result.reviews.flatMap(renderBackgroundReviewSummary),
      "",
      "This command is read-only. Use /review report <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderCompletionVerificationsCommand(completionRef?: string): Promise<string> {
    if (completionRef) {
      const result = await this.reviewRunner.getCompletionVerificationReport({ completionRef });
      const report = result.report;
      const failedOrWarningChecks = report.checks
        .filter((check) => check.status === "fail" || check.status === "warning")
        .slice(0, 8);
      return [
        "Completion verification report",
        "",
        `id: ${report.id}`,
        `session: ${report.session_id}`,
        `turn: ${report.turn_id}`,
        `created: ${report.created_at}`,
        `ref: ${result.report_ref}`,
        `completion_status: ${report.completion_status}`,
        `verification_status: ${report.verification_status}`,
        `verified: ${report.verified}`,
        `summary: ${truncateText(report.summary, 500)}`,
        `envelope_ref: ${report.envelope_ref}`,
        `final_response_ref: ${report.final_response_ref ?? "none"}`,
        `claimed_verification_refs: ${report.claimed_verification_refs.length}`,
        `observation_refs: ${report.observation_refs.length}`,
        "",
        "Failed or warning checks:",
        ...(failedOrWarningChecks.length > 0
          ? failedOrWarningChecks.flatMap((check) => [
            `- ${check.id}: ${check.status}`,
            `  summary: ${truncateText(check.summary, 260)}`,
            `  refs: ${check.refs.slice(0, 5).join(", ") || "none"}`
          ])
          : ["- none"]),
        "",
        "This command is read-only. It reads completion verification JSON only and does not read raw final responses, tool results, or completion Markdown."
      ].join("\n");
    }

    const result = await this.reviewRunner.listCompletionVerificationReports({ limit: 5 });
    if (result.reports.length === 0) {
      return [
        "Completion verification reports",
        "",
        "No completion verification reports.",
        "",
        "This command is read-only. It does not run review or inspect raw artifacts."
      ].join("\n");
    }
    return [
      "Completion verification reports",
      "",
      ...result.reports.flatMap(renderCompletionVerificationSummary),
      "",
      "This command is read-only. Use /review completion <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderLiveRunTracesCommand(traceRef?: string): Promise<string> {
    if (traceRef) {
      const result = await getLiveRunTrace(this.store, { traceRef });
      const trace = result.trace;
      return [
        "Live run trace",
        "",
        `completion_id: ${trace.completion_id}`,
        `session: ${trace.session_id}`,
        `turn: ${trace.turn_id}`,
        `created: ${trace.created_at}`,
        `ref: ${result.trace_ref}`,
        `completion_status: ${trace.completion_status}`,
        `verification_status: ${trace.verification_status}`,
        `verified: ${trace.verified}`,
        `summary: ${truncateText(trace.summary, 500)}`,
        `context_ref: ${trace.context_ref ?? "none"}`,
        `context_manifest_ref: ${trace.context_manifest_ref ?? "none"}`,
        `final_response_ref: ${trace.final_response_ref ?? "none"}`,
        `events: ${trace.event_count} (${renderStatusCounts(trace.event_kind_counts) || "none"})`,
        `tool_results: ${trace.tool_result_count}`,
        `delegated_results: ${trace.delegated_result_count}`,
        `delegated_results_passed: ${trace.delegated_result_passed_count}`,
        `delegated_results_failed: ${trace.delegated_result_failed_count}`,
        `delegated_completion_gate_statuses: pass=${trace.delegated_completion_gate_status_counts.pass}, warning=${trace.delegated_completion_gate_status_counts.warning}, fail=${trace.delegated_completion_gate_status_counts.fail}, skipped=${trace.delegated_completion_gate_status_counts.skipped}`,
        `delegated_dispatch_missing_result_ref: ${trace.delegated_dispatch_missing_result_ref_count}`,
        `harness_state_actions: ${trace.harness_action_count}`,
        `model_diagnostics: ${trace.model_diagnostic_count}`,
        `repo_write_guards: ${trace.repo_write_guard_count}`,
        `observation_refs: ${trace.observation_ref_count}`,
        "",
        "Delegated dispatches:",
        ...(trace.delegated_dispatches.length > 0
          ? trace.delegated_dispatches.flatMap(renderLiveRunDelegatedDispatch)
          : ["- none"]),
        "",
        "Model diagnostics:",
        ...(trace.model_diagnostics.length > 0
          ? trace.model_diagnostics.flatMap(renderLiveRunModelDiagnostic)
          : ["- none"]),
        "",
        "Repo write guards:",
        ...(trace.repo_write_guards.length > 0
          ? trace.repo_write_guards.flatMap(renderLiveRunRepoWriteGuard)
          : ["- none"]),
        "",
        "Rounds:",
        ...(trace.rounds.length > 0
          ? trace.rounds.flatMap(renderLiveRunTraceRound)
          : ["- none"]),
        "",
        "Refs:",
        ...(trace.refs.length > 0
          ? trace.refs.slice(0, 18).map((ref) => `- ${ref}`)
          : ["- none"]),
        "",
        trace.boundary,
        "This command is read-only. It does not run the agent, invoke tools, or render raw model responses, tool bodies, final responses, context Markdown, or harness artifact bodies."
      ].join("\n");
    }

    const result = await listLiveRunTraces(this.store, { limit: 5 });
    if (result.traces.length === 0) {
      return [
        "Live run traces",
        "",
        "No live run traces.",
        "",
        "This command is read-only. It does not run the agent."
      ].join("\n");
    }
    return [
      "Live run traces",
      "",
      ...result.traces.flatMap(renderLiveRunTraceSummary),
      "",
      "This command is read-only. Use /review trace <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderHarnessReplaysCommand(replayRef?: string): Promise<string> {
    if (replayRef) {
      const result = await getHarnessReplayAudit(this.store, { replayRef });
      return [
        "Harness replay audit",
        "",
        ...renderHarnessReplayDetail(result.replay),
        "",
        result.replay.boundary,
        "This command is read-only. It reads replay report metadata only and does not rerun traces, invoke the model, execute tools, write state, write the repo, or write the active vault."
      ].join("\n");
    }

    const result = await listHarnessReplayAudits(this.store, { limit: 5 });
    if (result.replays.length === 0) {
      return [
        "Harness replay audits",
        "",
        "No harness replay audits.",
        "",
        result.boundary
      ].join("\n");
    }
    return [
      "Harness replay audits",
      "",
      ...result.replays.flatMap(renderHarnessReplaySummary),
      "",
      result.boundary,
      "Use /review replay <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderSkillCatalogCommand(skillRef?: string): Promise<string> {
    if (skillRef) {
      const result = await getSkillCatalogEntry(this.store, {
        skillRef,
        vaultRoot: this.vaultRoot
      });
      const skill = result.skill;
      return [
        "Skill catalog entry",
        "",
        `name: ${skill.name}`,
        `status: ${skill.status}`,
        `source: ${skill.source}`,
        `trust_level: ${skill.trust_level}`,
        `description: ${truncateText(skill.description, 500)}`,
        `instructions_ref: ${skill.instructions_ref}`,
        `metadata_ref: ${skill.metadata_ref}`,
        `origin_ref: ${skill.origin_ref ?? "none"}`,
        `source_sop_ref: ${skill.source_sop_ref ?? "none"}`,
        `version: ${skill.version}`,
        `use_count: ${skill.use_count}`,
        `last_used_at: ${skill.last_used_at ?? "none"}`,
        `patch_count: ${skill.patch_count}`,
        `references: ${skill.references_count}`,
        `tool_requirements: ${skill.tool_requirements_count}`,
        `evidence_refs: ${skill.evidence_refs_count}`,
        `updated_at: ${skill.updated_at}`,
        "",
        "This command is read-only. It reads skill frontmatter and registry metadata only and does not read raw skill bodies, mutate skills, write the active vault, invoke the model, or run shell commands."
      ].join("\n");
    }

    const result = await listSkillCatalog(this.store, {
      limit: 5,
      vaultRoot: this.vaultRoot
    });
    if (result.skills.length === 0) {
      return [
        "Skill catalog",
        "",
        "No skills found.",
        "",
        "This command is read-only. It does not run the agent or inspect raw skill bodies."
      ].join("\n");
    }
    return [
      "Skill catalog",
      "",
      ...result.skills.flatMap(renderSkillCatalogSummary),
      "",
      "This command is read-only. Use /skill <name-or-ref> to inspect one skill metadata entry."
    ].join("\n");
  }

  private async renderSkillRegistryHealthCommand(skillName?: string): Promise<string> {
    const result = await getSkillRegistryHealth(this.store, {
      limit: 5,
      skillName,
      vaultRoot: this.vaultRoot
    });
    if (result.issues.length === 0) {
      return [
        "Skill registry health",
        "",
        `status: ${result.status}`,
        `registered_skills: ${result.registered_skill_count}`,
        `active_skill_packages: ${result.active_skill_package_count}`,
        `valid_events: ${result.valid_event_count}`,
        skillName ? `scope: ${skillName}` : "scope: all",
        "",
        "No skill registry health issues.",
        "",
        `Boundary: ${result.boundary}`
      ].join("\n");
    }
    return [
      "Skill registry health",
      "",
      `status: ${result.status}`,
      `checked: ${result.checked_at}`,
      `registered_skills: ${result.registered_skill_count}`,
      `active_skill_packages: ${result.active_skill_package_count}`,
      `valid_events: ${result.valid_event_count}`,
      `issues: ${result.total_issue_count}`,
      skillName ? `scope: ${skillName}` : "scope: all",
      "",
      ...result.issues.flatMap(renderSkillRegistryHealthIssue),
      "",
      "This command is read-only. It reads registry JSONL, skill frontmatter, and skill event metadata only; it does not read raw skill bodies, mutate skills, write the active vault, invoke the model, or run shell commands."
    ].join("\n");
  }

  private async renderSelectedSkillOutcomesCommand(outcomeRef?: string): Promise<string> {
    if (outcomeRef) {
      const result = await getSelectedSkillOutcome(this.store, { outcomeRef });
      const outcome = result.outcome;
      return [
        "Selected skill outcome",
        "",
        `id: ${outcome.id}`,
        `session: ${outcome.session_id}`,
        `turn: ${outcome.turn_id}`,
        `created: ${outcome.created_at}`,
        `ref: ${result.outcome_ref}`,
        `skill: ${outcome.skill_name}`,
        `instructions_ref: ${outcome.instructions_ref}`,
        `metadata_ref: ${outcome.metadata_ref ?? "none"}`,
        `source: ${outcome.source}`,
        `score: ${outcome.score}`,
        `completion_status: ${outcome.completion_status}`,
        `verification_status: ${outcome.verification_status}`,
        `verified: ${outcome.verified}`,
        `verdict: ${outcome.verdict}`,
        `context_manifest_ref: ${outcome.context_manifest_ref}`,
        `completion_report_ref: ${outcome.completion_report_ref}`,
        `final_response_ref: ${outcome.final_response_ref ?? "none"}`,
        `envelope_ref: ${outcome.envelope_ref}`,
        `registry_ok: ${outcome.registry_update.ok}`,
        `registry_use_count: ${outcome.registry_update.use_count ?? "none"}`,
        `registry_last_used_at: ${outcome.registry_update.last_used_at ?? "none"}`,
        "",
        "This command is read-only. It reads selected-skill outcome JSON only and does not read raw skill bodies, context Markdown, final responses, or completion Markdown."
      ].join("\n");
    }

    const result = await listSelectedSkillOutcomes(this.store, { limit: 5 });
    if (result.outcomes.length === 0) {
      return [
        "Selected skill outcomes",
        "",
        "No selected skill outcomes.",
        "",
        "This command is read-only. It does not run the agent or inspect raw artifacts."
      ].join("\n");
    }
    return [
      "Selected skill outcomes",
      "",
      ...result.outcomes.flatMap(renderSelectedSkillOutcomeSummary),
      "",
      "This command is read-only. Use /skill outcome <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderSelectedSkillDriftsCommand(skillName?: string): Promise<string> {
    const result = await listSelectedSkillDrifts(this.store, {
      limit: 5,
      skillName
    });
    if (skillName) {
      const drift = result.drifts.find((item) => item.skill_name === skillName);
      if (!drift) {
        return [
          "Selected skill drift",
          "",
          `No selected skill drift found for ${skillName}.`,
          "",
          "This command is read-only. It does not run the agent or inspect raw artifacts."
        ].join("\n");
      }
      return [
        "Selected skill drift",
        "",
        `id: ${drift.id}`,
        `skill: ${drift.skill_name}`,
        `instructions_ref: ${drift.instructions_ref}`,
        `metadata_ref: ${drift.metadata_ref ?? "none"}`,
        `status: ${drift.status}`,
        `outcome_count: ${drift.outcome_count}`,
        `attention_count: ${drift.attention_count}`,
        `failed_count: ${drift.failed_count}`,
        `skipped_count: ${drift.skipped_count}`,
        `not_done_count: ${drift.not_done_count}`,
        `blocked_count: ${drift.blocked_count}`,
        `unverified_count: ${drift.unverified_count}`,
        `passed_count: ${drift.passed_count}`,
        `latest_outcome_ref: ${drift.latest_outcome_ref}`,
        `latest_attention_outcome_ref: ${drift.latest_attention_outcome_ref}`,
        `latest_completion_report_ref: ${drift.latest_completion_report_ref}`,
        `latest_final_response_ref: ${drift.latest_final_response_ref ?? "none"}`,
        `use_count: ${drift.use_count ?? "none"}`,
        `registry_last_used_at: ${drift.registry_last_used_at ?? "none"}`,
        `verdicts: ${drift.verdicts.join(", ") || "none"}`,
        "",
        "Attention outcomes:",
        ...(drift.attention_outcome_refs.length > 0
          ? drift.attention_outcome_refs.map((ref) => `- ${ref}`)
          : ["- none"]),
        "",
        "This command is read-only. It reads selected-skill outcome summaries only and does not run the agent, mutate skills, or inspect raw skill bodies, context Markdown, final responses, or completion Markdown."
      ].join("\n");
    }

    if (result.drifts.length === 0) {
      return [
        "Selected skill drifts",
        "",
        "No selected skill drifts.",
        "",
        "This command is read-only. It does not run the agent or inspect raw artifacts."
      ].join("\n");
    }
    return [
      "Selected skill drifts",
      "",
      ...result.drifts.flatMap(renderSelectedSkillDriftSummary),
      "",
      "This command is read-only. Use /skill drift <skill-name> to inspect one."
    ].join("\n");
  }

  private async renderSkillRegistryEventsCommand(eventRef?: string, skillName?: string): Promise<string> {
    if (eventRef) {
      const result = await getSkillRegistryEvent(this.store, {
        eventRef,
        vaultRoot: this.vaultRoot
      });
      const event = result.event;
      return [
        "Skill registry event",
        "",
        `id: ${event.id}`,
        `kind: ${event.kind}`,
        `skill: ${event.skill_name}`,
        `created: ${event.created_at}`,
        `ref: ${result.event_ref}`,
        `instructions_ref: ${event.instructions_ref}`,
        `source_sop_ref: ${event.source_sop_ref ?? "none"}`,
        `audit_ref: ${event.audit_ref ?? "none"}`,
        `evidence_refs: ${event.evidence_refs.slice(0, 5).join(", ") || "none"}`,
        `artifact_refs: ${event.artifact_refs.slice(0, 5).join(", ") || "none"}`,
        `summary: ${truncateText(event.summary, 500)}`,
        "",
        "This command is read-only. It reads skill registry event JSONL only and does not read raw skill bodies, mutate skills, write the active vault, invoke the model, or run shell commands."
      ].join("\n");
    }

    const result = await listSkillRegistryEvents(this.store, {
      limit: 5,
      skillName,
      vaultRoot: this.vaultRoot
    });
    if (result.events.length === 0) {
      return [
        "Skill registry events",
        "",
        skillName ? `No skill registry events found for ${skillName}.` : "No skill registry events.",
        "",
        "This command is read-only. It does not run the agent or inspect raw skill bodies."
      ].join("\n");
    }
    return [
      "Skill registry events",
      "",
      ...result.events.flatMap(renderSkillRegistryEventSummary),
      "",
      "This command is read-only. Use /skill event <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderMemoryCandidatesCommand(candidateRef?: string): Promise<string> {
    if (candidateRef) {
      const result = await getMemoryCandidate(this.store, { candidateRef });
      return [
        "Memory candidate",
        "",
        `id: ${result.candidate.id}`,
        `status: ${result.candidate.status}`,
        `scope: ${result.candidate.scope}`,
        `created: ${result.candidate.created_at}`,
        `ref: ${result.candidate_ref}`,
        "",
        `summary: ${result.candidate.summary}`,
        "",
        truncateText(result.candidate.content, 1200),
        "",
        "Confirmation gate:",
        ...renderMemoryCandidateConfirmationGate(result.candidate, result.candidate_ref, this.store.stateRoot),
        "",
        "This command is read-only. Use the CLI confirmation commands for explicit acceptance."
      ].join("\n");
    }

    const result = await listMemoryCandidates(this.store, { limit: 5 });
    if (result.candidates.length === 0) {
      return [
        "Memory candidates",
        "",
        "No memory candidates.",
        "",
        "This command is read-only. Use a future governance command for promotion."
      ].join("\n");
    }
    return [
      "Memory candidates",
      "",
      ...result.candidates.flatMap(renderMemoryCandidateSummary),
      "",
      "This command is read-only. Use /memory candidate <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderMemoryConfirmationsCommand(confirmationRef?: string): Promise<string> {
    if (confirmationRef) {
      const result = await getMemoryCandidateConfirmation(this.store, { confirmationRef });
      return [
        "Memory confirmation",
        "",
        `id: ${result.confirmation.id}`,
        `status: ${result.confirmation.status}`,
        `created: ${result.confirmation.created_at}`,
        `executed: ${result.confirmation.executed_at ?? "none"}`,
        `ref: ${result.confirmation_ref}`,
        `candidate: ${result.confirmation.candidate_ref}`,
        "",
        "Would write:",
        ...result.confirmation.would_write.map((surface) => `- ${surface}`),
        "",
        "Safety boundary:",
        ...result.confirmation.safety_boundary.map((item) => `- ${item}`),
        "",
        `Next step: ${result.confirmation.next_step}`,
        "",
        "Execution gate:",
        ...renderMemoryConfirmationExecutionGate(result.confirmation, result.confirmation_ref, this.store.stateRoot),
        ...(result.confirmation.execution_result ? [
          "",
          "Execution result:",
          `kind: ${result.confirmation.execution_result.kind}`,
          `accepted: ${result.confirmation.execution_result.accepted_ref}`,
          `evidence: ${result.confirmation.execution_result.evidence_event_id}`
        ] : []),
        "",
        "This command is read-only. Use the CLI execution command for explicit acceptance."
      ].join("\n");
    }

    const result = await listMemoryCandidateConfirmations(this.store, { limit: 5 });
    if (result.confirmations.length === 0) {
      return [
        "Memory confirmations",
        "",
        "No memory confirmations.",
        "",
        "This command is read-only."
      ].join("\n");
    }
    return [
      "Memory confirmations",
      "",
      ...result.confirmations.flatMap(renderMemoryConfirmationSummary),
      "",
      "This command is read-only. Use /memory confirmation <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async renderAcceptedMemoryCommand(semanticMemoryRef?: string): Promise<string> {
    if (semanticMemoryRef) {
      const result = await getAcceptedSemanticMemory(this.store, { semanticMemoryRef });
      return [
        "Accepted semantic memory",
        "",
        `id: ${result.memory.id}`,
        `scope: ${result.memory.scope}`,
        `accepted: ${result.memory.accepted_at}`,
        `ref: ${result.memory_ref}`,
        `source: ${result.memory.source_candidate_ref}`,
        "",
        `summary: ${result.memory.summary}`,
        "",
        truncateText(result.memory.content, 1200),
        "",
        "This command is read-only. Accepted semantic memory is local state."
      ].join("\n");
    }

    const result = await listAcceptedSemanticMemories(this.store, { limit: 5 });
    if (result.memories.length === 0) {
      return [
        "Accepted semantic memory",
        "",
        "No accepted semantic memory.",
        "",
        "This command is read-only."
      ].join("\n");
    }
    return [
      "Accepted semantic memory",
      "",
      ...result.memories.flatMap(renderAcceptedSemanticMemorySummary),
      "",
      "This command is read-only. Use /memory accepted <ref-or-id> to inspect one."
    ].join("\n");
  }

  private async loadConversationHistory(
    message: NormalizedFeishuTextMessage,
    limit = 6
  ): Promise<FeishuConversationHistoryItem[]> {
    const inboundRefs = await this.store.listStateFiles("channels/feishu/inbound");
    const outboundRefs = await this.store.listStateFiles("channels/feishu/outbound");
    const rows: FeishuConversationHistoryItem[] = [];
    for (const ref of inboundRefs) {
      const record = await readOptionalStateRecord(this.store, ref);
      if (!record) continue;
      if (stringField(record, "open_id") !== message.openId) continue;
      if (stringField(record, "chat_id") !== message.chatId) continue;
      const messageId = stringField(record, "message_id");
      const text = stringField(record, "text");
      if (!messageId || messageId === message.messageId || !text) continue;
      if (parseOperatorCommand(text)) continue;
      rows.push({
        role: "user",
        message_id: messageId,
        created_at: stringField(record, "created_at") ?? "",
        text: truncateText(text, 500)
      });
    }
    for (const ref of outboundRefs) {
      const record = await readOptionalStateRecord(this.store, ref);
      if (!record) continue;
      if (stringField(record, "open_id") !== message.openId) continue;
      if (stringField(record, "chat_id") !== message.chatId) continue;
      const messageId = stringField(record, "source_message_id");
      const text = stringField(record, "text");
      if (!messageId || messageId === message.messageId || !text) continue;
      rows.push({
        role: "assistant",
        message_id: messageId,
        created_at: stringField(record, "created_at") ?? "",
        text: truncateText(text, 700)
      });
    }
    return rows
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.message_id.localeCompare(right.message_id))
      .slice(-limit);
  }

  private async recordInbound(message: NormalizedFeishuTextMessage): Promise<string> {
    const ref = await this.store.writeJson(`channels/feishu/inbound/${message.messageId}.json`, {
      event_id: message.eventId,
      message_id: message.messageId,
      chat_id: message.chatId,
      chat_type: message.chatType,
      thread_id: message.threadId,
      open_id: message.openId,
      text: message.text,
      raw: message.raw,
      created_at: utcNow()
    });
    await this.recordChannelEvent("inbound", `Accepted Feishu ${message.chatType} message ${message.messageId}.`, {
      artifact_ref: ref,
      message_id: message.messageId,
      chat_id: message.chatId,
      chat_type: message.chatType,
      open_id: message.openId
    });
    return ref;
  }

  private async recordOutbound(
    message: NormalizedFeishuTextMessage,
    result: RunResult,
    text: string,
    sends: FeishuSendResult[],
    args: {
      source?: RuntimeSessionSource;
      runtimeSessionId?: string | null;
      taskRunId?: string | null;
    } = {}
  ): Promise<string> {
    const ref = await this.store.writeJson(`channels/feishu/outbound/${message.messageId}.json`, {
      source_message_id: message.messageId,
      chat_id: message.chatId,
      chat_type: message.chatType,
      thread_id: message.threadId,
      open_id: message.openId,
      session_id: result.session_id,
      turn_id: result.turn_id,
      text,
      sends,
      created_at: utcNow()
    });
    await recordRuntimeChannelOutbound(this.store, {
      source: args.source ?? this.feishuSessionSource(message),
      runtimeSessionId: args.runtimeSessionId ?? null,
      taskRunId: args.taskRunId ?? null,
      inReplyToMessageId: message.messageId,
      purpose: "final",
      status: "sent",
      text,
      providerDeliveryRef: ref,
      providerMessageIds: sentMessageIds(sends)
    });
    await this.recordChannelEvent("outbound", `Sent Feishu final reply for ${message.messageId}.`, {
      artifact_ref: ref,
      message_id: message.messageId,
      chat_id: message.chatId,
      chat_type: message.chatType,
      open_id: message.openId,
      send_count: sends.length
    });
    return ref;
  }

  private async recordRunEvidence(
    result: RunResult,
    args: { inboundRef: string; outboundRef: string; summary: string }
  ): Promise<void> {
    const event = evidenceEventSchema.parse({
      session_id: result.session_id,
      turn_id: result.turn_id,
      kind: "report",
      summary: args.summary,
      artifact_refs: [
        args.inboundRef,
        result.context_ref,
        result.model_response_ref,
        result.envelope_ref,
        ...(result.final_response_ref ? [result.final_response_ref] : []),
        args.outboundRef
      ]
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
  }

  private async recordChannelEvent(kind: string, summary: string, data: Record<string, unknown>): Promise<void> {
    await this.store.appendJsonl("channels/feishu/events.jsonl", {
      kind,
      summary,
      data,
      created_at: utcNow()
    });
  }

  private isAllowed(openId: string): boolean {
    return this.config.allowedOpenIds.length === 0 || this.config.allowedOpenIds.includes(openId);
  }

  private isDuplicate(messageId: string): boolean {
    return this.seenSet.has(messageId);
  }

  private async markSeen(messageId: string): Promise<void> {
    if (this.seenSet.has(messageId)) return;
    this.seenSet.add(messageId);
    this.seenMessageIds.push(messageId);
    while (this.seenMessageIds.length > this.config.dedupCacheSize) {
      const removed = this.seenMessageIds.shift();
      if (removed) this.seenSet.delete(removed);
    }
    await this.store.writeJson("channels/feishu/seen-message-ids.json", {
      ids: this.seenMessageIds
    } satisfies SeenState);
  }

  private async loadSeenState(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const state = await this.store.readStateJson<SeenState>("channels/feishu/seen-message-ids.json");
    for (const id of state?.ids ?? []) {
      if (!id || this.seenSet.has(id)) continue;
      this.seenSet.add(id);
      this.seenMessageIds.push(id);
    }
  }
}

export function normalizePrivateTextMessage(event: FeishuInboundEvent): NormalizedFeishuPrivateMessage | null {
  const normalized = normalizeFeishuTextMessage(event);
  if (!normalized || normalized.chatType !== "p2p") return null;
  return normalized as NormalizedFeishuPrivateMessage;
}

export function normalizeFeishuTextMessage(event: FeishuInboundEvent): NormalizedFeishuTextMessage | null {
  const message = event.message;
  const senderId = event.sender.sender_id;
  const openId = senderId?.open_id?.trim();
  if (!openId) return null;
  if (message.message_type !== "text") return null;
  const text = parseFeishuTextContent(message.content).trim();
  if (!text) return null;
  return {
    eventId: event.event_id ?? null,
    messageId: message.message_id,
    chatId: message.chat_id,
    chatType: message.chat_type,
    threadId: message.thread_id ?? null,
    openId,
    text,
    raw: event
  };
}

export function parseFeishuTextContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (isRecord(parsed) && typeof parsed.text === "string") return parsed.text;
  } catch {
    // Plain text fallback for test fixtures or malformed events.
  }
  return content;
}

export function splitText(text: string, limit: number): string[] {
  const normalized = text.trim() || "(empty response)";
  if (normalized.length <= limit) return [normalized];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < normalized.length) {
    const hardEnd = Math.min(offset + limit, normalized.length);
    if (hardEnd === normalized.length) {
      chunks.push(normalized.slice(offset));
      break;
    }
    const newlineEnd = normalized.lastIndexOf("\n", hardEnd);
    if (newlineEnd > offset) {
      chunks.push(normalized.slice(offset, newlineEnd).trimEnd());
      offset = newlineEnd + 1;
    } else {
      chunks.push(normalized.slice(offset, hardEnd));
      offset = hardEnd;
    }
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

function renderAgentTask(
  message: NormalizedFeishuTextMessage,
  history: FeishuConversationHistoryItem[] = [],
  runtimeSession?: RuntimeSessionRecord,
  taskText = message.text
): string {
  const sessionLines = runtimeSession
    ? [
      `Runtime session ID: ${runtimeSession.id}`,
      `Runtime session profile: ${runtimeSession.profile}`,
      `Runtime session status: ${runtimeSession.status}`
    ]
    : [];
  return [
    message.chatType === "p2p" ? "Feishu private chat message received." : "Feishu group runtime session message received.",
    "",
    `Open ID: ${message.openId}`,
    `Chat ID: ${message.chatId}`,
    `Chat type: ${message.chatType}`,
    `Message ID: ${message.messageId}`,
    ...sessionLines,
    "",
    "Recent conversation context:",
    ...(history.length > 0
      ? history.flatMap((item, index) => [
        `${index + 1}. ${item.role} (${item.message_id}, ${item.created_at || "unknown time"}):`,
        item.text
      ])
      : ["No prior local conversation messages selected."]),
    "",
    "User message:",
    taskText
  ].join("\n");
}

function isFeishuMention(text: string): boolean {
  return /@(?:bot|xingzhe|行者)/i.test(text) || text.includes("@_user_");
}

function stripFeishuMention(text: string): string {
  return text
    .replace(/@(?:bot|xingzhe|行者)/gi, "")
    .replace(/@_user_[a-zA-Z0-9_-]+/g, "")
    .trim() || text;
}

type FeishuOperatorCommand =
  | { name: "help" }
  | { name: "capabilities" }
  | { name: "capability_acceptance" }
  | { name: "status" }
  | { name: "runtime_config" }
  | { name: "service_health" }
  | { name: "service_logs"; limit?: number }
  | { name: "workspace_status" }
  | { name: "content_daily"; selection?: string }
  | { name: "governance_status" }
  | { name: "sop_evolution" }
  | { name: "opportunities" }
  | { name: "context_manifests"; contextRef?: string }
  | { name: "context_health"; contextRef?: string }
  | { name: "context_usage" }
  | { name: "context_pressure" }
  | { name: "working_checkpoint"; checkpointRef?: string }
  | { name: "pipeline_runs"; pipelineRef?: string }
  | { name: "session_recap"; sessionId?: string }
  | { name: "episode_memory"; mode: "search"; query: string }
  | { name: "episode_memory"; mode: "session"; sessionId: string }
  | { name: "episode_archives"; archiveRef?: string }
  | { name: "episode_archive_health"; archiveRef?: string }
  | { name: "memory_candidates"; candidateRef?: string }
  | { name: "memory_confirmations"; confirmationRef?: string }
  | { name: "memory_accepted"; semanticMemoryRef?: string }
  | { name: "review_confirmations"; confirmationRef?: string; sopEvolutionGate?: ReviewFollowUpConfirmationGateFilter }
  | { name: "review_reports"; reviewRef?: string }
  | { name: "completion_verifications"; completionRef?: string }
  | { name: "live_run_traces"; traceRef?: string }
  | { name: "harness_replays"; replayRef?: string }
  | { name: "skill_catalog"; skillRef?: string }
  | { name: "skill_registry_health"; skillName?: string }
  | { name: "selected_skill_outcomes"; outcomeRef?: string }
  | { name: "selected_skill_drifts"; skillName?: string }
  | { name: "skill_registry_events"; eventRef?: string; skillName?: string }
  | { name: "review_ticks"; tickRef?: string }
  | { name: "reused_skill_coverage"; sopRef: string }
  | { name: "review_inbox"; status?: "active" | "all" | "executed"; itemRef?: string };

function parseOperatorCommand(text: string): FeishuOperatorCommand | null {
  const compact = text.trim().replace(/\s+/g, " ");
  const normalized = compact.toLowerCase();
  if (normalized === "/help" || normalized === "help") return { name: "help" };
  if (
    normalized === "/capabilities acceptance"
    || normalized === "capabilities acceptance"
    || normalized === "/capabilities audit"
    || normalized === "capabilities audit"
    || normalized === "/abilities acceptance"
    || normalized === "abilities acceptance"
    || normalized === "/ability acceptance"
    || normalized === "ability acceptance"
  ) return { name: "capability_acceptance" };
  if (
    normalized === "/capabilities"
    || normalized === "capabilities"
    || normalized === "/abilities"
    || normalized === "abilities"
    || normalized === "/ability"
    || normalized === "ability"
  ) return { name: "capabilities" };
  if (normalized === "/status" || normalized === "status") return { name: "status" };
  if (
    normalized === "/config"
    || normalized === "config"
    || normalized === "/runtime config"
    || normalized === "runtime config"
    || normalized === "/service config"
    || normalized === "service config"
  ) return { name: "runtime_config" };
  if (
    normalized === "/health"
    || normalized === "health"
    || normalized === "/service health"
    || normalized === "service health"
  ) return { name: "service_health" };
  if (
    normalized === "/logs"
    || normalized === "logs"
    || normalized === "/service logs"
    || normalized === "service logs"
  ) return { name: "service_logs" };
  if (normalized.startsWith("/logs ")) {
    return { name: "service_logs", limit: parseLogLimit(compact.slice("/logs ".length).trim()) };
  }
  if (normalized.startsWith("logs ")) {
    return { name: "service_logs", limit: parseLogLimit(compact.slice("logs ".length).trim()) };
  }
  if (normalized.startsWith("/service logs ")) {
    return { name: "service_logs", limit: parseLogLimit(compact.slice("/service logs ".length).trim()) };
  }
  if (normalized.startsWith("service logs ")) {
    return { name: "service_logs", limit: parseLogLimit(compact.slice("service logs ".length).trim()) };
  }
  if (
    normalized === "/workspace"
    || normalized === "workspace"
    || normalized === "/workspace status"
    || normalized === "workspace status"
    || normalized === "/worktree"
    || normalized === "worktree"
  ) return { name: "workspace_status" };
  if (
    normalized === "/content"
    || normalized === "content"
    || normalized === "/content daily"
    || normalized === "content daily"
    || normalized === "/daily content"
    || normalized === "daily content"
    || normalized === "/daily"
    || normalized === "daily"
  ) return { name: "content_daily" };
  if (normalized.startsWith("/content daily ")) {
    return { name: "content_daily", selection: compact.slice("/content daily ".length).trim() };
  }
  if (normalized.startsWith("content daily ")) {
    return { name: "content_daily", selection: compact.slice("content daily ".length).trim() };
  }
  if (normalized.startsWith("/daily content ")) {
    return { name: "content_daily", selection: compact.slice("/daily content ".length).trim() };
  }
  if (normalized.startsWith("daily content ")) {
    return { name: "content_daily", selection: compact.slice("daily content ".length).trim() };
  }
  if (normalized.startsWith("/daily ")) {
    return { name: "content_daily", selection: compact.slice("/daily ".length).trim() };
  }
  if (normalized.startsWith("daily ")) {
    return { name: "content_daily", selection: compact.slice("daily ".length).trim() };
  }
  if (normalized.startsWith("/content run ")) {
    return { name: "content_daily", selection: compact.slice("/content run ".length).trim() };
  }
  if (normalized.startsWith("content run ")) {
    return { name: "content_daily", selection: compact.slice("content run ".length).trim() };
  }
  if (normalized.startsWith("/content ")) {
    return { name: "content_daily", selection: compact.slice("/content ".length).trim() };
  }
  if (normalized.startsWith("content ")) {
    return { name: "content_daily", selection: compact.slice("content ".length).trim() };
  }
  if (normalized === "/governance" || normalized === "governance") return { name: "governance_status" };
  if (normalized === "/governance status" || normalized === "governance status") return { name: "governance_status" };
  if (
    normalized === "/evolution"
    || normalized === "evolution"
    || normalized === "/governance evolution"
    || normalized === "governance evolution"
    || normalized === "/sop evolution"
    || normalized === "sop evolution"
  ) return { name: "sop_evolution" };
  if (
    normalized === "/opportunities"
    || normalized === "opportunities"
    || normalized === "/governance opportunities"
    || normalized === "governance opportunities"
  ) return { name: "opportunities" };
  if (normalized === "/context" || normalized === "context") return { name: "context_manifests" };
  if (normalized === "/context list" || normalized === "context list") return { name: "context_manifests" };
  if (normalized === "/context usage" || normalized === "context usage" || normalized === "/usage" || normalized === "usage") return { name: "context_usage" };
  if (normalized === "/context health" || normalized === "context health") return { name: "context_health" };
  if (normalized.startsWith("/context health ")) {
    return { name: "context_health", contextRef: compact.slice("/context health ".length).trim() };
  }
  if (normalized.startsWith("context health ")) {
    return { name: "context_health", contextRef: compact.slice("context health ".length).trim() };
  }
  if (normalized === "/context pressure" || normalized === "context pressure") return { name: "context_pressure" };
  if (normalized === "/working" || normalized === "working" || normalized === "/memory working" || normalized === "memory working") return { name: "working_checkpoint" };
  if (normalized.startsWith("/working ")) {
    return { name: "working_checkpoint", checkpointRef: compact.slice("/working ".length).trim() };
  }
  if (normalized.startsWith("working ")) {
    return { name: "working_checkpoint", checkpointRef: compact.slice("working ".length).trim() };
  }
  if (normalized.startsWith("/memory working ")) {
    return { name: "working_checkpoint", checkpointRef: compact.slice("/memory working ".length).trim() };
  }
  if (normalized.startsWith("memory working ")) {
    return { name: "working_checkpoint", checkpointRef: compact.slice("memory working ".length).trim() };
  }
  if (normalized.startsWith("/context show ")) {
    return { name: "context_manifests", contextRef: compact.slice("/context show ".length).trim() };
  }
  if (normalized.startsWith("context show ")) {
    return { name: "context_manifests", contextRef: compact.slice("context show ".length).trim() };
  }
  if (normalized.startsWith("/context ")) {
    return { name: "context_manifests", contextRef: compact.slice("/context ".length).trim() };
  }
  if (normalized.startsWith("context ")) {
    return { name: "context_manifests", contextRef: compact.slice("context ".length).trim() };
  }
  if (
    normalized === "/pipeline runs"
    || normalized === "pipeline runs"
    || normalized === "/pipelines"
    || normalized === "pipelines"
  ) return { name: "pipeline_runs" };
  if (normalized.startsWith("/pipeline run ")) {
    return { name: "pipeline_runs", pipelineRef: compact.slice("/pipeline run ".length).trim() };
  }
  if (normalized.startsWith("pipeline run ")) {
    return { name: "pipeline_runs", pipelineRef: compact.slice("pipeline run ".length).trim() };
  }
  if (normalized.startsWith("/pipeline ")) {
    return { name: "pipeline_runs", pipelineRef: compact.slice("/pipeline ".length).trim() };
  }
  if (
    normalized === "/recap"
    || normalized === "recap"
    || normalized === "/memory recap"
    || normalized === "memory recap"
  ) return { name: "session_recap" };
  if (normalized.startsWith("/recap ")) {
    return { name: "session_recap", sessionId: compact.slice("/recap ".length).trim() };
  }
  if (normalized.startsWith("recap ")) {
    return { name: "session_recap", sessionId: compact.slice("recap ".length).trim() };
  }
  if (normalized.startsWith("/memory recap ")) {
    return { name: "session_recap", sessionId: compact.slice("/memory recap ".length).trim() };
  }
  if (normalized.startsWith("memory recap ")) {
    return { name: "session_recap", sessionId: compact.slice("memory recap ".length).trim() };
  }
  if (normalized.startsWith("/memory search ")) {
    return { name: "episode_memory", mode: "search", query: compact.slice("/memory search ".length).trim() };
  }
  if (normalized.startsWith("memory search ")) {
    return { name: "episode_memory", mode: "search", query: compact.slice("memory search ".length).trim() };
  }
  if (normalized.startsWith("/memory session ")) {
    return { name: "episode_memory", mode: "session", sessionId: compact.slice("/memory session ".length).trim() };
  }
  if (normalized.startsWith("memory session ")) {
    return { name: "episode_memory", mode: "session", sessionId: compact.slice("memory session ".length).trim() };
  }
  if (
    normalized === "/memory archive health"
    || normalized === "memory archive health"
    || normalized === "/memory archives health"
    || normalized === "memory archives health"
  ) return { name: "episode_archive_health" };
  if (normalized.startsWith("/memory archive health ")) {
    return { name: "episode_archive_health", archiveRef: compact.slice("/memory archive health ".length).trim() };
  }
  if (normalized.startsWith("memory archive health ")) {
    return { name: "episode_archive_health", archiveRef: compact.slice("memory archive health ".length).trim() };
  }
  if (normalized.startsWith("/memory archives health ")) {
    return { name: "episode_archive_health", archiveRef: compact.slice("/memory archives health ".length).trim() };
  }
  if (normalized.startsWith("memory archives health ")) {
    return { name: "episode_archive_health", archiveRef: compact.slice("memory archives health ".length).trim() };
  }
  if (
    normalized === "/memory archives"
    || normalized === "memory archives"
    || normalized === "/memory archive"
    || normalized === "memory archive"
  ) return { name: "episode_archives" };
  if (normalized.startsWith("/memory archive ")) {
    return { name: "episode_archives", archiveRef: compact.slice("/memory archive ".length).trim() };
  }
  if (normalized.startsWith("memory archive ")) {
    return { name: "episode_archives", archiveRef: compact.slice("memory archive ".length).trim() };
  }
  if (normalized === "/memory candidates" || normalized === "memory candidates") return { name: "memory_candidates" };
  if (normalized === "/memory confirmations" || normalized === "memory confirmations") return { name: "memory_confirmations" };
  if (normalized.startsWith("/memory confirmation ")) {
    return { name: "memory_confirmations", confirmationRef: compact.slice("/memory confirmation ".length).trim() };
  }
  if (normalized.startsWith("memory confirmation ")) {
    return { name: "memory_confirmations", confirmationRef: compact.slice("memory confirmation ".length).trim() };
  }
  if (normalized === "/memory accepted" || normalized === "memory accepted") return { name: "memory_accepted" };
  if (normalized.startsWith("/memory accepted ")) {
    return { name: "memory_accepted", semanticMemoryRef: compact.slice("/memory accepted ".length).trim() };
  }
  if (normalized.startsWith("memory accepted ")) {
    return { name: "memory_accepted", semanticMemoryRef: compact.slice("memory accepted ".length).trim() };
  }
  if (normalized.startsWith("/memory candidate ")) {
    return { name: "memory_candidates", candidateRef: compact.slice("/memory candidate ".length).trim() };
  }
  if (normalized.startsWith("memory candidate ")) {
    return { name: "memory_candidates", candidateRef: compact.slice("memory candidate ".length).trim() };
  }
  if (
    normalized === "/skill health"
    || normalized === "skill health"
    || normalized === "/skills health"
    || normalized === "skills health"
  ) return { name: "skill_registry_health" };
  if (normalized.startsWith("/skill health ")) {
    return { name: "skill_registry_health", skillName: compact.slice("/skill health ".length).trim() };
  }
  if (normalized.startsWith("skill health ")) {
    return { name: "skill_registry_health", skillName: compact.slice("skill health ".length).trim() };
  }
  if (normalized.startsWith("/skills health ")) {
    return { name: "skill_registry_health", skillName: compact.slice("/skills health ".length).trim() };
  }
  if (normalized.startsWith("skills health ")) {
    return { name: "skill_registry_health", skillName: compact.slice("skills health ".length).trim() };
  }
  if (
    normalized === "/skill drifts"
    || normalized === "skill drifts"
    || normalized === "/skills drifts"
    || normalized === "skills drifts"
    || normalized === "/skill drift"
    || normalized === "skill drift"
    || normalized === "/skills drift"
    || normalized === "skills drift"
  ) return { name: "selected_skill_drifts" };
  if (normalized.startsWith("/skill drift ")) {
    return { name: "selected_skill_drifts", skillName: compact.slice("/skill drift ".length).trim() };
  }
  if (normalized.startsWith("skill drift ")) {
    return { name: "selected_skill_drifts", skillName: compact.slice("skill drift ".length).trim() };
  }
  if (normalized.startsWith("/skills drift ")) {
    return { name: "selected_skill_drifts", skillName: compact.slice("/skills drift ".length).trim() };
  }
  if (normalized.startsWith("skills drift ")) {
    return { name: "selected_skill_drifts", skillName: compact.slice("skills drift ".length).trim() };
  }
  if (
    normalized === "/skill outcomes"
    || normalized === "skill outcomes"
    || normalized === "/skills outcomes"
    || normalized === "skills outcomes"
    || normalized === "/skill outcome"
    || normalized === "skill outcome"
  ) return { name: "selected_skill_outcomes" };
  if (normalized.startsWith("/skill outcome ")) {
    return { name: "selected_skill_outcomes", outcomeRef: compact.slice("/skill outcome ".length).trim() };
  }
  if (normalized.startsWith("skill outcome ")) {
    return { name: "selected_skill_outcomes", outcomeRef: compact.slice("skill outcome ".length).trim() };
  }
  if (normalized.startsWith("/skills outcome ")) {
    return { name: "selected_skill_outcomes", outcomeRef: compact.slice("/skills outcome ".length).trim() };
  }
  if (normalized.startsWith("skills outcome ")) {
    return { name: "selected_skill_outcomes", outcomeRef: compact.slice("skills outcome ".length).trim() };
  }
  if (
    normalized === "/skill events"
    || normalized === "skill events"
    || normalized === "/skills events"
    || normalized === "skills events"
    || normalized === "/skill event"
    || normalized === "skill event"
  ) return { name: "skill_registry_events" };
  if (normalized.startsWith("/skill event ")) {
    return { name: "skill_registry_events", eventRef: compact.slice("/skill event ".length).trim() };
  }
  if (normalized.startsWith("skill event ")) {
    return { name: "skill_registry_events", eventRef: compact.slice("skill event ".length).trim() };
  }
  if (normalized.startsWith("/skills event ")) {
    return { name: "skill_registry_events", eventRef: compact.slice("/skills event ".length).trim() };
  }
  if (normalized.startsWith("skills event ")) {
    return { name: "skill_registry_events", eventRef: compact.slice("skills event ".length).trim() };
  }
  if (normalized.startsWith("/skill events ")) {
    return { name: "skill_registry_events", skillName: compact.slice("/skill events ".length).trim() };
  }
  if (normalized.startsWith("skill events ")) {
    return { name: "skill_registry_events", skillName: compact.slice("skill events ".length).trim() };
  }
  if (normalized.startsWith("/skills events ")) {
    return { name: "skill_registry_events", skillName: compact.slice("/skills events ".length).trim() };
  }
  if (normalized.startsWith("skills events ")) {
    return { name: "skill_registry_events", skillName: compact.slice("skills events ".length).trim() };
  }
  if (
    normalized === "/skill"
    || normalized === "skill"
    || normalized === "/skills"
    || normalized === "skills"
    || normalized === "/skill list"
    || normalized === "skill list"
    || normalized === "/skills list"
    || normalized === "skills list"
  ) return { name: "skill_catalog" };
  if (normalized.startsWith("/skill ")) {
    return { name: "skill_catalog", skillRef: compact.slice("/skill ".length).trim() };
  }
  if (normalized.startsWith("skill ")) {
    return { name: "skill_catalog", skillRef: compact.slice("skill ".length).trim() };
  }
  if (normalized.startsWith("/skills ")) {
    return { name: "skill_catalog", skillRef: compact.slice("/skills ".length).trim() };
  }
  if (normalized.startsWith("skills ")) {
    return { name: "skill_catalog", skillRef: compact.slice("skills ".length).trim() };
  }
  if (
    normalized === "/review completions"
    || normalized === "review completions"
    || normalized === "/review completion"
    || normalized === "review completion"
  ) return { name: "completion_verifications" };
  if (normalized.startsWith("/review completion ")) {
    return { name: "completion_verifications", completionRef: compact.slice("/review completion ".length).trim() };
  }
  if (normalized.startsWith("review completion ")) {
    return { name: "completion_verifications", completionRef: compact.slice("review completion ".length).trim() };
  }
  if (
    normalized === "/review traces"
    || normalized === "review traces"
    || normalized === "/review trace"
    || normalized === "review trace"
    || normalized === "/traces"
    || normalized === "traces"
  ) return { name: "live_run_traces" };
  if (normalized.startsWith("/review trace ")) {
    return { name: "live_run_traces", traceRef: compact.slice("/review trace ".length).trim() };
  }
  if (normalized.startsWith("review trace ")) {
    return { name: "live_run_traces", traceRef: compact.slice("review trace ".length).trim() };
  }
  if (normalized.startsWith("/trace ")) {
    return { name: "live_run_traces", traceRef: compact.slice("/trace ".length).trim() };
  }
  if (normalized.startsWith("trace ")) {
    return { name: "live_run_traces", traceRef: compact.slice("trace ".length).trim() };
  }
  if (
    normalized === "/review replays"
    || normalized === "review replays"
    || normalized === "/review replay"
    || normalized === "review replay"
  ) return { name: "harness_replays" };
  if (normalized.startsWith("/review replay ")) {
    return { name: "harness_replays", replayRef: compact.slice("/review replay ".length).trim() };
  }
  if (normalized.startsWith("review replay ")) {
    return { name: "harness_replays", replayRef: compact.slice("review replay ".length).trim() };
  }
  if (
    normalized === "/review reports"
    || normalized === "review reports"
    || normalized === "/review report"
    || normalized === "review report"
  ) return { name: "review_reports" };
  if (normalized.startsWith("/review report ")) {
    return { name: "review_reports", reviewRef: compact.slice("/review report ".length).trim() };
  }
  if (normalized.startsWith("review report ")) {
    return { name: "review_reports", reviewRef: compact.slice("review report ".length).trim() };
  }
  if (
    normalized === "/review ticks"
    || normalized === "review ticks"
    || normalized === "/review tick"
    || normalized === "review tick"
  ) return { name: "review_ticks" };
  if (normalized.startsWith("/review tick ")) {
    return { name: "review_ticks", tickRef: compact.slice("/review tick ".length).trim() };
  }
  if (normalized.startsWith("review tick ")) {
    return { name: "review_ticks", tickRef: compact.slice("review tick ".length).trim() };
  }
  if (normalized.startsWith("/review coverage ")) {
    return { name: "reused_skill_coverage", sopRef: compact.slice("/review coverage ".length).trim() };
  }
  if (normalized.startsWith("review coverage ")) {
    return { name: "reused_skill_coverage", sopRef: compact.slice("review coverage ".length).trim() };
  }
  if (normalized.startsWith("/coverage ")) {
    return { name: "reused_skill_coverage", sopRef: compact.slice("/coverage ".length).trim() };
  }
  if (normalized === "/inbox" || normalized === "/review inbox") return { name: "review_inbox", status: "active" };
  if (normalized === "/inbox all" || normalized === "/review inbox all") return { name: "review_inbox", status: "all" };
  if (normalized === "/inbox executed" || normalized === "/review inbox executed") return { name: "review_inbox", status: "executed" };
  if (normalized.startsWith("/review inbox ")) {
    return { name: "review_inbox", itemRef: compact.slice("/review inbox ".length).trim() };
  }
  if (normalized.startsWith("review inbox ")) {
    return { name: "review_inbox", itemRef: compact.slice("review inbox ".length).trim() };
  }
  if (normalized.startsWith("/inbox ")) {
    return { name: "review_inbox", itemRef: compact.slice("/inbox ".length).trim() };
  }
  if (normalized === "/review confirmations" || normalized === "review confirmations") return { name: "review_confirmations" };
  if (normalized.startsWith("/review confirmations ")) {
    const gate = parseReviewConfirmationGateTail(compact.slice("/review confirmations ".length).trim());
    return gate ? { name: "review_confirmations", sopEvolutionGate: gate } : null;
  }
  if (normalized.startsWith("review confirmations ")) {
    const gate = parseReviewConfirmationGateTail(compact.slice("review confirmations ".length).trim());
    return gate ? { name: "review_confirmations", sopEvolutionGate: gate } : null;
  }
  if (normalized.startsWith("/review confirmation ")) {
    return { name: "review_confirmations", confirmationRef: compact.slice("/review confirmation ".length).trim() };
  }
  if (normalized.startsWith("review confirmation ")) {
    return { name: "review_confirmations", confirmationRef: compact.slice("review confirmation ".length).trim() };
  }
  return null;
}

function parseReviewConfirmationGateTail(tail: string): ReviewFollowUpConfirmationGateFilter | null {
  const compact = tail.trim().replace(/\s+/g, " ");
  const normalized = compact.toLowerCase();
  if (isReviewConfirmationGate(normalized)) return normalized;
  if (normalized.startsWith("--gate ")) {
    const value = normalized.slice("--gate ".length).trim();
    return isReviewConfirmationGate(value) ? value : null;
  }
  if (normalized.startsWith("gate ")) {
    const value = normalized.slice("gate ".length).trim();
    return isReviewConfirmationGate(value) ? value : null;
  }
  return null;
}

function isReviewConfirmationGate(value: string): value is ReviewFollowUpConfirmationGateFilter {
  return value === "all" || value === "current" || value === "stale" || value === "executed";
}

function renderOperatorHelp(): string {
  return [
    "Local Runtime commands",
    "",
    "/capabilities - read the local capability catalog and boundaries",
    "/capabilities acceptance - read next-version acceptance gates and verification commands",
    "/status - read local service, review tick, and autonomy pause status",
    "/config - read effective runtime config summary without secrets",
    "/health - read local service health and heartbeat freshness",
    "/logs [lines] - read bounded local service stdout/stderr tails",
    "/workspace - read fixed local git status summary",
    "/content - read latest daily content job, linked run evidence, creator metrics backlog, and next commands",
    "/content <date-or-ref> - inspect one daily job or content run summary",
    "/governance - read aggregate memory, review, and service governance status",
    "/evolution - read SOP and skill evolution ledger",
    "/opportunities - read ranked local self-evolution opportunities",
    "/context - list recent context manifests",
    "/context <ref-or-id> - inspect one context manifest",
    "/context usage or /usage - summarize recent context manifest usage",
    "/context health - list context manifest sidecar health issues",
    "/context health <ref-or-id> - inspect one context health issue",
    "/context pressure - list context manifest pressure diagnostics",
    "/working - list bounded working checkpoints",
    "/working <ref-or-id> - inspect one working checkpoint",
    "/pipeline runs - list recent StageRunner pipeline runs",
    "/pipeline run <ref-or-id> - inspect one pipeline run",
    "/recap - summarize the latest local session from evidence metadata",
    "/recap <session-id> - summarize one local session from evidence metadata",
    "/memory search <query> - search episode memory summaries",
    "/memory session <session-id> - replay a bounded episode session window",
    "/memory archives - list daily episode archive summaries",
    "/memory archive <date-or-ref> - inspect one daily episode archive summary",
    "/memory archive health - inspect archive freshness against episode events",
    "/memory archive health <date-or-ref> - inspect archive freshness issue details",
    "/memory candidates - list memory proposal candidates",
    "/memory candidate <ref-or-id> - inspect one memory proposal candidate",
    "/memory confirmations - list memory candidate confirmations",
    "/memory confirmation <ref-or-id> - inspect one memory candidate confirmation",
    "/memory accepted - list accepted semantic memory",
    "/memory accepted <ref-or-id> - inspect one accepted semantic memory",
    "/skills - list local skill catalog metadata",
    "/skill <name-or-ref> - inspect one skill metadata entry",
    "/skill health - inspect active-vault skill registry health",
    "/skill health <skill-name> - inspect one skill registry health scope",
    "/skill outcomes - list selected-skill outcome telemetry",
    "/skill outcome <ref-or-id> - inspect one selected-skill outcome",
    "/skill drifts - list selected-skill drift summaries",
    "/skill drift <skill-name> - inspect one selected-skill drift summary",
    "/skill events - list active-vault skill registry events",
    "/skill event <ref-or-id> - inspect one skill registry event",
    "/review inbox - list active self-evolution inbox items",
    "/review inbox <ref-or-id> - inspect one self-evolution inbox item",
    "/review inbox all - include executed inbox history",
    "/review inbox executed - list executed inbox history",
    "/review reports - list recent background review reports",
    "/review report <ref-or-id> - inspect one background review report",
    "/review completions - list recent completion verification reports",
    "/review completion <ref-or-id> - inspect one completion verification report",
    "/review traces - list recent live run traces",
    "/review trace <ref-or-id> - inspect one live run trace",
    "/review replays - list harness replay audit reports",
    "/review replay <ref-or-id> - inspect one harness replay audit report",
    "/review ticks - list recent review tick reports",
    "/review tick <ref-or-id> - inspect one review tick report",
    "/review coverage <sop-id-or-ref> - read reused skill coverage for one SOP",
    "/review confirmations - list review follow-up confirmations",
    "/review confirmations stale|current|executed|all - filter SOP evolution confirmations",
    "/review confirmation <ref-or-id> - inspect one review follow-up confirmation",
    "",
    "Other messages run through the agent."
  ].join("\n");
}

function renderCapabilityCatalog(catalog: CapabilityCatalog): string {
  return [
    "Local Runtime capabilities",
    "",
    `catalog: ${catalog.catalog_id}@${catalog.catalog_version}`,
    "scope: local-only",
    `categories: ${catalog.categories.length}`,
    `capabilities: ${catalog.count}`,
    "",
    ...catalog.categories.flatMap(renderCapabilityCategory),
    "",
    "Refs:",
    ...catalog.refs.map((ref) => `- ${ref}`),
    "",
    `Boundary: ${catalog.boundary}`,
    "",
    "This command is read-only. It does not run the model, execute tools, inspect secrets, mutate state, write the active vault, or manage services."
  ].join("\n");
}

function renderCapabilityAcceptanceAudit(audit: CapabilityAcceptanceAudit): string {
  return [
    "Capability acceptance",
    "",
    `audit: ${audit.audit_id}@${audit.audit_version}`,
    `status: ${audit.status}`,
    audit.summary,
    "",
    "Gates:",
    ...audit.gates.flatMap(renderCapabilityAcceptanceGate),
    "",
    "Verification:",
    ...audit.verification_commands.map((command) => `- ${command}`),
    "",
    "Default next slice:",
    ...renderCapabilityNextSlice(audit.default_next_slice, 0),
    "",
    "Follow-up slices:",
    ...(audit.follow_up_slices.length > 0 ? audit.follow_up_slices.flatMap(renderCapabilityNextSlice) : ["- none"]),
    "",
    "Refs:",
    ...audit.refs.map((ref) => `- ${ref}`),
    "",
    `Boundary: ${audit.boundary}`,
    "",
    "This command is read-only. It does not run tests, invoke the model, execute tools, inspect secrets, mutate state, write the repo, write the active vault, or manage services."
  ].join("\n");
}

function renderCapabilityAcceptanceGate(gate: CapabilityAcceptanceGate, index: number): string[] {
  return [
    `${index + 1}. ${gate.title} (${gate.status}, layer: ${gate.layer})`,
    `   ${truncateText(gate.summary, 220)}`,
    `   evidence: ${gate.evidence_refs.slice(0, 4).join(" | ")}`,
    `   verify: ${gate.verification_commands.slice(0, 3).join(" | ")}`,
    `   boundary: ${truncateText(gate.boundaries.join("; "), 220)}`
  ];
}

function renderCapabilityNextSlice(slice: CapabilityNextSlice, index: number): string[] {
  return [
    `${index + 1}. ${slice.title}`,
    `   id: ${slice.id} | layer: ${slice.layer}`,
    `   reason: ${truncateText(slice.reason, 220)}`,
    `   success: ${slice.success_criteria.slice(0, 3).join(" | ")}`,
    `   refs: ${slice.refs.join(" | ")}`
  ];
}

function renderCapabilityCategory(category: CapabilityCategory, index: number): string[] {
  return [
    `${index + 1}. ${category.title} (${category.status}, layer: ${category.layer})`,
    `   ${truncateText(category.summary, 220)}`,
    ...category.capabilities.flatMap((capability) => renderCapabilitySummary(category, capability))
  ];
}

function renderCapabilitySummary(category: CapabilityCategory, capability: CapabilitySummary): string[] {
  const layer = resolveCapabilityLayer(category, capability);
  return [
    `   - ${capability.title} [${layer}]: ${truncateText(capability.summary, 220)}`,
    ...(capability.commands && capability.commands.length > 0
      ? [`     commands: ${capability.commands.slice(0, 3).join(" | ")}`]
      : []),
    ...renderCapabilityBoundaries(capability)
  ];
}

function renderCapabilityBoundaries(capability: CapabilitySummary): string[] {
  if (!capability.boundaries || capability.boundaries.length === 0) return [];
  if (capability.id === "delegate_agent") {
    return capability.boundaries.map((boundary) => `     boundary: ${truncateText(boundary, 220)}`);
  }
  return [`     boundary: ${truncateText(capability.boundaries.join("; "), 220)}`];
}

function renderWorkspaceStatus(result: WorkspaceStatusResult): string {
  return [
    "Workspace status",
    "",
    `overall: ${result.status}`,
    `repo: ${result.repo_root}`,
    `branch: ${result.branch ?? "unknown"}`,
    `upstream: ${result.upstream ?? "none"}`,
    `ahead: ${result.ahead ?? 0}`,
    `behind: ${result.behind ?? 0}`,
    `changed_files: ${result.changed_file_count}`,
    `staged: ${result.staged_count}`,
    `unstaged: ${result.unstaged_count}`,
    `untracked: ${result.untracked_count}`,
    `conflicts: ${result.conflict_count}`,
    ...(result.error ? [`error: ${truncateText(result.error, 240)}`] : []),
    ...(result.stderr ? [`stderr: ${truncateText(result.stderr.trim(), 240)}`] : []),
    "",
    "Changes:",
    ...(result.changes.length > 0
      ? result.changes.map(renderWorkspaceChange)
      : ["- none"]),
    ...(result.truncated ? [`- truncated after ${result.changes.length} entries`] : []),
    "",
    `Command: ${result.command}`,
    `Boundary: ${result.boundary}`
  ].join("\n");
}

function renderWorkspaceChange(change: WorkspaceStatusResult["changes"][number]): string {
  return [
    `- ${change.status_code} ${truncateText(change.path, 220)}`,
    change.original_path ? ` (from ${truncateText(change.original_path, 180)})` : "",
    ` [${change.category}]`
  ].join("");
}

function renderRuntimeConfigSummary(summary: RuntimeConfigSummary): string {
  return [
    "Runtime config",
    "",
    `active_model: ${summary.active_model.id ?? "none"}`,
    ...(summary.active_model.model ? [`model: ${summary.active_model.model}`] : []),
    ...(summary.active_model.api ? [`model_api: ${summary.active_model.api}`] : []),
    ...(summary.active_model.base_url ? [`base_url: ${summary.active_model.base_url}`] : []),
    ...(summary.active_model.auth_id ? [`model_auth_id: ${summary.active_model.auth_id}`] : []),
    ...(summary.active_model.context_window_tokens ? [`model_context_window_tokens: ${summary.active_model.context_window_tokens}`] : []),
    ...(summary.active_model.max_output_tokens ? [`model_max_output_tokens: ${summary.active_model.max_output_tokens}`] : []),
    ...(summary.active_model.context_budget
      ? [
        `model_input_budget_tokens: ${summary.active_model.context_budget.estimated_input_budget_tokens}`,
        `context_soft_limit_chars: ${summary.active_model.context_budget.total_soft_limit_chars}`,
        `context_hard_limit_chars: ${summary.active_model.context_budget.total_hard_limit_chars}`
      ]
      : []),
    `active_channel: ${summary.active_channel.id ?? "none"}`,
    ...(summary.active_channel.kind ? [`channel_kind: ${summary.active_channel.kind}`] : []),
    ...(summary.active_channel.transport ? [`channel_transport: ${summary.active_channel.transport}`] : []),
    ...(summary.active_channel.mode ? [`channel_mode: ${summary.active_channel.mode}`] : []),
    ...(summary.active_channel.auth_id ? [`channel_auth_id: ${summary.active_channel.auth_id}`] : []),
    ...(summary.active_channel.followup_queue_size ? [`channel_followup_queue_size: ${summary.active_channel.followup_queue_size}`] : []),
    `active_scenario: ${summary.active_scenario.id ?? "none"}`,
    ...(summary.active_scenario.model_id ? [`scenario_model_id: ${summary.active_scenario.model_id}`] : []),
    ...(summary.active_scenario.discipline ? [`scenario_discipline: ${summary.active_scenario.discipline}`] : []),
    ...(summary.active_scenario.concurrency ? [`scenario_concurrency: ${summary.active_scenario.concurrency}`] : []),
    `promotion_enabled: ${summary.runtime.promotion_enabled}`,
    `structured_output: ${summary.runtime.structured_output}`,
    `review_tick_enabled: ${summary.runtime.review_tick_enabled}`,
    `review_tick_interval_ms: ${summary.runtime.review_tick_interval_ms}`,
    `review_tick_limit: ${summary.runtime.review_tick_limit}`,
    `content_daily_enabled: ${summary.runtime.content_daily_enabled}`,
    `content_daily_interval_ms: ${summary.runtime.content_daily_interval_ms}`,
    `content_daily_dry_run: ${summary.runtime.content_daily_dry_run}`,
    `content_daily_preflight: ${summary.runtime.content_daily_preflight}`,
    `content_daily_topic: ${summary.runtime.content_daily_topic}`,
    `content_daily_source_urls: ${summary.runtime.content_daily_source_urls.join(",") || "none"}`,
    `content_daily_tickers: ${summary.runtime.content_daily_tickers.join(",") || "none"}`,
    ...(summary.runtime.content_daily_image_model ? [`content_daily_image_model: ${summary.runtime.content_daily_image_model}`] : []),
    `content_daily_publish_enabled: ${summary.runtime.content_daily_publish_enabled}`,
    `content_daily_external_write_confirmed: ${summary.runtime.content_daily_external_write_confirmed}`,
    `content_daily_publish_adapter: ${summary.runtime.content_daily_publish_adapter}`,
    `content_daily_publish_server_url: ${summary.runtime.content_daily_publish_server_url}`,
    `content_daily_publish_tool: ${summary.runtime.content_daily_publish_tool}`,
    `content_feedback_refresh_enabled: ${summary.runtime.content_feedback_refresh_enabled}`,
    `content_feedback_refresh_interval_ms: ${summary.runtime.content_feedback_refresh_interval_ms}`,
    `content_feedback_refresh_limit: ${summary.runtime.content_feedback_refresh_limit}`,
    `content_feedback_refresh_min_follow_up_age_ms: ${summary.runtime.content_feedback_refresh_min_follow_up_age_ms}`,
    `content_feedback_refresh_server_url: ${summary.runtime.content_feedback_refresh_server_url}`,
    `content_creator_metrics_enabled: ${summary.runtime.content_creator_metrics_enabled}`,
    `content_creator_metrics_interval_ms: ${summary.runtime.content_creator_metrics_interval_ms}`,
    `content_creator_metrics_limit: ${summary.runtime.content_creator_metrics_limit}`,
    `content_creator_metrics_creator_url: ${summary.runtime.content_creator_metrics_creator_url}`,
    `content_creator_metrics_browser_session_name: ${summary.runtime.content_creator_metrics_browser_session_name}`,
    `content_creator_metrics_browser_auto_connect: ${summary.runtime.content_creator_metrics_browser_auto_connect}`,
    ...(summary.runtime.content_creator_metrics_browser_cdp_port ? [
      `content_creator_metrics_browser_cdp_port: ${summary.runtime.content_creator_metrics_browser_cdp_port}`
    ] : []),
    `runtime_source: ${summary.runtime.source_ref}`,
    `runtime_defaulted_fields: ${summary.runtime.defaulted_fields.length > 0 ? summary.runtime.defaulted_fields.join(",") : "none"}`,
    `vault_mode: ${summary.vault.mode}`,
    `vault_root: ${summary.vault.root}`,
    "",
    "Refs:",
    ...(summary.refs.length > 0 ? summary.refs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    `Restart: ${truncateText(summary.restart_guidance, 240)}`,
    `Boundary: ${summary.boundary}`
  ].join("\n");
}

function renderGovernanceStatus(status: GovernanceStatusResult): string {
  return [
    "Governance status",
    "",
    `Autonomy: ${status.autonomy_pause.active ? "paused" : "active"}`,
    ...(status.autonomy_pause.active
      ? [
        `Pause reason: ${truncateText(status.autonomy_pause.reason ?? "unspecified", 180)}`,
        "Pause signal: autonomy/runs/pause_signal.json"
      ]
      : []),
    `Memory candidates: ${status.counts.memory_candidates.total} (${renderStatusCounts(status.counts.memory_candidates.by_status)})`,
    `Memory confirmations: ${status.counts.memory_confirmations.pending} pending / ${status.counts.memory_confirmations.executed} executed`,
    `Accepted semantic memory: ${status.counts.accepted_semantic_memory.total}`,
    `Review inbox: ${status.counts.review_inbox.active} active / ${status.counts.review_inbox.total} total (${renderStatusCounts(status.counts.review_inbox.by_status)})`,
    `Review confirmations: ${status.counts.review_confirmations.pending} pending / ${status.counts.review_confirmations.executed} executed`,
    `Opportunity backlog: ${status.counts.opportunity_backlog.total} active (${renderStatusCounts(status.counts.opportunity_backlog.by_kind)})`,
    `Opportunity hint: ${truncateText(status.opportunity_backlog.attention_hint, 240)}`,
    `Self-evolution gaps: ${status.self_evolution_gaps.total} (${renderStatusCounts(status.self_evolution_gaps.by_effective_status)})`,
    `Self-evolution hint: ${truncateText(status.self_evolution_gaps.attention_hint, 240)}`,
    ...renderGovernanceNextCheck(status),
    `Working checkpoints: ${status.counts.working_checkpoints.total}`,
    `Harness replays: ${status.counts.harness_replays.total} total (${status.counts.harness_replays.attention} attention / ${status.counts.harness_replays.clean} clean)`,
    ...(status.working_checkpoint.current
      ? [
        `Current working checkpoint: ${status.working_checkpoint.current.ref}`,
        `Working step: ${truncateText(status.working_checkpoint.current.current_step, 180)}`,
        `Working next: ${truncateText(status.working_checkpoint.current.next_action, 180)}`
      ]
      : ["Current working checkpoint: none"]),
    ...renderGovernanceTopOpportunity(status),
    ...renderGovernanceActionableOpportunity(status),
    `Runtime: ${status.service.runtime.state}${status.service.runtime.pid ? ` (pid ${status.service.runtime.pid})` : ""}`,
    `Runtime health: ${status.service.runtime.health}`,
    `Heartbeat freshness: ${status.service.runtime.heartbeat_freshness}${typeof status.service.runtime.heartbeat_age_ms === "number" ? ` (${status.service.runtime.heartbeat_age_ms}ms)` : ""}`,
    ...renderGovernanceRuntimeBuild(status),
    ...renderGovernanceReviewTick(status),
    "",
    "Latest refs:",
    ...renderLatestRefs("memory candidates", status.latest_refs.memory_candidates),
    ...renderLatestRefs("memory confirmations", status.latest_refs.memory_confirmations),
    ...renderLatestRefs("accepted semantic memory", status.latest_refs.accepted_semantic_memory),
    ...renderLatestRefs("review inbox", status.latest_refs.review_inbox),
    ...renderLatestRefs("review confirmations", status.latest_refs.review_confirmations),
    ...renderLatestRefs("opportunity backlog", status.latest_refs.opportunity_backlog),
    ...renderLatestRefs("self-evolution gaps", status.self_evolution_gaps.latest_refs),
    ...renderLatestRefs("working checkpoints", status.latest_refs.working_checkpoints),
    ...renderLatestRefs("harness replays", status.latest_refs.harness_replays),
    "",
    "This command is read-only. Use the specific confirmation commands before mutation."
  ].join("\n");
}

function renderGovernanceNextCheck(status: GovernanceStatusResult): string[] {
  const nextCheck = status.opportunity_backlog.next_check;
  if (!nextCheck) return [];
  return [
    `Next resident check: ${nextCheck.source} at ${nextCheck.next_wake_at} (${nextCheck.next_wake_reason ?? "scheduled"}${typeof nextCheck.next_wake_delay_ms === "number" ? `, delay_ms=${nextCheck.next_wake_delay_ms}` : ""})`
  ];
}

function renderGovernanceReviewTick(status: GovernanceStatusResult): string[] {
  const reviewTick = status.service.review_tick;
  const lines = [
    `Review tick: ${reviewTick.state} (enabled=${reviewTick.enabled})`
  ];
  if (reviewTick.last_tick_ref) lines.push(`Review tick last: ${reviewTick.last_tick_ref}`);
  if (typeof reviewTick.last_inbox_count === "number" || typeof reviewTick.last_active_inbox_count === "number") {
    lines.push(`Review tick inbox: raw=${reviewTick.last_inbox_count ?? "none"} active_tick=${reviewTick.last_active_tick_inbox_count ?? "none"} active_total=${reviewTick.last_active_inbox_count ?? "none"}`);
  }
  if (typeof reviewTick.last_inactive_tick_inbox_count === "number") {
    lines.push(`Review tick inactive inbox: count=${reviewTick.last_inactive_tick_inbox_count}${reviewTick.last_inactive_tick_inbox_reasons ? ` reasons=${renderStatusCounts(reviewTick.last_inactive_tick_inbox_reasons)}` : ""}`);
  }
  if (reviewTick.next_wake_at) {
    lines.push(`Review tick next_wake_at: ${reviewTick.next_wake_at}`);
    lines.push(`Review tick next_wake_delay_ms: ${reviewTick.next_wake_delay_ms ?? "none"}`);
    lines.push(`Review tick next_wake_reason: ${reviewTick.next_wake_reason ?? "none"}`);
  }
  if (reviewTick.last_focus_current_status) lines.push(`Review tick focus current: ${reviewTick.last_focus_current_status}`);
  if (reviewTick.last_focus_current_backlog_status) lines.push(`Review tick focus backlog status: ${reviewTick.last_focus_current_backlog_status}`);
  if (reviewTick.last_focus_current_ref) lines.push(`Review tick focus current ref: ${reviewTick.last_focus_current_ref}`);
  if (reviewTick.last_focus_current_reason) lines.push(`Review tick focus current reason: ${truncateText(reviewTick.last_focus_current_reason, 180)}`);
  if (reviewTick.last_auto_action_status) lines.push(`Review tick auto-action: ${reviewTick.last_auto_action_status}`);
  if (reviewTick.last_auto_action_opportunity_kind && reviewTick.last_auto_action_opportunity_id) {
    lines.push(`Review tick auto-action item: ${reviewTick.last_auto_action_opportunity_kind}:${reviewTick.last_auto_action_opportunity_id}`);
  }
  if (reviewTick.last_auto_action_result_ref) lines.push(`Review tick auto-action result: ${reviewTick.last_auto_action_result_ref}`);
  if (reviewTick.last_auto_action_summary) lines.push(`Review tick auto-action summary: ${truncateText(reviewTick.last_auto_action_summary, 180)}`);
  if (reviewTick.pause_signal_ref) lines.push(`Review tick pause: ${reviewTick.pause_signal_ref}`);
  const focus = reviewTick.last_focus;
  if (!focus) return lines;
  lines.push(`Review focus: ${focus.source}`);
  if (focus.opportunity) {
    lines.push(`Review focus item: ${focus.opportunity.kind}:${focus.opportunity.id}`);
    lines.push(`Review focus ref: ${focus.opportunity.ref}`);
    if (focus.opportunity.action_kind) lines.push(`Review focus action: ${focus.opportunity.action_kind}`);
    if (focus.opportunity.action_chain) {
      lines.push(`Review focus action_chain: ${renderActionChainSummary(focus.opportunity.action_chain)}`);
    }
  }
  if (focus.query) lines.push(`Review focus query: ${truncateText(focus.query, 180)}`);
  lines.push(`Review focus reason: ${truncateText(focus.reason, 220)}`);
  return lines;
}

function renderGovernanceActionableOpportunity(status: GovernanceStatusResult): string[] {
  const actionable = status.opportunity_backlog.actionable_item;
  const top = status.opportunity_backlog.top_item;
  if (actionable && actionable.id !== top?.id) {
    return [
      `Actionable opportunity: ${actionable.kind}:${actionable.id} (score ${actionable.score})`,
      `Actionable ref: ${actionable.ref}`,
      `Actionable next: ${truncateText(actionable.next_step, 240)}`
    ];
  }
  if (!actionable && status.opportunity_backlog.next_ready_at) {
    return [`Actionable opportunity: none until ${status.opportunity_backlog.next_ready_at}`];
  }
  return [];
}

function renderGovernanceTopOpportunity(status: GovernanceStatusResult): string[] {
  const top = status.opportunity_backlog.top_item;
  if (!top) return ["Top opportunity: none"];
  return [
    `Top opportunity: ${top.kind}:${top.id} (score ${top.score})`,
    `Top ref: ${top.ref}`,
    `Top title: ${truncateText(top.title, 180)}`,
    ...(top.draft_sop_readiness
      ? [
        `Top draft_sop_readiness: ${top.draft_sop_readiness.status}`,
        `Top draft_evidence_refs: ${top.draft_sop_readiness.evidence_ref_count}`,
        `Top draft_failure_signals: ${top.draft_sop_readiness.failure_signal_count}`,
        `Top draft_sop_signals: ${top.draft_sop_readiness.sop_signal_count}`
      ]
      : []),
    ...(top.reused_skill_coverage
      ? [
        `Top reused_skill_coverage: ${top.reused_skill_coverage.status}`,
        `Top coverage_sop: ${top.reused_skill_coverage.sop_id}`,
        ...(top.reused_skill_coverage.current_duplicate_skill_ref
          ? [`Top coverage_current_duplicate: ${top.reused_skill_coverage.current_duplicate_skill_ref}`]
          : [])
      ]
      : []),
    ...(top.service_health
      ? [
        `Top service_health: ${top.service_health.status}`,
        `Top service_runtime_state: ${top.service_health.runtime_state}`,
        `Top service_heartbeat: ${top.service_health.heartbeat_freshness}`,
        `Top service_deployment: ${top.service_health.deployment_status}`,
        `Top service_runtime_dirty: ${stringifyOptionalBoolean(top.service_health.runtime_dirty)}`,
        ...(top.service_health.content_daily_current_step
          ? [
            `Top service_daily_step: ${top.service_health.content_daily_current_step}`,
            `Top service_daily_step_freshness: ${top.service_health.content_daily_current_step_freshness ?? "unknown"}`
          ]
          : []),
        `Top service_inspect: ${top.service_health.inspect_command}`
      ]
      : []),
    ...(top.archive_health
      ? [
        `Top archive_health: ${top.archive_health.issue_status}`,
        `Top archive_health_kind: ${top.archive_health.issue_kind}`,
        `Top archive_health_date: ${top.archive_health.date ?? "unknown"}`,
        `Top archive_health_archive: ${top.archive_health.archive_ref ?? "none"}`,
        `Top archive_health_inspect: ${top.archive_health.inspect_command}`,
        ...(top.archive_health.refresh_command ? [`Top archive_health_refresh: ${top.archive_health.refresh_command}`] : [])
      ]
      : []),
    ...(top.skill_registry_health
      ? [
        `Top skill_registry_health: ${top.skill_registry_health.issue_status}`,
        `Top skill_registry_health_kind: ${top.skill_registry_health.issue_kind}`,
        `Top skill_registry_health_skill: ${top.skill_registry_health.skill_name ?? "unknown"}`,
        `Top skill_registry_health_ref: ${top.skill_registry_health.instructions_ref ?? top.skill_registry_health.event_ref ?? top.skill_registry_health.registry_ref ?? "unknown"}`,
        `Top skill_registry_health_inspect: ${top.skill_registry_health.inspect_command}`,
        ...(top.skill_registry_health.sync_command ? [`Top skill_registry_health_sync: ${top.skill_registry_health.sync_command}`] : []),
        ...(top.skill_registry_health.retire_event_command ? [`Top skill_registry_health_retire_event: ${top.skill_registry_health.retire_event_command}`] : [])
      ]
      : []),
    ...(top.context_health
      ? [
        `Top context_health: ${top.context_health.issue_status}`,
        `Top context_health_kind: ${top.context_health.issue_kind}`,
        `Top context_health_ref: ${top.context_health.context_ref ?? top.context_health.manifest_ref ?? "unknown"}`,
        `Top context_health_inspect: ${top.context_health.inspect_command}`
      ]
      : []),
    ...(top.context_pressure
      ? [
        `Top context_pressure: ${top.context_pressure.status}`,
        `Top context_pressure_session: ${top.context_pressure.session_id}`,
        `Top context_pressure_total_chars: ${top.context_pressure.total_chars}`,
        `Top context_pressure_largest_section: ${top.context_pressure.largest_section_title}`,
        `Top context_pressure_mitigation: ${top.context_pressure.operator_guidance.mitigation_kind}`,
        `Top context_pressure_inspect: ${top.context_pressure.inspect_command}`
      ]
      : []),
    ...(top.working_checkpoint
      ? [
        `Top working_checkpoint: ${top.working_checkpoint.checkpoint_ref}`,
        `Top working_checkpoint_step: ${top.working_checkpoint.current_step}`,
        `Top working_checkpoint_next: ${truncateText(top.working_checkpoint.next_action, 180)}`,
        `Top working_checkpoint_inspect: ${top.working_checkpoint.inspect_command}`
      ]
      : []),
    ...(top.pipeline_run
      ? [
        `Top pipeline_run: ${top.pipeline_run.status}`,
        `Top pipeline_id: ${top.pipeline_run.pipeline_id}`,
        ...(top.pipeline_run.blocked_stage_id ? [`Top pipeline_blocked_stage: ${top.pipeline_run.blocked_stage_id}`] : []),
        ...(top.pipeline_run.failed_stage_ids.length > 0 ? [`Top pipeline_failed_stages: ${top.pipeline_run.failed_stage_ids.join(", ")}`] : []),
        `Top pipeline_inspect: ${top.pipeline_run.inspect_command}`,
        `Top pipeline_resume: ${top.pipeline_run.resume_command}`
      ]
      : []),
    ...(top.repo_write_guard
      ? [
        `Top repo_write_guard: ${top.repo_write_guard.path}`,
        `Top repo_write_guard_trace: ${top.repo_write_guard.trace_ref}`,
        `Top repo_write_guard_status: before=${top.repo_write_guard.before_status} after=${top.repo_write_guard.after_status}`,
        `Top repo_write_guard_changed_files: ${top.repo_write_guard.before_changed_file_count}->${top.repo_write_guard.after_changed_file_count} delta=${top.repo_write_guard.changed_file_count_delta}`,
        `Top repo_write_guard_preexisting_dirty: ${top.repo_write_guard.preexisting_dirty}`,
        `Top repo_write_guard_target_changed: ${top.repo_write_guard.target_changed_after_write}`,
        `Top repo_write_guard_inspect: ${top.repo_write_guard.inspect_command}`
      ]
      : []),
    ...(top.selected_skill_drift
      ? [
        `Top selected_skill_drift: ${top.selected_skill_drift.status}`,
        `Top drift_skill: ${top.selected_skill_drift.skill_name}`,
        `Top drift_attention_count: ${top.selected_skill_drift.attention_count}`,
        `Top drift_latest_attention_outcome: ${top.selected_skill_drift.latest_attention_outcome_ref}`
      ]
      : []),
    ...(top.selected_skill_outcome
      ? [
        `Top selected_skill_outcome: ${top.selected_skill_outcome.verification_status}`,
        `Top selected_skill: ${top.selected_skill_outcome.skill_name}`,
        `Top selected_skill_ref: ${top.selected_skill_outcome.instructions_ref}`,
        ...(top.selected_skill_outcome.completion_report_ref
          ? [`Top selected_skill_completion_report: ${top.selected_skill_outcome.completion_report_ref}`]
          : []),
        `Top selected_skill_verdict: ${top.selected_skill_outcome.verdict}`
      ]
      : []),
    ...(top.self_evolution_gap
      ? [
        `Top self_evolution_gap: ${top.self_evolution_gap.proposed_slice}`,
        `Top self_evolution_source: ${top.self_evolution_gap.source_ref}`,
        ...(top.self_evolution_gap.not_before_at
          ? [`Top self_evolution_not_before: ${top.self_evolution_gap.not_before_at}`]
          : []),
        `Top self_evolution_evidence_refs: ${top.self_evolution_gap.evidence_ref_count}`,
        `Top self_evolution_inspect: ${top.self_evolution_gap.inspect_command}`
      ]
      : []),
    ...(top.opportunity_decision
      ? [
        `Top opportunity_decision: ${top.opportunity_decision.status}`,
        `Top opportunity_decision_reason: ${truncateText(top.opportunity_decision.reason, 180)}`,
        `Top opportunity_decision_ref: ${top.opportunity_decision.ref}`,
        ...(top.opportunity_decision.action_chain_snapshot && top.opportunity_decision.action_chain_snapshot.length > 0
          ? [`Top opportunity_decision_action_chain: ${renderActionChainSummary(top.opportunity_decision.action_chain_snapshot)}`]
          : [])
      ]
      : []),
    ...renderTopActionChain(top.action_chain),
    ...(top.decision_command ? [`Top decision_command: ${top.decision_command}`] : []),
    `Top next: ${truncateText(top.next_step, 240)}`
  ];
}

function renderTopActionChain(actionChain: NonNullable<GovernanceOpportunitySummary["action_chain"]> | undefined): string[] {
  if (!actionChain || actionChain.length === 0) return [];
  return [`Top action_chain: ${renderActionChainSummary(actionChain)}`];
}

function renderStatusCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "none";
  return entries.map(([status, count]) => `${status}=${count}`).join(", ");
}

function renderLatestRefs(label: string, refs: string[]): string[] {
  if (refs.length === 0) return [`- ${label}: none`];
  return [`- ${label}:`, ...refs.map((ref) => `  ${ref}`)];
}

function renderContextManifestSummary(manifest: ContextManifestSummary, index: number): string[] {
  return [
    `${index + 1}. ${manifest.session_id}`,
    `   turn: ${manifest.turn_id}`,
    `   created: ${manifest.created_at}`,
    `   chars: ${manifest.total_chars}`,
    `   sections: ${manifest.section_count}`,
    `   memory_hits: ${manifest.memory_hit_count}`,
    `   archive_refs: ${manifest.archive_ref_count}`,
    `   opportunity_refs: ${manifest.opportunity_ref_count}`,
    `   skill_refs: ${manifest.skill_ref_count}`,
    `   discipline: ${manifest.discipline_active ? "active" : "inactive"}`,
    `   ref: ${manifest.ref}`
  ];
}

function renderContextUsage(result: ContextUsageResult): string {
  return [
    "Context usage",
    "",
    `manifests: ${result.count}/${result.analyzed_ref_count}`,
    `total_chars: ${result.total_chars}`,
    `average_chars: ${result.average_chars}`,
    `max_chars: ${result.max_chars}`,
    `status_counts: ${renderStatusCounts(result.status_counts)}`,
    ...renderContextBudgetLines(result.context_budget),
    "",
    "Top sections:",
    ...(result.top_sections.length > 0
      ? result.top_sections.map((section, index) => `${index + 1}. ${section.title}: total=${section.total_chars}, avg=${section.average_chars}, max=${section.max_chars}, count=${section.count}`)
      : ["none"]),
    "",
    "Recent manifests:",
    ...(result.manifests.length > 0
      ? result.manifests.flatMap(renderContextUsageManifestSummary)
      : ["none"]),
    "",
    `Boundary: ${result.boundary}`
  ].join("\n");
}

function renderContextUsageManifestSummary(manifest: ContextUsageManifestSummary, index: number): string[] {
  return [
    `${index + 1}. ${manifest.session_id}`,
    `   status: ${manifest.status}`,
    `   created: ${manifest.created_at}`,
    `   chars: ${manifest.total_chars}`,
    ...(manifest.context_budget
      ? [
        `   soft_limit_chars: ${manifest.context_budget.total_soft_limit_chars}`,
        `   hard_limit_chars: ${manifest.context_budget.total_hard_limit_chars}`
      ]
      : []),
    `   largest_section: ${manifest.largest_section_title}`,
    `   largest_chars: ${manifest.largest_section_chars}`,
    `   sections: ${manifest.section_count}`,
    `   memory_hits: ${manifest.memory_hit_count}`,
    `   archive_refs: ${manifest.archive_ref_count}`,
    `   skill_refs: ${manifest.skill_ref_count}`,
    `   ref: ${manifest.ref}`
  ];
}

function renderContextPressureSummary(pressure: ContextPressureSummary, index: number): string[] {
  return [
    `${index + 1}. ${pressure.id}`,
    `   status: ${pressure.status}`,
    `   session: ${pressure.session_id}`,
    `   turn: ${pressure.turn_id}`,
    `   created: ${pressure.created_at}`,
    `   total_chars: ${pressure.total_chars}`,
    ...(pressure.context_budget
      ? [
        `   soft_limit_chars: ${pressure.context_budget.total_soft_limit_chars}`,
        `   hard_limit_chars: ${pressure.context_budget.total_hard_limit_chars}`
      ]
      : []),
    `   largest_section: ${pressure.largest_section.title}`,
    `   largest_chars: ${pressure.largest_section.chars}`,
    `   pressure_sections: ${pressure.pressure_sections.length}`,
    `   reasons: ${pressure.reasons.slice(0, 3).join("; ") || "none"}`,
    `   mitigation: ${pressure.operator_guidance.mitigation_kind}`,
    `   guidance_inspect: ${pressure.operator_guidance.inspect_command}`,
    `   guidance_defer: ${pressure.operator_guidance.defer_command}`,
    `   guidance_complete: ${pressure.operator_guidance.complete_after_external_mitigation_command}`,
    `   future_gate: ${pressure.operator_guidance.future_mitigation_gate}`,
    `   ref: ${pressure.ref}`
  ];
}

function renderContextBudgetLines(budget: ContextUsageResult["context_budget"]): string[] {
  if (!budget) return [];
  return [
    `model_context_window_tokens: ${budget.context_window_tokens}`,
    `model_reserved_output_tokens: ${budget.reserved_output_tokens}`,
    `model_input_budget_tokens: ${budget.estimated_input_budget_tokens}`,
    `context_soft_limit_chars: ${budget.total_soft_limit_chars}`,
    `context_hard_limit_chars: ${budget.total_hard_limit_chars}`,
    ...(budget.warning ? [`context_budget_warning: ${budget.warning}`] : [])
  ];
}

function renderContextHealthIssue(issue: ContextHealthIssue, index: number, includeGuidanceCommands = false): string[] {
  return [
    `${index + 1}. ${issue.id}`,
    `   status: ${issue.status}`,
    `   kind: ${issue.kind}`,
    `   ref: ${issue.ref}`,
    `   manifest: ${issue.manifest_ref ?? "none"}`,
    `   context: ${issue.context_ref ?? "none"}`,
    ...(issue.session_id ? [`   session: ${issue.session_id}`] : []),
    `   reason: ${truncateText(issue.reason, 220)}`,
    `   next: ${truncateText(issue.next_step, 260)}`,
    `   inspect: ${issue.inspect_command}`,
    `   resolution: ${issue.operator_guidance.resolution_kind}`,
    ...(includeGuidanceCommands
      ? [
        `   defer: ${issue.operator_guidance.defer_command}`,
        ...(issue.operator_guidance.repair_manifest_command ? [`   repair_manifest: ${issue.operator_guidance.repair_manifest_command}`] : []),
        `   complete_after_external_repair: ${issue.operator_guidance.complete_after_external_repair_command}`,
        `   retire_historical: ${issue.operator_guidance.retire_historical_issue_command}`
      ]
      : [])
  ];
}

function renderWorkingCheckpointSummary(checkpoint: WorkingCheckpointSummary, index: number): string[] {
  return [
    `${index + 1}. ${checkpoint.id}${checkpoint.is_current ? " (current)" : ""}`,
    `   ref: ${checkpoint.ref}`,
    `   created: ${checkpoint.created_at ?? "unknown"}`,
    `   goal: ${truncateText(checkpoint.goal, 180)}`,
    `   step: ${truncateText(checkpoint.current_step, 180)}`,
    `   next: ${truncateText(checkpoint.next_action, 220)}`,
    `   evidence_refs: ${checkpoint.recent_evidence_ref_count}`,
    `   open_questions: ${checkpoint.open_question_count}`,
    `   event_refs: ${checkpoint.evidence_event_refs.length > 0 ? checkpoint.evidence_event_refs.join(", ") : "none"}`
  ];
}

function renderOpportunityBacklog(result: OpportunityBacklogResult): string {
  if (result.items.length === 0) {
    return [
      "Opportunity backlog",
      "",
      "No opportunity backlog items.",
      "",
      "This command is read-only. It does not execute confirmations, run review tick, mutate memory/SOP/skill state, write the active vault, invoke the model, or run shell commands."
    ].join("\n");
  }
  return [
    "Opportunity backlog",
    "",
    `created: ${result.created_at}`,
    `count: ${result.count}`,
    "",
    ...result.items.flatMap(renderOpportunityBacklogItem),
    "",
    "This command is read-only. It ranks local self-evolution attention only and does not execute confirmations, run review tick, mutate memory/SOP/skill state, write the active vault, invoke the model, or run shell commands."
  ].join("\n");
}

function renderOpportunityBacklogItem(item: OpportunityBacklogItem, index: number): string[] {
  const lines = [
    `${index + 1}. ${item.kind}: ${item.id}`,
    `   score: ${item.score}`,
    `   status: ${item.status}`,
    `   title: ${truncateText(item.title, 180)}`,
    `   summary: ${truncateText(item.summary, 220)}`
  ];
  if (item.action_kind) lines.push(`   action: ${item.action_kind}`);
  if (item.source_ref) lines.push(`   source: ${item.source_ref}`);
  if (item.completion_verification) {
    lines.push(`   completion_report: ${item.completion_verification.report_ref}`);
    lines.push(`   completion_status: ${item.completion_verification.completion_status}`);
    lines.push(`   completion_verification_status: ${item.completion_verification.verification_status}`);
    if (item.completion_verification.failed_check_ids.length > 0) {
      lines.push(`   completion_failed_checks: ${item.completion_verification.failed_check_ids.join(", ")}`);
    }
    if (item.completion_verification.warning_check_ids.length > 0) {
      lines.push(`   completion_warning_checks: ${item.completion_verification.warning_check_ids.join(", ")}`);
    }
    lines.push(`   completion_model_diagnostics: ${item.completion_verification.model_diagnostic_count}`);
    for (const diagnostic of item.completion_verification.model_diagnostics.slice(0, 3)) {
      lines.push(`   completion_model_diagnostic: round=${diagnostic.round} stage=${diagnostic.stage} kind=${diagnostic.failure_kind}`);
      lines.push(`   completion_model_diagnostic_ref: ${diagnostic.diagnostic_ref}`);
      if (diagnostic.error_preview) lines.push(`   completion_model_diagnostic_error: ${truncateText(diagnostic.error_preview, 180)}`);
    }
    lines.push(`   completion_inspect: ${item.completion_verification.inspect_command}`);
    lines.push(`   completion_trace: ${item.completion_verification.trace_command}`);
  }
  if (item.opportunity_decision) {
    lines.push(`   opportunity_decision: ${item.opportunity_decision.status}`);
    lines.push(`   opportunity_decision_reason: ${truncateText(item.opportunity_decision.reason, 220)}`);
    lines.push(`   opportunity_decision_ref: ${item.opportunity_decision.ref}`);
    if (item.opportunity_decision.action_chain_snapshot && item.opportunity_decision.action_chain_snapshot.length > 0) {
      lines.push(`   opportunity_decision_action_chain: ${renderActionChainSummary(item.opportunity_decision.action_chain_snapshot)}`);
    }
  }
  if (item.sop_evolution_gate) {
    lines.push(`   sop_evolution_gate: ${item.sop_evolution_gate.status}`);
    lines.push(`   gate_reason_code: ${item.sop_evolution_gate.reason_code}`);
    lines.push(`   gate_reason: ${truncateText(item.sop_evolution_gate.reason, 220)}`);
  }
  if (item.sop_recovery_decision) {
    lines.push(`   recovery_decision: ${item.sop_recovery_decision.status}`);
    lines.push(`   recovery_decision_reason: ${truncateText(item.sop_recovery_decision.reason, 220)}`);
    lines.push(`   recovery_decision_ref: ${item.sop_recovery_decision.ref}`);
  }
  if (item.draft_sop_readiness) {
    lines.push(`   draft_sop_readiness: ${item.draft_sop_readiness.status}`);
    lines.push(`   draft_evidence_refs: ${item.draft_sop_readiness.evidence_ref_count}`);
    lines.push(`   draft_failure_signals: ${item.draft_sop_readiness.failure_signal_count}`);
    lines.push(`   draft_sop_signals: ${item.draft_sop_readiness.sop_signal_count}`);
    if (item.draft_sop_readiness.existing_sop_refs.length > 0) {
      lines.push(`   draft_related_sops: ${item.draft_sop_readiness.existing_sop_refs.slice(0, 3).join(", ")}`);
    }
  }
  if (item.reused_skill_coverage) {
    lines.push(`   reused_skill_coverage: ${item.reused_skill_coverage.status}`);
    lines.push(`   coverage_sop: ${item.reused_skill_coverage.sop_id}`);
    if (item.reused_skill_coverage.current_duplicate_skill_ref) {
      lines.push(`   coverage_current_duplicate: ${item.reused_skill_coverage.current_duplicate_skill_ref}`);
    }
    if (item.reused_skill_coverage.missing_skill_refs.length > 0) {
      lines.push(`   coverage_missing_skills: ${item.reused_skill_coverage.missing_skill_refs.slice(0, 3).join(", ")}`);
    }
  }
  if (item.service_health) {
    lines.push(`   service_health: ${item.service_health.status}`);
    lines.push(`   service_health_runtime_state: ${item.service_health.runtime_state}`);
    lines.push(`   service_health_heartbeat: ${item.service_health.heartbeat_freshness}`);
    lines.push(`   service_health_deployment: ${item.service_health.deployment_status}`);
    lines.push(`   service_health_deployment_reason: ${item.service_health.deployment_reason}`);
    lines.push(`   service_health_runtime_commit: ${item.service_health.runtime_commit ?? "unknown"}`);
    lines.push(`   service_health_repo_commit: ${item.service_health.repo_commit ?? "unknown"}`);
    lines.push(`   service_health_runtime_dirty: ${stringifyOptionalBoolean(item.service_health.runtime_dirty)}`);
    lines.push(`   service_health_review_tick: ${item.service_health.review_tick_state}`);
    lines.push(`   service_health_content_daily: ${item.service_health.content_daily_state}`);
    if (item.service_health.content_daily_current_step) {
      lines.push(`   service_health_content_daily_step: ${item.service_health.content_daily_current_step}`);
      lines.push(`   service_health_content_daily_step_status: ${item.service_health.content_daily_current_step_status ?? "unknown"}`);
      lines.push(`   service_health_content_daily_step_freshness: ${item.service_health.content_daily_current_step_freshness ?? "unknown"}`);
      lines.push(`   service_health_content_daily_step_age_ms: ${item.service_health.content_daily_current_step_age_ms ?? "unknown"}`);
      lines.push(`   service_health_content_daily_track: ${item.service_health.content_daily_current_track_id ?? "unknown"}`);
      if (item.service_health.content_daily_current_job_ref) {
        lines.push(`   service_health_content_daily_job_ref: ${item.service_health.content_daily_current_job_ref}`);
      }
      if (item.service_health.content_daily_current_run_ref) {
        lines.push(`   service_health_content_daily_run_ref: ${item.service_health.content_daily_current_run_ref}`);
      }
    }
    lines.push(`   service_health_feedback_refresh: ${item.service_health.content_feedback_refresh_state}`);
    lines.push(`   service_health_creator_metrics: ${item.service_health.content_creator_metrics_state}`);
    lines.push(`   service_health_pause_active: ${item.service_health.autonomy_pause_active}`);
    lines.push(`   service_health_inspect: ${item.service_health.inspect_command}`);
    if (item.service_health.deployment_status === "stale"
      || item.service_health.content_daily_current_step_freshness === "stale") {
      lines.push(`   service_health_restart: ${item.service_health.restart_command}`);
    }
  }
  if (item.archive_health) {
    lines.push(`   archive_health: ${item.archive_health.issue_status}`);
    lines.push(`   archive_health_kind: ${item.archive_health.issue_kind}`);
    lines.push(`   archive_health_date: ${item.archive_health.date ?? "unknown"}`);
    lines.push(`   archive_health_archive: ${item.archive_health.archive_ref ?? "none"}`);
    lines.push(`   archive_health_reason: ${truncateText(item.archive_health.reason, 180)}`);
    lines.push(`   archive_health_inspect: ${item.archive_health.inspect_command}`);
    if (item.archive_health.refresh_command) {
      lines.push(`   archive_health_refresh: ${item.archive_health.refresh_command}`);
    }
  }
  if (item.skill_registry_health) {
    lines.push(`   skill_registry_health: ${item.skill_registry_health.issue_status}`);
    lines.push(`   skill_registry_health_kind: ${item.skill_registry_health.issue_kind}`);
    lines.push(`   skill_registry_health_skill: ${item.skill_registry_health.skill_name ?? "unknown"}`);
    lines.push(`   skill_registry_health_ref: ${item.skill_registry_health.instructions_ref ?? item.skill_registry_health.event_ref ?? item.skill_registry_health.registry_ref ?? "unknown"}`);
    lines.push(`   skill_registry_health_reason: ${truncateText(item.skill_registry_health.reason, 180)}`);
    lines.push(`   skill_registry_health_inspect: ${item.skill_registry_health.inspect_command}`);
    if (item.skill_registry_health.sync_command) {
      lines.push(`   skill_registry_health_sync: ${item.skill_registry_health.sync_command}`);
    }
    if (item.skill_registry_health.retire_event_command) {
      lines.push(`   skill_registry_health_retire_event: ${item.skill_registry_health.retire_event_command}`);
    }
  }
  if (item.context_health) {
    lines.push(`   context_health: ${item.context_health.issue_status}`);
    lines.push(`   context_health_kind: ${item.context_health.issue_kind}`);
    lines.push(`   context_health_ref: ${item.context_health.context_ref ?? item.context_health.manifest_ref ?? "unknown"}`);
    lines.push(`   context_health_reason: ${truncateText(item.context_health.reason, 180)}`);
    lines.push(`   context_health_inspect: ${item.context_health.inspect_command}`);
    lines.push(`   context_health_resolution: ${item.context_health.operator_guidance.resolution_kind}`);
    lines.push(`   context_health_complete: ${item.context_health.operator_guidance.complete_after_external_repair_command}`);
    lines.push(`   context_health_retire: ${item.context_health.operator_guidance.retire_historical_issue_command}`);
  }
  if (item.context_pressure) {
    lines.push(`   context_pressure: ${item.context_pressure.status}`);
    lines.push(`   context_pressure_session: ${item.context_pressure.session_id}`);
    lines.push(`   context_pressure_total_chars: ${item.context_pressure.total_chars}`);
    lines.push(`   context_pressure_largest_section: ${item.context_pressure.largest_section_title}`);
    lines.push(`   context_pressure_inspect: ${item.context_pressure.inspect_command}`);
    lines.push(`   context_pressure_mitigation: ${item.context_pressure.operator_guidance.mitigation_kind}`);
    lines.push(`   context_pressure_complete: ${item.context_pressure.operator_guidance.complete_after_external_mitigation_command}`);
    lines.push(`   context_pressure_retire: ${item.context_pressure.operator_guidance.retire_historical_pressure_command}`);
    lines.push(`   context_pressure_future_gate: ${item.context_pressure.operator_guidance.future_mitigation_gate}`);
  }
  if (item.working_checkpoint) {
    lines.push(`   working_checkpoint: ${item.working_checkpoint.checkpoint_ref}`);
    lines.push(`   working_checkpoint_step: ${item.working_checkpoint.current_step}`);
    lines.push(`   working_checkpoint_next: ${truncateText(item.working_checkpoint.next_action, 180)}`);
    lines.push(`   working_checkpoint_inspect: ${item.working_checkpoint.inspect_command}`);
  }
  if (item.pipeline_run) {
    lines.push(`   pipeline_run: ${item.pipeline_run.status}`);
    lines.push(`   pipeline_id: ${item.pipeline_run.pipeline_id}`);
    if (item.pipeline_run.blocked_stage_id) {
      lines.push(`   pipeline_blocked_stage: ${item.pipeline_run.blocked_stage_id}`);
    }
    if (item.pipeline_run.failed_stage_ids.length > 0) {
      lines.push(`   pipeline_failed_stages: ${item.pipeline_run.failed_stage_ids.join(", ")}`);
    }
    lines.push(`   pipeline_inspect: ${item.pipeline_run.inspect_command}`);
    lines.push(`   pipeline_resume: ${item.pipeline_run.resume_command}`);
  }
  if (item.repo_write_guard) {
    lines.push(`   repo_write_guard: ${item.repo_write_guard.path}`);
    lines.push(`   repo_write_guard_trace: ${item.repo_write_guard.trace_ref}`);
    lines.push(`   repo_write_guard_event: ${item.repo_write_guard.event_id}`);
    lines.push(`   repo_write_guard_status: before=${item.repo_write_guard.before_status} after=${item.repo_write_guard.after_status}`);
    lines.push(`   repo_write_guard_changed_files: ${item.repo_write_guard.before_changed_file_count}->${item.repo_write_guard.after_changed_file_count} delta=${item.repo_write_guard.changed_file_count_delta}`);
    lines.push(`   repo_write_guard_preexisting_dirty: ${item.repo_write_guard.preexisting_dirty}`);
    lines.push(`   repo_write_guard_target_changed: ${item.repo_write_guard.target_changed_after_write}`);
    lines.push(`   repo_write_guard_inspect: ${item.repo_write_guard.inspect_command}`);
  }
  if (item.selected_skill_outcome) {
    lines.push(`   selected_skill_outcome: ${item.selected_skill_outcome.verification_status}`);
    lines.push(`   selected_skill: ${item.selected_skill_outcome.skill_name}`);
    lines.push(`   selected_skill_ref: ${item.selected_skill_outcome.instructions_ref}`);
    if (item.selected_skill_outcome.completion_report_ref) {
      lines.push(`   selected_skill_completion_report: ${item.selected_skill_outcome.completion_report_ref}`);
    }
    lines.push(`   selected_skill_verdict: ${item.selected_skill_outcome.verdict}`);
  }
  if (item.selected_skill_drift) {
    lines.push(`   selected_skill_drift: ${item.selected_skill_drift.status}`);
    lines.push(`   drift_skill: ${item.selected_skill_drift.skill_name}`);
    lines.push(`   drift_attention_count: ${item.selected_skill_drift.attention_count}`);
    lines.push(`   drift_failed_count: ${item.selected_skill_drift.failed_count}`);
    lines.push(`   drift_latest_attention_outcome: ${item.selected_skill_drift.latest_attention_outcome_ref}`);
    lines.push(`   drift_completion_report: ${item.selected_skill_drift.latest_completion_report_ref}`);
  }
  if (item.review_inbox_duplicate_group) {
    lines.push(`   review_inbox_duplicates: ${item.review_inbox_duplicate_group.duplicate_count}`);
    lines.push(`   duplicate_refs: ${item.review_inbox_duplicate_group.duplicate_refs.join(", ") || "none"}`);
  }
  lines.push(
    `   budget: turns=${item.budget_hint.max_turns}, tools=${item.budget_hint.max_tool_calls}, side_effect=${item.budget_hint.side_effect_level}`,
    `   ref: ${item.ref}`,
    `   next: ${truncateText(item.next_step, 260)}`
  );
  if (item.decision_command) lines.push(`   decision_command: ${item.decision_command}`);
  appendOpportunityActionChainLines(lines, item.action_chain);
  if (item.next_command) {
    lines.push(`   command: ${item.next_command.command}`);
    lines.push(`   request_command: ${item.next_command.request_command}`);
    lines.push(`   command_writes: ${item.next_command.would_write.join(", ")}`);
  }
  if (item.score_reasons.length > 0) lines.push(`   reasons: ${item.score_reasons.slice(0, 3).join("; ")}`);
  return lines;
}

function appendOpportunityActionChainLines(
  lines: string[],
  actionChain: OpportunityBacklogItem["action_chain"] | undefined
): void {
  if (!actionChain || actionChain.length === 0) return;
  lines.push(`   action_chain: ${renderActionChainSummary(actionChain)}`);
}

function renderActionChainSummary(actionChain: Array<{ label: string; effect: string }>): string {
  return actionChain.map((step) => `${step.label}[${step.effect}]`).join(" -> ");
}

function renderArchiveSummary(archive: EpisodeArchiveSummary, index: number): string[] {
  return [
    `${index + 1}. ${archive.date}`,
    `   created: ${archive.created_at}`,
    `   events: ${archive.event_count}`,
    `   sessions: ${archive.session_count}`,
    `   kinds: ${renderStatusCounts(archive.kind_counts)}`,
    `   last_event_at: ${archive.last_event_at ?? "unknown"}`,
    `   recent_events: ${archive.recent_event_ids.join(", ") || "none"}`,
    `   ref: ${archive.ref}`
  ];
}

function renderArchiveHealthIssue(issue: ArchiveHealthIssue, index: number): string[] {
  return [
    `${index + 1}. ${issue.id}`,
    `   kind: ${issue.kind}`,
    `   status: ${issue.status}`,
    `   date: ${issue.date ?? "unknown"}`,
    `   ref: ${issue.ref}`,
    `   source_events: ${issue.source_event_count ?? "unknown"}`,
    `   archive_events: ${issue.archive_event_count ?? "unknown"}`,
    `   source_last_event_at: ${issue.source_last_event_at ?? "unknown"}`,
    `   archive_last_event_at: ${issue.archive_last_event_at ?? "unknown"}`,
    `   reason: ${truncateText(issue.reason, 220)}`,
    `   inspect: ${issue.inspect_command}`,
    ...(issue.refresh_command ? [`   refresh: ${issue.refresh_command}`] : [])
  ];
}

function renderArchiveSession(session: EpisodeArchiveSummary["top_sessions"][number], index: number): string[] {
  return [
    `${index + 1}. ${session.session_id}`,
    `   events: ${session.event_count}`,
    `   last_event_at: ${session.last_event_at ?? "unknown"}`
  ];
}

function renderArchiveEvent(event: {
  id: string;
  session_id: string;
  kind: string;
  created_at: string | null;
  summary: string;
  artifact_refs: string[];
}, index: number): string[] {
  return [
    `${index + 1}. ${event.id}`,
    `   session: ${event.session_id}`,
    `   kind: ${event.kind}`,
    `   created: ${event.created_at ?? "unknown"}`,
    `   summary: ${truncateText(event.summary, 260)}`,
    `   refs: ${event.artifact_refs.slice(0, 3).join(", ") || "none"}`
  ];
}

function renderReviewConfirmationSummary(confirmation: ReviewFollowUpConfirmationSummary, index: number): string[] {
  return [
    `${index + 1}. ${confirmation.id}`,
    `   status: ${confirmation.status}`,
    `   source: ${confirmation.source}`,
    `   action: ${confirmation.action_kind}`,
    ...(confirmation.sop_id ? [`   sop: ${confirmation.sop_id}`] : []),
    ...(confirmation.sop_ref ? [`   sop_ref: ${confirmation.sop_ref}`] : []),
    ...renderSopEvolutionGate(confirmation.sop_evolution_gate, "   "),
    ...renderDraftSopReadiness(confirmation.draft_sop_readiness, "   "),
    ...(confirmation.sop_evolution_recovery ? [`   playbook: ${confirmation.sop_evolution_recovery.playbook.summary}`] : []),
    ...(confirmation.sop_evolution_recovery?.latest_decision ? [`   recovery_decision: ${confirmation.sop_evolution_recovery.latest_decision.status} - ${confirmation.sop_evolution_recovery.latest_decision.reason}`] : []),
    ...(confirmation.sop_evolution_recovery ? [`   fresh_request: ${confirmation.sop_evolution_recovery.request_command}`] : []),
    `   title: ${confirmation.title}`,
    `   writes: ${confirmation.would_write.join(", ") || "none"}`,
    `   executed: ${confirmation.executed_at ?? "none"}`,
    `   ref: ${confirmation.confirmation_ref}`
  ];
}

function renderDraftSopReadiness(
  readiness: ReviewFollowUpConfirmationSummary["draft_sop_readiness"] | undefined,
  prefix = ""
): string[] {
  if (!readiness) return [];
  return [
    `${prefix}draft_sop_readiness: ${readiness.status}`,
    `${prefix}draft_evidence_refs: ${readiness.evidence_ref_count}`,
    `${prefix}draft_failure_signals: ${readiness.failure_signal_count}`,
    `${prefix}draft_sop_signals: ${readiness.sop_signal_count}`,
    ...(readiness.existing_sop_refs.length > 0
      ? [`${prefix}draft_related_sops: ${readiness.existing_sop_refs.slice(0, 3).join(", ")}`]
      : []),
    ...(readiness.existing_skill_refs.length > 0
      ? [`${prefix}draft_related_skills: ${readiness.existing_skill_refs.slice(0, 3).join(", ")}`]
      : [])
  ];
}

function renderReviewConfirmationGateSummary(summary: ReviewFollowUpConfirmationGateSummary): string[] {
  return [
    "Gate summary:",
    `- total_matches: ${summary.total}`,
    `- with_gate: ${summary.with_gate}`,
    `- without_gate: ${summary.without_gate}`,
    `- current: ${summary.current}`,
    `- stale: ${summary.stale}`,
    `- executed: ${summary.executed}`,
    ...(summary.reasons.length > 0 ? [
      "- reasons:",
      ...summary.reasons.map((item) => `  - ${item.status}/${item.reason_code}: ${item.count}`)
    ] : [])
  ];
}

function renderSopEvolutionRecoveryPlaybook(
  recovery: NonNullable<ReviewFollowUpConfirmationSummary["sop_evolution_recovery"]>
): string[] {
  return [
    `- reason_code: ${recovery.playbook.reason_code}`,
    `- summary: ${recovery.playbook.summary}`,
    `- inspect: ${recovery.playbook.inspect_command}`,
    `- record_decision: ${recovery.decision_command}`,
    ...(recovery.latest_decision ? [
      `- latest_decision: ${recovery.latest_decision.status}`,
      `- decision_reason: ${recovery.latest_decision.reason}`,
      `- decision_ref: ${recovery.latest_decision.ref}`
    ] : ["- latest_decision: none"]),
    "- steps:",
    ...recovery.playbook.next_steps.map((step) => `  - ${step}`)
  ];
}

function renderReviewFollowUpExecutionSummary(summary: ReviewFollowUpConfirmedExecutionSummary): string[] {
  return [
    `kind: ${summary.kind}`,
    `evidence: ${summary.evidence_event_id}`
  ];
}

function renderReviewConfirmationExecutionGate(
  confirmation: ReviewFollowUpConfirmationRequest,
  confirmationRef: string,
  stateRoot: string,
  gate?: SopEvolutionConfirmationGate,
  recovery?: ReviewFollowUpConfirmationSummary["sop_evolution_recovery"]
): string[] {
  if (confirmation.status === "pending") {
    if (gate?.status === "stale") {
      return [
        "- blocked until a fresh SOP evolution confirmation is requested.",
        `- reason: ${truncateText(gate.reason, 220)}`,
        "- request a fresh confirmation with:",
        `  ${recovery?.request_command ?? fallbackSopEvolutionRecoveryCommand(confirmation, stateRoot)}`
      ];
    }
    return [
      "- execute explicitly with:",
      `  pnpm run runtime -- review execute-confirmed-follow-up --confirmation ${shellArg(confirmationRef)} --state-root ${shellArg(stateRoot)}`,
      ...(confirmation.source === "sop_evolution_chain"
        ? ["- SOP evolution confirmations re-read the current ledger and reject stale action refs or write boundaries before execution."]
        : [])
    ];
  }
  return ["- already executed; inspect the execution result below."];
}

function fallbackSopEvolutionRecoveryCommand(
  confirmation: ReviewFollowUpConfirmationRequest,
  stateRoot: string
): string {
  const sopRef = confirmation.sop_id ?? confirmation.sop_ref ?? confirmation.proposal_id;
  return `pnpm run runtime -- review request-sop-confirmation --sop ${shellArg(sopRef)} --state-root ${shellArg(stateRoot)}`;
}

function renderSopEvolutionGate(gate: SopEvolutionConfirmationGate | undefined, prefix = ""): string[] {
  if (!gate) return [];
  return [
    `${prefix}sop_evolution_gate: ${gate.status}`,
    `${prefix}gate_reason_code: ${gate.reason_code}`,
    `${prefix}gate_reason: ${truncateText(gate.reason, 220)}`,
    ...(gate.current_action_kind ? [`${prefix}current_action: ${gate.current_action_kind}`] : []),
    ...(gate.current_required_refs ? [`${prefix}current_refs: ${gate.current_required_refs.slice(0, 3).join(", ")}`] : []),
    ...(gate.current_would_write ? [`${prefix}current_writes: ${gate.current_would_write.join(", ") || "none"}`] : [])
  ];
}

function renderSessionRecap(result: SessionRecapResult): string {
  if (!result.session_id) {
    return [
      "Session recap",
      "",
      `status: ${result.status}`,
      result.requested_session_id ? `requested_session: ${result.requested_session_id}` : "requested_session: latest",
      "No episode events found.",
      "",
      `Boundary: ${result.boundary}`
    ].join("\n");
  }
  return [
    "Session recap",
    "",
    `status: ${result.status}`,
    `session: ${result.session_id}`,
    `events: ${result.event_count}`,
    `kinds: ${renderStatusCounts(result.event_kind_counts)}`,
    `first_event_at: ${result.first_event_at ?? "unknown"}`,
    `last_event_at: ${result.last_event_at ?? "unknown"}`,
    ...(result.latest_task ? [`task: ${truncateText(result.latest_task, 260)}`] : []),
    ...(result.latest_summary ? [`summary: ${truncateText(result.latest_summary, 320)}`] : []),
    "",
    ...(result.completion ? renderSessionRecapCompletion(result.completion) : ["Completion: none"]),
    ...(result.context ? renderSessionRecapContext(result.context) : ["Context: none"]),
    ...(result.working_checkpoint ? renderSessionRecapWorking(result.working_checkpoint) : ["Working checkpoint: none"]),
    "",
    "Recent events:",
    ...(result.recent_events.length > 0
      ? result.recent_events.flatMap(renderSessionRecapEvent)
      : ["No recent events."]),
    "",
    "Next commands:",
    ...(result.next_commands.length > 0
      ? result.next_commands.map((command) => `- ${command}`)
      : ["No follow-up commands."]),
    "",
    `Boundary: ${result.boundary}`
  ].join("\n");
}

function renderSessionRecapCompletion(completion: NonNullable<SessionRecapResult["completion"]>): string[] {
  return [
    `Completion: ${completion.completion_status}/${completion.verification_status}`,
    `completion_verified: ${completion.verified}`,
    `completion_ref: ${completion.report_ref}`,
    `final_response_ref: ${completion.final_response_ref ?? "none"}`,
    `completion_summary: ${truncateText(completion.summary, 260)}`
  ];
}

function renderSessionRecapContext(context: NonNullable<SessionRecapResult["context"]>): string[] {
  return [
    `Context: ${context.ref}`,
    `context_chars: ${context.total_chars}`,
    `context_sections: ${context.section_count}`,
    `largest_context_section: ${context.largest_section_title} (${context.largest_section_chars})`,
    `context_recall: memory=${context.memory_hit_count}, archive=${context.archive_ref_count}, opportunities=${context.opportunity_ref_count}, skills=${context.skill_ref_count}`
  ];
}

function renderSessionRecapWorking(working: NonNullable<SessionRecapResult["working_checkpoint"]>): string[] {
  return [
    `Working checkpoint: ${working.ref}`,
    `working_step: ${truncateText(working.current_step, 220)}`,
    `working_next: ${truncateText(working.next_action, 220)}`
  ];
}

function renderSessionRecapEvent(event: SessionRecapEventSummary, index: number): string[] {
  return [
    `${index + 1}. ${event.id}`,
    `   kind: ${event.kind}`,
    `   created: ${event.created_at ?? "unknown"}`,
    `   summary: ${truncateText(event.summary, 220)}`,
    `   refs: ${event.artifact_refs.slice(0, 3).join(", ") || "none"}`
  ];
}

function renderEpisodeSearchHit(hit: EpisodeSearchHit, index: number): string[] {
  return [
    `${index + 1}. ${hit.id}`,
    `   session: ${hit.session_id}`,
    `   kind: ${hit.kind}`,
    `   created: ${hit.created_at ?? "unknown"}`,
    `   score: ${hit.score}`,
    `   summary: ${truncateText(hit.summary, 260)}`,
    `   refs: ${hit.artifact_refs.slice(0, 3).join(", ") || "none"}`
  ];
}

function renderEpisodeEvent(event: EpisodeEventRecord, index: number): string[] {
  return [
    `${index + 1}. ${event.id}`,
    `   turn: ${event.turn_id ?? "none"}`,
    `   kind: ${event.kind}`,
    `   created: ${event.created_at ?? "unknown"}`,
    `   summary: ${truncateText(event.summary, 260)}`,
    `   refs: ${event.artifact_refs.slice(0, 3).join(", ") || "none"}`
  ];
}

function renderMemoryConfirmationSummary(confirmation: MemoryCandidateConfirmationSummary, index: number): string[] {
  return [
    `${index + 1}. ${confirmation.id}`,
    `   status: ${confirmation.status}`,
    `   created: ${confirmation.created_at}`,
    `   candidate: ${confirmation.candidate_id}`,
    `   accepted: ${confirmation.accepted_ref ?? "none"}`,
    `   ref: ${confirmation.confirmation_ref}`
  ];
}

function renderMemoryConfirmationExecutionGate(
  confirmation: MemoryCandidateConfirmationRequest,
  confirmationRef: string,
  stateRoot: string
): string[] {
  if (confirmation.status === "pending") {
    return [
      "- execute explicitly with:",
      `  pnpm run runtime -- memory execute-candidate-confirmation --confirmation ${shellArg(confirmationRef)} --state-root ${shellArg(stateRoot)}`
    ];
  }
  return ["- already executed; inspect the execution result below."];
}

function renderAcceptedSemanticMemorySummary(memory: AcceptedSemanticMemorySummary, index: number): string[] {
  return [
    `${index + 1}. ${memory.id}`,
    `   scope: ${memory.scope}`,
    `   accepted: ${memory.accepted_at}`,
    `   summary: ${memory.summary}`,
    `   ref: ${memory.memory_ref}`
  ];
}

function renderMemoryCandidateSummary(candidate: MemoryCandidateSummary, index: number): string[] {
  return [
    `${index + 1}. ${candidate.id}`,
    `   status: ${candidate.status}`,
    `   scope: ${candidate.scope}`,
    `   created: ${candidate.created_at}`,
    `   summary: ${candidate.summary}`,
    `   ref: ${candidate.candidate_ref}`
  ];
}

function renderMemoryCandidateConfirmationGate(
  candidate: MemoryCandidate,
  candidateRef: string,
  stateRoot: string
): string[] {
  if (candidate.status === "candidate") {
    return [
      "- request explicit local confirmation with:",
      `  pnpm run runtime -- memory request-candidate-confirmation --candidate ${shellArg(candidateRef)} --state-root ${shellArg(stateRoot)}`
    ];
  }
  if (candidate.status === "confirmation_requested" && candidate.confirmation_ref) {
    return [
      "- pending confirmation exists:",
      `  pnpm run runtime -- memory confirmations --confirmation ${shellArg(candidate.confirmation_ref)} --state-root ${shellArg(stateRoot)}`
    ];
  }
  if (candidate.status === "accepted" && candidate.accepted_ref) {
    return [
      "- already accepted:",
      `  pnpm run runtime -- memory accepted --semantic ${shellArg(candidate.accepted_ref)} --state-root ${shellArg(stateRoot)}`
    ];
  }
  return [`- no confirmation request is available for status ${candidate.status}.`];
}

function renderAutonomyPauseStatus(signal: Record<string, unknown> | null, stateRoot: string): string[] {
  if (stringField(signal, "status") !== "active") return ["Autonomy: active"];
  const lines = ["Autonomy: paused"];
  const reason = stringField(signal, "reason");
  const resumeHint = stringField(signal, "resume_hint");
  if (reason) lines.push(`Pause reason: ${truncateText(reason, 180)}`);
  if (resumeHint) lines.push(`Resume hint: ${truncateText(resumeHint, 180)}`);
  lines.push("Pause signal: autonomy/runs/pause_signal.json");
  lines.push(`Resume command: pnpm run runtime -- governance resume-autonomy --reason "..." --state-root ${shellArg(stateRoot)}`);
  return lines;
}

function renderRuntimeBuildStatus(heartbeat: Record<string, unknown> | null): string[] {
  const runtimeBuild = heartbeat && isRecord(heartbeat.runtime_build) ? heartbeat.runtime_build : null;
  return renderRuntimeBuildLines(runtimeBuild ? {
    source_commit_short: stringField(runtimeBuild, "source_commit_short") ?? undefined,
    source_commit: stringField(runtimeBuild, "source_commit") ?? undefined,
    source_branch: stringField(runtimeBuild, "source_branch") ?? undefined,
    source_is_dirty: booleanField(runtimeBuild, "source_is_dirty") ?? undefined,
    built_at: stringField(runtimeBuild, "built_at") ?? undefined
  } : null);
}

function renderGovernanceRuntimeBuild(status: GovernanceStatusResult): string[] {
  return [
    ...renderRuntimeBuildLines(status.service.runtime.runtime_build ?? null),
    ...renderServiceDeploymentLines(status.service.runtime.deployment)
  ];
}

function renderRuntimeBuildLines(runtimeBuild: {
  source_commit_short?: string;
  source_commit?: string;
  source_branch?: string;
  source_is_dirty?: boolean;
  built_at?: string;
} | null): string[] {
  if (!runtimeBuild) return ["Runtime: unknown"];
  const commit = runtimeBuild.source_commit_short
    ?? runtimeBuild.source_commit?.slice(0, 12)
    ?? "unknown";
  const branch = runtimeBuild.source_branch;
  const dirty = runtimeBuild.source_is_dirty;
  const builtAt = runtimeBuild.built_at;
  const suffix = branch
    ? ` (${branch}${dirty === true ? ", dirty" : ""})`
    : dirty === true ? " (dirty)" : "";
  return [
    `Runtime: ${commit}${suffix}`,
    `Runtime built: ${builtAt ?? "unknown"}`
  ];
}

function renderServiceDeploymentLines(deployment: ServiceDeploymentSummary): string[] {
  const lines = [
    `Deployment: ${deployment.status}`,
    `Deployment reason: ${deployment.reason}`,
    `Repo HEAD: ${deployment.repo_commit_short ?? "unknown"}${deployment.repo_branch ? ` (${deployment.repo_branch})` : ""}`
  ];
  if (deployment.status === "stale") lines.push(`Restart: ${deployment.restart_command}`);
  return lines;
}

function renderReviewTickFocus(status: Record<string, unknown> | null): string[] {
  const focus = status && isRecord(status.last_focus) ? status.last_focus : null;
  if (!focus) return [];
  const lines = [
    `Review focus: ${stringField(focus, "source") ?? "unknown"}`
  ];
  const opportunity = isRecord(focus.opportunity) ? focus.opportunity : null;
  if (opportunity) {
    lines.push(`Focus item: ${stringField(opportunity, "kind") ?? "unknown"}:${stringField(opportunity, "id") ?? "unknown"}`);
    const actionChain = actionChainField(opportunity.action_chain);
    if (actionChain) lines.push(`Focus action_chain: ${renderActionChainSummary(actionChain)}`);
  }
  const reason = stringField(focus, "reason");
  if (reason) lines.push(`Focus reason: ${truncateText(reason, 180)}`);
  return lines;
}

function renderReviewTickWake(status: Record<string, unknown> | null): string[] {
  if (!status) return [];
  return [
    `Review tick next_wake_at: ${stringField(status, "next_wake_at") ?? "none"}`,
    `Review tick next_wake_delay_ms: ${numberField(status, "next_wake_delay_ms") ?? "none"}`,
    `Review tick next_wake_reason: ${stringField(status, "next_wake_reason") ?? "none"}`
  ];
}

function renderReviewTickInboxCounts(status: Record<string, unknown> | null): string[] {
  if (!status) return [];
  const raw = numberField(status, "last_inbox_count");
  const activeTick = numberField(status, "last_active_tick_inbox_count");
  const activeTotal = numberField(status, "last_active_inbox_count");
  if (raw === null && activeTick === null && activeTotal === null) return [];
  return [`Review tick inbox: raw=${raw ?? "none"} active_tick=${activeTick ?? "none"} active_total=${activeTotal ?? "none"}`];
}

function renderReviewTickInactiveDiagnosis(status: Record<string, unknown> | null): string[] {
  if (!status) return [];
  const inactive = numberField(status, "last_inactive_tick_inbox_count");
  if (inactive === null) return [];
  const reasons = numberRecordField(status, "last_inactive_tick_inbox_reasons");
  return [
    `Review tick inactive inbox: count=${inactive}${reasons ? ` reasons=${renderStatusCounts(reasons)}` : ""}`
  ];
}

function renderServiceHealthFocus(focus: ServiceReviewTickFocusSummary | undefined): string[] {
  if (!focus) return [];
  const lines = [
    `review_focus: ${focus.source}`
  ];
  if (focus.opportunity) {
    lines.push(`review_focus_item: ${focus.opportunity.kind}:${focus.opportunity.id}`);
    if (focus.opportunity.action_chain) {
      lines.push(`review_focus_action_chain: ${renderActionChainSummary(focus.opportunity.action_chain)}`);
    }
  }
  if (focus.reason) lines.push(`review_focus_reason: ${truncateText(focus.reason, 180)}`);
  return lines;
}

function renderInboxItem(item: ReviewInboxItemView, index: number): string[] {
  return [
    `${index + 1}. ${item.id}`,
    `   status: ${item.status}`,
    ...(item.latest_decision ? [`   decision: ${item.latest_decision.status} (${item.latest_decision.ref})`] : []),
    ...(item.duplicate_group ? [`   duplicates: ${item.duplicate_group.duplicate_count}`] : []),
    `   action: ${item.action_kind}`,
    `   title: ${item.title}`,
    `   seen: ${item.seen_count}`,
    `   writes: ${item.would_write.join(", ") || "none"}`,
    ...(item.focus_action_chain ? [`   focus_action_chain: ${renderActionChainSummary(item.focus_action_chain)}`] : []),
    `   confirmation: ${item.confirmation_ref ?? "none"}`
  ];
}

function renderReviewInboxDuplicateGroup(
  group: ReviewInboxItemView["duplicate_group"],
  itemId: string
): string[] {
  if (!group) return ["- none"];
  return [
    `- key: ${group.key}`,
    `- canonical: ${group.canonical_id}`,
    `- duplicate_count: ${group.duplicate_count}`,
    `- duplicate_refs: ${group.duplicate_refs.join(", ") || "none"}`,
    ...(group.canonical_id === itemId ? [] : [`- use canonical item: ${group.canonical_ref}`])
  ];
}

function renderReviewTickSummary(tick: ReviewTickHistorySummary, index: number): string[] {
  const lines = [
    `${index + 1}. ${tick.id}`,
    `   created: ${tick.created_at}`,
    `   mode: ${tick.mode}`,
    `   query: ${tick.query ?? "n/a"}`,
    `   focus: ${tick.focus.source}`,
    `   review: ${tick.review_ref}`,
    `   proposals: ${tick.proposal_count}`,
    `   inbox_items: ${tick.inbox_count}`,
    `   ref: ${tick.tick_ref}`
  ];
  if (tick.focus.opportunity) {
    lines.push(`   focus_item: ${tick.focus.opportunity.kind}:${tick.focus.opportunity.id}`);
    if (tick.focus.opportunity.action_chain) {
      lines.push(`   focus_action_chain: ${renderActionChainSummary(tick.focus.opportunity.action_chain)}`);
    }
  }
  return lines;
}

function renderBackgroundReviewSummary(review: BackgroundReviewHistorySummary, index: number): string[] {
  return [
    `${index + 1}. ${review.id}`,
    `   created: ${review.created_at}`,
    `   mode: ${review.mode}`,
    `   query: ${review.query ?? "n/a"}`,
    `   session: ${review.session_id ?? "n/a"}`,
    `   events_reviewed: ${review.events_reviewed}`,
    `   sessions_seen: ${review.sessions_seen}`,
    `   proposals: ${review.proposal_count}`,
    `   proposal_types: ${renderStatusCounts(review.proposal_types)}`,
    `   chain_summaries: ${review.chain_summary_count}`,
    `   evidence: ${review.evidence_event_id ?? "none"}`,
    `   ref: ${review.review_ref}`
  ];
}

function renderCompletionVerificationSummary(
  report: CompletionVerificationHistorySummary,
  index: number
): string[] {
  return [
    `${index + 1}. ${report.id}`,
    `   created: ${report.created_at}`,
    `   session: ${report.session_id}`,
    `   completion_status: ${report.completion_status}`,
    `   verification_status: ${report.verification_status}`,
    `   verified: ${report.verified}`,
    `   failed_checks: ${report.failed_checks.map((check) => check.id).join(", ") || "none"}`,
    `   warning_checks: ${report.warning_checks.map((check) => check.id).join(", ") || "none"}`,
    `   summary: ${truncateText(report.summary, 260)}`,
    `   ref: ${report.report_ref}`
  ];
}

function renderLiveRunTraceSummary(
  trace: LiveRunTraceSummary,
  index: number
): string[] {
  return [
    `${index + 1}. ${trace.completion_id}`,
    `   created: ${trace.created_at}`,
    `   session: ${trace.session_id}`,
    `   completion_status: ${trace.completion_status}`,
    `   verification_status: ${trace.verification_status}`,
    `   verified: ${trace.verified}`,
    `   events: ${trace.event_count} (${renderStatusCounts(trace.event_kind_counts)})`,
    `   rounds: ${trace.rounds.length}`,
    `   tool_results: ${trace.tool_result_count}`,
    `   model_diagnostics: ${trace.model_diagnostic_count}`,
    `   repo_write_guards: ${trace.repo_write_guard_count}`,
    `   delegated_results: ${trace.delegated_result_count}`,
    `   delegated_results_failed: ${trace.delegated_result_failed_count}`,
    `   delegated_completion_gate_statuses: pass=${trace.delegated_completion_gate_status_counts.pass}, warning=${trace.delegated_completion_gate_status_counts.warning}, fail=${trace.delegated_completion_gate_status_counts.fail}, skipped=${trace.delegated_completion_gate_status_counts.skipped}`,
    `   delegated_dispatch_missing_result_ref: ${trace.delegated_dispatch_missing_result_ref_count}`,
    `   harness_state_actions: ${trace.harness_action_count}`,
    `   summary: ${truncateText(trace.summary, 260)}`,
    `   ref: ${trace.report_ref}`
  ];
}

function renderLiveRunModelDiagnostic(diagnostic: LiveRunTraceSummary["model_diagnostics"][number]): string[] {
  return [
    `- round_${diagnostic.round}: ${diagnostic.failure_kind}`,
    `  stage: ${diagnostic.stage}`,
    `  diagnostic_ref: ${diagnostic.diagnostic_ref}`,
    `  response_ref: ${diagnostic.response_ref ?? "none"}`,
    `  error_preview: ${truncateText(diagnostic.error_preview, 260) || "none"}`,
    `  event: ${diagnostic.event_id}`
  ];
}

function renderLiveRunRepoWriteGuard(guard: LiveRunTraceSummary["repo_write_guards"][number]): string[] {
  return [
    `- ${guard.path}`,
    `  before: ${guard.before_status} (${guard.before_changed_file_count} changed)`,
    `  after: ${guard.after_status} (${guard.after_changed_file_count} changed)`,
    `  delta: ${guard.changed_file_count_delta}`,
    `  preexisting_dirty: ${guard.preexisting_dirty}`,
    `  target_changed: ${guard.target_changed_after_write}`,
    `  event: ${guard.event_id}`
  ];
}

function renderLiveRunDelegatedDispatch(dispatch: LiveRunTraceSummary["delegated_dispatches"][number]): string[] {
  return [
    `- action_id: ${dispatch.action_id}`,
    `  round: ${dispatch.round}`,
    `  sequence: ${dispatch.sequence}`,
    `  envelope_ref: ${dispatch.envelope_ref ?? "none"}`,
    `  contract_status: ${dispatch.contract_status}`,
    `  ok: ${dispatch.ok}`,
    `  dispatch_failure_kind: ${dispatch.dispatch_failure_kind ?? "none"}`,
    `  result_failure_kind: ${dispatch.result_failure_kind ?? "none"}`,
    `  task_chars: ${dispatch.task_chars}`,
    `  context_chars: ${dispatch.context_chars}`,
    `  ref: ${dispatch.result_ref}`,
    `  event: ${dispatch.event_id}`
  ];
}

function renderLiveRunTraceRound(round: LiveRunTraceRound): string[] {
  return [
    `- round_${round.round}: ${round.envelope_ref}`,
    `  completion_status: ${round.completion_status}`,
    `  summary: ${truncateText(round.summary, 260)}`,
    `  action_counts: ${renderStatusCounts(round.action_counts)}`,
    `  action_types: ${round.action_types.join(", ") || "none"}`,
    `  delegated_action_ids: ${round.delegated_action_ids.join(", ") || "none"}`,
    `  delegated_action_sequence_by_id: ${renderStatusCounts(round.delegated_action_sequence_by_id)}`,
    `  harness_action_types: ${round.harness_action_types.join(", ") || "none"}`
  ];
}

function renderHarnessReplaySummary(replay: HarnessReplayAuditReport, index: number): string[] {
  return [
    `${index + 1}. ${replay.id}`,
    `   status: ${replay.status}`,
    `   created: ${replay.created_at}`,
    `   completion_id: ${replay.completion_id}`,
    `   session: ${replay.session_id}`,
    `   trace_ref: ${replay.trace_ref}`,
    `   replay_result: ${replay.replay_result}`,
    `   checks: ${renderStatusCounts(countReplayChecks(replay))}`,
    `   repo_write_guards: ${replay.metrics.repo_write_guards}`,
    `   delegated_failed: ${replay.metrics.delegated_results_failed}`,
    `   delegated_dispatches: ${replay.metrics.delegated_dispatches}`,
    `   summary: ${truncateText(replay.summary, 260)}`,
    `   ref: ${replay.artifact_refs.json_ref}`
  ];
}

function renderHarnessReplayDetail(replay: HarnessReplayAuditReport): string[] {
  return [
    `id: ${replay.id}`,
    `status: ${replay.status}`,
    `created: ${replay.created_at}`,
    `completion_id: ${replay.completion_id}`,
    `session: ${replay.session_id}`,
    `turn: ${replay.turn_id}`,
    `trace_ref: ${replay.trace_ref}`,
    `replay_result: ${replay.replay_result}`,
    `summary: ${truncateText(replay.summary, 500)}`,
    `metrics: rounds=${replay.metrics.rounds}, events=${replay.metrics.events}, tool_results=${replay.metrics.tool_results}, delegated_failed=${replay.metrics.delegated_results_failed}, delegated_dispatches=${replay.metrics.delegated_dispatches}, delegated_dispatches_failed=${replay.metrics.delegated_dispatches_failed}, repo_write_guards=${replay.metrics.repo_write_guards}`,
    `delegated_completion_gate_statuses: pass=${replay.metrics.delegated_completion_gate_passed}, warning=${replay.metrics.delegated_completion_gate_warning}, fail=${replay.metrics.delegated_completion_gate_failed}, skipped=${replay.metrics.delegated_completion_gate_skipped}`,
    `json_ref: ${replay.artifact_refs.json_ref}`,
    `markdown_ref: ${replay.artifact_refs.markdown_ref}`,
    "",
    "Checks:",
    ...replay.checks.flatMap((check) => [
      `- ${check.id}: ${check.status}`,
      `  summary: ${truncateText(check.summary, 260)}`,
      `  refs: ${check.refs.slice(0, 5).join(", ") || "none"}`
    ]),
    "",
    "Delegated dispatches:",
    ...(replay.delegated_dispatches.length > 0
      ? replay.delegated_dispatches.slice(0, 5).flatMap(renderLiveRunDelegatedDispatch)
      : ["- none"]),
    ...(replay.delegated_dispatches.length > 5
      ? [`- omitted_delegated_dispatches: ${replay.delegated_dispatches.length - 5}`]
      : []),
    "",
    "Refs:",
    ...(replay.refs.length > 0 ? replay.refs.slice(0, 12).map((ref) => `- ${ref}`) : ["- none"])
  ];
}

function countReplayChecks(replay: HarnessReplayAuditReport): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const check of replay.checks) counts[check.status] = (counts[check.status] ?? 0) + 1;
  return counts;
}

function renderSelectedSkillOutcomeSummary(
  outcome: SelectedSkillOutcomeHistorySummary,
  index: number
): string[] {
  return [
    `${index + 1}. ${outcome.id}`,
    `   created: ${outcome.created_at}`,
    `   session: ${outcome.session_id}`,
    `   skill: ${outcome.skill_name}`,
    `   completion_status: ${outcome.completion_status}`,
    `   verification_status: ${outcome.verification_status}`,
    `   verified: ${outcome.verified}`,
    `   verdict: ${outcome.verdict}`,
    `   completion_report_ref: ${outcome.completion_report_ref}`,
    `   use_count: ${outcome.use_count ?? "none"}`,
    `   ref: ${outcome.outcome_ref}`
  ];
}

function renderSkillCatalogSummary(
  skill: SkillCatalogSummary,
  index: number
): string[] {
  return [
    `${index + 1}. ${skill.name}`,
    `   status: ${skill.status}`,
    `   source: ${skill.source}`,
    `   trust_level: ${skill.trust_level}`,
    `   description: ${truncateText(skill.description, 220)}`,
    `   use_count: ${skill.use_count}`,
    `   last_used_at: ${skill.last_used_at ?? "none"}`,
    `   instructions_ref: ${skill.instructions_ref}`,
    `   metadata_ref: ${skill.metadata_ref}`
  ];
}

function renderSkillRegistryHealthIssue(
  issue: SkillRegistryHealthIssue,
  index: number
): string[] {
  return [
    `${index + 1}. ${issue.id}`,
    `   status: ${issue.status}`,
    `   kind: ${issue.kind}`,
    `   skill: ${issue.skill_name ?? "unknown"}`,
    `   instructions_ref: ${issue.instructions_ref ?? "none"}`,
    `   registry_ref: ${issue.registry_ref ?? "none"}`,
    `   event_ref: ${issue.event_ref ?? "none"}`,
    `   reason: ${truncateText(issue.reason, 220)}`,
    `   inspect: ${issue.inspect_command}`,
    ...(issue.sync_command ? [`   sync: ${issue.sync_command}`] : []),
    ...(issue.retire_event_command ? [`   retire_event: ${issue.retire_event_command}`] : []),
    `   ref: ${issue.ref}`
  ];
}

function renderSelectedSkillDriftSummary(
  drift: SelectedSkillDriftSummary,
  index: number
): string[] {
  return [
    `${index + 1}. ${drift.id}`,
    `   skill: ${drift.skill_name}`,
    `   status: ${drift.status}`,
    `   attention_count: ${drift.attention_count}`,
    `   failed_count: ${drift.failed_count}`,
    `   latest_attention_outcome_ref: ${drift.latest_attention_outcome_ref}`,
    `   latest_completion_report_ref: ${drift.latest_completion_report_ref}`,
    `   use_count: ${drift.use_count ?? "none"}`,
    `   ref: ${drift.latest_attention_outcome_ref}`
  ];
}

function renderSkillRegistryEventSummary(
  event: SkillRegistryEventSummary,
  index: number
): string[] {
  return [
    `${index + 1}. ${event.id}`,
    `   kind: ${event.kind}`,
    `   skill: ${event.skill_name}`,
    `   created: ${event.created_at}`,
    `   instructions_ref: ${event.instructions_ref}`,
    `   source_sop_ref: ${event.source_sop_ref ?? "none"}`,
    `   evidence_refs: ${event.evidence_refs.length}`,
    `   artifact_refs: ${event.artifact_refs.length}`,
    `   summary: ${truncateText(event.summary, 220)}`,
    `   ref: ${event.event_ref}`
  ];
}

function renderReviewInboxDecision(
  decision: ReviewInboxDecisionWithRef | undefined,
  itemId: string,
  stateRoot: string
): string[] {
  if (!decision) {
    return [
      "- none",
      `- record_decision: pnpm run runtime -- review decide-inbox --item ${shellArg(itemId)} --status deferred --reason "..." --state-root ${shellArg(stateRoot)}`
    ];
  }
  return [
    `- status: ${decision.status}`,
    `- reason: ${truncateText(decision.reason, 260)}`,
    `- ref: ${decision.ref}`,
    `- update_decision: pnpm run runtime -- review decide-inbox --item ${shellArg(itemId)} --status open --reason "..." --state-root ${shellArg(stateRoot)}`
  ];
}

function renderInboxConfirmationGate(
  item: ReviewInboxItem,
  stateRoot: string,
  decision?: ReviewInboxDecisionWithRef
): string[] {
  if (decision && decision.status !== "open") {
    return [
      `- blocked by latest operator decision: ${decision.status} (${decision.ref})`,
      `- reason: ${truncateText(decision.reason, 260)}`,
      `- reopen with: pnpm run runtime -- review decide-inbox --item ${shellArg(item.id)} --status open --reason "..." --state-root ${shellArg(stateRoot)}`
    ];
  }
  if (item.status === "executed") {
    return ["- already executed; inspect the linked confirmation or execution refs."];
  }
  if (item.status === "confirmation_requested" && item.confirmation_ref) {
    return [
      "- pending confirmation exists:",
      `  pnpm run runtime -- review confirmations --confirmation ${shellArg(item.confirmation_ref)} --state-root ${shellArg(stateRoot)}`
    ];
  }
  if (item.would_write.length === 0) {
    return ["- no mutation confirmation required for this read-only inbox item."];
  }
  if (item.action_kind === "revise_skill") {
    const sopRef = item.required_refs.find(isSopDraftRef);
    if (sopRef) {
      return [
        "- inspect reused-skill coverage first:",
        `  pnpm run runtime -- review coverage --sop ${shellArg(refId(sopRef))} --state-root ${shellArg(stateRoot)}`,
        "- then request explicit local confirmation with:",
        `  pnpm run runtime -- review request-inbox-confirmation --item ${shellArg(item.id)} --state-root ${shellArg(stateRoot)}`
      ];
    }
  }
  return [
    "- request explicit local confirmation with:",
    `  pnpm run runtime -- review request-inbox-confirmation --item ${shellArg(item.id)} --state-root ${shellArg(stateRoot)}`
  ];
}

function resolveContentDailyJobRef(selection: string | undefined, fallbackRef: string | null): string | null {
  if (!selection) return fallbackRef;
  const value = selection.trim();
  if (!value) return fallbackRef;
  const trackDate = value.match(/^([A-Za-z0-9_-]+)\/(\d{4}-\d{2}-\d{2})$/);
  if (trackDate) return `content/daily/${trackDate[1]}/${trackDate[2]}.json`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `content/daily/${value}.json`;
  if (value.startsWith("content/daily/")) return value.endsWith(".json") ? value : `${value}.json`;
  if (/^\d{4}-\d{2}-\d{2}\.json$/.test(value)) return `content/daily/${value}`;
  return value;
}

function renderContentFeedbackRefreshStatus(status: Record<string, unknown> | null): string[] {
  return [
    `Feedback refresh: ${stringField(status, "state") ?? "unknown"} (enabled=${booleanField(status, "enabled") ?? false})`,
    `Feedback refresh queue: ${numberField(status, "last_queue_count") ?? "none"} due=${numberField(status, "last_due_count") ?? "none"} captured=${numberField(status, "last_captured_count") ?? "none"}`,
    `Feedback refresh next_due_at: ${stringField(status, "next_due_at") ?? "none"}`,
    `Feedback refresh next_wake_at: ${stringField(status, "next_wake_at") ?? "none"}`,
    `Feedback refresh next_wake_delay_ms: ${numberField(status, "next_wake_delay_ms") ?? "none"}`,
    `Feedback refresh next_wake_reason: ${stringField(status, "next_wake_reason") ?? "none"}`,
    ...(stringField(status, "next_due_run_ref") ? [
      `Feedback refresh next_due_run: ${stringField(status, "next_due_run_ref")}`,
      `Feedback refresh next_due_reason: ${stringField(status, "next_due_reason") ?? "unknown"}`
    ] : []),
    ...(stringField(status, "next_due_command") ? [
      `Feedback refresh next_due_command: ${stringField(status, "next_due_command")}`
    ] : [])
  ];
}

function renderContentCreatorMetricsStatus(status: Record<string, unknown> | null): string[] {
  return [
    `Creator metrics: ${stringField(status, "state") ?? "unknown"} (enabled=${booleanField(status, "enabled") ?? false})`,
    `Creator metrics queue: ${numberField(status, "last_queue_count") ?? "none"} captured=${numberField(status, "last_captured_count") ?? "none"} blocked=${numberField(status, "last_blocked_count") ?? "none"} failed=${numberField(status, "last_failed_count") ?? "none"}`,
    `Creator metrics next_due_at: ${stringField(status, "next_due_at") ?? "none"}`,
    `Creator metrics next_wake_at: ${stringField(status, "next_wake_at") ?? "none"}`,
    `Creator metrics next_wake_delay_ms: ${numberField(status, "next_wake_delay_ms") ?? "none"}`,
    `Creator metrics next_wake_reason: ${stringField(status, "next_wake_reason") ?? "none"}`,
    ...(stringField(status, "next_due_run_ref") ? [
      `Creator metrics next_due_run: ${stringField(status, "next_due_run_ref")}`
    ] : []),
    ...(stringField(status, "next_due_command") ? [
      `Creator metrics next_due_command: ${stringField(status, "next_due_command")}`
    ] : []),
    ...(stringArrayField(status, "last_run_refs").length > 0 ? [
      `Creator metrics last_runs: ${stringArrayField(status, "last_run_refs").join(",")}`
    ] : []),
    ...(stringArrayField(status, "last_next_commands").length > 0 ? [
      `Creator metrics next_command: ${stringArrayField(status, "last_next_commands")[0]}`
    ] : [])
  ];
}

function renderServiceHealthContentDailyProgress(
  status: ServiceHealthResult["content_daily"]
): string[] {
  if (!status.current_step) return [];
  return [
    `content_daily_current_step: ${status.current_step}`,
    `content_daily_current_step_status: ${status.current_step_status ?? "unknown"}`,
    `content_daily_current_track: ${status.current_track_id ?? "default"} ${status.current_track_index ?? "?"}/${status.current_track_count ?? "?"}`,
    `content_daily_current_step_age_ms: ${status.current_step_age_ms ?? "unknown"}`,
    `content_daily_current_step_freshness: ${status.current_step_freshness ?? "unknown"}`,
    ...(status.current_step_summary ? [`content_daily_current_step_summary: ${truncateText(status.current_step_summary, 180)}`] : []),
    ...(status.current_job_ref ? [`content_daily_current_job_ref: ${status.current_job_ref}`] : []),
    ...(status.current_run_ref ? [`content_daily_current_run_ref: ${status.current_run_ref}`] : [])
  ];
}

function renderContentDailyStatus(
  status: Record<string, unknown> | null,
  effectiveStatus?: ContentDailyEffectiveJobStatus,
  publishEvents: ContentPublishHistoryEvent[] = []
): string[] {
  return [
    `Content daily: ${stringField(status, "state") ?? "unknown"} (enabled=${booleanField(status, "enabled") ?? false})`,
    `Content daily last_job: raw=${stringField(status, "last_job_status") ?? "none"} effective=${effectiveStatus ?? "none"} count=${numberField(status, "last_job_count") ?? "none"}`,
    ...renderContentDailyPublishLines(status),
    ...renderContentPublishAttributionLines(publishEvents),
    `Content daily strategies: applied=${numberField(status, "last_applied_strategy_count") ?? "none"} blocked=${numberField(status, "last_blocked_strategy_count") ?? "none"}`,
    ...(stringArrayField(status, "last_blocked_strategy_postures").length > 0 ? [
      `Content daily blocked_strategy_postures: ${stringArrayField(status, "last_blocked_strategy_postures").join(",")}`
    ] : []),
    ...(stringArrayField(status, "last_blocked_strategy_reasons").length > 0 ? [
      `Content daily blocked_strategy_reasons: ${stringArrayField(status, "last_blocked_strategy_reasons").join(",")}`
    ] : []),
    ...renderContentDailyProgressLines(status),
    ...(stringField(status, "last_skip_reason") ? [`Content daily skip_reason: ${stringField(status, "last_skip_reason")}`] : []),
    `Content daily updated_at: ${stringField(status, "updated_at") ?? "unknown"}`
  ];
}

function renderContentDailyProgressLines(status: Record<string, unknown> | null): string[] {
  const step = stringField(status, "current_step");
  if (!step) return [];
  return [
    `Content daily current_step: ${step} (${stringField(status, "current_step_status") ?? "unknown"})`,
    `Content daily current_track: ${stringField(status, "current_track_id") ?? "default"} ${numberField(status, "current_track_index") ?? "?"}/${numberField(status, "current_track_count") ?? "?"}`,
    ...(stringField(status, "current_step_summary") ? [`Content daily current_summary: ${truncateText(stringField(status, "current_step_summary") ?? "", 180)}`] : [])
  ];
}

function renderContentDailyServiceLines(
  service: Record<string, unknown> | null,
  effectiveStatus?: ContentDailyEffectiveJobStatus,
  publishEvents: ContentPublishHistoryEvent[] = []
): string[] {
  return [
    `service_state: ${stringField(service, "state") ?? "unknown"}`,
    `enabled: ${stringifyOptionalBoolean(booleanField(service, "enabled"))}`,
    `dry_run: ${stringifyOptionalBoolean(booleanField(service, "dry_run"))}`,
    `preflight: ${stringifyOptionalBoolean(booleanField(service, "preflight"))}`,
    `publish_enabled: ${stringifyOptionalBoolean(booleanField(service, "publish_enabled"))}`,
    `external_write_confirmed: ${stringifyOptionalBoolean(booleanField(service, "external_write_confirmed"))}`,
    `last_date_key: ${stringField(service, "last_date_key") ?? "none"}`,
    `last_track_id: ${stringField(service, "last_track_id") ?? "none"}`,
    `last_job_count: ${numberField(service, "last_job_count") ?? "none"}`,
    `last_job_status: ${stringField(service, "last_job_status") ?? "none"}`,
    `last_effective_job_status: ${effectiveStatus ?? "none"}`,
    ...renderContentDailyPublishLines(service),
    ...renderContentPublishAttributionLines(publishEvents),
    ...renderContentDailyProgressLines(service),
    ...(stringField(service, "last_skip_reason") ? [`last_skip_reason: ${stringField(service, "last_skip_reason")}`] : []),
    `updated_at: ${stringField(service, "updated_at") ?? "unknown"}`
  ];
}

function renderContentDailyPublishLines(status: Record<string, unknown> | null): string[] {
  const count = numberField(status, "last_publish_count");
  if (count === null) return [];
  return [
    `Content daily publish: count=${count} published=${numberField(status, "last_publish_published_count") ?? "none"} direct=${numberField(status, "last_publish_direct_count") ?? "none"} reconciled=${numberField(status, "last_publish_reconciled_count") ?? "none"} failed=${numberField(status, "last_publish_failed_count") ?? "none"}`,
    ...(stringArrayField(status, "last_publish_adapters").length > 0 ? [
      `Content daily publish_adapters: ${stringArrayField(status, "last_publish_adapters").join(",")}`
    ] : []),
    ...(stringArrayField(status, "last_publish_tools").length > 0 ? [
      `Content daily publish_tools: ${stringArrayField(status, "last_publish_tools").join(",")}`
    ] : []),
    ...(stringField(status, "last_publish_latest_run_ref") ? [
      `Content daily latest_publish: ${stringField(status, "last_publish_latest_title") ?? "unknown"} / ${stringField(status, "last_publish_latest_route") ?? "unknown"} / ${stringField(status, "last_publish_latest_run_ref")}`
    ] : []),
    ...(stringField(status, "last_publish_latest_post_url") ? [
      `Content daily latest_post_url: ${stringField(status, "last_publish_latest_post_url")}`
    ] : [])
  ];
}

function renderContentPublishAttributionLines(events: ContentPublishHistoryEvent[]): string[] {
  if (events.length === 0) return [];
  return [
    "Content daily publish_attribution:",
    ...events.slice(0, 5).map((event) =>
      `- ${event.title} / publish=${event.adapter}${event.tool ? `:${event.tool}` : ""} / route=${event.route} / feedback=${renderFeedbackCaptureAttribution(event)} / run=${event.run_ref}`
    )
  ];
}

function renderFeedbackCaptureAttribution(event: ContentPublishHistoryEvent): string {
  if (event.feedback_snapshot_count === 0) return "none";
  const sources = Object.entries(event.feedback_captured_by)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => `${source}:${count}`)
    .join(",");
  const latest = event.latest_feedback_captured_by
    ? ` latest=${event.latest_feedback_captured_by}/${event.latest_feedback_status ?? "unknown"}`
    : "";
  return `${sources || "unknown"}${latest}`;
}

function renderContentDailyJob(
  job: DailyContentJobResult,
  detail: ContentRunDetailResult | null,
  service: Record<string, unknown> | null,
  stateRoot: string,
  creatorMetricsNeeded: ContentCreatorMetricsNeededItem[] = [],
  serviceEffectiveStatus?: ContentDailyEffectiveJobStatus,
  publishEvents: ContentPublishHistoryEvent[] = []
): string {
  const jobEffectiveStatus = contentDailyJobEffectiveStatus(job, detail);
  const nextCommands = contentDailyJobNextCommands(job, jobEffectiveStatus, detail, stateRoot);
  return [
    "Content daily",
    "",
    ...renderContentDailyServiceLines(service, serviceEffectiveStatus, publishEvents),
    "",
    `job_id: ${job.id}`,
    `date: ${job.date_key}`,
    `track: ${job.track_id ?? "default"}`,
    `status: ${job.status}`,
    `effective_status: ${jobEffectiveStatus}`,
    `external_write: ${job.external_write}`,
    `topic: ${truncateText(job.topic, 220)}`,
    `job_ref: ${job.job_ref}`,
    `run_ref: ${job.run_ref}`,
    `created: ${job.created_at}`,
    `updated: ${job.updated_at}`,
    "",
    "Steps:",
    ...job.steps.flatMap(renderContentDailyStep),
    "",
    "Linked run:",
    ...(detail ? renderContentRunSummaryLines(detail, stateRoot) : [`- missing or invalid run: ${job.run_id}`]),
    "",
    ...renderCreatorMetricsNeededLines(creatorMetricsNeeded, stateRoot),
    "",
    "Next commands:",
    ...(nextCommands.length > 0
      ? nextCommands.slice(0, 5).map((command) => `- ${command}`)
      : ["- none"]),
    "",
    "This command is read-only. It does not read draft bodies or image bytes, generate images, call MCP, publish, invoke the model, or mutate state."
  ].join("\n");
}

function contentDailyJobEffectiveStatus(
  job: DailyContentJobResult,
  detail: ContentRunDetailResult | null
): ContentDailyEffectiveJobStatus {
  if (detail?.run.status === "published" || detail?.run.evidence.publish_status === "published") return "published";
  return job.status;
}

function contentDailyJobNextCommands(
  job: DailyContentJobResult,
  effectiveStatus: ContentDailyEffectiveJobStatus,
  detail: ContentRunDetailResult | null,
  stateRoot: string
): string[] {
  if (effectiveStatus !== "published") return job.next_commands;
  return [
    ...job.next_commands.filter((command) => !contentDailyStalePublishedCommand(command)),
    `pnpm run runtime -- content show --run ${detail?.run.id ?? job.run_id} --state-root ${stateRoot}`
  ];
}

function contentDailyStalePublishedCommand(command: string): boolean {
  return command.includes(" content publish-execute ")
    || command.includes(" content daily-advance ");
}

function renderContentDailyStep(step: DailyContentJobStep): string[] {
  return [
    `- ${step.id}: ${step.status}`,
    `  summary: ${truncateText(step.summary, 220)}`,
    ...(step.ref ? [`  ref: ${step.ref}`] : []),
    ...(step.error ? [`  error: ${truncateText(step.error, 220)}`] : [])
  ];
}

function renderContentRunDetail(
  detail: ContentRunDetailResult,
  stateRoot: string,
  creatorMetricsNeeded: ContentCreatorMetricsNeededItem[] = []
): string {
  return [
    "Content run",
    "",
    ...renderContentRunSummaryLines(detail, stateRoot),
    "",
    ...renderCreatorMetricsNeededLines(creatorMetricsNeeded, stateRoot),
    "",
    "This command is read-only. It does not read draft bodies or image bytes, generate images, call MCP, publish, invoke the model, or mutate state."
  ].join("\n");
}

function renderCreatorMetricsNeededLines(
  items: ContentCreatorMetricsNeededItem[],
  stateRoot: string
): string[] {
  if (items.length === 0) {
    return [
      "Creator metrics needed:",
      "- none"
    ];
  }
  return [
    "Creator metrics needed:",
    `readiness: ${materializeStateRootCommand(items[0].readiness_command, stateRoot)}`,
    ...items.slice(0, 3).flatMap((item, index) => [
      `${index + 1}. ${item.title}`,
      `   reason: ${item.reason}`,
      `   missing: ${item.missing_metrics.join(", ")}`,
      `   latest_feedback: ${item.latest_feedback_ref}`,
      ...(item.post_url ? [`   post_url: ${item.post_url}`] : []),
      `   next: ${materializeStateRootCommand(item.next_command, stateRoot)}`
    ])
  ];
}

function materializeStateRootCommand(command: string, stateRoot: string): string {
  return command.replace("--state-root <state-root>", `--state-root ${shellArg(stateRoot)}`);
}

function renderContentRunSummaryLines(detail: ContentRunDetailResult, stateRoot: string): string[] {
  const summary = detail.summary;
  return [
    `- id: ${summary.id}`,
    `- title: ${summary.title}`,
    `- status: ${summary.status}`,
    `- topic: ${truncateText(summary.topic, 220)}`,
    `- sources: ${summary.source_count} (evidence refs ${summary.evidence_ref_count})`,
    `- image_status: ${summary.image_status}`,
    `- publish_preflight_status: ${summary.publish_preflight_status}`,
    `- publish_status: ${summary.publish_status}`,
    `- adapter: ${summary.publish_adapter}`,
    `- run_ref: ${summary.run_ref}`,
    `- brief_ref: ${summary.brief_ref}`,
    `- image_prompt_ref: ${summary.image_prompt_ref}`,
    `- publish_plan_ref: ${summary.publish_plan_ref}`,
    ...(summary.image_evidence_ref ? [`- image_evidence_ref: ${summary.image_evidence_ref}`] : []),
    ...(summary.publish_preflight_ref ? [`- publish_preflight_ref: ${summary.publish_preflight_ref}`] : []),
    ...(summary.publish_evidence_ref ? [`- publish_evidence_ref: ${summary.publish_evidence_ref}`] : []),
    `- inspect: pnpm run runtime -- content show --run ${shellArg(summary.id)} --state-root ${shellArg(stateRoot)}`
  ];
}

function parseLogLimit(value: string): number | undefined {
  const match = value.match(/\d+/);
  if (!match) return undefined;
  return Number.parseInt(match[0] ?? "", 10);
}

function clampLogLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(80, Math.max(1, Math.trunc(value ?? 20)));
}

async function tailLogFile(path: string, limit: number): Promise<string> {
  try {
    const raw = await readFile(path, "utf8");
    const lines = raw.trimEnd().split(/\r?\n/);
    return truncateLogText(lines.slice(-limit).map((line) => truncateText(line, 300)).join("\n"), 3000);
  } catch {
    return "";
  }
}

function truncateLogText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n...`;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function booleanField(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function stringArrayField(record: Record<string, unknown> | null, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function numberRecordField(record: Record<string, unknown> | null, key: string): Record<string, number> | undefined {
  const value = record?.[key];
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, number] =>
    entry[0].length > 0
    && typeof entry[1] === "number"
    && Number.isFinite(entry[1])
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function actionChainField(value: unknown): Array<{ label: string; effect: string }> | null {
  if (!Array.isArray(value)) return null;
  const steps = value.flatMap((item): Array<{ label: string; effect: string }> => {
    if (!isRecord(item)) return [];
    const label = stringField(item, "label");
    const effect = stringField(item, "effect");
    return label && effect ? [{ label, effect }] : [];
  });
  return steps.length > 0 ? steps : null;
}

function stringifyOptionalBoolean(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "true" : "false";
}

function isSopDraftRef(ref: string): boolean {
  return ref.startsWith("sop/drafts/") || /^sop_[A-Za-z0-9_-]+$/.test(ref);
}

function refId(ref: string): string {
  return ref.split("#").at(-1)?.replace(/\.json$/, "").replace(/\.md$/, "").split("/").at(-1) ?? ref;
}

async function readOptionalStateRecord(store: AgentStore, ref: string): Promise<Record<string, unknown> | null> {
  try {
    const value = await store.readStateJson<unknown>(ref);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

async function listContentDailyPublishEvents(
  store: AgentStore,
  service: Record<string, unknown> | null,
  limit: number
): Promise<ContentPublishHistoryEvent[]> {
  const runRefs = stringArrayField(service, "last_publish_run_refs");
  const history = await listContentPublishHistory(store, {
    limit: Math.max(limit, runRefs.length || limit)
  });
  if (runRefs.length === 0) return history.events.slice(0, limit);

  const byRunRef = new Map(history.events.map((event) => [event.run_ref, event]));
  return runRefs
    .map((ref) => byRunRef.get(ref))
    .filter((event): event is ContentPublishHistoryEvent => Boolean(event))
    .slice(0, limit);
}

function truncateText(value: string, maxChars: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxChars ? `${compact.slice(0, maxChars).trimEnd()}...` : compact;
}

function sentMessageIds(sends: FeishuSendResult[]): string[] {
  return sends
    .map((send) => send.messageId)
    .filter((messageId): messageId is string => Boolean(messageId));
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function contextLookup(value: string): { contextRef?: string; sessionId?: string } {
  const ref = value.trim();
  if (ref.startsWith("memory/episodes/")) return { contextRef: ref };
  if (ref.endsWith("-context.json")) return { sessionId: ref.replace(/-context\.json$/, "") };
  if (ref.endsWith("-context.md")) return { sessionId: ref.replace(/-context\.md$/, "") };
  return { sessionId: ref };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 1200 ? `${message.slice(0, 1200).trimEnd()}...` : message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
