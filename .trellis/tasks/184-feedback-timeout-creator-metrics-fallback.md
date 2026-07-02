# Feedback Timeout Creator Metrics Fallback

## Status

Done

## Goal

Route Xiaohongshu MCP current-user feed timeout feedback gaps through the
creator metrics recovery path, and make agent-browser creator metrics capture
fall back to a named session when Chrome auto-connect is unavailable.

## Scope

- Detect failed `xiaohongshu-mcp` feedback evidence whose `/api/v1/user/me`
  request timed out.
- Surface those gaps as `creator_metrics_capture_readiness_loop` work instead
  of retrying the same timed-out feed request.
- Keep failed MCP feedback evidence as the audit source while using
  `creator-metrics-needed` and `creator-metrics-capture` for recovery.
- Try `agent-browser-cli --auto-connect` first for creator metrics, then fall
  back to `--session-name runtime-creator-metrics` when auto-connect is blocked.
- Document the runtime and active-exploration repair path.

## Non-Goals

- No Xiaohongshu publishing.
- No direct cookie reads.
- No resident browser enablement or browser profile migration.
- No inferred engagement metrics from failed feedback telemetry.
- No historical state migration for prior feedback evidence.

## Acceptance

- Failed Xiaohongshu MCP `/api/v1/user/me` timeout feedback creates a creator
  metrics fallback gap with the published run and failed feedback evidence refs.
- `governance act-next` invokes creator metrics capture for the timeout gap
  instead of repeating the failed MCP current-user feed capture.
- Agent-browser creator metrics capture retries the named session when
  auto-connect cannot find a remote-debugging Chrome instance.
- Focused self-evolution and content pipeline tests pass.
