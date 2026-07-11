import { basename } from "node:path";
import {
  delegateAgentCompletionGateCheckId,
  delegateAgentCompletionGateCheckIds
} from "./action_contracts.js";
import {
  completionVerificationReportSchema,
  evidenceEventSchema,
  modelActionEnvelopeSchema,
  type CompletionVerificationReport,
  type EvidenceEvent,
  type ModelActionEnvelope
} from "./schemas.js";
import { delegationInputMetadata, parseDelegationRequest } from "./delegate_agent_contract.js";
import { AgentStore } from "./store.js";

const HARNESS_ACTION_TYPES = new Set([
  "record_evidence",
  "update_working_state",
  "propose_sop",
  "propose_memory",
  "request_audit",
  "pause_autonomy"
]);

const DELEGATED_COMPLETION_GATE_CHECK_IDS = new Set<string>(delegateAgentCompletionGateCheckIds);

type DelegatedDispatchParsed = Omit<LiveRunDelegatedDispatchSummary, "event_id" | "created_at" | "metadata_present" | "result_ref" | "result_ref_in_event_artifacts" | "result_ref_file_present" | "result_ref_matches_result_identity"> & {
  result_ref?: string;
};

export interface LiveRunTraceRound {
  round: number;
  envelope_ref: string;
  summary: string;
  completion_status: ModelActionEnvelope["completion_claim"]["status"];
  completion_verification_refs: string[];
  action_counts: Record<string, number>;
  action_types: string[];
  delegated_action_ids: string[];
  delegated_action_sequence_by_id: Record<string, number>;
  delegated_action_inputs: LiveRunDelegatedActionInputExpectation[];
  harness_action_types: string[];
}

export interface LiveRunDelegatedActionInputExpectation {
  action_id: string;
  sequence: number;
  input_contract_valid: boolean;
  task_chars: number;
  context_chars: number;
  input_digest: string;
}

export interface LiveRunRepoWriteGuardSummary {
  event_id: string;
  created_at: string;
  path: string;
  before_status: string;
  after_status: string;
  before_changed_file_count: number;
  after_changed_file_count: number;
  changed_file_count_delta: number;
  preexisting_dirty: boolean;
  target_changed_after_write: boolean;
}

export interface LiveRunModelDiagnosticSummary {
  event_id: string;
  created_at: string;
  round: number;
  stage: string;
  failure_kind: string;
  diagnostic_ref: string;
  response_ref: string | null;
  error_preview: string;
}

export interface LiveRunToolResultEventSummary {
  event_id: string;
  created_at: string;
  round: number;
  envelope_ref: string | null;
  envelope_ref_in_trace_rounds: boolean;
  envelope_ref_matches_identity: boolean;
  artifact_refs: string[];
  result_artifact_ref: string | null;
  result_artifact_ref_file_present: boolean;
  result_id: string | null;
  tool: string | null;
  ok: boolean | null;
  side_effect_level: LiveRunVerificationEvidenceRefSummary["side_effect_level"] | null;
  is_write_run: boolean | null;
  metadata_present: boolean;
}

export interface LiveRunDelegatedDispatchSummary {
  event_id: string;
  created_at: string;
  metadata_present: boolean;
  result_id: string | null;
  result_ref: string;
  result_ref_in_event_artifacts: boolean;
  result_ref_file_present: boolean;
  result_ref_matches_result_identity: boolean;
  action_id: string;
  envelope_ref: string | null;
  round: number;
  sequence: number;
  task_chars: number;
  context_chars: number;
  input_contract_valid: boolean | null;
  input_contract_valid_present: boolean;
  input_digest: string | null;
  input_digest_present: boolean;
  model_invoked: boolean | null;
  model_invoked_present: boolean;
  contract_status: string;
  dispatch_failure_kind: string | null;
  dispatch_failure_kind_present: boolean;
  result_failure_kind: string | null;
  result_failure_kind_present: boolean;
  ok: boolean;
}

export interface LiveRunCompletionCheckSummary {
  id: string;
  status: CompletionVerificationReport["checks"][number]["status"];
  summary: string;
  refs: string[];
}

export type LiveRunVerificationEvidenceRefSummary = CompletionVerificationReport["verification_evidence_refs"][number];

type CompletionCheckStatus = CompletionVerificationReport["checks"][number]["status"];

export type LiveRunCompletionGateStatusCounts = Record<CompletionCheckStatus, number>;

export interface LiveRunTraceSummary {
  report_ref: string;
  completion_id: string;
  session_id: string;
  turn_id: string;
  created_at: string;
  completion_status: CompletionVerificationReport["completion_status"];
  reported_completion_status: CompletionVerificationReport["completion_status"];
  final_completion_status: ModelActionEnvelope["completion_claim"]["status"] | null;
  final_completion_status_present: boolean;
  reported_completion_status_matches_final: boolean | null;
  verification_status: CompletionVerificationReport["verification_status"];
  verified: boolean;
  summary: string;
  completion_failed_check_ids: string[];
  completion_warning_check_ids: string[];
  claimed_verification_refs: string[];
  reported_envelope_ref: string;
  final_envelope_ref: string | null;
  reported_envelope_ref_matches_final: boolean;
  envelope_claimed_verification_refs_present: boolean;
  envelope_claimed_verification_refs: string[];
  verification_evidence_refs_present: boolean;
  verification_evidence_ref_count: number;
  verification_evidence_refs: LiveRunVerificationEvidenceRefSummary[];
  context_ref?: string;
  context_manifest_ref?: string;
  final_response_ref: string | null;
  event_count: number;
  event_kind_counts: Record<string, number>;
  tool_result_count: number;
  tool_result_events: LiveRunToolResultEventSummary[];
  delegated_result_count: number;
  delegated_result_passed_count: number;
  delegated_result_failed_count: number;
  delegated_completion_gate_checks: LiveRunCompletionCheckSummary[];
  delegated_completion_gate_status_counts: LiveRunCompletionGateStatusCounts;
  delegated_dispatch_missing_result_id_count: number;
  delegated_dispatch_missing_result_ref_count: number;
  delegated_result_report_refs: string[];
  delegated_result_event_fallback_refs: string[];
  delegated_result_refs: string[];
  delegated_dispatches: LiveRunDelegatedDispatchSummary[];
  harness_action_count: number;
  observation_ref_count: number;
  model_diagnostic_count: number;
  model_diagnostics: LiveRunModelDiagnosticSummary[];
  repo_write_guard_count: number;
  repo_write_guards: LiveRunRepoWriteGuardSummary[];
  rounds: LiveRunTraceRound[];
  refs: string[];
  boundary: string;
}

export interface LiveRunTraceListResult {
  count: number;
  trace_refs: string[];
  traces: LiveRunTraceSummary[];
}

export interface LiveRunTraceDetailResult {
  trace_ref: string;
  trace: LiveRunTraceSummary;
}

type EpisodeEvent = EvidenceEvent;

export async function listLiveRunTraces(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<LiveRunTraceListResult> {
  await store.ensureLayout();
  const summaries = await readLiveRunTraceSummaries(store);
  const selected = summaries.slice(0, args.limit ?? summaries.length);
  return {
    count: selected.length,
    trace_refs: selected.map((trace) => trace.report_ref),
    traces: selected
  };
}

export async function getLiveRunTrace(
  store: AgentStore,
  args: { traceRef: string }
): Promise<LiveRunTraceDetailResult> {
  await store.ensureLayout();
  const requested = args.traceRef.trim();
  if (!requested) throw new Error("--trace requires a value");
  if (requested.startsWith("/") || requested.split("/").includes("..")) {
    throw new Error(`Unsafe live run trace ref: ${args.traceRef}`);
  }
  const summaries = await readLiveRunTraceSummaries(store);
  const trace = summaries.find((item) => matchesTraceRef(item, requested));
  if (!trace) throw new Error(`Live run trace not found: ${args.traceRef}`);
  return {
    trace_ref: trace.report_ref,
    trace
  };
}

async function readLiveRunTraceSummaries(store: AgentStore): Promise<LiveRunTraceSummary[]> {
  const events = await readEpisodeEvents(store);
  const reports: Array<{
    ref: string;
    report: CompletionVerificationReport;
    verificationEvidenceRefsPresent: boolean;
  }> = [];
  for (const ref of await completionVerificationRefs(store)) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = completionVerificationReportSchema.safeParse(raw);
    if (parsed.success) {
      reports.push({
        ref,
        report: parsed.data,
        verificationEvidenceRefsPresent: typeof raw === "object"
          && raw !== null
          && Object.hasOwn(raw, "verification_evidence_refs")
      });
    }
  }
  return (await Promise.all(
    reports
      .sort((left, right) =>
        right.report.created_at.localeCompare(left.report.created_at)
        || right.report.id.localeCompare(left.report.id)
        || right.ref.localeCompare(left.ref)
      )
      .map((item) => summarizeLiveRunTrace(
        store,
        item.ref,
        item.report,
        events,
        item.verificationEvidenceRefsPresent
      ))
  )).filter((item): item is LiveRunTraceSummary => item !== null);
}

async function summarizeLiveRunTrace(
  store: AgentStore,
  reportRef: string,
  report: CompletionVerificationReport,
  events: EpisodeEvent[],
  verificationEvidenceRefsPresent: boolean
): Promise<LiveRunTraceSummary | null> {
  const runEvents = events.filter((event) =>
    event.session_id === report.session_id && event.turn_id === report.turn_id
  );
  const promptEvent = runEvents.find((event) => event.kind === "prompt");
  const contextRef = promptEvent?.artifact_refs.find((ref) => ref.endsWith("-context.md"));
  const contextManifestRef = promptEvent?.artifact_refs.find((ref) => ref.endsWith("-context.json"));
  const rounds = await readTraceRounds(store, runEvents);
  const finalEnvelopeRef = runEvents
    .filter((event) => event.kind === "model_action")
    .at(-1)?.artifact_refs.find((ref) => /-model-action-r\d+\.json$/.test(ref)) ?? null;
  const completionEnvelopeRound = rounds.find((round) => round.envelope_ref === finalEnvelopeRef);
  const eventKindCounts = countBy(runEvents.map((event) => event.kind));
  const episodeFiles = new Set(await store.listStateFiles("memory/episodes"));
  const toolResultEvents = readToolResultEventSummaries(runEvents, episodeFiles, rounds);
  const harnessActionCount = runEvents.filter((event) => isHarnessActionEvent(event)).length;
  const delegatedResultCount = eventKindCounts.delegated_result ?? 0;
  const delegatedDispatches = readDelegatedDispatchSummaries(runEvents, episodeFiles);
  const delegatedResultReportRefs = unique(report.delegated_result_refs);
  const delegatedResultReportRefSet = new Set(delegatedResultReportRefs);
  const delegatedResultEventFallbackRefs = unique(delegatedDispatches
    .map((dispatch) => dispatch.result_ref)
    .filter((ref) => ref.length > 0 && !delegatedResultReportRefSet.has(ref)));
  const delegatedResultRefs = unique([
    ...delegatedResultReportRefs,
    ...delegatedResultEventFallbackRefs
  ]);
  const delegatedDispatchMissingResultIdCount = delegatedDispatches.filter((dispatch) => dispatch.result_id === null).length;
  const delegatedDispatchMissingResultRefCount = delegatedDispatches.filter((dispatch) => !dispatch.result_ref).length;
  const delegatedCompletionGateChecks = readDelegatedCompletionGateChecks(report);
  const delegatedCompletionGateStatusCounts = countCompletionCheckStatuses(delegatedCompletionGateChecks);
  const delegatedResultFailedCount = Math.max(
    delegatedFailureCount(report),
    delegatedDispatches.filter((dispatch) => !dispatch.ok || dispatch.contract_status !== "passed").length
  );
  const modelDiagnostics = await readModelDiagnostics(store, runEvents);
  const repoWriteGuards = runEvents.map(extractRepoWriteGuardSummary).filter((item): item is LiveRunRepoWriteGuardSummary => item !== null);
  const refs = unique([
    reportRef,
    contextRef,
    contextManifestRef,
    report.envelope_ref,
    report.final_response_ref,
    ...rounds.map((round) => round.envelope_ref),
    ...modelDiagnostics.map((diagnostic) => diagnostic.diagnostic_ref),
    ...report.observation_refs.slice(0, 12),
    ...report.verification_evidence_refs.map((item) => item.ref).slice(0, 12),
    ...delegatedResultRefs.slice(0, 12),
    ...delegatedCompletionGateChecks.flatMap((check) => check.refs.slice(0, 5))
  ]);

  return {
    report_ref: reportRef,
    completion_id: report.id,
    session_id: report.session_id,
    turn_id: report.turn_id,
    created_at: report.created_at,
    completion_status: report.completion_status,
    reported_completion_status: report.completion_status,
    final_completion_status: completionEnvelopeRound?.completion_status ?? null,
    final_completion_status_present: completionEnvelopeRound !== undefined,
    reported_completion_status_matches_final: completionEnvelopeRound
      ? completionEnvelopeRound.completion_status === report.completion_status
      : null,
    verification_status: report.verification_status,
    verified: report.verified,
    summary: report.summary,
    completion_failed_check_ids: report.checks.filter((check) => check.status === "fail").map((check) => check.id),
    completion_warning_check_ids: report.checks.filter((check) => check.status === "warning").map((check) => check.id),
    claimed_verification_refs: [...report.claimed_verification_refs],
    reported_envelope_ref: report.envelope_ref,
    final_envelope_ref: finalEnvelopeRef,
    reported_envelope_ref_matches_final: finalEnvelopeRef === report.envelope_ref,
    envelope_claimed_verification_refs_present: completionEnvelopeRound !== undefined,
    envelope_claimed_verification_refs: completionEnvelopeRound
      ? [...completionEnvelopeRound.completion_verification_refs]
      : [],
    verification_evidence_refs_present: verificationEvidenceRefsPresent,
    verification_evidence_ref_count: report.verification_evidence_refs.length,
    verification_evidence_refs: report.verification_evidence_refs.map((item) => ({ ...item })),
    context_ref: contextRef,
    context_manifest_ref: contextManifestRef,
    final_response_ref: report.final_response_ref,
    event_count: runEvents.length,
    event_kind_counts: eventKindCounts,
    tool_result_count: eventKindCounts.tool_result ?? 0,
    tool_result_events: toolResultEvents,
    delegated_result_count: delegatedResultCount,
    delegated_result_passed_count: Math.max(0, delegatedResultCount - delegatedResultFailedCount),
    delegated_result_failed_count: delegatedResultFailedCount,
    delegated_completion_gate_checks: delegatedCompletionGateChecks,
    delegated_completion_gate_status_counts: delegatedCompletionGateStatusCounts,
    delegated_dispatch_missing_result_id_count: delegatedDispatchMissingResultIdCount,
    delegated_dispatch_missing_result_ref_count: delegatedDispatchMissingResultRefCount,
    delegated_result_report_refs: delegatedResultReportRefs,
    delegated_result_event_fallback_refs: delegatedResultEventFallbackRefs,
    delegated_result_refs: delegatedResultRefs,
    delegated_dispatches: delegatedDispatches,
    harness_action_count: harnessActionCount,
    observation_ref_count: report.observation_refs.length,
    model_diagnostic_count: modelDiagnostics.length,
    model_diagnostics: modelDiagnostics.slice(0, 5),
    repo_write_guard_count: repoWriteGuards.length,
    repo_write_guards: repoWriteGuards.slice(0, 5),
    rounds,
    refs,
    boundary: [
      "read-only live run trace; reads bounded completion, envelope, diagnostic, event, delegated dispatch,",
      "tool-result identity/success/side-effect/write-run/round/artifact, final-envelope claim refs, gate, report-delegated-ref, and repo-write-guard metadata;",
      "legacy delegated refs may use event-summary fallback; never renders raw model, tool, delegated, final-response, context,",
      "or harness artifact bodies"
    ].join(" ")
  };
}

function countCompletionCheckStatuses(checks: LiveRunCompletionCheckSummary[]): LiveRunCompletionGateStatusCounts {
  const counts: LiveRunCompletionGateStatusCounts = {
    pass: 0,
    fail: 0,
    warning: 0,
    skipped: 0
  };
  for (const check of checks) counts[check.status] += 1;
  return counts;
}

function readToolResultEventSummaries(
  events: EpisodeEvent[],
  episodeFiles: Set<string>,
  rounds: LiveRunTraceRound[]
): LiveRunToolResultEventSummary[] {
  const summaries: LiveRunToolResultEventSummary[] = [];
  const traceEnvelopeRefs = new Set(rounds.map((round) => round.envelope_ref));
  let currentRound = 0;
  let currentEnvelopeRef: string | null = null;
  for (const event of events) {
    if (event.kind === "model_action") {
      const envelopeRef = event.artifact_refs.find((ref) => /-model-action-r\d+\.json$/.test(ref));
      currentEnvelopeRef = envelopeRef ?? null;
      currentRound = envelopeRef ? roundNumber(envelopeRef) : 0;
    } else if (event.kind === "tool_result") {
      const resultId = event.tool_result?.result_id ?? null;
      const resultArtifactRef = resultId === null
        ? null
        : `memory/episodes/${event.session_id}-${resultId}.json`;
      summaries.push({
        event_id: event.id,
        created_at: event.created_at,
        round: currentRound,
        envelope_ref: currentEnvelopeRef,
        envelope_ref_in_trace_rounds: currentEnvelopeRef !== null
          && traceEnvelopeRefs.has(currentEnvelopeRef),
        envelope_ref_matches_identity: currentEnvelopeRef !== null
          && currentEnvelopeRef === `memory/episodes/${event.session_id}-model-action-r${currentRound}.json`,
        artifact_refs: [...event.artifact_refs],
        result_artifact_ref: resultArtifactRef,
        result_artifact_ref_file_present: resultArtifactRef !== null
          && episodeFiles.has(resultArtifactRef),
        result_id: resultId,
        tool: event.tool_result?.tool ?? null,
        ok: event.tool_result?.ok ?? null,
        side_effect_level: event.tool_result?.side_effect_level ?? null,
        is_write_run: event.tool_result?.is_write_run ?? null,
        metadata_present: event.tool_result !== undefined
      });
    }
  }
  return summaries;
}

function readDelegatedCompletionGateChecks(report: CompletionVerificationReport): LiveRunCompletionCheckSummary[] {
  return report.checks
    .filter((check) => DELEGATED_COMPLETION_GATE_CHECK_IDS.has(check.id))
    .map((check) => ({
      id: check.id,
      status: check.status,
      summary: check.summary,
      refs: [...check.refs]
    }));
}

function readDelegatedDispatchSummaries(
  events: EpisodeEvent[],
  episodeFiles: Set<string>
): LiveRunDelegatedDispatchSummary[] {
  const summaries: LiveRunDelegatedDispatchSummary[] = [];
  for (const event of events.filter((item) => item.kind === "delegated_result")) {
    const metadata = delegatedDispatchFromEventMetadata(event);
    const parsed = metadata ?? parseDelegatedDispatchSummary(event.summary);
    if (!parsed) continue;
    const { result_ref: parsedResultRef, ...dispatch } = parsed;
    const resultRef = parsedResultRef && parsedResultRef.length > 0
      ? parsedResultRef
      : event.artifact_refs.find((ref) => ref.endsWith(".json")) ?? "";
    summaries.push({
      event_id: event.id,
      created_at: event.created_at,
      metadata_present: metadata !== null,
      result_ref: resultRef,
      result_ref_in_event_artifacts: resultRef.length > 0 && event.artifact_refs.includes(resultRef),
      result_ref_file_present: resultRef.length > 0 && episodeFiles.has(resultRef),
      result_ref_matches_result_identity: dispatch.result_id !== null
        && resultRef === `memory/episodes/${event.session_id}-${dispatch.result_id}.json`,
      ...dispatch
    });
  }
  return summaries;
}

function delegatedDispatchFromEventMetadata(
  event: EpisodeEvent
): DelegatedDispatchParsed | null {
  const metadata = event.delegated_dispatch;
  if (!metadata) return null;
  return {
    action_id: metadata.action_id,
    result_id: metadata.result_id ?? null,
    ...(typeof metadata.result_ref === "string" && metadata.result_ref.length > 0 ? { result_ref: metadata.result_ref } : {}),
    envelope_ref: metadata.envelope_ref,
    round: metadata.round,
    sequence: metadata.sequence,
    task_chars: metadata.task_chars,
    context_chars: metadata.context_chars,
    input_contract_valid: typeof metadata.input_contract_valid === "boolean" ? metadata.input_contract_valid : null,
    input_contract_valid_present: typeof metadata.input_contract_valid === "boolean",
    input_digest: typeof metadata.input_digest === "string" ? metadata.input_digest : null,
    input_digest_present: typeof metadata.input_digest === "string",
    model_invoked: typeof metadata.model_invoked === "boolean" ? metadata.model_invoked : null,
    model_invoked_present: typeof metadata.model_invoked === "boolean",
    contract_status: metadata.contract_status,
    dispatch_failure_kind: metadata.dispatch_failure_kind === "none" ? null : metadata.dispatch_failure_kind,
    dispatch_failure_kind_present: true,
    result_failure_kind: metadata.result_failure_kind === "none" ? null : metadata.result_failure_kind,
    result_failure_kind_present: true,
    ok: metadata.ok
  };
}

function parseDelegatedDispatchSummary(summary: string): DelegatedDispatchParsed | null {
  const match = summary.match(/^Delegated result: action_id=([^;]+); round=(\d+); sequence=(\d+); task_chars=(\d+); context_chars=(\d+)(?:; input_contract_valid=(true|false|unknown); input_digest=([a-f0-9]{64}|unknown))?(?:; model_invoked=(true|false))?; contract_status=([a-z_]+)(?:; dispatch_failure_kind=([a-z_]+|none))?(?:; result_failure_kind=([a-z_]+|none))?; ok=(true|false)\.$/);
  if (!match) return null;
  const inputContractValid = match[6];
  const inputDigest = match[7];
  const modelInvoked = match[8];
  const dispatchFailureKind = match[10];
  const resultFailureKind = match[11];
  return {
    action_id: match[1].trim(),
    result_id: null,
    envelope_ref: null,
    round: Number.parseInt(match[2], 10),
    sequence: Number.parseInt(match[3], 10),
    task_chars: Number.parseInt(match[4], 10),
    context_chars: Number.parseInt(match[5], 10),
    input_contract_valid: parsedBooleanOrNull(inputContractValid),
    input_contract_valid_present: parsedBooleanOrNull(inputContractValid) !== null,
    input_digest: inputDigest && inputDigest !== "unknown" ? inputDigest : null,
    input_digest_present: Boolean(inputDigest && inputDigest !== "unknown"),
    model_invoked: modelInvoked === undefined ? null : modelInvoked === "true",
    model_invoked_present: modelInvoked !== undefined,
    contract_status: match[9],
    dispatch_failure_kind: dispatchFailureKind && dispatchFailureKind !== "none" ? dispatchFailureKind : null,
    dispatch_failure_kind_present: dispatchFailureKind !== undefined,
    result_failure_kind: resultFailureKind && resultFailureKind !== "none" ? resultFailureKind : null,
    result_failure_kind_present: resultFailureKind !== undefined,
    ok: match[12] === "true"
  };
}

function parsedBooleanOrNull(value: string | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

async function readModelDiagnostics(
  store: AgentStore,
  events: EpisodeEvent[]
): Promise<LiveRunModelDiagnosticSummary[]> {
  const diagnostics: LiveRunModelDiagnosticSummary[] = [];
  for (const event of events.filter((item) => item.kind === "model_diagnostic")) {
    const diagnosticRef = event.artifact_refs.find((ref) => ref.includes("-model-diagnostic-r") && ref.endsWith(".json"))
      ?? event.artifact_refs.find((ref) => ref.endsWith(".json"))
      ?? "";
    if (!diagnosticRef) continue;
    let raw: unknown;
    try {
      raw = await store.readStateJson<unknown>(diagnosticRef);
    } catch {
      raw = {};
    }
    const record = asRecord(raw);
    diagnostics.push({
      event_id: event.id,
      created_at: event.created_at,
      round: numberOrDefault(record.round, modelDiagnosticRoundNumber(diagnosticRef)),
      stage: stringOrDefault(record.stage, "unknown"),
      failure_kind: stringOrDefault(record.failure_kind, "unknown"),
      diagnostic_ref: diagnosticRef,
      response_ref: stringOrNull(record.response_ref),
      error_preview: stringOrDefault(record.error_preview, "")
    });
  }
  return diagnostics;
}

function extractRepoWriteGuardSummary(event: EpisodeEvent): LiveRunRepoWriteGuardSummary | null {
  if (event.kind !== "tool_result") return null;
  const match = event.summary.match(/^Wrote repo:(.+?) \(\d+ bytes\)\. workspace_guard: before=([a-z_]+) after=([a-z_]+) changed_files=(\d+)->(\d+) delta=(-?\d+) preexisting_dirty=(true|false) target_changed=(true|false)\.$/);
  if (!match) return null;
  return {
    event_id: event.id,
    created_at: event.created_at,
    path: match[1],
    before_status: match[2],
    after_status: match[3],
    before_changed_file_count: Number.parseInt(match[4], 10),
    after_changed_file_count: Number.parseInt(match[5], 10),
    changed_file_count_delta: Number.parseInt(match[6], 10),
    preexisting_dirty: match[7] === "true",
    target_changed_after_write: match[8] === "true"
  };
}

function delegatedFailureCount(report: CompletionVerificationReport): number {
  const typedCount = report.delegated_result_failure_kinds.reduce((sum, item) => sum + item.count, 0);
  if (typedCount > 0) return typedCount;

  const check = report.checks.find((item) => item.id === delegateAgentCompletionGateCheckId.delegatedResults);
  if (!check || (check.status !== "fail" && check.status !== "warning")) return 0;
  const match = check.summary.match(/Failed delegated result\(s\):\s*(\d+)/);
  if (match) return Number(match[1]);
  return check.refs.length > 0 ? check.refs.length : 1;
}

function matchesTraceRef(trace: LiveRunTraceSummary, requested: string): boolean {
  const reportBase = basename(trace.report_ref);
  const reportBaseWithoutExt = reportBase.replace(/\.json$/, "");
  return trace.report_ref === requested
    || trace.completion_id === requested
    || trace.session_id === requested
    || reportBase === requested
    || reportBaseWithoutExt === requested;
}

async function readTraceRounds(store: AgentStore, events: EpisodeEvent[]): Promise<LiveRunTraceRound[]> {
  const refs = unique(events
    .filter((event) => event.kind === "model_action")
    .flatMap((event) => event.artifact_refs)
    .filter((ref) => /-model-action-r\d+\.json$/.test(ref)))
    .sort((left, right) => roundNumber(left) - roundNumber(right) || left.localeCompare(right));
  const rounds: LiveRunTraceRound[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = modelActionEnvelopeSchema.safeParse(raw);
    if (!parsed.success) continue;
    const actionTypes = parsed.data.actions.map((action) => action.type);
    const actionCounts = countBy(actionTypes);
    const delegateActions = parsed.data.actions.filter((action) => action.type === "delegate_agent");
    const delegatedActionInputs = delegateActions.map((action, index) => ({
      action_id: action.id,
      sequence: index + 1,
      ...delegationInputMetadata(parseDelegationRequest(action))
    }));
    rounds.push({
      round: roundNumber(ref),
      envelope_ref: ref,
      summary: parsed.data.summary,
      completion_status: parsed.data.completion_claim.status,
      completion_verification_refs: [...parsed.data.completion_claim.verification_refs],
      action_counts: actionCounts,
      action_types: Object.keys(actionCounts).sort(),
      delegated_action_ids: delegateActions
        .map((action) => action.id)
        .sort(),
      delegated_action_sequence_by_id: Object.fromEntries(delegateActions
        .map((action, index) => [action.id, index + 1] as const)
        .sort(([left], [right]) => left.localeCompare(right))),
      delegated_action_inputs: delegatedActionInputs,
      harness_action_types: Object.keys(actionCounts).filter((type) => HARNESS_ACTION_TYPES.has(type)).sort()
    });
  }
  return rounds;
}

async function completionVerificationRefs(store: AgentStore): Promise<string[]> {
  return (await store.listStateFiles("memory/episodes"))
    .filter((ref) => ref.endsWith("-completion-verification.json"));
}

async function readEpisodeEvents(store: AgentStore): Promise<EpisodeEvent[]> {
  const text = await store.readStateText("memory/episodes/events.jsonl");
  if (!text) return [];
  const events: EpisodeEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = evidenceEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
    } catch {
      // Ignore malformed or partially written JSONL rows.
    }
  }
  return events;
}

function isHarnessActionEvent(event: EpisodeEvent): boolean {
  return event.kind === "report" && (
    event.summary.startsWith("Recorded model evidence note:")
    || event.summary.startsWith("Recorded model working checkpoint:")
    || event.summary.startsWith("Recorded state-only SOP draft candidate:")
    || event.summary.startsWith("Recorded memory proposal candidate:")
    || event.summary.startsWith("Recorded model audit request")
    || event.summary.startsWith("Recorded autonomy pause signal:")
  );
}

function roundNumber(ref: string): number {
  const match = basename(ref).match(/-model-action-r(\d+)\.json$/);
  return match ? Number(match[1]) : 0;
}

function modelDiagnosticRoundNumber(ref: string): number {
  const match = basename(ref).match(/-model-diagnostic-r(\d+)\.json$/);
  return match ? Number(match[1]) : 0;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function unique(refs: Array<string | null | undefined>): string[] {
  return [...new Set(refs.filter((ref): ref is string => typeof ref === "string" && ref.length > 0))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
