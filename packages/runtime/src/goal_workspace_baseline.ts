import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { GoalRepositoryAuthority } from "./repository_authority.js";
import { MAX_CODEX_CANONICAL_CHANGES } from "./tools.js";

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[a-f0-9]{40}$/;
// Inherited paths must fit the same bounded receipt lineage as Goal-observed paths.
export const MAX_GOAL_WORKSPACE_BASELINE_PATHS = MAX_CODEX_CANONICAL_CHANGES * 2;

export const GOAL_WORKSPACE_BASELINE_BOUNDARY =
  "Harness-owned read-only Goal-start Git HEAD and normalized tracked/untracked status paths; provenance only, never task routing or completion authority" as const;

const baselinePathSchema = z.string().min(1).max(4_000).superRefine((value, ctx) => {
  if (!isNormalizedRepositoryPath(value)) {
    ctx.addIssue({ code: "custom", message: "workspace baseline path must be normalized and repository-relative" });
  }
});

export const goalWorkspaceBaselineSchema = z.object({
  schema_version: z.literal(1),
  head_commit: z.string().regex(SHA_PATTERN),
  tracked_paths: z.array(baselinePathSchema).max(MAX_GOAL_WORKSPACE_BASELINE_PATHS),
  untracked_paths: z.array(baselinePathSchema).max(MAX_GOAL_WORKSPACE_BASELINE_PATHS),
  boundary: z.literal(GOAL_WORKSPACE_BASELINE_BOUNDARY)
}).strict().superRefine((value, ctx) => {
  for (const paths of [value.tracked_paths, value.untracked_paths]) {
    if (new Set(paths).size !== paths.length || !isSorted(paths)) {
      ctx.addIssue({ code: "custom", message: "workspace baseline paths must be unique and sorted" });
    }
  }
  if (value.tracked_paths.length + value.untracked_paths.length > MAX_GOAL_WORKSPACE_BASELINE_PATHS) {
    ctx.addIssue({
      code: "custom",
      message: `workspace baseline exceeds ${MAX_GOAL_WORKSPACE_BASELINE_PATHS} total paths`
    });
  }
});

export type GoalWorkspaceBaseline = z.infer<typeof goalWorkspaceBaselineSchema>;

/** Capture the deliberately small Goal-start worktree provenance snapshot. */
export async function captureGoalWorkspaceBaseline(
  authority: GoalRepositoryAuthority
): Promise<GoalWorkspaceBaseline> {
  const [headCommit, porcelain] = await Promise.all([
    gitText(authority.worktree, ["rev-parse", "HEAD"]),
    gitText(authority.worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  ]);
  if (headCommit !== authority.start_head_commit) {
    throw new Error("GoalRuntime workspace baseline HEAD changed during Goal start");
  }
  const { trackedPaths, untrackedPaths } = parsePorcelainPaths(porcelain);
  return goalWorkspaceBaselineSchema.parse({
    schema_version: 1,
    head_commit: headCommit,
    tracked_paths: [...trackedPaths].sort(),
    untracked_paths: [...untrackedPaths].sort(),
    boundary: GOAL_WORKSPACE_BASELINE_BOUNDARY
  });
}

export function inheritedWorkspaceBaselinePaths(baseline: GoalWorkspaceBaseline | null): string[] {
  if (!baseline) return [];
  return [...new Set([...baseline.tracked_paths, ...baseline.untracked_paths])].sort();
}

function parsePorcelainPaths(porcelain: string): { trackedPaths: Set<string>; untrackedPaths: Set<string> } {
  const records = porcelain.split("\0");
  const trackedPaths = new Set<string>();
  const untrackedPaths = new Set<string>();
  for (let index = 0; index < records.length - 1; index += 1) {
    const record = records[index]!;
    if (!record) continue;
    const status = record.slice(0, 2);
    if (record[2] !== " ") throw new Error("GoalRuntime received malformed Git status porcelain");
    const path = normalizeRepositoryPath(record.slice(3));
    if (status === "??") {
      untrackedPaths.add(path);
      continue;
    }
    if (status === "!!") continue;
    trackedPaths.add(path);
    if (status.includes("R") || status.includes("C")) {
      const source = records[++index];
      if (source === undefined || source === "") {
        throw new Error("GoalRuntime received malformed Git rename status porcelain");
      }
      trackedPaths.add(normalizeRepositoryPath(source));
    }
  }
  if (trackedPaths.size + untrackedPaths.size > MAX_GOAL_WORKSPACE_BASELINE_PATHS) {
    throw new Error(`GoalRuntime workspace baseline exceeds ${MAX_GOAL_WORKSPACE_BASELINE_PATHS} total paths`);
  }
  return { trackedPaths, untrackedPaths };
}

function normalizeRepositoryPath(value: string): string {
  if (!isNormalizedRepositoryPath(value)) {
    throw new Error("GoalRuntime workspace baseline contains an unsafe or non-normalized Git path");
  }
  return value;
}

function isNormalizedRepositoryPath(value: string): boolean {
  const parts = value.split("/");
  return !value.startsWith("/")
    && !value.includes("\\")
    && parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function isSorted(values: string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

async function gitText(cwd: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    return result.stdout.trimEnd();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GoalRuntime could not capture workspace baseline: ${message}`);
  }
}
