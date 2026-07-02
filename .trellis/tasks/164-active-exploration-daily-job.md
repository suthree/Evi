# Active Exploration Daily Job

Status: Implemented

## Goal

Add a date-keyed local operator job for the daily AI news and market-hotspot
workflow so active exploration can run source collection, copy drafting, image
generation, and publish preflight as one bounded local step.

## Scope

- Add `content daily`
- Always run bounded live-source collection for daily jobs
- Use the default public source bundle when source URLs are not supplied:
  OpenAI News RSS, Anthropic News, Google AI RSS, NVIDIA Deep Learning RSS, and
  Hacker News Algolia AI query
- Use default market quote tickers `NVDA`, `AMD`, and `MSFT` when tickers are
  not supplied
- Write one state artifact at `content/daily/YYYY-MM-DD.json`
- Link the job to a normal `content/runs/<run-id>/run.json`
- Block duplicate same-date jobs unless `--force` is passed
- Allow `--dry-run` to stop before image generation
- In non-dry-run mode, call only the configured OpenAI-compatible Image API
- Optionally record publish preflight with `--preflight`
- Return next commands for image generation, preflight, publish execution, or
  run inspection

## Non-Goals

- No default `publish_content` call from the daily job
- No background scheduler or launchd timer in this task
- No `agent-browser-cli` browser automation
- No Feishu publish execution path
- No cookies, browser sessions, API keys, or app secrets in repository files
- No repo or active-vault writes from the daily job

## Acceptance

- `content daily --dry-run --date ...` writes a daily job and linked content run
- Re-running the same date without `--force` is rejected
- A fake Image API client can drive non-dry-run daily image generation
- `--preflight` records `preflight_ok` when image, login, and adapter evidence
  are present
- Daily job output keeps `external_write=false` unless explicit publish gates
  are enabled by a later execution slice
- CLI parsing recognizes `content daily`, `--date`, `--force`, and
  `--preflight`
- Default live-source collection covers official AI feeds and default market
  quote tickers without operator-supplied URLs

## Verification

```bash
pnpm exec tsx --test tests/content_pipeline.test.ts tests/capabilities.test.ts
pnpm run check
```
