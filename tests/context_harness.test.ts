import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  delegateAgentActionContract,
  getDelegateAgentPayloadExample
} from "../packages/core/src/action_contracts.js";
import {
  buildTurnSnapshot,
  compactGaPlanAfterVerifyCommand,
  compactGaPlanAcceptanceCriteria,
  compactGaPlanAntiDriftChecks,
  compactGaPlanAuditEvidence,
  compactGaPlanAuditRequirements,
  compactGaPlanAuditRejects,
  compactGaPlanEvidenceRefs,
  compactGaPlanGeneralDelegationLoop,
  compactGaPlanGoalScope,
  compactGaPlanGovernanceCleanup,
  compactGaPlanLayerGuard,
  compactGaPlanNonGoals,
  compactGaPlanPhaseForbids,
  compactGaPlanProofBoundary,
  compactGaPlanRuntimeObservabilityGuard,
  compactGaPlanStageExitCriteria,
  compactGaPlanSourceTruth,
  compactGaPlanVerificationCommands,
  compactGaPlanReviewGate,
  compactGaPlanSelectionChecks,
  compactGaPlanSelectionReasons,
  renderContextBundleWithManifest
} from "../packages/core/src/context.js";
import { getCapabilityCatalog } from "../packages/core/src/capabilities.js";
import { runHarnessReplayAudit } from "../packages/core/src/harness_replay.js";
import { getLiveRunTrace } from "../packages/core/src/live_run_trace.js";
import { decideOpportunity } from "../packages/core/src/opportunity_backlog.js";
import {
  DELEGATE_AGENT_CONTEXT_MAX_CHARS,
  DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND,
  DELEGATE_AGENT_TASK_MAX_CHARS,
  DELEGATED_AGENT_FINDINGS_MAX_CHARS,
  DELEGATED_AGENT_SUMMARY_MAX_CHARS,
  delegatedResultSchema,
  opportunitySchema,
  triggerSchema
} from "../packages/core/src/schemas.js";
import { AgentStore } from "../packages/core/src/store.js";
import type { RuntimeConfig } from "../packages/runtime/src/config.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../packages/runtime/src/model.js";
import { LiveAgentRunner } from "../packages/runtime/src/runner.js";

test("compact GA plan reasons keep source status and quality by prefix", () => {
  assert.deepEqual(compactGaPlanSelectionReasons([
    "fresh_successor_slice=true",
    "iteration_record_status=open_iteration_available",
    "source_kind=verified_artifact",
    "source_artifact_quality=ok",
    "scorecard_target_status=recognized",
    "source_status=verified"
  ]), [
    "source_kind=verified_artifact",
    "source_status=verified",
    "source_artifact_quality=ok",
    "scorecard_target_status=recognized"
  ]);
});

test("compact GA plan checks keep source quality basis by prefix", () => {
  assert.deepEqual(compactGaPlanSelectionChecks([
    "fresh_successor_slice=true",
    "target_layer=core_runtime; owner_surface=ga_project_design",
    "source_artifact_warning_thresholds=evidence_refs:2; verification_commands:2",
    "source_artifact_verified=verified; ref=self-evolution/iterations/source.json",
    "source_artifact_evidence=evidence_refs:16; verification_commands:11"
  ]), [
    "source_artifact_verified=verified; ref=self-evolution/iterations/source.json",
    "source_artifact_evidence=evidence_refs:16; verification_commands:11",
    "source_artifact_warning_thresholds=evidence_refs:2; verification_commands:2"
  ]);
});

test("compact GA plan source truth keeps source artifact and successor identity", () => {
  assert.equal(compactGaPlanSourceTruth({
    source_kind: "verified_artifact",
    source_artifact_id: "ga_design_artifact_source",
    source_iteration_ref: "self-evolution/iterations/source.json",
    source_proposed_slice: "completed_source_slice",
    proposed_slice: "fresh_target_slice",
    selection_reasons: [
      "source_status=verified",
      "source_artifact_quality=ok"
    ],
    selection_checks: [
      "fresh_successor_slice=true; source_slice=completed_source_slice; target_slice=fresh_target_slice"
    ]
  }), "source_kind=verified_artifact; artifact=ga_design_artifact_source; ref=self-evolution/iterations/source.json; source_slice=completed_source_slice; target_slice=fresh_target_slice; status=verified; quality=ok; fresh_successor=true");
});

test("compact GA plan goal scope keeps objective owner source and success evidence", () => {
  assert.equal(compactGaPlanGoalScope({
    goal_scope: {
      objective: "Continue core/basic GA design.",
      owner_surface: "ga_project_design",
      source_of_truth: [
        "operator_objective=core_basic_self_evolution_first",
        "source_artifact=ga_design_artifact_source",
        "source_iteration_ref=self-evolution/iterations/source.json"
      ],
      success_evidence: [
        "fresh_successor_slice=true; source_slice=completed; target_slice=fresh"
      ]
    }
  }), "objective=Continue core/basic GA design.; owner=ga_project_design; source=operator_objective=core_basic_self_evolution_first|source_artifact=ga_design_artifact_source; success=fresh_successor_slice=true; source_slice=completed; target_slice=fresh");
});

test("compact GA plan acceptance keeps audit seed labels and critical anti-drift criteria", () => {
  assert.deepEqual(compactGaPlanAcceptanceCriteria([
    "goal_scope: operator goal is restated with owner surface, source of truth, and success evidence",
    "goal_scope: the next proposed slice is selected from current goal and scorecard evidence instead of copied from the source artifact",
    "current_state: capability layer stays core_runtime or basic_entrypoint before implementation",
    "current_state: external adapters remain application slices unless a reusable runtime contract is named",
    "verification_scope: verification commands are scoped to the slice and required entrypoints are covered by completion claims",
    "learning_persistence: outcome is recorded before reuse"
  ]), [
    "goal_scope: operator goal is restated with owner surface, source of truth, and success evidence",
    "current_state: capability layer stays core_runtime or basic_entrypoint before implementation",
    "verification_scope: verification commands are scoped to the slice and required entrypoints are covered by completion claims",
    "learning_persistence: outcome is recorded before reuse",
    "goal_scope: the next proposed slice is selected from current goal and scorecard evidence instead of copied from the source artifact",
    "current_state: external adapters remain application slices unless a reusable runtime contract is named"
  ]);
});

test("compact GA plan non-goals keep local-learning and application boundaries", () => {
  assert.deepEqual(compactGaPlanNonGoals([
    "does not execute or verify the planned slice",
    "does not promote SOPs, skills, memory, dreams, or application adapters",
    "does not prove future GA project completion",
    "does not promote one-off external adapter behavior into core identity",
    "no project scheduler",
    "no external-tool execution",
    "no automatic SOP, skill, memory, or dream promotion",
    "no completion proof without executed verification"
  ]), [
    "does not promote SOPs, skills, memory, dreams, or application adapters",
    "does not promote one-off external adapter behavior into core identity",
    "no external-tool execution",
    "no automatic SOP, skill, memory, or dream promotion",
    "no completion proof without executed verification"
  ]);
});

test("compact GA plan anti-drift checks keep bounded core identity guardrails", () => {
  assert.equal(compactGaPlanAntiDriftChecks({
    iteration_focus: {
      direction_id: "core_basic_plan_clarity",
      direction: "Clarify the next core/basic GA design improvement before implementation.",
      rationale: "Use verified GA design evidence.",
      next_steps: [],
      anti_drift_checks: [
        "do not infer core identity from external adapter or MCP pressure",
        "do not promote SOP, skill, memory, or dream artifacts before verified core/basic reuse evidence exists",
        "do not claim completion until outcome verification commands cover the required project-design checks",
        "extra low-priority check should stay out of compact context"
      ]
    }
  }), "do not infer core identity from external adapter or MCP pressure | do not promote SOP, skill, memory, or dream artifacts before verified core/basic reuse evidence exists | do not claim completion until outcome verification commands cover the required project-design checks");
});

test("compact GA plan layer guard keeps source and selected layer continuity", () => {
  assert.equal(compactGaPlanLayerGuard({
    layer_decision: {
      selected_layer: "core_runtime",
      selected_owner_surface: "ga_project_design",
      source_layer: "core_runtime",
      source_owner_surface: "ga_project_design",
      source_proposed_slice: "source_slice",
      proposed_slice: "target_slice",
      core_identity: "recurring_ga_project_design",
      stage: "core_basic_successor_ready",
      reasons: [],
      application_boundaries: [],
      required_before_outcome: []
    }
  }), "stage=core_basic_successor_ready; source=core_runtime/ga_project_design; selected=core_runtime/ga_project_design");
});

test("compact GA plan audit requirements keep every completion seed requirement", () => {
  assert.equal(compactGaPlanAuditRequirements({
    completion_audit_seeds: [
      {
        id: "goal_scope",
        phase_id: "goal_intake",
        requirement: "Preserve the latest operator objective.",
        evidence_needed: [],
        reject_if: []
      },
      {
        id: "current_state",
        phase_id: "capability_layering",
        requirement: "Use current worktree and runtime state.",
        evidence_needed: [],
        reject_if: []
      },
      {
        id: "verification_scope",
        phase_id: "verification_review",
        requirement: "Match verification evidence to the claim.",
        evidence_needed: [],
        reject_if: []
      },
      {
        id: "learning_persistence",
        phase_id: "learning_persistence",
        requirement: "Record the verified outcome before reuse.",
        evidence_needed: [],
        reject_if: []
      }
    ]
  }), "goal_scope=Preserve the latest operator objective.; current_state=Use current worktree and runtime state.; verification_scope=Match verification evidence to the claim.; learning_persistence=Record the verified outcome before reuse.");
});

test("compact GA plan audit evidence keeps one evidence target per completion seed", () => {
  assert.equal(compactGaPlanAuditEvidence({
    completion_audit_seeds: [
      {
        id: "goal_scope",
        phase_id: "goal_intake",
        requirement: "Preserve the latest operator objective.",
        evidence_needed: [
          "operator goal or accepted task states the intended end state",
          "next_core_basic_plan.goal_scope names objective, owner_surface, source_of_truth, and success_evidence"
        ],
        reject_if: []
      },
      {
        id: "current_state",
        phase_id: "capability_layering",
        requirement: "Use current worktree and runtime state.",
        evidence_needed: [
          "workspace or git status when files changed",
          "service health status and reasons when service health is a required verification command"
        ],
        reject_if: []
      },
      {
        id: "verification_scope",
        phase_id: "verification_review",
        requirement: "Match verification evidence to the claim.",
        evidence_needed: [
          "targeted checks cover the changed behavior",
          "outcome maps each required verification entrypoint to a completion claim"
        ],
        reject_if: []
      },
      {
        id: "learning_persistence",
        phase_id: "learning_persistence",
        requirement: "Record the verified outcome before reuse.",
        evidence_needed: [
          "record-iteration-outcome ref",
          "next moves preserve non-goals and boundaries"
        ],
        reject_if: []
      }
    ]
  }), "goal_scope=operator goal or accepted task states the intended end state; current_state=service health status and reasons when service health is a required verification command; verification_scope=outcome maps each required verification entrypoint to a completion claim; learning_persistence=record-iteration-outcome ref");
});

test("compact GA plan audit rejects keep one failure condition per completion seed", () => {
  assert.equal(compactGaPlanAuditRejects({
    completion_audit_seeds: [
      {
        id: "goal_scope",
        phase_id: "goal_intake",
        requirement: "Preserve the latest operator objective.",
        evidence_needed: [],
        reject_if: [
          "success criteria only describe the completed source artifact",
          "the next slice is easier than the operator objective"
        ]
      },
      {
        id: "current_state",
        phase_id: "capability_layering",
        requirement: "Use current worktree and runtime state.",
        evidence_needed: [],
        reject_if: [
          "older memory is the only evidence",
          "service health is a required verification command but the outcome omits service health status or reasons",
          "external adapter pressure is treated as core identity without a reusable contract"
        ]
      },
      {
        id: "verification_scope",
        phase_id: "verification_review",
        requirement: "Match verification evidence to the claim.",
        evidence_needed: [],
        reject_if: [
          "a narrow command is used to prove a broader capability claim",
          "expert advice replaces executed verification",
          "verification commands are listed without claim coverage",
          "a required verification entrypoint is omitted from outcome claim coverage"
        ]
      },
      {
        id: "learning_persistence",
        phase_id: "learning_persistence",
        requirement: "Record the verified outcome before reuse.",
        evidence_needed: [],
        reject_if: [
          "dream, SOP, skill, or memory artifacts are treated as completion proof",
          "one-off application behavior is promoted as core runtime identity"
        ]
      }
    ]
  }), "goal_scope=success criteria only describe the completed source artifact; current_state=service health is a required verification command but the outcome omits service health status or reasons; verification_scope=a required verification entrypoint is omitted from outcome claim coverage; learning_persistence=dream, SOP, skill, or memory artifacts are treated as completion proof");
});

test("compact GA plan stage exits keep every core and basic stage", () => {
  assert.equal(compactGaPlanStageExitCriteria({
    capability_stage_plan: {
      core_capabilities: [
        {
          id: "goal_intake",
          title: "Goal intake",
          layer: "core_runtime",
          stage: "active",
          current_state: "Current state.",
          next_iteration: "Next.",
          exit_criteria: ["goal exit"],
          evidence_refs: []
        },
        {
          id: "contract_design",
          title: "Contract design",
          layer: "core_runtime",
          stage: "hardening",
          current_state: "Current state.",
          next_iteration: "Next.",
          exit_criteria: ["contract exit"],
          evidence_refs: []
        }
      ],
      basic_capabilities: [
        {
          id: "execution_plan",
          title: "Execution plan",
          layer: "basic_entrypoint",
          stage: "active",
          current_state: "Current state.",
          next_iteration: "Next.",
          exit_criteria: ["execution exit"],
          evidence_refs: []
        }
      ],
      next_iteration_plan: []
    }
  }), "core=goal_intake=goal exit,contract_design=contract exit; basic=execution_plan=execution exit");
});

test("compact GA plan runtime guard keeps observability attention state", () => {
  assert.equal(compactGaPlanRuntimeObservabilityGuard({
    capability_stage_plan: {
      core_capabilities: [],
      basic_capabilities: [
        {
          id: "execution_plan",
          title: "Execution plan",
          layer: "basic_entrypoint",
          stage: "active",
          current_state: "Execution current.",
          next_iteration: "Execution next.",
          exit_criteria: ["execution exit"],
          evidence_refs: []
        },
        {
          id: "runtime_observability",
          title: "Runtime observability",
          layer: "basic_entrypoint",
          stage: "attention_guard",
          current_state: "Resident service health keeps runtime attention visible.",
          next_iteration: "Name runtime attention reasons explicitly.",
          exit_criteria: [
            "service health is inspected for the resident runtime target",
            "runtime attention reasons are named in the outcome"
          ],
          evidence_refs: []
        }
      ],
      next_iteration_plan: []
    }
  }), "stage=attention_guard; current=Resident service health keeps runtime attention visible.; next=Name runtime attention reasons explicitly.; exit=runtime attention reasons are named in the outcome");
});

test("compact GA plan phase forbids keep every phase gate", () => {
  assert.equal(compactGaPlanPhaseForbids({
    phase_gates: [
      {
        phase_id: "goal_intake",
        title: "Goal intake",
        layer: "core_runtime",
        objective: "Restate the goal.",
        required_inputs: [],
        exit_evidence: [],
        forbidden_shortcuts: ["do not shrink the goal"]
      },
      {
        phase_id: "verification_review",
        title: "Verification review",
        layer: "core_runtime",
        objective: "Verify the claim.",
        required_inputs: [],
        exit_evidence: [],
        forbidden_shortcuts: ["do not let model reasoning replace executed verification"]
      }
    ]
  }), "goal_intake=do not shrink the goal; verification_review=do not let model reasoning replace executed verification");
});

test("compact GA plan review gate names open iteration blockers", () => {
  const openIterationStatus = {
    status: "open_iteration_available",
    id: "iteration_contract_open",
    ref: "self-evolution/iterations/iteration_contract_open.json",
    outcome_status: "not_recorded",
    record_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>",
    boundary: "read-only test status"
  } as const;
  assert.equal(compactGaPlanReviewGate({
    iteration_record_status: openIterationStatus,
    selection_checks: ["verification_entrypoints=project-design,scorecard,iterations,service-health,check"]
  }), "blocked; blockers=outcome_record,outcome_verification_command_coverage,outcome_verification_claim_coverage; required=project-design,scorecard,iterations,service-health,check; required_coverage=verified_outcome,outcome_evidence_refs,plan_ref_coverage,implementation_contract_coverage,outcome_verification_command_coverage,outcome_verification_claim_coverage,runtime_attention_outcome_coverage,workspace_outcome_coverage; outcome_status=not_recorded");
  assert.equal(
    compactGaPlanAfterVerifyCommand({ iteration_record_status: openIterationStatus }),
    "pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_open --outcome-status verified --summary \"...\" --evidence-ref <ref...> --verification-command \"<command...>\" --verification-claim \"<entrypoint>: <claim>\" --next-move \"...\" --state-root <state-root>"
  );
  assert.deepEqual(compactGaPlanVerificationCommands({
    iteration_record_status: openIterationStatus,
    verification_commands: [
      "pnpm run runtime -- governance project-design --artifact ga_design_artifact_source --state-root <state-root>",
      "pnpm run runtime -- governance scorecard --state-root <state-root>",
      "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>",
      "pnpm run runtime -- service health --target runtime",
      "pnpm run check"
    ]
  }), [
    "project-design=ga_design_artifact_source",
    "scorecard",
    "iterations=iteration_contract_open;audit=all",
    "service-health=runtime",
    "check"
  ]);
  assert.deepEqual(compactGaPlanEvidenceRefs([
    "packages/core/src/ga_project_design.ts",
    "self-evolution/iterations/iteration_contract_open.json",
    "self-evolution/iterations/iteration_contract_source.json",
    "docs/RUNTIME_CONTRACT.md",
    "tests/context_harness.test.ts"
  ]), [
    "packages/core/src/ga_project_design.ts",
    "self-evolution/iterations/iteration_contract_open.json",
    "self-evolution/iterations/iteration_contract_source.json",
    "docs/RUNTIME_CONTRACT.md",
    "tests/context_harness.test.ts"
  ]);
  assert.equal(
    compactGaPlanProofBoundary({ iteration_record_status: openIterationStatus }),
    "evidence_basis=candidate_refs_only; require=verified_outcome,outcome_evidence_refs,plan_ref_coverage,implementation_contract_coverage,outcome_verification_command_coverage,outcome_verification_claim_coverage,runtime_attention_outcome_coverage,workspace_outcome_coverage"
  );
  assert.equal(compactGaPlanReviewGate({
    iteration_record_status: {
      status: "not_recorded",
      record_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>",
      boundary: "read-only test status"
    },
    selection_checks: []
  }), null);
  assert.equal(compactGaPlanAfterVerifyCommand({
    iteration_record_status: {
      status: "not_recorded",
      record_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>",
      boundary: "read-only test status"
    }
  }), null);
  assert.equal(compactGaPlanProofBoundary({
    iteration_record_status: {
      status: "not_recorded",
      record_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>",
      boundary: "read-only test status"
    }
  }), null);
});

test("compact GA plan governance cleanup names stale open iterations", () => {
  assert.equal(compactGaPlanGovernanceCleanup({
    governance_cleanup: {
      superseded_open_iterations: [],
      boundary: "read-only test cleanup"
    }
  }), null);
  assert.equal(compactGaPlanGovernanceCleanup({
    governance_cleanup: {
      superseded_open_iterations: [
        {
          id: "iteration_contract_stale",
          ref: "self-evolution/iterations/iteration_contract_stale.json",
          proposed_slice: "stale_previous_slice",
          created_at: "2026-06-30T00:00:00Z",
          superseded_by_ref: "self-evolution/iterations/iteration_contract_source.json",
          suggested_outcome_status: "partial",
          reason: "Open GA iteration predates the verified source.",
          inspect_command: "pnpm run runtime -- governance iterations --iteration iteration_contract_stale --state-root <state-root>",
          boundary: "read-only test cleanup item"
        }
      ],
      boundary: "read-only test cleanup"
    }
  }), "superseded_open_iterations=1; iteration_contract_stale:partial");
});

test("compact GA plan general delegation loop keeps task context result bounds", () => {
  assert.equal(compactGaPlanGeneralDelegationLoop({
    general_delegation_loop: {
      action: "delegate_agent",
      layer: "core_runtime",
      stage: "active",
      lifecycle_steps: [...delegateAgentActionContract.lifecycle_steps],
      max_actions_per_round: DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND,
      task_contract: {
        max_chars: 1000,
        required: ["bounded task"],
        reject_if: ["empty task"]
      },
      context_contract: {
        max_chars: 12000,
        required: ["bounded context"],
        reject_if: ["empty context"]
      },
      result_contract: {
        summary_max_chars: 240,
        findings_max_chars: 2000,
        required: ["summary", "findings_text"],
        reject_if: ["invalid JSON"]
      },
      dispatch_failure_kind_contract: {
        field: "dispatch_failure_kind",
        values: ["dispatch_limit_exceeded", "input_contract_failed", "none"],
        required: ["record bounded dispatch failure kind"],
        reject_if: ["free-form error text only"]
      },
      result_failure_kind_contract: {
        field: "result_failure_kind",
        values: [
          "dispatch_limit_exceeded",
          "input_contract_failed",
          "delegated_output_contract_failed",
          "delegated_model_request_failed",
          "none"
        ],
        required: ["record bounded result failure kind"],
        reject_if: ["raw delegated artifact body inference"]
      },
      runner_enforcement_contract: {
        instruction_boundary: ["model proposes while harness executes"],
        input_contract: [
          "parseDelegationRequest validates strict task/context payloads before delegated model dispatch",
          "validateDelegationTaskBoundary requires explicit bounded analysis intent as one concrete question and rejects direct fix/update/edit/patch/commit/delete/remove/erase/unlink/drop/destroy/push/merge/deploy/publish/release, Git push/merge/rebase/cherry-pick/reset/tag, pull-request creation, command/test execution (including Git), tool, write, mutation, completion, expert, or multi-agent scheduling requests; validateDelegationContextBoundary requires delegated analysis may use only explicit payload context or named evidence refs and rejects context grants for destructive delete/remove/erase/unlink/drop/destroy/push/merge/deploy/publish/release, Git push/merge/rebase/cherry-pick/reset/tag, pull-request creation, command/test execution (including Git), file read, repo search, URL fetch, web browsing, completion, expert scheduling, multi-agent orchestration, model fan-out, hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs"
        ],
        result_handling: ["executeDelegation returns sanitized observations"],
        completion_gate: [
          "delegate_agent completion-gate helper fails a done claim without later recovery evidence",
          "delegate_agent completion-gate helper rejects exact delegated result ids or persisted delegated result refs",
          "delegate_agent completion-gate helper requires later harness-known non-delegated verification refs after the latest delegated result, successful write/run evidence only counts when its harness-known ref is cited, and failed delegation still requires later successful write/run recovery evidence plus bound non-delegated verification refs"
        ]
      },
      recovery_contract: {
        inputs: ["sanitized delegated observation", "result_failure_kind"],
        required: ["failed delegated results may only guide a later main-harness model round as sanitized observation"],
        reject_if: ["automatic retry or expert scheduling"]
      },
      replay_audit_contract: {
        metadata_source: "harness-owned delegated_result event summaries only",
        required_metadata: ["action_id", "envelope_ref", "model_invoked", "dispatch_failure_kind", "result_failure_kind"],
        checks: [
          "delegated_completion_gate",
          "verification_evidence_lineage",
          "delegated_action_coverage",
          "delegated_result_ref_coverage",
          "delegated_dispatch_metadata",
          "delegated_model_invocation_boundary",
          "delegated_dispatch_lineage",
          "delegated_dispatch_failure_kind",
          "delegated_dispatch_round_limit",
          "delegated_result_failure_kind",
          "delegated_results"
        ],
        proof_boundary: ["must not read delegated result artifact bodies"]
      },
      completion_authority: ["main harness verifies delegated results"],
      deferred_scope: ["no expert personas", "no autonomous multi-agent scheduling"],
      evidence_refs: ["packages/core/src/schemas.ts"],
      boundary: "read-only test loop"
    }
  }), `action=delegate_agent; stage=active; lifecycle=validate_task_context>dispatch_delegated_model>persist_delegated_result>observe_sanitized_result>verify_main_harness_completion; max_per_round=${DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND}; dispatch_kind=dispatch_failure_kind; result_kind=result_failure_kind; task_max=1000; context_max=12000; result=240/2000; runner=parseDelegationRequest validates strict task/context payloads before delegated model dispatch+validateDelegationTaskBoundary requires explicit bounded analysis intent as one concrete question and rejects direct fix/update/edit/patch/commit/delete/remove/erase/unlink/drop/destroy/push/merge/deploy/publish/release, Git push/merge/rebase/cherry-pick/reset/tag, pull-request creation, command/test execution (including Git), tool, write, mutation, completion, expert, or multi-agent scheduling requests; validateDelegationContextBoundary requires delegated analysis may use only explicit payload context or named evidence refs and rejects context grants for destructive delete/remove/erase/unlink/drop/destroy/push/merge/deploy/publish/release, Git push/merge/rebase/cherry-pick/reset/tag, pull-request creation, command/test execution (including Git), file read, repo search, URL fetch, web browsing, completion, expert scheduling, multi-agent orchestration, model fan-out, hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs; gate=delegate_agent completion-gate helper fails a done claim without later recovery evidence+delegate_agent completion-gate helper rejects exact delegated result ids or persisted delegated result refs+delegate_agent completion-gate helper requires later harness-known non-delegated verification refs after the latest delegated result, successful write/run evidence only counts when its harness-known ref is cited, and failed delegation still requires later successful write/run recovery evidence plus bound non-delegated verification refs; recovery=failed delegated results may only guide a later main-harness model round as sanitized observation; replay=delegated_completion_gate+verification_evidence_lineage+delegated_action_coverage+delegated_result_ref_coverage+delegated_dispatch_metadata+delegated_model_invocation_boundary+delegated_dispatch_lineage+delegated_dispatch_failure_kind+delegated_dispatch_round_limit+delegated_result_failure_kind+delegated_results; metadata=action_id+envelope_ref+model_invoked; proof=must not read delegated result artifact bodies; authority=main harness verifies delegated results; defer=no expert personas,no autonomous multi-agent scheduling`);
});

test("context bundle stays bounded to selected local runtime inputs", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoHead(fixture.store, "fedcba9876543210fedcba9876543210fedcba98");
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check the local context boundary."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check the local context boundary."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity, {
      memory_hits: [{
        id: "evidence_prior_context",
        session_id: "session_prior",
        kind: "report",
        summary: "Prior Feishu restart fixed heartbeat drift.",
        artifact_refs: ["memory/episodes/prior-detail.json"],
        score: -1.25,
        created_at: "2026-06-29T00:00:00Z"
      }],
      discipline: {
        mode: "query_todo",
        query_ref: "query.md",
        todo_ref: "todo.md"
      }
    });
    await fixture.store.writeText("query.md", "Authoritative query.");
    await fixture.store.writeText("todo.md", "Current checklist.");
    await fixture.store.writeText("memory/episodes/prior-detail.json", "RAW_DETAIL_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("memory/semantic/accepted/semantic_memory_test.json", {
      id: "semantic_memory_test",
      action_type: "semantic_memory",
      status: "accepted",
      scope: "local",
      summary: "Operator prefers explicit confirmation gates.",
      content: "Use explicit candidate confirmation before accepting durable memory.",
      source_candidate_id: "memory_proposal_test",
      source_candidate_ref: "memory/semantic/candidates/session-memory-proposal-r1-0.json",
      artifact_refs: ["memory/episodes/events.jsonl"],
      confirmation_ref: "memory/semantic/confirmations/memory_confirmation_test.json",
      created_at: "2026-06-30T00:00:00.000Z",
      accepted_at: "2026-06-30T00:00:01.000Z",
      boundary: "local state semantic memory"
    });
    await fixture.store.writeJson("memory/dreams/dream_context.json", {
      schema_version: 1,
      id: "dream_context",
      action_type: "dream_snapshot",
      status: "active",
      title: "Core self-evolution long-horizon plan",
      summary: "Keep the agent focused on GA project design and self-evolution.",
      created_at: "2026-06-30T00:00:01.500Z",
      source_refs: ["memory/semantic/accepted/semantic_memory_test.json"],
      semantic_memory_refs: ["memory/semantic/accepted/semantic_memory_test.json"],
      backlog_refs: [],
      axes: [{
        id: "core_ga_design",
        title: "Core GA project design",
        status: "active",
        summary: "Recurring GA project design is core; one-off adapters are application slices.",
        evidence_refs: ["memory/semantic/accepted/semantic_memory_test.json"],
        next_moves: ["Keep layer classification explicit."]
      }],
      horizons: [{
        id: "later",
        title: "Later horizon",
        objective: "Evolve into bounded general-agent delegation before expert specialization.",
        success_criteria: ["Delegated output remains advisory until verified by the main harness."]
      }],
      non_goals: ["Do not treat dream snapshots as completion evidence."],
      boundary: "bounded dream context only"
    });
    await fixture.store.writeText("memory/dreams/dream_context.md", "RAW_DREAM_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("self-evolution/iterations/iteration_contract_context.json", {
      schema_version: 1,
      id: "iteration_contract_context",
      ref: "self-evolution/iterations/iteration_contract_context.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Record this work as a core runtime iteration before implementation.",
      layer: "core_runtime",
      owner_surface: "runtime_contract",
      proposed_slice: "self_evolution_iteration_contract",
      source_ref: "memory/dreams/dream_context.json",
      evidence_refs: ["packages/core/src/self_evolution_scorecard.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["Do not execute the proposed slice."],
      advisory_expert_roles: ["architect", "verification_reviewer", "orchestration_planner"],
      created_at: "2026-06-30T00:00:01.700Z",
      boundary: "bounded iteration contract only"
    });
    await fixture.store.writeJson("services/runtime/heartbeat.json", {
      service: "runtime",
      state: "running",
      pid: 2468,
      repo_root: fixture.repoRoot,
      state_root: fixture.stateRoot,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-30T00:00:02.000Z",
      runtime_build: {
        schema_version: 1,
        target: "runtime",
        runtime_current_root: "/home/user/.local-runtime/service/runtime/current",
        repo_root: fixture.repoRoot,
        built_at: "2026-06-30T00:00:01.000Z",
        node_version: "v24.0.0",
        source_commit: "abcdef0123456789abcdef0123456789abcdef01",
        source_commit_short: "abcdef012345",
        source_branch: "develop",
        source_is_dirty: false
      }
    });
    await fixture.store.writeJson("services/runtime/review_tick.json", {
      service: "review_tick",
      enabled: true,
      state: "ok",
      updated_at: "2026-06-30T00:00:02.500Z",
      last_tick_ref: "autonomy/ticks/review_tick_context.json",
      last_focus_current_status: "covered_by_auto_action",
      last_focus_current_ref: "autonomy/opportunity-actions/opportunity_action_context.json",
      last_focus_current_reason: "selected review tick focus was completed by the same tick auto-action",
      last_auto_action_status: "executed",
      last_auto_action_ref: "autonomy/opportunity-actions/opportunity_action_context.json",
      last_auto_action_opportunity_id: "archive_health_stale_2026_06_30",
      last_auto_action_opportunity_kind: "archive_health",
      last_auto_action_result_ref: "memory/archives/2026-06-30.json",
      last_auto_action_summary: "archive_refresh: healthy, remaining=0",
      last_inbox_count: 3,
      last_active_tick_inbox_count: 1,
      last_active_inbox_count: 2,
      last_inactive_tick_inbox_count: 2,
      last_inactive_tick_inbox_reasons: {
        terminal_decision_completed: 1,
        executed_status: 1
      },
      next_wake_at: "2026-06-30T00:30:02.500Z",
      next_wake_delay_ms: 1_800_000,
      next_wake_reason: "interval"
    });
    await fixture.store.writeJson("services/runtime/content_daily.json", {
      service: "content_daily",
      enabled: true,
      state: "ok",
      updated_at: "2026-06-30T00:00:03.000Z",
      last_job_ref: "content/daily/2026-06-30.json",
      last_job_status: "published",
      last_effective_job_status: "published",
      last_job_count: 2,
      last_applied_strategy_count: 1,
      last_applied_strategy_run_refs: ["content/runs/content_run_context_daily/run.json"],
      last_applied_strategy_source_run_refs: ["content/runs/content_run_context/run.json"],
      last_applied_strategy_postures: ["reuse_baseline"],
      last_applied_strategy_source_titles: ["AI应用早报"],
      last_blocked_strategy_count: 1,
      last_blocked_strategy_reasons: ["latest_strategy_not_auto_applicable:collect_more_feedback"]
    });
    await fixture.store.writeJson("content/daily/2026-06-30.json", {
      status: "published",
      run_id: "content_run_context_daily",
      run_ref: "content/runs/content_run_context_daily/run.json"
    });
    await fixture.store.writeJson("content/runs/content_run_context_daily/run.json", {
      status: "published",
      evidence: { publish_status: "published" }
    });
    await fixture.store.writeJson("services/runtime/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "skipped",
      updated_at: "2026-06-30T00:00:03.000Z",
      last_queue_count: 2,
      last_due_count: 0,
      last_deferred_count: 2,
      last_captured_count: 0,
      last_skipped_count: 1,
      last_top_skip_reason: "non_mcp_capture_route",
      last_skip_reason_counts: {
        non_mcp_capture_route: 1
      },
      last_strategy_suggestion_count: 2,
      last_strategy_high_priority_count: 2,
      last_strategy_collect_more_feedback_count: 2,
      last_strategy_repair_feedback_capture_count: 0,
      last_strategy_revise_next_post_count: 0,
      last_strategy_reuse_baseline_count: 0,
      last_strategy_verify_metrics_count: 0,
      last_strategy_top_posture: "collect_more_feedback",
      last_strategy_top_priority: "high",
      last_strategy_top_title: "AI应用早报",
      last_strategy_top_run_ref: "content/runs/content_run_context/run.json",
      last_strategy_next_command: "pnpm run runtime -- content feedback-capture --run content_run_context --server-url http://localhost:18060/mcp --state-root <state-root>",
      next_due_at: "2026-06-30T06:00:00.000Z"
    });
    await fixture.store.writeText("autonomy/reviews/background_review_context.md", "RAW_BACKGROUND_REVIEW_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("autonomy/reviews/background_review_context.json", {
      id: "background_review_context",
      mode: "query",
      query: "context governance",
      session_id: null,
      created_at: "2026-06-30T00:00:09.000Z",
      stats: {
        events_reviewed: 2,
        sessions_seen: 1,
        kinds: { report: 2 },
        failure_signal_count: 1,
        sop_signal_count: 1
      },
      source: {
        memory_sync: {
          source_ref: "memory/episodes/events.jsonl",
          db_ref: "memory/index/episodes.sqlite",
          total_rows: 2,
          indexed_rows: 2,
          skipped_rows: 0
        },
        reviewed_event_ids: ["evidence_context_review_1", "evidence_context_review_2"],
        working_checkpoint: {
          ref: "memory/working/current.json",
          goal: "Keep context governance visible.",
          current_step: "Inspect the context governance queue.",
          known_constraints: [],
          recent_evidence_refs: [],
          open_questions: [],
          next_action: "Inspect the context governance queue before requesting confirmation."
        }
      },
      chain_summaries: [{
        sop_ref: "sop/drafts/sop_context_gate.json",
        sop_id: "sop_context_gate",
        title: "Context gate SOP",
        sop_status: "draft",
        latest_decision: "drafted",
        event_count: 1,
        audit_count: 0,
        promotion_events: 0,
        reuse_events: 0,
        review_refs: [],
        audit_refs: [],
        skill_refs: [],
        duplicate_skill_refs: [],
        event_ids: ["evidence_context_review_1"]
      }],
      proposals: [{
        id: "review_proposal_context_report",
        type: "sop_candidate",
        title: "Review context governance report",
        rationale: "RAW_BACKGROUND_REVIEW_RATIONALE_SHOULD_NOT_BE_IN_CONTEXT",
        evidence_refs: ["memory/episodes/events.jsonl#evidence_context_review_1"],
        next_action: "Inspect the context governance queue before requesting confirmation.",
        focus_action_chain: [{
          label: "inspect",
          effect: "read_only",
          reason: "RAW_BACKGROUND_REVIEW_ACTION_CHAIN_REASON_SHOULD_NOT_BE_IN_CONTEXT"
        }, {
          label: "request_confirmation",
          effect: "state_decision",
          reason: "Request explicit confirmation before mutating state."
        }]
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_context.json",
        markdown_ref: "autonomy/reviews/background_review_context.md"
      },
      evidence_event_id: "evidence_background_review_context"
    });
    await fixture.store.writeText("autonomy/reviews/raw-review-detail.md", "RAW_REVIEW_DETAIL_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("autonomy/ticks/review_tick_context.md", "RAW_TICK_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("autonomy/ticks/review_tick_context.json", {
      id: "review_tick_context",
      mode: "query",
      query: "context governance",
      session_id: null,
      created_at: "2026-06-30T00:00:08.000Z",
      focus: {
        source: "opportunity_backlog",
        reason: "selected top backlog item review_inbox:review_inbox_context as review focus",
        query: "context governance",
        opportunity: {
          ref: "autonomy/inbox/review_inbox_context.json",
          id: "review_inbox_context",
          kind: "review_inbox",
          status: "open",
          score: 72,
          action_kind: "draft_sop",
          source_ref: "autonomy/reviews/raw-review-detail.md"
        }
      },
      review_ref: "autonomy/reviews/raw-review-detail.md",
      review_markdown_ref: "autonomy/reviews/raw-review-detail.md",
      proposal_count: 1,
      inbox_item_refs: ["autonomy/inbox/review_inbox_context.json"],
      inbox_items: [{
        id: "review_inbox_context",
        rationale: "RAW_TICK_INBOX_RATIONALE_SHOULD_NOT_BE_IN_CONTEXT"
      }],
      stats: {
        new_items: 1,
        updated_items: 0
      },
      artifact_refs: {
        json_ref: "autonomy/ticks/review_tick_context.json",
        markdown_ref: "autonomy/ticks/review_tick_context.md"
      },
      evidence_event_id: "evidence_review_tick_context"
    });
    await fixture.store.writeJson("memory/semantic/candidates/session-memory-proposal-r1-0.json", {
      id: "memory_proposal_context",
      action_type: "propose_memory",
      status: "confirmation_requested",
      scope: "local",
      summary: "Remember context governance queue visibility.",
      content: "RAW_MEMORY_CANDIDATE_CONTENT_SHOULD_NOT_BE_IN_CONTEXT",
      artifact_refs: ["memory/episodes/events.jsonl"],
      created_at: "2026-06-30T00:00:02.000Z"
    });
    await fixture.store.writeJson("memory/semantic/confirmations/memory_confirmation_context.json", {
      id: "memory_confirmation_context",
      action_type: "promote_memory_candidate",
      status: "pending",
      created_at: "2026-06-30T00:00:03.000Z",
      candidate_ref: "memory/semantic/candidates/session-memory-proposal-r1-0.json",
      candidate_id: "memory_proposal_context",
      confirmation_required: true,
      execution_allowed: false,
      would_write: ["state"],
      safety_boundary: ["RAW_SAFETY_BOUNDARY_SHOULD_NOT_BE_IN_CONTEXT"],
      next_step: "Review before execution."
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_context.json", {
      id: "review_inbox_context",
      created_at: "2026-06-30T00:00:04.000Z",
      updated_at: "2026-06-30T00:00:05.000Z",
      status: "open",
      source: "review_tick",
      first_review_ref: "autonomy/reviews/background_review_1.json",
      latest_review_ref: "autonomy/reviews/raw-review-detail.md",
      proposal_id: "review_proposal_context",
      proposal_type: "sop_candidate",
      proposal_title: "Draft a context governance SOP",
      action_id: "follow_up_action_draft_sop_context",
      action_kind: "draft_sop",
      title: "Draft a context governance SOP",
      rationale: "Repeated evidence should become a local SOP candidate.",
      command: "RAW_COMMAND_SHOULD_NOT_BE_IN_CONTEXT",
      required_refs: ["autonomy/reviews/raw-review-detail.md"],
      would_write: ["state"],
      seen_count: 1,
      focus_action_chain: [{
        label: "inspect",
        effect: "read_only",
        reason: "Inspect bounded review refs before requesting confirmation."
      }, {
        label: "request_confirmation",
        effect: "state_decision",
        reason: "Request explicit confirmation before writing follow-up state."
      }]
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_context_duplicate.json", {
      id: "review_inbox_context_duplicate",
      created_at: "2026-06-30T00:00:04.000Z",
      updated_at: "2026-06-30T00:00:04.500Z",
      status: "open",
      source: "review_tick",
      first_review_ref: "autonomy/reviews/background_review_1.json",
      latest_review_ref: "autonomy/reviews/raw-review-detail.md",
      proposal_id: "review_proposal_context_duplicate",
      proposal_type: "sop_candidate",
      proposal_title: "Draft a context governance SOP",
      action_id: "follow_up_action_draft_sop_context_duplicate",
      action_kind: "draft_sop",
      title: "Draft a context governance SOP",
      rationale: "Repeated evidence should become a local SOP candidate.",
      command: "RAW_COMMAND_SHOULD_NOT_BE_IN_CONTEXT",
      required_refs: ["autonomy/reviews/raw-review-detail.md"],
      would_write: ["state"],
      seen_count: 1
    });
    await fixture.store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_context",
      item_id: "review_inbox_context",
      item_ref: "autonomy/inbox/review_inbox_context.json",
      action_kind: "draft_sop",
      status: "deferred",
      previous_status: "open",
      reason: "Keep the inbox item visible but lower priority during context assembly.",
      created_at: "2026-06-30T00:00:05.500Z"
    });
    await fixture.store.appendJsonl("autonomy/review-inbox-decisions.jsonl", {
      id: "review_inbox_decision_context_duplicate",
      item_id: "review_inbox_context_duplicate",
      item_ref: "autonomy/inbox/review_inbox_context_duplicate.json",
      action_kind: "draft_sop",
      status: "deferred",
      previous_status: "open",
      reason: "Duplicate of the primary context inbox item.",
      created_at: "2026-06-30T00:00:05.400Z"
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_context.json", {
      id: "follow_up_confirmation_context",
      created_at: "2026-06-30T00:00:06.000Z",
      status: "pending",
      source: "sop_evolution_chain",
      review_ref: "governance/evolution",
      proposal_id: "sop_context_gate",
      proposal_type: "sop_candidate",
      sop_id: "sop_context_gate",
      sop_ref: "sop/drafts/sop_context_gate.json",
      action_id: "follow_up_action_audit_sop_context",
      action_kind: "audit_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_audit_sop_context",
        kind: "audit_sop",
        title: "Audit a context governance SOP",
        rationale: "The SOP evolution chain has a draft SOP but no audit evidence yet.",
        command: "RAW_COMMAND_SHOULD_NOT_BE_IN_CONTEXT",
        required_refs: ["sop/drafts/sop_context_gate.json"],
        would_write: ["state"]
      },
      required_refs: ["sop/drafts/sop_context_gate.json"],
      would_write: ["state"],
      safety_boundary: ["RAW_CONFIRMATION_BOUNDARY_SHOULD_NOT_BE_IN_CONTEXT"],
      next_step: "Review before execution."
    });
    await fixture.store.appendJsonl("autonomy/sop-recovery-decisions.jsonl", {
      id: "sop_recovery_decision_context",
      confirmation_id: "follow_up_confirmation_context",
      confirmation_ref: "autonomy/followups/follow_up_confirmation_context.json",
      sop_id: "sop_context_gate",
      sop_ref: "sop/drafts/sop_context_gate.json",
      status: "deferred",
      previous_status: "none",
      gate_reason_code: "chain_not_found",
      gate_reason: "SOP evolution chain not found.",
      reason: "Waiting for the operator to inspect whether this stale gate is historical.",
      created_at: "2026-06-30T00:00:07.000Z"
    });
    await fixture.store.writeText("memory/episodes/archive-raw-detail.md", "RAW_ARCHIVE_DETAIL_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("memory/archives/2026-06-29.json", {
      version: 1,
      date: "2026-06-29",
      source_ref: "memory/episodes/events.jsonl",
      archive_ref: "memory/archives/2026-06-29.json",
      markdown_ref: "memory/archives/2026-06-29.md",
      created_at: "2026-06-30T00:00:00.000Z",
      event_count: 2,
      session_count: 1,
      kind_counts: { report: 2 },
      first_event_at: "2026-06-29T00:00:01.000Z",
      last_event_at: "2026-06-29T00:00:02.000Z",
      sessions: [{
        session_id: "session_archive_context",
        event_count: 2,
        kind_counts: { report: 2 },
        first_event_at: "2026-06-29T00:00:01.000Z",
        last_event_at: "2026-06-29T00:00:02.000Z",
        summaries: ["Archive captured Feishu runtime continuity."],
        artifact_refs: ["memory/episodes/archive-raw-detail.md"]
      }],
      recent_events: [{
        id: "evidence_archive_context",
        session_id: "session_archive_context",
        turn_id: "turn_archive",
        kind: "report",
        summary: "Daily archive summary should be visible without raw artifacts.",
        artifact_refs: ["memory/episodes/archive-raw-detail.md"],
        created_at: "2026-06-29T00:00:02.000Z"
      }]
    });
    await fixture.store.writeText("pipelines/pipeline_context/artifacts/intake.md", "RAW_PIPELINE_STAGE_OUTPUT_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("pipelines/pipeline_context/responses/intake-model-response-r1.json", "RAW_PIPELINE_MODEL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("pipelines/pipeline_context/pipeline.json", {
      id: "pipeline_context",
      task: "Stage context governance work without one long model turn.",
      source: "builtin",
      stages: [{
        id: "intake",
        title: "Intake",
        objective: "Normalize context governance work.",
        input_refs: [],
        expected_outputs: ["accepted-goal.md"],
        allowed_tools: ["file.read"],
        max_model_rounds: 1,
        max_tool_calls: 1,
        timeout_ms: 120000,
        acceptance_checks: ["Accepted goal is explicit."],
        on_failure: "block",
        side_effect_level: "local_write",
        optional: false
      }],
      side_effect_ceiling: "local_write",
      created_at: "2026-06-30T00:00:08.500Z"
    });
    await fixture.store.writeJson("pipelines/pipeline_context/stages/intake.json", {
      id: "stage_run_context_intake",
      pipeline_id: "pipeline_context",
      stage_id: "intake",
      status: "done",
      attempt: 1,
      evidence_refs: ["evidence_pipeline_context_intake"],
      output_refs: ["pipelines/pipeline_context/artifacts/intake.md"],
      model_response_refs: ["pipelines/pipeline_context/responses/intake-model-response-r1.json"],
      envelope_refs: ["pipelines/pipeline_context/responses/intake-model-action-r1.json"],
      failure_kind: null,
      failure_message: null,
      started_at: "2026-06-30T00:00:08.600Z",
      completed_at: "2026-06-30T00:00:08.700Z"
    });
    await fixture.store.writeJson("pipelines/pipeline_context/checkpoint.json", {
      run_id: "pipeline_run_context",
      pipeline_id: "pipeline_context",
      status: "done",
      blocked_stage_id: null,
      stage_run_refs: ["pipelines/pipeline_context/stages/intake.json"],
      evidence_refs: ["evidence_pipeline_context_intake"],
      final_response_ref: "pipelines/pipeline_context/artifacts/intake.md",
      updated_at: "2026-06-30T00:00:08.800Z"
    });

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const recallSection = rendered.manifest.sections.find((section) => section.title === "Episode Recall");
    const semanticMemorySection = rendered.manifest.sections.find((section) => section.title === "Semantic Memory");
    const dreamsSection = rendered.manifest.sections.find((section) => section.title === "Dreams");
    const scorecardSection = rendered.manifest.sections.find((section) => section.title === "Self-Evolution Scorecard");
    const iterationSection = rendered.manifest.sections.find((section) => section.title === "Self-Evolution Iteration");
    const serviceRuntimeSection = rendered.manifest.sections.find((section) => section.title === "Service Runtime");
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");
    const backgroundReviewSection = rendered.manifest.sections.find((section) => section.title === "Background Review History");
    const tickSection = rendered.manifest.sections.find((section) => section.title === "Review Tick History");
    const pipelineSection = rendered.manifest.sections.find((section) => section.title === "Pipeline History");
    const governanceSection = rendered.manifest.sections.find((section) => section.title === "Governance Queue");
    const archiveSection = rendered.manifest.sections.find((section) => section.title === "Episode Archives");

    assert.match(bundle, /Local runtime contract/);
    assert.match(bundle, /Authoritative query/);
    assert.match(bundle, /Service Runtime/);
    assert.match(bundle, /service_health: attention reasons=heartbeat_stale,deployment_stale followups=status,restart/);
    assert.match(bundle, /runtime_state: running/);
    assert.match(bundle, /heartbeat_freshness: stale/);
    assert.match(bundle, /review_tick: ok next=2026-06-30T00:30:02\.500Z inbox=2\/2 why=completed=1,executed=1/);
    assert.match(bundle, /review_tick_focus: covered_by_auto_action/);
    assert.match(bundle, /review_tick_auto: executed item=archive_health:archive_health_stale_2026_06_30 result=memory\/archives\/2026-06-30\.json summary=archive_refresh: healthy, remaining=0/);
    assert.match(bundle, /content_daily: ok enabled=true last=published effective=published count=2 strategy=1 blocked=1/);
    assert.match(bundle, /feedback_refresh: skipped enabled=true queue=2 due=0 next=2026-06-30T06:00:00\.000Z skip=non_mcp_capture_route:1/);
    assert.match(bundle, /feedback_strategy: suggestions=2 high=2 top=collect_more_feedback title=AI应用早报/);
    assert.match(bundle, /autonomy_pause_active: false/);
    assert.match(bundle, /runtime_commit: abcdef012345/);
    assert.match(bundle, /runtime_branch: develop/);
    assert.match(bundle, /runtime_dirty: false/);
    assert.match(bundle, /deployment_status: stale/);
    assert.match(bundle, /repo_commit: fedcba987654/);
    assert.match(bundle, /restart_command: pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main/);
    assert.doesNotMatch(bundle, /restart_command: .*--state-root <state-root>/);
    assert.match(bundle, /action_chain: inspect -> restart_service -> record_decision/);
    assert.match(bundle, /action_inspect: pnpm run runtime -- service health --target runtime \[read_only\]/);
    assert.match(bundle, /action_restart_service: pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main \[service_control\]/);
    assert.match(bundle, /Operator prefers explicit confirmation gates/);
    assert.match(bundle, /Use explicit candidate confirmation before accepting durable memory/);
    assert.match(bundle, /dream_context/);
    assert.match(bundle, /Core GA project design/);
    assert.match(bundle, /Self-Evolution Scorecard/);
    assert.match(bundle, /core_ga_design=active/);
    assert.match(bundle, /basic_runtime_substrate=attention/);
    assert.match(bundle, /general_agent_delegation=active/);
    assert.match(bundle, /Self-Evolution Iteration/);
    assert.match(bundle, /iteration_contract_context/);
    assert.match(bundle, /layer: core_runtime; owner: runtime_contract; slice: self_evolution_iteration_contract/);
    assert.match(bundle, /experts: architect,verification_reviewer,orchestration_planner/);
    assert.doesNotMatch(bundle, /gap_scorecard_general_agent_delegation_contract/);
    assert.match(bundle, /Opportunity Backlog/);
    assert.match(bundle, /Background Review History/);
    assert.match(bundle, /background_review_context/);
    assert.match(bundle, /proposal: sop_candidate\/review_proposal_context_report/);
    assert.match(bundle, /Inspect the context governance queue before requesting confirmation/);
    assert.match(bundle, /chain: inspect\/read_only -> request_confirmation\/state_decision/);
    assert.doesNotMatch(bundle, /RAW_BACKGROUND_REVIEW_ACTION_CHAIN_REASON_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.match(bundle, /Review Tick History/);
    assert.match(bundle, /review_tick_context/);
    assert.match(bundle, /focus_source: opportunity_backlog/);
    assert.match(bundle, /focus_opportunity: review_inbox:review_inbox_context/);
    assert.match(bundle, /inbox_refs: autonomy\/inbox\/review_inbox_context\.json/);
    assert.match(bundle, /Pipeline History/);
    assert.match(bundle, /pipeline_run_context/);
    assert.match(bundle, /pipeline_ref: pipelines\/pipeline_context\/pipeline\.json/);
    assert.match(bundle, /stages: 1 \(done=1\)/);
    assert.match(bundle, /Governance Queue/);
    assert.match(bundle, /memory_proposal_context/);
    assert.match(bundle, /memory_confirmation_context/);
    assert.match(bundle, /Draft a context governance SOP/);
    assert.match(bundle, /follow_up_confirmation_context/);
    assert.match(bundle, /source: sop_evolution_chain/);
    assert.match(bundle, /sop: sop_context_gate/);
    assert.match(bundle, /sop_ref: sop\/drafts\/sop_context_gate\.json/);
    assert.match(bundle, /sop_evolution_gate: stale/);
    assert.match(bundle, /gate_reason_code: chain_not_found/);
    assert.match(bundle, /SOP evolution chain not found/);
    assert.match(bundle, /review_inbox_decision: deferred/);
    assert.match(bundle, /review_inbox_decision_reason: Duplicate of the primary context inbox item/);
    assert.match(bundle, /review_inbox_duplicates: 1/);
    assert.match(bundle, /review_inbox_context_duplicate\.json/);
    assert.match(bundle, /focus_action_chain: inspect\[read_only\] -> request_confirmation\[state_decision\]/);
    assert.match(bundle, /recovery_decision: deferred/);
    assert.match(bundle, /recovery_decision_reason: Waiting for the operator to inspect whether this stale gate is historical/);
    assert.match(bundle, /recovery_decision_ref: autonomy\/sop-recovery-decisions\.jsonl#1/);
    assert.match(bundle, /Audit a context governance SOP/);
    assert.match(bundle, /Prior Feishu restart fixed heartbeat drift/);
    assert.match(bundle, /memory\/episodes\/prior-detail\.json/);
    assert.match(bundle, /Episode Archives/);
    assert.match(bundle, /Archive captured Feishu runtime continuity/);
    assert.match(bundle, /Daily archive summary should be visible without raw artifacts/);
    assert.doesNotMatch(bundle, /RAW_DETAIL_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_ARCHIVE_DETAIL_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_MEMORY_CANDIDATE_CONTENT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_BACKGROUND_REVIEW_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_BACKGROUND_REVIEW_RATIONALE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_REVIEW_DETAIL_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_TICK_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_TICK_INBOX_RATIONALE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_PIPELINE_STAGE_OUTPUT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_PIPELINE_MODEL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_COMMAND_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_CONFIRMATION_BOUNDARY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_DREAM_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.match(bundle, /file\.write_repo/);
    assert.match(bundle, /command\.run must declare side_effect_level/);
    assert.match(bundle, /respond\.payload\.markdown defaults to Simplified Chinese/);
    assert.equal(bundle.includes(JSON.stringify({
      type: "delegate_agent",
      rationale: "review",
      payload: getDelegateAgentPayloadExample()
    })), true);
    assert.doesNotMatch(bundle, /LOCAL_LEARNING/);
    assert.equal(bundle.length < 25200, true, `bundle length ${bundle.length}`);
    assert.equal(rendered.manifest.total_chars, bundle.length);
    assert.equal(rendered.manifest.recall.memory_hit_count, 1);
    assert.equal(rendered.manifest.recall.archive_ref_count, 1);
    assert.equal(rendered.manifest.recall.opportunity_ref_count, 5);
    assert.equal(rendered.manifest.recall.discipline_active, true);
    assert.equal(recallSection?.item_count, 1);
    assert.equal(backgroundReviewSection?.item_count, 1);
    assert.deepEqual(backgroundReviewSection?.refs, ["autonomy/reviews/background_review_context.json"]);
    assert.equal(tickSection?.item_count, 1);
    assert.deepEqual(tickSection?.refs, ["autonomy/ticks/review_tick_context.json"]);
    assert.equal(pipelineSection?.item_count, 1);
    assert.deepEqual(pipelineSection?.refs, [
      "pipelines/pipeline_context/pipeline.json",
      "pipelines/pipeline_context/checkpoint.json",
      "pipelines/pipeline_context/stages/intake.json",
      "pipelines/pipeline_context/artifacts/intake.md"
    ]);
    assert.deepEqual(recallSection?.refs, ["memory/episodes/prior-detail.json"]);
    assert.equal(archiveSection?.item_count, 1);
    assert.deepEqual(archiveSection?.refs, ["memory/archives/2026-06-29.json", "memory/archives/2026-06-29.md"]);
    assert.equal(semanticMemorySection?.item_count, 1);
    assert.deepEqual(semanticMemorySection?.refs, ["memory/semantic/accepted/semantic_memory_test.json"]);
    assert.equal(dreamsSection?.item_count, 1);
    assert.equal(scorecardSection?.item_count, 5);
    assert.equal(scorecardSection?.refs.includes("packages/core/src/self_evolution_scorecard.ts"), true);
    assert.equal(scorecardSection?.refs.includes("packages/runtime/src/runner.ts"), true);
    assert.deepEqual(dreamsSection?.refs, ["memory/dreams/dream_context.json"]);
    assert.equal(iterationSection?.item_count, 1);
    assert.deepEqual(iterationSection?.refs, [
      "self-evolution/iterations/iteration_contract_context.json",
      "packages/core/src/self_evolution_scorecard.ts"
    ]);
    assert.equal(serviceRuntimeSection?.item_count, 4);
    assert.deepEqual(serviceRuntimeSection?.refs, [
      "services/runtime/heartbeat.json",
      "services/runtime/review_tick.json",
      "services/runtime/content_daily.json",
      "services/runtime/content_feedback_refresh.json"
    ]);
    assert.equal(opportunitySection?.item_count, 5);
    assert.deepEqual([...(opportunitySection?.refs ?? [])].sort(), [
      "autonomy/followups/follow_up_confirmation_context.json",
      "autonomy/inbox/review_inbox_context.json",
      "memory/semantic/confirmations/memory_confirmation_context.json",
      "memory/semantic/candidates/session-memory-proposal-r1-0.json",
      "services/runtime/heartbeat.json"
    ].sort());
    assert.equal(governanceSection?.item_count, 4);
    assert.deepEqual(governanceSection?.refs, [
      "memory/semantic/candidates/session-memory-proposal-r1-0.json",
      "memory/semantic/confirmations/memory_confirmation_context.json",
      "autonomy/inbox/review_inbox_context.json",
      "autonomy/followups/follow_up_confirmation_context.json"
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("context scorecard exposes latest basic iteration status", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeJson("self-evolution/iterations/iteration_contract_context_basic.json", {
      schema_version: 1,
      id: "iteration_contract_context_basic",
      ref: "self-evolution/iterations/iteration_contract_context_basic.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Keep latest basic runtime substrate closure visible.",
      layer: "basic_entrypoint",
      owner_surface: "ga_project_design",
      proposed_slice: "basic_runtime_context_visibility",
      evidence_refs: ["packages/core/src/context.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["Do not claim completion before outcome."],
      advisory_expert_roles: ["runtime_operator", "verification_reviewer"],
      created_at: "2026-06-30T00:00:01.600Z",
      boundary: "bounded basic iteration contract only"
    });
    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check the basic iteration context line."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check the basic iteration context line."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    assert.match(rendered.markdown, /latest_basic_iteration=iteration_contract_context_basic;status=not_recorded;ref=self-evolution\/iterations\/iteration_contract_context_basic\.json/);
  } finally {
    await fixture.cleanup();
  }
});

test("context marks dream lineage stale when a newer verified outcome exists", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeJson("memory/dreams/dream_stale_context.json", {
      schema_version: 1,
      id: "dream_stale_context",
      action_type: "dream_snapshot",
      status: "active",
      title: "Stale direction",
      summary: "This direction predates the latest verified outcome.",
      created_at: "2026-06-30T00:00:01.000Z",
      source_refs: [],
      semantic_memory_refs: [],
      backlog_refs: [],
      axes: [{
        id: "core_ga_design",
        title: "Core GA project design",
        status: "active",
        summary: "Keep the core direction bounded.",
        evidence_refs: [],
        next_moves: []
      }],
      horizons: [],
      non_goals: [],
      boundary: "bounded stale dream fixture"
    });
    await fixture.store.writeJson("self-evolution/iterations/iteration_contract_newer_verified.json", {
      schema_version: 1,
      id: "iteration_contract_newer_verified",
      ref: "self-evolution/iterations/iteration_contract_newer_verified.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "A verified outcome newer than the dream.",
      layer: "local_learning",
      owner_surface: "dream_snapshots",
      proposed_slice: "dream_freshness",
      evidence_refs: [],
      verification_commands: ["pnpm run check"],
      non_goals: [],
      advisory_expert_roles: ["learning_curator", "verification_reviewer"],
      outcome: {
        status: "verified",
        summary: "The newer direction source is verified.",
        evidence_refs: [],
        verification_commands: ["pnpm run check"],
        next_moves: ["Refresh the dream explicitly."],
        recorded_at: "2026-06-30T00:00:03.000Z",
        boundary: "bounded outcome"
      },
      created_at: "2026-06-30T00:00:02.000Z",
      boundary: "bounded iteration"
    });
    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Inspect dream freshness."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Inspect dream freshness."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);

    assert.match(rendered.markdown, /dream_stale_context/);
    assert.match(rendered.markdown, /lineage: stale/);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle includes bounded GA project design plan", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeJson("self-evolution/iterations/iteration_contract_context_plan.json", {
      schema_version: 1,
      id: "iteration_contract_context_plan",
      ref: "self-evolution/iterations/iteration_contract_context_plan.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Verified core slice should become a bounded GA planning packet in context.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "context_ga_project_design_plan",
      implementation_contract: {
        proposed_slice: "context_ga_project_design_plan",
        source_artifact_id: "manual_context_fixture",
        source_proposed_slice: "manual_context_source",
        selected_layer: "core_runtime",
        owner_surface: "ga_project_design",
        improvement_type: "reusable_ga_design_contract",
        implementation_scope: ["change one reusable GA project-design contract or read-model surface"],
        deferred_scope: ["no external adapter or tool integration unless it names a reusable runtime contract"],
        delivery_standard: ["future iterations can inspect the contract without inferring intent from the opaque slice id"],
        boundary: "bounded context fixture contract"
      },
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["Do not execute the plan."],
      advisory_expert_roles: ["architect", "verification_reviewer", "orchestration_planner"],
      outcome: {
        status: "verified",
        summary: "Context can use this verified core iteration as a GA design planning artifact.",
        evidence_refs: ["tests/context_harness.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: [
          "Commit and restart runtime after this slice.",
          "Use the artifact as a bounded core/basic planning packet; treat iteration_contract_context_stale as separate governance cleanup.",
          "Continue context source candidate without treating stale cleanup as completion proof.",
          "Keep source next move candidates visible in context."
        ],
        recorded_at: "2026-06-30T00:00:01.800Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-06-30T00:00:01.700Z",
      boundary: "bounded iteration contract only"
    });
    await fixture.store.writeJson("self-evolution/iterations/iteration_contract_context_stale.json", {
      schema_version: 1,
      id: "iteration_contract_context_stale",
      ref: "self-evolution/iterations/iteration_contract_context_stale.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older open GA iteration should stay context cleanup only.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "core_ga_design_next_slice_after_context_stale",
      source_ref: "self-evolution/iterations/iteration_contract_previous.json",
      evidence_refs: ["self-evolution/iterations/iteration_contract_previous.json"],
      verification_commands: ["pnpm run check"],
      non_goals: ["Do not prove completion."],
      advisory_expert_roles: ["architect", "verification_reviewer", "orchestration_planner"],
      created_at: "2026-06-30T00:00:01.600Z",
      boundary: "bounded iteration contract only"
    });
    await fixture.store.writeJson("self-evolution/iterations/iteration_contract_context_unrelated.json", {
      schema_version: 1,
      id: "iteration_contract_context_unrelated",
      ref: "self-evolution/iterations/iteration_contract_context_unrelated.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Older unrelated GA iteration should not become cleanup.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "core_ga_design_next_slice_after_context_unrelated",
      source_ref: "self-evolution/iterations/iteration_contract_unrelated.json",
      evidence_refs: ["self-evolution/iterations/iteration_contract_unrelated.json"],
      verification_commands: ["pnpm run check"],
      non_goals: ["Do not prove completion."],
      advisory_expert_roles: ["architect", "verification_reviewer", "orchestration_planner"],
      created_at: "2026-06-30T00:00:01.500Z",
      boundary: "bounded iteration contract only"
    });
    await fixture.store.writeJson("self-evolution/iterations/iteration_contract_context_open.json", {
      schema_version: 1,
      id: "iteration_contract_context_open",
      ref: "self-evolution/iterations/iteration_contract_context_open.json",
      kind: "self_evolution_iteration_contract",
      status: "recorded",
      summary: "Open successor should be inspected from context instead of recorded again.",
      layer: "core_runtime",
      owner_surface: "ga_project_design",
      proposed_slice: "general_agent_delegation_hardening_after_context_plan",
      source_ref: "self-evolution/iterations/iteration_contract_context_plan.json",
      evidence_refs: ["self-evolution/iterations/iteration_contract_context_plan.json"],
      verification_commands: ["pnpm run check"],
      non_goals: ["Do not prove completion."],
      advisory_expert_roles: ["architect", "verification_reviewer", "orchestration_planner"],
      created_at: "2026-06-30T00:00:01.900Z",
      boundary: "bounded iteration contract only"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Continue core self-evolution."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Continue core self-evolution."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const section = rendered.manifest.sections.find((item) => item.title === "GA Project Design Plan");

    assert.match(rendered.markdown, /GA Project Design Plan/);
    assert.match(rendered.markdown, /plan: ga_design_plan_ga_design_artifact_iteration_contract_context_plan/);
    assert.match(rendered.markdown, /layer: core_runtime; owner: ga_project_design; slice: general_agent_delegation_hardening_after_context_plan/);
    assert.match(rendered.markdown, /source_truth: source_kind=verified_artifact; artifact=ga_design_artifact_iteration_contract_context_plan; ref=self-evolution\/iterations\/iteration_contract_context_plan\.json; source_slice=context_ga_project_design_plan; target_slice=general_agent_delegation_hardening_after_context_plan; status=verified; quality=attention; fresh_successor=true/);
    assert.match(rendered.markdown, /source_continuation: source=core_runtime\/ga_project_design; completed=context_ga_project_design_plan; contract=core_runtime\/ga_project_design\/context_ga_project_design_plan; candidates=3; candidate=Continue context source candidate/);
    assert.doesNotMatch(rendered.markdown, /Commit and restart runtime/);
    assert.match(rendered.markdown, /goal_scope: objective=Continue self-evolution through core\/basic GA project-design capability gains before SOP, skill, memory, or dream promotion\.; owner=ga_project_design; source=operator_objective=core_basic_self_evolution_first\|source_artifact=ga_design_artifact_iteration_contract_context_plan; success=fresh_successor_slice=true; source_slice=context_ga_project_design_plan; target_slice=general_agent_delegation_hardening_after_context_plan/);
    assert.match(rendered.markdown, /implementation_contract: type=reusable_ga_design_contract; delegation=delegate_agent:task_context>result>trace_replay>main_harness_completion; scope=change one reusable GA project-design contract or read-model surface; defer=no external adapter or tool integration unless it names a reusable runtime contract; deliver=future iterations can inspect the contract without inferring intent from the opaque slice id/);
    assert.match(rendered.markdown, /planning_basis: Use ga_design_artifact_iteration_contract_context_plan as evidence, then choose a new core\/basic slice instead of repeating completed slice context_ga_project_design_plan\./);
    assert.match(rendered.markdown, /focus: Clarify the next core\/basic GA design improvement before implementation\./);
    assert.match(rendered.markdown, /focus_next: inspect the current project-design plan and matching open iteration/);
    assert.match(rendered.markdown, /anti_drift: do not infer core identity from external adapter or MCP pressure \| do not promote SOP, skill, memory, or dream artifacts before verified core\/basic reuse evidence exists \| do not claim completion until outcome verification commands cover the required project-design checks/);
    assert.match(rendered.markdown, /non_goals: does not promote one-off external adapter behavior into core identity \| no external-tool execution \| no automatic SOP, skill, memory, or dream promotion \| no completion proof without executed verification/);
    assert.match(rendered.markdown, /capability_stage: core=goal_intake:active,capability_layering:active,contract_design:hardening,verification_review:active; basic=execution_plan:active,runtime_observability:attention_guard/);
    assert.match(rendered.markdown, /runtime_guard: stage=attention_guard; current=Resident service health is the basic guard that keeps runtime attention visible before a core\/basic outcome is reused.; next=Name runtime attention reasons explicitly instead of hiding them behind application progress.; exit=runtime attention reasons are named in the outcome instead of being treated as application progress/);
    assert.match(rendered.markdown, /stage_exit: core=goal_intake=the next slice cites the latest operator objective, a verified source artifact, or a fresh bootstrap source,capability_layering=core\/basic\/local-learning\/application layer is explicit before implementation,contract_design=one reusable GA design contract improvement is implemented,verification_review=iteration audit reports covered plan refs; basic=execution_plan=targeted project-design and iteration audit checks run before the broad check,runtime_observability=service health is inspected for the resident runtime target/);
    assert.match(rendered.markdown, /stage_next: core_runtime\[goal_scope\]: continue general_agent_delegation_hardening_after_context_plan as a ga_project_design hardening slice/);
    assert.match(rendered.markdown, /delegation_loop: .*replay=.*delegated_recovery_guidance.*metadata=.*result_ref; proof=Live Run Trace exposes safe delegated dispatch metadata/);
    assert.match(rendered.markdown, /governance_cleanup: superseded_open_iterations=1; iteration_contract_context_stale:partial/);
    assert.match(rendered.markdown, /phase_forbid: goal_intake=do not treat previous intent as current evidence; capability_layering=do not promote Nasdaq, Xiaohongshu MCP, browser automation, or one adapter into core identity by default; contract_design=do not add provider-specific glue when a runtime contract is the real missing piece; execution_plan=do not use a narrow test to support a broader claim; verification_review=do not let model reasoning replace executed verification; learning_persistence=do not promote one-off application behavior to skill or semantic memory/);
    assert.match(rendered.markdown, /scorecard_basis: next_core_basic_slice=next_slice_core_ga_design \| plan_target_slice=next_slice_general_agent_delegation/);
    assert.match(rendered.markdown, /layer_decision: recurring_ga_project_design; external tools and adapters stay application slices unless a reusable runtime contract is named; SOP, skill, memory, and dream promotion follows only after core\/basic evidence supports reuse; expert and multi-agent scheduling follow after the general delegation loop is stable/);
    assert.match(rendered.markdown, /layer_guard: stage=needs_attention; source=core_runtime\/ga_project_design; selected=core_runtime\/ga_project_design/);
    assert.match(rendered.markdown, /learning_authority: process=self-evolution SOPs and skills may preserve repeatable workflow after verified evidence recurs; judgment=core\/basic layer selection stays with ga_project_design, scorecard, iteration contract, and current runtime evidence; completion=completion stays with verified iteration outcome plus completion_gate coverage, not SOP text, selected-skill recall, dream snapshots, or expert advice; promotion=SOP drafting, audit, promotion, semantic memory, dream refresh, and skill reuse remain later local-learning gates/);
    assert.match(rendered.markdown, /selection: needs_attention; source_kind=verified_artifact \| source_status=verified \| source_artifact_quality=attention/);
    assert.match(rendered.markdown, /checks: source_artifact_verified=verified/);
    assert.match(rendered.markdown, /source_artifact_warning_thresholds=evidence_refs:2; verification_commands:2/);
    assert.match(rendered.markdown, /successor: fresh_successor_slice=true; source_slice=context_ga_project_design_plan; target_slice=general_agent_delegation_hardening_after_context_plan/);
    assert.match(rendered.markdown, /target: target_layer=core_runtime; owner_surface=ga_project_design/);
    assert.match(rendered.markdown, /verify: verification_entrypoints=project-design,scorecard,iterations,service-health,check/);
    assert.match(rendered.markdown, /verify_commands: project-design=ga_design_artifact_iteration_contract_context_plan \| scorecard \| iterations=iteration_contract_context_open;audit=all \| service-health=runtime \| check/);
    assert.match(rendered.markdown, /iteration_record_status: open_iteration_available; iteration_contract_context_open; contract=missing/);
    assert.match(rendered.markdown, /review_gate: blocked; blockers=outcome_record,outcome_verification_command_coverage,outcome_verification_claim_coverage; required=project-design,scorecard,iterations,service-health,check; required_coverage=verified_outcome,outcome_evidence_refs,plan_ref_coverage,implementation_contract_coverage,outcome_verification_command_coverage,outcome_verification_claim_coverage,runtime_attention_outcome_coverage,workspace_outcome_coverage; outcome_status=not_recorded/);
    assert.match(rendered.markdown, /audit_command: pnpm run runtime -- governance iterations --iteration iteration_contract_context_open --audit-seed all --state-root <state-root>/);
    assert.match(rendered.markdown, /after_verify: pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_context_open --outcome-status verified --summary "\.\.\." --evidence-ref <ref\.\.\.> --verification-command "<command\.\.\.>" --verification-claim "<entrypoint>: <claim>" --next-move "\.\.\." --state-root <state-root>/);
    assert.match(rendered.markdown, /evidence_basis: packages\/core\/src\/ga_project_design\.ts \| packages\/core\/src\/action_contracts\.ts \| packages\/core\/src\/delegate_agent_completion_gate\.ts \| packages\/core\/src\/delegate_agent_contract\.ts \| packages\/core\/src\/schemas\.ts \| packages\/runtime\/src\/runner\.ts/);
    assert.match(rendered.markdown, /proof_boundary: evidence_basis=candidate_refs_only; require=verified_outcome,outcome_evidence_refs,plan_ref_coverage,implementation_contract_coverage,outcome_verification_command_coverage,outcome_verification_claim_coverage,runtime_attention_outcome_coverage,workspace_outcome_coverage/);
    assert.match(rendered.markdown, /audit: goal_scope,current_state,verification_scope,learning_persistence/);
    assert.match(rendered.markdown, /audit_require: goal_scope=Preserve the latest operator objective and do not redefine success around completed work.; current_state=Use current worktree and runtime state, classify runtime attention, and name the handling policy before trusting older memory or prior summaries.; verification_scope=Match verification evidence to the scope of the completion claim.; learning_persistence=Record the verified outcome before reusing the slice as future GA design evidence./);
    assert.match(rendered.markdown, /audit_evidence: goal_scope=proposed_slice=general_agent_delegation_hardening_after_context_plan; current_state=service health status and reasons when service health is a required verification command; verification_scope=outcome maps each required verification entrypoint to a completion claim; learning_persistence=record-iteration-outcome ref/);
    assert.match(rendered.markdown, /audit_reject: goal_scope=success criteria only describe the completed source artifact; current_state=service health is a required verification command but the outcome omits service health status or reasons; verification_scope=a required verification entrypoint is omitted from outcome claim coverage; learning_persistence=dream, SOP, skill, or memory artifacts are treated as completion proof/);
    assert.match(rendered.markdown, /acceptance: goal_scope: operator goal is restated with owner surface, source of truth, and success evidence \| current_state: capability layer stays core_runtime or basic_entrypoint before implementation \| verification_scope: verification commands are scoped to the slice and required entrypoints are covered by completion claims \| learning_persistence: outcome is recorded before reuse \| goal_scope: the next proposed slice is selected from current goal and scorecard evidence instead of copied from the source artifact \| current_state: external adapters remain application slices unless a reusable runtime contract is named/);
    assert.match(rendered.markdown, /next_command: pnpm run runtime -- governance iterations --iteration iteration_contract_context_open --state-root <state-root>/);
    assert.doesNotMatch(rendered.markdown, /bounded outcome record/);
    assert.equal(section?.item_count, 1);
    assert.equal(section?.refs.includes("packages/core/src/ga_project_design.ts"), true);
    assert.equal(section?.refs.includes("packages/core/src/action_contracts.ts"), true);
    assert.equal(section?.refs.includes("packages/core/src/delegate_agent_completion_gate.ts"), true);
    assert.equal(section?.refs.includes("packages/core/src/delegate_agent_contract.ts"), true);
    assert.equal(section?.refs.includes("packages/core/src/schemas.ts"), true);
    assert.equal(section?.refs.includes("packages/runtime/src/runner.ts"), true);
    assert.equal(section?.refs.includes("packages/core/src/harness_replay.ts"), true);
    assert.equal(section?.refs.includes("self-evolution/iterations/iteration_contract_context_plan.json"), true);
    assert.equal(section?.refs.includes("self-evolution/iterations/iteration_contract_context_open.json"), true);
    assert.equal(section?.refs.includes("self-evolution/iterations/iteration_contract_context_stale.json"), false);
    assert.equal(section?.refs.includes("self-evolution/iterations/iteration_contract_context_unrelated.json"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle includes bounded local capability catalog", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "你现在有哪些能力？"
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "你现在有哪些能力？"
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const section = rendered.manifest.sections.find((item) => item.title === "Capability Catalog");
    const catalog = getCapabilityCatalog();

    assert.equal(section?.item_count, catalog.count);
    assert.equal(section?.refs.includes("packages/core/src/capabilities.ts"), true);
    assert.match(rendered.markdown, /## Capability Catalog/);
    assert.match(rendered.markdown, /count: \d+/);
    assert.match(rendered.markdown, /Core tools/);
    assert.match(rendered.markdown, /file\.read/);
    assert.match(rendered.markdown, /Harness actions/);
    assert.match(rendered.markdown, /ga\.project_design_contract/);
    assert.match(rendered.markdown, /expert\.orchestration_contract\[boundary\]/);
    assert.match(rendered.markdown, /sop\.evolution/);
    assert.match(rendered.markdown, /self_evolution\.scorecard\[core_runtime\]/);
    assert.match(rendered.markdown, /Resident local service/);
    assert.match(rendered.markdown, /local-only read model/);
    assert.match(rendered.markdown, /no extra authority/);
    assert.match(rendered.markdown, /\[boundary\]=advisory/);
    assert.doesNotMatch(rendered.markdown, /api_key/);
    assert.doesNotMatch(rendered.markdown, /app_secret/);
    assert.doesNotMatch(rendered.markdown, /allowed_inputs/);
    assert.doesNotMatch(rendered.markdown, /forbidden_authority/);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle includes bounded workspace status without file bodies", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await initGitFixture(fixture.repoRoot);
    await runGit(fixture.repoRoot, ["add", "core/soul.md", "core/memory.md", "docs/RUNTIME_CONTRACT.md", "memory/index.md"]);
    await runGit(fixture.repoRoot, ["commit", "-m", "initial context fixture"]);
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Updated local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "local-secret.txt", "RAW_WORKSPACE_CONTEXT_BODY_SHOULD_NOT_APPEAR");

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check workspace state before editing."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check workspace state before editing."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const section = rendered.manifest.sections.find((item) => item.title === "Workspace Status");

    assert.match(rendered.markdown, /## Workspace Status/);
    assert.match(rendered.markdown, /workspace_status: dirty/);
    assert.match(rendered.markdown, /changed_files: 2/);
    assert.match(rendered.markdown, /unstaged: 1/);
    assert.match(rendered.markdown, /untracked: 1/);
    assert.match(rendered.markdown, /docs\/RUNTIME_CONTRACT\.md/);
    assert.match(rendered.markdown, /local-secret\.txt/);
    assert.match(rendered.markdown, /pre-write orientation only/);
    assert.match(rendered.markdown, /git status --porcelain=v1 -b/);
    assert.doesNotMatch(rendered.markdown, /RAW_WORKSPACE_CONTEXT_BODY_SHOULD_NOT_APPEAR/);
    assert.equal(section?.item_count, 2);
    assert.deepEqual([...(section?.refs ?? [])].sort(), [
      "docs/RUNTIME_CONTRACT.md",
      "local-secret.txt",
      "packages/core/src/workspace_status.ts"
    ].sort());
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle includes bounded runtime config summary without secrets", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check runtime config context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check runtime config context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot, {
      runtimeConfig: {
        runtime: {
          promotion_enabled: true,
          structured_output: true,
          review_tick_enabled: false,
          review_tick_interval_ms: 1800000,
          review_tick_limit: 20,
          content_daily_enabled: false,
          content_daily_interval_ms: 3600000,
          content_daily_dry_run: true,
          content_daily_preflight: false,
          content_daily_topic: "daily AI news and AI stock hotspots",
          content_daily_source_urls: [],
          content_daily_tickers: [],
          content_daily_publish_enabled: false,
          content_daily_external_write_confirmed: false,
          content_daily_publish_adapter: "xiaohongshu-mcp",
          content_daily_publish_server_url: "http://localhost:18060/mcp",
          content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: false,
      content_creator_metrics_interval_ms: 60 * 60 * 1000,
      content_creator_metrics_limit: 10,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "runtime-creator-metrics",
      content_creator_metrics_browser_auto_connect: false,
          source_ref: "repo:config.jsonl#4",
          defaulted_fields: [
            "review_tick_enabled",
            "review_tick_interval_ms",
            "review_tick_limit",
            "content_daily_enabled",
            "content_daily_interval_ms",
            "content_daily_dry_run",
            "content_daily_preflight",
            "content_daily_topic",
            "content_daily_source_urls",
            "content_daily_tickers",
            "content_daily_image_model",
            "content_daily_publish_enabled",
            "content_daily_external_write_confirmed",
            "content_daily_publish_adapter",
            "content_daily_publish_server_url",
            "content_daily_publish_tool",
            "content_feedback_refresh_enabled",
            "content_feedback_refresh_interval_ms",
            "content_feedback_refresh_limit",
            "content_feedback_refresh_min_follow_up_age_ms",
            "content_feedback_refresh_server_url",
            "content_creator_metrics_enabled",
            "content_creator_metrics_interval_ms",
            "content_creator_metrics_limit",
            "content_creator_metrics_creator_url",
            "content_creator_metrics_browser_session_name",
            "content_creator_metrics_browser_auto_connect",
            "content_creator_metrics_browser_cdp_port"
          ]
        },
        active_model: {
          id: "local-model",
          provider: "openai-compatible",
          api: "responses",
          model: "gpt-test",
          base_url: "https://api.example.test/v1",
          auth_id: "model-auth",
          context_window_tokens: 32000,
          max_output_tokens: 2400,
          context_budget: {
            source: "model_config",
            model_id: "local-model",
            model: "gpt-test",
            source_ref: "home:models.jsonl#1",
            context_window_tokens: 32000,
            reserved_output_tokens: 2400,
            estimated_input_budget_tokens: 29600,
            chars_per_token: 4,
            total_soft_limit_chars: 94720,
            total_hard_limit_chars: 112480,
            soft_threshold: 0.8,
            hard_threshold: 0.95,
            warning: null
          },
          selector_ref: "home:config.jsonl#1",
          source_ref: "home:models.jsonl#1"
        },
        active_channel: {
          id: "feishu-main",
          kind: "feishu",
          transport: "websocket",
          mode: "private_chat",
          auth_id: "feishu-auth",
          selector_ref: "home:config.jsonl#2",
          source_ref: "home:settings.jsonl#1"
        },
        active_scenario: {
          id: "im-default",
          model_id: "local-model",
          discipline: "query_todo",
          concurrency: "per_sender",
          selector_ref: "home:config.jsonl#3",
          source_ref: "home:settings.jsonl#2"
        },
        vault: {
          mode: "user",
          active_root: "/home/user/.local-runtime/vault",
          seed_roots: ["vault", "skills"],
          source_ref: "repo:config.jsonl#3"
        },
        refs: [
          "repo:config.jsonl#4",
          "home:config.jsonl#1",
          "home:models.jsonl#1",
          "home:settings.jsonl#1"
        ],
        restart_guidance: "Restart service after changing runtime review_tick settings.",
        boundary: "read-only runtime config summary; never reads auth records"
      }
    });

    const section = rendered.manifest.sections.find((item) => item.title === "Runtime Config");
    assert.match(rendered.markdown, /## Runtime Config/);
    assert.match(rendered.markdown, /active_model: local-model/);
    assert.match(rendered.markdown, /model_auth_id: model-auth/);
    assert.match(rendered.markdown, /model_context_window_tokens: 32000/);
    assert.match(rendered.markdown, /model_input_budget_tokens: 29600/);
    assert.equal(rendered.manifest.context_budget?.estimated_input_budget_tokens, 29600);
    assert.match(rendered.markdown, /active_channel: feishu-main/);
    assert.match(rendered.markdown, /review_tick_enabled: false/);
    assert.match(rendered.markdown, /content_daily_enabled: false/);
    assert.match(rendered.markdown, /content_daily_publish_enabled: false/);
    assert.match(rendered.markdown, /content_feedback_refresh_enabled: false/);
    assert.match(rendered.markdown, /content_daily_publish_adapter: xiaohongshu-mcp/);
    assert.match(rendered.markdown, /runtime_defaulted_fields: review_tick_enabled,review_tick_interval_ms,review_tick_limit,content_daily_enabled,content_daily_interval_ms,content_daily_dry_run,content_daily_preflight,content_daily_topic,content_daily_source_urls,content_daily_tickers,content_daily_image_model,content_daily_publish_enabled,content_daily_external_write_confirmed,content_daily_publish_adapter,content_daily_publish_server_url,content_daily_publish_tool,content_feedback_refresh_enabled,content_feedback_refresh_interval_ms,content_feedback_refresh_limit,content_feedback_refresh_min_follow_up_age_ms,content_feedback_refresh_server_url,content_creator_metrics_enabled,content_creator_metrics_interval_ms,content_creator_metrics_limit,content_creator_metrics_creator_url,content_creator_metrics_browser_session_name,content_creator_metrics_browser_auto_connect,content_creator_metrics_browser_cdp_port/);
    assert.match(rendered.markdown, /restart_guidance: Restart service after changing runtime review_tick settings\./);
    assert.doesNotMatch(rendered.markdown, /API_SECRET_VALUE/);
    assert.equal(section?.item_count, 4);
    assert.deepEqual(section?.refs, [
      "repo:config.jsonl#4",
      "home:config.jsonl#1",
      "home:models.jsonl#1",
      "home:settings.jsonl#1"
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle includes bounded live run trace without raw artifacts", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const priorSession = "session_live_trace_context";
    const priorTurn = "turn_live_trace_context";
    await fixture.store.writeText(`memory/episodes/${priorSession}-context.md`, "RAW_PRIOR_CONTEXT_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson(`memory/episodes/${priorSession}-context.json`, {
      version: 1,
      created_at: "2026-06-30T00:19:00.000Z",
      session_id: priorSession,
      turn_id: priorTurn,
      total_chars: 999,
      section_count: 0,
      sections: [],
      recall: {
        memory_hit_count: 0,
        memory_refs: [],
        skill_ref_count: 0,
        skill_refs: [],
        archive_ref_count: 0,
        archive_refs: [],
        opportunity_ref_count: 0,
        opportunity_refs: [],
        discipline_active: false
      }
    });
    await fixture.store.writeText(
      `memory/episodes/${priorSession}-model-response-r1.json`,
      "RAW_MODEL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT"
    );
    await fixture.store.writeJson(`memory/episodes/${priorSession}-model-action-r1.json`, {
      summary: "First round records bounded evidence and requests one tool.",
      actions: [
        {
          type: "record_evidence",
          rationale: "Capture the trace checkpoint.",
          payload: {
            markdown: "RAW_HARNESS_PAYLOAD_SHOULD_NOT_BE_IN_CONTEXT"
          }
        },
        {
          type: "use_tool",
          rationale: "Read bounded state metadata.",
          payload: {
            tool: "file.read",
            path: "RAW_TOOL_PAYLOAD_SHOULD_NOT_BE_IN_CONTEXT"
          }
        },
        {
          id: "action_delegate_trace_context",
          type: "delegate_agent",
          rationale: "Request bounded trace critique.",
          payload: {
            task: "Critique live trace delegated lineage metadata.",
            context: "No tool, write, or mutation authority is available; completion remains with the main harness; output shape is summary/findings_text; use only explicit payload context or named evidence refs."
          }
        }
      ],
      completion_claim: {
        status: "not_done",
        verification_refs: []
      }
    });
    await fixture.store.writeJson(`memory/episodes/${priorSession}-model-action-r2.json`, {
      summary: "Second round responds with a verified summary.",
      actions: [{
        type: "respond",
        rationale: "Return result.",
        payload: {
          markdown: "RAW_RESPOND_PAYLOAD_SHOULD_NOT_BE_IN_CONTEXT"
        }
      }],
      completion_claim: {
        status: "done",
        verification_refs: []
      }
    });
    await fixture.store.writeText(
      `memory/episodes/${priorSession}-tool_result_read.json`,
      "RAW_TOOL_RESULT_SHOULD_NOT_BE_IN_CONTEXT"
    );
    await fixture.store.writeText(
      `memory/episodes/${priorSession}-record-evidence-r1-1.md`,
      "RAW_HARNESS_ARTIFACT_SHOULD_NOT_BE_IN_CONTEXT"
    );
    await fixture.store.writeJson(`memory/episodes/${priorSession}-delegated_result_invalid.json`, {
      id: "delegated_result_invalid",
      ok: false,
      summary: "Delegated result failed contract: invalid JSON.",
      action_id: "action_delegate_trace_context",
      round: 1,
      sequence: 1,
      task_chars: 44,
      context_chars: 88,
      input_contract_valid: null,
      input_contract_valid_present: false,
      input_digest: null,
      input_digest_present: false,
      metadata_present: true,
      model_invoked: true,
      contract_status: "failed",
      task: "RAW_DELEGATED_TASK_SHOULD_NOT_BE_IN_CONTEXT",
      findings_text: "RAW_DELEGATED_FINDINGS_SHOULD_NOT_BE_IN_CONTEXT",
      output_text: "RAW_DELEGATED_OUTPUT_SHOULD_NOT_BE_IN_CONTEXT",
      raw_output_preview: "RAW_DELEGATED_RESULT_SHOULD_NOT_BE_IN_CONTEXT",
      created_at: "2026-06-30T00:19:03.500Z"
    });
    await fixture.store.writeText(
      `memory/episodes/${priorSession}-final-response.md`,
      "RAW_FINAL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT"
    );
    await fixture.store.writeJson(`memory/episodes/${priorSession}-completion-verification.json`, {
      id: "completion_verification_trace_context",
      session_id: priorSession,
      turn_id: priorTurn,
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      summary: "Completion verification passed with final response and successful read evidence.",
      envelope_ref: `memory/episodes/${priorSession}-model-action-r2.json`,
      final_response_ref: `memory/episodes/${priorSession}-final-response.md`,
      claimed_verification_refs: [],
      observation_refs: [
        `memory/episodes/${priorSession}-tool_result_read.json`,
        `memory/episodes/${priorSession}-delegated_result_invalid.json`,
        `memory/episodes/${priorSession}-record-evidence-r1-1.md`
      ],
      delegated_result_refs: [
        `memory/episodes/${priorSession}-delegated_result_invalid.json`
      ],
      delegated_result_failure_kinds: [
        {
          result_failure_kind: "delegated_output_contract_failed",
          count: 1
        }
      ],
      checks: [{
        id: "final_response",
        status: "pass",
        summary: "Done claim has a persisted final response artifact.",
        refs: [`memory/episodes/${priorSession}-final-response.md`]
      }, {
        id: "delegated_self_report_refs",
        status: "pass",
        summary: "Delegated self-report refs were rejected as completion proof.",
        refs: [`memory/episodes/${priorSession}-delegated_result_invalid.json`]
      }, {
        id: "delegated_independent_evidence",
        status: "fail",
        summary: "Done claim after delegation lacks later non-delegated verification refs.",
        refs: []
      }, {
        id: "delegated_results",
        status: "fail",
        summary: "Failed delegated result(s): 9.",
        refs: ["delegated_result_invalid"]
      }],
      created_at: "2026-06-30T00:20:00.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_prompt",
      session_id: priorSession,
      turn_id: priorTurn,
      kind: "prompt",
      summary: "Accepted trace test task.",
      artifact_refs: [
        `memory/episodes/${priorSession}-context.md`,
        `memory/episodes/${priorSession}-context.json`
      ],
      created_at: "2026-06-30T00:19:00.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_model_r1",
      session_id: priorSession,
      turn_id: priorTurn,
      kind: "model_action",
      summary: "First round records bounded evidence and requests one tool.",
      artifact_refs: [
        `memory/episodes/${priorSession}-model-response-r1.json`,
        `memory/episodes/${priorSession}-model-action-r1.json`
      ],
      created_at: "2026-06-30T00:19:01.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_harness",
      session_id: priorSession,
      turn_id: priorTurn,
      kind: "report",
      summary: "Recorded model evidence note: trace checkpoint",
      artifact_refs: [`memory/episodes/${priorSession}-record-evidence-r1-1.md`],
      created_at: "2026-06-30T00:19:02.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_tool",
      session_id: priorSession,
      turn_id: priorTurn,
      kind: "tool_result",
      summary: "Wrote repo:docs/generated.md (42 bytes). workspace_guard: before=dirty after=dirty changed_files=1->2 delta=1 preexisting_dirty=true target_changed=true.",
      artifact_refs: [`memory/episodes/${priorSession}-tool_result_read.json`],
      created_at: "2026-06-30T00:19:03.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_delegated",
      session_id: priorSession,
      turn_id: priorTurn,
      kind: "delegated_result",
      summary: "Delegated result metadata is stored in delegated_dispatch for this fixture.",
      artifact_refs: [`memory/episodes/${priorSession}-delegated_result_invalid.json`],
      delegated_dispatch: {
        action_id: "action_delegate_trace_context",
        result_id: "delegated_result_trace_context_invalid",
        envelope_ref: `memory/episodes/${priorSession}-model-action-r1.json`,
        round: 1,
        sequence: 1,
        task_chars: 44,
        context_chars: 88,
        model_invoked: true,
        contract_status: "failed",
        dispatch_failure_kind: "none",
        result_failure_kind: "delegated_output_contract_failed",
        ok: false
      },
      created_at: "2026-06-30T00:19:03.500Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_model_r2",
      session_id: priorSession,
      turn_id: priorTurn,
      kind: "model_action",
      summary: "Second round responds with a verified summary.",
      artifact_refs: [`memory/episodes/${priorSession}-model-action-r2.json`],
      created_at: "2026-06-30T00:19:04.000Z"
    });
    const unreadableDiagnosticRef = `memory/episodes/${priorSession}-model-diagnostic-r1.json`;
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_trace_diagnostic_missing",
      session_id: priorSession,
      turn_id: priorTurn,
      kind: "model_diagnostic",
      summary: "Recorded bounded model failure diagnostic.",
      artifact_refs: [unreadableDiagnosticRef],
      created_at: "2026-06-30T00:19:05.000Z"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Read previous live run trace."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Read previous live run trace."
    });
    const replay = await runHarnessReplayAudit(fixture.store, {
      traceRef: "completion_verification_trace_context"
    });
    const trace = (await getLiveRunTrace(fixture.store, {
      traceRef: "completion_verification_trace_context"
    })).trace;

    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const section = rendered.manifest.sections.find((item) => item.title === "Live Run Trace");
    const replaySection = rendered.manifest.sections.find((item) => item.title === "Harness Replay Audits");

    assert.match(rendered.markdown, /## Live Run Trace/);
    assert.match(rendered.markdown, /session_live_trace_context/);
    assert.match(rendered.markdown, /completion_status: done/);
    assert.match(rendered.markdown, /reported_completion_status: done/);
    assert.match(rendered.markdown, /final_completion_status: done/);
    assert.match(rendered.markdown, /final_completion_status_present: true/);
    assert.match(rendered.markdown, /reported_completion_status_matches_final: true/);
    assert.match(rendered.markdown, /verification_status: failed/);
    assert.match(rendered.markdown, /events: 7 \((?=[^)]*prompt=1)(?=[^)]*model_action=2)(?=[^)]*report=1)(?=[^)]*tool_result=1)(?=[^)]*delegated_result=1)(?=[^)]*model_diagnostic=1)[^)]*\)/);
    assert.match(rendered.markdown, /tool_results: 1/);
    assert.match(rendered.markdown, /delegated_results: 1/);
    assert.match(rendered.markdown, /delegated_results_passed: 0/);
    assert.match(rendered.markdown, /delegated_results_failed: 1/);
    assert.match(rendered.markdown, /delegated_completion_gate_statuses: pass=1, warning=0, fail=2, skipped=0/);
    assert.match(rendered.markdown, /delegated_result_report_refs: 1/);
    assert.match(rendered.markdown, /delegated_result_event_fallback_refs: 0/);
    assert.match(rendered.markdown, /delegated_result_refs: 1/);
    assert.match(rendered.markdown, /delegated_dispatch_missing_result_ref: 0/);
    assert.deepEqual(trace.unreadable_model_diagnostic_refs, [unreadableDiagnosticRef]);
    assert.match(rendered.markdown, /unreadable_model_diagnostics: 1/);
    assert.match(rendered.markdown, new RegExp(`unreadable_model_diagnostic_ref: ${unreadableDiagnosticRef}`));
    assert.equal(trace.delegated_result_failed_count, 1);
    assert.deepEqual(trace.delegated_result_report_refs, [
      `memory/episodes/${priorSession}-delegated_result_invalid.json`
    ]);
    assert.deepEqual(trace.delegated_result_event_fallback_refs, []);
    assert.deepEqual(trace.delegated_completion_gate_status_counts, {
      pass: 1,
      fail: 2,
      warning: 0,
      skipped: 0
    });
    assert.deepEqual(trace.delegated_completion_gate_checks.map((check) => ({
      id: check.id,
      status: check.status
    })), [{
      id: "delegated_self_report_refs",
      status: "pass"
    }, {
      id: "delegated_independent_evidence",
      status: "fail"
    }, {
      id: "delegated_results",
      status: "fail"
    }]);
    assert.equal(
      trace.delegated_completion_gate_checks[0]?.refs.includes(`memory/episodes/${priorSession}-delegated_result_invalid.json`),
      true
    );
    assert.match(rendered.markdown, /delegated_completion_gate_check: delegated_self_report_refs=pass/);
    assert.match(rendered.markdown, /Delegated self-report refs were rejected as completion proof/);
    assert.match(rendered.markdown, /delegated_completion_gate_check: delegated_independent_evidence=fail/);
    assert.equal(trace.delegated_dispatches.length, 1);
    assert.deepEqual(trace.delegated_dispatches[0], {
      event_id: "evidence_trace_delegated",
      created_at: "2026-06-30T00:19:03.500Z",
      result_id: "delegated_result_trace_context_invalid",
      result_ref: `memory/episodes/${priorSession}-delegated_result_invalid.json`,
      result_ref_in_event_artifacts: true,
      result_ref_file_present: true,
      result_ref_matches_result_identity: false,
      action_id: "action_delegate_trace_context",
      envelope_ref: `memory/episodes/${priorSession}-model-action-r1.json`,
      round: 1,
      sequence: 1,
      task_chars: 44,
      context_chars: 88,
      input_contract_valid: null,
      input_contract_valid_present: false,
      input_digest: null,
      input_digest_present: false,
      metadata_present: true,
      model_invoked: true,
      model_invoked_present: true,
      contract_status: "failed",
      dispatch_failure_kind: null,
      dispatch_failure_kind_present: true,
      result_failure_kind: "delegated_output_contract_failed",
      result_failure_kind_present: true,
      recovery_guidance: null,
      recovery_guidance_present: false,
      ok: false
    });
    assert.match(rendered.markdown, /delegated_dispatch: round=1 sequence=1 status=failed ok=false model_invoked=true metadata_present=true input_contract_valid=unknown input_digest_present=false dispatch_failure_kind=none result_failure_kind=delegated_output_contract_failed task_chars=44 context_chars=88 action_id=action_delegate_trace_context result_id=delegated_result_trace_context_invalid envelope_ref=memory\/episodes\/session_live_trace_context-model-action-r1\.json ref=memory\/episodes\/session_live_trace_context-delegated_result_invalid\.json/);
    assert.match(rendered.markdown, /harness_state_actions: 1/);
    assert.match(rendered.markdown, /repo_write_guards: 1/);
    assert.match(rendered.markdown, /repo_write_guard: docs\/generated\.md before=dirty after=dirty changed_files=1->2 delta=1 preexisting_dirty=true target_changed=true/);
    assert.match(rendered.markdown, /round_1: memory\/episodes\/session_live_trace_context-model-action-r1\.json/);
    assert.match(rendered.markdown, /action_counts: delegate_agent=1, record_evidence=1, use_tool=1/);
    assert.match(rendered.markdown, /delegated_action_ids: action_delegate_trace_context/);
    assert.match(rendered.markdown, /delegated_action_sequence_by_id: action_delegate_trace_context=1/);
    assert.match(rendered.markdown, /harness_action_types: record_evidence/);
    assert.match(rendered.markdown, /## Harness Replay Audits/);
    assert.match(rendered.markdown, new RegExp(replay.id));
    assert.match(rendered.markdown, /trace_ref: memory\/episodes\/session_live_trace_context-completion-verification\.json/);
    assert.match(rendered.markdown, /completion_id: completion_verification_trace_context/);
    assert.match(rendered.markdown, /replay_result: metadata_replay/);
    assert.match(rendered.markdown, /delegated_failed=1/);
    assert.match(rendered.markdown, /delegated_dispatches=1/);
    assert.match(rendered.markdown, /delegated_dispatches_failed=1/);
    assert.match(rendered.markdown, /delegated_result_refs: report=1, fallback=0, trace=1/);
    assert.match(rendered.markdown, /replay_check: delegated_completion_gate=fail/);
    assert.match(rendered.markdown, /replay_check: delegated_action_coverage=pass/);
    assert.match(rendered.markdown, /replay_check: delegated_result_ref_coverage=warning/);
    assert.match(rendered.markdown, /replay_check: delegated_dispatch_metadata=pass/);
    assert.match(rendered.markdown, /replay_check: delegated_dispatch_lineage=warning/);
    assert.equal(replay.checks.find((check) => check.id === "delegated_dispatch_failure_kind")?.status, "pass");
    assert.match(rendered.markdown, /replay_check: delegated_recovery_guidance=warning/);
    assert.match(rendered.markdown, /replay_check: delegated_result_contract=warning/);
    assert.match(rendered.markdown, /replay_check: model_diagnostic_integrity=warning/);
    assert.match(rendered.markdown, /replay_check: repo_write_guard=warning/);
    assert.match(rendered.markdown, /replay_check: bounded_replay_boundary=pass/);
    assert.doesNotMatch(rendered.markdown, /RAW_PRIOR_CONTEXT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_MODEL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_HARNESS_PAYLOAD_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_TOOL_PAYLOAD_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_TOOL_RESULT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_HARNESS_ARTIFACT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_DELEGATED_RESULT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_DELEGATED_TASK_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_DELEGATED_FINDINGS_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /ENOENT/);
    assert.doesNotMatch(rendered.markdown, /RAW_DELEGATED_OUTPUT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_RESPOND_PAYLOAD_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_FINAL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.equal(section?.item_count, 1);
    assert.equal(section?.refs.includes(`memory/episodes/${priorSession}-completion-verification.json`), true);
    assert.equal(section?.refs.includes(`memory/episodes/${priorSession}-model-action-r1.json`), true);
    assert.equal(section?.refs.includes(`memory/episodes/${priorSession}-model-response-r1.json`), false);
    assert.equal(replaySection?.item_count, 1);
    assert.equal(replaySection?.refs.includes(replay.artifact_refs.json_ref), true);
    assert.equal(replaySection?.refs.includes(`memory/episodes/${priorSession}-completion-verification.json`), true);
    assert.equal(replaySection?.refs.includes(`memory/episodes/${priorSession}-model-response-r1.json`), false);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog surfaces preexisting dirty repo write guards without raw artifacts", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const sessionId = "session_context_repo_guard";
    const turnId = "turn_context_repo_guard";
    await fixture.store.writeText(
      `memory/episodes/${sessionId}-tool_result_write.json`,
      "RAW_CONTEXT_REPO_WRITE_TOOL_RESULT_SHOULD_NOT_APPEAR"
    );
    await fixture.store.writeJson(`memory/episodes/${sessionId}-completion-verification.json`, {
      id: "completion_verification_context_repo_guard",
      session_id: sessionId,
      turn_id: turnId,
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Completion verification passed after a repo write.",
      envelope_ref: `memory/episodes/${sessionId}-model-action-r1.json`,
      final_response_ref: `memory/episodes/${sessionId}-final-response.md`,
      claimed_verification_refs: [],
      observation_refs: [`memory/episodes/${sessionId}-tool_result_write.json`],
      checks: [{
        id: "write_run_tool_results",
        status: "pass",
        summary: "Repo write tool result succeeded.",
        refs: ["tool_result_write"]
      }],
      boundary: "harness-owned completion verification report; read-only context input, not replay authority",
      created_at: "2026-06-30T00:41:00.000Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_context_repo_guard",
      session_id: sessionId,
      turn_id: turnId,
      kind: "tool_result",
      summary: "Wrote repo:docs/context-dirty-write.md (70 bytes). workspace_guard: before=dirty after=dirty changed_files=4->5 delta=1 preexisting_dirty=true target_changed=true.",
      artifact_refs: [`memory/episodes/${sessionId}-tool_result_write.json`],
      created_at: "2026-06-30T00:40:00.000Z"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Review repo write guard attention."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Review repo write guard attention."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");

    assert.match(rendered.markdown, /## Opportunity Backlog/);
    assert.match(rendered.markdown, /repo_write_guard: repo_write_guard_completion_verification_context_repo_guard_evidence_context_repo_guard/);
    assert.match(rendered.markdown, /repo_write_guard: docs\/context-dirty-write\.md/);
    assert.match(rendered.markdown, /repo_write_guard_status: before=dirty after=dirty/);
    assert.match(rendered.markdown, /repo_write_guard_changed_files: 4->5 delta=1/);
    assert.match(rendered.markdown, /repo_write_guard_preexisting_dirty: true/);
    assert.match(rendered.markdown, /repo_write_guard_inspect: pnpm run runtime -- review traces --trace completion_verification_context_repo_guard --state-root <state-root>/);
    assert.doesNotMatch(rendered.markdown, /RAW_CONTEXT_REPO_WRITE_TOOL_RESULT_SHOULD_NOT_APPEAR/);
    assert.equal(opportunitySection?.refs.includes(`memory/episodes/${sessionId}-completion-verification.json#evidence_context_repo_guard`), true);
  } finally {
    await fixture.cleanup();
  }
});

test("context pipeline history exposes blocked run metadata without raw pipeline bodies", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeText("pipelines/pipeline_context_blocked/query.md", "RAW_PIPELINE_QUERY_BODY_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("pipelines/pipeline_context_blocked/todo.md", "RAW_PIPELINE_TODO_BODY_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("pipelines/pipeline_context_blocked/artifacts/verify.md", "RAW_PIPELINE_STAGE_OUTPUT_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("pipelines/pipeline_context_blocked/responses/verify-model-response-r1.json", "RAW_PIPELINE_MODEL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("pipelines/pipeline_context_blocked/pipeline.json", {
      id: "pipeline_context_blocked",
      task: "Use StageRunner to verify context failure metadata.",
      source: "builtin",
      stages: [{
        id: "verify",
        title: "Verify",
        objective: "Verify context failure metadata.",
        input_refs: [],
        expected_outputs: ["verify.md"],
        allowed_tools: ["repo.search"],
        max_model_rounds: 1,
        max_tool_calls: 1,
        timeout_ms: 120000,
        acceptance_checks: ["Failure metadata appears without raw bodies."],
        on_failure: "block",
        side_effect_level: "local_write",
        optional: false
      }],
      side_effect_ceiling: "local_write",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("pipelines/pipeline_context_blocked/stages/verify.json", {
      id: "stage_run_pipeline_context_blocked_verify",
      pipeline_id: "pipeline_context_blocked",
      stage_id: "verify",
      status: "blocked",
      attempt: 1,
      evidence_refs: ["evidence_pipeline_context_blocked_verify"],
      output_refs: ["pipelines/pipeline_context_blocked/artifacts/verify.md"],
      model_response_refs: ["pipelines/pipeline_context_blocked/responses/verify-model-response-r1.json"],
      envelope_refs: ["pipelines/pipeline_context_blocked/responses/verify-model-action-r1.json"],
      failure_kind: "stage_incomplete",
      failure_message: "Verification did not satisfy completion checks.",
      started_at: "2026-06-30T00:00:01.000Z",
      completed_at: "2026-06-30T00:00:02.000Z"
    });
    await fixture.store.writeJson("pipelines/pipeline_context_blocked/checkpoint.json", {
      run_id: "pipeline_run_context_blocked",
      pipeline_id: "pipeline_context_blocked",
      status: "blocked",
      blocked_stage_id: "verify",
      stage_run_refs: ["pipelines/pipeline_context_blocked/stages/verify.json"],
      evidence_refs: ["evidence_pipeline_context_blocked_verify"],
      final_response_ref: null,
      updated_at: "2026-06-30T00:00:03.000Z"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Inspect pipeline context failure metadata."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Inspect pipeline context failure metadata."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const pipelineSection = rendered.manifest.sections.find((section) => section.title === "Pipeline History");
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");

    assert.match(bundle, /Pipeline History/);
    assert.match(bundle, /pipeline_run_context_blocked/);
    assert.match(bundle, /status: blocked/);
    assert.match(bundle, /blocked_stage_id: verify/);
    assert.match(bundle, /failed_stages: verify/);
    assert.match(bundle, /query_ref: pipelines\/pipeline_context_blocked\/query\.md/);
    assert.match(bundle, /todo_ref: pipelines\/pipeline_context_blocked\/todo\.md/);
    assert.match(bundle, /Opportunity Backlog/);
    assert.match(bundle, /pipeline_run: pipeline_run_context_blocked/);
    assert.match(bundle, /action: resume_pipeline/);
    assert.match(bundle, /pipeline_inspect_command: pnpm run runtime -- pipeline runs --pipeline pipeline_run_context_blocked --state-root <state-root>/);
    assert.match(bundle, /pipeline_resume_command: pnpm run runtime -- pipeline resume --pipeline pipeline_run_context_blocked --from-stage verify --state-root <state-root>/);
    assert.doesNotMatch(bundle, /RAW_PIPELINE_QUERY_BODY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_PIPELINE_TODO_BODY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_PIPELINE_STAGE_OUTPUT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_PIPELINE_MODEL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.equal(pipelineSection?.item_count, 1);
    assert.deepEqual(pipelineSection?.refs, [
      "pipelines/pipeline_context_blocked/pipeline.json",
      "pipelines/pipeline_context_blocked/checkpoint.json",
      "pipelines/pipeline_context_blocked/stages/verify.json",
      "pipelines/pipeline_context_blocked/query.md",
      "pipelines/pipeline_context_blocked/todo.md"
    ]);
    assert.equal(opportunitySection?.item_count, 1);
    assert.deepEqual(opportunitySection?.refs, ["pipelines/pipeline_context_blocked/checkpoint.json"]);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle surfaces reused skill coverage without raw skill body", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Review coverage-aware backlog context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Review coverage-aware backlog context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    await fixture.store.writeJson("sop/drafts/sop_context_reuse.json", {
      id: "sop_context_reuse",
      title: "Validate context reused skill coverage",
      trigger: "Use when context must show whether a duplicate skill still covers the SOP.",
      procedure: [
        "Open the opportunity backlog.",
        "Read the reused skill coverage status.",
        "Keep the raw skill body out of the context bundle."
      ],
      required_tools: ["context.bundle", "review.coverage"],
      verification: "Context shows covered reused skill coverage without rendering the skill body.",
      failure_modes: ["Do not execute revise_skill from context alone."],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "audited",
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeRepoText("vault/skills/context-reused-skill/SKILL.md", [
      "---",
      "name: context-reused-skill",
      "description: Validate context reused skill coverage and show whether a duplicate skill still covers the SOP without rendering the skill body.",
      "---",
      "",
      "RAW_SKILL_BODY_SHOULD_NOT_BE_IN_CONTEXT"
    ].join("\n"));
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_context_reused_skill",
      session_id: "sop_context_reuse",
      turn_id: "audit_context_reused_skill",
      kind: "report",
      summary: "Skipped explicit SOP promotion because recalled skill already covers this SOP: context-reused-skill.",
      artifact_refs: [
        "sop/drafts/sop_context_reuse.json",
        "vault/skills/context-reused-skill/SKILL.md"
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await fixture.store.writeJson("memory/archives/2026-06-30.json", {
      version: 1,
      date: "2026-06-30",
      source_ref: "memory/episodes/events.jsonl",
      archive_ref: "memory/archives/2026-06-30.json",
      markdown_ref: "memory/archives/2026-06-30.md",
      created_at: "2026-06-30T00:01:00.000Z",
      event_count: 1,
      session_count: 1,
      kind_counts: { report: 1 },
      first_event_at: "2026-06-30T00:00:01.000Z",
      last_event_at: "2026-06-30T00:00:01.000Z",
      sessions: [{
        session_id: "sop_context_reuse",
        event_count: 1,
        kind_counts: { report: 1 },
        first_event_at: "2026-06-30T00:00:01.000Z",
        last_event_at: "2026-06-30T00:00:01.000Z",
        summaries: ["Skipped explicit SOP promotion because recalled skill already covers this SOP."],
        artifact_refs: ["sop/drafts/sop_context_reuse.json", "vault/skills/context-reused-skill/SKILL.md"]
      }],
      recent_events: [{
        id: "evidence_context_reused_skill",
        session_id: "sop_context_reuse",
        turn_id: "audit_context_reused_skill",
        kind: "report",
        summary: "Skipped explicit SOP promotion because recalled skill already covers this SOP.",
        artifact_refs: ["sop/drafts/sop_context_reuse.json", "vault/skills/context-reused-skill/SKILL.md"],
        created_at: "2026-06-30T00:00:01.000Z"
      }]
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_context_reuse.json", {
      id: "review_inbox_context_reuse",
      created_at: "2026-06-30T00:00:02.000Z",
      updated_at: "2026-06-30T00:00:02.000Z",
      status: "open",
      source: "review_tick",
      first_review_ref: "autonomy/reviews/background_review_context_reuse.json",
      latest_review_ref: "autonomy/reviews/background_review_context_reuse.json",
      proposal_id: "review_proposal_context_reuse",
      proposal_type: "skill_revision",
      proposal_title: "Validate context reused skill coverage",
      action_id: "follow_up_action_revise_skill_context_reuse",
      action_kind: "revise_skill",
      title: "Validate context reused skill coverage",
      rationale: "Confirm the duplicate skill still covers the SOP before changing metadata.",
      command: null,
      required_refs: [
        "sop/drafts/sop_context_reuse.json",
        "vault/skills/context-reused-skill/SKILL.md"
      ],
      would_write: ["active_vault"],
      seen_count: 1
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_context_reuse.json", {
      id: "follow_up_confirmation_context_reuse",
      created_at: "2026-06-30T00:00:03.000Z",
      status: "pending",
      review_ref: "autonomy/reviews/background_review_context_reuse.json",
      proposal_id: "review_proposal_context_reuse",
      proposal_type: "skill_revision",
      sop_id: "sop_context_reuse",
      sop_ref: "sop/drafts/sop_context_reuse.json",
      action_id: "follow_up_action_revise_skill_context_reuse",
      action_kind: "revise_skill",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_revise_skill_context_reuse",
        kind: "revise_skill",
        title: "Validate context reused skill coverage",
        rationale: "Confirm the duplicate skill still covers the SOP before changing metadata.",
        command: null,
        required_refs: [
          "sop/drafts/sop_context_reuse.json",
          "vault/skills/context-reused-skill/SKILL.md"
        ],
        would_write: ["active_vault"]
      },
      required_refs: [
        "sop/drafts/sop_context_reuse.json",
        "vault/skills/context-reused-skill/SKILL.md"
      ],
      would_write: ["active_vault"],
      next_step: "Review coverage before execution."
    });

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");
    const governanceSection = rendered.manifest.sections.find((section) => section.title === "Governance Queue");

    assert.match(bundle, /Opportunity Backlog/);
    assert.match(bundle, /Governance Queue/);
    assert.match(bundle, /review_inbox_context_reuse/);
    assert.match(bundle, /follow_up_confirmation_context_reuse/);
    assert.match(bundle, /reused_skill_coverage: covered/);
    assert.match(bundle, /coverage_sop: sop_context_reuse/);
    assert.match(bundle, /coverage_current_duplicate: vault\/skills\/context-reused-skill\/SKILL\.md/);
    assert.match(bundle, /coverage_recorded_duplicates: vault\/skills\/context-reused-skill\/SKILL\.md/);
    assert.doesNotMatch(bundle, /RAW_SKILL_BODY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.deepEqual([...(opportunitySection?.refs ?? [])].sort(), [
      "autonomy/followups/follow_up_confirmation_context_reuse.json",
      "autonomy/inbox/review_inbox_context_reuse.json"
    ].sort());
    assert.deepEqual(governanceSection?.refs, [
      "autonomy/inbox/review_inbox_context_reuse.json",
      "autonomy/followups/follow_up_confirmation_context_reuse.json"
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("context selected skills include recall metadata before skill body", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "vault/skills/context-selected/SKILL.md", [
      "---",
      "name: context-selected",
      "description: Use when selected skill metadata should explain why a procedure was injected.",
      "---",
      "",
      "SELECTED_SKILL_BODY_SHOULD_APPEAR"
    ].join("\n"));
    await writeRepoFile(fixture.repoRoot, "vault/skills/context-unselected/SKILL.md", [
      "---",
      "name: context-unselected",
      "description: This skill was not selected.",
      "---",
      "",
      "UNSELECTED_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Use selected skill metadata in context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Use selected skill metadata in context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity, {
      skill_refs: ["vault/skills/context-selected/SKILL.md"],
      skill_hits: [{
        name: "context-selected",
        instructions_ref: "vault/skills/context-selected/SKILL.md",
        metadata_ref: "vault/registry/skills.jsonl#context-selected",
        source: "seed",
        score: 17,
        base_score: 23,
        quality: {
          outcome_count: 2,
          passed_count: 1,
          attention_count: 1,
          score_adjustment: -6,
          latest_outcome_ref: "memory/skills/usage/session_context-selected.json"
        }
      }]
    });

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const selectedSection = rendered.manifest.sections.find((section) => section.title === "Selected Skills");

    assert.match(bundle, /Selected Skills/);
    assert.match(bundle, /context-selected/);
    assert.match(bundle, /instructions_ref: vault\/skills\/context-selected\/SKILL\.md/);
    assert.match(bundle, /metadata_ref: vault\/registry\/skills\.jsonl#context-selected/);
    assert.match(bundle, /source: seed/);
    assert.match(bundle, /score: 17/);
    assert.match(bundle, /base_score: 23/);
    assert.match(bundle, /outcome_quality: outcomes=2; passed=1; attention=1; adjustment=-6/);
    assert.match(bundle, /latest_outcome_ref: memory\/skills\/usage\/session_context-selected\.json/);
    assert.match(bundle, /SELECTED_SKILL_BODY_SHOULD_APPEAR/);
    assert.doesNotMatch(bundle, /UNSELECTED_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.deepEqual(selectedSection?.refs, ["vault/skills/context-selected/SKILL.md"]);
    assert.equal(rendered.manifest.recall.skill_ref_count, 1);
    assert.deepEqual(rendered.manifest.recall.skill_refs, ["vault/skills/context-selected/SKILL.md"]);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle surfaces draft SOP readiness without raw review body", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Review draft SOP readiness in context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Review draft SOP readiness in context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    await fixture.store.writeText("autonomy/reviews/background_review_draft_context.md", "RAW_DRAFT_REVIEW_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("autonomy/reviews/background_review_draft_context.json", {
      id: "background_review_draft_context",
      mode: "recent",
      query: null,
      session_id: null,
      created_at: "2026-06-30T00:00:00.000Z",
      stats: {
        events_reviewed: 4,
        sessions_seen: 2,
        kinds: { report: 4 },
        failure_signal_count: 2,
        sop_signal_count: 1
      },
      source: {
        memory_sync: {
          source_ref: "memory/episodes/events.jsonl",
          db_ref: "memory/index/episodes.sqlite",
          total_rows: 4,
          indexed_rows: 4,
          skipped_rows: 0
        },
        reviewed_event_ids: ["evidence_draft_context"],
        working_checkpoint: null
      },
      chain_summaries: [],
      proposals: [{
        id: "review_proposal_draft_context",
        type: "sop_candidate",
        title: "Draft context-ready SOP",
        rationale: "Repeated failure evidence is ready for a state-only SOP draft.",
        evidence_refs: [
          "memory/episodes/events.jsonl#evidence_draft_context",
          "sop/drafts/sop_context_related.json",
          "vault/skills/context-related-skill/SKILL.md"
        ],
        next_action: "Inspect evidence before requesting confirmation."
      }],
      artifact_refs: {
        json_ref: "autonomy/reviews/background_review_draft_context.json",
        markdown_ref: "autonomy/reviews/background_review_draft_context.md"
      },
      evidence_event_id: "evidence_background_review_draft_context"
    });
    await fixture.store.writeJson("autonomy/inbox/review_inbox_draft_context.json", {
      id: "review_inbox_draft_context",
      created_at: "2026-06-30T00:00:01.000Z",
      updated_at: "2026-06-30T00:00:01.000Z",
      status: "open",
      source: "review_tick",
      first_review_ref: "autonomy/reviews/background_review_draft_context.json",
      latest_review_ref: "autonomy/reviews/background_review_draft_context.json",
      proposal_id: "review_proposal_draft_context",
      proposal_type: "sop_candidate",
      proposal_title: "Draft context-ready SOP",
      action_id: "follow_up_action_draft_sop_context_ready",
      action_kind: "draft_sop",
      title: "Draft a state-only SOP from this proposal",
      rationale: "No existing actionable SOP chain was found for this proposal.",
      command: null,
      required_refs: [
        "autonomy/reviews/background_review_draft_context.json",
        "memory/episodes/events.jsonl#evidence_draft_context",
        "sop/drafts/sop_context_related.json",
        "vault/skills/context-related-skill/SKILL.md"
      ],
      would_write: ["state"],
      seen_count: 1
    });

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;

    assert.match(bundle, /draft_sop_readiness: ready/);
    assert.match(bundle, /draft_review: autonomy\/reviews\/background_review_draft_context\.json/);
    assert.match(bundle, /draft_proposal: review_proposal_draft_context/);
    assert.match(bundle, /draft_evidence_refs: 3/);
    assert.match(bundle, /draft_failure_signals: 2/);
    assert.match(bundle, /draft_sop_signals: 1/);
    assert.match(bundle, /draft_related_sops: sop\/drafts\/sop_context_related\.json/);
    assert.match(bundle, /draft_related_skills: vault\/skills\/context-related-skill\/SKILL\.md/);
    assert.doesNotMatch(bundle, /RAW_DRAFT_REVIEW_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT/);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle includes bounded task references from accepted goal", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "docs/spec.md", [
      "HIDDEN_LINE_1_SHOULD_NOT_BE_IN_CONTEXT",
      "VISIBLE_SPEC_LINE_2",
      "VISIBLE_SPEC_LINE_3",
      "HIDDEN_LINE_4_SHOULD_NOT_BE_IN_CONTEXT"
    ].join("\n"));
    await writeRepoFile(fixture.repoRoot, "docs/release notes.md", [
      "HIDDEN_RELEASE_LINE_1_SHOULD_NOT_BE_IN_CONTEXT",
      "VISIBLE_RELEASE_LINE_2"
    ].join("\n"));
    await writeRepoFile(fixture.repoRoot, "src/main.ts", "RAW_FOLDER_FILE_BODY_SHOULD_NOT_BE_IN_CONTEXT");
    await writeFile(join(fixture.root, "outside.txt"), "OUTSIDE_FILE_SHOULD_NOT_BE_IN_CONTEXT", "utf8");

    const task = [
      "Review @file:docs/spec.md:2-3",
      "and @file:\"docs/release notes.md\":2-2",
      "plus @folder:src",
      "but block @file:../outside.txt",
      `and block @file:${join(fixture.repoRoot, "docs/spec.md")}`,
      "and ignore @teammate."
    ].join(" ");
    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: task
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: task
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, task, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const referencesSection = rendered.manifest.sections.find((section) => section.title === "Task References");

    assert.match(bundle, /Task References/);
    assert.match(bundle, /@file:docs\/spec\.md:2-3/);
    assert.match(bundle, /VISIBLE_SPEC_LINE_2/);
    assert.match(bundle, /VISIBLE_SPEC_LINE_3/);
    assert.match(bundle, /@file:"docs\/release notes\.md":2-2/);
    assert.match(bundle, /VISIBLE_RELEASE_LINE_2/);
    assert.match(bundle, /@folder:src/);
    assert.match(bundle, /src\/main\.ts/);
    assert.match(bundle, /unsafe repo reference blocked/);
    assert.match(bundle, /absolute repo reference blocked/);
    assert.doesNotMatch(bundle, /HIDDEN_LINE_1_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /HIDDEN_LINE_4_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /HIDDEN_RELEASE_LINE_1_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_FOLDER_FILE_BODY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /OUTSIDE_FILE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.equal(referencesSection?.item_count, 5);
    assert.deepEqual(referencesSection?.refs, [
      "docs/spec.md",
      "docs/release notes.md",
      "src",
      "src/main.ts"
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle summarizes executed governance outcomes without raw artifacts", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "vault/skills/context-governance/SKILL.md", "RAW_SKILL_CONTENT_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("sop/drafts/sop_done.json", "RAW_SOP_CONTENT_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("governance/audits/audit_done.json", "RAW_AUDIT_CONTENT_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("memory/semantic/accepted/semantic_memory_done.md", "RAW_ACCEPTED_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("memory/semantic/confirmations/memory_confirmation_done.json", {
      id: "memory_confirmation_done",
      action_type: "promote_memory_candidate",
      status: "executed",
      created_at: "2026-06-30T00:00:01.000Z",
      executed_at: "2026-06-30T00:00:02.000Z",
      candidate_ref: "memory/semantic/candidates/memory_proposal_done.json",
      candidate_id: "memory_proposal_done",
      confirmation_required: true,
      execution_allowed: false,
      would_write: ["state"],
      safety_boundary: ["RAW_MEMORY_SAFETY_BOUNDARY_SHOULD_NOT_BE_IN_CONTEXT"],
      next_step: "Already executed.",
      execution_result: {
        kind: "accept_memory_candidate",
        accepted_ref: "memory/semantic/accepted/semantic_memory_done.json",
        accepted_markdown_ref: "memory/semantic/accepted/semantic_memory_done.md",
        candidate_ref: "memory/semantic/candidates/memory_proposal_done.json",
        evidence_event_id: "event_memory_done"
      }
    });
    await fixture.store.writeJson("autonomy/followups/follow_up_confirmation_done.json", {
      id: "follow_up_confirmation_done",
      created_at: "2026-06-30T00:00:03.000Z",
      executed_at: "2026-06-30T00:00:04.000Z",
      status: "executed",
      review_ref: "autonomy/reviews/background_review_done.json",
      proposal_id: "review_proposal_done",
      proposal_type: "sop_candidate",
      action_id: "follow_up_action_promote_sop_done",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_promote_sop_done",
        kind: "promote_sop",
        title: "Promote verified governance SOP",
        rationale: "The SOP was audited and should be reusable.",
        command: "RAW_REVIEW_COMMAND_SHOULD_NOT_BE_IN_CONTEXT",
        required_refs: ["sop/drafts/sop_done.json", "governance/audits/audit_done.json"],
        would_write: ["active_vault"]
      },
      required_refs: ["sop/drafts/sop_done.json", "governance/audits/audit_done.json"],
      would_write: ["active_vault"],
      safety_boundary: ["RAW_REVIEW_SAFETY_BOUNDARY_SHOULD_NOT_BE_IN_CONTEXT"],
      next_step: "Already executed.",
      execution_result: {
        kind: "promote_sop",
        status: "promoted",
        sop_ref: "sop/drafts/sop_done.json",
        audit_ref: "governance/audits/audit_done.json",
        evidence_event_id: "event_review_done",
        skill_name: "context-governance",
        skill_ref: "vault/skills/context-governance/SKILL.md",
        candidate_ref: null,
        registry_ref: "vault/registry/skills.jsonl",
        event_ref: "vault/registry/events.jsonl",
        duplicate_skill_ref: null
      }
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check governance outcome context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check governance outcome context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const outcomesSection = rendered.manifest.sections.find((section) => section.title === "Governance Outcomes");

    assert.match(bundle, /Governance Outcomes/);
    assert.match(bundle, /memory_acceptance: memory_confirmation_done/);
    assert.match(bundle, /memory\/semantic\/accepted\/semantic_memory_done\.json/);
    assert.match(bundle, /review_follow_up: follow_up_confirmation_done/);
    assert.match(bundle, /Promote verified governance SOP/);
    assert.match(bundle, /promote_sop/);
    assert.match(bundle, /vault\/skills\/context-governance\/SKILL\.md/);
    assert.match(bundle, /event_review_done/);
    assert.doesNotMatch(bundle, /RAW_MEMORY_SAFETY_BOUNDARY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_REVIEW_SAFETY_BOUNDARY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_REVIEW_COMMAND_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_SOP_CONTENT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_AUDIT_CONTENT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_SKILL_CONTENT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_ACCEPTED_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.equal(outcomesSection?.item_count, 2);
    assert.equal(outcomesSection?.refs.includes("memory/semantic/confirmations/memory_confirmation_done.json"), true);
    assert.equal(outcomesSection?.refs.includes("memory/semantic/accepted/semantic_memory_done.json"), true);
    assert.equal(outcomesSection?.refs.includes("autonomy/followups/follow_up_confirmation_done.json"), true);
    assert.equal(outcomesSection?.refs.includes("vault/skills/context-governance/SKILL.md"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle includes SOP evolution ledger without raw SOP or skill bodies", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "vault/skills/context-evolution/SKILL.md", "RAW_SKILL_BODY_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("sop/drafts/sop_context_evolution.json", {
      id: "sop_context_evolution",
      title: "Expose SOP evolution in context",
      trigger: "Use when live context needs compact self-evolution state before proposing new SOP work.",
      procedure: ["RAW_SOP_BODY_SHOULD_NOT_BE_IN_CONTEXT"],
      required_tools: ["governance.evolution"],
      verification: "The context bundle includes refs and decisions without raw SOP or skill bodies.",
      failure_modes: ["If the ledger is stale, inspect source refs before mutation."],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "audited"
    });
    await fixture.store.writeJson("governance/audits/audit_context_evolution.json", {
      id: "audit_context_evolution",
      target_type: "sop",
      target_ref: "sop_context_evolution",
      verdict: "promote",
      reason: "The context ledger is bounded.",
      checks: {
        evidence: "pass",
        trigger_clarity: "pass",
        verification: "pass",
        failure_modes: "pass",
        rollback_or_retirement: "pass",
        seed_policy: "pass"
      },
      created_at: "2026-06-30T00:01:00.000Z"
    });
    await fixture.store.appendRepoJsonl("vault/registry/skill-events.jsonl", {
      id: "skill_event_context_evolution",
      kind: "promoted",
      skill_name: "context-evolution",
      instructions_ref: "vault/skills/context-evolution/SKILL.md",
      source_sop_ref: "sop/drafts/sop_context_evolution.json",
      audit_ref: "governance/audits/audit_context_evolution.json",
      evidence_refs: ["memory/episodes/events.jsonl#evidence_context_evolution"],
      artifact_refs: ["sop/drafts/sop_context_evolution.json", "governance/audits/audit_context_evolution.json"],
      summary: "Promoted context evolution SOP.",
      created_at: "2026-06-30T00:02:00.000Z"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check SOP evolution context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check SOP evolution context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const ledgerSection = rendered.manifest.sections.find((section) => section.title === "SOP Evolution Ledger");

    assert.match(bundle, /SOP Evolution Ledger/);
    assert.match(bundle, /sop_context_evolution/);
    assert.match(bundle, /vault\/skills\/context-evolution\/SKILL\.md/);
    assert.match(bundle, /skill_event_context_evolution/);
    assert.doesNotMatch(bundle, /RAW_SOP_BODY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(bundle, /RAW_SKILL_BODY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.equal(ledgerSection?.item_count, 2);
    assert.equal(ledgerSection?.refs.includes("sop/drafts/sop_context_evolution.json"), true);
    assert.equal(ledgerSection?.refs.includes("governance/audits/audit_context_evolution.json"), true);
    assert.equal(ledgerSection?.refs.includes("vault/skills/context-evolution/SKILL.md"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog includes open SOP evolution chains without raw SOP bodies", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeJson("sop/drafts/sop_context_backlog.json", {
      id: "sop_context_backlog",
      title: "Audit context backlog SOP",
      trigger: "Use when context assembly needs to surface an open SOP evolution chain.",
      procedure: ["RAW_CONTEXT_SOP_BODY_SHOULD_NOT_APPEAR"],
      required_tools: ["governance.opportunities"],
      verification: "Context Opportunity Backlog shows the SOP id and next step only.",
      failure_modes: ["If a confirmation exists, the confirmation item should own the action."],
      evidence_refs: ["memory/episodes/events.jsonl"],
      revision: 1,
      status: "draft"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check SOP backlog context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check SOP backlog context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");

    assert.match(bundle, /Opportunity Backlog/);
    assert.match(bundle, /sop_evolution_chain: sop_context_backlog/);
    assert.match(bundle, /review audit-sop/);
    assert.doesNotMatch(bundle, /RAW_CONTEXT_SOP_BODY_SHOULD_NOT_APPEAR/);
    assert.equal(opportunitySection?.refs.includes("sop/drafts/sop_context_backlog.json"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog includes failed selected skill outcomes without raw artifacts", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "vault/skills/context-outcome-drift/SKILL.md", [
      "---",
      "name: context-outcome-drift",
      "description: Use when context should expose failed selected skill outcomes.",
      "---",
      "",
      "RAW_SELECTED_SKILL_BODY_SHOULD_NOT_BE_IN_BACKLOG_CONTEXT"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_context_outcome-context.md", "RAW_CONTEXT_MARKDOWN_SHOULD_NOT_BE_IN_BACKLOG_CONTEXT");
    await fixture.store.writeText("memory/episodes/session_context_outcome-final-response.md", "RAW_FINAL_RESPONSE_SHOULD_NOT_BE_IN_BACKLOG_CONTEXT");
    await fixture.store.writeJson("memory/skills/usage/session_context_outcome-context-outcome-drift.json", {
      id: "skill_usage_context_outcome",
      session_id: "session_context_outcome",
      turn_id: "turn_context_outcome",
      skill_name: "context-outcome-drift",
      instructions_ref: "vault/skills/context-outcome-drift/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#context-outcome-drift",
      source: "personal",
      score: 21,
      context_ref: "memory/episodes/session_context_outcome-context.md",
      context_manifest_ref: "memory/episodes/session_context_outcome-context.json",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_context_outcome-completion-verification.json",
      final_response_ref: "memory/episodes/session_context_outcome-final-response.md",
      envelope_ref: "memory/episodes/session_context_outcome-model-action-r2.json",
      registry_update: {
        ok: true,
        use_count: 3,
        last_used_at: "2026-06-30T00:00:00.000Z"
      },
      boundary: "post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness",
      created_at: "2026-06-30T00:00:00.000Z"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check selected skill outcome backlog context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check selected skill outcome backlog context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");

    assert.match(rendered.markdown, /selected_skill_outcome: skill_usage_context_outcome/);
    assert.match(rendered.markdown, /selected_skill: context-outcome-drift/);
    assert.match(rendered.markdown, /selected_skill_verification: failed/);
    assert.match(rendered.markdown, /selected_skill_completion_report: memory\/episodes\/session_context_outcome-completion-verification\.json/);
    assert.match(rendered.markdown, /selected_skill_use_count: 3/);
    assert.equal(opportunitySection?.refs.includes("memory/skills/usage/session_context_outcome-context-outcome-drift.json"), true);
    assert.doesNotMatch(rendered.markdown, /RAW_SELECTED_SKILL_BODY_SHOULD_NOT_BE_IN_BACKLOG_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_CONTEXT_MARKDOWN_SHOULD_NOT_BE_IN_BACKLOG_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_FINAL_RESPONSE_SHOULD_NOT_BE_IN_BACKLOG_CONTEXT/);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog includes repeated selected skill drift without raw artifacts", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "vault/skills/context-repeat-drift/SKILL.md", [
      "---",
      "name: context-repeat-drift",
      "description: Use when context should expose repeated selected skill drift.",
      "---",
      "",
      "RAW_REPEAT_DRIFT_SKILL_BODY_SHOULD_NOT_BE_IN_CONTEXT"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_repeat_context_b-context.md", "RAW_REPEAT_DRIFT_CONTEXT_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeText("memory/episodes/session_repeat_context_b-final-response.md", "RAW_REPEAT_DRIFT_FINAL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("memory/skills/usage/session_repeat_context_a-context-repeat-drift.json", {
      id: "skill_usage_context_repeat_a",
      session_id: "session_repeat_context_a",
      turn_id: "turn_repeat_context_a",
      skill_name: "context-repeat-drift",
      instructions_ref: "vault/skills/context-repeat-drift/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#context-repeat-drift",
      source: "personal",
      score: 21,
      context_ref: "memory/episodes/session_repeat_context_a-context.md",
      context_manifest_ref: "memory/episodes/session_repeat_context_a-context.json",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_repeat_context_a-completion-verification.json",
      final_response_ref: "memory/episodes/session_repeat_context_a-final-response.md",
      envelope_ref: "memory/episodes/session_repeat_context_a-model-action-r2.json",
      registry_update: {
        ok: true,
        use_count: 2,
        last_used_at: "2026-06-30T00:00:00.000Z"
      },
      boundary: "post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeJson("memory/skills/usage/session_repeat_context_b-context-repeat-drift.json", {
      id: "skill_usage_context_repeat_b",
      session_id: "session_repeat_context_b",
      turn_id: "turn_repeat_context_b",
      skill_name: "context-repeat-drift",
      instructions_ref: "vault/skills/context-repeat-drift/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#context-repeat-drift",
      source: "personal",
      score: 21,
      context_ref: "memory/episodes/session_repeat_context_b-context.md",
      context_manifest_ref: "memory/episodes/session_repeat_context_b-context.json",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_repeat_context_b-completion-verification.json",
      final_response_ref: "memory/episodes/session_repeat_context_b-final-response.md",
      envelope_ref: "memory/episodes/session_repeat_context_b-model-action-r2.json",
      registry_update: {
        ok: true,
        use_count: 3,
        last_used_at: "2026-06-30T00:02:00.000Z"
      },
      boundary: "post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness",
      created_at: "2026-06-30T00:02:00.000Z"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check selected skill drift backlog context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check selected skill drift backlog context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");

    assert.match(rendered.markdown, /selected_skill_drift: selected_skill_drift_context-repeat-drift/);
    assert.match(rendered.markdown, /drift_skill: context-repeat-drift/);
    assert.match(rendered.markdown, /drift_attention_count: 2/);
    assert.match(rendered.markdown, /drift_failed_count: 2/);
    assert.match(rendered.markdown, /drift_latest_attention_outcome: memory\/skills\/usage\/session_repeat_context_b-context-repeat-drift\.json/);
    assert.match(rendered.markdown, /drift_completion_report: memory\/episodes\/session_repeat_context_b-completion-verification\.json/);
    assert.equal(opportunitySection?.refs.includes("memory/skills/usage/session_repeat_context_b-context-repeat-drift.json"), true);
    assert.doesNotMatch(rendered.markdown, /RAW_REPEAT_DRIFT_SKILL_BODY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_REPEAT_DRIFT_CONTEXT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_REPEAT_DRIFT_FINAL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT/);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog includes context pressure without raw context markdown", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeJson("memory/episodes/session_context_pressure-context.json", {
      version: 1,
      created_at: "2026-06-30T00:00:00.000Z",
      session_id: "session_context_pressure",
      turn_id: "turn_context_pressure",
      total_chars: 96_000,
      section_count: 2,
      sections: [{
        title: "Episode Recall",
        chars: 58_000,
        refs: ["memory/episodes/pressure-recall.json"],
        item_count: 36
      }, {
        title: "Selected Skills",
        chars: 14_500,
        refs: ["vault/skills/context-pressure/SKILL.md"],
        item_count: 1
      }],
      recall: {
        memory_hit_count: 36,
        memory_refs: ["memory/episodes/pressure-recall.json"],
        archive_ref_count: 0,
        archive_refs: [],
        opportunity_ref_count: 0,
        opportunity_refs: [],
        skill_ref_count: 1,
        skill_refs: ["vault/skills/context-pressure/SKILL.md"],
        discipline_active: false
      }
    });
    await fixture.store.writeText("memory/episodes/session_context_pressure-context.md", "RAW_CONTEXT_PRESSURE_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT");
    await decideOpportunity(fixture.store, {
      opportunity: "context_pressure_session_context_pressure",
      status: "deferred",
      reason: "Operator is reviewing context pressure after the current slice."
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check context pressure backlog context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check context pressure backlog context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");
    const attentionSection = rendered.manifest.sections.find((section) => section.title === "Attention Plan");

    assert.match(rendered.markdown, /## Attention Plan/);
    assert.match(rendered.markdown, /prior_context_pressure: over_budget/);
    assert.match(rendered.markdown, /prior_context: session=session_context_pressure manifest=memory\/episodes\/session_context_pressure-context\.json chars=96000/);
    assert.match(rendered.markdown, /prior_context_largest_section: Episode Recall/);
    assert.match(rendered.markdown, /prior_context_mitigation: reduce_episode_recall/);
    assert.match(rendered.markdown, /attention_hint: Previous context pressure came from recall/);
    assert.match(rendered.markdown, /context_pressure: over_budget/);
    assert.match(rendered.markdown, /context_pressure_session: session_context_pressure/);
    assert.match(rendered.markdown, /context_pressure_largest_section: Episode Recall/);
    assert.match(rendered.markdown, /context show --context memory\/episodes\/session_context_pressure-context\.json/);
    assert.match(rendered.markdown, /context_pressure_mitigation: reduce_episode_recall/);
    assert.match(rendered.markdown, /context_pressure_complete: pnpm run runtime -- governance decide-opportunity --opportunity context_pressure_session_context_pressure --status completed --reason "\.\.\." --state-root <state-root>/);
    assert.match(rendered.markdown, /context_pressure_future_gate: explicit_cli_command_required/);
    assert.match(rendered.markdown, /opportunity_decision: deferred/);
    assert.match(rendered.markdown, /opportunity_decision_reason: Operator is reviewing context pressure after the current slice\./);
    assert.match(rendered.markdown, /opportunity_decision_ref: autonomy\/opportunity-decisions\.jsonl#1/);
    assert.match(rendered.markdown, /opportunity_decision_action_chain: inspect\/read_only -> complete_after_mitigation\/state_decision -> retire_historical\/state_decision -> record_decision\/state_decision/);
    assert.match(rendered.markdown, /action_chain: inspect -> complete_after_mitigation -> retire_historical -> record_decision/);
    assert.match(rendered.markdown, /decision_command: pnpm run runtime -- governance decide-opportunity --opportunity context_pressure_session_context_pressure --status open --reason "\.\.\." --state-root <state-root>/);
    assert.equal(attentionSection?.refs.includes("memory/episodes/session_context_pressure-context.json"), true);
    assert.equal(attentionSection?.refs.includes("memory/episodes/session_context_pressure-context.md"), false);
    assert.equal(opportunitySection?.refs.includes("memory/episodes/session_context_pressure-context.json"), true);
    assert.doesNotMatch(rendered.markdown, /RAW_CONTEXT_PRESSURE_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT/);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog includes context health repair guidance without raw context markdown", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeText("memory/episodes/session_context_orphan-context.md", "RAW_CONTEXT_HEALTH_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT");

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check context health backlog context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check context health backlog context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");

    assert.match(rendered.markdown, /context_health: warning/);
    assert.match(rendered.markdown, /context_health_kind: orphan_context_markdown/);
    assert.match(rendered.markdown, /context_health_context: memory\/episodes\/session_context_orphan-context\.md/);
    assert.match(rendered.markdown, /context_health_repair_manifest: pnpm run runtime -- context repair --context memory\/episodes\/session_context_orphan-context\.md --state-root <state-root>/);
    assert.match(rendered.markdown, /action_chain: inspect -> repair_context_manifest -> complete_after_repair -> retire_historical -> record_decision/);
    assert.equal(opportunitySection?.refs.includes("memory/episodes/session_context_orphan-context.md"), true);
    assert.doesNotMatch(rendered.markdown, /RAW_CONTEXT_HEALTH_MARKDOWN_SHOULD_NOT_BE_IN_CONTEXT/);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog includes skill registry health without raw skill bodies", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "vault/skills/context-skill-health/SKILL.md", [
      "---",
      "name: context-skill-health",
      "description: Current context skill registry health fixture.",
      "---",
      "",
      "RAW_CONTEXT_SKILL_HEALTH_BODY_SHOULD_NOT_BE_IN_CONTEXT"
    ].join("\n"));
    await writeRepoFile(fixture.repoRoot, "vault/registry/skills.jsonl", `${JSON.stringify(skillRegistryEntry({
      name: "context-skill-health",
      description: "Stale context skill registry health fixture.",
      instructions_ref: "vault/skills/context-skill-health/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#context-skill-health",
      content_hash: "stale-hash"
    }))}\n`);

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Inspect skill registry health context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Inspect skill registry health context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");

    assert.match(rendered.markdown, /skill_registry_health: warning/);
    assert.match(rendered.markdown, /skill_registry_health_kind: registry_metadata_drift/);
    assert.match(rendered.markdown, /skill_registry_health_skill: context-skill-health/);
    assert.match(rendered.markdown, /skill_registry_health_inspect: pnpm run runtime -- skills health --skill-name context-skill-health/);
    assert.match(rendered.markdown, /skill_registry_health_sync: pnpm run runtime -- skills --action sync/);
    assert.doesNotMatch(rendered.markdown, /RAW_CONTEXT_SKILL_HEALTH_BODY_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.equal(opportunitySection?.refs.includes("vault/skills/context-skill-health/SKILL.md"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog includes orphan skill event retirement guidance", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "vault/registry/skill-events.jsonl", `${JSON.stringify({
      id: "skill_event_context_orphan",
      kind: "validated",
      skill_name: "context-orphan-event",
      instructions_ref: "vault/skills/context-orphan-event/SKILL.md",
      source_sop_ref: null,
      audit_ref: null,
      evidence_refs: [],
      artifact_refs: [],
      summary: "Historical orphan skill event.",
      created_at: "2026-06-30T00:00:00.000Z"
    })}\n`);

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Inspect orphan skill event context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Inspect orphan skill event context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);

    assert.match(rendered.markdown, /skill_registry_health: warning/);
    assert.match(rendered.markdown, /skill_registry_health_kind: orphan_skill_event/);
    assert.match(rendered.markdown, /skill_registry_health_skill: context-orphan-event/);
    assert.match(rendered.markdown, /skill_registry_health_retire_event: pnpm run runtime -- skills retire-event --event/);
    assert.match(rendered.markdown, /action_chain: inspect -> retire_skill_event -> record_decision/);
  } finally {
    await fixture.cleanup();
  }
});

test("context opportunity backlog includes attention-worthy working checkpoints without raw evidence artifacts", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeJson("memory/working/current.json", {
      goal: "Continue context-visible working checkpoint review.",
      current_step: "blocked_context_follow_up",
      known_constraints: ["Keep raw evidence outside context."],
      recent_evidence_refs: ["memory/episodes/raw-working-context.md"],
      open_questions: ["Which bounded next action should resume the loop?"],
      next_action: "Resume after the opportunity backlog is inspected.",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await fixture.store.writeText("memory/episodes/raw-working-context.md", "RAW_WORKING_CONTEXT_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_working_context",
      session_id: "session_working_context",
      turn_id: "turn_working_context",
      kind: "report",
      summary: "Recorded working checkpoint for context backlog.",
      artifact_refs: [
        "memory/working/current.json",
        "memory/episodes/raw-working-context.md"
      ],
      created_at: "2026-06-30T00:00:01.000Z"
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check working checkpoint backlog context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check working checkpoint backlog context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const opportunitySection = rendered.manifest.sections.find((section) => section.title === "Opportunity Backlog");

    assert.match(rendered.markdown, /working_checkpoint: memory\/working\/current\.json/);
    assert.match(rendered.markdown, /working_checkpoint_step: blocked_context_follow_up/);
    assert.match(rendered.markdown, /working_checkpoint_open_questions: 1/);
    assert.match(rendered.markdown, /memory working --checkpoint memory\/working\/current\.json/);
    assert.match(rendered.markdown, /decision_command: pnpm run runtime -- governance decide-opportunity --opportunity working_checkpoint_current --status deferred --reason "\.\.\." --state-root <state-root>/);
    assert.equal(opportunitySection?.refs.includes("memory/working/current.json"), true);
    assert.doesNotMatch(rendered.markdown, /RAW_WORKING_CONTEXT_SHOULD_NOT_BE_IN_CONTEXT/);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle loads the latest working checkpoint without raw evidence artifacts", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeText("memory/episodes/raw-working-evidence.md", "RAW_WORKING_EVIDENCE_SHOULD_NOT_BE_IN_CONTEXT");
    await fixture.store.writeJson("memory/working/current.json", {
      goal: "Continue evolving the local harness.",
      current_step: "verify working checkpoint recall",
      known_constraints: [
        "Keep context bounded.",
        "Do not read raw evidence artifacts."
      ],
      recent_evidence_refs: ["memory/episodes/raw-working-evidence.md"],
      open_questions: ["Should this checkpoint become a reusable SOP?"],
      next_action: "Inspect the next self-evolution slice."
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check working checkpoint context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check working checkpoint context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const bundle = rendered.markdown;
    const workingSection = rendered.manifest.sections.find((section) => section.title === "Working Checkpoint");
    const workingContext = snapshot.working_context as Record<string, unknown>;

    assert.match(bundle, /Working Checkpoint/);
    assert.match(bundle, /Continue evolving the local harness/);
    assert.match(bundle, /verify working checkpoint recall/);
    assert.match(bundle, /Keep context bounded/);
    assert.match(bundle, /memory\/episodes\/raw-working-evidence\.md/);
    assert.match(bundle, /Inspect the next self-evolution slice/);
    assert.doesNotMatch(bundle, /RAW_WORKING_EVIDENCE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.equal(workingContext.checkpoint_ref, "memory/working/current.json");
    assert.equal(workingSection?.item_count, 1);
    assert.deepEqual(workingSection?.refs, ["memory/working/current.json"]);
  } finally {
    await fixture.cleanup();
  }
});

test("context bundle falls back to the latest valid working checkpoint when current is invalid", async () => {
  const fixture = await createRepoFixture();
  try {
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await fixture.store.writeJson("memory/working/current.json", {
      current_step: "invalid current checkpoint"
    });
    await fixture.store.writeJson("memory/working/2026-06-30T00-00-00-old.json", {
      goal: "Fallback old goal.",
      current_step: "old fallback step",
      known_constraints: [],
      recent_evidence_refs: [],
      open_questions: [],
      next_action: "Do not select the older checkpoint."
    });
    await fixture.store.writeJson("memory/working/2026-06-30T00-01-00-latest.json", {
      goal: "Fallback latest goal.",
      current_step: "latest fallback step",
      known_constraints: ["Skip stale current slot."],
      recent_evidence_refs: [],
      open_questions: [],
      next_action: "Continue from the latest valid checkpoint."
    });

    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check working checkpoint fallback."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check working checkpoint fallback."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const workingSection = rendered.manifest.sections.find((section) => section.title === "Working Checkpoint");
    const workingContext = snapshot.working_context as Record<string, unknown>;

    assert.match(rendered.markdown, /latest fallback step/);
    assert.match(rendered.markdown, /Skip stale current slot/);
    assert.doesNotMatch(rendered.markdown, /old fallback step/);
    assert.doesNotMatch(rendered.markdown, /invalid current checkpoint/);
    assert.equal(workingContext.checkpoint_ref, "memory/working/2026-06-30T00-01-00-latest.json");
    assert.deepEqual(workingSection?.refs, ["memory/working/2026-06-30T00-01-00-latest.json"]);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner marks done claim unverified when a write or run tool failed", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new FailedCommandThenDoneModel()
    });

    const result = await runner.runTask("Run a local command and report completion.");

    assert.equal(result.verdict, "completion_unverified");
    assert.ok(result.completion_report_ref);
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref), "utf8")) as {
      completion_status: string;
      verification_status: string;
      verified: boolean;
      envelope_ref: string;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const verificationEvent = events.find((event) => String(event.summary).includes("Completion verification failed"));
    const responseEvent = events.find((event) => event.summary === "Saved final response from model action envelope.");
    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Review completion verification state."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Review completion verification state."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const completionSection = rendered.manifest.sections.find((section) => section.title === "Completion Verification");

    assert.equal(report.completion_status, "done");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "fail");
    assert.ok(verificationEvent);
    assert.equal(Array.isArray(verificationEvent.artifact_refs), true);
    assert.equal((verificationEvent.artifact_refs as string[]).includes(result.completion_report_ref), true);
    assert.equal((verificationEvent.artifact_refs as string[]).some((ref) => ref.includes("tool_result")), true);
    assert.ok(responseEvent?.final_response);
    const responseMetadata = responseEvent.final_response as Record<string, unknown>;
    assert.deepEqual(responseEvent?.artifact_refs, [result.final_response_ref]);
    assert.deepEqual(responseEvent?.final_response, {
      response_ref: result.final_response_ref,
      action_id: responseMetadata.action_id,
      envelope_ref: report.envelope_ref,
      round: 2,
      sequence: 1
    });
    assert.equal(typeof responseMetadata.action_id, "string");
    assert.match(rendered.markdown, /Completion Verification/);
    assert.match(rendered.markdown, /verification_status: failed/);
    assert.match(rendered.markdown, /write_run_tool_results: fail/);
    assert.equal(completionSection?.item_count, 1);
    assert.equal(completionSection?.refs.includes(result.completion_report_ref), true);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner records structured model diagnostics for request failures", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new RateLimitedModel()
    });

    const result = await runner.runTask("Surface model request diagnostics.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const diagnosticEvent = events.find((event) => event.kind === "model_diagnostic");
    const diagnosticRef = (diagnosticEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.endsWith("-model-diagnostic-r1.json")) ?? "";
    const diagnostic = JSON.parse(await readFile(join(fixture.stateRoot, diagnosticRef), "utf8")) as {
      stage: string;
      failure_kind: string;
      error_preview: string;
      output_preview: string | null;
      response_ref: string | null;
      input_stats: { input_chars: number; estimated_input_tokens: number };
      model_config: { api: string; auth_id: string; max_output_tokens: number };
      boundary: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      completion_status: string;
      verification_status: string;
      observation_refs: string[];
      checks: Array<{ id: string; status: string; refs: string[] }>;
    };
    const finalResponse = await readFile(join(fixture.stateRoot, result.final_response_ref ?? ""), "utf8");
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;

    assert.equal(result.verdict, "blocked_model_error");
    assert.ok(diagnosticEvent);
    assert.equal(diagnostic.stage, "request");
    assert.equal(diagnostic.failure_kind, "rate_limit");
    assert.equal(diagnostic.output_preview, null);
    assert.equal(diagnostic.response_ref, null);
    assert.match(diagnostic.error_preview, /429 Too Many Requests/);
    assert.doesNotMatch(diagnostic.error_preview, /SECRET_SHOULD_NOT_APPEAR/);
    assert.match(diagnostic.error_preview, /\[REDACTED\]/);
    assert.equal(diagnostic.model_config.api, "responses");
    assert.equal(diagnostic.model_config.auth_id, "test-auth");
    assert.equal(diagnostic.model_config.max_output_tokens, 2400);
    assert.ok(diagnostic.input_stats.input_chars > 0);
    assert.ok(diagnostic.input_stats.estimated_input_tokens > 0);
    assert.match(diagnostic.boundary, /harness-owned model failure diagnostic/);
    assert.equal(report.completion_status, "blocked");
    assert.equal(report.verification_status, "skipped");
    assert.equal(report.observation_refs.includes(diagnosticRef), true);
    assert.equal(report.checks.find((check) => check.id === "model_diagnostics")?.status, "warning");
    assert.equal(report.checks.find((check) => check.id === "model_diagnostics")?.refs.includes(diagnosticRef), true);
    assert.match(finalResponse, /Failure kind: rate_limit/);
    assert.doesNotMatch(finalResponse, /SECRET_SHOULD_NOT_APPEAR/);
    assert.equal(trace.model_diagnostic_count, 1);
    assert.equal(trace.model_diagnostics[0]?.failure_kind, "rate_limit");
    assert.equal(trace.model_diagnostics[0]?.diagnostic_ref, diagnosticRef);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner persists bounded response metadata when model envelope parsing fails", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new InvalidEnvelopeModel()
    });

    const result = await runner.runTask("Surface model parse diagnostics.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const diagnosticEvent = events.find((event) => event.kind === "model_diagnostic");
    const diagnosticRef = (diagnosticEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.endsWith("-model-diagnostic-r1.json")) ?? "";
    const diagnostic = JSON.parse(await readFile(join(fixture.stateRoot, diagnosticRef), "utf8")) as {
      stage: string;
      failure_kind: string;
      error_preview: string;
      output_preview: string | null;
      response_ref: string | null;
    };
    const response = JSON.parse(await readFile(join(fixture.stateRoot, result.model_response_ref), "utf8")) as {
      output_chars: number;
      outputText?: string;
      raw?: unknown;
      boundary: string;
    };
    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Read parse failure trace."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Read parse failure trace."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;

    assert.equal(result.verdict, "blocked_model_error");
    assert.match(result.model_response_ref, /-model-response-r1\.json$/);
    assert.equal(response.output_chars, "RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR".length);
    assert.equal(Object.hasOwn(response, "outputText"), false);
    assert.equal(Object.hasOwn(response, "raw"), false);
    assert.match(response.boundary, /raw model output and provider payload are not persisted/);
    assert.doesNotMatch(JSON.stringify(response), /RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR/);
    assert.equal(diagnostic.stage, "envelope_parse");
    assert.equal(diagnostic.failure_kind, "format");
    assert.equal(diagnostic.response_ref, result.model_response_ref);
    assert.match(diagnostic.error_preview, /could not be parsed as ModelActionEnvelope/);
    assert.equal(diagnostic.output_preview, "Model output could not be parsed; raw output was not persisted.");
    assert.doesNotMatch(JSON.stringify(diagnostic), /RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR/);
    assert.equal(trace.model_diagnostics[0]?.response_ref, result.model_response_ref);
    assert.match(rendered.markdown, /model_diagnostics: 1/);
    assert.match(rendered.markdown, /model_diagnostic: round=1 stage=envelope_parse kind=format/);
    assert.doesNotMatch(rendered.markdown, /RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects multiple respond actions before persistence", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new MultipleRespondEnvelopeModel()
    });

    const result = await runner.runTask("Reject ambiguous final responses.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const diagnosticEvent = events.find((event) => event.kind === "model_diagnostic");
    const diagnosticRef = (diagnosticEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.endsWith("-model-diagnostic-r1.json")) ?? "";
    const diagnostic = JSON.parse(await readFile(join(fixture.stateRoot, diagnosticRef), "utf8")) as {
      stage: string;
      error_preview: string;
    };
    const persistedEnvelope = JSON.parse(await readFile(join(fixture.stateRoot, result.envelope_ref), "utf8")) as {
      actions: Array<{ type: string }>;
    };
    const finalResponse = await readFile(join(fixture.stateRoot, result.final_response_ref ?? ""), "utf8");

    assert.equal(result.verdict, "blocked_model_error");
    assert.equal(diagnostic.stage, "envelope_parse");
    assert.match(diagnostic.error_preview, /could not be parsed as ModelActionEnvelope/);
    assert.equal(persistedEnvelope.actions.filter((action) => action.type === "respond").length, 1);
    assert.doesNotMatch(JSON.stringify([diagnostic, persistedEnvelope, finalResponse]), /MULTI_RESPOND_OUTPUT_SHOULD_NOT_PERSIST/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects a done claim without a final response body", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    for (const payload of [{}, { markdown: "   " }, { text: "\n" }]) {
      const runner = new LiveAgentRunner({
        repoRoot: fixture.repoRoot,
        stateRoot: fixture.stateRoot,
        config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
        model: new FinalResponseModel(payload)
      });
      const result = await runner.runTask("Reject an empty final response body.");
      const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
        verification_status: string;
        verified: boolean;
        final_response_ref: string | null;
        checks: Array<{ id: string; status: string; summary: string }>;
      };

      assert.equal(result.verdict, "completion_unverified");
      assert.equal(result.final_response_ref, null);
      assert.equal(report.verification_status, "failed");
      assert.equal(report.verified, false);
      assert.equal(report.final_response_ref, null);
      assert.equal(report.checks.find((check) => check.id === "final_response")?.status, "fail");
    }
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));

    assert.equal(events.some((event) => event.summary === "Saved final response from model action envelope."), false);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner accepts non-empty text after blank markdown", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new FinalResponseModel({ markdown: " ", text: "Text fallback response." })
    });

    const result = await runner.runTask("Accept a text final response.");
    const finalResponse = await readFile(join(fixture.stateRoot, result.final_response_ref ?? ""), "utf8");

    assert.equal(result.verdict, "no_sop");
    assert.equal(finalResponse, "Text fallback response.");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner feeds structured delegated results back as bounded observations", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new StructuredDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Delegate a bounded critique before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      summary: string;
      findings_text: string | null;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
      boundary: string;
      action_id: string;
      round: number;
      sequence: number;
      task_chars: number;
      context_chars: number;
      input_contract_valid: boolean;
      input_digest: string;
      model_invoked: boolean;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      claimed_verification_refs: string[];
      observation_refs: string[];
      delegated_result_refs: string[];
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawStructuredDelegation, true);
    assert.equal(model.sawDelegatedInstructionsBoundary, true);
    assert.equal(model.sawSanitizedDelegationObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=passed; dispatch_failure_kind=none; result_failure_kind=none; ok=true\.$/);
    const delegatedEnvelopeRef = String(delegatedEvent?.delegated_dispatch?.envelope_ref ?? "");
    assert.match(delegatedEnvelopeRef, /^memory\/episodes\/session_.*-model-action-r1\.json$/);
    const persistedEnvelope = JSON.parse(await readFile(join(fixture.stateRoot, delegatedEnvelopeRef), "utf8")) as {
      summary: string;
      actions: Array<{ type: string; rationale: string; payload: Record<string, unknown> }>;
      delegated_action_inputs?: Array<{
        action_id: string;
        sequence: number;
        input_contract_valid: boolean;
        task_chars: number;
        context_chars: number;
        input_digest: string;
      }>;
    };
    const persistedResponseRef = delegatedEnvelopeRef.replace("-model-action-r1.json", "-model-response-r1.json");
    const persistedResponse = JSON.parse(await readFile(join(fixture.stateRoot, persistedResponseRef), "utf8")) as Record<string, unknown>;
    const persistedDelegateAction = persistedEnvelope.actions.find((action) => action.type === "delegate_agent");
    assert.equal(persistedEnvelope.summary, "Model action envelope includes bounded delegated context.");
    assert.deepEqual(persistedDelegateAction, {
      type: "delegate_agent",
      id: delegated.action_id,
      rationale: "Sanitized model action metadata.",
      payload: {}
    });
    assert.deepEqual(persistedEnvelope.delegated_action_inputs, [{
      action_id: delegated.action_id,
      sequence: delegated.sequence,
      input_contract_valid: delegated.input_contract_valid,
      task_chars: delegated.task_chars,
      context_chars: delegated.context_chars,
      input_digest: delegated.input_digest
    }]);
    assert.equal(Object.hasOwn(persistedResponse, "outputText"), false);
    assert.equal(Object.hasOwn(persistedResponse, "raw"), false);
    assert.doesNotMatch(JSON.stringify([persistedEnvelope, persistedResponse]), /Critique whether the answer needs more evidence\.|SECRET_SHOULD_NOT_APPEAR|raw_context/);
    assert.doesNotMatch(JSON.stringify(persistedEnvelope), new RegExp(BOUNDED_DELEGATE_CONTEXT));
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    assert.deepEqual(trace.rounds.find((round) => round.envelope_ref === delegatedEnvelopeRef)?.delegated_action_inputs, persistedEnvelope.delegated_action_inputs);
    assert.deepEqual(delegatedEvent?.delegated_dispatch, {
      action_id: delegated.action_id,
      result_id: delegated.id,
      result_ref: delegatedRef,
      envelope_ref: delegatedEnvelopeRef,
      round: 1,
      sequence: 1,
      task_chars: delegated.task_chars,
      context_chars: delegated.context_chars,
      input_contract_valid: delegated.input_contract_valid,
      input_digest: delegated.input_digest,
      model_invoked: true,
      contract_status: "passed",
      dispatch_failure_kind: "none",
      result_failure_kind: "none",
      recovery_guidance: "none",
      ok: true
    });
    assert.doesNotMatch(JSON.stringify(delegatedEvent), /SECRET_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(delegatedEvent), /delegated critique found one bounded risk/);
    assert.equal(delegated.ok, true);
    assert.equal(delegated.contract_status, "passed");
    assert.equal(Object.hasOwn(delegated, "task"), false);
    assert.doesNotMatch(JSON.stringify(delegated), /Critique whether the answer needs more evidence\./);
    assert.equal(Object.hasOwn(delegatedResultSchema.parse({
      ...delegated,
      task: "legacy delegated task body"
    }), "task"), false);
    assert.equal(delegated.summary, "Structured delegate summary token [REDACTED]");
    assert.equal(delegated.findings_text, "The delegated critique found one bounded risk. Bearer [REDACTED] and [REDACTED_API_KEY] should not leak.");
    assert.equal(delegated.output_text, delegated.findings_text);
    assert.equal(delegated.raw_output_preview, JSON.stringify({
      summary: delegated.summary,
      findings_text: delegated.findings_text
    }));
    assert.match(delegated.raw_output_preview, /\[REDACTED\]/);
    assert.doesNotMatch(delegated.raw_output_preview, /SECRET_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(delegated.summary, /SECRET_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(delegated.findings_text ?? "", /SECRET_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(delegated.output_text, /SECRET_SHOULD_NOT_APPEAR/);
    assert.equal(delegated.error, null);
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "none");
    assert.equal(delegated.model_invoked, true);
    assert.match(delegated.action_id, /^action_/);
    assert.equal(delegated.round, 1);
    assert.equal(delegated.sequence, 1);
    assert.equal(delegated.task_chars > 0, true);
    assert.equal(delegated.context_chars > 0, true);
    assert.equal(delegated.input_contract_valid, true);
    assert.match(delegated.input_digest, /^[a-f0-9]{64}$/);
    assert.match(delegated.boundary, /bounded self-report only/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.deepEqual(report.claimed_verification_refs, []);
    assert.deepEqual(report.delegated_result_refs, [delegatedRef]);
    assert.equal(report.observation_refs.includes(delegatedRef), true);
    for (const checkId of delegateAgentActionContract.completion_gate_check_ids) {
      assert.equal(report.checks.some((check) => check.id === checkId), true);
    }
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "pass");
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /independent verification refs/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner redacts unbound delegated completion claim refs", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new StructuredDelegationThenDoneModel(true)
    });

    const result = await runner.runTask("Do not persist raw delegated claim text.");
    const envelope = JSON.parse(await readFile(join(fixture.stateRoot, result.envelope_ref), "utf8")) as {
      summary: string;
      actions: Array<{ id: string; rationale: string; payload: Record<string, unknown> }>;
      completion_claim: { verification_refs: string[] };
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      claimed_verification_refs: string[];
      checks: Array<{ id: string; status: string; refs: string[] }>;
    };
    const reportMarkdown = await readFile(join(fixture.stateRoot, (result.completion_report_ref ?? "").replace(/\.json$/, ".md")), "utf8");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const persistedText = JSON.stringify([
      envelope,
      report,
      reportMarkdown,
      events.filter((event) => event.kind === "model_action")
    ]);

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(envelope.summary, "Model action envelope includes bounded delegated context.");
    assert.deepEqual(envelope.actions, [{
      type: "respond",
      id: envelope.actions[0]?.id,
      rationale: "Sanitized model action metadata.",
      payload: {}
    }]);
    assert.deepEqual(envelope.completion_claim.verification_refs, ["unbound_claim_ref_1", "unbound_claim_ref_2"]);
    assert.deepEqual(report.claimed_verification_refs, ["unbound_claim_ref_1", "unbound_claim_ref_2"]);
    assert.equal(report.checks.find((check) => check.id === "claimed_refs_bound_to_evidence")?.status, "fail");
    assert.doesNotMatch(persistedText, /Critique whether the answer needs more evidence\.|raw_context|No tool, write, or mutation authority is available/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner assigns harness action ids for delegated actions", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new StructuredDelegationThenDoneModel(false, true)
    });

    const result = await runner.runTask("Do not persist delegated model action ids.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as { action_id: string };
    const envelopeRef = String(delegatedEvent?.delegated_dispatch?.envelope_ref ?? "");
    const envelope = JSON.parse(await readFile(join(fixture.stateRoot, envelopeRef), "utf8")) as {
      actions: Array<{ id: string; type: string }>;
    };
    const actionId = envelope.actions.find((action) => action.type === "delegate_agent")?.id ?? "";

    assert.equal(result.verdict, "completion_unverified");
    assert.match(actionId, /^action_/);
    assert.equal(delegated.action_id, actionId);
    assert.equal(delegatedEvent?.delegated_dispatch?.action_id, actionId);
    assert.doesNotMatch(JSON.stringify([envelope, delegated, delegatedEvent]), /MODEL_DELEGATED_ACTION_ID_SHOULD_NOT_PERSIST/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegated output that echoes raw context before observation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new EchoingDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Delegate a bounded critique before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
      delegated_result_refs: string[];
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawSanitizedEchoFailureObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /echoed raw delegated context/);
    assert.match(delegated.error ?? "", /echoed raw delegated context/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, new RegExp(BOUNDED_DELEGATE_CONTEXT));
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegated output authority claims before observation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new AuthorityClaimDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated outputs that claim execution authority.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedAuthorityFailureObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(Object.hasOwn(delegated, "task"), false);
    assert.doesNotMatch(JSON.stringify(delegated), /Critique whether the answer needs more evidence\./);
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /must not claim tool\/write\/mutation, command\/test execution, completion, expert, multi-agent, or model fan-out authority/);
    assert.match(delegated.error ?? "", /must not claim tool\/write\/mutation, command\/test execution, completion, expert, multi-agent, or model fan-out authority/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, /repo\.search|file\.write_repo|expert reviewers|ran model fan-out|final success is proven/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegated output command execution claims before observation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new CommandExecutionClaimDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated outputs that claim command or test execution.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedCommandExecutionFailureObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /must not claim tool\/write\/mutation, command\/test execution, completion, expert, multi-agent, or model fan-out authority/);
    assert.match(delegated.error ?? "", /must not claim tool\/write\/mutation, command\/test execution, completion, expert, multi-agent, or model fan-out authority/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, /I ran pnpm test|All tests passed/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects Chinese delegated output authority claims before observation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ChineseAuthorityClaimDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject Chinese delegated outputs that claim execution authority.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedChineseAuthorityFailureObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /must not claim tool\/write\/mutation, command\/test execution, completion, expert, multi-agent, or model fan-out authority/);
    assert.match(delegated.error ?? "", /must not claim tool\/write\/mutation, command\/test execution, completion, expert, multi-agent, or model fan-out authority/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, /我调用了工具|我运行了测试|我完成了验证/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegated output wrapper authority claims before strict parsing", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new WrappedAuthorityClaimDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated outputs that wrap valid JSON with authority claims.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedWrappedAuthorityFailureObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /must not claim tool\/write\/mutation, command\/test execution, completion, expert, multi-agent, or model fan-out authority/);
    assert.match(delegated.error ?? "", /must not claim tool\/write\/mutation, command\/test execution, completion, expert, multi-agent, or model fan-out authority/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, /I called repo\.search|final success is proven|scheduled expert reviewers/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegated output forbidden source claims before observation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ForbiddenSourceClaimDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated outputs that claim forbidden source expansion.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedForbiddenSourceFailureObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /must not claim hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs/);
    assert.match(delegated.error ?? "", /must not claim hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, /I used hidden memory|raw delegated artifact bodies|invented verification_refs/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegated output wrapper raw context before strict parsing", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new WrappedRawContextDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated outputs that wrap JSON with raw context.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      result_failure_kind: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawSanitizedWrappedRawContextObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /echoed raw delegated context/);
    assert.match(delegated.error ?? "", /echoed raw delegated context/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, new RegExp(BOUNDED_DELEGATE_CONTEXT));
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegated output extra raw context field before observation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ExtraRawContextFieldDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated outputs that include extra raw context fields.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      result_failure_kind: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawSanitizedExtraFieldObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /echoed raw delegated context/);
    assert.match(delegated.error ?? "", /echoed raw delegated context/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, /raw_context/);
    assert.doesNotMatch(delegated.raw_output_preview, new RegExp(BOUNDED_DELEGATE_CONTEXT));
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner accepts alternate read-only delegate authority phrasing", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new AlternateDelegationBoundaryThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Delegate with an alternate but explicit read-only authority boundary.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const toolEvent = events.find((event) => event.kind === "tool_result");
    const toolMetadata = toolEvent?.tool_result as Record<string, unknown> | undefined;
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedDelegationObservation, true);
    assert.equal(typeof toolMetadata?.action_id, "string");
    assert.match(String(toolMetadata?.envelope_ref), /-model-action-r2\.json$/);
    assert.equal(toolMetadata?.round, 2);
    assert.equal(toolMetadata?.sequence, 1);
    assert.equal(delegated.ok, true);
    assert.equal(delegated.contract_status, "passed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "none");
    assert.equal(report.verification_status, "passed");
    assert.equal(report.verified, true);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "delegated_independent_evidence")?.status, "pass");
    const replayGate = replay.checks.find((check) => check.id === "delegated_completion_gate");
    assert.equal(replayGate?.status, "pass");
    assert.match(replayGate?.summary ?? "", /expected_claimed_refs_bound_status=pass/);
    assert.match(replayGate?.summary ?? "", /claimed_refs_bound_status_match=true/);
    assert.match(replayGate?.summary ?? "", /expected_delegated_independent_status=pass/);
    assert.match(replayGate?.summary ?? "", /post_delegation_bound_refs=1/);
    assert.match(replayGate?.summary ?? "", /delegated_independent_status_match=true/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects post-delegation write evidence without bound verification ref", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new AlternateDelegationBoundaryThenDoneModel(false);
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Require bound verification refs after delegation.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      claimed_verification_refs: string[];
      verification_evidence_refs: Array<{
        ref: string;
        source: string;
        tool_result_id: string;
        artifact_ref: string;
        event_id: string;
        round: number;
        tool: string;
        ok: boolean;
        side_effect_level: string;
        is_write_run: boolean;
        claimed: boolean;
        after_latest_delegation: boolean;
        after_latest_failed_delegation: boolean;
        counts_as_independent_evidence: boolean;
        counts_as_failed_delegation_recovery: boolean;
      }>;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedDelegationObservation, true);
    assert.match(model.claimedWriteRef, /^tool_result_/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "claimed_verification_refs")?.status, "warning");
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /no bound non-delegated verification ref/);
    assert.match(independentCheck?.summary ?? "", /verification_refs=0; write_run_results=1/);
    assert.deepEqual(independentCheck?.refs, []);
    const replayGate = replay.checks.find((check) => check.id === "delegated_completion_gate");
    assert.match(replayGate?.summary ?? "", /expected_claimed_refs_bound_status=skipped/);
    assert.match(replayGate?.summary ?? "", /claimed_refs_bound_status_match=true/);
    assert.match(replayGate?.summary ?? "", /expected_delegated_independent_status=fail/);
    assert.match(replayGate?.summary ?? "", /post_delegation_bound_refs=0/);
    assert.match(replayGate?.summary ?? "", /delegated_independent_status_match=true/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner accepts read-only delegation that evaluates whether mutation is needed", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ReadOnlyMutationQuestionDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Delegate a read-only mutation-need evaluation before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string }>;
    };
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedDelegationObservation, true);
    assert.equal(delegated.ok, true);
    assert.equal(delegated.contract_status, "passed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "none");
    assert.equal(report.verification_status, "passed");
    assert.equal(report.verified, true);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "pass");
    const gateCheck = replay.checks.find((check) => check.id === "delegated_completion_gate");
    assert.equal(gateCheck?.status, "pass");
    assert.match(gateCheck?.summary ?? "", /delegated_results_status=pass/);
    assert.match(gateCheck?.summary ?? "", /expected_delegated_results_status=pass/);
    assert.match(gateCheck?.summary ?? "", /status_match=true/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner accepts latest-context analysis without treating latest as test execution", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new LatestContextAnalysisDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Delegate a bounded analysis of latest context notes.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
    };

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawSanitizedDelegationObservation, true);
    assert.equal(delegated.ok, true);
    assert.equal(delegated.contract_status, "passed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "none");
    assert.equal(report.verification_status, "passed");
    assert.equal(report.verified, true);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects pre-delegation evidence as independent proof after delegation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new StateWriteThenDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Do not reuse pre-delegation evidence after delegation.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawPreDelegationWriteObservation, true);
    assert.equal(model.sawSanitizedDelegationObservation, true);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "pass");
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /after the latest delegated result/);
    assert.deepEqual(independentCheck?.refs, []);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects arbitrary verification refs after delegation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ArbitraryRefAfterDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Do not accept made-up completion refs after delegation.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawDelegatedObservation, true);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "delegated_self_report_refs")?.status, "pass");
    const boundCheck = report.checks.find((check) => check.id === "claimed_refs_bound_to_evidence");
    assert.equal(boundCheck?.status, "fail");
    assert.match(boundCheck?.summary ?? "", /not bound to harness-known/);
    assert.deepEqual(boundCheck?.refs, ["unbound_claim_ref_1"]);
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /harness-known/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects failed read-only tool refs as independent proof after delegation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new SuccessfulDelegationThenFailedReadOnlyToolThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Do not accept failed read-only tool refs as completion proof after delegation.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawDelegatedObservation, true);
    assert.equal(model.sawFailedReadOnlyToolObservation, true);
    assert.match(model.claimedFailedReadOnlyRef, /^tool_result_/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "skipped");
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "pass");
    const boundCheck = report.checks.find((check) => check.id === "claimed_refs_bound_to_evidence");
    assert.equal(boundCheck?.status, "fail");
    assert.match(boundCheck?.summary ?? "", /not bound to harness-known/);
    assert.deepEqual(boundCheck?.refs, ["unbound_claim_ref_1"]);
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /harness-known independent verification refs/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegated self-report refs as done proof", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new DelegatedRefAsProofThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Do not treat delegated self-report as completion proof.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawDelegatedObservation, true);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "pass");
    const delegatedProofCheck = report.checks.find((check) => check.id === "delegated_self_report_refs");
    assert.equal(delegatedProofCheck?.status, "fail");
    assert.match(delegatedProofCheck?.summary ?? "", /delegated self-report ref/);
    assert.deepEqual(delegatedProofCheck?.refs, [model.delegatedProofRef]);
    assert.equal(report.checks.find((check) => check.id === "delegated_independent_evidence")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner does not reject refs that only contain delegated self-report ids", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ContainsDelegatedRefAsArbitraryProofThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Do not treat substring delegated refs as exact completion proof.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawDelegatedObservation, true);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    const delegatedProofCheck = report.checks.find((check) => check.id === "delegated_self_report_refs");
    assert.equal(delegatedProofCheck?.status, "pass");
    assert.deepEqual(delegatedProofCheck?.refs, []);
    const boundCheck = report.checks.find((check) => check.id === "claimed_refs_bound_to_evidence");
    assert.equal(boundCheck?.status, "fail");
    assert.deepEqual(boundCheck?.refs, ["unbound_claim_ref_1"]);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects extra delegate actions without calling the delegated model", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new MultiDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject multiple delegated subtasks in one round.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvents = events.filter((event) => event.kind === "delegated_result");
    const firstRef = (delegatedEvents[0]?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const secondRef = (delegatedEvents[1]?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const first = JSON.parse(await readFile(join(fixture.stateRoot, firstRef), "utf8")) as {
      ok: boolean;
      sequence: number;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const second = JSON.parse(await readFile(join(fixture.stateRoot, secondRef), "utf8")) as {
      ok: boolean;
      sequence: number;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawDelegateLimitObservation, true);
    assert.equal(delegatedEvents.length, 2);
    assert.match(String(delegatedEvents[1]?.summary ?? ""), /sequence=2; .*contract_status=failed; dispatch_failure_kind=dispatch_limit_exceeded; result_failure_kind=dispatch_limit_exceeded; ok=false\.$/);
    assert.equal(first.ok, true);
    assert.equal(first.sequence, 1);
    assert.equal(first.contract_status, "passed");
    assert.equal(first.dispatch_failure_kind, "none");
    assert.equal(first.result_failure_kind, "none");
    assert.equal(second.ok, false);
    assert.equal(second.sequence, 2);
    assert.equal(second.contract_status, "failed");
    assert.equal(second.dispatch_failure_kind, "dispatch_limit_exceeded");
    assert.equal(second.result_failure_kind, "dispatch_limit_exceeded");
    assert.match(second.error ?? "", /delegate_agent supports at most 1 action per model round/);
    assert.equal(second.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
    assert.equal(trace.delegated_result_count, 2);
    assert.equal(trace.delegated_result_failed_count, 1);
    assert.equal(trace.delegated_dispatches[1]?.sequence, 2);
    assert.equal(trace.delegated_dispatches[1]?.contract_status, "failed");
    assert.equal(trace.delegated_dispatches[1]?.dispatch_failure_kind, "dispatch_limit_exceeded");
    assert.equal(trace.delegated_dispatches[1]?.result_failure_kind, "dispatch_limit_exceeded");
    assert.equal(replay.metrics.delegated_dispatches, 2);
    assert.equal(replay.metrics.delegated_dispatches_failed, 1);
    assert.equal(replay.delegated_dispatches[1]?.sequence, 2);
    assert.equal(replay.delegated_dispatches[1]?.contract_status, "failed");
    assert.equal(replay.delegated_dispatches[1]?.dispatch_failure_kind, "dispatch_limit_exceeded");
    assert.equal(replay.delegated_dispatches[1]?.result_failure_kind, "dispatch_limit_exceeded");
    assert.equal(replay.checks.find((check) => check.id === "delegated_result_failure_kind")?.status, "pass");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner records one delegate action in separate model rounds", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new TwoRoundDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Delegate once per round before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvents = events.filter((event) => event.kind === "delegated_result");
    const delegated = await Promise.all(delegatedEvents.map(async (event) => {
      const ref = (event.artifact_refs as string[] | undefined)?.[0] ?? "";
      return JSON.parse(await readFile(join(fixture.stateRoot, ref), "utf8")) as {
        ok: boolean;
        round: number;
        sequence: number;
        contract_status: string;
      };
    }));
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 2);
    assert.equal(model.sawFirstDelegationObservation, true);
    assert.equal(model.sawSecondDelegationObservation, true);
    assert.equal(delegatedEvents.length, 2);
    assert.deepEqual(delegated.map((item) => ({
      ok: item.ok,
      round: item.round,
      sequence: item.sequence,
      contract_status: item.contract_status
    })), [
      { ok: true, round: 1, sequence: 1, contract_status: "passed" },
      { ok: true, round: 2, sequence: 1, contract_status: "passed" }
    ]);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "claimed_refs_bound_to_evidence")?.status, "fail");
    assert.equal(report.checks.find((check) => check.id === "delegated_independent_evidence")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner fails done verification when delegated result violates its contract", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new InvalidDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Delegate a bounded critique before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
      boundary: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawSanitizedFailedObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.output_text, /not valid JSON/);
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, /plain text instead of json/);
    assert.match(delegated.error ?? "", /not valid JSON/);
    assert.match(delegated.boundary, /bounded self-report only/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects generic execution claims and later delegated recovery", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new InvalidDelegationThenValidDelegationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Do not recover failed delegation with another delegated self-report.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvents = events.filter((event) => event.kind === "delegated_result");
    const delegated = await Promise.all(delegatedEvents.map(async (event) => {
      const ref = (event.artifact_refs as string[] | undefined)?.[0] ?? "";
      return JSON.parse(await readFile(join(fixture.stateRoot, ref), "utf8")) as {
        ok: boolean;
        round: number;
        contract_status: string;
        result_failure_kind: string;
        raw_output_preview: string;
        error: string | null;
      };
    }));
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 2);
    assert.equal(model.sawMainHarnessRecoveryHint, true);
    assert.equal(model.sawLaterSuccessfulDelegationObservation, true);
    assert.deepEqual(delegated.map((item) => ({
      ok: item.ok,
      round: item.round,
      contract_status: item.contract_status,
      result_failure_kind: item.result_failure_kind
    })), [
      { ok: false, round: 1, contract_status: "failed", result_failure_kind: "delegated_output_contract_failed" },
      { ok: true, round: 2, contract_status: "passed", result_failure_kind: "none" }
    ]);
    assert.match(delegated[0]?.error ?? "", /must not claim .* command\/test execution/);
    assert.match(delegated[0]?.raw_output_preview ?? "", /raw output preview suppressed/);
    assert.doesNotMatch(delegated[0]?.raw_output_preview ?? "", /test suite was executed/i);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    const delegatedResultsCheck = report.checks.find((check) => check.id === "delegated_results");
    assert.equal(delegatedResultsCheck?.status, "fail");
    assert.doesNotMatch(delegatedResultsCheck?.summary ?? "", /later main-harness recovery evidence/);
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /no successful write\/run recovery evidence/);
    assert.deepEqual(independentCheck?.refs, []);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects write-run-only recovery after failed delegation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new InvalidDelegationThenStateWriteThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Recover in the main harness after a failed delegated result.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawSanitizedFailedObservation, true);
    assert.equal(model.sawRecoveryHint, true);
    assert.equal(model.sawStateWriteObservation, true);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "pass");
    const delegatedResultsCheck = report.checks.find((check) => check.id === "delegated_results");
    assert.equal(delegatedResultsCheck?.status, "fail");
    assert.doesNotMatch(delegatedResultsCheck?.summary ?? "", /later main-harness recovery evidence/);
    assert.doesNotMatch(delegatedResultsCheck?.refs.join("\n") ?? "", /tool_result_/);
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /no successful write\/run recovery evidence/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner accepts failed delegation recovery with write-run and verification refs", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new InvalidDelegationThenStateWriteThenVerifiedDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Recover in the main harness after a failed delegated result with a bound verification ref.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.sawSanitizedFailedObservation, true);
    assert.equal(model.sawRecoveryHint, true);
    assert.equal(model.sawStateWriteObservation, true);
    assert.match(model.claimedWriteRef, /^tool_result_/);
    assert.equal(report.verification_status, "passed");
    assert.equal(report.verified, true);
    assert.deepEqual(report.claimed_verification_refs, [model.claimedWriteRef]);
    const claimedLineage = report.verification_evidence_refs.find((item) => item.ref === model.claimedWriteRef);
    assert.ok(claimedLineage);
    assert.equal(claimedLineage.source, "tool_result");
    assert.equal(claimedLineage.tool_result_id, model.claimedWriteRef);
    assert.match(claimedLineage.artifact_ref, /^memory\/episodes\/session_.*-tool_result_.*\.json$/);
    assert.match(claimedLineage.event_id, /^evidence_/);
    assert.equal(claimedLineage.round > 1, true);
    assert.equal(claimedLineage.tool, "file.write_state");
    assert.equal(claimedLineage.ok, true);
    assert.equal(claimedLineage.side_effect_level, "local_write");
    assert.equal(claimedLineage.is_write_run, true);
    assert.equal(claimedLineage.claimed, true);
    assert.equal(claimedLineage.after_latest_delegation, true);
    assert.equal(claimedLineage.after_latest_failed_delegation, true);
    assert.equal(claimedLineage.counts_as_independent_evidence, true);
    assert.equal(claimedLineage.counts_as_failed_delegation_recovery, true);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "claimed_refs_bound_to_evidence")?.status, "pass");
    const delegatedResultsCheck = report.checks.find((check) => check.id === "delegated_results");
    assert.equal(delegatedResultsCheck?.status, "warning");
    assert.match(delegatedResultsCheck?.summary ?? "", /later main-harness recovery evidence/);
    assert.match(delegatedResultsCheck?.refs.join("\n") ?? "", /tool_result_/);
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "pass");
    assert.match(independentCheck?.summary ?? "", /both later write\/run recovery evidence and bound non-delegated verification refs/);
    assert.match(independentCheck?.summary ?? "", /verification_refs=1; write_run_results=1/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner accepts claimed write-run artifact refs as failed delegation recovery", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new InvalidDelegationThenStateWriteArtifactVerifiedDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Recover after failed delegation with a bound write-run artifact ref.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      claimed_verification_refs: string[];
      verification_evidence_refs: Array<{
        ref: string;
        source: string;
        claimed: boolean;
        is_write_run: boolean;
        counts_as_independent_evidence: boolean;
        counts_as_failed_delegation_recovery: boolean;
      }>;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "no_sop");
    assert.match(model.claimedWriteArtifactRef, /^memory\/episodes\/session_.*-tool_result_.*\.json$/);
    assert.deepEqual(report.claimed_verification_refs, [model.claimedWriteArtifactRef]);
    assert.equal(report.verification_status, "passed");
    assert.equal(report.verified, true);
    const lineage = report.verification_evidence_refs.find((item) => item.ref === model.claimedWriteArtifactRef);
    assert.ok(lineage);
    assert.equal(lineage.source, "tool_artifact");
    assert.equal(lineage.claimed, true);
    assert.equal(lineage.is_write_run, true);
    assert.equal(lineage.counts_as_independent_evidence, true);
    assert.equal(lineage.counts_as_failed_delegation_recovery, true);
    assert.equal(report.checks.find((check) => check.id === "claimed_refs_bound_to_evidence")?.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "warning");
    assert.equal(report.checks.find((check) => check.id === "delegated_independent_evidence")?.status, "pass");
    assert.equal(replay.checks.find((check) => check.id === "delegated_completion_gate")?.status, "warning");
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /delegated_results_status=warning/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /expected_delegated_results_status=warning/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /status_match=true/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /expected_delegated_independent_status=pass/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /post_failed_delegation_verification_refs=1/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /post_failed_delegation_recovery_refs=1/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /delegated_independent_status_match=true/);
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    assert.equal(trace.reported_completion_status, "done");
    assert.equal(trace.final_completion_status, "done");
    assert.equal(trace.final_completion_status_present, true);
    assert.equal(trace.reported_completion_status_matches_final, true);
    assert.equal(replay.checks.find((check) => check.id === "completion_verification_state")?.status, "pass");
    assert.match(replay.checks.find((check) => check.id === "completion_verification_state")?.summary ?? "", /expected_verification_status=passed/);
    assert.match(replay.checks.find((check) => check.id === "completion_verification_state")?.summary ?? "", /completion_status_authority=final_envelope/);
    assert.match(replay.checks.find((check) => check.id === "completion_verification_state")?.summary ?? "", /tuple_match=true/);
    assert.equal(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.status, "pass");
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /envelope_claimed_refs_present=true/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /top_level_claim_ref_mismatches=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /independent_evidence_refs=1/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /reported_independent_evidence_refs=1/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /failed_delegation_recovery_refs=1/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /reported_failed_delegation_recovery_refs=1/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /source_ref_mismatches=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /evidence_pair_cardinality_mismatches=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /evidence_pair_metadata_mismatches=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /missing_tool_result_event_bindings=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /ambiguous_tool_result_event_bindings=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /mismatched_tool_result_event_artifacts=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /mismatched_tool_result_event_rounds=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /after_latest_delegation_mismatches=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /after_latest_failed_delegation_mismatches=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /claimed_flag_mismatches=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /invalid_independent_lineage=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /invalid_recovery_lineage=0/);
    assert.equal(replay.verification_evidence_refs.find((item) => item.ref === model.claimedWriteArtifactRef)?.counts_as_failed_delegation_recovery, true);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects unclaimed write-run recovery with a claimed read-only ref", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await writeRepoFile(fixture.repoRoot, "docs/read-only-evidence.md", "Read-only evidence fixture.");

    const model = new InvalidDelegationThenUnclaimedStateWriteThenReadOnlyDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Require the done claim to cite failed-delegation write-run recovery evidence.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      claimed_verification_refs: string[];
      verification_evidence_refs: Array<{
        ref: string;
        claimed: boolean;
        is_write_run: boolean;
        counts_as_independent_evidence: boolean;
        counts_as_failed_delegation_recovery: boolean;
      }>;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.match(model.unclaimedWriteRef, /^tool_result_/);
    assert.match(model.claimedReadOnlyRef, /^tool_result_/);
    assert.notEqual(model.claimedReadOnlyRef, model.unclaimedWriteRef);
    assert.deepEqual(report.claimed_verification_refs, [model.claimedReadOnlyRef]);
    assert.equal(result.verdict, "completion_unverified");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    const writeLineage = report.verification_evidence_refs.find((item) => item.ref === model.unclaimedWriteRef);
    assert.ok(writeLineage);
    assert.equal(writeLineage.claimed, false);
    assert.equal(writeLineage.is_write_run, true);
    assert.equal(writeLineage.counts_as_failed_delegation_recovery, false);
    const readLineage = report.verification_evidence_refs.find((item) => item.ref === model.claimedReadOnlyRef);
    assert.ok(readLineage);
    assert.equal(readLineage.claimed, true);
    assert.equal(readLineage.is_write_run, false);
    assert.equal(readLineage.counts_as_independent_evidence, true);
    assert.equal(readLineage.counts_as_failed_delegation_recovery, false);
    const delegatedResultsCheck = report.checks.find((check) => check.id === "delegated_results");
    assert.equal(delegatedResultsCheck?.status, "fail");
    assert.doesNotMatch(delegatedResultsCheck?.summary ?? "", /later main-harness recovery evidence/);
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /read-only verification refs do not recover failed delegation/);
    assert.match(independentCheck?.summary ?? "", /verification_refs=1; write_run_results=0/);
    assert.equal(replay.checks.find((check) => check.id === "delegated_completion_gate")?.status, "fail");
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /delegated_results_status=fail/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /expected_delegated_results_status=fail/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /status_match=true/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects state-only recovery after failed delegation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new InvalidDelegationThenStateOnlyThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Try state-only recovery after a failed delegated result.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const evidenceNote = events.find((event) => String(event.summary).includes("Recorded model evidence note"));
    const checkpointEvent = events.find((event) => String(event.summary).includes("Recorded model working checkpoint"));
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawSanitizedFailedObservation, true);
    assert.equal(model.sawRecoveryHint, true);
    assert.equal(model.sawHarnessStateObservation, true);
    assert.ok(evidenceNote);
    assert.ok(checkpointEvent);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "skipped");
    const delegatedResultsCheck = report.checks.find((check) => check.id === "delegated_results");
    assert.equal(delegatedResultsCheck?.status, "fail");
    assert.doesNotMatch(delegatedResultsCheck?.summary ?? "", /later main-harness recovery evidence/);
    assert.doesNotMatch(delegatedResultsCheck?.refs.join("\n") ?? "", /tool_result_/);
    assert.equal(report.checks.find((check) => check.id === "delegated_independent_evidence")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects read-only tool refs as failed delegation recovery evidence", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await writeRepoFile(fixture.repoRoot, "docs/read-only-evidence.md", "Read-only evidence fixture.");

    const model = new InvalidDelegationThenReadOnlyToolThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Try read-only tool recovery after a failed delegated result.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string; refs: string[] }>;
    };
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.sawSanitizedFailedObservation, true);
    assert.equal(model.sawReadOnlyToolObservation, true);
    assert.match(model.claimedReadOnlyRef, /^tool_result_/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "write_run_tool_results")?.status, "skipped");
    const boundCheck = report.checks.find((check) => check.id === "claimed_refs_bound_to_evidence");
    assert.equal(boundCheck?.status, "pass");
    assert.deepEqual(boundCheck?.refs, [model.claimedReadOnlyRef]);
    const independentCheck = report.checks.find((check) => check.id === "delegated_independent_evidence");
    assert.equal(independentCheck?.status, "fail");
    assert.match(independentCheck?.summary ?? "", /read-only verification refs do not recover failed delegation/);
    assert.match(independentCheck?.summary ?? "", /verification_refs=1; write_run_results=0/);
    const delegatedResultsCheck = report.checks.find((check) => check.id === "delegated_results");
    assert.equal(delegatedResultsCheck?.status, "fail");
    assert.doesNotMatch(delegatedResultsCheck?.summary ?? "", /later main-harness recovery evidence/);
    assert.doesNotMatch(delegatedResultsCheck?.refs.join("\n") ?? "", /tool_result_/);
    const replayGate = replay.checks.find((check) => check.id === "delegated_completion_gate");
    assert.equal(replayGate?.status, "fail");
    assert.match(replayGate?.summary ?? "", /expected_delegated_independent_status=fail/);
    assert.match(replayGate?.summary ?? "", /post_failed_delegation_verification_refs=1/);
    assert.match(replayGate?.summary ?? "", /post_failed_delegation_recovery_refs=0/);
    assert.match(replayGate?.summary ?? "", /delegated_independent_status_match=true/);
    const replayLineage = replay.checks.find((check) => check.id === "verification_evidence_lineage");
    assert.equal(replayLineage?.status, "pass");
    assert.match(replayLineage?.summary ?? "", /missing_recovery_lineage=0/);
    assert.match(replayLineage?.summary ?? "", /invalid_recovery_lineage=0/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner surfaces failed delegation on skipped completion traces", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new InvalidDelegationThenBlockedModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Surface failed delegation even when completion is skipped.");
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      completion_status: string;
      verification_status: string;
      verified: boolean;
      delegated_result_failure_kinds: Array<{ result_failure_kind: string; count: number }>;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });
    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Review delegated failure completion verification."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Review delegated failure completion verification."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);

    assert.equal(model.sawSanitizedFailedObservation, true);
    assert.equal(report.completion_status, "blocked");
    assert.equal(report.verification_status, "skipped");
    assert.equal(report.verified, false);
    assert.deepEqual(report.delegated_result_failure_kinds, [
      { result_failure_kind: "delegated_output_contract_failed", count: 1 }
    ]);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "warning");
    assert.match(report.checks.find((check) => check.id === "delegated_results")?.summary ?? "", /Failed delegated result\(s\): 1/);
    assert.match(report.checks.find((check) => check.id === "delegated_results")?.summary ?? "", /result_failure_kinds=delegated_output_contract_failed:1/);
    assert.match(rendered.markdown, /delegated_result_failure_kinds: delegated_output_contract_failed:1/);
    assert.doesNotMatch(rendered.markdown, /BOUNDED_DELEGATE_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /raw_output_preview/);
    assert.equal(report.delegated_result_refs.length, 1);
    assert.equal(trace.delegated_result_count, 1);
    assert.equal(trace.delegated_result_failed_count, 1);
    assert.deepEqual(trace.delegated_result_refs, report.delegated_result_refs);
    assert.deepEqual(trace.delegated_result_event_fallback_refs, []);
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind, "delegated_output_contract_failed");
    assert.equal(replay.metrics.delegated_results_failed, 1);
    assert.deepEqual(replay.delegated_result_refs, report.delegated_result_refs);
    assert.deepEqual(replay.delegated_result_event_fallback_refs, []);
    assert.equal(replay.checks.find((check) => check.id === "completion_verification_state")?.status, "warning");
    assert.match(replay.checks.find((check) => check.id === "completion_verification_state")?.summary ?? "", /expected_verification_status=skipped/);
    assert.match(replay.checks.find((check) => check.id === "completion_verification_state")?.summary ?? "", /tuple_match=true/);
    assert.equal(replay.checks.find((check) => check.id === "delegated_completion_gate")?.status, "warning");
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /delegated_results_status=warning/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /expected_delegated_results_status=warning/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /status_match=true/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /expected_delegated_independent_status=skipped/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /delegated_independent_check_count=0/);
    assert.match(replay.checks.find((check) => check.id === "delegated_completion_gate")?.summary ?? "", /delegated_independent_status_match=true/);
    assert.equal(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.status, "pass");
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /missing_recovery_lineage=0/);
    assert.match(replay.checks.find((check) => check.id === "verification_evidence_lineage")?.summary ?? "", /invalid_recovery_lineage=0/);
    assert.equal(replay.checks.find((check) => check.id === "delegated_result_contract")?.status, "warning");
    assert.equal(replay.checks.find((check) => check.id === "delegated_result_failure_kind")?.status, "pass");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner blocks SOP audit after failed delegation without verified completion", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new InvalidDelegationThenBlockedSopModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Do not audit SOPs after failed delegation without verified completion.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      completion_status: string;
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(model.sawSanitizedFailedObservation, true);
    assert.equal(result.sop_ref, null);
    assert.equal(result.audit_ref, null);
    assert.equal(result.skill_ref, null);
    assert.equal(report.completion_status, "blocked");
    assert.equal(report.verification_status, "skipped");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "warning");
    assert.match(report.checks.find((check) => check.id === "delegated_results")?.summary ?? "", /Failed delegated result\(s\): 1/);
    assert.equal(events.some((event) => String(event.summary).includes("Drafted live SOP candidate")), false);
    assert.equal(events.some((event) => String(event.summary).includes("Autonomous audit verdict")), false);
    await assert.rejects(readFile(join(activeVault, "skills/blocked-delegation-sop-promotion-guard/SKILL.md"), "utf8"));
  } finally {
    await fixture.cleanup();
  }
});

test("live runner sanitizes delegated model request failures before observation", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new DelegationRequestFailureThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Delegate a bounded critique that hits a model request failure.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      output_text: string;
      raw_output_preview: string;
      error: string | null;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      delegated_result_failure_kinds: Array<{ result_failure_kind: string; count: number }>;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 1);
    assert.equal(model.sawAuthoringRecoveryRequirement, true);
    assert.equal(model.sawSanitizedRequestFailureObservation, true);
    assert.equal(model.sawCompletionGateRecoveryHint, true);
    assert.equal(delegatedEvent?.delegated_dispatch?.recovery_guidance, "main_harness_recovery");
    assert.equal(trace.delegated_dispatches[0]?.recovery_guidance, "main_harness_recovery");
    assert.equal(trace.delegated_dispatches[0]?.recovery_guidance_present, true);
    assert.equal(trace.rounds[1]?.model_input_present, true);
    assert.equal(trace.rounds[1]?.model_action_event_count, 1);
    assert.deepEqual(trace.rounds[1]?.model_action_event_bindings, [{
      event_id: trace.rounds[1]?.model_action_event_ids[0],
      envelope_ref_count: 1
    }]);
    assert.deepEqual(trace.rounds[1]?.delegated_observation_result_ids, [delegated.id]);
    assert.deepEqual(trace.rounds[1]?.recovery_guidance_result_ids, [delegated.id]);
    assert.equal(replay.checks.find((check) => check.id === "delegated_recovery_guidance")?.status, "pass");
    assert.equal(replay.checks.find((check) => check.id === "delegated_observation_input_lineage")?.status, "pass");
    assert.equal(replay.checks.find((check) => check.id === "model_action_event_binding")?.status, "pass");
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_model_request_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(Object.hasOwn(delegated, "task"), false);
    assert.doesNotMatch(JSON.stringify(delegated), /Critique whether the answer needs more evidence\./);
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "delegated_model_request_failed");
    assert.match(delegated.output_text, /429 Too Many Requests/);
    assert.match(delegated.output_text, /\[REDACTED\]/);
    assert.doesNotMatch(delegated.output_text, /SECRET_SHOULD_NOT_APPEAR/);
    assert.equal(delegated.raw_output_preview, "");
    assert.match(delegated.error ?? "", /429 Too Many Requests/);
    assert.match(delegated.error ?? "", /\[REDACTED\]/);
    assert.doesNotMatch(delegated.error ?? "", /SECRET_SHOULD_NOT_APPEAR/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.deepEqual(report.delegated_result_failure_kinds, [
      { result_failure_kind: "delegated_model_request_failed", count: 1 }
    ]);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
    assert.match(report.checks.find((check) => check.id === "delegated_results")?.summary ?? "", /result_failure_kinds=delegated_model_request_failed:1/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner fails done verification when delegated output exceeds bounded result limits", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new OversizedDelegatedOutputThenDoneModel()
    });

    const result = await runner.runTask("Delegate a bounded critique before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      error: string | null;
      raw_output_preview: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=true; contract_status=failed; dispatch_failure_kind=none; result_failure_kind=delegated_output_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "none");
    assert.equal(delegated.result_failure_kind, "delegated_output_contract_failed");
    assert.match(delegated.error ?? "", new RegExp(`output\\.findings_text must be at most ${DELEGATED_AGENT_FINDINGS_MAX_CHARS} chars`));
    assert.match(delegated.raw_output_preview, /raw output preview suppressed/);
    assert.doesNotMatch(delegated.raw_output_preview, /Oversized delegated summary/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects malformed delegate payload without calling the delegated model", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new MalformedDelegationPayloadThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject malformed delegated payload before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      task: string;
      error: string | null;
      raw_output_preview: string;
      context_chars: number;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=0; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedDelegationObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(Object.hasOwn(delegated, "task"), false);
    assert.doesNotMatch(JSON.stringify(delegated), /Critique whether the answer needs more evidence\./);
    assert.equal(delegated.context_chars, 0);
    assert.match(delegated.error ?? "", /payload\.context must be a non-empty string/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects unsupported delegate payload fields without calling the delegated model", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new UnsupportedDelegationPayloadThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject expert-style delegated payload before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      error: string | null;
      raw_output_preview: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedDelegationObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.match(delegated.error ?? "", /payload may only include task and context/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate context without explicit authority boundary", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new MissingDelegationBoundaryThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated context that omits the authority boundary.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedBoundaryObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.context_chars > 0, true);
    assert.match(delegated.error ?? "", /context must state no tool\/write\/mutation authority/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind_present, true);
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind_present, true);
    assert.equal(replay.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_dispatch_failure_kind")?.status, "pass");
    assert.equal(replay.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_result_failure_kind")?.status, "pass");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate context without expected output shape", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new MissingDelegationOutputShapeThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated context that omits the expected output shape.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedOutputShapeObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.context_chars > 0, true);
    assert.match(delegated.error ?? "", /context must state expected delegated output shape/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate context without explicit source boundary", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new MissingDelegationSourceBoundaryThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated context that omits explicit source boundary.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedSourceBoundaryObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.context_chars, DELEGATE_CONTEXT_WITHOUT_SOURCE_BOUNDARY.length);
    assert.match(delegated.error ?? "", /context must state delegated analysis may use only explicit payload context or named evidence refs/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind_present, true);
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind_present, true);
    assert.equal(replay.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_dispatch_failure_kind")?.status, "pass");
    assert.equal(replay.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_result_failure_kind")?.status, "pass");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects contradictory delegate context authority grants", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ContradictoryDelegationBoundaryThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject contradictory delegated context authority grants.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedBoundaryObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.context_chars > BOUNDED_DELEGATE_CONTEXT.length, true);
    assert.match(delegated.error ?? "", /context must not grant tool\/write\/mutation, command\/test execution, completion, expert, or multi-agent scheduling authority/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate context command/test execution grants", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new CommandExecutionDelegationBoundaryThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated context command execution authority grants.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedCommandExecutionObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.context_chars > BOUNDED_DELEGATE_CONTEXT.length, true);
    assert.match(delegated.error ?? "", /context must not grant tool\/write\/mutation, command\/test execution, completion, expert, or multi-agent scheduling authority/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(replay.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_dispatch_failure_kind")?.status, "pass");
    assert.equal(replay.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_result_failure_kind")?.status, "pass");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate context expert scheduling grants", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ExpertSchedulingDelegationBoundaryThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated context expert scheduling authority grants.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedBoundaryObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.context_chars > BOUNDED_DELEGATE_CONTEXT.length, true);
    assert.match(delegated.error ?? "", /context must not grant tool\/write\/mutation, command\/test execution, completion, expert, or multi-agent scheduling authority/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate context forbidden source expansion", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ForbiddenSourceDelegationBoundaryThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated context source expansion.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawForbiddenSourceObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.context_chars > BOUNDED_DELEGATE_CONTEXT.length, true);
    assert.match(delegated.error ?? "", /context must not rely on hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate task authority requests without calling the delegated model", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new TaskAuthorityViolationThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated task authority escalation before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      task_chars: number;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedTaskObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.task_chars > 0, true);
    assert.equal(delegated.context_chars, BOUNDED_DELEGATE_CONTEXT.length);
    assert.match(delegated.error ?? "", /explicitly request bounded analysis/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind_present, true);
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind_present, true);
    assert.equal(replay.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_dispatch_failure_kind")?.status, "pass");
    assert.equal(replay.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_result_failure_kind")?.status, "pass");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate task without explicit analysis intent", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ReadOnlyButUnscopedTaskThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject vague delegated task handling before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      task_chars: number;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedTaskObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.task_chars > 0, true);
    assert.equal(delegated.context_chars, BOUNDED_DELEGATE_CONTEXT.length);
    assert.match(delegated.error ?? "", /explicitly request bounded analysis/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects vague analysis task without one concrete question", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new VagueAnalysisTaskThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject vague delegated analysis before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedTaskObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.match(delegated.error ?? "", /one concrete question/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate task with analysis plus mutation intent", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new AnalysisThenMutationTaskThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated task that combines analysis with mutation intent.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      task_chars: number;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedTaskObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.task_chars > 0, true);
    assert.equal(delegated.context_chars, BOUNDED_DELEGATE_CONTEXT.length);
    assert.match(delegated.error ?? "", /explicitly request bounded analysis/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate task with analysis plus patch application intent", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new AnalysisThenPatchTaskThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated task that combines analysis with patch application.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      task_chars: number;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedTaskObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.task_chars > 0, true);
    assert.equal(delegated.context_chars, BOUNDED_DELEGATE_CONTEXT.length);
    assert.match(delegated.error ?? "", /explicitly request bounded analysis/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects delegate task with direct read tool intent", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new AnalysisThenDirectReadTaskThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject delegated task that asks the subagent to read files.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      task_chars: number;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const trace = (await getLiveRunTrace(fixture.store, { traceRef: result.completion_report_ref ?? "" })).trace;
    const replay = await runHarnessReplayAudit(fixture.store, { traceRef: result.completion_report_ref ?? "" });

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedTaskObservation, true);
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.task_chars > 0, true);
    assert.equal(delegated.context_chars, BOUNDED_DELEGATE_CONTEXT.length);
    assert.match(delegated.error ?? "", /command\/test execution/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.dispatch_failure_kind_present, true);
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(trace.delegated_dispatches[0]?.result_failure_kind_present, true);
    assert.equal(replay.delegated_dispatches[0]?.dispatch_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_dispatch_failure_kind")?.status, "pass");
    assert.equal(replay.delegated_dispatches[0]?.result_failure_kind, "input_contract_failed");
    assert.equal(replay.checks.find((check) => check.id === "delegated_result_failure_kind")?.status, "pass");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects Chinese delegate task with analysis plus mutation intent", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new ChineseAnalysisThenMutationTaskThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject Chinese delegated task that combines analysis with mutation intent.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
      error: string | null;
      raw_output_preview: string;
      task_chars: number;
      context_chars: number;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedTaskObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.task_chars > 0, true);
    assert.equal(delegated.context_chars, BOUNDED_DELEGATE_CONTEXT.length);
    assert.match(delegated.error ?? "", /explicitly request bounded analysis/);
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner rejects oversized delegate context without calling the delegated model", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new OversizedDelegationPayloadThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject oversized delegated context before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      contract_status: string;
      error: string | null;
      context_chars: number;
      raw_output_preview: string;
      dispatch_failure_kind: string;
      result_failure_kind: string;
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.match(String(delegatedEvent?.summary ?? ""), /^Delegated result: action_id=action_[^;]+; round=1; sequence=1; task_chars=\d+; context_chars=\d+; model_invoked=false; contract_status=failed; dispatch_failure_kind=input_contract_failed; result_failure_kind=input_contract_failed; ok=false\.$/);
    assert.equal(model.delegationCalls, 0);
    assert.equal(model.sawFailedDelegationObservation, true);
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.equal(delegated.dispatch_failure_kind, "input_contract_failed");
    assert.equal(delegated.result_failure_kind, "input_contract_failed");
    assert.equal(delegated.context_chars, DELEGATE_AGENT_CONTEXT_MAX_CHARS + 1);
    assert.match(delegated.error ?? "", new RegExp(`payload\\.context must be at most ${DELEGATE_AGENT_CONTEXT_MAX_CHARS} chars`));
    assert.equal(delegated.raw_output_preview, "");
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner records actual oversized delegate task length without persisting the task body", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new OversizedDelegationTaskThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Reject oversized delegated task before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const delegatedEvent = events.find((event) => event.kind === "delegated_result");
    const delegatedRef = (delegatedEvent?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const delegated = JSON.parse(await readFile(join(fixture.stateRoot, delegatedRef), "utf8")) as {
      ok: boolean;
      task: string;
      task_chars: number;
      error: string | null;
      raw_output_preview: string;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(model.delegationCalls, 0);
    assert.equal(delegated.ok, false);
    assert.equal(Object.hasOwn(delegated, "task"), false);
    assert.doesNotMatch(JSON.stringify(delegated), /Use a bounded subagent self-report for critique before final answer\./);
    assert.equal(delegated.task_chars, DELEGATE_AGENT_TASK_MAX_CHARS + 1);
    assert.match(delegated.error ?? "", new RegExp(`payload\\.task must be at most ${DELEGATE_AGENT_TASK_MAX_CHARS} chars`));
    assert.equal(delegated.raw_output_preview, "");
  } finally {
    await fixture.cleanup();
  }
});

test("live runner accepts no_sop query/todo runs without blocking supervisor checklist", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new StateWriteThenNoSopModel(),
      discipline: "query_todo"
    });

    const result = await runner.runTask("Run a one-off smoke check without creating a reusable SOP.");

    assert.equal(result.verdict, "no_sop");
    assert.equal(result.sop_ref, null);
    assert.equal(result.skill_ref, null);
    assert.ok(result.completion_report_ref);
    const completionReport = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string }>;
    };
    assert.equal(completionReport.verification_status, "passed");
    assert.equal(completionReport.verified, true);
    assert.equal(completionReport.checks.find((check) => check.id === "claimed_verification_refs")?.status, "warning");
    const todo = await readFile(join(fixture.stateRoot, "todo.md"), "utf8");
    assert.match(todo, /supervisor_check: done/);
    assert.doesNotMatch(todo, /\[fail\].*SOP/);
    assert.match(todo, /SOP decision completed with verdict=no_sop/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner records post-run outcome telemetry for recalled skills", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  const skillRef = join(activeVault, "skills/selected-outcome-telemetry/SKILL.md");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await mkdir(dirname(skillRef), { recursive: true });
    await writeFile(skillRef, [
      "---",
      "name: selected-outcome-telemetry",
      "description: Use when selected outcome telemetry should be recorded after a live runner task.",
      "---",
      "",
      "Record post-run selected skill outcome telemetry."
    ].join("\n"), "utf8");

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new StateWriteThenNoSopModel(),
      discipline: "query_todo"
    });

    const result = await runner.runTask("Use selected outcome telemetry after this one-off smoke check.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const usageEvent = events.find((event) => event.kind === "skill_usage");
    const artifactRefs = usageEvent?.artifact_refs as string[] | undefined;
    const outcomeRef = artifactRefs?.find((ref) => ref.startsWith("memory/skills/usage/") && ref.endsWith(".json")) ?? "";
    const outcome = JSON.parse(await readFile(join(fixture.stateRoot, outcomeRef), "utf8")) as {
      skill_name: string;
      instructions_ref: string;
      context_manifest_ref: string;
      completion_status: string;
      verification_status: string;
      verified: boolean;
      verdict: string;
      completion_report_ref: string;
      registry_update: { ok: boolean; use_count: number | null; last_used_at: string | null };
      boundary: string;
    };

    assert.deepEqual(result.recalled_skill_refs, [skillRef]);
    assert.ok(usageEvent);
    assert.match(String(usageEvent?.summary), /completion=done/);
    assert.match(String(usageEvent?.summary), /verification=passed/);
    assert.match(String(usageEvent?.summary), /verdict=no_sop/);
    assert.equal(artifactRefs?.includes(skillRef), true);
    assert.equal(artifactRefs?.includes(result.context_manifest_ref ?? ""), true);
    assert.equal(artifactRefs?.includes(result.completion_report_ref ?? ""), true);
    assert.equal(outcome.skill_name, "selected-outcome-telemetry");
    assert.equal(outcome.instructions_ref, skillRef);
    assert.equal(outcome.context_manifest_ref, result.context_manifest_ref);
    assert.equal(outcome.completion_status, "done");
    assert.equal(outcome.verification_status, "passed");
    assert.equal(outcome.verified, true);
    assert.equal(outcome.verdict, "no_sop");
    assert.equal(outcome.completion_report_ref, result.completion_report_ref);
    assert.equal(outcome.registry_update.ok, true);
    assert.equal(outcome.registry_update.use_count, 1);
    assert.match(outcome.registry_update.last_used_at ?? "", /^20/);
    assert.match(outcome.boundary, /post-run selected skill outcome telemetry/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner executes state-only harness actions and feeds observations back", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new HarnessStateActionsThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model,
      discipline: "query_todo"
    });

    const result = await runner.runTask("Record state-only harness progress before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const evidenceNote = events.find((event) => String(event.summary).includes("Recorded model evidence note"));
    const checkpointEvent = events.find((event) => String(event.summary).includes("Recorded model working checkpoint"));
    const noteRef = (evidenceNote?.artifact_refs as string[] | undefined)?.[0] ?? "";
    const checkpointRef = (checkpointEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.includes("memory/working/") && ref.endsWith(".json")) ?? "";
    const note = await readFile(join(fixture.stateRoot, noteRef), "utf8");
    const checkpoint = JSON.parse(await readFile(join(fixture.stateRoot, checkpointRef), "utf8")) as {
      current_step: string;
      known_constraints: string[];
      next_action: string;
    };
    const todo = await readFile(join(fixture.stateRoot, "todo.md"), "utf8");

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.sawHarnessObservations, true);
    assert.match(note, /state-only harness evidence note/);
    assert.equal(checkpoint.current_step, "captured harness state");
    assert.deepEqual(checkpoint.known_constraints, ["state-only", "no repo writes"]);
    assert.equal(checkpoint.next_action, "answer after harness state observation");
    assert.match(todo, /harness state observation was executed/);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner records memory proposals and audit requests as state-only governance actions", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new GovernanceActionsThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model,
      discipline: "query_todo"
    });

    const result = await runner.runTask("Propose local memory and request a bounded harness audit.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const memoryEvent = events.find((event) => String(event.summary).includes("Recorded memory proposal candidate"));
    const auditEvent = events.find((event) => String(event.summary).includes("Recorded model audit request"));
    const memoryRef = (memoryEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.includes("memory/semantic/candidates/") && ref.endsWith(".json")) ?? "";
    const auditRef = (auditEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.includes("governance/audits/") && ref.endsWith(".json")) ?? "";
    const memoryProposal = JSON.parse(await readFile(join(fixture.stateRoot, memoryRef), "utf8")) as {
      status: string;
      content: string;
      scope: string;
    };
    const auditRequest = JSON.parse(await readFile(join(fixture.stateRoot, auditRef), "utf8")) as {
      status: string;
      target_type: string;
      target_ref: string;
      boundary: string;
    };
    const todo = await readFile(join(fixture.stateRoot, "todo.md"), "utf8");

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.sawGovernanceObservations, true);
    assert.equal(memoryProposal.status, "candidate");
    assert.equal(memoryProposal.scope, "local");
    assert.match(memoryProposal.content, /Only promote memory after evidence-backed review/);
    assert.equal(auditRequest.status, "requested");
    assert.equal(auditRequest.target_type, "memory");
    assert.equal(auditRequest.target_ref, "candidate-memory");
    assert.match(auditRequest.boundary, /state-only audit request/);
    assert.match(todo, /harness state observation was executed/);
    await assert.rejects(readFile(join(fixture.repoRoot, memoryRef), "utf8"));
    await assert.rejects(readFile(join(fixture.repoRoot, auditRef), "utf8"));
    await assert.rejects(readFile(join(activeVault, memoryRef), "utf8"));
    await assert.rejects(readFile(join(activeVault, auditRef), "utf8"));
  } finally {
    await fixture.cleanup();
  }
});

test("live runner records propose_sop with not_done as a state-only SOP draft candidate", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const model = new StateOnlySopProposalThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model,
      discipline: "query_todo"
    });

    const result = await runner.runTask("Draft a reusable state-only SOP candidate before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const sopEvent = events.find((event) => String(event.summary).includes("Recorded state-only SOP draft candidate"));
    const sopJsonRef = (sopEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.includes("sop/drafts/") && ref.endsWith(".json")) ?? "";
    const sopMarkdownRef = (sopEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.includes("sop/drafts/") && ref.endsWith(".md")) ?? "";
    const sop = JSON.parse(await readFile(join(fixture.stateRoot, sopJsonRef), "utf8")) as {
      id: string;
      title: string;
      status: string;
      evidence_refs: string[];
    };
    const sopMarkdown = await readFile(join(fixture.stateRoot, sopMarkdownRef), "utf8");
    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check state-only SOP draft context."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check state-only SOP draft context."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);

    assert.equal(result.verdict, "no_sop");
    assert.equal(result.sop_ref, null);
    assert.equal(model.sawSopObservation, true);
    assert.equal(sop.status, "draft");
    assert.equal(sop.title, "State-only harness SOP draft");
    assert.equal(sop.evidence_refs.includes(String(sopEvent?.id)), true);
    assert.match(sopMarkdown, /This candidate is state-only/);
    assert.match(rendered.markdown, /SOP Evolution Ledger/);
    assert.match(rendered.markdown, /State-only harness SOP draft/);
    assert.match(rendered.markdown, new RegExp(`sop_evolution_chain: ${sop.id}`));
    await assert.rejects(readFile(join(fixture.repoRoot, sopJsonRef), "utf8"));
    await assert.rejects(readFile(join(fixture.repoRoot, sopMarkdownRef), "utf8"));
    await assert.rejects(readFile(join(activeVault, sopJsonRef), "utf8"));
    await assert.rejects(readFile(join(activeVault, sopMarkdownRef), "utf8"));
  } finally {
    await fixture.cleanup();
  }
});

test("live runner records pause_autonomy as a state-only stop signal for future context", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });

    const model = new PauseAutonomyThenDoneModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model,
      discipline: "query_todo"
    });

    const result = await runner.runTask("Pause future autonomous exploration before answering.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const pauseEvent = events.find((event) => String(event.summary).includes("Recorded autonomy pause signal"));
    const signalRef = (pauseEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref === "autonomy/runs/pause_signal.json") ?? "";
    const requestRef = (pauseEvent?.artifact_refs as string[] | undefined)
      ?.find((ref) => ref.includes("pause-autonomy") && ref.endsWith(".json")) ?? "";
    assert.ok(signalRef);
    assert.ok(requestRef);
    const signal = JSON.parse(await readFile(join(fixture.stateRoot, signalRef), "utf8")) as {
      status: string;
      scope: string;
      reason: string;
      boundary: string;
    };
    const trigger = triggerSchema.parse({
      type: "external_task",
      source: "prompt",
      text: "Check pause state."
    });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: "Check pause state."
    });
    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.sawPauseObservation, true);
    assert.equal(signal.status, "active");
    assert.equal(signal.scope, "autonomous_exploration");
    assert.match(signal.reason, /pause future autonomous exploration/i);
    assert.match(signal.boundary, /current explicit task/);
    assert.equal(snapshot.task_context.stop_signal_active, true);
    assert.equal(snapshot.task_context.stop_signal_ref, "autonomy/runs/pause_signal.json");
    assert.equal((snapshot.task_context.stop_signal as Record<string, unknown>).status, "active");
    await assert.rejects(readFile(join(fixture.repoRoot, signalRef), "utf8"));
    await assert.rejects(readFile(join(fixture.repoRoot, requestRef), "utf8"));
    await assert.rejects(readFile(join(activeVault, signalRef), "utf8"));
    await assert.rejects(readFile(join(activeVault, requestRef), "utf8"));
  } finally {
    await fixture.cleanup();
  }
});

test("live runner injects bounded episode recall into model context", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_prior_feishu_heartbeat",
      session_id: "session_prior",
      turn_id: "turn_prior",
      kind: "report",
      summary: "Prior Feishu heartbeat restart fixed duplicate status drift.",
      artifact_refs: ["memory/episodes/session_prior-final-response.md"],
      created_at: "2026-06-29T00:00:00Z"
    });
    await fixture.store.writeText(
      "memory/episodes/session_prior-final-response.md",
      "RAW_PRIOR_FINAL_RESPONSE_SHOULD_NOT_BE_DUMPED"
    );

    const model = new EpisodeRecallAwareModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Use Feishu heartbeat restart evidence before answering.");
    const context = await readFile(join(fixture.stateRoot, result.context_ref), "utf8");
    const manifest = JSON.parse(await readFile(join(fixture.stateRoot, result.context_manifest_ref ?? ""), "utf8")) as {
      total_chars: number;
      recall: { memory_hit_count: number };
      sections: Array<{ title: string; refs: string[]; item_count: number }>;
    };
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const recallEvent = events.find((event) => String(event.summary).includes("Injected 1 episode recall"));
    const promptEvent = events.find((event) => event.kind === "prompt");

    assert.equal(result.verdict, "no_sop");
    assert.ok(result.context_manifest_ref);
    assert.equal(model.sawEpisodeRecall, true);
    assert.match(context, /Prior Feishu heartbeat restart fixed duplicate status drift/);
    assert.match(context, /memory\/episodes\/session_prior-final-response\.md/);
    assert.doesNotMatch(context, /RAW_PRIOR_FINAL_RESPONSE_SHOULD_NOT_BE_DUMPED/);
    assert.equal(manifest.total_chars, context.length);
    assert.equal(manifest.recall.memory_hit_count, 1);
    assert.equal(
      manifest.sections.find((section) => section.title === "Episode Recall")?.refs[0],
      "memory/episodes/session_prior-final-response.md"
    );
    assert.equal((promptEvent?.artifact_refs as string[]).includes(result.context_manifest_ref), true);
    assert.ok(recallEvent);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner narrows episode recall after recall pressure", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await fixture.store.writeJson("memory/episodes/session_pressure-context.json", {
      version: 1,
      created_at: "2026-07-01T00:00:00Z",
      session_id: "session_pressure",
      turn_id: "turn_pressure",
      total_chars: 52000,
      section_count: 1,
      sections: [{
        title: "Episode Recall",
        chars: 26000,
        refs: ["memory/episodes/older-final-response.md"],
        item_count: 4
      }],
      recall: {
        memory_hit_count: 4,
        memory_refs: ["memory/episodes/older-final-response.md"],
        skill_ref_count: 0,
        skill_refs: [],
        archive_ref_count: 0,
        archive_refs: [],
        opportunity_ref_count: 0,
        opportunity_refs: [],
        discipline_active: false
      }
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_older_feishu_heartbeat",
      session_id: "session_older",
      turn_id: "turn_older",
      kind: "report",
      summary: "Older Feishu heartbeat restart evidence should be skipped under pressure.",
      artifact_refs: ["memory/episodes/older-final-response.md"],
      created_at: "2026-06-28T00:00:00Z"
    });
    await fixture.store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_latest_feishu_heartbeat",
      session_id: "session_latest",
      turn_id: "turn_latest",
      kind: "report",
      summary: "Prior Feishu heartbeat restart fixed duplicate status drift.",
      artifact_refs: ["memory/episodes/latest-final-response.md"],
      created_at: "2026-06-29T00:00:00Z"
    });
    await fixture.store.writeText(
      "memory/episodes/older-final-response.md",
      "RAW_OLDER_FINAL_RESPONSE_SHOULD_NOT_BE_DUMPED"
    );
    await fixture.store.writeText(
      "memory/episodes/latest-final-response.md",
      "RAW_LATEST_FINAL_RESPONSE_SHOULD_NOT_BE_DUMPED"
    );

    const model = new EpisodeRecallAwareModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Use Feishu heartbeat restart duplicate status drift evidence before answering.");
    const context = await readFile(join(fixture.stateRoot, result.context_ref), "utf8");
    const manifest = JSON.parse(await readFile(join(fixture.stateRoot, result.context_manifest_ref ?? ""), "utf8")) as {
      recall: { memory_hit_count: number; memory_refs: string[] };
      sections: Array<{ title: string; refs: string[]; item_count: number }>;
    };
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const limitEvent = events.find((event) => String(event.summary).includes("Limited episode recall to 1"));

    assert.equal(model.sawEpisodeRecall, true);
    assert.match(context, /Prior Feishu heartbeat restart fixed duplicate status drift/);
    assert.doesNotMatch(context, /Older Feishu heartbeat restart evidence should be skipped under pressure/);
    assert.doesNotMatch(context, /RAW_OLDER_FINAL_RESPONSE_SHOULD_NOT_BE_DUMPED/);
    assert.doesNotMatch(context, /RAW_LATEST_FINAL_RESPONSE_SHOULD_NOT_BE_DUMPED/);
    assert.equal(manifest.recall.memory_hit_count, 1);
    assert.deepEqual(manifest.recall.memory_refs, ["evidence_latest_feishu_heartbeat"]);
    assert.deepEqual(
      manifest.sections.find((section) => section.title === "Episode Recall")?.refs,
      ["memory/episodes/latest-final-response.md"]
    );
    assert.ok(limitEvent);
    assert.equal((limitEvent?.artifact_refs as string[]).includes("memory/episodes/session_pressure-context.json"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner injects bounded task references into model context", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeRepoFile(fixture.repoRoot, "docs/task-ref.md", [
      "VISIBLE_LIVE_TASK_REFERENCE",
      "HIDDEN_LIVE_TASK_REFERENCE_LINE"
    ].join("\n"));

    const model = new TaskReferenceAwareModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model
    });

    const result = await runner.runTask("Use @file:docs/task-ref.md:1-1 before answering.");
    const context = await readFile(join(fixture.stateRoot, result.context_ref), "utf8");
    const manifest = JSON.parse(await readFile(join(fixture.stateRoot, result.context_manifest_ref ?? ""), "utf8")) as {
      sections: Array<{ title: string; refs: string[]; item_count: number }>;
    };
    const referencesSection = manifest.sections.find((section) => section.title === "Task References");

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.sawTaskReference, true);
    assert.match(context, /Task References/);
    assert.match(context, /VISIBLE_LIVE_TASK_REFERENCE/);
    assert.doesNotMatch(context, /HIDDEN_LIVE_TASK_REFERENCE_LINE/);
    assert.equal(referencesSection?.item_count, 1);
    assert.deepEqual(referencesSection?.refs, ["docs/task-ref.md"]);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner injects bounded runtime config summary into model context", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  const configDir = join(fixture.root, "runtime-config");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await mkdir(configDir, { recursive: true });
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: join(fixture.root, "home") }),
      JSON.stringify({ type: "state", root: fixture.stateRoot }),
      JSON.stringify({ type: "vault", mode: "user", active_root: activeVault, seed_roots: ["vault", "skills"] }),
      JSON.stringify({ type: "runtime", promotion_enabled: true, structured_output: true, review_tick_enabled: false }),
      JSON.stringify({ type: "active_model", model_id: "runtime-context-model" }),
      JSON.stringify({ type: "active_channel", channel_id: "feishu-main" }),
      JSON.stringify({ type: "active_scenario", scenario_id: "im-default" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "models.jsonl"), `${JSON.stringify({
      type: "model",
      id: "runtime-context-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://api.example.test/v1",
      model: "gpt-runtime-context",
      auth_id: "model-auth"
    })}\n`, "utf8");
    await writeFile(join(configDir, "auth.jsonl"), `${JSON.stringify({
      type: "auth",
      id: "model-auth",
      api_key: "AUTH_SECRET_SHOULD_NOT_APPEAR"
    })}\n`, "utf8");
    await writeFile(join(configDir, "settings.jsonl"), [
      JSON.stringify({
        type: "channel",
        id: "feishu-main",
        kind: "feishu",
        transport: "websocket",
        auth_id: "feishu-auth",
        mode: "private_chat"
      }),
      JSON.stringify({
        type: "scenario",
        id: "im-default",
        channel_id: "feishu-main",
        model_id: "runtime-context-model",
        discipline: "query_todo",
        reply_policy: "final_response",
        concurrency: "per_sender"
      })
    ].join("\n") + "\n", "utf8");

    const model = new RuntimeConfigAwareModel();
    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      configDir,
      model
    });

    const result = await runner.runTask("Use runtime config context before answering.");
    const context = await readFile(join(fixture.stateRoot, result.context_ref), "utf8");
    const manifest = JSON.parse(await readFile(join(fixture.stateRoot, result.context_manifest_ref ?? ""), "utf8")) as {
      sections: Array<{ title: string; refs: string[]; item_count: number }>;
    };
    const section = manifest.sections.find((item) => item.title === "Runtime Config");

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.sawRuntimeConfig, true);
    assert.match(context, /## Runtime Config/);
    assert.match(context, /active_model: runtime-context-model/);
    assert.match(context, /model: gpt-runtime-context/);
    assert.match(context, /review_tick_enabled: false/);
    assert.match(context, /runtime_source: repo:config\.jsonl#4/);
    assert.doesNotMatch(context, /AUTH_SECRET_SHOULD_NOT_APPEAR/);
    assert.equal(section?.refs.includes("repo:config.jsonl#4"), true);
    assert.equal(section?.refs.includes("repo:models.jsonl#1"), true);
  } finally {
    await fixture.cleanup();
  }
});

test("live runner injects bounded live run trace into later model context", async () => {
  const fixture = await createRepoFixture();
  const activeVault = join(fixture.root, "home/vault");
  try {
    await mkdir(join(fixture.repoRoot, "vault/skills"), { recursive: true });
    await mkdir(join(fixture.repoRoot, "skills"), { recursive: true });
    await writeRepoFile(fixture.repoRoot, "core/soul.md", "Local self boundary.");
    await writeRepoFile(fixture.repoRoot, "core/memory.md", "Local memory boundary.");
    await writeRepoFile(fixture.repoRoot, "docs/RUNTIME_CONTRACT.md", "Local runtime contract.");
    await writeRepoFile(fixture.repoRoot, "memory/index.md", "Resident local index.");

    const producer = new LiveTraceProducerModel();
    const firstRunner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: producer
    });
    const firstResult = await firstRunner.runTask("Produce a previous live run trace.");

    const consumer = new LiveTraceAwareModel(firstResult.context_ref);
    const secondRunner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: consumer
    });
    const secondResult = await secondRunner.runTask("Use previous live run trace before answering.");
    const secondContext = await readFile(join(fixture.stateRoot, secondResult.context_ref), "utf8");
    const secondManifest = JSON.parse(await readFile(join(fixture.stateRoot, secondResult.context_manifest_ref ?? ""), "utf8")) as {
      sections: Array<{ title: string; refs: string[]; item_count: number }>;
    };
    const traceSection = secondManifest.sections.find((section) => section.title === "Live Run Trace");

    assert.equal(firstResult.verdict, "no_sop");
    assert.equal(secondResult.verdict, "no_sop");
    assert.equal(consumer.sawLiveTrace, true);
    assert.match(secondContext, /## Live Run Trace/);
    assert.match(secondContext, /tool_results: 1/);
    assert.match(secondContext, /action_counts: use_tool=1/);
    assert.match(secondContext, /action_counts: respond=1/);
    assert.doesNotMatch(secondContext, /LIVE_TRACE_RAW_STATE_WRITE_SHOULD_NOT_APPEAR/);
    assert.equal(traceSection?.item_count, 1);
    assert.equal(traceSection?.refs.includes(firstResult.context_ref), true);
    assert.equal(traceSection?.refs.some((ref) => ref.endsWith("-completion-verification.json")), true);
  } finally {
    await fixture.cleanup();
  }
});

class FailedCommandThenDoneModel implements ModelClient {
  private calls = 0;

  async create(_request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    const outputText = JSON.stringify(this.calls === 1 ? failedCommandEnvelope() : doneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "failed-command-then-done",
      responseId: `response-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

class RateLimitedModel implements ModelClient {
  async create(_request: ModelRequest): Promise<ModelResponse> {
    throw new Error("Model request failed (429 Too Many Requests): api_key SECRET_SHOULD_NOT_APPEAR token SECRET_SHOULD_NOT_APPEAR");
  }
}

class InvalidEnvelopeModel implements ModelClient {
  async create(_request: ModelRequest): Promise<ModelResponse> {
    return {
      provider: "test",
      api: "responses",
      model: "invalid-envelope",
      responseId: "response-invalid-envelope",
      outputText: "RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR",
      raw: { outputText: "RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR" }
    };
  }
}

class MultipleRespondEnvelopeModel implements ModelClient {
  async create(_request: ModelRequest): Promise<ModelResponse> {
    return {
      provider: "test",
      api: "responses",
      model: "multiple-respond-envelope",
      responseId: "response-multiple-respond-envelope",
      outputText: JSON.stringify({
        summary: "MULTI_RESPOND_OUTPUT_SHOULD_NOT_PERSIST",
        actions: [
          {
            type: "respond",
            rationale: "Return the first ambiguous answer.",
            payload: { markdown: "MULTI_RESPOND_OUTPUT_SHOULD_NOT_PERSIST" }
          },
          {
            type: "respond",
            rationale: "Return the second ambiguous answer.",
            payload: { markdown: "MULTI_RESPOND_OUTPUT_SHOULD_NOT_PERSIST" }
          }
        ],
        completion_claim: {
          status: "done",
          verification_refs: []
        }
      })
    };
  }
}

class FinalResponseModel implements ModelClient {
  constructor(private readonly payload: Record<string, unknown>) {}

  async create(_request: ModelRequest): Promise<ModelResponse> {
    return {
      provider: "test",
      api: "responses",
      model: "final-response",
      responseId: "response-final-response",
      outputText: JSON.stringify({
        summary: "Reject this empty response body.",
        actions: [{
          type: "respond",
          rationale: "Return a final response.",
          payload: this.payload
        }],
        completion_claim: {
          status: "done",
          verification_refs: []
        }
      })
    };
  }
}

async function writeRepoHead(store: AgentStore, commit: string, branch = "develop"): Promise<void> {
  await store.writeRepoText(".git/HEAD", `ref: refs/heads/${branch}\n`);
  await store.writeRepoText(`.git/refs/heads/${branch}`, `${commit}\n`);
}

class StructuredDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawStructuredDelegation = false;
  sawDelegatedInstructionsBoundary = false;
  sawSanitizedDelegationObservation = false;

  constructor(
    private readonly rawDelegatedClaimRefs = false,
    private readonly rawDelegatedActionId = false
  ) {}

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) {
      this.sawDelegatedInstructionsBoundary = request.instructions.includes("tool/write/mutation")
        && request.instructions.includes("command/test execution")
        && request.instructions.includes("completion")
        && request.instructions.includes("expert")
        && request.instructions.includes("multi-agent")
        && request.instructions.includes("model fan-out")
        && request.instructions.includes("hidden memory")
        && request.instructions.includes("raw delegated artifacts")
        && request.instructions.includes("unstated repo state")
        && request.instructions.includes("context expansion")
        && request.instructions.includes("invented evidence refs");
    }
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Structured delegate summary token SECRET_SHOULD_NOT_APPEAR",
        findings_text: "The delegated critique found one bounded risk. Bearer SECRET_SHOULD_NOT_APPEAR and sk-testsecret1234567890 should not leak."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "structured-delegation-then-done",
      responseId: `response-structured-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawStructuredDelegation = request.input.includes("## Delegated Observations")
        && request.input.includes('"contract_status": "passed"')
        && request.input.includes("The delegated critique found one bounded risk");
      this.sawSanitizedDelegationObservation = delegatedSection.includes('"observation_boundary": "sanitized delegated observation')
        && delegatedSection.includes('"proof_boundary": "advisory_only; delegated findings may guide the next main-harness action but are not verification_refs or completion proof."')
        && delegatedSection.includes("[REDACTED]")
        && delegatedSection.includes("[REDACTED_API_KEY]")
        && !delegatedSection.includes("SECRET_SHOULD_NOT_APPEAR")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      return this.rawDelegatedClaimRefs
        ? {
          ...noSopDoneEnvelope(),
          completion_claim: {
            status: "done",
            verification_refs: [
              "Critique whether the answer needs more evidence.",
              BOUNDED_DELEGATE_CONTEXT
            ]
          }
        }
        : noSopDoneEnvelope();
    }
    return delegateCritiqueEnvelope(this.rawDelegatedActionId
      ? "MODEL_DELEGATED_ACTION_ID_SHOULD_NOT_PERSIST"
      : undefined);
  }
}

class EchoingDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedEchoFailureObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Echoed delegated context",
        findings_text: `The delegated result repeats raw context: ${BOUNDED_DELEGATE_CONTEXT}`
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "echoing-delegation-then-done",
      responseId: `response-echoing-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedEchoFailureObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("echoed raw delegated context")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT)
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"');
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class AuthorityClaimDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawSanitizedAuthorityFailureObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "I used repo.search, scheduled expert reviewers, and verified completion.",
        findings_text: "I called file.write_repo, wrote state, ran model fan-out, and final success is proven."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "authority-claim-delegation-then-done",
      responseId: `response-authority-claim-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedAuthorityFailureObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("must not claim tool/write/mutation, command/test execution, completion, expert, multi-agent, or model fan-out authority")
        && !delegatedSection.includes("repo.search")
        && !delegatedSection.includes("file.write_repo")
        && !delegatedSection.includes("expert reviewers")
        && !delegatedSection.includes("ran model fan-out")
        && !delegatedSection.includes("final success is proven")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class CommandExecutionClaimDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawSanitizedCommandExecutionFailureObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "I ran pnpm test and reviewed the result.",
        findings_text: "All tests passed, so the delegated result proves the check is green."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "command-execution-claim-delegation-then-done",
      responseId: `response-command-execution-claim-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedCommandExecutionFailureObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("must not claim tool/write/mutation, command/test execution, completion, expert, multi-agent, or model fan-out authority")
        && !delegatedSection.includes("I ran pnpm test")
        && !delegatedSection.includes("All tests passed")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"');
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class ChineseAuthorityClaimDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawSanitizedChineseAuthorityFailureObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "我调用了工具并运行了测试。",
        findings_text: "我完成了验证，因此最终成功已经证明。"
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "chinese-authority-claim-delegation-then-done",
      responseId: `response-chinese-authority-claim-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedChineseAuthorityFailureObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("must not claim tool/write/mutation, command/test execution, completion, expert, multi-agent, or model fan-out authority")
        && !delegatedSection.includes("我调用了工具")
        && !delegatedSection.includes("我运行了测试")
        && !delegatedSection.includes("我完成了验证")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"');
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class WrappedAuthorityClaimDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawSanitizedWrappedAuthorityFailureObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const json = JSON.stringify({
      summary: "A syntactically valid delegated summary.",
      findings_text: "A syntactically valid delegated finding."
    });
    const outputText = isDelegation
      ? `I called repo.search, scheduled expert reviewers, and final success is proven.\n${json}`
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "wrapped-authority-claim-delegation-then-done",
      responseId: `response-wrapped-authority-claim-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedWrappedAuthorityFailureObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("must not claim tool/write/mutation, command/test execution, completion, expert, multi-agent, or model fan-out authority")
        && !delegatedSection.includes("I called repo.search")
        && !delegatedSection.includes("scheduled expert reviewers")
        && !delegatedSection.includes("final success is proven")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"');
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class ForbiddenSourceClaimDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawSanitizedForbiddenSourceFailureObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "I used hidden memory to inspect the issue.",
        findings_text: "I read raw delegated artifact bodies and invented verification_refs for the conclusion."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "forbidden-source-claim-delegation-then-done",
      responseId: `response-forbidden-source-claim-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedForbiddenSourceFailureObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("must not claim hidden memory, raw delegated artifacts")
        && !delegatedSection.includes("I used hidden memory")
        && !delegatedSection.includes("raw delegated artifact bodies")
        && !delegatedSection.includes("invented verification_refs")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"');
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class WrappedRawContextDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedWrappedRawContextObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const json = JSON.stringify({
      summary: "A syntactically valid delegated summary.",
      findings_text: "A syntactically valid delegated finding."
    });
    const outputText = isDelegation
      ? `Wrapper repeats the delegated context: ${BOUNDED_DELEGATE_CONTEXT}\n${json}`
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "wrapped-raw-context-delegation-then-done",
      responseId: `response-wrapped-raw-context-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedWrappedRawContextObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("echoed raw delegated context")
        && !delegatedSection.includes("Wrapper repeats")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT)
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"');
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class ExtraRawContextFieldDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedExtraFieldObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "A syntactically valid delegated summary.",
        findings_text: "A syntactically valid delegated finding.",
        raw_context: BOUNDED_DELEGATE_CONTEXT
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "extra-raw-context-field-delegation-then-done",
      responseId: `response-extra-raw-context-field-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedExtraFieldObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("echoed raw delegated context")
        && !delegatedSection.includes("raw_context")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT)
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"');
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class AlternateDelegationBoundaryThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawSanitizedDelegationObservation = false;
  claimedWriteRef = "";

  constructor(private readonly bindVerificationRef = true) {}

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Alternate boundary summary",
        findings_text: "The delegated critique used a read-only context boundary."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "alternate-delegation-boundary-then-done",
      responseId: `response-alternate-delegation-boundary-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedDelegationObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("The delegated critique used a read-only context boundary.")
        && !delegatedSection.includes("Write a bounded critique of whether the answer needs more evidence.")
        && !delegatedSection.includes("Read-only analysis only")
        && !delegatedSection.includes("file.write_repo");
      return stateWriteEnvelope();
    }
    if (this.mainCalls > 2) {
      this.claimedWriteRef = latestToolResultRef(request.input);
      if (!this.bindVerificationRef) return doneEnvelope();
      return doneEnvelopeWithVerificationRefs([this.claimedWriteRef]);
    }
    return alternateBoundaryDelegateContextEnvelope();
  }
}

class ReadOnlyMutationQuestionDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawSanitizedDelegationObservation = false;
  claimedWriteRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Read-only mutation question summary",
        findings_text: "The delegated evaluation only assessed whether a later main-harness change is needed."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "read-only-mutation-question-delegation-then-done",
      responseId: `response-read-only-mutation-question-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedDelegationObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("only assessed whether a later main-harness change is needed")
        && !delegatedSection.includes("Review whether to apply a patch for this change")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      return stateWriteEnvelope();
    }
    if (this.mainCalls > 2) {
      this.claimedWriteRef = latestToolResultRef(request.input);
      return doneEnvelopeWithVerificationRefs([this.claimedWriteRef]);
    }
    return readOnlyMutationQuestionDelegateEnvelope();
  }
}

class LatestContextAnalysisDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawSanitizedDelegationObservation = false;
  claimedWriteRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Latest context analysis summary",
        findings_text: "The delegated analysis reviewed the latest context phrase without command execution."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "latest-context-analysis-delegation-then-done",
      responseId: `response-latest-context-analysis-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedDelegationObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("reviewed the latest context phrase")
        && !delegatedSection.includes("Analyze whether latest context notes contain bounded risks.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      return stateWriteEnvelope();
    }
    if (this.mainCalls > 2) {
      this.claimedWriteRef = latestToolResultRef(request.input);
      return doneEnvelopeWithVerificationRefs([this.claimedWriteRef]);
    }
    return latestContextAnalysisDelegateEnvelope();
  }
}

class StateWriteThenDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawPreDelegationWriteObservation = false;
  sawSanitizedDelegationObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Pre-delegation evidence boundary summary",
        findings_text: "The delegated critique came after an earlier write and still needs later independent proof."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "state-write-delegation-then-done",
      responseId: `response-state-write-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      this.sawPreDelegationWriteObservation = request.input.includes("## Tool Observations")
        && request.input.includes("file.write_state")
        && request.input.includes("observations/no-sop-smoke.txt");
      return alternateBoundaryDelegateContextEnvelope();
    }
    if (this.mainCalls > 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedDelegationObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("still needs later independent proof")
        && !delegatedSection.includes("Write a bounded critique of whether the answer needs more evidence.");
      return doneEnvelope();
    }
    return stateWriteEnvelope();
  }
}

class ArbitraryRefAfterDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawDelegatedObservation = false;
  claimedRef = "made_up_delegated_result_ref";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Arbitrary ref boundary summary",
        findings_text: "The delegated critique is useful context but not proof."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "arbitrary-ref-after-delegation-then-done",
      responseId: `response-arbitrary-ref-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawDelegatedObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("not proof");
      return doneEnvelopeWithVerificationRefs([this.claimedRef]);
    }
    return delegateCritiqueEnvelope();
  }
}

class DelegatedRefAsProofThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawDelegatedObservation = false;
  delegatedProofRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Delegated proof boundary summary",
        findings_text: "The delegated critique is useful context but not independent verification."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "delegated-ref-as-proof-then-done",
      responseId: `response-delegated-proof-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawDelegatedObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("not independent verification");
      this.delegatedProofRef = delegatedSection.match(/"id": "([^"]+)"/)?.[1] ?? "";
      return doneEnvelopeWithVerificationRefs([this.delegatedProofRef]);
    }
    return delegateCritiqueEnvelope();
  }
}

class ContainsDelegatedRefAsArbitraryProofThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawDelegatedObservation = false;
  delegatedProofRef = "";
  claimedRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Delegated substring boundary summary",
        findings_text: "The delegated critique is useful context but not independent verification."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "contains-delegated-ref-as-arbitrary-proof-then-done",
      responseId: `response-delegated-substring-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawDelegatedObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("not independent verification");
      this.delegatedProofRef = delegatedSection.match(/"id": "([^"]+)"/)?.[1] ?? "";
      this.claimedRef = `not-${this.delegatedProofRef}-proof`;
      return doneEnvelopeWithVerificationRefs([this.claimedRef]);
    }
    return delegateCritiqueEnvelope();
  }
}

class SuccessfulDelegationThenFailedReadOnlyToolThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawDelegatedObservation = false;
  sawFailedReadOnlyToolObservation = false;
  claimedFailedReadOnlyRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Read-only failure proof boundary summary",
        findings_text: "The delegated critique is useful context but still needs successful main-harness evidence."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "successful-delegation-failed-read-only-tool-then-done",
      responseId: `response-failed-read-only-proof-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawDelegatedObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("still needs successful main-harness evidence");
      return failedFileReadEnvelope();
    }
    if (this.mainCalls > 2) {
      this.sawFailedReadOnlyToolObservation = request.input.includes("## Tool Observations")
        && request.input.includes('"tool": "file.read"')
        && request.input.includes('"ok": false')
        && request.input.includes('"side_effect_level": "none"');
      this.claimedFailedReadOnlyRef = latestToolResultRef(request.input);
      return doneEnvelopeWithVerificationRefs([this.claimedFailedReadOnlyRef]);
    }
    return delegateCritiqueEnvelope();
  }
}

class MultiDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawDelegateLimitObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "First delegated summary",
        findings_text: "The first delegated critique completed within the one-per-round boundary."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "multi-delegation-then-done",
      responseId: `response-multi-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawDelegateLimitObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"dispatch_failure_kind": "dispatch_limit_exceeded"')
        && delegatedSection.includes('"result_failure_kind": "dispatch_limit_exceeded"')
        && delegatedSection.includes("delegate_agent supports at most 1 action per model round")
        && delegatedSection.includes("The first delegated critique completed within the one-per-round boundary.")
        && !delegatedSection.includes("Run a second critique in the same model round.");
    }
    return this.mainCalls > 1 ? doneEnvelope() : multiDelegateCritiqueEnvelope();
  }
}

class TwoRoundDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFirstDelegationObservation = false;
  sawSecondDelegationObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: `Round ${this.delegationCalls} delegated summary`,
        findings_text: `The round ${this.delegationCalls} delegated critique stayed within the per-round boundary.`
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "two-round-delegation-then-done",
      responseId: `response-two-round-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    const delegatedSection = delegatedObservationsSection(request.input);
    if (this.mainCalls === 2) {
      this.sawFirstDelegationObservation = delegatedSection.includes("round 1 delegated critique stayed within the per-round boundary");
      return secondRoundDelegateCritiqueEnvelope();
    }
    if (this.mainCalls > 2) {
      this.sawSecondDelegationObservation = delegatedSection.includes("round 2 delegated critique stayed within the per-round boundary")
        && !delegatedSection.includes("delegate_agent supports at most 1 action per model round");
      return doneEnvelopeWithVerificationRefs(["main_harness_two_round_delegation_check"]);
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedFailedObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-then-done",
      responseId: `response-invalid-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedFailedObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("Delegated model output was not valid JSON")
        && !delegatedSection.includes("plain text instead of json")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
    }
    return this.mainCalls > 1 ? doneEnvelope() : delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenValidDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawMainHarnessRecoveryHint = false;
  sawLaterSuccessfulDelegationObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? this.delegationCalls === 1
        ? JSON.stringify({
          summary: "The test suite was executed and passed.",
          findings_text: "No issue."
        })
        : JSON.stringify({
          summary: "Later valid delegated summary",
          findings_text: "The later delegated critique is valid but still not main-harness recovery evidence."
        })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-valid-delegation-then-done",
      responseId: `response-invalid-valid-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    const delegatedSection = delegatedObservationsSection(request.input);
    if (this.mainCalls === 2) {
      this.sawMainHarnessRecoveryHint = delegatedSection.includes('"recovery_hint"')
        && delegatedSection.includes("later successful write/run evidence plus a bound non-delegated verification ref")
        && delegatedSection.includes("otherwise report blocked")
        && !delegatedSection.includes("test suite was executed")
        && !delegatedSection.includes("later valid bounded delegation");
      return secondRoundDelegateCritiqueEnvelope();
    }
    if (this.mainCalls > 2) {
      this.sawLaterSuccessfulDelegationObservation = delegatedSection.includes('"contract_status": "passed"')
        && delegatedSection.includes("not main-harness recovery evidence");
      return doneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenStateWriteThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedFailedObservation = false;
  sawRecoveryHint = false;
  sawStateWriteObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-state-write-then-done",
      responseId: `response-invalid-delegation-recovery-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedFailedObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("Delegated model output was not valid JSON")
        && !delegatedSection.includes("plain text instead of json")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      this.sawRecoveryHint = delegatedSection.includes('"recovery_hint"')
        && delegatedSection.includes("recover with main-harness evidence");
      return stateWriteEnvelope();
    }
    if (this.mainCalls > 2) {
      this.sawStateWriteObservation = request.input.includes("## Tool Observations")
        && request.input.includes("file.write_state")
        && request.input.includes("observations/no-sop-smoke.txt");
      return noSopDoneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenStateWriteThenVerifiedDoneModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedFailedObservation = false;
  sawRecoveryHint = false;
  sawStateWriteObservation = false;
  claimedWriteRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-state-write-verified-then-done",
      responseId: `response-invalid-delegation-recovery-verified-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedFailedObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("Delegated model output was not valid JSON")
        && !delegatedSection.includes("plain text instead of json")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      this.sawRecoveryHint = delegatedSection.includes('"recovery_hint"')
        && delegatedSection.includes("recover with main-harness evidence");
      return stateWriteEnvelope();
    }
    if (this.mainCalls > 2) {
      this.sawStateWriteObservation = request.input.includes("## Tool Observations")
        && request.input.includes("file.write_state")
        && request.input.includes("observations/no-sop-smoke.txt");
      this.claimedWriteRef = latestToolResultRef(request.input);
      return doneEnvelopeWithVerificationRefs([this.claimedWriteRef]);
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenStateWriteArtifactVerifiedDoneModel implements ModelClient {
  private mainCalls = 0;
  claimedWriteArtifactRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-write-artifact-verified-done",
      responseId: `response-invalid-delegation-write-artifact-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) return stateWriteEnvelope();
    if (this.mainCalls > 2) {
      this.claimedWriteArtifactRef = latestToolArtifactRef(request.input);
      return doneEnvelopeWithVerificationRefs([this.claimedWriteArtifactRef]);
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenUnclaimedStateWriteThenReadOnlyDoneModel implements ModelClient {
  private mainCalls = 0;
  unclaimedWriteRef = "";
  claimedReadOnlyRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-unclaimed-write-read-only-done",
      responseId: `response-invalid-delegation-unclaimed-write-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) return stateWriteAndFileReadEnvelope();
    if (this.mainCalls > 2) {
      this.unclaimedWriteRef = latestToolResultRef(request.input);
      this.claimedReadOnlyRef = toolResultRefForTool(request.input, "file.read");
      return doneEnvelopeWithVerificationRefs([this.claimedReadOnlyRef]);
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenStateOnlyThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedFailedObservation = false;
  sawRecoveryHint = false;
  sawHarnessStateObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-state-only-then-done",
      responseId: `response-invalid-delegation-state-only-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedFailedObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("Delegated model output was not valid JSON")
        && !delegatedSection.includes("plain text instead of json")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      this.sawRecoveryHint = delegatedSection.includes('"recovery_hint"')
        && delegatedSection.includes("recover with main-harness evidence");
      return harnessStateActionsEnvelope();
    }
    if (this.mainCalls > 2) {
      this.sawHarnessStateObservation = request.input.includes("## Harness State Observations")
        && request.input.includes("Recorded model evidence note")
        && request.input.includes("Recorded model working checkpoint");
      return noSopDoneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenReadOnlyToolThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedFailedObservation = false;
  sawReadOnlyToolObservation = false;
  claimedReadOnlyRef = "";

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-read-only-tool-then-done",
      responseId: `response-invalid-delegation-read-only-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls === 2) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedFailedObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("Delegated model output was not valid JSON")
        && !delegatedSection.includes("plain text instead of json")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      return fileReadEnvelope();
    }
    if (this.mainCalls > 2) {
      this.sawReadOnlyToolObservation = request.input.includes("## Tool Observations")
        && request.input.includes('"tool": "file.read"')
        && request.input.includes('"side_effect_level": "none"');
      this.claimedReadOnlyRef = latestToolResultRef(request.input);
      return doneEnvelopeWithVerificationRefs([this.claimedReadOnlyRef]);
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenBlockedModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedFailedObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-then-blocked",
      responseId: `response-invalid-delegation-blocked-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedFailedObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("Delegated model output was not valid JSON")
        && !delegatedSection.includes("plain text instead of json")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
    }
    return this.mainCalls > 1 ? blockedEnvelope() : delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenBlockedSopModel implements ModelClient {
  private mainCalls = 0;
  sawSanitizedFailedObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-then-blocked-sop",
      responseId: `response-invalid-delegation-blocked-sop-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedFailedObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_output_contract_failed"')
        && delegatedSection.includes("Delegated model output was not valid JSON")
        && !delegatedSection.includes("plain text instead of json")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
    }
    return this.mainCalls > 1 ? blockedSopEnvelope() : delegateCritiqueEnvelope();
  }
}

class DelegationRequestFailureThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawAuthoringRecoveryRequirement = false;
  sawSanitizedRequestFailureObservation = false;
  sawCompletionGateRecoveryHint = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) {
      this.delegationCalls += 1;
      throw new Error("Model request failed (429 Too Many Requests): api_key SECRET_SHOULD_NOT_APPEAR token SECRET_SHOULD_NOT_APPEAR");
    }
    if (this.mainCalls === 0) {
      this.sawAuthoringRecoveryRequirement = request.instructions.includes("later successful write/run evidence plus a bound non-delegated verification ref")
        && request.instructions.includes("otherwise report blocked");
    }
    const outputText = JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "delegation-request-failure-then-done",
      responseId: `response-delegation-request-failure-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawSanitizedRequestFailureObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "delegated_model_request_failed"')
        && delegatedSection.includes("429 Too Many Requests")
        && delegatedSection.includes("[REDACTED]")
        && !delegatedSection.includes("SECRET_SHOULD_NOT_APPEAR")
        && !delegatedSection.includes('"raw_output_preview"')
        && !delegatedSection.includes('"output_text"')
        && !delegatedSection.includes("Critique whether the answer needs more evidence.")
        && !delegatedSection.includes(BOUNDED_DELEGATE_CONTEXT);
      this.sawCompletionGateRecoveryHint = delegatedSection.includes('"recovery_hint"')
        && delegatedSection.includes("later successful write/run evidence plus a bound non-delegated verification ref")
        && delegatedSection.includes("otherwise report blocked");
    }
    return this.mainCalls > 1 ? doneEnvelope() : delegateCritiqueEnvelope();
  }
}

class OversizedDelegatedOutputThenDoneModel implements ModelClient {
  private mainCalls = 0;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Oversized delegated summary".padEnd(DELEGATED_AGENT_SUMMARY_MAX_CHARS, "."),
        findings_text: "x".repeat(DELEGATED_AGENT_FINDINGS_MAX_CHARS + 1)
      })
      : JSON.stringify(this.nextMainEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "oversized-delegated-output-then-done",
      responseId: `response-oversized-delegated-output-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(): Record<string, unknown> {
    this.mainCalls += 1;
    return this.mainCalls > 1 ? doneEnvelope() : delegateCritiqueEnvelope();
  }
}

function delegatedObservationsSection(input: string): string {
  const start = input.indexOf("## Delegated Observations");
  if (start === -1) return "";
  const rest = input.slice(start);
  const nextSection = rest.indexOf("\n\n## ", "## Delegated Observations".length);
  return nextSection === -1 ? rest : rest.slice(0, nextSection);
}

class UnsupportedDelegationPayloadThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedDelegationObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The unsupported payload guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "unsupported-delegation-payload-then-done",
      responseId: `response-unsupported-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedDelegationObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload may only include task and context")
        && !delegatedSection.includes("expert_reviewer")
        && !delegatedSection.includes("gpt-specialist");
    }
    return this.mainCalls > 1 ? doneEnvelope() : unsupportedDelegatePayloadEnvelope();
  }
}

class MissingDelegationBoundaryThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedBoundaryObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The missing boundary guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "missing-delegation-boundary-then-done",
      responseId: `response-missing-delegation-boundary-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedBoundaryObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.context must state no tool/write/mutation authority")
        && !delegatedSection.includes("Relevant docs were inspected but no authority boundary was named.");
    }
    return this.mainCalls > 1 ? doneEnvelope() : missingBoundaryDelegateContextEnvelope();
  }
}

class MissingDelegationOutputShapeThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedOutputShapeObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The missing output shape guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "missing-delegation-output-shape-then-done",
      responseId: `response-missing-delegation-output-shape-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedOutputShapeObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.context must state expected delegated output shape")
        && !delegatedSection.includes(DELEGATE_CONTEXT_WITH_GENERIC_OUTPUT_SHAPE);
    }
    return this.mainCalls > 1 ? doneEnvelope() : missingOutputShapeDelegateContextEnvelope();
  }
}

class MissingDelegationSourceBoundaryThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedSourceBoundaryObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The missing source boundary guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "missing-delegation-source-boundary-then-done",
      responseId: `response-missing-delegation-source-boundary-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedSourceBoundaryObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.context must state delegated analysis may use only explicit payload context or named evidence refs")
        && !delegatedSection.includes(DELEGATE_CONTEXT_WITHOUT_SOURCE_BOUNDARY);
    }
    return this.mainCalls > 1 ? doneEnvelope() : missingSourceBoundaryDelegateContextEnvelope();
  }
}

class ContradictoryDelegationBoundaryThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedBoundaryObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The contradictory boundary guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "contradictory-delegation-boundary-then-done",
      responseId: `response-contradictory-delegation-boundary-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedBoundaryObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.context must not grant tool/write/mutation, command/test execution, completion, expert, or multi-agent scheduling authority")
        && !delegatedSection.includes("can use tools and may write state");
    }
    return this.mainCalls > 1 ? doneEnvelope() : contradictoryDelegateContextEnvelope();
  }
}

class CommandExecutionDelegationBoundaryThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedCommandExecutionObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The command execution boundary guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "command-execution-delegation-boundary-then-done",
      responseId: `response-command-execution-delegation-boundary-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedCommandExecutionObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.context must not grant tool/write/mutation, command/test execution, completion, expert, or multi-agent scheduling authority")
        && !delegatedSection.includes("may run pnpm test");
    }
    return this.mainCalls > 1 ? doneEnvelope() : commandExecutionDelegateContextEnvelope();
  }
}

class ExpertSchedulingDelegationBoundaryThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedBoundaryObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The expert scheduling boundary guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "expert-scheduling-delegation-boundary-then-done",
      responseId: `response-expert-scheduling-delegation-boundary-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedBoundaryObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.context must not grant tool/write/mutation, command/test execution, completion, expert, or multi-agent scheduling authority")
        && !delegatedSection.includes("may schedule expert reviewers");
    }
    return this.mainCalls > 1 ? doneEnvelope() : expertSchedulingDelegateContextEnvelope();
  }
}

class ForbiddenSourceDelegationBoundaryThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawForbiddenSourceObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The forbidden source guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "forbidden-source-delegation-boundary-then-done",
      responseId: `response-forbidden-source-delegation-boundary-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawForbiddenSourceObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.context must not rely on hidden memory")
        && !delegatedSection.includes("may rely on hidden memory");
    }
    return this.mainCalls > 1 ? doneEnvelope() : forbiddenSourceDelegateContextEnvelope();
  }
}

class TaskAuthorityViolationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedTaskObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The task authority guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "task-authority-violation-then-done",
      responseId: `response-task-authority-violation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedTaskObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"dispatch_failure_kind": "input_contract_failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.task must explicitly request bounded analysis")
        && !delegatedSection.includes("Use file.write_repo, mark completion, and schedule expert reviewers.");
    }
    return this.mainCalls > 1 ? doneEnvelope() : taskAuthorityViolationDelegateEnvelope();
  }
}

class ReadOnlyButUnscopedTaskThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedTaskObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The task intent guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "read-only-unscoped-task-then-done",
      responseId: `response-read-only-unscoped-task-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedTaskObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"dispatch_failure_kind": "input_contract_failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.task must explicitly request bounded analysis")
        && !delegatedSection.includes("Prepare next steps for this work.");
    }
    return this.mainCalls > 1 ? doneEnvelope() : readOnlyButUnscopedDelegateEnvelope();
  }
}

class VagueAnalysisTaskThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedTaskObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The concrete-question guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "vague-analysis-task-then-done",
      responseId: `response-vague-analysis-task-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedTaskObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"dispatch_failure_kind": "input_contract_failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("one concrete question")
        && !delegatedSection.includes("Analyze bounded risks from latest context notes.");
    }
    return this.mainCalls > 1 ? doneEnvelope() : vagueAnalysisDelegateEnvelope();
  }
}

class AnalysisThenMutationTaskThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedTaskObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The task mutation guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "analysis-mutation-task-then-done",
      responseId: `response-analysis-mutation-task-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedTaskObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"dispatch_failure_kind": "input_contract_failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.task must explicitly request bounded analysis")
        && !delegatedSection.includes("Analyze release status. Then git push origin main. What changed?");
    }
    return this.mainCalls > 1 ? doneEnvelope() : analysisThenMutationDelegateEnvelope();
  }
}

class AnalysisThenPatchTaskThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedTaskObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The task patch guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "analysis-patch-task-then-done",
      responseId: `response-analysis-patch-task-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedTaskObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"dispatch_failure_kind": "input_contract_failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.task must explicitly request bounded analysis")
        && !delegatedSection.includes("Analyze and apply a patch");
    }
    return this.mainCalls > 1 ? doneEnvelope() : analysisThenPatchDelegateEnvelope();
  }
}

class AnalysisThenDirectReadTaskThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedTaskObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The task command execution guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "analysis-direct-read-task-then-done",
      responseId: `response-analysis-direct-read-task-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedTaskObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"dispatch_failure_kind": "input_contract_failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("command/test execution")
        && !delegatedSection.includes("Read files under docs");
    }
    return this.mainCalls > 1 ? doneEnvelope() : analysisThenDirectReadDelegateEnvelope();
  }
}

class ChineseAnalysisThenMutationTaskThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedTaskObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The Chinese task mutation guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "chinese-analysis-mutation-task-then-done",
      responseId: `response-chinese-analysis-mutation-task-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      const delegatedSection = delegatedObservationsSection(request.input);
      this.sawFailedTaskObservation = delegatedSection.includes('"contract_status": "failed"')
        && delegatedSection.includes('"dispatch_failure_kind": "input_contract_failed"')
        && delegatedSection.includes('"result_failure_kind": "input_contract_failed"')
        && delegatedSection.includes("delegate_agent.payload.task must explicitly request bounded analysis")
        && !delegatedSection.includes("分析和修改代码");
    }
    return this.mainCalls > 1 ? doneEnvelope() : chineseAnalysisThenMutationDelegateEnvelope();
  }
}

class MalformedDelegationPayloadThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedDelegationObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The malformed payload guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "malformed-delegation-payload-then-done",
      responseId: `response-malformed-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      this.sawFailedDelegationObservation = request.input.includes("## Delegated Observations")
        && request.input.includes('"contract_status": "failed"')
        && request.input.includes('"result_failure_kind": "input_contract_failed"')
        && request.input.includes("delegate_agent.payload.context must be a non-empty string");
      return doneEnvelope();
    }
    return malformedDelegatePayloadEnvelope();
  }
}

class OversizedDelegationPayloadThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;
  sawFailedDelegationObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The oversized payload guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope(request));
    return {
      provider: "test",
      api: "responses",
      model: "oversized-delegation-payload-then-done",
      responseId: `response-oversized-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(request: ModelRequest): Record<string, unknown> {
    this.mainCalls += 1;
    if (this.mainCalls > 1) {
      this.sawFailedDelegationObservation = request.input.includes("## Delegated Observations")
        && request.input.includes('"contract_status": "failed"')
        && request.input.includes('"result_failure_kind": "input_contract_failed"')
        && request.input.includes(`delegate_agent.payload.context must be at most ${DELEGATE_AGENT_CONTEXT_MAX_CHARS} chars`);
      return doneEnvelope();
    }
    return oversizedDelegatePayloadEnvelope();
  }
}

class OversizedDelegationTaskThenDoneModel implements ModelClient {
  private mainCalls = 0;
  delegationCalls = 0;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    if (isDelegation) this.delegationCalls += 1;
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "This delegated response should not be requested.",
        findings_text: "The oversized task guard failed to short-circuit."
      })
      : JSON.stringify(this.nextMainEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "oversized-delegation-task-then-done",
      responseId: `response-oversized-delegation-task-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(): Record<string, unknown> {
    this.mainCalls += 1;
    return this.mainCalls > 1 ? doneEnvelope() : oversizedDelegateTaskEnvelope();
  }
}

class StateWriteThenNoSopModel implements ModelClient {
  private calls = 0;

  async create(_request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    const outputText = JSON.stringify(this.calls === 1 ? stateWriteEnvelope() : noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "state-write-then-no-sop",
      responseId: `response-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

class TaskReferenceAwareModel implements ModelClient {
  sawTaskReference = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.sawTaskReference = request.input.includes("## Task References")
      && request.input.includes("VISIBLE_LIVE_TASK_REFERENCE")
      && !request.input.includes("HIDDEN_LIVE_TASK_REFERENCE_LINE");
    const outputText = JSON.stringify(noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "task-reference-aware",
      responseId: "response-task-reference",
      outputText,
      raw: { outputText }
    };
  }
}

class RuntimeConfigAwareModel implements ModelClient {
  sawRuntimeConfig = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.sawRuntimeConfig = request.input.includes("## Runtime Config")
      && request.input.includes("active_model: runtime-context-model")
      && request.input.includes("review_tick_enabled: false")
      && request.input.includes("runtime_source: repo:config.jsonl#4")
      && !request.input.includes("AUTH_SECRET_SHOULD_NOT_APPEAR");
    const outputText = JSON.stringify(noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "runtime-config-aware",
      responseId: "response-runtime-config",
      outputText,
      raw: { outputText }
    };
  }
}

class LiveTraceProducerModel implements ModelClient {
  private calls = 0;

  async create(_request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    const outputText = JSON.stringify(this.calls === 1 ? liveTraceStateWriteEnvelope() : noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "live-trace-producer",
      responseId: `response-live-trace-producer-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

class LiveTraceAwareModel implements ModelClient {
  sawLiveTrace = false;

  constructor(private readonly priorContextRef: string) {}

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.sawLiveTrace = request.input.includes("## Live Run Trace")
      && request.input.includes(`context_ref: ${this.priorContextRef}`)
      && request.input.includes("tool_results: 1")
      && request.input.includes("action_counts: use_tool=1")
      && request.input.includes("action_counts: respond=1")
      && !request.input.includes("LIVE_TRACE_RAW_STATE_WRITE_SHOULD_NOT_APPEAR");
    const outputText = JSON.stringify(noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "live-trace-aware",
      responseId: "response-live-trace-aware",
      outputText,
      raw: { outputText }
    };
  }
}

class EpisodeRecallAwareModel implements ModelClient {
  sawEpisodeRecall = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.sawEpisodeRecall = request.input.includes("## Episode Recall")
      && request.input.includes("Prior Feishu heartbeat restart fixed duplicate status drift")
      && !request.input.includes("RAW_PRIOR_FINAL_RESPONSE_SHOULD_NOT_BE_DUMPED");
    const outputText = JSON.stringify(noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "episode-recall-aware",
      responseId: "response-episode-recall",
      outputText,
      raw: { outputText }
    };
  }
}

class HarnessStateActionsThenDoneModel implements ModelClient {
  private calls = 0;
  sawHarnessObservations = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    if (this.calls > 1) {
      this.sawHarnessObservations = request.input.includes("## Harness State Observations")
        && request.input.includes("Recorded model evidence note")
        && request.input.includes("Recorded model working checkpoint");
    }
    const outputText = JSON.stringify(this.calls === 1 ? harnessStateActionsEnvelope() : noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "harness-state-actions-then-done",
      responseId: `response-harness-state-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

class GovernanceActionsThenDoneModel implements ModelClient {
  private calls = 0;
  sawGovernanceObservations = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    if (this.calls > 1) {
      this.sawGovernanceObservations = request.input.includes("## Harness State Observations")
        && request.input.includes("Recorded memory proposal candidate")
        && request.input.includes("Recorded model audit request");
    }
    const outputText = JSON.stringify(this.calls === 1 ? governanceActionsEnvelope() : noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "governance-actions-then-done",
      responseId: `response-governance-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

class StateOnlySopProposalThenDoneModel implements ModelClient {
  private calls = 0;
  sawSopObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    if (this.calls > 1) {
      this.sawSopObservation = request.input.includes("## Harness State Observations")
        && request.input.includes("Recorded state-only SOP draft candidate");
    }
    const outputText = JSON.stringify(this.calls === 1 ? stateOnlySopProposalEnvelope() : noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "state-only-sop-proposal-then-done",
      responseId: `response-state-only-sop-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

class PauseAutonomyThenDoneModel implements ModelClient {
  private calls = 0;
  sawPauseObservation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    if (this.calls > 1) {
      this.sawPauseObservation = request.input.includes("## Harness State Observations")
        && request.input.includes("Recorded autonomy pause signal");
    }
    const outputText = JSON.stringify(this.calls === 1 ? pauseAutonomyEnvelope() : noSopDoneEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "pause-autonomy-then-done",
      responseId: `response-pause-autonomy-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

function failedCommandEnvelope(): Record<string, unknown> {
  return {
    summary: "Try a bounded command that will fail.",
    actions: [{
      type: "use_tool",
      rationale: "The task asks for a local command run.",
      payload: {
        tool: "command.run",
        arguments: {
          command: "definitely-missing-agent-command",
          args: [],
          cwd: "repo",
          timeout_ms: 1000,
          max_output_chars: 1000,
          side_effect_level: "none"
        }
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

const BOUNDED_DELEGATE_CONTEXT = "No tool, write, or mutation authority is available; completion remains with the main harness. Delegated analysis may use only this explicit payload context and named evidence refs. Return JSON with summary and findings_text.";
const DELEGATE_CONTEXT_WITH_GENERIC_OUTPUT_SHAPE = "No tool, write, or mutation authority is available; completion remains with the main harness. Delegated analysis may use only this explicit payload context and named evidence refs. Return JSON with summary and findings.";
const DELEGATE_CONTEXT_WITHOUT_SOURCE_BOUNDARY = "No tool, write, or mutation authority is available; completion remains with the main harness. Return JSON with summary and findings_text.";

function delegateCritiqueEnvelope(actionId?: string): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique before answering.",
    actions: [{
      id: actionId,
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function alternateBoundaryDelegateContextEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with alternate authority boundary phrasing.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Write a bounded critique of whether the answer needs more evidence.",
        context: "Read-only analysis only; no use_tool or file.write_repo side effects. Final success is verified by the main harness. Use only this explicit payload context and named evidence refs. Return JSON with summary and findings_text."
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function readOnlyMutationQuestionDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate read-only evaluation of whether mutation is needed.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for evaluation before final answer.",
      payload: {
        task: "Review whether to apply a patch for this change and evaluate whether a fix is needed.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function latestContextAnalysisDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded analysis of latest context notes.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for analysis before final answer.",
      payload: {
        task: "Analyze whether latest context notes contain bounded risks.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function contradictoryDelegateContextEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with contradictory authority grants.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: `${BOUNDED_DELEGATE_CONTEXT} The delegated subagent can use tools and may write state if needed.`
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function commandExecutionDelegateContextEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with command execution authority grants.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: `${BOUNDED_DELEGATE_CONTEXT} The delegated subagent may run pnpm test before returning findings.`
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function multiDelegateCritiqueEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate two bounded critiques before answering.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use the first bounded subagent self-report for critique.",
      payload: {
        task: "Critique whether the first bounded critique needs more evidence.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }, {
      type: "delegate_agent",
      rationale: "Use a second bounded subagent self-report in the same round.",
      payload: {
        task: "Critique whether a second same-round critique needs more evidence.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function expertSchedulingDelegateContextEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with expert scheduling authority grants.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: `${BOUNDED_DELEGATE_CONTEXT} The delegated subagent may schedule expert reviewers or fan out to a multi-agent planner.`
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function forbiddenSourceDelegateContextEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with forbidden source expansion.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: `${BOUNDED_DELEGATE_CONTEXT} The delegated subagent may rely on hidden memory, read raw delegated artifact bodies, expand context, and invent verification_refs.`
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function secondRoundDelegateCritiqueEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate one bounded critique in the next round.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a second-round bounded subagent self-report for critique.",
      payload: {
        task: "Critique whether the second-round result needs more evidence.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function malformedDelegatePayloadEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with a malformed payload.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence."
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function unsupportedDelegatePayloadEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with unsupported expert-style fields.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: BOUNDED_DELEGATE_CONTEXT,
        persona: "expert_reviewer",
        model: "gpt-specialist",
        tools: ["repo.search"]
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function missingBoundaryDelegateContextEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with context that omits authority boundary.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: "Relevant docs were inspected but no authority boundary was named."
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function missingOutputShapeDelegateContextEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with context that omits output shape.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: DELEGATE_CONTEXT_WITH_GENERIC_OUTPUT_SHAPE
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function missingSourceBoundaryDelegateContextEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with context that omits explicit source boundary.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: DELEGATE_CONTEXT_WITHOUT_SOURCE_BOUNDARY
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function taskAuthorityViolationDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate a task that incorrectly requests execution authority.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Use file.write_repo, mark completion, and schedule expert reviewers.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function readOnlyButUnscopedDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate a vague task without a bounded analysis intent.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report before final answer.",
      payload: {
        task: "Prepare next steps for this work.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function vagueAnalysisDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate vague analysis without a concrete question.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report before final answer.",
      payload: {
        task: "Analyze bounded risks from latest context notes.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function analysisThenMutationDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate a task that mixes analysis with mutation intent.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report before final answer.",
      payload: {
        task: "Analyze release status. Then git push origin main. What changed?",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function analysisThenPatchDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate a task that mixes analysis with patch application intent.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report before final answer.",
      payload: {
        task: "Analyze and apply a patch for the missing completion proof.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function analysisThenDirectReadDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate a task that incorrectly requests direct file reading.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report before final answer.",
      payload: {
        task: "Read files under docs and analyze whether the evidence is sufficient.",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function chineseAnalysisThenMutationDelegateEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate a Chinese task that mixes analysis with mutation intent.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report before final answer.",
      payload: {
        task: "分析和修改代码。",
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function oversizedDelegatePayloadEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with an oversized payload.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: "x".repeat(DELEGATE_AGENT_CONTEXT_MAX_CHARS + 1)
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function oversizedDelegateTaskEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique with an oversized task.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "x".repeat(DELEGATE_AGENT_TASK_MAX_CHARS + 1),
        context: BOUNDED_DELEGATE_CONTEXT
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function harnessStateActionsEnvelope(): Record<string, unknown> {
  return {
    summary: "Persist state-only evidence and a working checkpoint before answering.",
    actions: [
      {
        type: "record_evidence",
        rationale: "The run should preserve a bounded state note without using repo or external writes.",
        payload: {
          summary: "state-only harness evidence note",
          markdown: "This state-only harness evidence note was recorded by the live runner."
        }
      },
      {
        type: "update_working_state",
        rationale: "The run should checkpoint current progress before the final answer.",
        payload: {
          checkpoint: {
            goal: "Record state-only harness progress before answering.",
            current_step: "captured harness state",
            known_constraints: ["state-only", "no repo writes"],
            open_questions: [],
            next_action: "answer after harness state observation"
          }
        }
      }
    ],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function governanceActionsEnvelope(): Record<string, unknown> {
  return {
    summary: "Record candidate governance actions before answering.",
    actions: [
      {
        type: "propose_memory",
        rationale: "The run identified a reusable memory candidate that still needs review.",
        payload: {
          scope: "local",
          summary: "Evidence-gated memory promotion boundary",
          content: "Only promote memory after evidence-backed review; never write core memory directly from a model proposal."
        }
      },
      {
        type: "request_audit",
        rationale: "The memory candidate should be checked before any durable promotion.",
        payload: {
          target_type: "memory",
          target_ref: "candidate-memory",
          question: "Does this memory candidate have enough cited local evidence to become durable memory?",
          criteria: ["has evidence refs", "does not mutate core memory directly"]
        }
      }
    ],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function stateOnlySopProposalEnvelope(): Record<string, unknown> {
  return {
    summary: "Record a state-only SOP candidate before answering.",
    actions: [{
      type: "propose_sop",
      rationale: "The run learned a reusable procedure candidate but should not audit or promote it yet.",
      payload: {
        title: "State-only harness SOP draft",
        trigger: "Use this when a live harness run should preserve a reusable procedure candidate before a final answer without granting promotion authority.",
        procedure: [
          "Capture the candidate as a local state SOP draft with concrete evidence refs.",
          "Return the draft refs as harness state observations before the final model round.",
          "Leave audit, promotion, and skill creation to explicit later review gates."
        ],
        required_tools: ["review.audit-sop"],
        verification: "Confirm the draft exists under the selected state root and the next context bundle shows it in the SOP Evolution Ledger.",
        failure_modes: [
          "If the draft lacks evidence or a repeatable trigger, revise it before any audit.",
          "If an active skill already covers the trigger, retire or archive this SOP draft instead of promoting it."
        ],
        artifact_refs: ["memory/episodes/events.jsonl"]
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function pauseAutonomyEnvelope(): Record<string, unknown> {
  return {
    summary: "Record a stop signal for future autonomous exploration before answering.",
    actions: [{
      type: "pause_autonomy",
      rationale: "The run should pause future autonomous exploration while keeping the current explicit task alive.",
      payload: {
        reason: "Pause future autonomous exploration until the operator reviews the latest governance candidates.",
        scope: "autonomous_exploration",
        resume_hint: "Remove the pause signal after the operator reviews pending governance candidates."
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function stateWriteEnvelope(): Record<string, unknown> {
  return {
    summary: "Write one state observation for a one-off check.",
    actions: [{
      type: "use_tool",
      rationale: "The task needs concrete evidence but not a reusable SOP.",
      payload: {
        tool: "file.write_state",
        arguments: {
          path: "observations/no-sop-smoke.txt",
          text: "one-off smoke evidence"
        }
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function stateWriteAndFileReadEnvelope(): Record<string, unknown> {
  const write = stateWriteEnvelope();
  const read = fileReadEnvelope();
  return {
    summary: "Write recovery evidence and read independent evidence in one main-harness round.",
    actions: [
      ...(write.actions as unknown[]),
      ...(read.actions as unknown[])
    ],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function fileReadEnvelope(): Record<string, unknown> {
  return {
    summary: "Read one bounded repo file for a one-off check.",
    actions: [{
      type: "use_tool",
      rationale: "The task needs read-only evidence but no write/run recovery evidence.",
      payload: {
        tool: "file.read",
        arguments: {
          scope: "repo",
          path: "docs/read-only-evidence.md",
          max_chars: 200
        }
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function failedFileReadEnvelope(): Record<string, unknown> {
  return {
    summary: "Attempt one invalid read-only check before answering.",
    actions: [{
      type: "use_tool",
      rationale: "The task needs read-only evidence but this request is invalid.",
      payload: {
        tool: "file.read",
        arguments: {
          scope: "repo",
          path: "../blocked-read.txt",
          max_chars: 200
        }
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function liveTraceStateWriteEnvelope(): Record<string, unknown> {
  return {
    summary: "Write one state observation for live trace visibility.",
    actions: [{
      type: "use_tool",
      rationale: "Create a tool result that later trace context can summarize.",
      payload: {
        tool: "file.write_state",
        arguments: {
          path: "observations/live-run-trace.txt",
          text: "LIVE_TRACE_RAW_STATE_WRITE_SHOULD_NOT_APPEAR"
        }
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function noSopDoneEnvelope(): Record<string, unknown> {
  return {
    summary: "Return one-off result without an SOP.",
    actions: [{
      type: "respond",
      rationale: "The task explicitly does not need a reusable procedure.",
      payload: {
        markdown: "The one-off smoke check completed with state evidence."
      }
    }],
    completion_claim: {
      status: "done",
      verification_refs: []
    }
  };
}

function doneEnvelope(): Record<string, unknown> {
  return doneEnvelopeWithVerificationRefs([]);
}

function latestToolResultRef(input: string): string {
  return input.match(/"id": "(tool_result_[^"]+)"/)?.[1] ?? "";
}

function latestToolArtifactRef(input: string): string {
  const sessionId = input.match(/"session_id": "(session_[^"]+)"/)?.[1] ?? "";
  const toolResultId = latestToolResultRef(input);
  return sessionId && toolResultId ? `memory/episodes/${sessionId}-${toolResultId}.json` : "";
}

function toolResultRefForTool(input: string, tool: string): string {
  const escapedTool = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...input.matchAll(new RegExp(`"id": "(tool_result_[^"]+)"[\\s\\S]{0,200}?"tool": "${escapedTool}"`, "g"))].at(-1)?.[1] ?? "";
}

function blockedEnvelope(): Record<string, unknown> {
  return {
    summary: "Report blocked task without a done claim.",
    actions: [{
      type: "respond",
      rationale: "Return a blocked completion claim.",
      payload: {
        markdown: "The command task is blocked pending independent verification."
      }
    }],
    completion_claim: {
      status: "blocked",
      verification_refs: []
    }
  };
}

function blockedSopEnvelope(): Record<string, unknown> {
  return {
    summary: "Report blocked task while proposing an audit-ready SOP.",
    actions: [
      {
        type: "respond",
        rationale: "Return a blocked completion claim.",
        payload: {
          markdown: "The command task is blocked pending independent verification."
        }
      },
      {
        type: "propose_sop",
        rationale: "This SOP must not be audited without verified completion.",
        payload: {
          title: "Blocked delegation SOP promotion guard",
          trigger: "Use this when failed delegation tries to propose a reusable SOP before verified main-harness completion exists.",
          procedure: [
            "Record the failed delegated result as bounded context only.",
            "Keep SOP audit and skill promotion blocked until completion verification is passed.",
            "Require a later verified main-harness result before any reusable learning artifact is promoted."
          ],
          required_tools: ["delegate_agent"],
          verification: "Confirm failed delegated results cannot enter SOP audit or skill promotion when completion verification is skipped.",
          failure_modes: [
            "If a SOP is drafted after skipped completion, revise the completion gate before trusting learning persistence.",
            "If a skill is promoted after failed delegation, rollback the vault write and repair the runner gate."
          ]
        }
      }
    ],
    completion_claim: {
      status: "blocked",
      verification_refs: []
    }
  };
}

function doneEnvelopeWithVerificationRefs(verificationRefs: string[]): Record<string, unknown> {
  return {
    summary: "Claim the command task is done.",
    actions: [{
      type: "respond",
      rationale: "Return a completion claim.",
      payload: {
        markdown: "The command task is complete."
      }
    }],
    completion_claim: {
      status: "done",
      verification_refs: verificationRefs
    }
  };
}

function skillRegistryEntry(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    name: "context-skill-health",
    description: "Context skill registry health fixture.",
    source: "personal",
    status: "active",
    instructions_ref: "vault/skills/context-skill-health/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#context-skill-health",
    origin_ref: null,
    trust_level: "local",
    source_sop_ref: null,
    references: [],
    tool_requirements: [],
    verification: "node --import tsx --test tests/context_harness.test.ts",
    evidence_refs: [],
    content_hash: "old-hash",
    version: 1,
    usage: {
      use_count: 0,
      last_used_at: null,
      patch_count: 0
    },
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:01:00.000Z",
    ...overrides
  };
}

function testConfig(args: { stateRoot: string; activeVault: string }): RuntimeConfig {
  return {
    home: {
      root: join(args.activeVault, "..")
    },
    state: {
      root: args.stateRoot
    },
    runtime: {
      promotion_enabled: true,
      structured_output: true,
      review_tick_enabled: false,
      review_tick_interval_ms: 30 * 60 * 1000,
      review_tick_limit: 20,
      content_daily_enabled: false,
      content_daily_interval_ms: 60 * 60 * 1000,
      content_daily_dry_run: true,
      content_daily_preflight: false,
      content_daily_topic: "daily AI news and AI stock hotspots",
      content_daily_source_urls: [],
      content_daily_tickers: [],
      content_daily_publish_enabled: false,
      content_daily_external_write_confirmed: false,
      content_daily_publish_adapter: "xiaohongshu-mcp",
      content_daily_publish_server_url: "http://localhost:18060/mcp",
      content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: false,
      content_creator_metrics_interval_ms: 60 * 60 * 1000,
      content_creator_metrics_limit: 10,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "runtime-creator-metrics",
      content_creator_metrics_browser_auto_connect: false
    },
    vault: {
      mode: "user",
      root: args.activeVault,
      active_root: args.activeVault,
      seed_roots: ["vault", "skills"],
      project_roots: []
    },
    model: {
      type: "model",
      id: "test-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://example.com/v1",
      model: "test",
      auth_id: "test-auth",
      max_output_tokens: 2400,
      store: false,
      json_object: true,
      api_key: "test-key"
    }
  };
}

async function createRepoFixture(): Promise<{
  root: string;
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  const store = new AgentStore(repoRoot, stateRoot);
  await store.ensureLayout();
  return {
    root,
    repoRoot,
    stateRoot,
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function writeRepoFile(repoRoot: string, rel: string, text: string): Promise<void> {
  const path = join(repoRoot, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

async function initGitFixture(repoRoot: string): Promise<void> {
  await runGit(repoRoot, ["init"]);
  await runGit(repoRoot, ["config", "user.name", "Local Runtime Test"]);
  await runGit(repoRoot, ["config", "user.email", "local-runtime@example.test"]);
  await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
}

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr || stdout || error.message}`));
        return;
      }
      resolve();
    });
  });
}

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  const raw = await readFile(path, "utf8");
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>);
}

async function mkdirTemp(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "agent-context-harness-"));
}
