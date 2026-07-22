import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildCodexRunArgv,
  CODEX_STRUCTURED_RESULT_SCHEMA_TEXT,
  createCodexAuthoritySnapshot,
  parseCodexStructuredResult
} from "../../core/src/codex_run_contract.js";
import type {
  ExecutionAdapterResult,
  ExecutionTaskEnvelope,
  ExecutionWorkerExecutor
} from "../../kernel/src/index.js";
import { runCodexProcess } from "./tools.js";

export class VNextCodexExecutionExecutor implements ExecutionWorkerExecutor {
  constructor(private readonly runProcess: typeof runCodexProcess = runCodexProcess) {}

  async execute(task: ExecutionTaskEnvelope, signal: AbortSignal): Promise<ExecutionAdapterResult> {
    const startedAt = Date.now();
    const prompt = executionPrompt(task);
    const writableRoots = await canonicalWritableRoots(task);
    const maxOutputChars = Math.min(
      1_000_000,
      Math.max(1_000, task.budget.max_output_tokens * 4)
    );
    const authority = createCodexAuthoritySnapshot({
      repo_root: task.lineage.repository_root,
      git_common_dir: task.lineage.git_common_dir,
      base_commit: task.lineage.base_commit,
      head_commit: task.lineage.base_commit,
      branch: task.lineage.branch,
      isolated_worktree: task.lineage.worktree,
      cwd: writableRoots[0]!,
      model: "auto",
      profile: "fast",
      reasoning_effort: "auto",
      service_tier: "fast",
      sandbox: "workspace-write",
      approval_policy: "never",
      mode: "new",
      thread_id: null,
      selection_rationale: "The vNext Supervisor selected the local Codex CLI as a bounded execution adapter.",
      task_shape: "One source-mutating implementation task inside one pre-bound single-writer Delivery Lineage.",
      delegation_strategy: {
        mode: "single",
        max_subagents: 0,
        independent_workstreams: [],
        integration_owner: "main_codex_thread"
      },
      original_prompt: prompt,
      effective_prompt: prompt,
      budgets: {
        timeout_ms: task.budget.timeout_ms,
        max_output_chars: maxOutputChars,
        max_context_chars: Math.max(1_000, Math.min(100_000, prompt.length + 1_000)),
        max_tool_calls: task.budget.max_tool_calls,
        max_retries: 0
      }
    });
    const temporary = await mkdtemp(join(tmpdir(), "local-runtime-vnext-execution-schema-"));
    const schemaPath = join(temporary, "codex-result.schema.json");
    try {
      await writeFile(schemaPath, CODEX_STRUCTURED_RESULT_SCHEMA_TEXT, { encoding: "utf8", mode: 0o600 });
      const processResult = await this.runProcess(
        boundedExecutionArgv(buildCodexRunArgv(authority, schemaPath), writableRoots.slice(1)),
        prompt,
        authority,
        signal
      );
      const consumed = {
        output_chars: processResult.stdoutCharsObserved + processResult.stderrCharsObserved,
        duration_ms: Date.now() - startedAt
      };
      const execution = {
        adapter: "local_agent_cli" as const,
        thread_id: processResult.threadId,
        requested_model: "auto",
        observed_model: null,
        event_count: processResult.eventCount,
        tool_calls_observed: processResult.toolCallsObserved
      };
      if (processResult.timedOut || processResult.toolBudgetExceeded || processResult.delegationBudgetExceeded) {
        return {
          status: "blocked",
          summary: "Codex stopped at the bounded execution budget before a valid terminal result.",
          changed_files: [],
          tests: [],
          blockers: [processResult.timedOut
            ? "execution timeout or deadline exceeded"
            : processResult.delegationBudgetExceeded
              ? "delegation was attempted even though this Worker permits no subagents"
              : "tool-call budget exceeded"],
          next_action: "The Supervisor must inspect the canonical Delivery Lineage before deciding any recovery.",
          completion_authority: "supervisor",
          execution,
          consumed
        };
      }
      if (processResult.spawnError
        || processResult.invalidJsonl
        || processResult.threadIdMismatch
        || processResult.exitCode !== 0
        || !processResult.threadId
        || !processResult.lastAgentMessage) {
        return {
          status: "failed",
          summary: "Codex did not produce one valid bounded structured result.",
          changed_files: [],
          tests: [],
          blockers: [processFailure(processResult)],
          next_action: "Inspect the canonical Delivery Lineage; do not replay this Worker automatically.",
          completion_authority: "supervisor",
          execution,
          consumed
        };
      }
      try {
        const structured = parseCodexStructuredResult(processResult.lastAgentMessage);
        return {
          status: structured.status,
          summary: structured.summary,
          changed_files: [...structured.changed_files],
          tests: [...structured.tests],
          blockers: [...structured.blockers],
          next_action: structured.next_action,
          completion_authority: "supervisor",
          execution,
          consumed
        };
      } catch (error) {
        return {
          status: "failed",
          summary: "Codex terminal output violated the structured-result contract.",
          changed_files: [],
          tests: [],
          blockers: [error instanceof Error ? error.message : String(error)],
          next_action: "Inspect the exact Worker evidence and correct the adapter contract before a new dispatch.",
          completion_authority: "supervisor",
          execution,
          consumed
        };
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

function executionPrompt(task: ExecutionTaskEnvelope): string {
  return [
    "You are the bounded execution Worker for a local-runtime vNext Supervisor Run.",
    "Only edit files inside the exact writable paths listed below.",
    "Do not create or switch branches or worktrees. Do not commit, push, open or merge a pull request, deploy, publish, communicate externally, modify runtime state, activate learning artifacts, or claim parent completion.",
    "Do not use subagents. Do not use web search. Treat context and artifact refs as identifiers, not hidden content.",
    "Return only the required Codex structured result. completion_authority must be main_harness; the runtime Supervisor independently inspects Git and verification evidence.",
    `Delivery Lineage id: ${task.lineage.id}`,
    `Delivery Lineage digest: ${task.lineage.digest}`,
    `Worktree: ${task.lineage.worktree}`,
    `Branch: ${task.lineage.branch}`,
    `Baseline commit: ${task.lineage.base_commit}`,
    `Writable paths: ${task.lineage.writable_paths.join(", ")}`,
    `Rollback instruction: ${task.rollback_instruction}`,
    `Objective: ${task.objective}`,
    `Expected result: ${task.expected_result}`,
    `Context refs: ${task.context_refs.join(", ") || "none"}`,
    `Artifact refs: ${task.artifact_refs.join(", ") || "none"}`,
    `Constraints: ${task.constraints.join(" | ") || "none"}`,
    `Verification requirements: ${task.verification_commands.map((command) =>
      `${command.command} ${command.args.join(" ")} (cwd=${command.cwd})`
    ).join(" | ")}`
  ].join("\n");
}

async function canonicalWritableRoots(task: ExecutionTaskEnvelope): Promise<string[]> {
  const roots: string[] = [];
  for (const path of task.lineage.writable_paths) {
    const expected = resolve(task.lineage.worktree, path);
    const canonical = await realpath(expected);
    if (canonical !== expected || !(await stat(canonical)).isDirectory()) {
      throw new Error(`Execution writable path must remain one exact real directory: ${path}`);
    }
    roots.push(canonical);
  }
  return roots;
}

function boundedExecutionArgv(base: readonly string[], additionalRoots: string[]): readonly string[] {
  const promptIndex = base.lastIndexOf("-");
  if (promptIndex < 0) throw new Error("Local agent execution argv has no stdin prompt marker.");
  const writableArgs = additionalRoots.flatMap((root) => ["--add-dir", root]);
  return [
    ...base.slice(0, promptIndex),
    "--ephemeral",
    ...writableArgs,
    ...base.slice(promptIndex)
  ];
}

function processFailure(result: Awaited<ReturnType<typeof runCodexProcess>>): string {
  if (result.spawnError) return "Codex CLI could not start.";
  if (result.invalidJsonl) return "Codex emitted invalid JSONL.";
  if (result.threadIdMismatch) return "Codex emitted mismatched thread identities.";
  if (result.exitCode !== 0) return `Codex exited with code ${result.exitCode ?? "unknown"}.`;
  if (!result.threadId) return "Codex returned no thread identity.";
  return "Codex returned no terminal structured agent message.";
}
