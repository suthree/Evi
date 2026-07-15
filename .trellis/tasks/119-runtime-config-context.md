# Task 119: Runtime Config Context

## Goal

Expose effective runtime configuration inside live context so later agent turns
can see active selectors and self-evolution settings without using operator
commands.

## Scope

- Add an optional `Runtime Config` context section sourced from the non-secret
  runtime config summary.
- Render active model, channel, and scenario selectors, non-secret model
  metadata, runtime promotion/review tick flags, source refs, defaulted runtime
  fields, vault roots, and restart guidance.
- Pass the runtime config summary from `LiveAgentRunner` when the runner has a
  configured config dir.
- Keep `packages/core` independent from `packages/runtime` by passing the
  summary into context rendering.
- Update stable docs, Trellis spec, and decisions.

## Non-goals

- Do not read `auth.jsonl`, API keys, app secrets, non-config runtime state
  artifacts, logs, raw context, review, episode, SOP, or skill bodies.
- Do not mutate config, write state, restart services, invoke the model
  recursively, run review tick, request confirmations, execute follow-ups, or
  run shell commands.
- Do not enable the resident review tick loop.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/context_harness.test.ts tests/config_summary.test.ts`
- `pnpm run check`
