# Trellis Agent Context

This repository has TrellisVCS 3.2.4 metadata enabled with a minimal,
no-index initialization. Existing source files were not indexed.

## Language Boundary

Use Simplified Chinese for operator-facing discussion, final responses, and
fast local operator overviews by default. Keep model-facing instruction files
in English when that makes the contract clearer, including this file, root
`AGENTS.md`, `README.md`, `core/soul.md`, and related prompt/context contracts.
Use paired entrypoints such as `README.md` plus `docs/README.cn.md` when both
model readability and local Chinese readability matter. Preserve commands, code
identifiers, JSON fields, protocol literals, and quoted evidence in their
original language unless the operator asks for translation.

## Runtime Boundary

This repository is a local-first, single-machine runtime for a self-growing agent.
The current scope stays on one checkout, one local state root, local JSONL
config, CLI foreground runs, and a single-user local service process for IM
intake.

Trellis is repo-local governance and project planning only. It is not runtime
state, an active-vault registry, a skill promotion gate, durable memory, or the
source of current implementation truth.

## Context Hygiene

- Use the stable docs first: `README.md`, `docs/RUNTIME_CONTRACT.md`,
  `docs/LOCAL_RUNTIME.md`, and `docs/LOCAL_LEARNING.md`.
- Read `docs/ACTIVE_EXPLORATION.md` only for active-exploration or content
  publishing work.
- Read `.trellis/spec/local-single-machine-mvp.md` and `.trellis/decisions.md`
  when changing project direction or task governance.
- Do not run `trellis seed`, `trellis season`, workspace indexing, semantic
  search indexing, or broad agent-context regeneration unless the operator
  explicitly asks for it.
- Keep `.trellis/tasks/` focused on bounded local implementation work, not
  broad future roadmaps.

## Quick Reference

```bash
pnpm dlx trellis@latest --version
pnpm dlx trellis@latest status
pnpm dlx trellis@latest log
pnpm dlx trellis@latest branch --list
```
