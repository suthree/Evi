import { basename } from "node:path";
import {
  delegateAgentCompletionGateCheckIds,
  delegateAgentDispatchFailureKindValues,
  delegateAgentResultFailureKindsFromDispatch,
  delegateAgentResultFailureKindValues
} from "./action_contracts.js";
import {
  DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND,
  evidenceEventSchema
} from "./schemas.js";
import {
  getLiveRunTrace,
  listLiveRunTraces,
  type LiveRunCompletionCheckSummary,
  type LiveRunDelegatedDispatchSummary,
  type LiveRunTraceSummary
} from "./live_run_trace.js";
import { newId, utcNow } from "./ids.js";
import { AgentStore } from "./store.js";

const REPLAY_ROOT = "governance/replays";
const DISPATCH_FAILURE_KINDS = new Set<string>(delegateAgentDispatchFailureKindValues);
const RESULT_FAILURE_KINDS = new Set<string>(delegateAgentResultFailureKindValues);
const RESULT_FAILURE_KINDS_FROM_DISPATCH = new Set<string>(delegateAgentResultFailureKindsFromDispatch);
const DELEGATED_COMPLETION_GATE_CHECK_IDS = new Set<string>(delegateAgentCompletionGateCheckIds);
const DELEGATED_DISPATCH_MARKDOWN_LIMIT = 5;

export type HarnessReplayAuditStatus = "clean" | "attention";
export type HarnessReplayAuditCheckStatus = "pass" | "warning" | "fail";

export interface HarnessReplayAuditCheck {
  id: string;
  status: HarnessReplayAuditCheckStatus;
  summary: string;
  refs: string[];
}

export interface HarnessReplayAuditReport {
  action: "harness-replay-audit";
  schema_version: 1;
  id: string;
  status: HarnessReplayAuditStatus;
  created_at: string;
  trace_ref: string;
  completion_id: string;
  session_id: string;
  turn_id: string;
  source_created_at: string;
  replay_result: "metadata_replay";
  summary: string;
  metrics: {
    rounds: number;
    events: number;
    tool_results: number;
    delegated_results: number;
    delegated_results_failed: number;
    delegated_dispatches: number;
    delegated_dispatches_failed: number;
    harness_state_actions: number;
    model_diagnostics: number;
    repo_write_guards: number;
    observation_refs: number;
  };
  checks: HarnessReplayAuditCheck[];
  delegated_completion_gate_checks: LiveRunCompletionCheckSummary[];
  delegated_dispatches: LiveRunDelegatedDispatchSummary[];
  artifact_refs: {
    json_ref: string;
    markdown_ref: string;
  };
  refs: string[];
  boundary: string;
}

export interface HarnessReplayAuditListResult {
  count: number;
  replay_refs: string[];
  replays: HarnessReplayAuditReport[];
  boundary: string;
}

export interface HarnessReplayAuditDetailResult {
  replay_ref: string;
  replay: HarnessReplayAuditReport;
}

export async function runHarnessReplayAudit(
  store: AgentStore,
  args: { traceRef?: string } = {}
): Promise<HarnessReplayAuditReport> {
  await store.ensureLayout();
  const trace = args.traceRef
    ? (await getLiveRunTrace(store, { traceRef: args.traceRef })).trace
    : (await listLiveRunTraces(store, { limit: 1 })).traces[0];
  if (!trace) throw new Error("No live run trace available for replay audit.");

  const id = newId("harness_replay");
  const jsonRef = `${REPLAY_ROOT}/${id}.json`;
  const markdownRef = `${REPLAY_ROOT}/${id}.md`;
  const checks = replayChecks(trace);
  const status: HarnessReplayAuditStatus = checks.some((check) => check.status !== "pass") ? "attention" : "clean";
  const report: HarnessReplayAuditReport = {
    action: "harness-replay-audit",
    schema_version: 1,
    id,
    status,
    created_at: utcNow(),
    trace_ref: trace.report_ref,
    completion_id: trace.completion_id,
    session_id: trace.session_id,
    turn_id: trace.turn_id,
    source_created_at: trace.created_at,
    replay_result: "metadata_replay",
    summary: replaySummary(trace, status),
    metrics: {
      rounds: trace.rounds.length,
      events: trace.event_count,
      tool_results: trace.tool_result_count,
      delegated_results: trace.delegated_result_count,
      delegated_results_failed: trace.delegated_result_failed_count,
      delegated_dispatches: trace.delegated_dispatches.length,
      delegated_dispatches_failed: trace.delegated_dispatches.filter((dispatch) => !dispatch.ok || dispatch.contract_status !== "passed").length,
      harness_state_actions: trace.harness_action_count,
      model_diagnostics: trace.model_diagnostic_count,
      repo_write_guards: trace.repo_write_guard_count,
      observation_refs: trace.observation_ref_count
    },
    checks,
    delegated_completion_gate_checks: trace.delegated_completion_gate_checks,
    delegated_dispatches: trace.delegated_dispatches,
    artifact_refs: {
      json_ref: jsonRef,
      markdown_ref: markdownRef
    },
    refs: unique([
      trace.report_ref,
      trace.context_manifest_ref,
      ...trace.rounds.map((round) => round.envelope_ref),
      ...trace.model_diagnostics.map((diagnostic) => diagnostic.diagnostic_ref),
      ...trace.repo_write_guards.map((guard) => `${trace.report_ref}#${guard.event_id}`),
      ...trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`),
      ...trace.delegated_completion_gate_checks.flatMap((check) => check.refs)
    ]),
    boundary: REPLAY_BOUNDARY
  };

  await store.writeJson(jsonRef, report);
  await store.writeText(markdownRef, renderHarnessReplayAuditMarkdown(report));
  const event = evidenceEventSchema.parse({
    session_id: id,
    turn_id: id,
    kind: "audit_result",
    summary: `Harness replay audit ${id} ${status}: ${report.summary}`,
    artifact_refs: [jsonRef, markdownRef, trace.report_ref]
  });
  await store.appendJsonl("memory/episodes/events.jsonl", event);
  return report;
}

export async function listHarnessReplayAudits(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<HarnessReplayAuditListResult> {
  await store.ensureLayout();
  const reports = await readHarnessReplayReports(store);
  const selected = reports.slice(0, args.limit ?? reports.length);
  return {
    count: selected.length,
    replay_refs: selected.map((report) => report.artifact_refs.json_ref),
    replays: selected,
    boundary: REPLAY_LIST_BOUNDARY
  };
}

export async function getHarnessReplayAudit(
  store: AgentStore,
  args: { replayRef: string }
): Promise<HarnessReplayAuditDetailResult> {
  await store.ensureLayout();
  const selector = args.replayRef.trim();
  if (!selector) throw new Error("--replay requires a value");
  if (selector.startsWith("/") || selector.split("/").includes("..")) {
    throw new Error(`Unsafe harness replay ref: ${args.replayRef}`);
  }
  const replay = (await readHarnessReplayReports(store))
    .find((report) => matchesReplayRef(report, selector));
  if (!replay) throw new Error(`Harness replay audit not found: ${args.replayRef}`);
  return {
    replay_ref: replay.artifact_refs.json_ref,
    replay
  };
}

export function renderHarnessReplayAuditMarkdown(report: HarnessReplayAuditReport): string {
  return [
    "# Harness Replay Audit",
    "",
    `id: ${report.id}`,
    `status: ${report.status}`,
    `created_at: ${report.created_at}`,
    `trace_ref: ${report.trace_ref}`,
    `completion_id: ${report.completion_id}`,
    `session_id: ${report.session_id}`,
    `turn_id: ${report.turn_id}`,
    "",
    report.summary,
    "",
    "## Metrics",
    "",
    `rounds: ${report.metrics.rounds}`,
    `events: ${report.metrics.events}`,
    `tool_results: ${report.metrics.tool_results}`,
    `delegated_results: ${report.metrics.delegated_results}`,
    `delegated_results_failed: ${report.metrics.delegated_results_failed}`,
    `delegated_dispatches: ${report.metrics.delegated_dispatches}`,
    `delegated_dispatches_failed: ${report.metrics.delegated_dispatches_failed}`,
    `harness_state_actions: ${report.metrics.harness_state_actions}`,
    `model_diagnostics: ${report.metrics.model_diagnostics}`,
    `repo_write_guards: ${report.metrics.repo_write_guards}`,
    `observation_refs: ${report.metrics.observation_refs}`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => [
      `- ${check.id}: ${check.status}`,
      `  summary: ${check.summary}`,
      `  refs: ${check.refs.join(", ") || "none"}`
    ].join("\n")),
    "",
    "## Delegated Completion Gate",
    "",
    ...(report.delegated_completion_gate_checks.length > 0
      ? report.delegated_completion_gate_checks.map((check) => [
        `- ${check.id}: ${check.status}`,
        `  summary: ${check.summary}`,
        `  refs: ${check.refs.join(", ") || "none"}`
      ].join("\n"))
      : ["- none"]),
    "",
    "## Delegated Dispatches",
    "",
    ...(report.delegated_dispatches.length > 0
      ? [
        ...report.delegated_dispatches.slice(0, DELEGATED_DISPATCH_MARKDOWN_LIMIT).map((dispatch) =>
          `- action_id=${dispatch.action_id}; envelope_ref=${dispatch.envelope_ref ?? "none"}; round=${dispatch.round}; sequence=${dispatch.sequence}; status=${dispatch.contract_status}; ok=${dispatch.ok}; dispatch_failure_kind=${dispatch.dispatch_failure_kind ?? "none"}; result_failure_kind=${dispatch.result_failure_kind ?? "none"}; task_chars=${dispatch.task_chars}; context_chars=${dispatch.context_chars}; ref=${dispatch.result_ref}; event=${dispatch.event_id}`
        ),
        ...(report.delegated_dispatches.length > DELEGATED_DISPATCH_MARKDOWN_LIMIT
          ? [`- omitted_delegated_dispatches=${report.delegated_dispatches.length - DELEGATED_DISPATCH_MARKDOWN_LIMIT}`]
          : [])
      ]
      : ["- none"]),
    "",
    "## Boundary",
    "",
    report.boundary
  ].join("\n");
}

async function readHarnessReplayReports(store: AgentStore): Promise<HarnessReplayAuditReport[]> {
  const refs = (await store.listStateFiles(REPLAY_ROOT))
    .filter((ref) => ref.endsWith(".json"));
  const reports: HarnessReplayAuditReport[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const report = asHarnessReplayAuditReport(raw);
    if (report) reports.push(report);
  }
  return reports.sort((left, right) =>
    right.created_at.localeCompare(left.created_at)
    || right.id.localeCompare(left.id)
    || right.artifact_refs.json_ref.localeCompare(left.artifact_refs.json_ref)
  );
}

function replayChecks(trace: LiveRunTraceSummary): HarnessReplayAuditCheck[] {
  return [
    {
      id: "source_trace_available",
      status: "pass",
      summary: `Replayed bounded trace metadata for ${trace.completion_id}.`,
      refs: [trace.report_ref]
    },
    {
      id: "completion_verification_state",
      status: trace.verification_status === "passed" && trace.verified ? "pass" : "warning",
      summary: `completion_status=${trace.completion_status}; verification_status=${trace.verification_status}; verified=${trace.verified}`,
      refs: [trace.report_ref]
    },
    delegatedCompletionGateCheck(trace),
    {
      id: "delegated_result_contract",
      status: trace.delegated_result_failed_count > 0 ? "warning" : "pass",
      summary: `delegated_results=${trace.delegated_result_count}; failed=${trace.delegated_result_failed_count}`,
      refs: [trace.report_ref]
    },
    delegatedDispatchMetadataCheck(trace),
    delegatedActionCoverageCheck(trace),
    delegatedDispatchLineageCheck(trace),
    delegatedDispatchFailureKindCheck(trace),
    delegatedDispatchRoundLimitCheck(trace),
    delegatedResultFailureKindCheck(trace),
    {
      id: "repo_write_guard",
      status: trace.repo_write_guards.some((guard) => guard.preexisting_dirty || guard.target_changed_after_write) ? "warning" : "pass",
      summary: `repo_write_guards=${trace.repo_write_guard_count}; preexisting_dirty=${trace.repo_write_guards.filter((guard) => guard.preexisting_dirty).length}; target_changed=${trace.repo_write_guards.filter((guard) => guard.target_changed_after_write).length}`,
      refs: trace.repo_write_guards.map((guard) => `${trace.report_ref}#${guard.event_id}`)
    },
    {
      id: "bounded_replay_boundary",
      status: "pass",
      summary: "Replay audit used bounded trace metadata only and did not invoke the model, execute tools, write the repo, or write the active vault.",
      refs: unique([trace.report_ref, trace.context_manifest_ref, ...trace.rounds.map((round) => round.envelope_ref)])
    }
  ];
}

function delegatedCompletionGateCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const delegatedFailedCheckIds = trace.completion_failed_check_ids.filter((id) => DELEGATED_COMPLETION_GATE_CHECK_IDS.has(id));
  const delegatedWarningCheckIds = trace.completion_warning_check_ids.filter((id) => DELEGATED_COMPLETION_GATE_CHECK_IDS.has(id));
  return {
    id: "delegated_completion_gate",
    status: delegatedFailedCheckIds.length > 0
      ? "fail"
      : delegatedWarningCheckIds.length > 0
        ? "warning"
        : "pass",
    summary: [
      `failed_checks=${delegatedFailedCheckIds.join(",") || "none"}`,
      `warning_checks=${delegatedWarningCheckIds.join(",") || "none"}`
    ].join("; "),
    refs: [trace.report_ref]
  };
}

function delegatedDispatchMetadataCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const failedDispatches = trace.delegated_dispatches.filter((dispatch) => !dispatch.ok || dispatch.contract_status !== "passed");
  const missingResultRefs = trace.delegated_dispatches.filter((dispatch) => !dispatch.result_ref);
  const problemRefs = unique([
    ...(trace.delegated_result_count === trace.delegated_dispatches.length ? [] : trace.delegated_dispatches),
    ...missingResultRefs
  ].map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`));
  return {
    id: "delegated_dispatch_metadata",
    status: trace.delegated_result_count === trace.delegated_dispatches.length && missingResultRefs.length === 0 ? "pass" : "warning",
    summary: [
      `delegated_results=${trace.delegated_result_count}`,
      `dispatches=${trace.delegated_dispatches.length}`,
      `failed_dispatches=${failedDispatches.length}`,
      `missing_result_ref=${missingResultRefs.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
  };
}

function delegatedActionCoverageCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const declaredDelegateActions = trace.rounds.reduce((sum, round) => sum + (round.action_counts.delegate_agent ?? 0), 0);
  const dispatchesByRound = new Map<number, number>();
  for (const dispatch of trace.delegated_dispatches) {
    dispatchesByRound.set(dispatch.round, (dispatchesByRound.get(dispatch.round) ?? 0) + 1);
  }
  const missingRounds = trace.rounds.filter((round) => (round.action_counts.delegate_agent ?? 0) > (dispatchesByRound.get(round.round) ?? 0));
  const missingDelegateDispatches = missingRounds.reduce((sum, round) => {
    const declared = round.action_counts.delegate_agent ?? 0;
    const recorded = dispatchesByRound.get(round.round) ?? 0;
    return sum + Math.max(0, declared - recorded);
  }, 0);
  return {
    id: "delegated_action_coverage",
    status: missingDelegateDispatches > 0 ? "warning" : "pass",
    summary: [
      `declared_delegate_actions=${declaredDelegateActions}`,
      `delegated_dispatches=${trace.delegated_dispatches.length}`,
      `missing_delegate_dispatches=${missingDelegateDispatches}`
    ].join("; "),
    refs: missingRounds.length > 0
      ? missingRounds.map((round) => round.envelope_ref)
      : unique([
          ...trace.rounds.filter((round) => (round.action_counts.delegate_agent ?? 0) > 0).map((round) => round.envelope_ref),
          ...trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
        ])
  };
}

function delegatedDispatchLineageCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const envelopeRefsByRound = new Map(trace.rounds.map((round) => [round.round, round.envelope_ref]));
  const delegatedActionIdsByRound = new Map(trace.rounds.map((round) => [round.round, new Set(round.delegated_action_ids)]));
  const delegatedActionSequencesByRound = new Map(trace.rounds.map((round) => [round.round, round.delegated_action_sequence_by_id]));
  const missingEnvelopeRefs = trace.delegated_dispatches.filter((dispatch) => !dispatch.envelope_ref);
  const mismatchedEnvelopeRefs = trace.delegated_dispatches.filter((dispatch) => {
    if (!dispatch.envelope_ref) return false;
    const roundEnvelopeRef = envelopeRefsByRound.get(dispatch.round);
    return roundEnvelopeRef !== undefined && roundEnvelopeRef !== dispatch.envelope_ref;
  });
  const mismatchedActionIds = trace.delegated_dispatches.filter((dispatch) => {
    const roundActionIds = delegatedActionIdsByRound.get(dispatch.round);
    return roundActionIds !== undefined && roundActionIds.size > 0 && !roundActionIds.has(dispatch.action_id);
  });
  const mismatchedSequences = trace.delegated_dispatches.filter((dispatch) => {
    const expectedSequence = delegatedActionSequencesByRound.get(dispatch.round)?.[dispatch.action_id];
    return expectedSequence !== undefined && expectedSequence !== dispatch.sequence;
  });
  const problemRefs = unique([
    ...missingEnvelopeRefs,
    ...mismatchedEnvelopeRefs,
    ...mismatchedActionIds,
    ...mismatchedSequences
  ].map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`));
  return {
    id: "delegated_dispatch_lineage",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `delegated_dispatches=${trace.delegated_dispatches.length}`,
      `missing_envelope_ref=${missingEnvelopeRefs.length}`,
      `mismatched_envelope_ref=${mismatchedEnvelopeRefs.length}`,
      `mismatched_action_id=${mismatchedActionIds.length}`,
      `mismatched_sequence=${mismatchedSequences.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : unique([
          ...trace.rounds.filter((round) => (round.action_counts.delegate_agent ?? 0) > 0).map((round) => round.envelope_ref),
          ...trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
        ])
  };
}

function delegatedDispatchFailureKindCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const failedDispatches = trace.delegated_dispatches.filter((dispatch) => !dispatch.ok || dispatch.contract_status !== "passed");
  const missingKindFieldDispatches = trace.delegated_dispatches.filter((dispatch) => !dispatch.dispatch_failure_kind_present);
  const invalidKindDispatches = trace.delegated_dispatches.filter((dispatch) =>
    dispatch.dispatch_failure_kind !== null && !DISPATCH_FAILURE_KINDS.has(dispatch.dispatch_failure_kind)
  );
  const missingLimitKindDispatches = failedDispatches.filter((dispatch) =>
    dispatch.sequence > DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND
      && dispatch.dispatch_failure_kind !== "dispatch_limit_exceeded"
  );
  const unexpectedLimitKindDispatches = trace.delegated_dispatches.filter((dispatch) =>
    dispatch.dispatch_failure_kind === "dispatch_limit_exceeded"
      && dispatch.sequence <= DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND
  );
  const problemRefs = unique([
    ...missingKindFieldDispatches,
    ...invalidKindDispatches,
    ...missingLimitKindDispatches,
    ...unexpectedLimitKindDispatches
  ].map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`));
  return {
    id: "delegated_dispatch_failure_kind",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `failed_dispatches=${failedDispatches.length}`,
      `missing_kind_field=${missingKindFieldDispatches.length}`,
      `invalid_kind=${invalidKindDispatches.length}`,
      `missing_limit_kind=${missingLimitKindDispatches.length}`,
      `unexpected_limit_kind=${unexpectedLimitKindDispatches.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
  };
}

function delegatedDispatchRoundLimitCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const activeByRound = new Map<number, LiveRunDelegatedDispatchSummary[]>();
  for (const dispatch of trace.delegated_dispatches) {
    if (dispatch.dispatch_failure_kind === "dispatch_limit_exceeded") continue;
    activeByRound.set(dispatch.round, [...(activeByRound.get(dispatch.round) ?? []), dispatch]);
  }
  const overLimitDispatches = [...activeByRound.values()]
    .filter((dispatches) => dispatches.length > DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND)
    .flatMap((dispatches) => dispatches.slice(DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND));
  const problemRefs = unique(overLimitDispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`));
  return {
    id: "delegated_dispatch_round_limit",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `max_per_round=${DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND}`,
      `rounds=${activeByRound.size}`,
      `over_limit_active_dispatches=${overLimitDispatches.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
  };
}

function delegatedResultFailureKindCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const failedDispatches = trace.delegated_dispatches.filter((dispatch) => !dispatch.ok || dispatch.contract_status !== "passed");
  const missingKindFieldDispatches = trace.delegated_dispatches.filter((dispatch) =>
    !dispatch.result_failure_kind_present
  );
  const failedNoneKindDispatches = failedDispatches.filter((dispatch) =>
    dispatch.result_failure_kind_present && dispatch.result_failure_kind === null
  );
  const invalidKindDispatches = trace.delegated_dispatches.filter((dispatch) =>
    dispatch.result_failure_kind !== null && !RESULT_FAILURE_KINDS.has(dispatch.result_failure_kind)
  );
  const unexpectedKindDispatches = trace.delegated_dispatches.filter((dispatch) =>
    dispatch.ok && dispatch.contract_status === "passed" && dispatch.result_failure_kind !== null
  );
  const mismatchedKindPairDispatches = trace.delegated_dispatches.filter((dispatch) =>
    hasFailureKindPairMismatch(dispatch)
  );
  const missingResultKindEventIds = unique([
    ...missingKindFieldDispatches,
    ...failedNoneKindDispatches
  ].map((dispatch) => dispatch.event_id));
  const problemRefs = unique([
    ...missingKindFieldDispatches,
    ...failedNoneKindDispatches,
    ...invalidKindDispatches,
    ...unexpectedKindDispatches,
    ...mismatchedKindPairDispatches
  ].map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`));
  return {
    id: "delegated_result_failure_kind",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `failed_dispatches=${failedDispatches.length}`,
      `missing_result_kind=${missingResultKindEventIds.length}`,
      `invalid_result_kind=${invalidKindDispatches.length}`,
      `unexpected_result_kind=${unexpectedKindDispatches.length}`,
      `kind_pair_mismatch=${mismatchedKindPairDispatches.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
  };
}

function hasFailureKindPairMismatch(dispatch: LiveRunDelegatedDispatchSummary): boolean {
  if (!dispatch.dispatch_failure_kind_present || !dispatch.result_failure_kind_present) return false;
  if (dispatch.dispatch_failure_kind !== null && !DISPATCH_FAILURE_KINDS.has(dispatch.dispatch_failure_kind)) return false;
  if (dispatch.result_failure_kind !== null && !RESULT_FAILURE_KINDS.has(dispatch.result_failure_kind)) return false;
  if (dispatch.result_failure_kind !== null && RESULT_FAILURE_KINDS_FROM_DISPATCH.has(dispatch.result_failure_kind)) {
    return dispatch.dispatch_failure_kind !== dispatch.result_failure_kind;
  }
  return dispatch.dispatch_failure_kind !== null;
}

function replaySummary(trace: LiveRunTraceSummary, status: HarnessReplayAuditStatus): string {
  const warnings = [
    trace.verification_status !== "passed" || !trace.verified ? "completion verification attention" : null,
    trace.delegated_result_failed_count > 0 ? "delegated result failure" : null,
    trace.delegated_result_count !== trace.delegated_dispatches.length ? "delegated dispatch metadata gap" : null,
    trace.repo_write_guard_count > 0 ? "repo write guard evidence" : null,
    trace.model_diagnostic_count > 0 ? "model diagnostic evidence" : null
  ].filter((item): item is string => Boolean(item));
  if (status === "clean") {
    return `Replay-audited ${trace.completion_id} from bounded metadata with no attention checks.`;
  }
  return `Replay-audited ${trace.completion_id} from bounded metadata with attention: ${warnings.join(", ") || "metadata warning"}.`;
}

function asHarnessReplayAuditReport(value: unknown): HarnessReplayAuditReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.action !== "harness-replay-audit" || record.schema_version !== 1) return null;
  if (typeof record.id !== "string" || !isReplayStatus(record.status) || typeof record.created_at !== "string") return null;
  if (typeof record.trace_ref !== "string" || typeof record.completion_id !== "string") return null;
  if (typeof record.session_id !== "string" || typeof record.turn_id !== "string") return null;
  if (typeof record.source_created_at !== "string" || record.replay_result !== "metadata_replay") return null;
  if (typeof record.summary !== "string" || typeof record.boundary !== "string") return null;
  if (!isRecord(record.metrics) || !isRecord(record.artifact_refs)) return null;
  if (!Array.isArray(record.checks) || !Array.isArray(record.refs)) return null;
  const checks = record.checks.map(asReplayCheck).filter((check): check is HarnessReplayAuditCheck => check !== null);
  if (checks.length !== record.checks.length) return null;
  const jsonRef = stringField(record.artifact_refs, "json_ref");
  const markdownRef = stringField(record.artifact_refs, "markdown_ref");
  if (!jsonRef || !markdownRef) return null;
  return {
    action: "harness-replay-audit",
    schema_version: 1,
    id: record.id,
    status: record.status,
    created_at: record.created_at,
    trace_ref: record.trace_ref,
    completion_id: record.completion_id,
    session_id: record.session_id,
    turn_id: record.turn_id,
    source_created_at: record.source_created_at,
    replay_result: "metadata_replay",
    summary: record.summary,
    metrics: {
      rounds: numberField(record.metrics, "rounds") ?? 0,
      events: numberField(record.metrics, "events") ?? 0,
      tool_results: numberField(record.metrics, "tool_results") ?? 0,
      delegated_results: numberField(record.metrics, "delegated_results") ?? 0,
      delegated_results_failed: numberField(record.metrics, "delegated_results_failed") ?? 0,
      delegated_dispatches: numberField(record.metrics, "delegated_dispatches") ?? 0,
      delegated_dispatches_failed: numberField(record.metrics, "delegated_dispatches_failed") ?? 0,
      harness_state_actions: numberField(record.metrics, "harness_state_actions") ?? 0,
      model_diagnostics: numberField(record.metrics, "model_diagnostics") ?? 0,
      repo_write_guards: numberField(record.metrics, "repo_write_guards") ?? 0,
      observation_refs: numberField(record.metrics, "observation_refs") ?? 0
    },
    checks,
    delegated_completion_gate_checks: Array.isArray(record.delegated_completion_gate_checks)
      ? record.delegated_completion_gate_checks.map(asCompletionGateCheck).filter((item): item is LiveRunCompletionCheckSummary => item !== null)
      : [],
    delegated_dispatches: Array.isArray(record.delegated_dispatches)
      ? record.delegated_dispatches.map(asDelegatedDispatchSummary).filter((item): item is LiveRunDelegatedDispatchSummary => item !== null)
      : [],
    artifact_refs: {
      json_ref: jsonRef,
      markdown_ref: markdownRef
    },
    refs: record.refs.filter((item): item is string => typeof item === "string"),
    boundary: record.boundary
  };
}

function asCompletionGateCheck(value: unknown): LiveRunCompletionCheckSummary | null {
  if (!isRecord(value)) return null;
  const id = stringField(value, "id");
  const status = stringField(value, "status");
  const summary = stringField(value, "summary");
  if (!id || !isCompletionGateCheckStatus(status) || !summary || !Array.isArray(value.refs)) return null;
  return {
    id,
    status,
    summary,
    refs: value.refs.filter((item): item is string => typeof item === "string")
  };
}

function asDelegatedDispatchSummary(value: unknown): LiveRunDelegatedDispatchSummary | null {
  if (!isRecord(value)) return null;
  const eventId = stringField(value, "event_id");
  const createdAt = stringField(value, "created_at");
  const resultRef = stringField(value, "result_ref");
  const actionId = stringField(value, "action_id");
  const envelopeRef = stringField(value, "envelope_ref");
  const contractStatus = stringField(value, "contract_status");
  const dispatchFailureKind = stringField(value, "dispatch_failure_kind");
  const resultFailureKind = stringField(value, "result_failure_kind");
  const round = numberField(value, "round");
  const sequence = numberField(value, "sequence");
  const taskChars = numberField(value, "task_chars");
  const contextChars = numberField(value, "context_chars");
  if (!eventId || !createdAt || !resultRef || !actionId || !contractStatus) return null;
  if (round === null || sequence === null || taskChars === null || contextChars === null) return null;
  if (typeof value.ok !== "boolean") return null;
  return {
    event_id: eventId,
    created_at: createdAt,
    result_ref: resultRef,
    action_id: actionId,
    envelope_ref: envelopeRef,
    round,
    sequence,
    task_chars: taskChars,
    context_chars: contextChars,
    contract_status: contractStatus,
    dispatch_failure_kind: dispatchFailureKind,
    dispatch_failure_kind_present: Object.hasOwn(value, "dispatch_failure_kind"),
    result_failure_kind: resultFailureKind,
    result_failure_kind_present: Object.hasOwn(value, "result_failure_kind"),
    ok: value.ok
  };
}

function asReplayCheck(value: unknown): HarnessReplayAuditCheck | null {
  if (!isRecord(value)) return null;
  const id = stringField(value, "id");
  const status = stringField(value, "status");
  const summary = stringField(value, "summary");
  if (!id || !isReplayCheckStatus(status) || !summary || !Array.isArray(value.refs)) return null;
  return {
    id,
    status,
    summary,
    refs: value.refs.filter((item): item is string => typeof item === "string")
  };
}

function matchesReplayRef(report: HarnessReplayAuditReport, selector: string): boolean {
  const base = basename(report.artifact_refs.json_ref);
  const baseWithoutExt = base.replace(/\.json$/, "");
  return report.id === selector
    || report.artifact_refs.json_ref === selector
    || report.trace_ref === selector
    || report.completion_id === selector
    || base === selector
    || baseWithoutExt === selector;
}

function isReplayStatus(value: unknown): value is HarnessReplayAuditStatus {
  return value === "clean" || value === "attention";
}

function isReplayCheckStatus(value: string | null): value is HarnessReplayAuditCheckStatus {
  return value === "pass" || value === "warning" || value === "fail";
}

function isCompletionGateCheckStatus(value: string | null): value is LiveRunCompletionCheckSummary["status"] {
  return value === "pass" || value === "fail" || value === "warning" || value === "skipped";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unique(refs: Array<string | null | undefined>): string[] {
  return [...new Set(refs.filter((ref): ref is string => typeof ref === "string" && ref.length > 0))];
}

const REPLAY_BOUNDARY = "state-only harness replay audit; reads bounded live-run trace metadata and writes only replay report/evidence refs under local state; does not invoke the model, execute tools, read raw model responses, read raw tool bodies, read raw final responses, write the repo, write the active vault, manage services, or mutate SOP/skill/semantic-memory artifacts";
const REPLAY_LIST_BOUNDARY = "read-only harness replay audit history; reads replay report metadata only and does not rerun traces, invoke the model, execute tools, write state, write the repo, or write the active vault";
