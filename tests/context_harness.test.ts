import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  buildTurnSnapshot,
  compactGaPlanAfterVerifyCommand,
  compactGaPlanAcceptanceCriteria,
  compactGaPlanAntiDriftChecks,
  compactGaPlanAuditEvidence,
  compactGaPlanAuditRequirements,
  compactGaPlanAuditRejects,
  compactGaPlanEvidenceRefs,
  compactGaPlanGoalScope,
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
import { opportunitySchema, triggerSchema } from "../packages/core/src/schemas.js";
import { AgentStore } from "../packages/core/src/store.js";
import type { RuntimeConfig } from "../packages/runtime/src/config.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../packages/runtime/src/model.js";
import { LiveAgentRunner } from "../packages/runtime/src/runner.js";

test("compact GA plan reasons keep source status and quality by prefix", () => {
  assert.deepEqual(compactGaPlanSelectionReasons([
    "fresh_successor_slice=true",
    "iteration_record_status=open_iteration_available",
    "source_artifact_quality=ok",
    "source_status=verified"
  ]), [
    "source_status=verified",
    "source_artifact_quality=ok"
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
  }), "artifact=ga_design_artifact_source; ref=self-evolution/iterations/source.json; source_slice=completed_source_slice; target_slice=fresh_target_slice; status=verified; quality=ok; fresh_successor=true");
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
  }), "goal_scope=operator goal or accepted task states the intended end state; current_state=workspace or git status when files changed; verification_scope=outcome maps each required verification entrypoint to a completion claim; learning_persistence=record-iteration-outcome ref");
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
  }), "goal_scope=success criteria only describe the completed source artifact; current_state=older memory is the only evidence; verification_scope=a required verification entrypoint is omitted from outcome claim coverage; learning_persistence=dream, SOP, skill, or memory artifacts are treated as completion proof");
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
            "service health is inspected for the resident IM target",
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
  }), "blocked; blockers=outcome_record,outcome_verification_command_coverage; required=project-design,scorecard,iterations,service-health,check; outcome_status=not_recorded");
  assert.equal(
    compactGaPlanAfterVerifyCommand({ iteration_record_status: openIterationStatus }),
    "pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_open --outcome-status verified --summary \"...\" --evidence-ref <ref...> --verification-command \"<command...>\" --next-move \"...\" --state-root <state-root>"
  );
  assert.deepEqual(compactGaPlanVerificationCommands({
    iteration_record_status: openIterationStatus,
    verification_commands: [
      "pnpm run runtime -- governance project-design --artifact ga_design_artifact_source --state-root <state-root>",
      "pnpm run runtime -- governance scorecard --state-root <state-root>",
      "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>",
      "pnpm run runtime -- service health --target im --state-root <state-root>",
      "pnpm run check"
    ]
  }), [
    "project-design=ga_design_artifact_source",
    "scorecard",
    "iterations=iteration_contract_open;audit=all",
    "service-health=im",
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
    "docs/RUNTIME_CONTRACT.md"
  ]);
  assert.equal(
    compactGaPlanProofBoundary({ iteration_record_status: openIterationStatus }),
    "evidence_basis=candidate_refs_only; require=verified_outcome,outcome_evidence_refs,outcome_verification_command_coverage"
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
        objective: "Evolve into bounded multi-expert orchestration.",
        success_criteria: ["Delegated expert output remains advisory until verified."]
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
    await fixture.store.writeJson("services/im/heartbeat.json", {
      service: "im",
      state: "running",
      pid: 2468,
      repo_root: fixture.repoRoot,
      state_root: fixture.stateRoot,
      channel_id: "feishu-main",
      scenario_id: "im-default",
      updated_at: "2026-06-30T00:00:02.000Z",
      runtime_build: {
        schema_version: 1,
        target: "im",
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
    await fixture.store.writeJson("services/im/review_tick.json", {
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
    await fixture.store.writeJson("services/im/content_daily.json", {
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
    await fixture.store.writeJson("services/im/content_feedback_refresh.json", {
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
    assert.match(bundle, /service_health: attention/);
    assert.match(bundle, /im_state: running/);
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
    assert.match(bundle, /restart_command: pnpm run runtime -- service restart --target im --scenario im-default --channel feishu-main/);
    assert.doesNotMatch(bundle, /restart_command: .*--state-root <state-root>/);
    assert.match(bundle, /action_chain: inspect -> restart_service -> record_decision/);
    assert.match(bundle, /action_inspect: pnpm run runtime -- service health --target im \[read_only\]/);
    assert.match(bundle, /action_restart_service: pnpm run runtime -- service restart --target im --scenario im-default --channel feishu-main \[service_control\]/);
    assert.match(bundle, /Operator prefers explicit confirmation gates/);
    assert.match(bundle, /Use explicit candidate confirmation before accepting durable memory/);
    assert.match(bundle, /dream_context/);
    assert.match(bundle, /Core GA project design/);
    assert.match(bundle, /Self-Evolution Scorecard/);
    assert.match(bundle, /core_ga_design=active/);
    assert.match(bundle, /basic_runtime_substrate=attention/);
    assert.match(bundle, /multi_expert=active/);
    assert.match(bundle, /Self-Evolution Iteration/);
    assert.match(bundle, /iteration_contract_context/);
    assert.match(bundle, /layer: core_runtime; owner: runtime_contract; slice: self_evolution_iteration_contract/);
    assert.match(bundle, /experts: architect,verification_reviewer,orchestration_planner/);
    assert.doesNotMatch(bundle, /gap_scorecard_multi_expert_orchestration_contract/);
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
    assert.doesNotMatch(bundle, /LOCAL_LEARNING/);
    assert.equal(bundle.length < 25000, true, `bundle length ${bundle.length}`);
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
    assert.equal(scorecardSection?.refs.includes("packages/core/src/expert_orchestration.ts"), true);
    assert.deepEqual(dreamsSection?.refs, ["memory/dreams/dream_context.json"]);
    assert.equal(iterationSection?.item_count, 1);
    assert.deepEqual(iterationSection?.refs, [
      "self-evolution/iterations/iteration_contract_context.json",
      "packages/core/src/self_evolution_scorecard.ts"
    ]);
    assert.equal(serviceRuntimeSection?.item_count, 4);
    assert.deepEqual(serviceRuntimeSection?.refs, [
      "services/im/heartbeat.json",
      "services/im/review_tick.json",
      "services/im/content_daily.json",
      "services/im/content_feedback_refresh.json"
    ]);
    assert.equal(opportunitySection?.item_count, 5);
    assert.deepEqual([...(opportunitySection?.refs ?? [])].sort(), [
      "autonomy/followups/follow_up_confirmation_context.json",
      "autonomy/inbox/review_inbox_context.json",
      "memory/semantic/confirmations/memory_confirmation_context.json",
      "memory/semantic/candidates/session-memory-proposal-r1-0.json",
      "services/im/heartbeat.json"
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
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      verification_commands: ["pnpm run check"],
      non_goals: ["Do not execute the plan."],
      advisory_expert_roles: ["architect", "verification_reviewer", "orchestration_planner"],
      outcome: {
        status: "verified",
        summary: "Context can use this verified core iteration as a GA design planning artifact.",
        evidence_refs: ["tests/context_harness.test.ts"],
        verification_commands: ["pnpm run check"],
        next_moves: ["Use the artifact as a bounded core/basic planning packet."],
        recorded_at: "2026-06-30T00:00:01.800Z",
        boundary: "bounded outcome record"
      },
      created_at: "2026-06-30T00:00:01.700Z",
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
      proposed_slice: "core_ga_design_next_slice_after_context_plan",
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
    assert.match(rendered.markdown, /layer: core_runtime; owner: ga_project_design; slice: core_ga_design_next_slice_after_context_plan/);
    assert.match(rendered.markdown, /source_truth: artifact=ga_design_artifact_iteration_contract_context_plan; ref=self-evolution\/iterations\/iteration_contract_context_plan\.json; source_slice=context_ga_project_design_plan; target_slice=core_ga_design_next_slice_after_context_plan; status=verified; quality=attention; fresh_successor=true/);
    assert.match(rendered.markdown, /goal_scope: objective=Continue self-evolution through core\/basic GA project-design capability gains before SOP, skill, memory, or dream promotion\.; owner=ga_project_design; source=operator_objective=core_basic_self_evolution_first\|source_artifact=ga_design_artifact_iteration_contract_context_plan; success=fresh_successor_slice=true; source_slice=context_ga_project_design_plan; target_slice=core_ga_design_next_slice_after_context_plan/);
    assert.match(rendered.markdown, /planning_basis: Use ga_design_artifact_iteration_contract_context_plan as evidence, then choose a new core\/basic slice instead of repeating completed slice context_ga_project_design_plan\./);
    assert.match(rendered.markdown, /focus: Clarify the next core\/basic GA design improvement before implementation\./);
    assert.match(rendered.markdown, /focus_next: inspect the current project-design plan and matching open iteration/);
    assert.match(rendered.markdown, /anti_drift: do not infer core identity from external adapter or MCP pressure \| do not promote SOP, skill, memory, or dream artifacts before verified core\/basic reuse evidence exists \| do not claim completion until outcome verification commands cover the required project-design checks/);
    assert.match(rendered.markdown, /non_goals: does not promote one-off external adapter behavior into core identity \| no external-tool execution \| no automatic SOP, skill, memory, or dream promotion \| no completion proof without executed verification/);
    assert.match(rendered.markdown, /capability_stage: core=goal_intake:active,capability_layering:active,contract_design:hardening,verification_review:active; basic=execution_plan:active,runtime_observability:attention_guard/);
    assert.match(rendered.markdown, /runtime_guard: stage=attention_guard; current=Resident service health is the basic guard that keeps runtime attention visible before a core\/basic outcome is reused.; next=Name runtime attention reasons explicitly instead of hiding them behind application progress.; exit=runtime attention reasons are named in the outcome instead of being treated as application progress/);
    assert.match(rendered.markdown, /stage_exit: core=goal_intake=the next slice cites the latest operator objective or a verified source artifact,capability_layering=core\/basic\/local-learning\/application layer is explicit before implementation,contract_design=one reusable GA design contract improvement is implemented,verification_review=iteration audit reports covered plan refs; basic=execution_plan=targeted project-design and iteration audit checks run before the broad check,runtime_observability=service health is inspected for the resident IM target/);
    assert.match(rendered.markdown, /stage_next: core_runtime\[goal_scope\]: continue core_ga_design_next_slice_after_context_plan as a ga_project_design hardening slice/);
    assert.match(rendered.markdown, /phase_forbid: goal_intake=do not treat previous intent as current evidence; capability_layering=do not promote Nasdaq, Xiaohongshu MCP, browser automation, or one adapter into core identity by default; contract_design=do not add provider-specific glue when a runtime contract is the real missing piece; execution_plan=do not use a narrow test to support a broader claim; verification_review=do not let model reasoning replace executed verification; learning_persistence=do not promote one-off application behavior to skill or semantic memory/);
    assert.match(rendered.markdown, /scorecard_basis: next_core_basic_slice=next_slice_core_ga_design \| target_dimension=core_ga_design/);
    assert.match(rendered.markdown, /layer_decision: recurring_ga_project_design; external tools and adapters stay application slices unless a reusable runtime contract is named/);
    assert.match(rendered.markdown, /layer_guard: stage=core_basic_successor_ready; source=core_runtime\/ga_project_design; selected=core_runtime\/ga_project_design/);
    assert.match(rendered.markdown, /selection: ready; source_status=verified \| source_artifact_quality=attention/);
    assert.match(rendered.markdown, /checks: source_artifact_verified=verified/);
    assert.match(rendered.markdown, /source_artifact_warning_thresholds=evidence_refs:2; verification_commands:2/);
    assert.match(rendered.markdown, /successor: fresh_successor_slice=true; source_slice=context_ga_project_design_plan; target_slice=core_ga_design_next_slice_after_context_plan/);
    assert.match(rendered.markdown, /target: target_layer=core_runtime; owner_surface=ga_project_design/);
    assert.match(rendered.markdown, /verify: verification_entrypoints=project-design,scorecard,iterations,service-health,check/);
    assert.match(rendered.markdown, /verify_commands: project-design=ga_design_artifact_iteration_contract_context_plan \| scorecard \| iterations=iteration_contract_context_open;audit=all \| service-health=im \| check/);
    assert.match(rendered.markdown, /iteration_record_status: open_iteration_available; iteration_contract_context_open/);
    assert.match(rendered.markdown, /review_gate: blocked; blockers=outcome_record,outcome_verification_command_coverage; required=project-design,scorecard,iterations,service-health,check; outcome_status=not_recorded/);
    assert.match(rendered.markdown, /audit_command: pnpm run runtime -- governance iterations --iteration iteration_contract_context_open --audit-seed all --state-root <state-root>/);
    assert.match(rendered.markdown, /after_verify: pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_context_open --outcome-status verified --summary "\.\.\." --evidence-ref <ref\.\.\.> --verification-command "<command\.\.\.>" --next-move "\.\.\." --state-root <state-root>/);
    assert.match(rendered.markdown, /evidence_basis: packages\/core\/src\/ga_project_design\.ts \| self-evolution\/iterations\/iteration_contract_context_open\.json \| self-evolution\/iterations\/iteration_contract_context_plan\.json \| tests\/context_harness\.test\.ts/);
    assert.match(rendered.markdown, /proof_boundary: evidence_basis=candidate_refs_only; require=verified_outcome,outcome_evidence_refs,outcome_verification_command_coverage/);
    assert.match(rendered.markdown, /audit: goal_scope,current_state,verification_scope,learning_persistence/);
    assert.match(rendered.markdown, /audit_require: goal_scope=Preserve the latest operator objective and do not redefine success around completed work.; current_state=Use current worktree and runtime state, classify runtime attention, and name the handling policy before trusting older memory or prior summaries.; verification_scope=Match verification evidence to the scope of the completion claim.; learning_persistence=Record the verified outcome before reusing the slice as future GA design evidence./);
    assert.match(rendered.markdown, /audit_evidence: goal_scope=proposed_slice=core_ga_design_next_slice_after_context_plan; current_state=workspace or git status when files changed; verification_scope=outcome maps each required verification entrypoint to a completion claim; learning_persistence=record-iteration-outcome ref/);
    assert.match(rendered.markdown, /audit_reject: goal_scope=success criteria only describe the completed source artifact; current_state=older memory is the only evidence; verification_scope=a required verification entrypoint is omitted from outcome claim coverage; learning_persistence=dream, SOP, skill, or memory artifacts are treated as completion proof/);
    assert.match(rendered.markdown, /acceptance: goal_scope: operator goal is restated with owner surface, source of truth, and success evidence \| current_state: capability layer stays core_runtime or basic_entrypoint before implementation \| verification_scope: verification commands are scoped to the slice and required entrypoints are covered by completion claims \| learning_persistence: outcome is recorded before reuse \| goal_scope: the next proposed slice is selected from current goal and scorecard evidence instead of copied from the source artifact \| current_state: external adapters remain application slices unless a reusable runtime contract is named/);
    assert.match(rendered.markdown, /next_command: pnpm run runtime -- governance iterations --iteration iteration_contract_context_open --state-root <state-root>/);
    assert.doesNotMatch(rendered.markdown, /bounded outcome record/);
    assert.equal(section?.item_count, 1);
    assert.equal(section?.refs.includes("packages/core/src/ga_project_design.ts"), true);
    assert.equal(section?.refs.includes("self-evolution/iterations/iteration_contract_context_plan.json"), true);
    assert.equal(section?.refs.includes("self-evolution/iterations/iteration_contract_context_open.json"), true);
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
    assert.match(rendered.markdown, /expert\.orchestration_contract/);
    assert.match(rendered.markdown, /sop\.evolution/);
    assert.match(rendered.markdown, /Resident local service/);
    assert.match(rendered.markdown, /local-only read model/);
    assert.match(rendered.markdown, /do not infer extra authority/);
    assert.doesNotMatch(rendered.markdown, /api_key/);
    assert.doesNotMatch(rendered.markdown, /app_secret/);
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
    await fixture.store.writeText(
      `memory/episodes/${priorSession}-delegated_result_invalid.json`,
      "RAW_DELEGATED_RESULT_SHOULD_NOT_BE_IN_CONTEXT"
    );
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
      checks: [{
        id: "final_response",
        status: "pass",
        summary: "Done claim has a persisted final response artifact.",
        refs: [`memory/episodes/${priorSession}-final-response.md`]
      }, {
        id: "delegated_results",
        status: "fail",
        summary: "Failed delegated result(s): 1.",
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
      summary: "Delegated result failed contract: invalid JSON.",
      artifact_refs: [`memory/episodes/${priorSession}-delegated_result_invalid.json`],
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

    const snapshot = await buildTurnSnapshot(fixture.store, trigger, trigger.text, opportunity);
    const rendered = await renderContextBundleWithManifest(fixture.store, snapshot);
    const section = rendered.manifest.sections.find((item) => item.title === "Live Run Trace");
    const replaySection = rendered.manifest.sections.find((item) => item.title === "Harness Replay Audits");

    assert.match(rendered.markdown, /## Live Run Trace/);
    assert.match(rendered.markdown, /session_live_trace_context/);
    assert.match(rendered.markdown, /completion_status: done/);
    assert.match(rendered.markdown, /verification_status: failed/);
    assert.match(rendered.markdown, /events: 6 \((?=[^)]*prompt=1)(?=[^)]*model_action=2)(?=[^)]*report=1)(?=[^)]*tool_result=1)(?=[^)]*delegated_result=1)[^)]*\)/);
    assert.match(rendered.markdown, /tool_results: 1/);
    assert.match(rendered.markdown, /delegated_results: 1/);
    assert.match(rendered.markdown, /delegated_results_passed: 0/);
    assert.match(rendered.markdown, /delegated_results_failed: 1/);
    assert.match(rendered.markdown, /harness_state_actions: 1/);
    assert.match(rendered.markdown, /repo_write_guards: 1/);
    assert.match(rendered.markdown, /repo_write_guard: docs\/generated\.md before=dirty after=dirty changed_files=1->2 delta=1 preexisting_dirty=true target_changed=true/);
    assert.match(rendered.markdown, /round_1: memory\/episodes\/session_live_trace_context-model-action-r1\.json/);
    assert.match(rendered.markdown, /action_counts: record_evidence=1, use_tool=1/);
    assert.match(rendered.markdown, /harness_action_types: record_evidence/);
    assert.match(rendered.markdown, /## Harness Replay Audits/);
    assert.match(rendered.markdown, new RegExp(replay.id));
    assert.match(rendered.markdown, /trace_ref: memory\/episodes\/session_live_trace_context-completion-verification\.json/);
    assert.match(rendered.markdown, /completion_id: completion_verification_trace_context/);
    assert.match(rendered.markdown, /replay_result: metadata_replay/);
    assert.match(rendered.markdown, /delegated_failed=1/);
    assert.match(rendered.markdown, /replay_check: delegated_result_contract=warning/);
    assert.doesNotMatch(rendered.markdown, /RAW_PRIOR_CONTEXT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_MODEL_RESPONSE_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_HARNESS_PAYLOAD_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_TOOL_PAYLOAD_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_TOOL_RESULT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_HARNESS_ARTIFACT_SHOULD_NOT_BE_IN_CONTEXT/);
    assert.doesNotMatch(rendered.markdown, /RAW_DELEGATED_RESULT_SHOULD_NOT_BE_IN_CONTEXT/);
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
      checks: Array<{ id: string; status: string; summary: string }>;
    };
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    const verificationEvent = events.find((event) => String(event.summary).includes("Completion verification failed"));
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

test("live runner preserves raw response refs when model envelope parsing fails", async () => {
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
      outputText: string;
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
    assert.equal(response.outputText, "RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR");
    assert.equal(diagnostic.stage, "envelope_parse");
    assert.equal(diagnostic.failure_kind, "format");
    assert.equal(diagnostic.response_ref, result.model_response_ref);
    assert.match(diagnostic.error_preview, /could not be parsed as ModelActionEnvelope/);
    assert.equal(diagnostic.output_preview, "RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR");
    assert.equal(trace.model_diagnostics[0]?.response_ref, result.model_response_ref);
    assert.match(rendered.markdown, /model_diagnostics: 1/);
    assert.match(rendered.markdown, /model_diagnostic: round=1 stage=envelope_parse kind=format/);
    assert.doesNotMatch(rendered.markdown, /RAW_INVALID_MODEL_OUTPUT_SHOULD_NOT_APPEAR/);
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
      error: string | null;
      boundary: string;
    };

    assert.equal(result.verdict, "no_sop");
    assert.equal(model.sawStructuredDelegation, true);
    assert.equal(delegated.ok, true);
    assert.equal(delegated.contract_status, "passed");
    assert.equal(delegated.summary, "Structured delegate summary");
    assert.equal(delegated.findings_text, "The delegated critique found one bounded risk and no mutation evidence.");
    assert.equal(delegated.output_text, delegated.findings_text);
    assert.equal(delegated.error, null);
    assert.match(delegated.boundary, /bounded self-report only/);
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

    const runner = new LiveAgentRunner({
      repoRoot: fixture.repoRoot,
      stateRoot: fixture.stateRoot,
      config: testConfig({ stateRoot: fixture.stateRoot, activeVault }),
      model: new InvalidDelegationThenDoneModel()
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
    };
    const report = JSON.parse(await readFile(join(fixture.stateRoot, result.completion_report_ref ?? ""), "utf8")) as {
      verification_status: string;
      verified: boolean;
      checks: Array<{ id: string; status: string; summary: string }>;
    };

    assert.equal(result.verdict, "completion_unverified");
    assert.equal(delegated.ok, false);
    assert.equal(delegated.contract_status, "failed");
    assert.match(delegated.output_text, /not valid JSON/);
    assert.match(delegated.raw_output_preview, /plain text instead of json/);
    assert.match(delegated.error ?? "", /not valid JSON/);
    assert.match(delegated.boundary, /bounded self-report only/);
    assert.equal(report.verification_status, "failed");
    assert.equal(report.verified, false);
    assert.equal(report.checks.find((check) => check.id === "delegated_results")?.status, "fail");
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

async function writeRepoHead(store: AgentStore, commit: string, branch = "develop"): Promise<void> {
  await store.writeRepoText(".git/HEAD", `ref: refs/heads/${branch}\n`);
  await store.writeRepoText(`.git/refs/heads/${branch}`, `${commit}\n`);
}

class StructuredDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;
  sawStructuredDelegation = false;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? JSON.stringify({
        summary: "Structured delegate summary",
        findings_text: "The delegated critique found one bounded risk and no mutation evidence."
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
      this.sawStructuredDelegation = request.input.includes("## Delegated Observations")
        && request.input.includes('"contract_status": "passed"')
        && request.input.includes("The delegated critique found one bounded risk");
      return noSopDoneEnvelope();
    }
    return delegateCritiqueEnvelope();
  }
}

class InvalidDelegationThenDoneModel implements ModelClient {
  private mainCalls = 0;

  async create(request: ModelRequest): Promise<ModelResponse> {
    const isDelegation = request.instructions.includes("bounded local-agent subagent");
    const outputText = isDelegation
      ? "plain text instead of json"
      : JSON.stringify(this.nextMainEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "invalid-delegation-then-done",
      responseId: `response-invalid-delegation-${this.mainCalls}`,
      outputText,
      raw: { outputText }
    };
  }

  private nextMainEnvelope(): Record<string, unknown> {
    this.mainCalls += 1;
    return this.mainCalls > 1 ? doneEnvelope() : delegateCritiqueEnvelope();
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

function delegateCritiqueEnvelope(): Record<string, unknown> {
  return {
    summary: "Delegate bounded critique before answering.",
    actions: [{
      type: "delegate_agent",
      rationale: "Use a bounded subagent self-report for critique before final answer.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: "No tool or mutation authority is available to the delegated subagent."
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
      verification_refs: []
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
