# Repository Agent Instructions

This file is model-facing guidance for Codex and other host runtimes.

## Language Boundary

- Use Simplified Chinese for operator-facing discussion and final responses by default.
- Keep model-facing instruction and identity files in English when that makes the runtime contract clearer. Examples: `AGENTS.md`, `.trellis/agents/AGENTS.md`, `core/soul.md`, and related prompt/context files.
- Preserve source text, command output, code identifiers, API names, and quoted evidence in their original language unless the operator asks for translation.
- Prefer paired docs for important human-facing entrypoints: English `README.md` for models/tools and Simplified Chinese `docs/README.cn.md` for local operators. Keep root `README.md` thin and link into the Chinese companion under `docs/`. Extend that `.cn.md` companion pattern to other stable docs when the Chinese view needs to stay easy to scan.
- Do not translate code blocks, command examples, JSON field names, protocol literals, API names, or evidence refs unless the operator asks for it.

## Local Context

- Treat this repository as a local-first, single-machine runtime for a self-growing agent.
- Start with `README.md`, `docs/RUNTIME_CONTRACT.md`, `docs/LOCAL_RUNTIME.md`, and `docs/LOCAL_LEARNING.md` for stable model-facing context. Use `docs/README.cn.md` as the fast Simplified Chinese operator-facing overview.
- Read `docs/ACTIVE_EXPLORATION.md` only for active-exploration, content publishing, image-generation, Xiaohongshu adapter, or feedback-capture work.
- Read `.trellis/agents/AGENTS.md`, `.trellis/spec/local-single-machine-mvp.md`, and `.trellis/decisions.md` only when changing Trellis integration, project direction, or task governance.

## Work Discipline

- Inspect current code and runtime state before making claims about this repository.
- Keep changes small and consistent with the existing local runtime boundary.
- Preserve unrelated worktree changes.
- Run targeted checks when code or contract behavior changes.
