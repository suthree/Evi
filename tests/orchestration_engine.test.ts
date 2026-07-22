import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { Type } from "typebox";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import {
  ActionGateway,
  createDiscussionWorkerDispatchAction,
  createLockedOpenAICompatiblePiLoopFactory,
  createRuntimeInspectAction,
  createWorkerInspectAction,
  createWorkerNeedsInputAction,
  DiscussionWorkerRuntime,
  KernelRuntime,
  MAX_RUNTIME_TIMEOUT_MS,
  materializeResultEnvelope,
  materializeTaskEnvelope,
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
    assert.equal(engine.inspect(workerId)?.reservation_id, first.reservation.id);
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
    assert.equal(engine.inspect("missing"), null);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("discussion-worker timeout budget rejects Node timer overflow before reservation", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-orchestration-timeout-bound-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const gateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const started = store.beginRun({
      request: "Reject a timeout that Node would collapse to one millisecond.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    }, 30_000);
    const denied = await gateway.invoke({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "overflow-timeout-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: {
        ...validTaskInput(),
        budget: { max_output_tokens: 1_000, timeout_ms: MAX_RUNTIME_TIMEOUT_MS + 1 }
      }
    });
    assert.equal(denied.status, "denied");
    assert.match(denied.status === "denied" ? denied.reason : "", /arguments do not match|timeout/iu);
    assert.equal(store.inspectRun(started.run.id)?.action_count, 0);
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
        engine.inspect(expectedWorkerId)?.id ?? null,
        crashPoint === "after_worker" ? expectedWorkerId : null
      );

      const recoveryGateway = new ActionGateway(store, [runtimeInspect, durableHandler], {
        allowed_effect_classes: ["none", "local_read", "external_read"]
      });
      const recovered = await recoveryGateway.reconcileRun(parent.run.id);
      assert.equal(recovered[0]?.status, "completed");
      assert.equal(engine.inspect(expectedWorkerId)?.reservation_id, first.reservation.id);
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

test("worker claim and Result delivery reject Task drift from the dispatch reservation receipt", async () => {
  for (const driftPhase of ["claim", "result"] as const) {
    const fixture = await mkdtemp(join(tmpdir(), `evi-worker-task-drift-${driftPhase}-`));
    const sqlite = join(fixture, "runtime.sqlite");
    const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
    try {
      const runtimeInspect = createRuntimeInspectAction(store);
      const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
      const workerDispatch = createDiscussionWorkerDispatchAction(engine);
      const gateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
        allowed_effect_classes: ["none", "local_read", "external_read"]
      });
      const parent = store.beginRun({
        request: "Reject any Task that was not authorized by the exact dispatch receipt.",
        execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
      }, 30_000);
      const dispatched = await gateway.invoke({
        run_id: parent.run.id,
        turn_id: parent.run.turn_id,
        invocation_id: `task-drift-${driftPhase}`,
        action_name: workerDispatch.contract.name,
        arguments: validTaskInput()
      });
      assert.equal(dispatched.status, "completed");
      if (dispatched.status !== "completed") continue;
      const workerId = String(dispatched.receipt.output.worker_id);
      const original = engine.inspect(workerId)!;
      const claimed = driftPhase === "result" ? store.claimWorker(workerId, 30_000) : null;
      let result: ReturnType<typeof materializeResultEnvelope> | null = null;
      if (claimed) {
        const child = store.beginRun({
          request: "Execute only the receipt-bound Task.",
          execution_lock: claimed.worker.child_execution_lock
        }, 30_000, {
          worker_id: workerId,
          owner_token: claimed.lease.owner_token
        });
        store.completeRun(child.execution, "Canonical Task result.");
        result = materializeResultEnvelope({
          worker_id: workerId,
          child_run_id: child.run.id,
          status: "completed",
          summary: "Canonical Task result.",
          findings: {
            budget_violation: {
              output_tokens_exceeded: false,
              timeout_exceeded: false,
              deadline_exceeded: false
            }
          },
          artifact_refs: [],
          evidence_refs: [],
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
          consumed: { output_tokens: 0, duration_ms: 0 },
          created_at: new Date().toISOString()
        });
      }

      const driftedTask = materializeTaskEnvelope({
        task_id: original.task_envelope.task_id,
        parent_run_id: original.parent_run_id,
        parent_turn_id: original.parent_turn_id,
        objective: "Execute a different objective that the reservation never authorized.",
        expected_result: original.task_envelope.expected_result,
        context_refs: original.task_envelope.context_refs,
        artifact_refs: original.task_envelope.artifact_refs,
        constraints: original.task_envelope.constraints,
        verification_requirements: original.task_envelope.verification_requirements,
        child_execution_lock_digest: original.child_execution_lock.digest,
        deadline_at: original.task_envelope.deadline_at,
        budget: original.task_envelope.budget
      });
      const raw = new DatabaseSync(sqlite);
      try {
        raw.prepare(`
          UPDATE worker_sessions
          SET task_envelope_digest = ?, task_envelope_json = ?
          WHERE id = ?
        `).run(driftedTask.digest, JSON.stringify(driftedTask), workerId);
      } finally {
        raw.close();
      }

      if (driftPhase === "claim") {
        assert.throws(() => store.claimWorker(workerId, 30_000), /Worker reservation identity drifted/);
        assert.equal(store.inspectWorker(workerId)?.status, "queued");
      } else {
        assert.ok(claimed && result);
        assert.throws(
          () => store.completeWorker(claimed!.lease, result!),
          /Worker reservation identity drifted/
        );
        assert.equal(store.inspectWorker(workerId)?.status, "running");
      }
    } finally {
      store.close();
      await rm(fixture, { recursive: true, force: true });
    }
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

test("worker total token and time overruns produce one failed Result without rerunning the child", async () => {
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
      assert.equal(store.waitRun(parent.execution, "Wait for bounded Worker evidence.").status, "waiting");
      const completed = await new DiscussionWorkerRuntime(
        store,
        new ActionGateway(store, [runtimeInspect]),
        {
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
        }
      ).execute(workerId);
      assert.equal(completed.status, "failed");
      assert.equal(completed.result_envelope?.status, "failed");
      assert.match(completed.result_envelope?.summary ?? "", /exceeded its bounded Task budget/);
      assert.equal(
        completed.result_envelope?.findings.budget_violation[budgetKind === "tokens"
          ? "output_tokens_exceeded"
          : "timeout_exceeded"],
        true
      );
      const childRunId = completed.child_run_id!;
      const childExecutionCount = store.inspectRun(childRunId)?.execution_count;
      await assert.rejects(
        () => new DiscussionWorkerRuntime(
          store,
          new ActionGateway(store, [runtimeInspect]),
          { create: () => ({ execute: async () => ({ answer: "must not run" }) }) }
        ).execute(workerId),
        /cannot be claimed/
      );
      assert.equal(store.inspectRun(childRunId)?.execution_count, childExecutionCount);
      const resumed = engine.resumeSupervisor(parent.run.id, 100);
      assert.ok(resumed);
      assert.equal(resumed.runtime_context.kind, "runtime_worker_result_delivery");
      assert.match(JSON.stringify(resumed.runtime_context), /exceeded its bounded Task budget/);
      store.failRun(resumed.execution, "Test-only integration stop after validating failed Result delivery.");
    } finally {
      store.close();
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

test("worker protocol recovery reports the original answer-producing model execution", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-producer-lineage-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    const parent = store.beginRun({
      request: "Preserve the actual Worker model producer across protocol recovery.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        contracts: parentGateway.contracts()
      })
    }, 30_000);
    const dispatched = await parentGateway.invoke({
      run_id: parent.run.id,
      turn_id: parent.run.turn_id,
      invocation_id: "producer-lineage-worker-call",
      action_name: workerDispatch.contract.name,
      arguments: validTaskInput()
    });
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    const claimed = engine.claim(workerId, 100);
    const child = store.beginRun({
      request: "Execute typed Worker context.",
      execution_lock: claimed.worker.child_execution_lock
    }, 100, {
      worker_id: workerId,
      owner_token: claimed.lease.owner_token
    });
    const producerDispatch = store.startModelDispatch(child.execution, {
      provider: claimed.worker.child_execution_lock.model.provider,
      model: claimed.worker.child_execution_lock.model.model
    });
    store.observeModelResponse(child.execution, producerDispatch.id, 200);
    const assistant = fauxAssistantMessage("Recovered Worker evidence from the original producer.");
    store.appendPiSessionEntry(child.run.session_id, {
      id: "persisted-worker-final-answer",
      parentId: null,
      type: "message",
      timestamp: new Date().toISOString(),
      message: assistant
    });
    await delay(150);

    const completed = await new DiscussionWorkerRuntime(
      store,
      new ActionGateway(store, [runtimeInspect]),
      createLockedOpenAICompatiblePiLoopFactory({
        store,
        execution_lock: claimed.worker.child_execution_lock,
        api_key: "synthetic-worker-lineage-key"
      }),
      { worker_lease_ms: 100, run_execution_lease_ms: 100 }
    ).execute(workerId);
    assert.equal(completed.status, "completed");
    assert.equal(completed.result_envelope?.actual_execution.execution_id, child.execution.id);
    assert.equal(completed.result_envelope?.actual_execution.execution_ordinal, 1);
    assert.deepEqual(completed.result_envelope?.actual_execution.model_dispatch_ids, [
      producerDispatch.id
    ]);
    assert.equal(
      completed.result_envelope?.actual_execution.provider,
      claimed.worker.child_execution_lock.model.provider
    );
    assert.equal(
      completed.result_envelope?.actual_execution.model,
      claimed.worker.child_execution_lock.model.model
    );
    assert.equal(store.inspectRun(child.run.id)?.execution_count, 2);
    assert.equal(store.inspectRun(child.run.id)?.unknown_model_dispatch_count, 0);
    assert.equal(store.inspectRun(child.run.id)?.model_dispatch_count, 1);
    const raw = new DatabaseSync(join(fixture, "runtime.sqlite"));
    try {
      const reconciled = raw.prepare(
        "SELECT message_digest FROM model_dispatches WHERE id = ?"
      ).get(producerDispatch.id) as { message_digest: string };
      assert.equal(
        reconciled.message_digest,
        createHash("sha256").update(JSON.stringify(assistant)).digest("hex")
      );
    } finally {
      raw.close();
    }
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
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

test("Supervisor integration failure pauses and later recovers the same Run and Result Turn", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-supervisor-integration-failure-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    let workerId = "";
    let loopCalls = 0;
    const supervisor = new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async (request) => {
            loopCalls += 1;
            if (loopCalls === 1) {
              const dispatched = await input.action_gateway.invoke({
                run_id: input.run_id,
                turn_id: input.turn_id,
                invocation_id: "integration-failure-worker-call",
                action_name: workerDispatch.contract.name,
                arguments: validTaskInput()
              });
              assert.equal(dispatched.status, "completed");
              if (dispatched.status !== "completed") throw new Error("worker dispatch failed");
              workerId = String(dispatched.receipt.output.worker_id);
              return { answer: "Wait for integration evidence." };
            }
            assert.equal(input.runtime_context?.kind, "runtime_worker_result_delivery");
            if (loopCalls === 2) {
              assert.match(request, /Continue this same Supervisor Run/);
              throw new Error("synthetic integration transport failure");
            }
            assert.match(request, /Retry this same Supervisor Turn/);
            assert.match(JSON.stringify(input.runtime_context), /Recover this advisory Result/);
            return { answer: "Recovered the same integration Turn." };
          }
        };
      }
    }, { orchestration: engine });
    const parent = await supervisor.submit({
      request: "Recover a technical integration failure without losing the Result.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    });
    assert.equal(parent.status, "waiting");
    await new DiscussionWorkerRuntime(
      store,
      new ActionGateway(store, [runtimeInspect]),
      { create: () => ({ execute: async () => ({ answer: "Recover this advisory Result." }) }) }
    ).execute(workerId);

    const paused = await supervisor.continueRun(parent.run_id);
    assert.equal(paused.status, "paused");
    assert.notEqual(paused.turn_id, parent.turn_id);
    assert.match(paused.error ?? "", /synthetic integration transport failure/);
    const integrationTurnId = paused.turn_id;
    assert.equal(engine.inspect(workerId)?.result_delivered_to_turn_id, integrationTurnId);

    const recovered = await supervisor.continueRun(parent.run_id);
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.turn_id, integrationTurnId);
    assert.match(recovered.answer ?? "", /Recovered the same integration Turn/);
    assert.equal(supervisor.inspect(parent.run_id)?.execution_count, 3);
    assert.equal(loopCalls, 3);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Worker Result cross-record identity drift rejects delivery and leaves the parent waiting", async () => {
  for (const driftKind of [
    "child_session",
    "actual_execution",
    "result_status",
    "needs_input_receipt"
  ] as const) {
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
        } else if (driftKind === "actual_execution") {
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
        } else {
          const drifted = materializeResultEnvelope({
            ...completed.result_envelope!,
            status: "needs_input",
            unresolved_questions: ["Forged parent input request."],
            proposed_next_step: "Accept a forged input request without its typed Action receipt."
          });
          raw.prepare(`
            UPDATE worker_sessions
            SET status = ?, result_envelope_digest = ?, result_envelope_json = ?
            WHERE id = ?
          `).run(
            driftKind === "needs_input_receipt" ? "needs_input" : completed.status,
            drifted.digest,
            JSON.stringify(drifted),
            workerId
          );
        }
      } finally {
        raw.close();
      }

      await assert.rejects(
        () => parentRuntime.continueRun(parent.run_id),
        /Worker (Result (delivery|execution) identity drifted|Session Result Envelope status is invalid|Result needs_input evidence is not exact)/
      );
      assert.equal(parentRuntime.inspect(parent.run_id)?.status, "waiting");
      const inspection = new DatabaseSync(sqlite);
      try {
        const row = inspection.prepare(`
          SELECT result_delivered_to_turn_id
          FROM worker_sessions
          WHERE id = ?
        `).get(workerId) as { result_delivered_to_turn_id: string | null };
        assert.equal(row.result_delivered_to_turn_id, null);
      } finally {
        inspection.close();
      }
    } finally {
      store.close();
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

test("Supervisor integration recovery rebuilds delivered Result runtime context from SQLite", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-integration-recovery-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    let workerId = "";
    const planner = new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async () => {
            const dispatched = await input.action_gateway.invoke({
              run_id: input.run_id,
              turn_id: input.turn_id,
              invocation_id: "integration-recovery-worker-call",
              action_name: workerDispatch.contract.name,
              arguments: validTaskInput()
            });
            assert.equal(dispatched.status, "completed");
            if (dispatched.status !== "completed") throw new Error("worker dispatch failed");
            workerId = String(dispatched.receipt.output.worker_id);
            return { answer: "Wait before integration." };
          }
        };
      }
    }, { orchestration: engine, execution_lease_ms: 100 });
    const parent = await planner.submit({
      request: "Recover integration from canonical typed context.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    });
    assert.equal(parent.status, "waiting");
    await new DiscussionWorkerRuntime(
      store,
      new ActionGateway(store, [runtimeInspect]),
      { create: () => ({ execute: async () => ({ answer: "Recoverable advisory evidence." }) }) }
    ).execute(workerId);

    const resumed = engine.resumeSupervisor(parent.run_id, 100);
    assert.ok(resumed);
    assert.equal(resumed.runtime_context.kind, "runtime_worker_result_delivery");
    await delay(150);

    const paused = await new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async (request) => {
            assert.match(request, /runtime_tool_protocol_recovery_evidence/);
            assert.equal(input.runtime_context?.kind, "runtime_worker_result_delivery");
            assert.match(JSON.stringify(input.runtime_context), /Recoverable advisory evidence/);
            throw new Error("synthetic recovered integration failure");
          }
        };
      }
    }, { orchestration: engine, execution_lease_ms: 100 }).continueRun(parent.run_id);
    assert.equal(paused.status, "paused");
    assert.equal(paused.turn_id, resumed.run.turn_id);
    assert.match(paused.error ?? "", /synthetic recovered integration failure/);

    const recovered = await new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async (request) => {
            assert.match(request, /Retry this same Supervisor Turn/);
            assert.equal(input.runtime_context?.kind, "runtime_worker_result_delivery");
            assert.match(JSON.stringify(input.runtime_context), /Recoverable advisory evidence/);
            return { answer: "Recovered and integrated canonical Worker evidence." };
          }
        };
      }
    }, { orchestration: engine, execution_lease_ms: 100 }).continueRun(parent.run_id);
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.turn_id, resumed.run.turn_id);
    assert.equal(engine.inspect(workerId)?.result_delivered_to_turn_id, recovered.turn_id);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Supervisor action continuation failure remains paused and resumes the same Result Turn", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-worker-action-continuation-recovery-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const recoverable: ActionHandler = {
      contract: {
        name: "integration_recovery_probe",
        version: "1",
        label: "Integration recovery probe",
        description: "Create one uncertain local-read result and reconcile it exactly.",
        parameters: Type.Object({}, { additionalProperties: false }),
        effect_class: "local_read"
      },
      prepare: () => ({}),
      execute: async () => {
        throw new Error("synthetic uncertain integration Action");
      },
      reconcile: async () => ({
        outcome: "succeeded",
        summary: "The synthetic integration Action was reconciled.",
        output: { recovered: true }
      })
    };
    const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
    const workerDispatch = createDiscussionWorkerDispatchAction(engine);
    const parentGateway = new ActionGateway(store, [runtimeInspect, recoverable, workerDispatch], {
      allowed_effect_classes: ["none", "local_read", "external_read"]
    });
    let workerId = "";
    const planner = new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async () => {
            const dispatched = await input.action_gateway.invoke({
              run_id: input.run_id,
              turn_id: input.turn_id,
              invocation_id: "action-continuation-worker-call",
              action_name: workerDispatch.contract.name,
              arguments: validTaskInput()
            });
            assert.equal(dispatched.status, "completed");
            if (dispatched.status !== "completed") throw new Error("worker dispatch failed");
            workerId = String(dispatched.receipt.output.worker_id);
            return { answer: "Wait before Action-continuation integration." };
          }
        };
      }
    }, { orchestration: engine });
    const parent = await planner.submit({
      request: "Recover a failed Action continuation on the exact Result Turn.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: parentGateway.contracts() })
    });
    assert.equal(parent.status, "waiting");
    await new DiscussionWorkerRuntime(
      store,
      new ActionGateway(store, [runtimeInspect]),
      { create: () => ({ execute: async () => ({ answer: "Action-continuation evidence." }) }) }
    ).execute(workerId);

    const uncertain = await new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async () => {
            assert.equal(input.runtime_context?.kind, "runtime_worker_result_delivery");
            const observed = await input.action_gateway.invoke({
              run_id: input.run_id,
              turn_id: input.turn_id,
              invocation_id: "uncertain-integration-action",
              action_name: recoverable.contract.name,
              arguments: {}
            });
            assert.equal(observed.status, "outcome_unknown");
            return { answer: "Pause until the exact Action outcome is reconciled." };
          }
        };
      }
    }, { orchestration: engine }).continueRun(parent.run_id);
    assert.equal(uncertain.status, "paused");
    const integrationTurnId = uncertain.turn_id;
    assert.equal(engine.inspect(workerId)?.result_delivered_to_turn_id, integrationTurnId);

    const continuationPaused = await new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async (request) => {
            assert.match(request, /runtime_action_recovery_evidence/);
            assert.equal(input.runtime_context?.kind, "runtime_worker_result_delivery");
            throw new Error("synthetic action continuation integration failure");
          }
        };
      }
    }, { orchestration: engine }).continueRun(parent.run_id);
    assert.equal(continuationPaused.status, "paused");
    assert.equal(continuationPaused.turn_id, integrationTurnId);
    assert.match(continuationPaused.error ?? "", /synthetic action continuation integration failure/);

    const recovered = await new KernelRuntime(store, parentGateway, {
      create(input) {
        return {
          execute: async (request) => {
            assert.match(request, /Retry this same Supervisor Turn/);
            assert.equal(input.runtime_context?.kind, "runtime_worker_result_delivery");
            assert.match(JSON.stringify(input.runtime_context), /Action-continuation evidence/);
            return { answer: "Integrated the Result after Action-continuation recovery." };
          }
        };
      }
    }, { orchestration: engine }).continueRun(parent.run_id);
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.turn_id, integrationTurnId);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
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
