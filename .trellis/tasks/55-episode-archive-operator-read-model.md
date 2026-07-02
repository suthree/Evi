# Task 55: Episode Archive Operator Read Model

## Goal

Expose deterministic daily episode archive summaries to local operators through
CLI and Feishu read-only views.

## Scope

- Add a read-only archive read model over `memory/archives/*.json`.
- Add `memory archives` to list archive summaries.
- Add `memory archives --archive <date-or-ref>` to inspect one archive.
- Add Feishu `/memory archives` and `/memory archive <date-or-ref>`.
- Show archive ref counts in context manifest operator views.

## Boundaries

- No archive generation from Feishu.
- No MemoryStore SQLite rebuild.
- No raw episode artifact reads.
- No model invocation.
- No durable semantic-memory write.
- No active-vault, SOP, skill, command, or confirmation mutation.

## Acceptance

- CLI parsing recognizes `memory archives` and `--archive`.
- Feishu archive commands do not run the agent.
- Feishu archive commands read archive JSON summaries only.
- Feishu archive commands do not create `memory/index/episodes.sqlite`.
- Context manifest operator views expose archive ref counts.

## Verification

```bash
node --import tsx --test tests/cli.test.ts tests/context_manifest.test.ts tests/feishu_adapter.test.ts
pnpm run check
```
