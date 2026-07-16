# Local Runtime

Local Runtime v0.1 is a local-first, single-machine runtime for a self-growing
agent. It turns a local task or IM message into bounded context, validated
actions, evidence, verification, and a response. The approved v0.2 direction
adds private, Git-backed reusable asset distribution without sharing runtime
state or turning Evi into a hosted multi-user control plane.

## Start here

- Chinese operator entrypoint: [docs/README.cn.md](docs/README.cn.md)
- Compact documentation router: [docs/INDEX.md](docs/INDEX.md) and
  [docs/INDEX.cn.md](docs/INDEX.cn.md)
- Repository work rules: [AGENTS.md](AGENTS.md) and
  [docs/AGENTS.cn.md](docs/AGENTS.cn.md)
- Stable identity and learning stance: [core/soul.md](core/soul.md) and
  [core/soul.cn.md](core/soul.cn.md)
- Runtime contract and local operations (read the routed section on demand):
  [docs/RUNTIME_CONTRACT.md](docs/RUNTIME_CONTRACT.md) and
  [docs/LOCAL_RUNTIME.md](docs/LOCAL_RUNTIME.md)
- SOP, skill, and active-vault boundaries:
  [docs/LOCAL_LEARNING.md](docs/LOCAL_LEARNING.md)
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

`main` is the release branch. Each `f/*` branch starts from `main`, is
validated and merged into `develop`, then validated `develop` changes merge
back into `main`.

```text
main -> f/* -> develop -> main
```

The integration branch is `develop`. A release candidate is verified from an
isolated local environment before `develop` merges into `main` and receives a
version tag.

Runtime identifiers, config fields, capability IDs, scripts, and persisted
state use capability-oriented names such as `local-runtime`, `project_design`,
`model`, and `im-channel`. Names of this repository or external reference
projects must not become implementation contracts.

## Trellis owns iteration governance

Trellis is the source of truth for bounded iteration work:

| Need | Source |
| --- | --- |
| Implemented v0.1 scope | [.trellis/spec/local-single-machine-mvp.md](.trellis/spec/local-single-machine-mvp.md) |
| Approved v0.2 target | [.trellis/spec/v0.2-multi-node-evolution.md](.trellis/spec/v0.2-multi-node-evolution.md) |
| Work slices | [.trellis/tasks/](.trellis/tasks/) |
| Direction decisions | [.trellis/decisions.md](.trellis/decisions.md) |
| Trellis agent context | [.trellis/agents/](.trellis/agents/) |

Do not manually duplicate or edit Trellis-generated agent context. Use the
project's configured Trellis workflow and supported CLI commands to refresh
that surface.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run release:verify
pnpm run runtime -- doctor --state-root .runtime/state
```

Start the local runtime after configuring ignored local credentials:

```bash
pnpm run runtime -- service restart --target runtime --state-root .runtime/state
pnpm run runtime -- service health --target runtime --state-root .runtime/state
```

Tracked files under `config/` are safe defaults. API keys and app secrets
belong only in ignored local configuration or the selected local state root;
never commit them.

## Repository map

```text
apps/cli/          CLI entrypoint
packages/core/     context, harness, evidence, governance
packages/runtime/  config, models, service, web and IM adapters
config/            tracked safe defaults
core/              stable identity and memory policy
docs/              runtime and operator documentation
.trellis/          iteration spec, tasks, decisions, generated context
```
