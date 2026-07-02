# 106 Review Tick Focus Governance Visibility

## Intent

Expose the resident review tick loop's latest focus in aggregate governance
operator views so operators can see why the autonomous review loop last looked
at a backlog item without rerunning the tick.

## Scope

- Render review tick `last_tick_ref` and bounded `last_focus` in Feishu
  `/governance`.
- Keep the aggregate governance read model as the source of truth.
- Update stable docs and tests.

## Safety Boundary

- Do not enable review tick automatically.
- Do not rerun review tick from governance rendering.
- Do not request confirmations, execute follow-ups, mutate SOP/skill/memory
  state, write the active vault, write the repo, invoke the model, or run shell
  commands from governance rendering.
- Do not read raw tick Markdown, raw review Markdown, raw episode artifacts, SOP
  bodies, or skill bodies.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/feishu_adapter.test.ts tests/governance_status.test.ts
pnpm run check
```

## Status

Implemented in the review-tick-focus-governance-visibility slice.
