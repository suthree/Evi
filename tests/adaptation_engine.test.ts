import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ADAPTATION_EVALUATOR_VERSION,
  ActionGateway,
  AdaptationEngine,
  createRuntimeInspectAction,
  materializeEvaluationReceipt,
  SqliteRuntimeStore,
  type ProcedureCandidateInput
} from "../packages/kernel/src/index.js";
import { testExecutionLock } from "./vnext_test_support.js";

test("Adaptation Engine persists one inactive candidate and passed Evaluation Receipt across reopen", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-passed-"));
  const sqlite = join(fixture, "runtime.sqlite");
  let store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const evidenceRunId = completedRun(store, fixture, "Verified recovery evidence.");
    const engine = new AdaptationEngine(store);
    const proposed = engine.propose(validCandidate(evidenceRunId));
    assert.equal(proposed.registry_version.state, "inactive");
    assert.equal(proposed.registry_version.artifact_digest, proposed.candidate.digest);
    assert.deepEqual(proposed.candidate.evidence_run_ids, [evidenceRunId]);
    assert.deepEqual(store.getAdaptationBaseline(proposed.candidate.target_slot), {
      kind: "none",
      version_id: null,
      digest: null
    });

    const duplicate = engine.propose(validCandidate(evidenceRunId));
    assert.equal(duplicate.candidate.id, proposed.candidate.id);
    assert.equal(duplicate.candidate.digest, proposed.candidate.digest);
    const evaluated = engine.evaluate(proposed.candidate.id);
    assert.equal(evaluated.status, "passed");
    assert.equal(evaluated.checks.every((check) => check.status === "passed"), true);
    assert.equal(engine.evaluate(proposed.candidate.id).digest, evaluated.digest);

    store.close();
    store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
    const reopened = new AdaptationEngine(store).inspect(proposed.candidate.id);
    assert.equal(reopened?.candidate.digest, proposed.candidate.digest);
    assert.equal(reopened?.registry_version.state, "inactive");
    assert.equal(reopened?.evaluations[0]?.digest, evaluated.digest);
    assert.equal(new AdaptationEngine(store).inspectEvaluation(evaluated.id)?.status, "passed");

    const raw = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(count(raw, "adaptation_candidates"), 1);
      assert.equal(count(raw, "self_registry_versions"), 1);
      assert.equal(count(raw, "adaptation_evaluations"), 1);
      assert.equal(countWhere(raw, "self_registry_versions", "state = 'active'"), 0);
    } finally {
      raw.close();
    }
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Adaptation Candidate rejects missing, non-completed, failed, and duplicated Run evidence", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-evidence-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const running = store.beginRun({
      request: "Remain running.",
      execution_lock: testExecutionLock({ cwd: fixture })
    }, 30_000);
    const failed = store.beginRun({
      request: "Fail terminally.",
      execution_lock: testExecutionLock({ cwd: fixture })
    }, 30_000);
    store.failRun(failed.execution, "synthetic failure");
    const paused = store.beginRun({
      request: "Pause terminal evidence eligibility.",
      execution_lock: testExecutionLock({ cwd: fixture })
    }, 30_000);
    store.pauseRun(paused.execution, "synthetic pause");
    const missing = "run_00000000000000000000000000000000";
    const engine = new AdaptationEngine(store);
    for (const runId of [running.run.id, failed.run.id, paused.run.id, missing]) {
      assert.throws(
        () => engine.propose(validCandidate(runId)),
        /evidence Run is not completed/
      );
    }
    assert.throws(
      () => engine.propose({
        ...validCandidate(completedRun(store, fixture, "Duplicate evidence.")),
        evidence_run_ids: [running.run.id, running.run.id]
      }),
      /must be unique/
    );
    const raw = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(count(raw, "adaptation_candidates"), 0);
    } finally {
      raw.close();
    }
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("incomplete inactive candidate receives one failed Evaluation Receipt without activation", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-failed-evaluation-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const evidenceRunId = completedRun(store, fixture, "Evidence for an incomplete candidate.");
    const engine = new AdaptationEngine(store);
    const proposed = engine.propose({
      ...validCandidate(evidenceRunId),
      trigger_conditions: [],
      steps: [],
      expected_result: "",
      verification_requirements: [],
      failure_modes: [],
      rollback_rule: ""
    });
    const receipt = engine.evaluate(proposed.candidate.id);
    assert.equal(receipt.status, "failed");
    assert.deepEqual(
      receipt.checks.filter((check) => check.status === "failed").map((check) => check.name),
      ["trigger_coverage", "bounded_steps", "expected_result", "verification_contract", "failure_contract", "rollback_contract"]
    );
    assert.equal(engine.inspect(proposed.candidate.id)?.registry_version.state, "inactive");
    const raw = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(countWhere(raw, "self_registry_versions", "state = 'active'"), 0);
      assert.equal(countWhere(raw, "adaptation_evaluations", "status = 'failed'"), 1);
    } finally {
      raw.close();
    }
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("first none-baseline Evaluation remains readable after a real activation and replacement compares to the exact active baseline", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-baseline-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const engine = new AdaptationEngine(store);
    const active = engine.propose(validCandidate(completedRun(store, fixture, "Active baseline evidence.")));
    const firstEvaluation = engine.evaluate(active.candidate.id);
    assert.deepEqual(firstEvaluation.baseline, { kind: "none", version_id: null, digest: null });
    const firstActivation = engine.activate(active.candidate.id);
    assert.equal(firstActivation.transition, "activated");
    assert.equal(engine.inspect(active.candidate.id)?.registry_version.state, "active");
    assert.equal(engine.inspectEvaluation(firstEvaluation.id)?.digest, firstEvaluation.digest);

    const proposed = engine.propose({
      ...validCandidate(completedRun(store, fixture, "Replacement candidate evidence.")),
      summary: "A replacement candidate that must be compared with the current active version."
    });
    assert.equal(proposed.registry_version.state, "inactive");
    const receipt = engine.evaluate(proposed.candidate.id);
    assert.deepEqual(receipt.baseline, {
      kind: "self_registry_version",
      version_id: active.registry_version.id,
      digest: active.registry_version.artifact_digest
    });

    const verify = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(countWhere(verify, "self_registry_versions", "state = 'active'"), 1);
      assert.equal(countWhere(verify, "self_registry_versions", "state = 'inactive'"), 1);
    } finally {
      verify.close();
    }
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("SQLite authority rejects non-canonical evaluator policy even when its receipt digest is valid", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-policy-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const engine = new AdaptationEngine(store);
    const proposed = engine.propose(validCandidate(completedRun(store, fixture, "Policy evidence.")));
    const forged = materializeEvaluationReceipt({
      candidate: proposed.candidate,
      baseline: { kind: "none", version_id: null, digest: null },
      evaluator_version: `${ADAPTATION_EVALUATOR_VERSION}-forged`,
      checks: [{ name: "forged", status: "passed", reason: "A caller claimed readiness." }]
    });
    assert.throws(() => store.recordAdaptationEvaluation(forged), /policy drifted/);
    assert.equal(engine.inspect(proposed.candidate.id)?.evaluations.length, 0);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Adaptation Engine rejects occupied target slots, unsupported authority, and credential-shaped bodies", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-boundary-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const firstRun = completedRun(store, fixture, "First candidate evidence.");
    const secondRun = completedRun(store, fixture, "Second candidate evidence.");
    const engine = new AdaptationEngine(store);
    engine.propose(validCandidate(firstRun));
    assert.throws(
      () => engine.propose({ ...validCandidate(secondRun), summary: "A different candidate." }),
      /target slot is already occupied/
    );
    assert.throws(
      () => engine.propose({ ...validCandidate(secondRun), active: true } as ProcedureCandidateInput),
      /fields are invalid/
    );
    const generic = engine.propose({
      ...validCandidate(secondRun),
      target_slot: "procedure.runtime-recovery",
      summary: "A generic adaptation candidate remains outside the P0 Growth Lifecycle slot."
    });
    engine.evaluate(generic.candidate.id);
    assert.throws(
      () => engine.activate(generic.candidate.id),
      /only supports procedure\.runtime-inspection/
    );
    assert.throws(
      () => engine.propose({
        ...validCandidate(secondRun),
        summary: "Reuse bearer sk-1234567890abcdefghijkl only when requested."
      }),
      /credential-shaped text/
    );
    const raw = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(count(raw, "adaptation_candidates"), 2);
    } finally {
      raw.close();
    }
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("candidate and Evaluation identity drift fail closed after SQLite mutation", async () => {
  for (const driftKind of ["candidate", "evaluation"] as const) {
    const fixture = await mkdtemp(join(tmpdir(), `evi-adaptation-drift-${driftKind}-`));
    const sqlite = join(fixture, "runtime.sqlite");
    const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
    try {
      const engine = new AdaptationEngine(store);
      const proposed = engine.propose(validCandidate(completedRun(store, fixture, "Drift evidence.")));
      const receipt = engine.evaluate(proposed.candidate.id);
      const raw = new DatabaseSync(sqlite);
      try {
        if (driftKind === "candidate") {
          const body = { ...proposed.candidate, summary: "drifted summary" };
          raw.prepare("UPDATE adaptation_candidates SET candidate_json = ? WHERE id = ?")
            .run(JSON.stringify(body), proposed.candidate.id);
        } else {
          const body = { ...receipt, status: "failed" };
          raw.prepare("UPDATE adaptation_evaluations SET receipt_json = ? WHERE id = ?")
            .run(JSON.stringify(body), receipt.id);
        }
      } finally {
        raw.close();
      }
      assert.throws(
        () => driftKind === "candidate"
          ? engine.inspect(proposed.candidate.id)
          : engine.inspectEvaluation(receipt.id),
        /identity is invalid/
      );
    } finally {
      store.close();
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

test("inspection revalidates completed Run evidence and canonical Evaluation policy", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-inspection-policy-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const engine = new AdaptationEngine(store);
    const evidenceRunId = completedRun(store, fixture, "Inspection evidence.");
    const proposed = engine.propose({
      ...validCandidate(evidenceRunId),
      rollback_rule: ""
    });
    const receipt = engine.evaluate(proposed.candidate.id);
    assert.equal(receipt.status, "failed");
    const forged = materializeEvaluationReceipt({
      candidate: proposed.candidate,
      baseline: receipt.baseline,
      evaluator_version: receipt.evaluator_version,
      checks: receipt.checks.map((check) => ({ ...check, status: "passed" })),
      created_at: receipt.created_at
    });
    assert.equal(forged.id, receipt.id);
    assert.equal(forged.status, "passed");
    const raw = new DatabaseSync(sqlite);
    try {
      raw.prepare(`
        UPDATE adaptation_evaluations
        SET status = ?, evaluation_digest = ?, receipt_json = ?
        WHERE id = ?
      `).run(forged.status, forged.digest, JSON.stringify(forged), forged.id);
    } finally {
      raw.close();
    }
    assert.throws(() => engine.inspectEvaluation(receipt.id), /policy drifted/);
    assert.throws(() => engine.inspect(proposed.candidate.id), /policy drifted/);

    const driftRun = new DatabaseSync(sqlite);
    try {
      driftRun.prepare("UPDATE runs SET status = 'failed' WHERE id = ?").run(evidenceRunId);
    } finally {
      driftRun.close();
    }
    assert.throws(() => engine.inspect(proposed.candidate.id), /evidence Run is not completed/);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("candidate and Evaluation transactions expose no partial authoritative rows", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-transaction-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const evidenceRunId = completedRun(store, fixture, "Transaction evidence.");
    const engine = new AdaptationEngine(store);
    const raw = new DatabaseSync(sqlite);
    try {
      raw.exec(`
        CREATE TRIGGER fail_registry_insert
        BEFORE INSERT ON self_registry_versions
        BEGIN SELECT RAISE(ABORT, 'synthetic registry crash'); END
      `);
    } finally {
      raw.close();
    }
    assert.throws(() => engine.propose(validCandidate(evidenceRunId)), /synthetic registry crash/);
    const afterCandidateCrash = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(count(afterCandidateCrash, "adaptation_candidates"), 0);
      assert.equal(count(afterCandidateCrash, "self_registry_versions"), 0);
    } finally {
      afterCandidateCrash.close();
    }

    const repair = new DatabaseSync(sqlite);
    try {
      repair.exec("DROP TRIGGER fail_registry_insert");
    } finally {
      repair.close();
    }
    const proposed = engine.propose(validCandidate(evidenceRunId));
    const failEvaluation = new DatabaseSync(sqlite);
    try {
      failEvaluation.exec(`
        CREATE TRIGGER fail_evaluation_insert
        BEFORE INSERT ON adaptation_evaluations
        BEGIN SELECT RAISE(ABORT, 'synthetic evaluation crash'); END
      `);
    } finally {
      failEvaluation.close();
    }
    assert.throws(() => engine.evaluate(proposed.candidate.id), /synthetic evaluation crash/);
    const afterEvaluationCrash = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(count(afterEvaluationCrash, "adaptation_candidates"), 1);
      assert.equal(count(afterEvaluationCrash, "self_registry_versions"), 1);
      assert.equal(count(afterEvaluationCrash, "adaptation_evaluations"), 0);
    } finally {
      afterEvaluationCrash.close();
    }
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Growth Lifecycle migrates a v12 store and rolls back a failed activation without changing the pending version", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-growth-schema-"));
  const sqlite = join(fixture, "runtime.sqlite");
  let store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    store.close();
    const legacy = new DatabaseSync(sqlite);
    try {
      legacy.exec(`
        PRAGMA foreign_keys = OFF;
        DROP TABLE adaptation_retirements;
        DROP TABLE adaptation_observations;
        DROP TABLE adaptation_selections;
        DROP TABLE adaptation_activations;
        UPDATE schema_meta SET value = '12' WHERE key = 'schema_version';
      `);
    } finally {
      legacy.close();
    }

    store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
    const migrated = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal((migrated.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as { value: string }).value, "13");
      for (const table of ["adaptation_activations", "adaptation_selections", "adaptation_observations", "adaptation_retirements"]) {
        assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
      }
    } finally {
      migrated.close();
    }

    const engine = new AdaptationEngine(store);
    const candidate = engine.propose(validCandidate(completedRun(store, fixture, "Activation rollback evidence.")));
    engine.evaluate(candidate.candidate.id);
    const fail = new DatabaseSync(sqlite);
    try {
      fail.exec(`
        CREATE TRIGGER fail_growth_activation
        BEFORE INSERT ON adaptation_activations
        BEGIN SELECT RAISE(ABORT, 'synthetic activation crash'); END
      `);
    } finally {
      fail.close();
    }
    assert.throws(() => engine.activate(candidate.candidate.id), /synthetic activation crash/);
    assert.equal(engine.inspect(candidate.candidate.id)?.registry_version.state, "inactive");
    const verify = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(countWhere(verify, "self_registry_versions", "state = 'active'"), 0);
      assert.equal(count(verify, "adaptation_activations"), 0);
    } finally {
      verify.close();
    }
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Growth Lifecycle rejects post-loop selection and keeps a selected rendered context sticky across a replacement", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-growth-selection-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const engine = new AdaptationEngine(store);
    const first = activateInspectionProcedure(engine, store, fixture, "First active procedure evidence.");
    const inspect = createRuntimeInspectAction(store);
    const gateway = new ActionGateway(store, [inspect]);

    const late = store.beginRun({
      request: "Refuse post-loop selection.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [inspect.contract] })
    }, 30_000);
    const lateReceipt = await completedRuntimeInspect(gateway, late.run.id, late.run.turn_id, "late-selection");
    assert.ok(lateReceipt.id);
    assert.throws(
      () => engine.selectForRun(late.run.id, late.run.turn_id),
      /before Run loop activity/
    );
    store.failRun(late.execution, "synthetic late-selection failure");

    const selectedRun = store.beginRun({
      request: "Bind the procedure before loop activity.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [inspect.contract] })
    }, 30_000);
    const selection = engine.selectForRun(selectedRun.run.id, selectedRun.run.turn_id);
    const firstContext = engine.renderSelectedContext(selection.id);
    assert.match(firstContext, new RegExp(first.name));

    const replacement = engine.propose({
      ...validCandidate(completedRun(store, fixture, "Replacement procedure evidence.")),
      summary: "Use the bounded runtime inspection proof after a replacement becomes active."
    });
    engine.evaluate(replacement.candidate.id);
    engine.activate(replacement.candidate.id);
    assert.equal(engine.inspect(first.id)?.registry_version.state, "retired");
    assert.equal(engine.renderSelectedContext(selection.id), firstContext);

    const raw = new DatabaseSync(sqlite);
    try {
      raw.prepare("UPDATE adaptation_selections SET growth_context_digest = ? WHERE id = ?")
        .run("0".repeat(64), selection.id);
    } finally {
      raw.close();
    }
    assert.throws(() => engine.renderSelectedContext(selection.id), /stored identity is invalid/);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Growth observations require an exact successful runtime_inspect receipt and fail closed on cross-Run, contract, and idempotency drift", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-growth-observation-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const engine = new AdaptationEngine(store);
    const active = activateInspectionProcedure(engine, store, fixture, "Observation active procedure evidence.");
    const inspect = createRuntimeInspectAction(store);
    const gateway = new ActionGateway(store, [inspect]);
    const subject = store.beginRun({
      request: "Bind and verify an exact runtime inspection receipt.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [inspect.contract] })
    }, 30_000);
    const selection = engine.selectForRun(subject.run.id, subject.run.turn_id);

    const wrongReservation = store.reserveAction({
      run_id: subject.run.id,
      turn_id: subject.run.turn_id,
      invocation_id: "not-runtime-inspect",
      action_name: "unrelated_read",
      contract_version: "1",
      action_digest: "f".repeat(64),
      effect_class: "local_read",
      decision_reason: "focused negative observation fixture",
      arguments: {}
    });
    store.markActionDispatching(wrongReservation.reservation.id);
    const wrongReceipt = store.completeAction(wrongReservation.reservation.id, {
      outcome: "succeeded",
      summary: "The unrelated local read completed.",
      output: {}
    }, false).receipt;
    const subjectReceipt = await completedRuntimeInspect(gateway, subject.run.id, subject.run.turn_id, "subject-inspect");
    store.completeRun(subject.execution, "verified completion after runtime inspection");

    const other = store.beginRun({
      request: "Produce a different Run receipt.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [inspect.contract] })
    }, 30_000);
    const otherReceipt = await completedRuntimeInspect(gateway, other.run.id, other.run.turn_id, "other-inspect");
    store.completeRun(other.execution, "other terminal completion");

    assert.throws(
      () => engine.observe(selection.id, wrongReceipt.id),
      /canonical runtime_inspect evidence/
    );
    assert.throws(
      () => engine.observe(selection.id, otherReceipt.id),
      /canonical runtime_inspect evidence/
    );
    const observation = engine.observe(selection.id, subjectReceipt.id);
    assert.equal(observation.outcome, "completed");
    assert.equal(observation.effect_receipt_id, subjectReceipt.id);
    assert.equal(engine.observe(selection.id, subjectReceipt.id).digest, observation.digest);
    assert.throws(
      () => engine.observe(selection.id, otherReceipt.id),
      /request drifted/
    );

    assert.throws(
      () => engine.retire(active.id),
      /requires a failed Observation/
    );

    const failedRun = store.beginRun({
      request: "Capture a failed reuse observation before retirement.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [inspect.contract] })
    }, 30_000);
    const failedSelection = engine.selectForRun(failedRun.run.id, failedRun.run.turn_id);
    const failedReceipt = await completedRuntimeInspect(gateway, failedRun.run.id, failedRun.run.turn_id, "failed-inspect");
    store.failRun(failedRun.execution, "synthetic verified reuse failure");
    const failedObservation = engine.observe(failedSelection.id, failedReceipt.id);
    assert.equal(failedObservation.outcome, "failed");
    const retirement = engine.retire(active.id, failedObservation.id);
    assert.equal(retirement.reason, "observed_failure");
    assert.equal(engine.retire(active.id, failedObservation.id).digest, retirement.digest);
    assert.equal(engine.inspect(active.id)?.registry_version.state, "retired");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

function completedRun(store: SqliteRuntimeStore, cwd: string, answer: string): string {
  const started = store.beginRun({
    request: "Produce verified evidence for an inactive adaptation candidate.",
    execution_lock: testExecutionLock({ cwd })
  }, 30_000);
  return store.completeRun(started.execution, answer).id;
}

function validCandidate(runId: string): ProcedureCandidateInput {
  return {
    target_slot: "procedure.runtime-inspection",
    name: "Recover a paused runtime",
    summary: "Reuse exact persisted evidence before retrying interrupted work.",
    trigger_conditions: ["A vNext Run is paused with canonical recovery evidence."],
    steps: ["Inspect the exact Run.", "Reconcile terminal evidence.", "Continue the same Run identity."],
    expected_result: "The same Run reaches a terminal outcome without replaying a terminal effect.",
    verification_requirements: ["Inspect Run and receipt counts before accepting completion."],
    failure_modes: ["Missing or mismatched evidence leaves the Run paused."],
    rollback_rule: "Retire the candidate if observed reuse causes replay or identity drift.",
    evidence_run_ids: [runId]
  };
}

function activateInspectionProcedure(
  engine: AdaptationEngine,
  store: SqliteRuntimeStore,
  cwd: string,
  evidence: string
) {
  const candidate = engine.propose(validCandidate(completedRun(store, cwd, evidence)));
  engine.evaluate(candidate.candidate.id);
  engine.activate(candidate.candidate.id);
  return candidate.candidate;
}

async function completedRuntimeInspect(
  gateway: ActionGateway,
  runId: string,
  turnId: string,
  invocationId: string
) {
  const result = await gateway.invoke({
    run_id: runId,
    turn_id: turnId,
    invocation_id: invocationId,
    action_name: "runtime_inspect",
    arguments: {}
  });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") throw new Error("runtime_inspect fixture did not complete");
  return result.receipt;
}

function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return Number(row.count);
}

function countWhere(db: DatabaseSync, table: string, where: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get() as { count: number };
  return Number(row.count);
}
