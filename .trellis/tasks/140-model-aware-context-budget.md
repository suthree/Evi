# Model-Aware Context Budget

Status: done

## Problem

local runtime supports custom OpenAI-compatible models, but context usage and
pressure diagnostics used only static character thresholds. Operators could not
tell whether a context bundle was large relative to the currently configured
model window.

## Scope

- Add optional `context_window_tokens` support to model config records.
- Expose non-secret model budget metadata in runtime config summaries.
- Record derived budget metadata in live context manifests.
- Let `context usage` and `context pressure` apply the active model budget when
  provided, while preserving static fallbacks.
- Render model budget lines in Feishu context/config operator views.
- Update Runtime Contract, Local Runtime docs, Trellis spec/decision, capability
  catalog, and focused tests.

## Non-Goals

- Do not call model providers or infer remote model windows.
- Do not read `auth.jsonl`, API keys, app secrets, raw context Markdown, model
  responses, tool artifacts, or final-response artifacts.
- Do not compact context, rewrite context assembly, mutate state, run review
  tick, execute confirmations, or add a pluggable context engine.

## Verification

```bash
pnpm exec tsx --test tests/config_summary.test.ts tests/context_usage.test.ts tests/context_pressure.test.ts tests/context_harness.test.ts tests/feishu_adapter.test.ts tests/cli.test.ts
pnpm run check
```

## Result

Implemented model-aware context budget metadata and diagnostics using only
local non-secret config and context manifest metadata.
