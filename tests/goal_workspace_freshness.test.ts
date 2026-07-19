import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { inspectGoalRepositoryAuthority } from "../packages/runtime/src/repository_authority.js";
import {
  inspectGoalWorkspaceFreshness,
  latestObservedWorkspaceHead
} from "../packages/runtime/src/goal_workspace_freshness.js";
import { GOAL_EXECUTION_WORKSPACE_BOUNDARY } from "../packages/runtime/src/goal_execution_workspace.js";
import type { ToolResult } from "../packages/runtime/src/tools.js";

const execFileAsync = promisify(execFile);

test("workspace freshness distinguishes unbound, aligned, changed, and unavailable ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-goal-workspace-freshness-"));
  const repoRoot = join(root, "repo");
  const worktreeRoot = join(root, "worktree");
  await mkdir(repoRoot, { recursive: true });
  try {
    await git(repoRoot, ["init", "-b", "develop"]);
    await git(repoRoot, ["config", "user.name", "Workspace Freshness Test"]);
    await git(repoRoot, ["config", "user.email", "workspace-freshness@example.test"]);
    await git(repoRoot, ["config", "commit.gpgsign", "false"]);
    await writeFile(join(repoRoot, "README.md"), "fixture\n", "utf8");
    await git(repoRoot, ["add", "README.md"]);
    await git(repoRoot, ["commit", "-m", "fixture base"]);
    await git(repoRoot, ["worktree", "add", "-b", "codex/issue-110-fixture", worktreeRoot]);
    const authority = await inspectGoalRepositoryAuthority(worktreeRoot);
    const workspace = {
      schema_version: 1 as const,
      goal_id: "goal_workspace_freshness_fixture",
      control_start_head_commit: authority.start_head_commit,
      authority,
      boundary: GOAL_EXECUTION_WORKSPACE_BOUNDARY
    };

    assert.deepEqual(await inspectGoalWorkspaceFreshness({
      execution_workspace: null,
      observed_head_commit: null
    }), {
      status: "unbound",
      observed_head_commit: null,
      live_head_commit: null,
      reason: null,
      boundary: "derived live-vs-canonical Goal workspace freshness; routing context only, never canonical change evidence or completion authority"
    });

    const aligned = await inspectGoalWorkspaceFreshness({
      execution_workspace: workspace,
      observed_head_commit: authority.start_head_commit
    });
    assert.equal(aligned.status, "aligned");
    assert.equal(aligned.live_head_commit, authority.start_head_commit);

    await writeFile(join(worktreeRoot, "evidence.md"), "new evidence\n", "utf8");
    await git(worktreeRoot, ["add", "evidence.md"]);
    await git(worktreeRoot, ["commit", "-m", "record external evidence"]);
    const changedHead = await gitText(worktreeRoot, ["rev-parse", "HEAD"]);
    const changed = await inspectGoalWorkspaceFreshness({
      execution_workspace: workspace,
      observed_head_commit: authority.start_head_commit
    });
    assert.equal(changed.status, "changed_unobserved");
    assert.equal(changed.observed_head_commit, authority.start_head_commit);
    assert.equal(changed.live_head_commit, changedHead);

    const foreign = await inspectGoalWorkspaceFreshness({
      execution_workspace: {
        ...workspace,
        authority: { ...workspace.authority, branch: "codex/issue-110-foreign" }
      },
      observed_head_commit: authority.start_head_commit
    });
    assert.equal(foreign.status, "unavailable");
    assert.equal(foreign.live_head_commit, null);
    assert.equal(foreign.reason, "workspace_authority_mismatch");

    const missing = await inspectGoalWorkspaceFreshness({
      execution_workspace: {
        ...workspace,
        authority: {
          ...workspace.authority,
          repo_root: join(root, "missing"),
          worktree: join(root, "missing")
        }
      },
      observed_head_commit: authority.start_head_commit
    });
    assert.equal(missing.status, "unavailable");
    assert.equal(missing.reason, "live_workspace_unavailable");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("latest observed workspace HEAD trusts only harness-owned workspace observations and Git changes", () => {
  const base = "a".repeat(40);
  const commitChange = "b".repeat(40);
  const verificationHead = "c".repeat(40);
  const snapshotHead = "d".repeat(40);
  const unrelatedRuntimeHead = "e".repeat(40);
  const results: ToolResult[] = [
    toolResult({ changes: [{ kind: "git_commit", identity: commitChange }] }),
    toolResult({ verification: { after: { head_commit: verificationHead } } }),
    toolResult({ workspace_observation: {
      status: "observed",
      head_commit: snapshotHead,
      branch: "codex/issue-110-fixture",
      worktree: "/tmp/worktree",
      authority: "harness-owned post-tool workspace observation"
    } }),
    toolResult({ repository: { head_commit: unrelatedRuntimeHead } })
  ];

  assert.equal(latestObservedWorkspaceHead(base, results), snapshotHead);
  assert.equal(latestObservedWorkspaceHead(base, results.slice(0, 2)), verificationHead);
  assert.equal(latestObservedWorkspaceHead(base, [toolResult({ repository: { head_commit: unrelatedRuntimeHead } })]), base);
});

function toolResult(output: Record<string, unknown>): ToolResult {
  return {
    id: `tool_result_${Math.random()}`,
    tool: "fixture",
    ok: true,
    summary: "fixture observation",
    output,
    side_effect_level: "none",
    created_at: "2026-07-19T00:00:00.000Z"
  };
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd, encoding: "utf8" });
}

async function gitText(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout.trim();
}
