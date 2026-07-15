# 110 Service Health Read Model

## Intent

Expose resident IM service health as a state-only read model so future context
bundles and Feishu operator views can detect heartbeat drift, dirty runtime
snapshots, review tick state, and active autonomy pause without gaining service
control authority.

## Scope

- Add a core `getServiceHealth` read model over local state artifacts.
- Include service health in the context `Service Runtime` section.
- Include health and heartbeat freshness in aggregate governance status.
- Add Feishu `/health` and `/service health` read-only operator commands.
- Update stable docs and tests for the read boundary.

## Safety Boundary

- Read only `services/im/heartbeat.json`, `services/im/review_tick.json`, and
  `autonomy/runs/pause_signal.json`.
- Do not inspect launchd, read logs, restart services, run shell commands,
  invoke the model, request confirmations, execute follow-ups, mutate
  SOP/skill/memory state, write the active vault, or write the repo from the
  read model.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/service_health.test.ts tests/feishu_adapter.test.ts tests/context_harness.test.ts tests/governance_status.test.ts
pnpm run check
```

## Status

Implemented in the service-health-read-model slice.
