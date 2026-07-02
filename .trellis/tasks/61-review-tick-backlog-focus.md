# Review Tick Backlog Focus

## Goal

Let unscoped `review tick` use the ranked Opportunity Backlog as a bounded
focus selector, so resident self-evolution can prioritize visible local
attention items without executing them.

## Scope

- Add a `focus` object to review tick JSON and Markdown reports.
- When `review tick` has no explicit `--query` or `--session`, inspect the top
  Opportunity Backlog item.
- Allow `sop_evolution_chain` and `open_opportunity` items to become bounded
  review queries.
- Treat pending confirmations and inbox items as already-actionable operator
  gates; record them as focus but keep recent review scope.
- Persist the latest focus in service review tick status.
- Render latest focus in Feishu `/status`.

## Non-Goals

- No confirmation request or execution.
- No recursive review tick.
- No SOP draft, audit, promotion, or skill revision.
- No active-vault writes.
- No raw SOP, skill, context, or episode artifact reads.
- No shell command execution.

## Acceptance

- Unscoped review tick selects an open SOP evolution chain as
  `focus.source=opportunity_backlog` and uses a bounded query.
- An already-actionable top backlog item records
  `focus.source=backlog_actionable` and does not become a query.
- Service status persists `last_focus`.
- Feishu `/status` renders the latest review focus without running the agent.
- Tests prove raw SOP bodies are not returned in focus or tick Markdown.
