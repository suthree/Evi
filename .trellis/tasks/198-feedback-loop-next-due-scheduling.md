# Task 198: Feedback Loop Next Due Scheduling

Status: implemented

## Problem

The resident feedback refresh and creator metrics loops persisted `next_due_at`
for deferred follow-up work, but their timers still slept on the fixed runtime
interval. A matured post-publish feedback window could therefore wait for the
next coarse hourly tick before the local service acted.

## Scope

- Add a small scheduler helper that caps the configured interval by a valid
  `next_due_at`.
- Let the resident feedback refresh loop schedule its next wake from the latest
  loop status.
- Let the resident creator metrics loop use the same `next_due_at` scheduling.
- Add deterministic timer seams for service-loop tests.

## Non-goals

- No change to due-time derivation, feedback queue ordering, content publishing,
  browser automation, MCP calls, model calls, repo writes, active-vault writes,
  or service config defaults.
- No new health field; existing `next_due_at` remains the source of truth for
  the due wake.

## Acceptance

- If no valid `next_due_at` exists, loops continue to use the configured
  interval.
- If `next_due_at` is sooner than the configured interval, the next wake is
  scheduled for that due time.
- Feedback refresh and creator metrics start-level tests prove the scheduler
  uses `next_due_at` without resolving platform clients before due.

## Verification

- `pnpm exec tsx --test tests/content_feedback_refresh_service.test.ts tests/content_creator_metrics_service.test.ts tests/loop_schedule.test.ts`
- `pnpm run check`
