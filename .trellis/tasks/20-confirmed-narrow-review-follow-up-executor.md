# Task 20: Confirmed Narrow Review Follow-Up Executor

## Goal

Execute confirmed `narrow_review` follow-up actions through the same pending
confirmation envelope used by SOP follow-up actions.

## Scope

- Extend `review execute-confirmed-follow-up` to support `narrow_review`.
- Require a pending confirmation request from `autonomy/followups/`.
- Recompute the dry-run follow-up plan and verify the selected action still
  exists with kind `narrow_review`.
- Execute one query-scoped background review using the original runtime-gap
  proposal title.
- Mark the confirmation request as `executed`.
- Append evidence for the confirmed execution.

## Non-Goals

- No SOP draft, audit, or promotion through a `narrow_review` confirmation.
- No skill revision executor.
- No active-vault writes.
- No shell command execution.
- No chain repair.

## Acceptance

- `pnpm run runtime -- review execute-confirmed-follow-up --confirmation <confirmation> --state-root <root>` executes a confirmed `narrow_review` request.
- The confirmation artifact records the narrowed review refs.
- Re-running the same confirmation is rejected.
- `pnpm run check` passes.
