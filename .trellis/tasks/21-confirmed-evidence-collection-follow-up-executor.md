# Task 21: Confirmed Evidence Collection Follow-Up Executor

## Goal

Execute confirmed `collect_evidence` follow-up actions through the same pending
confirmation envelope used by other review follow-up actions.

## Scope

- Extend `review execute-confirmed-follow-up` to support `collect_evidence`.
- Require a pending confirmation request from `autonomy/followups/`.
- Recompute the dry-run follow-up plan and verify the selected action still
  exists with kind `collect_evidence`.
- Write a state-only evidence collection report under `autonomy/reports/`.
- Include current episode-memory sync and stats.
- Mark the confirmation request as `executed`.
- Append evidence for the confirmed execution.

## Non-Goals

- No claim that missing external evidence was collected.
- No SOP draft, audit, or promotion through a `collect_evidence` confirmation.
- No skill revision executor.
- No active-vault writes.
- No shell command execution.
- No chain repair.

## Acceptance

- `pnpm run runtime -- review execute-confirmed-follow-up --confirmation <confirmation> --state-root <root>` executes a confirmed `collect_evidence` request.
- The confirmation artifact records evidence collection report refs.
- Re-running the same confirmation is rejected.
- `pnpm run check` passes.
