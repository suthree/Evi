import { execFile, spawn } from "node:child_process";
import { readdir, realpath } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import {
  blockedCodexStructuredResult,
  buildCodexRunArgv,
  CODEX_RUN_TOOL,
  CODEX_STRUCTURED_RESULT_SCHEMA_TEXT,
  codexAuthorityDigest,
  createCodexAuthoritySnapshot,
  deriveCodexOutputCaptureChars,
  failedCodexStructuredResult,
  parseCodexAuthoritySnapshot,
  parseCodexRunRequest,
  parseCodexStructuredResult,
  sha256,
  type CodexAuthoritySnapshot,
  type CodexDelegationStrategy,
  type CodexRunRequest,
  type CodexStructuredResult
} from "../../core/src/codex_run_contract.js";
import { newId, utcNow } from "../../core/src/ids.js";
import type { ActionProposal } from "../../core/src/schemas.js";
import type { AgentStore } from "../../core/src/store.js";
import {
  getWorkspaceStatus,
  type WorkspaceStatusResult
} from "../../core/src/workspace_status.js";

export interface ToolResult {
  id: string;
  tool: string;
  ok: boolean;
  summary: string;
  output: Record<string, unknown>;
  side_effect_level: "none" | "local_reversible" | "local_write" | "external_write";
  created_at: string;
}

type ToolFailureKind =
  | "fetch_error"
  | "codex_authority_mismatch"
  | "codex_blocked"
  | "codex_failed"
  | "codex_invalid_jsonl"
  | "codex_invalid_request"
  | "codex_invalid_structured_result"
  | "codex_isolation_failed"
  | "codex_tool_budget_exceeded"
  | "http_status"
  | "invalid_request"
  | "nonzero_exit"
  | "protected_path"
  | "runtime_state_path"
  | "search_error"
  | "spawn_error"
  | "timeout"
  | "unsupported_tool";

export interface ToolExecutionContext {
  store: AgentStore;
  modelMaxOutputTokens?: number;
}

export async function executeTool(action: ActionProposal, context: ToolExecutionContext): Promise<ToolResult> {
  const payload = action.payload as Record<string, unknown>;
  const tool = stringValue(payload.tool);
  const args = recordValue(payload.arguments);

  if (tool === "file.read") {
    return runFileRead(args, context);
  }
  if (tool === "file.write_state") {
    return runFileWriteState(args, context);
  }
  if (tool === "file.write_repo") {
    return runFileWriteRepo(args, context);
  }
  if (tool === "repo.search") {
    return runRepoSearch(args, context);
  }
  if (tool === "http.fetch") {
    return runHttpFetch(args);
  }
  if (tool === "command.run") {
    return runCommandRun(args, context);
  }
  if (tool === CODEX_RUN_TOOL) {
    return runCodexRun(args, context);
  }
  if (tool === "code.execute_node") {
    return runCodeExecuteNode(args, context);
  }

  return toolResult(tool || "unknown", false, `Unsupported tool: ${tool || "(missing)"}`, {
    received_payload: payload
  }, "none", "unsupported_tool");
}

async function runFileRead(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const scope = stringValue(args.scope) || "repo";
  const relPath = stringValue(args.path);
  const maxChars = intValue(args.max_chars, 12000);
  const invalid = validateRelativePath(relPath)
    ?? (scope === "repo" ? validateRepoRuntimePath("file.read", relPath) : null);
  if (invalid) {
    return toolResult("file.read", false, invalid, { path: relPath }, "none", pathFailureKind(invalid));
  }
  if (scope !== "repo" && scope !== "state") {
    return toolResult("file.read", false, `Unsupported file.read scope: ${scope}`, { scope }, "none", "invalid_request");
  }

  const text = scope === "state"
    ? await context.store.readStateText(relPath, maxChars)
    : await context.store.readRepoText(relPath, maxChars);
  return toolResult("file.read", true, `Read ${scope}:${relPath} (${text.length} chars returned).`, {
    scope,
    path: relPath,
    max_chars: maxChars,
    text
  }, "none");
}

async function runFileWriteState(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const relPath = stringValue(args.path);
  const invalid = validateRelativePath(relPath);
  if (invalid) {
    return toolResult("file.write_state", false, invalid, { path: relPath }, "local_write", "invalid_request");
  }
  const text = typeof args.text === "string" ? args.text : JSON.stringify(args.json ?? {}, null, 2);
  await context.store.writeText(relPath, text);
  return toolResult("file.write_state", true, `Wrote state:${relPath} (${text.length} bytes).`, {
    path: relPath,
    bytes: text.length
  }, "local_write");
}

async function runFileWriteRepo(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const relPath = stringValue(args.path);
  const invalid = validateRelativePath(relPath) ?? validateRepoWritePath(relPath);
  if (invalid) {
    return toolResult("file.write_repo", false, invalid, { path: relPath }, "local_write", pathFailureKind(invalid));
  }

  const text = typeof args.text === "string" ? args.text : JSON.stringify(args.json ?? {}, null, 2);
  const workspaceBefore = await getWorkspaceStatus(context.store, { limit: 12 });
  await context.store.writeRepoText(relPath, text);
  const workspaceAfter = await getWorkspaceStatus(context.store, { limit: 12 });
  const guard = {
    boundary: "pre/post fixed git status evidence only; does not read file bodies, stage, commit, reset, checkout, clean, block writes, invoke the model, or write separate guard state artifacts",
    preexisting_dirty: workspaceBefore.status === "dirty",
    target_changed_after_write: workspaceAfter.changes.some((change) => change.path === relPath || change.original_path === relPath),
    changed_file_count_delta: workspaceAfter.changed_file_count - workspaceBefore.changed_file_count
  };
  return toolResult("file.write_repo", true, renderRepoWriteSummary(relPath, text.length, workspaceBefore, workspaceAfter, guard), {
    path: relPath,
    bytes: text.length,
    workspace_guard: guard,
    workspace_before: workspaceStatusEvidence(workspaceBefore),
    workspace_after: workspaceStatusEvidence(workspaceAfter)
  }, "local_write");
}

async function runRepoSearch(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const query = stringValue(args.query);
  const searchPath = stringValue(args.path) || ".";
  const maxResults = Math.min(Math.max(intValue(args.max_results, 20), 1), 200);
  const maxOutputChars = Math.min(Math.max(intValue(args.max_output_chars, 12000), 1000), 50000);
  const globs = stringArrayValue(args.globs).slice(0, 20);

  if (!query.trim()) {
    return toolResult("repo.search", false, "repo.search requires a non-empty query.", {}, "none", "invalid_request");
  }
  const invalid = validateRelativePath(searchPath);
  if (invalid) {
    return toolResult("repo.search", false, invalid, { path: searchPath }, "none", "invalid_request");
  }
  const invalidRuntimePath = validateRepoRuntimePath("repo.search", searchPath);
  if (invalidRuntimePath) {
    return toolResult("repo.search", false, invalidRuntimePath, { path: searchPath }, "none", "runtime_state_path");
  }

  const rgResult = await runRipgrep({
    repoRoot: context.store.repoRoot,
    query,
    path: searchPath,
    globs,
    maxOutputChars
  });

  if (rgResult.available) {
    const lines = rgResult.stdout.split(/\r?\n/).filter(Boolean).slice(0, maxResults);
    const matches = lines.map(parseRipgrepLine);
    const ok = rgResult.exitCode === 0 || rgResult.exitCode === 1;
    return toolResult("repo.search", ok, ok
      ? `repo.search found ${matches.length} result(s) for "${query}".`
      : `repo.search failed with exit code ${rgResult.exitCode ?? "unknown"}.`, {
      query,
      path: searchPath,
      engine: "rg",
      exitCode: rgResult.exitCode,
      max_results: maxResults,
      max_output_chars: maxOutputChars,
      matches,
      truncated: rgResult.truncated || rgResult.stdout.split(/\r?\n/).filter(Boolean).length > maxResults,
      stderr: rgResult.stderr
    }, "none", ok ? undefined : "search_error");
  }

  const fallback = await fallbackSearch(context.store, {
    query,
    path: searchPath,
    maxResults,
    maxOutputChars
  });
  return toolResult("repo.search", true, `repo.search found ${fallback.matches.length} result(s) for "${query}" with fallback search.`, {
    query,
    path: searchPath,
    engine: "node",
    max_results: maxResults,
    max_output_chars: maxOutputChars,
    matches: fallback.matches,
    truncated: fallback.truncated
  }, "none");
}

async function runHttpFetch(args: Record<string, unknown>): Promise<ToolResult> {
  const url = stringValue(args.url);
  const responseType = stringValue(args.response_type) || "text";
  const maxChars = intValue(args.max_chars, 12000);
  const timeoutMs = Math.min(Math.max(intValue(args.timeout_ms, 30000), 1000), 300000);
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return toolResult("http.fetch", false, "http.fetch requires an http(s) URL.", { url }, "none", "invalid_request");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LocalAgent/0.1"
      },
      signal: controller.signal
    });
    const text = await response.text();
    const bodyTruncated = text.length > maxChars;
    const body = bodyTruncated ? truncateOutput(text, maxChars) : text;
    return toolResult("http.fetch", response.ok, `Fetched ${url}: ${response.status} ${response.statusText}.`, {
      url,
      status: response.status,
      status_text: response.statusText,
      response_type: responseType,
      max_chars: maxChars,
      timeout_ms: timeoutMs,
      timed_out: false,
      response_chars: text.length,
      returned_body_chars: body.length,
      body_truncated: bodyTruncated,
      content_type: response.headers.get("content-type") ?? null,
      body: responseType === "json" ? parseMaybeJson(body) : body
    }, "none", response.ok ? undefined : "http_status");
  } catch (error) {
    const timedOut = controller.signal.aborted;
    return toolResult("http.fetch", false, timedOut ? `http.fetch timed out after ${timeoutMs}ms.` : `http.fetch failed: ${errorMessage(error)}`, {
      url,
      response_type: responseType,
      max_chars: maxChars,
      timeout_ms: timeoutMs,
      timed_out: timedOut,
      error: errorMessage(error)
    }, "none", timedOut ? "timeout" : "fetch_error");
  } finally {
    clearTimeout(timer);
  }
}

async function runCommandRun(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const command = stringValue(args.command);
  const requestedArgs = stringArrayValue(args.args);
  const commandArgs = requestedArgs.slice(0, 64);
  const cwdScope = stringValue(args.cwd) || "repo";
  const requestedTimeoutMs = intValue(args.timeout_ms, 30000);
  const requestedMaxOutputChars = intValue(args.max_output_chars, 12000);
  const timeoutMs = Math.min(Math.max(requestedTimeoutMs, 1000), 300000);
  const maxOutputChars = Math.min(Math.max(requestedMaxOutputChars, 1000), 50000);
  const sideEffectLevel = parseSideEffectLevel(args.side_effect_level);
  const envResult = buildCommandEnv(args);

  if (!command.trim()) {
    return toolResult("command.run", false, "command.run requires a command.", {}, "none", "invalid_request");
  }
  if (command.includes("/") || command.includes("\\") || command.includes("\0")) {
    return toolResult("command.run", false, "command.run command must be a binary name, not a path or shell string.", { command }, "none", "invalid_request");
  }
  if (cwdScope !== "repo" && cwdScope !== "state") {
    return toolResult("command.run", false, `Unsupported command.run cwd: ${cwdScope}`, { cwd: cwdScope }, "none", "invalid_request");
  }
  if (!sideEffectLevel) {
    return toolResult("command.run", false, "command.run requires a valid side_effect_level.", { side_effect_level: args.side_effect_level }, "none", "invalid_request");
  }
  if (!envResult.ok) {
    return toolResult("command.run", false, envResult.summary, envResult.output, sideEffectLevel, "invalid_request");
  }

  const result = await runLocalCommand(command, commandArgs, {
    cwd: cwdScope === "repo" ? context.store.repoRoot : context.store.stateRoot,
    timeoutMs,
    maxOutputChars,
    env: envResult.env
  });
  const envAudit = envResult.audit;
  const ok = result.exitCode === 0 && !result.timedOut;
  return toolResult("command.run", ok, result.summary, {
    command,
    args: commandArgs,
    cwd: cwdScope,
    timeout_ms: timeoutMs,
    max_output_chars: maxOutputChars,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    timed_out: result.timedOut,
    stdout_truncated: result.stdoutTruncated,
    stderr_truncated: result.stderrTruncated,
    stdout_chars_observed: result.stdoutObservedChars,
    stderr_chars_observed: result.stderrObservedChars,
    stdout_chars_returned: result.stdout.length,
    stderr_chars_returned: result.stderr.length,
    audit: {
      requested: {
        args_count: requestedArgs.length,
        timeout_ms: requestedTimeoutMs,
        max_output_chars: requestedMaxOutputChars,
        cwd: cwdScope,
        side_effect_level: args.side_effect_level
      },
      effective: {
        args_count: commandArgs.length,
        timeout_ms: timeoutMs,
        max_output_chars: maxOutputChars,
        cwd: cwdScope,
        side_effect_level: sideEffectLevel
      },
      truncation: {
        stdout_truncated: result.stdoutTruncated,
        stderr_truncated: result.stderrTruncated,
        stdout_chars_observed: result.stdoutObservedChars,
        stderr_chars_observed: result.stderrObservedChars,
        stdout_chars_returned: result.stdout.length,
        stderr_chars_returned: result.stderr.length
      },
      cwd_boundary: cwdScope === "repo" ? "repo_root" : "state_root",
      env_boundary: envAudit
    },
    stdout: result.stdout,
    stderr: result.stderr
  }, sideEffectLevel, ok ? undefined : processFailureKind(result));
}

interface CodexGitAuthority {
  repoRoot: string;
  gitCommonDir: string;
  headCommit: string;
  branch: string;
  worktree: string;
  cwd: string;
}

interface CodexThreadAuthorityRecord {
  schema_version: 2;
  thread_id: string;
  authority_digest: string;
  authority: CodexAuthoritySnapshot;
  authority_verifiability: CodexAuthorityVerifiability;
  updated_at: string;
}

interface CodexAuthorityVerifiability {
  status: "verified";
  snapshot_schema_version: 2;
  authority_digest_recomputed: true;
  original_prompt_digest_verified: true;
  effective_prompt_digest_verified: true;
  git_authority_verified_before_execution: true;
  resume_authority_inherited: boolean;
  boundary: string;
}

interface CodexSubagentToolEvidence {
  event_index: number;
  event_type: "item.started" | "item.completed";
  item_id: string;
  item_type: string;
  tool_name: string;
  receiver_thread_ids: string[];
}

interface CodexProcessResult {
  exitCode: number | null;
  timedOut: boolean;
  toolBudgetExceeded: boolean;
  invalidJsonl: boolean;
  spawnError: boolean;
  threadIdMismatch: boolean;
  threadId: string | null;
  lastAgentMessage: string | null;
  stdoutCharsObserved: number;
  stderrCharsObserved: number;
  outputCapture: CodexOutputCapture;
  eventCount: number;
  eventTypes: Record<string, number>;
  itemTypes: Record<string, number>;
  toolCallsObserved: number;
  delegationBudgetExceeded: boolean;
  subagentToolEvidence: CodexSubagentToolEvidence[];
}

interface CodexOutputCapture {
  effectiveLimitChars: number;
  retainedChars: number;
  truncated: boolean;
  prefix: string;
  suffix: string;
}

interface CodexWorkspaceChanges {
  available: boolean;
  changedPaths: string[];
}

async function runCodexRun(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  let request: CodexRunRequest;
  const explicitOutputCaptureLimit = isPlainRecord(args.budgets)
    && args.budgets.max_output_chars !== undefined;
  try {
    request = parseCodexRunRequest(args, {
      max_output_chars: deriveCodexOutputCaptureChars(context.modelMaxOutputTokens)
    });
  } catch (error) {
    return codexFailure("codex_invalid_request", errorMessage(error), failedCodexStructuredResult(
      "Codex request was rejected before execution.",
      errorMessage(error),
      "Correct the typed codex.run request and retry through the main harness."
    ));
  }

  let prior: CodexThreadAuthorityRecord | null = null;
  let authority: CodexGitAuthority;
  try {
    if (request.mode === "resume") {
      prior = parseVerifiableCodexThreadRecord(
        await context.store.readStateJson<unknown>(codexThreadRecordPath(request.thread_id))
      );
      if (!prior
        || prior.thread_id !== request.thread_id
        || prior.authority_digest !== request.authority_digest) {
        throw new CodexAuthorityError("Resume handle does not match the latest persisted Codex authority snapshot.");
      }
      authority = await inspectCodexGitAuthority(context.store.repoRoot, prior.authority.isolated_worktree, prior.authority.cwd);
      assertPersistedAuthority(prior.authority, authority);
    } else {
      authority = await inspectCodexGitAuthority(context.store.repoRoot, request.worktree, request.cwd);
      if (authority.branch !== request.branch) throw new Error(`Expected branch ${request.branch}, found ${authority.branch}.`);
      await assertCodexBase(authority.repoRoot, request.base_commit, authority.headCommit);
    }
  } catch (error) {
    const failureKind = error instanceof CodexAuthorityError ? "codex_authority_mismatch" : "codex_isolation_failed";
    return codexFailure(failureKind, errorMessage(error), failedCodexStructuredResult(
      "Codex authority or isolated worktree validation failed.",
      errorMessage(error),
      "Restore the recorded repo/base/branch/worktree/cwd authority before retrying."
    ));
  }

  let workspaceBefore: CodexWorkspaceChanges;
  try {
    workspaceBefore = await inspectCodexWorkspaceChanges(authority.repoRoot);
  } catch (error) {
    return codexFailure("codex_isolation_failed", errorMessage(error), failedCodexStructuredResult(
      "Codex pre-run workspace inspection failed.",
      errorMessage(error),
      "Restore fixed Git status inspection before retrying."
    ));
  }

  const inherited = prior?.authority;
  const budgets = request.mode === "new" ? request.budgets : inherited!.budgets;
  const selectionRationale = request.mode === "new" ? request.selection_rationale : inherited!.selection_rationale;
  const taskShape = request.mode === "new" ? request.task_shape : inherited!.task_shape;
  const delegationStrategy = request.mode === "new" ? request.delegation_strategy : inherited!.delegation_strategy;
  const outputCaptureLimitSource = request.mode === "resume"
    ? "persisted_authority_snapshot"
    : explicitOutputCaptureLimit
      ? "request"
      : context.modelMaxOutputTokens === undefined
        ? "runtime_context_budget_default"
        : "runtime_model_config.max_output_tokens";
  const effectivePrompt = codexExecutionPrompt(request.prompt, authority, budgets, delegationStrategy);
  if (effectivePrompt.length > budgets.max_context_chars) {
    return codexFailure("codex_invalid_request", "Bounded Codex prompt exceeds max_context_chars after harness instructions.", failedCodexStructuredResult(
      "Codex request exceeded its context budget before execution.",
      "The prompt plus fixed main-harness authority instructions exceeds max_context_chars.",
      "Shorten the prompt or issue a new bounded request with an adequate context budget."
    ));
  }

  const provisional = createCodexAuthoritySnapshot({
    repo_root: authority.repoRoot,
    git_common_dir: authority.gitCommonDir,
    base_commit: request.mode === "new" ? request.base_commit : inherited!.base_commit,
    head_commit: authority.headCommit,
    branch: authority.branch,
    isolated_worktree: authority.worktree,
    cwd: authority.cwd,
    model: request.mode === "new" ? request.model : inherited!.model,
    profile: request.mode === "new" ? request.profile : inherited!.profile,
    reasoning_effort: request.mode === "new" ? request.reasoning_effort : inherited!.reasoning_effort,
    service_tier: request.mode === "new" ? request.service_tier : inherited!.service_tier,
    sandbox: request.mode === "new" ? request.sandbox : inherited!.sandbox,
    approval_policy: request.mode === "new" ? request.approval_policy : inherited!.approval_policy,
    selection_rationale: selectionRationale,
    task_shape: taskShape,
    delegation_strategy: delegationStrategy,
    mode: request.mode,
    thread_id: request.mode === "resume" ? request.thread_id : null,
    original_prompt: request.prompt,
    effective_prompt: effectivePrompt,
    budgets
  });
  const schemaRef = await context.store.writeText("codex/schema/structured-result-v1.json", CODEX_STRUCTURED_RESULT_SCHEMA_TEXT);
  const schemaPath = context.store.statePath(schemaRef);
  const argv = buildCodexRunArgv(provisional, schemaPath);
  const processResult = await runCodexProcess(argv, effectivePrompt, provisional);
  const workspaceAfter = await inspectCodexWorkspaceChanges(authority.repoRoot).catch(() => ({
    available: false,
    changedPaths: []
  }));
  const threadId = request.mode === "resume" ? request.thread_id : processResult.threadId;
  const finalAuthority = threadId
    ? recreateCodexAuthorityWithThread(provisional, threadId, request.prompt, effectivePrompt)
    : provisional;
  const authorityDigest = codexAuthorityDigest(finalAuthority);
  const authorityVerifiability = codexAuthorityVerifiability(
    finalAuthority,
    authorityDigest,
    request.prompt,
    effectivePrompt,
    request.mode === "resume"
  );
  if (threadId) {
    await context.store.writeJson(codexThreadRecordPath(threadId), {
      schema_version: 2,
      thread_id: threadId,
      authority_digest: authorityDigest,
      authority: finalAuthority,
      authority_verifiability: authorityVerifiability,
      updated_at: utcNow()
    } satisfies CodexThreadAuthorityRecord);
  }

  const metadata = codexExecutionMetadata(
    finalAuthority,
    authorityDigest,
    threadId,
    processResult,
    workspaceBefore,
    workspaceAfter,
    outputCaptureLimitSource,
    authorityVerifiability
  );
  if (request.mode === "resume" && processResult.threadId && processResult.threadId !== request.thread_id) {
    return codexFailure("codex_authority_mismatch", "Codex resume emitted a different thread id.", failedCodexStructuredResult(
      "Codex resume authority mismatch.",
      "The resumed process emitted a thread id different from the persisted handle.",
      "Inspect the persisted handle and retry only the same Codex thread."
    ), metadata);
  }
  if (processResult.spawnError) {
    return codexFailure("spawn_error", "Codex CLI failed to start.", failedCodexStructuredResult(
      "Codex CLI failed to start.",
      "The allowlisted codex binary could not be spawned.",
      "Restore the local Codex CLI and resume through the same main-harness task."
    ), metadata);
  }
  if (processResult.threadIdMismatch) {
    return codexFailure("codex_authority_mismatch", "Codex emitted mismatched thread ids.", failedCodexStructuredResult(
      "Codex thread authority mismatch.",
      "The process emitted more than one distinct thread id.",
      "Inspect the persisted handle and retry only one Codex thread."
    ), metadata);
  }
  if (processResult.timedOut || processResult.toolBudgetExceeded || processResult.delegationBudgetExceeded) {
    const kind = processResult.timedOut
      ? "timeout"
      : "codex_tool_budget_exceeded";
    return codexFailure(kind, "Codex execution stopped at a bounded harness limit.", blockedCodexStructuredResult(
      "Codex execution stopped before a valid terminal result.",
      processResult.timedOut
        ? "timeout budget exceeded"
        : processResult.delegationBudgetExceeded
          ? "delegation max_subagents budget exceeded"
          : "tool-call budget exceeded",
      threadId ? "Resume this exact Codex thread with its returned authority handle." : "Start a new bounded Codex run after reviewing the budget."
    ), metadata);
  }
  if (processResult.invalidJsonl) {
    return codexFailure("codex_invalid_jsonl", "Codex emitted invalid JSONL event data.", failedCodexStructuredResult(
      "Codex JSONL could not be validated.",
      "A JSONL event was malformed or violated the minimal event schema.",
      "Inspect the local Codex version and retry only after restoring valid JSONL output."
    ), metadata);
  }
  if (processResult.exitCode !== 0) {
    return codexFailure("nonzero_exit", `Codex exited with code ${processResult.exitCode ?? "unknown"}.`, failedCodexStructuredResult(
      "Codex process did not exit successfully.",
      `Codex exit code was ${processResult.exitCode ?? "unknown"}.`,
      threadId ? "Resume the exact thread after the main harness reviews the failure." : "Correct the local Codex failure and start a new bounded run."
    ), metadata);
  }
  if (!threadId || !processResult.lastAgentMessage) {
    return codexFailure("codex_invalid_structured_result", "Codex did not emit a thread handle and structured final message.", failedCodexStructuredResult(
      "Codex returned no valid structured result.",
      "The successful process lacked a thread id or final agent message.",
      "Retry through the typed harness after checking the local Codex JSONL contract."
    ), metadata);
  }

  let structured: CodexStructuredResult;
  try {
    structured = parseCodexStructuredResult(processResult.lastAgentMessage);
    const after = await inspectCodexGitAuthority(context.store.repoRoot, finalAuthority.isolated_worktree, finalAuthority.cwd);
    assertPersistedAuthority(finalAuthority, after);
  } catch (error) {
    return codexFailure("codex_invalid_structured_result", errorMessage(error), failedCodexStructuredResult(
      "Codex structured result or post-run authority was invalid.",
      errorMessage(error),
      "Let the main harness inspect the worktree and retry or resume without claiming completion."
    ), metadata);
  }

  const ok = structured.status === "done";
  return toolResult(CODEX_RUN_TOOL, ok, `Codex execution evidence status=${structured.status}; completion authority remains with the main harness.`, {
    ...metadata,
    status: structured.status,
    result: structured
  }, "local_write", ok ? undefined : structured.status === "blocked" ? "codex_blocked" : "codex_failed");
}

function codexFailure(
  failureKind: ToolFailureKind,
  summary: string,
  result: CodexStructuredResult,
  metadata: Record<string, unknown> = {}
): ToolResult {
  return toolResult(CODEX_RUN_TOOL, false, summary, {
    ...metadata,
    status: result.status,
    result
  }, "local_write", failureKind);
}

function codexExecutionMetadata(
  authority: CodexAuthoritySnapshot,
  authorityDigest: string,
  threadId: string | null,
  result: CodexProcessResult,
  workspaceBefore: CodexWorkspaceChanges,
  workspaceAfter: CodexWorkspaceChanges,
  outputCaptureLimitSource: string,
  authorityVerifiability: CodexAuthorityVerifiability
): Record<string, unknown> {
  const before = new Set(workspaceBefore.changedPaths);
  return {
    authority,
    authority_digest: authorityDigest,
    authority_verifiability: authorityVerifiability,
    resume_handle: threadId ? { thread_id: threadId, authority_digest: authorityDigest } : null,
    selection: {
      model: authority.model,
      reasoning_effort: authority.reasoning_effort,
      profile: authority.profile,
      service_tier: authority.service_tier,
      selection_rationale: authority.selection_rationale,
      task_shape: authority.task_shape
    },
    prompt_digests: {
      original_user_prompt_sha256: authority.original_prompt_sha256,
      effective_prompt_sha256: authority.effective_prompt_sha256,
      raw_prompts_persisted: false
    },
    delegation: {
      requested_plan: authority.delegation_strategy,
      supervision_block_injected: authority.delegation_strategy.mode === "parallel",
      budget_exceeded: result.delegationBudgetExceeded,
      attributable_tool_evidence: result.subagentToolEvidence,
      attributable_spawn_calls_observed: result.subagentToolEvidence.length,
      evidence_boundary: "Only explicit Codex JSONL item events naming spawn_agent are attributable; the requested delegation plan and model self-report do not prove subagent usage or outcomes."
    },
    process: {
      exit_code: result.exitCode,
      timed_out: result.timedOut,
      stdout_chars_observed: result.stdoutCharsObserved,
      stderr_chars_observed: result.stderrCharsObserved,
      output_budget_exceeded: false,
      output_capture: {
        effective_limit_chars: result.outputCapture.effectiveLimitChars,
        observed_chars: result.stdoutCharsObserved + result.stderrCharsObserved,
        retained_chars: result.outputCapture.retainedChars,
        truncated: result.outputCapture.truncated,
        limit_source: outputCaptureLimitSource,
        strategy: "bounded event-summary and redacted stderr prefix/suffix; terminal agent_message is parsed independently",
        termination_boundary: "capture-only; exceeding this limit never signals the Codex process",
        prefix: result.outputCapture.prefix,
        suffix: result.outputCapture.suffix
      },
      tool_budget_exceeded: result.toolBudgetExceeded,
      delegation_budget_exceeded: result.delegationBudgetExceeded
    },
    events: {
      count: result.eventCount,
      types: result.eventTypes,
      item_types: result.itemTypes,
      tool_calls_observed: result.toolCallsObserved
    },
    workspace_changes: {
      available: workspaceBefore.available && workspaceAfter.available,
      before_changed_paths: workspaceBefore.changedPaths,
      after_changed_paths: workspaceAfter.changedPaths,
      introduced_changed_paths: workspaceAfter.changedPaths.filter((path) => !before.has(path)),
      boundary: "fixed live git status --porcelain=v1 -z snapshots; includes tracked and untracked paths without reading file bodies"
    },
    boundary: "Codex output is bounded execution evidence only; the main harness independently owns diff, tests, permissions, commit, PR, merge, deploy, and completion."
  };
}

async function inspectCodexGitAuthority(repoRoot: string, requestedWorktree: string, requestedCwd: string): Promise<CodexGitAuthority> {
  const configuredRoot = await realpath(repoRoot);
  const configuredCommonDir = await realpath(await gitText(configuredRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const worktree = await realpath(resolve(configuredRoot, requestedWorktree));
  const cwd = await realpath(resolve(worktree, requestedCwd));
  const cwdRelative = relative(worktree, cwd);
  if (cwdRelative.startsWith("..") || cwdRelative.startsWith("/")) throw new Error("codex.run cwd must stay inside the isolated worktree.");

  const actualRoot = await gitText(worktree, ["rev-parse", "--show-toplevel"]);
  if (await realpath(actualRoot) !== worktree) throw new Error("codex.run repo root does not match the isolated worktree.");
  const gitCommonDir = await realpath(await gitText(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  if (gitCommonDir !== configuredCommonDir) throw new Error("codex.run target worktree belongs to a different Git common root.");
  const gitDir = await realpath(await gitText(worktree, ["rev-parse", "--path-format=absolute", "--git-dir"]));
  if (gitCommonDir === resolve(worktree, ".git") || !gitDir.startsWith(`${gitCommonDir}/worktrees/`)) {
    throw new Error("codex.run requires a linked isolated Git worktree.");
  }
  const worktrees = await gitText(configuredRoot, ["worktree", "list", "--porcelain"]);
  const registeredWorktrees = worktrees.split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
  if (!registeredWorktrees.includes(worktree)) throw new Error("codex.run worktree is not registered in the common Git root.");
  if (registeredWorktrees[0] === worktree) throw new Error("codex.run refuses the main checkout; an isolated linked worktree is required.");
  return {
    repoRoot: actualRoot,
    gitCommonDir,
    headCommit: await gitText(worktree, ["rev-parse", "HEAD"]),
    branch: await gitText(worktree, ["branch", "--show-current"]),
    worktree,
    cwd
  };
}

async function inspectCodexWorkspaceChanges(repoRoot: string): Promise<CodexWorkspaceChanges> {
  const output = await gitOutput(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const entries = output.split("\0");
  const paths = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (path) paths.add(path);
    if (/[RC]/.test(status) && entries[index + 1]) {
      paths.add(entries[index + 1]);
      index += 1;
    }
  }
  return { available: true, changedPaths: [...paths].sort().slice(0, 200) };
}

async function assertCodexBase(repoRoot: string, baseCommit: string, headCommit: string): Promise<void> {
  const exists = await gitExit(repoRoot, ["cat-file", "-e", `${baseCommit}^{commit}`]);
  if (exists !== 0) throw new Error("codex.run base_commit does not exist in the common Git repository.");
  const ancestor = await gitExit(repoRoot, ["merge-base", "--is-ancestor", baseCommit, headCommit]);
  if (ancestor !== 0) throw new Error("codex.run base_commit is not an ancestor of HEAD.");
}

function assertPersistedAuthority(expected: CodexAuthoritySnapshot, actual: CodexGitAuthority): void {
  if (expected.repo_root !== actual.repoRoot
    || expected.git_common_dir !== actual.gitCommonDir
    || expected.branch !== actual.branch
    || expected.isolated_worktree !== actual.worktree
    || expected.cwd !== actual.cwd
    || expected.head_commit !== actual.headCommit) {
    throw new CodexAuthorityError("Persisted Codex repo/common-root/branch/worktree/cwd/HEAD authority no longer matches the actual worktree.");
  }
}

function recreateCodexAuthorityWithThread(
  authority: CodexAuthoritySnapshot,
  threadId: string,
  originalPrompt: string,
  effectivePrompt: string
): CodexAuthoritySnapshot {
  return createCodexAuthoritySnapshot({
    repo_root: authority.repo_root,
    git_common_dir: authority.git_common_dir,
    base_commit: authority.base_commit,
    head_commit: authority.head_commit,
    branch: authority.branch,
    isolated_worktree: authority.isolated_worktree,
    cwd: authority.cwd,
    model: authority.model,
    profile: authority.profile,
    reasoning_effort: authority.reasoning_effort,
    service_tier: authority.service_tier,
    sandbox: authority.sandbox,
    approval_policy: authority.approval_policy,
    selection_rationale: authority.selection_rationale,
    task_shape: authority.task_shape,
    delegation_strategy: authority.delegation_strategy,
    mode: authority.mode,
    thread_id: threadId,
    original_prompt: originalPrompt,
    effective_prompt: effectivePrompt,
    budgets: authority.budgets
  });
}

function codexAuthorityVerifiability(
  authority: CodexAuthoritySnapshot,
  authorityDigest: string,
  originalPrompt: string,
  effectivePrompt: string,
  resumeAuthorityInherited: boolean
): CodexAuthorityVerifiability {
  if (authority.schema_version !== 2
    || codexAuthorityDigest(authority) !== authorityDigest
    || sha256(originalPrompt) !== authority.original_prompt_sha256
    || sha256(effectivePrompt) !== authority.effective_prompt_sha256) {
    throw new CodexAuthorityError("Codex authority snapshot or prompt digests are not verifiable.");
  }
  return {
    status: "verified",
    snapshot_schema_version: 2,
    authority_digest_recomputed: true,
    original_prompt_digest_verified: true,
    effective_prompt_digest_verified: true,
    git_authority_verified_before_execution: true,
    resume_authority_inherited: resumeAuthorityInherited,
    boundary: "Strict v2 snapshot, recomputed authority and prompt digests, and fixed Git authority were verified; execution results remain evidence under main-harness completion authority."
  };
}

function parseVerifiableCodexThreadRecord(value: unknown): CodexThreadAuthorityRecord | null {
  if (!isPlainRecord(value)
    || value.schema_version !== 2
    || typeof value.thread_id !== "string"
    || typeof value.authority_digest !== "string"
    || !/^[a-f0-9]{64}$/.test(value.authority_digest)
    || !isPlainRecord(value.authority_verifiability)
    || value.authority_verifiability.status !== "verified"
    || value.authority_verifiability.snapshot_schema_version !== 2
    || value.authority_verifiability.authority_digest_recomputed !== true
    || value.authority_verifiability.original_prompt_digest_verified !== true
    || value.authority_verifiability.effective_prompt_digest_verified !== true
    || value.authority_verifiability.git_authority_verified_before_execution !== true
    || typeof value.authority_verifiability.resume_authority_inherited !== "boolean"
    || typeof value.authority_verifiability.boundary !== "string"
    || typeof value.updated_at !== "string") {
    return null;
  }
  let authority: CodexAuthoritySnapshot;
  try {
    authority = parseCodexAuthoritySnapshot(value.authority);
  } catch {
    return null;
  }
  if (authority.thread_id !== value.thread_id || codexAuthorityDigest(authority) !== value.authority_digest) return null;
  return {
    schema_version: 2,
    thread_id: value.thread_id,
    authority_digest: value.authority_digest,
    authority,
    authority_verifiability: value.authority_verifiability as unknown as CodexAuthorityVerifiability,
    updated_at: value.updated_at
  };
}

function codexExecutionPrompt(
  task: string,
  authority: CodexGitAuthority,
  budgets: CodexAuthoritySnapshot["budgets"],
  delegationStrategy: CodexDelegationStrategy
): string {
  return [
    "The main harness grants one bounded Codex CLI execution in the recorded isolated worktree.",
    `Repository root: ${authority.repoRoot}`,
    `Branch: ${authority.branch}`,
    `Cwd: ${authority.cwd}`,
    `Budgets: timeout_ms=${budgets.timeout_ms}, max_output_chars=${budgets.max_output_chars}, max_context_chars=${budgets.max_context_chars}, max_tool_calls=${budgets.max_tool_calls}, max_retries=${budgets.max_retries}.`,
    "Do not create worktrees, commit, push, create a pull request, merge, deploy, use web search, add writable directories, bypass approvals, or bypass the sandbox.",
    "Return only the required structured result. Its status is execution evidence; completion_authority must remain main_harness.",
    ...codexDelegationSupervisionBlock(delegationStrategy),
    "Task:",
    task
  ].join("\n");
}

function codexDelegationSupervisionBlock(strategy: CodexDelegationStrategy): string[] {
  if (strategy.mode !== "parallel") return [];
  return [
    "Delegation supervision:",
    `- Parallel delegation is bounded to at most ${strategy.max_subagents} subagents; use fewer when the work does not benefit from parallelism.`,
    "- Give each opened subagent one independent workstream with non-overlapping file ownership and no authority to integrate, commit, push, publish, merge, deploy, or claim completion.",
    ...strategy.independent_workstreams.map((workstream, index) => `- Workstream ${index + 1}: ${workstream}`),
    `- Integration owner: ${strategy.integration_owner}. The main Codex thread owns integration, conflict resolution, focused verification, and the final structured result.`,
    "- Requested workstreams are a plan, not proof of subagent usage. Report subagent facts only when attributable Codex JSONL/tool evidence exists."
  ];
}

function runCodexProcess(argv: readonly string[], prompt: string, authority: CodexAuthoritySnapshot): Promise<CodexProcessResult> {
  return new Promise((resolveProcess) => {
    const child = spawn("codex", [...argv], {
      cwd: authority.cwd,
      env: codexEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32"
    });
    let stdoutBuffer = "";
    let stdoutCharsObserved = 0;
    let stderrCharsObserved = 0;
    let timedOut = false;
    let toolBudgetExceeded = false;
    let invalidJsonl = false;
    let spawnError = false;
    let threadIdMismatch = false;
    let threadId: string | null = null;
    let lastAgentMessage: string | null = null;
    let eventCount = 0;
    const eventTypes: Record<string, number> = {};
    const itemTypes: Record<string, number> = {};
    const countedToolItems = new Set<string>();
    const subagentToolEvidence = new Map<string, CodexSubagentToolEvidence>();
    let delegationBudgetExceeded = false;
    const outputCapture = new BoundedCodexOutputCapture(authority.budgets.max_output_chars);
    let settled = false;
    let cleanupStarted = false;
    let cleanupKillTimer: NodeJS.Timeout | null = null;

    const stop = (): void => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      signalCodexProcessTree(child.pid, "SIGTERM", () => child.kill("SIGTERM"));
      cleanupKillTimer = setTimeout(() => {
        signalCodexProcessTree(child.pid, "SIGKILL", () => child.kill("SIGKILL"));
      }, 100);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, authority.budgets.timeout_ms);

    const consumeLine = (line: string): void => {
      if (!line.trim() || invalidJsonl) return;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        invalidJsonl = true;
        stop();
        return;
      }
      if (!isPlainRecord(event) || typeof event.type !== "string" || !/^[a-z][a-z0-9_.-]{0,80}$/.test(event.type)) {
        invalidJsonl = true;
        stop();
        return;
      }
      eventCount += 1;
      incrementBoundedCounter(eventTypes, event.type);
      if (event.type === "thread.started") {
        if (typeof event.thread_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.thread_id)) {
          invalidJsonl = true;
          stop();
          return;
        }
        if (threadId && threadId !== event.thread_id) {
          threadIdMismatch = true;
          stop();
          return;
        }
        threadId = event.thread_id;
      }
      if ((event.type === "item.started" || event.type === "item.completed") && isPlainRecord(event.item)) {
        const itemType = typeof event.item.type === "string" ? event.item.type : "unknown";
        incrementBoundedCounter(itemTypes, boundedDiagnosticToken(itemType));
        const itemId = typeof event.item.id === "string" ? event.item.id : `${eventCount}:${itemType}`;
        if (event.type === "item.completed" && itemType === "agent_message" && typeof event.item.text === "string") {
          lastAgentMessage = event.item.text;
        }
        const subagentEvidence = codexSubagentToolEvidence(event.type, event.item, eventCount, itemId, itemType);
        if (subagentEvidence) {
          const previousEvidence = subagentToolEvidence.get(subagentEvidence.item_id);
          if (!previousEvidence || subagentEvidence.event_type === "item.completed") {
            subagentToolEvidence.set(subagentEvidence.item_id, subagentEvidence);
          }
          if (subagentToolEvidence.size > authority.delegation_strategy.max_subagents) {
            delegationBudgetExceeded = true;
            stop();
          }
        }
        if (isCodexToolItem(itemType) && !countedToolItems.has(itemId)) {
          countedToolItems.add(itemId);
          if (countedToolItems.size > authority.budgets.max_tool_calls) {
            toolBudgetExceeded = true;
            stop();
          }
        }
      }
      outputCapture.append(summarizeCodexEvent(event));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutCharsObserved += text.length;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrCharsObserved += text.length;
      outputCapture.append(`[stderr] ${redactCodexDiagnostic(text)}`);
    });
    child.on("error", () => {
      spawnError = true;
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (cleanupKillTimer) clearTimeout(cleanupKillTimer);
      if (stdoutBuffer.trim()) consumeLine(stdoutBuffer);
      resolveProcess({
        exitCode,
        timedOut,
        toolBudgetExceeded,
        invalidJsonl,
        spawnError,
        threadIdMismatch,
        threadId,
        lastAgentMessage,
        stdoutCharsObserved,
        stderrCharsObserved,
        outputCapture: outputCapture.snapshot(stdoutCharsObserved + stderrCharsObserved),
        eventCount,
        eventTypes,
        itemTypes,
        toolCallsObserved: countedToolItems.size,
        delegationBudgetExceeded,
        subagentToolEvidence: [...subagentToolEvidence.values()]
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

class BoundedCodexOutputCapture {
  private readonly prefixLimit: number;
  private readonly suffixLimit: number;
  private prefix = "";
  private suffix = "";

  constructor(private readonly effectiveLimitChars: number) {
    this.prefixLimit = Math.ceil(effectiveLimitChars / 2);
    this.suffixLimit = Math.floor(effectiveLimitChars / 2);
  }

  append(value: string): void {
    if (!value) return;
    let remaining = value.endsWith("\n") ? value : `${value}\n`;
    if (this.prefix.length < this.prefixLimit) {
      const prefixPart = remaining.slice(0, this.prefixLimit - this.prefix.length);
      this.prefix += prefixPart;
      remaining = remaining.slice(prefixPart.length);
    }
    if (!remaining || this.suffixLimit === 0) return;
    this.suffix = `${this.suffix}${remaining}`.slice(-this.suffixLimit);
  }

  snapshot(observedChars: number): CodexOutputCapture {
    return {
      effectiveLimitChars: this.effectiveLimitChars,
      retainedChars: this.prefix.length + this.suffix.length,
      truncated: observedChars > this.effectiveLimitChars,
      prefix: this.prefix,
      suffix: this.suffix
    };
  }
}

function summarizeCodexEvent(event: Record<string, unknown>): string {
  const parts = [`event=${event.type}`];
  if (event.type === "thread.started" && typeof event.thread_id === "string") {
    parts.push(`thread_id=${boundedDiagnosticToken(event.thread_id)}`);
  }
  if ((event.type === "item.started" || event.type === "item.completed") && isPlainRecord(event.item)) {
    if (typeof event.item.type === "string") parts.push(`item_type=${boundedDiagnosticToken(event.item.type)}`);
    if (typeof event.item.id === "string") parts.push(`item_id=${boundedDiagnosticToken(event.item.id)}`);
  }
  return parts.join(" ");
}

function codexSubagentToolEvidence(
  eventType: string,
  item: Record<string, unknown>,
  eventIndex: number,
  itemId: string,
  itemType: string
): CodexSubagentToolEvidence | null {
  if ((eventType !== "item.started" && eventType !== "item.completed") || itemType !== "collab_tool_call") {
    return null;
  }
  const toolName = typeof item.tool === "string" ? item.tool : "";
  if (toolName !== "spawn_agent") return null;
  const receiverThreadIds = Array.isArray(item.receiver_thread_ids)
    ? item.receiver_thread_ids.filter((value): value is string =>
      typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ).slice(0, 3)
    : [];
  return {
    event_index: eventIndex,
    event_type: eventType,
    item_id: codexEvidenceItemId(itemId),
    item_type: itemType,
    tool_name: toolName,
    receiver_thread_ids: receiverThreadIds
  };
}

function codexEvidenceItemId(value: string): string {
  return /^[A-Za-z0-9_.:/-]{1,120}$/.test(value)
    ? value
    : `sha256:${sha256(value).slice(0, 24)}`;
}

function incrementBoundedCounter(counter: Record<string, number>, rawKey: string): void {
  const key = boundedDiagnosticToken(rawKey);
  if (key in counter || Object.keys(counter).length < 64) {
    counter[key] = (counter[key] ?? 0) + 1;
    return;
  }
  counter.__other__ = (counter.__other__ ?? 0) + 1;
}

function boundedDiagnosticToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]/g, "_").slice(0, 120) || "unknown";
}

function redactCodexDiagnostic(value: string): string {
  return value
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/gi, "[REDACTED]")
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}

function signalCodexProcessTree(pid: number | undefined, signal: NodeJS.Signals, fallback: () => boolean): void {
  if (process.platform !== "win32" && pid) {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Fall through to the direct child signal when the group no longer exists.
    }
  }
  try {
    fallback();
  } catch {
    // Cleanup is best effort after a bounded stop condition has already been recorded.
  }
}

function isCodexToolItem(type: string): boolean {
  return ["command_execution", "file_change", "mcp_tool_call", "tool_call", "dynamic_tool_call", "collab_tool_call", "web_search"].includes(type);
}

function codexEnv(): NodeJS.ProcessEnv {
  const env = minimalEnv();
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  return env;
}

function codexThreadRecordPath(threadId: string): string {
  return `codex/threads/${threadId}.json`;
}

function gitText(cwd: string, args: string[]): Promise<string> {
  return gitOutput(cwd, args).then((output) => output.trim());
}

function gitOutput(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolveText, reject) => {
    execFile("git", args, { cwd, env: { ...minimalEnv(), LANG: "C", LC_ALL: "C" }, encoding: "utf8", maxBuffer: 1_000_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Fixed Git authority check failed: ${String(stderr || error.message).trim().slice(0, 300)}`));
        return;
      }
      resolveText(String(stdout));
    });
  });
}

function gitExit(cwd: string, args: string[]): Promise<number> {
  return new Promise((resolveExit) => {
    execFile("git", args, { cwd, env: { ...minimalEnv(), LANG: "C", LC_ALL: "C" } }, (error) => {
      resolveExit(error && typeof error.code === "number" ? error.code : error ? 1 : 0);
    });
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class CodexAuthorityError extends Error {}

async function runCodeExecuteNode(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const code = stringValue(args.code);
  const timeoutMs = Math.min(Math.max(intValue(args.timeout_ms, 10000), 1000), 30000);
  const maxOutputChars = Math.min(Math.max(intValue(args.max_output_chars, 12000), 1000), 30000);
  if (!code.trim()) {
    return toolResult("code.execute_node", false, "No code provided.", {}, "local_reversible", "invalid_request");
  }

  const result = await runNode(code, {
    cwd: context.store.stateRoot,
    timeoutMs,
    maxOutputChars,
    env: minimalEnv()
  });
  const ok = result.exitCode === 0 && !result.timedOut;
  return toolResult("code.execute_node", ok, result.summary, {
    ...result,
    timed_out: result.timedOut
  }, "local_reversible", ok ? undefined : processFailureKind(result));
}

function toolResult(
  tool: string,
  ok: boolean,
  summary: string,
  output: Record<string, unknown>,
  sideEffectLevel: ToolResult["side_effect_level"],
  failureKind?: ToolFailureKind
): ToolResult {
  return {
    id: newId("tool_result"),
    tool,
    ok,
    summary,
    output: ok || !failureKind ? output : { failure_kind: failureKind, ...output },
    side_effect_level: sideEffectLevel,
    created_at: utcNow()
  };
}

function pathFailureKind(message: string): ToolFailureKind {
  if (message.includes("repo-local runtime state")) return "runtime_state_path";
  if (message.includes("protected repository path") || message.includes("secret-like files")) return "protected_path";
  return "invalid_request";
}

function processFailureKind(result: { exitCode: number | null; timedOut: boolean }): ToolFailureKind {
  if (result.timedOut) return "timeout";
  if (result.exitCode === null) return "spawn_error";
  return "nonzero_exit";
}

function validateRelativePath(path: string): string | null {
  if (!path) return "Path is required.";
  if (path.startsWith("/") || path.includes("..") || path.includes("\0")) {
    return "Path must be relative and must not contain '..'.";
  }
  return null;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoRuntimePathRoot(path: string): string | null {
  const first = normalizeRelativePath(path).split("/").filter(Boolean)[0] ?? "";
  if (first === ".runtime" || first.startsWith(".runtime-") || first.startsWith(".runtime_") || first.startsWith(".local-runtime")) {
    return first;
  }
  return null;
}

function validateRepoRuntimePath(tool: string, path: string): string | null {
  const first = repoRuntimePathRoot(path);
  return first ? `${tool} cannot access repo-local runtime state path: ${first}` : null;
}

function validateRepoWritePath(path: string): string | null {
  const runtimePath = validateRepoRuntimePath("file.write_repo", path);
  if (runtimePath) return runtimePath;
  const normalized = normalizeRelativePath(path);
  const parts = normalized.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const base = basename(normalized);
  if (first === ".git" || first === "node_modules" || first === "dist") {
    return `file.write_repo cannot write protected repository path: ${first}`;
  }
  if (base === ".env" || base.startsWith(".env.") || base.endsWith(".pem") || base.endsWith(".key")) {
    return "file.write_repo cannot write secret-like files.";
  }
  return null;
}

function workspaceStatusEvidence(status: WorkspaceStatusResult): Record<string, unknown> {
  return {
    status: status.status,
    branch: status.branch ?? null,
    upstream: status.upstream ?? null,
    ahead: status.ahead ?? 0,
    behind: status.behind ?? 0,
    changed_file_count: status.changed_file_count,
    staged_count: status.staged_count,
    unstaged_count: status.unstaged_count,
    untracked_count: status.untracked_count,
    conflict_count: status.conflict_count,
    changes: status.changes,
    truncated: status.truncated,
    command: status.command,
    boundary: status.boundary,
    error: status.error ? truncateOutput(status.error, 200) : undefined
  };
}

function renderRepoWriteSummary(
  relPath: string,
  bytes: number,
  before: WorkspaceStatusResult,
  after: WorkspaceStatusResult,
  guard: {
    preexisting_dirty: boolean;
    target_changed_after_write: boolean;
    changed_file_count_delta: number;
  }
): string {
  return [
    `Wrote repo:${relPath} (${bytes} bytes).`,
    "workspace_guard:",
    `before=${before.status}`,
    `after=${after.status}`,
    `changed_files=${before.changed_file_count}->${after.changed_file_count}`,
    `delta=${guard.changed_file_count_delta}`,
    `preexisting_dirty=${guard.preexisting_dirty}`,
    `target_changed=${guard.target_changed_after_write}.`
  ].join(" ");
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runRipgrep(options: {
  repoRoot: string;
  query: string;
  path: string;
  globs: string[];
  maxOutputChars: number;
}): Promise<{ available: boolean; exitCode: number | null; stdout: string; stderr: string; truncated: boolean }> {
  const args = [
    "--line-number",
    "--no-heading",
    "--color",
    "never",
    "--fixed-strings",
    "--glob",
    "!.git/**",
    "--glob",
    "!node_modules/**",
    "--glob",
    "!dist/**"
  ];
  for (const glob of options.globs) {
    args.push("--glob", glob);
  }
  args.push(
    "--glob",
    "!.runtime/**",
    "--glob",
    "!.runtime-*/**",
    "--glob",
    "!.runtime_*/**",
    "--glob",
    "!.local-runtime*/**"
  );
  args.push("--", options.query, options.path);

  return new Promise((resolve) => {
    const child = spawn("rg", args, {
      cwd: options.repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: minimalEnv()
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        resolve({ available: false, exitCode: null, stdout: "", stderr: "", truncated: false });
        return;
      }
      resolve({ available: true, exitCode: null, stdout: "", stderr: error.message, truncated: false });
    });
    child.stdout.on("data", (chunk: Buffer) => {
      const next = stdout + chunk.toString("utf8");
      truncated ||= next.length > options.maxOutputChars;
      stdout = truncateOutput(next, options.maxOutputChars);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncateOutput(stderr + chunk.toString("utf8"), options.maxOutputChars);
    });
    child.on("close", (exitCode) => {
      resolve({ available: true, exitCode, stdout, stderr, truncated });
    });
  });
}

function parseRipgrepLine(line: string): Record<string, unknown> {
  const [path = "", lineNumber = "", ...rest] = line.split(":");
  return {
    path: path.replace(/^\.\//, ""),
    line: Number.parseInt(lineNumber, 10) || null,
    text: rest.join(":")
  };
}

async function fallbackSearch(
  store: AgentStore,
  options: { query: string; path: string; maxResults: number; maxOutputChars: number }
): Promise<{ matches: Array<Record<string, unknown>>; truncated: boolean }> {
  const relFiles = await collectRepoFiles(store, options.path);
  const matches: Array<Record<string, unknown>> = [];
  let usedChars = 0;
  let truncated = false;

  for (const rel of relFiles) {
    if (isIgnoredSearchPath(rel)) continue;
    const text = await store.readRepoText(rel, options.maxOutputChars).catch(() => "");
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.includes(options.query)) continue;
      const outputText = truncateOutput(line, 1000);
      usedChars += outputText.length;
      if (matches.length >= options.maxResults || usedChars > options.maxOutputChars) {
        truncated = true;
        return { matches, truncated };
      }
      matches.push({
        path: rel,
        line: index + 1,
        text: outputText
      });
    }
  }
  return { matches, truncated };
}

async function collectRepoFiles(store: AgentStore, relPath: string): Promise<string[]> {
  const abs = store.repoPath(relPath);
  const files: string[] = [];
  await walkFiles(abs, relPath === "." ? "" : relPath.replace(/\/$/, ""), files).catch(() => {});
  return files.sort();
}

async function walkFiles(absDir: string, relDir: string, files: string[]): Promise<void> {
  for (const entry of await readdir(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const abs = resolve(absDir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(abs, rel, files);
    } else {
      files.push(rel);
    }
  }
}

function isIgnoredSearchPath(path: string): boolean {
  return path.startsWith(".git/")
    || path.startsWith("node_modules/")
    || path.startsWith("dist/")
    || path === ".runtime"
    || path.startsWith(".runtime/")
    || path.startsWith(".runtime-")
    || path.startsWith(".runtime_")
    || path.startsWith(".local-runtime");
}

interface BoundedOutput {
  text: string;
  observedChars: number;
  truncated: boolean;
}

function emptyBoundedOutput(): BoundedOutput {
  return { text: "", observedChars: 0, truncated: false };
}

function appendBoundedOutput(output: BoundedOutput, chunk: Buffer, maxChars: number): BoundedOutput {
  const chunkText = chunk.toString("utf8");
  const next = output.text + chunkText;
  return {
    text: truncateOutput(next, maxChars),
    observedChars: output.observedChars + chunkText.length,
    truncated: output.truncated || next.length > maxChars
  };
}

function runNode(
  code: string,
  options: { cwd: string; timeoutMs: number; maxOutputChars: number; env: NodeJS.ProcessEnv }
): Promise<{
  exitCode: number | null;
  timedOut: boolean;
  timeout_ms: number;
  max_output_chars: number;
  cwd_boundary: "state_root";
  env_boundary: {
    mode: "minimal_runtime_env";
    inherited_keys: string[];
  };
  stdout: string;
  stderr: string;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
  stdout_chars_observed: number;
  stderr_chars_observed: number;
  summary: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-"], {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: options.env
    });
    let stdout = emptyBoundedOutput();
    let stderr = emptyBoundedOutput();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendBoundedOutput(stdout, chunk, options.maxOutputChars);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBoundedOutput(stderr, chunk, options.maxOutputChars);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        timedOut,
        timeout_ms: options.timeoutMs,
        max_output_chars: options.maxOutputChars,
        cwd_boundary: "state_root",
        env_boundary: {
          mode: "minimal_runtime_env",
          inherited_keys: Object.keys(options.env).sort()
        },
        stdout: stdout.text,
        stderr: stderr.text,
        stdout_truncated: stdout.truncated,
        stderr_truncated: stderr.truncated,
        stdout_chars_observed: stdout.observedChars,
        stderr_chars_observed: stderr.observedChars,
        summary: timedOut
          ? `Node execution timed out after ${options.timeoutMs}ms.`
          : `Node execution exited with code ${exitCode}.`
      });
    });
    child.stdin.end(code);
  });
}

function runLocalCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number; env: NodeJS.ProcessEnv }
): Promise<{
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdoutObservedChars: number;
  stderrObservedChars: number;
  summary: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env
    });
    let stdout = emptyBoundedOutput();
    let stderr = emptyBoundedOutput();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.on("error", (error: Error) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        timedOut,
        stdout: stdout.text,
        stderr: error.message,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        stdoutObservedChars: stdout.observedChars,
        stderrObservedChars: error.message.length,
        summary: `Command failed to start: ${error.message}`
      });
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendBoundedOutput(stdout, chunk, options.maxOutputChars);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBoundedOutput(stderr, chunk, options.maxOutputChars);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        timedOut,
        stdout: stdout.text,
        stderr: stderr.text,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        stdoutObservedChars: stdout.observedChars,
        stderrObservedChars: stderr.observedChars,
        summary: timedOut
          ? `Command timed out after ${options.timeoutMs}ms.`
          : `Command exited with code ${exitCode}.`
      });
    });
  });
}

function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n...`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function intValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function parseSideEffectLevel(value: unknown): ToolResult["side_effect_level"] | null {
  if (value === "none" || value === "local_reversible" || value === "local_write" || value === "external_write") {
    return value;
  }
  return null;
}

function buildCommandEnv(args: Record<string, unknown>): {
  ok: true;
  env: NodeJS.ProcessEnv;
  audit: {
    requested_keys: string[];
    allowlisted_keys: string[];
    applied_keys: string[];
  };
} | { ok: false; summary: string; output: Record<string, unknown> } {
  const requested = recordValue(args.env);
  const allowlist = new Set(stringArrayValue(args.env_allowlist));
  const rejected = Object.keys(requested).filter((key) => !allowlist.has(key) || typeof requested[key] !== "string");
  if (rejected.length > 0) {
    return {
      ok: false,
      summary: `command.run env entries must be strings and listed in env_allowlist: ${rejected.join(", ")}`,
      output: { rejected_env: rejected }
    };
  }
  const requestedKeys = Object.keys(requested).sort();
  const allowlistedKeys = [...allowlist].sort();
  return {
    ok: true,
    env: {
      ...minimalEnv(),
      ...Object.fromEntries(Object.entries(requested).map(([key, value]) => [key, String(value)]))
    },
    audit: {
      requested_keys: requestedKeys,
      allowlisted_keys: allowlistedKeys,
      applied_keys: requestedKeys
    }
  };
}

function minimalEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "USER", "SHELL", "LANG", "LC_ALL"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}
