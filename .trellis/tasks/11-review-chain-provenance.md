# Task 11: Review Chain Provenance

## Goal

Expose a read-only provenance view for a state SOP draft and its review,
audit, promotion, and reuse evidence.

## Scope

- Add `review chain`.
- Require `--sop`.
- Read `sop/drafts/*.json` from the selected state root.
- Read append-only `memory/episodes/events.jsonl` directly as the provenance
  source of truth.
- Return related review refs, audit refs, skill refs, duplicate skill refs,
  artifact refs, and episode events.
- Report aggregate status for SOP status, audit count, promotion event count,
  reuse event count, and latest decision.

## Non-Goals

- No state writes.
- No active-vault writes.
- No audit, promotion, or skill package creation.
- No automatic repair of broken chains.
- No vector or hybrid search.

## Acceptance

- `pnpm run runtime -- review chain --sop <sop> --state-root <root>` returns a machine-readable chain.
- The chain includes draft, audit, promotion, and reuse events when present.
- Tests prove the command is read-only and reconstructs refs from episode evidence.
- `pnpm run check` passes.
