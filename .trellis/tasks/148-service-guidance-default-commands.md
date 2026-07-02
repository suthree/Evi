# 148 Service Guidance Default Commands

Status: done

## Problem

After `service health` was aligned to the service-scoped default state root,
the generated guidance shown in service health, Opportunity Backlog, context,
governance, and Feishu still implied operators had to provide
`--state-root <state-root>` for service health/restart commands. That made the
operator surface inconsistent with the actual local service harness.

## Scope

- Remove the default `--state-root <state-root>` placeholder from generated
  service restart guidance.
- Remove the default `--state-root <state-root>` placeholder from generated
  service health inspect guidance.
- Keep explicit `<state-root>` placeholders for non-service commands such as
  memory, review, pipeline, context, and governance.
- Update tests and docs for context, Feishu, service health, and Opportunity
  Backlog renderings.

## Non-Goals

- Do not change the read-only service health boundary.
- Do not change service lifecycle behavior or launchd integration.
- Do not remove explicit state-root overrides from CLI parsing.
- Do not alter ordinary interactive runtime state selection.

## Verification

- `pnpm exec tsx --test tests/service_health.test.ts tests/opportunity_backlog.test.ts tests/context_harness.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
- `pnpm run runtime -- service health --target im`
- `pnpm run runtime -- service restart --target im`
- `pnpm run runtime -- service health --target im`

## Result

Generated service inspect guidance now uses:
`pnpm run runtime -- service health --target im`.

Generated service restart guidance now uses:
`pnpm run runtime -- service restart --target im ...`.

Non-service operator commands still keep explicit `<state-root>` placeholders.
