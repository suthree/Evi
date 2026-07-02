# Task 165: Active Exploration Daily Service Loop

Status: implemented

## Problem

`content daily` can create one date-keyed active-exploration job, but it is a
manual CLI entrypoint. The active-exploration goal needs a local resident
trigger so the machine can attempt one daily job without turning the runtime
into an external publishing daemon. The current implementation keeps publishing
off by default, but supports an explicit `xiaohongshu-mcp` publish gate for
operator-approved resident execution.

## Scope

- Add a resident content daily loop with a small start/stop/runOnce interface.
- Keep the loop disabled by default.
- Configure it through runtime JSONL fields:
  - `content_daily_enabled`
  - `content_daily_interval_ms`
  - `content_daily_dry_run`
  - `content_daily_preflight`
  - `content_daily_topic`
  - `content_daily_source_urls`
  - `content_daily_tickers`
  - `content_daily_image_model`
  - `content_daily_publish_enabled`
  - `content_daily_external_write_confirmed`
  - `content_daily_publish_adapter`
  - `content_daily_publish_server_url`
  - `content_daily_publish_tool`
- Attach it to the resident IM service lifecycle.
- Write status to `services/im/content_daily.json`.
- Skip duplicate same-date jobs.
- Honor active `autonomy/runs/pause_signal.json`.
- Surface the status in `service status`.
- When all explicit gates are enabled, reuse the same daily image, preflight,
  and `xiaohongshu-mcp` publish execution path as the CLI.

## Non-goals

- No default automatic `publish_content`.
- No external publishing unless `content_daily_dry_run=false`,
  `content_daily_preflight=true`, `content_daily_publish_enabled=true`, and
  `content_daily_external_write_confirmed=true`.
- No hosted scheduler or production daemon design.
- No cross-machine coordination.
- No service-health diagnosis expansion in this slice.
- No browser automation from the resident loop.

## Acceptance

- `createContentDailyLoop(...enabled=false).runOnce()` writes disabled status.
- Enabled dry-run loop writes one `content/daily/YYYY-MM-DD.json` job and linked
  content run.
- A second same-date run is skipped instead of forced.
- Active autonomy pause writes `state=paused` and creates no content job.
- `service status` includes `content_daily`.
- Runtime config summaries include the daily loop fields without reading
  secrets.
- Explicit publish gates can drive a fake `xiaohongshu-mcp` publisher in tests
  and produce `published` daily job state with `external_write=true`.

## Verification

- `pnpm run build`
- `pnpm exec tsx --test tests/content_daily_service.test.ts tests/content_pipeline.test.ts tests/config_summary.test.ts tests/service.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
