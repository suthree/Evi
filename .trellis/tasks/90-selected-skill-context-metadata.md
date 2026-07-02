# Selected Skill Context Metadata

## Status

Done

## Goal

Make selected local skills explainable in live context by showing recall
metadata before the bounded skill instructions.

## Scope

- Render selected skill name, instructions ref, metadata ref, source, and score
  in the `Selected Skills` context section.
- Keep the selected `SKILL.md` instructions as bounded procedure context.
- Preserve context manifest skill refs.
- Verify unselected skill bodies do not appear in context.

## Non-Goals

- No change to skill recall scoring.
- No remote skill sync.
- No registry rewrite during context assembly.
- No usage telemetry claim before the live run finishes.
- No active-vault mutation from context rendering.

## Acceptance

- Context shows selected skill recall metadata before the skill body.
- Context includes the selected skill body because it is selected procedure
  context.
- Context excludes unselected skill bodies.
- Context manifest still records selected skill refs.
- Focused and full test suites pass.
