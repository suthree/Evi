import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { contentDailyDateKey } from "../packages/core/src/content_pipeline.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  createContentDailyLoop,
  shouldUseDefaultContentDailyTracks
} from "../packages/runtime/src/content_daily_service.js";
import {
  recordContentFeedbackEvidence,
  recordContentPublishEvidence,
  runDailyContentJob
} from "../packages/runtime/src/content_pipeline.js";
import type { ImageGenerationClient } from "../packages/runtime/src/model.js";
import type { ExternalPublishClient } from "../packages/runtime/src/xiaohongshu_mcp.js";

test("content daily loop stays disabled unless runtime config enables it", async () => {
  const fixture = await createFixture();
  try {
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: false,
      intervalMs: 1000,
      dryRun: true,
      preflight: false
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "disabled");
    assert.equal(status.enabled, false);
    assert.equal(existsSync(join(fixture.stateRoot, loop.statusRef)), true);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop writes one local daily job and skips duplicate same-day runs", async () => {
  const fixture = await createFixture();
  try {
    const dateKey = "2026-07-01";
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: true,
      preflight: false,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.test/ai"],
      tickers: ["NVDA"],
      fetchText: fakeFetch
    });

    const first = await loop.runOnce("test");
    assert.equal(first.state, "ok");
    assert.equal(first.last_date_key, dateKey);
    assert.equal(first.last_job_ref, `content/daily/${dateKey}.json`);
    assert.equal(first.last_job_status, "drafted");
    assert.match(first.last_run_ref ?? "", /^content\/runs\/content_run_/);

    const job = JSON.parse(await readFile(join(fixture.stateRoot, `content/daily/${dateKey}.json`), "utf8"));
    assert.equal(job.external_write, false);
    assert.equal(job.status, "drafted");
    assert.equal(job.steps.some((step: { id: string; status: string }) => step.id === "image_generation" && step.status === "skipped"), true);

    const second = await loop.runOnce("test");
    assert.equal(second.state, "skipped");
    assert.equal(second.last_job_ref, `content/daily/${dateKey}.json`);
    assert.equal(second.last_run_ref, first.last_run_ref);

    const jobs = await readdir(join(fixture.stateRoot, "content/daily"));
    assert.deepEqual(jobs, [`${dateKey}.json`]);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop writes configured daily tracks and skips when all exist", async () => {
  const fixture = await createFixture();
  try {
    const dateKey = "2026-07-01";
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: true,
      preflight: false,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      tracks: [
        {
          id: "ai_applications",
          workflowId: "daily_ai_applications_xhs",
          topic: "daily AI application product launches and agent tooling news"
        },
        {
          id: "ai_compute_market",
          workflowId: "daily_ai_compute_market_xhs",
          topic: "daily AI compute infrastructure and semiconductor stock hotspots"
        }
      ],
      fetchText: fakeFetch
    });

    const first = await loop.runOnce("test");
    assert.equal(first.state, "ok");
    assert.equal(first.last_job_count, 2);
    assert.deepEqual(first.last_job_refs, [
      `content/daily/ai_applications/${dateKey}.json`,
      `content/daily/ai_compute_market/${dateKey}.json`
    ]);
    assert.equal(first.last_job_status, "drafted");

    const appsJob = JSON.parse(await readFile(join(fixture.stateRoot, `content/daily/ai_applications/${dateKey}.json`), "utf8"));
    const computeJob = JSON.parse(await readFile(join(fixture.stateRoot, `content/daily/ai_compute_market/${dateKey}.json`), "utf8"));
    assert.equal(appsJob.track_id, "ai_applications");
    assert.equal(appsJob.workflow_id, "daily_ai_applications_xhs");
    assert.equal(computeJob.track_id, "ai_compute_market");
    assert.equal(computeJob.workflow_id, "daily_ai_compute_market_xhs");
    assert.equal(appsJob.external_write, false);
    assert.equal(computeJob.external_write, false);

    const second = await loop.runOnce("test");
    assert.equal(second.state, "skipped");
    assert.equal(second.last_job_count, 2);
    assert.deepEqual(second.last_job_refs, first.last_job_refs);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop uses local timezone date keys", async () => {
  const fixture = await createFixture();
  try {
    assert.equal(contentDailyDateKey(new Date("2026-07-01T16:30:00.000Z"), "Asia/Shanghai"), "2026-07-02");
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: true,
      preflight: false,
      clock: () => new Date("2026-07-01T16:30:00.000Z"),
      dateKeyTimeZone: "Asia/Shanghai",
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.test/ai"],
      tickers: ["NVDA"],
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "ok");
    assert.equal(status.date_key_time_zone, "Asia/Shanghai");
    assert.equal(status.last_date_key, "2026-07-02");
    assert.equal(status.last_job_ref, "content/daily/2026-07-02.json");
    assert.equal(existsSync(join(fixture.stateRoot, "content/daily/2026-07-02.json")), true);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop uses only the current default daily topic for default tracks", () => {
  assert.equal(shouldUseDefaultContentDailyTracks({
    topic: "daily AI news and AI stock hotspots",
    sourceUrls: [],
    tickers: []
  }), true);
  assert.equal(shouldUseDefaultContentDailyTracks({
    topic: "daily frontier AI news and AI stock hotspots for Xiaohongshu",
    sourceUrls: [],
    tickers: []
  }), false);
  assert.equal(shouldUseDefaultContentDailyTracks({
    topic: "custom daily AI apps only",
    sourceUrls: [],
    tickers: []
  }), false);
});

test("content daily loop auto-applies reusable feedback strategy for the same workflow", async () => {
  const fixture = await createFixture();
  try {
    const source = await createPublishedFeedbackSource(fixture, {
      dateKey: "2026-06-30",
      trackId: "ai_applications",
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches and agent tooling news",
      postId: "strategy-source-apps",
      secondMetrics: {
        viewCount: 48,
        likeCount: 8,
        commentCount: 3,
        collectCount: 5,
        shareCount: 1
      }
    });
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: true,
      preflight: false,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      tracks: [{
        id: "ai_applications",
        workflowId: "daily_ai_applications_xhs",
        topic: "daily AI application product launches and agent tooling news"
      }],
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("test");

    assert.equal(status.state, "ok");
    assert.equal(status.last_date_key, "2026-07-01");
    assert.equal(status.last_applied_strategy_count, 1);
    assert.deepEqual(status.last_applied_strategy_postures, ["reuse_baseline"]);
    assert.deepEqual(status.last_applied_strategy_source_run_refs, [`content/runs/${source.runId}/run.json`]);
    assert.deepEqual(status.last_applied_strategy_source_titles, ["AI应用早报"]);
    assert.equal(status.last_blocked_strategy_count, 0);
    assert.deepEqual(status.last_blocked_strategy_source_run_refs, []);
    const job = JSON.parse(await readFile(join(fixture.stateRoot, "content/daily/ai_applications/2026-07-01.json"), "utf8"));
    const run = JSON.parse(await readFile(join(fixture.stateRoot, job.run_ref), "utf8"));
    assert.deepEqual(status.last_applied_strategy_run_refs, [job.run_ref]);
    assert.equal(run.strategy?.kind, "feedback_strategy");
    assert.equal(run.strategy?.source_run_id, source.runId);
    assert.equal(run.strategy?.posture, "reuse_baseline");
    assert.equal(run.strategy?.applied, true);
    assert.equal(run.draft.title, "AI应用早报：3个新机会");
    assert.equal(run.draft.content.includes("今天的应用层变化不只是发布新功能"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop does not auto-apply immature feedback strategy", async () => {
  const fixture = await createFixture();
  try {
    await createPublishedFeedbackSource(fixture, {
      dateKey: "2026-06-30",
      trackId: "ai_applications",
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches and agent tooling news",
      postId: "strategy-source-immature"
    });
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: true,
      preflight: false,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      tracks: [{
        id: "ai_applications",
        workflowId: "daily_ai_applications_xhs",
        topic: "daily AI application product launches and agent tooling news"
      }],
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("test");

    assert.equal(status.state, "ok");
    assert.equal(status.last_applied_strategy_count, 0);
    assert.deepEqual(status.last_applied_strategy_run_refs, []);
    assert.deepEqual(status.last_applied_strategy_source_run_refs, []);
    assert.deepEqual(status.last_applied_strategy_postures, []);
    assert.equal(status.last_blocked_strategy_count, 1);
    assert.deepEqual(status.last_blocked_strategy_postures, ["collect_more_feedback"]);
    assert.deepEqual(status.last_blocked_strategy_source_titles, ["AI应用早报"]);
    assert.equal(status.last_blocked_strategy_reasons?.[0], "latest_strategy_not_auto_applicable:collect_more_feedback");
    const job = JSON.parse(await readFile(join(fixture.stateRoot, "content/daily/ai_applications/2026-07-01.json"), "utf8"));
    const run = JSON.parse(await readFile(join(fixture.stateRoot, job.run_ref), "utf8"));
    assert.equal(run.strategy, undefined);
    assert.equal(run.draft.title, "AI应用早报");
    assert.equal(run.draft.content.includes("今天的应用层变化不只是发布新功能"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop blocks older reusable strategy when newer workflow feedback is immature", async () => {
  const fixture = await createFixture();
  try {
    const older = await createPublishedFeedbackSource(fixture, {
      dateKey: "2026-06-29",
      trackId: "ai_applications",
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches and agent tooling news",
      postId: "strategy-source-older-baseline",
      firstFeedbackAt: "2026-06-29T10:00:00Z",
      secondFeedbackAt: "2026-06-29T12:00:00Z",
      secondMetrics: {
        viewCount: 48,
        likeCount: 8,
        commentCount: 3,
        collectCount: 5,
        shareCount: 1
      }
    });
    const newer = await createPublishedFeedbackSource(fixture, {
      dateKey: "2026-06-30",
      trackId: "ai_applications",
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches and agent tooling news",
      postId: "strategy-source-newer-immature",
      firstFeedbackAt: "2026-06-30T12:00:00Z"
    });
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: true,
      preflight: false,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      tracks: [{
        id: "ai_applications",
        workflowId: "daily_ai_applications_xhs",
        topic: "daily AI application product launches and agent tooling news"
      }],
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("test");

    assert.equal(status.state, "ok");
    assert.equal(status.last_applied_strategy_count, 0);
    assert.deepEqual(status.last_applied_strategy_run_refs, []);
    assert.equal(status.last_blocked_strategy_count, 1);
    assert.deepEqual(status.last_blocked_strategy_source_run_refs, [`content/runs/${newer.runId}/run.json`]);
    assert.deepEqual(status.last_blocked_strategy_postures, ["collect_more_feedback"]);
    assert.deepEqual(status.last_blocked_strategy_source_titles, ["AI应用早报"]);
    assert.equal(status.last_blocked_strategy_reasons?.[0], "latest_strategy_not_auto_applicable:collect_more_feedback");
    assert.notDeepEqual(status.last_blocked_strategy_source_run_refs, [`content/runs/${older.runId}/run.json`]);
    const job = JSON.parse(await readFile(join(fixture.stateRoot, "content/daily/ai_applications/2026-07-01.json"), "utf8"));
    const run = JSON.parse(await readFile(join(fixture.stateRoot, job.run_ref), "utf8"));
    assert.equal(run.strategy, undefined);
    assert.equal(run.draft.title, "AI应用早报");
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop can execute configured publish path when explicit gates are enabled", async () => {
  const fixture = await createFixture();
  try {
    const dateKey = "2026-07-01";
    let imageProgressSeen = false;
    let publishProgressSeen = false;
    const fakeImageClient: ImageGenerationClient = {
      async generate(request) {
        const progress = JSON.parse(await readFile(join(fixture.stateRoot, "services/runtime/content_daily.json"), "utf8"));
        assert.equal(progress.state, "running");
        assert.equal(progress.current_step, "image_generation");
        assert.equal(progress.current_step_status, "started");
        assert.equal(progress.current_step_summary, "generating daily image");
        assert.equal(progress.current_track_index, 1);
        assert.equal(progress.current_track_count, 1);
        assert.match(progress.current_step_started_at, /^\d{4}-\d{2}-\d{2}T/);
        imageProgressSeen = true;
        return {
          provider: "openai-compatible",
          api: "images_generations",
          model: request.model ?? "gpt-image-2",
          responseId: "img_service_daily_123",
          mimeType: "image/png",
          bytes: Buffer.from("service daily image bytes", "utf8"),
          raw: { id: "img_service_daily_123" }
        };
      }
    };
    let publishCalls = 0;
    const fakePublisher: ExternalPublishClient = {
      async publish(request) {
        const progress = JSON.parse(await readFile(join(fixture.stateRoot, "services/runtime/content_daily.json"), "utf8"));
        assert.equal(progress.state, "running");
        assert.equal(progress.current_step, "publish_execute");
        assert.equal(progress.current_step_status, "started");
        assert.equal(progress.current_step_summary, "executing external publish");
        assert.equal(progress.current_track_index, 1);
        assert.equal(progress.current_track_count, 1);
        assert.match(progress.current_run_ref, /^content\/runs\/content_run_/);
        publishProgressSeen = true;
        publishCalls += 1;
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          tool: request.tool,
          post_id: "note_service_daily_123",
          post_url: "https://www.xiaohongshu.com/explore/note_service_daily_123"
        };
      }
    };
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: false,
      preflight: true,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.test/ai"],
      tickers: ["NVDA"],
      publishAdapter: "xiaohongshu-mcp",
      publishServerUrl: "http://localhost:18060/mcp",
      publishTool: "publish_content",
      publishEnabled: true,
      externalWriteConfirmed: true,
      loginStatus: "logged_in",
      adapterAvailable: true,
      imageClientFactory: async () => fakeImageClient,
      publisherFactory: async () => fakePublisher,
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "ok");
    assert.equal(status.publish_enabled, true);
    assert.equal(status.external_write_confirmed, true);
    assert.equal(status.last_job_status, "published");
    assert.equal(status.last_publish_count, 1);
    assert.equal(status.last_publish_published_count, 1);
    assert.equal(status.last_publish_direct_count, 1);
    assert.equal(status.last_publish_reconciled_count, 0);
    assert.equal(status.last_publish_failed_count, 0);
    assert.deepEqual(status.last_publish_adapters, ["xiaohongshu-mcp"]);
    assert.deepEqual(status.last_publish_tools, ["publish_content"]);
    assert.deepEqual(status.last_publish_run_refs, [status.last_run_ref]);
    assert.equal(status.last_publish_latest_title, "AI算力早报");
    assert.equal(status.last_publish_latest_route, "direct");
    assert.equal(status.last_publish_latest_post_id, "note_service_daily_123");
    assert.equal(status.last_publish_latest_post_url, "https://www.xiaohongshu.com/explore/note_service_daily_123");
    assert.equal(status.current_step, undefined);
    assert.equal(imageProgressSeen, true);
    assert.equal(publishProgressSeen, true);
    assert.equal(publishCalls, 1);

    const job = JSON.parse(await readFile(join(fixture.stateRoot, `content/daily/${dateKey}.json`), "utf8"));
    assert.equal(job.external_write, true);
    assert.equal(job.status, "published");
    assert.equal(job.steps.some((step: { id: string; status: string }) => step.id === "publish_execute" && step.status === "ok"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop advances an existing drafted same-day job to preflight", async () => {
  const fixture = await createFixture();
  try {
    const dateKey = "2026-07-01";
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const seeded = await runDailyContentJob(store, {
      dateKey,
      topic: "daily AI news and semiconductor stock hotspots",
      dryRun: true,
      preflight: false,
      fetchText: fakeFetch
    });
    let imageCalls = 0;
    const fakeImageClient: ImageGenerationClient = {
      async generate(request) {
        imageCalls += 1;
        return {
          provider: "openai-compatible",
          api: "images_generations",
          model: request.model ?? "gpt-image-2",
          responseId: "img_existing_drafted_123",
          mimeType: "image/png",
          bytes: Buffer.from("existing drafted image bytes", "utf8"),
          raw: { id: "img_existing_drafted_123" }
        };
      }
    };
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: false,
      preflight: true,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      topic: "daily AI news and semiconductor stock hotspots",
      publishAdapter: "xiaohongshu-mcp",
      publishServerUrl: "http://localhost:18060/mcp",
      publishTool: "publish_content",
      loginStatus: "logged_in",
      adapterAvailable: true,
      imageClientFactory: async () => fakeImageClient,
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("interval");
    assert.equal(status.state, "ok");
    assert.equal(status.last_job_ref, `content/daily/${dateKey}.json`);
    assert.equal(status.last_run_ref, seeded.run_ref);
    assert.equal(status.last_job_status, "preflight_ok");
    assert.equal(imageCalls, 1);

    const job = JSON.parse(await readFile(join(fixture.stateRoot, `content/daily/${dateKey}.json`), "utf8"));
    assert.equal(job.status, "preflight_ok");
    assert.equal(job.external_write, false);
    assert.equal(job.run_ref, seeded.run_ref);
    assert.equal(job.steps.some((step: { id: string; status: string }) => step.id === "image_generation" && step.status === "ok"), true);
    assert.equal(job.steps.some((step: { id: string; status: string }) => step.id === "publish_preflight" && step.status === "ok"), true);
    assert.equal(job.steps.some((step: { id: string; status: string }) => step.id === "publish_execute" && step.status === "skipped"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop publishes an existing preflight same-day job on interval", async () => {
  const fixture = await createFixture();
  try {
    const dateKey = "2026-07-01";
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const seeded = await runDailyContentJob(store, {
      dateKey,
      topic: "daily AI news and semiconductor stock hotspots",
      dryRun: false,
      preflight: true,
      publishAdapter: "xiaohongshu-mcp",
      publishServerUrl: "http://localhost:18060/mcp",
      publishTool: "publish_content",
      loginStatus: "logged_in",
      adapterAvailable: true,
      imageClient: {
        async generate(request) {
          return {
            provider: "openai-compatible",
            api: "images_generations",
            model: request.model ?? "gpt-image-2",
            responseId: "img_existing_preflight_123",
            mimeType: "image/png",
            bytes: Buffer.from("existing preflight image bytes", "utf8"),
            raw: { id: "img_existing_preflight_123" }
          };
        }
      },
      fetchText: fakeFetch
    });
    let publishCalls = 0;
    const fakePublisher: ExternalPublishClient = {
      async publish(request) {
        publishCalls += 1;
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          tool: request.tool,
          post_id: "note_existing_preflight_123",
          post_url: "https://www.xiaohongshu.com/explore/note_existing_preflight_123"
        };
      }
    };
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: false,
      preflight: true,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      topic: "daily AI news and semiconductor stock hotspots",
      publishAdapter: "xiaohongshu-mcp",
      publishServerUrl: "http://localhost:18060/mcp",
      publishTool: "publish_content",
      publishEnabled: true,
      externalWriteConfirmed: true,
      loginStatus: "logged_in",
      adapterAvailable: true,
      imageClientFactory: async () => {
        throw new Error("image client should not be needed for a preflight job");
      },
      publisherFactory: async () => fakePublisher,
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("interval");
    assert.equal(status.state, "ok");
    assert.equal(status.last_job_ref, `content/daily/${dateKey}.json`);
    assert.equal(status.last_run_ref, seeded.run_ref);
    assert.equal(status.last_job_status, "published");
    assert.equal(publishCalls, 1);

    const job = JSON.parse(await readFile(join(fixture.stateRoot, `content/daily/${dateKey}.json`), "utf8"));
    assert.equal(job.status, "published");
    assert.equal(job.external_write, true);
    assert.equal(job.run_ref, seeded.run_ref);
    assert.equal(job.steps.some((step: { id: string; status: string }) => step.id === "publish_execute" && step.status === "ok"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop defers external publish on startup but preserves interval automation", async () => {
  const fixture = await createFixture();
  try {
    const dateKey = "2026-07-02";
    let imageCalls = 0;
    const fakeImageClient: ImageGenerationClient = {
      async generate(request) {
        imageCalls += 1;
        return {
          provider: "openai-compatible",
          api: "images_generations",
          model: request.model ?? "gpt-image-2",
          responseId: "img_startup_guard_123",
          mimeType: "image/png",
          bytes: Buffer.from("startup guard image bytes", "utf8"),
          raw: { id: "img_startup_guard_123" }
        };
      }
    };
    let publishCalls = 0;
    const fakePublisher: ExternalPublishClient = {
      async publish(request) {
        publishCalls += 1;
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          tool: request.tool,
          post_id: "note_startup_guard_123",
          post_url: "https://www.xiaohongshu.com/explore/note_startup_guard_123"
        };
      }
    };
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: false,
      preflight: true,
      clock: () => new Date("2026-07-02T00:05:00.000Z"),
      dateKeyTimeZone: "UTC",
      topic: "daily AI news and semiconductor stock hotspots",
      publishAdapter: "xiaohongshu-mcp",
      publishServerUrl: "http://localhost:18060/mcp",
      publishTool: "publish_content",
      publishEnabled: true,
      externalWriteConfirmed: true,
      loginStatus: "logged_in",
      adapterAvailable: true,
      imageClientFactory: async () => fakeImageClient,
      publisherFactory: async () => fakePublisher,
      fetchText: fakeFetch
    });

    const startup = await loop.runOnce("startup");
    assert.equal(startup.state, "skipped");
    assert.equal(startup.last_date_key, dateKey);
    assert.equal(startup.last_job_count, 1);
    assert.equal(startup.last_job_ref, undefined);
    assert.equal(startup.last_run_ref, undefined);
    assert.equal(startup.last_job_status, undefined);
    assert.equal(startup.last_skip_reason, "startup_external_publish_deferred");
    assert.equal(imageCalls, 0);
    assert.equal(publishCalls, 0);
    assert.equal(existsSync(join(fixture.stateRoot, `content/daily/${dateKey}.json`)), false);

    const interval = await loop.runOnce("interval");
    assert.equal(interval.state, "ok");
    assert.equal(interval.last_job_ref, `content/daily/${dateKey}.json`);
    assert.equal(interval.last_job_status, "published");
    assert.equal(interval.last_skip_reason, undefined);
    assert.equal(imageCalls, 1);
    assert.equal(publishCalls, 1);

    const job = JSON.parse(await readFile(join(fixture.stateRoot, `content/daily/${dateKey}.json`), "utf8"));
    assert.equal(job.external_write, true);
    assert.equal(job.status, "published");
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop defers publishing an existing preflight job on startup", async () => {
  const fixture = await createFixture();
  try {
    const dateKey = "2026-07-01";
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const seeded = await runDailyContentJob(store, {
      dateKey,
      topic: "daily AI news and semiconductor stock hotspots",
      dryRun: false,
      preflight: true,
      publishAdapter: "xiaohongshu-mcp",
      publishServerUrl: "http://localhost:18060/mcp",
      publishTool: "publish_content",
      loginStatus: "logged_in",
      adapterAvailable: true,
      imageClient: {
        async generate(request) {
          return {
            provider: "openai-compatible",
            api: "images_generations",
            model: request.model ?? "gpt-image-2",
            responseId: "img_existing_startup_123",
            mimeType: "image/png",
            bytes: Buffer.from("existing startup image bytes", "utf8"),
            raw: { id: "img_existing_startup_123" }
          };
        }
      },
      fetchText: fakeFetch
    });
    let publishCalls = 0;
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: false,
      preflight: true,
      clock: () => new Date("2026-07-01T10:30:00.000Z"),
      dateKeyTimeZone: "UTC",
      topic: "daily AI news and semiconductor stock hotspots",
      publishAdapter: "xiaohongshu-mcp",
      publishServerUrl: "http://localhost:18060/mcp",
      publishTool: "publish_content",
      publishEnabled: true,
      externalWriteConfirmed: true,
      loginStatus: "logged_in",
      adapterAvailable: true,
      imageClientFactory: async () => {
        throw new Error("image client should not be needed for a preflight job");
      },
      publisherFactory: async () => ({
        async publish() {
          publishCalls += 1;
          return {
            ok: true,
            adapter: "xiaohongshu-mcp",
            post_id: "note_existing_startup_123"
          };
        }
      }),
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("startup");
    assert.equal(status.state, "skipped");
    assert.equal(status.last_job_ref, `content/daily/${dateKey}.json`);
    assert.equal(status.last_run_ref, seeded.run_ref);
    assert.equal(status.last_job_status, "preflight_ok");
    assert.equal(status.last_skip_reason, "startup_external_publish_deferred");
    assert.equal(publishCalls, 0);

    const job = JSON.parse(await readFile(join(fixture.stateRoot, `content/daily/${dateKey}.json`), "utf8"));
    assert.equal(job.status, "preflight_ok");
    assert.equal(job.external_write, false);
    assert.equal(job.steps.some((step: { id: string; status: string }) => step.id === "publish_execute" && step.status === "ok"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("content daily loop pauses when an active autonomy stop signal exists", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_content_daily",
      status: "active",
      reason: "Pause daily active exploration for operator review.",
      created_at: "2026-07-01T00:00:00.000Z"
    });
    const loop = createContentDailyLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      dryRun: true,
      preflight: false,
      sourceUrls: ["https://example.test/ai"],
      fetchText: fakeFetch
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "paused");
    assert.equal(status.pause_signal_ref, "autonomy/runs/pause_signal.json");
    assert.equal(status.pause_reason, "Pause daily active exploration for operator review.");
    assert.equal(status.last_job_ref, undefined);
    assert.deepEqual(await readdir(join(fixture.stateRoot, "content/daily")), []);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-content-daily-loop-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function createPublishedFeedbackSource(
  fixture: { repoRoot: string; stateRoot: string },
  args: {
    dateKey: string;
    trackId: string;
    workflowId: string;
    topic: string;
    postId: string;
    firstFeedbackAt?: string;
    secondFeedbackAt?: string;
    secondMetrics?: {
      viewCount: number;
      likeCount: number;
      commentCount: number;
      collectCount: number;
      shareCount: number;
    };
  }
): Promise<{ runId: string }> {
  const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
  const imageClient: ImageGenerationClient = {
    async generate(request) {
      return {
        provider: "openai-compatible",
        api: "images_generations",
        model: request.model ?? "gpt-image-2",
        responseId: `img_${args.postId}`,
        mimeType: "image/png",
        bytes: Buffer.from(`image bytes for ${args.postId}`, "utf8"),
        raw: { id: `img_${args.postId}` }
      };
    }
  };
  const job = await runDailyContentJob(store, {
    dateKey: args.dateKey,
    trackId: args.trackId,
    workflowId: args.workflowId,
    topic: args.topic,
    dryRun: false,
    preflight: false,
    publish: false,
    imageClient,
    fetchText: fakeFetch
  });
  await recordContentPublishEvidence(store, {
    runRef: job.run_id,
    status: "published",
    externalWrite: true,
    confirmedByOperator: true,
    loginStatus: "logged_in",
    postId: args.postId,
    postUrl: `https://www.xiaohongshu.com/explore/${args.postId}`
  });
  const first = await recordContentFeedbackEvidence(store, {
    runRef: job.run_id,
    capturedBy: "operator",
    viewCount: 12,
    likeCount: 1,
    commentCount: 0,
    collectCount: 0,
    shareCount: 0,
    sourceRef: `channels/xhs/feedback/${args.postId}-first.json`
  });
  await store.writeJson(first.evidence_ref, {
    ...first.evidence,
    created_at: args.firstFeedbackAt ?? "2026-06-30T10:00:00Z"
  });
  if (args.secondMetrics) {
    const second = await recordContentFeedbackEvidence(store, {
      runRef: job.run_id,
      capturedBy: "operator",
      ...args.secondMetrics,
      sourceRef: `channels/xhs/feedback/${args.postId}-second.json`
    });
    await store.writeJson(second.evidence_ref, {
      ...second.evidence,
      created_at: args.secondFeedbackAt ?? "2026-06-30T12:00:00Z"
    });
  }
  return { runId: job.run_id };
}

async function fakeFetch(url: string) {
  if (url.includes("api.nasdaq.com")) {
    return {
      url,
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      text: JSON.stringify({
        data: {
          symbol: "NVDA",
          companyName: "NVIDIA Corporation Common Stock",
          primaryData: {
            lastSalePrice: "$101.00",
            netChange: "+1.00",
            percentageChange: "+1.00%",
            lastTradeTimestamp: recentIso(1),
            volume: "12,345"
          },
          marketStatus: "Closed"
        }
      })
    };
  }
  return {
    url,
    ok: true,
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    text: JSON.stringify({
      hits: [{
        title: "Frontier AI model releases support enterprise adoption",
        created_at: recentIso(2)
      }]
    })
  };
}

function recentIso(hoursAgo = 2): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}
