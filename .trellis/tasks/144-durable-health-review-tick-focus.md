# Durable Health Review Tick Focus

Status: done

## Problem

`archive_health` and `skill_registry_health` issues could appear in the ranked
Opportunity Backlog, context, governance, and Feishu operator views, but
unscoped review tick either skipped archive health back to recent review scope
or treated skill registry health as already-actionable backlog. Durable local
state health problems therefore stayed outside the bounded review-tick focus
loop even when they were the top backlog item.

## Scope

- Let unscoped review tick select top `archive_health` and
  `skill_registry_health` backlog items as bounded `opportunity_backlog` focus.
- Add query fields for archive issue kind/status/date/counts/refs and skill
  registry issue kind/status/skill/refs/repair-command availability.
- Materialize proposal-only `runtime_gap` follow-ups for those focused health
  issues, replacing an empty generic memory-gap proposal or appending alongside
  other evidence-backed proposals.
- Keep the follow-up as gated `narrow_review` inbox guidance.
- Update runtime docs, Trellis spec, decisions, capability boundaries, and
  focused tests.

## Non-Goals

- Do not refresh episode archives from review tick.
- Do not run skill registry sync, restore packages, or write the active vault
  from review tick.
- Do not read raw skill bodies, raw episode artifacts, raw review Markdown, or
  raw context Markdown.
- Do not request confirmations, execute follow-ups, mutate SOP/skill/memory
  state, run shell commands, or invoke the model outside the normal review tick
  path.

## Verification

```bash
pnpm exec tsx --test tests/background_review.test.ts
```

## Result

Implemented bounded durable-health review tick focus for archive and active
skill-registry health issues.
