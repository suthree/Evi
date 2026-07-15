# 108 Resident Service Runtime Context

## Intent

Expose the resident IM service heartbeat and copied-runtime build identity in
live context so local model runs can see which resident service is running
without widening context assembly into service control.

## Scope

- Add a bounded `Service Runtime` context section sourced from
  `services/im/heartbeat.json`.
- Render IM state, pid, channel, scenario, heartbeat update time, runtime
  commit, runtime branch, dirty flag, and build time.
- Record `services/im/heartbeat.json` in the context manifest section refs.
- Update stable docs and context harness coverage.

## Safety Boundary

- Do not import runtime-package helpers into `packages/core`.
- Do not read `LOCAL_RUNTIME_HOME/service/runtime/current/build.json` from context
  assembly.
- Do not run `git`, shell commands, `launchctl`, service restart, review tick,
  background review, or the model from context rendering.
- Do not mutate SOP/skill/memory state, write the active vault, request
  confirmations, or execute follow-ups.
- Do not treat heartbeat runtime metadata as proof that current repo changes
  are deployed; it is only the resident copied-runtime build identity.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/context_harness.test.ts
pnpm run check
```

## Status

Implemented in the resident-service-runtime-context slice.
