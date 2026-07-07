import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getLatestSelfEvolutionIteration,
  getSelfEvolutionIteration,
  listSelfEvolutionIterations,
  recordSelfEvolutionIterationOutcome,
  recordSelfEvolutionIteration
} from "../packages/core/src/self_evolution_iterations.js";
import { AgentStore } from "../packages/core/src/store.js";

test("self-evolution iteration contracts record layer declarations without executing work", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-iteration-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const recorded = await recordSelfEvolutionIteration(store, {
      summary: "Record the current work as a core-runtime self-iteration contract.",
      layer: "core_runtime",
      ownerSurface: "runtime_contract",
      proposedSlice: "self_evolution_iteration_contract",
      sourceRef: "memory/dreams/dream_core.json",
      evidenceRefs: ["packages/core/src/self_evolution_scorecard.ts", "packages/core/src/expert_orchestration.ts"],
      verificationCommands: ["pnpm run check"],
      nonGoals: ["no scheduler"]
    });

    assert.equal(recorded.action, "record-iteration");
    assert.equal(recorded.iteration.layer, "core_runtime");
    assert.equal(recorded.iteration.owner_surface, "runtime_contract");
    assert.equal(recorded.iteration.proposed_slice, "self_evolution_iteration_contract");
    assert.deepEqual(recorded.iteration.advisory_expert_roles, ["architect", "verification_reviewer", "orchestration_planner"]);
    assert.equal(recorded.iteration.verification_commands.includes("pnpm run check"), true);
    assert.equal(recorded.iteration.non_goals.includes("no scheduler"), true);
    assert.match(recorded.boundary, /writes one bounded local state record only/);
    assert.match(recorded.boundary, /does not invoke models/);
    assert.match(recorded.boundary, /prove completion/);

    const detail = await getSelfEvolutionIteration(store, { iterationRef: recorded.iteration.id });
    assert.equal(detail.iteration.ref, recorded.iteration.ref);

    const outcome = await recordSelfEvolutionIterationOutcome(store, {
      iterationRef: recorded.iteration.id,
      status: "verified",
      summary: "Implementation and verification completed for this bounded slice.",
      evidenceRefs: ["tests/self_evolution_iterations.test.ts"],
      verificationCommands: ["pnpm exec tsx --test tests/self_evolution_iterations.test.ts"],
      verificationClaims: ["check: iteration outcome records persisted verification claim coverage"],
      nextMoves: ["Use outcome records to guide the next scorecard slice."]
    });

    assert.equal(outcome.action, "record-iteration-outcome");
    assert.equal(outcome.iteration.outcome?.status, "verified");
    assert.equal(outcome.iteration.outcome?.evidence_refs.includes("tests/self_evolution_iterations.test.ts"), true);
    assert.equal(outcome.iteration.outcome?.verification_commands.includes("pnpm exec tsx --test tests/self_evolution_iterations.test.ts"), true);
    assert.equal(outcome.iteration.outcome?.verification_claims.includes("check: iteration outcome records persisted verification claim coverage"), true);
    assert.equal(outcome.iteration.outcome?.next_moves.includes("Use outcome records to guide the next scorecard slice."), true);
    assert.match(outcome.boundary, /updates one existing local iteration record only/);
    assert.match(outcome.boundary, /does not run verification commands/);

    const outcomeDetail = await getSelfEvolutionIteration(store, { iterationRef: recorded.iteration.ref });
    assert.equal(outcomeDetail.iteration.outcome?.summary, "Implementation and verification completed for this bounded slice.");

    const latest = await getLatestSelfEvolutionIteration(store);
    assert.equal(latest?.id, recorded.iteration.id);
    assert.equal(latest?.outcome?.status, "verified");

    const list = await listSelfEvolutionIterations(store, { limit: 5 });
    assert.equal(list.count, 1);
    assert.deepEqual(list.iteration_refs, [recorded.iteration.ref]);
    assert.equal(list.iterations[0]?.outcome?.status, "verified");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution iteration contracts select advisory roles by layer", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-iteration-roles-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const recorded = await recordSelfEvolutionIteration(store, {
      summary: "Record basic runtime substrate work.",
      layer: "basic_entrypoint",
      ownerSurface: "service_health",
      proposedSlice: "resident_health_visibility"
    });

    assert.deepEqual(recorded.iteration.advisory_expert_roles, ["runtime_operator", "verification_reviewer"]);
    assert.equal(recorded.iteration.verification_commands.includes("pnpm run check"), true);
    assert.equal(recorded.iteration.non_goals.some((item) => item.includes("does not execute")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution iteration outcome can merge existing evidence lists", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-iteration-merge-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const recorded = await recordSelfEvolutionIteration(store, {
      summary: "Record a core iteration that will need outcome repair.",
      layer: "core_runtime",
      ownerSurface: "ga_project_design",
      proposedSlice: "outcome_merge_repair",
      evidenceRefs: ["packages/core/src/self_evolution_iterations.ts"],
      verificationCommands: ["pnpm run check"]
    });

    await recordSelfEvolutionIterationOutcome(store, {
      iterationRef: recorded.iteration.id,
      status: "verified",
      summary: "Initial verified outcome.",
      evidenceRefs: ["apps/cli/src/main.ts"],
      verificationCommands: ["pnpm run check"],
      verificationClaims: ["check: full repo check passed"],
      nextMoves: ["Open the successor slice."]
    });

    const merged = await recordSelfEvolutionIterationOutcome(store, {
      iterationRef: recorded.iteration.id,
      status: "verified",
      summary: "Merged successor evidence into the verified outcome.",
      evidenceRefs: ["self-evolution/iterations/iteration_contract_next.json", "apps/cli/src/main.ts"],
      verificationCommands: ["pnpm run runtime -- governance iterations --audit-seed all"],
      verificationClaims: ["iterations: successor ref is now outcome evidence"],
      nextMoves: ["Continue with the successor slice."],
      mergeExisting: true
    });

    assert.deepEqual(merged.iteration.outcome?.evidence_refs, [
      "apps/cli/src/main.ts",
      "self-evolution/iterations/iteration_contract_next.json"
    ]);
    assert.deepEqual(merged.iteration.outcome?.verification_commands, [
      "pnpm run check",
      "pnpm run runtime -- governance iterations --audit-seed all"
    ]);
    assert.deepEqual(merged.iteration.outcome?.verification_claims, [
      "check: full repo check passed",
      "iterations: successor ref is now outcome evidence"
    ]);
    assert.deepEqual(merged.iteration.outcome?.next_moves, [
      "Open the successor slice.",
      "Continue with the successor slice."
    ]);
    assert.match(merged.iteration.outcome?.boundary ?? "", /merged existing outcome evidence refs/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-evolution iteration contracts can reuse matching open plan-derived iterations", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-iteration-reuse-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const args = {
      summary: "Open next GA design slice from the current plan seed.",
      layer: "core_runtime" as const,
      ownerSurface: "ga_project_design",
      proposedSlice: "core_ga_design_next_slice_after_seed",
      sourceRef: "self-evolution/iterations/iteration_contract_seed.json",
      evidenceRefs: ["packages/core/src/ga_project_design.ts"],
      verificationCommands: ["pnpm run check"],
      nonGoals: ["does not execute the planned slice"],
      reuseOpen: true
    };
    const first = await recordSelfEvolutionIteration(store, args);
    const second = await recordSelfEvolutionIteration(store, args);

    assert.equal(first.created, true);
    assert.equal(first.reused_existing, false);
    assert.equal(second.created, false);
    assert.equal(second.reused_existing, true);
    assert.equal(second.iteration.id, first.iteration.id);
    assert.match(second.boundary, /reused existing open iteration/);
    assert.equal((await listSelfEvolutionIterations(store)).count, 1);

    await recordSelfEvolutionIterationOutcome(store, {
      iterationRef: first.iteration.id,
      status: "verified",
      summary: "The first plan-derived iteration is closed.",
      evidenceRefs: ["tests/self_evolution_iterations.test.ts"],
      verificationCommands: ["pnpm exec tsx --test tests/self_evolution_iterations.test.ts"],
      nextMoves: ["A later plan seed may open another iteration."]
    });
    const third = await recordSelfEvolutionIteration(store, args);

    assert.equal(third.created, true);
    assert.equal(third.reused_existing, false);
    assert.notEqual(third.iteration.id, first.iteration.id);
    assert.equal((await listSelfEvolutionIterations(store)).count, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
