# 105 Opportunity Decision Command Guidance

## Intent

Make explicit Opportunity Backlog decisions easier to record by rendering the
matching `governance decide-opportunity` CLI command on eligible read-only
operator surfaces.

## Scope

- Add a shared Opportunity Backlog read-model field for decision command
  guidance.
- Render the field in context, aggregate governance status, and Feishu
  `/governance opportunities`.
- Keep the command as copyable operator guidance only.
- Update stable docs and tests.

## Safety Boundary

- Do not append decisions from context, governance status, Feishu, review tick,
  or the resident service.
- Do not expose decision commands for pending confirmations, review inbox items,
  memory confirmations, memory candidates, autonomy pauses, or SOP mutation
  gates.
- Do not read raw artifacts, request confirmations, execute follow-ups, mutate
  SOP/skill/memory state, write the active vault, write the repo, invoke the
  model, or run shell commands from read-only renderers.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/opportunity_backlog.test.ts tests/context_harness.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts
pnpm run check
```

## Status

Implemented in the opportunity-decision-command-guidance slice.
