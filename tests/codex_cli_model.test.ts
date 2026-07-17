import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CodexCliModelClient,
  NodeCodexExecRunner,
  type CodexExecInvocation,
  type CodexExecResult,
  type CodexExecRunner
} from "../packages/runtime/src/codex_cli_model.js";

const outputSchema = {
  type: "object",
  properties: { decision_json: { type: "string" } },
  required: ["decision_json"],
  additionalProperties: false
};

test("Codex CLI model uses ephemeral read-only strict execution and unwraps one decision", async () => {
  let invocation: CodexExecInvocation | null = null;
  const runner: CodexExecRunner = {
    async run(input) {
      invocation = input;
      assert.equal(JSON.parse(await readFile(input.args[input.args.indexOf("--output-schema") + 1]!, "utf8")).additionalProperties, false);
      return result(jsonl({
        decision_json: JSON.stringify({
          type: "action",
          summary: "Read package metadata.",
          action: { tool: "file.read", arguments: { scope: "repo", path: "package.json" } }
        })
      }));
    }
  };
  const client = new CodexCliModelClient({
    outputSchema,
    outputField: "decision_json",
    model: "test-model",
    reasoningEffort: "medium",
    timeoutMs: 5000,
    maxOutputChars: 12000
  }, runner);
  const response = await client.create({ instructions: "Return one decision.", input: "Bounded Goal state." });
  assert.equal(JSON.parse(response.outputText).type, "action");
  assert.equal(response.provider, "codex-cli");
  assert.ok(invocation);
  const observed = invocation as CodexExecInvocation;
  assert.equal(observed.command, "codex");
  assert.deepEqual(observed.args.slice(0, 9), [
    "exec",
    "--profile",
    "fast",
    "--json",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--color"
  ]);
  assert.deepEqual(observed.args.slice(10, 14), [
    "-c",
    "approval_policy=\"never\"",
    "-c",
    "web_search=\"disabled\""
  ]);
  assert.equal(observed.args.includes("danger-full-access"), false);
  assert.equal(observed.args.includes("workspace-write"), false);
  assert.equal(observed.args.includes("--add-dir"), false);
  assert.equal(observed.args.at(-1), "-");
  assert.match(observed.stdin, /Do not call shell, file, MCP, Web/);
  assert.equal(existsSync(observed.cwd), false);
});

test("Codex CLI model rejects any Codex tool event and removes the temporary workspace", async () => {
  let workspace = "";
  const client = new CodexCliModelClient({ outputSchema, outputField: "decision_json" }, {
    async run(input) {
      workspace = input.cwd;
      return result([
        JSON.stringify({ type: "thread.started", thread_id: "thread_forbidden" }),
        JSON.stringify({
          type: "item.completed",
          item: { id: "item_1", type: "command_execution", command: "pwd", status: "completed" }
        })
      ].join("\n"));
    }
  });
  await assert.rejects(
    client.create({ instructions: "No tools.", input: "Bounded Goal state." }),
    /forbidden item event: command_execution/
  );
  assert.equal(existsSync(workspace), false);
});

test("Codex CLI model fails closed for invalid JSONL, nonzero exit, timeout, output overflow, and invalid wrapper", async () => {
  const fixtures: Array<{ name: string; value: CodexExecResult; pattern: RegExp }> = [
    { name: "invalid JSONL", value: result("not-json"), pattern: /invalid JSONL/ },
    { name: "nonzero", value: { ...result(""), exitCode: 7, stderr: "api_key=SECRET_VALUE" }, pattern: /exited with code 7.*\[REDACTED\]/ },
    { name: "timeout", value: { ...result(""), timedOut: true }, pattern: /timed out/ },
    { name: "overflow", value: { ...result(""), outputExceeded: true }, pattern: /exceeded/ },
    { name: "wrapper", value: result(jsonl({ wrong: "shape" })), pattern: /missing non-empty decision_json/ }
  ];
  for (const fixture of fixtures) {
    await assert.rejects(
      new CodexCliModelClient({ outputSchema, outputField: "decision_json" }, {
        async run() { return fixture.value; }
      }).create({ instructions: fixture.name, input: "Bounded Goal state." }),
      fixture.pattern
    );
  }
});

test("Node Codex process runner enforces timeout and output capture limits", async () => {
  const runner = new NodeCodexExecRunner();
  const timeout = await runner.run({
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10000)"],
    cwd: process.cwd(),
    stdin: "",
    timeoutMs: 30,
    maxOutputChars: 1000
  });
  assert.equal(timeout.timedOut, true);

  const overflow = await runner.run({
    command: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(5000))"],
    cwd: process.cwd(),
    stdin: "",
    timeoutMs: 5000,
    maxOutputChars: 100
  });
  assert.equal(overflow.outputExceeded, true);
  assert.equal(overflow.stdout.length, 100);
});

function jsonl(finalMessage: Record<string, unknown>): string {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread_test" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({ type: "item.completed", item: { id: "item_1", type: "reasoning", text: "bounded" } }),
    JSON.stringify({ type: "item.completed", item: { id: "item_2", type: "agent_message", text: JSON.stringify(finalMessage) } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 10 } })
  ].join("\n");
}

function result(stdout: string): CodexExecResult {
  return {
    exitCode: 0,
    signal: null,
    stdout,
    stderr: "",
    timedOut: false,
    outputExceeded: false
  };
}
