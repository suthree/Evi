# SOP Confirmation Reason Summary

## Goal

Make stale SOP confirmation triage machine-readable without changing the
confirmation gate.

## Scope

- Add stable `reason_code` values to SOP confirmation gate readiness.
- Include reason codes in review confirmation summaries/details, Opportunity
  Backlog, Feishu views, and bounded context.
- Add `total_matches` and `sop_evolution_gate_summary` to review confirmation
  list read models.
- Render the reason summary in Feishu review confirmation lists.

## Non-Goals

- No persisted derived status or reason authority.
- No automatic confirmation refresh.
- No Feishu mutation path.
- No execution-time revalidation changes.

## Acceptance

- Current, stale, and executed SOP-chain confirmations expose stable
  `reason_code` values.
- Stale filtered confirmation lists include reason summary counts.
- Feishu `/review confirmations stale` renders reason summary counts.
- Opportunity Backlog and bounded context render `gate_reason_code`.
- Focused and full test suites pass.
