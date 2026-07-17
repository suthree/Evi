import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  claimRuntimeTask,
  completeRuntimeTask,
  enqueueRuntimeTask,
  failRuntimeTask,
  listRecoverableRuntimeTasks,
  listRuntimeTaskQueue,
  parseRuntimeTaskExecutionContract
} from "../packages/core/src/runtime_task_queue.js";
import { AgentStore } from "../packages/core/src/store.js";

test("runtime task queue keeps latest append-only status per task id", async () => {
  const fixture = await createFixture();
  try {
    const queued = await enqueueRuntimeTask(fixture.store, {
      runtimeSessionId: "runtime_session_1",
      sourceKind: "feishu",
      sourceRouteKey: "feishu:default:group:oc_group:main",
      sourceKey: "feishu:default:group:oc_group:main:ops",
      task: "check daemon",
      now: "2026-07-07T00:00:00.000Z"
    });
    const claimed = await claimRuntimeTask(fixture.store, {
      id: queued.id,
      now: "2026-07-07T00:00:01.000Z"
    });
    assert.equal(claimed?.attempt, 1);
    await completeRuntimeTask(fixture.store, {
      id: queued.id,
      status: "blocked",
      now: "2026-07-07T00:00:02.000Z"
    });
    await writeFile(join(fixture.stateRoot, "runs/task_queue.jsonl"), "not-json\n", { flag: "a" });

    const raw = await readJsonl(join(fixture.stateRoot, "runs/task_queue.jsonl"));
    assert.deepEqual(raw.map((entry) => entry.status), ["queued", "running", "blocked"]);
    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.id, queued.id);
    assert.equal(tasks[0]?.status, "blocked");
    assert.equal(tasks[0]?.attempt, 1);
    assert.equal(tasks[0]?.source_route_key, "feishu:default:group:oc_group:main");
    assert.equal(tasks[0]?.source_key, "feishu:default:group:oc_group:main:ops");
    assert.equal(tasks[0]?.created_at, "2026-07-07T00:00:00.000Z");
    assert.equal(tasks[0]?.updated_at, "2026-07-07T00:00:02.000Z");
  } finally {
    await fixture.cleanup();
  }
});

test("runtime task queue lists queued and stale running tasks for recovery", async () => {
  const fixture = await createFixture();
  try {
    const queued = await enqueueRuntimeTask(fixture.store, {
      task: "queued task",
      now: "2026-07-07T00:00:00.000Z"
    });
    const stale = await enqueueRuntimeTask(fixture.store, {
      task: "stale task",
      now: "2026-07-07T00:00:00.000Z"
    });
    await claimRuntimeTask(fixture.store, {
      id: stale.id,
      now: "2026-07-07T00:00:01.000Z"
    });
    const fresh = await enqueueRuntimeTask(fixture.store, {
      task: "fresh task",
      now: "2026-07-07T00:20:00.000Z"
    });
    await claimRuntimeTask(fixture.store, {
      id: fresh.id,
      now: "2026-07-07T00:20:00.000Z"
    });
    const failed = await enqueueRuntimeTask(fixture.store, {
      task: "failed task",
      now: "2026-07-07T00:00:00.000Z"
    });
    await failRuntimeTask(fixture.store, {
      id: failed.id,
      error: "boom",
      now: "2026-07-07T00:00:02.000Z"
    });

    const recoverable = await listRecoverableRuntimeTasks(fixture.store, {
      now: "2026-07-07T00:31:00.000Z",
      runningStaleMs: 30 * 60 * 1000
    });
    assert.deepEqual(recoverable.map((entry) => entry.id).sort(), [queued.id, stale.id].sort());
  } finally {
    await fixture.cleanup();
  }
});

test("runtime task queue normalizes legacy rows without continuity fields", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.appendJsonl("runs/task_queue.jsonl", {
      type: "runtime_task_queue",
      id: "runtime_task_legacy",
      runtime_session_id: null,
      source_kind: "local",
      source_route_key: null,
      source_key: null,
      task: "resume a legacy queue record",
      runner_task: null,
      status: "queued",
      attempt: 0,
      error: null,
      created_at: "2026-07-07T00:00:00.000Z",
      updated_at: "2026-07-07T00:00:00.000Z",
      boundary: "legacy test row"
    });

    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.worktree, fixture.repoRoot);
    assert.equal(tasks[0]?.live_session_id, null);
    assert.equal(tasks[0]?.working_checkpoint_ref, null);
    assert.equal(tasks[0]?.next_action, null);
    assert.equal(tasks[0]?.execution_contract, null);
    assert.equal(tasks[0]?.max_attempts, 3);
  } finally {
    await fixture.cleanup();
  }
});

test("runtime task queue preserves one immutable operator execution contract", async () => {
  const fixture = await createFixture();
  try {
    const executionContract = parseRuntimeTaskExecutionContract(operatorExecutionContract());
    const queued = await enqueueRuntimeTask(fixture.store, {
      task: "deliver one bounded change",
      executionContract,
      now: "2026-07-17T00:00:00.000Z"
    });
    assert.deepEqual(queued.execution_contract, executionContract);
    assert.equal(Object.isFrozen(queued.execution_contract), true);
    assert.equal(Object.isFrozen(queued.execution_contract?.budget), true);
    assert.match(queued.execution_contract?.authority_digest ?? "", /^[a-f0-9]{64}$/);
    await claimRuntimeTask(fixture.store, {
      id: queued.id,
      now: "2026-07-17T00:00:01.000Z"
    });
    const current = (await listRuntimeTaskQueue(fixture.store))[0];
    assert.deepEqual(current?.execution_contract, executionContract);
  } finally {
    await fixture.cleanup();
  }
});

test("operator execution contract rejects implicit or unbounded external authority", () => {
  assert.throws(
    () => parseRuntimeTaskExecutionContract({
      ...operatorExecutionContract(),
      operator_confirmed: false
    }),
    /operator_confirmed must be true/
  );
  assert.throws(
    () => parseRuntimeTaskExecutionContract({
      ...operatorExecutionContract(),
      external_command_allowlist: []
    }),
    /external_write requires external_command_allowlist/
  );
  assert.throws(
    () => parseRuntimeTaskExecutionContract({
      ...operatorExecutionContract(),
      budget: { max_model_rounds: 9, max_tool_calls: 16 }
    }),
    /max_model_rounds/
  );
  const normalized = parseRuntimeTaskExecutionContract(operatorExecutionContract());
  assert.throws(
    () => parseRuntimeTaskExecutionContract({
      ...normalized,
      authority_digest: "0".repeat(64)
    }),
    /authority_digest does not match/
  );
});

function operatorExecutionContract(): Record<string, unknown> {
  return {
    schema_version: 1,
    decision_owner: "operator",
    authority_basis: "Explicit operator authorization for one bounded integration task.",
    allowed_effects: ["GitHub Issue and pull request on develop"],
    forbidden_effects: ["main, tags, releases, public publication, and force push"],
    external_command_allowlist: ["git", "gh"],
    forbidden_command_arguments: ["main", "--force", "--delete"],
    budget: { max_model_rounds: 5, max_tool_calls: 16 },
    side_effect_ceiling: "external_write",
    operator_confirmed: true,
    expires_with_task: true
  };
}

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, any>);
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-task-queue-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    store: new AgentStore(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
