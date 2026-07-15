# SOP Confirmation Operator Visibility

## Goal

Make pending SOP evolution confirmations visible as SOP-chain confirmations in
operator read models and later context, without adding any IM execution path.

## Scope

- Include confirmation `source`, `sop_id`, and `sop_ref` in review confirmation
  summaries.
- Render those fields in Feishu review confirmation list and detail views.
- Render those fields in the bounded Governance Queue context section.
- Keep execution guidance read-only and explicit through the local CLI gate.

## Non-Goals

- No Feishu execution.
- No confirmation requests from read models.
- No raw SOP, skill, review, or safety-boundary body in context summaries.
- No change to the stale-ledger revalidation gate.

## Acceptance

- A SOP evolution confirmation summary exposes `source=sop_evolution_chain`.
- Feishu `/review confirmations` and `/review confirmation <ref-or-id>` show
  the SOP id/ref for SOP-chain confirmations.
- Governance Queue context shows the source and SOP ref for pending SOP-chain
  confirmations.
- Tests prove the read models stay bounded and do not execute mutation actions.
