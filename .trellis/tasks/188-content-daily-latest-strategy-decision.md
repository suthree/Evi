# Task 188: Content Daily Latest Strategy Decision

Status: implemented

## Problem

The resident content daily loop selected the first auto-applicable same-workflow
feedback strategy from the planner. Because planner ordering is priority-first,
an older `reuse_baseline` or `revise_next_post` suggestion could shape the next
daily draft even when a newer same-workflow post had immature or failed feedback.

## Scope

- Select the newest same-workflow feedback strategy suggestion before deciding
  whether it can auto-apply.
- Apply only mature `reuse_baseline` or `revise_next_post` suggestions.
- When the newest suggestion is not auto-applicable, keep the generated draft
  unmodified and record resident `last_blocked_strategy_*` status for health,
  context, and IM inspection.

## Acceptance

- A newer immature strategy blocks fallback to an older reusable baseline.
- `content_daily.json` and `service health` expose blocked strategy counts,
  postures, source refs, titles, reasons, and next commands.
- Feishu and context health views expose bounded blocked strategy counts without
  exceeding existing text-size limits.

## Verification

- `pnpm exec node --import tsx --test tests/content_daily_service.test.ts tests/service_health.test.ts tests/feishu_adapter.test.ts tests/context_harness.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
