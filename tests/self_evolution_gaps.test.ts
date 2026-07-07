import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parseArgs } from "../apps/cli/src/main.js";
import { type ContentRun } from "../packages/core/src/content_pipeline.js";
import {
  decideOpportunity,
  getOpportunityBacklog
} from "../packages/core/src/opportunity_backlog.js";
import {
  getSelfEvolutionGap,
  listSelfEvolutionGaps,
  recordOperatorCorrection
} from "../packages/core/src/self_evolution_gaps.js";
import {
  recordSelfEvolutionIteration,
  recordSelfEvolutionIterationOutcome
} from "../packages/core/src/self_evolution_iterations.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  recordContentImageEvidence,
  recordContentFeedbackEvidence,
  recordContentPublishPreflight,
  recordContentPublishEvidence,
  runContentDryRun
} from "../packages/runtime/src/content_pipeline.js";

test("self-evolution gaps derive external publish evidence gaps from content runs", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await createLiveSourceContentRun(store);

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.count, 1);
    assert.equal(result.boundary.includes("does not read draft bodies"), true);

    const gap = result.gaps[0];
    assert.equal(gap.id, `gap_external_publish_evidence_${run.id}`);
    assert.equal(gap.status, "active");
    assert.equal(gap.effective_status, "active");
    assert.equal(gap.opportunity_decision, undefined);
    assert.equal(gap.source, "content_run");
    assert.equal(gap.source_ref, run.refs.run_ref);
    assert.equal(gap.owner_surface, "runtime_tools");
    assert.equal(gap.proposed_slice, "external_publish_preflight_contract");
    assert.equal(gap.observed_problem.includes("no typed preflight evidence"), true);
    assert.deepEqual(gap.evidence_refs, [
      run.refs.run_ref,
      run.refs.publish_plan_ref,
      run.refs.source_evidence_ref
    ]);
    assert.equal(gap.acceptance.some((item) => item.includes("without publishing")), true);
    assert.equal(gap.non_goals.some((item) => item.includes("platform-cookie")), true);
    assert.equal(gap.verification_commands.some((item) => item.includes("tests/self_evolution_gaps.test.ts")), true);

    const byId = await getSelfEvolutionGap(store, { gapRef: gap.id });
    assert.equal(byId.gap.ref, gap.ref);
    const bySource = await getSelfEvolutionGap(store, { gapRef: run.refs.run_ref });
    assert.equal(bySource.gap.id, gap.id);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps derive SOP candidates from operator corrections", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);

    const recorded = await recordOperatorCorrection(store, {
      summary: "Operator corrected capability classification: external tool usage is an application slice, while repeated GA project design is core capability.",
      ownerSurface: "runtime_contract",
      proposedSlice: "capability_self_recognition_guard",
      sourceRef: "CONTEXT.md",
      evidenceRefs: [".trellis/tasks/217-capability-layer-classification-guard.md"]
    });

    assert.equal(recorded.action, "record-correction");
    assert.match(recorded.gap_id, /^gap_operator_correction_/);
    assert.equal(recorded.boundary.includes("writes one bounded local state record only"), true);

    const detail = await getSelfEvolutionGap(store, { gapRef: recorded.gap_id });
    assert.equal(detail.gap.source, "operator_correction");
    assert.equal(detail.gap.source_ref, recorded.correction.ref);
    assert.equal(detail.gap.owner_surface, "runtime_contract");
    assert.equal(detail.gap.proposed_slice, "capability_self_recognition_guard");
    assert.equal(detail.gap.follow_up_kind, "sop_candidate");
    assert.deepEqual(detail.gap.evidence_refs, [
      recorded.correction.ref,
      "CONTEXT.md",
      ".trellis/tasks/217-capability-layer-classification-guard.md"
    ]);
    assert.equal(detail.gap.acceptance.some((item) => item.includes("SOP-candidate")), true);
    assert.equal(detail.gap.non_goals.some((item) => item.includes("auto-promote")), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === recorded.gap_id);
    assert.ok(item);
    assert.equal(item.kind, "self_evolution_gap");
    assert.equal(item.action_kind, "draft_sop");
    assert.equal(item.self_evolution_gap?.source, "operator_correction");
    assert.equal(item.next_step.includes("review tick"), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps derive SOP candidates from verified iteration outcomes until drafted", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const recorded = await recordSelfEvolutionIteration(store, {
      summary: "Persist verified outcomes through the SOP candidate gate.",
      layer: "local_learning",
      ownerSurface: "sop_skill_memory_loop",
      proposedSlice: "verified_iteration_outcome_sop_candidate",
      sourceRef: "memory/dreams/dream_iteration.json",
      evidenceRefs: ["packages/core/src/self_evolution_iterations.ts"],
      verificationCommands: ["pnpm run check"],
      nonGoals: ["no active-vault write"]
    });
    await recordSelfEvolutionIterationOutcome(store, {
      iterationRef: recorded.iteration.id,
      status: "verified",
      summary: "Verified outcome should be reusable through SOP candidate review.",
      evidenceRefs: ["tests/self_evolution_gaps.test.ts"],
      verificationCommands: ["pnpm exec tsx --test tests/self_evolution_gaps.test.ts"],
      nextMoves: ["Materialize a state-only SOP candidate through review tick."]
    });

    const result = await listSelfEvolutionGaps(store, { limit: 20 });
    const gap = result.gaps.find((item) => item.source === "iteration_outcome");
    assert.ok(gap);
    assert.equal(gap.source_ref, recorded.iteration.ref);
    assert.equal(gap.owner_surface, "sop_skill_memory_loop");
    assert.equal(gap.proposed_slice, "verified_iteration_outcome_sop_candidate");
    assert.equal(gap.follow_up_kind, "sop_candidate");
    assert.equal(gap.evidence_refs.includes(recorded.iteration.ref), true);
    assert.equal(gap.evidence_refs.includes("tests/self_evolution_gaps.test.ts"), true);
    assert.equal(gap.acceptance.some((item) => item.includes("SOP-candidate")), true);
    assert.equal(gap.non_goals.some((item) => item.includes("active-vault")), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === gap.id);
    assert.ok(item);
    assert.equal(item.action_kind, "draft_sop");
    assert.equal(item.self_evolution_gap?.source, "iteration_outcome");
    assert.equal(item.self_evolution_gap?.verification_commands.some((command) => command.includes("review tick")), true);

    await store.writeJson("sop/drafts/sop_iteration_outcome.json", {
      id: "sop_iteration_outcome",
      title: "Verified iteration outcome SOP candidate",
      trigger: "Use when a verified self-evolution outcome recurs.",
      procedure: ["Inspect the iteration and verify the reusable pattern."],
      required_tools: ["governance.iterations"],
      verification: "The SOP cites the verified iteration evidence.",
      failure_modes: ["Leave unpromoted if the iteration evidence is stale."],
      evidence_refs: [recorded.iteration.ref],
      revision: 1,
      status: "draft"
    });
    const suppressed = await listSelfEvolutionGaps(store, { limit: 20 });
    assert.equal(suppressed.gaps.some((item) => item.id === gap.id), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps suppress general delegation scorecard work after delegate_agent exists", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);

    const beforeDream = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(beforeDream.gaps.some((gap) => gap.source === "scorecard"), false);

    await writeActiveDreamSnapshot(store);
    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    const gap = result.gaps.find((item) => item.id === "gap_scorecard_general_agent_delegation_contract");
    assert.equal(gap, undefined);

    await assert.rejects(
      () => getSelfEvolutionGap(store, { gapRef: "gap_scorecard_general_agent_delegation_contract" }),
      /Self-evolution gap not found/
    );

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    assert.equal(
      backlog.items.some((entry) => entry.id === "gap_scorecard_general_agent_delegation_contract"),
      false
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps appear in opportunity backlog and support decisions", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await createLiveSourceContentRun(store);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.kind === "self_evolution_gap");
    assert.ok(item);
    assert.equal(item.id, `gap_external_publish_evidence_${run.id}`);
    assert.equal(item.status, "active");
    assert.equal(item.source_ref, run.refs.run_ref);
    assert.equal(item.self_evolution_gap?.proposed_slice, "external_publish_preflight_contract");
    assert.equal(item.self_evolution_gap?.evidence_ref_count, 3);
    assert.equal(item.decision_command?.includes("governance decide-opportunity"), true);
    assert.equal(item.action_chain?.some((step) => step.label === "inspect" && step.effect === "read_only"), true);

    const decision = await decideOpportunity(store, {
      opportunity: item.id,
      status: "deferred",
      reason: "wait for external publish adapter implementation"
    });
    assert.equal(decision.previous_status, "active");
    assert.equal(decision.status, "deferred");
    assert.equal(decision.decision.opportunity_kind, "self_evolution_gap");

    const deferredBacklog = await getOpportunityBacklog(store, { limit: 20 });
    const deferred = deferredBacklog.items.find((entry) => entry.id === item.id);
    assert.ok(deferred);
    assert.equal(deferred.status, "deferred");
    assert.equal(deferred.summary.includes("wait for external publish adapter implementation"), true);

    const deferredGaps = await listSelfEvolutionGaps(store, { limit: 20 });
    const deferredGap = deferredGaps.gaps.find((entry) => entry.id === item.id);
    assert.ok(deferredGap);
    assert.equal(deferredGap.status, "active");
    assert.equal(deferredGap.effective_status, "deferred");
    assert.equal(deferredGap.opportunity_decision?.status, "deferred");
    assert.equal(deferredGap.opportunity_decision?.reason, "wait for external publish adapter implementation");
    assert.deepEqual(deferredGaps.by_effective_status, { deferred: 1 });

    await decideOpportunity(store, {
      opportunity: item.id,
      status: "completed",
      reason: "implemented external publish adapter preflight contract"
    });

    const completedBacklog = await getOpportunityBacklog(store, { limit: 20 });
    assert.equal(completedBacklog.items.some((entry) => entry.id === item.id), false);

    const completedGaps = await listSelfEvolutionGaps(store, { limit: 20 });
    const completedGap = completedGaps.gaps.find((entry) => entry.id === item.id);
    assert.ok(completedGap);
    assert.equal(completedGap.status, "active");
    assert.equal(completedGap.effective_status, "completed");
    assert.equal(completedGap.opportunity_decision?.status, "completed");
    assert.equal(completedGap.opportunity_decision?.previous_status, "deferred");
    assert.equal(completedGaps.by_effective_status.completed, 1);

    const completedDetail = await getSelfEvolutionGap(store, { gapRef: item.id });
    assert.equal(completedDetail.gap.effective_status, "completed");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps derive feedback refresh route reviews from service status", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    await store.writeJson("services/runtime/content_feedback_refresh.json", {
      service: "content_feedback_refresh",
      enabled: true,
      state: "skipped",
      updated_at: "2026-07-02T08:00:00.000Z",
      last_finished_at: "2026-07-02T08:00:00.000Z",
      last_queue_count: 4,
      last_due_count: 4,
      last_skipped_count: 4,
      last_top_skip_reason: "non_mcp_capture_route",
      last_skip_reason_counts: {
        non_mcp_capture_route: 4
      },
      last_skipped_item_refs: ["content/runs/content_run_skipped/run.json"],
      last_deferred_item_refs: ["content/runs/content_run_feedback/run.json"],
      last_strategy_suggestion_count: 4,
      last_strategy_collect_more_feedback_count: 2,
      last_strategy_top_posture: "collect_more_feedback",
      last_strategy_top_run_ref: "content/runs/content_run_feedback/run.json",
      last_strategy_item_refs: ["content/runs/content_run_feedback/run.json"],
      next_due_run_id: "content_run_feedback",
      next_due_run_ref: "content/runs/content_run_feedback/run.json"
    });

    const result = await listSelfEvolutionGaps(store, { limit: 20 });
    const gap = result.gaps.find((item) => item.proposed_slice === "feedback_refresh_route_review");
    assert.ok(gap);
    assert.equal(gap.source, "service_status");
    assert.equal(gap.source_ref, "services/runtime/content_feedback_refresh.json");
    assert.equal(gap.follow_up_kind, "act_next");
    assert.equal(gap.observed_problem.includes("non_mcp_capture_route"), true);
    assert.equal(gap.evidence_refs.includes("services/runtime/content_feedback_refresh.json"), true);
    assert.equal(gap.evidence_refs.includes("content/runs/content_run_skipped/run.json"), true);
    assert.equal(gap.acceptance.some((item) => item.includes("route review suppresses")), true);
    assert.equal(gap.non_goals.some((item) => item.includes("no Xiaohongshu MCP feedback capture")), true);
    assert.equal(gap.verification_commands.some((item) => item.includes("governance act-next")), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === gap.id);
    assert.ok(item);
    assert.equal(item.action_kind, "act_next");
    assert.equal(item.self_evolution_gap?.source, "service_status");
    assert.equal(item.self_evolution_gap?.proposed_slice, "feedback_refresh_route_review");
    assert.equal(item.action_chain?.some((step) =>
      step.label === "act_next"
      && step.command.includes("governance act-next")
    ), true);

    await store.writeJson("content/feedback-refresh-route-reviews/route_review_ready.json", {
      schema_version: 1,
      kind: "content_feedback_refresh_route_review",
      service_ref: "services/runtime/content_feedback_refresh.json",
      status_updated_at: "2026-07-02T08:00:00.000Z",
      top_skip_reason: "non_mcp_capture_route",
      created_at: "2026-07-02T08:05:00.000Z"
    });

    const reviewed = await listSelfEvolutionGaps(store, { limit: 20 });
    assert.equal(reviewed.gaps.some((item) => item.id === gap.id), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps derive weak daily source quality gaps from content runs", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/down-a.json", "https://example.com/down-b.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => ({
        url,
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        contentType: "text/plain",
        text: "temporary outage"
      })
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    const gap = result.gaps.find((item) => item.id === `gap_active_exploration_source_quality_${run.id}`);
    assert.ok(gap);
    assert.equal(gap.title, "Daily active exploration source quality is weak");
    assert.equal(gap.proposed_slice, "active_exploration_source_quality_gate");
    assert.equal(gap.observed_problem.includes("bounded source fetches failed"), true);
    assert.equal(gap.evidence_refs.includes(run.refs.source_evidence_ref as string), true);
    assert.equal(gap.acceptance.some((item) => item.includes("source collection records per-source quality")), true);
    assert.equal(gap.non_goals.some((item) => item.includes("automatic publication block")), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === gap.id);
    assert.ok(item);
    assert.equal(item.kind, "self_evolution_gap");
    assert.equal(item.self_evolution_gap?.proposed_slice, "active_exploration_source_quality_gate");
    assert.equal(item.source_ref, run.refs.run_ref);
    assert.equal(item.action_kind, "act_next");
    assert.equal(item.budget_hint.side_effect_level, "local_write");
    assert.equal(item.action_chain?.some((step) =>
      step.label === "act_next"
      && step.effect === "runtime_execution"
      && step.command.includes("governance act-next")
    ), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps derive stale daily source freshness gaps from content runs", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/stale-ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: oldIso(160),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            hits: [{ title: "Old AI chip funding story", created_at: oldIso(120) }]
          })
        };
      }
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    const gap = result.gaps.find((item) => item.id === `gap_active_exploration_source_quality_${run.id}`);
    assert.ok(gap);
    assert.equal(gap.observed_problem.includes("no AI news source has fresh published_at evidence"), true);
    assert.equal(gap.observed_problem.includes("no market quote has fresh timestamp evidence"), true);
    assert.equal(gap.acceptance.some((item) => item.includes("freshness metadata")), true);
    assert.equal(gap.acceptance.some((item) => item.includes("publish preflight requires fresh")), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps ignore non-critical stale sources when fresh coverage exists", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/fresh-ai.json", "https://example.com/stale-ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: recentIso(1),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        const isStale = url.includes("stale-ai");
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            hits: [
              {
                title: isStale ? "Old AI chip supply chain story" : "Fresh AI agent launch story",
                created_at: isStale ? oldIso(120) : recentIso(2)
              }
            ]
          })
        };
      }
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.gaps.some((item) => item.id === `gap_active_exploration_source_quality_${run.id}`), false);
    assert.equal(result.gaps.some((item) => item.id === `gap_external_publish_evidence_${run.id}`), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps suppress older source-quality gaps after later strong source evidence", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const weak = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/down-a.json", "https://example.com/down-b.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => ({
        url,
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        contentType: "text/plain",
        text: "temporary outage"
      })
    });
    await rewriteContentRunTime(store, weak, "2026-07-01T09:00:00Z");

    const strong = await createLiveSourceContentRun(store);
    await rewriteContentRunTime(store, strong, "2026-07-01T09:10:00Z");

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.gaps.some((item) => item.id === `gap_active_exploration_source_quality_${weak.id}`), false);
    assert.equal(result.gaps.some((item) => item.id === `gap_active_exploration_source_quality_${strong.id}`), false);
    assert.equal(result.gaps.some((item) => item.source_ref === strong.refs.run_ref), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    assert.equal(backlog.items.some((item) => item.id === `gap_active_exploration_source_quality_${weak.id}`), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps keep older source-quality gaps when the later equivalent run is still weak", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const olderWeak = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/down-a.json", "https://example.com/down-b.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => ({
        url,
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        contentType: "text/plain",
        text: "temporary outage"
      })
    });
    await rewriteContentRunTime(store, olderWeak, "2026-07-01T09:00:00Z");

    const laterWeak = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/stale-ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: oldIso(160),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            hits: [{ title: "Old AI chip funding story", created_at: oldIso(120) }]
          })
        };
      }
    });
    await rewriteContentRunTime(store, laterWeak, "2026-07-01T09:10:00Z");

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.gaps.some((item) => item.id === `gap_active_exploration_source_quality_${olderWeak.id}`), true);
    assert.equal(result.gaps.some((item) => item.id === `gap_active_exploration_source_quality_${laterWeak.id}`), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps keep older source-quality gaps when later strong run uses a different adapter", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const weak = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/down-a.json", "https://example.com/down-b.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => ({
        url,
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        contentType: "text/plain",
        text: "temporary outage"
      })
    });
    await rewriteContentRunTime(store, weak, "2026-07-01T09:00:00Z");

    const strong = await createLiveSourceContentRun(store);
    await store.writeJson(strong.refs.run_ref, {
      ...strong,
      publish_adapter: {
        ...strong.publish_adapter,
        kind: "agent-browser-cli"
      },
      created_at: "2026-07-01T09:10:00Z",
      updated_at: "2026-07-01T09:10:00Z"
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.gaps.some((item) => item.id === `gap_active_exploration_source_quality_${weak.id}`), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gap shifts from preflight to execution after preflight evidence exists", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await createLiveSourceContentRun(store);
    const imagePath = join(root.stateRoot, "cover.png");
    await writeFile(imagePath, "fake image bytes", "utf8");
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: imagePath
    });
    const preflight = await recordContentPublishPreflight(store, {
      runRef: run.id,
      loginStatus: "logged_in",
      adapterAvailable: true
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.count, 1);
    const gap = result.gaps[0];
    assert.equal(gap.proposed_slice, "external_publish_execution_contract");
    assert.equal(gap.observed_problem.includes("confirmed external-write execution result"), true);
    assert.equal(gap.evidence_refs.includes(preflight.evidence_ref), true);
    assert.equal(gap.acceptance.some((item) => item.includes("external_write")), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.kind === "self_evolution_gap");
    assert.ok(item);
    assert.equal(item.self_evolution_gap?.proposed_slice, "external_publish_execution_contract");
    assert.equal(item.self_evolution_gap?.evidence_ref_count, 4);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps shift from publish completion to post-publish feedback", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await createLiveSourceContentRun(store);
    const imagePath = join(root.stateRoot, "cover.png");
    await writeFile(imagePath, "fake image bytes", "utf8");

    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: imagePath
    });
    const publishEvidence = await recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-post-1"
    });

    const afterPublish = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(afterPublish.gaps.some((gap) => gap.id === `gap_external_publish_evidence_${run.id}`), false);
    const missingFeedbackGap = afterPublish.gaps.find((gap) => gap.id === `gap_post_publish_feedback_missing_${run.id}`);
    assert.ok(missingFeedbackGap);
    assert.equal(missingFeedbackGap.proposed_slice, "post_publish_feedback_capture_contract");
    assert.equal(missingFeedbackGap.evidence_refs.includes(publishEvidence.evidence_ref), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === missingFeedbackGap.id);
    assert.ok(item);
    assert.equal(item.action_kind, "act_next");
    assert.equal(item.budget_hint.side_effect_level, "local_write");
    assert.deepEqual(item.action_chain?.map((step) => `${step.label}:${step.effect}`), [
      "inspect:read_only",
      "act_next:runtime_execution",
      "verify_gap:read_only",
      "record_decision:state_decision"
    ]);
    assert.match(item.action_chain?.find((step) => step.label === "act_next")?.command ?? "", /governance act-next/);
    assert.match(item.action_chain?.find((step) => step.label === "act_next")?.command ?? "", /--server-url http:\/\/localhost:18060\/mcp/);
    assert.equal(item.action_chain?.some((step) =>
      step.label === "verify_gap"
      && step.command.includes("content feedback-review")
    ), true);
    assert.equal(item.action_chain?.some((step) =>
      step.label === "verify_gap"
      && step.command.includes("content feedback-evidence")
    ), false);

    await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      viewCount: 100,
      likeCount: 8,
      commentCount: 1,
      collectCount: 2
    });

    const afterFeedback = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(afterFeedback.gaps.some((gap) => gap.source_ref === run.refs.run_ref), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps derive weak post-publish feedback review work", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await createLiveSourceContentRun(store);
    await writeFakeImage(run);
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: run.image_request.output_path
    });
    const publish = await recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/weak-feedback"
    });
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "operator-screenshot:weak-feedback.png"
    });
    await store.writeJson(feedback.evidence_ref, {
      ...feedback.evidence,
      created_at: "2000-01-01T00:00:00Z"
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    const gap = result.gaps.find((item) => item.id === `gap_post_publish_feedback_weak_${run.id}`);
    assert.ok(gap);
    assert.equal(gap.title, "Post-publish feedback is too weak to learn from");
    assert.equal(gap.proposed_slice, "post_publish_feedback_review_loop");
    assert.equal(gap.follow_up_kind, "sop_candidate");
    assert.equal(gap.observed_problem.includes("views=1, engagement=0"), true);
    assert.equal(gap.evidence_refs.includes(publish.evidence_ref), true);
    assert.equal(gap.evidence_refs.includes(feedback.evidence_ref), true);
    assert.equal(gap.acceptance.some((item) => item.includes("feedback-review ranks")), true);
    assert.equal(gap.acceptance.some((item) => item.includes("feedback-strategy uses typed feedback refs")), true);
    assert.equal(gap.verification_commands.some((item) => item.includes("content feedback-strategy")), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === gap.id);
    assert.ok(item);
    assert.equal(item.kind, "self_evolution_gap");
    assert.equal(item.action_kind, "draft_sop");
    assert.equal(item.self_evolution_gap?.follow_up_kind, "sop_candidate");
    assert.equal(item.self_evolution_gap?.proposed_slice, "post_publish_feedback_review_loop");
    assert.equal(item.self_evolution_gap?.evidence_ref_count, 3);
    assert.equal(item.next_step.includes("review tick"), true);
    assert.equal(item.action_chain?.some((step) =>
      step.label === "review_tick"
      && step.effect === "local_write"
      && step.command.includes("review tick")
    ), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps expose ready feedback strategy until a later run applies it", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const source = await createLiveSourceContentRun(store, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await writeFakeImage(source);
    await recordContentImageEvidence(store, {
      runRef: source.id,
      outputPath: source.image_request.output_path
    });
    const publish = await recordContentPublishEvidence(store, {
      runRef: source.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/ready-strategy"
    });
    const firstFeedback = await recordContentFeedbackEvidence(store, {
      runRef: source.id,
      viewCount: 20,
      likeCount: 2,
      commentCount: 1,
      collectCount: 1,
      shareCount: 0,
      followCount: 0,
      sourceRef: "operator-screenshot:ready-strategy-first.png"
    });
    await store.writeJson(firstFeedback.evidence_ref, {
      ...firstFeedback.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });
    const secondFeedback = await recordContentFeedbackEvidence(store, {
      runRef: source.id,
      viewCount: 48,
      likeCount: 8,
      commentCount: 3,
      collectCount: 5,
      shareCount: 1,
      followCount: 1,
      sourceRef: "operator-screenshot:ready-strategy-second.png"
    });
    await store.writeJson(secondFeedback.evidence_ref, {
      ...secondFeedback.evidence,
      created_at: "2026-07-01T12:00:00Z"
    });

    const result = await listSelfEvolutionGaps(store, { limit: 20 });
    const gap = result.gaps.find((item) => item.id === `gap_feedback_strategy_next_generation_${source.id}`);
    assert.ok(gap);
    assert.equal(gap.title, "Feedback strategy is ready for next generation");
    assert.equal(gap.proposed_slice, "feedback_strategy_next_generation_ready");
    assert.equal(gap.follow_up_kind, "act_next");
    assert.equal(gap.observed_problem.includes("reuse_baseline"), true);
    assert.equal(gap.evidence_refs.includes(publish.evidence_ref), true);
    assert.equal(gap.evidence_refs.includes(secondFeedback.evidence_ref), true);
    assert.equal(gap.acceptance.some((item) => item.includes("strategy.source_run_id")), true);
    assert.equal(gap.verification_commands.some((item) =>
      item.includes("content daily --dry-run --track ai_applications")
      && item.includes(`--strategy-from ${source.id}`)
    ), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === gap.id);
    assert.ok(item);
    assert.equal(item.action_kind, "act_next");
    assert.equal(item.self_evolution_gap?.follow_up_kind, "act_next");
    assert.equal(item.action_chain?.some((step) =>
      step.label === "act_next"
      && step.command.includes("governance act-next")
    ), true);

    const next = await runContentDryRun(store, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches",
      strategyFromRunRef: source.id
    });
    assert.equal(next.strategy?.source_run_id, source.id);
    assert.equal(next.strategy?.applied, true);

    const after = await listSelfEvolutionGaps(store, { limit: 20 });
    assert.equal(after.gaps.some((item) => item.id === gap.id), false);
    const previewGap = after.gaps.find((item) =>
      item.id === `gap_feedback_strategy_preview_review_${next.id}`
    );
    assert.ok(previewGap);
    assert.equal(previewGap.proposed_slice, "feedback_strategy_preview_review");
    assert.equal(previewGap.follow_up_kind, "act_next");
    assert.equal(previewGap.evidence_refs.includes(next.refs.run_ref), true);
    assert.equal(previewGap.evidence_refs.includes(source.refs.run_ref), true);
    assert.equal(previewGap.acceptance.some((item) => item.includes("preview review artifact")), true);
    assert.equal(previewGap.non_goals.some((item) => item.includes("no full draft-body exposure")), true);
    assert.equal(previewGap.verification_commands.some((item) =>
      item.includes("governance act-next")
      && item.includes(previewGap.id)
    ), true);

    const previewBacklog = await getOpportunityBacklog(store, { limit: 20 });
    const previewItem = previewBacklog.items.find((entry) => entry.id === previewGap.id);
    assert.ok(previewItem);
    assert.equal(previewItem.action_kind, "act_next");
    assert.equal(previewItem.self_evolution_gap?.proposed_slice, "feedback_strategy_preview_review");

    await store.writeJson("content/strategy-reviews/strategy_review_ready.json", {
      schema_version: 1,
      kind: "content_strategy_preview_review",
      generated_run_id: next.id,
      generated_run_ref: next.refs.run_ref,
      source_run_id: source.id,
      source_run_ref: source.refs.run_ref,
      created_at: "2026-07-01T13:00:00Z"
    });

    const reviewed = await listSelfEvolutionGaps(store, { limit: 20 });
    assert.equal(reviewed.gaps.some((item) => item.id === previewGap.id), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution feedback gaps wait for a stable feedback window", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await createLiveSourceContentRun(store);
    await writeFakeImage(run);
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: run.image_request.output_path
    });
    const publish = await recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/early-feedback"
    });
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "operator-screenshot:early-feedback.png"
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    const waiting = result.gaps.find((item) => item.id === `gap_post_publish_feedback_waiting_${run.id}`);
    assert.ok(waiting);
    assert.equal(waiting.status, "waiting");
    assert.equal(waiting.title, "Post-publish feedback is still maturing");
    assert.equal(waiting.proposed_slice, "post_publish_feedback_stable_window");
    assert.equal(waiting.follow_up_kind, "waiting");
    assert.equal(waiting.observed_problem.includes("should not drive strategy until"), true);
    assert.equal(waiting.not_before_at !== undefined, true);
    assert.equal(waiting.evidence_refs.includes(publish.evidence_ref), true);
    assert.equal(waiting.evidence_refs.includes(feedback.evidence_ref), true);
    assert.equal(result.gaps.some((item) => item.id === `gap_post_publish_feedback_weak_${run.id}`), false);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === waiting.id);
    assert.ok(item);
    assert.equal(item.status, "waiting");
    assert.equal(item.score < 100, true);
    assert.equal(item.next_step.includes("Wait until"), true);
    assert.equal(item.self_evolution_gap?.not_before_at, waiting.not_before_at);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps surface missing creator metrics before the stable window", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await createLiveSourceContentRun(store);
    await writeFakeImage(run);
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: run.image_request.output_path
    });
    await recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/missing-view-feedback"
    });
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "xiaohongshu-mcp",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#missing-view-feedback"
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    const gap = result.gaps.find((item) => item.id === `gap_creator_metrics_incomplete_${run.id}`);
    assert.ok(gap);
    assert.equal(gap.status, "active");
    assert.equal(gap.title, "Creator metrics are missing from feedback");
    assert.equal(gap.proposed_slice, "creator_metrics_capture_readiness_loop");
    assert.equal(gap.follow_up_kind, "act_next");
    assert.equal(gap.observed_problem.includes("view_count=unknown"), true);
    assert.equal(gap.observed_problem.includes("Missing creator metrics: view_count"), true);
    assert.equal(gap.observed_problem.includes("follow_count"), false);
    assert.equal(gap.evidence_refs.includes(feedback.evidence_ref), true);
    assert.equal(gap.acceptance.some((item) => item.includes("creator-metrics-needed lists published posts")), true);
    assert.equal(gap.acceptance.some((item) => item.includes("without waiting for the feedback stable window")), true);
    assert.equal(gap.verification_commands.some((item) => item.includes("content creator-metrics-needed")), true);
    assert.equal(gap.verification_commands.some((item) => item.includes("content channel-readiness")), true);
    assert.equal(gap.verification_commands.some((item) => item.includes("content creator-metrics-capture")), true);
    assert.equal(result.gaps.some((item) => item.id === `gap_post_publish_feedback_waiting_${run.id}`), false);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === gap.id);
    assert.ok(item);
    assert.equal(item.status, "active");
    assert.equal(item.action_kind, "act_next");
    assert.equal(item.budget_hint.side_effect_level, "local_write");
    assert.equal(item.self_evolution_gap?.proposed_slice, "creator_metrics_capture_readiness_loop");
    assert.equal(item.next_step.includes("governance act-next"), true);
    assert.equal(item.action_chain?.some((step) =>
      step.label === "act_next"
      && step.effect === "runtime_execution"
      && step.command.includes("--browser-auto-connect")
      && step.command.includes("--browser-session-name runtime-creator-metrics")
    ), true);
    assert.equal(item.action_chain?.some((step) =>
      step.label === "verify_gap"
      && step.effect === "read_only"
      && step.command.includes("content creator-metrics-needed")
    ), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps route Xiaohongshu MCP feedback timeouts to creator metrics fallback", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await createLiveSourceContentRun(store);
    await writeFakeImage(run);
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: run.image_request.output_path
    });
    await recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "timeout-feedback",
      postUrl: "https://www.xiaohongshu.com/explore/timeout-feedback"
    });
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      status: "failed",
      capturedBy: "xiaohongshu-mcp",
      postId: "timeout-feedback",
      postUrl: "https://www.xiaohongshu.com/explore/timeout-feedback",
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#timeout-feedback",
      error: "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms"
    });

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    const gap = result.gaps.find((item) => item.id === `gap_post_publish_feedback_failed_${run.id}`);
    assert.ok(gap);
    assert.equal(gap.title, "Post-publish feedback needs creator metrics fallback");
    assert.equal(gap.proposed_slice, "creator_metrics_capture_readiness_loop");
    assert.equal(gap.observed_problem.includes("creator-backend metrics"), true);
    assert.equal(gap.evidence_refs.includes(feedback.evidence_ref), true);
    assert.equal(gap.acceptance.some((item) => item.includes("instead of retrying the same timed-out feed")), true);
    assert.equal(gap.verification_commands.some((item) => item.includes("content creator-metrics-needed")), true);
    assert.equal(gap.verification_commands.some((item) => item.includes("content creator-metrics-capture")), true);

    const backlog = await getOpportunityBacklog(store, { limit: 20 });
    const item = backlog.items.find((entry) => entry.id === gap.id);
    assert.ok(item);
    assert.equal(item.action_kind, "act_next");
    assert.equal(item.self_evolution_gap?.proposed_slice, "creator_metrics_capture_readiness_loop");
    assert.equal(item.action_chain?.some((step) =>
      step.label === "act_next"
      && step.command.includes("--browser-auto-connect")
      && step.command.includes("--browser-session-name runtime-creator-metrics")
    ), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps suppress older equivalent publish gaps after later proof", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const missingPreflight = await createLiveSourceContentRun(store);
    await rewriteContentRunTime(store, missingPreflight, "2026-07-01T09:00:00Z");

    const missingExecution = await createLiveSourceContentRun(store);
    await writeFakeImage(missingExecution);
    await recordContentImageEvidence(store, {
      runRef: missingExecution.id,
      outputPath: missingExecution.image_request.output_path
    });
    const preflight = await recordContentPublishPreflight(store, {
      runRef: missingExecution.id,
      loginStatus: "logged_in",
      adapterAvailable: true
    });
    await rewriteContentRunTime(store, preflight.run, "2026-07-01T09:05:00Z");

    const published = await createLiveSourceContentRun(store);
    await writeFakeImage(published);
    await recordContentImageEvidence(store, {
      runRef: published.id,
      outputPath: published.image_request.output_path
    });
    const publishEvidence = await recordContentPublishEvidence(store, {
      runRef: published.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-post-later"
    });
    await rewriteContentRunTime(store, publishEvidence.run, "2026-07-01T09:10:00Z");

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.gaps.some((gap) => gap.id === `gap_external_publish_evidence_${missingPreflight.id}`), false);
    assert.equal(result.gaps.some((gap) => gap.id === `gap_external_publish_evidence_${missingExecution.id}`), false);
    assert.equal(result.gaps.some((gap) => gap.id === `gap_external_publish_evidence_${published.id}`), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps suppress untracked daily publish gaps after tracked proof", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const untracked = await createLiveSourceContentRun(store, {
      workflowId: "daily_ai_market_xhs",
      topic: "daily AI news and AI stock hotspots"
    });
    await rewriteContentRunTime(store, untracked, "2026-07-01T09:00:00Z");

    const tracked = await createLiveSourceContentRun(store, {
      workflowId: "daily_ai_compute_market_xhs",
      topic: "daily frontier AI compute infrastructure and semiconductor stock hotspots"
    });
    await writeFakeImage(tracked);
    await recordContentImageEvidence(store, {
      runRef: tracked.id,
      outputPath: tracked.image_request.output_path
    });
    const preflight = await recordContentPublishPreflight(store, {
      runRef: tracked.id,
      loginStatus: "logged_in",
      adapterAvailable: true
    });
    await rewriteContentRunTime(store, preflight.run, "2026-07-01T09:10:00Z");

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.gaps.some((gap) => gap.source_ref === untracked.refs.run_ref), false);
    const trackedGap = result.gaps.find((gap) => gap.source_ref === tracked.refs.run_ref);
    assert.ok(trackedGap);
    assert.equal(trackedGap.proposed_slice, "external_publish_execution_contract");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps suppress same-day duplicate publish execution gaps after published proof", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const published = await createLiveSourceContentRun(store, {
      workflowId: "daily_ai_market_xhs",
      topic: "daily AI news and AI stock hotspots"
    });
    await writeFakeImage(published);
    await recordContentImageEvidence(store, {
      runRef: published.id,
      outputPath: published.image_request.output_path
    });
    const publishEvidence = await recordContentPublishEvidence(store, {
      runRef: published.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-post-existing"
    });
    await rewriteContentRunTime(store, publishEvidence.run, "2026-07-01T09:00:00Z");

    const duplicatePreflight = await createLiveSourceContentRun(store, {
      workflowId: "daily_ai_compute_market_xhs",
      topic: "daily frontier AI compute infrastructure and semiconductor stock hotspots"
    });
    await writeFakeImage(duplicatePreflight);
    await recordContentImageEvidence(store, {
      runRef: duplicatePreflight.id,
      outputPath: duplicatePreflight.image_request.output_path
    });
    const preflight = await recordContentPublishPreflight(store, {
      runRef: duplicatePreflight.id,
      loginStatus: "logged_in",
      adapterAvailable: true
    });
    await rewriteContentRunTime(store, preflight.run, "2026-07-01T09:10:00Z");

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(result.gaps.some((gap) => gap.id === `gap_external_publish_evidence_${published.id}`), false);
    assert.equal(result.gaps.some((gap) => gap.id === `gap_external_publish_evidence_${duplicatePreflight.id}`), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("self-evolution gaps keep next-day publish execution gaps despite prior daily proof", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const published = await createLiveSourceContentRun(store);
    await writeFakeImage(published);
    await recordContentImageEvidence(store, {
      runRef: published.id,
      outputPath: published.image_request.output_path
    });
    const publishEvidence = await recordContentPublishEvidence(store, {
      runRef: published.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-post-prior-day"
    });
    await rewriteContentRunTime(store, publishEvidence.run, "2026-07-01T09:00:00Z");

    const nextDay = await createLiveSourceContentRun(store);
    await writeFakeImage(nextDay);
    await recordContentImageEvidence(store, {
      runRef: nextDay.id,
      outputPath: nextDay.image_request.output_path
    });
    const preflight = await recordContentPublishPreflight(store, {
      runRef: nextDay.id,
      loginStatus: "logged_in",
      adapterAvailable: true
    });
    await rewriteContentRunTime(store, preflight.run, "2026-07-02T09:00:00Z");

    const result = await listSelfEvolutionGaps(store, { limit: 10 });
    const gap = result.gaps.find((item) => item.source_ref === nextDay.refs.run_ref);
    assert.ok(gap);
    assert.equal(gap.proposed_slice, "external_publish_execution_contract");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance gaps CLI args parse gap details", () => {
  const options = parseArgs([
    "governance",
    "gaps",
    "--gap",
    "gap_external_publish_evidence_content_run_1",
    "--limit",
    "5"
  ]);

  assert.equal(options.command, "governance");
  assert.equal(options.governanceAction, "gaps");
  assert.equal(options.gapRef, "gap_external_publish_evidence_content_run_1");
  assert.equal(options.limit, 5);
});

async function createLiveSourceContentRun(store: AgentStore, args: { workflowId?: string; topic?: string } = {}) {
  return runContentDryRun(store, {
    workflowId: args.workflowId,
    topic: args.topic ?? "daily AI news and semiconductor stock hotspots",
    sourceUrls: ["https://example.com/ai.json"],
    tickers: ["NVDA"],
    liveSources: true,
    fetchText: async (url) => {
      if (url.includes("api.nasdaq.com")) {
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            data: {
              symbol: "NVDA",
              companyName: "NVIDIA Corporation Common Stock",
              primaryData: {
                lastSalePrice: "$101.00",
                netChange: "+1.00",
                percentageChange: "+1.00%",
                lastTradeTimestamp: recentIso(1),
                volume: "12,345"
              },
              marketStatus: "Closed"
            }
          })
        };
      }
      return {
        url,
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "application/json",
        text: JSON.stringify({
          hits: [
            { title: "Frontier model reaches new coding benchmark", created_at: recentIso(2) },
            { title: "AI chip supply chain remains market focus", created_at: recentIso(3) }
          ]
        })
      };
    }
  });
}

function recentIso(hoursAgo = 2): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function oldIso(hoursAgo: number): string {
  return recentIso(hoursAgo);
}

async function writeFakeImage(run: ContentRun): Promise<void> {
  await mkdir(dirname(run.image_request.output_path), { recursive: true });
  await writeFile(run.image_request.output_path, "fake image bytes", "utf8");
}

async function rewriteContentRunTime(store: AgentStore, run: ContentRun, timestamp: string): Promise<void> {
  await store.writeJson(run.refs.run_ref, {
    ...run,
    created_at: timestamp,
    updated_at: timestamp
  });
}

async function writeActiveDreamSnapshot(store: AgentStore): Promise<void> {
  await store.writeJson("memory/dreams/dream_scorecard_gap.json", {
    schema_version: 1,
    id: "dream_scorecard_gap",
    action_type: "dream_snapshot",
    status: "active",
    title: "Core self-evolution long-horizon plan",
    summary: "Keep general-agent delegation as a planned core direction.",
    created_at: "2026-07-06T00:00:00Z",
    source_refs: ["packages/core/src/self_evolution_scorecard.ts"],
    semantic_memory_refs: [],
    backlog_refs: [],
    axes: [{
      id: "general_agent_delegation",
      title: "General agent delegation",
      status: "planned",
      summary: "Future delegation should keep subtask output bounded and verified by the main harness.",
      evidence_refs: ["packages/core/src/action_contracts.ts"],
      next_moves: ["Define delegate_agent contracts before adding expert personas."]
    }],
    horizons: [],
    non_goals: ["Do not treat dream snapshots as completion evidence."],
    boundary: "bounded dream context only"
  });
}

async function createFixture(): Promise<{ root: string; repoRoot: string; stateRoot: string }> {
  const root = await mkdir(join(tmpdir(), `local-runtime-gaps-${Date.now()}-${Math.random().toString(16).slice(2)}`), {
    recursive: true
  });
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return { root, repoRoot, stateRoot };
}
