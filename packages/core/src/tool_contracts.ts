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
    rationale: "need to run a bounded local command",
    arguments: {
      command: "pnpm",
      args: ["run", "check"],
      cwd: "repo | state",
      timeout_ms: 120000,
      max_output_chars: 12000,
      side_effect_level: "none | local_reversible | local_write | external_write",
      env_allowlist: ["NODE_ENV"],
      env: {
        NODE_ENV: "test"
      }
    }
  },
  {
    tool: "codex.run",
    side_effect_level: "local_write",
    rationale: "need one bounded typed Codex CLI coding execution inside an isolated worktree",
    arguments: {
      mode: "new | resume",
      prompt: "bounded coding task",
      base_commit: "full Git commit SHA (new only)",
      branch: "isolated branch (new only)",
      worktree: "isolated worktree path (new only)",
      cwd: "cwd inside the isolated worktree (new only)",
      model: "gpt-5.6-sol (new only)",
      profile: "fast (new only)",
      reasoning_effort: "xhigh (new only)",
      service_tier: "fast (new only)",
      sandbox: "read-only | workspace-write (new only)",
      approval_policy: "never (new only)",
      budgets: {
        timeout_ms: 300000,
        max_output_chars: 200000,
        max_context_chars: 40000,
        max_tool_calls: 32,
        max_retries: 0
      },
      thread_id: "UUID (resume only)",
      authority_digest: "prior authority SHA-256 (resume only)"
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
  }, null, 2)).join("\n\n");
}
