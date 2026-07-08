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
    assert.equal(report.metrics.delegated_dispatches, 1);
    assert.equal(report.metrics.delegated_dispatches_failed, 1);
    assert.equal(report.metrics.repo_write_guards, 1);
    assert.equal(report.checks.some((check) => check.id === "bounded_replay_boundary" && check.status === "pass"), true);
    assert.equal(report.checks.some((check) => check.id === "delegated_result_contract" && check.status === "warning"), true);
    assert.equal(report.checks.some((check) => check.id === "delegated_dispatch_metadata" && check.status === "pass"), true);
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
      round: dispatch.round,
      sequence: dispatch.sequence,
      task_chars: dispatch.task_chars,
      context_chars: dispatch.context_chars,
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
      round: 1,
      sequence: 2,
      task_chars: 33,
      context_chars: 77,
      contract_status: "failed",
      dispatch_failure_kind: "dispatch_limit_exceeded",
      dispatch_failure_kind_present: true,
      result_failure_kind: "dispatch_limit_exceeded",
      result_failure_kind_present: true,
      ok: false
    }]);
    assert.equal(existsSync(join(stateRoot, report.artifact_refs.json_ref)), true);
    assert.equal(existsSync(join(stateRoot, report.artifact_refs.markdown_ref)), true);
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

async function writeReplayTraceFixture(store: AgentStore, delegatedSummary = "Delegated result: action_id=action_delegate_replay; round=1; sequence=2; task_chars=33; context_chars=77; contract_status=failed; dispatch_failure_kind=dispatch_limit_exceeded; result_failure_kind=dispatch_limit_exceeded; ok=false."): Promise<void> {
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
    checks: [{
      id: "delegated_results",
      status: "fail",
      summary: "Failed delegated result(s): 1.",
      refs: ["delegated_result_invalid"]
    }],
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
    created_at: "2026-06-30T01:00:03.000Z"
  });
  await store.appendJsonl("memory/episodes/events.jsonl", {
    id: "evidence_replay_delegated",
    session_id: sessionId,
    turn_id: turnId,
    kind: "delegated_result",
    summary: delegatedSummary,
    artifact_refs: [`memory/episodes/${sessionId}-delegated_result_invalid.json`],
    created_at: "2026-06-30T01:00:03.500Z"
  });
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
      summary: `Delegated result: action_id=action_delegate_replay_extra_${sequence}; round=1; sequence=${sequence}; task_chars=33; context_chars=77; contract_status=failed; dispatch_failure_kind=dispatch_limit_exceeded; result_failure_kind=dispatch_limit_exceeded; ok=false.`,
      artifact_refs: [resultRef],
      created_at: `2026-06-30T01:00:0${sequence}.750Z`
    });
  }
}

async function writeReplayRoundOneDelegateActions(store: AgentStore, count: number): Promise<void> {
  const sessionId = "session_replay_test";
  await store.writeJson(`memory/episodes/${sessionId}-model-action-r1.json`, {
    summary: "First round declares delegated actions.",
    actions: Array.from({ length: count }, (_, index) => ({
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
    summary: "Delegated result: action_id=action_delegate_replay_active_extra; round=1; sequence=1; task_chars=31; context_chars=74; contract_status=passed; dispatch_failure_kind=none; result_failure_kind=none; ok=true.",
    artifact_refs: [resultRef],
    created_at: "2026-06-30T01:00:04.750Z"
  });
}
