import { channel } from "node:diagnostics_channel";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  ActionGateway,
  createDiscussionWorkerDispatchAction,
  createExecutionWorkerDispatchAction,
  createReviewWorkerDispatchAction,
  createRuntimeInspectAction,
  createWorkerInspectAction,
  createWorkerNeedsInputAction,
  ExecutionLockMismatchError,
  executionLockActions,
  KernelRuntime,
  OrchestrationEngine,
  RuntimeSchemaIncompatibleError,
  RuntimeStateProfileIncompatibleError,
  RuntimeSessionBusyError,
  RuntimeSessionNotFoundError,
  SqliteRuntimeStore,
  type AgentLoopFactory,
  type ExecutionLock,
  type ExecutionLockInput,
  type RunExecutionResult,
  type RunInspection,
  type SessionInspection,
  WORKER_NEEDS_INPUT_CONTRACT
} from "../../../packages/kernel/src/index.js";
import {
  resolveIsolatedVNextSqlite,
  type VNextStatePathBoundary
} from "./vnext_state.js";
import {
  loadLegacyConfigPiAdapter,
  type LegacyConfigPiAdapter,
  type LegacyConfigPiAdapterLoadInput,
  type PiLoopFactoryOverride,
  type ResolvedVNextModel
} from "./vnext_legacy_config_pi_adapter.js";

export type { ResolvedVNextModel } from "./vnext_legacy_config_pi_adapter.js";

export const DEFAULT_VNEXT_STATE_ROOT = resolve(homedir(), ".local-runtime/state/vnext-cli");
export const VNEXT_RUN_MARKER = "vnext_goal_free_cli";
export const VNEXT_RUN_DIAGNOSTIC_CHANNEL = "local-runtime.vnext_goal_free_cli.dispatch";

const vnextRunDispatch = channel(VNEXT_RUN_DIAGNOSTIC_CHANNEL);

export type VNextRunAction = "submit" | "continue" | "inspect";
export type VNextRunDiagnosticCode =
  | "run_not_found"
  | "session_not_found"
  | "session_busy"
  | "execution_lock_mismatch"
  | "credential_unavailable"
  | "schema_incompatible"
  | "recovery_evidence_mismatch"
  | "invalid_input"
  | "run_error";

export interface VNextRunRequest {
  action: VNextRunAction;
  task?: string;
  run_id?: string;
  session_id?: string;
  state_root?: string;
  config_dir?: string;
  repo_root?: string;
}

export interface VNextRunEnvelope {
  vnext: {
    schema_version: 1;
    marker: typeof VNEXT_RUN_MARKER;
    surface: "cli";
    action: VNextRunAction | null;
    status: "running" | "waiting" | "completed" | "paused" | "failed" | "not_found" | "error";
    run_id?: string;
    turn_id?: string;
    session_id?: string;
    execution_lock_digest?: string;
    result?: RunInspection | SessionInspection | { answer: string | null; error: string | null };
    diagnostic?: { code: VNextRunDiagnosticCode; message: string };
    boundary: string;
  };
}

export interface VNextRunDependencies {
  path_boundary?: VNextStatePathBoundary;
  load_legacy_config_pi_adapter?: (
    input: LegacyConfigPiAdapterLoadInput
  ) => Promise<LegacyConfigPiAdapter>;
  create_loop_factory?: PiLoopFactoryOverride;
}

export async function executeVNextRun(
  input: VNextRunRequest,
  dependencies: VNextRunDependencies = {}
): Promise<VNextRunEnvelope> {
  vnextRunDispatch.publish({ marker: VNEXT_RUN_MARKER, surface: "cli", action: input.action });
  const stateRoot = input.state_root?.trim() || DEFAULT_VNEXT_STATE_ROOT;
  const sqlite = await resolveIsolatedVNextSqlite(join(stateRoot, "runtime.sqlite"), {
    missing: "vnext run requires an absolute independent state root",
    relative: "vNext stable state root must be absolute.",
    overlap: "vNext stable state must not overlap the v0.2 shared state root.",
    symlink_limit: "vNext stable state root contains too many symbolic links."
  }, dependencies.path_boundary);
  const repoRoot = resolve(input.repo_root?.trim() || ".");
  const requestedConfigDir = input.config_dir?.trim() || "config";
  const configDir = isAbsolute(requestedConfigDir)
    ? requestedConfigDir
    : resolve(repoRoot, requestedConfigDir);
  const loadAdapter = dependencies.load_legacy_config_pi_adapter ?? loadLegacyConfigPiAdapter;

  if (input.action === "submit") {
    const adapter = await loadAdapter({ config_dir: configDir, state_root: stateRoot });
    try {
      const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
      try {
        const { gateway, orchestration } = createSupervisorComposition(store, {
          needs_input: true,
          execution: true,
          review: true
        });
        const loops = adapter.createLoopFactory({
          store,
          override: dependencies.create_loop_factory
        });
        const runtime = new KernelRuntime(store, gateway, loops, { orchestration });
        const result = await runtime.submit({
          request: adapter.redact(required(input.task, "vnext run submit requires --task")),
          ...(input.session_id ? { session_id: input.session_id } : {}),
          execution_lock: executionLockInput(adapter.model, gateway, repoRoot, configDir)
        });
        return outcomeEnvelope(
          input.action,
          result,
          store.getExecutionLock(result.run_id).digest,
          adapter
        );
      } finally {
        store.close();
      }
    } catch (error) {
      throw adapter.redactError(error);
    }
  }

  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const inspectGateway = createReadOnlyGateway(store);
    if (input.action === "inspect") {
      return inspectEnvelope(input, new KernelRuntime(store, inspectGateway, unavailableLoopFactory()));
    }

    const runId = required(input.run_id, "vnext run continue requires --run-id");
    const inspection = store.inspectRun(runId);
    if (!inspection) return notFoundEnvelope(input.action, { run_id: runId });
    const lock = store.getExecutionLock(runId);
    const { gateway, orchestration } = compositionForExecutionLock(store, lock);
    assertContinuationSelectors(lock, repoRoot, configDir);
    const adapter = await loadAdapter({
      config_dir: configDir,
      state_root: stateRoot,
      model_id: lock.model.config_id
    });
    adapter.assertCredentialBinding(lock);
    try {
      const loops = adapter.createLoopFactory({
        store,
        override: dependencies.create_loop_factory
      });
      const result = await new KernelRuntime(
        store,
        gateway,
        loops,
        orchestration ? { orchestration } : {}
      ).continueRun(runId);
      return outcomeEnvelope(input.action, result, lock.digest, adapter);
    } catch (error) {
      throw adapter.redactError(error);
    }
  } finally {
    store.close();
  }
}

export function vnextRunErrorEnvelope(
  error: unknown,
  action: VNextRunAction | null
): VNextRunEnvelope {
  return {
    vnext: {
      schema_version: 1,
      marker: VNEXT_RUN_MARKER,
      surface: "cli",
      action,
      status: "error",
      diagnostic: {
        code: diagnosticCode(error),
        message: error instanceof Error ? error.message : String(error)
      },
      boundary: stableBoundary()
    }
  };
}

function inspectEnvelope(input: VNextRunRequest, runtime: KernelRuntime): VNextRunEnvelope {
  const runId = input.run_id?.trim();
  const sessionId = input.session_id?.trim();
  if (Boolean(runId) === Boolean(sessionId)) {
    throw new Error("vnext run inspect requires exactly one of --run-id or --session-id");
  }
  if (runId) {
    const inspection = runtime.inspect(runId);
    return inspection
      ? {
        vnext: {
          schema_version: 1,
          marker: VNEXT_RUN_MARKER,
          surface: "cli",
          action: "inspect",
          status: inspection.status,
          run_id: inspection.id,
          turn_id: inspection.turn_id,
          session_id: inspection.session_id,
          execution_lock_digest: inspection.execution_lock_digest,
          result: inspection,
          boundary: stableBoundary()
        }
      }
      : notFoundEnvelope("inspect", { run_id: runId });
  }
  const inspection = runtime.inspectSession(sessionId!);
  return inspection
    ? {
      vnext: {
        schema_version: 1,
        marker: VNEXT_RUN_MARKER,
        surface: "cli",
        action: "inspect",
        status: inspection.active_run_status ?? "completed",
        session_id: inspection.id,
        result: inspection,
        boundary: stableBoundary()
      }
    }
    : notFoundEnvelope("inspect", { session_id: sessionId });
}

function outcomeEnvelope(
  action: VNextRunAction,
  result: RunExecutionResult,
  executionLockDigest: string,
  adapter: Pick<LegacyConfigPiAdapter, "redact">
): VNextRunEnvelope {
  return {
    vnext: {
      schema_version: 1,
      marker: VNEXT_RUN_MARKER,
      surface: "cli",
      action,
      status: result.status,
      run_id: result.run_id,
      turn_id: result.turn_id,
      session_id: result.session_id,
      execution_lock_digest: executionLockDigest,
      result: {
        answer: result.answer === null ? null : adapter.redact(result.answer),
        error: result.error === null ? null : adapter.redact(result.error)
      },
      boundary: stableBoundary()
    }
  };
}

function notFoundEnvelope(
  action: VNextRunAction,
  identity: { run_id?: string; session_id?: string }
): VNextRunEnvelope {
  return {
    vnext: {
      schema_version: 1,
      marker: VNEXT_RUN_MARKER,
      surface: "cli",
      action,
      status: "not_found",
      ...identity,
      diagnostic: {
        code: identity.session_id ? "session_not_found" : "run_not_found",
        message: "Requested vNext identity was not found."
      },
      boundary: stableBoundary()
    }
  };
}

function executionLockInput(
  model: ResolvedVNextModel,
  gateway: ActionGateway,
  cwd: string,
  configDir: string
): ExecutionLockInput {
  return {
    model: {
      config_id: model.config_id,
      provider: model.provider,
      api: model.api === "responses" ? "openai-responses" : "openai-completions",
      base_url: model.base_url,
      model: model.model,
      credential_ref: model.credential_ref,
      reasoning_effort: model.reasoning_effort,
      context_window_tokens: model.context_window_tokens,
      max_output_tokens: model.max_output_tokens,
      timeout_ms: model.timeout_ms
    },
    authority: { cwd },
    configuration: {
      selector: "active_model",
      source_refs: [
        "config:active_model",
        `config_dir:${configDir}`,
        `models:${model.config_id}`,
        `auth:${model.credential_ref}`
      ]
    },
    actions: executionLockActions(gateway.contracts())
  };
}

export function assertContinuationSelectors(
  lock: ExecutionLock,
  repoRoot: string,
  configDir: string
): void {
  if (lock.authority.cwd !== repoRoot
    || !lock.configuration.source_refs.includes(`config_dir:${configDir}`)) {
    throw new ExecutionLockMismatchError(
      `Continuation selectors changed for immutable Execution Lock: ${lock.digest}`
    );
  }
}

function unavailableLoopFactory(): AgentLoopFactory {
  return {
    create: () => ({ execute: async () => { throw new Error("inspect does not execute a model loop"); } })
  };
}

function diagnosticCode(error: unknown): VNextRunDiagnosticCode {
  if (error instanceof RuntimeSessionNotFoundError) return "session_not_found";
  if (error instanceof RuntimeSessionBusyError) return "session_busy";
  if (error instanceof ExecutionLockMismatchError) return "execution_lock_mismatch";
  if (error instanceof RuntimeSchemaIncompatibleError) return "schema_incompatible";
  if (error instanceof RuntimeStateProfileIncompatibleError) return "schema_incompatible";
  if (isRecord(error) && error.code === "credential_unavailable") return "credential_unavailable";
  const message = error instanceof Error ? error.message : String(error);
  if (/recovery evidence|continuation evidence|recovery lineage/iu.test(message)) {
    return "recovery_evidence_mismatch";
  }
  if (/requires|invalid|must /iu.test(message)) return "invalid_input";
  return "run_error";
}

function required(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function stableBoundary(): string {
  return "Stable vNext Supervisor CLI; isolated SQLite, immutable Execution Locks, discussion, single-writer execution, and independent read-only Reviewer Workers are available.";
}

function createReadOnlyGateway(store: SqliteRuntimeStore): ActionGateway {
  return new ActionGateway(store, [createRuntimeInspectAction(store)]);
}

interface SupervisorCompositionCapabilities {
  needs_input: boolean;
  execution: boolean;
  review: boolean;
}

function createSupervisorComposition(
  store: SqliteRuntimeStore,
  capabilities: SupervisorCompositionCapabilities
): { gateway: ActionGateway; orchestration: OrchestrationEngine } {
  const runtimeInspect = createRuntimeInspectAction(store);
  const workerNeedsInputContract = capabilities.needs_input ? [WORKER_NEEDS_INPUT_CONTRACT] : [];
  const orchestration = new OrchestrationEngine(store, [
    runtimeInspect.contract,
    ...workerNeedsInputContract
  ]);
  const handlers = [
    runtimeInspect,
    createDiscussionWorkerDispatchAction(orchestration),
    ...(capabilities.execution ? [createExecutionWorkerDispatchAction(orchestration)] : []),
    ...(capabilities.review ? [createReviewWorkerDispatchAction(orchestration)] : []),
    createWorkerInspectAction(orchestration),
    ...(capabilities.needs_input ? [createWorkerNeedsInputAction(orchestration)] : [])
  ];
  return { gateway: new ActionGateway(store, handlers, {
    allowed_effect_classes: [
      "none",
      "local_read",
      "external_read",
      ...(capabilities.execution ? ["local_write" as const] : [])
    ]
  }), orchestration };
}

function compositionForExecutionLock(
  store: SqliteRuntimeStore,
  lock: ExecutionLock
): { gateway: ActionGateway; orchestration?: OrchestrationEngine } {
  const actionNames = lock.actions.map((action) => action.name).sort();
  if (JSON.stringify(actionNames) === JSON.stringify(["runtime_inspect"])) {
    return { gateway: createReadOnlyGateway(store) };
  }
  return createSupervisorComposition(store, {
    needs_input: actionNames.includes("worker_needs_input"),
    execution: actionNames.includes("worker_execution_dispatch"),
    review: actionNames.includes("worker_review_dispatch")
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}
