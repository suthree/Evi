import { basename } from "node:path";
import {
  delegateAgentCompletionGateCheckId,
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
  type LiveRunTraceSummary,
  type LiveRunToolResultEventSummary,
  type LiveRunVerificationEvidenceRefSummary
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

interface DelegatedInputLineage {
  missingInputMetadata: LiveRunDelegatedDispatchSummary[];
  missingExpectedInput: LiveRunDelegatedDispatchSummary[];
  duplicateInputMetadataKeys: string[];
  unexpectedInputMetadataKeys: string[];
  metadataIssueEnvelopeRefs: string[];
  mismatchedInputActionIds: LiveRunDelegatedDispatchSummary[];
  mismatchedInputValidity: LiveRunDelegatedDispatchSummary[];
  mismatchedInputTaskChars: LiveRunDelegatedDispatchSummary[];
  mismatchedInputContextChars: LiveRunDelegatedDispatchSummary[];
  mismatchedInputDigests: LiveRunDelegatedDispatchSummary[];
  invalidInputOutcomeMismatches: LiveRunDelegatedDispatchSummary[];
  inputMetadataComplete: boolean;
}

interface ToolActionLineage {
  validEventIds: Set<string>;
  legacyEventIds: Set<string>;
  partialEventIds: Set<string>;
  mismatchedEventIds: Set<string>;
  duplicateEventIds: Set<string>;
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
    delegated_completion_gate_passed: number;
    delegated_completion_gate_warning: number;
    delegated_completion_gate_failed: number;
    delegated_completion_gate_skipped: number;
    delegated_dispatches: number;
    delegated_dispatches_failed: number;
    verification_evidence_refs: number;
    harness_state_actions: number;
    model_diagnostics: number;
    repo_write_guards: number;
    observation_refs: number;
  };
  checks: HarnessReplayAuditCheck[];
  delegated_completion_gate_checks: LiveRunCompletionCheckSummary[];
  delegated_result_report_refs: string[];
  delegated_result_event_fallback_refs: string[];
  delegated_result_refs: string[];
  delegated_dispatches: LiveRunDelegatedDispatchSummary[];
  verification_evidence_refs: LiveRunVerificationEvidenceRefSummary[];
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
      delegated_completion_gate_passed: trace.delegated_completion_gate_status_counts.pass,
      delegated_completion_gate_warning: trace.delegated_completion_gate_status_counts.warning,
      delegated_completion_gate_failed: trace.delegated_completion_gate_status_counts.fail,
      delegated_completion_gate_skipped: trace.delegated_completion_gate_status_counts.skipped,
      delegated_dispatches: trace.delegated_dispatches.length,
      delegated_dispatches_failed: trace.delegated_dispatches.filter((dispatch) => !dispatch.ok || dispatch.contract_status !== "passed").length,
      verification_evidence_refs: trace.verification_evidence_ref_count,
      harness_state_actions: trace.harness_action_count,
      model_diagnostics: trace.model_diagnostic_count,
      repo_write_guards: trace.repo_write_guard_count,
      observation_refs: trace.observation_ref_count
    },
    checks,
    delegated_completion_gate_checks: trace.delegated_completion_gate_checks,
    delegated_result_report_refs: trace.delegated_result_report_refs,
    delegated_result_event_fallback_refs: trace.delegated_result_event_fallback_refs,
    delegated_result_refs: trace.delegated_result_refs,
    delegated_dispatches: trace.delegated_dispatches,
    verification_evidence_refs: trace.verification_evidence_refs,
    artifact_refs: {
      json_ref: jsonRef,
      markdown_ref: markdownRef
    },
    refs: unique([
      trace.report_ref,
      trace.context_manifest_ref,
      ...trace.foreign_context_artifact_refs,
      ...trace.rounds.map((round) => round.envelope_ref),
      ...trace.invalid_model_action_envelope_refs,
      ...trace.foreign_tool_result_artifact_refs,
      ...trace.unreadable_model_diagnostic_refs,
      ...trace.foreign_model_diagnostic_refs,
      ...trace.tool_result_events.map((event) => `${trace.report_ref}#${event.event_id}`),
      ...trace.model_diagnostics.map((diagnostic) => diagnostic.diagnostic_ref),
      ...trace.repo_write_guards.map((guard) => `${trace.report_ref}#${guard.event_id}`),
      ...trace.verification_evidence_refs.map((item) => item.ref),
      ...trace.delegated_result_refs,
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
    `delegated_completion_gate_passed: ${report.metrics.delegated_completion_gate_passed}`,
    `delegated_completion_gate_warning: ${report.metrics.delegated_completion_gate_warning}`,
    `delegated_completion_gate_failed: ${report.metrics.delegated_completion_gate_failed}`,
    `delegated_completion_gate_skipped: ${report.metrics.delegated_completion_gate_skipped}`,
    `delegated_result_report_refs: ${report.delegated_result_report_refs.length}`,
    `delegated_result_event_fallback_refs: ${report.delegated_result_event_fallback_refs.length}`,
    `delegated_result_refs: ${report.delegated_result_refs.length}`,
    `delegated_dispatches: ${report.metrics.delegated_dispatches}`,
    `delegated_dispatches_failed: ${report.metrics.delegated_dispatches_failed}`,
    `verification_evidence_refs: ${report.metrics.verification_evidence_refs}`,
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
          `- action_id=${dispatch.action_id}; result_id=${dispatch.result_id ?? "unknown"}; envelope_ref=${dispatch.envelope_ref ?? "none"}; round=${dispatch.round}; sequence=${dispatch.sequence}; status=${dispatch.contract_status}; ok=${dispatch.ok}; model_invoked=${dispatch.model_invoked ?? "unknown"}; dispatch_failure_kind=${dispatch.dispatch_failure_kind ?? "none"}; result_failure_kind=${dispatch.result_failure_kind ?? "none"}; task_chars=${dispatch.task_chars}; context_chars=${dispatch.context_chars}; ref=${dispatch.result_ref}; event=${dispatch.event_id}`
        ),
        ...(report.delegated_dispatches.length > DELEGATED_DISPATCH_MARKDOWN_LIMIT
          ? [`- omitted_delegated_dispatches=${report.delegated_dispatches.length - DELEGATED_DISPATCH_MARKDOWN_LIMIT}`]
          : [])
      ]
      : ["- none"]),
    "",
    "## Verification Evidence Refs",
    "",
    ...(report.verification_evidence_refs.length > 0
      ? report.verification_evidence_refs.map((item) =>
        `- ${item.ref}: source=${item.source}; round=${item.round}; tool=${item.tool}; side_effect_level=${item.side_effect_level}; claimed=${item.claimed}; independent=${item.counts_as_independent_evidence}; recovery=${item.counts_as_failed_delegation_recovery}; event=${item.event_id}`
      )
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
  const toolResultOutcomeGate = toolResultOutcomeCompletionGateCheck(trace);
  return [
    {
      id: "source_trace_available",
      status: "pass",
      summary: `Replayed bounded trace metadata for ${trace.completion_id}.`,
      refs: [trace.report_ref]
    },
    modelActionEnvelopeIntegrityCheck(trace),
    modelActionEventBindingCheck(trace),
    modelDiagnosticIntegrityCheck(trace),
    completionVerificationStateCheck(trace),
    ...(toolResultOutcomeGate ? [toolResultOutcomeGate] : []),
    finalResponseEvidenceBindingCheck(trace),
    delegatedCompletionGateCheck(trace),
    verificationEvidenceLineageCheck(trace),
    {
      id: "delegated_result_contract",
      status: trace.delegated_result_failed_count > 0 ? "warning" : "pass",
      summary: `delegated_results=${trace.delegated_result_count}; failed=${trace.delegated_result_failed_count}`,
      refs: [trace.report_ref]
    },
    delegatedResultRefCoverageCheck(trace),
    delegatedDispatchMetadataCheck(trace),
    delegatedModelInvocationBoundaryCheck(trace),
    delegatedActionCoverageCheck(trace),
    delegatedDispatchLineageCheck(trace),
    delegatedDispatchFailureKindCheck(trace),
    delegatedDispatchRoundLimitCheck(trace),
    delegatedResultFailureKindCheck(trace),
    delegatedRecoveryGuidanceCheck(trace),
    delegatedObservationInputLineageCheck(trace),
    {
      id: "repo_write_guard",
      status: trace.repo_write_guards.some((guard) => guard.preexisting_dirty || guard.target_changed_after_write) ? "warning" : "pass",
      summary: `repo_write_guards=${trace.repo_write_guard_count}; preexisting_dirty=${trace.repo_write_guards.filter((guard) => guard.preexisting_dirty).length}; target_changed=${trace.repo_write_guards.filter((guard) => guard.target_changed_after_write).length}`,
      refs: trace.repo_write_guards.map((guard) => `${trace.report_ref}#${guard.event_id}`)
    },
    toolResultArtifactIdentityCheck(trace),
    contextArtifactIdentityCheck(trace),
    {
      id: "bounded_replay_boundary",
      status: "pass",
      summary: "Replay audit used bounded trace metadata only and did not invoke the model, execute tools, write the repo, or write the active vault.",
      refs: unique([trace.report_ref, trace.context_manifest_ref, ...trace.rounds.map((round) => round.envelope_ref)])
    }
  ];
}

function modelActionEnvelopeIntegrityCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const invalidRefs = trace.invalid_model_action_envelope_refs;
  const foreignRefs = trace.foreign_model_action_envelope_refs;
  return {
    id: "model_action_envelope_integrity",
    status: invalidRefs.length > 0 || foreignRefs.length > 0 ? "warning" : "pass",
    summary: `invalid_model_action_envelopes=${invalidRefs.length}; cross_session_model_action_envelopes=${foreignRefs.length}`,
    refs: invalidRefs.length > 0 || foreignRefs.length > 0
      ? unique([trace.report_ref, ...invalidRefs, ...foreignRefs])
      : unique([trace.report_ref, ...trace.rounds.map((round) => round.envelope_ref)])
  };
}

function modelActionEventBindingCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const missingModelActionEvents = trace.rounds.filter((round) => round.model_action_event_count === 0);
  const duplicateModelActionEvents = trace.rounds.filter((round) => round.model_action_event_count > 1);
  const multiEnvelopeModelActionEvents = unique(trace.rounds
    .flatMap((round) => round.model_action_event_bindings)
    .filter((binding) => binding.envelope_ref_count > 1)
    .map((binding) => binding.event_id));
  const multiEnvelopeRounds = trace.rounds.filter((round) =>
    round.model_action_event_bindings.some((binding) => binding.envelope_ref_count > 1));
  const bindings = trace.rounds.flatMap((round) => round.model_action_event_bindings.map((binding) => ({
    ...binding,
    envelope_ref: round.envelope_ref
  })));
  const missingMetadata = bindings.filter((binding) => !binding.metadata_present);
  const metadataCoverageIsPartial = missingMetadata.length > 0 && missingMetadata.length < bindings.length;
  const mismatchedEnvelopeRefs = bindings.filter((binding) => binding.envelope_ref_matches_artifact === false);
  const mismatchedDigests = bindings.filter((binding) => binding.envelope_digest_matches === false);
  const bindingProblemRefs = [
    ...(metadataCoverageIsPartial ? missingMetadata : []),
    ...mismatchedEnvelopeRefs,
    ...mismatchedDigests
  ].map((binding) => binding.envelope_ref);
  const roundProblemRefs = [
    ...missingModelActionEvents,
    ...duplicateModelActionEvents,
    ...multiEnvelopeRounds
  ].map((round) => round.envelope_ref);
  const problemRefs = unique([...roundProblemRefs, ...bindingProblemRefs]);
  return {
    id: "model_action_event_binding",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `model_action_rounds=${trace.rounds.length}`,
      `missing_model_action_events=${missingModelActionEvents.length}`,
      `duplicate_model_action_events=${duplicateModelActionEvents.length}`,
      `multi_envelope_model_action_events=${multiEnvelopeModelActionEvents.length}`,
      `missing_model_action_metadata=${missingMetadata.length}`,
      `partial_model_action_metadata=${metadataCoverageIsPartial}`,
      `mismatched_model_action_envelope_ref=${mismatchedEnvelopeRefs.length}`,
      `mismatched_model_action_envelope_digest=${mismatchedDigests.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : trace.rounds.map((round) => round.envelope_ref)
  };
}

function modelDiagnosticIntegrityCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const unreadableRefs = trace.unreadable_model_diagnostic_refs;
  const foreignRefs = trace.foreign_model_diagnostic_refs;
  const missingMetadata = trace.model_diagnostics.filter((diagnostic) => !diagnostic.metadata_present);
  const metadataCoverageIsPartial = missingMetadata.length > 0 && missingMetadata.length < trace.model_diagnostics.length;
  const mismatchedRefs = trace.model_diagnostics.filter((diagnostic) => diagnostic.diagnostic_ref_matches_artifact === false);
  const mismatchedDigests = trace.model_diagnostics.filter((diagnostic) => diagnostic.diagnostic_digest_matches === false);
  const problemRefs = unique([
    ...unreadableRefs,
    ...foreignRefs,
    ...(metadataCoverageIsPartial ? missingMetadata : []).map((diagnostic) => diagnostic.diagnostic_ref),
    ...mismatchedRefs.map((diagnostic) => diagnostic.diagnostic_ref),
    ...mismatchedDigests.map((diagnostic) => diagnostic.diagnostic_ref)
  ]);
  return {
    id: "model_diagnostic_integrity",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `model_diagnostics=${trace.model_diagnostics.length}`,
      `unreadable_model_diagnostics=${unreadableRefs.length}`,
      `cross_session_model_diagnostics=${foreignRefs.length}`,
      `missing_model_diagnostic_metadata=${missingMetadata.length}`,
      `partial_model_diagnostic_metadata=${metadataCoverageIsPartial}`,
      `mismatched_model_diagnostic_ref=${mismatchedRefs.length}`,
      `mismatched_model_diagnostic_digest=${mismatchedDigests.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? unique([trace.report_ref, ...problemRefs])
      : unique([trace.report_ref, ...trace.model_diagnostics.map((diagnostic) => diagnostic.diagnostic_ref)])
  };
}

function toolResultArtifactIdentityCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const foreignRefs = trace.foreign_tool_result_artifact_refs;
  return {
    id: "tool_result_artifact_identity",
    status: foreignRefs.length > 0 ? "warning" : "pass",
    summary: `cross_session_tool_result_artifacts=${foreignRefs.length}`,
    refs: foreignRefs.length > 0
      ? unique([trace.report_ref, ...foreignRefs])
      : [trace.report_ref]
  };
}

function contextArtifactIdentityCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const foreignRefs = trace.foreign_context_artifact_refs;
  return {
    id: "context_artifact_identity",
    status: foreignRefs.length > 0 ? "warning" : "pass",
    summary: `cross_session_context_artifacts=${foreignRefs.length}`,
    refs: foreignRefs.length > 0
      ? unique([trace.report_ref, ...foreignRefs])
      : [trace.report_ref]
  };
}

function finalResponseEvidenceBindingCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  if (trace.final_completion_status !== "done") {
    return {
      id: "final_response_evidence_binding",
      status: "pass",
      summary: "applicable=false; final_completion_status is not done; no final response is required.",
      refs: [trace.report_ref]
    };
  }
  const modernEvents = trace.final_response_events.filter((event) => event.metadata_present);
  const legacyEvents = trace.final_response_events.filter((event) => !event.metadata_present);
  const event = modernEvents.length === 1 ? modernEvents[0]! : null;
  const finalRound = trace.rounds.find((round) => round.envelope_ref === trace.final_envelope_ref);
  const matchingRespondActions = event && finalRound
    ? finalRound.respond_action_expectations.filter((action) =>
      action.action_id === event.action_id && action.sequence === event.sequence)
    : [];
  const eventMatches = event !== null
    && event.lineage_present
    && !event.lineage_partial
    && event.response_ref === trace.expected_final_response_ref
    && event.artifact_refs.length === 1
    && event.artifact_refs[0] === trace.expected_final_response_ref
    && event.envelope_ref === trace.final_envelope_ref
    && event.reported_envelope_ref === trace.final_envelope_ref
    && event.reported_round === event.round
    && event.envelope_ref_in_trace_rounds
    && event.envelope_ref_matches_identity
    && matchingRespondActions.length === 1;
  const reportCheck = trace.final_response_checks.length === 1
    ? trace.final_response_checks[0]!
    : null;
  const reportCheckMatches = reportCheck?.status === "pass"
    && reportCheck.refs.length === 1
    && reportCheck.refs[0] === trace.expected_final_response_ref;
  const definitiveMatch = modernEvents.length === 1
    && legacyEvents.length === 0
    && trace.final_response_events.length === 1
    && trace.final_response_ref_matches_identity
    && trace.final_response_file_present
    && finalRound !== undefined
    && finalRound.respond_action_expectations.length > 0
    && eventMatches
    && reportCheckMatches;
  const claimsPassed = trace.verification_status === "passed" || trace.verified;
  const status: HarnessReplayAuditCheckStatus = definitiveMatch
    ? "pass"
    : modernEvents.length === 0
      ? "warning"
      : claimsPassed
        ? "fail"
        : "warning";
  return {
    id: "final_response_evidence_binding",
    status,
    summary: [
      "applicable=true",
      `expected_ref=${trace.expected_final_response_ref}`,
      `report_ref_matches_identity=${trace.final_response_ref_matches_identity}`,
      `file_present=${trace.final_response_file_present}`,
      `events=${trace.final_response_events.length}`,
      `modern_events=${modernEvents.length}`,
      `legacy_events=${legacyEvents.length}`,
      `partial_metadata=${modernEvents.filter((item) => item.lineage_partial).length}`,
      `final_respond_actions=${finalRound?.respond_action_expectations.length ?? 0}`,
      `event_lineage_match=${eventMatches}`,
      `report_check_count=${trace.final_response_checks.length}`,
      `report_check_match=${reportCheckMatches}`
    ].join("; "),
    refs: unique([
      trace.report_ref,
      trace.final_envelope_ref,
      ...trace.final_response_events.map((item) => `${trace.report_ref}#${item.event_id}`)
    ])
  };
}

function completionVerificationStateCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const finalCompletionStatus = trace.final_completion_status;
  let expectedVerificationStatus: LiveRunTraceSummary["verification_status"] | "unknown" = "unknown";
  if (finalCompletionStatus === "done") {
    expectedVerificationStatus = trace.completion_failed_check_ids.length > 0 ? "failed" : "passed";
  } else if (finalCompletionStatus !== null) {
    expectedVerificationStatus = "skipped";
  }
  const expectedVerified = expectedVerificationStatus === "passed";
  const tupleMatches = finalCompletionStatus !== null
    && trace.verification_status === expectedVerificationStatus
    && trace.verified === expectedVerified;
  const claimsPassed = trace.verification_status === "passed" || trace.verified;
  let status: HarnessReplayAuditCheckStatus = "warning";
  if (trace.final_completion_status_present && tupleMatches && expectedVerified
    && trace.reported_completion_status_matches_final) status = "pass";
  if (trace.final_completion_status_present && !tupleMatches && claimsPassed) status = "fail";
  return {
    id: "completion_verification_state",
    status,
    summary: [
      `completion_status=${trace.completion_status}`,
      `reported_completion_status=${trace.reported_completion_status}`,
      `final_completion_status=${trace.final_completion_status ?? "unknown"}`,
      `final_completion_status_present=${trace.final_completion_status_present}`,
      `reported_completion_status_matches_final=${trace.reported_completion_status_matches_final ?? "unknown"}`,
      `completion_status_authority=${trace.final_completion_status_present ? "final_envelope" : "unknown"}`,
      `verification_status=${trace.verification_status}`,
      `verified=${trace.verified}`,
      `expected_verification_status=${expectedVerificationStatus}`,
      `expected_verified=${expectedVerified}`,
      `failed_checks=${trace.completion_failed_check_ids.join(",") || "none"}`,
      `tuple_match=${tupleMatches}`
    ].join("; "),
    refs: [trace.report_ref]
  };
}

function toolResultOutcomeCompletionGateCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck | null {
  const failedToolEvents = trace.tool_result_events.filter((event) => event.ok === false);
  const unknownToolOutcomeEvents = trace.tool_result_events.filter((event) => event.ok === null);
  const reportedFailure = trace.completion_failed_check_ids.includes("tool_result_outcomes");
  const doneClaim = trace.final_completion_status === "done";
  const claimsVerified = trace.verification_status === "passed" || trace.verified;
  const attentionToolEvents = [...failedToolEvents, ...unknownToolOutcomeEvents];
  const refs = attentionToolEvents.map((event) => `${trace.report_ref}#${event.event_id}`);
  if (!doneClaim || (attentionToolEvents.length === 0 && !reportedFailure)) {
    return null;
  }
  let status: HarnessReplayAuditCheckStatus = "pass";

  if (failedToolEvents.length > 0) {
    status = reportedFailure && !claimsVerified ? "pass" : claimsVerified ? "fail" : "warning";
  } else if (reportedFailure) {
    status = "fail";
  } else {
    status = "warning";
  }

  return {
    id: "tool_result_outcome_completion_gate",
    status,
    summary: [
      `applicable=${doneClaim}`,
      `tool_results=${trace.tool_result_events.length}`,
      `failed_tool_results=${failedToolEvents.length}`,
      `unknown_tool_outcomes=${unknownToolOutcomeEvents.length}`,
      `reported_failure=${reportedFailure}`,
      `verification_status=${trace.verification_status}`,
      `verified=${trace.verified}`
    ].join("; "),
    refs: refs.length > 0 ? refs : [trace.report_ref]
  };
}

function verificationEvidenceBinding(trace: LiveRunTraceSummary): {
  validRefs: Set<string>;
  validEvidenceByRef: Map<string, { eventId: string; round: number; isWriteRun: boolean }>;
  legacyEventMetadataRefs: Set<string>;
} {
  const actionLineage = toolActionLineage(trace);
  const evidencePairs = new Map<string, typeof trace.verification_evidence_refs>();
  for (const item of trace.verification_evidence_refs) {
    const key = JSON.stringify([item.tool_result_id, item.artifact_ref]);
    evidencePairs.set(key, [...(evidencePairs.get(key) ?? []), item]);
  }
  const toolResultEventsById = new Map<string, typeof trace.tool_result_events>();
  for (const event of trace.tool_result_events) {
    toolResultEventsById.set(event.event_id, [...(toolResultEventsById.get(event.event_id) ?? []), event]);
  }
  const validRefs = new Set<string>();
  const validEvidenceByRef = new Map<string, { eventId: string; round: number; isWriteRun: boolean }>();
  const legacyEventMetadataRefs = new Set<string>();
  for (const items of evidencePairs.values()) {
    if (items.length !== 2
      || items.filter((item) => item.source === "tool_result").length !== 1
      || items.filter((item) => item.source === "tool_artifact").length !== 1) continue;
    const first = items[0]!;
    const second = items[1]!;
    if (items.some((item) => item.ref !== (item.source === "tool_result" ? item.tool_result_id : item.artifact_ref))
      || first.event_id !== second.event_id
      || first.round !== second.round
      || first.tool !== second.tool
      || first.ok !== second.ok
      || first.side_effect_level !== second.side_effect_level
      || first.is_write_run !== second.is_write_run
      || first.after_latest_delegation !== second.after_latest_delegation
      || first.after_latest_failed_delegation !== second.after_latest_failed_delegation
      || !first.ok) continue;
    const events = toolResultEventsById.get(first.event_id);
    if (events?.length !== 1
      || events[0]!.round !== first.round
      || !events[0]!.artifact_refs.includes(first.artifact_ref)) continue;
    const event = events[0]!;
    if (actionLineage.legacyEventIds.has(event.event_id)) {
      for (const item of items) legacyEventMetadataRefs.add(item.ref);
      continue;
    }
    if (!actionLineage.validEventIds.has(event.event_id)
      || !event.metadata_present
      || !event.envelope_ref_in_trace_rounds
      || !event.envelope_ref_matches_identity
      || event.result_id !== first.tool_result_id
      || event.result_artifact_ref !== first.artifact_ref
      || !event.result_artifact_ref_file_present
      || event.tool !== first.tool
      || event.ok !== first.ok
      || event.side_effect_level !== first.side_effect_level
      || event.is_write_run !== first.is_write_run
      || event.ok !== true) continue;
    for (const item of items) {
      validRefs.add(item.ref);
      validEvidenceByRef.set(item.ref, {
        eventId: event.event_id,
        round: event.round,
        isWriteRun: event.is_write_run === true
      });
    }
  }
  return { validRefs, validEvidenceByRef, legacyEventMetadataRefs };
}

function toolActionLineage(trace: LiveRunTraceSummary): ToolActionLineage {
  const expectations = new Map<string, { tool: string }>();
  for (const round of trace.rounds) {
    for (const action of round.tool_action_expectations) {
      const key = toolActionKey(round.envelope_ref, round.round, action.action_id, action.sequence);
      expectations.set(key, { tool: action.tool });
    }
  }
  const legacyEventIds = new Set<string>();
  const partialEventIds = new Set<string>();
  const mismatchedEventIds = new Set<string>();
  const eventsByAction = new Map<string, LiveRunToolResultEventSummary[]>();
  for (const event of trace.tool_result_events) {
    if (event.action_lineage_partial) {
      partialEventIds.add(event.event_id);
      continue;
    }
    if (!event.action_lineage_present) {
      legacyEventIds.add(event.event_id);
      continue;
    }
    const key = toolActionKey(
      event.reported_envelope_ref!,
      event.reported_round!,
      event.action_id!,
      event.sequence!
    );
    const expected = expectations.get(key);
    if (event.reported_envelope_ref !== event.envelope_ref
      || event.reported_round !== event.round
      || expected === undefined
      || expected.tool !== event.tool) {
      mismatchedEventIds.add(event.event_id);
      continue;
    }
    eventsByAction.set(key, [...(eventsByAction.get(key) ?? []), event]);
  }
  const duplicateEventIds = new Set([...eventsByAction.values()]
    .filter((events) => events.length > 1)
    .flatMap((events) => events.map((event) => event.event_id)));
  const validEventIds = new Set([...eventsByAction.values()]
    .flatMap((events) => events)
    .filter((event) => !duplicateEventIds.has(event.event_id))
    .map((event) => event.event_id));
  return {
    validEventIds,
    legacyEventIds,
    partialEventIds,
    mismatchedEventIds,
    duplicateEventIds
  };
}

function toolActionKey(envelopeRef: string, round: number, actionId: string, sequence: number): string {
  return JSON.stringify([envelopeRef, round, actionId, sequence]);
}

function delegatedInputLineage(trace: LiveRunTraceSummary): DelegatedInputLineage {
  const declaredInputMetadataKeys = new Set(trace.rounds.flatMap((round) =>
    round.delegated_action_ids.map((actionId) => delegatedInputMetadataKey(
      round.round,
      actionId,
      round.delegated_action_sequence_by_id[actionId]!
    ))
  ));
  const inputMetadataEntries = trace.rounds.flatMap((round) =>
    round.delegated_action_inputs.map((input) => ({ round, input }))
  );
  const inputMetadataCounts = new Map<string, number>();
  for (const { round, input } of inputMetadataEntries) {
    const key = delegatedInputMetadataKey(round.round, input.action_id, input.sequence);
    inputMetadataCounts.set(key, (inputMetadataCounts.get(key) ?? 0) + 1);
  }
  const duplicateInputMetadataKeys = [...inputMetadataCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  const unexpectedInputMetadataKeys = [...inputMetadataCounts.keys()]
    .filter((key) => !declaredInputMetadataKeys.has(key));
  const metadataIssueKeys = new Set([...duplicateInputMetadataKeys, ...unexpectedInputMetadataKeys]);
  const metadataIssueEnvelopeRefs = unique(trace.rounds
    .filter((round) => round.delegated_action_inputs.some((input) =>
      metadataIssueKeys.has(delegatedInputMetadataKey(round.round, input.action_id, input.sequence))
    ))
    .map((round) => round.envelope_ref));
  const expectedByRoundAndSequence = new Map(trace.rounds.flatMap((round) =>
    round.delegated_action_inputs.map((input) => [delegatedInputKey(round.round, input.sequence), input] as const)
  ));
  const missingInputMetadata = trace.delegated_dispatches.filter((dispatch) =>
    !dispatch.metadata_present || !dispatch.input_contract_valid_present || !dispatch.input_digest_present
  );
  const missingExpectedInput = trace.delegated_dispatches.filter((dispatch) =>
    !missingInputMetadata.includes(dispatch)
      && !expectedByRoundAndSequence.has(delegatedInputKey(dispatch.round, dispatch.sequence))
  );
  const mismatchedInputActionIds = trace.delegated_dispatches.filter((dispatch) => {
    const expected = expectedByRoundAndSequence.get(delegatedInputKey(dispatch.round, dispatch.sequence));
    return expected !== undefined && dispatch.action_id !== expected.action_id;
  });
  const mismatchedInputValidity = trace.delegated_dispatches.filter((dispatch) => {
    const expected = expectedByRoundAndSequence.get(delegatedInputKey(dispatch.round, dispatch.sequence));
    return expected !== undefined
      && dispatch.input_contract_valid_present
      && dispatch.input_contract_valid !== expected.input_contract_valid;
  });
  const mismatchedInputTaskChars = trace.delegated_dispatches.filter((dispatch) => {
    const expected = expectedByRoundAndSequence.get(delegatedInputKey(dispatch.round, dispatch.sequence));
    return expected !== undefined && dispatch.task_chars !== expected.task_chars;
  });
  const mismatchedInputContextChars = trace.delegated_dispatches.filter((dispatch) => {
    const expected = expectedByRoundAndSequence.get(delegatedInputKey(dispatch.round, dispatch.sequence));
    return expected !== undefined && dispatch.context_chars !== expected.context_chars;
  });
  const mismatchedInputDigests = trace.delegated_dispatches.filter((dispatch) => {
    const expected = expectedByRoundAndSequence.get(delegatedInputKey(dispatch.round, dispatch.sequence));
    return expected !== undefined
      && dispatch.input_digest_present
      && dispatch.input_digest !== expected.input_digest;
  });
  const invalidInputOutcomeMismatches = trace.delegated_dispatches.filter((dispatch) => {
    const expected = expectedByRoundAndSequence.get(delegatedInputKey(dispatch.round, dispatch.sequence));
    const expectedFailureKind = dispatch.sequence > DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND
      ? "dispatch_limit_exceeded"
      : "input_contract_failed";
    return expected?.input_contract_valid === false
      && (dispatch.model_invoked !== false
        || dispatch.ok !== false
        || dispatch.contract_status !== "failed"
        || dispatch.dispatch_failure_kind !== expectedFailureKind
        || dispatch.result_failure_kind !== expectedFailureKind);
  });
  return {
    missingInputMetadata,
    missingExpectedInput,
    duplicateInputMetadataKeys,
    unexpectedInputMetadataKeys,
    metadataIssueEnvelopeRefs,
    mismatchedInputActionIds,
    mismatchedInputValidity,
    mismatchedInputTaskChars,
    mismatchedInputContextChars,
    mismatchedInputDigests,
    invalidInputOutcomeMismatches,
    inputMetadataComplete: missingInputMetadata.length === 0
      && missingExpectedInput.length === 0
      && duplicateInputMetadataKeys.length === 0
      && unexpectedInputMetadataKeys.length === 0
      && mismatchedInputActionIds.length === 0
      && mismatchedInputValidity.length === 0
      && mismatchedInputTaskChars.length === 0
      && mismatchedInputContextChars.length === 0
      && mismatchedInputDigests.length === 0
      && invalidInputOutcomeMismatches.length === 0
  };
}

function delegatedInputKey(round: number, sequence: number): string {
  return `${round}:${sequence}`;
}

function delegatedInputMetadataKey(round: number, actionId: string, sequence: number): string {
  return `${round}:${actionId}:${sequence}`;
}

function delegatedEvidenceTruth(trace: LiveRunTraceSummary) {
  const dispatchMetadataComplete = trace.delegated_dispatches.length === trace.delegated_result_count;
  const delegatedResultIds = trace.delegated_dispatches
    .map((dispatch) => dispatch.result_id)
    .filter((resultId): resultId is string => resultId !== null);
  const delegatedResultRefs = trace.delegated_dispatches
    .map((dispatch) => dispatch.result_ref)
    .filter((resultRef) => resultRef.length > 0);
  const duplicateDelegatedResultIdCount = delegatedResultIds.length - new Set(delegatedResultIds).size;
  const duplicateDelegatedResultRefCount = delegatedResultRefs.length - new Set(delegatedResultRefs).size;
  const resultRefsBoundToEvents = trace.delegated_dispatches.every((dispatch) =>
    dispatch.result_ref_in_event_artifacts
      && dispatch.result_ref_file_present
      && dispatch.result_ref_matches_result_identity
  );
  const inputLineage = delegatedInputLineage(trace);
  const delegatedIdentityRefs = new Set([...delegatedResultIds, ...delegatedResultRefs]);
  const claimMetadataComplete = trace.envelope_claimed_verification_refs_present;
  const authoritativeClaimRefs = claimMetadataComplete
    ? trace.envelope_claimed_verification_refs
    : [];
  const claimedRefs = new Set(authoritativeClaimRefs);
  const reportedClaimRefs = new Set(trace.claimed_verification_refs);
  const claimRefsMatch = claimMetadataComplete
    && claimedRefs.size === reportedClaimRefs.size
    && [...claimedRefs].every((ref) => reportedClaimRefs.has(ref));
  const claimedDelegatedIdentityRefs = authoritativeClaimRefs
    .filter((ref) => delegatedIdentityRefs.has(ref));
  const delegatedIdentityMetadataComplete = dispatchMetadataComplete
    && delegatedResultIds.length === trace.delegated_dispatches.length
    && delegatedResultRefs.length === trace.delegated_dispatches.length
    && duplicateDelegatedResultIdCount === 0
    && duplicateDelegatedResultRefCount === 0
    && resultRefsBoundToEvents
    && inputLineage.inputMetadataComplete;
  const nonDelegatedClaimedRefs = authoritativeClaimRefs
    .filter((ref) => !delegatedIdentityRefs.has(ref));
  const evidenceBinding = verificationEvidenceBinding(trace);
  const boundClaimedRefs = nonDelegatedClaimedRefs
    .filter((ref) => evidenceBinding.validRefs.has(ref));
  const unboundClaimedRefs = nonDelegatedClaimedRefs
    .filter((ref) => !evidenceBinding.validRefs.has(ref));
  const legacyEventMetadataClaimedRefs = unboundClaimedRefs
    .filter((ref) => evidenceBinding.legacyEventMetadataRefs.has(ref));
  const definitivelyUnboundClaimedRefs = unboundClaimedRefs
    .filter((ref) => !evidenceBinding.legacyEventMetadataRefs.has(ref));
  const latestDelegatedRound = trace.delegated_dispatches.length > 0
    ? Math.max(...trace.delegated_dispatches.map((dispatch) => dispatch.round))
    : null;
  const failedDelegatedDispatches = trace.delegated_dispatches.filter((dispatch) => !dispatch.ok);
  const latestFailedDelegationRound = failedDelegatedDispatches.length > 0
    ? Math.max(...failedDelegatedDispatches.map((dispatch) => dispatch.round))
    : null;
  const postDelegationBoundRefs = latestDelegatedRound === null
    ? []
    : boundClaimedRefs.filter((ref) =>
      (evidenceBinding.validEvidenceByRef.get(ref)?.round ?? 0) > latestDelegatedRound
    );
  const postFailedDelegationVerificationRefs = latestFailedDelegationRound === null
    ? []
    : boundClaimedRefs.filter((ref) =>
      (evidenceBinding.validEvidenceByRef.get(ref)?.round ?? 0) > latestFailedDelegationRound
    );
  const postFailedDelegationRecoveryRefs = postFailedDelegationVerificationRefs.filter((ref) =>
    evidenceBinding.validEvidenceByRef.get(ref)?.isWriteRun === true
  );
  const legacyPostDelegationRefs = latestDelegatedRound === null
    ? []
    : legacyEventMetadataClaimedRefs.filter((ref) =>
      trace.verification_evidence_refs.some((item) => item.ref === ref && item.round > latestDelegatedRound)
    );
  const legacyPostFailedDelegationRefs = latestFailedDelegationRound === null
    ? []
    : legacyEventMetadataClaimedRefs.filter((ref) =>
      trace.verification_evidence_refs.some((item) => item.ref === ref && item.round > latestFailedDelegationRound)
    );
  return {
    boundClaimedRefs,
    authoritativeClaimRefs,
    claimMetadataComplete,
    claimRefsMatch,
    claimedDelegatedIdentityRefs,
    claimedRefs,
    delegatedIdentityMetadataComplete,
    delegatedIdentityRefs,
    delegatedResultIds,
    delegatedResultRefs,
    definitivelyUnboundClaimedRefs,
    dispatchMetadataComplete,
    duplicateDelegatedResultIdCount,
    duplicateDelegatedResultRefCount,
    resultRefsBoundToEvents,
    evidenceBinding,
    failedDelegatedDispatches,
    inputLineage,
    latestDelegatedRound,
    latestFailedDelegationRound,
    legacyEventMetadataClaimedRefs,
    legacyPostDelegationRefs,
    legacyPostFailedDelegationRefs,
    nonDelegatedClaimedRefs,
    postDelegationBoundRefs,
    postFailedDelegationRecoveryRefs,
    postFailedDelegationVerificationRefs,
    unboundClaimedRefs
  };
}

function delegatedCompletionGateCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const claimedRefsBoundCheckId = delegateAgentCompletionGateCheckId.claimedRefsBoundToEvidence;
  const delegatedIndependentCheckId = delegateAgentCompletionGateCheckId.delegatedIndependentEvidence;
  const delegatedFailedCheckIds = trace.completion_failed_check_ids.filter((id) =>
    DELEGATED_COMPLETION_GATE_CHECK_IDS.has(id)
      && id !== claimedRefsBoundCheckId
      && id !== delegatedIndependentCheckId
  );
  const delegatedWarningCheckIds = trace.completion_warning_check_ids.filter((id) =>
    DELEGATED_COMPLETION_GATE_CHECK_IDS.has(id)
      && id !== claimedRefsBoundCheckId
      && id !== delegatedIndependentCheckId
  );
  const reportedClaimedRefsBoundChecks = trace.delegated_completion_gate_checks
    .filter((check) => check.id === claimedRefsBoundCheckId);
  const reportedClaimedRefsBoundStatus = reportedClaimedRefsBoundChecks[0]?.status;
  const reportedDelegatedIndependentChecks = trace.delegated_completion_gate_checks
    .filter((check) => check.id === delegatedIndependentCheckId);
  const reportedDelegatedIndependentStatus = reportedDelegatedIndependentChecks[0]?.status;
  const reportedDelegatedResultsChecks = trace.delegated_completion_gate_checks
    .filter((check) => check.id === delegateAgentCompletionGateCheckId.delegatedResults);
  const reportedDelegatedResultsCheck = reportedDelegatedResultsChecks[0];
  const reportedDelegatedResultsStatus = reportedDelegatedResultsCheck?.status;
  const reportedDelegatedSelfReportChecks = trace.delegated_completion_gate_checks
    .filter((check) => check.id === delegateAgentCompletionGateCheckId.delegatedSelfReportRefs);
  const reportedDelegatedSelfReportStatus = reportedDelegatedSelfReportChecks[0]?.status;
  const evidenceTruth = delegatedEvidenceTruth(trace);
  const {
    authoritativeClaimRefs,
    boundClaimedRefs,
    claimMetadataComplete,
    claimRefsMatch,
    claimedDelegatedIdentityRefs,
    delegatedIdentityMetadataComplete,
    delegatedResultIds,
    definitivelyUnboundClaimedRefs,
    dispatchMetadataComplete,
    duplicateDelegatedResultIdCount,
    duplicateDelegatedResultRefCount,
    resultRefsBoundToEvents,
    evidenceBinding,
    failedDelegatedDispatches,
    inputLineage,
    legacyEventMetadataClaimedRefs,
    legacyPostDelegationRefs,
    legacyPostFailedDelegationRefs,
    nonDelegatedClaimedRefs,
    postDelegationBoundRefs: modernPostDelegationRefs,
    postFailedDelegationRecoveryRefs: modernPostFailedDelegationRecoveryRefs,
    postFailedDelegationVerificationRefs: modernPostFailedDelegationVerificationRefs,
    unboundClaimedRefs
  } = evidenceTruth;
  const claimRefsMismatch = claimMetadataComplete && !claimRefsMatch;
  const envelopeRefMismatch = claimMetadataComplete && !trace.reported_envelope_ref_matches_final;
  const recoveryEvidenceCount = new Set(modernPostFailedDelegationRecoveryRefs.map((ref) =>
    evidenceBinding.validEvidenceByRef.get(ref)?.eventId
  ).filter((eventId): eventId is string => typeof eventId === "string")).size;
  const authoritativeCompletionStatus = trace.final_completion_status;
  const completionStatusKnown = authoritativeCompletionStatus !== null;
  const doneGateApplicable = authoritativeCompletionStatus === "done";
  const missingDelegatedResultsGateIds = delegatedResultIds
    .filter((resultId) => !reportedDelegatedResultsCheck?.refs.includes(resultId));
  const claimedRefsBoundGateApplicable = doneGateApplicable;
  let expectedClaimedRefsBoundStatus: LiveRunCompletionCheckSummary["status"] | "unknown" = "skipped";
  if (!completionStatusKnown && (trace.delegated_result_count > 0 || reportedClaimedRefsBoundChecks.length > 0)) {
    expectedClaimedRefsBoundStatus = "unknown";
  } else if (claimedRefsBoundGateApplicable) {
    if (!claimMetadataComplete) {
      expectedClaimedRefsBoundStatus = "unknown";
    } else if (!delegatedIdentityMetadataComplete && authoritativeClaimRefs.length > 0) {
      expectedClaimedRefsBoundStatus = "unknown";
    } else if (nonDelegatedClaimedRefs.length === 0) {
      expectedClaimedRefsBoundStatus = "skipped";
    } else if (!trace.verification_evidence_refs_present) {
      expectedClaimedRefsBoundStatus = "unknown";
    } else if (definitivelyUnboundClaimedRefs.length > 0) {
      expectedClaimedRefsBoundStatus = "fail";
    } else if (legacyEventMetadataClaimedRefs.length > 0) {
      expectedClaimedRefsBoundStatus = "unknown";
    } else {
      expectedClaimedRefsBoundStatus = "pass";
    }
  }
  const claimedRefsBoundCheckCardinalityMatches = claimedRefsBoundGateApplicable
    ? reportedClaimedRefsBoundChecks.length === 1
    : reportedClaimedRefsBoundChecks.length === 0;
  const claimedRefsBoundStatusMatches = claimedRefsBoundCheckCardinalityMatches
    && (!claimedRefsBoundGateApplicable
      || reportedClaimedRefsBoundStatus === expectedClaimedRefsBoundStatus);
  const delegatedIndependentGateApplicable = doneGateApplicable;
  let expectedDelegatedIndependentStatus: LiveRunCompletionCheckSummary["status"] | "unknown" = "skipped";
  if (!completionStatusKnown && trace.delegated_result_count > 0) {
    expectedDelegatedIndependentStatus = "unknown";
  } else if (delegatedIndependentGateApplicable && trace.delegated_result_count > 0) {
    const hasFailedDelegation = failedDelegatedDispatches.length > 0;
    const hasModernPostDelegationEvidence = modernPostDelegationRefs.length > 0;
    const hasModernFailedDelegationVerification = modernPostFailedDelegationVerificationRefs.length > 0;
    const hasModernFailedDelegationRecovery = modernPostFailedDelegationRecoveryRefs.length > 0;
    const hasLegacyPostDelegationEvidence = legacyPostDelegationRefs.length > 0;
    const hasLegacyPostFailedDelegationEvidence = legacyPostFailedDelegationRefs.length > 0;
    const modernEvidencePasses = hasModernPostDelegationEvidence
      && (!hasFailedDelegation
        || (hasModernFailedDelegationVerification && hasModernFailedDelegationRecovery));
    const legacyEvidenceCouldSatisfy = (!hasModernPostDelegationEvidence
      && hasLegacyPostDelegationEvidence)
      || (hasFailedDelegation
        && (!hasModernFailedDelegationVerification || !hasModernFailedDelegationRecovery)
        && hasLegacyPostFailedDelegationEvidence);
    if (!claimMetadataComplete || !delegatedIdentityMetadataComplete) {
      expectedDelegatedIndependentStatus = "unknown";
    } else if (modernEvidencePasses) {
      expectedDelegatedIndependentStatus = "pass";
    } else if ((!trace.verification_evidence_refs_present && nonDelegatedClaimedRefs.length > 0)
      || legacyEvidenceCouldSatisfy) {
      expectedDelegatedIndependentStatus = "unknown";
    } else {
      expectedDelegatedIndependentStatus = "fail";
    }
  }
  const delegatedIndependentCheckCardinalityMatches = delegatedIndependentGateApplicable
    ? reportedDelegatedIndependentChecks.length === 1
    : reportedDelegatedIndependentChecks.length === 0;
  const delegatedIndependentStatusMatches = delegatedIndependentCheckCardinalityMatches
    && (!delegatedIndependentGateApplicable
      || reportedDelegatedIndependentStatus === expectedDelegatedIndependentStatus);
  const delegatedSelfReportGateApplicable = doneGateApplicable;
  const delegatedResultsCheckCardinalityMatches = completionStatusKnown
    && reportedDelegatedResultsChecks.length === 1;
  const delegatedSelfReportCheckCardinalityMatches = completionStatusKnown
    && reportedDelegatedSelfReportChecks.length === (delegatedSelfReportGateApplicable ? 1 : 0);
  let expectedDelegatedResultsStatus: LiveRunCompletionCheckSummary["status"] | "unknown" = "skipped";
  if (!completionStatusKnown && trace.delegated_result_count > 0) {
    expectedDelegatedResultsStatus = "unknown";
  } else if (!dispatchMetadataComplete) {
    expectedDelegatedResultsStatus = "unknown";
  } else if (failedDelegatedDispatches.length > 0) {
    expectedDelegatedResultsStatus = doneGateApplicable && recoveryEvidenceCount === 0
      ? "fail"
      : "warning";
  } else if (trace.delegated_result_count > 0) {
    expectedDelegatedResultsStatus = "pass";
  }
  let expectedDelegatedSelfReportStatus: LiveRunCompletionCheckSummary["status"] | "unknown" = "skipped";
  if (!completionStatusKnown && trace.delegated_result_count > 0) {
    expectedDelegatedSelfReportStatus = "unknown";
  } else if (delegatedSelfReportGateApplicable && trace.delegated_result_count > 0) {
    if (claimedDelegatedIdentityRefs.length > 0) {
      expectedDelegatedSelfReportStatus = "fail";
    } else if (!claimMetadataComplete || !delegatedIdentityMetadataComplete) {
      expectedDelegatedSelfReportStatus = "unknown";
    } else {
      expectedDelegatedSelfReportStatus = "pass";
    }
  }
  const delegatedResultsStatusMatches = delegatedResultsCheckCardinalityMatches
    && reportedDelegatedResultsStatus === expectedDelegatedResultsStatus;
  const delegatedSelfReportStatusMatches = delegatedSelfReportCheckCardinalityMatches
    && (!delegatedSelfReportGateApplicable
      || reportedDelegatedSelfReportStatus === expectedDelegatedSelfReportStatus);
  let status: HarnessReplayAuditCheckStatus = "pass";
  if (((claimRefsMismatch || envelopeRefMismatch) && trace.verified)
    || delegatedFailedCheckIds.length > 0
    || expectedDelegatedResultsStatus === "fail"
    || expectedDelegatedSelfReportStatus === "fail"
    || expectedClaimedRefsBoundStatus === "fail"
    || expectedDelegatedIndependentStatus === "fail") {
    status = "fail";
  } else if (expectedDelegatedResultsStatus === "warning" && reportedDelegatedResultsStatus === "pass") {
    status = "fail";
  } else if (claimRefsMismatch
    || envelopeRefMismatch
    || delegatedWarningCheckIds.length > 0
    || !delegatedResultsStatusMatches
    || !delegatedSelfReportStatusMatches
    || !claimedRefsBoundStatusMatches
    || !delegatedIndependentStatusMatches
    || missingDelegatedResultsGateIds.length > 0
    || expectedDelegatedSelfReportStatus === "unknown"
    || expectedClaimedRefsBoundStatus === "unknown"
    || expectedDelegatedIndependentStatus === "unknown") {
    status = "warning";
  }
  return {
    id: "delegated_completion_gate",
    status,
    summary: [
      `failed_checks=${delegatedFailedCheckIds.join(",") || "none"}`,
      `warning_checks=${delegatedWarningCheckIds.join(",") || "none"}`,
      `delegated_results_status=${reportedDelegatedResultsStatus ?? "missing"}`,
      `expected_delegated_results_status=${expectedDelegatedResultsStatus}`,
      `delegated_results_check_count=${reportedDelegatedResultsChecks.length}`,
      `expected_delegated_results_check_count=${completionStatusKnown ? 1 : "unknown"}`,
      `delegated_results_check_cardinality_match=${delegatedResultsCheckCardinalityMatches}`,
      `completion_status_authority=${authoritativeCompletionStatus ?? "unknown"}`,
      `completion_status_known=${completionStatusKnown}`,
      `delegated_self_report_status=${reportedDelegatedSelfReportStatus ?? "missing"}`,
      `expected_delegated_self_report_status=${expectedDelegatedSelfReportStatus}`,
      `delegated_self_report_gate_applicable=${delegatedSelfReportGateApplicable}`,
      `delegated_self_report_check_count=${reportedDelegatedSelfReportChecks.length}`,
      `expected_delegated_self_report_check_count=${completionStatusKnown ? (delegatedSelfReportGateApplicable ? 1 : 0) : "unknown"}`,
      `delegated_self_report_check_cardinality_match=${delegatedSelfReportCheckCardinalityMatches}`,
      `claimed_refs_bound_status=${reportedClaimedRefsBoundStatus ?? "missing"}`,
      `expected_claimed_refs_bound_status=${expectedClaimedRefsBoundStatus}`,
      `claimed_refs_bound_gate_applicable=${claimedRefsBoundGateApplicable}`,
      `claimed_refs_bound_check_count=${reportedClaimedRefsBoundChecks.length}`,
      `expected_claimed_refs_bound_check_count=${completionStatusKnown ? (claimedRefsBoundGateApplicable ? 1 : 0) : "unknown"}`,
      `claimed_refs_bound_check_cardinality_match=${claimedRefsBoundCheckCardinalityMatches}`,
      `verification_evidence_refs_present=${trace.verification_evidence_refs_present}`,
      `envelope_claimed_verification_refs_present=${claimMetadataComplete}`,
      `reported_envelope_ref_matches_final=${trace.reported_envelope_ref_matches_final}`,
      `envelope_claimed_verification_refs=${authoritativeClaimRefs.length}`,
      `report_claimed_verification_refs=${trace.claimed_verification_refs.length}`,
      `claimed_verification_refs_match=${claimRefsMatch}`,
      `claimed_verification_refs_mismatch=${claimRefsMismatch}`,
      `non_delegated_claimed_refs=${nonDelegatedClaimedRefs.length}`,
      `bound_claimed_refs=${boundClaimedRefs.length}`,
      `unbound_claimed_refs=${unboundClaimedRefs.length}`,
      `legacy_tool_result_metadata_claimed_refs=${legacyEventMetadataClaimedRefs.length}`,
      `dispatch_metadata_complete=${dispatchMetadataComplete}`,
      `delegated_identity_metadata_complete=${delegatedIdentityMetadataComplete}`,
      `delegated_result_refs_bound_to_events=${resultRefsBoundToEvents}`,
      `delegated_input_metadata_complete=${inputLineage.inputMetadataComplete}`,
      `missing_delegated_input_metadata=${inputLineage.missingInputMetadata.length}`,
      `missing_delegated_input_expectation=${inputLineage.missingExpectedInput.length}`,
      `duplicate_delegated_input_metadata=${inputLineage.duplicateInputMetadataKeys.length}`,
      `unexpected_delegated_input_metadata=${inputLineage.unexpectedInputMetadataKeys.length}`,
      `mismatched_delegated_input_action_id=${inputLineage.mismatchedInputActionIds.length}`,
      `mismatched_delegated_input_validity=${inputLineage.mismatchedInputValidity.length}`,
      `mismatched_delegated_input_task_chars=${inputLineage.mismatchedInputTaskChars.length}`,
      `mismatched_delegated_input_context_chars=${inputLineage.mismatchedInputContextChars.length}`,
      `mismatched_delegated_input_digest=${inputLineage.mismatchedInputDigests.length}`,
      `invalid_delegated_input_outcome_mismatch=${inputLineage.invalidInputOutcomeMismatches.length}`,
      `duplicate_delegated_result_ids=${duplicateDelegatedResultIdCount}`,
      `duplicate_delegated_result_refs=${duplicateDelegatedResultRefCount}`,
      `missing_delegated_results_gate_ids=${missingDelegatedResultsGateIds.length}`,
      `claimed_delegated_identity_refs=${claimedDelegatedIdentityRefs.length}`,
      `failed_delegated_dispatches=${failedDelegatedDispatches.length}`,
      `recovery_evidence=${recoveryEvidenceCount}`,
      `status_match=${delegatedResultsStatusMatches}`,
      `delegated_self_report_status_match=${delegatedSelfReportStatusMatches}`,
      `claimed_refs_bound_status_match=${claimedRefsBoundStatusMatches}`,
      `delegated_independent_status=${reportedDelegatedIndependentStatus ?? "missing"}`,
      `expected_delegated_independent_status=${expectedDelegatedIndependentStatus}`,
      `delegated_independent_gate_applicable=${delegatedIndependentGateApplicable}`,
      `delegated_independent_check_count=${reportedDelegatedIndependentChecks.length}`,
      `expected_delegated_independent_check_count=${completionStatusKnown ? (delegatedIndependentGateApplicable ? 1 : 0) : "unknown"}`,
      `delegated_independent_check_cardinality_match=${delegatedIndependentCheckCardinalityMatches}`,
      `post_delegation_bound_refs=${modernPostDelegationRefs.length}`,
      `post_failed_delegation_verification_refs=${modernPostFailedDelegationVerificationRefs.length}`,
      `post_failed_delegation_recovery_refs=${modernPostFailedDelegationRecoveryRefs.length}`,
      `legacy_post_delegation_refs=${legacyPostDelegationRefs.length}`,
      `legacy_post_failed_delegation_refs=${legacyPostFailedDelegationRefs.length}`,
      `delegated_independent_status_match=${delegatedIndependentStatusMatches}`
    ].join("; "),
    refs: [trace.report_ref]
  };
}

function verificationEvidenceLineageCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const evidenceTruth = delegatedEvidenceTruth(trace);
  const evidenceRefs = new Set(trace.verification_evidence_refs.map((item) => item.ref));
  const claimedRefs = evidenceTruth.claimedRefs;
  const delegatedResultIds = new Set(evidenceTruth.delegatedResultIds);
  const delegatedDispatchRefs = new Set(evidenceTruth.delegatedResultRefs);
  const delegatedRefs = evidenceTruth.delegatedIdentityRefs;
  const delegatedReportRefs = new Set(trace.delegated_result_report_refs);
  const delegatedEventFallbackRefs = new Set(trace.delegated_result_event_fallback_refs);
  const reportedClaimRefs = new Set(trace.claimed_verification_refs);
  const claimedEvidenceRefs = trace.verification_evidence_refs.filter((item) => claimedRefs.has(item.ref));
  const reportedClaimedEvidenceRefs = trace.verification_evidence_refs.filter((item) => item.claimed);
  const topLevelClaimRefMismatches = evidenceTruth.claimMetadataComplete
    ? unique([
      ...evidenceTruth.authoritativeClaimRefs.filter((ref) => !reportedClaimRefs.has(ref)),
      ...trace.claimed_verification_refs.filter((ref) => !claimedRefs.has(ref))
    ])
    : [];
  const sourceRefMismatchRefs = trace.verification_evidence_refs.filter((item) =>
    item.ref !== (item.source === "tool_result" ? item.tool_result_id : item.artifact_ref)
  );
  const evidencePairs = new Map<string, typeof trace.verification_evidence_refs>();
  for (const item of trace.verification_evidence_refs) {
    const key = JSON.stringify([item.tool_result_id, item.artifact_ref]);
    evidencePairs.set(key, [...(evidencePairs.get(key) ?? []), item]);
  }
  const evidencePairGroups = [...evidencePairs.values()];
  const evidencePairCardinalityMismatchRefs = evidencePairGroups.filter((items) =>
    items.length !== 2
    || items.filter((item) => item.source === "tool_result").length !== 1
    || items.filter((item) => item.source === "tool_artifact").length !== 1
  );
  const evidencePairMetadataMismatchRefs = evidencePairGroups.filter((items) => {
    if (items.length !== 2 || new Set(items.map((item) => item.source)).size !== 2) return false;
    const first = items[0]!;
    const second = items[1]!;
    return first.event_id !== second.event_id
      || first.round !== second.round
      || first.tool !== second.tool
      || first.ok !== second.ok
      || first.side_effect_level !== second.side_effect_level
      || first.is_write_run !== second.is_write_run
      || first.after_latest_delegation !== second.after_latest_delegation
      || first.after_latest_failed_delegation !== second.after_latest_failed_delegation;
  });
  const toolResultEventsById = new Map<string, typeof trace.tool_result_events>();
  for (const event of trace.tool_result_events) {
    toolResultEventsById.set(event.event_id, [...(toolResultEventsById.get(event.event_id) ?? []), event]);
  }
  const actionLineage = toolActionLineage(trace);
  const legacyToolResultActionLineagePairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1 && actionLineage.legacyEventIds.has(events[0]!.event_id);
  });
  const partialToolResultActionLineagePairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1 && actionLineage.partialEventIds.has(events[0]!.event_id);
  });
  const mismatchedToolResultActionLineagePairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1 && actionLineage.mismatchedEventIds.has(events[0]!.event_id);
  });
  const duplicateToolResultActionLineagePairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1 && actionLineage.duplicateEventIds.has(events[0]!.event_id);
  });
  const missingToolResultEventBindingPairs = evidencePairGroups.filter((items) =>
    !toolResultEventsById.has(items[0]!.event_id)
  );
  const ambiguousToolResultEventBindingPairs = evidencePairGroups.filter((items) =>
    (toolResultEventsById.get(items[0]!.event_id)?.length ?? 0) > 1
  );
  const mismatchedToolResultEventArtifactPairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1 && !events[0]!.artifact_refs.includes(items[0]!.artifact_ref);
  });
  const missingToolResultEventArtifactFilePairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1
      && events[0]!.metadata_present
      && !events[0]!.result_artifact_ref_file_present;
  });
  const mismatchedToolResultEventArtifactIdentityPairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1
      && events[0]!.metadata_present
      && events[0]!.result_artifact_ref !== items[0]!.artifact_ref;
  });
  const mismatchedToolResultEventRoundPairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1 && events[0]!.round !== items[0]!.round;
  });
  const missingToolResultEventEnvelopeBindingPairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1
      && events[0]!.metadata_present
      && !events[0]!.envelope_ref_in_trace_rounds;
  });
  const mismatchedToolResultEventEnvelopeIdentityPairs = evidencePairGroups.filter((items) => {
    const events = toolResultEventsById.get(items[0]!.event_id);
    return events?.length === 1
      && events[0]!.metadata_present
      && !events[0]!.envelope_ref_matches_identity;
  });
  const latestDelegatedRound = evidenceTruth.latestDelegatedRound;
  const latestFailedDelegatedRound = evidenceTruth.latestFailedDelegationRound;
  const afterLatestDelegationMismatchRefs = trace.verification_evidence_refs.filter((item) =>
    item.after_latest_delegation !== (latestDelegatedRound === null || item.round > latestDelegatedRound)
  );
  const afterLatestFailedDelegationMismatchRefs = trace.verification_evidence_refs.filter((item) =>
    item.after_latest_failed_delegation !== (latestFailedDelegatedRound === null || item.round > latestFailedDelegatedRound)
  );
  const claimedFlagMismatchRefs = evidenceTruth.claimMetadataComplete
    ? trace.verification_evidence_refs.filter((item) => item.claimed !== claimedRefs.has(item.ref))
    : [];
  const claimedDelegatedRefs = evidenceTruth.authoritativeClaimRefs
    .filter((ref) => delegatedRefs.has(ref));
  const claimedDelegatedResultIds = claimedDelegatedRefs.filter((ref) => delegatedResultIds.has(ref));
  const claimedDelegatedReportRefs = claimedDelegatedRefs.filter((ref) => delegatedReportRefs.has(ref));
  const claimedDelegatedEventFallbackRefs = claimedDelegatedRefs.filter((ref) => delegatedEventFallbackRefs.has(ref));
  const verificationEvidenceLineageUnknown = !trace.verification_evidence_refs_present
    && evidenceTruth.authoritativeClaimRefs.some((ref) => !delegatedRefs.has(ref));
  const missingClaimedLineage = trace.verification_evidence_refs_present
    ? evidenceTruth.authoritativeClaimRefs.filter((ref) =>
      !delegatedRefs.has(ref) && !evidenceRefs.has(ref)
    )
    : [];
  const expectedIndependentMarkerRefs = new Set(evidenceTruth.boundClaimedRefs.filter((ref) =>
    latestDelegatedRound === null
      || (evidenceTruth.evidenceBinding.validEvidenceByRef.get(ref)?.round ?? 0) > latestDelegatedRound
  ));
  const expectedRecoveryMarkerRefs = new Set(evidenceTruth.postFailedDelegationRecoveryRefs);
  const legacyIndependentMarkerRefs = new Set(evidenceTruth.legacyEventMetadataClaimedRefs.filter((ref) =>
    latestDelegatedRound === null
      || trace.verification_evidence_refs.some((item) => item.ref === ref && item.round > latestDelegatedRound)
  ));
  const legacyRecoveryMarkerRefs = new Set(evidenceTruth.legacyEventMetadataClaimedRefs.filter((ref) =>
    latestFailedDelegatedRound !== null
      && trace.verification_evidence_refs.some((item) =>
        item.ref === ref && item.is_write_run && item.round > latestFailedDelegatedRound
      )
  ));
  const reportedIndependentMarkerRefs = trace.verification_evidence_refs
    .filter((item) => item.counts_as_independent_evidence);
  const reportedRecoveryMarkerRefs = trace.verification_evidence_refs
    .filter((item) => item.counts_as_failed_delegation_recovery);
  const invalidIndependentLineageRefs = reportedIndependentMarkerRefs.filter((item) =>
    !expectedIndependentMarkerRefs.has(item.ref) && !legacyIndependentMarkerRefs.has(item.ref)
  );
  const invalidRecoveryLineageRefs = reportedRecoveryMarkerRefs.filter((item) =>
    !expectedRecoveryMarkerRefs.has(item.ref) && !legacyRecoveryMarkerRefs.has(item.ref)
  );
  const missingIndependentMarkerRefs = [...expectedIndependentMarkerRefs].filter((ref) =>
    !reportedIndependentMarkerRefs.some((item) => item.ref === ref)
  );
  const missingRecoveryMarkerRefs = [...expectedRecoveryMarkerRefs].filter((ref) =>
    !reportedRecoveryMarkerRefs.some((item) => item.ref === ref)
  );
  const legacyMarkerUnknownRefs = unique([
    ...legacyIndependentMarkerRefs,
    ...legacyRecoveryMarkerRefs
  ]);
  const hasDefinitiveLineageDrift = (evidenceTruth.claimMetadataComplete
    && !trace.reported_envelope_ref_matches_final)
    || topLevelClaimRefMismatches.length > 0
    || missingClaimedLineage.length > 0
    || claimedDelegatedRefs.length > 0
    || sourceRefMismatchRefs.length > 0
    || evidencePairCardinalityMismatchRefs.length > 0
    || evidencePairMetadataMismatchRefs.length > 0
    || missingToolResultEventBindingPairs.length > 0
    || ambiguousToolResultEventBindingPairs.length > 0
    || mismatchedToolResultEventArtifactPairs.length > 0
    || missingToolResultEventArtifactFilePairs.length > 0
    || mismatchedToolResultEventArtifactIdentityPairs.length > 0
    || mismatchedToolResultEventRoundPairs.length > 0
    || missingToolResultEventEnvelopeBindingPairs.length > 0
    || mismatchedToolResultEventEnvelopeIdentityPairs.length > 0
    || partialToolResultActionLineagePairs.length > 0
    || mismatchedToolResultActionLineagePairs.length > 0
    || duplicateToolResultActionLineagePairs.length > 0
    || afterLatestDelegationMismatchRefs.length > 0
    || afterLatestFailedDelegationMismatchRefs.length > 0
    || claimedFlagMismatchRefs.length > 0
    || invalidIndependentLineageRefs.length > 0
    || invalidRecoveryLineageRefs.length > 0;
  const hasConservativeLineageDrift = !evidenceTruth.claimMetadataComplete
    || verificationEvidenceLineageUnknown
    || missingIndependentMarkerRefs.length > 0
    || missingRecoveryMarkerRefs.length > 0
    || legacyToolResultActionLineagePairs.length > 0
    || legacyMarkerUnknownRefs.length > 0;
  let status: HarnessReplayAuditCheckStatus = "pass";
  if (hasDefinitiveLineageDrift && trace.verified) status = "fail";
  else if (hasDefinitiveLineageDrift || hasConservativeLineageDrift) status = "warning";
  return {
    id: "verification_evidence_lineage",
    status,
    summary: [
      `claimed_refs=${evidenceTruth.authoritativeClaimRefs.length}`,
      `report_claimed_refs=${trace.claimed_verification_refs.length}`,
      `envelope_claimed_refs_present=${evidenceTruth.claimMetadataComplete}`,
      `reported_envelope_ref_matches_final=${trace.reported_envelope_ref_matches_final}`,
      `top_level_claim_ref_mismatches=${topLevelClaimRefMismatches.length}`,
      `verification_evidence_lineage_unknown=${verificationEvidenceLineageUnknown}`,
      `verification_evidence_refs=${trace.verification_evidence_ref_count}`,
      `claimed_evidence_refs=${claimedEvidenceRefs.length}`,
      `reported_claimed_evidence_refs=${reportedClaimedEvidenceRefs.length}`,
      `independent_evidence_refs=${expectedIndependentMarkerRefs.size}`,
      `reported_independent_evidence_refs=${reportedIndependentMarkerRefs.length}`,
      `failed_delegation_recovery_refs=${expectedRecoveryMarkerRefs.size}`,
      `reported_failed_delegation_recovery_refs=${reportedRecoveryMarkerRefs.length}`,
      `claimed_delegated_refs=${claimedDelegatedRefs.length}`,
      `claimed_delegated_result_ids=${claimedDelegatedResultIds.length}`,
      `claimed_delegated_report_refs=${claimedDelegatedReportRefs.length}`,
      `claimed_delegated_event_fallback_refs=${claimedDelegatedEventFallbackRefs.length}`,
      `missing_claimed_lineage=${missingClaimedLineage.length}`,
      `source_ref_mismatches=${sourceRefMismatchRefs.length}`,
      `evidence_pair_cardinality_mismatches=${evidencePairCardinalityMismatchRefs.length}`,
      `evidence_pair_metadata_mismatches=${evidencePairMetadataMismatchRefs.length}`,
      `missing_tool_result_event_bindings=${missingToolResultEventBindingPairs.length}`,
      `ambiguous_tool_result_event_bindings=${ambiguousToolResultEventBindingPairs.length}`,
      `mismatched_tool_result_event_artifacts=${mismatchedToolResultEventArtifactPairs.length}`,
      `missing_tool_result_event_artifact_files=${missingToolResultEventArtifactFilePairs.length}`,
      `mismatched_tool_result_event_artifact_identities=${mismatchedToolResultEventArtifactIdentityPairs.length}`,
      `mismatched_tool_result_event_rounds=${mismatchedToolResultEventRoundPairs.length}`,
      `missing_tool_result_event_envelope_bindings=${missingToolResultEventEnvelopeBindingPairs.length}`,
      `mismatched_tool_result_event_envelope_identities=${mismatchedToolResultEventEnvelopeIdentityPairs.length}`,
      `legacy_tool_result_action_lineage=${legacyToolResultActionLineagePairs.length}`,
      `partial_tool_result_action_lineage=${partialToolResultActionLineagePairs.length}`,
      `mismatched_tool_result_action_lineage=${mismatchedToolResultActionLineagePairs.length}`,
      `duplicate_tool_result_action_lineage=${duplicateToolResultActionLineagePairs.length}`,
      `after_latest_delegation_mismatches=${afterLatestDelegationMismatchRefs.length}`,
      `after_latest_failed_delegation_mismatches=${afterLatestFailedDelegationMismatchRefs.length}`,
      `claimed_flag_mismatches=${claimedFlagMismatchRefs.length}`,
      `missing_independent_lineage=${missingIndependentMarkerRefs.length}`,
      `missing_recovery_lineage=${missingRecoveryMarkerRefs.length}`,
      `invalid_independent_lineage=${invalidIndependentLineageRefs.length}`,
      `invalid_recovery_lineage=${invalidRecoveryLineageRefs.length}`,
      `legacy_marker_unknown_refs=${legacyMarkerUnknownRefs.length}`
    ].join("; "),
    refs: hasDefinitiveLineageDrift || hasConservativeLineageDrift
      ? unique([
        trace.report_ref,
        ...(verificationEvidenceLineageUnknown ? evidenceTruth.authoritativeClaimRefs : []),
        ...topLevelClaimRefMismatches,
        ...claimedDelegatedRefs,
        ...trace.delegated_dispatches
          .filter((dispatch) => claimedDelegatedEventFallbackRefs.includes(dispatch.result_ref))
          .map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`),
        ...missingClaimedLineage,
        ...sourceRefMismatchRefs.map((item) => item.ref),
        ...evidencePairCardinalityMismatchRefs.flatMap((items) => items.map((item) => item.ref)),
        ...evidencePairMetadataMismatchRefs.flatMap((items) => items.map((item) => item.ref)),
        ...missingToolResultEventBindingPairs.flatMap((items) => items.map((item) => item.ref)),
        ...ambiguousToolResultEventBindingPairs.flatMap((items) => items.map((item) => item.ref)),
        ...mismatchedToolResultEventArtifactPairs.flatMap((items) => [
          ...items.map((item) => item.ref),
          `${trace.report_ref}#${items[0]!.event_id}`
        ]),
        ...missingToolResultEventArtifactFilePairs.flatMap((items) => [
          ...items.map((item) => item.ref),
          `${trace.report_ref}#${items[0]!.event_id}`
        ]),
        ...mismatchedToolResultEventArtifactIdentityPairs.flatMap((items) => [
          ...items.map((item) => item.ref),
          `${trace.report_ref}#${items[0]!.event_id}`
        ]),
        ...mismatchedToolResultEventRoundPairs.flatMap((items) => [
          ...items.map((item) => item.ref),
          `${trace.report_ref}#${items[0]!.event_id}`
        ]),
        ...missingToolResultEventEnvelopeBindingPairs.flatMap((items) => [
          ...items.map((item) => item.ref),
          `${trace.report_ref}#${items[0]!.event_id}`
        ]),
        ...mismatchedToolResultEventEnvelopeIdentityPairs.flatMap((items) => [
          ...items.map((item) => item.ref),
          `${trace.report_ref}#${items[0]!.event_id}`
        ]),
        ...legacyToolResultActionLineagePairs.flatMap((items) => items.map((item) => item.ref)),
        ...partialToolResultActionLineagePairs.flatMap((items) => items.map((item) => item.ref)),
        ...mismatchedToolResultActionLineagePairs.flatMap((items) => items.map((item) => item.ref)),
        ...duplicateToolResultActionLineagePairs.flatMap((items) => items.map((item) => item.ref)),
        ...afterLatestDelegationMismatchRefs.map((item) => item.ref),
        ...afterLatestFailedDelegationMismatchRefs.map((item) => item.ref),
        ...claimedFlagMismatchRefs.map((item) => item.ref),
        ...missingIndependentMarkerRefs,
        ...missingRecoveryMarkerRefs,
        ...invalidIndependentLineageRefs.map((item) => item.ref),
        ...invalidRecoveryLineageRefs.map((item) => item.ref),
        ...legacyMarkerUnknownRefs
      ])
      : unique([trace.report_ref, ...claimedEvidenceRefs.map((item) => item.ref)])
  };
}

function delegatedResultRefCoverageCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const reportRefs = new Set(trace.delegated_result_report_refs);
  const foreignRefs = trace.foreign_delegated_result_refs;
  const dispatchesWithResultRef = trace.delegated_dispatches.filter((dispatch) => dispatch.result_ref);
  const dispatchRefs = new Set(dispatchesWithResultRef.map((dispatch) => dispatch.result_ref));
  const missingReportDispatchRefs = dispatchesWithResultRef.filter((dispatch) => !reportRefs.has(dispatch.result_ref));
  const orphanReportRefs = trace.delegated_result_report_refs.filter((ref) => !dispatchRefs.has(ref));
  const refsOutsideEventArtifacts = dispatchesWithResultRef.filter((dispatch) => !dispatch.result_ref_in_event_artifacts);
  const missingResultArtifactFiles = dispatchesWithResultRef.filter((dispatch) => !dispatch.result_ref_file_present);
  const mismatchedResultIdentityRefs = dispatchesWithResultRef.filter((dispatch) => !dispatch.result_ref_matches_result_identity);
  const hasAttention = missingReportDispatchRefs.length > 0
    || orphanReportRefs.length > 0
    || refsOutsideEventArtifacts.length > 0
    || missingResultArtifactFiles.length > 0
    || mismatchedResultIdentityRefs.length > 0
    || foreignRefs.length > 0;
  return {
    id: "delegated_result_ref_coverage",
    status: hasAttention ? "warning" : "pass",
    summary: [
      `report_refs=${trace.delegated_result_report_refs.length}`,
      `trace_refs=${trace.delegated_result_refs.length}`,
      `dispatch_refs=${dispatchesWithResultRef.length}`,
      `missing_dispatch_refs=${missingReportDispatchRefs.length}`,
      `orphan_report_refs=${orphanReportRefs.length}`,
      `refs_outside_event_artifacts=${refsOutsideEventArtifacts.length}`,
      `missing_result_artifact_files=${missingResultArtifactFiles.length}`,
      `mismatched_result_identity_refs=${mismatchedResultIdentityRefs.length}`,
      `cross_session_delegated_result_refs=${foreignRefs.length}`,
      `event_fallback_refs=${trace.delegated_result_event_fallback_refs.length}`
    ].join("; "),
    refs: hasAttention
      ? unique([
          trace.report_ref,
          ...missingReportDispatchRefs.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`),
          ...orphanReportRefs,
          ...refsOutsideEventArtifacts.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`),
          ...missingResultArtifactFiles.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`),
          ...mismatchedResultIdentityRefs.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`),
          ...foreignRefs
        ])
      : unique([trace.report_ref, ...trace.delegated_result_report_refs])
  };
}

function delegatedDispatchMetadataCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const failedDispatches = trace.delegated_dispatches.filter((dispatch) => !dispatch.ok || dispatch.contract_status !== "passed");
  const missingResultIds = trace.delegated_dispatches.filter((dispatch) => dispatch.result_id === null);
  const resultIds = trace.delegated_dispatches
    .map((dispatch) => dispatch.result_id)
    .filter((resultId): resultId is string => resultId !== null);
  const resultRefs = trace.delegated_dispatches
    .map((dispatch) => dispatch.result_ref)
    .filter((resultRef) => resultRef.length > 0);
  const duplicateResultIdCount = resultIds.length - new Set(resultIds).size;
  const duplicateResultRefCount = resultRefs.length - new Set(resultRefs).size;
  const missingResultRefs = trace.delegated_dispatches.filter((dispatch) => !dispatch.result_ref);
  const contractStatusOkMismatches = trace.delegated_dispatches.filter((dispatch) =>
    dispatch.ok !== (dispatch.contract_status === "passed")
  );
  const countMismatch = trace.delegated_result_count !== trace.delegated_dispatches.length;
  const hasMetadataAttention = countMismatch
    || missingResultIds.length > 0
    || duplicateResultIdCount > 0
    || duplicateResultRefCount > 0
    || missingResultRefs.length > 0
    || contractStatusOkMismatches.length > 0;
  const problemRefs = unique([
    ...(countMismatch ? trace.delegated_dispatches : []),
    ...missingResultIds,
    ...(duplicateResultIdCount > 0
      ? trace.delegated_dispatches.filter((dispatch) => dispatch.result_id !== null)
      : []),
    ...(duplicateResultRefCount > 0
      ? trace.delegated_dispatches.filter((dispatch) => dispatch.result_ref.length > 0)
      : []),
    ...missingResultRefs,
    ...contractStatusOkMismatches
  ].map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`));
  let refs = trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`);
  if (hasMetadataAttention) refs = problemRefs.length > 0 ? problemRefs : [trace.report_ref];
  return {
    id: "delegated_dispatch_metadata",
    status: hasMetadataAttention ? "warning" : "pass",
    summary: [
      `delegated_results=${trace.delegated_result_count}`,
      `dispatches=${trace.delegated_dispatches.length}`,
      `failed_dispatches=${failedDispatches.length}`,
      `missing_result_id=${missingResultIds.length}`,
      `duplicate_result_id=${duplicateResultIdCount}`,
      `missing_result_ref=${missingResultRefs.length}`,
      `duplicate_result_ref=${duplicateResultRefCount}`,
      `contract_status_ok_mismatches=${contractStatusOkMismatches.length}`
    ].join("; "),
    refs
  };
}

function delegatedModelInvocationBoundaryCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const missingModelInvoked = trace.delegated_dispatches.filter((dispatch) => !dispatch.model_invoked_present);
  const blockedInvoked = trace.delegated_dispatches.filter((dispatch) =>
    isDispatchBlockedBeforeModel(dispatch) && dispatch.model_invoked === true
  );
  const dispatchedNotInvoked = trace.delegated_dispatches.filter((dispatch) =>
    !isDispatchBlockedBeforeModel(dispatch) && dispatch.model_invoked === false
  );
  const problemRefs = unique([
    ...missingModelInvoked,
    ...blockedInvoked,
    ...dispatchedNotInvoked
  ].map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`));
  return {
    id: "delegated_model_invocation_boundary",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `delegated_dispatches=${trace.delegated_dispatches.length}`,
      `missing_model_invoked=${missingModelInvoked.length}`,
      `blocked_invoked=${blockedInvoked.length}`,
      `dispatched_not_invoked=${dispatchedNotInvoked.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
  };
}

function delegatedActionCoverageCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const declaredActions = trace.rounds.flatMap((round) => round.delegated_action_ids.map((actionId) => ({
    key: delegatedActionKey(round.round, actionId, round.delegated_action_sequence_by_id[actionId]!),
    envelopeRef: round.envelope_ref
  })));
  const duplicateDeclaredActionCount = trace.rounds.reduce((count, round) =>
    count + round.delegated_action_ids.length - new Set(round.delegated_action_ids).size, 0);
  const duplicateDeclaredActionEnvelopeRefs = trace.rounds
    .filter((round) => round.delegated_action_ids.length !== new Set(round.delegated_action_ids).size)
    .map((round) => round.envelope_ref);
  const declaredActionKeys = new Set(declaredActions.map((action) => action.key));
  const dispatchesByKey = new Map<string, LiveRunDelegatedDispatchSummary[]>();
  for (const dispatch of trace.delegated_dispatches) {
    const key = delegatedActionKey(dispatch.round, dispatch.action_id, dispatch.sequence);
    dispatchesByKey.set(key, [...(dispatchesByKey.get(key) ?? []), dispatch]);
  }
  const missingActions = declaredActions.filter((action) => !dispatchesByKey.has(action.key));
  const unexpectedDispatches = trace.delegated_dispatches.filter((dispatch) =>
    !declaredActionKeys.has(delegatedActionKey(dispatch.round, dispatch.action_id, dispatch.sequence))
  );
  const duplicateDispatches = [...dispatchesByKey.entries()]
    .filter(([key, dispatches]) => declaredActionKeys.has(key) && dispatches.length > 1)
    .flatMap(([, dispatches]) => dispatches.slice(1));
  const problemRefs = unique([
    ...missingActions.map((action) => action.envelopeRef),
    ...duplicateDeclaredActionEnvelopeRefs,
    ...unexpectedDispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`),
    ...duplicateDispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
  ]);
  return {
    id: "delegated_action_coverage",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `declared_delegate_actions=${declaredActions.length}`,
      `delegated_dispatches=${trace.delegated_dispatches.length}`,
      `missing_delegate_dispatches=${missingActions.length}`,
      `duplicate_delegate_actions=${duplicateDeclaredActionCount}`,
      `unexpected_delegate_dispatches=${unexpectedDispatches.length}`,
      `duplicate_delegate_dispatches=${duplicateDispatches.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : unique([
          ...trace.rounds.filter((round) => (round.action_counts.delegate_agent ?? 0) > 0).map((round) => round.envelope_ref),
          ...trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
        ])
  };
}

function delegatedActionKey(round: number, actionId: string, sequence: number): string {
  return `${round}:${actionId}:${sequence}`;
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
  const missingRounds = trace.delegated_dispatches.filter((dispatch) => !envelopeRefsByRound.has(dispatch.round));
  const roundsWithoutDelegateAction = trace.delegated_dispatches.filter((dispatch) => {
    const roundActionIds = delegatedActionIdsByRound.get(dispatch.round);
    return roundActionIds !== undefined && roundActionIds.size === 0;
  });
  const mismatchedActionIds = trace.delegated_dispatches.filter((dispatch) => {
    const roundActionIds = delegatedActionIdsByRound.get(dispatch.round);
    return roundActionIds !== undefined && roundActionIds.size > 0 && !roundActionIds.has(dispatch.action_id);
  });
  const mismatchedSequences = trace.delegated_dispatches.filter((dispatch) => {
    const expectedSequence = delegatedActionSequencesByRound.get(dispatch.round)?.[dispatch.action_id];
    return expectedSequence !== undefined && expectedSequence !== dispatch.sequence;
  });
  const inputLineage = delegatedInputLineage(trace);
  const problemDispatchRefs = [
    ...missingEnvelopeRefs,
    ...mismatchedEnvelopeRefs,
    ...missingRounds,
    ...roundsWithoutDelegateAction,
    ...mismatchedActionIds,
    ...mismatchedSequences,
    ...inputLineage.missingInputMetadata,
    ...inputLineage.missingExpectedInput,
    ...inputLineage.mismatchedInputActionIds,
    ...inputLineage.mismatchedInputValidity,
    ...inputLineage.mismatchedInputTaskChars,
    ...inputLineage.mismatchedInputContextChars,
    ...inputLineage.mismatchedInputDigests,
    ...inputLineage.invalidInputOutcomeMismatches
  ].map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`);
  const problemRefs = unique([...problemDispatchRefs, ...inputLineage.metadataIssueEnvelopeRefs]);
  return {
    id: "delegated_dispatch_lineage",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `delegated_dispatches=${trace.delegated_dispatches.length}`,
      `missing_envelope_ref=${missingEnvelopeRefs.length}`,
      `mismatched_envelope_ref=${mismatchedEnvelopeRefs.length}`,
      `missing_round=${missingRounds.length}`,
      `round_without_delegate_action=${roundsWithoutDelegateAction.length}`,
      `mismatched_action_id=${mismatchedActionIds.length}`,
      `mismatched_sequence=${mismatchedSequences.length}`,
      `missing_input_metadata=${inputLineage.missingInputMetadata.length}`,
      `missing_input_expectation=${inputLineage.missingExpectedInput.length}`,
      `duplicate_input_metadata=${inputLineage.duplicateInputMetadataKeys.length}`,
      `unexpected_input_metadata=${inputLineage.unexpectedInputMetadataKeys.length}`,
      `mismatched_input_action_id=${inputLineage.mismatchedInputActionIds.length}`,
      `mismatched_input_validity=${inputLineage.mismatchedInputValidity.length}`,
      `mismatched_input_task_chars=${inputLineage.mismatchedInputTaskChars.length}`,
      `mismatched_input_context_chars=${inputLineage.mismatchedInputContextChars.length}`,
      `mismatched_input_digest=${inputLineage.mismatchedInputDigests.length}`,
      `invalid_input_outcome_mismatch=${inputLineage.invalidInputOutcomeMismatches.length}`
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

function delegatedRecoveryGuidanceCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const failedDispatches = trace.delegated_dispatches.filter((dispatch) => !dispatch.ok || dispatch.contract_status !== "passed");
  const missingRecoveryGuidance = failedDispatches.filter((dispatch) => !dispatch.recovery_guidance_present);
  const invalidRecoveryGuidance = failedDispatches.filter((dispatch) =>
    dispatch.recovery_guidance_present && dispatch.recovery_guidance !== "main_harness_recovery"
  );
  const unexpectedRecoveryGuidance = trace.delegated_dispatches.filter((dispatch) =>
    dispatch.recovery_guidance_present
      && dispatch.ok
      && dispatch.contract_status === "passed"
      && dispatch.recovery_guidance !== "none"
  );
  const problemRefs = unique([
    ...missingRecoveryGuidance,
    ...invalidRecoveryGuidance,
    ...unexpectedRecoveryGuidance
  ].map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`));
  return {
    id: "delegated_recovery_guidance",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `failed_dispatches=${failedDispatches.length}`,
      `missing_recovery_guidance=${missingRecoveryGuidance.length}`,
      `invalid_recovery_guidance=${invalidRecoveryGuidance.length}`,
      `unexpected_recovery_guidance=${unexpectedRecoveryGuidance.length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : trace.delegated_dispatches.map((dispatch) => `${trace.report_ref}#${dispatch.event_id}`)
  };
}

function delegatedObservationInputLineageCheck(trace: LiveRunTraceSummary): HarnessReplayAuditCheck {
  const laterRounds = trace.rounds.filter((round) => trace.delegated_dispatches.some((dispatch) => dispatch.round < round.round));
  const missingMetadataRounds = laterRounds.filter((round) => !round.model_input_present);
  const mismatchedRounds = laterRounds.filter((round) => {
    if (!round.model_input_present) return false;
    const priorDispatches = trace.delegated_dispatches.filter((dispatch) => dispatch.round < round.round);
    const expectedObservationIds = unique(priorDispatches
      .map((dispatch) => dispatch.result_id)
      .filter((resultId): resultId is string => resultId !== null));
    const expectedRecoveryIds = unique(priorDispatches
      .filter((dispatch) => dispatch.recovery_guidance === "main_harness_recovery")
      .map((dispatch) => dispatch.result_id)
      .filter((resultId): resultId is string => resultId !== null));
    return !sameStringSet(round.delegated_observation_result_ids, expectedObservationIds)
      || !sameStringSet(round.recovery_guidance_result_ids, expectedRecoveryIds)
      || round.delegated_observation_trust_boundary !== "untrusted_advisory_data";
  });
  const problemRefs = unique([
    ...missingMetadataRounds,
    ...mismatchedRounds
  ].map((round) => round.envelope_ref));
  return {
    id: "delegated_observation_input_lineage",
    status: problemRefs.length > 0 ? "warning" : "pass",
    summary: [
      `later_model_rounds=${laterRounds.length}`,
      `missing_model_input_metadata=${missingMetadataRounds.length}`,
      `mismatched_observation_lineage=${mismatchedRounds.length}`,
      `mismatched_trust_boundary=${mismatchedRounds.filter((round) =>
        round.delegated_observation_trust_boundary !== "untrusted_advisory_data").length}`
    ].join("; "),
    refs: problemRefs.length > 0
      ? problemRefs
      : laterRounds.map((round) => round.envelope_ref)
  };
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === new Set(left).size
    && right.length === new Set(right).size
    && left.length === right.length
    && left.every((value) => right.includes(value));
}

function isDispatchBlockedBeforeModel(dispatch: LiveRunDelegatedDispatchSummary): boolean {
  return dispatch.dispatch_failure_kind === "input_contract_failed"
    || dispatch.dispatch_failure_kind === "dispatch_limit_exceeded";
}

function replaySummary(trace: LiveRunTraceSummary, status: HarnessReplayAuditStatus): string {
  const warnings = [
    trace.verification_status !== "passed" || !trace.verified ? "completion verification attention" : null,
    trace.delegated_result_failed_count > 0 ? "delegated result failure" : null,
    trace.delegated_result_count !== trace.delegated_dispatches.length ? "delegated dispatch metadata gap" : null,
    trace.repo_write_guard_count > 0 ? "repo write guard evidence" : null,
    trace.foreign_tool_result_artifact_refs.length > 0 ? "cross-session tool-result artifact" : null,
    trace.foreign_context_artifact_refs.length > 0 ? "cross-session prompt context" : null,
    trace.model_diagnostic_count > 0 ? "model diagnostic evidence" : null,
    trace.unreadable_model_diagnostic_refs.length > 0 ? "unreadable model diagnostic" : null,
    trace.foreign_model_diagnostic_refs.length > 0 ? "cross-session model diagnostic" : null
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
      delegated_completion_gate_passed: numberField(record.metrics, "delegated_completion_gate_passed") ?? 0,
      delegated_completion_gate_warning: numberField(record.metrics, "delegated_completion_gate_warning") ?? 0,
      delegated_completion_gate_failed: numberField(record.metrics, "delegated_completion_gate_failed") ?? 0,
      delegated_completion_gate_skipped: numberField(record.metrics, "delegated_completion_gate_skipped") ?? 0,
      delegated_dispatches: numberField(record.metrics, "delegated_dispatches") ?? 0,
      delegated_dispatches_failed: numberField(record.metrics, "delegated_dispatches_failed") ?? 0,
      verification_evidence_refs: numberField(record.metrics, "verification_evidence_refs") ?? 0,
      harness_state_actions: numberField(record.metrics, "harness_state_actions") ?? 0,
      model_diagnostics: numberField(record.metrics, "model_diagnostics") ?? 0,
      repo_write_guards: numberField(record.metrics, "repo_write_guards") ?? 0,
      observation_refs: numberField(record.metrics, "observation_refs") ?? 0
    },
    checks,
    delegated_completion_gate_checks: Array.isArray(record.delegated_completion_gate_checks)
      ? record.delegated_completion_gate_checks.map(asCompletionGateCheck).filter((item): item is LiveRunCompletionCheckSummary => item !== null)
      : [],
    delegated_result_report_refs: Array.isArray(record.delegated_result_report_refs)
      ? record.delegated_result_report_refs.filter((item): item is string => typeof item === "string")
      : [],
    delegated_result_event_fallback_refs: Array.isArray(record.delegated_result_event_fallback_refs)
      ? record.delegated_result_event_fallback_refs.filter((item): item is string => typeof item === "string")
      : [],
    delegated_result_refs: Array.isArray(record.delegated_result_refs)
      ? record.delegated_result_refs.filter((item): item is string => typeof item === "string")
      : [],
    delegated_dispatches: Array.isArray(record.delegated_dispatches)
      ? record.delegated_dispatches.map(asDelegatedDispatchSummary).filter((item): item is LiveRunDelegatedDispatchSummary => item !== null)
      : [],
    verification_evidence_refs: Array.isArray(record.verification_evidence_refs)
      ? record.verification_evidence_refs.map(asVerificationEvidenceRefSummary).filter((item): item is LiveRunVerificationEvidenceRefSummary => item !== null)
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
  const resultId = stringField(value, "result_id");
  const actionId = stringField(value, "action_id");
  const envelopeRef = stringField(value, "envelope_ref");
  const contractStatus = stringField(value, "contract_status");
  const dispatchFailureKind = stringField(value, "dispatch_failure_kind");
  const resultFailureKind = stringField(value, "result_failure_kind");
  const recoveryGuidance = value.recovery_guidance === "none" || value.recovery_guidance === "main_harness_recovery"
    ? value.recovery_guidance
    : null;
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
    metadata_present: value.metadata_present === true,
    result_id: resultId,
    result_ref: resultRef,
    result_ref_in_event_artifacts: value.result_ref_in_event_artifacts === true,
    result_ref_file_present: value.result_ref_file_present === true,
    result_ref_matches_result_identity: value.result_ref_matches_result_identity === true,
    action_id: actionId,
    envelope_ref: envelopeRef,
    round,
    sequence,
    task_chars: taskChars,
    context_chars: contextChars,
    input_contract_valid: typeof value.input_contract_valid === "boolean" ? value.input_contract_valid : null,
    input_contract_valid_present: typeof value.input_contract_valid_present === "boolean"
      ? value.input_contract_valid_present
      : typeof value.input_contract_valid === "boolean",
    input_digest: stringField(value, "input_digest"),
    input_digest_present: typeof value.input_digest_present === "boolean"
      ? value.input_digest_present
      : typeof value.input_digest === "string",
    model_invoked: typeof value.model_invoked === "boolean" ? value.model_invoked : null,
    model_invoked_present: typeof value.model_invoked_present === "boolean"
      ? value.model_invoked_present
      : typeof value.model_invoked === "boolean",
    contract_status: contractStatus,
    dispatch_failure_kind: dispatchFailureKind,
    dispatch_failure_kind_present: Object.hasOwn(value, "dispatch_failure_kind"),
    result_failure_kind: resultFailureKind,
    result_failure_kind_present: Object.hasOwn(value, "result_failure_kind"),
    recovery_guidance: recoveryGuidance,
    recovery_guidance_present: Object.hasOwn(value, "recovery_guidance"),
    ok: value.ok
  };
}

function asVerificationEvidenceRefSummary(value: unknown): LiveRunVerificationEvidenceRefSummary | null {
  if (!isRecord(value)) return null;
  const ref = stringField(value, "ref");
  const source = stringField(value, "source");
  const toolResultId = stringField(value, "tool_result_id");
  const artifactRef = stringField(value, "artifact_ref");
  const eventId = stringField(value, "event_id");
  const round = numberField(value, "round");
  const tool = stringField(value, "tool");
  const sideEffectLevel = stringField(value, "side_effect_level");
  if (
    !ref
    || !isVerificationEvidenceSource(source)
    || !toolResultId
    || !artifactRef
    || !eventId
    || round === null
    || !tool
    || !isSideEffectLevel(sideEffectLevel)
    || typeof value.ok !== "boolean"
    || typeof value.is_write_run !== "boolean"
    || typeof value.claimed !== "boolean"
    || typeof value.after_latest_delegation !== "boolean"
    || typeof value.after_latest_failed_delegation !== "boolean"
    || typeof value.counts_as_independent_evidence !== "boolean"
    || typeof value.counts_as_failed_delegation_recovery !== "boolean"
  ) {
    return null;
  }
  return {
    ref,
    source,
    tool_result_id: toolResultId,
    artifact_ref: artifactRef,
    event_id: eventId,
    round,
    tool,
    ok: value.ok,
    side_effect_level: sideEffectLevel,
    is_write_run: value.is_write_run,
    claimed: value.claimed,
    after_latest_delegation: value.after_latest_delegation,
    after_latest_failed_delegation: value.after_latest_failed_delegation,
    counts_as_independent_evidence: value.counts_as_independent_evidence,
    counts_as_failed_delegation_recovery: value.counts_as_failed_delegation_recovery
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

function isVerificationEvidenceSource(value: string | null): value is LiveRunVerificationEvidenceRefSummary["source"] {
  return value === "tool_result" || value === "tool_artifact";
}

function isSideEffectLevel(value: string | null): value is LiveRunVerificationEvidenceRefSummary["side_effect_level"] {
  return value === "none" || value === "local_reversible" || value === "local_write" || value === "external_write";
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
