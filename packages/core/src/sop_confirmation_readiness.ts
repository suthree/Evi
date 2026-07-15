import type { SkillResolverLike } from "./skill_resolver.js";
import {
  getSopEvolutionLedger,
  sopEvolutionNextCommandActionId,
  type OperatorNextCommand
} from "./sop_evolution_ledger.js";
import { AgentStore } from "./store.js";

export type SopEvolutionConfirmationGateStatus = "current" | "stale" | "executed";
export type SopEvolutionConfirmationGateReasonCode =
  | "confirmation_executed"
  | "confirmation_status_unsupported"
  | "sop_ref_missing"
  | "chain_not_found"
  | "next_command_missing"
  | "action_id_changed"
  | "action_kind_changed"
  | "required_refs_changed"
  | "write_boundary_changed"
  | "current_next_command_match";

export interface SopEvolutionConfirmationGate {
  status: SopEvolutionConfirmationGateStatus;
  reason_code: SopEvolutionConfirmationGateReasonCode;
  reason: string;
  current_action_id?: string;
  current_action_kind?: OperatorNextCommand["action_kind"];
  current_required_refs?: string[];
  current_would_write?: string[];
}

export async function inspectSopEvolutionConfirmationGate(
  store: AgentStore,
  confirmation: unknown,
  args: { vaultRoot?: SkillResolverLike } = {}
): Promise<SopEvolutionConfirmationGate | undefined> {
  if (!isRecord(confirmation) || confirmation.source !== "sop_evolution_chain") return undefined;
  if (confirmation.status === "executed") {
    return {
      status: "executed",
      reason_code: "confirmation_executed",
      reason: "Confirmation already executed."
    };
  }
  if (confirmation.status !== "pending") {
    return {
      status: "stale",
      reason_code: "confirmation_status_unsupported",
      reason: `Unsupported SOP evolution confirmation status: ${String(confirmation.status)}`
    };
  }

  const sopRef = stringField(confirmation, "sop_ref")
    ?? firstSopDraftRef(confirmation.action)
    ?? firstSopDraftRef(confirmation.required_refs)
    ?? stringField(confirmation, "proposal_id");
  if (!sopRef) {
    return {
      status: "stale",
      reason_code: "sop_ref_missing",
      reason: "SOP evolution confirmation has no SOP ref."
    };
  }

  const ledger = await getSopEvolutionLedger(store, {
    limit: Number.MAX_SAFE_INTEGER,
    vaultRoot: args.vaultRoot ?? "vault"
  });
  const normalizedRef = resolveSopJsonRef(sopRef);
  const normalizedId = refId(normalizedRef);
  const entry = ledger.entries.find((item) =>
    item.sop_ref === normalizedRef
    || item.sop_id === normalizedId
    || item.sop_id === sopRef
  );
  if (!entry) {
    return {
      status: "stale",
      reason_code: "chain_not_found",
      reason: `SOP evolution chain not found: ${sopRef}`
    };
  }
  if (!entry.next_command) {
    return {
      status: "stale",
      reason_code: "next_command_missing",
      reason: `SOP evolution chain has no confirmable next command: ${entry.sop_id}`
    };
  }

  const currentActionId = sopEvolutionNextCommandActionId(entry);
  const currentActionKind = entry.next_command.action_kind;
  const currentRequiredRefs = entry.next_command.required_refs;
  const currentWouldWrite = entry.next_command.would_write;
  const base = {
    current_action_id: currentActionId,
    current_action_kind: currentActionKind,
    current_required_refs: currentRequiredRefs,
    current_would_write: currentWouldWrite
  };
  const actionId = stringField(confirmation, "action_id");
  const actionKind = stringField(confirmation, "action_kind");
  const requiredRefs = stringArray(confirmation.required_refs);
  const wouldWrite = stringArray(confirmation.would_write);
  if (currentActionId !== actionId) {
    return {
      status: "stale",
      reason_code: "action_id_changed",
      reason: `SOP evolution action changed: ${actionId ?? "unknown"}`,
      ...base
    };
  }
  if (currentActionKind !== actionKind) {
    return {
      status: "stale",
      reason_code: "action_kind_changed",
      reason: `SOP evolution action kind changed: ${currentActionKind}`,
      ...base
    };
  }
  if (!sameStringArray(currentRequiredRefs, requiredRefs)) {
    return {
      status: "stale",
      reason_code: "required_refs_changed",
      reason: `SOP evolution required refs changed: ${actionId ?? "unknown"}`,
      ...base
    };
  }
  if (!sameStringArray(currentWouldWrite, wouldWrite)) {
    return {
      status: "stale",
      reason_code: "write_boundary_changed",
      reason: `SOP evolution write boundary changed: ${actionId ?? "unknown"}`,
      ...base
    };
  }
  return {
    status: "current",
    reason_code: "current_next_command_match",
    reason: "Pending SOP evolution confirmation matches the current ledger next command.",
    ...base
  };
}

function firstSopDraftRef(value: unknown): string | null {
  if (isRecord(value)) return firstSopDraftRef(value.required_refs);
  return stringArray(value).find((item) => item.startsWith("sop/drafts/") && item.endsWith(".json")) ?? null;
}

function resolveSopJsonRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed.startsWith("sop/drafts/")) return withJsonExtension(trimmed);
  return `sop/drafts/${withJsonExtension(trimmed.split("/").at(-1) ?? trimmed)}`;
}

function withJsonExtension(value: string): string {
  return value.endsWith(".json") ? value : `${value}.json`;
}

function refId(ref: string): string {
  return ref.split("#").at(-1)?.replace(/\.json$/, "").split("/").at(-1) ?? ref;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
