import { createHash } from "node:crypto";
import { DEFAULT_CONTEXT_TOTAL_HARD_LIMIT_CHARS } from "./context_budget.js";

export const CODEX_RUN_TOOL = "codex.run" as const;
export const CODEX_RUN_PROFILES = ["fast"] as const;
export const CODEX_RUN_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"] as const;
export const CODEX_RUN_SERVICE_TIERS = ["fast"] as const;
export const CODEX_RUN_SANDBOXES = ["read-only", "workspace-write"] as const;
export const CODEX_RUN_APPROVAL_POLICIES = ["never"] as const;
export const CODEX_RUN_DELEGATION_MODES = ["single", "parallel"] as const;
export const CODEX_RUN_INTEGRATION_OWNER = "main_codex_thread" as const;

export type CodexRunMode = "new" | "resume";
export type CodexRunStatus = "done" | "blocked" | "failed";
export type CodexRunModel = string;
export type CodexRunReasoningEffort = typeof CODEX_RUN_REASONING_EFFORTS[number];
export type CodexRunSandbox = typeof CODEX_RUN_SANDBOXES[number];

export interface CodexDelegationStrategy {
  readonly mode: typeof CODEX_RUN_DELEGATION_MODES[number];
  readonly max_subagents: number;
  readonly independent_workstreams: readonly string[];
  readonly integration_owner: typeof CODEX_RUN_INTEGRATION_OWNER;
}

export interface CodexRunBudgets {
  readonly timeout_ms: number;
  readonly max_output_chars: number;
  readonly max_context_chars: number;
  readonly max_tool_calls: number;
  readonly max_retries: 0;
}

export interface CodexRunBudgetDefaults {
  readonly max_output_chars?: number;
}

export interface CodexAuthoritySnapshot {
  readonly schema_version: 2;
  readonly repo_root: string;
  readonly git_common_dir: string;
  readonly base_commit: string;
  readonly head_commit: string;
  readonly branch: string;
  readonly isolated_worktree: string;
  readonly cwd: string;
  readonly model: CodexRunModel;
  readonly profile: "fast";
  readonly reasoning_effort: CodexRunReasoningEffort;
  readonly service_tier: "fast";
  readonly sandbox: CodexRunSandbox;
  readonly approval_policy: "never";
  readonly mode: CodexRunMode;
  readonly thread_id: string | null;
  readonly selection_rationale: string;
  readonly task_shape: string;
  readonly delegation_strategy: CodexDelegationStrategy;
  readonly original_prompt_sha256: string;
  readonly effective_prompt_sha256: string;
  readonly output_schema_sha256: string;
  readonly budgets: CodexRunBudgets;
}

export interface CodexStructuredResult {
  readonly status: CodexRunStatus;
  readonly summary: string;
  readonly changed_files: readonly string[];
  readonly tests: readonly string[];
  readonly blockers: readonly string[];
  readonly next_action: string;
  readonly completion_authority: "main_harness";
}

export interface CodexNewRequest {
  readonly mode: "new";
  readonly prompt: string;
  readonly base_commit: string;
  readonly branch: string;
  readonly worktree: string;
  readonly cwd: string;
  readonly model: CodexRunModel;
  readonly profile: "fast";
  readonly reasoning_effort: CodexRunReasoningEffort;
  readonly service_tier: "fast";
  readonly sandbox: CodexRunSandbox;
  readonly approval_policy: "never";
  readonly selection_rationale: string;
  readonly task_shape: string;
  readonly delegation_strategy: CodexDelegationStrategy;
  readonly budgets: CodexRunBudgets;
}

export interface CodexResumeRequest {
  readonly mode: "resume";
  readonly prompt: string;
  readonly thread_id: string;
  readonly authority_digest: string;
}

export type CodexRunRequest = CodexNewRequest | CodexResumeRequest;

const DEFAULT_BUDGETS = Object.freeze({
  timeout_ms: 300_000,
  max_context_chars: 40_000,
  max_tool_calls: 32,
  max_retries: 0
});
const ESTIMATED_CHARS_PER_MODEL_OUTPUT_TOKEN = 4;

export const CODEX_STRUCTURED_RESULT_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "summary",
    "changed_files",
    "tests",
    "blockers",
    "next_action",
    "completion_authority"
  ],
  properties: {
    status: { type: "string", enum: ["done", "blocked", "failed"] },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    changed_files: {
      type: "array",
      maxItems: 100,
      items: { type: "string", minLength: 1, maxLength: 500 }
    },
    tests: {
      type: "array",
      maxItems: 50,
      items: { type: "string", minLength: 1, maxLength: 1000 }
    },
    blockers: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 1000 }
    },
    next_action: { type: "string", minLength: 1, maxLength: 1000 },
    completion_authority: { type: "string", const: "main_harness" }
  }
});

export const CODEX_STRUCTURED_RESULT_SCHEMA_TEXT = `${JSON.stringify(CODEX_STRUCTURED_RESULT_SCHEMA, null, 2)}\n`;
export const CODEX_STRUCTURED_RESULT_SCHEMA_SHA256 = sha256(CODEX_STRUCTURED_RESULT_SCHEMA_TEXT);

const NEW_KEYS = new Set([
  "mode", "prompt", "base_commit", "branch", "worktree", "cwd", "model", "profile",
  "reasoning_effort", "service_tier", "sandbox", "approval_policy", "selection_rationale",
  "task_shape", "delegation_strategy", "budgets"
]);
const RESUME_KEYS = new Set(["mode", "prompt", "thread_id", "authority_digest"]);
const BUDGET_KEYS = new Set(["timeout_ms", "max_output_chars", "max_context_chars", "max_tool_calls", "max_retries"]);
const DELEGATION_STRATEGY_KEYS = new Set(["mode", "max_subagents", "independent_workstreams", "integration_owner"]);
const AUTHORITY_SNAPSHOT_KEYS = new Set([
  "schema_version", "repo_root", "git_common_dir", "base_commit", "head_commit", "branch",
  "isolated_worktree", "cwd", "model", "profile", "reasoning_effort", "service_tier",
  "sandbox", "approval_policy", "mode", "thread_id", "selection_rationale", "task_shape",
  "delegation_strategy", "original_prompt_sha256", "effective_prompt_sha256",
  "output_schema_sha256", "budgets"
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_MODEL_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function parseCodexRunRequest(
  value: Record<string, unknown>,
  defaults: CodexRunBudgetDefaults = {}
): CodexRunRequest {
  const mode = value.mode;
  if (mode !== "new" && mode !== "resume") throw new Error("codex.run mode must be new or resume.");
  assertOnlyKeys(value, mode === "new" ? NEW_KEYS : RESUME_KEYS, "codex.run");
  const prompt = requiredString(value.prompt, "prompt", 1, 100_000);
  if (mode === "resume") {
    const threadId = requiredString(value.thread_id, "thread_id", 1, 100);
    if (!UUID_PATTERN.test(threadId)) throw new Error("codex.run thread_id must be a UUID.");
    const authorityDigest = requiredString(value.authority_digest, "authority_digest", 64, 64);
    if (!DIGEST_PATTERN.test(authorityDigest)) throw new Error("codex.run authority_digest must be a SHA-256 digest.");
    return Object.freeze({ mode, prompt, thread_id: threadId, authority_digest: authorityDigest });
  }

  const baseCommit = requiredString(value.base_commit, "base_commit", 40, 40);
  if (!SHA_PATTERN.test(baseCommit)) throw new Error("codex.run base_commit must be a full lowercase Git commit SHA.");
  const model = safeModelToken(value.model);
  const profile = allowlisted(value.profile ?? "fast", CODEX_RUN_PROFILES, "profile");
  const reasoningEffort = allowlisted(value.reasoning_effort, CODEX_RUN_REASONING_EFFORTS, "reasoning_effort");
  const serviceTier = allowlisted(value.service_tier ?? "fast", CODEX_RUN_SERVICE_TIERS, "service_tier");
  const sandbox = allowlisted(value.sandbox ?? "workspace-write", CODEX_RUN_SANDBOXES, "sandbox");
  const approvalPolicy = allowlisted(value.approval_policy ?? "never", CODEX_RUN_APPROVAL_POLICIES, "approval_policy");
  const selectionRationale = requiredString(value.selection_rationale, "selection_rationale", 1, 2000);
  const taskShape = requiredString(value.task_shape, "task_shape", 1, 2000);
  const delegationStrategy = parseCodexDelegationStrategy(value.delegation_strategy);
  const budgets = parseBudgets(value.budgets, defaults);
  if (prompt.length > budgets.max_context_chars) throw new Error("codex.run prompt exceeds max_context_chars.");
  return Object.freeze({
    mode,
    prompt,
    base_commit: baseCommit,
    branch: requiredString(value.branch, "branch", 1, 200),
    worktree: requiredString(value.worktree, "worktree", 1, 2000),
    cwd: requiredString(value.cwd, "cwd", 1, 2000),
    model,
    profile,
    reasoning_effort: reasoningEffort,
    service_tier: serviceTier,
    sandbox,
    approval_policy: approvalPolicy,
    selection_rationale: selectionRationale,
    task_shape: taskShape,
    delegation_strategy: delegationStrategy,
    budgets
  });
}

export function createCodexAuthoritySnapshot(
  input: Omit<CodexAuthoritySnapshot, "schema_version" | "original_prompt_sha256" | "effective_prompt_sha256" | "output_schema_sha256">
    & { original_prompt: string; effective_prompt: string }
): CodexAuthoritySnapshot {
  const { original_prompt: originalPrompt, effective_prompt: effectivePrompt, budgets, delegation_strategy: delegationStrategy, ...rest } = input;
  return parseCodexAuthoritySnapshot({
    schema_version: 2,
    ...rest,
    delegation_strategy: freezeDelegationStrategy(delegationStrategy),
    original_prompt_sha256: sha256(originalPrompt),
    effective_prompt_sha256: sha256(effectivePrompt),
    output_schema_sha256: CODEX_STRUCTURED_RESULT_SCHEMA_SHA256,
    budgets: Object.freeze({ ...budgets })
  });
}

export function parseCodexAuthoritySnapshot(value: unknown): CodexAuthoritySnapshot {
  if (!isRecord(value)) throw new Error("codex.run authority snapshot must be an object.");
  assertOnlyKeys(value, AUTHORITY_SNAPSHOT_KEYS, "codex.run authority snapshot");
  if (value.schema_version !== 2) throw new Error("codex.run authority snapshot schema_version must be 2.");
  const baseCommit = requiredGitSha(value.base_commit, "authority.base_commit");
  const headCommit = requiredGitSha(value.head_commit, "authority.head_commit");
  const threadId = value.thread_id === null
    ? null
    : requiredUuid(value.thread_id, "authority.thread_id");
  const originalPromptDigest = requiredDigest(value.original_prompt_sha256, "authority.original_prompt_sha256");
  const effectivePromptDigest = requiredDigest(value.effective_prompt_sha256, "authority.effective_prompt_sha256");
  const outputSchemaDigest = requiredDigest(value.output_schema_sha256, "authority.output_schema_sha256");
  if (outputSchemaDigest !== CODEX_STRUCTURED_RESULT_SCHEMA_SHA256) {
    throw new Error("codex.run authority output schema digest does not match the current structured result contract.");
  }
  const mode = value.mode;
  if (mode !== "new" && mode !== "resume") throw new Error("codex.run authority mode must be new or resume.");
  return Object.freeze({
    schema_version: 2,
    repo_root: requiredString(value.repo_root, "authority.repo_root", 1, 2000),
    git_common_dir: requiredString(value.git_common_dir, "authority.git_common_dir", 1, 2000),
    base_commit: baseCommit,
    head_commit: headCommit,
    branch: requiredString(value.branch, "authority.branch", 1, 200),
    isolated_worktree: requiredString(value.isolated_worktree, "authority.isolated_worktree", 1, 2000),
    cwd: requiredString(value.cwd, "authority.cwd", 1, 2000),
    model: safeModelToken(value.model),
    profile: allowlisted(value.profile, CODEX_RUN_PROFILES, "authority.profile"),
    reasoning_effort: allowlisted(value.reasoning_effort, CODEX_RUN_REASONING_EFFORTS, "authority.reasoning_effort"),
    service_tier: allowlisted(value.service_tier, CODEX_RUN_SERVICE_TIERS, "authority.service_tier"),
    sandbox: allowlisted(value.sandbox, CODEX_RUN_SANDBOXES, "authority.sandbox"),
    approval_policy: allowlisted(value.approval_policy, CODEX_RUN_APPROVAL_POLICIES, "authority.approval_policy"),
    mode,
    thread_id: threadId,
    selection_rationale: requiredString(value.selection_rationale, "authority.selection_rationale", 1, 2000),
    task_shape: requiredString(value.task_shape, "authority.task_shape", 1, 2000),
    delegation_strategy: parseCodexDelegationStrategy(value.delegation_strategy),
    original_prompt_sha256: originalPromptDigest,
    effective_prompt_sha256: effectivePromptDigest,
    output_schema_sha256: outputSchemaDigest,
    budgets: parsePersistedBudgets(value.budgets)
  });
}

export function codexAuthorityDigest(snapshot: CodexAuthoritySnapshot): string {
  return sha256(JSON.stringify(snapshot));
}

export function buildCodexRunArgv(snapshot: CodexAuthoritySnapshot, outputSchemaPath: string): readonly string[] {
  if (!outputSchemaPath.startsWith("/")) throw new Error("codex.run output schema path must be absolute.");
  const parent = [
    "exec",
    "--profile", snapshot.profile,
    "--sandbox", snapshot.sandbox,
    "--cd", snapshot.cwd,
    "--disable", "web_search"
  ];
  // Authority-bearing settings remain explicit below. Do not strict-validate
  // unrelated user config fields: Codex versions may accept them leniently
  // while --strict-config aborts before a thread can be created.
  const bounded = [
    "--json",
    "--model", snapshot.model,
    "--config", `model_reasoning_effort=\"${snapshot.reasoning_effort}\"`,
    "--config", `service_tier=\"${snapshot.service_tier}\"`,
    "--config", `approval_policy=\"${snapshot.approval_policy}\"`,
    "--output-schema", outputSchemaPath
  ];
  return Object.freeze(snapshot.mode === "new"
    ? [...parent, ...bounded, "-"]
    : [...parent, "resume", ...bounded, requiredThreadId(snapshot.thread_id), "-"]);
}

export function parseCodexStructuredResult(text: string): CodexStructuredResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Codex structured result is not valid JSON.");
  }
  if (!isRecord(parsed)) throw new Error("Codex structured result must be an object.");
  const allowed = new Set(CODEX_STRUCTURED_RESULT_SCHEMA.required);
  assertOnlyKeys(parsed, allowed, "Codex structured result");
  for (const key of allowed) {
    if (!(key in parsed)) throw new Error(`Codex structured result is missing ${key}.`);
  }
  const status = parsed.status;
  if (status !== "done" && status !== "blocked" && status !== "failed") {
    throw new Error("Codex structured result has an invalid status.");
  }
  if (parsed.completion_authority !== "main_harness") throw new Error("Codex structured result completion_authority must be main_harness.");
  const blockers = boundedStrings(parsed.blockers, "blockers", 20, 1000);
  if (status === "done" && blockers.length > 0) throw new Error("A done Codex structured result cannot contain blockers.");
  if (status !== "done" && blockers.length === 0) throw new Error("A blocked or failed Codex structured result must contain a blocker.");
  return Object.freeze({
    status,
    summary: redact(requiredString(parsed.summary, "summary", 1, 1000)),
    changed_files: Object.freeze(boundedStrings(parsed.changed_files, "changed_files", 100, 500).map(validateChangedPath)),
    tests: Object.freeze(boundedStrings(parsed.tests, "tests", 50, 1000).map(redact)),
    blockers: Object.freeze(blockers.map(redact)),
    next_action: redact(requiredString(parsed.next_action, "next_action", 1, 1000)),
    completion_authority: "main_harness"
  });
}

export function failedCodexStructuredResult(summary: string, blocker: string, nextAction: string): CodexStructuredResult {
  return Object.freeze({
    status: "failed",
    summary: redact(summary).slice(0, 1000),
    changed_files: Object.freeze([]),
    tests: Object.freeze([]),
    blockers: Object.freeze([redact(blocker).slice(0, 1000)]),
    next_action: redact(nextAction).slice(0, 1000),
    completion_authority: "main_harness"
  });
}

export function blockedCodexStructuredResult(summary: string, blocker: string, nextAction: string): CodexStructuredResult {
  return Object.freeze({
    ...failedCodexStructuredResult(summary, blocker, nextAction),
    status: "blocked"
  });
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function deriveCodexOutputCaptureChars(maxOutputTokens?: number | null): number {
  if (typeof maxOutputTokens !== "number" || !Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    return DEFAULT_CONTEXT_TOTAL_HARD_LIMIT_CHARS;
  }
  return Math.min(Math.max(maxOutputTokens * ESTIMATED_CHARS_PER_MODEL_OUTPUT_TOKEN, 1000), 1_000_000);
}

function parseBudgets(value: unknown, defaults: CodexRunBudgetDefaults): CodexRunBudgets {
  const defaultMaxOutputChars = integer(
    defaults.max_output_chars ?? deriveCodexOutputCaptureChars(),
    "default max_output_chars",
    1000,
    1_000_000
  );
  if (value === undefined) return Object.freeze({
    ...DEFAULT_BUDGETS,
    max_output_chars: defaultMaxOutputChars
  });
  if (!isRecord(value)) throw new Error("codex.run budgets must be an object.");
  assertOnlyKeys(value, BUDGET_KEYS, "codex.run budgets");
  const maxRetries = integer(value.max_retries ?? 0, "max_retries", 0, 0);
  return Object.freeze({
    timeout_ms: integer(value.timeout_ms ?? DEFAULT_BUDGETS.timeout_ms, "timeout_ms", 10, 900_000),
    max_output_chars: integer(value.max_output_chars ?? defaultMaxOutputChars, "max_output_chars", 1000, 1_000_000),
    max_context_chars: integer(value.max_context_chars ?? DEFAULT_BUDGETS.max_context_chars, "max_context_chars", 1000, 100_000),
    max_tool_calls: integer(value.max_tool_calls ?? DEFAULT_BUDGETS.max_tool_calls, "max_tool_calls", 0, 64),
    max_retries: maxRetries as 0
  });
}

export function parseCodexDelegationStrategy(value: unknown): CodexDelegationStrategy {
  if (!isRecord(value)) throw new Error("codex.run delegation_strategy must be an object.");
  assertOnlyKeys(value, DELEGATION_STRATEGY_KEYS, "codex.run delegation_strategy");
  const mode = allowlisted(value.mode, CODEX_RUN_DELEGATION_MODES, "delegation_strategy.mode");
  if (value.integration_owner !== CODEX_RUN_INTEGRATION_OWNER) {
    throw new Error(`codex.run delegation_strategy.integration_owner must be ${CODEX_RUN_INTEGRATION_OWNER}.`);
  }
  if (!Array.isArray(value.independent_workstreams)) {
    throw new Error("codex.run delegation_strategy.independent_workstreams must be an array.");
  }
  if (value.independent_workstreams.length > 3) {
    throw new Error("codex.run delegation_strategy.independent_workstreams must contain at most three entries.");
  }
  const independentWorkstreams = value.independent_workstreams.map((workstream) =>
    requiredString(workstream, "delegation_strategy.independent_workstreams", 1, 1000)
  );
  if (new Set(independentWorkstreams).size !== independentWorkstreams.length) {
    throw new Error("codex.run delegation_strategy.independent_workstreams must be unique.");
  }
  if (mode === "single") {
    integer(value.max_subagents, "delegation_strategy.max_subagents", 0, 0);
    if (independentWorkstreams.length !== 0) {
      throw new Error("codex.run single delegation_strategy cannot declare independent workstreams.");
    }
  } else {
    const maxSubagents = integer(value.max_subagents, "delegation_strategy.max_subagents", 2, 3);
    if (independentWorkstreams.length < 2 || independentWorkstreams.length > maxSubagents) {
      throw new Error("codex.run parallel delegation_strategy requires two to max_subagents independent workstreams.");
    }
  }
  return freezeDelegationStrategy({
    mode,
    max_subagents: value.max_subagents as number,
    independent_workstreams: independentWorkstreams,
    integration_owner: CODEX_RUN_INTEGRATION_OWNER
  });
}

function parsePersistedBudgets(value: unknown): CodexRunBudgets {
  if (!isRecord(value)) throw new Error("codex.run authority budgets must be an object.");
  assertOnlyKeys(value, BUDGET_KEYS, "codex.run authority budgets");
  for (const key of BUDGET_KEYS) {
    if (!(key in value)) throw new Error(`codex.run authority budgets are missing ${key}.`);
  }
  return Object.freeze({
    timeout_ms: integer(value.timeout_ms, "authority.timeout_ms", 10, 900_000),
    max_output_chars: integer(value.max_output_chars, "authority.max_output_chars", 1000, 1_000_000),
    max_context_chars: integer(value.max_context_chars, "authority.max_context_chars", 1000, 100_000),
    max_tool_calls: integer(value.max_tool_calls, "authority.max_tool_calls", 0, 64),
    max_retries: integer(value.max_retries, "authority.max_retries", 0, 0) as 0
  });
}

function freezeDelegationStrategy(value: CodexDelegationStrategy): CodexDelegationStrategy {
  return Object.freeze({
    ...value,
    independent_workstreams: Object.freeze([...value.independent_workstreams])
  });
}

function validateChangedPath(value: string): string {
  if (value.startsWith("/") || value.includes("\0") || value.split(/[\\/]/).includes("..")) {
    throw new Error("Codex structured result changed_files must contain repo-relative paths.");
  }
  return redact(value);
}

function requiredThreadId(value: string | null): string {
  if (!value || !UUID_PATTERN.test(value)) throw new Error("codex.run resume snapshot requires a UUID thread_id.");
  return value;
}

function boundedStrings(value: unknown, field: string, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`Codex structured result ${field} is invalid.`);
  return value.map((item) => requiredString(item, field, 1, maxChars));
}

function redact(value: string): string {
  return value
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/gi, "[REDACTED]")
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}

function allowlisted<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`codex.run ${field} is not allowlisted.`);
  }
  return value as T[number];
}

function safeModelToken(value: unknown): CodexRunModel {
  if (typeof value !== "string" || !SAFE_MODEL_TOKEN_PATTERN.test(value)) {
    throw new Error("codex.run model must be an explicit safe model token of at most 100 characters.");
  }
  return value;
}

function requiredGitSha(value: unknown, field: string): string {
  const parsed = requiredString(value, field, 40, 40);
  if (!SHA_PATTERN.test(parsed)) throw new Error(`codex.run ${field} must be a full lowercase Git commit SHA.`);
  return parsed;
}

function requiredDigest(value: unknown, field: string): string {
  const parsed = requiredString(value, field, 64, 64);
  if (!DIGEST_PATTERN.test(parsed)) throw new Error(`codex.run ${field} must be a SHA-256 digest.`);
  return parsed;
}

function requiredUuid(value: unknown, field: string): string {
  const parsed = requiredString(value, field, 1, 100);
  if (!UUID_PATTERN.test(parsed)) throw new Error(`codex.run ${field} must be a UUID.`);
  return parsed;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`codex.run ${field} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function requiredString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw new Error(`codex.run ${field} must be a non-empty string of at most ${max} chars.`);
  }
  return value;
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length > 0) throw new Error(`${label} contains unsupported fields: ${extras.join(", ")}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
