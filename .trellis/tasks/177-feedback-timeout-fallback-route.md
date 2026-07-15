# Task 177: Feedback Timeout Fallback Route

Status: implemented

## Problem

The Xiaohongshu MCP current-user feed now times out cleanly and writes failed
feedback evidence, but the feedback queue still treated that latest evidence as
a reason to retry the same MCP feed path. In practice this repeats a known
timeout and delays the more useful fallback: creator-backend metrics capture via
`agent-browser-cli` or operator-supplied page text.

## Scope

- Detect latest failed `xiaohongshu-mcp` feedback evidence caused by
  `/api/v1/user/me` timeout.
- Keep the failed evidence in feedback history for audit.
- Route `feedback-needed` and `feedback-strategy` next commands to
  `content creator-metrics-capture` for that timeout case.
- Include those timeout failures in `creator-metrics-needed` so operators see
  the browser-backed and page-text recovery command chain.
- Prevent `content feedback-refresh` from retrying items whose next command is
  no longer the MCP feed capture path.

## Non-goals

- Do not make resident feedback refresh open browsers.
- Do not enable the resident creator metrics loop by default.
- Do not infer zero views or content performance from failed telemetry.
- Do not change publish gates or Xiaohongshu publish attribution.

## Acceptance

- After a typed `/api/v1/user/me timed out` feedback failure, `feedback-needed`
  returns `reason=failed_capture` with a `content creator-metrics-capture`
  next command.
- `creator-metrics-needed --captured-by xiaohongshu-mcp` lists the failed run
  and emits readiness, browser capture, and page-text recovery commands.
- `feedback-strategy --captured-by xiaohongshu-mcp` keeps posture
  `repair_feedback_capture` but points to creator metrics capture.
- Re-running `content feedback-refresh` skips that routed item instead of
  repeating the MCP feed request.

## Verification

- `pnpm exec node --import tsx --test tests/content_pipeline.test.ts tests/content_feedback_refresh_service.test.ts tests/content_creator_metrics_service.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run check`
