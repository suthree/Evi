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

export const delegateAgentDispatchFailureKindValues = [
  "dispatch_limit_exceeded",
  "input_contract_failed"
] as const;

export const delegateAgentDispatchKindValues = [
  ...delegateAgentDispatchFailureKindValues,
  "none"
] as const;

export const delegateAgentResultFailureKindValues = [
  "dispatch_limit_exceeded",
  "input_contract_failed",
  "delegated_output_contract_failed",
  "delegated_model_request_failed"
] as const;

export const delegateAgentResultKindValues = [
  ...delegateAgentResultFailureKindValues,
  "none"
] as const;

export const delegateAgentResultFailureKindsFromDispatch = [
  "dispatch_limit_exceeded",
  "input_contract_failed"
] as const;

export const delegateAgentCompletionGateCheckIds = [
  "claimed_refs_bound_to_evidence",
  "delegated_self_report_refs",
  "delegated_independent_evidence",
  "delegated_results"
] as const;

export const delegateAgentActionContract = {
  action: "delegate_agent",
  payload_keys: ["task", "context"],
  output_keys: ["summary", "findings_text"],
  max_actions_per_round: 1,
  task_max_chars: 1000,
  context_max_chars: 12000,
  summary_max_chars: 240,
  findings_max_chars: 2000,
  dispatch_failure_kinds: delegateAgentDispatchFailureKindValues,
  dispatch_kinds: delegateAgentDispatchKindValues,
  result_failure_kinds: delegateAgentResultFailureKindValues,
  result_kinds: delegateAgentResultKindValues,
  result_failure_kinds_from_dispatch: delegateAgentResultFailureKindsFromDispatch,
  completion_gate_check_ids: delegateAgentCompletionGateCheckIds,
  boundary: "delegate_agent is a bounded, tool-less delegated self-report contract; execution and completion authority remain with the main harness"
} as const;

export type DelegateAgentDispatchFailureKind = typeof delegateAgentDispatchFailureKindValues[number];
export type DelegateAgentDispatchKind = typeof delegateAgentDispatchKindValues[number];
export type DelegateAgentResultFailureKind = typeof delegateAgentResultFailureKindValues[number];
export type DelegateAgentResultKind = typeof delegateAgentResultKindValues[number];
