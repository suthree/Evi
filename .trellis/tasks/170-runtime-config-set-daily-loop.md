# Task 170: Runtime Config Set Daily Loop

Status: implemented

## Problem

The resident daily content loop is configured through JSONL runtime records, but
operators previously had to hand-edit `config.jsonl`. That is too error-prone
for enabling the safe daily dry-run loop and too risky for publish-gate fields.

## Scope

- Add `config set-runtime` as a scoped local runtime config mutation command.
- Append a non-secret `runtime` record to `<LOCAL_RUNTIME_HOME>/config/config.jsonl`.
- Support daily content loop fields: enabled, interval, dry-run, preflight,
  topic, source URLs, tickers, image model, publish adapter URL/tool, and publish
  gates.
- Require `--external-write --confirmed` before setting resident daily
  external-write fields to true.
- Reject contradictory dry-run plus preflight/publish settings.
- Keep the default `config` command read-only.

## Non-goals

- No secret writes or reads from `auth.jsonl`.
- No service restart from the config command.
- No model calls, source fetches, image generation, browser automation, MCP
  calls, or external publication.
- No repository config mutation.

## Acceptance

- `config set-runtime` appends a home-layer runtime record and reports the
  appended ref, changed fields, before/after runtime summaries, and restart
  guidance.
- Safe dry-run daily scheduling can be enabled without hand-editing JSONL.
- Resident daily publish gates cannot be enabled by accident.
- Existing read-only config summaries and service daily loop behavior remain
  compatible.

## Verification

- `pnpm exec tsx --test tests/config_summary.test.ts tests/cli.test.ts tests/content_daily_service.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run runtime -- config set-runtime --content-daily-enabled --content-daily-dry-run --no-content-daily-preflight --state-root <tmp-state>`
