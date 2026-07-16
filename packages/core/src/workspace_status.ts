import { execFile, type ExecFileException } from "node:child_process";
import type { AgentStore } from "./store.js";

const COMMAND = "git status --porcelain=v1 -b";
const BOUNDARY = "read-only fixed local git status diagnostic; runs `git status --porcelain=v1 -b` with no user-supplied argv; does not read file bodies, stage, commit, reset, checkout, mutate state, invoke the model, or write the active vault";
const DEFAULT_CHANGE_LIMIT = 20;
const TRANSIENT_SPAWN_RESOURCE_ERRORS = new Set(["EAGAIN", "EMFILE", "ENFILE"]);

export interface FixedGitStatusResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
  spawnErrorCode?: string;
}

export type FixedGitStatusAttempt = (
  cwd: string,
  env: NodeJS.ProcessEnv
) => Promise<FixedGitStatusResult>;

export type WorkspaceStatus = "clean" | "dirty" | "not_git_repo" | "error";

export type WorkspaceChangeCategory =
  | "staged"
  | "unstaged"
  | "staged_and_unstaged"
  | "untracked"
  | "conflict"
  | "other";

export interface WorkspaceChangeSummary {
  status_code: string;
  path: string;
  original_path?: string;
  category: WorkspaceChangeCategory;
}

export interface WorkspaceStatusResult {
  created_at: string;
  status: WorkspaceStatus;
  repo_root: string;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  changed_file_count: number;
  staged_count: number;
  unstaged_count: number;
  untracked_count: number;
  conflict_count: number;
  changes: WorkspaceChangeSummary[];
  truncated: boolean;
  command: typeof COMMAND;
  boundary: typeof BOUNDARY;
  error?: string;
  stderr?: string;
}

export async function getWorkspaceStatus(
  store: AgentStore,
  args: { now?: Date | string; limit?: number } = {}
): Promise<WorkspaceStatusResult> {
  const now = args.now instanceof Date ? args.now : new Date(args.now ?? Date.now());
  const limit = clampLimit(args.limit ?? DEFAULT_CHANGE_LIMIT);
  const result = await runFixedGitStatus(store.repoRoot);

  if (result.exitCode !== 0) {
    const status: WorkspaceStatus = isNotGitRepository(result.stderr) ? "not_git_repo" : "error";
    return {
      created_at: now.toISOString(),
      status,
      repo_root: store.repoRoot,
      changed_file_count: 0,
      staged_count: 0,
      unstaged_count: 0,
      untracked_count: 0,
      conflict_count: 0,
      changes: [],
      truncated: false,
      command: COMMAND,
      boundary: BOUNDARY,
      error: result.error || result.stderr || `git status exited with ${result.exitCode}`,
      stderr: result.stderr || undefined
    };
  }

  const parsed = parseGitStatusOutput(result.stdout);
  const changes = parsed.changes.slice(0, limit);
  return {
    created_at: now.toISOString(),
    status: parsed.changes.length === 0 ? "clean" : "dirty",
    repo_root: store.repoRoot,
    branch: parsed.branch,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    changed_file_count: parsed.changes.length,
    staged_count: parsed.changes.filter((change) => isStagedChange(change.status_code)).length,
    unstaged_count: parsed.changes.filter((change) => isUnstagedChange(change.status_code)).length,
    untracked_count: parsed.changes.filter((change) => change.category === "untracked").length,
    conflict_count: parsed.changes.filter((change) => change.category === "conflict").length,
    changes,
    truncated: parsed.changes.length > changes.length,
    command: COMMAND,
    boundary: BOUNDARY
  };
}

export function parseGitStatusOutput(stdout: string): {
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  changes: WorkspaceChangeSummary[];
} {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const branchLine = lines[0]?.startsWith("## ") ? lines.shift() : undefined;
  return {
    ...parseBranchLine(branchLine),
    changes: lines.map(parseStatusLine).filter((item): item is WorkspaceChangeSummary => item !== null)
  };
}

function parseBranchLine(line: string | undefined): {
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
} {
  if (!line) return {};
  const bodyWithDetails = line.slice(3).trim();
  const detailsMatch = bodyWithDetails.match(/\[(.+)\]$/);
  const details = detailsMatch?.[1];
  const body = details ? bodyWithDetails.slice(0, -detailsMatch[0].length).trim() : bodyWithDetails;
  const [branchPart, upstreamPart] = body.split("...", 2);
  const branch = normalizeBranchName(branchPart);
  return {
    branch,
    upstream: upstreamPart?.trim() || undefined,
    ahead: details ? parseCount(details, "ahead") : undefined,
    behind: details ? parseCount(details, "behind") : undefined
  };
}

function normalizeBranchName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("No commits yet on ")) return trimmed.slice("No commits yet on ".length).trim();
  if (trimmed.startsWith("Initial commit on ")) return trimmed.slice("Initial commit on ".length).trim();
  return trimmed;
}

function parseCount(details: string, name: "ahead" | "behind"): number | undefined {
  const match = details.match(new RegExp(`${name} (\\d+)`));
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function parseStatusLine(line: string): WorkspaceChangeSummary | null {
  if (line.length < 3) return null;
  const statusCode = line.slice(0, 2);
  const rawPath = line.slice(3);
  const rename = rawPath.includes(" -> ") ? rawPath.split(" -> ") : null;
  const path = rename ? rename[rename.length - 1] : rawPath;
  const originalPath = rename && rename.length > 1 ? rename.slice(0, -1).join(" -> ") : undefined;
  return {
    status_code: statusCode,
    path,
    original_path: originalPath,
    category: categorizeStatus(statusCode)
  };
}

function categorizeStatus(statusCode: string): WorkspaceChangeCategory {
  if (statusCode === "??") return "untracked";
  if (isConflictStatus(statusCode)) return "conflict";
  const staged = isStagedChange(statusCode);
  const unstaged = isUnstagedChange(statusCode);
  if (staged && unstaged) return "staged_and_unstaged";
  if (staged) return "staged";
  if (unstaged) return "unstaged";
  return "other";
}

function isStagedChange(statusCode: string): boolean {
  return statusCode[0] !== " " && statusCode[0] !== "?" && statusCode[0] !== "!";
}

function isUnstagedChange(statusCode: string): boolean {
  return statusCode[1] !== " " && statusCode[1] !== "?" && statusCode[1] !== "!";
}

function isConflictStatus(statusCode: string): boolean {
  return statusCode.includes("U") || statusCode === "AA" || statusCode === "DD";
}

function isNotGitRepository(stderr: string): boolean {
  return /not a git repository|not a git work tree/i.test(stderr);
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHANGE_LIMIT;
  return Math.min(Math.max(Math.trunc(value), 1), 200);
}

export async function runFixedGitStatus(
  cwd: string,
  attempt: FixedGitStatusAttempt = executeFixedGitStatusAttempt
): Promise<FixedGitStatusResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LANG: "C",
    LC_ALL: "C"
  };
  const first = await attempt(cwd, env);
  return first.spawnErrorCode && TRANSIENT_SPAWN_RESOURCE_ERRORS.has(first.spawnErrorCode)
    ? attempt(cwd, env)
    : first;
}

function executeFixedGitStatusAttempt(cwd: string, env: NodeJS.ProcessEnv): Promise<FixedGitStatusResult> {
  return new Promise((resolve) => {
    execFile("git", ["status", "--porcelain=v1", "-b"], {
      cwd,
      env,
      timeout: 10_000,
      maxBuffer: 2_000_000
    }, (error: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => {
      resolve({
        exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
        stdout: String(stdout),
        stderr: String(stderr),
        error: error?.message,
        spawnErrorCode: typeof error?.code === "string" ? error.code : undefined
      });
    });
  });
}
