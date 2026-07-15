# Task 19: Confirmed Promotion Follow-Up Executor

## Goal

Execute confirmed `promote_sop` follow-up actions through the same pending
confirmation envelope used by draft and audit follow-ups.

## Scope

- Extend `review execute-confirmed-follow-up` to support `promote_sop`.
- Require a pending confirmation request from `autonomy/followups/`.
- Recompute the dry-run follow-up plan and verify the selected action still
  exists with kind `promote_sop`.
- Require injected runtime vault config and the runtime promotion gate.
- Reuse the existing explicit SOP promotion path and duplicate-skill protection.
- Mark the confirmation request as `executed`.
- Append evidence for the confirmed execution.

## Non-Goals

- No skill revision executor.
- No shell command execution.
- No narrowed background-review execution.
- No chain repair.
- No bypass of `runtime.promotion_enabled`.

## Acceptance

- `pnpm run runtime -- review execute-confirmed-follow-up --confirmation <confirmation> --state-root <root>` executes a confirmed `promote_sop` request when promotion is enabled.
- The confirmation artifact records SOP, audit, skill, candidate, registry, and skill-event refs.
- Re-running the same confirmation is rejected.
- Promotion is rejected without vault config.
- `pnpm run check` passes.
