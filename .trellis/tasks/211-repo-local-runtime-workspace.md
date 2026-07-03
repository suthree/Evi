# Task 211: Repo-Local Runtime Workspace

Status: implemented

## Problem

Local foreground runs and smoke commands had started creating multiple
top-level `.runtime-*` directories in the repository checkout. They were ignored
by git, but the operator surface was noisy and the directory intent was unclear.

## Scope

- Use `.runtime/state` as the tracked config default for repo-local foreground
  state.
- Use `.runtime/stage` for explicit pipeline experiments.
- Use `.runtime/smoke/<name>` for one-off smoke scripts.
- Keep legacy `.runtime-*` paths ignored so older local artifacts do not become
  git noise.
- Preserve resident IM service behavior: without an explicit `--state-root`, it
  still uses `<LOCAL_RUNTIME_HOME>/state/runtime`.
- Let `doctor` accept nested missing state roots when the nearest existing
  parent is writable.

## Non-Goals

- No migration or deletion of existing ignored local `.runtime-*` directories.
- No change to state artifact schemas.
- No change to resident service state defaults.
- No multi-machine sync or hosted runtime layout.

## Verification

- `pnpm run runtime -- config`
- `pnpm run runtime -- doctor --no-auth --no-im`
- `node --import tsx --test tests/doctor.test.ts tests/config_summary.test.ts tests/service.test.ts`
- `pnpm run build`
