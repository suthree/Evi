# Task 113: Context Health Read Model

## Goal

Expose corrupt or drifting context manifest sidecars as a bounded local
read-only health signal.

## Scope

- Add core `context health` diagnostics for invalid `*-context.json`, missing
  `*-context.md`, and orphan context Markdown sidecars.
- Add CLI `context health`.
- Add Feishu `/context health`.
- Surface `context_health` in Opportunity Backlog, context, governance status,
  and Feishu opportunity views.
- Allow append-only Opportunity Backlog decisions for `context_health` items.
- Document the runtime contract and MVP spec.

## Non-goals

- Do not read raw context Markdown.
- Do not repair, delete, compact, or rewrite context state.
- Do not invoke the model or run shell commands from read-only surfaces.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/context_health.test.ts tests/cli.test.ts tests/feishu_adapter.test.ts tests/opportunity_backlog.test.ts tests/governance_status.test.ts tests/context_harness.test.ts`
- `pnpm run check`
