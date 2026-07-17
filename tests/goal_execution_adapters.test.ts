import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import {
  ModelGoalCognition,
  RuntimeGoalToolExecutor
} from "../packages/runtime/src/goal_execution_adapters.js";
import type { GoalView } from "../packages/runtime/src/goal_runtime.js";
import type { ModelClient, ModelRequest } from "../packages/runtime/src/model.js";

test("RuntimeGoalToolExecutor replaces model command side-effect labels with policy semantics", async () => {
  const root = join(tmpdir(), `evi-goal-tool-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    const executor = new RuntimeGoalToolExecutor(new AgentStore(repoRoot, stateRoot));
    const result = await executor.execute({
      tool: "command.run",
      arguments: {
        command: "pwd",
        args: [],
        cwd: "repo",
        side_effect_level: "external_write"
      }
    }, {
      outcome: "allow",
      reason: "Bounded local read.",
      intent: {
        operation: "read_local",
        target: "command:pwd",
        reversibility: "read_only",
        data_exposure: "local_content_to_model",
        authority: "standing_local_evolution"
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "none");
    assert.equal(result.output.command, "pwd");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ModelGoalCognition parses one decision and persists no model artifact", async () => {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    async create(request) {
      requests.push(request);
      return {
        provider: "fixture",
        api: "responses",
        model: "fixture-model",
        responseId: "response_1",
        outputText: JSON.stringify({
          type: "action",
          summary: "Read the bounded manifest.",
          action: {
            tool: "file.read",
            arguments: { scope: "repo", path: "package.json" }
          }
        }),
        raw: {}
      };
    }
  };
  const cognition = new ModelGoalCognition(model);
  const result = await cognition.next({
    goal: fixtureGoalView(),
    evidence: [{
      event_id: "goal_event_1",
      kind: "intent",
      summary: "Read package metadata.",
      refs: [],
      occurred_at: "2026-07-17T00:00:00.000Z"
    }]
  });
  assert.equal(result.type, "action");
  assert.equal(requests.length, 1);
  assert.match(requests[0]!.instructions, /Never include evidence ids/);
  assert.match(requests[0]!.input, /Canonical Evidence/);
});

function fixtureGoalView(): GoalView {
  return {
    goal_id: "goal_1",
    objective: "Read package metadata.",
    status: "active",
    sequence: 1,
    budget: {
      max_model_rounds: 3,
      max_tool_calls: 4,
      max_elapsed_ms: 120_000
    },
    usage: { model_rounds: 0, tool_calls: 0, elapsed_ms: 0 },
    checkpoint: { cursor: null, summary: "", next_action: null, selected_refs: [] },
    continuation_required: false,
    continuation_reasons: [],
    next_action: null,
    pending_effect: null,
    last_event_id: "goal_event_1",
    last_command_id: "goal_command_1",
    receipt: null,
    boundary: "GoalRuntime canonical execution lifecycle; raw action and observation events are authoritative and checkpoint/receipt files are rebuildable projections"
  };
}
