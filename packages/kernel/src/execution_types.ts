export type RunExecutionKind =
  | "initial"
  | "action_continuation"
  | "worker_result_continuation"
  | "dispatch_recovery"
  | "protocol_recovery";
export type RunExecutionState = "active" | "settled" | "interrupted";
export type RunExecutionOutcome = "waiting" | "completed" | "paused" | "failed" | "interrupted";

export interface RunExecutionLease {
  id: string;
  run_id: string;
  turn_id: string;
  ordinal: number;
  kind: RunExecutionKind;
  recovery_of_execution_id: string | null;
  session_start_seq: number;
  token: string;
  lease_expires_at: string;
}

export type ModelDispatchState =
  | "dispatching"
  | "response_observed"
  | "settled"
  | "outcome_unknown";

export interface ModelDispatchRecord {
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

export interface RunExecutionRecoveryEvidence {
  execution_id: string;
  ordinal: number;
  kind: RunExecutionKind;
  input_digest: string;
  session_start_seq: number;
  dispatches: ModelDispatchRecord[];
}

export interface SettledRunExecutionEvidence {
  execution_id: string;
  ordinal: number;
  outcome: "waiting" | "completed" | "paused" | "failed";
  dispatches: ModelDispatchRecord[];
}

export interface RunExecutionModelEvidence {
  execution_id: string;
  ordinal: number;
  dispatches: ModelDispatchRecord[];
}
