import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelClient, ModelRequest, ModelResponse } from "./model.js";

export interface CodexCliModelOptions {
  outputSchema: Record<string, unknown>;
  outputField?: string;
  profile?: "fast";
  model?: string;
  reasoningEffort?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
  command?: string;
}

export interface CodexExecInvocation {
  command: string;
  args: string[];
  cwd: string;
  stdin: string;
  timeoutMs: number;
  maxOutputChars: number;
}

export interface CodexExecResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputExceeded: boolean;
}

export interface CodexExecRunner {
  run(invocation: CodexExecInvocation): Promise<CodexExecResult>;
}

const ALLOWED_CODEX_ITEM_TYPES = new Set(["agent_message", "reasoning"]);

/** Stateless model substrate. GoalRuntime remains the only agent and effect owner. */
export class CodexCliModelClient implements ModelClient {
  private readonly options: Required<Pick<CodexCliModelOptions, "profile" | "timeoutMs" | "maxOutputChars" | "command">>
    & Omit<CodexCliModelOptions, "profile" | "timeoutMs" | "maxOutputChars" | "command">;

  constructor(
    options: CodexCliModelOptions,
    private readonly runner: CodexExecRunner = new NodeCodexExecRunner()
  ) {
    this.options = {
      ...options,
      profile: options.profile ?? "fast",
      timeoutMs: options.timeoutMs ?? 120_000,
      maxOutputChars: options.maxOutputChars ?? 64_000,
      command: options.command ?? "codex"
    };
  }

  async create(request: ModelRequest): Promise<ModelResponse> {
    const workspace = await mkdtemp(join(tmpdir(), "goal-cognition-"));
    const schemaPath = join(workspace, "goal-cognition.schema.json");
    try {
      await writeFile(schemaPath, `${JSON.stringify(this.options.outputSchema, null, 2)}\n`, "utf8");
      const args = buildCodexCliArgs({
        workspace,
        schemaPath,
        profile: this.options.profile,
        model: this.options.model,
        reasoningEffort: this.options.reasoningEffort
      });
      const result = await this.runner.run({
        command: this.options.command,
        args,
        cwd: workspace,
        stdin: renderCodexPrompt(request, this.options.outputField),
        timeoutMs: this.options.timeoutMs,
        maxOutputChars: this.options.maxOutputChars
      });
      if (result.timedOut) throw new Error(`Codex cognition timed out after ${this.options.timeoutMs}ms`);
      if (result.outputExceeded) throw new Error(`Codex cognition exceeded ${this.options.maxOutputChars} captured characters`);
      if (result.exitCode !== 0) {
        throw new Error(`Codex cognition exited with code ${result.exitCode ?? "unknown"}: ${boundedDiagnostic(result.stderr)}`);
      }
      const parsed = parseCodexJsonl(result.stdout);
      const outputText = this.options.outputField
        ? unwrapOutputField(parsed.outputText, this.options.outputField)
        : parsed.outputText;
      return {
        provider: "codex-cli",
        api: "exec",
        model: this.options.model ?? "codex-default",
        responseId: parsed.threadId,
        outputText,
        requestAttempts: 1,
        recoveredRequestFailures: [],
        raw: {
          thread_id: parsed.threadId,
          event_count: parsed.eventCount,
          ephemeral: true,
          sandbox: "read-only",
          tool_events: 0
        }
      };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

export class NodeCodexExecRunner implements CodexExecRunner {
  async run(invocation: CodexExecInvocation): Promise<CodexExecResult> {
    return new Promise<CodexExecResult>((resolve, reject) => {
      const child = spawn(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32"
      });
      const stdout = new BoundedCapture(invocation.maxOutputChars);
      const stderr = new BoundedCapture(invocation.maxOutputChars);
      let timedOut = false;
      let outputExceeded = false;
      let terminating = false;

      const terminate = (): void => {
        if (terminating) return;
        terminating = true;
        signalProcessTree(child.pid, "SIGTERM", () => child.kill("SIGTERM"));
        const killTimer = setTimeout(() => {
          signalProcessTree(child.pid, "SIGKILL", () => child.kill("SIGKILL"));
        }, 1_000);
        killTimer.unref();
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        terminate();
      }, invocation.timeoutMs);
      timeout.unref();

      child.stdout.on("data", (chunk: Buffer) => {
        if (!stdout.append(chunk.toString("utf8"))) {
          outputExceeded = true;
          terminate();
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (!stderr.append(chunk.toString("utf8"))) {
          outputExceeded = true;
          terminate();
        }
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", (exitCode, signal) => {
        clearTimeout(timeout);
        resolve({
          exitCode,
          signal,
          stdout: stdout.value(),
          stderr: stderr.value(),
          timedOut,
          outputExceeded
        });
      });
      child.stdin.end(invocation.stdin);
    });
  }
}

export function buildCodexCliArgs(input: {
  workspace: string;
  schemaPath: string;
  profile: "fast";
  model?: string;
  reasoningEffort?: string;
}): string[] {
  return [
    "exec",
    "--profile",
    input.profile,
    "--json",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--color",
    "never",
    "-c",
    "approval_policy=\"never\"",
    "-c",
    "web_search=\"disabled\"",
    "--output-schema",
    input.schemaPath,
    "-C",
    input.workspace,
    ...(input.model ? ["--model", input.model] : []),
    ...(input.reasoningEffort ? ["-c", `model_reasoning_effort=${JSON.stringify(input.reasoningEffort)}`] : []),
    "-"
  ];
}

function renderCodexPrompt(request: ModelRequest, outputField?: string): string {
  return [
    "This is a stateless cognition-only turn inside GoalRuntime.",
    "Do not call shell, file, MCP, Web, plan, image, or any other tool. Do not inspect the working directory.",
    "Use only the bounded input below and return exactly the JSON object required by the output schema.",
    ...(outputField
      ? [`Serialize the requested domain JSON object into the ${outputField} string field; do not add prose.`]
      : []),
    "",
    request.instructions,
    "",
    request.input
  ].join("\n");
}

function unwrapOutputField(outputText: string, field: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new Error(`Codex cognition returned invalid structured output: ${errorMessage(error)}`);
  }
  if (!isRecord(parsed) || typeof parsed[field] !== "string" || !parsed[field].trim()) {
    throw new Error(`Codex cognition structured output is missing non-empty ${field}`);
  }
  return parsed[field].trim();
}

function parseCodexJsonl(raw: string): { threadId: string | null; outputText: string; eventCount: number } {
  let threadId: string | null = null;
  let outputText: string | null = null;
  let eventCount = 0;
  for (const [index, line] of raw.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Codex cognition emitted invalid JSONL at line ${index + 1}: ${errorMessage(error)}`);
    }
    if (!isRecord(event)) throw new Error(`Codex cognition event at line ${index + 1} is not an object`);
    eventCount += 1;
    if (event.type === "thread.started" && typeof event.thread_id === "string") threadId = event.thread_id;
    if (event.type === "turn.failed" || event.type === "error") {
      throw new Error(`Codex cognition reported ${event.type}: ${boundedDiagnostic(JSON.stringify(event))}`);
    }
    if (typeof event.type === "string" && event.type.startsWith("item.")) {
      if (!isRecord(event.item) || typeof event.item.type !== "string") {
        throw new Error(`Codex cognition emitted an untyped item event at line ${index + 1}`);
      }
      if (!ALLOWED_CODEX_ITEM_TYPES.has(event.item.type)) {
        throw new Error(`Codex cognition emitted forbidden item event: ${event.item.type}`);
      }
      if (event.type === "item.completed" && event.item.type === "agent_message" && typeof event.item.text === "string") {
        outputText = event.item.text;
      }
    }
  }
  if (!outputText?.trim()) throw new Error("Codex cognition returned no completed agent message");
  return { threadId, outputText: outputText.trim(), eventCount };
}

class BoundedCapture {
  private captured = "";
  private observed = 0;

  constructor(private readonly limit: number) {}

  append(value: string): boolean {
    this.observed += value.length;
    if (this.captured.length < this.limit) {
      this.captured += value.slice(0, this.limit - this.captured.length);
    }
    return this.observed <= this.limit;
  }

  value(): string {
    return this.captured;
  }
}

function signalProcessTree(pid: number | undefined, signal: NodeJS.Signals, fallback: () => boolean): void {
  if (!pid) {
    fallback();
    return;
  }
  try {
    if (process.platform === "win32") fallback();
    else process.kill(-pid, signal);
  } catch {
    fallback();
  }
}

function boundedDiagnostic(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/giu, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, "[REDACTED]")
    .replace(/(api[_-]?key|token|secret)(\s*[=:]\s*)[^\s,;]+/giu, "$1$2[REDACTED]")
    .slice(0, 1_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
