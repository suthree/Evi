import { channel } from "node:diagnostics_channel";
import { resolve } from "node:path";
import {
  ActionGateway,
  createResponsesCompatiblePiLoopFactory,
  createRuntimeInspectAction,
  executionLockActions,
  KernelRuntime,
  materializeExecutionLock,
  SqliteRuntimeStore,
  type AgentLoopFactory,
  type ExecutionLock,
  type ExecutionLockInput,
  type RunExecutionResult,
  type RunInspection
} from "../../../packages/kernel/src/index.js";
import {
  resolveIsolatedVNextSqlite,
  type VNextStatePathBoundary
} from "./vnext_state.js";

export const VNEXT_CANARY_MARKER = "vnext_readonly_ingress_canary";
export const VNEXT_CANARY_DIAGNOSTIC_CHANNEL =
  "local-runtime.vnext_readonly_ingress_canary.dispatch";

const vnextCanaryDispatch = channel(VNEXT_CANARY_DIAGNOSTIC_CHANNEL);

export type VNextCanaryAction = "submit" | "continue" | "inspect";

export interface VNextCanaryRequest {
  action: VNextCanaryAction;
  sqlite: string;
  task?: string;
  run_id?: string;
  base_url?: string;
  model?: string;
  api_key_env?: string;
}

export interface VNextCanaryEnvelope {
  canary: {
    marker: typeof VNEXT_CANARY_MARKER;
    surface: "cli";
    action: VNextCanaryAction | null;
    status: "running" | "waiting" | "completed" | "paused" | "failed" | "not_found" | "error";
    run_id?: string;
    turn_id?: string;
    session_id?: string;
    result?: RunInspection | { answer: string | null; error: string | null };
    diagnostic?: { code: string; message: string };
    boundary: string;
  };
}

export interface VNextCanaryDependencies {
  loop_factory?: AgentLoopFactory;
  execution_lock?: ExecutionLockInput;
  cwd?: string;
  path_boundary?: VNextStatePathBoundary;
}

export async function executeVNextCanary(
  input: VNextCanaryRequest,
  dependencies: VNextCanaryDependencies = {}
): Promise<VNextCanaryEnvelope> {
  const action = input.action;
  vnextCanaryDispatch.publish({
    marker: VNEXT_CANARY_MARKER,
    surface: "cli",
    action
  });
  const sqlite = await resolveCanarySqlite(input.sqlite, dependencies.path_boundary);
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "diagnostic_canary" });
  try {
    const gateway = new ActionGateway(store, [createRuntimeInspectAction(store)]);
    if (action === "inspect") {
      const runId = requireRunId(input.run_id);
      const inspection = new KernelRuntime(store, gateway, unavailableLoopFactory()).inspect(runId);
      return inspection
        ? envelope(action, inspection.status, inspection.id, inspection.turn_id, inspection.session_id, inspection)
        : envelope(action, "not_found", runId);
    }

    const lock = action === "continue"
      ? store.getExecutionLock(requireRunId(input.run_id))
      : null;
    if (!dependencies.loop_factory && action === "continue") {
      assertCanarySelectorsMatchLock(input, lock!, gateway, dependencies.cwd);
    }
    const loops = dependencies.loop_factory ?? createCanaryLoopFactory(input, store);
    const runtime = new KernelRuntime(store, gateway, loops);
    const result = action === "submit"
      ? await runtime.submit({
        request: redact(requireTask(input.task), credential(input.api_key_env)),
        execution_lock: canaryExecutionLockInput(input, gateway, dependencies)
      })
      : await runtime.continueRun(requireRunId(input.run_id));
    return envelopeFromResult(action, result, credential(input.api_key_env));
  } finally {
    store.close();
  }
}

export function canaryErrorEnvelope(
  error: unknown,
  action: VNextCanaryAction | null,
  apiKeyEnv?: string
): VNextCanaryEnvelope {
  const secret = apiKeyEnv ? process.env[apiKeyEnv] : undefined;
  const message = redact(error instanceof Error ? error.message : String(error), secret);
  return {
    canary: {
      marker: VNEXT_CANARY_MARKER,
      surface: "cli",
      action,
      status: "error",
      diagnostic: { code: "canary_error", message },
      boundary: "Explicit vNext canary diagnostic; no v0.2 config or state was used."
    }
  };
}

function createCanaryLoopFactory(
  input: VNextCanaryRequest,
  store: SqliteRuntimeStore
): AgentLoopFactory {
  const apiKeyEnv = required(
    input.api_key_env,
    "vnext canary submit|continue requires --api-key-env"
  );
  return {
    create(runtimeInput) {
      return createResponsesCompatiblePiLoopFactory({
        store,
        execution_lock: runtimeInput.execution_lock,
        api_key_env: apiKeyEnv,
        system_prompt: "You are a concise read-only canary agent. Use only the registered local inspection tool when needed."
      }).create(runtimeInput);
    }
  };
}

function canaryExecutionLockInput(
  input: VNextCanaryRequest,
  gateway: ActionGateway,
  dependencies: VNextCanaryDependencies
): ExecutionLockInput {
  if (dependencies.execution_lock) return dependencies.execution_lock;
  return {
    model: {
      config_id: "canary-cli-explicit",
      provider: "readonly-canary-responses",
      api: "openai-responses",
      base_url: required(input.base_url, "vnext canary submit|continue requires --base-url"),
      model: required(input.model, "vnext canary submit|continue requires --model"),
      credential_ref: required(
        input.api_key_env,
        "vnext canary submit|continue requires --api-key-env"
      ),
      reasoning_effort: null,
      context_window_tokens: 128_000,
      max_output_tokens: 16_384,
      timeout_ms: 120_000
    },
    authority: { cwd: resolve(dependencies.cwd ?? process.cwd()) },
    configuration: {
      selector: "canary_cli_explicit",
      source_refs: ["cli:vnext-canary"]
    },
    actions: executionLockActions(gateway.contracts())
  };
}

function assertCanarySelectorsMatchLock(
  input: VNextCanaryRequest,
  lock: ExecutionLock,
  gateway: ActionGateway,
  cwd?: string
): void {
  const candidate = materializeExecutionLock(
    canaryExecutionLockInput(input, gateway, { cwd }),
    lock.created_at
  );
  if (candidate.digest !== lock.digest) {
    throw new Error("vNext canary continuation selectors do not match the immutable Execution Lock.");
  }
}

async function resolveCanarySqlite(
  value: string,
  boundary?: VNextCanaryDependencies["path_boundary"]
): Promise<string> {
  return resolveIsolatedVNextSqlite(value, {
    missing: "vnext canary requires --sqlite with an absolute independent SQLite path",
    relative: "Canary --sqlite must be an absolute path.",
    overlap: "Canary --sqlite must not overlap the default v0.2 shared state root.",
    symlink_limit: "Canary --sqlite contains too many symbolic links."
  }, boundary);
}

function requireTask(value: string | undefined): string {
  return required(value, "vnext canary submit requires --task");
}

function requireRunId(value: string | undefined): string {
  return required(value, "vnext canary continue|inspect requires --run-id");
}

function required(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function unavailableLoopFactory(): AgentLoopFactory {
  return { create: () => ({ execute: async () => { throw new Error("inspect does not execute a model loop"); } }) };
}

function envelopeFromResult(
  action: VNextCanaryAction,
  result: RunExecutionResult,
  secret?: string
): VNextCanaryEnvelope {
  return envelope(
    action,
    result.status,
    result.run_id,
    result.turn_id,
    result.session_id,
    { answer: result.answer, error: result.error === null ? null : redact(result.error, secret) }
  );
}

function envelope(
  action: VNextCanaryAction,
  status: "running" | "waiting" | "completed" | "paused" | "failed" | "not_found",
  runId?: string,
  turnId?: string,
  sessionId?: string,
  result?: RunInspection | { answer: string | null; error: string | null }
): VNextCanaryEnvelope {
  return {
    canary: {
      marker: VNEXT_CANARY_MARKER,
      surface: "cli",
      action,
      status,
      ...(runId ? { run_id: runId } : {}),
      ...(turnId ? { turn_id: turnId } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(result ? { result } : {}),
      boundary: "Explicit opt-in vNext read-only canary; only isolated SQLite and none/local_read Actions are available."
    }
  };
}

function redact(message: string, secret?: string): string {
  return secret ? message.replaceAll(secret, "[redacted]") : message;
}

function credential(apiKeyEnv?: string): string | undefined {
  return apiKeyEnv ? process.env[apiKeyEnv] : undefined;
}
