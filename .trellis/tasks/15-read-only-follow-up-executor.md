# Task 15: Read-Only Follow-Up Executor

## Goal

Add the first operator-gated follow-up executor without opening mutation
actions.

## Scope

- Add `review execute-follow-up`.
- Require `--review`, `--proposal`, and a stable follow-up `--action`.
- Recompute the dry-run plan and select the requested action by id.
- Execute only read-only `inspect_chain` actions.
- Return the same machine-readable chain result as `review chain`.
- Reject follow-up actions that would write state or the active vault.

## Non-Goals

- No automatic SOP draft creation.
- No automatic audit.
- No automatic promotion.
- No skill revision executor.
- No active-vault writes.
- No episode evidence append.

## Acceptance

- `pnpm run runtime -- review execute-follow-up --review <review> --proposal <proposal> --action <action> --state-root <root>` executes read-only chain inspection when the selected action is `inspect_chain`.
- The command rejects `draft_sop`, `audit_sop`, `promote_sop`, `revise_skill`,
  `collect_evidence`, and `narrow_review` actions.
- Tests prove read-only execution does not append episode evidence.
- `pnpm run check` passes.
