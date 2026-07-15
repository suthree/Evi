# Task 199: Feedback Loop Next Wake Observability

Status: implemented

## Problem

Task 198 made resident feedback refresh and creator metrics timers wake at the
earliest deferred `next_due_at`, but operator health views still had to infer
that scheduling from `next_due_at` alone. When the loop status was `skipped`,
it was not explicit whether the resident service had an active timer waiting for
the next due window.

## Scope

- Record `next_wake_at`, `next_wake_delay_ms`, and `next_wake_reason` in
  resident feedback refresh status after scheduling the next timer.
- Record the same next-wake fields for resident creator metrics.
- Surface the fields through `service health`, `/health`, and `/status`.
- Keep the scheduler helper deterministic in tests.

## Non-goals

- No change to due-time derivation, feedback queue ordering, content publishing,
  browser automation, MCP calls, model calls, active-vault writes, or service
  config defaults.
- No change to service health severity; next-wake fields are observability only.

## Acceptance

- Feedback refresh and creator metrics status files show the scheduled
  `next_wake_at`, bounded `next_wake_delay_ms`, and `next_wake_reason`.
- Service health reads the next-wake fields without fetching platform state.
- Feishu health/status output can distinguish an actively waiting timer from a
  plain skipped loop.

## Verification

- `pnpm exec tsx --test tests/content_feedback_refresh_service.test.ts tests/content_creator_metrics_service.test.ts tests/loop_schedule.test.ts tests/service_health.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
