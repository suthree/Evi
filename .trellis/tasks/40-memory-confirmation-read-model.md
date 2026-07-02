# Memory Confirmation Read Model

Expose memory candidate confirmation artifacts as read-only operator state.

## Scope

- Add `memory confirmations` to list memory candidate confirmation summaries.
- Add `memory confirmations --confirmation <ref-or-id>` to inspect one
  confirmation.
- Add Feishu `/memory confirmations` and
  `/memory confirmation <ref-or-id>`.
- Reuse `memory/semantic/confirmations/*.json` as the source of truth.

## Boundaries

- No confirmation request creation.
- No confirmation execution.
- No candidate acceptance.
- No MemoryStore index rebuild.
- No memory/governance mutation writes, repository writes, active-vault writes,
  model invocation, shell command, or external publication. Feishu may still
  record normal channel operator artifacts.

## Acceptance

- CLI parsing recognizes `memory confirmations` and `--confirmation`.
- Confirmation listing returns summaries and stable refs without safety-boundary
  detail.
- Confirmation inspection works by stable ref or confirmation id.
- Feishu confirmation commands do not call the agent runner.
- Docs identify the surface as read-only governance visibility.

## Verification

- `node --import tsx --test tests/cli.test.ts tests/memory_candidates.test.ts tests/feishu_adapter.test.ts`
