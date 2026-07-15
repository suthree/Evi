# Task 203: Review Tick Inactive Inbox Diagnosis

Status: implemented

## Problem

After active inbox counts are visible, a resident review tick can still show raw
latest-tick refs while active count is zero. Operators and future model context
need to know why those refs are not actionable: executed item status, inherited
terminal decision, duplicate collapse, or missing detail.

## Scope

- Diagnose latest tick inbox refs that are absent from the active inbox view.
- Record bounded inactive count, reason counts, and inactive ref samples in
  `services/im/review_tick.json`.
- Surface the same diagnosis through service health, governance status, compact
  context, Feishu `/status`, Feishu `/health`, and Feishu `/governance`.

## Non-goals

- Do not mutate review inbox history, duplicate grouping, operator decisions,
  active vault state, repo files, or external channels.
- Do not add new auto-action eligibility.

## Acceptance

- Raw latest-tick inbox refs can be explained when active count is zero.
- Inherited completed decisions are reported as terminal decision suppression.
- Operator views render the diagnosis in bounded text.

## Verification

- `pnpm exec tsx --test tests/review_tick_service.test.ts tests/service_health.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts tests/context_harness.test.ts`
- `pnpm run check`
