import { execFile } from "node:child_process";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  goalRepositoryAuthoritySchema,
  inspectGoalRepositoryAuthority,
  type GoalRepositoryAuthority
} from "./repository_authority.js";

const execFileAsync = promisify(execFile);
const BRANCH_PATTERN = /^codex\/issue-[1-9][0-9]*-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export const GOAL_EXECUTION_WORKSPACE_BOUNDARY =
  "one Goal-bound sibling linked worktree derived from canonical preparation evidence; no registry, cleanup scheduler, or completion authority" as const;

export const goalExecutionWorkspaceSchema = z.object({
  schema_version: z.literal(1),
  goal_id: z.string().trim().min(1).max(128),
  control_start_head_commit: z.string().regex(/^[a-f0-9]{40}$/),
  authority: goalRepositoryAuthoritySchema,
  boundary: z.literal(GOAL_EXECUTION_WORKSPACE_BOUNDARY)
}).strict();

export type GoalExecutionWorkspace = z.infer<typeof goalExecutionWorkspaceSchema>;

export interface PrepareGoalExecutionWorkspaceInput {
  goal_id: string;
  control_authority: GoalRepositoryAuthority;
  branch: string;
  base_commit: string;
}

export interface GoalToolExecutionContext {
  goal_id: string;
  control_repository_authority: GoalRepositoryAuthority;
  execution_workspace: GoalExecutionWorkspace | null;
}

/**
 * Prepare one exact linked worktree. Git process details, path derivation, and
 * rollback of artifacts created by this attempt stay behind this Interface.
 */
export async function prepareGoalExecutionWorkspace(
  input: PrepareGoalExecutionWorkspaceInput
): Promise<GoalExecutionWorkspace> {
  const goalId = required(input.goal_id, "workspace.prepare requires a Goal id");
  const control = goalRepositoryAuthoritySchema.parse(input.control_authority);
  const branch = required(input.branch, "workspace.prepare requires a branch");
  const baseCommit = required(input.base_commit, "workspace.prepare requires a base_commit");
  if (!BRANCH_PATTERN.test(branch)) {
    throw new Error("workspace.prepare branch must match codex/issue-N-slug");
  }
  if (baseCommit !== control.start_head_commit) {
    throw new Error("workspace.prepare base_commit must equal the Goal control start HEAD");
  }

  const controlRoot = await realpath(control.worktree);
  const liveControl = await inspectGoalRepositoryAuthority(controlRoot);
  if (liveControl.repo_root !== control.repo_root
    || liveControl.git_common_dir !== control.git_common_dir
    || liveControl.worktree !== control.worktree
    || liveControl.branch !== control.branch) {
    throw new Error("workspace.prepare control repository authority changed");
  }
  if (await realpath(resolve(controlRoot, ".git")) !== control.git_common_dir) {
    throw new Error("workspace.prepare requires the main control checkout");
  }
  if (await gitText(controlRoot, ["status", "--porcelain=v1", "--untracked-files=all"])) {
    throw new Error("workspace.prepare requires a clean control checkout");
  }
  if (await gitSucceeds(controlRoot, ["show-ref", "--verify", `refs/heads/${branch}`])) {
    throw new Error(`workspace.prepare branch already exists: ${branch}`);
  }
  if (!await gitSucceeds(controlRoot, ["cat-file", "-e", `${baseCommit}^{commit}`])) {
    throw new Error("workspace.prepare base_commit is not a local commit");
  }

  const worktreeRoot = resolve(controlRoot, ".worktrees");
  const leaf = basename(branch);
  const worktreePath = resolve(worktreeRoot, leaf);
  if (!await gitSucceeds(controlRoot, ["check-ignore", "-q", "--", `.worktrees/${leaf}`])) {
    throw new Error("workspace.prepare requires the derived .worktrees path to be ignored by Git");
  }
  if (await pathExists(worktreePath)) {
    throw new Error(`workspace.prepare derived worktree path already exists: ${worktreePath}`);
  }
  await mkdir(worktreeRoot, { recursive: true });

  let commandAttempted = false;
  try {
    commandAttempted = true;
    await git(controlRoot, ["worktree", "add", "-b", branch, worktreePath, baseCommit]);
    const authority = await inspectGoalRepositoryAuthority(worktreePath);
    if (authority.git_common_dir !== control.git_common_dir
      || authority.branch !== branch
      || authority.start_head_commit !== baseCommit) {
      throw new Error("workspace.prepare created authority does not match the requested branch and base");
    }
    return goalExecutionWorkspaceSchema.parse({
      schema_version: 1,
      goal_id: goalId,
      control_start_head_commit: control.start_head_commit,
      authority,
      boundary: GOAL_EXECUTION_WORKSPACE_BOUNDARY
    });
  } catch (error) {
    if (commandAttempted) await rollbackCreatedWorkspace(controlRoot, worktreePath, branch, baseCommit);
    throw new Error(`workspace.prepare failed: ${errorMessage(error)}`);
  }
}

export function assertGoalExecutionWorkspace(
  value: unknown,
  goalId: string,
  control: GoalRepositoryAuthority
): GoalExecutionWorkspace {
  const workspace = goalExecutionWorkspaceSchema.parse(value);
  if (workspace.goal_id !== goalId
    || workspace.control_start_head_commit !== control.start_head_commit
    || workspace.authority.git_common_dir !== control.git_common_dir
    || workspace.authority.start_head_commit !== control.start_head_commit) {
    throw new Error("execution workspace does not match the Goal control authority");
  }
  return workspace;
}

function required(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

async function rollbackCreatedWorkspace(
  controlRoot: string,
  worktreePath: string,
  branch: string,
  baseCommit: string
): Promise<void> {
  const registered = (await gitText(controlRoot, ["worktree", "list", "--porcelain"]).catch(() => ""))
    .split(/\r?\n/)
    .some((line) => line === `worktree ${worktreePath}`);
  if (registered) {
    await git(controlRoot, ["worktree", "remove", "--force", worktreePath]).catch(() => undefined);
  }
  const branchHead = await gitText(controlRoot, ["rev-parse", "--verify", `refs/heads/${branch}`]).catch(() => "");
  if (registered && branchHead === baseCommit) {
    await git(controlRoot, ["branch", "-D", branch]).catch(() => undefined);
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

async function gitText(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024
  });
  return result.stdout.trim();
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024
  });
}

async function gitSucceeds(cwd: string, args: string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
