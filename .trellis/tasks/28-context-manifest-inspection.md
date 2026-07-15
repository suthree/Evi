# Task 28: Context Manifest Inspection

## Goal

Expose a local read-only CLI for context manifest sidecars.

## Scope

- Add `context list`.
- Add `context show`.
- List manifest refs, Markdown context refs, section counts, character counts,
  recall counts, skill counts, and query/todo state.
- Allow `context show --context <ref>` for `*-context.json` or
  `*-context.md` refs.
- Allow `context show --session <session_id>`.
- Keep the command read-only.

## Non-Goals

- No raw context Markdown rendering.
- No GUI context explorer.
- No remote telemetry.
- No model invocation.
- No memory index sync.
- No state mutation.
- No active-vault writes.

## Acceptance

- `pnpm run runtime -- context list --state-root <root>` lists manifest
  summaries.
- `pnpm run runtime -- context show --session <session> --state-root <root>`
  reads one manifest.
- `pnpm run runtime -- context show --context <ref> --state-root <root>` reads
  one manifest.
- Invalid or missing manifests are rejected.
- `pnpm run check` passes.
