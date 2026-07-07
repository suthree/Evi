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
