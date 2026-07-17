import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import type { EffectAction } from "../packages/runtime/src/effect_policy.js";
import {
  CanonicalGoalVerifier,
  GoalRuntime,
  type GoalCognition,
  type GoalCognitionInput,
  type GoalCognitionResult,
  type GoalCommand,
  type GoalToolExecutor,
  type GoalVerificationInput,
  type GoalVerificationResult,
  type GoalVerifier
} from "../packages/runtime/src/goal_runtime.js";
import type { ToolResult } from "../packages/runtime/src/tools.js";

test("GoalRuntime owns safe action, observation, verification, and one receipt", async () => {
  const fixture = await createFixture();
  try {
    const cognition = sequenceCognition([
      action("file.read", { scope: "repo", path: "package.json" }, "Read the bounded package manifest."),
      outcome("已读取 package.json 并确认本地运行时包信息。")
    ]);
    const tools = recordingTools();
    const runtime = createRuntime(fixture.store, {
      cognition,
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("safe_start", "Read package metadata without changing files."));
    const completed = await runtime.handle({
      type: "continue",
      command_id: "safe_continue",
      goal_id: started.goal_id
    });

    assert.equal(completed.status, "completed");
    assert.equal(completed.goal_id, started.goal_id);
    assert.equal(completed.receipt?.decision, "accepted");
    assert.deepEqual(completed.receipt?.changes, []);
    assert.equal(tools.calls.length, 1);
    assert.equal(cognition.calls.length, 2);
    assert.deepEqual(completed.usage, { model_rounds: 2, tool_calls: 1, elapsed_ms: 30 });
    const events = await readEvents(fixture.stateRoot);
    assert.deepEqual(events.map((event) => event.event_type), [
      "goal_started",
      "goal_action_planned",
      "goal_action_observed",
      "goal_completed"
    ]);
    assert.deepEqual(
      completed.receipt?.evidence_event_ids,
      events.map((event) => event.id)
    );

    const beforeReplay = await snapshotFiles(fixture.stateRoot);
    const replayed = await runtime.handle({
      type: "continue",
      command_id: "safe_continue",
      goal_id: started.goal_id
    });
    assert.deepEqual(replayed, completed);
    assert.equal(tools.calls.length, 1);
    assert.equal(cognition.calls.length, 2);
    assert.deepEqual(await snapshotFiles(fixture.stateRoot), beforeReplay);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime soft budget checkpoints and continues the same identity", async () => {
  const fixture = await createFixture();
  try {
    const cognition = sequenceCognition([
      action("file.read", { scope: "repo", path: "README.md" }, "Read the entrypoint."),
      outcome("第二个 soft tranche 完成同一目标。")
    ]);
    const runtime = createRuntime(fixture.store, {
      cognition,
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle({
      ...start("budget_start", "Keep one identity across a soft budget."),
      budget: { max_model_rounds: 1, max_tool_calls: 4, max_elapsed_ms: 10_000 }
    });
    const checkpointed = await runtime.handle({
      type: "continue",
      command_id: "budget_continue_one",
      goal_id: started.goal_id
    });
    assert.equal(checkpointed.status, "active");
    assert.equal(checkpointed.goal_id, started.goal_id);
    assert.deepEqual(checkpointed.continuation_reasons, ["soft_budget_reached"]);
    assert.equal(checkpointed.continuation_required, true);

    const completed = await runtime.handle({
      type: "continue",
      command_id: "budget_continue_two",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.goal_id, started.goal_id);
    assert.equal(completed.usage.model_rounds, 2);
    assert.equal(completed.usage.tool_calls, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime never resumes an incomplete Continue after a later command", async () => {
  const fixture = await createFixture();
  try {
    const cognition = sequenceCognition([
      action("file.read", { scope: "repo", path: "README.md" }, "Read once before an interrupted cognition turn.")
    ]);
    const tools = recordingTools();
    const runtime = createRuntime(fixture.store, {
      cognition,
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("ordered_start", "Keep command history contiguous."));
    await runtime.handle({
      type: "continue",
      command_id: "ordered_incomplete",
      goal_id: started.goal_id
    });
    assert.equal(tools.calls.length, 1);
    const interruptedEvents = await readEvents(fixture.stateRoot);
    assert.equal(interruptedEvents.at(-1)!.event_type, "goal_blocked");
    await writeFile(
      join(fixture.stateRoot, "goals/events.jsonl"),
      `${interruptedEvents.slice(0, -1).map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8"
    );

    const paused = await runtime.handle({
      type: "pause",
      command_id: "ordered_pause",
      goal_id: started.goal_id,
      reason: "Operator established a later boundary."
    });
    const replayed = await runtime.handle({
      type: "continue",
      command_id: "ordered_incomplete",
      goal_id: started.goal_id
    });
    assert.deepEqual(replayed, paused);
    assert.equal(tools.calls.length, 1);
    assert.equal(cognition.calls.length, 2);
    assert.deepEqual(await runtime.read(started.goal_id), paused);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime manual pause and resume preserve checkpoint and identity", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("file.read", { scope: "repo", path: "README.md" }, "Observe one bounded fact after resume."),
        outcome("恢复后的同一目标已完成。")
      ]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("pause_start", "Pause and resume one goal."));
    const paused = await runtime.handle({
      type: "pause",
      command_id: "pause_command",
      goal_id: started.goal_id,
      reason: "Operator checkpoint."
    });
    assert.equal(paused.status, "paused");
    assert.deepEqual(paused.continuation_reasons, ["paused"]);
    await assert.rejects(runtime.handle({
      type: "continue",
      command_id: "pause_illegal_continue",
      goal_id: started.goal_id
    }), /cannot continue from paused/);
    const resumed = await runtime.handle({
      type: "resume",
      command_id: "pause_resume",
      goal_id: started.goal_id
    });
    assert.equal(resumed.status, "active");
    assert.equal(resumed.goal_id, started.goal_id);
    const completed = await runtime.handle({
      type: "continue",
      command_id: "pause_complete",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime keeps verification failure and later success on one identity", async () => {
  const fixture = await createFixture();
  try {
    let verifierCalls = 0;
    const verifier: GoalVerifier = {
      async verify(input) {
        verifierCalls += 1;
        if (verifierCalls === 1) return failedVerification(input, "Runtime health is not ready.");
        return passedVerification(input);
      }
    };
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        outcome("第一次候选仍需验证。", "degraded"),
        outcome("修复后候选已就绪。", "healthy")
      ]),
      tools: recordingTools(),
      verifier
    });
    const started = await runtime.handle(start("verify_start", "Verify and repair one goal."));
    const failed = await runtime.handle({
      type: "continue",
      command_id: "verify_first",
      goal_id: started.goal_id
    });
    assert.equal(failed.status, "active");
    assert.equal(failed.receipt, null);
    assert.deepEqual(failed.continuation_reasons, ["verification_failed"]);

    const completed = await runtime.handle({
      type: "continue",
      command_id: "verify_second",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.goal_id, started.goal_id);
    assert.equal(verifierCalls, 2);
  } finally {
    await fixture.cleanup();
  }
});

test("Canonical verifier rejects a change identity that is not an exact observation", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const goal = await runtime.handle(start("identity_start", "Bind the accepted change identity to observation."));
    const verification = await new CanonicalGoalVerifier().verify({
      goal,
      candidate: {
        summary: "A generic JSON boolean is not a typed change identity.",
        changes: [{ kind: "state_change", identity: "true" }],
        runtime_result: {
          status: "healthy",
          summary: "The runtime stayed healthy.",
          evidence_event_ids: ["goal_event_change"]
        },
        residual_risks: [],
        evidence_event_ids: ["goal_event_change"]
      },
      evidence: [{
        event_id: "goal_event_change",
        kind: "observation",
        summary: "Wrote one bounded file.",
        refs: ["docs/result.md"],
        occurred_at: "2026-07-17T00:00:01.000Z",
        operation: "write_local_repo",
        tool: "file.write_repo",
        ok: true,
        change: { kind: "state_change", identity: "docs/result.md" }
      }]
    });
    assert.equal(verification.status, "failed");
    assert.equal(verification.checks.some((check) => check.id === "change_set" && check.status === "failed"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("Canonical verifier accepts exact typed commit identity followed by verification", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const goal = await runtime.handle(start("typed_verifier_start", "Verify one exact commit identity."));
    const verification = await new CanonicalGoalVerifier().verify({
      goal,
      candidate: {
        summary: "The exact commit was followed by a successful verification.",
        changes: [{ kind: "git_commit", identity: "abc123" }],
        runtime_result: {
          status: "healthy",
          summary: "The bounded verification passed.",
          evidence_event_ids: ["goal_event_change", "goal_event_verify"]
        },
        residual_risks: [],
        evidence_event_ids: ["goal_event_change", "goal_event_verify"]
      },
      evidence: [{
        event_id: "goal_event_change",
        kind: "observation",
        summary: "Committed the bounded change.",
        refs: [],
        occurred_at: "2026-07-17T00:00:01.000Z",
        operation: "execute_dynamic_code",
        tool: "command.run",
        ok: true,
        change: { kind: "git_commit", identity: "abc123" }
      }, {
        event_id: "goal_event_verify",
        kind: "observation",
        summary: "Repository checks passed.",
        refs: [],
        occurred_at: "2026-07-17T00:00:02.000Z",
        operation: "run_local_verification",
        tool: "command.run",
        ok: true
      }]
    });
    assert.equal(verification.status, "passed");
  } finally {
    await fixture.cleanup();
  }
});

test("Canonical verifier rejects an incomplete change set", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const goal = await runtime.handle(start("unreported_change_start", "Do not hide any observed mutation."));
    const verification = await new CanonicalGoalVerifier().verify({
      goal,
      candidate: {
        summary: "The candidate incorrectly omits one change.",
        changes: [{ kind: "state_change", identity: "docs/first.md" }],
        runtime_result: {
          status: "healthy",
          summary: "The runtime stayed healthy.",
          evidence_event_ids: ["goal_event_first", "goal_event_second"]
        },
        residual_risks: [],
        evidence_event_ids: ["goal_event_first", "goal_event_second"]
      },
      evidence: [{
        event_id: "goal_event_first",
        kind: "observation",
        summary: "Wrote the first bounded file.",
        refs: ["docs/first.md"],
        occurred_at: "2026-07-17T00:00:01.000Z",
        operation: "write_local_repo",
        tool: "file.write_repo",
        ok: true,
        change: { kind: "state_change", identity: "docs/first.md" }
      }, {
        event_id: "goal_event_second",
        kind: "observation",
        summary: "Wrote the second bounded file.",
        refs: ["docs/second.md"],
        occurred_at: "2026-07-17T00:00:02.000Z",
        operation: "write_local_repo",
        tool: "file.write_repo",
        ok: true,
        change: { kind: "state_change", identity: "docs/second.md" }
      }]
    });
    assert.equal(verification.status, "failed");
    assert.equal(verification.checks.some((check) => check.id === "change_set"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime derives every typed observation into one complete receipt change set", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("file.write_repo", { path: "docs/first.md", text: "first" }, "Write the first bounded file."),
        action("file.write_repo", { path: "docs/second.md", text: "second" }, "Write the second bounded file."),
        outcome("两个已观察写入都由 runtime 绑定到一个 receipt。")
      ]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("complete_changes_start", "Preserve all observed change identities."));
    const completed = await runtime.handle({
      type: "continue",
      command_id: "complete_changes_continue",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.receipt?.changes, [
      { kind: "state_change", identity: "docs/first.md" },
      { kind: "state_change", identity: "docs/second.md" }
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime retains early changes beyond the recent evidence window", async () => {
  const fixture = await createFixture();
  try {
    const paths = Array.from({ length: 33 }, (_, index) => `docs/long-${index}.md`);
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        ...paths.map((path) => action("file.write_repo", { path, text: path }, `Write ${path}.`)),
        outcome("长 Goal 的完整 change lineage 已绑定。")
      ]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    let view = await runtime.handle(start("long_changes_start", "Preserve complete changes across many soft tranches."));
    let command = 0;
    while (view.status === "active") {
      view = await runtime.handle({
        type: "continue",
        command_id: `long_changes_continue_${command}`,
        goal_id: view.goal_id
      });
      command += 1;
      assert.ok(command < 20, "long goal should complete within bounded continuations");
    }

    assert.equal(view.status, "completed");
    assert.deepEqual(view.receipt?.changes, paths.map((identity) => ({ kind: "state_change", identity })));
  } finally {
    await fixture.cleanup();
  }
});

test("Canonical verifier rejects an intent-only no-change outcome", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([outcome("模型提议不能独立证明目标完成。")]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("intent_only_start", "Require observed evidence before completion."));
    const failed = await runtime.handle({
      type: "continue",
      command_id: "intent_only_continue",
      goal_id: started.goal_id
    });
    assert.equal(failed.status, "active");
    assert.deepEqual(failed.continuation_reasons, ["verification_failed"]);
    const completedEvent = (await readEvents(fixture.stateRoot)).at(-1)!;
    const verification = completedEvent.verification as { checks: Array<{ id: string; status: string }> };
    assert.equal(verification.checks.some((check) => check.id === "decisive_evidence" && check.status === "failed"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("Effect confirmation pauses one goal and executes only the exact confirmed action", async () => {
  const fixture = await createFixture();
  try {
    const cognition = sequenceCognition([
      action("command.run", {
        command: "git",
        args: ["push", "origin", "feature"],
        cwd: "repo",
        side_effect_level: "none"
      }, "Push would write externally."),
      outcome("精确确认后的本地观察已记录。")
    ]);
    const tools = recordingTools();
    const runtime = createRuntime(fixture.store, {
      cognition,
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("confirm_start", "Require exact confirmation for external effects."));
    const paused = await runtime.handle({
      type: "continue",
      command_id: "confirm_continue",
      goal_id: started.goal_id
    });
    assert.equal(paused.status, "paused");
    assert.deepEqual(paused.continuation_reasons, ["effect_confirmation_required"]);
    assert.equal(paused.pending_effect?.operation, "write_external");
    assert.deepEqual(paused.pending_effect?.proposed_action, {
      tool: "command.run",
      arguments: {
        command: "git",
        args: ["push", "origin", "feature"],
        cwd: "repo",
        side_effect_level: "none"
      }
    });
    assert.equal(tools.calls.length, 0);

    const replayed = await runtime.handle({
      type: "continue",
      command_id: "confirm_continue",
      goal_id: started.goal_id
    });
    assert.deepEqual(replayed, paused);
    assert.equal(tools.calls.length, 0);
    await assert.rejects(runtime.handle({
      type: "resume",
      command_id: "confirm_missing",
      goal_id: started.goal_id
    }), /requires --confirm-effect/);
    await assert.rejects(runtime.handle({
      type: "resume",
      command_id: "confirm_wrong",
      goal_id: started.goal_id,
      confirm_effect_id: "goal_effect_wrong"
    }), /does not match pending effect/);

    const confirmed = await runtime.handle({
      type: "resume",
      command_id: "confirm_exact",
      goal_id: started.goal_id,
      confirm_effect_id: paused.pending_effect!.effect_id
    });
    assert.equal(confirmed.status, "active");
    assert.equal(confirmed.pending_effect, null);
    assert.equal(tools.calls.length, 1);
    const replayedConfirmation = await runtime.handle({
      type: "resume",
      command_id: "confirm_exact",
      goal_id: started.goal_id,
      confirm_effect_id: paused.pending_effect!.effect_id
    });
    assert.deepEqual(replayedConfirmation, confirmed);
    assert.equal(tools.calls.length, 1);

    const completed = await runtime.handle({
      type: "continue",
      command_id: "confirm_complete",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
  } finally {
    await fixture.cleanup();
  }
});

test("Query-bearing outbound confirmation exposes the exact proposed request", async () => {
  const fixture = await createFixture();
  try {
    const url = "https://example.com/collect?q=bounded_value&limit=2";
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("http.fetch", { url, response_type: "json", max_chars: 1000 }, "Request one query-bearing public resource.")
      ]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("query_confirm_start", "Require informed confirmation for query egress."));
    const paused = await runtime.handle({
      type: "continue",
      command_id: "query_confirm_continue",
      goal_id: started.goal_id
    });

    assert.equal(paused.status, "paused");
    assert.equal(paused.pending_effect?.target, url);
    assert.deepEqual(paused.pending_effect?.proposed_action, {
      tool: "http.fetch",
      arguments: { url, response_type: "json", max_chars: 1000 }
    });
  } finally {
    await fixture.cleanup();
  }
});

test("Denied effects are canonical observations of policy and never dispatch", async () => {
  const fixture = await createFixture();
  try {
    const tools = recordingTools();
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("unknown.tool", { token: "must-not-persist", payload: "ignored" }, "Unknown effect."),
        action("http.fetch", { url: "https://example.com/data?api_key=TOP_SECRET_VALUE" }, "Secret egress must fail closed."),
        outcome("未知 effect 已被拒绝，目标没有产生副作用。")
      ]),
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("deny_start", "Deny unresolved effects."));
    const completed = await runtime.handle({
      type: "continue",
      command_id: "deny_continue",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
    assert.equal(tools.calls.length, 0);
    const events = await readEvents(fixture.stateRoot);
    const planned = events.find((event) => event.event_type === "goal_action_planned")!;
    assert.equal((planned.effect_decision as Record<string, unknown>).outcome, "deny");
    assert.equal(JSON.stringify(events).includes("must-not-persist"), false);
    assert.equal(JSON.stringify(events).includes("TOP_SECRET_VALUE"), false);
    assert.equal(planned.action_redacted, true);
  } finally {
    await fixture.cleanup();
  }
});

test("Unobserved allowed effect becomes outcome-unknown and is never repeated", async () => {
  const fixture = await createFixture();
  try {
    const tools = recordingTools();
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("file.read", { scope: "repo", path: "README.md" }, "Read once."),
        outcome("读取完成。")
      ]),
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("unknown_start", "Do not repeat an effect after an observation gap."));
    await runtime.handle({
      type: "continue",
      command_id: "unknown_continue",
      goal_id: started.goal_id
    });
    assert.equal(tools.calls.length, 1);
    const events = await readEvents(fixture.stateRoot);
    await writeFile(
      join(fixture.stateRoot, "goals/events.jsonl"),
      `${events.slice(0, 2).map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8"
    );

    const recovered = await runtime.read(started.goal_id);
    assert.equal(recovered.status, "paused");
    assert.deepEqual(recovered.continuation_reasons, ["effect_outcome_unknown"]);
    const replayed = await runtime.handle({
      type: "continue",
      command_id: "unknown_continue",
      goal_id: started.goal_id
    });
    assert.deepEqual(replayed, recovered);
    assert.equal(tools.calls.length, 1);
    await assert.rejects(runtime.handle({
      type: "resume",
      command_id: "unknown_resume",
      goal_id: started.goal_id,
      confirm_effect_id: recovered.pending_effect!.effect_id
    }), /will not be repeated/);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime writes no legacy orchestration or synchronous-learning state", async () => {
  const fixture = await createFixture();
  try {
    const legacyFiles = {
      "runs/task_queue.jsonl": "legacy queue\n",
      "autonomy/opportunities.jsonl": "legacy opportunity\n",
      "memory/working/current.json": "{\"legacy\":true}\n",
      "memory/episodes/events.jsonl": "legacy episode\n",
      "memory/episodes/legacy-completion-verification.json": "{\"legacy\":true}\n",
      "memory/episodes/iterations.jsonl": "legacy iteration\n",
      "sop/drafts/legacy.md": "legacy SOP\n",
      "skills/legacy/SKILL.md": "legacy skill\n",
      "deployments/current.json": "{\"legacy\":true}\n",
      "governance/adoptions.jsonl": "legacy adoption\n"
    };
    for (const [ref, contents] of Object.entries(legacyFiles)) {
      await writeFixtureFile(fixture.stateRoot, ref, contents);
    }
    const before = await snapshotFiles(fixture.stateRoot);
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("file.read", { scope: "repo", path: "README.md" }, "Observe without mutating legacy state."),
        outcome("无副作用目标已完成。")
      ]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("boundary_start", "Prove whole-goal orchestration isolation."));
    await runtime.handle({
      type: "continue",
      command_id: "boundary_continue",
      goal_id: started.goal_id
    });
    const after = await snapshotFiles(fixture.stateRoot);

    for (const [ref, contents] of Object.entries(legacyFiles)) {
      assert.equal(after.get(ref), contents, `legacy store changed: ${ref}`);
    }
    assert.deepEqual(
      [...after.keys()].filter((ref) => !before.has(ref)).sort(),
      [
        `goals/checkpoints/${started.goal_id}.json`,
        "goals/events.jsonl",
        `goals/receipts/${started.goal_id}.json`
      ].sort()
    );
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime projections are non-authoritative and canonical corruption fails closed", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("file.read", { scope: "repo", path: "README.md" }, "Observe before accepting the outcome."),
        outcome("投影可由事件恢复。")
      ]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("projection_start", "Read from canonical events."));
    const completed = await runtime.handle({
      type: "continue",
      command_id: "projection_continue",
      goal_id: started.goal_id
    });
    await writeFixtureFile(
      fixture.stateRoot,
      `goals/checkpoints/${started.goal_id}.json`,
      "{\"corrupted_projection\":true}\n"
    );
    assert.deepEqual(await runtime.read(started.goal_id), completed);
    await appendFile(join(fixture.stateRoot, "goals/events.jsonl"), "not-json\n", "utf8");
    await assert.rejects(runtime.read(started.goal_id), /canonical event JSON at line 5/);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime abandonment remains explicit and terminal", async () => {
  const fixture = await createFixture();
  try {
    let verifierCalls = 0;
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("file.write_repo", { path: "docs/partial.md", text: "partial" }, "Write one partial result."),
        { type: "blocked", summary: "The direction is no longer viable.", next_action: "Ask the operator to retire it." }
      ]),
      tools: recordingTools(),
      verifier: {
        async verify() {
          verifierCalls += 1;
          throw new Error("must not run");
        }
      }
    });
    const started = await runtime.handle(start("abandon_start", "Retire a direction explicitly."));
    const blocked = await runtime.handle({
      type: "continue",
      command_id: "abandon_partial_work",
      goal_id: started.goal_id
    });
    assert.equal(blocked.status, "active");
    const abandoned = await runtime.handle({
      type: "abandon",
      command_id: "abandon_command",
      goal_id: started.goal_id,
      reason: "The operator retired this direction."
    });
    assert.equal(abandoned.status, "abandoned");
    assert.equal(abandoned.receipt?.decision, "abandoned");
    assert.equal(abandoned.receipt?.verification.status, "not_run");
    assert.deepEqual(abandoned.receipt?.changes, [{ kind: "state_change", identity: "docs/partial.md" }]);
    const events = await readEvents(fixture.stateRoot);
    const observation = events.find((event) => event.event_type === "goal_action_observed")!;
    assert.equal(abandoned.receipt?.evidence_event_ids.includes(observation.id), true);
    assert.equal(verifierCalls, 0);
    await assert.rejects(runtime.handle({
      type: "resume",
      command_id: "abandon_resume",
      goal_id: started.goal_id
    }), /goal is terminal/);
  } finally {
    await fixture.cleanup();
  }
});

function start(commandId: string, objective: string): GoalCommand & { type: "start" } {
  return {
    type: "start",
    command_id: commandId,
    objective,
    budget: {
      max_model_rounds: 3,
      max_tool_calls: 4,
      max_elapsed_ms: 10_000
    }
  };
}

function action(tool: string, args: Record<string, unknown>, summary: string): GoalCognitionResult {
  return {
    type: "action",
    summary,
    action: { tool, arguments: args }
  };
}

function outcome(summary: string, runtimeStatus: "healthy" | "degraded" = "healthy"): GoalCognitionResult {
  return {
    type: "outcome",
    outcome: {
      summary,
      runtime_result: {
        status: runtimeStatus,
        summary: runtimeStatus === "healthy" ? "Bounded runtime result is healthy." : "Runtime result remains degraded."
      },
      residual_risks: []
    }
  };
}

function sequenceCognition(results: GoalCognitionResult[]): GoalCognition & { calls: GoalCognitionInput[] } {
  const queue = [...results];
  const calls: GoalCognitionInput[] = [];
  return {
    calls,
    async next(input) {
      calls.push(structuredClone(input));
      const next = queue.shift();
      if (!next) throw new Error("No deterministic cognition result remains");
      return structuredClone(next);
    }
  };
}

function recordingTools(): GoalToolExecutor & { calls: EffectAction[] } {
  const calls: EffectAction[] = [];
  return {
    calls,
    async execute(effectAction) {
      calls.push(structuredClone(effectAction));
      return {
        id: `tool_result_${calls.length}`,
        tool: effectAction.tool,
        ok: true,
        summary: `Executed ${effectAction.tool}.`,
        output: effectAction.tool === "file.read"
          ? { path: effectAction.arguments.path, text: "bounded fixture content" }
          : effectAction.tool === "file.write_repo" || effectAction.tool === "file.write_state"
            ? {
                path: effectAction.arguments.path,
                observed: true,
                change: { kind: "state_change", identity: effectAction.arguments.path }
              }
            : { observed: true },
        side_effect_level: effectAction.tool === "file.read" ? "none" : "local_write",
        created_at: `2026-07-17T00:10:${String(calls.length).padStart(2, "0")}.000Z`
      } satisfies ToolResult;
    }
  };
}

function passedVerification(input: GoalVerificationInput): GoalVerificationResult {
  return {
    status: "passed",
    summary: "The canonical evidence supports the outcome.",
    checks: [{
      id: "interface_acceptance",
      status: "passed",
      summary: "The same-goal canonical events support acceptance.",
      evidence_event_ids: input.candidate.evidence_event_ids
    }],
    next_action: null
  };
}

function failedVerification(input: GoalVerificationInput, summary: string): GoalVerificationResult {
  return {
    status: "failed",
    summary,
    checks: [{
      id: "runtime_health",
      status: "failed",
      summary,
      evidence_event_ids: input.candidate.evidence_event_ids
    }],
    next_action: "Repair the runtime evidence and continue the same goal."
  };
}

function createRuntime(
  store: AgentStore,
  args: { cognition: GoalCognition; tools: GoalToolExecutor; verifier: GoalVerifier },
  namespace = ""
): GoalRuntime {
  const counts = new Map<string, number>();
  let wallTick = 0;
  let monotonicTick = 0;
  return new GoalRuntime({
    store,
    cognition: args.cognition,
    toolExecutor: args.tools,
    verifier: args.verifier,
    idFactory(prefix) {
      const count = (counts.get(prefix) ?? 0) + 1;
      counts.set(prefix, count);
      return namespace ? `${prefix}_${namespace}_${count}` : `${prefix}_${count}`;
    },
    now() {
      wallTick += 1;
      return `2026-07-17T00:00:${String(wallTick).padStart(2, "0")}.000Z`;
    },
    nowMs() {
      monotonicTick += 10;
      return monotonicTick;
    }
  });
}

async function readEvents(stateRoot: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(join(stateRoot, "goals/events.jsonl"), "utf8");
  return raw.trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function writeFixtureFile(root: string, ref: string, contents: string): Promise<void> {
  const path = join(root, ref);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

async function snapshotFiles(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else result.set(relative(root, path), await readFile(path, "utf8"));
    }
  }
  await walk(root);
  return result;
}

async function createFixture(): Promise<{
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `evi-goal-runtime-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    stateRoot,
    store: new AgentStore(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
