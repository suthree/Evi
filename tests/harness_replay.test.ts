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
      check.id === "delegated_dispatch_failure_kind"
        && check.status === "pass"
        && check.summary.includes("missing_kind_field=0")
        && check.summary.includes("missing_limit_kind=0")
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
    assert.equal(check?.refs.some((ref) => ref.endsWith("#evidence_replay_delegated")), true);
    assert.doesNotMatch(JSON.stringify(report), /RAW_REPLAY_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeReplayTraceFixture(store: AgentStore, delegatedSummary = "Delegated result: action_id=action_delegate_replay; round=1; sequence=2; task_chars=33; context_chars=77; contract_status=failed; dispatch_failure_kind=dispatch_limit_exceeded; ok=false."): Promise<void> {
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
