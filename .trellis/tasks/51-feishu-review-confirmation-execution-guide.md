# Feishu Review Confirmation Execution Guide

## Status

Done

## Goal

Show the explicit CLI execution command in Feishu review confirmation details,
so the operator can run an already requested self-evolution follow-up through
the existing local confirmation executor without giving IM mutation authority.

## Acceptance Criteria

- `/review confirmation <ref-or-id>` includes an `Execution gate` section.
- Pending confirmations show
  `pnpm run runtime -- review execute-confirmed-follow-up --confirmation <confirmation>`.
- Executed confirmations show execution result state and do not suggest a new
  execution command.
- The command is rendered only as text; Feishu does not execute follow-up
  actions, draft, audit, promote, revise skills, collect evidence, run narrowed
  background review, write the active vault, invoke the model, or run shell
  commands.

## Verification

```bash
node --import tsx --test tests/feishu_adapter.test.ts tests/background_review.test.ts tests/cli.test.ts
pnpm run check
```
