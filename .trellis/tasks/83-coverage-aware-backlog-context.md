# Coverage-Aware Backlog Context

## Status

Done

## Goal

Expose reused-skill coverage status directly in the local self-evolution read
models that later agents and Feishu operators already inspect before acting.

## Scope

- Attach a bounded `reused_skill_coverage` summary to `revise_skill` Opportunity
  Backlog items when the referenced SOP chain can be resolved.
- Render the same summary in the Opportunity Backlog context section and the
  bounded Governance Queue context section.
- Include top-opportunity coverage in aggregate governance status and Feishu
  governance rendering.
- Render coverage status in Feishu `/governance opportunities`.
- Keep coverage errors non-fatal so older inbox or confirmation artifacts
  without valid SOP chains still appear normally.

## Acceptance

- Backlog, context, Feishu, and governance status tests cover a `covered`
  reused-skill chain.
- Context and Feishu outputs do not render raw `SKILL.md` bodies.
- The feature is read-only and does not execute `revise_skill`, append
  validation evidence, mutate SOP/skill state, write the active vault, invoke
  the model, or run shell commands.
