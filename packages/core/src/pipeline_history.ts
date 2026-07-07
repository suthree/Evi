import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import {
  pipelineSpecSchema,
  pipelineStageRunSchema,
  type PipelineRunResult,
  type PipelineSpec,
  type BlockedToolDiagnostic,
  type PipelineStageRun,
  type PipelineStageStatus
} from "./schemas.js";
import { AgentStore } from "./store.js";

export interface PipelineHistoryListResult {
  created_at: string;
  count: number;
  pipeline_refs: string[];
  runs: PipelineHistorySummary[];
}

export interface PipelineHistoryDetailResult {
  summary: PipelineHistorySummary;
  pipeline: PipelineSpec | null;
  stages: PipelineStageHistorySummary[];
  checkpoint: PipelineCheckpointRecord;
}

export interface PipelineHistorySummary {
  run_id: string;
  pipeline_id: string;
  task: string;
  status: PipelineRunStatus;
  verdict: string;
  pipeline_ref: string;
  checkpoint_ref: string;
  stage_run_refs: string[];
  stage_count: number;
  stage_status_counts: Partial<Record<PipelineStageStatus, number>>;
  failed_stage_ids: string[];
  blocked_stage_id: string | null;
  evidence_ref_count: number;
  blocked_tool_diagnostic_count: number;
  final_response_ref: string | null;
  query_ref: string | null;
  todo_ref: string | null;
  updated_at: string;
}

export interface PipelineStageHistorySummary {
  id: string;
  stage_id: string;
  attempt: number;
  status: PipelineStageStatus;
  ref: string;
  output_refs: string[];
  evidence_ref_count: number;
  model_response_count: number;
  envelope_count: number;
  blocked_tool_diagnostics: BlockedToolDiagnostic[];
  failure_kind: string | null;
  failure_message: string | null;
  completed_at: string | null;
}

type PipelineRunStatus = PipelineRunResult["status"];

interface PipelineCheckpointRecord {
  run_id: string;
  pipeline_id: string;
  status: PipelineRunStatus;
  blocked_stage_id?: string | null;
  stage_run_refs?: string[];
  evidence_refs?: string[];
  final_response_ref?: string | null;
  updated_at?: string;
}

interface PipelineHistoryRecord {
  summary: PipelineHistorySummary;
  pipeline: PipelineSpec | null;
  stages: PipelineStageHistorySummary[];
  checkpoint: PipelineCheckpointRecord;
}

export async function listPipelineRuns(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<PipelineHistoryListResult> {
  const records = await readPipelineHistoryRecords(store);
  const limit = args.limit ?? 10;
  const selected = records.slice(0, limit);
  return {
    created_at: new Date().toISOString(),
    count: selected.length,
    pipeline_refs: selected.map((item) => item.summary.pipeline_ref),
    runs: selected.map((item) => item.summary)
  };
}

export async function getPipelineRun(
  store: AgentStore,
  args: { pipelineRef: string }
): Promise<PipelineHistoryDetailResult> {
  const records = await readPipelineHistoryRecords(store);
  const requested = args.pipelineRef.trim();
  const record = records.find((item) =>
    item.summary.run_id === requested
    || item.summary.pipeline_id === requested
    || item.summary.pipeline_ref === requested
    || item.summary.checkpoint_ref === requested
    || dirname(item.summary.pipeline_ref) === requested
    || basename(dirname(item.summary.pipeline_ref)) === requested
  );
  if (!record) throw new Error(`Pipeline run not found: ${args.pipelineRef}`);
  return {
    summary: record.summary,
    pipeline: record.pipeline,
    stages: record.stages,
    checkpoint: record.checkpoint
  };
}

export function renderPipelineHistoryList(result: PipelineHistoryListResult): string {
  if (result.runs.length === 0) return "No pipeline runs.";
  return [
    "Pipeline runs",
    "",
    `count: ${result.count}`,
    "",
    ...result.runs.map((run, index) => renderPipelineSummary(run, index + 1)),
    "",
    "This command is read-only. It reads pipeline checkpoint and stage metadata only; it does not read raw stage output bodies or invoke the model."
  ].join("\n");
}

export function renderPipelineHistoryDetail(result: PipelineHistoryDetailResult): string {
  const run = result.summary;
  return [
    "Pipeline run",
    "",
    `id: ${run.run_id}`,
    `pipeline_id: ${run.pipeline_id}`,
    `status: ${run.status}`,
    `verdict: ${run.verdict}`,
    `task: ${truncate(run.task, 240)}`,
    `pipeline_ref: ${run.pipeline_ref}`,
    `checkpoint_ref: ${run.checkpoint_ref}`,
    `updated_at: ${run.updated_at}`,
    `blocked_stage_id: ${run.blocked_stage_id ?? "n/a"}`,
    `final_response_ref: ${run.final_response_ref ?? "n/a"}`,
    `query_ref: ${run.query_ref ?? "n/a"}`,
    `todo_ref: ${run.todo_ref ?? "n/a"}`,
    `evidence_refs: ${run.evidence_ref_count}`,
    `stage_status_counts: ${renderCounts(run.stage_status_counts)}`,
    "",
    "Stages",
    "",
    ...result.stages.map((stage, index) => renderStageSummary(stage, index + 1)),
    "",
    "This command is read-only. It does not read raw stage output Markdown, model responses, tool results, or prompt artifacts."
  ].join("\n");
}

async function readPipelineHistoryRecords(store: AgentStore): Promise<PipelineHistoryRecord[]> {
  const checkpointRefs = (await store.listStateFiles("pipelines", "checkpoint.json"))
    .sort();
  const records: PipelineHistoryRecord[] = [];
  for (const checkpointRef of checkpointRefs) {
    const checkpoint = normalizeCheckpoint(await store.readStateJson<unknown>(checkpointRef));
    if (!checkpoint) continue;
    const root = dirname(checkpointRef);
    const pipelineRef = `${root}/pipeline.json`;
    const queryRef = `${root}/query.md`;
    const todoRef = `${root}/todo.md`;
    const pipeline = pipelineSpecSchema.safeParse(await store.readStateJson<unknown>(pipelineRef));
    const stageRunRefs = checkpoint.stage_run_refs ?? [];
    const stages: PipelineStageHistorySummary[] = [];
    for (const ref of stageRunRefs) {
      const parsed = pipelineStageRunSchema.safeParse(await store.readStateJson<unknown>(ref));
      if (!parsed.success) continue;
      stages.push(stageSummary(ref, parsed.data));
    }
    const summary = runSummary({
      checkpointRef,
      pipelineRef,
      queryRef: existsSync(store.statePath(queryRef)) ? queryRef : null,
      todoRef: existsSync(store.statePath(todoRef)) ? todoRef : null,
      checkpoint,
      pipeline: pipeline.success ? pipeline.data : null,
      stages
    });
    records.push({
      summary,
      pipeline: pipeline.success ? pipeline.data : null,
      stages,
      checkpoint
    });
  }
  return records.sort((left, right) => right.summary.updated_at.localeCompare(left.summary.updated_at));
}

function runSummary(args: {
  checkpointRef: string;
  pipelineRef: string;
  queryRef: string | null;
  todoRef: string | null;
  checkpoint: PipelineCheckpointRecord;
  pipeline: PipelineSpec | null;
  stages: PipelineStageHistorySummary[];
}): PipelineHistorySummary {
  const failedStageIds = args.stages
    .filter((stage) => stage.status === "blocked" || stage.status === "failed")
    .map((stage) => stage.stage_id);
  return {
    run_id: args.checkpoint.run_id,
    pipeline_id: args.checkpoint.pipeline_id,
    task: args.pipeline?.task ?? "",
    status: args.checkpoint.status,
    verdict: args.checkpoint.status === "done" ? "pipeline_done" : `pipeline_${args.checkpoint.status}`,
    pipeline_ref: args.pipelineRef,
    checkpoint_ref: args.checkpointRef,
    stage_run_refs: args.checkpoint.stage_run_refs ?? [],
    stage_count: args.stages.length,
    stage_status_counts: countStageStatuses(args.stages),
    failed_stage_ids: failedStageIds,
    blocked_stage_id: args.checkpoint.blocked_stage_id ?? null,
    evidence_ref_count: args.checkpoint.evidence_refs?.length ?? 0,
    blocked_tool_diagnostic_count: args.stages.reduce((count, stage) => count + stage.blocked_tool_diagnostics.length, 0),
    final_response_ref: args.checkpoint.final_response_ref ?? null,
    query_ref: args.queryRef,
    todo_ref: args.todoRef,
    updated_at: args.checkpoint.updated_at ?? args.pipeline?.created_at ?? ""
  };
}

function stageSummary(ref: string, run: PipelineStageRun): PipelineStageHistorySummary {
  return {
    id: run.id,
    stage_id: run.stage_id,
    attempt: run.attempt,
    status: run.status,
    ref,
    output_refs: run.output_refs,
    evidence_ref_count: run.evidence_refs.length,
    model_response_count: run.model_response_refs.length,
    envelope_count: run.envelope_refs.length,
    blocked_tool_diagnostics: run.blocked_tool_diagnostics,
    failure_kind: run.failure_kind,
    failure_message: run.failure_message,
    completed_at: run.completed_at
  };
}

function countStageStatuses(stages: PipelineStageHistorySummary[]): Partial<Record<PipelineStageStatus, number>> {
  const counts: Partial<Record<PipelineStageStatus, number>> = {};
  for (const stage of stages) {
    counts[stage.status] = (counts[stage.status] ?? 0) + 1;
  }
  return counts;
}

function normalizeCheckpoint(value: unknown): PipelineCheckpointRecord | null {
  if (!isRecord(value)) return null;
  const runId = stringField(value, "run_id");
  const pipelineId = stringField(value, "pipeline_id");
  const status = stringField(value, "status");
  if (!runId || !pipelineId || !isPipelineStatus(status)) return null;
  return {
    run_id: runId,
    pipeline_id: pipelineId,
    status,
    blocked_stage_id: nullableStringField(value, "blocked_stage_id"),
    stage_run_refs: stringArrayField(value, "stage_run_refs"),
    evidence_refs: stringArrayField(value, "evidence_refs"),
    final_response_ref: nullableStringField(value, "final_response_ref"),
    updated_at: stringField(value, "updated_at") ?? ""
  };
}

function renderPipelineSummary(run: PipelineHistorySummary, index: number): string {
  return [
    `${index}. ${run.run_id}`,
    `   status: ${run.status}`,
    `   task: ${truncate(run.task, 180)}`,
    `   pipeline_ref: ${run.pipeline_ref}`,
    `   checkpoint_ref: ${run.checkpoint_ref}`,
    `   stages: ${run.stage_count} (${renderCounts(run.stage_status_counts)})`,
    `   blocked_tool_diagnostics: ${run.blocked_tool_diagnostic_count}`,
    `   updated_at: ${run.updated_at}`
  ].join("\n");
}

function renderStageSummary(stage: PipelineStageHistorySummary, index: number): string {
  const lines = [
    `${index}. ${stage.stage_id}`,
    `   id: ${stage.id}`,
    `   attempt: ${stage.attempt}`,
    `   status: ${stage.status}`,
    `   ref: ${stage.ref}`,
    `   outputs: ${stage.output_refs.length}`,
    `   evidence_refs: ${stage.evidence_ref_count}`,
    `   model_responses: ${stage.model_response_count}`,
    `   envelopes: ${stage.envelope_count}`,
    `   completed_at: ${stage.completed_at ?? "n/a"}`
  ];
  if (stage.failure_kind) lines.push(`   failure_kind: ${stage.failure_kind}`);
  if (stage.failure_message) lines.push(`   failure_message: ${truncate(stage.failure_message, 180)}`);
  for (const diagnostic of stage.blocked_tool_diagnostics) {
    lines.push(`   blocked_tool: tool=${diagnostic.tool}; failure_kind=${diagnostic.failure_kind}; evidence=${diagnostic.evidence_ref}; summary=${truncate(diagnostic.summary, 160)}`);
  }
  return lines.join("\n");
}

function renderCounts(counts: Partial<Record<PipelineStageStatus, number>>): string {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  return entries.length > 0 ? entries.map(([status, count]) => `${status}=${count}`).join(", ") : "none";
}

function isPipelineStatus(value: string | null): value is PipelineRunStatus {
  return value === "done" || value === "blocked" || value === "failed";
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" ? field : null;
}

function nullableStringField(value: Record<string, unknown>, key: string): string | null {
  return stringField(value, key);
}

function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  const field = value[key];
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;
}
