# Task 14: Stable Review Follow-Up Actions

## Goal

Make dry-run review follow-up actions stable enough for later operator
selection and execution gates.

## Scope

- Replace random follow-up action ids with deterministic ids.
- Derive action ids from review ref, proposal id, action kind, and action
  target.
- Keep action ids stable across repeated dry-run planning for the same
  review/proposal pair.
- Preserve the existing dry-run boundary.

## Non-Goals

- No follow-up executor.
- No automatic SOP draft creation.
- No automatic audit.
- No automatic promotion.
- No active-vault writes.
- No episode evidence append.

## Acceptance

- Calling `review plan-follow-up` repeatedly for the same review and proposal
  returns the same action ids.
- Tests prove repeated planning returns the same action list.
- Tests prove repeated planning does not append episode evidence.
- `pnpm run check` passes.
