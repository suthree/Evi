# Task 12: Chain-Aware Background Review

## Goal

Use SOP self-evolution chain state when background review creates proposals.

## Scope

- Add `chain_summaries` to background review reports.
- Reconstruct chain summaries from reviewed episode events that reference SOP
  drafts.
- Include chain summaries in Markdown review artifacts.
- Prefer chain-aware proposals for reused-skill chains.
- Propose explicit promotion decisions when a chain has an audit but no
  promotion or reuse decision.

## Non-Goals

- No automatic SOP draft creation.
- No automatic audit.
- No automatic promotion.
- No active-vault writes.
- No chain repair or state mutation.

## Acceptance

- `review background` reports chain summaries when reviewed events reference a
  state SOP draft.
- Audited-but-undecided chains produce a proposal to complete the promotion
  decision.
- Reused-skill chains produce guidance to verify skill coverage before changing
  SOPs.
- Tests prove proposal behavior is driven by chain state.
- `pnpm run check` passes.
