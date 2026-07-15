import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ContextBundleManifest } from "../packages/core/src/context.js";
import { deriveContextBudget } from "../packages/core/src/context_budget.js";
import { listContextPressure } from "../packages/core/src/context_pressure.js";
import { decideOpportunity, getOpportunityBacklog } from "../packages/core/src/opportunity_backlog.js";
import { AgentStore } from "../packages/core/src/store.js";

test("context pressure lists oversized context manifests without reading raw context markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-context-pressure-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await store.writeJson("memory/episodes/session_small-context.json", manifest({
      sessionId: "session_small",
      turnId: "turn_small",
      createdAt: "2026-06-30T00:00:00.000Z",
      totalChars: 12_000,
      sections: [{
        title: "Stable Core",
        chars: 1_000,
        refs: ["core/soul.md"],
        item_count: 1
      }, {
        title: "Episode Recall",
        chars: 2_000,
        refs: ["memory/episodes/small.json"],
        item_count: 1
      }]
    }));
    await store.writeJson("memory/episodes/session_large-context.json", manifest({
      sessionId: "session_large",
      turnId: "turn_large",
      createdAt: "2026-06-30T00:01:00.000Z",
      totalChars: 95_000,
      sections: [{
        title: "Episode Recall",
        chars: 52_000,
        refs: ["memory/episodes/large.json"],
        item_count: 20
      }, {
        title: "Selected Skills",
        chars: 16_000,
        refs: ["vault/skills/large/SKILL.md"],
        item_count: 1
      }]
    }));
    await store.writeText("memory/episodes/session_large-context.md", "RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR");

    const result = await listContextPressure(store);

    assert.equal(result.count, 1);
    assert.equal(result.pressures[0]?.status, "over_budget");
    assert.equal(result.pressures[0]?.session_id, "session_large");
    assert.equal(result.pressures[0]?.largest_section.title, "Episode Recall");
    assert.equal(result.pressures[0]?.pressure_sections.length, 2);
    assert.equal(result.pressures[0]?.operator_guidance.mitigation_kind, "reduce_episode_recall");
    assert.equal(result.pressures[0]?.operator_guidance.future_mitigation_gate, "explicit_cli_command_required");
    assert.equal(result.pressures[0]?.operator_guidance.future_mitigation_command, null);
    assert.match(result.pressures[0]?.operator_guidance.inspect_command ?? "", /context show --context memory\/episodes\/session_large-context\.json/);
    assert.match(result.pressures[0]?.operator_guidance.complete_after_external_mitigation_command ?? "", /governance decide-opportunity --opportunity context_pressure_session_large --status completed/);
    assert.match(result.pressures[0]?.boundary ?? "", /read-only context pressure/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR/);

    const withOk = await listContextPressure(store, { includeOk: true, limit: 2 });
    assert.equal(withOk.count, 2);
    assert.equal(withOk.pressures.some((item) => item.status === "ok"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context pressure guidance can be decisioned without mutating context artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-context-pressure-decision-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    const manifestRef = "memory/episodes/session_decision_pressure-context.json";
    const contextRef = "memory/episodes/session_decision_pressure-context.md";
    await store.writeJson(manifestRef, manifest({
      sessionId: "session_decision_pressure",
      turnId: "turn_decision_pressure",
      createdAt: "2026-06-30T00:03:00.000Z",
      totalChars: 96_000,
      sections: [{
        title: "Selected Skills",
        chars: 50_000,
        refs: ["vault/skills/decision-pressure/SKILL.md"],
        item_count: 4
      }]
    }));
    await store.writeText(contextRef, "RAW_DECISION_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR");
    const manifestBefore = await store.readStateText(manifestRef);
    const contextBefore = await store.readStateText(contextRef);

    const backlog = await getOpportunityBacklog(store);
    const item = backlog.items.find((candidate) => candidate.id === "context_pressure_session_decision_pressure");
    assert.equal(item?.context_pressure?.operator_guidance.mitigation_kind, "narrow_selected_skills");
    assert.equal(item?.action_chain?.map((step) => `${step.label}/${step.effect}`).join(" -> "), "inspect/read_only -> complete_after_mitigation/state_decision -> retire_historical/state_decision -> record_decision/state_decision");

    const decision = await decideOpportunity(store, {
      opportunity: "context_pressure_session_decision_pressure",
      status: "completed",
      reason: "External context assembly mitigation was verified."
    });

    assert.equal(decision.status, "completed");
    assert.equal(decision.decision.opportunity_kind, "context_pressure");
    assert.deepEqual(decision.decision.action_chain_snapshot?.map((step) => step.effect), [
      "read_only",
      "state_decision",
      "state_decision",
      "state_decision"
    ]);
    assert.equal(await store.readStateText(manifestRef), manifestBefore);
    assert.equal(await store.readStateText(contextRef), contextBefore);

    const after = await getOpportunityBacklog(store);
    assert.equal(after.items.some((candidate) => candidate.id === "context_pressure_session_decision_pressure"), false);
    assert.doesNotMatch(JSON.stringify({ backlog, after, decision }), /RAW_DECISION_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context pressure applies model context budget to otherwise soft pressure", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-context-pressure-budget-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await store.writeJson("memory/episodes/session_budget_pressure-context.json", manifest({
      sessionId: "session_budget_pressure",
      turnId: "turn_budget_pressure",
      createdAt: "2026-06-30T00:02:00.000Z",
      totalChars: 70_000,
      sections: [{
        title: "Episode Recall",
        chars: 13_000,
        refs: ["memory/episodes/budget-pressure.json"],
        item_count: 3
      }]
    }));
    await store.writeText("memory/episodes/session_budget_pressure-context.md", "RAW_BUDGET_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR");

    const contextBudget = deriveContextBudget({
      model_id: "small-local",
      model: "small-local-model",
      source_ref: "repo:models.jsonl#1",
      context_window_tokens: 20000,
      max_output_tokens: 2000
    });
    assert.ok(contextBudget);

    const result = await listContextPressure(store, { contextBudget });

    assert.equal(result.count, 1);
    assert.equal(result.context_budget?.total_hard_limit_chars, 68400);
    assert.equal(result.pressures[0]?.status, "over_budget");
    assert.equal(result.pressures[0]?.context_budget?.estimated_input_budget_tokens, 18000);
    assert.match(result.pressures[0]?.reasons.join(" ") ?? "", /hard_limit 68400/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_BUDGET_PRESSURE_CONTEXT_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function manifest(args: {
  sessionId: string;
  turnId: string;
  createdAt: string;
  totalChars: number;
  sections: ContextBundleManifest["sections"];
}): ContextBundleManifest {
  return {
    version: 1,
    created_at: args.createdAt,
    session_id: args.sessionId,
    turn_id: args.turnId,
    total_chars: args.totalChars,
    section_count: args.sections.length,
    sections: args.sections,
    recall: {
      memory_hit_count: 1,
      memory_refs: ["memory/episodes/large.json"],
      archive_ref_count: 0,
      archive_refs: [],
      opportunity_ref_count: 0,
      opportunity_refs: [],
      skill_ref_count: 1,
      skill_refs: ["vault/skills/large/SKILL.md"],
      discipline_active: false
    }
  };
}
