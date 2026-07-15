# Task 127: Context Usage Read Model

## Goal

Expose routine context-usage observability from context manifest metadata so
operators and later agents can see context size trends before pressure becomes
an active issue.

## Scope

- Add a core read model over recent `memory/episodes/*-context.json` manifests.
- Summarize manifest counts, total/average/max chars, pressure status counts,
  top section aggregates, largest section metadata, recall counts, and refs.
- Add CLI `context usage`.
- Add Feishu `/context usage` and `/usage`.
- Add capability catalog, stable docs, Trellis spec, and decision updates.

## Non-goals

- No raw context Markdown reads.
- No context compaction or context assembly rewrite.
- No Opportunity Backlog mutation or pressure decision append.
- No model invocation, review tick execution, confirmation request, follow-up
  execution, active-vault write, repo write, or shell command execution.

## Verification

- `node --import tsx --test tests/context_usage.test.ts tests/cli.test.ts tests/feishu_adapter.test.ts tests/capabilities.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
