# Selected Skill Drift Review Proposal

## Status

Done

## Goal

Turn selected-skill outcome and drift attention into a gated skill-revision
validation path without rewriting skill instructions.

## Scope

- Detect `skill_usage` episode events with failed, skipped, blocked, not-done,
  or unverified selected-skill outcomes during background review.
- Exclude those telemetry events from generic failure-to-SOP proposals.
- Create `skill_revision` proposals for selected-skill outcome/drift evidence.
- Plan a `revise_skill` follow-up action that carries selected-skill outcome
  refs and skill refs.
- Point confirmation next steps at `skills outcomes --outcome ...`.
- Execute confirmed `revise_skill` actions as active-vault validation events
  only.

## Non-Goals

- No automatic confirmation request or execution from review tick, Feishu, or
  the resident service.
- No skill instruction rewrite.
- No registry metadata rewrite.
- No SOP draft, audit, promotion, or repair through this path.
- No raw skill body, context Markdown, final response, model response, prompt,
  tool result, or completion Markdown rendering.

## Acceptance

- Repeated selected-skill telemetry can become a `skill_revision` review
  proposal.
- Review tick materializes a `revise_skill` inbox item for selected-skill drift.
- The confirmation next step names the selected-skill outcome inspection
  command.
- Confirmed execution appends `validated` registry events and does not rewrite
  skill content.
- Focused and full validation pass.
