import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import {
  listOperatorNotifications,
  markOperatorNotificationFailed,
  markOperatorNotificationSent,
  queueOperatorNotification
} from "../packages/runtime/src/operator_notifications.js";

test("operator notification outbox queues, lists, and updates status", async () => {
  const fixture = await createFixture();
  try {
    const queued = await queueOperatorNotification(fixture.store, {
      openId: "ou_allowed",
      text: "  进度更新：测试已通过。  ",
      source: "codex",
      refs: ["memory/episodes/session_1.json", ""]
    });

    assert.match(queued.ref, /^operator\/notifications\/outbox\/operator_notification_/);
    assert.equal(queued.notification.status, "queued");
    assert.equal(queued.notification.text, "进度更新：测试已通过。");
    assert.deepEqual(queued.notification.refs, ["memory/episodes/session_1.json"]);
    assert.match(queued.notification.boundary, /resident channel service/);

    const queuedList = await listOperatorNotifications(fixture.store, { status: "queued" });
    assert.equal(queuedList.count, 1);
    assert.equal(queuedList.notifications[0]?.notification.id, queued.notification.id);

    const sent = await markOperatorNotificationSent(fixture.store, queued, [{
      ok: true,
      messageId: "om_sent",
      summary: "Sent Feishu text message om_sent."
    }]);
    assert.equal(sent.notification.status, "sent");
    assert.equal(sent.notification.attempts, 1);
    assert.equal(sent.notification.sends?.[0]?.messageId, "om_sent");

    const sentList = await listOperatorNotifications(fixture.store, { status: "sent" });
    assert.equal(sentList.count, 1);
    assert.equal(sentList.notifications[0]?.notification.id, queued.notification.id);
  } finally {
    await fixture.cleanup();
  }
});

test("operator notification outbox records failed sends", async () => {
  const fixture = await createFixture();
  try {
    const queued = await queueOperatorNotification(fixture.store, {
      openId: "ou_allowed",
      text: "需要人工关注。"
    });

    const failed = await markOperatorNotificationFailed(fixture.store, queued, "network unavailable");
    assert.equal(failed.notification.status, "failed");
    assert.equal(failed.notification.error, "network unavailable");
    assert.equal(failed.notification.attempts, 1);

    const failedList = await listOperatorNotifications(fixture.store, { status: "failed" });
    assert.equal(failedList.count, 1);
    assert.equal(failedList.notifications[0]?.notification.id, queued.notification.id);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "operator-notifications-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  return {
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
