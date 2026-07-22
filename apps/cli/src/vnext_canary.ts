import { channel } from "node:diagnostics_channel";
import { lstat, readlink, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import {
  ActionGateway,
  createResponsesCompatiblePiLoopFactory,
  createRuntimeInspectAction,
  KernelRuntime,
  SqliteRuntimeStore,
  type AgentLoopFactory,
  type RunExecutionResult,
  type RunInspection
} from "../../../packages/kernel/src/index.js";
import { DEFAULT_SHARED_STATE_ROOT } from "../../../packages/runtime/src/config.js";

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
    status: "running" | "completed" | "paused" | "failed" | "not_found" | "error";
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
  cwd?: string;
  path_boundary?: {
    forbidden_v02_root: string;
    canonicalize_candidate?: (path: string) => Promise<string>;
    canonicalize_forbidden_root?: (path: string) => Promise<string>;
    case_insensitive?: boolean;
  };
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
  const store = new SqliteRuntimeStore(sqlite);
  try {
    const gateway = new ActionGateway(store, [createRuntimeInspectAction(store)]);
    if (action === "inspect") {
      const runId = requireRunId(input.run_id);
      const inspection = new KernelRuntime(store, gateway, unavailableLoopFactory()).inspect(runId);
      return inspection
        ? envelope(action, inspection.status, inspection.id, inspection.turn_id, inspection.session_id, inspection)
        : envelope(action, "not_found", runId);
    }

    const loops = dependencies.loop_factory ?? createCanaryLoopFactory(input, store, dependencies.cwd);
    const runtime = new KernelRuntime(store, gateway, loops);
    const result = action === "submit"
      ? await runtime.submit({ request: redact(requireTask(input.task), credential(input.api_key_env)) })
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
  store: SqliteRuntimeStore,
  cwd = process.cwd()
): AgentLoopFactory {
  return createResponsesCompatiblePiLoopFactory({
    store,
    base_url: required(input.base_url, "vnext canary submit|continue requires --base-url"),
    model: required(input.model, "vnext canary submit|continue requires --model"),
    api_key_env: required(input.api_key_env, "vnext canary submit|continue requires --api-key-env"),
    cwd,
    system_prompt: "You are a concise read-only canary agent. Use only the registered local inspection tool when needed."
  });
}

async function resolveCanarySqlite(
  value: string,
  boundary?: VNextCanaryDependencies["path_boundary"]
): Promise<string> {
  if (!value?.trim()) throw new Error("vnext canary requires --sqlite with an absolute independent SQLite path");
  if (!isAbsolute(value)) throw new Error("Canary --sqlite must be an absolute path.");
  const requested = resolve(value);
  const v02Root = resolve(
    boundary?.forbidden_v02_root
      ?? resolve(homedir(), DEFAULT_SHARED_STATE_ROOT.replace(/^~\//, ""))
  );
  const caseInsensitive = boundary?.case_insensitive ?? process.platform === "darwin";
  if (overlaps(dirname(requested), v02Root, caseInsensitive)) {
    throw new Error("Canary --sqlite must not overlap the default v0.2 shared state root.");
  }
  const physicalV02Root = resolve(await (
    boundary?.canonicalize_forbidden_root ?? canonicalizeDeclaredPath
  )(v02Root));
  const forbiddenRoots = uniquePathIdentities([v02Root, physicalV02Root], caseInsensitive);
  if (forbiddenRoots.some((root) => overlaps(dirname(requested), root, caseInsensitive))) {
    throw new Error("Canary --sqlite must not overlap the default v0.2 shared state root.");
  }
  const sqlite = boundary?.canonicalize_candidate
    ? resolve(await boundary.canonicalize_candidate(requested))
    : await canonicalizeCandidatePath(requested, forbiddenRoots, caseInsensitive);
  const sqliteDirectory = dirname(sqlite);
  if (forbiddenRoots.some((root) => overlaps(sqliteDirectory, root, caseInsensitive))) {
    throw new Error("Canary --sqlite must not overlap the default v0.2 shared state root.");
  }
  return sqlite;
}

async function canonicalizeDeclaredPath(path: string): Promise<string> {
  let existing = resolve(path);
  const missing: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(existing), ...missing.reverse());
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      missing.push(basename(existing));
      existing = parent;
    }
  }
}

async function canonicalizeCandidatePath(
  path: string,
  forbiddenRoots: string[],
  caseInsensitive: boolean
): Promise<string> {
  let current = "/";
  const pending = resolve(path).split("/").filter(Boolean);
  let followedLinks = 0;
  while (pending.length > 0) {
    const component = pending.shift()!;
    const next = resolve(current, component);
    assertOutsideForbiddenRoots(next, forbiddenRoots, caseInsensitive);
    try {
      const metadata = await lstat(next);
      if (!metadata.isSymbolicLink()) {
        current = next;
        continue;
      }
      followedLinks += 1;
      if (followedLinks > 40) throw new Error("Canary --sqlite contains too many symbolic links.");
      const link = await readlink(next);
      const target = resolve(dirname(next), link);
      assertOutsideForbiddenRoots(target, forbiddenRoots, caseInsensitive);
      pending.unshift(...target.split("/").filter(Boolean));
      current = "/";
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const unresolved = resolve(next, ...pending);
      assertOutsideForbiddenRoots(unresolved, forbiddenRoots, caseInsensitive);
      return unresolved;
    }
  }
  return current;
}

function assertOutsideForbiddenRoots(
  path: string,
  forbiddenRoots: string[],
  caseInsensitive: boolean
): void {
  if (forbiddenRoots.some((root) => isWithin(path, root, caseInsensitive))) {
    throw new Error("Canary --sqlite must not overlap the default v0.2 shared state root.");
  }
}

function uniquePathIdentities(paths: string[], caseInsensitive: boolean): string[] {
  const identities = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const identity = normalizedPathIdentity(path, caseInsensitive);
    if (identities.has(identity)) continue;
    identities.add(identity);
    result.push(resolve(path));
  }
  return result;
}

function overlaps(left: string, right: string, caseInsensitive: boolean): boolean {
  return isWithin(left, right, caseInsensitive) || isWithin(right, left, caseInsensitive);
}

function isWithin(path: string, root: string, caseInsensitive: boolean): boolean {
  const difference = relative(
    normalizedPathIdentity(root, caseInsensitive),
    normalizedPathIdentity(path, caseInsensitive)
  );
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

function normalizedPathIdentity(path: string, caseInsensitive: boolean): string {
  const normalized = resolve(path).normalize("NFC");
  return caseInsensitive ? normalized.toLowerCase() : normalized;
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
  status: "running" | "completed" | "paused" | "failed" | "not_found",
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
