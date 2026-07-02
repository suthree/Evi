# Task 195: Content Daily Publish Attribution Status

Status: implemented

## Problem

Operators could answer publish-route questions only by running the separate
`content publish-history` read model. The resident `/status` and service health
views showed the daily job as published, but did not summarize whether the
latest daily posts were direct external writes or reconciled publish evidence.

## Scope

- Summarize daily publish evidence for the current daily job run refs inside
  the resident content daily status.
- Surface publish counts, direct/reconciled split, adapter/tool attribution,
  and latest post refs through service health.
- Render the same attribution in Feishu `/status` and `/health`.
- Keep the summary bounded to local typed publish evidence.

## Non-goals

- No platform reads, browser automation, cookie access, publishing, model calls,
  active-vault writes, or repo writes outside this task.
- No change to daily publish execution, reconciliation, feedback, or creator
  metrics semantics.
- No attempt to infer platform state from screenshots or raw draft bodies.

## Acceptance

- A successful daily publish loop records direct publish attribution in
  `services/im/content_daily.json`.
- Service health reads the attribution fields without recomputing or touching
  the platform.
- Feishu `/status` shows the daily publish count and direct/reconciled split.
- Feishu `/health` stays compact and emits attribution only when the resident
  status actually contains it.

## Verification

- `pnpm exec tsx --test tests/content_daily_service.test.ts tests/service_health.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
