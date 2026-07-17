import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  claimRuntimeTask,
  enqueueRuntimeTask,
  listRuntimeTaskQueue,
  parseRuntimeTaskExecutionContract
} from "../packages/core/src/runtime_task_queue.js";
import { listRuntimeChannelOutbox } from "../packages/core/src/runtime_channel_outbox.js";
import {
  listRuntimeTaskRuns,
  runtimeTaskRunStatusFromResult
} from "../packages/core/src/runtime_sessions.js";
import type { RunResult } from "../packages/core/src/schemas.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  createRuntimeTaskQueueWorker,
  runRuntimeTaskQueueOnce
} from "../packages/runtime/src/runtime_task_queue_worker.js";

test("runtime task queue worker stop awaits startup and leaves no late status write", async () => {
  const fixture = await createFixture();
  const firstWriteStarted = deferred<void>();
  const releaseFirstWrite = deferred<void>();
  const statusStates: string[] = [];
  let completedStatusWrites = 0;
  let blockFirstWrite = true;
  const store = new class extends AgentStore {
    override async writeJson(rel: string, value: unknown): Promise<string> {
      if (rel === "services/runtime/task_queue.json") {
        statusStates.push(String((value as Record<string, unknown>).state));
        if (blockFirstWrite) {
          blockFirstWrite = false;
          firstWriteStarted.resolve();
          await releaseFirstWrite.promise;
        }
      }
      const ref = await super.writeJson(rel, value);
      if (rel === "services/runtime/task_queue.json") completedStatusWrites += 1;
      return ref;
    }
  }(fixture.repoRoot, fixture.stateRoot);
  const worker = createRuntimeTaskQueueWorker({
    store,
    runTask: async () => stubRunResult("unused"),
    intervalMs: 60_000
  });
  try {
    worker.start();
    await firstWriteStarted.promise;

    let stopReturned = false;
    const stopping = worker.stop().then(() => {
      stopReturned = true;
    });
    await delay(20);
    assert.equal(stopReturned, false);

    releaseFirstWrite.resolve();
    await stopping;
    assert.equal(statusStates[0], "running");
    assert.equal(statusStates.at(-1), "stopped");
    const stopped = JSON.parse(await readFile(
      join(fixture.stateRoot, "services/runtime/task_queue.json"),
      "utf8"
    )) as Record<string, unknown>;
    assert.equal(stopped.state, "stopped");

    const writesAtStop = completedStatusWrites;
    await delay(30);
    assert.equal(completedStatusWrites, writesAtStop);
  } finally {
    releaseFirstWrite.resolve();
    await worker.stop();
    await fixture.cleanup();
  }
});

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
      executionContract: parseRuntimeTaskExecutionContract(operatorExecutionContract()),
      now: "2026-07-07T00:00:00.000Z"
    });
    const seen: string[] = [];
    const seenOwners: string[] = [];

    const summary = await runRuntimeTaskQueueOnce({
      store: fixture.store,
      limit: 5,
      queuedStaleMs: 30_000,
      runningStaleMs: 60 * 60 * 1000,
      clock: () => new Date("2026-07-07T00:01:00.000Z"),
      runTask: async (task, entry) => {
        seen.push(task);
        seenOwners.push(entry.execution_contract?.decision_owner ?? "none");
        return stubRunResult("done");
      }
    });

    assert.deepEqual(seen, ["rendered recover task"]);
    assert.deepEqual(seenOwners, ["operator"]);
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

test("runtime task status uses structured completion fields instead of verdict text", () => {
  assert.equal(runtimeTaskRunStatusFromResult({
    ...stubRunResult("blocked failed unverified"),
    completion_status: "done",
    verification_status: "passed"
  }), "done");
  assert.equal(runtimeTaskRunStatusFromResult({
    ...stubRunResult("everything looks complete"),
    completion_status: "done",
    verification_status: "failed"
  }), "failed");
  assert.equal(runtimeTaskRunStatusFromResult({
    ...stubRunResult("complete"),
    completion_status: "not_done",
    verification_status: "skipped"
  }), "blocked");
});

test("unfinished IM tasks keep stable continuity and stop after bounded resume attempts", async () => {
  const fixture = await createFixture();
  try {
    const queued = await enqueueRuntimeTask(fixture.store, {
      runtimeSessionId: "runtime_session_continuity",
      sourceKind: "feishu",
      sourceRouteKey: "feishu:main:p2p:ou_operator",
      sourceKey: "feishu:main:p2p:ou_operator:ops",
      task: "finish bounded engineering change",
      runnerTask: "implement the bounded engineering change",
      worktree: `${fixture.repoRoot}-stale`,
      now: "2026-07-07T00:00:00.000Z"
    });
    const renderedTasks: string[] = [];
    let calls = 0;
    const runOnce = (now: string) => runRuntimeTaskQueueOnce({
      store: fixture.store,
      queuedStaleMs: 30_000,
      runningStaleMs: 30_000,
      clock: () => new Date(now),
      runTask: async (task) => {
        calls += 1;
        renderedTasks.push(task);
        return {
          ...stubRunResult(`attempt ${calls} remains unfinished`, calls === 3 ? "blocked" : "not_done", "skipped"),
          session_id: `live_session_attempt_${calls}`,
          worktree: calls === 1 ? fixture.repoRoot : null,
          working_checkpoint_ref: "memory/working/current.json",
          next_action: `continue exact step ${calls}`
        };
      }
    });

    const first = await runOnce("2026-07-07T00:01:00.000Z");
    assert.equal(first.requeued_count, 1);
    let tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks[0]?.id, queued.id);
    assert.equal(tasks[0]?.status, "queued");
    assert.equal(tasks[0]?.attempt, 1);
    assert.equal(tasks[0]?.runtime_session_id, "runtime_session_continuity");
    assert.equal(tasks[0]?.live_session_id, "live_session_attempt_1");
    assert.equal(tasks[0]?.worktree, fixture.repoRoot);
    assert.equal(tasks[0]?.working_checkpoint_ref, "memory/working/current.json");
    assert.equal(tasks[0]?.next_action, "continue exact step 1");
    assert.equal(tasks[0]?.max_attempts, 3);

    const second = await runOnce("2026-07-07T00:02:00.000Z");
    assert.equal(second.requeued_count, 1);
    assert.match(renderedTasks[1] ?? "", new RegExp(`Stable task ID: ${queued.id}`));
    assert.match(renderedTasks[1] ?? "", /Runtime session ID: runtime_session_continuity/);
    assert.match(renderedTasks[1] ?? "", /Live session ID: live_session_attempt_1/);
    assert.equal((renderedTasks[1] ?? "").includes(`Worktree: ${fixture.repoRoot}`), true);
    assert.match(renderedTasks[1] ?? "", /Next action: continue exact step 1/);

    const third = await runOnce("2026-07-07T00:03:00.000Z");
    assert.equal(third.requeued_count, 0);
    assert.equal(third.failed_count, 1);
    tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks[0]?.status, "blocked");
    assert.equal(tasks[0]?.attempt, 3);
    assert.equal(tasks[0]?.live_session_id, "live_session_attempt_1");
    assert.equal(tasks[0]?.worktree, fixture.repoRoot);
    assert.equal(tasks[0]?.next_action, "continue exact step 3");

    const afterBound = await runOnce("2026-07-07T00:04:00.000Z");
    assert.equal(afterBound.due_count, 0);
    assert.equal(calls, 3);
    const rawQueue = await readJsonl(join(fixture.stateRoot, "runs/task_queue.jsonl"));
    assert.deepEqual(rawQueue.map((entry) => entry.status), [
      "queued", "running", "queued", "running", "queued", "running", "blocked"
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("deployment repair tasks requeue until a distinct repair deployment is requested", async () => {
  const fixture = await createFixture();
  const deploymentId = "deployment_failed_candidate";
  try {
    await fixture.store.writeJson(`deployments/history/${deploymentId}.json`, {
      schema_version: 1,
      type: "local_runtime_deployment",
      id: deploymentId,
      release_id: "failed-commit:digest",
      source_commit: "failed-commit",
      repo_root: fixture.repoRoot,
      state_root: fixture.stateRoot,
      bundle_digest: "digest",
      state_schema_version: 1,
      verification_refs: ["targeted check"],
      repair_chain_id: deploymentId,
      repair_attempt: 0,
      status: "recovered",
      requested_at: "2026-07-07T00:00:00.000Z",
      updated_at: "2026-07-07T00:00:00.000Z",
      boundary: "test"
    });
    const queued = await enqueueRuntimeTask(fixture.store, {
      sourceKind: "runtime",
      sourceKey: `deployment:${deploymentId}`,
      task: "repair deployment",
      runnerTask: "repair and redeploy",
      now: "2026-07-07T00:00:00.000Z"
    });

    const first = await runRuntimeTaskQueueOnce({
      store: fixture.store,
      queuedStaleMs: 30_000,
      clock: () => new Date("2026-07-07T00:01:00.000Z"),
      runTask: async () => stubRunResult("diagnosis finished; repair is not complete")
    });

    assert.equal(first.completed_count, 0);
    assert.equal(first.requeued_count, 1);
    let tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks[0]?.status, "queued");
    assert.equal(tasks[0]?.attempt, 1);
    assert.match(tasks[0]?.error ?? "", /completion gate failed/);
    assert.match(tasks[0]?.runner_task ?? "", /Continue the repair now/);

    await fixture.store.writeJson("deployments/history/deployment_repair_candidate.json", {
      schema_version: 1,
      type: "local_runtime_deployment",
      id: "deployment_repair_candidate",
      release_id: "repair-commit:digest",
      source_commit: "repair-commit",
      repo_root: fixture.repoRoot,
      state_root: fixture.stateRoot,
      bundle_digest: "digest",
      state_schema_version: 1,
      verification_refs: ["pnpm run check"],
      repair_chain_id: deploymentId,
      repair_attempt: 1,
      repair_of: deploymentId,
      status: "pending",
      requested_at: "2026-07-07T00:02:00.000Z",
      updated_at: "2026-07-07T00:02:00.000Z",
      boundary: "test"
    });
    const second = await runRuntimeTaskQueueOnce({
      store: fixture.store,
      queuedStaleMs: 30_000,
      clock: () => new Date("2026-07-07T00:02:01.000Z"),
      runTask: async () => stubRunResult("repair deployed")
    });

    assert.equal(second.completed_count, 1);
    assert.equal(second.requeued_count, 0);
    tasks = await listRuntimeTaskQueue(fixture.store);
    assert.equal(tasks[0]?.status, "done");
    assert.equal(tasks[0]?.attempt, 2);
    const rawQueue = await readJsonl(join(fixture.stateRoot, "runs/task_queue.jsonl"));
    assert.deepEqual(
      rawQueue.filter((entry) => entry.id === queued.id).map((entry) => entry.status),
      ["queued", "running", "queued", "running", "done"]
    );
  } finally {
    await fixture.cleanup();
  }
});

function stubRunResult(
  verdict: string,
  completionStatus: RunResult["completion_status"] = "done",
  verificationStatus: RunResult["verification_status"] = "passed"
): RunResult {
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
    completion_status: completionStatus,
    verification_status: verificationStatus,
    worktree: null,
    working_checkpoint_ref: null,
    next_action: null,
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value?: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: (value) => resolve(value as T | PromiseLike<T>)
  };
}
