# Evi

Evi is a local-first, single-machine runtime for a self-growing agent. It
turns a local task or IM message into bounded context, validated actions,
evidence, verification, and a response.

## Start here

- Chinese operator entrypoint: [docs/README.cn.md](docs/README.cn.md)
- Repository work rules: [AGENTS.md](AGENTS.md) and
  [docs/AGENTS.cn.md](docs/AGENTS.cn.md)
- Stable identity and learning stance: [core/soul.md](core/soul.md) and
  [core/soul.cn.md](core/soul.cn.md)
- Runtime contract and local operations:
  [docs/RUNTIME_CONTRACT.md](docs/RUNTIME_CONTRACT.md) and
  [docs/LOCAL_RUNTIME.md](docs/LOCAL_RUNTIME.md)
- SOP, skill, and active-vault boundaries:
  [docs/LOCAL_LEARNING.md](docs/LOCAL_LEARNING.md)

The linked documents are authoritative for their own subjects. Keep this file
as the short entrypoint; do not duplicate detailed command references,
contracts, or historical decisions here.

## Scope

Evi is intentionally narrow:

- one local user and one machine;
- bounded repo/state actions through the harness;
- CLI, localhost web console, and local IM adapters;
- evidence-backed verification and explicit learning gates.

It is not a hosted, multi-user, multi-machine, marketplace, or autonomous
rewrite system.

## Development flow

`main` is the release branch. Each `f/*` branch starts from `main`, is
validated and merged into `develop`, then validated `develop` changes merge
back into `main`.

```text
main -> f/* -> develop -> main
```

The active implementation branch is `f1/init`.

## Trellis owns iteration governance

Trellis is the source of truth for bounded iteration work:

| Need | Source |
| --- | --- |
| Current scope | [.trellis/spec/local-single-machine-mvp.md](.trellis/spec/local-single-machine-mvp.md) |
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
