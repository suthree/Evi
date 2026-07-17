# Task 242: Controller Observation Control Plane

Status: implementation verified locally; commit, PR integration, and live acceptance pending

## Identity And Ownership

- Issue: GitHub Issue #57, `refactor(deployment): require stable controller handoff and emit failure observations`.
- Parent architecture: GitHub Issue #56 and `.trellis/spec/goal-runtime-control-plane.md`.
- Milestone / target version: local v0.1 core runtime delivery control plane; no release claim.
- Owner repository: Evi.
- Implementation owner: external Codex Goal operating directly in this isolated worktree; the stopped Evi legacy goal is not resumed.
- Decision Owner / authority basis: the operator accepted the architecture direction and explicitly instructed Codex to start execution on 2026-07-17.
- Capability layer: basic-entrypoint.
- Base commit: `b366895862fe6fe03d37f626bff70734fe4b9510`.
- Branch: `codex/issue-57-controller-observation-control-plane`.
- Isolated worktree: `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/57-controller-observation-control-plane`.

## Problem And Evidence

- The canonical stable resident runtime is commit `1c22979d4d4feb0cb4f2bed86e062fd58ab759d3`, while the repository is `b366895862fe6fe03d37f626bff70734fe4b9510`.
- Failed deployment `deployment_20260717111157_b366895862fe` recorded installed controller source `9a2fa013ed41b6d9eda1b2298acd680b5f3e9e24`, candidate source `b366895862fe6fe03d37f626bff70734fe4b9510`, `service_lifecycle_handoff_required`, launchctl exhaustion, and successful known-good recovery.
- Issues #43, #46, #48, and #50 and PRs #45, #47, #49, and #52 already implemented activation recovery, controller handoff, throttle-window retry, and missing-job re-bootstrap. Another retry special case would duplicate the wrong seam.
- `packages/runtime/src/service_supervisor.ts` still creates a runtime repair task in `completeRecovery`, so a deployment controller can bypass goal ownership and operator pause.

## Outcome And Acceptance

- Compare installed controller identity with the canonical stable runtime controller identity before a candidate request becomes pending.
- A mismatch returns typed `controller_handoff_required` guidance and leaves candidate/current/previous slots unchanged.
- Preserve and reuse the verified controller-handoff transaction, rollback, post-restart identity check, and idempotent no-op.
- Candidate failure and recovery persist a typed observation with deployment,
  candidate, stable runtime, controller identities, failure details, and evidence refs.
- Recovery restores the known-good runtime and canonical stable ledger without
  enqueueing, resuming, or synthesizing any runtime repair task.
- Operator pause and the absence of an eligible Goal cannot be bypassed by
  deployment recovery.
- Existing state-schema-version-1 deployment history remains readable without
  rewrite.
- Interface-level tests cover stale-controller preflight, matched-controller
  activation, observation persistence, no queue mutation, idempotency, and
  rollback.
- Focused checks and `pnpm run check` pass; the final diff remains within the
  accepted owner surfaces.
- PR integration to `develop` is followed by verified controller handoff from
  the stable runtime, candidate deployment, live health/probation, and bounded
  rollback/recovery evidence.

## Scope And Non-Goals

Expected owner surfaces:

- deployment request and preflight;
- supervisor recovery and deployment records/observations;
- existing controller-handoff integration;
- focused deployment, service, and CLI tests;
- this Decision/spec/task and narrowly matching model/operator docs if public
  behavior changes.

Exact paths follow current source ownership and final diff review.

Non-goals: no GoalRuntime or EffectPolicy implementation, learning redesign,
new retry/backoff branch, new controller service, dependency addition, broad
queue rewrite, content workflow, LuBan change, remote deployment, `main`, tag,
release, publication, or resumption of the stopped legacy goal.

## Design Discipline

- Reuse: existing stable deployment ledger, installed controller metadata,
  `deployment controller-handoff`, launchd adapter, atomic deployment writes,
  known-good recovery, runtime task ledger reader, and focused injected tests.
- Deep-module seam: Deployment Controller returns preflight and transaction
  outcomes and emits observations; callers do not coordinate bootstrap,
  kickstart, recovery, queue mutation, or evidence choreography.
- Complexity: one semantic preflight plus removal of reverse goal creation is
  smaller and more coherent than another launchd retry branch.
- Data/source contract: current Git identity, canonical deployment record,
  installed controller manifest, heartbeat, launchd observations, source, and
  tests are authoritative. Tests use labelled temporary state and injected
  adapters and do not claim live evidence.
- Compatibility: new observation fields and records are additive; legacy
  deployment and task history remains read-only.
- Retirement: deployment repair task creation and its completion-gate special
  case must be removed when no other accepted owner remains. Do not leave dead
  queue semantics behind the new observation path.

## Budgets And Workstreams

- One primary Codex Goal owns architecture, implementation, integration, and
  final verification in this worktree.
- Subagents are optional only for independent read-only review or clearly
  non-overlapping tests; no parallel edits with overlapping deployment owners.
- Tool and context budgets are soft operational limits. Preserve the same Goal
  and checkpoint on exhaustion; do not create a successor task.
- Run focused tests during implementation and one repository-wide check before
  commit. Repeat only checks affected by corrections.
- Live polling is bounded by the existing deployment readiness/probation
  contract.

## Verification Plan

- Focused deployment/controller/service/CLI tests selected from the actual
  changed interfaces.
- `git diff --check`.
- `pnpm run check`.
- Final owner-surface diff audit and clean worktree check.
- PR review and merge to `develop` under existing authority.
- Before candidate deployment, run the existing verified controller handoff
  from canonical stable runtime `1c22979d4d4feb0cb4f2bed86e062fd58ab759d3`
  and verify installed controller identity.
- Request one commit-bound candidate deployment, verify stable health, fresh
  heartbeat, Web, Feishu, and controller assessment.
- Exercise bounded rollback/recovery without creating a repair task, then
  restore the accepted stable candidate if the drill changes residency.

## Rollback And Completion

- Source rollback is a bounded PR revert.
- Runtime rollback uses the current/previous transaction and preserves the
  last known-good bundle.
- A failed controller handoff restores controller and manifest backups and the
  prior supervisor state.
- A failed candidate or live check retains its observation and leaves no
  synthesized repair Goal.
- Completion requires Issue #57, Task 242, branch/worktree, commit/PR/checks,
  controller handoff, deployment, live health/probation, and rollback/recovery
  evidence. Planning artifacts alone do not prove implementation.

## 2026-07-17 Implementation Checkpoint

- Deployment request now uses one shared stable-controller identity reader and
  returns typed `controller_handoff_required` guidance before candidate build,
  pending-request creation, or slot mutation.
- Recovery writes an immutable failure/recovery observation plus a latest read
  model, restores the stable ledger, and records `goal_action: none` without
  creating a queue item.
- The deployment-specific runtime-task completion gate and continuation prompt
  were removed; historical deployment/task fields remain readable.
- Interface-focused build and 108 selected tests passed after the final identity
  refactor. Repository-wide `pnpm run check` passed with 889 tests, skill
  validation, and neutral naming validation. `git diff --check` also passed.
- Commit, push, PR review/integration, installed controller handoff, candidate
  deployment, live health/probation, and rollback/recovery drill remain pending
  and are not claimed by this checkpoint.
