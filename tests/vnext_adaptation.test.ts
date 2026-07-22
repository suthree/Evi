import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  executeVNextAdaptation,
  VNEXT_ADAPTATION_MARKER,
  vnextAdaptationErrorEnvelope
} from "../apps/cli/src/vnext_adaptation.js";
import { SqliteRuntimeStore, type ProcedureCandidateInput } from "../packages/kernel/src/index.js";
import { testExecutionLock } from "./vnext_test_support.js";

test("stable vNext Adaptation CLI proposes, evaluates, and inspects one inactive candidate", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-adaptation-cli-"));
  const stateRoot = join(fixture, "state");
  await mkdir(stateRoot, { recursive: true });
  const evidenceRunId = completedRun(stateRoot, fixture);
  try {
    const proposed = await executeVNextAdaptation({
      action: "propose",
      state_root: stateRoot,
      ...validCandidate(evidenceRunId)
    });
    assert.equal(proposed.adaptation.marker, VNEXT_ADAPTATION_MARKER);
    assert.equal(proposed.adaptation.action, "propose");
    assert.equal(proposed.adaptation.status, "inactive");
    assert.ok(proposed.adaptation.candidate_id);
    assert.equal(proposed.adaptation.result && "registry_version" in proposed.adaptation.result
      ? proposed.adaptation.result.registry_version.state
      : null, "inactive");

    const evaluated = await executeVNextAdaptation({
      action: "evaluate",
      state_root: stateRoot,
      candidate_id: proposed.adaptation.candidate_id
    });
    assert.equal(evaluated.adaptation.action, "evaluate");
    assert.equal(evaluated.adaptation.status, "passed");
    assert.ok(evaluated.adaptation.evaluation_id);

    const inspectedCandidate = await executeVNextAdaptation({
      action: "inspect",
      state_root: stateRoot,
      candidate_id: proposed.adaptation.candidate_id
    });
    assert.equal(inspectedCandidate.adaptation.action, "inspect");
    assert.equal(inspectedCandidate.adaptation.status, "inactive");
    assert.equal(inspectedCandidate.adaptation.result && "evaluations" in inspectedCandidate.adaptation.result
      ? inspectedCandidate.adaptation.result.evaluations.length
      : null, 1);

    const inspectedEvaluation = await executeVNextAdaptation({
      action: "inspect",
      state_root: stateRoot,
      evaluation_id: evaluated.adaptation.evaluation_id
    });
    assert.equal(inspectedEvaluation.adaptation.action, "inspect");
    assert.equal(inspectedEvaluation.adaptation.status, "passed");

    const raw = new DatabaseSync(join(stateRoot, "runtime.sqlite"), { readOnly: true });
    try {
      const active = raw.prepare("SELECT COUNT(*) AS count FROM self_registry_versions WHERE state = 'active'")
        .get() as { count: number };
      assert.equal(Number(active.count), 0);
    } finally {
      raw.close();
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("stable vNext Adaptation CLI returns bounded not-found and credential diagnostics", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-adaptation-errors-"));
  const stateRoot = join(fixture, "state");
  await mkdir(stateRoot, { recursive: true });
  const evidenceRunId = completedRun(stateRoot, fixture);
  try {
    const missing = await executeVNextAdaptation({
      action: "inspect",
      state_root: stateRoot,
      candidate_id: "candidate_00000000000000000000000000000000"
    });
    assert.equal(missing.adaptation.status, "not_found");

    const credential = "sk-1234567890abcdefghijkl";
    let error: unknown;
    try {
      await executeVNextAdaptation({
        action: "propose",
        state_root: stateRoot,
        ...validCandidate(evidenceRunId),
        summary: `Never persist ${credential} in a candidate.`
      });
    } catch (caught) {
      error = caught;
    }
    const envelope = vnextAdaptationErrorEnvelope(error, "propose");
    assert.equal(envelope.adaptation.status, "error");
    assert.equal(envelope.adaptation.diagnostic?.code, "invalid_adaptation");
    assert.equal(JSON.stringify(envelope).includes(credential), false);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

function completedRun(stateRoot: string, cwd: string): string {
  const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const started = store.beginRun({
      request: "Produce verified evidence for a local procedure candidate.",
      execution_lock: testExecutionLock({ cwd })
    }, 30_000);
    return store.completeRun(started.execution, "Verified local evidence.").id;
  } finally {
    store.close();
  }
}

function validCandidate(runId: string): ProcedureCandidateInput {
  return {
    target_slot: "procedure.runtime-recovery",
    name: "Recover a paused runtime",
    summary: "Reuse exact persisted evidence before retrying interrupted work.",
    trigger_conditions: ["A vNext Run is paused with canonical recovery evidence."],
    steps: ["Inspect the exact Run.", "Reconcile terminal evidence."],
    expected_result: "The same Run reaches a terminal outcome without replay.",
    verification_requirements: ["Inspect Run and receipt counts."],
    failure_modes: ["Mismatched evidence leaves the Run paused."],
    rollback_rule: "Retire the candidate if reuse causes identity drift.",
    evidence_run_ids: [runId]
  };
}
