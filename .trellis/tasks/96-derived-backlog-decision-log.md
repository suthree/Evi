# Derived Backlog Decision Log

## Status

Done

## Goal

Let operators defer, complete, retire, or reopen noisy derived Opportunity
Backlog attention items without mutating their source artifacts or executing any
self-evolution gate.

## Scope

- Reuse `autonomy/opportunity-decisions.jsonl` for eligible derived backlog
  decisions.
- Record `opportunity_kind` on new decisions.
- Apply latest decisions to current Opportunity Backlog items.
- Initial scope supported only read-only attention kinds:
  `completion_verification`, `pipeline_run`, `selected_skill_outcome`, and
  `selected_skill_drift`.
- Lower priority for `deferred` derived items while keeping them visible.
- Hide `completed` and `retired` derived items.
- Allow `open` to reopen a previously hidden derived item when the source
  artifact still exists.

## Non-Goals

- No decisions for pending confirmations, review inbox items, memory
  confirmations, memory candidates, autonomy pause signals, or SOP mutation
  gates.
- No source artifact rewrites.
- No review tick execution, model invocation, confirmation request, follow-up
  execution, SOP/skill/memory mutation, active-vault write, repo write, or shell
  command execution.

## Acceptance

- A selected-skill drift backlog item can be deferred, completed, and reopened
  through `decideOpportunity`.
- The decision log records `opportunity_kind`.
- Deferred derived items stay visible with lower score and reason.
- Completed or retired derived items are hidden from the Opportunity Backlog.
- Existing manual opportunity decisions keep working.
