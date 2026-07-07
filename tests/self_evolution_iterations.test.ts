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
import { getGaProjectDesignReadModel } from "../packages/core/src/ga_project_design.js";
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
      implementationContract: {
        proposed_slice: "self_evolution_iteration_contract",
        source_artifact_id: "ga_design_artifact_iteration_contract_seed",
        source_proposed_slice: "previous_core_slice",
        selected_layer: "core_runtime",
        owner_surface: "runtime_contract",
        improvement_type: "reusable_ga_design_contract",
        implementation_scope: ["change one reusable GA project-design contract or read-model surface"],
        deferred_scope: ["no external adapter or tool integration unless it names a reusable runtime contract"],
        delivery_standard: ["future iterations can inspect the contract without inferring intent from the opaque slice id"],
        boundary: "read-only GA implementation contract"
      },
      evidenceRefs: ["packages/core/src/self_evolution_scorecard.ts", "packages/core/src/expert_orchestration.ts"],
      verificationCommands: ["pnpm run check"],
      nonGoals: ["no scheduler"]
    });

    assert.equal(recorded.action, "record-iteration");
    assert.equal(recorded.iteration.layer, "core_runtime");
    assert.equal(recorded.iteration.owner_surface, "runtime_contract");
    assert.equal(recorded.iteration.proposed_slice, "self_evolution_iteration_contract");
    assert.equal(recorded.iteration.implementation_contract?.proposed_slice, "self_evolution_iteration_contract");
    assert.equal(recorded.iteration.implementation_contract?.selected_layer, "core_runtime");
    assert.equal(recorded.iteration.implementation_contract?.deferred_scope.some((item) => item.includes("external adapter")), true);
    assert.deepEqual(recorded.iteration.advisory_expert_roles, ["architect", "verification_reviewer", "orchestration_planner"]);
    assert.equal(recorded.iteration.verification_commands.includes("pnpm run check"), true);
    assert.equal(recorded.iteration.non_goals.includes("no scheduler"), true);
    assert.match(recorded.boundary, /writes one bounded local state record only/);
    assert.match(recorded.boundary, /does not invoke models/);
    assert.match(recorded.boundary, /prove completion/);

    const detail = await getSelfEvolutionIteration(store, { iterationRef: recorded.iteration.id });
    assert.equal(detail.iteration.ref, recorded.iteration.ref);
    assert.equal(detail.iteration.implementation_contract?.delivery_standard.some((item) => item.includes("opaque slice id")), true);

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
    const implementationContract = {
      proposed_slice: "general_agent_delegation_hardening_after_seed",
      source_artifact_id: "ga_design_artifact_iteration_contract_seed",
      source_proposed_slice: "previous_core_slice",
      selected_layer: "core_runtime" as const,
      owner_surface: "ga_project_design",
      improvement_type: "reusable_ga_design_contract" as const,
      implementation_scope: ["change one reusable GA project-design contract or read-model surface"],
      deferred_scope: ["no external adapter or tool integration unless it names a reusable runtime contract"],
      delivery_standard: ["future iterations can inspect the contract without inferring intent from the opaque slice id"],
      boundary: "read-only GA implementation contract"
    };
    const args = {
      summary: "Open next general delegation hardening slice from the current plan seed.",
      layer: "core_runtime" as const,
      ownerSurface: "ga_project_design",
      proposedSlice: "general_agent_delegation_hardening_after_seed",
      sourceRef: "self-evolution/iterations/iteration_contract_seed.json",
      implementationContract,
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
    assert.equal(second.iteration.implementation_contract?.source_artifact_id, "ga_design_artifact_iteration_contract_seed");
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

test("fresh GA project design bootstrap plan can open the first core iteration", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-iteration-bootstrap-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const plan = (await getGaProjectDesignReadModel(store, { limit: 10 })).next_core_basic_plan;
    assert.ok(plan);
    assert.equal(plan.source_kind, "fresh_bootstrap");

    const args = {
      summary: plan.next_iteration_seed.summary,
      layer: plan.next_iteration_seed.layer,
      ownerSurface: plan.next_iteration_seed.owner_surface,
      proposedSlice: plan.next_iteration_seed.proposed_slice,
      sourceRef: plan.next_iteration_seed.source_ref,
      implementationContract: plan.implementation_contract,
      evidenceRefs: plan.next_iteration_seed.evidence_refs,
      verificationCommands: plan.next_iteration_seed.verification_commands,
      nonGoals: plan.next_iteration_seed.non_goals,
      reuseOpen: true
    };
    const first = await recordSelfEvolutionIteration(store, args);
    const second = await recordSelfEvolutionIteration(store, args);

    assert.equal(first.created, true);
    assert.equal(first.iteration.layer, "core_runtime");
    assert.equal(first.iteration.owner_surface, "ga_project_design");
    assert.equal(first.iteration.proposed_slice, "core_ga_design_fresh_bootstrap");
    assert.equal(first.iteration.source_ref, "docs/RUNTIME_CONTRACT.md");
    assert.equal(first.iteration.implementation_contract?.source_artifact_id, "ga_design_bootstrap_contract_source");
    assert.equal(first.iteration.implementation_contract?.source_proposed_slice, "fresh_state_no_verified_iteration");
    assert.equal(first.iteration.verification_commands.includes("pnpm run runtime -- governance project-design --state-root <state-root>"), true);
    assert.equal(first.iteration.verification_commands.some((command) => command.includes("--artifact ga_design_bootstrap_contract_source")), false);
    assert.equal(second.created, false);
    assert.equal(second.reused_existing, true);
    assert.equal(second.iteration.id, first.iteration.id);
    assert.equal((await listSelfEvolutionIterations(store)).count, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
