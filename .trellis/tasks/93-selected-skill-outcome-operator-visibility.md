# Selected Skill Outcome Operator Visibility

## Status

Done

## Goal

Make selected-skill outcome attention visible in local operator read models so
operators can spot failed or unverified selected-skill runs from governance
status and Feishu without opening raw artifacts.

## Scope

- Carry the top Opportunity Backlog item's bounded `selected_skill_outcome`
  summary through the aggregate governance status read model.
- Render selected-skill outcome status, skill name/ref, completion report ref,
  and verdict in Feishu `/governance`.
- Render the same bounded selected-skill outcome summary in Feishu
  `/governance opportunities`.
- Keep raw selected skill bodies, raw context Markdown, and raw final responses
  out of operator command output.

## Non-Goals

- No automatic skill revision, retirement, or registry mutation.
- No confirmation request or execution.
- No model invocation, background review, review tick execution, or shell
  command execution.
- No raw artifact expansion in operator views.

## Acceptance

- `governance status` exposes the top selected-skill outcome summary when that
  item is the highest-ranked backlog item.
- Feishu `/governance` shows the top selected-skill outcome summary without
  running the agent.
- Feishu `/governance opportunities` shows selected-skill outcome summaries
  without raw artifact content.
- Focused and full test suites pass.
