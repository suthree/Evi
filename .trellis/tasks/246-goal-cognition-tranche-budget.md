# Task 246: Goal Cognition Tranche Budget

Status: active

## Identity And Ownership

- Issue: GitHub Issue #70, `fix(goals): expose per-Continue tranche budget to
  cognition`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth under
  the accepted persistent GoalRuntime direction; Codex intervenes because the
  defect is in Evi's control-plane input and repeated Evi execution cannot
  repair its own ambiguous budget view.
- Owner repository and implementation owner: Evi repository; current Codex
  supervisor implements and verifies this bounded repair.
- Capability layer: core runtime.
- Base: `aac717ca4018f5b395f63ba6ff36f6d929507d17` on `develop`.
- Branch/worktree: `codex/issue-70-goal-cognition-tranche-budget` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/70-goal-cognition-tranche-budget`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Evidence

Installed canonical Goal `goal_20260717190203_ec82a197` crossed a soft budget
checkpoint and retained one identity. GoalRuntime correctly opened later
Continue tranches internally, but `renderGoalInput` exposed cumulative `usage`
beside the numeric per-command `budget` and omitted the already-public
`budget_scope` plus current-tranche usage and remaining allowance. Evi then
returned repeated blocked decisions claiming that model and tool budgets were
exhausted. Another Continue reproduced the same defect without a tool action.

## Outcome And Acceptance

- `GoalCognitionInput` carries an explicit current execution-tranche view with
  `scope`, `limit`, `used`, and non-negative `remaining`, while the Goal view
  continues to retain cumulative lifetime usage.
- Each cognition call receives the active command's actual usage. Model and
  tool observations advance that value within one Continue; a new Continue
  begins at zero without resetting cumulative history or goal identity.
- The rendered input calls cumulative usage `lifetime_usage` and states that it
  does not exhaust a later Continue. It renders the authoritative current
  tranche separately and does not introduce a second persisted budget store.
- Deterministic runtime and adapter tests cover first/later tranches, within-
  tranche advancement, non-negative remaining values, and prompt wording.
- Targeted checks, `pnpm run check`, diff audit, independent review, PR merge to
  `develop`, commit-bound deployment, health, and controller identity pass.
- After deployment, the existing blocked Goal
  `goal_20260717190203_ec82a197` continues under the same identity and reaches
  a supported outcome or a materially different evidence-backed blocker.

## Scope And Stable Owners

- `packages/runtime/src/goal_runtime.ts` owns tranche accounting supplied to
  cognition.
- `packages/runtime/src/goal_execution_adapters.ts` owns the bounded model
  rendering contract.
- Focused tests and paired runtime docs change only where required by the
  observable contract.
- Task 245 completion is recorded in the same transition commit so no separate
  evidence-only pull request is created.

## Reuse, Complexity, And Data Contract

- Reuse the existing `usageForCommand`, `GoalView.budget_scope`, `GoalUsage`,
  and soft-budget loop. Do not add a scheduler, store, event type, counter, or
  successor-goal mechanism.
- The authoritative inputs are canonical same-goal events and the active
  Continue command id. Current-tranche usage is a derived, ephemeral cognition
  input; cumulative usage remains derived from all canonical events.
- Tests use deterministic cognition/tool fixtures. Only the post-deployment
  continuation of the named installed Goal is live model evidence.

## Authority, Effects, And Non-Goals

- This repair changes model input only and performs no external or sensitive
  effect. It does not alter standing action authority or secret handling.
- No lifetime hard cap, budget mutation command, provider change, `codex.run`
  engineering authorization, IM/Web/daemon cutover, adoption, LearningRuntime,
  legacy deletion, main merge, tag, release, publication, or destructive remote
  action.

## Budgets, Verification, And Rollback

- Execution budget: one bounded implementation path, no subagents, no retry
  loop beyond fixing observed test/review findings.
- Targeted verification: GoalRuntime and goal-execution-adapter tests prove the
  derived tranche contract and prompt semantics; typecheck and full repository
  check protect integration.
- Live verification: deploy the exact merged commit, prove healthy resident and
  controller identity, then Continue the existing Goal once per fresh tranche
  until it completes or reports a new evidence-backed blocker.
- Rollback: revert the bounded source/test/doc change through a normal PR and
  redeploy the previous stable commit. Canonical Goal events remain valid
  because no persisted schema or event type changes.

## Implementation Checkpoint

- The deterministic red loop was
  `node --import tsx --test tests/goal_runtime.test.ts tests/goal_execution_adapters.test.ts`.
  Before the repair it failed three assertions: both runtime cognition calls
  lacked `execution_budget`, and the rendered prompt lacked the tranche scope.
- The confirmed cause was the boundary between `continueGoal` and cognition:
  GoalRuntime computed `operationUsage` correctly for each command but passed
  only the cumulative `GoalView.usage`; `renderGoalInput` then placed that
  cumulative value beside the numeric per-command limit without naming either
  scope.
- `GoalCognitionInput.execution_budget` now derives `scope`, `limit`, `used`,
  and clamped `remaining` from the active command. The model rendering names
  Goal-wide usage `lifetime_usage`, renders the current tranche separately,
  and states the comparison rule once. No event, projection, or store changed.
- The red loop is green at 24/24. TypeScript build and `git diff --check` pass;
  `pnpm run check` passes at 929/929 with skill and neutral-naming validation.
- Independent Spec and Standards reviews both returned PASS with no actionable
  finding. They independently confirmed current-command derivation, within-
  tranche advancement, later-command reset, non-negative remaining values,
  paired docs, and the absence of a second counter or persistence surface.
- Remaining completion gates are PR integration, commit-bound deployment,
  resident health/controller identity, and same-identity continuation of live
  Goal `goal_20260717190203_ec82a197`.
