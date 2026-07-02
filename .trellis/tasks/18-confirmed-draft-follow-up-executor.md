# Task 18: Confirmed Draft Follow-Up Executor

## Goal

Execute confirmed `draft_sop` follow-up actions through the same pending
confirmation envelope used by state-only audit follow-ups.

## Scope

- Extend `review execute-confirmed-follow-up` to support `draft_sop`.
- Require a pending confirmation request from `autonomy/followups/`.
- Recompute the dry-run follow-up plan and verify the selected action still
  exists with kind `draft_sop`.
- Execute state-only SOP draft creation.
- Mark the confirmation request as `executed`.
- Append evidence for the confirmed execution.

## Non-Goals

- No SOP promotion executor.
- No skill revision executor.
- No active-vault writes.
- No shell command execution.
- No narrowed background-review execution.

## Acceptance

- `pnpm run runtime -- review execute-confirmed-follow-up --confirmation <confirmation> --state-root <root>` executes a confirmed `draft_sop` request.
- The confirmation artifact records SOP draft refs.
- Re-running the same confirmation is rejected.
- Unsupported confirmation action kinds are rejected.
- `pnpm run check` passes.
