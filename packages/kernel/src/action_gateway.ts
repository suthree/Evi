import type {
  ActionDispatch,
  ActionEffectClass,
  ActionGatewayResult,
  ActionHandler,
  ActionInvocation,
  ActionObservation,
  ActionReservation,
  ActionToolContract,
  JsonObject,
  JsonValue
} from "./action_types.js";
import { materializeActionDigest } from "./action_identity.js";
import { stableJson } from "./canonical_json.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

const MAX_ARGUMENT_BYTES = 16 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024;
const MAX_SUMMARY_LENGTH = 2_000;

export interface ActionGatewayOptions {
  allowed_effect_classes?: ActionEffectClass[];
}

export class ActionGateway {
  private readonly handlers: ReadonlyMap<string, ActionHandler>;
  private readonly allowedEffectClasses: ReadonlySet<ActionEffectClass>;

  constructor(
    private readonly store: SqliteRuntimeStore,
    handlers: ActionHandler[],
    options: ActionGatewayOptions = {}
  ) {
    const entries = handlers.map((handler) => {
      validateContract(handler.contract);
      return [handler.contract.name, handler] as const;
    });
    if (new Set(entries.map(([name]) => name)).size !== entries.length) {
      throw new Error("Action Gateway handler names must be unique.");
    }
    this.handlers = new Map(entries);
    this.allowedEffectClasses = new Set(options.allowed_effect_classes ?? ["none", "local_read"]);
  }

  contracts(): ActionToolContract[] {
    return [...this.handlers.values()].map((handler) => ({ ...handler.contract }));
  }

  async invoke(input: ActionInvocation, signal?: AbortSignal): Promise<ActionGatewayResult> {
    const handler = this.handlers.get(input.action_name);
    if (!handler) {
      return { status: "denied", action_name: input.action_name, reason: "Action is not registered." };
    }
    try {
      this.store.assertActionAllowedByExecutionLock(input.run_id, handler.contract);
    } catch (error) {
      return { status: "denied", action_name: input.action_name, reason: errorMessage(error) };
    }
    const decision = this.decide(handler.contract);
    if (decision.outcome === "deny") {
      return { status: "denied", action_name: input.action_name, reason: decision.reason };
    }

    let durableArguments: JsonObject;
    try {
      durableArguments = boundedJsonObject(
        handler.prepare(input.arguments, input),
        MAX_ARGUMENT_BYTES,
        "Action arguments"
      );
    } catch (error) {
      return { status: "denied", action_name: input.action_name, reason: errorMessage(error) };
    }
    const actionDigest = materializeActionDigest(handler.contract, durableArguments);
    const reservation = this.store.reserveAction({
      run_id: input.run_id,
      turn_id: input.turn_id,
      invocation_id: input.invocation_id,
      action_name: handler.contract.name,
      contract_version: handler.contract.version,
      action_digest: actionDigest,
      effect_class: handler.contract.effect_class,
      decision_reason: decision.reason,
      arguments: durableArguments
    });

    if (!reservation.created) {
      if (reservation.receipt) {
        return { status: "completed", reservation: reservation.reservation, receipt: reservation.receipt };
      }
      if (reservation.reservation.state === "reserved") {
        return this.dispatchReserved(reservation.reservation, handler, signal);
      }
      return this.reconcileReservation(reservation.reservation, handler, signal);
    }

    return this.dispatchReserved(reservation.reservation, handler, signal);
  }

  async reconcileRun(runId: string, signal?: AbortSignal): Promise<ActionGatewayResult[]> {
    const results: ActionGatewayResult[] = [];
    for (const reservation of this.store.listUnresolvedActions(runId)) {
      const handler = this.handlers.get(reservation.action_name);
      if (!handler) {
        results.push({
          status: "outcome_unknown",
          reservation,
          reason: "The reserved action handler is not available for reconciliation."
        });
        continue;
      }
      results.push(reservation.state === "reserved"
        ? await this.dispatchReserved(reservation, handler, signal)
        : await this.reconcileReservation(reservation, handler, signal));
    }
    return results;
  }

  private async dispatchReserved(
    reservation: ActionReservation,
    handler: ActionHandler,
    signal?: AbortSignal
  ): Promise<ActionGatewayResult> {
    this.store.assertActionAllowedByExecutionLock(reservation.run_id, handler.contract);
    assertReservationIdentity(reservation, handler);
    const decision = this.decide(handler.contract);
    if (decision.outcome === "deny") {
      return { status: "denied", action_name: reservation.action_name, reason: decision.reason };
    }
    const dispatching = this.store.markActionDispatching(reservation.id);
    const dispatch = { reservation: dispatching, arguments: dispatching.arguments };
    try {
      const observation = boundedObservation(await handler.execute(dispatch, signal));
      return this.complete(dispatching, observation, false);
    } catch (error) {
      const reason = boundedError(error, "Action outcome is unknown after dispatch.");
      const unknown = this.store.markActionOutcomeUnknown(dispatching.id, reason);
      return { status: "outcome_unknown", reservation: unknown, reason };
    }
  }

  private async reconcileReservation(
    reservation: ActionReservation,
    handler: ActionHandler,
    signal?: AbortSignal
  ): Promise<ActionGatewayResult> {
    this.store.assertActionAllowedByExecutionLock(reservation.run_id, handler.contract);
    assertReservationIdentity(reservation, handler);
    if (!handler.reconcile) {
      return {
        status: "outcome_unknown",
        reservation,
        reason: reservation.error ?? "No reconciliation adapter is available; the action will not be replayed."
      };
    }
    const dispatch: ActionDispatch = { reservation, arguments: reservation.arguments };
    try {
      const observation = await handler.reconcile(dispatch, signal);
      if (!observation) {
        return {
          status: "outcome_unknown",
          reservation,
          reason: reservation.error ?? "Reconciliation found no terminal evidence; the action will not be replayed."
        };
      }
      return this.complete(reservation, boundedObservation(observation), true);
    } catch (error) {
      const reason = boundedError(error, "Action reconciliation failed without terminal evidence.");
      const unknown = this.store.markActionOutcomeUnknown(reservation.id, reason);
      return { status: "outcome_unknown", reservation: unknown, reason };
    }
  }

  private complete(
    reservation: ActionReservation,
    observation: ActionObservation,
    reconciled: boolean
  ): ActionGatewayResult {
    const completed = this.store.completeAction(reservation.id, observation, reconciled);
    return { status: "completed", reservation: completed.reservation, receipt: completed.receipt };
  }

  private decide(contract: ActionToolContract): { outcome: "allow" | "deny"; reason: string } {
    if (this.allowedEffectClasses.has(contract.effect_class)) {
      return {
        outcome: "allow",
        reason: `Action Gateway permits registered ${contract.effect_class} contracts in this composition.`
      };
    }
    return {
      outcome: "deny",
      reason: `Action Gateway composition denies ${contract.effect_class}; no dispatch was reserved.`
    };
  }
}

function assertReservationIdentity(reservation: ActionReservation, handler: ActionHandler): void {
  if (reservation.action_name !== handler.contract.name
    || reservation.contract_version !== handler.contract.version
    || reservation.effect_class !== handler.contract.effect_class
    || reservation.action_digest !== materializeActionDigest(handler.contract, reservation.arguments)) {
    throw new Error(`Action reservation identity mismatch: ${reservation.id}`);
  }
}

function validateContract(contract: ActionToolContract): void {
  if (!/^[a-z][a-z0-9_-]{1,79}$/.test(contract.name)) {
    throw new Error(`Action contract name is invalid: ${contract.name}`);
  }
  if (!/^[1-9][0-9]{0,8}$/.test(contract.version)) {
    throw new Error(`Action contract version is invalid: ${contract.name}`);
  }
  if (!contract.label.trim() || contract.label.length > 120) {
    throw new Error(`Action contract label is invalid: ${contract.name}`);
  }
  if (!contract.description.trim() || contract.description.length > 1_000) {
    throw new Error(`Action contract description is invalid: ${contract.name}`);
  }
}

function boundedObservation(input: ActionObservation): ActionObservation {
  if (input.outcome !== "succeeded" && input.outcome !== "failed") {
    throw new Error("Action observation outcome is invalid.");
  }
  const summary = input.summary.trim().slice(0, MAX_SUMMARY_LENGTH);
  if (!summary) throw new Error("Action observation summary must not be empty.");
  return {
    outcome: input.outcome,
    summary,
    output: boundedJsonObject(input.output, MAX_OUTPUT_BYTES, "Action observation output")
  };
}

function boundedJsonObject(input: unknown, maxBytes: number, label: string): JsonObject {
  assertJsonValue(input, label);
  if (Array.isArray(input) || input === null || typeof input !== "object") {
    throw new Error(`${label} must be a JSON object.`);
  }
  const serialized = stableJson(input as JsonObject);
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes.`);
  }
  return JSON.parse(serialized) as JsonObject;
}

function assertJsonValue(input: unknown, path: string): asserts input is JsonValue {
  if (input === null || typeof input === "string" || typeof input === "boolean") return;
  if (typeof input === "number" && Number.isFinite(input)) return;
  if (Array.isArray(input)) {
    input.forEach((value, index) => assertJsonValue(value, `${path}[${index}]`));
    return;
  }
  if (typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      if (!key || key.length > 200) throw new Error(`${path} contains an invalid key.`);
      assertJsonValue(value, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} is not JSON-safe.`);
}

function boundedError(error: unknown, fallback: string): string {
  return (errorMessage(error).trim() || fallback).slice(0, MAX_SUMMARY_LENGTH);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
