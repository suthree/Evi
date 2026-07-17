# Deployment Activation Recovery

Status: ready PR #45; implementation commit and independent/repository review evidence recorded; ordinary merge, deployment, resident controller handoff, live probation, and rollback verification pending

## Identity And Ownership

- Issue: GitHub Issue #43, `fix(runtime): make deployment activation recovery self-healing`.
- Milestone / target version: Issue #43 runtime repair; no release or deployment claim in this task.
- Owner repository: Evi.
- Implementation owner: bounded Codex CLI execution under the main harness.
- Decision Owner / authority basis: the operator-approved Issue #43 contract supplied by the main harness.
- Capability layer: basic-entrypoint.
- Base commit: `a330b21a1f4b715e551872947d0cde1cfc77098c`.
- Branch: `codex/issue-43-deployment-activation-recovery`.
- Isolated worktree: `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/43-deployment-activation-recovery`.

## Problem And Evidence

- Root `develop` was clean at the base commit after PR #42 merged.
- `deployment_20260717042735_a330b21a1f4b` is terminal `rollback_failed`.
- Candidate activation recorded exactly `candidate activation failed: launchctl kickstart failed:`.
- Later rollback readiness failed with `runtime_not_running` and `heartbeat_stale` because `recovering` only polled readiness instead of actively restoring service liveness.
- Supervisor-only containment restored the resident service on last-known-good runtime `1571967500fcb6df4fcaeb808b7095974e0c9caa`; Web, Feishu, and heartbeat recovered, but that containment is evidence of the defect, not implementation acceptance.
- Current source contains the Issue #38 ledger correction, while the failed candidate is not resident. The canonical stable deployment ledger must remain separate from failed-candidate history.
- The independent supervisor entrypoint is copied from the installed current runtime only during service lifecycle install/start/restart. Candidate bundle activation does not itself activate a new supervisor controller version, so controller handoff must remain explicit and must not be inferred from candidate residency.

## Outcome, Scope, And Acceptance

- Retry transient launchd bootstrap/kickstart failures with a small explicit bound and persist attempt evidence.
- While a deployment is `recovering`, actively and idempotently restore the recorded known-good slot and start it before the recovery deadline; do not merely poll readiness.
- Bound recovery attempts, retain exact launchctl/readiness evidence on exhaustion, and never report recovery unless known-good readiness passes.
- Preserve the Issue #38 canonical ledger: the restored stable record remains canonical and the failed candidate remains a distinct history record.
- Record the independent-controller boundary precisely: the installed copied controller stays active during candidate activation; a newer controller requires a later explicit service lifecycle handoff and is not proven resident by these tests.
- Add focused tests for transient retry success, retry exhaustion with precise evidence, active idempotent known-good restoration, canonical ledger preservation, and controller-version/handoff assessment.

## Boundaries

- Scope: `packages/runtime/src/service_supervisor.ts`, the service manifest/controller metadata needed to expose the boundary, focused tests, this task record, and narrowly matching operator documentation if contract text needs correction.
- Non-goals: no service restart, deployment, reconciliation, live mutation, GitHub mutation, dependency change, broad refactor, new controller service, commit, push, pull request, merge, or release.
- Dependencies / blockers / cross-repository links: Issue #43 and the existing Issue #38 ledger contract; no cross-repository work and no known implementation blocker.
- Architecture impact: strengthens the existing independent deployment supervisor and launchd adapter only; no new service, queue, store, or framework.
- External effects / sensitive data / authority gates: repository-local source and test writes only; no secrets, private data egress, external communication, or resident-runtime action.

## Design Discipline

- Reuse: existing supervisor state machine, current/previous bundle swap helpers, launchctl runner, readiness deadline, atomic deployment ledger writes, and focused deployment tests.
- Complexity: one bounded command retry helper plus one idempotent recovering transition is the smallest coherent repair.
- Data/source contract: Issue #43 evidence and checked-in source/tests are authoritative. Tests use temporary synthetic bundles, heartbeats, launchctl results, and deployment ledgers and do not claim live runtime evidence.
- Migration / compatibility / retirement: new record and manifest fields are optional/defaulted so installed schema-version-1 state remains readable; no ledger rewrite or migration.
- Rollback path: revert this bounded diff. Existing stable/candidate deployment ledgers and runtime bundles require no migration.

## Budgets And Workstreams

- Main harness budget: `timeout_ms=300000`, `max_output_chars=150000`, `max_context_chars=50000`, `max_tool_calls=24`, `max_retries=0`.
- Runtime retry budget: explicit small per-start launchctl attempt cap plus persisted recovery-attempt cap and existing deadline; no unbounded loop.
- Delegation / subagents: zero.
- Workstreams / exclusive owners: one implementation stream owns only the scoped files above.

## Verification And Evidence

- Focused: `node --import tsx --test tests/deployment_supervisor.test.ts tests/service.test.ts` passed 28/28 in independent review session `session_20260717045137_8eae2bd6`.
- Patch integrity: `git diff --check` proves whitespace integrity.
- Repository gate: this session ran `pnpm --dir /Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/43-deployment-activation-recovery run check`; it exited 0 on 2026-07-17. The command completed `build`, `test`, `skills:validate`, and `naming:validate`.
- Independent review: session `session_20260717045137_8eae2bd6` passed independent candidate review before this full repository gate.
- Implementation commit: `bda126412a97a5d4aa9d18c363769f06dfaeb59e`.
- Ready PR: [#45](https://github.com/suthree/Evi/pull/45) is OPEN, non-draft, MERGEABLE, with base `develop` and head `codex/issue-43-deployment-activation-recovery`.
- Deploy / restart / live smoke / probation / rollback evidence: not performed and not claimable. Resident controller handoff and live acceptance remain explicitly pending an independently reviewed deployment, service health/heartbeat/Web/Feishu probation, and an exercised rollback under main-harness authority.

## Completion And Independent Review

- Independent review session `session_20260717045137_8eae2bd6` passed focused tests 28/28; this session subsequently passed the full `pnpm run check` repository gate.
- The implementation commit `bda126412a97a5d4aa9d18c363769f06dfaeb59e` is published as ready PR [#45](https://github.com/suthree/Evi/pull/45), OPEN, non-draft, and MERGEABLE into `develop` from `codex/issue-43-deployment-activation-recovery`.
- Rollback acceptance: the source diff can be reverted without mutating runtime state or the canonical deployment ledger.
- Live acceptance: an independent reviewer must confirm controller-version identity, deploy through the authorized path, observe healthy candidate probation, and verify bounded known-good recovery; this task alone cannot satisfy those gates.
- Pending next action: conduct independent PR #45 review, then perform the ordinary merge only if accepted; deployment, resident controller handoff, live probation, and rollback verification remain pending afterward.
