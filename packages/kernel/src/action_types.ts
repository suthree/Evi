import type { TSchema } from "typebox";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type ActionEffectClass =
  | "none"
  | "local_read"
  | "local_write"
  | "external_read"
  | "external_write";

export interface ActionToolContract {
  name: string;
  version: string;
  label: string;
  description: string;
  parameters: TSchema;
  effect_class: ActionEffectClass;
}

export type ActionReservationState = "reserved" | "dispatching" | "outcome_unknown" | "terminal";

export interface ActionReservation {
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
  arguments: JsonObject;
  state: ActionReservationState;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EffectReceipt {
  id: string;
  reservation_id: string;
  run_id: string;
  turn_id: string;
  action_name: string;
  contract_version: string;
  action_digest: string;
  effect_class: ActionEffectClass;
  outcome: "succeeded" | "failed";
  summary: string;
  output: JsonObject;
  reconciled: boolean;
  created_at: string;
}

export interface ActionRecoveryEvidence {
  reservation: ActionReservation;
  receipt: EffectReceipt;
}

export interface ActionObservation {
  outcome: "succeeded" | "failed";
  summary: string;
  output: JsonObject;
}

export interface ActionDispatch {
  reservation: ActionReservation;
  arguments: JsonObject;
}

export interface ActionHandler {
  contract: ActionToolContract;
  prepare(argumentsInput: unknown, invocation?: ActionInvocation): JsonObject | Promise<JsonObject>;
  execute(dispatch: ActionDispatch, signal?: AbortSignal): Promise<ActionObservation>;
  reconcile?(dispatch: ActionDispatch, signal?: AbortSignal): Promise<ActionObservation | null>;
}

export interface ActionInvocation {
  run_id: string;
  turn_id: string;
  invocation_id: string;
  action_name: string;
  arguments: unknown;
}

export type ActionGatewayResult =
  | {
      status: "completed";
      reservation: ActionReservation;
      receipt: EffectReceipt;
    }
  | {
      status: "denied";
      action_name: string;
      reason: string;
    }
  | {
      status: "outcome_unknown";
      reservation: ActionReservation;
      reason: string;
    };
