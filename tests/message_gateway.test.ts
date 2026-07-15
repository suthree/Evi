import assert from "node:assert/strict";
import test from "node:test";
import {
  RuntimeMessageGateway,
  type RuntimeChannelAdapter,
  type RuntimeChannelHealth,
  type RuntimeChannelKind
} from "../packages/runtime/src/message_gateway.js";

test("runtime message gateway starts adapters and stops them in reverse order", async () => {
  const events: string[] = [];
  const first = fakeAdapter("feishu", "feishu-main", events);
  const second = fakeAdapter("web", "127.0.0.1:8765", events);
  const gateway = new RuntimeMessageGateway([first, second]);

  await gateway.start();
  assert.deepEqual(events, ["start:feishu-main", "start:127.0.0.1:8765"]);
  assert.equal(gateway.health().state, "running");
  assert.deepEqual(gateway.health().channels.map((channel) => channel.kind), ["feishu", "web"]);

  await gateway.stop();
  assert.deepEqual(events, [
    "start:feishu-main",
    "start:127.0.0.1:8765",
    "stop:127.0.0.1:8765",
    "stop:feishu-main"
  ]);
  assert.equal(gateway.health().state, "stopped");
});

test("runtime message gateway rolls back started adapters when a later adapter fails", async () => {
  const events: string[] = [];
  const first = fakeAdapter("feishu", "feishu-main", events);
  const second = fakeAdapter("telegram", "telegram-main", events, true);
  const gateway = new RuntimeMessageGateway([first, second]);

  await assert.rejects(gateway.start(), /telegram-main failed/);
  assert.deepEqual(events, ["start:feishu-main", "start:telegram-main", "stop:feishu-main"]);
  assert.equal(gateway.health().state, "error");
  assert.deepEqual(gateway.health().channels.map((channel) => `${channel.kind}:${channel.state}`), [
    "feishu:stopped",
    "telegram:error"
  ]);
  assert.match(gateway.health().channels[1]?.detail ?? "", /telegram-main failed/);
});

function fakeAdapter(
  kind: RuntimeChannelKind,
  channelId: string,
  events: string[],
  failStart = false
): RuntimeChannelAdapter {
  let running = false;
  return {
    kind,
    channelId,
    start: async () => {
      events.push(`start:${channelId}`);
      if (failStart) throw new Error(`${channelId} failed`);
      running = true;
    },
    stop: async () => {
      events.push(`stop:${channelId}`);
      running = false;
    },
    health: (): RuntimeChannelHealth => ({
      kind,
      channel_id: channelId,
      state: running ? "running" : "stopped"
    })
  };
}
