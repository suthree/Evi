# Working Checkpoint Context

## Status

Done

## Goal

Make state-only `update_working_state` checkpoints useful across later runs by
selecting the latest bounded working checkpoint into the live context bundle.

## Acceptance Criteria

- `buildTurnSnapshot` selects `memory/working/current.json` when it is a valid
  working checkpoint.
- If `current.json` is absent or invalid, context assembly can fall back to a
  valid checkpoint under `memory/working/`.
- Context bundles include a `Working Checkpoint` section with goal, current
  step, known constraints, recent evidence refs, open questions, and next
  action.
- The section does not read raw evidence artifacts and does not treat the
  checkpoint as proof of completion.
- The context manifest records the selected checkpoint ref and item count.

## Verification

```bash
node --import tsx --test tests/context_harness.test.ts tests/context_manifest.test.ts
pnpm run check
```
