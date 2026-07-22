# Local Runtime

Local Runtime v0.1 is a local-first, single-machine runtime for a self-growing
agent. It turns a local task or IM message into bounded context, validated
actions, evidence, verification, and a response. The approved v0.2 direction
adds private, Git-backed reusable asset distribution without sharing runtime
state or turning Evi into a hosted multi-user control plane.

The accepted vNext architecture keeps one persistent local-first Evi self while
replacing the Goal-centric runtime foundation: ordinary work becomes a Turn in
a Run, Pi owns the only Agent Loop, SQLite owns structured runtime state, and an
Evi Action Gateway owns effects. This target does not expand the implemented
v0.1/v0.2 contract or claim a deployment cutover. The first two vNext source
slices now prove the Kernel and a read-only, reservation-first Gateway path;
neither is connected to production ingress.

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
- Runtime contract and local operations (read the routed section on demand):
  [docs/RUNTIME_CONTRACT.md](docs/RUNTIME_CONTRACT.md) and
  [docs/LOCAL_RUNTIME.md](docs/LOCAL_RUNTIME.md)
- SOP, skill, and active-vault boundaries:
  [docs/LOCAL_LEARNING.md](docs/LOCAL_LEARNING.md)
- Accepted long-term product and gated evolution vision:
  [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) and
  [docs/PRODUCT_VISION.cn.md](docs/PRODUCT_VISION.cn.md)
- Approved v0.2 multi-node evolution target:
  [docs/V0.2_MULTI_NODE_EVOLUTION.md](docs/V0.2_MULTI_NODE_EVOLUTION.md) and
  [docs/V0.2_MULTI_NODE_EVOLUTION.cn.md](docs/V0.2_MULTI_NODE_EVOLUTION.cn.md)

The linked documents are authoritative for their own subjects. Keep this file
as the short entrypoint; do not duplicate detailed command references,
contracts, or historical decisions here.

## Scope

The implemented v0.1 runtime is intentionally narrow:

- one local user and one machine;
- bounded repo/state actions through the harness;
- CLI, localhost web console, and local IM adapters;
- evidence-backed verification and explicit learning gates.

The v0.2 target keeps execution, raw memory, and runtime state node-local while
allowing selected reusable assets to move through a private LuBan Git
repository. It is still not a hosted multi-user service, public marketplace,
shared runtime-state system, or autonomous rewrite system.

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

## Runtime evolution direction

The current v0.2 deployment is still owned by `GoalRuntime`, its Harness,
canonical evidence, and `OutcomeReceipt`; [ADR 0001](docs/adr/0001-native-evolution-control-plane.md)
records that implemented boundary. The accepted replacement is
[ADR 0012](docs/adr/0012-vnext-runtime-kernel.md): ordinary Turns do not require
a Goal, Pi owns the only Agent Loop, and SQLite is the structured state
authority. [ADR 0013](docs/adr/0013-reservation-first-action-gateway.md) defines
the reservation-first Action Gateway slice and its current read-only limit.
v0.2 remains the rollback runtime until a separately verified cutover.

| Need | Source |
| --- | --- |
| Implemented behavior | source, tests, and `docs/RUNTIME_CONTRACT.md` |
| Accepted durable direction | `docs/adr/` and stable project docs |
| Current v0.2 execution and verified terminal result | `GoalRuntime`, Harness, evidence, `OutcomeReceipt` |
| Accepted vNext owner model | Turn / Run, Pi Agent Loop, SQLite, Action Gateway, optional Goal, Adaptation |
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
