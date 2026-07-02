# Selected Skill Outcome Backlog Focus

## Status

Done

## Goal

Route failed selected-skill outcomes into local self-evolution attention so
local runtime can notice skill drift signals after a run, not only count that a skill
was injected.

## Scope

- Read bounded outcome artifacts under `memory/skills/usage/`.
- Surface failed, skipped, blocked, unfinished, or unverified outcomes as
  `selected_skill_outcome` Opportunity Backlog items.
- Suppress passed selected-skill outcomes from the backlog.
- Render bounded outcome metadata in the Opportunity Backlog context section.
- Allow unscoped review tick to use selected-skill outcome items as a bounded
  query focus.

## Non-Goals

- No automatic effectiveness scoring.
- No automatic skill revision, retirement, or registry mutation.
- No raw skill body, raw context body, or raw final-response reads.
- No confirmation request or execution from the backlog read path.

## Acceptance

- Opportunity Backlog includes failed selected-skill outcomes and suppresses
  passed outcomes.
- Review tick can select a failed selected-skill outcome as
  `focus.source=opportunity_backlog`.
- Context renders bounded selected-skill outcome metadata without raw artifacts.
- Focused and full test suites pass.
