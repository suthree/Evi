import type {
  AgentLoopFactory,
  RunInspection,
  RunOutcome,
  RunRecord,
  SubmitRequest
} from "./contracts.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

export class KernelRuntime {
  constructor(
    private readonly store: SqliteRuntimeStore,
    private readonly loops: AgentLoopFactory
  ) {}

  async submit(input: SubmitRequest): Promise<RunOutcome> {
    const run = this.store.beginRun(input);
    try {
      const loop = this.loops.create({ session_id: run.session_id });
      const result = await loop.execute(run.request);
      const completed = this.store.completeRun(run.id, result.answer);
      return toOutcome(completed);
    } catch (error) {
      const failed = this.store.failRun(run.id, errorMessage(error));
      return toOutcome(failed);
    }
  }

  inspect(runId: string): RunInspection | null {
    return this.store.inspectRun(runId);
  }
}

function toOutcome(run: RunRecord): RunOutcome {
  if (run.status === "running") throw new Error(`Run has no terminal outcome: ${run.id}`);
  return {
    run_id: run.id,
    turn_id: run.turn_id,
    session_id: run.session_id,
    status: run.status,
    answer: run.answer,
    error: run.error
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
