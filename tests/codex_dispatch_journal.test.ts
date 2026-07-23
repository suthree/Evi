import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import {
  completeDurableCodexDispatch,
  markDurableCodexDispatchRunning,
  readDurableCodexDispatch,
  readDurableCodexDispatchForEffect,
  readTerminalDurableCodexDispatchResult,
  readTerminalDurableCodexDispatchResultForEffect,
  reserveDurableCodexDispatch
} from "../packages/runtime/src/codex_dispatch_journal.js";
import {
  codexDispatchWorkerInvocation,
  runDurableCodexDispatchWorker
} from "../packages/runtime/src/tools.js";

test("durable Codex worker resolves its source loader outside an isolated worktree", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-codex-dispatch-loader-"));
  const invocation = codexDispatchWorkerInvocation();
  try {
    const result = await new Promise<{ code: number | null; stderr: string }>((resolveResult, reject) => {
      const child = spawn(invocation.command, invocation.args, {
        cwd: root,
        stdio: ["pipe", "ignore", "pipe"]
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("close", (code) => {
        resolveResult({ code, stderr });
      });
      child.stdin.end("{}");
    });

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("durable Codex dispatch journal binds one owner and exposes only a verified terminal result", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-codex-dispatch-journal-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  const identity = {
    goal_id: "goal_dispatch_fixture",
    effect_id: "goal_effect_dispatch_fixture",
    action_digest: "a".repeat(64),
    authority_digest: "b".repeat(64)
  };
  const ownerId = "codex_dispatch_fixture";
  try {
    const reserved = await reserveDurableCodexDispatch(store, {
      ...identity,
      owner_id: ownerId,
      created_at: "2026-07-20T00:00:00.000Z"
    });
    assert.equal(reserved.created, true);
    assert.equal(reserved.record.state, "reserved");
    assert.equal(await readTerminalDurableCodexDispatchResult(store, identity), null);
    assert.equal((await readDurableCodexDispatchForEffect(store, {
      goal_id: identity.goal_id,
      effect_id: identity.effect_id,
      action_digest: identity.action_digest
    }))?.state, "reserved");

    const duplicate = await reserveDurableCodexDispatch(store, {
      ...identity,
      owner_id: "codex_dispatch_other",
      created_at: "2026-07-20T00:00:01.000Z"
    });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.record.owner_id, ownerId);

    const running = await markDurableCodexDispatchRunning(store, {
      ...identity,
      owner_id: ownerId,
      worker_pid: process.pid,
      updated_at: "2026-07-20T00:00:02.000Z"
    });
    assert.equal(running.state, "running");
    assert.equal(running.result, undefined);
    assert.equal((await readDurableCodexDispatchForEffect(store, {
      goal_id: identity.goal_id,
      effect_id: identity.effect_id,
      action_digest: identity.action_digest
    }))?.state, "running");

    const result = {
      id: "tool_result_dispatch_fixture",
      tool: "codex.run",
      ok: true,
      summary: "Bounded child result.",
      output: {
        authority_digest: identity.authority_digest,
        raw_prompts_persisted: false,
        status: "done",
        result: { status: "done" }
      },
      side_effect_level: "local_write" as const,
      created_at: "2026-07-20T00:00:03.000Z"
    };
    const completed = await completeDurableCodexDispatch(store, {
      ...identity,
      owner_id: ownerId,
      result,
      completed_at: "2026-07-20T00:00:04.000Z"
    });
    assert.equal(completed.state, "terminal");
    assert.deepEqual(await readTerminalDurableCodexDispatchResult(store, identity), result);
    assert.deepEqual(await readTerminalDurableCodexDispatchResultForEffect(store, {
      goal_id: identity.goal_id,
      effect_id: identity.effect_id,
      action_digest: identity.action_digest
    }), result);
    assert.equal((await readDurableCodexDispatchForEffect(store, {
      goal_id: identity.goal_id,
      effect_id: identity.effect_id,
      action_digest: identity.action_digest
    }))?.state, "terminal");
    assert.equal(await readTerminalDurableCodexDispatchResultForEffect(store, {
      goal_id: identity.goal_id,
      effect_id: identity.effect_id,
      action_digest: "c".repeat(64)
    }), null);
    const persisted = await readDurableCodexDispatch(store, identity);
    assert.equal(JSON.stringify(persisted).includes("\"prompt\""), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("durable Codex worker records a terminal failure without retaining its launch payload", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-codex-dispatch-worker-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const identity = {
    goal_id: "goal_worker_fixture",
    effect_id: "goal_effect_worker_fixture",
    action_digest: "d".repeat(64),
    authority_digest: "e".repeat(64)
  };
  const ownerId = "codex_dispatch_worker_fixture";
  try {
    await reserveDurableCodexDispatch(store, {
      ...identity,
      owner_id: ownerId,
      created_at: "2026-07-20T00:00:00.000Z"
    });
    await runDurableCodexDispatchWorker({
      schema_version: 1,
      store_repo_root: repoRoot,
      state_root: stateRoot,
      owner_id: ownerId,
      identity,
      arguments: { mode: "not-a-real-codex-mode", prompt: "must-not-be-persisted" }
    });
    const result = await readTerminalDurableCodexDispatchResult(store, identity);
    assert.equal(result?.ok, false);
    assert.equal(result?.output.failure_kind, "codex_invalid_request");
    const record = await readDurableCodexDispatch(store, identity);
    assert.equal(JSON.stringify(record).includes("must-not-be-persisted"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("durable Codex dispatch rejects a contradictory terminal structured result", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-codex-dispatch-contradictory-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  const identity = {
    goal_id: "goal_contradictory_fixture",
    effect_id: "goal_effect_contradictory_fixture",
    action_digest: "f".repeat(64),
    authority_digest: "a".repeat(64)
  };
  const ownerId = "codex_dispatch_contradictory_fixture";
  try {
    await reserveDurableCodexDispatch(store, {
      ...identity,
      owner_id: ownerId,
      created_at: "2026-07-21T00:00:00.000Z"
    });
    await assert.rejects(completeDurableCodexDispatch(store, {
      ...identity,
      owner_id: ownerId,
      result: {
        id: "tool_result_contradictory_fixture",
        tool: "codex.run",
        ok: true,
        summary: "Contradictory result.",
        output: {
          status: "failed",
          result: { status: "failed" }
        },
        side_effect_level: "local_write",
        created_at: "2026-07-21T00:00:01.000Z"
      },
      completed_at: "2026-07-21T00:00:02.000Z"
    }), /contradictory status/);
    assert.equal(await readTerminalDurableCodexDispatchResult(store, identity), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
