export type ToolSideEffectLevel = "none" | "local_reversible" | "local_write" | "external_write";
export type GoalToolStorePlacement = "control" | "execution" | "scope_argument" | "cwd_argument";

export interface ToolContract {
  tool: string;
  side_effect_level: ToolSideEffectLevel;
  goal_store_placement: GoalToolStorePlacement;
  rationale: string;
  arguments: Record<string, unknown>;
  constraints?: string[];
}

export const coreToolContracts: ToolContract[] = [
  {
    tool: "file.read",
    side_effect_level: "none",
    goal_store_placement: "scope_argument",
    rationale: "need to read repo or state context",
    arguments: {
      scope: "repo | state",
      path: "relative/path",
      start_line: 1,
      max_lines: 200,
      max_chars: 12000
    },
    constraints: [
      "path must be repository- or state-root relative and must not contain ..",
      "start_line must be an integer from 1 through 1000000",
      "max_lines must be an integer from 1 through 400",
      "max_chars must be an integer from 1 through 50000"
    ]
  },
  {
    tool: "file.write_state",
    side_effect_level: "local_write",
    goal_store_placement: "control",
    rationale: "need to write a generated artifact into state",
    arguments: {
      path: "relative/path",
      text: "content"
    }
  },
  {
    tool: "file.write_repo",
    side_effect_level: "local_write",
    goal_store_placement: "execution",
    rationale: "need to write a bounded repository file with workspace guard evidence",
    arguments: {
      path: "relative/path",
      text: "content"
    }
  },
  {
    tool: "repo.search",
    side_effect_level: "none",
    goal_store_placement: "execution",
    rationale: "need to search repository text",
    arguments: {
      query: "needle",
      path: ".",
      globs: ["*.ts", "*.md"],
      max_results: 20,
      max_output_chars: 12000
    },
    constraints: [
      "query and path stay inside the repository and exclude runtime-state roots",
      "result count and returned text are bounded"
    ]
  },
  {
    tool: "runtime.inspect",
    side_effect_level: "none",
    goal_store_placement: "control",
    rationale: "inspect fresh bounded runtime integration evidence",
    arguments: {},
    constraints: [
      "reads existing repository and local Git provenance, current and prior deployment, controller, service-health, previous-runtime, and channel-liveness owners only",
      "external lists and text are bounded with explicit truncation metadata",
      "returns typed current evidence without writing a ledger, choosing another tool, deploying, restarting, or granting completion authority"
    ]
  },
  {
    tool: "http.fetch",
    side_effect_level: "none",
    goal_store_placement: "control",
    rationale: "need to fetch an HTTP resource",
    arguments: {
      url: "https://example.com",
      response_type: "text|json",
      max_chars: 12000,
      timeout_ms: 30000
    }
  },
  {
    tool: "command.run",
    side_effect_level: "local_reversible",
    goal_store_placement: "cwd_argument",
    rationale: "bounded command",
    arguments: {
      command: "pnpm",
      args: ["run", "check"],
      cwd: "repo|state",
      purpose: "execute|verification",
      timeout_ms: 120000,
      max_output_chars: 12000,
      side_effect_level: "none|local_reversible|local_write|external_write",
      env_allowlist: ["X"],
      env: {
        X: "test"
      }
    },
    constraints: [
      "cwd must resolve to repo or state scope",
      "timeout, output cap, purpose, and semantic side-effect intent are required",
      "verification purpose counts only after process success and unchanged harness snapshots"
    ]
  },
  {
    tool: "workspace.prepare",
    side_effect_level: "local_reversible",
    goal_store_placement: "control",
    rationale: "prepare one Goal-bound isolated execution worktree before specialist production",
    arguments: {
      branch: "codex/issue-N-slug",
      base_commit: "Goal control start HEAD"
    },
    constraints: [
      "available only before the Goal has an execution workspace and only from a clean main control checkout",
      "branch must be a fresh codex/issue-N-slug branch and the worktree path is derived under .worktrees",
      "base_commit must equal the Goal control start HEAD",
      "successful canonical observation binds one immutable execution workspace; no registry or automatic cleanup is created"
    ]
  },
  {
    tool: "codex.run",
    side_effect_level: "local_write",
    goal_store_placement: "execution",
    rationale: "bounded Codex run in isolated worktree",
    arguments: {
      mode: "new|resume",
      prompt: "task",
      base_commit: "bound start HEAD,new",
      branch: "bound branch,new",
      worktree: "GoalRuntime: bound linked worktree only; standalone harness: sibling,new",
      cwd: "in-worktree,new",
      model: "auto|token,new,required",
      profile: "fast,new",
      reasoning_effort: "auto|minimal|low|medium|high|xhigh,new,required",
      service_tier: "fast,new",
      sandbox: "read-only|workspace-write,new",
      approval_policy: "never,new",
      selection_rationale: "bounded,new,required",
      task_shape: "bounded,new,required",
      delegation_strategy: {
        mode: "single|parallel,new",
        max_subagents: "single:0;parallel:2..3",
        independent_workstreams: "single:[];parallel:2..max unique",
        integration_owner: "main_codex_thread"
      },
      budgets: {
        timeout_ms: 300000,
        max_output_chars: "capture-only,optional/derived",
        max_context_chars: 40000,
        max_tool_calls: 32,
        max_retries: 0
      },
      thread_id: "UUID,resume",
      authority_digest: "SHA-256,resume"
    },
    constraints: [
      "inside GoalRuntime, cognition supplies only a bounded specialist task and task shape; the Goal adapter derives this raw invocation envelope",
      "GoalRuntime new requests use model=auto and reasoning_effort=auto",
      "execution requires the Goal-bound isolated linked worktree, branch, Git common directory, and start HEAD",
      "delegated output is untrusted until GoalRuntime records canonical observations and independent verification"
    ]
  },
  {
    tool: "code.execute_node",
    side_effect_level: "local_reversible",
    goal_store_placement: "control",
    rationale: "need bounded JavaScript execution",
    arguments: {
      code: "console.log('ok')",
      timeout_ms: 10000,
      max_output_chars: 12000,
      env_policy: "minimal runtime env; no parent env passthrough"
    }
  }
];

export function resolveGoalToolStorePlacement(
  tool: string,
  args: Record<string, unknown>,
  contracts: ToolContract[] = coreToolContracts
): "control" | "execution" {
  const placement = contracts.find((contract) => contract.tool === tool)?.goal_store_placement;
  if (!placement) throw new Error(`Unknown Goal tool placement: ${tool}`);
  if (placement === "scope_argument") return args.scope === "state" ? "control" : "execution";
  if (placement === "cwd_argument") return args.cwd === "state" ? "control" : "execution";
  return placement;
}

export function renderCoreToolExamples(contracts = coreToolContracts): string {
  return contracts.map((contract) => JSON.stringify({
    type: "use_tool",
    rationale: contract.rationale,
    payload: {
      tool: contract.tool,
      arguments: contract.arguments
    }
  }, null, contract.tool === "codex.run" ? 0 : 2)).join("\n\n");
}
