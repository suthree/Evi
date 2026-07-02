# Task 187: Feedback Strategy Complete Creator Snapshot

Status: implemented

## Problem

`content feedback-strategy --captured-by xiaohongshu-mcp` could keep reporting a
`repair_feedback_capture` posture after the MCP current-user feed timed out,
even when a newer `agent-browser-cli` creator metrics snapshot had already
captured the complete standard metric set. This made resident health show a
repair state although the next safe action was simply to collect a later stable
creator metrics snapshot.

## Scope

- Keep the MCP-scoped strategy view and `last_strategy_captured_by` attribution.
- When a scoped latest feedback event is `failed_capture`, let a newer complete
  all-source feedback snapshot supply the effective strategy post/trend.
- Preserve the older missing-view-count behavior: a non-failed MCP snapshot that
  merely lacks creator `view_count` should still use the existing creator metrics
  supplement path.

## Acceptance

- MCP-scoped strategy shifts from `repair_feedback_capture` to
  `collect_more_feedback` when newer complete creator metrics exist after an MCP
  timeout.
- Evidence refs include both the failed MCP evidence and the newer creator
  metrics evidence.
- Existing creator view-count supplement behavior remains unchanged.

## Verification

- `pnpm exec node --import tsx --test tests/content_pipeline.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
