import type { ActionGateway } from "./action_gateway.js";
import type { RunExecutionLease } from "./execution_types.js";

export type RunStatus = "running" | "paused" | "completed" | "failed";

export interface RunRecord {
  id: string;
  status: RunStatus;
  goal_id: string | null;
  request: string;
  answer: string | null;
  error: string | null;
  session_id: string;
  turn_id: string;
  created_at: string;
  updated_at: string;
}

export interface RunInspection extends RunRecord {
  event_count: number;
  session_entry_count: number;
  action_count: number;
  unresolved_action_count: number;
  effect_receipt_count: number;
  continuation_count: number;
  execution_count: number;
  interrupted_execution_count: number;
  model_dispatch_count: number;
  unknown_model_dispatch_count: number;
}

export interface RunOutcome {
  run_id: string;
  turn_id: string;
  session_id: string;
  status: "completed" | "failed";
  answer: string | null;
  error: string | null;
}

export interface RunPause {
  run_id: string;
  turn_id: string;
  session_id: string;
  status: "paused";
  answer: null;
  error: string;
}

export type RunExecutionResult = RunOutcome | RunPause;

export interface SubmitRequest {
  request: string;
  goal_id?: string;
}

export interface AgentLoopResult {
  answer: string;
}

export interface AgentLoop {
  execute(request: string, signal: AbortSignal): Promise<AgentLoopResult>;
}

export interface AgentLoopFactory {
  create(input: {
    run_id: string;
    turn_id: string;
    session_id: string;
    action_gateway: ActionGateway;
    execution: RunExecutionLease;
  }): AgentLoop;
}
