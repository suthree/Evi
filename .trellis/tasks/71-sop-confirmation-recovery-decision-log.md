# SOP Confirmation Recovery Decision Log

## Goal

Let operators leave an auditable local decision on stale SOP confirmation
recovery without making stale recovery automatic.

## Scope

- Add `autonomy/sop-recovery-decisions.jsonl` as an append-only local decision
  log.
- Add CLI `review decide-sop-recovery --confirmation <ref> --status
  <open|deferred|fresh_requested|historical> --reason <text>`.
- Revalidate that the target confirmation is still a stale SOP-chain gate before
  appending a decision.
- Merge the latest decision into stale `sop_evolution_recovery` read models.
- Render the latest decision and the CLI decision command in Feishu read-only
  confirmation views.

## Non-Goals

- No automatic replacement confirmation.
- No Feishu mutation path.
- No stale artifact mutation.
- No execution-time revalidation changes.
- No raw SOP or skill body exposure.

## Acceptance

- CLI parsing recognizes `review decide-sop-recovery`.
- A stale SOP-chain confirmation can receive append-only recovery decisions.
- The latest recovery decision appears in detail and list read models.
- Feishu renders the latest recovery decision without appending a decision.
- Focused and full test suites pass.
