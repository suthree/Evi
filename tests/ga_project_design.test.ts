import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deriveGaProjectDesignArtifacts,
  getGaProjectDesignArtifactPacket,
  getGaProjectDesignContract,
  getGaProjectDesignReadModel,
  selectGaProjectDesignArtifact
} from "../packages/core/src/ga_project_design.js";
import { compactGaPlanGovernanceCleanup } from "../packages/core/src/context.js";
import { DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND } from "../packages/core/src/schemas.js";
import type { SelfEvolutionIterationContract } from "../packages/core/src/self_evolution_iterations.js";
import { AgentStore } from "../packages/core/src/store.js";

test("GA project design contract keeps core project design separate from application tools", () => {
  const contract = getGaProjectDesignContract();

  assert.equal(contract.contract_id, "ga_project_design_contract");
  assert.equal(contract.action, "project-design");
  assert.equal(contract.layer, "core_runtime");
  assert.equal(contract.status, "implemented");
  assert.equal(contract.commands.includes("pnpm run runtime -- governance project-design"), true);
  assert.equal(contract.commands.some((command) => command.includes("--audit-seed <seed-id>")), true);
  assert.equal(contract.phases.length, 6);
  assert.deepEqual(
    contract.phases.map((phase) => phase.id),
    [
      "goal_intake",
      "capability_layering",
      "contract_design",
      "execution_plan",
      "verification_review",
      "learning_persistence"
    ]
  );
  assert.equal(contract.phases.some((phase) => phase.layer === "basic_entrypoint"), true);
  assert.equal(contract.phases.some((phase) => phase.layer === "local_learning"), true);
  assert.equal(contract.decision_rules.some((rule) => rule.includes("application slices")), true);
  assert.equal(contract.decision_rules.some((rule) => rule.includes("SOPs and skills may preserve repeatable procedure")), true);
  assert.equal(contract.verification_policy.some((policy) => policy.includes("current worktree and runtime state")), true);
  assert.equal(contract.non_goals.includes("no external-tool execution"), true);
  assert.equal(contract.refs.includes("packages/core/src/ga_project_design.ts"), true);
  assert.match(contract.boundary, /read-only GA project design contract/);
  assert.match(contract.boundary, /does not invoke models/);
  assert.match(contract.boundary, /prove completion/);
});

test("GA project design read model bootstraps the first core/basic plan from empty state", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-ga-design-bootstrap-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const readModel = await getGaProjectDesignReadModel(store, { limit: 10 });
    const plan = readModel.next_core_basic_plan;

    assert.equal(readModel.artifact_count, 0);
    assert.equal(readModel.listed_artifact_count, 0);
    assert.equal(readModel.artifacts.length, 0);
    assert.ok(plan);
    assert.equal(plan.source_kind, "fresh_bootstrap");
    assert.equal(plan.target_dimension_id, "core_ga_design");
    assert.equal(plan.target_slice_id, "next_slice_core_ga_design");
    assert.equal(plan.source_artifact_id, "ga_design_bootstrap_contract_source");
    assert.equal(plan.source_iteration_ref, "docs/RUNTIME_CONTRACT.md");
    assert.equal(plan.source_proposed_slice, "fresh_state_no_verified_iteration");
    assert.equal(plan.proposed_slice, "core_ga_design_fresh_bootstrap");
    assert.equal(plan.next_iteration_seed.proposed_slice, "core_ga_design_fresh_bootstrap");
    assert.equal(plan.next_iteration_seed.source_ref, "docs/RUNTIME_CONTRACT.md");
    assert.equal(plan.next_command, "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>");
    assert.equal(plan.selection_reasons.includes("source_kind=fresh_bootstrap"), true);
    assert.equal(plan.selection_reasons.includes("source_status=bootstrap"), true);
    assert.equal(plan.selection_checks.some((check) => check.startsWith("source_bootstrap_contract=true")), true);
    assert.equal(plan.selection_checks.some((check) => check.includes("source_artifact_verified=verified")), false);
    assert.match(plan.planning_basis, /GA project design contract as bootstrap source/);
    assert.equal(plan.next_iteration_seed.non_goals.some((nonGoal) => nonGoal.includes("bootstrap source as a verified completed slice")), true);
    assert.match(plan.boundary, /fresh-state bootstrap source/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GA project design read model derives reusable artifacts from verified iteration outcomes with evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-ga-design-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const verifiedIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_verified",
      ref: "self-evolution/iterations/iteration_contract_verified.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Turn verified outcomes into reusable GA design artifacts.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "verified_iteration_to_design_artifact",
      source_ref: "memory/dreams/dream_core.json",
      evidence_refs: [
        "packages/core/src/ga_project_design.ts",
        "self-evolution/iterations/iteration_contract_stale_history.json"
      ],
      verification_commands: ["pnpm exec tsx --test tests/ga_project_design.test.ts"],
      non_goals: [
        "no active-vault write",
        "does not repeat completed source slice stale_previous_slice"
      ],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Project-design artifact derivation passed targeted verification.",
        evidence_refs: ["tests/ga_project_design.test.ts"],
        verification_commands: ["pnpm exec tsx --test tests/ga_project_design.test.ts"],
        next_moves: ["Reuse the artifact when planning the next GA design slice; treat iteration_contract_stale_history as separate governance cleanup."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    };
    const partialIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_partial",
      ref: "self-evolution/iterations/iteration_contract_partial.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Partial work should not become a reusable design artifact.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "partial_project_design_slice",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect"],
      outcome: {
        status: "partial",
        summary: "Verification is incomplete.",
        evidence_refs: ["tests/ga_project_design.test.ts"],
        verification_commands: [],
        next_moves: ["Finish verification before reuse."],
        recorded_at: "2026-07-06T00:00:04Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration contract"
    };
    const weakVerifiedIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_weak_verified",
      ref: "self-evolution/iterations/iteration_contract_weak_verified.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified without outcome evidence should not become reusable.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "weak_verified_project_design_slice",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof without evidence"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Status is verified but no outcome evidence was recorded.",
        evidence_refs: [],
        verification_commands: [],
        next_moves: ["Record evidence before reuse."],
        recorded_at: "2026-07-06T00:00:05Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:05Z",
      boundary: "bounded iteration contract"
    };
    const staleOpenIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_stale_history",
      ref: "self-evolution/iterations/iteration_contract_stale_history.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older open GA iteration should stay cleanup, not source evidence.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "core_ga_design_next_slice_after_stale_history",
      source_ref: "self-evolution/iterations/iteration_contract_previous.json",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:02Z",
      boundary: "bounded iteration contract"
    };
    const unrelatedOpenIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_unrelated_history",
      ref: "self-evolution/iterations/iteration_contract_unrelated_history.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older unrelated GA iteration should not be inferred as cleanup.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "core_ga_design_next_slice_after_unrelated",
      source_ref: "self-evolution/iterations/iteration_contract_unrelated_source.json",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no completion proof"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:01Z",
      boundary: "bounded iteration contract"
    };
    await store.writeJson(staleOpenIteration.ref, staleOpenIteration);
    await store.writeJson(unrelatedOpenIteration.ref, unrelatedOpenIteration);
    await store.writeJson(verifiedIteration.ref, verifiedIteration);
    await store.writeJson(partialIteration.ref, partialIteration);
    await store.writeJson(weakVerifiedIteration.ref, weakVerifiedIteration);

    const readModel = await getGaProjectDesignReadModel(store, { limit: 10 });
    const derived = deriveGaProjectDesignArtifacts([
      weakVerifiedIteration,
      partialIteration,
      staleOpenIteration,
      unrelatedOpenIteration,
      verifiedIteration
    ]);

    assert.equal(readModel.action, "project-design");
    assert.equal(readModel.artifact_count, 1);
    assert.equal(readModel.artifact_policy[0]?.includes("outcome evidence refs and verification commands"), true);
    assert.equal(readModel.artifacts[0]?.id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(readModel.artifacts[0]?.source_iteration_ref, "self-evolution/iterations/iteration_contract_verified.json");
    assert.equal(readModel.artifacts[0]?.source_outcome_status, "verified");
    assert.equal(readModel.artifacts[0]?.owner_surface, "ga_project_design");
    assert.match(readModel.artifacts[0]?.reusable_pattern ?? "", /explicit non-goals/);
    assert.equal(readModel.artifacts[0]?.evidence_refs.includes("memory/dreams/dream_core.json"), true);
    assert.equal(readModel.artifacts[0]?.evidence_refs.includes("self-evolution/iterations/iteration_contract_stale_history.json"), false);
    assert.equal(readModel.artifacts[0]?.verification_commands.includes("pnpm exec tsx --test tests/ga_project_design.test.ts"), true);
    assert.match(readModel.artifacts[0]?.next_use ?? "", /Reuse the artifact when planning the next GA design slice/);
    assert.match(readModel.artifacts[0]?.next_use ?? "", /iteration_contract_stale_history/);
    assert.equal(readModel.artifacts[0]?.non_goals.includes("does not repeat completed source slice stale_previous_slice"), false);
    assert.match(readModel.artifacts[0]?.boundary ?? "", /read-only derived GA project design artifact/);
    assert.equal(readModel.next_core_basic_plan?.action, "project-design-plan");
    assert.equal(readModel.next_core_basic_plan?.status, "advisory");
    assert.equal(readModel.next_core_basic_plan?.target_dimension_id, "general_agent_delegation");
    assert.equal(readModel.next_core_basic_plan?.target_slice_id, "next_slice_general_agent_delegation");
    assert.equal(readModel.next_core_basic_plan?.source_artifact_id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(readModel.next_core_basic_plan?.layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.owner_surface, "ga_project_design");
    assert.equal(readModel.next_core_basic_plan?.proposed_slice, "general_agent_delegation_hardening_after_verified");
    assert.equal(readModel.next_core_basic_plan?.source_proposed_slice, "verified_iteration_to_design_artifact");
    assert.notEqual(readModel.next_core_basic_plan?.proposed_slice, readModel.next_core_basic_plan?.source_proposed_slice);
    assert.match(readModel.next_core_basic_plan?.planning_basis ?? "", /instead of repeating completed slice verified_iteration_to_design_artifact/);
    assert.match(readModel.next_core_basic_plan?.goal_scope.objective ?? "", /core\/basic GA project-design capability gains/);
    assert.equal(readModel.next_core_basic_plan?.goal_scope.owner_surface, "ga_project_design");
    assert.equal(readModel.next_core_basic_plan?.goal_scope.source_of_truth.includes("operator_objective=core_basic_self_evolution_first"), true);
    assert.equal(readModel.next_core_basic_plan?.goal_scope.source_of_truth.includes("source_artifact=ga_design_artifact_iteration_contract_verified"), true);
    assert.equal(readModel.next_core_basic_plan?.goal_scope.success_evidence.some((evidence) => evidence.includes("target_slice=general_agent_delegation_hardening_after_verified")), true);
    assert.equal(readModel.next_core_basic_plan?.implementation_contract.proposed_slice, "general_agent_delegation_hardening_after_verified");
    assert.equal(readModel.next_core_basic_plan?.implementation_contract.selected_layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.implementation_contract.implementation_scope.some((item) => item.includes("one reusable GA project-design contract")), true);
    assert.equal(readModel.next_core_basic_plan?.implementation_contract.deferred_scope.some((item) => item.includes("external adapter or tool integration")), true);
    assert.equal(readModel.next_core_basic_plan?.implementation_contract.delivery_standard.some((item) => item.includes("without inferring intent from the opaque slice id")), true);
    assert.equal(readModel.next_core_basic_plan?.iteration_focus.direction_id, "core_basic_plan_clarity");
    assert.match(readModel.next_core_basic_plan?.iteration_focus.direction ?? "", /Clarify the next core\/basic GA design improvement/);
    assert.match(readModel.next_core_basic_plan?.iteration_focus.rationale ?? "", /verified GA design evidence/);
    assert.equal(readModel.next_core_basic_plan?.iteration_focus.next_steps.some((step) => step.includes("matching open iteration")), true);
    assert.equal(readModel.next_core_basic_plan?.iteration_focus.anti_drift_checks.some((check) => check.includes("external adapter or MCP pressure")), true);
    assert.equal(readModel.next_core_basic_plan?.iteration_focus.anti_drift_checks.some((check) => check.includes("SOP, skill, memory, or dream")), true);
    assert.deepEqual(
      readModel.next_core_basic_plan?.capability_stage_plan.core_capabilities.map((capability) => `${capability.id}:${capability.stage}`),
      ["goal_intake:active", "capability_layering:active", "contract_design:hardening", "verification_review:active"]
    );
    assert.deepEqual(
      readModel.next_core_basic_plan?.capability_stage_plan.basic_capabilities.map((capability) => `${capability.id}:${capability.stage}`),
      ["execution_plan:active", "runtime_observability:attention_guard"]
    );
    assert.equal(
      readModel.next_core_basic_plan?.capability_stage_plan.core_capabilities.find((capability) => capability.id === "contract_design")?.exit_criteria.includes("verified outcome evidence exists before the improvement is reused"),
      true
    );
    assert.equal(
      readModel.next_core_basic_plan?.capability_stage_plan.basic_capabilities.find((capability) => capability.id === "runtime_observability")?.exit_criteria.includes("service health is inspected for the resident runtime target"),
      true
    );
    assert.equal(readModel.next_core_basic_plan?.capability_stage_plan.next_iteration_plan.some((step) => step.includes("not an external adapter task")), true);
    assert.equal(readModel.next_core_basic_plan?.capability_stage_plan.next_iteration_plan.some((step) => step.includes("before any SOP, skill, memory, or dream reuse")), true);
    assert.equal(readModel.next_core_basic_plan?.capability_stage_plan.next_iteration_plan.some((step) => step.startsWith("core_runtime[goal_scope]:")), true);
    assert.equal(readModel.next_core_basic_plan?.capability_stage_plan.next_iteration_plan.some((step) => step.startsWith("core_runtime[current_state]:")), true);
    assert.equal(readModel.next_core_basic_plan?.capability_stage_plan.next_iteration_plan.some((step) => step.startsWith("basic_entrypoint[verification_scope]:")), true);
    assert.equal(readModel.next_core_basic_plan?.capability_stage_plan.next_iteration_plan.some((step) => step.startsWith("local_learning[learning_persistence]:")), true);
    assert.deepEqual(
      readModel.next_core_basic_plan?.scorecard_basis,
      [
        "next_core_basic_slice=next_slice_general_agent_delegation",
        "target_dimension=general_agent_delegation",
        "target_layer=core_runtime",
        "scorecard_command=pnpm run runtime -- governance scorecard --state-root <state-root>"
      ]
    );
    assert.equal(readModel.next_core_basic_plan?.selection_status, "ready");
    assert.equal(readModel.next_core_basic_plan?.selection_reasons.includes("source_status=verified"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_reasons.includes("source_artifact_quality=attention"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_reasons.includes("fresh_successor_slice=true"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_reasons.includes("target_layer=core_runtime"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_reasons.includes("iteration_record_status=not_recorded"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.some((check) => check.includes("source_artifact_verified=verified")), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.includes("source_artifact_evidence=evidence_refs:4; verification_commands:1"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.includes("source_artifact_warning_thresholds=evidence_refs:2; verification_commands:2"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.includes("source_artifact_warning=thin_verification_commands; minimum=2; actual=1"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.some((check) => check.includes("fresh_successor_slice=true")), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.some((check) => check.includes("target_layer=core_runtime")), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.some((check) => check.includes("iteration_record_status=not_recorded")), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.includes("governance_cleanup_superseded_open_iterations=1"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.includes("verification_entrypoints=project-design,scorecard,iterations,service-health,check"), true);
    assert.equal(readModel.next_core_basic_plan?.layer_decision.core_identity, "recurring_ga_project_design");
    assert.equal(readModel.next_core_basic_plan?.layer_decision.selected_layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.layer_decision.source_layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.layer_decision.stage, "core_basic_successor_ready");
    assert.equal(readModel.next_core_basic_plan?.layer_decision.reasons.some((reason) => reason.includes("not a single external adapter")), true);
    assert.equal(readModel.next_core_basic_plan?.layer_decision.application_boundaries.some((boundary) => boundary.includes("external tools and adapters stay application slices")), true);
    assert.equal(readModel.next_core_basic_plan?.layer_decision.application_boundaries.some((boundary) => boundary.includes("expert and multi-agent scheduling follow after the general delegation loop is stable")), true);
    assert.equal(readModel.next_core_basic_plan?.layer_decision.required_before_outcome.some((command) => command.includes("--audit-seed all")), true);
    assert.equal(readModel.next_core_basic_plan?.learning_authority.process_scaffold.includes("SOPs and skills may preserve repeatable workflow"), true);
    assert.equal(readModel.next_core_basic_plan?.learning_authority.judgment_authority.includes("core/basic layer selection stays with ga_project_design"), true);
    assert.equal(readModel.next_core_basic_plan?.learning_authority.completion_authority.includes("verified iteration outcome plus completion_gate coverage"), true);
    assert.equal(readModel.next_core_basic_plan?.learning_authority.promotion_gate.includes("later local-learning gates"), true);
    assert.match(readModel.next_core_basic_plan?.learning_authority.boundary ?? "", /read-only learning authority boundary/);
    assert.equal(readModel.next_core_basic_plan?.capability_stage_plan.next_iteration_plan.some((step) => step.startsWith("core_runtime[general_agent_delegation]: audit and sync existing runner-enforced delegate_agent task/context/result/trace/replay/completion contract")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.action, "delegate_agent");
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.max_actions_per_round, DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.task_contract.max_chars, 1000);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.task_contract.required.some((item) => item.includes("explicit bounded analysis")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.task_contract.required.some((item) => item.includes("no tool, mutation, scheduling, or completion authority")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.task_contract.reject_if.some((item) => item.includes("command or test execution")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.task_contract.reject_if.some((item) => item.includes("execute tools, mutate state, or decide completion")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.task_contract.reject_if.some((item) => item.includes("expert scheduling or multi-agent orchestration")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.context_contract.max_chars, 12000);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.context_contract.required.some((item) => item.includes("no tool/write/mutation authority")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.context_contract.required.some((item) => item.includes("summary/findings_text")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.context_contract.reject_if.some((item) => item.includes("omits delegated authority limits")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.context_contract.reject_if.some((item) => item.includes("expert scheduling, multi-agent orchestration, model fan-out")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_contract.summary_max_chars, 240);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_contract.findings_max_chars, 2000);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_contract.required.some((item) => item.includes("advisory context, not verification proof")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_contract.reject_if.some((item) => item.includes("completion verification proof")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_contract.reject_if.some((item) => item.includes("hidden memory")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.dispatch_failure_kind_contract.field, "dispatch_failure_kind");
    assert.deepEqual(readModel.next_core_basic_plan?.general_delegation_loop.dispatch_failure_kind_contract.values, [
      "dispatch_limit_exceeded",
      "input_contract_failed",
      "none"
    ]);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.dispatch_failure_kind_contract.required.some((item) => item.includes("harness replay checks")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.dispatch_failure_kind_contract.reject_if.some((item) => item.includes("free-form error text")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_failure_kind_contract.field, "result_failure_kind");
    assert.deepEqual(readModel.next_core_basic_plan?.general_delegation_loop.result_failure_kind_contract.values, [
      "dispatch_limit_exceeded",
      "input_contract_failed",
      "delegated_output_contract_failed",
      "delegated_model_request_failed",
      "none"
    ]);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_failure_kind_contract.required.some((item) => item.includes("delegated_output_contract_failed")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_failure_kind_contract.required.some((item) => item.includes("delegated_model_request_failed")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.result_failure_kind_contract.reject_if.some((item) => item.includes("raw delegated artifact bodies")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.instruction_boundary.some((item) => item.includes("model proposes while the harness executes")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.input_contract.some((item) => item.includes("parseDelegationRequest")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.input_contract.some((item) => item.includes("command/test execution")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.input_contract.some((item) => item.includes("expected summary/findings_text output shape")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.result_handling.some((item) => item.includes("rejects raw task/context echoes")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.result_handling.some((item) => item.includes("forbidden-source claims")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.result_handling.some((item) => item.includes("sanitizes successful summary/findings")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.completion_gate.some((item) => item.includes("delegatedVerificationRefs")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.completion_gate.some((item) => item.includes("delegatedIndependentEvidenceCheck")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.recovery_contract.inputs.includes("result_failure_kind"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.recovery_contract.required.some((item) => item.includes("main-harness model round")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.recovery_contract.required.some((item) => item.includes("independent verification evidence")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.recovery_contract.reject_if.some((item) => item.includes("automatic retry")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.metadata_source.includes("Live Run Trace delegated dispatch metadata"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.metadata_source.includes("delegated_result event summaries"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.required_metadata.includes("dispatch_failure_kind"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.required_metadata.includes("result_failure_kind"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.checks.includes("delegated_action_coverage"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.checks.includes("delegated_dispatch_failure_kind"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.checks.includes("delegated_dispatch_round_limit"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.checks.includes("delegated_result_failure_kind"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.proof_boundary.some((item) => item.includes("Live Run Trace exposes safe delegated dispatch metadata")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.evidence_refs.includes("packages/core/src/live_run_trace.ts"), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.proof_boundary.some((item) => item.includes("must not read delegated result artifact bodies")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.completion_authority.some((item) => item.includes("main harness verifies")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.completion_authority.some((item) => item.includes("do not prove completion")), true);
    assert.equal(readModel.next_core_basic_plan?.general_delegation_loop.deferred_scope.some((item) => item.includes("no expert personas")), true);
    assert.match(readModel.next_core_basic_plan?.general_delegation_loop.boundary ?? "", /does not spawn agents/);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.owner_surface, "ga_project_design");
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.proposed_slice, "general_agent_delegation_hardening_after_verified");
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.source_ref, verifiedIteration.ref);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.evidence_refs.includes(verifiedIteration.ref), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.evidence_refs.includes("self-evolution/iterations/iteration_contract_stale_history.json"), false);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.verification_commands.some((command) => command.includes("project-design --artifact ga_design_artifact_iteration_contract_verified")), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.verification_commands.some((command) => command.includes("--audit-seed all")), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.verification_commands.includes("pnpm run runtime -- service health --target runtime"), true);
    assert.deepEqual(readModel.next_core_basic_plan?.verification_commands, readModel.next_core_basic_plan?.next_iteration_seed.verification_commands);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.non_goals.includes("does not repeat completed source slice verified_iteration_to_design_artifact"), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.non_goals.includes("does not repeat completed source slice stale_previous_slice"), false);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.record_command, "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>");
    assert.match(readModel.next_core_basic_plan?.next_iteration_seed.boundary ?? "", /read-only GA project design iteration seed/);
    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.status, "not_recorded");
    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.record_command, "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>");
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations.length, 1);
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations[0]?.id, staleOpenIteration.id);
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations[0]?.ref, staleOpenIteration.ref);
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations[0]?.suggested_outcome_status, "partial");
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations[0]?.superseded_by_ref, verifiedIteration.ref);
    assert.match(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations[0]?.reason ?? "", /governance cleanup/);
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations.some((item) => item.id === unrelatedOpenIteration.id), false);
    assert.match(compactGaPlanGovernanceCleanup(readModel.next_core_basic_plan!), /iteration_contract_stale_history:partial/);
    assert.equal(readModel.next_core_basic_plan?.phase_gates.length, 6);
    assert.equal(
      readModel.next_core_basic_plan?.phase_gates.find((gate) => gate.phase_id === "capability_layering")?.forbidden_shortcuts.includes("do not promote Nasdaq, Xiaohongshu MCP, browser automation, or one adapter into core identity by default"),
      true
    );
    assert.equal(
      readModel.next_core_basic_plan?.phase_gates.find((gate) => gate.phase_id === "learning_persistence")?.forbidden_shortcuts.includes("do not treat dream snapshots as execution plans"),
      true
    );
    assert.equal(
      readModel.next_core_basic_plan?.phase_gates.find((gate) => gate.phase_id === "learning_persistence")?.forbidden_shortcuts.includes("do not let a self-evolution SOP or selected skill override project-design judgment or completion gates"),
      true
    );
    assert.deepEqual(
      readModel.next_core_basic_plan?.completion_audit_seeds.map((seed) => seed.id),
      ["goal_scope", "current_state", "verification_scope", "learning_persistence"]
    );
    assert.equal(
      readModel.next_core_basic_plan?.completion_audit_seeds.some((seed) =>
        seed.id === "goal_scope"
        && seed.evidence_needed.includes("operator goal or accepted task states the intended end state")
        && seed.evidence_needed.includes("next_core_basic_plan.goal_scope names objective, owner_surface, source_of_truth, and success_evidence")
        && seed.evidence_needed.includes("goal_scope.success_evidence distinguishes the completed source slice from the successor slice")
        && seed.reject_if.includes("goal_scope is missing objective, owner_surface, source_of_truth, or success_evidence")
        && seed.reject_if.includes("goal_scope success evidence does not distinguish source slice from successor slice")
      ),
      true
    );
    assert.equal(
      readModel.next_core_basic_plan?.completion_audit_seeds.some((seed) =>
        seed.id === "current_state"
        && seed.requirement.includes("classify runtime attention")
        && seed.requirement.includes("name the handling policy")
        && seed.evidence_needed.includes("implementation_contract.proposed_slice=general_agent_delegation_hardening_after_verified")
        && seed.evidence_needed.includes("implementation_contract names selected_layer, implementation_scope, deferred_scope, and delivery_standard before implementation")
        && seed.evidence_needed.includes("outcome explains how the delivered change stayed inside implementation_scope and did not enter deferred_scope")
        && seed.reject_if.includes("implementation_contract.proposed_slice does not match the iteration proposed slice")
        && seed.reject_if.includes("implementation_contract is missing selected_layer, implementation_scope, deferred_scope, or delivery_standard")
        && seed.reject_if.includes("outcome claims changes outside implementation_contract without a later-layer iteration contract")
        && seed.evidence_needed.includes("service health status and reasons when resident runtime behavior changed")
        && seed.reject_if.includes("worktree changes are present but the outcome omits workspace status or changed paths")
        && seed.evidence_needed.includes("service health status and reasons when service health is a required verification command")
        && seed.reject_if.includes("runtime attention reasons are omitted from the outcome when service health is not healthy")
        && seed.reject_if.includes("service health is a required verification command but the outcome omits service health status or reasons")
        && seed.evidence_needed.includes("runtime attention classification is acceptable, repair_needed, or verification_blocker when service health is not healthy")
        && seed.reject_if.includes("runtime attention is named but not classified as acceptable, repair_needed, or verification_blocker")
        && seed.evidence_needed.includes("runtime attention handling says why acceptable is safe, what repair_needed follows up, or why verification_blocker stops the outcome")
        && seed.reject_if.includes("runtime attention is classified without a handling policy")
        && seed.evidence_needed.includes("repair_needed handling names a follow-up action or explains why no follow-up is required")
        && seed.reject_if.includes("repair_needed is classified without a follow-up action or no-follow-up rationale")
      ),
      true
    );
    const coreTargetReadModel = await getGaProjectDesignReadModel(store, {
      limit: 10,
      scorecardNextCoreBasicSliceId: "next_slice_core_ga_design"
    });
    assert.equal(coreTargetReadModel.next_core_basic_plan?.target_dimension_id, "core_ga_design");
    assert.equal(coreTargetReadModel.next_core_basic_plan?.target_slice_id, "next_slice_core_ga_design");
    assert.equal(coreTargetReadModel.next_core_basic_plan?.proposed_slice, "core_ga_design_next_slice_after_verified");
    const basicTargetReadModel = await getGaProjectDesignReadModel(store, {
      limit: 10,
      scorecardNextCoreBasicSliceId: "next_slice_basic_runtime_substrate"
    });
    assert.equal(basicTargetReadModel.next_core_basic_plan?.target_dimension_id, "basic_runtime_substrate");
    assert.equal(basicTargetReadModel.next_core_basic_plan?.target_slice_id, "next_slice_basic_runtime_substrate");
    assert.equal(basicTargetReadModel.next_core_basic_plan?.layer, "basic_entrypoint");
    assert.equal(basicTargetReadModel.next_core_basic_plan?.proposed_slice, "basic_runtime_substrate_hardening_after_verified");
    assert.equal(
      readModel.next_core_basic_plan?.completion_audit_seeds.some((seed) =>
        seed.reject_if.includes("a narrow command is used to prove a broader capability claim")
      ),
      true
    );
    assert.equal(
      readModel.next_core_basic_plan?.completion_audit_seeds.some((seed) =>
        seed.id === "verification_scope"
        && seed.evidence_needed.includes("outcome explains which completion claim each verification command supports")
        && seed.evidence_needed.includes("outcome maps each required verification entrypoint to a completion claim")
        && seed.reject_if.includes("verification commands are listed without claim coverage")
        && seed.reject_if.includes("a required verification entrypoint is omitted from outcome claim coverage")
      ),
      true
    );
    assert.equal(
      readModel.next_core_basic_plan?.completion_audit_seeds.some((seed) =>
        seed.id === "learning_persistence"
        && seed.evidence_needed.includes("learning_authority states that SOPs and skills preserve procedure while project-design and verified outcomes retain judgment and completion authority")
        && seed.reject_if.includes("a self-evolution SOP or selected skill overrides project-design layer judgment or the iteration completion gate")
      ),
      true
    );
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.includes("instead of copied from the source artifact")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.includes("external adapters remain application slices")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("goal_scope:")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("current_state:")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("verification_scope:")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.includes("required entrypoints are covered by completion claims")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("learning_persistence:")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.includes("SOP or skill artifacts preserve procedure only")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_trace.length, readModel.next_core_basic_plan?.acceptance_criteria.length);
    assert.equal(readModel.next_core_basic_plan?.acceptance_trace.every((trace) => readModel.next_core_basic_plan?.acceptance_criteria.includes(trace.criterion)), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_trace.some((trace) => trace.seed_id === "verification_scope" && trace.required_entrypoints.includes("check")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_trace.some((trace) => trace.seed_id === "current_state" && trace.outcome_claim_prefixes.includes("workspace:")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_trace.some((trace) => trace.seed_id === "current_state" && trace.criterion.includes("implementation contract bounds allowed scope")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_trace.some((trace) => trace.seed_id === "learning_persistence" && trace.phase_id === "learning_persistence"), true);
    assert.equal(readModel.next_core_basic_plan?.verification_commands.includes("pnpm run runtime -- governance scorecard --state-root <state-root>"), true);
    assert.equal(readModel.next_core_basic_plan?.verification_commands.includes("pnpm run runtime -- service health --target runtime"), true);
    assert.match(readModel.next_core_basic_plan?.next_command ?? "", /governance record-iteration/);
    assert.match(readModel.next_core_basic_plan?.next_command ?? "", /--from-project-design-plan/);
    assert.equal(readModel.next_core_basic_plan?.non_goals.includes("does not repeat completed source slice verified_iteration_to_design_artifact"), true);
    assert.equal(readModel.next_core_basic_plan?.non_goals.includes("does not repeat completed source slice stale_previous_slice"), false);
    assert.match(readModel.next_core_basic_plan?.boundary ?? "", /read-only GA project design planning packet/);
    assert.equal(readModel.next_core_basic_plan?.refs.includes("self-evolution/iterations/iteration_contract_stale_history.json"), false);
    assert.equal(readModel.next_core_basic_plan?.refs.includes("self-evolution/iterations/iteration_contract_unrelated_history.json"), false);
    assert.equal(readModel.next_core_basic_plan?.refs.includes("packages/core/src/schemas.ts"), true);
    assert.equal(readModel.next_core_basic_plan?.refs.includes("packages/runtime/src/runner.ts"), true);
    assert.match(readModel.boundary, /does not write state/);
    assert.match(readModel.boundary, /planning packet/);
    assert.equal(readModel.refs.includes("self-evolution/iterations/iteration_contract_verified.json"), true);
    assert.equal(derived.length, 1);
    assert.equal(derived[0]?.source_iteration_ref, verifiedIteration.ref);
    assert.equal(selectGaProjectDesignArtifact(derived, "ga_design_artifact_iteration_contract_verified")?.id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(selectGaProjectDesignArtifact(derived, "iteration_contract_verified")?.id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(selectGaProjectDesignArtifact(derived, "iteration_contract_verified.json")?.id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(selectGaProjectDesignArtifact(derived, verifiedIteration.ref)?.id, "ga_design_artifact_iteration_contract_verified");

    const packet = await getGaProjectDesignArtifactPacket(store, {
      artifactRef: "iteration_contract_verified"
    });

    assert.equal(packet.action, "project-design-artifact");
    assert.equal(packet.status, "advisory");
    assert.equal(packet.artifact.id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(packet.source_for_next_core_basic_plan, true);
    assert.deepEqual(packet.next_core_basic_plan, readModel.next_core_basic_plan);
    assert.equal(packet.next_core_basic_plan?.schema_version, 1);
    assert.equal(packet.next_core_basic_plan?.action, "project-design-plan");
    assert.equal(packet.next_core_basic_plan?.status, "advisory");
    assert.match(packet.next_core_basic_plan?.title ?? "", /Next core\/basic GA planning packet/);
    assert.equal(packet.next_core_basic_plan?.target_dimension_id, "general_agent_delegation");
    assert.equal(packet.next_core_basic_plan?.target_slice_id, "next_slice_general_agent_delegation");
    assert.equal(packet.next_core_basic_plan?.layer, "core_runtime");
    assert.equal(packet.next_core_basic_plan?.owner_surface, "ga_project_design");
    assert.equal(packet.next_core_basic_plan?.proposed_slice, "general_agent_delegation_hardening_after_verified");
    assert.equal(packet.next_core_basic_plan?.source_artifact_id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(packet.next_core_basic_plan?.source_iteration_ref, verifiedIteration.ref);
    assert.equal(packet.next_core_basic_plan?.source_proposed_slice, "verified_iteration_to_design_artifact");
    assert.match(packet.next_core_basic_plan?.planning_basis ?? "", /instead of repeating completed slice verified_iteration_to_design_artifact/);
    assert.equal(packet.next_core_basic_plan?.goal_scope.owner_surface, "ga_project_design");
    assert.equal(packet.next_core_basic_plan?.goal_scope.success_evidence.some((evidence) => evidence.includes("verified outcome records evidence refs")), true);
    assert.equal(packet.next_core_basic_plan?.implementation_contract.source_artifact_id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(packet.next_core_basic_plan?.implementation_contract.source_proposed_slice, "verified_iteration_to_design_artifact");
    assert.equal(packet.next_core_basic_plan?.implementation_contract.improvement_type, "reusable_ga_design_contract");
    assert.equal(packet.next_core_basic_plan?.implementation_contract.deferred_scope.some((item) => item.includes("no expert-agent scheduling")), true);
    assert.match(packet.next_core_basic_plan?.implementation_contract.boundary ?? "", /does not execute commands/);
    assert.equal(packet.next_core_basic_plan?.iteration_focus.direction_id, "core_basic_plan_clarity");
    assert.equal(packet.next_core_basic_plan?.capability_stage_plan.core_capabilities.some((capability) => capability.id === "contract_design" && capability.stage === "hardening"), true);
    assert.equal(packet.next_core_basic_plan?.capability_stage_plan.basic_capabilities.some((capability) => capability.id === "runtime_observability" && capability.stage === "attention_guard"), true);
    assert.equal(packet.next_core_basic_plan?.capability_stage_plan.basic_capabilities.some((capability) => capability.exit_criteria.includes("service health is inspected for the resident runtime target")), true);
    assert.equal(packet.next_core_basic_plan?.scorecard_basis.includes("target_dimension=general_agent_delegation"), true);
    assert.equal(packet.next_core_basic_plan?.selection_reasons.includes("target_layer=core_runtime"), true);
    assert.equal(packet.next_core_basic_plan?.selection_checks.includes("verification_entrypoints=project-design,scorecard,iterations,service-health,check"), true);
    assert.equal(packet.next_core_basic_plan?.selection_checks.includes("governance_cleanup_superseded_open_iterations=1"), true);
    assert.equal(packet.next_core_basic_plan?.governance_cleanup.superseded_open_iterations[0]?.inspect_command, "pnpm run runtime -- governance iterations --iteration iteration_contract_stale_history --state-root <state-root>");
    assert.equal(packet.next_core_basic_plan?.layer_decision.core_identity, "recurring_ga_project_design");
    assert.equal(packet.next_core_basic_plan?.layer_decision.reasons.some((reason) => reason.includes("not a single external adapter")), true);
    assert.equal(packet.next_core_basic_plan?.layer_decision.application_boundaries.some((boundary) => boundary.includes("external tools and adapters stay application slices")), true);
    assert.equal(packet.next_core_basic_plan?.layer_decision.application_boundaries.some((boundary) => boundary.includes("expert and multi-agent scheduling follow after the general delegation loop is stable")), true);
    assert.equal(packet.next_core_basic_plan?.capability_stage_plan.next_iteration_plan.some((step) => step.startsWith("core_runtime[general_agent_delegation]: audit and sync existing runner-enforced delegate_agent task/context/result/trace/replay/completion contract")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.max_actions_per_round, DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.task_contract.required.some((item) => item.includes("explicit bounded analysis")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.context_contract.required.some((item) => item.includes("main-harness completion boundary")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.context_contract.required.some((item) => item.includes("summary/findings_text")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.context_contract.reject_if.some((item) => item.includes("expert scheduling, multi-agent orchestration, model fan-out")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.result_contract.reject_if.some((item) => item.includes("not valid structured JSON")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.result_contract.required.some((item) => item.includes("not verification proof")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.result_contract.reject_if.some((item) => item.includes("delegated result id or ref")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.task_contract.reject_if.some((item) => item.includes("more than one delegate_agent action")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.task_contract.reject_if.some((item) => item.includes("command or test execution")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.task_contract.reject_if.some((item) => item.includes("execute tools, mutate state, or decide completion")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.task_contract.reject_if.some((item) => item.includes("expert scheduling or multi-agent orchestration")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.dispatch_failure_kind_contract.required.some((item) => item.includes("dispatch_limit_exceeded")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.dispatch_failure_kind_contract.required.some((item) => item.includes("harness replay checks")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.result_failure_kind_contract.required.some((item) => item.includes("delegated_output_contract_failed")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.recovery_contract.reject_if.some((item) => item.includes("expert scheduling")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.input_contract.some((item) => item.includes("validateDelegationTaskBoundary")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.input_contract.some((item) => item.includes("validateDelegationContextBoundary rejects context grants")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.input_contract.some((item) => item.includes("command/test execution")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.input_contract.some((item) => item.includes("expected summary/findings_text output shape")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.completion_gate.some((item) => item.includes("fails a done claim")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.runner_enforcement_contract.completion_gate.some((item) => item.includes("harness-known non-delegated verification refs")), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.required_metadata.includes("contract_status"), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.required_metadata.includes("result_failure_kind"), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.checks.includes("delegated_action_coverage"), true);
    assert.equal(packet.next_core_basic_plan?.general_delegation_loop.replay_audit_contract.proof_boundary.some((item) => item.includes("raw delegated task/context/output")), true);
    assert.equal(packet.next_core_basic_plan?.next_iteration_seed.proposed_slice, "general_agent_delegation_hardening_after_verified");
    assert.equal(packet.next_core_basic_plan?.next_iteration_seed.source_ref, verifiedIteration.ref);
    assert.equal(packet.next_core_basic_plan?.phase_gates.some((gate) => gate.phase_id === "capability_layering" && gate.forbidden_shortcuts.some((shortcut) => shortcut.includes("one adapter into core identity"))), true);
    assert.equal(packet.next_core_basic_plan?.phase_gates.some((gate) => gate.phase_id === "learning_persistence" && gate.forbidden_shortcuts.some((shortcut) => shortcut.includes("dream snapshots as execution plans"))), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "goal_scope" && seed.evidence_needed.includes("next_core_basic_plan.goal_scope names objective, owner_surface, source_of_truth, and success_evidence")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "goal_scope" && seed.reject_if.includes("goal_scope success evidence does not distinguish source slice from successor slice")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("worktree changes are present but the outcome omits workspace status or changed paths")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.evidence_needed.includes("implementation_contract names selected_layer, implementation_scope, deferred_scope, and delivery_standard before implementation")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("outcome claims changes outside implementation_contract without a later-layer iteration contract")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.evidence_needed.includes("service health status and reasons when service health is a required verification command")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("service health is a required verification command but the outcome omits service health status or reasons")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.evidence_needed.includes("runtime attention classification is acceptable, repair_needed, or verification_blocker when service health is not healthy")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("runtime attention is named but not classified as acceptable, repair_needed, or verification_blocker")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.evidence_needed.includes("runtime attention handling says why acceptable is safe, what repair_needed follows up, or why verification_blocker stops the outcome")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("runtime attention is classified without a handling policy")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.evidence_needed.includes("repair_needed handling names a follow-up action or explains why no follow-up is required")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("repair_needed is classified without a follow-up action or no-follow-up rationale")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "verification_scope" && seed.evidence_needed.includes("outcome explains which completion claim each verification command supports")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "verification_scope" && seed.evidence_needed.includes("outcome maps each required verification entrypoint to a completion claim")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "verification_scope" && seed.evidence_needed.some((evidence) => evidence.includes("broad check runs"))), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "verification_scope" && seed.reject_if.includes("a required verification entrypoint is omitted from outcome claim coverage")), true);
    assert.equal(packet.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("goal_scope:")), true);
    assert.equal(packet.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("learning_persistence:")), true);
    assert.equal(packet.next_core_basic_plan?.acceptance_trace.length, packet.next_core_basic_plan?.acceptance_criteria.length);
    assert.equal(packet.next_core_basic_plan?.acceptance_trace.some((trace) => trace.seed_id === "verification_scope" && trace.outcome_claim_prefixes.includes("check:")), true);
    assert.equal(packet.next_core_basic_plan?.acceptance_trace.some((trace) => trace.seed_id === "current_state" && trace.required_entrypoints.includes("service-health")), true);
    assert.equal(packet.next_core_basic_plan?.acceptance_trace.some((trace) => trace.seed_id === "current_state" && trace.required_entrypoints.includes("workspace") && trace.criterion.includes("deferred scope")), true);
    assert.equal(packet.next_core_basic_plan?.verification_commands.includes("pnpm run runtime -- service health --target runtime"), true);
    assert.equal(packet.next_core_basic_plan?.verification_commands.includes("pnpm run check"), true);
    assert.equal(packet.next_core_basic_plan?.non_goals.includes("does not repeat completed source slice verified_iteration_to_design_artifact"), true);
    assert.equal(packet.next_core_basic_plan?.non_goals.includes("does not repeat completed source slice stale_previous_slice"), false);
    assert.equal(packet.next_core_basic_plan?.refs.includes(verifiedIteration.ref), true);
    assert.match(packet.next_core_basic_plan?.boundary ?? "", /read-only GA project design planning packet/);
    assert.match(packet.next_core_basic_plan?.next_command ?? "", /record-iteration/);
    assert.equal(packet.refs.includes(verifiedIteration.ref), true);
    assert.match(packet.boundary, /read-only GA project design artifact inspection packet/);
    assert.match(packet.boundary, /does not derive new artifacts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GA project design artifact_count reports total artifacts despite response limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-ga-design-counts-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const firstIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_count_first",
      ref: "self-evolution/iterations/iteration_contract_count_first.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "First verified artifact.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "count_first_slice",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["no external-tool execution"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "First verified artifact outcome.",
        evidence_refs: ["tests/ga_project_design.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Use this as count evidence."],
        recorded_at: "2026-07-06T00:00:01Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:01Z",
      boundary: "bounded iteration contract"
    };
    const secondIteration: SelfEvolutionIterationContract = {
      ...firstIteration,
      id: "iteration_contract_count_second",
      ref: "self-evolution/iterations/iteration_contract_count_second.json",
      summary: "Second verified artifact.",
      proposed_slice: "count_second_slice",
      outcome: {
        ...firstIteration.outcome!,
        summary: "Second verified artifact outcome.",
        recorded_at: "2026-07-06T00:00:02Z"
      },
      created_at: "2026-07-06T00:00:02Z"
    };
    await store.writeJson(firstIteration.ref, firstIteration);
    await store.writeJson(secondIteration.ref, secondIteration);

    const readModel = await getGaProjectDesignReadModel(store, { limit: 1 });

    assert.equal(readModel.artifact_count, 2);
    assert.equal(readModel.listed_artifact_count, 1);
    assert.equal(readModel.artifacts.length, 1);
    assert.equal(readModel.artifacts[0]?.id, "ga_design_artifact_iteration_contract_count_second");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GA project design planning packet ignores non-core verified artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-ga-design-local-learning-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    await store.writeJson("self-evolution/iterations/iteration_contract_local_learning.json", {
      schema_version: 1,
      id: "iteration_contract_local_learning",
      ref: "self-evolution/iterations/iteration_contract_local_learning.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified SOP follow-up should stay local learning.",
      layer: "local_learning",
      owner_surface: "sop_skill_memory_loop",
      proposed_slice: "verified_iteration_outcome_sop_candidate",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm exec tsx --test tests/ga_project_design.test.ts"],
      non_goals: ["do not treat SOP follow-up as core identity"],
      advisory_expert_roles: ["learning_curator", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Local-learning verification passed.",
        evidence_refs: ["tests/ga_project_design.test.ts"],
        verification_commands: ["pnpm exec tsx --test tests/ga_project_design.test.ts"],
        next_moves: ["Keep this as local-learning follow-up."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    });

    const readModel = await getGaProjectDesignReadModel(store, { limit: 10 });

    assert.equal(readModel.artifact_count, 1);
    assert.equal(readModel.artifacts[0]?.layer, "local_learning");
    assert.equal(readModel.next_core_basic_plan, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GA project design plan carries source continuation from basic iterations", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-ga-design-basic-source-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const basicIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_basic_source",
      ref: "self-evolution/iterations/iteration_contract_basic_source.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified basic runtime tools boundary.",
      layer: "basic_entrypoint",
      owner_surface: "runtime_tools",
      proposed_slice: "runtime_state_boundary_for_basic_tools",
      implementation_contract: {
        proposed_slice: "runtime_state_boundary_for_basic_tools",
        source_artifact_id: "manual_record_iteration",
        source_proposed_slice: "manual_record_iteration",
        selected_layer: "basic_entrypoint",
        owner_surface: "runtime_tools",
        improvement_type: "reusable_ga_design_contract",
        implementation_scope: ["change one reusable basic tool boundary"],
        deferred_scope: ["no external adapters"],
        delivery_standard: ["repo-scoped tools cannot use runtime state paths"],
        boundary: "manual implementation contract"
      },
      evidence_refs: ["packages/runtime/src/tools.ts"],
      verification_commands: ["pnpm exec tsx --test tests/runtime_tools.test.ts"],
      non_goals: ["does not delete runtime state"],
      advisory_expert_roles: ["runtime_operator", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Runtime tools boundary passed.",
        evidence_refs: ["tests/runtime_tools.test.ts"],
        verification_commands: ["pnpm exec tsx --test tests/runtime_tools.test.ts"],
        next_moves: [
          "Commit and restart runtime after this slice.",
          "Tighten basic runtime substrate before expanding SOP/skill/memory/dream layers.",
          "Keep manual iteration audit coverage explicit.",
          "Design restart runtime observability as a basic runtime contract."
        ],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    };
    await store.writeJson(basicIteration.ref, basicIteration);

    const readModel = await getGaProjectDesignReadModel(store, { limit: 10 });
    const plan = readModel.next_core_basic_plan;

    assert.equal(readModel.artifacts[0]?.source_implementation_contract?.proposed_slice, "runtime_state_boundary_for_basic_tools");
    assert.deepEqual(readModel.artifacts[0]?.source_next_moves, [
      "Tighten basic runtime substrate before expanding SOP/skill/memory/dream layers.",
      "Keep manual iteration audit coverage explicit.",
      "Design restart runtime observability as a basic runtime contract."
    ]);
    assert.doesNotMatch(readModel.artifacts[0]?.next_use ?? "", /Commit and restart runtime/);
    assert.equal(plan?.source_continuation.source_layer, "basic_entrypoint");
    assert.equal(plan?.source_continuation.source_owner_surface, "runtime_tools");
    assert.equal(plan?.source_continuation.source_proposed_slice, "runtime_state_boundary_for_basic_tools");
    assert.equal(plan?.source_continuation.source_contract?.selected_layer, "basic_entrypoint");
    assert.equal(plan?.source_continuation.source_contract?.owner_surface, "runtime_tools");
    assert.equal(plan?.source_continuation.source_next_moves.length, 3);
    assert.match(plan?.source_continuation.source_next_moves[0] ?? "", /basic runtime substrate/);
    assert.match(plan?.source_continuation.source_next_moves[2] ?? "", /restart runtime observability/);
    assert.equal(plan?.source_continuation.carry_forward.includes("source=basic_entrypoint/runtime_tools"), true);
    assert.equal(plan?.source_continuation.carry_forward.includes("source_contract=runtime_state_boundary_for_basic_tools"), true);
    assert.equal(plan?.source_continuation.carry_forward.includes("source_next_move_candidates=3"), true);
    assert.match(plan?.source_continuation.next_use ?? "", /basic runtime substrate/);
    assert.doesNotMatch(plan?.planning_basis ?? "", /Commit and restart runtime/);
    assert.match(plan?.source_continuation.boundary ?? "", /read-only source-continuation/);
    assert.equal(plan?.layer_decision.source_layer, "basic_entrypoint");
    assert.equal(plan?.layer_decision.selected_layer, "core_runtime");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GA project design source next moves fall back when source outcome only has completion actions", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-ga-design-completion-source-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const iteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_completion_only_source",
      ref: "self-evolution/iterations/iteration_contract_completion_only_source.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified GA design slice with only completion housekeeping next moves.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "completion_only_source_next_moves",
      implementation_contract: {
        proposed_slice: "completion_only_source_next_moves",
        source_artifact_id: "manual_record_iteration",
        source_proposed_slice: "manual_record_iteration",
        selected_layer: "core_runtime",
        owner_surface: "ga_project_design",
        improvement_type: "reusable_ga_design_contract",
        implementation_scope: ["change one reusable GA project-design read-model rule"],
        deferred_scope: ["no external adapters"],
        delivery_standard: ["successor planning cannot repeat completed source housekeeping"],
        boundary: "manual implementation contract"
      },
      evidence_refs: ["packages/core/src/ga_project_design.ts", "tests/ga_project_design.test.ts"],
      verification_commands: ["node --import tsx --test tests/ga_project_design.test.ts"],
      non_goals: ["does not rewrite original outcome next_moves"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "GA design source next move fallback passed.",
        evidence_refs: ["tests/ga_project_design.test.ts"],
        verification_commands: ["node --import tsx --test tests/ga_project_design.test.ts"],
        next_moves: [
          "Commit this slice implementation.",
          "Restart resident runtime onto commit abc123.",
          "Rerun service health after restart.",
          "Merge post-commit health refs into outcome refs."
        ],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    };
    await store.writeJson(iteration.ref, iteration);

    const readModel = await getGaProjectDesignReadModel(store, { limit: 10 });
    const plan = readModel.next_core_basic_plan;
    const fallback = "Use this verified artifact as evidence for a fresh bounded core/basic successor slice without repeating the completed source slice.";

    assert.deepEqual(readModel.artifacts[0]?.source_next_moves, [fallback]);
    assert.equal(readModel.artifacts[0]?.next_use, fallback);
    assert.deepEqual(plan?.source_continuation.source_next_moves, [fallback]);
    assert.equal(plan?.source_continuation.next_use, fallback);
    assert.equal(plan?.source_continuation.carry_forward.includes("source_next_move_candidates=1"), true);
    assert.match(plan?.planning_basis ?? "", /fresh bounded core\/basic successor slice/);
    assert.doesNotMatch(plan?.planning_basis ?? "", /Commit this slice implementation/);
    assert.doesNotMatch(plan?.planning_basis ?? "", /Restart resident runtime/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GA project design planning packet surfaces matching open iteration", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-ga-design-open-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const verifiedIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_verified",
      ref: "self-evolution/iterations/iteration_contract_verified.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified source for a next GA design slice.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "verified_iteration_to_design_artifact",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm exec tsx --test tests/ga_project_design.test.ts"],
      non_goals: ["no active-vault write"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "Verified source outcome.",
        evidence_refs: ["tests/ga_project_design.test.ts"],
        verification_commands: ["pnpm exec tsx --test tests/ga_project_design.test.ts"],
        next_moves: ["Use this artifact when planning the next GA design slice; treat iteration_contract_stale_open_successor and iteration_contract_stale_open_basic_successor as separate governance cleanup."],
        recorded_at: "2026-07-06T00:00:03Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-07-06T00:00:03Z",
      boundary: "bounded iteration contract"
    };
    const openIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_open_successor",
      ref: "self-evolution/iterations/iteration_contract_open_successor.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Open successor should be visible in the plan.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "general_agent_delegation_hardening_after_verified",
      source_ref: verifiedIteration.ref,
      evidence_refs: [verifiedIteration.ref, "packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["does not prove completion"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration contract"
    };
    const staleOpenIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_stale_open_successor",
      ref: "self-evolution/iterations/iteration_contract_stale_open_successor.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older open delegation iteration should be governance cleanup only.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "general_agent_delegation_hardening_after_stale_open",
      source_ref: "self-evolution/iterations/iteration_contract_previous.json",
      evidence_refs: ["self-evolution/iterations/iteration_contract_previous.json"],
      verification_commands: ["pnpm run check"],
      non_goals: ["does not prove completion"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:02Z",
      boundary: "bounded iteration contract"
    };
    const staleOpenBasicIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_stale_open_basic_successor",
      ref: "self-evolution/iterations/iteration_contract_stale_open_basic_successor.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older open basic runtime iteration should be governance cleanup only.",
      layer: "basic_entrypoint",
      owner_surface: "ga_project_design",
      proposed_slice: "basic_runtime_substrate_hardening_after_stale_open",
      source_ref: "self-evolution/iterations/iteration_contract_previous_basic.json",
      evidence_refs: ["self-evolution/iterations/iteration_contract_previous_basic.json"],
      verification_commands: ["pnpm run check"],
      non_goals: ["does not prove completion"],
      advisory_expert_roles: ["runtime_operator", "verification_reviewer"],
      created_at: "2026-07-06T00:00:02.500Z",
      boundary: "bounded iteration contract"
    };
    const unrelatedOpenIteration: SelfEvolutionIterationContract = {
      schema_version: 1,
      id: "iteration_contract_unrelated_open_successor",
      ref: "self-evolution/iterations/iteration_contract_unrelated_open_successor.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older unrelated GA iteration should not be cleanup.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "core_ga_design_next_slice_after_unrelated_open",
      source_ref: "self-evolution/iterations/iteration_contract_unrelated.json",
      evidence_refs: ["self-evolution/iterations/iteration_contract_unrelated.json"],
      verification_commands: ["pnpm run check"],
      non_goals: ["does not prove completion"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:01Z",
      boundary: "bounded iteration contract"
    };
    await store.writeJson(staleOpenIteration.ref, staleOpenIteration);
    await store.writeJson(staleOpenBasicIteration.ref, staleOpenBasicIteration);
    await store.writeJson(unrelatedOpenIteration.ref, unrelatedOpenIteration);
    await store.writeJson(verifiedIteration.ref, verifiedIteration);
    await store.writeJson(openIteration.ref, openIteration);

    const readModel = await getGaProjectDesignReadModel(store, { limit: 10 });

    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.status, "open_iteration_available");
    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.id, openIteration.id);
    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.ref, openIteration.ref);
    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.outcome_status, "not_recorded");
    assert.equal(readModel.next_core_basic_plan?.next_command, "pnpm run runtime -- governance iterations --iteration iteration_contract_open_successor --state-root <state-root>");
    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.audit_command, "pnpm run runtime -- governance iterations --iteration iteration_contract_open_successor --audit-seed all --state-root <state-root>");
    assert.equal(readModel.next_core_basic_plan?.selection_reasons.includes("iteration_record_status=open_iteration_available"), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.some((check) => check.includes(openIteration.ref)), true);
    assert.equal(readModel.next_core_basic_plan?.selection_checks.includes("governance_cleanup_superseded_open_iterations=2"), true);
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations.some((item) => item.id === staleOpenIteration.id), true);
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations.some((item) => item.id === staleOpenBasicIteration.id), true);
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations[0]?.suggested_outcome_status, "partial");
    assert.equal(readModel.next_core_basic_plan?.governance_cleanup.superseded_open_iterations.some((item) => item.id === unrelatedOpenIteration.id), false);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.evidence_refs.includes(staleOpenIteration.ref), false);
    assert.equal(readModel.refs.includes(openIteration.ref), true);
    assert.equal(readModel.refs.includes(staleOpenIteration.ref), false);
    assert.equal(readModel.refs.includes(staleOpenBasicIteration.ref), false);
    assert.equal(readModel.refs.includes(unrelatedOpenIteration.ref), false);

    const scorecardGuardReadModel = await getGaProjectDesignReadModel(store, {
      limit: 10,
      scorecardNextCoreBasicSliceId: "next_slice_core_ga_design"
    });
    assert.equal(scorecardGuardReadModel.next_core_basic_plan?.target_slice_id, "next_slice_general_agent_delegation");
    assert.deepEqual(
      scorecardGuardReadModel.next_core_basic_plan?.scorecard_basis.slice(0, 3),
      [
        "next_core_basic_slice=next_slice_core_ga_design",
        "plan_target_slice=next_slice_general_agent_delegation",
        "target_dimension=general_agent_delegation"
      ]
    );

    const packet = await getGaProjectDesignArtifactPacket(store, {
      artifactRef: "iteration_contract_verified"
    });
    assert.equal(packet.next_core_basic_plan?.iteration_record_status.status, "open_iteration_available");
    assert.equal(packet.next_core_basic_plan?.governance_cleanup.superseded_open_iterations.some((item) => item.id === staleOpenIteration.id), true);
    assert.equal(packet.next_core_basic_plan?.governance_cleanup.superseded_open_iterations.some((item) => item.id === staleOpenBasicIteration.id), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
