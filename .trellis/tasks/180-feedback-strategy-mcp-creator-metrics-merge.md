# Task 180: Feedback Strategy MCP Creator Metrics Merge

Status: implemented

## Problem

The resident feedback refresh loop is the Xiaohongshu MCP feedback path, while
creator-backend `view_count` is captured separately through `agent-browser-cli`
or page text. After the creator metrics evidence was captured, the MCP strategy
view could still treat `view_count` as missing and keep surfacing a creator
metrics capture command, even though the metric was already available as typed
feedback evidence.

## Scope

- Keep resident feedback refresh strategy summaries explicitly scoped to
  `captured_by=xiaohongshu-mcp`.
- Let `content feedback-strategy --captured-by xiaohongshu-mcp` consider newer
  creator-backend `view_count` evidence when deciding whether `view_count` is
  still missing.
- Expose the strategy `captured_by` source through service health and Feishu
  `/health`.
- Preserve creator metrics capture as a separate supplemental capture path, not
  a publish path.

## Non-goals

- Do not enable the resident creator metrics loop by default.
- Do not make feedback refresh open browsers or read cookies.
- Do not change Xiaohongshu publish attribution.
- Do not infer content performance from failed telemetry.

## Acceptance

- Once a newer creator metrics feedback event includes `view_count`, MCP-scoped
  feedback strategy no longer recommends `content creator-metrics-capture` for
  that same snapshot.
- Resident feedback refresh status records
  `last_strategy_captured_by=xiaohongshu-mcp`.
- Service health and Feishu `/health` expose the strategy captured-by source.

## Verification

- `pnpm exec node --import tsx --test tests/content_pipeline.test.ts tests/content_feedback_refresh_service.test.ts tests/service_health.test.ts tests/feishu_adapter.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
