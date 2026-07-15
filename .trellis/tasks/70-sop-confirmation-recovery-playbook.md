# SOP Confirmation Recovery Playbook

## Goal

Make stale SOP confirmation recovery actionable without turning read models or
Feishu into mutation paths.

## Scope

- Add `sop_evolution_recovery.playbook` to stale SOP-chain confirmation
  summary/detail read models.
- Derive playbook summary and next steps from the stable gate `reason_code`.
- Include a read-only `governance evolution` inspect command.
- Render the full playbook in Feishu stale confirmation detail views.
- Render the playbook summary in Feishu stale confirmation list views.

## Non-Goals

- No automatic replacement confirmation.
- No Feishu mutation path.
- No stale artifact mutation.
- No changes to execution-time stale revalidation.
- No raw SOP or skill body exposure.

## Acceptance

- Stale SOP-chain confirmation detail includes `sop_evolution_recovery.playbook`.
- Stale filtered confirmation summaries include the playbook summary.
- Feishu detail renders reason code, summary, inspect command, and next steps.
- Focused and full test suites pass.
