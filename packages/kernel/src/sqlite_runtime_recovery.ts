import { DatabaseSync } from "node:sqlite";
import {
  parsePiEntry,
  type PiEntryRow,
  type RunExecutionRow
} from "./sqlite_runtime_codec.js";

export function selectRecoveryPiSessionEntries(input: {
  db: DatabaseSync;
  current_execution_id: string;
  recovery_of_execution_id: string;
  run_id: string;
  session_id: string;
  path_entry_ids: ReadonlySet<string>;
}): unknown[] {
  let interrupted = requireInterruptedExecution(
    input.db,
    input.recovery_of_execution_id,
    input.run_id,
    input.current_execution_id
  );
  let sessionStartSeq = interrupted.session_start_seq;
  const visited = new Set([input.current_execution_id, interrupted.id]);
  while (interrupted.recovery_of_execution_id) {
    if (visited.has(interrupted.recovery_of_execution_id)) {
      throw new Error(
        `Run execution recovery lineage contains a cycle: ${input.current_execution_id}`
      );
    }
    const ancestor = requireInterruptedExecution(
      input.db,
      interrupted.recovery_of_execution_id,
      input.run_id,
      input.current_execution_id
    );
    if (ancestor.ordinal >= interrupted.ordinal) {
      throw new Error(`Run execution recovery lineage is invalid: ${input.current_execution_id}`);
    }
    visited.add(ancestor.id);
    sessionStartSeq = Math.min(sessionStartSeq, ancestor.session_start_seq);
    interrupted = ancestor;
  }
  return (input.db.prepare(`
    SELECT seq, entry_json
    FROM pi_session_entries
    WHERE session_id = ? AND seq > ?
    ORDER BY seq ASC
  `).all(input.session_id, sessionStartSeq) as unknown as PiEntryRow[])
    .map((row) => JSON.parse(row.entry_json) as unknown)
    .filter((entry) => input.path_entry_ids.has(parsePiEntry(entry).id));
}

function requireInterruptedExecution(
  db: DatabaseSync,
  executionId: string,
  runId: string,
  currentExecutionId: string
): RunExecutionRow {
  const execution = db.prepare(`
    SELECT *
    FROM run_executions
    WHERE id = ? AND run_id = ? AND state = 'interrupted' AND outcome = 'interrupted'
  `).get(executionId, runId) as RunExecutionRow | undefined;
  if (!execution) {
    throw new Error(`Run execution recovery lineage is invalid: ${currentExecutionId}`);
  }
  return execution;
}
