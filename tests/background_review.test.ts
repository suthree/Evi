import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import {
  recordSelfEvolutionIteration,
  recordSelfEvolutionIterationOutcome
} from "../packages/core/src/self_evolution_iterations.js";
import { BackgroundReviewRunner } from "../packages/runtime/src/background_review.js";
import {
  recordContentFeedbackEvidence,
  recordContentImageEvidence,
  recordContentPublishEvidence,
  runContentDryRun
} from "../packages/runtime/src/content_pipeline.js";

test("background review creates proposal-only artifacts from episode memory", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_1",
      session_id: "session_review",
      turn_id: "turn_1",
      kind: "report",
      summary: "Skipped skill promotion because recalled skill already covers this SOP: existing-skill.",
      artifact_refs: ["sop/drafts/sop_1.md", "vault/skills/existing-skill/SKILL.md"],
      created_at: "2026-06-29T00:00:01Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_2",
      session_id: "session_review",
      turn_id: "turn_1",
      kind: "audit_result",
      summary: "Completion verification blocked SOP audit because the model claim was unverified.",
      artifact_refs: ["memory/episodes/session_review-model-action-r1.json"],
      created_at: "2026-06-29T00:00:02Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const report = await runner.run({ query: "skill promotion", limit: 5 });

    assert.equal(report.mode, "query");
    assert.match(report.evidence_event_id ?? "", /^evidence_/);
    assert.equal(report.stats.events_reviewed, 1);
    assert.equal(report.proposals.some((proposal) => proposal.type === "skill_revision"), true);
    assert.equal(report.artifact_refs.json_ref, `autonomy/reviews/${report.id}.json`);
    assert.equal(report.artifact_refs.markdown_ref, `autonomy/reviews/${report.id}.md`);
    assert.equal(report.artifact_refs.json_ref.endsWith(".json"), true);
    assert.equal(report.artifact_refs.markdown_ref.endsWith(".md"), true);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);

    const markdown = await readFile(join(fixture.stateRoot, report.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /Background Review/);
    assert.match(markdown, /Review duplicate-skill detection/);

    const rawEvents = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(rawEvents, /Background review produced/);
  } finally {
    await fixture.cleanup();
  }
});

test("sop candidate follow-up uses same-title reused chain instead of drafting a duplicate", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeJson("autonomy/reviews/background_review_same_title_chain.json", backgroundReviewRecord({
      id: "background_review_same_title_chain",
      stats: {
        events_reviewed: 2,
        sessions_seen: 1,
        kinds: { report: 2 },
        failure_signal_count: 1,
        sop_signal_count: 1
      },
      proposals: [{
        id: "review_proposal_same_title",
        type: "sop_candidate",
        title: "Draft an SOP for recurring blocked or failed runtime paths",
        rationale: "A repeated failure path appears again.",
        evidence_refs: ["memory/episodes/events.jsonl#evidence_new_failure"],
        next_action: "Draft only if no existing SOP chain covers it."
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
      }]
    }));

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const plan = await runner.planProposalFollowUp({
      reviewRef: "background_review_same_title_chain",
      proposalId: "review_proposal_same_title"
    });

    assert.equal(plan.chain_summaries.length, 1);
    assert.equal(plan.chain_summaries[0].sop_id, "sop_existing_runtime_failures");
    assert.equal(plan.actions.some((action) => action.kind === "inspect_chain"), true);
    assert.equal(plan.actions.some((action) => action.kind === "draft_sop"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("background review tick materializes stable self-evolution inbox items", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_tick_1",
      session_id: "session_review",
      turn_id: "turn_1",
      kind: "audit_result",
      summary: "Completion verification blocked SOP audit because the model claim was unverified.",
      artifact_refs: ["memory/episodes/session_review-model-action-r1.json"],
      created_at: "2026-06-29T00:00:02Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ query: "unverified", limit: 5 });

    assert.equal(tick.mode, "query");
    assert.equal(tick.query, "unverified");
    assert.equal(tick.proposal_count, 2);
    assert.equal(tick.stats.new_items, tick.inbox_items.length);
    assert.equal(tick.stats.updated_items, 0);
    assert.equal(tick.inbox_items.length, 2);
    const item = tick.inbox_items.find((candidate) => candidate.action_kind === "draft_sop");
    if (!item) throw new Error("expected draft_sop inbox item");
    assert.equal(item.status, "open");
    assert.equal(item.source, "review_tick");
    assert.equal(item.action_kind, "draft_sop");
    assert.deepEqual(item.would_write, ["state"]);
    assert.equal(item.seen_count, 1);
    assert.equal(existsSync(join(fixture.stateRoot, tick.artifact_refs.json_ref)), true);
    assert.equal(existsSync(join(fixture.stateRoot, tick.artifact_refs.markdown_ref)), true);
    assert.equal(existsSync(join(fixture.stateRoot, `autonomy/inbox/${item.id}.json`)), true);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);

    const tickAgain = await runner.runTick({ query: "unverified", limit: 5 });
    assert.equal(tickAgain.stats.new_items, 0);
    assert.equal(tickAgain.stats.updated_items, tick.inbox_items.length);
    const itemAgain = tickAgain.inbox_items.find((candidate) => candidate.id === item.id);
    if (!itemAgain) throw new Error("expected stable draft_sop inbox item");
    assert.equal(itemAgain.seen_count, 2);
    assert.equal(itemAgain.first_review_ref, item.first_review_ref);
    const inbox = await runner.listReviewInbox({ limit: 10 });
    assert.equal(inbox.count, 2);
    assert.equal(inbox.item_refs.includes(`autonomy/inbox/${item.id}.json`), true);
    const readItem = await runner.getReviewInboxItem({ itemRef: item.id });
    assert.equal(readItem.item.id, item.id);
    assert.equal(readItem.item.status, "open");
    const deferredInboxDecision = await runner.decideReviewInboxItem({
      itemRef: item.id,
      status: "deferred",
      reason: "Operator wants to inspect the repeated proposal before requesting confirmation."
    });
    assert.equal(deferredInboxDecision.action, "decide-review-inbox");
    assert.equal(deferredInboxDecision.item_ref, `autonomy/inbox/${item.id}.json`);
    assert.equal(deferredInboxDecision.previous_status, "open");
    assert.equal(deferredInboxDecision.status, "deferred");
    assert.equal(deferredInboxDecision.decision_ref, "autonomy/review-inbox-decisions.jsonl#1");
    const deferredRead = await runner.getReviewInboxItem({ itemRef: item.id });
    assert.equal(deferredRead.latest_decision?.status, "deferred");
    assert.equal(deferredRead.latest_decision?.previous_status, "open");
    const deferredInbox = await runner.listReviewInbox({ limit: 10 });
    assert.equal(
      deferredInbox.items.find((candidate) => candidate.id === item.id)?.latest_decision?.status,
      "deferred"
    );
    await assert.rejects(
      () => runner.requestInboxItemConfirmation({ itemRef: item.id }),
      /latest operator decision deferred/
    );
    const reopenedInboxDecision = await runner.decideReviewInboxItem({
      itemRef: item.id,
      status: "open",
      reason: "Inspection confirmed the inbox item is still valid."
    });
    assert.equal(reopenedInboxDecision.previous_status, "deferred");
    assert.equal(reopenedInboxDecision.decision_ref, "autonomy/review-inbox-decisions.jsonl#2");
    const requested = await runner.requestInboxItemConfirmation({ itemRef: item.id });
    assert.equal(requested.item.status, "confirmation_requested");
    assert.equal(requested.confirmation.action_id, itemAgain.action_id);
    assert.equal(requested.confirmation.action_kind, itemAgain.action_kind);
    assert.equal(requested.confirmation.draft_sop_readiness?.status, "ready");
    assert.equal(requested.confirmation.draft_sop_readiness?.failure_signal_count, 1);
    assert.equal(requested.confirmation.draft_sop_readiness?.evidence_ref_count, 2);
    assert.equal(requested.confirmation_ref, requested.item.confirmation_ref);
    assert.equal(existsSync(join(fixture.stateRoot, requested.confirmation_ref)), true);
    const pendingConfirmations = await runner.listReviewFollowUpConfirmations({ limit: 10 });
    assert.equal(pendingConfirmations.count, 1);
    assert.equal(pendingConfirmations.confirmations[0].id, requested.confirmation.id);
    assert.equal(pendingConfirmations.confirmations[0].status, "pending");
    assert.equal(pendingConfirmations.confirmations[0].action_kind, "draft_sop");
    assert.equal(pendingConfirmations.confirmations[0].draft_sop_readiness?.status, "ready");
    assert.equal(pendingConfirmations.confirmations[0].title, requested.confirmation.action.title);
    assert.equal("safety_boundary" in pendingConfirmations.confirmations[0], false);

    const pendingById = await runner.getReviewFollowUpConfirmation({
      confirmationRef: requested.confirmation.id
    });
    assert.equal(pendingById.confirmation_ref, requested.confirmation_ref);
    assert.equal(pendingById.confirmation.next_step, requested.confirmation.next_step);
    assert.equal(pendingById.confirmation.draft_sop_readiness?.status, "ready");
    await assert.rejects(
      () => runner.requestInboxItemConfirmation({ itemRef: item.id }),
      /already has a pending confirmation/
    );
    const tickAfterConfirmation = await runner.runTick({ query: "unverified", limit: 5 });
    const confirmedItem = tickAfterConfirmation.inbox_items.find((candidate) => candidate.id === item.id);
    if (!confirmedItem) throw new Error("expected confirmed inbox item after tick");
    assert.equal(confirmedItem.status, "confirmation_requested");
    assert.equal(confirmedItem.confirmation_ref, requested.confirmation_ref);
    assert.equal(confirmedItem.seen_count, 3);

    const executed = await runner.executeConfirmedFollowUp({
      confirmationRef: requested.confirmation_ref
    });
    assert.equal(executed.confirmation.status, "executed");
    assert.equal(executed.confirmation.execution_result?.kind, "draft_sop");
    const executedConfirmations = await runner.listReviewFollowUpConfirmations({ limit: 10 });
    assert.equal(executedConfirmations.count, 1);
    assert.equal(executedConfirmations.confirmations[0].status, "executed");
    assert.equal(executedConfirmations.confirmations[0].execution_kind, "draft_sop");
    assert.equal(executedConfirmations.confirmations[0].evidence_event_id, executed.confirmation.execution_result?.evidence_event_id);

    const executedByRef = await runner.getReviewFollowUpConfirmation({
      confirmationRef: executed.confirmation_ref
    });
    assert.equal(executedByRef.confirmation.execution_result?.kind, "draft_sop");
    const executedItem = await runner.getReviewInboxItem({ itemRef: item.id });
    assert.equal(executedItem.item.status, "executed");
    assert.equal(executedItem.item.execution_ref, requested.confirmation_ref);
    assert.equal(executedItem.item.execution_markdown_ref, requested.confirmation_markdown_ref);
    assert.equal(executedItem.item.execution_evidence_event_id, executed.evidence_event_id);
    assert.equal(executedItem.item.execution_result?.kind, "draft_sop");
    await assert.rejects(
      () => runner.requestInboxItemConfirmation({ itemRef: item.id }),
      /already executed/
    );
    await assert.rejects(
      () => runner.decideReviewInboxItem({
        itemRef: item.id,
        status: "completed",
        reason: "Already executed through confirmation."
      }),
      /already executed/
    );
    await assert.rejects(
      () => runner.getReviewFollowUpConfirmation({ confirmationRef: "../autonomy/followups/follow_up_confirmation_bad.json" }),
      /Unsafe follow-up confirmation ref/
    );
    const activeInbox = await runner.listReviewInbox({ limit: 10 });
    assert.equal(activeInbox.items.some((candidate) => candidate.id === item.id), false);
    const executedInbox = await runner.listReviewInbox({ limit: 10, status: "executed" });
    assert.equal(executedInbox.count, 1);
    assert.equal(executedInbox.items[0]?.id, item.id);
    const allInbox = await runner.listReviewInbox({ limit: 10, status: "all" });
    assert.equal(allInbox.count, 2);

    const confirmationMarkdown = await readFile(join(fixture.stateRoot, requested.confirmation_markdown_ref), "utf8");
    assert.match(confirmationMarkdown, /Draft SOP Readiness/);
    assert.match(confirmationMarkdown, /Status: ready/);
    assert.match(confirmationMarkdown, /Failure signals: 1/);
    assert.match(confirmationMarkdown, /SOP signals: 1/);

    const markdown = await readFile(join(fixture.stateRoot, tickAgain.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /Review Tick/);
    assert.match(markdown, /updated_items: 2/);
    const rawEvents = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(rawEvents, /Review tick produced 2 inbox item/);
    assert.match(rawEvents, /Requested mutation confirmation from review inbox item/);
    assert.match(rawEvents, /Executed confirmed draft_sop follow-up action/);
    const inboxDecisionLog = await readFile(join(fixture.stateRoot, "autonomy/review-inbox-decisions.jsonl"), "utf8");
    assert.match(inboxDecisionLog, /Operator wants to inspect/);
    assert.match(inboxDecisionLog, /Inspection confirmed/);
  } finally {
    await fixture.cleanup();
  }
});

test("draft SOP confirmation gates require ready evidence and revalidate before execution", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeText("autonomy/reviews/background_review_gate.md", "RAW_GATE_REVIEW_MARKDOWN_SHOULD_NOT_APPEAR");
    await store.writeJson("autonomy/reviews/background_review_gate.json", backgroundReviewRecord({
      id: "background_review_gate",
      stats: {
        events_reviewed: 1,
        sessions_seen: 1,
        kinds: { report: 1 },
        failure_signal_count: 0,
        sop_signal_count: 0
      },
      proposals: [{
        id: "review_proposal_gate",
        type: "sop_candidate",
        title: "Draft gated SOP",
        rationale: "A weak proposal should not be confirmed.",
        evidence_refs: [],
        next_action: "Collect evidence before drafting."
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_gate.json",
        markdown_ref: "autonomy/reviews/background_review_gate.md"
      }
    }));

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const weakPlan = await runner.planProposalFollowUp({
      reviewRef: "background_review_gate",
      proposalId: "review_proposal_gate"
    });
    const weakDraftAction = weakPlan.actions.find((action) => action.kind === "draft_sop");
    if (!weakDraftAction) throw new Error("expected weak draft action");
    await assert.rejects(
      () => runner.requestFollowUpConfirmation({
        reviewRef: "background_review_gate",
        proposalId: "review_proposal_gate",
        actionId: weakDraftAction.id
      }),
      /Draft SOP readiness is weak_evidence/
    );

    await store.writeJson("autonomy/reviews/background_review_gate.json", backgroundReviewRecord({
      id: "background_review_gate",
      stats: {
        events_reviewed: 1,
        sessions_seen: 1,
        kinds: { report: 1 },
        failure_signal_count: 1,
        sop_signal_count: 0
      },
      proposals: [{
        id: "review_proposal_gate",
        type: "sop_candidate",
        title: "Draft gated SOP",
        rationale: "A ready proposal can be confirmed.",
        evidence_refs: ["memory/episodes/events.jsonl#evidence_gate"],
        next_action: "Draft a state-only SOP."
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_gate.json",
        markdown_ref: "autonomy/reviews/background_review_gate.md"
      }
    }));
    const readyConfirmation = await runner.requestFollowUpConfirmation({
      reviewRef: "background_review_gate",
      proposalId: "review_proposal_gate",
      actionId: weakDraftAction.id
    });
    assert.equal(readyConfirmation.confirmation.draft_sop_readiness?.status, "ready");
    assert.equal(readyConfirmation.confirmation.draft_sop_readiness?.evidence_ref_count, 1);

    const pendingMarkdown = await readFile(join(fixture.stateRoot, readyConfirmation.confirmation_markdown_ref), "utf8");
    assert.match(pendingMarkdown, /Draft SOP Readiness/);
    assert.match(pendingMarkdown, /Status: ready/);
    assert.doesNotMatch(pendingMarkdown, /RAW_GATE_REVIEW_MARKDOWN_SHOULD_NOT_APPEAR/);

    await store.writeJson("autonomy/reviews/background_review_gate.json", backgroundReviewRecord({
      id: "background_review_gate",
      stats: {
        events_reviewed: 1,
        sessions_seen: 1,
        kinds: { report: 1 },
        failure_signal_count: 0,
        sop_signal_count: 0
      },
      proposals: [{
        id: "review_proposal_gate",
        type: "sop_candidate",
        title: "Draft gated SOP",
        rationale: "The evidence weakened after confirmation request.",
        evidence_refs: [],
        next_action: "Collect evidence before drafting."
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_gate.json",
        markdown_ref: "autonomy/reviews/background_review_gate.md"
      }
    }));
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: readyConfirmation.confirmation_ref
      }),
      /Draft SOP readiness is weak_evidence/
    );
    const stillPending = await runner.getReviewFollowUpConfirmation({
      confirmationRef: readyConfirmation.confirmation_ref
    });
    assert.equal(stillPending.confirmation.status, "pending");
  } finally {
    await fixture.cleanup();
  }
});

test("review inbox concurrent decisions return actual appended refs", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson("autonomy/inbox/review_inbox_concurrent_a.json", reviewInboxItem({
      id: "review_inbox_concurrent_a",
      title: "Inspect concurrent chain A"
    }));
    await store.writeJson("autonomy/inbox/review_inbox_concurrent_b.json", reviewInboxItem({
      id: "review_inbox_concurrent_b",
      title: "Inspect concurrent chain B",
      action_id: "follow_up_action_inspect_chain_b"
    }));
    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });

    const [first, second] = await Promise.all([
      runner.decideReviewInboxItem({
        itemRef: "review_inbox_concurrent_a",
        status: "completed",
        reason: "Concurrent decision A completed."
      }),
      runner.decideReviewInboxItem({
        itemRef: "review_inbox_concurrent_b",
        status: "completed",
        reason: "Concurrent decision B completed."
      })
    ]);
    const decisions = await readJsonl(join(fixture.stateRoot, "autonomy/review-inbox-decisions.jsonl"));
    const refFor = (id: string): string => {
      const index = decisions.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`missing decision ${id}`);
      return `autonomy/review-inbox-decisions.jsonl#${index + 1}`;
    };

    assert.equal(decisions.length, 2);
    assert.notEqual(first.decision_ref, second.decision_ref);
    assert.equal(first.decision_ref, refFor(first.decision.id));
    assert.equal(first.decision.ref, first.decision_ref);
    assert.equal(second.decision_ref, refFor(second.decision.id));
    assert.equal(second.decision.ref, second.decision_ref);
  } finally {
    await fixture.cleanup();
  }
});

test("background review SOP chain summaries isolate cited audit evidence", async () => {
  const fixture = await createFixture();
  try {
    const oldSopId = "sop_20260630000100_aaaaaaaa";
    const newSopId = "sop_20260630000200_bbbbbbbb";
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson(`sop/drafts/${oldSopId}.json`, sopDraft({
      id: oldSopId,
      title: "Old cited SOP",
      status: "audited"
    }));
    await store.writeJson("governance/audits/audit_old.json", {
      id: "audit_old",
      target_type: "sop",
      target_ref: oldSopId,
      verdict: "promote",
      reason: "The old SOP audit is only cited evidence.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:01:00.000Z"
    });
    await store.writeJson(`sop/drafts/${newSopId}.json`, sopDraft({
      id: newSopId,
      title: "New SOP citing old evidence",
      status: "draft",
      evidence_refs: [
        `sop/drafts/${oldSopId}.json`,
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ]
    }));
    await store.writeJson("governance/audits/audit_new.json", {
      id: "audit_new",
      target_type: "sop",
      target_ref: newSopId,
      verdict: "promote",
      reason: "The new SOP audit owns only audit_new.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:05:00.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_old_audit",
      session_id: oldSopId,
      turn_id: "audit_old",
      kind: "audit_result",
      summary: `State-only SOP audit verdict for ${oldSopId}: promote.`,
      artifact_refs: [
        `sop/drafts/${oldSopId}.json`,
        "governance/audits/audit_old.json"
      ],
      created_at: "2026-06-30T00:02:00.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_new_audit",
      session_id: newSopId,
      turn_id: "audit_new",
      kind: "audit_result",
      summary: `State-only SOP audit verdict for ${newSopId}: promote.`,
      artifact_refs: [
        `sop/drafts/${newSopId}.json`,
        "governance/audits/audit_new.json",
        `sop/drafts/${oldSopId}.json`,
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ],
      created_at: "2026-06-30T00:06:00.000Z"
    });
    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });

    const oldChain = await runner.getSopChain({ sopRef: oldSopId });
    const newChain = await runner.getSopChain({ sopRef: newSopId });
    assert.deepEqual(oldChain.audit_refs, ["governance/audits/audit_old.json"]);
    assert.equal(oldChain.events.some((event) => event.id === "evidence_new_audit"), false);
    assert.deepEqual(newChain.audit_refs, ["governance/audits/audit_new.json"]);
    assert.deepEqual(newChain.skill_refs, []);
    assert.equal(newChain.events.some((event) => event.id === "evidence_new_audit"), true);

    const review = await runner.run({ query: newSopId, limit: 5 });
    const reviewedOld = review.chain_summaries.find((item) => item.sop_id === oldSopId);
    const reviewedNew = review.chain_summaries.find((item) => item.sop_id === newSopId);
    assert.deepEqual(reviewedOld?.audit_refs, ["governance/audits/audit_old.json"]);
    assert.equal(reviewedOld?.event_ids.includes("evidence_new_audit"), false);
    assert.deepEqual(reviewedNew?.audit_refs, ["governance/audits/audit_new.json"]);
    assert.deepEqual(reviewedNew?.skill_refs, []);
  } finally {
    await fixture.cleanup();
  }
});

test("review inbox collapses duplicate active items without mutating history", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson("autonomy/inbox/review_inbox_dup_a.json", reviewInboxItem({
      id: "review_inbox_dup_a",
      title: "Inspect duplicated SOP chain",
      updated_at: "2026-06-30T00:00:03.000Z"
    }));
    await store.writeJson("autonomy/inbox/review_inbox_dup_b.json", reviewInboxItem({
      id: "review_inbox_dup_b",
      title: "Inspect duplicated SOP chain",
      updated_at: "2026-06-30T00:00:02.000Z"
    }));
    await store.writeJson("autonomy/inbox/review_inbox_distinct.json", reviewInboxItem({
      id: "review_inbox_distinct",
      title: "Inspect separate SOP chain",
      command: "pnpm run runtime -- review chain --sop sop_other --state-root .runtime/state",
      required_refs: ["sop/drafts/sop_other.json"],
      updated_at: "2026-06-30T00:00:01.000Z"
    }));

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const active = await runner.listReviewInbox({ limit: 10 });
    assert.equal(active.count, 2);
    assert.deepEqual(active.item_refs, [
      "autonomy/inbox/review_inbox_dup_a.json",
      "autonomy/inbox/review_inbox_distinct.json"
    ]);
    assert.equal(active.items[0]?.duplicate_group?.duplicate_count, 1);
    assert.deepEqual(active.items[0]?.duplicate_group?.duplicate_refs, ["autonomy/inbox/review_inbox_dup_b.json"]);

    const all = await runner.listReviewInbox({ status: "all", limit: 10 });
    assert.equal(all.count, 3);
    assert.equal(all.items.find((item) => item.id === "review_inbox_dup_b")?.duplicate_group?.canonical_id, "review_inbox_dup_a");

    const duplicateDetail = await runner.getReviewInboxItem({ itemRef: "review_inbox_dup_b" });
    assert.equal(duplicateDetail.duplicate_group?.canonical_id, "review_inbox_dup_a");
    await assert.rejects(
      () => runner.requestInboxItemConfirmation({ itemRef: "review_inbox_dup_b" }),
      /duplicate of autonomy\/inbox\/review_inbox_dup_a\.json/
    );

    await store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_dup_completed",
      item_id: "review_inbox_dup_a",
      item_ref: "autonomy/inbox/review_inbox_dup_a.json",
      action_kind: "inspect_chain",
      status: "completed",
      previous_status: "open",
      reason: "Operator inspected the canonical duplicate group.",
      created_at: "2026-06-30T00:00:04.000Z"
    });

    const afterCanonicalCompleted = await runner.listReviewInbox({ limit: 10 });
    assert.deepEqual(afterCanonicalCompleted.item_refs, ["autonomy/inbox/review_inbox_distinct.json"]);
    const completedDuplicateDetail = await runner.getReviewInboxItem({ itemRef: "review_inbox_dup_b" });
    assert.equal(completedDuplicateDetail.latest_decision?.status, "completed");
    await assert.rejects(
      () => runner.requestInboxItemConfirmation({ itemRef: "review_inbox_dup_b" }),
      /latest operator decision completed/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("review inbox inherits completed decisions across regenerated duplicate keys", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson("autonomy/inbox/review_inbox_regenerated_old.json", reviewInboxItem({
      id: "review_inbox_regenerated_old",
      updated_at: "2026-06-30T00:00:01.000Z"
    }));

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const completed = await runner.decideReviewInboxItem({
      itemRef: "review_inbox_regenerated_old",
      status: "completed",
      reason: "Operator already handled this semantic review item."
    });
    assert.match(completed.decision.duplicate_key ?? "", /^review_inbox_duplicate_/);

    await store.writeJson("autonomy/inbox/review_inbox_regenerated_new.json", reviewInboxItem({
      id: "review_inbox_regenerated_new",
      updated_at: "2026-06-30T00:00:02.000Z"
    }));

    const active = await runner.listReviewInbox({ limit: 10 });
    assert.equal(active.items.some((item) => item.id === "review_inbox_regenerated_old"), false);
    assert.equal(active.items.some((item) => item.id === "review_inbox_regenerated_new"), false);

    const regeneratedDetail = await runner.getReviewInboxItem({ itemRef: "review_inbox_regenerated_new" });
    assert.equal(regeneratedDetail.latest_decision?.status, "completed");
    assert.equal(regeneratedDetail.latest_decision?.item_id, "review_inbox_regenerated_old");
    await assert.rejects(
      () => runner.requestInboxItemConfirmation({ itemRef: "review_inbox_regenerated_new" }),
      /latest operator decision completed/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("review tick selects top open SOP evolution backlog item as bounded focus", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeJson("sop/drafts/sop_tick_focus.json", {
      id: "sop_tick_focus",
      title: "Audit tick focus SOP",
      trigger: "Use when review tick needs to focus an open SOP evolution chain.",
      procedure: ["RAW_TICK_SOP_BODY_SHOULD_NOT_APPEAR"],
      required_tools: ["review.tick"],
      verification: "Review tick focus includes only bounded refs and summary fields.",
      failure_modes: ["Do not read raw SOP bodies into tick focus."],
      evidence_refs: ["memory/episodes/events.jsonl#evidence_tick_focus_1"],
      revision: 1,
      status: "draft"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_tick_focus_1",
      session_id: "session_tick_focus",
      turn_id: "turn_1",
      kind: "report",
      summary: "sop_tick_focus needs review tick attention before the next SOP audit.",
      artifact_refs: ["sop/drafts/sop_tick_focus.json"],
      created_at: "2026-06-30T00:00:02Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "sop_evolution_chain");
    assert.equal(tick.focus.opportunity?.id, "sop_tick_focus");
    assert.equal(tick.mode, "query");
    assert.match(tick.query ?? "", /sop_tick_focus/);
    assert.doesNotMatch(JSON.stringify(tick.focus), /RAW_TICK_SOP_BODY_SHOULD_NOT_APPEAR/);

    const markdown = await readFile(join(fixture.stateRoot, tick.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /focus_source: opportunity_backlog/);
    assert.match(markdown, /focus_opportunity: sop_evolution_chain:sop_tick_focus/);
    assert.doesNotMatch(markdown, /RAW_TICK_SOP_BODY_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick selects failed completion verification as bounded focus", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeJson("memory/episodes/session_tick_completion-completion-verification.json", completionVerificationReport({
      id: "completion_verification_tick_focus",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      summary: "Completion verification failed because command.run returned a failed tool result.",
      final_response_ref: "memory/episodes/session_tick_completion-final-response.md",
      observation_refs: ["memory/episodes/session_tick_completion-tool_result_command.json"],
      checks: [
        {
          id: "write_run_tool_results",
          status: "fail",
          summary: "Failed write/run tool result: command.run.",
          refs: ["tool_result_command"]
        }
      ]
    }));
    await store.writeText(
      "memory/episodes/session_tick_completion-final-response.md",
      "RAW_COMPLETION_RESPONSE_SHOULD_NOT_APPEAR"
    );

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "completion_verification");
    assert.equal(tick.focus.opportunity?.id, "completion_verification_tick_focus");
    assert.equal(tick.focus.opportunity?.action_kind, "repair_completion");
    assert.match(tick.query ?? "", /Completion verification failed/);
    assert.match(tick.query ?? "", /session_tick_completion-completion-verification\.json/);
    assert.match(tick.query ?? "", /session_tick_completion-final-response\.md/);
    assert.doesNotMatch(JSON.stringify(tick.focus), /RAW_COMPLETION_RESPONSE_SHOULD_NOT_APPEAR/);

    const markdown = await readFile(join(fixture.stateRoot, tick.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /focus_source: opportunity_backlog/);
    assert.match(markdown, /focus_opportunity: completion_verification:completion_verification_tick_focus/);
    assert.doesNotMatch(markdown, /RAW_COMPLETION_RESPONSE_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick turns model diagnostic completion focus into runtime-gap proposal", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeJson("memory/episodes/session_tick_model-model-diagnostic-r1.json", {
      schema_version: 1,
      id: "model_diagnostic_tick_focus",
      session_id: "session_tick_model",
      turn_id: "turn_tick_model",
      round: 1,
      stage: "envelope_parse",
      failure_kind: "format",
      error_preview: "Model output could not be parsed as ModelActionEnvelope.",
      output_preview: "RAW_TICK_MODEL_OUTPUT_SHOULD_NOT_APPEAR",
      response_ref: "memory/episodes/session_tick_model-model-response-r1.json",
      created_at: "2026-06-30T00:00:07.000Z"
    });
    await store.writeJson("memory/episodes/session_tick_model-completion-verification.json", completionVerificationReport({
      id: "completion_verification_tick_model_diagnostic",
      session_id: "session_tick_model",
      turn_id: "turn_tick_model",
      completion_status: "blocked",
      verification_status: "skipped",
      verified: false,
      summary: "Completion verification skipped for status=blocked.",
      envelope_ref: "memory/episodes/session_tick_model-model-action-r1.json",
      final_response_ref: "memory/episodes/session_tick_model-final-response.md",
      observation_refs: ["memory/episodes/session_tick_model-model-diagnostic-r1.json"],
      checks: [{
        id: "model_diagnostics",
        status: "warning",
        summary: "Model failure diagnostic artifact(s) recorded: 1.",
        refs: ["memory/episodes/session_tick_model-model-diagnostic-r1.json"]
      }]
    }));
    await store.writeText(
      "memory/episodes/session_tick_model-final-response.md",
      "RAW_TICK_FINAL_RESPONSE_SHOULD_NOT_APPEAR"
    );

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });
    const review = JSON.parse(await readFile(join(fixture.stateRoot, tick.review_ref), "utf8")) as {
      proposals: Array<{ type: string; title: string; rationale: string; evidence_refs: string[]; next_action: string }>;
    };
    const proposal = review.proposals.find((item) => item.type === "runtime_gap");
    const markdown = await readFile(join(fixture.stateRoot, tick.artifact_refs.markdown_ref), "utf8");

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "completion_verification");
    assert.equal(tick.focus.opportunity?.id, "completion_verification_tick_model_diagnostic");
    assert.match(tick.query ?? "", /model_diagnostics=1/);
    assert.match(tick.query ?? "", /model_failure_kinds=format/);
    assert.match(tick.query ?? "", /model_failure_stages=envelope_parse/);
    assert.match(tick.query ?? "", /session_tick_model-model-diagnostic-r1\.json/);
    assert.ok(proposal);
    assert.match(proposal?.title ?? "", /Review model failure diagnostics/);
    assert.match(proposal?.rationale ?? "", /bounded model failure diagnostics/);
    assert.equal(proposal?.evidence_refs.includes("memory/episodes/session_tick_model-completion-verification.json"), true);
    assert.match(proposal?.next_action ?? "", /Do not retry or switch models/);
    assert.match(markdown, /focus_opportunity: completion_verification:completion_verification_tick_model_diagnostic/);
    assert.doesNotMatch(JSON.stringify(tick), /RAW_TICK_MODEL_OUTPUT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(review), /RAW_TICK_FINAL_RESPONSE_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick selects context health issue as bounded focus", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeJson("memory/episodes/session_tick_health-context.json", {
      version: 1,
      created_at: "2026-06-30T00:00:00.000Z",
      session_id: "session_tick_health",
      turn_id: "turn_tick_health",
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
        memory_refs: ["memory/episodes/prior.json"],
        archive_ref_count: 0,
        archive_refs: [],
        opportunity_ref_count: 0,
        opportunity_refs: [],
        skill_ref_count: 1,
        skill_refs: ["vault/skills/context-health/SKILL.md"],
        discipline_active: true
      }
    });
    await store.writeText("memory/episodes/session_tick_orphan-context.md", "RAW_CONTEXT_HEALTH_MARKDOWN_SHOULD_NOT_APPEAR");

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "context_health");
    assert.equal(tick.focus.opportunity?.id, "context_health_missing_context_session_tick_health");
    assert.equal(tick.focus.opportunity?.action_kind, "repair_context_health");
    const expectedFocusActionChain = [
      "inspect:read_only",
      "complete_after_repair:state_decision",
      "retire_historical:state_decision",
      "record_decision:state_decision"
    ];
    assert.deepEqual(tick.focus.opportunity?.action_chain?.map((step) => `${step.label}:${step.effect}`), expectedFocusActionChain);
    assert.match(tick.query ?? "", /context_health/);
    assert.match(tick.query ?? "", /missing_context_markdown/);
    assert.match(tick.query ?? "", /session_tick_health-context\.json/);
    assert.match(tick.query ?? "", /session_tick_health-context\.md/);
    assert.match(tick.query ?? "", /action_chain=inspect:read_only/);
    assert.equal(tick.proposal_count, 1);
    assert.equal(tick.inbox_items.length, 1);
    assert.equal(tick.inbox_items[0]?.proposal_type, "runtime_gap");
    assert.equal(tick.inbox_items[0]?.action_kind, "narrow_review");
    assert.deepEqual(tick.inbox_items[0]?.focus_action_chain?.map((step) => `${step.label}:${step.effect}`), expectedFocusActionChain);
    assert.equal(tick.inbox_items[0]?.required_refs.includes("memory/episodes/session_tick_health-context.json"), true);
    assert.equal(tick.inbox_items[0]?.required_refs.includes("memory/episodes/session_tick_health-context.md"), true);
    assert.equal(tick.inbox_items.some((item) => item.proposal_type === "memory_gap"), false);
    assert.doesNotMatch(JSON.stringify(tick.focus), /RAW_CONTEXT_HEALTH_MARKDOWN_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(tick.inbox_items), /RAW_CONTEXT_HEALTH_MARKDOWN_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(tick.query ?? "", /RAW_CONTEXT_HEALTH_MARKDOWN_SHOULD_NOT_APPEAR/);

    const review = JSON.parse(await readFile(join(fixture.stateRoot, tick.review_ref), "utf8")) as {
      proposals: Array<{ type: string; focus_action_chain?: Array<{ label: string; effect: string }> }>;
    };
    const runtimeGapProposal = review.proposals.find((proposal) => proposal.type === "runtime_gap");
    assert.deepEqual(runtimeGapProposal?.focus_action_chain?.map((step) => `${step.label}:${step.effect}`), expectedFocusActionChain);

    const markdown = await readFile(join(fixture.stateRoot, tick.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /focus_source: opportunity_backlog/);
    assert.match(markdown, /focus_opportunity: context_health:context_health_missing_context_session_tick_health/);
    assert.match(markdown, /focus_action_chain: inspect\[read_only\] -> complete_after_repair\[state_decision\]/);
    assert.doesNotMatch(markdown, /RAW_CONTEXT_HEALTH_MARKDOWN_SHOULD_NOT_APPEAR/);

    const reviewMarkdown = await readFile(join(fixture.stateRoot, tick.review_markdown_ref), "utf8");
    assert.match(reviewMarkdown, /focus_action_chain: inspect\[read_only\] -> complete_after_repair\[state_decision\]/);
    assert.doesNotMatch(reviewMarkdown, /RAW_CONTEXT_HEALTH_MARKDOWN_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick turns skill registry health focus into runtime-gap proposal", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeRepoText("vault/skills/registry-focus/SKILL.md", [
      "---",
      "name: registry-focus",
      "description: Current registry focus fixture.",
      "---",
      "",
      "RAW_REGISTRY_FOCUS_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeRepoText("vault/registry/skills.jsonl", `${JSON.stringify({
      name: "registry-focus",
      description: "Stale registry focus fixture.",
      source: "vault",
      status: "active",
      instructions_ref: "vault/skills/registry-focus/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#registry-focus",
      origin_ref: null,
      trust_level: "local",
      source_sop_ref: null,
      references: [],
      tool_requirements: [],
      verification: "",
      evidence_refs: [],
      content_hash: "stale-hash",
      version: 1,
      usage: { use_count: 0, last_used_at: null, patch_count: 0 },
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    })}\n`);
    await store.writeRepoText("vault/registry/skill-events.jsonl", "");

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });
    const review = JSON.parse(await readFile(join(fixture.stateRoot, tick.review_ref), "utf8")) as {
      proposals: Array<{ type: string; title: string; rationale: string; evidence_refs: string[]; next_action: string }>;
    };
    const proposal = review.proposals.find((item) => item.type === "runtime_gap");

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "skill_registry_health");
    assert.equal(tick.focus.opportunity?.id, "skill_registry_health_metadata_drift_registry_focus");
    assert.equal(tick.focus.opportunity?.action_kind, "inspect_skill_registry_health");
    assert.match(tick.query ?? "", /skill_registry_issue=registry_metadata_drift/);
    assert.match(tick.query ?? "", /skill_registry_status=warning/);
    assert.match(tick.query ?? "", /skill=registry-focus/);
    assert.match(tick.query ?? "", /registry_sync=available/);
    assert.match(tick.query ?? "", /vault\/skills\/registry-focus\/SKILL\.md/);
    assert.ok(proposal);
    assert.match(proposal?.title ?? "", /Review skill registry health/);
    assert.match(proposal?.rationale ?? "", /bounded active-vault skill registry health issue/);
    assert.equal(proposal?.evidence_refs.includes("vault/skills/registry-focus/SKILL.md"), true);
    assert.match(proposal?.next_action ?? "", /Do not sync registry metadata/);
    assert.equal(tick.proposal_count, 1);
    assert.equal(tick.inbox_items.length, 1);
    assert.equal(tick.inbox_items[0]?.proposal_type, "runtime_gap");
    assert.equal(tick.inbox_items[0]?.action_kind, "narrow_review");
    assert.equal(tick.inbox_items[0]?.required_refs.includes("vault/skills/registry-focus/SKILL.md"), true);
    assert.doesNotMatch(JSON.stringify(tick), /RAW_REGISTRY_FOCUS_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(review), /RAW_REGISTRY_FOCUS_SKILL_BODY_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick turns archive health focus into runtime-gap proposal", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeText("memory/episodes/archive-focus-raw.md", "RAW_ARCHIVE_FOCUS_ARTIFACT_SHOULD_NOT_APPEAR");
    await store.writeText("memory/episodes/events.jsonl", `${JSON.stringify({
      id: "event_archive_focus",
      session_id: "session_archive_focus",
      turn_id: "turn_archive_focus",
      kind: "report",
      summary: "Durable episode maintenance should stay bounded.",
      artifact_refs: ["memory/episodes/archive-focus-raw.md"],
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });
    const review = JSON.parse(await readFile(join(fixture.stateRoot, tick.review_ref), "utf8")) as {
      proposals: Array<{ type: string; title: string; rationale: string; evidence_refs: string[]; next_action: string }>;
    };
    const proposal = review.proposals.find((item) => item.type === "runtime_gap");

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "archive_health");
    assert.equal(tick.focus.opportunity?.id, "archive_health_missing_2026_06_30");
    assert.equal(tick.focus.opportunity?.action_kind, "refresh_episode_archives");
    assert.match(tick.query ?? "", /archive_health_kind=missing_archive/);
    assert.match(tick.query ?? "", /archive_health_status=error/);
    assert.match(tick.query ?? "", /archive_source_events=1/);
    assert.match(tick.query ?? "", /archive_refresh=available/);
    assert.match(tick.query ?? "", /memory\/archives\/2026-06-30\.json/);
    assert.ok(proposal);
    assert.match(proposal?.title ?? "", /Review episode archive health/);
    assert.match(proposal?.rationale ?? "", /bounded episode archive health issue/);
    assert.equal(proposal?.evidence_refs.includes("memory/archives/2026-06-30.json"), true);
    assert.equal(proposal?.evidence_refs.includes("memory/episodes/events.jsonl"), true);
    assert.match(proposal?.next_action ?? "", /Do not refresh archives from the review tick/);
    const runtimeItem = tick.inbox_items.find((item) =>
      item.proposal_type === "runtime_gap" && item.action_kind === "narrow_review"
    );
    assert.ok(runtimeItem);
    assert.equal(runtimeItem.required_refs.includes("memory/archives/2026-06-30.json"), true);
    assert.equal(runtimeItem.required_refs.includes("memory/episodes/events.jsonl"), true);
    assert.doesNotMatch(JSON.stringify(tick), /RAW_ARCHIVE_FOCUS_ARTIFACT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(review), /RAW_ARCHIVE_FOCUS_ARTIFACT_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick selects failed selected skill outcome as bounded focus", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeRepoText("vault/skills/tick-skill-outcome/SKILL.md", [
      "---",
      "name: tick-skill-outcome",
      "description: Use when review tick should inspect failed selected skill outcomes.",
      "---",
      "",
      "RAW_TICK_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeText("memory/episodes/session_tick_skill-context.md", "RAW_TICK_CONTEXT_SHOULD_NOT_APPEAR");
    await store.writeJson("memory/skills/usage/session_tick_skill-tick-skill-outcome.json", selectedSkillOutcome({
      id: "skill_usage_tick_focus",
      skill_name: "tick-skill-outcome",
      instructions_ref: "vault/skills/tick-skill-outcome/SKILL.md",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      context_ref: "memory/episodes/session_tick_skill-context.md",
      context_manifest_ref: "memory/episodes/session_tick_skill-context.json",
      completion_report_ref: "memory/episodes/session_tick_skill-completion-verification.json",
      final_response_ref: "memory/episodes/session_tick_skill-final-response.md",
      created_at: "2026-06-30T00:00:10.000Z"
    }));

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "selected_skill_outcome");
    assert.equal(tick.focus.opportunity?.id, "skill_usage_tick_focus");
    assert.equal(tick.focus.opportunity?.action_kind, "review_skill_outcome");
    assert.match(tick.query ?? "", /tick-skill-outcome/);
    assert.match(tick.query ?? "", /verification=failed/);
    assert.match(tick.query ?? "", /memory\/skills\/usage\/session_tick_skill-tick-skill-outcome\.json/);
    assert.doesNotMatch(JSON.stringify(tick.focus), /RAW_TICK_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(tick.focus), /RAW_TICK_CONTEXT_SHOULD_NOT_APPEAR/);

    const markdown = await readFile(join(fixture.stateRoot, tick.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /focus_source: opportunity_backlog/);
    assert.match(markdown, /focus_opportunity: selected_skill_outcome:skill_usage_tick_focus/);
    assert.doesNotMatch(markdown, /RAW_TICK_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(markdown, /RAW_TICK_CONTEXT_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick turns selected skill drift into a confirmed validation follow-up", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const skillRef = "vault/skills/drift-review-skill/SKILL.md";
    await store.writeRepoText(skillRef, [
      "---",
      "name: drift-review-skill",
      "description: Use when repeated selected-skill telemetry should be reviewed.",
      "---",
      "",
      "RAW_DRIFT_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeText("memory/episodes/session_drift_a-context.md", "RAW_DRIFT_CONTEXT_A_SHOULD_NOT_APPEAR");
    await store.writeText("memory/episodes/session_drift_b-context.md", "RAW_DRIFT_CONTEXT_B_SHOULD_NOT_APPEAR");

    const firstOutcomeRef = "memory/skills/usage/session_drift_a-drift-review-skill.json";
    const secondOutcomeRef = "memory/skills/usage/session_drift_b-drift-review-skill.json";
    await store.writeJson(firstOutcomeRef, selectedSkillOutcome({
      id: "skill_usage_drift_a",
      session_id: "session_drift_a",
      skill_name: "drift-review-skill",
      instructions_ref: skillRef,
      context_ref: "memory/episodes/session_drift_a-context.md",
      context_manifest_ref: "memory/episodes/session_drift_a-context.json",
      completion_report_ref: "memory/episodes/session_drift_a-completion-verification.json",
      final_response_ref: "memory/episodes/session_drift_a-final-response.md",
      created_at: "2026-06-30T00:00:10.000Z"
    }));
    await store.writeJson(secondOutcomeRef, selectedSkillOutcome({
      id: "skill_usage_drift_b",
      session_id: "session_drift_b",
      skill_name: "drift-review-skill",
      instructions_ref: skillRef,
      context_ref: "memory/episodes/session_drift_b-context.md",
      context_manifest_ref: "memory/episodes/session_drift_b-context.json",
      completion_report_ref: "memory/episodes/session_drift_b-completion-verification.json",
      final_response_ref: "memory/episodes/session_drift_b-final-response.md",
      created_at: "2026-06-30T00:00:20.000Z"
    }));
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_drift_usage_a",
      session_id: "session_drift_a",
      turn_id: "turn_drift_a",
      kind: "skill_usage",
      summary: "Selected skill outcome drift-review-skill: completion=done; verification=failed; verified=false; verdict=completion_unverified; use_count=2.",
      artifact_refs: [
        firstOutcomeRef,
        skillRef,
        "memory/episodes/session_drift_a-context.md",
        "memory/episodes/session_drift_a-completion-verification.json"
      ],
      created_at: "2026-06-30T00:00:10.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_drift_usage_b",
      session_id: "session_drift_b",
      turn_id: "turn_drift_b",
      kind: "skill_usage",
      summary: "Selected skill outcome drift-review-skill: completion=blocked; verification=skipped; verified=false; verdict=blocked_by_operator; use_count=3.",
      artifact_refs: [
        secondOutcomeRef,
        skillRef,
        "memory/episodes/session_drift_b-context.md",
        "memory/episodes/session_drift_b-completion-verification.json"
      ],
      created_at: "2026-06-30T00:00:20.000Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      vaultRoot: {
        root: fixture.activeVault,
        seed_roots: ["vault", "skills"],
        project_roots: []
      }
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "selected_skill_drift");
    assert.equal(tick.focus.opportunity?.id, "selected_skill_drift_drift-review-skill");
    assert.equal(tick.proposal_count, 1);
    assert.equal(tick.inbox_items.length, 1);
    const item = tick.inbox_items[0];
    assert.equal(item.proposal_type, "skill_revision");
    assert.equal(item.action_kind, "revise_skill");
    assert.match(item.title, /selected-skill telemetry/);
    assert.equal(item.required_refs.includes(skillRef), true);
    assert.equal(item.required_refs.includes(firstOutcomeRef) || item.required_refs.includes(secondOutcomeRef), true);
    assert.equal(tick.inbox_items.some((candidate) => candidate.action_kind === "draft_sop"), false);
    assert.doesNotMatch(JSON.stringify(tick), /RAW_DRIFT_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(tick), /RAW_DRIFT_CONTEXT_A_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(tick), /RAW_DRIFT_CONTEXT_B_SHOULD_NOT_APPEAR/);

    const requested = await runner.requestInboxItemConfirmation({ itemRef: item.id });
    assert.equal(requested.confirmation.action_kind, "revise_skill");
    assert.match(requested.confirmation.next_step, /skills outcomes --outcome/);
    assert.match(requested.confirmation.next_step, /execute this pending confirmation/);

    const confirmed = await runner.executeConfirmedFollowUp({
      confirmationRef: requested.confirmation_ref,
      vaultRoot: {
        root: fixture.activeVault,
        seed_roots: ["vault", "skills"],
        project_roots: []
      }
    });
    assert.equal(confirmed.confirmation.status, "executed");
    assert.equal(confirmed.confirmation.execution_result?.kind, "revise_skill");
    if (!("event_refs" in confirmed.result)) throw new Error("expected skill revision validation result");
    assert.equal(confirmed.result.status, "validated");
    assert.equal(confirmed.result.skill_refs.includes(skillRef), true);

    const registryEvents = await readJsonl(join(fixture.activeVault, "registry/skill-events.jsonl"));
    assert.equal(registryEvents.some((event) => event.kind === "validated" && event.skill_name === "drift-review-skill"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick selects blocked pipeline run as bounded focus", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await writePipelineRun(store, {
      pipelineId: "pipeline_tick_focus",
      runId: "pipeline_run_tick_focus",
      status: "blocked",
      stageStatus: "blocked",
      blockedStageId: "verify",
      updatedAt: "2026-06-30T00:00:08.000Z",
      rawOutput: "RAW_TICK_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "pipeline_run");
    assert.equal(tick.focus.opportunity?.id, "pipeline_run_tick_focus");
    assert.equal(tick.focus.opportunity?.action_kind, "resume_pipeline");
    assert.match(tick.query ?? "", /pipeline_run_tick_focus/);
    assert.match(tick.query ?? "", /pipeline_blocked/);
    assert.match(tick.query ?? "", /blocked_stage=verify/);
    assert.match(tick.query ?? "", /pipelines\/pipeline_tick_focus\/checkpoint\.json/);
    assert.doesNotMatch(JSON.stringify(tick.focus), /RAW_TICK_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR/);

    const markdown = await readFile(join(fixture.stateRoot, tick.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /focus_source: opportunity_backlog/);
    assert.match(markdown, /focus_opportunity: pipeline_run:pipeline_run_tick_focus/);
    assert.doesNotMatch(markdown, /RAW_TICK_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick selects attention-worthy working checkpoint as recent bounded focus", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeText("memory/episodes/raw-working-tick.md", "RAW_WORKING_TICK_EVIDENCE_SHOULD_NOT_APPEAR");
    await store.writeJson("memory/working/current.json", {
      goal: "Continue the blocked local goal loop.",
      current_step: "blocked_tick_follow_up",
      known_constraints: ["Do not execute the checkpoint next action."],
      recent_evidence_refs: ["memory/episodes/raw-working-tick.md"],
      open_questions: ["Which bounded review should resume the loop?"],
      next_action: "Run a narrow review before resuming the blocked follow-up.",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_working_tick",
      session_id: "session_working_tick",
      turn_id: "turn_working_tick",
      kind: "report",
      summary: "Recorded model working checkpoint for later bounded review.",
      artifact_refs: [
        "memory/working/current.json",
        "memory/episodes/raw-working-tick.md"
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "working_checkpoint");
    assert.equal(tick.focus.opportunity?.id, "working_checkpoint_current");
    assert.equal(tick.focus.opportunity?.action_kind, "review_working_checkpoint");
    assert.match(tick.focus.reason, /recent working-checkpoint focus/);
    assert.equal(tick.mode, "recent");
    assert.equal(tick.query, null);
    const checkpointItem = tick.inbox_items.find((item) => item.required_refs.includes("memory/working/current.json"));
    if (!checkpointItem) throw new Error("expected working checkpoint inbox item");
    assert.equal(checkpointItem.proposal_type, "runtime_gap");
    assert.equal(checkpointItem.action_kind, "narrow_review");
    assert.equal(checkpointItem.would_write.includes("state"), true);
    assert.doesNotMatch(JSON.stringify(tick), /RAW_WORKING_TICK_EVIDENCE_SHOULD_NOT_APPEAR/);

    const markdown = await readFile(join(fixture.stateRoot, tick.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /focus_source: opportunity_backlog/);
    assert.match(markdown, /focus_opportunity: working_checkpoint:working_checkpoint_current/);
    assert.doesNotMatch(markdown, /RAW_WORKING_TICK_EVIDENCE_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick keeps recent scope when the top opportunity is waiting", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots"
    });
    await writeFakeContentImage(run.image_request.output_path);
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
      postUrl: "https://www.xiaohongshu.com/explore/waiting-review-tick"
    });
    await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "operator-screenshot:waiting-review-tick.png"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "recent");
    assert.equal(tick.focus.opportunity?.kind, "self_evolution_gap");
    assert.equal(tick.focus.opportunity?.id, `gap_post_publish_feedback_waiting_${run.id}`);
    assert.equal(tick.focus.opportunity?.status, "waiting");
    assert.match(tick.focus.reason, /waiting until/);
    assert.equal(tick.mode, "recent");
    assert.equal(tick.query, null);

    const markdown = await readFile(join(fixture.stateRoot, tick.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /focus_source: recent/);
    assert.match(
      markdown,
      new RegExp(`focus_opportunity: self_evolution_gap:gap_post_publish_feedback_waiting_${run.id}`)
    );
  } finally {
    await fixture.cleanup();
  }
});

test("review tick routes SOP-candidate self-evolution gaps into draft SOP inbox", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots"
    });
    await writeFakeContentImage(run.image_request.output_path);
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
      postUrl: "https://www.xiaohongshu.com/explore/weak-feedback-review-tick"
    });
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "operator-screenshot:weak-feedback-review-tick.png"
    });
    await store.writeJson(feedback.evidence_ref, {
      ...feedback.evidence,
      created_at: "2000-01-01T00:00:00Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "self_evolution_gap");
    assert.equal(tick.focus.opportunity?.id, `gap_post_publish_feedback_weak_${run.id}`);
    assert.equal(tick.focus.opportunity?.action_kind, "draft_sop");
    assert.equal(tick.focus.opportunity?.self_evolution_gap?.follow_up_kind, "sop_candidate");
    assert.equal(tick.focus.opportunity?.self_evolution_gap?.proposed_slice, "post_publish_feedback_review_loop");
    assert.equal(tick.mode, "query");
    assert.match(tick.focus.reason, /as review focus/);

    const gapRef = `self-evolution/gaps/gap_post_publish_feedback_weak_${run.id}.json`;
    const draftItem = tick.inbox_items.find((item) =>
      item.proposal_type === "sop_candidate"
      && item.action_kind === "draft_sop"
      && item.required_refs.includes(feedback.evidence_ref)
    );
    if (!draftItem) throw new Error("expected self-evolution draft_sop inbox item");
    assert.equal(draftItem.status, "open");
    assert.equal(draftItem.required_refs.includes(gapRef), true);
    assert.equal(draftItem.required_refs.includes(publish.evidence_ref), true);
    assert.equal(draftItem.would_write.includes("state"), true);

    const review = JSON.parse(await readFile(join(fixture.stateRoot, tick.review_ref), "utf8"));
    const selfEvolutionProposal = review.proposals.find((proposal: any) =>
      proposal.type === "sop_candidate"
      && proposal.title.includes("Draft SOP for self-evolution gap")
    );
    assert.ok(selfEvolutionProposal);
    assert.equal(selfEvolutionProposal.self_evolution_gap.gap_id, `gap_post_publish_feedback_weak_${run.id}`);
    assert.equal(selfEvolutionProposal.self_evolution_gap.proposed_slice, "post_publish_feedback_review_loop");
    assert.equal(selfEvolutionProposal.self_evolution_gap.verification_commands.some((command: string) =>
      command.includes("content feedback-strategy")
    ), true);

    const requested = await runner.requestInboxItemConfirmation({
      itemRef: draftItem.id
    });
    assert.equal(requested.confirmation.action_kind, "draft_sop");
    assert.equal(requested.confirmation.draft_sop_readiness?.status, "ready");
    assert.equal(requested.confirmation.draft_sop_readiness?.failure_signal_count, 0);
    assert.equal(requested.confirmation.draft_sop_readiness?.sop_signal_count, 0);
    assert.equal(requested.confirmation.draft_sop_readiness?.evidence_ref_count, 4);
    assert.equal(requested.confirmation.required_refs.includes(gapRef), true);

    const executed = await runner.executeConfirmedFollowUp({
      confirmationRef: requested.confirmation_ref
    });
    const draftResult = executed.result as any;
    assert.equal(draftResult.sop.evidence_refs.includes(gapRef), true);
    assert.match(draftResult.sop.trigger, /post_publish_feedback_review_loop/);
    assert.equal(draftResult.sop.procedure.some((step: string) =>
      step.includes("content feedback-strategy")
    ), true);
    assert.equal(draftResult.sop.failure_modes.some((mode: string) =>
      mode.includes("no automatic reposting")
    ), true);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick routes verified iteration outcomes into state-only SOP drafts", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const recorded = await recordSelfEvolutionIteration(store, {
      summary: "Preserve verified self-evolution outcomes as SOP candidates.",
      layer: "local_learning",
      ownerSurface: "sop_skill_memory_loop",
      proposedSlice: "verified_iteration_outcome_sop_candidate",
      sourceRef: "memory/dreams/dream_iteration.json",
      evidenceRefs: ["packages/core/src/self_evolution_iterations.ts"],
      verificationCommands: ["pnpm run check"],
      nonGoals: ["no active-vault write"]
    });
    await recordSelfEvolutionIterationOutcome(store, {
      iterationRef: recorded.iteration.id,
      status: "verified",
      summary: "The bounded iteration passed and should be reusable.",
      evidenceRefs: ["tests/background_review.test.ts"],
      verificationCommands: ["pnpm exec tsx --test tests/background_review.test.ts"],
      nextMoves: ["Route through review tick before drafting."]
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "self_evolution_gap");
    assert.equal(tick.focus.opportunity?.self_evolution_gap?.source, "iteration_outcome");
    assert.equal(tick.focus.opportunity?.self_evolution_gap?.source_ref, recorded.iteration.ref);
    assert.equal(tick.focus.opportunity?.action_kind, "draft_sop");

    const draftItem = tick.inbox_items.find((item) =>
      item.proposal_type === "sop_candidate"
      && item.action_kind === "draft_sop"
      && item.required_refs.includes(recorded.iteration.ref)
    );
    if (!draftItem) throw new Error("expected iteration outcome draft_sop inbox item");

    const executed = await runner.draftSopFromProposal({
      reviewRef: tick.review_ref,
      proposalId: draftItem.proposal_id
    });

    assert.equal(executed.sop.status, "draft");
    assert.equal(executed.sop.evidence_refs.includes(recorded.iteration.ref), true);
    assert.match(executed.sop.trigger, /verified_iteration_outcome_sop_candidate/);
    assert.equal(executed.sop.procedure.some((step) => step.includes("governance iterations")), true);
    assert.equal(executed.sop.verification.includes("tests/background_review.test.ts"), true);
    assert.equal(executed.sop.failure_modes.some((mode) => mode.includes("active-vault")), true);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick keeps source-quality self-evolution gaps as actionable backlog", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/down-a.json", "https://example.com/down-b.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => ({
        url,
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        contentType: "text/plain",
        text: "temporary outage"
      })
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "backlog_actionable");
    assert.equal(tick.focus.opportunity?.kind, "self_evolution_gap");
    assert.equal(tick.focus.opportunity?.id, `gap_active_exploration_source_quality_${run.id}`);
    assert.equal(tick.focus.opportunity?.action_kind, "act_next");
    assert.equal(tick.focus.opportunity?.self_evolution_gap?.proposed_slice, "active_exploration_source_quality_gate");
    assert.equal(tick.mode, "recent");
    assert.equal(tick.query, null);
    assert.match(tick.focus.reason, /already actionable/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick keeps act-next self-evolution gaps as actionable backlog", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/fresh-ai.json"],
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
            hits: [{ title: "Fresh AI agent launch story", created_at: recentIso(2) }]
          })
        };
      }
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "backlog_actionable");
    assert.equal(tick.focus.opportunity?.kind, "self_evolution_gap");
    assert.equal(tick.focus.opportunity?.id, `gap_external_publish_evidence_${run.id}`);
    assert.equal(tick.focus.opportunity?.action_kind, "act_next");
    assert.equal(tick.focus.opportunity?.self_evolution_gap?.proposed_slice, "external_publish_preflight_contract");
    assert.equal(tick.mode, "recent");
    assert.equal(tick.query, null);
    assert.match(tick.focus.reason, /already actionable/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick does not re-query backlog items that already require operator action", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeJson("autonomy/followups/follow_up_confirmation_tick_actionable.json", {
      id: "follow_up_confirmation_tick_actionable",
      created_at: "2026-06-30T00:00:03Z",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_actionable.json",
      proposal_id: "review_proposal_actionable",
      proposal_type: "sop_candidate",
      action_id: "follow_up_action_promote_sop_actionable",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_promote_sop_actionable",
        kind: "promote_sop",
        title: "Promote already-gated SOP",
        rationale: "This confirmation is already the actionable queue item.",
        command: null,
        required_refs: ["sop/drafts/sop_actionable.json"],
        would_write: ["state", "active_vault"]
      },
      required_refs: ["sop/drafts/sop_actionable.json"],
      would_write: ["state", "active_vault"],
      safety_boundary: ["This request records operator intent only."],
      next_step: "Review before execution."
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "backlog_actionable");
    assert.equal(tick.focus.opportunity?.kind, "review_confirmation");
    assert.equal(tick.focus.opportunity?.id, "follow_up_confirmation_tick_actionable");
    assert.equal(tick.mode, "recent");
    assert.equal(tick.query, null);
    assert.match(tick.focus.reason, /already actionable/);
  } finally {
    await fixture.cleanup();
  }
});

test("review tick skips action-only backlog items when a scoped queryable item is available", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "event_archive_after_actionable",
      session_id: "session_archive_after_actionable",
      turn_id: "turn_1",
      kind: "report",
      summary: "Archive refresh evidence should be reviewed after pending operator actions.",
      artifact_refs: ["memory/episodes/archive-after-actionable-raw.md"],
      created_at: "2026-06-30T00:00:01Z"
    });
    await store.writeText("memory/episodes/archive-after-actionable-raw.md", "RAW_ARCHIVE_AFTER_ACTIONABLE_SHOULD_NOT_APPEAR");
    await store.writeJson("autonomy/followups/follow_up_confirmation_action_only_top.json", {
      id: "follow_up_confirmation_action_only_top",
      created_at: "2026-06-30T00:00:03Z",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_action_only_top.json",
      proposal_id: "review_proposal_action_only_top",
      proposal_type: "sop_candidate",
      action_id: "follow_up_action_promote_sop_action_only_top",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_promote_sop_action_only_top",
        kind: "promote_sop",
        title: "Promote already-gated SOP",
        rationale: "This confirmation already requires operator action.",
        command: null,
        required_refs: ["sop/drafts/sop_action_only_top.json"],
        would_write: ["state", "active_vault"]
      },
      required_refs: ["sop/drafts/sop_action_only_top.json"],
      would_write: ["state", "active_vault"],
      safety_boundary: ["This request records operator intent only."],
      next_step: "Review before execution."
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const tick = await runner.runTick({ limit: 5 });

    assert.equal(tick.focus.source, "opportunity_backlog");
    assert.equal(tick.focus.opportunity?.kind, "archive_health");
    assert.match(tick.focus.reason, /skipping 1 already-actionable item/);
    assert.equal(tick.mode, "query");
    assert.match(tick.query ?? "", /archive_health_kind=missing_archive/);
    assert.doesNotMatch(JSON.stringify(tick), /RAW_ARCHIVE_AFTER_ACTIONABLE_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("background review executes confirmed narrow review follow-ups once", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    for (let index = 0; index < 10; index += 1) {
      await store.appendJsonl("memory/episodes/events.jsonl", {
        id: `evidence_runtime_${index}`,
        session_id: index % 2 === 0 ? "session_alpha" : "session_beta",
        turn_id: `turn_${index}`,
        kind: "report",
        summary: `Routine runtime observation ${index} for broad recent review.`,
        artifact_refs: [`memory/episodes/session_${index}.json`],
        created_at: `2026-06-29T00:00:${String(index + 1).padStart(2, "0")}Z`
      });
    }

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const report = await runner.run({ limit: 20 });
    const proposal = report.proposals.find((item) => item.type === "runtime_gap");
    assert.ok(proposal);
    const plan = await runner.planProposalFollowUp({
      reviewRef: report.id,
      proposalId: proposal.id
    });
    const action = plan.actions.find((item) => item.kind === "narrow_review");
    if (!action) throw new Error("expected narrow_review follow-up action");
    assert.deepEqual(action.would_write, ["state"]);

    const confirmation = await runner.requestFollowUpConfirmation({
      reviewRef: report.id,
      proposalId: proposal.id,
      actionId: action.id
    });
    assert.equal(confirmation.confirmation.status, "pending");
    assert.equal(confirmation.confirmation.action_kind, "narrow_review");
    const executed = await runner.executeConfirmedFollowUp({
      confirmationRef: confirmation.confirmation_ref
    });

    assert.equal(executed.confirmation.status, "executed");
    assert.equal(executed.confirmation.execution_result?.kind, "narrow_review");
    if (executed.confirmation.execution_result?.kind !== "narrow_review") {
      throw new Error("expected narrow_review execution summary");
    }
    if (!("mode" in executed.result)) throw new Error("expected background review result");
    assert.equal(executed.result.mode, "query");
    assert.equal(executed.result.query, proposal.title);
    assert.equal(executed.result.artifact_refs.json_ref, executed.confirmation.execution_result.review_ref);
    assert.equal(executed.result.evidence_event_id, executed.confirmation.execution_result.evidence_event_id);
    assert.equal(existsSync(join(fixture.stateRoot, executed.confirmation.execution_result.review_ref)), true);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: confirmation.confirmation_ref
      }),
      /not pending/
    );

    const confirmationMarkdown = await readFile(join(fixture.stateRoot, executed.confirmation_markdown_ref), "utf8");
    assert.match(confirmationMarkdown, /Kind: narrow_review/);
    assert.match(confirmationMarkdown, /Review markdown:/);

    const rawEvents = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(rawEvents, /Executed confirmed narrow_review follow-up action/);
    assert.match(rawEvents, /state review written and active vault unchanged/);
  } finally {
    await fixture.cleanup();
  }
});

test("background review explicitly drafts state-only SOP candidates from eligible proposals", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_1",
      session_id: "session_review",
      turn_id: "turn_1",
      kind: "audit_result",
      summary: "Completion verification blocked SOP audit because the model claim was unverified.",
      artifact_refs: ["memory/episodes/session_review-model-action-r1.json"],
      created_at: "2026-06-29T00:00:02Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const report = await runner.run({ query: "unverified", limit: 5 });
    const proposal = report.proposals.find((item) => item.type === "sop_candidate");
    assert.ok(proposal);

    const result = await runner.draftSopFromProposal({
      reviewRef: report.id,
      proposalId: proposal.id
    });

    assert.equal(result.review_ref, `autonomy/reviews/${report.id}.json`);
    assert.equal(result.proposal_id, proposal.id);
    assert.equal(result.sop.status, "draft");
    assert.equal(result.sop.evidence_refs.includes(`autonomy/reviews/${report.id}.json`), true);
    assert.equal(result.sop_json_ref, `sop/drafts/${result.sop.id}.json`);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);

    const sopMarkdown = await readFile(join(fixture.stateRoot, result.sop_ref), "utf8");
    assert.match(sopMarkdown, /Draft an SOP for recurring blocked or failed runtime paths/);
    assert.match(sopMarkdown, /Keep this draft in state until a later explicit audit or promotion step accepts it/);

    const sopJson = JSON.parse(await readFile(join(fixture.stateRoot, result.sop_json_ref), "utf8")) as { id: string };
    assert.equal(sopJson.id, result.sop.id);

    const audit = await runner.auditSopDraft({ sopRef: result.sop.id });
    assert.equal(audit.sop_ref, result.sop_json_ref);
    assert.equal(audit.audit.target_ref, result.sop.id);
    assert.equal(audit.audit.verdict, "promote");
    assert.equal(audit.audit_ref, `governance/audits/${audit.audit.id}.json`);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);

    const rawEvents = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(rawEvents, /Drafted state-only SOP candidate/);
    assert.match(rawEvents, /State-only SOP audit verdict/);
  } finally {
    await fixture.cleanup();
  }
});

test("background review executes confirmed draft SOP follow-ups once", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_1",
      session_id: "session_review",
      turn_id: "turn_1",
      kind: "audit_result",
      summary: "Completion verification blocked SOP audit because the model claim was unverified.",
      artifact_refs: ["memory/episodes/session_review-model-action-r1.json"],
      created_at: "2026-06-29T00:00:02Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const report = await runner.run({ query: "unverified", limit: 5 });
    const proposal = report.proposals.find((item) => item.type === "sop_candidate");
    assert.ok(proposal);
    const plan = await runner.planProposalFollowUp({
      reviewRef: report.id,
      proposalId: proposal.id
    });
    const draftAction = plan.actions.find((action) => action.kind === "draft_sop");
    if (!draftAction) throw new Error("expected draft_sop follow-up action");
    assert.deepEqual(draftAction.would_write, ["state"]);

    const confirmation = await runner.requestFollowUpConfirmation({
      reviewRef: report.id,
      proposalId: proposal.id,
      actionId: draftAction.id
    });
    assert.equal(confirmation.confirmation.status, "pending");
    assert.equal(confirmation.confirmation.action_kind, "draft_sop");
    const confirmedDraft = await runner.executeConfirmedFollowUp({
      confirmationRef: confirmation.confirmation_ref
    });

    assert.equal(confirmedDraft.confirmation.status, "executed");
    assert.equal(confirmedDraft.confirmation.execution_result?.kind, "draft_sop");
    if (confirmedDraft.confirmation.execution_result?.kind !== "draft_sop") throw new Error("expected draft_sop execution summary");
    if (!("sop" in confirmedDraft.result)) throw new Error("expected SOP draft result");
    assert.equal(confirmedDraft.result.sop.status, "draft");
    assert.equal(confirmedDraft.result.sop_json_ref, confirmedDraft.confirmation.execution_result.sop_json_ref);
    assert.equal(confirmedDraft.result.sop_ref, confirmedDraft.confirmation.execution_result.sop_ref);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: confirmation.confirmation_ref
      }),
      /not pending/
    );

    const confirmationMarkdown = await readFile(join(fixture.stateRoot, confirmedDraft.confirmation_markdown_ref), "utf8");
    assert.match(confirmationMarkdown, /Kind: draft_sop/);
    assert.match(confirmationMarkdown, /SOP JSON:/);

    const rawEvents = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(rawEvents, /Drafted state-only SOP candidate/);
    assert.match(rawEvents, /Executed confirmed draft_sop follow-up action/);
  } finally {
    await fixture.cleanup();
  }
});

test("background review promotes audited SOP drafts through an explicit vault gate", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_1",
      session_id: "session_review",
      turn_id: "turn_1",
      kind: "audit_result",
      summary: "Completion verification blocked SOP audit because the model claim was unverified.",
      artifact_refs: ["memory/episodes/session_review-model-action-r1.json"],
      created_at: "2026-06-29T00:00:02Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const report = await runner.run({ query: "unverified", limit: 5 });
    const proposal = report.proposals.find((item) => item.type === "sop_candidate");
    assert.ok(proposal);

    const draft = await runner.draftSopFromProposal({
      reviewRef: report.id,
      proposalId: proposal.id
    });

    const draftedReview = await runner.run({ query: draft.sop.id, limit: 5 });
    const draftedProposal = draftedReview.proposals.find((item) => item.type === "sop_candidate");
    assert.ok(draftedProposal);
    const draftedPlan = await runner.planProposalFollowUp({
      reviewRef: draftedReview.id,
      proposalId: draftedProposal.id
    });
    const auditAction = draftedPlan.actions.find((action) => action.kind === "audit_sop");
    if (!auditAction) throw new Error("expected audit_sop follow-up action");
    const auditConfirmation = await runner.requestFollowUpConfirmation({
      reviewRef: draftedReview.id,
      proposalId: draftedProposal.id,
      actionId: auditAction.id
    });
    assert.equal(auditConfirmation.confirmation.status, "pending");
    assert.equal(auditConfirmation.confirmation.execution_allowed, false);
    const confirmedAudit = await runner.executeConfirmedFollowUp({
      confirmationRef: auditConfirmation.confirmation_ref
    });
    assert.equal(confirmedAudit.confirmation.status, "executed");
    assert.equal(confirmedAudit.confirmation.execution_result?.kind, "audit_sop");
    assert.equal(confirmedAudit.result.sop_ref, draft.sop_json_ref);
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: auditConfirmation.confirmation_ref
      }),
      /not pending/
    );
    if (!("audit" in confirmedAudit.result)) throw new Error("expected SOP audit result");
    const audit = confirmedAudit.result;

    const auditedReview = await runner.run({ query: "SOP audit verdict", limit: 5 });
    const auditedChain = auditedReview.chain_summaries.find((item) => item.sop_id === draft.sop.id);
    assert.equal(auditedChain?.latest_decision, "audited");
    assert.equal(auditedChain?.audit_count, 1);
    const auditedProposal = auditedReview.proposals.find((item) => item.title === "Complete audited SOP promotion decisions");
    assert.ok(auditedProposal);
    const eventsBeforeAuditedPlan = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    const auditedPlan = await runner.planProposalFollowUp({
      reviewRef: auditedReview.id,
      proposalId: auditedProposal.id
    });
    const auditedPlanAgain = await runner.planProposalFollowUp({
      reviewRef: auditedReview.id,
      proposalId: auditedProposal.id
    });
    const eventsAfterAuditedPlan = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.equal(eventsAfterAuditedPlan, eventsBeforeAuditedPlan);
    assert.equal(auditedPlan.dry_run, true);
    assert.deepEqual(auditedPlanAgain.actions, auditedPlan.actions);
    assert.match(auditedPlan.actions[0]?.id ?? "", /^follow_up_action_/);
    assert.equal(auditedPlan.actions.some((action) => action.kind === "promote_sop" && action.command?.includes("review promote-sop")), true);
    assert.deepEqual(auditedPlan.actions.find((action) => action.kind === "promote_sop")?.would_write, ["state", "active_vault"]);
    const inspectAction = auditedPlan.actions.find((action) => action.kind === "inspect_chain");
    if (!inspectAction) throw new Error("expected inspect_chain follow-up action");
    const executedInspect = await runner.executeFollowUpAction({
      reviewRef: auditedReview.id,
      proposalId: auditedProposal.id,
      actionId: inspectAction.id
    });
    assert.equal(executedInspect.read_only, true);
    assert.equal(executedInspect.action_id, inspectAction.id);
    assert.equal(executedInspect.result.sop.id, draft.sop.id);
    const promoteAction = auditedPlan.actions.find((action) => action.kind === "promote_sop");
    if (!promoteAction) throw new Error("expected promote_sop follow-up action");
    await assert.rejects(
      () => runner.executeFollowUpAction({
        reviewRef: auditedReview.id,
        proposalId: auditedProposal.id,
        actionId: promoteAction.id
      }),
      /not read-only executable/
    );
    const eventsAfterAuditedExecute = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.equal(eventsAfterAuditedExecute, eventsBeforeAuditedPlan);
    const confirmation = await runner.requestFollowUpConfirmation({
      reviewRef: auditedReview.id,
      proposalId: auditedProposal.id,
      actionId: promoteAction.id
    });
    assert.equal(confirmation.confirmation.status, "pending");
    assert.equal(confirmation.confirmation.execution_allowed, false);
    assert.equal(confirmation.confirmation.action_id, promoteAction.id);
    assert.deepEqual(confirmation.confirmation.would_write, ["state", "active_vault"]);
    assert.equal(existsSync(join(fixture.stateRoot, confirmation.confirmation_ref)), true);
    assert.equal(existsSync(join(fixture.stateRoot, confirmation.confirmation_markdown_ref)), true);
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: confirmation.confirmation_ref
      }),
      /requires vaultRoot/
    );
    await assert.rejects(
      () => runner.requestFollowUpConfirmation({
        reviewRef: auditedReview.id,
        proposalId: auditedProposal.id,
        actionId: inspectAction.id
      }),
      /does not require mutation confirmation/
    );
    const eventsAfterConfirmation = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(eventsAfterConfirmation, new RegExp(confirmation.evidence_event_id));
    assert.match(eventsAfterConfirmation, /Requested mutation confirmation/);

    const confirmedPromotion = await runner.executeConfirmedFollowUp({
      confirmationRef: confirmation.confirmation_ref,
      vaultRoot: {
        root: fixture.activeVault,
        seed_roots: ["vault", "skills"],
        project_roots: []
      },
      promotionEnabled: true,
      skillName: "review-runtime-failures"
    });
    assert.equal(confirmedPromotion.confirmation.status, "executed");
    assert.equal(confirmedPromotion.confirmation.execution_result?.kind, "promote_sop");
    if (confirmedPromotion.confirmation.execution_result?.kind !== "promote_sop") {
      throw new Error("expected promote_sop execution summary");
    }
    assert.equal(confirmedPromotion.confirmation.execution_result.status, "promoted");
    if (!("skill_name" in confirmedPromotion.result)) throw new Error("expected SOP promotion result");
    const promoted = confirmedPromotion.result;
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: confirmation.confirmation_ref,
        vaultRoot: {
          root: fixture.activeVault,
          seed_roots: ["vault", "skills"],
          project_roots: []
        },
        promotionEnabled: true
      }),
      /not pending/
    );

    const skillRef = join(fixture.activeVault, "skills/review-runtime-failures/SKILL.md");
    assert.equal(promoted.status, "promoted");
    assert.equal(promoted.skill_ref, skillRef);
    assert.equal(promoted.sop.status, "promoted");
    assert.equal(existsSync(skillRef), true);
    assert.equal(existsSync(join(fixture.repoRoot, "vault/skills/review-runtime-failures/SKILL.md")), false);

    const registry = await readJsonl(join(fixture.activeVault, "registry/skills.jsonl"));
    assert.equal(registry.length, 1);
    assert.equal(registry[0].name, "review-runtime-failures");
    assert.equal(registry[0].version, 1);

    const skipped = await runner.promoteAuditedSopDraft({
      sopRef: draft.sop.id,
      auditRef: audit.audit_ref,
      vaultRoot: {
        root: fixture.activeVault,
        seed_roots: ["vault", "skills"],
        project_roots: []
      },
      promotionEnabled: true
    });
    assert.equal(skipped.status, "reused_skill");
    assert.equal(skipped.duplicate_skill_ref, skillRef);
    assert.equal(skipped.sop.status, "promoted");

    const chain = await runner.getSopChain({ sopRef: draft.sop.id });
    assert.equal(chain.sop.id, draft.sop.id);
    assert.equal(chain.status.sop_status, "promoted");
    assert.equal(chain.status.latest_decision, "promoted");
    assert.equal(chain.status.audit_count, 1);
    assert.equal(chain.status.promotion_events, 1);
    assert.equal(chain.status.reuse_events, 1);
    assert.equal(chain.review_refs.includes(`autonomy/reviews/${report.id}.json`), true);
    assert.equal(chain.audit_refs.includes(audit.audit_ref), true);
    assert.equal(chain.skill_refs.includes(skillRef), true);
    assert.equal(chain.duplicate_skill_refs.includes(skillRef), true);
    assert.equal(chain.events.some((event) => /Drafted state-only SOP candidate/.test(event.summary)), true);
    assert.equal(chain.events.some((event) => /Promoted audited state SOP/.test(event.summary)), true);

    const eventsBeforeCoverage = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    const coverageRunner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      vaultRoot: {
        root: fixture.activeVault,
        seed_roots: ["vault", "skills"],
        project_roots: []
      }
    });
    const coverage = await coverageRunner.getReusedSkillCoverage({ sopRef: draft.sop.id });
    const eventsAfterCoverage = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.equal(eventsAfterCoverage, eventsBeforeCoverage);
    assert.equal(coverage.read_only, true);
    assert.equal(coverage.sop_id, draft.sop.id);
    assert.equal(coverage.coverage_status, "covered");
    assert.equal(coverage.current_duplicate_skill_ref, skillRef);
    assert.equal(coverage.recorded_duplicate_skill_refs.includes(skillRef), true);
    assert.equal(coverage.current_recall_hits.some((hit) => hit.instructions_ref === skillRef && hit.current_duplicate), true);
    assert.match(coverage.next_step, /No revise_skill action is needed/);

    const chainAwareReview = await runner.run({ query: "explicit SOP promotion", limit: 5 });
    const promotedChain = chainAwareReview.chain_summaries.find((item) => item.sop_id === draft.sop.id);
    assert.equal(promotedChain?.latest_decision, "promoted");
    assert.equal(promotedChain?.promotion_events, 1);
    assert.equal(promotedChain?.reuse_events, 1);
    const reuseProposal = chainAwareReview.proposals.find((item) => item.title === "Review reused-skill coverage before changing SOPs");
    assert.equal(reuseProposal, undefined);

    const rawEvents = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(rawEvents, /Promoted audited state SOP/);
    assert.match(rawEvents, /Executed confirmed promote_sop follow-up action/);
    assert.match(rawEvents, /Skipped explicit SOP promotion because recalled skill already covers this SOP/);
    assert.doesNotMatch(rawEvents, /Validated reused-skill coverage/);
    assert.doesNotMatch(rawEvents, /Executed confirmed revise_skill follow-up action/);
  } finally {
    await fixture.cleanup();
  }
});

test("reused skill coverage treats historical duplicate refs as evidence after successful promotion", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    const staleSkillRef = join(fixture.activeVault, "skills/capability-self-recognition-guard/SKILL.md");
    const promotedSkillRef = join(fixture.activeVault, "skills/verified-iteration-outcome-sop-candidate/SKILL.md");
    await store.writeJson("sop/drafts/sop_promoted_after_reuse.json", {
      id: "sop_promoted_after_reuse",
      title: "Draft SOP for self-evolution gap: verified_iteration_outcome_sop_candidate",
      trigger: "Use when verified iteration outcomes need GA project-design artifact review.",
      procedure: [
        "Inspect the verified iteration outcome.",
        "Keep draft, audit, promote, and skill gates explicit."
      ],
      required_tools: ["review.coverage", "review.promote-sop"],
      verification: "Verify the promoted verified iteration outcome skill is current.",
      failure_modes: ["Do not treat historical reused-skill refs as current drift after successful promotion."],
      evidence_refs: ["self-evolution/iterations/iteration_contract_test.json"],
      revision: 1,
      status: "promoted",
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:01.000Z"
    });
    await store.writeRepoText(staleSkillRef, [
      "---",
      "name: capability-self-recognition-guard",
      "description: Use when operator corrections distinguish core GA project design from application tool adapters.",
      "---",
      "",
      "Historical stale skill."
    ].join("\n"));
    await store.writeRepoText(promotedSkillRef, [
      "---",
      "name: verified-iteration-outcome-sop-candidate",
      "description: Use when verified iteration outcomes need GA project-design artifact review and explicit SOP gates.",
      "---",
      "",
      "Current promoted skill."
    ].join("\n"));
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_historical_reuse",
      session_id: "sop_promoted_after_reuse",
      turn_id: "audit_promoted_after_reuse",
      kind: "report",
      summary: "Skipped explicit SOP promotion because recalled skill already covers this SOP: capability-self-recognition-guard.",
      artifact_refs: [
        "sop/drafts/sop_promoted_after_reuse.json",
        staleSkillRef
      ],
      created_at: "2026-06-30T00:00:00.500Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_promoted_after_reuse",
      session_id: "sop_promoted_after_reuse",
      turn_id: "audit_promoted_after_reuse",
      kind: "report",
      summary: "Promoted audited state SOP sop_promoted_after_reuse into vault skill verified-iteration-outcome-sop-candidate.",
      artifact_refs: [
        "sop/drafts/sop_promoted_after_reuse.json",
        promotedSkillRef
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await store.appendRepoJsonl(join(fixture.activeVault, "registry/skill-events.jsonl"), {
      id: "skill_event_promoted_after_reuse",
      kind: "promoted",
      skill_name: "verified-iteration-outcome-sop-candidate",
      instructions_ref: promotedSkillRef,
      source_sop_ref: join(fixture.activeVault, "sop/promoted/sop_promoted_after_reuse.md"),
      audit_ref: null,
      evidence_refs: ["sop/drafts/sop_promoted_after_reuse.json"],
      artifact_refs: [
        promotedSkillRef,
        "sop/drafts/sop_promoted_after_reuse.json"
      ],
      summary: "Promoted audited SOP sop_promoted_after_reuse into vault skill verified-iteration-outcome-sop-candidate.",
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      vaultRoot: {
        root: fixture.activeVault,
        seed_roots: ["vault", "skills"],
        project_roots: []
      }
    });
    const coverage = await runner.getReusedSkillCoverage({ sopRef: "sop_promoted_after_reuse" });

    assert.equal(coverage.latest_decision, "promoted");
    assert.equal(coverage.coverage_status, "covered");
    assert.equal(coverage.current_duplicate_skill_ref, promotedSkillRef);
    assert.equal(coverage.recorded_duplicate_skill_refs.includes(staleSkillRef), true);
    assert.match(coverage.summary, /historical reused-skill refs remain evidence only/);
    assert.match(coverage.next_step, /No revise_skill action is needed/);
  } finally {
    await fixture.cleanup();
  }
});

test("background review requests and executes SOP evolution next-command confirmations", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.ensureLayout();
    await store.writeJson("sop/drafts/sop_direct_gate.json", {
      id: "sop_direct_gate",
      title: "Confirm SOP evolution next commands",
      trigger: "Use when an open SOP evolution chain should be advanced through the explicit confirmation gate.",
      procedure: [
        "Request a confirmation from the current SOP Evolution Ledger next command.",
        "Execute the confirmation only after revalidating the chain still has the same command.",
        "Record audit or promotion evidence before marking the confirmation executed."
      ],
      required_tools: ["review.request-sop-confirmation", "review.execute-confirmed-follow-up"],
      verification: "The confirmation writes only after explicit execution, and stale confirmations are rejected.",
      failure_modes: [
        "If the chain no longer exposes the same command, revise the SOP and request a fresh confirmation.",
        "If promotion is not enabled, leave the SOP unpromoted and rerun only after the operator enables the gate."
      ],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "draft"
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const auditRequest = await runner.requestSopNextCommandConfirmation({ sopRef: "sop_direct_gate" });
    assert.equal(auditRequest.confirmation.source, "sop_evolution_chain");
    assert.equal(auditRequest.confirmation.action_kind, "audit_sop");
    assert.equal(auditRequest.confirmation.sop_id, "sop_direct_gate");
    assert.match(auditRequest.confirmation.action.command ?? "", /review audit-sop --sop sop_direct_gate/);
    assert.match(auditRequest.confirmation.next_step, /review execute-confirmed-follow-up --confirmation autonomy\/followups\//);
    assert.equal(existsSync(join(fixture.stateRoot, auditRequest.confirmation_ref)), true);
    const pendingSummaries = await runner.listReviewFollowUpConfirmations({ limit: 10 });
    const auditSummary = pendingSummaries.confirmations.find((item) => item.id === auditRequest.confirmation.id);
    if (!auditSummary) throw new Error("expected SOP evolution confirmation summary");
    assert.equal(auditSummary.source, "sop_evolution_chain");
    assert.equal(auditSummary.sop_id, "sop_direct_gate");
    assert.equal(auditSummary.sop_ref, "sop/drafts/sop_direct_gate.json");
    assert.equal(auditSummary.sop_evolution_gate?.status, "current");
    assert.equal(auditSummary.sop_evolution_gate?.reason_code, "current_next_command_match");
    assert.equal(auditSummary.sop_evolution_gate?.current_action_kind, "audit_sop");
    const currentSummaries = await runner.listReviewFollowUpConfirmations({
      limit: 10,
      sopEvolutionGate: "current"
    });
    assert.equal(currentSummaries.sop_evolution_gate_filter, "current");
    assert.equal(currentSummaries.total_matches, 1);
    assert.equal(currentSummaries.sop_evolution_gate_summary.current, 1);
    assert.equal(currentSummaries.sop_evolution_gate_summary.reasons[0]?.reason_code, "current_next_command_match");
    assert.equal(currentSummaries.confirmations.length, 1);
    assert.equal(currentSummaries.confirmations[0]?.id, auditRequest.confirmation.id);

    const confirmedAudit = await runner.executeConfirmedFollowUp({
      confirmationRef: auditRequest.confirmation_ref
    });
    assert.equal(confirmedAudit.confirmation.status, "executed");
    assert.equal(confirmedAudit.confirmation.source, "sop_evolution_chain");
    assert.equal(confirmedAudit.confirmation.execution_result?.kind, "audit_sop");
    if (!("audit" in confirmedAudit.result)) throw new Error("expected SOP audit result");

    const staleRequest = await runner.requestSopNextCommandConfirmation({ sopRef: "sop_direct_gate" });
    assert.equal(staleRequest.confirmation.action_kind, "promote_sop");
    await store.writeJson("sop/drafts/sop_direct_gate.json", {
      ...(JSON.parse(await readFile(join(fixture.stateRoot, "sop/drafts/sop_direct_gate.json"), "utf8")) as Record<string, unknown>),
      status: "retired"
    });
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: staleRequest.confirmation_ref,
        vaultRoot: {
          root: fixture.activeVault,
          seed_roots: ["vault", "skills"],
          project_roots: []
        },
        promotionEnabled: true
      }),
      /no confirmable next command|action changed|required refs changed|write boundary changed/
    );
    const staleRead = await runner.getReviewFollowUpConfirmation({
      confirmationRef: staleRequest.confirmation_ref
    });
    assert.equal(staleRead.sop_evolution_gate?.status, "stale");
    assert.equal(staleRead.sop_evolution_gate?.reason_code, "next_command_missing");
    assert.match(staleRead.sop_evolution_gate?.reason ?? "", /no confirmable next command|action changed|required refs changed|write boundary changed/);
    assert.equal(staleRead.sop_evolution_recovery?.action, "request_fresh_sop_confirmation");
    assert.equal(staleRead.sop_evolution_recovery?.sop_id, "sop_direct_gate");
    assert.equal(staleRead.sop_evolution_recovery?.sop_ref, "sop/drafts/sop_direct_gate.json");
    assert.match(staleRead.sop_evolution_recovery?.request_command ?? "", /review request-sop-confirmation --sop sop_direct_gate/);
    assert.equal(staleRead.sop_evolution_recovery?.playbook.reason_code, "next_command_missing");
    assert.match(staleRead.sop_evolution_recovery?.playbook.summary ?? "", /no confirmable next command/);
    assert.match(staleRead.sop_evolution_recovery?.playbook.inspect_command ?? "", /governance evolution/);
    assert.equal(staleRead.sop_evolution_recovery?.playbook.next_steps.some((step) => /Do not execute the stale confirmation/.test(step)), true);
    assert.match(staleRead.sop_evolution_recovery?.decision_command ?? "", /review decide-sop-recovery --confirmation autonomy\/followups\//);
    const historicalDecision = await runner.decideSopRecovery({
      confirmationRef: staleRequest.confirmation_ref,
      status: "historical",
      reason: "The SOP was retired after the confirmation was requested."
    });
    assert.equal(historicalDecision.action, "decide-sop-recovery");
    assert.equal(historicalDecision.confirmation_ref, staleRequest.confirmation_ref);
    assert.equal(historicalDecision.sop_id, "sop_direct_gate");
    assert.equal(historicalDecision.previous_status, "none");
    assert.equal(historicalDecision.status, "historical");
    assert.equal(historicalDecision.decision_ref, "autonomy/sop-recovery-decisions.jsonl#1");
    const deferredDecision = await runner.decideSopRecovery({
      confirmationRef: staleRequest.confirmation_ref,
      status: "deferred",
      reason: "Waiting for a fresh ledger inspection before requesting a replacement."
    });
    assert.equal(deferredDecision.previous_status, "historical");
    assert.equal(deferredDecision.decision_ref, "autonomy/sop-recovery-decisions.jsonl#2");
    const staleReadWithDecision = await runner.getReviewFollowUpConfirmation({
      confirmationRef: staleRequest.confirmation_ref
    });
    assert.equal(staleReadWithDecision.sop_evolution_recovery?.latest_decision?.status, "deferred");
    assert.equal(staleReadWithDecision.sop_evolution_recovery?.latest_decision?.previous_status, "historical");
    assert.equal(staleReadWithDecision.sop_evolution_recovery?.latest_decision?.ref, "autonomy/sop-recovery-decisions.jsonl#2");
    const decisionLog = await readFile(join(fixture.stateRoot, "autonomy/sop-recovery-decisions.jsonl"), "utf8");
    assert.match(decisionLog, /The SOP was retired/);
    assert.match(decisionLog, /Waiting for a fresh ledger inspection/);
    const staleSummaries = await runner.listReviewFollowUpConfirmations({
      limit: 10,
      sopEvolutionGate: "stale"
    });
    assert.equal(staleSummaries.sop_evolution_gate_filter, "stale");
    assert.equal(staleSummaries.total_matches, 1);
    assert.equal(staleSummaries.sop_evolution_gate_summary.stale, 1);
    assert.equal(staleSummaries.sop_evolution_gate_summary.reasons[0]?.reason_code, "next_command_missing");
    assert.equal(staleSummaries.confirmations.length, 1);
    assert.equal(staleSummaries.confirmations[0]?.id, staleRequest.confirmation.id);
    assert.equal(staleSummaries.confirmations[0]?.sop_evolution_recovery?.action, "request_fresh_sop_confirmation");
    assert.match(staleSummaries.confirmations[0]?.sop_evolution_recovery?.request_command ?? "", /review request-sop-confirmation --sop sop_direct_gate/);
    assert.equal(staleSummaries.confirmations[0]?.sop_evolution_recovery?.playbook.reason_code, "next_command_missing");
    assert.equal(staleSummaries.confirmations[0]?.sop_evolution_recovery?.latest_decision?.status, "deferred");
    const executedSopSummaries = await runner.listReviewFollowUpConfirmations({
      limit: 10,
      sopEvolutionGate: "executed"
    });
    assert.equal(executedSopSummaries.sop_evolution_gate_filter, "executed");
    assert.equal(executedSopSummaries.total_matches, 1);
    assert.equal(executedSopSummaries.sop_evolution_gate_summary.executed, 1);
    assert.equal(executedSopSummaries.sop_evolution_gate_summary.reasons[0]?.reason_code, "confirmation_executed");
    assert.equal(executedSopSummaries.confirmations.length, 1);
    assert.equal(executedSopSummaries.confirmations[0]?.id, auditRequest.confirmation.id);

    await store.writeJson("sop/drafts/sop_direct_gate.json", {
      ...(JSON.parse(await readFile(join(fixture.stateRoot, "sop/drafts/sop_direct_gate.json"), "utf8")) as Record<string, unknown>),
      status: "audited"
    });
    const promoteRequest = await runner.requestSopNextCommandConfirmation({ sopRef: "sop_direct_gate" });
    assert.equal(promoteRequest.confirmation.action_kind, "promote_sop");
    assert.deepEqual(promoteRequest.confirmation.would_write, ["state", "active_vault"]);
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: promoteRequest.confirmation_ref
      }),
      /requires vaultRoot/
    );

    const confirmedPromotion = await runner.executeConfirmedFollowUp({
      confirmationRef: promoteRequest.confirmation_ref,
      vaultRoot: {
        root: fixture.activeVault,
        seed_roots: ["vault", "skills"],
        project_roots: []
      },
      promotionEnabled: true,
      skillName: "confirm-sop-evolution-next-commands"
    });
    assert.equal(confirmedPromotion.confirmation.status, "executed");
    assert.equal(confirmedPromotion.confirmation.source, "sop_evolution_chain");
    assert.equal(confirmedPromotion.confirmation.execution_result?.kind, "promote_sop");
    if (!("skill_ref" in confirmedPromotion.result)) throw new Error("expected SOP promotion result");
    assert.equal(confirmedPromotion.result.status, "promoted");
    assert.equal(existsSync(join(fixture.activeVault, "skills/confirm-sop-evolution-next-commands/SKILL.md")), true);

    const rawEvents = await readFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(rawEvents, /Requested SOP evolution confirmation/);
    assert.match(rawEvents, /Executed confirmed audit_sop follow-up action/);
    assert.match(rawEvents, /Executed confirmed promote_sop follow-up action/);
  } finally {
    await fixture.cleanup();
  }
});

test("background review stays proposal-only when no episode evidence exists", async () => {
  const fixture = await createFixture();
  try {
    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const report = await runner.run({ limit: 5 });

    assert.equal(report.mode, "recent");
    assert.equal(report.stats.events_reviewed, 0);
    assert.deepEqual(report.proposals.map((proposal) => proposal.type), ["memory_gap"]);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);
    const plan = await runner.planProposalFollowUp({
      reviewRef: report.id,
      proposalId: report.proposals[0].id
    });
    const collectAction = plan.actions.find((action) => action.kind === "collect_evidence");
    if (!collectAction) throw new Error("expected collect_evidence follow-up action");
    assert.deepEqual(collectAction.would_write, ["state"]);
    const confirmation = await runner.requestFollowUpConfirmation({
      reviewRef: report.id,
      proposalId: report.proposals[0].id,
      actionId: collectAction.id
    });
    assert.equal(confirmation.confirmation.status, "pending");
    assert.equal(confirmation.confirmation.action_kind, "collect_evidence");
    const executed = await runner.executeConfirmedFollowUp({
      confirmationRef: confirmation.confirmation_ref
    });
    assert.equal(executed.confirmation.status, "executed");
    assert.equal(executed.confirmation.execution_result?.kind, "collect_evidence");
    if (executed.confirmation.execution_result?.kind !== "collect_evidence") {
      throw new Error("expected collect_evidence execution summary");
    }
    if (!("recommended_intake" in executed.result)) throw new Error("expected evidence collection report");
    assert.equal(executed.result.proposal_type, "memory_gap");
    assert.equal(executed.result.artifact_refs.json_ref, executed.confirmation.execution_result.report_ref);
    assert.equal(executed.result.evidence_event_id, executed.confirmation.execution_result.evidence_event_id);
    assert.equal(existsSync(join(fixture.stateRoot, executed.confirmation.execution_result.report_ref)), true);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);
    await assert.rejects(
      () => runner.executeConfirmedFollowUp({
        confirmationRef: confirmation.confirmation_ref
      }),
      /not pending/
    );
    const reportMarkdown = await readFile(join(fixture.stateRoot, executed.confirmation.execution_result.report_markdown_ref), "utf8");
    assert.match(reportMarkdown, /Evidence Collection/);
    assert.match(reportMarkdown, /Recommended Intake/);
    await assert.rejects(
      () => runner.draftSopFromProposal({
        reviewRef: report.artifact_refs.json_ref,
        proposalId: report.proposals[0].id
      }),
      /no evidence refs/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("background review turns latest working checkpoint into a gated runtime proposal", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeText("memory/episodes/raw-checkpoint-evidence.md", "RAW_CHECKPOINT_DETAIL_SHOULD_NOT_APPEAR");
    await store.writeJson("memory/working/current.json", {
      goal: "Continue the local self-evolution loop.",
      current_step: "plan checkpoint follow-up intake",
      known_constraints: ["Keep the proposal state-only."],
      recent_evidence_refs: ["memory/episodes/raw-checkpoint-evidence.md"],
      open_questions: ["Should this become a reusable SOP?"],
      next_action: "Run a narrow review before drafting any SOP."
    });

    const runner = new BackgroundReviewRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot
    });
    const report = await runner.run({ limit: 5 });
    const checkpointProposal = report.proposals.find((proposal) => (
      proposal.type === "runtime_gap"
      && proposal.evidence_refs.includes("memory/working/current.json")
    ));
    if (!checkpointProposal) throw new Error("expected working checkpoint runtime proposal");

    assert.deepEqual(report.proposals.map((proposal) => proposal.type), ["memory_gap", "runtime_gap"]);
    assert.equal(report.source.working_checkpoint?.ref, "memory/working/current.json");
    assert.match(checkpointProposal.title, /plan checkpoint follow-up intake/);
    assert.match(checkpointProposal.next_action, /Run a narrow review/);
    assert.equal(checkpointProposal.evidence_refs.includes("memory/episodes/raw-checkpoint-evidence.md"), true);

    const markdown = await readFile(join(fixture.stateRoot, report.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /working_checkpoint: memory\/working\/current\.json/);
    assert.doesNotMatch(markdown, /RAW_CHECKPOINT_DETAIL_SHOULD_NOT_APPEAR/);

    const tick = await runner.runTick({ limit: 5 });
    const checkpointItem = tick.inbox_items.find((item) => item.required_refs.includes("memory/working/current.json"));
    if (!checkpointItem) throw new Error("expected working checkpoint inbox item");
    assert.equal(checkpointItem.action_kind, "narrow_review");
    assert.deepEqual(checkpointItem.would_write, ["state"]);
    assert.equal(existsSync(join(fixture.repoRoot, "vault")), false);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  activeVault: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "agent-home/vault");
  await mkdir(repoRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    activeVault,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function writeFakeContentImage(outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, "fake image bytes", "utf8");
}

function completionVerificationReport(overrides: Record<string, unknown>): Record<string, unknown> {
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

function backgroundReviewRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
      reviewed_event_ids: ["evidence_gate"],
      working_checkpoint: null
    },
    chain_summaries: [],
    proposals: [],
    artifact_refs: {
      json_ref: "autonomy/reviews/background_review_test.json",
      markdown_ref: "autonomy/reviews/background_review_test.md"
    },
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

function reviewInboxItem(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "review_inbox_test",
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    status: "open",
    source: "review_tick",
    first_review_ref: "autonomy/reviews/background_review_dup.json",
    latest_review_ref: "autonomy/reviews/background_review_dup.json",
    proposal_id: "review_proposal_dup",
    proposal_type: "sop_candidate",
    proposal_title: "Inspect duplicated SOP chain",
    action_id: "follow_up_action_inspect_chain_dup",
    action_kind: "inspect_chain",
    title: "Inspect duplicated SOP chain",
    rationale: "Chain latest decision is reused_skill; inspect provenance before selecting a mutation command.",
    command: "pnpm run runtime -- review chain --sop sop_dup --state-root .runtime/state",
    required_refs: ["sop/drafts/sop_dup.json"],
    would_write: [],
    seen_count: 1,
    ...overrides
  };
}

function sopDraft(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "sop_test",
    title: "Test SOP",
    trigger: "Use when repeated local evidence indicates a reusable procedure should be audited.",
    procedure: ["Inspect evidence.", "Run the explicit gate.", "Record the result."],
    required_tools: ["review.background"],
    verification: "The chain summary should distinguish lifecycle refs from cited evidence.",
    failure_modes: ["If evidence is weak, revise the SOP before promotion."],
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

function recentIso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  const raw = await readFile(path, "utf8");
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>);
}

async function mkdirTemp(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "agent-background-review-"));
}
