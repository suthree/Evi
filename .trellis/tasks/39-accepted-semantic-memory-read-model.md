# Accepted Semantic Memory Read Model

Expose accepted local semantic memory as read-only operator state.

## Scope

- Add `memory accepted` to list accepted semantic memory summaries.
- Add `memory accepted --semantic <ref-or-id>` to inspect one accepted memory.
- Add Feishu `/memory accepted` and `/memory accepted <ref-or-id>`.
- Reuse `memory/semantic/accepted/*.json` as the source of truth.

## Boundaries

- No candidate acceptance from Feishu.
- No confirmation request or execution.
- No MemoryStore index rebuild.
- No state writes, repository writes, active-vault writes, model invocation,
  shell command, or external publication.

## Acceptance

- CLI parsing recognizes `memory accepted` and `--semantic`.
- Accepted memory listing returns summaries and stable refs without full content.
- Accepted memory inspection works by stable ref or semantic memory id.
- Feishu accepted memory commands do not call the agent runner.
- Docs identify the surface as read-only governance visibility.

## Verification

- `node --import tsx --test tests/cli.test.ts tests/memory_candidates.test.ts tests/feishu_adapter.test.ts`
