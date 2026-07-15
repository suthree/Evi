# Task 207: Self-Evolution Gap SOP Context

Status: implemented

## Problem

Self-evolution gaps could be routed into `draft_sop` inbox items and pass the
normal confirmation readiness gate, but the later state-only SOP draft still
used the generic background-review template. That lost the gap's proposed
slice, inspection command, acceptance criteria, verification commands, and
non-goals, making the resulting SOP less useful for future self-evolution.

## Scope

- Preserve self-evolution gap metadata on SOP-candidate background review
  proposals.
- Carry gap acceptance criteria, non-goals, inspection command, and
  verification commands from the gap read model through Opportunity Backlog.
- Generate state-only SOP drafts from self-evolution gap metadata when present.
- Keep old background review proposals compatible with the generic SOP draft
  template.

## Non-goals

- No automatic promotion or active-vault write.
- No model calls, external publishing, browser automation, MCP calls, or repo
  mutation.
- No requirement that historical background review artifacts contain the new
  optional metadata.
- No broad redesign of SOP drafting or audit policy.

## Acceptance

- A self-evolution `sop_candidate` proposal records gap metadata.
- Its executed `draft_sop` confirmation produces a state-only SOP draft whose
  trigger/procedure/verification/failure modes mention the gap slice,
  verification commands, and non-goals.
- Generic non-gap SOP proposals keep their existing behavior.

## Verification

- `pnpm exec tsx --test tests/background_review.test.ts tests/opportunity_backlog.test.ts tests/self_evolution_gaps.test.ts`
- `pnpm run build`
- `pnpm run check`
