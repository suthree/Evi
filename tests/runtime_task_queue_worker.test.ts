import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  claimRuntimeTask,
  enqueueRuntimeTask,
  listRuntimeTaskQueue
} from "../packages/core/src/runtime_task_queue.js";
import { listRuntimeChannelOutbox } from "../packages/core/src/runtime_channel_outbox.js";
import { listRuntimeTaskRuns } from "../packages/core/src/runtime_sessions.js";
import type { RunResult } from "../packages/core/src/schemas.js";
import { AgentStore } from "../packages/core/src/store.js";
import { runRuntimeTaskQueueOnce } from "../packages/runtime/src/runtime_task_queue_worker.js";

test("runtime task queue worker claims stale queued tasks and records final run status", async () => {
  const fixture = await createFixture();
  try {
    const fresh = await enqueueRuntimeTask(fixture.store, {
      task: "fresh task",
      now: "2026-07-07T00:01:00.000Z"
    });
    const queued = await enqueueRuntimeTask(fixture.store, {
      runtimeSessionId: "runtime_session_1",
      sourceKind: "feishu",
      sourceRouteKey: "feishu:default:group:oc_group:main",
      sourceKey: "feishu:default:group:oc_group:main:ops",
      task: "recover task",
      runnerTask: "rendered recover task",
      now: "2026-07-07T00:00:00.000Z"
    });
    const seen: string[] = [];

    const summary = await runRuntimeTaskQueueOnce({
      store: fixture.store,
      limit: 5,
      queuedStaleMs: 30_000,
      runningStaleMs: 60 * 60 * 1000,
      clock: () => new Date("2026-07-07T00:01:00.000Z"),
      runTask: async (task) => {
        seen.push(task);
        return stubRunResult("done");
      }
    });

    assert.deepEqual(seen, ["rendered recover task"]);
    assert.equal(summary.recoverable_count, 2);
    assert.equal(summary.due_count, 1);
    assert.deepEqual(summary.task_ids, [queued.id]);
    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks.find((entry) => entry.id === queued.id)?.status, "done");
    assert.equal(tasks.find((entry) => entry.id === fresh.id)?.status, "queued");
    const runs = await listRuntimeTaskRuns(fixture.store);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.id, queued.id);
    assert.equal(runs[0]?.status, "done");
    const outbox = await listRuntimeChannelOutbox(fixture.store);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.task_run_id, queued.id);
    assert.equal(outbox[0]?.purpose, "final");
    assert.equal(outbox[0]?.status, "queued");
    assert.equal(outbox[0]?.source_route_key, "feishu:default:group:oc_group:main");
    assert.equal(outbox[0]?.source_key, "feishu:default:group:oc_group:main:ops");
    assert.equal(outbox[0]?.text, "done");
    const rawQueue = await readJsonl(join(fixture.stateRoot, "runs/task_queue.jsonl"));
    assert.deepEqual(rawQueue.filter((entry) => entry.id === queued.id).map((entry) => entry.status), ["queued", "running", "done"]);
  } finally {
    await fixture.cleanup();
  }
});

test("runtime task queue worker reclaims stale running tasks once the stale threshold is reached", async () => {
  const fixture = await createFixture();
  try {
    const queued = await enqueueRuntimeTask(fixture.store, {
      task: "stale running task",
      now: "2026-07-07T00:00:00.000Z"
    });
    await claimRuntimeTask(fixture.store, {
      id: queued.id,
      now: "2026-07-07T00:00:01.000Z"
    });

    const summary = await runRuntimeTaskQueueOnce({
      store: fixture.store,
      queuedStaleMs: 30_000,
      runningStaleMs: 30_000,
      clock: () => new Date("2026-07-07T00:01:00.000Z"),
      runTask: async (task) => stubRunResult(`done:${task}`)
    });

    assert.equal(summary.claimed_count, 1);
    assert.equal(summary.completed_count, 1);
    const tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks[0]?.status, "done");
    assert.equal(tasks[0]?.attempt, 2);
    const rawQueue = await readJsonl(join(fixture.stateRoot, "runs/task_queue.jsonl"));
    assert.deepEqual(rawQueue.map((entry) => entry.status), ["queued", "running", "running", "done"]);
  } finally {
    await fixture.cleanup();
  }
});

function stubRunResult(verdict: string): RunResult {
  return {
    trigger_id: "trigger_queue_worker",
    opportunity_id: "opp_queue_worker",
    session_id: "session_queue_worker",
    turn_id: "turn_queue_worker",
    context_ref: "memory/episodes/queue-worker-context.md",
    context_manifest_ref: null,
    model_response_ref: "memory/episodes/queue-worker-model.json",
    envelope_ref: "memory/episodes/queue-worker-envelope.json",
    evidence_refs: [],
    sop_ref: null,
    audit_ref: null,
    skill_ref: null,
    recalled_skill_refs: [],
    final_response_ref: null,
    completion_report_ref: null,
    discipline_refs: null,
    verdict
  };
}

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, any>);
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `local-runtime-task-worker-${process.pid}-${Date.now()}-${Math.random()}`);
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
