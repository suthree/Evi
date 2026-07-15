# Skill Registry Event History

## Status

Done

## Goal

Give operators and later agents a direct bounded history/detail surface for
active-vault skill registry events, separate from the SOP Evolution Ledger.

## Scope

- Add a shared read model over active-vault `registry/skill-events.jsonl`.
- List recent skill events with id/ref, kind, skill, instructions ref,
  SOP/audit refs, evidence refs, artifact refs, summary, and created time.
- Inspect one event by id or listed ref.
- Filter list output by skill name.
- Add CLI `skills events [--event <ref-or-id>] [--skill-name <name>]`.
- Add Feishu `/skill events` and `/skill event <ref-or-id>`.
- Keep raw skill bodies out of the read model.

## Non-Goals

- No skill instruction rewrite.
- No registry metadata rewrite.
- No active-vault write.
- No confirmation request or execution.
- No SOP draft, audit, promotion, or chain repair.
- No review tick execution, model invocation, or shell command execution.

## Acceptance

- Core history tests cover list/detail, ordering, skill filtering, unsafe refs,
  listed refs, and raw skill body exclusion.
- CLI parsing recognizes `skills events`.
- Feishu commands render skill registry event history without running the
  agent.
- Focused and full validation pass.
