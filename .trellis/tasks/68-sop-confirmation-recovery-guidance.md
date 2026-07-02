# SOP Confirmation Recovery Guidance

## Goal

Make stale SOP evolution confirmations self-describing enough for an operator
to request a fresh confirmation without reverse-engineering the target SOP.

## Scope

- Add `sop_evolution_recovery` to stale SOP-chain confirmation summary/detail
  read models.
- Include the target SOP id/ref, stale reason, and exact
  `review request-sop-confirmation` command.
- Render the recovery command in Feishu stale confirmation list/detail views.
- Keep all recovery guidance read-only.

## Non-Goals

- No automatic replacement confirmation.
- No Feishu mutation path.
- No stale artifact mutation.
- No changes to execution-time stale revalidation.

## Acceptance

- Stale SOP-chain confirmation detail includes `sop_evolution_recovery`.
- Stale filtered confirmation summaries include the same recovery command.
- Feishu `/review confirmations stale` renders the fresh request command.
- Focused and full test suites pass.
