# Task 06: MemoryStore FTS

## Goal

Build the first local episode MemoryStore.

## Scope

- Keep `memory/episodes/events.jsonl` as the source of truth.
- Build a rebuildable SQLite FTS index under the selected state root.
- Expose CLI commands for index status, sync, search, and session replay.
- Add a doctor check proving the local memory index can be opened and rebuilt.
- Cover the index with focused tests.

## Non-Goals

- No vector database.
- No hybrid search ranking.
- No cross-machine memory sync.
- No service hot-path writes to the SQLite index.
- No GUI.

## Acceptance

- `pnpm run runtime -- memory sync --state-root <root>` rebuilds the index.
- `pnpm run runtime -- memory search --query "..." --state-root <root>` returns matching episode evidence.
- `pnpm run runtime -- memory session --session <id> --state-root <root>` returns a bounded session window.
- `doctor` reports `memory_index`.
- `pnpm run check` passes.
