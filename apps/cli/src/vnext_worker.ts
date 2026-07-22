import { isAbsolute, join, resolve } from "node:path";
import {
  ActionGateway,
  createRuntimeInspectAction,
  createWorkerNeedsInputAction,
  DiscussionWorkerRuntime,
  ExecutionWorkerRuntime,
  OrchestrationEngine,
  SqliteRuntimeStore,
  type ExecutionWorkerExecutor,
  type ExecutionWorkerInspection,
  type WorkerInspection,
  WORKER_NEEDS_INPUT_CONTRACT
} from "../../../packages/kernel/src/index.js";
import {
  assertContinuationSelectors,
  assertCredentialBinding,
  createLoopFactory,
  DEFAULT_VNEXT_STATE_ROOT,
  loadConfiguredVNextModel,
  type VNextRunDependencies
} from "./vnext_run.js";
import { resolveIsolatedVNextSqlite } from "./vnext_state.js";
import { VNextCodexExecutionExecutor } from "./vnext_execution_executor.js";

export const VNEXT_WORKER_MARKER = "vnext_discussion_worker";
export const VNEXT_EXECUTION_WORKER_MARKER = "vnext_execution_worker";
export type VNextWorkerAction = "execute";

export interface VNextWorkerRequest {
  action: VNextWorkerAction;
  worker_id: string;
  state_root?: string;
  config_dir?: string;
  repo_root?: string;
}

export type VNextWorkerDependencies = Pick<
  VNextRunDependencies,
  "path_boundary" | "load_model" | "create_loop_factory"
> & { execution_executor?: ExecutionWorkerExecutor };

export interface VNextWorkerEnvelope {
  worker: {
    schema_version: 1;
    marker: typeof VNEXT_WORKER_MARKER | typeof VNEXT_EXECUTION_WORKER_MARKER;
    surface: "cli_process";
    action: VNextWorkerAction | null;
    status: WorkerInspection["status"] | ExecutionWorkerInspection["status"] | "not_found" | "error";
    worker_kind?: "discussion" | "execution";
    worker_id?: string;
    parent_run_id?: string;
    child_run_id?: string | null;
    result_envelope_digest?: string | null;
    diagnostic?: { code: string; message: string };
    boundary: string;
  };
}

export async function executeVNextWorker(
  input: VNextWorkerRequest,
  dependencies: VNextWorkerDependencies = {}
): Promise<VNextWorkerEnvelope> {
  const workerId = input.worker_id.trim();
  if (!workerId) throw new Error("vnext worker execute requires --worker-id");
  const stateRoot = input.state_root?.trim() || DEFAULT_VNEXT_STATE_ROOT;
  const sqlite = await resolveIsolatedVNextSqlite(join(stateRoot, "runtime.sqlite"), {
    missing: "vnext worker requires an absolute independent state root",
    relative: "vNext worker state root must be absolute.",
    overlap: "vNext worker state must not overlap the v0.2 shared state root.",
    symlink_limit: "vNext worker state root contains too many symbolic links."
  }, dependencies.path_boundary);
  const repoRoot = resolve(input.repo_root?.trim() || ".");
  const requestedConfigDir = input.config_dir?.trim() || "config";
  const configDir = isAbsolute(requestedConfigDir)
    ? requestedConfigDir
    : resolve(repoRoot, requestedConfigDir);
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const worker = store.inspectWorker(workerId);
    const executionWorker = store.inspectExecutionWorker(workerId);
    if (worker && executionWorker) throw new Error(`Worker identity is ambiguous: ${workerId}`);
    if (!worker && !executionWorker) return envelope("not_found", workerId);
    if (executionWorker) {
      if (["completed", "failed", "needs_input"].includes(executionWorker.status)) {
        return envelope(executionWorker.status, executionWorker.id, executionWorker);
      }
      const executor = dependencies.execution_executor ?? new VNextCodexExecutionExecutor();
      const completed = await new ExecutionWorkerRuntime(store, executor).execute(executionWorker.id);
      return envelope(completed.status, completed.id, completed);
    }
    if (!worker) throw new Error(`Worker Session not found: ${workerId}`);
    if (worker.status === "completed" || worker.status === "failed" || worker.status === "needs_input") {
      return envelope(worker.status, worker.id, worker);
    }
    assertContinuationSelectors(worker.child_execution_lock, repoRoot, configDir);
    const loadModel = dependencies.load_model ?? loadConfiguredVNextModel;
    const model = await loadModel({
      config_dir: configDir,
      state_root: stateRoot,
      model_id: worker.child_execution_lock.model.config_id
    });
    assertCredentialBinding(worker.child_execution_lock, model);
    const runtimeInspect = createRuntimeInspectAction(store);
    const supportsNeedsInput = worker.child_execution_lock.actions.some(
      (action) => action.name === WORKER_NEEDS_INPUT_CONTRACT.name
    );
    const orchestration = new OrchestrationEngine(store, [
      runtimeInspect.contract,
      ...(supportsNeedsInput ? [WORKER_NEEDS_INPUT_CONTRACT] : [])
    ]);
    const gateway = new ActionGateway(store, [
      runtimeInspect,
      ...(supportsNeedsInput ? [createWorkerNeedsInputAction(orchestration)] : [])
    ]);
    const loops = createLoopFactory(dependencies, store, model.api_key);
    const completed = await new DiscussionWorkerRuntime(store, gateway, loops).execute(worker.id);
    return envelope(completed.status, completed.id, completed);
  } finally {
    store.close();
  }
}

export function vnextWorkerErrorEnvelope(
  error: unknown,
  action: VNextWorkerAction | null
): VNextWorkerEnvelope {
  return {
    worker: {
      schema_version: 1,
      marker: VNEXT_WORKER_MARKER,
      surface: "cli_process",
      action,
      status: "error",
      diagnostic: {
        code: /not found/iu.test(errorMessage(error)) ? "worker_not_found" : "worker_error",
        message: errorMessage(error)
      },
      boundary: boundary()
    }
  };
}

function envelope(
  status: VNextWorkerEnvelope["worker"]["status"],
  workerId: string,
  worker?: WorkerInspection | ExecutionWorkerInspection
): VNextWorkerEnvelope {
  const workerKind = worker?.task_envelope.worker_kind;
  return {
    worker: {
      schema_version: 1,
      marker: workerKind === "execution" ? VNEXT_EXECUTION_WORKER_MARKER : VNEXT_WORKER_MARKER,
      surface: "cli_process",
      action: "execute",
      status,
      worker_id: workerId,
      ...(worker ? {
        worker_kind: workerKind,
        parent_run_id: worker.parent_run_id,
        child_run_id: worker.child_run_id,
        result_envelope_digest: worker.result_envelope?.digest ?? null
      } : {}),
      ...(status === "not_found"
        ? { diagnostic: { code: "worker_not_found", message: "Requested Worker Session was not found." } }
        : {}),
      boundary: boundary()
    }
  };
}

function boundary(): string {
  return "One separate CLI process may claim one exact Worker lease. Discussion stays read-only; execution stays inside one pre-bound single-writer Delivery Lineage and returns canonical Git plus verification evidence to the Supervisor.";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
