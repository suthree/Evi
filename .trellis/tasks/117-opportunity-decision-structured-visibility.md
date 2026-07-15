# Task 117: Opportunity Decision Structured Visibility

## Goal

Expose latest Opportunity Backlog decision state as structured metadata so
operators and later agents do not need to parse prose summaries.

## Scope

- Add `opportunity_decision` to Opportunity Backlog items when the latest
  visible decision is `open` or `deferred`.
- Preserve existing completed/retired suppression and existing open/deferred
  ranking behavior.
- Render decision status, reason, and JSONL row ref in bounded context and
  Feishu opportunity views.
- Keep read-only surfaces from appending decisions.
- Update runtime contract, local runtime docs, Trellis spec, and decisions.

## Non-goals

- Do not change the append-only decision log format.
- Do not make context, governance status, or Feishu append decisions.
- Do not change completed/retired hiding behavior.
- Do not execute follow-ups, request confirmations, or mutate SOP/skill/memory
  state.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/opportunity_backlog.test.ts tests/context_harness.test.ts tests/feishu_adapter.test.ts tests/governance_status.test.ts`
- `pnpm run check`
