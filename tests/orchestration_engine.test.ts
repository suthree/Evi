import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { Type } from "typebox";
import {
  ActionGateway,
  createDiscussionWorkerDispatchAction,
  createRuntimeInspectAction,
  createWorkerInspectAction,
  createWorkerNeedsInputAction,
  DiscussionWorkerRuntime,
  KernelRuntime,
  materializeResultEnvelope,
  OrchestrationEngine,
  parseResultEnvelope,
  parseTaskEnvelope,
  SqliteRuntimeStore,
  type ActionHandler,
  type AgentLoopFactory,
  WORKER_NEEDS_INPUT_CONTRACT
} from "../packages/kernel/src/index.js";
import { testExecutionLock } from "./vnext_test_support.js";

test("Orchestration Engine queues one immutable discussion worker through an exact Gateway reservation", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-orchestration-dispatch-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const gateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const started = store.beginRun({
      request: "Ask one worker for bounded analysis.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    }, 30_000);
    const deadline = new Date(Date.now() + 60_000).toISOString();
    const invocation = {
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "discussion-worker-call-1",
      action_name: workerDispatch.contract.name,
      arguments: {
        objective: "Analyze the named architecture evidence without changing any state.",
        expected_result: "Return bounded findings and unresolved questions.",
        context_refs: ["docs/ARCHITECTURE.md", "docs/adr/0017-evi-owned-orchestration-and-adaptation.md"],
        constraints: ["read-only", "no hidden memory"],
        verification_requirements: ["cite every finding to an explicit ref"],
        deadline_at: deadline,
        budget: { max_output_tokens: 1_200, timeout_ms: 30_000 }
      }
    };

    const first = await gateway.invoke(invocation);
    assert.equal(first.status, "completed");
    if (first.status !== "completed") return;
    assert.equal(first.receipt.outcome, "succeeded");
    assert.equal(first.receipt.effect_class, "external_read");
    assert.equal(first.reservation.arguments.worker_id, first.receipt.output.worker_id);
    assert.equal(first.reservation.arguments.parent_execution_lock_digest, started.execution_lock.digest);
    assert.equal(typeof first.reservation.arguments.child_execution_lock_digest, "string");
    const workerId = String(first.receipt.output.worker_id);
    const worker = engine.inspect(workerId);
    assert.ok(worker);
    assert.equal(worker.status, "queued");
    assert.equal(worker.parent_run_id, started.run.id);
    assert.equal(worker.parent_turn_id, started.run.turn_id);
    assert.equal(worker.reservation_id, first.reservation.id);
    assert.equal(worker.task_envelope.child_execution_lock_digest, worker.child_execution_lock.digest);
    assert.deepEqual(worker.child_execution_lock.actions, [{
      name: "runtime_inspect",
      version: "1",
      effect_class: "local_read"
    }]);
    assert.equal(worker.child_execution_lock.model.max_output_tokens, 1_200);
    assert.equal(worker.child_execution_lock.model.timeout_ms, 30_000);
    assert.equal(worker.task_envelope.digest.length, 64);
    assert.equal(worker.result_envelope, null);

    const repeated = await gateway.invoke(invocation);
    assert.equal(repeated.status, "completed");
    if (repeated.status !== "completed") return;
    assert.equal(repeated.reservation.id, first.reservation.id);
    assert.equal(repeated.receipt.id, first.receipt.id);
    assert.equal(engine.inspectReservation(first.reservation.id)?.id, workerId);
    assert.equal(store.inspectRun(started.run.id)?.action_count, 1);
    assert.equal(store.inspectRun(started.run.id)?.effect_receipt_count, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("discussion-worker authority fails closed before reservation unless the composition opts into external_read", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-orchestration-policy-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const gateway = new ActionGateway(store, [runtimeInspect, workerDispatch]);
    const started = store.beginRun({
      request: "Do not dispatch without an exact composition policy.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    }, 30_000);
    const denied = await gateway.invoke({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "denied-discussion-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(denied.status, "denied");
    assert.match(denied.status === "denied" ? denied.reason : "", /composition denies external_read/);
    assert.equal(store.inspectRun(started.run.id)?.action_count, 0);
    assert.equal(engine.inspectReservation("missing"), null);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("discussion-worker preparation rejects authority expansion before creating a reservation", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-orchestration-narrowing-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const gateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const started = store.beginRun({
      request: "Reject expanded child authority.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    }, 30_000);
    const expanded = await gateway.invoke({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "expanded-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: {
        ...validTaskInput(),
        budget: { max_output_tokens: 9_999, timeout_ms: 30_000 }
      }
    });
    assert.equal(expanded.status, "denied");
    assert.match(expanded.status === "denied" ? expanded.reason : "", /exceeds its parent Execution Lock/);
    assert.equal(store.inspectRun(started.run.id)?.action_count, 0);

    const writeAction: ActionHandler = {
      contract: {
        name: "forbidden_worker_write",
        version: "1",
        label: "Forbidden worker write",
        description: "Test-only forbidden write authority.",
        parameters: Type.Object({}, { additionalProperties: false }),
        effect_class: "local_write"
      },
      prepare: () => ({}),
      execute: async () => ({ outcome: "succeeded", summary: "not reached", output: {} })
    };
    assert.throws(
      () => new OrchestrationEngine(store, [writeAction.contract]),
      /must be none or local_read/
    );
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("discussion-worker reconciliation creates or reuses the exact deterministic worker without replay", async () => {
  for (const crashPoint of ["before_worker", "after_worker"] as const) {
    const fixture = await mkdtemp(join(tmpdir(), `evi-orchestration-reconcile-${crashPoint}-`));
    const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
    try {
      const runtimeInspect = createRuntimeInspectAction(store);
      const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
      const durableHandler = createDiscussionWorkerDispatchAction(engine);
      const crashHandler: ActionHandler = {
        ...durableHandler,
        async execute(dispatch) {
          if (crashPoint === "after_worker") await durableHandler.execute(dispatch);
          throw new Error(`synthetic process loss ${crashPoint}`);
        }
      };
      const firstGateway = new ActionGateway(store, [runtimeInspect, crashHandler], {
        allowed_effect_classes: ["none", "local_read", "external_read"]
      });
      const parent = store.beginRun({
        request: "Recover an exact worker dispatch.",
        execution_lock: testExecutionLock({ cwd: fixture, contracts: firstGateway.contracts() })
      }, 30_000);
      const first = await firstGateway.invoke({
        run_id: parent.run.id,
        turn_id: parent.run.turn_id,
        invocation_id: `reconcile-${crashPoint}`,
        action_name: durableHandler.contract.name,
        arguments: validTaskInput()
      });
      assert.equal(first.status, "outcome_unknown");
      if (first.status !== "outcome_unknown") continue;
      const expectedWorkerId = String(first.reservation.arguments.worker_id);
      assert.equal(
        engine.inspectReservation(first.reservation.id)?.id ?? null,
        crashPoint === "after_worker" ? expectedWorkerId : null
      );

      const recoveryGateway = new ActionGateway(store, [runtimeInspect, durableHandler], {
        allowed_effect_classes: ["none", "local_read", "external_read"]
      });
      const recovered = await recoveryGateway.reconcileRun(parent.run.id);
      assert.equal(recovered[0]?.status, "completed");
      assert.equal(engine.inspectReservation(first.reservation.id)?.id, expectedWorkerId);
      assert.equal(store.inspectRun(parent.run.id)?.worker_count, 1);
      const repeated = await recoveryGateway.reconcileRun(parent.run.id);
      assert.deepEqual(repeated, []);
    } finally {
      store.close();
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

test("Task and Result Envelopes reject digest drift and undeclared authority fields", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-orchestration-envelopes-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const gateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const started = store.beginRun({
      request: "Create one envelope fixture.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    }, 30_000);
    const dispatched = await gateway.invoke({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "envelope-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const worker = engine.inspect(String(dispatched.receipt.output.worker_id));
    assert.ok(worker);
    assert.throws(
      () => parseTaskEnvelope({ ...worker.task_envelope, authority_override: true }),
      /fields are invalid/
    );
    assert.throws(
      () => parseTaskEnvelope({ ...worker.task_envelope, digest: "0".repeat(64) }),
      /digest is invalid/
    );

    const result = materializeResultEnvelope({
      worker_id: worker.id,
      child_run_id: "run_0123456789abcdef0123456789abcdef",
      status: "completed",
      summary: "Bounded advisory findings only.",
      findings: { conclusion: "No mutation is required." },
      artifact_refs: [],
      evidence_refs: ["docs/ARCHITECTURE.md"],
      unresolved_questions: [],
      proposed_next_step: null,
      actual_execution_lock_digest: worker.child_execution_lock.digest,
      actual_execution: {
        execution_id: "execution_0123456789abcdef0123456789abcdef",
        execution_ordinal: 1,
        model_dispatch_ids: [],
        provider: null,
        model: null
      },
      consumed: { output_tokens: 120, duration_ms: 250 },
      created_at: new Date().toISOString()
    });
    assert.deepEqual(parseResultEnvelope(result), result);
    assert.throws(
      () => parseResultEnvelope({ ...result, parent_completed: true }),
      /fields are invalid/
    );
    assert.throws(
      () => parseResultEnvelope({ ...result, summary: "drifted" }),
      /digest is invalid/
    );
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("a worker lease atomically binds one isolated child Run and accepts one terminal Result Envelope", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-orchestration-worker-run-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const workerInspect = createWorkerInspectAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch, workerInspect], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const parent = store.beginRun({
      request: "Dispatch one child Run.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    }, 30_000);
    const dispatched = await parentGateway.invoke({
      run_id: parent.run.id,
      turn_id: parent.run.turn_id,
      invocation_id: "worker-run-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    const claimed = store.claimWorker(workerId, 30_000);
    assert.equal(claimed.worker.status, "running");
    assert.equal(claimed.lease.ordinal, 1);
    assert.throws(() => store.claimWorker(workerId, 30_000), /cannot be claimed/);

    const child = store.beginRun({
      request: "Perform the immutable discussion task.",
      execution_lock: claimed.worker.child_execution_lock
    }, 30_000, {
      worker_id: workerId,
      owner_token: claimed.lease.owner_token
    });
    const bound = engine.inspect(workerId);
    assert.ok(bound);
    assert.equal(bound.child_run_id, child.run.id);
    assert.equal(bound.child_session_id, child.run.session_id);
    assert.notEqual(bound.child_session_id, parent.run.session_id);
    assert.equal(child.execution_lock.digest, bound.child_execution_lock.digest);

    store.completeRun(child.execution, "Read-only findings.");
    const result = materializeResultEnvelope({
      worker_id: workerId,
      child_run_id: child.run.id,
      status: "completed",
      summary: "Read-only findings.",
      findings: { answer: "Read-only findings." },
      artifact_refs: [],
      evidence_refs: bound.task_envelope.context_refs,
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
      consumed: { output_tokens: 12, duration_ms: 100 },
      created_at: new Date().toISOString()
    });
    const drifted = materializeResultEnvelope({
      ...result,
      actual_execution_lock_digest: "0".repeat(64)
    });
    assert.throws(
      () => store.completeWorker(claimed.lease, drifted),
      /Result Envelope identity mismatch/
    );
    const completed = store.completeWorker(claimed.lease, result);
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.result_envelope, result);
    assert.equal(completed.lease_expires_at, null);
    assert.throws(() => store.completeWorker(claimed.lease, result), /lease identity mismatch/);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("expired worker ownership is reclaimable while stale lease tokens stay invalid", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-orchestration-worker-reclaim-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const gateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const parent = store.beginRun({
      request: "Reclaim one expired worker.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    }, 30_000);
    const dispatched = await gateway.invoke({
      run_id: parent.run.id,
      turn_id: parent.run.turn_id,
      invocation_id: "worker-reclaim-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    const first = store.claimWorker(workerId, 100);
    await delay(150);
    const second = store.claimWorker(workerId, 30_000);
    assert.equal(second.lease.ordinal, 2);
    assert.notEqual(second.lease.owner_token, first.lease.owner_token);
    assert.throws(() => store.renewWorkerLease(first.lease, 30_000), /lease identity mismatch/);
    const renewed = store.renewWorkerLease(second.lease, 30_000);
    assert.equal(renewed.ordinal, second.lease.ordinal);
    assert.notEqual(renewed.lease_expires_at, second.lease.lease_expires_at);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Discussion Worker Runtime executes one isolated child through the sole Agent Loop and leaves parent acceptance open", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-discussion-worker-runtime-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const workerInspect = createWorkerInspectAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch, workerInspect], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const parent = store.beginRun({
      request: "Supervise one advisory discussion worker.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    }, 30_000);
    const dispatched = await parentGateway.invoke({
      run_id: parent.run.id,
      turn_id: parent.run.turn_id,
      invocation_id: "runtime-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    let loopCalls = 0;
    const loops: AgentLoopFactory = {
      create(input) {
        loopCalls += 1;
        assert.deepEqual(input.action_gateway.contracts().map((contract) => contract.name), [
          "runtime_inspect"
        ]);
        return {
          execute: async (request) => {
            assert.equal(request, "Execute the bounded discussion task supplied as typed runtime context.");
            assert.equal(input.runtime_context?.kind, "runtime_discussion_task_envelope");
            assert.match(JSON.stringify(input.runtime_context), /Analyze bounded evidence/);
            return { answer: "The bounded architecture evidence supports one read-only conclusion." };
          }
        };
      }
    };
    const childGateway = new ActionGateway(store, [runtimeInspect]);
    const completed = await new DiscussionWorkerRuntime(
      store,
      childGateway,
      loops
    ).execute(workerId);

    assert.equal(loopCalls, 1);
    assert.equal(completed.status, "completed");
    assert.ok(completed.child_run_id);
    assert.ok(completed.child_session_id);
    assert.notEqual(completed.child_session_id, parent.run.session_id);
    assert.equal(completed.result_envelope?.child_run_id, completed.child_run_id);
    assert.equal(completed.result_envelope?.actual_execution_lock_digest, completed.child_execution_lock.digest);
    assert.equal(completed.result_envelope?.consumed.output_tokens, 0);
    assert.match(completed.result_envelope?.summary ?? "", /read-only conclusion/);
    assert.equal(store.inspectRun(completed.child_run_id!)?.status, "completed");
    assert.equal(store.inspectRun(parent.run.id)?.status, "running");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Discussion Worker Runtime reclaims an expired worker and delivers an existing terminal child without replay", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-discussion-worker-recovery-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const parent = store.beginRun({
      request: "Recover one exact child result.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    }, 30_000);
    const dispatched = await parentGateway.invoke({
      run_id: parent.run.id,
      turn_id: parent.run.turn_id,
      invocation_id: "runtime-recovery-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    const first = store.claimWorker(workerId, 100);
    const child = store.beginRun({
      request: "Already completed immutable task.",
      execution_lock: first.worker.child_execution_lock
    }, 30_000, {
      worker_id: workerId,
      owner_token: first.lease.owner_token
    });
    store.completeRun(child.execution, "Recovered without replaying the model.");
    await delay(150);

    const childGateway = new ActionGateway(store, [runtimeInspect]);
    const completed = await new DiscussionWorkerRuntime(store, childGateway, {
      create: () => ({
        execute: async () => {
          throw new Error("terminal recovery must not replay the Agent Loop");
        }
      })
    }).execute(workerId);

    assert.equal(completed.lease_ordinal, 2);
    assert.equal(completed.status, "completed");
    assert.equal(completed.child_run_id, child.run.id);
    assert.match(completed.result_envelope?.summary ?? "", /Recovered without replaying/);
    assert.equal(store.inspectRun(child.run.id)?.execution_count, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("technical child pause preserves unknown outcome and never becomes needs_input", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-discussion-worker-pause-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const unknownAction: ActionHandler = {
      contract: {
        name: "uncertain_worker_read",
        version: "1",
        label: "Uncertain worker read",
        description: "Test-only read whose exact outcome remains unknown.",
        parameters: Type.Object({}, { additionalProperties: false }),
        effect_class: "local_read"
      },
      prepare: () => ({}),
      execute: async () => { throw new Error("synthetic unknown read outcome"); }
    };
    const engine = new OrchestrationEngine(store, [unknownAction.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const parentGateway = new ActionGateway(store, [unknownAction, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const parent = store.beginRun({
      request: "Preserve exact child recovery state.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    }, 30_000);
    const dispatched = await parentGateway.invoke({
      run_id: parent.run.id,
      turn_id: parent.run.turn_id,
      invocation_id: "paused-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    const childGateway = new ActionGateway(store, [unknownAction]);
    await assert.rejects(
      () => new DiscussionWorkerRuntime(store, childGateway, {
        create(input) {
          return {
            execute: async () => {
              const observed = await input.action_gateway.invoke({
                run_id: input.run_id,
                turn_id: input.turn_id,
                invocation_id: "uncertain-child-read-call",
                action_name: unknownAction.contract.name,
                arguments: {}
              });
              assert.equal(observed.status, "outcome_unknown");
              return { answer: "Do not convert this technical pause into semantic input." };
            }
          };
        }
      }).execute(workerId),
      /paused for exact reconciliation evidence/
    );
    const worker = engine.inspect(workerId);
    assert.equal(worker?.status, "running");
    assert.equal(worker?.result_envelope, null);
    assert.equal(store.inspectRun(worker!.child_run_id!)?.status, "paused");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("explicit worker_needs_input Action produces one typed advisory Result", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-discussion-worker-needs-input-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract, WORKER_NEEDS_INPUT_CONTRACT]);
    const needsInput = createWorkerNeedsInputAction(engine);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, needsInput, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const parent = store.beginRun({
      request: "Allow one explicit typed input request.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    }, 30_000);
    const dispatched = await parentGateway.invoke({
      run_id: parent.run.id,
      turn_id: parent.run.turn_id,
      invocation_id: "needs-input-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    const childGateway = new ActionGateway(store, [runtimeInspect, needsInput]);
    const completed = await new DiscussionWorkerRuntime(store, childGateway, {
      create(input) {
        return {
          execute: async () => {
            const requested = await input.action_gateway.invoke({
              run_id: input.run_id,
              turn_id: input.turn_id,
              invocation_id: "explicit-worker-input-call",
              action_name: WORKER_NEEDS_INPUT_CONTRACT.name,
              arguments: {
                question: "Which accepted ADR should bound the comparison?",
                proposed_next_step: "The parent should select one explicit ADR ref."
              }
            });
            assert.equal(requested.status, "completed");
            return { answer: "Await the parent decision recorded by the typed Action." };
          }
        };
      }
    }).execute(workerId);
    assert.equal(completed.status, "needs_input");
    assert.deepEqual(completed.result_envelope?.unresolved_questions, [
      "Which accepted ADR should bound the comparison?"
    ]);
    assert.equal(
      completed.result_envelope?.proposed_next_step,
      "The parent should select one explicit ADR ref."
    );
    assert.equal(completed.result_envelope?.actual_execution.execution_id.startsWith("execution_"), true);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("worker total token and time budgets fail closed before Result delivery", async () => {
  for (const budgetKind of ["tokens", "time"] as const) {
    const fixture = await mkdtemp(join(tmpdir(), `evi-discussion-worker-budget-${budgetKind}-`));
    const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
    try {
      const runtimeInspect = createRuntimeInspectAction(store);
      const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
      const workerDispatch = createDiscussionWorkerDispatchAction(engine);
      const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
        allowed_effect_classes: ["none", "local_read", "external_read"]
      });
      const parent = store.beginRun({
        request: "Enforce a total worker budget.",
        execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
      }, 30_000);
      const dispatched = await parentGateway.invoke({
        run_id: parent.run.id,
        turn_id: parent.run.turn_id,
        invocation_id: `budget-worker-call-${budgetKind}`,
        action_name: workerDispatch.contract.name,
        arguments: {
          ...validTaskInput(),
          budget: budgetKind === "tokens"
            ? { max_output_tokens: 1, timeout_ms: 30_000 }
            : { max_output_tokens: 1_000, timeout_ms: 100 }
        }
      });
      assert.equal(dispatched.status, "completed");
      if (dispatched.status !== "completed") return;
      const workerId = String(dispatched.receipt.output.worker_id);
      await assert.rejects(
        () => new DiscussionWorkerRuntime(store, new ActionGateway(store, [runtimeInspect]), {
          create(input) {
            return {
              execute: async () => {
                if (budgetKind === "tokens") {
                  const session = store.getPiSession(input.session_id)!;
                  store.appendPiSessionEntry(input.session_id, {
                    id: "budget-output-entry",
                    parentId: session.leaf_id,
                    type: "message",
                    timestamp: new Date().toISOString(),
                    message: { role: "assistant", usage: { output: 2 } }
                  });
                } else {
                  await delay(120);
                }
                return { answer: "This result exceeded the total Task budget." };
              }
            };
          }
        }).execute(workerId),
        /exceeded its bounded budget/
      );
      assert.equal(engine.inspect(workerId)?.result_envelope, null);
    } finally {
      store.close();
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

test("a Supervisor Run waits, receives one advisory Result in a new Turn, verifies it, and alone completes the parent", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-supervisor-worker-closure-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const workerInspect = createWorkerInspectAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch, workerInspect], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    let parentLoopCalls = 0;
    let workerId = "";
    let childRunId = "";
    const parentRuntime = new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async (request) => {
            parentLoopCalls += 1;
            if (parentLoopCalls === 1) {
              const dispatched = await input.action_gateway.invoke({
                run_id: input.run_id,
                turn_id: input.turn_id,
                invocation_id: "supervisor-dispatch-call",
                action_name: workerDispatch.contract.name,
                arguments: validTaskInput()
              });
              assert.equal(dispatched.status, "completed");
              if (dispatched.status !== "completed") throw new Error("worker dispatch failed");
              workerId = String(dispatched.receipt.output.worker_id);
              return { answer: "Worker dispatched; parent acceptance remains pending." };
            }
            assert.equal(
              request,
              "Continue this same Supervisor Run by integrating the typed Worker Result runtime context."
            );
            assert.equal(input.runtime_context?.kind, "runtime_worker_result_delivery");
            assert.equal(JSON.stringify(input.runtime_context).includes(request), false);
            const verified = await input.action_gateway.invoke({
              run_id: input.run_id,
              turn_id: input.turn_id,
              invocation_id: "supervisor-verify-child-call",
              action_name: workerInspect.contract.name,
              arguments: { worker_id: workerId }
            });
            assert.equal(verified.status, "completed");
            return { answer: "Parent independently verified and integrated the child evidence." };
          }
        };
      }
    }, { orchestration: engine });

    const first = await parentRuntime.submit({
      request: "Use one bounded discussion worker, then verify and integrate its evidence.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    });
    assert.equal(first.status, "waiting");
    assert.ok(workerId);
    const firstTurnId = first.turn_id;
    assert.equal(parentRuntime.inspect(first.run_id)?.outstanding_worker_count, 1);
    const stillWaiting = await parentRuntime.continueRun(first.run_id);
    assert.equal(stillWaiting.status, "waiting");
    assert.equal(parentRuntime.inspect(first.run_id)?.execution_count, 1);

    const childGateway = new ActionGateway(store, [runtimeInspect]);
    const worker = await new DiscussionWorkerRuntime(store, childGateway, {
      create: () => ({
        execute: async () => ({ answer: "Child found bounded evidence for the supervisor." })
      })
    }).execute(workerId);
    childRunId = worker.child_run_id!;
    assert.equal(parentRuntime.inspect(first.run_id)?.status, "waiting");
    assert.equal(parentRuntime.inspect(first.run_id)?.deliverable_worker_count, 1);
    assert.equal(engine.inspect(workerId)?.result_delivered_to_turn_id, null);

    const integrated = await parentRuntime.continueRun(first.run_id);
    assert.equal(integrated.status, "completed");
    assert.notEqual(integrated.turn_id, firstTurnId);
    assert.equal(parentLoopCalls, 2);
    assert.match(integrated.answer ?? "", /independently verified/);
    const parent = parentRuntime.inspect(first.run_id);
    assert.equal(parent?.status, "completed");
    assert.equal(parent?.execution_count, 2);
    assert.equal(parent?.continuation_count, 1);
    assert.equal(parent?.worker_count, 1);
    assert.equal(parent?.outstanding_worker_count, 0);
    assert.equal(parent?.deliverable_worker_count, 0);
    assert.equal(engine.inspect(workerId)?.result_delivered_to_turn_id, integrated.turn_id);
    assert.equal(store.inspectRun(childRunId)?.status, "completed");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Worker Result cross-record identity drift rejects delivery and leaves the parent waiting", async () => {
  for (const driftKind of ["child_session", "actual_execution"] as const) {
    const fixture = await mkdtemp(join(tmpdir(), `evi-worker-delivery-drift-${driftKind}-`));
    const sqlite = join(fixture, "runtime.sqlite");
    const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
    try {
      const runtimeInspect = createRuntimeInspectAction(store);
      const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
      const workerDispatch = createDiscussionWorkerDispatchAction(engine);
      const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
        allowed_effect_classes: ["none", "local_read", "external_read"]
      });
      let workerId = "";
      const parentRuntime = new KernelRuntime(store, parentGateway, {
        create(input) {
          return {
            execute: async () => {
              const dispatched = await input.action_gateway.invoke({
                run_id: input.run_id,
                turn_id: input.turn_id,
                invocation_id: `delivery-drift-call-${driftKind}`,
                action_name: workerDispatch.contract.name,
                arguments: validTaskInput()
              });
              assert.equal(dispatched.status, "completed");
              if (dispatched.status !== "completed") throw new Error("worker dispatch failed");
              workerId = String(dispatched.receipt.output.worker_id);
              return { answer: "Wait for exact Worker Result identity." };
            }
          };
        }
      }, { orchestration: engine });
      const parent = await parentRuntime.submit({
        request: "Do not integrate drifted child evidence.",
        execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
      });
      assert.equal(parent.status, "waiting");
      const completed = await new DiscussionWorkerRuntime(
        store,
        new ActionGateway(store, [runtimeInspect]),
        { create: () => ({ execute: async () => ({ answer: "Canonical child evidence." }) }) }
      ).execute(workerId);
      assert.ok(completed.result_envelope);

      const raw = new DatabaseSync(sqlite);
      try {
        if (driftKind === "child_session") {
          raw.prepare("UPDATE worker_sessions SET child_session_id = ? WHERE id = ?")
            .run(parent.session_id, workerId);
        } else {
          const drifted = materializeResultEnvelope({
            ...completed.result_envelope!,
            actual_execution: {
              ...completed.result_envelope!.actual_execution,
              execution_id: "execution_00000000000000000000000000000000"
            }
          });
          raw.prepare(`
            UPDATE worker_sessions
            SET result_envelope_digest = ?, result_envelope_json = ?
            WHERE id = ?
          `).run(drifted.digest, JSON.stringify(drifted), workerId);
        }
      } finally {
        raw.close();
      }

      await assert.rejects(
        () => parentRuntime.continueRun(parent.run_id),
        /Worker Result (delivery|execution) identity drifted/
      );
      assert.equal(parentRuntime.inspect(parent.run_id)?.status, "waiting");
      assert.equal(store.inspectWorker(workerId)?.result_delivered_to_turn_id, null);
    } finally {
      store.close();
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

function validTaskInput() {
  return {
    objective: "Analyze bounded evidence.",
    expected_result: "Return findings.",
    context_refs: ["docs/ARCHITECTURE.md"],
    artifact_refs: ["artifact:architecture-snapshot"],
    constraints: ["read-only"],
    verification_requirements: ["cite explicit refs"],
    deadline_at: new Date(Date.now() + 60_000).toISOString(),
    budget: { max_output_tokens: 1_000, timeout_ms: 30_000 }
  };
}
