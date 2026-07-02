# Task 202: Review Tick Active Inbox Observability

Status: implemented

## Problem

Resident review ticks can write raw inbox refs that are historical, duplicate,
or already covered by an inherited operator decision. The default active inbox
view may be empty while the latest tick still reports raw `inbox_count > 0`,
which makes the self-evolution loop look noisier than it is.

## Scope

- Preserve `last_inbox_count` as the raw latest tick output.
- Record `last_active_tick_inbox_count` for latest tick refs that remain active.
- Record `last_active_inbox_count` for the whole active review inbox after the
  tick and any safe auto-action.
- Surface the counts through service health, compact context, Feishu `/status`,
  Feishu `/health`, and Feishu `/governance`.

## Non-goals

- No change to review inbox history files, duplicate grouping, inherited
  decisions, operator decision semantics, auto-action eligibility, or SOP
  mutation gates.

## Acceptance

- A review tick loop status can show raw inbox count and active inbox count
  separately.
- Service health and governance preserve the same counts.
- Feishu operator views render the distinction in bounded text.

## Verification

- `pnpm exec tsx --test tests/review_tick_service.test.ts tests/service_health.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts tests/context_harness.test.ts`
- `pnpm run check`
