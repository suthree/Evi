import assert from "node:assert/strict";
import test from "node:test";
import {
  bindGaProjectDesignArtifactPacketCommands,
  bindGaProjectDesignReadModelCommands,
  bindIterationDetailRuntimeCommands,
  bindIterationRecordResultCommand,
  buildIterationAuditCompletionGate,
  buildIterationAuditEvidenceAvailable,
  buildIterationAuditGuidance,
  buildIterationAuditNextCommand,
  buildIterationAuditOutcomeVerificationCommandCoverage,
  buildIterationAuditPlanRefCoverage,
  buildIterationAuditRefs,
  buildIterationAuditSeedEvidenceStatus,
  buildIterationAuditVerificationCommandCoverage,
  parseArgs,
  selectIterationAuditVerificationCoverageCommands
} from "../apps/cli/src/main.js";

test("doctor checks IM by default and accepts explicit downgrades", () => {
  const defaultOptions = parseArgs(["doctor", "--no-auth"]);
  assert.equal(defaultOptions.command, "doctor");
  assert.equal(defaultOptions.requireAuth, false);
  assert.equal(defaultOptions.requireIm, true);

  const downgradedOptions = parseArgs(["--", "doctor", "--no-auth", "--no-im"]);
  assert.equal(downgradedOptions.command, "doctor");
  assert.equal(downgradedOptions.requireAuth, false);
  assert.equal(downgradedOptions.requireIm, false);
});

test("config command parses read-only config summary options", () => {
  const options = parseArgs([
    "config",
    "--config-dir",
    "config",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "config");
  assert.equal(options.configDir, "config");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("config set-runtime parses safe content daily update options", () => {
  const options = parseArgs([
    "config",
    "set-runtime",
    "--content-daily-enabled",
    "--content-daily-dry-run",
    "--no-content-daily-preflight",
    "--content-daily-interval-ms",
    "1800000",
    "--topic",
    "daily frontier AI news and AI stock hotspots",
    "--source-url",
    "https://example.test/ai",
    "--ticker",
    "NVDA",
    "--content-daily-publish-disabled",
    "--content-daily-external-write-unconfirmed",
    "--content-feedback-refresh-enabled",
    "--content-feedback-refresh-interval-ms",
    "7200000",
    "--content-feedback-refresh-limit",
    "3",
    "--content-feedback-refresh-min-follow-up-age-ms",
    "21600000",
    "--content-feedback-refresh-server-url",
    "http://localhost:18061/mcp"
  ]);

  assert.equal(options.command, "config");
  assert.equal(options.configAction, "set-runtime");
  assert.equal(options.contentDailyEnabled, true);
  assert.equal(options.contentDailyDryRun, true);
  assert.equal(options.contentDailyPreflight, false);
  assert.equal(options.contentDailyIntervalMs, 1800000);
  assert.equal(options.topic, "daily frontier AI news and AI stock hotspots");
  assert.deepEqual(options.sourceUrls, ["https://example.test/ai"]);
  assert.deepEqual(options.tickers, ["NVDA"]);
  assert.equal(options.contentDailyPublishEnabled, false);
  assert.equal(options.contentDailyExternalWriteConfirmed, false);
  assert.equal(options.contentFeedbackRefreshEnabled, true);
  assert.equal(options.contentFeedbackRefreshIntervalMs, 7200000);
  assert.equal(options.contentFeedbackRefreshLimit, 3);
  assert.equal(options.contentFeedbackRefreshMinFollowUpAgeMs, 21600000);
  assert.equal(options.contentFeedbackRefreshServerUrl, "http://localhost:18061/mcp");
});

test("config set-runtime parses review tick update options", () => {
  const options = parseArgs([
    "config",
    "set-runtime",
    "--review-tick-enabled",
    "--review-tick-interval-ms",
    "900000",
    "--review-tick-limit",
    "8"
  ]);

  assert.equal(options.command, "config");
  assert.equal(options.configAction, "set-runtime");
  assert.equal(options.reviewTickEnabled, true);
  assert.equal(options.reviewTickIntervalMs, 900000);
  assert.equal(options.reviewTickLimit, 8);

  const disabled = parseArgs([
    "config",
    "set-runtime",
    "--review-tick-disabled"
  ]);

  assert.equal(disabled.reviewTickEnabled, false);
});

test("capabilities command parses read-only catalog options", () => {
  const options = parseArgs(["capabilities", "--state-root", ".runtime/state"]);

  assert.equal(options.command, "capabilities");
  assert.equal(options.stateRoot, ".runtime/state");

  const acceptance = parseArgs(["capabilities", "acceptance"]);
  assert.equal(acceptance.command, "capabilities");
  assert.equal(acceptance.capabilitiesAction, "acceptance");

  const auditAlias = parseArgs(["capabilities", "audit"]);
  assert.equal(auditAlias.capabilitiesAction, "acceptance");
});

test("governance project-design command parses core design read model", () => {
  const options = parseArgs(["governance", "project-design", "--state-root", ".runtime/state"]);

  assert.equal(options.command, "governance");
  assert.equal(options.governanceAction, "project-design");
  assert.equal(options.stateRoot, ".runtime/state");

  const auditSeed = parseArgs([
    "governance",
    "project-design",
    "--audit-seed",
    "verification_scope"
  ]);
  assert.equal(auditSeed.command, "governance");
  assert.equal(auditSeed.governanceAction, "project-design");
  assert.equal(auditSeed.projectDesignAuditSeedId, "verification_scope");

  const artifact = parseArgs([
    "governance",
    "project-design",
    "--artifact",
    "ga_design_artifact_iteration_contract_1"
  ]);
  assert.equal(artifact.command, "governance");
  assert.equal(artifact.governanceAction, "project-design");
  assert.equal(artifact.projectDesignArtifactRef, "ga_design_artifact_iteration_contract_1");
});

test("iteration audit seed evidence status stays conservative before outcome evidence exists", () => {
  const seed = {
    id: "verification_scope",
    phase_id: "verification_review",
    requirement: "Match verification evidence to the scope of the completion claim.",
    evidence_needed: ["targeted checks cover the changed behavior"],
    reject_if: ["a narrow command is used to prove a broader capability claim"]
  } as const;

  const missingOutcome = buildIterationAuditSeedEvidenceStatus(
    seed,
    { outcome_status: "not_recorded" },
    {
      iteration_evidence_refs: ["packages/core/src/ga_project_design.ts"],
      iteration_verification_commands: ["pnpm run check"],
      runtime_iteration_verification_commands: ["pnpm run check"],
      outcome_evidence_refs: [],
      outcome_verification_commands: []
    }
  );
  assert.equal(missingOutcome.evidence_status, "missing_outcome");
  assert.equal(missingOutcome.missing.includes("outcome_record"), true);
  assert.equal(missingOutcome.evidence_counts.runtime_iteration_verification_commands, 1);
  assert.equal(missingOutcome.manual_review_required, true);

  const readyForReview = buildIterationAuditSeedEvidenceStatus(
    seed,
    { outcome_status: "verified" },
    {
      iteration_evidence_refs: ["packages/core/src/ga_project_design.ts"],
      iteration_verification_commands: ["pnpm run check"],
      outcome_evidence_refs: ["tests/ga_project_design.test.ts"],
      outcome_verification_commands: ["pnpm exec tsx --test tests/ga_project_design.test.ts"]
    }
  );
  assert.equal(readyForReview.evidence_status, "ready_for_manual_review");
  assert.equal(readyForReview.missing.length, 0);
  assert.equal(readyForReview.evidence_counts.runtime_iteration_verification_commands, 0);
  assert.match(readyForReview.review_note, /does not prove/);
});

test("iteration audit plan ref coverage compares plan refs to audited evidence refs", () => {
  const covered = buildIterationAuditPlanRefCoverage(
    [
      "self-evolution/iterations/iteration_contract_open.json",
      "self-evolution/iterations/iteration_contract_source.json",
      "packages/core/src/ga_project_design.ts",
      "tests/ga_project_design.test.ts"
    ],
    {
      ref: "self-evolution/iterations/iteration_contract_open.json",
      source_ref: "self-evolution/iterations/iteration_contract_source.json",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      outcome: {
        evidence_refs: ["tests/ga_project_design.test.ts"]
      }
    } as Parameters<typeof buildIterationAuditPlanRefCoverage>[1]
  );
  assert.equal(covered.status, "covered");
  assert.equal(covered.plan_ref_count, 4);
  assert.equal(covered.covered_ref_count, 4);
  assert.deepEqual(covered.missing_refs, []);
  assert.match(covered.boundary, /does not read file bodies or prove completion/);

  const missing = buildIterationAuditPlanRefCoverage(
    [
      "self-evolution/iterations/iteration_contract_open.json",
      "docs/RUNTIME_CONTRACT.md"
    ],
    {
      ref: "self-evolution/iterations/iteration_contract_open.json",
      evidence_refs: [],
      verification_commands: []
    } as Parameters<typeof buildIterationAuditPlanRefCoverage>[1]
  );
  assert.equal(missing.status, "missing_refs");
  assert.equal(missing.covered_ref_count, 1);
  assert.deepEqual(missing.missing_refs, ["docs/RUNTIME_CONTRACT.md"]);
});

test("iteration audit refs include source and outcome evidence refs", () => {
  const refs = buildIterationAuditRefs(
    [
      "docs/RUNTIME_CONTRACT.md",
      "tests/ga_project_design.test.ts"
    ],
    {
      ref: "self-evolution/iterations/iteration_contract_open.json",
      source_ref: "self-evolution/iterations/iteration_contract_source.json",
      evidence_refs: ["packages/core/src/ga_project_design.ts"],
      outcome: {
        evidence_refs: ["tests/ga_project_design.test.ts"]
      }
    } as Parameters<typeof buildIterationAuditRefs>[1]
  );

  assert.deepEqual(refs, [
    "self-evolution/iterations/iteration_contract_open.json",
    "self-evolution/iterations/iteration_contract_source.json",
    "packages/core/src/ga_project_design.ts",
    "tests/ga_project_design.test.ts",
    "docs/RUNTIME_CONTRACT.md"
  ]);
});

test("iteration audit verification command coverage compares required commands to declared commands", () => {
  const covered = buildIterationAuditVerificationCommandCoverage(
    [
      "pnpm run runtime -- governance scorecard --state-root .runtime/state",
      "pnpm run check"
    ],
    {
      iteration_evidence_refs: [],
      iteration_verification_commands: [],
      runtime_iteration_verification_commands: [
        "pnpm run runtime -- governance scorecard --state-root .runtime/state"
      ],
      outcome_evidence_refs: [],
      outcome_verification_commands: ["pnpm run check"]
    }
  );
  assert.equal(covered.status, "covered");
  assert.equal(covered.required_command_count, 2);
  assert.equal(covered.covered_command_count, 2);
  assert.deepEqual(covered.missing_commands, []);
  assert.match(covered.boundary, /does not execute commands or prove completion/);

  const missing = buildIterationAuditVerificationCommandCoverage(
    [
      "pnpm run runtime -- governance scorecard --state-root .runtime/state",
      "pnpm run check"
    ],
    {
      iteration_evidence_refs: [],
      iteration_verification_commands: [],
      runtime_iteration_verification_commands: [
        "pnpm run runtime -- governance scorecard --state-root .runtime/state"
      ],
      outcome_evidence_refs: [],
      outcome_verification_commands: []
    }
  );
  assert.equal(missing.status, "missing_commands");
  assert.equal(missing.covered_command_count, 1);
  assert.deepEqual(missing.missing_commands, ["pnpm run check"]);
});

test("iteration audit outcome verification command coverage ignores declared iteration commands", () => {
  const missingOutcome = buildIterationAuditOutcomeVerificationCommandCoverage(
    [
      "pnpm run runtime -- governance scorecard --state-root .runtime/state",
      "pnpm run check"
    ],
    {
      iteration_evidence_refs: [],
      iteration_verification_commands: [],
      runtime_iteration_verification_commands: [
        "pnpm run runtime -- governance scorecard --state-root .runtime/state",
        "pnpm run check"
      ],
      outcome_evidence_refs: [],
      outcome_verification_commands: []
    }
  );
  assert.equal(missingOutcome.status, "missing_outcome_commands");
  assert.equal(missingOutcome.covered_command_count, 0);
  assert.deepEqual(missingOutcome.missing_commands, [
    "pnpm run runtime -- governance scorecard --state-root .runtime/state",
    "pnpm run check"
  ]);
  assert.match(missingOutcome.boundary, /outcome verification command refs only/);

  const covered = buildIterationAuditOutcomeVerificationCommandCoverage(
    [
      "pnpm run runtime -- governance scorecard --state-root .runtime/state",
      "pnpm run check"
    ],
    {
      iteration_evidence_refs: [],
      iteration_verification_commands: [],
      runtime_iteration_verification_commands: [],
      outcome_evidence_refs: [],
      outcome_verification_commands: [
        "pnpm run runtime -- governance scorecard --state-root .runtime/state",
        "pnpm run check"
      ]
    }
  );
  assert.equal(covered.status, "covered");
  assert.equal(covered.covered_command_count, 2);
  assert.deepEqual(covered.missing_commands, []);
});

test("iteration audit completion gate blocks before outcome evidence and coverage are present", () => {
  const blocked = buildIterationAuditCompletionGate(
    { outcome_status: "not_recorded" },
    { outcome_evidence_refs: [] },
    { status: "covered" },
    { status: "missing_outcome_commands" }
  );
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blockers, [
    "outcome_record",
    "outcome_verification_command_coverage"
  ]);
  assert.match(blocked.boundary, /does not approve seeds or prove completion/);

  const partial = buildIterationAuditCompletionGate(
    { outcome_status: "partial" },
    { outcome_evidence_refs: ["tests/cli.test.ts"] },
    { status: "covered" },
    { status: "covered" }
  );
  assert.equal(partial.status, "blocked");
  assert.deepEqual(partial.blockers, ["verified_outcome"]);

  const ready = buildIterationAuditCompletionGate(
    { outcome_status: "verified" },
    { outcome_evidence_refs: ["tests/cli.test.ts"] },
    { status: "covered" },
    { status: "covered" }
  );
  assert.equal(ready.status, "ready_for_manual_review");
  assert.deepEqual(ready.blockers, []);
});

test("iteration audit verification coverage uses stable iteration commands for historical audits", () => {
  const evidence = {
    iteration_verification_commands: [
      "pnpm run runtime -- governance project-design --artifact old --state-root <state-root>"
    ],
    runtime_iteration_verification_commands: [
      "pnpm run runtime -- governance project-design --artifact old --state-root .runtime/state"
    ]
  };

  assert.deepEqual(selectIterationAuditVerificationCoverageCommands(
    "matching_open_iteration",
    ["pnpm run runtime -- governance project-design --artifact current --state-root .runtime/state"],
    evidence
  ), ["pnpm run runtime -- governance project-design --artifact current --state-root .runtime/state"]);

  assert.deepEqual(selectIterationAuditVerificationCoverageCommands(
    "source_iteration_for_current_plan",
    ["pnpm run runtime -- governance project-design --artifact current --state-root .runtime/state"],
    evidence
  ), ["pnpm run runtime -- governance project-design --artifact old --state-root .runtime/state"]);
});

test("iteration audit guidance carries core/basic verification entrypoints", () => {
  const plan = {
    proposed_slice: "core_ga_design_next_slice_after_source",
    source_artifact_id: "ga_design_artifact_iteration_contract_source",
    source_iteration_ref: "self-evolution/iterations/iteration_contract_source.json",
    selection_checks: [
      "source_artifact_verified=verified; ref=self-evolution/iterations/iteration_contract_source.json",
      "verification_entrypoints=project-design,scorecard,iterations,service-health,check"
    ],
    verification_commands: [
      "pnpm run runtime -- governance project-design --state-root <state-root>",
      "pnpm run runtime -- governance scorecard --state-root <state-root>",
      "pnpm run runtime -- governance iterations --state-root <state-root>",
      "pnpm run runtime -- service health --target im --state-root <state-root>",
      "pnpm run check"
    ],
    layer_decision: {
      selected_layer: "core_runtime",
      selected_owner_surface: "ga_project_design",
      core_identity: "recurring_ga_project_design",
      application_boundaries: [
        "external tools and adapters stay application slices unless a reusable runtime contract is named"
      ],
      required_before_outcome: [
        "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>",
        "pnpm run runtime -- service health --target im --state-root <state-root>",
        "pnpm run check"
      ]
    },
    iteration_record_status: {
      status: "open_iteration_available",
      id: "iteration_contract_open",
      ref: "self-evolution/iterations/iteration_contract_open.json",
      audit_command: "pnpm run runtime -- governance iterations --iteration iteration_contract_open --audit-seed all --state-root <state-root>"
    }
  };
  const guidance = buildIterationAuditGuidance(plan);

  assert.equal(guidance.core_identity, "recurring_ga_project_design");
  assert.equal(guidance.selected_layer, "core_runtime");
  assert.equal(guidance.guidance_scope, "current_plan_context");
  assert.deepEqual(guidance.verification_entrypoints, [
    "project-design",
    "scorecard",
    "iterations",
    "service-health",
    "check"
  ]);
  assert.equal(guidance.required_before_outcome.some((command) => command.includes("--audit-seed all")), true);
  assert.equal(guidance.verification_commands.some((command) => command.includes("service health")), true);
  assert.equal(guidance.application_boundaries[0]?.includes("application slices"), true);
  assert.equal(guidance.iteration_record_status.id, "iteration_contract_open");
  assert.match(guidance.boundary, /does not execute checks/);

  const sourceGuidance = buildIterationAuditGuidance(
    plan,
    {
      id: "iteration_contract_source",
      ref: "self-evolution/iterations/iteration_contract_source.json",
      source_ref: "self-evolution/iterations/iteration_contract_parent.json",
      proposed_slice: "completed_source_slice",
      outcome_status: "verified"
    },
    ".runtime/state"
  );
  assert.equal(sourceGuidance.guidance_scope, "source_iteration_for_current_plan");
  assert.equal(sourceGuidance.audited_iteration?.id, "iteration_contract_source");
  assert.equal(sourceGuidance.audited_iteration?.source_ref, "self-evolution/iterations/iteration_contract_parent.json");
  assert.equal(sourceGuidance.iteration_record_status.id, "iteration_contract_source");
  assert.equal(sourceGuidance.iteration_record_status.status, "outcome_recorded");
  assert.equal(sourceGuidance.iteration_record_status.outcome_status, "verified");
  assert.equal(sourceGuidance.required_before_outcome.some((command) => command.includes("--iteration iteration_contract_source --audit-seed all")), true);
  assert.equal(sourceGuidance.required_before_outcome.some((command) => command.includes("<iteration-ref>")), false);
  assert.equal(sourceGuidance.required_before_outcome.some((command) => command.includes("<state-root>")), false);
  assert.equal(sourceGuidance.required_before_outcome.some((command) => command.includes("--state-root .runtime/state")), true);
  assert.equal(sourceGuidance.iteration_record_status.audit_command?.includes("--state-root .runtime/state"), true);
  assert.notEqual(sourceGuidance.iteration_record_status.id, "iteration_contract_open");
});

test("iteration audit next command binds current state root", () => {
  const openNext = buildIterationAuditNextCommand(
    { id: "iteration_contract_open", outcome_status: "not_recorded" },
    ".runtime/state"
  );
  assert.equal(openNext.includes("<state-root>"), false);
  assert.equal(openNext, "pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_open --outcome-status verified --summary \"...\" --state-root .runtime/state");

  const verifiedNext = buildIterationAuditNextCommand(
    { id: "iteration_contract_done", outcome_status: "verified" },
    ".runtime/state"
  );
  assert.equal(verifiedNext.includes("<state-root>"), false);
  assert.equal(verifiedNext, "pnpm run runtime -- governance iterations --iteration iteration_contract_done --state-root .runtime/state");
});

test("project design CLI packets bind current state root in next commands", () => {
  const readModel = bindGaProjectDesignReadModelCommands({
    next_core_basic_plan: {
      scorecard_basis: [
        "scorecard_command=pnpm run runtime -- governance scorecard --state-root <state-root>"
      ],
      verification_commands: [
        "pnpm run runtime -- governance scorecard --state-root <state-root>"
      ],
      layer_decision: {
        required_before_outcome: [
          "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>"
        ]
      },
      iteration_record_status: {
        status: "open_iteration_available",
        id: "iteration_contract_open",
        inspect_command: "pnpm run runtime -- governance iterations --iteration iteration_contract_open --state-root <state-root>",
        audit_command: "pnpm run runtime -- governance iterations --iteration iteration_contract_open --audit-seed all --state-root <state-root>",
        record_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>"
      },
      next_iteration_seed: {
        verification_commands: [
          "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>"
        ],
        record_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>"
      },
      next_command: "pnpm run runtime -- governance iterations --iteration iteration_contract_open --state-root <state-root>"
    }
  } as Parameters<typeof bindGaProjectDesignReadModelCommands>[0], ".runtime/state");

  const plan = readModel.next_core_basic_plan;
  assert.equal(plan?.next_command, "pnpm run runtime -- governance iterations --iteration iteration_contract_open --state-root .runtime/state");
  assert.equal(plan?.iteration_record_status.audit_command?.includes("<state-root>"), false);
  assert.equal(plan?.iteration_record_status.audit_command?.includes("--state-root .runtime/state"), true);
  assert.equal(plan?.next_iteration_seed.record_command.includes("--state-root .runtime/state"), true);
  assert.equal(plan?.layer_decision.required_before_outcome[0]?.includes("<iteration-ref>"), true);
  assert.equal(plan?.layer_decision.required_before_outcome[0]?.includes("<state-root>"), false);
  assert.equal(plan?.scorecard_basis[0], "scorecard_command=pnpm run runtime -- governance scorecard --state-root .runtime/state");

  const packet = bindGaProjectDesignArtifactPacketCommands({
    next_core_basic_plan: {
      iteration_record_status: {
        status: "not_recorded",
        record_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>"
      },
      next_command: "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root <state-root>"
    }
  } as Parameters<typeof bindGaProjectDesignArtifactPacketCommands>[0], ".runtime/state");

  assert.equal(packet.next_core_basic_plan?.next_command, "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root .runtime/state");
  assert.equal(packet.next_core_basic_plan?.iteration_record_status.record_command, "pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root .runtime/state");
});

test("iteration record CLI results bind inspect command state root", () => {
  const recordResult = bindIterationRecordResultCommand({
    action: "record-iteration",
    created: true,
    reused_existing: false,
    iteration: { id: "iteration_contract_open" },
    inspect_command: "pnpm run runtime -- governance iterations --iteration iteration_contract_open --state-root <state-root>",
    boundary: "bounded iteration contract"
  } as Parameters<typeof bindIterationRecordResultCommand>[0], ".runtime/state");
  assert.equal(recordResult.inspect_command.includes("<state-root>"), false);
  assert.equal(recordResult.inspect_command, "pnpm run runtime -- governance iterations --iteration iteration_contract_open --state-root .runtime/state");

  const outcomeResult = bindIterationRecordResultCommand({
    action: "record-iteration-outcome",
    iteration: { id: "iteration_contract_done" },
    inspect_command: "pnpm run runtime -- governance iterations --iteration iteration_contract_done --state-root <state-root>",
    boundary: "bounded iteration outcome"
  } as Parameters<typeof bindIterationRecordResultCommand>[0], ".runtime/state");
  assert.equal(outcomeResult.inspect_command.includes("<state-root>"), false);
  assert.equal(outcomeResult.inspect_command, "pnpm run runtime -- governance iterations --iteration iteration_contract_done --state-root .runtime/state");
});

test("iteration detail CLI output adds bound runtime verification commands", () => {
  const detail = bindIterationDetailRuntimeCommands({
    action: "iterations",
    iteration: {
      id: "iteration_contract_open",
      ref: "self-evolution/iterations/iteration_contract_open.json",
      proposed_slice: "core_ga_design_next_slice",
      verification_commands: [
        "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>",
        "pnpm run check"
      ]
    },
    boundary: "bounded iteration detail"
  } as Parameters<typeof bindIterationDetailRuntimeCommands>[0], ".runtime/state");

  assert.equal(detail.iteration.verification_commands[0]?.includes("<state-root>"), true);
  assert.deepEqual(detail.runtime_verification_commands, [
    "pnpm run runtime -- governance iterations --iteration iteration_contract_open --audit-seed all --state-root .runtime/state",
    "pnpm run check"
  ]);
  assert.match(detail.runtime_command_boundary, /stored iteration verification_commands remain reusable templates/);
});

test("iteration audit evidence adds bound runtime verification commands", () => {
  const evidence = buildIterationAuditEvidenceAvailable({
    id: "iteration_contract_open",
    ref: "self-evolution/iterations/iteration_contract_open.json",
    proposed_slice: "core_ga_design_next_slice",
    evidence_refs: ["packages/core/src/ga_project_design.ts"],
    verification_commands: [
      "pnpm run runtime -- governance iterations --iteration <iteration-ref> --audit-seed all --state-root <state-root>",
      "pnpm run check"
    ]
  } as Parameters<typeof buildIterationAuditEvidenceAvailable>[0], ".runtime/state");

  assert.equal(evidence.iteration_verification_commands[0]?.includes("<state-root>"), true);
  assert.deepEqual(evidence.runtime_iteration_verification_commands, [
    "pnpm run runtime -- governance iterations --iteration iteration_contract_open --audit-seed all --state-root .runtime/state",
    "pnpm run check"
  ]);
  assert.deepEqual(evidence.outcome_evidence_refs, []);
});

test("workspace status command parses read-only git diagnostic options", () => {
  const options = parseArgs([
    "workspace",
    "status",
    "--repo-root",
    "/repo/local-runtime",
    "--state-root",
    ".runtime/state",
    "--limit",
    "8"
  ]);

  assert.equal(options.command, "workspace");
  assert.equal(options.workspaceAction, "status");
  assert.equal(options.repoRoot, "/repo/local-runtime");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 8);

  const defaultAction = parseArgs(["workspace", "--state-root", ".runtime/state"]);
  assert.equal(defaultAction.command, "workspace");
  assert.equal(defaultAction.workspaceAction, undefined);

  const runtime = parseArgs(["workspace", "runtime", "--repo-root", "/repo/local-runtime"]);
  assert.equal(runtime.command, "workspace");
  assert.equal(runtime.workspaceAction, "runtime");
  assert.equal(runtime.repoRoot, "/repo/local-runtime");

  const runtimeAlias = parseArgs(["workspace", "runtime-status"]);
  assert.equal(runtimeAlias.workspaceAction, "runtime");
});

test("notify command parses operator notification queue and list options", () => {
  const queue = parseArgs([
    "notify",
    "queue",
    "--open-id",
    "ou_allowed",
    "--text",
    "进度更新：检查通过。",
    "--source",
    "codex",
    "--notification-ref",
    "memory/episodes/session_notify.json",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(queue.command, "notify");
  assert.equal(queue.notifyAction, "queue");
  assert.equal(queue.notifyOpenId, "ou_allowed");
  assert.equal(queue.notifyText, "进度更新：检查通过。");
  assert.equal(queue.notifySource, "codex");
  assert.deepEqual(queue.notifyRefs, ["memory/episodes/session_notify.json"]);
  assert.equal(queue.stateRoot, ".runtime/state");

  const list = parseArgs([
    "notify",
    "list",
    "--status",
    "queued",
    "--limit",
    "5"
  ]);
  assert.equal(list.command, "notify");
  assert.equal(list.notifyAction, "list");
  assert.equal(list.notifyStatus, "queued");
  assert.equal(list.limit, 5);
});

test("im serve routes through the project-level IM command", () => {
  const options = parseArgs([
    "im",
    "serve",
    "--scenario",
    "im-default",
    "--channel",
    "feishu-main",
    "--state-root",
    ".runtime/state",
    "--runtime-build",
    "/home/user/.local-runtime/service/runtime/current/build.json",
    "--query-todo"
  ]);

  assert.equal(options.command, "im");
  assert.equal(options.imAction, "serve");
  assert.equal(options.scenarioId, "im-default");
  assert.equal(options.channelId, "feishu-main");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.runtimeBuildPath, "/home/user/.local-runtime/service/runtime/current/build.json");
  assert.equal(options.discipline, "query_todo");
});

test("service command parses launchd lifecycle options", () => {
  const options = parseArgs([
    "service",
    "start",
    "--target",
    "im",
    "--scenario",
    "im-default",
    "--channel",
    "feishu-main",
    "--state-root",
    ".runtime/state",
    "--limit",
    "20"
  ]);

  assert.equal(options.command, "service");
  assert.equal(options.serviceAction, "start");
  assert.equal(options.serviceTarget, "im");
  assert.equal(options.scenarioId, "im-default");
  assert.equal(options.channelId, "feishu-main");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 20);

  const health = parseArgs([
    "service",
    "health",
    "--target",
    "im",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(health.command, "service");
  assert.equal(health.serviceAction, "health");
  assert.equal(health.serviceTarget, "im");
  assert.equal(health.stateRoot, ".runtime/state");
});

test("pipeline runs command parses read-only history selection", () => {
  const options = parseArgs([
    "pipeline",
    "runs",
    "--pipeline",
    "pipeline_run_1",
    "--state-root",
    ".runtime/state",
    "--limit",
    "4"
  ]);

  assert.equal(options.command, "pipeline");
  assert.equal(options.pipelineAction, "runs");
  assert.equal(options.pipelineRef, "pipeline_run_1");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 4);
});

test("pipeline resume command parses explicit checkpoint and stage selection", () => {
  const options = parseArgs([
    "pipeline",
    "resume",
    "--pipeline",
    "pipeline_run_1",
    "--from-stage",
    "tool_check",
    "--state-root",
    ".runtime/state",
    "--query-todo"
  ]);

  assert.equal(options.command, "pipeline");
  assert.equal(options.pipelineAction, "resume");
  assert.equal(options.pipelineRef, "pipeline_run_1");
  assert.equal(options.fromStage, "tool_check");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.discipline, "query_todo");
});

test("memory command parses search and session options", () => {
  const search = parseArgs([
    "memory",
    "search",
    "--query",
    "feishu service",
    "--state-root",
    ".runtime/state",
    "--limit",
    "5"
  ]);
  assert.equal(search.command, "memory");
  assert.equal(search.memoryAction, "search");
  assert.equal(search.query, "feishu service");
  assert.equal(search.stateRoot, ".runtime/state");
  assert.equal(search.limit, 5);

  const session = parseArgs(["memory", "session", "--session", "session_1"]);
  assert.equal(session.command, "memory");
  assert.equal(session.memoryAction, "session");
  assert.equal(session.sessionId, "session_1");

  const recap = parseArgs(["memory", "recap", "--session", "session_1", "--limit", "4"]);
  assert.equal(recap.command, "memory");
  assert.equal(recap.memoryAction, "recap");
  assert.equal(recap.sessionId, "session_1");
  assert.equal(recap.limit, 4);

  const archive = parseArgs(["memory", "archive", "--limit", "2"]);
  assert.equal(archive.command, "memory");
  assert.equal(archive.memoryAction, "archive");
  assert.equal(archive.limit, 2);

  const archives = parseArgs(["memory", "archives", "--archive", "2026-06-30"]);
  assert.equal(archives.command, "memory");
  assert.equal(archives.memoryAction, "archives");
  assert.equal(archives.archiveRef, "2026-06-30");

  const archiveHealth = parseArgs(["memory", "archive-health", "--archive", "2026-06-30", "--limit", "3"]);
  assert.equal(archiveHealth.command, "memory");
  assert.equal(archiveHealth.memoryAction, "archive-health");
  assert.equal(archiveHealth.archiveRef, "2026-06-30");
  assert.equal(archiveHealth.limit, 3);

  const layers = parseArgs(["memory", "layers", "--state-root", ".runtime/state"]);
  assert.equal(layers.command, "memory");
  assert.equal(layers.memoryAction, "layers");
  assert.equal(layers.stateRoot, ".runtime/state");

  const working = parseArgs([
    "memory",
    "working",
    "--checkpoint",
    "memory/working/current.json",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(working.command, "memory");
  assert.equal(working.memoryAction, "working");
  assert.equal(working.workingCheckpointRef, "memory/working/current.json");
  assert.equal(working.stateRoot, ".runtime/state");

  const dream = parseArgs([
    "memory",
    "dream",
    "--limit",
    "5"
  ]);
  assert.equal(dream.command, "memory");
  assert.equal(dream.memoryAction, "dream");
  assert.equal(dream.limit, 5);

  const dreams = parseArgs([
    "memory",
    "dreams",
    "--dream",
    "dream_1"
  ]);
  assert.equal(dreams.command, "memory");
  assert.equal(dreams.memoryAction, "dreams");
  assert.equal(dreams.dreamRef, "dream_1");

  const proposal = parseArgs([
    "memory",
    "propose-candidate",
    "--scope",
    "self_recognition",
    "--summary",
    "Core ability boundary",
    "--content",
    "Core ability content",
    "--rationale",
    "Operator correction",
    "--artifact-ref",
    "CONTEXT.md",
    "--artifact-ref",
    "docs/RUNTIME_CONTRACT.md"
  ]);
  assert.equal(proposal.command, "memory");
  assert.equal(proposal.memoryAction, "propose-candidate");
  assert.equal(proposal.memoryCandidateScope, "self_recognition");
  assert.equal(proposal.memoryCandidateSummary, "Core ability boundary");
  assert.equal(proposal.memoryCandidateContent, "Core ability content");
  assert.equal(proposal.memoryCandidateRationale, "Operator correction");
  assert.deepEqual(proposal.memoryCandidateArtifactRefs, ["CONTEXT.md", "docs/RUNTIME_CONTRACT.md"]);

  const candidates = parseArgs([
    "memory",
    "candidates",
    "--candidate",
    "memory/semantic/candidates/session_1-memory-proposal-r1-0.json",
    "--limit",
    "3"
  ]);
  assert.equal(candidates.command, "memory");
  assert.equal(candidates.memoryAction, "candidates");
  assert.equal(candidates.candidateRef, "memory/semantic/candidates/session_1-memory-proposal-r1-0.json");
  assert.equal(candidates.limit, 3);

  const accepted = parseArgs([
    "memory",
    "accepted",
    "--semantic",
    "semantic_memory_1"
  ]);
  assert.equal(accepted.command, "memory");
  assert.equal(accepted.memoryAction, "accepted");
  assert.equal(accepted.semanticMemoryRef, "semantic_memory_1");

  const confirmations = parseArgs([
    "memory",
    "confirmations",
    "--confirmation",
    "memory_confirmation_1",
    "--limit",
    "4"
  ]);
  assert.equal(confirmations.command, "memory");
  assert.equal(confirmations.memoryAction, "confirmations");
  assert.equal(confirmations.confirmationRef, "memory_confirmation_1");
  assert.equal(confirmations.limit, 4);

  const request = parseArgs([
    "memory",
    "request-candidate-confirmation",
    "--candidate",
    "memory_proposal_1"
  ]);
  assert.equal(request.command, "memory");
  assert.equal(request.memoryAction, "request-candidate-confirmation");
  assert.equal(request.candidateRef, "memory_proposal_1");

  const execute = parseArgs([
    "memory",
    "execute-candidate-confirmation",
    "--confirmation",
    "memory_confirmation_1"
  ]);
  assert.equal(execute.command, "memory");
  assert.equal(execute.memoryAction, "execute-candidate-confirmation");
  assert.equal(execute.confirmationRef, "memory_confirmation_1");
});

test("governance status command parses scoped status options", () => {
  const status = parseArgs([
    "governance",
    "status",
    "--limit",
    "4",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(status.command, "governance");
  assert.equal(status.governanceAction, "status");
  assert.equal(status.limit, 4);
  assert.equal(status.stateRoot, ".runtime/state");

  const opportunities = parseArgs([
    "governance",
    "opportunities",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(opportunities.command, "governance");
  assert.equal(opportunities.governanceAction, "opportunities");
  assert.equal(opportunities.limit, 3);
  assert.equal(opportunities.stateRoot, ".runtime/state");

  const evolution = parseArgs([
    "governance",
    "evolution",
    "--limit",
    "2",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(evolution.command, "governance");
  assert.equal(evolution.governanceAction, "evolution");
  assert.equal(evolution.limit, 2);
  assert.equal(evolution.stateRoot, ".runtime/state");

  const scorecard = parseArgs([
    "governance",
    "scorecard",
    "--limit",
    "3"
  ]);
  assert.equal(scorecard.command, "governance");
  assert.equal(scorecard.governanceAction, "scorecard");
  assert.equal(scorecard.limit, 3);

  const experts = parseArgs([
    "governance",
    "experts",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(experts.command, "governance");
  assert.equal(experts.governanceAction, "experts");
  assert.equal(experts.stateRoot, ".runtime/state");

  const expertGate = parseArgs([
    "governance",
    "experts",
    "--gate",
    "core_boundary_review"
  ]);
  assert.equal(expertGate.command, "governance");
  assert.equal(expertGate.governanceAction, "experts");
  assert.equal(expertGate.expertGateId, "core_boundary_review");

  const iterations = parseArgs([
    "governance",
    "iterations",
    "--iteration",
    "iteration_contract_1",
    "--limit",
    "1",
    "--audit-seed",
    "verification_scope"
  ]);
  assert.equal(iterations.command, "governance");
  assert.equal(iterations.governanceAction, "iterations");
  assert.equal(iterations.iterationRef, "iteration_contract_1");
  assert.equal(iterations.limit, 1);
  assert.equal(iterations.projectDesignAuditSeedId, "verification_scope");

  const iterationsAllAuditSeeds = parseArgs([
    "governance",
    "iterations",
    "--iteration",
    "iteration_contract_1",
    "--audit-seed",
    "all"
  ]);
  assert.equal(iterationsAllAuditSeeds.command, "governance");
  assert.equal(iterationsAllAuditSeeds.governanceAction, "iterations");
  assert.equal(iterationsAllAuditSeeds.iterationRef, "iteration_contract_1");
  assert.equal(iterationsAllAuditSeeds.projectDesignAuditSeedId, "all");

  const iteration = parseArgs([
    "governance",
    "record-iteration",
    "--summary",
    "Record current work as a core iteration.",
    "--layer",
    "core_runtime",
    "--owner-surface",
    "runtime_contract",
    "--proposed-slice",
    "self_evolution_iteration_contract",
    "--iteration-source-ref",
    "memory/dreams/dream_core.json",
    "--evidence-ref",
    "packages/core/src/self_evolution_scorecard.ts",
    "--verification-command",
    "pnpm run check",
    "--non-goal",
    "no scheduler",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(iteration.command, "governance");
  assert.equal(iteration.governanceAction, "record-iteration");
  assert.equal(iteration.iterationSummary, "Record current work as a core iteration.");
  assert.equal(iteration.iterationLayer, "core_runtime");
  assert.equal(iteration.iterationOwnerSurface, "runtime_contract");
  assert.equal(iteration.iterationProposedSlice, "self_evolution_iteration_contract");
  assert.equal(iteration.iterationSourceRef, "memory/dreams/dream_core.json");
  assert.deepEqual(iteration.iterationEvidenceRefs, ["packages/core/src/self_evolution_scorecard.ts"]);
  assert.deepEqual(iteration.iterationVerificationCommands, ["pnpm run check"]);
  assert.deepEqual(iteration.iterationNonGoals, ["no scheduler"]);
  assert.equal(iteration.stateRoot, ".runtime/state");

  const iterationFromPlan = parseArgs([
    "governance",
    "record-iteration",
    "--from-project-design-plan",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(iterationFromPlan.command, "governance");
  assert.equal(iterationFromPlan.governanceAction, "record-iteration");
  assert.equal(iterationFromPlan.iterationFromProjectDesignPlan, true);
  assert.equal(iterationFromPlan.stateRoot, ".runtime/state");

  const iterationOutcome = parseArgs([
    "governance",
    "record-iteration-outcome",
    "--iteration",
    "iteration_contract_1",
    "--outcome-status",
    "verified",
    "--summary",
    "Verified the bounded core iteration.",
    "--evidence-ref",
    "tests/self_evolution_iterations.test.ts",
    "--verification-command",
    "pnpm run check",
    "--next-move",
    "Open the next bounded core/basic slice.",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(iterationOutcome.command, "governance");
  assert.equal(iterationOutcome.governanceAction, "record-iteration-outcome");
  assert.equal(iterationOutcome.iterationRef, "iteration_contract_1");
  assert.equal(iterationOutcome.iterationOutcomeStatus, "verified");
  assert.equal(iterationOutcome.iterationSummary, "Verified the bounded core iteration.");
  assert.deepEqual(iterationOutcome.iterationEvidenceRefs, ["tests/self_evolution_iterations.test.ts"]);
  assert.deepEqual(iterationOutcome.iterationVerificationCommands, ["pnpm run check"]);
  assert.deepEqual(iterationOutcome.iterationNextMoves, ["Open the next bounded core/basic slice."]);
  assert.equal(iterationOutcome.stateRoot, ".runtime/state");

  const correction = parseArgs([
    "governance",
    "record-correction",
    "--summary",
    "Correct core capability classification.",
    "--owner-surface",
    "runtime_contract",
    "--proposed-slice",
    "capability_self_recognition_guard",
    "--correction-source-ref",
    "CONTEXT.md",
    "--evidence-ref",
    ".trellis/tasks/217-capability-layer-classification-guard.md",
    "--evidence-ref",
    "packages/core/src/capabilities.ts",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(correction.command, "governance");
  assert.equal(correction.governanceAction, "record-correction");
  assert.equal(correction.correctionSummary, "Correct core capability classification.");
  assert.equal(correction.correctionOwnerSurface, "runtime_contract");
  assert.equal(correction.correctionProposedSlice, "capability_self_recognition_guard");
  assert.equal(correction.correctionSourceRef, "CONTEXT.md");
  assert.deepEqual(correction.correctionEvidenceRefs, [
    ".trellis/tasks/217-capability-layer-classification-guard.md",
    "packages/core/src/capabilities.ts"
  ]);
  assert.equal(correction.stateRoot, ".runtime/state");

  const decision = parseArgs([
    "governance",
    "decide-opportunity",
    "--opportunity",
    "opportunity_open_a",
    "--status",
    "completed",
    "--reason",
    "Handled in the current iteration.",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(decision.command, "governance");
  assert.equal(decision.governanceAction, "decide-opportunity");
  assert.equal(decision.opportunityRef, "opportunity_open_a");
  assert.equal(decision.opportunityStatus, "completed");
  assert.equal(decision.reason, "Handled in the current iteration.");
  assert.equal(decision.stateRoot, ".runtime/state");

  const resume = parseArgs([
    "governance",
    "resume-autonomy",
    "--reason",
    "Operator reviewed the pause signal.",
    "--state-root",
    ".runtime/state"
  ]);
  assert.equal(resume.command, "governance");
  assert.equal(resume.governanceAction, "resume-autonomy");
  assert.equal(resume.reason, "Operator reviewed the pause signal.");
  assert.equal(resume.stateRoot, ".runtime/state");

  assert.throws(
    () => parseArgs(["governance", "opportunities", "--status", "completed"]),
    /--status is not supported/
  );
});

test("context command parses list and show options", () => {
  const list = parseArgs([
    "context",
    "list",
    "--state-root",
    ".runtime/state",
    "--limit",
    "4"
  ]);
  assert.equal(list.command, "context");
  assert.equal(list.contextAction, "list");
  assert.equal(list.stateRoot, ".runtime/state");
  assert.equal(list.limit, 4);

  const show = parseArgs([
    "context",
    "show",
    "--context",
    "memory/episodes/session_1-context.json",
    "--session",
    "session_1"
  ]);
  assert.equal(show.command, "context");
  assert.equal(show.contextAction, "show");
  assert.equal(show.contextRef, "memory/episodes/session_1-context.json");
  assert.equal(show.sessionId, "session_1");
});

test("context pressure command parses read-only pressure diagnostics", () => {
  const options = parseArgs([
    "context",
    "pressure",
    "--state-root",
    ".runtime/state",
    "--limit",
    "3"
  ]);

  assert.equal(options.command, "context");
  assert.equal(options.contextAction, "pressure");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 3);
});

test("context usage command parses read-only usage diagnostics", () => {
  const options = parseArgs([
    "context",
    "usage",
    "--state-root",
    ".runtime/state",
    "--limit",
    "4"
  ]);

  assert.equal(options.command, "context");
  assert.equal(options.contextAction, "usage");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 4);
});

test("context health command parses read-only sidecar diagnostics", () => {
  const options = parseArgs([
    "context",
    "health",
    "--state-root",
    ".runtime/state",
    "--limit",
    "2",
    "--context",
    "memory/episodes/session_missing-context.json"
  ]);

  assert.equal(options.command, "context");
  assert.equal(options.contextAction, "health");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 2);
  assert.equal(options.contextRef, "memory/episodes/session_missing-context.json");
});

test("context repair command parses explicit manifest repair options", () => {
  const options = parseArgs([
    "context",
    "repair",
    "--state-root",
    ".runtime/state",
    "--context",
    "memory/episodes/session_orphan-context.md"
  ]);

  assert.equal(options.command, "context");
  assert.equal(options.contextAction, "repair");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.contextRef, "memory/episodes/session_orphan-context.md");
});

test("review background command parses scoped review options", () => {
  const options = parseArgs([
    "review",
    "background",
    "--query",
    "skill promotion",
    "--session",
    "session_1",
    "--state-root",
    ".runtime/state",
    "--limit",
    "7"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "background");
  assert.equal(options.query, "skill promotion");
  assert.equal(options.sessionId, "session_1");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 7);
});

test("review tick command parses scoped review options", () => {
  const options = parseArgs([
    "review",
    "tick",
    "--query",
    "self evolution",
    "--session",
    "session_1",
    "--state-root",
    ".runtime/state",
    "--limit",
    "9"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "tick");
  assert.equal(options.query, "self evolution");
  assert.equal(options.sessionId, "session_1");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 9);
});

test("review ticks command parses read-only tick history selection", () => {
  const options = parseArgs([
    "review",
    "ticks",
    "--tick",
    "review_tick_1",
    "--state-root",
    ".runtime/state",
    "--limit",
    "3"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "ticks");
  assert.equal(options.tickRef, "review_tick_1");
  assert.equal(options.stateRoot, ".runtime/state");
  assert.equal(options.limit, 3);
});

test("review inbox command parses item selection", () => {
  const options = parseArgs([
    "review",
    "inbox",
    "--item",
    "review_inbox_1",
    "--status",
    "executed",
    "--limit",
    "3"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "inbox");
  assert.equal(options.inboxItemRef, "review_inbox_1");
  assert.equal(options.inboxStatus, "executed");
  assert.equal(options.limit, 3);
});

test("review confirmations command parses confirmation selection", () => {
  const options = parseArgs([
    "review",
    "confirmations",
    "--confirmation",
    "follow_up_confirmation_1",
    "--limit",
    "4",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "confirmations");
  assert.equal(options.confirmationRef, "follow_up_confirmation_1");
  assert.equal(options.limit, 4);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review confirmations command parses gate filter", () => {
  const options = parseArgs([
    "review",
    "confirmations",
    "--gate",
    "stale",
    "--limit",
    "4"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "confirmations");
  assert.equal(options.reviewConfirmationGate, "stale");
  assert.equal(options.limit, 4);
});

test("review request-inbox-confirmation command parses item selection", () => {
  const options = parseArgs([
    "review",
    "request-inbox-confirmation",
    "--item",
    "review_inbox_1"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "request-inbox-confirmation");
  assert.equal(options.inboxItemRef, "review_inbox_1");
});

test("review request-sop-confirmation command parses SOP selection", () => {
  const options = parseArgs([
    "review",
    "request-sop-confirmation",
    "--sop",
    "sop_1"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "request-sop-confirmation");
  assert.equal(options.sopRef, "sop_1");
});

test("review decide-sop-recovery command parses confirmation decision", () => {
  const options = parseArgs([
    "review",
    "decide-sop-recovery",
    "--confirmation",
    "follow_up_confirmation_stale",
    "--status",
    "fresh_requested",
    "--reason",
    "Requested a replacement after inspecting the current ledger."
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "decide-sop-recovery");
  assert.equal(options.confirmationRef, "follow_up_confirmation_stale");
  assert.equal(options.sopRecoveryStatus, "fresh_requested");
  assert.equal(options.reason, "Requested a replacement after inspecting the current ledger.");
});

test("review decide-inbox command parses inbox decision", () => {
  const options = parseArgs([
    "review",
    "decide-inbox",
    "--item",
    "review_inbox_1",
    "--status",
    "completed",
    "--reason",
    "The operator handled this suggestion in a later slice."
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "decide-inbox");
  assert.equal(options.inboxItemRef, "review_inbox_1");
  assert.equal(options.inboxDecisionStatus, "completed");
  assert.equal(options.reason, "The operator handled this suggestion in a later slice.");
});

test("review reports command parses read-only report history selection", () => {
  const options = parseArgs([
    "review",
    "reports",
    "--review",
    "background_review_1",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "reports");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review completions command parses read-only completion verification history selection", () => {
  const options = parseArgs([
    "review",
    "completions",
    "--completion",
    "completion_verification_1",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "completions");
  assert.equal(options.completionRef, "completion_verification_1");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review traces command parses read-only live run trace selection", () => {
  const options = parseArgs([
    "review",
    "traces",
    "--trace",
    "completion_verification_1",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "traces");
  assert.equal(options.traceRef, "completion_verification_1");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review replay-audit command parses selected live run trace", () => {
  const options = parseArgs([
    "review",
    "replay-audit",
    "--trace",
    "completion_verification_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "replay-audit");
  assert.equal(options.traceRef, "completion_verification_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review replays command parses replay report selection", () => {
  const options = parseArgs([
    "review",
    "replays",
    "--replay",
    "harness_replay_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "replays");
  assert.equal(options.replayRef, "harness_replay_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("skills outcomes command parses read-only selected skill outcome history selection", () => {
  const options = parseArgs([
    "skills",
    "outcomes",
    "--outcome",
    "skill_usage_1",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "outcomes");
  assert.equal(options.skillOutcomeRef, "skill_usage_1");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("skills catalog command parses read-only skill metadata selection", () => {
  const options = parseArgs([
    "skills",
    "--skill-name",
    "catalog-visible",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, undefined);
  assert.equal(options.skillName, "catalog-visible");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("skills health command parses read-only skill registry diagnostics", () => {
  const options = parseArgs([
    "skills",
    "health",
    "--skill-name",
    "registry-health",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "health");
  assert.equal(options.skillName, "registry-health");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("skills drifts command parses read-only selected skill drift summaries", () => {
  const options = parseArgs([
    "skills",
    "drifts",
    "--skill-name",
    "repeat-drift",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "drifts");
  assert.equal(options.skillName, "repeat-drift");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("skills events command parses read-only skill registry event history selection", () => {
  const options = parseArgs([
    "skills",
    "events",
    "--event",
    "skill_event_1",
    "--skill-name",
    "repeat-drift",
    "--limit",
    "3",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "events");
  assert.equal(options.skillEventRef, "skill_event_1");
  assert.equal(options.skillName, "repeat-drift");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime/state");
});

test("skills retire-event command parses explicit event retirement options", () => {
  const options = parseArgs([
    "skills",
    "retire-event",
    "--event",
    "skill_event_1",
    "--reason",
    "Historical renamed skill.",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "retire-event");
  assert.equal(options.skillEventRef, "skill_event_1");
  assert.equal(options.reason, "Historical renamed skill.");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review draft-sop command parses explicit proposal selection", () => {
  const options = parseArgs([
    "review",
    "draft-sop",
    "--review",
    "background_review_1",
    "--proposal",
    "review_proposal_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "draft-sop");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.proposalId, "review_proposal_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review audit-sop command parses explicit SOP selection", () => {
  const options = parseArgs([
    "review",
    "audit-sop",
    "--sop",
    "sop_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "audit-sop");
  assert.equal(options.sopRef, "sop_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review promote-sop command parses explicit audit gate selection", () => {
  const options = parseArgs([
    "review",
    "promote-sop",
    "--sop",
    "sop_1",
    "--audit",
    "audit_1",
    "--skill-name",
    "review-runtime-failures",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "promote-sop");
  assert.equal(options.sopRef, "sop_1");
  assert.equal(options.auditRef, "audit_1");
  assert.equal(options.skillName, "review-runtime-failures");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review chain command parses explicit SOP selection", () => {
  const options = parseArgs([
    "review",
    "chain",
    "--sop",
    "sop_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "chain");
  assert.equal(options.sopRef, "sop_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review coverage command parses explicit SOP selection", () => {
  const options = parseArgs([
    "review",
    "coverage",
    "--sop",
    "sop_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "coverage");
  assert.equal(options.sopRef, "sop_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review rehearse-sop-loop command parses explicit local rehearsal", () => {
  const options = parseArgs([
    "review",
    "rehearse-sop-loop",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "rehearse-sop-loop");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review plan-follow-up command parses explicit proposal selection", () => {
  const options = parseArgs([
    "review",
    "plan-follow-up",
    "--review",
    "background_review_1",
    "--proposal",
    "review_proposal_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "plan-follow-up");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.proposalId, "review_proposal_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review execute-follow-up command parses explicit action selection", () => {
  const options = parseArgs([
    "review",
    "execute-follow-up",
    "--review",
    "background_review_1",
    "--proposal",
    "review_proposal_1",
    "--action",
    "follow_up_action_inspect_chain_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "execute-follow-up");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.proposalId, "review_proposal_1");
  assert.equal(options.followUpActionId, "follow_up_action_inspect_chain_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review request-follow-up command parses explicit action selection", () => {
  const options = parseArgs([
    "review",
    "request-follow-up",
    "--review",
    "background_review_1",
    "--proposal",
    "review_proposal_1",
    "--action",
    "follow_up_action_promote_sop_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "request-follow-up");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.proposalId, "review_proposal_1");
  assert.equal(options.followUpActionId, "follow_up_action_promote_sop_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("review execute-confirmed-follow-up command parses confirmation selection", () => {
  const options = parseArgs([
    "review",
    "execute-confirmed-follow-up",
    "--confirmation",
    "follow_up_confirmation_1",
    "--state-root",
    ".runtime/state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "execute-confirmed-follow-up");
  assert.equal(options.confirmationRef, "follow_up_confirmation_1");
  assert.equal(options.stateRoot, ".runtime/state");
});

test("provider-first Feishu CLI surface is not a first-version command", () => {
  assert.throws(() => parseArgs(["feishu", "serve"]), /Unknown argument: serve/);
});
