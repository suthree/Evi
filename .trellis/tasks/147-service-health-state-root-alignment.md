# 147 Service Health State Root Alignment

Status: done

## Problem

After a local `service restart`, the resident IM service writes heartbeat and
review tick status under the service-scoped state root
`<LOCAL_RUNTIME_HOME>/state/runtime` when no explicit `--state-root` is supplied.
`service health` used the ordinary runtime selector instead, so the common
operator command could report `unknown` even while launchd was running and the
resident heartbeat was fresh.

## Scope

- Share the service state-root selection rule between service lifecycle
  commands and `service health`.
- Preserve explicit `--state-root` overrides for tests and intentional
  alternate service state roots.
- Keep `service health` read-only and bounded to service state plus repo git
  identity.

## Non-Goals

- Do not change ordinary interactive state selection for `live`, `pipeline`,
  `memory`, `context`, `review`, or governance commands.
- Do not make `service health` inspect launchd, read logs, run shell commands,
  invoke the model, restart services, or mutate state.
- Do not introduce hosted service, multi-user, or cross-machine state design.

## Verification

- `pnpm exec tsx --test tests/service.test.ts tests/service_health.test.ts`
- `pnpm run check`
- `pnpm run runtime -- service health --target im`
- `pnpm run runtime -- service restart --target im`
- `pnpm run runtime -- service health --target im`

## Result

`service health` now resolves the same service config selectors as service
lifecycle commands. Without `--state-root`, it reads
`<LOCAL_RUNTIME_HOME>/state/runtime`; with `--state-root`, it reads the explicit
state root. The CLI test covers the default service-state path and the service
helper test covers both default and explicit selector behavior.
