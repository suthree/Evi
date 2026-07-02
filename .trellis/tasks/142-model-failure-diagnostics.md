# Model Failure Diagnostics

Status: done

## Problem

Live runner model failures were flattened into a generic blocked response. The
harness did not preserve a stable failure kind, distinguish request failures
from action-envelope parse failures, or expose bounded diagnostics through live
run trace views for later SOP/backlog work.

## Scope

- Split model request failure handling from `ModelActionEnvelope` parse failure
  handling in the live runner.
- Write `memory/episodes/<session>-model-diagnostic-r<round>.json` for model
  request and envelope parse failures.
- Classify failures as auth, rate limit, billing, context window, timeout,
  server, network, format, empty response, or unknown.
- Include sanitized previews, context refs, model/config metadata, response ref
  when one exists, and input size metadata in the diagnostic artifact.
- Append `model_diagnostic` evidence events.
- Include diagnostic refs in completion report observations and skipped
  completion checks.
- Expose diagnostic kind/stage/refs through bounded live run trace context and
  Feishu `/review trace` views.
- Update runtime docs, capability catalog, Trellis spec, and focused harness
  tests.

## Non-Goals

- Do not add retry, model failover, or provider fallback policy.
- Do not infer remote provider limits outside the local error signal.
- Do not render raw model response bodies into later context or Feishu operator
  views.
- Do not mutate SOP, skill, memory, active-vault, repo, service, or external
  state from a diagnostic.

## Verification

```bash
pnpm exec tsx --test tests/context_harness.test.ts
pnpm exec tsx --test tests/feishu_adapter.test.ts
pnpm run check
```

## Result

Implemented bounded model failure diagnostics for request and action-envelope
parse failures, with trace and completion-report visibility.
