import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  GOAL_EXECUTION_WORKSPACE_BOUNDARY,
  prepareGoalExecutionWorkspace
} from "../packages/runtime/src/goal_execution_workspace.js";
import { inspectGoalRepositoryAuthority } from "../packages/runtime/src/repository_authority.js";

const execFileAsync = promisify(execFile);

test("execution workspace Module prepares one derived clean linked worktree", async () => {
  const fixture = await createFixture();
  try {
    const control = await inspectGoalRepositoryAuthority(fixture.repoRoot);
    const workspace = await prepareGoalExecutionWorkspace({
      goal_id: "goal_workspace_success",
      control_authority: control,
      branch: "codex/issue-97-workspace-success",
      base_commit: control.start_head_commit
    });

    assert.equal(workspace.goal_id, "goal_workspace_success");
    assert.equal(workspace.control_start_head_commit, control.start_head_commit);
    assert.equal(workspace.authority.branch, "codex/issue-97-workspace-success");
    assert.equal(workspace.authority.start_head_commit, control.start_head_commit);
    assert.equal(workspace.authority.git_common_dir, control.git_common_dir);
    assert.equal(workspace.authority.worktree, await realpath(join(fixture.repoRoot, ".worktrees", "issue-97-workspace-success")));
    assert.equal(workspace.boundary, GOAL_EXECUTION_WORKSPACE_BOUNDARY);
    assert.equal(await gitText(fixture.repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
    assert.match(await gitText(fixture.repoRoot, ["worktree", "list", "--porcelain"]), /issue-97-workspace-success/);
  } finally {
    await fixture.cleanup();
  }
});

test("execution workspace Module rejects invalid branch, base, dirty control, and existing branch before mutation", async () => {
  const fixture = await createFixture();
  try {
    const control = await inspectGoalRepositoryAuthority(fixture.repoRoot);
    await assert.rejects(prepareGoalExecutionWorkspace({
      goal_id: "goal_workspace_invalid_branch",
      control_authority: control,
      branch: "feature/not-allowed",
      base_commit: control.start_head_commit
    }), /codex\/issue-N-slug/);
    await assert.rejects(prepareGoalExecutionWorkspace({
      goal_id: "goal_workspace_invalid_base",
      control_authority: control,
      branch: "codex/issue-97-invalid-base",
      base_commit: "f".repeat(40)
    }), /must equal the Goal control start HEAD/);

    await writeFile(join(fixture.repoRoot, "dirty.txt"), "dirty\n", "utf8");
    await assert.rejects(prepareGoalExecutionWorkspace({
      goal_id: "goal_workspace_dirty",
      control_authority: control,
      branch: "codex/issue-97-dirty-control",
      base_commit: control.start_head_commit
    }), /clean control checkout/);
    await rm(join(fixture.repoRoot, "dirty.txt"));

    await git(fixture.repoRoot, ["branch", "codex/issue-97-existing-branch", control.start_head_commit]);
    await assert.rejects(prepareGoalExecutionWorkspace({
      goal_id: "goal_workspace_existing",
      control_authority: control,
      branch: "codex/issue-97-existing-branch",
      base_commit: control.start_head_commit
    }), /branch already exists/);
    assert.equal(await pathExists(join(fixture.repoRoot, ".worktrees", "issue-97-existing-branch")), false);
  } finally {
    await fixture.cleanup();
  }
});

test("execution workspace Module removes exact artifacts left by a failed Git prepare", async () => {
  const fixture = await createFixture();
  try {
    const control = await inspectGoalRepositoryAuthority(fixture.repoRoot);
    const hook = join(fixture.repoRoot, ".git", "hooks", "post-checkout");
    await mkdir(join(fixture.repoRoot, ".git", "hooks"), { recursive: true });
    await writeFile(hook, "#!/bin/sh\nexit 1\n", "utf8");
    await chmod(hook, 0o755);

    const branch = "codex/issue-97-hook-failure";
    const path = join(fixture.repoRoot, ".worktrees", "issue-97-hook-failure");
    await assert.rejects(prepareGoalExecutionWorkspace({
      goal_id: "goal_workspace_hook_failure",
      control_authority: control,
      branch,
      base_commit: control.start_head_commit
    }), /workspace\.prepare failed/);

    assert.notEqual(await gitExit(fixture.repoRoot, ["show-ref", "--verify", `refs/heads/${branch}`]), 0);
    assert.equal(await pathExists(path), false);
    assert.doesNotMatch(await gitText(fixture.repoRoot, ["worktree", "list", "--porcelain"]), /issue-97-hook-failure/);
  } finally {
    await fixture.cleanup();
  }
});

test("execution workspace Module rejects an unignored derived root without mutation", async () => {
  const fixture = await createFixture({ ignoreWorktrees: false });
  try {
    const control = await inspectGoalRepositoryAuthority(fixture.repoRoot);
    const branch = "codex/issue-97-unignored-root";
    await assert.rejects(prepareGoalExecutionWorkspace({
      goal_id: "goal_workspace_unignored",
      control_authority: control,
      branch,
      base_commit: control.start_head_commit
    }), /requires the derived \.worktrees path to be ignored/);

    assert.notEqual(await gitExit(fixture.repoRoot, ["show-ref", "--verify", `refs/heads/${branch}`]), 0);
    assert.equal(await pathExists(join(fixture.repoRoot, ".worktrees", "issue-97-unignored-root")), false);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(options: { ignoreWorktrees?: boolean } = {}): Promise<{
  root: string;
  repoRoot: string;
  cleanup(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "evi-goal-workspace-"));
  const repoRoot = join(root, "repo");
  await mkdir(repoRoot, { recursive: true });
  await git(repoRoot, ["init", "-q", "-b", "develop"]);
  await git(repoRoot, ["config", "user.email", "test@example.invalid"]);
  await git(repoRoot, ["config", "user.name", "Test"]);
  await writeFile(join(repoRoot, "README.md"), "fixture\n", "utf8");
  if (options.ignoreWorktrees !== false) {
    await writeFile(join(repoRoot, ".gitignore"), ".worktrees/\n", "utf8");
  }
  await git(repoRoot, ["add", "README.md", ...(options.ignoreWorktrees === false ? [] : [".gitignore"])]);
  await git(repoRoot, ["commit", "-qm", "fixture"]);
  return {
    root,
    repoRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd, maxBuffer: 64 * 1024 });
}

async function gitText(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 });
  return result.stdout.trim();
}

async function gitExit(cwd: string, args: string[]): Promise<number> {
  try {
    await git(cwd, args);
    return 0;
  } catch (error) {
    return (error as { code?: number }).code ?? 1;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
