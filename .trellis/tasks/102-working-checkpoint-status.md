# 102 Working Checkpoint Status

## Intent

Expose bounded working checkpoints as an operator-visible progress read model,
following the durable goal/progress signal pattern from GA, Hermes, and
OpenClaw while preserving local runtime's local read-only boundaries.

## Scope

- Add a core read model over `memory/working/*.json`.
- Include current checkpoint, recent checkpoint refs, checkpoint fields,
  bounded open questions, evidence ref counts, and episode event refs that cite
  a checkpoint.
- Add CLI `memory working` and `memory working --checkpoint <ref-or-id>`.
- Add Feishu `/working` and `/working <ref-or-id>`.
- Include the current working checkpoint summary in governance status.
- Update stable docs and tests.

## Safety Boundary

- Do not read raw evidence artifacts referenced by the checkpoint.
- Do not execute `next_action`.
- Do not resume a goal loop, run review tick, or invoke the model.
- Do not mutate memory, SOP, skills, active vault, repo files, or service state.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/working_checkpoints.test.ts tests/cli.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts tests/stage_runner.test.ts tests/context_harness.test.ts
pnpm run check
```

## Status

Implemented in the working-checkpoint-status slice.
