# Repo Write Guard Backlog Attention

Status: done

## Problem

Repo-write workspace guard summaries are visible in live run traces, but
preexisting-dirty writes should also become easy to notice in the regular local
self-evolution queue.

## Scope

- Derive `repo_write_guard` Opportunity Backlog items from bounded live run
  trace guard summaries when `preexisting_dirty=true`.
- Render bounded guard metadata in Opportunity Backlog context, governance top
  opportunity summaries, and Feishu `/opportunities`.
- Allow append-only Opportunity Backlog decisions for `repo_write_guard` items.
- Update runtime docs, Trellis decisions/spec, and focused tests.

## Non-Goals

- Do not read raw ToolResult JSON, file bodies, raw command output, model
  responses, final responses, or context Markdown.
- Do not block writes, stage, commit, reset, repair git state, request
  confirmations, run review tick, or mutate SOP/skill/memory state.
- Do not add a new guard state artifact; the source remains bounded live run
  trace metadata.

## Verification

```bash
pnpm exec tsx --test tests/opportunity_backlog.test.ts tests/context_harness.test.ts tests/feishu_adapter.test.ts
pnpm run check
```

## Result

Implemented read-only `repo_write_guard` backlog attention for preexisting-dirty
repo writes, including context, governance, Feishu visibility, and decision-log
support.
