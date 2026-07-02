# SOP Evolution Confirmation Gate

## Goal

Let an operator turn the current SOP Evolution Ledger `next_command` into a
pending confirmation request without relying on a background-review proposal.

## Scope

- Add `review request-sop-confirmation --sop <sop>`.
- Store the request in the existing `autonomy/followups/*.json` confirmation
  model with `source=sop_evolution_chain`.
- Revalidate the current SOP Evolution Ledger command before
  `review execute-confirmed-follow-up` mutates state or the active vault.
- Reject stale confirmations when the SOP chain no longer exposes the same
  action, refs, or write boundary.
- Render request guidance from SOP evolution `next_command` metadata.

## Non-Goals

- No Feishu execution.
- No automatic audit or promotion from read models.
- No parallel confirmation store.
- No raw SOP, skill, context, or episode artifact reads.
- No change to the explicit active-vault promotion gate.

## Acceptance

- Draft SOP chains can request an `audit_sop` confirmation.
- Promote-ready audited SOP chains can request a `promote_sop` confirmation.
- Executing the confirmation revalidates the current ledger command first.
- Stale confirmations are rejected.
- Feishu `/opportunities` renders request guidance as text only.
- Tests prove audit and promotion confirmations execute only through the
  explicit confirmed executor.
