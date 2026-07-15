# Task 178: Creator Metrics Duplicate Title Disambiguation

Status: implemented

## Problem

The Xiaohongshu creator backend can contain repeated daily titles such as
`AI应用早报` and `AI算力早报`. The page-text creator metrics parser matched the
first title occurrence, which can assign a newer post's metrics to an older
same-title run.

## Scope

- Pass publish evidence time into creator metrics page-text capture.
- When duplicate titles exist, match the creator backend row by title plus the
  Xiaohongshu local publish minute.
- For reconciled active-state publish evidence, read the original source
  publish evidence time before matching.
- Refuse duplicate-title page text without a publish-time disambiguator instead
  of writing potentially wrong feedback evidence.
- Keep the route typed as `captured_by=agent-browser-cli` and preserve existing
  publish gates.

## Non-goals

- Do not read cookies or browser storage.
- Do not change Xiaohongshu publish attribution.
- Do not make resident feedback refresh open browsers.
- Do not infer view counts when the creator backend text lacks a parseable
  row.

## Acceptance

- Duplicate same-title page text selects the row within the publish-minute
  tolerance.
- Duplicate same-title page text without publish time returns failed diagnostics
  and writes no feedback evidence.
- Reconciled publish evidence uses the source evidence `created_at` for row
  matching.
- Live creator backend metrics can clear the active `creator-metrics-needed`
  queue for current same-title daily posts.

## Verification

- `pnpm exec tsx --test tests/content_pipeline.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
