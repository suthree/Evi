import assert from "node:assert/strict";
import test from "node:test";
import { allowedActions } from "../packages/core/src/action_contracts.js";
import { getCapabilityAcceptanceAudit, getCapabilityCatalog } from "../packages/core/src/capabilities.js";
import { coreToolContracts } from "../packages/core/src/tool_contracts.js";

test("capability catalog mirrors core tool and harness action contracts", () => {
  const catalog = getCapabilityCatalog();
  const coreTools = catalog.categories.find((category) => category.id === "core_tools");
  const harnessActions = catalog.categories.find((category) => category.id === "harness_actions");
  const readModels = catalog.categories.find((category) => category.id === "context_read_models");
  const memoryAndLearning = catalog.categories.find((category) => category.id === "memory_and_learning");
  const runtimeService = catalog.categories.find((category) => category.id === "runtime_service");
  const entrypoints = catalog.categories.find((category) => category.id === "entrypoints");

  assert.equal(catalog.catalog_id, "local_runtime_capabilities");
  assert.equal(catalog.boundary.includes("local-only read model"), true);
  assert.equal(coreTools?.capabilities.length, coreToolContracts.length);
  assert.deepEqual(
    coreTools?.capabilities.map((capability) => capability.id),
    coreToolContracts.map((contract) => contract.tool)
  );
  assert.equal(harnessActions?.capabilities.length, allowedActions.length);
  assert.deepEqual(
    harnessActions?.capabilities.map((capability) => capability.id),
    allowedActions
  );
  assert.equal(catalog.refs.includes("docs/RUNTIME_CONTRACT.md"), true);
  assert.equal(catalog.refs.includes("packages/core/src/capabilities.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/harness_replay.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/self_evolution_gaps.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/workspace_status.ts"), true);
  assert.equal(catalog.refs.includes("packages/runtime/src/channels/feishu/adapter.ts"), true);
  assert.equal(runtimeService?.capabilities.some((capability) => capability.id === "workspace.status"), true);
  assert.equal(runtimeService?.capabilities.some((capability) => capability.id === "service.content_feedback_refresh_loop"), true);
  const contentDryRun = entrypoints?.capabilities.find((capability) => capability.id === "cli.content_dry_run");
  assert.equal(contentDryRun?.commands?.includes("pnpm run runtime -- content run --dry-run"), true);
  assert.equal(contentDryRun?.commands?.includes("pnpm run runtime -- content run --dry-run --live-sources"), true);
  assert.equal(contentDryRun?.commands?.includes("pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check"), true);
  assert.equal(contentDryRun?.commands?.includes("pnpm run runtime -- content feedback-refresh --server-url http://localhost:18060/mcp"), true);
  assert.equal(contentDryRun?.commands?.includes("pnpm run runtime -- content creator-metrics-needed --captured-by xiaohongshu-mcp"), true);
  assert.equal(contentDryRun?.commands?.includes("pnpm run runtime -- content creator-metrics-capture --run <ref>"), true);
  assert.equal(contentDryRun?.refs?.includes("packages/runtime/src/content_channel_readiness.ts"), true);
  assert.equal(contentDryRun?.boundaries?.some((boundary) => boundary.includes("external publishing")), true);
  assert.equal(contentDryRun?.boundaries?.some((boundary) => boundary.includes("channel-readiness may run local agent-browser diagnostics")), true);
  assert.equal(contentDryRun?.boundaries?.some((boundary) => boundary.includes("feedback-refresh reads the feedback-needed queue")), true);
  assert.equal(contentDryRun?.boundaries?.some((boundary) => boundary.includes("creator-metrics-needed lists posts") && boundary.includes("channel-readiness")), true);
  const selfEvolutionGaps = memoryAndLearning?.capabilities.find((capability) => capability.id === "self_evolution.gaps");
  assert.equal(selfEvolutionGaps?.commands?.includes("pnpm run runtime -- governance gaps"), true);
  assert.equal(selfEvolutionGaps?.refs?.includes("packages/core/src/self_evolution_gaps.ts"), true);
  assert.equal(selfEvolutionGaps?.boundaries?.some((boundary) => boundary.includes("does not read draft bodies")), true);
  const writeRepo = coreTools?.capabilities.find((capability) => capability.id === "file.write_repo");
  assert.equal(writeRepo?.refs?.includes("packages/runtime/src/tools.ts"), true);
  assert.equal(writeRepo?.refs?.includes("packages/core/src/workspace_status.ts"), true);
  assert.equal(writeRepo?.boundaries?.some((boundary) => boundary.includes("pre/post workspace status evidence")), true);
  const reviewHistory = readModels?.capabilities.find((capability) => capability.id === "review.history");
  assert.equal(reviewHistory?.boundaries?.some((boundary) => boundary.includes("repo-write workspace guard summaries")), true);
  assert.equal(reviewHistory?.commands?.includes("pnpm run runtime -- review replays"), true);
  assert.equal(reviewHistory?.refs?.includes("packages/core/src/harness_replay.ts"), true);
});

test("capability acceptance audit records next-version gates without execution authority", () => {
  const audit = getCapabilityAcceptanceAudit();

  assert.equal(audit.audit_id, "local_runtime_next_version_capability_acceptance");
  assert.equal(audit.status, "operator_check_required");
  assert.equal(audit.gates.some((gate) => gate.id === "core_execution" && gate.status === "ready"), true);
  assert.equal(audit.gates.some((gate) => gate.id === "basic_entrypoints" && gate.status === "operator_check"), true);
  assert.equal(audit.gates.some((gate) => gate.id === "sop_self_evolution"), true);
  assert.equal(audit.verification_commands.includes("pnpm run check"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- capabilities acceptance"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- review rehearse-sop-loop --state-root <state-root>"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- context pressure --limit 10 --state-root <state-root>"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- review replay-audit --trace <trace-ref> --state-root <state-root>"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- review replays --limit 10 --state-root <state-root>"), true);
  assert.equal(audit.gates.some((gate) => gate.verification_commands.includes("pnpm run runtime -- review rehearse-sop-loop")), true);
  assert.equal(audit.gates.some((gate) => gate.id === "agent_harness" && gate.evidence_refs.includes("packages/core/src/harness_replay.ts")), true);
  assert.equal(audit.gates.some((gate) => gate.id === "agent_harness" && gate.verification_commands.includes("pnpm run runtime -- review replay-audit --trace <trace-ref> --state-root <state-root>")), true);
  assert.equal(audit.gates.some((gate) => gate.id === "agent_harness" && gate.boundaries.some((boundary) => boundary.includes("bounded trace metadata only"))), true);
  assert.equal(audit.gates.some((gate) => gate.id === "context_runtime" && gate.boundaries.some((boundary) => boundary.includes("pressure guidance"))), true);
  assert.equal(audit.next_slices.some((slice) => slice.id === "real_sop_loop_rehearsal"), false);
  assert.equal(audit.next_slices.some((slice) => slice.id === "context_pressure_action_gate"), false);
  assert.equal(audit.next_slices.some((slice) => slice.id === "harness_replay_acceptance"), false);
  assert.equal(audit.next_slices.some((slice) => slice.id === "active_exploration_publish_plan"), true);
  assert.equal(audit.next_slices.some((slice) => slice.id === "self_evolution_gap_intake"), true);
  assert.equal(audit.next_slices.some((slice) =>
    slice.id === "self_evolution_gap_intake"
    && slice.refs.includes("packages/core/src/self_evolution_gaps.ts")
    && slice.success_criteria.some((criterion) => criterion.includes("Opportunity Backlog"))
  ), true);
  assert.equal(audit.next_slices.some((slice) =>
    slice.refs.includes("docs/ACTIVE_EXPLORATION.md")
  ), true);
  assert.equal(audit.next_slices.every((slice) =>
    slice.success_criteria.length > 0 && slice.refs.length > 0
  ), true);
  assert.equal(audit.boundary.includes("read-only acceptance read model"), true);
  assert.equal(audit.boundary.includes("does not run tests"), true);
});
