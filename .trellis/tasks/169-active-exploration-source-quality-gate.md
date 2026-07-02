# Task 169: Active Exploration Source Quality Gate

Status: implemented

## Problem

Daily active exploration now has a broader default source bundle, but source
order alone is too weak for drafting. A failed or duplicated source should not
be silently promoted into Xiaohongshu copy, and weak source coverage should
become a self-evolution signal instead of only living in raw evidence files.

## Scope

- Attach per-source `metadata.source_quality` to live-source and dry-run source
  items.
- Write aggregate quality counts under
  `content/runs/<run-id>/sources/index.json`.
- Prefer usable, de-duplicated news and market evidence when rendering daily
  draft copy.
- Derive an `active_exploration_source_quality_gate` self-evolution gap when a
  content run has severe source failures, no usable news, no usable market
  quote, or excessive duplicate source items.
- Surface the derived gap through `governance gaps` and Opportunity Backlog.

## Non-goals

- No model-based source summarization inside source collection.
- No paid news, authenticated browser scraping, or cookie storage.
- No automatic publication block when one non-critical source fails.
- No publish, image generation, or repository writes from source-quality
  scoring.

## Acceptance

- Source index evidence contains aggregate quality counts.
- Draft rendering skips duplicate source items and prefers usable evidence.
- Weak daily source coverage derives a self-evolution gap with evidence refs,
  acceptance criteria, non-goals, and verification commands.
- Existing publish preflight and external-write gates stay unchanged.

## Verification

- `pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run runtime -- content run --dry-run --live-sources --topic "daily frontier AI news and AI stock hotspots for Xiaohongshu" --state-root <tmp-state>`
