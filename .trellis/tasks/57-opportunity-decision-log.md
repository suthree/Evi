# Task 57: Opportunity Decision Log

## Status

Done

## Goal

Add an append-only operator decision path for open Opportunity Backlog records
so local self-evolution opportunities can be deferred, completed, retired, or
reopened without rewriting `autonomy/opportunities.jsonl`.

## Scope

- Add `autonomy/opportunity-decisions.jsonl` as the decision log.
- Merge latest decisions into the Opportunity Backlog read model.
- Hide completed and retired opportunities from backlog views.
- Add CLI `governance decide-opportunity --opportunity <id-or-ref> --status ... --reason ...`.
- Keep Feishu `/opportunities` read-only; it may render the CLI next step but
  does not append decisions.

## Boundaries

- Only open/deferred `autonomy/opportunities.jsonl` records are targetable.
- Selected live-run opportunities are run provenance and cannot be decided.
- No confirmation request creation.
- No confirmation execution.
- No review or review tick execution.
- No model invocation.
- No SOP, skill, memory, active-vault, or shell command mutation.

## Acceptance

- CLI parsing recognizes `governance decide-opportunity`.
- Decision writes append one JSONL record with previous status and reason.
- Backlog hides completed/retired opportunities after a decision.
- Backlog can show a reopened opportunity after an `open` decision.
- Existing Opportunity Backlog read-only commands continue to pass.

## Verification

```bash
node --import tsx --test tests/opportunity_backlog.test.ts tests/cli.test.ts
pnpm run check
```
