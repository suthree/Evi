import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { utcNow } from "./ids.js";
import { AgentStore } from "./store.js";

const EPISODE_EVENTS_REF = "memory/episodes/events.jsonl";
const EPISODE_INDEX_REF = "memory/index/episodes.sqlite";

export interface EpisodeEventRecord {
  id: string;
  session_id: string;
  turn_id: string | null;
  kind: string;
  summary: string;
  artifact_refs: string[];
  created_at: string | null;
  source_ref: string;
  row_index: number;
  raw: Record<string, unknown>;
}

export interface MemorySyncResult {
  source_ref: string;
  db_ref: string;
  db_path: string;
  total_rows: number;
  indexed_rows: number;
  skipped_rows: number;
}

export interface MemoryStoreStats {
  db_ref: string;
  db_path: string;
  events_count: number;
  sessions_count: number;
}

export interface EpisodeSearchHit extends EpisodeEventRecord {
  score: number;
}

export interface EpisodeArchiveEventSummary {
  id: string;
  session_id: string;
  turn_id: string | null;
  kind: string;
  summary: string;
  artifact_refs: string[];
  created_at: string | null;
}

export interface EpisodeArchiveSessionSummary {
  session_id: string;
  event_count: number;
  kind_counts: Record<string, number>;
  first_event_at: string | null;
  last_event_at: string | null;
  summaries: string[];
  artifact_refs: string[];
}

export interface EpisodeArchiveRecord {
  version: 1;
  date: string;
  source_ref: string;
  archive_ref: string;
  markdown_ref: string;
  created_at: string;
  event_count: number;
  session_count: number;
  kind_counts: Record<string, number>;
  first_event_at: string | null;
  last_event_at: string | null;
  sessions: EpisodeArchiveSessionSummary[];
  recent_events: EpisodeArchiveEventSummary[];
}

export interface EpisodeArchiveResult {
  source_ref: string;
  archive_root_ref: string;
  total_events: number;
  archived_days: EpisodeArchiveRecord[];
}

interface EpisodeSqlRow {
  id: string;
  session_id: string;
  turn_id: string | null;
  kind: string;
  summary: string;
  artifact_refs_json: string;
  created_at: string | null;
  source_ref: string;
  row_index: number;
  raw_json: string;
  score?: number;
}

export class MemoryStore {
  readonly dbRef = EPISODE_INDEX_REF;
  readonly sourceRef = EPISODE_EVENTS_REF;
  readonly dbPath: string;
  private db: DatabaseSync | null = null;

  constructor(private readonly store: AgentStore) {
    this.dbPath = store.statePath(EPISODE_INDEX_REF);
  }

  async syncEpisodeEvents(): Promise<MemorySyncResult> {
    const db = await this.open();
    const sourcePath = this.store.statePath(EPISODE_EVENTS_REF);
    const raw = existsSync(sourcePath) ? await readFile(sourcePath, "utf8") : "";
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const records: EpisodeEventRecord[] = [];
    let skippedRows = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const record = parseEpisodeEvent(lines[index], EPISODE_EVENTS_REF, index + 1);
      if (record) records.push(record);
      else skippedRows += 1;
    }

    const insertEvent = db.prepare(`
      INSERT INTO episode_events (
        id, session_id, turn_id, kind, summary, artifact_refs_json,
        created_at, source_ref, row_index, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFts = db.prepare(`
      INSERT INTO episode_events_fts (
        id, session_id, kind, summary, artifact_refs, index_text
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM episode_events_fts");
      db.exec("DELETE FROM episode_events");
      for (const record of records) {
        const artifactRefsJson = JSON.stringify(record.artifact_refs);
        insertEvent.run(
          record.id,
          record.session_id,
          record.turn_id,
          record.kind,
          record.summary,
          artifactRefsJson,
          record.created_at,
          record.source_ref,
          record.row_index,
          JSON.stringify(record.raw)
        );
        insertFts.run(
          record.id,
          record.session_id,
          record.kind,
          record.summary,
          record.artifact_refs.join(" "),
          buildIndexText(record)
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return {
      source_ref: EPISODE_EVENTS_REF,
      db_ref: EPISODE_INDEX_REF,
      db_path: this.dbPath,
      total_rows: lines.length,
      indexed_rows: records.length,
      skipped_rows: skippedRows
    };
  }

  async getStats(): Promise<MemoryStoreStats> {
    const db = await this.open();
    const countRow = db.prepare("SELECT COUNT(*) AS count FROM episode_events").get() as { count: number };
    const sessionsRow = db.prepare("SELECT COUNT(DISTINCT session_id) AS count FROM episode_events").get() as { count: number };
    return {
      db_ref: EPISODE_INDEX_REF,
      db_path: this.dbPath,
      events_count: Number(countRow.count),
      sessions_count: Number(sessionsRow.count)
    };
  }

  async searchEpisodes(query: string, limit = 10): Promise<EpisodeSearchHit[]> {
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];
    const db = await this.open();
    const rows = db.prepare(`
      SELECT
        episode_events.*,
        bm25(episode_events_fts) AS score
      FROM episode_events_fts
      JOIN episode_events ON episode_events.id = episode_events_fts.id
      WHERE episode_events_fts MATCH ?
      ORDER BY score ASC, episode_events.row_index DESC
      LIMIT ?
    `).all(ftsQuery, limit) as unknown as EpisodeSqlRow[];
    return rows.map((row) => ({
      ...rowToRecord(row),
      score: Number(row.score ?? 0)
    }));
  }

  async recallEpisodes(query: string, limit = 10): Promise<EpisodeSearchHit[]> {
    const terms = tokenize(query);
    if (terms.length === 0) return [];
    const rows = (await this.readEpisodeEventsFromSource())
      .map((record) => ({ record, matches: countMatches(record, terms) }))
      .filter((item) => item.matches > 0)
      .sort((a, b) => b.matches - a.matches || b.record.row_index - a.record.row_index)
      .slice(0, limit);

    return rows.map(({ record, matches }) => ({
      ...record,
      score: -matches
    }));
  }

  async recallSessionWindow(sessionId: string, limit = 20): Promise<EpisodeEventRecord[]> {
    return (await this.readEpisodeEventsFromSource())
      .filter((record) => record.session_id === sessionId)
      .slice(-limit);
  }

  async archiveEpisodeEvents(options: { recentEventLimit?: number } = {}): Promise<EpisodeArchiveResult> {
    const recentEventLimit = Math.max(1, options.recentEventLimit ?? 20);
    const records = await this.readEpisodeEventsFromSource();
    const byDate = new Map<string, EpisodeEventRecord[]>();
    for (const record of records) {
      const date = archiveDate(record.created_at);
      byDate.set(date, [...(byDate.get(date) ?? []), record]);
    }

    const archivedDays: EpisodeArchiveRecord[] = [];
    for (const date of Array.from(byDate.keys()).sort()) {
      const archiveRef = `memory/archives/${date}.json`;
      const markdownRef = `memory/archives/${date}.md`;
      const archive = buildEpisodeArchive({
        date,
        sourceRef: EPISODE_EVENTS_REF,
        archiveRef,
        markdownRef,
        createdAt: utcNow(),
        records: byDate.get(date) ?? [],
        recentEventLimit
      });
      await this.store.writeJson(archiveRef, archive);
      await this.store.writeText(markdownRef, renderEpisodeArchiveMarkdown(archive));
      archivedDays.push(archive);
    }

    return {
      source_ref: EPISODE_EVENTS_REF,
      archive_root_ref: "memory/archives",
      total_events: records.length,
      archived_days: archivedDays
    };
  }

  async getSessionWindow(sessionId: string, limit = 20): Promise<EpisodeEventRecord[]> {
    const db = await this.open();
    const rows = db.prepare(`
      SELECT *
      FROM episode_events
      WHERE session_id = ?
      ORDER BY row_index DESC
      LIMIT ?
    `).all(sessionId, limit) as unknown as EpisodeSqlRow[];
    return rows.reverse().map(rowToRecord);
  }

  async getRecentEvents(limit = 20): Promise<EpisodeEventRecord[]> {
    const db = await this.open();
    const rows = db.prepare(`
      SELECT *
      FROM episode_events
      ORDER BY row_index DESC
      LIMIT ?
    `).all(limit) as unknown as EpisodeSqlRow[];
    return rows.reverse().map(rowToRecord);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private async readEpisodeEventsFromSource(): Promise<EpisodeEventRecord[]> {
    const sourcePath = this.store.statePath(EPISODE_EVENTS_REF);
    const raw = existsSync(sourcePath) ? await readFile(sourcePath, "utf8") : "";
    return raw.split(/\r?\n/)
      .map((line, index) => parseEpisodeEvent(line, EPISODE_EVENTS_REF, index + 1))
      .filter((record): record is EpisodeEventRecord => record !== null);
  }

  private async open(): Promise<DatabaseSync> {
    if (this.db) return this.db;
    await mkdir(dirname(this.dbPath), { recursive: true });
    const db = new DatabaseSync(this.dbPath, { timeout: 5000 });
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS episode_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn_id TEXT,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        artifact_refs_json TEXT NOT NULL,
        created_at TEXT,
        source_ref TEXT NOT NULL,
        row_index INTEGER NOT NULL,
        raw_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS episode_events_session_idx
        ON episode_events(session_id, row_index);
      CREATE VIRTUAL TABLE IF NOT EXISTS episode_events_fts USING fts5(
        id UNINDEXED,
        session_id,
        kind,
        summary,
        artifact_refs,
        index_text
      );
    `);
    this.db = db;
    return db;
  }
}

function countMatches(record: EpisodeEventRecord, terms: string[]): number {
  const indexed = new Set(tokenize(buildIndexText(record)));
  return terms.reduce((count, term) => count + (indexed.has(term) ? 1 : 0), 0);
}

function buildEpisodeArchive(args: {
  date: string;
  sourceRef: string;
  archiveRef: string;
  markdownRef: string;
  createdAt: string;
  records: EpisodeEventRecord[];
  recentEventLimit: number;
}): EpisodeArchiveRecord {
  const sessions = new Map<string, EpisodeEventRecord[]>();
  for (const record of args.records) {
    sessions.set(record.session_id, [...(sessions.get(record.session_id) ?? []), record]);
  }

  const sessionSummaries = Array.from(sessions.entries())
    .map(([sessionId, records]) => buildSessionArchiveSummary(sessionId, records))
    .sort((left, right) => right.event_count - left.event_count || compareNullableTimeDesc(left.last_event_at, right.last_event_at))
    .slice(0, 12);

  return {
    version: 1,
    date: args.date,
    source_ref: args.sourceRef,
    archive_ref: args.archiveRef,
    markdown_ref: args.markdownRef,
    created_at: args.createdAt,
    event_count: args.records.length,
    session_count: sessions.size,
    kind_counts: countBy(args.records.map((record) => record.kind)),
    first_event_at: firstEventAt(args.records),
    last_event_at: lastEventAt(args.records),
    sessions: sessionSummaries,
    recent_events: args.records.slice(-args.recentEventLimit).map(toArchiveEventSummary)
  };
}

function buildSessionArchiveSummary(sessionId: string, records: EpisodeEventRecord[]): EpisodeArchiveSessionSummary {
  return {
    session_id: sessionId,
    event_count: records.length,
    kind_counts: countBy(records.map((record) => record.kind)),
    first_event_at: firstEventAt(records),
    last_event_at: lastEventAt(records),
    summaries: records.map((record) => sanitizeArchiveSummary(record.summary)).slice(0, 3),
    artifact_refs: unique(records.flatMap((record) => record.artifact_refs)).slice(0, 10)
  };
}

function renderEpisodeArchiveMarkdown(archive: EpisodeArchiveRecord): string {
  return [
    `# Episode Archive ${archive.date}`,
    "",
    `- source: ${archive.source_ref}`,
    `- events: ${archive.event_count}`,
    `- sessions: ${archive.session_count}`,
    `- first_event_at: ${archive.first_event_at ?? "unknown"}`,
    `- last_event_at: ${archive.last_event_at ?? "unknown"}`,
    `- kinds: ${renderCounts(archive.kind_counts)}`,
    "",
    "## Sessions",
    "",
    ...(archive.sessions.length > 0
      ? archive.sessions.flatMap((session, index) => [
        `### ${index + 1}. ${session.session_id}`,
        `- events: ${session.event_count}`,
        `- kinds: ${renderCounts(session.kind_counts)}`,
        `- first_event_at: ${session.first_event_at ?? "unknown"}`,
        `- last_event_at: ${session.last_event_at ?? "unknown"}`,
        `- refs: ${session.artifact_refs.join(", ") || "none"}`,
        "",
        ...session.summaries.map((summary) => `- ${summary}`),
        ""
      ])
      : ["No sessions archived.", ""]),
    "## Recent Events",
    "",
    ...(archive.recent_events.length > 0
      ? archive.recent_events.flatMap((event, index) => [
        `### ${index + 1}. ${event.id}`,
        `- session: ${event.session_id}`,
        `- kind: ${event.kind}`,
        `- created_at: ${event.created_at ?? "unknown"}`,
        `- refs: ${event.artifact_refs.join(", ") || "none"}`,
        "",
        event.summary,
        ""
      ])
      : ["No recent events archived.", ""])
  ].join("\n");
}

function toArchiveEventSummary(record: EpisodeEventRecord): EpisodeArchiveEventSummary {
  return {
    id: record.id,
    session_id: record.session_id,
    turn_id: record.turn_id,
    kind: record.kind,
    summary: sanitizeArchiveSummary(record.summary),
    artifact_refs: record.artifact_refs,
    created_at: record.created_at
  };
}

function sanitizeArchiveSummary(summary: string): string {
  return summary
    .replace(/^Open ID:\s*.+$/gim, "Open ID: [redacted]")
    .replace(/^Chat ID:\s*.+$/gim, "Chat ID: [redacted]")
    .replace(/^Message ID:\s*.+$/gim, "Message ID: [redacted]");
}

function archiveDate(createdAt: string | null): string {
  if (!createdAt) return "undated";
  const date = createdAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "undated";
}

function firstEventAt(records: EpisodeEventRecord[]): string | null {
  return records.map((record) => record.created_at).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
}

function lastEventAt(records: EpisodeEventRecord[]): string | null {
  return records.map((record) => record.created_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function renderCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? entries.map(([key, count]) => `${key}=${count}`).join(", ") : "none";
}

function compareNullableTimeDesc(left: string | null, right: string | null): number {
  return (right ?? "").localeCompare(left ?? "");
}

function parseEpisodeEvent(line: string, sourceRef: string, rowIndex: number): EpisodeEventRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  const raw = parsed;
  const summary = getString(raw.summary) ?? JSON.stringify(raw);
  if (!summary.trim()) return null;

  return {
    id: getString(raw.id) ?? fallbackId(sourceRef, rowIndex, line),
    session_id: getString(raw.session_id) ?? "unknown_session",
    turn_id: getString(raw.turn_id),
    kind: getString(raw.kind) ?? "unknown",
    summary,
    artifact_refs: getStringArray(raw.artifact_refs),
    created_at: getString(raw.created_at),
    source_ref: sourceRef,
    row_index: rowIndex,
    raw
  };
}

function rowToRecord(row: EpisodeSqlRow): EpisodeEventRecord {
  return {
    id: row.id,
    session_id: row.session_id,
    turn_id: row.turn_id,
    kind: row.kind,
    summary: row.summary,
    artifact_refs: parseArtifactRefs(row.artifact_refs_json),
    created_at: row.created_at,
    source_ref: row.source_ref,
    row_index: Number(row.row_index),
    raw: parseRaw(row.raw_json)
  };
}

function parseArtifactRefs(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return getStringArray(parsed);
  } catch {
    return [];
  }
}

function parseRaw(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildIndexText(record: EpisodeEventRecord): string {
  return [
    record.id,
    record.session_id,
    record.turn_id ?? "",
    record.kind,
    record.summary,
    ...record.artifact_refs,
    ...tokenize(record.summary),
    ...tokenize(record.artifact_refs.join(" "))
  ].join(" ");
}

function toFtsQuery(query: string): string {
  const terms = tokenize(query);
  return terms.map((term) => `"${term.replaceAll("\"", "\"\"")}"`).join(" OR ");
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.toLowerCase().matchAll(/[\p{Script=Han}]+|[a-z0-9][a-z0-9_-]*/gu)) {
    const value = match[0];
    if (/^[\p{Script=Han}]+$/u.test(value)) {
      tokens.push(value);
      tokens.push(...cjkBigrams(value));
    } else if (value.length >= 2) {
      tokens.push(value);
    }
  }
  return Array.from(new Set(tokens)).slice(0, 32);
}

function cjkBigrams(text: string): string[] {
  const chars = Array.from(text);
  if (chars.length < 2) return chars;
  const grams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(`${chars[index]}${chars[index + 1]}`);
  }
  return grams;
}

function fallbackId(sourceRef: string, rowIndex: number, line: string): string {
  const hash = createHash("sha256").update(`${sourceRef}:${rowIndex}:${line}`).digest("hex").slice(0, 16);
  return `episode_${hash}`;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
