import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../apps/cli/src/main.js";

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
    ".runtime-state"
  ]);

  assert.equal(options.command, "config");
  assert.equal(options.configDir, "config");
  assert.equal(options.stateRoot, ".runtime-state");
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
  const options = parseArgs(["capabilities", "--state-root", ".runtime-state"]);

  assert.equal(options.command, "capabilities");
  assert.equal(options.stateRoot, ".runtime-state");

  const acceptance = parseArgs(["capabilities", "acceptance"]);
  assert.equal(acceptance.command, "capabilities");
  assert.equal(acceptance.capabilitiesAction, "acceptance");

  const auditAlias = parseArgs(["capabilities", "audit"]);
  assert.equal(auditAlias.capabilitiesAction, "acceptance");
});

test("workspace status command parses read-only git diagnostic options", () => {
  const options = parseArgs([
    "workspace",
    "status",
    "--repo-root",
    "/repo/local-runtime",
    "--state-root",
    ".runtime-state",
    "--limit",
    "8"
  ]);

  assert.equal(options.command, "workspace");
  assert.equal(options.workspaceAction, "status");
  assert.equal(options.repoRoot, "/repo/local-runtime");
  assert.equal(options.stateRoot, ".runtime-state");
  assert.equal(options.limit, 8);

  const defaultAction = parseArgs(["workspace", "--state-root", ".runtime-state"]);
  assert.equal(defaultAction.command, "workspace");
  assert.equal(defaultAction.workspaceAction, undefined);
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
    ".runtime-state",
    "--runtime-build",
    "/home/user/.local-runtime/service/runtime/current/build.json",
    "--query-todo"
  ]);

  assert.equal(options.command, "im");
  assert.equal(options.imAction, "serve");
  assert.equal(options.scenarioId, "im-default");
  assert.equal(options.channelId, "feishu-main");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state",
    "--limit",
    "20"
  ]);

  assert.equal(options.command, "service");
  assert.equal(options.serviceAction, "start");
  assert.equal(options.serviceTarget, "im");
  assert.equal(options.scenarioId, "im-default");
  assert.equal(options.channelId, "feishu-main");
  assert.equal(options.stateRoot, ".runtime-state");
  assert.equal(options.limit, 20);

  const health = parseArgs([
    "service",
    "health",
    "--target",
    "im",
    "--state-root",
    ".runtime-state"
  ]);
  assert.equal(health.command, "service");
  assert.equal(health.serviceAction, "health");
  assert.equal(health.serviceTarget, "im");
  assert.equal(health.stateRoot, ".runtime-state");
});

test("pipeline runs command parses read-only history selection", () => {
  const options = parseArgs([
    "pipeline",
    "runs",
    "--pipeline",
    "pipeline_run_1",
    "--state-root",
    ".runtime-state",
    "--limit",
    "4"
  ]);

  assert.equal(options.command, "pipeline");
  assert.equal(options.pipelineAction, "runs");
  assert.equal(options.pipelineRef, "pipeline_run_1");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state",
    "--query-todo"
  ]);

  assert.equal(options.command, "pipeline");
  assert.equal(options.pipelineAction, "resume");
  assert.equal(options.pipelineRef, "pipeline_run_1");
  assert.equal(options.fromStage, "tool_check");
  assert.equal(options.stateRoot, ".runtime-state");
  assert.equal(options.discipline, "query_todo");
});

test("memory command parses search and session options", () => {
  const search = parseArgs([
    "memory",
    "search",
    "--query",
    "feishu service",
    "--state-root",
    ".runtime-state",
    "--limit",
    "5"
  ]);
  assert.equal(search.command, "memory");
  assert.equal(search.memoryAction, "search");
  assert.equal(search.query, "feishu service");
  assert.equal(search.stateRoot, ".runtime-state");
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

  const working = parseArgs([
    "memory",
    "working",
    "--checkpoint",
    "memory/working/current.json",
    "--state-root",
    ".runtime-state"
  ]);
  assert.equal(working.command, "memory");
  assert.equal(working.memoryAction, "working");
  assert.equal(working.workingCheckpointRef, "memory/working/current.json");
  assert.equal(working.stateRoot, ".runtime-state");

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
    ".runtime-state"
  ]);

  assert.equal(status.command, "governance");
  assert.equal(status.governanceAction, "status");
  assert.equal(status.limit, 4);
  assert.equal(status.stateRoot, ".runtime-state");

  const opportunities = parseArgs([
    "governance",
    "opportunities",
    "--limit",
    "3",
    "--state-root",
    ".runtime-state"
  ]);
  assert.equal(opportunities.command, "governance");
  assert.equal(opportunities.governanceAction, "opportunities");
  assert.equal(opportunities.limit, 3);
  assert.equal(opportunities.stateRoot, ".runtime-state");

  const evolution = parseArgs([
    "governance",
    "evolution",
    "--limit",
    "2",
    "--state-root",
    ".runtime-state"
  ]);
  assert.equal(evolution.command, "governance");
  assert.equal(evolution.governanceAction, "evolution");
  assert.equal(evolution.limit, 2);
  assert.equal(evolution.stateRoot, ".runtime-state");

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
    ".runtime-state"
  ]);
  assert.equal(decision.command, "governance");
  assert.equal(decision.governanceAction, "decide-opportunity");
  assert.equal(decision.opportunityRef, "opportunity_open_a");
  assert.equal(decision.opportunityStatus, "completed");
  assert.equal(decision.reason, "Handled in the current iteration.");
  assert.equal(decision.stateRoot, ".runtime-state");

  const resume = parseArgs([
    "governance",
    "resume-autonomy",
    "--reason",
    "Operator reviewed the pause signal.",
    "--state-root",
    ".runtime-state"
  ]);
  assert.equal(resume.command, "governance");
  assert.equal(resume.governanceAction, "resume-autonomy");
  assert.equal(resume.reason, "Operator reviewed the pause signal.");
  assert.equal(resume.stateRoot, ".runtime-state");

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
    ".runtime-state",
    "--limit",
    "4"
  ]);
  assert.equal(list.command, "context");
  assert.equal(list.contextAction, "list");
  assert.equal(list.stateRoot, ".runtime-state");
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
    ".runtime-state",
    "--limit",
    "3"
  ]);

  assert.equal(options.command, "context");
  assert.equal(options.contextAction, "pressure");
  assert.equal(options.stateRoot, ".runtime-state");
  assert.equal(options.limit, 3);
});

test("context usage command parses read-only usage diagnostics", () => {
  const options = parseArgs([
    "context",
    "usage",
    "--state-root",
    ".runtime-state",
    "--limit",
    "4"
  ]);

  assert.equal(options.command, "context");
  assert.equal(options.contextAction, "usage");
  assert.equal(options.stateRoot, ".runtime-state");
  assert.equal(options.limit, 4);
});

test("context health command parses read-only sidecar diagnostics", () => {
  const options = parseArgs([
    "context",
    "health",
    "--state-root",
    ".runtime-state",
    "--limit",
    "2",
    "--context",
    "memory/episodes/session_missing-context.json"
  ]);

  assert.equal(options.command, "context");
  assert.equal(options.contextAction, "health");
  assert.equal(options.stateRoot, ".runtime-state");
  assert.equal(options.limit, 2);
  assert.equal(options.contextRef, "memory/episodes/session_missing-context.json");
});

test("context repair command parses explicit manifest repair options", () => {
  const options = parseArgs([
    "context",
    "repair",
    "--state-root",
    ".runtime-state",
    "--context",
    "memory/episodes/session_orphan-context.md"
  ]);

  assert.equal(options.command, "context");
  assert.equal(options.contextAction, "repair");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state",
    "--limit",
    "7"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "background");
  assert.equal(options.query, "skill promotion");
  assert.equal(options.sessionId, "session_1");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state",
    "--limit",
    "9"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "tick");
  assert.equal(options.query, "self evolution");
  assert.equal(options.sessionId, "session_1");
  assert.equal(options.stateRoot, ".runtime-state");
  assert.equal(options.limit, 9);
});

test("review ticks command parses read-only tick history selection", () => {
  const options = parseArgs([
    "review",
    "ticks",
    "--tick",
    "review_tick_1",
    "--state-root",
    ".runtime-state",
    "--limit",
    "3"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "ticks");
  assert.equal(options.tickRef, "review_tick_1");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "confirmations");
  assert.equal(options.confirmationRef, "follow_up_confirmation_1");
  assert.equal(options.limit, 4);
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "reports");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "completions");
  assert.equal(options.completionRef, "completion_verification_1");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "traces");
  assert.equal(options.traceRef, "completion_verification_1");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime-state");
});

test("review replay-audit command parses selected live run trace", () => {
  const options = parseArgs([
    "review",
    "replay-audit",
    "--trace",
    "completion_verification_1",
    "--state-root",
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "replay-audit");
  assert.equal(options.traceRef, "completion_verification_1");
  assert.equal(options.stateRoot, ".runtime-state");
});

test("review replays command parses replay report selection", () => {
  const options = parseArgs([
    "review",
    "replays",
    "--replay",
    "harness_replay_1",
    "--state-root",
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "replays");
  assert.equal(options.replayRef, "harness_replay_1");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "outcomes");
  assert.equal(options.skillOutcomeRef, "skill_usage_1");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime-state");
});

test("skills catalog command parses read-only skill metadata selection", () => {
  const options = parseArgs([
    "skills",
    "--skill-name",
    "catalog-visible",
    "--limit",
    "3",
    "--state-root",
    ".runtime-state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, undefined);
  assert.equal(options.skillName, "catalog-visible");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "health");
  assert.equal(options.skillName, "registry-health");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "drifts");
  assert.equal(options.skillName, "repeat-drift");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "events");
  assert.equal(options.skillEventRef, "skill_event_1");
  assert.equal(options.skillName, "repeat-drift");
  assert.equal(options.limit, 3);
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "skills");
  assert.equal(options.action, "retire-event");
  assert.equal(options.skillEventRef, "skill_event_1");
  assert.equal(options.reason, "Historical renamed skill.");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "draft-sop");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.proposalId, "review_proposal_1");
  assert.equal(options.stateRoot, ".runtime-state");
});

test("review audit-sop command parses explicit SOP selection", () => {
  const options = parseArgs([
    "review",
    "audit-sop",
    "--sop",
    "sop_1",
    "--state-root",
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "audit-sop");
  assert.equal(options.sopRef, "sop_1");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "promote-sop");
  assert.equal(options.sopRef, "sop_1");
  assert.equal(options.auditRef, "audit_1");
  assert.equal(options.skillName, "review-runtime-failures");
  assert.equal(options.stateRoot, ".runtime-state");
});

test("review chain command parses explicit SOP selection", () => {
  const options = parseArgs([
    "review",
    "chain",
    "--sop",
    "sop_1",
    "--state-root",
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "chain");
  assert.equal(options.sopRef, "sop_1");
  assert.equal(options.stateRoot, ".runtime-state");
});

test("review coverage command parses explicit SOP selection", () => {
  const options = parseArgs([
    "review",
    "coverage",
    "--sop",
    "sop_1",
    "--state-root",
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "coverage");
  assert.equal(options.sopRef, "sop_1");
  assert.equal(options.stateRoot, ".runtime-state");
});

test("review rehearse-sop-loop command parses explicit local rehearsal", () => {
  const options = parseArgs([
    "review",
    "rehearse-sop-loop",
    "--state-root",
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "rehearse-sop-loop");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "plan-follow-up");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.proposalId, "review_proposal_1");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "execute-follow-up");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.proposalId, "review_proposal_1");
  assert.equal(options.followUpActionId, "follow_up_action_inspect_chain_1");
  assert.equal(options.stateRoot, ".runtime-state");
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
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "request-follow-up");
  assert.equal(options.reviewRef, "background_review_1");
  assert.equal(options.proposalId, "review_proposal_1");
  assert.equal(options.followUpActionId, "follow_up_action_promote_sop_1");
  assert.equal(options.stateRoot, ".runtime-state");
});

test("review execute-confirmed-follow-up command parses confirmation selection", () => {
  const options = parseArgs([
    "review",
    "execute-confirmed-follow-up",
    "--confirmation",
    "follow_up_confirmation_1",
    "--state-root",
    ".runtime-state"
  ]);

  assert.equal(options.command, "review");
  assert.equal(options.reviewAction, "execute-confirmed-follow-up");
  assert.equal(options.confirmationRef, "follow_up_confirmation_1");
  assert.equal(options.stateRoot, ".runtime-state");
});

test("provider-first Feishu CLI surface is not a first-version command", () => {
  assert.throws(() => parseArgs(["feishu", "serve"]), /Unknown argument: serve/);
});
