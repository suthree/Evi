import { newId, utcNow } from "../../core/src/ids.js";
import { AgentStore } from "../../core/src/store.js";

const OPERATOR_NOTIFICATION_OUTBOX_DIR = "operator/notifications/outbox";

export type OperatorNotificationChannel = "feishu";
export type OperatorNotificationStatus = "queued" | "sent" | "failed";

export interface OperatorNotificationSendResult {
  ok: boolean;
  messageId: string | null;
  summary: string;
  raw?: unknown;
}

export interface OperatorNotificationRecord {
  id: string;
  channel: OperatorNotificationChannel;
  status: OperatorNotificationStatus;
  target: {
    open_id: string;
  };
  text: string;
  source: string;
  refs: string[];
  attempts: number;
  created_at: string;
  updated_at: string;
  sent_at?: string;
  failed_at?: string;
  error?: string;
  sends?: OperatorNotificationSendResult[];
  boundary: string;
}

export interface OperatorNotificationEntry {
  ref: string;
  notification: OperatorNotificationRecord;
}

export async function queueOperatorNotification(
  store: AgentStore,
  args: {
    channel?: OperatorNotificationChannel;
    openId: string;
    text: string;
    source?: string;
    refs?: string[];
  }
): Promise<OperatorNotificationEntry> {
  const text = args.text.trim();
  if (!text) throw new Error("operator notification text is required");
  const openId = args.openId.trim();
  if (!openId) throw new Error("operator notification open_id is required");
  const now = utcNow();
  const notification: OperatorNotificationRecord = {
    id: newId("operator_notification"),
    channel: args.channel ?? "feishu",
    status: "queued",
    target: {
      open_id: openId
    },
    text,
    source: args.source?.trim() || "cli",
    refs: args.refs?.filter((ref) => ref.trim()).map((ref) => ref.trim()) ?? [],
    attempts: 0,
    created_at: now,
    updated_at: now,
    boundary: "state-only operator notification request; only the resident channel service may perform external sends"
  };
  const ref = await writeOperatorNotification(store, notification);
  return { ref, notification };
}

export async function listOperatorNotifications(
  store: AgentStore,
  args: {
    channel?: OperatorNotificationChannel;
    status?: OperatorNotificationStatus;
    limit?: number;
    oldestFirst?: boolean;
  } = {}
): Promise<{ count: number; notifications: OperatorNotificationEntry[] }> {
  const refs = await store.listStateFiles(OPERATOR_NOTIFICATION_OUTBOX_DIR);
  const notifications: OperatorNotificationEntry[] = [];
  for (const ref of refs.filter((item) => item.endsWith(".json"))) {
    const notification = await store.readStateJson<OperatorNotificationRecord>(ref);
    if (!notification) continue;
    if (args.channel && notification.channel !== args.channel) continue;
    if (args.status && notification.status !== args.status) continue;
    notifications.push({ ref, notification });
  }
  notifications.sort((left, right) => {
    const order = left.notification.created_at.localeCompare(right.notification.created_at)
      || left.notification.id.localeCompare(right.notification.id);
    return args.oldestFirst ? order : -order;
  });
  return {
    count: notifications.length,
    notifications: notifications.slice(0, args.limit ?? 20)
  };
}

export async function markOperatorNotificationSent(
  store: AgentStore,
  entry: OperatorNotificationEntry,
  sends: OperatorNotificationSendResult[]
): Promise<OperatorNotificationEntry> {
  const now = utcNow();
  const notification: OperatorNotificationRecord = {
    ...entry.notification,
    status: "sent",
    attempts: entry.notification.attempts + 1,
    sends,
    error: undefined,
    sent_at: now,
    updated_at: now
  };
  await store.writeJson(entry.ref, notification);
  return { ref: entry.ref, notification };
}

export async function markOperatorNotificationFailed(
  store: AgentStore,
  entry: OperatorNotificationEntry,
  error: string,
  sends?: OperatorNotificationSendResult[]
): Promise<OperatorNotificationEntry> {
  const now = utcNow();
  const notification: OperatorNotificationRecord = {
    ...entry.notification,
    status: "failed",
    attempts: entry.notification.attempts + 1,
    sends,
    error,
    failed_at: now,
    updated_at: now
  };
  await store.writeJson(entry.ref, notification);
  return { ref: entry.ref, notification };
}

function writeOperatorNotification(
  store: AgentStore,
  notification: OperatorNotificationRecord
): Promise<string> {
  return store.writeJson(`${OPERATOR_NOTIFICATION_OUTBOX_DIR}/${notification.id}.json`, notification);
}
