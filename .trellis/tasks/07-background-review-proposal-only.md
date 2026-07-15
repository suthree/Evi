# Task 07: Background Review Proposal-Only

## Goal

Use the local MemoryStore to review episode evidence and propose self-evolution
next actions without automatically changing SOPs or skills.

## Reference Signals

- Hermes: durable session archive, FTS search, and bounded session windows.
- GenericAgent: long-term memory updates should follow verified evidence.
- OpenClaw: runtime workflow changes should keep command/test gates explicit.

## Scope

- Add a `review background` CLI action.
- Support recent, query-scoped, and session-scoped review modes.
- Write review JSON and Markdown artifacts under `autonomy/reviews/`.
- Append an evidence event for the review artifact.
- Produce proposal types such as SOP candidate, skill revision, memory gap, and runtime gap.
- Keep all output proposal-only.

## Non-Goals

- No automatic SOP draft creation.
- No skill promotion or active-vault writes.
- No background scheduler.
- No vector or hybrid ranking.
- No repository writes from the review runner.

## Acceptance

- `pnpm run runtime -- review background --state-root <root>` writes review artifacts.
- `--query` narrows review through MemoryStore search.
- `--session` narrows review to a session window.
- Empty evidence produces a memory-gap proposal, not a fake improvement.
- Tests prove review artifacts are state-only and proposal-only.
- `pnpm run check` passes.
