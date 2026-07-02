# Task 27: Context Assembly Manifest

## Goal

Persist a structured manifest for every live context bundle.

## Scope

- Render live context as Markdown plus a JSON manifest.
- Record context section names and character counts.
- Record selected refs for stable docs, query/todo files, recall hits, skills,
  and tool-contract source.
- Record recall counts, skill counts, and query/todo discipline state.
- Include the manifest ref in prompt evidence and run results.
- Keep the existing Markdown context as the model-facing artifact.

## Non-Goals

- No GUI context explorer.
- No remote telemetry.
- No raw context source dump in the manifest.
- No token estimator dependency.
- No replacement for episode evidence JSONL.
- No new model action authority.

## Acceptance

- `renderContextBundleWithManifest` returns Markdown and a manifest.
- Manifest `total_chars` matches the rendered context length.
- Live runs write `memory/episodes/<session>-context.json`.
- Prompt evidence includes both context Markdown and manifest refs.
- `RunResult` exposes `context_manifest_ref`.
- `pnpm run check` passes.
