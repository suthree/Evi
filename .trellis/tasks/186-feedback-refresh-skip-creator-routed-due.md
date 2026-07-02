# Task 186: Feedback Refresh Skip Creator-Routed Due Items

Status: implemented

## Problem

Resident feedback refresh reads the all-source feedback-needed queue to respect
newer non-MCP snapshots, but its automatic capture path is still limited to the
Xiaohongshu MCP current-user feed. When the newest snapshot is already from
`agent-browser-cli`, the queue routes the next follow-up to
`content creator-metrics-capture`; resident feedback refresh should not turn
that due item into an MCP feed capture.

## Scope

- Automatically capture only feedback-needed items whose command is MCP
  `content feedback-capture`.
- Skip due items routed to creator metrics and expose skipped counts/refs in
  service health.
- Preserve creator metrics as a separate supplemental path; do not enable the
  browser loop by default.

## Acceptance

- A due `agent-browser-cli` follow-up does not construct or call the MCP feedback
  client from the resident refresh loop.
- The refresh status records `last_skipped_count` and
  `last_skipped_item_refs` for creator-routed due items.
- `service health` exposes the skipped count and refs.

## Verification

- `pnpm exec node --import tsx --test tests/content_feedback_refresh_service.test.ts tests/service_health.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
