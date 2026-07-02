import { basename } from "node:path";
import {
  evidenceEventSchema,
  workingCheckpointSchema,
  type EvidenceEvent,
  type WorkingCheckpoint
} from "./schemas.js";
import { AgentStore } from "./store.js";

const WORKING_ROOT = "memory/working";
const EVENTS_REF = "memory/episodes/events.jsonl";
const BOUNDARY = "read-only working checkpoint status; reads bounded checkpoint JSON and episode event metadata only, never raw evidence artifacts";

export interface WorkingCheckpointSummary {
  id: string;
  ref: string;
  is_current: boolean;
  goal: string;
  current_step: string;
  next_action: string;
  known_constraint_count: number;
  recent_evidence_ref_count: number;
  open_question_count: number;
  recent_evidence_refs: string[];
  open_questions: string[];
  created_at: string | null;
  evidence_event_refs: string[];
  boundary: string;
}

export interface WorkingCheckpointListResult {
  count: number;
  checkpoint_refs: string[];
  current: WorkingCheckpointSummary | null;
  checkpoints: WorkingCheckpointSummary[];
  boundary: string;
}

export interface WorkingCheckpointDetailResult {
  checkpoint_ref: string;
  summary: WorkingCheckpointSummary;
  checkpoint: WorkingCheckpoint;
  boundary: string;
}

export function needsWorkingCheckpointAttention(checkpoint: WorkingCheckpointSummary): boolean {
  if (checkpoint.open_question_count > 0) return true;
  return hasWorkingCheckpointBlockedSignal(checkpoint);
}

export function hasWorkingCheckpointBlockedSignal(checkpoint: WorkingCheckpointSummary): boolean {
  const signal = `${checkpoint.current_step}\n${checkpoint.next_action}`;
  return /\b(blocked|failed|not_done|unfinished|resume|stale|gap)\b/i.test(signal);
}

export async function listWorkingCheckpoints(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<WorkingCheckpointListResult> {
  const records = await readWorkingCheckpointRecords(store);
  const selected = records.slice(0, args.limit ?? records.length);
  const current = records.find((record) => record.is_current) ?? null;
  return {
    count: selected.length,
    checkpoint_refs: selected.map((record) => record.ref),
    current,
    checkpoints: selected,
    boundary: BOUNDARY
  };
}

export async function getWorkingCheckpoint(
  store: AgentStore,
  args: { checkpointRef?: string } = {}
): Promise<WorkingCheckpointDetailResult> {
  const records = await readWorkingCheckpointRecords(store);
  const requested = args.checkpointRef?.trim() || "current";
  const record = findWorkingCheckpoint(records, requested);
  if (!record) throw new Error(`Working checkpoint not found: ${requested}`);
  const raw = await store.readStateJson<unknown>(record.ref);
  const parsed = workingCheckpointSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Working checkpoint not found or invalid: ${record.ref}`);
  return {
    checkpoint_ref: record.ref,
    summary: record,
    checkpoint: parsed.data,
    boundary: BOUNDARY
  };
}

async function readWorkingCheckpointRecords(store: AgentStore): Promise<WorkingCheckpointSummary[]> {
  await store.ensureLayout();
  const eventIndex = await readWorkingCheckpointEventIndex(store);
  const refs = (await store.listStateFiles(WORKING_ROOT))
    .filter((ref) => ref.endsWith(".json"))
    .sort();
  const records: WorkingCheckpointSummary[] = [];
  for (const ref of refs) {
    const parsed = workingCheckpointSchema.safeParse(await store.readStateJson<unknown>(ref));
    if (!parsed.success) continue;
    records.push(summaryFromCheckpoint(ref, parsed.data, eventIndex.get(ref) ?? []));
  }
  return records.sort(compareWorkingCheckpoints);
}

function summaryFromCheckpoint(
  ref: string,
  checkpoint: WorkingCheckpoint,
  events: EvidenceEvent[]
): WorkingCheckpointSummary {
  const createdAt = checkpoint.created_at ?? events.map((event) => event.created_at).sort().at(-1) ?? null;
  return {
    id: checkpointId(ref),
    ref,
    is_current: ref === `${WORKING_ROOT}/current.json`,
    goal: checkpoint.goal,
    current_step: checkpoint.current_step,
    next_action: checkpoint.next_action,
    known_constraint_count: checkpoint.known_constraints.length,
    recent_evidence_ref_count: checkpoint.recent_evidence_refs.length,
    open_question_count: checkpoint.open_questions.length,
    recent_evidence_refs: checkpoint.recent_evidence_refs.slice(0, 10),
    open_questions: checkpoint.open_questions.slice(0, 5),
    created_at: createdAt,
    evidence_event_refs: events.map((event) => `${EVENTS_REF}#${event.id}`).slice(0, 5),
    boundary: BOUNDARY
  };
}

async function readWorkingCheckpointEventIndex(store: AgentStore): Promise<Map<string, EvidenceEvent[]>> {
  const index = new Map<string, EvidenceEvent[]>();
  const raw = await store.readStateText(EVENTS_REF);
  if (!raw.trim()) return index;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = evidenceEventSchema.safeParse(JSON.parse(line));
      if (!parsed.success) continue;
      for (const ref of parsed.data.artifact_refs.filter((item) => item.startsWith(WORKING_ROOT))) {
        const events = index.get(ref) ?? [];
        events.push(parsed.data);
        index.set(ref, events);
      }
    } catch {
      continue;
    }
  }
  return index;
}

function findWorkingCheckpoint(
  records: WorkingCheckpointSummary[],
  value: string
): WorkingCheckpointSummary | undefined {
  if (value === "current") return records.find((record) => record.is_current);
  const normalized = directWorkingCheckpointRef(value);
  return records.find((record) =>
    record.ref === normalized
    || record.ref === value
    || record.id === value
    || basename(record.ref) === value
  );
}

function directWorkingCheckpointRef(value: string): string {
  if (value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`Unsafe working checkpoint ref: ${value}`);
  }
  if (value.startsWith(`${WORKING_ROOT}/`) && value.endsWith(".json")) return value;
  if (value.startsWith("working/") && value.endsWith(".json")) return `memory/${value}`;
  if (value.endsWith(".json")) return `${WORKING_ROOT}/${basename(value)}`;
  return `${WORKING_ROOT}/${value}.json`;
}

function checkpointId(ref: string): string {
  return basename(ref).replace(/\.json$/, "");
}

function compareWorkingCheckpoints(left: WorkingCheckpointSummary, right: WorkingCheckpointSummary): number {
  if (left.is_current !== right.is_current) return left.is_current ? -1 : 1;
  const leftTime = left.created_at ?? "";
  const rightTime = right.created_at ?? "";
  return rightTime.localeCompare(leftTime) || right.ref.localeCompare(left.ref);
}
