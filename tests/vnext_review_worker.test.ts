import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  ActionGateway,
  createExecutionWorkerDispatchAction,
  createReviewWorkerDispatchAction,
  createRuntimeInspectAction,
  ExecutionWorkerRuntime,
  KernelRuntime,
  OrchestrationEngine,
  ReviewWorkerRuntime,
  SqliteRuntimeStore,
  type AgentLoopFactory,
  type ExecutionAdapterResult,
  type ExecutionTaskEnvelope,
  type ExecutionWorkerExecutor
} from "../packages/kernel/src/index.js";
import type { JsonObject } from "../packages/kernel/src/action_types.js";
import { stableJson } from "../packages/kernel/src/canonical_json.js";
import { captureReviewEvidencePacket } from "../packages/kernel/src/review_evidence_capture.js";
import { materializeReviewResultEnvelope } from "../packages/kernel/src/review_worker_types.js";
import {
  executeVNextWorker,
  VNEXT_REVIEW_WORKER_MARKER
} from "../apps/cli/src/vnext_worker.js";
import { testExecutionLock } from "./vnext_test_support.js";

const execFileAsync = promisify(execFile);

test("a delivered execution Result receives one independent approved review and a later Supervisor Turn", async () => {
  const fixture = await createGitFixture("approved");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    const reviewDispatch = await flow.gateway.invoke(reviewInvocation(
      flow.resumed.run.id,
      flow.resumed.run.turn_id,
      flow.executionWorker.id,
      "review-approved"
    ));
    assert.equal(reviewDispatch.status, "completed", JSON.stringify(reviewDispatch));
    if (reviewDispatch.status !== "completed") return;
    const reviewWorker = store.inspectReviewWorker(String(reviewDispatch.receipt.output.worker_id));
    assert.ok(reviewWorker);
    assert.equal(reviewWorker.execution_worker_id, flow.executionWorker.id);
    assert.deepEqual(reviewWorker.task_envelope.review_packet.changed_paths, ["src/feature.txt"]);
    assert.equal(reviewWorker.task_envelope.review_packet.files[0]?.before, "baseline\n");
    assert.equal(reviewWorker.task_envelope.review_packet.files[0]?.after, "reviewed change\n");
    assert.deepEqual(reviewWorker.child_execution_lock.actions, [{
      name: "runtime_inspect",
      version: "1",
      effect_class: "local_read"
    }]);

    const waiting = flow.engine.settleSupervisorTurn(
      flow.resumed.execution,
      "Wait for independent Reviewer evidence."
    );
    assert.equal(waiting?.status, "waiting");
    const runtimeInspect = createRuntimeInspectAction(store);
    const completed = await new ReviewWorkerRuntime(
      store,
      new ActionGateway(store, [runtimeInspect]),
      reviewLoop(store, { verdict: "approved", summary: "No actionable findings.", findings: [] })
    ).execute(reviewWorker.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.result_envelope?.verdict, "approved");
    assert.deepEqual(completed.result_envelope?.findings, []);
    const { schema_version: _schema, result_kind: _kind, digest: _digest, ...resultBody }
      = completed.result_envelope!;
    assert.throws(
      () => materializeReviewResultEnvelope({
        ...resultBody,
        verdict: "unsupported_verdict" as never
      }),
      /verdict contradicts/iu
    );
    assert.notEqual(completed.child_run_id, null);
    assert.notEqual(completed.child_session_id, flow.resumed.run.session_id);

    const delivered = flow.engine.resumeSupervisor(flow.resumed.run.id, 30_000);
    assert.ok(delivered);
    assert.equal(delivered.runtime_context.kind, "runtime_worker_result_delivery");
    assert.match(JSON.stringify(delivered.runtime_context), /"worker_kind":"review"/u);
    assert.match(JSON.stringify(delivered.runtime_context), /"verdict":"approved"/u);
    assert.equal(store.inspectRun(flow.resumed.run.id)?.status, "running");
    assert.equal(
      store.inspectReviewWorker(reviewWorker.id)?.result_delivered_to_turn_id,
      delivered.run.turn_id
    );
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("review findings require changes while malformed or contradictory output fails without replay", async () => {
  for (const scenario of ["findings", "malformed", "contradictory"] as const) {
    const fixture = await createGitFixture(scenario);
    const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
      state_profile: "stable_cli"
    });
    try {
      const flow = await completedExecutionFlow(store, fixture);
      const dispatched = await flow.gateway.invoke(reviewInvocation(
        flow.resumed.run.id,
        flow.resumed.run.turn_id,
        flow.executionWorker.id,
        `review-${scenario}`
      ));
      assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
      if (dispatched.status !== "completed") continue;
      const workerId = String(dispatched.receipt.output.worker_id);
      let calls = 0;
      const answer = scenario === "findings"
        ? JSON.stringify({
          verdict: "changes_required",
          summary: "One blocking correctness issue.",
          findings: [{
            priority: 1,
            path: "src/feature.txt",
            line: 1,
            title: "Synthetic correctness issue",
            rationale: "The changed value does not meet the stated review checklist."
          }]
        })
        : scenario === "malformed"
          ? "not-json"
          : JSON.stringify({
            verdict: "approved",
            summary: "Contradictory approval.",
            findings: [{
              priority: 2,
              path: "src/feature.txt",
              line: 1,
              title: "Still a finding",
              rationale: "An approved verdict cannot carry findings."
            }]
          });
      const completed = await new ReviewWorkerRuntime(
        store,
        new ActionGateway(store, [createRuntimeInspectAction(store)]),
        { create: (input) => ({ execute: async () => {
          calls += 1;
          recordReviewModelDispatch(store, input);
          return { answer };
        } }) }
      ).execute(workerId);
      if (scenario === "findings") {
        assert.equal(completed.status, "completed");
        assert.equal(completed.result_envelope?.verdict, "changes_required");
        assert.equal(completed.result_envelope?.findings.length, 1);
      } else {
        assert.equal(completed.status, "failed");
        assert.equal(completed.result_envelope?.verdict, null);
        assert.deepEqual(completed.result_envelope?.findings, []);
        await assert.rejects(
          () => new ReviewWorkerRuntime(
            store,
            new ActionGateway(store, [createRuntimeInspectAction(store)]),
            { create: (input) => ({ execute: async () => {
              calls += 1;
              recordReviewModelDispatch(store, input);
              return { answer };
            } }) }
          ).execute(workerId),
          /cannot be claimed/iu
        );
      }
      assert.equal(calls, 1);
    } finally {
      store.close();
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test("Reviewer budget overrun and write-capable child composition fail closed", async () => {
  const fixture = await createGitFixture("budget-authority");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    const writeGateway = new ActionGateway(
      store,
      [createExecutionWorkerDispatchAction(flow.engine)],
      { allowed_effect_classes: ["local_write"] }
    );
    assert.throws(
      () => new ReviewWorkerRuntime(store, writeGateway, reviewLoop(store, {
        verdict: "approved",
        summary: "This composition must never run.",
        findings: []
      })),
      /Actions must be none or local_read/iu
    );

    const invocation = reviewInvocation(
      flow.resumed.run.id,
      flow.resumed.run.turn_id,
      flow.executionWorker.id,
      "review-budget-overrun"
    );
    invocation.arguments.budget = { max_output_tokens: 800, timeout_ms: 5 };
    const dispatched = await flow.gateway.invoke(invocation);
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    const workerId = String(dispatched.receipt.output.worker_id);
    let calls = 0;
    const failed = await new ReviewWorkerRuntime(
      store,
      new ActionGateway(store, [createRuntimeInspectAction(store)]),
      { create: (input) => ({ execute: async () => {
        calls += 1;
        recordReviewModelDispatch(store, input);
        await delay(20);
        return {
          answer: JSON.stringify({
            verdict: "approved",
            summary: "Too late to become authoritative.",
            findings: []
          })
        };
      } }) }
    ).execute(workerId);
    assert.equal(failed.status, "failed");
    assert.equal(failed.result_envelope?.verdict, null);
    assert.deepEqual(failed.result_envelope?.findings, []);
    assert.match(failed.result_envelope?.summary ?? "", /budget|time/iu);
    assert.equal(calls, 1);
    await assert.rejects(
      () => new ReviewWorkerRuntime(
        store,
        new ActionGateway(store, [createRuntimeInspectAction(store)]),
        reviewLoop(store, { verdict: "approved", summary: "No replay.", findings: [] })
      ).execute(workerId),
      /cannot be claimed/iu
    );
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Reviewer dispatch fails before reservation for undelivered, cross-parent, and drifted subjects", async () => {
  const fixture = await createGitFixture("review-guards");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const composition = beginSupervisor(store, fixture.repository);
    const execution = await composition.gateway.invoke(executionInvocation(
      composition.started.run.id,
      composition.started.run.turn_id,
      fixture,
      "guard-execution"
    ));
    assert.equal(execution.status, "completed");
    if (execution.status !== "completed") return;
    const executionWorker = store.inspectExecutionWorker(String(execution.receipt.output.worker_id));
    assert.ok(executionWorker);
    await new ExecutionWorkerRuntime(store, fakeExecutor(async (task) => {
      await writeFile(join(task.lineage.worktree, "src", "feature.txt"), "reviewed change\n");
    })).execute(executionWorker.id);

    const undelivered = await composition.gateway.invoke(reviewInvocation(
      composition.started.run.id,
      composition.started.run.turn_id,
      executionWorker.id,
      "undelivered-review"
    ));
    assert.equal(undelivered.status, "denied");
    assert.equal(store.inspectRun(composition.started.run.id)?.action_count, 1);

    composition.engine.settleSupervisorTurn(composition.started.execution, "Deliver execution evidence.");
    const resumed = composition.engine.resumeSupervisor(composition.started.run.id, 30_000)!;
    const other = beginSupervisor(store, fixture.repository);
    const crossParent = await other.gateway.invoke(reviewInvocation(
      other.started.run.id,
      other.started.run.turn_id,
      executionWorker.id,
      "cross-parent-review"
    ));
    assert.equal(crossParent.status, "denied");
    assert.equal(store.inspectRun(other.started.run.id)?.action_count, 0);

    await writeFile(join(fixture.worktree, "src", "feature.txt"), "drift after execution\n");
    const drifted = await composition.gateway.invoke(reviewInvocation(
      resumed.run.id,
      resumed.run.turn_id,
      executionWorker.id,
      "drifted-review"
    ));
    assert.equal(drifted.status, "denied");
    assert.match(drifted.status === "denied" ? drifted.reason : "", /Lineage drifted/iu);
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Reviewer dispatch revalidates the exact Delivery Lineage snapshot after reservation", async () => {
  const fixture = await createGitFixture("dispatch-race");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    const base = createReviewWorkerDispatchAction(flow.engine);
    const racing = {
      ...base,
      async prepare(argumentsInput: unknown, invocation?: Parameters<typeof base.prepare>[1]) {
        const prepared = await base.prepare(argumentsInput, invocation);
        await writeFile(join(fixture.worktree, "src", "feature.txt"), "drift during reservation\n");
        return prepared;
      }
    };
    const gateway = new ActionGateway(store, [racing], {
      allowed_effect_classes: ["external_read"]
    });
    const result = await gateway.invoke(reviewInvocation(
      flow.resumed.run.id,
      flow.resumed.run.turn_id,
      flow.executionWorker.id,
      "review-dispatch-race"
    ));
    assert.equal(result.status, "outcome_unknown", JSON.stringify(result));
    if (result.status !== "outcome_unknown") return;
    assert.match(result.reason, /packet drifted|Lineage drifted/iu);
    assert.equal(
      store.inspectReviewWorker(String(result.reservation.arguments.worker_id)),
      null
    );
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Reviewer dispatch rejects post-execution Git mode drift with unchanged bytes", async () => {
  const fixture = await createGitFixture("mode-drift");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const composition = beginSupervisor(store, fixture.repository);
    const dispatched = await composition.gateway.invoke(executionInvocation(
      composition.started.run.id,
      composition.started.run.turn_id,
      fixture,
      "mode-drift-execution"
    ));
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    const executionWorker = store.inspectExecutionWorker(String(dispatched.receipt.output.worker_id));
    assert.ok(executionWorker);
    await new ExecutionWorkerRuntime(store, fakeExecutor(async (task) => {
      const path = join(task.lineage.worktree, "src", "feature.txt");
      await writeFile(path, "reviewed change\n");
      await chmod(path, 0o755);
    })).execute(executionWorker.id);
    composition.engine.settleSupervisorTurn(composition.started.execution, "Deliver mode-bound evidence.");
    const resumed = composition.engine.resumeSupervisor(composition.started.run.id, 30_000)!;
    await chmod(join(fixture.worktree, "src", "feature.txt"), 0o644);
    const rejected = await composition.gateway.invoke(reviewInvocation(
      resumed.run.id,
      resumed.run.turn_id,
      executionWorker.id,
      "mode-drift-review"
    ));
    assert.equal(rejected.status, "denied");
    assert.match(rejected.status === "denied" ? rejected.reason : "", /Lineage drifted/iu);
    assert.equal(store.inspectRun(resumed.run.id)?.action_count, 1);
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Reviewer evidence capture rejects binary and oversized changed content before reservation", async () => {
  for (const scenario of ["binary", "oversized"] as const) {
    const fixture = await createGitFixture(`packet-${scenario}`);
    const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
      state_profile: "stable_cli"
    });
    try {
      const composition = beginSupervisor(store, fixture.repository);
      const dispatched = await composition.gateway.invoke(executionInvocation(
        composition.started.run.id,
        composition.started.run.turn_id,
        fixture,
        `packet-execution-${scenario}`
      ));
      assert.equal(dispatched.status, "completed");
      if (dispatched.status !== "completed") continue;
      const executionWorker = store.inspectExecutionWorker(String(dispatched.receipt.output.worker_id));
      assert.ok(executionWorker);
      await new ExecutionWorkerRuntime(store, fakeExecutor(async (task) => {
        await writeFile(
          join(task.lineage.worktree, "src", "feature.txt"),
          scenario === "binary" ? Buffer.from([0, 1, 2, 3]) : "x".repeat(97 * 1024)
        );
      })).execute(executionWorker.id);
      composition.engine.settleSupervisorTurn(composition.started.execution, "Deliver execution evidence.");
      const resumed = composition.engine.resumeSupervisor(composition.started.run.id, 30_000)!;
      const rejected = await composition.gateway.invoke(reviewInvocation(
        resumed.run.id,
        resumed.run.turn_id,
        executionWorker.id,
        `packet-review-${scenario}`
      ));
      assert.equal(rejected.status, "denied");
      assert.match(
        rejected.status === "denied" ? rejected.reason : "",
        scenario === "binary" ? /binary content/iu : /exceeds 98304 bytes/iu
      );
      assert.equal(store.inspectRun(resumed.run.id)?.action_count, 1);
    } finally {
      store.close();
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test("Reviewer evidence rejects a non-UTF-8 symlink target without lossy normalization", async () => {
  const fixture = await createGitFixture("packet-invalid-symlink");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const composition = beginSupervisor(store, fixture.repository);
    const dispatched = await composition.gateway.invoke(executionInvocation(
      composition.started.run.id,
      composition.started.run.turn_id,
      fixture,
      "packet-invalid-symlink-execution"
    ));
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    const executionWorker = store.inspectExecutionWorker(String(dispatched.receipt.output.worker_id));
    assert.ok(executionWorker);
    await new ExecutionWorkerRuntime(store, fakeExecutor(async (task) => {
      await writeFile(join(task.lineage.worktree, "src", "feature.txt"), "reviewed change\n");
      await symlink(
        Buffer.from([0x62, 0x61, 0x64, 0xff]),
        join(task.lineage.worktree, "src", "invalid-link.txt")
      );
    })).execute(executionWorker.id);
    composition.engine.settleSupervisorTurn(composition.started.execution, "Deliver raw symlink evidence.");
    const resumed = composition.engine.resumeSupervisor(composition.started.run.id, 30_000)!;
    const rejected = await composition.gateway.invoke(reviewInvocation(
      resumed.run.id,
      resumed.run.turn_id,
      executionWorker.id,
      "packet-invalid-symlink-review"
    ));
    assert.equal(rejected.status, "denied");
    assert.match(rejected.status === "denied" ? rejected.reason : "", /non-UTF-8 content/iu);
    assert.equal(store.inspectRun(resumed.run.id)?.action_count, 1);
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Reviewer evidence rejects ABA bytes or mode that do not match the final snapshot", async () => {
  const fixture = await createGitFixture("packet-aba");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    for (const scenario of ["bytes", "mode"] as const) {
      await assert.rejects(
        () => captureReviewEvidencePacket(flow.executionWorker, {
          before_worktree_entry_read: async (path) => {
            if (path !== "src/feature.txt") return;
            if (scenario === "bytes") {
              await writeFile(join(fixture.worktree, path), "transient ABA bytes\n");
            } else {
              await chmod(join(fixture.worktree, path), 0o755);
            }
          },
          after_worktree_entry_read: async (path) => {
            if (path !== "src/feature.txt") return;
            if (scenario === "bytes") {
              await writeFile(join(fixture.worktree, path), "reviewed change\n");
            } else {
              await chmod(join(fixture.worktree, path), 0o644);
            }
          }
        }),
        /does not match the final snapshot/iu
      );
    }
    const stablePacket = await captureReviewEvidencePacket(flow.executionWorker);
    assert.equal(
      stablePacket.files.find((file) => file.path === "src/feature.txt")?.after,
      "reviewed change\n"
    );
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Reviewer evidence keeps legacy snapshot v1 readable but fails closed on missing mode identity", async () => {
  const fixture = await createGitFixture("packet-v1");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    const result = flow.executionWorker.result_envelope!;
    const { digest: _snapshotDigest, ...currentBody } = result.final_snapshot;
    const legacyBody = {
      ...currentBody,
      schema_version: 1 as const,
      path_digests: {
        "src/feature.txt": createHash("sha256").update("reviewed change\n").digest("hex")
      }
    };
    const legacySnapshot = {
      ...legacyBody,
      digest: createHash("sha256").update(stableJson(legacyBody)).digest("hex")
    };
    await assert.rejects(
      () => captureReviewEvidencePacket({
        ...flow.executionWorker,
        result_envelope: { ...result, final_snapshot: legacySnapshot }
      }),
      /requires a mode-bound Delivery Lineage snapshot/iu
    );
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Reviewer evidence packet represents exact text additions and deletions", async () => {
  const fixture = await createGitFixture("packet-add-delete");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const composition = beginSupervisor(store, fixture.repository);
    const dispatched = await composition.gateway.invoke(executionInvocation(
      composition.started.run.id,
      composition.started.run.turn_id,
      fixture,
      "packet-add-delete-execution"
    ));
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    const executionWorker = store.inspectExecutionWorker(String(dispatched.receipt.output.worker_id));
    assert.ok(executionWorker);
    const completed = await new ExecutionWorkerRuntime(store, fakeExecutor(async (task) => {
      await writeFile(join(task.lineage.worktree, "src", "feature.txt"), "reviewed change\n");
      await chmod(join(task.lineage.worktree, "src", "feature.txt"), 0o755);
      await writeFile(join(task.lineage.worktree, "src", "added.txt"), "added evidence\n");
      await symlink("feature.txt", join(task.lineage.worktree, "src", "link.txt"));
      await unlink(join(task.lineage.worktree, "src", "removed.txt"));
    })).execute(executionWorker.id);
    assert.equal(completed.status, "completed");
    composition.engine.settleSupervisorTurn(composition.started.execution, "Deliver exact file evidence.");
    const resumed = composition.engine.resumeSupervisor(composition.started.run.id, 30_000)!;
    const reviewed = await composition.gateway.invoke(reviewInvocation(
      resumed.run.id,
      resumed.run.turn_id,
      executionWorker.id,
      "packet-add-delete-review"
    ));
    assert.equal(reviewed.status, "completed", JSON.stringify(reviewed));
    if (reviewed.status !== "completed") return;
    const packet = store.inspectReviewWorker(String(reviewed.receipt.output.worker_id))!
      .task_envelope.review_packet;
    const added = packet.files.find((file) => file.path === "src/added.txt");
    const executable = packet.files.find((file) => file.path === "src/feature.txt");
    const link = packet.files.find((file) => file.path === "src/link.txt");
    const removed = packet.files.find((file) => file.path === "src/removed.txt");
    assert.deepEqual(added, {
      path: "src/added.txt",
      before_mode: null,
      after_mode: "100644",
      before: null,
      after: "added evidence\n"
    });
    assert.deepEqual(removed, {
      path: "src/removed.txt",
      before_mode: "100644",
      after_mode: null,
      before: "removed baseline\n",
      after: null
    });
    assert.equal(executable?.after_mode, "100755");
    assert.deepEqual(link, {
      path: "src/link.txt",
      before_mode: null,
      after_mode: "120000",
      before: null,
      after: "feature.txt"
    });
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("a terminal Reviewer child Run survives owner loss without replaying the model", async () => {
  const fixture = await createGitFixture("recovery");
  const sqlite = join(fixture.root, "state", "runtime.sqlite");
  let workerId = "";
  let childRunId = "";
  let calls = 0;
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    const dispatched = await flow.gateway.invoke(reviewInvocation(
      flow.resumed.run.id,
      flow.resumed.run.turn_id,
      flow.executionWorker.id,
      "review-recovery"
    ));
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    workerId = String(dispatched.receipt.output.worker_id);
    const claimed = store.claimReviewWorker(workerId, 100);
    const runtimeInspect = createRuntimeInspectAction(store);
    const gateway = new ActionGateway(store, [runtimeInspect]);
    const runtime = new KernelRuntime(
      store,
      gateway,
      {
        create: (input) => ({
          execute: async () => {
            calls += 1;
            const dispatch = store.startModelDispatch(input.execution, {
              provider: claimed.worker.child_execution_lock.model.provider,
              model: claimed.worker.child_execution_lock.model.model
            });
            store.observeModelResponse(input.execution, dispatch.id, 200);
            store.settleModelDispatch(input.execution, dispatch.id, {
              stop_reason: "stop",
              message_digest: "a".repeat(64)
            });
            const followup = store.startModelDispatch(input.execution, {
              provider: claimed.worker.child_execution_lock.model.provider,
              model: claimed.worker.child_execution_lock.model.model
            });
            store.observeModelResponse(input.execution, followup.id, 200);
            store.settleModelDispatch(input.execution, followup.id, {
              stop_reason: "stop",
              message_digest: "b".repeat(64)
            });
            return {
              answer: JSON.stringify({
                verdict: "approved",
                summary: "Persisted before the Worker owner disappeared.",
                findings: []
              })
            };
          }
        })
      },
      { execution_lease_ms: 100 }
    );
    const child = await runtime.submit({
      request: "Execute the immutable review task from typed runtime context.",
      execution_lock: claimed.worker.child_execution_lock
    }, {
      worker_id: workerId,
      owner_token: claimed.lease.owner_token
    }, JSON.parse(JSON.stringify({
      kind: "runtime_review_task_envelope",
      advisory_to_parent: true,
      parent_completion_authority: "supervisor_only",
      source_mutation_authority: "none",
      task: claimed.worker.task_envelope
    })) as JsonObject);
    assert.equal(child.status, "completed");
    childRunId = child.run_id;
    const raw = new DatabaseSync(sqlite);
    try {
      const dispatches = raw.prepare(`
        SELECT id FROM model_dispatches WHERE run_id = ? ORDER BY ordinal ASC
      `).all(childRunId) as Array<{ id: string }>;
      assert.equal(dispatches.length, 2);
      raw.prepare("UPDATE model_dispatches SET id = ? WHERE id = ?")
        .run("model_dispatch_z", dispatches[0]!.id);
      raw.prepare("UPDATE model_dispatches SET id = ? WHERE id = ?")
        .run("model_dispatch_a", dispatches[1]!.id);
    } finally {
      raw.close();
    }
    assert.equal(store.inspectReviewWorker(workerId)?.status, "running");
    assert.equal(store.inspectReviewWorker(workerId)?.child_run_id, childRunId);
    await delay(150);
  } finally {
    store.close();
  }

  const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const recovered = await new ReviewWorkerRuntime(
      reopened,
      new ActionGateway(reopened, [createRuntimeInspectAction(reopened)]),
      { create: () => ({ execute: async () => {
        calls += 1;
        throw new Error("terminal Reviewer evidence must not replay the model");
      } }) },
      { worker_lease_ms: 100, run_execution_lease_ms: 100 }
    ).execute(workerId);
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.child_run_id, childRunId);
    assert.equal(recovered.lease_ordinal, 2);
    assert.equal(recovered.result_envelope?.verdict, "approved");
    assert.equal(recovered.result_envelope?.actual_execution.provider, "test-provider");
    assert.equal(recovered.result_envelope?.actual_execution.model, "test-model");
    assert.deepEqual(recovered.result_envelope?.actual_execution.model_dispatch_ids, [
      "model_dispatch_z",
      "model_dispatch_a"
    ]);
    assert.equal(calls, 1);
    const raw = new DatabaseSync(sqlite, { readOnly: true });
    try {
      const ready = raw.prepare(`
        SELECT COUNT(*) AS count FROM runtime_events
        WHERE kind = 'review_worker_result_ready' AND payload_json LIKE ?
      `).get(`%${workerId}%`) as { count: number };
      assert.equal(Number(ready.count), 1);
    } finally {
      raw.close();
    }
  } finally {
    reopened.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("a completed Reviewer answer without a producing model dispatch cannot claim approval", async () => {
  const fixture = await createGitFixture("missing-model-evidence");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    const dispatched = await flow.gateway.invoke(reviewInvocation(
      flow.resumed.run.id,
      flow.resumed.run.turn_id,
      flow.executionWorker.id,
      "review-missing-model-evidence"
    ));
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    const completed = await new ReviewWorkerRuntime(
      store,
      new ActionGateway(store, [createRuntimeInspectAction(store)]),
      { create: () => ({ execute: async () => ({
        answer: JSON.stringify({
          verdict: "approved",
          summary: "This answer has no provider evidence.",
          findings: []
        })
      }) }) }
    ).execute(String(dispatched.receipt.output.worker_id));
    assert.equal(completed.status, "failed");
    assert.equal(completed.result_envelope?.verdict, null);
    assert.deepEqual(completed.result_envelope?.actual_execution.model_dispatch_ids, []);
    assert.match(completed.result_envelope?.summary ?? "", /no producing model dispatch/iu);
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("an interrupted zero-dispatch Reviewer child fails protocol recovery without model replay", async () => {
  const fixture = await createGitFixture("zero-dispatch-recovery");
  const sqlite = join(fixture.root, "state", "runtime.sqlite");
  let workerId = "";
  let childRunId = "";
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    const dispatched = await flow.gateway.invoke(reviewInvocation(
      flow.resumed.run.id,
      flow.resumed.run.turn_id,
      flow.executionWorker.id,
      "review-zero-dispatch-recovery"
    ));
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    workerId = String(dispatched.receipt.output.worker_id);
    const claimed = store.claimReviewWorker(workerId, 100);
    const child = store.beginRun({
      request: "Start the immutable review without reaching model dispatch.",
      execution_lock: claimed.worker.child_execution_lock
    }, 100, {
      worker_id: workerId,
      owner_token: claimed.lease.owner_token
    });
    childRunId = child.run.id;
    await delay(150);
  } finally {
    store.close();
  }

  const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  let calls = 0;
  try {
    const recovered = await new ReviewWorkerRuntime(
      reopened,
      new ActionGateway(reopened, [createRuntimeInspectAction(reopened)]),
      { create: () => ({ execute: async () => {
        calls += 1;
        throw new Error("zero-dispatch Reviewer recovery must not replay the model");
      } }) },
      { worker_lease_ms: 100, run_execution_lease_ms: 100 }
    ).execute(workerId);
    assert.equal(recovered.status, "failed");
    assert.equal(recovered.child_run_id, childRunId);
    assert.equal(recovered.result_envelope?.verdict, null);
    assert.deepEqual(recovered.result_envelope?.actual_execution.model_dispatch_ids, []);
    assert.match(recovered.result_envelope?.summary ?? "", /protocol recovery refuses model replay/iu);
    assert.equal(calls, 0);
    assert.equal(reopened.inspectRun(childRunId)?.status, "failed");
  } finally {
    reopened.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("stable vNext worker CLI inspects and executes the queued review kind", async () => {
  const fixture = await createGitFixture("cli");
  const stateRoot = join(fixture.root, "state");
  const configDir = join(fixture.root, "config");
  let workerId = "";
  let packetDigest = "";
  const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const flow = await completedExecutionFlow(store, fixture, [
      "test:model",
      `config_dir:${configDir}`,
      "test:credential"
    ]);
    const dispatched = await flow.gateway.invoke(reviewInvocation(
      flow.resumed.run.id,
      flow.resumed.run.turn_id,
      flow.executionWorker.id,
      "review-cli"
    ));
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    workerId = String(dispatched.receipt.output.worker_id);
    packetDigest = store.inspectReviewWorker(workerId)!.task_envelope.review_packet.digest;
  } finally {
    store.close();
  }
  try {
    const inspected = await executeVNextWorker({
      action: "inspect",
      worker_id: workerId,
      state_root: stateRoot,
      config_dir: configDir,
      repo_root: fixture.repository
    });
    assert.equal(inspected.worker.marker, VNEXT_REVIEW_WORKER_MARKER);
    assert.equal(inspected.worker.worker_kind, "review");
    assert.equal(inspected.worker.status, "queued");
    assert.equal(inspected.worker.inspection?.review_packet_digest, packetDigest);

    let calls = 0;
    const completed = await executeVNextWorker({
      action: "execute",
      worker_id: workerId,
      state_root: stateRoot,
      config_dir: configDir,
      repo_root: fixture.repository
    }, {
      load_model: async () => ({
        config_id: "test-test-model",
        provider: "test-provider",
        api: "chat_completions",
        base_url: "https://provider.example.test/v1",
        model: "test-model",
        credential_ref: "test-credential",
        api_key: "synthetic-review-key",
        reasoning_effort: null,
        context_window_tokens: 128_000,
        max_output_tokens: 2_400,
        timeout_ms: 120_000
      }),
      create_loop_factory: ({ store: cliStore }) => reviewLoop(cliStore, {
        verdict: "approved",
        summary: "CLI review completed.",
        findings: []
      }, () => { calls += 1; })
    });
    assert.equal(completed.worker.marker, VNEXT_REVIEW_WORKER_MARKER);
    assert.equal(completed.worker.status, "completed");
    assert.equal(calls, 1);
    const finalInspection = await executeVNextWorker({
      action: "inspect",
      worker_id: workerId,
      state_root: stateRoot,
      config_dir: configDir,
      repo_root: fixture.repository
    });
    assert.equal(finalInspection.worker.inspection?.result_envelope?.result_kind, "review");
    assert.equal(
      finalInspection.worker.inspection?.result_envelope?.result_kind === "review"
        ? finalInspection.worker.inspection.result_envelope.verdict
        : null,
      "approved"
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("the common Worker ledger fails closed when a review binding disappears", async () => {
  const fixture = await createGitFixture("missing-binding");
  const sqlite = join(fixture.root, "state", "runtime.sqlite");
  let workerId = "";
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const flow = await completedExecutionFlow(store, fixture);
    const dispatched = await flow.gateway.invoke(reviewInvocation(
      flow.resumed.run.id,
      flow.resumed.run.turn_id,
      flow.executionWorker.id,
      "review-missing-binding"
    ));
    assert.equal(dispatched.status, "completed", JSON.stringify(dispatched));
    if (dispatched.status !== "completed") return;
    workerId = String(dispatched.receipt.output.worker_id);
  } finally {
    store.close();
  }
  const drifted = new DatabaseSync(sqlite);
  try {
    drifted.exec("PRAGMA foreign_keys = OFF");
    drifted.prepare("DELETE FROM review_worker_bindings WHERE worker_id = ?").run(workerId);
  } finally {
    drifted.close();
  }
  const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    assert.throws(
      () => reopened.inspectReviewWorker(workerId),
      /has no execution Worker binding/iu
    );
  } finally {
    reopened.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

function reviewLoop(
  store: SqliteRuntimeStore,
  decision: unknown,
  onCall?: () => void
): AgentLoopFactory {
  return {
    create: (input) => ({
      execute: async () => {
        onCall?.();
        recordReviewModelDispatch(store, input);
        return { answer: JSON.stringify(decision) };
      }
    })
  };
}

function recordReviewModelDispatch(
  store: SqliteRuntimeStore,
  input: Parameters<AgentLoopFactory["create"]>[0]
): void {
  const dispatch = store.startModelDispatch(input.execution, {
    provider: input.execution_lock.model.provider,
    model: input.execution_lock.model.model
  });
  store.observeModelResponse(input.execution, dispatch.id, 200);
  store.settleModelDispatch(input.execution, dispatch.id, {
    stop_reason: "stop",
    message_digest: "c".repeat(64)
  });
}

async function completedExecutionFlow(
  store: SqliteRuntimeStore,
  fixture: GitFixture,
  configurationSourceRefs?: string[]
) {
  const composition = beginSupervisor(store, fixture.repository, configurationSourceRefs);
  const dispatched = await composition.gateway.invoke(executionInvocation(
    composition.started.run.id,
    composition.started.run.turn_id,
    fixture,
    "execution-call"
  ));
  assert.equal(dispatched.status, "completed");
  if (dispatched.status !== "completed") throw new Error("execution dispatch failed");
  const worker = store.inspectExecutionWorker(String(dispatched.receipt.output.worker_id));
  assert.ok(worker);
  const completed = await new ExecutionWorkerRuntime(store, fakeExecutor(async (task) => {
    await writeFile(join(task.lineage.worktree, "src", "feature.txt"), "reviewed change\n");
  })).execute(worker.id);
  assert.equal(completed.status, "completed");
  composition.engine.settleSupervisorTurn(
    composition.started.execution,
    "Deliver execution evidence before independent review."
  );
  const resumed = composition.engine.resumeSupervisor(composition.started.run.id, 30_000);
  assert.ok(resumed);
  return { ...composition, executionWorker: completed, resumed };
}

function beginSupervisor(
  store: SqliteRuntimeStore,
  repository: string,
  configurationSourceRefs?: string[]
) {
  const runtimeInspect = createRuntimeInspectAction(store);
  const engine = new OrchestrationEngine(store, [runtimeInspect.contract]);
  const execution = createExecutionWorkerDispatchAction(engine);
  const review = createReviewWorkerDispatchAction(engine);
  const gateway = new ActionGateway(store, [runtimeInspect, execution, review], {
    allowed_effect_classes: ["local_read", "local_write", "external_read"]
  });
  const started = store.beginRun({
    request: "Supervise one execution and one independent review.",
    execution_lock: testExecutionLock({
      cwd: repository,
      contracts: gateway.contracts(),
      ...(configurationSourceRefs
        ? { configuration_source_refs: configurationSourceRefs }
        : {})
    })
  }, 30_000);
  return { engine, gateway, started };
}

function executionInvocation(
  runId: string,
  turnId: string,
  fixture: GitFixture,
  invocationId: string
) {
  return {
    run_id: runId,
    turn_id: turnId,
    invocation_id: invocationId,
    action_name: "worker_execution_dispatch",
    arguments: {
      objective: "Implement one bounded synthetic source change.",
      expected_result: "Update src/feature.txt and pass exact verification.",
      context_refs: ["issue:150"],
      constraints: ["no commit", "Supervisor owns completion"],
      verification_commands: [{
        command: "node",
        args: ["--test", "verify.test.js"],
        cwd: ".",
        timeout_ms: 5_000
      }],
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      budget: { max_output_tokens: 1_000, timeout_ms: 20_000, max_tool_calls: 8 },
      lineage: {
        worktree: fixture.worktree,
        branch: fixture.branch,
        base_commit: fixture.baseCommit,
        writable_paths: ["src"]
      },
      rollback_instruction: "Discard the isolated worktree without integration."
    }
  };
}

function reviewInvocation(
  runId: string,
  turnId: string,
  executionWorkerId: string,
  invocationId: string
) {
  return {
    run_id: runId,
    turn_id: turnId,
    invocation_id: invocationId,
    action_name: "worker_review_dispatch",
    arguments: {
      execution_worker_id: executionWorkerId,
      checklist: ["Match the requested behavior.", "Report actionable correctness findings only."],
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      budget: { max_output_tokens: 800, timeout_ms: 20_000 }
    }
  };
}

function fakeExecutor(mutate: (task: ExecutionTaskEnvelope) => Promise<void>): ExecutionWorkerExecutor {
  return {
    async execute(task): Promise<ExecutionAdapterResult> {
      await mutate(task);
      return {
        status: "done",
        summary: "Synthetic change ready for independent review.",
        changed_files: ["src/feature.txt"],
        tests: ["node --test verify.test.js"],
        blockers: [],
        next_action: "Dispatch one independent Reviewer Worker.",
        completion_authority: "supervisor",
        execution: {
          adapter: "injected_test",
          thread_id: null,
          requested_model: "test-model",
          observed_model: "test-model",
          event_count: 1,
          tool_calls_observed: 1
        },
        consumed: { output_chars: 100, duration_ms: 10 }
      };
    }
  };
}

interface GitFixture {
  root: string;
  repository: string;
  worktree: string;
  branch: string;
  baseCommit: string;
}

async function createGitFixture(label: string): Promise<GitFixture> {
  const root = await mkdtemp(join(tmpdir(), `evi-vnext-review-${label}-`));
  const repository = join(root, "repository");
  const worktree = join(root, "lineage");
  const branch = `codex/test-review-${label}`;
  await mkdir(join(repository, "src"), { recursive: true });
  await git(repository, ["init", "-b", "develop"]);
  await git(repository, ["config", "user.name", "Evi Test"]);
  await git(repository, ["config", "user.email", "evi-test@example.invalid"]);
  await writeFile(join(repository, "src", "feature.txt"), "baseline\n");
  await writeFile(join(repository, "src", "removed.txt"), "removed baseline\n");
  await writeFile(join(repository, "verify.test.js"), [
    "import assert from 'node:assert/strict';",
    "import { readFile } from 'node:fs/promises';",
    "import test from 'node:test';",
    "test('feature is non-empty', async () => {",
    "  assert.ok((await readFile('src/feature.txt', 'utf8')).length > 0);",
    "});",
    ""
  ].join("\n"));
  await git(repository, ["add", "."]);
  await git(repository, ["commit", "-m", "fixture baseline"]);
  const baseCommit = await git(repository, ["rev-parse", "HEAD"]);
  await git(repository, ["worktree", "add", "-b", branch, worktree, baseCommit]);
  return {
    root,
    repository: await realpath(repository),
    worktree: await realpath(worktree),
    branch,
    baseCommit
  };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout.trim();
}
