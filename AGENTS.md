# Repository Agent Instructions

This file is model-facing guidance for Codex and other host runtimes.

## Language Boundary

- Use Simplified Chinese for operator-facing discussion and final responses by default.
- Keep model-facing instruction and identity files in English when that makes the runtime contract clearer. Examples: `AGENTS.md`, `.trellis/agents/AGENTS.md`, `core/soul.md`, and related prompt/context files.
- Preserve source text, command output, code identifiers, API names, and quoted evidence in their original language unless the operator asks for translation.
- Prefer paired docs for important human-facing entrypoints: English `README.md` for models/tools and Simplified Chinese `docs/README.cn.md` for local operators. Keep root `README.md` thin and link into the Chinese companion under `docs/`. `docs/AGENTS.cn.md` and `core/soul.cn.md` are Chinese companions for local operators; the English files remain the default model-facing sources.
- When a stable English/Chinese doc pair is materially changed, update both sides in the same work item unless the operator explicitly scopes the change to one language.
- Do not translate code blocks, command examples, JSON field names, protocol literals, API names, or evidence refs unless the operator asks for it.

## Local Context

- Treat this repository as a local-first, single-machine runtime for a self-growing agent.
- Start with `README.md`, `docs/RUNTIME_CONTRACT.md`, `docs/LOCAL_RUNTIME.md`, and `docs/LOCAL_LEARNING.md` for stable model-facing context. Use `docs/README.cn.md` and `docs/AGENTS.cn.md` as fast Simplified Chinese operator-facing overviews.
- Read `docs/ACTIVE_EXPLORATION.md` only for active-exploration, content publishing, image-generation, Xiaohongshu adapter, or feedback-capture work.
- Read `.trellis/agents/AGENTS.md`, `.trellis/spec/local-single-machine-mvp.md`, and `.trellis/decisions.md` only when changing Trellis integration, project direction, or task governance.

## Instruction Ownership

| File | Owns | Does not own |
| --- | --- | --- |
| `core/soul.md` | Stable identity, values, learning stance, self-modification boundaries | Project commands, active tasks, repo-specific workflows |
| `AGENTS.md` | Repository entrypoint, reading order, work discipline, routing rules | Detailed runtime contract or Trellis-generated context |
| `docs/RUNTIME_CONTRACT.md` | Runtime capability boundaries, core/basic capability direction, gray self-iteration path | Durable identity or operator personality |
| `docs/LOCAL_LEARNING.md` | SOP, skill, active-vault, and local-learning promotion gates | Core runtime behavior changes |
| `.trellis/` | Bounded task governance, specs, decisions, Trellis-maintained agent context | Runtime state, durable memory, active vault, skill promotion authority |

## Work Discipline

- Inspect current code and runtime state before making claims about this repository.
- Keep changes small and consistent with the existing local runtime boundary.
- Prioritize direction control over active self-iteration. Self-iteration should be slow, evidence-backed, reversible where possible, and focused on core/basic runtime capability before new workflow surfaces.
- Treat `context` and `harness` as anti-drift infrastructure: bound inputs, validate actions, preserve evidence, and verify completion instead of relying on model confidence alone.
- Reuse existing commands, tools, adapters, SOPs, skills, and delegated surfaces before creating new mechanisms.
- Let Trellis maintain Trellis-owned agent context through Trellis commands and generated files. Keep manual project direction in stable docs and decisions, outside generated Trellis output.
- Preserve unrelated worktree changes.
- Run targeted checks when code or contract behavior changes.

## Autonomy Decision Rule

- **Act** when the scope is local, low-risk, evidence is available, existing tools cover the need, and targeted verification is clear.
- **Ask** before changing project direction, durable identity, permissions, external behavior, public output, persistence, dependencies, or promotion status.
- **Pause** when direction, verification, rollback, or ownership is unclear. Record or narrow the gap instead of pushing autonomous iteration forward.
