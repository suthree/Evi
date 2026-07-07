import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { runHarnessReplayAudit } from "../packages/core/src/harness_replay.js";
import { decideOpportunity } from "../packages/core/src/opportunity_backlog.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  recordContentFeedbackEvidence,
  recordContentImageEvidence,
  recordContentPublishEvidence,
  runContentDryRun
} from "../packages/runtime/src/content_pipeline.js";
import { getGovernanceStatus } from "../packages/runtime/src/governance_status.js";

test("governance status aggregates memory, review, service, and pause read models", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await writeRepoHead(store, "abcdef0123456789abcdef0123456789abcdef01");
    await store.writeJson("memory/semantic/candidates/memory_proposal_old.json", memoryCandidate({
      id: "memory_proposal_old",
      status: "candidate",
      created_at: "2026-06-29T00:00:00.000Z"
    }));
    await store.writeJson("memory/semantic/candidates/memory_proposal_new.json", memoryCandidate({
      id: "memory_proposal_new",
      status: "confirmation_requested",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await store.writeJson("memory/semantic/confirmations/memory_confirmation_pending.json", memoryConfirmation({
      id: "memory_confirmation_pending",
      status: "pending",
      created_at: "2026-06-30T00:01:00.000Z"
    }));
    await store.writeJson("memory/semantic/confirmations/memory_confirmation_executed.json", memoryConfirmation({
      id: "memory_confirmation_executed",
      status: "executed",
      created_at: "2026-06-30T00:02:00.000Z",
      executed_at: "2026-06-30T00:03:00.000Z"
    }));
    await store.writeJson("memory/semantic/accepted/semantic_memory_a.json", acceptedMemory());
    await store.writeJson("autonomy/inbox/review_inbox_open.json", reviewInboxItem({
      id: "review_inbox_open",
      status: "open",
      updated_at: "2026-06-30T00:00:00.000Z"
    }));
    await store.writeJson("autonomy/inbox/review_inbox_confirmation.json", reviewInboxItem({
      id: "review_inbox_confirmation",
      status: "confirmation_requested",
      updated_at: "2026-06-30T00:01:00.000Z"
    }));
    await store.writeJson("autonomy/inbox/review_inbox_executed.json", reviewInboxItem({
      id: "review_inbox_executed",
      status: "executed",
      updated_at: "2026-06-30T00:02:00.000Z"
    }));
    await store.writeJson("autonomy/reviews/background_review_1.json", backgroundReview({
      id: "background_review_1",
      stats: {
        events_reviewed: 2,
        sessions_seen: 1,
        kinds: { report: 2 },
        failure_signal_count: 1,
        sop_signal_count: 1
      },
      proposals: [{
        id: "review_proposal_1",
        type: "sop_candidate",
        title: "Draft local SOP",
        rationale: "Repeated evidence needs a local SOP draft.",
        evidence_refs: [
          "memory/episodes/events.jsonl#evidence_status_draft",
          "sop/drafts/sop_status_related.json"
        ],
        next_action: "Inspect evidence before requesting confirmation."
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_1.json",
        markdown_ref: "autonomy/reviews/background_review_1.md"
      }
    }));
    await store.writeJson("autonomy/reviews/background_review_2.json", backgroundReview({
      id: "background_review_2",
      stats: {
        events_reviewed: 2,
        sessions_seen: 1,
        kinds: { report: 2 },
        failure_signal_count: 1,
        sop_signal_count: 1
      },
      proposals: [{
        id: "review_proposal_1",
        type: "sop_candidate",
        title: "Draft local SOP",
        rationale: "Repeated evidence needs a local SOP draft.",
        evidence_refs: [
          "memory/episodes/events.jsonl#evidence_status_draft",
          "sop/drafts/sop_status_related.json"
        ],
        next_action: "Inspect evidence before requesting confirmation."
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_2.json",
        markdown_ref: "autonomy/reviews/background_review_2.md"
      }
    }));
    await store.writeJson("autonomy/followups/follow_up_confirmation_pending.json", reviewConfirmation({
      id: "follow_up_confirmation_pending",
      status: "pending",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await store.writeJson("autonomy/followups/follow_up_confirmation_executed.json", reviewConfirmation({
      id: "follow_up_confirmation_executed",
      status: "executed",
      created_at: "2026-06-30T00:01:00.000Z",
      executed_at: "2026-06-30T00:02:00.000Z"
    }));
    await store.writeJson("services/runtime/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 2468,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      runtime_build: {
        schema_version: 1,
        target: "runtime",
        runtime_current_root: "/home/user/.local-runtime/service/runtime/current",
        repo_root: repoRoot,
        built_at: "2026-06-30T00:02:30.000Z",
        node_version: "v24.0.0",
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      },
      updated_at: "2026-06-30T00:03:00.000Z"
    });
    await store.writeJson("services/runtime/review_tick.json", {
      service: "review_tick",
      enabled: false,
      state: "disabled",
      last_tick_ref: "autonomy/ticks/review_tick_1.json",
      last_inbox_count: 4,
      last_active_tick_inbox_count: 1,
      last_active_inbox_count: 2,
      last_inactive_tick_inbox_count: 3,
      last_inactive_tick_inbox_reasons: {
        terminal_decision_completed: 2,
        duplicate_noncanonical: 1
      },
      last_inactive_tick_inbox_refs: [
        "autonomy/inbox/review_inbox_completed_a.json",
        "autonomy/inbox/review_inbox_completed_b.json",
        "autonomy/inbox/review_inbox_duplicate_b.json"
      ],
      last_focus_current_status: "active",
      last_focus_current_ref: "autonomy/followups/follow_up_confirmation_pending.json",
      last_focus_current_backlog_status: "pending",
      last_focus_current_reason: "selected review tick focus is still present in the current opportunity backlog",
      last_auto_action_status: "executed",
      last_auto_action_ref: "autonomy/opportunity-actions/opportunity_action_status.json",
      last_auto_action_opportunity_id: "archive_health_stale_2026_06_30",
      last_auto_action_opportunity_kind: "archive_health",
      last_auto_action_result_ref: "memory/archives/2026-06-30.json",
      last_auto_action_summary: "archive_refresh: healthy, remaining=0",
      last_focus: {
        source: "backlog_actionable",
        reason: "top backlog item is already actionable as review_confirmation; keeping recent review scope",
        query: null,
        opportunity: {
          ref: "autonomy/followups/follow_up_confirmation_pending.json",
          id: "follow_up_confirmation_pending",
          kind: "review_confirmation",
          status: "pending",
          score: 100,
          action_kind: "draft_sop",
          source_ref: "autonomy/reviews/background_review_1.json"
        }
      }
    });
    await store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_test",
      action_type: "pause_autonomy",
      status: "active",
      reason: "Review the self-evolution queue first.",
      resume_hint: "Clear the pause signal after review."
    });
    await store.writeJson("memory/working/current.json", {
      goal: "Keep governance status aware of harness progress.",
      current_step: "surface current checkpoint",
      known_constraints: ["Do not read raw evidence artifacts from status."],
      recent_evidence_refs: ["memory/episodes/raw-working-evidence.md"],
      open_questions: [],
      next_action: "Continue the local loop after status inspection.",
      created_at: "2026-06-30T00:04:00.000Z"
    });
    await store.writeText("memory/episodes/raw-working-evidence.md", "RAW_WORKING_EVIDENCE_SHOULD_NOT_APPEAR");

    const status = await getGovernanceStatus(store, { limit: 2 });

    assert.equal(status.counts.memory_candidates.total, 2);
    assert.equal(status.counts.memory_candidates.by_status.candidate, 1);
    assert.equal(status.counts.memory_candidates.by_status.confirmation_requested, 1);
    assert.equal(status.counts.memory_confirmations.pending, 1);
    assert.equal(status.counts.memory_confirmations.executed, 1);
    assert.equal(status.counts.accepted_semantic_memory.total, 1);
    assert.equal(status.counts.review_inbox.total, 3);
    assert.equal(status.counts.review_inbox.active, 1);
    assert.equal(status.counts.review_inbox.by_status.executed, 1);
    assert.equal(status.counts.review_confirmations.pending, 1);
    assert.equal(status.counts.review_confirmations.executed, 1);
    assert.equal(status.counts.opportunity_backlog.total, 7);
    assert.equal(status.counts.opportunity_backlog.by_kind.service_health, 1);
    assert.equal(status.counts.opportunity_backlog.by_kind.autonomy_pause, 1);
    assert.equal(status.counts.opportunity_backlog.by_kind.memory_candidate, 2);
    assert.equal(status.counts.opportunity_backlog.by_kind.review_inbox, 1);
    assert.equal(status.counts.opportunity_backlog.by_kind.memory_confirmation, 1);
    assert.equal(status.counts.opportunity_backlog.by_kind.review_confirmation, 1);
    assert.equal(status.counts.working_checkpoints.total, 1);
    assert.equal(status.working_checkpoint.current?.ref, "memory/working/current.json");
    assert.equal(status.working_checkpoint.current?.current_step, "surface current checkpoint");
    assert.match(status.working_checkpoint.attention_hint, /status history only/);
    assert.match(status.working_checkpoint.attention_hint, /memory\/working\/current\.json/);
    assert.deepEqual(status.latest_refs.working_checkpoints, ["memory/working/current.json"]);
    assert.doesNotMatch(JSON.stringify(status), /RAW_WORKING_EVIDENCE_SHOULD_NOT_APPEAR/);
    assert.ok(status.opportunity_backlog.top_item);
    assert.equal(status.opportunity_backlog.top_item.ref, status.latest_refs.opportunity_backlog[0]);
    assert.match(status.opportunity_backlog.attention_hint, new RegExp(`${status.opportunity_backlog.top_item.kind}:${status.opportunity_backlog.top_item.id}`));
    assert.equal(status.opportunity_backlog.top_item.draft_sop_readiness?.status, "ready");
    assert.equal(status.opportunity_backlog.top_item.draft_sop_readiness?.failure_signal_count, 1);
    assert.equal(status.opportunity_backlog.top_item.draft_sop_readiness?.sop_signal_count, 1);
    assert.equal(status.opportunity_backlog.top_item.draft_sop_readiness?.evidence_ref_count, 2);
    assert.deepEqual(status.opportunity_backlog.top_item.draft_sop_readiness?.existing_sop_refs, [
      "sop/drafts/sop_status_related.json"
    ]);
    assert.deepEqual(status.latest_refs.memory_candidates, [
      "memory/semantic/candidates/memory_proposal_new.json",
      "memory/semantic/candidates/memory_proposal_old.json"
    ]);
    assert.equal(status.latest_refs.opportunity_backlog.length, 2);
    assert.deepEqual(status.latest_refs.review_inbox, [
      "autonomy/inbox/review_inbox_confirmation.json"
    ]);
    assert.equal(status.autonomy_pause.active, true);
    assert.equal(status.autonomy_pause.reason, "Review the self-evolution queue first.");
    assert.equal(status.service.runtime.state, "running");
    assert.equal(status.service.runtime.pid, 2468);
    assert.equal(status.service.runtime.health, "paused");
    assert.equal(status.service.runtime.heartbeat_freshness, "stale");
    assert.equal(typeof status.service.runtime.heartbeat_age_ms, "number");
    assert.equal(status.service.runtime.runtime_build?.source_commit_short, "abcdef012345");
    assert.equal(status.service.runtime.runtime_build?.source_branch, "develop");
    assert.equal(status.service.runtime.runtime_build?.source_is_dirty, false);
    assert.equal(status.service.runtime.runtime_build?.built_at, "2026-06-30T00:02:30.000Z");
    assert.equal(status.service.runtime.repo_head.read_status, "ok");
    assert.equal(status.service.runtime.repo_head.head_commit_short, "abcdef012345");
    assert.equal(status.service.runtime.deployment.status, "current");
    assert.equal(status.service.runtime.deployment.runtime_commit_short, "abcdef012345");
    assert.equal(status.service.runtime.deployment.repo_commit_short, "abcdef012345");
    assert.equal(status.service.review_tick.state, "disabled");
    assert.equal(status.service.review_tick.enabled, false);
    assert.equal(status.service.review_tick.last_inbox_count, 4);
    assert.equal(status.service.review_tick.last_active_tick_inbox_count, 1);
    assert.equal(status.service.review_tick.last_active_inbox_count, 2);
    assert.equal(status.service.review_tick.last_inactive_tick_inbox_count, 3);
    assert.deepEqual(status.service.review_tick.last_inactive_tick_inbox_reasons, {
      duplicate_noncanonical: 1,
      terminal_decision_completed: 2
    });
    assert.deepEqual(status.service.review_tick.last_inactive_tick_inbox_refs, [
      "autonomy/inbox/review_inbox_completed_a.json",
      "autonomy/inbox/review_inbox_completed_b.json",
      "autonomy/inbox/review_inbox_duplicate_b.json"
    ]);
    assert.equal(status.service.review_tick.last_auto_action_status, "executed");
    assert.equal(status.service.review_tick.last_auto_action_ref, "autonomy/opportunity-actions/opportunity_action_status.json");
    assert.equal(status.service.review_tick.last_auto_action_opportunity_id, "archive_health_stale_2026_06_30");
    assert.equal(status.service.review_tick.last_auto_action_opportunity_kind, "archive_health");
    assert.equal(status.service.review_tick.last_auto_action_result_ref, "memory/archives/2026-06-30.json");
    assert.equal(status.service.review_tick.last_auto_action_summary, "archive_refresh: healthy, remaining=0");
    assert.equal(status.service.review_tick.last_focus?.source, "backlog_actionable");
    assert.equal(status.service.review_tick.last_focus?.opportunity?.kind, "review_confirmation");
    assert.equal(status.service.review_tick.last_focus?.opportunity?.id, "follow_up_confirmation_pending");
    assert.equal(status.service.review_tick.last_focus_current_status, "active");
    assert.equal(status.service.review_tick.last_focus_current_ref, "autonomy/followups/follow_up_confirmation_pending.json");
    assert.equal(status.service.review_tick.last_focus_current_backlog_status, "pending");
    assert.match(status.service.review_tick.last_focus_current_reason ?? "", /still present/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status explains idle opportunity backlog with next resident check", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await writeRepoHead(store, "abcdef0123456789abcdef0123456789abcdef01");
    await store.writeJson("services/runtime/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 2468,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      runtime_build: {
        schema_version: 1,
        target: "runtime",
        runtime_current_root: "/home/user/.local-runtime/service/runtime/current",
        repo_root: repoRoot,
        built_at: new Date().toISOString(),
        node_version: "v24.0.0",
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      },
      updated_at: new Date().toISOString()
    });
    await store.writeJson("services/runtime/review_tick.json", {
      service: "review_tick",
      enabled: true,
      state: "ok",
      updated_at: "2026-07-02T05:00:00.000Z",
      next_wake_at: "2026-07-02T05:30:00.000Z",
      next_wake_delay_ms: 1_800_000,
      next_wake_reason: "interval"
    });
    await store.writeJson("services/runtime/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "skipped",
      updated_at: "2026-07-02T05:00:00.000Z",
      next_wake_at: "2026-07-02T06:00:00.000Z",
      next_wake_delay_ms: 600_000,
      next_wake_reason: "interval",
      next_due_at: "2026-07-02T06:30:00.000Z",
      next_due_run_ref: "content/runs/content_run_idle/run.json"
    });
    await store.writeJson("services/runtime/content_creator_metrics.json", {
      service: "content_creator_metrics",
      enabled: true,
      state: "skipped",
      updated_at: "2026-07-02T05:00:01.000Z",
      next_wake_at: "2026-07-02T07:00:00.000Z",
      next_wake_delay_ms: 3_600_000,
      next_wake_reason: "interval"
    });

    const status = await getGovernanceStatus(store);

    assert.equal(status.counts.opportunity_backlog.total, 0);
    assert.equal(status.opportunity_backlog.top_item, undefined);
    assert.equal(status.opportunity_backlog.actionable_item, undefined);
    assert.deepEqual(status.opportunity_backlog.next_check, {
      source: "review_tick",
      state: "ok",
      next_wake_at: "2026-07-02T05:30:00.000Z",
      next_wake_delay_ms: 1_800_000,
      next_wake_reason: "interval"
    });
    assert.match(status.opportunity_backlog.attention_hint, /No immediate opportunity action is due/);
    assert.match(status.opportunity_backlog.attention_hint, /review_tick at 2026-07-02T05:30:00.000Z/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes reused skill coverage on top revise_skill opportunity", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("sop/drafts/sop_status_reuse.json", {
      id: "sop_status_reuse",
      title: "Validate status reused skill coverage",
      trigger: "Use when governance status must show whether a duplicate skill still covers the SOP.",
      procedure: [
        "Open governance status.",
        "Read the top opportunity coverage status."
      ],
      required_tools: ["governance.status", "review.coverage"],
      verification: "Governance status includes covered reused skill coverage for the top revise_skill opportunity.",
      failure_modes: ["Do not execute revise_skill from status alone."],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "audited",
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    });
    await store.writeRepoText("vault/skills/status-reused-skill/SKILL.md", [
      "---",
      "name: status-reused-skill",
      "description: Validate status reused skill coverage and show whether a duplicate skill still covers the SOP.",
      "---",
      "",
      "RAW_SKILL_BODY_SHOULD_NOT_BE_IN_STATUS"
    ].join("\n"));
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_status_reused_skill",
      session_id: "sop_status_reuse",
      turn_id: "audit_status_reused_skill",
      kind: "report",
      summary: "Skipped explicit SOP promotion because recalled skill already covers this SOP: status-reused-skill.",
      artifact_refs: [
        "sop/drafts/sop_status_reuse.json",
        "vault/skills/status-reused-skill/SKILL.md"
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await store.writeJson("autonomy/followups/follow_up_confirmation_status_reuse.json", {
      id: "follow_up_confirmation_status_reuse",
      created_at: "2026-06-30T00:00:02.000Z",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_status_reuse.json",
      proposal_id: "review_proposal_status_reuse",
      proposal_type: "skill_revision",
      sop_id: "sop_status_reuse",
      sop_ref: "sop/drafts/sop_status_reuse.json",
      action_id: "follow_up_action_revise_skill_status_reuse",
      action_kind: "revise_skill",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_revise_skill_status_reuse",
        kind: "revise_skill",
        title: "Validate status reused skill coverage",
        rationale: "Confirm the duplicate skill still covers the SOP before changing metadata.",
        command: null,
        required_refs: [
          "sop/drafts/sop_status_reuse.json",
          "vault/skills/status-reused-skill/SKILL.md"
        ],
        would_write: ["active_vault"]
      },
      required_refs: [
        "sop/drafts/sop_status_reuse.json",
        "vault/skills/status-reused-skill/SKILL.md"
      ],
      would_write: ["active_vault"],
      next_step: "Review coverage before execution."
    });

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.id, "follow_up_confirmation_status_reuse");
    assert.equal(top?.action_kind, "revise_skill");
    assert.equal(top?.reused_skill_coverage?.status, "covered");
    assert.equal(top?.reused_skill_coverage?.sop_id, "sop_status_reuse");
    assert.equal(top?.reused_skill_coverage?.current_duplicate_skill_ref, "vault/skills/status-reused-skill/SKILL.md");
    assert.doesNotMatch(JSON.stringify(status), /RAW_SKILL_BODY_SHOULD_NOT_BE_IN_STATUS/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes selected skill outcome on top backlog item", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeRepoText("vault/skills/status-skill-outcome/SKILL.md", [
      "---",
      "name: status-skill-outcome",
      "description: Use when governance status should expose selected skill outcome drift.",
      "---",
      "",
      "RAW_STATUS_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeText("memory/episodes/session_status_skill-context.md", "RAW_STATUS_CONTEXT_SHOULD_NOT_APPEAR");
    await store.writeText("memory/episodes/session_status_skill-final-response.md", "RAW_STATUS_FINAL_RESPONSE_SHOULD_NOT_APPEAR");
    await store.writeJson("memory/skills/usage/session_status_skill-status-skill-outcome.json", selectedSkillOutcome({
      id: "skill_usage_status_outcome",
      skill_name: "status-skill-outcome",
      instructions_ref: "vault/skills/status-skill-outcome/SKILL.md",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      context_ref: "memory/episodes/session_status_skill-context.md",
      context_manifest_ref: "memory/episodes/session_status_skill-context.json",
      completion_report_ref: "memory/episodes/session_status_skill-completion-verification.json",
      final_response_ref: "memory/episodes/session_status_skill-final-response.md",
      created_at: "2026-06-30T00:00:10.000Z"
    }));

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.id, "skill_usage_status_outcome");
    assert.equal(top?.kind, "selected_skill_outcome");
    assert.equal(top?.action_kind, "review_skill_outcome");
    assert.equal(top?.selected_skill_outcome?.skill_name, "status-skill-outcome");
    assert.equal(top?.selected_skill_outcome?.verification_status, "failed");
    assert.equal(top?.selected_skill_outcome?.completion_report_ref, "memory/episodes/session_status_skill-completion-verification.json");
    assert.equal(top?.selected_skill_outcome?.final_response_ref, "memory/episodes/session_status_skill-final-response.md");
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_CONTEXT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_FINAL_RESPONSE_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes selected skill drift on top backlog item", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeRepoText("vault/skills/status-skill-drift/SKILL.md", [
      "---",
      "name: status-skill-drift",
      "description: Use when governance status should expose grouped selected skill drift.",
      "---",
      "",
      "RAW_STATUS_DRIFT_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeText("memory/episodes/session_status_drift_b-context.md", "RAW_STATUS_DRIFT_CONTEXT_SHOULD_NOT_APPEAR");
    await store.writeText("memory/episodes/session_status_drift_b-final-response.md", "RAW_STATUS_DRIFT_FINAL_RESPONSE_SHOULD_NOT_APPEAR");
    await store.writeJson("memory/skills/usage/session_status_drift_a-status-skill-drift.json", selectedSkillOutcome({
      id: "skill_usage_status_drift_a",
      session_id: "session_status_drift_a",
      skill_name: "status-skill-drift",
      instructions_ref: "vault/skills/status-skill-drift/SKILL.md",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_status_drift_a-completion-verification.json",
      created_at: "2026-06-30T00:00:10.000Z"
    }));
    await store.writeJson("memory/skills/usage/session_status_drift_b-status-skill-drift.json", selectedSkillOutcome({
      id: "skill_usage_status_drift_b",
      session_id: "session_status_drift_b",
      skill_name: "status-skill-drift",
      instructions_ref: "vault/skills/status-skill-drift/SKILL.md",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      context_ref: "memory/episodes/session_status_drift_b-context.md",
      context_manifest_ref: "memory/episodes/session_status_drift_b-context.json",
      completion_report_ref: "memory/episodes/session_status_drift_b-completion-verification.json",
      final_response_ref: "memory/episodes/session_status_drift_b-final-response.md",
      registry_update: {
        ok: true,
        use_count: 7,
        last_used_at: "2026-06-30T00:01:00.000Z"
      },
      created_at: "2026-06-30T00:01:00.000Z"
    }));

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.id, "selected_skill_drift_status-skill-drift");
    assert.equal(top?.kind, "selected_skill_drift");
    assert.equal(top?.action_kind, "review_skill_drift");
    assert.equal(top?.selected_skill_drift?.skill_name, "status-skill-drift");
    assert.equal(top?.selected_skill_drift?.attention_count, 2);
    assert.equal(top?.selected_skill_drift?.failed_count, 2);
    assert.equal(top?.selected_skill_drift?.latest_attention_outcome_ref, "memory/skills/usage/session_status_drift_b-status-skill-drift.json");
    assert.equal(top?.selected_skill_drift?.latest_completion_report_ref, "memory/episodes/session_status_drift_b-completion-verification.json");
    assert.equal(top?.selected_skill_drift?.use_count, 7);
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_DRIFT_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_DRIFT_CONTEXT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_DRIFT_FINAL_RESPONSE_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes pipeline resume guidance on top pipeline opportunity", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeText("pipelines/pipeline_status_resume/artifacts/verify.md", "RAW_STATUS_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR");
    await store.writeJson("pipelines/pipeline_status_resume/pipeline.json", {
      id: "pipeline_status_resume",
      task: "Use StageRunner to verify governance status pipeline resume guidance.",
      source: "builtin",
      stages: [{
        id: "verify",
        title: "Verify",
        objective: "Verify governance status pipeline resume guidance.",
        input_refs: [],
        expected_outputs: ["verify.md"],
        allowed_tools: ["repo.search"],
        max_model_rounds: 1,
        max_tool_calls: 1,
        timeout_ms: 120000,
        acceptance_checks: ["Resume guidance is visible."],
        on_failure: "block",
        side_effect_level: "local_write",
        optional: false
      }],
      side_effect_ceiling: "local_write",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await store.writeJson("pipelines/pipeline_status_resume/stages/verify.json", {
      id: "stage_run_pipeline_status_resume_verify",
      pipeline_id: "pipeline_status_resume",
      stage_id: "verify",
      status: "blocked",
      attempt: 1,
      evidence_refs: ["evidence_pipeline_status_resume_verify"],
      output_refs: ["pipelines/pipeline_status_resume/artifacts/verify.md"],
      model_response_refs: ["pipelines/pipeline_status_resume/responses/verify-model-response-r1.json"],
      envelope_refs: ["pipelines/pipeline_status_resume/responses/verify-model-action-r1.json"],
      failure_kind: "stage_incomplete",
      failure_message: "Verification did not satisfy completion checks.",
      started_at: "2026-06-30T00:00:01.000Z",
      completed_at: "2026-06-30T00:00:02.000Z"
    });
    await store.writeJson("pipelines/pipeline_status_resume/checkpoint.json", {
      run_id: "pipeline_run_status_resume",
      pipeline_id: "pipeline_status_resume",
      status: "blocked",
      blocked_stage_id: "verify",
      stage_run_refs: ["pipelines/pipeline_status_resume/stages/verify.json"],
      evidence_refs: ["evidence_pipeline_status_resume_verify"],
      final_response_ref: "pipelines/pipeline_status_resume/artifacts/verify.md",
      updated_at: "2026-06-30T00:00:03.000Z"
    });

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.id, "pipeline_run_status_resume");
    assert.equal(top?.kind, "pipeline_run");
    assert.equal(top?.action_kind, "resume_pipeline");
    assert.equal(top?.pipeline_run?.blocked_stage_id, "verify");
    assert.equal(top?.pipeline_run?.inspect_command, "pnpm run runtime -- pipeline runs --pipeline pipeline_run_status_resume --state-root <state-root>");
    assert.equal(top?.pipeline_run?.resume_command, "pnpm run runtime -- pipeline resume --pipeline pipeline_run_status_resume --from-stage verify --state-root <state-root>");
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes repo write guard on top backlog item", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    const sessionId = "session_status_repo_guard";
    const turnId = "turn_status_repo_guard";
    await store.writeText(
      `memory/episodes/${sessionId}-tool_result_write.json`,
      "RAW_STATUS_REPO_WRITE_TOOL_RESULT_SHOULD_NOT_APPEAR"
    );
    await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_status_repo_guard",
      session_id: sessionId,
      turn_id: turnId,
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Completion verification passed after a repo write.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r1.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: [],
      observation_refs: [`memory/episodes/${sessionId}-tool_result_write.json`],
      checks: [{
        id: "write_run_tool_results",
        status: "pass",
        summary: "Repo write tool result succeeded.",
        refs: ["tool_result_write"]
      }],
      boundary: "harness-owned completion verification report; read-only context input, not replay authority",
      created_at: "2026-06-30T00:45:00.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_status_repo_guard",
      session_id: sessionId,
      turn_id: turnId,
      kind: "tool_result",
      summary: "Wrote repo:docs/status-dirty-write.md (76 bytes). workspace_guard: before=dirty after=dirty changed_files=6->7 delta=1 preexisting_dirty=true target_changed=true.",
      artifact_refs: [`memory/episodes/${sessionId}-tool_result_write.json`],
      created_at: "2026-06-30T00:44:00.000Z"
    });

    const replay = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_status_repo_guard"
    });
    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.kind, "repo_write_guard");
    assert.equal(top?.id, "repo_write_guard_completion_verification_status_repo_guard_evidence_status_repo_guard");
    assert.equal(top?.action_kind, "inspect_repo_write_guard");
    assert.equal(top?.repo_write_guard?.path, "docs/status-dirty-write.md");
    assert.equal(top?.repo_write_guard?.trace_ref, `memory/episodes/${sessionId}-completion-verification.json`);
    assert.equal(top?.repo_write_guard?.event_id, "evidence_status_repo_guard");
    assert.equal(top?.repo_write_guard?.before_status, "dirty");
    assert.equal(top?.repo_write_guard?.after_status, "dirty");
    assert.equal(top?.repo_write_guard?.before_changed_file_count, 6);
    assert.equal(top?.repo_write_guard?.after_changed_file_count, 7);
    assert.equal(top?.repo_write_guard?.preexisting_dirty, true);
    assert.equal(top?.repo_write_guard?.target_changed_after_write, true);
    assert.equal(
      top?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity repo_write_guard_completion_verification_status_repo_guard_evidence_status_repo_guard --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.equal(status.counts.opportunity_backlog.by_kind.repo_write_guard, 1);
    assert.deepEqual(status.latest_refs.opportunity_backlog, [`memory/episodes/${sessionId}-completion-verification.json#evidence_status_repo_guard`]);
    assert.deepEqual(status.counts.harness_replays, {
      total: 1,
      attention: 1,
      clean: 0
    });
    assert.deepEqual(status.latest_refs.harness_replays, [replay.artifact_refs.json_ref]);
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_REPO_WRITE_TOOL_RESULT_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes self-evolution gap metadata on top backlog item", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    const run = await createStatusLiveSourceContentRun(store);
    await writeStatusFakeImage(run.image_request.output_path);
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: run.image_request.output_path
    });
    const publish = await recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/status-early-feedback"
    });
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "operator-screenshot:status-early-feedback.png"
    });

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.kind, "self_evolution_gap");
    assert.equal(top?.id, `gap_post_publish_feedback_waiting_${run.id}`);
    assert.equal(top?.status, "waiting");
    assert.equal(top?.action_kind, "narrow_review");
    assert.equal(top?.self_evolution_gap?.proposed_slice, "post_publish_feedback_stable_window");
    assert.equal(top?.self_evolution_gap?.source_ref, run.refs.run_ref);
    assert.equal(top?.self_evolution_gap?.not_before_at !== undefined, true);
    assert.equal(top?.self_evolution_gap?.evidence_refs.includes(publish.evidence_ref), true);
    assert.equal(top?.self_evolution_gap?.evidence_refs.includes(feedback.evidence_ref), true);
    const notBefore = top?.self_evolution_gap?.not_before_at;
    assert.equal(notBefore !== undefined, true);
    assert.equal(top?.self_evolution_gap?.verification_commands.some((command) => command.includes("content feedback-review")), true);
    assert.equal(top?.next_step.includes(notBefore ?? "missing-not-before"), true);
    assert.equal(status.opportunity_backlog.actionable_item, undefined);
    assert.equal(status.opportunity_backlog.next_ready_at, notBefore);
    assert.match(status.opportunity_backlog.attention_hint, new RegExp(`waiting until ${notBefore}`));
    assert.match(status.opportunity_backlog.attention_hint, /No immediate opportunity action is due/);
    assert.equal(top?.action_chain?.some((step) => step.label === "verify_gap" && step.effect === "read_only"), true);
    assert.deepEqual(status.latest_refs.opportunity_backlog, [top?.ref]);
    assert.equal(status.counts.opportunity_backlog.by_kind.self_evolution_gap, 1);
    assert.equal(status.counts.opportunity_backlog.by_status.waiting, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status summarizes decision-closed self-evolution gaps when backlog is empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    const run = await createStatusLiveSourceContentRun(store);
    await writeStatusFakeImage(run.image_request.output_path);
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: run.image_request.output_path
    });
    await recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/status-closed-feedback"
    });
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "operator-screenshot:status-closed-feedback.png"
    });
    await store.writeJson(feedback.evidence_ref, {
      ...feedback.evidence,
      created_at: "2000-01-01T00:00:00Z"
    });
    const gapId = `gap_post_publish_feedback_weak_${run.id}`;
    await decideOpportunity(store, {
      opportunity: gapId,
      status: "completed",
      reason: "implemented sparse feedback strategy split"
    });

    const status = await getGovernanceStatus(store, { limit: 5 });

    assert.equal(status.counts.opportunity_backlog.total, 0);
    assert.equal(status.opportunity_backlog.top_item, undefined);
    assert.equal(status.self_evolution_gaps.total, 1);
    assert.deepEqual(status.self_evolution_gaps.by_effective_status, { completed: 1 });
    assert.deepEqual(status.self_evolution_gaps.latest_refs, [`self-evolution/gaps/${gapId}.json`]);
    assert.match(status.self_evolution_gaps.attention_hint, /decision-closed/);
    assert.match(status.self_evolution_gaps.attention_hint, /completed=1/);
    assert.match(status.self_evolution_gaps.attention_hint, /empty Opportunity Backlog is not hiding active gap work/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes context pressure on top backlog item", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("memory/episodes/session_status_pressure-context.json", {
      version: 1,
      created_at: "2026-06-30T00:00:00.000Z",
      session_id: "session_status_pressure",
      turn_id: "turn_status_pressure",
      total_chars: 99_000,
      section_count: 2,
      sections: [{
        title: "Episode Recall",
        chars: 61_000,
        refs: ["memory/episodes/status-pressure.json"],
        item_count: 42
      }, {
        title: "Selected Skills",
        chars: 12_000,
        refs: ["vault/skills/status-pressure/SKILL.md"],
        item_count: 1
      }],
      recall: {
        memory_hit_count: 42,
        memory_refs: ["memory/episodes/status-pressure.json"],
        archive_ref_count: 0,
        archive_refs: [],
        opportunity_ref_count: 0,
        opportunity_refs: [],
        skill_ref_count: 1,
        skill_refs: ["vault/skills/status-pressure/SKILL.md"],
        discipline_active: false
      }
    });
    await store.writeText("memory/episodes/session_status_pressure-context.md", "RAW_STATUS_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR");
    await decideOpportunity(store, {
      opportunity: "context_pressure_session_status_pressure",
      status: "deferred",
      reason: "Operator deferred pressure review until the next context pass."
    });

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.kind, "context_pressure");
    assert.equal(top?.context_pressure?.status, "over_budget");
    assert.equal(top?.context_pressure?.session_id, "session_status_pressure");
    assert.equal(top?.context_pressure?.largest_section_title, "Episode Recall");
    assert.equal(top?.context_pressure?.operator_guidance.mitigation_kind, "reduce_episode_recall");
    assert.equal(top?.opportunity_decision?.status, "deferred");
    assert.equal(top?.opportunity_decision?.reason, "Operator deferred pressure review until the next context pass.");
    assert.equal(top?.opportunity_decision?.ref, "autonomy/opportunity-decisions.jsonl#1");
    assert.deepEqual(top?.opportunity_decision?.action_chain_snapshot?.map((step) => `${step.label}:${step.effect}`), [
      "inspect:read_only",
      "complete_after_mitigation:state_decision",
      "retire_historical:state_decision",
      "record_decision:state_decision"
    ]);
    assert.equal(
      top?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity context_pressure_session_status_pressure --status open --reason \"...\" --state-root <state-root>"
    );
    assert.equal(status.counts.opportunity_backlog.by_kind.context_pressure, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes archive health on top backlog item", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeText("memory/episodes/status-archive-raw.md", "RAW_STATUS_ARCHIVE_SHOULD_NOT_APPEAR");
    await store.writeText("memory/episodes/events.jsonl", `${JSON.stringify({
      id: "event_status_archive_missing",
      session_id: "session_status_archive",
      turn_id: "turn_status_archive",
      kind: "report",
      summary: "Governance status should show archive health without raw artifacts.",
      artifact_refs: ["memory/episodes/status-archive-raw.md"],
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.kind, "archive_health");
    assert.equal(top?.id, "archive_health_missing_2026_06_30");
    assert.equal(top?.action_kind, "refresh_episode_archives");
    assert.equal(top?.archive_health?.issue_kind, "missing_archive");
    assert.equal(top?.archive_health?.issue_status, "error");
    assert.equal(top?.archive_health?.date, "2026-06-30");
    assert.equal(top?.archive_health?.archive_ref, "memory/archives/2026-06-30.json");
    assert.equal(top?.archive_health?.source_event_count, 1);
    assert.equal(top?.archive_health?.archive_event_count, null);
    assert.match(top?.archive_health?.inspect_command ?? "", /memory archive-health --archive 2026-06-30/);
    assert.match(top?.archive_health?.refresh_command ?? "", /memory archive --state-root/);
    assert.equal(
      top?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity archive_health_missing_2026_06_30 --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.equal(status.counts.opportunity_backlog.by_kind.archive_health, 1);
    assert.deepEqual(status.latest_refs.opportunity_backlog, ["memory/archives/2026-06-30.json"]);
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_ARCHIVE_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes skill registry health on top backlog item", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeRepoText("vault/skills/status-skill-health/SKILL.md", [
      "---",
      "name: status-skill-health",
      "description: Current governance status skill health fixture.",
      "---",
      "",
      "RAW_STATUS_SKILL_HEALTH_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeRepoText("vault/registry/skills.jsonl", `${JSON.stringify(skillRegistryEntry({
      name: "status-skill-health",
      description: "Stale governance status skill health fixture.",
      instructions_ref: "vault/skills/status-skill-health/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#status-skill-health",
      content_hash: "stale-hash"
    }))}\n`);

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.kind, "skill_registry_health");
    assert.equal(top?.id, "skill_registry_health_metadata_drift_status_skill_health");
    assert.equal(top?.action_kind, "inspect_skill_registry_health");
    assert.equal(top?.skill_registry_health?.issue_kind, "registry_metadata_drift");
    assert.equal(top?.skill_registry_health?.issue_status, "warning");
    assert.equal(top?.skill_registry_health?.skill_name, "status-skill-health");
    assert.equal(top?.skill_registry_health?.instructions_ref, "vault/skills/status-skill-health/SKILL.md");
    assert.match(top?.skill_registry_health?.inspect_command ?? "", /skills health --skill-name status-skill-health/);
    assert.match(top?.skill_registry_health?.sync_command ?? "", /skills --action sync/);
    assert.equal(
      top?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity skill_registry_health_metadata_drift_status_skill_health --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.equal(status.counts.opportunity_backlog.by_kind.skill_registry_health, 1);
    assert.deepEqual(status.latest_refs.opportunity_backlog, ["vault/skills/status-skill-health/SKILL.md"]);
    assert.doesNotMatch(JSON.stringify(status), /RAW_STATUS_SKILL_HEALTH_BODY_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("governance status includes attention-worthy working checkpoint on top backlog item", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-governance-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("memory/working/current.json", {
      goal: "Keep governance status aware of blocked working checkpoints.",
      current_step: "blocked_status_follow_up",
      known_constraints: ["Do not read raw evidence artifacts from status."],
      recent_evidence_refs: ["memory/episodes/raw-working-status.md"],
      open_questions: ["Which next slice should resume the loop?"],
      next_action: "Resume after the operator chooses the bounded follow-up.",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await store.writeText("memory/episodes/raw-working-status.md", "RAW_WORKING_STATUS_SHOULD_NOT_APPEAR");
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_working_status",
      session_id: "session_working_status",
      turn_id: "turn_working_status",
      kind: "report",
      summary: "Recorded working checkpoint for governance status.",
      artifact_refs: [
        "memory/working/current.json",
        "memory/episodes/raw-working-status.md"
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const status = await getGovernanceStatus(store, { limit: 1 });
    const top = status.opportunity_backlog.top_item;

    assert.equal(top?.kind, "working_checkpoint");
    assert.equal(top?.working_checkpoint?.checkpoint_ref, "memory/working/current.json");
    assert.equal(top?.working_checkpoint?.current_step, "blocked_status_follow_up");
    assert.equal(top?.working_checkpoint?.open_question_count, 1);
    assert.equal(top?.working_checkpoint?.evidence_event_refs[0], "memory/episodes/events.jsonl#evidence_working_status");
    assert.match(status.working_checkpoint.attention_hint, /Review working checkpoint memory\/working\/current\.json/);
    assert.equal(
      top?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity working_checkpoint_current --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.equal(status.counts.opportunity_backlog.by_kind.working_checkpoint, 1);
    assert.doesNotMatch(JSON.stringify(status), /RAW_WORKING_STATUS_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createStatusLiveSourceContentRun(store: AgentStore) {
  return runContentDryRun(store, {
    topic: "daily AI news and semiconductor stock hotspots",
    sourceUrls: ["https://example.com/status-ai.json"],
    tickers: ["NVDA"],
    liveSources: true,
    fetchText: async (url) => {
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
                lastTradeTimestamp: statusRecentIso(1),
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
          hits: [
            { title: "Frontier model reaches new coding benchmark", created_at: statusRecentIso(2) },
            { title: "AI chip supply chain remains market focus", created_at: statusRecentIso(3) }
          ]
        })
      };
    }
  });
}

async function writeStatusFakeImage(outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, "fake image bytes", "utf8");
}

function statusRecentIso(hoursAgo = 2): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

async function writeRepoHead(store: AgentStore, commit: string, branch = "develop"): Promise<void> {
  await store.writeRepoText(".git/HEAD", `ref: refs/heads/${branch}\n`);
  await store.writeRepoText(`.git/refs/heads/${branch}`, `${commit}\n`);
}

function memoryCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "memory_proposal_test",
    action_type: "propose_memory",
    status: "candidate",
    scope: "local",
    summary: "Local lesson",
    content: "Detailed content",
    artifact_refs: ["memory/episodes/events.jsonl"],
    created_at: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}

function memoryConfirmation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "memory_confirmation_test",
    action_type: "promote_memory_candidate",
    status: "pending",
    created_at: "2026-06-30T00:00:00.000Z",
    candidate_ref: "memory/semantic/candidates/memory_proposal_new.json",
    candidate_id: "memory_proposal_new",
    confirmation_required: true,
    execution_allowed: false,
    would_write: ["state"],
    safety_boundary: ["This request records operator intent only."],
    next_step: "Review before execution.",
    ...overrides
  };
}

function acceptedMemory(): Record<string, unknown> {
  return {
    id: "semantic_memory_a",
    action_type: "semantic_memory",
    status: "accepted",
    scope: "local",
    summary: "Use explicit confirmation gates.",
    content: "Detailed accepted memory content.",
    source_candidate_id: "memory_proposal_new",
    source_candidate_ref: "memory/semantic/candidates/memory_proposal_new.json",
    artifact_refs: ["memory/episodes/events.jsonl"],
    confirmation_ref: "memory/semantic/confirmations/memory_confirmation_executed.json",
    created_at: "2026-06-30T00:00:00.000Z",
    accepted_at: "2026-06-30T00:04:00.000Z",
    boundary: "local state semantic memory"
  };
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
    name: "status-skill-health",
    description: "Governance status skill registry health fixture.",
    source: "personal",
    status: "active",
    instructions_ref: "vault/skills/status-skill-health/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#status-skill-health",
    origin_ref: null,
    trust_level: "local",
    source_sop_ref: null,
    references: [],
    tool_requirements: [],
    verification: "node --import tsx --test tests/governance_status.test.ts",
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

function backgroundReview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "background_review_test",
    mode: "recent",
    query: null,
    session_id: null,
    created_at: "2026-06-30T00:00:00.000Z",
    stats: {
      events_reviewed: 1,
      sessions_seen: 1,
      kinds: { report: 1 },
      failure_signal_count: 0,
      sop_signal_count: 0
    },
    source: {
      memory_sync: {
        source_ref: "memory/episodes/events.jsonl",
        db_ref: "memory/index/episodes.sqlite",
        total_rows: 1,
        indexed_rows: 1,
        skipped_rows: 0
      },
      reviewed_event_ids: ["evidence_status_draft"],
      working_checkpoint: null
    },
    chain_summaries: [],
    proposals: [],
    artifact_refs: {
      json_ref: "autonomy/reviews/background_review_test.json",
      markdown_ref: "autonomy/reviews/background_review_test.md"
    },
    evidence_event_id: "evidence_background_review_test",
    ...overrides
  };
}

function reviewInboxItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "review_inbox_test",
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    status: "open",
    source: "review_tick",
    first_review_ref: "autonomy/reviews/background_review_1.json",
    latest_review_ref: "autonomy/reviews/background_review_2.json",
    proposal_id: "review_proposal_1",
    proposal_type: "sop_candidate",
    proposal_title: "Draft local SOP",
    action_id: "follow_up_action_draft_sop_1",
    action_kind: "draft_sop",
    title: "Draft local SOP",
    rationale: "Repeated evidence needs a local SOP draft.",
    command: null,
    required_refs: ["autonomy/reviews/background_review_2.json"],
    would_write: ["state"],
    seen_count: 1,
    ...overrides
  };
}

function reviewConfirmation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "follow_up_confirmation_test",
    created_at: "2026-06-30T00:00:00.000Z",
    status: "pending",
    review_ref: "autonomy/reviews/background_review_1.json",
    proposal_id: "review_proposal_1",
    proposal_type: "sop_candidate",
    action_id: "follow_up_action_draft_sop_1",
    action_kind: "draft_sop",
    confirmation_required: true,
    execution_allowed: false,
    action: {
      id: "follow_up_action_draft_sop_1",
      kind: "draft_sop",
      title: "Draft local SOP",
      rationale: "Repeated evidence needs a local SOP draft.",
      command: null,
      required_refs: ["autonomy/reviews/background_review_1.json"],
      would_write: ["state"]
    },
    required_refs: ["autonomy/reviews/background_review_1.json"],
    would_write: ["state"],
    safety_boundary: ["This request records operator intent only."],
    next_step: "Review before execution.",
    ...overrides
  };
}
