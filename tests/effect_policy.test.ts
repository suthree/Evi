import assert from "node:assert/strict";
import test from "node:test";
import { EffectPolicy } from "../packages/runtime/src/effect_policy.js";

test("EffectPolicy distinguishes read, local write, and protected Goal state", () => {
  const policy = new EffectPolicy();
  assert.equal(policy.decide({
    tool: "file.read",
    arguments: { scope: "repo", path: "README.md" }
  }).outcome, "allow");
  assert.equal(policy.decide({
    tool: "file.write_state",
    arguments: { path: "scratch/result.json", text: "ok" }
  }).outcome, "allow");
  assert.equal(policy.decide({
    tool: "file.write_state",
    arguments: { path: "goals/events.jsonl", text: "forged" }
  }).outcome, "deny");
  assert.equal(policy.decide({
    tool: "file.write_state",
    arguments: { path: "memory/episodes/events.jsonl", text: "parallel evidence" }
  }).outcome, "deny");
  assert.equal(policy.decide({
    tool: "file.write_state",
    arguments: { path: "sop/drafts/foreground.md", text: "synchronous learning" }
  }).outcome, "deny");
  assert.equal(policy.decide({
    tool: "file.read",
    arguments: { scope: "repo", path: ".env" }
  }).outcome, "deny");
});

test("EffectPolicy classifies command semantics instead of model side-effect labels", () => {
  const policy = new EffectPolicy();
  const read = policy.decide({
    tool: "command.run",
    arguments: {
      command: "git",
      args: ["status", "--short"],
      side_effect_level: "external_write"
    }
  });
  const external = policy.decide({
    tool: "command.run",
    arguments: {
      command: "git",
      args: ["push", "origin", "feature"],
      side_effect_level: "none"
    }
  });
  const destructive = policy.decide({
    tool: "command.run",
    arguments: {
      command: "rm",
      args: ["-rf", "build"],
      side_effect_level: "none"
    }
  });
  const check = policy.decide({
    tool: "command.run",
    arguments: {
      command: "pnpm",
      args: ["run", "check"],
      side_effect_level: "external_write"
    }
  });
  assert.deepEqual([read.outcome, external.outcome, destructive.outcome, check.outcome], [
    "allow",
    "confirm",
    "deny",
    "confirm"
  ]);
  assert.equal(read.intent.operation, "read_local");
  assert.equal(external.intent.operation, "write_external");
  assert.equal(policy.decide({
    tool: "command.run",
    arguments: { command: "sed", args: ["-i", "", "s/a/b/", "goals/events.jsonl"], cwd: "state" }
  }).outcome, "deny");
  assert.equal(policy.decide({
    tool: "command.run",
    arguments: { command: "git", args: ["worktree", "remove", "--force", "other"] }
  }).outcome, "deny");
  assert.equal(policy.decide({
    tool: "command.run",
    arguments: { command: "git", args: ["commit", "--dry-run", "-m", "probe"] }
  }).outcome, "deny");
  assert.equal(policy.decide({
    tool: "command.run",
    arguments: { command: "rg", args: ["--pre", "sh -c mutate", "needle"] }
  }).outcome, "confirm");
  assert.equal(policy.decide({
    tool: "command.run",
    arguments: { command: "pnpm", args: ["run", "check"], cwd: "state" }
  }).outcome, "deny");
  assert.equal(policy.decide({
    tool: "command.run",
    arguments: { command: "node", args: ["--require", "./hook.js", "--test"] }
  }).outcome, "confirm");
});

test("EffectPolicy permits public fetches and denies secret-bearing egress or unknown tools", () => {
  const policy = new EffectPolicy();
  assert.equal(policy.decide({
    tool: "http.fetch",
    arguments: { url: "https://example.com/public.json" }
  }).outcome, "allow");
  assert.equal(policy.decide({
    tool: "http.fetch",
    arguments: { url: "https://example.com/data?api_key=secret" }
  }).outcome, "deny");
  const queryFetch = policy.decide({
    tool: "http.fetch",
    arguments: { url: "https://example.com/collect?q=PRIVATE_LOCAL_TEXT" }
  });
  assert.equal(queryFetch.outcome, "confirm");
  assert.equal(queryFetch.intent.target, "https://example.com/collect?q=PRIVATE_LOCAL_TEXT");
  assert.equal(policy.decide({
    tool: "http.fetch",
    arguments: { url: "http://127.0.0.1:8765/private" }
  }).outcome, "deny");
  for (const url of [
    "http://169.254.169.254/latest/meta-data/",
    "http://0.0.0.0/private",
    "http://[fd00::1]/private",
    "http://[fe80::1]/private"
  ]) {
    assert.equal(policy.decide({ tool: "http.fetch", arguments: { url } }).outcome, "deny", url);
  }
  assert.equal(policy.decide({
    tool: "unknown.tool",
    arguments: {}
  }).outcome, "deny");
  assert.equal(policy.decide({
    tool: "codex.run",
    arguments: { mode: "new", worktree: "/tmp/worktree" }
  }).outcome, "confirm");
});
