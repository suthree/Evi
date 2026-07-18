import { execFile } from "node:child_process";
import { lstat, mkdir, realpath, rmdir } from "node:fs/promises";
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

export const prepareGoalExecutionWorkspaceArgumentsSchema = z.object({
  branch: z.string().regex(BRANCH_PATTERN, "workspace.prepare branch must match codex/issue-N-slug"),
  base_commit: z.string().regex(/^[a-f0-9]{40}$/)
}).strict();

export type PrepareGoalExecutionWorkspaceArguments = z.infer<
  typeof prepareGoalExecutionWorkspaceArgumentsSchema
>;

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

export interface ExpectedGoalExecutionWorkspace {
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
  const args = prepareGoalExecutionWorkspaceArgumentsSchema.parse({
    branch: input.branch,
    base_commit: input.base_commit
  });
  const branch = args.branch;
  const baseCommit = args.base_commit;
  if (baseCommit !== control.start_head_commit) {
    throw new Error("workspace.prepare base_commit must equal the Goal control start HEAD");
  }

  const controlRoot = await realpath(control.worktree);
  const liveControl = await inspectGoalRepositoryAuthority(controlRoot);
  if (liveControl.repo_root !== control.repo_root
    || liveControl.git_common_dir !== control.git_common_dir
    || liveControl.worktree !== control.worktree
    || liveControl.branch !== control.branch
    || liveControl.start_head_commit !== control.start_head_commit) {
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

  let ownedBranch = false;
  let reservedPath = false;
  try {
    await git(controlRoot, ["branch", branch, baseCommit]);
    ownedBranch = true;
    await mkdir(worktreePath);
    reservedPath = true;
    await git(controlRoot, ["worktree", "add", worktreePath, branch]);
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
    const rollbackFailures = await rollbackCreatedWorkspace(
      controlRoot,
      worktreePath,
      branch,
      baseCommit,
      { ownedBranch, reservedPath }
    );
    const rollbackSummary = rollbackFailures.length > 0
      ? ` Rollback incomplete: ${rollbackFailures.join("; ")}`
      : "";
    throw new Error(`workspace.prepare failed: ${errorMessage(error)}${rollbackSummary}`);
  }
}

export function assertGoalExecutionWorkspace(
  value: unknown,
  goalId: string,
  control: GoalRepositoryAuthority,
  expected?: ExpectedGoalExecutionWorkspace
): GoalExecutionWorkspace {
  const workspace = goalExecutionWorkspaceSchema.parse(value);
  const branch = workspace.authority.branch;
  const expectedPath = resolve(control.repo_root, ".worktrees", basename(branch));
  if (workspace.goal_id !== goalId
    || workspace.control_start_head_commit !== control.start_head_commit
    || workspace.authority.git_common_dir !== control.git_common_dir
    || workspace.authority.start_head_commit !== control.start_head_commit
    || workspace.authority.repo_root !== workspace.authority.worktree
    || workspace.authority.repo_root === control.repo_root
    || workspace.authority.repo_root !== expectedPath
    || !BRANCH_PATTERN.test(branch)
    || (expected !== undefined
      && (branch !== expected.branch
        || workspace.authority.start_head_commit !== expected.base_commit))) {
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
  baseCommit: string,
  ownership: { ownedBranch: boolean; reservedPath: boolean }
): Promise<string[]> {
  const failures: string[] = [];
  let registered: boolean;
  try {
    registered = registeredWorktree(
      await gitText(controlRoot, ["worktree", "list", "--porcelain"]),
      worktreePath
    );
  } catch (error) {
    failures.push(`could not inspect worktree registration: ${errorMessage(error)}`);
    return failures;
  }
  if (ownership.reservedPath && registered) {
    try {
      await git(controlRoot, ["worktree", "remove", "--force", worktreePath]);
    } catch (error) {
      failures.push(`could not remove registered worktree: ${errorMessage(error)}`);
    }
  }
  if (ownership.reservedPath && !registered && await pathExists(worktreePath)) {
    try {
      await rmdir(worktreePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        failures.push(`could not remove reserved worktree path: ${errorMessage(error)}`);
      }
    }
  }
  let stillRegistered: boolean;
  try {
    stillRegistered = registeredWorktree(
      await gitText(controlRoot, ["worktree", "list", "--porcelain"]),
      worktreePath
    );
  } catch (error) {
    failures.push(`could not recheck worktree registration: ${errorMessage(error)}`);
    return failures;
  }
  let branchHead: string;
  try {
    branchHead = await gitText(controlRoot, ["rev-parse", "--verify", `refs/heads/${branch}`]);
  } catch (error) {
    if (ownership.ownedBranch) failures.push(`could not inspect owned branch: ${errorMessage(error)}`);
    return failures;
  }
  if (ownership.ownedBranch) {
    if (stillRegistered) {
      failures.push("owned branch remains registered to the derived worktree; retained");
    } else if (branchHead !== baseCommit) {
      failures.push(`owned branch moved from requested base ${baseCommit}; retained at ${branchHead}`);
    } else {
      try {
        await git(controlRoot, ["branch", "-D", branch]);
      } catch (error) {
        failures.push(`could not remove owned branch: ${errorMessage(error)}`);
      }
    }
  }
  return failures;
}

function registeredWorktree(porcelain: string, worktreePath: string): boolean {
  return porcelain.split(/\r?\n/).some((line) => line === `worktree ${worktreePath}`);
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
