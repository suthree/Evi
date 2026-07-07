import {
  listRuntimeChannelOutbox,
  recordRuntimeChannelOutboundDelivery,
  type RuntimeChannelOutboundRecord
} from "../../core/src/runtime_channel_outbox.js";
import {
  runtimeChannelSourceFromRouteKey,
  type RuntimeChannelKind,
  type RuntimeChannelSource
} from "../../core/src/runtime_channel_messages.js";
import type { AgentStore } from "../../core/src/store.js";

export interface RuntimeChannelOutboxDrainResult {
  queued_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  outbox_ids: string[];
}

export async function drainRuntimeChannelOutboxForAdapter(
  store: AgentStore,
  args: {
    sourceKind: RuntimeChannelKind;
    channelId: string;
    limit?: number;
    deliver: (
      entry: RuntimeChannelOutboundRecord,
      source: RuntimeChannelSource
    ) => Promise<RuntimeChannelOutboundRecord>;
  }
): Promise<RuntimeChannelOutboxDrainResult> {
  const queued = await listRuntimeChannelOutbox(store, {
    status: "queued",
    sourceKind: args.sourceKind,
    oldestFirst: true,
    limit: args.limit ?? 10
  });
  const result = { queued_count: queued.length, sent_count: 0, failed_count: 0, skipped_count: 0, outbox_ids: [] as string[] };
  for (const entry of queued) {
    const source = sourceForRuntimeChannelOutbox(entry, args.sourceKind, args.channelId);
    if (!source) {
      await recordRuntimeChannelOutboundDelivery(store, entry, {
        status: "skipped",
        error: `outbox source is not deliverable by ${args.sourceKind}:${args.channelId}`
      });
      result.skipped_count += 1;
      result.outbox_ids.push(entry.id);
      continue;
    }
    const delivered = await args.deliver(entry, source);
    if (delivered.status === "sent") result.sent_count += 1;
    if (delivered.status === "failed") result.failed_count += 1;
    result.outbox_ids.push(entry.id);
  }
  return result;
}

export function sourceForRuntimeChannelOutbox(
  entry: RuntimeChannelOutboundRecord,
  sourceKind: RuntimeChannelKind,
  channelId: string
): RuntimeChannelSource | null {
  const source = entry.source_route_key ? runtimeChannelSourceFromRouteKey(entry.source_route_key) : null;
  if (!source || source.kind !== sourceKind) return null;
  if (source.channelId !== channelId) return null;
  return source;
}
