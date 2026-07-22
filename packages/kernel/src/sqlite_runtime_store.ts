import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ActionEffectClass,
  ActionObservation,
  ActionReservation,
  EffectReceipt,
  JsonObject
} from "./action_types.js";
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

interface ActionReservationRow {
  id: string;
  run_id: string;
  turn_id: string;
  invocation_id: string;
  action_name: string;
  contract_version: string;
  action_digest: string;
  effect_class: ActionEffectClass;
  decision: "allow";
  decision_reason: string;
  arguments_json: string;
  state: ActionReservation["state"];
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface EffectReceiptRow {
  id: string;
  reservation_id: string;
  run_id: string;
  turn_id: string;
  action_name: string;
  contract_version: string;
  action_digest: string;
  effect_class: ActionEffectClass;
  outcome: EffectReceipt["outcome"];
  summary: string;
  output_json: string;
  reconciled: number;
  created_at: string;
}

interface StoredPiEntry {
  id: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

export class RunHasUnresolvedActionsError extends Error {
  constructor(readonly runId: string) {
    super(`Run has unresolved action reservations: ${runId}`);
    this.name = "RunHasUnresolvedActionsError";
  }
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
      if (version && version.value !== "2") {
        throw new Error(`Unsupported vNext runtime schema version: ${version.value}`);
      }
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'failed')),
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
            status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'failed')),
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
          CREATE TABLE IF NOT EXISTS action_reservations (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
            turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
            invocation_id TEXT NOT NULL,
            action_name TEXT NOT NULL,
            contract_version TEXT NOT NULL,
            action_digest TEXT NOT NULL,
            effect_class TEXT NOT NULL CHECK (
              effect_class IN ('none', 'local_read', 'local_write', 'external_read', 'external_write')
            ),
            decision TEXT NOT NULL CHECK (decision = 'allow'),
            decision_reason TEXT NOT NULL,
            arguments_json TEXT NOT NULL,
            state TEXT NOT NULL CHECK (
              state IN ('reserved', 'dispatching', 'outcome_unknown', 'terminal')
            ),
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (run_id, invocation_id)
          );
          CREATE INDEX IF NOT EXISTS action_reservations_run_state_idx
            ON action_reservations(run_id, state);
          CREATE TABLE IF NOT EXISTS effect_receipts (
            id TEXT PRIMARY KEY,
            reservation_id TEXT NOT NULL UNIQUE REFERENCES action_reservations(id) ON DELETE CASCADE,
            run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
            turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
            action_name TEXT NOT NULL,
            contract_version TEXT NOT NULL,
            action_digest TEXT NOT NULL,
            effect_class TEXT NOT NULL CHECK (
              effect_class IN ('none', 'local_read', 'local_write', 'external_read', 'external_write')
            ),
            outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
            summary TEXT NOT NULL,
            output_json TEXT NOT NULL,
            reconciled INTEGER NOT NULL CHECK (reconciled IN (0, 1)),
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS effect_receipts_run_idx
            ON effect_receipts(run_id);
        `);
        if (!version) {
          this.db.prepare("INSERT INTO schema_meta (key, value) VALUES ('schema_version', '2')").run();
        }
      });
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
      if (this.hasUnresolvedActions(runId)) throw new RunHasUnresolvedActionsError(runId);
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

  pauseRun(runId: string, error: string): RunRecord {
    const message = error.trim().slice(0, 4_000) || "Run paused for unresolved action recovery.";
    const updatedAt = new Date().toISOString();
    this.transaction(() => {
      const runResult = this.db.prepare(`
        UPDATE runs
        SET status = 'paused', answer = NULL, error = ?, updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(message, updatedAt, runId);
      if (Number(runResult.changes) !== 1) throw new Error(`Run is not running: ${runId}`);
      const run = this.requireRun(runId);
      const turnResult = this.db.prepare(`
        UPDATE turns
        SET status = 'paused', answer = NULL, error = ?, updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(message, updatedAt, run.turn_id);
      if (Number(turnResult.changes) !== 1) throw new Error(`Turn is not running: ${run.turn_id}`);
      this.insertEvent(runId, run.turn_id, "run_paused", { reason: message });
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
    const actions = this.db.prepare(
      "SELECT COUNT(*) AS count FROM action_reservations WHERE run_id = ?"
    ).get(runId) as { count: number };
    const unresolved = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM action_reservations
      WHERE run_id = ? AND state != 'terminal'
    `).get(runId) as { count: number };
    const receipts = this.db.prepare(
      "SELECT COUNT(*) AS count FROM effect_receipts WHERE run_id = ?"
    ).get(runId) as { count: number };
    return {
      ...run,
      event_count: Number(events.count),
      session_entry_count: Number(entries.count),
      action_count: Number(actions.count),
      unresolved_action_count: Number(unresolved.count),
      effect_receipt_count: Number(receipts.count)
    };
  }

  reserveAction(input: {
    run_id: string;
    turn_id: string;
    invocation_id: string;
    action_name: string;
    contract_version: string;
    action_digest: string;
    effect_class: ActionEffectClass;
    decision_reason: string;
    arguments: JsonObject;
  }): { created: boolean; reservation: ActionReservation; receipt: EffectReceipt | null } {
    return this.transaction(() => {
      const invocationId = boundedText(input.invocation_id, 1_000, "Action invocation id");
      const existing = this.getActionReservationByInvocation(input.run_id, invocationId);
      if (existing) {
        if (existing.turn_id !== input.turn_id
          || existing.action_name !== input.action_name
          || existing.contract_version !== input.contract_version
          || existing.action_digest !== input.action_digest
          || existing.effect_class !== input.effect_class) {
          throw new Error(`Action invocation identity mismatch: ${input.run_id}/${invocationId}`);
        }
        return { created: false, reservation: existing, receipt: this.getEffectReceipt(existing.id) };
      }

      const run = this.requireRun(input.run_id);
      if (run.status !== "running" || run.turn_id !== input.turn_id) {
        throw new Error(`Action reservation requires the current running Turn: ${input.run_id}`);
      }
      const createdAt = new Date().toISOString();
      const reservationId = id("action");
      this.db.prepare(`
        INSERT INTO action_reservations (
          id, run_id, turn_id, invocation_id, action_name, contract_version, action_digest,
          effect_class, decision, decision_reason, arguments_json,
          state, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'allow', ?, ?, 'reserved', NULL, ?, ?)
      `).run(
        reservationId,
        input.run_id,
        input.turn_id,
        invocationId,
        boundedText(input.action_name, 80, "Action name"),
        boundedText(input.contract_version, 9, "Action contract version"),
        actionDigest(input.action_digest),
        input.effect_class,
        boundedText(input.decision_reason, 2_000, "Action decision reason"),
        JSON.stringify(input.arguments),
        createdAt,
        createdAt
      );
      this.insertEvent(input.run_id, input.turn_id, "action_reserved", {
        reservation_id: reservationId,
        invocation_id: invocationId,
        action_name: input.action_name,
        contract_version: input.contract_version,
        action_digest: input.action_digest,
        effect_class: input.effect_class
      });
      return {
        created: true,
        reservation: this.requireActionReservation(reservationId),
        receipt: null
      };
    });
  }

  markActionDispatching(reservationId: string): ActionReservation {
    return this.transaction(() => {
      const current = this.requireActionReservation(reservationId);
      if (current.state !== "reserved") {
        throw new Error(`Action reservation is not reserved: ${reservationId}`);
      }
      const updatedAt = new Date().toISOString();
      this.db.prepare(`
        UPDATE action_reservations
        SET state = 'dispatching', error = NULL, updated_at = ?
        WHERE id = ? AND state = 'reserved'
      `).run(updatedAt, reservationId);
      this.insertEvent(current.run_id, current.turn_id, "action_dispatching", {
        reservation_id: reservationId,
        action_digest: current.action_digest
      });
      return this.requireActionReservation(reservationId);
    });
  }

  markActionOutcomeUnknown(reservationId: string, error: string): ActionReservation {
    return this.transaction(() => {
      const current = this.requireActionReservation(reservationId);
      if (current.state === "terminal") return current;
      const updatedAt = new Date().toISOString();
      const message = boundedText(error, 2_000, "Action unknown-outcome error");
      this.db.prepare(`
        UPDATE action_reservations
        SET state = 'outcome_unknown', error = ?, updated_at = ?
        WHERE id = ? AND state != 'terminal'
      `).run(message, updatedAt, reservationId);
      this.insertEvent(current.run_id, current.turn_id, "action_outcome_unknown", {
        reservation_id: reservationId,
        action_digest: current.action_digest,
        error: message
      });
      return this.requireActionReservation(reservationId);
    });
  }

  completeAction(
    reservationId: string,
    observation: ActionObservation,
    reconciled: boolean
  ): { reservation: ActionReservation; receipt: EffectReceipt } {
    return this.transaction(() => {
      const current = this.requireActionReservation(reservationId);
      const existing = this.getEffectReceipt(reservationId);
      if (existing) return { reservation: current, receipt: existing };
      if (current.state === "terminal") {
        throw new Error(`Terminal Action reservation has no receipt: ${reservationId}`);
      }
      const createdAt = new Date().toISOString();
      const receiptId = id("effect_receipt");
      this.db.prepare(`
        INSERT INTO effect_receipts (
          id, reservation_id, run_id, turn_id, action_name, contract_version, action_digest,
          effect_class, outcome, summary, output_json, reconciled, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receiptId,
        reservationId,
        current.run_id,
        current.turn_id,
        current.action_name,
        current.contract_version,
        current.action_digest,
        current.effect_class,
        observation.outcome,
        boundedText(observation.summary, 2_000, "Action observation summary"),
        JSON.stringify(observation.output),
        reconciled ? 1 : 0,
        createdAt
      );
      const update = this.db.prepare(`
        UPDATE action_reservations
        SET state = 'terminal', error = NULL, updated_at = ?
        WHERE id = ? AND state != 'terminal'
      `).run(createdAt, reservationId);
      if (Number(update.changes) !== 1) {
        throw new Error(`Action reservation could not become terminal: ${reservationId}`);
      }
      this.insertEvent(current.run_id, current.turn_id, "action_observed", {
        reservation_id: reservationId,
        receipt_id: receiptId,
        action_digest: current.action_digest,
        outcome: observation.outcome,
        reconciled
      });
      return {
        reservation: this.requireActionReservation(reservationId),
        receipt: this.requireEffectReceipt(reservationId)
      };
    });
  }

  listUnresolvedActions(runId: string): ActionReservation[] {
    return (this.db.prepare(`
      SELECT *
      FROM action_reservations
      WHERE run_id = ? AND state != 'terminal'
      ORDER BY created_at ASC, id ASC
    `).all(runId) as unknown as ActionReservationRow[]).map(toActionReservation);
  }

  hasUnresolvedActions(runId: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 AS present
      FROM action_reservations
      WHERE run_id = ? AND state != 'terminal'
      LIMIT 1
    `).get(runId) as { present: number } | undefined;
    return row?.present === 1;
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

  private getActionReservationByInvocation(runId: string, invocationId: string): ActionReservation | null {
    const row = this.db.prepare(`
      SELECT *
      FROM action_reservations
      WHERE run_id = ? AND invocation_id = ?
    `).get(runId, invocationId) as ActionReservationRow | undefined;
    return row ? toActionReservation(row) : null;
  }

  private requireActionReservation(reservationId: string): ActionReservation {
    const row = this.db.prepare(`
      SELECT *
      FROM action_reservations
      WHERE id = ?
    `).get(reservationId) as ActionReservationRow | undefined;
    if (!row) throw new Error(`Action reservation not found: ${reservationId}`);
    return toActionReservation(row);
  }

  private getEffectReceipt(reservationId: string): EffectReceipt | null {
    const row = this.db.prepare(`
      SELECT *
      FROM effect_receipts
      WHERE reservation_id = ?
    `).get(reservationId) as EffectReceiptRow | undefined;
    return row ? toEffectReceipt(row) : null;
  }

  private requireEffectReceipt(reservationId: string): EffectReceipt {
    const receipt = this.getEffectReceipt(reservationId);
    if (!receipt) throw new Error(`Effect receipt not found: ${reservationId}`);
    return receipt;
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

function toActionReservation(row: ActionReservationRow): ActionReservation {
  return {
    id: row.id,
    run_id: row.run_id,
    turn_id: row.turn_id,
    invocation_id: row.invocation_id,
    action_name: row.action_name,
    contract_version: row.contract_version,
    action_digest: row.action_digest,
    effect_class: row.effect_class,
    decision: row.decision,
    decision_reason: row.decision_reason,
    arguments: parseJsonObject(row.arguments_json, "Action reservation arguments"),
    state: row.state,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toEffectReceipt(row: EffectReceiptRow): EffectReceipt {
  return {
    id: row.id,
    reservation_id: row.reservation_id,
    run_id: row.run_id,
    turn_id: row.turn_id,
    action_name: row.action_name,
    contract_version: row.contract_version,
    action_digest: row.action_digest,
    effect_class: row.effect_class,
    outcome: row.outcome,
    summary: row.summary,
    output: parseJsonObject(row.output_json, "Effect receipt output"),
    reconciled: row.reconciled === 1,
    created_at: row.created_at
  };
}

function parseJsonObject(input: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error(`${label} is invalid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} is not a JSON object.`);
  }
  return parsed as JsonObject;
}

function boundedText(input: string, maxLength: number, label: string): string {
  const value = input.trim();
  if (!value || value.length > maxLength) throw new Error(`${label} is invalid.`);
  return value;
}

function actionDigest(input: string): string {
  const value = input.trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Action digest is invalid.");
  return value;
}
