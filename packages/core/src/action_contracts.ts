export const allowedActions = [
  "respond",
  "use_tool",
  "delegate_agent",
  "update_working_state",
  "record_evidence",
  "propose_sop",
  "propose_memory",
  "request_audit",
  "pause_autonomy"
] as const;

export type AllowedAction = typeof allowedActions[number];
