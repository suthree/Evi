# Task 206: Self-Evolution Gap SOP Readiness

Status: implemented

## Problem

Review tick could route a `sop_candidate` self-evolution gap into a
`draft_sop` inbox item, but the draft SOP readiness gate primarily trusted
background review episode failure/SOP counters. Content feedback gaps are
bounded state evidence, not necessarily episode failure evidence, so a valid
self-evolution gap could materialize an inbox item but fail to request the
normal SOP confirmation.

## Scope

- Include the `self-evolution/gaps/*.json` ref in SOP-candidate review
  proposals derived from self-evolution gaps.
- Treat explicit self-evolution gap refs as bounded evidence for
  `draft_sop_readiness`.
- Preserve the existing review inbox and confirmation gate: no direct SOP
  drafting, audit, promotion, or active-vault write happens from gap reads.
- Add regression coverage from content feedback gap to review tick inbox and
  draft SOP confirmation readiness.

## Non-goals

- No automatic execution of the pending confirmation.
- No model calls, MCP calls, browser automation, external publishing, repo
  mutation, or active-vault mutation.
- No relaxation for evidence-free background reviews.
- No changes to same-title or evidence-linked duplicate SOP coverage.

## Acceptance

- A weak post-publish feedback gap produces a `draft_sop` inbox item whose
  required refs include the gap ref.
- Requesting confirmation for that inbox item records
  `draft_sop_readiness.status=ready` even when background review failure/SOP
  counters are zero.
- The confirmation remains pending and state-only; later execution still
  revalidates readiness.

## Verification

- `pnpm exec tsx --test tests/background_review.test.ts tests/opportunity_backlog.test.ts tests/self_evolution_gaps.test.ts`
- `pnpm run check`
