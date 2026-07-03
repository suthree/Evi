# Task 174: Content Daily Tracks

Status: implemented

## Problem

The active-exploration daily loop could create only one date-keyed content job.
The requested workflow needs at least two recurring Xiaohongshu-ready lanes:
AI application/product news and AI compute/market hotspots.

## Scope

- Add optional daily track ids for `content daily` and `content daily-advance`.
- Store tracked jobs under `content/daily/<track>/YYYY-MM-DD.json` while keeping
  the untracked default `content/daily/YYYY-MM-DD.json` path.
- Let the resident content-daily loop run multiple configured tracks in one
  tick and report bounded multi-job status.
- Use built-in default tracks for `ai_applications` and `ai_compute_market`
  when the runtime uses the default daily topic with no custom sources or
  tickers.
- Keep publish, preflight, Image API, and Feishu read-only boundaries
  unchanged.

## Non-goals

- No resident external publishing by default.
- No browser automation.
- No model-based topic discovery in this slice.
- No deletion of existing operator evidence under the untracked daily job path.
- No repository storage of platform cookies or auth secrets.

## Acceptance

- `content daily --track <id>` writes an independent date-keyed job.
- `content daily-advance --track <id>` advances only that track and keeps
  `external_write=false`.
- The resident loop can create both built-in daily tracks for one date and skip
  them once they exist.
- Feishu `/content <track>/<date>` can inspect a tracked job without reading
  draft bodies or executing work.

## Verification

- `pnpm exec tsx --test tests/content_pipeline.test.ts tests/content_daily_service.test.ts tests/feishu_adapter.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run runtime -- content daily --dry-run --date <date> --track ai_applications --state-root <tmp-state>`
