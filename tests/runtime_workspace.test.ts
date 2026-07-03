import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getRuntimeWorkspaceStatus } from "../packages/core/src/runtime_workspace.js";
import { AgentStore } from "../packages/core/src/store.js";

test("runtime workspace reports legacy runtime dirs with recommended unified targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-workspace-hygiene-"));
  const repoRoot = join(root, "repo");
  const store = new AgentStore(repoRoot, join(root, "state"));
  try {
    await mkdir(join(repoRoot, ".runtime"), { recursive: true });
    await mkdir(join(repoRoot, ".runtime-state"), { recursive: true });
    await mkdir(join(repoRoot, ".runtime-goal-smoke"), { recursive: true });
    await mkdir(join(repoRoot, ".runtime_pipeline"), { recursive: true });
    await mkdir(join(repoRoot, ".runtime-notes"), { recursive: true });
    await mkdir(join(repoRoot, ".runtime-not-a-dir", "nested"), { recursive: true });

    const result = await getRuntimeWorkspaceStatus(store, {
      now: "2026-07-03T00:00:00.000Z"
    });

    assert.equal(result.status, "legacy_present");
    assert.equal(result.runtime_root_exists, true);
    assert.equal(result.legacy_dir_count, 5);
    assert.deepEqual(result.recommended_layout, [
      ".runtime/state",
      ".runtime/stage",
      ".runtime/smoke/<name>",
      ".runtime/legacy/<name>"
    ]);
    assert.deepEqual(result.legacy_dirs.map((dir) => [dir.path, dir.recommended_target]), [
      [".runtime-goal-smoke", ".runtime/smoke/goal-smoke"],
      [".runtime-not-a-dir", ".runtime/legacy/not-a-dir"],
      [".runtime-notes", ".runtime/legacy/notes"],
      [".runtime-state", ".runtime/state"],
      [".runtime_pipeline", ".runtime/stage/pipeline"]
    ]);
    assert.match(result.boundary, /does not read file bodies/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime workspace reports ok when legacy runtime dirs are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-workspace-hygiene-"));
  const repoRoot = join(root, "repo");
  const store = new AgentStore(repoRoot, join(root, "state"));
  try {
    await mkdir(join(repoRoot, ".runtime"), { recursive: true });

    const result = await getRuntimeWorkspaceStatus(store, {
      now: "2026-07-03T00:00:00.000Z"
    });

    assert.equal(result.status, "ok");
    assert.equal(result.runtime_root_exists, true);
    assert.equal(result.legacy_dir_count, 0);
    assert.deepEqual(result.legacy_dirs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
