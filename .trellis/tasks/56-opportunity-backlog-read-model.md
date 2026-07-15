# Task 56: Opportunity Backlog Read Model

## Status

Done

## Goal

Expose a deterministic ranked Opportunity Backlog for local self-evolution
attention, so CLI, Feishu, and context can show which pending governance work
is most worth reviewing without granting execution authority.

## Scope

- Add a core read model over active pause state, pending review confirmations,
  pending memory confirmations, active review inbox items, memory candidates,
  and open `autonomy/opportunities.jsonl` records.
- Rank items with a bounded growth-value score and render score reasons,
  budget hints, refs, and next steps.
- Add CLI `governance opportunities`.
- Add Feishu `/opportunities` and `/governance opportunities`.
- Add a bounded `Opportunity Backlog` context section and manifest refs.

## Boundaries

- No confirmation request creation.
- No confirmation execution.
- No review or review tick execution.
- No raw review, memory candidate content, or raw context artifact reads.
- No model invocation.
- No SOP, skill, memory, active-vault, or shell command mutation.

## Acceptance

- CLI parsing recognizes `governance opportunities` and `--limit`.
- Core read model excludes executed confirmations and accepted memory.
- Context bundles include `Opportunity Backlog` when matching state exists.
- Context manifests record opportunity ref counts.
- Feishu opportunity commands do not run the agent.
- Feishu opportunity commands omit raw memory candidate content.

## Verification

```bash
node --import tsx --test tests/opportunity_backlog.test.ts tests/cli.test.ts tests/context_manifest.test.ts tests/context_harness.test.ts tests/feishu_adapter.test.ts
pnpm run check
```
