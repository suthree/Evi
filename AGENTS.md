# Repository Agent Instructions

This file is model-facing guidance for Codex and other host runtimes.

## Language Boundary

- Use Simplified Chinese for operator-facing discussion and final responses by default.
- Keep model-facing instruction and identity files in English when that makes the runtime contract clearer. Examples: `AGENTS.md`, `core/soul.md`, and related prompt/context files. `.trellis/agents/AGENTS.md` is frozen historical evidence, not a model-facing entrypoint.
- Preserve source text, command output, code identifiers, API names, and quoted evidence in their original language unless the operator asks for translation.
- Prefer paired docs for important human-facing entrypoints: English `README.md` for models/tools and Simplified Chinese `docs/README.cn.md` for local operators. Keep root `README.md` thin and link into the Chinese companion under `docs/`. `docs/AGENTS.cn.md` and `core/soul.cn.md` are Chinese companions for local operators; the English files remain the default model-facing sources.
- When a stable English/Chinese doc pair is materially changed, update both sides in the same work item unless the operator explicitly scopes the change to one language.
- Do not translate code blocks, command examples, JSON field names, protocol literals, API names, or evidence refs unless the operator asks for it.

## Local Context

- Treat this repository as a local-first, single-machine runtime for a self-growing agent.
- Start with `README.md`, `docs/INDEX.md`, and `memory/index.md`. Route from the compact indexes, search headings or identifiers first, and read only the task-relevant sections of `docs/ARCHITECTURE.md`, `docs/ENGINEERING.md`, `docs/RUNTIME_CONTRACT.md`, `docs/LOCAL_RUNTIME.md`, or `docs/LOCAL_LEARNING.md`. Use `docs/INDEX.cn.md`, `docs/README.cn.md`, `docs/ARCHITECTURE.cn.md`, `docs/ENGINEERING.cn.md`, and `docs/AGENTS.cn.md` as fast Simplified Chinese operator-facing overviews.
- For current architecture and planning, read ADR 0018 first. v0.2 and vNext documents are dated implementation, rollback, or historical evidence unless a task explicitly routes to them; source, tests, and verified runtime evidence decide implementation facts.
- Treat long documents, raw logs, episodes, and archives as on-demand evidence stores rather than resident prompt context. Keep the current goal, working checkpoint, selected refs, and verification evidence hotter than historical bodies.
- Read `docs/ACTIVE_EXPLORATION.md` only for active-exploration, content publishing, image-generation, Xiaohongshu adapter, or feedback-capture work.
- Read [docs/adr/0001-native-evolution-control-plane.md](docs/adr/0001-native-evolution-control-plane.md) when changing self-evolution control, reflection, or delivery governance. Before a new source-mutating self-evolution Goal, also read [docs/adr/0002-environment-baseline-before-self-evolution.md](docs/adr/0002-environment-baseline-before-self-evolution.md). `.trellis/` is a frozen historical archive; read its records only when specific historical evidence is needed, and never refresh or use its generated agent context as active instruction.

## Instruction Ownership

| File | Owns | Does not own |
| --- | --- | --- |
| `core/soul.md` | Stable identity, values, learning stance, self-modification boundaries | Project commands, active tasks, repo-specific workflows |
| `AGENTS.md` | Repository entrypoint, reading order, work discipline, routing rules | Detailed runtime contract or generated legacy context |
| `docs/ARCHITECTURE.md` | Current module ownership, own/delegate seams, architecture pressure, and staged replacement order | Implemented behavior, product vision, or active task status |
| `docs/ENGINEERING.md` | Source, directory, dependency, test, and documentation structure | Product priority, runtime behavior, or task governance |
| `docs/RUNTIME_CONTRACT.md` | Runtime capability boundaries, core/basic capability direction, local evolution authority | Durable identity or operator personality |
| `docs/LOCAL_LEARNING.md` | SOP, skill, active-vault, and local-learning promotion gates | Core runtime behavior changes |
| `docs/adr/` | Accepted durable architectural and governance decisions | Runtime state, active Goal state, or hidden reasoning |
| `.trellis/` | Frozen historical specs, tasks, decisions, and evidence | Active governance, default context, or generated agent instruction |

## Work Discipline

- Inspect current code and runtime state before making claims about this repository.
- Start self-evolution work from the active Goal and native control plane: `GoalRuntime`, `Harness`, canonical evidence, and `OutcomeReceipt`. Use the applicable Decision Owner to scale controls by scope, evidence, risk, reversibility, recovery, and current operator intent. Durable code, dependency, deployment, or external effects require explicit scope, evidence, verification, and rollback or retirement; they do not require a default Issue or Trellis task.
- Before a new self-evolution Goal mutates source, establish the Environment Baseline defined by ADR 0002: classify inherited work, preserve historical evidence, assign current changes to an owner and disposition, verify worktree/branch/stash state, and check runtime identity and health. Do not replace this with a state wipe or a superficial clean status.
- When ambiguity, cross-layer change, context/harness/memory/dream work, repeated failure, or an unmeasurable capability gain triggers reflection, use `grill-me` to produce a bounded `Direction Proposal` only. Do not mutate, promote, deploy, or communicate externally until the Decision Owner accepts a direction. After acceptance, use `grill-with-docs` to update the glossary and, when durable or surprising, an ADR.
- Every source-mutating Goal uses one isolated branch/worktree for its full delivery lineage; later sessions and tools reuse that bound worktree rather than creating one per session. The root checkout stays clean on protected `develop`; it accepts source only through a verified pull-request merge, never a direct commit or push. The shared Evi control state is `~/.local-runtime/state/evi`, not a project-local `.runtime/` directory. The current `GoalExecutionWorkspace` still accepts legacy `codex/issue-N-slug` names; this does not require a live GitHub Issue. Keep any replacement of that naming rule in a separately verified runtime slice.
- The node-local active vault is `~/.local-runtime/vault/evi`; it is runtime state, not repository source. Repository `vault/` and `skills/` are explicit development fixtures and must not enter production discovery by default. A LuBan proposal is an Evi-controlled external Git effect with evidence, sanitization, verification, and retirement data; merge/acceptance and each node's activation remain separate Decision Owner decisions.
- A Goal-owned `codex.run` must reserve its exact Goal/effect/action-digest dispatch record before the child starts. Only a matching terminal child record may reconcile `effect_outcome_unknown`; a missing, active, invalid, or mismatched record leaves the effect paused and never authorizes replay. Raw prompts must not enter the durable dispatch record.
- Keep changes small and consistent with the existing local runtime boundary.
- Treat the accepted local self-growing mission as standing authorization for active self-iteration and self-growth. The agent may modify repository source, tests, docs, local runtime state, the active vault, SOPs, skills, scripts, and local dependencies when the change is evidence-backed and verifiable.
- Follow the v0.3 tool-first baseline: use existing tools/adapters through their contracts, record verified experience, and evaluate a Skill candidate before adding broad orchestration or a controlled Pi subagent. Pi execution and any subagent do not own Evi state, action authority, evidence, or final acceptance.
- Treat boundaries as decision-owned and context-sensitive rather than as a static permission list. Re-evaluate the applicable owner, evidence, risk, reversibility, and current operator intent when conditions materially change.
- Open local authority does not remove the harness: preserve evidence, inspect diffs, run targeted checks, keep rollback or retirement paths, and prefer core/basic capability gains before adding workflow surfaces.
- Treat `context` and `harness` as anti-drift infrastructure: bound inputs, validate actions, preserve evidence, and verify completion instead of relying on model confidence alone.
- Reuse existing commands, tools, adapters, SOPs, skills, and delegated surfaces before creating new mechanisms.
- Prefer the simplest architecture-consistent design, keep the Evi core compact, and treat external projects as references rather than standards.
- Never invent repository state, external data, test evidence, or completion. Label fixtures, mocks, synthetic data, estimates, and inference explicitly.
- Keep active project direction in stable docs and accepted ADRs. Preserve `.trellis/` unchanged as frozen historical evidence; do not refresh its generated agent context or route new work through it.
- Preserve unrelated worktree changes.
- Run targeted checks when code or contract behavior changes.

## Autonomy Decision Rule

- **Resolve** the current Decision Owner before a material boundary change. Depending on scope, that owner may be the operator, a harness/governance gate, or a stable repository/runtime contract. A model proposal or successful outcome is evidence for the decision, not the decision itself.
- **Act** without per-change confirmation for local self-iteration and self-growth inside the accepted mission. This includes repository and state writes, local command execution, dependency changes, durable local identity changes through the governance path, and SOP/skill draft, audit, promotion, revision, or retirement.
- **Adapt** local boundaries when new evidence, changed conditions, risk, reversibility, or better practice justifies it. An override must name the Decision Owner, authority basis, superseded constraint, scope, evidence, risk, verification, rollback or retirement path, and re-evaluation or expiry condition. Never infer an override silently from model confidence, task success, or the existence of standing local authority.
- **Ask** the operator when the accepted mission itself may change, the operator is the unresolved or final Decision Owner, secrets or private data may leave the machine, publication or external communication exceeds the requested flow, or the effect is destructive remote or otherwise irreversible external action.
- **Pause** only when ownership is unclear or a destructive change lacks credible verification and recovery. Ordinary file mutation, persistence, or promotion is not by itself a reason to pause.
