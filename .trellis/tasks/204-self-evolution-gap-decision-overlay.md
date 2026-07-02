# Task 204: Self-Evolution Gap Decision Overlay

Status: implemented

## Problem

`governance gaps` derives current gap records from bounded evidence, while
Opportunity Backlog applies append-only opportunity decisions. A gap that was
already completed or retired could therefore still appear with
`status=active` in the gap read model, even though the backlog correctly hid it.
That made completed self-evolution work look active during operator inspection.

## Scope

- Keep the raw derived gap `status` unchanged.
- Add decision-aware `effective_status` to gap list/detail output.
- Attach the latest self-evolution opportunity decision summary when one
  exists.
- Add effective status counts to the gap list result.
- Keep Opportunity Backlog filtering semantics unchanged.

## Non-goals

- No mutation of gap evidence, opportunity decisions, review inbox, SOPs,
  skills, memory, repository files, or active vault.
- No automatic reopening, completion, or retirement decisions.
- No browser automation, MCP calls, model calls, or external publishing.

## Acceptance

- A gap without decisions reports `effective_status=active` or `waiting`.
- A deferred gap remains visible with `effective_status=deferred`.
- A completed gap remains inspectable in `governance gaps` with
  `effective_status=completed`, while Opportunity Backlog suppresses it.
- Gap detail returns the same latest decision summary as the list view.

## Verification

- `pnpm exec tsx --test tests/self_evolution_gaps.test.ts`
- `pnpm run runtime -- governance gaps --state-root <state-root>`
- `pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>`
