import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createDreamSnapshot,
  getDreamSnapshot,
  listDreamSnapshots
} from "../packages/core/src/dreams.js";
import { AgentStore } from "../packages/core/src/store.js";

test("dream snapshot records long-horizon direction without executing work", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-dreams-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.writeJson("memory/semantic/accepted/semantic_memory_core.json", {
      id: "semantic_memory_core",
      action_type: "semantic_memory",
      status: "accepted",
      scope: "core_capability_self_recognition",
      summary: "Core ability is GA design and self-evolution.",
      content: "External tools are application slices.",
      source_candidate_id: "memory_proposal_core",
      source_candidate_ref: "memory/semantic/candidates/memory_proposal_core.json",
      artifact_refs: ["CONTEXT.md"],
      confirmation_ref: "memory/semantic/confirmations/memory_confirmation_core.json",
      created_at: "2026-07-06T00:00:00Z",
      accepted_at: "2026-07-06T00:00:01Z",
      boundary: "local state semantic memory"
    });
    await store.writeJson("self-evolution/iterations/iteration_contract_core.json", {
      schema_version: 1,
      id: "iteration_contract_core",
      ref: "self-evolution/iterations/iteration_contract_core.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Record core iteration layer before implementation.",
      layer: "core_runtime",
      owner_surface: "runtime_contract",
      proposed_slice: "self_evolution_iteration_contract",
      evidence_refs: ["packages/core/src/self_evolution_scorecard.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer", "orchestration_planner"],
      outcome: {
        status: "verified",
        summary: "The core iteration passed verification.",
        evidence_refs: ["tests/dreams.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Use the verified outcome to choose the next bounded slice."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:02Z",
      boundary: "bounded iteration contract"
    });

    const result = await createDreamSnapshot(store, { limit: 3 });

    assert.equal(result.dream.action_type, "dream_snapshot");
    assert.equal(result.dream.status, "active");
    assert.equal(result.dream.semantic_memory_refs.includes("memory/semantic/accepted/semantic_memory_core.json"), true);
    assert.equal(result.dream.source_refs.includes("self-evolution/iterations/iteration_contract_core.json"), true);
    assert.equal(result.dream.source_refs.includes("packages/core/src/expert_orchestration.ts"), true);
    assert.equal(result.dream.latest_iteration_outcome?.iteration_ref, "self-evolution/iterations/iteration_contract_core.json");
    assert.equal(result.dream.latest_iteration_outcome?.status, "verified");
    assert.equal(result.dream.latest_iteration_outcome?.next_moves.includes("Use the verified outcome to choose the next bounded slice."), true);
    const coreAxis = result.dream.axes.find((axis) => axis.id === "core_ga_design");
    assert.equal(coreAxis?.evidence_refs.includes("self-evolution/iterations/iteration_contract_core.json"), true);
    const dreamAxis = result.dream.axes.find((axis) => axis.id === "dream_planning");
    assert.equal(dreamAxis?.status, "active");
    assert.equal(dreamAxis?.evidence_refs.includes("self-evolution/iterations/iteration_contract_core.json"), true);
    const expertAxis = result.dream.axes.find((axis) => axis.id === "multi_expert_orchestration");
    assert.equal(expertAxis?.status, "active");
    assert.equal(expertAxis?.evidence_refs.includes("packages/core/src/expert_orchestration.ts"), true);
    assert.match(expertAxis?.summary ?? "", /delegation gates/);
    assert.equal(result.dream.horizons.some((horizon) => horizon.id === "later"), true);
    assert.equal(result.dream.non_goals.some((item) => item.includes("Nasdaq")), true);
    assert.match(result.dream.boundary, /no model call/);
    assert.equal(existsSync(join(stateRoot, result.dream_ref)), true);
    assert.equal(existsSync(join(stateRoot, result.dream_markdown_ref)), true);

    const list = await listDreamSnapshots(store, { limit: 10 });
    assert.equal(list.count, 1);
    assert.equal(list.dream_refs[0], result.dream_ref);
    assert.equal(list.dreams[0]?.axis_count, result.dream.axes.length);

    const byId = await getDreamSnapshot(store, { dreamRef: result.dream.id });
    assert.equal(byId.dream_ref, result.dream_ref);
    assert.equal(byId.dream.summary, result.dream.summary);

    const markdown = await readFile(join(stateRoot, result.dream_markdown_ref), "utf8");
    assert.match(markdown, /Core self-evolution long-horizon plan/);
    assert.match(markdown, /Latest Iteration Outcome/);
    const events = await readFile(join(stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(events, /Recorded dream snapshot/);
    assert.match(events, new RegExp(result.evidence_event_id));

    await assert.rejects(
      () => getDreamSnapshot(store, { dreamRef: "../memory/dreams/dream_bad.json" }),
      /Unsafe dream ref/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
