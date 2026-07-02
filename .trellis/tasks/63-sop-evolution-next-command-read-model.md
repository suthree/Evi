# SOP Evolution Next Command Read Model

## Goal

Make SOP Evolution Ledger open chains operator-actionable by exposing a
structured, copyable next command for eligible draft and audited SOP states.

## Scope

- Add optional `next_command` metadata to SOP Evolution Ledger entries.
- Include command action kind, exact CLI command, required refs, write surfaces,
  and safety boundary.
- Propagate SOP chain `next_command` into Opportunity Backlog items.
- Render the command in Feishu `/opportunities` without executing it.
- Preserve existing free-text `next_action` compatibility.

## Non-Goals

- No command execution from Feishu or read models.
- No confirmation request creation.
- No SOP audit, promotion, skill creation, or active-vault write.
- No raw SOP, skill, context, or episode artifact reads.
- No change to the explicit CLI mutation gates.

## Acceptance

- Draft SOP chains expose an `audit_sop` command.
- Promote-ready audited SOP chains expose a `promote_sop` command.
- The structured command includes required refs and write surfaces.
- Opportunity Backlog inherits the structured command for SOP chain items.
- Feishu `/opportunities` renders the command and write surfaces as text only.
- Tests prove the read surfaces remain non-mutating and do not render raw bodies.
