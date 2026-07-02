# SOP Recovery-Aware Backlog

## Goal

Prevent stale SOP confirmation gates that were already handled by the operator
from repeatedly occupying active self-evolution attention.

## Scope

- Share SOP recovery decision-log parsing through a core helper.
- Merge latest recovery decisions into Opportunity Backlog review-confirmation
  items.
- Keep `open` and `deferred` stale gates visible with the decision reason.
- Lower attention score for `deferred` stale gates.
- Suppress `historical` and `fresh_requested` stale gates from the active
  Opportunity Backlog.
- Render recovery decisions in Feishu and context Opportunity Backlog views.

## Non-Goals

- No automatic replacement confirmation.
- No stale artifact mutation.
- No execution-time revalidation changes.
- No Feishu mutation path.
- No raw SOP or skill body exposure.

## Acceptance

- Opportunity Backlog includes deferred recovery decisions on stale gates.
- Deferred stale gates score lower than unresolved stale gates.
- Historical and fresh-requested stale gates are absent from active backlog.
- Feishu `/governance opportunities` renders recovery decisions read-only.
- Focused and full test suites pass.
