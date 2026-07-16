import {
  recordRuntimeTaskRun,
  type RuntimeSessionRecord,
  type RuntimeSessionSource
} from "../../core/src/runtime_sessions.js";
import {
  claimRuntimeTask,
  enqueueRuntimeTask,
  failRuntimeTask,
  settleRuntimeTaskFromResult,
  type RuntimeTaskQueueEntry
} from "../../core/src/runtime_task_queue.js";
import { runtimeChannelSourceKey } from "../../core/src/runtime_channel_messages.js";
import type { RunResult } from "../../core/src/schemas.js";
import type { AgentStore } from "../../core/src/store.js";

export interface RuntimeChannelTaskResult {
  queued: RuntimeTaskQueueEntry;
  result: RunResult;
  sourceKey: string;
}

export async function runRuntimeChannelTask(
  store: AgentStore,
  args: {
    session: RuntimeSessionRecord;
    source: RuntimeSessionSource;
    taskText: string;
    runnerTask: string;
    runTask: (task: string) => Promise<RunResult>;
  }
): Promise<RuntimeChannelTaskResult> {
  const sourceKey = runtimeChannelSourceKey(args.source, args.session.profile);
  const queued = await enqueueRuntimeTask(store, {
    runtimeSessionId: args.session.id,
    source: args.source,
    task: args.taskText,
    runnerTask: args.runnerTask
  });
  await recordRuntimeTaskRun(store, {
    id: queued.id,
    createdAt: queued.created_at,
    runtimeSessionId: args.session.id,
    sourceKind: args.source.kind,
    sourceKey,
    task: args.taskText,
    status: "queued"
  });
  const claimed = await claimRuntimeTask(store, { id: queued.id });
  if (!claimed) throw new Error(`runtime task ${queued.id} could not be claimed`);
  await recordRuntimeTaskRun(store, {
    id: queued.id,
    createdAt: queued.created_at,
    runtimeSessionId: args.session.id,
    sourceKind: args.source.kind,
    sourceKey,
    task: args.taskText,
    status: "running"
  });

  try {
    const result = await args.runTask(args.runnerTask);
    const settlement = await settleRuntimeTaskFromResult(store, { id: queued.id, result });
    if (!settlement) throw new Error(`runtime task ${queued.id} could not be settled`);
    await recordRuntimeTaskRun(store, {
      id: queued.id,
      createdAt: queued.created_at,
      runtimeSessionId: args.session.id,
      sourceKind: args.source.kind,
      sourceKey,
      task: args.taskText,
      runResult: result
    });
    return { queued, result, sourceKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failRuntimeTask(store, { id: queued.id, error: message });
    await recordRuntimeTaskRun(store, {
      id: queued.id,
      createdAt: queued.created_at,
      runtimeSessionId: args.session.id,
      sourceKind: args.source.kind,
      sourceKey,
      task: args.taskText,
      status: "failed"
    });
    throw error;
  }
}
