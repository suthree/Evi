# Task 190: Content Daily Resident Advance Existing Job

Status: implemented

## Problem

The resident content daily loop skipped a date/track as soon as the daily job
file existed. A job created while the runtime was draft-only could stay drafted
after image, preflight, or publish gates were later enabled.

## Scope

- Treat existing same-day jobs as resumable state, not automatic duplicates.
- Continue existing drafted jobs through image generation and optional preflight.
- Publish existing `preflight_ok` jobs on interval only when resident publish and
  external-write confirmation gates are explicitly enabled.
- Preserve startup protection so service restart does not publish an existing
  preflight-ready job.

## Acceptance

- A same-day drafted job can be advanced to `preflight_ok` without changing its
  daily job ref or content run ref.
- A same-day `preflight_ok` job can be published by an interval tick when gates
  are explicitly enabled.
- Startup ticks defer external publication of existing preflight-ready jobs.
- Duplicate same-day jobs are skipped only after they satisfy the current runtime
  target.

## Verification

- `pnpm exec node --import tsx --test tests/content_daily_service.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
