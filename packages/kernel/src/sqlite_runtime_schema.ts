import { DatabaseSync } from "node:sqlite";
import {
  materializePreparedWorkerGroup,
  parseWorkerGroupAllocation,
  parseWorkerGroupEnvelope,
  singletonWorkerGroupRequest,
  type WorkerGroupEnvelope,
  type WorkerKind
} from "./worker_group_types.js";

export const RUNTIME_SCHEMA_VERSION = "13";
export const DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_META_KEY =
  "diagnostic_canary_experience_schema_version";
export const DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_VERSION = "1";
const MIGRATABLE_SCHEMA_VERSIONS = new Set(["8", "9", "10", "11", "12", RUNTIME_SCHEMA_VERSION]);

export class RuntimeSchemaIncompatibleError extends Error {
  readonly code = "schema_incompatible";

  constructor(readonly actualVersion: string) {
    super(`Unsupported vNext runtime schema version: ${actualVersion}`);
    this.name = "RuntimeSchemaIncompatibleError";
  }
}

export class DiagnosticCanaryExperienceSchemaIncompatibleError extends Error {
  readonly code = "schema_incompatible";

  constructor(readonly reason: string) {
    super(`Diagnostic canary Experience schema is incompatible: ${reason}`);
    this.name = "DiagnosticCanaryExperienceSchemaIncompatibleError";
  }
}

export function initializeRuntimeSchema(db: DatabaseSync): void {
  const version = existingSchemaVersion(db);
  if (version !== null && !MIGRATABLE_SCHEMA_VERSIONS.has(version)) {
    throw new RuntimeSchemaIncompatibleError(version);
  }
  if (version === "8" || version === "9" || version === "10" || version === "11" || version === "12"
    || version === RUNTIME_SCHEMA_VERSION) {
    assertWorkerLifecycleShape(db, version);
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
    if (version === "8" || version === "9" || version === "10") {
      migrateWorkerLifecycleLedger(db, version);
    }
    if (version === "8" || version === "9" || version === "10" || version === "11") {
      migrateWorkerGroups(db, version);
    }
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
      ${workerLifecycleTableSql(true)}
      CREATE INDEX IF NOT EXISTS worker_sessions_parent_status_idx
        ON worker_sessions(parent_run_id, status, created_at);
      CREATE INDEX IF NOT EXISTS worker_sessions_parent_delivery_idx
        ON worker_sessions(parent_run_id, result_delivered_to_turn_id, created_at);
      ${workerGroupTableSql(true)}
      CREATE TABLE IF NOT EXISTS delivery_lineages (
        id TEXT PRIMARY KEY,
        digest TEXT NOT NULL UNIQUE,
        repository_root TEXT NOT NULL,
        git_common_dir TEXT NOT NULL,
        worktree TEXT NOT NULL UNIQUE,
        branch TEXT NOT NULL,
        base_commit TEXT NOT NULL,
        lineage_json TEXT NOT NULL,
        baseline_snapshot_digest TEXT NOT NULL UNIQUE,
        baseline_snapshot_json TEXT NOT NULL,
        bound_worker_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL CHECK (
          state IN ('available', 'leased', 'paused', 'needs_input', 'completed', 'failed')
        ),
        lease_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (lease_ordinal >= 0),
        lease_owner_digest TEXT,
        lease_expires_at TEXT,
        attempt_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (state = 'leased' AND lease_owner_digest IS NOT NULL
            AND lease_expires_at IS NOT NULL AND attempt_id IS NOT NULL)
          OR (state != 'leased' AND lease_owner_digest IS NULL AND lease_expires_at IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS delivery_lineages_state_idx
        ON delivery_lineages(state, updated_at);
      CREATE TABLE IF NOT EXISTS execution_worker_bindings (
        worker_id TEXT PRIMARY KEY REFERENCES worker_sessions(id) ON DELETE CASCADE,
        lineage_id TEXT NOT NULL UNIQUE REFERENCES delivery_lineages(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS review_worker_bindings (
        worker_id TEXT PRIMARY KEY REFERENCES worker_sessions(id) ON DELETE CASCADE,
        execution_worker_id TEXT NOT NULL UNIQUE REFERENCES worker_sessions(id) ON DELETE RESTRICT
      );
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
      CREATE TABLE IF NOT EXISTS adaptation_activations (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL UNIQUE REFERENCES adaptation_candidates(id) ON DELETE RESTRICT,
        candidate_digest TEXT NOT NULL,
        evaluation_id TEXT NOT NULL UNIQUE REFERENCES adaptation_evaluations(id) ON DELETE RESTRICT,
        evaluation_digest TEXT NOT NULL,
        target_slot TEXT NOT NULL CHECK (target_slot = 'procedure.runtime-inspection'),
        baseline_kind TEXT NOT NULL CHECK (baseline_kind IN ('none', 'self_registry_version')),
        baseline_version_id TEXT,
        baseline_digest TEXT,
        previous_version_id TEXT REFERENCES self_registry_versions(id) ON DELETE RESTRICT,
        previous_artifact_digest TEXT,
        activated_version_id TEXT NOT NULL UNIQUE REFERENCES self_registry_versions(id) ON DELETE RESTRICT,
        activated_artifact_digest TEXT NOT NULL,
        activation_digest TEXT NOT NULL UNIQUE,
        receipt_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK (
          (baseline_kind = 'none' AND baseline_version_id IS NULL AND baseline_digest IS NULL)
          OR (baseline_kind = 'self_registry_version'
            AND baseline_version_id IS NOT NULL AND baseline_digest IS NOT NULL)
        ),
        CHECK (
          (previous_version_id IS NULL AND previous_artifact_digest IS NULL)
          OR (previous_version_id IS NOT NULL AND previous_artifact_digest IS NOT NULL)
        )
      );
      CREATE TABLE IF NOT EXISTS adaptation_selections (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
        initial_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE RESTRICT,
        target_slot TEXT NOT NULL CHECK (target_slot = 'procedure.runtime-inspection'),
        version_id TEXT NOT NULL REFERENCES self_registry_versions(id) ON DELETE RESTRICT,
        artifact_digest TEXT NOT NULL,
        candidate_id TEXT NOT NULL REFERENCES adaptation_candidates(id) ON DELETE RESTRICT,
        candidate_digest TEXT NOT NULL,
        growth_context_digest TEXT NOT NULL,
        selection_digest TEXT NOT NULL UNIQUE,
        receipt_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (run_id, target_slot)
      );
      CREATE TABLE IF NOT EXISTS adaptation_observations (
        id TEXT PRIMARY KEY,
        selection_id TEXT NOT NULL UNIQUE REFERENCES adaptation_selections(id) ON DELETE RESTRICT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
        initial_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE RESTRICT,
        final_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE RESTRICT,
        target_slot TEXT NOT NULL CHECK (target_slot = 'procedure.runtime-inspection'),
        version_id TEXT NOT NULL REFERENCES self_registry_versions(id) ON DELETE RESTRICT,
        artifact_digest TEXT NOT NULL,
        candidate_id TEXT NOT NULL REFERENCES adaptation_candidates(id) ON DELETE RESTRICT,
        candidate_digest TEXT NOT NULL,
        effect_receipt_id TEXT NOT NULL UNIQUE REFERENCES effect_receipts(id) ON DELETE RESTRICT,
        effect_receipt_digest TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'failed')),
        observation_digest TEXT NOT NULL UNIQUE,
        receipt_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS adaptation_retirements (
        id TEXT PRIMARY KEY,
        target_slot TEXT NOT NULL CHECK (target_slot = 'procedure.runtime-inspection'),
        version_id TEXT NOT NULL UNIQUE REFERENCES self_registry_versions(id) ON DELETE RESTRICT,
        artifact_digest TEXT NOT NULL,
        candidate_id TEXT NOT NULL REFERENCES adaptation_candidates(id) ON DELETE RESTRICT,
        reason TEXT NOT NULL CHECK (reason IN ('failed_evaluation', 'observed_failure', 'superseded')),
        evaluation_id TEXT UNIQUE REFERENCES adaptation_evaluations(id) ON DELETE RESTRICT,
        observation_id TEXT UNIQUE REFERENCES adaptation_observations(id) ON DELETE RESTRICT,
        replacement_version_id TEXT UNIQUE REFERENCES self_registry_versions(id) ON DELETE RESTRICT,
        retirement_digest TEXT NOT NULL UNIQUE,
        receipt_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK (
          (reason = 'failed_evaluation' AND evaluation_id IS NOT NULL
            AND observation_id IS NULL AND replacement_version_id IS NULL)
          OR (reason = 'observed_failure' AND evaluation_id IS NULL
            AND observation_id IS NOT NULL AND replacement_version_id IS NULL)
          OR (reason = 'superseded' AND evaluation_id IS NULL
            AND observation_id IS NULL AND replacement_version_id IS NOT NULL)
        )
      );
    `);
    if (version === null) {
      db.prepare("INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)")
        .run(RUNTIME_SCHEMA_VERSION);
    } else if (version !== RUNTIME_SCHEMA_VERSION) {
      db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'schema_version' AND value = ?")
        .run(RUNTIME_SCHEMA_VERSION, version);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Canary-only, append-only projection schema. This is deliberately separate
 * from the shared runtime schema so stable vNext stores never acquire or read
 * this experimental evidence surface.
 */
export function initializeDiagnosticCanaryExperienceSchema(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const version = db.prepare(
      "SELECT value FROM schema_meta WHERE key = ?"
    ).get(DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_META_KEY) as { value: string } | undefined;
    if (version && version.value !== DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_VERSION) {
      throw new DiagnosticCanaryExperienceSchemaIncompatibleError(`unsupported version ${version.value}`);
    }
    if (!version && diagnosticCanaryExperienceObjectsExist(db)) {
      throw new DiagnosticCanaryExperienceSchemaIncompatibleError("unversioned canary projection objects");
    }
    if (!version) {
      db.exec(`
        CREATE TABLE canary_experience_records (
          id TEXT PRIMARY KEY,
          receipt_id TEXT NOT NULL UNIQUE REFERENCES effect_receipts(id) ON DELETE CASCADE,
          reservation_id TEXT NOT NULL UNIQUE REFERENCES action_reservations(id) ON DELETE CASCADE,
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
          action_name TEXT NOT NULL,
          contract_version TEXT NOT NULL,
          action_digest TEXT NOT NULL,
          effect_class TEXT NOT NULL CHECK (effect_class = 'local_read'),
          reconciled INTEGER NOT NULL CHECK (reconciled IN (0, 1)),
          observed_at TEXT NOT NULL,
          projected_at TEXT NOT NULL,
          cost TEXT NOT NULL CHECK (cost = 'unavailable')
        );
        CREATE INDEX canary_experience_records_run_idx
          ON canary_experience_records(run_id, observed_at, id);
      `);
      db.prepare("INSERT INTO schema_meta (key, value) VALUES (?, ?)").run(
        DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_META_KEY,
        DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_VERSION
      );
    }
    assertDiagnosticCanaryExperienceSchema(db);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function diagnosticCanaryExperienceObjectsExist(db: DatabaseSync): boolean {
  const row = db.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE name IN ('canary_experience_records', 'canary_experience_records_run_idx')
    LIMIT 1
  `).get() as { present: number } | undefined;
  return row !== undefined;
}

function assertDiagnosticCanaryExperienceSchema(db: DatabaseSync): void {
  const table = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'canary_experience_records'
  `).get() as { sql: string } | undefined;
  if (!table?.sql) {
    throw new DiagnosticCanaryExperienceSchemaIncompatibleError("canary_experience_records table is missing");
  }
  const columns = db.prepare("PRAGMA table_info(canary_experience_records)").all() as Array<{
    name: string;
    type: string;
  }>;
  const expectedColumns = [
    ["id", "TEXT"], ["receipt_id", "TEXT"], ["reservation_id", "TEXT"],
    ["run_id", "TEXT"], ["turn_id", "TEXT"], ["action_name", "TEXT"],
    ["contract_version", "TEXT"], ["action_digest", "TEXT"], ["effect_class", "TEXT"],
    ["reconciled", "INTEGER"], ["observed_at", "TEXT"], ["projected_at", "TEXT"],
    ["cost", "TEXT"]
  ];
  if (columns.length !== expectedColumns.length || columns.some((column, index) =>
    column.name !== expectedColumns[index]![0] || column.type !== expectedColumns[index]![1]
  )) {
    throw new DiagnosticCanaryExperienceSchemaIncompatibleError("canary_experience_records columns are invalid");
  }
  const definition = table.sql.replaceAll(/\s+/g, " ").toLowerCase();
  for (const fragment of [
    "id text primary key",
    "receipt_id text not null unique references effect_receipts(id) on delete cascade",
    "reservation_id text not null unique references action_reservations(id) on delete cascade",
    "run_id text not null references runs(id) on delete cascade",
    "turn_id text not null references turns(id) on delete cascade",
    "action_name text not null",
    "contract_version text not null",
    "action_digest text not null",
    "effect_class text not null check (effect_class = 'local_read')",
    "reconciled integer not null check (reconciled in (0, 1))",
    "observed_at text not null",
    "projected_at text not null",
    "cost text not null check (cost = 'unavailable')"
  ]) {
    if (!definition.includes(fragment)) {
      throw new DiagnosticCanaryExperienceSchemaIncompatibleError("canary_experience_records constraints are invalid");
    }
  }
  if (!hasSingleColumnUniqueIndex(db, "receipt_id") || !hasSingleColumnUniqueIndex(db, "reservation_id")) {
    throw new DiagnosticCanaryExperienceSchemaIncompatibleError("canary receipt lineage uniqueness is invalid");
  }
  const index = db.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'index' AND name = 'canary_experience_records_run_idx'
  `).get() as { present: number } | undefined;
  const indexColumns = db.prepare("PRAGMA index_info(canary_experience_records_run_idx)").all() as Array<{
    name: string;
  }>;
  if (!index || indexColumns.map((column) => column.name).join(",") !== "run_id,observed_at,id") {
    throw new DiagnosticCanaryExperienceSchemaIncompatibleError("canary inspection index is invalid");
  }
}

function hasSingleColumnUniqueIndex(db: DatabaseSync, columnName: string): boolean {
  const indexes = db.prepare("PRAGMA index_list(canary_experience_records)").all() as Array<{
    name: string;
    unique: number;
  }>;
  return indexes.some((index) => index.unique === 1 && (db.prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`)
    .all() as Array<{ name: string }>).map((column) => column.name).join(",") === columnName);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function assertWorkerLifecycleShape(
  db: DatabaseSync,
  version: "8" | "9" | "10" | "11" | "12" | "13"
): void {
  const required = version === "8"
    ? ["worker_sessions"]
    : version === "9"
      ? ["worker_sessions", "delivery_lineages", "execution_worker_sessions"]
      : version === "10"
        ? ["worker_sessions", "delivery_lineages", "execution_worker_bindings"]
        : version === "11"
          ? [
            "worker_sessions",
            "delivery_lineages",
            "execution_worker_bindings",
            "review_worker_bindings"
          ]
          : [
          "worker_sessions",
          "delivery_lineages",
          "execution_worker_bindings",
          "review_worker_bindings",
          "worker_groups",
          "worker_group_bindings"
          ];
  const forbidden = version === "8"
    ? [
      "delivery_lineages",
      "execution_worker_sessions",
      "execution_worker_bindings",
      "review_worker_bindings",
      "worker_groups",
      "worker_group_bindings"
    ]
    : version === "9"
      ? ["execution_worker_bindings", "review_worker_bindings", "worker_groups", "worker_group_bindings"]
      : version === "10"
        ? ["execution_worker_sessions", "review_worker_bindings", "worker_groups", "worker_group_bindings"]
        : version === "11"
          ? ["execution_worker_sessions", "worker_groups", "worker_group_bindings"]
          : ["execution_worker_sessions"];
  const missing = required.filter((name) => !tableExists(db, name));
  const unexpected = forbidden.filter((name) => tableExists(db, name));
  const workerSql = (version === "10" || version === "11" || version === "12" || version === "13")
    && tableExists(db, "worker_sessions")
    ? (db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'worker_sessions'
    `).get() as { sql: string | null } | undefined)?.sql?.replace(/\s+/gu, " ") ?? ""
    : "";
  const expectedKindConstraint = version === "10"
    ? "worker_kind IN ('discussion', 'execution')"
    : version === "11" || version === "12" || version === "13"
      ? "worker_kind IN ('discussion', 'execution', 'review')"
      : "";
  const mixedWorkerShape = expectedKindConstraint !== ""
    && !workerSql.includes(expectedKindConstraint);
  const oneKindIndex = indexExists(db, "worker_sessions_one_kind_per_parent_idx");
  const mixedGroupShape = ((version === "12" || version === "13") && oneKindIndex)
    || (version === "11" && !oneKindIndex)
    || ((version === "12" || version === "13") && hasMixedWorkerGroupState(db));
  if (missing.length > 0 || unexpected.length > 0 || mixedWorkerShape || mixedGroupShape) {
    throw new RuntimeSchemaIncompatibleError([
      version,
      missing.length > 0 ? `missing:${missing.join(",")}` : "",
      unexpected.length > 0 ? `unexpected:${unexpected.join(",")}` : "",
      mixedWorkerShape ? "mixed:worker_sessions" : "",
      mixedGroupShape ? "mixed:worker-groups" : ""
    ].filter(Boolean).join("/"));
  }
}

function migrateWorkerGroups(
  db: DatabaseSync,
  sourceVersion: "8" | "9" | "10" | "11"
): void {
  db.exec("DROP INDEX IF EXISTS worker_sessions_one_kind_per_parent_idx");
  db.exec(workerGroupTableSql(false));
  const workers = db.prepare(`
    SELECT id, parent_run_id, parent_turn_id, worker_kind, task_envelope_json,
           created_at, updated_at
    FROM worker_sessions
    ORDER BY created_at, id
  `).all() as unknown as Array<{
    id: string;
    parent_run_id: string;
    parent_turn_id: string;
    worker_kind: WorkerKind;
    task_envelope_json: string;
    created_at: string;
    updated_at: string;
  }>;
  for (const worker of workers) {
    let task: Record<string, unknown>;
    try {
      task = JSON.parse(worker.task_envelope_json) as Record<string, unknown>;
    } catch {
      throw new RuntimeSchemaIncompatibleError(`${sourceVersion}/invalid-worker-task-json`);
    }
    const budget = task.budget as Record<string, unknown> | undefined;
    if (typeof task.deadline_at !== "string" || !budget) {
      throw new RuntimeSchemaIncompatibleError(`${sourceVersion}/invalid-worker-task-budget`);
    }
    let prepared;
    try {
      prepared = materializePreparedWorkerGroup({
        request: singletonWorkerGroupRequest({
          parent_run_id: worker.parent_run_id,
          invocation_id: `migration-${worker.id}`,
          worker_kind: worker.worker_kind,
          deadline_at: task.deadline_at,
          budget: {
            max_output_tokens: Number(budget.max_output_tokens),
            timeout_ms: Number(budget.timeout_ms)
          }
        }),
        parent_run_id: worker.parent_run_id,
        parent_turn_id: worker.parent_turn_id,
        worker_id: worker.id,
        worker_kind: worker.worker_kind,
        task_deadline_at: task.deadline_at,
        task_budget: {
          max_output_tokens: Number(budget.max_output_tokens),
          timeout_ms: Number(budget.timeout_ms)
        }
      });
    } catch {
      throw new RuntimeSchemaIncompatibleError(`${sourceVersion}/invalid-worker-task-budget`);
    }
    insertWorkerGroup(db, prepared.group, worker.created_at, worker.updated_at);
    insertWorkerGroupBinding(db, prepared.allocation, worker.created_at);
  }
}

function workerGroupTableSql(ifNotExists: boolean): string {
  const clause = ifNotExists ? "IF NOT EXISTS " : "";
  return `
    CREATE TABLE ${clause}worker_groups (
      id TEXT PRIMARY KEY,
      parent_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      parent_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      group_key TEXT NOT NULL,
      digest TEXT NOT NULL UNIQUE,
      envelope_json TEXT NOT NULL,
      expected_worker_count INTEGER NOT NULL CHECK (expected_worker_count BETWEEN 1 AND 4),
      max_parallel INTEGER NOT NULL CHECK (max_parallel BETWEEN 1 AND 2),
      deadline_at TEXT NOT NULL,
      budget_max_output_tokens INTEGER NOT NULL CHECK (budget_max_output_tokens > 0),
      budget_max_duration_ms INTEGER NOT NULL CHECK (budget_max_duration_ms > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (parent_run_id, parent_turn_id, group_key),
      CHECK (max_parallel <= expected_worker_count)
    );
    CREATE INDEX ${clause}worker_groups_parent_idx
      ON worker_groups(parent_run_id, parent_turn_id, created_at);
    CREATE TABLE ${clause}worker_group_bindings (
      worker_id TEXT PRIMARY KEY REFERENCES worker_sessions(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES worker_groups(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      allocation_digest TEXT NOT NULL UNIQUE,
      allocation_json TEXT NOT NULL,
      allocation_max_output_tokens INTEGER NOT NULL CHECK (allocation_max_output_tokens > 0),
      allocation_timeout_ms INTEGER NOT NULL CHECK (allocation_timeout_ms > 0),
      created_at TEXT NOT NULL,
      UNIQUE (group_id, task_key)
    );
    CREATE INDEX ${clause}worker_group_bindings_group_idx
      ON worker_group_bindings(group_id, created_at);
  `;
}

function insertWorkerGroup(
  db: DatabaseSync,
  group: import("./worker_group_types.js").WorkerGroupEnvelope,
  createdAt: string,
  updatedAt: string
): void {
  db.prepare(`
    INSERT INTO worker_groups (
      id, parent_run_id, parent_turn_id, group_key, digest, envelope_json,
      expected_worker_count, max_parallel, deadline_at,
      budget_max_output_tokens, budget_max_duration_ms, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    group.id,
    group.parent_run_id,
    group.parent_turn_id,
    group.group_key,
    group.digest,
    JSON.stringify(group),
    group.expected_worker_count,
    group.max_parallel,
    group.deadline_at,
    group.budget.max_output_tokens,
    group.budget.max_duration_ms,
    createdAt,
    updatedAt
  );
}

function insertWorkerGroupBinding(
  db: DatabaseSync,
  allocation: import("./worker_group_types.js").WorkerGroupAllocation,
  createdAt: string
): void {
  db.prepare(`
    INSERT INTO worker_group_bindings (
      worker_id, group_id, task_key, allocation_digest, allocation_json,
      allocation_max_output_tokens, allocation_timeout_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    allocation.worker_id,
    allocation.group_id,
    allocation.task_key,
    allocation.digest,
    JSON.stringify(allocation),
    allocation.budget.max_output_tokens,
    allocation.budget.timeout_ms,
    createdAt
  );
}
function migrateWorkerLifecycleLedger(db: DatabaseSync, version: "8" | "9" | "10"): void {
  if (version === "10") {
    db.exec(`
      ALTER TABLE execution_worker_bindings RENAME TO execution_worker_bindings_legacy;
      ALTER TABLE worker_sessions RENAME TO worker_sessions_legacy;
    `);
    createWorkerLifecycleTable(db);
    db.exec(`
      INSERT INTO worker_sessions (
        id, reservation_id, parent_run_id, parent_turn_id, worker_kind, status,
        task_envelope_digest, task_envelope_json,
        child_execution_lock_digest, child_execution_lock_json,
        child_session_id, child_run_id,
        result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
        lease_ordinal, lease_owner_digest, lease_expires_at, attempt_id,
        created_at, updated_at
      )
      SELECT
        id, reservation_id, parent_run_id, parent_turn_id, worker_kind, status,
        task_envelope_digest, task_envelope_json,
        child_execution_lock_digest, child_execution_lock_json,
        child_session_id, child_run_id,
        result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
        lease_ordinal, lease_owner_digest, lease_expires_at, attempt_id,
        created_at, updated_at
      FROM worker_sessions_legacy;
      CREATE TABLE execution_worker_bindings (
        worker_id TEXT PRIMARY KEY REFERENCES worker_sessions(id) ON DELETE CASCADE,
        lineage_id TEXT NOT NULL UNIQUE REFERENCES delivery_lineages(id) ON DELETE RESTRICT
      );
      INSERT INTO execution_worker_bindings (worker_id, lineage_id)
      SELECT worker_id, lineage_id FROM execution_worker_bindings_legacy;
      DROP TABLE execution_worker_bindings_legacy;
      DROP TABLE worker_sessions_legacy;
    `);
    return;
  }
  db.exec("ALTER TABLE worker_sessions RENAME TO worker_sessions_legacy");
  const hasExecutionWorkers = version === "9";
  if (hasExecutionWorkers) {
    db.exec("ALTER TABLE execution_worker_sessions RENAME TO execution_worker_sessions_legacy");
  }
  createWorkerLifecycleTable(db);
  db.exec(`
    INSERT INTO worker_sessions (
      id, reservation_id, parent_run_id, parent_turn_id, worker_kind, status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json,
      child_session_id, child_run_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, attempt_id,
      created_at, updated_at
    )
    SELECT
      id, reservation_id, parent_run_id, parent_turn_id, 'discussion', status,
      task_envelope_digest, task_envelope_json,
      child_execution_lock_digest, child_execution_lock_json,
      child_session_id, child_run_id,
      result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
      lease_ordinal, lease_owner_digest, lease_expires_at, NULL,
      created_at, updated_at
    FROM worker_sessions_legacy;
  `);
  if (hasExecutionWorkers) {
    db.exec(`
      INSERT INTO worker_sessions (
        id, reservation_id, parent_run_id, parent_turn_id, worker_kind, status,
        task_envelope_digest, task_envelope_json,
        child_execution_lock_digest, child_execution_lock_json,
        child_session_id, child_run_id,
        result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
        lease_ordinal, lease_owner_digest, lease_expires_at, attempt_id,
        created_at, updated_at
      )
      SELECT
        id, reservation_id, parent_run_id, parent_turn_id, 'execution', status,
        task_envelope_digest, task_envelope_json,
        child_execution_lock_digest, child_execution_lock_json,
        NULL, NULL,
        result_envelope_digest, result_envelope_json, result_delivered_to_turn_id,
        lease_ordinal, lease_owner_digest, lease_expires_at, attempt_id,
        created_at, updated_at
      FROM execution_worker_sessions_legacy;
      CREATE TABLE execution_worker_bindings (
        worker_id TEXT PRIMARY KEY REFERENCES worker_sessions(id) ON DELETE CASCADE,
        lineage_id TEXT NOT NULL UNIQUE REFERENCES delivery_lineages(id) ON DELETE RESTRICT
      );
      INSERT INTO execution_worker_bindings (worker_id, lineage_id)
      SELECT id, lineage_id FROM execution_worker_sessions_legacy;
      DROP TABLE execution_worker_sessions_legacy;
    `);
  }
  db.exec("DROP TABLE worker_sessions_legacy");
}

function createWorkerLifecycleTable(db: DatabaseSync): void {
  db.exec(workerLifecycleTableSql(false));
}

function workerLifecycleTableSql(ifNotExists: boolean): string {
  return `
    CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}worker_sessions (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL UNIQUE REFERENCES action_reservations(id) ON DELETE CASCADE,
      parent_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      parent_turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      worker_kind TEXT NOT NULL CHECK (worker_kind IN ('discussion', 'execution', 'review')),
      status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'paused', 'needs_input', 'completed', 'failed')
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
      attempt_id TEXT UNIQUE,
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
        (worker_kind IN ('discussion', 'review') AND attempt_id IS NULL AND status != 'paused')
        OR (worker_kind = 'execution' AND child_session_id IS NULL AND child_run_id IS NULL
          AND ((status = 'queued' AND attempt_id IS NULL)
            OR (status != 'queued' AND attempt_id IS NOT NULL)))
      ),
      CHECK (
        (worker_kind = 'discussion' AND status IN ('queued', 'running')
          AND result_envelope_digest IS NULL AND result_envelope_json IS NULL
          AND result_delivered_to_turn_id IS NULL)
        OR (worker_kind = 'discussion' AND status IN ('needs_input', 'completed', 'failed')
          AND child_session_id IS NOT NULL AND child_run_id IS NOT NULL
          AND result_envelope_digest IS NOT NULL AND result_envelope_json IS NOT NULL)
        OR (worker_kind = 'review' AND status IN ('queued', 'running')
          AND result_envelope_digest IS NULL AND result_envelope_json IS NULL
          AND result_delivered_to_turn_id IS NULL)
        OR (worker_kind = 'review' AND status IN ('completed', 'failed')
          AND child_session_id IS NOT NULL AND child_run_id IS NOT NULL
          AND result_envelope_digest IS NOT NULL AND result_envelope_json IS NOT NULL)
        OR (worker_kind = 'execution' AND status IN ('queued', 'running', 'paused')
          AND result_envelope_digest IS NULL AND result_envelope_json IS NULL
          AND result_delivered_to_turn_id IS NULL)
        OR (worker_kind = 'execution' AND status IN ('needs_input', 'completed', 'failed')
          AND result_envelope_digest IS NOT NULL AND result_envelope_json IS NOT NULL)
      )
    );
  `;
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare(`
    SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(name) as { present: number } | undefined;
  return row?.present === 1;
}

function indexExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare(`
    SELECT 1 AS present FROM sqlite_master WHERE type = 'index' AND name = ?
  `).get(name) as { present: number } | undefined;
  return row?.present === 1;
}

function hasMixedWorkerGroupState(db: DatabaseSync): boolean {
  try {
    const missingRelation = db.prepare(`
      SELECT 1 AS present
      FROM worker_sessions AS workers
      LEFT JOIN worker_group_bindings AS bindings ON bindings.worker_id = workers.id
      WHERE bindings.worker_id IS NULL
      UNION ALL
      SELECT 1 AS present
      FROM worker_group_bindings AS bindings
      LEFT JOIN worker_sessions AS workers ON workers.id = bindings.worker_id
      WHERE workers.id IS NULL
      UNION ALL
      SELECT 1 AS present
      FROM worker_group_bindings AS bindings
      LEFT JOIN worker_groups AS groups ON groups.id = bindings.group_id
      WHERE groups.id IS NULL
      UNION ALL
      SELECT 1 AS present
      FROM worker_groups AS groups
      LEFT JOIN worker_group_bindings AS bindings ON bindings.group_id = groups.id
      WHERE bindings.group_id IS NULL
      LIMIT 1
    `).get() as { present: number } | undefined;
    if (missingRelation?.present === 1) return true;

    const foreignKeyFailures = db.prepare("PRAGMA foreign_key_check").all() as Array<{
      table: string;
    }>;
    if (foreignKeyFailures.some(({ table }) => table === "worker_groups"
      || table === "worker_group_bindings")) {
      return true;
    }

    const groupRows = db.prepare("SELECT * FROM worker_groups").all() as Array<{
      id: string;
      parent_run_id: string;
      parent_turn_id: string;
      group_key: string;
      digest: string;
      envelope_json: string;
      expected_worker_count: number;
      max_parallel: number;
      deadline_at: string;
      budget_max_output_tokens: number;
      budget_max_duration_ms: number;
    }>;
    const groups = new Map<string, WorkerGroupEnvelope>();
    for (const row of groupRows) {
      const group = parseWorkerGroupEnvelope(JSON.parse(row.envelope_json));
      if (row.id !== group.id
        || row.parent_run_id !== group.parent_run_id
        || row.parent_turn_id !== group.parent_turn_id
        || row.group_key !== group.group_key
        || row.digest !== group.digest
        || Number(row.expected_worker_count) !== group.expected_worker_count
        || Number(row.max_parallel) !== group.max_parallel
        || row.deadline_at !== group.deadline_at
        || Number(row.budget_max_output_tokens) !== group.budget.max_output_tokens
        || Number(row.budget_max_duration_ms) !== group.budget.max_duration_ms) {
        return true;
      }
      groups.set(group.id, group);
    }

    const bindingRows = db.prepare(`
      SELECT bindings.*, workers.worker_kind, workers.parent_run_id,
             workers.parent_turn_id, workers.task_envelope_json
      FROM worker_group_bindings AS bindings
      JOIN worker_sessions AS workers ON workers.id = bindings.worker_id
    `).all() as Array<{
      worker_id: string;
      group_id: string;
      task_key: string;
      allocation_digest: string;
      allocation_json: string;
      allocation_max_output_tokens: number;
      allocation_timeout_ms: number;
      worker_kind: WorkerKind;
      parent_run_id: string;
      parent_turn_id: string;
      task_envelope_json: string;
    }>;
    const totals = new Map<string, {
      worker_count: number;
      max_output_tokens: number;
      timeout_ms: number;
    }>();
    for (const row of bindingRows) {
      const allocation = parseWorkerGroupAllocation(JSON.parse(row.allocation_json));
      const group = groups.get(row.group_id);
      const task = JSON.parse(row.task_envelope_json) as {
        deadline_at?: unknown;
        budget?: { max_output_tokens?: unknown; timeout_ms?: unknown };
      };
      if (!group
        || row.worker_id !== allocation.worker_id
        || row.group_id !== allocation.group_id
        || row.task_key !== allocation.task_key
        || row.allocation_digest !== allocation.digest
        || Number(row.allocation_max_output_tokens) !== allocation.budget.max_output_tokens
        || Number(row.allocation_timeout_ms) !== allocation.budget.timeout_ms
        || row.worker_kind !== allocation.worker_kind
        || row.parent_run_id !== group.parent_run_id
        || row.parent_turn_id !== group.parent_turn_id
        || allocation.group_digest !== group.digest
        || Date.parse(allocation.deadline_at) > Date.parse(group.deadline_at)
        || task.deadline_at !== allocation.deadline_at
        || task.budget?.max_output_tokens !== allocation.budget.max_output_tokens
        || task.budget?.timeout_ms !== allocation.budget.timeout_ms) {
        return true;
      }
      const total = totals.get(group.id) ?? {
        worker_count: 0,
        max_output_tokens: 0,
        timeout_ms: 0
      };
      total.worker_count += 1;
      total.max_output_tokens += allocation.budget.max_output_tokens;
      total.timeout_ms += allocation.budget.timeout_ms;
      totals.set(group.id, total);
    }
    for (const group of groups.values()) {
      const total = totals.get(group.id);
      if (!total
        || total.worker_count > group.expected_worker_count
        || total.max_output_tokens > group.budget.max_output_tokens
        || total.timeout_ms > group.budget.max_duration_ms) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
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
