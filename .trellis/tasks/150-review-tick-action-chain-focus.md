# Review Tick Action-Chain Focus

## Status

Done

## Goal

Carry bounded Opportunity Backlog action-chain metadata into unscoped review
tick focus so the self-evolution loop can reason about the next operator
sequence without gaining execution authority.

## Scope

- Add action-chain label/effect/reason summaries to review tick focus
  opportunity metadata.
- Keep action command strings out of the focus metadata.
- Include a compact action-chain token in review tick queries without pushing
  stable refs and diagnostics out of the bounded query.
- Render action-chain summaries in tick Markdown.
- Carry the same summary from focus-created `runtime_gap` proposals into review
  inbox items, background review reports, context, and Feishu report views.
- Preserve action-chain summaries through review tick history parsing.
- Preserve action-chain summaries through service health and governance
  status.
- Render compact action-chain summaries in Feishu `/review ticks`,
  `/review tick <ref-or-id>`, `/status`, and `/governance` surfaces.
- Rename the prior action-chain task record to keep Trellis task numbering
  unique.

## Non-Goals

- No command execution from review tick, tick history, service health,
  governance status, Feishu, or resident service.
- No confirmation request or execution.
- No SOP, skill, memory, repo, active-vault, or service mutation from read-only
  rendering.
- No raw context, SOP, skill, model response, tool output, or service log
  rendering.

## Acceptance

- Context-health review tick focus includes action-chain labels/effects and
  tick Markdown renders the same summary.
- Focus-created runtime-gap proposals and review inbox items preserve the
  action-chain labels/effects without command strings.
- Feishu review tick list/detail commands render action-chain summaries without
  running the agent.
- Service health preserves resident review tick focus action-chain summaries.
- Focused and full validation pass.
