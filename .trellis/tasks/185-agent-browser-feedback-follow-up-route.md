# Agent-Browser Feedback Follow-Up Route

## Status

Done

## Goal

Keep post-publish follow-up commands on the creator metrics capture path when
the latest typed feedback already came from `agent-browser-cli`.

## Scope

- Route `feedback-needed` follow-up commands for agent-browser snapshots to
  `content creator-metrics-capture`.
- Route feedback review recommendations for sparse agent-browser snapshots to
  `content creator-metrics-capture`.
- Route feedback strategy `collect_more_feedback` commands for agent-browser
  evidence to `content creator-metrics-capture`.
- Keep Xiaohongshu MCP follow-up commands on the MCP feedback capture path.
- Document the three command routes: MCP refresh, creator metrics capture, and
  operator-supplied feedback evidence.

## Non-Goals

- No external publishing.
- No browser automation from read models.
- No cookie reads or browser profile migration.
- No change to stable feedback timing thresholds.
- No change to resident feedback refresh execution authority.

## Acceptance

- Agent-browser `needs_follow_up` feedback items emit
  `content creator-metrics-capture --run ...` as their next command.
- Feedback review and feedback strategy use the same creator metrics follow-up
  route for agent-browser snapshots.
- Resident feedback refresh next-due status preserves the latest evidence source
  and surfaces creator metrics capture when an agent-browser snapshot is still
  maturing.
- Focused content pipeline and feedback refresh service tests pass.
