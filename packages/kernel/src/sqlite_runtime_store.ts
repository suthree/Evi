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
import type { RunInspection, RunRecord } from "./contracts.js";
import type {
  ModelDispatchRecord,
  RunExecutionKind,
  RunExecutionLease,
  RunExecutionOutcome,
  RunExecutionRecoveryEvidence
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
  type EffectReceiptRow,
  type ModelDispatchRow,
  type PiEntryRow,
  type PiSessionRow,
  type RunExecutionRow,
  type RunRow,
  type RuntimeEventRow,
  type StoredPiEntry
} from "./sqlite_runtime_codec.js";
import { initializeRuntimeSchema } from "./sqlite_runtime_schema.js";
import { inspectRuntimeRun } from "./sqlite_runtime_inspection.js";
import { selectRecoveryPiSessionEntries } from "./sqlite_runtime_recovery.js";

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
      initializeRuntimeSchema(this.db);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  beginRun(input: { request: string; goal_id?: string }, leaseMs: number): {
    run: RunRecord;
    execution: RunExecutionLease;
  } {
    const request = input.request.trim();
    if (!request) throw new Error("Run request must not be empty.");
    const createdAt = new Date().toISOString();
    const runId = id("run");
    const turnId = id("turn");
    const sessionId = id("session");
    const goalId = input.goal_id?.trim() || null;

    let execution!: RunExecutionLease;
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
      execution = this.insertRunExecution({
        run_id: runId,
        turn_id: turnId,
        kind: "initial",
        input_digest: sha256(request),
        recovery_of_execution_id: null,
        lease_ms: leaseMs
      });
    });

    return { run: this.requireRun(runId), execution };
  }

  completeRun(execution: RunExecutionLease, answer: string): RunRecord {
    return this.settleRunExecution(execution, "completed", answer, null);
  }

  pauseRun(execution: RunExecutionLease, error: string): RunRecord {
    const message = error.trim().slice(0, 4_000) || "Run paused for unresolved action recovery.";
    return this.settleRunExecution(execution, "paused", null, message);
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
        boundedText(input.provider, 120, "Model provider"),
        boundedText(input.model, 200, "Model id"),
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

  inspectRun(runId: string): RunInspection | null {
    const run = this.getRun(runId);
    return run ? inspectRuntimeRun(this.db, run) : null;
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
    error: string | null
  ): RunRecord {
    return this.transaction(() => {
      this.requireActiveExecutionLease(execution);
      if (outcome === "completed" && this.hasUnresolvedActions(execution.run_id)) {
        throw new RunHasUnresolvedActionsError(execution.run_id);
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
      this.insertEvent(run.id, run.turn_id, "run_execution_settled", {
        execution_id: execution.id,
        execution_ordinal: execution.ordinal,
        outcome
      });
      if (outcome === "completed") {
        this.insertEvent(run.id, run.turn_id, "run_completed", {});
      } else if (outcome === "paused") {
        this.insertEvent(run.id, run.turn_id, "run_paused", {
          reason: error,
          reason_kind: "action_outcome_unknown"
        });
      } else {
        this.insertEvent(run.id, run.turn_id, "run_failed", { error });
      }
      return this.requireRun(run.id);
    });
  }

  private updateRunningRunAndTurn(
    run: RunRecord,
    status: "paused" | "completed" | "failed",
    answer: string | null,
    error: string | null,
    updatedAt: string
  ): void {
    const runResult = this.db.prepare(`
      UPDATE runs
      SET status = ?, answer = ?, error = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(status, answer, error, updatedAt, run.id);
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
      WHERE sessions.run_id = ?
    `).get(input.run_id) as { seq: number };
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
