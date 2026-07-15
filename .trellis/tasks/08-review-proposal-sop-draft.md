# Task 08: Review Proposal To SOP Draft

## Goal

Turn evidence-backed background review proposals into explicit, state-only SOP
draft candidates.

## Scope

- Add `review draft-sop`.
- Accept `--review` as either a review id or a review JSON ref.
- Require `--proposal`.
- Create `sop/drafts/*.json` and `sop/drafts/*.md` state artifacts using the existing SOP schema and formatter.
- Append an episode evidence event for the draft.
- Reject proposals without evidence refs.
- Reject memory-gap and runtime-gap proposals for SOP draft creation.

## Non-Goals

- No active-vault writes.
- No repository writes.
- No automatic audit.
- No SOP promotion.
- No skill package creation.
- No background scheduler.

## Acceptance

- `pnpm run runtime -- review draft-sop --review <review> --proposal <proposal> --state-root <root>` writes JSON and Markdown state SOP drafts.
- The SOP draft includes the review ref and proposal evidence refs.
- Ineligible proposals fail clearly.
- Tests prove the command is state-only.
- `pnpm run check` passes.
