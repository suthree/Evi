import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import {
  GoalRuntime,
  type GoalCommand,
  type GoalVerificationInput,
  type GoalVerificationResult,
  type GoalVerifier,
  type OutcomeCandidate
} from "../packages/runtime/src/goal_runtime.js";

test("GoalRuntime keeps one identity across soft budget continuation and pause/resume", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, passingVerifier());
    const startCommand = {
      type: "start",
      command_id: "command_start",
      objective: "Deliver one persistent goal lifecycle.",
      budget: { max_model_rounds: 1, max_tool_calls: 2 },
      checkpoint: { cursor: "design", summary: "Architecture accepted." }
    } satisfies GoalCommand;
    const started = await runtime.handle(startCommand);
    assert.equal(started.status, "active");
    assert.equal(started.sequence, 1);
    assert.deepEqual(started.usage, { model_rounds: 0, tool_calls: 0, elapsed_ms: 0 });

    const continued = await runtime.handle({
      type: "continue",
      command_id: "command_continue_1",
      goal_id: started.goal_id,
      usage_delta: { model_rounds: 1, tool_calls: 2, elapsed_ms: 20 },
      checkpoint: {
        cursor: "implementation",
        summary: "The deep module exists.",
        next_action: "Pause for an operator checkpoint.",
        selected_refs: ["packages/runtime/src/goal_runtime.ts"]
      },
      observations: [{
        kind: "source_change",
        summary: "GoalRuntime module added.",
        refs: ["packages/runtime/src/goal_runtime.ts"]
      }]
    });
    assert.equal(continued.goal_id, started.goal_id);
    assert.equal(continued.continuation_required, true);
    assert.deepEqual(continued.continuation_reasons, ["soft_budget_reached"]);

    const paused = await runtime.handle({
      type: "pause",
      command_id: "command_pause",
      goal_id: started.goal_id,
      reason: "Operator checkpoint requested."
    });
    assert.equal(paused.status, "paused");
    assert.deepEqual(paused.continuation_reasons, ["soft_budget_reached", "paused"]);
    await assert.rejects(
      runtime.handle({
        type: "continue",
        command_id: "command_illegal_continue",
        goal_id: started.goal_id
      }),
      /cannot continue from paused/
    );

    const replayedPause = await runtime.handle({
      type: "pause",
      command_id: "command_pause",
      goal_id: started.goal_id,
      reason: "Operator checkpoint requested."
    });
    assert.equal(replayedPause.status, "paused");
    assert.equal(replayedPause.sequence, paused.sequence);

    const resumed = await runtime.handle({
      type: "resume",
      command_id: "command_resume",
      goal_id: started.goal_id
    });
    assert.equal(resumed.status, "active");
    assert.equal(resumed.checkpoint.cursor, "implementation");
    const continuedAgain = await runtime.handle({
      type: "continue",
      command_id: "command_continue_2",
      goal_id: started.goal_id,
      usage_delta: { model_rounds: 1 }
    });
    assert.equal(continuedAgain.goal_id, started.goal_id);
    assert.equal(continuedAgain.usage.model_rounds, 2);
    assert.equal(continuedAgain.continuation_required, true);

    const replayedStart = await runtime.handle(startCommand);
    assert.equal(replayedStart.goal_id, started.goal_id);
    assert.equal(replayedStart.sequence, 1);
    assert.equal((await runtime.read(started.goal_id)).sequence, 5);
    assert.equal((await readEvents(fixture.stateRoot)).length, 5);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime keeps a failed verification active and later emits one accepted receipt", async () => {
  const fixture = await createFixture();
  try {
    const verifierCalls: GoalVerificationInput[] = [];
    const verifier: GoalVerifier = {
      async verify(input) {
        verifierCalls.push(input);
        if (input.candidate.summary.includes("first attempt")) {
          return {
            status: "failed",
            summary: "Runtime health is not yet verified.",
            checks: [{
              id: "runtime_health",
              status: "failed",
              summary: "The observation reports a degraded runtime.",
              evidence_event_ids: input.candidate.evidence_event_ids
            }],
            next_action: "Repair the runtime and verify again."
          };
        }
        return {
          status: "passed",
          summary: "Change and runtime health are verified.",
          checks: [{
            id: "runtime_health",
            status: "passed",
            summary: "The canonical observation reports a healthy runtime.",
            evidence_event_ids: input.candidate.evidence_event_ids
          }],
          next_action: null
        };
      }
    };
    const runtime = createRuntime(fixture.store, verifier);
    const started = await runtime.handle({
      type: "start",
      command_id: "verify_start",
      objective: "Verify one outcome without changing goal identity."
    });
    const observed = await runtime.handle({
      type: "continue",
      command_id: "verify_observation",
      goal_id: started.goal_id,
      checkpoint: {
        cursor: "verification",
        summary: "Candidate is deployed.",
        next_action: "Verify runtime health.",
        selected_refs: ["services/runtime/heartbeat.json"]
      },
      observations: [{
        kind: "runtime_health",
        summary: "Candidate runtime is observable.",
        refs: ["services/runtime/heartbeat.json"]
      }]
    });

    const failedCandidate = candidate(observed.last_event_id, "The first attempt is incomplete.", "degraded");
    const failed = await runtime.handle({
      type: "continue",
      command_id: "verify_failed",
      goal_id: started.goal_id,
      candidate: failedCandidate
    });
    assert.equal(failed.status, "active");
    assert.equal(failed.goal_id, started.goal_id);
    assert.equal(failed.receipt, null);
    assert.deepEqual(failed.continuation_reasons, ["verification_failed"]);
    assert.equal(failed.next_action, "Repair the runtime and verify again.");
    await assert.rejects(
      readFile(join(fixture.stateRoot, "goals/receipts", `${started.goal_id}.json`), "utf8"),
      /ENOENT/
    );

    const repaired = await runtime.handle({
      type: "continue",
      command_id: "verify_repaired_observation",
      goal_id: started.goal_id,
      observations: [{
        kind: "runtime_health",
        summary: "Candidate runtime is healthy after repair.",
        refs: ["services/runtime/heartbeat.json"]
      }]
    });
    const acceptedCandidate = candidate(repaired.last_event_id, "The repaired outcome is ready.", "healthy");
    const completed = await runtime.handle({
      type: "continue",
      command_id: "verify_passed",
      goal_id: started.goal_id,
      candidate: acceptedCandidate
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.goal_id, started.goal_id);
    assert.equal(completed.receipt?.decision, "accepted");
    assert.equal(completed.receipt?.change.identity, "commit_abc123");
    assert.equal(completed.receipt?.runtime_result.status, "healthy");
    assert.deepEqual(
      completed.receipt?.evidence_event_ids,
      [repaired.last_event_id, completed.last_event_id]
    );
    assert.equal(verifierCalls.length, 2);

    const replayed = await runtime.handle({
      type: "continue",
      command_id: "verify_passed",
      goal_id: started.goal_id,
      candidate: acceptedCandidate
    });
    assert.deepEqual(replayed, completed);
    assert.equal(verifierCalls.length, 2);
    assert.equal((await readEvents(fixture.stateRoot)).length, 5);
    await assert.rejects(
      runtime.handle({
        type: "continue",
        command_id: "verify_after_terminal",
        goal_id: started.goal_id
      }),
      /goal is terminal/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime abandonment is explicit, terminal, and does not invoke verification", async () => {
  const fixture = await createFixture();
  try {
    let verifierCalls = 0;
    const runtime = createRuntime(fixture.store, {
      async verify() {
        verifierCalls += 1;
        return passingResult("goal_event_unused");
      }
    });
    const started = await runtime.handle({
      type: "start",
      command_id: "abandon_start",
      objective: "Explore a reversible direction."
    });
    const abandoned = await runtime.handle({
      type: "abandon",
      command_id: "abandon_decision",
      goal_id: started.goal_id,
      reason: "The operator retired this direction."
    });
    assert.equal(abandoned.status, "abandoned");
    assert.equal(abandoned.receipt?.decision, "abandoned");
    assert.equal(abandoned.receipt?.verification.status, "not_run");
    assert.equal(abandoned.receipt?.change.kind, "none");
    assert.equal(verifierCalls, 0);
    await assert.rejects(
      runtime.handle({
        type: "resume",
        command_id: "abandon_resume",
        goal_id: started.goal_id
      }),
      /goal is terminal/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime command ids are content-bound and concurrent calls serialize", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, passingVerifier());
    const started = await runtime.handle({
      type: "start",
      command_id: "concurrency_start",
      objective: "Serialize local mutations."
    });
    await assert.rejects(
      runtime.handle({
        type: "start",
        command_id: "concurrency_start",
        objective: "Reuse the key for different content."
      }),
      /command id conflict/
    );

    const results = await Promise.all([
      runtime.handle({
        type: "continue",
        command_id: "concurrency_one",
        goal_id: started.goal_id,
        usage_delta: { tool_calls: 1 }
      }),
      runtime.handle({
        type: "continue",
        command_id: "concurrency_two",
        goal_id: started.goal_id,
        usage_delta: { tool_calls: 1 }
      })
    ]);
    assert.deepEqual(results.map((result) => result.sequence), [2, 3]);
    assert.equal((await runtime.read(started.goal_id)).usage.tool_calls, 2);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime writes only its canonical stores and reads through damaged projections", async () => {
  const fixture = await createFixture();
  try {
    const legacyFiles = {
      "runs/task_queue.jsonl": "legacy queue\n",
      "memory/working/current.json": "{\"legacy\":true}\n",
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
    const runtime = createRuntime(fixture.store, passingVerifier());
    const started = await runtime.handle({
      type: "start",
      command_id: "boundary_start",
      objective: "Prove whole-goal state isolation."
    });
    const observed = await runtime.handle({
      type: "continue",
      command_id: "boundary_observation",
      goal_id: started.goal_id,
      observations: [{ kind: "test", summary: "Interface test passed.", refs: ["tests/goal_runtime.test.ts"] }]
    });
    const completed = await runtime.handle({
      type: "continue",
      command_id: "boundary_complete",
      goal_id: started.goal_id,
      candidate: candidate(observed.last_event_id, "GoalRuntime boundary verified.", "healthy")
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

    await writeFixtureFile(
      fixture.stateRoot,
      `goals/checkpoints/${started.goal_id}.json`,
      "{\"corrupted_projection\":true}\n"
    );
    const readFromEvents = await runtime.read(started.goal_id);
    assert.deepEqual(readFromEvents, completed);
    await appendFile(join(fixture.stateRoot, "goals/events.jsonl"), "not-json\n", "utf8");
    await assert.rejects(runtime.read(started.goal_id), /canonical event JSON at line 4/);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime rejects foreign evidence and inconsistent verifier decisions", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, passingVerifier());
    const first = await runtime.handle({
      type: "start",
      command_id: "foreign_first",
      objective: "First goal."
    });
    const second = await runtime.handle({
      type: "start",
      command_id: "foreign_second",
      objective: "Second goal."
    });
    await assert.rejects(
      runtime.handle({
        type: "continue",
        command_id: "foreign_candidate",
        goal_id: first.goal_id,
        candidate: candidate(second.last_event_id, "Foreign evidence.", "healthy")
      }),
      /foreign or missing event/
    );

    const inconsistent = createRuntime(fixture.store, {
      async verify(input) {
        return {
          status: "passed",
          summary: "Inconsistent result.",
          checks: [{
            id: "inconsistent",
            status: "failed",
            summary: "A failed check cannot pass the goal.",
            evidence_event_ids: input.candidate.evidence_event_ids
          }],
          next_action: null
        };
      }
    });
    await assert.rejects(
      inconsistent.handle({
        type: "continue",
        command_id: "inconsistent_verifier",
        goal_id: first.goal_id,
        candidate: candidate(first.last_event_id, "Inconsistent verification.", "healthy")
      }),
      /cannot pass with a failed check/
    );
    assert.equal((await readEvents(fixture.stateRoot)).length, 2);
  } finally {
    await fixture.cleanup();
  }
});

test("GoalRuntime fails closed on a parseable but semantically mismatched receipt", async () => {
  const fixture = await createFixture();
  try {
    const runtime = createRuntime(fixture.store, passingVerifier());
    const started = await runtime.handle({
      type: "start",
      command_id: "semantic_start",
      objective: "Reject semantic canonical-event corruption."
    });
    const observed = await runtime.handle({
      type: "continue",
      command_id: "semantic_observed",
      goal_id: started.goal_id,
      observations: [{ kind: "test", summary: "Evidence exists.", refs: [] }]
    });
    await runtime.handle({
      type: "continue",
      command_id: "semantic_complete",
      goal_id: started.goal_id,
      candidate: candidate(observed.last_event_id, "Semantics are verified.", "healthy")
    });
    const eventRef = join(fixture.stateRoot, "goals/events.jsonl");
    const events = await readEvents(fixture.stateRoot);
    const completed = events[2]!;
    const receipt = completed.receipt as Record<string, unknown>;
    receipt.goal_id = "goal_foreign";
    await writeFile(eventRef, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
    await assert.rejects(runtime.read(started.goal_id), /accepted receipt is not bound to its goal/);
  } finally {
    await fixture.cleanup();
  }
});

function candidate(
  evidenceEventId: string,
  summary: string,
  runtimeStatus: "healthy" | "degraded"
): OutcomeCandidate {
  return {
    summary,
    change: { kind: "git_commit", identity: "commit_abc123" },
    runtime_result: {
      status: runtimeStatus,
      summary: runtimeStatus === "healthy" ? "Runtime is healthy." : "Runtime is degraded.",
      evidence_event_ids: [evidenceEventId]
    },
    residual_risks: ["Cross-process single-writer enforcement is deferred to ingress cutover."],
    evidence_event_ids: [evidenceEventId]
  };
}

function passingVerifier(): GoalVerifier {
  return {
    async verify(input) {
      return passingResult(input.candidate.evidence_event_ids[0]!);
    }
  };
}

function passingResult(eventId: string): GoalVerificationResult {
  return {
    status: "passed",
    summary: "The outcome satisfies the injected verifier.",
    checks: [{
      id: "interface_acceptance",
      status: "passed",
      summary: "The canonical event supports the outcome.",
      evidence_event_ids: [eventId]
    }],
    next_action: null
  };
}

function createRuntime(store: AgentStore, verifier: GoalVerifier): GoalRuntime {
  const counts = new Map<string, number>();
  let tick = 0;
  return new GoalRuntime({
    store,
    verifier,
    idFactory(prefix) {
      const count = (counts.get(prefix) ?? 0) + 1;
      counts.set(prefix, count);
      return `${prefix}_${count}`;
    },
    now() {
      tick += 1;
      return `2026-07-17T00:00:${String(tick).padStart(2, "0")}.000Z`;
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
