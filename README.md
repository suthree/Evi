# Local Runtime

Local Runtime is a local-first, single-machine runtime for a self-growing
agent. It turns a local task or IM message into bounded context, validated
actions, evidence, verification, and a response.

v0.3 is the current documentation and planning baseline: Evi is a minimal
local control plane for task/Run boundaries, tool authorization, context,
evidence, experience, Skill/Adaptation lifecycle, and final acceptance. Pi is
an execution surface; a future Pi subagent is a bounded delegated surface, not
an owner of state, effects, evidence, or completion. Evi uses existing tools
and adapters through Tool Contracts and Tool Operation Protocols instead of
rebuilding specialist products. This is not a runtime cutover claim: source,
tests, and verified runtime evidence remain authoritative for implemented
behavior.

## Start here

- Chinese operator entrypoint: [docs/README.cn.md](docs/README.cn.md)
- Compact documentation router: [docs/INDEX.md](docs/INDEX.md) and
  [docs/INDEX.cn.md](docs/INDEX.cn.md)
- Current module ownership, delegated capability seams, and staged migration:
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
  [docs/ARCHITECTURE.cn.md](docs/ARCHITECTURE.cn.md)
- Source, directory, dependency, test, and documentation structure:
  [docs/ENGINEERING.md](docs/ENGINEERING.md) and
  [docs/ENGINEERING.cn.md](docs/ENGINEERING.cn.md)
- Repository work rules: [AGENTS.md](AGENTS.md) and
  [docs/AGENTS.cn.md](docs/AGENTS.cn.md)
- Stable identity and learning stance: [core/soul.md](core/soul.md) and
  [core/soul.cn.md](core/soul.cn.md)
- Current v0.3 operational baseline: [ADR 0018](docs/adr/0018-v0-3-tool-first-pi-learning-baseline.md)
  and [Chinese companion](docs/adr/0018-v0-3-tool-first-pi-learning-baseline.cn.md)
- Runtime contract and local operations (read the routed section on demand):
  [docs/RUNTIME_CONTRACT.md](docs/RUNTIME_CONTRACT.md) and
  [docs/LOCAL_RUNTIME.md](docs/LOCAL_RUNTIME.md)
- SOP, skill, and active-vault boundaries:
  [docs/LOCAL_LEARNING.md](docs/LOCAL_LEARNING.md)
- Accepted long-term product and gated evolution vision:
  [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) and
  [docs/PRODUCT_VISION.cn.md](docs/PRODUCT_VISION.cn.md)
- Historical v0.2 multi-node design (not the active roadmap):
  [docs/V0.2_MULTI_NODE_EVOLUTION.md](docs/V0.2_MULTI_NODE_EVOLUTION.md) and
  [docs/V0.2_MULTI_NODE_EVOLUTION.cn.md](docs/V0.2_MULTI_NODE_EVOLUTION.cn.md)

The linked documents are authoritative for their own subjects. Keep this file
as the short entrypoint; do not duplicate detailed command references,
contracts, or historical decisions here.

## Scope

The currently installed rollback runtime is intentionally narrow:

- one local user and one machine;
- bounded repo/state actions through the harness;
- CLI, localhost web console, and local IM adapters;
- evidence-backed verification and explicit learning gates.

vNext keeps execution, raw memory, and runtime state node-local. It is still
not a hosted multi-user service, public marketplace, shared runtime-state
system, or autonomous rewrite system.

## Development flow

`main` is the release branch. `develop` is the protected integration branch.
Every source change begins and remains in one isolated worktree branch until a
pull request has passed its required verification and is merged into `develop`.
No source change is committed or pushed directly to `develop`.

```text
main -> feature worktree -> PR -> develop -> main
```

The root checkout stays clean on `develop` as the control plane. A release
candidate is verified from an isolated local environment before `develop`
merges into `main` and receives a version tag.

Runtime identifiers, config fields, capability IDs, scripts, and persisted
state use capability-oriented names such as `local-runtime`, `project_design`,
`model`, and `im-channel`. Names of this repository or external reference
projects must not become implementation contracts.

## Current direction and historical route

[ADR 0018](docs/adr/0018-v0-3-tool-first-pi-learning-baseline.md) is the
current architecture and planning route. The immediate evidence sequence is
verified Pi tool execution, then experience-to-Skill evaluation, then a
controlled Pi subagent if warranted; it does not authorize broad orchestration.
Tool or delegated results remain inputs to Evi verification rather than
completion facts.

v0.2 and vNext ADRs and documents remain dated historical implementation and
rollback evidence. They are not default context, current runtime claims, or the
next roadmap; retrieve them by explicit identifier when their evidence is
needed.

| Need | Source |
| --- | --- |
| Implemented runtime contract | `docs/RUNTIME_CONTRACT.md` and source/tests evidence |
| Accepted durable direction | ADR 0018 and stable project docs |
| Current planning baseline | ADR 0018: tool-first Pi execution, experience, Skill lifecycle, Evi acceptance |
| Implemented behavior | source, tests, and verified runtime evidence |
| Historical implementation / rollback evidence | v0.2, vNext, ADRs 0001--0017, and frozen `.trellis/` |
| Reflection before material evolution | `grill-me` -> bounded `Direction Proposal` |
| Historical task/spec/decision evidence | frozen [.trellis/](.trellis/) archive |

Do not refresh or preload Trellis-generated agent context. It is retained only
as historical evidence and is not the default workflow for new work.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run release:verify
pnpm run runtime -- doctor --state-root ~/.local-runtime/state/evi
```

Start the local runtime after configuring ignored local credentials:

```bash
pnpm run runtime -- service restart --target runtime --state-root ~/.local-runtime/state/evi
pnpm run runtime -- service health --target runtime --state-root ~/.local-runtime/state/evi
```

Tracked files under `config/` are safe defaults. API keys and app secrets
belong only in ignored local configuration or the selected local state root;
never commit them.

## Repository map

```text
apps/cli/          CLI entrypoint
packages/core/     context, harness, evidence, governance
packages/runtime/  config, models, service, web and IM adapters
packages/kernel/   vNext Turn/Run kernel, SQLite state, Action Gateway, Pi adapter
config/            tracked safe defaults
core/              stable identity and memory policy
docs/              architecture, engineering, runtime and operator documentation
.trellis/          frozen historical specs, tasks, decisions, generated context
```
