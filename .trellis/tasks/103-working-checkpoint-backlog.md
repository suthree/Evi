# 103 Working Checkpoint Backlog

## Intent

Surface attention-worthy working checkpoints in the ranked Opportunity Backlog
so local goal-loop continuity can become an operator-visible follow-up signal
without executing the checkpoint next action.

## Scope

- Add `working_checkpoint` as a derived Opportunity Backlog item kind.
- Include only checkpoints with open questions or blocked/failed/unfinished/
  resume/stale/gap signals.
- Render bounded checkpoint summary fields in context, governance status, and
  Feishu opportunity views.
- Allow append-only `governance decide-opportunity` decisions for this derived
  item kind.
- Update stable docs and tests.

## Safety Boundary

- Do not read raw evidence artifacts referenced by the checkpoint.
- Do not execute `next_action` or resume a goal loop.
- Do not run review tick or invoke the model.
- Do not mutate memory, SOP, skills, active vault, repo files, or service state.
- Do not turn ordinary quiet save points into backlog noise.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/opportunity_backlog.test.ts tests/context_harness.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts
pnpm run check
```

## Status

Implemented in the working-checkpoint-backlog slice.
