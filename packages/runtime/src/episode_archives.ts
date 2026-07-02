import type {
  EpisodeArchiveEventSummary,
  EpisodeArchiveRecord,
  EpisodeArchiveSessionSummary
} from "../../core/src/memory_store.js";
import { AgentStore } from "../../core/src/store.js";

const ARCHIVE_ROOT = "memory/archives";

export interface EpisodeArchiveSummary {
  ref: string;
  markdown_ref: string;
  date: string;
  created_at: string;
  event_count: number;
  session_count: number;
  kind_counts: Record<string, number>;
  first_event_at: string | null;
  last_event_at: string | null;
  top_sessions: Array<{
    session_id: string;
    event_count: number;
    last_event_at: string | null;
  }>;
  recent_event_ids: string[];
}

export interface EpisodeArchiveListResult {
  count: number;
  archive_refs: string[];
  archives: EpisodeArchiveSummary[];
}

export interface EpisodeArchiveShowResult {
  archive_ref: string;
  archive: EpisodeArchiveRecord;
}

export async function listEpisodeArchives(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<EpisodeArchiveListResult> {
  await store.ensureLayout();
  const refs = (await store.listStateFiles(ARCHIVE_ROOT))
    .filter((ref) => ref.endsWith(".json"));
  const archives: EpisodeArchiveSummary[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    if (isEpisodeArchiveRecord(raw)) {
      archives.push(toArchiveSummary(ref, raw));
    }
  }

  const limit = Math.max(1, args.limit ?? archives.length);
  const sorted = archives
    .sort((left, right) => right.date.localeCompare(left.date) || right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
  return {
    count: sorted.length,
    archive_refs: sorted.map((archive) => archive.ref),
    archives: sorted
  };
}

export async function getEpisodeArchive(
  store: AgentStore,
  args: { archiveRef: string }
): Promise<EpisodeArchiveShowResult> {
  await store.ensureLayout();
  const archiveRef = resolveArchiveRef(args.archiveRef);
  const raw = await store.readStateJson<unknown>(archiveRef);
  if (!isEpisodeArchiveRecord(raw)) {
    throw new Error(`Episode archive not found or invalid: ${archiveRef}`);
  }
  return {
    archive_ref: archiveRef,
    archive: raw
  };
}

function toArchiveSummary(ref: string, archive: EpisodeArchiveRecord): EpisodeArchiveSummary {
  return {
    ref,
    markdown_ref: archive.markdown_ref,
    date: archive.date,
    created_at: archive.created_at,
    event_count: archive.event_count,
    session_count: archive.session_count,
    kind_counts: archive.kind_counts,
    first_event_at: archive.first_event_at,
    last_event_at: archive.last_event_at,
    top_sessions: archive.sessions.slice(0, 3).map((session) => ({
      session_id: session.session_id,
      event_count: session.event_count,
      last_event_at: session.last_event_at
    })),
    recent_event_ids: archive.recent_events.slice(-5).map((event) => event.id)
  };
}

function resolveArchiveRef(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || trimmed === "undated") {
    return `${ARCHIVE_ROOT}/${trimmed}.json`;
  }
  if (trimmed.startsWith(`${ARCHIVE_ROOT}/`) && trimmed.endsWith(".md")) {
    return trimmed.replace(/\.md$/, ".json");
  }
  if (trimmed.startsWith(`${ARCHIVE_ROOT}/`) && trimmed.endsWith(".json")) {
    return trimmed;
  }
  if (trimmed.startsWith(`${ARCHIVE_ROOT}/`)) {
    return `${trimmed}.json`;
  }
  throw new Error("archive ref must be a YYYY-MM-DD date, undated, or memory/archives/*.json state ref");
}

function isEpisodeArchiveRecord(value: unknown): value is EpisodeArchiveRecord {
  if (!isRecord(value)) return false;
  return value.version === 1
    && typeof value.date === "string"
    && typeof value.source_ref === "string"
    && typeof value.archive_ref === "string"
    && typeof value.markdown_ref === "string"
    && typeof value.created_at === "string"
    && typeof value.event_count === "number"
    && typeof value.session_count === "number"
    && isRecord(value.kind_counts)
    && (typeof value.first_event_at === "string" || value.first_event_at === null)
    && (typeof value.last_event_at === "string" || value.last_event_at === null)
    && Array.isArray(value.sessions)
    && value.sessions.every(isArchiveSessionSummary)
    && Array.isArray(value.recent_events)
    && value.recent_events.every(isArchiveEventSummary);
}

function isArchiveSessionSummary(value: unknown): value is EpisodeArchiveSessionSummary {
  if (!isRecord(value)) return false;
  return typeof value.session_id === "string"
    && typeof value.event_count === "number"
    && isRecord(value.kind_counts)
    && (typeof value.first_event_at === "string" || value.first_event_at === null)
    && (typeof value.last_event_at === "string" || value.last_event_at === null)
    && Array.isArray(value.summaries)
    && value.summaries.every((item) => typeof item === "string")
    && Array.isArray(value.artifact_refs)
    && value.artifact_refs.every((item) => typeof item === "string");
}

function isArchiveEventSummary(value: unknown): value is EpisodeArchiveEventSummary {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.session_id === "string"
    && (typeof value.turn_id === "string" || value.turn_id === null)
    && typeof value.kind === "string"
    && typeof value.summary === "string"
    && Array.isArray(value.artifact_refs)
    && value.artifact_refs.every((item) => typeof item === "string")
    && (typeof value.created_at === "string" || value.created_at === null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
