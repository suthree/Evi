import type { ActionToolContract } from "../packages/kernel/src/action_types.js";
import type { ExecutionLockInput } from "../packages/kernel/src/contracts.js";

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
