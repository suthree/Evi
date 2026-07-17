# Task 253: Web Goal Ingress

Status: active

## Identity And Ownership

- Issue: GitHub Issue #84, `refactor(web): make GoalRuntime the canonical web
  task owner`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth.
  Codex supervises the whole-ingress boundary; Evi owns cognition, action
  proposals, and outcome acceptance inside each Goal.
- Owner repository / implementation owner: Evi / Evi-controlled Codex work in
  the current supervised Goal.
- Capability layer: basic-entrypoint over the core GoalRuntime control plane.
- Base: `51392ba0b0c013d0fb417021b98528a133719478` on `develop`.
- Branch/worktree: `codex/issue-84-web-goal-ingress` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/84-web-goal-ingress`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Architecture

Standalone `live` now uses one GoalRuntime identity. The shared Web console
still writes `runs/task_queue.jsonl`, mirrors task-run and channel-outbox rows,
executes `LiveAgentRunner`, and derives completion from legacy `RunResult`.
The accepted migration contract forbids binding a new Goal to those stores as
a compatibility projection: one task must have one orchestration owner.

The Web boundary will therefore reuse one shared Goal ingress port for both
the standalone `web` command and daemon-hosted Web channel. A new submission
issues one Start and exactly one Continue, returns the canonical `GoalView`,
and writes only GoalRuntime state. An active or interrupted result exposes its
same `goal_id` for explicit Continue; neither Web nor the daemon automatically
runs extra tranches. The resident queue worker and `LiveAgentRunner` remain
only for deferred legacy IM work during this transition.

## Scope And Acceptance

- Promote the configured GoalRuntime construction seam from CLI-only code to a
  runtime-owned reusable factory without widening the public Goal lifecycle
  interface.
- Replace the Web `runTask -> RunResult` contract with an injected Goal ingress
  port and canonical Goal view result.
- Route standalone and daemon-hosted Web through the same port; remove their
  LiveAgentRunner execution path without provider-specific changes.
- New Web requests write no runtime task queue, task-run, channel-outbox,
  working/completion, episode, iteration, SOP, skill, or deployment state.
- Preserve session and inbox read surfaces; historical legacy run/queue rows
  remain readable and are not rewritten.
- Expose enough canonical Goal identity in the Web response and UI for an
  operator to continue the same Goal explicitly. Do not add automatic Goal
  retry, a second scheduler, or a replacement goal.
- Existing IM and resident queue behavior remains unchanged and explicitly
  legacy.
- Focused interface and real HTTP tests, TypeScript build, `git diff --check`,
  full `pnpm run check`, independent Spec/Standards review, PR integration,
  exact-commit deployment, controller handoff, and real Web acceptance pass.

## Reuse, Complexity, Compatibility, And Rollback

- Reuse `GoalRuntime`, `ConfiguredGoalCognition`, `RuntimeGoalToolExecutor`,
  `CanonicalGoalVerifier`, and the Start-plus-one-Continue behavior already
  proven by Task252. Add no service, queue, database, evidence graph, receipt
  mapper, or dependency.
- The shared runtime factory and injected Web port are justified by the second
  real ingress. Channel transport, runtime session, and historical read models
  stay outside GoalRuntime.
- Tests use labeled temporary Git worktrees, state roots, and deterministic
  GoalRuntime doubles. Live acceptance uses the installed config, exact merged
  source, and local state root.
- Compatibility is by complete task identity: historical Web work stays
  legacy; every new Web task is Goal-owned only. IM remains legacy until its
  own whole-ingress child.
- Rollback is a normal revert PR and exact-commit redeploy. Canonical Goal
  events remain append-only and readable after rollback.

## Effects, Non-Goals, And Budgets

- No new effect authority. GoalRuntime and EffectPolicy retain repository,
  confirmation, secret, private-egress, destructive, and irreversible-effect
  boundaries.
- No IM migration, queue-backed Goal projection, automatic resident Goal
  continuation, LearningRuntime, broad LiveAgentRunner deletion, main merge,
  tag, release, public publication, secret export, destructive remote action,
  or historical rewrite.
- One Evi Goal controls at most one bounded Codex implementation delegation in
  this worktree. Codex reviews the exact proposed effect before confirmation.
  Retry only concrete implementation, verification, review, integration,
  deployment, or live-acceptance failures.

## Verification Evidence

- Pending implementation.
