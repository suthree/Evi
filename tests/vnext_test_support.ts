import {
  ExecutionLockMismatchError,
  type ActionToolContract,
  type AgentLoopFactory,
  type ExecutionLock,
  type ExecutionLockInput,
  type SqliteRuntimeStore
} from "../packages/kernel/src/index.js";
import type {
  LegacyConfigPiAdapter,
  PiLoopFactoryOverride,
  ResolvedVNextModel
} from "../apps/cli/src/vnext_legacy_config_pi_adapter.js";

interface TestModelIdentity {
  id: string;
  api: string;
  provider: string;
  baseUrl: string;
  contextWindow: number;
  maxTokens: number;
}

export function testExecutionLock(input: {
  cwd: string;
  contracts?: ActionToolContract[];
  model?: TestModelIdentity;
  provider?: string;
  model_id?: string;
  configuration_source_refs?: string[];
}): ExecutionLockInput {
  const provider = input.model?.provider ?? input.provider ?? "test-provider";
  const modelId = input.model?.id ?? input.model_id ?? "test-model";
  return {
    model: {
      config_id: `test-${modelId}`,
      provider,
      api: input.model?.api ?? "openai-completions",
      base_url: input.model?.baseUrl ?? "https://provider.example.test/v1",
      model: modelId,
      credential_ref: "test-credential",
      reasoning_effort: null,
      context_window_tokens: input.model?.contextWindow ?? 128_000,
      max_output_tokens: input.model?.maxTokens ?? 2_400,
      timeout_ms: 120_000
    },
    authority: { cwd: input.cwd },
    configuration: {
      selector: "test-model",
      source_refs: input.configuration_source_refs ?? ["test:model", "test:credential"]
    },
    actions: (input.contracts ?? []).map((contract) => ({
      name: contract.name,
      version: contract.version,
      effect_class: contract.effect_class
    }))
  };
}

/**
 * Test-only adapter that models the production adapter's opaque credential
 * closure. vNext dependency injection receives only its non-secret model view.
 */
export function testLegacyConfigPiAdapter(input: {
  model: ResolvedVNextModel;
  secret: string;
}): LegacyConfigPiAdapter {
  const secret = input.secret.trim();
  return {
    model: input.model,
    createLoopFactory({ store, override }) {
      const factory = requiredFactory(override);
      return factory({ store, model: input.model });
    },
    assertCredentialBinding(lock) {
      if (lock.model.config_id !== input.model.config_id
        || lock.model.credential_ref !== input.model.credential_ref) {
        throw new ExecutionLockMismatchError(
          `Configured credential binding changed for immutable Execution Lock: ${lock.digest}`
        );
      }
    },
    redact(value) {
      return secret ? value.replaceAll(secret, "[redacted]") : value;
    },
    redactError(error) {
      if (!(error instanceof Error)) return secret ? String(error).replaceAll(secret, "[redacted]") : String(error);
      const message = secret ? error.message.replaceAll(secret, "[redacted]") : error.message;
      if (message === error.message) return error;
      Object.defineProperty(error, "message", { configurable: true, value: message });
      return error;
    }
  };
}

function requiredFactory(override: PiLoopFactoryOverride | undefined): PiLoopFactoryOverride {
  if (override) return override;
  return (_input: { store: SqliteRuntimeStore; model: ResolvedVNextModel }): AgentLoopFactory => ({
    create: () => ({ execute: async () => ({ answer: "test adapter requires an explicit loop factory" }) })
  });
}
