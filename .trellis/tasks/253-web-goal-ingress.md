# Task 253: Web Goal Ingress

Status: verified; integration and live acceptance pending

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

- Governance activation commit `7d5d6e56c0ba5fa59766d1949a5868b806945e71`
  records Task252 completion and activates this bounded task before code
  mutation.
- Evi architecture Goal `goal_20260717232223_3b86c0a4` was explicitly
  abandoned with receipt `goal_receipt_20260717232409_378e0d78` after three
  navigation tranches and nine read-only calls did not reach implementation;
  it made no repository change.
- Replacement Goal `goal_20260717232424_b109a6bb` proposed one exact
  `codex.run`, confirmed only after Codex supervisor review. The bounded run
  timed out at 300 seconds but event
  `goal_event_20260717232946_199c1ac6` retained 11 attributable workspace
  paths. Codex supervisor inspected and repaired that diff rather than starting
  another implementation thread. Evi later proposed a second resume effect;
  it was not confirmed because this task permits one coding delegation. The
  Goal was explicitly abandoned with receipt
  `goal_receipt_20260717233511_bf305e2c`; it is not represented as accepted.
- The configured GoalRuntime factory and Start-plus-one-Continue protocol now
  live in runtime-owned `goal_ingress.ts`. CLI `goal` and `live`, standalone
  Web, and daemon-hosted Web reuse that seam.
- New Web submissions return canonical `GoalView` plus same-goal guidance and
  write no legacy queue, task-run, or channel-outbox rows. Web-only daemon mode
  does not construct `LiveAgentRunner` or start the legacy queue worker. IM
  mode retains both unchanged.
- Legacy `runtime_session_id` and `execution_contract` Web fields fail closed
  before Goal creation instead of losing context or authority silently.
- Focused Goal CLI, Web, daemon, and capability suite passed 24/24. TypeScript and
  `git diff --check` passed.
- Full repository `pnpm run check` passed: build, 956/956 tests, skill
  validation, and neutral naming across 130 implementation files.
- Initial independent Spec and Standards reviews found the same two current-fact
  gaps: fixed Web continuation guidance and stale Web queue documentation.
  Status-aware HTTP/UI coverage now includes active, manual pause, exact effect
  confirmation, outcome-unknown, completed, and abandoned views. A follow-up
  Standards review also caught that `execution_contract` is historical queue
  recovery compatibility rather than a current IM ingress; the stable English
  and Chinese contracts now state that current Web and IM paths cannot create
  it. Final independent Spec and Standards re-reviews both passed with no
  remaining actionable finding. PR integration, exact-commit deployment,
  controller handoff, service health, and real Web acceptance remain pending.
