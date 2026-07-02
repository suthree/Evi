import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getArchiveHealth } from "../packages/core/src/archive_health.js";
import { getOpportunityBacklog } from "../packages/core/src/opportunity_backlog.js";
import { readReviewInboxDecisions } from "../packages/core/src/review_inbox_decisions.js";
import { AgentStore } from "../packages/core/src/store.js";
import type { LoopTimerDriver } from "../packages/runtime/src/loop_schedule.js";
import { createReviewTickLoop } from "../packages/runtime/src/review_tick_service.js";

test("review tick loop stays disabled unless runtime config enables it", async () => {
  const fixture = await createFixture();
  try {
    const loop = createReviewTickLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: false,
      intervalMs: 1000,
      limit: 5
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "disabled");
    assert.equal(status.enabled, false);
    assert.equal(existsSync(join(fixture.stateRoot, loop.statusRef)), true);
    assert.equal(existsSync(join(fixture.stateRoot, "autonomy/ticks")), true);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick loop writes service status after a bounded tick", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_tick_loop_1",
      session_id: "session_review_tick_loop",
      turn_id: "turn_1",
      kind: "audit_result",
      summary: "Completion verification blocked SOP audit because the model claim was unverified.",
      artifact_refs: ["memory/episodes/session_review_tick_loop-model-action-r1.json"],
      created_at: "2026-06-29T00:00:02Z"
    });
    const loop = createReviewTickLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5
    });

    const status = await loop.runOnce("test");
    assert.equal(status.state, "ok");
    assert.equal(status.enabled, true);
    assert.match(status.last_tick_ref ?? "", /^autonomy\/ticks\/review_tick_/);
    assert.equal(status.last_inbox_count, 3);
    assert.equal(status.last_active_tick_inbox_count, 3);
    assert.equal(status.last_active_inbox_count, 3);
    assert.equal(status.last_inactive_tick_inbox_count, 0);
    assert.deepEqual(status.last_inactive_tick_inbox_reasons, {});
    assert.deepEqual(status.last_inactive_tick_inbox_refs, []);
    assert.equal(status.last_focus?.source, "opportunity_backlog");
    assert.equal(status.last_focus?.opportunity?.kind, "archive_health");
    assert.equal(status.last_focus_current_status, "resolved");
    assert.match(status.last_focus_current_reason ?? "", /no longer present/);
    assert.equal(status.last_auto_action_status, "executed");
    assert.equal(status.last_auto_action_opportunity_kind, "archive_health");
    assert.match(status.last_auto_action_summary ?? "", /archive_refresh: healthy/);

    const persisted = JSON.parse(await readFile(join(fixture.stateRoot, loop.statusRef), "utf8")) as typeof status;
    assert.equal(persisted.state, "ok");
    assert.equal(persisted.last_tick_ref, status.last_tick_ref);
    assert.equal(persisted.last_focus?.source, "opportunity_backlog");
    assert.equal(persisted.last_focus?.opportunity?.kind, "archive_health");
    assert.equal(persisted.last_focus_current_status, "resolved");
    assert.equal(existsSync(join(fixture.stateRoot, status.last_tick_ref ?? "")), true);
    assert.equal(existsSync(join(fixture.stateRoot, status.last_auto_action_ref ?? "")), true);
    const health = await getArchiveHealth(store);
    assert.equal(health.missing_archive_count, 0);
    assert.equal(health.stale_archive_count, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick loop distinguishes raw and active inbox counts", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_tick_loop_counts_1",
      session_id: "session_review_tick_counts",
      turn_id: "turn_1",
      kind: "audit_result",
      summary: "Completion verification blocked SOP audit because the model claim was unverified.",
      artifact_refs: ["memory/episodes/session_review_tick_counts-model-action-r1.json"],
      created_at: "2026-06-29T00:00:02Z"
    });
    const loop = createReviewTickLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5
    });

    const firstStatus = await loop.runOnce("test");
    assert.equal(firstStatus.last_inbox_count, 3);
    assert.equal(firstStatus.last_active_tick_inbox_count, 3);
    assert.equal(firstStatus.last_active_inbox_count, 3);

    const firstTick = JSON.parse(await readFile(join(fixture.stateRoot, firstStatus.last_tick_ref ?? ""), "utf8")) as {
      inbox_items: Array<{ id: string; action_kind: string }>;
      inbox_item_refs: string[];
    };
    for (const [index, item] of firstTick.inbox_items.entries()) {
      await store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
        id: `review_inbox_decision_counts_${index}`,
        item_id: item.id,
        item_ref: firstTick.inbox_item_refs[index],
        action_kind: item.action_kind,
        status: "completed",
        previous_status: "open",
        reason: "Operator already handled this repeated review tick item.",
        created_at: `2026-06-29T00:01:0${index}.000Z`
      });
    }

    const secondStatus = await loop.runOnce("test");

    assert.equal((secondStatus.last_inbox_count ?? 0) > 0, true);
    assert.equal(secondStatus.last_active_tick_inbox_count, 0);
    assert.equal(secondStatus.last_active_inbox_count, 0);
    assert.equal(secondStatus.last_inactive_tick_inbox_count, secondStatus.last_inbox_count);
    assert.deepEqual(secondStatus.last_inactive_tick_inbox_reasons, {
      terminal_decision_completed: secondStatus.last_inbox_count
    });
    assert.deepEqual(secondStatus.last_inactive_tick_inbox_refs?.length, secondStatus.last_inbox_count);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick loop schedules next wake after startup tick", async () => {
  const fixture = await createFixture();
  try {
    const timer = createTimerCapture();
    const loop = createReviewTickLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 60_000,
      limit: 5,
      clock: () => new Date("2026-07-02T00:00:00.000Z"),
      timerDriver: timer.driver
    });

    loop.start();
    await timer.waitForSchedule();

    const persisted = JSON.parse(await readFile(join(fixture.stateRoot, loop.statusRef), "utf8"));
    assert.equal(persisted.state, "ok");
    assert.equal(persisted.next_wake_at, "2026-07-02T00:01:00.000Z");
    assert.equal(persisted.next_wake_delay_ms, 60_000);
    assert.equal(persisted.next_wake_reason, "interval");
    assert.deepEqual(timer.delays, [60_000]);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick loop pauses when an active autonomy stop signal exists", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_tick_loop_pause_1",
      session_id: "session_review_tick_pause",
      turn_id: "turn_1",
      kind: "audit_result",
      summary: "Completion verification blocked SOP audit because the model claim was unverified.",
      artifact_refs: ["memory/episodes/session_review_tick_pause-model-action-r1.json"],
      created_at: "2026-06-29T00:00:02Z"
    });
    await store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_test",
      status: "active",
      reason: "Pause autonomous exploration for operator review.",
      created_at: "2026-06-29T00:00:03Z"
    });
    const loop = createReviewTickLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5
    });

    const status = await loop.runOnce("test");
    const ticks = await readdir(join(fixture.stateRoot, "autonomy/ticks"));

    assert.equal(status.state, "paused");
    assert.equal(status.enabled, true);
    assert.equal(status.pause_signal_ref, "autonomy/runs/pause_signal.json");
    assert.equal(status.pause_reason, "Pause autonomous exploration for operator review.");
    assert.equal(status.last_tick_ref, undefined);
    assert.deepEqual(ticks, []);

    const persisted = JSON.parse(await readFile(join(fixture.stateRoot, loop.statusRef), "utf8")) as typeof status;
    assert.equal(persisted.state, "paused");
    assert.equal(persisted.pause_signal_ref, "autonomy/runs/pause_signal.json");
  } finally {
    await fixture.cleanup();
  }
});

test("review tick loop auto-completes covered review inbox items", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson("autonomy/reviews/background_review_covered_draft.json", backgroundReviewWithCoveredDraft());
    await store.writeJson("autonomy/inbox/review_inbox_covered_draft.json", reviewInboxItem({
      id: "review_inbox_covered_draft",
      action_kind: "draft_sop",
      title: "Draft a state-only SOP from this proposal",
      rationale: "No existing actionable SOP chain was found for this proposal.",
      latest_review_ref: "autonomy/reviews/background_review_covered_draft.json",
      proposal_id: "review_proposal_covered_draft",
      required_refs: [
        "autonomy/reviews/background_review_covered_draft.json",
        "memory/episodes/events.jsonl#evidence_runtime_failure"
      ],
      would_write: ["state"]
    }));
    const before = await getOpportunityBacklog(store, { limit: 10 });
    assert.equal(before.items.some((item) =>
      item.id === "review_inbox_covered_draft"
      && item.draft_sop_readiness?.status === "covered_by_existing_sop"
    ), true);

    const loop = createReviewTickLoop({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      enabled: true,
      intervalMs: 1000,
      limit: 5
    });
    const status = await loop.runOnce("test");

    assert.equal(status.state, "ok");
    assert.equal(status.last_auto_action_status, "executed");
    assert.match(status.last_auto_action_ref ?? "", /^autonomy\/opportunity-actions\/opportunity_action_/);
    assert.equal(status.last_auto_action_opportunity_id, "review_inbox_covered_draft");
    assert.equal(status.last_auto_action_opportunity_kind, "review_inbox");
    assert.match(status.last_auto_action_result_ref ?? "", /^autonomy\/review-inbox-decisions\.jsonl#/);
    assert.match(status.last_auto_action_summary ?? "", /draft_sop_covered_by_existing_sop/);
    assert.equal(status.last_focus_current_status, "covered_by_auto_action");
    assert.equal(status.last_focus_current_ref, status.last_auto_action_ref);

    const decisions = await readReviewInboxDecisions(store);
    assert.equal(decisions.at(-1)?.item_id, "review_inbox_covered_draft");
    assert.equal(decisions.at(-1)?.status, "completed");

    const after = await getOpportunityBacklog(store, { limit: 10 });
    assert.equal(after.items.some((item) => item.id === "review_inbox_covered_draft"), false);
    assert.equal(existsSync(join(fixture.stateRoot, status.last_auto_action_ref ?? "")), true);
    const actionRecord = JSON.parse(await readFile(join(fixture.stateRoot, status.last_auto_action_ref ?? ""), "utf8")) as Record<string, {
      risk?: string;
      auto_executable?: boolean;
      external_io?: boolean;
    } | unknown>;
    assert.equal((actionRecord.execution_policy as { risk?: string }).risk, "auto_safe");
    assert.equal((actionRecord.execution_policy as { auto_executable?: boolean }).auto_executable, true);
    assert.equal((actionRecord.execution_policy as { external_io?: boolean }).external_io, false);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-review-tick-loop-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function createTimerCapture(): {
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

function backgroundReviewWithCoveredDraft(): Record<string, unknown> {
  return {
    id: "background_review_covered_draft",
    mode: "recent",
    query: null,
    session_id: null,
    created_at: "2026-06-30T00:00:00.000Z",
    stats: {
      events_reviewed: 3,
      sessions_seen: 2,
      kinds: { report: 3 },
      failure_signal_count: 1,
      sop_signal_count: 2
    },
    reviewed_event_ids: ["evidence_runtime_failure"],
    working_checkpoint: null,
    chain_summaries: [{
      sop_ref: "sop/drafts/sop_existing_runtime_failures.json",
      sop_id: "sop_existing_runtime_failures",
      title: "Draft an SOP for recurring blocked or failed runtime paths",
      sop_status: "audited",
      latest_decision: "reused_skill",
      event_count: 3,
      audit_count: 1,
      promotion_events: 0,
      reuse_events: 1,
      review_refs: ["autonomy/reviews/background_review_prior.json"],
      audit_refs: ["governance/audits/audit_existing_runtime_failures.json"],
      skill_refs: ["vault/skills/verify-runtime-failures/SKILL.md"],
      duplicate_skill_refs: ["vault/skills/verify-runtime-failures/SKILL.md"],
      event_ids: ["evidence_prior_failure"]
    }],
    proposals: [{
      id: "review_proposal_covered_draft",
      type: "sop_candidate",
      title: "Draft an SOP for recurring blocked or failed runtime paths",
      rationale: "Repeated failure evidence is ready for a state-only SOP draft.",
      evidence_refs: ["memory/episodes/events.jsonl#evidence_runtime_failure"],
      next_action: "Inspect evidence before requesting confirmation."
    }],
    artifact_refs: {
      json_ref: "autonomy/reviews/background_review_covered_draft.json",
      markdown_ref: "autonomy/reviews/background_review_covered_draft.md"
    }
  };
}

function reviewInboxItem(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "review_inbox_test",
    created_at: "2026-06-30T00:00:01.000Z",
    updated_at: "2026-06-30T00:00:01.000Z",
    status: "open",
    source: "review_tick",
    first_review_ref: "autonomy/reviews/background_review_covered_draft.json",
    latest_review_ref: "autonomy/reviews/background_review_covered_draft.json",
    proposal_id: "review_proposal_covered_draft",
    proposal_type: "sop_candidate",
    proposal_title: "Draft an SOP for recurring blocked or failed runtime paths",
    action_id: "follow_up_action_covered_draft",
    action_kind: "draft_sop",
    title: "Draft a state-only SOP from this proposal",
    rationale: "No existing actionable SOP chain was found for this proposal.",
    command: null,
    required_refs: [],
    would_write: ["state"],
    seen_count: 1,
    ...overrides
  };
}
