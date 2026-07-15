# Task 196: Governance Status Wait-Aware Opportunities

Status: implemented

## Problem

When the highest-scored opportunity was a waiting self-evolution gap, governance
status still told the operator to inspect it before starting new self-evolution
work. That made a deliberate post-publish feedback stable window look like
immediate work and could distract the resident loop from genuinely actionable
items.

## Scope

- Keep the existing top opportunity visible for score/order transparency.
- Add an actionable opportunity summary that skips `waiting` backlog items.
- Make the opportunity attention hint explicitly say when the top item is
  waiting and no immediate action is due.
- Show the wait-aware hint in Feishu `/governance`.

## Non-goals

- No change to opportunity scoring, backlog ordering, gap derivation, feedback
  capture timing, browser automation, publishing, model calls, active-vault
  writes, or platform reads.
- No automatic decision recording for waiting gaps.

## Acceptance

- A waiting self-evolution gap reports `next_ready_at` and no actionable item
  when all opportunities are waiting.
- The attention hint says the top item is waiting until its `not_before_at` and
  that no immediate opportunity action is due.
- Feishu `/governance` includes the opportunity hint.

## Verification

- `pnpm exec tsx --test tests/governance_status.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
