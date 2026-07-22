import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  ActionGateway,
  captureDeliveryLineageSnapshot,
  createDiscussionWorkerDispatchAction,
  createExecutionWorkerDispatchAction,
  DiscussionWorkerRuntime,
  executionLockActions,
  ExecutionWorkerRuntime,
  OrchestrationEngine,
  SqliteRuntimeStore,
  type ExecutionAdapterResult,
  type ExecutionTaskEnvelope,
  type ExecutionWorkerExecutor
} from "../packages/kernel/src/index.js";
import {
  executeVNextWorker,
  VNEXT_EXECUTION_WORKER_MARKER
} from "../apps/cli/src/vnext_worker.js";
import { VNextCodexExecutionExecutor } from "../packages/runtime/src/vnext_execution_worker_adapter.js";

const execFileAsync = promisify(execFile);

test("Supervisor queues one execution Worker, obtains canonical Git verification, and alone resumes", async () => {
  const fixture = await createGitFixture("complete");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const dispatched = await dispatchExecutionWorker(store, fixture);
    assert.equal(dispatched.result.status, "completed");
    assert.equal(dispatched.worker.status, "queued");
    assert.equal(dispatched.worker.lineage.worktree, fixture.worktree);
    assert.equal(dispatched.worker.task_envelope.baseline.changed_paths.length, 0);
    const duplicate = await dispatched.gateway.invoke(dispatched.invocation);
    assert.equal(duplicate.status, "completed");
    if (duplicate.status !== "completed" || dispatched.result.status !== "completed") return;
    assert.equal(duplicate.reservation.id, dispatched.result.reservation.id);
    assert.equal(store.inspectRun(dispatched.started.run.id)?.action_count, 1);

    const executor = fakeExecutor(async (task) => {
      await mkdir(join(task.lineage.worktree, "src"), { recursive: true });
      await writeFile(join(task.lineage.worktree, "src", "feature.txt"), "bounded execution\n");
    });
    const completed = await new ExecutionWorkerRuntime(store, executor).execute(dispatched.worker.id);
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.result_envelope?.final_snapshot.changed_paths, ["src/feature.txt"]);
    assert.equal(completed.result_envelope?.verification_receipts[0]?.exit_code, 0);
    assert.equal(completed.result_envelope?.actual_execution.adapter, "injected_test");
    assert.equal(completed.result_envelope?.actual_execution.lease_ordinal, 1);
    assert.equal(store.inspectRun(dispatched.started.run.id)?.deliverable_worker_count, 1);

    const waiting = dispatched.engine.settleSupervisorTurn(
      dispatched.started.execution,
      "Wait for the exact execution Worker evidence."
    );
    assert.equal(waiting?.status, "waiting");
    const resumed = dispatched.engine.resumeSupervisor(dispatched.started.run.id, 30_000);
    assert.ok(resumed);
    assert.equal(resumed?.runtime_context.kind, "runtime_worker_result_delivery");
    const encoded = JSON.stringify(resumed?.runtime_context);
    assert.match(encoded, /"worker_kind":"execution"/u);
    assert.match(encoded, /src\/feature\.txt/u);
    assert.equal(store.inspectExecutionWorker(dispatched.worker.id)?.result_delivered_to_turn_id,
      resumed?.run.turn_id);
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("an exact duplicate dispatch remains idempotent after its persisted deadline", async () => {
  const fixture = await createGitFixture("deadline-idempotence");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const parent = await beginExecutionParent(store, fixture.repository);
    const invocation = executionInvocation(
      parent.started.run.id,
      parent.started.run.turn_id,
      fixture,
      "deadline-replay"
    );
    invocation.arguments.deadline_at = new Date(Date.now() + 1_000).toISOString();
    const first = await parent.gateway.invoke(invocation);
    assert.equal(first.status, "completed");
    await delay(1_050);
    const duplicate = await parent.gateway.invoke(invocation);
    assert.equal(duplicate.status, "completed");
    if (first.status === "completed" && duplicate.status === "completed") {
      assert.equal(duplicate.reservation.id, first.reservation.id);
      assert.equal(duplicate.receipt.id, first.receipt.id);
    }
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("execution Worker rejects protected, dirty, escaped, and already-owned Delivery Lineages before a second mutation", async () => {
  const fixture = await createGitFixture("authority");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const first = await dispatchExecutionWorker(store, fixture);
    assert.equal(first.result.status, "completed");

    const second = await beginExecutionParent(store, fixture.repository);
    const owned = await second.gateway.invoke(executionInvocation(
      second.started.run.id,
      second.started.run.turn_id,
      fixture,
      "owned-lineage"
    ));
    assert.equal(owned.status, "denied");
    assert.match(owned.status === "denied" ? owned.reason : "", /different execution owner/iu);
    assert.equal(store.inspectRun(second.started.run.id)?.action_count, 0);

    const protectedParent = await beginExecutionParent(store, fixture.repository);
    const protectedResult = await protectedParent.gateway.invoke(executionInvocation(
      protectedParent.started.run.id,
      protectedParent.started.run.turn_id,
      { ...fixture, worktree: fixture.repository },
      "protected-root"
    ));
    assert.equal(protectedResult.status, "denied");
    assert.match(protectedResult.status === "denied" ? protectedResult.reason : "", /protected root/iu);

    for (const drift of ["branch", "base"] as const) {
      const driftParent = await beginExecutionParent(store, fixture.repository);
      const task = executionTask(fixture);
      const drifted = await driftParent.gateway.invoke({
        ...executionInvocation(
          driftParent.started.run.id,
          driftParent.started.run.turn_id,
          fixture,
          `wrong-${drift}`
        ),
        arguments: {
          ...task,
          lineage: {
            ...task.lineage,
            ...(drift === "branch"
              ? { branch: "codex/not-the-current-branch" }
              : { base_commit: "0".repeat(40) })
          }
        }
      });
      assert.equal(drifted.status, "denied");
      assert.match(drifted.status === "denied" ? drifted.reason : "", /branch mismatch|base commit mismatch/iu);
      assert.equal(store.inspectRun(driftParent.started.run.id)?.action_count, 0);
    }

    const escapedParent = await beginExecutionParent(store, fixture.repository);
    const escaped = await escapedParent.gateway.invoke({
      ...executionInvocation(
        escapedParent.started.run.id,
        escapedParent.started.run.turn_id,
        fixture,
        "escaped-path"
      ),
      arguments: {
        ...executionTask(fixture),
        lineage: { ...executionTask(fixture).lineage, writable_paths: ["../outside"] }
      }
    });
    assert.equal(escaped.status, "denied");
    assert.equal(store.inspectRun(escapedParent.started.run.id)?.action_count, 0);

    const outside = join(fixture.root, "outside");
    await mkdir(outside);
    await symlink(outside, join(fixture.worktree, "escape"));
    const symlinkParent = await beginExecutionParent(store, fixture.repository);
    const symlinkTask = executionTask(fixture);
    const escapedSymlink = await symlinkParent.gateway.invoke({
      ...executionInvocation(
        symlinkParent.started.run.id,
        symlinkParent.started.run.turn_id,
        fixture,
        "symlink-escape"
      ),
      arguments: {
        ...symlinkTask,
        lineage: { ...symlinkTask.lineage, writable_paths: ["escape"] }
      }
    });
    assert.equal(escapedSymlink.status, "denied");
    assert.match(escapedSymlink.status === "denied" ? escapedSymlink.reason : "", /resolves outside/iu);

    await symlink(join(fixture.worktree, "src"), join(fixture.worktree, "src-alias"));
    const aliasParent = await beginExecutionParent(store, fixture.repository);
    const aliasTask = executionTask(fixture);
    const aliasedWritableRoot = await aliasParent.gateway.invoke({
      ...executionInvocation(
        aliasParent.started.run.id,
        aliasParent.started.run.turn_id,
        fixture,
        "symlink-alias"
      ),
      arguments: {
        ...aliasTask,
        lineage: { ...aliasTask.lineage, writable_paths: ["src-alias"] }
      }
    });
    assert.equal(aliasedWritableRoot.status, "denied");
    assert.match(
      aliasedWritableRoot.status === "denied" ? aliasedWritableRoot.reason : "",
      /exact real directory/iu
    );
    await rm(join(fixture.worktree, "src-alias"), { force: true });

    for (const invalidRoot of ["missing-dir", "README.md"] as const) {
      const invalidRootParent = await beginExecutionParent(store, fixture.repository);
      const invalidRootTask = executionTask(fixture);
      const invalid = await invalidRootParent.gateway.invoke({
        ...executionInvocation(
          invalidRootParent.started.run.id,
          invalidRootParent.started.run.turn_id,
          fixture,
          `invalid-root-${invalidRoot}`
        ),
        arguments: {
          ...invalidRootTask,
          lineage: { ...invalidRootTask.lineage, writable_paths: [invalidRoot] }
        }
      });
      assert.equal(invalid.status, "denied");
      assert.match(
        invalid.status === "denied" ? invalid.reason : "",
        /must already exist as a directory|exact real directory/iu
      );
    }

    const unsafeVerifyParent = await beginExecutionParent(store, fixture.repository);
    const unsafeVerifyTask = executionTask(fixture);
    const unsafeVerification = await unsafeVerifyParent.gateway.invoke({
      ...executionInvocation(
        unsafeVerifyParent.started.run.id,
        unsafeVerifyParent.started.run.turn_id,
        fixture,
        "unsafe-verification"
      ),
      arguments: {
        ...unsafeVerifyTask,
        verification_commands: [{
          command: "node",
          args: ["-e", "require('node:fs').writeFileSync('/tmp/not-authorized','x')"],
          cwd: ".",
          timeout_ms: 5_000
        }]
      }
    });
    assert.equal(unsafeVerification.status, "denied");
    assert.match(unsafeVerification.status === "denied" ? unsafeVerification.reason : "", /Verification command/iu);
    assert.equal(store.inspectRun(unsafeVerifyParent.started.run.id)?.action_count, 0);

    const dirtyFixture = await createGitFixture("dirty");
    const dirtyStore = new SqliteRuntimeStore(join(dirtyFixture.root, "state", "runtime.sqlite"), {
      state_profile: "stable_cli"
    });
    try {
      await writeFile(join(dirtyFixture.worktree, "dirty.txt"), "not clean\n");
      const dirtyParent = await beginExecutionParent(dirtyStore, dirtyFixture.repository);
      const dirty = await dirtyParent.gateway.invoke(executionInvocation(
        dirtyParent.started.run.id,
        dirtyParent.started.run.turn_id,
        dirtyFixture,
        "dirty-baseline"
      ));
      assert.equal(dirty.status, "denied");
      assert.match(dirty.status === "denied" ? dirty.reason : "", /baseline must be clean/iu);
      assert.equal(dirtyStore.inspectRun(dirtyParent.started.run.id)?.action_count, 0);
    } finally {
      dirtyStore.close();
      await rm(dirtyFixture.root, { recursive: true, force: true });
    }
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("stable vnext worker CLI surface executes the queued execution kind without model configuration", async () => {
  const fixture = await createGitFixture("cli");
  const stateRoot = join(fixture.root, "state");
  let workerId = "";
  const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const dispatched = await dispatchExecutionWorker(store, fixture);
    workerId = dispatched.worker.id;
  } finally {
    store.close();
  }
  try {
    const envelope = await executeVNextWorker({
      action: "execute",
      worker_id: workerId,
      state_root: stateRoot,
      repo_root: fixture.repository
    }, {
      execution_executor: fakeExecutor(async (task) => {
        await writeFile(join(task.lineage.worktree, "src", "feature.txt"), "cli execution\n");
      })
    });
    assert.equal(envelope.worker.marker, VNEXT_EXECUTION_WORKER_MARKER);
    assert.equal(envelope.worker.worker_kind, "execution");
    assert.equal(envelope.worker.status, "completed");
    assert.equal(envelope.worker.child_run_id, null);
    assert.ok(envelope.worker.result_envelope_digest);
    const inspected = await executeVNextWorker({
      action: "inspect",
      worker_id: workerId,
      state_root: stateRoot,
      repo_root: fixture.repository
    });
    assert.equal(inspected.worker.status, "completed");
    assert.equal(inspected.worker.inspection?.lineage?.worktree, fixture.worktree);
    assert.deepEqual(
      inspected.worker.inspection?.result_envelope?.result_kind === "execution"
        ? inspected.worker.inspection.result_envelope.final_snapshot.changed_paths
        : null,
      ["src/feature.txt"]
    );
    assert.equal(
      inspected.worker.inspection?.result_envelope?.result_kind === "execution"
        ? inspected.worker.inspection.result_envelope.verification_receipts[0]?.exit_code
        : null,
      0
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("production execution adapter grants only exact writable roots to the local agent sandbox", async () => {
  const fixture = await createGitFixture("sandbox-roots");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const parent = await beginExecutionParent(store, fixture.repository);
    const invocation = executionInvocation(
      parent.started.run.id,
      parent.started.run.turn_id,
      fixture,
      "sandbox-roots"
    );
    invocation.arguments.lineage.writable_paths = ["src", "tests"];
    const dispatched = await parent.gateway.invoke(invocation);
    assert.equal(dispatched.status, "completed");
    if (dispatched.status !== "completed") return;
    const worker = store.inspectExecutionWorker(String(dispatched.receipt.output.worker_id));
    assert.ok(worker);
    let observedArgv: readonly string[] = [];
    let observedCwd = "";
    let observedPrompt = "";
    const adapter = new VNextCodexExecutionExecutor(async (argv, prompt, authority) => {
      observedArgv = argv;
      observedCwd = authority.cwd;
      observedPrompt = prompt;
      return {
        exitCode: 0,
        timedOut: false,
        toolBudgetExceeded: false,
        invalidJsonl: false,
        spawnError: false,
        threadIdMismatch: false,
        threadId: "123e4567-e89b-42d3-a456-426614174000",
        lastAgentMessage: JSON.stringify({
          status: "done",
          summary: "Synthetic adapter result.",
          changed_files: ["src/feature.txt"],
          tests: ["synthetic only"],
          blockers: [],
          next_action: "Supervisor should inspect canonical evidence.",
          completion_authority: "main_harness"
        }),
        stdoutCharsObserved: 10,
        stderrCharsObserved: 0,
        outputCapture: {
          effectiveLimitChars: 4_000,
          retainedChars: 10,
          truncated: false,
          prefix: "",
          suffix: ""
        },
        eventCount: 1,
        eventTypes: {},
        itemTypes: {},
        toolCallsObserved: 1,
        delegationBudgetExceeded: false,
        subagentToolEvidence: []
      };
    });
    const result = await adapter.execute(worker!.task_envelope, new AbortController().signal);
    assert.equal(result.execution.adapter, "local_agent_cli");
    assert.equal(observedCwd, join(fixture.worktree, "src"));
    assert.deepEqual(
      observedArgv.slice(observedArgv.indexOf("--add-dir"), observedArgv.indexOf("--add-dir") + 2),
      ["--add-dir", join(fixture.worktree, "tests")]
    );
    assert.equal(observedArgv.includes("--ephemeral"), true);
    assert.equal(observedArgv.includes(fixture.worktree), false);
    assert.match(observedPrompt, /Context refs: issue:146/u);
    assert.match(observedPrompt, /Artifact refs: artifact:synthetic-fixture/u);
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("canonical Git evidence makes out-of-scope edits, commits, and failed verification non-integrable", async () => {
  for (const violation of ["outside", "commit", "verification"] as const) {
    const fixture = await createGitFixture(violation);
    const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
      state_profile: "stable_cli"
    });
    try {
      const dispatched = await dispatchExecutionWorker(store, fixture);
      const executor = fakeExecutor(async (task) => {
        await mkdir(join(task.lineage.worktree, "src"), { recursive: true });
        await writeFile(
          join(task.lineage.worktree, "src", "feature.txt"),
          violation === "verification" ? "trailing whitespace \n" : "implemented\n"
        );
        if (violation === "outside") {
          await writeFile(join(task.lineage.worktree, "README.md"), "outside scope\n");
        } else if (violation === "commit") {
          await git(task.lineage.worktree, ["add", "src/feature.txt"]);
          await git(task.lineage.worktree, ["commit", "-m", "forbidden child commit"]);
        }
      });
      const completed = await new ExecutionWorkerRuntime(store, executor).execute(dispatched.worker.id);
      assert.equal(
        completed.status,
        "failed",
        `${violation}:${JSON.stringify(completed.result_envelope?.verification_receipts)}`
      );
      const policy = completed.result_envelope?.findings.canonical_policy as Record<string, unknown>;
      assert.equal(
        violation === "outside"
          ? policy.paths_safe
          : violation === "commit"
            ? policy.identity_safe
            : policy.verification_passed,
        false,
        violation
      );
      dispatched.engine.settleSupervisorTurn(dispatched.started.execution, "Wait for failed evidence.");
      const resumed = dispatched.engine.resumeSupervisor(dispatched.started.run.id, 30_000);
      assert.ok(resumed);
      assert.match(JSON.stringify(resumed?.runtime_context), /"status":"failed"/u);
    } finally {
      store.close();
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test("expired execution lease becomes outcome_unknown and never transfers to a second writer", async () => {
  const fixture = await createGitFixture("expired");
  const store = new SqliteRuntimeStore(join(fixture.root, "state", "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const dispatched = await dispatchExecutionWorker(store, fixture);
    const baseline = await captureDeliveryLineageSnapshot(dispatched.worker.lineage);
    const first = store.claimExecutionWorker(dispatched.worker.id, baseline, 100);
    await writeFile(join(fixture.worktree, "src", "feature.txt"), "mutation before process loss\n");
    await delay(140);
    assert.throws(
      () => store.claimExecutionWorker(dispatched.worker.id, baseline, 100),
      /outcome is unknown and replay is forbidden/iu
    );
    const paused = store.inspectExecutionWorker(dispatched.worker.id);
    assert.equal(paused?.status, "paused");
    assert.equal(paused?.attempt_id, first.lease.attempt_id);
    assert.throws(
      () => store.renewExecutionWorkerLease(first.lease, 100),
      /lease identity mismatch/iu
    );
  } finally {
    store.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("schema 8 state upgrades in place to schema 11 and creates the common Worker ledger", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-schema-8-to-10-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  const dispatch = await dispatchDiscussionWorker(store, fixture);
  const completed = await new DiscussionWorkerRuntime(
    store,
    new ActionGateway(store, []),
    { create: () => ({ execute: async () => ({ answer: "Preserved v8 discussion result." }) }) }
  ).execute(dispatch.worker.id);
  dispatch.engine.settleSupervisorTurn(
    dispatch.started.execution,
    "Deliver the preserved v8 discussion result."
  );
  const resumed = dispatch.engine.resumeSupervisor(dispatch.started.run.id, 30_000);
  assert.ok(resumed);
  const expected = {
    task_digest: completed.task_envelope.digest,
    result_digest: completed.result_envelope?.digest,
    child_run_id: completed.child_run_id,
    lease_ordinal: completed.lease_ordinal,
    delivered_to_turn_id: resumed?.run.turn_id
  };
  store.close();
  const legacy = new DatabaseSync(sqlite);
  legacy.exec("PRAGMA foreign_keys = OFF");
  downgradeWorkerLedgerToEight(legacy);
  legacy.prepare("UPDATE schema_meta SET value = '8' WHERE key = 'schema_version'").run();
  legacy.close();
  const upgraded = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  const migrated = upgraded.inspectWorker(completed.id);
  assert.equal(migrated?.task_envelope.digest, expected.task_digest);
  assert.equal(migrated?.result_envelope?.digest, expected.result_digest);
  assert.equal(migrated?.child_run_id, expected.child_run_id);
  assert.equal(migrated?.lease_ordinal, expected.lease_ordinal);
  assert.equal(migrated?.result_delivered_to_turn_id, expected.delivered_to_turn_id);
  upgraded.close();
  const inspected = new DatabaseSync(sqlite, { readOnly: true });
  try {
    const version = inspected.prepare(
      "SELECT value FROM schema_meta WHERE key = 'schema_version'"
    ).get() as { value: string };
    assert.equal(version.value, "11");
    const tables = inspected.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'worker_sessions', 'delivery_lineages', 'execution_worker_bindings',
        'execution_worker_sessions', 'review_worker_bindings'
      )
      ORDER BY name
    `).all() as Array<{ name: string }>;
    assert.deepEqual(tables.map(({ name }) => name), [
      "delivery_lineages",
      "execution_worker_bindings",
      "review_worker_bindings",
      "worker_sessions"
    ]);
  } finally {
    inspected.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("schema 9 preserves discussion and execution Worker identities in one schema 11 ledger", async () => {
  const fixture = await createGitFixture("schema-nine");
  const sqlite = join(fixture.root, "state", "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  const execution = await dispatchExecutionWorker(store, fixture);
  const executionCompleted = await new ExecutionWorkerRuntime(
    store,
    fakeExecutor(async (task) => {
      await writeFile(join(task.lineage.worktree, "src", "feature.txt"), "schema nine result\n");
    })
  ).execute(execution.worker.id);
  const discussionDispatch = await dispatchDiscussionWorker(store, fixture.repository);
  const discussion = await new DiscussionWorkerRuntime(
    store,
    new ActionGateway(store, []),
    { create: () => ({ execute: async () => ({ answer: "Preserved discussion result." }) }) }
  ).execute(discussionDispatch.worker.id);
  execution.engine.settleSupervisorTurn(
    execution.started.execution,
    "Deliver the preserved execution result."
  );
  const resumedExecution = execution.engine.resumeSupervisor(execution.started.run.id, 30_000);
  assert.ok(resumedExecution);
  discussionDispatch.engine.settleSupervisorTurn(
    discussionDispatch.started.execution,
    "Deliver the preserved discussion result."
  );
  const resumedDiscussion = discussionDispatch.engine.resumeSupervisor(
    discussionDispatch.started.run.id,
    30_000
  );
  assert.ok(resumedDiscussion);
  const expected = {
    discussion_task: discussion.task_envelope.digest,
    discussion_result: discussion.result_envelope?.digest,
    discussion_child_run: discussion.child_run_id,
    discussion_delivered_to_turn: resumedDiscussion?.run.turn_id,
    execution_task: execution.worker.task_envelope.digest,
    execution_result: executionCompleted.result_envelope?.digest,
    execution_attempt: executionCompleted.attempt_id,
    execution_lineage: execution.worker.lineage.digest,
    execution_lease_ordinal: executionCompleted.lease_ordinal,
    execution_delivered_to_turn: resumedExecution?.run.turn_id
  };
  store.close();

  const legacy = new DatabaseSync(sqlite);
  legacy.exec("PRAGMA foreign_keys = OFF");
  downgradeWorkerLedgerToNine(legacy);
  legacy.prepare("UPDATE schema_meta SET value = '9' WHERE key = 'schema_version'").run();
  legacy.close();

  const upgraded = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const migratedDiscussion = upgraded.inspectWorker(discussion.id);
    assert.equal(migratedDiscussion?.task_envelope.digest, expected.discussion_task);
    assert.equal(migratedDiscussion?.result_envelope?.digest, expected.discussion_result);
    assert.equal(migratedDiscussion?.child_run_id, expected.discussion_child_run);
    assert.equal(
      migratedDiscussion?.result_delivered_to_turn_id,
      expected.discussion_delivered_to_turn
    );
    const migratedExecution = upgraded.inspectExecutionWorker(execution.worker.id);
    assert.equal(
      migratedExecution?.task_envelope.digest,
      expected.execution_task
    );
    assert.equal(migratedExecution?.result_envelope?.digest, expected.execution_result);
    assert.equal(migratedExecution?.attempt_id, expected.execution_attempt);
    assert.equal(migratedExecution?.lease_ordinal, expected.execution_lease_ordinal);
    assert.equal(
      migratedExecution?.result_delivered_to_turn_id,
      expected.execution_delivered_to_turn
    );
    assert.equal(
      migratedExecution?.lineage.digest,
      expected.execution_lineage
    );
    const inspected = new DatabaseSync(sqlite, { readOnly: true });
    try {
      const version = inspected.prepare(
        "SELECT value FROM schema_meta WHERE key = 'schema_version'"
      ).get() as { value: string };
      assert.equal(version.value, "11");
      const kinds = inspected.prepare(`
        SELECT worker_kind, COUNT(*) AS count
        FROM worker_sessions GROUP BY worker_kind ORDER BY worker_kind
      `).all() as Array<{ worker_kind: string; count: number }>;
      assert.deepEqual(kinds.map((row) => ({
        worker_kind: row.worker_kind,
        count: Number(row.count)
      })), [
        { worker_kind: "discussion", count: 1 },
        { worker_kind: "execution", count: 1 }
      ]);
      const removed = inspected.prepare(`
        SELECT COUNT(*) AS count FROM sqlite_master
        WHERE type = 'table' AND name = 'execution_worker_sessions'
      `).get() as { count: number };
      assert.equal(Number(removed.count), 0);
    } finally {
      inspected.close();
    }
  } finally {
    upgraded.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("schema 10 preserves the common Worker ledger exactly while adding review bindings", async () => {
  const fixture = await createGitFixture("schema-ten");
  const sqlite = join(fixture.root, "state", "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  const execution = await dispatchExecutionWorker(store, fixture);
  const executionCompleted = await new ExecutionWorkerRuntime(
    store,
    fakeExecutor(async (task) => {
      await writeFile(join(task.lineage.worktree, "src", "feature.txt"), "schema ten result\n");
    })
  ).execute(execution.worker.id);
  const discussionDispatch = await dispatchDiscussionWorker(store, fixture.repository);
  const discussion = await new DiscussionWorkerRuntime(
    store,
    new ActionGateway(store, []),
    { create: () => ({ execute: async () => ({ answer: "Preserved schema 10 discussion." }) }) }
  ).execute(discussionDispatch.worker.id);
  const expected = {
    execution_task: execution.worker.task_envelope.digest,
    execution_result: executionCompleted.result_envelope?.digest,
    execution_lineage: execution.worker.lineage.digest,
    execution_attempt: executionCompleted.attempt_id,
    discussion_task: discussion.task_envelope.digest,
    discussion_result: discussion.result_envelope?.digest,
    discussion_child_run: discussion.child_run_id
  };
  store.close();

  const legacy = new DatabaseSync(sqlite);
  legacy.exec("PRAGMA foreign_keys = OFF");
  downgradeWorkerLedgerToTen(legacy);
  legacy.prepare("UPDATE schema_meta SET value = '10' WHERE key = 'schema_version'").run();
  legacy.close();

  const upgraded = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const migratedExecution = upgraded.inspectExecutionWorker(execution.worker.id);
    assert.equal(migratedExecution?.task_envelope.digest, expected.execution_task);
    assert.equal(migratedExecution?.result_envelope?.digest, expected.execution_result);
    assert.equal(migratedExecution?.lineage.digest, expected.execution_lineage);
    assert.equal(migratedExecution?.attempt_id, expected.execution_attempt);
    const migratedDiscussion = upgraded.inspectWorker(discussion.id);
    assert.equal(migratedDiscussion?.task_envelope.digest, expected.discussion_task);
    assert.equal(migratedDiscussion?.result_envelope?.digest, expected.discussion_result);
    assert.equal(migratedDiscussion?.child_run_id, expected.discussion_child_run);
    const inspected = new DatabaseSync(sqlite, { readOnly: true });
    try {
      const version = inspected.prepare(
        "SELECT value FROM schema_meta WHERE key = 'schema_version'"
      ).get() as { value: string };
      assert.equal(version.value, "11");
      const reviewBindings = inspected.prepare(`
        SELECT COUNT(*) AS count FROM sqlite_master
        WHERE type = 'table' AND name = 'review_worker_bindings'
      `).get() as { count: number };
      assert.equal(Number(reviewBindings.count), 1);
      const kinds = inspected.prepare(`
        SELECT worker_kind, COUNT(*) AS count
        FROM worker_sessions GROUP BY worker_kind ORDER BY worker_kind
      `).all() as Array<{ worker_kind: string; count: number }>;
      assert.deepEqual(kinds.map((row) => ({
        worker_kind: row.worker_kind,
        count: Number(row.count)
      })), [
        { worker_kind: "discussion", count: 1 },
        { worker_kind: "execution", count: 1 }
      ]);
    } finally {
      inspected.close();
    }
  } finally {
    upgraded.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("schema 9 metadata fails closed when its required execution lifecycle table is absent", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-schema-nine-corrupt-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  store.close();
  const legacy = new DatabaseSync(sqlite);
  legacy.exec("PRAGMA foreign_keys = OFF");
  downgradeWorkerLedgerToNine(legacy);
  legacy.exec("DROP TABLE execution_worker_sessions");
  legacy.prepare("UPDATE schema_meta SET value = '9' WHERE key = 'schema_version'").run();
  legacy.close();
  try {
    assert.throws(
      () => new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" }),
      /Unsupported vNext runtime schema version: 9\/missing:execution_worker_sessions/iu
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("schema 8 metadata fails closed when a later Delivery Lineage table is present", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-schema-eight-drift-"));
  const sqlite = join(fixture, "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  store.close();
  const legacy = new DatabaseSync(sqlite);
  legacy.exec("PRAGMA foreign_keys = OFF");
  downgradeWorkerLedgerToEight(legacy);
  legacy.exec("CREATE TABLE delivery_lineages (id TEXT PRIMARY KEY)");
  legacy.prepare("UPDATE schema_meta SET value = '8' WHERE key = 'schema_version'").run();
  legacy.close();
  try {
    assert.throws(
      () => new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" }),
      /Unsupported vNext runtime schema version: 8\/unexpected:delivery_lineages/iu
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("the common Worker ledger fails closed when an execution binding disappears", async () => {
  const fixture = await createGitFixture("missing-binding");
  const sqlite = join(fixture.root, "state", "runtime.sqlite");
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  const dispatched = await dispatchExecutionWorker(store, fixture);
  store.close();
  const drifted = new DatabaseSync(sqlite);
  drifted.exec("PRAGMA foreign_keys = OFF");
  drifted.prepare("DELETE FROM execution_worker_bindings WHERE worker_id = ?")
    .run(dispatched.worker.id);
  drifted.close();
  const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    assert.throws(
      () => reopened.inspectExecutionWorker(dispatched.worker.id),
      /has no Delivery Lineage binding/iu
    );
  } finally {
    reopened.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function dispatchDiscussionWorker(store: SqliteRuntimeStore, repository: string) {
  const engine = new OrchestrationEngine(store, []);
  const dispatch = createDiscussionWorkerDispatchAction(engine);
  const gateway = new ActionGateway(store, [dispatch], {
    allowed_effect_classes: ["external_read"]
  });
  const started = store.beginRun({
    request: "Supervise one bounded discussion Worker migration fixture.",
    execution_lock: {
      model: {
        config_id: "synthetic",
        provider: "synthetic",
        api: "openai-responses",
        base_url: "http://127.0.0.1:9999/v1",
        model: "synthetic",
        credential_ref: "synthetic",
        reasoning_effort: null,
        context_window_tokens: 128_000,
        max_output_tokens: 4_000,
        timeout_ms: 30_000
      },
      authority: { cwd: repository },
      configuration: { selector: "test", source_refs: ["test:worker-ledger-migration"] },
      actions: executionLockActions(gateway.contracts())
    }
  }, 30_000);
  const result = await gateway.invoke({
    run_id: started.run.id,
    turn_id: started.run.turn_id,
    invocation_id: "discussion-migration-call",
    action_name: dispatch.contract.name,
    arguments: {
      objective: "Preserve one discussion Worker across the schema migration.",
      expected_result: "The exact Task identity remains inspectable.",
      context_refs: ["issue:148"],
      constraints: ["read-only"],
      verification_requirements: ["retain exact digest"],
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      budget: { max_output_tokens: 400, timeout_ms: 10_000 }
    }
  });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") throw new Error("discussion migration dispatch failed");
  const worker = store.inspectWorker(String(result.receipt.output.worker_id));
  assert.ok(worker);
  return { worker, engine, started };
}

function downgradeWorkerLedgerToEight(db: DatabaseSync): void {
  db.exec("DROP TABLE review_worker_bindings");
  db.exec("ALTER TABLE worker_sessions RENAME TO worker_sessions_v10");
  createLegacyDiscussionWorkerTable(db);
  db.exec(`
    INSERT INTO worker_sessions (
      id, reservation_id, parent_run_id, parent_turn_id, status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json,
      child_session_id, child_run_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, created_at, updated_at
    )
    SELECT
      id, reservation_id, parent_run_id, parent_turn_id, status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json,
      child_session_id, child_run_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, created_at, updated_at
    FROM worker_sessions_v10 WHERE worker_kind = 'discussion';
    DROP TABLE execution_worker_bindings;
    DROP TABLE delivery_lineages;
    DROP TABLE worker_sessions_v10;
  `);
}

function downgradeWorkerLedgerToNine(db: DatabaseSync): void {
  db.exec("DROP TABLE review_worker_bindings");
  db.exec("ALTER TABLE worker_sessions RENAME TO worker_sessions_v10");
  createLegacyDiscussionWorkerTable(db);
  createLegacyExecutionWorkerTable(db);
  db.exec(`
    INSERT INTO worker_sessions (
      id, reservation_id, parent_run_id, parent_turn_id, status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json,
      child_session_id, child_run_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, created_at, updated_at
    )
    SELECT
      id, reservation_id, parent_run_id, parent_turn_id, status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json,
      child_session_id, child_run_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, created_at, updated_at
    FROM worker_sessions_v10 WHERE worker_kind = 'discussion';

    INSERT INTO execution_worker_sessions (
      id, reservation_id, parent_run_id, parent_turn_id, status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json, lineage_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, attempt_id,
      created_at, updated_at
    )
    SELECT
      workers.id, workers.reservation_id, workers.parent_run_id, workers.parent_turn_id,
      workers.status, workers.task_envelope_digest, workers.task_envelope_json,
      workers.child_execution_lock_digest, workers.child_execution_lock_json,
      bindings.lineage_id, workers.result_envelope_digest, workers.result_envelope_json,
      workers.result_delivered_to_turn_id, workers.lease_ordinal,
      workers.lease_owner_digest, workers.lease_expires_at, workers.attempt_id,
      workers.created_at, workers.updated_at
    FROM worker_sessions_v10 AS workers
    JOIN execution_worker_bindings AS bindings ON bindings.worker_id = workers.id
    WHERE workers.worker_kind = 'execution';

    DROP TABLE execution_worker_bindings;
    DROP TABLE worker_sessions_v10;
  `);
}

function downgradeWorkerLedgerToTen(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE review_worker_bindings;
    ALTER TABLE execution_worker_bindings RENAME TO execution_worker_bindings_v11;
    ALTER TABLE worker_sessions RENAME TO worker_sessions_v11;
  `);
  createLegacyCommonWorkerTableTen(db);
  db.exec(`
    INSERT INTO worker_sessions (
      id, reservation_id, parent_run_id, parent_turn_id, worker_kind, status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json,
      child_session_id, child_run_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, attempt_id,
      created_at, updated_at
    )
    SELECT
      id, reservation_id, parent_run_id, parent_turn_id, worker_kind, status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json,
      child_session_id, child_run_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, attempt_id,
      created_at, updated_at
    FROM worker_sessions_v11
    WHERE worker_kind IN ('discussion', 'execution');

    CREATE TABLE execution_worker_bindings (
      worker_id TEXT PRIMARY KEY REFERENCES worker_sessions(id) ON DELETE CASCADE,
      lineage_id TEXT NOT NULL UNIQUE REFERENCES delivery_lineages(id) ON DELETE RESTRICT
    );
    INSERT INTO execution_worker_bindings (worker_id, lineage_id)
    SELECT worker_id, lineage_id FROM execution_worker_bindings_v11;
    DROP TABLE execution_worker_bindings_v11;
    DROP TABLE worker_sessions_v11;
  `);
}

function createLegacyCommonWorkerTableTen(db: DatabaseSync): void {
  db.exec(`
    DROP INDEX IF EXISTS worker_sessions_parent_status_idx;
    DROP INDEX IF EXISTS worker_sessions_one_kind_per_parent_idx;
    DROP INDEX IF EXISTS worker_sessions_parent_delivery_idx;
    CREATE TABLE worker_sessions (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL UNIQUE REFERENCES action_reservations(id) ON DELETE CASCADE,
      parent_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      parent_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      worker_kind TEXT NOT NULL CHECK (worker_kind IN ('discussion', 'execution')),
      status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'paused', 'needs_input', 'completed', 'failed')
      ),
      task_envelope_digest TEXT NOT NULL UNIQUE,
      task_envelope_json TEXT NOT NULL,
      child_execution_lock_digest TEXT NOT NULL,
      child_execution_lock_json TEXT NOT NULL,
      child_session_id TEXT UNIQUE REFERENCES sessions(id),
      child_run_id TEXT UNIQUE REFERENCES runs(id),
      result_envelope_digest TEXT UNIQUE,
      result_envelope_json TEXT,
      result_delivered_to_turn_id TEXT REFERENCES turns(id),
      lease_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (lease_ordinal >= 0),
      lease_owner_digest TEXT,
      lease_expires_at TEXT,
      attempt_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (child_session_id IS NULL AND child_run_id IS NULL)
        OR (child_session_id IS NOT NULL AND child_run_id IS NOT NULL)
      ),
      CHECK (
        (status = 'running' AND lease_owner_digest IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (status != 'running' AND lease_owner_digest IS NULL AND lease_expires_at IS NULL)
      ),
      CHECK (
        (worker_kind = 'discussion' AND attempt_id IS NULL AND status != 'paused')
        OR (worker_kind = 'execution' AND child_session_id IS NULL AND child_run_id IS NULL
          AND ((status = 'queued' AND attempt_id IS NULL)
            OR (status != 'queued' AND attempt_id IS NOT NULL)))
      ),
      CHECK (
        (worker_kind = 'discussion' AND status IN ('queued', 'running')
          AND result_envelope_digest IS NULL AND result_envelope_json IS NULL
          AND result_delivered_to_turn_id IS NULL)
        OR (worker_kind = 'discussion' AND status IN ('needs_input', 'completed', 'failed')
          AND child_session_id IS NOT NULL AND child_run_id IS NOT NULL
          AND result_envelope_digest IS NOT NULL AND result_envelope_json IS NOT NULL)
        OR (worker_kind = 'execution' AND status IN ('queued', 'running', 'paused')
          AND result_envelope_digest IS NULL AND result_envelope_json IS NULL
          AND result_delivered_to_turn_id IS NULL)
        OR (worker_kind = 'execution' AND status IN ('needs_input', 'completed', 'failed')
          AND result_envelope_digest IS NOT NULL AND result_envelope_json IS NOT NULL)
      )
    );
  `);
}

function createLegacyDiscussionWorkerTable(db: DatabaseSync): void {
  db.exec(`
    DROP INDEX IF EXISTS worker_sessions_parent_status_idx;
    DROP INDEX IF EXISTS worker_sessions_one_kind_per_parent_idx;
    DROP INDEX IF EXISTS worker_sessions_parent_delivery_idx;
    CREATE TABLE worker_sessions (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL UNIQUE REFERENCES action_reservations(id) ON DELETE CASCADE,
      parent_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      parent_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'needs_input', 'completed', 'failed')
      ),
      task_envelope_digest TEXT NOT NULL UNIQUE,
      task_envelope_json TEXT NOT NULL,
      child_execution_lock_digest TEXT NOT NULL,
      child_execution_lock_json TEXT NOT NULL,
      child_session_id TEXT UNIQUE REFERENCES sessions(id),
      child_run_id TEXT UNIQUE REFERENCES runs(id),
      result_envelope_digest TEXT UNIQUE,
      result_envelope_json TEXT,
      result_delivered_to_turn_id TEXT REFERENCES turns(id),
      lease_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (lease_ordinal >= 0),
      lease_owner_digest TEXT,
      lease_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (child_session_id IS NULL AND child_run_id IS NULL)
        OR (child_session_id IS NOT NULL AND child_run_id IS NOT NULL)
      ),
      CHECK (
        (status = 'running' AND lease_owner_digest IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (status != 'running' AND lease_owner_digest IS NULL AND lease_expires_at IS NULL)
      ),
      CHECK (
        (status IN ('queued', 'running')
          AND result_envelope_digest IS NULL AND result_envelope_json IS NULL
          AND result_delivered_to_turn_id IS NULL)
        OR (status IN ('needs_input', 'completed', 'failed')
          AND child_session_id IS NOT NULL AND child_run_id IS NOT NULL
          AND result_envelope_digest IS NOT NULL AND result_envelope_json IS NOT NULL)
      )
    );
    CREATE INDEX worker_sessions_parent_status_idx
      ON worker_sessions(parent_run_id, status, created_at);
    CREATE UNIQUE INDEX worker_sessions_one_discussion_per_parent_idx
      ON worker_sessions(parent_run_id);
    CREATE INDEX worker_sessions_parent_delivery_idx
      ON worker_sessions(parent_run_id, result_delivered_to_turn_id, created_at);
  `);
}

function createLegacyExecutionWorkerTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE execution_worker_sessions (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL UNIQUE REFERENCES action_reservations(id) ON DELETE CASCADE,
      parent_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      parent_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'paused', 'needs_input', 'completed', 'failed')
      ),
      task_envelope_digest TEXT NOT NULL UNIQUE,
      task_envelope_json TEXT NOT NULL,
      child_execution_lock_digest TEXT NOT NULL,
      child_execution_lock_json TEXT NOT NULL,
      lineage_id TEXT NOT NULL UNIQUE REFERENCES delivery_lineages(id) ON DELETE RESTRICT,
      result_envelope_digest TEXT UNIQUE,
      result_envelope_json TEXT,
      result_delivered_to_turn_id TEXT REFERENCES turns(id),
      lease_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (lease_ordinal >= 0),
      lease_owner_digest TEXT,
      lease_expires_at TEXT,
      attempt_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (status = 'running' AND lease_owner_digest IS NOT NULL
          AND lease_expires_at IS NOT NULL AND attempt_id IS NOT NULL)
        OR (status != 'running' AND lease_owner_digest IS NULL AND lease_expires_at IS NULL)
      ),
      CHECK (
        (status IN ('queued', 'running', 'paused')
          AND result_envelope_digest IS NULL AND result_envelope_json IS NULL
          AND result_delivered_to_turn_id IS NULL)
        OR (status IN ('needs_input', 'completed', 'failed')
          AND result_envelope_digest IS NOT NULL AND result_envelope_json IS NOT NULL)
      )
    );
    CREATE INDEX execution_workers_parent_status_idx
      ON execution_worker_sessions(parent_run_id, status, created_at);
    CREATE UNIQUE INDEX execution_workers_one_per_parent_idx
      ON execution_worker_sessions(parent_run_id);
    CREATE INDEX execution_workers_parent_delivery_idx
      ON execution_worker_sessions(parent_run_id, result_delivered_to_turn_id, created_at);
  `);
}

async function dispatchExecutionWorker(store: SqliteRuntimeStore, fixture: GitFixture) {
  const parent = await beginExecutionParent(store, fixture.repository);
  const invocation = executionInvocation(
    parent.started.run.id,
    parent.started.run.turn_id,
    fixture,
    "execution-call"
  );
  const result = await parent.gateway.invoke(invocation);
  assert.equal(result.status, "completed");
  if (result.status !== "completed") throw new Error("Execution Worker dispatch failed.");
  const worker = store.inspectExecutionWorker(String(result.receipt.output.worker_id));
  assert.ok(worker);
  return { ...parent, invocation, result, worker };
}

async function beginExecutionParent(store: SqliteRuntimeStore, repository: string) {
  const engine = new OrchestrationEngine(store, []);
  const dispatch = createExecutionWorkerDispatchAction(engine);
  const gateway = new ActionGateway(store, [dispatch], { allowed_effect_classes: ["local_write"] });
  const started = store.beginRun({
    request: "Supervise one bounded execution Worker.",
    execution_lock: {
      model: {
        config_id: "synthetic",
        provider: "synthetic",
        api: "openai-responses",
        base_url: "http://127.0.0.1:9999/v1",
        model: "synthetic",
        credential_ref: "synthetic",
        reasoning_effort: null,
        context_window_tokens: 128_000,
        max_output_tokens: 4_000,
        timeout_ms: 30_000
      },
      authority: { cwd: repository },
      configuration: { selector: "test", source_refs: ["test:execution-worker"] },
      actions: executionLockActions(gateway.contracts())
    }
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
    arguments: executionTask(fixture)
  };
}

function executionTask(fixture: GitFixture) {
  return {
    objective: "Implement one bounded synthetic source change.",
    expected_result: "Create src/feature.txt and pass exact verification.",
    context_refs: ["issue:146"],
    artifact_refs: ["artifact:synthetic-fixture"],
    constraints: ["no commit", "no push", "Supervisor owns completion"],
    verification_commands: [{
      command: fixture.branch.endsWith("verification") ? "git" : "node",
      args: fixture.branch.endsWith("verification")
        ? ["diff", "--check"]
        : ["--test", "verify.test.js"],
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
    rollback_instruction: "Discard this isolated worktree without merging the branch."
  };
}

function fakeExecutor(mutate: (task: ExecutionTaskEnvelope) => Promise<void>): ExecutionWorkerExecutor {
  return {
    async execute(task): Promise<ExecutionAdapterResult> {
      await mutate(task);
      return {
        status: "done",
        summary: "The bounded synthetic implementation is ready for Supervisor inspection.",
        changed_files: ["src/feature.txt"],
        tests: ["exact node verification requested by the Task"],
        blockers: [],
        next_action: "Supervisor should inspect canonical Git and verification evidence.",
        completion_authority: "supervisor",
        execution: {
          adapter: "injected_test",
          thread_id: null,
          requested_model: "synthetic",
          observed_model: "synthetic",
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
  const root = await mkdtemp(join(tmpdir(), `evi-vnext-execution-${label}-`));
  const repository = join(root, "repository");
  const worktree = join(root, "lineage");
  const branch = `codex/test-${label}`;
  await mkdir(join(repository, "src"), { recursive: true });
  await mkdir(join(repository, "tests"), { recursive: true });
  await git(repository, ["init", "-b", "develop"]);
  await git(repository, ["config", "user.name", "Evi Test"]);
  await git(repository, ["config", "user.email", "evi-test@example.invalid"]);
  await writeFile(join(repository, "README.md"), "fixture\n");
  await writeFile(join(repository, "src", ".gitkeep"), "");
  await writeFile(join(repository, "tests", ".gitkeep"), "");
  await writeFile(join(repository, "src", "feature.txt"), "baseline\n");
  await writeFile(join(repository, "verify.test.js"), [
    "import assert from 'node:assert/strict';",
    "import { readFile } from 'node:fs/promises';",
    "import test from 'node:test';",
    "test('feature output', async () => {",
    "  assert.ok((await readFile('src/feature.txt', 'utf8')).length >= 2);",
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
