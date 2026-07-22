import { createHash, randomUUID } from "node:crypto";
import type {
  ActionEffectClass,
  ActionReservation,
  EffectReceipt,
  JsonObject
} from "./action_types.js";
import type { RunRecord } from "./contracts.js";
import type {
  ModelDispatchRecord,
  ModelDispatchState,
  RunExecutionKind,
  RunExecutionOutcome,
  RunExecutionState
} from "./execution_types.js";

export interface RunRow {
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

export interface PiSessionRow {
  id: string;
  run_id: string;
  created_at: string;
  leaf_id: string | null;
}

export interface PiEntryRow {
  entry_json: string;
}

export interface RuntimeEventRow {
  seq: number;
  payload_json: string;
}

export interface RunExecutionRow {
  id: string;
  run_id: string;
  turn_id: string;
  ordinal: number;
  kind: RunExecutionKind;
  input_digest: string;
  state: RunExecutionState;
  outcome: RunExecutionOutcome | null;
  owner_token_digest: string;
  lease_expires_at: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  settled_at: string | null;
}

export interface ModelDispatchRow {
  id: string;
  execution_id: string;
  run_id: string;
  turn_id: string;
  ordinal: number;
  provider: string;
  model: string;
  state: ModelDispatchState;
  response_status: number | null;
  stop_reason: string | null;
  message_digest: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionReservationRow {
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

export interface EffectReceiptRow {
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

export interface StoredPiEntry {
  id: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

export function runtimeId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function parsePiEntry(value: unknown): StoredPiEntry {
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

export function toActionReservation(row: ActionReservationRow): ActionReservation {
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

export function toEffectReceipt(row: EffectReceiptRow): EffectReceipt {
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

export function toModelDispatch(row: ModelDispatchRow): ModelDispatchRecord {
  return {
    id: row.id,
    execution_id: row.execution_id,
    run_id: row.run_id,
    turn_id: row.turn_id,
    ordinal: row.ordinal,
    provider: row.provider,
    model: row.model,
    state: row.state,
    response_status: row.response_status,
    stop_reason: row.stop_reason,
    message_digest: row.message_digest,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function parseJsonObject(input: string, label: string): JsonObject {
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

export function boundedText(input: string, maxLength: number, label: string): string {
  const value = input.trim();
  if (!value || value.length > maxLength) throw new Error(`${label} is invalid.`);
  return value;
}

export function actionDigest(input: string): string {
  const value = input.trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Action digest is invalid.");
  return value;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function leaseExpiry(fromIso: string, leaseMs: number): string {
  if (!Number.isInteger(leaseMs) || leaseMs < 100 || leaseMs > 300_000) {
    throw new Error("Run execution lease duration is invalid.");
  }
  return new Date(Date.parse(fromIso) + leaseMs).toISOString();
}

export function sortedUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function sameStrings(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
