import type { GoalExecutionWorkspace } from "./goal_execution_workspace.js";
import { inspectGoalRepositoryAuthority } from "./repository_authority.js";
import type { ToolResult } from "./tools.js";

export const GOAL_WORKSPACE_FRESHNESS_BOUNDARY =
  "derived live-vs-canonical Goal workspace freshness; routing context only, never canonical change evidence or completion authority" as const;

export interface GoalWorkspaceFreshnessView {
  status: "unbound" | "aligned" | "changed_unobserved" | "unavailable";
  observed_head_commit: string | null;
  live_head_commit: string | null;
  reason: "workspace_authority_mismatch" | "live_workspace_unavailable" | null;
  boundary: typeof GOAL_WORKSPACE_FRESHNESS_BOUNDARY;
}

export interface GoalWorkspaceFreshnessInput {
  execution_workspace: GoalExecutionWorkspace | null;
  observed_head_commit: string | null;
}

export interface GoalWorkspaceObservation {
  status: "observed";
  head_commit: string;
  branch: string;
  worktree: string;
  authority: "harness-owned post-tool workspace observation";
}

export async function inspectGoalWorkspaceFreshness(
  input: GoalWorkspaceFreshnessInput
): Promise<GoalWorkspaceFreshnessView> {
  if (!input.execution_workspace) return view("unbound", null, null, null);
  const expected = input.execution_workspace.authority;
  const observedHead = commit(input.observed_head_commit) ?? expected.start_head_commit;
  let live;
  try {
    live = await inspectGoalRepositoryAuthority(expected.repo_root);
  } catch {
    return view("unavailable", observedHead, null, "live_workspace_unavailable");
  }
  if (live.repo_root !== expected.repo_root
    || live.git_common_dir !== expected.git_common_dir
    || live.worktree !== expected.worktree
    || live.branch !== expected.branch) {
    return view("unavailable", observedHead, null, "workspace_authority_mismatch");
  }
  return view(
    live.start_head_commit === observedHead ? "aligned" : "changed_unobserved",
    observedHead,
    live.start_head_commit,
    null
  );
}

export function latestObservedWorkspaceHead(
  initialHead: string,
  results: ToolResult[]
): string {
  let head = commit(initialHead) ?? initialHead;
  for (const result of results) {
    if (result.ok) {
      const changes = Array.isArray(result.output.changes) ? result.output.changes : [];
      for (const change of changes) {
        if (!record(change) || change.kind !== "git_commit") continue;
        head = commit(change.identity) ?? head;
      }
      const singular = record(result.output.change) ? result.output.change : null;
      if (singular?.kind === "git_commit") head = commit(singular.identity) ?? head;
    }
    const verification = record(result.output.verification) ? result.output.verification : null;
    const after = verification && record(verification.after) ? verification.after : null;
    head = commit(after?.head_commit) ?? head;
    const observation = parseGoalWorkspaceObservation(result.output.workspace_observation);
    if (observation) head = observation.head_commit;
  }
  return head;
}

export function parseGoalWorkspaceObservation(value: unknown): GoalWorkspaceObservation | null {
  if (!record(value)
    || value.status !== "observed"
    || value.authority !== "harness-owned post-tool workspace observation") return null;
  const headCommit = commit(value.head_commit);
  if (!headCommit
    || typeof value.branch !== "string"
    || !value.branch.trim()
    || value.branch.length > 200
    || typeof value.worktree !== "string"
    || !value.worktree.startsWith("/")
    || value.worktree.length > 2_000) return null;
  return {
    status: "observed",
    head_commit: headCommit,
    branch: value.branch,
    worktree: value.worktree,
    authority: "harness-owned post-tool workspace observation"
  };
}

function view(
  status: GoalWorkspaceFreshnessView["status"],
  observedHead: string | null,
  liveHead: string | null,
  reason: GoalWorkspaceFreshnessView["reason"]
): GoalWorkspaceFreshnessView {
  return {
    status,
    observed_head_commit: observedHead,
    live_head_commit: liveHead,
    reason,
    boundary: GOAL_WORKSPACE_FRESHNESS_BOUNDARY
  };
}

function commit(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value) ? value : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
