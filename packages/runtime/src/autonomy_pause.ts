import { evidenceEventSchema } from "../../core/src/schemas.js";
import { AgentStore } from "../../core/src/store.js";
import { newId, utcNow } from "../../core/src/ids.js";

const PAUSE_SIGNAL_REF = "autonomy/runs/pause_signal.json";

export interface ResumeAutonomyResult {
  action: "resume-autonomy";
  ok: true;
  signal_ref: typeof PAUSE_SIGNAL_REF;
  resume_ref: string;
  evidence_event_id: string;
  previous_status: string;
  status: "inactive";
  reason: string;
  resumed_at: string;
}

export async function resumeAutonomy(
  store: AgentStore,
  args: { reason: string }
): Promise<ResumeAutonomyResult> {
  await store.ensureLayout();
  const reason = args.reason.trim();
  if (!reason) throw new Error("resume-autonomy requires --reason");

  const signal = await store.readStateJson<unknown>(PAUSE_SIGNAL_REF);
  if (!isRecord(signal)) throw new Error("No autonomy pause signal found");
  const previousStatus = stringField(signal, "status") ?? "unknown";
  if (previousStatus !== "active") throw new Error(`Autonomy pause is not active: ${previousStatus}`);

  const resumedAt = utcNow();
  const resumeRecord = {
    id: newId("resume_autonomy"),
    action_type: "resume_autonomy",
    signal_ref: PAUSE_SIGNAL_REF,
    previous_status: previousStatus,
    status: "inactive",
    reason,
    resumed_by: "operator_command",
    resumed_at: resumedAt,
    boundary: "local operator resume signal; no review tick, confirmation, model invocation, active-vault write, or SOP/skill mutation executed"
  };
  const updatedSignal = {
    ...signal,
    status: "inactive",
    resumed_at: resumedAt,
    resumed_by: "operator_command",
    resume_reason: reason,
    resume_ref: `autonomy/runs/${resumeRecord.id}.json`
  };

  const signalRef = await store.writeJson(PAUSE_SIGNAL_REF, updatedSignal);
  const resumeRef = await store.writeJson(`autonomy/runs/${resumeRecord.id}.json`, resumeRecord);
  const event = evidenceEventSchema.parse({
    session_id: "operator_resume_autonomy",
    turn_id: resumeRecord.id,
    kind: "report",
    summary: `Resumed autonomy pause: ${reason.slice(0, 180)}`,
    artifact_refs: [signalRef, resumeRef]
  });
  await store.appendJsonl("memory/episodes/events.jsonl", event);
  return {
    action: "resume-autonomy",
    ok: true,
    signal_ref: PAUSE_SIGNAL_REF,
    resume_ref: resumeRef,
    evidence_event_id: event.id,
    previous_status: previousStatus,
    status: "inactive",
    reason,
    resumed_at: resumedAt
  };
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
