import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { listContentFeedbackHistory } from "../packages/core/src/content_pipeline.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  createContentFeedbackRefreshLoop
} from "../packages/runtime/src/content_feedback_refresh_service.js";
import {
  recordContentFeedbackEvidence,
  recordContentImageEvidence,
  recordContentPublishEvidence,
  runContentDryRun
} from "../packages/runtime/src/content_pipeline.js";
import type { LoopTimerDriver } from "../packages/runtime/src/loop_schedule.js";
import type { ExternalFeedbackCaptureClient } from "../packages/runtime/src/xiaohongshu_mcp.js";

test("content feedback refresh loop stays disabled unless runtime config enables it", async () => {
  const fixture = await createFixture();
  try {
    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: false,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "disabled");
    assert.equal(status.enabled, false);
    assert.equal(existsSync(join(fixture.stateRoot, loop.statusRef)), true);
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop skips empty queue without requiring a client", async () => {
  const fixture = await createFixture();
  try {
    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "skipped");
    assert.equal(status.last_queue_count, 0);
    assert.equal(status.last_due_count, 0);
    assert.equal(status.last_captured_count, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop captures missing Xiaohongshu feedback snapshots", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await createPublishedRun(store, fixture, "first-post");
    const calls: string[] = [];
    const client: ExternalFeedbackCaptureClient = {
      async captureFeedback(request) {
        calls.push(request.post_id ?? "");
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          source: "xiaohongshu-mcp /api/v1/user/me",
          matched_by: "post_id",
          post_id: request.post_id,
          post_url: request.post_url,
          title: request.title,
          metrics: {
            view_count: 12,
            like_count: 1,
            comment_count: 0,
            collect_count: 0,
            share_count: 0
          }
        };
      }
    };
    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000,
      clientFactory: async () => client
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "ok");
    assert.equal(status.last_queue_count, 1);
    assert.equal(status.last_due_count, 1);
    assert.equal(status.last_captured_count, 1);
    assert.deepEqual(calls, ["first-post"]);

    const history = await listContentFeedbackHistory(store, { capturedBy: "xiaohongshu-mcp" });
    assert.equal(history.count, 1);
    assert.equal(history.events[0].metrics.view_count, 12);
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop records failed Xiaohongshu feedback without service error", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await createPublishedRun(store, fixture, "timeout-post");
    const client: ExternalFeedbackCaptureClient = {
      async captureFeedback(request) {
        assert.equal(request.post_id, "timeout-post");
        return {
          ok: false,
          adapter: "xiaohongshu-mcp",
          source: "xiaohongshu-mcp /api/v1/user/me",
          post_id: request.post_id,
          post_url: request.post_url,
          error: "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms",
          raw_summary: {
            endpoint: "/api/v1/user/me",
            timeout_ms: 15000,
            timed_out: true
          }
        };
      }
    };
    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000,
      clientFactory: async () => client
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "ok");
    assert.equal(status.last_due_count, 1);
    assert.equal(status.last_captured_count, 0);
    assert.equal(status.last_failed_count, 1);
    assert.equal(status.last_item_refs?.length, 1);

    const history = await listContentFeedbackHistory(store, { capturedBy: "xiaohongshu-mcp" });
    assert.equal(history.count, 1);
    assert.equal(history.events[0].error, "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms");
    const evidence = JSON.parse(await readFile(store.statePath(status.last_item_refs?.[0] as string), "utf8"));
    assert.equal(evidence.status, "failed");
    assert.equal(evidence.error, "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms");
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop waits before follow-up snapshots", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRun(store, fixture, "follow-post");
    await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "xiaohongshu-mcp",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#follow-post"
    });
    const firstFeedback = (await listContentFeedbackHistory(store, { capturedBy: "xiaohongshu-mcp" })).events[0];
    const firstAt = Date.parse(firstFeedback.created_at);
    const minFollowUpAgeMs = 6 * 60 * 60 * 1000;
    const beforeDue = new Date(firstAt + minFollowUpAgeMs - 1000);
    const afterDue = new Date(firstAt + minFollowUpAgeMs + 1000);
    let captureCalls = 0;
    const client: ExternalFeedbackCaptureClient = {
      async captureFeedback(request) {
        captureCalls += 1;
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          source: "xiaohongshu-mcp /api/v1/user/me",
          matched_by: "post_id",
          post_id: request.post_id,
          post_url: request.post_url,
          metrics: {
            view_count: 20,
            like_count: 2,
            comment_count: 0,
            collect_count: 0,
            share_count: 0
          }
        };
      }
    };

    const waitingLoop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs,
      clock: () => beforeDue,
      clientFactory: async () => client
    });
    const waiting = await waitingLoop.runOnce("test");
    assert.equal(waiting.state, "skipped");
    assert.equal(waiting.last_queue_count, 1);
    assert.equal(waiting.last_due_count, 0);
    assert.equal(waiting.last_deferred_count, 1);
    assert.deepEqual(waiting.last_deferred_item_refs, [`content/runs/${run.id}/run.json`]);
    assert.equal(waiting.next_due_at, new Date(firstAt + minFollowUpAgeMs).toISOString());
    assert.equal(waiting.next_due_run_id, run.id);
    assert.equal(waiting.next_due_run_ref, `content/runs/${run.id}/run.json`);
    assert.equal(waiting.next_due_reason, "needs_follow_up");
    assert.match(waiting.next_due_command ?? "", new RegExp(`content feedback-capture --run ${run.id}`));
    assert.equal(waiting.last_strategy_captured_by, "xiaohongshu-mcp");
    assert.equal(waiting.last_strategy_suggestion_count, 1);
    assert.equal(waiting.last_strategy_high_priority_count, 1);
    assert.equal(waiting.last_strategy_collect_more_feedback_count, 1);
    assert.equal(waiting.last_strategy_top_posture, "collect_more_feedback");
    assert.equal(waiting.last_strategy_top_title, "AI应用早报");
    assert.equal(waiting.last_strategy_top_run_ref, `content/runs/${run.id}/run.json`);
    assert.match(waiting.last_strategy_next_command ?? "", /content creator-metrics-capture --run/);
    assert.equal(captureCalls, 0);

    const dueLoop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs,
      clock: () => afterDue,
      clientFactory: async () => client
    });
    const due = await dueLoop.runOnce("test");
    assert.equal(due.state, "ok");
    assert.equal(due.last_due_count, 1);
    assert.equal(due.last_captured_count, 1);
    assert.equal(captureCalls, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop schedules next wake at the earliest feedback due time", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRun(store, fixture, "scheduled-follow-post");
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "xiaohongshu-mcp",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#scheduled-follow-post"
    });
    await store.writeJson(feedback.evidence_ref, {
      ...feedback.evidence,
      created_at: "2026-07-01T00:00:00.000Z"
    });
    let clientFactoryCalls = 0;
    const timer = createCapturingTimerDriver();
    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 60 * 60 * 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000,
      clock: () => new Date("2026-07-01T05:59:59.000Z"),
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
    assert.equal(status.next_due_at, "2026-07-01T06:00:00.000Z");
    assert.equal(status.next_due_run_id, run.id);
    assert.equal(status.next_wake_at, "2026-07-01T06:00:00.000Z");
    assert.equal(status.next_wake_delay_ms, 1000);
    assert.equal(status.next_wake_reason, "next_due_at");
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop strategy includes non-MCP creator metrics snapshots", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRun(store, fixture, "creator-view-post");
    const mcpFeedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "xiaohongshu-mcp",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#creator-view-post"
    });
    const creatorFeedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 7,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#creator-view-post"
    });
    await store.writeJson(mcpFeedback.evidence_ref, {
      ...mcpFeedback.evidence,
      created_at: "2026-07-01T00:00:00Z"
    });
    await store.writeJson(creatorFeedback.evidence_ref, {
      ...creatorFeedback.evidence,
      created_at: "2026-07-01T01:00:00Z"
    });

    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000,
      clock: () => new Date("2026-07-01T02:00:00Z")
    });

    const status = await loop.runOnce("test");

    assert.equal(status.state, "skipped");
    assert.equal(status.last_queue_count, 1);
    assert.equal(status.last_due_count, 0);
    assert.equal(status.next_due_reason, "needs_follow_up");
    assert.match(status.next_due_command ?? "", new RegExp(`content creator-metrics-capture --run ${run.id}`));
    assert.equal(status.last_strategy_suggestion_count, 1);
    assert.equal(status.last_strategy_top_run_ref, `content/runs/${run.id}/run.json`);
    assert.equal(status.last_strategy_captured_by, "xiaohongshu-mcp");
    assert.match(status.last_strategy_next_command ?? "", new RegExp(`content feedback-capture --run ${run.id}`));
    assert.doesNotMatch(status.last_strategy_next_command ?? "", /content creator-metrics-capture --run/);
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop skips due non-MCP routed follow-ups", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRun(store, fixture, "creator-follow-up-post");
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 7,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#creator-follow-up-post"
    });
    await store.writeJson(feedback.evidence_ref, {
      ...feedback.evidence,
      created_at: "2026-07-01T00:00:00Z"
    });
    let clientFactoryCalls = 0;
    const client: ExternalFeedbackCaptureClient = {
      async captureFeedback() {
        throw new Error("MCP feedback capture should not run for creator metrics follow-up");
      }
    };
    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000,
      clock: () => new Date("2026-07-01T06:00:01Z"),
      clientFactory: async () => {
        clientFactoryCalls += 1;
        return client;
      }
    });

    const status = await loop.runOnce("test");

    assert.equal(status.state, "skipped");
    assert.equal(status.last_queue_count, 1);
    assert.equal(status.last_due_count, 1);
    assert.equal(status.last_captured_count, 0);
    assert.equal(status.last_failed_count, 0);
    assert.equal(status.last_skipped_count, 1);
    assert.equal(status.last_top_skip_reason, "non_mcp_capture_route");
    assert.deepEqual(status.last_skip_reason_counts, {
      non_mcp_capture_route: 1
    });
    assert.deepEqual(status.last_skipped_item_refs, [`content/runs/${run.id}/run.json`]);
    assert.equal(clientFactoryCalls, 0);
    assert.equal(status.last_strategy_captured_by, "xiaohongshu-mcp");

    const history = await listContentFeedbackHistory(store, { capturedBy: "xiaohongshu-mcp" });
    assert.equal(history.count, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop defers when a newer non-MCP snapshot is still maturing", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await createPublishedRun(store, fixture, "mixed-post");
    const mcpFeedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "xiaohongshu-mcp",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#mixed-post"
    });
    const operatorFeedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "operator",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "channels/xhs/feedback/mixed-post.json"
    });
    await store.writeJson(mcpFeedback.evidence_ref, {
      ...mcpFeedback.evidence,
      created_at: "2026-07-01T00:00:00Z"
    });
    await store.writeJson(operatorFeedback.evidence_ref, {
      ...operatorFeedback.evidence,
      created_at: "2026-07-01T05:00:00Z"
    });
    let captureCalls = 0;
    const client: ExternalFeedbackCaptureClient = {
      async captureFeedback() {
        captureCalls += 1;
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          source: "xiaohongshu-mcp /api/v1/user/me",
          matched_by: "post_id",
          post_id: "mixed-post",
          metrics: {
            view_count: 30,
            like_count: 1,
            comment_count: 0,
            collect_count: 0,
            share_count: 0
          }
        };
      }
    };
    const minFollowUpAgeMs = 6 * 60 * 60 * 1000;
    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs,
      clock: () => new Date("2026-07-01T10:59:59Z"),
      clientFactory: async () => client
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "skipped");
    assert.equal(status.last_queue_count, 1);
    assert.equal(status.last_due_count, 0);
    assert.equal(status.last_deferred_count, 1);
    assert.deepEqual(status.last_deferred_item_refs, [`content/runs/${run.id}/run.json`]);
    assert.equal(status.next_due_at, "2026-07-01T11:00:00.000Z");
    assert.equal(status.next_due_run_id, run.id);
    assert.equal(status.next_due_run_ref, `content/runs/${run.id}/run.json`);
    assert.equal(status.next_due_reason, "needs_follow_up");
    assert.match(status.next_due_command ?? "", new RegExp(`content feedback-evidence --run ${run.id} --captured-by operator`));
    assert.equal(captureCalls, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("content feedback refresh loop pauses when an active autonomy stop signal exists", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_feedback_refresh",
      status: "active",
      reason: "Pause feedback refresh for operator review.",
      created_at: "2026-07-01T00:00:00.000Z"
    });
    const loop = createContentFeedbackRefreshLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5,
      minFollowUpAgeMs: 6 * 60 * 60 * 1000
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "paused");
    assert.equal(status.pause_signal_ref, "autonomy/runs/pause_signal.json");
    assert.equal(status.pause_reason, "Pause feedback refresh for operator review.");
  } finally {
    await fixture.cleanup();
  }
});

async function createPublishedRun(
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
  return published.run;
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-content-feedback-refresh-"));
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
