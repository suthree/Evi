# Selected Skill Drift Summary

## Status

Done

## Goal

Group repeated selected-skill attention outcomes by skill so operators and later
agents can see drift signals without opening raw skill or run artifacts.

## Scope

- Add a shared read model that groups `memory/skills/usage/*.json` by
  `skill_name`.
- Return a `selected_skill_drift_<skill>` summary only when a skill has at least
  two failed, skipped, blocked, unfinished, or unverified outcomes.
- Add `selected_skill_drift` Opportunity Backlog items and suppress duplicate
  single `selected_skill_outcome` items for the same skill.
- Render bounded drift summaries in context, governance status, Feishu
  opportunities, and review tick backlog focus.
- Add CLI `skills drifts [--skill-name <name>]`.
- Add Feishu `/skill drifts` and `/skill drift <skill-name>`.

## Non-Goals

- No automatic skill revision, retirement, registry mutation, or active-vault
  write.
- No raw selected skill body, context Markdown, final response, completion
  Markdown, prompt, tool result, or model response reads.
- No confirmation request, follow-up execution, review tick execution, model
  invocation, or shell command execution from the read path.

## Acceptance

- Core history tests cover grouped drift summaries and raw artifact exclusion.
- Opportunity Backlog collapses repeated skill attention and hides duplicate
  single outcome items for that skill.
- Context renders bounded drift metadata without raw artifacts.
- CLI parsing recognizes `skills drifts`.
- Feishu drift commands render grouped summaries without running the agent.
- Focused and full validation pass.
