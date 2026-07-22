import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ADAPTATION_EVALUATOR_VERSION,
  AdaptationEngine,
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

test("a new inactive candidate evaluates against the exact active Self Registry baseline", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-adaptation-baseline-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const engine = new AdaptationEngine(store);
    const active = engine.propose(validCandidate(completedRun(store, fixture, "Active baseline evidence.")));
    const raw = new DatabaseSync(sqlite);
    try {
      raw.prepare("UPDATE self_registry_versions SET state = 'active', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), active.registry_version.id);
    } finally {
      raw.close();
    }
    assert.equal(engine.inspect(active.candidate.id)?.registry_version.state, "active");

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
    assert.throws(
      () => engine.propose({
        ...validCandidate(secondRun),
        summary: "Reuse bearer sk-1234567890abcdefghijkl only when requested."
      }),
      /credential-shaped text/
    );
    const raw = new DatabaseSync(sqlite, { readOnly: true });
    try {
      assert.equal(count(raw, "adaptation_candidates"), 1);
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

function completedRun(store: SqliteRuntimeStore, cwd: string, answer: string): string {
  const started = store.beginRun({
    request: "Produce verified evidence for an inactive adaptation candidate.",
    execution_lock: testExecutionLock({ cwd })
  }, 30_000);
  return store.completeRun(started.execution, answer).id;
}

function validCandidate(runId: string): ProcedureCandidateInput {
  return {
    target_slot: "procedure.runtime-recovery",
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

function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return Number(row.count);
}

function countWhere(db: DatabaseSync, table: string, where: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get() as { count: number };
  return Number(row.count);
}
