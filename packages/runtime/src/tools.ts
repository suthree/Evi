import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { lstat, readlink, readdir, realpath, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
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
import { AgentStore } from "../../core/src/store.js";
import {
  getWorkspaceStatus,
  type WorkspaceStatusResult
} from "../../core/src/workspace_status.js";
import { isPrivateNetworkHost, type EffectAction } from "./effect_policy.js";
import {
  prepareGoalExecutionWorkspaceArgumentsSchema,
  prepareGoalExecutionWorkspace,
  type GoalToolExecutionContext as GoalWorkspaceToolExecutionContext
} from "./goal_execution_workspace.js";
import type { GoalRepositoryAuthority } from "./repository_authority.js";

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
  | "change_not_observed"
  | "http_status"
  | "invalid_request"
  | "not_found"
  | "nonzero_exit"
  | "private_network"
  | "protected_path"
  | "redirect_blocked"
  | "runtime_state_path"
  | "scan_limit_exceeded"
  | "search_error"
  | "spawn_error"
  | "timeout"
  | "unsupported_tool"
  | "verification_failed"
  | "workspace_prepare_failed";

type CommandPurpose = "execute" | "verification";

export interface ToolExecutionContext {
  store: AgentStore;
  goal?: GoalWorkspaceToolExecutionContext;
  modelMaxOutputTokens?: number;
  publicNetworkOnly?: boolean;
}

const FILE_READ_DEFAULT_MAX_CHARS = 12_000;
const FILE_READ_MAX_CHARS = 50_000;
const FILE_READ_DEFAULT_MAX_LINES = 200;
const FILE_READ_MAX_LINES = 400;
const FILE_READ_MAX_START_LINE = 1_000_000;
const FILE_READ_MAX_SCAN_BYTES = 4 * 1024 * 1024;
export const MAX_CODEX_WORKSPACE_PATH_CHANGES = 200;
export const MAX_CODEX_CANONICAL_CHANGES = MAX_CODEX_WORKSPACE_PATH_CHANGES + 1;
const MAX_VERIFICATION_CHANGED_PATHS = 1_000;
const MAX_VERIFICATION_SNAPSHOT_FILES = 10_000;
const MAX_VERIFICATION_SNAPSHOT_BYTES = 64 * 1024 * 1024;

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
    return runHttpFetch(args, context);
  }
  if (tool === "command.run") {
    return runCommandRun(args, context);
  }
  if (tool === "workspace.prepare") {
    return runWorkspacePrepare(args, context);
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

async function runWorkspacePrepare(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const parsedArgs = prepareGoalExecutionWorkspaceArgumentsSchema.safeParse(args);
  if (!parsedArgs.success) {
    return toolResult("workspace.prepare", false, "workspace.prepare requires only a strict branch and base_commit.", {}, "local_reversible", "invalid_request");
  }
  if (!context.goal) {
    return toolResult("workspace.prepare", false, "workspace.prepare requires GoalRuntime execution context.", {}, "local_reversible", "invalid_request");
  }
  if (context.goal.execution_workspace) {
    return toolResult("workspace.prepare", false, "The Goal already has an execution workspace.", {
      execution_workspace: context.goal.execution_workspace
    }, "local_reversible", "invalid_request");
  }
  try {
    const executionWorkspace = await prepareGoalExecutionWorkspace({
      goal_id: context.goal.goal_id,
      control_authority: context.goal.control_repository_authority,
      branch: parsedArgs.data.branch,
      base_commit: parsedArgs.data.base_commit
    });
    return toolResult("workspace.prepare", true, `Prepared Goal execution workspace ${executionWorkspace.authority.branch}.`, {
      execution_workspace: executionWorkspace
    }, "local_reversible");
  } catch (error) {
    return toolResult("workspace.prepare", false, errorMessage(error), {
      failure_kind: "workspace_prepare_failed"
    }, "local_reversible", "workspace_prepare_failed");
  }
}

async function runFileRead(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const scope = stringValue(args.scope) || "repo";
  const relPath = stringValue(args.path);
  const invalid = validateRelativePath(relPath)
    ?? (scope === "repo" ? validateRepoRuntimePath("file.read", relPath) : null);
  if (invalid) {
    return toolResult("file.read", false, invalid, { path: relPath }, "none", pathFailureKind(invalid));
  }
  if (scope !== "repo" && scope !== "state") {
    return toolResult("file.read", false, `Unsupported file.read scope: ${scope}`, { scope }, "none", "invalid_request");
  }

  const startLine = boundedPositiveIntegerArg(args.start_line, "start_line", 1, FILE_READ_MAX_START_LINE);
  const maxLines = boundedPositiveIntegerArg(args.max_lines, "max_lines", FILE_READ_DEFAULT_MAX_LINES, FILE_READ_MAX_LINES);
  const maxChars = boundedPositiveIntegerArg(args.max_chars, "max_chars", FILE_READ_DEFAULT_MAX_CHARS, FILE_READ_MAX_CHARS);
  if (!startLine.ok) {
    return toolResult("file.read", false, startLine.message, {
      scope,
      path: relPath,
      argument: startLine.argument,
      received: startLine.received
    }, "none", "invalid_request");
  }
  if (!maxLines.ok) {
    return toolResult("file.read", false, maxLines.message, {
      scope,
      path: relPath,
      argument: maxLines.argument,
      received: maxLines.received
    }, "none", "invalid_request");
  }
  if (!maxChars.ok) {
    return toolResult("file.read", false, maxChars.message, {
      scope,
      path: relPath,
      argument: maxChars.argument,
      received: maxChars.received
    }, "none", "invalid_request");
  }

  const absolutePath = scope === "state"
    ? context.store.statePath(relPath)
    : context.store.repoPath(relPath);
  let window: BoundedFileWindow;
  try {
    window = await readBoundedFileWindow(
      absolutePath,
      startLine.value,
      maxLines.value,
      maxChars.value
    );
  } catch (error) {
    return toolResult("file.read", false, `file.read failed for ${scope}:${relPath}: ${errorMessage(error)}`, {
      scope,
      path: relPath,
      start_line: startLine.value,
      max_lines: maxLines.value,
      max_chars: maxChars.value
    }, "none", "fetch_error");
  }

  if (window.status === "not_found") {
    return toolResult("file.read", false, `File not found: ${scope}:${relPath}`, {
      scope,
      path: relPath,
      start_line: startLine.value,
      max_lines: maxLines.value,
      max_chars: maxChars.value
    }, "none", "not_found");
  }
  if (window.status === "not_file") {
    return toolResult("file.read", false, `Path is not a regular file: ${scope}:${relPath}`, {
      scope,
      path: relPath,
      start_line: startLine.value,
      max_lines: maxLines.value,
      max_chars: maxChars.value
    }, "none", "invalid_request");
  }
  if (window.status === "scan_limit") {
    return toolResult("file.read", false, `file.read stopped after the bounded ${window.maxScanBytes}-byte scan limit before reaching the requested window.`, {
      scope,
      path: relPath,
      start_line: startLine.value,
      max_lines: maxLines.value,
      max_chars: maxChars.value,
      scanned_bytes: window.scannedBytes,
      max_scan_bytes: window.maxScanBytes
    }, "none", "scan_limit_exceeded");
  }

  const range = window.endLine === null
    ? `no lines at or after line ${startLine.value}`
    : `lines ${startLine.value}-${window.endLine}`;
  const continuation = window.lineTruncated
    ? "selected line was truncated; no lossless line continuation is available"
    : window.nextStartLine === null
      ? "end of file"
      : `continue at line ${window.nextStartLine}`;
  return toolResult("file.read", true, `Read ${scope}:${relPath} ${range} (${window.charsReturned} chars returned; ${continuation}).`, {
    scope,
    path: relPath,
    start_line: startLine.value,
    end_line: window.endLine,
    max_lines: maxLines.value,
    max_chars: maxChars.value,
    chars_returned: window.charsReturned,
    scanned_bytes: window.scannedBytes,
    max_scan_bytes: FILE_READ_MAX_SCAN_BYTES,
    truncated: window.truncated,
    truncation_reason: window.truncationReason,
    line_truncated: window.lineTruncated,
    has_more: window.hasMore,
    next_start_line: window.nextStartLine,
    text: window.text
  }, "none");
}

type BoundedPositiveInteger = {
  ok: true;
  value: number;
} | {
  ok: false;
  argument: string;
  received: unknown;
  message: string;
};

function boundedPositiveIntegerArg(
  value: unknown,
  argument: string,
  fallback: number,
  maximum: number
): BoundedPositiveInteger {
  if (value === undefined) return { ok: true, value: fallback };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum) {
    return {
      ok: false,
      argument,
      received: value,
      message: `${argument} must be a positive integer no greater than ${maximum}.`
    };
  }
  return { ok: true, value };
}

type BoundedFileWindow = {
  status: "not_found";
} | {
  status: "not_file";
} | {
  status: "scan_limit";
  scannedBytes: number;
  maxScanBytes: number;
} | {
  status: "ok";
  text: string;
  charsReturned: number;
  scannedBytes: number;
  endLine: number | null;
  truncated: boolean;
  truncationReason: "max_chars" | "max_lines" | null;
  lineTruncated: boolean;
  hasMore: boolean;
  nextStartLine: number | null;
};

async function readBoundedFileWindow(
  absolutePath: string,
  startLine: number,
  maxLines: number,
  maxChars: number
): Promise<BoundedFileWindow> {
  let metadata;
  try {
    metadata = await stat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "not_found" };
    throw error;
  }
  if (!metadata.isFile()) return { status: "not_file" };

  let text = "";
  let lineBuffer = "";
  let lineBufferChars = 0;
  let charsReturned = 0;
  let scannedBytes = 0;
  let currentLine = 1;
  let returnedLines = 0;
  let endLine: number | null = null;
  let truncated = false;
  let truncationReason: "max_chars" | "max_lines" | null = null;
  let lineTruncated = false;
  let hasMore = false;
  let nextStartLine: number | null = null;
  let scanLimitExceeded = false;
  let stopped = false;
  let pendingCarriageReturn = false;

  const processToken = (token: string, isNewline: boolean): boolean => {
    if (returnedLines >= maxLines) {
      truncated = true;
      truncationReason = "max_lines";
      hasMore = true;
      nextStartLine = currentLine;
      return true;
    }

    const tokenBytes = Buffer.byteLength(token, "utf8");
    if (scannedBytes + tokenBytes > FILE_READ_MAX_SCAN_BYTES) {
      scanLimitExceeded = true;
      return true;
    }
    scannedBytes += tokenBytes;

    if (currentLine < startLine) {
      if (isNewline) currentLine += 1;
      return false;
    }

    const tokenChars = 1;
    const remainingChars = maxChars - charsReturned;
    lineBuffer += token;
    lineBufferChars += tokenChars;
    if (lineBufferChars > remainingChars) {
      truncated = true;
      truncationReason = "max_chars";
      hasMore = true;
      if (text.length > 0) {
        nextStartLine = currentLine;
      } else {
        text = dropLastUnicodeToken(lineBuffer, token);
        charsReturned = lineBufferChars - tokenChars;
        endLine = currentLine;
        returnedLines = 1;
        lineTruncated = true;
        nextStartLine = null;
      }
      return true;
    }

    if (isNewline) {
      text += lineBuffer;
      charsReturned += lineBufferChars;
      lineBuffer = "";
      lineBufferChars = 0;
      returnedLines += 1;
      endLine = currentLine;
      currentLine += 1;
    }
    return false;
  };

  const stream = createReadStream(absolutePath, { encoding: "utf8" });
  outer: for await (const rawChunk of stream) {
    const chunk = String(rawChunk);
    for (const codePoint of chunk) {
      if (pendingCarriageReturn) {
        pendingCarriageReturn = false;
        if (codePoint === "\n") {
          if (processToken("\r\n", true)) {
            stopped = true;
            break outer;
          }
          continue;
        }
        if (processToken("\r", false)) {
          stopped = true;
          break outer;
        }
      }

      if (codePoint === "\r") {
        pendingCarriageReturn = true;
        continue;
      }
      if (processToken(codePoint, codePoint === "\n")) {
        stopped = true;
        break outer;
      }
    }
  }

  if (!stopped && pendingCarriageReturn) {
    stopped = processToken("\r", false);
  }

  if (scanLimitExceeded) {
    return {
      status: "scan_limit",
      scannedBytes,
      maxScanBytes: FILE_READ_MAX_SCAN_BYTES
    };
  }

  if (!truncated && currentLine >= startLine && returnedLines < maxLines && lineBuffer.length > 0) {
    text += lineBuffer;
    charsReturned += lineBufferChars;
    returnedLines += 1;
    endLine = currentLine;
  }

  return {
    status: "ok",
    text,
    charsReturned,
    scannedBytes,
    endLine,
    truncated,
    truncationReason,
    lineTruncated,
    hasMore,
    nextStartLine
  };
}

function dropLastUnicodeToken(value: string, token: string): string {
  return value.slice(0, value.length - token.length);
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
    bytes: text.length,
    change: { kind: "state_change", identity: relPath }
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
    change: { kind: "state_change", identity: relPath },
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

async function runHttpFetch(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const url = stringValue(args.url);
  const responseType = stringValue(args.response_type) || "text";
  const maxChars = intValue(args.max_chars, 12000);
  const timeoutMs = Math.min(Math.max(intValue(args.timeout_ms, 30000), 1000), 300000);
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return toolResult("http.fetch", false, "http.fetch requires an http(s) URL.", { url }, "none", "invalid_request");
  }
  if (context.publicNetworkOnly) {
    const deadlineAt = Date.now() + timeoutMs;
    const destination = await validatePublicNetworkDestination(url, deadlineAt);
    if (!destination.ok) {
      return toolResult("http.fetch", false, destination.summary, {
        url: publicUrlTarget(url),
        resolved_address_count: destination.addressCount,
        timeout_ms: timeoutMs,
        timed_out: destination.failureKind === "timeout"
      }, "none", destination.failureKind);
    }
    return runPinnedPublicHttpFetch({
      url,
      responseType,
      maxChars,
      timeoutMs,
      deadlineAt,
      address: destination.address
    });
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

async function validatePublicNetworkDestination(url: string, deadlineAt: number): Promise<{
  ok: true;
  summary: string;
  addressCount: number;
  address: string;
} | {
  ok: false;
  summary: string;
  addressCount: number;
  failureKind: "private_network" | "timeout";
}> {
  try {
    const parsed = new URL(url);
    if (isPrivateNetworkHost(parsed.hostname)) {
      return {
        ok: false,
        summary: "http.fetch refused a private or special-use network destination.",
        addressCount: 0,
        failureKind: "private_network"
      };
    }
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) throw new Error("public_network_lookup_timeout");
    const addresses = await promiseWithTimeout(
      lookup(parsed.hostname, { all: true, verbatim: true }),
      remainingMs,
      "public_network_lookup_timeout"
    );
    if (addresses.length === 0 || addresses.some((entry) => isPrivateNetworkHost(entry.address))) {
      return {
        ok: false,
        summary: "http.fetch refused a hostname that does not resolve exclusively to public addresses.",
        addressCount: addresses.length,
        failureKind: "private_network"
      };
    }
    return {
      ok: true,
      summary: "Destination resolves only to public addresses.",
      addressCount: addresses.length,
      address: addresses[0]!.address
    };
  } catch (error) {
    const timedOut = errorMessage(error) === "public_network_lookup_timeout";
    return {
      ok: false,
      summary: timedOut
        ? "http.fetch timed out while verifying the public network destination."
        : "http.fetch could not verify the destination as public.",
      addressCount: 0,
      failureKind: timedOut ? "timeout" : "private_network"
    };
  }
}

function runPinnedPublicHttpFetch(args: {
  url: string;
  responseType: string;
  maxChars: number;
  timeoutMs: number;
  deadlineAt: number;
  address: string;
}): Promise<ToolResult> {
  return new Promise((resolveResult) => {
    const remainingMs = args.deadlineAt - Date.now();
    if (remainingMs <= 0) {
      resolveResult(pinnedHttpTimeoutResult(args));
      return;
    }
    const url = new URL(args.url);
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (result: ToolResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveResult(result);
    };
    const requestOptions = {
      protocol: url.protocol,
      hostname: args.address,
      port: url.port || undefined,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      headers: {
        Host: url.host,
        "User-Agent": "LocalAgent/0.1",
        "Accept-Encoding": "identity"
      },
      ...(url.protocol === "https:" ? { servername: url.hostname } : {})
    };
    const clientRequest = request(requestOptions, (response) => {
      const status = response.statusCode ?? 0;
      const statusText = response.statusMessage ?? "";
      if (status >= 300 && status < 400) {
        finish(toolResult("http.fetch", false, `http.fetch refused an unverified redirect from ${publicUrlTarget(args.url)}.`, {
          url: publicUrlTarget(args.url),
          status,
          status_text: statusText,
          redirect_blocked: true
        }, "none", "redirect_blocked"));
        response.destroy();
        clientRequest.destroy();
        return;
      }
      response.setEncoding("utf8");
      let body = "";
      let responseChars = 0;
      response.on("data", (chunk: string) => {
        responseChars += chunk.length;
        if (body.length < args.maxChars) body += chunk.slice(0, args.maxChars - body.length);
      });
      response.on("end", () => {
        const bodyTruncated = responseChars > body.length;
        const renderedBody = bodyTruncated ? truncateOutput(body, args.maxChars) : body;
        const ok = status >= 200 && status < 300;
        const contentType = Array.isArray(response.headers["content-type"])
          ? response.headers["content-type"].join(", ")
          : response.headers["content-type"] ?? null;
        finish(toolResult("http.fetch", ok, `Fetched ${publicUrlTarget(args.url)}: ${status} ${statusText}.`, {
          url: publicUrlTarget(args.url),
          status,
          status_text: statusText,
          response_type: args.responseType,
          max_chars: args.maxChars,
          timeout_ms: args.timeoutMs,
          timed_out: false,
          response_chars: responseChars,
          returned_body_chars: renderedBody.length,
          body_truncated: bodyTruncated,
          content_type: contentType,
          body: args.responseType === "json" ? parseMaybeJson(renderedBody) : renderedBody
        }, "none", ok ? undefined : "http_status"));
      });
      response.on("error", (error) => {
        finish(toolResult("http.fetch", false, `http.fetch failed: ${errorMessage(error)}`, {
          url: publicUrlTarget(args.url),
          response_type: args.responseType,
          max_chars: args.maxChars,
          timeout_ms: args.timeoutMs,
          timed_out: false,
          error: errorMessage(error)
        }, "none", "fetch_error"));
      });
    });
    const requestRemainingMs = args.deadlineAt - Date.now();
    timer = setTimeout(() => {
      timedOut = true;
      clientRequest.destroy(new Error(`http.fetch timed out after ${args.timeoutMs}ms.`));
    }, Math.max(0, requestRemainingMs));
    clientRequest.on("error", (error) => {
      finish(toolResult("http.fetch", false, timedOut
        ? `http.fetch timed out after ${args.timeoutMs}ms.`
        : `http.fetch failed: ${errorMessage(error)}`, {
        url: publicUrlTarget(args.url),
        response_type: args.responseType,
        max_chars: args.maxChars,
        timeout_ms: args.timeoutMs,
        timed_out: timedOut,
        error: errorMessage(error)
      }, "none", timedOut ? "timeout" : "fetch_error"));
    });
    clientRequest.end();
  });
}

function pinnedHttpTimeoutResult(args: { url: string; responseType: string; maxChars: number; timeoutMs: number }): ToolResult {
  return toolResult("http.fetch", false, `http.fetch timed out after ${args.timeoutMs}ms.`, {
    url: publicUrlTarget(args.url),
    response_type: args.responseType,
    max_chars: args.maxChars,
    timeout_ms: args.timeoutMs,
    timed_out: true,
    error: `http.fetch timed out after ${args.timeoutMs}ms.`
  }, "none", "timeout");
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(timeoutMessage)), timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolvePromise(value);
    }, (error: unknown) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });
}

function publicUrlTarget(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 2_000);
  } catch {
    return "(invalid URL)";
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
  const purpose = parseCommandPurpose(args.purpose);
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
  if (!purpose) {
    return toolResult("command.run", false, "command.run purpose must be execute or verification.", { purpose: args.purpose }, sideEffectLevel, "invalid_request");
  }
  if (purpose === "verification" && cwdScope !== "repo") {
    return toolResult("command.run", false, "command.run verification purpose requires cwd=repo for harness-owned Git snapshots.", { purpose, cwd: cwdScope }, sideEffectLevel, "invalid_request");
  }
  if (!envResult.ok) {
    return toolResult("command.run", false, envResult.summary, envResult.output, sideEffectLevel, "invalid_request");
  }

  const gitCommitRequested = command === "git" && commandArgs[0] === "commit";
  if (gitCommitRequested && commandArgs.includes("--dry-run")) {
    return toolResult("command.run", false, "command.run refuses git commit --dry-run because it cannot produce a commit change.", {
      command,
      args: commandArgs,
      cwd: cwdScope
    }, sideEffectLevel, "invalid_request");
  }

  const commandCwd = cwdScope === "repo" ? context.store.repoRoot : context.store.stateRoot;
  let verificationBefore: GitWorkspaceChanges | null = null;
  if (purpose === "verification") {
    try {
      verificationBefore = await inspectGitWorkspaceChanges(commandCwd);
    } catch (error) {
      return toolResult("command.run", false, "command.run verification could not capture the pre-run Git workspace snapshot.", {
        purpose,
        error: errorMessage(error)
      }, sideEffectLevel, "verification_failed");
    }
  }
  const commitBefore = gitCommitRequested
    ? await gitText(commandCwd, ["rev-parse", "HEAD"]).catch(() => null)
    : null;
  const result = await runLocalCommand(command, commandArgs, {
    cwd: commandCwd,
    timeoutMs,
    maxOutputChars,
    env: envResult.env
  });
  const envAudit = envResult.audit;
  const commandSucceeded = result.exitCode === 0 && !result.timedOut;
  const verificationAfter = purpose === "verification"
    ? await inspectGitWorkspaceChanges(commandCwd).catch(() => null)
    : null;
  const verificationWorkspaceUnchanged = purpose === "verification"
    ? verificationAfter !== null
      && verificationBefore!.headCommit === verificationAfter.headCommit
      && verificationBefore!.workspaceSha256 === verificationAfter.workspaceSha256
    : null;
  const verificationPassed = purpose !== "verification"
    || (commandSucceeded && verificationWorkspaceUnchanged === true);
  const commitAfter = commandSucceeded && gitCommitRequested
    ? await gitText(commandCwd, ["rev-parse", "HEAD"]).catch(() => null)
    : null;
  const commitCreated = !gitCommitRequested || (commitAfter !== null && commitAfter !== commitBefore);
  const ok = commandSucceeded && commitCreated && verificationPassed;
  const observedChange = commandSucceeded && commitCreated && gitCommitRequested
    ? { kind: "git_commit" as const, identity: commitAfter! }
    : null;
  const verificationChanges = purpose === "verification" && verificationAfter
    ? commandVerificationChanges(verificationBefore!, verificationAfter)
    : [];
  const summary = purpose === "verification" && verificationAfter === null
    ? "command.run verification could not capture the post-run Git workspace snapshot."
    : purpose === "verification" && commandSucceeded && verificationWorkspaceUnchanged === false
      ? "command.run verification changed the Git-visible workspace and cannot count as verification evidence."
      : commandSucceeded && gitCommitRequested && !commitCreated
        ? "git commit exited successfully but did not create a new commit."
        : result.summary;
  return toolResult("command.run", ok, summary, {
    command,
    args: commandArgs,
    cwd: cwdScope,
    purpose,
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
        purpose: args.purpose ?? "execute",
        side_effect_level: args.side_effect_level
      },
      effective: {
        args_count: commandArgs.length,
        timeout_ms: timeoutMs,
        max_output_chars: maxOutputChars,
        cwd: cwdScope,
        purpose,
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
    ...(purpose === "verification" ? {
      verification: {
        purpose,
        status: verificationPassed ? "passed" : "failed",
        process_succeeded: commandSucceeded,
        workspace_unchanged: verificationWorkspaceUnchanged,
        before: verificationBefore ? {
          head_commit: verificationBefore.headCommit,
          status_sha256: verificationBefore.statusSha256,
          workspace_sha256: verificationBefore.workspaceSha256
        } : null,
        after: verificationAfter ? {
          head_commit: verificationAfter.headCommit,
          status_sha256: verificationAfter.statusSha256,
          workspace_sha256: verificationAfter.workspaceSha256
        } : null,
        boundary: "Harness-owned process result plus fixed pre/post Git HEAD and bounded Git-visible content fingerprints; purpose alone is not verification evidence."
      },
      ...(verificationChanges.length > 0 ? { changes: verificationChanges } : {})
    } : {}),
    ...(observedChange ? { change: observedChange } : {}),
    stdout: result.stdout,
    stderr: result.stderr
  }, sideEffectLevel, ok ? undefined : !commandSucceeded
    ? processFailureKind(result)
    : !verificationPassed
      ? "verification_failed"
      : commandSucceeded && gitCommitRequested
        ? "change_not_observed"
        : processFailureKind(result));
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

interface GitWorkspaceChanges {
  available: boolean;
  changedPaths: string[];
  headCommit: string | null;
  statusSha256: string;
  workspaceSha256: string;
  pathSha256: Record<string, string>;
}

export async function assertGoalBoundToolAuthority(
  action: EffectAction,
  expected: GoalRepositoryAuthority,
  store: AgentStore
): Promise<void> {
  if (action.tool !== CODEX_RUN_TOOL) return;
  const authorityStore = new AgentStore(expected.repo_root, store.stateRoot);
  const request = parseCodexRunRequest(action.arguments);
  if (request.mode === "new") {
    const actual = await inspectCodexGitAuthority(authorityStore.repoRoot, request.worktree, request.cwd);
    assertCodexGoalAuthority(expected, {
      repoRoot: actual.repoRoot,
      gitCommonDir: actual.gitCommonDir,
      worktree: actual.worktree,
      branch: actual.branch,
      baseCommit: request.base_commit
    });
    assertGoalCodexAutoSelection(request.model, request.reasoning_effort);
    return;
  }

  const prior = parseVerifiableCodexThreadRecord(
    await authorityStore.readStateJson<unknown>(codexThreadRecordPath(request.thread_id))
  );
  if (!prior
    || prior.thread_id !== request.thread_id
    || prior.authority_digest !== request.authority_digest) {
    throw new Error("codex.run resume handle is not a verifiable persisted authority record.");
  }
  assertCodexGoalAuthority(expected, {
    repoRoot: prior.authority.repo_root,
    gitCommonDir: prior.authority.git_common_dir,
    worktree: prior.authority.isolated_worktree,
    branch: prior.authority.branch,
    baseCommit: prior.authority.base_commit
  });
  assertGoalCodexAutoSelection(prior.authority.model, prior.authority.reasoning_effort);
}

function assertGoalCodexAutoSelection(model: string, reasoningEffort: string): void {
  if (model !== "auto" || reasoningEffort !== "auto") {
    throw new Error("GoalRuntime codex.run selection must use auto for both model and reasoning_effort; start a new auto-selected thread instead of pinning provider details.");
  }
}

function assertCodexGoalAuthority(
  expected: GoalRepositoryAuthority,
  actual: {
    repoRoot: string;
    gitCommonDir: string;
    worktree: string;
    branch: string;
    baseCommit: string;
  }
): void {
  if (actual.repoRoot !== expected.repo_root
    || actual.gitCommonDir !== expected.git_common_dir
    || actual.worktree !== expected.worktree
    || actual.branch !== expected.branch
    || actual.baseCommit !== expected.start_head_commit) {
    throw new Error("codex.run target does not match the Goal's bound repository/worktree authority and start HEAD.");
  }
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

  let workspaceBefore: GitWorkspaceChanges;
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
    changedPaths: [],
    headCommit: null,
    statusSha256: "",
    workspaceSha256: "",
    pathSha256: {}
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
  if (!workspaceAfter.available) {
    return codexFailure("change_not_observed", "Codex post-run workspace inspection was unavailable.", failedCodexStructuredResult(
      "Codex workspace attribution is unavailable.",
      "The main harness could not obtain the fixed post-run Git status snapshot.",
      "Inspect the isolated worktree directly and do not claim delegated completion until canonical attribution is restored."
    ), metadata);
  }
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
    ...codexAttributedOutput(metadata, structured)
  }, "local_write", ok ? undefined : structured.status === "blocked" ? "codex_blocked" : "codex_failed");
}

function codexFailure(
  failureKind: ToolFailureKind,
  summary: string,
  result: CodexStructuredResult,
  metadata: Record<string, unknown> = {}
): ToolResult {
  return toolResult(CODEX_RUN_TOOL, false, summary, {
    ...codexAttributedOutput(metadata, result)
  }, "local_write", failureKind);
}

function codexAttributedOutput(
  metadata: Record<string, unknown>,
  result: CodexStructuredResult
): Record<string, unknown> {
  const workspace = isPlainRecord(metadata.workspace_changes) ? metadata.workspace_changes : null;
  if (!workspace) return { ...metadata, status: result.status, result };
  const observed = stringArrayValue(workspace.introduced_changed_paths);
  const headBefore = typeof workspace.head_before === "string" ? workspace.head_before : null;
  const headAfter = typeof workspace.head_after === "string" ? workspace.head_after : null;
  const headChanged = workspace.head_changed === true && headAfter !== null;
  const claimed = [...new Set(result.changed_files)].sort();
  const observedSet = new Set(observed);
  const claimedSet = new Set(claimed);
  const available = workspace.available === true;
  const missingFromClaim = observed.filter((path) => !claimedSet.has(path));
  const unobservedClaims = claimed.filter((path) => !observedSet.has(path));
  return {
    ...metadata,
    changes: [
      ...(headChanged ? [{ kind: "git_commit", identity: headAfter }] : []),
      ...observed.map((path) => ({ kind: "workspace_path", identity: path }))
    ],
    workspace_change_attribution: {
      status: !available
        ? "unavailable"
        : missingFromClaim.length === 0 && unobservedClaims.length === 0
          ? "claim_matched"
          : "claim_mismatch",
      observed_introduced_paths: observed,
      claimed_changed_paths: claimed,
      missing_from_claim: missingFromClaim,
      unobserved_claims: unobservedClaims,
      head_before: headBefore,
      head_after: headAfter,
      head_changed: headChanged,
      authority: "Only fixed live Git status and HEAD snapshots create canonical workspace_path or git_commit changes; Codex changed_files is an untrusted diagnostic claim."
    },
    status: result.status,
    result
  };
}

function codexExecutionMetadata(
  authority: CodexAuthoritySnapshot,
  authorityDigest: string,
  threadId: string | null,
  result: CodexProcessResult,
  workspaceBefore: GitWorkspaceChanges,
  workspaceAfter: GitWorkspaceChanges,
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
      head_before: workspaceBefore.headCommit,
      head_after: workspaceAfter.headCommit,
      head_changed: workspaceBefore.headCommit !== null
        && workspaceAfter.headCommit !== null
        && workspaceBefore.headCommit !== workspaceAfter.headCommit,
      boundary: "fixed live git status --porcelain=v1 -z and HEAD snapshots; includes tracked and untracked paths without reading file bodies"
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

async function inspectGitWorkspaceChanges(repoRoot: string): Promise<GitWorkspaceChanges> {
  const { output, allPaths } = await inspectGitStatusPaths(repoRoot);
  if (allPaths.length > MAX_VERIFICATION_CHANGED_PATHS) {
    throw new Error(`Git workspace snapshot exceeds ${MAX_VERIFICATION_CHANGED_PATHS} changed paths.`);
  }
  const visibleOutput = await gitOutput(
    repoRoot,
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    4 * 1024 * 1024
  );
  const visiblePaths = [...new Set(visibleOutput.split("\0").filter(Boolean))].sort();
  if (visiblePaths.length > MAX_VERIFICATION_SNAPSHOT_FILES) {
    throw new Error(`Git workspace snapshot exceeds ${MAX_VERIFICATION_SNAPSHOT_FILES} Git-visible files.`);
  }
  const indexSha256 = await gitStreamSha256(repoRoot, ["ls-files", "--stage", "-v", "-z"], MAX_VERIFICATION_SNAPSHOT_BYTES);
  const workspace = createHash("sha256");
  const statusSha256 = sha256(output);
  workspace.update(`status\0${statusSha256}\0index\0${indexSha256}\0`);
  const pathSha256: Record<string, string> = Object.create(null);
  let observedBytes = 0;
  for (const path of visiblePaths) {
    const fingerprint = await gitVisiblePathSha256(repoRoot, path, MAX_VERIFICATION_SNAPSHOT_BYTES - observedBytes);
    observedBytes += fingerprint.bytes;
    pathSha256[path] = fingerprint.sha256;
    workspace.update(`path\0${JSON.stringify(path)}\0${fingerprint.sha256}\0`);
  }
  return {
    available: true,
    changedPaths: allPaths.slice(0, MAX_CODEX_WORKSPACE_PATH_CHANGES),
    headCommit: await gitText(repoRoot, ["rev-parse", "HEAD"]),
    statusSha256,
    workspaceSha256: workspace.digest("hex"),
    pathSha256
  };
}

async function inspectCodexWorkspaceChanges(repoRoot: string): Promise<GitWorkspaceChanges> {
  const { output, allPaths } = await inspectGitStatusPaths(repoRoot);
  const statusSha256 = sha256(output);
  return {
    available: true,
    changedPaths: allPaths.slice(0, MAX_CODEX_WORKSPACE_PATH_CHANGES),
    headCommit: await gitText(repoRoot, ["rev-parse", "HEAD"]),
    statusSha256,
    workspaceSha256: statusSha256,
    pathSha256: {}
  };
}

async function inspectGitStatusPaths(repoRoot: string): Promise<{ output: string; allPaths: string[] }> {
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
  const allPaths = [...paths].sort();
  return { output, allPaths };
}

async function gitVisiblePathSha256(
  repoRoot: string,
  path: string,
  remainingBytes: number
): Promise<{ sha256: string; bytes: number }> {
  const absolutePath = resolve(repoRoot, path);
  const withinRepo = relative(repoRoot, absolutePath);
  if (withinRepo.startsWith("..") || withinRepo.startsWith("/")) {
    throw new Error("Git workspace snapshot path escaped the repository root.");
  }
  let metadata;
  try {
    metadata = await lstat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { sha256: sha256("missing"), bytes: 0 };
    }
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    const target = await readlink(absolutePath);
    return { sha256: sha256(`symlink\0${target}`), bytes: Buffer.byteLength(target) };
  }
  if (!metadata.isFile()) {
    throw new Error(`Git workspace snapshot refuses non-file changed path: ${path}`);
  }
  const hash = createHash("sha256");
  hash.update(`file\0${metadata.mode & 0o777}\0`);
  let bytes = 0;
  for await (const chunk of createReadStream(absolutePath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > remainingBytes) {
      throw new Error(`Git workspace snapshot exceeds ${MAX_VERIFICATION_SNAPSHOT_BYTES} content bytes.`);
    }
    hash.update(buffer);
  }
  return { sha256: hash.digest("hex"), bytes };
}

function gitStreamSha256(cwd: string, args: string[], maxBytes: number): Promise<string> {
  return new Promise((resolveDigest, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...minimalEnv(), LANG: "C", LC_ALL: "C" }
    });
    const hash = createHash("sha256");
    let observedBytes = 0;
    let stderr = "";
    let limitError: Error | null = null;
    child.stdout.on("data", (chunk: Buffer) => {
      observedBytes += chunk.length;
      if (observedBytes > maxBytes) {
        limitError = new Error(`Fixed Git snapshot output exceeds ${maxBytes} bytes.`);
        child.kill("SIGKILL");
        return;
      }
      hash.update(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(0, 300);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (limitError) {
        reject(limitError);
        return;
      }
      if (exitCode !== 0) {
        reject(new Error(`Fixed Git snapshot failed: ${stderr.trim() || `exit ${exitCode}`}`));
        return;
      }
      resolveDigest(hash.digest("hex"));
    });
  });
}

function commandVerificationChanges(
  before: GitWorkspaceChanges,
  after: GitWorkspaceChanges
): Array<{ kind: "git_commit" | "workspace_path"; identity: string }> {
  const contentChanged = after.workspaceSha256 !== before.workspaceSha256;
  const visiblePaths = [...new Set([...Object.keys(before.pathSha256), ...Object.keys(after.pathSha256)])];
  const changedPaths = visiblePaths.filter((path) => before.pathSha256[path] !== after.pathSha256[path]);
  const attributablePaths = changedPaths.length > 0 || !contentChanged
    ? changedPaths
    : [...new Set([...before.changedPaths, ...after.changedPaths])];
  return [
    ...(after.headCommit && after.headCommit !== before.headCommit
      ? [{ kind: "git_commit" as const, identity: after.headCommit }]
      : []),
    ...attributablePaths
      .slice(0, MAX_CODEX_WORKSPACE_PATH_CHANGES)
      .map((path) => ({ kind: "workspace_path" as const, identity: path }))
  ];
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

function gitOutput(cwd: string, args: string[], maxBuffer = 1_000_000): Promise<string> {
  return new Promise((resolveText, reject) => {
    execFile("git", args, { cwd, env: { ...minimalEnv(), LANG: "C", LC_ALL: "C" }, encoding: "utf8", maxBuffer }, (error, stdout, stderr) => {
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

function parseCommandPurpose(value: unknown): CommandPurpose | null {
  if (value === undefined || value === "execute") return "execute";
  if (value === "verification") return value;
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
