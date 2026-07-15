# Task 175: Source Quality Gap Noise Control

Status: implemented

## Problem

Source freshness and hotness are now part of active exploration, but the gap
read model should not turn every stale side source or historical weak run into a
new active iteration focus. That noise can hide the latest actionable source
problem and make the self-evolution loop chase already-addressed evidence.

## Scope

- Treat source-quality gaps as active only for missing fresh usable coverage,
  severe fetch failures, mostly absent freshness metadata, mostly stale source
  evidence, or excessive duplicate evidence.
- Do not create an active source-quality gap for one non-critical stale source
  when the same run still has fresh usable news and market quote coverage.
- Suppress older equivalent source-quality gaps when a later daily AI
  Xiaohongshu run in the same workflow family and publish adapter records
  strong bounded source evidence.
- Keep suppression inside read models only; do not rewrite historical
  `content/runs/...` artifacts.
- Update docs and regression tests.

## Non-goals

- No deletion, rewriting, or completion decisions for historical state files.
- No browser automation, model calls, MCP calls, image generation, or external
  publishing from gap reads.
- No hiding current weak-source runs when they are still the latest equivalent
  daily evidence.
- No investment advice claims from market hotness or source quality scoring.

## Acceptance

- `governance gaps` does not surface source-quality gaps for runs with fresh
  usable source coverage plus only non-critical stale side sources.
- Older equivalent source-quality gaps disappear from the read model after a
  later strong daily run exists in the same workflow family and publish
  adapter.
- Current unsuperseded weak source runs still derive source-quality gaps.
- Documentation explains that suppression is read-model noise control, not
  historical state mutation.

## Verification

- `pnpm exec tsx --test tests/self_evolution_gaps.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run check`
