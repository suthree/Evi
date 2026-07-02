# Draft SOP Confirmation Readiness Gate

## Status

Done

## Goal

Require bounded `draft_sop` readiness before creating or executing a mutation
confirmation for state-only SOP drafts.

## Scope

- Block `draft_sop` follow-up confirmation requests unless the background
  review/proposal readiness status is `ready`.
- Store the bounded readiness snapshot on the confirmation request.
- Recompute readiness before executing a pending `draft_sop` confirmation so
  stale or weakened evidence cannot write a SOP draft.
- Render the readiness snapshot in confirmation Markdown and Feishu review
  confirmation views.
- Keep the gate read-only except for the existing explicit confirmation request
  and execution writes.

## Acceptance

- Tests cover weak evidence rejection at confirmation request time.
- Tests cover execution-time revalidation after a previously ready proposal
  becomes weak.
- Feishu confirmation list/detail tests cover bounded readiness rendering.
- Confirmation artifacts do not render raw review Markdown or episode bodies.
