# Task 242: Controller Observation Control Plane

Status: complete; Issue #57 closed; completion receipt linked through PR #61

## Identity And Ownership

- Issue: GitHub Issue #57, `refactor(deployment): require stable controller handoff and emit failure observations`.
- Parent architecture: GitHub Issue #56 and `.trellis/spec/goal-runtime-control-plane.md`.
- Milestone / target version: local v0.1 core runtime delivery control plane; no release claim.
- Owner repository: Evi.
- Implementation owner: external Codex Goal operating directly in this isolated worktree; the stopped Evi legacy goal is not resumed.
- Decision Owner / authority basis: the operator accepted the architecture direction and explicitly instructed Codex to start execution on 2026-07-17.
- Capability layer: basic-entrypoint.
- Initial implementation base: `b366895862fe6fe03d37f626bff70734fe4b9510`.
- Live fix-forward base: `60e3fbb53ef70dcdea1d70cded72b25bb3ec218f`.
- Implementation branch/worktree: `codex/issue-57-controller-observation-control-plane`
  at `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/57-controller-observation-control-plane`.
- Live fix-forward branch/worktree: `codex/issue-57-handoff-kickstart-recovery`
  at `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/57-handoff-kickstart-recovery`.
- Restart-semantics base: `ede171d1c780ff440bf7ba115643045dfbc67915`.
- Restart-semantics branch/worktree: `codex/issue-57-supervisor-restart-semantics`
  at `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/57-supervisor-restart-semantics`.
- Live-evidence branch/worktree: `codex/issue-57-live-acceptance-evidence`
  at `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/57-supervisor-restart-semantics`.

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

### Live Scope Override: Shared Launchd Lifecycle Recovery

- Decision Owner: the operator's accepted Task 242 live-acceptance mandate,
  implemented by the external Codex Goal under the repository Autonomy Decision
  Rule.
- Authority and evidence: the first post-PR #58 handoff failed closed after a
  successful supervisor bootstrap because launchd no longer reported the job at
  kickstart; manual re-bootstrap plus kickstart restored the supervisor while
  the stable runtime, Web, and Feishu remained resident and healthy.
- Superseded constraint: the initial `new retry/backoff branch` non-goal is
  overridden only for the existing shared `startLaunchdJob` adapter. No new
  controller-specific retry path or Goal/deployment owner is introduced.
- Exact budget: at most five kickstart attempts, at most four missing-job
  re-bootstrap attempts, per-command timeout of 30 seconds, inspection timeout
  of 10 seconds, and delays of 250, 500, 1000, and 2000 milliseconds. A final
  failure remains terminal and returns to the caller's existing rollback path.
- Risk: a persistent launchd fault can take longer to surface, and a broad retry
  could hide an incorrect plist or service identity. Re-bootstrap therefore
  runs only after inspection reports the exact job missing; no retry follows a
  successful kickstart.
- Verification: injected regression at the shared service seam, focused
  service/controller-handoff tests, full repository checks, then one real
  handoff retry plus idempotency and runtime/channel health checks.
- Rollback/retirement: revert fix-forward commit
  `4cc0b3ce46382bbda914edb948855b07cecf4157` if the live retry does not recover
  the observed missing-job race or causes service regression. Re-evaluate or
  retire the retry if Task 242 live acceptance still fails, if observations show
  a different failure class, or if the bounded attempts materially delay normal
  service recovery. The override expires with Task 242; later scope expansion
  requires a new accepted owner decision.
- Retirement triggered: the post-PR #59 live retry reproduced the same missing-job
  failure while its rollback fully restored controller, manifest, and supervisor.
  The generic kickstart/re-bootstrap loop is therefore retired rather than tuned
  again; it did not address the failure mechanism.

### Live Design Correction: Restart Is Not Start

- Decision Owner and authority remain Task 242's accepted live-acceptance
  mandate. This correction is inside the existing controller-handoff and shared
  service-lifecycle owner surfaces; it does not expand the Goal or deployment
  boundary.
- Root cause: `restartServiceSupervisor` delegated to `startSupervisor`, whose
  contract unloads an already loaded job before bootstrapping it. The handoff
  needs only to restart the copied supervisor process; unloading the unchanged
  plist created the observed asynchronous removal race.
- Correct contract: restart a loaded job with one `kickstart -k`; if the job is
  not loaded, fall back to the existing bounded start/bootstrap path. Ordinary
  service install/start/restart flows keep their existing explicit stop,
  service-file refresh, and start behavior.
- Risk: a direct kickstart does not reload a changed plist. This API is scoped to
  the controller handoff, which changes only the copied controller and manifest;
  plist-changing flows remain owned by service install/start/restart.
- Verification and rollback: the deterministic service-seam regression models
  successful bootstrap during pending removal and reproduced the exact
  `Could not find service` failure three times before the correction. Focused
  service/controller-handoff checks, full repository checks, dual review, real
  handoff, idempotency, and channel health remain required. Revert the correction
  if direct kickstart cannot produce a new verified supervisor PID or changes
  ordinary service lifecycle behavior.

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
- The PR Spec review found that activation-failure recovery could emit an
  observation without evidence refs. The three activation recovery paths now
  use one failure-capture helper, and the activation-failure regression runs
  through final observation persistence. After this correction, 24 focused
  deployment/controller/queue tests and a fresh repository-wide
  `pnpm run check` with 889 tests passed. Standards and Spec re-review both
  confirmed their findings resolved.
- Governance commit `3a7eecc8e289f4010cf3b08eeddb1b95a643d8d2` and
  implementation commit `bb906ec537d9b5d83e541fac82e9d5a8c06426e4`
  are pushed on `codex/issue-57-controller-observation-control-plane` and linked
  through draft PR #58 to `develop`.
- PR review/integration, installed controller handoff, candidate deployment,
  live health/probation, and rollback/recovery drill remain pending and are not
  claimed by this checkpoint.

## 2026-07-17 Live Handoff Checkpoint

- PR #58 merged to `develop` as
  `60e3fbb53ef70dcdea1d70cded72b25bb3ec218f`; Issue #57 remains open until live
  acceptance completes.
- The first live controller handoff correctly failed closed at supervisor
  restart. Controller and manifest backups were restored, but the supervisor
  job had disappeared after `bootout`; the resident runtime, Web, and Feishu
  remained running on stable commit `1c22979d4d4feb0cb4f2bed86e062fd58ab759d3`.
- A bounded manual `bootstrap` plus `kickstart` restored the backed-up supervisor
  at PID 12051 without changing runtime residency or resuming the legacy Goal.
- Live evidence shows the shared service lifecycle adapter needs bounded
  kickstart retry plus missing-job re-bootstrap after a successful bootstrap.
  This is being fixed forward in the same Issue #57 and Task 242 before the
  controller handoff is retried; candidate deployment remains pending.
- The fix-forward passes the focused service/controller-handoff suite (22/22),
  `git diff --check`, and the repository `pnpm run check` gate (890/890 tests,
  skill validation, and naming checks). These checks validate the bounded
  lifecycle behavior only; they do not yet claim live handoff acceptance.
- Fix-forward commit `4cc0b3ce46382bbda914edb948855b07cecf4157` was merged
  through PR #59 to `develop`; its post-merge live retry failed and triggered
  the restart-semantics correction below.

## 2026-07-17 Restart-Semantics Checkpoint

- PR #59 merged to `develop` as
  `ede171d1c780ff440bf7ba115643045dfbc67915` after Standards and Spec findings
  were resolved.
- The second live handoff reproduced `launchctl kickstart failed after bounded
  retry: Could not find service`. Its transaction restored the previous
  controller and manifest and verified the restored supervisor at PID 58525;
  resident runtime PID 7316, Web, and Feishu remained healthy on stable commit
  `1c22979d4d4feb0cb4f2bed86e062fd58ab759d3`.
- No controller exception appeared in supervisor stderr. The deterministic
  regression then reproduced the failure three times at the shared service seam
  and turned green when loaded restart stopped performing bootout/bootstrap.
- The correction removes PR #59's generic kickstart retry, separates loaded
  restart from unloaded start, preserves the existing start fallback, and adds
  both loaded and unloaded supervisor regressions. Build plus the focused
  service/controller-handoff suite passes 23/23. Repository `pnpm run check`
  passes 891/891 tests plus skill and naming validation, and `git diff --check`
  passes. Dual review, integration, and live acceptance remain pending.
- Correction commit `7409e3bc443db0ea40391bf8e3b7e21b16acb69b`
  records the root cause in its message; checkpoint commit
  `78a58f5cde86ae437d5c53c2d8e7b7199f93adea` records the pre-PR diagnosis.
  Both are linked through draft PR #60; review and integration remain pending.
- A minimal live probe then directly kickstarted the still-backed-up installed
  supervisor without unloading it. The job changed from PID 58525 to PID 75144
  on the first attempt; runtime PID 7316, Web, and Feishu remained healthy, with
  `deployment_stale` as the only expected health attention. This confirms the
  loaded-restart mechanism but does not yet claim controller handoff acceptance.

## 2026-07-17 Final Live Acceptance

- PR #60 merged to `develop` as
  `99b6c8a4e597043deb37caea8d2907536ee30f1c`. The final correction passed
  Standards and Spec re-review with no residual code or contract findings.
- Canonical stable controller handoff installed digest
  `dd23fb8c70596106a62e355896bf005fb3e0a88794172fade6486a643590c83b`
  from stable commit `1c22979d4d4feb0cb4f2bed86e062fd58ab759d3`, changed the
  supervisor from PID 75144 to PID 84707, and verified process identity. An
  immediate repeat returned `already_matched` and preserved PID 84707.
- Deployment `deployment_20260717130725_99b6c8a4e597` activated clean commit
  `99b6c8a4e597043deb37caea8d2907536ee30f1c`, reached Web and Feishu
  readiness, completed probation, and became stable at
  `2026-07-17T13:09:16.242Z` with healthy service state.
- The installed controller was then handed forward to the accepted stable
  commit with digest
  `9b92f46eafb7eb1d961d6b202fdf7992d89efb27b12f77346ba1d15a6e44a40c`,
  changing the supervisor from PID 84707 to PID 88774 before the rollback drill.
- Tree-identical drill commit
  `4069077b6bee346e5be15ce2d508a40e8662cd3e`, preserved on
  `origin/codex/issue-57-observation-only-rollback-drill`, passed the existing
  runtime tree verification and entered healthy probation as deployment
  `deployment_20260717131027_4069077b6bee`.
- An explicit evidence-bound Task 242 failure signal caused the controller to
  restore stable deployment `deployment_20260717130725_99b6c8a4e597` and emit
  immutable observation
  `deployment_observation_deployment_20260717131027_4069077b6bee` with kind
  `deployment_failed_recovered`, recovery status `known_good_restored`, and
  `goal_action: none`.
- `.runtime/state/runs/task_queue.jsonl` remained byte-identical before and after
  recovery: SHA-256
  `f21a0593f36094711a249b0b160542fb597a7fb28bb841558a3f1d7ccda94f12`
  and 843 lines. The controller created, resumed, and enqueued no Goal or task.
- Final health after recovery was healthy on runtime PID 91998 and stable commit
  `99b6c8a4e597043deb37caea8d2907536ee30f1c`, with fresh heartbeat, Web
  running, Feishu inbound connected, and no autonomy pause. The stopped legacy
  self-evolution Goal was never resumed.
- GitHub Issue #57 was closed with this compact live receipt. Task 242 acceptance
  is complete; the parent Goal and Issue #56 remain active for the next
  GoalRuntime control-plane slice.
- Completion-evidence commit
  `1ed8de68cc4c0c7434f1a500a232bbef4b3d2f2a` and this status update are
  linked through evidence-only PR #61 to `develop`.
