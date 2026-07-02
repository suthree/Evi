# Task 17: Confirmed Audit Follow-Up Executor

## Goal

Execute the first mutation follow-up action through a pending confirmation
request.

## Scope

- Add `review execute-confirmed-follow-up`.
- Require `--confirmation`.
- Read a pending confirmation request from `autonomy/followups/`.
- Recompute the dry-run follow-up plan and verify the selected action still
  exists.
- Execute only `audit_sop`.
- Mark the confirmation request as `executed`.
- Append evidence for the confirmed execution.

## Non-Goals

- No SOP draft executor.
- No SOP promotion executor.
- No skill revision executor.
- No active-vault writes.
- No shell command execution.

## Acceptance

- `pnpm run runtime -- review execute-confirmed-follow-up --confirmation <confirmation> --state-root <root>` executes a confirmed `audit_sop` request.
- The confirmation artifact records execution result refs.
- Re-running the same confirmation is rejected.
- Unsupported confirmation action kinds are rejected.
- `pnpm run check` passes.
