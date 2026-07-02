# Task 194: Creator Metrics Next Due Health

Status: implemented

## Problem

The resident creator metrics loop can legitimately report an empty current
queue while creator-routed follow-ups are still inside the stable window. In
that state, service health and Feishu `/status` looked idle even though the
next creator metrics capture was already scheduled by local feedback strategy.

## Scope

- Surface `next_due_*` metadata from the resident creator metrics loop.
- Include the next due run and command in service health.
- Show the same next due context in Feishu `/status`.
- Keep creator metrics execution behavior unchanged.

## Non-goals

- No browser automation, login, cookie access, platform reads, publishing,
  model calls, repo writes outside this task, or active-vault writes.
- No change to the feedback refresh queue or strategy semantics.
- No premature capture before the stable follow-up window.

## Acceptance

- Before the stable window, `content_creator_metrics` can skip with an empty
  queue while reporting the next due creator metrics follow-up.
- After the stable window, due creator metrics follow-ups are captured as
  before and `next_due_*` clears when no future item remains.
- Service health exposes the same `next_due_*` metadata.
- Feishu `/status` renders the next due creator metrics run and command.

## Verification

- `pnpm exec tsx --test tests/content_creator_metrics_service.test.ts tests/service_health.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
