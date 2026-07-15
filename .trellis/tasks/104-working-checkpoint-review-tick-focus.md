# 104 Working Checkpoint Review Tick Focus

## Intent

Let an attention-worthy working checkpoint drive the next unscoped review tick
focus so interrupted goal-loop continuity can become a gated runtime follow-up
without executing the checkpoint next action.

## Scope

- Treat top `working_checkpoint` Opportunity Backlog items as review tick focus.
- Keep the background review in recent mode so it reads the bounded latest
  checkpoint intake and can emit a `runtime_gap` proposal.
- Materialize the resulting proposal through the existing state-only inbox and
  confirmation gate.
- Update stable docs and tests.

## Safety Boundary

- Do not turn the checkpoint into an automatic query that drops checkpoint
  intake.
- Do not execute `next_action` or resume a goal loop.
- Do not read raw evidence artifacts referenced by the checkpoint.
- Do not request confirmations, execute follow-ups, mutate SOP/skill/memory
  state, write the active vault, write the repo, invoke the model, or run shell
  commands from review tick focus selection.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/background_review.test.ts
pnpm run check
```

## Status

Implemented in the working-checkpoint-review-tick-focus slice.
