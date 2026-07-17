import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
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

test("GoalRuntime binds new goals to one Git worktree authority", async () => {
  const fixture = await createFixture();
  try {
    const cognition = sequenceCognition([
      action("file.read", { scope: "repo", path: "README.md" }, "Read one bounded fact under the bound worktree."),
      outcome("当前 worktree 的有界目标已完成。")
    ]);
    const runtime = createRuntime(fixture.store, {
      cognition,
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("authority_start", "Stay bound to one Git worktree."));

    assert.equal(started.repository_authority?.repo_root, await realpath(fixture.repoRoot));
    assert.equal(started.repository_authority?.worktree, await realpath(fixture.repoRoot));
    assert.equal(started.repository_authority?.branch, "develop");
    assert.match(started.repository_authority?.start_head_commit ?? "", /^[a-f0-9]{40}$/);
    const [startEvent] = await readEvents(fixture.stateRoot);
    assert.deepEqual(startEvent?.repository_authority, started.repository_authority);

    const siblingRoot = join(fixture.root, "sibling-worktree");
    await runGoalGit(fixture.repoRoot, ["worktree", "add", "-b", "codex/authority-mismatch", siblingRoot]);
    const foreignCognition = sequenceCognition([outcome("不应在另一个 worktree 中执行。")]);
    const foreignRuntime = createRuntime(new AgentStore(siblingRoot, fixture.stateRoot), {
      cognition: foreignCognition,
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    }, "foreign");

    await assert.rejects(foreignRuntime.handle({
      type: "continue",
      command_id: "authority_foreign_continue",
      goal_id: started.goal_id
    }), /repository authority mismatch/i);
    assert.equal(foreignCognition.calls.length, 0);

    const completed = await runtime.handle({
      type: "continue",
      command_id: "authority_same_continue",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime reads legacy goals but refuses to silently bind their continuation", async () => {
  const fixture = await createFixture();
  try {
    const cognition = sequenceCognition([outcome("Legacy continuation must not execute.")]);
    const runtime = createRuntime(fixture.store, {
      cognition,
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("legacy_authority_start", "Keep historical Goal events readable."));
    const events = await readEvents(fixture.stateRoot);
    delete events[0]!.repository_authority;
    await writeFile(
      join(fixture.stateRoot, "goals/events.jsonl"),
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8"
    );

    const legacy = await runtime.read(started.goal_id);
    assert.equal(legacy.repository_authority, null);
    await assert.rejects(runtime.handle({
      type: "continue",
      command_id: "legacy_authority_continue",
      goal_id: started.goal_id
    }), /legacy goal has no repository authority/i);
    assert.equal(cognition.calls.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime rejects a codex.run target in a sibling worktree before planning or execution", async () => {
  const fixture = await createFixture();
  try {
    const boundRoot = join(fixture.root, "bound-worktree");
    const siblingRoot = join(fixture.root, "sibling-codex-worktree");
    await runGoalGit(fixture.repoRoot, ["worktree", "add", "-b", "codex/goal-bound", boundRoot]);
    await runGoalGit(fixture.repoRoot, ["worktree", "add", "-b", "codex/goal-sibling", siblingRoot]);
    const startHead = await goalGitValue(boundRoot, ["rev-parse", "HEAD"]);
    const tools = recordingTools();
    const cognition = sequenceCognition([action("codex.run", {
      mode: "new",
      prompt: "Mutate the wrong sibling worktree.",
      base_commit: startHead,
      branch: "codex/goal-sibling",
      worktree: siblingRoot,
      cwd: siblingRoot,
      model: "gpt-5.6-terra",
      profile: "fast",
      reasoning_effort: "medium",
      service_tier: "fast",
      sandbox: "workspace-write",
      approval_policy: "never",
      selection_rationale: "Synthetic authority mismatch fixture.",
      task_shape: "One bounded coding task.",
      delegation_strategy: {
        mode: "single",
        max_subagents: 0,
        independent_workstreams: [],
        integration_owner: "main_codex_thread"
      },
      budgets: {
        timeout_ms: 2_000,
        max_output_chars: 8_000,
        max_context_chars: 8_000,
        max_tool_calls: 4,
        max_retries: 0
      }
    }, "Attempt a delegated mutation outside the Goal authority.")]);
    const runtime = createRuntime(new AgentStore(boundRoot, fixture.stateRoot), {
      cognition,
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("codex_target_authority_start", "Keep delegated coding inside one worktree."));
    const blocked = await runtime.handle({
      type: "continue",
      command_id: "codex_target_authority_continue",
      goal_id: started.goal_id
    });

    assert.equal(blocked.status, "active");
    assert.deepEqual(blocked.continuation_reasons, ["blocked"]);
    assert.match(blocked.checkpoint.summary, /codex\.run.*Goal.*worktree authority/i);
    assert.equal(tools.calls.length, 0);
    const events = await readEvents(fixture.stateRoot);
    assert.equal(events.some((event) => event.event_type === "goal_action_planned"), false);
  } finally {
    await fixture.cleanup();
  }
});

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
    assert.deepEqual(cognition.calls.map((call) => call.execution_budget), [
      {
        scope: "per_continue_command",
        limit: { max_model_rounds: 3, max_tool_calls: 4, max_elapsed_ms: 10_000 },
        used: { model_rounds: 0, tool_calls: 0, elapsed_ms: 0 },
        remaining: { model_rounds: 3, tool_calls: 4, elapsed_ms: 10_000 }
      },
      {
        scope: "per_continue_command",
        limit: { max_model_rounds: 3, max_tool_calls: 4, max_elapsed_ms: 10_000 },
        used: { model_rounds: 1, tool_calls: 1, elapsed_ms: 20 },
        remaining: { model_rounds: 2, tool_calls: 3, elapsed_ms: 9_980 }
      }
    ]);
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
    const priorRefs = Array.from({ length: 32 }, (_, index) => `docs/prior-${index}.md`);
    const workingSummary = "Confirmed the entrypoint scope; README.md is the next bounded read before inspecting runtime ownership.";
    const cognition = sequenceCognition([
      action("file.read", { scope: "repo", path: "README.md" }, workingSummary),
      outcome("第二个 soft tranche 完成同一目标。")
    ]);
    const runtime = createRuntime(fixture.store, {
      cognition,
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle({
      ...start("budget_start", "Keep one identity across a soft budget."),
      budget: { max_model_rounds: 1, max_tool_calls: 4, max_elapsed_ms: 10_000 },
      checkpoint: {
        cursor: "seed",
        summary: "Seed working synthesis.",
        next_action: "Read README.md.",
        selected_refs: priorRefs
      }
    });
    const checkpointed = await runtime.handle({
      type: "continue",
      command_id: "budget_continue_one",
      goal_id: started.goal_id
    });
    assert.equal(checkpointed.status, "active");
    assert.equal(checkpointed.goal_id, started.goal_id);
    assert.equal(checkpointed.budget_scope, "per_continue_command");
    assert.deepEqual(checkpointed.continuation_reasons, ["soft_budget_reached"]);
    assert.equal(checkpointed.continuation_required, true);
    assert.equal(checkpointed.checkpoint.summary, workingSummary);
    assert.deepEqual(checkpointed.checkpoint.selected_refs, [
      ...priorRefs.slice(1),
      "README.md"
    ]);
    const checkpointProjection = JSON.parse(await readFile(
      join(fixture.stateRoot, `goals/checkpoints/${started.goal_id}.json`),
      "utf8"
    )) as Record<string, unknown>;
    assert.equal(checkpointProjection.budget_scope, "per_continue_command");
    assert.deepEqual(cognition.calls[0]!.execution_budget, {
      scope: "per_continue_command",
      limit: { max_model_rounds: 1, max_tool_calls: 4, max_elapsed_ms: 10_000 },
      used: { model_rounds: 0, tool_calls: 0, elapsed_ms: 0 },
      remaining: { model_rounds: 1, tool_calls: 4, elapsed_ms: 10_000 }
    });

    const completed = await runtime.handle({
      type: "continue",
      command_id: "budget_continue_two",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.goal_id, started.goal_id);
    assert.equal(completed.usage.model_rounds, 2);
    assert.equal(completed.usage.tool_calls, 1);
    assert.equal(cognition.calls[1]!.goal.usage.model_rounds, 1);
    assert.equal(cognition.calls[1]!.goal.checkpoint.summary, workingSummary);
    assert.deepEqual(cognition.calls[1]!.goal.checkpoint.selected_refs, [
      ...priorRefs.slice(1),
      "README.md"
    ]);
    const softBudgetEvidence = cognition.calls[1]!.evidence.find((item) => item.kind === "pause");
    assert.equal(softBudgetEvidence?.summary, "Soft execution budget reached; continue the same Goal in a new tranche.");
    assert.deepEqual(softBudgetEvidence?.refs, []);
    assert.deepEqual(cognition.calls[1]!.execution_budget, {
      scope: "per_continue_command",
      limit: { max_model_rounds: 1, max_tool_calls: 4, max_elapsed_ms: 10_000 },
      used: { model_rounds: 0, tool_calls: 0, elapsed_ms: 0 },
      remaining: { model_rounds: 1, tool_calls: 4, elapsed_ms: 10_000 }
    });
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime preserves working synthesis while canonical evidence carries a failed observation", async () => {
  const fixture = await createFixture();
  try {
    const workingSummary = "Confirmed the package boundary; the manifest read is next and any tool failure must be recovered before completion.";
    const cognition = sequenceCognition([
      action("file.read", { scope: "repo", path: "package.json" }, workingSummary),
      {
        type: "blocked",
        summary: "The canonical read failed and requires a bounded recovery.",
        next_action: "Repair the file reader and continue this Goal."
      }
    ]);
    const tools: GoalToolExecutor = {
      async execute(effectAction) {
        return {
          id: "tool_result_failed_read",
          tool: effectAction.tool,
          ok: false,
          summary: "Fixture read failed.",
          output: { failure_kind: "fixture_read_failure", path: "package.json" },
          side_effect_level: "none",
          created_at: "2026-07-17T00:10:01.000Z"
        };
      }
    };
    const runtime = createRuntime(fixture.store, {
      cognition,
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle({
      ...start("failed_observation_start", "Recover a failed read without losing the working synthesis."),
      budget: { max_model_rounds: 1, max_tool_calls: 4, max_elapsed_ms: 10_000 },
      checkpoint: {
        cursor: "seed",
        summary: "Seed working synthesis.",
        next_action: "Read package.json.",
        selected_refs: ["package.json", "docs/legacy.md", "docs/other.md", "docs/legacy.md"]
      }
    });

    const checkpointed = await runtime.handle({
      type: "continue",
      command_id: "failed_observation_one",
      goal_id: started.goal_id
    });
    assert.equal(checkpointed.status, "active");
    assert.equal(checkpointed.checkpoint.summary, workingSummary);
    assert.equal(checkpointed.checkpoint.next_action, "Continue the same goal with another soft execution tranche.");
    assert.deepEqual(checkpointed.checkpoint.selected_refs, ["docs/other.md", "docs/legacy.md", "package.json"]);

    await runtime.handle({
      type: "continue",
      command_id: "failed_observation_two",
      goal_id: started.goal_id
    });
    assert.equal(cognition.calls[1]!.goal.checkpoint.summary, workingSummary);
    const failedObservation = cognition.calls[1]!.evidence.find((item) => item.kind === "observation");
    assert.equal(failedObservation?.ok, false);
    assert.equal(failedObservation?.summary, "Fixture read failed.");
    assert.deepEqual(failedObservation?.refs, ["package.json"]);
    assert.equal(checkpointed.checkpoint.selected_refs.filter((ref) => ref === "package.json").length, 1);
    const softBudgetEvidence = cognition.calls[1]!.evidence.find((item) => item.kind === "pause");
    assert.equal(softBudgetEvidence?.summary, "Soft execution budget reached; continue the same Goal in a new tranche.");
    assert.deepEqual(softBudgetEvidence?.refs, []);
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

test("Canonical verifier requires later local verification for delegated workspace paths", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([]),
      tools: recordingTools(),
      verifier: new CanonicalGoalVerifier()
    });
    const goal = await runtime.handle(start("workspace_path_verifier_start", "Verify delegated workspace changes."));
    const changeEvidence = {
      event_id: "goal_event_workspace_change",
      kind: "observation" as const,
      summary: "Codex introduced one repository path.",
      refs: ["packages/runtime/src/goal_runtime.ts"],
      occurred_at: "2026-07-17T00:00:01.000Z",
      operation: "execute_dynamic_code" as const,
      tool: "codex.run",
      ok: true,
      changes: [{ kind: "workspace_path" as const, identity: "packages/runtime/src/goal_runtime.ts" }]
    };
    const candidate = {
      summary: "The delegated path is attributed to canonical Git status evidence.",
      changes: [{ kind: "workspace_path" as const, identity: "packages/runtime/src/goal_runtime.ts" }],
      runtime_result: {
        status: "healthy" as const,
        summary: "The bounded runtime remained healthy.",
        evidence_event_ids: ["goal_event_workspace_change"]
      },
      residual_risks: [],
      evidence_event_ids: ["goal_event_workspace_change"]
    };

    const unverified = await new CanonicalGoalVerifier().verify({
      goal,
      candidate,
      evidence: [changeEvidence]
    });
    assert.equal(unverified.status, "failed");
    assert.equal(unverified.checks.some((check) => check.id === "post_change_verification" && check.status === "failed"), true);

    const verified = await new CanonicalGoalVerifier().verify({
      goal,
      candidate: {
        ...candidate,
        runtime_result: {
          ...candidate.runtime_result,
          evidence_event_ids: ["goal_event_workspace_change", "goal_event_workspace_verify"]
        },
        evidence_event_ids: ["goal_event_workspace_change", "goal_event_workspace_verify"]
      },
      evidence: [changeEvidence, {
        event_id: "goal_event_workspace_verify",
        kind: "observation",
        summary: "Repository checks passed after the delegated mutation.",
        refs: [],
        occurred_at: "2026-07-17T00:00:02.000Z",
        operation: "run_local_verification",
        tool: "command.run",
        ok: true
      }]
    });
    assert.equal(verified.status, "passed");
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime carries plural delegated paths into one receipt after verification", async () => {
  const fixture = await createFixture();
  try {
    const tools: GoalToolExecutor = {
      async execute(effectAction) {
        if (effectAction.tool === "file.write_repo") {
          return {
            id: "tool_result_delegated_paths",
            tool: effectAction.tool,
            ok: true,
            summary: "Synthetic delegated write introduced two paths.",
            output: {
              changes: [
                { kind: "workspace_path", identity: "packages/runtime/src/goal_runtime.ts" },
                { kind: "workspace_path", identity: "tests/goal_runtime.test.ts" }
              ]
            },
            side_effect_level: "local_write",
            created_at: "2026-07-17T00:00:01.000Z"
          };
        }
        return {
          id: "tool_result_delegated_verify",
          tool: effectAction.tool,
          ok: true,
          summary: "Synthetic post-change verification passed.",
          output: {},
          side_effect_level: "local_reversible",
          created_at: "2026-07-17T00:00:02.000Z"
        };
      }
    };
    const cognition = sequenceCognition([
      action("file.write_repo", { path: "docs/delegated.md", text: "bounded" }, "Delegate one bounded workspace change."),
      outcome("委派结果尚待变更后验证。"),
      action("command.run", {
        command: "pnpm",
        args: ["run", "build"],
        cwd: "repo",
        side_effect_level: "local_reversible"
      }, "Run a later local verification over the attributed workspace."),
      outcome("委派变更已经后续本地验证。")
    ]);
    const runtime = createRuntime(fixture.store, { cognition, tools, verifier: new CanonicalGoalVerifier() });
    const started = await runtime.handle(start("plural_paths_start", "Attribute and verify delegated workspace paths."));
    const failed = await runtime.handle({
      type: "continue",
      command_id: "plural_paths_unverified",
      goal_id: started.goal_id
    });
    assert.deepEqual(failed.continuation_reasons, ["verification_failed"]);

    const verificationPaused = await runtime.handle({
      type: "continue",
      command_id: "plural_paths_verified",
      goal_id: started.goal_id
    });
    assert.deepEqual(verificationPaused.continuation_reasons, ["effect_confirmation_required"]);
    await runtime.handle({
      type: "resume",
      command_id: "plural_paths_verify_confirmed",
      goal_id: started.goal_id,
      confirm_effect_id: verificationPaused.pending_effect!.effect_id
    });
    const completed = await runtime.handle({
      type: "continue",
      command_id: "plural_paths_completed",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.receipt?.changes, [
      { kind: "workspace_path", identity: "packages/runtime/src/goal_runtime.ts" },
      { kind: "workspace_path", identity: "tests/goal_runtime.test.ts" }
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime accepts one bounded 200-path codex.run lineage after later verification", async () => {
  const fixture = await createFixture();
  try {
    const boundRoot = join(fixture.root, "capacity-worktree");
    await runGoalGit(fixture.repoRoot, ["worktree", "add", "-b", "codex/goal-capacity", boundRoot]);
    const startHead = await goalGitValue(boundRoot, ["rev-parse", "HEAD"]);
    const changes = Array.from({ length: 200 }, (_, index) => ({
      kind: "workspace_path" as const,
      identity: `generated/path-${String(index).padStart(3, "0")}.ts`
    }));
    const tools: GoalToolExecutor = {
      async execute(effectAction) {
        return effectAction.tool === "codex.run"
          ? {
              id: "tool_result_200_paths",
              tool: effectAction.tool,
              ok: true,
              summary: "Synthetic bounded Codex observation contains 200 paths.",
              output: { changes },
              side_effect_level: "local_write",
              created_at: "2026-07-17T00:00:01.000Z"
            }
          : {
              id: "tool_result_200_paths_verify",
              tool: effectAction.tool,
              ok: true,
              summary: "Synthetic post-change verification passed.",
              output: {},
              side_effect_level: "local_reversible",
              created_at: "2026-07-17T00:00:02.000Z"
            };
      }
    };
    const cognition = sequenceCognition([
      action("codex.run", {
        mode: "new",
        prompt: "Create the bounded generated path set.",
        base_commit: startHead,
        branch: "codex/goal-capacity",
        worktree: ".",
        cwd: ".",
        model: "gpt-5.6-terra",
        profile: "fast",
        reasoning_effort: "medium",
        service_tier: "fast",
        sandbox: "workspace-write",
        approval_policy: "never",
        selection_rationale: "Synthetic bounded capacity fixture.",
        task_shape: "One bounded coding task with 200 paths.",
        delegation_strategy: {
          mode: "single",
          max_subagents: 0,
          independent_workstreams: [],
          integration_owner: "main_codex_thread"
        },
        budgets: {
          timeout_ms: 2_000,
          max_output_chars: 8_000,
          max_context_chars: 8_000,
          max_tool_calls: 4,
          max_retries: 0
        }
      }, "Delegate one bounded 200-path change set."),
      action("command.run", {
        command: "pnpm",
        args: ["run", "build"],
        cwd: "repo",
        side_effect_level: "local_reversible"
      }, "Verify all attributed paths in the bound worktree."),
      outcome("200 个有界路径均已归因并完成后续本地验证。")
    ]);
    const runtime = createRuntime(new AgentStore(boundRoot, fixture.stateRoot), {
      cognition,
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    const started = await runtime.handle(start("codex_200_paths_start", "Attribute one bounded 200-path delegated change set."));
    const codexPaused = await runtime.handle({
      type: "continue",
      command_id: "codex_200_paths_plan",
      goal_id: started.goal_id
    });
    await runtime.handle({
      type: "resume",
      command_id: "codex_200_paths_confirm",
      goal_id: started.goal_id,
      confirm_effect_id: codexPaused.pending_effect!.effect_id
    });
    const verificationPaused = await runtime.handle({
      type: "continue",
      command_id: "codex_200_paths_verify_plan",
      goal_id: started.goal_id
    });
    await runtime.handle({
      type: "resume",
      command_id: "codex_200_paths_verify_confirm",
      goal_id: started.goal_id,
      confirm_effect_id: verificationPaused.pending_effect!.effect_id
    });
    const completed = await runtime.handle({
      type: "continue",
      command_id: "codex_200_paths_complete",
      goal_id: started.goal_id
    });

    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.receipt?.changes, changes);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime preserves a large commit control field and pins its later verification", async () => {
  const fixture = await createFixture();
  try {
    const calls: EffectAction[] = [];
    const tools: GoalToolExecutor = {
      async execute(effectAction) {
        calls.push(structuredClone(effectAction));
        const command = effectAction.arguments.command;
        const isCommit = effectAction.tool === "command.run" && command === "git";
        return {
          id: `tool_result_large_commit_${calls.length}`,
          tool: effectAction.tool,
          ok: true,
          summary: `Executed ${effectAction.tool}.`,
          output: isCommit
            ? {
                change: { kind: "git_commit", identity: "abc123" },
                padding: "x".repeat(81_000)
              }
            : effectAction.tool === "file.read"
              ? { path: effectAction.arguments.path, text: "bounded fixture content" }
              : { observed: true },
          side_effect_level: isCommit ? "local_write" : effectAction.tool === "file.read" ? "none" : "local_reversible",
          created_at: `2026-07-17T00:20:${String(calls.length).padStart(2, "0")}.000Z`
        } satisfies ToolResult;
      }
    };
    const trailingReads = Array.from({ length: 33 }, (_, index) => `docs/read-${index}.md`);
    const runtime = createRuntime(fixture.store, {
      cognition: sequenceCognition([
        action("command.run", { command: "git", args: ["commit", "-m", "bounded"], cwd: "repo" }, "Create one bounded commit."),
        action("command.run", { command: "pnpm", args: ["run", "check"], cwd: "repo" }, "Verify the commit."),
        ...trailingReads.map((path) => action("file.read", { scope: "repo", path }, `Read ${path}.`)),
        outcome("大型 commit observation 与其后验证均被完整绑定。")
      ]),
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    let view = await runtime.handle(start("large_commit_start", "Retain typed control facts independently of diagnostic payloads."));
    view = await runtime.handle({ type: "continue", command_id: "large_commit_plan", goal_id: view.goal_id });
    assert.equal(view.status, "paused");
    view = await runtime.handle({
      type: "resume",
      command_id: "large_commit_confirm",
      goal_id: view.goal_id,
      confirm_effect_id: view.pending_effect!.effect_id
    });
    view = await runtime.handle({ type: "continue", command_id: "large_verify_plan", goal_id: view.goal_id });
    assert.equal(view.status, "paused");
    view = await runtime.handle({
      type: "resume",
      command_id: "large_verify_confirm",
      goal_id: view.goal_id,
      confirm_effect_id: view.pending_effect!.effect_id
    });
    let continuation = 0;
    while (view.status === "active") {
      view = await runtime.handle({
        type: "continue",
        command_id: `large_commit_continue_${continuation}`,
        goal_id: view.goal_id
      });
      continuation += 1;
      assert.ok(continuation < 20, "commit trajectory should complete within bounded continuations");
    }

    assert.equal(view.status, "completed");
    assert.deepEqual(view.receipt?.changes, [{ kind: "git_commit", identity: "abc123" }]);
    const events = await readEvents(fixture.stateRoot);
    const observations = events.filter((event) => event.event_type === "goal_action_observed");
    const commitObservation = observations[0]!;
    const verificationObservation = observations[1]!;
    assert.equal((commitObservation.result as { output: { truncated: boolean } }).output.truncated, true);
    assert.deepEqual(
      (commitObservation.result as { output: { change: unknown } }).output.change,
      { kind: "git_commit", identity: "abc123" }
    );
    assert.equal(view.receipt?.evidence_event_ids.includes(verificationObservation.id as string), true);
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

test("GoalRuntime blocks a capacity-breaking effect before dispatch and remains abandonable", async () => {
  const fixture = await createFixture();
  try {
    const boundRoot = join(fixture.root, "capacity-guard-worktree");
    await runGoalGit(fixture.repoRoot, ["worktree", "add", "-b", "codex/goal-capacity-guard", boundRoot]);
    const startHead = await goalGitValue(boundRoot, ["rev-parse", "HEAD"]);
    const retainedChanges = Array.from({ length: 56 }, (_, index) => ({
      kind: "state_change" as const,
      identity: `docs/capacity-retained-${String(index).padStart(2, "0")}.md`
    }));
    const calls: EffectAction[] = [];
    const tools: GoalToolExecutor = {
      async execute(effectAction) {
        calls.push(structuredClone(effectAction));
        return {
          id: "tool_result_capacity_seed",
          tool: effectAction.tool,
          ok: true,
          summary: "Synthetic harness observation retained 56 bounded identities.",
          output: { changes: retainedChanges },
          side_effect_level: "local_write",
          created_at: "2026-07-17T00:00:01.000Z"
        };
      }
    };
    const runtime = createRuntime(new AgentStore(boundRoot, fixture.stateRoot), {
      cognition: sequenceCognition([
        action("file.write_repo", { path: "docs/capacity-seed.md", text: "seed" }, "Observe one bounded multi-identity harness mutation."),
        action("codex.run", {
          mode: "new",
          prompt: "Attempt an atomic delegated observation after capacity is no longer sufficient.",
          base_commit: startHead,
          branch: "codex/goal-capacity-guard",
          worktree: ".",
          cwd: ".",
          model: "gpt-5.6-terra",
          profile: "fast",
          reasoning_effort: "medium",
          service_tier: "fast",
          sandbox: "workspace-write",
          approval_policy: "never",
          selection_rationale: "Synthetic atomic-capacity reservation fixture.",
          task_shape: "One bounded coding task that may emit 200 paths and one commit.",
          delegation_strategy: {
            mode: "single",
            max_subagents: 0,
            independent_workstreams: [],
            integration_owner: "main_codex_thread"
          },
          budgets: {
            timeout_ms: 2_000,
            max_output_chars: 8_000,
            max_context_chars: 8_000,
            max_tool_calls: 4,
            max_retries: 0
          }
        }, "Reserve the full atomic Codex change envelope before dispatch.")
      ]),
      tools,
      verifier: new CanonicalGoalVerifier()
    });
    let view = await runtime.handle(start("capacity_start", "Stop before change lineage exceeds receipt capacity."));
    let command = 0;
    while (!view.continuation_reasons.includes("blocked")) {
      view = await runtime.handle({
        type: "continue",
        command_id: `capacity_continue_${command}`,
        goal_id: view.goal_id
      });
      command += 1;
      assert.ok(command < 5, "capacity guard should stop within bounded continuations");
    }

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.tool, "file.write_repo");
    assert.equal(view.checkpoint.cursor, "change_lineage_capacity");
    const abandoned = await runtime.handle({
      type: "abandon",
      command_id: "capacity_abandon",
      goal_id: view.goal_id,
      reason: "Capacity boundary preserved all prior effects."
    });
    assert.equal(abandoned.status, "abandoned");
    assert.deepEqual(abandoned.receipt?.changes, retainedChanges);
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

    const foreignWorktree = join(fixture.root, "confirmation-foreign-worktree");
    await runGoalGit(fixture.repoRoot, ["worktree", "add", "-b", "codex/confirmation-mismatch", foreignWorktree]);
    const foreignTools = recordingTools();
    const foreignRuntime = createRuntime(new AgentStore(foreignWorktree, fixture.stateRoot), {
      cognition: sequenceCognition([]),
      tools: foreignTools,
      verifier: new CanonicalGoalVerifier()
    }, "confirmation_foreign");
    await assert.rejects(foreignRuntime.handle({
      type: "resume",
      command_id: "confirm_foreign",
      goal_id: started.goal_id,
      confirm_effect_id: paused.pending_effect!.effect_id
    }), /repository authority mismatch/i);
    assert.equal(foreignTools.calls.length, 0);

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
  root: string;
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = join(tmpdir(), `evi-goal-runtime-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await runGoalGit(repoRoot, ["init", "-b", "develop"]);
  await runGoalGit(repoRoot, ["config", "user.name", "Goal Runtime Test"]);
  await runGoalGit(repoRoot, ["config", "user.email", "goal-runtime@example.test"]);
  await runGoalGit(repoRoot, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(repoRoot, "README.md"), "goal fixture\n", "utf8");
  await runGoalGit(repoRoot, ["add", "README.md"]);
  await runGoalGit(repoRoot, ["commit", "-m", "fixture base"]);
  return {
    root,
    repoRoot,
    stateRoot,
    store: new AgentStore(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function runGoalGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
        return;
      }
      resolvePromise();
    });
  });
}

function goalGitValue(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
        return;
      }
      resolvePromise(stdout.trim());
    });
  });
}
