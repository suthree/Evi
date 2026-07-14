# Task 222: Current Learning State Recovery

Status: implemented

## Problem

The real semantic-memory and dream layers had never completed a state loop, and
selected-skill health permanently counted every historical failed outcome as
current attention. Recovered skills therefore remained noisy in memory layers
and Opportunity Backlog even after newer verified success.

## Scope

- Exercise the existing candidate, confirmation, accepted semantic-memory, and
  dream snapshot path with verified runtime evidence.
- Keep raw selected-skill history and cumulative failure counts append-only.
- Derive current attention from the newest outcome per skill.
- Derive drift only from the consecutive unresolved attention streak after the
  most recent verified pass.
- Suppress recovered historical outcomes from current Opportunity Backlog.

## Non-goals

- No deletion, retirement, or rewrite of selected-skill outcome telemetry.
- No automatic semantic-memory acceptance or dream execution authority.
- No raw skill, context, final-response, or completion body reads in diagnostics.

## Acceptance

- A real accepted semantic memory is selected for context.
- A current dream snapshot cites that memory and the latest verified iteration.
- A newer verified selected-skill outcome closes older current attention while
  preserving historical counts.
- Repeated unresolved latest outcomes still surface as drift.
- Current attention and backlog contain only skills whose newest outcome still
  needs attention.

## Verification

- `node --import tsx --test tests/memory_layers.test.ts tests/selected_skill_outcome_history.test.ts tests/opportunity_backlog.test.ts`
- `pnpm run check`
- `pnpm run runtime -- memory layers --state-root .runtime/state`
- `pnpm run runtime -- governance opportunities --state-root .runtime/state`
