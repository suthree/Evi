# Context Pressure Action Gate

Status: Done

## Goal

Let operators record decisions for oversized context-pressure findings through explicit guidance
without auto-compacting, rewriting context assembly, or mutating context
artifacts.

## Scope

- Add operator guidance to `context pressure` summaries
- Surface stable inspect, defer, complete, and retire decision commands
- Carry guidance into Opportunity Backlog, context bundles, and Feishu views
- Keep any future mitigation behind an explicit CLI gate with focused tests
- Update capability acceptance, docs, spec, decisions, and tests

## Non-Goals

- No raw context Markdown reads
- No context compaction
- No transcript or context assembly rewrite
- No model calls, tool execution, repo writes, active-vault writes, or service
  management
- No automatic mitigation command

## Acceptance

- Oversized pressure returns operator guidance with stable refs
- Pressure guidance can be decisioned through `governance decide-opportunity`
- Decisioning appends state only and leaves context manifest/Markdown artifacts
  unchanged
- Feishu and context bundle surfaces render the same bounded guidance
- Focused and full repository checks pass
