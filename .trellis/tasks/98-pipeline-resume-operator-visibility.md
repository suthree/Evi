# Pipeline Resume Operator Visibility

## Status

Done

## Goal

Expose explicit inspect and resume commands for blocked or failed StageRunner
pipeline backlog items in read-only operator surfaces.

## Scope

- Add bounded `pipeline_run` metadata to derived Opportunity Backlog items.
- Include `pipeline runs --pipeline ... --state-root <state-root>` guidance.
- Include `pipeline resume --pipeline ... --from-stage ... --state-root
  <state-root>` guidance when a blocked or failed stage is known.
- Render the same bounded guidance in assembled context.
- Include the top pipeline opportunity summary in governance status.
- Render pipeline inspect/resume guidance in Feishu operator opportunity
  commands.
- Keep raw pipeline artifacts, model responses, and stage outputs out of these
  read models.

## Non-Goals

- No resume execution from Opportunity Backlog, context assembly, governance
  status, Feishu, review tick, or the resident service.
- No confirmation request creation.
- No SOP, skill, memory, active-vault, or repo mutation.
- No raw pipeline body, stage output, model response, tool result, or prompt
  rendering.

## Acceptance

- Blocked pipeline backlog items include inspect and resume commands.
- Failed pipeline backlog items include inspect and resume commands.
- Context includes the bounded pipeline commands without raw artifacts.
- Governance status carries pipeline command guidance for the top opportunity.
- Feishu `/governance opportunities` renders the commands without running the
  agent.
- Focused and full validation pass.
