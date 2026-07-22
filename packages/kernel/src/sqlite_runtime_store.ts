import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ActionEffectClass,
  ActionObservation,
  ActionRecoveryEvidence,
  ActionReservation,
  EffectReceipt,
  JsonObject
} from "./action_types.js";
import { stableJson } from "./canonical_json.js";
import type {
  ExecutionLock,
  RunInspection,
  RunRecord,
  RuntimeSessionRecord,
  SessionInspection,
  SubmitRequest
} from "./contracts.js";
import {
  ExecutionLockMismatchError,
  executionLockAllowsAction,
  materializeExecutionLock,
  parseExecutionLock
} from "./execution_lock.js";
import {
  assertExecutionLockNarrowing,
  materializeTaskEnvelope,
  normalizeDiscussionTaskInput,
  parseResultEnvelope,
  parseTaskEnvelope,
  type ResultEnvelope,
  type TaskEnvelope,
  type WorkerExecutionLease,
  type WorkerInspection,
  type WorkerRunBinding
} from "./orchestration_types.js";
import type {
  ModelDispatchRecord,
  RunExecutionKind,
  RunExecutionLease,
  RunExecutionModelEvidence,
  RunExecutionOutcome,
  RunExecutionRecoveryEvidence,
  SettledRunExecutionEvidence
} from "./execution_types.js";
import {
  actionDigest,
  boundedText,
  leaseExpiry,
  parseJsonObject,
  parsePiEntry,
  runtimeId as id,
  sameStrings,
  sha256,
  sortedUnique,
  toActionReservation,
  toEffectReceipt,
  toModelDispatch,
  type ActionReservationRow,
  type ExecutionLockRow,
  type EffectReceiptRow,
  type ModelDispatchRow,
  type PiEntryRow,
  type PiSessionRow,
  type RunExecutionRow,
  type RunRow,
  type RuntimeSessionRow,
  type RuntimeEventRow,
  type StoredPiEntry
} from "./sqlite_runtime_codec.js";
import { validateRuntimeLeaseDuration } from "./runtime_limits.js";
import {
  initializeRuntimeSchema,
  RUNTIME_SCHEMA_VERSION,
  RuntimeSchemaIncompatibleError
} from "./sqlite_runtime_schema.js";
import { inspectRuntimeRun } from "./sqlite_runtime_inspection.js";
import { selectRecoveryPiSessionEntries } from "./sqlite_runtime_recovery.js";

export class RunHasUnresolvedActionsError extends Error {
  constructor(readonly runId: string) {
    super(`Run has unresolved action reservations: ${runId}`);
    this.name = "RunHasUnresolvedActionsError";
  }
}

function runtimeSessionId(input: string): string {
  const value = input.trim();
  if (!/^session_[a-f0-9]{32}$/u.test(value)) {
    throw new Error("Runtime Session id is invalid.");
  }
  return value;
}

export class RuntimeSessionNotFoundError extends Error {
  readonly code = "session_not_found";

  constructor(readonly sessionId: string) {
    super(`Runtime Session not found: ${sessionId}`);
    this.name = "RuntimeSessionNotFoundError";
  }
}

export class RuntimeSessionBusyError extends Error {
  readonly code = "session_busy";

  constructor(readonly sessionId: string, readonly runId: string) {
    super(`Runtime Session is busy with Run ${runId}: ${sessionId}`);
    this.name = "RuntimeSessionBusyError";
  }
}

export type RuntimeStateProfile = "stable_cli" | "diagnostic_canary";

export class RuntimeStateProfileIncompatibleError extends Error {
  readonly code = "schema_incompatible";

  constructor(readonly expectedProfile: RuntimeStateProfile, readonly actualProfile: string) {
    super(`vNext runtime state profile is incompatible: expected ${expectedProfile}, found ${actualProfile}`);
    this.name = "RuntimeStateProfileIncompatibleError";
  }
}

export interface SqliteRuntimeStoreOptions {
  state_profile?: RuntimeStateProfile;
}

interface WorkerSessionRow {
  id: string;
  reservation_id: string;
  parent_run_id: string;
  parent_turn_id: string;
  status: WorkerInspection["status"];
  task_envelope_digest: string;
  task_envelope_json: string;
  child_execution_lock_digest: string;
  child_execution_lock_json: string;
  child_session_id: string | null;
  child_run_id: string | null;
  result_envelope_digest: string | null;
  result_envelope_json: string | null;
  result_delivered_to_turn_id: string | null;
  lease_ordinal: number;
  lease_owner_digest: string | null;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteRuntimeStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;

  constructor(dbPath: string, options: SqliteRuntimeStoreOptions = {}) {
    this.dbPath = resolve(dbPath);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath, { timeout: 5_000 });
    try {
      initializeRuntimeSchema(this.db);
      if (options.state_profile) this.bindStateProfile(options.state_profile);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  beginRun(input: SubmitRequest, leaseMs: number, workerBinding?: WorkerRunBinding): {
    run: RunRecord;
    execution: RunExecutionLease;
    execution_lock: ExecutionLock;
    request: string;
  } {
    const request = input.request.trim();
    if (!request) throw new Error("Run request must not be empty.");
    const createdAt = new Date().toISOString();
    const runId = id("run");
    const turnId = id("turn");
    const requestedSessionId = input.session_id === undefined
      ? null
      : runtimeSessionId(input.session_id);
    const sessionId = requestedSessionId ?? id("session");
    const goalId = input.goal_id?.trim() || null;
    const executionLock = materializeExecutionLock(input.execution_lock, createdAt);

    let execution!: RunExecutionLease;
    this.transaction(() => {
      if (requestedSessionId === null) {
        this.db.prepare(`
          INSERT INTO sessions (id, created_at, updated_at)
          VALUES (?, ?, ?)
        `).run(sessionId, createdAt, createdAt);
        this.db.prepare(`
          INSERT INTO pi_sessions (id, created_at, leaf_id)
          VALUES (?, ?, NULL)
        `).run(sessionId, createdAt);
      } else {
        this.requireSession(sessionId);
        const blocking = this.getOpenSessionRun(sessionId);
        if (blocking) throw new RuntimeSessionBusyError(sessionId, blocking.id);
      }
      this.db.prepare(`
        INSERT INTO runs (
          id, status, goal_id, answer, error,
          session_id, turn_id, created_at, updated_at
        ) VALUES (?, 'running', ?, NULL, NULL, ?, ?, ?, ?)
      `).run(runId, goalId, sessionId, turnId, createdAt, createdAt);
      this.db.prepare(`
        INSERT INTO execution_locks (run_id, digest, lock_json, created_at)
        VALUES (?, ?, ?, ?)
      `).run(runId, executionLock.digest, JSON.stringify(executionLock), createdAt);
      this.db.prepare(`
        INSERT INTO turns (
          id, run_id, ordinal, status, request, answer, error, created_at, updated_at
        ) VALUES (?, ?, 1, 'running', ?, NULL, NULL, ?, ?)
      `).run(turnId, runId, request, createdAt, createdAt);
      this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(createdAt, sessionId);
      this.insertEvent(runId, turnId, "run_started", {
        goal_id: goalId,
        session_created: requestedSessionId === null,
        execution_lock_digest: executionLock.digest
      });
      execution = this.insertRunExecution({
        run_id: runId,
        turn_id: turnId,
        kind: "initial",
        input_digest: sha256(request),
        recovery_of_execution_id: null,
        lease_ms: leaseMs
      });
      if (workerBinding) {
        this.bindWorkerRunInTransaction(workerBinding, {
          run_id: runId,
          session_id: sessionId,
          execution_lock_digest: executionLock.digest
        });
      }
    });

    return { run: this.requireRun(runId), execution, execution_lock: executionLock, request };
  }

  completeRun(execution: RunExecutionLease, answer: string): RunRecord {
    return this.settleRunExecution(execution, "completed", answer, null);
  }

  pauseRun(execution: RunExecutionLease, error: string): RunRecord {
    const message = error.trim().slice(0, 4_000) || "Run paused for unresolved action recovery.";
    return this.settleRunExecution(execution, "paused", null, message);
  }

  pauseWorkerResultIntegration(execution: RunExecutionLease, error: string): RunRecord {
    if (this.getDeliveredWorkerResults(execution.run_id, execution.turn_id).length === 0) {
      throw new Error(`Worker Result integration has no delivered evidence: ${execution.run_id}`);
    }
    const delivery = this.db.prepare(`
      SELECT 1 AS present
      FROM runtime_events
      WHERE run_id = ? AND turn_id = ? AND kind = 'worker_result_delivered'
      LIMIT 1
    `).get(execution.run_id, execution.turn_id) as { present: number } | undefined;
    if (!delivery) {
      throw new Error(`Worker Result integration Turn lineage is missing: ${execution.run_id}`);
    }
    const message = error.trim().slice(0, 4_000)
      || "Supervisor integration failed before it could settle the Worker Result.";
    return this.settleRunExecution(
      execution,
      "paused",
      null,
      message,
      "worker_result_integration_failed"
    );
  }

  waitRun(execution: RunExecutionLease, checkpoint: string): RunRecord {
    if (this.hasUnresolvedActions(execution.run_id)) {
      throw new RunHasUnresolvedActionsError(execution.run_id);
    }
    if (!this.hasOutstandingWorkers(execution.run_id)) {
      throw new Error(`Run has no outstanding Worker Session: ${execution.run_id}`);
    }
    const answer = checkpoint.trim().slice(0, 32_000)
      || "Supervisor Turn settled while waiting for Worker Result delivery.";
    return this.settleRunExecution(execution, "waiting", answer, null);
  }

  getRunContinuationEvidence(runId: string): ActionRecoveryEvidence[] {
    const run = this.requireRun(runId);
    if (run.status !== "paused") throw new Error(`Run is not paused: ${runId}`);
    if (this.hasUnresolvedActions(runId)) throw new RunHasUnresolvedActionsError(runId);
    const pause = this.db.prepare(`
      SELECT seq, payload_json
      FROM runtime_events
      WHERE run_id = ? AND kind = 'run_paused'
      ORDER BY seq DESC
      LIMIT 1
    `).get(runId) as RuntimeEventRow | undefined;
    if (!pause) throw new Error(`Paused Run has no canonical pause event: ${runId}`);
    const observed = this.db.prepare(`
      SELECT seq, payload_json
      FROM runtime_events
      WHERE run_id = ? AND kind = 'action_observed' AND seq > ?
      ORDER BY seq ASC
    `).all(runId, pause.seq) as unknown as RuntimeEventRow[];
    return observed.map((event) => {
      const payload = parseJsonObject(event.payload_json, "Action observed event payload");
      const reservationId = typeof payload.reservation_id === "string"
        ? payload.reservation_id
        : "";
      const receiptId = typeof payload.receipt_id === "string" ? payload.receipt_id : "";
      if (!reservationId || !receiptId) {
        throw new Error(`Action observed event identity is invalid: ${runId}/${event.seq}`);
      }
      const reservation = this.requireActionReservation(reservationId);
      const receipt = this.requireEffectReceipt(reservationId);
      if (reservation.run_id !== runId
        || reservation.turn_id !== run.turn_id
        || reservation.state !== "terminal"
        || receipt.id !== receiptId) {
        throw new Error(`Action continuation evidence is invalid: ${reservationId}`);
      }
      return { reservation, receipt };
    });
  }

  interruptExpiredRunExecution(runId: string): RunExecutionRecoveryEvidence {
    return this.transaction(() => {
      const run = this.requireRun(runId);
      if (run.status !== "running") throw new Error(`Run is not running: ${runId}`);
      const execution = this.requireActiveRunExecution(runId);
      const interruptedAt = new Date().toISOString();
      if (execution.lease_expires_at > interruptedAt) {
        throw new Error(`Run execution lease is still active: ${runId}`);
      }
      this.db.prepare(`
        UPDATE model_dispatches
        SET state = 'outcome_unknown', updated_at = ?
        WHERE execution_id = ? AND state IN ('dispatching', 'response_observed')
      `).run(interruptedAt, execution.id);
      const executionResult = this.db.prepare(`
        UPDATE run_executions
        SET state = 'interrupted', outcome = 'interrupted', error = ?,
            updated_at = ?, settled_at = ?
        WHERE id = ? AND state = 'active' AND lease_expires_at <= ?
      `).run(
        "Run execution lease expired before settlement.",
        interruptedAt,
        interruptedAt,
        execution.id,
        interruptedAt
      );
      if (Number(executionResult.changes) !== 1) {
        throw new Error(`Run execution could not be interrupted: ${runId}`);
      }
      const message = "Run paused because its execution lease expired before provider/model settlement.";
      this.updateRunningRunAndTurn(run, "paused", null, message, interruptedAt);
      this.insertEvent(runId, run.turn_id, "run_execution_interrupted", {
        execution_id: execution.id,
        execution_ordinal: execution.ordinal
      });
      this.insertEvent(runId, run.turn_id, "run_paused", {
        reason: message,
        reason_kind: "execution_interrupted",
        execution_id: execution.id
      });
      return this.requireRunExecutionRecoveryEvidence(runId, execution.id);
    });
  }

  getRunExecutionRecoveryEvidence(runId: string): RunExecutionRecoveryEvidence | null {
    const run = this.requireRun(runId);
    if (run.status !== "paused") throw new Error(`Run is not paused: ${runId}`);
    const pause = this.db.prepare(`
      SELECT seq, payload_json
      FROM runtime_events
      WHERE run_id = ? AND kind = 'run_paused'
      ORDER BY seq DESC
      LIMIT 1
    `).get(runId) as RuntimeEventRow | undefined;
    if (!pause) return null;
    const payload = parseJsonObject(pause.payload_json, "Run pause event payload");
    if (payload.reason_kind !== "execution_interrupted" || typeof payload.execution_id !== "string") {
      return null;
    }
    return this.requireRunExecutionRecoveryEvidence(runId, payload.execution_id);
  }

  resumeRun(input: {
    run_id: string;
    evidence_digest: string;
    lease_ms: number;
  } & ({
    kind: "action_reconciliation";
    receipt_ids: string[];
  } | {
    kind: "dispatch_recovery";
    interrupted_execution_id: string;
    dispatch_ids: string[];
  } | {
    kind: "protocol_recovery";
    interrupted_execution_id: string;
  })): { run: RunRecord; execution: RunExecutionLease } {
    return this.transaction(() => {
      const run = this.requireRun(input.run_id);
      if (run.status !== "paused") throw new Error(`Run is not paused: ${input.run_id}`);
      if (this.hasUnresolvedActions(input.run_id)) throw new RunHasUnresolvedActionsError(input.run_id);
      const continuationRefs: string[] = [];
      const executionRecovery = this.getRunExecutionRecoveryEvidence(input.run_id);
      const recoveryOfExecutionId = executionRecovery?.execution_id ?? null;
      let executionKind: RunExecutionKind;
      if (input.kind === "action_reconciliation") {
        const expectedReceiptIds = sortedUnique(input.receipt_ids);
        if (expectedReceiptIds.length === 0) {
          throw new Error(`Run has no reconciled Action evidence for continuation: ${input.run_id}`);
        }
        const currentReceiptIds = this.getRunContinuationEvidence(input.run_id)
          .map(({ receipt }) => receipt.id)
          .sort();
        if (!sameStrings(currentReceiptIds, expectedReceiptIds)) {
          throw new Error(`Run continuation evidence changed before resume: ${input.run_id}`);
        }
        if (executionRecovery) {
          continuationRefs.push(
            executionRecovery.execution_id,
            ...executionRecovery.dispatches.map((dispatch) => dispatch.id)
          );
        }
        continuationRefs.push(...expectedReceiptIds);
        executionKind = "action_continuation";
      } else if (input.kind === "dispatch_recovery") {
        const evidence = executionRecovery;
        if (!evidence || evidence.execution_id !== input.interrupted_execution_id) {
          throw new Error(`Run dispatch recovery evidence is not current: ${input.run_id}`);
        }
        const expectedDispatchIds = sortedUnique(input.dispatch_ids);
        const currentDispatchIds = evidence.dispatches.map((dispatch) => dispatch.id).sort();
        if (!sameStrings(currentDispatchIds, expectedDispatchIds)) {
          throw new Error(`Run dispatch recovery evidence changed before resume: ${input.run_id}`);
        }
        continuationRefs.push(input.interrupted_execution_id, ...expectedDispatchIds);
        executionKind = "dispatch_recovery";
      } else {
        const evidence = executionRecovery;
        if (!evidence
          || evidence.execution_id !== input.interrupted_execution_id
          || evidence.dispatches.length > 0) {
          throw new Error(`Run protocol recovery evidence is not current: ${input.run_id}`);
        }
        continuationRefs.push(input.interrupted_execution_id);
        executionKind = "protocol_recovery";
      }
      const evidenceDigest = actionDigest(input.evidence_digest);
      const updatedAt = new Date().toISOString();
      const runResult = this.db.prepare(`
        UPDATE runs
        SET status = 'running', answer = NULL, error = NULL, updated_at = ?
        WHERE id = ? AND status = 'paused'
      `).run(updatedAt, input.run_id);
      if (Number(runResult.changes) !== 1) throw new Error(`Run is not paused: ${input.run_id}`);
      const turnResult = this.db.prepare(`
        UPDATE turns
        SET status = 'running', answer = NULL, error = NULL, updated_at = ?
        WHERE id = ? AND status = 'paused'
      `).run(updatedAt, run.turn_id);
      if (Number(turnResult.changes) !== 1) throw new Error(`Turn is not paused: ${run.turn_id}`);
      this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(updatedAt, run.session_id);
      this.insertEvent(input.run_id, run.turn_id, "run_continued", {
        kind: input.kind,
        evidence_refs: continuationRefs,
        evidence_digest: evidenceDigest
      });
      const execution = this.insertRunExecution({
        run_id: input.run_id,
        turn_id: run.turn_id,
        kind: executionKind,
        input_digest: evidenceDigest,
        recovery_of_execution_id: recoveryOfExecutionId,
        lease_ms: input.lease_ms
      });
      return { run: this.requireRun(input.run_id), execution };
    });
  }

  failRun(execution: RunExecutionLease, error: string): RunRecord {
    const message = error.trim().slice(0, 4_000) || "Agent loop failed.";
    return this.settleRunExecution(execution, "failed", null, message);
  }

  renewRunExecution(execution: RunExecutionLease, leaseMs: number): RunExecutionLease {
    const renewedAt = new Date().toISOString();
    const leaseExpiresAt = leaseExpiry(renewedAt, leaseMs);
    const result = this.db.prepare(`
      UPDATE run_executions
      SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND run_id = ? AND turn_id = ? AND state = 'active'
        AND owner_token_digest = ? AND lease_expires_at > ?
    `).run(
      leaseExpiresAt,
      renewedAt,
      execution.id,
      execution.run_id,
      execution.turn_id,
      sha256(execution.token),
      renewedAt
    );
    if (Number(result.changes) !== 1) {
      throw new Error(`Run execution lease could not be renewed: ${execution.id}`);
    }
    return { ...execution, lease_expires_at: leaseExpiresAt };
  }

  startModelDispatch(
    execution: RunExecutionLease,
    input: { provider: string; model: string }
  ): ModelDispatchRecord {
    return this.transaction(() => {
      this.requireActiveExecutionLease(execution);
      const lock = this.getExecutionLock(execution.run_id);
      const provider = boundedText(input.provider, 120, "Model provider");
      const model = boundedText(input.model, 200, "Model id");
      if (provider !== lock.model.provider || model !== lock.model.model) {
        throw new ExecutionLockMismatchError(
          `Model dispatch does not match the immutable Execution Lock: ${execution.run_id}`
        );
      }
      const existing = this.getActiveModelDispatch(execution.id);
      if (existing) throw new Error(`Model dispatch is already active: ${existing.id}`);
      const ordinalRow = this.db.prepare(`
        SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal
        FROM model_dispatches
        WHERE execution_id = ?
      `).get(execution.id) as { ordinal: number };
      const createdAt = new Date().toISOString();
      const dispatchId = id("model_dispatch");
      this.db.prepare(`
        INSERT INTO model_dispatches (
          id, execution_id, run_id, turn_id, ordinal, provider, model, state,
          response_status, stop_reason, message_digest, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'dispatching', NULL, NULL, NULL, ?, ?)
      `).run(
        dispatchId,
        execution.id,
        execution.run_id,
        execution.turn_id,
        Number(ordinalRow.ordinal),
        provider,
        model,
        createdAt,
        createdAt
      );
      this.insertEvent(execution.run_id, execution.turn_id, "model_dispatch_started", {
        execution_id: execution.id,
        dispatch_id: dispatchId,
        dispatch_ordinal: Number(ordinalRow.ordinal),
        provider: input.provider,
        model: input.model
      });
      return this.requireModelDispatch(dispatchId);
    });
  }

  observeModelResponse(
    execution: RunExecutionLease,
    dispatchId: string,
    responseStatus: number
  ): ModelDispatchRecord {
    return this.transaction(() => {
      this.requireActiveExecutionLease(execution);
      if (!Number.isInteger(responseStatus) || responseStatus < 100 || responseStatus > 599) {
        throw new Error("Model response status is invalid.");
      }
      const dispatch = this.requireModelDispatch(dispatchId);
      if (dispatch.execution_id !== execution.id
        || !["dispatching", "response_observed"].includes(dispatch.state)) {
        throw new Error(`Model dispatch cannot observe a response: ${dispatchId}`);
      }
      const updatedAt = new Date().toISOString();
      const result = this.db.prepare(`
        UPDATE model_dispatches
        SET state = 'response_observed', response_status = ?, updated_at = ?
        WHERE id = ? AND state IN ('dispatching', 'response_observed')
      `).run(responseStatus, updatedAt, dispatchId);
      if (Number(result.changes) !== 1) {
        throw new Error(`Model dispatch response state changed: ${dispatchId}`);
      }
      this.insertEvent(execution.run_id, execution.turn_id, "model_response_observed", {
        execution_id: execution.id,
        dispatch_id: dispatchId,
        response_status: responseStatus
      });
      return this.requireModelDispatch(dispatchId);
    });
  }

  settleModelDispatch(
    execution: RunExecutionLease,
    dispatchId: string,
    input: { stop_reason: string; message_digest: string }
  ): ModelDispatchRecord {
    return this.transaction(() => {
      this.requireActiveExecutionLease(execution);
      const dispatch = this.requireModelDispatch(dispatchId);
      if (dispatch.execution_id !== execution.id
        || !["dispatching", "response_observed"].includes(dispatch.state)) {
        throw new Error(`Model dispatch cannot settle: ${dispatchId}`);
      }
      const updatedAt = new Date().toISOString();
      const stopReason = boundedText(input.stop_reason, 80, "Model stop reason");
      const messageDigest = actionDigest(input.message_digest);
      const result = this.db.prepare(`
        UPDATE model_dispatches
        SET state = 'settled', stop_reason = ?, message_digest = ?, updated_at = ?
        WHERE id = ? AND state IN ('dispatching', 'response_observed')
      `).run(stopReason, messageDigest, updatedAt, dispatchId);
      if (Number(result.changes) !== 1) {
        throw new Error(`Model dispatch settlement state changed: ${dispatchId}`);
      }
      this.insertEvent(execution.run_id, execution.turn_id, "model_dispatch_settled", {
        execution_id: execution.id,
        dispatch_id: dispatchId,
        stop_reason: stopReason,
        message_digest: messageDigest
      });
      return this.requireModelDispatch(dispatchId);
    });
  }

  reconcileRecoveredModelDispatch(
    execution: RunExecutionLease,
    input: { stop_reason: string; message_digest: string }
  ): ModelDispatchRecord {
    return this.transaction(() => {
      const recovery = this.requireActiveExecutionLease(execution);
      if (!recovery.recovery_of_execution_id) {
        throw new Error(`Recovered assistant has no prior execution lineage: ${execution.id}`);
      }
      const producer = this.db.prepare(`
        SELECT *
        FROM model_dispatches
        WHERE execution_id = ?
        ORDER BY ordinal DESC
        LIMIT 1
      `).get(recovery.recovery_of_execution_id) as ModelDispatchRow | undefined;
      if (!producer || producer.run_id !== execution.run_id || producer.turn_id !== execution.turn_id) {
        throw new Error(`Recovered assistant model lineage is missing: ${execution.id}`);
      }
      const stopReason = boundedText(input.stop_reason, 80, "Recovered model stop reason");
      const messageDigest = actionDigest(input.message_digest);
      if (producer.state === "settled") {
        if (producer.stop_reason !== stopReason || producer.message_digest !== messageDigest) {
          throw new Error(`Recovered assistant model evidence drifted: ${producer.id}`);
        }
        return toModelDispatch(producer);
      }
      if (producer.state !== "outcome_unknown") {
        throw new Error(`Recovered assistant model outcome is not reconcilable: ${producer.id}`);
      }
      const reconciledAt = new Date().toISOString();
      const update = this.db.prepare(`
        UPDATE model_dispatches
        SET state = 'settled', stop_reason = ?, message_digest = ?, updated_at = ?
        WHERE id = ? AND state = 'outcome_unknown'
      `).run(stopReason, messageDigest, reconciledAt, producer.id);
      if (Number(update.changes) !== 1) {
        throw new Error(`Recovered assistant model reconciliation raced: ${producer.id}`);
      }
      this.insertEvent(execution.run_id, execution.turn_id, "model_dispatch_reconciled", {
        execution_id: producer.execution_id,
        recovery_execution_id: execution.id,
        dispatch_id: producer.id,
        stop_reason: stopReason,
        message_digest: messageDigest
      });
      return this.requireModelDispatch(producer.id);
    });
  }

  inspectRun(runId: string): RunInspection | null {
    const run = this.getRun(runId);
    return run ? inspectRuntimeRun(this.db, run, this.getExecutionLock(run.id)) : null;
  }

  inspectSession(sessionId: string): SessionInspection | null {
    const session = this.getSession(sessionId);
    if (!session) return null;
    const runs = (this.db.prepare(`
      SELECT runs.id, runs.status, runs.turn_id, locks.digest AS execution_lock_digest,
             runs.created_at, runs.updated_at
      FROM runs
      JOIN execution_locks AS locks ON locks.run_id = runs.id
      WHERE runs.session_id = ?
      ORDER BY runs.created_at ASC, runs.id ASC
    `).all(session.id) as unknown as SessionInspection["runs"]);
    const entryCount = this.db.prepare(`
      SELECT COUNT(*) AS count FROM pi_session_entries WHERE session_id = ?
    `).get(session.id) as { count: number };
    const active = runs.find((run) => run.status === "running"
      || run.status === "waiting"
      || run.status === "paused") ?? null;
    return {
      ...session,
      active_run_id: active?.id ?? null,
      active_run_status: active?.status === "running"
        || active?.status === "waiting"
        || active?.status === "paused"
        ? active.status
        : null,
      run_count: runs.length,
      session_entry_count: Number(entryCount.count),
      runs
    };
  }

  getExecutionLock(runId: string): ExecutionLock {
    const row = this.db.prepare(`
      SELECT run_id, digest, lock_json, created_at
      FROM execution_locks
      WHERE run_id = ?
    `).get(runId) as ExecutionLockRow | undefined;
    if (!row) throw new Error(`Execution Lock not found for Run: ${runId}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.lock_json);
    } catch {
      throw new ExecutionLockMismatchError(`Execution Lock JSON is invalid: ${runId}`);
    }
    let lock: ExecutionLock;
    try {
      lock = parseExecutionLock(parsed);
    } catch (error) {
      throw new ExecutionLockMismatchError(error instanceof Error ? error.message : String(error));
    }
    if (lock.digest !== row.digest || lock.created_at !== row.created_at) {
      throw new ExecutionLockMismatchError(`Execution Lock row identity is invalid: ${runId}`);
    }
    return lock;
  }

  assertActionAllowedByExecutionLock(
    runId: string,
    contract: { name: string; version: string; effect_class: ActionEffectClass }
  ): void {
    if (!executionLockAllowsAction(this.getExecutionLock(runId), contract)) {
      throw new ExecutionLockMismatchError(
        `Action contract is outside the immutable Execution Lock: ${runId}/${contract.name}`
      );
    }
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

  assertCanDispatchDiscussionWorker(runId: string, invocationId: string): void {
    const row = this.db.prepare(`
      SELECT reservations.invocation_id
      FROM worker_sessions AS workers
      JOIN action_reservations AS reservations ON reservations.id = workers.reservation_id
      WHERE workers.parent_run_id = ?
      LIMIT 1
    `).get(runId) as { invocation_id: string } | undefined;
    if (row && row.invocation_id !== invocationId) {
      throw new Error(`This Supervisor Run already owns its one discussion Worker Session: ${runId}`);
    }
  }

  hasOutstandingWorkers(runId: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 AS present
      FROM worker_sessions
      WHERE parent_run_id = ? AND result_delivered_to_turn_id IS NULL
      LIMIT 1
    `).get(runId) as { present: number } | undefined;
    return row?.present === 1;
  }

  getDeliverableWorkerResults(runId: string): WorkerInspection[] {
    const run = this.requireRun(runId);
    if (run.status !== "waiting") throw new Error(`Run is not waiting: ${runId}`);
    const workers = (this.db.prepare(`
      SELECT *
      FROM worker_sessions
      WHERE parent_run_id = ? AND result_envelope_json IS NOT NULL
        AND result_delivered_to_turn_id IS NULL
      ORDER BY created_at ASC, id ASC
    `).all(runId) as unknown as WorkerSessionRow[]).map(toWorkerInspection);
    for (const worker of workers) {
      if (worker.parent_turn_id !== run.turn_id) {
        throw new Error(`Worker Result delivery parent Turn drifted: ${worker.id}`);
      }
      this.assertWorkerDeliveryIdentity(run, worker);
    }
    return workers;
  }

  getDeliveredWorkerResults(runId: string, turnId: string): WorkerInspection[] {
    const run = this.requireRun(runId);
    if (run.turn_id !== turnId) {
      throw new Error(`Worker Result runtime context Turn is not current: ${runId}/${turnId}`);
    }
    const workers = (this.db.prepare(`
      SELECT *
      FROM worker_sessions
      WHERE parent_run_id = ? AND result_delivered_to_turn_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(runId, turnId) as unknown as WorkerSessionRow[]).map(toWorkerInspection);
    for (const worker of workers) this.assertWorkerDeliveryIdentity(run, worker);
    return workers;
  }

  resumeWaitingRun(input: {
    run_id: string;
    worker_results: Array<{ worker_id: string; result_digest: string }>;
    request: string;
    evidence_digest: string;
    lease_ms: number;
  }): { run: RunRecord; execution: RunExecutionLease } {
    return this.transaction(() => {
      const run = this.requireRun(input.run_id);
      if (run.status !== "waiting") throw new Error(`Run is not waiting: ${input.run_id}`);
      if (this.hasUnresolvedActions(input.run_id)) {
        throw new RunHasUnresolvedActionsError(input.run_id);
      }
      const pending = this.db.prepare(`
        SELECT 1 AS present
        FROM worker_sessions
        WHERE parent_run_id = ? AND status IN ('queued', 'running')
          AND result_delivered_to_turn_id IS NULL
        LIMIT 1
      `).get(input.run_id) as { present: number } | undefined;
      if (pending) throw new Error(`Run Worker Results are not ready: ${input.run_id}`);
      const deliverable = this.getDeliverableWorkerResults(input.run_id);
      const expected = deliverable.map((worker) => ({
        worker_id: worker.id,
        result_digest: worker.result_envelope!.digest
      }));
      if (expected.length === 0 || JSON.stringify(expected) !== JSON.stringify(input.worker_results)) {
        throw new Error(`Run Worker Result evidence changed before delivery: ${input.run_id}`);
      }
      const request = input.request.trim();
      if (!request) throw new Error("Worker Result continuation request must not be empty.");
      const evidenceDigest = actionDigest(input.evidence_digest);
      const createdAt = new Date().toISOString();
      const turnId = id("turn");
      const ordinal = this.db.prepare(`
        SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal
        FROM turns
        WHERE run_id = ?
      `).get(input.run_id) as { ordinal: number };
      this.db.prepare(`
        INSERT INTO turns (
          id, run_id, ordinal, status, request, answer, error, created_at, updated_at
        ) VALUES (?, ?, ?, 'running', ?, NULL, NULL, ?, ?)
      `).run(turnId, input.run_id, Number(ordinal.ordinal), request, createdAt, createdAt);
      const runResult = this.db.prepare(`
        UPDATE runs
        SET status = 'running', answer = NULL, error = NULL, turn_id = ?, updated_at = ?
        WHERE id = ? AND status = 'waiting'
      `).run(turnId, createdAt, input.run_id);
      if (Number(runResult.changes) !== 1) throw new Error(`Run is not waiting: ${input.run_id}`);
      for (const worker of deliverable) {
        const delivery = this.db.prepare(`
          UPDATE worker_sessions
          SET result_delivered_to_turn_id = ?, updated_at = ?
          WHERE id = ? AND result_envelope_digest = ? AND result_delivered_to_turn_id IS NULL
        `).run(turnId, createdAt, worker.id, worker.result_envelope!.digest);
        if (Number(delivery.changes) !== 1) {
          throw new Error(`Worker Result delivery raced: ${worker.id}`);
        }
        this.insertEvent(input.run_id, turnId, "worker_result_delivered", {
          worker_id: worker.id,
          child_run_id: worker.child_run_id,
          result_envelope_digest: worker.result_envelope!.digest
        });
      }
      this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(createdAt, run.session_id);
      this.insertEvent(input.run_id, turnId, "run_continued", {
        kind: "worker_result_delivery",
        evidence_refs: expected.map((value) => value.result_digest),
        evidence_digest: evidenceDigest,
        prior_turn_id: run.turn_id
      });
      const execution = this.insertRunExecution({
        run_id: input.run_id,
        turn_id: turnId,
        kind: "worker_result_continuation",
        input_digest: evidenceDigest,
        recovery_of_execution_id: null,
        lease_ms: input.lease_ms
      });
      return { run: this.requireRun(input.run_id), execution };
    });
  }

  resumeWorkerResultIntegration(input: {
    run_id: string;
    turn_id: string;
    worker_results: Array<{ worker_id: string; result_digest: string }>;
    evidence_digest: string;
    lease_ms: number;
  }): { run: RunRecord; execution: RunExecutionLease } | null {
    return this.transaction(() => {
      const run = this.requireRun(input.run_id);
      if (run.status !== "paused" || run.turn_id !== input.turn_id) {
        throw new Error(`Run is not paused on the Worker Result Turn: ${input.run_id}`);
      }
      if (this.hasUnresolvedActions(input.run_id)) {
        throw new RunHasUnresolvedActionsError(input.run_id);
      }
      const pause = this.db.prepare(`
        SELECT payload_json
        FROM runtime_events
        WHERE run_id = ? AND turn_id = ? AND kind = 'run_paused'
        ORDER BY seq DESC
        LIMIT 1
      `).get(input.run_id, input.turn_id) as { payload_json: string } | undefined;
      if (!pause) return null;
      const payload = parseJsonObject(pause.payload_json, "Worker Result integration pause event");
      if (payload.reason_kind !== "worker_result_integration_failed") return null;
      if (typeof payload.execution_id !== "string") {
        throw new Error(`Worker Result integration pause identity is invalid: ${input.run_id}`);
      }
      const failedExecution = this.db.prepare(`
        SELECT id
        FROM run_executions
        WHERE id = ? AND run_id = ? AND turn_id = ?
          AND state = 'settled' AND outcome = 'paused'
      `).get(payload.execution_id, input.run_id, input.turn_id) as { id: string } | undefined;
      if (!failedExecution) {
        throw new Error(`Worker Result integration failure evidence is invalid: ${input.run_id}`);
      }
      const delivered = this.getDeliveredWorkerResults(input.run_id, input.turn_id);
      const expected = delivered.map((worker) => ({
        worker_id: worker.id,
        result_digest: worker.result_envelope!.digest
      }));
      if (expected.length === 0 || JSON.stringify(expected) !== JSON.stringify(input.worker_results)) {
        throw new Error(`Worker Result integration evidence changed before recovery: ${input.run_id}`);
      }
      const evidenceDigest = actionDigest(input.evidence_digest);
      const resumedAt = new Date().toISOString();
      const runResult = this.db.prepare(`
        UPDATE runs
        SET status = 'running', answer = NULL, error = NULL, updated_at = ?
        WHERE id = ? AND status = 'paused' AND turn_id = ?
      `).run(resumedAt, input.run_id, input.turn_id);
      if (Number(runResult.changes) !== 1) {
        throw new Error(`Worker Result integration recovery raced: ${input.run_id}`);
      }
      const turnResult = this.db.prepare(`
        UPDATE turns
        SET status = 'running', answer = NULL, error = NULL, updated_at = ?
        WHERE id = ? AND run_id = ? AND status = 'paused'
      `).run(resumedAt, input.turn_id, input.run_id);
      if (Number(turnResult.changes) !== 1) {
        throw new Error(`Worker Result integration Turn recovery raced: ${input.turn_id}`);
      }
      this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?")
        .run(resumedAt, run.session_id);
      this.insertEvent(input.run_id, input.turn_id, "run_continued", {
        kind: "worker_result_integration_recovery",
        evidence_refs: [failedExecution.id, ...expected.map((value) => value.result_digest)],
        evidence_digest: evidenceDigest
      });
      const execution = this.insertRunExecution({
        run_id: input.run_id,
        turn_id: input.turn_id,
        kind: "worker_result_continuation",
        input_digest: evidenceDigest,
        recovery_of_execution_id: null,
        lease_ms: input.lease_ms
      });
      return { run: this.requireRun(input.run_id), execution };
    });
  }

  dispatchDiscussionWorker(input: {
    worker_id: string;
    reservation_id: string;
    task_envelope: TaskEnvelope;
    child_execution_lock: ExecutionLock;
  }): WorkerInspection {
    const taskEnvelope = parseTaskEnvelope(input.task_envelope);
    const childLock = parseExecutionLock(input.child_execution_lock);
    return this.transaction(() => {
      const reservation = this.requireActionReservation(input.reservation_id);
      if (reservation.run_id !== taskEnvelope.parent_run_id
        || reservation.turn_id !== taskEnvelope.parent_turn_id) {
        throw new Error(`Worker dispatch parent identity mismatch: ${input.reservation_id}`);
      }
      if (reservation.state !== "dispatching" && reservation.state !== "outcome_unknown") {
        throw new Error(`Worker dispatch reservation is not reconcilable: ${input.reservation_id}`);
      }
      const parent = this.requireRun(reservation.run_id);
      if ((parent.status !== "running" && parent.status !== "paused")
        || parent.turn_id !== reservation.turn_id) {
        throw new Error(`Worker dispatch requires the current parent Turn: ${parent.id}`);
      }
      const parentLock = this.getExecutionLock(parent.id);
      assertExecutionLockNarrowing(parentLock, childLock);
      if (taskEnvelope.child_execution_lock_digest !== childLock.digest) {
        throw new Error("Task Envelope child Execution Lock identity mismatch.");
      }

      const existing = this.getWorkerByReservation(input.reservation_id);
      if (existing) {
        if (existing.task_envelope.digest !== taskEnvelope.digest
          || existing.child_execution_lock.digest !== childLock.digest) {
          throw new Error(`Worker dispatch identity mismatch: ${input.reservation_id}`);
        }
        return existing;
      }

      const workerId = workerSessionId(input.worker_id);
      const createdAt = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO worker_sessions (
          id, reservation_id, parent_run_id, parent_turn_id, status,
          task_envelope_digest, task_envelope_json,
          child_execution_lock_digest, child_execution_lock_json,
          child_session_id, child_run_id,
          result_envelope_digest, result_envelope_json,
          result_delivered_to_turn_id,
          lease_ordinal, lease_owner_digest, lease_expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, ?, ?)
      `).run(
        workerId,
        reservation.id,
        parent.id,
        parent.turn_id,
        taskEnvelope.digest,
        JSON.stringify(taskEnvelope),
        childLock.digest,
        JSON.stringify(childLock),
        createdAt,
        createdAt
      );
      this.insertEvent(parent.id, parent.turn_id, "worker_dispatched", {
        worker_id: workerId,
        reservation_id: reservation.id,
        task_envelope_digest: taskEnvelope.digest,
        child_execution_lock_digest: childLock.digest,
        worker_kind: taskEnvelope.worker_kind
      });
      return this.requireWorker(workerId);
    });
  }

  inspectWorker(workerId: string): WorkerInspection | null {
    const row = this.db.prepare("SELECT * FROM worker_sessions WHERE id = ?")
      .get(workerId) as WorkerSessionRow | undefined;
    return row ? toWorkerInspection(row) : null;
  }

  inspectWorkerByChildRun(childRunId: string): WorkerInspection | null {
    const row = this.db.prepare("SELECT * FROM worker_sessions WHERE child_run_id = ?")
      .get(childRunId) as WorkerSessionRow | undefined;
    return row ? toWorkerInspection(row) : null;
  }

  claimWorker(workerId: string, leaseMs: number): {
    worker: WorkerInspection;
    lease: WorkerExecutionLease;
  } {
    validateRuntimeLeaseDuration(leaseMs, "Worker Session");
    const ownerToken = randomBytes(32).toString("hex");
    return this.transaction(() => {
      const current = this.requireWorker(workerId);
      this.assertWorkerReservationIdentity(current);
      const now = Date.now();
      const expired = current.lease_expires_at !== null
        && Date.parse(current.lease_expires_at) <= now;
      if (current.status !== "queued" && !(current.status === "running" && expired)) {
        throw new Error(`Worker Session cannot be claimed: ${workerId}/${current.status}`);
      }
      const ordinal = current.lease_ordinal + 1;
      const expiresAt = new Date(now + leaseMs).toISOString();
      const updatedAt = new Date(now).toISOString();
      const update = this.db.prepare(`
        UPDATE worker_sessions
        SET status = 'running', lease_ordinal = ?, lease_owner_digest = ?,
            lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND lease_ordinal = ?
      `).run(ordinal, sha256(ownerToken), expiresAt, updatedAt, workerId, current.lease_ordinal);
      if (Number(update.changes) !== 1) throw new Error(`Worker Session claim raced: ${workerId}`);
      this.insertEvent(current.parent_run_id, current.parent_turn_id, expired
        ? "worker_lease_reclaimed"
        : "worker_lease_claimed", {
        worker_id: workerId,
        lease_ordinal: ordinal,
        lease_expires_at: expiresAt
      });
      return {
        worker: this.requireWorker(workerId),
        lease: {
          worker_id: workerId,
          owner_token: ownerToken,
          ordinal,
          lease_expires_at: expiresAt
        }
      };
    });
  }

  renewWorkerLease(lease: WorkerExecutionLease, leaseMs: number): WorkerExecutionLease {
    validateRuntimeLeaseDuration(leaseMs, "Worker Session");
    return this.transaction(() => {
      const worker = this.requireActiveWorkerLease(lease);
      const expiresAt = new Date(Math.max(
        Date.now() + leaseMs,
        Date.parse(worker.lease_expires_at!) + 1
      )).toISOString();
      const update = this.db.prepare(`
        UPDATE worker_sessions
        SET lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'running' AND lease_ordinal = ? AND lease_owner_digest = ?
      `).run(
        expiresAt,
        new Date().toISOString(),
        worker.id,
        lease.ordinal,
        sha256(lease.owner_token)
      );
      if (Number(update.changes) !== 1) throw new Error(`Worker Session lease renewal raced: ${worker.id}`);
      return { ...lease, lease_expires_at: expiresAt };
    });
  }

  completeWorker(lease: WorkerExecutionLease, resultInput: ResultEnvelope): WorkerInspection {
    const result = parseResultEnvelope(resultInput);
    return this.transaction(() => {
      const worker = this.requireActiveWorkerLease(lease);
      this.assertWorkerReservationIdentity(worker);
      if (!worker.child_run_id || !worker.child_session_id) {
        throw new Error(`Worker Session has no bound child Run: ${worker.id}`);
      }
      if (result.worker_id !== worker.id
        || result.child_run_id !== worker.child_run_id
        || result.actual_execution_lock_digest !== worker.child_execution_lock.digest) {
        throw new Error(`Worker Result Envelope identity mismatch: ${worker.id}`);
      }
      this.assertWorkerNeedsInputEvidence(worker, result);
      const update = this.db.prepare(`
        UPDATE worker_sessions
        SET status = ?, result_envelope_digest = ?, result_envelope_json = ?,
            lease_owner_digest = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND status = 'running' AND lease_ordinal = ? AND lease_owner_digest = ?
      `).run(
        result.status,
        result.digest,
        JSON.stringify(result),
        new Date().toISOString(),
        worker.id,
        lease.ordinal,
        sha256(lease.owner_token)
      );
      if (Number(update.changes) !== 1) throw new Error(`Worker Result delivery raced: ${worker.id}`);
      this.insertEvent(worker.parent_run_id, worker.parent_turn_id, "worker_result_ready", {
        worker_id: worker.id,
        child_run_id: result.child_run_id,
        result_envelope_digest: result.digest,
        status: result.status
      });
      return this.requireWorker(worker.id);
    });
  }

  getPiSession(sessionId: string): PiSessionRow | null {
    return (this.db.prepare(`
      SELECT id, created_at, leaf_id
      FROM pi_sessions
      WHERE id = ?
    `).get(sessionId) as PiSessionRow | undefined) ?? null;
  }

  appendPiSessionEntry(sessionId: string, entryInput: unknown): void {
    const entry = parsePiEntry(entryInput);
    const observedAt = new Date().toISOString();
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
      this.db.prepare("UPDATE sessions SET updated_at = MAX(updated_at, ?) WHERE id = ?")
        .run(observedAt, sessionId);
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

  getObservedOutputTokens(sessionId: string): number {
    let outputTokens = 0;
    for (const raw of this.getPiSessionEntries(sessionId)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") continue;
      const message = entry.message as Record<string, unknown>;
      if (message.role !== "assistant" || !message.usage || typeof message.usage !== "object") continue;
      const output = (message.usage as Record<string, unknown>).output;
      if (typeof output === "number" && Number.isSafeInteger(output) && output >= 0) {
        outputTokens += output;
      }
    }
    return outputTokens;
  }

  getLatestSettledRunExecution(runId: string): SettledRunExecutionEvidence {
    const execution = this.db.prepare(`
      SELECT *
      FROM run_executions
      WHERE run_id = ? AND state = 'settled'
      ORDER BY ordinal DESC
      LIMIT 1
    `).get(runId) as RunExecutionRow | undefined;
    if (!execution || execution.outcome === null || execution.outcome === "interrupted") {
      throw new Error(`Run has no settled execution evidence: ${runId}`);
    }
    const dispatches = (this.db.prepare(`
      SELECT *
      FROM model_dispatches
      WHERE execution_id = ?
      ORDER BY ordinal ASC
    `).all(execution.id) as unknown as ModelDispatchRow[]).map(toModelDispatch);
    if (dispatches.some((dispatch) => dispatch.state !== "settled")) {
      throw new Error(`Settled Run execution has non-terminal model dispatch evidence: ${execution.id}`);
    }
    return {
      execution_id: execution.id,
      ordinal: execution.ordinal,
      outcome: execution.outcome,
      dispatches
    };
  }

  getResultProducingRunExecution(runId: string): RunExecutionModelEvidence {
    const latest = this.db.prepare(`
      SELECT *
      FROM run_executions
      WHERE run_id = ? AND state = 'settled'
      ORDER BY ordinal DESC
      LIMIT 1
    `).get(runId) as RunExecutionRow | undefined;
    if (!latest) throw new Error(`Run has no settled execution evidence: ${runId}`);
    const visited = new Set<string>();
    let current: RunExecutionRow | undefined = latest;
    while (current) {
      if (visited.has(current.id)) {
        throw new Error(`Run execution recovery lineage contains a cycle: ${runId}`);
      }
      visited.add(current.id);
      const dispatches = (this.db.prepare(`
        SELECT *
        FROM model_dispatches
        WHERE execution_id = ?
        ORDER BY ordinal ASC
      `).all(current.id) as unknown as ModelDispatchRow[]).map(toModelDispatch);
      if (dispatches.length > 0) {
        if (dispatches.some((dispatch) => dispatch.state !== "settled")) {
          throw new Error(
            `Result-producing execution has unresolved model evidence: ${current.id}/`
            + dispatches.map((dispatch) => `${dispatch.id}:${dispatch.state}`).join(",")
          );
        }
        return {
          execution_id: current.id,
          ordinal: current.ordinal,
          dispatches
        };
      }
      if (!current.recovery_of_execution_id) {
        return { execution_id: current.id, ordinal: current.ordinal, dispatches: [] };
      }
      current = this.db.prepare(`
        SELECT *
        FROM run_executions
        WHERE id = ? AND run_id = ?
      `).get(current.recovery_of_execution_id, runId) as RunExecutionRow | undefined;
      if (!current) {
        throw new Error(`Run execution recovery lineage is missing: ${runId}`);
      }
    }
    throw new Error(`Run execution recovery lineage is invalid: ${runId}`);
  }

  getTerminalActionEvidence(runId: string, actionName: string): ActionRecoveryEvidence[] {
    return (this.db.prepare(`
      SELECT reservations.id AS reservation_id
      FROM action_reservations AS reservations
      JOIN effect_receipts AS receipts ON receipts.reservation_id = reservations.id
      WHERE reservations.run_id = ? AND reservations.action_name = ?
        AND reservations.state = 'terminal' AND receipts.outcome = 'succeeded'
      ORDER BY reservations.created_at ASC, reservations.id ASC
    `).all(runId, actionName) as unknown as Array<{ reservation_id: string }>).map((row) => ({
      reservation: this.requireActionReservation(row.reservation_id),
      receipt: this.requireEffectReceipt(row.reservation_id)
    }));
  }

  getRecoveryPiSessionEntries(execution: RunExecutionLease): unknown[] {
    const current = this.requireActiveExecutionLease(execution);
    if (!current.recovery_of_execution_id) return [];
    const session = this.getPiSession(this.requireRun(current.run_id).session_id);
    if (!session) throw new Error(`Pi session not found for Run: ${current.run_id}`);
    const pathIds = new Set(
      this.getPiSessionPath(session.id, session.leaf_id)
        .map((entry) => parsePiEntry(entry).id)
    );
    return selectRecoveryPiSessionEntries({
      db: this.db,
      current_execution_id: current.id,
      recovery_of_execution_id: current.recovery_of_execution_id,
      run_id: current.run_id,
      session_id: session.id,
      path_entry_ids: pathIds
    });
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

  private settleRunExecution(
    execution: RunExecutionLease,
    outcome: Exclude<RunExecutionOutcome, "interrupted">,
    answer: string | null,
    error: string | null,
    pauseReasonKind = "action_outcome_unknown"
  ): RunRecord {
    return this.transaction(() => {
      this.requireActiveExecutionLease(execution);
      if (outcome === "completed" && this.hasUnresolvedActions(execution.run_id)) {
        throw new RunHasUnresolvedActionsError(execution.run_id);
      }
      if (outcome === "completed" && this.hasOutstandingWorkers(execution.run_id)) {
        throw new Error(`Run cannot complete over an outstanding Worker Session: ${execution.run_id}`);
      }
      const activeDispatch = this.getActiveModelDispatch(execution.id);
      if (activeDispatch) {
        throw new Error(`Run execution has an unsettled model dispatch: ${activeDispatch.id}`);
      }
      const settledAt = new Date().toISOString();
      const executionResult = this.db.prepare(`
        UPDATE run_executions
        SET state = 'settled', outcome = ?, error = ?, updated_at = ?, settled_at = ?
        WHERE id = ? AND state = 'active' AND owner_token_digest = ? AND lease_expires_at > ?
      `).run(
        outcome,
        error,
        settledAt,
        settledAt,
        execution.id,
        sha256(execution.token),
        settledAt
      );
      if (Number(executionResult.changes) !== 1) {
        throw new Error(`Run execution could not settle: ${execution.id}`);
      }
      const run = this.requireRun(execution.run_id);
      this.updateRunningRunAndTurn(run, outcome, answer, error, settledAt);
      this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(settledAt, run.session_id);
      this.insertEvent(run.id, run.turn_id, "run_execution_settled", {
        execution_id: execution.id,
        execution_ordinal: execution.ordinal,
        outcome
      });
      if (outcome === "waiting") {
        this.insertEvent(run.id, run.turn_id, "run_waiting", {
          reason_kind: "worker_result_pending"
        });
      } else if (outcome === "completed") {
        this.insertEvent(run.id, run.turn_id, "run_completed", {});
      } else if (outcome === "paused") {
        this.insertEvent(run.id, run.turn_id, "run_paused", {
          reason: error,
          reason_kind: pauseReasonKind,
          execution_id: execution.id
        });
      } else {
        this.insertEvent(run.id, run.turn_id, "run_failed", { error });
      }
      return this.requireRun(run.id);
    });
  }

  private updateRunningRunAndTurn(
    run: RunRecord,
    status: "waiting" | "paused" | "completed" | "failed",
    answer: string | null,
    error: string | null,
    updatedAt: string
  ): void {
    const runResult = this.db.prepare(`
      UPDATE runs
      SET status = ?, answer = ?, error = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(status, status === "waiting" ? null : answer, error, updatedAt, run.id);
    if (Number(runResult.changes) !== 1) throw new Error(`Run is not running: ${run.id}`);
    const turnResult = this.db.prepare(`
      UPDATE turns
      SET status = ?, answer = ?, error = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(status, answer, error, updatedAt, run.turn_id);
    if (Number(turnResult.changes) !== 1) throw new Error(`Turn is not running: ${run.turn_id}`);
  }

  private insertRunExecution(input: {
    run_id: string;
    turn_id: string;
    kind: RunExecutionKind;
    input_digest: string;
    recovery_of_execution_id: string | null;
    lease_ms: number;
  }): RunExecutionLease {
    const run = this.requireRun(input.run_id);
    if (run.status !== "running" || run.turn_id !== input.turn_id) {
      throw new Error(`Run execution requires the current running Turn: ${input.run_id}`);
    }
    const existing = this.getActiveRunExecution(input.run_id);
    if (existing) throw new Error(`Run already has an active execution: ${input.run_id}`);
    const ordinalRow = this.db.prepare(`
      SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal
      FROM run_executions
      WHERE run_id = ?
    `).get(input.run_id) as { ordinal: number };
    if (input.recovery_of_execution_id) {
      const recoveryOf = this.db.prepare(`
        SELECT id
        FROM run_executions
        WHERE id = ? AND run_id = ? AND state = 'interrupted' AND outcome = 'interrupted'
      `).get(input.recovery_of_execution_id, input.run_id) as { id: string } | undefined;
      if (!recoveryOf) {
        throw new Error(`Run execution recovery lineage is invalid: ${input.run_id}`);
      }
    }
    const sessionStart = this.db.prepare(`
      SELECT COALESCE(MAX(entries.seq), 0) AS seq
      FROM pi_sessions AS sessions
      LEFT JOIN pi_session_entries AS entries ON entries.session_id = sessions.id
      WHERE sessions.id = ?
    `).get(run.session_id) as { seq: number };
    const createdAt = new Date().toISOString();
    const token = id("lease_token");
    const executionId = id("execution");
    const leaseExpiresAt = leaseExpiry(createdAt, input.lease_ms);
    const inputDigest = actionDigest(input.input_digest);
    this.db.prepare(`
      INSERT INTO run_executions (
        id, run_id, turn_id, ordinal, kind, input_digest,
        recovery_of_execution_id, session_start_seq, state, outcome,
        owner_token_digest, lease_expires_at, error, created_at, updated_at, settled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, NULL, ?, ?, NULL)
    `).run(
      executionId,
      input.run_id,
      input.turn_id,
      Number(ordinalRow.ordinal),
      input.kind,
      inputDigest,
      input.recovery_of_execution_id,
      Number(sessionStart.seq),
      sha256(token),
      leaseExpiresAt,
      createdAt,
      createdAt
    );
    this.insertEvent(input.run_id, input.turn_id, "run_execution_claimed", {
      execution_id: executionId,
      execution_ordinal: Number(ordinalRow.ordinal),
      kind: input.kind,
      input_digest: inputDigest,
      recovery_of_execution_id: input.recovery_of_execution_id,
      session_start_seq: Number(sessionStart.seq),
      lease_expires_at: leaseExpiresAt
    });
    return {
      id: executionId,
      run_id: input.run_id,
      turn_id: input.turn_id,
      ordinal: Number(ordinalRow.ordinal),
      kind: input.kind,
      recovery_of_execution_id: input.recovery_of_execution_id,
      session_start_seq: Number(sessionStart.seq),
      token,
      lease_expires_at: leaseExpiresAt
    };
  }

  private requireActiveExecutionLease(execution: RunExecutionLease): RunExecutionRow {
    const row = this.db.prepare(`
      SELECT *
      FROM run_executions
      WHERE id = ?
    `).get(execution.id) as RunExecutionRow | undefined;
    const now = new Date().toISOString();
    if (!row
      || row.run_id !== execution.run_id
      || row.turn_id !== execution.turn_id
      || row.state !== "active"
      || row.owner_token_digest !== sha256(execution.token)
      || row.lease_expires_at <= now) {
      throw new Error(`Run execution lease is not active: ${execution.id}`);
    }
    return row;
  }

  private getActiveRunExecution(runId: string): RunExecutionRow | null {
    return (this.db.prepare(`
      SELECT *
      FROM run_executions
      WHERE run_id = ? AND state = 'active'
      LIMIT 1
    `).get(runId) as RunExecutionRow | undefined) ?? null;
  }

  private requireActiveRunExecution(runId: string): RunExecutionRow {
    const execution = this.getActiveRunExecution(runId);
    if (!execution) throw new Error(`Running Run has no active execution: ${runId}`);
    return execution;
  }

  private getActiveModelDispatch(executionId: string): ModelDispatchRecord | null {
    const row = this.db.prepare(`
      SELECT *
      FROM model_dispatches
      WHERE execution_id = ? AND state IN ('dispatching', 'response_observed')
      LIMIT 1
    `).get(executionId) as ModelDispatchRow | undefined;
    return row ? toModelDispatch(row) : null;
  }

  private requireModelDispatch(dispatchId: string): ModelDispatchRecord {
    const row = this.db.prepare(`
      SELECT *
      FROM model_dispatches
      WHERE id = ?
    `).get(dispatchId) as ModelDispatchRow | undefined;
    if (!row) throw new Error(`Model dispatch not found: ${dispatchId}`);
    return toModelDispatch(row);
  }

  private requireRunExecutionRecoveryEvidence(
    runId: string,
    executionId: string
  ): RunExecutionRecoveryEvidence {
    const execution = this.db.prepare(`
      SELECT *
      FROM run_executions
      WHERE id = ? AND run_id = ?
    `).get(executionId, runId) as RunExecutionRow | undefined;
    if (!execution || execution.state !== "interrupted" || execution.outcome !== "interrupted") {
      throw new Error(`Run execution recovery evidence is invalid: ${runId}/${executionId}`);
    }
    const dispatches = (this.db.prepare(`
      SELECT *
      FROM model_dispatches
      WHERE execution_id = ? AND state = 'outcome_unknown'
      ORDER BY ordinal ASC
    `).all(executionId) as unknown as ModelDispatchRow[]).map(toModelDispatch);
    return {
      execution_id: execution.id,
      ordinal: execution.ordinal,
      kind: execution.kind,
      input_digest: execution.input_digest,
      session_start_seq: execution.session_start_seq,
      dispatches
    };
  }

  private getRun(runId: string): RunRecord | null {
    const row = this.db.prepare(`
      SELECT id, status, goal_id, answer, error,
             session_id, turn_id, created_at, updated_at
      FROM runs
      WHERE id = ?
    `).get(runId) as RunRow | undefined;
    return row ?? null;
  }

  private getSession(sessionId: string): RuntimeSessionRecord | null {
    return (this.db.prepare(`
      SELECT id, created_at, updated_at
      FROM sessions
      WHERE id = ?
    `).get(sessionId) as RuntimeSessionRow | undefined) ?? null;
  }

  private bindStateProfile(expectedProfile: RuntimeStateProfile): void {
    this.transaction(() => {
      const profile = this.db.prepare(
        "SELECT value FROM schema_meta WHERE key = 'state_profile'"
      ).get() as { value: string } | undefined;
      if (profile) {
        if (profile.value !== expectedProfile) {
          throw new RuntimeStateProfileIncompatibleError(expectedProfile, profile.value);
        }
        return;
      }
      const existing = this.db.prepare("SELECT 1 AS present FROM runs LIMIT 1").get() as
        | { present: number }
        | undefined;
      if (existing) {
        throw new RuntimeSchemaIncompatibleError(`${RUNTIME_SCHEMA_VERSION}/unbound-state-profile`);
      }
      this.db.prepare(
        "INSERT INTO schema_meta (key, value) VALUES ('state_profile', ?)"
      ).run(expectedProfile);
    });
  }

  private requireSession(sessionId: string): RuntimeSessionRecord {
    const session = this.getSession(sessionId);
    if (!session) throw new RuntimeSessionNotFoundError(sessionId);
    return session;
  }

  private getOpenSessionRun(sessionId: string): RunRecord | null {
    const row = this.db.prepare(`
      SELECT id, status, goal_id, answer, error,
             session_id, turn_id, created_at, updated_at
      FROM runs
      WHERE session_id = ? AND status IN ('running', 'waiting', 'paused')
      LIMIT 1
    `).get(sessionId) as RunRow | undefined;
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

  private getWorkerByReservation(reservationId: string): WorkerInspection | null {
    const row = this.db.prepare("SELECT * FROM worker_sessions WHERE reservation_id = ?")
      .get(reservationId) as WorkerSessionRow | undefined;
    return row ? toWorkerInspection(row) : null;
  }

  private requireWorker(workerId: string): WorkerInspection {
    const worker = this.inspectWorker(workerId);
    if (!worker) throw new Error(`Worker Session not found: ${workerId}`);
    return worker;
  }

  private requireActiveWorkerLease(lease: WorkerExecutionLease): WorkerInspection {
    const worker = this.requireWorker(lease.worker_id);
    if (worker.status !== "running"
      || worker.lease_ordinal !== lease.ordinal
      || worker.lease_expires_at !== lease.lease_expires_at) {
      throw new Error(`Worker Session lease identity mismatch: ${lease.worker_id}`);
    }
    const row = this.db.prepare(`
      SELECT lease_owner_digest
      FROM worker_sessions
      WHERE id = ?
    `).get(worker.id) as { lease_owner_digest: string | null } | undefined;
    if (row?.lease_owner_digest !== sha256(lease.owner_token)
      || Date.parse(worker.lease_expires_at) <= Date.now()) {
      throw new Error(`Worker Session lease is unavailable or expired: ${lease.worker_id}`);
    }
    return worker;
  }

  private bindWorkerRunInTransaction(binding: WorkerRunBinding, child: {
    run_id: string;
    session_id: string;
    execution_lock_digest: string;
  }): void {
    const worker = this.requireWorker(binding.worker_id);
    this.assertWorkerReservationIdentity(worker);
    if (worker.status !== "running" || worker.child_run_id !== null || worker.child_session_id !== null) {
      throw new Error(`Worker Session cannot bind a new child Run: ${worker.id}`);
    }
    const row = this.db.prepare(`
      SELECT lease_owner_digest
      FROM worker_sessions
      WHERE id = ?
    `).get(worker.id) as { lease_owner_digest: string | null } | undefined;
    if (row?.lease_owner_digest !== sha256(binding.owner_token)
      || worker.lease_expires_at === null
      || Date.parse(worker.lease_expires_at) <= Date.now()) {
      throw new Error(`Worker Session binding lease is unavailable or expired: ${worker.id}`);
    }
    if (worker.child_execution_lock.digest !== child.execution_lock_digest) {
      throw new Error(`Worker child Run Execution Lock mismatch: ${worker.id}`);
    }
    const parent = this.requireRun(worker.parent_run_id);
    if (parent.session_id === child.session_id) {
      throw new Error(`Worker child Run must use an isolated Session: ${worker.id}`);
    }
    const update = this.db.prepare(`
      UPDATE worker_sessions
      SET child_session_id = ?, child_run_id = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND child_session_id IS NULL AND child_run_id IS NULL
    `).run(child.session_id, child.run_id, new Date().toISOString(), worker.id);
    if (Number(update.changes) !== 1) throw new Error(`Worker child Run binding raced: ${worker.id}`);
    this.insertEvent(worker.parent_run_id, worker.parent_turn_id, "worker_run_bound", {
      worker_id: worker.id,
      child_session_id: child.session_id,
      child_run_id: child.run_id,
      child_execution_lock_digest: child.execution_lock_digest
    });
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

  private assertWorkerDeliveryIdentity(parent: RunRecord, worker: WorkerInspection): void {
    if (!worker.result_envelope || !worker.child_run_id || !worker.child_session_id) {
      throw new Error(`Worker Result delivery identity is incomplete: ${worker.id}`);
    }
    this.assertWorkerReservationIdentity(worker);
    const task = worker.task_envelope;
    const result = worker.result_envelope;
    this.assertWorkerNeedsInputEvidence(worker, result);
    const reservation = this.requireActionReservation(worker.reservation_id);
    const receipt = this.requireEffectReceipt(worker.reservation_id);
    const child = this.requireRun(worker.child_run_id);
    const childLock = this.getExecutionLock(child.id);
    if (worker.parent_run_id !== parent.id
      || task.parent_run_id !== parent.id
      || task.parent_turn_id !== worker.parent_turn_id
      || reservation.run_id !== parent.id
      || reservation.turn_id !== worker.parent_turn_id
      || reservation.action_name !== "worker_dispatch"
      || reservation.state !== "terminal"
      || receipt.outcome !== "succeeded"
      || receipt.output.worker_id !== worker.id
      || child.session_id !== worker.child_session_id
      || childLock.digest !== worker.child_execution_lock.digest
      || task.child_execution_lock_digest !== worker.child_execution_lock.digest
      || result.worker_id !== worker.id
      || result.child_run_id !== child.id
      || result.actual_execution_lock_digest !== childLock.digest) {
      throw new Error(`Worker Result delivery identity drifted: ${worker.id}`);
    }
    const terminalExecution = this.getLatestSettledRunExecution(child.id);
    const producerExecution = this.getResultProducingRunExecution(child.id);
    const dispatchIds = producerExecution.dispatches.map((dispatch) => dispatch.id).sort();
    const providers = [...new Set(producerExecution.dispatches.map((dispatch) => dispatch.provider))];
    const models = [...new Set(producerExecution.dispatches.map((dispatch) => dispatch.model))];
    const provider = providers.length === 0 ? null : providers[0]!;
    const model = models.length === 0 ? null : models[0]!;
    const observedOutputTokens = this.getObservedOutputTokens(child.session_id);
    const budgetViolation = parseBudgetViolation(result.findings.budget_violation);
    const expectedBudgetViolation = {
      output_tokens_exceeded:
        result.consumed.output_tokens > task.budget.max_output_tokens,
      timeout_exceeded: result.consumed.duration_ms > task.budget.timeout_ms,
      deadline_exceeded: Date.parse(result.created_at) > Date.parse(task.deadline_at)
    };
    const budgetExceeded = Object.values(expectedBudgetViolation).some(Boolean);
    const terminalOutcomeMatches = budgetExceeded
      ? result.status === "failed"
        && (terminalExecution.outcome === "completed" || terminalExecution.outcome === "failed")
      : terminalExecution.outcome === (result.status === "failed" ? "failed" : "completed");
    if (!terminalOutcomeMatches
      || observedOutputTokens !== result.consumed.output_tokens
      || !budgetViolation
      || stableJson(budgetViolation) !== stableJson(expectedBudgetViolation)
      || result.actual_execution.execution_id !== producerExecution.execution_id
      || result.actual_execution.execution_ordinal !== producerExecution.ordinal
      || !sameStrings(result.actual_execution.model_dispatch_ids, dispatchIds)
      || providers.length > 1
      || models.length > 1
      || result.actual_execution.provider !== provider
      || result.actual_execution.model !== model
      || (provider !== null && provider !== childLock.model.provider)
      || (model !== null && model !== childLock.model.model)) {
      throw new Error(`Worker Result execution identity drifted: ${worker.id}`);
    }
  }

  private assertWorkerNeedsInputEvidence(worker: WorkerInspection, result: ResultEnvelope): void {
    if (!worker.child_run_id) {
      throw new Error(`Worker Result needs_input evidence has no child Run: ${worker.id}`);
    }
    const evidence = this.getTerminalActionEvidence(worker.child_run_id, "worker_needs_input");
    if (result.status !== "needs_input") return;
    if (evidence.length !== 1) {
      throw new Error(`Worker Result needs_input evidence is not exact: ${worker.id}`);
    }
    const output = evidence[0]!.receipt.output;
    if (output.worker_id !== worker.id
      || typeof output.question !== "string"
      || typeof output.proposed_next_step !== "string"
      || result.unresolved_questions.length !== 1
      || result.unresolved_questions[0] !== output.question
      || result.proposed_next_step !== output.proposed_next_step) {
      throw new Error(`Worker Result needs_input evidence drifted: ${worker.id}`);
    }
  }

  private assertWorkerReservationIdentity(worker: WorkerInspection): void {
    const reservation = this.requireActionReservation(worker.reservation_id);
    const receipt = this.requireEffectReceipt(worker.reservation_id);
    const parentLock = this.getExecutionLock(worker.parent_run_id);
    const expectedTask = materializeTaskEnvelope({
      ...normalizeDiscussionTaskInput(reservation.arguments),
      task_id: `task_${reservation.id}`,
      parent_run_id: reservation.run_id,
      parent_turn_id: reservation.turn_id,
      child_execution_lock_digest: worker.child_execution_lock.digest
    });
    if (reservation.run_id !== worker.parent_run_id
      || reservation.turn_id !== worker.parent_turn_id
      || reservation.action_name !== "worker_dispatch"
      || reservation.contract_version !== "1"
      || reservation.effect_class !== "external_read"
      || reservation.state !== "terminal"
      || reservation.arguments.worker_id !== worker.id
      || reservation.arguments.parent_execution_lock_digest !== parentLock.digest
      || reservation.arguments.child_execution_lock_digest !== worker.child_execution_lock.digest
      || expectedTask.digest !== worker.task_envelope.digest
      || receipt.run_id !== worker.parent_run_id
      || receipt.turn_id !== worker.parent_turn_id
      || receipt.action_name !== reservation.action_name
      || receipt.contract_version !== reservation.contract_version
      || receipt.action_digest !== reservation.action_digest
      || receipt.effect_class !== reservation.effect_class
      || receipt.outcome !== "succeeded"
      || receipt.output.worker_id !== worker.id
      || receipt.output.status !== "queued"
      || receipt.output.task_envelope_digest !== worker.task_envelope.digest
      || receipt.output.child_execution_lock_digest !== worker.child_execution_lock.digest) {
      throw new Error(`Worker reservation identity drifted: ${worker.id}`);
    }
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

function parseBudgetViolation(input: unknown): {
  output_tokens_exceeded: boolean;
  timeout_exceeded: boolean;
  deadline_exceeded: boolean;
} | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 3
    || typeof value.output_tokens_exceeded !== "boolean"
    || typeof value.timeout_exceeded !== "boolean"
    || typeof value.deadline_exceeded !== "boolean") {
    return null;
  }
  return {
    output_tokens_exceeded: value.output_tokens_exceeded,
    timeout_exceeded: value.timeout_exceeded,
    deadline_exceeded: value.deadline_exceeded
  };
}

function toWorkerInspection(row: WorkerSessionRow): WorkerInspection {
  const taskEnvelope = parseTaskEnvelope(JSON.parse(row.task_envelope_json));
  const childExecutionLock = parseExecutionLock(JSON.parse(row.child_execution_lock_json));
  if (taskEnvelope.digest !== row.task_envelope_digest
    || childExecutionLock.digest !== row.child_execution_lock_digest
    || taskEnvelope.parent_run_id !== row.parent_run_id
    || taskEnvelope.parent_turn_id !== row.parent_turn_id
    || taskEnvelope.child_execution_lock_digest !== childExecutionLock.digest) {
    throw new Error(`Worker Session stored identity is invalid: ${row.id}`);
  }
  const resultEnvelope = row.result_envelope_json === null
    ? null
    : parseResultEnvelope(JSON.parse(row.result_envelope_json));
  const isTerminal = row.status === "needs_input" || row.status === "completed" || row.status === "failed";
  if ((resultEnvelope !== null) !== isTerminal) {
    throw new Error(`Worker Session Result Envelope state is invalid: ${row.id}`);
  }
  if ((resultEnvelope?.digest ?? null) !== row.result_envelope_digest) {
    throw new Error(`Worker Session Result Envelope identity is invalid: ${row.id}`);
  }
  if (resultEnvelope && resultEnvelope.status !== row.status) {
    throw new Error(`Worker Session Result Envelope status is invalid: ${row.id}`);
  }
  if (resultEnvelope && (resultEnvelope.worker_id !== row.id
    || resultEnvelope.child_run_id !== row.child_run_id
    || resultEnvelope.actual_execution_lock_digest !== childExecutionLock.digest)) {
    throw new Error(`Worker Session Result Envelope cross-record identity is invalid: ${row.id}`);
  }
  return {
    id: row.id,
    reservation_id: row.reservation_id,
    parent_run_id: row.parent_run_id,
    parent_turn_id: row.parent_turn_id,
    status: row.status,
    task_envelope: taskEnvelope,
    child_execution_lock: childExecutionLock,
    child_session_id: row.child_session_id,
    child_run_id: row.child_run_id,
    result_envelope: resultEnvelope,
    result_delivered_to_turn_id: row.result_delivered_to_turn_id,
    lease_ordinal: Number(row.lease_ordinal),
    lease_expires_at: row.lease_expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function workerSessionId(input: string): string {
  const value = input.trim();
  if (!/^worker_[a-f0-9]{32}$/u.test(value)) {
    throw new Error("Worker Session id is invalid.");
  }
  return value;
}
