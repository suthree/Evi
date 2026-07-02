# Task 114: Context Health Review Tick Focus

## Goal

Let context manifest sidecar health issues enter the gated self-evolution
review loop instead of stopping at operator visibility.

## Scope

- Treat top `context_health` Opportunity Backlog items as unscoped review tick
  queryable focus.
- Preserve bounded focus metadata in review tick JSON and Markdown reports.
- Include only structured refs, status, action, summary, and source refs in the
  query.
- Document the review tick policy and decision.

## Non-goals

- Do not read raw context Markdown.
- Do not repair, delete, compact, or rewrite context state.
- Do not request confirmations or execute follow-ups from focus selection.
- Do not run shell commands from read-only surfaces.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/background_review.test.ts tests/opportunity_backlog.test.ts tests/context_health.test.ts`
- `pnpm run check`
