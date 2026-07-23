import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { materializeActionDigest } from "../packages/kernel/src/action_identity.js";
import {
  ActionGateway,
  createDiscussionWorkerDispatchAction,
  createRuntimeInspectAction,
  materializeResultEnvelope,
  OrchestrationEngine,
  SqliteRuntimeStore,
  type WorkerExecutionLease,
  type WorkerInspection
} from "../packages/kernel/src/index.js";
import { testExecutionLock } from "./vnext_test_support.js";

test("one Worker Group admits three tasks, leases at most two, and keeps the third retryable", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-group-parallel-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const setup = createDiscussionParent(store, fixture);
    const deadline = new Date(Date.now() + 90_000).toISOString();
    const group = {
      group_key: "bounded-analysis",
      expected_worker_count: 3,
      max_parallel: 2,
      deadline_at: deadline,
      budget: { max_output_tokens: 3_000, max_duration_ms: 90_000 }
    };
    const workerIds: string[] = [];
    for (const taskKey of ["architecture", "recovery", "contracts"]) {
      const result = await setup.gateway.invoke({
        run_id: setup.parent.run.id,
        turn_id: setup.parent.run.turn_id,
        invocation_id: `group-worker-${taskKey}`,
        action_name: setup.workerDispatch.contract.name,
        arguments: {
          ...discussionTask(deadline),
          worker_group: { ...group, task_key: taskKey }
        }
      });
      assert.equal(result.status, "completed");
      if (result.status !== "completed") return;
      workerIds.push(String(result.receipt.output.worker_id));
      assert.equal(result.receipt.output.worker_group_task_key, taskKey);
    }
    const duplicate = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "group-worker-architecture",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(deadline),
        worker_group: { ...group, task_key: "architecture" }
      }
    });
    assert.equal(duplicate.status, "completed");

    const firstGroup = setup.engine.inspectGroupForWorker(workerIds[0]!);
    assert.ok(firstGroup);
    assert.equal(firstGroup.worker_count, 3);
    assert.deepEqual(firstGroup.reserved_budget, {
      max_output_tokens: 3_000,
      timeout_ms: 90_000
    });
    for (const workerId of workerIds.slice(1)) {
      assert.equal(
        setup.engine.inspectGroupForWorker(workerId)?.group.id,
        firstGroup.group.id
      );
    }

    const first = store.claimWorker(workerIds[0]!, 30_000);
    const second = store.claimWorker(workerIds[1]!, 30_000);
    assert.equal(first.worker.status, "running");
    assert.equal(second.worker.status, "running");
    assert.throws(
      () => store.claimWorker(workerIds[2]!, 30_000),
      /parallel claim capacity is exhausted/iu
    );
    assert.equal(store.inspectWorker(workerIds[2]!)?.status, "queued");
    assert.equal(store.inspectWorker(workerIds[2]!)?.lease_expires_at, null);
    assert.equal(store.inspectWorkerGroup(firstGroup.group.id)?.running_count, 2);

    completeDiscussionWorker(store, first.worker, first.lease);
    const third = store.claimWorker(workerIds[2]!, 30_000);
    assert.equal(third.worker.status, "running");
    assert.equal(store.inspectWorkerGroup(firstGroup.group.id)?.running_count, 2);
    completeDiscussionWorker(store, second.worker, second.lease);
    completeDiscussionWorker(store, third.worker, third.lease);
    assert.equal(store.inspectRun(setup.parent.run.id)?.status, "running");
    assert.equal(store.inspectWorkerGroup(firstGroup.group.id)?.terminal_count, 3);
    assert.equal(
      setup.engine.settleSupervisorTurn(
        setup.parent.execution,
        "Wait for all three advisory Worker Results."
      )?.status,
      "waiting"
    );
    const resumed = setup.engine.resumeSupervisor(setup.parent.run.id, 30_000);
    assert.ok(resumed);
    const delivered = JSON.stringify(resumed.runtime_context);
    for (const workerId of workerIds) assert.match(delivered, new RegExp(workerId, "u"));
    store.failRun(resumed.execution, "Test-only stop after Supervisor-owned integration began.");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("an elapsed Worker Group deadline denies a claim without consuming its queued lease", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-group-deadline-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const setup = createDiscussionParent(store, fixture);
    const deadline = new Date(Date.now() + 100).toISOString();
    const dispatched = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "deadline-worker",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(deadline),
        budget: { max_output_tokens: 1_000, timeout_ms: 100 },
        worker_group: {
          group_key: "deadline-group",
          task_key: "only",
          expected_worker_count: 1,
          max_parallel: 1,
          deadline_at: deadline,
          budget: { max_output_tokens: 1_000, max_duration_ms: 100 }
        }
      }
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    await delay(140);
    assert.throws(() => store.claimWorker(workerId, 100), /Group deadline has elapsed/iu);
    const worker = store.inspectWorker(workerId);
    assert.equal(worker?.status, "queued");
    assert.equal(worker?.lease_ordinal, 0);
    assert.equal(worker?.lease_expires_at, null);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Worker Group reservation fails closed on duplicate slots, identity drift, and aggregate budget", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-group-budget-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const setup = createDiscussionParent(store, fixture);
    const deadline = new Date(Date.now() + 90_000).toISOString();
    const group = {
      group_key: "budgeted-analysis",
      expected_worker_count: 2,
      max_parallel: 2,
      deadline_at: deadline,
      budget: { max_output_tokens: 1_500, max_duration_ms: 60_000 }
    };
    const first = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "budgeted-worker-first",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(deadline),
        worker_group: { ...group, task_key: "first" }
      }
    });
    assert.equal(first.status, "completed");

    const duplicateSlot = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "budgeted-worker-duplicate-slot",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(deadline),
        worker_group: { ...group, task_key: "first" }
      }
    });
    assert.equal(duplicateSlot.status, "denied");
    assert.match(duplicateSlot.status === "denied" ? duplicateSlot.reason : "", /slot.*reserved/iu);

    const drifted = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "budgeted-worker-drifted-group",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(deadline),
        worker_group: { ...group, task_key: "second", expected_worker_count: 3 }
      }
    });
    assert.equal(drifted.status, "denied");
    assert.match(drifted.status === "denied" ? drifted.reason : "", /stored identity is invalid/iu);

    const overBudget = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "budgeted-worker-over-budget",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(deadline),
        worker_group: { ...group, task_key: "second" }
      }
    });
    assert.equal(overBudget.status, "denied");
    assert.match(overBudget.status === "denied" ? overBudget.reason : "", /budget is exhausted/iu);

    const countGroup = {
      group_key: "one-slot-only",
      expected_worker_count: 1,
      max_parallel: 1,
      deadline_at: deadline,
      budget: { max_output_tokens: 2_000, max_duration_ms: 60_000 }
    };
    const countFirst = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "count-worker-first",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(deadline),
        worker_group: { ...countGroup, task_key: "first" }
      }
    });
    assert.equal(countFirst.status, "completed");
    const countOverflow = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "count-worker-overflow",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(deadline),
        worker_group: { ...countGroup, task_key: "second" }
      }
    });
    assert.equal(countOverflow.status, "denied");
    assert.match(countOverflow.status === "denied" ? countOverflow.reason : "", /count is exhausted/iu);

    const expandedTaskDeadline = new Date(Date.parse(deadline) + 1_000).toISOString();
    const deadlineExpansion = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "deadline-expansion-worker",
      action_name: setup.workerDispatch.contract.name,
      arguments: {
        ...discussionTask(expandedTaskDeadline),
        worker_group: {
          group_key: "deadline-expansion",
          task_key: "only",
          expected_worker_count: 1,
          max_parallel: 1,
          deadline_at: deadline,
          budget: { max_output_tokens: 1_000, max_duration_ms: 30_000 }
        }
      }
    });
    assert.equal(deadlineExpansion.status, "denied");
    assert.match(
      deadlineExpansion.status === "denied" ? deadlineExpansion.reason : "",
      /task deadline exceeds the group deadline/iu
    );
    assert.equal(store.inspectRun(setup.parent.run.id)?.action_count, 2);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("singleton compatibility permits four outstanding Workers and rejects the fifth", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-group-parent-limit-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const setup = createDiscussionParent(store, fixture);
    const workerIds: string[] = [];
    for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
      const result = await setup.gateway.invoke({
        run_id: setup.parent.run.id,
        turn_id: setup.parent.run.turn_id,
        invocation_id: `singleton-worker-${ordinal}`,
        action_name: setup.workerDispatch.contract.name,
        arguments: discussionTask(new Date(Date.now() + 90_000).toISOString())
      });
      if (ordinal <= 4) {
        assert.equal(result.status, "completed");
        if (result.status === "completed") {
          workerIds.push(String(result.receipt.output.worker_id));
        }
      } else {
        assert.equal(result.status, "denied");
        assert.match(result.status === "denied" ? result.reason : "", /outstanding Worker limit/iu);
      }
    }
    assert.equal(store.inspectRun(setup.parent.run.id)?.worker_count, 4);
    assert.equal(store.claimWorker(workerIds[0]!, 30_000).worker.status, "running");
    assert.equal(store.claimWorker(workerIds[1]!, 30_000).worker.status, "running");
    assert.throws(
      () => store.claimWorker(workerIds[2]!, 30_000),
      /Supervisor parallel Worker claim capacity is exhausted/iu
    );
    assert.equal(store.inspectWorker(workerIds[2]!)?.status, "queued");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("an explicit Group reservation survives reopen and duplicate invoke without double accounting", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-group-reopen-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const deadline = new Date(Date.now() + 90_000).toISOString();
  let runId = "";
  let turnId = "";
  let reservationId = "";
  let receiptId = "";
  let workerId = "";
  const invocationArguments = {
    ...discussionTask(deadline),
    worker_group: {
      group_key: "durable-group",
      task_key: "durable-task",
      expected_worker_count: 2,
      max_parallel: 1,
      deadline_at: deadline,
      budget: { max_output_tokens: 2_000, max_duration_ms: 60_000 }
    }
  };
  const firstStore = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const setup = createDiscussionParent(firstStore, fixture);
    runId = setup.parent.run.id;
    turnId = setup.parent.run.turn_id;
    const first = await setup.gateway.invoke({
      run_id: runId,
      turn_id: turnId,
      invocation_id: "durable-group-worker",
      action_name: setup.workerDispatch.contract.name,
      arguments: invocationArguments
    });
    assert.equal(first.status, "completed");
    if (first.status !== "completed") throw new Error("Initial Group dispatch failed.");
    reservationId = first.reservation.id;
    receiptId = first.receipt.id;
    workerId = String(first.receipt.output.worker_id);
  } finally {
    firstStore.close();
  }

  const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(reopened);
    const engine = new OrchestrationEngine(reopened, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const gateway = new ActionGateway(reopened, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const duplicate = await gateway.invoke({
      run_id: runId,
      turn_id: turnId,
      invocation_id: "durable-group-worker",
      action_name: workerDispatch.contract.name,
      arguments: invocationArguments
    });
    assert.equal(duplicate.status, "completed");
    if (duplicate.status !== "completed") throw new Error("Duplicate Group dispatch failed.");
    assert.equal(duplicate.reservation.id, reservationId);
    assert.equal(duplicate.receipt.id, receiptId);
    assert.equal(duplicate.receipt.output.worker_id, workerId);
    const group = reopened.inspectWorkerGroupForWorker(workerId);
    assert.ok(group);
    assert.equal(group.worker_count, 1);
    assert.deepEqual(group.reserved_budget, {
      max_output_tokens: 1_000,
      timeout_ms: 30_000
    });
    assert.deepEqual(group.available_budget, {
      max_output_tokens: 1_000,
      duration_ms: 30_000
    });
  } finally {
    reopened.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("schema 11 migration adds a singleton binding without rewriting historical Action or Task identity", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-group-schema-eleven-"));
  const sqlite = join(fixture, "runtime.sqlite");
  let workerId = "";
  let taskDigest = "";
  const initial = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const setup = createDiscussionParent(initial, fixture);
    const dispatched = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "historical-v11-worker",
      action_name: setup.workerDispatch.contract.name,
      arguments: discussionTask(new Date(Date.now() + 90_000).toISOString())
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    workerId = String(dispatched.receipt.output.worker_id);
    taskDigest = setup.engine.inspect(workerId)!.task_envelope.digest;
  } finally {
    initial.close();
  }

  const legacy = new DatabaseSync(sqlite);
  legacy.exec("PRAGMA foreign_keys = OFF");
  const reservation = legacy.prepare(`
    SELECT id, action_name, contract_version, effect_class, arguments_json
    FROM action_reservations WHERE action_name = 'worker_dispatch'
  `).get() as {
    id: string;
    action_name: string;
    contract_version: string;
    effect_class: "external_read";
    arguments_json: string;
  };
  const legacyArguments = JSON.parse(reservation.arguments_json) as Record<string, unknown>;
  delete legacyArguments.worker_group;
  const legacyDigest = materializeActionDigest({
    name: reservation.action_name,
    version: reservation.contract_version,
    effect_class: reservation.effect_class
  }, legacyArguments);
  legacy.prepare(`
    UPDATE action_reservations SET arguments_json = ?, action_digest = ? WHERE id = ?
  `).run(JSON.stringify(legacyArguments), legacyDigest, reservation.id);
  const receipt = legacy.prepare(`
    SELECT output_json FROM effect_receipts WHERE reservation_id = ?
  `).get(reservation.id) as { output_json: string };
  const legacyOutput = JSON.parse(receipt.output_json) as Record<string, unknown>;
  delete legacyOutput.worker_group_id;
  delete legacyOutput.worker_group_digest;
  delete legacyOutput.worker_group_task_key;
  legacy.prepare(`
    UPDATE effect_receipts SET action_digest = ?, output_json = ? WHERE reservation_id = ?
  `).run(legacyDigest, JSON.stringify(legacyOutput), reservation.id);
  legacy.exec(`
    DROP TABLE worker_group_bindings;
    DROP TABLE worker_groups;
    CREATE UNIQUE INDEX worker_sessions_one_kind_per_parent_idx
      ON worker_sessions(parent_run_id, worker_kind)
      WHERE result_delivered_to_turn_id IS NULL;
    UPDATE schema_meta SET value = '11' WHERE key = 'schema_version';
  `);
  legacy.close();

  const migrated = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    assert.equal(migrated.inspectWorker(workerId)?.task_envelope.digest, taskDigest);
    const group = migrated.inspectWorkerGroupForWorker(workerId);
    assert.ok(group);
    assert.equal(group.worker_count, 1);
    assert.equal(group.group.expected_worker_count, 1);
    assert.equal(group.task?.task_key, "only");
    assert.equal(migrated.claimWorker(workerId, 30_000).worker.status, "running");
  } finally {
    migrated.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("schema 12 fails closed when a Worker Group binding disappears", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-group-corrupt-binding-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  let workerId = "";
  try {
    const setup = createDiscussionParent(store, fixture);
    const dispatched = await setup.gateway.invoke({
      run_id: setup.parent.run.id,
      turn_id: setup.parent.run.turn_id,
      invocation_id: "corrupt-binding-worker",
      action_name: setup.workerDispatch.contract.name,
      arguments: discussionTask(new Date(Date.now() + 90_000).toISOString())
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status === "completed") {
      workerId = String(dispatched.receipt.output.worker_id);
    }
  } finally {
    store.close();
  }
  const corrupt = new DatabaseSync(sqlite);
  corrupt.exec("PRAGMA foreign_keys = OFF");
  corrupt.prepare("DELETE FROM worker_group_bindings WHERE worker_id = ?").run(workerId);
  corrupt.close();
  try {
    assert.throws(
      () => new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" }),
      /Unsupported vNext runtime schema version: 12\/mixed:worker-groups/iu
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

function createDiscussionParent(store: SqliteRuntimeStore, cwd: string) {
  const runtimeInspect = createRuntimeInspectAction(store);
  const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
  const workerDispatch = createDiscussionWorkerDispatchAction(engine);
  const gateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
    allowed_effect_classes: ["none", "local_read", "external_read"]
  });
  const parent = store.beginRun({
    request: "Dispatch one bounded Worker Group.",
    execution_lock: testExecutionLock({ cwd, contracts: gateway.contracts() })
  }, 30_000);
  return { engine, gateway, parent, workerDispatch };
}

function discussionTask(deadlineAt: string) {
  return {
    objective: "Analyze bounded evidence.",
    expected_result: "Return findings.",
    context_refs: ["docs/ARCHITECTURE.md"],
    artifact_refs: [],
    constraints: ["read-only"],
    verification_requirements: ["cite explicit refs"],
    deadline_at: deadlineAt,
    budget: { max_output_tokens: 1_000, timeout_ms: 30_000 }
  };
}

function completeDiscussionWorker(
  store: SqliteRuntimeStore,
  worker: WorkerInspection,
  lease: WorkerExecutionLease
): void {
  const child = store.beginRun({
    request: "Complete one bounded discussion Worker.",
    execution_lock: worker.child_execution_lock
  }, 30_000, {
    worker_id: worker.id,
    owner_token: lease.owner_token
  });
  store.completeRun(child.execution, "Bounded findings.");
  store.completeWorker(lease, materializeResultEnvelope({
    worker_id: worker.id,
    child_run_id: child.run.id,
    status: "completed",
    summary: "Bounded findings.",
    findings: {
      conclusion: "One capacity slot can now be reused.",
      budget_violation: {
        output_tokens_exceeded: false,
        timeout_exceeded: false,
        deadline_exceeded: false
      }
    },
    artifact_refs: [],
    evidence_refs: worker.task_envelope.context_refs,
    unresolved_questions: [],
    proposed_next_step: null,
    actual_execution_lock_digest: child.execution_lock.digest,
    actual_execution: {
      execution_id: child.execution.id,
      execution_ordinal: child.execution.ordinal,
      model_dispatch_ids: [],
      provider: null,
      model: null
    },
    consumed: { output_tokens: 0, duration_ms: 100 },
    created_at: new Date().toISOString()
  }));
}
