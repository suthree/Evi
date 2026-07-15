# Task 205: Governance Status Gap Decision Summary

Status: implemented

## Problem

After self-evolution gaps gained `effective_status`, `governance gaps` could
explain that historical derived gaps were completed, but aggregate
`governance status` and Feishu `/governance` still only looked at Opportunity
Backlog. When backlog was empty, operators could not tell whether no gaps
existed or whether derived gaps had been closed by append-only decisions.

## Scope

- Add a bounded self-evolution gap summary to aggregate governance status.
- Include `by_effective_status`, latest gap refs, and an attention hint.
- Render the same summary in Feishu `/governance`.
- Preserve Opportunity Backlog semantics and decision filtering.

## Non-goals

- No reopening, completing, retiring, or suppressing gap decisions.
- No execution of review tick, background review, MCP calls, browser
  automation, model calls, external publishing, repo writes, or active-vault
  writes.
- No raw draft, SOP, skill, context, or content body exposure.

## Acceptance

- Empty backlog plus completed derived gaps renders a decision-closed hint.
- Governance status exposes latest closed gap refs for inspection.
- Feishu `/governance` shows effective-status counts and the same hint.
- Existing top Opportunity Backlog rendering remains unchanged.

## Verification

- `pnpm exec tsx --test tests/governance_status.test.ts tests/feishu_adapter.test.ts`
- `pnpm run runtime -- governance status --state-root <state-root>`
- `pnpm run runtime -- governance gaps --state-root <state-root>`
