# Source Freshness Plan Alignment

## Status

Done

## Goal

Keep active-exploration publish plans, source metadata, and publish preflight
checks aligned around the same freshness gate.

## Scope

- Add `source_freshness_ok` to the local publish gate requirements for content
  runs.
- Keep market quote evidence fields `normalized_timestamp` and
  `quote_age_hours`, and add generic freshness aliases `latest_published_at`
  and `source_age_hours`.
- Assert both the run metadata and written source evidence carry the aliases.
- Document that publish plan inspection and preflight behavior now use the same
  source freshness requirement.

## Non-Goals

- No historical state migration or mutation of prior content runs.
- No new browser automation, model calls, image generation, or Xiaohongshu
  publishing.
- No change to source-quality scoring thresholds.
- No investment advice from market freshness or hotness metadata.

## Acceptance

- `publish-plan.json` and `run.json` publish gates include
  `source_freshness_ok`.
- Market quote source items and evidence files expose
  `latest_published_at`/`source_age_hours` aliases alongside quote-specific
  timestamp fields.
- Existing publish preflight freshness gating remains hard-fail when daily
  source coverage is stale.
- Focused content pipeline and self-evolution gap tests pass.
