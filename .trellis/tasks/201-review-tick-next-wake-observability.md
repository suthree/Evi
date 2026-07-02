# Task 201: Review Tick Next Wake Observability

Status: implemented

## Problem

Governance idle status could show the next resident check, but it had to infer
that from content feedback loops because the resident `review_tick` loop did
not persist its own scheduled wake. That made the content feedback loop look
like the next self-evolution check even when the review tick loop was the real
autonomous governance watcher.

## Scope

- Record `next_wake_at`, `next_wake_delay_ms`, and `next_wake_reason` in
  resident review tick status after startup and interval ticks.
- Reuse the shared loop scheduling helper instead of a separate `setInterval`
  contract.
- Surface review tick next-wake fields through service health, Feishu
  `/status`, Feishu `/health`, and Feishu `/governance`.
- Let governance idle `next_check` prefer the earliest enabled resident loop,
  including `review_tick`.

## Non-goals

- No change to review tick query selection, opportunity scoring, background
  review behavior, auto-action eligibility, model calls, content publishing,
  browser automation, active-vault writes, or runtime config defaults.
- No health severity change; next-wake fields are observability only.

## Acceptance

- A started review tick loop writes bounded next-wake fields after its startup
  tick.
- Service health exposes review tick next-wake fields.
- Governance idle `next_check` can point to `review_tick` instead of a content
  feedback loop when it wakes earlier.
- Feishu `/health` and `/governance` render the same schedule.

## Verification

- `pnpm exec tsx --test tests/review_tick_service.test.ts tests/service_health.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts tests/context_harness.test.ts`
- `pnpm run check`
