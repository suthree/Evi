# Task 193: Creator Metrics Follow-Up Resident Queue

Status: implemented

## Problem

After Xiaohongshu MCP feedback timed out, creator-backend view counts could be
captured through `agent-browser-cli`. Once the latest feedback snapshot came
from `agent-browser-cli`, `feedback-needed` correctly routed follow-up work to
`content creator-metrics-capture`, but the resident creator metrics loop only
watched `creator-metrics-needed` items for missing `view_count`. This left a
gap where `content_feedback_refresh` would skip due non-MCP follow-ups while
`content_creator_metrics` had an empty queue.

## Scope

- Extend the resident creator metrics loop to also consume due
  `feedback-needed` follow-ups whose next command is `content
  creator-metrics-capture`.
- Reuse the feedback refresh stable window before treating follow-ups as due.
- Keep missing `view_count` capture behavior unchanged and prioritized.
- Keep `feedback-refresh` bounded to Xiaohongshu MCP and out of browser
  automation.

## Non-goals

- No change to `feedback-needed` or `creator-metrics-needed` CLI read-model
  semantics.
- No automatic browser login, cookie access, publishing, model calls, repo
  writes, or active-vault writes.
- No premature capture before the stable follow-up window.

## Acceptance

- Creator metrics resident loop skips creator-routed follow-ups before their
  stable window.
- Creator metrics resident loop captures due creator-routed follow-up snapshots.
- A captured follow-up writes typed `agent-browser-cli` feedback evidence.
- Existing missing `view_count` resident behavior still passes.

## Verification

- `pnpm exec tsx --test tests/content_creator_metrics_service.test.ts tests/content_feedback_refresh_service.test.ts tests/content_pipeline.test.ts`
- `pnpm run check`
