# Memory Layer Diagnostic

## Status

Done

## Goal

Expose a bounded read-only view of memory and local-learning layers so operators
can see what feeds context, what stays on-demand, and what needs attention.

## Scope

- Add a `memory layers` CLI read model.
- Report episode recall, accepted semantic memory, memory governance queue,
  working checkpoints, episode archives, and selected-skill outcome telemetry.
- Include state refs, counts, context role, selected-for-context signal,
  attention status, and next inspection commands.
- Keep the view metadata-only and safe for prompt-budget diagnostics.

## Non-Goals

- No MemoryStore index rebuild.
- No episode archive generation.
- No raw episode artifact reads.
- No semantic memory or candidate content rendering.
- No confirmation execution.
- No model invocation.
- No state, repo, active-vault, or external writes.

## Acceptance

- `pnpm run runtime -- memory layers --state-root .runtime/state` prints the
  layer diagnostic.
- Tests cover context entrypoint classification, attention signals, no SQLite
  index creation, and no raw content leakage.
- Runtime contract and local learning docs list the command and safety boundary.
