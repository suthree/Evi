export type RunStatus = "running" | "completed" | "failed";

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
}

export interface RunOutcome {
  run_id: string;
  turn_id: string;
  session_id: string;
  status: "completed" | "failed";
  answer: string | null;
  error: string | null;
}

export interface SubmitRequest {
  request: string;
  goal_id?: string;
}

export interface AgentLoopResult {
  answer: string;
}

export interface AgentLoop {
  execute(request: string): Promise<AgentLoopResult>;
}

export interface AgentLoopFactory {
  create(input: { session_id: string }): AgentLoop;
}
