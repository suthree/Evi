# Task 197: Review Tick Wait-Aware Opportunity Focus

Status: implemented

## Problem

`/governance` now distinguishes top waiting opportunities from immediately
actionable work, but the resident review tick still consumed the first backlog
item directly. A waiting post-publish feedback gap could therefore be treated as
the current review focus before its stable feedback window was reached.

## Scope

- Scan a bounded opportunity backlog window before choosing review tick focus.
- Skip `status=waiting` backlog items when selecting actionable focus.
- Keep waiting item metadata visible in the tick artifact when no non-waiting
  opportunity is available.
- Preserve existing behavior for explicit query/session, working checkpoints,
  queryable backlog items, and already-actionable confirmation items.

## Non-goals

- No change to opportunity scoring, backlog ordering, self-evolution gap
  derivation, feedback timing, publishing, browser automation, model calls,
  active-vault writes, or platform reads.
- No automatic decision recording for skipped waiting gaps.

## Acceptance

- A review tick with only waiting opportunities keeps `focus_source=recent`.
- The tick reason names the waiting item and its `not_before_at`.
- A non-waiting backlog item behind waiting entries can still become focus.
- Existing backlog focus tests continue to pass.

## Verification

- `pnpm exec tsx --test tests/background_review.test.ts`
- `pnpm run check`
