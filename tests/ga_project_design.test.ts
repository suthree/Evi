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
  assert.equal(contract.verification_policy.some((policy) => policy.includes("current worktree and runtime state")), true);
  assert.equal(contract.non_goals.includes("no external-tool execution"), true);
  assert.equal(contract.refs.includes("packages/core/src/ga_project_design.ts"), true);
  assert.match(contract.boundary, /read-only GA project design contract/);
  assert.match(contract.boundary, /does not invoke models/);
  assert.match(contract.boundary, /prove completion/);
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
        next_moves: ["Reuse the artifact when planning the next GA design slice."],
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
    await store.writeJson(verifiedIteration.ref, verifiedIteration);
    await store.writeJson(partialIteration.ref, partialIteration);
    await store.writeJson(weakVerifiedIteration.ref, weakVerifiedIteration);

    const readModel = await getGaProjectDesignReadModel(store, { limit: 10 });
    const derived = deriveGaProjectDesignArtifacts([weakVerifiedIteration, partialIteration, verifiedIteration]);

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
    assert.equal(readModel.artifacts[0]?.next_use, "Reuse the artifact when planning the next GA design slice.");
    assert.equal(readModel.artifacts[0]?.non_goals.includes("does not repeat completed source slice stale_previous_slice"), false);
    assert.match(readModel.artifacts[0]?.boundary ?? "", /read-only derived GA project design artifact/);
    assert.equal(readModel.next_core_basic_plan?.action, "project-design-plan");
    assert.equal(readModel.next_core_basic_plan?.status, "advisory");
    assert.equal(readModel.next_core_basic_plan?.target_dimension_id, "core_ga_design");
    assert.equal(readModel.next_core_basic_plan?.target_slice_id, "next_slice_core_ga_design");
    assert.equal(readModel.next_core_basic_plan?.source_artifact_id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(readModel.next_core_basic_plan?.layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.owner_surface, "ga_project_design");
    assert.equal(readModel.next_core_basic_plan?.proposed_slice, "core_ga_design_next_slice_after_verified");
    assert.equal(readModel.next_core_basic_plan?.source_proposed_slice, "verified_iteration_to_design_artifact");
    assert.notEqual(readModel.next_core_basic_plan?.proposed_slice, readModel.next_core_basic_plan?.source_proposed_slice);
    assert.match(readModel.next_core_basic_plan?.planning_basis ?? "", /instead of repeating completed slice verified_iteration_to_design_artifact/);
    assert.match(readModel.next_core_basic_plan?.goal_scope.objective ?? "", /core\/basic GA project-design capability gains/);
    assert.equal(readModel.next_core_basic_plan?.goal_scope.owner_surface, "ga_project_design");
    assert.equal(readModel.next_core_basic_plan?.goal_scope.source_of_truth.includes("operator_objective=core_basic_self_evolution_first"), true);
    assert.equal(readModel.next_core_basic_plan?.goal_scope.source_of_truth.includes("source_artifact=ga_design_artifact_iteration_contract_verified"), true);
    assert.equal(readModel.next_core_basic_plan?.goal_scope.success_evidence.some((evidence) => evidence.includes("target_slice=core_ga_design_next_slice_after_verified")), true);
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
      readModel.next_core_basic_plan?.capability_stage_plan.basic_capabilities.find((capability) => capability.id === "runtime_observability")?.exit_criteria.includes("service health is inspected for the resident IM target"),
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
        "next_core_basic_slice=next_slice_core_ga_design",
        "target_dimension=core_ga_design",
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
    assert.equal(readModel.next_core_basic_plan?.selection_checks.includes("verification_entrypoints=project-design,scorecard,iterations,service-health,check"), true);
    assert.equal(readModel.next_core_basic_plan?.layer_decision.core_identity, "recurring_ga_project_design");
    assert.equal(readModel.next_core_basic_plan?.layer_decision.selected_layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.layer_decision.source_layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.layer_decision.stage, "core_basic_successor_ready");
    assert.equal(readModel.next_core_basic_plan?.layer_decision.reasons.some((reason) => reason.includes("not a single external adapter")), true);
    assert.equal(readModel.next_core_basic_plan?.layer_decision.application_boundaries.some((boundary) => boundary.includes("external tools and adapters stay application slices")), true);
    assert.equal(readModel.next_core_basic_plan?.layer_decision.required_before_outcome.some((command) => command.includes("--audit-seed all")), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.layer, "core_runtime");
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.owner_surface, "ga_project_design");
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.proposed_slice, "core_ga_design_next_slice_after_verified");
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.source_ref, verifiedIteration.ref);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.evidence_refs.includes(verifiedIteration.ref), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.evidence_refs.includes("self-evolution/iterations/iteration_contract_stale_history.json"), false);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.verification_commands.some((command) => command.includes("project-design --artifact ga_design_artifact_iteration_contract_verified")), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.verification_commands.some((command) => command.includes("--audit-seed all")), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.verification_commands.includes("pnpm run runtime -- service health --target im --state-root <state-root>"), true);
    assert.deepEqual(readModel.next_core_basic_plan?.verification_commands, readModel.next_core_basic_plan?.next_iteration_seed.verification_commands);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.non_goals.includes("does not repeat completed source slice verified_iteration_to_design_artifact"), true);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.non_goals.includes("does not repeat completed source slice stale_previous_slice"), false);
    assert.equal(readModel.next_core_basic_plan?.next_iteration_seed.record_command, "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>");
    assert.match(readModel.next_core_basic_plan?.next_iteration_seed.boundary ?? "", /read-only GA project design iteration seed/);
    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.status, "not_recorded");
    assert.equal(readModel.next_core_basic_plan?.iteration_record_status.record_command, "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>");
    assert.equal(readModel.next_core_basic_plan?.phase_gates.length, 6);
    assert.equal(
      readModel.next_core_basic_plan?.phase_gates.find((gate) => gate.phase_id === "capability_layering")?.forbidden_shortcuts.includes("do not promote Nasdaq, Xiaohongshu MCP, browser automation, or one adapter into core identity by default"),
      true
    );
    assert.equal(
      readModel.next_core_basic_plan?.phase_gates.find((gate) => gate.phase_id === "learning_persistence")?.forbidden_shortcuts.includes("do not treat dream snapshots as execution plans"),
      true
    );
    assert.deepEqual(
      readModel.next_core_basic_plan?.completion_audit_seeds.map((seed) => seed.id),
      ["goal_scope", "current_state", "verification_scope", "learning_persistence"]
    );
    assert.equal(
      readModel.next_core_basic_plan?.completion_audit_seeds.some((seed) =>
        seed.evidence_needed.includes("operator goal or accepted task states the intended end state")
      ),
      true
    );
    assert.equal(
      readModel.next_core_basic_plan?.completion_audit_seeds.some((seed) =>
        seed.id === "current_state"
        && seed.requirement.includes("classify runtime attention")
        && seed.requirement.includes("name the handling policy")
        && seed.evidence_needed.includes("service health status and reasons when resident runtime behavior changed")
        && seed.reject_if.includes("runtime attention reasons are omitted from the outcome when service health is not healthy")
        && seed.evidence_needed.includes("runtime attention classification is acceptable, repair_needed, or verification_blocker when service health is not healthy")
        && seed.reject_if.includes("runtime attention is named but not classified as acceptable, repair_needed, or verification_blocker")
        && seed.evidence_needed.includes("runtime attention handling says why acceptable is safe, what repair_needed follows up, or why verification_blocker stops the outcome")
        && seed.reject_if.includes("runtime attention is classified without a handling policy")
        && seed.evidence_needed.includes("repair_needed handling names a follow-up action or explains why no follow-up is required")
        && seed.reject_if.includes("repair_needed is classified without a follow-up action or no-follow-up rationale")
      ),
      true
    );
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
        && seed.reject_if.includes("verification commands are listed without claim coverage")
      ),
      true
    );
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.includes("instead of copied from the source artifact")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.includes("external adapters remain application slices")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("goal_scope:")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("current_state:")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("verification_scope:")), true);
    assert.equal(readModel.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("learning_persistence:")), true);
    assert.equal(readModel.next_core_basic_plan?.verification_commands.includes("pnpm run runtime -- governance scorecard --state-root <state-root>"), true);
    assert.equal(readModel.next_core_basic_plan?.verification_commands.includes("pnpm run runtime -- service health --target im --state-root <state-root>"), true);
    assert.match(readModel.next_core_basic_plan?.next_command ?? "", /governance record-iteration/);
    assert.match(readModel.next_core_basic_plan?.next_command ?? "", /--from-project-design-plan/);
    assert.equal(readModel.next_core_basic_plan?.non_goals.includes("does not repeat completed source slice verified_iteration_to_design_artifact"), true);
    assert.equal(readModel.next_core_basic_plan?.non_goals.includes("does not repeat completed source slice stale_previous_slice"), false);
    assert.match(readModel.next_core_basic_plan?.boundary ?? "", /read-only GA project design planning packet/);
    assert.equal(readModel.next_core_basic_plan?.refs.includes("self-evolution/iterations/iteration_contract_stale_history.json"), false);
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
    assert.equal(packet.next_core_basic_plan?.target_dimension_id, "core_ga_design");
    assert.equal(packet.next_core_basic_plan?.target_slice_id, "next_slice_core_ga_design");
    assert.equal(packet.next_core_basic_plan?.layer, "core_runtime");
    assert.equal(packet.next_core_basic_plan?.owner_surface, "ga_project_design");
    assert.equal(packet.next_core_basic_plan?.proposed_slice, "core_ga_design_next_slice_after_verified");
    assert.equal(packet.next_core_basic_plan?.source_artifact_id, "ga_design_artifact_iteration_contract_verified");
    assert.equal(packet.next_core_basic_plan?.source_iteration_ref, verifiedIteration.ref);
    assert.equal(packet.next_core_basic_plan?.source_proposed_slice, "verified_iteration_to_design_artifact");
    assert.match(packet.next_core_basic_plan?.planning_basis ?? "", /instead of repeating completed slice verified_iteration_to_design_artifact/);
    assert.equal(packet.next_core_basic_plan?.goal_scope.owner_surface, "ga_project_design");
    assert.equal(packet.next_core_basic_plan?.goal_scope.success_evidence.some((evidence) => evidence.includes("verified outcome records evidence refs")), true);
    assert.equal(packet.next_core_basic_plan?.iteration_focus.direction_id, "core_basic_plan_clarity");
    assert.equal(packet.next_core_basic_plan?.capability_stage_plan.core_capabilities.some((capability) => capability.id === "contract_design" && capability.stage === "hardening"), true);
    assert.equal(packet.next_core_basic_plan?.capability_stage_plan.basic_capabilities.some((capability) => capability.id === "runtime_observability" && capability.stage === "attention_guard"), true);
    assert.equal(packet.next_core_basic_plan?.capability_stage_plan.basic_capabilities.some((capability) => capability.exit_criteria.includes("service health is inspected for the resident IM target")), true);
    assert.equal(packet.next_core_basic_plan?.scorecard_basis.includes("target_dimension=core_ga_design"), true);
    assert.equal(packet.next_core_basic_plan?.selection_reasons.includes("target_layer=core_runtime"), true);
    assert.equal(packet.next_core_basic_plan?.selection_checks.includes("verification_entrypoints=project-design,scorecard,iterations,service-health,check"), true);
    assert.equal(packet.next_core_basic_plan?.layer_decision.core_identity, "recurring_ga_project_design");
    assert.equal(packet.next_core_basic_plan?.layer_decision.reasons.some((reason) => reason.includes("not a single external adapter")), true);
    assert.equal(packet.next_core_basic_plan?.layer_decision.application_boundaries.some((boundary) => boundary.includes("external tools and adapters stay application slices")), true);
    assert.equal(packet.next_core_basic_plan?.next_iteration_seed.proposed_slice, "core_ga_design_next_slice_after_verified");
    assert.equal(packet.next_core_basic_plan?.next_iteration_seed.source_ref, verifiedIteration.ref);
    assert.equal(packet.next_core_basic_plan?.phase_gates.some((gate) => gate.phase_id === "capability_layering" && gate.forbidden_shortcuts.some((shortcut) => shortcut.includes("one adapter into core identity"))), true);
    assert.equal(packet.next_core_basic_plan?.phase_gates.some((gate) => gate.phase_id === "learning_persistence" && gate.forbidden_shortcuts.some((shortcut) => shortcut.includes("dream snapshots as execution plans"))), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.evidence_needed.includes("runtime attention classification is acceptable, repair_needed, or verification_blocker when service health is not healthy")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("runtime attention is named but not classified as acceptable, repair_needed, or verification_blocker")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.evidence_needed.includes("runtime attention handling says why acceptable is safe, what repair_needed follows up, or why verification_blocker stops the outcome")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("runtime attention is classified without a handling policy")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.evidence_needed.includes("repair_needed handling names a follow-up action or explains why no follow-up is required")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "current_state" && seed.reject_if.includes("repair_needed is classified without a follow-up action or no-follow-up rationale")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "verification_scope" && seed.evidence_needed.includes("outcome explains which completion claim each verification command supports")), true);
    assert.equal(packet.next_core_basic_plan?.completion_audit_seeds.some((seed) => seed.id === "verification_scope" && seed.evidence_needed.some((evidence) => evidence.includes("broad check runs"))), true);
    assert.equal(packet.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("goal_scope:")), true);
    assert.equal(packet.next_core_basic_plan?.acceptance_criteria.some((criterion) => criterion.startsWith("learning_persistence:")), true);
    assert.equal(packet.next_core_basic_plan?.verification_commands.includes("pnpm run runtime -- service health --target im --state-root <state-root>"), true);
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
        next_moves: ["Use this artifact when planning the next GA design slice."],
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
      proposed_slice: "core_ga_design_next_slice_after_verified",
      source_ref: verifiedIteration.ref,
      evidence_refs: [verifiedIteration.ref, "packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["does not prove completion"],
      advisory_expert_roles: ["architect", "verification_reviewer"],
      created_at: "2026-07-06T00:00:04Z",
      boundary: "bounded iteration contract"
    };
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
    assert.equal(readModel.refs.includes(openIteration.ref), true);

    const packet = await getGaProjectDesignArtifactPacket(store, {
      artifactRef: "iteration_contract_verified"
    });
    assert.equal(packet.next_core_basic_plan?.iteration_record_status.status, "open_iteration_available");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
