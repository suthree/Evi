import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDreamSnapshot } from "../packages/core/src/dreams.js";
import { getSelfEvolutionScorecard } from "../packages/core/src/self_evolution_scorecard.js";
import { AgentStore } from "../packages/core/src/store.js";

test("self-evolution scorecard summarizes core/basic learning maturity without executing work", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
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
    await store.writeJson("memory/dreams/dream_scorecard.json", {
      schema_version: 1,
      id: "dream_scorecard",
      action_type: "dream_snapshot",
      status: "active",
      title: "Core self-evolution long-horizon plan",
      summary: "Keep the agent focused on GA project design and self-evolution.",
      created_at: "2026-07-06T00:00:02Z",
      source_refs: ["memory/semantic/accepted/semantic_memory_core.json"],
      semantic_memory_refs: ["memory/semantic/accepted/semantic_memory_core.json"],
      backlog_refs: [],
      latest_iteration_outcome: {
        iteration_ref: "self-evolution/iterations/iteration_contract_scorecard.json",
        status: "verified",
        summary: "Verification passed and next move is bounded.",
        evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
        next_moves: ["Use the outcome to choose the next core/basic slice."],
        recorded_at: "2026-07-06T00:00:03Z"
      },
      axes: [],
      horizons: [],
      non_goals: [],
      boundary: "bounded dream context only"
    });
    await store.writeJson("self-evolution/iterations/iteration_contract_scorecard.json", {
      schema_version: 1,
      id: "iteration_contract_scorecard",
      ref: "self-evolution/iterations/iteration_contract_scorecard.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Close a core-runtime iteration with verification evidence.",
      layer: "core_runtime",
      owner_surface: "runtime_contract",
      proposed_slice: "self_evolution_iteration_outcome",
      evidence_refs: ["packages/core/src/self_evolution_iterations.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer", "orchestration_planner"],
      outcome: {
        status: "verified",
        summary: "Verification passed and next move is bounded.",
        evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Use the outcome to choose the next core/basic slice."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    });

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 3 });

    assert.equal(scorecard.action, "scorecard");
    assert.equal(scorecard.status, "evolving");
    assert.equal(scorecard.dimensions.length, 5);
    assert.equal(scorecard.dimensions.some((dimension) => dimension.id === "core_ga_design" && dimension.layer === "core_runtime"), true);
    assert.equal(scorecard.dimensions.some((dimension) => dimension.id === "basic_runtime_substrate" && dimension.layer === "basic_entrypoint"), true);
    assert.equal(scorecard.dimensions.some((dimension) => dimension.id === "sop_skill_memory_loop" && dimension.layer === "local_learning"), true);
    const sopLoop = scorecard.dimensions.find((dimension) => dimension.id === "sop_skill_memory_loop");
    assert.equal(sopLoop?.score, 3);
    const core = scorecard.dimensions.find((dimension) => dimension.id === "core_ga_design");
    assert.match(core?.summary ?? "", /derived project-design artifact/);
    assert.match(core?.summary ?? "", /latest outcome is verified/);
    assert.equal(core?.next_moves[0], "Use the latest iteration outcome to choose the next bounded core/basic slice.");
    assert.equal(core?.evidence_refs.includes("packages/core/src/ga_project_design.ts"), true);
    assert.equal(core?.evidence_refs.includes("self-evolution/iterations/iteration_contract_scorecard.json"), true);
    const memoryDream = scorecard.dimensions.find((dimension) => dimension.id === "memory_dream_direction");
    assert.equal(memoryDream?.stage, "active");
    assert.equal(memoryDream?.score, 5);
    assert.match(memoryDream?.summary ?? "", /latest verified iteration outcome/);
    const delegation = scorecard.dimensions.find((dimension) => dimension.id === "general_agent_delegation");
    assert.equal(delegation?.stage, "active");
    assert.equal(delegation?.score, 5);
    assert.match(delegation?.summary ?? "", /bounded general-agent subtask path/);
    assert.match(delegation?.summary ?? "", /completion authority in the main harness/);
    assert.match(delegation?.next_moves[0] ?? "", /Harden delegate_agent task, context, result/);
    assert.equal(delegation?.evidence_refs.includes("packages/core/src/delegate_agent_completion_gate.ts"), true);
    assert.equal(delegation?.evidence_refs.includes("packages/core/src/delegate_agent_contract.ts"), true);
    assert.equal(delegation?.evidence_refs.includes("packages/runtime/src/runner.ts"), true);
    assert.equal(delegation?.evidence_refs.includes("tests/context_harness.test.ts"), true);
    assert.equal(scorecard.expert_lenses.find((lens) => lens.id === "delegation_flow_reviewer")?.status, "active");
    assert.equal(scorecard.next_iterations.length, 3);
    assert.equal(scorecard.next_iterations[0], core?.next_moves[0]);
    assert.equal(scorecard.next_iterations[1], delegation?.next_moves[0]);
    assert.equal(scorecard.next_iterations[2], scorecard.dimensions.find((dimension) => dimension.id === "basic_runtime_substrate")?.next_moves[0]);
    assert.equal(scorecard.next_iterations.some((item) => item.includes("SOP candidates")), false);
    assert.equal(scorecard.next_slices.length, 5);
    assert.equal(scorecard.next_slices[0]?.priority, 1);
    assert.equal(scorecard.next_slices[0]?.dimension_id, "sop_skill_memory_loop");
    assert.notEqual(scorecard.next_slices[0]?.dimension_id, "general_agent_delegation");
    assert.equal(scorecard.default_next_slice?.dimension_id, "general_agent_delegation");
    assert.equal(scorecard.default_next_slice?.id, scorecard.next_core_basic_slice?.id);
    assert.notEqual(scorecard.default_next_slice?.dimension_id, scorecard.next_slices[0]?.dimension_id);
    assert.equal(scorecard.next_core_basic_slice?.dimension_id, "general_agent_delegation");
    assert.equal(scorecard.next_core_basic_slice?.layer, "core_runtime");
    assert.equal(scorecard.next_core_basic_slice?.success_criteria.some((criterion) => criterion.includes("main harness")), true);
    assert.equal(scorecard.next_core_basic_slice?.success_criteria.some((criterion) => criterion.includes("result_failure_kind")), true);
    assert.equal(scorecard.next_core_basic_slice?.success_criteria.some((criterion) => criterion.includes("main-harness recovery")), true);
    const delegationSlice = scorecard.next_slices.find((slice) => slice.dimension_id === "general_agent_delegation");
    assert.equal(delegationSlice?.layer, "core_runtime");
    assert.equal(delegationSlice?.reason.includes("bounded delegation baseline"), true);
    assert.equal(delegationSlice?.success_criteria.some((criterion) => criterion.includes("main harness")), true);
    assert.equal(delegationSlice?.success_criteria.some((criterion) => criterion.includes("result_failure_kind")), true);
    assert.equal(scorecard.next_slices.some((slice) =>
      slice.dimension_id === "core_ga_design"
      && slice.success_criteria.some((criterion) => criterion.includes("derived project-design artifact"))
    ), true);
    assert.equal(scorecard.refs.includes("packages/core/src/self_evolution_scorecard.ts"), true);
    assert.equal(scorecard.refs.includes("packages/core/src/ga_project_design.ts"), true);
    assert.equal(scorecard.refs.includes("packages/core/src/delegate_agent_completion_gate.ts"), true);
    assert.equal(scorecard.refs.includes("packages/runtime/src/runner.ts"), true);
    assert.equal(scorecard.refs.includes("packages/core/src/self_evolution_iterations.ts"), true);
    assert.equal(scorecard.refs.includes("self-evolution/iterations/iteration_contract_scorecard.json"), true);
    assert.equal(scorecard.refs.includes("memory/dreams/dream_scorecard.json"), true);
    assert.match(scorecard.boundary, /read-only self-evolution scorecard/);
    assert.match(scorecard.boundary, /does not invoke models/);
    assert.match(scorecard.boundary, /does not .*prove completion/);

    await store.writeJson("self-evolution/iterations/iteration_contract_newer_dream_source.json", {
      schema_version: 1,
      id: "iteration_contract_newer_dream_source",
      ref: "self-evolution/iterations/iteration_contract_newer_dream_source.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "A newer verified outcome makes the existing dream stale.",
      layer: "local_learning",
      owner_surface: "dream_snapshots",
      proposed_slice: "dream_freshness",
      evidence_refs: [],
      verification_commands: ["pnpm run check"],
      non_goals: [],
      advisory_expert_roles: ["learning_curator", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "The newer dream source is verified.",
        evidence_refs: [],
        verification_commands: ["pnpm run check"],
        verification_claims: ["check: passed"],
        next_moves: ["Refresh the dream explicitly."],
        recorded_at: "2026-07-06T00:00:05Z",
        boundary: "bounded outcome"
      },
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration"
    });
    const staleDream = (await getSelfEvolutionScorecard(store, { limit: 3 })).dimensions
      .find((dimension) => dimension.id === "memory_dream_direction");
    assert.equal(staleDream?.stage, "emerging");
    assert.equal(staleDream?.score, 3);
    assert.match(staleDream?.summary ?? "", /does not match the latest verified iteration outcome/);

    await createDreamSnapshot(store);
    const refreshedDream = (await getSelfEvolutionScorecard(store, { limit: 3 })).dimensions
      .find((dimension) => dimension.id === "memory_dream_direction");
    assert.equal(refreshedDream?.stage, "active");
    assert.equal(refreshedDream?.score, 5);
    assert.match(refreshedDream?.summary ?? "", /latest verified iteration outcome/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution scorecard keeps verified GA design artifacts visible while the newest iteration is open", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-open-ga-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("self-evolution/iterations/iteration_contract_verified_ga.json", {
      schema_version: 1,
      id: "iteration_contract_verified_ga",
      ref: "self-evolution/iterations/iteration_contract_verified_ga.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified GA project-design artifact baseline.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "verified_iteration_to_design_artifact",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Verification passed.",
        evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Use the artifact in future core slices."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    });
    await store.writeJson("self-evolution/iterations/iteration_contract_open_ga.json", {
      schema_version: 1,
      id: "iteration_contract_open_ga",
      ref: "self-evolution/iterations/iteration_contract_open_ga.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Open GA design hardening slice.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "open_ga_design_hardening",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration contract"
    });

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 5 });
    const core = scorecard.dimensions.find((dimension) => dimension.id === "core_ga_design");
    assert.equal(core?.score, 5);
    assert.match(core?.summary ?? "", /derived project-design artifact/);
    assert.equal(core?.evidence_refs.includes("self-evolution/iterations/iteration_contract_verified_ga.json"), true);
    assert.match(core?.next_moves[0] ?? "", /Close the active iteration outcome for iteration_contract_open_ga/);
    const missingDream = scorecard.dimensions.find((dimension) => dimension.id === "memory_dream_direction");
    assert.equal(missingDream?.stage, "planned");
    assert.match(missingDream?.summary ?? "", /No dream snapshot exists/);
    assert.equal(scorecard.next_core_basic_slice?.dimension_id, "core_ga_design");
    assert.equal(scorecard.default_next_slice?.dimension_id, "core_ga_design");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution scorecard graduates a verified delegation baseline to core GA design", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-verified-delegation-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("self-evolution/iterations/iteration_contract_verified_delegation.json", {
      schema_version: 1,
      id: "iteration_contract_verified_delegation",
      ref: "self-evolution/iterations/iteration_contract_verified_delegation.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified bounded general delegation baseline.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "general_agent_delegation_hardening_after_verified",
      evidence_refs: ["packages/core/src/delegate_agent_contract.ts", "packages/runtime/src/runner.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no expert scheduling"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Delegation contract and runner verification passed.",
        evidence_refs: ["tests/context_harness.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Select the next core/basic slice."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    });

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 5 });
    const delegation = scorecard.dimensions.find((dimension) => dimension.id === "general_agent_delegation");

    assert.equal(delegation?.stage, "stable");
    assert.deepEqual(delegation?.latest_iteration, {
      id: "iteration_contract_verified_delegation",
      ref: "self-evolution/iterations/iteration_contract_verified_delegation.json",
      outcome_status: "verified"
    });
    assert.match(delegation?.summary ?? "", /verified bounded delegation baseline/);
    assert.equal(delegation?.evidence_refs.includes("self-evolution/iterations/iteration_contract_verified_delegation.json"), true);
    assert.match(delegation?.next_moves[0] ?? "", /verified delegation baseline/);
    assert.equal(scorecard.next_core_basic_slice?.dimension_id, "core_ga_design");
    assert.equal(scorecard.default_next_slice?.dimension_id, "core_ga_design");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution scorecard returns to delegation after a verified GA successor", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-delegation-cycle-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("self-evolution/iterations/iteration_contract_verified_delegation.json", {
      schema_version: 1,
      id: "iteration_contract_verified_delegation",
      ref: "self-evolution/iterations/iteration_contract_verified_delegation.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified bounded general delegation baseline.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "general_agent_delegation_hardening_after_verified",
      evidence_refs: ["packages/core/src/delegate_agent_contract.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no expert scheduling"],
      advisory_expert_roles: ["architect"],
      outcome: {
        status: "verified",
        summary: "Delegation contract passed.",
        evidence_refs: ["tests/context_harness.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Select the next core/basic slice."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    });
    await store.writeJson("self-evolution/iterations/iteration_contract_verified_ga_successor.json", {
      schema_version: 1,
      id: "iteration_contract_verified_ga_successor",
      ref: "self-evolution/iterations/iteration_contract_verified_ga_successor.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified GA design successor.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "core_ga_design_next_slice_after_verified",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect"],
      outcome: {
        status: "verified",
        summary: "GA design verification passed.",
        evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Return to delegation hardening."],
        recorded_at: "2026-07-06T00:00:04Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration contract"
    });

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 5 });

    assert.equal(scorecard.next_core_basic_slice?.dimension_id, "general_agent_delegation");
    assert.equal(scorecard.default_next_slice?.dimension_id, "general_agent_delegation");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution scorecard keeps core GA design as the core/basic outlet until the latest outcome is verified", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-partial-ga-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("self-evolution/iterations/iteration_contract_verified_ga_before_partial.json", {
      schema_version: 1,
      id: "iteration_contract_verified_ga_before_partial",
      ref: "self-evolution/iterations/iteration_contract_verified_ga_before_partial.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified GA project-design artifact baseline.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "verified_iteration_to_design_artifact",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Verification passed.",
        evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Use the artifact in future core slices."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    });
    await store.writeJson("self-evolution/iterations/iteration_contract_partial_ga_after_verified.json", {
      schema_version: 1,
      id: "iteration_contract_partial_ga_after_verified",
      ref: "self-evolution/iterations/iteration_contract_partial_ga_after_verified.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Partial GA design hardening slice.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "partial_ga_design_hardening",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "partial",
        summary: "Verification not complete yet.",
        evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
        verification_commands: [],
        next_moves: ["Finish verification before moving to delegation hardening."],
        recorded_at: "2026-07-06T00:00:04Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration contract"
    });

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 5 });
    const core = scorecard.dimensions.find((dimension) => dimension.id === "core_ga_design");

    assert.equal(core?.score, 4);
    assert.equal(scorecard.next_core_basic_slice?.dimension_id, "core_ga_design");
    assert.equal(scorecard.default_next_slice?.dimension_id, "core_ga_design");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution scorecard surfaces open basic iterations", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-open-basic-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("self-evolution/iterations/iteration_contract_verified_ga_for_basic.json", {
      schema_version: 1,
      id: "iteration_contract_verified_ga_for_basic",
      ref: "self-evolution/iterations/iteration_contract_verified_ga_for_basic.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified GA baseline before basic work.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "verified_ga_before_basic",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Verification passed.",
        evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Harden basic runtime substrate next."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    });
    await store.writeJson("self-evolution/iterations/iteration_contract_open_basic.json", {
      schema_version: 1,
      id: "iteration_contract_open_basic",
      ref: "self-evolution/iterations/iteration_contract_open_basic.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Open basic runtime substrate slice.",
      layer: "basic_entrypoint",
      owner_surface: "ga_project_design",
      proposed_slice: "manual_basic_iteration_contract_guard",
      evidence_refs: ["packages/core/src/self_evolution_iterations.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["runtime_operator", "verification_reviewer"],
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration contract"
    });
    await store.writeJson("memory/semantic/candidates/memory_candidate_attention.json", {
      id: "memory_candidate_attention",
      status: "pending",
      summary: "Pending memory governance should keep basic runtime attention visible.",
      created_at: "2026-07-06T00:00:05Z",
      boundary: "bounded pending memory candidate"
    });

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 5 });
    const core = scorecard.dimensions.find((dimension) => dimension.id === "core_ga_design");
    const basic = scorecard.dimensions.find((dimension) => dimension.id === "basic_runtime_substrate");

    assert.match(core?.next_moves[0] ?? "", /Close the active iteration outcome for iteration_contract_open_basic/);
    assert.equal(basic?.evidence_refs.includes("self-evolution/iterations/iteration_contract_open_basic.json"), true);
    assert.deepEqual(basic?.latest_iteration, {
      id: "iteration_contract_open_basic",
      ref: "self-evolution/iterations/iteration_contract_open_basic.json",
      outcome_status: "not_recorded"
    });
    assert.match(basic?.summary ?? "", /iteration_contract_open_basic/);
    assert.match(basic?.summary ?? "", /not_recorded/);
    assert.match(basic?.next_moves[0] ?? "", /Close the basic iteration outcome for iteration_contract_open_basic/);
    assert.equal(basic?.stage, "attention");
    assert.equal(scorecard.next_core_basic_slice?.dimension_id, "basic_runtime_substrate");
    assert.equal(scorecard.default_next_slice?.dimension_id, "basic_runtime_substrate");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution scorecard separates superseded open iterations from the current core plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-stale-open-ga-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("self-evolution/iterations/iteration_contract_stale_open_ga.json", {
      schema_version: 1,
      id: "iteration_contract_stale_open_ga",
      ref: "self-evolution/iterations/iteration_contract_stale_open_ga.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older open GA design hardening slice.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "older_open_ga_design_hardening",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    });
    await store.writeJson("self-evolution/iterations/iteration_contract_new_verified_ga.json", {
      schema_version: 1,
      id: "iteration_contract_new_verified_ga",
      ref: "self-evolution/iterations/iteration_contract_new_verified_ga.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Newer verified GA project-design artifact.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "newer_verified_ga_design",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Verification passed.",
        evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Use this newer artifact for the next core slice."],
        recorded_at: "2026-07-06T00:00:05Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration contract"
    });

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 5 });
    const core = scorecard.dimensions.find((dimension) => dimension.id === "core_ga_design");
    assert.match(core?.summary ?? "", /latest outcome is verified/);
    assert.match(core?.next_moves[0] ?? "", /Use the latest iteration outcome to choose the next bounded core\/basic slice/);
    assert.match(core?.next_moves[0] ?? "", /superseded open iteration iteration_contract_stale_open_ga/);
    assert.doesNotMatch(core?.next_moves[0] ?? "", /Close the active iteration outcome/);
    assert.equal(scorecard.next_iterations[0], core?.next_moves[0]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution scorecard gating sees superseded open iterations beyond display limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-stale-open-window-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("self-evolution/iterations/iteration_contract_old_open_ga.json", {
      schema_version: 1,
      id: "iteration_contract_old_open_ga",
      ref: "self-evolution/iterations/iteration_contract_old_open_ga.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older open GA design hardening slice.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "older_open_ga_design_hardening",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:00Z",
      boundary: "bounded iteration contract"
    });
    for (let index = 1; index <= 5; index += 1) {
      await store.writeJson(`self-evolution/iterations/iteration_contract_new_verified_ga_${index}.json`, {
        schema_version: 1,
        id: `iteration_contract_new_verified_ga_${index}`,
        ref: `self-evolution/iterations/iteration_contract_new_verified_ga_${index}.json`,
        kind: "self_evolution_iteration_contract",
        status: "recorded",
        summary: `Newer verified GA project-design artifact ${index}.`,
        layer: "core_runtime",
        owner_surface: "ga_project_design",
        proposed_slice: `newer_verified_ga_design_${index}`,
        evidence_refs: ["packages/core/src/ga_project_design.ts"],
        verification_commands: ["pnpm run check"],
        non_goals: ["no completion proof"],
        advisory_expert_roles: ["architect", "verification_reviewer"],
        outcome: {
          status: "verified",
          summary: "Verification passed.",
          evidence_refs: ["tests/self_evolution_scorecard.test.ts"],
          verification_commands: ["pnpm run check"],
          next_moves: ["Use this newer artifact for the next core slice."],
          recorded_at: `2026-07-06T00:00:0${index}Z`,
          boundary: "bounded outcome record"
        },
        created_at: `2026-07-06T00:00:0${index}Z`,
        boundary: "bounded iteration contract"
      });
    }

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 3 });
    const core = scorecard.dimensions.find((dimension) => dimension.id === "core_ga_design");

    assert.equal(scorecard.refs.includes("self-evolution/iterations/iteration_contract_old_open_ga.json"), false);
    assert.match(core?.next_moves[0] ?? "", /superseded open iteration iteration_contract_old_open_ga/);
    assert.equal(scorecard.next_core_basic_slice?.layer, "core_runtime");
    assert.equal(scorecard.default_next_slice?.layer, "core_runtime");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution scorecard scores the SOP skill memory loop only when all three signals exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-scorecard-sop-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("memory/semantic/accepted/semantic_memory_sop_loop.json", {
      id: "semantic_memory_sop_loop",
      action_type: "semantic_memory",
      status: "accepted",
      scope: "sop_skill_memory_loop",
      summary: "Reusable corrections should pass through SOP and skill gates.",
      content: "Do not bypass explicit gates.",
      source_candidate_id: "memory_proposal_sop_loop",
      source_candidate_ref: "memory/semantic/candidates/memory_proposal_sop_loop.json",
      artifact_refs: ["sop/drafts/sop_iteration_outcome.json"],
      confirmation_ref: "memory/semantic/confirmations/memory_confirmation_sop_loop.json",
      created_at: "2026-07-06T00:00:00Z",
      accepted_at: "2026-07-06T00:00:01Z",
      boundary: "local state semantic memory"
    });
    await store.writeJson("sop/drafts/sop_iteration_outcome.json", {
      id: "sop_iteration_outcome",
      title: "Verified iteration outcome SOP candidate",
      trigger: "Use when a verified self-evolution outcome recurs.",
      procedure: ["Inspect iteration evidence before drafting or promotion."],
      required_tools: ["governance.iterations"],
      verification: "The draft cites verified iteration evidence.",
      failure_modes: ["Leave unpromoted if evidence is stale."],
      evidence_refs: ["self-evolution/iterations/iteration_contract_scorecard_sop.json"],
      revision: 1,
      status: "draft"
    });
    await store.appendRepoJsonl("vault/registry/skill-events.jsonl", {
      id: "skill_event_sop_loop",
      kind: "promoted",
      skill_name: "verified-iteration-outcome",
      instructions_ref: "vault/skills/verified-iteration-outcome/SKILL.md",
      source_sop_ref: "sop/drafts/sop_iteration_outcome.json",
      audit_ref: "governance/audits/audit_iteration_outcome.json",
      evidence_refs: ["sop/drafts/sop_iteration_outcome.json"],
      artifact_refs: ["vault/skills/verified-iteration-outcome/SKILL.md"],
      summary: "Promoted a verified iteration outcome SOP.",
      created_at: "2026-07-06T00:00:02Z"
    });

    const scorecard = await getSelfEvolutionScorecard(store, { limit: 3 });
    const sopLoop = scorecard.dimensions.find((dimension) => dimension.id === "sop_skill_memory_loop");
    assert.equal(sopLoop?.score, 5);
    assert.match(sopLoop?.summary ?? "", /semantic memory, SOP draft, and skill-event evidence/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
