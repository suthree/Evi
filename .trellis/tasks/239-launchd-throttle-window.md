# Task 239: Span launchd throttle window during activation

## Context

Issue #48 documents a failed candidate activation: three kickstart retries totaled 750ms, while later 5-second supervisor ticks recovered the stable runtime `1571967500`. The merged controller-handoff feature is not part of this change; failed candidate history must not be redeployed.

## Scope

Allowed edits are limited to:

- `packages/runtime/src/service_supervisor.ts`
- `packages/runtime/src/service.ts`
- focused deployment-supervisor/service tests
- this task file

## Required implementation

1. Add an explicit configurable kickstart retry window that safely covers launchd throttling.
2. Installed manifest and defaults must configure at least seven attempts.
3. Preserve bounded exponential backoff and the existing 90-second startup deadline.
4. Emit typed retry/exhaustion evidence and a precise final error.
5. Keep the existing three-attempt transient test valid through an explicit test manifest.
6. Add regressions for seven-attempt success and exhaustion evidence.
7. Tests must avoid real long waits through injected/bounded delay or test-specific configuration.

## Verification

Run focused `deployment_supervisor` and `service` tests plus `git diff --check`. Do not run a full suite unless budget remains.

## Boundaries

No unrelated refactor. No commit, push, PR, merge, deployment, restart, controller handoff, release, tag, publication, root edit, or global configuration change.
