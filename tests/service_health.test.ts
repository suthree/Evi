import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "../apps/cli/src/main.js";
import { getServiceHealth } from "../packages/core/src/service_health.js";
import { AgentStore } from "../packages/core/src/store.js";

test("service health derives fresh resident runtime status from local state and repo identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await writeRepoHead(store, "abcdef0123456789abcdef0123456789abcdef01");
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 1234,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-30T00:00:30.000Z",
      gateway: {
        state: "running",
        channels: [{
          kind: "feishu",
          channel_id: "feishu-main",
          state: "running",
          detail: "feishu:feishu-main"
        }, {
          kind: "web",
          channel_id: "127.0.0.1:8765",
          state: "running",
          detail: "http://127.0.0.1:8765"
        }]
      },
      runtime_build: {
        schema_version: 1,
        target: "im",
        runtime_current_root: join(root, "home/service/runtime/current"),
        repo_root: join(root, "repo"),
        built_at: "2026-06-30T00:00:20.000Z",
        node_version: "v24.0.0",
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });
    await store.writeJson("services/im/review_tick.json", {
      service: "review_tick",
      state: "disabled",
      enabled: false,
      updated_at: "2026-06-30T00:00:31.000Z",
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
      last_focus_current_status: "active",
      last_focus_current_ref: "autonomy/inbox/review_inbox_health.json",
      last_focus_current_backlog_status: "open",
      last_focus_current_reason: "selected review tick focus is still present in the current opportunity backlog",
      last_auto_action_status: "executed",
      last_auto_action_ref: "autonomy/opportunity-actions/opportunity_action_health.json",
      last_auto_action_opportunity_id: "archive_health_stale_2026_06_30",
      last_auto_action_opportunity_kind: "archive_health",
      last_auto_action_result_ref: "memory/archives/2026-06-30.json",
      last_auto_action_summary: "archive_refresh: healthy, remaining=0",
      next_wake_at: "2026-06-30T00:30:31.000Z",
      next_wake_delay_ms: 1_800_000,
      next_wake_reason: "interval",
      last_focus: {
        source: "opportunity_backlog",
        reason: "Inspect top self-evolution item.",
        query: null,
        opportunity: {
          ref: "autonomy/inbox/review_inbox_health.json",
          id: "review_inbox_health",
          kind: "review_inbox",
          status: "open",
          score: 75,
          action_kind: "narrow_review",
          action_chain: [{
            label: "inspect",
            effect: "read_only",
            reason: "Inspect the bounded read model first."
          }, {
            label: "record_decision",
            effect: "state_decision"
          }]
        }
      }
    });

    const health = await getServiceHealth(store, {
      now: "2026-06-30T00:01:00.000Z"
    });

    assert.equal(health.status, "healthy");
    assert.deepEqual(health.status_reasons, []);
    assert.equal(health.layers.runtime_substrate.status, "healthy");
    assert.deepEqual(health.layers.runtime_substrate.reason_codes, []);
    assert.equal(health.layers.application_slices.status, "healthy");
    assert.deepEqual(health.layers.application_slices.reason_codes, []);
    assert.equal(health.im.state, "running");
    assert.equal(health.im.heartbeat_freshness, "fresh");
    assert.equal(health.im.heartbeat_age_ms, 30_000);
    assert.equal(health.im.gateway?.state, "running");
    assert.deepEqual(health.im.gateway?.channels.map((channel) => `${channel.kind}:${channel.state}`), [
      "feishu:running",
      "web:running"
    ]);
    assert.equal(health.im.runtime_build?.source_commit_short, "abcdef012345");
    assert.equal(health.im.repo_head.read_status, "ok");
    assert.equal(health.im.repo_head.head_commit_short, "abcdef012345");
    assert.equal(health.im.deployment.status, "current");
    assert.match(health.im.deployment.reason, /matches current repo HEAD/);
    assert.equal(health.review_tick.last_inbox_count, 3);
    assert.equal(health.review_tick.last_active_tick_inbox_count, 1);
    assert.equal(health.review_tick.last_active_inbox_count, 2);
    assert.equal(health.review_tick.last_inactive_tick_inbox_count, 2);
    assert.deepEqual(health.review_tick.last_inactive_tick_inbox_reasons, {
      executed_status: 1,
      terminal_decision_completed: 1
    });
    assert.deepEqual(health.review_tick.last_inactive_tick_inbox_refs, [
      "autonomy/inbox/review_inbox_completed.json",
      "autonomy/inbox/review_inbox_executed.json"
    ]);
    assert.equal(health.review_tick.last_focus?.source, "opportunity_backlog");
    assert.equal(health.review_tick.last_focus?.opportunity?.kind, "review_inbox");
    assert.equal(health.review_tick.last_focus_current_status, "active");
    assert.equal(health.review_tick.last_focus_current_ref, "autonomy/inbox/review_inbox_health.json");
    assert.equal(health.review_tick.last_focus_current_backlog_status, "open");
    assert.match(health.review_tick.last_focus_current_reason ?? "", /still present/);
    assert.equal(health.review_tick.last_auto_action_status, "executed");
    assert.equal(health.review_tick.last_auto_action_ref, "autonomy/opportunity-actions/opportunity_action_health.json");
    assert.equal(health.review_tick.last_auto_action_opportunity_id, "archive_health_stale_2026_06_30");
    assert.equal(health.review_tick.last_auto_action_opportunity_kind, "archive_health");
    assert.equal(health.review_tick.last_auto_action_result_ref, "memory/archives/2026-06-30.json");
    assert.equal(health.review_tick.last_auto_action_summary, "archive_refresh: healthy, remaining=0");
    assert.equal(health.review_tick.next_wake_at, "2026-06-30T00:30:31.000Z");
    assert.equal(health.review_tick.next_wake_delay_ms, 1_800_000);
    assert.equal(health.review_tick.next_wake_reason, "interval");
    assert.deepEqual(health.review_tick.last_focus?.opportunity?.action_chain?.map((step) => `${step.label}:${step.effect}`), [
      "inspect:read_only",
      "record_decision:state_decision"
    ]);
    assert.equal(health.autonomy_pause.active, false);
    assert.deepEqual(health.refs, [
      "services/im/heartbeat.json",
      "services/im/review_tick.json"
    ]);
    assert.match(health.boundary, /bounded repo git identity/);
    assert.match(health.boundary, /does not inspect launchd/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service health marks stale review tick focus as covered by a later manual act-next action", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  const gapId = "gap_feedback_refresh_route_review_2026_07_02t07_32_39_833z";
  const gapRef = `self-evolution/gaps/${gapId}.json`;
  try {
    await writeRepoHead(store, "abcdef0123456789abcdef0123456789abcdef01");
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 1234,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-07-02T07:33:30.000Z",
      runtime_build: {
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });
    await store.writeJson("services/im/review_tick.json", {
      service: "review_tick",
      state: "ok",
      enabled: true,
      updated_at: "2026-07-02T07:32:40.244Z",
      last_focus_current_status: "active",
      last_focus_current_ref: gapRef,
      last_focus_current_backlog_status: "active",
      last_focus_current_reason: "selected review tick focus is still present in the current opportunity backlog",
      last_focus: {
        source: "backlog_actionable",
        reason: `selected top backlog item self_evolution_gap:${gapId} is already actionable`,
        query: null,
        opportunity: {
          ref: gapRef,
          id: gapId,
          kind: "self_evolution_gap",
          status: "active",
          score: 100,
          action_kind: "act_next",
          source_ref: "services/im/content_feedback_refresh.json"
        }
      }
    });
    await store.writeJson("autonomy/opportunity-actions/opportunity_action_before_tick.json", {
      schema_version: 1,
      id: "opportunity_action_before_tick",
      kind: "opportunity_action",
      action: "act-next",
      status: "executed",
      selected_opportunity_id: gapId,
      selected_opportunity_ref: gapRef,
      selected_gap_id: gapId,
      selected_gap_ref: gapRef,
      proposed_slice: "feedback_refresh_route_review",
      result_ref: "content/feedback-refresh-route-reviews/old.json",
      created_at: "2026-07-02T07:31:04Z"
    });
    await store.writeJson("autonomy/opportunity-actions/opportunity_action_manual_focus.json", {
      schema_version: 1,
      id: "opportunity_action_manual_focus",
      kind: "opportunity_action",
      action: "act-next",
      status: "executed",
      selected_opportunity_id: gapId,
      selected_opportunity_ref: gapRef,
      selected_gap_id: gapId,
      selected_gap_ref: gapRef,
      proposed_slice: "feedback_refresh_route_review",
      result_ref: "content/feedback-refresh-route-reviews/content_feedback_refresh_route_review_20260702073304_2d9f4c85.json",
      created_at: "2026-07-02T07:33:04Z"
    });

    const health = await getServiceHealth(store, {
      now: "2026-07-02T07:33:30.000Z"
    });

    assert.equal(health.status, "healthy");
    assert.equal(health.review_tick.last_focus_current_status, "covered_by_manual_action");
    assert.equal(
      health.review_tick.last_focus_current_ref,
      "autonomy/opportunity-actions/opportunity_action_manual_focus.json"
    );
    assert.equal(health.review_tick.last_focus_current_backlog_status, undefined);
    assert.match(health.review_tick.last_focus_current_reason ?? "", /feedback_refresh_route_review/);
    assert.match(health.boundary, /latest local opportunity action coverage metadata/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service health flags blocked review tick auto-actions", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await writeRepoHead(store, "abcdef0123456789abcdef0123456789abcdef01");
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 1234,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-30T00:00:30.000Z",
      runtime_build: {
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });
    await store.writeJson("services/im/review_tick.json", {
      service: "review_tick",
      state: "ok",
      enabled: true,
      updated_at: "2026-06-30T00:00:31.000Z",
      last_focus_current_status: "resolved",
      last_focus_current_reason: "selected review tick focus is no longer present in the current opportunity backlog",
      last_auto_action_status: "blocked",
      last_auto_action_ref: "autonomy/opportunity-actions/opportunity_action_blocked.json",
      last_auto_action_opportunity_id: "archive_health_stale_2026_06_30",
      last_auto_action_opportunity_kind: "archive_health",
      last_auto_action_summary: "archive refresh left 1 issue(s)"
    });

    const health = await getServiceHealth(store, {
      now: "2026-06-30T00:01:00.000Z"
    });

    assert.equal(health.status, "attention");
    assert.equal(health.layers.runtime_substrate.status, "attention");
    assert.deepEqual(health.layers.runtime_substrate.reason_codes, ["review_tick_auto_action_blocked"]);
    assert.equal(health.layers.application_slices.status, "healthy");
    assert.deepEqual(health.status_reasons, ["review_tick_auto_action_blocked"]);
    assert.equal(health.review_tick.last_focus_current_status, "resolved");
    assert.match(health.review_tick.last_focus_current_reason ?? "", /no longer present/);
    assert.equal(health.review_tick.last_auto_action_status, "blocked");
    assert.equal(health.review_tick.last_auto_action_summary, "archive refresh left 1 issue(s)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service health flags resident runtime build that is stale against repo HEAD", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await writeRepoHead(store, "fedcba9876543210fedcba9876543210fedcba98");
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 5678,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-30T00:00:50.000Z",
      runtime_build: {
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });

    const health = await getServiceHealth(store, {
      now: "2026-06-30T00:01:00.000Z"
    });

    assert.equal(health.status, "attention");
    assert.equal(health.layers.runtime_substrate.status, "attention");
    assert.equal(health.layers.runtime_substrate.reason_codes.includes("deployment_stale"), true);
    assert.equal(health.layers.application_slices.status, "healthy");
    assert.equal(health.im.heartbeat_freshness, "fresh");
    assert.equal(health.im.runtime_build?.source_is_dirty, false);
    assert.equal(health.im.repo_head.read_status, "ok");
    assert.equal(health.im.repo_head.head_commit_short, "fedcba987654");
    assert.equal(health.im.deployment.status, "stale");
    assert.equal(health.im.deployment.runtime_commit_short, "abcdef012345");
    assert.equal(health.im.deployment.repo_commit_short, "fedcba987654");
    assert.match(health.im.deployment.reason, /differs from current repo HEAD/);
    assert.equal(
      health.im.deployment.restart_command,
      "pnpm run runtime -- service restart --target im --scenario im-default --channel feishu-main"
    );
    assert.doesNotMatch(health.im.deployment.restart_command, /--state-root/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service health includes resident content loop status and flags loop errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await writeRepoHead(store, "abcdef0123456789abcdef0123456789abcdef01");
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 2468,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-30T00:00:50.000Z",
      runtime_build: {
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });
    await store.writeJson("services/im/content_daily.json", {
      service: "content_daily",
      enabled: true,
      state: "error",
      updated_at: "2026-06-30T00:00:52.000Z",
      last_finished_at: "2026-06-30T00:00:52.000Z",
      last_date_key: "2026-06-30",
      last_track_id: "ai_applications",
      last_job_status: "failed",
      last_job_count: 1,
      last_applied_strategy_count: 1,
      last_applied_strategy_run_refs: ["content/runs/content_run_daily/run.json"],
      last_applied_strategy_source_run_refs: ["content/runs/content_run_feedback/run.json"],
      last_applied_strategy_postures: ["reuse_baseline"],
      last_applied_strategy_source_titles: ["AI应用早报"],
      last_blocked_strategy_count: 1,
      last_blocked_strategy_source_run_refs: ["content/runs/content_run_blocked/run.json"],
      last_blocked_strategy_postures: ["collect_more_feedback"],
      last_blocked_strategy_source_titles: ["AI算力早报"],
      last_blocked_strategy_reasons: ["latest_strategy_not_auto_applicable:collect_more_feedback"],
      last_blocked_strategy_next_commands: ["pnpm run runtime -- content creator-metrics-capture --run content_run_blocked --state-root <state-root>"],
      last_publish_count: 2,
      last_publish_published_count: 2,
      last_publish_direct_count: 1,
      last_publish_reconciled_count: 1,
      last_publish_failed_count: 0,
      last_publish_adapters: ["xiaohongshu-mcp"],
      last_publish_tools: ["publish_content"],
      last_publish_run_refs: [
        "content/runs/content_run_daily/run.json",
        "content/runs/content_run_reconciled/run.json"
      ],
      last_publish_latest_run_ref: "content/runs/content_run_daily/run.json",
      last_publish_latest_title: "AI应用早报",
      last_publish_latest_route: "direct",
      last_publish_latest_post_id: "note_service_health_123",
      last_publish_latest_post_url: "https://www.xiaohongshu.com/explore/note_service_health_123",
      error: "image generation failed"
    });
    await store.writeJson("services/im/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "skipped",
      updated_at: "2026-06-30T00:00:53.000Z",
      last_queue_count: 2,
      last_due_count: 0,
      last_deferred_count: 2,
      last_captured_count: 0,
      last_skipped_count: 1,
      last_top_skip_reason: "non_mcp_capture_route",
      last_skip_reason_counts: {
        non_mcp_capture_route: 1
      },
      last_skipped_item_refs: ["content/runs/content_run_skipped/run.json"],
      last_deferred_item_refs: ["content/runs/content_run_feedback/run.json"],
      last_strategy_created_at: "2026-06-30T00:00:53.000Z",
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
      last_strategy_top_run_ref: "content/runs/content_run_feedback/run.json",
      last_strategy_next_command: "pnpm run runtime -- content feedback-capture --run content_run_feedback --server-url http://localhost:18060/mcp --state-root <state-root>",
      last_strategy_item_refs: ["content/runs/content_run_feedback/run.json"],
      next_due_at: "2026-06-30T06:00:00.000Z",
      next_due_run_id: "content_run_feedback",
      next_due_run_ref: "content/runs/content_run_feedback/run.json",
      next_due_reason: "needs_follow_up",
      next_due_command: "pnpm run runtime -- content feedback-capture --run content_run_feedback --server-url http://localhost:18060/mcp --state-root <state-root>",
      next_wake_at: "2026-06-30T06:00:00.000Z",
      next_wake_delay_ms: 21_540_000,
      next_wake_reason: "next_due_at"
    });
    await store.writeJson("services/im/content_creator_metrics.json", {
      service: "content_creator_metrics",
      enabled: true,
      state: "ok",
      updated_at: "2026-06-30T00:00:54.000Z",
      last_queue_count: 1,
      last_captured_count: 1,
      last_blocked_count: 0,
      last_failed_count: 0,
      last_run_refs: ["content/runs/content_run_feedback/run.json"],
      last_feedback_refs: ["content/runs/content_run_feedback/feedback/feedback_1.json"],
      last_next_commands: ["pnpm run runtime -- content creator-metrics-capture --run content_run_feedback --state-root <state-root>"],
      next_due_at: "2026-06-30T06:00:00.000Z",
      next_due_run_id: "content_run_feedback",
      next_due_run_ref: "content/runs/content_run_feedback/run.json",
      next_due_command: "pnpm run runtime -- content creator-metrics-capture --run content_run_feedback --state-root <state-root>",
      next_wake_at: "2026-06-30T01:00:54.000Z",
      next_wake_delay_ms: 3_600_000,
      next_wake_reason: "interval"
    });

    const health = await getServiceHealth(store, {
      now: "2026-06-30T00:01:00.000Z"
    });

    assert.equal(health.status, "attention");
    assert.equal(health.layers.runtime_substrate.status, "healthy");
    assert.deepEqual(health.layers.runtime_substrate.reason_codes, []);
    assert.equal(health.layers.application_slices.status, "attention");
    assert.deepEqual(health.layers.application_slices.reason_codes, ["content_daily_loop_attention"]);
    assert.deepEqual(health.status_reasons, ["content_daily_loop_attention"]);
    assert.equal(health.content_daily.state, "error");
    assert.equal(health.content_daily.enabled, true);
    assert.equal(health.content_daily.last_job_status, "failed");
    assert.equal(health.content_daily.last_job_count, 1);
    assert.equal(health.content_daily.last_applied_strategy_count, 1);
    assert.deepEqual(health.content_daily.last_applied_strategy_run_refs, ["content/runs/content_run_daily/run.json"]);
    assert.deepEqual(health.content_daily.last_applied_strategy_source_run_refs, ["content/runs/content_run_feedback/run.json"]);
    assert.deepEqual(health.content_daily.last_applied_strategy_postures, ["reuse_baseline"]);
    assert.deepEqual(health.content_daily.last_applied_strategy_source_titles, ["AI应用早报"]);
    assert.equal(health.content_daily.last_blocked_strategy_count, 1);
    assert.deepEqual(health.content_daily.last_blocked_strategy_source_run_refs, ["content/runs/content_run_blocked/run.json"]);
    assert.deepEqual(health.content_daily.last_blocked_strategy_postures, ["collect_more_feedback"]);
    assert.deepEqual(health.content_daily.last_blocked_strategy_source_titles, ["AI算力早报"]);
    assert.deepEqual(health.content_daily.last_blocked_strategy_reasons, ["latest_strategy_not_auto_applicable:collect_more_feedback"]);
    assert.deepEqual(health.content_daily.last_blocked_strategy_next_commands, ["pnpm run runtime -- content creator-metrics-capture --run content_run_blocked --state-root <state-root>"]);
    assert.equal(health.content_daily.last_publish_count, 2);
    assert.equal(health.content_daily.last_publish_published_count, 2);
    assert.equal(health.content_daily.last_publish_direct_count, 1);
    assert.equal(health.content_daily.last_publish_reconciled_count, 1);
    assert.equal(health.content_daily.last_publish_failed_count, 0);
    assert.deepEqual(health.content_daily.last_publish_adapters, ["xiaohongshu-mcp"]);
    assert.deepEqual(health.content_daily.last_publish_tools, ["publish_content"]);
    assert.deepEqual(health.content_daily.last_publish_run_refs, [
      "content/runs/content_run_daily/run.json",
      "content/runs/content_run_reconciled/run.json"
    ]);
    assert.equal(health.content_daily.last_publish_latest_run_ref, "content/runs/content_run_daily/run.json");
    assert.equal(health.content_daily.last_publish_latest_title, "AI应用早报");
    assert.equal(health.content_daily.last_publish_latest_route, "direct");
    assert.equal(health.content_daily.last_publish_latest_post_id, "note_service_health_123");
    assert.equal(health.content_daily.last_publish_latest_post_url, "https://www.xiaohongshu.com/explore/note_service_health_123");
    assert.equal(health.content_daily.error, "image generation failed");
    assert.equal(health.content_feedback_refresh.state, "skipped");
    assert.equal(health.content_feedback_refresh.last_queue_count, 2);
    assert.equal(health.content_feedback_refresh.last_skipped_count, 1);
    assert.equal(health.content_feedback_refresh.last_top_skip_reason, "non_mcp_capture_route");
    assert.deepEqual(health.content_feedback_refresh.last_skip_reason_counts, {
      non_mcp_capture_route: 1
    });
    assert.equal(health.content_feedback_refresh.last_strategy_captured_by, "xiaohongshu-mcp");
    assert.equal(health.content_feedback_refresh.last_strategy_suggestion_count, 2);
    assert.equal(health.content_feedback_refresh.last_strategy_collect_more_feedback_count, 2);
    assert.equal(health.content_feedback_refresh.last_strategy_top_posture, "collect_more_feedback");
    assert.equal(health.content_feedback_refresh.last_strategy_top_run_ref, "content/runs/content_run_feedback/run.json");
    assert.equal(health.content_feedback_refresh.last_strategy_next_command, "pnpm run runtime -- content feedback-capture --run content_run_feedback --server-url http://localhost:18060/mcp --state-root <state-root>");
    assert.deepEqual(health.content_feedback_refresh.last_strategy_item_refs, ["content/runs/content_run_feedback/run.json"]);
    assert.deepEqual(health.content_feedback_refresh.last_skipped_item_refs, ["content/runs/content_run_skipped/run.json"]);
    assert.deepEqual(health.content_feedback_refresh.last_deferred_item_refs, ["content/runs/content_run_feedback/run.json"]);
    assert.equal(health.content_feedback_refresh.next_due_at, "2026-06-30T06:00:00.000Z");
    assert.equal(health.content_feedback_refresh.next_due_run_id, "content_run_feedback");
    assert.equal(health.content_feedback_refresh.next_due_run_ref, "content/runs/content_run_feedback/run.json");
    assert.equal(health.content_feedback_refresh.next_due_reason, "needs_follow_up");
    assert.equal(health.content_feedback_refresh.next_due_command, "pnpm run runtime -- content feedback-capture --run content_run_feedback --server-url http://localhost:18060/mcp --state-root <state-root>");
    assert.equal(health.content_feedback_refresh.next_wake_at, "2026-06-30T06:00:00.000Z");
    assert.equal(health.content_feedback_refresh.next_wake_delay_ms, 21_540_000);
    assert.equal(health.content_feedback_refresh.next_wake_reason, "next_due_at");
    assert.equal(health.content_creator_metrics.state, "ok");
    assert.equal(health.content_creator_metrics.enabled, true);
    assert.equal(health.content_creator_metrics.last_queue_count, 1);
    assert.equal(health.content_creator_metrics.last_captured_count, 1);
    assert.equal(health.content_creator_metrics.last_blocked_count, 0);
    assert.deepEqual(health.content_creator_metrics.last_run_refs, ["content/runs/content_run_feedback/run.json"]);
    assert.deepEqual(health.content_creator_metrics.last_feedback_refs, ["content/runs/content_run_feedback/feedback/feedback_1.json"]);
    assert.deepEqual(health.content_creator_metrics.last_next_commands, ["pnpm run runtime -- content creator-metrics-capture --run content_run_feedback --state-root <state-root>"]);
    assert.equal(health.content_creator_metrics.next_due_at, "2026-06-30T06:00:00.000Z");
    assert.equal(health.content_creator_metrics.next_due_run_id, "content_run_feedback");
    assert.equal(health.content_creator_metrics.next_due_run_ref, "content/runs/content_run_feedback/run.json");
    assert.equal(health.content_creator_metrics.next_due_command, "pnpm run runtime -- content creator-metrics-capture --run content_run_feedback --state-root <state-root>");
    assert.equal(health.content_creator_metrics.next_wake_at, "2026-06-30T01:00:54.000Z");
    assert.equal(health.content_creator_metrics.next_wake_delay_ms, 3_600_000);
    assert.equal(health.content_creator_metrics.next_wake_reason, "interval");
    assert.deepEqual(health.refs, [
      "services/im/heartbeat.json",
      "services/im/content_daily.json",
      "services/im/content_feedback_refresh.json",
      "services/im/content_creator_metrics.json"
    ]);
    assert.match(health.boundary, /resident loop status/);
    assert.match(health.boundary, /fetch platform state/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service health derives effective daily status from linked published runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await writeRepoHead(store, "abcdef0123456789abcdef0123456789abcdef01");
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 2468,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-30T00:00:50.000Z",
      runtime_build: {
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });
    await store.writeJson("services/im/content_daily.json", {
      service: "content_daily",
      enabled: true,
      state: "skipped",
      updated_at: "2026-06-30T00:00:52.000Z",
      last_finished_at: "2026-06-30T00:00:52.000Z",
      last_date_key: "2026-06-30",
      last_track_id: "ai_compute_market",
      last_job_ref: "content/daily/ai_compute_market/2026-06-30.json",
      last_job_refs: [
        "content/daily/ai_applications/2026-06-30.json",
        "content/daily/ai_compute_market/2026-06-30.json"
      ],
      last_job_status: "preflight_ok",
      last_job_count: 2
    });
    await store.writeJson("content/daily/ai_applications/2026-06-30.json", {
      status: "preflight_ok",
      run_id: "content_run_apps",
      run_ref: "content/runs/content_run_apps/run.json"
    });
    await store.writeJson("content/daily/ai_compute_market/2026-06-30.json", {
      status: "preflight_ok",
      run_id: "content_run_compute",
      run_ref: "content/runs/content_run_compute/run.json"
    });
    await store.writeJson("content/runs/content_run_apps/run.json", {
      status: "published",
      evidence: { publish_status: "published" }
    });
    await store.writeJson("content/runs/content_run_compute/run.json", {
      status: "ready_for_publish",
      evidence: { publish_status: "published" }
    });

    const health = await getServiceHealth(store, {
      now: "2026-06-30T00:01:00.000Z"
    });

    assert.equal(health.status, "healthy");
    assert.equal(health.content_daily.last_job_status, "preflight_ok");
    assert.equal(health.content_daily.last_effective_job_status, "published");
    assert.equal(health.content_daily.last_job_count, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service health flags stale content daily progress while preserving step context", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await writeRepoHead(store, "abcdef0123456789abcdef0123456789abcdef01");
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 2468,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-30T00:10:00.000Z",
      runtime_build: {
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });
    await store.writeJson("services/im/content_daily.json", {
      service: "content_daily",
      enabled: true,
      state: "running",
      updated_at: "2026-06-30T00:01:00.000Z",
      last_started_at: "2026-06-30T00:00:00.000Z",
      last_date_key: "2026-06-30",
      last_job_count: 2,
      current_track_id: "ai_compute_market",
      current_track_index: 2,
      current_track_count: 2,
      current_step: "publish_execute",
      current_step_status: "started",
      current_step_summary: "executing external publish",
      current_step_started_at: "2026-06-30T00:00:00.000Z",
      current_step_updated_at: "2026-06-30T00:00:00.000Z",
      current_job_ref: "content/daily/ai_compute_market/2026-06-30.json",
      current_run_ref: "content/runs/content_run_compute/run.json"
    });

    const health = await getServiceHealth(store, {
      now: "2026-06-30T00:10:00.000Z",
      contentDailyStepStaleAfterMs: 5 * 60 * 1000
    });

    assert.equal(health.status, "attention");
    assert.equal(health.content_daily.current_step, "publish_execute");
    assert.equal(health.content_daily.current_step_status, "started");
    assert.equal(health.content_daily.current_track_id, "ai_compute_market");
    assert.equal(health.content_daily.current_track_index, 2);
    assert.equal(health.content_daily.current_track_count, 2);
    assert.equal(health.content_daily.current_step_age_ms, 600_000);
    assert.equal(health.content_daily.current_step_freshness, "stale");
    assert.equal(health.content_daily.current_job_ref, "content/daily/ai_compute_market/2026-06-30.json");
    assert.equal(health.content_daily.current_run_ref, "content/runs/content_run_compute/run.json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service health flags stale heartbeat and active pause without mutating state", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 4321,
      updated_at: "2026-06-30T00:00:00.000Z",
      runtime_build: {
        source_commit_short: "dirtycommit",
        source_branch: "develop",
        source_is_dirty: true
      }
    });
    await store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_health",
      action_type: "pause_autonomy",
      status: "active",
      reason: "Operator is reviewing the self-evolution direction.",
      resume_hint: "Resume after review."
    });

    const health = await getServiceHealth(store, {
      now: "2026-06-30T00:05:00.000Z"
    });

    assert.equal(health.status, "paused");
    assert.equal(health.im.heartbeat_freshness, "stale");
    assert.equal(health.im.heartbeat_age_ms, 300_000);
    assert.equal(health.im.runtime_build?.source_is_dirty, true);
    assert.equal(health.review_tick.state, "unknown");
    assert.equal(health.autonomy_pause.active, true);
    assert.equal(health.autonomy_pause.reason, "Operator is reviewing the self-evolution direction.");
    assert.deepEqual(health.refs, [
      "services/im/heartbeat.json",
      "autonomy/runs/pause_signal.json"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeRepoHead(store: AgentStore, commit: string, branch = "develop"): Promise<void> {
  await store.writeRepoText(".git/HEAD", `ref: refs/heads/${branch}\n`);
  await store.writeRepoText(`.git/refs/heads/${branch}`, `${commit}\n`);
}

test("service health reports missing heartbeat as unknown", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const health = await getServiceHealth(store, {
      now: "2026-06-30T00:00:00.000Z"
    });

    assert.equal(health.status, "unknown");
    assert.equal(health.im.heartbeat_freshness, "missing");
    assert.equal(health.im.state, "unknown");
    assert.deepEqual(health.refs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service health CLI reads bounded health without service control fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-cli-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const originalArgv = process.argv;
  const originalLog = console.log;
  const logs: string[] = [];
  try {
    await store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 9876,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: new Date().toISOString(),
      runtime_build: {
        source_commit_short: "clihealth123",
        source_branch: "develop",
        source_is_dirty: false
      }
    });

    process.argv = [
      "node",
      "apps/cli/src/main.ts",
      "service",
      "health",
      "--repo-root",
      repoRoot,
      "--state-root",
      stateRoot
    ];
    console.log = (value?: unknown): void => {
      logs.push(String(value));
    };

    const code = await main();
    assert.equal(code, 0);
    const output = JSON.parse(logs.join("\n")) as Record<string, unknown>;
    assert.equal(output.action, "health");
    assert.equal(output.target, "im");
    assert.equal(output.status, "healthy");
    assert.deepEqual(output.refs, ["services/im/heartbeat.json"]);
    assert.equal("launchd" in output, false);
    assert.equal("logs" in output, false);
    assert.match(String(output.boundary), /does not inspect launchd/);
  } finally {
    process.argv = originalArgv;
    console.log = originalLog;
    await rm(root, { recursive: true, force: true });
  }
});

test("service health CLI reads runtime target through the bounded health model", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-runtime-cli-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const originalArgv = process.argv;
  const originalLog = console.log;
  const logs: string[] = [];
  try {
    await store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 9877,
      updated_at: new Date().toISOString(),
      gateway: {
        state: "running",
        channels: [{
          kind: "web",
          channel_id: "127.0.0.1:8765",
          state: "running",
          detail: "http://127.0.0.1:8765"
        }]
      }
    });

    process.argv = [
      "node",
      "apps/cli/src/main.ts",
      "service",
      "health",
      "--target",
      "runtime",
      "--repo-root",
      repoRoot,
      "--state-root",
      stateRoot
    ];
    console.log = (value?: unknown): void => {
      logs.push(String(value));
    };

    const code = await main();
    assert.equal(code, 0);
    const output = JSON.parse(logs.join("\n")) as Record<string, any>;
    assert.equal(output.action, "health");
    assert.equal(output.target, "runtime");
    assert.equal(output.status, "healthy");
    assert.equal(output.service.state, "running");
    assert.equal(output.service.heartbeat_freshness, "fresh");
    assert.equal(output.service.gateway.state, "running");
    assert.deepEqual(output.service.gateway.channels.map((channel: Record<string, unknown>) => `${channel.kind}:${channel.state}`), [
      "web:running"
    ]);
    assert.deepEqual(output.refs, ["services/runtime/heartbeat.json"]);
    assert.equal("launchd" in output, false);
    assert.equal("logs" in output, false);
    assert.match(String(output.boundary), /does not inspect launchd/);
  } finally {
    process.argv = originalArgv;
    console.log = originalLog;
    await rm(root, { recursive: true, force: true });
  }
});

test("service health CLI defaults to the home-scoped service state root", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-service-health-default-"));
  const repoRoot = join(root, "repo");
  const configDir = join(repoRoot, "config");
  const homeRoot = join(root, "home");
  const repoStateRoot = join(root, "repo-state");
  const serviceStateRoot = join(homeRoot, "state/runtime");
  const serviceStore = new AgentStore(repoRoot, serviceStateRoot);
  const originalArgv = process.argv;
  const originalLog = console.log;
  const logs: string[] = [];
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: repoStateRoot })
    ].join("\n") + "\n", "utf8");
    await serviceStore.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 2468,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: new Date().toISOString(),
      runtime_build: {
        source_commit_short: "defaultstate",
        source_branch: "develop",
        source_is_dirty: false
      }
    });

    process.argv = [
      "node",
      "apps/cli/src/main.ts",
      "service",
      "health",
      "--repo-root",
      repoRoot,
      "--config-dir",
      configDir
    ];
    console.log = (value?: unknown): void => {
      logs.push(String(value));
    };

    const code = await main();
    assert.equal(code, 0);
    const output = JSON.parse(logs.join("\n")) as {
      status?: string;
      refs?: string[];
      im?: {
        state?: string;
        pid?: number;
        heartbeat_freshness?: string;
        runtime_build?: {
          source_commit_short?: string;
        };
      };
    };
    assert.equal(output.status, "healthy");
    assert.deepEqual(output.refs, ["services/im/heartbeat.json"]);
    assert.equal(output.im?.state, "running");
    assert.equal(output.im?.pid, 2468);
    assert.equal(output.im?.heartbeat_freshness, "fresh");
    assert.equal(output.im?.runtime_build?.source_commit_short, "defaultstate");
  } finally {
    process.argv = originalArgv;
    console.log = originalLog;
    await rm(root, { recursive: true, force: true });
  }
});
