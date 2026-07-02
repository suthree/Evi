# Reused Skill Coverage Read Model

## Status

Done

## Goal

Expose a read-only operator view that validates whether a reused-skill SOP chain
is still covered by the current local skill registry before any `revise_skill`
confirmation writes validation evidence.

## Scope

- Add a core coverage report for one SOP draft.
- Compare recorded duplicate skill refs from the SOP Evolution Ledger with the
  current skill registry and current recall duplicate.
- Surface coverage status, recall hits, missing refs, evidence refs, and next
  step guidance without rendering raw skill bodies.
- Add CLI `review coverage --sop <sop>`.
- Add Feishu `/review coverage <sop>` operator view.
- Point open `revise_skill` inbox items, pending `revise_skill` confirmations,
  and Opportunity Backlog next steps at the coverage report before execution.

## Acceptance

- Coverage is read-only and does not append episode evidence or mutate state.
- Covered, drifted, missing-skill, and no-reuse-evidence states are explicit.
- CLI parsing, Feishu rendering, backlog guidance, and review runner behavior
  have focused tests.
- Focused tests, typecheck, and full checks pass.
