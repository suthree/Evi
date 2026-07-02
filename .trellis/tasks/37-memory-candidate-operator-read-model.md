# Memory Candidate Operator Read Model

Expose state-only memory proposal candidates as local read models.

## Scope

- Add a runtime read model for `memory/semantic/candidates/*.json`.
- Add `memory candidates` to list candidate summaries.
- Add `memory candidates --candidate <ref-or-id>` to inspect one candidate.
- Add Feishu `/memory candidates` and `/memory candidate <ref-or-id>`.
- Keep candidate views read-only: no MemoryStore rebuild, durable memory update,
  confirmation request, SOP draft, audit, promotion, skill revision, active-vault
  write, model invocation, or shell command.

## Acceptance

- CLI parsing recognizes `memory candidates` and `--candidate`.
- Candidate listing returns summaries and stable refs without dumping full
  content.
- Candidate inspection works by stable ref or candidate id.
- Feishu candidate commands do not call the agent runner.
- Docs identify this as governance visibility, not promotion.

## Verification

- `node --import tsx --test tests/cli.test.ts tests/memory_candidates.test.ts tests/feishu_adapter.test.ts`
