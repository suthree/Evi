# Task 213: Pressure-Aware Episode Recall Limit

Status: implemented

## Problem

The runtime could diagnose context pressure and render an Attention Plan, but
the next live run still injected the same default episode recall count. That
left the model exposed to avoidable recall noise after the system had already
identified recall as the pressure source.

## Scope

- Keep the default episode recall cap at 4 hits.
- Read latest non-ok context-pressure metadata before live context assembly.
- When guidance is `reduce_episode_recall`, lower the next episode recall cap
  to 1 hit.
- Record a bounded evidence event explaining the recall limit decision.
- Preserve selected-skill recall behavior.

## Non-Goals

- No automatic compaction.
- No transcript rewriting.
- No deletion or mutation of prior memory.
- No raw context Markdown reads.
- No MemoryStore index rebuild.
- No general context assembly rewriter.

## Verification

- `node --import tsx --test tests/context_harness.test.ts`
- `pnpm run build`
