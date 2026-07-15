# SOP Evolution Ledger

## Goal

Expose a bounded read-only ledger that summarizes SOP and skill self-evolution
across state drafts, audits, review follow-up confirmations, episode event refs,
and active-vault skill registry events.

## Scope

- Add a core read model for SOP Evolution Ledger.
- Add `governance evolution`.
- Add Feishu `/evolution` and `/governance evolution`.
- Add a `SOP Evolution Ledger` context section for live runs.
- Keep the view bounded to ids, decisions, refs, counts, latest follow-ups,
  latest skill events, and next-step guidance.

## Non-Goals

- No confirmation request or execution.
- No review tick execution.
- No SOP audit or promotion.
- No skill revision.
- No raw SOP or skill body rendering.
- No active-vault writes.
- No shell command execution.
- No chain repair.

## Acceptance

- `pnpm run runtime -- governance evolution --state-root <root>` returns a
  machine-readable ledger.
- Feishu `/governance evolution` renders the same bounded ledger without
  running the agent.
- Context bundles include a `SOP Evolution Ledger` section.
- Tests prove promoted and reused-skill chains are summarized without raw SOP
  or skill content.
