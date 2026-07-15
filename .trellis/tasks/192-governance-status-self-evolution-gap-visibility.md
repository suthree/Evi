# Task 192: Governance Status Self-Evolution Gap Visibility

Status: implemented

## Problem

The Opportunity Backlog exposed waiting post-publish feedback gaps with
`not_before_at`, but aggregate `governance status` only kept generic top-item
fields. Operators could see that the backlog was waiting, but the status view
did not explain which self-evolution slice was waiting, when it should be
reviewed again, or which bounded verification command was appropriate.

## Scope

- Preserve `self_evolution_gap` metadata on the governance status top item.
- Render self-evolution slice, source, evidence count, `not_before_at`, and
  inspect guidance in Feishu governance status.
- Keep the status command read-only and bounded to read-model metadata.
- Add regression coverage using the real content-run to feedback-gap path.

## Non-goals

- No automatic execution of waiting feedback gaps before their stable window.
- No browser automation, MCP calls, model calls, external publishing, or repo
  writes from the status command.
- No changes to the gap ranking or derivation policy.

## Acceptance

- `governance status` includes top-item `self_evolution_gap` metadata for a
  waiting post-publish feedback gap.
- The top item keeps the `post_publish_feedback_stable_window` proposed slice
  and its `not_before_at` timestamp.
- Feishu `/governance` can render the same bounded self-evolution guidance.
- Existing opportunity action chains remain unchanged.

## Verification

- `pnpm exec tsx --test tests/governance_status.test.ts tests/self_evolution_gaps.test.ts tests/opportunity_backlog.test.ts`
- `pnpm exec tsx --test tests/feishu_adapter.test.ts tests/governance_status.test.ts`
- `pnpm run check`
