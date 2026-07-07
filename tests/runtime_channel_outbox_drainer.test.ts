import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listRuntimeChannelOutbox,
  recordRuntimeChannelOutbound,
  recordRuntimeChannelOutboundDelivery
} from "../packages/core/src/runtime_channel_outbox.js";
import { AgentStore } from "../packages/core/src/store.js";
import { drainRuntimeChannelOutboxForAdapter } from "../packages/runtime/src/runtime_channel_outbox_drainer.js";

test("runtime channel outbox drainer routes only matching provider channel rows", async () => {
  const fixture = await createFixture();
  try {
    const matching = await recordRuntimeChannelOutbound(fixture.store, {
      source: {
        kind: "telegram",
        channelId: "telegram-main",
        conversationType: "supergroup",
        conversationId: "-100123",
        threadId: null,
        profile: "ops"
      },
      purpose: "final",
      status: "queued",
      text: "matching",
      now: "2026-07-07T00:00:00.000Z"
    });
    const wrongChannel = await recordRuntimeChannelOutbound(fixture.store, {
      source: {
        kind: "telegram",
        channelId: "telegram-other",
        conversationType: "supergroup",
        conversationId: "-100999",
        threadId: null,
        profile: "ops"
      },
      purpose: "final",
      status: "queued",
      text: "wrong channel",
      now: "2026-07-07T00:00:01.000Z"
    });
    const wrongProvider = await recordRuntimeChannelOutbound(fixture.store, {
      source: {
        kind: "discord",
        channelId: "discord-main",
        conversationType: "guild_text",
        conversationId: "channel-1",
        threadId: null,
        profile: "ops"
      },
      purpose: "final",
      status: "queued",
      text: "wrong provider",
      now: "2026-07-07T00:00:02.000Z"
    });

    const deliveredIds: string[] = [];
    const result = await drainRuntimeChannelOutboxForAdapter(fixture.store, {
      sourceKind: "telegram",
      channelId: "telegram-main",
      deliver: async (entry) => {
        deliveredIds.push(entry.id);
        return recordRuntimeChannelOutboundDelivery(fixture.store, entry, {
          status: "sent",
          providerDeliveryRef: `channels/telegram/outbox/${entry.id}.json`,
          providerMessageIds: ["sent_1"]
        });
      }
    });

    assert.equal(result.queued_count, 2);
    assert.equal(result.sent_count, 1);
    assert.equal(result.skipped_count, 1);
    assert.deepEqual(result.outbox_ids, [matching.id, wrongChannel.id]);
    assert.deepEqual(deliveredIds, [matching.id]);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.find((entry) => entry.id === matching.id)?.status, "sent");
    const skipped = outbox.find((entry) => entry.id === wrongChannel.id);
    assert.equal(skipped?.status, "skipped");
    assert.match(skipped?.error ?? "", /not deliverable/);
    assert.deepEqual((await listRuntimeChannelOutbox(fixture.store, { status: "queued" })).map((entry) => entry.id), [wrongProvider.id]);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `xingzhe-runtime-channel-outbox-drainer-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    store: new AgentStore(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
