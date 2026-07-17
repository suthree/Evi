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
    ...validNewRequest(),
    model: "gpt-5.6-sol",
    reasoning_effort: "xhigh"
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

  assert.equal(valid.selection_rationale, "Use a compatible coding model for a bounded contract task.");
  assert.equal(valid.task_shape, "One main-thread implementation with no independent workstreams.");
  assert.deepEqual(valid.delegation_strategy, singleDelegation());

  const injected = parseCodexRunRequest(validNewRequest(), { max_output_chars: 12_345 });
  assert.equal(injected.mode === "new" && injected.budgets.max_output_chars, 12_345);
  const explicit = parseCodexRunRequest({
    ...injected,
    budgets: { ...injected.budgets, max_output_chars: 23_456 }
  }, { max_output_chars: 12_345 });
  assert.equal(explicit.mode === "new" && explicit.budgets.max_output_chars, 23_456);

  for (const request of [
    { ...valid, model: "gpt-5.6;--danger" },
    { ...valid, model: "-gpt-5.6" },
    { ...valid, model: undefined },
    { ...valid, reasoning_effort: undefined },
    { ...valid, reasoning_effort: "unbounded" },
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

test("codex.run accepts multiple explicit safe model tokens and bounded reasoning efforts", () => {
  for (const model of ["gpt-5.6-sol", "gpt-5.7-codex", "o4-mini"]) {
    for (const reasoning_effort of ["minimal", "low", "medium", "high", "xhigh"]) {
      const parsed = parseCodexRunRequest({ ...validNewRequest(), model, reasoning_effort });
      assert.equal(parsed.mode === "new" && parsed.model, model);
      assert.equal(parsed.mode === "new" && parsed.reasoning_effort, reasoning_effort);
    }
  }
});

test("codex.run records auto selection while delegating model and reasoning resolution to the profile", () => {
  const parsed = parseCodexRunRequest({
    ...validNewRequest(),
    model: "auto",
    reasoning_effort: "auto"
  });
  assert.equal(parsed.mode, "new");
  if (parsed.mode !== "new") return;
  assert.equal(parsed.model, "auto");
  assert.equal(parsed.reasoning_effort, "auto");

  const authority = createCodexAuthoritySnapshot({
    repo_root: "/repo/worktree",
    git_common_dir: "/repo/.git",
    base_commit: baseCommit,
    head_commit: baseCommit,
    branch: "codex/issue-78-codex-auto-selection",
    isolated_worktree: "/repo/worktree",
    cwd: "/repo/worktree",
    model: parsed.model,
    profile: parsed.profile,
    reasoning_effort: parsed.reasoning_effort,
    service_tier: parsed.service_tier,
    sandbox: parsed.sandbox,
    approval_policy: parsed.approval_policy,
    selection_rationale: parsed.selection_rationale,
    task_shape: parsed.task_shape,
    delegation_strategy: parsed.delegation_strategy,
    mode: "new",
    thread_id: null,
    original_prompt: parsed.prompt,
    effective_prompt: parsed.prompt,
    budgets: parsed.budgets
  });
  const argv = buildCodexRunArgv(authority, "/tmp/result-schema.json");
  assert.equal(argv.includes("--model"), false);
  assert.equal(argv.some((value) => value.includes("model_reasoning_effort")), false);
  assert.equal(argv.includes("--profile"), true);
  assert.equal(argv.includes("fast"), true);
  assert.equal(argv.includes('service_tier="fast"'), true);
  assert.equal(argv.includes('approval_policy="never"'), true);

  const resumedAuthority = createCodexAuthoritySnapshot({
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
    mode: "resume",
    thread_id: threadId,
    original_prompt: "Continue the same bounded task.",
    effective_prompt: "Continue the same bounded task.",
    budgets: authority.budgets
  });
  const resumeArgv = buildCodexRunArgv(resumedAuthority, "/tmp/result-schema.json");
  assert.equal(resumeArgv.includes("resume"), true);
  assert.equal(resumeArgv.includes(threadId), true);
  assert.equal(resumeArgv.includes("--model"), false);
  assert.equal(resumeArgv.some((value) => value.includes("model_reasoning_effort")), false);
  assert.equal(resumedAuthority.model, "auto");
  assert.equal(resumedAuthority.reasoning_effort, "auto");
});

test("codex.run validates bounded delegation strategy and rejects resume strategy drift", () => {
  const parallel = parseCodexRunRequest({
    ...validNewRequest(),
    task_shape: "Three independent workstreams integrated by the main Codex thread.",
    delegation_strategy: {
      mode: "parallel",
      max_subagents: 3,
      independent_workstreams: ["contract and authority", "runtime evidence", "tests and docs"],
      integration_owner: "main_codex_thread"
    }
  });
  assert.equal(parallel.mode === "new" && parallel.delegation_strategy.mode, "parallel");
  assert.equal(parallel.mode === "new" && parallel.delegation_strategy.max_subagents, 3);

  for (const delegation_strategy of [
    { ...singleDelegation(), max_subagents: 1 },
    { ...singleDelegation(), independent_workstreams: ["not single"] },
    { mode: "parallel", max_subagents: 1, independent_workstreams: ["one"], integration_owner: "main_codex_thread" },
    { mode: "parallel", max_subagents: 3, independent_workstreams: ["one", "two", "three", "four"], integration_owner: "main_codex_thread" },
    { mode: "parallel", max_subagents: 3, independent_workstreams: ["duplicate", "duplicate"], integration_owner: "main_codex_thread" },
    { mode: "parallel", max_subagents: 3, independent_workstreams: ["one", "two"], integration_owner: "subagent" }
  ]) {
    assert.throws(() => parseCodexRunRequest({ ...validNewRequest(), delegation_strategy }), /codex\.run/);
  }

  assert.throws(() => parseCodexRunRequest({
    mode: "resume",
    prompt: "Continue the bounded task.",
    thread_id: threadId,
    authority_digest: "b".repeat(64),
    delegation_strategy: singleDelegation()
  }), /unsupported fields: delegation_strategy/);
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
  assert.equal(resumed.schema_version, 2);
  assert.equal(resumed.original_prompt_sha256.length, 64);
  assert.equal(resumed.effective_prompt_sha256.length, 64);
  assert.notEqual(resumed.original_prompt_sha256, resumed.effective_prompt_sha256);
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
    selection_rationale: "Use the explicitly selected compatible model and bounded effort.",
    task_shape: "Bounded single-thread fixture.",
    delegation_strategy: singleDelegation(),
    mode,
    thread_id: id,
    original_prompt: "bounded user prompt",
    effective_prompt: "bounded effective prompt",
    budgets: {
      timeout_ms: 1000,
      max_output_chars: 4000,
      max_context_chars: 4000,
      max_tool_calls: 2,
      max_retries: 0
    }
  });
}

function validNewRequest(): Record<string, unknown> {
  return {
    mode: "new",
    prompt: "Implement the bounded change.",
    base_commit: baseCommit,
    branch: "codex/issue-54-adaptive-codex-invocation",
    worktree: ".",
    cwd: ".",
    model: "gpt-5.6-sol",
    profile: "fast",
    reasoning_effort: "xhigh",
    service_tier: "fast",
    sandbox: "workspace-write",
    approval_policy: "never",
    selection_rationale: "Use a compatible coding model for a bounded contract task.",
    task_shape: "One main-thread implementation with no independent workstreams.",
    delegation_strategy: singleDelegation()
  };
}

function singleDelegation() {
  return {
    mode: "single" as const,
    max_subagents: 0,
    independent_workstreams: [] as string[],
    integration_owner: "main_codex_thread" as const
  };
}
