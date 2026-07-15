import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listRuntimeChannelOutbox,
  recordRuntimeChannelOutbound,
  recordRuntimeChannelOutboundDelivery
} from "../packages/core/src/runtime_channel_outbox.js";
import { AgentStore } from "../packages/core/src/store.js";

test("runtime channel outbox records provider-neutral outbound messages", async () => {
  const fixture = await createFixture();
  try {
    const first = await recordRuntimeChannelOutbound(fixture.store, {
      source: {
        kind: "feishu",
        channelId: "default",
        conversationType: "group",
        conversationId: "oc_group",
        threadId: "main",
        profile: "ops"
      },
      runtimeSessionId: "runtime_session_1",
      taskRunId: "runtime_task_1",
      inReplyToMessageId: "om_1",
      purpose: "final",
      status: "queued",
      text: "done",
      now: "2026-07-07T00:00:00.000Z"
    });
    const second = await recordRuntimeChannelOutbound(fixture.store, {
      sourceKind: "local",
      purpose: "status",
      status: "queued",
      text: "local status",
      now: "2026-07-07T00:00:00.500Z"
    });
    await recordRuntimeChannelOutboundDelivery(fixture.store, first, {
      status: "sent",
      providerDeliveryRef: "channels/feishu/outbound/om_1.json",
      providerMessageIds: ["om_out_1"],
      now: "2026-07-07T00:00:01.000Z"
    });
    await writeFile(join(fixture.stateRoot, "channels/outbox.jsonl"), "not-json\n", { flag: "a" });

    const raw = await readJsonl(join(fixture.stateRoot, "channels/outbox.jsonl"));
    assert.deepEqual(raw.map((entry) => entry.status), ["queued", "queued", "sent"]);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.length, 2);
    assert.equal(outbox[0]?.id, first.id);
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.source_kind, "feishu");
    assert.equal(outbox[0]?.source_route_key, "feishu:default:group:oc_group:main");
    assert.equal(outbox[0]?.source_key, "feishu:default:group:oc_group:main:ops");
    assert.deepEqual(outbox[0]?.provider_message_ids, ["om_out_1"]);
    const queued = await listRuntimeChannelOutbox(fixture.store, { status: "queued" });
    assert.deepEqual(queued.map((entry) => entry.id), [second.id]);
    const sentFeishu = await listRuntimeChannelOutbox(fixture.store, { status: "sent", sourceKind: "feishu" });
    assert.deepEqual(sentFeishu.map((entry) => entry.id), [first.id]);
  } finally {
    await fixture.cleanup();
  }
});

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, any>);
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-channel-outbox-${process.pid}-${Date.now()}-${Math.random()}`);
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
