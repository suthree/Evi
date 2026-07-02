# Task 01: Docs Scope Reset

## Goal

Make the stable docs describe the local single-machine first version with no
compatibility, multi-user, multi-node, marketplace, GUI, daemon, or deployment
roadmap language.

## Scope

- Rewrite `README.md` around local first-version capability layers.
- Rewrite `docs/RUNTIME_CONTRACT.md` as the local runtime contract.
- Rename startup/deployment docs to `docs/LOCAL_RUNTIME.md`.
- Rename vault/skill docs to `docs/LOCAL_LEARNING.md`.
- Delete `docs/ITERATION_PLAN.md`.
- Move current planning into `.trellis/`.
- Use `pnpm` in command examples.

## Verification

- `rg` should not find stale stable-doc references to deleted doc names.
- `pnpm run check` should pass.

## Status

Completed.
