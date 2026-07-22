import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RunInspection, RunRecord } from "./contracts.js";

interface RunRow {
  id: string;
  status: RunRecord["status"];
  goal_id: string | null;
  request: string;
  answer: string | null;
  error: string | null;
  session_id: string;
  turn_id: string;
  created_at: string;
  updated_at: string;
}

interface PiSessionRow {
  id: string;
  run_id: string;
  created_at: string;
  leaf_id: string | null;
}

interface PiEntryRow {
  entry_json: string;
}

interface StoredPiEntry {
  id: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

export class SqliteRuntimeStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.dbPath = resolve(dbPath);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath, { timeout: 5_000 });
    try {
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      const version = this.db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined;
      if (version && version.value !== "1") {
        throw new Error(`Unsupported vNext runtime schema version: ${version.value}`);
      }
      if (!version) {
        this.db.prepare("INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1')").run();
      }

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
          goal_id TEXT,
          request TEXT NOT NULL,
          answer TEXT,
          error TEXT,
          session_id TEXT NOT NULL UNIQUE,
          turn_id TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS turns (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
          request TEXT NOT NULL,
          answer TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (run_id, ordinal)
        );
        CREATE TABLE IF NOT EXISTS pi_sessions (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          leaf_id TEXT
        );
        CREATE TABLE IF NOT EXISTS pi_session_entries (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL REFERENCES pi_sessions(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          parent_id TEXT,
          type TEXT NOT NULL,
          entry_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (session_id, id)
        );
        CREATE INDEX IF NOT EXISTS pi_session_entries_session_seq_idx
          ON pi_session_entries(session_id, seq);
        CREATE TABLE IF NOT EXISTS runtime_events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          turn_id TEXT REFERENCES turns(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS runtime_events_run_seq_idx
          ON runtime_events(run_id, seq);
      `);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  beginRun(input: { request: string; goal_id?: string }): RunRecord {
    const request = input.request.trim();
    if (!request) throw new Error("Run request must not be empty.");
    const createdAt = new Date().toISOString();
    const runId = id("run");
    const turnId = id("turn");
    const sessionId = id("session");
    const goalId = input.goal_id?.trim() || null;

    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO runs (
          id, status, goal_id, request, answer, error,
          session_id, turn_id, created_at, updated_at
        ) VALUES (?, 'running', ?, ?, NULL, NULL, ?, ?, ?, ?)
      `).run(runId, goalId, request, sessionId, turnId, createdAt, createdAt);
      this.db.prepare(`
        INSERT INTO turns (
          id, run_id, ordinal, status, request, answer, error, created_at, updated_at
        ) VALUES (?, ?, 1, 'running', ?, NULL, NULL, ?, ?)
      `).run(turnId, runId, request, createdAt, createdAt);
      this.db.prepare(`
        INSERT INTO pi_sessions (id, run_id, created_at, leaf_id)
        VALUES (?, ?, ?, NULL)
      `).run(sessionId, runId, createdAt);
      this.insertEvent(runId, turnId, "run_started", { goal_id: goalId });
    });

    return this.requireRun(runId);
  }

  completeRun(runId: string, answer: string): RunRecord {
    const updatedAt = new Date().toISOString();
    this.transaction(() => {
      const runResult = this.db.prepare(`
        UPDATE runs
        SET status = 'completed', answer = ?, error = NULL, updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(answer, updatedAt, runId);
      if (Number(runResult.changes) !== 1) throw new Error(`Run is not running: ${runId}`);
      const run = this.requireRun(runId);
      const turnResult = this.db.prepare(`
        UPDATE turns
        SET status = 'completed', answer = ?, error = NULL, updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(answer, updatedAt, run.turn_id);
      if (Number(turnResult.changes) !== 1) throw new Error(`Turn is not running: ${run.turn_id}`);
      this.insertEvent(runId, run.turn_id, "run_completed", {});
    });
    return this.requireRun(runId);
  }

  failRun(runId: string, error: string): RunRecord {
    const message = error.trim().slice(0, 4_000) || "Agent loop failed.";
    const updatedAt = new Date().toISOString();
    this.transaction(() => {
      const runResult = this.db.prepare(`
        UPDATE runs
        SET status = 'failed', answer = NULL, error = ?, updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(message, updatedAt, runId);
      if (Number(runResult.changes) !== 1) throw new Error(`Run is not running: ${runId}`);
      const run = this.requireRun(runId);
      const turnResult = this.db.prepare(`
        UPDATE turns
        SET status = 'failed', answer = NULL, error = ?, updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(message, updatedAt, run.turn_id);
      if (Number(turnResult.changes) !== 1) throw new Error(`Turn is not running: ${run.turn_id}`);
      this.insertEvent(runId, run.turn_id, "run_failed", { error: message });
    });
    return this.requireRun(runId);
  }

  inspectRun(runId: string): RunInspection | null {
    const run = this.getRun(runId);
    if (!run) return null;
    const events = this.db.prepare("SELECT COUNT(*) AS count FROM runtime_events WHERE run_id = ?").get(runId) as {
      count: number;
    };
    const entries = this.db.prepare(
      "SELECT COUNT(*) AS count FROM pi_session_entries WHERE session_id = ?"
    ).get(run.session_id) as { count: number };
    return {
      ...run,
      event_count: Number(events.count),
      session_entry_count: Number(entries.count)
    };
  }

  getPiSession(sessionId: string): PiSessionRow | null {
    return (this.db.prepare(`
      SELECT id, run_id, created_at, leaf_id
      FROM pi_sessions
      WHERE id = ?
    `).get(sessionId) as PiSessionRow | undefined) ?? null;
  }

  appendPiSessionEntry(sessionId: string, entryInput: unknown): void {
    const entry = parsePiEntry(entryInput);
    this.transaction(() => {
      const session = this.getPiSession(sessionId);
      if (!session) throw new Error(`Pi session not found: ${sessionId}`);
      if (entry.parentId !== null && !this.getPiSessionEntry(sessionId, entry.parentId)) {
        throw new Error(`Pi parent entry not found: ${entry.parentId}`);
      }
      let nextLeafId: string | null = entry.id;
      if (entry.type === "leaf") {
        const targetId = entry.targetId;
        if (targetId !== null && typeof targetId !== "string") {
          throw new Error("Pi leaf target must be a string or null.");
        }
        if (typeof targetId === "string" && !this.getPiSessionEntry(sessionId, targetId)) {
          throw new Error(`Pi leaf target not found: ${targetId}`);
        }
        nextLeafId = targetId as string | null;
      }
      this.db.prepare(`
        INSERT INTO pi_session_entries (
          session_id, id, parent_id, type, entry_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, entry.id, entry.parentId, entry.type, JSON.stringify(entry), entry.timestamp);
      this.db.prepare("UPDATE pi_sessions SET leaf_id = ? WHERE id = ?").run(nextLeafId, sessionId);
    });
  }

  getPiSessionEntry(sessionId: string, entryId: string): unknown | null {
    const row = this.db.prepare(`
      SELECT entry_json
      FROM pi_session_entries
      WHERE session_id = ? AND id = ?
    `).get(sessionId, entryId) as PiEntryRow | undefined;
    return row ? JSON.parse(row.entry_json) : null;
  }

  getPiSessionEntries(sessionId: string): unknown[] {
    return (this.db.prepare(`
      SELECT entry_json
      FROM pi_session_entries
      WHERE session_id = ?
      ORDER BY seq ASC
    `).all(sessionId) as unknown as PiEntryRow[]).map((row) => JSON.parse(row.entry_json));
  }

  getPiSessionPath(sessionId: string, leafId: string | null): unknown[] {
    if (leafId === null) return [];
    const byId = new Map(
      this.getPiSessionEntries(sessionId).map((entry) => {
        const parsed = parsePiEntry(entry);
        return [parsed.id, parsed] as const;
      })
    );
    const path: StoredPiEntry[] = [];
    let current = byId.get(leafId);
    if (!current) throw new Error(`Pi entry not found: ${leafId}`);
    while (current) {
      path.unshift(current);
      if (current.parentId === null) break;
      const parent = byId.get(current.parentId);
      if (!parent) throw new Error(`Pi parent entry not found: ${current.parentId}`);
      current = parent;
    }
    return path;
  }

  getPiSessionLabel(sessionId: string, targetId: string): string | undefined {
    let value: string | undefined;
    for (const raw of this.getPiSessionEntries(sessionId)) {
      const entry = parsePiEntry(raw);
      if (entry.type !== "label" || entry.targetId !== targetId) continue;
      const label = typeof entry.label === "string" ? entry.label.trim() : "";
      value = label || undefined;
    }
    return value;
  }

  close(): void {
    this.db.close();
  }

  private getRun(runId: string): RunRecord | null {
    const row = this.db.prepare(`
      SELECT id, status, goal_id, request, answer, error,
             session_id, turn_id, created_at, updated_at
      FROM runs
      WHERE id = ?
    `).get(runId) as RunRow | undefined;
    return row ?? null;
  }

  private requireRun(runId: string): RunRecord {
    const run = this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    return run;
  }

  private insertEvent(runId: string, turnId: string | null, kind: string, payload: unknown): void {
    this.db.prepare(`
      INSERT INTO runtime_events (id, run_id, turn_id, kind, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id("event"), runId, turnId, kind, JSON.stringify(payload), new Date().toISOString());
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function parsePiEntry(value: unknown): StoredPiEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Pi session entry must be an object.");
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || !entry.id) throw new Error("Pi session entry id is invalid.");
  if (entry.parentId !== null && typeof entry.parentId !== "string") {
    throw new Error("Pi session entry parentId is invalid.");
  }
  if (typeof entry.type !== "string" || !entry.type) throw new Error("Pi session entry type is invalid.");
  if (typeof entry.timestamp !== "string" || !entry.timestamp) {
    throw new Error("Pi session entry timestamp is invalid.");
  }
  return entry as StoredPiEntry;
}
