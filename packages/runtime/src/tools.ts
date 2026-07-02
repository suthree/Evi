import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
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

export interface ToolExecutionContext {
  store: AgentStore;
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
  if (tool === "code.execute_node") {
    return runCodeExecuteNode(args, context);
  }

  return toolResult(tool || "unknown", false, `Unsupported tool: ${tool || "(missing)"}`, {
    received_payload: payload
  }, "none");
}

async function runFileRead(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const scope = stringValue(args.scope) || "repo";
  const relPath = stringValue(args.path);
  const maxChars = intValue(args.max_chars, 12000);
  const invalid = validateRelativePath(relPath);
  if (invalid) {
    return toolResult("file.read", false, invalid, { path: relPath }, "none");
  }
  if (scope !== "repo" && scope !== "state") {
    return toolResult("file.read", false, `Unsupported file.read scope: ${scope}`, { scope }, "none");
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
    return toolResult("file.write_state", false, invalid, { path: relPath }, "local_write");
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
    return toolResult("file.write_repo", false, invalid, { path: relPath }, "local_write");
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
    return toolResult("repo.search", false, "repo.search requires a non-empty query.", {}, "none");
  }
  const invalid = validateRelativePath(searchPath);
  if (invalid) {
    return toolResult("repo.search", false, invalid, { path: searchPath }, "none");
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
    return toolResult("repo.search", rgResult.exitCode === 0 || rgResult.exitCode === 1, `repo.search found ${matches.length} result(s) for "${query}".`, {
      query,
      path: searchPath,
      engine: "rg",
      exitCode: rgResult.exitCode,
      matches,
      truncated: rgResult.truncated || rgResult.stdout.split(/\r?\n/).filter(Boolean).length > maxResults,
      stderr: rgResult.stderr
    }, "none");
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
    matches: fallback.matches,
    truncated: fallback.truncated
  }, "none");
}

async function runHttpFetch(args: Record<string, unknown>): Promise<ToolResult> {
  const url = stringValue(args.url);
  const responseType = stringValue(args.response_type) || "text";
  const maxChars = intValue(args.max_chars, 12000);
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return toolResult("http.fetch", false, "http.fetch requires an http(s) URL.", { url }, "none");
  }
  const response = await fetch(url, {
    headers: {
      "User-Agent": "LocalAgent/0.1"
    }
  });
  const text = await response.text();
  const body = text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}\n...` : text;
  return toolResult("http.fetch", response.ok, `Fetched ${url}: ${response.status} ${response.statusText}.`, {
    url,
    status: response.status,
    status_text: response.statusText,
    response_type: responseType,
    body: responseType === "json" ? parseMaybeJson(body) : body
  }, "none");
}

async function runCommandRun(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const command = stringValue(args.command);
  const commandArgs = stringArrayValue(args.args).slice(0, 64);
  const cwdScope = stringValue(args.cwd) || "repo";
  const timeoutMs = Math.min(Math.max(intValue(args.timeout_ms, 30000), 1000), 300000);
  const maxOutputChars = Math.min(Math.max(intValue(args.max_output_chars, 12000), 1000), 50000);
  const sideEffectLevel = parseSideEffectLevel(args.side_effect_level);
  const envResult = buildCommandEnv(args);

  if (!command.trim()) {
    return toolResult("command.run", false, "command.run requires a command.", {}, "none");
  }
  if (command.includes("/") || command.includes("\\") || command.includes("\0")) {
    return toolResult("command.run", false, "command.run command must be a binary name, not a path or shell string.", { command }, "none");
  }
  if (cwdScope !== "repo" && cwdScope !== "state") {
    return toolResult("command.run", false, `Unsupported command.run cwd: ${cwdScope}`, { cwd: cwdScope }, "none");
  }
  if (!sideEffectLevel) {
    return toolResult("command.run", false, "command.run requires a valid side_effect_level.", { side_effect_level: args.side_effect_level }, "none");
  }
  if (!envResult.ok) {
    return toolResult("command.run", false, envResult.summary, envResult.output, sideEffectLevel);
  }

  const result = await runLocalCommand(command, commandArgs, {
    cwd: cwdScope === "repo" ? context.store.repoRoot : context.store.stateRoot,
    timeoutMs,
    maxOutputChars,
    env: envResult.env
  });
  return toolResult("command.run", result.exitCode === 0 && !result.timedOut, result.summary, {
    command,
    args: commandArgs,
    cwd: cwdScope,
    timeout_ms: timeoutMs,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr
  }, sideEffectLevel);
}

async function runCodeExecuteNode(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const code = stringValue(args.code);
  const timeoutMs = Math.min(Math.max(intValue(args.timeout_ms, 10000), 1000), 30000);
  const maxOutputChars = Math.min(Math.max(intValue(args.max_output_chars, 12000), 1000), 30000);
  if (!code.trim()) {
    return toolResult("code.execute_node", false, "No code provided.", {}, "local_reversible");
  }

  const result = await runNode(code, {
    cwd: context.store.stateRoot,
    timeoutMs,
    maxOutputChars
  });
  return toolResult("code.execute_node", result.exitCode === 0 && !result.timedOut, result.summary, result, "local_reversible");
}

function toolResult(
  tool: string,
  ok: boolean,
  summary: string,
  output: Record<string, unknown>,
  sideEffectLevel: ToolResult["side_effect_level"]
): ToolResult {
  return {
    id: newId("tool_result"),
    tool,
    ok,
    summary,
    output,
    side_effect_level: sideEffectLevel,
    created_at: utcNow()
  };
}

function validateRelativePath(path: string): string | null {
  if (!path) return "Path is required.";
  if (path.startsWith("/") || path.includes("..") || path.includes("\0")) {
    return "Path must be relative and must not contain '..'.";
  }
  return null;
}

function validateRepoWritePath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const base = basename(normalized);
  if (first === ".git" || first === "node_modules" || first === "dist" || first.startsWith(".local-runtime")) {
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
    "!dist/**",
    "--glob",
    "!.local-runtime*/**"
  ];
  for (const glob of options.globs) {
    args.push("--glob", glob);
  }
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
    || path.startsWith(".local-runtime");
}

function runNode(
  code: string,
  options: { cwd: string; timeoutMs: number; maxOutputChars: number }
): Promise<{ exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; summary: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-"], {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = truncateOutput(stdout + chunk.toString("utf8"), options.maxOutputChars);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncateOutput(stderr + chunk.toString("utf8"), options.maxOutputChars);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        timedOut,
        stdout,
        stderr,
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
): Promise<{ exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; summary: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env
    });
    let stdout = "";
    let stderr = "";
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
        stdout,
        stderr: error.message,
        summary: `Command failed to start: ${error.message}`
      });
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = truncateOutput(stdout + chunk.toString("utf8"), options.maxOutputChars);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncateOutput(stderr + chunk.toString("utf8"), options.maxOutputChars);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        timedOut,
        stdout,
        stderr,
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

function buildCommandEnv(args: Record<string, unknown>): { ok: true; env: NodeJS.ProcessEnv } | { ok: false; summary: string; output: Record<string, unknown> } {
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
  return {
    ok: true,
    env: {
      ...minimalEnv(),
      ...Object.fromEntries(Object.entries(requested).map(([key, value]) => [key, String(value)]))
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
