# Task 224: Transactional Runtime Self-Deployment

Status: implemented

## Problem

The resident runtime could preserve and manually swap one commit-bound
last-known-good bundle, but the replaceable runtime still owned restart and
rollback execution. A failed candidate could therefore lose the ability to
recover itself, and lifecycle logs were not bound to one deployment or repair
task.

## Scope

- Install a stable local launchd supervisor outside the replaceable runtime.
- Stage a clean distinct commit in the existing `next` slot through a typed
  deployment request.
- Enforce commit-bound heartbeat, Web, and configured IM startup readiness plus
  bounded local probation.
- Automatically swap back to `previous` after hard local failure or an explicit
  evidence-bound failure signal.
- Preserve bounded deployment log/heartbeat/failure evidence.
- Queue one fix-forward repair task after the previous build recovers.
- Reject the same failed commit and stop a repair chain after two attempts.

## Non-goals

- No containers, remote deployment, hosted control plane, multi-node
  coordination, or database-backed release system.
- No model invocation or repository editing from the supervisor.
- No semantic rollback decision from ordinary error-log text.
- No incompatible or destructive state migration in the v0.1 autonomous path.
- No automatic Git push, pull request, public release, or external
  communication.

## Acceptance

- A clean distinct candidate is staged without stopping the running service.
- The stable supervisor activates it and binds readiness to the candidate
  commit.
- A deterministic failure signal captures deployment-scoped evidence and
  restores the previous build without operator lifecycle commands.
- Recovery readiness queues one bounded fix-forward task with failed/stable
  commit and evidence refs.
- A repaired new commit can request another deployment through the same state
  machine.
- Existing manual start, restart, rollback, logs, and health surfaces remain
  available.

## Verification

- `node --import tsx --test tests/deployment_supervisor.test.ts tests/service.test.ts tests/cli.test.ts tests/capabilities.test.ts`
- `pnpm run check`
- Install the committed build, refresh commit-bound basic-entrypoint acceptance,
  stage a distinct local candidate, submit an explicit deployment failure,
  verify automatic rollback/recovery evidence and repair-task enqueueing, then
  deploy a new repaired commit and verify resident service health.

## Live Drill

- Candidate marker: `transactional-deploy-drill-v1`.
- The marker intentionally makes this commit distinct from the known-good
  baseline; the live drill will submit an explicit failure signal instead of
  introducing an uncontrolled runtime defect.
