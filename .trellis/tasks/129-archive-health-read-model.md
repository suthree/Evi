# Task 129: Archive Health Read Model

## Status

Done

## Goal

Expose daily episode archive freshness and readiness diagnostics without
generating archive summaries automatically.

## Scope

- Add a core archive-health read model over episode event JSONL metadata and
  daily archive JSON metadata.
- Add CLI `memory archive-health` and Feishu `/memory archive health` operator
  commands.
- Surface archive-health issues in Opportunity Backlog, context, governance
  status, and Feishu opportunity views.
- Add capability catalog, runtime contract, local docs, Trellis decision, and
  tests.

## Non-Goals

- No automatic archive generation or repair.
- No raw episode artifact reads.
- No SQLite MemoryStore rebuild.
- No model invocation, review tick execution, confirmation request, follow-up
  execution, active-vault write, repo write, or shell command execution through
  the read model.

## Acceptance

- Operators can list bounded archive-health diagnostics from CLI and Feishu.
- Operators can narrow archive-health diagnostics by date or ref.
- Missing, stale, invalid, and orphan archive summaries become derived
  Opportunity Backlog items.
- Context and governance status include bounded archive-health details without
  raw episode artifacts.
- Focused and full validation pass.
