# 111 Service Health Opportunity Backlog

## Intent

Promote abnormal resident IM service health into the ranked Opportunity Backlog
so stale heartbeat, dirty runtime snapshots, non-running service state, or
review tick failures become visible in the same local attention queue used by
context, governance status, and Feishu operator views.

## Scope

- Add `service_health` as a derived Opportunity Backlog item kind.
- Include only abnormal or heartbeat-backed unknown service health, not empty
  throwaway state or ordinary standalone review tick status.
- Render bounded service-health summary fields in context, governance status,
  and Feishu opportunity views.
- Allow append-only `governance decide-opportunity` decisions for this derived
  item kind.
- Update stable docs and tests.

## Safety Boundary

- Read only the existing state-only service health read model.
- Do not inspect launchd, read service logs, restart services, invoke the model,
  request confirmations, execute follow-ups, mutate SOP/skill/memory state,
  mutate service state, write the active vault, write the repo, or run shell
  commands from the backlog read model or renderers.
- Service-control actions remain explicit operator commands outside read-only
  Opportunity Backlog, context, governance, and Feishu views.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/opportunity_backlog.test.ts tests/context_harness.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts
pnpm run check
```

## Status

Implemented in the service-health-opportunity-backlog slice.
