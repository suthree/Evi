export type RuntimeChannelKind = "feishu" | "web" | "telegram" | "discord";

export interface RuntimeChannelSource {
  kind: RuntimeChannelKind;
  channelId: string;
  conversationType: string;
  conversationId: string;
  threadId?: string | null;
  profile?: string | null;
  actorId?: string | null;
  perActor?: boolean;
}

export interface RuntimeInboundMessage {
  source: RuntimeChannelSource;
  messageId: string;
  text: string;
  createdAt?: string | null;
}

export function runtimeChannelRouteKey(source: RuntimeChannelSource): string {
  return [
    source.kind,
    cleanPart(source.channelId),
    cleanPart(source.conversationType),
    cleanPart(source.conversationId),
    cleanPart(source.threadId || "main")
  ].join(":");
}

export function runtimeChannelSourceKey(
  source: RuntimeChannelSource,
  profile = source.profile || "unassigned"
): string {
  const parts = [runtimeChannelRouteKey(source), cleanPart(profile)];
  if (source.perActor && source.actorId) parts.push("user", cleanPart(source.actorId));
  return parts.join(":");
}

export function runtimeChannelSourceFromRouteKey(
  routeKey: string,
  profile?: string | null
): RuntimeChannelSource | null {
  const [kind, channelId, conversationType, conversationId, threadId] = routeKey.split(":");
  if (!isRuntimeChannelKind(kind) || !channelId || !conversationType || !conversationId) return null;
  return {
    kind,
    channelId,
    conversationType,
    conversationId,
    threadId: threadId && threadId !== "main" ? threadId : null,
    profile
  };
}

export function isRuntimeChannelKind(value: string | undefined): value is RuntimeChannelKind {
  return value === "feishu" || value === "web" || value === "telegram" || value === "discord";
}

function cleanPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.@-]+/g, "_") || "unknown";
}
