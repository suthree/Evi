# Task 23: Review Tick Self-Evolution Inbox

## Goal

Run one bounded self-evolution review tick and materialize follow-up actions as
a stable state-only inbox.

## Scope

- Add `review tick`.
- Reuse background review scope controls: recent, query, and session.
- Run one background review.
- Plan follow-up actions for every proposal in that review.
- Write stable inbox item JSON artifacts under `autonomy/inbox/`.
- Exclude per-run review artifact refs from the stable inbox id.
- Preserve an existing inbox item's `first_review_ref` and increment
  `seen_count` on repeated ticks.
- Write a tick JSON/Markdown report under `autonomy/ticks/`.
- Append episode evidence for the tick.

## Non-Goals

- No confirmation request creation.
- No follow-up execution.
- No active-vault writes.
- No SOP draft, audit, or promotion through the tick.
- No skill revision through the tick.
- No shell command execution.
- No chain repair.

## Acceptance

- `pnpm run runtime -- review tick --state-root <root>` writes a tick report and inbox items.
- Re-running the same scoped tick updates the existing inbox item instead of creating a duplicate.
- The tick does not create confirmations or write the active vault.
- `pnpm run check` passes.
