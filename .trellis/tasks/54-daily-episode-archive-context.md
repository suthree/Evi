# Daily Episode Archive Context

## Status

Done

## Goal

Add a deterministic daily archive summary layer over episode memory, so local runtime
can carry long-running local history into context without dumping raw episode
artifacts or depending only on the SQLite search index.

## Acceptance Criteria

- `memory archive` scans `memory/episodes/events.jsonl` and writes
  `memory/archives/<date>.json` plus `.md` summary artifacts.
- Archive records group events by date and include event counts, session counts,
  kind counts, bounded session summaries, recent event summaries, and artifact
  refs only.
- Archive generation does not rebuild the SQLite MemoryStore index, read raw
  episode artifacts, invoke the model, write durable semantic memory, or write
  the active vault.
- Later context bundles include bounded daily archive summaries from
  `memory/archives/*.json` and record archive refs in the context manifest.

## Verification

```bash
node --import tsx --test tests/memory_store.test.ts tests/cli.test.ts tests/context_harness.test.ts
pnpm run check
```
