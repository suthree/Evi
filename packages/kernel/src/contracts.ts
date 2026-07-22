import type { ActionGateway } from "./action_gateway.js";
import type { ActionEffectClass } from "./action_types.js";
import type { RunExecutionLease } from "./execution_types.js";

export type RunStatus = "running" | "waiting" | "paused" | "completed" | "failed";

export interface RunRecord {
  id: string;
  status: RunStatus;
  goal_id: string | null;
  answer: string | null;
  error: string | null;
  session_id: string;
  turn_id: string;
  created_at: string;
  updated_at: string;
}

export interface RunInspection extends RunRecord {
  execution_lock_digest: string;
  execution_lock: ExecutionLock;
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
  worker_count: number;
  outstanding_worker_count: number;
  deliverable_worker_count: number;
}

export interface RuntimeSessionRecord {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRunSummary {
  id: string;
  status: RunStatus;
  turn_id: string;
  execution_lock_digest: string;
  created_at: string;
  updated_at: string;
}

export interface SessionInspection extends RuntimeSessionRecord {
  active_run_id: string | null;
  active_run_status: "running" | "waiting" | "paused" | null;
  run_count: number;
  session_entry_count: number;
  runs: SessionRunSummary[];
}

export type ExecutionModelApi = string;

export interface ExecutionLockAction {
  name: string;
  version: string;
  effect_class: ActionEffectClass;
}

export interface ExecutionLockInput {
  model: {
    config_id: string;
    provider: string;
    api: ExecutionModelApi;
    base_url: string;
    model: string;
    credential_ref: string;
    reasoning_effort: string | null;
    context_window_tokens: number;
    max_output_tokens: number;
    timeout_ms: number;
  };
  authority: {
    cwd: string;
  };
  configuration: {
    selector: string;
    source_refs: string[];
  };
  actions: ExecutionLockAction[];
}

export interface ExecutionLock extends ExecutionLockInput {
  schema_version: 1;
  digest: string;
  created_at: string;
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

export interface RunWait {
  run_id: string;
  turn_id: string;
  session_id: string;
  status: "waiting";
  answer: null;
  error: null;
}

export type RunExecutionResult = RunOutcome | RunPause | RunWait;

export interface SubmitRequest {
  request: string;
  goal_id?: string;
  session_id?: string;
  execution_lock: ExecutionLockInput;
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
    execution_lock: ExecutionLock;
  }): AgentLoop;
}
