# Review Tick History Read Model

## Goal

Expose recent review tick reports as bounded read-only runtime history so later
agents and operators can understand autonomous review focus without rerunning
review tick.

## Scope

- Add a shared core read model over `autonomy/ticks/*.json`.
- Add CLI `review ticks [--tick <ref-or-id>]`.
- Add Feishu `/review ticks` and `/review tick <ref-or-id>`.
- Add a bounded `Review Tick History` context section.
- Render focus source, focus reason, selected opportunity, review ref,
  proposal count, inbox count, item refs, and evidence id.

## Non-Goals

- No review tick execution.
- No background review execution.
- No confirmation request creation.
- No follow-up execution.
- No raw review Markdown, tick Markdown, SOP, skill, memory candidate, context,
  or episode body reads.
- No SOP, skill, memory, active-vault, repo, or shell mutation.

## Acceptance

- CLI parsing recognizes `review ticks` and `--tick`.
- Feishu tick commands do not invoke the agent runner or run review tick.
- Context includes recent tick history without raw tick Markdown or raw review
  artifacts.
- Focused and full test suites pass.
