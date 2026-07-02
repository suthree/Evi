# Task 176: Xiaohongshu Feedback Feed Timeout

Status: implemented

## Problem

The daily content loop can publish through `xiaohongshu-mcp`, but post-publish
feedback refresh reads `/api/v1/user/me` through the same client timeout used by
MCP publish/tool calls. A slow current-user feed read can hold the resident loop
for too long, and generic abort errors are weak evidence when later self-review
needs to decide whether to retry, repair capture, or use browser/operator
metrics.

## Scope

- Keep confirmed `xiaohongshu-mcp` publish/tool calls on the longer MCP request
  timeout.
- Add a separate bounded timeout for the current-user feed read used by
  feedback capture and publish-proof fallback.
- Persist feed timeout failures as typed Xiaohongshu feedback evidence with a
  stable `/api/v1/user/me timed out` error and timeout metadata.
- Ensure resident feedback refresh remains healthy when one queued capture
  fails with a timeout.
- Clarify the runtime documentation for this feedback boundary.

## Non-goals

- No change to external publish authorization gates.
- No direct cookie access, browser automation, model calls, or external publish
  from feedback refresh.
- No deletion or rewriting of historical content run artifacts.
- No preference change: `xiaohongshu-mcp` remains the preferred publish route;
  `agent-browser-cli` remains useful for creator-backend metrics capture.

## Acceptance

- `XiaohongshuMcpClient.captureFeedback()` returns a typed failed feedback
  result when `/api/v1/user/me` exceeds the current-user feed timeout.
- `content feedback-refresh` records that failure as `status=failed` feedback
  evidence rather than skipping the item.
- The resident `content_feedback_refresh` loop reports `state=ok` with
  `last_failed_count > 0` for capture failures, not a service-level error.
- Docs explain that feed timeouts are failed feedback evidence and do not use
  the publish/tool timeout.

## Verification

- `pnpm exec node --import tsx --test tests/xiaohongshu_mcp_client.test.ts tests/content_pipeline.test.ts tests/content_feedback_refresh_service.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run check`
