import { basename } from "node:path";
import { completionVerificationReportSchema, type CompletionVerificationReport } from "./schemas.js";
import { AgentStore } from "./store.js";

export type CompletionVerificationCheckStatus = "pass" | "fail" | "warning" | "skipped";

export interface CompletionVerificationHistoryCheck {
  id: string;
  status: CompletionVerificationCheckStatus;
  summary: string;
  refs: string[];
}

export interface CompletionVerificationHistorySummary {
  report_ref: string;
  id: string;
  session_id: string;
  turn_id: string;
  created_at: string;
  completion_status: CompletionVerificationReport["completion_status"];
  verification_status: CompletionVerificationReport["verification_status"];
  verified: boolean;
  summary: string;
  envelope_ref: string;
  final_response_ref: string | null;
  claimed_verification_ref_count: number;
  observation_ref_count: number;
  delegated_result_failure_kinds: CompletionVerificationReport["delegated_result_failure_kinds"];
  failed_checks: CompletionVerificationHistoryCheck[];
  warning_checks: CompletionVerificationHistoryCheck[];
  boundary: string;
}

export interface CompletionVerificationHistoryListResult {
  count: number;
  report_refs: string[];
  reports: CompletionVerificationHistorySummary[];
}

export interface CompletionVerificationHistoryDetailResult {
  report_ref: string;
  report: CompletionVerificationReport;
}

export async function listCompletionVerificationReports(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<CompletionVerificationHistoryListResult> {
  await store.ensureLayout();
  const summaries = await readCompletionVerificationSummaries(store);
  const selected = summaries.slice(0, args.limit ?? summaries.length);
  return {
    count: selected.length,
    report_refs: selected.map((report) => report.report_ref),
    reports: selected
  };
}

export async function getCompletionVerificationReport(
  store: AgentStore,
  args: { completionRef: string }
): Promise<CompletionVerificationHistoryDetailResult> {
  await store.ensureLayout();
  const resolved = await resolveCompletionVerificationRef(store, args.completionRef);
  const raw = await store.readStateJson<unknown>(resolved);
  const parsed = completionVerificationReportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Completion verification report not found or invalid: ${resolved}`);
  }
  return {
    report_ref: resolved,
    report: parsed.data
  };
}

export async function readLatestCompletionVerificationSummaries(
  store: AgentStore,
  limit: number
): Promise<CompletionVerificationHistorySummary[]> {
  await store.ensureLayout();
  const summaries = await readCompletionVerificationSummaries(store);
  return summaries.slice(0, Math.max(0, limit));
}

export async function resolveCompletionVerificationRef(store: AgentStore, value: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("--completion requires a value");
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    throw new Error(`Unsafe completion verification ref: ${value}`);
  }
  const candidate = directCompletionVerificationRef(trimmed);
  if (candidate) {
    const raw = await store.readStateJson<unknown>(candidate);
    if (completionVerificationReportSchema.safeParse(raw).success) return candidate;
  }

  const byId = await findCompletionVerificationRefById(store, trimmed);
  if (byId) return byId;

  return candidate ?? `memory/episodes/${trimmed}-completion-verification.json`;
}

function directCompletionVerificationRef(value: string): string | null {
  if (value.startsWith("memory/episodes/") && value.endsWith("-completion-verification.json")) return value;
  const base = basename(value);
  const file = base.endsWith("-completion-verification")
    ? `${base}.json`
    : base.endsWith(".json")
      ? base
      : `${base}-completion-verification.json`;
  if (file.includes("/")) return null;
  return `memory/episodes/${file}`;
}

async function findCompletionVerificationRefById(store: AgentStore, id: string): Promise<string | null> {
  for (const ref of await completionVerificationRefs(store)) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = completionVerificationReportSchema.safeParse(raw);
    if (parsed.success && parsed.data.id === id) return ref;
  }
  return null;
}

async function readCompletionVerificationSummaries(store: AgentStore): Promise<CompletionVerificationHistorySummary[]> {
  const summaries: CompletionVerificationHistorySummary[] = [];
  for (const ref of await completionVerificationRefs(store)) {
    const raw = await store.readStateJson<unknown>(ref);
    const parsed = completionVerificationReportSchema.safeParse(raw);
    if (parsed.success) summaries.push(summarizeCompletionVerificationReport(ref, parsed.data));
  }
  return summaries.sort((left, right) =>
    right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id) || right.report_ref.localeCompare(left.report_ref)
  );
}

async function completionVerificationRefs(store: AgentStore): Promise<string[]> {
  return (await store.listStateFiles("memory/episodes"))
    .filter((ref) => ref.endsWith("-completion-verification.json"))
    .sort()
    .reverse();
}

function summarizeCompletionVerificationReport(
  ref: string,
  report: CompletionVerificationReport
): CompletionVerificationHistorySummary {
  return {
    report_ref: ref,
    id: report.id,
    session_id: report.session_id,
    turn_id: report.turn_id,
    created_at: report.created_at,
    completion_status: report.completion_status,
    verification_status: report.verification_status,
    verified: report.verified,
    summary: report.summary,
    envelope_ref: report.envelope_ref,
    final_response_ref: report.final_response_ref,
    claimed_verification_ref_count: report.claimed_verification_refs.length,
    observation_ref_count: report.observation_refs.length,
    delegated_result_failure_kinds: report.delegated_result_failure_kinds.map((item) => ({ ...item })),
    failed_checks: report.checks.filter((check) => check.status === "fail").map((check) => ({ ...check })),
    warning_checks: report.checks.filter((check) => check.status === "warning").map((check) => ({ ...check })),
    boundary: report.boundary
  };
}
