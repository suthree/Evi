# Background Review History Read Model

## Goal

Expose recent background review reports as bounded read-only runtime history so
later agents and operators can understand review proposals without rerunning
background review.

## Scope

- Add a shared core read model over `autonomy/reviews/*.json`.
- Add CLI `review reports [--review <ref-or-id>]`.
- Add Feishu `/review reports` and `/review report <ref-or-id>`.
- Add a bounded `Background Review History` context section.
- Render review mode, query, session, proposal summaries, chain summary counts,
  working checkpoint refs, and evidence ids.

## Non-Goals

- No background review execution.
- No review tick execution.
- No confirmation request creation.
- No follow-up execution.
- No raw review Markdown, tick Markdown, SOP, skill, memory candidate, context,
  or episode body reads.
- No SOP, skill, memory, active-vault, repo, or shell mutation.

## Acceptance

- CLI parsing recognizes `review reports` and `--review`.
- Feishu report commands do not invoke the agent runner or run review.
- Context includes recent background review history without raw review
  Markdown or raw proposal rationale.
- Focused and full test suites pass.
