# Feishu Episode Memory Operator Search

## Status

Done

## Goal

Expose bounded episode-memory search and session replay in Feishu private chat,
so the operator can inspect local memory evidence from IM without invoking the
agent or rebuilding the SQLite MemoryStore index.

## Acceptance Criteria

- `/memory search <query>` returns matching episode summaries, ids, sessions,
  kinds, scores, timestamps, and bounded artifact refs.
- `/memory session <session-id>` returns a bounded session window from episode
  events for that session.
- Both commands scan local episode JSONL state directly and do not rebuild the
  SQLite index.
- Both commands are read-only operator views: no model invocation, no raw
  episode artifact reads, no durable memory writes, no active-vault writes, and
  no shell commands.

## Verification

```bash
node --import tsx --test tests/memory_store.test.ts tests/feishu_adapter.test.ts tests/cli.test.ts
pnpm run check
```
