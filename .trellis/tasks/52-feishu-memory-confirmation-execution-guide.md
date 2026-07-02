# Feishu Memory Confirmation Execution Guide

## Status

Done

## Goal

Show the explicit CLI execution command in Feishu memory confirmation details,
so the operator can accept an already requested memory candidate through the
existing local confirmation executor without giving IM mutation authority.

## Acceptance Criteria

- `/memory confirmation <ref-or-id>` includes an `Execution gate` section.
- Pending confirmations show
  `pnpm run runtime -- memory execute-candidate-confirmation --confirmation <confirmation>`.
- Executed confirmations show accepted-memory execution result state and do not
  suggest a new execution command.
- The command is rendered only as text; Feishu does not execute memory
  confirmations, accept memory, rebuild MemoryStore indexes, write the active
  vault, invoke the model, or run shell commands.

## Verification

```bash
node --import tsx --test tests/feishu_adapter.test.ts tests/memory_candidates.test.ts tests/cli.test.ts
pnpm run check
```
