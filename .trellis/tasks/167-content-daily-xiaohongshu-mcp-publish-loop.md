# Task 167: Content Daily Xiaohongshu MCP Publish Loop

Status: implemented

## Problem

`xiaohongshu-mcp` is now the preferred Xiaohongshu execution channel. The
resident daily content loop needs to reuse the proven image, preflight, and
publish evidence path without making external publishing a default service
behavior.

## Scope

- Add daily runtime config for topic, sources, tickers, image model, publish
  adapter, publish server URL, publish tool, publish enablement, and external
  write confirmation.
- Let the resident IM service pass those fields into `createContentDailyLoop`.
- Let the daily job probe `xiaohongshu-mcp` during preflight when login or tool
  availability is not supplied.
- Let the daily job execute the configured publisher only after generated image
  evidence, `preflight_ok`, explicit publish enablement, and external-write
  confirmation.
- Record `published` daily job status and `external_write=true` only when typed
  platform proof is present.
- Render the new config fields in non-secret config/context/operator surfaces.

## Non-goals

- No default resident publishing.
- No `agent-browser-cli` dependency in the resident loop while its Chrome bridge
  is unstable.
- No cookie, API key, app secret, or browser session persistence in repository
  files.
- No production scheduler, hosted service, or cross-machine coordination.

## Acceptance

- Daily job publishes through a fake `ExternalPublishClient` only when explicit
  publish gates are enabled.
- Resident daily loop can drive the same fake publish path from runtime options.
- Preflight evidence remains read-only and never calls `publish_content`.
- Config summaries and context bundles expose the new runtime fields without
  reading secrets.
- Documentation states that resident publishing is disabled by default and uses
  `xiaohongshu-mcp`, not browser automation.

## Verification

- `pnpm exec tsc -p tsconfig.json`
- `pnpm exec tsx --test tests/content_pipeline.test.ts tests/content_daily_service.test.ts tests/config_summary.test.ts tests/context_harness.test.ts tests/feishu_adapter.test.ts tests/stage_runner.test.ts tests/sop_flow.test.ts tests/xiaohongshu_mcp_client.test.ts`
- `pnpm run check`
