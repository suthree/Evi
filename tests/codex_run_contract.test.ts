import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodexRunArgv,
  CODEX_STRUCTURED_RESULT_SCHEMA,
  CODEX_STRUCTURED_RESULT_SCHEMA_SHA256,
  codexAuthorityDigest,
  createCodexAuthoritySnapshot,
  deriveCodexOutputCaptureChars,
  parseCodexRunRequest,
  parseCodexStructuredResult
} from "../packages/core/src/codex_run_contract.js";

const baseCommit = "a".repeat(40);
const threadId = "019fabcd-1234-7abc-8def-0123456789ab";

test("codex.run request allowlist rejects unsafe argv and authority expansion", () => {
  const valid = parseCodexRunRequest({
    mode: "new",
    prompt: "Implement the bounded change.",
    base_commit: baseCommit,
    branch: "codex/issue-25-typed-codex-cli",
    worktree: ".",
    cwd: "."
  });
  assert.equal(valid.mode, "new");
  if (valid.mode !== "new") return;
  assert.equal(valid.model, "gpt-5.6-sol");
  assert.equal(valid.profile, "fast");
  assert.equal(valid.reasoning_effort, "xhigh");
  assert.equal(valid.service_tier, "fast");
  assert.equal(valid.sandbox, "workspace-write");
  assert.equal(valid.approval_policy, "never");
  assert.equal(valid.budgets.max_retries, 0);
  assert.equal(valid.budgets.max_output_chars, deriveCodexOutputCaptureChars());

  const injected = parseCodexRunRequest({
    mode: "new",
    prompt: "Use the runtime-derived capture default.",
    base_commit: baseCommit,
    branch: "codex/issue-34-output-capture",
    worktree: ".",
    cwd: "."
  }, { max_output_chars: 12_345 });
  assert.equal(injected.mode === "new" && injected.budgets.max_output_chars, 12_345);
  const explicit = parseCodexRunRequest({
    ...injected,
    budgets: { ...injected.budgets, max_output_chars: 23_456 }
  }, { max_output_chars: 12_345 });
  assert.equal(explicit.mode === "new" && explicit.budgets.max_output_chars, 23_456);

  for (const request of [
    { ...valid, model: "gpt-5.6" },
    { ...valid, profile: "default" },
    { ...valid, sandbox: "danger-full-access" },
    { ...valid, approval_policy: "on-request" },
    { ...valid, add_dir: "/tmp" },
    { ...valid, search: true },
    { ...valid, dangerously_bypass_approvals_and_sandbox: true },
    { ...valid, budgets: { ...valid.budgets, max_retries: 1 } }
  ]) {
    assert.throws(() => parseCodexRunRequest(request as Record<string, unknown>), /codex\.run/);
  }
});

test("codex.run derives output capture retention from configured model output tokens", () => {
  assert.equal(deriveCodexOutputCaptureChars(2400), 9600);
  assert.equal(deriveCodexOutputCaptureChars(1), 1000);
  assert.equal(deriveCodexOutputCaptureChars(1_000_000), 1_000_000);
});

test("codex.run builds fixed new and resume argv without shell or forbidden flags", () => {
  const fresh = snapshot("new", null);
  const freshArgv = buildCodexRunArgv(fresh, "/tmp/result-schema.json");
  assert.equal(freshArgv[0], "exec");
  assert.equal(freshArgv.at(-1), "-");
  assert.deepEqual(freshArgv.slice(0, 10), [
    "exec", "--profile", "fast", "--sandbox", "workspace-write", "--cd", "/repo/worktree",
    "--disable", "web_search", "--json"
  ]);
  assert.equal(freshArgv.includes("resume"), false);
  assert.equal(freshArgv.includes("--strict-config"), false);

  const resumed = snapshot("resume", threadId);
  const resumeArgv = buildCodexRunArgv(resumed, "/tmp/result-schema.json");
  assert.equal(resumeArgv[0], "exec");
  assert.equal(resumeArgv[9], "resume");
  assert.equal(resumeArgv.at(-2), threadId);
  assert.equal(resumeArgv.at(-1), "-");
  for (const forbidden of ["danger-full-access", "--dangerously-bypass-approvals-and-sandbox", "--add-dir", "--search", "--last", "--all"]) {
    assert.equal(freshArgv.includes(forbidden), false);
    assert.equal(resumeArgv.includes(forbidden), false);
  }
  assert.equal(codexAuthorityDigest(resumed).length, 64);
  assert.equal(resumed.output_schema_sha256, CODEX_STRUCTURED_RESULT_SCHEMA_SHA256);
});

test("codex.run structured result is strict, sanitized, and cannot claim failed completion", () => {
  const done = parseCodexStructuredResult(JSON.stringify({
    status: "done",
    summary: "Implemented bounded change.",
    changed_files: ["packages/core/src/example.ts"],
    tests: ["focused test passed"],
    blockers: [],
    next_action: "The main harness independently verifies diff and tests.",
    completion_authority: "main_harness"
  }));
  assert.equal(done.status, "done");
  assert.deepEqual(done.changed_files, ["packages/core/src/example.ts"]);

  const blocked = parseCodexStructuredResult(JSON.stringify({
    status: "blocked",
    summary: "Token sk-abcdefghijklmnopqrstuvwxyz was observed.",
    changed_files: [],
    tests: [],
    blockers: ["API_KEY=top-secret"],
    next_action: "Resume the same thread.",
    completion_authority: "main_harness"
  }));
  assert.doesNotMatch(JSON.stringify(blocked), /abcdefghijklmnopqrstuvwxyz|top-secret/);
  assert.throws(() => parseCodexStructuredResult(JSON.stringify({
    status: "failed",
    summary: "failed",
    changed_files: [],
    tests: [],
    blockers: [],
    next_action: "retry",
    completion_authority: "main_harness"
  })), /must contain a blocker/);
  assert.throws(() => parseCodexStructuredResult(JSON.stringify({ ...done, extra: true })), /unsupported fields/);
});

test("codex.run JSON schema gives every enum and const an explicit string type", () => {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if ("enum" in record || "const" in record) assert.equal(record.type, "string");
    Object.values(record).forEach(visit);
  };
  visit(CODEX_STRUCTURED_RESULT_SCHEMA);
});

function snapshot(mode: "new" | "resume", id: string | null) {
  return createCodexAuthoritySnapshot({
    repo_root: "/repo/worktree",
    git_common_dir: "/repo/.git",
    base_commit: baseCommit,
    head_commit: baseCommit,
    branch: "codex/issue-25-typed-codex-cli",
    isolated_worktree: "/repo/worktree",
    cwd: "/repo/worktree",
    model: "gpt-5.6-sol",
    profile: "fast",
    reasoning_effort: "xhigh",
    service_tier: "fast",
    sandbox: "workspace-write",
    approval_policy: "never",
    mode,
    thread_id: id,
    prompt: "bounded prompt",
    budgets: {
      timeout_ms: 1000,
      max_output_chars: 4000,
      max_context_chars: 4000,
      max_tool_calls: 2,
      max_retries: 0
    }
  });
}
