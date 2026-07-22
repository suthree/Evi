import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import type { ActionEffectClass, ActionToolContract } from "./action_types.js";
import type {
  ExecutionLock,
  ExecutionLockAction,
  ExecutionLockInput
} from "./contracts.js";

const LOCK_SCHEMA_VERSION = 1;
const MAX_IDENTIFIER_LENGTH = 240;
const MAX_SOURCE_REFS = 32;

export class ExecutionLockMismatchError extends Error {
  readonly code = "execution_lock_mismatch";

  constructor(message: string) {
    super(message);
    this.name = "ExecutionLockMismatchError";
  }
}

export function materializeExecutionLock(
  input: ExecutionLockInput,
  createdAt = new Date().toISOString()
): ExecutionLock {
  const normalized = normalizeExecutionLockInput(input);
  const digest = executionLockDigest(normalized);
  return {
    schema_version: LOCK_SCHEMA_VERSION,
    ...normalized,
    digest,
    created_at: validTimestamp(createdAt)
  };
}

export function parseExecutionLock(input: unknown): ExecutionLock {
  if (!isRecord(input) || input.schema_version !== LOCK_SCHEMA_VERSION) {
    throw new Error("Execution Lock schema is invalid.");
  }
  const normalized = normalizeExecutionLockInput(input as unknown as ExecutionLockInput);
  const digest = executionLockDigest(normalized);
  if (input.digest !== digest) throw new Error("Execution Lock digest is invalid.");
  return {
    schema_version: LOCK_SCHEMA_VERSION,
    ...normalized,
    digest,
    created_at: validTimestamp(input.created_at)
  };
}

export function executionLockActions(contracts: ActionToolContract[]): ExecutionLockAction[] {
  return contracts.map((contract) => ({
    name: contract.name,
    version: contract.version,
    effect_class: contract.effect_class
  }));
}

export function assertExecutionLockMatchesContracts(
  input: ExecutionLockInput | ExecutionLock,
  contracts: ActionToolContract[]
): void {
  const expected = normalizeActions(executionLockActions(contracts));
  const actual = normalizeActions(input.actions);
  if (stableJson(actual) !== stableJson(expected)) {
    throw new ExecutionLockMismatchError(
      "Execution Lock Action contracts do not match the Action Gateway."
    );
  }
}

export function executionLockAllowsAction(
  lock: ExecutionLock,
  contract: Pick<ActionToolContract, "name" | "version" | "effect_class">
): boolean {
  return lock.actions.some((action) => action.name === contract.name
    && action.version === contract.version
    && action.effect_class === contract.effect_class);
}

function normalizeExecutionLockInput(input: ExecutionLockInput): ExecutionLockInput {
  if (!isRecord(input)) throw new Error("Execution Lock input is invalid.");
  const model = record(input.model, "Execution Lock model");
  const authority = record(input.authority, "Execution Lock authority");
  const configuration = record(input.configuration, "Execution Lock configuration");
  const baseUrl = absoluteHttpUrl(model.base_url);
  const cwd = boundedIdentifier(authority.cwd, "Execution Lock cwd", 2_000);
  if (!isAbsolute(cwd)) throw new Error("Execution Lock cwd must be absolute.");
  const reasoningEffort = nullableIdentifier(model.reasoning_effort, "Execution Lock reasoning effort");
  if (reasoningEffort !== null
    && !["minimal", "low", "medium", "high", "xhigh", "max"].includes(reasoningEffort)) {
    throw new Error("Execution Lock reasoning effort is unsupported.");
  }
  const api = boundedIdentifier(model.api, "Execution Lock model API");
  const sourceRefs = array(configuration.source_refs, "Execution Lock configuration source refs")
    .map((value) => boundedIdentifier(value, "Execution Lock configuration source ref"));
  if (sourceRefs.length === 0 || sourceRefs.length > MAX_SOURCE_REFS) {
    throw new Error("Execution Lock configuration source refs are invalid.");
  }
  return {
    model: {
      config_id: boundedIdentifier(model.config_id, "Execution Lock model config id"),
      provider: boundedIdentifier(model.provider, "Execution Lock provider"),
      api,
      base_url: baseUrl,
      model: boundedIdentifier(model.model, "Execution Lock model"),
      credential_ref: boundedIdentifier(model.credential_ref, "Execution Lock credential ref"),
      reasoning_effort: reasoningEffort,
      context_window_tokens: positiveInteger(model.context_window_tokens, "Execution Lock context window"),
      max_output_tokens: positiveInteger(model.max_output_tokens, "Execution Lock max output tokens"),
      timeout_ms: positiveInteger(model.timeout_ms, "Execution Lock timeout")
    },
    authority: { cwd: resolve(cwd) },
    configuration: {
      selector: boundedIdentifier(configuration.selector, "Execution Lock configuration selector"),
      source_refs: [...new Set(sourceRefs)].sort()
    },
    actions: normalizeActions(array(input.actions, "Execution Lock actions"))
  };
}

function normalizeActions(input: ExecutionLockAction[]): ExecutionLockAction[] {
  const actions = input.map((raw) => {
    const action = record(raw, "Execution Lock Action");
    const effectClass = action.effect_class as ActionEffectClass;
    if (effectClass !== "none"
      && effectClass !== "local_read"
      && effectClass !== "local_write"
      && effectClass !== "external_read"
      && effectClass !== "external_write") {
      throw new Error("Execution Lock Action effect class is invalid.");
    }
    return {
      name: boundedIdentifier(action.name, "Execution Lock Action name", 80),
      version: boundedIdentifier(action.version, "Execution Lock Action version", 20),
      effect_class: effectClass
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(actions.map((action) => action.name)).size !== actions.length) {
    throw new Error("Execution Lock Action names must be unique.");
  }
  return actions;
}

function executionLockDigest(input: ExecutionLockInput): string {
  return createHash("sha256").update(stableJson({
    schema_version: LOCK_SCHEMA_VERSION,
    ...input
  })).digest("hex");
}

function absoluteHttpUrl(input: unknown): string {
  const value = boundedIdentifier(input, "Execution Lock base URL", 2_000);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Execution Lock base URL must be an absolute HTTP(S) URL.");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:")
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new Error(
      "Execution Lock base URL must be an absolute HTTP(S) URL without credentials, query, or fragment."
    );
  }
  return url.toString().replace(/\/$/u, "");
}

function boundedIdentifier(input: unknown, label: string, max = MAX_IDENTIFIER_LENGTH): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const value = input.trim();
  if (!value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function nullableIdentifier(input: unknown, label: string): string | null {
  if (input === null) return null;
  return boundedIdentifier(input, label);
}

function positiveInteger(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input <= 0) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function validTimestamp(input: unknown): string {
  if (typeof input !== "string" || !input || Number.isNaN(Date.parse(input))) {
    throw new Error("Execution Lock timestamp is invalid.");
  }
  return input;
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${label} is invalid.`);
  return input;
}

function array<T>(input: unknown, label: string): T[] {
  if (!Array.isArray(input)) throw new Error(`${label} are invalid.`);
  return input as T[];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function stableJson(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(stableJson).join(",")}]`;
  if (isRecord(input)) {
    return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`).join(",")}}`;
  }
  return JSON.stringify(input);
}
