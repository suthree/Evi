import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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

    const runtimeRepoPath = await executeTool(useTool("file.read", {
      scope: "repo",
      path: ".runtime/state/trace.txt"
    }), { store: fixture.store });

    assert.equal(runtimeRepoPath.ok, false);
    assert.match(runtimeRepoPath.summary, /repo-local runtime state/);

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

    const secretLike = await executeTool(useTool("file.write_repo", {
      path: ".env.local",
      text: "bad"
    }), { store: fixture.store });

    assert.equal(secretLike.ok, false);
    assert.match(secretLike.summary, /secret-like/);

    const runtimeStatePath = await executeTool(useTool("file.write_repo", {
      path: ".runtime/state/generated.txt",
      text: "bad"
    }), { store: fixture.store });

    assert.equal(runtimeStatePath.ok, false);
    assert.match(runtimeStatePath.summary, /repo-local runtime state/);

    for (const path of [".runtime-smoke/generated.txt", ".runtime_stage/generated.txt"]) {
      const runtimeSiblingPath = await executeTool(useTool("file.write_repo", {
        path,
        text: "bad"
      }), { store: fixture.store });

      assert.equal(runtimeSiblingPath.ok, false);
      assert.match(runtimeSiblingPath.summary, /repo-local runtime state/);
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

    const invalid = await executeTool(useTool("repo.search", {
      query: "needle",
      path: "../outside"
    }), { store: fixture.store });

    assert.equal(invalid.ok, false);
    assert.match(invalid.summary, /relative/);
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
      max_chars: 1000
    }), { store: fixture.store });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "none");
    assert.deepEqual(result.output.body, { ok: true, path: "/data" });
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
  } finally {
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
    assert.match(String(result.output.stdout), new RegExp(escapeRegExp(fixture.stateRoot)));
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
    "code.execute_node"
  ]);

  const rendered = renderCoreToolExamples();
  for (const toolName of toolNames) {
    assert.match(rendered, new RegExp(`"tool": "${escapeRegExp(toolName)}"`));
  }
  assert.doesNotMatch(rendered, /market\.chinext/);
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
