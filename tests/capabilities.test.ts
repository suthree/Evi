import assert from "node:assert/strict";
import test from "node:test";
import { allowedActions } from "../packages/core/src/action_contracts.js";
import { getCapabilityAcceptanceAudit, getCapabilityCatalog, resolveCapabilityLayer } from "../packages/core/src/capabilities.js";
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
  assert.equal(catalog.catalog_version, "2026-07-07");
  assert.equal(catalog.boundary.includes("local-only read model"), true);
  assert.equal(catalog.categories.every((category) => typeof category.layer === "string"), true);
  assert.equal(
    catalog.categories.every((category) => category.capabilities.every((capability) => capability.category_layer === category.layer)),
    true
  );
  assert.equal(
    catalog.categories.every((category) => category.capabilities.every((capability) =>
      capability.effective_layer === (capability.layer ?? category.layer)
      && resolveCapabilityLayer(category, capability) === capability.effective_layer
    )),
    true
  );
  assert.equal(coreTools?.layer, "core_runtime");
  assert.equal(harnessActions?.layer, "core_runtime");
  assert.equal(readModels?.layer, "core_runtime");
  assert.equal(memoryAndLearning?.layer, "local_learning");
  assert.equal(runtimeService?.layer, "basic_entrypoint");
  assert.equal(entrypoints?.layer, "basic_entrypoint");
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
  const delegateAgent = harnessActions?.capabilities.find((capability) => capability.id === "delegate_agent");
  assert.equal(delegateAgent?.summary.includes("bounded structured analysis"), true);
  assert.equal(delegateAgent?.summary.includes("delegated-result contract"), true);
  assert.equal(delegateAgent?.summary.includes("main harness"), true);
  assert.equal(catalog.refs.includes("docs/RUNTIME_CONTRACT.md"), true);
  assert.equal(catalog.refs.includes("packages/core/src/capabilities.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/ga_project_design.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/expert_orchestration.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/harness_replay.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/pipeline_history.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/self_evolution_gaps.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/workspace_status.ts"), true);
  assert.equal(catalog.refs.includes("packages/core/src/runtime_sessions.ts"), true);
  assert.equal(catalog.refs.includes("packages/runtime/src/web_console.ts"), true);
  assert.equal(catalog.refs.includes("packages/runtime/src/channels/feishu/adapter.ts"), true);
  assert.equal(runtimeService?.capabilities.some((capability) => capability.id === "workspace.status"), true);
  const runtimeSessions = runtimeService?.capabilities.find((capability) => capability.id === "runtime.sessions");
  assert.equal(runtimeSessions?.refs?.includes("packages/core/src/runtime_sessions.ts"), true);
  assert.equal(runtimeSessions?.commands?.includes("pnpm run runtime -- web"), true);
  assert.equal(runtimeSessions?.boundaries?.some((boundary) => boundary.includes("pending/unassigned")), true);
  assert.equal(runtimeSessions?.boundaries?.some((boundary) => boundary.includes("ordinary bound group messages")), true);
  const feishuSession = runtimeService?.capabilities.find((capability) => capability.id === "feishu.private_chat");
  assert.equal(feishuSession?.summary.includes("Feishu groups"), true);
  assert.equal(feishuSession?.boundaries?.some((boundary) => boundary.includes("unknown groups")), true);
  assert.equal(runtimeService?.capabilities.some((capability) => capability.id === "service.content_feedback_refresh_loop"), true);
  const webConsole = entrypoints?.capabilities.find((capability) => capability.id === "web.console");
  assert.equal(webConsole?.commands?.includes("pnpm run runtime -- web --host 127.0.0.1 --port 8765"), true);
  assert.equal(webConsole?.refs?.includes("packages/runtime/src/web_console.ts"), true);
  assert.equal(webConsole?.boundaries?.some((boundary) => boundary.includes("localhost operator surface")), true);
  assert.equal(webConsole?.boundaries?.some((boundary) => boundary.includes("not a hosted")), true);
  const contentDryRun = entrypoints?.capabilities.find((capability) => capability.id === "cli.content_dry_run");
  assert.equal(contentDryRun?.layer, "application_slice");
  assert.equal(contentDryRun?.category_layer, "basic_entrypoint");
  assert.equal(contentDryRun?.effective_layer, "application_slice");
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
  assert.notEqual(contentDryRun?.layer, "core_runtime");
  const livePipeline = entrypoints?.capabilities.find((capability) => capability.id === "cli.live.pipeline");
  assert.equal(livePipeline?.commands?.includes("pnpm run runtime -- pipeline runs --pipeline <ref>"), true);
  assert.equal(livePipeline?.refs?.includes("packages/core/src/pipeline_history.ts"), true);
  assert.equal(livePipeline?.boundaries?.some((boundary) =>
    boundary.includes("bounded blocked-tool diagnostic metadata")
    && boundary.includes("failure_kind")
    && boundary.includes("tool artifacts")
  ), true);
  for (const term of ["Image API", "agent-browser", "xiaohongshu-mcp", "market"]) {
    assert.equal(
      contentDryRun?.summary.includes(term) || contentDryRun?.boundaries?.some((boundary) => boundary.includes(term)),
      true
    );
    assert.notEqual(contentDryRun?.layer, "core_runtime");
  }
  assert.equal(runtimeService?.capabilities.find((capability) => capability.id === "service.content_daily_loop")?.layer, "application_slice");
  assert.equal(runtimeService?.capabilities.find((capability) => capability.id === "service.content_feedback_refresh_loop")?.layer, "application_slice");
  assert.equal(runtimeService?.capabilities.find((capability) => capability.id === "service.content_creator_metrics_loop")?.layer, "application_slice");
  const selfEvolutionGaps = memoryAndLearning?.capabilities.find((capability) => capability.id === "self_evolution.gaps");
  assert.equal(selfEvolutionGaps?.effective_layer, "local_learning");
  assert.equal(selfEvolutionGaps?.commands?.includes("pnpm run runtime -- governance gaps"), true);
  assert.equal(selfEvolutionGaps?.commands?.includes("pnpm run runtime -- governance record-correction --summary <summary>"), true);
  assert.equal(selfEvolutionGaps?.refs?.includes("packages/core/src/self_evolution_gaps.ts"), true);
  assert.equal(selfEvolutionGaps?.refs?.includes("packages/core/src/self_evolution_scorecard.ts"), true);
  assert.equal(selfEvolutionGaps?.boundaries?.some((boundary) => boundary.includes("operator-correction records")), true);
  assert.equal(selfEvolutionGaps?.boundaries?.some((boundary) => boundary.includes("scorecard maturity metadata")), true);
  const dreamSnapshots = memoryAndLearning?.capabilities.find((capability) => capability.id === "dream.snapshots");
  assert.equal(dreamSnapshots?.effective_layer, "local_learning");
  assert.equal(dreamSnapshots?.commands?.includes("pnpm run runtime -- memory dream"), true);
  assert.equal(dreamSnapshots?.refs?.includes("packages/core/src/dreams.ts"), true);
  assert.equal(dreamSnapshots?.boundaries?.some((boundary) => boundary.includes("context only")), true);
  const scorecard = memoryAndLearning?.capabilities.find((capability) => capability.id === "self_evolution.scorecard");
  assert.equal(scorecard?.layer, "core_runtime");
  assert.equal(scorecard?.category_layer, "local_learning");
  assert.equal(scorecard?.effective_layer, "core_runtime");
  assert.equal(scorecard?.commands?.includes("pnpm run runtime -- governance scorecard"), true);
  assert.equal(scorecard?.refs?.includes("packages/core/src/self_evolution_scorecard.ts"), true);
  assert.equal(scorecard?.summary.includes("core/basic selection view"), true);
  assert.equal(scorecard?.boundaries?.some((boundary) => boundary.includes("read-only core/basic selection surface")), true);
  assert.equal(scorecard?.boundaries?.some((boundary) => boundary.includes("local-learning maturity metadata as gated context")), true);
  const iterations = memoryAndLearning?.capabilities.find((capability) => capability.id === "self_evolution.iterations");
  assert.equal(iterations?.layer, "core_runtime");
  assert.equal(iterations?.commands?.includes("pnpm run runtime -- governance iterations"), true);
  assert.equal(iterations?.commands?.some((command) => command.includes("--audit-seed <seed-id>")), true);
  assert.equal(iterations?.commands?.some((command) => command.includes("--audit-seed all")), true);
  assert.equal(iterations?.commands?.some((command) => command.includes("--from-project-design-plan")), true);
  assert.equal(iterations?.refs?.includes("packages/core/src/self_evolution_iterations.ts"), true);
  assert.equal(iterations?.boundaries?.some((boundary) => boundary.includes("write one local state record only")), true);
  assert.equal(iterations?.boundaries?.some((boundary) => boundary.includes("plan-derived iteration recording")), true);
  assert.equal(iterations?.boundaries?.some((boundary) => boundary.includes("reuses a matching open iteration")), true);
  assert.equal(iterations?.boundaries?.some((boundary) => boundary.includes("aggregate completion audit") && boundary.includes("read-only")), true);
  assert.equal(iterations?.boundaries?.some((boundary) => boundary.includes("seed evidence status") && boundary.includes("does not prove")), true);
  assert.equal(iterations?.boundaries?.some((boundary) => boundary.includes("do not execute work")), true);
  const projectDesignContract = readModels?.capabilities.find((capability) => capability.id === "ga.project_design_contract");
  assert.equal(projectDesignContract?.layer, "core_runtime");
  assert.equal(projectDesignContract?.category_layer, "core_runtime");
  assert.equal(projectDesignContract?.effective_layer, "core_runtime");
  assert.equal(projectDesignContract?.commands?.includes("pnpm run runtime -- governance project-design"), true);
  assert.equal(projectDesignContract?.commands?.some((command) => command.includes("--artifact <artifact-or-iteration-ref>")), true);
  assert.equal(projectDesignContract?.commands?.some((command) => command.includes("--audit-seed <seed-id>")), true);
  assert.equal(projectDesignContract?.refs?.includes("packages/core/src/ga_project_design.ts"), true);
  assert.equal(projectDesignContract?.boundaries?.some((boundary) => boundary.includes("read-only GA project design contract")), true);
  assert.equal(projectDesignContract?.boundaries?.some((boundary) => boundary.includes("derive and inspect read-only artifacts")), true);
  assert.equal(projectDesignContract?.boundaries?.some((boundary) => boundary.includes("next_core_basic_plan") && boundary.includes("advisory context")), true);
  assert.equal(projectDesignContract?.boundaries?.some((boundary) => boundary.includes("layer_decision") && boundary.includes("external adapters as application slices")), true);
  assert.equal(projectDesignContract?.boundaries?.some((boundary) => boundary.includes("iteration_record_status") && boundary.includes("matching open iterations")), true);
  assert.equal(projectDesignContract?.boundaries?.some((boundary) => boundary.includes("next_iteration_seed") && boundary.includes("does not write state")), true);
  assert.equal(projectDesignContract?.boundaries?.some((boundary) => boundary.includes("completion_audit_seeds") && boundary.includes("advisory evidence prompts only")), true);
  assert.equal(projectDesignContract?.boundaries?.some((boundary) => boundary.includes("application slices")), true);
  const expertContract = readModels?.capabilities.find((capability) => capability.id === "expert.orchestration_contract");
  assert.equal(expertContract?.layer, "boundary");
  assert.equal(expertContract?.category_layer, "core_runtime");
  assert.equal(expertContract?.effective_layer, "boundary");
  assert.equal(expertContract?.commands?.includes("pnpm run runtime -- governance experts"), true);
  assert.equal(expertContract?.refs?.includes("packages/core/src/expert_orchestration.ts"), true);
  assert.equal(expertContract?.refs?.includes("CONTEXT.md"), true);
  assert.equal(expertContract?.boundaries?.some((boundary) => boundary.includes("read-only expert orchestration contract")), true);
  assert.equal(expertContract?.boundaries?.some((boundary) => boundary.includes("not current core/basic maturity")), true);
  const writeRepo = coreTools?.capabilities.find((capability) => capability.id === "file.write_repo");
  assert.equal(writeRepo?.refs?.includes("packages/runtime/src/tools.ts"), true);
  assert.equal(writeRepo?.refs?.includes("packages/core/src/workspace_status.ts"), true);
  assert.equal(writeRepo?.boundaries?.some((boundary) => boundary.includes("pre/post workspace status evidence")), true);
  const commandRun = coreTools?.capabilities.find((capability) => capability.id === "command.run");
  assert.equal(commandRun?.refs?.includes("packages/runtime/src/tools.ts"), true);
  assert.equal(commandRun?.boundaries?.some((boundary) => boundary.includes("output budget and truncation metadata")), true);
  assert.equal(commandRun?.boundaries?.some((boundary) => boundary.includes("failure_kind metadata")), true);
  const repoSearch = coreTools?.capabilities.find((capability) => capability.id === "repo.search");
  assert.equal(repoSearch?.refs?.includes("packages/runtime/src/tools.ts"), true);
  assert.equal(repoSearch?.boundaries?.some((boundary) => boundary.includes("output budget and truncation metadata")), true);
  const httpFetch = coreTools?.capabilities.find((capability) => capability.id === "http.fetch");
  assert.equal(httpFetch?.boundaries?.some((boundary) => boundary.includes("output budget and truncation metadata")), true);
  const executeNode = coreTools?.capabilities.find((capability) => capability.id === "code.execute_node");
  assert.equal(executeNode?.boundaries?.some((boundary) => boundary.includes("minimal runtime environment")), true);
  const reviewHistory = readModels?.capabilities.find((capability) => capability.id === "review.history");
  assert.equal(reviewHistory?.boundaries?.some((boundary) => boundary.includes("repo-write workspace guard summaries")), true);
  assert.equal(reviewHistory?.commands?.includes("pnpm run runtime -- review replays"), true);
  assert.equal(reviewHistory?.refs?.includes("packages/core/src/harness_replay.ts"), true);
});

test("capability catalog exposes delegate_agent failure boundaries", () => {
  const catalog = getCapabilityCatalog();
  const delegateAgent = catalog.categories
    .find((category) => category.id === "harness_actions")
    ?.capabilities.find((capability) => capability.id === "delegate_agent");

  assert.ok(delegateAgent);
  const text = [delegateAgent.summary, ...(delegateAgent.boundaries ?? [])].join("\n");

  assert.match(text, /strict task\/context only/);
  assert.match(text, /at most one delegate_agent action per model round/);
  assert.match(text, /block verified completion until later main-harness write\/run evidence proves recovery/);
  assert.match(text, /failed delegated results may only guide a later main-harness model round/);
  assert.match(text, /done claims after delegation require harness-known non-delegated verification refs/);
  assert.match(text, /dispatch_failure_kind/);
  assert.match(text, /dispatch_limit_exceeded/);
  assert.match(text, /input_contract_failed/);
  assert.match(text, /none means no dispatch-layer failure, not delegated success/);
  assert.match(text, /sanitized/);
  assert.match(text, /exclude raw task, context, output preview, and artifact bodies/);
  assert.match(text, /no retry, fallback, tool, mutation/);
  assert.match(text, /completion authority/);
});

test("capability acceptance audit records next-version gates without execution authority", () => {
  const audit = getCapabilityAcceptanceAudit();

  assert.equal(audit.audit_id, "local_runtime_next_version_capability_acceptance");
  assert.equal(audit.status, "operator_check_required");
  assert.equal(audit.gates.some((gate) => gate.id === "core_execution" && gate.status === "ready"), true);
  assert.equal(audit.gates.find((gate) => gate.id === "core_execution")?.summary.includes("auditable bounded result metadata"), true);
  assert.equal(audit.gates.find((gate) => gate.id === "core_execution")?.boundaries.some((boundary) => boundary.includes("bounded audit metadata")), true);
  assert.equal(audit.gates.some((gate) => gate.id === "basic_entrypoints" && gate.status === "operator_check"), true);
  assert.equal(audit.gates.every((gate) => typeof gate.layer === "string"), true);
  assert.equal(audit.gates.every((gate) => gate.layer === "core_runtime" || gate.layer === "basic_entrypoint"), true);
  assert.equal(audit.gates.some((gate) => gate.layer === "local_learning" || gate.layer === "application_slice"), false);
  assert.equal(audit.gates.find((gate) => gate.id === "core_execution")?.layer, "core_runtime");
  assert.equal(audit.gates.find((gate) => gate.id === "agent_harness")?.layer, "core_runtime");
  assert.equal(audit.gates.find((gate) => gate.id === "context_runtime")?.layer, "core_runtime");
  assert.equal(audit.gates.find((gate) => gate.id === "basic_entrypoints")?.layer, "basic_entrypoint");
  assert.equal(audit.gates.find((gate) => gate.id === "basic_entrypoints")?.evidence_refs.includes("packages/core/src/runtime_sessions.ts"), true);
  assert.equal(audit.gates.find((gate) => gate.id === "basic_entrypoints")?.evidence_refs.includes("packages/runtime/src/web_console.ts"), true);
  assert.equal(audit.gates.find((gate) => gate.id === "basic_entrypoints")?.verification_commands.includes("pnpm run runtime -- web --host 127.0.0.1 --port 8765"), true);
  assert.equal(audit.gates.find((gate) => gate.id === "basic_entrypoints")?.boundaries.some((boundary) => boundary.includes("localhost-only")), true);
  assert.equal(audit.verification_commands.includes("pnpm run check"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- capabilities acceptance"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- review rehearse-sop-loop --state-root <state-root>"), false);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- context pressure --limit 10 --state-root <state-root>"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- review replay-audit --trace <trace-ref> --state-root <state-root>"), true);
  assert.equal(audit.verification_commands.includes("pnpm run runtime -- review replays --limit 10 --state-root <state-root>"), true);
  assert.equal(audit.gates.some((gate) => gate.verification_commands.includes("pnpm run runtime -- review rehearse-sop-loop")), false);
  assert.equal(audit.gates.some((gate) => gate.id === "agent_harness" && gate.evidence_refs.includes("packages/core/src/harness_replay.ts")), true);
  assert.equal(audit.gates.some((gate) => gate.id === "agent_harness" && gate.evidence_refs.includes("packages/core/src/pipeline_history.ts")), true);
  assert.equal(audit.gates.some((gate) => gate.id === "agent_harness" && gate.verification_commands.includes("pnpm run runtime -- review replay-audit --trace <trace-ref> --state-root <state-root>")), true);
  assert.equal(audit.gates.some((gate) => gate.id === "agent_harness" && gate.boundaries.some((boundary) => boundary.includes("bounded trace metadata only"))), true);
  assert.equal(audit.gates.some((gate) => gate.id === "agent_harness" && gate.boundaries.some((boundary) => boundary.includes("persist bounded tool_result evidence"))), true);
  assert.equal(audit.gates.some((gate) => gate.id === "context_runtime" && gate.boundaries.some((boundary) => boundary.includes("pressure guidance"))), true);
  assert.equal(audit.default_next_slice.id, "basic_entrypoints_operator_check");
  assert.equal(audit.default_next_slice.layer, "basic_entrypoint");
  assert.equal(audit.default_next_slice.refs.includes("docs/ACTIVE_EXPLORATION.md"), false);
  assert.equal(audit.next_slices[0]?.id, audit.default_next_slice.id);
  assert.equal(audit.next_slices[0]?.layer, "basic_entrypoint");
  assert.equal(audit.next_slices.length, 1);
  assert.equal(audit.next_slices.every((slice) => slice.layer === "core_runtime" || slice.layer === "basic_entrypoint"), true);
  assert.equal(audit.next_slices.some((slice) => slice.layer === "application_slice" || slice.layer === "local_learning"), false);
  assert.equal(audit.follow_up_slices.every((slice) => slice.id !== audit.default_next_slice.id), true);
  assert.equal(audit.follow_up_slices.some((slice) => slice.id === "active_exploration_publish_plan"), true);
  assert.equal(audit.follow_up_slices.some((slice) => slice.id === "self_evolution_gap_intake"), true);
  assert.equal(audit.follow_up_slices.some((slice) => slice.id === "sop_skill_persistence_follow_up"), true);
  assert.equal(audit.next_slices.some((slice) => slice.id === "real_sop_loop_rehearsal"), false);
  assert.equal(audit.next_slices.some((slice) => slice.id === "context_pressure_action_gate"), false);
  assert.equal(audit.next_slices.some((slice) => slice.id === "harness_replay_acceptance"), false);
  assert.equal(audit.next_slices.some((slice) => slice.id === "active_exploration_publish_plan"), false);
  assert.equal(audit.next_slices.some((slice) => slice.id === "self_evolution_gap_intake"), false);
  assert.equal(audit.next_slices.every((slice) => typeof slice.layer === "string"), true);
  assert.equal(audit.follow_up_slices.every((slice) => typeof slice.layer === "string"), true);
  assert.equal(audit.follow_up_slices
    .filter((slice) => slice.id.startsWith("active_exploration_"))
    .every((slice) => slice.layer === "application_slice"), true);
  assert.equal(audit.follow_up_slices.find((slice) => slice.id === "self_evolution_gap_intake")?.layer, "local_learning");
  assert.equal(audit.follow_up_slices.find((slice) => slice.id === "sop_skill_persistence_follow_up")?.layer, "local_learning");
  assert.equal(audit.next_slices.some((slice) => slice.layer === "core_runtime" && slice.refs.includes("docs/ACTIVE_EXPLORATION.md")), false);
  assert.equal(audit.follow_up_slices.some((slice) =>
    slice.id === "self_evolution_gap_intake"
    && slice.refs.includes("packages/core/src/self_evolution_gaps.ts")
    && slice.success_criteria.some((criterion) => criterion.includes("Opportunity Backlog"))
  ), true);
  assert.equal(audit.follow_up_slices.some((slice) =>
    slice.refs.includes("docs/ACTIVE_EXPLORATION.md")
  ), true);
  assert.equal([...audit.next_slices, ...audit.follow_up_slices].every((slice) =>
    slice.success_criteria.length > 0 && slice.refs.length > 0
  ), true);
  assert.equal(audit.boundary.includes("read-only acceptance read model"), true);
  assert.equal(audit.boundary.includes("does not run tests"), true);
});
