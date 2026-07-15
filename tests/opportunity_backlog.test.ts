import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ContextBundleManifest } from "../packages/core/src/context.js";
import { decideOpportunity, getOpportunityBacklog } from "../packages/core/src/opportunity_backlog.js";
import {
  recordSelfEvolutionIteration,
  recordSelfEvolutionIterationOutcome
} from "../packages/core/src/self_evolution_iterations.js";
import { AgentStore } from "../packages/core/src/store.js";

test("opportunity backlog ranks local self-evolution attention without executing work", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_test",
      status: "active",
      reason: "Operator should review pending local self-evolution."
    });
    await fixture.store.writeJson("memory/semantic/candidates/memory_candidate_a.json", {
      id: "memory_candidate_a",
      action_type: "propose_memory",
      status: "candidate",
      summary: "Remember the operator prefers explicit mutation gates.",
      content: "RAW_MEMORY_CONTENT_SHOULD_NOT_BE_RETURNED",
      artifact_refs: ["memory/episodes/events.jsonl"],
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await fixture.store.writeJson("memory/semantic/confirmations/memory_confirmation_a.json", {
      id: "memory_confirmation_a",
      action_type: "promote_memory_candidate",
      status: "pending",
      candidate_id: "memory_candidate_a",
      candidate_ref: "memory/semantic/candidates/memory_candidate_a.json",
      confirmation_required: true,
      execution_allowed: false,
      created_at: "2026-06-30T00:00:02.000Z"
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_a.json", {
      id: "review_inbox_a",
      source: "review_tick",
      status: "open",
      action_kind: "draft_sop",
      title: "Draft a local review SOP",
      rationale: "Repeated local evidence should become a state-only SOP draft.",
      latest_review_ref: "autonomy/reviews/background_review_a.json",
      created_at: "2026-06-30T00:00:03.000Z",
      updated_at: "2026-06-30T00:00:04.000Z"
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_a_duplicate.json", {
      id: "review_inbox_a_duplicate",
      source: "review_tick",
      status: "open",
      action_kind: "draft_sop",
      title: "Draft a local review SOP",
      rationale: "Repeated local evidence should become a state-only SOP draft.",
      latest_review_ref: "autonomy/reviews/background_review_a.json",
      created_at: "2026-06-30T00:00:03.000Z",
      updated_at: "2026-06-30T00:00:03.500Z"
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_a.json", {
      id: "follow_up_confirmation_a",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_a.json",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        title: "Promote audited SOP",
        rationale: "The SOP has audit evidence and should be considered for promotion."
      },
      created_at: "2026-06-30T00:00:05.000Z"
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_done.json", {
      id: "follow_up_confirmation_done",
      status: "executed",
      confirmation_required: true,
      execution_allowed: false,
      action_kind: "draft_sop"
    });
    await fixture.store.appendJsonl("autonomy/opportunities.jsonl", {
      id: "opportunity_open_a",
      source: "tool_gap",
      description: "Add an operator summary for local backlog triage.",
      evidence_refs: ["memory/episodes/events.jsonl"],
      growth_value: {
        capability_gain: 5,
        repeat_demand: 3,
        evidence_available: 4,
        urgency_or_unblock: 3,
        risk: 1,
        cost: 1
      },
      budget_hint: {
        max_turns: 2,
        max_tool_calls: 4,
        side_effect_level: "none"
      },
      status: "open",
      created_at: "2026-06-30T00:00:06.000Z"
    });

    const all = await getOpportunityBacklog(fixture.store, { limit: 20 });
    assert.equal(all.count, 6);
    assert.deepEqual(new Set(all.items.map((item) => item.kind)), new Set([
      "autonomy_pause",
      "review_confirmation",
      "memory_confirmation",
      "review_inbox",
      "memory_candidate",
      "open_opportunity"
    ]));
    assert.equal(all.items.every((item) => item.score >= 0 && item.score <= 100), true);
    assert.equal(all.items.some((item) => item.id === "follow_up_confirmation_done"), false);
    assert.doesNotMatch(JSON.stringify(all), /RAW_MEMORY_CONTENT_SHOULD_NOT_BE_RETURNED/);
    const openReviewInbox = all.items.find((item) => item.id === "review_inbox_a");
    if (!openReviewInbox) throw new Error("expected review inbox backlog item");
    assert.equal(openReviewInbox.review_inbox_duplicate_group?.duplicate_count, 1);
    assert.deepEqual(openReviewInbox.review_inbox_duplicate_group?.duplicate_refs, [
      "autonomy/inbox/review_inbox_a_duplicate.json"
    ]);
    assert.equal(all.items.some((item) => item.id === "review_inbox_a_duplicate"), false);

    const limited = await getOpportunityBacklog(fixture.store, { limit: 3 });
    assert.equal(limited.count, 3);
    assert.deepEqual(limited.item_refs, all.item_refs.slice(0, 3));

    const emptyLimit = await getOpportunityBacklog(fixture.store, { limit: 0 });
    assert.equal(emptyLimit.count, 0);
    assert.deepEqual(emptyLimit.item_refs, []);

    await fixture.store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_completed",
      item_id: "review_inbox_a",
      item_ref: "autonomy/inbox/review_inbox_a.json",
      action_kind: "draft_sop",
      status: "completed",
      previous_status: "open",
      reason: "Operator already handled this review suggestion.",
      created_at: "2026-06-30T00:00:07.000Z"
    });
    const afterInboxCompleted = await getOpportunityBacklog(fixture.store, { limit: 20 });
    assert.equal(afterInboxCompleted.items.some((item) => item.id === "review_inbox_a"), false);
    assert.equal(afterInboxCompleted.items.some((item) => item.id === "review_inbox_a_duplicate"), false);

    await fixture.store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_open",
      item_id: "review_inbox_a",
      item_ref: "autonomy/inbox/review_inbox_a.json",
      action_kind: "draft_sop",
      status: "open",
      previous_status: "completed",
      reason: "Operator reopened it after finding missing evidence.",
      created_at: "2026-06-30T00:00:08.000Z"
    });
    const afterInboxReopen = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const reopenedReviewInbox = afterInboxReopen.items.find((item) => item.id === "review_inbox_a");
    assert.equal(reopenedReviewInbox?.status, "open");
    assert.match(reopenedReviewInbox?.summary ?? "", /Operator reopened it/);

    await fixture.store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_deferred",
      item_id: "review_inbox_a",
      item_ref: "autonomy/inbox/review_inbox_a.json",
      action_kind: "draft_sop",
      status: "deferred",
      previous_status: "open",
      reason: "Waiting for a larger SOP review pass.",
      created_at: "2026-06-30T00:00:09.000Z"
    });
    await fixture.store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_deferred_duplicate",
      item_id: "review_inbox_a_duplicate",
      item_ref: "autonomy/inbox/review_inbox_a_duplicate.json",
      action_kind: "draft_sop",
      status: "deferred",
      previous_status: "open",
      reason: "Duplicate follows the canonical deferred decision.",
      created_at: "2026-06-30T00:00:08.900Z"
    });
    const afterInboxDeferred = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const deferredReviewInbox = afterInboxDeferred.items.find((item) => item.id === "review_inbox_a");
    assert.equal(deferredReviewInbox?.status, "deferred");
    assert.match(deferredReviewInbox?.next_step ?? "", /review decide-inbox --item review_inbox_a --status open/);
    assert.equal((deferredReviewInbox?.score ?? 0) < openReviewInbox.score, true);

    const completed = await decideOpportunity(fixture.store, {
      opportunity: "opportunity_open_a",
      status: "completed",
      reason: "Operator handled this local backlog item in the current slice."
    });
    assert.equal(completed.action, "decide-opportunity");
    assert.equal(completed.opportunity_id, "opportunity_open_a");
    assert.equal(completed.previous_status, "open");
    assert.equal(completed.status, "completed");
    assert.equal(completed.decision_ref, "autonomy/opportunity-decisions.jsonl#1");
    const afterCompleted = await getOpportunityBacklog(fixture.store, { limit: 20 });
    assert.equal(afterCompleted.items.some((item) => item.id === "opportunity_open_a"), false);

    const reopened = await decideOpportunity(fixture.store, {
      opportunity: "autonomy/opportunities.jsonl#1",
      status: "open",
      reason: "Operator reopened it after noticing missing follow-up evidence."
    });
    assert.equal(reopened.previous_status, "completed");
    assert.equal(reopened.decision_ref, "autonomy/opportunity-decisions.jsonl#2");
    const afterReopen = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const reopenedItem = afterReopen.items.find((item) => item.id === "opportunity_open_a");
    assert.equal(reopenedItem?.status, "open");
    assert.equal(reopenedItem?.opportunity_decision?.status, "open");
    assert.equal(reopenedItem?.opportunity_decision?.ref, "autonomy/opportunity-decisions.jsonl#2");
    assert.match(reopenedItem?.summary ?? "", /Operator reopened it/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog demotes core/basic iteration outcome SOP follow-ups", async () => {
  const fixture = await createFixture();
  try {
    const coreIteration = await recordSelfEvolutionIteration(fixture.store, {
      summary: "Keep cumulative project design ahead of SOP follow-up churn.",
      layer: "core_runtime",
      ownerSurface: "project_design",
      proposedSlice: "next_core_basic_plan",
      sourceRef: "self-evolution/scorecard/latest.json",
      evidenceRefs: ["packages/core/src/project_design.ts"],
      verificationCommands: ["pnpm run check"],
      nonGoals: ["do not treat application tools as core runtime identity"]
    });
    await recordSelfEvolutionIterationOutcome(fixture.store, {
      iterationRef: coreIteration.iteration.id,
      status: "verified",
      summary: "The project-design plan was verified and should remain the core/basic planning source.",
      evidenceRefs: ["tests/project_design.test.ts"],
      verificationCommands: ["pnpm exec tsx --test tests/project_design.test.ts"],
      nextMoves: ["Use the plan before drafting SOP follow-ups."]
    });

    const localIteration = await recordSelfEvolutionIteration(fixture.store, {
      summary: "Preserve reusable local-learning lessons as SOP candidates.",
      layer: "local_learning",
      ownerSurface: "sop_skill_memory_loop",
      proposedSlice: "verified_iteration_outcome_sop_candidate",
      sourceRef: "memory/dreams/dream_iteration.json",
      evidenceRefs: ["packages/core/src/self_evolution_iterations.ts"],
      verificationCommands: ["pnpm run check"],
      nonGoals: ["do not write active-vault skills automatically"]
    });
    await recordSelfEvolutionIterationOutcome(fixture.store, {
      iterationRef: localIteration.iteration.id,
      status: "verified",
      summary: "The reusable lesson should still be available for review tick SOP drafting.",
      evidenceRefs: ["tests/opportunity_backlog.test.ts"],
      verificationCommands: ["pnpm exec tsx --test tests/opportunity_backlog.test.ts"],
      nextMoves: ["Route through review tick before drafting."]
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const coreItem = backlog.items.find((item) =>
      item.self_evolution_gap?.source_ref === coreIteration.iteration.ref
    );
    const localItem = backlog.items.find((item) =>
      item.self_evolution_gap?.source_ref === localIteration.iteration.ref
    );
    if (!coreItem) throw new Error("expected core/basic iteration outcome backlog item");
    if (!localItem) throw new Error("expected local-learning iteration outcome backlog item");

    assert.equal(coreItem.action_kind, "draft_sop");
    assert.equal(localItem.action_kind, "draft_sop");
    assert.equal(coreItem.score < localItem.score, true);
    assert.equal(coreItem.score_reasons.includes("source_iteration_layer=core_runtime"), true);
    assert.equal(coreItem.score_reasons.includes("core_basic_iteration_outcome_followup=demoted"), true);
    assert.equal(localItem.score_reasons.includes("source_iteration_layer=local_learning"), true);
    assert.equal(localItem.score_reasons.includes("core_basic_iteration_outcome_followup=demoted"), false);
    assert.match(coreItem.next_step, /low-priority learning follow-up/);
    assert.equal(backlog.items.indexOf(localItem) < backlog.items.indexOf(coreItem), true);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog collapses narrow review duplicates across changing evidence refs", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("autonomy/inbox/review_inbox_scoped_a.json", {
      id: "review_inbox_scoped_a",
      source: "review_tick",
      status: "open",
      action_kind: "narrow_review",
      title: "Rerun background review with a narrower scope",
      rationale: "The current review scope is too broad for a mutation decision.",
      proposal_title: "Add scoped review filters before automatic background scheduling",
      latest_review_ref: "autonomy/reviews/background_review_scoped_a.json",
      command: "pnpm run runtime -- review background --query 'Add scoped review filters before automatic background scheduling'",
      required_refs: [
        "autonomy/ticks/review_tick_old.json",
        "autonomy/inbox/review_inbox_old.json"
      ],
      would_write: ["state"],
      created_at: "2026-06-30T00:00:01.000Z",
      updated_at: "2026-06-30T00:00:01.000Z"
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_scoped_b.json", {
      id: "review_inbox_scoped_b",
      source: "review_tick",
      status: "open",
      action_kind: "narrow_review",
      title: "Rerun background review with a narrower scope",
      rationale: "The current review scope is too broad for a mutation decision.",
      proposal_title: "Add scoped review filters before automatic background scheduling",
      latest_review_ref: "autonomy/reviews/background_review_scoped_b.json",
      command: "pnpm run runtime -- review background --query 'Add scoped review filters before automatic background scheduling'",
      required_refs: [
        "autonomy/ticks/review_tick_new.json",
        "autonomy/inbox/review_inbox_scoped_a.json"
      ],
      would_write: ["state"],
      created_at: "2026-06-30T00:00:02.000Z",
      updated_at: "2026-06-30T00:00:02.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.id === "review_inbox_scoped_b");

    assert.equal(backlog.items.some((entry) => entry.id === "review_inbox_scoped_a"), false);
    assert.equal(item?.review_inbox_duplicate_group?.duplicate_count, 1);
    assert.deepEqual(item?.review_inbox_duplicate_group?.duplicate_refs, [
      "autonomy/inbox/review_inbox_scoped_a.json"
    ]);

    await fixture.store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_scoped_completed",
      item_id: "review_inbox_scoped_b",
      item_ref: "autonomy/inbox/review_inbox_scoped_b.json",
      action_kind: "narrow_review",
      status: "completed",
      previous_status: "open",
      reason: "Scoped review focus is now implemented.",
      created_at: "2026-06-30T00:00:03.000Z"
    });

    const afterDecision = await getOpportunityBacklog(fixture.store, { limit: 10 });
    assert.equal(afterDecision.items.some((entry) => entry.id === "review_inbox_scoped_a"), false);
    assert.equal(afterDecision.items.some((entry) => entry.id === "review_inbox_scoped_b"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces failed and unfinished completion verification reports", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/episodes/session_failed-completion-verification.json", completionReport({
      id: "completion_verification_failed",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      summary: "Completion verification failed: failed write/run tool result(s): command.run.",
      final_response_ref: "memory/episodes/session_failed-final-response.md",
      observation_refs: ["memory/episodes/session_failed-tool_result_command.json"],
      checks: [
        {
          id: "final_response",
          status: "pass",
          summary: "Done claim has a persisted final response artifact.",
          refs: ["memory/episodes/session_failed-final-response.md"]
        },
        {
          id: "write_run_tool_results",
          status: "fail",
          summary: "Failed write/run tool result(s): command.run.",
          refs: ["tool_result_command"]
        }
      ]
    }));
    await fixture.store.writeText(
      "memory/episodes/session_failed-final-response.md",
      "RAW_FINAL_RESPONSE_SHOULD_NOT_BE_RETURNED"
    );
    await fixture.store.writeJson("memory/episodes/session_not_done-completion-verification.json", completionReport({
      id: "completion_verification_not_done",
      completion_status: "not_done",
      verification_status: "skipped",
      verified: false,
      summary: "Completion verification skipped for status=not_done.",
      final_response_ref: null,
      checks: [{
        id: "completion_status",
        status: "skipped",
        summary: "No done claim was made; status=not_done.",
        refs: []
      }]
    }));
    await fixture.store.writeJson("memory/episodes/session_passed-completion-verification.json", completionReport({
      id: "completion_verification_passed",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Completion verification passed with final response.",
      final_response_ref: "memory/episodes/session_passed-final-response.md"
    }));

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const completionItems = backlog.items.filter((item) => item.kind === "completion_verification");
    const failed = completionItems.find((item) => item.id === "completion_verification_failed");
    const notDone = completionItems.find((item) => item.id === "completion_verification_not_done");

    assert.equal(completionItems.length, 2);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.action_kind, "repair_completion");
    assert.equal(failed?.source_ref, "memory/episodes/session_failed-final-response.md");
    assert.match(failed?.next_step ?? "", /session_failed-completion-verification\.json/);
    assert.equal(failed?.score_reasons.some((reason) => reason === "failed_checks=write_run_tool_results"), true);
    assert.deepEqual(failed?.action_chain?.map((step) => step.label), [
      "inspect",
      "trace",
      "act_next",
      "record_decision"
    ]);
    assert.equal(failed?.action_chain?.[2]?.effect, "runtime_execution");
    assert.equal(
      failed?.action_chain?.[2]?.command,
      "pnpm run runtime -- governance act-next --opportunity completion_verification_failed --state-root <state-root>"
    );
    assert.equal(notDone?.status, "not_done");
    assert.equal(notDone?.action_kind, "resume_task");
    assert.equal(backlog.items.some((item) => item.id === "completion_verification_passed"), false);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_FINAL_RESPONSE_SHOULD_NOT_BE_RETURNED/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog summarizes model diagnostics on blocked completion reports", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/episodes/session_model_blocked-model-diagnostic-r1.json", {
      schema_version: 1,
      id: "model_diagnostic_backlog",
      session_id: "session_model_blocked",
      turn_id: "turn_model_blocked",
      round: 1,
      stage: "request",
      failure_kind: "rate_limit",
      error_preview: "Model request failed (429 Too Many Requests): [REDACTED]",
      output_preview: "RAW_MODEL_OUTPUT_SHOULD_NOT_BE_RETURNED",
      response_ref: null,
      context_ref: "memory/episodes/session_model_blocked-context.md",
      context_manifest_ref: "memory/episodes/session_model_blocked-context.json",
      created_at: "2026-06-30T00:00:07.000Z"
    });
    await fixture.store.writeJson("memory/episodes/session_model_blocked-completion-verification.json", completionReport({
      id: "completion_verification_model_blocked",
      session_id: "session_model_blocked",
      turn_id: "turn_model_blocked",
      completion_status: "blocked",
      verification_status: "skipped",
      verified: false,
      summary: "Completion verification skipped for status=blocked.",
      envelope_ref: "memory/episodes/session_model_blocked-model-action-r1.json",
      final_response_ref: "memory/episodes/session_model_blocked-final-response.md",
      observation_refs: ["memory/episodes/session_model_blocked-model-diagnostic-r1.json"],
      checks: [{
        id: "model_diagnostics",
        status: "warning",
        summary: "Model failure diagnostic artifact(s) recorded: 1.",
        refs: ["memory/episodes/session_model_blocked-model-diagnostic-r1.json"]
      }]
    }));
    await fixture.store.writeText(
      "memory/episodes/session_model_blocked-final-response.md",
      "RAW_BLOCKED_FINAL_RESPONSE_SHOULD_NOT_BE_RETURNED"
    );

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === "completion_verification_model_blocked");

    assert.equal(item?.kind, "completion_verification");
    assert.equal(item?.status, "blocked");
    assert.equal(item?.action_kind, "resume_task");
    assert.equal(item?.completion_verification?.model_diagnostic_count, 1);
    assert.equal(item?.completion_verification?.model_diagnostics[0]?.failure_kind, "rate_limit");
    assert.equal(item?.completion_verification?.model_diagnostics[0]?.stage, "request");
    assert.equal(item?.completion_verification?.model_diagnostics[0]?.diagnostic_ref, "memory/episodes/session_model_blocked-model-diagnostic-r1.json");
    assert.equal(item?.completion_verification?.model_diagnostics[0]?.error_preview, "Model request failed (429 Too Many Requests): [REDACTED]");
    assert.equal(item?.completion_verification?.inspect_command, "pnpm run runtime -- review completions --completion completion_verification_model_blocked --state-root <state-root>");
    assert.equal(item?.completion_verification?.trace_command, "pnpm run runtime -- review traces --trace completion_verification_model_blocked --state-root <state-root>");
    assert.equal(item?.score_reasons.includes("model_diagnostics=1"), true);
    assert.equal(item?.score_reasons.includes("model_failure_kinds=rate_limit"), true);
    assert.match(item?.next_step ?? "", /bounded model diagnostic trace/);
    assert.doesNotMatch(JSON.stringify(item), /RAW_MODEL_OUTPUT_SHOULD_NOT_BE_RETURNED/);
    assert.doesNotMatch(JSON.stringify(item), /RAW_BLOCKED_FINAL_RESPONSE_SHOULD_NOT_BE_RETURNED/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces repo writes on preexisting dirty workspace without raw artifacts", async () => {
  const fixture = await createFixture();
  try {
    const dirtySession = "session_repo_guard_dirty";
    const dirtyTurn = "turn_repo_guard_dirty";
    const cleanSession = "session_repo_guard_clean";
    const cleanTurn = "turn_repo_guard_clean";
    await fixture.store.writeText(
      `memory/episodes/${dirtySession}-tool_result_write.json`,
      "RAW_REPO_WRITE_TOOL_RESULT_SHOULD_NOT_APPEAR"
    );
    await fixture.store.writeJson(`memory/episodes/${dirtySession}-completion-verification.json`, completionReport({
      id: "completion_verification_repo_guard_dirty",
      session_id: dirtySession,
      turn_id: dirtyTurn,
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Completion verification passed after a repo write.",
      envelope_ref: `memory/episodes/${dirtySession}-model-action-r1.json`,
      final_response_ref: `memory/episodes/${dirtySession}-final-response.md`,
      observation_refs: [`memory/episodes/${dirtySession}-tool_result_write.json`],
      checks: [{
        id: "write_run_tool_results",
        status: "pass",
        summary: "Repo write tool result succeeded.",
        refs: ["tool_result_write"]
      }],
      created_at: "2026-06-30T00:40:00.000Z"
    }));
    await fixture.store.writeJson(`memory/episodes/${cleanSession}-completion-verification.json`, completionReport({
      id: "completion_verification_repo_guard_clean",
      session_id: cleanSession,
      turn_id: cleanTurn,
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Completion verification passed after a clean repo write.",
      envelope_ref: `memory/episodes/${cleanSession}-model-action-r1.json`,
      final_response_ref: `memory/episodes/${cleanSession}-final-response.md`,
      created_at: "2026-06-30T00:39:00.000Z"
    }));
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_repo_guard_dirty",
      session_id: dirtySession,
      turn_id: dirtyTurn,
      kind: "tool_result",
      summary: "Wrote repo:docs/dirty-write.md (64 bytes). workspace_guard: before=dirty after=dirty changed_files=2->3 delta=1 preexisting_dirty=true target_changed=true.",
      artifact_refs: [`memory/episodes/${dirtySession}-tool_result_write.json`],
      created_at: "2026-06-30T00:39:01.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_repo_guard_clean",
      session_id: cleanSession,
      turn_id: cleanTurn,
      kind: "tool_result",
      summary: "Wrote repo:docs/clean-write.md (64 bytes). workspace_guard: before=clean after=dirty changed_files=0->1 delta=1 preexisting_dirty=false target_changed=true.",
      artifact_refs: ["memory/episodes/clean-tool-result.json"],
      created_at: "2026-06-30T00:38:01.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const guardItems = backlog.items.filter((item) => item.kind === "repo_write_guard");
    const item = guardItems[0];

    assert.equal(guardItems.length, 1);
    if (!item) throw new Error("expected repo write guard backlog item");
    assert.equal(item.id, "repo_write_guard_completion_verification_repo_guard_dirty_evidence_repo_guard_dirty");
    assert.equal(item.status, "attention");
    assert.equal(item.action_kind, "inspect_repo_write_guard");
    assert.equal(item.budget_hint.side_effect_level, "none");
    assert.equal(item.source_ref, `memory/episodes/${dirtySession}-completion-verification.json`);
    assert.match(item.decision_command ?? "", /governance decide-opportunity/);
    assert.deepEqual(item.action_chain?.map((step) => step.label), [
      "inspect",
      "act_next",
      "record_decision"
    ]);
    assert.equal(item.action_chain?.[1]?.effect, "runtime_execution");
    assert.equal(
      item.action_chain?.[1]?.command,
      "pnpm run runtime -- governance act-next --opportunity repo_write_guard_completion_verification_repo_guard_dirty_evidence_repo_guard_dirty --state-root <state-root>"
    );
    assert.match(item.next_step, /review traces --trace completion_verification_repo_guard_dirty/);
    assert.equal(item.repo_write_guard?.path, "docs/dirty-write.md");
    assert.equal(item.repo_write_guard?.before_status, "dirty");
    assert.equal(item.repo_write_guard?.after_status, "dirty");
    assert.equal(item.repo_write_guard?.before_changed_file_count, 2);
    assert.equal(item.repo_write_guard?.after_changed_file_count, 3);
    assert.equal(item.repo_write_guard?.changed_file_count_delta, 1);
    assert.equal(item.repo_write_guard?.preexisting_dirty, true);
    assert.equal(item.repo_write_guard?.target_changed_after_write, true);
    assert.doesNotMatch(JSON.stringify(backlog), /docs\/clean-write\.md/);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_REPO_WRITE_TOOL_RESULT_SHOULD_NOT_APPEAR/);

    const decision = await decideOpportunity(fixture.store, {
      opportunity: item.id,
      status: "completed",
      reason: "Operator inspected the preexisting dirty repo write."
    });
    assert.equal(decision.opportunity_id, item.id);
    assert.equal(decision.decision.opportunity_kind, "repo_write_guard");
    assert.equal(decision.status, "completed");

    const afterDecision = await getOpportunityBacklog(fixture.store, { limit: 20 });
    assert.equal(afterDecision.items.some((candidate) => candidate.id === item.id), false);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces failed selected skill outcomes without raw bodies", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/outcome-drift/SKILL.md", [
      "---",
      "name: outcome-drift",
      "description: Use when selected skill outcome drift should be reviewed.",
      "---",
      "",
      "RAW_SKILL_BODY_SHOULD_NOT_BE_IN_BACKLOG"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_bad-context.md", "RAW_CONTEXT_SHOULD_NOT_BE_IN_BACKLOG");
    await fixture.store.writeText("memory/episodes/session_bad-final-response.md", "RAW_FINAL_RESPONSE_SHOULD_NOT_BE_IN_BACKLOG");
    await fixture.store.writeJson("memory/skills/usage/session_bad-outcome-drift.json", selectedSkillOutcome({
      id: "skill_usage_outcome_failed",
      skill_name: "outcome-drift",
      instructions_ref: "vault/skills/outcome-drift/SKILL.md",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      context_ref: "memory/episodes/session_bad-context.md",
      context_manifest_ref: "memory/episodes/session_bad-context.json",
      completion_report_ref: "memory/episodes/session_bad-completion-verification.json",
      final_response_ref: "memory/episodes/session_bad-final-response.md",
      created_at: "2026-06-30T00:00:10.000Z"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_good-outcome-ok.json", selectedSkillOutcome({
      id: "skill_usage_outcome_passed",
      skill_name: "outcome-ok",
      instructions_ref: "vault/skills/outcome-ok/SKILL.md",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      verdict: "no_sop",
      created_at: "2026-06-30T00:00:11.000Z"
    }));

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const skillItems = backlog.items.filter((item) => item.kind === "selected_skill_outcome");
    const item = skillItems.find((candidate) => candidate.id === "skill_usage_outcome_failed");

    assert.equal(skillItems.length, 1);
    assert.equal(item?.status, "failed");
    assert.equal(item?.action_kind, "review_skill_outcome");
    assert.equal(item?.ref, "memory/skills/usage/session_bad-outcome-drift.json");
    assert.equal(item?.source_ref, "memory/episodes/session_bad-completion-verification.json");
    assert.match(item?.summary ?? "", /outcome-drift/);
    assert.match(item?.summary ?? "", /verification=failed/);
    assert.match(item?.next_step ?? "", /memory\/skills\/usage\/session_bad-outcome-drift\.json/);
    assert.equal(item?.selected_skill_outcome?.skill_name, "outcome-drift");
    assert.equal(item?.selected_skill_outcome?.verification_status, "failed");
    assert.equal(item?.selected_skill_outcome?.completion_report_ref, "memory/episodes/session_bad-completion-verification.json");
    assert.equal(item?.score_reasons.includes("selected_skill_outcome=attention"), true);
    assert.equal(backlog.items.some((candidate) => candidate.id === "skill_usage_outcome_passed"), false);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_SKILL_BODY_SHOULD_NOT_BE_IN_BACKLOG/);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_CONTEXT_SHOULD_NOT_BE_IN_BACKLOG/);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_FINAL_RESPONSE_SHOULD_NOT_BE_IN_BACKLOG/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog does not keep a recovered selected skill failure open", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/skills/usage/session_recovered_old-skill.json", selectedSkillOutcome({
      id: "skill_usage_recovered_old",
      session_id: "session_recovered_old",
      skill_name: "recovered-skill",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_recovered_new-skill.json", selectedSkillOutcome({
      id: "skill_usage_recovered_new",
      session_id: "session_recovered_new",
      skill_name: "recovered-skill",
      verification_status: "passed",
      verified: true,
      verdict: "reused_skill",
      created_at: "2026-06-30T00:01:00.000Z"
    }));

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    assert.equal(backlog.items.some((item) =>
      item.kind === "selected_skill_outcome"
      && item.selected_skill_outcome?.skill_name === "recovered-skill"
    ), false);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog summarizes repeated selected skill drift without duplicating single outcomes", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/outcome-repeat-drift/SKILL.md", [
      "---",
      "name: outcome-repeat-drift",
      "description: Use when repeated selected skill failures should be summarized as drift.",
      "---",
      "",
      "RAW_REPEAT_DRIFT_SKILL_BODY_SHOULD_NOT_BE_IN_BACKLOG"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_repeat_b-context.md", "RAW_REPEAT_DRIFT_CONTEXT_SHOULD_NOT_BE_IN_BACKLOG");
    await fixture.store.writeText("memory/episodes/session_repeat_b-final-response.md", "RAW_REPEAT_DRIFT_FINAL_RESPONSE_SHOULD_NOT_BE_IN_BACKLOG");
    await fixture.store.writeJson("memory/skills/usage/session_repeat_a-outcome-repeat-drift.json", selectedSkillOutcome({
      id: "skill_usage_repeat_a",
      session_id: "session_repeat_a",
      skill_name: "outcome-repeat-drift",
      instructions_ref: "vault/skills/outcome-repeat-drift/SKILL.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_repeat_a-completion-verification.json",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_repeat_b-outcome-repeat-drift.json", selectedSkillOutcome({
      id: "skill_usage_repeat_b",
      session_id: "session_repeat_b",
      skill_name: "outcome-repeat-drift",
      instructions_ref: "vault/skills/outcome-repeat-drift/SKILL.md",
      context_ref: "memory/episodes/session_repeat_b-context.md",
      final_response_ref: "memory/episodes/session_repeat_b-final-response.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_repeat_b-completion-verification.json",
      registry_update: {
        ok: true,
        use_count: 4,
        last_used_at: "2026-06-30T00:02:00.000Z"
      },
      created_at: "2026-06-30T00:02:00.000Z"
    }));

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const drift = backlog.items.find((item) => item.kind === "selected_skill_drift");

    assert.equal(drift?.id, "selected_skill_drift_outcome-repeat-drift");
    assert.equal(drift?.status, "drifted");
    assert.equal(drift?.action_kind, "review_skill_drift");
    assert.equal(drift?.ref, "memory/skills/usage/session_repeat_b-outcome-repeat-drift.json");
    assert.equal(drift?.source_ref, "memory/episodes/session_repeat_b-completion-verification.json");
    assert.equal(drift?.selected_skill_drift?.skill_name, "outcome-repeat-drift");
    assert.equal(drift?.selected_skill_drift?.attention_count, 2);
    assert.equal(drift?.selected_skill_drift?.failed_count, 2);
    assert.equal(drift?.selected_skill_drift?.latest_attention_outcome_ref, "memory/skills/usage/session_repeat_b-outcome-repeat-drift.json");
    assert.equal(drift?.selected_skill_drift?.use_count, 4);
    assert.equal(backlog.items.some((item) => item.id === "skill_usage_repeat_a"), false);
    assert.equal(backlog.items.some((item) => item.id === "skill_usage_repeat_b"), false);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_REPEAT_DRIFT_SKILL_BODY_SHOULD_NOT_BE_IN_BACKLOG/);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_REPEAT_DRIFT_CONTEXT_SHOULD_NOT_BE_IN_BACKLOG/);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_REPEAT_DRIFT_FINAL_RESPONSE_SHOULD_NOT_BE_IN_BACKLOG/);
  } finally {
    await fixture.cleanup();
  }
});

test("selected skill drift closes after a newer verified outcome", async () => {
  const fixture = await createFixture();
  try {
    for (const [suffix, createdAt, passed] of [
      ["a", "2026-06-30T00:00:00.000Z", false],
      ["b", "2026-06-30T00:01:00.000Z", false],
      ["c", "2026-06-30T00:02:00.000Z", true]
    ] as const) {
      await fixture.store.writeJson(`memory/skills/usage/session_recovered_drift_${suffix}-skill.json`, selectedSkillOutcome({
        id: `skill_usage_recovered_drift_${suffix}`,
        session_id: `session_recovered_drift_${suffix}`,
        skill_name: "recovered-drift-skill",
        verification_status: passed ? "passed" : "failed",
        verified: passed,
        verdict: passed ? "reused_skill" : "completion_unverified",
        created_at: createdAt
      }));
    }

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    assert.equal(backlog.items.some((item) =>
      (item.kind === "selected_skill_drift" || item.kind === "selected_skill_outcome")
      && (item.selected_skill_drift?.skill_name === "recovered-drift-skill"
        || item.selected_skill_outcome?.skill_name === "recovered-drift-skill")
    ), false);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity decisions can defer, complete, and reopen derived selected skill drift items", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/skills/usage/session_decision_a-outcome-decision-drift.json", selectedSkillOutcome({
      id: "skill_usage_decision_a",
      session_id: "session_decision_a",
      skill_name: "outcome-decision-drift",
      instructions_ref: "vault/skills/outcome-decision-drift/SKILL.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_decision_a-completion-verification.json",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_decision_b-outcome-decision-drift.json", selectedSkillOutcome({
      id: "skill_usage_decision_b",
      session_id: "session_decision_b",
      skill_name: "outcome-decision-drift",
      instructions_ref: "vault/skills/outcome-decision-drift/SKILL.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_decision_b-completion-verification.json",
      created_at: "2026-06-30T00:02:00.000Z"
    }));

    const initial = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const initialDrift = initial.items.find((item) => item.id === "selected_skill_drift_outcome-decision-drift");
    if (!initialDrift) throw new Error("expected selected skill drift backlog item");

    const deferred = await decideOpportunity(fixture.store, {
      opportunity: initialDrift.id,
      status: "deferred",
      reason: "Operator wants to batch skill drift review later."
    });
    assert.equal(deferred.opportunity_id, "selected_skill_drift_outcome-decision-drift");
    assert.equal(deferred.opportunity_ref, "memory/skills/usage/session_decision_b-outcome-decision-drift.json");
    assert.equal(deferred.previous_status, "drifted");
    assert.equal(deferred.status, "deferred");
    assert.equal(deferred.decision.opportunity_kind, "selected_skill_drift");

    const afterDeferred = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const deferredDrift = afterDeferred.items.find((item) => item.id === initialDrift.id);
    assert.equal(deferredDrift?.status, "deferred");
    assert.match(deferredDrift?.summary ?? "", /batch skill drift review later/);
    assert.match(deferredDrift?.next_step ?? "", /governance decide-opportunity --opportunity selected_skill_drift_outcome-decision-drift --status open/);
    assert.equal((deferredDrift?.score ?? 0) < initialDrift.score, true);

    const completed = await decideOpportunity(fixture.store, {
      opportunity: initialDrift.ref,
      status: "completed",
      reason: "Operator reviewed and decided no skill update is needed."
    });
    assert.equal(completed.previous_status, "deferred");
    assert.equal(completed.decision.opportunity_kind, "selected_skill_drift");
    const afterCompleted = await getOpportunityBacklog(fixture.store, { limit: 20 });
    assert.equal(afterCompleted.items.some((item) => item.id === initialDrift.id), false);

    const reopened = await decideOpportunity(fixture.store, {
      opportunity: initialDrift.id,
      status: "open",
      reason: "Operator found new evidence and reopened the drift attention item."
    });
    assert.equal(reopened.previous_status, "completed");
    const afterReopen = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const reopenedDrift = afterReopen.items.find((item) => item.id === initialDrift.id);
    assert.equal(reopenedDrift?.status, "drifted");
    assert.equal(reopenedDrift?.kind, "selected_skill_drift");

    const rawDecisions = await fixture.store.readStateText("autonomy/opportunity-decisions.jsonl");
    assert.match(rawDecisions, /"opportunity_kind":"selected_skill_drift"/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces blocked and failed pipeline runs without raw stage output", async () => {
  const fixture = await createFixture();
  try {
    await writePipelineRun(fixture.store, {
      pipelineId: "pipeline_blocked_backlog",
      runId: "pipeline_run_blocked_backlog",
      status: "blocked",
      stageStatus: "blocked",
      blockedStageId: "verify",
      updatedAt: "2026-06-30T00:00:10.000Z",
      rawOutput: "RAW_BLOCKED_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR"
    });
    await writePipelineRun(fixture.store, {
      pipelineId: "pipeline_failed_backlog",
      runId: "pipeline_run_failed_backlog",
      status: "failed",
      stageStatus: "failed",
      blockedStageId: null,
      updatedAt: "2026-06-30T00:00:09.000Z",
      rawOutput: "RAW_FAILED_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR"
    });
    await writePipelineRun(fixture.store, {
      pipelineId: "pipeline_done_backlog",
      runId: "pipeline_run_done_backlog",
      status: "done",
      stageStatus: "done",
      blockedStageId: null,
      updatedAt: "2026-06-30T00:00:11.000Z",
      rawOutput: "RAW_DONE_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 20 });
    const pipelineItems = backlog.items.filter((item) => item.kind === "pipeline_run");
    const blocked = pipelineItems.find((item) => item.id === "pipeline_run_blocked_backlog");
    const failed = pipelineItems.find((item) => item.id === "pipeline_run_failed_backlog");

    assert.equal(pipelineItems.length, 2);
    assert.equal(blocked?.status, "blocked");
    assert.equal(blocked?.action_kind, "resume_pipeline");
    assert.equal(blocked?.ref, "pipelines/pipeline_blocked_backlog/checkpoint.json");
    assert.equal(blocked?.source_ref, "pipelines/pipeline_blocked_backlog/pipeline.json");
    assert.match(blocked?.summary ?? "", /blocked_stage=verify/);
    assert.match(blocked?.next_step ?? "", /pipeline runs --pipeline pipeline_run_blocked_backlog --state-root <state-root>/);
    assert.match(blocked?.next_step ?? "", /pipeline resume --pipeline pipeline_run_blocked_backlog --from-stage verify --state-root <state-root>/);
    assert.equal(blocked?.pipeline_run?.inspect_command, "pnpm run runtime -- pipeline runs --pipeline pipeline_run_blocked_backlog --state-root <state-root>");
    assert.equal(blocked?.pipeline_run?.resume_command, "pnpm run runtime -- pipeline resume --pipeline pipeline_run_blocked_backlog --from-stage verify --state-root <state-root>");
    assert.equal(blocked?.pipeline_run?.blocked_stage_id, "verify");
    assert.deepEqual(blocked?.pipeline_run?.failed_stage_ids, ["verify"]);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.action_kind, "repair_pipeline");
    assert.equal(failed?.pipeline_run?.resume_command, "pnpm run runtime -- pipeline resume --pipeline pipeline_run_failed_backlog --from-stage verify --state-root <state-root>");
    assert.equal(failed?.score_reasons.some((reason) => reason === "failed_stages=verify"), true);
    assert.equal(backlog.items.some((item) => item.id === "pipeline_run_done_backlog"), false);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_.*PIPELINE_OUTPUT_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces context pressure without raw context markdown", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/episodes/session_pressure-context.json", contextPressureManifest());
    await fixture.store.writeText("memory/episodes/session_pressure-context.md", "RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR");

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 5 });
    const item = backlog.items.find((entry) => entry.kind === "context_pressure");

    assert.ok(item);
    assert.equal(item.id, "context_pressure_session_pressure");
    assert.equal(item.context_pressure?.status, "over_budget");
    assert.equal(item.context_pressure?.largest_section_title, "Episode Recall");
    assert.match(item.next_step, /context show/);
    assert.equal(
      item.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity context_pressure_session_pressure --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR/);

    const decision = await decideOpportunity(fixture.store, {
      opportunity: item.id,
      status: "deferred",
      reason: "Context pressure is known and will be handled after the current slice."
    });
    assert.equal(decision.decision.opportunity_kind, "context_pressure");

    const afterDecision = await getOpportunityBacklog(fixture.store, { limit: 5 });
    const decided = afterDecision.items.find((entry) => entry.id === item.id);
    assert.equal(decided?.status, "deferred");
    assert.equal(
      decided?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity context_pressure_session_pressure --status open --reason \"...\" --state-root <state-root>"
    );
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces context health issues without raw context markdown", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/episodes/session_health_missing-context.json", contextHealthManifest());
    await fixture.store.writeText("memory/episodes/session_health_orphan-context.md", "RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR");

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.kind === "context_health" && entry.context_health?.issue_kind === "missing_context_markdown");
    const orphanItem = backlog.items.find((entry) => entry.kind === "context_health" && entry.context_health?.issue_kind === "orphan_context_markdown");

    assert.ok(item);
    assert.ok(orphanItem);
    assert.equal(item.id, "context_health_missing_context_session_health_missing");
    assert.equal(item.status, "error");
    assert.equal(item.action_kind, "repair_context_health");
    assert.equal(item.context_health?.manifest_ref, "memory/episodes/session_health_missing-context.json");
    assert.equal(item.context_health?.context_ref, "memory/episodes/session_health_missing-context.md");
    assert.match(item.next_step, /missing context Markdown/);
    assert.match(item.context_health?.inspect_command ?? "", /context health --context memory\/episodes\/session_health_missing-context\.json/);
    assert.equal(item.context_health?.operator_guidance.resolution_kind, "restore_or_retire_context_markdown");
    assert.match(item.context_health?.operator_guidance.complete_after_external_repair_command ?? "", /--status completed/);
    assert.match(item.context_health?.operator_guidance.retire_historical_issue_command ?? "", /--status retired/);
    assert.equal(
      item.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity context_health_missing_context_session_health_missing --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.equal(orphanItem.context_health?.operator_guidance.resolution_kind, "restore_or_retire_manifest_sidecar");
    assert.equal(
      orphanItem.context_health?.operator_guidance.repair_manifest_command,
      "pnpm run runtime -- context repair --context memory/episodes/session_health_orphan-context.md --state-root <state-root>"
    );
    assert.deepEqual(orphanItem.action_chain?.map((step) => `${step.label}:${step.effect}`), [
      "inspect:read_only",
      "repair_context_manifest:local_write",
      "complete_after_repair:state_decision",
      "retire_historical:state_decision",
      "record_decision:state_decision"
    ]);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR/);

    const decision = await decideOpportunity(fixture.store, {
      opportunity: item.id,
      status: "deferred",
      reason: "Operator will repair context manifest sidecars after finishing this code slice."
    });
    assert.equal(decision.decision.opportunity_kind, "context_health");

    const afterDecision = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const decided = afterDecision.items.find((entry) => entry.id === item.id);
    assert.equal(decided?.status, "deferred");
    assert.equal(decided?.opportunity_decision?.status, "deferred");
    assert.equal(decided?.opportunity_decision?.reason, "Operator will repair context manifest sidecars after finishing this code slice.");
    assert.equal(decided?.opportunity_decision?.ref, "autonomy/opportunity-decisions.jsonl#1");
    assert.equal(
      decided?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity context_health_missing_context_session_health_missing --status open --reason \"...\" --state-root <state-root>"
    );
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces archive health issues without raw episode artifacts", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("memory/episodes/archive-health-raw.md", "RAW_ARCHIVE_HEALTH_SHOULD_NOT_APPEAR");
    await fixture.store.writeText("memory/episodes/events.jsonl", `${JSON.stringify({
      id: "event_archive_health_backlog",
      session_id: "session_archive_health_backlog",
      turn_id: "turn_archive_health_backlog",
      kind: "report",
      summary: "Archive health backlog should detect a missing daily archive.",
      artifact_refs: ["memory/episodes/archive-health-raw.md"],
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.kind === "archive_health");

    assert.ok(item);
    assert.equal(item.id, "archive_health_missing_2026_06_30");
    assert.equal(item.status, "error");
    assert.equal(item.action_kind, "refresh_episode_archives");
    assert.equal(item.archive_health?.issue_kind, "missing_archive");
    assert.equal(item.archive_health?.archive_ref, "memory/archives/2026-06-30.json");
    assert.equal(item.archive_health?.source_event_count, 1);
    assert.equal(item.archive_health?.archive_event_count, null);
    assert.match(item.archive_health?.inspect_command ?? "", /memory archive-health --archive 2026-06-30/);
    assert.match(item.archive_health?.refresh_command ?? "", /memory archive --state-root/);
    assert.match(item.next_step, /refresh archives explicitly/);
    assert.equal(
      item.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity archive_health_missing_2026_06_30 --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_ARCHIVE_HEALTH_SHOULD_NOT_APPEAR/);

    const decision = await decideOpportunity(fixture.store, {
      opportunity: item.id,
      status: "deferred",
      reason: "Operator will refresh episode archives after finishing this code slice."
    });
    assert.equal(decision.decision.opportunity_kind, "archive_health");
    assert.equal(decision.previous_status, "error");

    const afterDecision = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const decided = afterDecision.items.find((entry) => entry.id === item.id);
    assert.equal(decided?.status, "deferred");
    assert.equal(decided?.opportunity_decision?.status, "deferred");
    assert.equal(decided?.opportunity_decision?.reason, "Operator will refresh episode archives after finishing this code slice.");
    assert.equal(
      decided?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity archive_health_missing_2026_06_30 --status open --reason \"...\" --state-root <state-root>"
    );
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog downgrades archive narrow review after archive health is current", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("memory/episodes/archive-health-current-raw.md", "RAW_ARCHIVE_HEALTH_CURRENT_SHOULD_NOT_APPEAR");
    await fixture.store.writeText("memory/episodes/events.jsonl", `${JSON.stringify({
      id: "event_archive_health_current",
      session_id: "session_archive_health_current",
      turn_id: "turn_archive_health_current",
      kind: "report",
      summary: "Archive health has already been refreshed.",
      artifact_refs: ["memory/episodes/archive-health-current-raw.md"],
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);
    await fixture.store.writeJson("memory/archives/2026-06-30.json", {
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
    await fixture.store.writeJson("autonomy/inbox/review_inbox_archive_narrow.json", {
      id: "review_inbox_archive_narrow",
      source: "review_tick",
      status: "open",
      action_kind: "narrow_review",
      title: "Rerun background review with a narrower scope",
      rationale: "The current review scope is too broad for a mutation decision.",
      latest_review_ref: "autonomy/reviews/background_review_archive_narrow.json",
      proposal_id: "review_proposal_archive_narrow",
      proposal_type: "runtime_gap",
      proposal_title: "Review episode archive health: archive_health_missing_2026_06_30",
      command: "pnpm run runtime -- review background --query 'Review episode archive health: archive_health_missing_2026_06_30'",
      required_refs: ["memory/archives/2026-06-30.json", "memory/episodes/events.jsonl"],
      would_write: ["state"],
      created_at: "2026-06-30T00:00:01.000Z",
      updated_at: "2026-06-30T00:00:01.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.id === "review_inbox_archive_narrow");

    assert.equal(backlog.items.some((entry) => entry.kind === "archive_health"), false);
    assert.equal(item?.score, 35);
    assert.match(item?.next_step ?? "", /review decide-inbox --item review_inbox_archive_narrow --status completed/);
    assert.equal(item?.score_reasons.includes("narrow_review_archive_health=covered"), true);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_ARCHIVE_HEALTH_CURRENT_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces skill registry health issues without raw skill bodies", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/backlog-health/SKILL.md", [
      "---",
      "name: backlog-health",
      "description: Current backlog registry health fixture.",
      "---",
      "",
      "RAW_BACKLOG_HEALTH_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await fixture.store.writeRepoText("vault/registry/skills.jsonl", `${JSON.stringify(skillRegistryEntry({
      name: "backlog-health",
      description: "Stale backlog registry health fixture.",
      instructions_ref: "vault/skills/backlog-health/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#backlog-health",
      content_hash: "stale-hash"
    }))}\n`);

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.kind === "skill_registry_health");

    assert.ok(item);
    assert.equal(item.id, "skill_registry_health_metadata_drift_backlog_health");
    assert.equal(item.status, "warning");
    assert.equal(item.action_kind, "inspect_skill_registry_health");
    assert.equal(item.skill_registry_health?.issue_kind, "registry_metadata_drift");
    assert.equal(item.skill_registry_health?.skill_name, "backlog-health");
    assert.equal(item.skill_registry_health?.instructions_ref, "vault/skills/backlog-health/SKILL.md");
    assert.match(item.skill_registry_health?.inspect_command ?? "", /skills health --skill-name backlog-health/);
    assert.match(item.skill_registry_health?.sync_command ?? "", /skills --action sync/);
    assert.match(item.next_step, /registry sync/);
    assert.equal(
      item.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity skill_registry_health_metadata_drift_backlog_health --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_BACKLOG_HEALTH_SKILL_BODY_SHOULD_NOT_APPEAR/);

    const decision = await decideOpportunity(fixture.store, {
      opportunity: item.id,
      status: "deferred",
      reason: "Operator will inspect skill registry drift after this slice."
    });
    assert.equal(decision.decision.opportunity_kind, "skill_registry_health");
    assert.equal(decision.previous_status, "warning");

    const afterDecision = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const decided = afterDecision.items.find((entry) => entry.id === item.id);
    assert.equal(decided?.status, "deferred");
    assert.equal(decided?.opportunity_decision?.status, "deferred");
    assert.equal(
      decided?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity skill_registry_health_metadata_drift_backlog_health --status open --reason \"...\" --state-root <state-root>"
    );
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog action chain can retire historical orphan skill events", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/registry/skill-events.jsonl", `${JSON.stringify({
      id: "skill_event_backlog_orphan",
      kind: "validated",
      skill_name: "backlog-orphan-event",
      instructions_ref: "vault/skills/backlog-orphan-event/SKILL.md",
      source_sop_ref: null,
      audit_ref: null,
      evidence_refs: [],
      artifact_refs: [],
      summary: "Historical orphan skill event.",
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) =>
      entry.kind === "skill_registry_health"
      && entry.skill_registry_health?.issue_kind === "orphan_skill_event"
    );

    assert.ok(item);
    assert.equal(item.id, "skill_registry_health_orphan_event_skill_event_backlog_orphan");
    assert.equal(item.skill_registry_health?.event_ref, "vault/registry/skill-events.jsonl#skill_event_backlog_orphan");
    assert.match(item.skill_registry_health?.retire_event_command ?? "", /skills retire-event --event 'vault\/registry\/skill-events\.jsonl#skill_event_backlog_orphan'/);
    assert.deepEqual(item.action_chain?.map((step) => `${step.label}:${step.effect}`), [
      "inspect:read_only",
      "retire_skill_event:local_write",
      "record_decision:state_decision"
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces attention-worthy working checkpoints without raw evidence artifacts", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/working/current.json", {
      goal: "Continue the bounded local goal loop.",
      current_step: "blocked_follow_up",
      known_constraints: ["Do not read raw evidence artifacts from the backlog."],
      recent_evidence_refs: ["memory/episodes/raw-working-backlog.md"],
      open_questions: ["Which follow-up closes the loop?"],
      next_action: "Resume after the operator chooses the next bounded step.",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("memory/working/save_point.json", {
      goal: "Keep a quiet save point out of the backlog.",
      current_step: "recorded checkpoint",
      known_constraints: [],
      recent_evidence_refs: [],
      open_questions: [],
      next_action: "Continue normal implementation.",
      created_at: "2026-06-29T00:00:00.000Z"
    });
    await fixture.store.writeText("memory/episodes/raw-working-backlog.md", "RAW_WORKING_BACKLOG_SHOULD_NOT_APPEAR");
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_working_backlog",
      session_id: "session_working_backlog",
      turn_id: "turn_working_backlog",
      kind: "report",
      summary: "Recorded model working checkpoint: blocked_follow_up.",
      artifact_refs: [
        "memory/working/current.json",
        "memory/episodes/raw-working-backlog.md"
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.kind === "working_checkpoint");

    assert.ok(item);
    assert.equal(item.id, "working_checkpoint_current");
    assert.equal(item.status, "open");
    assert.equal(item.ref, "memory/working/current.json");
    assert.equal(item.action_kind, "review_working_checkpoint");
    assert.equal(item.working_checkpoint?.checkpoint_ref, "memory/working/current.json");
    assert.equal(item.working_checkpoint?.current_step, "blocked_follow_up");
    assert.equal(item.working_checkpoint?.open_question_count, 1);
    assert.deepEqual(item.working_checkpoint?.open_questions, ["Which follow-up closes the loop?"]);
    assert.deepEqual(item.working_checkpoint?.evidence_event_refs, [
      "memory/episodes/events.jsonl#evidence_working_backlog"
    ]);
    assert.match(item.working_checkpoint?.inspect_command ?? "", /memory working --checkpoint memory\/working\/current\.json/);
    assert.match(item.next_step, /Do not read raw evidence artifacts/);
    assert.equal(
      item.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity working_checkpoint_current --status deferred --reason \"...\" --state-root <state-root>"
    );
    assert.equal(backlog.items.some((entry) => entry.id === "working_checkpoint_save_point"), false);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_WORKING_BACKLOG_SHOULD_NOT_APPEAR/);

    const decision = await decideOpportunity(fixture.store, {
      opportunity: item.id,
      status: "deferred",
      reason: "Working checkpoint needs operator ordering before the next slice."
    });
    assert.equal(decision.decision.opportunity_kind, "working_checkpoint");

    const afterDecision = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const decided = afterDecision.items.find((entry) => entry.id === item.id);
    assert.equal(decided?.status, "deferred");
    assert.equal(
      decided?.decision_command,
      "pnpm run runtime -- governance decide-opportunity --opportunity working_checkpoint_current --status open --reason \"...\" --state-root <state-root>"
    );
    assert.equal((decided?.score ?? 0) < item.score, true);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog filters working checkpoint attention before applying the item limit", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("memory/working/current.json", {
      goal: "Keep the current save point quiet.",
      current_step: "save_point",
      known_constraints: [],
      recent_evidence_refs: [],
      open_questions: [],
      next_action: "Continue normal implementation.",
      created_at: "2026-06-30T00:10:00.000Z"
    });
    for (let index = 0; index < 6; index += 1) {
      await fixture.store.writeJson(`memory/working/quiet_${index}.json`, {
        goal: `Quiet checkpoint ${index}.`,
        current_step: "recorded checkpoint",
        known_constraints: [],
        recent_evidence_refs: [],
        open_questions: [],
        next_action: "Continue normal implementation.",
        created_at: `2026-06-30T00:0${index}:00.000Z`
      });
    }
    await fixture.store.writeJson("memory/working/blocked_old.json", {
      goal: "Resume a blocked older checkpoint.",
      current_step: "blocked_old_follow_up",
      known_constraints: [],
      recent_evidence_refs: [],
      open_questions: [],
      next_action: "Resume the bounded older follow-up after inspection.",
      created_at: "2026-06-29T00:00:00.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });

    assert.equal(backlog.items.some((entry) => entry.id === "working_checkpoint_blocked_old"), true);
    assert.equal(backlog.items.some((entry) => entry.id === "working_checkpoint_current"), false);
    assert.equal(backlog.items.some((entry) => entry.id === "working_checkpoint_quiet_0"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog includes open SOP evolution chains without raw SOP bodies", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("sop/drafts/sop_backlog_draft.json", sopDraft({
      id: "sop_backlog_draft",
      title: "Audit repeatable operator backlog SOP",
      status: "draft",
      procedure: ["RAW_SOP_BODY_SHOULD_NOT_BE_RETURNED"]
    }));
    await fixture.store.writeJson("sop/drafts/sop_backlog_audited.json", sopDraft({
      id: "sop_backlog_audited",
      title: "Promote audited backlog SOP",
      status: "audited"
    }));
    await fixture.store.writeJson("governance/audits/audit_backlog_promote.json", {
      id: "audit_backlog_promote",
      target_type: "sop",
      target_ref: "sop_backlog_audited",
      verdict: "promote",
      reason: "The SOP is ready for explicit promotion review.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("sop/drafts/sop_backlog_revision.json", sopDraft({
      id: "sop_backlog_revision",
      title: "Revise backlog SOP before promotion",
      status: "draft"
    }));
    await fixture.store.writeJson("governance/audits/audit_backlog_revision.json", {
      id: "audit_backlog_revision",
      target_type: "sop",
      target_ref: "sop_backlog_revision",
      verdict: "revise",
      reason: "The SOP needs a narrower trigger before promotion.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const sopItems = backlog.items.filter((item) => item.kind === "sop_evolution_chain");
    const draft = sopItems.find((item) => item.id === "sop_backlog_draft");
    const audited = sopItems.find((item) => item.id === "sop_backlog_audited");

    assert.equal(sopItems.length, 3);
    assert.equal(sopItems.some((item) => item.id === "sop_backlog_draft" && item.action_kind === "audit_sop"), true);
    assert.equal(sopItems.some((item) => item.id === "sop_backlog_audited" && item.action_kind === "promote_sop"), true);
    assert.equal(sopItems.some((item) => item.id === "sop_backlog_revision" && item.action_kind === "inspect_chain"), true);
    assert.equal(draft?.next_command?.action_kind, "audit_sop");
    assert.match(draft?.next_command?.command ?? "", /review audit-sop --sop sop_backlog_draft/);
    assert.deepEqual(draft?.next_command?.would_write, ["state"]);
    assert.equal(audited?.next_command?.action_kind, "promote_sop");
    assert.match(audited?.next_command?.command ?? "", /review promote-sop --sop sop_backlog_audited --audit audit_backlog_promote/);
    assert.deepEqual(audited?.next_command?.would_write, ["state", "active_vault"]);
    assert.equal(sopItems.every((item) => item.budget_hint.side_effect_level === "none"), true);
    assert.match(JSON.stringify(sopItems), /review audit-sop/);
    assert.match(JSON.stringify(sopItems), /review promote-sop/);
    assert.match(JSON.stringify(sopItems), /revise or retire the SOP draft/);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_SOP_BODY_SHOULD_NOT_BE_RETURNED/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog does not duplicate SOP chains with pending follow-up confirmations", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("sop/drafts/sop_backlog_pending.json", sopDraft({
      id: "sop_backlog_pending",
      title: "Pending promotion already has a confirmation",
      status: "audited"
    }));
    await fixture.store.writeJson("governance/audits/audit_backlog_pending.json", {
      id: "audit_backlog_pending",
      target_type: "sop",
      target_ref: "sop_backlog_pending",
      verdict: "promote",
      reason: "The SOP is ready, but a confirmation already exists.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_pending_sop.json", {
      id: "follow_up_confirmation_pending_sop",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_pending.json",
      proposal_id: "review_proposal_pending",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        title: "Promote pending SOP",
        rationale: "Confirmation already exists for this SOP.",
        required_refs: ["sop/drafts/sop_backlog_pending.json", "governance/audits/audit_backlog_pending.json"]
      },
      required_refs: ["sop/drafts/sop_backlog_pending.json", "governance/audits/audit_backlog_pending.json"],
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });

    assert.equal(backlog.items.some((item) => item.kind === "review_confirmation" && item.id === "follow_up_confirmation_pending_sop"), true);
    assert.equal(backlog.items.some((item) => item.kind === "sop_evolution_chain" && item.id === "sop_backlog_pending"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog points revise_skill confirmations at coverage inspection first", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("sop/drafts/sop_reuse.json", {
      id: "sop_reuse",
      title: "Validate reused skill coverage",
      trigger: "Use when confirming duplicate skill still covers the SOP before changing metadata.",
      procedure: [
        "Open the reused skill coverage report.",
        "Compare the recorded duplicate skill ref with current recall.",
        "Keep reuse when coverage remains covered."
      ],
      required_tools: ["review.coverage"],
      verification: "Confirm the duplicate skill still covers the SOP before changing metadata.",
      failure_modes: ["Do not revise the skill when the recorded duplicate skill is missing."],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "audited",
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeRepoText("vault/skills/reuse-existing-skill/SKILL.md", [
      "---",
      "name: reuse-existing-skill",
      "description: Validate reused skill coverage and confirm the duplicate skill still covers the SOP before changing metadata.",
      "---",
      "",
      "RAW_SKILL_BODY_SHOULD_NOT_BE_IN_BACKLOG"
    ].join("\n"));
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_reuse_existing_skill",
      session_id: "sop_reuse",
      turn_id: "audit_reuse_existing_skill",
      kind: "report",
      summary: "Skipped explicit SOP promotion because recalled skill already covers this SOP: reuse-existing-skill.",
      artifact_refs: [
        "sop/drafts/sop_reuse.json",
        "vault/skills/reuse-existing-skill/SKILL.md"
      ],
      created_at: "2026-06-30T00:00:00.500Z"
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_revise_skill.json", {
      id: "follow_up_confirmation_revise_skill",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_reuse.json",
      proposal_id: "review_proposal_reuse",
      proposal_type: "skill_revision",
      action_id: "follow_up_action_revise_skill_reuse",
      action_kind: "revise_skill",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_revise_skill_reuse",
        kind: "revise_skill",
        title: "Validate reused skill coverage",
        rationale: "Confirm the duplicate skill still covers the SOP before changing metadata.",
        required_refs: [
          "sop/drafts/sop_reuse.json",
          "vault/skills/reuse-existing-skill/SKILL.md"
        ],
        would_write: ["active_vault"]
      },
      required_refs: [
        "sop/drafts/sop_reuse.json",
        "vault/skills/reuse-existing-skill/SKILL.md"
      ],
      would_write: ["active_vault"],
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_revise_skill.json", {
      id: "review_inbox_revise_skill",
      source: "review_tick",
      status: "open",
      action_kind: "revise_skill",
      title: "Validate reused skill coverage",
      rationale: "Confirm the duplicate skill still covers the SOP before changing metadata.",
      latest_review_ref: "autonomy/reviews/background_review_reuse.json",
      required_refs: [
        "sop/drafts/sop_reuse.json",
        "vault/skills/reuse-existing-skill/SKILL.md"
      ],
      would_write: ["active_vault"],
      created_at: "2026-06-30T00:00:01.000Z",
      updated_at: "2026-06-30T00:00:01.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 5 });
    const item = backlog.items.find((candidate) => candidate.id === "follow_up_confirmation_revise_skill");
    const inboxItem = backlog.items.find((candidate) => candidate.id === "review_inbox_revise_skill");

    assert.equal(item?.kind, "review_confirmation");
    assert.equal(item?.action_kind, "revise_skill");
    assert.match(item?.next_step ?? "", /review coverage --sop sop_reuse/);
    assert.match(item?.next_step ?? "", /review execute-confirmed-follow-up --confirmation autonomy\/followups\/follow_up_confirmation_revise_skill\.json/);
    assert.equal(item?.budget_hint.side_effect_level, "local_write");
    assert.equal(item?.reused_skill_coverage?.status, "covered");
    assert.equal(item?.reused_skill_coverage?.sop_id, "sop_reuse");
    assert.equal(item?.reused_skill_coverage?.current_duplicate_skill_ref, "vault/skills/reuse-existing-skill/SKILL.md");
    assert.deepEqual(item?.reused_skill_coverage?.recorded_duplicate_skill_refs, [
      "vault/skills/reuse-existing-skill/SKILL.md"
    ]);
    assert.equal(item?.score_reasons.includes("reused_skill_coverage=covered"), true);
    assert.equal(inboxItem?.kind, "review_inbox");
    assert.equal(inboxItem?.action_kind, "revise_skill");
    assert.match(inboxItem?.next_step ?? "", /review decide-inbox --item review_inbox_revise_skill --status completed/);
    assert.doesNotMatch(inboxItem?.next_step ?? "", /review request-inbox-confirmation --item review_inbox_revise_skill/);
    assert.equal(inboxItem?.reused_skill_coverage?.status, "covered");
    assert.equal(inboxItem?.reused_skill_coverage?.current_duplicate_skill_ref, "vault/skills/reuse-existing-skill/SKILL.md");
    assert.equal(inboxItem?.score, 35);
    assert.equal(inboxItem?.score_reasons.includes("reused_skill_coverage=covered"), true);
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_SKILL_BODY_SHOULD_NOT_BE_IN_BACKLOG/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces draft_sop readiness from background review evidence", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText("autonomy/reviews/background_review_draft.md", "RAW_REVIEW_MARKDOWN_SHOULD_NOT_BE_IN_BACKLOG");
    await fixture.store.writeJson("autonomy/reviews/background_review_draft.json", backgroundReview({
      id: "background_review_draft",
      stats: {
        events_reviewed: 3,
        sessions_seen: 2,
        kinds: { report: 3 },
        failure_signal_count: 1,
        sop_signal_count: 2
      },
      proposals: [{
        id: "review_proposal_draft",
        type: "sop_candidate",
        title: "Draft an SOP for recurring runtime failures",
        rationale: "Repeated failure evidence is ready for a state-only SOP draft.",
        evidence_refs: [
          "memory/episodes/events.jsonl#evidence_runtime_failure",
          "sop/drafts/sop_related.json",
          "vault/skills/related-runtime-skill/SKILL.md"
        ],
        next_action: "Inspect evidence before requesting confirmation."
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_draft.json",
        markdown_ref: "autonomy/reviews/background_review_draft.md"
      }
    }));
    await fixture.store.writeJson("autonomy/inbox/review_inbox_draft_sop.json", {
      id: "review_inbox_draft_sop",
      source: "review_tick",
      status: "open",
      action_kind: "draft_sop",
      title: "Draft a state-only SOP from this proposal",
      rationale: "No existing actionable SOP chain was found for this proposal.",
      latest_review_ref: "autonomy/reviews/background_review_draft.json",
      proposal_id: "review_proposal_draft",
      required_refs: [
        "autonomy/reviews/background_review_draft.json",
        "memory/episodes/events.jsonl#evidence_runtime_failure",
        "sop/drafts/sop_related.json",
        "vault/skills/related-runtime-skill/SKILL.md"
      ],
      would_write: ["state"],
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_draft_sop.json", {
      id: "follow_up_confirmation_draft_sop",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_draft.json",
      proposal_id: "review_proposal_draft",
      proposal_type: "sop_candidate",
      action_id: "follow_up_action_draft_sop",
      action_kind: "draft_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_draft_sop",
        kind: "draft_sop",
        title: "Draft a state-only SOP from this proposal",
        rationale: "No existing actionable SOP chain was found for this proposal.",
        required_refs: [
          "autonomy/reviews/background_review_draft.json",
          "memory/episodes/events.jsonl#evidence_runtime_failure",
          "sop/drafts/sop_related.json",
          "vault/skills/related-runtime-skill/SKILL.md"
        ],
        would_write: ["state"]
      },
      required_refs: [
        "autonomy/reviews/background_review_draft.json",
        "memory/episodes/events.jsonl#evidence_runtime_failure",
        "sop/drafts/sop_related.json",
        "vault/skills/related-runtime-skill/SKILL.md"
      ],
      would_write: ["state"],
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const inboxItem = backlog.items.find((candidate) => candidate.id === "review_inbox_draft_sop");
    const confirmationItem = backlog.items.find((candidate) => candidate.id === "follow_up_confirmation_draft_sop");

    for (const item of [inboxItem, confirmationItem]) {
      assert.equal(item?.draft_sop_readiness?.status, "ready");
      assert.equal(item?.draft_sop_readiness?.review_ref, "autonomy/reviews/background_review_draft.json");
      assert.equal(item?.draft_sop_readiness?.proposal_id, "review_proposal_draft");
      assert.equal(item?.draft_sop_readiness?.failure_signal_count, 1);
      assert.equal(item?.draft_sop_readiness?.sop_signal_count, 2);
      assert.equal(item?.draft_sop_readiness?.evidence_ref_count, 3);
      assert.equal(item?.draft_sop_readiness?.required_ref_count, 4);
      assert.deepEqual(item?.draft_sop_readiness?.existing_sop_refs, ["sop/drafts/sop_related.json"]);
      assert.deepEqual(item?.draft_sop_readiness?.existing_skill_refs, ["vault/skills/related-runtime-skill/SKILL.md"]);
      assert.equal(item?.score_reasons.includes("draft_sop_readiness=ready"), true);
    }
    assert.doesNotMatch(JSON.stringify(backlog), /RAW_REVIEW_MARKDOWN_SHOULD_NOT_BE_IN_BACKLOG/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog marks draft_sop readiness covered by same-title SOP chains", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("autonomy/reviews/background_review_covered_draft.json", backgroundReview({
      id: "background_review_covered_draft",
      stats: {
        events_reviewed: 3,
        sessions_seen: 2,
        kinds: { report: 3 },
        failure_signal_count: 1,
        sop_signal_count: 2
      },
      proposals: [{
        id: "review_proposal_covered_draft",
        type: "sop_candidate",
        title: "Draft an SOP for recurring blocked or failed runtime paths",
        rationale: "Repeated failure evidence is ready for a state-only SOP draft.",
        evidence_refs: ["memory/episodes/events.jsonl#evidence_runtime_failure"],
        next_action: "Inspect evidence before requesting confirmation."
      }],
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
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_covered_draft.json",
        markdown_ref: "autonomy/reviews/background_review_covered_draft.md"
      }
    }));
    await fixture.store.writeJson("autonomy/inbox/review_inbox_covered_draft.json", {
      id: "review_inbox_covered_draft",
      source: "review_tick",
      status: "open",
      action_kind: "draft_sop",
      title: "Draft a state-only SOP from this proposal",
      rationale: "No existing actionable SOP chain was found for this proposal.",
      latest_review_ref: "autonomy/reviews/background_review_covered_draft.json",
      proposal_id: "review_proposal_covered_draft",
      required_refs: [
        "autonomy/reviews/background_review_covered_draft.json",
        "memory/episodes/events.jsonl#evidence_runtime_failure"
      ],
      would_write: ["state"],
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((candidate) => candidate.id === "review_inbox_covered_draft");

    assert.equal(item?.draft_sop_readiness?.status, "covered_by_existing_sop");
    assert.deepEqual(item?.draft_sop_readiness?.existing_sop_refs, ["sop/drafts/sop_existing_runtime_failures.json"]);
    assert.deepEqual(item?.draft_sop_readiness?.existing_skill_refs, ["vault/skills/verify-runtime-failures/SKILL.md"]);
    assert.match(item?.draft_sop_readiness?.next_step ?? "", /existing SOP chain/);
    assert.equal(item?.score, 35);
    assert.equal(item?.score_reasons.includes("draft_sop_readiness=covered_by_existing_sop"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces stale SOP evolution confirmation gates", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_stale_sop.json", {
      id: "follow_up_confirmation_stale_sop",
      status: "pending",
      source: "sop_evolution_chain",
      review_ref: "governance/evolution",
      proposal_id: "sop_backlog_stale",
      proposal_type: "sop_candidate",
      sop_id: "sop_backlog_stale",
      sop_ref: "sop/drafts/sop_backlog_stale.json",
      action_id: "follow_up_action_audit_sop_stale",
      action_kind: "audit_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_audit_sop_stale",
        kind: "audit_sop",
        title: "Audit stale SOP confirmation",
        rationale: "This confirmation points at a chain that no longer exists.",
        required_refs: ["sop/drafts/sop_backlog_stale.json"],
        would_write: ["state"]
      },
      required_refs: ["sop/drafts/sop_backlog_stale.json"],
      would_write: ["state"],
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((candidate) => candidate.id === "follow_up_confirmation_stale_sop");

    assert.equal(item?.kind, "review_confirmation");
    assert.equal(item?.sop_evolution_gate?.status, "stale");
    assert.equal(item?.sop_evolution_gate?.reason_code, "chain_not_found");
    assert.match(item?.sop_evolution_gate?.reason ?? "", /SOP evolution chain not found/);
    assert.equal(item?.score_reasons.some((reason) => reason === "gate_reason_code=chain_not_found"), true);
    assert.match(item?.summary ?? "", /stale/);
    assert.match(item?.next_step ?? "", /review request-sop-confirmation --sop sop_backlog_stale/);
    assert.equal(item?.budget_hint.side_effect_level, "none");
    assert.equal(backlog.items.some((candidate) => candidate.kind === "sop_evolution_chain" && candidate.id === "sop_backlog_stale"), false);

    await fixture.store.appendJsonl("autonomy/sop-recovery-decisions.jsonl", {
      id: "sop_recovery_decision_backlog_deferred",
      confirmation_id: "follow_up_confirmation_stale_sop",
      confirmation_ref: "autonomy/followups/follow_up_confirmation_stale_sop.json",
      sop_id: "sop_backlog_stale",
      sop_ref: "sop/drafts/sop_backlog_stale.json",
      status: "deferred",
      previous_status: "none",
      gate_reason_code: "chain_not_found",
      gate_reason: "SOP evolution chain not found.",
      reason: "Wait for the operator to inspect whether this stale gate is historical.",
      created_at: "2026-06-30T00:00:02.000Z"
    });
    const deferredBacklog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const deferredItem = deferredBacklog.items.find((candidate) => candidate.id === "follow_up_confirmation_stale_sop");
    assert.equal(deferredItem?.sop_recovery_decision?.status, "deferred");
    assert.equal(deferredItem?.sop_recovery_decision?.ref, "autonomy/sop-recovery-decisions.jsonl#1");
    assert.match(deferredItem?.summary ?? "", /Latest recovery decision: deferred/);
    assert.match(deferredItem?.next_step ?? "", /review decide-sop-recovery --confirmation autonomy\/followups\/follow_up_confirmation_stale_sop\.json --status open/);
    assert.equal(deferredItem?.score_reasons.some((reason) => reason === "recovery_decision=deferred"), true);
    assert.equal(deferredItem?.score_reasons.some((reason) => reason === "recovery_decision_ref=autonomy/sop-recovery-decisions.jsonl#1"), true);
    assert.equal((deferredItem?.score ?? 100) < (item?.score ?? 0), true);

    await fixture.store.appendJsonl("autonomy/sop-recovery-decisions.jsonl", {
      id: "sop_recovery_decision_backlog_historical",
      confirmation_id: "follow_up_confirmation_stale_sop",
      confirmation_ref: "autonomy/followups/follow_up_confirmation_stale_sop.json",
      sop_id: "sop_backlog_stale",
      sop_ref: "sop/drafts/sop_backlog_stale.json",
      status: "historical",
      previous_status: "deferred",
      gate_reason_code: "chain_not_found",
      gate_reason: "SOP evolution chain not found.",
      reason: "This stale gate is historical evidence only.",
      created_at: "2026-06-30T00:00:03.000Z"
    });
    const historicalBacklog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    assert.equal(historicalBacklog.items.some((candidate) => candidate.id === "follow_up_confirmation_stale_sop"), false);

    await fixture.store.appendJsonl("autonomy/sop-recovery-decisions.jsonl", {
      id: "sop_recovery_decision_backlog_fresh",
      confirmation_id: "follow_up_confirmation_stale_sop",
      confirmation_ref: "autonomy/followups/follow_up_confirmation_stale_sop.json",
      sop_id: "sop_backlog_stale",
      sop_ref: "sop/drafts/sop_backlog_stale.json",
      status: "fresh_requested",
      previous_status: "historical",
      gate_reason_code: "chain_not_found",
      gate_reason: "SOP evolution chain not found.",
      reason: "A fresh replacement confirmation has already been requested.",
      created_at: "2026-06-30T00:00:04.000Z"
    });
    const freshRequestedBacklog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    assert.equal(freshRequestedBacklog.items.some((candidate) => candidate.id === "follow_up_confirmation_stale_sop"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces service health attention and decision state", async () => {
  const fixture = await createFixture();
  try {
    await writeRepoHead(fixture.store, "fedcba9876543210fedcba9876543210fedcba98");
    await fixture.store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 2468,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-29T00:00:00.000Z",
      runtime_build: {
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: true
      }
    });
    await fixture.store.writeJson("services/runtime/review_tick.json", {
      service: "review_tick",
      state: "disabled",
      enabled: false,
      updated_at: "2026-06-29T00:00:10.000Z"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.kind === "service_health");
    assert.ok(item);
    assert.equal(item.id, "service_health_runtime");
    assert.equal(item.action_kind, "inspect_service_health");
    assert.equal(item.status, "attention");
    assert.equal(item.service_health?.heartbeat_freshness, "stale");
    assert.equal(item.service_health?.deployment_status, "stale");
    assert.equal(item.service_health?.runtime_commit, "abcdef012345");
    assert.equal(item.service_health?.repo_commit, "fedcba987654");
    assert.equal(item.service_health?.runtime_dirty, true);
    assert.match(item.service_health?.deployment_reason ?? "", /differs from current repo HEAD/);
    assert.equal(
      item.service_health?.restart_command,
      "pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main"
    );
    assert.equal(item.service_health?.inspect_command, "pnpm run runtime -- service health --target runtime");
    assert.doesNotMatch(item.service_health?.restart_command ?? "", /--state-root/);
    assert.doesNotMatch(item.service_health?.inspect_command ?? "", /--state-root/);
    assert.match(item.next_step, /service health --target runtime/);
    assert.doesNotMatch(item.next_step, /service health --target runtime --state-root/);
    assert.match(item.decision_command ?? "", /governance decide-opportunity/);
    assert.deepEqual(item.action_chain?.map((step) => step.label), [
      "inspect",
      "restart_service",
      "record_decision"
    ]);
    assert.equal(item.action_chain?.[0]?.effect, "read_only");
    assert.equal(item.action_chain?.[0]?.command, "pnpm run runtime -- service health --target runtime");
    assert.equal(item.action_chain?.[1]?.effect, "service_control");
    assert.equal(
      item.action_chain?.[1]?.command,
      "pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main"
    );
    assert.equal(item.action_chain?.[2]?.effect, "state_decision");
    assert.doesNotMatch(JSON.stringify(item), /launchctl|im\.out\.log|im\.err\.log/);

    const deferred = await decideOpportunity(fixture.store, {
      opportunity: "service_health_runtime",
      status: "deferred",
      reason: "Operator will inspect the resident service after finishing this code slice."
    });
    assert.equal(deferred.decision.opportunity_kind, "service_health");
    assert.equal(deferred.previous_status, "attention");
    assert.deepEqual(deferred.decision.action_chain_snapshot?.map((step) => `${step.label}:${step.effect}`), [
      "inspect:read_only",
      "restart_service:service_control",
      "record_decision:state_decision"
    ]);
    assert.equal(
      deferred.decision.action_chain_snapshot?.[0]?.reason,
      "Inspect the bounded read model before deciding or acting."
    );
    const rawDecisions = await fixture.store.readStateText("autonomy/opportunity-decisions.jsonl");
    assert.match(rawDecisions, /"action_chain_snapshot"/);
    assert.doesNotMatch(rawDecisions, /service restart --target runtime/);
    assert.doesNotMatch(rawDecisions, /service health --target runtime/);
    const afterDeferred = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const deferredItem = afterDeferred.items.find((entry) => entry.kind === "service_health");
    assert.equal(deferredItem?.status, "deferred");
    assert.match(deferredItem?.summary ?? "", /Operator will inspect/);
    assert.deepEqual(deferredItem?.opportunity_decision?.action_chain_snapshot?.map((step) => `${step.label}:${step.effect}`), [
      "inspect:read_only",
      "restart_service:service_control",
      "record_decision:state_decision"
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces resident content loop health attention", async () => {
  const fixture = await createFixture();
  try {
    await writeRepoHead(fixture.store, "abcdef0123456789abcdef0123456789abcdef01");
    await fixture.store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 3579,
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
    await fixture.store.writeJson("services/runtime/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "error",
      updated_at: new Date().toISOString(),
      last_queue_count: 2,
      last_due_count: 1,
      next_due_at: "2026-06-30T06:00:00.000Z",
      error: "xiaohongshu-mcp current-user feed failed"
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.kind === "service_health");
    assert.ok(item);
    assert.equal(item.service_health?.deployment_status, "current");
    assert.equal(item.service_health?.content_feedback_refresh_state, "error");
    assert.equal(item.service_health?.content_feedback_refresh_enabled, true);
    assert.equal(item.service_health?.content_feedback_refresh_last_queue_count, 2);
    assert.equal(item.service_health?.content_feedback_refresh_last_due_count, 1);
    assert.equal(item.service_health?.content_feedback_refresh_error, "xiaohongshu-mcp current-user feed failed");
    assert.match(item.summary, /feedback_refresh=error/);
    assert.match(item.score_reasons.join(";"), /feedback_refresh=error/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog surfaces stale resident daily step recovery", async () => {
  const fixture = await createFixture();
  try {
    await writeRepoHead(fixture.store, "abcdef0123456789abcdef0123456789abcdef01");
    await fixture.store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 4680,
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

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    const item = backlog.items.find((entry) => entry.kind === "service_health");
    assert.ok(item);
    assert.equal(item.id, "service_health_runtime");
    assert.equal(item.status, "attention");
    assert.equal(item.service_health?.deployment_status, "current");
    assert.equal(item.service_health?.content_daily_state, "running");
    assert.equal(item.service_health?.content_daily_current_step, "publish_execute");
    assert.equal(item.service_health?.content_daily_current_step_status, "started");
    assert.equal(item.service_health?.content_daily_current_step_freshness, "stale");
    assert.equal(item.service_health?.content_daily_current_step_summary, "publishing through xiaohongshu-mcp");
    assert.equal(item.service_health?.content_daily_current_track_id, "ai_applications");
    assert.equal(item.service_health?.content_daily_current_job_ref, "content/daily/ai_applications/2026-07-02.json");
    assert.equal(item.service_health?.content_daily_current_run_ref, "content/runs/content_run_stale_daily/run.json");
    assert.match(item.summary, /daily_step=publish_execute:started:stale/);
    assert.match(item.score_reasons.join(";"), /content_daily_current_step_freshness=stale/);
    assert.deepEqual(item.action_chain?.map((step) => step.label), [
      "inspect",
      "restart_service",
      "record_decision"
    ]);
    assert.equal(item.action_chain?.[1]?.effect, "service_control");
    assert.equal(
      item.action_chain?.[1]?.command,
      "pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main"
    );
    assert.match(item.action_chain?.[1]?.reason ?? "", /daily content step is still stale/);
  } finally {
    await fixture.cleanup();
  }
});

test("opportunity backlog does not treat ordinary review tick status as runtime service health", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("services/runtime/review_tick.json", {
      service: "review_tick",
      state: "running",
      enabled: true,
      updated_at: new Date().toISOString()
    });

    const backlog = await getOpportunityBacklog(fixture.store, { limit: 10 });
    assert.equal(backlog.items.some((entry) => entry.kind === "service_health"), false);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "agent-opportunity-backlog-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    store: new AgentStore(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function writeRepoHead(store: AgentStore, commit: string, branch = "develop"): Promise<void> {
  await store.writeRepoText(".git/HEAD", `ref: refs/heads/${branch}\n`);
  await store.writeRepoText(`.git/refs/heads/${branch}`, `${commit}\n`);
}

function sopDraft(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "sop_backlog",
    title: "Backlog SOP",
    trigger: "Use when local self-evolution evidence indicates an SOP chain needs explicit operator attention.",
    procedure: ["Inspect the chain.", "Choose an explicit review command.", "Record the result."],
    required_tools: ["governance.evolution"],
    verification: "Opportunity Backlog should render only bounded refs and next steps.",
    failure_modes: ["If a pending confirmation already exists, do not duplicate the chain-level backlog item."],
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

function skillRegistryEntry(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    name: "backlog-health",
    description: "Backlog registry health fixture.",
    source: "personal",
    status: "active",
    instructions_ref: "vault/skills/backlog-health/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#backlog-health",
    origin_ref: null,
    trust_level: "local",
    source_sop_ref: null,
    references: [],
    tool_requirements: [],
    verification: "node --import tsx --test tests/opportunity_backlog.test.ts",
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

function backgroundReview(overrides: Record<string, unknown>): Record<string, unknown> {
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
      reviewed_event_ids: ["evidence_runtime_failure"],
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

function completionReport(overrides: Record<string, unknown>): Record<string, unknown> {
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

function contextPressureManifest(): ContextBundleManifest {
  return {
    version: 1,
    created_at: "2026-06-30T00:00:00.000Z",
    session_id: "session_pressure",
    turn_id: "turn_pressure",
    total_chars: 98_000,
    section_count: 3,
    sections: [{
      title: "Episode Recall",
      chars: 54_000,
      refs: ["memory/episodes/recall.json"],
      item_count: 32
    }, {
      title: "Selected Skills",
      chars: 16_000,
      refs: ["vault/skills/pressure/SKILL.md"],
      item_count: 1
    }, {
      title: "Output Contract",
      chars: 2_000,
      refs: ["packages/core/src/tool_contracts.ts"],
      item_count: 1
    }],
    recall: {
      memory_hit_count: 32,
      memory_refs: ["memory/episodes/recall.json"],
      archive_ref_count: 0,
      archive_refs: [],
      opportunity_ref_count: 0,
      opportunity_refs: [],
      skill_ref_count: 1,
      skill_refs: ["vault/skills/pressure/SKILL.md"],
      discipline_active: false
    }
  };
}

function contextHealthManifest(): ContextBundleManifest {
  return {
    version: 1,
    created_at: "2026-06-30T00:00:00.000Z",
    session_id: "session_health_missing",
    turn_id: "turn_health_missing",
    total_chars: 1200,
    section_count: 1,
    sections: [{
      title: "Stable Core",
      chars: 200,
      refs: ["core/soul.md"],
      item_count: 1
    }],
    recall: {
      memory_hit_count: 1,
      memory_refs: ["memory/episodes/recall.json"],
      archive_ref_count: 0,
      archive_refs: [],
      opportunity_ref_count: 0,
      opportunity_refs: [],
      skill_ref_count: 1,
      skill_refs: ["vault/skills/context-health/SKILL.md"],
      discipline_active: true
    }
  };
}

async function writePipelineRun(
  store: AgentStore,
  args: {
    pipelineId: string;
    runId: string;
    status: "done" | "blocked" | "failed";
    stageStatus: "done" | "blocked" | "failed";
    blockedStageId: string | null;
    updatedAt: string;
    rawOutput: string;
  }
): Promise<void> {
  const root = `pipelines/${args.pipelineId}`;
  await store.writeJson(`${root}/pipeline.json`, {
    id: args.pipelineId,
    task: `Use StageRunner for ${args.pipelineId}.`,
    source: "builtin",
    stages: [
      {
        id: "verify",
        title: "Verify",
        objective: "Verify the staged run.",
        input_refs: [],
        expected_outputs: ["verify.md"],
        allowed_tools: ["repo.search"],
        max_model_rounds: 1,
        max_tool_calls: 1,
        timeout_ms: 120000,
        acceptance_checks: ["Verification is explicit."],
        on_failure: "block",
        side_effect_level: "local_write",
        optional: false
      }
    ],
    side_effect_ceiling: "local_write",
    created_at: "2026-06-30T00:00:00.000Z"
  });
  await store.writeJson(`${root}/stages/verify.json`, {
    id: `stage_run_${args.pipelineId}`,
    pipeline_id: args.pipelineId,
    stage_id: "verify",
    status: args.stageStatus,
    attempt: 1,
    evidence_refs: [`evidence_${args.pipelineId}`],
    output_refs: [`${root}/artifacts/verify.md`],
    model_response_refs: [`${root}/responses/verify-model-response-r1.json`],
    envelope_refs: [`${root}/responses/verify-model-action-r1.json`],
    failure_kind: args.stageStatus === "done" ? null : "stage_incomplete",
    failure_message: args.stageStatus === "done" ? null : "Verification did not satisfy completion checks.",
    started_at: "2026-06-30T00:00:01.000Z",
    completed_at: args.updatedAt
  });
  await store.writeJson(`${root}/checkpoint.json`, {
    run_id: args.runId,
    pipeline_id: args.pipelineId,
    status: args.status,
    blocked_stage_id: args.blockedStageId,
    stage_run_refs: [`${root}/stages/verify.json`],
    evidence_refs: [`evidence_${args.pipelineId}`],
    final_response_ref: args.status === "done" ? `${root}/artifacts/verify.md` : null,
    updated_at: args.updatedAt
  });
  await store.writeText(`${root}/artifacts/verify.md`, args.rawOutput);
  await store.writeText(`${root}/responses/verify-model-response-r1.json`, `MODEL_${args.rawOutput}`);
}
