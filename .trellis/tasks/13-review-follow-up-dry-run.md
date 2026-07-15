# Task 13: Review Follow-Up Dry Run

## Goal

Plan explicit follow-up actions for a selected background-review proposal
without executing them.

## Scope

- Add `review plan-follow-up`.
- Accept `--review` as either a review id or a review JSON ref.
- Require a selected `--proposal`.
- Read the background-review report and selected proposal.
- Use `chain_summaries` when available to classify SOP follow-up.
- Return a structured dry-run action plan with commands and expected write
  surfaces.

## Non-Goals

- No automatic SOP draft creation.
- No automatic audit.
- No automatic promotion.
- No active-vault writes.
- No episode evidence append.
- No background scheduler or executor.

## Acceptance

- `pnpm run runtime -- review plan-follow-up --review <review> --proposal <proposal> --state-root <root>` returns a machine-readable dry-run plan.
- Audited-but-undecided SOP chains plan an explicit `review promote-sop`
  follow-up when an audit ref is available.
- Reused-skill chains plan inspection or skill-revision follow-up instead of
  duplicate SOP drafting or promotion.
- Tests prove the command does not append episode evidence.
- `pnpm run check` passes.
