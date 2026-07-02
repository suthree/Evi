# Task 171: Content Daily Advance

Status: implemented

## Problem

The resident daily loop can safely create a dry-run date job, but operators need
a bounded next step that generates the Xiaohongshu image and optionally probes
`xiaohongshu-mcp` readiness without accidentally publishing.

## Scope

- Add `content daily-advance` for an existing `content/daily/YYYY-MM-DD.json`.
- Generate configured image evidence for the linked content run, or reuse
  existing image evidence unless `--force` is supplied.
- Optionally record read-only publish preflight evidence through the same
  readiness path as `content publish-preflight`.
- Rewrite the same daily job with updated steps, next commands, and
  `external_write=false`.
- Surface the command in docs, CLI usage, and the capability catalog.

## Non-goals

- No `publish_content` calls.
- No external-write state transition.
- No new source collection or draft replacement.
- No resident service auto-advance.
- No browser automation dependency.

## Acceptance

- A dry-run daily job can be advanced to `image_generated` or `preflight_ok`
  without publication.
- Image failures record failed image evidence and block the daily job.
- Missing daily jobs fail with an explicit operator error.
- Jobs linked to an already published content run are rejected.
- The generated next command for publication remains
  `content publish-execute --external-write --confirmed`.

## Verification

- `pnpm exec tsx --test tests/content_pipeline.test.ts tests/cli.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run runtime -- content daily-advance --date <YYYY-MM-DD> --preflight --state-root <state-root>`
