# Selected Skill Outcome History Read Model

## Status

Done

## Goal

Give operators and later agents a direct bounded history/detail surface for
selected-skill outcome telemetry, matching the existing completion verification
and pipeline history read-model pattern.

## Scope

- Add a shared read model over `memory/skills/usage/*.json`.
- List recent selected-skill outcomes with id/ref, skill, session, completion
  status, verification status, verdict, completion report ref, and use count.
- Inspect one outcome by id, session id, skill name, or ref.
- Add CLI `skills outcomes [--outcome <ref-or-id>]`.
- Add Feishu `/skill outcomes` and `/skill outcome <ref-or-id>`.
- Keep raw selected skill bodies, context Markdown, final responses, and
  completion Markdown out of the read model.

## Non-Goals

- No automatic skill revision, retirement, or registry mutation.
- No confirmation request or execution.
- No background review, review tick execution, model invocation, or shell
  command execution.
- No raw artifact expansion.

## Acceptance

- Core history tests cover list/detail, ordering, invalid artifact filtering,
  and unsafe refs.
- CLI parsing recognizes `skills outcomes`.
- Feishu commands render selected-skill outcome history without running the
  agent.
- Focused and full test suites pass.
