import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { listContentFeedbackHistory } from "../packages/core/src/content_pipeline.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  createContentCreatorMetricsLoop
} from "../packages/runtime/src/content_creator_metrics_service.js";
import {
  recordContentFeedbackEvidence,
  recordContentImageEvidence,
  recordContentPublishEvidence,
  runContentDryRun,
  type CreatorMetricsCaptureClient
} from "../packages/runtime/src/content_pipeline.js";
import type { LoopTimerDriver } from "../packages/runtime/src/loop_schedule.js";

const CREATOR_URL = "https://creator.xiaohongshu.com/new/note-manager";

test("content creator metrics loop stays disabled unless runtime config enables it", async () => {
  const fixture = await createFixture();
  try {
    let clientFactoryCalls = 0;
    const loop = createContentCreatorMetricsLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: false,
      intervalMs: 1000,
      limit: 5,
      creatorUrl: CREATOR_URL,
      browserSessionName: "runtime-creator-metrics",
      browserAutoConnect: false,
      clientFactory: async () => {
        clientFactoryCalls += 1;
        return undefined;
      }
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "disabled");
    assert.equal(status.enabled, false);
    assert.equal(clientFactoryCalls, 0);
    assert.equal(existsSync(join(fixture.stateRoot, loop.statusRef)), true);
  } finally {
    await fixture.cleanup();
  }
});

test("content creator metrics loop skips empty queue without requiring a browser client", async () => {
  const fixture = await createFixture();
  try {
    let clientFactoryCalls = 0;
    const loop = createContentCreatorMetricsLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      creatorUrl: CREATOR_URL,
      browserSessionName: "runtime-creator-metrics",
      browserAutoConnect: false,
      clientFactory: async () => {
        clientFactoryCalls += 1;
        throw new Error("client should not be resolved for an empty queue");
      }
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "skipped");
    assert.equal(status.last_queue_count, 0);
    assert.equal(status.last_captured_count, 0);
    assert.equal(status.last_blocked_count, 0);
    assert.equal(status.last_failed_count, 0);
    assert.equal(clientFactoryCalls, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("content creator metrics loop captures creator-backend view_count evidence", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRunWithMcpFeedback(store, fixture, "creator-post-1");
    const calls: string[] = [];
    const client: CreatorMetricsCaptureClient = {
      async captureCreatorMetrics(request) {
        calls.push(`${request.title}:${request.postId ?? ""}`);
        return {
          ok: true,
          status: "captured",
          adapter: "agent-browser-cli",
          matched_by: "title",
          title: request.title,
          post_id: request.postId,
          post_url: request.postUrl,
          metrics: {
            view_count: 42,
            like_count: 2,
            comment_count: 1,
            collect_count: 0,
            share_count: 0
          },
          source_ref: `agent-browser-cli:${CREATOR_URL}#creator-post-1`
        };
      }
    };
    const loop = createContentCreatorMetricsLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      creatorUrl: CREATOR_URL,
      browserSessionName: "runtime-creator-metrics",
      browserAutoConnect: false,
      clientFactory: async () => client
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "ok");
    assert.equal(status.last_queue_count, 1);
    assert.equal(status.last_captured_count, 1);
    assert.equal(status.last_blocked_count, 0);
    assert.equal(status.last_failed_count, 0);
    assert.deepEqual(status.last_run_refs, [`content/runs/${run.id}/run.json`]);
    assert.equal(status.last_feedback_refs?.length, 1);
    assert.deepEqual(calls, [`AI应用早报:creator-post-1`]);

    const history = await listContentFeedbackHistory(store, { capturedBy: "agent-browser-cli" });
    assert.equal(history.count, 1);
    assert.equal(history.events[0].metrics.view_count, 42);
    assert.equal(history.events[0].source_ref, `agent-browser-cli:${CREATOR_URL}#creator-post-1`);
  } finally {
    await fixture.cleanup();
  }
});

test("content creator metrics loop records blocked browser capture without feedback evidence", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRunWithMcpFeedback(store, fixture, "blocked-post");
    const client: CreatorMetricsCaptureClient = {
      async captureCreatorMetrics(request) {
        return {
          ok: false,
          status: "blocked",
          adapter: "agent-browser-cli",
          title: request.title,
          post_id: request.postId,
          post_url: request.postUrl,
          next_commands: ["agent-browser --session-name runtime-creator-metrics open https://creator.xiaohongshu.com/new/note-manager"],
          error: "creator backend page appears to require login"
        };
      }
    };
    const loop = createContentCreatorMetricsLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      creatorUrl: CREATOR_URL,
      browserSessionName: "runtime-creator-metrics",
      browserAutoConnect: false,
      clientFactory: async () => client
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "ok");
    assert.equal(status.last_queue_count, 1);
    assert.equal(status.last_captured_count, 0);
    assert.equal(status.last_blocked_count, 1);
    assert.equal(status.last_failed_count, 0);
    assert.deepEqual(status.last_run_refs, [`content/runs/${run.id}/run.json`]);
    assert.equal(status.last_feedback_refs?.length, 0);
    assert.equal(status.last_next_commands?.some((command) => command.includes("agent-browser")), true);

    const history = await listContentFeedbackHistory(store, { capturedBy: "agent-browser-cli" });
    assert.equal(history.count, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("content creator metrics loop captures due creator-routed follow-up snapshots", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRunWithMcpFeedback(store, fixture, "creator-follow-up-post");
    const mcpHistory = await listContentFeedbackHistory(store, { capturedBy: "xiaohongshu-mcp" });
    assert.equal(mcpHistory.count, 1);
    await store.writeJson(mcpHistory.events[0].feedback_ref, {
      ...await store.readStateJson<Record<string, unknown>>(mcpHistory.events[0].feedback_ref),
      created_at: "2026-07-01T00:00:00Z"
    });
    const firstCreator = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 7,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#creator-follow-up-post",
      postId: "creator-follow-up-post",
      postUrl: "https://www.xiaohongshu.com/explore/creator-follow-up-post"
    });
    await store.writeJson(firstCreator.evidence_ref, {
      ...firstCreator.evidence,
      created_at: "2026-07-01T01:00:00Z"
    });

    let clientFactoryCalls = 0;
    const beforeDueLoop = createContentCreatorMetricsLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000,
      creatorUrl: CREATOR_URL,
      browserSessionName: "runtime-creator-metrics",
      browserAutoConnect: false,
      clock: () => new Date("2026-07-01T06:59:59Z"),
      clientFactory: async () => {
        clientFactoryCalls += 1;
        throw new Error("client should not be resolved before the follow-up is due");
      }
    });

    const beforeDue = await beforeDueLoop.runOnce("test");
    assert.equal(beforeDue.state, "skipped");
    assert.equal(beforeDue.last_queue_count, 0);
    assert.equal(beforeDue.next_due_at, "2026-07-01T07:00:00.000Z");
    assert.equal(beforeDue.next_due_run_id, run.id);
    assert.equal(beforeDue.next_due_run_ref, `content/runs/${run.id}/run.json`);
    assert.equal(beforeDue.next_due_command?.includes(`content creator-metrics-capture --run ${run.id}`), true);
    assert.equal(clientFactoryCalls, 0);

    const calls: string[] = [];
    const client: CreatorMetricsCaptureClient = {
      async captureCreatorMetrics(request) {
        calls.push(`${request.title}:${request.postId ?? ""}`);
        return {
          ok: true,
          status: "captured",
          adapter: "agent-browser-cli",
          matched_by: "post_id",
          title: request.title,
          post_id: request.postId,
          post_url: request.postUrl,
          metrics: {
            view_count: 11,
            like_count: 1,
            comment_count: 0,
            collect_count: 0,
            share_count: 0
          },
          source_ref: `agent-browser-cli:${CREATOR_URL}#creator-follow-up-post`
        };
      }
    };
    const dueLoop = createContentCreatorMetricsLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000,
      creatorUrl: CREATOR_URL,
      browserSessionName: "runtime-creator-metrics",
      browserAutoConnect: false,
      clock: () => new Date("2026-07-01T07:00:01Z"),
      clientFactory: async () => client
    });

    const due = await dueLoop.runOnce("test");
    assert.equal(due.state, "ok");
    assert.equal(due.last_queue_count, 1);
    assert.equal(due.last_captured_count, 1);
    assert.deepEqual(due.last_item_refs, [firstCreator.evidence_ref]);
    assert.deepEqual(due.last_run_refs, [`content/runs/${run.id}/run.json`]);
    assert.equal(due.next_due_at, undefined);
    assert.equal(due.last_next_commands?.some((command) => command.includes(`content creator-metrics-capture --run ${run.id}`)), true);
    assert.deepEqual(calls, ["AI应用早报:creator-follow-up-post"]);

    const creatorHistory = await listContentFeedbackHistory(store, { capturedBy: "agent-browser-cli" });
    assert.equal(creatorHistory.count, 2);
    assert.equal(creatorHistory.events[0].metrics.view_count, 11);
  } finally {
    await fixture.cleanup();
  }
});

test("content creator metrics loop schedules next wake at the earliest creator metrics due time", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRunWithMcpFeedback(store, fixture, "scheduled-creator-post");
    const mcpHistory = await listContentFeedbackHistory(store, { capturedBy: "xiaohongshu-mcp" });
    assert.equal(mcpHistory.count, 1);
    await store.writeJson(mcpHistory.events[0].feedback_ref, {
      ...await store.readStateJson<Record<string, unknown>>(mcpHistory.events[0].feedback_ref),
      created_at: "2026-07-01T00:00:00.000Z"
    });
    const firstCreator = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 7,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#scheduled-creator-post",
      postId: "scheduled-creator-post",
      postUrl: "https://www.xiaohongshu.com/explore/scheduled-creator-post"
    });
    await store.writeJson(firstCreator.evidence_ref, {
      ...firstCreator.evidence,
      created_at: "2026-07-01T01:00:00.000Z"
    });
    let clientFactoryCalls = 0;
    const timer = createCapturingTimerDriver();
    const loop = createContentCreatorMetricsLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 60 * 60 * 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000,
      creatorUrl: CREATOR_URL,
      browserSessionName: "runtime-creator-metrics",
      browserAutoConnect: false,
      clock: () => new Date("2026-07-01T06:59:59.000Z"),
      timerDriver: timer.driver,
      clientFactory: async () => {
        clientFactoryCalls += 1;
        throw new Error("client should not be resolved before the follow-up is due");
      }
    });

    loop.start();
    await timer.waitForSchedule();

    assert.deepEqual(timer.delays, [1000]);
    assert.equal(clientFactoryCalls, 0);
    const status = JSON.parse(await readFile(join(fixture.stateRoot, loop.statusRef), "utf8"));
    assert.equal(status.next_due_at, "2026-07-01T07:00:00.000Z");
    assert.equal(status.next_due_run_id, run.id);
    assert.equal(status.next_wake_at, "2026-07-01T07:00:00.000Z");
    assert.equal(status.next_wake_delay_ms, 1000);
    assert.equal(status.next_wake_reason, "next_due_at");
  } finally {
    await fixture.cleanup();
  }
});

test("content creator metrics loop pauses when an active autonomy stop signal exists", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_creator_metrics",
      status: "active",
      reason: "Pause creator metrics capture for operator review.",
      created_at: "2026-07-01T00:00:00.000Z"
    });
    const loop = createContentCreatorMetricsLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      creatorUrl: CREATOR_URL,
      browserSessionName: "runtime-creator-metrics",
      browserAutoConnect: false
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "paused");
    assert.equal(status.pause_signal_ref, "autonomy/runs/pause_signal.json");
    assert.equal(status.pause_reason, "Pause creator metrics capture for operator review.");
  } finally {
    await fixture.cleanup();
  }
});

async function createPublishedRunWithMcpFeedback(
  store: AgentStore,
  fixture: { stateRoot: string },
  postId: string
): Promise<Awaited<ReturnType<typeof runContentDryRun>>> {
  const run = await runContentDryRun(store, {
    workflowId: "daily_ai_applications_xhs",
    topic: "daily AI application product launches"
  });
  const imagePath = join(fixture.stateRoot, "generated", `${postId}.png`);
  await mkdir(dirname(imagePath), { recursive: true });
  await writeFile(imagePath, "fake image bytes", "utf8");
  const image = await recordContentImageEvidence(store, {
    runRef: run.id,
    outputPath: imagePath
  });
  const published = await recordContentPublishEvidence(store, {
    runRef: image.run.id,
    status: "published",
    externalWrite: true,
    confirmedByOperator: true,
    loginStatus: "logged_in",
    postId,
    postUrl: `https://www.xiaohongshu.com/explore/${postId}`
  });
  await recordContentFeedbackEvidence(store, {
    runRef: published.run.id,
    capturedBy: "xiaohongshu-mcp",
    likeCount: 0,
    commentCount: 0,
    collectCount: 0,
    shareCount: 0,
    sourceRef: `xiaohongshu-mcp:/api/v1/user/me#${postId}`,
    postId,
    postUrl: `https://www.xiaohongshu.com/explore/${postId}`
  });
  return published.run;
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-content-creator-metrics-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function createCapturingTimerDriver(): {
  driver: LoopTimerDriver;
  delays: number[];
  waitForSchedule: () => Promise<void>;
} {
  const delays: number[] = [];
  let resolveScheduled: (() => void) | undefined;
  const scheduled = new Promise<void>((resolve) => {
    resolveScheduled = resolve;
  });
  return {
    driver: {
      set: (_callback, delayMs) => {
        delays.push(delayMs);
        resolveScheduled?.();
        return { delayMs };
      },
      clear: () => {},
      unref: () => {}
    },
    delays,
    waitForSchedule: () => scheduled
  };
}
