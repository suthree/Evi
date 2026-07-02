# 107 Resident Runtime Build Governance Visibility

## Intent

Expose the resident IM service copied-runtime build metadata in aggregate
governance views so operators can confirm which local build is running from the
same governance surface they use for self-evolution triage.

## Scope

- Carry validated `runtime_build` metadata from `services/im/heartbeat.json`
  into the shared governance status read model.
- Render the runtime commit, branch, dirty flag, and build time in Feishu
  `/governance`.
- Keep Feishu `/status` and `/governance` on the same runtime-build rendering
  vocabulary.
- Update stable docs and tests.

## Safety Boundary

- Do not read `LOCAL_RUNTIME_HOME/service/runtime/current/build.json` from governance
  views.
- Do not run `git`, `launchctl`, shell commands, review tick, background review,
  or the model from governance rendering.
- Do not mutate SOP/skill/memory state, write the active vault, request
  confirmations, or execute follow-ups.
- Do not treat runtime build metadata as proof that current repo changes have
  been deployed; it is the resident copied-runtime build identity only.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/governance_status.test.ts tests/feishu_adapter.test.ts
pnpm run check
```

## Status

Implemented in the resident-runtime-build-governance-visibility slice.
