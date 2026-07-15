import {
  appendRuntimeInboxEntry,
  bindRuntimeSessionSource,
  resolveRuntimeSession,
  type InboxTriggerKind,
  type RuntimeInboxEntry,
  type RuntimeSessionBindingRecord,
  type RuntimeSessionRecord,
  type RuntimeSessionResolution,
  type RuntimeSessionSource
} from "../../core/src/runtime_sessions.js";
import type { RuntimeInboundMessage } from "../../core/src/runtime_channel_messages.js";
import type { AgentStore } from "../../core/src/store.js";
import { utcNow } from "../../core/src/ids.js";

export interface RuntimeChannelTriggerOptions {
  isMention?: (text: string) => boolean;
  stripMention?: (text: string) => string;
}

export interface RuntimeChannelTrigger {
  kind: Exclude<InboxTriggerKind, "session_command">;
  runRequested: boolean;
  taskText: string;
}

export type RuntimeChannelDispatchResult =
  | {
    kind: "denied";
    reason: RuntimeSessionResolution["reason"] | "unauthorized_session_command";
    message: RuntimeInboundMessage;
  }
  | {
    kind: "session_bound";
    message: RuntimeInboundMessage;
    session: RuntimeSessionRecord;
    source: RuntimeSessionSource;
    binding: RuntimeSessionBindingRecord;
    inbox: RuntimeInboxEntry;
  }
  | {
    kind: "session_pending";
    message: RuntimeInboundMessage;
    session: RuntimeSessionRecord;
    source: RuntimeSessionSource;
    inbox: RuntimeInboxEntry;
    trigger: RuntimeChannelTrigger;
    notify: boolean;
  }
  | {
    kind: "session_inbox";
    message: RuntimeInboundMessage;
    session: RuntimeSessionRecord;
    source: RuntimeSessionSource;
    inbox: RuntimeInboxEntry;
    trigger: RuntimeChannelTrigger;
  }
  | {
    kind: "run_requested";
    message: RuntimeInboundMessage;
    session: RuntimeSessionRecord;
    source: RuntimeSessionSource;
    inbox: RuntimeInboxEntry;
    trigger: RuntimeChannelTrigger;
    taskText: string;
  };

export async function dispatchRuntimeChannelMessage(
  store: AgentStore,
  args: {
    message: RuntimeInboundMessage;
    actorAuthorized: boolean;
    triggerOptions?: RuntimeChannelTriggerOptions;
    now?: string;
  }
): Promise<RuntimeChannelDispatchResult> {
  const now = args.now ?? utcNow();
  const sessionCommand = parseRuntimeSessionUseCommand(args.message.text);
  if (sessionCommand && !args.actorAuthorized) {
    return { kind: "denied", reason: "unauthorized_session_command", message: args.message };
  }

  const baseSource = args.message.source;
  const resolution = await resolveRuntimeSession(store, {
    source: baseSource,
    actorAuthorized: args.actorAuthorized,
    now
  });
  if (!resolution.ok || !resolution.session) {
    return { kind: "denied", reason: resolution.reason, message: args.message };
  }

  let session = resolution.session;
  let source = { ...baseSource, profile: session.profile };
  if (sessionCommand) {
    const binding = await bindRuntimeSessionSource(store, {
      source: { ...baseSource, profile: sessionCommand.profile },
      runtimeSessionId: session.id,
      profile: sessionCommand.profile,
      createdByActorId: baseSource.actorId ?? null,
      now
    });
    session = {
      ...session,
      profile: binding.profile,
      status: "active",
      source_route_key: binding.route_key,
      source_key: binding.source_key,
      updated_at: binding.updated_at
    };
    source = { ...baseSource, profile: binding.profile };
    const inbox = await appendRuntimeInboxEntry(store, {
      sessionId: session.id,
      source,
      messageId: args.message.messageId,
      text: args.message.text,
      triggerKind: "session_command",
      runRequested: false,
      now
    });
    return { kind: "session_bound", message: args.message, session, source, binding, inbox };
  }

  const trigger = classifyRuntimeChannelTrigger(args.message.text, args.triggerOptions);
  const inbox = await appendRuntimeInboxEntry(store, {
    sessionId: session.id,
    source,
    messageId: args.message.messageId,
    text: args.message.text,
    triggerKind: trigger.kind,
    runRequested: trigger.runRequested,
    now
  });

  if (session.status !== "active" || session.profile === "unassigned") {
    return {
      kind: "session_pending",
      message: args.message,
      session,
      source,
      inbox,
      trigger,
      notify: trigger.runRequested || resolution.reason === "created_pending"
    };
  }

  if (!trigger.runRequested) {
    return { kind: "session_inbox", message: args.message, session, source, inbox, trigger };
  }

  return {
    kind: "run_requested",
    message: args.message,
    session,
    source,
    inbox,
    trigger,
    taskText: trigger.taskText
  };
}

export function parseRuntimeSessionUseCommand(text: string): { profile: string } | null {
  const compact = text.trim().replace(/\s+/g, " ");
  const normalized = compact.toLowerCase();
  for (const prefix of ["/session use ", "session use ", "/session bind ", "session bind "]) {
    if (!normalized.startsWith(prefix)) continue;
    const profile = compact.slice(prefix.length).trim();
    if (!profile) return null;
    return { profile };
  }
  return null;
}

export function classifyRuntimeChannelTrigger(
  text: string,
  options: RuntimeChannelTriggerOptions = {}
): RuntimeChannelTrigger {
  const compact = text.trim();
  const normalized = compact.toLowerCase();
  if (normalized === "/run" || normalized.startsWith("/run ")) {
    const taskText = compact.slice("/run".length).trim();
    return {
      kind: "run_command",
      runRequested: true,
      taskText: taskText || compact
    };
  }
  if (options.isMention?.(compact)) {
    return {
      kind: "mention",
      runRequested: true,
      taskText: options.stripMention?.(compact) || compact
    };
  }
  return {
    kind: "inbox_only",
    runRequested: false,
    taskText: compact
  };
}
