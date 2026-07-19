# Task 264: Goal Evidence Freshness Across Continue Tranches

Status: active; implementation, review, integration, deployment, and same-Goal
acceptance pending

## Identity And Ownership

- Issue: [#107 Goal observations need cross-Continue freshness semantics](https://github.com/suthree/Evi/issues/107).
- Milestone / target version: operator-authorized real self-evolution closure;
  no separate GitHub milestone is assigned.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Decision Owner / authority basis: the operator-authorized persistent Codex
  Goal, Issue #107, and the measured blocker from the same real Feishu Goal.
  Evi remains the outcome and acceptance owner.
- Capability layer: core/harness.
- Base: `e56272b496095ea58f72b3bf32584fec59584477` on `develop`.
- Branch/worktree: `codex/issue-107-goal-evidence-freshness` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/issue-107-goal-evidence-freshness`.

## Problem, Outcome, And Boundaries

Real Feishu Goal `goal_20260718155814_357c4361` repeated its prior deployment
blocker at sequence 205 after the resident runtime had changed from `90a7858`
to `e56272b`. The earlier `runtime.inspect` observation remained valid proof of
what was observed then, but Goal cognition had no explicit way to distinguish
evidence created in the active Continue tranche from evidence inherited from a
prior tranche. A drift-prone historical fact was therefore treated as current.

The desired outcome is a small temporal semantic at the existing cognition
seam. Every canonical evidence view used for cognition states whether its event
belongs to the active Continue command or a prior command. Cognition retains
historical evidence but reacquires bounded evidence before a blocker or outcome
depends on mutable current state. Capability choice remains dynamic.

Acceptance criteria:

1. Cognition evidence distinguishes `current_continue` from `prior_continue`
   relative to the active Continue command.
2. An observation inherited from an earlier blocked or soft-budget tranche is
   explicitly prior evidence in a new Continue.
3. An observation produced during the active Continue is explicitly current in
   subsequent model rounds of that same Continue.
4. The cognition contract states that prior evidence is canonical proof of the
   historical event, not sufficient current-state proof when the relied-on fact
   can drift outside the Goal.
5. The contract requires a fresh bounded observation before repeating a blocker
   or accepting an outcome that depends on mutable current state, while leaving
   the actual capability selection dynamic.
6. Focused regression tests protect both cross-Continue and same-Continue
   behavior; `git diff --check` and full `pnpm run check` pass.
7. Integrate through independent Spec and Standards review, PR, exact
   deployment/controller handoff, and continuation of the unchanged Feishu Goal
   to a terminal evidence-backed OutcomeReceipt.

Explicit non-goals:

- no hard-coded `runtime.inspect` refresh, task keyword routing, or automatic
  tool selection;
- no new deployment/Git browser tool, arbitrary Git query surface, ledger,
  cache, event kind, state owner, or proof matrix;
- no invalidation or deletion of historical canonical observations;
- no wall-clock TTL policy, repository-specific freshness rule, completion
  shortcut, unrelated Goal redesign, or documentation expansion.

## Design Discipline

- Reuse inspected: `GoalEvidenceView`, `buildCognitionEvidence`, Goal event
  `command_id`, `renderGoalInput`, the current ordered canonical evidence set,
  and the dynamic Capability Portfolio.
- The smallest coherent module change is to derive temporal scope when building
  cognition evidence and render that semantic through the existing cognition
  interface. No new public tool or state persistence seam is needed.
- Temporal scope is relative ordering metadata, not a truth score. Historical
  observations remain authoritative for the event that occurred; cognition
  decides whether the fact can drift and which available capability best
  refreshes it.
- Existing tools can compose the remaining live acceptance evidence: a fresh
  `runtime.inspect`, bounded state search/read, and local Git read in the bound
  Issue #101 worktree. This task does not widen those interfaces.
- No dependency, migration, or compatibility layer is required. The implemented
  GoalRuntime contract is mirrored once in `docs/RUNTIME_CONTRACT.md`; removal
  is a normal focused source/test/doc revert.

## Authority, Effects, Recovery, And Evidence

- Source changes are confined to this worktree. The implementation has no
  external write and reads no new private source.
- PR publication, merge, exact deployment, controller handoff, and Feishu
  control commands remain separately governed integration effects.
- Rollback is a normal PR revert followed by exact deployment of the prior
  stable commit. Canonical Goal events are not rewritten.
- One implementation owner; no parallel implementation workstreams. Independent
  Spec and Standards reviews run only after focused and full checks pass.
- Completion evidence must link Issue #107, this task, source commits, reviews,
  PR checks/merge, deployment/controller receipts, resident
  `healthy/current` plus connected inbound, the refreshed live observations,
  and the terminal receipt from the unchanged real Goal.

## Activation Evidence

- Root `develop` was clean and aligned with `origin/develop` at
  `e56272b496095ea58f72b3bf32584fec59584477` before this worktree was created.
- Source audit confirmed that existing `command.run` and `runtime.inspect`
  capabilities can compose the remaining deployment/Git evidence. The missing
  seam is evidence freshness across Continue commands, not another specialist
  tool.
- This activation record does not claim implementation, review, integration,
  deployment, or same-Goal acceptance.

## Pre-Review Implementation Evidence

- TDD reproduced the missing cross-Continue semantic: an observation inherited
  after a soft-budget checkpoint had no `continue_scope` and the focused test
  failed with `undefined` instead of `prior_continue`.
- `GoalRuntime` now derives `current_continue` or `prior_continue` from the
  canonical event `command_id` relative to the active Continue command. The
  value exists only in the cognition evidence view; no event, ledger,
  checkpoint, receipt, or verifier schema was changed.
- The cognition adapter renders that temporal scope and states that historical
  evidence remains proof of its event but cannot alone prove mutable current
  state. Before repeating a blocker or proposing a drift-sensitive outcome it
  must acquire one fresh bounded observation, with the capability still chosen
  dynamically from the current portfolio.
- Focused GoalRuntime and cognition-adapter suites passed, including a blocked
  Goal regression that observes `prior_continue` before refresh and both
  `prior_continue` plus `current_continue` after a fresh action in the same
  Continue.
- Full `pnpm run check` passed: TypeScript build, 999/999 tests, active skill
  validation, and neutral naming validation across 133 implementation files.
  `git diff --check` passed.
- These are implementation and pre-integration checks only. Independent
  reviews, PR merge, exact deployment/controller handoff, and same-Goal live
  acceptance remain pending.

## Review Cycle 1 Corrections

- Spec review reported 0 findings and independently passed 34/34 focused tests
  plus `git diff --check` at `f8b6ee1`.
- Standards review found that the first implementation exposed freshness only
  to cognition, so a non-compliant model could still repeat a historical
  blocker or let the verifier accept an outcome using only prior-Continue
  observations. It also found that the implemented Runtime Contract change was
  absent from the stable owner document.
- TDD added negative regressions for both stale decisions. After a prior
  `goal_blocked` or `goal_verification_failed`, GoalRuntime now requires a
  later canonical observation before it accepts a new model blocker or invokes
  outcome verification. A repeated stale blocker is replaced by
  `post_boundary_observation_required`; a stale outcome is recorded as failed
  `post_boundary_observation` verification. Capability choice remains dynamic
  and no specific tool or effect target is prescribed.
- Verifier evidence now carries the same typed Continue scope as cognition
  evidence. The correction changes no canonical event or receipt schema and
  writes no new state owner.
- `docs/RUNTIME_CONTRACT.md` now records the implemented temporal semantics,
  fail-closed gates, and the deliberate soft-budget exception needed to keep a
  one-model-round tranche completable.
- Corrected focused suites passed 47/47 with TypeScript build. Full
  `pnpm run check` passed with all 1,001 declared tests, active-skill
  validation, neutral naming across 133 implementation files, and
  `git diff --check`. Review cycle 2, PR integration, exact
  deployment/controller handoff, and same-Goal live acceptance remain pending.

## Review Cycle 2 Corrections

- Both independent reviews found the same lifecycle ordering defect: the first
  gate inspected only the latest event from another command, so pause/resume,
  a denied plan, or a soft-budget checkpoint could hide an earlier blocker and
  let a stale outcome complete. Standards review also identified duplicate
  Continue-scope projection code.
- Two red regressions reproduced the false completion across manual
  pause/resume and denied-action soft checkpoints. The harness now locates the
  most recent `goal_blocked` or `goal_verification_failed` boundary and keeps
  its observation obligation active across neutral events. Only a later
  canonical `goal_action_observed` clears it; an observation followed by a
  necessary soft-budget checkpoint remains usable in the next tranche.
- Cognition and verifier projections now share one `continueEvidenceView`
  helper. The event-order gate remains independent of capability selection and
  adds no state owner, event schema, router, TTL, or tool-specific rule.
- The two new regressions pass, and the corrected focused TypeScript build plus
  GoalRuntime/adapter suites pass 49/49 with `git diff --check`. Full
  `pnpm run check` passes with 1,003/1,003 tests, active-skill validation, and
  neutral naming across 133 implementation files. Review cycle 3, PR
  integration, exact deployment/controller handoff, and same-Goal live
  acceptance remain pending.

## Review Cycle 3 Correction

- Spec review reported 0 findings and independently verified that the
  post-boundary observation obligation survives neutral events, clears only on
  a canonical observation, and can progress across a soft checkpoint without
  changing capability ownership.
- Standards review found one remaining liveness defect: with
  `max_model_rounds=1`, the harness accepted an observation from the preceding
  tranche, but cognition saw only `prior_continue` plus an instruction to
  refresh in the active Continue. A contract-following model could therefore
  refresh forever instead of evaluating the result.
- A red behavioral regression introduced cognition that branches on the
  freshness contract rather than a scripted outcome sequence. It blocks,
  observes in a one-round tranche, crosses the necessary soft checkpoint, and
  can terminate only when GoalRuntime exposes the derived obligation as
  `satisfied`.
- Goal cognition now receives one bounded, read-only
  `observation_obligation: none | required | satisfied` view derived by the
  same canonical event-order function used by the harness gates. The adapter
  says not to reacquire solely because satisfying evidence became
  `prior_continue`; evidence sufficiency and any material drift remain dynamic
  cognition decisions. No persisted state, router, event/receipt schema, tool
  mandate, or competing owner was added.
- The new liveness regression and the cognition rendering/contract regression
  pass 2/2. The expanded TypeScript build and GoalRuntime/adapter suites pass
  50/50. Full `pnpm run check` passes with 1,004/1,004 tests, active-skill
  validation, neutral naming across 133 implementation files, and
  `git diff --check`. Review cycle 4, PR integration, exact
  deployment/controller handoff, and same-Goal live acceptance remain pending.

## Review Cycle 4 Result

- Independent Spec review reported 0 findings at `3b82675`. It verified the
  `none|required|satisfied` derivation, one-round block-observe-checkpoint-
  outcome path, Continue-scope/verifier agreement, dynamic Capability
  Portfolio selection, and absence of a new persisted owner or schema.
- Independent Standards re-review reported 0 remaining actionable findings at
  `3b82675`. It confirmed that cognition and both harness gates share the same
  canonical event-order projection, the prompt no longer creates a
  single-round refresh livelock, the behavioral regression protects the old
  failure, and the stable Runtime Contract is coherent.
- Reviewers independently passed their focused checks and `git diff --check`;
  the implementation worktree remained clean. PR integration, exact
  deployment/controller handoff, and terminal acceptance of the unchanged
  Feishu Goal remain pending and are not claimed here.
