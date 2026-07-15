# Task 208: Feedback Strategy Preview Review

Status: implemented

## Problem

Feedback strategy could already generate a local next-generation dry-run, but
self-evolution treated that as enough once `strategy.source_run_id` existed.
That left no explicit local review artifact showing whether the generated
preview should influence the next daily post.

## Scope

- Derive a self-evolution gap for applied feedback-strategy dry-runs that lack a
  bounded preview review.
- Expose the gap as an `act_next` Opportunity Backlog item.
- Let `governance act-next` write `content/strategy-reviews/*.json` with source
  and generated run refs, posture, applied status, title-change status,
  guardrail, evidence refs, and next commands.
- Suppress the gap once the preview review artifact exists.

## Non-goals

- No external Xiaohongshu publishing.
- No browser automation, platform feedback capture, or cookie reads.
- No model or image API calls.
- No full draft-body exposure in the review artifact.
- No repo writes or active-vault writes from the runtime action.

## Acceptance

- A generated feedback-strategy dry-run appears as
  `feedback_strategy_preview_review` until reviewed.
- `governance act-next` records a bounded local review and action audit.
- The preview gap disappears after the review artifact is present.
- Existing feedback strategy next-generation behavior remains intact.

## Verification

- `pnpm exec tsx --test tests/self_evolution_gaps.test.ts tests/content_pipeline.test.ts tests/opportunity_actions.test.ts`
- `pnpm run build`
- `pnpm run check`
