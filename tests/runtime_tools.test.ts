import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  codexAuthorityDigest,
  type CodexAuthoritySnapshot
} from "../packages/core/src/codex_run_contract.js";
import type { ActionProposal } from "../packages/core/src/schemas.js";
import { coreToolContracts, renderCoreToolExamples } from "../packages/core/src/tool_contracts.js";
import { AgentStore } from "../packages/core/src/store.js";
import { executeTool } from "../packages/runtime/src/tools.js";

test("file.read reads repo files and rejects unsafe paths", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(join(fixture.repoRoot, "notes.md"), "hello repo", "utf8");
    await mkdir(join(fixture.repoRoot, ".runtime/state"), { recursive: true });
    await writeFile(join(fixture.repoRoot, ".runtime/state/trace.txt"), "runtime trace", "utf8");
    await writeFile(join(fixture.stateRoot, "trace.txt"), "state trace", "utf8");

    const result = await executeTool(useTool("file.read", {
      scope: "repo",
      path: "notes.md",
      max_chars: 100
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "none");
    assert.equal(result.output.text, "hello repo");

    const invalid = await executeTool(useTool("file.read", {
      scope: "repo",
      path: "../secret"
    }), { store: fixture.store });

    assert.equal(invalid.ok, false);
    assert.match(invalid.summary, /relative/);
    assertFailureKind(invalid, "invalid_request");

    const runtimeRepoPath = await executeTool(useTool("file.read", {
      scope: "repo",
      path: ".runtime/state/trace.txt"
    }), { store: fixture.store });

    assert.equal(runtimeRepoPath.ok, false);
    assert.match(runtimeRepoPath.summary, /repo-local runtime state/);
    assertFailureKind(runtimeRepoPath, "runtime_state_path");

    const stateScope = await executeTool(useTool("file.read", {
      scope: "state",
      path: "trace.txt"
    }), { store: fixture.store });

    assert.equal(stateScope.ok, true);
    assert.equal(stateScope.output.text, "state trace");
  } finally {
    await fixture.cleanup();
  }
});

test("file.write_state writes only under the state root", async () => {
  const fixture = await createFixture();
  try {
    const result = await executeTool(useTool("file.write_state", {
      path: "generated/output.txt",
      text: "state artifact"
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "local_write");
    assert.equal(await readFile(join(fixture.stateRoot, "generated/output.txt"), "utf8"), "state artifact");

    for (const path of ["../outside.txt", "/tmp/outside.txt"]) {
      const invalid = await executeTool(useTool("file.write_state", {
        path,
        text: "bad"
      }), { store: fixture.store });

      assert.equal(invalid.ok, false);
      assert.match(invalid.summary, /relative/);
      assertFailureKind(invalid, "invalid_request");
    }
  } finally {
    await fixture.cleanup();
  }
});

test("file.write_repo writes repo files and rejects protected paths", async () => {
  const fixture = await createFixture();
  try {
    const result = await executeTool(useTool("file.write_repo", {
      path: "docs/generated.md",
      text: "repo artifact"
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "local_write");
    assert.equal(await readFile(join(fixture.repoRoot, "docs/generated.md"), "utf8"), "repo artifact");

    const protectedPath = await executeTool(useTool("file.write_repo", {
      path: ".git/config",
      text: "bad"
    }), { store: fixture.store });

    assert.equal(protectedPath.ok, false);
    assert.match(protectedPath.summary, /protected/);
    assertFailureKind(protectedPath, "protected_path");

    const secretLike = await executeTool(useTool("file.write_repo", {
      path: ".env.local",
      text: "bad"
    }), { store: fixture.store });

    assert.equal(secretLike.ok, false);
    assert.match(secretLike.summary, /secret-like/);
    assertFailureKind(secretLike, "protected_path");

    const runtimeStatePath = await executeTool(useTool("file.write_repo", {
      path: ".runtime/state/generated.txt",
      text: "bad"
    }), { store: fixture.store });

    assert.equal(runtimeStatePath.ok, false);
    assert.match(runtimeStatePath.summary, /repo-local runtime state/);
    assertFailureKind(runtimeStatePath, "runtime_state_path");

    for (const path of [".runtime-smoke/generated.txt", ".runtime_stage/generated.txt"]) {
      const runtimeSiblingPath = await executeTool(useTool("file.write_repo", {
        path,
        text: "bad"
      }), { store: fixture.store });

      assert.equal(runtimeSiblingPath.ok, false);
      assert.match(runtimeSiblingPath.summary, /repo-local runtime state/);
      assertFailureKind(runtimeSiblingPath, "runtime_state_path");
    }

    for (const path of ["../outside.txt", "/tmp/outside.txt"]) {
      const invalid = await executeTool(useTool("file.write_repo", {
        path,
        text: "bad"
      }), { store: fixture.store });

      assert.equal(invalid.ok, false);
      assert.match(invalid.summary, /relative/);
      assertFailureKind(invalid, "invalid_request");
    }
  } finally {
    await fixture.cleanup();
  }
});

test("file.write_repo records bounded workspace guard snapshots", async () => {
  const fixture = await createFixture();
  try {
    await mkdir(join(fixture.repoRoot, "docs"), { recursive: true });
    await writeFile(join(fixture.repoRoot, "docs/preexisting.md"), "baseline\n", "utf8");
    await initGitFixture(fixture.repoRoot);
    await runGit(fixture.repoRoot, ["add", "docs/preexisting.md"]);
    await runGit(fixture.repoRoot, ["commit", "-m", "initial repo write fixture"]);
    await writeFile(join(fixture.repoRoot, "docs/preexisting.md"), "RAW_PREEXISTING_BODY_SHOULD_NOT_APPEAR\n", "utf8");

    const result = await executeTool(useTool("file.write_repo", {
      path: "docs/generated.md",
      text: "RAW_REPO_WRITE_BODY_SHOULD_NOT_APPEAR\n"
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    const guard = result.output.workspace_guard as Record<string, unknown>;
    const before = result.output.workspace_before as Record<string, unknown>;
    const after = result.output.workspace_after as Record<string, unknown>;
    assert.equal(guard.preexisting_dirty, true);
    assert.equal(guard.target_changed_after_write, true);
    assert.equal(before.status, "dirty");
    assert.equal(before.changed_file_count, 1);
    assert.equal(after.status, "dirty");
    assert.equal(after.changed_file_count, 2);
    assert.equal(after.untracked_count, 1);
    assert.match(result.summary, /workspace_guard: before=dirty after=dirty changed_files=1->2 delta=1 preexisting_dirty=true target_changed=true\./);
    assert.match(String(guard.boundary), /does not read file bodies/);
    assert.equal(before.command, "git status --porcelain=v1 -b");
    assert.equal(after.command, "git status --porcelain=v1 -b");
    const beforeChanges = before.changes as Array<Record<string, unknown>>;
    const afterChanges = after.changes as Array<Record<string, unknown>>;
    assert.deepEqual(beforeChanges.map((change) => change.path), ["docs/preexisting.md"]);
    assert.equal(afterChanges.some((change) => change.path === "docs/preexisting.md"), true);
    assert.equal(afterChanges.some((change) => change.path === "docs/generated.md"), true);
    assert.doesNotMatch(JSON.stringify(result.output), /RAW_PREEXISTING_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(result.output), /RAW_REPO_WRITE_BODY_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("repo.search finds repo text with bounded output", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(join(fixture.repoRoot, "alpha.md"), "needle one\nother", "utf8");
    await mkdir(join(fixture.repoRoot, "nested"), { recursive: true });
    await writeFile(join(fixture.repoRoot, "nested/beta.ts"), "const value = 'needle two';\n", "utf8");

    const result = await executeTool(useTool("repo.search", {
      query: "needle",
      path: ".",
      max_results: 5,
      max_output_chars: 4000
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "none");
    const matches = result.output.matches as Array<Record<string, unknown>>;
    assert.equal(matches.length, 2);
    assert.equal(matches.some((match) => match.path === "alpha.md"), true);
    assert.equal(matches.some((match) => match.path === "nested/beta.ts"), true);

    await writeFile(join(fixture.repoRoot, "gamma.md"), "needle three\n", "utf8");
    const truncated = await executeTool(useTool("repo.search", {
      query: "needle",
      path: ".",
      max_results: 2,
      max_output_chars: 4000
    }), { store: fixture.store });

    assert.equal(truncated.ok, true);
    assert.equal(truncated.output.max_results, 2);
    assert.equal(truncated.output.max_output_chars, 4000);
    assert.equal((truncated.output.matches as Array<Record<string, unknown>>).length, 2);
    assert.equal(truncated.output.truncated, true);

    await mkdir(join(fixture.repoRoot, ".runtime/state"), { recursive: true });
    await writeFile(join(fixture.repoRoot, ".runtime/state/trace.txt"), "needle runtime", "utf8");

    const broadAfterRuntime = await executeTool(useTool("repo.search", {
      query: "needle",
      path: ".",
      globs: [".runtime/**"],
      max_results: 10,
      max_output_chars: 4000
    }), { store: fixture.store });

    assert.equal(broadAfterRuntime.ok, true);
    const broadMatches = broadAfterRuntime.output.matches as Array<Record<string, unknown>>;
    assert.equal(broadMatches.some((match) => String(match.path).startsWith(".runtime/")), false);

    const runtimePath = await executeTool(useTool("repo.search", {
      query: "needle",
      path: ".runtime/state"
    }), { store: fixture.store });

    assert.equal(runtimePath.ok, false);
    assert.match(runtimePath.summary, /repo-local runtime state/);
    assertFailureKind(runtimePath, "runtime_state_path");

    const invalid = await executeTool(useTool("repo.search", {
      query: "needle",
      path: "../outside"
    }), { store: fixture.store });

    assert.equal(invalid.ok, false);
    assert.match(invalid.summary, /relative/);
    assertFailureKind(invalid, "invalid_request");

    const emptyQuery = await executeTool(useTool("repo.search", {
      query: "  ",
      path: "."
    }), { store: fixture.store });

    assert.equal(emptyQuery.ok, false);
    assert.match(emptyQuery.summary, /non-empty query/);
    assertFailureKind(emptyQuery, "invalid_request");
  } finally {
    await fixture.cleanup();
  }
});

test("http.fetch can fetch local JSON without external network", async () => {
  const fixture = await createFixture();
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, path: request.url }));
  });

  try {
    const url = await listen(server, "/data");
    const result = await executeTool(useTool("http.fetch", {
      url,
      response_type: "json",
      max_chars: 1000,
      timeout_ms: 1000
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "none");
    assert.equal(result.output.max_chars, 1000);
    assert.equal(result.output.timeout_ms, 1000);
    assert.equal(result.output.timed_out, false);
    assert.equal(result.output.response_chars, 26);
    assert.equal(result.output.returned_body_chars, 26);
    assert.equal(result.output.body_truncated, false);
    assert.equal(result.output.content_type, "application/json");
    assert.deepEqual(result.output.body, { ok: true, path: "/data" });
  } finally {
    await close(server);
    await fixture.cleanup();
  }
});

test("http.fetch records body truncation metadata", async () => {
  const fixture = await createFixture();
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("x".repeat(40));
  });

  try {
    const url = await listen(server, "/large");
    const result = await executeTool(useTool("http.fetch", {
      url,
      response_type: "text",
      max_chars: 10
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.output.max_chars, 10);
    assert.equal(result.output.response_chars, 40);
    assert.equal(result.output.returned_body_chars, 14);
    assert.equal(result.output.body_truncated, true);
    assert.equal(result.output.body, `${"x".repeat(10)}\n...`);
  } finally {
    await close(server);
    await fixture.cleanup();
  }
});

test("http.fetch records timeout and bad URL failures", async () => {
  const fixture = await createFixture();
  const server = createServer((request, response) => {
    if (request.url === "/status") {
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("unavailable");
      return;
    }
    setTimeout(() => {
      if (!response.destroyed) response.end("late");
    }, 2000);
  });

  try {
    const invalid = await executeTool(useTool("http.fetch", {
      url: "file:///tmp/data.json"
    }), { store: fixture.store });

    assert.equal(invalid.ok, false);
    assert.match(invalid.summary, /http\(s\) URL/);
    assert.equal(invalid.output.url, "file:///tmp/data.json");
    assertFailureKind(invalid, "invalid_request");

    const statusUrl = await listen(server, "/status");
    const httpStatus = await executeTool(useTool("http.fetch", {
      url: statusUrl,
      timeout_ms: 1000,
      max_chars: 1000
    }), { store: fixture.store });

    assert.equal(httpStatus.ok, false);
    assert.equal(httpStatus.output.status, 503);
    assert.equal(httpStatus.output.timed_out, false);
    assertFailureKind(httpStatus, "http_status");

    const url = statusUrl.replace("/status", "/slow");
    const timedOut = await executeTool(useTool("http.fetch", {
      url,
      timeout_ms: 1000,
      max_chars: 1000
    }), { store: fixture.store });

    assert.equal(timedOut.ok, false);
    assert.match(timedOut.summary, /timed out/);
    assert.equal(timedOut.output.timeout_ms, 1000);
    assert.equal(timedOut.output.timed_out, true);
    assert.equal(timedOut.output.max_chars, 1000);
    assertFailureKind(timedOut, "timeout");
  } finally {
    await close(server);
    await fixture.cleanup();
  }
});

test("command.run executes bounded commands with declared side effects", async () => {
  const fixture = await createFixture();
  try {
    const result = await executeTool(useTool("command.run", {
      command: "node",
      args: ["-e", "console.log(process.cwd())"],
      cwd: "state",
      timeout_ms: 1000,
      max_output_chars: 2000,
      side_effect_level: "none"
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "none");
    assert.equal(result.output.exitCode, 0);
    assert.equal(result.output.max_output_chars, 2000);
    assert.equal(result.output.stdout_truncated, false);
    assert.equal(result.output.stderr_truncated, false);
    assert.equal(result.output.stdout_chars_observed, String(result.output.stdout).length);
    assert.equal(result.output.stderr_chars_observed, 0);
    assert.equal(result.output.stderr_chars_returned, 0);
    assert.match(String(result.output.stdout), new RegExp(escapeRegExp(fixture.stateRoot)));

    const envResult = await executeTool(useTool("command.run", {
      command: "node",
      args: ["-e", "console.log(process.env.AGENT_TEST_VALUE)"],
      cwd: "repo",
      timeout_ms: 1000,
      max_output_chars: 2000,
      side_effect_level: "none",
      env_allowlist: ["AGENT_TEST_VALUE"],
      env: {
        AGENT_TEST_VALUE: "allowed"
      }
    }), { store: fixture.store });

    assert.equal(envResult.ok, true);
    assert.equal(String(envResult.output.stdout).trim(), "allowed");
    const envAudit = envResult.output.audit as Record<string, unknown>;
    assert.deepEqual((envAudit.env_boundary as Record<string, unknown>).requested_keys, ["AGENT_TEST_VALUE"]);
    assert.deepEqual((envAudit.env_boundary as Record<string, unknown>).allowlisted_keys, ["AGENT_TEST_VALUE"]);
    assert.deepEqual((envAudit.env_boundary as Record<string, unknown>).applied_keys, ["AGENT_TEST_VALUE"]);
    assert.doesNotMatch(JSON.stringify(envAudit), /allowed/);

    const rejectedEnv = await executeTool(useTool("command.run", {
      command: "node",
      args: ["-e", "console.log('bad')"],
      cwd: "repo",
      side_effect_level: "none",
      env: {
        NOT_ALLOWED: "bad"
      }
    }), { store: fixture.store });

    assert.equal(rejectedEnv.ok, false);
    assert.match(rejectedEnv.summary, /env_allowlist/);
    assertFailureKind(rejectedEnv, "invalid_request");
  } finally {
    await fixture.cleanup();
  }
});

test("command.run records output truncation metadata", async () => {
  const fixture = await createFixture();
  try {
    const result = await executeTool(useTool("command.run", {
      command: "node",
      args: ["-e", "process.stdout.write('a'.repeat(1500)); process.stderr.write('b'.repeat(1500));"],
      cwd: "state",
      timeout_ms: 1000,
      max_output_chars: 1000,
      side_effect_level: "none"
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.output.max_output_chars, 1000);
    assert.equal(result.output.stdout_truncated, true);
    assert.equal(result.output.stderr_truncated, true);
    assert.equal(result.output.stdout_chars_observed, 1500);
    assert.equal(result.output.stderr_chars_observed, 1500);
    assert.equal(result.output.stdout_chars_returned, 1004);
    assert.equal(result.output.stderr_chars_returned, 1004);
    const audit = result.output.audit as Record<string, unknown>;
    assert.deepEqual(audit.requested, {
      args_count: 2,
      timeout_ms: 1000,
      max_output_chars: 1000,
      cwd: "state",
      side_effect_level: "none"
    });
    assert.deepEqual(audit.effective, {
      args_count: 2,
      timeout_ms: 1000,
      max_output_chars: 1000,
      cwd: "state",
      side_effect_level: "none"
    });
    assert.equal(audit.cwd_boundary, "state_root");
    assert.equal(String(result.output.stdout).endsWith("\n..."), true);
    assert.equal(String(result.output.stderr).endsWith("\n..."), true);
  } finally {
    await fixture.cleanup();
  }
});

test("command.run rejects invalid command requests", async () => {
  const fixture = await createFixture();
  try {
    const empty = await executeTool(useTool("command.run", {
      command: "",
      side_effect_level: "none"
    }), { store: fixture.store });

    assert.equal(empty.ok, false);
    assert.match(empty.summary, /requires a command/);
    assertFailureKind(empty, "invalid_request");

    const pathLike = await executeTool(useTool("command.run", {
      command: "./script.sh",
      side_effect_level: "none"
    }), { store: fixture.store });

    assert.equal(pathLike.ok, false);
    assert.match(pathLike.summary, /binary name/);
    assertFailureKind(pathLike, "invalid_request");

    const invalidCwd = await executeTool(useTool("command.run", {
      command: "node",
      cwd: "outside",
      side_effect_level: "none"
    }), { store: fixture.store });

    assert.equal(invalidCwd.ok, false);
    assert.match(invalidCwd.summary, /Unsupported command.run cwd/);
    assertFailureKind(invalidCwd, "invalid_request");

    const missingSideEffect = await executeTool(useTool("command.run", {
      command: "node"
    }), { store: fixture.store });

    assert.equal(missingSideEffect.ok, false);
    assert.match(missingSideEffect.summary, /valid side_effect_level/);
    assertFailureKind(missingSideEffect, "invalid_request");
  } finally {
    await fixture.cleanup();
  }
});

test("command.run records timeout failures", async () => {
  const fixture = await createFixture();
  try {
    const result = await executeTool(useTool("command.run", {
      command: "node",
      args: ["-e", "setTimeout(() => {}, 2000)"],
      cwd: "state",
      timeout_ms: 1000,
      max_output_chars: 1000,
      side_effect_level: "none"
    }), { store: fixture.store });

    assert.equal(result.ok, false);
    assert.equal(result.output.timedOut, true);
    assert.equal(result.output.timed_out, true);
    assert.match(result.summary, /timed out/);
    assert.equal(result.output.timeout_ms, 1000);
    assert.equal(result.output.max_output_chars, 1000);
    assert.equal(result.output.stdout_truncated, false);
    assert.equal(result.output.stderr_truncated, false);
    assertFailureKind(result, "timeout");

    const nonzero = await executeTool(useTool("command.run", {
      command: "node",
      args: ["-e", "process.exit(7)"],
      cwd: "state",
      timeout_ms: 1000,
      max_output_chars: 1000,
      side_effect_level: "none"
    }), { store: fixture.store });

    assert.equal(nonzero.ok, false);
    assert.equal(nonzero.output.exitCode, 7);
    assert.equal(nonzero.output.timed_out, false);
    assertFailureKind(nonzero, "nonzero_exit");

    const missingCommand = await executeTool(useTool("command.run", {
      command: "definitely-not-a-real-command-name",
      cwd: "state",
      timeout_ms: 1000,
      max_output_chars: 1000,
      side_effect_level: "none"
    }), { store: fixture.store });

    assert.equal(missingCommand.ok, false);
    assert.equal(missingCommand.output.exitCode, null);
    assert.equal(missingCommand.output.timed_out, false);
    assertFailureKind(missingCommand, "spawn_error");
  } finally {
    await fixture.cleanup();
  }
});

test("command.run emits a commit change only when HEAD advances", async () => {
  const fixture = await createFixture();
  try {
    await initGitFixture(fixture.repoRoot);
    await writeFile(join(fixture.repoRoot, "tracked.txt"), "base\n", "utf8");
    await runGit(fixture.repoRoot, ["add", "tracked.txt"]);
    await runGit(fixture.repoRoot, ["commit", "-m", "base"]);
    const before = await gitValue(fixture.repoRoot, ["rev-parse", "HEAD"]);

    await writeFile(join(fixture.repoRoot, "tracked.txt"), "changed\n", "utf8");
    await runGit(fixture.repoRoot, ["add", "tracked.txt"]);
    const committed = await executeTool(useTool("command.run", {
      command: "git",
      args: ["commit", "-m", "bounded change"],
      cwd: "repo",
      side_effect_level: "local_write"
    }), { store: fixture.store });
    const after = await gitValue(fixture.repoRoot, ["rev-parse", "HEAD"]);

    assert.equal(committed.ok, true);
    assert.notEqual(after, before);
    assert.deepEqual(committed.output.change, { kind: "git_commit", identity: after });

    await writeFile(join(fixture.repoRoot, "tracked.txt"), "dry run\n", "utf8");
    await runGit(fixture.repoRoot, ["add", "tracked.txt"]);
    const dryRun = await executeTool(useTool("command.run", {
      command: "git",
      args: ["commit", "--dry-run", "-m", "probe"],
      cwd: "repo",
      side_effect_level: "local_write"
    }), { store: fixture.store });

    assert.equal(dryRun.ok, false);
    assert.equal(await gitValue(fixture.repoRoot, ["rev-parse", "HEAD"]), after);
    assert.equal(dryRun.output.change, undefined);
    assertFailureKind(dryRun, "invalid_request");
  } finally {
    await fixture.cleanup();
  }
});

test("codex.run routes through a sibling isolated worktree and reports live tracked plus untracked paths", async () => {
  const fixture = await createCodexFixture();
  const previousPath = process.env.PATH;
  try {
    await writeFakeCodex(fixture.binRoot, `
const fs = await import("node:fs");
const path = await import("node:path");
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(path.join(process.cwd(), "README.md"), "tracked change\\n");
  fs.writeFileSync(path.join(process.cwd(), "codex-untracked.txt"), "created by fake codex\\n");
  console.log(JSON.stringify({ type: "thread.started", thread_id: "019fabcd-1234-7abc-8def-0123456789ab" }));
  console.log(JSON.stringify({
    type: "item.completed",
    item: {
      id: "item-final",
      type: "agent_message",
      text: JSON.stringify({
        status: "done",
        summary: "Fake Codex completed its bounded execution.",
        changed_files: [],
        tests: ["fake focused test passed"],
        blockers: [],
        next_action: "The main harness verifies the live diff and tests.",
        completion_authority: "main_harness"
      })
    }
  }));
});
`);
    process.env.PATH = `${fixture.binRoot}:${previousPath ?? ""}`;
    const result = await executeTool(useTool("codex.run", codexNewArguments(fixture)), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.tool, "codex.run");
    assert.equal(result.output.status, "done");
    const authority = result.output.authority as Record<string, unknown>;
    assert.equal(authority.repo_root, await realpath(fixture.worktreeRoot));
    assert.equal(authority.isolated_worktree, await realpath(fixture.worktreeRoot));
    assert.equal(authority.git_common_dir, await realpath(join(fixture.mainRoot, ".git")));
    assert.equal(authority.schema_version, 2);
    assert.equal(authority.model, "gpt-5.6-sol");
    assert.equal(authority.reasoning_effort, "xhigh");
    assert.equal(typeof authority.original_prompt_sha256, "string");
    assert.equal(typeof authority.effective_prompt_sha256, "string");
    assert.notEqual(authority.original_prompt_sha256, authority.effective_prompt_sha256);
    const verifiability = result.output.authority_verifiability as Record<string, unknown>;
    assert.equal(verifiability.status, "verified");
    assert.equal(verifiability.snapshot_schema_version, 2);
    assert.equal(verifiability.authority_digest_recomputed, true);
    const selection = result.output.selection as Record<string, unknown>;
    assert.equal(selection.selection_rationale, "Use the verified local compatibility profile for a bounded test fixture.");
    const promptDigests = result.output.prompt_digests as Record<string, unknown>;
    assert.equal(promptDigests.raw_prompts_persisted, false);
    const workspace = result.output.workspace_changes as Record<string, unknown>;
    assert.deepEqual(workspace.before_changed_paths, []);
    assert.deepEqual(workspace.after_changed_paths, ["README.md", "codex-untracked.txt"]);
    assert.deepEqual(workspace.introduced_changed_paths, ["README.md", "codex-untracked.txt"]);
    const structured = result.output.result as Record<string, unknown>;
    assert.deepEqual(structured.changed_files, []);
    assert.equal(structured.completion_authority, "main_harness");
  } finally {
    process.env.PATH = previousPath;
    await fixture.cleanup();
  }
});

test("codex.run injects parallel supervision, records attributable spawn evidence, inherits strategy on resume, and rejects legacy snapshots", async () => {
  const fixture = await createCodexFixture();
  const previousPath = process.env.PATH;
  const promptCapture = join(fixture.root, "effective-prompt.txt");
  const threadId = "019fabcd-1234-7abc-8def-0123456789ab";
  try {
    await writeFakeCodex(fixture.binRoot, `
const fs = await import("node:fs");
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(${JSON.stringify(promptCapture)}, prompt);
  console.log(JSON.stringify({ type: "thread.started", thread_id: ${JSON.stringify(threadId)} }));
  for (const [id, receiver] of [["spawn-1", "019fabcd-1234-7abc-8def-0123456789ac"], ["spawn-2", "019fabcd-1234-7abc-8def-0123456789ad"]]) {
    const item = { id, type: "collab_tool_call", tool: "spawn_agent", receiver_thread_ids: [receiver] };
    console.log(JSON.stringify({ type: "item.started", item }));
    console.log(JSON.stringify({ type: "item.started", item }));
    console.log(JSON.stringify({ type: "item.completed", item: { ...item, status: "completed" } }));
    console.log(JSON.stringify({ type: "item.completed", item: { ...item, status: "completed" } }));
  }
  console.log(JSON.stringify({
    type: "item.completed",
    item: {
      id: "item-final",
      type: "agent_message",
      text: JSON.stringify({
        status: "done",
        summary: "Synthetic parallel JSONL fixture completed.",
        changed_files: [],
        tests: ["synthetic parallel metadata regression passed"],
        blockers: [],
        next_action: "The main harness verifies the evidence.",
        completion_authority: "main_harness"
      })
    }
  }));
});
`);
    process.env.PATH = `${fixture.binRoot}:${previousPath ?? ""}`;
    const parallelArguments = {
      ...codexNewArguments(fixture),
      task_shape: "Two independent workstreams integrated by the main Codex thread.",
      delegation_strategy: {
        mode: "parallel",
        max_subagents: 2,
        independent_workstreams: ["contract and authority", "runtime tests and docs"],
        integration_owner: "main_codex_thread"
      }
    };
    const result = await executeTool(useTool("codex.run", parallelArguments), { store: fixture.store });
    assert.equal(result.ok, true);
    const effectivePrompt = await readFile(promptCapture, "utf8");
    assert.match(effectivePrompt, /Delegation supervision:/);
    assert.match(effectivePrompt, /at most 2 subagents/);
    assert.match(effectivePrompt, /Workstream 1: contract and authority/);
    assert.match(effectivePrompt, /Integration owner: main_codex_thread/);
    const delegation = result.output.delegation as Record<string, unknown>;
    assert.equal(delegation.supervision_block_injected, true);
    assert.equal(delegation.attributable_spawn_calls_observed, 2);
    assert.equal(delegation.budget_exceeded, false);
    const evidence = delegation.attributable_tool_evidence as Array<Record<string, unknown>>;
    assert.equal(evidence.length, 2);
    assert.deepEqual(evidence.map((item) => item.receiver_thread_ids), [
      ["019fabcd-1234-7abc-8def-0123456789ac"],
      ["019fabcd-1234-7abc-8def-0123456789ad"]
    ]);

    const resumeHandle = result.output.resume_handle as Record<string, unknown>;
    const strategyDrift = await executeTool(useTool("codex.run", {
      mode: "resume",
      prompt: "Continue with a different strategy.",
      thread_id: resumeHandle.thread_id,
      authority_digest: resumeHandle.authority_digest,
      delegation_strategy: {
        mode: "single",
        max_subagents: 0,
        independent_workstreams: [],
        integration_owner: "main_codex_thread"
      }
    }), { store: fixture.store });
    assertFailureKind(strategyDrift, "codex_invalid_request");

    const resumed = await executeTool(useTool("codex.run", {
      mode: "resume",
      prompt: "Continue under the inherited immutable authority.",
      thread_id: resumeHandle.thread_id,
      authority_digest: resumeHandle.authority_digest
    }), { store: fixture.store });
    assert.equal(resumed.ok, true);
    assert.equal((resumed.output.authority_verifiability as Record<string, unknown>).resume_authority_inherited, true);
    assert.equal(((resumed.output.delegation as Record<string, unknown>).requested_plan as Record<string, unknown>).mode, "parallel");

    const resumedHandle = resumed.output.resume_handle as Record<string, unknown>;
    const persisted = await fixture.store.readStateJson<Record<string, unknown>>(`codex/threads/${threadId}.json`);
    assert.ok(persisted);
    const validAuthority = persisted.authority as unknown as CodexAuthoritySnapshot;
    const malformedAuthorities: Array<[string, CodexAuthoritySnapshot]> = [
      ["model", { ...validAuthority, model: "unsafe model token" }],
      ["reasoning_effort", { ...validAuthority, reasoning_effort: "unbounded" as CodexAuthoritySnapshot["reasoning_effort"] }],
      ["profile", { ...validAuthority, profile: "default" as CodexAuthoritySnapshot["profile"] }],
      ["service_tier", { ...validAuthority, service_tier: "slow" as CodexAuthoritySnapshot["service_tier"] }],
      ["sandbox", { ...validAuthority, sandbox: "danger-full-access" as CodexAuthoritySnapshot["sandbox"] }],
      ["approval_policy", { ...validAuthority, approval_policy: "on-request" as CodexAuthoritySnapshot["approval_policy"] }],
      ["delegation_strategy", {
        ...validAuthority,
        delegation_strategy: {
          mode: "parallel",
          max_subagents: 2,
          independent_workstreams: ["duplicate", "duplicate"],
          integration_owner: "main_codex_thread"
        }
      }]
    ];
    for (const [field, malformedAuthority] of malformedAuthorities) {
      const malformedDigest = codexAuthorityDigest(malformedAuthority);
      await fixture.store.writeJson(`codex/threads/${threadId}.json`, {
        ...persisted,
        authority_digest: malformedDigest,
        authority: malformedAuthority
      });
      const malformed = await executeTool(useTool("codex.run", {
        mode: "resume",
        prompt: `Reject malformed persisted ${field}.`,
        thread_id: threadId,
        authority_digest: malformedDigest
      }), { store: fixture.store });
      assertFailureKind(malformed, "codex_authority_mismatch");
    }

    await fixture.store.writeJson(`codex/threads/${threadId}.json`, {
      schema_version: 1,
      thread_id: threadId,
      authority_digest: resumedHandle.authority_digest,
      authority: resumed.output.authority
    });
    const legacy = await executeTool(useTool("codex.run", {
      mode: "resume",
      prompt: "Attempt to resume an old snapshot.",
      thread_id: threadId,
      authority_digest: resumedHandle.authority_digest
    }), { store: fixture.store });
    assertFailureKind(legacy, "codex_authority_mismatch");
  } finally {
    process.env.PATH = previousPath;
    await fixture.cleanup();
  }
});

test("codex.run truncates diagnostic retention without terminating valid JSONL or the final structured result", async () => {
  const fixture = await createCodexFixture();
  const previousPath = process.env.PATH;
  const unexpectedTermMarker = join(fixture.root, "unexpected-output-limit-term.txt");
  try {
    await writeFakeCodex(fixture.binRoot, `
const fs = await import("node:fs");
process.on("SIGTERM", () => {
  fs.writeFileSync(${JSON.stringify(unexpectedTermMarker)}, "terminated");
  process.exit(143);
});
process.stdin.resume();
process.stdin.on("end", () => {
  console.log(JSON.stringify({ type: "thread.started", thread_id: "019fabcd-1234-7abc-8def-0123456789ab" }));
  for (let index = 0; index < 80; index += 1) {
    console.log(JSON.stringify({
      type: "item.completed",
      item: { id: \`diagnostic-\${index}\`, type: "reasoning", text: "x".repeat(200) }
    }));
  }
  console.log(JSON.stringify({
    type: "item.completed",
    item: {
      id: "item-final",
      type: "agent_message",
      text: JSON.stringify({
        status: "done",
        summary: "Valid structured result survived diagnostic truncation.",
        changed_files: [],
        tests: ["synthetic oversized JSONL regression passed"],
        blockers: [],
        next_action: "The main harness validates authority and diff evidence.",
        completion_authority: "main_harness"
      })
    }
  }));
});
`);
    process.env.PATH = `${fixture.binRoot}:${previousPath ?? ""}`;
    const result = await executeTool(useTool("codex.run", {
      ...codexNewArguments(fixture),
      budgets: {
        timeout_ms: 2000,
        max_output_chars: 1000,
        max_context_chars: 8000,
        max_tool_calls: 4,
        max_retries: 0
      }
    }), { store: fixture.store, modelMaxOutputTokens: 2400 });

    assert.equal(result.ok, true);
    assert.equal(result.output.status, "done");
    assert.equal(result.output.failure_kind, undefined);
    await assert.rejects(readFile(unexpectedTermMarker, "utf8"), /ENOENT/);
    const processEvidence = result.output.process as Record<string, unknown>;
    assert.equal(processEvidence.output_budget_exceeded, false);
    const capture = processEvidence.output_capture as Record<string, unknown>;
    assert.equal(capture.effective_limit_chars, 1000);
    assert.equal(capture.limit_source, "request");
    assert.equal(Number(capture.observed_chars) > 1000, true);
    assert.equal(Number(capture.retained_chars) <= 1000, true);
    assert.equal(capture.truncated, true);
    assert.match(String(capture.termination_boundary), /never signals/);
    assert.match(String(capture.suffix), /item_type=agent_message/);
    const structured = result.output.result as Record<string, unknown>;
    assert.equal(structured.summary, "Valid structured result survived diagnostic truncation.");
    assert.equal(structured.completion_authority, "main_harness");
    const resumeHandle = result.output.resume_handle as Record<string, unknown>;
    assert.equal(resumeHandle.thread_id, "019fabcd-1234-7abc-8def-0123456789ab");
    assert.equal(typeof resumeHandle.authority_digest, "string");
    const workspace = result.output.workspace_changes as Record<string, unknown>;
    assert.deepEqual(workspace.introduced_changed_paths, []);
  } finally {
    process.env.PATH = previousPath;
    await fixture.cleanup();
  }
});

test("codex.run rejects main checkout and other-repository targets before spawn", async () => {
  const fixture = await createCodexFixture();
  const otherRoot = join(fixture.root, "other");
  try {
    await mkdir(otherRoot, { recursive: true });
    await initGitFixture(otherRoot);
    await writeFile(join(otherRoot, "README.md"), "other\n", "utf8");
    await runGit(otherRoot, ["add", "README.md"]);
    await runGit(otherRoot, ["commit", "-m", "other"]);

    for (const target of [fixture.mainRoot, otherRoot]) {
      const result = await executeTool(useTool("codex.run", {
        ...codexNewArguments(fixture),
        worktree: target,
        cwd: target
      }), { store: fixture.store });
      assert.equal(result.ok, false);
      assert.equal(result.output.failure_kind, "codex_isolation_failed");
      assert.equal((result.output.result as Record<string, unknown>).status, "failed");
    }
  } finally {
    await fixture.cleanup();
  }
});

test("codex.run returns strict failure for invalid JSONL and stops the full POSIX process group on timeout", async (t) => {
  const fixture = await createCodexFixture();
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${fixture.binRoot}:${previousPath ?? ""}`;
    await writeFakeCodex(fixture.binRoot, `process.stdout.write("not-json\\n");`);
    const invalid = await executeTool(useTool("codex.run", codexNewArguments(fixture)), { store: fixture.store });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.output.failure_kind, "codex_invalid_jsonl");
    assert.equal((invalid.output.result as Record<string, unknown>).status, "failed");

    if (process.platform === "win32") {
      t.diagnostic("POSIX process-group assertion skipped on Windows.");
      return;
    }
    const marker = join(fixture.root, "grandchild-term.txt");
    await writeFakeCodex(fixture.binRoot, `
const { spawn } = await import("node:child_process");
const childCode = ${JSON.stringify(`
  const fs = require("node:fs");
  process.on("SIGTERM", () => fs.writeFileSync(${JSON.stringify("__MARKER__")}, "term"));
  setInterval(() => {}, 1000);
`)}.replace("__MARKER__", ${JSON.stringify(marker)});
console.log(JSON.stringify({ type: "thread.started", thread_id: "019fabcd-1234-7abc-8def-0123456789ab" }));
spawn(process.execPath, ["-e", childCode], { stdio: "ignore" });
setInterval(() => {}, 1000);
`);
    const timedOut = await executeTool(useTool("codex.run", {
      ...codexNewArguments(fixture),
      budgets: {
        timeout_ms: 500,
        max_output_chars: 4000,
        max_context_chars: 8000,
        max_tool_calls: 2,
        max_retries: 0
      }
    }), { store: fixture.store });
    assert.equal(timedOut.ok, false);
    assert.equal(timedOut.output.failure_kind, "timeout");
    assert.equal((timedOut.output.result as Record<string, unknown>).status, "blocked");
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(await readFile(marker, "utf8"), "term");
  } finally {
    process.env.PATH = previousPath;
    await fixture.cleanup();
  }
});

test("code.execute_node executes bounded JavaScript in the state root", async () => {
  const fixture = await createFixture();
  try {
    const result = await executeTool(useTool("code.execute_node", {
      code: "console.log(process.cwd())",
      timeout_ms: 1000,
      max_output_chars: 2000
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "local_reversible");
    assert.equal(result.output.exitCode, 0);
    assert.equal(result.output.timeout_ms, 1000);
    assert.equal(result.output.max_output_chars, 2000);
    assert.equal(result.output.stdout_truncated, false);
    assert.equal(result.output.stderr_truncated, false);
    assert.equal(result.output.stdout_chars_observed, String(result.output.stdout).length);
    assert.equal(result.output.stderr_chars_observed, 0);
    assert.equal(result.output.cwd_boundary, "state_root");
    assert.equal((result.output.env_boundary as Record<string, unknown>).mode, "minimal_runtime_env");
    assert.match(String(result.output.stdout), new RegExp(escapeRegExp(fixture.stateRoot)));
  } finally {
    await fixture.cleanup();
  }
});

test("code.execute_node does not inherit arbitrary parent environment values", async () => {
  const fixture = await createFixture();
  const previous = process.env.AGENT_RUNTIME_SECRET_SHOULD_NOT_LEAK;
  process.env.AGENT_RUNTIME_SECRET_SHOULD_NOT_LEAK = "raw-secret-value";
  try {
    const result = await executeTool(useTool("code.execute_node", {
      code: "console.log(process.env.AGENT_RUNTIME_SECRET_SHOULD_NOT_LEAK || 'missing')",
      timeout_ms: 1000,
      max_output_chars: 2000
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(String(result.output.stdout).trim(), "missing");
    const envBoundary = result.output.env_boundary as Record<string, unknown>;
    assert.equal(envBoundary.mode, "minimal_runtime_env");
    assert.equal((envBoundary.inherited_keys as string[]).includes("AGENT_RUNTIME_SECRET_SHOULD_NOT_LEAK"), false);
    assert.doesNotMatch(JSON.stringify(envBoundary), /raw-secret-value/);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_RUNTIME_SECRET_SHOULD_NOT_LEAK;
    } else {
      process.env.AGENT_RUNTIME_SECRET_SHOULD_NOT_LEAK = previous;
    }
    await fixture.cleanup();
  }
});

test("code.execute_node rejects empty code and records timeout failures", async () => {
  const fixture = await createFixture();
  try {
    const empty = await executeTool(useTool("code.execute_node", {
      code: " "
    }), { store: fixture.store });

    assert.equal(empty.ok, false);
    assert.match(empty.summary, /No code provided/);
    assertFailureKind(empty, "invalid_request");

    const nonzero = await executeTool(useTool("code.execute_node", {
      code: "process.exit(3)",
      timeout_ms: 1000,
      max_output_chars: 1000
    }), { store: fixture.store });

    assert.equal(nonzero.ok, false);
    assert.equal(nonzero.output.exitCode, 3);
    assert.equal(nonzero.output.timed_out, false);
    assertFailureKind(nonzero, "nonzero_exit");

    const timedOut = await executeTool(useTool("code.execute_node", {
      code: "setTimeout(() => {}, 2000)",
      timeout_ms: 1000,
      max_output_chars: 1000
    }), { store: fixture.store });

    assert.equal(timedOut.ok, false);
    assert.equal(timedOut.output.timedOut, true);
    assert.equal(timedOut.output.timed_out, true);
    assert.match(timedOut.summary, /timed out/);
    assert.equal(timedOut.output.timeout_ms, 1000);
    assert.equal(timedOut.output.max_output_chars, 1000);
    assertFailureKind(timedOut, "timeout");
  } finally {
    await fixture.cleanup();
  }
});

test("code.execute_node records output truncation metadata", async () => {
  const fixture = await createFixture();
  try {
    const result = await executeTool(useTool("code.execute_node", {
      code: "process.stdout.write('c'.repeat(1500)); process.stderr.write('d'.repeat(1500));",
      timeout_ms: 1000,
      max_output_chars: 1000
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.output.max_output_chars, 1000);
    assert.equal(result.output.stdout_truncated, true);
    assert.equal(result.output.stderr_truncated, true);
    assert.equal(result.output.stdout_chars_observed, 1500);
    assert.equal(result.output.stderr_chars_observed, 1500);
    assert.equal(String(result.output.stdout).endsWith("\n..."), true);
    assert.equal(String(result.output.stderr).endsWith("\n..."), true);
  } finally {
    await fixture.cleanup();
  }
});

test("tool contract renderer covers the core tool surface", () => {
  const toolNames = coreToolContracts.map((contract) => contract.tool);
  assert.deepEqual(toolNames, [
    "file.read",
    "file.write_state",
    "file.write_repo",
    "repo.search",
    "http.fetch",
    "command.run",
    "codex.run",
    "code.execute_node"
  ]);

  const rendered = renderCoreToolExamples();
  for (const toolName of toolNames) {
    assert.match(rendered, new RegExp(`"tool"\\s*:\\s*"${escapeRegExp(toolName)}"`));
  }
  const contractsByTool = new Map(coreToolContracts.map((contract) => [contract.tool, contract]));
  assert.deepEqual(Object.keys(contractsByTool.get("repo.search")?.arguments ?? {}).sort(), [
    "globs",
    "max_output_chars",
    "max_results",
    "path",
    "query"
  ]);
  assert.deepEqual(Object.keys(contractsByTool.get("http.fetch")?.arguments ?? {}).sort(), [
    "max_chars",
    "response_type",
    "timeout_ms",
    "url"
  ]);
  assert.deepEqual(Object.keys(contractsByTool.get("command.run")?.arguments ?? {}).sort(), [
    "args",
    "command",
    "cwd",
    "env",
    "env_allowlist",
    "max_output_chars",
    "side_effect_level",
    "timeout_ms"
  ]);
  assert.deepEqual(Object.keys(contractsByTool.get("codex.run")?.arguments ?? {}).sort(), [
    "approval_policy",
    "authority_digest",
    "base_commit",
    "branch",
    "budgets",
    "cwd",
    "delegation_strategy",
    "mode",
    "model",
    "profile",
    "prompt",
    "reasoning_effort",
    "sandbox",
    "selection_rationale",
    "service_tier",
    "task_shape",
    "thread_id",
    "worktree"
  ]);
  assert.deepEqual(Object.keys(contractsByTool.get("code.execute_node")?.arguments ?? {}).sort(), [
    "code",
    "env_policy",
    "max_output_chars",
    "timeout_ms"
  ]);
  assert.doesNotMatch(rendered, /market\.chinext/);
});

test("unsupported tools return bounded failure metadata", async () => {
  const fixture = await createFixture();
  try {
    const result = await executeTool(useTool("tool.unknown", {
      value: "ignored"
    }), { store: fixture.store });

    assert.equal(result.ok, false);
    assertFailureKind(result, "unsupported_tool");
    assert.deepEqual(result.output.received_payload, {
      tool: "tool.unknown",
      arguments: {
        value: "ignored"
      }
    });
  } finally {
    await fixture.cleanup();
  }
});

function useTool(tool: string, args: Record<string, unknown>): ActionProposal {
  return {
    id: "action_test",
    type: "use_tool",
    rationale: `test ${tool}`,
    payload: { tool, arguments: args }
  };
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "agent-tools-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  const store = new AgentStore(repoRoot, stateRoot);
  await store.ensureLayout();
  return {
    repoRoot,
    stateRoot,
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function createCodexFixture(): Promise<{
  root: string;
  mainRoot: string;
  worktreeRoot: string;
  stateRoot: string;
  binRoot: string;
  baseCommit: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "agent-codex-tool-"));
  const mainRoot = join(root, "main");
  const worktreeRoot = join(root, "worktree");
  const stateRoot = join(root, "state");
  const binRoot = join(root, "bin");
  await mkdir(mainRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(binRoot, { recursive: true });
  await initGitFixture(mainRoot);
  await writeFile(join(mainRoot, "README.md"), "fixture\n", "utf8");
  await runGit(mainRoot, ["add", "README.md"]);
  await runGit(mainRoot, ["commit", "-m", "fixture base"]);
  const baseCommit = await gitValue(mainRoot, ["rev-parse", "HEAD"]);
  await runGit(mainRoot, ["worktree", "add", "-b", "codex/test", worktreeRoot]);
  const store = new AgentStore(mainRoot, stateRoot);
  await store.ensureLayout();
  return {
    root,
    mainRoot,
    worktreeRoot,
    stateRoot,
    binRoot,
    baseCommit,
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function codexNewArguments(fixture: Awaited<ReturnType<typeof createCodexFixture>>): Record<string, unknown> {
  return {
    mode: "new",
    prompt: "Perform the bounded fake change.",
    base_commit: fixture.baseCommit,
    branch: "codex/test",
    worktree: fixture.worktreeRoot,
    cwd: fixture.worktreeRoot,
    model: "gpt-5.6-sol",
    profile: "fast",
    reasoning_effort: "xhigh",
    service_tier: "fast",
    sandbox: "workspace-write",
    approval_policy: "never",
    selection_rationale: "Use the verified local compatibility profile for a bounded test fixture.",
    task_shape: "One main Codex thread with no independent workstreams.",
    delegation_strategy: {
      mode: "single",
      max_subagents: 0,
      independent_workstreams: [],
      integration_owner: "main_codex_thread"
    },
    budgets: {
      timeout_ms: 2000,
      max_output_chars: 8000,
      max_context_chars: 8000,
      max_tool_calls: 4,
      max_retries: 0
    }
  };
}

async function writeFakeCodex(binRoot: string, source: string): Promise<void> {
  const path = join(binRoot, "codex");
  await writeFile(path, `#!/usr/bin/env node\n${source}\n`, "utf8");
  await chmod(path, 0o755);
}

async function initGitFixture(repoRoot: string): Promise<void> {
  await runGit(repoRoot, ["init"]);
  await runGit(repoRoot, ["config", "user.name", "Local Runtime Test"]);
  await runGit(repoRoot, ["config", "user.email", "local-runtime@example.test"]);
  await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
}

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr || stdout || error.message}`));
        return;
      }
      resolve();
    });
  });
}

function gitValue(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr || stdout || error.message}`));
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}

function listen(server: Server, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("HTTP test server did not expose a TCP port."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}${path}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => error ? reject(error) : resolve());
  });
}

function assertFailureKind(result: Awaited<ReturnType<typeof executeTool>>, kind: string): void {
  assert.equal(result.ok, false);
  assert.equal(result.output.failure_kind, kind);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
