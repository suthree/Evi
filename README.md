# Local Runtime

Local Runtime is a local-first, single-machine runtime for a self-growing
agent. It turns a local task or IM message into bounded context, validated
actions, evidence, verification, and a response.

The current direction is a compact local control plane for task and Run
boundaries, tool authorization, context, evidence, experience, Skill and
Adaptation lifecycle, and final acceptance. Pi is a bounded execution surface,
not an owner of Evi state, effects, evidence, or completion. Evi uses existing
tools and adapters through Tool Contracts and Tool Operation Protocols instead
of rebuilding specialist products. This direction is not a runtime-cutover
claim: source, tests, and verified runtime evidence remain authoritative for
implemented behavior.

## Start here

- Default architecture and planning route: [docs/CURRENT_DIRECTION.md](docs/CURRENT_DIRECTION.md)
- Compact documentation router: [docs/INDEX.md](docs/INDEX.md)
- Repository work rules: [AGENTS.md](AGENTS.md)
- Stable identity and learning stance: [core/soul.md](core/soul.md)
- Resident memory pointers: [memory/index.md](memory/index.md)

The linked documents are authoritative for their own subjects. Keep this file
as the short entrypoint; do not duplicate detailed command references,
contracts, or historical decisions here.

## Scope

The supported local operating envelope is intentionally narrow:

- one local user and one machine;
- bounded repo/state actions through the harness;
- CLI, localhost web console, and local IM adapters;
- evidence-backed verification and explicit learning gates.

The current direction keeps execution, raw memory, and runtime state
node-local. It is not a hosted multi-user service, public marketplace, shared
runtime-state system, or autonomous rewrite system.

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

## Current direction and factual sources

[docs/CURRENT_DIRECTION.md](docs/CURRENT_DIRECTION.md) is the default
architecture and planning route. The immediate evidence sequence is verified Pi
tool execution, then experience-to-Skill evaluation, then a controlled Pi
subagent if warranted; it does not authorize broad orchestration. Tool or
delegated results remain inputs to Evi verification rather than completion
facts.

Dated records are not default context, current runtime claims, or the next
roadmap; retrieve one only by explicit identifier when its evidence is needed.

| Need | Source |
| --- | --- |
| Implemented runtime contract | `docs/RUNTIME_CONTRACT.md` and source/tests evidence |
| Current direction | `docs/CURRENT_DIRECTION.md` and the stable core it routes to |
| Current planning baseline | Tool-first Pi execution, experience, Skill lifecycle, and Evi acceptance |
| Implemented behavior | source, tests, and verified runtime evidence |
| Reflection before material evolution | `grill-me` -> bounded `Direction Proposal` |

Do not refresh or preload archive-generated agent context. It is retained only
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
packages/kernel/   execution kernel, SQLite state, Action Gateway, Pi adapter
config/            tracked safe defaults
core/              stable identity and memory policy
docs/              architecture, engineering, runtime and operator documentation
```
