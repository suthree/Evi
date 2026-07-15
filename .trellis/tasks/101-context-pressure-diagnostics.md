# Context Pressure Diagnostics

## Status

Done

## Goal

Expose oversized context manifests as a bounded local context-engine
maintenance signal without automatically compacting or rewriting context.

## Scope

- Add a shared read model over `memory/episodes/*-context.json`.
- Detect total context over soft/hard limits and dominant oversized sections.
- Add CLI `context pressure`.
- Add Feishu `/context pressure`.
- Surface `context_pressure` in Opportunity Backlog, Governance Status,
  Opportunity Backlog context, and Feishu opportunity views.
- Allow append-only Opportunity Backlog decisions for `context_pressure` items.

## Non-Goals

- No raw context Markdown reads.
- No transcript rewrite, context compaction, or context assembly mutation.
- No review tick execution, model invocation, confirmation request, or shell
  command execution.
- No SOP, skill, memory, active-vault, or repo mutation.

## Acceptance

- Core pressure tests cover oversized manifests, ok manifests, and raw context
  Markdown exclusion.
- Opportunity Backlog and decisions cover `context_pressure`.
- Context, governance status, and Feishu render pressure metadata without raw
  context Markdown.
- Focused and full validation pass.
