import { DatabaseSync } from "node:sqlite";
import type { RunInspection, RunRecord } from "./contracts.js";

export function inspectRuntimeRun(db: DatabaseSync, run: RunRecord): RunInspection {
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
  return {
    ...run,
    event_count: events,
    session_entry_count: entries,
    action_count: actions,
    unresolved_action_count: unresolved,
    effect_receipt_count: receipts,
    continuation_count: continuations,
    execution_count: executions,
    interrupted_execution_count: interruptedExecutions,
    model_dispatch_count: dispatches,
    unknown_model_dispatch_count: unknownDispatches
  };
}

function count(db: DatabaseSync, statement: string, identity: string): number {
  const row = db.prepare(statement).get(identity) as { count: number };
  return Number(row.count);
}
