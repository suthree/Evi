import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getHarnessReplayAudit,
  listHarnessReplayAudits,
  runHarnessReplayAudit
} from "../packages/core/src/harness_replay.js";
import { getLiveRunTrace } from "../packages/core/src/live_run_trace.js";
import { AgentStore } from "../packages/core/src/store.js";

test("harness replay audit writes bounded evidence without reading raw run artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });

    assert.equal(report.action, "harness-replay-audit");
    assert.equal(report.status, "attention");
    assert.equal(report.replay_result, "metadata_replay");
    assert.equal(report.completion_id, "completion_verification_replay_test");
    assert.equal(report.metrics.rounds, 2);
    assert.equal(report.metrics.events, 6);
    assert.equal(report.metrics.delegated_results_failed, 1);
    assert.equal(report.metrics.delegated_completion_gate_passed, 0);
    assert.equal(report.metrics.delegated_completion_gate_warning, 0);
    assert.equal(report.metrics.delegated_completion_gate_failed, 1);
    assert.equal(report.metrics.delegated_completion_gate_skipped, 1);
    assert.equal(report.metrics.delegated_dispatches, 1);
    assert.equal(report.metrics.delegated_dispatches_failed, 1);
    assert.deepEqual(report.delegated_result_refs, [
      `memory/episodes/session_replay_test-delegated_result_invalid.json`
    ]);
    assert.deepEqual(report.delegated_result_report_refs, [
      `memory/episodes/session_replay_test-delegated_result_invalid.json`
    ]);
    assert.deepEqual(report.delegated_result_event_fallback_refs, []);
    assert.equal(report.metrics.repo_write_guards, 1);
    assert.equal(report.checks.some((check) => check.id === "bounded_replay_boundary" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) =>
      check.id === "completion_verification_state"
        && check.status === "warning"
        && check.summary.includes("expected_verification_status=failed")
        && check.summary.includes("tuple_match=true")
    ), true);
    assert.equal(report.checks.some((check) => check.id === "delegated_result_contract" && check.status === "warning"), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_completion_gate"
        && check.status === "fail"
        && check.summary.includes("failed_checks=delegated_results")
        && check.summary.includes("delegated_results_status=fail")
        && check.summary.includes("expected_delegated_results_status=fail")
        && check.summary.includes("duplicate_delegated_result_ids=0")
        && check.summary.includes("missing_delegated_results_gate_ids=0")
        && check.summary.includes("status_match=true")
    ), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_dispatch_metadata"
        && check.status === "pass"
        && check.summary.includes("missing_result_ref=0")
    ), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_model_invocation_boundary"
        && check.status === "pass"
        && check.summary.includes("missing_model_invoked=0")
        && check.summary.includes("blocked_invoked=0")
        && check.summary.includes("dispatched_not_invoked=0")
    ), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_result_ref_coverage"
        && check.status === "pass"
        && check.summary.includes("report_refs=1")
        && check.summary.includes("missing_dispatch_refs=0")
    ), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_dispatch_lineage"
        && check.status === "pass"
        && check.summary.includes("missing_envelope_ref=0")
        && check.summary.includes("mismatched_envelope_ref=0")
        && check.summary.includes("missing_round=0")
        && check.summary.includes("round_without_delegate_action=0")
        && check.summary.includes("mismatched_action_id=0")
        && check.summary.includes("mismatched_sequence=0")
    ), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_action_coverage"
        && check.status === "pass"
        && check.summary.includes("missing_delegate_dispatches=0")
    ), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_dispatch_failure_kind"
        && check.status === "pass"
        && check.summary.includes("missing_kind_field=0")
        && check.summary.includes("missing_limit_kind=0")
    ), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_dispatch_round_limit"
        && check.status === "pass"
        && check.summary.includes("over_limit_active_dispatches=0")
    ), true);
    assert.equal(report.checks.some((check) =>
      check.id === "delegated_result_failure_kind"
        && check.status === "pass"
        && check.summary.includes("missing_result_kind=0")
    ), true);
    assert.deepEqual(report.delegated_dispatches.map((dispatch) => ({
      event_id: dispatch.event_id,
      result_ref: dispatch.result_ref,
      action_id: dispatch.action_id,
      envelope_ref: dispatch.envelope_ref,
      round: dispatch.round,
      sequence: dispatch.sequence,
      task_chars: dispatch.task_chars,
      context_chars: dispatch.context_chars,
      model_invoked: dispatch.model_invoked,
      model_invoked_present: dispatch.model_invoked_present,
      contract_status: dispatch.contract_status,
      dispatch_failure_kind: dispatch.dispatch_failure_kind,
      dispatch_failure_kind_present: dispatch.dispatch_failure_kind_present,
      result_failure_kind: dispatch.result_failure_kind,
      result_failure_kind_present: dispatch.result_failure_kind_present,
      ok: dispatch.ok
    })), [{
      event_id: "evidence_replay_delegated",
      result_ref: `memory/episodes/session_replay_test-delegated_result_invalid.json`,
      action_id: "action_delegate_replay",
      envelope_ref: "memory/episodes/session_replay_test-model-action-r1.json",
      round: 1,
      sequence: 1,
      task_chars: 33,
      context_chars: 77,
      model_invoked: true,
      model_invoked_present: true,
      contract_status: "failed",
      dispatch_failure_kind: null,
      dispatch_failure_kind_present: true,
      result_failure_kind: "delegated_output_contract_failed",
      result_failure_kind_present: true,
      ok: false
    }]);
    assert.equal(existsSync(join(stateRoot, report.artifact_refs.json_ref)), true);
    assert.equal(existsSync(join(stateRoot, report.artifact_refs.markdown_ref)), true);
    const markdown = await readFile(join(stateRoot, report.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /delegated_result_report_refs: 1/);
    assert.match(markdown, /delegated_result_event_fallback_refs: 0/);
    assert.match(markdown, /delegated_result_refs: 1/);
    assert.equal(report.refs.some((ref) => ref.includes("model-response")), false);
    assert.equal(report.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);

    const events = await readFile(join(stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(events, new RegExp(report.id));
    assert.match(events, /Harness replay audit .* attention/);

    const list = await listHarnessReplayAudits(store);
    assert.equal(list.count, 1);
    assert.equal(list.replays[0]?.id, report.id);
    assert.match(list.boundary, /read-only harness replay audit history/);

    const detail = await getHarnessReplayAudit(store, { replayRef: report.id });
    assert.equal(detail.replay.id, report.id);
    assert.doesNotMatch(JSON.stringify({ list, detail }), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects optimistic completion state tuple drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-completion-state-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const sessionId = "session_replay_test";
    const baseReport = {
      id: "completion_verification_replay_test",
      session_id: sessionId,
      turn_id: "turn_replay_test",
      summary: "Completion state tuple replay fixture.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: [],
      observation_refs: [],
      verification_evidence_refs: [],
      delegated_result_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    };
    const cases = [{
      completionStatus: "done",
      verificationStatus: "passed",
      verified: true,
      checks: [],
      expectedCheckStatus: "pass",
      expectedVerificationStatus: "passed",
      expectedVerified: true,
      expectedFailedChecks: "none",
      expectedTupleMatch: true
    }, {
      completionStatus: "blocked",
      verificationStatus: "skipped",
      verified: false,
      checks: [],
      expectedCheckStatus: "warning",
      expectedVerificationStatus: "skipped",
      expectedVerified: false,
      expectedFailedChecks: "none",
      expectedTupleMatch: true
    }, {
      completionStatus: "done",
      verificationStatus: "passed",
      verified: true,
      checks: [{
        id: "final_response",
        status: "fail",
        summary: "Done claim has no final response artifact.",
        refs: []
      }],
      expectedCheckStatus: "fail",
      expectedVerificationStatus: "failed",
      expectedVerified: false,
      expectedFailedChecks: "final_response",
      expectedTupleMatch: false
    }, {
      completionStatus: "done",
      verificationStatus: "passed",
      verified: false,
      checks: [],
      expectedCheckStatus: "fail",
      expectedVerificationStatus: "passed",
      expectedVerified: true,
      expectedFailedChecks: "none",
      expectedTupleMatch: false
    }, {
      completionStatus: "done",
      verificationStatus: "failed",
      verified: true,
      checks: [{
        id: "final_response",
        status: "fail",
        summary: "Done claim has no final response artifact.",
        refs: []
      }],
      expectedCheckStatus: "fail",
      expectedVerificationStatus: "failed",
      expectedVerified: false,
      expectedFailedChecks: "final_response",
      expectedTupleMatch: false
    }] as const;

    for (const testCase of cases) {
      await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
        ...baseReport,
        completion_status: testCase.completionStatus,
        verification_status: testCase.verificationStatus,
        verified: testCase.verified,
        checks: testCase.checks
      });

      const report = await runHarnessReplayAudit(store, {
        traceRef: "completion_verification_replay_test"
      });
      const check = report.checks.find((item) => item.id === "completion_verification_state");

      assert.equal(report.status, "attention");
      assert.equal(check?.status, testCase.expectedCheckStatus);
      assert.match(check?.summary ?? "", new RegExp(`expected_verification_status=${testCase.expectedVerificationStatus}`));
      assert.match(check?.summary ?? "", new RegExp(`expected_verified=${testCase.expectedVerified}`));
      assert.match(check?.summary ?? "", new RegExp(`failed_checks=${testCase.expectedFailedChecks}`));
      assert.match(check?.summary ?? "", new RegExp(`tuple_match=${testCase.expectedTupleMatch}`));
      assert.deepEqual(check?.refs, ["memory/episodes/session_replay_test-completion-verification.json"]);
      assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit surfaces delegated completion gate check ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-delegated-gate-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated result(s) passed contract validation; they are not completion proof.",
      refs: ["delegated_result_invalid"]
    }, {
      id: "delegated_self_report_refs",
      status: "pass",
      summary: "Delegated self-report refs were not accepted as completion proof.",
      refs: ["memory/episodes/session_replay_test-delegated_result_invalid.json"]
    }, {
      id: "delegated_independent_evidence",
      status: "pass",
      summary: "Forged report says the done claim has independent evidence.",
      refs: []
    }]);

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /failed_checks=none/);
    assert.match(check?.summary ?? "", /delegated_results_status=pass/);
    assert.match(check?.summary ?? "", /expected_delegated_results_status=pass/);
    assert.match(check?.summary ?? "", /delegated_independent_status=pass/);
    assert.match(check?.summary ?? "", /expected_delegated_independent_status=fail/);
    assert.match(check?.summary ?? "", /delegated_independent_status_match=false/);
    assert.match(check?.summary ?? "", /status_match=true/);
    assert.deepEqual(report.delegated_completion_gate_checks.map((item) => ({
      id: item.id,
      status: item.status
    })), [{
      id: "delegated_results",
      status: "pass"
    }, {
      id: "delegated_self_report_refs",
      status: "pass"
    }, {
      id: "delegated_independent_evidence",
      status: "pass"
    }, {
      id: "claimed_refs_bound_to_evidence",
      status: "skipped"
    }]);
    assert.equal(
      report.delegated_completion_gate_checks[1]?.refs.includes("memory/episodes/session_replay_test-delegated_result_invalid.json"),
      true
    );
    const markdown = await readFile(join(stateRoot, report.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /## Delegated Completion Gate/);
    assert.match(markdown, /delegated_self_report_refs: pass/);
    assert.match(markdown, /Delegated self-report refs were not accepted as completion proof/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
    assert.doesNotMatch(markdown, /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when a report downgrades valid delegated independent evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-independent-downgrade-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const resultId = "tool_result_post_independent";
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated results passed.",
      refs: ["delegated_result_invalid"]
    }, {
      id: "delegated_self_report_refs",
      status: "pass",
      summary: "Delegated identities were not claimed.",
      refs: []
    }, {
      id: "claimed_refs_bound_to_evidence",
      status: "pass",
      summary: "Post-delegation evidence is bound.",
      refs: [resultId]
    }, {
      id: "delegated_independent_evidence",
      status: "fail",
      summary: "Forged report downgraded valid independent evidence.",
      refs: [resultId]
    }]);
    const verificationEvidence = await appendReplayPostDelegationEvidence(store, { resultId });
    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
    await store.writeJson(reportRef, {
      ...completion,
      claimed_verification_refs: [resultId],
      verification_evidence_refs: verificationEvidence
    });

    const report = await runHarnessReplayAudit(store, { traceRef: "completion_verification_replay_test" });
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /delegated_independent_status=fail/);
    assert.match(gateCheck?.summary ?? "", /expected_delegated_independent_status=pass/);
    assert.match(gateCheck?.summary ?? "", /post_delegation_bound_refs=1/);
    assert.match(gateCheck?.summary ?? "", /delegated_independent_status_match=false/);
    assert.deepEqual(gateCheck?.refs, [reportRef]);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit keeps legacy delegated independent evidence unknown", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-independent-legacy-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const resultId = "tool_result_post_legacy";
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated results passed.",
      refs: ["delegated_result_invalid"]
    }, {
      id: "delegated_self_report_refs",
      status: "pass",
      summary: "Delegated identities were not claimed.",
      refs: []
    }, {
      id: "claimed_refs_bound_to_evidence",
      status: "pass",
      summary: "Historical report says evidence is bound.",
      refs: [resultId]
    }, {
      id: "delegated_independent_evidence",
      status: "pass",
      summary: "Historical report says independent evidence passed.",
      refs: [resultId]
    }]);
    const verificationEvidence = await appendReplayPostDelegationEvidence(store, {
      resultId,
      includeEventMetadata: false
    });
    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
    await store.writeJson(reportRef, {
      ...completion,
      claimed_verification_refs: [resultId],
      verification_evidence_refs: verificationEvidence
    });

    const report = await runHarnessReplayAudit(store, { traceRef: "completion_verification_replay_test" });
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /expected_delegated_independent_status=unknown/);
    assert.match(gateCheck?.summary ?? "", /legacy_post_delegation_refs=1/);
    assert.match(gateCheck?.summary ?? "", /delegated_independent_status_match=false/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit fails a forged claimed-evidence binding pass", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-claimed-binding-fail-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const forgedResultId = "arbitrary_completion_ref";
  const artifactRef = "memory/episodes/session_replay_test-tool_result_write.json";
  const forgedEvidenceBase = {
    tool_result_id: forgedResultId,
    artifact_ref: artifactRef,
    event_id: "evidence_replay_tool",
    round: 1,
    tool: "file.write_repo",
    ok: true,
    side_effect_level: "local_write",
    is_write_run: true,
    after_latest_delegation: false,
    after_latest_failed_delegation: true,
    counts_as_independent_evidence: false,
    counts_as_failed_delegation_recovery: false
  };
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "skipped",
      summary: "No delegated result was required.",
      refs: []
    }, {
      id: "delegated_self_report_refs",
      status: "skipped",
      summary: "No delegated identities were available.",
      refs: []
    }, {
      id: "claimed_refs_bound_to_evidence",
      status: "pass",
      summary: "Forged report says the arbitrary ref was bound.",
      refs: [forgedResultId]
    }, {
      id: "delegated_independent_evidence",
      status: "skipped",
      summary: "No delegated result was available.",
      refs: []
    }], {
      includeDelegatedEvent: false,
      includeDelegatedResultRefs: false,
      verificationEvidenceRefs: [{
        ...forgedEvidenceBase,
        ref: forgedResultId,
        source: "tool_result",
        claimed: true
      }, {
        ...forgedEvidenceBase,
        ref: artifactRef,
        source: "tool_artifact",
        claimed: false
      }]
    });
    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
    await store.writeJson(reportRef, {
      ...completion,
      verification_status: "passed",
      verified: true,
      claimed_verification_refs: [forgedResultId]
    });

    const report = await runHarnessReplayAudit(store, { traceRef: "completion_verification_replay_test" });
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(report.status, "attention");
    assert.equal(gateCheck?.status, "fail");
    assert.match(gateCheck?.summary ?? "", /claimed_refs_bound_status=pass/);
    assert.match(gateCheck?.summary ?? "", /expected_claimed_refs_bound_status=fail/);
    assert.match(gateCheck?.summary ?? "", /unbound_claimed_refs=1/);
    assert.match(gateCheck?.summary ?? "", /claimed_refs_bound_status_match=false/);
    assert.deepEqual(gateCheck?.refs, [reportRef]);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when a report downgrades valid claimed evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-claimed-binding-pass-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const artifactRef = "memory/episodes/session_replay_test-tool_result_write.json";
  const resultId = "tool_result_bound";
  const evidenceBase = {
    tool_result_id: resultId,
    artifact_ref: artifactRef,
    event_id: "evidence_replay_tool",
    round: 1,
    tool: "file.write_repo",
    ok: true,
    side_effect_level: "local_write",
    is_write_run: true,
    after_latest_delegation: false,
    after_latest_failed_delegation: true,
    counts_as_independent_evidence: false,
    counts_as_failed_delegation_recovery: false
  };
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "skipped",
      summary: "No delegated result was required.",
      refs: []
    }, {
      id: "delegated_self_report_refs",
      status: "skipped",
      summary: "No delegated identities were available.",
      refs: []
    }, {
      id: "claimed_refs_bound_to_evidence",
      status: "fail",
      summary: "Forged report says valid evidence was unbound.",
      refs: [resultId]
    }, {
      id: "delegated_independent_evidence",
      status: "skipped",
      summary: "No delegated result was available.",
      refs: []
    }], {
      includeDelegatedEvent: false,
      includeDelegatedResultRefs: false,
      verificationEvidenceRefs: [{
        ...evidenceBase,
        ref: resultId,
        source: "tool_result",
        claimed: true
      }, {
        ...evidenceBase,
        ref: artifactRef,
        source: "tool_artifact",
        claimed: false
      }]
    });
    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
    await store.writeJson(reportRef, {
      ...completion,
      claimed_verification_refs: [resultId]
    });

    const report = await runHarnessReplayAudit(store, { traceRef: "completion_verification_replay_test" });
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /claimed_refs_bound_status=fail/);
    assert.match(gateCheck?.summary ?? "", /expected_claimed_refs_bound_status=pass/);
    assert.match(gateCheck?.summary ?? "", /bound_claimed_refs=1/);
    assert.match(gateCheck?.summary ?? "", /claimed_refs_bound_status_match=false/);
    assert.deepEqual(gateCheck?.refs, [reportRef]);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit keeps legacy claimed-evidence lineage unknown", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-claimed-binding-legacy-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "skipped",
      summary: "No delegated result was required.",
      refs: []
    }, {
      id: "delegated_self_report_refs",
      status: "skipped",
      summary: "No delegated identities were available.",
      refs: []
    }, {
      id: "claimed_refs_bound_to_evidence",
      status: "pass",
      summary: "Legacy report predates evidence lineage.",
      refs: ["legacy_claimed_ref"]
    }], {
      includeVerificationEvidenceRefs: false
    });
    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
    await store.writeJson(reportRef, {
      ...completion,
      claimed_verification_refs: ["legacy_claimed_ref"]
    });

    const report = await runHarnessReplayAudit(store, { traceRef: "completion_verification_replay_test" });
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /verification_evidence_refs_present=false/);
    assert.match(gateCheck?.summary ?? "", /expected_claimed_refs_bound_status=unknown/);
    assert.match(gateCheck?.summary ?? "", /claimed_refs_bound_status_match=false/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit keeps legacy tool-result event metadata unknown", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-claimed-binding-legacy-event-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const resultId = "tool_result_bound";
  const artifactRef = "memory/episodes/session_replay_test-tool_result_write.json";
  const evidenceBase = {
    tool_result_id: resultId,
    artifact_ref: artifactRef,
    event_id: "evidence_replay_tool",
    round: 1,
    tool: "file.write_repo",
    ok: true,
    side_effect_level: "local_write",
    is_write_run: true,
    after_latest_delegation: false,
    after_latest_failed_delegation: true,
    counts_as_independent_evidence: false,
    counts_as_failed_delegation_recovery: false
  };
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "skipped",
      summary: "No delegated result was required.",
      refs: []
    }, {
      id: "delegated_self_report_refs",
      status: "skipped",
      summary: "No delegated identities were available.",
      refs: []
    }, {
      id: "claimed_refs_bound_to_evidence",
      status: "pass",
      summary: "Historical report has lineage but its tool event predates bounded metadata.",
      refs: [resultId]
    }, {
      id: "delegated_independent_evidence",
      status: "skipped",
      summary: "No delegated result was available.",
      refs: []
    }], {
      includeDelegatedEvent: false,
      includeDelegatedResultRefs: false,
      includeToolResultEventMetadata: false,
      verificationEvidenceRefs: [{
        ...evidenceBase,
        ref: resultId,
        source: "tool_result",
        claimed: true
      }, {
        ...evidenceBase,
        ref: artifactRef,
        source: "tool_artifact",
        claimed: false
      }]
    });
    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
    await store.writeJson(reportRef, {
      ...completion,
      claimed_verification_refs: [resultId]
    });

    const report = await runHarnessReplayAudit(store, { traceRef: "completion_verification_replay_test" });
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /expected_claimed_refs_bound_status=unknown/);
    assert.match(gateCheck?.summary ?? "", /legacy_tool_result_metadata_claimed_refs=1/);
    assert.match(gateCheck?.summary ?? "", /claimed_refs_bound_status_match=false/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated results gate drops event result ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-gate-result-id-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated results passed, but the result id ref was dropped.",
      refs: []
    }, {
      id: "delegated_self_report_refs",
      status: "pass",
      summary: "Delegated self-report refs were not claimed.",
      refs: []
    }, {
      id: "claimed_refs_bound_to_evidence",
      status: "pass",
      summary: "Post-delegation evidence is bound.",
      refs: ["tool_result_post_identity"]
    }, {
      id: "delegated_independent_evidence",
      status: "pass",
      summary: "Post-delegation evidence is independently bound.",
      refs: ["tool_result_post_identity"]
    }]);
    const verificationEvidence = await appendReplayPostDelegationEvidence(store, {
      resultId: "tool_result_post_identity"
    });
    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
    await store.writeJson(reportRef, {
      ...completion,
      claimed_verification_refs: ["tool_result_post_identity"],
      verification_evidence_refs: verificationEvidence
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /missing_delegated_results_gate_ids=1/);
    assert.match(gateCheck?.summary ?? "", /delegated_identity_metadata_complete=true/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit fails verified traces that claim delegated refs as proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-delegated-proof-ref-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    const delegatedRef = "memory/episodes/session_replay_test-delegated_result_invalid.json";
    await writeReplayTraceFixture(store, undefined, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated result(s) passed contract validation; they are not completion proof.",
      refs: [delegatedRef]
    }]);
    await store.writeJson("memory/episodes/session_replay_test-completion-verification.json", {
      id: "completion_verification_replay_test",
      session_id: "session_replay_test",
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report incorrectly treated delegated result as proof.",
      envelope_ref: "memory/episodes/session_replay_test-model-action-r2.json",
      final_response_ref: "memory/episodes/session_replay_test-final-response.md",
      claimed_verification_refs: [delegatedRef],
      observation_refs: [
        "memory/episodes/session_replay_test-tool_result_write.json",
        delegatedRef
      ],
      delegated_result_refs: [delegatedRef],
      checks: [{
        id: "delegated_results",
        status: "pass",
        summary: "All delegated result(s) passed contract validation; they are not completion proof.",
        refs: [delegatedRef]
      }],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /claimed_delegated_refs=1/);
    assert.deepEqual(check?.refs, [
      "memory/episodes/session_replay_test-completion-verification.json",
      delegatedRef
    ]);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit derives delegated result id claims from event metadata", async () => {
  const cases = [{
    name: "exact result id",
    claimedRef: "delegated_result_invalid",
    expectedGateStatus: "fail",
    expectedIdentityClaims: 1,
    expectedResultIdClaims: 1
  }, {
    name: "substring lookalike",
    claimedRef: "prefix_delegated_result_invalid_suffix",
    expectedGateStatus: "fail",
    expectedIdentityClaims: 0,
    expectedResultIdClaims: 0
  }] as const;

  for (const testCase of cases) {
    const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-delegated-result-id-"));
    const repoRoot = join(root, "repo");
    const stateRoot = join(root, "state");
    const store = new AgentStore(repoRoot, stateRoot);
    try {
      await mkdir(repoRoot, { recursive: true });
      await mkdir(stateRoot, { recursive: true });
      await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
        id: "delegated_results",
        status: "pass",
        summary: "All delegated results passed.",
        refs: ["delegated_result_invalid"]
      }, {
        id: "delegated_self_report_refs",
        status: "pass",
        summary: "Delegated self-report refs were not claimed.",
        refs: []
      }]);
      const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
      const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
      await store.writeJson(reportRef, {
        ...completion,
        verification_status: "passed",
        verified: true,
        claimed_verification_refs: [testCase.claimedRef]
      });

      const report = await runHarnessReplayAudit(store, {
        traceRef: "completion_verification_replay_test"
      });
      const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");
      const lineageCheck = report.checks.find((item) => item.id === "verification_evidence_lineage");

      assert.equal(gateCheck?.status, testCase.expectedGateStatus, testCase.name);
      assert.match(gateCheck?.summary ?? "", new RegExp(`claimed_delegated_identity_refs=${testCase.expectedIdentityClaims}`));
      assert.match(lineageCheck?.summary ?? "", new RegExp(`claimed_delegated_result_ids=${testCase.expectedResultIdClaims}`));
      if (testCase.name === "substring lookalike") {
        assert.equal(lineageCheck?.status, "fail");
        assert.match(lineageCheck?.summary ?? "", /missing_claimed_lineage=1/);
      }
      assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("harness replay audit warns on done-only claimed-binding checks in blocked runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-blocked-result-id-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated results passed.",
      refs: ["delegated_result_invalid"]
    }]);
    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completion = await store.readStateJson<Record<string, unknown>>(reportRef);
    await store.writeJson(reportRef, {
      ...completion,
      completion_status: "blocked",
      verification_status: "skipped",
      verified: false,
      claimed_verification_refs: ["delegated_result_invalid"]
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");
    const lineageCheck = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /expected_delegated_self_report_status=skipped/);
    assert.match(gateCheck?.summary ?? "", /delegated_self_report_gate_applicable=false/);
    assert.match(gateCheck?.summary ?? "", /claimed_refs_bound_check_count=1/);
    assert.match(gateCheck?.summary ?? "", /claimed_refs_bound_status_match=false/);
    assert.match(gateCheck?.summary ?? "", /claimed_delegated_identity_refs=1/);
    assert.equal(lineageCheck?.status, "warning");
    assert.match(lineageCheck?.summary ?? "", /claimed_delegated_result_ids=1/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects inconsistent failed-delegation recovery lineage", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-recovery-lineage-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const sessionId = "session_replay_test";
    const recoveryEvidence = [{
      ref: "tool_result_unclaimed",
      tool: "file.write_state",
      ok: true,
      side_effect_level: "local_write",
      is_write_run: true,
      claimed: false,
      after_latest_failed_delegation: true
    }, {
      ref: "tool_result_failed",
      tool: "file.write_state",
      ok: false,
      side_effect_level: "local_write",
      is_write_run: true,
      claimed: true,
      after_latest_failed_delegation: true
    }, {
      ref: "tool_result_read_only",
      tool: "file.read",
      ok: true,
      side_effect_level: "none",
      is_write_run: false,
      claimed: true,
      after_latest_failed_delegation: true
    }, {
      ref: "tool_result_before_failure",
      tool: "file.write_state",
      ok: true,
      side_effect_level: "local_write",
      is_write_run: true,
      claimed: true,
      after_latest_failed_delegation: false
    }].map((item, index) => ({
      ...item,
      source: "tool_result",
      tool_result_id: item.ref,
      artifact_ref: `memory/episodes/${sessionId}-${item.ref}.json`,
      event_id: `evidence_recovery_${index}`,
      round: 2,
      after_latest_delegation: true,
      counts_as_independent_evidence: item.claimed,
      counts_as_failed_delegation_recovery: true
    }));
    const recoveryRefs = recoveryEvidence.map((item) => item.ref);
    await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_replay_test",
      session_id: sessionId,
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report marked invalid recovery evidence as verified.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: recoveryRefs.slice(1),
      observation_refs: recoveryEvidence.map((item) => item.artifact_ref),
      verification_evidence_refs: recoveryEvidence,
      delegated_result_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      checks: [{
        id: "delegated_results",
        status: "warning",
        summary: "Failed delegated result has later recovery evidence.",
        refs: recoveryRefs
      }, {
        id: "delegated_independent_evidence",
        status: "pass",
        summary: "Done claim has recovery and independent evidence.",
        refs: recoveryRefs
      }],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /invalid_recovery_lineage=4/);
    assert.equal(recoveryRefs.every((ref) => check?.refs.includes(ref)), true);
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");
    assert.equal(gateCheck?.status, "fail");
    assert.match(gateCheck?.summary ?? "", /delegated_results_status=warning/);
    assert.match(gateCheck?.summary ?? "", /expected_delegated_results_status=fail/);
    assert.match(gateCheck?.summary ?? "", /recovery_evidence=0/);
    assert.match(gateCheck?.summary ?? "", /status_match=false/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects inconsistent independent evidence lineage", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-independent-lineage-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const sessionId = "session_replay_test";
    const independentEvidence = [{
      ref: "tool_result_unclaimed",
      claimed: false,
      ok: true,
      after_latest_delegation: true
    }, {
      ref: "tool_result_absent_from_claim",
      claimed: true,
      ok: true,
      after_latest_delegation: true
    }, {
      ref: "tool_result_failed",
      claimed: true,
      ok: false,
      after_latest_delegation: true
    }, {
      ref: "tool_result_before_delegation",
      claimed: true,
      ok: true,
      after_latest_delegation: false
    }].map((item, index) => ({
      ...item,
      source: "tool_result",
      tool_result_id: item.ref,
      artifact_ref: `memory/episodes/${sessionId}-${item.ref}.json`,
      event_id: `evidence_independent_${index}`,
      round: 2,
      tool: "file.read",
      side_effect_level: "none",
      is_write_run: false,
      after_latest_failed_delegation: item.after_latest_delegation,
      counts_as_independent_evidence: true,
      counts_as_failed_delegation_recovery: false
    }));
    const independentRefs = independentEvidence.map((item) => item.ref);
    await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_replay_test",
      session_id: sessionId,
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report marked invalid independent evidence as verified.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: ["tool_result_failed", "tool_result_before_delegation"],
      observation_refs: independentEvidence.map((item) => item.artifact_ref),
      verification_evidence_refs: independentEvidence,
      delegated_result_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      checks: [{
        id: "delegated_results",
        status: "fail",
        summary: "Failed delegated result has no recovery evidence.",
        refs: ["delegated_result_invalid"]
      }, {
        id: "delegated_independent_evidence",
        status: "pass",
        summary: "Done claim has independent evidence.",
        refs: independentRefs
      }],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /missing_independent_lineage=0/);
    assert.match(check?.summary ?? "", /invalid_independent_lineage=4/);
    assert.equal(independentRefs.every((ref) => check?.refs.includes(ref)), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects claimed flag mismatches", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-claimed-flag-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const sessionId = "session_replay_test";
    const claimedRef = "tool_result_claimed_but_flag_false";
    const unclaimedRef = "tool_result_unclaimed_but_flag_true";
    const verificationEvidence = [{
      ref: claimedRef,
      claimed: false
    }, {
      ref: unclaimedRef,
      claimed: true
    }].map((item, index) => ({
      ...item,
      source: "tool_result",
      tool_result_id: item.ref,
      artifact_ref: `memory/episodes/${sessionId}-${item.ref}.json`,
      event_id: `evidence_claimed_flag_${index}`,
      round: 2,
      tool: "file.read",
      ok: true,
      side_effect_level: "none",
      is_write_run: false,
      after_latest_delegation: true,
      after_latest_failed_delegation: true,
      counts_as_independent_evidence: false,
      counts_as_failed_delegation_recovery: false
    }));
    await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_replay_test",
      session_id: sessionId,
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report disagreed about which evidence refs were claimed.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: [claimedRef],
      observation_refs: verificationEvidence.map((item) => item.artifact_ref),
      verification_evidence_refs: verificationEvidence,
      delegated_result_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      checks: [{
        id: "delegated_results",
        status: "fail",
        summary: "Failed delegated result has no recovery evidence.",
        refs: ["delegated_result_invalid"]
      }],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /missing_claimed_lineage=0/);
    assert.match(check?.summary ?? "", /claimed_flag_mismatches=2/);
    assert.equal(check?.refs.includes(claimedRef), true);
    assert.equal(check?.refs.includes(unclaimedRef), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects verification evidence source ref mismatches", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-source-ref-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const sessionId = "session_replay_test";
    const toolResultRef = "forged_tool_result_ref";
    const toolArtifactRef = "forged_tool_artifact_ref";
    const verificationEvidence = [{
      ref: toolResultRef,
      source: "tool_result",
      tool_result_id: "tool_result_real",
      artifact_ref: `memory/episodes/${sessionId}-tool_result_real.json`
    }, {
      ref: toolArtifactRef,
      source: "tool_artifact",
      tool_result_id: "tool_result_real",
      artifact_ref: `memory/episodes/${sessionId}-tool_result_real.json`
    }].map((item, index) => ({
      ...item,
      event_id: `evidence_source_ref_${index}`,
      round: 2,
      tool: "file.read",
      ok: true,
      side_effect_level: "none",
      is_write_run: false,
      claimed: true,
      after_latest_delegation: true,
      after_latest_failed_delegation: true,
      counts_as_independent_evidence: false,
      counts_as_failed_delegation_recovery: false
    }));
    await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_replay_test",
      session_id: sessionId,
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report attached forged refs to harness evidence identities.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: [toolResultRef, toolArtifactRef],
      observation_refs: verificationEvidence.map((item) => item.artifact_ref),
      verification_evidence_refs: verificationEvidence,
      delegated_result_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      checks: [{
        id: "delegated_results",
        status: "fail",
        summary: "Failed delegated result has no recovery evidence.",
        refs: ["delegated_result_invalid"]
      }],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /source_ref_mismatches=2/);
    assert.equal(check?.refs.includes(toolResultRef), true);
    assert.equal(check?.refs.includes(toolArtifactRef), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects verification evidence pair integrity drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-evidence-pair-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const sessionId = "session_replay_test";
    const evidence = (toolResultId: string, source: "tool_result" | "tool_artifact", overrides: Record<string, unknown> = {}) => {
      const artifactRef = `memory/episodes/${sessionId}-${toolResultId}.json`;
      return {
        ref: source === "tool_result" ? toolResultId : artifactRef,
        source,
        tool_result_id: toolResultId,
        artifact_ref: artifactRef,
        event_id: `evidence_${toolResultId}`,
        round: 2,
        tool: "file.read",
        ok: true,
        side_effect_level: "none",
        is_write_run: false,
        claimed: false,
        after_latest_delegation: true,
        after_latest_failed_delegation: true,
        counts_as_independent_evidence: false,
        counts_as_failed_delegation_recovery: false,
        ...overrides
      };
    };
    const verificationEvidence = [
      evidence("tool_result_missing_artifact", "tool_result"),
      evidence("tool_result_duplicate_source", "tool_result"),
      evidence("tool_result_duplicate_source", "tool_result"),
      evidence("tool_result_duplicate_source", "tool_artifact"),
      evidence("tool_result_metadata_drift", "tool_result"),
      evidence("tool_result_metadata_drift", "tool_artifact", { tool: "repo.search" })
    ];
    await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_replay_test",
      session_id: sessionId,
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report broke harness evidence pair integrity.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: [],
      observation_refs: verificationEvidence.map((item) => item.artifact_ref),
      verification_evidence_refs: verificationEvidence,
      delegated_result_refs: [],
      checks: [],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /evidence_pair_cardinality_mismatches=2/);
    assert.match(check?.summary ?? "", /evidence_pair_metadata_mismatches=1/);
    assert.equal(check?.refs.includes("tool_result_missing_artifact"), true);
    assert.equal(check?.refs.includes("tool_result_duplicate_source"), true);
    assert.equal(check?.refs.includes("tool_result_metadata_drift"), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects verification evidence tool event binding drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-evidence-event-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const sessionId = "session_replay_test";
    const evidencePair = (args: {
      toolResultId: string;
      artifactRef: string;
      eventId: string;
    }) => (["tool_result", "tool_artifact"] as const).map((source) => ({
      ref: source === "tool_result" ? args.toolResultId : args.artifactRef,
      source,
      tool_result_id: args.toolResultId,
      artifact_ref: args.artifactRef,
      event_id: args.eventId,
      round: 2,
      tool: "file.read",
      ok: true,
      side_effect_level: "none",
      is_write_run: false,
      claimed: false,
      after_latest_delegation: true,
      after_latest_failed_delegation: true,
      counts_as_independent_evidence: false,
      counts_as_failed_delegation_recovery: false
    }));
    const verificationEvidence = [
      ...evidencePair({
        toolResultId: "tool_result_missing_event",
        artifactRef: `memory/episodes/${sessionId}-tool_result_missing_event.json`,
        eventId: "evidence_missing_tool"
      }),
      ...evidencePair({
        toolResultId: "tool_result_mismatched_event",
        artifactRef: `memory/episodes/${sessionId}-tool_result_mismatched_event.json`,
        eventId: "evidence_replay_tool"
      })
    ];
    await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_replay_test",
      session_id: sessionId,
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report detached verification evidence from same-run tool-result events.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: [],
      observation_refs: verificationEvidence.map((item) => item.artifact_ref),
      verification_evidence_refs: verificationEvidence,
      delegated_result_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      checks: [],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /missing_tool_result_event_bindings=1/);
    assert.match(check?.summary ?? "", /ambiguous_tool_result_event_bindings=0/);
    assert.match(check?.summary ?? "", /mismatched_tool_result_event_artifacts=1/);
    assert.match(check?.summary ?? "", /mismatched_tool_result_event_rounds=1/);
    assert.equal(check?.refs.includes("tool_result_missing_event"), true);
    assert.equal(check?.refs.includes("tool_result_mismatched_event"), true);
    assert.equal(check?.refs.includes("memory/episodes/session_replay_test-completion-verification.json#evidence_replay_tool"), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects delegation-relative evidence flag drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-evidence-round-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const sessionId = "session_replay_test";
    const verificationEvidence = [{
      toolResultId: "tool_result_same_round",
      round: 1,
      afterLatest: true
    }, {
      toolResultId: "tool_result_later_round",
      round: 2,
      afterLatest: false
    }].flatMap((item) => {
      const artifactRef = `memory/episodes/${sessionId}-${item.toolResultId}.json`;
      const common = {
        tool_result_id: item.toolResultId,
        artifact_ref: artifactRef,
        event_id: `evidence_${item.toolResultId}`,
        round: item.round,
        tool: "file.read",
        ok: true,
        side_effect_level: "none",
        is_write_run: false,
        claimed: false,
        after_latest_delegation: item.afterLatest,
        after_latest_failed_delegation: item.afterLatest,
        counts_as_independent_evidence: false,
        counts_as_failed_delegation_recovery: false
      };
      return [{
        ...common,
        ref: item.toolResultId,
        source: "tool_result"
      }, {
        ...common,
        ref: artifactRef,
        source: "tool_artifact"
      }];
    });
    await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_replay_test",
      session_id: sessionId,
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report forged delegation-relative evidence flags.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: [],
      observation_refs: verificationEvidence.map((item) => item.artifact_ref),
      verification_evidence_refs: verificationEvidence,
      delegated_result_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      checks: [],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "fail");
    assert.match(check?.summary ?? "", /after_latest_delegation_mismatches=4/);
    assert.match(check?.summary ?? "", /after_latest_failed_delegation_mismatches=4/);
    assert.equal(check?.refs.includes("tool_result_same_round"), true);
    assert.equal(check?.refs.includes("tool_result_later_round"), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit distinguishes fallback delegated proof refs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-fallback-proof-ref-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    const delegatedRef = "memory/episodes/session_replay_test-delegated_result_invalid.json";
    await writeReplayTraceFixture(store, undefined, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated result(s) passed contract validation; they are not completion proof.",
      refs: [delegatedRef]
    }], {
      includeDelegatedResultRefs: false
    });
    await store.writeJson("memory/episodes/session_replay_test-completion-verification.json", {
      id: "completion_verification_replay_test",
      session_id: "session_replay_test",
      turn_id: "turn_replay_test",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Drifted report claimed a fallback delegated result as proof.",
      envelope_ref: "memory/episodes/session_replay_test-model-action-r2.json",
      final_response_ref: "memory/episodes/session_replay_test-final-response.md",
      claimed_verification_refs: [delegatedRef],
      observation_refs: [
        "memory/episodes/session_replay_test-tool_result_write.json",
        delegatedRef
      ],
      checks: [{
        id: "delegated_results",
        status: "pass",
        summary: "All delegated result(s) passed contract validation; they are not completion proof.",
        refs: [delegatedRef]
      }],
      created_at: "2026-06-30T01:01:00.000Z",
      boundary: "harness-owned completion verification report; read-only context input, not replay authority"
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "verification_evidence_lineage");

    assert.equal(check?.status, "fail");
    assert.deepEqual(report.delegated_result_report_refs, []);
    assert.deepEqual(report.delegated_result_event_fallback_refs, [delegatedRef]);
    assert.match(check?.summary ?? "", /claimed_delegated_refs=1/);
    assert.match(check?.summary ?? "", /claimed_delegated_report_refs=0/);
    assert.match(check?.summary ?? "", /claimed_delegated_event_fallback_refs=1/);
    assert.equal(check?.refs.includes(delegatedRef), true);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated dispatch action id is not declared by its round envelope", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-action-lineage-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await appendDelegatedDispatchEvent(store, {
      suffix: "wrong_action",
      actionId: "action_delegate_replay_wrong",
      sequence: 1,
      contractStatus: "passed",
      dispatchFailureKind: "none",
      resultFailureKind: "none",
      ok: true
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_dispatch_lineage");

    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /mismatched_action_id=1/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_wrong_action")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated dispatch sequence differs from its round action order", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-sequence-lineage-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await appendDelegatedDispatchEvent(store, {
      suffix: "wrong_sequence",
      actionId: "action_delegate_replay",
      sequence: 2,
      contractStatus: "failed",
      dispatchFailureKind: "dispatch_limit_exceeded",
      resultFailureKind: "dispatch_limit_exceeded",
      ok: false
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_dispatch_lineage");

    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /mismatched_action_id=0/);
    assert.match(check?.summary ?? "", /mismatched_sequence=1/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_wrong_sequence")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live run trace prefers delegated dispatch metadata result ref over artifact fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-metadata-result-ref-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    const metadataResultRef = "memory/episodes/session_replay_test-delegated_result_metadata_ref.json";
    await appendDelegatedDispatchEvent(store, {
      suffix: "metadata_result_ref",
      actionId: "action_delegate_replay",
      sequence: 1,
      contractStatus: "passed",
      dispatchFailureKind: "none",
      resultFailureKind: "none",
      metadataResultRef,
      ok: true
    });

    const trace = (await getLiveRunTrace(store, {
      traceRef: "completion_verification_replay_test"
    })).trace;
    const dispatch = trace.delegated_dispatches.find((item) => item.event_id === "evidence_replay_delegated_metadata_result_ref");

    assert.equal(dispatch?.result_ref, metadataResultRef);
    assert.notEqual(dispatch?.result_ref, "memory/episodes/session_replay_test-delegated_result_metadata_result_ref.json");
    assert.doesNotMatch(JSON.stringify(trace), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated dispatch points outside delegate action rounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-round-lineage-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await appendDelegatedDispatchEvent(store, {
      suffix: "round_without_delegate",
      actionId: "action_delegate_replay",
      round: 2,
      envelopeRef: "memory/episodes/session_replay_test-model-action-r2.json",
      sequence: 1,
      contractStatus: "passed",
      dispatchFailureKind: "none",
      resultFailureKind: "none",
      ok: true
    });
    await appendDelegatedDispatchEvent(store, {
      suffix: "missing_round",
      actionId: "action_delegate_replay",
      round: 99,
      envelopeRef: "memory/episodes/session_replay_test-model-action-r99.json",
      sequence: 1,
      contractStatus: "passed",
      dispatchFailureKind: "none",
      resultFailureKind: "none",
      ok: true
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_dispatch_lineage");

    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /missing_round=1/);
    assert.match(check?.summary ?? "", /round_without_delegate_action=1/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_round_without_delegate")), true);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_missing_round")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated dispatch lacks a persisted result ref", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-result-ref-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await appendDelegatedDispatchEventWithoutResultRef(store);

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const trace = (await getLiveRunTrace(store, {
      traceRef: "completion_verification_replay_test"
    })).trace;
    const check = report.checks.find((item) => item.id === "delegated_dispatch_metadata");
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(trace.delegated_dispatch_missing_result_ref_count, 1);
    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /delegated_results=2/);
    assert.match(check?.summary ?? "", /dispatches=2/);
    assert.match(check?.summary ?? "", /missing_result_ref=1/);
    assert.match(gateCheck?.summary ?? "", /delegated_identity_metadata_complete=false/);
    assert.match(gateCheck?.summary ?? "", /expected_delegated_self_report_status=unknown/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_missing_result_ref")), true);
    assert.equal(report.delegated_dispatches.find((dispatch) => dispatch.event_id === "evidence_replay_delegated_missing_result_ref")?.result_ref, "");
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated dispatch result ids are duplicated", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-duplicate-result-id-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated results passed.",
      refs: ["delegated_result_invalid"]
    }, {
      id: "delegated_self_report_refs",
      status: "pass",
      summary: "Delegated self-report refs were not claimed.",
      refs: []
    }]);
    await appendDelegatedDispatchEvent(store, {
      suffix: "duplicate_result_id",
      actionId: "action_delegate_replay",
      resultId: "delegated_result_invalid",
      sequence: 2,
      contractStatus: "passed",
      dispatchFailureKind: "none",
      resultFailureKind: "none",
      ok: true
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const metadataCheck = report.checks.find((item) => item.id === "delegated_dispatch_metadata");
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(metadataCheck?.status, "warning");
    assert.match(metadataCheck?.summary ?? "", /duplicate_result_id=1/);
    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /delegated_identity_metadata_complete=false/);
    assert.match(gateCheck?.summary ?? "", /duplicate_delegated_result_ids=1/);
    assert.match(gateCheck?.summary ?? "", /expected_delegated_self_report_status=unknown/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated dispatch result refs are duplicated", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-duplicate-result-ref-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, PASSED_REPLAY_DELEGATED_SUMMARY, [{
      id: "delegated_results",
      status: "pass",
      summary: "All delegated results passed.",
      refs: ["delegated_result_invalid", "delegated_result_duplicate_ref"]
    }, {
      id: "delegated_self_report_refs",
      status: "pass",
      summary: "Delegated self-report refs were not claimed.",
      refs: []
    }]);
    await appendDelegatedDispatchEvent(store, {
      suffix: "duplicate_result_ref",
      actionId: "action_delegate_replay",
      resultId: "delegated_result_duplicate_ref",
      metadataResultRef: "memory/episodes/session_replay_test-delegated_result_invalid.json",
      sequence: 2,
      contractStatus: "passed",
      dispatchFailureKind: "none",
      resultFailureKind: "none",
      ok: true
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const metadataCheck = report.checks.find((item) => item.id === "delegated_dispatch_metadata");
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(metadataCheck?.status, "warning");
    assert.match(metadataCheck?.summary ?? "", /duplicate_result_ref=1/);
    assert.equal(gateCheck?.status, "warning");
    assert.match(gateCheck?.summary ?? "", /delegated_identity_metadata_complete=false/);
    assert.match(gateCheck?.summary ?? "", /duplicate_delegated_result_refs=1/);
    assert.match(gateCheck?.summary ?? "", /expected_delegated_self_report_status=unknown/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated dispatch status and ok disagree", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-dispatch-status-ok-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await appendDelegatedDispatchEvent(store, {
      suffix: "failed_status_ok",
      actionId: "action_delegate_replay",
      sequence: 2,
      contractStatus: "failed",
      dispatchFailureKind: "none",
      resultFailureKind: "delegated_output_contract_failed",
      ok: true
    });
    await appendDelegatedDispatchEvent(store, {
      suffix: "passed_status_not_ok",
      actionId: "action_delegate_replay",
      sequence: 3,
      contractStatus: "passed",
      dispatchFailureKind: "none",
      resultFailureKind: "none",
      ok: false
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_dispatch_metadata");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /contract_status_ok_mismatches=2/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_failed_status_ok")), true);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_passed_status_not_ok")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit preserves metadata warning when no dispatch summary parses", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-dispatch-unparsed-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, "Delegated result metadata unavailable.");

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_dispatch_metadata");

    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /delegated_results=1; dispatches=0/);
    assert.deepEqual(check?.refs, ["memory/episodes/session_replay_test-completion-verification.json"]);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when blocked dispatch claims model invocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-model-boundary-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await appendDelegatedDispatchEvent(store, {
      suffix: "blocked_invoked",
      actionId: "action_delegate_replay",
      sequence: 2,
      contractStatus: "failed",
      dispatchFailureKind: "input_contract_failed",
      resultFailureKind: "input_contract_failed",
      modelInvoked: true,
      ok: false
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_model_invocation_boundary");

    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /blocked_invoked=1/);
    assert.match(check?.summary ?? "", /dispatched_not_invoked=0/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_blocked_invoked")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegate actions lack delegated result events", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-action-coverage-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await writeReplayRoundOneDelegateActions(store, 2);

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_action_coverage");

    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /declared_delegate_actions=2/);
    assert.match(check?.summary ?? "", /delegated_dispatches=1/);
    assert.match(check?.summary ?? "", /missing_delegate_dispatches=1/);
    assert.equal(check?.refs.includes("memory/episodes/session_replay_test-model-action-r1.json"), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit rejects delegated results status drift from event truth", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-event-failure-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, undefined, [{
      id: "delegated_results",
      status: "pass",
      summary: "No failed delegated results.",
      refs: []
    }]);

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const contractCheck = report.checks.find((item) => item.id === "delegated_result_contract");
    const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(report.status, "attention");
    assert.equal(report.metrics.delegated_results_failed, 1);
    assert.equal(contractCheck?.status, "warning");
    assert.match(contractCheck?.summary ?? "", /failed=1/);
    assert.equal(gateCheck?.status, "fail");
    assert.match(gateCheck?.summary ?? "", /delegated_results_status=pass/);
    assert.match(gateCheck?.summary ?? "", /expected_delegated_results_status=fail/);
    assert.match(gateCheck?.summary ?? "", /dispatch_metadata_complete=true/);
    assert.match(gateCheck?.summary ?? "", /failed_delegated_dispatches=1/);
    assert.match(gateCheck?.summary ?? "", /status_match=false/);

    const reportRef = "memory/episodes/session_replay_test-completion-verification.json";
    const completionReport = JSON.parse(await readFile(join(stateRoot, reportRef), "utf8")) as Record<string, unknown>;
    await store.writeJson(reportRef, {
      ...completionReport,
      completion_status: "blocked",
      verification_status: "skipped",
      verified: false
    });
    const blockedReplay = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const blockedGateCheck = blockedReplay.checks.find((item) => item.id === "delegated_completion_gate");

    assert.equal(blockedGateCheck?.status, "fail");
    assert.match(blockedGateCheck?.summary ?? "", /delegated_results_status=pass/);
    assert.match(blockedGateCheck?.summary ?? "", /expected_delegated_results_status=warning/);
    assert.match(blockedGateCheck?.summary ?? "", /status_match=false/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit distinguishes skipped delegated results status parity", async () => {
  const cases = [{
    name: "passed dispatch omitted by report",
    delegatedSummary: PASSED_REPLAY_DELEGATED_SUMMARY,
    includeDelegatedEvent: true,
    includeDelegatedResultRefs: true,
    expectedReplayStatus: "warning",
    expectedDelegatedResultsStatus: "pass"
  }, {
    name: "no delegated result",
    delegatedSummary: DEFAULT_REPLAY_DELEGATED_SUMMARY,
    includeDelegatedEvent: false,
    includeDelegatedResultRefs: false,
    expectedReplayStatus: "pass",
    expectedDelegatedResultsStatus: "skipped"
  }] as const;

  for (const testCase of cases) {
    const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-delegated-skipped-"));
    const repoRoot = join(root, "repo");
    const stateRoot = join(root, "state");
    const store = new AgentStore(repoRoot, stateRoot);
    try {
      await mkdir(repoRoot, { recursive: true });
      await mkdir(stateRoot, { recursive: true });
      await writeReplayTraceFixture(store, testCase.delegatedSummary, [{
        id: "delegated_results",
        status: "skipped",
        summary: `Skipped delegated results fixture: ${testCase.name}.`,
        refs: []
      }, {
        id: "delegated_self_report_refs",
        status: "skipped",
        summary: `Skipped delegated self-report refs fixture: ${testCase.name}.`,
        refs: []
      }], {
        includeDelegatedEvent: testCase.includeDelegatedEvent,
        includeDelegatedResultRefs: testCase.includeDelegatedResultRefs,
        includeDelegatedResultId: false
      });

      const report = await runHarnessReplayAudit(store, {
        traceRef: "completion_verification_replay_test"
      });
      const gateCheck = report.checks.find((item) => item.id === "delegated_completion_gate");

      assert.equal(gateCheck?.status, testCase.expectedReplayStatus);
      assert.match(gateCheck?.summary ?? "", /delegated_results_status=skipped/);
      assert.match(gateCheck?.summary ?? "", new RegExp(`expected_delegated_results_status=${testCase.expectedDelegatedResultsStatus}`));
      assert.match(gateCheck?.summary ?? "", new RegExp(`status_match=${testCase.expectedReplayStatus === "pass"}`));
      if (testCase.includeDelegatedEvent) {
        const metadataCheck = report.checks.find((item) => item.id === "delegated_dispatch_metadata");
        assert.equal(metadataCheck?.status, "warning");
        assert.match(metadataCheck?.summary ?? "", /missing_result_id=1/);
        assert.match(gateCheck?.summary ?? "", /expected_delegated_self_report_status=unknown/);
      } else {
        assert.match(gateCheck?.summary ?? "", /expected_delegated_self_report_status=skipped/);
      }
      assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("harness replay audit warns when completion report omits delegated result refs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-ref-coverage-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, undefined, undefined, {
      includeDelegatedResultRefs: false
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_result_ref_coverage");

    assert.equal(report.status, "attention");
    assert.deepEqual(report.delegated_result_report_refs, []);
    assert.deepEqual(report.delegated_result_refs, [
      `memory/episodes/session_replay_test-delegated_result_invalid.json`
    ]);
    assert.deepEqual(report.delegated_result_event_fallback_refs, [
      `memory/episodes/session_replay_test-delegated_result_invalid.json`
    ]);
    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /report_refs=0/);
    assert.match(check?.summary ?? "", /missing_dispatch_refs=1/);
    assert.match(check?.summary ?? "", /event_fallback_refs=1/);
    const markdown = await readFile(join(stateRoot, report.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /delegated_result_event_fallback_refs: 1/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when completion report has orphan delegated result refs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-orphan-report-ref-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store, undefined, undefined, {
      extraDelegatedResultRefs: [
        "memory/episodes/session_replay_test-delegated_result_orphan.json"
      ]
    });

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_result_ref_coverage");

    assert.equal(report.status, "attention");
    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /report_refs=2/);
    assert.match(check?.summary ?? "", /dispatch_refs=1/);
    assert.match(check?.summary ?? "", /orphan_report_refs=1/);
    assert.equal(check?.refs.includes("memory/episodes/session_replay_test-delegated_result_orphan.json"), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit scopes model-action rounds to the completion turn", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-turn-scope-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await appendOtherTurnDelegateActionRound(store);

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const coverage = report.checks.find((item) => item.id === "delegated_action_coverage");

    assert.equal(report.metrics.rounds, 2);
    assert.equal(coverage?.status, "pass");
    assert.match(coverage?.summary ?? "", /declared_delegate_actions=1/);
    assert.match(coverage?.summary ?? "", /missing_delegate_dispatches=0/);
    assert.equal(coverage?.refs.some((ref) => ref.includes("model-action-r3")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when over-limit delegated dispatch lacks failure kind", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-kind-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(
      store,
      "Delegated result: action_id=action_delegate_replay; round=1; sequence=2; task_chars=33; context_chars=77; contract_status=failed; ok=false."
    );

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_dispatch_failure_kind");

    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /missing_kind_field=1/);
    assert.match(check?.summary ?? "", /missing_limit_kind=1/);
    assert.equal(report.checks.find((item) => item.id === "delegated_result_failure_kind")?.status, "warning");
    assert.match(report.checks.find((item) => item.id === "delegated_result_failure_kind")?.summary ?? "", /missing_result_kind=1/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when failed delegated result lacks result failure kind", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-result-kind-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(
      store,
      "Delegated result: action_id=action_delegate_replay; round=1; sequence=2; task_chars=33; context_chars=77; contract_status=failed; dispatch_failure_kind=dispatch_limit_exceeded; ok=false."
    );

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const dispatchCheck = report.checks.find((item) => item.id === "delegated_dispatch_failure_kind");
    const resultCheck = report.checks.find((item) => item.id === "delegated_result_failure_kind");

    assert.equal(dispatchCheck?.status, "pass");
    assert.equal(resultCheck?.status, "warning");
    assert.match(resultCheck?.summary ?? "", /missing_result_kind=1/);
    assert.equal(resultCheck?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit distinguishes failed none result kind from invalid result kind", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-result-kind-invalid-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(
      store,
      "Delegated result: action_id=action_delegate_replay; round=1; sequence=2; task_chars=33; context_chars=77; contract_status=failed; dispatch_failure_kind=dispatch_limit_exceeded; result_failure_kind=none; ok=false."
    );
    await appendDelegatedDispatchSummary(
      store,
      "invalid_result_kind",
      "Delegated result: action_id=action_delegate_replay_invalid; round=1; sequence=3; task_chars=33; context_chars=77; contract_status=failed; dispatch_failure_kind=dispatch_limit_exceeded; result_failure_kind=unknown_kind; ok=false."
    );

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const resultCheck = report.checks.find((item) => item.id === "delegated_result_failure_kind");

    assert.equal(resultCheck?.status, "warning");
    assert.match(resultCheck?.summary ?? "", /missing_result_kind=1/);
    assert.match(resultCheck?.summary ?? "", /invalid_result_kind=1/);
    assert.equal(resultCheck?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.equal(resultCheck?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_invalid_result_kind")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when delegated failure kind pairs mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-kind-pair-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(
      store,
      "Delegated result: action_id=action_delegate_replay; round=1; sequence=1; task_chars=33; context_chars=77; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=delegated_output_contract_failed; ok=false."
    );
    await appendDelegatedDispatchSummary(
      store,
      "passed_dispatch_kind_mismatch",
      "Delegated result: action_id=action_delegate_replay_passed_mismatch; round=2; sequence=1; task_chars=33; context_chars=77; contract_status=passed; dispatch_failure_kind=input_contract_failed; result_failure_kind=none; ok=true."
    );

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const resultCheck = report.checks.find((item) => item.id === "delegated_result_failure_kind");

    assert.equal(resultCheck?.status, "warning");
    assert.match(resultCheck?.summary ?? "", /kind_pair_mismatch=2/);
    assert.equal(resultCheck?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.equal(resultCheck?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_passed_dispatch_kind_mismatch")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when passed delegated result lacks explicit none result kind", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-passed-result-kind-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(
      store,
      "Delegated result: action_id=action_delegate_replay; round=1; sequence=1; task_chars=33; context_chars=77; contract_status=passed; dispatch_failure_kind=none; ok=true."
    );

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const resultCheck = report.checks.find((item) => item.id === "delegated_result_failure_kind");

    assert.equal(resultCheck?.status, "warning");
    assert.match(resultCheck?.summary ?? "", /missing_result_kind=1/);
    assert.equal(resultCheck?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit warns when a trace shows two active delegates in one round", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-round-limit-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(
      store,
      "Delegated result: action_id=action_delegate_replay; round=1; sequence=1; task_chars=33; context_chars=77; contract_status=passed; dispatch_failure_kind=none; result_failure_kind=none; ok=true."
    );
    await appendActiveLookingDelegatedDispatch(store);

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const check = report.checks.find((item) => item.id === "delegated_dispatch_round_limit");

    assert.equal(check?.status, "warning");
    assert.match(check?.summary ?? "", /over_limit_active_dispatches=1/);
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_active_extra")), true);
    assert.equal(report.delegated_dispatches.length, 2);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harness replay audit keeps all delegated dispatch metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-harness-replay-delegates-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeReplayTraceFixture(store);
    await appendExtraDelegatedDispatches(store, 5);

    const report = await runHarnessReplayAudit(store, {
      traceRef: "completion_verification_replay_test"
    });
    const metadataCheck = report.checks.find((item) => item.id === "delegated_dispatch_metadata");

    assert.equal(report.metrics.delegated_results, 6);
    assert.equal(report.metrics.delegated_dispatches, 6);
    assert.equal(metadataCheck?.status, "pass");
    assert.match(metadataCheck?.summary ?? "", /delegated_results=6; dispatches=6/);
    assert.equal(metadataCheck?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_extra_7")), true);
    assert.equal(report.delegated_dispatches.length, 6);
    assert.equal(report.delegated_dispatches[5]?.event_id, "evidence_replay_delegated_extra_7");
    assert.equal(report.refs.some((ref) => ref.endsWith("#evidence_replay_delegated_extra_7")), true);

    const markdown = await readFile(join(stateRoot, report.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /omitted_delegated_dispatches=1/);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const DEFAULT_REPLAY_DELEGATED_SUMMARY = "Delegated result: action_id=action_delegate_replay; round=1; sequence=1; task_chars=33; context_chars=77; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false.";
const PASSED_REPLAY_DELEGATED_SUMMARY = "Delegated result: action_id=action_delegate_replay; round=1; sequence=1; task_chars=33; context_chars=77; model_invoked=true; contract_status=passed; dispatch_failure_kind=none; result_failure_kind=none; ok=true.";

async function appendReplayPostDelegationEvidence(
  store: AgentStore,
  args: { resultId: string; isWriteRun?: boolean; includeEventMetadata?: boolean }
): Promise<Array<Record<string, unknown>>> {
  const sessionId = "session_replay_test";
  const turnId = "turn_replay_test";
  const artifactRef = `memory/episodes/${sessionId}-${args.resultId}.json`;
  const eventId = `evidence_replay_${args.resultId}`;
  const isWriteRun = args.isWriteRun ?? false;
  const tool = isWriteRun ? "file.write_repo" : "file.read";
  const sideEffectLevel = isWriteRun ? "local_write" : "none";
  await store.writeText(artifactRef, "RAW_REPLAY_POST_DELEGATION_EVIDENCE_SHOULD_NOT_APPEAR");
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: eventId,
    session_id: sessionId,
    turn_id: turnId,
    kind: "tool_result",
    summary: "Recorded bounded post-delegation verification evidence.",
    artifact_refs: [artifactRef],
    ...(args.includeEventMetadata ?? true
      ? {
        tool_result: {
          result_id: args.resultId,
          tool,
          ok: true,
          side_effect_level: sideEffectLevel,
          is_write_run: isWriteRun
        }
      }
      : {}),
    created_at: "2026-06-30T01:00:05.000Z"
  });
  const common = {
    tool_result_id: args.resultId,
    artifact_ref: artifactRef,
    event_id: eventId,
    round: 2,
    tool,
    ok: true,
    side_effect_level: sideEffectLevel,
    is_write_run: isWriteRun,
    after_latest_delegation: true,
    after_latest_failed_delegation: true,
    counts_as_failed_delegation_recovery: isWriteRun
  };
  return [{
    ...common,
    ref: args.resultId,
    source: "tool_result",
    claimed: true,
    counts_as_independent_evidence: true
  }, {
    ...common,
    ref: artifactRef,
    source: "tool_artifact",
    claimed: false,
    counts_as_independent_evidence: false,
    counts_as_failed_delegation_recovery: false
  }];
}

async function writeReplayTraceFixture(
  store: AgentStore,
  delegatedSummary = DEFAULT_REPLAY_DELEGATED_SUMMARY,
  delegatedResultChecks = [{
    id: "delegated_results",
    status: "fail",
    summary: "Failed delegated result(s): 1.",
    refs: ["delegated_result_invalid"]
  }],
  options: {
    includeDelegatedEvent?: boolean;
    includeDelegatedResultRefs?: boolean;
    includeDelegatedResultId?: boolean;
    includeVerificationEvidenceRefs?: boolean;
    verificationEvidenceRefs?: Array<Record<string, unknown>>;
    includeToolResultEventMetadata?: boolean;
    toolResultEventMetadata?: Record<string, unknown>;
    extraDelegatedResultRefs?: string[];
  } = {}
): Promise<void> {
  const sessionId = "session_replay_test";
  const turnId = "turn_replay_test";
  await store.writeText(`memory/episodes/${sessionId}-context.md`, "RAW_REPLAY_CONTEXT_SHOULD_NOT_APPEAR");
  await store.writeJson(`memory/episodes/${sessionId}-context.json`, {
    version: 1,
    created_at: "2026-06-30T01:00:00.000Z",
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
  await store.writeText(`memory/episodes/${sessionId}-model-response-r1.json`, "RAW_REPLAY_MODEL_RESPONSE_SHOULD_NOT_APPEAR");
  await store.writeJson(`memory/episodes/${sessionId}-model-action-r1.json`, {
    summary: "First round records bounded evidence and requests a tool.",
    actions: [{
      type: "record_evidence",
      rationale: "Capture replay evidence.",
      payload: {
        markdown: "RAW_REPLAY_HARNESS_PAYLOAD_SHOULD_NOT_APPEAR"
      }
    }, {
      type: "use_tool",
      rationale: "Read a bounded file.",
      payload: {
        tool: "file.read",
        path: "RAW_REPLAY_TOOL_PAYLOAD_SHOULD_NOT_APPEAR"
      }
    }, {
      id: "action_delegate_replay",
      type: "delegate_agent",
      rationale: "Request bounded delegated replay critique.",
      payload: {
        task: "Critique replay lineage metadata.",
        context: "No tool, write, or mutation authority is available; completion remains with the main harness; output shape is summary/findings_text; use only explicit payload context or named evidence refs."
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  });
  await store.writeJson(`memory/episodes/${sessionId}-model-action-r2.json`, {
    summary: "Second round responds.",
    actions: [{
      type: "respond",
      rationale: "Return result.",
      payload: {
        markdown: "RAW_REPLAY_RESPOND_PAYLOAD_SHOULD_NOT_APPEAR"
      }
    }],
    completion_claim: {
      status: "done",
      verification_refs: []
    }
  });
  await store.writeText(`memory/episodes/${sessionId}-tool_result_write.json`, "RAW_REPLAY_TOOL_RESULT_SHOULD_NOT_APPEAR");
  await store.writeText(`memory/episodes/${sessionId}-delegated_result_invalid.json`, "RAW_REPLAY_DELEGATED_RESULT_SHOULD_NOT_APPEAR");
  await store.writeText(`memory/episodes/${sessionId}-final-response.md`, "RAW_REPLAY_FINAL_RESPONSE_SHOULD_NOT_APPEAR");
  const completionChecks = [...delegatedResultChecks];
  if (!completionChecks.some((check) => check.id === "claimed_refs_bound_to_evidence")) {
    completionChecks.push({
      id: "claimed_refs_bound_to_evidence",
      status: "skipped",
      summary: "Done claim supplied no non-delegated verification refs.",
      refs: []
    });
  }
  if (!(options.includeDelegatedEvent ?? true)
    && !completionChecks.some((check) => check.id === "delegated_independent_evidence")) {
    completionChecks.push({
      id: "delegated_independent_evidence",
      status: "skipped",
      summary: "No delegated result was available for this completion claim.",
      refs: []
    });
  }
  await store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
    id: "completion_verification_replay_test",
    session_id: sessionId,
    turn_id: turnId,
    completion_status: "done",
    verification_status: "failed",
    verified: false,
    summary: "Completion verification found replay attention.",
    envelope_ref: `memory/episodes/${sessionId}-model-action-r2.json`,
    final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
    claimed_verification_refs: [],
    observation_refs: [
      `memory/episodes/${sessionId}-tool_result_write.json`,
      `memory/episodes/${sessionId}-delegated_result_invalid.json`
    ],
    ...(options.includeVerificationEvidenceRefs ?? true
      ? { verification_evidence_refs: options.verificationEvidenceRefs ?? [] }
      : {}),
    ...(options.includeDelegatedResultRefs ?? true
      ? {
        delegated_result_refs: [
          `memory/episodes/${sessionId}-delegated_result_invalid.json`,
          ...(options.extraDelegatedResultRefs ?? [])
        ]
      }
      : {}),
    checks: completionChecks,
    created_at: "2026-06-30T01:01:00.000Z",
    boundary: "harness-owned completion verification report; read-only context input, not replay authority"
  });
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_prompt",
    session_id: sessionId,
    turn_id: turnId,
    kind: "prompt",
    summary: "Accepted replay test task.",
    artifact_refs: [
      `memory/episodes/${sessionId}-context.md`,
      `memory/episodes/${sessionId}-context.json`
    ],
    created_at: "2026-06-30T01:00:00.000Z"
  });
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_model_r1",
    session_id: sessionId,
    turn_id: turnId,
    kind: "model_action",
    summary: "First round records bounded evidence and requests a tool.",
    artifact_refs: [
      `memory/episodes/${sessionId}-model-response-r1.json`,
      `memory/episodes/${sessionId}-model-action-r1.json`
    ],
    created_at: "2026-06-30T01:00:01.000Z"
  });
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_harness",
    session_id: sessionId,
    turn_id: turnId,
    kind: "report",
    summary: "Recorded model evidence note: replay checkpoint.",
    artifact_refs: [`memory/episodes/${sessionId}-record-evidence-r1-1.md`],
    created_at: "2026-06-30T01:00:02.000Z"
  });
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_tool",
    session_id: sessionId,
    turn_id: turnId,
    kind: "tool_result",
    summary: "Wrote repo:docs/replay-generated.md (54 bytes). workspace_guard: before=dirty after=dirty changed_files=1->2 delta=1 preexisting_dirty=true target_changed=true.",
    artifact_refs: [`memory/episodes/${sessionId}-tool_result_write.json`],
    ...(options.includeToolResultEventMetadata ?? true
      ? {
        tool_result: options.toolResultEventMetadata ?? {
          result_id: "tool_result_bound",
          tool: "file.write_repo",
          ok: true,
          side_effect_level: "local_write",
          is_write_run: true
        }
      }
      : {}),
    created_at: "2026-06-30T01:00:03.000Z"
  });
  if (options.includeDelegatedEvent ?? true) {
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_replay_delegated",
      session_id: sessionId,
      turn_id: turnId,
      kind: "delegated_result",
      summary: delegatedSummary,
      artifact_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
      ...(delegatedSummary === DEFAULT_REPLAY_DELEGATED_SUMMARY || delegatedSummary === PASSED_REPLAY_DELEGATED_SUMMARY
        ? {
          delegated_dispatch: {
            action_id: "action_delegate_replay",
            ...(options.includeDelegatedResultId ?? true ? { result_id: "delegated_result_invalid" } : {}),
            result_ref: `memory/episodes/${sessionId}-delegated_result_invalid.json`,
            envelope_ref: `memory/episodes/${sessionId}-model-action-r1.json`,
            round: 1,
            sequence: 1,
            task_chars: 33,
            context_chars: 77,
            model_invoked: true,
            contract_status: delegatedSummary === DEFAULT_REPLAY_DELEGATED_SUMMARY ? "failed" : "passed",
            dispatch_failure_kind: "none",
            result_failure_kind: delegatedSummary === DEFAULT_REPLAY_DELEGATED_SUMMARY
              ? "delegated_output_contract_failed"
              : "none",
            ok: delegatedSummary === PASSED_REPLAY_DELEGATED_SUMMARY
          }
        }
        : {}),
      created_at: "2026-06-30T01:00:03.500Z"
    });
  }
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_model_r2",
    session_id: sessionId,
    turn_id: turnId,
    kind: "model_action",
    summary: "Second round responds.",
    artifact_refs: [`memory/episodes/${sessionId}-model-action-r2.json`],
    created_at: "2026-06-30T01:00:04.000Z"
  });
}

async function appendDelegatedDispatchSummary(store: AgentStore, suffix: string, summary: string): Promise<void> {
  const sessionId = "session_replay_test";
  const turnId = "turn_replay_test";
  const resultRef = `memory/episodes/${sessionId}-delegated_result_${suffix}.json`;
  await store.writeText(resultRef, "RAW_REPLAY_EXTRA_DELEGATED_RESULT_SHOULD_NOT_APPEAR");
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: `evidence_replay_delegated_${suffix}`,
    session_id: sessionId,
    turn_id: turnId,
    kind: "delegated_result",
    summary,
    artifact_refs: [resultRef],
    created_at: "2026-06-30T01:00:03.750Z"
  });
}

async function appendDelegatedDispatchEvent(
  store: AgentStore,
  args: {
    suffix: string;
    actionId: string;
    sequence: number;
    contractStatus: "passed" | "failed";
    dispatchFailureKind: "none" | "dispatch_limit_exceeded" | "input_contract_failed";
    resultFailureKind: "none" | "dispatch_limit_exceeded" | "input_contract_failed" | "delegated_output_contract_failed" | "delegated_model_request_failed";
    modelInvoked?: boolean;
    round?: number;
    envelopeRef?: string;
    metadataResultRef?: string;
    resultId?: string;
    ok: boolean;
  }
): Promise<void> {
  const sessionId = "session_replay_test";
  const turnId = "turn_replay_test";
  const resultRef = `memory/episodes/${sessionId}-delegated_result_${args.suffix}.json`;
  const modelInvoked = args.modelInvoked ?? (args.dispatchFailureKind === "none");
  const round = args.round ?? 1;
  const envelopeRef = args.envelopeRef ?? `memory/episodes/${sessionId}-model-action-r1.json`;
  const metadataResultRef = args.metadataResultRef ?? resultRef;
  await store.writeText(resultRef, "RAW_REPLAY_EXTRA_DELEGATED_RESULT_SHOULD_NOT_APPEAR");
  if (metadataResultRef !== resultRef) {
    await store.writeText(metadataResultRef, "RAW_REPLAY_METADATA_DELEGATED_RESULT_SHOULD_NOT_APPEAR");
  }
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: `evidence_replay_delegated_${args.suffix}`,
    session_id: sessionId,
    turn_id: turnId,
    kind: "delegated_result",
    summary: `Delegated result: action_id=${args.actionId}; round=${round}; sequence=${args.sequence}; task_chars=33; context_chars=77; model_invoked=${modelInvoked}; contract_status=${args.contractStatus}; dispatch_failure_kind=${args.dispatchFailureKind}; result_failure_kind=${args.resultFailureKind}; ok=${args.ok}.`,
    artifact_refs: [resultRef],
    delegated_dispatch: {
      action_id: args.actionId,
      result_id: args.resultId ?? `delegated_result_${args.suffix}`,
      result_ref: metadataResultRef,
      envelope_ref: envelopeRef,
      round,
      sequence: args.sequence,
      task_chars: 33,
      context_chars: 77,
      model_invoked: modelInvoked,
      contract_status: args.contractStatus,
      dispatch_failure_kind: args.dispatchFailureKind,
      result_failure_kind: args.resultFailureKind,
      ok: args.ok
    },
    created_at: "2026-06-30T01:00:03.875Z"
  });
}

async function appendDelegatedDispatchEventWithoutResultRef(store: AgentStore): Promise<void> {
  const sessionId = "session_replay_test";
  const turnId = "turn_replay_test";
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_delegated_missing_result_ref",
    session_id: sessionId,
    turn_id: turnId,
    kind: "delegated_result",
    summary: "Delegated result: action_id=action_delegate_replay; round=1; sequence=1; task_chars=33; context_chars=77; model_invoked=true; contract_status=passed; dispatch_failure_kind=none; result_failure_kind=none; ok=true.",
    artifact_refs: [],
    delegated_dispatch: {
      action_id: "action_delegate_replay",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r1.json`,
      round: 1,
      sequence: 1,
      task_chars: 33,
      context_chars: 77,
      model_invoked: true,
      contract_status: "passed",
      dispatch_failure_kind: "none",
      result_failure_kind: "none",
      ok: true
    },
    created_at: "2026-06-30T01:00:03.925Z"
  });
}

async function appendExtraDelegatedDispatches(store: AgentStore, count: number): Promise<void> {
  const sessionId = "session_replay_test";
  const turnId = "turn_replay_test";
  for (let offset = 0; offset < count; offset += 1) {
    const sequence = offset + 3;
    const resultRef = `memory/episodes/${sessionId}-delegated_result_extra_${sequence}.json`;
    await store.writeText(resultRef, "RAW_REPLAY_EXTRA_DELEGATED_RESULT_SHOULD_NOT_APPEAR");
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: `evidence_replay_delegated_extra_${sequence}`,
      session_id: sessionId,
      turn_id: turnId,
      kind: "delegated_result",
      summary: `Delegated result: action_id=action_delegate_replay_extra_${sequence}; round=1; sequence=${sequence}; task_chars=33; context_chars=77; model_invoked=false; contract_status=failed; dispatch_failure_kind=dispatch_limit_exceeded; result_failure_kind=dispatch_limit_exceeded; ok=false.`,
      artifact_refs: [resultRef],
      delegated_dispatch: {
        action_id: `action_delegate_replay_extra_${sequence}`,
        result_id: `delegated_result_extra_${sequence}`,
        result_ref: resultRef,
        envelope_ref: `memory/episodes/${sessionId}-model-action-r1.json`,
        round: 1,
        sequence,
        task_chars: 33,
        context_chars: 77,
        model_invoked: false,
        contract_status: "failed",
        dispatch_failure_kind: "dispatch_limit_exceeded",
        result_failure_kind: "dispatch_limit_exceeded",
        ok: false
      },
      created_at: `2026-06-30T01:00:0${sequence}.750Z`
    });
  }
}

async function writeReplayRoundOneDelegateActions(store: AgentStore, count: number): Promise<void> {
  const sessionId = "session_replay_test";
  await store.writeJson(`memory/episodes/${sessionId}-model-action-r1.json`, {
    summary: "First round declares delegated actions.",
    actions: Array.from({ length: count }, (_, index) => ({
      id: index === 0 ? "action_delegate_replay" : `action_delegate_replay_extra_declared_${index + 1}`,
      type: "delegate_agent",
      rationale: `Request bounded delegated critique ${index + 1}.`,
      payload: {
        task: `Critique replay coverage ${index + 1}.`,
        context: "No tool, write, or mutation authority is available; completion remains with the main harness."
      }
    })),
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  });
}

async function appendOtherTurnDelegateActionRound(store: AgentStore): Promise<void> {
  const sessionId = "session_replay_test";
  const otherTurnId = "turn_replay_other";
  const ref = `memory/episodes/${sessionId}-model-action-r3.json`;
  await store.writeJson(ref, {
    summary: "Other turn declares a delegated action that must not affect this replay.",
    actions: [{
      type: "delegate_agent",
      rationale: "Request bounded delegated review in another turn.",
      payload: {
        task: "Review another turn.",
        context: "No tool, write, or mutation authority is available; completion remains with the main harness."
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  });
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_other_turn_model_r3",
    session_id: sessionId,
    turn_id: otherTurnId,
    kind: "model_action",
    summary: "Other turn declares a delegated action.",
    artifact_refs: [ref],
    created_at: "2026-06-30T01:05:00.000Z"
  });
}

async function appendActiveLookingDelegatedDispatch(store: AgentStore): Promise<void> {
  const sessionId = "session_replay_test";
  const turnId = "turn_replay_test";
  const resultRef = `memory/episodes/${sessionId}-delegated_result_active_extra.json`;
  await store.writeText(resultRef, "RAW_REPLAY_ACTIVE_EXTRA_DELEGATED_RESULT_SHOULD_NOT_APPEAR");
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_delegated_active_extra",
    session_id: sessionId,
    turn_id: turnId,
    kind: "delegated_result",
    summary: "Delegated result: action_id=action_delegate_replay_active_extra; round=1; sequence=1; task_chars=31; context_chars=74; model_invoked=true; contract_status=passed; dispatch_failure_kind=none; result_failure_kind=none; ok=true.",
    artifact_refs: [resultRef],
    created_at: "2026-06-30T01:00:04.750Z"
  });
}
