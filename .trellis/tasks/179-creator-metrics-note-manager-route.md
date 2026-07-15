# Task 179: Creator Metrics Note Manager Route

Status: implemented

## Problem

The Xiaohongshu creator backend no longer uses the retired creator-notes route
for note management.
Logged-in Chrome redirects creator work to
`https://creator.xiaohongshu.com/new/note-manager`, where the published note
rows and metrics are visible. Runtime defaults and CLI examples still pointed at
the old route, making browser-backed creator metrics less reliable.

## Scope

- Change runtime creator-metrics defaults to the live note-manager route.
- Update CLI usage examples and tests that assert the creator metrics URL.
- Keep the route read-only: it is used only for creator metrics capture after
  typed publish proof.
- Ensure the local runtime config summary resolves the new route when creator
  metrics capture is enabled.

## Non-goals

- Do not enable the resident creator metrics loop by default.
- Do not read cookies or browser storage.
- Do not change Xiaohongshu publish routing.
- Do not change feedback strategy semantics.

## Acceptance

- No runtime, CLI, test, or docs references to the retired creator-notes route
  remain.
- `content creator-metrics-capture` defaults to `/new/note-manager`.
- Config summaries show `/new/note-manager`; service health shows the resident
  runtime was restarted onto the commit containing the new default.
- Existing creator metrics tests pass with the new route.

## Verification

- Search runtime, CLI, tests, and docs for the retired creator-notes route.
- `pnpm exec node --import tsx --test tests/content_pipeline.test.ts tests/content_creator_metrics_service.test.ts tests/config_summary.test.ts tests/service.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run runtime -- service health --target im`
