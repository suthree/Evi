import assert from "node:assert/strict";
import test from "node:test";
import {
  getExpertDelegationPlan,
  getExpertOrchestrationContract
} from "../packages/core/src/expert_orchestration.js";

test("expert orchestration contract defines advisory roles without execution authority", () => {
  const contract = getExpertOrchestrationContract();

  assert.equal(contract.action, "experts");
  assert.equal(contract.status, "implemented");
  assert.equal(contract.layer, "core_runtime");
  assert.equal(contract.roles.length, 5);
  assert.deepEqual(
    contract.roles.map((role) => role.id),
    ["architect", "runtime_operator", "learning_curator", "verification_reviewer", "orchestration_planner"]
  );
  assert.equal(contract.roles.every((role) => role.status === "implemented"), true);
  assert.equal(contract.roles.every((role) => role.allowed_inputs.length > 0), true);
  assert.equal(contract.roles.every((role) => role.responsibilities.length > 0), true);
  assert.equal(contract.roles.every((role) => role.forbidden_authority.length > 0), true);
  assert.equal(contract.delegation_gates.length, 4);
  assert.equal(contract.delegation_gates.every((gate) => gate.roles.length > 0), true);
  assert.equal(contract.delegation_gates.every((gate) => gate.required_inputs.length > 0), true);
  assert.equal(contract.delegation_gates.every((gate) => gate.expected_output.length > 0), true);
  assert.equal(contract.delegation_gates.every((gate) => gate.reject_if.length > 0), true);
  assert.equal(contract.delegation_gates.some((gate) => gate.id === "core_boundary_review" && gate.roles.includes("architect")), true);
  assert.equal(contract.delegation_gates.some((gate) => gate.id === "runtime_health_review" && gate.roles.includes("runtime_operator")), true);
  assert.equal(contract.delegation_gates.some((gate) => gate.id === "learning_persistence_review" && gate.roles.includes("learning_curator")), true);
  assert.equal(contract.delegation_gates.some((gate) => gate.id === "delegation_budget_review" && gate.roles.includes("orchestration_planner")), true);
  assert.equal(contract.delegation_gates.every((gate) => gate.completion_authority.includes("main runtime")), true);
  assert.equal(contract.scheduling_policy.some((policy) => policy.includes("advisory lenses")), true);
  assert.equal(contract.scheduling_policy.some((policy) => policy.includes("delegation gates")), true);
  assert.equal(contract.scheduling_policy.some((policy) => policy.includes("parallel fan-out")), true);
  assert.equal(contract.verification_policy.some((policy) => policy.includes("cannot close a task")), true);
  assert.equal(contract.refs.includes("CONTEXT.md"), true);
  assert.equal(contract.refs.includes("packages/core/src/expert_orchestration.ts"), true);
  assert.equal(contract.commands.includes("pnpm run runtime -- governance experts"), true);
  assert.equal(contract.commands.includes("pnpm run runtime -- governance experts --gate <gate-id>"), true);
  assert.match(contract.boundary, /read-only expert orchestration contract/);
  assert.match(contract.boundary, /does not invoke models/);
  assert.match(contract.boundary, /prove completion/);
});

test("expert delegation plan renders one gate without execution authority", () => {
  const plan = getExpertDelegationPlan("core_boundary_review");

  assert.equal(plan.action, "expert-delegation-plan");
  assert.equal(plan.status, "advisory");
  assert.equal(plan.gate_id, "core_boundary_review");
  assert.deepEqual(plan.role_ids, ["architect", "verification_reviewer"]);
  assert.equal(plan.roles.map((role) => role.id).includes("architect"), true);
  assert.equal(plan.required_inputs.some((input) => input.includes("project design contract")), true);
  assert.equal(plan.expected_output.some((output) => output.includes("capability layer")), true);
  assert.equal(plan.reject_if.some((rule) => rule.includes("application-tool")), true);
  assert.equal(plan.completion_authority.includes("main runtime"), true);
  assert.equal(plan.verification_surface.some((item) => item.includes("required inputs")), true);
  assert.equal(plan.next_command, "pnpm run runtime -- governance experts --gate core_boundary_review");
  assert.match(plan.boundary, /does not invoke models/);
  assert.match(plan.boundary, /prove completion/);

  assert.throws(() => getExpertDelegationPlan("missing_gate"), /Unknown expert delegation gate/);
});
