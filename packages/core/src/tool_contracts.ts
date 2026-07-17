export type ToolSideEffectLevel = "none" | "local_reversible" | "local_write" | "external_write";

export interface ToolContract {
  tool: string;
  side_effect_level: ToolSideEffectLevel;
  rationale: string;
  arguments: Record<string, unknown>;
}

export const coreToolContracts: ToolContract[] = [
  {
    tool: "file.read",
    side_effect_level: "none",
    rationale: "need to read repo or state context",
    arguments: {
      scope: "repo | state",
      path: "relative/path",
      start_line: 1,
      max_lines: 200,
      max_chars: 12000
    }
  },
  {
    tool: "file.write_state",
    side_effect_level: "local_write",
    rationale: "need to write a generated artifact into state",
    arguments: {
      path: "relative/path",
      text: "content"
    }
  },
  {
    tool: "file.write_repo",
    side_effect_level: "local_write",
    rationale: "need to write a bounded repository file with workspace guard evidence",
    arguments: {
      path: "relative/path",
      text: "content"
    }
  },
  {
    tool: "repo.search",
    side_effect_level: "none",
    rationale: "need to search repository text",
    arguments: {
      query: "needle",
      path: ".",
      globs: ["*.ts", "*.md"],
      max_results: 20,
      max_output_chars: 12000
    }
  },
  {
    tool: "http.fetch",
    side_effect_level: "none",
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
    }
  },
  {
    tool: "codex.run",
    side_effect_level: "local_write",
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
    }
  },
  {
    tool: "code.execute_node",
    side_effect_level: "local_reversible",
    rationale: "need bounded JavaScript execution",
    arguments: {
      code: "console.log('ok')",
      timeout_ms: 10000,
      max_output_chars: 12000,
      env_policy: "minimal runtime env; no parent env passthrough"
    }
  }
];

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
