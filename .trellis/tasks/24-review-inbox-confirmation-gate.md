# Task 24: Review Inbox Confirmation Gate

## Goal

Let operators inspect review tick inbox items and request the normal mutation
confirmation envelope from one selected inbox item.

## Scope

- Add `review inbox` for listing inbox items.
- Allow `review inbox --item <item>` to read one item.
- Add `review request-inbox-confirmation --item <item>`.
- Reuse the existing follow-up confirmation request path.
- Recompute the referenced follow-up plan using the inbox item's latest review,
  proposal, and action refs.
- Update the inbox item status to `confirmation_requested`.
- Preserve the inbox item's stable id and first review ref.
- Append episode evidence for the inbox confirmation request.

## Non-Goals

- No follow-up execution.
- No active-vault writes.
- No SOP draft, audit, or promotion through the inbox request command.
- No skill revision through the inbox request command.
- No shell command execution.
- No chain repair.

## Acceptance

- `pnpm run runtime -- review inbox --state-root <root>` lists inbox items.
- `pnpm run runtime -- review inbox --item <item> --state-root <root>` reads one inbox item.
- `pnpm run runtime -- review request-inbox-confirmation --item <item> --state-root <root>` writes a pending confirmation and updates the inbox item.
- Re-requesting confirmation for the same inbox item is rejected.
- A later `review tick` preserves the `confirmation_requested` status.
- `pnpm run check` passes.
