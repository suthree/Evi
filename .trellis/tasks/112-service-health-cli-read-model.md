# 112 Service Health CLI Read Model

## Intent

Expose the state-only resident IM service health read model through a direct CLI
command so operators and future context/backlog guidance can inspect heartbeat,
runtime-build, review tick, and pause state without falling back to the broader
service lifecycle/status surface.

## Scope

- Add `pnpm run runtime -- service health --target im`.
- Return `action=health`, `target=im`, and the existing bounded
  `getServiceHealth` result.
- Keep `service_health` Opportunity Backlog inspect guidance pointed at this
  state-only command.
- Update stable docs and tests.

## Safety Boundary

- Read only `services/im/heartbeat.json`, `services/im/review_tick.json`, and
  `autonomy/runs/pause_signal.json` under the selected state root.
- Do not inspect launchd, read service logs, restart services, invoke the model,
  request confirmations, execute follow-ups, mutate SOP/skill/memory state,
  mutate service state, write the active vault, write the repo, or run shell
  commands.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/cli.test.ts tests/service_health.test.ts tests/opportunity_backlog.test.ts tests/governance_status.test.ts tests/feishu_adapter.test.ts
pnpm run check
```

## Status

Implemented in the service-health-cli-read-model slice.
