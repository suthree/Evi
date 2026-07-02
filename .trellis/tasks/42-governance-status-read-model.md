# Governance Status Read Model

## Status

Done

## Goal

Provide one read-only operator view for the current local governance queue
across memory candidates, memory confirmations, accepted semantic memory,
review inbox items, review follow-up confirmations, service heartbeat, review
tick status, and active autonomy pause state.

## Acceptance Criteria

- `pnpm run runtime -- governance status --state-root .runtime-state` returns a
  JSON aggregate with counts and latest refs.
- Feishu `/governance` and `/governance status` render the same aggregate as a
  concise private-chat operator view.
- The aggregate is read-only and does not request confirmations, execute
  confirmations, run review, run review tick, rebuild MemoryStore indexes,
  invoke the model, run shell commands, or write the active vault.
- Tests cover the pure read model, CLI parsing, and Feishu operator command
  routing.

## Verification

```bash
node --import tsx --test tests/cli.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts
pnpm run check
```
