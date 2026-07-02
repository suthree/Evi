import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ContextBundleManifest } from "../packages/core/src/context.js";
import { getArchiveHealth } from "../packages/core/src/archive_health.js";
import { getContextHealth } from "../packages/core/src/context_health.js";
import { getOpportunityBacklog } from "../packages/core/src/opportunity_backlog.js";
import { readReviewInboxDecisions } from "../packages/core/src/review_inbox_decisions.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  executeNextOpportunityAction,
  getOpportunityActionExecutionPolicy
} from "../packages/runtime/src/opportunity_actions.js";

test("governance act-next requests SOP audit confirmation without executing the audit", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await fixture.store.writeJson("sop/drafts/sop_act_next_draft.json", sopDraft({
      id: "sop_act_next_draft",
      title: "Request audit confirmation from act-next",
      status: "draft"
    }));

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "sop_act_next_draft"
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.kind, "sop_evolution_chain");
    assert.equal(result.selected_opportunity?.action_kind, "audit_sop");
    assert.equal(result.sop_confirmation?.action_kind, "audit_sop");
    assert.equal(result.sop_confirmation?.sop_id, "sop_act_next_draft");
    assert.equal(result.sop_confirmation?.sop_ref, "sop/drafts/sop_act_next_draft.json");
    assert.deepEqual(result.sop_confirmation?.would_write, ["state"]);
    assert.match(result.sop_confirmation?.next_step ?? "", /review execute-confirmed-follow-up --confirmation autonomy\/followups\//);
    assert.equal(existsSync(join(fixture.stateRoot, result.sop_confirmation?.confirmation_ref ?? "")), true);
    assert.equal(existsSync(join(fixture.stateRoot, result.sop_confirmation?.confirmation_markdown_ref ?? "")), true);

    const confirmation = JSON.parse(await readFile(
      join(fixture.stateRoot, result.sop_confirmation?.confirmation_ref ?? ""),
      "utf8"
    )) as Record<string, unknown>;
    assert.equal(confirmation.source, "sop_evolution_chain");
    assert.equal(confirmation.status, "pending");
    assert.equal(confirmation.execution_allowed, false);
    assert.equal(confirmation.action_kind, "audit_sop");

    const actionRecord = JSON.parse(await readFile(join(fixture.stateRoot, result.audit_ref), "utf8")) as Record<string, unknown>;
    assert.equal(actionRecord.sop_id, "sop_act_next_draft");
    assert.equal(actionRecord.confirmation_ref, result.sop_confirmation?.confirmation_ref);
    assert.equal(actionRecord.result_ref, result.sop_confirmation?.confirmation_ref);
    assert.equal(actionRecord.confirmation_action_kind, "audit_sop");
    assert.deepEqual(actionRecord.confirmation_would_write, ["state"]);
    assert.match(actionRecord.boundary as string, /never executes action_chain command strings/);

    assert.deepEqual((await fixture.store.listStateFiles("governance/audits")).filter((ref) => ref.endsWith(".json")), []);

    const duplicate = await executeNextOpportunityAction(fixture.store, {
      opportunity: "sop_act_next_draft"
    });
    assert.equal(duplicate.status, "skipped");
    assert.match(duplicate.record.skipped_reason ?? "", /requested opportunity not found/);
    assert.equal((await fixture.store.listStateFiles("autonomy/followups")).filter((ref) => ref.endsWith(".json")).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next requests SOP promotion confirmation without writing active vault", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await fixture.store.writeJson("sop/drafts/sop_act_next_promote.json", sopDraft({
      id: "sop_act_next_promote",
      title: "Request promotion confirmation from act-next",
      status: "audited"
    }));
    await fixture.store.writeJson("governance/audits/audit_act_next_promote.json", {
      id: "audit_act_next_promote",
      target_type: "sop",
      target_ref: "sop_act_next_promote",
      verdict: "promote",
      reason: "The SOP is ready for promotion, but act-next should only request confirmation.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:00:00.000Z"
    });

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "sop_act_next_promote"
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.kind, "sop_evolution_chain");
    assert.equal(result.selected_opportunity?.action_kind, "promote_sop");
    assert.equal(result.sop_confirmation?.action_kind, "promote_sop");
    assert.equal(result.sop_confirmation?.sop_id, "sop_act_next_promote");
    assert.deepEqual(result.sop_confirmation?.would_write, ["state", "active_vault"]);
    assert.match(result.sop_confirmation?.next_step ?? "", /review execute-confirmed-follow-up --confirmation autonomy\/followups\//);

    const confirmation = JSON.parse(await readFile(
      join(fixture.stateRoot, result.sop_confirmation?.confirmation_ref ?? ""),
      "utf8"
    )) as Record<string, unknown>;
    assert.equal(confirmation.status, "pending");
    assert.equal(confirmation.execution_allowed, false);
    assert.equal(confirmation.action_kind, "promote_sop");
    assert.deepEqual(confirmation.would_write, ["state", "active_vault"]);

    assert.deepEqual((await fixture.store.listStateFiles("governance/audits")).filter((ref) => ref.endsWith(".json")), [
      "governance/audits/audit_act_next_promote.json"
    ]);
    assert.equal(existsSync(join(fixture.root, "agent-home/vault/skills")), false);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next repairs orphan context manifest sidecars without exposing raw context", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    const context = [
      "## Stable Core",
      "",
      "RAW_ACT_NEXT_CONTEXT_BODY_SHOULD_NOT_APPEAR",
      "",
      "## Harness",
      "",
      "Keep context repair bounded to local state."
    ].join("\n");
    await fixture.store.writeText("memory/episodes/session_act_next-context.md", context);

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "memory/episodes/session_act_next-context.md"
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.kind, "context_health");
    assert.equal(result.selected_opportunity?.action_kind, "repair_context_health");
    assert.equal(result.execution_policy?.risk, "manual_local");
    assert.equal(result.execution_policy?.auto_executable, false);
    assert.equal(result.record.execution_policy?.risk, "manual_local");
    assert.equal(result.context_repair?.status, "repaired");
    assert.equal(result.context_repair?.context_ref, "memory/episodes/session_act_next-context.md");
    assert.equal(result.context_repair?.manifest_ref, "memory/episodes/session_act_next-context.json");
    assert.equal(result.context_repair?.total_chars, context.length);
    assert.equal(result.context_repair?.section_count, 2);
    assert.match(result.next_commands?.[0] ?? "", /context health --context memory\/episodes\/session_act_next-context\.md/);
    assert.match(result.next_commands?.[1] ?? "", /governance decide-opportunity .* --status completed/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_ACT_NEXT_CONTEXT_BODY_SHOULD_NOT_APPEAR/);

    const manifestRef = join(fixture.stateRoot, "memory/episodes/session_act_next-context.json");
    assert.equal(existsSync(manifestRef), true);
    const manifest = JSON.parse(await readFile(manifestRef, "utf8")) as ContextBundleManifest;
    assert.equal(manifest.session_id, "session_act_next");
    assert.equal(manifest.turn_id, "turn_recovered_session_act_next");
    assert.deepEqual(manifest.sections.map((section) => section.title), ["Stable Core", "Harness"]);

    const after = await getContextHealth(fixture.store, {
      contextRef: "memory/episodes/session_act_next-context.md"
    });
    assert.equal(after.count, 0);

    const actionRecord = JSON.parse(await readFile(join(fixture.stateRoot, result.audit_ref), "utf8")) as Record<string, unknown>;
    assert.equal(actionRecord.selected_opportunity_id, "context_health_orphan_context_memory_episodes_session_act_next_context_md");
    assert.equal(actionRecord.selected_action_kind, "repair_context_health");
    assert.equal(actionRecord.context_health_issue_kind, "orphan_context_markdown");
    assert.equal(actionRecord.context_ref, "memory/episodes/session_act_next-context.md");
    assert.equal(actionRecord.manifest_ref, "memory/episodes/session_act_next-context.json");
    assert.equal(actionRecord.context_repair_status, "repaired");
    assert.equal(actionRecord.context_repair_total_chars, context.length);
    assert.equal(actionRecord.context_repair_section_count, 2);
    assert.equal(actionRecord.result_ref, "memory/episodes/session_act_next-context.json");
    assert.match(actionRecord.boundary as string, /local context manifest sidecar repairs/);
    assert.doesNotMatch(JSON.stringify(actionRecord), /RAW_ACT_NEXT_CONTEXT_BODY_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next auto mode skips manual local context repairs", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    const context = [
      "## Stable Core",
      "",
      "Auto mode should not repair this local sidecar.",
      "",
      "## Harness",
      "",
      "Manual act-next can still repair it."
    ].join("\n");
    await fixture.store.writeText("memory/episodes/session_auto_skip-context.md", context);

    const before = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = before.items.find((candidate) =>
      candidate.ref === "memory/episodes/session_auto_skip-context.md"
    );
    assert.ok(item);
    const policy = getOpportunityActionExecutionPolicy(item);
    assert.equal(policy.supported, true);
    assert.equal(policy.risk, "manual_local");
    assert.equal(policy.auto_executable, false);

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "memory/episodes/session_auto_skip-context.md",
      executionMode: "auto"
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.selected_opportunity?.kind, "context_health");
    assert.equal(result.execution_policy?.risk, "manual_local");
    assert.equal(result.execution_policy?.auto_executable, false);
    assert.match(result.record.skipped_reason ?? "", /auto execution not allowed/);
    assert.equal(existsSync(join(fixture.stateRoot, "memory/episodes/session_auto_skip-context.json")), false);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next does not auto-repair missing context markdown issues", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await fixture.store.writeJson("memory/episodes/session_missing_auto-context.json", contextManifest({
      sessionId: "session_missing_auto",
      turnId: "turn_missing_auto",
      createdAt: "2026-07-01T00:00:00.000Z"
    }));

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "memory/episodes/session_missing_auto-context.json"
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.selected_opportunity?.kind, "context_health");
    assert.equal(result.selected_opportunity?.action_kind, "repair_context_health");
    assert.equal(result.context_repair, undefined);
    assert.match(result.record.skipped_reason ?? "", /unsupported opportunity action: kind=context_health status=error/);
    assert.equal(existsSync(join(fixture.stateRoot, "memory/episodes/session_missing_auto-context.md")), false);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next auto mode refreshes missing episode archives", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await fixture.store.writeText("memory/episodes/archive-action-raw.md", "RAW_ARCHIVE_ACTION_SHOULD_NOT_APPEAR");
    await fixture.store.writeText("memory/episodes/events.jsonl", `${JSON.stringify({
      id: "event_archive_action",
      session_id: "session_archive_action",
      turn_id: "turn_archive_action",
      kind: "report",
      summary: "Archive action should refresh missing daily summaries.",
      artifact_refs: ["memory/episodes/archive-action-raw.md"],
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);

    const before = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = before.items.find((candidate) => candidate.id === "archive_health_missing_2026_06_30");
    assert.ok(item);
    const policy = getOpportunityActionExecutionPolicy(item);
    assert.equal(policy.supported, true);
    assert.equal(policy.risk, "auto_safe");
    assert.equal(policy.auto_executable, true);
    assert.equal(policy.external_io, false);

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "archive_health_missing_2026_06_30",
      executionMode: "auto"
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.kind, "archive_health");
    assert.equal(result.selected_opportunity?.action_kind, "refresh_episode_archives");
    assert.equal(result.execution_policy?.risk, "auto_safe");
    assert.equal(result.archive_refresh?.refreshed_date, "2026-06-30");
    assert.equal(result.archive_refresh?.refreshed_archive_ref, "memory/archives/2026-06-30.json");
    assert.equal(result.archive_refresh?.refreshed_markdown_ref, "memory/archives/2026-06-30.md");
    assert.equal(result.archive_refresh?.refreshed_event_count, 1);
    assert.equal(result.archive_refresh?.health_status, "healthy");
    assert.equal(result.archive_refresh?.remaining_issue_count, 0);
    assert.equal(result.record.archive_refresh_date, "2026-06-30");
    assert.equal(result.record.archive_refresh_archive_ref, "memory/archives/2026-06-30.json");
    assert.equal(result.record.archive_refresh_remaining_issue_count, 0);
    assert.equal(result.record.result_ref, "memory/archives/2026-06-30.json");
    assert.match(result.record.boundary, /deterministic local episode archive refreshes/);
    assert.equal(existsSync(join(fixture.stateRoot, "memory/archives/2026-06-30.json")), true);
    assert.equal(existsSync(join(fixture.stateRoot, "memory/archives/2026-06-30.md")), true);
    assert.doesNotMatch(JSON.stringify(result), /RAW_ARCHIVE_ACTION_SHOULD_NOT_APPEAR/);

    const health = await getArchiveHealth(fixture.store, { archiveRef: "2026-06-30" });
    assert.equal(health.status, "healthy");
    assert.equal(health.count, 0);
    const after = await getOpportunityBacklog(fixture.store, { limit: 10 });
    assert.equal(after.items.some((candidate) => candidate.id === "archive_health_missing_2026_06_30"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next completes covered archive narrow-review inbox items", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await writeCurrentArchiveHealthFixture(fixture.store);
    await fixture.store.writeJson("autonomy/inbox/review_inbox_archive_narrow.json", reviewInboxItem({
      id: "review_inbox_archive_narrow",
      action_kind: "narrow_review",
      title: "Rerun background review with a narrower scope",
      rationale: "The current review scope is too broad for a mutation decision.",
      required_refs: ["memory/archives/2026-06-30.json", "memory/episodes/events.jsonl"],
      command: "pnpm run runtime -- review background --query archive_health"
    }));

    const before = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = before.items.find((candidate) => candidate.id === "review_inbox_archive_narrow");
    assert.equal(item?.kind, "review_inbox");
    assert.equal(item?.score_reasons.includes("narrow_review_archive_health=covered"), true);

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "review_inbox_archive_narrow",
      executionMode: "auto"
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.kind, "review_inbox");
    assert.equal(result.selected_opportunity?.action_kind, "narrow_review");
    assert.equal(result.execution_policy?.risk, "auto_safe");
    assert.equal(result.execution_policy?.auto_executable, true);
    assert.equal(result.execution_policy?.external_io, false);
    assert.equal(result.review_inbox_completion?.item_id, "review_inbox_archive_narrow");
    assert.equal(result.review_inbox_completion?.completion_kind, "narrow_review_archive_health_covered");
    assert.equal(result.review_inbox_completion?.status, "completed");
    assert.equal(result.review_inbox_completion?.reason, "Archive health is current after explicit refresh.");
    assert.equal(result.record.review_inbox_item_id, "review_inbox_archive_narrow");
    assert.equal(result.record.review_inbox_completion_kind, "narrow_review_archive_health_covered");
    assert.equal(result.record.review_inbox_decision_ref, result.review_inbox_completion?.decision_ref);
    assert.equal(result.record.result_ref, result.review_inbox_completion?.decision_ref);
    assert.match(result.record.boundary, /covered review-inbox triage completion decisions/);

    const decisions = await readReviewInboxDecisions(fixture.store);
    assert.equal(decisions.at(-1)?.item_id, "review_inbox_archive_narrow");
    assert.equal(decisions.at(-1)?.status, "completed");

    const after = await getOpportunityBacklog(fixture.store, { limit: 10 });
    assert.equal(after.items.some((candidate) => candidate.id === "review_inbox_archive_narrow"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next skips uncovered review inbox items", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await fixture.store.writeJson("autonomy/inbox/review_inbox_uncovered.json", reviewInboxItem({
      id: "review_inbox_uncovered",
      action_kind: "revise_skill",
      title: "Validate skill metadata",
      rationale: "This inbox item still needs human triage.",
      required_refs: ["vault/skills/missing-skill/SKILL.md"],
      command: "pnpm run runtime -- review coverage --sop missing_sop"
    }));

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "review_inbox_uncovered"
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.selected_opportunity?.kind, "review_inbox");
    assert.match(result.record.skipped_reason ?? "", /unsupported opportunity action/);
    assert.equal((await readReviewInboxDecisions(fixture.store)).length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next replay-audits failed completion verification evidence", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await writeCompletionReplayFixture(fixture.store, {
      completionId: "completion_verification_action_test",
      sessionId: "session_action_replay",
      turnId: "turn_action_replay",
      verificationStatus: "failed",
      verified: false,
      includeDelegatedFailure: true,
      includeRepoWriteGuard: false
    });

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "completion_verification_action_test"
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.kind, "completion_verification");
    assert.equal(result.selected_opportunity?.action_kind, "repair_completion");
    assert.equal(result.replay_audit?.completion_id, "completion_verification_action_test");
    assert.equal(result.replay_audit?.status, "attention");
    assert.equal(result.replay_audit?.delegated_results_failed, 1);
    assert.equal(result.replay_audit?.repo_write_guards, 0);
    assert.equal(result.replay_audit?.model_diagnostics, 0);
    assert.equal(result.replay_audit?.warning_count, 2);
    assert.equal(existsSync(join(fixture.stateRoot, result.replay_audit?.replay_ref ?? "")), true);
    assert.equal(existsSync(join(fixture.stateRoot, result.replay_audit?.markdown_ref ?? "")), true);
    assert.match(result.next_commands?.[0] ?? "", /review replays --replay harness_replay_/);
    assert.match(result.next_commands?.[1] ?? "", /governance decide-opportunity/);

    const actionRecord = JSON.parse(await readFile(join(fixture.stateRoot, result.audit_ref), "utf8")) as Record<string, unknown>;
    assert.equal(actionRecord.selected_opportunity_id, "completion_verification_action_test");
    assert.equal(actionRecord.selected_action_kind, "repair_completion");
    assert.equal(actionRecord.completion_id, "completion_verification_action_test");
    assert.equal(actionRecord.trace_ref, "memory/episodes/session_action_replay-completion-verification.json");
    assert.equal(actionRecord.replay_ref, result.replay_audit?.replay_ref);
    assert.equal(actionRecord.replay_markdown_ref, result.replay_audit?.markdown_ref);
    assert.equal(actionRecord.replay_status, "attention");
    assert.equal(actionRecord.replay_warning_count, 2);
    assert.equal(actionRecord.result_ref, result.replay_audit?.replay_ref);
    assert.match(actionRecord.boundary as string, /harness replay audits/);

    const replayRaw = await readFile(join(fixture.stateRoot, result.replay_audit?.replay_ref ?? ""), "utf8");
    assert.doesNotMatch(JSON.stringify(result), /RAW_ACTION_REPLAY_/);
    assert.doesNotMatch(JSON.stringify(actionRecord), /RAW_ACTION_REPLAY_/);
    assert.doesNotMatch(replayRaw, /RAW_ACTION_REPLAY_/);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next replay-audits repo write guard evidence", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await writeCompletionReplayFixture(fixture.store, {
      completionId: "completion_verification_repo_guard_action",
      sessionId: "session_repo_guard_action",
      turnId: "turn_repo_guard_action",
      verificationStatus: "passed",
      verified: true,
      includeDelegatedFailure: false,
      includeRepoWriteGuard: true
    });

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: "repo_write_guard_completion_verification_repo_guard_action_evidence_repo_guard_action"
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.kind, "repo_write_guard");
    assert.equal(result.selected_opportunity?.action_kind, "inspect_repo_write_guard");
    assert.equal(result.replay_audit?.completion_id, "completion_verification_repo_guard_action");
    assert.equal(result.replay_audit?.status, "attention");
    assert.equal(result.replay_audit?.repo_write_guards, 1);
    assert.equal(result.replay_audit?.delegated_results_failed, 0);
    assert.equal(result.replay_audit?.warning_count, 1);

    const actionRecord = JSON.parse(await readFile(join(fixture.stateRoot, result.audit_ref), "utf8")) as Record<string, unknown>;
    assert.equal(actionRecord.selected_opportunity_id, "repo_write_guard_completion_verification_repo_guard_action_evidence_repo_guard_action");
    assert.equal(actionRecord.selected_action_kind, "inspect_repo_write_guard");
    assert.equal(actionRecord.completion_id, "completion_verification_repo_guard_action");
    assert.equal(actionRecord.trace_ref, "memory/episodes/session_repo_guard_action-completion-verification.json");
    assert.equal(actionRecord.replay_ref, result.replay_audit?.replay_ref);
    assert.equal(actionRecord.replay_status, "attention");
    assert.equal(actionRecord.replay_warning_count, 1);

    const replayRaw = await readFile(join(fixture.stateRoot, result.replay_audit?.replay_ref ?? ""), "utf8");
    assert.match(replayRaw, /repo_write_guards/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_ACTION_REPLAY_/);
    assert.doesNotMatch(replayRaw, /RAW_ACTION_REPLAY_/);
  } finally {
    await fixture.cleanup();
  }
});

test("governance act-next records local feedback refresh route reviews without external capture", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.ensureLayout();
    await fixture.store.writeJson("services/im/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "skipped",
      updated_at: "2026-07-02T08:00:00.000Z",
      last_finished_at: "2026-07-02T08:00:00.000Z",
      last_queue_count: 4,
      last_due_count: 4,
      last_deferred_count: 0,
      last_skipped_count: 4,
      last_top_skip_reason: "non_mcp_capture_route",
      last_skip_reason_counts: {
        non_mcp_capture_route: 4
      },
      last_skipped_item_refs: ["content/runs/content_run_skipped/run.json"],
      last_deferred_item_refs: ["content/runs/content_run_feedback/run.json"],
      last_strategy_created_at: "2026-07-02T08:00:00.000Z",
      last_strategy_captured_by: "xiaohongshu-mcp",
      last_strategy_suggestion_count: 4,
      last_strategy_high_priority_count: 2,
      last_strategy_collect_more_feedback_count: 2,
      last_strategy_revise_next_post_count: 2,
      last_strategy_top_posture: "collect_more_feedback",
      last_strategy_top_priority: "high",
      last_strategy_top_title: "AI算力早报",
      last_strategy_top_run_ref: "content/runs/content_run_feedback/run.json",
      last_strategy_item_refs: ["content/runs/content_run_feedback/run.json"],
      next_due_run_id: "content_run_feedback",
      next_due_run_ref: "content/runs/content_run_feedback/run.json",
      next_due_reason: "needs_follow_up"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const item = backlog.items.find((entry) =>
      entry.self_evolution_gap?.proposed_slice === "feedback_refresh_route_review"
    );
    assert.ok(item);
    const policy = getOpportunityActionExecutionPolicy(item);
    assert.equal(policy.supported, true);
    assert.equal(policy.external_io, false);
    assert.equal(policy.risk, "manual_local");

    const result = await executeNextOpportunityAction(fixture.store, {
      opportunity: item.id
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.kind, "self_evolution_gap");
    assert.equal(result.selected_opportunity?.proposed_slice, "feedback_refresh_route_review");
    assert.equal(result.feedback_refresh_route_review?.service_ref, "services/im/content_feedback_refresh.json");
    assert.equal(result.feedback_refresh_route_review?.top_skip_reason, "non_mcp_capture_route");
    assert.equal(result.feedback_refresh_route_review?.due_count, 4);
    assert.equal(result.feedback_refresh_route_review?.skipped_count, 4);
    assert.equal(result.feedback_refresh_route_review?.strategy_collect_more_feedback_count, 2);
    assert.equal(result.feedback_refresh_route_review?.next_due_run_ref, "content/runs/content_run_feedback/run.json");
    assert.equal(result.next_commands?.some((command) => /feedback-capture|agent-browser|publish_content/.test(command)), false);

    const review = JSON.parse(await readFile(
      join(fixture.stateRoot, result.feedback_refresh_route_review?.review_ref ?? ""),
      "utf8"
    )) as Record<string, unknown>;
    assert.equal(review.kind, "content_feedback_refresh_route_review");
    assert.equal(review.service_ref, "services/im/content_feedback_refresh.json");
    assert.equal(review.status_updated_at, "2026-07-02T08:00:00.000Z");
    assert.equal(review.top_skip_reason, "non_mcp_capture_route");
    assert.match(review.boundary as string, /never calls Xiaohongshu MCP/);
    assert.doesNotMatch(JSON.stringify(review.next_commands), /feedback-capture|agent-browser|publish_content/);

    const actionRecord = JSON.parse(await readFile(join(fixture.stateRoot, result.audit_ref), "utf8")) as Record<string, unknown>;
    assert.equal(actionRecord.feedback_refresh_route_review_ref, result.feedback_refresh_route_review?.review_ref);
    assert.equal(actionRecord.feedback_refresh_route_top_skip_reason, "non_mcp_capture_route");
    assert.equal(actionRecord.feedback_refresh_route_due_count, 4);
    assert.equal(actionRecord.feedback_refresh_route_skipped_count, 4);
    assert.match(actionRecord.boundary as string, /local feedback-refresh route reviews/);

    const after = await getOpportunityBacklog(fixture.store, { limit: 20 });
    assert.equal(after.items.some((entry) => entry.id === item.id), false);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  root: string;
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "agent-opportunity-actions-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    root,
    repoRoot,
    stateRoot,
    store: new AgentStore(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function writeCurrentArchiveHealthFixture(store: AgentStore): Promise<void> {
  await store.writeText("memory/episodes/archive-health-current-raw.md", "RAW_ARCHIVE_HEALTH_CURRENT_SHOULD_NOT_APPEAR");
  await store.writeText("memory/episodes/events.jsonl", `${JSON.stringify({
    id: "event_archive_health_current",
    session_id: "session_archive_health_current",
    turn_id: "turn_archive_health_current",
    kind: "report",
    summary: "Archive health has already been refreshed.",
    artifact_refs: ["memory/episodes/archive-health-current-raw.md"],
    created_at: "2026-06-30T00:00:00.000Z"
  })}\n`);
  await store.writeJson("memory/archives/2026-06-30.json", {
    version: 1,
    date: "2026-06-30",
    source_ref: "memory/episodes/events.jsonl",
    archive_ref: "memory/archives/2026-06-30.json",
    markdown_ref: "memory/archives/2026-06-30.md",
    created_at: "2026-06-30T01:00:00.000Z",
    event_count: 1,
    session_count: 1,
    kind_counts: { report: 1 },
    first_event_at: "2026-06-30T00:00:00.000Z",
    last_event_at: "2026-06-30T00:00:00.000Z",
    sessions: [{
      session_id: "session_archive_health_current",
      event_count: 1,
      kind_counts: { report: 1 },
      first_event_at: "2026-06-30T00:00:00.000Z",
      last_event_at: "2026-06-30T00:00:00.000Z",
      summaries: ["Archive health has already been refreshed."],
      artifact_refs: ["memory/episodes/archive-health-current-raw.md"]
    }],
    recent_events: [{
      id: "event_archive_health_current",
      session_id: "session_archive_health_current",
      turn_id: "turn_archive_health_current",
      kind: "report",
      summary: "Archive health has already been refreshed.",
      artifact_refs: ["memory/episodes/archive-health-current-raw.md"],
      created_at: "2026-06-30T00:00:00.000Z"
    }]
  });
}

function reviewInboxItem(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "review_inbox_action_test",
    created_at: "2026-06-30T00:00:01.000Z",
    updated_at: "2026-06-30T00:00:01.000Z",
    status: "open",
    source: "review_tick",
    first_review_ref: "autonomy/reviews/background_review_action_test.json",
    latest_review_ref: "autonomy/reviews/background_review_action_test.json",
    proposal_id: "review_proposal_action_test",
    proposal_type: "runtime_gap",
    proposal_title: "Review inbox action test",
    action_id: "follow_up_action_action_test",
    action_kind: "narrow_review",
    title: "Review inbox action test",
    rationale: "Self-evolution inbox item awaiting operator triage.",
    command: null,
    required_refs: [],
    would_write: ["state"],
    seen_count: 1,
    ...overrides
  };
}

function contextManifest(args: {
  sessionId: string;
  turnId: string;
  createdAt: string;
}): ContextBundleManifest {
  return {
    version: 1,
    created_at: args.createdAt,
    session_id: args.sessionId,
    turn_id: args.turnId,
    total_chars: 128,
    section_count: 1,
    sections: [{
      title: "Stable Core",
      chars: 128,
      refs: [],
      item_count: 1
    }],
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
    },
    context_budget: null
  };
}

function sopDraft(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "sop_act_next",
    title: "Act next SOP",
    trigger: "Use when a SOP evolution chain should advance only through explicit confirmation.",
    procedure: [
      "Read the current SOP evolution chain.",
      "Request confirmation for the current next command.",
      "Leave execution to an explicit confirmed follow-up command."
    ],
    required_tools: ["governance.act-next", "review.execute-confirmed-follow-up"],
    verification: "The confirmation is pending and no audit or active-vault write occurs.",
    failure_modes: [
      "If the chain already has a pending confirmation, do not create a duplicate.",
      "If the next command is stale, request a fresh confirmation before execution."
    ],
    evidence_refs: ["memory/episodes/events.jsonl"],
    revision: 1,
    status: "draft",
    ...overrides
  };
}

function passingChecks(): Record<string, string> {
  return {
    evidence: "pass",
    trigger_clarity: "pass",
    verification: "pass",
    failure_modes: "pass",
    rollback_or_retirement: "pass",
    seed_policy: "pass"
  };
}

async function writeCompletionReplayFixture(
  store: AgentStore,
  args: {
    completionId: string;
    sessionId: string;
    turnId: string;
    verificationStatus: "passed" | "failed";
    verified: boolean;
    includeDelegatedFailure: boolean;
    includeRepoWriteGuard: boolean;
  }
): Promise<void> {
  await store.writeText(`memory/episodes/${args.sessionId}-context.md`, "RAW_ACTION_REPLAY_CONTEXT_SHOULD_NOT_APPEAR");
  await store.writeJson(`memory/episodes/${args.sessionId}-context.json`, contextManifest({
    sessionId: args.sessionId,
    turnId: args.turnId,
    createdAt: "2026-07-01T00:00:00.000Z"
  }));
  await store.writeText(`memory/episodes/${args.sessionId}-model-response-r1.json`, "RAW_ACTION_REPLAY_MODEL_RESPONSE_SHOULD_NOT_APPEAR");
  await store.writeJson(`memory/episodes/${args.sessionId}-model-action-r1.json`, {
    summary: "Replay action fixture records a bounded tool result.",
    actions: [{
      type: "use_tool",
      rationale: "Write a bounded fixture artifact.",
      payload: { tool: "file.write_state", path: "RAW_ACTION_REPLAY_TOOL_PATH_SHOULD_NOT_APPEAR" }
    }],
    completion_claim: {
      status: "done",
      verification_refs: []
    }
  });
  await store.writeText(`memory/episodes/${args.sessionId}-tool_result_write.json`, "RAW_ACTION_REPLAY_TOOL_RESULT_SHOULD_NOT_APPEAR");
  if (args.includeDelegatedFailure) {
    await store.writeText(`memory/episodes/${args.sessionId}-delegated_result_invalid.json`, "RAW_ACTION_REPLAY_DELEGATED_RESULT_SHOULD_NOT_APPEAR");
  }
  await store.writeText(`memory/episodes/${args.sessionId}-final-response.md`, "RAW_ACTION_REPLAY_FINAL_RESPONSE_SHOULD_NOT_APPEAR");
  await store.writeJson(`memory/episodes/${args.sessionId}-completion-verification.json`, completionReport({
    id: args.completionId,
    session_id: args.sessionId,
    turn_id: args.turnId,
    completion_status: "done",
    verification_status: args.verificationStatus,
    verified: args.verified,
    summary: args.verificationStatus === "passed"
      ? "Completion verification passed but repo write guard may require replay."
      : "Completion verification failed and should be replay-audited.",
    envelope_ref: `memory/episodes/${args.sessionId}-model-action-r1.json`,
    final_response_ref: `memory/episodes/${args.sessionId}-final-response.md`,
    observation_refs: [
      `memory/episodes/${args.sessionId}-tool_result_write.json`,
      ...(args.includeDelegatedFailure ? [`memory/episodes/${args.sessionId}-delegated_result_invalid.json`] : [])
    ],
    checks: args.verificationStatus === "passed"
      ? [{
        id: "write_run_tool_results",
        status: "pass",
        summary: "Repo write tool result succeeded.",
        refs: ["tool_result_write"]
      }]
      : [{
        id: "delegated_results",
        status: "fail",
        summary: "Failed delegated result(s): 1.",
        refs: ["delegated_result_invalid"]
      }],
    created_at: "2026-07-01T00:00:07.000Z"
  }));
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: `evidence_prompt_${args.completionId}`,
    session_id: args.sessionId,
    turn_id: args.turnId,
    kind: "prompt",
    summary: "Accepted replay action fixture task.",
    artifact_refs: [
      `memory/episodes/${args.sessionId}-context.md`,
      `memory/episodes/${args.sessionId}-context.json`
    ],
    created_at: "2026-07-01T00:00:00.000Z"
  });
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: `evidence_model_${args.completionId}`,
    session_id: args.sessionId,
    turn_id: args.turnId,
    kind: "model_action",
    summary: "Replay action fixture records a bounded tool result.",
    artifact_refs: [
      `memory/episodes/${args.sessionId}-model-response-r1.json`,
      `memory/episodes/${args.sessionId}-model-action-r1.json`
    ],
    created_at: "2026-07-01T00:00:01.000Z"
  });
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: args.includeRepoWriteGuard ? "evidence_repo_guard_action" : `evidence_tool_${args.completionId}`,
    session_id: args.sessionId,
    turn_id: args.turnId,
    kind: "tool_result",
    summary: args.includeRepoWriteGuard
      ? "Wrote repo:docs/action-replay.md (64 bytes). workspace_guard: before=dirty after=dirty changed_files=2->3 delta=1 preexisting_dirty=true target_changed=true."
      : "Wrote state:memory/episodes/action-replay.json (64 bytes).",
    artifact_refs: [`memory/episodes/${args.sessionId}-tool_result_write.json`],
    created_at: "2026-07-01T00:00:02.000Z"
  });
  if (args.includeDelegatedFailure) {
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: `evidence_delegated_${args.completionId}`,
      session_id: args.sessionId,
      turn_id: args.turnId,
      kind: "delegated_result",
      summary: "Delegated result failed contract: invalid JSON.",
      artifact_refs: [`memory/episodes/${args.sessionId}-delegated_result_invalid.json`],
      created_at: "2026-07-01T00:00:03.000Z"
    });
  }
}

function completionReport(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "completion_verification_action_test",
    session_id: "session_action_replay",
    turn_id: "turn_action_replay",
    completion_status: "done",
    verification_status: "failed",
    verified: false,
    summary: "Completion verification failed.",
    envelope_ref: "memory/episodes/session_action_replay-model-action-r1.json",
    final_response_ref: null,
    claimed_verification_refs: [],
    observation_refs: [],
    checks: [],
    created_at: "2026-07-01T00:00:07.000Z",
    boundary: "harness-owned completion verification report; read-only context input, not replay authority",
    ...overrides
  };
}
