# Review Inbox Duplicate Collapse

## Status

Done

## Goal

Collapse duplicate review tick inbox suggestions in active attention read models
without deleting or rewriting the raw `autonomy/inbox/*.json` history.

## Scope

- Add a deterministic duplicate key for review inbox suggestions based on action
  kind, title, rationale, command, required refs, and write boundary.
- Collapse duplicates in active `review inbox` lists.
- Preserve uncollapsed history for `review inbox --status all`.
- Collapse duplicates before Opportunity Backlog, context governance queue,
  governance status, and Feishu active inbox rendering.
- Expose duplicate refs on the canonical item.
- Reject confirmation requests for non-canonical duplicates with the canonical
  inbox ref.

## Acceptance

- Runtime read model collapses duplicate active inbox items.
- `--status all` still returns every matching inbox artifact.
- Opportunity Backlog and context consume the collapsed active view.
- Governance status active count uses the collapsed active view while total
  still reflects raw history.
- Feishu active inbox and opportunity views render duplicate metadata without
  running mutations.
- Focused tests and full checks pass.
