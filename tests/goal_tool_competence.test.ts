import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_GOAL_TOOL_COMPETENCE_ITEMS,
  MAX_GOAL_TOOL_EXPERIENCE_SIGNALS,
  MAX_GOAL_TOOL_FAILURE_SUMMARY_CHARS,
  summarizeGoalToolCompetence,
  type GoalToolExperienceSignal
} from "../packages/runtime/src/goal_tool_competence.js";

test("goal tool competence keeps execution outcome separate from Goal association", () => {
  const summary = summarizeGoalToolCompetence([
    signal({ goal: "goal_1", receipt: "receipt_1", event: "event_1", ok: true, decision: "accepted" }),
    signal({ goal: "goal_2", receipt: "receipt_2", event: "event_2", ok: false, decision: "abandoned" }),
    signal({ goal: "goal_3", receipt: "receipt_3", event: "event_3", ok: true, decision: "accepted" })
  ]);

  assert.deepEqual(summary.map((item) => ({
    tool: item.tool,
    status: item.status,
    observations: item.observation_count,
    successes: item.success_count,
    failures: item.failure_count,
    accepted: item.accepted_goal_count,
    abandoned: item.abandoned_goal_count
  })), [{
    tool: "file.read",
    status: "emerging",
    observations: 3,
    successes: 2,
    failures: 1,
    accepted: 2,
    abandoned: 1
  }]);
  assert.match(summary[0]!.boundary, /associations, not causal attribution/);
});

test("goal tool competence distinguishes reliable history and degraded recent failures", () => {
  const reliable = summarizeGoalToolCompetence([
    signal({ event: "event_1", ok: true }),
    signal({ event: "event_2", ok: true }),
    signal({ event: "event_3", ok: true })
  ])[0]!;
  const degraded = summarizeGoalToolCompetence([
    signal({ event: "event_4", ok: true, tool: "command.run" }),
    signal({ event: "event_5", ok: false, tool: "command.run", summary: "first failure" }),
    signal({ event: "event_6", ok: false, tool: "command.run", summary: "second failure" })
  ])[0]!;

  assert.equal(reliable.status, "reliable");
  assert.match(reliable.guidance, /verify current inputs/);
  assert.equal(degraded.status, "degraded");
  assert.match(degraded.guidance, /Do not repeat the same failed action shape/);
  assert.equal(degraded.latest_failure?.summary, "second failure");
});

test("goal tool competence is deterministic and bounds history, tools, and failure text", () => {
  const signals = Array.from({ length: MAX_GOAL_TOOL_EXPERIENCE_SIGNALS + 20 }, (_, index) => signal({
    goal: `goal_${index}`,
    receipt: `receipt_${index}`,
    event: `event_${String(index).padStart(3, "0")}`,
    tool: `tool_${index}`,
    ok: false,
    summary: "x".repeat(MAX_GOAL_TOOL_FAILURE_SUMMARY_CHARS + 50),
    occurredAt: `2026-07-17T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`
  }));
  const summary = summarizeGoalToolCompetence([...signals].reverse(), {
    maxSignals: MAX_GOAL_TOOL_EXPERIENCE_SIGNALS * 10,
    maxTools: MAX_GOAL_TOOL_COMPETENCE_ITEMS * 10,
    maxFailureSummaryChars: MAX_GOAL_TOOL_FAILURE_SUMMARY_CHARS * 10
  });

  assert.equal(summary.length, MAX_GOAL_TOOL_COMPETENCE_ITEMS);
  assert.ok(summary.every((item) => item.latest_failure!.summary.length <= MAX_GOAL_TOOL_FAILURE_SUMMARY_CHARS));
  assert.ok(summary.every((item) => Number(item.tool.slice("tool_".length)) >= 20));
});

function signal(options: {
  goal?: string;
  receipt?: string;
  event: string;
  tool?: string;
  ok: boolean;
  decision?: "accepted" | "abandoned";
  summary?: string;
  occurredAt?: string;
}): GoalToolExperienceSignal {
  return {
    goal_id: options.goal ?? "goal_default",
    receipt_id: options.receipt ?? `receipt_${options.event}`,
    decision: options.decision ?? "accepted",
    event_id: options.event,
    tool: options.tool ?? "file.read",
    ok: options.ok,
    summary: options.summary ?? `${options.event} summary`,
    occurred_at: options.occurredAt ?? `2026-07-17T00:00:${options.event.slice(-1).padStart(2, "0")}.000Z`
  };
}
