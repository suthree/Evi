import { basename } from "node:path";
import {
  completionVerificationReportSchema,
  evidenceEventSchema,
  modelActionEnvelopeSchema,
  type CompletionVerificationReport,
  type ModelActionEnvelope
} from "./schemas.js";
import { AgentStore } from "./store.js";

const HARNESS_ACTION_TYPES = new Set([
  "record_evidence",
  "update_working_state",
  "propose_sop",
  "propose_memory",
  "request_audit",
  "pause_autonomy"
]);

export interface LiveRunTraceRound {
  round: number;
  envelope_ref: string;
  summary: string;
  completion_status: ModelActionEnvelope["completion_claim"]["status"];
  action_counts: Record<string, number>;
  action_types: string[];
  harness_action_types: string[];
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

export interface LiveRunDelegatedDispatchSummary {
  event_id: string;
  created_at: string;
  result_ref: string;
  action_id: string;
  round: number;
  sequence: number;
  task_chars: number;
  context_chars: number;
  contract_status: string;
  ok: boolean;
}

export interface LiveRunTraceSummary {
  report_ref: string;
  completion_id: string;
  session_id: string;
  turn_id: string;
  created_at: string;
  completion_status: CompletionVerificationReport["completion_status"];
  verification_status: CompletionVerificationReport["verification_status"];
  verified: boolean;
  summary: string;
  context_ref?: string;
  context_manifest_ref?: string;
  final_response_ref: string | null;
  event_count: number;
  event_kind_counts: Record<string, number>;
  tool_result_count: number;
  delegated_result_count: number;
  delegated_result_passed_count: number;
  delegated_result_failed_count: number;
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

interface EpisodeEvent {
  id: string;
  session_id: string;
  turn_id: string;
  kind: string;
  summary: string;
  artifact_refs: string[];
  created_at: string;
}

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
  const reports: Array<{ ref: string; report: CompletionVerificationReport }> = [];
  for (const ref of await completionVerificationRefs(store)) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = completionVerificationReportSchema.safeParse(raw);
    if (parsed.success) reports.push({ ref, report: parsed.data });
  }
  return (await Promise.all(
    reports
      .sort((left, right) =>
        right.report.created_at.localeCompare(left.report.created_at)
        || right.report.id.localeCompare(left.report.id)
        || right.ref.localeCompare(left.ref)
      )
      .map((item) => summarizeLiveRunTrace(store, item.ref, item.report, events))
  )).filter((item): item is LiveRunTraceSummary => item !== null);
}

async function summarizeLiveRunTrace(
  store: AgentStore,
  reportRef: string,
  report: CompletionVerificationReport,
  events: EpisodeEvent[]
): Promise<LiveRunTraceSummary | null> {
  const runEvents = events.filter((event) =>
    event.session_id === report.session_id && event.turn_id === report.turn_id
  );
  const promptEvent = runEvents.find((event) => event.kind === "prompt");
  const contextRef = promptEvent?.artifact_refs.find((ref) => ref.endsWith("-context.md"));
  const contextManifestRef = promptEvent?.artifact_refs.find((ref) => ref.endsWith("-context.json"));
  const rounds = await readTraceRounds(store, report.session_id);
  const eventKindCounts = countBy(runEvents.map((event) => event.kind));
  const harnessActionCount = runEvents.filter((event) => isHarnessActionEvent(event)).length;
  const delegatedResultCount = eventKindCounts.delegated_result ?? 0;
  const delegatedResultFailedCount = delegatedFailureCount(report);
  const delegatedDispatches = readDelegatedDispatchSummaries(runEvents);
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
    ...report.observation_refs.slice(0, 12)
  ]);

  return {
    report_ref: reportRef,
    completion_id: report.id,
    session_id: report.session_id,
    turn_id: report.turn_id,
    created_at: report.created_at,
    completion_status: report.completion_status,
    verification_status: report.verification_status,
    verified: report.verified,
    summary: report.summary,
    context_ref: contextRef,
    context_manifest_ref: contextManifestRef,
    final_response_ref: report.final_response_ref,
    event_count: runEvents.length,
    event_kind_counts: eventKindCounts,
    tool_result_count: eventKindCounts.tool_result ?? 0,
    delegated_result_count: delegatedResultCount,
    delegated_result_passed_count: Math.max(0, delegatedResultCount - delegatedResultFailedCount),
    delegated_result_failed_count: delegatedResultFailedCount,
    delegated_dispatches: delegatedDispatches.slice(0, 5),
    harness_action_count: harnessActionCount,
    observation_ref_count: report.observation_refs.length,
    model_diagnostic_count: modelDiagnostics.length,
    model_diagnostics: modelDiagnostics.slice(0, 5),
    repo_write_guard_count: repoWriteGuards.length,
    repo_write_guards: repoWriteGuards.slice(0, 5),
    rounds,
    refs,
    boundary: [
      "read-only live run trace; reads completion reports, model action envelope metadata,",
      "model diagnostic summaries, episode event metadata, and harness-owned delegated dispatch",
      "event summaries only; repo write guard summaries are parsed from bounded tool-result event",
      "summaries; does not render raw model responses, tool bodies, delegated task/context/findings/output,",
      "raw delegated previews, final responses, or harness artifact bodies"
    ].join(" ")
  };
}

function readDelegatedDispatchSummaries(
  events: EpisodeEvent[]
): LiveRunDelegatedDispatchSummary[] {
  const summaries: LiveRunDelegatedDispatchSummary[] = [];
  for (const event of events.filter((item) => item.kind === "delegated_result")) {
    const parsed = parseDelegatedDispatchSummary(event.summary);
    if (!parsed) continue;
    summaries.push({
      event_id: event.id,
      created_at: event.created_at,
      result_ref: event.artifact_refs.find((ref) => ref.endsWith(".json")) ?? "",
      ...parsed
    });
  }
  return summaries;
}

function parseDelegatedDispatchSummary(summary: string): Omit<LiveRunDelegatedDispatchSummary, "event_id" | "created_at" | "result_ref"> | null {
  const match = summary.match(/^Delegated result: action_id=([^;]+); round=(\d+); sequence=(\d+); task_chars=(\d+); context_chars=(\d+); contract_status=([a-z_]+); ok=(true|false)\.$/);
  if (!match) return null;
  return {
    action_id: match[1].trim(),
    round: Number.parseInt(match[2], 10),
    sequence: Number.parseInt(match[3], 10),
    task_chars: Number.parseInt(match[4], 10),
    context_chars: Number.parseInt(match[5], 10),
    contract_status: match[6],
    ok: match[7] === "true"
  };
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
  const check = report.checks.find((item) => item.id === "delegated_results");
  if (!check || check.status !== "fail") return 0;
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

async function readTraceRounds(store: AgentStore, sessionId: string): Promise<LiveRunTraceRound[]> {
  const refs = (await store.listStateFiles("memory/episodes"))
    .filter((ref) => ref.startsWith(`memory/episodes/${sessionId}-model-action-r`) && ref.endsWith(".json"))
    .sort((left, right) => roundNumber(left) - roundNumber(right) || left.localeCompare(right));
  const rounds: LiveRunTraceRound[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = modelActionEnvelopeSchema.safeParse(raw);
    if (!parsed.success) continue;
    const actionTypes = parsed.data.actions.map((action) => action.type);
    const actionCounts = countBy(actionTypes);
    rounds.push({
      round: roundNumber(ref),
      envelope_ref: ref,
      summary: parsed.data.summary,
      completion_status: parsed.data.completion_claim.status,
      action_counts: actionCounts,
      action_types: Object.keys(actionCounts).sort(),
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
