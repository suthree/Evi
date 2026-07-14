const DEFAULT_CHARS_PER_TOKEN = 4;
const DEFAULT_SOFT_THRESHOLD = 0.8;
const DEFAULT_HARD_THRESHOLD = 0.95;

export const DEFAULT_CONTEXT_TOTAL_HARD_LIMIT_CHARS = 90_000;

export interface ContextBudgetInput {
  model_id?: string | null;
  model?: string | null;
  source_ref?: string | null;
  context_window_tokens?: number | null;
  max_output_tokens?: number | null;
  chars_per_token?: number;
  soft_threshold?: number;
  hard_threshold?: number;
}

export interface ContextBudgetSummary {
  source: "model_config";
  model_id: string | null;
  model: string | null;
  source_ref: string | null;
  context_window_tokens: number;
  reserved_output_tokens: number;
  estimated_input_budget_tokens: number;
  chars_per_token: number;
  total_soft_limit_chars: number;
  total_hard_limit_chars: number;
  soft_threshold: number;
  hard_threshold: number;
  warning: string | null;
}

export function deriveContextBudget(input: ContextBudgetInput): ContextBudgetSummary | null {
  const contextWindowTokens = positiveInteger(input.context_window_tokens);
  if (!contextWindowTokens) return null;
  const charsPerToken = positiveNumber(input.chars_per_token) ?? DEFAULT_CHARS_PER_TOKEN;
  const softThreshold = boundedThreshold(input.soft_threshold) ?? DEFAULT_SOFT_THRESHOLD;
  const hardThreshold = boundedThreshold(input.hard_threshold) ?? DEFAULT_HARD_THRESHOLD;
  const requestedOutputTokens = positiveInteger(input.max_output_tokens) ?? 0;
  const reservedOutputTokens = Math.min(requestedOutputTokens, Math.max(contextWindowTokens - 1, 0));
  const estimatedInputBudgetTokens = Math.max(1, contextWindowTokens - reservedOutputTokens);
  const estimatedInputBudgetChars = Math.floor(estimatedInputBudgetTokens * charsPerToken);
  return {
    source: "model_config",
    model_id: input.model_id ?? null,
    model: input.model ?? null,
    source_ref: input.source_ref ?? null,
    context_window_tokens: contextWindowTokens,
    reserved_output_tokens: reservedOutputTokens,
    estimated_input_budget_tokens: estimatedInputBudgetTokens,
    chars_per_token: charsPerToken,
    total_soft_limit_chars: Math.max(1, Math.floor(estimatedInputBudgetChars * softThreshold)),
    total_hard_limit_chars: Math.max(1, Math.floor(estimatedInputBudgetChars * hardThreshold)),
    soft_threshold: softThreshold,
    hard_threshold: hardThreshold,
    warning: requestedOutputTokens >= contextWindowTokens
      ? "max_output_tokens is greater than or equal to context_window_tokens; diagnostics reserve nearly the entire window for output"
      : null
  };
}

function positiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function positiveNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function boundedThreshold(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1) return null;
  return value;
}
