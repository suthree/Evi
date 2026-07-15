# SOP Confirmation Stale Readiness

## Goal

Expose whether a pending SOP evolution confirmation still matches the current
SOP Evolution Ledger before the operator tries to execute it.

## Scope

- Add a shared read-only SOP confirmation gate inspector.
- Attach `sop_evolution_gate` to review confirmation summaries/details.
- Render current or stale gate state in Feishu confirmation and Opportunity
  Backlog views.
- Render the same bounded state in context Governance Queue and Opportunity
  Backlog sections.
- Keep execution-time stale-ledger revalidation as the final authority.

## Non-Goals

- No persisted derived stale status.
- No Feishu execution.
- No automatic confirmation refresh.
- No raw SOP, skill, command, or safety-boundary body in context summaries.

## Acceptance

- Current SOP evolution confirmations report `sop_evolution_gate=current`.
- Stale SOP evolution confirmations report `sop_evolution_gate=stale` with a
  bounded reason.
- Feishu stale confirmation detail shows a fresh confirmation request command
  instead of the stale execute command.
- Opportunity Backlog keeps stale confirmations visible as confirmation items
  and does not resurrect duplicate chain-level items.
- Focused and full test suites pass.
