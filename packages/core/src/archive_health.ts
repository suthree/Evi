import type { EpisodeArchiveRecord } from "./memory_store.js";
import { AgentStore } from "./store.js";

const EPISODE_EVENTS_REF = "memory/episodes/events.jsonl";
const ARCHIVE_ROOT = "memory/archives";

export type ArchiveHealthStatus = "healthy" | "degraded" | "unhealthy";
export type ArchiveHealthIssueKind =
  | "missing_archive"
  | "stale_archive"
  | "invalid_archive"
  | "orphan_archive"
  | "invalid_event_row";
export type ArchiveHealthIssueStatus = "warning" | "error";

export interface ArchiveHealthIssue {
  id: string;
  kind: ArchiveHealthIssueKind;
  status: ArchiveHealthIssueStatus;
  ref: string;
  date: string | null;
  archive_ref: string | null;
  markdown_ref: string | null;
  source_ref: string;
  source_event_count: number | null;
  archive_event_count: number | null;
  source_session_count: number | null;
  archive_session_count: number | null;
  source_last_event_at: string | null;
  archive_last_event_at: string | null;
  archive_created_at: string | null;
  reason: string;
  next_step: string;
  inspect_command: string;
  refresh_command: string | null;
  boundary: string;
}

export interface ArchiveHealthResult {
  action: "archive-health";
  status: ArchiveHealthStatus;
  checked_at: string;
  source_ref: string;
  source_event_count: number;
  source_day_count: number;
  invalid_event_row_count: number;
  archive_count: number;
  valid_archive_count: number;
  invalid_archive_count: number;
  missing_archive_count: number;
  stale_archive_count: number;
  orphan_archive_count: number;
  open_day: {
    date: string;
    source_event_count: number;
    archive_event_count: number | null;
    archive_status: "missing" | "current" | "stale";
  } | null;
  count: number;
  issue_refs: string[];
  issues: ArchiveHealthIssue[];
  boundary: string;
}

interface EpisodeEventMeta {
  id: string;
  session_id: string;
  kind: string;
  created_at: string | null;
  row_index: number;
}

interface EventDaySummary {
  date: string;
  event_count: number;
  session_count: number;
  kind_counts: Record<string, number>;
  first_event_at: string | null;
  last_event_at: string | null;
}

interface ArchiveRow {
  ref: string;
  archive: EpisodeArchiveRecord;
}

const BOUNDARY = "read-only archive health diagnostics; reads episode event JSONL metadata and archive summary JSON only, does not read raw episode artifacts, rebuild indexes, write archives, invoke the model, or mutate state";

export async function getArchiveHealth(
  store: AgentStore,
  args: { limit?: number; archiveRef?: string; now?: Date | string } = {}
): Promise<ArchiveHealthResult> {
  await store.ensureLayout();
  const now = args.now instanceof Date ? args.now : new Date(args.now ?? Date.now());
  const checkedAt = now.toISOString();
  const openDayDate = checkedAt.slice(0, 10);
  const eventsText = await store.readStateText(EPISODE_EVENTS_REF);
  const parsedEvents = parseEpisodeEvents(eventsText);
  const daySummaries = summarizeEventDays(parsedEvents.events);
  const dayByDate = new Map(daySummaries.map((summary) => [summary.date, summary]));
  const archiveRefs = (await store.listStateFiles(ARCHIVE_ROOT)).filter((ref) => ref.endsWith(".json"));
  const archives: ArchiveRow[] = [];
  const issues: ArchiveHealthIssue[] = [];

  for (const invalid of parsedEvents.invalid_rows) {
    issues.push(invalidEventIssue(invalid.row_index, invalid.reason));
  }

  for (const ref of archiveRefs) {
    const parsed = parseArchiveRecord(ref, await store.readStateText(ref));
    if (parsed.ok) {
      archives.push({ ref, archive: parsed.archive });
    } else {
      issues.push(invalidArchiveIssue(ref, parsed.date, parsed.reason));
    }
  }

  const archiveByDate = new Map(archives.map((row) => [row.archive.date, row]));
  for (const day of daySummaries) {
    const archiveRow = archiveByDate.get(day.date);
    if (day.date === openDayDate) continue;
    if (!archiveRow) {
      issues.push(missingArchiveIssue(day));
      continue;
    }
    if (archiveIsStale(day, archiveRow.archive)) {
      issues.push(staleArchiveIssue(day, archiveRow));
    }
  }

  for (const row of archives) {
    if (dayByDate.has(row.archive.date)) continue;
    issues.push(orphanArchiveIssue(row));
  }

  issues.sort(compareIssues);
  const scopedIssues = args.archiveRef
    ? issues.filter((issue) => matchesIssueSelector(issue, args.archiveRef ?? ""))
    : issues;
  const limit = args.limit ?? scopedIssues.length;
  const selected = scopedIssues.slice(0, Math.max(0, limit));
  const invalidArchiveCount = issues.filter((issue) => issue.kind === "invalid_archive").length;
  const invalidEventRowCount = issues.filter((issue) => issue.kind === "invalid_event_row").length;
  const missingArchiveCount = issues.filter((issue) => issue.kind === "missing_archive").length;
  const staleArchiveCount = issues.filter((issue) => issue.kind === "stale_archive").length;
  const orphanArchiveCount = issues.filter((issue) => issue.kind === "orphan_archive").length;
  const openDay = dayByDate.get(openDayDate);
  const openDayArchive = archiveByDate.get(openDayDate)?.archive;

  return {
    action: "archive-health",
    status: issues.some((issue) => issue.status === "error")
      ? "unhealthy"
      : issues.length > 0
        ? "degraded"
        : "healthy",
    checked_at: checkedAt,
    source_ref: EPISODE_EVENTS_REF,
    source_event_count: parsedEvents.events.length,
    source_day_count: daySummaries.length,
    invalid_event_row_count: invalidEventRowCount,
    archive_count: archiveRefs.length,
    valid_archive_count: archives.length,
    invalid_archive_count: invalidArchiveCount,
    missing_archive_count: missingArchiveCount,
    stale_archive_count: staleArchiveCount,
    orphan_archive_count: orphanArchiveCount,
    open_day: openDay
      ? {
          date: openDayDate,
          source_event_count: openDay.event_count,
          archive_event_count: openDayArchive?.event_count ?? null,
          archive_status: openDayArchiveStatus(openDay, openDayArchive)
        }
      : null,
    count: selected.length,
    issue_refs: selected.map((issue) => issue.ref),
    issues: selected,
    boundary: BOUNDARY
  };
}

function openDayArchiveStatus(
  day: EventDaySummary,
  archive: EpisodeArchiveRecord | undefined
): "missing" | "current" | "stale" {
  if (!archive) return "missing";
  return archiveIsStale(day, archive) ? "stale" : "current";
}

function parseEpisodeEvents(raw: string): {
  events: EpisodeEventMeta[];
  invalid_rows: Array<{ row_index: number; reason: string }>;
} {
  const events: EpisodeEventMeta[] = [];
  const invalidRows: Array<{ row_index: number; reason: string }> = [];
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      invalidRows.push({ row_index: index + 1, reason: `episode event JSON is invalid: ${errorMessage(error)}` });
      continue;
    }
    if (!isRecord(parsed)) {
      invalidRows.push({ row_index: index + 1, reason: "episode event row is not a JSON object" });
      continue;
    }
    const summary = getString(parsed.summary) ?? JSON.stringify(parsed);
    if (!summary.trim()) {
      invalidRows.push({ row_index: index + 1, reason: "episode event row has no usable summary" });
      continue;
    }
    const createdAt = parsed.created_at;
    if (createdAt !== undefined && createdAt !== null && !isUtcTimestamp(createdAt)) {
      invalidRows.push({ row_index: index + 1, reason: "episode event created_at is not a valid UTC timestamp" });
      continue;
    }
    events.push({
      id: getString(parsed.id) ?? `row_${index + 1}`,
      session_id: getString(parsed.session_id) ?? "unknown_session",
      kind: getString(parsed.kind) ?? "unknown",
      created_at: typeof createdAt === "string" ? createdAt : null,
      row_index: index + 1
    });
  }
  return { events, invalid_rows: invalidRows };
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  return parsed.toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z");
}

function summarizeEventDays(events: EpisodeEventMeta[]): EventDaySummary[] {
  const byDate = new Map<string, EpisodeEventMeta[]>();
  for (const event of events) {
    const date = archiveDate(event.created_at);
    byDate.set(date, [...(byDate.get(date) ?? []), event]);
  }
  return [...byDate.entries()]
    .map(([date, dayEvents]) => ({
      date,
      event_count: dayEvents.length,
      session_count: new Set(dayEvents.map((event) => event.session_id)).size,
      kind_counts: countBy(dayEvents.map((event) => event.kind)),
      first_event_at: firstEventAt(dayEvents),
      last_event_at: lastEventAt(dayEvents)
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function parseArchiveRecord(ref: string, raw: string): { ok: true; archive: EpisodeArchiveRecord } | { ok: false; date: string | null; reason: string } {
  if (!raw.trim()) return { ok: false, date: archiveDateFromRef(ref), reason: "archive JSON is empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return { ok: false, date: archiveDateFromRef(ref), reason: `archive JSON is invalid: ${errorMessage(error)}` };
  }
  if (!isArchiveRecord(parsed)) {
    return { ok: false, date: archiveDateFromRef(ref), reason: "archive JSON does not match EpisodeArchiveRecord v1 metadata" };
  }
  return { ok: true, archive: parsed };
}

function archiveIsStale(day: EventDaySummary, archive: EpisodeArchiveRecord): boolean {
  return archive.event_count !== day.event_count
    || archive.session_count !== day.session_count
    || archive.last_event_at !== day.last_event_at
    || !countsEqual(archive.kind_counts, day.kind_counts);
}

function countsEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function missingArchiveIssue(day: EventDaySummary): ArchiveHealthIssue {
  const archiveRef = archiveRefForDate(day.date);
  const inspect = inspectCommand(day.date);
  const refreshCommand = refreshCommandForArchive();
  return {
    id: `archive_health_missing_${safeId(day.date)}`,
    kind: "missing_archive",
    status: "error",
    ref: archiveRef,
    date: day.date,
    archive_ref: archiveRef,
    markdown_ref: markdownRefForDate(day.date),
    source_ref: EPISODE_EVENTS_REF,
    source_event_count: day.event_count,
    archive_event_count: null,
    source_session_count: day.session_count,
    archive_session_count: null,
    source_last_event_at: day.last_event_at,
    archive_last_event_at: null,
    archive_created_at: null,
    reason: `episode events for ${day.date} have no daily archive summary`,
    next_step: `Inspect archive health for ${day.date}, then run the explicit local archive command if the missing summary is still needed: ${refreshCommand}`,
    inspect_command: inspect,
    refresh_command: refreshCommand,
    boundary: BOUNDARY
  };
}

function staleArchiveIssue(day: EventDaySummary, row: ArchiveRow): ArchiveHealthIssue {
  const inspect = inspectCommand(day.date);
  const refreshCommand = refreshCommandForArchive();
  return {
    id: `archive_health_stale_${safeId(day.date)}`,
    kind: "stale_archive",
    status: "error",
    ref: row.ref,
    date: day.date,
    archive_ref: row.ref,
    markdown_ref: row.archive.markdown_ref,
    source_ref: EPISODE_EVENTS_REF,
    source_event_count: day.event_count,
    archive_event_count: row.archive.event_count,
    source_session_count: day.session_count,
    archive_session_count: row.archive.session_count,
    source_last_event_at: day.last_event_at,
    archive_last_event_at: row.archive.last_event_at,
    archive_created_at: row.archive.created_at,
    reason: `archive summary for ${day.date} is stale against episode event metadata`,
    next_step: `Inspect archive health for ${day.date}, then refresh daily summaries explicitly if the stale archive is still relevant: ${refreshCommand}`,
    inspect_command: inspect,
    refresh_command: refreshCommand,
    boundary: BOUNDARY
  };
}

function invalidArchiveIssue(ref: string, date: string | null, reason: string): ArchiveHealthIssue {
  const selector = date ?? ref;
  return {
    id: `archive_health_invalid_archive_${safeId(ref)}`,
    kind: "invalid_archive",
    status: "error",
    ref,
    date,
    archive_ref: ref,
    markdown_ref: ref.endsWith(".json") ? ref.replace(/\.json$/, ".md") : null,
    source_ref: EPISODE_EVENTS_REF,
    source_event_count: null,
    archive_event_count: null,
    source_session_count: null,
    archive_session_count: null,
    source_last_event_at: null,
    archive_last_event_at: null,
    archive_created_at: null,
    reason,
    next_step: `Inspect archive health for ${selector}, then externally restore or retire the invalid archive summary.`,
    inspect_command: inspectCommand(selector),
    refresh_command: null,
    boundary: BOUNDARY
  };
}

function orphanArchiveIssue(row: ArchiveRow): ArchiveHealthIssue {
  return {
    id: `archive_health_orphan_${safeId(row.archive.date)}`,
    kind: "orphan_archive",
    status: "warning",
    ref: row.ref,
    date: row.archive.date,
    archive_ref: row.ref,
    markdown_ref: row.archive.markdown_ref,
    source_ref: EPISODE_EVENTS_REF,
    source_event_count: 0,
    archive_event_count: row.archive.event_count,
    source_session_count: 0,
    archive_session_count: row.archive.session_count,
    source_last_event_at: null,
    archive_last_event_at: row.archive.last_event_at,
    archive_created_at: row.archive.created_at,
    reason: `archive summary for ${row.archive.date} has no matching episode events in the current source JSONL`,
    next_step: `Inspect archive health for ${row.archive.date}, then externally retire the orphan archive if it is historical.`,
    inspect_command: inspectCommand(row.archive.date),
    refresh_command: null,
    boundary: BOUNDARY
  };
}

function invalidEventIssue(rowIndex: number, reason: string): ArchiveHealthIssue {
  const ref = `${EPISODE_EVENTS_REF}#${rowIndex}`;
  const id = `archive_health_invalid_event_row_${rowIndex}`;
  return {
    id,
    kind: "invalid_event_row",
    status: "error",
    ref,
    date: null,
    archive_ref: null,
    markdown_ref: null,
    source_ref: EPISODE_EVENTS_REF,
    source_event_count: null,
    archive_event_count: null,
    source_session_count: null,
    archive_session_count: null,
    source_last_event_at: null,
    archive_last_event_at: null,
    archive_created_at: null,
    reason,
    next_step: `Inspect archive health issue ${id}, then externally repair or retire the malformed episode event row before trusting archive coverage.`,
    inspect_command: inspectCommand(id),
    refresh_command: null,
    boundary: BOUNDARY
  };
}

function inspectCommand(selector: string): string {
  return `pnpm run runtime -- memory archive-health --archive ${shellArg(selector)} --state-root <state-root>`;
}

function refreshCommandForArchive(): string {
  return "pnpm run runtime -- memory archive --state-root <state-root>";
}

function matchesIssueSelector(issue: ArchiveHealthIssue, selector: string): boolean {
  const value = selector.trim();
  if (!value) return false;
  return issue.id === value
    || issue.ref === value
    || issue.date === value
    || issue.archive_ref === value
    || issue.markdown_ref === value
    || (value.endsWith(".md") && issue.markdown_ref === value)
    || (value.endsWith(".json") && issue.archive_ref === value);
}

function compareIssues(left: ArchiveHealthIssue, right: ArchiveHealthIssue): number {
  return issueRank(left) - issueRank(right)
    || (right.source_last_event_at ?? right.archive_last_event_at ?? "").localeCompare(left.source_last_event_at ?? left.archive_last_event_at ?? "")
    || left.ref.localeCompare(right.ref);
}

function issueRank(issue: ArchiveHealthIssue): number {
  if (issue.status === "error") {
    if (issue.kind === "invalid_event_row") return 0;
    if (issue.kind === "invalid_archive") return 1;
    if (issue.kind === "missing_archive") return 2;
    return 3;
  }
  return 4;
}

function archiveRefForDate(date: string): string {
  return `${ARCHIVE_ROOT}/${date}.json`;
}

function markdownRefForDate(date: string): string {
  return `${ARCHIVE_ROOT}/${date}.md`;
}

function archiveDate(createdAt: string | null): string {
  if (!createdAt) return "undated";
  const date = createdAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "undated";
}

function archiveDateFromRef(ref: string): string | null {
  const match = ref.match(/^memory\/archives\/([^/]+)\.json$/);
  return match?.[1] ?? null;
}

function firstEventAt(events: EpisodeEventMeta[]): string | null {
  return events.map((event) => event.created_at).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
}

function lastEventAt(events: EpisodeEventMeta[]): string | null {
  return events.map((event) => event.created_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function isArchiveRecord(value: unknown): value is EpisodeArchiveRecord {
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
    && Array.isArray(value.recent_events);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "unknown";
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@#-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
