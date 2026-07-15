# Feishu Memory Candidate Gate Guide

## Status

Done

## Goal

Show the explicit CLI confirmation-request command in Feishu memory candidate
details, so the operator can move an inspected memory proposal to the existing
confirmation gate without giving IM mutation authority.

## Acceptance Criteria

- `/memory candidate <ref-or-id>` includes a `Confirmation gate` section.
- Eligible candidates show
  `pnpm run runtime -- memory request-candidate-confirmation --candidate <candidate>`.
- Candidates with an existing confirmation show the confirmation inspection
  command.
- Accepted candidates show the accepted-memory inspection command.
- The command is rendered only as text; Feishu does not request confirmations,
  execute confirmations, accept memory, rebuild MemoryStore indexes, write the
  active vault, invoke the model, or run shell commands.

## Verification

```bash
node --import tsx --test tests/feishu_adapter.test.ts tests/memory_candidates.test.ts tests/cli.test.ts
pnpm run check
```
