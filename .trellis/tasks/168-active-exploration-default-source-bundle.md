# Task 168: Active Exploration Default Source Bundle

Status: implemented

## Problem

Daily active exploration should not depend on an operator remembering to pass
source URLs every morning. The default run needs a stronger public source bundle
for frontier AI news and AI-related market hotspots.

## Scope

- Expand the default AI source URLs used by live-source content runs and daily
  jobs.
- Prefer current public sources that can be fetched without auth:
  - OpenAI News RSS
  - Anthropic News
  - Google AI RSS
  - NVIDIA Deep Learning RSS
  - Hacker News Algolia AI query
- Keep default market quote tickers as `NVDA`, `AMD`, and `MSFT`.
- Parse RSS/Atom item titles directly so channel titles are not mistaken for
  news headlines.
- Keep source evidence bounded and state-only.

## Non-goals

- No model-based summarization in source collection.
- No paid news, authenticated sources, or browser scraping.
- No investment advice or market prediction.
- No publication or image generation from this source collection slice.

## Acceptance

- A live-source content run with no source URLs fetches the default AI source
  bundle.
- A live-source content run with no tickers fetches `NVDA`, `AMD`, and `MSFT`
  quote evidence.
- RSS/Atom feeds summarize item titles, not the feed channel title.
- A real network smoke can fetch the default public source bundle without
  publishing or generating images.

## Verification

- `pnpm exec tsx --test tests/content_pipeline.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run runtime -- content run --dry-run --live-sources --topic "daily AI news and AI stock hotspots" --state-root <tmp-state>`
