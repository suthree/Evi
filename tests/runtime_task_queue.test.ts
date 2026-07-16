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
  listRuntimeTaskQueue
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
    assert.equal(tasks[0]?.max_attempts, 3);
  } finally {
    await fixture.cleanup();
  }
});

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
