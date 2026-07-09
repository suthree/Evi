import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { ContextBundleManifest } from "../packages/core/src/context.js";
import { runHarnessReplayAudit } from "../packages/core/src/harness_replay.js";
import { decideOpportunity } from "../packages/core/src/opportunity_backlog.js";
import type { RunResult } from "../packages/core/src/schemas.js";
import { listRuntimeTaskQueue } from "../packages/core/src/runtime_task_queue.js";
import {
  listRuntimeChannelOutbox,
  recordRuntimeChannelOutbound
} from "../packages/core/src/runtime_channel_outbox.js";
import { listRuntimeInbox, listRuntimeSessions, listRuntimeTaskRuns } from "../packages/core/src/runtime_sessions.js";
import { AgentStore } from "../packages/core/src/store.js";
import { FeishuPrivateChatAdapter, normalizePrivateTextMessage, parseFeishuTextContent, splitText } from "../packages/runtime/src/channels/feishu/adapter.js";
import { loadFeishuChannelConfig, loadFeishuScenarioConfig } from "../packages/runtime/src/channels/feishu/config.js";
import type {
  TaskRunner,
  FeishuChannelConfig,
  FeishuInboundEvent,
  FeishuSendResult,
  FeishuTransport
} from "../packages/runtime/src/channels/feishu/types.js";
import { queueOperatorNotification } from "../packages/runtime/src/operator_notifications.js";
import {
  recordContentFeedbackEvidence,
  recordContentImageEvidence,
  recordContentPublishEvidence,
  runDailyContentJob
} from "../packages/runtime/src/content_pipeline.js";

const TEST_FEISHU_APP_ID_ENV = "AGENT_TEST_FEISHU_APP_ID";
const TEST_FEISHU_APP_SECRET_ENV = "AGENT_TEST_FEISHU_APP_SECRET";

test("normalizes private Feishu text messages and rejects group messages", () => {
  assert.equal(parseFeishuTextContent(JSON.stringify({ text: "hello" })), "hello");
  assert.equal(parseFeishuTextContent("plain"), "plain");

  const privateMessage = normalizePrivateTextMessage(feishuEvent({
    messageId: "om_1",
    chatType: "p2p",
    openId: "ou_user",
    text: "hello private"
  }));
  assert.equal(privateMessage?.text, "hello private");
  assert.equal(privateMessage?.openId, "ou_user");

  const groupMessage = normalizePrivateTextMessage(feishuEvent({
    messageId: "om_2",
    chatType: "group",
    openId: "ou_user",
    text: "hello group"
  }));
  assert.equal(groupMessage, null);
});

test("Feishu text chunks prefer line boundaries", () => {
  const command = "creator_metrics_next_due_command: pnpm run runtime -- content creator-metrics-capture";
  const chunks = splitText([
    "Service health",
    "overall: paused",
    command,
    "Boundary: read-only"
  ].join("\n"), 95);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.some((chunk) => chunk.includes(command)), true);
  assert.equal(chunks.every((chunk) => chunk.length <= 95), true);
});

test("private text message runs the agent and sends final response", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "Final answer.");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_run",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "请处理这个任务"
    }));

    assert.equal(runner.tasks.length, 1);
    assert.match(runner.tasks[0], /请处理这个任务/);
    assert.deepEqual(transport.sent.map((item) => item.text), [
      "收到，正在处理。",
      "Final answer."
    ]);

    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "inbound"), true);
    assert.equal(channelEvents.some((event) => event.kind === "outbound"), true);

    const memoryEvents = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    assert.equal(memoryEvents.some((event) => String(event.summary).includes("Handled Feishu private message om_run")), true);
  } finally {
    await fixture.cleanup();
  }
});

test("operator notification drain sends queued Feishu notifications", async () => {
  const fixture = await createFixture();
  try {
    const queued = await queueOperatorNotification(fixture.store, {
      openId: "ou_allowed",
      text: "进度更新：runtime 检查通过。",
      source: "codex",
      refs: ["memory/episodes/session_notify.json"]
    });
    const runner = new StubRunner(fixture.store, "unused");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig({ allowedOpenIds: ["ou_allowed"] }),
      transport,
      runner,
      store: fixture.store
    });

    const result = await adapter.drainOperatorNotifications();

    assert.equal(result.queued_count, 1);
    assert.equal(result.sent_count, 1);
    assert.equal(result.failed_count, 0);
    assert.deepEqual(transport.sent.map((item) => item.text), ["进度更新：runtime 检查通过。"]);
    assert.equal(transport.sent[0]?.openId, "ou_allowed");

    const stored = JSON.parse(await readFile(join(fixture.stateRoot, queued.ref), "utf8")) as Record<string, unknown>;
    assert.equal(stored.status, "sent");
    assert.equal(stored.source, "codex");
    assert.equal(stored.attempts, 1);

    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "operator_notification_sent"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("operator notification drain fails unauthorized Feishu targets without sending", async () => {
  const fixture = await createFixture();
  try {
    const queued = await queueOperatorNotification(fixture.store, {
      openId: "ou_denied",
      text: "这条不应发送。"
    });
    const runner = new StubRunner(fixture.store, "unused");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig({ allowedOpenIds: ["ou_allowed"] }),
      transport,
      runner,
      store: fixture.store
    });

    const result = await adapter.drainOperatorNotifications();

    assert.equal(result.failed_count, 1);
    assert.equal(transport.sent.length, 0);
    const stored = JSON.parse(await readFile(join(fixture.stateRoot, queued.ref), "utf8")) as Record<string, unknown>;
    assert.equal(stored.status, "failed");
    assert.match(String(stored.error), /unauthorized open_id ou_denied/);

    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "operator_notification_denied"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("private text message includes bounded local conversation history", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("channels/feishu/inbound/om_prior.json", {
      message_id: "om_prior",
      chat_id: "chat_ou_allowed",
      open_id: "ou_allowed",
      text: "之前我问过部署状态",
      created_at: "2026-06-29T00:00:01.000Z"
    });
    await fixture.store.writeJson("channels/feishu/outbound/om_prior.json", {
      source_message_id: "om_prior",
      chat_id: "chat_ou_allowed",
      open_id: "ou_allowed",
      text: "之前的回答是服务正在运行",
      created_at: "2026-06-29T00:00:02.000Z"
    });
    await fixture.store.writeJson("channels/feishu/outbound/om_wrong_chat.json", {
      source_message_id: "om_wrong_chat",
      chat_id: "chat_other_context",
      open_id: "ou_allowed",
      text: "不应该混入其他聊天回复",
      created_at: "2026-06-29T00:00:02.500Z"
    });
    await fixture.store.writeJson("channels/feishu/outbound/om_unscoped.json", {
      source_message_id: "om_unscoped",
      open_id: "ou_allowed",
      text: "无 chat_id 回复不应该进入上下文",
      created_at: "2026-06-29T00:00:02.750Z"
    });
    await fixture.store.writeJson("channels/feishu/inbound/om_other.json", {
      message_id: "om_other",
      chat_id: "chat_ou_other",
      open_id: "ou_other",
      text: "不应该出现在当前上下文",
      created_at: "2026-06-29T00:00:03.000Z"
    });
    const runner = new StubRunner(fixture.store, "Final answer.");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_followup",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "现在呢？"
    }));

    assert.equal(runner.tasks.length, 1);
    assert.match(runner.tasks[0], /Recent conversation context/);
    assert.match(runner.tasks[0], /之前我问过部署状态/);
    assert.match(runner.tasks[0], /之前的回答是服务正在运行/);
    assert.doesNotMatch(runner.tasks[0], /不应该混入其他聊天回复/);
    assert.doesNotMatch(runner.tasks[0], /无 chat_id 回复不应该进入上下文/);
    assert.doesNotMatch(runner.tasks[0], /不应该出现在当前上下文/);
    assert.match(runner.tasks[0], /User message:\n现在呢？/);

    const outbound = JSON.parse(
      await readFile(join(fixture.stateRoot, "channels/feishu/outbound/om_followup.json"), "utf8")
    ) as Record<string, unknown>;
    assert.equal(outbound.chat_id, "chat_ou_allowed");
  } finally {
    await fixture.cleanup();
  }
});

test("private text messages queue same-sender follow-ups while a run is active", async () => {
  const fixture = await createFixture();
  try {
    const runner = new BlockingRunner(fixture.store);
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig({ queuedText: "queued" }),
      transport,
      runner,
      store: fixture.store
    });

    const firstRun = adapter.handleInboundEvent(feishuEvent({
      messageId: "om_queue_first",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "先处理第一件事"
    }));
    await waitUntil(() => runner.tasks.length === 1);

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_queue_second",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "然后处理第二件事"
    }));

    assert.equal(runner.tasks.length, 1);
    assert.deepEqual(transport.sent.map((item) => item.text), [
      "收到，正在处理。",
      "queued"
    ]);

    runner.resolveNext("First answer.");
    await waitUntil(() => runner.tasks.length === 2);
    assert.match(runner.tasks[1], /然后处理第二件事/);
    assert.match(runner.tasks[1], /Recent conversation context/);
    assert.match(runner.tasks[1], /先处理第一件事/);
    assert.match(runner.tasks[1], /First answer\./);

    runner.resolveNext("Second answer.");
    await firstRun;

    assert.deepEqual(transport.sent.map((item) => item.text), [
      "收到，正在处理。",
      "queued",
      "First answer.",
      "收到，正在处理。",
      "Second answer."
    ]);

    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "queued_followup"), true);
    assert.equal(channelEvents.some((event) => event.kind === "dequeued_followup"), true);
    assert.equal(channelEvents.some((event) => event.kind === "busy"), false);
    assert.equal(existsSync(join(fixture.stateRoot, "channels/feishu/queued/om_queue_second.json")), true);
  } finally {
    await fixture.cleanup();
  }
});

test("private text messages keep busy response when same-sender follow-up queue is full", async () => {
  const fixture = await createFixture();
  try {
    const runner = new BlockingRunner(fixture.store);
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig({ busyText: "busy", queuedText: "queued", followupQueueSize: 1 }),
      transport,
      runner,
      store: fixture.store
    });

    const firstRun = adapter.handleInboundEvent(feishuEvent({
      messageId: "om_queue_full_first",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "第一件事"
    }));
    await waitUntil(() => runner.tasks.length === 1);

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_queue_full_second",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "第二件事"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_queue_full_third",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "第三件事"
    }));

    assert.equal(runner.tasks.length, 1);
    assert.deepEqual(transport.sent.map((item) => item.text), [
      "收到，正在处理。",
      "queued",
      "busy"
    ]);

    runner.resolveNext("First answer.");
    await waitUntil(() => runner.tasks.length === 2);
    runner.resolveNext("Second answer.");
    await firstRun;

    assert.equal(runner.tasks.length, 2);
    assert.match(runner.tasks[1], /第二件事/);
    assert.doesNotMatch(runner.tasks.join("\n"), /第三件事/);
    assert.equal(existsSync(join(fixture.stateRoot, "channels/feishu/queued/om_queue_full_second.json")), true);
    assert.equal(existsSync(join(fixture.stateRoot, "channels/feishu/queued/om_queue_full_third.json")), false);

    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.filter((event) => event.kind === "queued_followup").length, 1);
    assert.equal(channelEvents.filter((event) => event.kind === "busy").length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("duplicate Feishu message id does not run twice", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });
    const event = feishuEvent({
      messageId: "om_duplicate",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "same"
    });

    await adapter.handleInboundEvent(event);
    await adapter.handleInboundEvent(event);

    assert.equal(runner.tasks.length, 1);
    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((item) => item.kind === "duplicate"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("allowlist blocks unauthorized private users without replying", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig({ allowedOpenIds: ["ou_allowed"] }),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_denied",
      chatType: "p2p",
      openId: "ou_other",
      text: "blocked"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("authorized Feishu group bootstrap creates a pending runtime session", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig({ allowedOpenIds: ["ou_operator"] }),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_group_pending",
      chatType: "group",
      chatId: "oc_group_session",
      openId: "ou_operator",
      text: "先记录这个群"
    }));

    const sessions = await listRuntimeSessions(fixture.store);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.status, "pending");
    assert.equal(sessions[0]?.profile, "unassigned");
    const inbox = await listRuntimeInbox(fixture.store, sessions[0]!.id);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.run_requested, false);
    assert.equal(runner.tasks.length, 0);
    assert.match(transport.chatSent[0]?.text ?? "", /pending runtime session/);
  } finally {
    await fixture.cleanup();
  }
});

test("bound Feishu group member messages go to runtime session inbox without running", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig({ allowedOpenIds: ["ou_operator"] }),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_group_bind",
      chatType: "group",
      chatId: "oc_group_session",
      openId: "ou_operator",
      text: "/session use content-role"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_group_inbox",
      chatType: "group",
      chatId: "oc_group_session",
      openId: "ou_member",
      text: "这是普通群消息"
    }));

    const sessions = await listRuntimeSessions(fixture.store);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.status, "active");
    assert.equal(sessions[0]?.profile, "content-role");
    const inbox = await listRuntimeInbox(fixture.store, sessions[0]!.id);
    assert.deepEqual(inbox.map((entry) => entry.message_id), ["om_group_bind", "om_group_inbox"]);
    assert.equal(inbox[1]?.trigger_kind, "inbox_only");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.chatSent.length, 1);
    assert.match(transport.chatSent[0]?.text ?? "", /已绑定 runtime session/);
  } finally {
    await fixture.cleanup();
  }
});

test("bound Feishu group run command executes and records a runtime task run", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "Group final answer.");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig({ allowedOpenIds: ["ou_operator"] }),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_group_run_bind",
      chatType: "group",
      chatId: "oc_group_session",
      openId: "ou_operator",
      text: "/session use ops"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_group_run",
      chatType: "group",
      chatId: "oc_group_session",
      openId: "ou_member",
      text: "/run check service status"
    }));

    assert.equal(runner.tasks.length, 1);
    assert.match(runner.tasks[0], /Feishu group runtime session message received/);
    assert.match(runner.tasks[0], /Runtime session profile: ops/);
    assert.match(runner.tasks[0], /check service status/);
    assert.deepEqual(transport.chatSent.map((item) => item.text), [
      "已绑定 runtime session: " + (await listRuntimeSessions(fixture.store))[0]!.id + "\nprofile: ops\n后续普通群消息会进入 inbox；使用 /run 或 @bot 才会执行任务。",
      "收到，正在处理。",
      "Group final answer."
    ]);

    const runs = await listRuntimeTaskRuns(fixture.store);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.status, "done");
    assert.equal(runs[0]?.task, "check service status");
    assert.equal(runs[0]?.source_kind, "feishu");
    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.id, runs[0]?.id);
    assert.equal(tasks[0]?.status, "done");
    const rawRuns = await readJsonl(join(fixture.stateRoot, "runs/index.jsonl"));
    assert.deepEqual(rawRuns.map((entry) => entry.status), ["queued", "running", "done"]);
    assert.equal(rawRuns[0]?.id, rawRuns[1]?.id);
    assert.equal(rawRuns[1]?.id, rawRuns[2]?.id);
    const rawQueue = await readJsonl(join(fixture.stateRoot, "runs/task_queue.jsonl"));
    assert.deepEqual(rawQueue.map((entry) => entry.status), ["queued", "running", "done"]);
    assert.match(String(rawQueue[0]?.runner_task), /Feishu group runtime session message received/);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.source_kind, "feishu");
    assert.equal(outbox[0]?.purpose, "final");
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.task_run_id, runs[0]?.id);
    assert.equal(outbox[0]?.runtime_session_id, runs[0]?.runtime_session_id);
    assert.equal(outbox[0]?.in_reply_to_message_id, "om_group_run");
    assert.equal(outbox[0]?.text, "Group final answer.");
  } finally {
    await fixture.cleanup();
  }
});

test("Feishu adapter drains queued provider-neutral outbox replies", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "unused");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });
    const queued = await recordRuntimeChannelOutbound(fixture.store, {
      source: {
        kind: "feishu",
        channelId: "feishu-test",
        conversationType: "group",
        conversationId: "oc_group_session",
        threadId: "main",
        profile: "ops"
      },
      sourceKey: "feishu:feishu-test:group:oc_group_session:main:ops",
      runtimeSessionId: "runtime_session_group",
      taskRunId: "runtime_task_group",
      purpose: "final",
      status: "queued",
      text: "Recovered group final answer.",
      now: "2026-07-07T00:00:00.000Z"
    });

    const drained = await adapter.drainRuntimeChannelOutbox();

    assert.equal(drained.queued_count, 1);
    assert.equal(drained.sent_count, 1);
    assert.deepEqual(drained.outbox_ids, [queued.id]);
    assert.deepEqual(transport.chatSent.map((item) => item.text), ["Recovered group final answer."]);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.id, queued.id);
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.provider_delivery_ref, `channels/feishu/outbox/${queued.id}.json`);
    assert.deepEqual(outbox[0]?.provider_message_ids, ["chat_sent_1"]);
  } finally {
    await fixture.cleanup();
  }
});

test("Feishu outbox drain can replay p2p replies by chat id", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "unused");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });
    await recordRuntimeChannelOutbound(fixture.store, {
      source: {
        kind: "feishu",
        channelId: "feishu-test",
        conversationType: "p2p",
        conversationId: "oc_p2p_chat",
        threadId: "main",
        profile: "ops"
      },
      runtimeSessionId: "runtime_session_p2p",
      taskRunId: "runtime_task_p2p",
      purpose: "final",
      status: "queued",
      text: "Recovered p2p final answer.",
      now: "2026-07-07T00:00:00.000Z"
    });

    const drained = await adapter.drainRuntimeChannelOutbox();

    assert.equal(drained.sent_count, 1);
    assert.deepEqual(transport.chatSent.map((item) => item.chatId), ["oc_p2p_chat"]);
    assert.equal(transport.sent.length, 0);
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox[0]?.status, "sent");
  } finally {
    await fixture.cleanup();
  }
});

test("operator status command replies from local state without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 1234,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      runtime_build: {
        schema_version: 1,
        target: "runtime",
        runtime_current_root: "/home/user/.local-runtime/service/runtime/current",
        repo_root: fixture.repoRoot,
        built_at: "2026-06-29T00:00:10.000Z",
        node_version: "v24.0.0",
        source_commit: "0123456789abcdef0123456789abcdef01234567",
        source_commit_short: "0123456789ab",
        source_branch: "develop",
        source_is_dirty: false
      },
      updated_at: "2026-06-29T00:00:00.000Z"
    });
    await fixture.store.writeJson("services/runtime/review_tick.json", {
      service: "review_tick",
      enabled: false,
      state: "disabled",
      last_inbox_count: 2,
      last_active_tick_inbox_count: 0,
      last_active_inbox_count: 0,
      last_inactive_tick_inbox_count: 2,
      last_inactive_tick_inbox_reasons: {
        terminal_decision_completed: 1,
        executed_status: 1
      },
      last_focus: {
        source: "backlog_actionable",
        reason: "top backlog item is already actionable as review_confirmation; keeping recent review scope",
        query: null,
        opportunity: {
          ref: "autonomy/followups/follow_up_confirmation_status.json",
          id: "follow_up_confirmation_status",
          kind: "review_confirmation",
          status: "pending",
          score: 100,
          action_kind: "draft_sop"
        }
      }
    });
    await fixture.store.writeJson("services/runtime/content_daily.json", {
      service: "content_daily",
      enabled: true,
      state: "skipped",
      last_job_status: "published",
      last_job_count: 2,
      last_publish_count: 2,
      last_publish_published_count: 2,
      last_publish_direct_count: 1,
      last_publish_reconciled_count: 1,
      last_publish_failed_count: 0,
      last_publish_adapters: ["xiaohongshu-mcp"],
      last_publish_tools: ["publish_content"],
      last_publish_latest_run_ref: "content/runs/content_run_publish_status/run.json",
      last_publish_latest_title: "AI算力早报",
      last_publish_latest_route: "direct",
      last_publish_latest_post_url: "https://www.xiaohongshu.com/explore/note_publish_status",
      updated_at: "2026-07-01T22:00:00.000Z"
    });
    await fixture.store.writeJson("services/runtime/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "ok",
      last_queue_count: 2,
      last_due_count: 1,
      last_captured_count: 1,
      next_due_at: "2026-07-01T20:00:00.000Z",
      next_due_run_ref: "content/runs/content_run_status/run.json",
      next_due_reason: "needs_follow_up",
      next_due_command: "pnpm run runtime -- content feedback-capture --run content_run_status --server-url http://localhost:18060/mcp --state-root <state-root>",
      next_wake_at: "2026-07-01T20:00:00.000Z",
      next_wake_delay_ms: 60000,
      next_wake_reason: "next_due_at"
    });
    await fixture.store.writeJson("services/runtime/content_creator_metrics.json", {
      service: "content_creator_metrics",
      enabled: true,
      state: "skipped",
      last_queue_count: 0,
      last_captured_count: 0,
      last_blocked_count: 0,
      last_failed_count: 0,
      next_due_at: "2026-07-01T21:00:00.000Z",
      next_due_run_ref: "content/runs/content_run_creator_status/run.json",
      next_due_command: "pnpm run runtime -- content creator-metrics-capture --run content_run_creator_status --state-root <state-root>",
      next_wake_at: "2026-07-01T21:00:00.000Z",
      next_wake_delay_ms: 120000,
      next_wake_reason: "next_due_at"
    });
    await fixture.store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_test",
      action_type: "pause_autonomy",
      status: "active",
      scope: "autonomous_exploration",
      reason: "Operator should review self-evolution direction before more autonomous ticks.",
      resume_hint: "Clear or replace the pause signal after review."
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_status",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/status"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Local Runtime status/);
    assert.match(transport.sent[0].text, /Runtime: running \(pid 1234\)/);
    assert.match(transport.sent[0].text, /Runtime: 0123456789ab \(develop\)/);
    assert.match(transport.sent[0].text, /Runtime built: 2026-06-29T00:00:10\.000Z/);
    assert.match(transport.sent[0].text, /Review tick: disabled/);
    assert.match(transport.sent[0].text, /Review tick inbox: raw=2 active_tick=0 active_total=0/);
    assert.match(transport.sent[0].text, /Review tick inactive inbox: count=2 reasons=executed_status=1, terminal_decision_completed=1/);
    assert.match(transport.sent[0].text, /Review focus: backlog_actionable/);
    assert.match(transport.sent[0].text, /Focus item: review_confirmation:follow_up_confirmation_status/);
    assert.match(transport.sent[0].text, /Content daily publish: count=2 published=2 direct=1 reconciled=1 failed=0/);
    assert.match(transport.sent[0].text, /Content daily publish_adapters: xiaohongshu-mcp/);
    assert.match(transport.sent[0].text, /Content daily latest_publish: AI算力早报 \/ direct \/ content\/runs\/content_run_publish_status\/run\.json/);
    assert.match(transport.sent[0].text, /Content daily latest_post_url: https:\/\/www\.xiaohongshu\.com\/explore\/note_publish_status/);
    assert.match(transport.sent[0].text, /Feedback refresh: ok \(enabled=true\)/);
    assert.match(transport.sent[0].text, /Feedback refresh queue: 2 due=1 captured=1/);
    assert.match(transport.sent[0].text, /Feedback refresh next_due_at: 2026-07-01T20:00:00.000Z/);
    assert.match(transport.sent[0].text, /Feedback refresh next_wake_at: 2026-07-01T20:00:00.000Z/);
    assert.match(transport.sent[0].text, /Feedback refresh next_wake_delay_ms: 60000/);
    assert.match(transport.sent[0].text, /Feedback refresh next_wake_reason: next_due_at/);
    assert.match(transport.sent[0].text, /Feedback refresh next_due_run: content\/runs\/content_run_status\/run\.json/);
    assert.match(transport.sent[0].text, /Feedback refresh next_due_reason: needs_follow_up/);
    assert.match(transport.sent[0].text, /Feedback refresh next_due_command: pnpm run runtime -- content feedback-capture --run content_run_status/);
    assert.match(transport.sent[0].text, /Creator metrics: skipped \(enabled=true\)/);
    assert.match(transport.sent[0].text, /Creator metrics next_due_at: 2026-07-01T21:00:00.000Z/);
    assert.match(transport.sent[0].text, /Creator metrics next_wake_at: 2026-07-01T21:00:00.000Z/);
    assert.match(transport.sent[0].text, /Creator metrics next_wake_delay_ms: 120000/);
    assert.match(transport.sent[0].text, /Creator metrics next_wake_reason: next_due_at/);
    assert.match(transport.sent[0].text, /Creator metrics next_due_command: pnpm run runtime -- content creator-metrics-capture --run content_run_creator_status/);
    assert.match(transport.sent[0].text, /Autonomy: paused/);
    assert.match(transport.sent[0].text, /Pause reason: Operator should review self-evolution direction/);
    assert.match(transport.sent[0].text, /Pause signal: autonomy\/runs\/pause_signal\.json/);
    assert.match(transport.sent[0].text, /Resume command: pnpm run runtime -- governance resume-autonomy/);
    assert.equal(await fixture.store.readStateJson<Record<string, unknown>>("autonomy/runs/pause_signal.json")
      .then((signal) => signal?.status), "active");
    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "operator_command"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("operator config command replies with non-secret runtime config without running the agent", async () => {
  const fixture = await createFixture();
  const configFixture = await createConfigFixture();
  try {
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store,
      configDir: configFixture.configDir
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_config",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/config"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Runtime config/);
    assert.match(transport.sent[0].text, /active_model: fallback-model/);
    assert.match(transport.sent[0].text, /model: gpt-test/);
    assert.match(transport.sent[0].text, /model_context_window_tokens: 20000/);
    assert.match(transport.sent[0].text, /model_input_budget_tokens: 17600/);
    assert.match(transport.sent[0].text, /active_channel: feishu-test/);
    assert.match(transport.sent[0].text, /channel_transport: websocket/);
    assert.match(transport.sent[0].text, /channel_followup_queue_size: 3/);
    assert.match(transport.sent[0].text, /active_scenario: im-default/);
    assert.match(transport.sent[0].text, /review_tick_enabled: false/);
    assert.match(transport.sent[0].text, /content_daily_enabled: false/);
    assert.match(transport.sent[0].text, /content_feedback_refresh_enabled: false/);
    assert.match(transport.sent[0].text, /runtime_source: default:runtime/);
    assert.match(transport.sent[0].text, /Boundary: read-only runtime config summary/);
    assert.doesNotMatch(transport.sent[0].text, /app_secret/);
    assert.doesNotMatch(transport.sent[0].text, /api_key/);
  } finally {
    await configFixture.cleanup();
    await fixture.cleanup();
  }
});

test("operator content command replies with latest daily job and linked run without running the agent", async () => {
  const fixture = await createFixture();
  try {
    const job = await runDailyContentJob(fixture.store, {
      dateKey: "2026-07-01",
      dryRun: true,
      topic: "daily AI news and AI stock hotspots",
      sourceUrls: ["https://example.test/frontier-ai"],
      tickers: ["NVDA"],
      fetchText: async (url) => ({
        url,
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "text/plain",
        text: "RAW_CONTENT_BODY_SHOULD_NOT_BE_SENT. Frontier AI agents and AI chip demand are both moving today."
      })
    });
    const run = JSON.parse(await readFile(join(fixture.stateRoot, job.run_ref), "utf8")) as {
      image_request: { output_path: string };
    };
    await mkdir(dirname(run.image_request.output_path), { recursive: true });
    await writeFile(run.image_request.output_path, "fake image bytes");
    await recordContentImageEvidence(fixture.store, {
      runRef: job.run_id,
      status: "generated",
      outputPath: run.image_request.output_path,
      model: "gpt-image-2"
    });
    await recordContentPublishEvidence(fixture.store, {
      runRef: job.run_id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-feishu-content-post",
      postUrl: "https://www.xiaohongshu.com/explore/xhs-feishu-content-post"
    });
    await recordContentFeedbackEvidence(fixture.store, {
      runRef: job.run_id,
      capturedBy: "xiaohongshu-mcp",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#xhs-feishu-content-post"
    });
    await fixture.store.writeJson("services/runtime/content_daily.json", {
      service: "content_daily",
      enabled: true,
      state: "skipped",
      dry_run: true,
      preflight: false,
      publish_enabled: false,
      external_write_confirmed: false,
      last_date_key: "2026-07-01",
      last_track_id: job.track_id ?? "default",
      last_job_count: 1,
      last_job_ref: job.job_ref,
      last_job_refs: [job.job_ref],
      last_run_ref: job.run_ref,
      last_run_refs: [job.run_ref],
      last_job_status: job.status,
      updated_at: "2026-07-01T00:00:00.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_content_daily",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/content"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Content daily/);
    assert.match(transport.sent[0].text, /enabled: true/);
    assert.match(transport.sent[0].text, /last_job_count: 1/);
    assert.match(transport.sent[0].text, /last_effective_job_status: published/);
    assert.match(transport.sent[0].text, /Content daily publish_attribution:/);
    assert.match(transport.sent[0].text, /AI算力早报 \/ publish=xiaohongshu-mcp:publish_content \/ route=direct \/ feedback=xiaohongshu-mcp:1 latest=xiaohongshu-mcp\/captured/);
    assert.match(transport.sent[0].text, /status: drafted/);
    assert.match(transport.sent[0].text, /effective_status: published/);
    assert.match(transport.sent[0].text, /track: default/);
    assert.match(transport.sent[0].text, /job_ref: content\/daily\/2026-07-01\.json/);
    assert.match(transport.sent[0].text, /Linked run:/);
    assert.match(transport.sent[0].text, /image_status: generated/);
    assert.match(transport.sent[0].text, /publish_status: published/);
    assert.match(transport.sent[0].text, /Creator metrics needed:/);
    assert.match(transport.sent[0].text, /readiness: pnpm run runtime -- content channel-readiness --server-url http:\/\/localhost:18060\/mcp --browser-launch-check/);
    assert.match(transport.sent[0].text, /missing: view_count/);
    assert.doesNotMatch(transport.sent[0].text, /missing: view_count, follow_count/);
    assert.match(transport.sent[0].text, /content creator-metrics-capture --run/);
    assert.match(transport.sent[0].text, /content show --run/);
    assert.doesNotMatch(transport.sent[0].text, /content daily-advance --date 2026-07-01/);
    assert.match(transport.sent[0].text, /This command is read-only/);
    assert.doesNotMatch(transport.sent[0].text, /RAW_CONTENT_BODY_SHOULD_NOT_BE_SENT/);
    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "operator_command"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("operator content run command replies with bounded run metadata only", async () => {
  const fixture = await createFixture();
  try {
    const job = await runDailyContentJob(fixture.store, {
      dateKey: "2026-07-01",
      dryRun: true,
      topic: "daily AI news and AI stock hotspots",
      sourceUrls: ["https://example.test/frontier-ai"],
      tickers: ["NVDA"],
      fetchText: async (url) => ({
        url,
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "text/plain",
        text: "RUN_DETAIL_RAW_BODY_SHOULD_NOT_BE_SENT. AI application launches and chip demand are active."
      })
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_content_run",
      chatType: "p2p",
      openId: "ou_allowed",
      text: `/content run ${job.run_id}`
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Content run/);
    assert.match(transport.sent[0].text, new RegExp(`id: ${job.run_id}`));
    assert.match(transport.sent[0].text, /sources: /);
    assert.match(transport.sent[0].text, /inspect: pnpm run runtime -- content show/);
    assert.match(transport.sent[0].text, /This command is read-only/);
    assert.doesNotMatch(transport.sent[0].text, /RUN_DETAIL_RAW_BODY_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator content command can inspect a tracked daily job by track and date", async () => {
  const fixture = await createFixture();
  try {
    const job = await runDailyContentJob(fixture.store, {
      dateKey: "2026-07-01",
      trackId: "ai_applications",
      workflowId: "daily_ai_applications_xhs",
      dryRun: true,
      topic: "daily AI application product launches and agent tooling news",
      sourceUrls: ["https://example.test/apps"],
      tickers: ["MSFT"],
      fetchText: async (url) => ({
        url,
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "text/plain",
        text: "TRACKED_RAW_BODY_SHOULD_NOT_BE_SENT. New AI agents are moving into product workflows."
      })
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_content_tracked_daily",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/content ai_applications/2026-07-01"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /track: ai_applications/);
    assert.match(transport.sent[0].text, /job_ref: content\/daily\/ai_applications\/2026-07-01\.json/);
    assert.match(transport.sent[0].text, new RegExp(job.run_id));
    assert.doesNotMatch(transport.sent[0].text, /TRACKED_RAW_BODY_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator capabilities command replies with local capability catalog without running the agent", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_capabilities",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/capabilities"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length > 0, true);
    const fullText = transport.sent.map((item) => item.text).join("\n");
    assert.match(fullText, /Local Runtime capabilities/);
    assert.match(fullText, /Core tools \(implemented, layer: core_runtime\)/);
    assert.match(fullText, /file\.read/);
    assert.match(fullText, /SOP self-evolution/);
    assert.match(fullText, /Self-evolution scorecard \[core_runtime\]/);
    assert.doesNotMatch(fullText, /Self-evolution scorecard \[local_learning\]/);
    assert.match(fullText, /Content planning and evidence \[application_slice\]/);
    assert.doesNotMatch(fullText, /Content planning and evidence \[core_runtime\]/);
    assert.match(fullText, /delegate_agent/);
    assert.match(fullText, /block verified completion until later main-harness write\/run recovery evidence exists and the done claim binds a non-delegated verification ref/);
    assert.match(fullText, /successful write\/run evidence only counts as completion proof/);
    assert.match(fullText, /dispatch_failure_kind values are dispatch_limit_exceeded, input_contract_failed, or none/);
    assert.match(fullText, /none means no dispatch-layer failure, not delegated success/);
    assert.match(fullText, /result_failure_kind values are dispatch_limit_exceeded, input_contract_failed, delegated_output_contract_failed, delegated_model_request_failed, or none/);
    assert.match(fullText, /raw task\/context echoes and delegated output authority or command\/test execution claims fail the delegated output contract/);
    assert.match(fullText, /observations exclude raw task, context, output preview, and artifact bodies/);
    assert.match(fullText, /delegation grants no retry, fallback, tool, mutation, expert-scheduling, or completion authority/);
    assert.match(fullText, /Feishu/);
    assert.match(fullText, /local-only/);
    assert.match(fullText, /This command is read-only/);
    assert.doesNotMatch(fullText, /api_key/);
    assert.doesNotMatch(fullText, /app_secret/);
    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "operator_command"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("operator capability acceptance command replies with next-version gates without running the agent", async () => {
  const fixture = await createFixture();
  try {
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_capability_acceptance",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/capabilities acceptance"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length > 0, true);
    const fullText = transport.sent.map((item) => item.text).join("\n");
    assert.match(fullText, /Capability acceptance/);
    assert.match(fullText, /Core execution \(ready, layer: core_runtime\)/);
    assert.doesNotMatch(fullText, /SOP self-evolution \(ready, layer: local_learning\)/);
    assert.match(fullText, /Default next slice/);
    assert.match(fullText, /general_agent_delegation_hardening \| layer: core_runtime/);
    assert.match(fullText, /bounded Live Run Trace and Harness Replay/);
    assert.match(fullText, /without raw delegated artifact reads/);
    assert.match(fullText, /Follow-up slices/);
    assert.match(fullText, /active_exploration_publish_plan \| layer: application_slice/);
    assert.match(fullText, /sop_skill_persistence_follow_up \| layer: local_learning/);
    assert.doesNotMatch(fullText, /active_exploration_publish_plan \| layer: core_runtime/);
    assert.match(fullText, /pnpm run check/);
    assert.doesNotMatch(fullText, /review rehearse-sop-loop/);
    assert.match(fullText, /context pressure --limit 10/);
    assert.match(fullText, /review replay-audit/);
    assert.match(fullText, /review replays/);
    assert.doesNotMatch(fullText, /harness_replay_acceptance/);
    assert.doesNotMatch(fullText, /context_pressure_action_gate/);
    assert.doesNotMatch(fullText, /real_sop_loop_rehearsal/);
    assert.match(fullText, /This command is read-only/);
    assert.doesNotMatch(fullText, /api_key/);
    assert.doesNotMatch(fullText, /app_secret/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator recap command summarizes latest session without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_recap_prompt",
      session_id: "session_feishu_recap",
      turn_id: "turn_feishu_recap",
      kind: "prompt",
      summary: "Accepted live task: restore Feishu operator context",
      artifact_refs: [
        "memory/episodes/session_feishu_recap-context.md",
        "memory/episodes/session_feishu_recap-context.json"
      ],
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_recap_report",
      session_id: "session_feishu_recap",
      turn_id: "turn_feishu_recap",
      kind: "report",
      summary: "Recorded model working checkpoint: Feishu recap is available.",
      artifact_refs: [
        "memory/working/current.json",
        "memory/episodes/session_feishu_recap-model-response-r1.json"
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await fixture.store.writeJson("memory/working/current.json", {
      goal: "Keep Feishu operator recovery fast.",
      current_step: "Expose session recap.",
      known_constraints: [],
      recent_evidence_refs: ["evidence_recap_prompt"],
      open_questions: [],
      next_action: "Use /recap before resuming a session.",
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await fixture.store.writeJson("memory/episodes/session_feishu_recap-context.json", {
      version: 1,
      session_id: "session_feishu_recap",
      turn_id: "turn_feishu_recap",
      created_at: "2026-06-30T00:00:00.500Z",
      total_chars: 9000,
      section_count: 2,
      sections: [
        { title: "Governance Queue", chars: 5000 },
        { title: "Working Checkpoint", chars: 4000 }
      ],
      recall: {
        memory_hit_count: 1,
        archive_ref_count: 0,
        opportunity_ref_count: 2,
        skill_ref_count: 1,
        discipline_active: false
      }
    });
    await fixture.store.writeJson("memory/episodes/session_feishu_recap-completion-verification.json", {
      id: "completion_verification_feishu_recap",
      session_id: "session_feishu_recap",
      turn_id: "turn_feishu_recap",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Feishu recap completed.",
      envelope_ref: "memory/episodes/session_feishu_recap-model-action-r1.json",
      final_response_ref: "memory/episodes/session_feishu_recap-final-response.md",
      claimed_verification_refs: [],
      observation_refs: ["evidence_recap_prompt"],
      checks: [],
      created_at: "2026-06-30T00:00:02.000Z"
    });
    await fixture.store.writeJson("memory/episodes/session_feishu_recap-model-response-r1.json", {
      raw: "RAW_FEISHU_RECAP_RESPONSE_SHOULD_NOT_BE_SENT"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_recap",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/recap"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Session recap/);
    assert.match(transport.sent[0].text, /status: completed/);
    assert.match(transport.sent[0].text, /session: session_feishu_recap/);
    assert.match(transport.sent[0].text, /task: restore Feishu operator context/);
    assert.match(transport.sent[0].text, /Completion: done\/passed/);
    assert.match(transport.sent[0].text, /Context: memory\/episodes\/session_feishu_recap-context\.json/);
    assert.match(transport.sent[0].text, /Working checkpoint: memory\/working\/current\.json/);
    assert.match(transport.sent[0].text, /memory recap --session session_feishu_recap/);
    assert.match(transport.sent[0].text, /does not read raw context Markdown/);
    assert.doesNotMatch(transport.sent[0].text, /RAW_FEISHU_RECAP_RESPONSE_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator service logs command reads bounded local log tails without running the agent", async () => {
  const fixture = await createFixture();
  const homeRoot = join(fixture.stateRoot, "..", "home");
  try {
    await mkdir(join(homeRoot, "logs"), { recursive: true });
    await writeFile(join(homeRoot, "logs/runtime.out.log"), [
      "old stdout line should not appear",
      "recent stdout one",
      "recent stdout two"
    ].join("\n"));
    await writeFile(join(homeRoot, "logs/runtime.err.log"), [
      "old stderr line should not appear",
      "recent stderr one",
      "recent stderr two"
    ].join("\n"));
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store,
      homeRoot
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_service_logs",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/logs 2"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Service logs/);
    assert.match(transport.sent[0].text, /limit: 2 lines per stream/);
    assert.match(transport.sent[0].text, /recent stdout one/);
    assert.match(transport.sent[0].text, /recent stdout two/);
    assert.match(transport.sent[0].text, /recent stderr one/);
    assert.match(transport.sent[0].text, /recent stderr two/);
    assert.doesNotMatch(transport.sent[0].text, /old stdout line should not appear/);
    assert.doesNotMatch(transport.sent[0].text, /old stderr line should not appear/);
    assert.match(transport.sent[0].text, /does not run shell commands/);
    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "operator_command"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("operator workspace command reads fixed git status without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await initGitFixture(fixture.repoRoot);
    await writeFile(join(fixture.repoRoot, "tracked.txt"), "one\n", "utf8");
    await runGit(fixture.repoRoot, ["add", "tracked.txt"]);
    await runGit(fixture.repoRoot, ["commit", "-m", "initial"]);
    await writeFile(join(fixture.repoRoot, "tracked.txt"), "two\n", "utf8");
    await writeFile(join(fixture.repoRoot, "untracked.txt"), "RAW_WORKSPACE_BODY_SHOULD_NOT_BE_SENT\n", "utf8");

    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_workspace_status",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/workspace"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Workspace status/);
    assert.match(transport.sent[0].text, /overall: dirty/);
    assert.match(transport.sent[0].text, /changed_files: 2/);
    assert.match(transport.sent[0].text, /unstaged: 1/);
    assert.match(transport.sent[0].text, /untracked: 1/);
    assert.match(transport.sent[0].text, /tracked\.txt/);
    assert.match(transport.sent[0].text, /untracked\.txt/);
    assert.match(transport.sent[0].text, /git status --porcelain=v1 -b/);
    assert.match(transport.sent[0].text, /does not read file bodies/);
    assert.doesNotMatch(transport.sent[0].text, /RAW_WORKSPACE_BODY_SHOULD_NOT_BE_SENT/);
    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "operator_command"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("operator health command replies with bounded service health without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await writeRepoHead(fixture.store, "abcdef0123456789abcdef0123456789abcdef01");
    await fixture.store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 4321,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-29T00:00:00.000Z",
      runtime_build: {
        schema_version: 1,
        target: "runtime",
        runtime_current_root: "/home/user/.local-runtime/service/runtime/current",
        repo_root: fixture.repoRoot,
        built_at: "2026-06-29T00:00:10.000Z",
        node_version: "v24.0.0",
        source_commit: "fedcba9876543210fedcba9876543210fedcba98",
        source_commit_short: "fedcba987654",
        source_branch: "develop",
        source_is_dirty: true
      }
    });
    await fixture.store.writeJson("services/runtime/review_tick.json", {
      service: "review_tick",
      enabled: true,
      state: "paused",
      updated_at: "2026-06-29T00:00:30.000Z",
      last_tick_ref: "autonomy/ticks/review_tick_health.json",
      last_inbox_count: 3,
      last_active_tick_inbox_count: 1,
      last_active_inbox_count: 2,
      last_inactive_tick_inbox_count: 2,
      last_inactive_tick_inbox_reasons: {
        terminal_decision_completed: 1,
        executed_status: 1
      },
      last_inactive_tick_inbox_refs: [
        "autonomy/inbox/review_inbox_completed.json",
        "autonomy/inbox/review_inbox_executed.json"
      ],
      last_focus_current_status: "resolved",
      last_focus_current_reason: "selected review tick focus is no longer present in the current opportunity backlog",
      last_auto_action_status: "executed",
      last_auto_action_ref: "autonomy/opportunity-actions/opportunity_action_health.json",
      last_auto_action_opportunity_id: "archive_health_stale_2026_06_29",
      last_auto_action_opportunity_kind: "archive_health",
      last_auto_action_result_ref: "memory/archives/2026-06-29.json",
      last_auto_action_summary: "archive_refresh: healthy, remaining=0",
      next_wake_at: "2026-06-29T00:30:30.000Z",
      next_wake_delay_ms: 1_800_000,
      next_wake_reason: "interval",
      last_focus: {
        source: "opportunity_backlog",
        reason: "Inspect top service health opportunity before more autonomous work.",
        query: null,
        opportunity: {
          ref: "autonomy/inbox/review_inbox_health.json",
          id: "review_inbox_health",
          kind: "review_inbox",
          status: "open",
          score: 80,
          action_kind: "narrow_review"
        }
      },
      pause_signal_ref: "autonomy/runs/pause_signal.json"
    });
    await fixture.store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_health",
      action_type: "pause_autonomy",
      status: "active",
      reason: "Operator should inspect the service before more ticks.",
      resume_hint: "Resume after service inspection."
    });
    await fixture.store.writeJson("services/runtime/content_daily.json", {
      service: "content_daily",
      enabled: true,
      state: "running",
      updated_at: "2026-06-29T00:00:45.000Z",
      last_job_ref: "content/daily/2026-06-29.json",
      last_job_status: "preflight_ok",
      last_job_count: 1,
      last_applied_strategy_count: 1,
      last_applied_strategy_run_refs: ["content/runs/content_run_health/run.json"],
      last_applied_strategy_source_run_refs: ["content/runs/content_run_source/run.json"],
      last_applied_strategy_postures: ["reuse_baseline"],
      last_applied_strategy_source_titles: ["AI应用早报"],
      last_blocked_strategy_count: 1,
      last_blocked_strategy_source_run_refs: ["content/runs/content_run_blocked/run.json"],
      last_blocked_strategy_postures: ["collect_more_feedback"],
      last_blocked_strategy_source_titles: ["AI算力早报"],
      last_blocked_strategy_reasons: ["latest_strategy_not_auto_applicable:collect_more_feedback"],
      current_track_id: "ai_applications",
      current_track_index: 1,
      current_track_count: 2,
      current_step: "publish_execute",
      current_step_status: "started",
      current_step_summary: "executing external publish",
      current_step_started_at: "2026-06-28T23:59:00.000Z",
      current_step_updated_at: "2026-06-29T00:00:00.000Z",
      current_job_ref: "content/daily/2026-06-29.json",
      current_run_ref: "content/runs/content_run_health/run.json"
    });
    await fixture.store.writeJson("content/daily/2026-06-29.json", {
      status: "preflight_ok",
      run_id: "content_run_health",
      run_ref: "content/runs/content_run_health/run.json"
    });
    await fixture.store.writeJson("content/runs/content_run_health/run.json", {
      status: "published",
      evidence: { publish_status: "published" }
    });
    await fixture.store.writeJson("services/runtime/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "skipped",
      updated_at: "2026-06-29T00:00:20.000Z",
      last_queue_count: 2,
      last_due_count: 0,
      last_deferred_count: 2,
      last_captured_count: 0,
      last_skipped_count: 1,
      last_top_skip_reason: "non_mcp_capture_route",
      last_skip_reason_counts: {
        non_mcp_capture_route: 1
      },
      last_strategy_captured_by: "xiaohongshu-mcp",
      last_strategy_suggestion_count: 2,
      last_strategy_high_priority_count: 2,
      last_strategy_collect_more_feedback_count: 2,
      last_strategy_repair_feedback_capture_count: 0,
      last_strategy_revise_next_post_count: 0,
      last_strategy_reuse_baseline_count: 0,
      last_strategy_verify_metrics_count: 0,
      last_strategy_top_posture: "collect_more_feedback",
      last_strategy_top_priority: "high",
      last_strategy_top_title: "AI应用早报",
      last_strategy_top_run_ref: "content/runs/content_run_health/run.json",
      last_strategy_next_command: "pnpm run runtime -- content feedback-capture --run content_run_health --server-url http://localhost:18060/mcp --state-root <state-root>",
      next_due_at: "2026-06-29T06:00:00.000Z",
      next_due_run_ref: "content/runs/content_run_health/run.json",
      next_due_reason: "needs_follow_up",
      next_due_command: "pnpm run runtime -- content feedback-capture --run content_run_health --server-url http://localhost:18060/mcp --state-root <state-root>",
      next_wake_at: "2026-06-29T06:00:00.000Z",
      next_wake_delay_ms: 600000,
      next_wake_reason: "next_due_at"
    });
    await fixture.store.writeJson("services/runtime/content_creator_metrics.json", {
      service: "content_creator_metrics",
      enabled: true,
      state: "skipped",
      updated_at: "2026-06-29T00:00:21.000Z",
      last_queue_count: 0,
      last_captured_count: 0,
      last_blocked_count: 0,
      last_failed_count: 0,
      next_due_at: "2026-06-29T07:00:00.000Z",
      next_due_run_ref: "content/runs/content_run_creator_health/run.json",
      next_due_command: "pnpm run runtime -- content creator-metrics-capture --run content_run_creator_health --state-root <state-root>",
      next_wake_at: "2026-06-29T01:00:21.000Z",
      next_wake_delay_ms: 3600000,
      next_wake_reason: "interval"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_service_health",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/health"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length >= 1, true);
    const healthText = transport.sent.map((message) => message.text).join("\n");
    assert.match(healthText, /Service health/);
    assert.match(healthText, /overall: paused/);
    assert.match(healthText, /runtime_state: running/);
    assert.match(healthText, /heartbeat_freshness: stale/);
    assert.match(healthText, /Runtime: fedcba987654 \(develop, dirty\)/);
    assert.match(healthText, /Deployment: stale/);
    assert.match(healthText, /Deployment reason: resident runtime build commit differs from current repo HEAD/);
    assert.match(healthText, /Repo HEAD: abcdef012345 \(develop\)/);
    assert.match(healthText, /Restart: pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main/);
    assert.doesNotMatch(healthText, /Restart: .*--state-root <state-root>/);
    assert.match(healthText, /review_tick_state: paused/);
    assert.match(healthText, /review_tick_last_inbox_count: 3/);
    assert.match(healthText, /review_tick_last_active_tick_inbox_count: 1/);
    assert.match(healthText, /review_tick_last_active_inbox_count: 2/);
    assert.match(healthText, /review_tick_last_inactive_tick_inbox_count: 2/);
    assert.match(healthText, /review_tick_last_inactive_tick_inbox_reasons: executed_status=1, terminal_decision_completed=1/);
    assert.match(healthText, /review_tick_last_inactive_tick_inbox_refs: autonomy\/inbox\/review_inbox_completed\.json,autonomy\/inbox\/review_inbox_executed\.json/);
    assert.match(healthText, /review_tick_next_wake_at: 2026-06-29T00:30:30.000Z/);
    assert.match(healthText, /review_tick_next_wake_delay_ms: 1800000/);
    assert.match(healthText, /review_tick_next_wake_reason: interval/);
    assert.match(healthText, /review_tick_focus_current: resolved/);
    assert.match(healthText, /review_tick_focus_current_reason: selected review tick focus is no longer present in the current opportunity backlog/);
    assert.match(healthText, /review_tick_auto_action: executed/);
    assert.match(healthText, /review_tick_auto_action_item: archive_health:archive_health_stale_2026_06_29/);
    assert.match(healthText, /review_tick_auto_action_result: memory\/archives\/2026-06-29\.json/);
    assert.match(healthText, /review_tick_auto_action_summary: archive_refresh: healthy, remaining=0/);
    assert.match(healthText, /review_tick_auto_action_ref: autonomy\/opportunity-actions\/opportunity_action_health\.json/);
    assert.match(healthText, /review_focus_item: review_inbox:review_inbox_health/);
    assert.match(healthText, /content_daily_last_job_status: preflight_ok/);
    assert.match(healthText, /content_daily_last_effective_job_status: published/);
    assert.match(healthText, /content_daily_strategy_counts: applied=1 blocked=1/);
    assert.match(healthText, /content_daily_applied_strategy_postures: reuse_baseline/);
    assert.match(healthText, /content_daily_applied_strategy_sources: content\/runs\/content_run_source\/run\.json/);
    assert.match(healthText, /content_daily_current_step: publish_execute/);
    assert.match(healthText, /content_daily_current_step_freshness: stale/);
    assert.match(healthText, /content_daily_current_track: ai_applications 1\/2/);
    assert.match(healthText, /feedback_strategy_captured_by: xiaohongshu-mcp/);
    assert.match(healthText, /feedback_strategy_suggestion_count: 2/);
    assert.match(healthText, /feedback_strategy_collect_more_feedback_count: 2/);
    assert.match(healthText, /feedback_refresh_top_skip_reason: non_mcp_capture_route/);
    assert.match(healthText, /feedback_refresh_skip_reasons: non_mcp_capture_route=1/);
    assert.match(healthText, /feedback_refresh_next_wake_at: 2026-06-29T06:00:00.000Z/);
    assert.match(healthText, /feedback_refresh_next_wake_delay_ms: 600000/);
    assert.match(healthText, /feedback_refresh_next_wake_reason: next_due_at/);
    assert.match(healthText, /feedback_refresh_next_due_run: content\/runs\/content_run_health\/run\.json/);
    assert.match(healthText, /feedback_refresh_next_due_reason: needs_follow_up/);
    assert.match(healthText, /feedback_refresh_next_due_command: pnpm run runtime -- content feedback-capture --run content_run_health/);
    assert.match(healthText, /feedback_strategy_top: collect_more_feedback \/ high \/ AI应用早报/);
    assert.match(healthText, /feedback_strategy_top_run: content\/runs\/content_run_health\/run\.json/);
    assert.match(healthText, /feedback_strategy_next_command: pnpm run runtime -- content feedback-capture --run content_run_health/);
    assert.match(healthText, /creator_metrics_next_due_at: 2026-06-29T07:00:00.000Z/);
    assert.match(healthText, /creator_metrics_next_wake_at: 2026-06-29T01:00:21.000Z/);
    assert.match(healthText, /creator_metrics_next_wake_delay_ms: 3600000/);
    assert.match(healthText, /creator_metrics_next_wake_reason: interval/);
    assert.match(healthText, /creator_metrics_next_due_command: pnpm run runtime -- content creator-metrics-capture --run content_run_creator_health/);
    assert.match(healthText, /autonomy_pause_active: true/);
    assert.match(healthText, /Operator should inspect the service before more ticks/);
    assert.match(healthText, /does not inspect launchd/);
    assert.doesNotMatch(healthText, /recent stdout/);
    const channelEvents = await readJsonl(join(fixture.stateRoot, "channels/feishu/events.jsonl"));
    assert.equal(channelEvents.some((event) => event.kind === "operator_command"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("operator governance command replies with aggregate state without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await writeRepoHead(fixture.store, "abcdef0123456789abcdef0123456789abcdef01");
    await fixture.store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 5678,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      runtime_build: {
        schema_version: 1,
        target: "runtime",
        runtime_current_root: "/home/user/.local-runtime/service/runtime/current",
        repo_root: fixture.repoRoot,
        built_at: "2026-06-30T00:00:10.000Z",
        node_version: "v24.0.0",
        source_commit: "fedcba9876543210fedcba9876543210fedcba98",
        source_commit_short: "fedcba987654",
        source_branch: "develop",
        source_is_dirty: true
      },
      updated_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("services/runtime/review_tick.json", {
      service: "review_tick",
      enabled: true,
      state: "ok",
      last_tick_ref: "autonomy/ticks/review_tick_governance.json",
      last_inbox_count: 4,
      last_active_tick_inbox_count: 1,
      last_active_inbox_count: 1,
      last_inactive_tick_inbox_count: 3,
      last_inactive_tick_inbox_reasons: {
        terminal_decision_completed: 2,
        duplicate_noncanonical: 1
      },
      next_wake_at: "2026-06-30T00:30:00.000Z",
      next_wake_delay_ms: 1_800_000,
      next_wake_reason: "interval",
      last_focus_current_status: "active",
      last_focus_current_ref: "autonomy/followups/follow_up_confirmation_a.json",
      last_focus_current_backlog_status: "pending",
      last_focus_current_reason: "selected review tick focus is still present in the current opportunity backlog",
      last_auto_action_status: "executed",
      last_auto_action_ref: "autonomy/opportunity-actions/opportunity_action_governance.json",
      last_auto_action_opportunity_id: "archive_health_stale_2026_06_30",
      last_auto_action_opportunity_kind: "archive_health",
      last_auto_action_result_ref: "memory/archives/2026-06-30.json",
      last_auto_action_summary: "archive_refresh: healthy, remaining=0",
      last_focus: {
        source: "backlog_actionable",
        reason: "top backlog item is already actionable as review_confirmation; keeping recent review scope",
        query: null,
        opportunity: {
          ref: "autonomy/followups/follow_up_confirmation_a.json",
          id: "follow_up_confirmation_a",
          kind: "review_confirmation",
          status: "pending",
          score: 100,
          action_kind: "draft_sop"
        }
      }
    });
    await fixture.store.writeJson("services/runtime/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "skipped",
      updated_at: "2026-06-30T00:00:05.000Z",
      next_wake_at: "2026-06-30T01:00:00.000Z",
      next_wake_delay_ms: 3_600_000,
      next_wake_reason: "interval"
    });
    await fixture.store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_test",
      action_type: "pause_autonomy",
      status: "active",
      reason: "Review the governance queue before autonomous ticks."
    });
    await fixture.store.writeJson("memory/semantic/candidates/session_a-memory-proposal-r1-0.json", {
      id: "memory_proposal_a",
      action_type: "propose_memory",
      status: "candidate",
      scope: "local",
      summary: "Remember local governance gates.",
      content: "Detailed candidate memory content.",
      artifact_refs: ["memory/episodes/events.jsonl"],
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("memory/semantic/confirmations/memory_confirmation_a.json", {
      id: "memory_confirmation_a",
      action_type: "promote_memory_candidate",
      status: "pending",
      created_at: "2026-06-30T00:00:00.000Z",
      candidate_ref: "memory/semantic/candidates/session_a-memory-proposal-r1-0.json",
      candidate_id: "memory_proposal_a",
      confirmation_required: true,
      execution_allowed: false,
      would_write: ["state"],
      safety_boundary: ["This request records operator intent only."],
      next_step: "Review before execution."
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_open.json", reviewInboxItem({
      id: "review_inbox_open",
      status: "open",
      title: "Draft local SOP candidate"
    }));
    await fixture.store.writeJson("autonomy/inbox/review_inbox_open_dup.json", reviewInboxItem({
      id: "review_inbox_open_dup",
      status: "open",
      title: "Draft local SOP candidate"
    }));
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_a.json", {
      id: "follow_up_confirmation_a",
      created_at: "2026-06-30T00:00:00.000Z",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_a.json",
      proposal_id: "review_proposal_a",
      proposal_type: "sop_candidate",
      action_id: "follow_up_action_draft_sop_a",
      action_kind: "draft_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_draft_sop_a",
        kind: "draft_sop",
        title: "Draft a local SOP candidate",
        rationale: "Repeated evidence needs a state-only SOP draft.",
        command: null,
        required_refs: ["autonomy/reviews/background_review_a.json"],
        would_write: ["state"]
      },
      required_refs: ["autonomy/reviews/background_review_a.json"],
      would_write: ["state"],
      safety_boundary: ["This request records operator intent only."],
      next_step: "Review before execution."
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_governance",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Governance status/);
    assert.match(transport.sent[0].text, /Autonomy: paused/);
    assert.match(transport.sent[0].text, /Memory candidates: 1/);
    assert.match(transport.sent[0].text, /Memory confirmations: 1 pending \/ 0 executed/);
    assert.match(transport.sent[0].text, /Review inbox: 1 active \/ 2 total/);
    assert.match(transport.sent[0].text, /Review confirmations: 1 pending \/ 0 executed/);
    assert.match(transport.sent[0].text, /Opportunity backlog: 6 active/);
    assert.match(transport.sent[0].text, /service_health=1/);
    assert.match(transport.sent[0].text, /Opportunity hint: Inspect review_confirmation:follow_up_confirmation_a before starting new self-evolution work/);
    assert.match(transport.sent[0].text, /Next resident check: review_tick at 2026-06-30T00:30:00.000Z \(interval, delay_ms=1800000\)/);
    assert.match(transport.sent[0].text, /Top opportunity: review_confirmation:follow_up_confirmation_a/);
    assert.match(transport.sent[0].text, /Top next: Inspect then run explicitly/);
    assert.match(transport.sent[0].text, /Runtime: running \(pid 5678\)/);
    assert.match(transport.sent[0].text, /Runtime: fedcba987654 \(develop, dirty\)/);
    assert.match(transport.sent[0].text, /Runtime built: 2026-06-30T00:00:10\.000Z/);
    assert.match(transport.sent[0].text, /Deployment: stale/);
    assert.match(transport.sent[0].text, /Repo HEAD: abcdef012345 \(develop\)/);
    assert.match(transport.sent[0].text, /Review tick: ok \(enabled=true\)/);
    assert.match(transport.sent[0].text, /Review tick last: autonomy\/ticks\/review_tick_governance\.json/);
    assert.match(transport.sent[0].text, /Review tick inbox: raw=4 active_tick=1 active_total=1/);
    assert.match(transport.sent[0].text, /Review tick inactive inbox: count=3 reasons=duplicate_noncanonical=1, terminal_decision_completed=2/);
    assert.match(transport.sent[0].text, /Review tick next_wake_at: 2026-06-30T00:30:00.000Z/);
    assert.match(transport.sent[0].text, /Review tick next_wake_delay_ms: 1800000/);
    assert.match(transport.sent[0].text, /Review tick next_wake_reason: interval/);
    assert.match(transport.sent[0].text, /Review tick focus current: active/);
    assert.match(transport.sent[0].text, /Review tick focus backlog status: pending/);
    assert.match(transport.sent[0].text, /Review tick focus current ref: autonomy\/followups\/follow_up_confirmation_a\.json/);
    assert.match(transport.sent[0].text, /Review tick focus current reason: selected review tick focus is still present in the current opportunity backlog/);
    assert.match(transport.sent[0].text, /Review tick auto-action: executed/);
    assert.match(transport.sent[0].text, /Review tick auto-action item: archive_health:archive_health_stale_2026_06_30/);
    assert.match(transport.sent[0].text, /Review tick auto-action result: memory\/archives\/2026-06-30\.json/);
    assert.match(transport.sent[0].text, /Review tick auto-action summary: archive_refresh: healthy, remaining=0/);
    assert.match(transport.sent[0].text, /Review focus: backlog_actionable/);
    assert.match(transport.sent[0].text, /Review focus item: review_confirmation:follow_up_confirmation_a/);
    assert.match(transport.sent[0].text, /Review focus action: draft_sop/);
    assert.match(transport.sent[0].text, /memory\/semantic\/candidates\/session_a-memory-proposal-r1-0\.json/);
    assert.match(transport.sent[0].text, /opportunity backlog/);
    assert.match(transport.sent[0].text, /This command is read-only/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator governance command explains decision-closed self-evolution gaps", async () => {
  const fixture = await createFixture();
  try {
    const job = await runDailyContentJob(fixture.store, {
      dateKey: "2026-07-01",
      dryRun: true,
      topic: "daily AI news and AI stock hotspots",
      sourceUrls: ["https://example.test/frontier-ai"],
      tickers: ["NVDA"],
      fetchText: async (url) => ({
        url,
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "text/plain",
        text: "Frontier AI agents and AI chip demand are both moving today."
      })
    });
    const run = JSON.parse(await readFile(join(fixture.stateRoot, job.run_ref), "utf8")) as {
      image_request: { output_path: string };
    };
    await mkdir(dirname(run.image_request.output_path), { recursive: true });
    await writeFile(run.image_request.output_path, "fake image bytes");
    await recordContentImageEvidence(fixture.store, {
      runRef: job.run_id,
      status: "generated",
      outputPath: run.image_request.output_path,
      model: "gpt-image-2"
    });
    await recordContentPublishEvidence(fixture.store, {
      runRef: job.run_id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/xhs-closed-gap"
    });
    const feedback = await recordContentFeedbackEvidence(fixture.store, {
      runRef: job.run_id,
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "operator-screenshot:xhs-closed-gap.png"
    });
    await fixture.store.writeJson(feedback.evidence_ref, {
      ...feedback.evidence,
      created_at: "2000-01-01T00:00:00Z"
    });
    const gapId = `gap_post_publish_feedback_weak_${job.run_id}`;
    await decideOpportunity(fixture.store, {
      opportunity: gapId,
      status: "completed",
      reason: "implemented sparse feedback strategy split"
    });
    await decideOpportunity(fixture.store, {
      opportunity: `gap_active_exploration_source_quality_${job.run_id}`,
      status: "completed",
      reason: "source-quality gate already implemented"
    });

    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_governance_closed_gaps",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Opportunity backlog: 0 active/);
    assert.match(transport.sent[0].text, /Self-evolution gaps: 2 \(completed=2\)/);
    assert.match(transport.sent[0].text, /Self-evolution hint: Self-evolution gaps are decision-closed \(completed=2\)/);
    assert.match(transport.sent[0].text, new RegExp(`self-evolution/gaps/${gapId}\\.json`));
  } finally {
    await fixture.cleanup();
  }
});

test("operator governance commands render selected skill outcome summaries", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/operator-skill-outcome/SKILL.md", [
      "---",
      "name: operator-skill-outcome",
      "description: Use when Feishu governance commands should expose selected skill outcome drift.",
      "---",
      "",
      "RAW_OPERATOR_SKILL_BODY_SHOULD_NOT_BE_SENT"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_operator_skill-context.md", "RAW_OPERATOR_CONTEXT_SHOULD_NOT_BE_SENT");
    await fixture.store.writeText("memory/episodes/session_operator_skill-final-response.md", "RAW_OPERATOR_FINAL_RESPONSE_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson("memory/skills/usage/session_operator_skill-operator-skill-outcome.json", selectedSkillOutcome({
      id: "skill_usage_operator_outcome",
      skill_name: "operator-skill-outcome",
      instructions_ref: "vault/skills/operator-skill-outcome/SKILL.md",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      context_ref: "memory/episodes/session_operator_skill-context.md",
      context_manifest_ref: "memory/episodes/session_operator_skill-context.json",
      completion_report_ref: "memory/episodes/session_operator_skill-completion-verification.json",
      final_response_ref: "memory/episodes/session_operator_skill-final-response.md",
      created_at: "2026-06-30T00:00:10.000Z"
    }));
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_governance_skill_outcome",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_opportunities_skill_outcome",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance opportunities"
    }));

    const combined = transport.sent.map((item) => item.text).join("\n");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Top opportunity: selected_skill_outcome:skill_usage_operator_outcome/);
    assert.match(transport.sent[0].text, /Top selected_skill_outcome: failed/);
    assert.match(transport.sent[0].text, /Top selected_skill: operator-skill-outcome/);
    assert.match(transport.sent[0].text, /Top selected_skill_ref: vault\/skills\/operator-skill-outcome\/SKILL\.md/);
    assert.match(transport.sent[0].text, /Top selected_skill_completion_report: memory\/episodes\/session_operator_skill-completion-verification\.json/);
    assert.match(transport.sent[1].text, /selected_skill_outcome: skill_usage_operator_outcome/);
    assert.match(transport.sent[1].text, /selected_skill_outcome: failed/);
    assert.match(transport.sent[1].text, /selected_skill: operator-skill-outcome/);
    assert.match(transport.sent[1].text, /selected_skill_ref: vault\/skills\/operator-skill-outcome\/SKILL\.md/);
    assert.match(transport.sent[1].text, /selected_skill_completion_report: memory\/episodes\/session_operator_skill-completion-verification\.json/);
    assert.doesNotMatch(combined, /RAW_OPERATOR_SKILL_BODY_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(combined, /RAW_OPERATOR_CONTEXT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(combined, /RAW_OPERATOR_FINAL_RESPONSE_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator opportunities command renders stale daily step service recovery", async () => {
  const fixture = await createFixture();
  try {
    await writeRepoHead(fixture.store, "abcdef0123456789abcdef0123456789abcdef01");
    await fixture.store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 2468,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: new Date().toISOString(),
      runtime_build: {
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });
    await fixture.store.writeJson("services/runtime/content_daily.json", {
      service: "content_daily",
      enabled: true,
      state: "running",
      updated_at: new Date().toISOString(),
      current_track_id: "ai_applications",
      current_track_index: 1,
      current_track_count: 2,
      current_step: "publish_execute",
      current_step_status: "started",
      current_step_started_at: "2000-01-01T00:00:00.000Z",
      current_step_updated_at: "2000-01-01T00:00:00.000Z",
      current_step_summary: "publishing through xiaohongshu-mcp",
      current_job_ref: "content/daily/ai_applications/2026-07-02.json",
      current_run_ref: "content/runs/content_run_stale_daily/run.json"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_opportunities_stale_daily",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance opportunities"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    const text = transport.sent[0].text;
    assert.match(text, /Opportunity backlog/);
    assert.match(text, /service_health: service_health_runtime/);
    assert.match(text, /service_health_content_daily_step: publish_execute/);
    assert.match(text, /service_health_content_daily_step_freshness: stale/);
    assert.match(text, /service_health_content_daily_track: ai_applications/);
    assert.match(text, /service_health_content_daily_job_ref: content\/daily\/ai_applications\/2026-07-02\.json/);
    assert.match(text, /service_health_content_daily_run_ref: content\/runs\/content_run_stale_daily\/run\.json/);
    assert.match(text, /service_health_restart: pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main/);
    assert.match(text, /action_chain: inspect\[read_only\] -> restart_service\[service_control\] -> record_decision\[state_decision\]/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator governance commands render working checkpoint backlog summaries", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/working/current.json", {
      goal: "Keep Feishu governance aware of blocked working checkpoints.",
      current_step: "blocked_feishu_follow_up",
      known_constraints: ["Do not send raw working evidence."],
      recent_evidence_refs: ["memory/episodes/raw-working-feishu-backlog.md"],
      open_questions: ["Which next slice should resume the loop?"],
      next_action: "Resume after the operator chooses the bounded follow-up.",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeText("memory/episodes/raw-working-feishu-backlog.md", "RAW_WORKING_FEISHU_BACKLOG_SHOULD_NOT_BE_SENT");
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_working_feishu_backlog",
      session_id: "session_working_feishu_backlog",
      turn_id: "turn_working_feishu_backlog",
      kind: "report",
      summary: "Recorded working checkpoint for Feishu backlog.",
      artifact_refs: [
        "memory/working/current.json",
        "memory/episodes/raw-working-feishu-backlog.md"
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await fixture.store.appendJsonl("autonomy/opportunity-decisions.jsonl", {
      id: "opportunity_decision_working_checkpoint",
      opportunity_id: "working_checkpoint_current",
      opportunity_ref: "memory/working/current.json",
      opportunity_kind: "working_checkpoint",
      status: "deferred",
      previous_status: "attention",
      reason: "Operator deferred the working checkpoint until the next local pass.",
      action_chain_snapshot: [{
        label: "inspect",
        effect: "read_only",
        reason: "RAW_DECISION_ACTION_CHAIN_REASON_SHOULD_NOT_BE_SENT"
      }, {
        label: "record_decision",
        effect: "state_decision",
        reason: "Record the operator decision."
      }],
      created_at: "2026-06-30T00:00:02.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_governance_working_checkpoint",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_opportunities_working_checkpoint",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance opportunities"
    }));

    const combined = transport.sent.map((item) => item.text).join("\n");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Top opportunity: working_checkpoint:working_checkpoint_current/);
    assert.match(transport.sent[0].text, /Top working_checkpoint: memory\/working\/current\.json/);
    assert.match(transport.sent[0].text, /Top working_checkpoint_step: blocked_feishu_follow_up/);
    assert.match(transport.sent[0].text, /Top working_checkpoint_inspect: pnpm run runtime -- memory working --checkpoint memory\/working\/current\.json/);
    assert.match(transport.sent[0].text, /Top opportunity_decision: deferred/);
    assert.match(transport.sent[0].text, /Top opportunity_decision_reason: Operator deferred the working checkpoint/);
    assert.match(transport.sent[0].text, /Top opportunity_decision_ref: autonomy\/opportunity-decisions\.jsonl#1/);
    assert.match(transport.sent[0].text, /Top opportunity_decision_action_chain: inspect\[read_only\] -> record_decision\[state_decision\]/);
    assert.match(transport.sent[0].text, /Top decision_command: pnpm run runtime -- governance decide-opportunity --opportunity working_checkpoint_current --status open --reason "\.\.\." --state-root <state-root>/);
    assert.match(transport.sent[1].text, /working_checkpoint: working_checkpoint_current/);
    assert.match(transport.sent[1].text, /working_checkpoint: memory\/working\/current\.json/);
    assert.match(transport.sent[1].text, /working_checkpoint_step: blocked_feishu_follow_up/);
    assert.match(transport.sent[1].text, /working_checkpoint_inspect: pnpm run runtime -- memory working --checkpoint memory\/working\/current\.json/);
    assert.match(transport.sent[1].text, /opportunity_decision: deferred/);
    assert.match(transport.sent[1].text, /opportunity_decision_reason: Operator deferred the working checkpoint/);
    assert.match(transport.sent[1].text, /opportunity_decision_ref: autonomy\/opportunity-decisions\.jsonl#1/);
    assert.match(transport.sent[1].text, /opportunity_decision_action_chain: inspect\[read_only\] -> record_decision\[state_decision\]/);
    assert.match(transport.sent[1].text, /decision_command: pnpm run runtime -- governance decide-opportunity --opportunity working_checkpoint_current --status open --reason "\.\.\." --state-root <state-root>/);
    assert.doesNotMatch(combined, /RAW_WORKING_FEISHU_BACKLOG_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(combined, /RAW_DECISION_ACTION_CHAIN_REASON_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator opportunities command replies with ranked backlog without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_a.json", {
      id: "follow_up_confirmation_a",
      created_at: "2026-06-30T00:00:00.000Z",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_reuse.json",
      proposal_id: "review_proposal_reuse",
      proposal_type: "skill_revision",
      sop_id: "sop_operator_reuse",
      sop_ref: "sop/drafts/sop_operator_reuse.json",
      action_id: "follow_up_action_revise_skill_operator_reuse",
      action_kind: "revise_skill",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_revise_skill_operator_reuse",
        kind: "revise_skill",
        title: "Validate Feishu reused skill coverage",
        rationale: "Confirm the duplicate skill still covers the SOP before changing metadata.",
        command: null,
        required_refs: [
          "sop/drafts/sop_operator_reuse.json",
          "vault/skills/operator-reused-skill/SKILL.md"
        ],
        would_write: ["active_vault"]
      },
      required_refs: [
        "sop/drafts/sop_operator_reuse.json",
        "vault/skills/operator-reused-skill/SKILL.md"
      ],
      would_write: ["active_vault"],
      safety_boundary: ["This request records operator intent only."],
      next_step: "Review before execution."
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_stale_sop.json", {
      id: "follow_up_confirmation_stale_sop",
      created_at: "2026-06-30T00:00:09.000Z",
      status: "pending",
      source: "sop_evolution_chain",
      review_ref: "governance/evolution",
      proposal_id: "sop_operator_stale",
      proposal_type: "sop_candidate",
      sop_id: "sop_operator_stale",
      sop_ref: "sop/drafts/sop_operator_stale.json",
      action_id: "follow_up_action_promote_sop_operator_stale",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_promote_sop_operator_stale",
        kind: "promote_sop",
        title: "Promote stale operator SOP",
        rationale: "This stale confirmation should be visible as blocked.",
        command: null,
        required_refs: ["sop/drafts/sop_operator_stale.json", "governance/audits/audit_operator_stale.json"],
        would_write: ["state", "active_vault"]
      },
      required_refs: ["sop/drafts/sop_operator_stale.json", "governance/audits/audit_operator_stale.json"],
      would_write: ["state", "active_vault"],
      safety_boundary: ["This request records operator intent only."],
      next_step: "Review before execution."
    });
    await fixture.store.appendJsonl("autonomy/sop-recovery-decisions.jsonl", {
      id: "sop_recovery_decision_opportunities",
      confirmation_id: "follow_up_confirmation_stale_sop",
      confirmation_ref: "autonomy/followups/follow_up_confirmation_stale_sop.json",
      sop_id: "sop_operator_stale",
      sop_ref: "sop/drafts/sop_operator_stale.json",
      status: "deferred",
      previous_status: "none",
      gate_reason_code: "chain_not_found",
      gate_reason: "SOP evolution chain not found.",
      reason: "Operator deferred stale recovery until the next ledger inspection.",
      created_at: "2026-06-30T00:00:10.000Z"
    });
    await fixture.store.writeJson("memory/semantic/candidates/session_a-memory-proposal-r1-0.json", {
      id: "memory_proposal_a",
      action_type: "propose_memory",
      status: "accepted",
      scope: "local",
      summary: "Remember opportunity backlog visibility.",
      content: "RAW_MEMORY_CONTENT_SHOULD_NOT_BE_SENT",
      artifact_refs: ["memory/episodes/events.jsonl"],
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.appendJsonl("autonomy/opportunities.jsonl", {
      id: "opportunity_operator_a",
      source: "tool_gap",
      description: "Decide whether this local operator opportunity should stay visible.",
      evidence_refs: ["memory/episodes/events.jsonl"],
      growth_value: {
        capability_gain: 4,
        repeat_demand: 3,
        evidence_available: 4,
        urgency_or_unblock: 2,
        risk: 1,
        cost: 1
      },
      budget_hint: {
        max_turns: 1,
        max_tool_calls: 2,
        side_effect_level: "none"
      },
      status: "open",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.appendJsonl("autonomy/opportunity-decisions.jsonl", {
      id: "opportunity_decision_operator_a",
      opportunity_id: "opportunity_operator_a",
      opportunity_ref: "autonomy/opportunities.jsonl#1",
      opportunity_kind: "open_opportunity",
      status: "deferred",
      previous_status: "open",
      reason: "Operator deferred this local opportunity for the next planning pass.",
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await fixture.store.writeJson("sop/drafts/sop_operator_backlog.json", {
      id: "sop_operator_backlog",
      title: "Audit Feishu opportunity SOP",
      trigger: "Use when a Feishu operator needs SOP evolution attention surfaced in opportunities.",
      procedure: ["RAW_SOP_BODY_SHOULD_NOT_BE_SENT"],
      required_tools: ["governance.opportunities"],
      verification: "Feishu opportunities should render the chain as a bounded backlog item.",
      failure_modes: ["If a pending follow-up exists, do not duplicate the chain-level item."],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "draft"
    });
    await fixture.store.writeText("autonomy/reviews/background_review_draft_opportunity.md", "RAW_DRAFT_REVIEW_MARKDOWN_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson("autonomy/reviews/background_review_draft_opportunity.json", backgroundReviewRecord({
      id: "background_review_draft_opportunity",
      stats: {
        events_reviewed: 3,
        sessions_seen: 2,
        kinds: { report: 3 },
        failure_signal_count: 1,
        sop_signal_count: 2
      },
      proposals: [{
        id: "review_proposal_draft_opportunity",
        type: "sop_candidate",
        title: "Draft Feishu-visible SOP readiness",
        rationale: "Repeated failure evidence is ready for a state-only SOP draft.",
        evidence_refs: [
          "memory/episodes/events.jsonl#evidence_draft_opportunity",
          "sop/drafts/sop_operator_related.json",
          "vault/skills/operator-related-skill/SKILL.md"
        ],
        next_action: "Inspect evidence before requesting confirmation."
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_draft_opportunity.json",
        markdown_ref: "autonomy/reviews/background_review_draft_opportunity.md"
      }
    }));
    await fixture.store.writeJson("autonomy/inbox/review_inbox_draft_opportunity.json", {
      id: "review_inbox_draft_opportunity",
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z",
      status: "open",
      source: "review_tick",
      first_review_ref: "autonomy/reviews/background_review_draft_opportunity.json",
      latest_review_ref: "autonomy/reviews/background_review_draft_opportunity.json",
      proposal_id: "review_proposal_draft_opportunity",
      proposal_type: "sop_candidate",
      proposal_title: "Draft Feishu-visible SOP readiness",
      action_id: "follow_up_action_draft_sop_opportunity",
      action_kind: "draft_sop",
      title: "Draft Feishu-visible SOP readiness",
      rationale: "Repeated failure evidence is ready for a state-only SOP draft.",
      command: null,
      required_refs: [
        "autonomy/reviews/background_review_draft_opportunity.json",
        "memory/episodes/events.jsonl#evidence_draft_opportunity",
        "sop/drafts/sop_operator_related.json",
        "vault/skills/operator-related-skill/SKILL.md"
      ],
      would_write: ["state"],
      seen_count: 1
    });
    await fixture.store.writeJson("sop/drafts/sop_operator_reuse.json", {
      id: "sop_operator_reuse",
      title: "Validate Feishu reused skill coverage",
      trigger: "Use when a Feishu opportunity must show whether a duplicate skill still covers the SOP.",
      procedure: [
        "Open the opportunity backlog.",
        "Read the reused skill coverage status.",
        "Keep the raw skill body out of the Feishu reply."
      ],
      required_tools: ["governance.opportunities", "review.coverage"],
      verification: "Feishu opportunities show covered reused skill coverage without rendering the skill body.",
      failure_modes: ["Do not execute revise_skill from the opportunities list."],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "audited",
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeRepoText("vault/skills/operator-reused-skill/SKILL.md", [
      "---",
      "name: operator-reused-skill",
      "description: Validate Feishu reused skill coverage and show whether a duplicate skill still covers the SOP without rendering the skill body.",
      "---",
      "",
      "RAW_REUSED_SKILL_BODY_SHOULD_NOT_BE_SENT"
    ].join("\n"));
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_operator_reused_skill",
      session_id: "sop_operator_reuse",
      turn_id: "audit_operator_reused_skill",
      kind: "report",
      summary: "Skipped explicit SOP promotion because recalled skill already covers this SOP: operator-reused-skill.",
      artifact_refs: [
        "sop/drafts/sop_operator_reuse.json",
        "vault/skills/operator-reused-skill/SKILL.md"
      ],
      created_at: "2026-06-30T00:00:11.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_opportunities",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance opportunities"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length >= 1, true);
    const text = transport.sent.map((item) => item.text).join("\n");
    assert.match(text, /Opportunity backlog/);
    assert.match(text, /follow_up_confirmation_a/);
    assert.match(text, /follow_up_confirmation_stale_sop/);
    assert.match(text, /sop_evolution_gate: stale/);
    assert.match(text, /gate_reason_code: chain[\s\S]*_not_found/);
    assert.match(text, /SOP evolution chain not found/);
    assert.match(text, /recovery_[\s\S]*decision: deferred/);
    assert.match(text, /recovery_decision_reason: Operator deferred stale recovery/);
    assert.match(text, /recovery_decision_ref: autonomy\/sop-recovery-decisions\.jsonl#1/);
    assert.match(text, /review_inbox_draft_opportunity/);
    assert.match(text, /draft_sop_readiness: ready/);
    assert.match(text, /draft_evidence_refs: 3/);
    assert.match(text, /draft_failure_signals: 1/);
    assert.match(text, /draft_sop_signals: 2/);
    assert.match(text, /draft_related_sops: sop\/drafts\/sop_operator_related\.json/);
    assert.match(text, /reused_skill_coverage: covered/);
    assert.match(text, /coverage_sop: sop_operator_reuse/);
    assert.match(text, /coverage_current_duplicate: vault\/skills\/operator-reused-skill\/SKILL\.md/);
    assert.match(text, /opportunity_operator_a/);
    assert.match(text, /opportunity_decision: deferred/);
    assert.match(text, /opportunity_decision_reason: Operator deferred this local opportunity/);
    assert.match(text, /opportunity_decision_ref: autonomy\/opportunity-decisions\.jsonl#1/);
    assert.match(text, /sop_operator_backlog/);
    assert.match(text, /action_chain: request_confirmation\[state_decision\] -> audit_sop\[local_write\]/);
    assert.match(text, /command: pnpm run runtime -- review audit-sop --sop sop_operator_backlog/);
    assert.match(text, /request_command: pnpm run runtime -- review request-sop-confirmation --sop sop_operator_backlog/);
    assert.match(text, /command_writes: state/);
    assert.match(text, /governance decide-opportunity/);
    assert.match(text, /score: /);
    assert.match(text, /side_effect=local_write/);
    assert.match(text, /This command is read-only/);
    assert.doesNotMatch(text, /RAW_MEMORY_CONTENT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(text, /RAW_SOP_BODY_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(text, /RAW_DRAFT_REVIEW_MARKDOWN_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(text, /RAW_REUSED_SKILL_BODY_SHOULD_NOT_BE_SENT/);
    const opportunityDecisions = await readJsonl(join(fixture.stateRoot, "autonomy/opportunity-decisions.jsonl"));
    assert.equal(opportunityDecisions.length, 1);
    const recoveryDecisions = await readJsonl(join(fixture.stateRoot, "autonomy/sop-recovery-decisions.jsonl"));
    assert.equal(recoveryDecisions.length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("operator review tick commands read tick history without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("autonomy/ticks/review_tick_feishu_new.md", "RAW_TICK_MARKDOWN_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson("autonomy/ticks/review_tick_feishu_old.json", reviewTickRecord({
      id: "review_tick_feishu_old",
      query: "old focus",
      created_at: "2026-06-30T00:00:00.000Z",
      artifact_refs: {
        json_ref: "autonomy/ticks/review_tick_feishu_old.json",
        markdown_ref: "autonomy/ticks/review_tick_feishu_old.md"
      }
    }));
    await fixture.store.writeJson("autonomy/ticks/review_tick_feishu_new.json", reviewTickRecord({
      id: "review_tick_feishu_new",
      query: "new focus",
      created_at: "2026-06-30T00:01:00.000Z",
      focus: {
        source: "opportunity_backlog",
        reason: "selected top backlog item sop_evolution_chain:sop_feishu as review focus",
        query: "sop_feishu",
        opportunity: {
          ref: "sop/drafts/sop_feishu.json",
          id: "sop_feishu",
          kind: "sop_evolution_chain",
          status: "drafted",
          score: 84,
          action_kind: "audit_sop",
          action_chain: [{
            label: "request_confirmation",
            effect: "state_decision",
            reason: "Request explicit SOP confirmation before mutating state."
          }, {
            label: "audit_sop",
            effect: "local_write",
            reason: "Run only after the confirmation gate is ready."
          }]
        }
      },
      inbox_item_refs: ["autonomy/inbox/review_inbox_tick_feishu.json"],
      artifact_refs: {
        json_ref: "autonomy/ticks/review_tick_feishu_new.json",
        markdown_ref: "autonomy/ticks/review_tick_feishu_new.md"
      }
    }));
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_ticks",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review ticks"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_tick_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review tick review_tick_feishu_new"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Review ticks/);
    assert.match(transport.sent[0].text, /1\. review_tick_feishu_new/);
    assert.match(transport.sent[0].text, /focus_item: sop_evolution_chain:sop_feishu/);
    assert.match(transport.sent[0].text, /focus_action_chain: request_confirmation\[state_decision\] -> audit_sop\[local_write\]/);
    assert.match(transport.sent[1].text, /Review tick/);
    assert.match(transport.sent[1].text, /id: review_tick_feishu_new/);
    assert.match(transport.sent[1].text, /item: sop_evolution_chain:sop_feishu/);
    assert.match(transport.sent[1].text, /action_chain: request_confirmation\[state_decision\] -> audit_sop\[local_write\]/);
    assert.match(transport.sent[1].text, /autonomy\/inbox\/review_inbox_tick_feishu\.json/);
    assert.doesNotMatch(transport.sent.join("\n"), /RAW_TICK_MARKDOWN_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator review report commands read background review history without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("autonomy/reviews/background_review_feishu_new.md", "RAW_BACKGROUND_REVIEW_MARKDOWN_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson("autonomy/reviews/background_review_feishu_old.json", backgroundReviewRecord({
      id: "background_review_feishu_old",
      query: "old review",
      created_at: "2026-06-30T00:00:00.000Z",
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_feishu_old.json",
        markdown_ref: "autonomy/reviews/background_review_feishu_old.md"
      }
    }));
    await fixture.store.writeJson("autonomy/reviews/background_review_feishu_new.json", backgroundReviewRecord({
      id: "background_review_feishu_new",
      query: "new review",
      created_at: "2026-06-30T00:01:00.000Z",
      proposals: [{
        id: "review_proposal_feishu_new",
        type: "sop_candidate",
        title: "Review local SOP evidence",
        rationale: "Repeated evidence should become a local SOP candidate.",
        evidence_refs: ["memory/episodes/events.jsonl#evidence_review_feishu_new"],
        next_action: "Inspect the cited evidence before requesting confirmation.",
        focus_action_chain: [{
          label: "inspect",
          effect: "read_only",
          reason: "Inspect the cited evidence."
        }, {
          label: "request_confirmation",
          effect: "state_decision",
          reason: "Ask the operator before mutating state."
        }]
      }],
      chain_summaries: [{
        sop_ref: "sop/drafts/sop_feishu.json",
        sop_id: "sop_feishu",
        title: "Feishu-visible SOP",
        sop_status: "draft",
        latest_decision: "drafted",
        event_count: 2,
        audit_count: 1,
        promotion_events: 0,
        reuse_events: 0,
        review_refs: ["autonomy/reviews/background_review_feishu_new.json"],
        audit_refs: ["governance/audits/audit_feishu.json"],
        skill_refs: [],
        duplicate_skill_refs: [],
        event_ids: ["evidence_review_feishu_new"]
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_feishu_new.json",
        markdown_ref: "autonomy/reviews/background_review_feishu_new.md"
      },
      evidence_event_id: "evidence_background_review_feishu_new"
    }));
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_reports",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review reports"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_report_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review report background_review_feishu_new"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Background review reports/);
    assert.match(transport.sent[0].text, /1\. background_review_feishu_new/);
    assert.match(transport.sent[0].text, /proposal_types: sop_candidate=1/);
    assert.match(transport.sent[0].text, /autonomy\/reviews\/background_review_feishu_new\.json/);
    assert.match(transport.sent[1].text, /Background review report/);
    assert.match(transport.sent[1].text, /id: background_review_feishu_new/);
    assert.match(transport.sent[1].text, /sop_candidate\/review_proposal_feishu_new/);
    assert.match(transport.sent[1].text, /focus_action_chain: inspect\[read_only\] -> request_confirmation\[state_decision\]/);
    assert.match(transport.sent[1].text, /Inspect the cited evidence before requesting confirmation/);
    assert.match(transport.sent[1].text, /sop_feishu: latest=drafted/);
    assert.match(transport.sent[1].text, /autonomy\/reviews\/background_review_feishu_new\.json/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.doesNotMatch(transport.sent.map((item) => item.text).join("\n"), /RAW_BACKGROUND_REVIEW_MARKDOWN_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator completion verification commands read report history without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText(
      "memory/episodes/session_completion_feishu_new-completion-verification.md",
      "RAW_COMPLETION_MARKDOWN_SHOULD_NOT_BE_SENT"
    );
    await fixture.store.writeText(
      "memory/episodes/session_completion_feishu_new-final-response.md",
      "RAW_COMPLETION_FINAL_RESPONSE_SHOULD_NOT_BE_SENT"
    );
    await fixture.store.writeJson("memory/episodes/session_completion_feishu_old-completion-verification.json", completionVerificationRecord({
      id: "completion_verification_feishu_old",
      session_id: "session_completion_feishu_old",
      created_at: "2026-06-30T00:00:00.000Z",
      summary: "Old completion verification passed.",
      verification_status: "passed",
      verified: true
    }));
    await fixture.store.writeJson("memory/episodes/session_completion_feishu_new-completion-verification.json", completionVerificationRecord({
      id: "completion_verification_feishu_new",
      session_id: "session_completion_feishu_new",
      created_at: "2026-06-30T00:01:00.000Z",
      summary: "Completion verification failed because command.run returned failure.",
      final_response_ref: "memory/episodes/session_completion_feishu_new-final-response.md",
      checks: [
        {
          id: "write_run_tool_results",
          status: "fail",
          summary: "Failed write/run tool result: command.run.",
          refs: ["tool_result_command"]
        }
      ]
    }));
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_completions",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review completions"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_completion_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review completion completion_verification_feishu_new"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Completion verification reports/);
    assert.match(transport.sent[0].text, /1\. completion_verification_feishu_new/);
    assert.match(transport.sent[0].text, /failed_checks: write_run_tool_results/);
    assert.match(transport.sent[0].text, /memory\/episodes\/session_completion_feishu_new-completion-verification\.json/);
    assert.match(transport.sent[1].text, /Completion verification report/);
    assert.match(transport.sent[1].text, /id: completion_verification_feishu_new/);
    assert.match(transport.sent[1].text, /final_response_ref: memory\/episodes\/session_completion_feishu_new-final-response\.md/);
    assert.match(transport.sent[1].text, /write_run_tool_results: fail/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.doesNotMatch(transport.sent.map((item) => item.text).join("\n"), /RAW_COMPLETION_MARKDOWN_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(transport.sent.map((item) => item.text).join("\n"), /RAW_COMPLETION_FINAL_RESPONSE_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator live run trace commands read bounded run metadata without running the agent", async () => {
  const fixture = await createFixture();
  try {
    const sessionId = "session_trace_feishu_new";
    const turnId = "turn_trace_feishu_new";
    await fixture.store.writeText(`memory/episodes/${sessionId}-context.md`, "RAW_TRACE_CONTEXT_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson(`memory/episodes/${sessionId}-context.json`, {
      version: 1,
      created_at: "2026-06-30T00:29:00.000Z",
      session_id: sessionId,
      turn_id: turnId,
      total_chars: 123,
      section_count: 0,
      sections: [],
      recall: {
        memory_hit_count: 0,
        memory_refs: [],
        skill_ref_count: 0,
        skill_refs: [],
        archive_ref_count: 0,
        archive_refs: [],
        opportunity_ref_count: 0,
        opportunity_refs: [],
        discipline_active: false
      }
    });
    await fixture.store.writeText(`memory/episodes/${sessionId}-model-response-r1.json`, "RAW_TRACE_MODEL_RESPONSE_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson(`memory/episodes/${sessionId}-model-action-r1.json`, {
      summary: "First round records bounded evidence and reads local state.",
      actions: [
        {
          type: "record_evidence",
          rationale: "Capture trace evidence.",
          payload: {
            markdown: "RAW_TRACE_HARNESS_PAYLOAD_SHOULD_NOT_BE_SENT"
          }
        },
        {
          type: "use_tool",
          rationale: "Read a bounded status file.",
          payload: {
            tool: "file.read",
            path: "RAW_TRACE_TOOL_PAYLOAD_SHOULD_NOT_BE_SENT"
          }
        },
        {
          id: "action_delegate_trace_feishu",
          type: "delegate_agent",
          rationale: "Request bounded trace critique.",
          payload: {
            task: "Critique Feishu trace delegated lineage metadata.",
            context: "No tool, write, or mutation authority is available; completion remains with the main harness; output shape is summary/findings_text; use only explicit payload context or named evidence refs."
          }
        }
      ],
      completion_claim: {
        status: "not_done",
        verification_refs: []
      }
    });
    await fixture.store.writeJson(`memory/episodes/${sessionId}-model-action-r2.json`, {
      summary: "Second round responds with verified trace summary.",
      actions: [{
        type: "respond",
        rationale: "Return trace summary.",
        payload: {
          markdown: "RAW_TRACE_RESPOND_PAYLOAD_SHOULD_NOT_BE_SENT"
        }
      }],
      completion_claim: {
        status: "done",
        verification_refs: []
      }
    });
    await fixture.store.writeText(`memory/episodes/${sessionId}-tool_result_status.json`, "RAW_TRACE_TOOL_RESULT_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson(`memory/episodes/${sessionId}-delegated_result_invalid.json`, {
      id: "delegated_result_invalid",
      ok: false,
      summary: "Delegated result failed contract: invalid JSON.",
      action_id: "action_delegate_trace_feishu",
      round: 1,
      sequence: 1,
      task_chars: 55,
      context_chars: 99,
      contract_status: "failed",
      task: "RAW_TRACE_DELEGATED_TASK_SHOULD_NOT_BE_SENT",
      findings_text: "RAW_TRACE_DELEGATED_FINDINGS_SHOULD_NOT_BE_SENT",
      output_text: "RAW_TRACE_DELEGATED_OUTPUT_SHOULD_NOT_BE_SENT",
      raw_output_preview: "RAW_TRACE_DELEGATED_RESULT_SHOULD_NOT_BE_SENT",
      created_at: "2026-06-30T00:29:03.500Z"
    });
    await fixture.store.writeText(`memory/episodes/${sessionId}-final-response.md`, "RAW_TRACE_FINAL_RESPONSE_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, completionVerificationRecord({
      id: "completion_verification_trace_feishu_new",
      session_id: sessionId,
      turn_id: turnId,
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      summary: "Completion verification passed with a bounded live run trace.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      observation_refs: [
        `memory/episodes/${sessionId}-tool_result_status.json`,
        `memory/episodes/${sessionId}-delegated_result_invalid.json`
      ],
      checks: [{
        id: "delegated_results",
        status: "fail",
        summary: "Failed delegated result(s): 1.",
        refs: ["delegated_result_invalid"]
      }],
      created_at: "2026-06-30T00:30:00.000Z"
    }));
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_feishu_prompt",
      session_id: sessionId,
      turn_id: turnId,
      kind: "prompt",
      summary: "Accepted Feishu trace test task.",
      artifact_refs: [
        `memory/episodes/${sessionId}-context.md`,
        `memory/episodes/${sessionId}-context.json`
      ],
      created_at: "2026-06-30T00:29:00.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_feishu_model_r1",
      session_id: sessionId,
      turn_id: turnId,
      kind: "model_action",
      summary: "First round records bounded evidence and reads local state.",
      artifact_refs: [
        `memory/episodes/${sessionId}-model-response-r1.json`,
        `memory/episodes/${sessionId}-model-action-r1.json`
      ],
      created_at: "2026-06-30T00:29:01.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_feishu_harness",
      session_id: sessionId,
      turn_id: turnId,
      kind: "report",
      summary: "Recorded model evidence note: Feishu trace checkpoint.",
      artifact_refs: [`memory/episodes/${sessionId}-record-evidence-r1-1.md`],
      created_at: "2026-06-30T00:29:02.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_feishu_tool",
      session_id: sessionId,
      turn_id: turnId,
      kind: "tool_result",
      summary: "Wrote repo:docs/feishu-generated.md (54 bytes). workspace_guard: before=clean after=dirty changed_files=0->1 delta=1 preexisting_dirty=false target_changed=true.",
      artifact_refs: [`memory/episodes/${sessionId}-tool_result_status.json`],
      created_at: "2026-06-30T00:29:03.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_feishu_delegated",
      session_id: sessionId,
      turn_id: turnId,
      kind: "delegated_result",
      summary: "Delegated result: action_id=action_delegate_trace_feishu; round=1; sequence=1; task_chars=55; context_chars=99; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false.",
      artifact_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      delegated_dispatch: {
        action_id: "action_delegate_trace_feishu",
        envelope_ref: `memory/episodes/${sessionId}-model-action-r1.json`,
        round: 1,
        sequence: 1,
        task_chars: 55,
        context_chars: 99,
        contract_status: "failed",
        dispatch_failure_kind: "none",
        result_failure_kind: "delegated_output_contract_failed",
        ok: false
      },
      created_at: "2026-06-30T00:29:03.500Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_feishu_model_r2",
      session_id: sessionId,
      turn_id: turnId,
      kind: "model_action",
      summary: "Second round responds with verified trace summary.",
      artifact_refs: [`memory/episodes/${sessionId}-model-action-r2.json`],
      created_at: "2026-06-30T00:29:04.000Z"
    });
    const replay = await runHarnessReplayAudit(fixture.store, {
      traceRef: "completion_verification_trace_feishu_new"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_traces",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review traces"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_trace_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review trace completion_verification_trace_feishu_new"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_replays",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review replays"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_replay_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: `/review replay ${replay.id}`
    }));

    const allSent = transport.sent.map((item) => item.text).join("\n");
    const replayDetailText = transport.sent.slice(3).map((item) => item.text).join("\n");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length >= 4, true);
    assert.match(transport.sent[0].text, /Live run traces/);
    assert.match(transport.sent[0].text, /completion_verification_trace_feishu_new/);
    assert.match(transport.sent[0].text, /events: 6/);
    assert.match(transport.sent[0].text, /repo_write_guards: 1/);
    assert.match(transport.sent[0].text, /delegated_results: 1/);
    assert.match(transport.sent[0].text, /delegated_results_failed: 1/);
    assert.match(transport.sent[0].text, /rounds: 2/);
    assert.match(transport.sent[1].text, /Live run trace/);
    assert.match(transport.sent[1].text, /completion_id: completion_verification_trace_feishu_new/);
    assert.match(transport.sent[1].text, /context_ref: memory\/episodes\/session_trace_feishu_new-context\.md/);
    assert.match(transport.sent[1].text, /delegated_results: 1/);
    assert.match(transport.sent[1].text, /delegated_results_failed: 1/);
    assert.match(transport.sent[1].text, /Delegated dispatches:/);
    assert.match(transport.sent[1].text, /action_id: action_delegate_trace_feishu/);
    assert.match(transport.sent[1].text, /round: 1/);
    assert.match(transport.sent[1].text, /sequence: 1/);
    assert.match(transport.sent[1].text, /envelope_ref: memory\/episodes\/session_trace_feishu_new-model-action-r1\.json/);
    assert.match(transport.sent[1].text, /contract_status: failed/);
    assert.match(transport.sent[1].text, /dispatch_failure_kind: none/);
    assert.match(transport.sent[1].text, /result_failure_kind: delegated_output_contract_failed/);
    assert.match(transport.sent[1].text, /task_chars: 55/);
    assert.match(transport.sent[1].text, /context_chars: 99/);
    assert.match(transport.sent[1].text, /repo_write_guards: 1/);
    assert.match(transport.sent[1].text, /docs\/feishu-generated\.md/);
    assert.match(transport.sent[1].text, /before: clean \(0 changed\)/);
    assert.match(transport.sent[1].text, /after: dirty \(1 changed\)/);
    assert.match(transport.sent[1].text, /target_changed: true/);
    assert.match(transport.sent[1].text, /round_1: memory\/episodes\/session_trace_feishu_new-model-action-r1\.json/);
    assert.match(transport.sent[1].text, /action_counts: delegate_agent=1, record_evidence=1, use_tool=1/);
    assert.match(transport.sent[1].text, /delegated_action_ids: action_delegate_trace_feishu/);
    assert.match(transport.sent[1].text, /delegated_action_sequence_by_id: action_delegate_trace_feishu=1/);
    assert.match(transport.sent[1].text, /harness_action_types: record_evidence/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.match(transport.sent[2].text, /Harness replay audits/);
    assert.match(transport.sent[2].text, new RegExp(replay.id));
    assert.match(transport.sent[2].text, /metadata_replay/);
    assert.match(transport.sent[2].text, /completion_verification_trace_feishu_new/);
    assert.match(transport.sent[2].text, /delegated_failed: 1/);
    assert.match(transport.sent[2].text, /delegated_dispatches: 1/);
    assert.match(replayDetailText, /Harness replay audit/);
    assert.match(replayDetailText, new RegExp(replay.id));
    assert.match(replayDetailText, /trace_ref: memory\/episodes\/session_trace_feishu_new-completion-verification\.json/);
    assert.match(replayDetailText, /replay_result: metadata_replay/);
    assert.match(replayDetailText, /delegated_dispatches=1/);
    assert.match(replayDetailText, /delegated_dispatch_metadata: pass/);
    assert.match(replayDetailText, /delegated_dispatch_lineage: pass/);
    assert.match(replayDetailText, /delegated_dispatch_failure_kind: pass/);
    assert.match(replayDetailText, /delegated_dispatch_round_limit: pass/);
    assert.match(replayDetailText, /delegated_result_failure_kind: pass/);
    assert.match(replayDetailText, /delegated_result_contract: warning/);
    assert.match(replayDetailText, /Delegated dispatches:/);
    assert.match(replayDetailText, /action_id: action_delegate_trace_feishu/);
    assert.match(replayDetailText, /envelope_ref: memory\/episodes\/session_trace_feishu_new-model-action-r1\.json/);
    assert.match(replayDetailText, /round: 1/);
    assert.match(replayDetailText, /sequence: 1/);
    assert.match(replayDetailText, /dispatch_failure_kind: none/);
    assert.match(replayDetailText, /result_failure_kind: delegated_output_contract_failed/);
    assert.match(replayDetailText, /This command is read-only/);
    assert.doesNotMatch(allSent, /RAW_TRACE_CONTEXT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_MODEL_RESPONSE_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_HARNESS_PAYLOAD_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_TOOL_PAYLOAD_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_TOOL_RESULT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_DELEGATED_RESULT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_DELEGATED_TASK_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_DELEGATED_FINDINGS_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_DELEGATED_OUTPUT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(allSent, /RAW_TRACE_FINAL_RESPONSE_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator selected skill outcome commands read usage history without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/feishu-outcome/SKILL.md", [
      "---",
      "name: feishu-outcome",
      "description: Use when Feishu should inspect selected skill outcome telemetry.",
      "---",
      "",
      "RAW_FEISHU_OUTCOME_SKILL_BODY_SHOULD_NOT_BE_SENT"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_skill_feishu-context.md", "RAW_FEISHU_OUTCOME_CONTEXT_SHOULD_NOT_BE_SENT");
    await fixture.store.writeText("memory/episodes/session_skill_feishu-final-response.md", "RAW_FEISHU_OUTCOME_FINAL_RESPONSE_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson("memory/skills/usage/session_skill_feishu_old-feishu-outcome.json", selectedSkillOutcome({
      id: "skill_usage_feishu_old",
      session_id: "session_skill_feishu_old",
      skill_name: "feishu-outcome",
      created_at: "2026-06-30T00:00:00.000Z",
      verification_status: "passed",
      verified: true,
      verdict: "no_sop"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_skill_feishu-feishu-outcome.json", selectedSkillOutcome({
      id: "skill_usage_feishu_new",
      session_id: "session_skill_feishu",
      skill_name: "feishu-outcome",
      instructions_ref: "vault/skills/feishu-outcome/SKILL.md",
      context_ref: "memory/episodes/session_skill_feishu-context.md",
      context_manifest_ref: "memory/episodes/session_skill_feishu-context.json",
      completion_report_ref: "memory/episodes/session_skill_feishu-completion-verification.json",
      final_response_ref: "memory/episodes/session_skill_feishu-final-response.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      registry_update: {
        ok: true,
        use_count: 7,
        last_used_at: "2026-06-30T00:02:00.000Z"
      },
      created_at: "2026-06-30T00:02:00.000Z"
    }));
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_outcomes",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill outcomes"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_outcome_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill outcome skill_usage_feishu_new"
    }));

    const combined = transport.sent.map((item) => item.text).join("\n");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Selected skill outcomes/);
    assert.match(transport.sent[0].text, /1\. skill_usage_feishu_new/);
    assert.match(transport.sent[0].text, /skill: feishu-outcome/);
    assert.match(transport.sent[0].text, /verification_status: failed/);
    assert.match(transport.sent[0].text, /memory\/skills\/usage\/session_skill_feishu-feishu-outcome\.json/);
    assert.match(transport.sent[1].text, /Selected skill outcome/);
    assert.match(transport.sent[1].text, /id: skill_usage_feishu_new/);
    assert.match(transport.sent[1].text, /instructions_ref: vault\/skills\/feishu-outcome\/SKILL\.md/);
    assert.match(transport.sent[1].text, /context_manifest_ref: memory\/episodes\/session_skill_feishu-context\.json/);
    assert.match(transport.sent[1].text, /completion_report_ref: memory\/episodes\/session_skill_feishu-completion-verification\.json/);
    assert.match(transport.sent[1].text, /final_response_ref: memory\/episodes\/session_skill_feishu-final-response\.md/);
    assert.match(transport.sent[1].text, /registry_use_count: 7/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.doesNotMatch(combined, /RAW_FEISHU_OUTCOME_SKILL_BODY_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(combined, /RAW_FEISHU_OUTCOME_CONTEXT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(combined, /RAW_FEISHU_OUTCOME_FINAL_RESPONSE_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator skill catalog commands read skill metadata without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/feishu-catalog/SKILL.md", [
      "---",
      "name: feishu-catalog",
      "description: Use when Feishu should inspect bounded skill catalog metadata.",
      "---",
      "",
      "RAW_FEISHU_SKILL_CATALOG_BODY_SHOULD_NOT_BE_SENT"
    ].join("\n"));
    await fixture.store.writeRepoText("vault/registry/skills.jsonl", `${JSON.stringify({
      name: "feishu-catalog",
      description: "Use when Feishu should inspect bounded skill catalog metadata.",
      source: "personal",
      status: "active",
      instructions_ref: "vault/skills/feishu-catalog/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#feishu-catalog",
      origin_ref: "sop/drafts/sop_feishu_catalog.json",
      trust_level: "local",
      source_sop_ref: "sop/drafts/sop_feishu_catalog.json",
      references: ["sop/drafts/sop_feishu_catalog.json"],
      tool_requirements: ["read"],
      verification: "pnpm test",
      evidence_refs: ["memory/episodes/events.jsonl#feishu_catalog"],
      content_hash: "old-hash",
      version: 2,
      usage: {
        use_count: 4,
        last_used_at: "2026-06-30T00:02:00.000Z",
        patch_count: 1
      },
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:01:00.000Z"
    })}\n`);
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_catalog",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skills"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_catalog_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill feishu-catalog"
    }));

    const combined = transport.sent.map((item) => item.text).join("\n");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Skill catalog/);
    assert.match(transport.sent[0].text, /1\. feishu-catalog/);
    assert.match(transport.sent[0].text, /source: personal/);
    assert.match(transport.sent[0].text, /use_count: 4/);
    assert.match(transport.sent[0].text, /vault\/skills\/feishu-catalog\/SKILL\.md/);
    assert.match(transport.sent[1].text, /Skill catalog entry/);
    assert.match(transport.sent[1].text, /name: feishu-catalog/);
    assert.match(transport.sent[1].text, /source_sop_ref: sop\/drafts\/sop_feishu_catalog\.json/);
    assert.match(transport.sent[1].text, /last_used_at: 2026-06-30T00:02:00.000Z/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.doesNotMatch(combined, /RAW_FEISHU_SKILL_CATALOG_BODY_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator skill registry health commands inspect active-vault health without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/feishu-health/SKILL.md", [
      "---",
      "name: feishu-health",
      "description: Current Feishu registry health fixture.",
      "---",
      "",
      "RAW_FEISHU_HEALTH_SKILL_BODY_SHOULD_NOT_BE_SENT"
    ].join("\n"));
    await fixture.store.writeRepoText("vault/registry/skills.jsonl", `${JSON.stringify(skillRegistryEntry({
      name: "feishu-health",
      description: "Stale Feishu registry health fixture.",
      instructions_ref: "vault/skills/feishu-health/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#feishu-health",
      content_hash: "stale-hash"
    }))}\n`);
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_health",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill health"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_health_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill health feishu-health"
    }));

    const combined = transport.sent.map((item) => item.text).join("\n");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Skill registry health/);
    assert.match(transport.sent[0].text, /status: degraded/);
    assert.match(transport.sent[0].text, /skill_registry_health_metadata_drift_feishu_health/);
    assert.match(transport.sent[0].text, /kind: registry_metadata_drift/);
    assert.match(transport.sent[0].text, /sync: pnpm run runtime -- skills --action sync/);
    assert.match(transport.sent[1].text, /scope: feishu-health/);
    assert.match(transport.sent[1].text, /inspect: pnpm run runtime -- skills health --skill-name feishu-health/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.doesNotMatch(combined, /RAW_FEISHU_HEALTH_SKILL_BODY_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator skill registry health commands render orphan event retirement guidance", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/registry/skill-events.jsonl", `${JSON.stringify({
      id: "skill_event_feishu_orphan",
      kind: "validated",
      skill_name: "feishu-orphan-event",
      instructions_ref: "vault/skills/feishu-orphan-event/SKILL.md",
      source_sop_ref: null,
      audit_ref: null,
      evidence_refs: [],
      artifact_refs: [],
      summary: "Historical Feishu orphan event.",
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_health_orphan_event",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill health feishu-orphan-event"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Skill registry health/);
    assert.match(transport.sent[0].text, /kind: orphan_skill_event/);
    assert.match(transport.sent[0].text, /event_ref: vault\/registry\/skill-events\.jsonl#skill_event_feishu_orphan/);
    assert.match(transport.sent[0].text, /retire_event: pnpm run runtime -- skills retire-event --event/);
    assert.match(transport.sent[0].text, /This command is read-only/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator selected skill drift commands read grouped usage summaries without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/feishu-drift/SKILL.md", [
      "---",
      "name: feishu-drift",
      "description: Use when Feishu should inspect selected skill drift summaries.",
      "---",
      "",
      "RAW_FEISHU_DRIFT_SKILL_BODY_SHOULD_NOT_BE_SENT"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_drift_feishu_b-context.md", "RAW_FEISHU_DRIFT_CONTEXT_SHOULD_NOT_BE_SENT");
    await fixture.store.writeText("memory/episodes/session_drift_feishu_b-final-response.md", "RAW_FEISHU_DRIFT_FINAL_RESPONSE_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson("memory/skills/usage/session_drift_feishu_a-feishu-drift.json", selectedSkillOutcome({
      id: "skill_usage_feishu_drift_a",
      session_id: "session_drift_feishu_a",
      skill_name: "feishu-drift",
      instructions_ref: "vault/skills/feishu-drift/SKILL.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_drift_feishu_a-completion-verification.json",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_drift_feishu_b-feishu-drift.json", selectedSkillOutcome({
      id: "skill_usage_feishu_drift_b",
      session_id: "session_drift_feishu_b",
      skill_name: "feishu-drift",
      instructions_ref: "vault/skills/feishu-drift/SKILL.md",
      context_ref: "memory/episodes/session_drift_feishu_b-context.md",
      final_response_ref: "memory/episodes/session_drift_feishu_b-final-response.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_drift_feishu_b-completion-verification.json",
      registry_update: {
        ok: true,
        use_count: 8,
        last_used_at: "2026-06-30T00:03:00.000Z"
      },
      created_at: "2026-06-30T00:03:00.000Z"
    }));
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_drifts",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill drifts"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_drift_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill drift feishu-drift"
    }));

    const combined = transport.sent.map((item) => item.text).join("\n");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Selected skill drifts/);
    assert.match(transport.sent[0].text, /1\. selected_skill_drift_feishu-drift/);
    assert.match(transport.sent[0].text, /skill: feishu-drift/);
    assert.match(transport.sent[0].text, /attention_count: 2/);
    assert.match(transport.sent[1].text, /Selected skill drift/);
    assert.match(transport.sent[1].text, /id: selected_skill_drift_feishu-drift/);
    assert.match(transport.sent[1].text, /instructions_ref: vault\/skills\/feishu-drift\/SKILL\.md/);
    assert.match(transport.sent[1].text, /attention_count: 2/);
    assert.match(transport.sent[1].text, /failed_count: 2/);
    assert.match(transport.sent[1].text, /latest_attention_outcome_ref: memory\/skills\/usage\/session_drift_feishu_b-feishu-drift\.json/);
    assert.match(transport.sent[1].text, /latest_completion_report_ref: memory\/episodes\/session_drift_feishu_b-completion-verification\.json/);
    assert.match(transport.sent[1].text, /use_count: 8/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.doesNotMatch(combined, /RAW_FEISHU_DRIFT_SKILL_BODY_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(combined, /RAW_FEISHU_DRIFT_CONTEXT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(combined, /RAW_FEISHU_DRIFT_FINAL_RESPONSE_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator skill registry event commands read active-vault event history without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/feishu-skill-event/SKILL.md", [
      "---",
      "name: feishu-skill-event",
      "description: Use when Feishu should inspect skill registry event history.",
      "---",
      "",
      "RAW_FEISHU_SKILL_EVENT_BODY_SHOULD_NOT_BE_SENT"
    ].join("\n"));
    await fixture.store.appendRepoJsonl("vault/registry/skill-events.jsonl", {
      id: "skill_event_feishu_old",
      kind: "promoted",
      skill_name: "feishu-skill-event",
      instructions_ref: "vault/skills/feishu-skill-event/SKILL.md",
      source_sop_ref: "sop/drafts/sop_feishu_old.json",
      audit_ref: "governance/audits/audit_feishu_old.json",
      evidence_refs: ["memory/episodes/events.jsonl#evidence_old"],
      artifact_refs: ["vault/skills/feishu-skill-event/SKILL.md"],
      summary: "Older Feishu skill registry event.",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.appendRepoJsonl("vault/registry/skill-events.jsonl", {
      id: "skill_event_feishu_new",
      kind: "validated",
      skill_name: "feishu-skill-event",
      instructions_ref: "vault/skills/feishu-skill-event/SKILL.md",
      source_sop_ref: null,
      audit_ref: null,
      evidence_refs: ["memory/skills/usage/session_feishu-skill-event.json"],
      artifact_refs: ["vault/skills/feishu-skill-event/SKILL.md"],
      summary: "Validated Feishu selected-skill drift without changing the skill body.",
      created_at: "2026-06-30T00:01:00.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_events",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill events"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_skill_event_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/skill event skill_event_feishu_new"
    }));

    const combined = transport.sent.map((item) => item.text).join("\n");
    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Skill registry events/);
    assert.match(transport.sent[0].text, /1\. skill_event_feishu_new/);
    assert.match(transport.sent[0].text, /kind: validated/);
    assert.match(transport.sent[0].text, /skill: feishu-skill-event/);
    assert.match(transport.sent[0].text, /vault\/registry\/skill-events\.jsonl#skill_event_feishu_new/);
    assert.match(transport.sent[1].text, /Skill registry event/);
    assert.match(transport.sent[1].text, /id: skill_event_feishu_new/);
    assert.match(transport.sent[1].text, /instructions_ref: vault\/skills\/feishu-skill-event\/SKILL\.md/);
    assert.match(transport.sent[1].text, /evidence_refs: memory\/skills\/usage\/session_feishu-skill-event\.json/);
    assert.match(transport.sent[1].text, /Validated Feishu selected-skill drift/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.doesNotMatch(combined, /RAW_FEISHU_SKILL_EVENT_BODY_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator evolution command replies with SOP evolution ledger without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("sop/drafts/sop_operator.json", {
      id: "sop_operator",
      title: "Expose SOP evolution to Feishu",
      trigger: "Use when an operator needs a compact read-only view of SOP and skill evolution.",
      procedure: ["Read state SOP drafts.", "Read audit and follow-up summaries.", "Render a bounded ledger."],
      required_tools: ["governance.evolution"],
      verification: "Feishu returns a bounded ledger without invoking the agent runner.",
      failure_modes: ["If raw skill content is needed, inspect it explicitly outside this read model."],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "audited"
    });
    await fixture.store.writeJson("governance/audits/audit_operator.json", {
      id: "audit_operator",
      target_type: "sop",
      target_ref: "sop_operator",
      verdict: "promote",
      reason: "Operator visibility is useful and bounded.",
      checks: {
        evidence: "pass",
        trigger_clarity: "pass",
        verification: "pass",
        failure_modes: "pass",
        rollback_or_retirement: "pass",
        seed_policy: "pass"
      },
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_operator.json", {
      id: "follow_up_confirmation_operator",
      status: "executed",
      created_at: "2026-06-30T00:01:00.000Z",
      executed_at: "2026-06-30T00:02:00.000Z",
      review_ref: "autonomy/reviews/background_review_operator.json",
      proposal_id: "review_proposal_operator",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_promote_operator",
        kind: "promote_sop",
        title: "Promote Feishu evolution operator SOP",
        required_refs: ["sop/drafts/sop_operator.json", "governance/audits/audit_operator.json"],
        would_write: ["active_vault"]
      },
      required_refs: ["sop/drafts/sop_operator.json", "governance/audits/audit_operator.json"],
      would_write: ["active_vault"],
      safety_boundary: ["RAW_BOUNDARY_SHOULD_NOT_BE_SENT"],
      next_step: "Already executed.",
      execution_result: {
        kind: "promote_sop",
        status: "promoted",
        sop_ref: "sop/drafts/sop_operator.json",
        audit_ref: "governance/audits/audit_operator.json",
        skill_name: "feishu-evolution-ledger",
        skill_ref: "vault/skills/feishu-evolution-ledger/SKILL.md",
        candidate_ref: null,
        registry_ref: "vault/registry/skills.jsonl",
        event_ref: "vault/registry/skill-events.jsonl#skill_event_operator",
        duplicate_skill_ref: null,
        evidence_event_id: "evidence_operator"
      }
    });
    await fixture.store.writeRepoText("vault/skills/feishu-evolution-ledger/SKILL.md", "RAW_SKILL_CONTENT_SHOULD_NOT_BE_SENT");
    await fixture.store.appendRepoJsonl("vault/registry/skill-events.jsonl", {
      id: "skill_event_operator",
      kind: "promoted",
      skill_name: "feishu-evolution-ledger",
      instructions_ref: "vault/skills/feishu-evolution-ledger/SKILL.md",
      source_sop_ref: "sop/drafts/sop_operator.json",
      audit_ref: "governance/audits/audit_operator.json",
      evidence_refs: ["memory/episodes/events.jsonl#evidence_operator"],
      artifact_refs: ["sop/drafts/sop_operator.json", "governance/audits/audit_operator.json"],
      summary: "Promoted Feishu SOP evolution ledger skill.",
      created_at: "2026-06-30T00:03:00.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_evolution",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance evolution"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /SOP Evolution Ledger/);
    assert.match(transport.sent[0].text, /sop_operator/);
    assert.match(transport.sent[0].text, /promoted/);
    assert.match(transport.sent[0].text, /skill_event_operator/);
    assert.match(transport.sent[0].text, /This command is read-only/);
    assert.doesNotMatch(transport.sent[0].text, /RAW_SKILL_CONTENT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(transport.sent[0].text, /RAW_BOUNDARY_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator review coverage command reads reused skill coverage without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("sop/drafts/sop_feishu_coverage.json", {
      id: "sop_feishu_coverage",
      title: "Review reused skill coverage from Feishu",
      trigger: "Use when a Feishu operator needs reused skill coverage before changing SOPs.",
      procedure: [
        "Open the reused skill coverage report.",
        "Compare the recorded duplicate skill ref with current recall.",
        "Keep reuse unless the current registry has drifted."
      ],
      required_tools: ["review.coverage"],
      verification: "The coverage report shows the current duplicate skill still matches the recorded duplicate ref.",
      failure_modes: ["Do not execute revise_skill when the recorded duplicate skill is missing."],
      evidence_refs: [],
      status: "audited",
      revision: 1,
      created_at: "2026-06-29T00:00:00.000Z",
      updated_at: "2026-06-29T00:00:00.000Z"
    });
    await fixture.store.writeRepoText("vault/skills/feishu-reused-skill-coverage/SKILL.md", [
      "---",
      "name: feishu-reused-skill-coverage",
      "description: Use when a Feishu operator needs reused skill coverage before changing SOPs.",
      "---",
      "",
      "RAW_SKILL_CONTENT_SHOULD_NOT_BE_SENT"
    ].join("\n"));
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_feishu_coverage",
      session_id: "sop_feishu_coverage",
      turn_id: "audit_feishu_coverage",
      kind: "report",
      summary: "Skipped explicit SOP promotion because recalled skill already covers this SOP: feishu-reused-skill-coverage.",
      artifact_refs: [
        "sop/drafts/sop_feishu_coverage.json",
        "vault/skills/feishu-reused-skill-coverage/SKILL.md"
      ],
      created_at: "2026-06-29T00:00:01.000Z"
    });
    const runner = new StubRunner(fixture.store, "Final answer.");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_coverage",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review coverage sop_feishu_coverage"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Reused Skill Coverage/);
    assert.match(transport.sent[0].text, /coverage: covered/);
    assert.match(transport.sent[0].text, /vault\/skills\/feishu-reused-skill-coverage\/SKILL\.md/);
    assert.doesNotMatch(transport.sent[0].text, /RAW_SKILL_CONTENT_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator opportunities command renders pipeline resume guidance without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("pipelines/pipeline_operator_resume/artifacts/verify.md", "RAW_OPERATOR_PIPELINE_OUTPUT_SHOULD_NOT_BE_SENT");
    await fixture.store.writeText("pipelines/pipeline_operator_resume/responses/verify-model-response-r1.json", "RAW_OPERATOR_PIPELINE_MODEL_RESPONSE_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson("pipelines/pipeline_operator_resume/pipeline.json", {
      id: "pipeline_operator_resume",
      task: "Use StageRunner to verify Feishu pipeline resume visibility.",
      source: "builtin",
      stages: [{
        id: "verify",
        title: "Verify",
        objective: "Verify pipeline resume visibility.",
        input_refs: [],
        expected_outputs: ["verify.md"],
        allowed_tools: ["repo.search"],
        max_model_rounds: 1,
        max_tool_calls: 1,
        timeout_ms: 120000,
        acceptance_checks: ["Resume command is visible."],
        on_failure: "block",
        side_effect_level: "local_write",
        optional: false
      }],
      side_effect_ceiling: "local_write",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("pipelines/pipeline_operator_resume/stages/verify.json", {
      id: "stage_run_pipeline_operator_resume_verify",
      pipeline_id: "pipeline_operator_resume",
      stage_id: "verify",
      status: "blocked",
      attempt: 1,
      evidence_refs: ["evidence_pipeline_operator_resume_verify"],
      output_refs: ["pipelines/pipeline_operator_resume/artifacts/verify.md"],
      model_response_refs: ["pipelines/pipeline_operator_resume/responses/verify-model-response-r1.json"],
      envelope_refs: ["pipelines/pipeline_operator_resume/responses/verify-model-action-r1.json"],
      failure_kind: "stage_incomplete",
      failure_message: "Verification did not satisfy completion checks.",
      started_at: "2026-06-30T00:00:12.000Z",
      completed_at: "2026-06-30T00:00:13.000Z"
    });
    await fixture.store.writeJson("pipelines/pipeline_operator_resume/checkpoint.json", {
      run_id: "pipeline_run_operator_resume",
      pipeline_id: "pipeline_operator_resume",
      status: "blocked",
      blocked_stage_id: "verify",
      stage_run_refs: ["pipelines/pipeline_operator_resume/stages/verify.json"],
      evidence_refs: ["evidence_pipeline_operator_resume_verify"],
      final_response_ref: "pipelines/pipeline_operator_resume/artifacts/verify.md",
      updated_at: "2026-06-30T00:00:14.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_opportunities_pipeline_resume",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance opportunities"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    const text = transport.sent[0].text;
    assert.match(text, /pipeline_run_operator_resume/);
    assert.match(text, /pipeline_run: blocked/);
    assert.match(text, /pipeline_inspect: pnpm run runtime -- pipeline runs --pipeline pipeline_run_operator_resume --state-root <state-root>/);
    assert.match(text, /pipeline_resume: pnpm run runtime -- pipeline resume --pipeline pipeline_run_operator_resume --from-stage verify --state-root <state-root>/);
    assert.match(text, /This command is read-only/);
    assert.doesNotMatch(text, /RAW_OPERATOR_PIPELINE_OUTPUT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(text, /RAW_OPERATOR_PIPELINE_MODEL_RESPONSE_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator opportunities command renders repo write guard attention without raw artifacts", async () => {
  const fixture = await createFixture();
  try {
    const sessionId = "session_feishu_repo_guard";
    const turnId = "turn_feishu_repo_guard";
    await fixture.store.writeText(
      `memory/episodes/${sessionId}-tool_result_write.json`,
      "RAW_FEISHU_REPO_WRITE_TOOL_RESULT_SHOULD_NOT_BE_SENT"
    );
    await fixture.store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, completionVerificationRecord({
      id: "completion_verification_feishu_repo_guard",
      session_id: sessionId,
      turn_id: turnId,
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Completion verification passed after a repo write.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r1.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      observation_refs: [`memory/episodes/${sessionId}-tool_result_write.json`],
      checks: [{
        id: "write_run_tool_results",
        status: "pass",
        summary: "Repo write tool result succeeded.",
        refs: ["tool_result_write"]
      }],
      created_at: "2026-06-30T00:43:00.000Z"
    }));
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_feishu_repo_guard",
      session_id: sessionId,
      turn_id: turnId,
      kind: "tool_result",
      summary: "Wrote repo:docs/feishu-dirty-write.md (72 bytes). workspace_guard: before=dirty after=dirty changed_files=5->6 delta=1 preexisting_dirty=true target_changed=true.",
      artifact_refs: [`memory/episodes/${sessionId}-tool_result_write.json`],
      created_at: "2026-06-30T00:42:00.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_opportunities_repo_guard",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/governance opportunities"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    const text = transport.sent[0].text;
    assert.match(text, /repo_write_guard: repo_write_guard_completion_verification_feishu_repo_guard_evidence_feishu_repo_guard/);
    assert.match(text, /repo_write_guard: docs\/feishu-dirty-write\.md/);
    assert.match(text, /repo_write_guard_status: before=dirty after=dirty/);
    assert.match(text, /repo_write_guard_changed_files: 5->6 delta=1/);
    assert.match(text, /repo_write_guard_preexisting_dirty: true/);
    assert.match(text, /repo_write_guard_target_changed: true/);
    assert.match(text, /repo_write_guard_inspect: pnpm run runtime -- review traces --trace completion_verification_feishu_repo_guard --state-root <state-root>/);
    assert.match(text, /This command is read-only/);
    assert.doesNotMatch(text, /RAW_FEISHU_REPO_WRITE_TOOL_RESULT_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator context commands read manifest sidecars without running the agent", async () => {
  const fixture = await createFixture();
  const configFixture = await createConfigFixture();
  try {
    await fixture.store.writeJson("memory/episodes/session_old-context.json", contextManifest({
      sessionId: "session_old",
      turnId: "turn_old",
      createdAt: "2026-06-29T00:00:00.000Z",
      totalChars: 1200,
      memoryHitCount: 0,
      skillRefCount: 0,
      disciplineActive: false
    }));
    await fixture.store.writeJson("memory/episodes/session_new-context.json", contextManifest({
      sessionId: "session_new",
      turnId: "turn_new",
      createdAt: "2026-06-29T00:01:00.000Z",
      totalChars: 2200,
      memoryHitCount: 2,
      skillRefCount: 1,
      disciplineActive: true
    }));
    await fixture.store.writeJson("memory/episodes/session_pressure-context.json", contextManifest({
      sessionId: "session_pressure",
      turnId: "turn_pressure",
      createdAt: "2026-06-29T00:02:00.000Z",
      totalChars: 95_000,
      memoryHitCount: 8,
      skillRefCount: 1,
      disciplineActive: false
    }));
    await fixture.store.writeJson("memory/episodes/session_missing-context.json", contextManifest({
      sessionId: "session_missing",
      turnId: "turn_missing",
      createdAt: "2026-06-29T00:03:00.000Z",
      totalChars: 1800,
      memoryHitCount: 1,
      skillRefCount: 1,
      disciplineActive: true
    }));
    await fixture.store.writeText("memory/episodes/session_new-context.md", "RAW_CONTEXT_SHOULD_NOT_APPEAR");
    await fixture.store.writeText("memory/episodes/session_pressure-context.md", "RAW_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR");
    await fixture.store.writeText("memory/episodes/session_orphan-context.md", "RAW_ORPHAN_CONTEXT_SHOULD_NOT_APPEAR");
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store,
      configDir: configFixture.configDir
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_context_list",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/context"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_context_show_id",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/context session_new"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_context_show_ref",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/context show memory/episodes/session_old-context.md"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_context_pressure",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/context pressure"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_context_usage",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/context usage"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_context_usage_alias",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/usage"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_context_health",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/context health"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_context_health_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/context health memory/episodes/session_orphan-context.md"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 8);
    assert.match(transport.sent[0].text, /Context manifests/);
    assert.match(transport.sent[0].text, /session_new/);
    assert.match(transport.sent[0].text, /memory_hits: 2/);
    assert.match(transport.sent[0].text, /opportunity_refs: 0/);
    assert.match(transport.sent[0].text, /This command is read-only/);
    assert.match(transport.sent[1].text, /Context manifest/);
    assert.match(transport.sent[1].text, /session: session_new/);
    assert.match(transport.sent[1].text, /opportunity_refs: 0/);
    assert.match(transport.sent[1].text, /Stable Core/);
    assert.match(transport.sent[1].text, /memory\/episodes\/prior\.json/);
    assert.match(transport.sent[1].text, /does not read raw context Markdown/);
    assert.doesNotMatch(transport.sent[1].text, /RAW_CONTEXT_SHOULD_NOT_APPEAR/);
    assert.match(transport.sent[2].text, /session: session_old/);
    assert.match(transport.sent[3].text, /Context pressure/);
    assert.match(transport.sent[3].text, /context_pressure_session_pressure/);
    assert.match(transport.sent[3].text, /status: over_budget/);
    assert.match(transport.sent[3].text, /mitigation: rebalance_context_sections/);
    assert.match(transport.sent[3].text, /guidance_defer: pnpm run runtime -- governance decide-opportunity --opportunity context_pressure_session_pressure --status deferred --reason "\.\.\." --state-root <state-root>/);
    assert.match(transport.sent[3].text, /future_gate: explicit_cli_command_required/);
    assert.doesNotMatch(transport.sent[3].text, /RAW_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR/);
    assert.match(transport.sent[4].text, /Context usage/);
    assert.match(transport.sent[4].text, /model_context_window_tokens: 20000/);
    assert.match(transport.sent[4].text, /model_input_budget_tokens: 17600/);
    assert.match(transport.sent[4].text, /manifests: 4\/4/);
    assert.match(transport.sent[4].text, /status_counts:/);
    assert.match(transport.sent[4].text, /Recent manifests:/);
    assert.match(transport.sent[4].text, /session_pressure/);
    assert.match(transport.sent[4].text, /Boundary: read-only context usage diagnostics/);
    assert.doesNotMatch(transport.sent[4].text, /RAW_CONTEXT_SHOULD_NOT_APPEAR|RAW_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR/);
    assert.match(transport.sent[5].text, /Context usage/);
    assert.match(transport.sent[5].text, /model_context_window_tokens: 20000/);
    assert.match(transport.sent[5].text, /manifests: 4\/4/);
    assert.doesNotMatch(transport.sent[5].text, /RAW_CONTEXT_SHOULD_NOT_APPEAR|RAW_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR/);
    assert.match(transport.sent[6].text, /Context health/);
    assert.match(transport.sent[6].text, /status: unhealthy/);
    assert.match(transport.sent[6].text, /missing_context_markdown/);
    assert.match(transport.sent[6].text, /orphan_context_markdown/);
    assert.match(transport.sent[6].text, /This command is read-only/);
    assert.doesNotMatch(transport.sent[6].text, /RAW_ORPHAN_CONTEXT_SHOULD_NOT_APPEAR/);
    assert.match(transport.sent[7].text, /Context health/);
    assert.match(transport.sent[7].text, /selection: memory\/episodes\/session_orphan-context\.md/);
    assert.match(transport.sent[7].text, /orphan_context_markdown/);
    assert.match(transport.sent[7].text, /resolution: restore_or_retire_manifest_sidecar/);
    assert.match(transport.sent[7].text, /repair_manifest: pnpm run runtime -- context repair --context memory\/episodes\/session_orphan-context\.md/);
    assert.match(transport.sent[7].text, /complete_after_external_repair:/);
    assert.match(transport.sent[7].text, /retire_historical:/);
    assert.doesNotMatch(transport.sent[7].text, /missing_context_markdown/);
    assert.doesNotMatch(transport.sent[7].text, /RAW_ORPHAN_CONTEXT_SHOULD_NOT_APPEAR/);
  } finally {
    await configFixture.cleanup();
    await fixture.cleanup();
  }
});

test("operator working checkpoint commands read bounded checkpoints without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/working/current.json", {
      goal: "Continue Feishu-visible harness progress.",
      current_step: "verify working checkpoint operator command",
      known_constraints: ["Do not send raw evidence artifacts."],
      recent_evidence_refs: ["memory/episodes/raw-working-feishu.md"],
      open_questions: ["Should this checkpoint become a review inbox item?"],
      next_action: "Inspect the checkpoint before resuming.",
      created_at: "2026-06-30T00:05:00.000Z"
    });
    await fixture.store.writeText("memory/episodes/raw-working-feishu.md", "RAW_WORKING_FEISHU_EVIDENCE_SHOULD_NOT_APPEAR");
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_working_feishu",
      session_id: "session_working_feishu",
      turn_id: "turn_working_feishu",
      kind: "report",
      summary: "Recorded model working checkpoint: verify working checkpoint operator command",
      artifact_refs: [
        "memory/working/current.json",
        "memory/episodes/raw-working-feishu.md"
      ],
      created_at: "2026-06-30T00:05:01.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_working_list",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/working"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_working_show",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/working current"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Working checkpoints/);
    assert.match(transport.sent[0].text, /current/);
    assert.match(transport.sent[0].text, /verify working checkpoint operator command/);
    assert.match(transport.sent[0].text, /memory\/episodes\/events\.jsonl#evidence_working_feishu/);
    assert.match(transport.sent[1].text, /Working checkpoint/);
    assert.match(transport.sent[1].text, /Known constraints/);
    assert.match(transport.sent[1].text, /Open questions/);
    assert.match(transport.sent[1].text, /does not read raw evidence artifacts/);
    assert.doesNotMatch(transport.sent.map((item) => item.text).join("\n"), /RAW_WORKING_FEISHU_EVIDENCE_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator pipeline commands read bounded history without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("pipelines/pipeline_feishu/artifacts/intake.md", "RAW_PIPELINE_OUTPUT_SHOULD_NOT_BE_SENT");
    await fixture.store.writeText("pipelines/pipeline_feishu/responses/intake-model-response-r1.json", "RAW_PIPELINE_MODEL_RESPONSE_SHOULD_NOT_BE_SENT");
    await fixture.store.writeJson("pipelines/pipeline_feishu/pipeline.json", {
      id: "pipeline_feishu",
      task: "Use StageRunner to inspect Feishu operator context.",
      source: "builtin",
      stages: [{
        id: "intake",
        title: "Intake",
        objective: "Normalize the operator request.",
        input_refs: [],
        expected_outputs: ["accepted-goal.md"],
        allowed_tools: ["file.read"],
        max_model_rounds: 1,
        max_tool_calls: 1,
        timeout_ms: 120000,
        acceptance_checks: ["Accepted goal exists."],
        on_failure: "block",
        side_effect_level: "local_write",
        optional: false
      }],
      side_effect_ceiling: "local_write",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("pipelines/pipeline_feishu/stages/intake.json", {
      id: "stage_run_pipeline_feishu_intake",
      pipeline_id: "pipeline_feishu",
      stage_id: "intake",
      status: "done",
      attempt: 1,
      evidence_refs: ["evidence_pipeline_feishu_intake"],
      output_refs: ["pipelines/pipeline_feishu/artifacts/intake.md"],
      model_response_refs: ["pipelines/pipeline_feishu/responses/intake-model-response-r1.json"],
      envelope_refs: ["pipelines/pipeline_feishu/responses/intake-model-action-r1.json"],
      failure_kind: null,
      failure_message: null,
      started_at: "2026-06-30T00:00:01.000Z",
      completed_at: "2026-06-30T00:00:02.000Z"
    });
    await fixture.store.writeJson("pipelines/pipeline_feishu/checkpoint.json", {
      run_id: "pipeline_run_feishu",
      pipeline_id: "pipeline_feishu",
      status: "done",
      blocked_stage_id: null,
      stage_run_refs: ["pipelines/pipeline_feishu/stages/intake.json"],
      evidence_refs: ["evidence_pipeline_feishu_intake"],
      final_response_ref: "pipelines/pipeline_feishu/artifacts/intake.md",
      updated_at: "2026-06-30T00:00:03.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_pipeline_runs",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/pipeline runs"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_pipeline_run_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/pipeline run pipeline_run_feishu"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Pipeline runs/);
    assert.match(transport.sent[0].text, /pipeline_run_feishu/);
    assert.match(transport.sent[0].text, /pipelines\/pipeline_feishu\/pipeline\.json/);
    assert.match(transport.sent[1].text, /Pipeline run/);
    assert.match(transport.sent[1].text, /id: pipeline_run_feishu/);
    assert.match(transport.sent[1].text, /stage_run_pipeline_feishu_intake/);
    assert.match(transport.sent[1].text, /This command is read-only/);
    assert.doesNotMatch(transport.sent.map((item) => item.text).join("\n"), /RAW_PIPELINE_OUTPUT_SHOULD_NOT_BE_SENT/);
    assert.doesNotMatch(transport.sent.map((item) => item.text).join("\n"), /RAW_PIPELINE_MODEL_RESPONSE_SHOULD_NOT_BE_SENT/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator episode memory commands scan local JSONL without running the agent or rebuilding the index", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_memory_a",
      session_id: "session_replay",
      turn_id: "turn_1",
      kind: "report",
      summary: "Feishu heartbeat restart evidence should be searchable.",
      artifact_refs: ["memory/episodes/session_replay-raw.md"],
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_memory_other",
      session_id: "session_other",
      turn_id: "turn_other",
      kind: "report",
      summary: "Other session should not appear in the selected session replay.",
      artifact_refs: ["memory/episodes/session_other-raw.md"],
      created_at: "2026-06-30T00:01:00.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_memory_b",
      session_id: "session_replay",
      turn_id: "turn_2",
      kind: "report",
      summary: "Second Feishu restart event.",
      artifact_refs: ["memory/episodes/session_replay-final.md"],
      created_at: "2026-06-30T00:02:00.000Z"
    });
    await fixture.store.writeText("memory/episodes/session_replay-raw.md", "RAW_EPISODE_DETAIL_SHOULD_NOT_APPEAR");
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_search",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory search Feishu heartbeat restart"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_session",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory session session_replay"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Episode memory search/);
    assert.match(transport.sent[0].text, /evidence_memory_a/);
    assert.match(transport.sent[0].text, /Feishu heartbeat restart evidence/);
    assert.doesNotMatch(transport.sent[0].text, /RAW_EPISODE_DETAIL_SHOULD_NOT_APPEAR/);
    assert.match(transport.sent[1].text, /Episode memory session/);
    assert.match(transport.sent[1].text, /session: session_replay/);
    assert.match(transport.sent[1].text, /evidence_memory_a/);
    assert.match(transport.sent[1].text, /evidence_memory_b/);
    assert.doesNotMatch(transport.sent[1].text, /evidence_memory_other/);
    assert.doesNotMatch(transport.sent[1].text, /RAW_EPISODE_DETAIL_SHOULD_NOT_APPEAR/);
    assert.equal(existsSync(join(fixture.stateRoot, "memory/index/episodes.sqlite")), false);
  } finally {
    await fixture.cleanup();
  }
});

test("operator episode archive commands read archive summaries without running the agent or raw artifacts", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("memory/episodes/archive-raw.md", "RAW_ARCHIVE_DETAIL_SHOULD_NOT_APPEAR");
    await fixture.store.writeJson("memory/archives/2026-06-30.json", {
      version: 1,
      date: "2026-06-30",
      source_ref: "memory/episodes/events.jsonl",
      archive_ref: "memory/archives/2026-06-30.json",
      markdown_ref: "memory/archives/2026-06-30.md",
      created_at: "2026-06-30T01:00:00.000Z",
      event_count: 2,
      session_count: 1,
      kind_counts: { report: 2 },
      first_event_at: "2026-06-30T00:00:00.000Z",
      last_event_at: "2026-06-30T00:05:00.000Z",
      sessions: [{
        session_id: "session_archive",
        event_count: 2,
        kind_counts: { report: 2 },
        first_event_at: "2026-06-30T00:00:00.000Z",
        last_event_at: "2026-06-30T00:05:00.000Z",
        summaries: ["Daily archive operator view should stay bounded."],
        artifact_refs: ["memory/episodes/archive-raw.md"]
      }],
      recent_events: [{
        id: "evidence_archive_recent",
        session_id: "session_archive",
        turn_id: "turn_archive",
        kind: "report",
        summary: "Daily archive summary is visible without raw artifact content.",
        artifact_refs: ["memory/episodes/archive-raw.md"],
        created_at: "2026-06-30T00:05:00.000Z"
      }]
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_archives",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory archives"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_archive_no_arg",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory archive"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_archive_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory archive 2026-06-30"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 3);
    assert.match(transport.sent[0].text, /Episode archives/);
    assert.match(transport.sent[0].text, /2026-06-30/);
    assert.match(transport.sent[0].text, /evidence_archive_recent/);
    assert.match(transport.sent[0].text, /This command is read-only/);
    assert.match(transport.sent[1].text, /Episode archives/);
    assert.match(transport.sent[2].text, /Episode archive/);
    assert.match(transport.sent[2].text, /session_archive/);
    assert.match(transport.sent[2].text, /Daily archive summary is visible/);
    assert.match(transport.sent[2].text, /does not write archives/);
    assert.doesNotMatch(transport.sent[2].text, /RAW_ARCHIVE_DETAIL_SHOULD_NOT_APPEAR/);
    assert.equal(existsSync(join(fixture.stateRoot, "memory/index/episodes.sqlite")), false);
  } finally {
    await fixture.cleanup();
  }
});

test("operator archive health commands diagnose archive freshness without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("memory/episodes/archive-health-raw.md", "RAW_ARCHIVE_HEALTH_DETAIL_SHOULD_NOT_APPEAR");
    await fixture.store.writeText("memory/episodes/events.jsonl", `${JSON.stringify({
      id: "event_archive_health_missing",
      session_id: "session_archive_health",
      turn_id: "turn_archive_health",
      kind: "report",
      summary: "Archive health should detect the missing daily summary.",
      artifact_refs: ["memory/episodes/archive-health-raw.md"],
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_archive_health",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory archive health"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_archive_health_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory archive health 2026-06-30"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Episode archive health/);
    assert.match(transport.sent[0].text, /archive_health_missing_2026_06_30/);
    assert.match(transport.sent[0].text, /This command is read-only/);
    assert.match(transport.sent[1].text, /Episode archive health/);
    assert.match(transport.sent[1].text, /memory archive-health --archive 2026-06-30/);
    assert.match(transport.sent[1].text, /memory archive --state-root/);
    assert.doesNotMatch(transport.sent[1].text, /RAW_ARCHIVE_HEALTH_DETAIL_SHOULD_NOT_APPEAR/);
    assert.equal(existsSync(join(fixture.stateRoot, "memory/index/episodes.sqlite")), false);
  } finally {
    await fixture.cleanup();
  }
});

test("operator review inbox command lists active items without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("autonomy/reviews/background_review_2.json", "RAW_REVIEW_DETAIL_SHOULD_NOT_APPEAR");
    await fixture.store.writeJson("autonomy/inbox/review_inbox_open.json", reviewInboxItem({
      id: "review_inbox_open",
      status: "open",
      title: "Draft local SOP candidate",
      focus_action_chain: [{
        label: "inspect",
        effect: "read_only",
        reason: "Inspect the bounded proposal refs before requesting a gate."
      }, {
        label: "request_confirmation",
        effect: "state_decision",
        reason: "Ask the operator before mutating review follow-up state."
      }]
    }));
    await fixture.store.writeJson("autonomy/inbox/review_inbox_open_dup.json", reviewInboxItem({
      id: "review_inbox_open_dup",
      status: "open",
      title: "Draft local SOP candidate"
    }));
    await fixture.store.writeJson("autonomy/inbox/review_inbox_deferred.json", reviewInboxItem({
      id: "review_inbox_deferred",
      status: "open",
      title: "Deferred SOP candidate"
    }));
    await fixture.store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_deferred",
      item_id: "review_inbox_deferred",
      item_ref: "autonomy/inbox/review_inbox_deferred.json",
      action_kind: "draft_sop",
      status: "deferred",
      previous_status: "open",
      reason: "Needs operator inspection first.",
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_executed.json", reviewInboxItem({
      id: "review_inbox_executed",
      status: "executed",
      title: "Executed old SOP candidate"
    }));
    await fixture.store.writeJson("autonomy/inbox/review_inbox_pending.json", {
      ...reviewInboxItem({
        id: "review_inbox_pending",
        status: "confirmation_requested",
        title: "Pending SOP candidate"
      }),
      confirmation_ref: "autonomy/followups/follow_up_confirmation_pending.json"
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_revise_skill.json", {
      ...reviewInboxItem({
        id: "review_inbox_revise_skill",
        status: "open",
        title: "Validate reused skill coverage"
      }),
      proposal_type: "skill_revision",
      action_id: "follow_up_action_revise_skill_1",
      action_kind: "revise_skill",
      rationale: "Confirm the duplicate skill still covers the SOP before changing metadata.",
      required_refs: [
        "sop/drafts/sop_reuse.json",
        "vault/skills/reuse-existing-skill/SKILL.md"
      ],
      would_write: ["active_vault"]
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_inbox",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review inbox"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].text, /Review inbox \(active\)/);
    assert.match(transport.sent[0].text, /Draft local SOP candidate/);
    assert.match(transport.sent[0].text, /focus_action_chain: inspect\[read_only\] -> request_confirmation\[state_decision\]/);
    assert.match(transport.sent[0].text, /duplicates: 1/);
    assert.doesNotMatch(transport.sent[0].text, /review_inbox_open_dup/);
    assert.match(transport.sent[0].text, /Deferred SOP candidate/);
    assert.match(transport.sent[0].text, /decision: deferred/);
    assert.doesNotMatch(transport.sent[0].text, /Executed old SOP candidate/);

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_inbox_all",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review inbox all"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.match(transport.sent[1].text, /Review inbox \(all\)/);
    assert.match(transport.sent[1].text, /Executed old SOP candidate/);

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_inbox_item",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review inbox review_inbox_open"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.match(transport.sent[2].text, /Review inbox item/);
    assert.match(transport.sent[2].text, /id: review_inbox_open/);
    assert.match(transport.sent[2].text, /focus_action_chain: inspect\[read_only\] -> request_confirmation\[state_decision\]/);
    assert.match(transport.sent[2].text, /Duplicate group:/);
    assert.match(transport.sent[2].text, /duplicate_count: 1/);
    assert.match(transport.sent[2].text, /review_inbox_open_dup\.json/);
    assert.match(transport.sent[2].text, /action: draft_sop \/ follow_up_action_draft_sop_1/);
    assert.match(transport.sent[2].text, /Required refs:/);
    assert.match(transport.sent[2].text, /autonomy\/reviews\/background_review_2\.json/);
    assert.match(transport.sent[2].text, /Confirmation gate:/);
    assert.match(transport.sent[2].text, /review request-inbox-confirmation --item review_inbox_open/);
    assert.match(transport.sent[2].text, /record_decision: pnpm run runtime -- review decide-inbox --item review_inbox_open --status deferred/);
    assert.match(transport.sent[2].text, /--state-root /);
    assert.match(transport.sent[2].text, /This command is read-only/);
    assert.doesNotMatch(transport.sent[2].text, /RAW_REVIEW_DETAIL_SHOULD_NOT_APPEAR/);

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_inbox_deferred",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review inbox review_inbox_deferred"
    }));

    assert.match(transport.sent[3].text, /Operator decision:/);
    assert.match(transport.sent[3].text, /status: deferred/);
    assert.match(transport.sent[3].text, /Needs operator inspection first/);
    assert.match(transport.sent[3].text, /blocked by latest operator decision: deferred/);
    assert.match(transport.sent[3].text, /review decide-inbox --item review_inbox_deferred --status open/);
    assert.doesNotMatch(transport.sent[3].text, /review request-inbox-confirmation --item review_inbox_deferred/);

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_inbox_pending",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review inbox review_inbox_pending"
    }));

    assert.match(transport.sent[4].text, /pending confirmation exists/);
    assert.match(transport.sent[4].text, /review confirmations --confirmation autonomy\/followups\/follow_up_confirmation_pending\.json/);
    assert.doesNotMatch(transport.sent[4].text, /review request-inbox-confirmation --item review_inbox_pending/);

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_inbox_executed_detail",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review inbox review_inbox_executed"
    }));

    assert.match(transport.sent[5].text, /already executed/);
    assert.doesNotMatch(transport.sent[5].text, /review request-inbox-confirmation --item review_inbox_executed/);

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_inbox_revise_skill",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review inbox review_inbox_revise_skill"
    }));

    assert.match(transport.sent[6].text, /action: revise_skill \/ follow_up_action_revise_skill_1/);
    assert.match(transport.sent[6].text, /review coverage --sop sop_reuse/);
    assert.match(transport.sent[6].text, /review request-inbox-confirmation --item review_inbox_revise_skill/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator review confirmation commands read local confirmations without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_a.json", {
      id: "follow_up_confirmation_a",
      created_at: "2026-06-30T00:00:00.000Z",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_a.json",
      proposal_id: "review_proposal_a",
      proposal_type: "sop_candidate",
      action_id: "follow_up_action_draft_sop_a",
      action_kind: "draft_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_draft_sop_a",
        kind: "draft_sop",
        title: "Draft a local SOP candidate",
        rationale: "Repeated failure evidence needs a state-only SOP draft.",
        command: "pnpm run runtime -- review execute-confirmed-follow-up --confirmation follow_up_confirmation_a",
        required_refs: ["autonomy/reviews/background_review_a.json"],
        would_write: ["state"]
      },
      required_refs: ["autonomy/reviews/background_review_a.json"],
      would_write: ["state"],
      safety_boundary: [
        "This request records operator intent only.",
        "A later explicit command must re-read this request before any mutation."
      ],
      draft_sop_readiness: {
        read_only: true,
        review_ref: "autonomy/reviews/background_review_a.json",
        proposal_id: "review_proposal_a",
        proposal_title: "Draft a local SOP candidate",
        proposal_type: "sop_candidate",
        status: "ready",
        failure_signal_count: 1,
        sop_signal_count: 2,
        evidence_ref_count: 3,
        required_ref_count: 1,
        existing_sop_refs: ["sop/drafts/sop_feishu_related.json"],
        existing_skill_refs: ["vault/skills/feishu-related-skill/SKILL.md"],
        next_step: "Inspect bounded refs before execution."
      },
      next_step: "Review, then execute through the CLI if still valid."
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_executed.json", {
      id: "follow_up_confirmation_executed",
      created_at: "2026-06-30T00:00:00.000Z",
      executed_at: "2026-06-30T00:02:00.000Z",
      status: "executed",
      review_ref: "autonomy/reviews/background_review_a.json",
      proposal_id: "review_proposal_a",
      proposal_type: "sop_candidate",
      action_id: "follow_up_action_draft_sop_a",
      action_kind: "draft_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_draft_sop_a",
        kind: "draft_sop",
        title: "Draft a local SOP candidate",
        rationale: "Repeated failure evidence needs a state-only SOP draft.",
        command: "pnpm run runtime -- review execute-confirmed-follow-up --confirmation follow_up_confirmation_executed",
        required_refs: ["autonomy/reviews/background_review_a.json"],
        would_write: ["state"]
      },
      required_refs: ["autonomy/reviews/background_review_a.json"],
      would_write: ["state"],
      safety_boundary: [
        "This request records operator intent only.",
        "A later explicit command must re-read this request before any mutation."
      ],
      next_step: "Already executed.",
      execution_result: {
        kind: "draft_sop",
        sop_ref: "autonomy/sops/sop_a.md",
        sop_json_ref: "autonomy/sops/sop_a.json",
        evidence_event_id: "evt_executed"
      }
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_sop.json", {
      id: "follow_up_confirmation_sop",
      created_at: "2026-06-30T00:03:00.000Z",
      status: "pending",
      source: "sop_evolution_chain",
      review_ref: "governance/evolution",
      proposal_id: "sop_feishu_gate",
      proposal_type: "sop_candidate",
      sop_id: "sop_feishu_gate",
      sop_ref: "sop/drafts/sop_feishu_gate.json",
      action_id: "follow_up_action_audit_sop_feishu_gate",
      action_kind: "audit_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_audit_sop_feishu_gate",
        kind: "audit_sop",
        title: "Audit Feishu-visible SOP gate",
        rationale: "The SOP evolution chain has a draft SOP but no audit evidence yet.",
        command: "pnpm run runtime -- review audit-sop --sop sop_feishu_gate",
        required_refs: ["sop/drafts/sop_feishu_gate.json"],
        would_write: ["state"]
      },
      required_refs: ["sop/drafts/sop_feishu_gate.json"],
      would_write: ["state"],
      safety_boundary: [
        "This request records operator intent only.",
        "A later explicit execute-confirmed-follow-up command must re-read this request and revalidate the current SOP chain."
      ],
      next_step: "Review the SOP evolution confirmation, then execute through the CLI if still valid."
    });
    await fixture.store.appendJsonl("autonomy/sop-recovery-decisions.jsonl", {
      id: "sop_recovery_decision_feishu",
      confirmation_id: "follow_up_confirmation_sop",
      confirmation_ref: "autonomy/followups/follow_up_confirmation_sop.json",
      sop_id: "sop_feishu_gate",
      sop_ref: "sop/drafts/sop_feishu_gate.json",
      status: "historical",
      previous_status: "none",
      gate_reason_code: "chain_not_found",
      gate_reason: "The SOP evolution chain is no longer present in the current ledger.",
      reason: "The stale request is kept only as historical evidence.",
      created_at: "2026-06-30T00:04:00.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_confirmations",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review confirmations"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_confirmation_one",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review confirmation follow_up_confirmation_a"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_confirmation_executed",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review confirmation follow_up_confirmation_executed"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_confirmation_sop",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review confirmation follow_up_confirmation_sop"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_review_confirmations_stale",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/review confirmations stale"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 5);
    assert.match(transport.sent[0].text, /Review confirmations/);
    assert.match(transport.sent[0].text, /follow_up_confirmation_a/);
    assert.match(transport.sent[0].text, /Draft a local SOP candidate/);
    assert.match(transport.sent[0].text, /draft_sop_readiness: ready/);
    assert.match(transport.sent[0].text, /draft_evidence_refs: 3/);
    assert.match(transport.sent[0].text, /draft_related_sops: sop\/drafts\/sop_feishu_related\.json/);
    assert.match(transport.sent[0].text, /source: sop_evolution_chain/);
    assert.match(transport.sent[0].text, /sop: sop_feishu_gate/);
    assert.match(transport.sent[0].text, /sop_ref: sop\/drafts\/sop_feishu_gate\.json/);
    assert.match(transport.sent[0].text, /sop_evolution_gate: stale/);
    assert.match(transport.sent[0].text, /gate_reason_code: chain_not_found/);
    assert.match(transport.sent[0].text, /Gate summary:/);
    assert.match(transport.sent[0].text, /stale\/chain_not_found: 1/);
    assert.match(transport.sent[1].text, /Review confirmation/);
    assert.match(transport.sent[1].text, /draft_sop_readiness: ready/);
    assert.match(transport.sent[1].text, /draft_failure_signals: 1/);
    assert.match(transport.sent[1].text, /draft_related_skills: vault\/skills\/feishu-related-skill\/SKILL\.md/);
    assert.match(transport.sent[1].text, /Safety boundary/);
    assert.match(transport.sent[1].text, /Review, then execute through the CLI/);
    assert.match(transport.sent[1].text, /Execution gate:/);
    assert.match(transport.sent[1].text, /review execute-confirmed-follow-up --confirmation autonomy\/followups\/follow_up_confirmation_a\.json/);
    assert.match(transport.sent[1].text, /--state-root /);
    assert.match(transport.sent[2].text, /already executed/);
    assert.match(transport.sent[2].text, /Execution result:/);
    assert.doesNotMatch(transport.sent[2].text, /review execute-confirmed-follow-up --confirmation autonomy\/followups\/follow_up_confirmation_executed\.json/);
    assert.match(transport.sent[3].text, /source: sop_evolution_chain/);
    assert.match(transport.sent[3].text, /sop: sop_feishu_gate/);
    assert.match(transport.sent[3].text, /sop_ref: sop\/drafts\/sop_feishu_gate\.json/);
    assert.match(transport.sent[3].text, /sop_evolution_gate: stale/);
    assert.match(transport.sent[3].text, /gate_reason_code: chain_not_found/);
    assert.match(transport.sent[3].text, /blocked until a fresh SOP evolution confirmation is requested/);
    assert.match(transport.sent[3].text, /Recovery playbook:/);
    assert.match(transport.sent[3].text, /reason_code: chain_not_found/);
    assert.match(transport.sent[3].text, /summary: The SOP chain is no longer present in the current ledger/);
    assert.match(transport.sent[3].text, /inspect: pnpm run runtime -- governance evolution/);
    assert.match(transport.sent[3].text, /record_decision: pnpm run runtime -- review decide-sop-recovery --confirmation autonomy\/followups\/follow_up_confirmation_sop\.json --status deferred --reason "\.\.\."/);
    assert.match(transport.sent[3].text, /latest_decision: historical/);
    assert.match(transport.sent[3].text, /decision_reason: The stale request is kept only as historical evidence/);
    assert.match(transport.sent[3].text, /decision_ref: autonomy\/sop-recovery-decisions\.jsonl#1/);
    assert.match(transport.sent[3].text, /review request-sop-confirmation --sop sop_feishu_gate/);
    assert.doesNotMatch(transport.sent[3].text, /review execute-confirmed-follow-up --confirmation autonomy\/followups\/follow_up_confirmation_sop\.json/);
    assert.match(transport.sent[4].text, /Review confirmations \(stale\)/);
    assert.match(transport.sent[4].text, /follow_up_confirmation_sop/);
    assert.match(transport.sent[4].text, /sop_evolution_gate: stale/);
    assert.match(transport.sent[4].text, /gate_reason_code: chain_not_found/);
    assert.match(transport.sent[4].text, /stale\/chain_not_found: 1/);
    assert.match(transport.sent[4].text, /playbook: The SOP chain is no longer present in the current ledger/);
    assert.match(transport.sent[4].text, /recovery_decision: historical - The stale request is kept only as historical evidence/);
    assert.match(transport.sent[4].text, /fresh_request: pnpm run runtime -- review request-sop-confirmation --sop sop_feishu_gate/);
    assert.doesNotMatch(transport.sent[4].text, /follow_up_confirmation_a/);
    assert.doesNotMatch(transport.sent[4].text, /follow_up_confirmation_executed/);
    const recoveryDecisions = await readJsonl(join(fixture.stateRoot, "autonomy/sop-recovery-decisions.jsonl"));
    assert.equal(recoveryDecisions.length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("operator memory candidate commands read local candidates without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/semantic/candidates/session_a-memory-proposal-r1-0.json", {
      id: "memory_proposal_a",
      action_type: "propose_memory",
      status: "candidate",
      scope: "local",
      summary: "Remember the local operator preference.",
      content: "Detailed candidate memory content.",
      rationale: "The agent should preserve this as a candidate.",
      artifact_refs: ["memory/episodes/events.jsonl"],
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("memory/semantic/candidates/session_b-memory-proposal-r1-0.json", {
      id: "memory_proposal_b",
      action_type: "propose_memory",
      status: "confirmation_requested",
      scope: "local",
      summary: "Remember the pending memory gate.",
      content: "Pending candidate memory content.",
      artifact_refs: ["memory/episodes/events.jsonl"],
      created_at: "2026-06-30T00:01:00.000Z",
      confirmation_ref: "memory/semantic/confirmations/memory_confirmation_b.json",
      confirmation_markdown_ref: "memory/semantic/confirmations/memory_confirmation_b.md",
      confirmation_requested_at: "2026-06-30T00:02:00.000Z"
    });
    await fixture.store.writeJson("memory/semantic/candidates/session_c-memory-proposal-r1-0.json", {
      id: "memory_proposal_c",
      action_type: "propose_memory",
      status: "accepted",
      scope: "local",
      summary: "Remember the accepted memory gate.",
      content: "Accepted candidate memory content.",
      artifact_refs: ["memory/episodes/events.jsonl"],
      created_at: "2026-06-30T00:03:00.000Z",
      confirmation_ref: "memory/semantic/confirmations/memory_confirmation_c.json",
      accepted_ref: "memory/semantic/accepted/semantic_memory_c.json",
      accepted_markdown_ref: "memory/semantic/accepted/semantic_memory_c.md",
      accepted_at: "2026-06-30T00:04:00.000Z"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_candidates",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory candidates"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_candidate",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory candidate memory_proposal_a"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_candidate_pending",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory candidate memory_proposal_b"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_candidate_accepted",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory candidate memory_proposal_c"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 4);
    assert.match(transport.sent[0].text, /Memory candidates/);
    assert.match(transport.sent[0].text, /memory_proposal_a/);
    assert.match(transport.sent[0].text, /Remember the local operator preference/);
    assert.match(transport.sent[1].text, /Memory candidate/);
    assert.match(transport.sent[1].text, /Detailed candidate memory content/);
    assert.match(transport.sent[1].text, /Confirmation gate:/);
    assert.match(transport.sent[1].text, /memory request-candidate-confirmation --candidate memory\/semantic\/candidates\/session_a-memory-proposal-r1-0\.json/);
    assert.match(transport.sent[1].text, /--state-root /);
    assert.doesNotMatch(transport.sent[1].text, /future governance command/);
    assert.match(transport.sent[2].text, /pending confirmation exists/);
    assert.match(transport.sent[2].text, /memory confirmations --confirmation memory\/semantic\/confirmations\/memory_confirmation_b\.json/);
    assert.doesNotMatch(transport.sent[2].text, /memory request-candidate-confirmation --candidate/);
    assert.match(transport.sent[3].text, /already accepted/);
    assert.match(transport.sent[3].text, /memory accepted --semantic memory\/semantic\/accepted\/semantic_memory_c\.json/);
    assert.doesNotMatch(transport.sent[3].text, /memory request-candidate-confirmation --candidate/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator accepted memory commands read local accepted memory without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/semantic/accepted/semantic_memory_a.json", {
      id: "semantic_memory_a",
      action_type: "semantic_memory",
      status: "accepted",
      scope: "local",
      summary: "Use explicit gates before durable memory.",
      content: "Detailed accepted semantic memory content.",
      source_candidate_id: "memory_proposal_a",
      source_candidate_ref: "memory/semantic/candidates/session_a-memory-proposal-r1-0.json",
      artifact_refs: ["memory/episodes/events.jsonl"],
      confirmation_ref: "memory/semantic/confirmations/memory_confirmation_a.json",
      created_at: "2026-06-30T00:00:00.000Z",
      accepted_at: "2026-06-30T00:01:00.000Z",
      boundary: "local state semantic memory"
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_accepted",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory accepted"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_accepted_one",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory accepted semantic_memory_a"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 2);
    assert.match(transport.sent[0].text, /Accepted semantic memory/);
    assert.match(transport.sent[0].text, /semantic_memory_a/);
    assert.match(transport.sent[0].text, /Use explicit gates before durable memory/);
    assert.match(transport.sent[1].text, /Accepted semantic memory/);
    assert.match(transport.sent[1].text, /Detailed accepted semantic memory content/);
  } finally {
    await fixture.cleanup();
  }
});

test("operator memory confirmation commands read local confirmations without running the agent", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/semantic/confirmations/memory_confirmation_a.json", {
      id: "memory_confirmation_a",
      action_type: "promote_memory_candidate",
      status: "pending",
      created_at: "2026-06-30T00:00:00.000Z",
      candidate_ref: "memory/semantic/candidates/session_a-memory-proposal-r1-0.json",
      candidate_id: "memory_proposal_a",
      confirmation_required: true,
      execution_allowed: false,
      would_write: ["state"],
      safety_boundary: [
        "This request records operator intent only.",
        "A later explicit command must re-read this request before accepting memory."
      ],
      next_step: "Run the CLI execution command after review."
    });
    await fixture.store.writeJson("memory/semantic/confirmations/memory_confirmation_executed.json", {
      id: "memory_confirmation_executed",
      action_type: "promote_memory_candidate",
      status: "executed",
      created_at: "2026-06-30T00:00:00.000Z",
      executed_at: "2026-06-30T00:02:00.000Z",
      candidate_ref: "memory/semantic/candidates/session_b-memory-proposal-r1-0.json",
      candidate_id: "memory_proposal_b",
      confirmation_required: true,
      execution_allowed: false,
      would_write: ["state"],
      safety_boundary: [
        "This request records operator intent only.",
        "A later explicit command must re-read this request before accepting memory."
      ],
      next_step: "Already executed.",
      execution_result: {
        kind: "accept_memory_candidate",
        accepted_ref: "memory/semantic/accepted/semantic_memory_b.json",
        accepted_markdown_ref: "memory/semantic/accepted/semantic_memory_b.md",
        candidate_ref: "memory/semantic/candidates/session_b-memory-proposal-r1-0.json",
        evidence_event_id: "evt_memory_executed"
      }
    });
    const runner = new StubRunner(fixture.store, "done");
    const transport = new MockFeishuTransport();
    const adapter = new FeishuPrivateChatAdapter({
      config: testFeishuConfig(),
      transport,
      runner,
      store: fixture.store
    });

    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_confirmations",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory confirmations"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_confirmation_one",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory confirmation memory_confirmation_a"
    }));
    await adapter.handleInboundEvent(feishuEvent({
      messageId: "om_memory_confirmation_executed",
      chatType: "p2p",
      openId: "ou_allowed",
      text: "/memory confirmation memory_confirmation_executed"
    }));

    assert.equal(runner.tasks.length, 0);
    assert.equal(transport.sent.length, 3);
    assert.match(transport.sent[0].text, /Memory confirmations/);
    assert.match(transport.sent[0].text, /memory_confirmation_a/);
    assert.match(transport.sent[0].text, /memory_proposal_a/);
    assert.match(transport.sent[1].text, /Memory confirmation/);
    assert.match(transport.sent[1].text, /Safety boundary/);
    assert.match(transport.sent[1].text, /Run the CLI execution command after review/);
    assert.match(transport.sent[1].text, /Execution gate:/);
    assert.match(transport.sent[1].text, /memory execute-candidate-confirmation --confirmation memory\/semantic\/confirmations\/memory_confirmation_a\.json/);
    assert.match(transport.sent[1].text, /--state-root /);
    assert.match(transport.sent[2].text, /already executed/);
    assert.match(transport.sent[2].text, /Execution result:/);
    assert.match(transport.sent[2].text, /accepted: memory\/semantic\/accepted\/semantic_memory_b\.json/);
    assert.doesNotMatch(transport.sent[2].text, /memory execute-candidate-confirmation --confirmation memory\/semantic\/confirmations\/memory_confirmation_executed\.json/);
  } finally {
    await fixture.cleanup();
  }
});

test("Feishu channel and scenario resolve from settings and auth env refs without model auth", async () => {
  const fixture = await createConfigFixture();
  const previousAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousAppSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  const previousApiKey = process.env.API_KEY;
  process.env[TEST_FEISHU_APP_ID_ENV] = "cli_from_env";
  process.env[TEST_FEISHU_APP_SECRET_ENV] = "secret_from_env";
  delete process.env.API_KEY;
  try {
    const scenario = await loadFeishuScenarioConfig({
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(scenario.id, "im-default");
    assert.equal(scenario.modelId, "test-model");
    assert.equal(scenario.discipline, "query_todo");
    assert.equal(scenario.channel.appId, "cli_from_env");
    assert.equal(scenario.channel.appSecret, "secret_from_env");
    assert.equal(scenario.channel.ackText, "ack from settings");
    assert.equal(scenario.channel.queuedText, "queued from settings");
    assert.equal(scenario.channel.followupQueueSize, 3);
  } finally {
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousAppSecret);
    restoreEnv("API_KEY", previousApiKey);
    await fixture.cleanup();
  }
});

test("Feishu app_secret auth can be overridden from state auth jsonl", async () => {
  const fixture = await createConfigFixture({
    stateAuth: {
      type: "app_secret",
      id: "feishu-test",
      app_id: "cli_from_state",
      app_secret: "secret_from_state"
    }
  });
  const previousAppId = process.env[TEST_FEISHU_APP_ID_ENV];
  const previousAppSecret = process.env[TEST_FEISHU_APP_SECRET_ENV];
  delete process.env[TEST_FEISHU_APP_ID_ENV];
  delete process.env[TEST_FEISHU_APP_SECRET_ENV];
  try {
    const channel = await loadFeishuChannelConfig({
      configDir: fixture.configDir,
      stateRoot: fixture.stateRoot
    });

    assert.equal(channel.appId, "cli_from_state");
    assert.equal(channel.appSecret, "secret_from_state");
  } finally {
    restoreEnv(TEST_FEISHU_APP_ID_ENV, previousAppId);
    restoreEnv(TEST_FEISHU_APP_SECRET_ENV, previousAppSecret);
    await fixture.cleanup();
  }
});

class MockFeishuTransport implements FeishuTransport {
  readonly sent: Array<{ openId: string; text: string }> = [];
  readonly chatSent: Array<{ chatId: string; text: string }> = [];

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async sendText(openId: string, text: string): Promise<FeishuSendResult> {
    this.sent.push({ openId, text });
    return {
      ok: true,
      messageId: `sent_${this.sent.length}`,
      summary: "sent"
    };
  }

  async sendTextToChat(chatId: string, text: string): Promise<FeishuSendResult> {
    this.chatSent.push({ chatId, text });
    return {
      ok: true,
      messageId: `chat_sent_${this.chatSent.length}`,
      summary: "sent"
    };
  }
}

class StubRunner implements TaskRunner {
  readonly tasks: string[] = [];

  constructor(
    private readonly store: AgentStore,
    private readonly finalText: string
  ) {}

  async runTask(task: string): Promise<RunResult> {
    this.tasks.push(task);
    const finalRef = "memory/episodes/session_test-final-response.md";
    await this.store.writeText(finalRef, this.finalText);
    return {
      trigger_id: "trigger_test",
      opportunity_id: "opp_test",
      session_id: "session_test",
      turn_id: "turn_test",
      context_ref: "memory/episodes/session_test-context.md",
      model_response_ref: "memory/episodes/session_test-model-response.json",
      envelope_ref: "memory/episodes/session_test-model-action.json",
      evidence_refs: ["evidence_test"],
      sop_ref: null,
      audit_ref: null,
      skill_ref: null,
      recalled_skill_refs: [],
      final_response_ref: finalRef,
      discipline_refs: null,
      verdict: "no_sop"
    };
  }
}

class BlockingRunner implements TaskRunner {
  readonly tasks: string[] = [];
  private readonly pending: Array<{ resolve: (text: string) => void; promise: Promise<string> }> = [];

  constructor(private readonly store: AgentStore) {}

  async runTask(task: string): Promise<RunResult> {
    this.tasks.push(task);
    const pending = this.createPending();
    const finalText = await pending.promise;
    const sessionId = `session_blocking_${this.tasks.length}`;
    const finalRef = `memory/episodes/${sessionId}-final-response.md`;
    await this.store.writeText(finalRef, finalText);
    return {
      trigger_id: `trigger_${sessionId}`,
      opportunity_id: `opp_${sessionId}`,
      session_id: sessionId,
      turn_id: `turn_${sessionId}`,
      context_ref: `memory/episodes/${sessionId}-context.md`,
      model_response_ref: `memory/episodes/${sessionId}-model-response.json`,
      envelope_ref: `memory/episodes/${sessionId}-model-action.json`,
      evidence_refs: [`evidence_${sessionId}`],
      sop_ref: null,
      audit_ref: null,
      skill_ref: null,
      recalled_skill_refs: [],
      final_response_ref: finalRef,
      discipline_refs: null,
      verdict: "no_sop"
    };
  }

  resolveNext(text: string): void {
    const next = this.pending.shift();
    if (!next) throw new Error("No pending run to resolve.");
    next.resolve(text);
  }

  private createPending(): { resolve: (text: string) => void; promise: Promise<string> } {
    let resolve!: (text: string) => void;
    const promise = new Promise<string>((done) => {
      resolve = done;
    });
    const pending = { resolve, promise };
    this.pending.push(pending);
    return pending;
  }
}

function testFeishuConfig(overrides: Partial<FeishuChannelConfig> = {}): FeishuChannelConfig {
  return {
    channelId: "feishu-test",
    appId: "cli_test",
    appSecret: "secret",
    domain: "feishu",
    allowedOpenIds: [],
    ackText: "收到，正在处理。",
    busyText: "busy",
    queuedText: "queued",
    followupQueueSize: 8,
    unsupportedText: "unsupported",
    errorText: "error",
    dedupCacheSize: 32,
    textChunkLimit: 3900,
    ...overrides
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function selectedSkillOutcome(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "skill_usage_outcome_test",
    session_id: "session_skill_usage",
    turn_id: "turn_skill_usage",
    skill_name: "skill-outcome-test",
    instructions_ref: "vault/skills/skill-outcome-test/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#skill-outcome-test",
    source: "personal",
    score: 12,
    context_ref: "memory/episodes/session_skill_usage-context.md",
    context_manifest_ref: "memory/episodes/session_skill_usage-context.json",
    completion_status: "done",
    verification_status: "failed",
    verified: false,
    verdict: "completion_unverified",
    completion_report_ref: "memory/episodes/session_skill_usage-completion-verification.json",
    final_response_ref: "memory/episodes/session_skill_usage-final-response.md",
    envelope_ref: "memory/episodes/session_skill_usage-model-action-r2.json",
    registry_update: {
      ok: true,
      use_count: 2,
      last_used_at: "2026-06-30T00:00:00.000Z"
    },
    boundary: "post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness",
    created_at: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}

function skillRegistryEntry(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    name: "feishu-registry",
    description: "Feishu registry fixture.",
    source: "personal",
    status: "active",
    instructions_ref: "vault/skills/feishu-registry/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#feishu-registry",
    origin_ref: null,
    trust_level: "local",
    source_sop_ref: null,
    references: [],
    tool_requirements: [],
    verification: "node --import tsx --test tests/feishu_adapter.test.ts",
    evidence_refs: [],
    content_hash: "old-hash",
    version: 1,
    usage: {
      use_count: 0,
      last_used_at: null,
      patch_count: 0
    },
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:01:00.000Z",
    ...overrides
  };
}

function feishuEvent(args: {
  messageId: string;
  chatType: string;
  openId: string;
  text: string;
  messageType?: string;
  chatId?: string;
}): FeishuInboundEvent {
  return {
    event_id: `event_${args.messageId}`,
    sender: {
      sender_type: "user",
      sender_id: {
        open_id: args.openId
      }
    },
    message: {
      message_id: args.messageId,
      chat_id: args.chatId ?? `chat_${args.openId}`,
      chat_type: args.chatType,
      message_type: args.messageType ?? "text",
      content: JSON.stringify({ text: args.text }),
      create_time: "1710000000000"
    }
  };
}

function reviewInboxItem(args: {
  id: string;
  status: "open" | "confirmation_requested" | "executed";
  title: string;
  focus_action_chain?: Array<{ label: string; effect: string; reason?: string }>;
}): Record<string, unknown> {
  return {
    id: args.id,
    created_at: "2026-06-29T00:00:00.000Z",
    updated_at: "2026-06-29T00:00:00.000Z",
    status: args.status,
    source: "review_tick",
    first_review_ref: "autonomy/reviews/background_review_1.json",
    latest_review_ref: "autonomy/reviews/background_review_2.json",
    proposal_id: "review_proposal_1",
    proposal_type: "sop_candidate",
    proposal_title: args.title,
    action_id: "follow_up_action_draft_sop_1",
    action_kind: "draft_sop",
    title: args.title,
    rationale: "test rationale",
    command: null,
    required_refs: ["autonomy/reviews/background_review_2.json"],
    would_write: ["state"],
    seen_count: 1,
    ...(args.focus_action_chain ? { focus_action_chain: args.focus_action_chain } : {})
  };
}

function contextManifest(args: {
  sessionId: string;
  turnId: string;
  createdAt: string;
  totalChars: number;
  memoryHitCount: number;
  skillRefCount: number;
  disciplineActive: boolean;
}): ContextBundleManifest {
  return {
    version: 1,
    created_at: args.createdAt,
    session_id: args.sessionId,
    turn_id: args.turnId,
    total_chars: args.totalChars,
    section_count: 2,
    sections: [{
      title: "Stable Core",
      chars: 100,
      refs: ["core/soul.md"],
      item_count: 1
    }, {
      title: "Episode Recall",
      chars: 50,
      refs: ["memory/episodes/prior.json"],
      item_count: args.memoryHitCount
    }],
    recall: {
      memory_hit_count: args.memoryHitCount,
      memory_refs: args.memoryHitCount > 0 ? ["memory_hit_a"] : [],
      archive_ref_count: 0,
      archive_refs: [],
      opportunity_ref_count: 0,
      opportunity_refs: [],
      skill_ref_count: args.skillRefCount,
      skill_refs: args.skillRefCount > 0 ? ["vault/skills/example/SKILL.md"] : [],
      discipline_active: args.disciplineActive
    }
  };
}

function reviewTickRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "review_tick_test",
    mode: "query",
    query: "self evolution",
    session_id: null,
    created_at: "2026-06-30T00:00:00.000Z",
    focus: {
      source: "explicit_query",
      reason: "operator supplied --query; backlog focus is not used",
      query: "self evolution"
    },
    review_ref: "autonomy/reviews/background_review_tick_test.json",
    review_markdown_ref: "autonomy/reviews/background_review_tick_test.md",
    proposal_count: 1,
    inbox_item_refs: ["autonomy/inbox/review_inbox_tick_test.json"],
    inbox_items: [{
      id: "review_inbox_tick_test",
      status: "open"
    }],
    stats: {
      new_items: 1,
      updated_items: 0
    },
    artifact_refs: {
      json_ref: "autonomy/ticks/review_tick_test.json",
      markdown_ref: "autonomy/ticks/review_tick_test.md"
    },
    evidence_event_id: "evidence_review_tick_test",
    ...overrides
  };
}

function backgroundReviewRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "background_review_test",
    mode: "query",
    query: "self evolution",
    session_id: null,
    created_at: "2026-06-30T00:00:00.000Z",
    stats: {
      events_reviewed: 1,
      sessions_seen: 1,
      kinds: { report: 1 },
      failure_signal_count: 0,
      sop_signal_count: 1
    },
    source: {
      memory_sync: {
        source_ref: "memory/episodes/events.jsonl",
        db_ref: "memory/index/episodes.sqlite",
        total_rows: 1,
        indexed_rows: 1,
        skipped_rows: 0
      },
      reviewed_event_ids: ["evidence_review_test"],
      working_checkpoint: null
    },
    chain_summaries: [],
    proposals: [{
      id: "review_proposal_test",
      type: "sop_candidate",
      title: "Review local SOP evidence",
      rationale: "Review rationale.",
      evidence_refs: ["memory/episodes/events.jsonl#evidence_review_test"],
      next_action: "Inspect the cited evidence."
    }],
    artifact_refs: {
      json_ref: "autonomy/reviews/background_review_test.json",
      markdown_ref: "autonomy/reviews/background_review_test.md"
    },
    evidence_event_id: "evidence_background_review_test",
    ...overrides
  };
}

function completionVerificationRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "completion_verification_test",
    session_id: "session_completion_test",
    turn_id: "turn_completion_test",
    completion_status: "done",
    verification_status: "failed",
    verified: false,
    summary: "Completion verification failed.",
    envelope_ref: "memory/episodes/session_completion-model-action.json",
    final_response_ref: null,
    claimed_verification_refs: [],
    observation_refs: [],
    checks: [],
    boundary: "harness-owned completion verification report; read-only context input, not replay authority",
    created_at: "2026-06-30T00:00:07.000Z",
    ...overrides
  };
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  const store = new AgentStore(repoRoot, stateRoot);
  await store.ensureLayout();
  return {
    repoRoot,
    stateRoot,
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function writeRepoHead(store: AgentStore, commit: string, branch = "develop"): Promise<void> {
  await store.writeRepoText(".git/HEAD", `ref: refs/heads/${branch}\n`);
  await store.writeRepoText(`.git/refs/heads/${branch}`, `${commit}\n`);
}

async function createConfigFixture(options: {
  stateAuth?: Record<string, unknown>;
} = {}): Promise<{
  configDir: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await writeFile(join(configDir, "config.jsonl"), [
    JSON.stringify({ type: "home", root: homeRoot }),
    JSON.stringify({ type: "state", root: stateRoot }),
    JSON.stringify({ type: "active_model", model_id: "fallback-model" }),
    JSON.stringify({ type: "active_channel", channel_id: "feishu-test" }),
    JSON.stringify({ type: "active_scenario", scenario_id: "im-default" })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "settings.jsonl"), [
    JSON.stringify({
      type: "channel",
      id: "feishu-test",
      kind: "feishu",
      transport: "websocket",
      auth_id: "feishu-test",
      domain: "feishu",
      mode: "private_chat",
      allowed_open_ids: ["ou_allowed"],
      ack_text: "ack from settings",
      queued_text: "queued from settings",
      followup_queue_size: 3,
      dedup_cache_size: 64,
      text_chunk_limit: 1200
    }),
    JSON.stringify({
      type: "scenario",
      id: "im-default",
      channel_id: "feishu-test",
      model_id: "test-model",
      discipline: "query_todo",
      reply_policy: "final_response",
      concurrency: "per_sender"
    })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
    type: "model",
    id: "fallback-model",
    provider: "openai-compatible",
    api: "chat_completions",
    base_url: "https://api.example.test/v1",
    model: "gpt-test",
    auth_id: "model-test",
    context_window_tokens: 20000,
    max_output_tokens: 2400
  })}\n`, "utf8");
  await writeFile(join(configDir, "auth.jsonl"), `${JSON.stringify({
    type: "app_secret",
    id: "feishu-test",
    app_id_env: TEST_FEISHU_APP_ID_ENV,
    app_secret_env: TEST_FEISHU_APP_SECRET_ENV
  })}\n`, "utf8");
  if (options.stateAuth) {
    await writeFile(join(stateRoot, "auth.jsonl"), `${JSON.stringify(options.stateAuth)}\n`, "utf8");
  }
  return {
    configDir,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function initGitFixture(repoRoot: string): Promise<void> {
  await runGit(repoRoot, ["init"]);
  await runGit(repoRoot, ["config", "user.name", "Local Runtime Test"]);
  await runGit(repoRoot, ["config", "user.email", "local-runtime@example.test"]);
  await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
}

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr || stdout || error.message}`));
        return;
      }
      resolve();
    });
  });
}

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  const raw = await readFile(path, "utf8");
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>);
}

async function mkdirTemp(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "local-agent-feishu-"));
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
