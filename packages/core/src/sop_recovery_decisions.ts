import type { SopEvolutionConfirmationGateReasonCode } from "./sop_confirmation_readiness.js";
import { AgentStore } from "./store.js";

export const SOP_RECOVERY_DECISIONS_REF = "autonomy/sop-recovery-decisions.jsonl";

export type SopRecoveryDecisionStatus = "open" | "deferred" | "fresh_requested" | "historical";

export interface SopRecoveryDecisionRecord {
  id: string;
  confirmation_id: string;
  confirmation_ref: string;
  sop_id: string;
  sop_ref?: string;
  status: SopRecoveryDecisionStatus;
  previous_status: SopRecoveryDecisionStatus | "none";
  gate_reason_code: SopEvolutionConfirmationGateReasonCode;
  gate_reason: string;
  reason: string;
  created_at: string;
}

export type SopRecoveryDecisionWithRef = SopRecoveryDecisionRecord & { ref: string };

export async function readSopRecoveryDecisions(store: AgentStore): Promise<SopRecoveryDecisionWithRef[]> {
  const raw = await store.readStateText(SOP_RECOVERY_DECISIONS_REF);
  if (!raw.trim()) return [];
  const decisions: SopRecoveryDecisionWithRef[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isSopRecoveryDecision(parsed)) {
        decisions.push({
          ...parsed,
          ref: `${SOP_RECOVERY_DECISIONS_REF}#${index + 1}`
        });
      }
    } catch {
      // Ignore malformed historical rows; decision logs are append-only diagnostics.
    }
  });
  return decisions;
}

export function latestSopRecoveryDecision(
  decisions: SopRecoveryDecisionWithRef[],
  confirmationRef: string,
  confirmationId: string
): SopRecoveryDecisionWithRef | undefined {
  return decisions
    .filter((decision) => decision.confirmation_ref === confirmationRef || decision.confirmation_id === confirmationId)
    .at(-1);
}

export async function countSopRecoveryDecisions(store: AgentStore): Promise<number> {
  const raw = await store.readStateText(SOP_RECOVERY_DECISIONS_REF);
  if (!raw.trim()) return 0;
  return raw.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

export function isSopRecoveryDecisionStatus(value: unknown): value is SopRecoveryDecisionStatus {
  return value === "open"
    || value === "deferred"
    || value === "fresh_requested"
    || value === "historical";
}

function isSopRecoveryDecision(value: unknown): value is SopRecoveryDecisionRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.confirmation_id === "string"
    && typeof value.confirmation_ref === "string"
    && typeof value.sop_id === "string"
    && (typeof value.sop_ref === "string" || value.sop_ref === undefined)
    && isSopRecoveryDecisionStatus(value.status)
    && (isSopRecoveryDecisionStatus(value.previous_status) || value.previous_status === "none")
    && typeof value.gate_reason_code === "string"
    && typeof value.gate_reason === "string"
    && typeof value.reason === "string"
    && typeof value.created_at === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
