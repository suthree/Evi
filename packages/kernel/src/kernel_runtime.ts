import type {
  AgentLoopFactory,
  RunInspection,
  RunExecutionResult,
  RunRecord,
  SubmitRequest
} from "./contracts.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

export class KernelRuntime {
  constructor(
    private readonly store: SqliteRuntimeStore,
    private readonly loops: AgentLoopFactory
  ) {}

  async submit(input: SubmitRequest): Promise<RunExecutionResult> {
    const run = this.store.beginRun(input);
    try {
      const loop = this.loops.create({
        run_id: run.id,
        turn_id: run.turn_id,
        session_id: run.session_id
      });
      const result = await loop.execute(run.request);
      const completed = this.store.completeRun(run.id, result.answer);
      return toResult(completed);
    } catch (error) {
      if (this.store.hasUnresolvedActions(run.id)) {
        const paused = this.store.pauseRun(
          run.id,
          "Run paused because an Action outcome is unknown; reconcile evidence before continuation."
        );
        return toResult(paused);
      }
      const failed = this.store.failRun(run.id, errorMessage(error));
      return toResult(failed);
    }
  }

  inspect(runId: string): RunInspection | null {
    return this.store.inspectRun(runId);
  }
}

function toResult(run: RunRecord): RunExecutionResult {
  if (run.status === "running") throw new Error(`Run has no submission result: ${run.id}`);
  if (run.status === "paused") {
    return {
      run_id: run.id,
      turn_id: run.turn_id,
      session_id: run.session_id,
      status: "paused",
      answer: null,
      error: run.error ?? "Run paused."
    };
  }
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
