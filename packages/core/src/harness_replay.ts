import { basename } from "node:path";
import { evidenceEventSchema } from "./schemas.js";
import {
  getLiveRunTrace,
  listLiveRunTraces,
  type LiveRunTraceSummary
} from "./live_run_trace.js";
import { newId, utcNow } from "./ids.js";
import { AgentStore } from "./store.js";

const REPLAY_ROOT = "governance/replays";

export type HarnessReplayAuditStatus = "clean" | "attention";
export type HarnessReplayAuditCheckStatus = "pass" | "warning";

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
    harness_state_actions: number;
    model_diagnostics: number;
    repo_write_guards: number;
    observation_refs: number;
  };
  checks: HarnessReplayAuditCheck[];
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
  const status: HarnessReplayAuditStatus = checks.some((check) => check.status === "warning") ? "attention" : "clean";
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
      harness_state_actions: trace.harness_action_count,
      model_diagnostics: trace.model_diagnostic_count,
      repo_write_guards: trace.repo_write_guard_count,
      observation_refs: trace.observation_ref_count
    },
    checks,
    artifact_refs: {
      json_ref: jsonRef,
      markdown_ref: markdownRef
    },
    refs: unique([
      trace.report_ref,
      trace.context_manifest_ref,
      ...trace.rounds.map((round) => round.envelope_ref),
      ...trace.model_diagnostics.map((diagnostic) => diagnostic.diagnostic_ref),
      ...trace.repo_write_guards.map((guard) => `${trace.report_ref}#${guard.event_id}`)
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
    {
      id: "delegated_result_contract",
      status: trace.delegated_result_failed_count > 0 ? "warning" : "pass",
      summary: `delegated_results=${trace.delegated_result_count}; failed=${trace.delegated_result_failed_count}`,
      refs: [trace.report_ref]
    },
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

function replaySummary(trace: LiveRunTraceSummary, status: HarnessReplayAuditStatus): string {
  const warnings = [
    trace.verification_status !== "passed" || !trace.verified ? "completion verification attention" : null,
    trace.delegated_result_failed_count > 0 ? "delegated result failure" : null,
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
      harness_state_actions: numberField(record.metrics, "harness_state_actions") ?? 0,
      model_diagnostics: numberField(record.metrics, "model_diagnostics") ?? 0,
      repo_write_guards: numberField(record.metrics, "repo_write_guards") ?? 0,
      observation_refs: numberField(record.metrics, "observation_refs") ?? 0
    },
    checks,
    artifact_refs: {
      json_ref: jsonRef,
      markdown_ref: markdownRef
    },
    refs: record.refs.filter((item): item is string => typeof item === "string"),
    boundary: record.boundary
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
  return value === "pass" || value === "warning";
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
