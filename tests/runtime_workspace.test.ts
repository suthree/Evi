import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getRuntimeWorkspaceStatus } from "../packages/core/src/runtime_workspace.js";
import { AgentStore } from "../packages/core/src/store.js";

test("runtime workspace rejects every project-local runtime directory", async () => {
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
    assert.equal(result.invalid_dir_count, 6);
    assert.deepEqual(result.recommended_layout, [
      "~/.local-runtime/state/evi",
      "~/.local-runtime/state-baselines/<name>",
      "~/.local-runtime/archives/<archive-id>"
    ]);
    assert.deepEqual(result.invalid_dirs.map((dir) => [dir.path, dir.recommended_action]), [
      [".runtime", "migrate needed evidence to ~/.local-runtime/state/evi, then remove this project-local runtime directory"],
      [".runtime-goal-smoke", "move needed evidence to ~/.local-runtime/state-baselines/goal-smoke, otherwise delete it"],
      [".runtime-not-a-dir", "migrate needed evidence to ~/.local-runtime, otherwise delete it"],
      [".runtime-notes", "migrate needed evidence to ~/.local-runtime, otherwise delete it"],
      [".runtime-state", "migrate needed evidence to ~/.local-runtime, otherwise delete it"],
      [".runtime_pipeline", "move needed evidence to ~/.local-runtime/state-baselines, otherwise delete it"]
    ]);
    assert.match(result.boundary, /does not read file bodies/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime workspace reports ok when project-local runtime dirs are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-workspace-hygiene-"));
  const repoRoot = join(root, "repo");
  const store = new AgentStore(repoRoot, join(root, "state"));
  try {
    await mkdir(repoRoot, { recursive: true });
    const result = await getRuntimeWorkspaceStatus(store, {
      now: "2026-07-03T00:00:00.000Z"
    });

    assert.equal(result.status, "ok");
    assert.equal(result.runtime_root_exists, false);
    assert.equal(result.invalid_dir_count, 0);
    assert.deepEqual(result.invalid_dirs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
