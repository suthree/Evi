# Task 191: Governance Act Next Harness Replay Audit

Status: implemented

## Problem

Completion verification and repo write guard items were visible in the
opportunity backlog, but `governance act-next` could not act on them. Operators
could inspect reports and traces, yet the self-evolution loop had no typed
executor step for turning bounded runtime evidence into a replay audit.

## Scope

- Support `completion_verification` backlog items in `governance act-next`.
- Support `repo_write_guard` backlog items in `governance act-next`.
- Reuse the existing state-only harness replay audit implementation.
- Expose `act_next` action-chain steps for both backlog item kinds.
- Keep the executor bounded to local state writes; do not invoke models, run
  tools, mutate repo files, or write the active vault.

## Acceptance

- Failed completion verification items can produce a replay audit through the
  typed opportunity executor.
- Repo write guard items can produce a replay audit through the typed
  opportunity executor.
- Action records include completion id, trace ref, replay refs, replay status,
  and warning count.
- Backlog action chains show an `act_next` runtime execution step for supported
  completion and repo-write guard items.
- Raw model, tool, delegated, context, and final-response bodies do not leak
  into action results or replay summaries.

## Verification

- `pnpm exec node --import tsx --test tests/opportunity_actions.test.ts tests/opportunity_backlog.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
