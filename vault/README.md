# Agent Vault

`vault/` is the repo-local seed and development fixture for learned
capabilities.

Runtime state under `.runtime-state` records what happened in a run. The local
active vault under `LOCAL_RUNTIME_HOME` is the runtime write target for promoted
procedures. Repository `vault/` keeps seed examples, test fixtures, and
provenance-backed development material.

## Layout

```text
vault/
├── sop/
│   ├── drafts/          # seed/dev SOP candidates
│   ├── promoted/        # audited SOP seed examples
│   └── retired/         # old SOPs kept for provenance
├── skill-candidates/    # seed/dev skill package candidates
├── skills/              # seed skill packages
├── registry/
│   ├── skills.jsonl     # seed/dev searchable skill registry snapshot
│   └── skill-events.jsonl # seed/dev promotion/use/revision events
├── pipelines/templates/ # reusable staged workflow specs promoted from SOP/skills
└── policies/            # local-first self-governance and audit policy fixtures
```

## Rules

- Keep skill packages portable: `SKILL.md` plus optional `scripts/`, `references/`, and `assets/`.
- Keep runtime metadata out of skill packages; store source SOP, hash, status, usage, and events in `vault/registry/`.
- Promote only from evidence-backed SOPs that pass autonomous audit.
- Do not treat this repository directory as a shared public skill source or
  cross-machine sync mechanism in the first version.
