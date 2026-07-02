# Context Health Act-Next Repair

## Status

Done

## Goal

Let the typed opportunity executor close the safe half of context health repair:
an orphan context Markdown file with a missing manifest sidecar.

## Scope

- Support `governance act-next` for `context_health` opportunities only when
  `issue_kind=orphan_context_markdown`.
- Reuse `repairContextManifest` instead of executing action-chain command
  strings.
- Write an audit record under `autonomy/opportunity-actions` with context and
  manifest refs, repair status, and section/count metadata.
- Return only refs and aggregate counts; do not return raw context Markdown.
- Leave `invalid_manifest` and `missing_context_markdown` as operator-led
  repair or retirement paths.

## Non-Goals

- No generic action-chain executor.
- No automatic deletion or retirement of historical context artifacts.
- No repair of missing context Markdown from manifest metadata.
- No repo write, active-vault write, model call, browser call, external publish,
  or Feishu-side mutation.

## Acceptance

- `act-next` repairs one orphan context manifest sidecar and records the action.
- The result and audit record do not expose raw context Markdown.
- Unsupported context health issue kinds are skipped.
- Focused validation passes for opportunity actions, context health, and
  Opportunity Backlog.
