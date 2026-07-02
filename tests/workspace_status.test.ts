import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import { getWorkspaceStatus, parseGitStatusOutput } from "../packages/core/src/workspace_status.js";

test("workspace status reports clean and dirty git worktrees without reading file bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-workspace-status-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await initGitRepo(repoRoot);
    await writeFile(join(repoRoot, "tracked.txt"), "one\n", "utf8");
    await git(repoRoot, ["add", "tracked.txt"]);
    await git(repoRoot, ["commit", "-m", "initial"]);

    const clean = await getWorkspaceStatus(store, {
      now: "2026-06-30T00:00:00.000Z"
    });
    assert.equal(clean.status, "clean");
    assert.equal(clean.changed_file_count, 0);
    assert.equal(clean.command, "git status --porcelain=v1 -b");
    assert.match(clean.boundary, /does not read file bodies/);

    await writeFile(join(repoRoot, "tracked.txt"), "two\n", "utf8");
    await writeFile(join(repoRoot, "untracked.txt"), "secret body should not appear\n", "utf8");

    const dirty = await getWorkspaceStatus(store, {
      now: "2026-06-30T00:00:01.000Z"
    });
    assert.equal(dirty.status, "dirty");
    assert.equal(dirty.changed_file_count, 2);
    assert.equal(dirty.unstaged_count, 1);
    assert.equal(dirty.untracked_count, 1);
    assert.equal(dirty.conflict_count, 0);
    assert.equal(dirty.changes.some((change) => change.path === "tracked.txt" && change.category === "unstaged"), true);
    assert.equal(dirty.changes.some((change) => change.path === "untracked.txt" && change.category === "untracked"), true);
    assert.equal(JSON.stringify(dirty).includes("secret body should not appear"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace status reports non-git repo as a bounded diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-workspace-status-"));
  const repoRoot = join(root, "repo");
  const store = new AgentStore(repoRoot, join(root, "state"));
  try {
    await mkdir(repoRoot, { recursive: true });
    const result = await getWorkspaceStatus(store, {
      now: "2026-06-30T00:00:00.000Z"
    });

    assert.equal(result.status, "not_git_repo");
    assert.equal(result.changed_file_count, 0);
    assert.match(result.stderr ?? "", /not a git repository/);
    assert.match(result.boundary, /no user-supplied argv/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace status parser extracts branch tracking and change categories", () => {
  const parsed = parseGitStatusOutput([
    "## develop...origin/develop [ahead 2, behind 1]",
    "M  staged.txt",
    " M unstaged.txt",
    "MM both.txt",
    "?? new.txt",
    "UU conflict.txt"
  ].join("\n"));

  assert.equal(parsed.branch, "develop");
  assert.equal(parsed.upstream, "origin/develop");
  assert.equal(parsed.ahead, 2);
  assert.equal(parsed.behind, 1);
  assert.deepEqual(parsed.changes.map((change) => change.category), [
    "staged",
    "unstaged",
    "staged_and_unstaged",
    "untracked",
    "conflict"
  ]);
});

async function initGitRepo(repoRoot: string): Promise<void> {
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.name", "Local Runtime Test"]);
  await git(repoRoot, ["config", "user.email", "local-runtime@example.test"]);
  await git(repoRoot, ["config", "commit.gpgsign", "false"]);
}

function git(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr || stdout || error.message}`));
        return;
      }
      resolve();
    });
  });
}
