import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getMemoryLayerDiagnostics, type MemoryLayerSummary } from "../packages/core/src/memory_layers.js";
import { AgentStore } from "../packages/core/src/store.js";

test("memory layer diagnostic summarizes context entrypoints without leaking raw content", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-memory-layers-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_layer_1",
      session_id: "session_layer",
      turn_id: "turn_1",
      kind: "prompt",
      summary: "Operator asked about memory layer visibility.",
      artifact_refs: ["memory/episodes/session_layer-raw.md"],
      created_at: "2026-07-03T00:00:01.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_layer_2",
      session_id: "session_layer",
      turn_id: "turn_2",
      kind: "report",
      summary: "Diagnostic should stay bounded.",
      artifact_refs: ["memory/episodes/session_layer-final.md"],
      created_at: "2026-07-03T00:00:02.000Z"
    });
    await writeFile(join(stateRoot, "memory/episodes/events.jsonl"), "not-json\n", { flag: "a" });
    await store.writeText("memory/episodes/session_layer-raw.md", "RAW_LAYER_ARTIFACT_SHOULD_NOT_APPEAR");

    await store.writeJson("memory/semantic/accepted/semantic_memory_1.json", {
      id: "semantic_memory_1",
      action_type: "semantic_memory",
      status: "accepted",
      scope: "local",
      summary: "Keep bounded memory diagnostics visible.",
      content: "RAW_ACCEPTED_MEMORY_CONTENT_SHOULD_NOT_APPEAR",
      source_candidate_id: "memory_proposal_1",
      source_candidate_ref: "memory/semantic/candidates/memory_proposal_1.json",
      artifact_refs: ["memory/episodes/events.jsonl#evidence_layer_1"],
      confirmation_ref: "memory/semantic/confirmations/memory_confirmation_1.json",
      created_at: "2026-07-03T00:00:03.000Z",
      accepted_at: "2026-07-03T00:00:04.000Z",
      boundary: "local state semantic memory"
    });
    await store.writeJson("memory/semantic/candidates/memory_proposal_1.json", {
      id: "memory_proposal_1",
      action_type: "propose_memory",
      status: "proposed",
      scope: "local",
      summary: "Pending memory proposal.",
      content: "RAW_CANDIDATE_CONTENT_SHOULD_NOT_APPEAR",
      artifact_refs: [],
      created_at: "2026-07-03T00:00:05.000Z"
    });
    await store.writeJson("memory/semantic/confirmations/memory_confirmation_1.json", {
      id: "memory_confirmation_1",
      action_type: "promote_memory_candidate",
      status: "pending",
      created_at: "2026-07-03T00:00:06.000Z",
      candidate_ref: "memory/semantic/candidates/memory_proposal_1.json",
      candidate_id: "memory_proposal_1",
      confirmation_required: true,
      execution_allowed: false,
      would_write: ["state"],
      safety_boundary: ["operator confirmation required"],
      next_step: "Inspect candidate."
    });
    await store.writeJson("memory/working/current.json", {
      goal: "Continue memory layer diagnostics.",
      current_step: "Investigate stale memory layer visibility.",
      next_action: "Resume with a bounded diagnostic command.",
      known_constraints: ["No raw content in diagnostic output."],
      recent_evidence_refs: ["evidence_layer_1", "evidence_layer_2"],
      open_questions: ["Which layer enters context?"],
      created_at: "2026-07-03T00:00:07.000Z"
    });
    await store.writeJson("memory/archives/2026-07-03.json", {
      date: "2026-07-03",
      event_count: 2,
      session_count: 1
    });
    await store.writeJson("memory/skills/usage/session_layer-skill.json", selectedSkillOutcome({
      verification_status: "failed",
      verified: false,
      verdict: "failed_verification"
    }));

    const result = await getMemoryLayerDiagnostics(store);

    assert.equal(result.action, "layers");
    assert.match(result.boundary, /does not sync indexes/);
    assert.deepEqual(result.context_entry.selected_context_layers, ["semantic_memory", "working_checkpoint"]);
    assert.deepEqual(result.context_entry.governance_context_layers, ["memory_governance_queue"]);
    assert.ok(result.context_entry.attention_layer_ids.includes("memory_governance_queue"));
    assert.ok(result.context_entry.attention_layer_ids.includes("working_checkpoint"));
    assert.ok(result.context_entry.attention_layer_ids.includes("selected_skill_outcomes"));
    assert.equal(existsSync(join(stateRoot, "memory/index/episodes.sqlite")), false);

    const episode = layer(result.layers, "episode_recall");
    assert.equal(episode.counts.valid_events, 2);
    assert.equal(episode.counts.skipped_rows, 1);
    assert.equal(episode.counts.index_exists, false);

    const semantic = layer(result.layers, "semantic_memory");
    assert.equal(semantic.counts.accepted_valid, 1);
    assert.equal(semantic.selected_for_context, true);

    const governance = layer(result.layers, "memory_governance_queue");
    assert.equal(governance.status, "needs_attention");
    assert.equal(governance.counts.pending_candidates, 1);
    assert.equal(governance.counts.pending_confirmations, 1);

    const working = layer(result.layers, "working_checkpoint");
    assert.equal(working.status, "needs_attention");
    assert.equal(working.counts.current_open_questions, 1);
    assert.equal(working.counts.blocked_signal, true);

    const skills = layer(result.layers, "selected_skill_outcomes");
    assert.equal(skills.context_role, "recall_quality_signal");
    assert.equal(skills.counts.attention_outcomes, 1);

    const output = JSON.stringify(result);
    assert.doesNotMatch(output, /RAW_LAYER_ARTIFACT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(output, /RAW_ACCEPTED_MEMORY_CONTENT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(output, /RAW_CANDIDATE_CONTENT_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function layer(layers: MemoryLayerSummary[], id: string): MemoryLayerSummary {
  const found = layers.find((item) => item.id === id);
  assert.ok(found, `missing layer ${id}`);
  return found;
}

function selectedSkillOutcome(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "skill_usage_layer",
    session_id: "session_layer",
    turn_id: "turn_skill",
    skill_name: "memory-layer-skill",
    instructions_ref: "vault/skills/memory-layer-skill/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#memory-layer-skill",
    source: "vault",
    score: 0.8,
    context_ref: "memory/episodes/session_layer-context.md",
    context_manifest_ref: "memory/episodes/session_layer-context.json",
    completion_status: "done",
    verification_status: "passed",
    verified: true,
    verdict: "passed",
    completion_report_ref: "memory/episodes/session_layer-completion-verification.json",
    final_response_ref: "memory/episodes/session_layer-final-response.md",
    envelope_ref: "memory/episodes/session_layer-model-action-r1.json",
    registry_update: {
      ok: true,
      use_count: 1,
      last_used_at: "2026-07-03T00:00:08.000Z"
    },
    created_at: "2026-07-03T00:00:08.000Z",
    boundary: "post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness",
    ...overrides
  };
}
