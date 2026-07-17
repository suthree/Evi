# Task 234: Isolate service lifecycle tests from installed launchd

- Status: active
- Linked Issue: #32 — https://github.com/suthree/Evi/issues/32
- Owner repository: suthree/Evi
- Implementation owner: supervisor Codex under the Task 233 minimal bootstrap override
- Decision Owner: operator direction to complete PR, merge, deployment, rollback, and continued iteration
- Capability layer: core harness
- Base commit: f5370f11f1b8a9a27b1f54cf29f574fbb0164027
- Branch: codex/issue-32-isolate-service-tests
- Worktree: /Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/32-isolate-service-tests

## Evidence and problem

Issue #30's new restart test used a synthetic `homeRoot`, but
`buildRuntimeServiceDefinition()` intentionally locates launchd plists under the
real user's `~/Library/LaunchAgents`. The fake command runner prevented actual
launchctl effects while the test still rewrote the real plist with temporary
bundle paths. Deployment `deployment_20260717023600_f5370f11f1b8` then loaded
that deleted path, timed out, and automatically recovered `d6e8f2e`.

The resident repair task
`runtime_task_deployment_repair_deployment_20260717023600_f5370f11f1b8`
attempted the fix three times, returned `no_sop`, produced no diff, and failed
the required repair-deployment completion gate. Root `develop` stayed clean.

## Contract

Add one dependency-injection seam to `runServiceCommand()` so lifecycle tests
can provide a fully isolated `ServiceDefinition`. Bind the restart test's
runtime and supervisor plist paths to its temporary home and prove the test
writes there. Production definition resolution, CLI shape, and service/deploy
behavior remain unchanged.

Non-goals: no public CLI option, no production launchd path change, no main/tag/
release, no LuBan, no delegation redesign, and no unrelated test cleanup.

## Verification and recovery

- focused `tests/service.test.ts`, deployment, and CLI checks;
- full `pnpm run check` and `git diff --check`;
- ready PR to `develop`;
- fix-forward deployment request with
  `--repair-of deployment_20260717023600_f5370f11f1b8`;
- resident commit, Web/IM, heartbeat, probation, and stable evidence.

Code rollback is a single-PR revert. Runtime rollback remains the verified
supervisor `current/previous` transaction. This task is bootstrap repair
evidence and does not count as the required post-deploy Evi-owned iteration.

## Pre-PR evidence

- Focused service/deployment/CLI suite passed 102/102 on 2026-07-17.
- `pnpm run check` passed: TypeScript build, 868/868 tests, active-vault skill
  validation, and neutral naming across 123 implementation files.
- The real `~/Library/LaunchAgents/local.runtime.runtime.plist` retained SHA-256
  `65025eec8d120de8bcad8a72a4258b05840f29ff1ec73944728c088d01d4990f`
  before and after the full gate, and still points at the installed `current`
  bundle.
