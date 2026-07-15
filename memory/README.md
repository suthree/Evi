# Memory Workspace

This directory is the future workspace for agent memory artifacts. The policy lives in `core/memory.md`; this directory should hold concrete memory data once the implementation exists.

## Suggested Layout

```text
memory/
├── index.md              # Compact resident index
├── semantic/             # Durable scoped facts
├── episodes/             # Raw or summarized session evidence
├── working/              # Active checkpoints
├── dreams/               # Reflection reports and promotion proposals
└── retired/              # Demoted or stale memory with reasons
```

## Storage Rules

- Keep raw evidence separate from promoted conclusions.
- Give durable entries source pointers.
- Mark stale, uncertain, or memory-derived facts clearly.
- Do not store secrets.
- Prefer project documentation for rules that every collaborator must follow.
- Keep the resident index small.

## Reflection Outputs

Reflection reports should include:

- source episodes reviewed
- memory promotion items
- SOP drafts
- skill drafts
- evidence strength
- risk of pollution
- recommended action
- autonomous audit outcome

Autonomous operation reports should also include:

- backlog source
- growth value rationale
- exploration budget used
- stop conditions encountered

Reflection reports do not become durable memory until promoted.
