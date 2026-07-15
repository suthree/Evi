# Context Manifest Repair Gate

## Status

Done

## Goal

Add an explicit local repair gate for orphan context Markdown artifacts so
context health findings can be resolved without treating read-only diagnostics
as mutation authority.

## Scope

- Add `context repair --context <ref>` for one missing context manifest sidecar.
- Recover conservative manifest metadata from the selected context Markdown.
- Refuse to overwrite an existing manifest sidecar.
- Surface repair guidance through context health, Opportunity Backlog
  action-chains, context bundle, and Feishu one-issue context health detail.
- Keep `context health`, context assembly, governance status, Opportunity
  Backlog, Feishu list views, and review tick read-only.
- Update local runtime/Trellis documentation and focused tests.

## Non-Goals

- No automatic repair from health/backlog/context/Feishu/review tick.
- No reconstruction of unrecoverable recall refs, skill refs, opportunity refs,
  or model budget metadata.
- No context Markdown rewrite, compaction, transcript rewriting, repo write,
  active-vault write, model invocation, shell command, or service control.

## Acceptance

- `context repair` writes a valid `*-context.json` sidecar for an orphan
  `*-context.md`.
- The repair result and recovered manifest do not contain raw context body text.
- `context health` remains read-only and reports repair command guidance.
- Opportunity Backlog action-chain includes `repair_context_manifest`.
- Focused and full validation pass.
