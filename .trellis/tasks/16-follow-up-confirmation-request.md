# Task 16: Follow-Up Confirmation Request

## Goal

Record operator confirmation intent for mutation follow-up actions before any
future mutation executor exists.

## Scope

- Add `review request-follow-up`.
- Require `--review`, `--proposal`, and a stable follow-up `--action`.
- Recompute the dry-run plan and select the requested action by id.
- Accept only actions that would write state or the active vault.
- Write a pending confirmation envelope under `autonomy/followups/`.
- Write a Markdown companion for human review.
- Append episode evidence for the confirmation request.

## Non-Goals

- No direct execution of the selected action.
- No SOP draft creation.
- No SOP audit.
- No SOP promotion.
- No skill revision executor.
- No active-vault writes.

## Acceptance

- `pnpm run runtime -- review request-follow-up --review <review> --proposal <proposal> --action <action> --state-root <root>` writes a pending confirmation request for mutation actions.
- Read-only actions are rejected because they do not require mutation
  confirmation.
- The confirmation request records the selected action, required refs, expected
  write surfaces, safety boundary, and next step.
- Tests prove the request writes state evidence but does not execute the
  selected mutation.
- `pnpm run check` passes.
