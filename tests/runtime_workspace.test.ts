import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getRuntimeWorkspaceStatus } from "../packages/core/src/runtime_workspace.js";
import { AgentStore } from "../packages/core/src/store.js";

test("runtime workspace reports unsupported top-level runtime dirs with cleanup actions", async () => {
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

    assert.equal(result.status, "invalid_layout");
    assert.equal(result.runtime_root_exists, true);
    assert.equal(result.invalid_dir_count, 5);
    assert.deepEqual(result.recommended_layout, [
      ".runtime/state",
      ".runtime/stage",
      ".runtime/smoke/<name>"
    ]);
    assert.deepEqual(result.invalid_dirs.map((dir) => [dir.path, dir.recommended_action]), [
      [".runtime-goal-smoke", "move needed evidence to .runtime/smoke/goal-smoke, otherwise delete it"],
      [".runtime-not-a-dir", "delete it; there is no supported repo-local runtime archive namespace"],
      [".runtime-notes", "delete it; there is no supported repo-local runtime archive namespace"],
      [".runtime-state", "delete it after copying any needed evidence into .runtime/state"],
      [".runtime_pipeline", "move needed evidence to .runtime/stage/pipeline, otherwise delete it"]
    ]);
    assert.match(result.boundary, /does not read file bodies/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime workspace reports ok when unsupported top-level runtime dirs are absent", async () => {
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
    assert.equal(result.invalid_dir_count, 0);
    assert.deepEqual(result.invalid_dirs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
