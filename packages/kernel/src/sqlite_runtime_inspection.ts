import { DatabaseSync } from "node:sqlite";
import type { ExecutionLock, RunInspection, RunRecord } from "./contracts.js";

export function inspectRuntimeRun(
  db: DatabaseSync,
  run: RunRecord,
  executionLock: ExecutionLock
): RunInspection {
  const runId = run.id;
  const events = count(db, "SELECT COUNT(*) AS count FROM runtime_events WHERE run_id = ?", runId);
  const entries = count(
    db,
    "SELECT COUNT(*) AS count FROM pi_session_entries WHERE session_id = ?",
    run.session_id
  );
  const actions = count(db, "SELECT COUNT(*) AS count FROM action_reservations WHERE run_id = ?", runId);
  const unresolved = count(db, `
    SELECT COUNT(*) AS count
    FROM action_reservations
    WHERE run_id = ? AND state != 'terminal'
  `, runId);
  const receipts = count(db, "SELECT COUNT(*) AS count FROM effect_receipts WHERE run_id = ?", runId);
  const continuations = count(db, `
    SELECT COUNT(*) AS count
    FROM runtime_events
    WHERE run_id = ? AND kind = 'run_continued'
  `, runId);
  const executions = count(db, "SELECT COUNT(*) AS count FROM run_executions WHERE run_id = ?", runId);
  const interruptedExecutions = count(db, `
    SELECT COUNT(*) AS count
    FROM run_executions
    WHERE run_id = ? AND state = 'interrupted'
  `, runId);
  const dispatches = count(db, "SELECT COUNT(*) AS count FROM model_dispatches WHERE run_id = ?", runId);
  const unknownDispatches = count(db, `
    SELECT COUNT(*) AS count
    FROM model_dispatches
    WHERE run_id = ? AND state = 'outcome_unknown'
  `, runId);
  const workers = count(db, `
    SELECT COUNT(*) AS count FROM (
      SELECT parent_run_id FROM worker_sessions
      UNION ALL
      SELECT parent_run_id FROM execution_worker_sessions
    ) WHERE parent_run_id = ?
  `, runId);
  const outstandingWorkers = count(db, `
    SELECT COUNT(*) AS count FROM (
      SELECT parent_run_id, result_delivered_to_turn_id FROM worker_sessions
      UNION ALL
      SELECT parent_run_id, result_delivered_to_turn_id FROM execution_worker_sessions
    )
    WHERE parent_run_id = ? AND result_delivered_to_turn_id IS NULL
  `, runId);
  const deliverableWorkers = count(db, `
    SELECT COUNT(*) AS count FROM (
      SELECT parent_run_id, result_envelope_json, result_delivered_to_turn_id FROM worker_sessions
      UNION ALL
      SELECT parent_run_id, result_envelope_json, result_delivered_to_turn_id
      FROM execution_worker_sessions
    )
    WHERE parent_run_id = ? AND result_envelope_json IS NOT NULL
      AND result_delivered_to_turn_id IS NULL
  `, runId);
  return {
    ...run,
    execution_lock_digest: executionLock.digest,
    execution_lock: executionLock,
    event_count: events,
    session_entry_count: entries,
    action_count: actions,
    unresolved_action_count: unresolved,
    effect_receipt_count: receipts,
    continuation_count: continuations,
    execution_count: executions,
    interrupted_execution_count: interruptedExecutions,
    model_dispatch_count: dispatches,
    unknown_model_dispatch_count: unknownDispatches,
    worker_count: workers,
    outstanding_worker_count: outstandingWorkers,
    deliverable_worker_count: deliverableWorkers
  };
}

function count(db: DatabaseSync, statement: string, identity: string): number {
  const row = db.prepare(statement).get(identity) as { count: number };
  return Number(row.count);
}
