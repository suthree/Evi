# Task 118: Runtime Config Summary

## Goal

Expose effective runtime configuration as a non-secret operator read model so
later agents can understand self-evolution settings before changing or
restarting the resident service.

## Scope

- Add a reusable runtime config summary over repo, home, and state config
  layers.
- Read only `config.jsonl`, `models.jsonl`, and `settings.jsonl`.
- Expose active model, channel, and scenario selectors with source refs.
- Expose non-secret model metadata, runtime promotion/review tick flags,
  source refs, defaulted runtime fields, vault roots, and restart guidance.
- Add CLI `config`.
- Add Feishu `/config`, `/runtime config`, and `/service config`.
- Update stable docs, Trellis spec, and decisions.

## Non-goals

- Do not read `auth.jsonl`, API keys, app secrets, non-config runtime state
  artifacts, logs, raw context, review, episode, SOP, or skill bodies.
- Do not mutate config, write state, restart services, invoke the model, run
  review tick, request confirmations, execute follow-ups, or run shell
  commands.
- Do not enable the resident review tick loop.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/config_summary.test.ts tests/cli.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
