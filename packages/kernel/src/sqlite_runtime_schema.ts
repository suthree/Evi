import { DatabaseSync } from "node:sqlite";

export const RUNTIME_SCHEMA_VERSION = "8";

export class RuntimeSchemaIncompatibleError extends Error {
  readonly code = "schema_incompatible";

  constructor(readonly actualVersion: string) {
    super(`Unsupported vNext runtime schema version: ${actualVersion}`);
    this.name = "RuntimeSchemaIncompatibleError";
  }
}

export function initializeRuntimeSchema(db: DatabaseSync): void {
  const version = existingSchemaVersion(db);
  if (version !== null && version !== RUNTIME_SCHEMA_VERSION) {
    throw new RuntimeSchemaIncompatibleError(version);
  }
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('running', 'waiting', 'paused', 'completed', 'failed')),
        goal_id TEXT,
        answer TEXT,
        error TEXT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS runs_session_created_idx
        ON runs(session_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS runs_one_open_per_session_idx
        ON runs(session_id) WHERE status IN ('running', 'waiting', 'paused');
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'waiting', 'paused', 'completed', 'failed')),
        request TEXT NOT NULL,
        answer TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (run_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS pi_sessions (
        id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        leaf_id TEXT
      );
      CREATE TABLE IF NOT EXISTS execution_locks (
        run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
        digest TEXT NOT NULL,
        lock_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS execution_locks_digest_idx
        ON execution_locks(digest);
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
      CREATE TABLE IF NOT EXISTS run_executions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (
          kind IN ('initial', 'action_continuation', 'worker_result_continuation', 'dispatch_recovery', 'protocol_recovery')
        ),
        input_digest TEXT NOT NULL,
        recovery_of_execution_id TEXT REFERENCES run_executions(id),
        session_start_seq INTEGER NOT NULL CHECK (session_start_seq >= 0),
        state TEXT NOT NULL CHECK (state IN ('active', 'settled', 'interrupted')),
        outcome TEXT CHECK (outcome IN ('waiting', 'completed', 'paused', 'failed', 'interrupted')),
        owner_token_digest TEXT NOT NULL,
        lease_expires_at TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        settled_at TEXT,
        UNIQUE (run_id, ordinal)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS run_executions_one_active_idx
        ON run_executions(run_id) WHERE state = 'active';
      CREATE INDEX IF NOT EXISTS run_executions_run_state_idx
        ON run_executions(run_id, state);
      CREATE TABLE IF NOT EXISTS model_dispatches (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES run_executions(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        state TEXT NOT NULL CHECK (
          state IN ('dispatching', 'response_observed', 'settled', 'outcome_unknown')
        ),
        response_status INTEGER,
        stop_reason TEXT,
        message_digest TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (execution_id, ordinal)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS model_dispatches_one_active_idx
        ON model_dispatches(execution_id)
        WHERE state IN ('dispatching', 'response_observed');
      CREATE INDEX IF NOT EXISTS model_dispatches_run_state_idx
        ON model_dispatches(run_id, state);
      CREATE TABLE IF NOT EXISTS worker_sessions (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL UNIQUE REFERENCES action_reservations(id) ON DELETE CASCADE,
        parent_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        parent_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (
          status IN ('queued', 'running', 'needs_input', 'completed', 'failed')
        ),
        task_envelope_digest TEXT NOT NULL UNIQUE,
        task_envelope_json TEXT NOT NULL,
        child_execution_lock_digest TEXT NOT NULL,
        child_execution_lock_json TEXT NOT NULL,
        child_session_id TEXT UNIQUE REFERENCES sessions(id),
        child_run_id TEXT UNIQUE REFERENCES runs(id),
        result_envelope_digest TEXT UNIQUE,
        result_envelope_json TEXT,
        result_delivered_to_turn_id TEXT REFERENCES turns(id),
        lease_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (lease_ordinal >= 0),
        lease_owner_digest TEXT,
        lease_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (child_session_id IS NULL AND child_run_id IS NULL)
          OR (child_session_id IS NOT NULL AND child_run_id IS NOT NULL)
        ),
        CHECK (
          (status = 'running' AND lease_owner_digest IS NOT NULL AND lease_expires_at IS NOT NULL)
          OR (status != 'running' AND lease_owner_digest IS NULL AND lease_expires_at IS NULL)
        ),
        CHECK (
          (status IN ('queued', 'running')
            AND result_envelope_digest IS NULL AND result_envelope_json IS NULL
            AND result_delivered_to_turn_id IS NULL)
          OR (status IN ('needs_input', 'completed', 'failed')
            AND child_session_id IS NOT NULL AND child_run_id IS NOT NULL
            AND result_envelope_digest IS NOT NULL AND result_envelope_json IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS worker_sessions_parent_status_idx
        ON worker_sessions(parent_run_id, status, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS worker_sessions_one_discussion_per_parent_idx
        ON worker_sessions(parent_run_id);
      CREATE INDEX IF NOT EXISTS worker_sessions_parent_delivery_idx
        ON worker_sessions(parent_run_id, result_delivered_to_turn_id, created_at);
      CREATE TABLE IF NOT EXISTS adaptation_candidates (
        id TEXT PRIMARY KEY,
        target_slot TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind = 'procedure'),
        scope TEXT NOT NULL CHECK (scope = 'local_node'),
        lifecycle TEXT NOT NULL CHECK (lifecycle = 'inactive'),
        content_digest TEXT NOT NULL UNIQUE,
        candidate_digest TEXT NOT NULL UNIQUE,
        candidate_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS self_registry_versions (
        id TEXT PRIMARY KEY,
        target_slot TEXT NOT NULL,
        artifact_kind TEXT NOT NULL CHECK (artifact_kind = 'procedure'),
        state TEXT NOT NULL CHECK (state IN ('inactive', 'active', 'retired')),
        candidate_id TEXT NOT NULL UNIQUE REFERENCES adaptation_candidates(id) ON DELETE RESTRICT,
        artifact_digest TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS self_registry_one_active_per_slot_idx
        ON self_registry_versions(target_slot) WHERE state = 'active';
      CREATE UNIQUE INDEX IF NOT EXISTS self_registry_one_inactive_per_slot_idx
        ON self_registry_versions(target_slot) WHERE state = 'inactive';
      CREATE TABLE IF NOT EXISTS adaptation_evaluations (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES adaptation_candidates(id) ON DELETE RESTRICT,
        candidate_digest TEXT NOT NULL,
        target_slot TEXT NOT NULL,
        baseline_kind TEXT NOT NULL CHECK (baseline_kind IN ('none', 'self_registry_version')),
        baseline_version_id TEXT,
        baseline_digest TEXT,
        evaluator_version TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
        evaluation_digest TEXT NOT NULL UNIQUE,
        receipt_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK (
          (baseline_kind = 'none' AND baseline_version_id IS NULL AND baseline_digest IS NULL)
          OR (baseline_kind = 'self_registry_version'
            AND baseline_version_id IS NOT NULL AND baseline_digest IS NOT NULL)
        ),
        UNIQUE (candidate_id, baseline_kind, baseline_version_id, baseline_digest, evaluator_version)
      );
      CREATE INDEX IF NOT EXISTS adaptation_evaluations_candidate_idx
        ON adaptation_evaluations(candidate_id, created_at);
    `);
    if (version === null) {
      db.prepare("INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)")
        .run(RUNTIME_SCHEMA_VERSION);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function existingSchemaVersion(db: DatabaseSync): string | null {
  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>;
  if (tables.length === 0) return null;
  if (!tables.some(({ name }) => name === "schema_meta")) {
    throw new RuntimeSchemaIncompatibleError("missing-schema-meta");
  }
  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  if (!row?.value) throw new RuntimeSchemaIncompatibleError("missing-schema-version");
  return row.value;
}
