import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assessTestStateRootIsolation, getEnvironmentBaseline } from "../packages/core/src/environment_baseline.js";
import { AgentStore } from "../packages/core/src/store.js";

test("environment baseline composes read-only cleanliness, isolated test state, archives, and resident identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-environment-baseline-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "resident-state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await writeFile(join(repoRoot, "tracked.txt"), "baseline\n", "utf8");
    await git(repoRoot, ["init"]);
    await git(repoRoot, ["config", "user.name", "Local Runtime Test"]);
    await git(repoRoot, ["config", "user.email", "local-runtime@example.test"]);
    await git(repoRoot, ["add", "tracked.txt"]);
    await git(repoRoot, ["commit", "-m", "initial"]);
    const result = await getEnvironmentBaseline(store, {
      now: "2026-07-20T00:00:00.000Z",
      testStateRoot: "test-state"
    });

    assert.equal(result.action, "baseline");
    assert.equal(result.repository.workspace.status, "clean");
    assert.equal(result.test_state_root.status, "isolated");
    assert.equal(result.archive_health.status, "healthy");
    assert.equal(result.resident_deployment.service.repo_head.read_status, "ok");
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.attention_reasons, ["resident_unknown", "deployment_unknown"]);
    assert.match(result.boundary, /without creating/);
    assert.deepEqual(await readdir(stateRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("environment baseline fails closed when test state overlaps resident state", () => {
  assert.equal(assessTestStateRootIsolation("/tmp/state/smoke", "/tmp/state").status, "overlaps_resident_state");
  assert.equal(assessTestStateRootIsolation("/tmp/tests/state", "/tmp/resident/state").status, "isolated");
});

function git(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`git ${args.join(" ")} failed: ${stderr || stdout || error.message}`));
      resolve();
    });
  });
}
