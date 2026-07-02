# Task 189: Review Tick Runtime Config CLI

Status: implemented

## Problem

The runtime schema, config updater, and resident IM service already supported the
`review_tick` loop, but `config set-runtime` did not expose CLI flags for turning
that loop on or tuning its interval and limit. That left the self-evolution loop
less operable than the content daily, feedback refresh, and creator metrics
loops.

## Scope

- Add `config set-runtime` flags for enabling/disabling the resident review tick
  loop.
- Add interval and limit flags for local tuning.
- Keep the change limited to runtime config surface; do not change review tick
  execution behavior.

## Acceptance

- `parseArgs` recognizes review tick runtime flags.
- Runtime config update persists review tick settings through the existing
  append-only home config path.
- Usage output documents the review tick runtime config command shape.

## Verification

- `pnpm exec node --import tsx --test tests/cli.test.ts tests/config_summary.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
