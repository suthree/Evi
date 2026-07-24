# Current Direction

Status: the default English architecture and planning route. This record
defines documentation direction only; it does not prove implemented behavior,
authorize a deployment, or replace a task-specific Decision Owner.

## Direction

Evi is a compact, local-first control plane. It keeps task and Run boundaries,
tool authorization, context selection, evidence, verified experience, and final
acceptance under Evi-owned control. Specialist tools and Pi-backed execution are
bounded delegated surfaces: they do not own Evi state, effects, evidence, or
completion.

Prefer verified use of existing tools and adapters before adding orchestration.
The normal growth sequence is verified tool experience, evaluation of a
reusable SOP or Skill candidate, then controlled delegation only when the
evidence warrants it. A parent task retains decomposition, integration,
independent verification, and final acceptance; a delegated result is advisory
until that verification succeeds.

## Decision and Evidence Boundary

Source, tests, and verified runtime evidence decide implemented facts. A design
record, successful delegated task, or model confidence is evidence for a
Decision Owner, not authority to cross a boundary. Material changes name their
owner, scope, evidence, verification, and rollback or retirement path.

Before a source-mutating work item, establish an Environment Baseline: identify
inherited changes and their owner, verify the worktree and branch, and check the
relevant runtime identity and health. Preserve unrelated work and keep one
isolated delivery lineage for each source-mutating work item.

## Default Route

1. Read this record, `README.md`, `docs/INDEX.md`, `memory/index.md`, and the
   stable core (`core/soul.md` and `core/memory.md`).
2. Use source, tests, and verified runtime evidence for implementation claims.
3. A concrete implementation task may explicitly select one long document by
   subject or identifier.
4. Retrieve dated records or frozen archives only by explicit identifier when
   their evidence is required; never preload them as direction.

English repository documents are the only default route. Localized material may
be retained and read when a task explicitly asks for it, but is not required
default context.
