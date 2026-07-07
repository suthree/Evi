import { newId, utcNow } from "./ids.js";
import {
  runtimeChannelRouteKey,
  runtimeChannelSourceKey,
  type RuntimeChannelKind,
  type RuntimeChannelSource
} from "./runtime_channel_messages.js";
import { AgentStore } from "./store.js";

export type RuntimeChannelOutboundSourceKind = RuntimeChannelKind | "local" | "runtime";
export type RuntimeChannelOutboundPurpose = "ack" | "final" | "error" | "busy" | "operator" | "status";
export type RuntimeChannelOutboundStatus = "queued" | "sent" | "failed" | "skipped";

export interface RuntimeChannelOutboundRecord {
  type: "runtime_channel_outbound";
  id: string;
  source_kind: RuntimeChannelOutboundSourceKind;
  source_route_key: string | null;
  source_key: string | null;
  runtime_session_id: string | null;
  task_run_id: string | null;
  in_reply_to_message_id: string | null;
  purpose: RuntimeChannelOutboundPurpose;
  status: RuntimeChannelOutboundStatus;
  text: string;
  provider_delivery_ref: string | null;
  provider_message_ids: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
  boundary: string;
}

export interface RuntimeChannelOutboxListOptions {
  status?: RuntimeChannelOutboundStatus;
  sourceKind?: RuntimeChannelOutboundSourceKind;
  oldestFirst?: boolean;
  limit?: number;
}

const OUTBOX_REF = "channels/outbox.jsonl";
const OUTBOX_BOUNDARY = "provider-neutral local channel outbound ledger; adapters own real delivery and provider SDK details";

export async function recordRuntimeChannelOutbound(
  store: AgentStore,
  args: {
    id?: string;
    source?: RuntimeChannelSource | null;
    sourceKind?: RuntimeChannelOutboundSourceKind;
    sourceKey?: string | null;
    runtimeSessionId?: string | null;
    taskRunId?: string | null;
    inReplyToMessageId?: string | null;
    purpose: RuntimeChannelOutboundPurpose;
    status: RuntimeChannelOutboundStatus;
    text: string;
    providerDeliveryRef?: string | null;
    providerMessageIds?: string[];
    error?: string | null;
    createdAt?: string;
    now?: string;
  }
): Promise<RuntimeChannelOutboundRecord> {
  await store.ensureLayout();
  const now = args.now ?? utcNow();
  const source = args.source ?? null;
  const record: RuntimeChannelOutboundRecord = {
    type: "runtime_channel_outbound",
    id: args.id ?? newId("channel_outbound"),
    source_kind: source?.kind ?? args.sourceKind ?? "local",
    source_route_key: source ? runtimeChannelRouteKey(source) : null,
    source_key: args.sourceKey ?? (source ? runtimeChannelSourceKey(source) : null),
    runtime_session_id: args.runtimeSessionId ?? null,
    task_run_id: args.taskRunId ?? null,
    in_reply_to_message_id: args.inReplyToMessageId ?? null,
    purpose: args.purpose,
    status: args.status,
    text: args.text,
    provider_delivery_ref: args.providerDeliveryRef ?? null,
    provider_message_ids: args.providerMessageIds ?? [],
    error: args.error ?? null,
    created_at: args.createdAt ?? now,
    updated_at: now,
    boundary: OUTBOX_BOUNDARY
  };
  await store.appendJsonl(OUTBOX_REF, record);
  return record;
}

export async function recordRuntimeChannelOutboundDelivery(
  store: AgentStore,
  current: RuntimeChannelOutboundRecord,
  args: {
    status: Extract<RuntimeChannelOutboundStatus, "sent" | "failed" | "skipped">;
    providerDeliveryRef?: string | null;
    providerMessageIds?: string[];
    error?: string | null;
    now?: string;
  }
): Promise<RuntimeChannelOutboundRecord> {
  const record: RuntimeChannelOutboundRecord = {
    ...current,
    status: args.status,
    provider_delivery_ref: args.providerDeliveryRef ?? current.provider_delivery_ref,
    provider_message_ids: args.providerMessageIds ?? current.provider_message_ids,
    error: args.error ?? null,
    updated_at: args.now ?? utcNow()
  };
  await store.ensureLayout();
  await store.appendJsonl(OUTBOX_REF, record);
  return record;
}

export async function listRuntimeChannelOutbox(
  store: AgentStore,
  options: RuntimeChannelOutboxListOptions = {}
): Promise<RuntimeChannelOutboundRecord[]> {
  const byId = new Map<string, RuntimeChannelOutboundRecord>();
  for (const record of await readRuntimeChannelOutboxRows(store)) {
    const existing = byId.get(record.id);
    if (!existing || existing.updated_at.localeCompare(record.updated_at) <= 0) byId.set(record.id, record);
  }
  const sorted = Array.from(byId.values())
    .filter((record) => !options.status || record.status === options.status)
    .filter((record) => !options.sourceKind || record.source_kind === options.sourceKind)
    .sort((left, right) => options.oldestFirst
      ? left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
      : right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id));
  return options.limit ? sorted.slice(0, options.limit) : sorted;
}

async function readRuntimeChannelOutboxRows(store: AgentStore): Promise<RuntimeChannelOutboundRecord[]> {
  const text = await store.readStateText(OUTBOX_REF);
  if (!text.trim()) return [];
  const records: RuntimeChannelOutboundRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as RuntimeChannelOutboundRecord;
      if (value.type === "runtime_channel_outbound") records.push(value);
    } catch {
      // Keep the outbox read model available when a JSONL row is malformed.
    }
  }
  return records;
}
