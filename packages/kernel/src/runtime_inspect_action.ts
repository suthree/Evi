import { Type } from "typebox";
import type { ActionDispatch, ActionHandler, ActionObservation, JsonObject } from "./action_types.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

const parameters = Type.Object({}, { additionalProperties: false });

export function createRuntimeInspectAction(store: SqliteRuntimeStore): ActionHandler {
  const observe = async (dispatch: ActionDispatch): Promise<ActionObservation> => {
    const inspection = store.inspectRun(dispatch.reservation.run_id);
    if (!inspection || inspection.turn_id !== dispatch.reservation.turn_id) {
      return {
        outcome: "failed",
        summary: "The current Run could not be inspected inside its reserved authority.",
        output: { run_id: dispatch.reservation.run_id, found: false }
      };
    }
    return {
      outcome: "succeeded",
      summary: `Current Run is ${inspection.status}; bounded runtime state was inspected locally.`,
      output: {
        run_id: inspection.id,
        turn_id: inspection.turn_id,
        status: inspection.status,
        event_count: inspection.event_count,
        session_entry_count: inspection.session_entry_count,
        action_count: inspection.action_count,
        unresolved_action_count: inspection.unresolved_action_count,
        effect_receipt_count: inspection.effect_receipt_count
      }
    };
  };

  return {
    contract: {
      name: "runtime_inspect",
      version: "1",
      label: "Inspect current Run",
      description: "Read bounded status and evidence counts for the current Run from canonical SQLite state.",
      parameters,
      effect_class: "local_read"
    },
    prepare(argumentsInput: unknown): JsonObject {
      if (!argumentsInput || typeof argumentsInput !== "object" || Array.isArray(argumentsInput)) {
        throw new Error("runtime_inspect arguments must be an object.");
      }
      if (Object.keys(argumentsInput).length > 0) {
        throw new Error("runtime_inspect accepts no arguments.");
      }
      return {};
    },
    execute: observe,
    reconcile: observe
  };
}
