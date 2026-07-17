import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[a-f0-9]{40}$/;

export const GOAL_REPOSITORY_AUTHORITY_BOUNDARY =
  "immutable real Git worktree placement; start HEAD is provenance and must remain an ancestor" as const;

export const goalRepositoryAuthoritySchema = z.object({
  schema_version: z.literal(1),
  repo_root: z.string().trim().min(1).max(4_000),
  git_common_dir: z.string().trim().min(1).max(4_000),
  worktree: z.string().trim().min(1).max(4_000),
  branch: z.string().trim().min(1).max(500),
  start_head_commit: z.string().regex(SHA_PATTERN),
  boundary: z.literal(GOAL_REPOSITORY_AUTHORITY_BOUNDARY)
}).strict();

export type GoalRepositoryAuthority = z.infer<typeof goalRepositoryAuthoritySchema>;

export async function inspectGoalRepositoryAuthority(repoRoot: string): Promise<GoalRepositoryAuthority> {
  const configuredRoot = await realpath(resolve(repoRoot));
  const worktree = await realpath(await gitText(configuredRoot, ["rev-parse", "--show-toplevel"]));
  if (configuredRoot !== worktree) {
    throw new Error("GoalRuntime repo root must be the real Git worktree root.");
  }
  const gitCommonDir = await realpath(await gitText(worktree, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  ]));
  return goalRepositoryAuthoritySchema.parse({
    schema_version: 1,
    repo_root: worktree,
    git_common_dir: gitCommonDir,
    worktree,
    branch: await gitText(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]),
    start_head_commit: await gitText(worktree, ["rev-parse", "HEAD"]),
    boundary: GOAL_REPOSITORY_AUTHORITY_BOUNDARY
  });
}

export async function assertGoalRepositoryAuthority(
  expected: GoalRepositoryAuthority,
  repoRoot: string
): Promise<void> {
  const actual = await inspectGoalRepositoryAuthority(repoRoot);
  if (expected.repo_root !== actual.repo_root
    || expected.git_common_dir !== actual.git_common_dir
    || expected.worktree !== actual.worktree
    || expected.branch !== actual.branch) {
    throw new Error("GoalRuntime repository authority mismatch: the command is not using the Goal's bound Git worktree.");
  }
  if (!await gitSucceeds(actual.worktree, ["cat-file", "-e", `${expected.start_head_commit}^{commit}`])
    || !await gitSucceeds(actual.worktree, [
      "merge-base",
      "--is-ancestor",
      expected.start_head_commit,
      actual.start_head_commit
    ])) {
    throw new Error("GoalRuntime repository authority mismatch: the Goal start HEAD is no longer an ancestor of the current worktree HEAD.");
  }
}

async function gitText(cwd: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024
    });
    const value = result.stdout.trim();
    if (!value) throw new Error("empty Git output");
    return value;
  } catch (error) {
    throw new Error(`GoalRuntime could not inspect Git repository authority: ${errorMessage(error)}`);
  }
}

async function gitSucceeds(cwd: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync("git", args, { cwd, maxBuffer: 64 * 1024 });
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
