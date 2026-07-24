import { createHmac } from "node:crypto";
import {
  createLockedOpenAICompatiblePiLoopFactory,
  ExecutionLockMismatchError,
  type AgentLoopFactory,
  type ExecutionLock,
  type SqliteRuntimeStore
} from "../../../packages/kernel/src/index.js";
import { loadConfig, type RuntimeConfig } from "../../../packages/runtime/src/config.js";

/**
 * The safe model identity that vNext code may persist, compare, or inject.
 *
 * This deliberately excludes the legacy runtime credential. The raw key stays
 * inside this adapter's closure while it constructs a Pi loop or redacts text.
 */
export interface ResolvedVNextModel {
  config_id: string;
  provider: string;
  api: "chat_completions" | "responses";
  base_url: string;
  model: string;
  credential_ref: string;
  reasoning_effort: string | null;
  context_window_tokens: number;
  max_output_tokens: number;
  timeout_ms: number;
}

export interface LegacyConfigPiAdapterLoadInput {
  config_dir: string;
  state_root: string;
  model_id?: string;
}

export type PiLoopFactoryOverride = (input: {
  store: SqliteRuntimeStore;
  model: ResolvedVNextModel;
}) => AgentLoopFactory;

/**
 * A compatibility seam for the legacy local config loader.
 *
 * vNext callers receive only a safe identity and operations that need the
 * credential. They never receive the credential itself or a configuration
 * object that contains it.
 */
export interface LegacyConfigPiAdapter {
  readonly model: ResolvedVNextModel;
  createLoopFactory(input: {
    store: SqliteRuntimeStore;
    override?: PiLoopFactoryOverride;
  }): AgentLoopFactory;
  assertCredentialBinding(lock: ExecutionLock): void;
  redact(value: string): string;
  redactError(error: unknown): unknown;
}

export async function loadLegacyConfigPiAdapter(
  input: LegacyConfigPiAdapterLoadInput
): Promise<LegacyConfigPiAdapter> {
  let config: RuntimeConfig;
  try {
    config = await loadConfig({
      configDir: input.config_dir,
      stateRoot: input.state_root,
      ...(input.model_id ? { modelId: input.model_id } : {})
    });
  } catch (error) {
    if (error instanceof Error && /auth|api key|credential|environment variable/iu.test(error.message)) {
      throw credentialUnavailableError();
    }
    throw error;
  }
  return legacyConfigPiAdapter(config.model);
}

function legacyConfigPiAdapter(model: RuntimeConfig["model"]): LegacyConfigPiAdapter {
  const apiKey = model.api_key.trim();
  if (!apiKey) throw credentialUnavailableError();
  const baseUrl = safeBaseUrl(model.base_url);
  const credentialRef = credentialIdentity(model.auth_id, apiKey);
  const resolvedModel: ResolvedVNextModel = {
    config_id: model.id,
    provider: model.provider,
    api: model.api,
    base_url: baseUrl,
    model: model.model,
    credential_ref: credentialRef,
    reasoning_effort: model.reasoning_effort ?? null,
    context_window_tokens: model.context_window_tokens ?? 128_000,
    max_output_tokens: model.max_output_tokens,
    timeout_ms: model.timeout_ms
  };
  return {
    model: resolvedModel,
    createLoopFactory({ store, override }) {
      const injected = override?.({ store, model: resolvedModel });
      if (injected) return injected;
      return {
        create(input) {
          return createLockedOpenAICompatiblePiLoopFactory({
            store,
            execution_lock: input.execution_lock,
            api_key: apiKey,
            system_prompt: "You are a concise, reliable, read-only local agent. Use only registered local inspection Actions when needed."
          }).create(input);
        }
      };
    },
    assertCredentialBinding(lock) {
      // A pre-adapter persisted lock remains immutable, but it cannot carry a
      // URL form that would place credentials or selectors into Pi transport.
      safeBaseUrl(lock.model.base_url);
      if (lock.model.config_id !== resolvedModel.config_id
        || (lock.model.credential_ref !== credentialRef
          && !matchesSafeLegacyCredentialReference(lock.model.credential_ref, model.auth_id, apiKey))) {
        throw new ExecutionLockMismatchError(
          `Configured credential binding changed for immutable Execution Lock: ${lock.digest}`
        );
      }
    },
    redact(value) {
      return redact(value, apiKey);
    },
    redactError(error) {
      if (!(error instanceof Error)) return redact(String(error), apiKey);
      const message = redact(error.message, apiKey);
      if (message === error.message) return error;
      Object.defineProperty(error, "message", { configurable: true, value: message });
      return error;
    }
  };
}

function credentialUnavailableError(): Error {
  const unavailable = new Error("Configured model credential is unavailable.");
  Object.assign(unavailable, { code: "credential_unavailable" });
  return unavailable;
}

function redact(value: string, secret: string): string {
  return value.replaceAll(secret, "[redacted]");
}

function safeBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Configured model base URL is invalid.");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:")
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new Error(
      "Configured model base URL must be an absolute HTTP(S) URL without credentials, query, or fragment."
    );
  }
  return url.toString().replace(/\/$/u, "");
}

function credentialIdentity(authId: string, apiKey: string): string {
  return `legacy-config-auth-hmac-sha256:${createHmac("sha256", apiKey).update(authId).digest("hex")}`;
}

function matchesSafeLegacyCredentialReference(
  persistedReference: string,
  configuredReference: string,
  apiKey: string
): boolean {
  return persistedReference === configuredReference
    && safeLegacyAuthId(persistedReference)
    && !persistedReference.includes(apiKey);
}

/**
 * Legacy locks predate the opaque HMAC reference. Accept only the compact
 * auth-id form that legacy config records were expected to use; never treat a
 * URL, selector, whitespace-bearing value, or credential material as an id.
 */
function safeLegacyAuthId(reference: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(reference)
    && !/[\s\u0000-\u001f\u007f]/u.test(reference);
}
