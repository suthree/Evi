# Task 29: Review Inbox Execution Read Model

## Goal

Keep the self-evolution inbox operator view aligned with confirmed follow-up
execution state.

## Scope

- Add terminal `executed` status for review inbox items.
- When `review execute-confirmed-follow-up` executes a confirmation that was
  requested from an inbox item, update the linked inbox item to `executed`.
- Record confirmation refs, execution result summary, and execution evidence
  refs on the inbox item.
- Make default `review inbox` listing an active view that omits executed items.
- Add `review inbox --status active|all|open|confirmation_requested|executed`.
- Preserve direct `review inbox --item <item>` inspection for terminal items.

## Non-Goals

- No new follow-up execution path.
- No bypass of pending confirmation checks.
- No automatic confirmation request creation.
- No active-vault writes beyond the already-confirmed executor boundary.
- No inbox deletion or archival.
- No GUI or remote dashboard.

## Acceptance

- Executing a confirmation requested from an inbox item updates that item to
  `executed`.
- Re-requesting confirmation for an executed inbox item is rejected.
- Default `review inbox` output excludes executed items.
- `review inbox --status executed` and `--status all` expose terminal history.
- `pnpm run check` passes.
