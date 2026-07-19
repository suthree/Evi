# Task 268: Non-Progress Observation Loop

Status: active

## Identity And Ownership

- Issue: GitHub Issue #116, break repeated non-progress observation loops.
- Milestone: not assigned; this is a live GoalRuntime acceptance repair inside
  the current self-evolution closure, not a new roadmap capability.
- Target version: not applicable; the repair preserves Goal/event/receipt
  schemas and changes no product version boundary.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Decision Owner / authority basis: Issue #116 and the operator-authorized real
  self-evolution acceptance Goal.
- Capability layer: core.
- Base: `43dd4ec3d9c36db5011c77b6b34285902d97b601` on `develop`.
- Branch/worktree: `codex/issue-116-non-progress-observation-loop` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/issue-116-non-progress-observation-loop`.

## Problem, Outcome, And Boundaries

Real Feishu Goal `goal_20260718155814_357c4361` validly refreshed
`runtime.inspect` from resident `00ab868` to current `43dd4ec` at canonical
sequences 221-223. Its next Continue repeated the identical action, observed
the same evidence, and emitted the same unresolved blocker at sequences
224-226. The current post-boundary freshness gate therefore accepts a fresh but
non-progressing observation and permits a self-proving loop.

The outcome is a derived anti-loop invariant: the first refresh remains valid,
and a changed observation remains progress; when the same action immediately
repeats an equivalent observation and cognition proposes another blocker, the
harness rejects that blocker inside the current Continue budget so cognition
must dynamically replan or produce a supported terminal decision.

Non-goals:

- no Goal-, Task261-, commit-, blocker-text-, or keyword-specific route;
- no mandatory `repo.search`, ban on `runtime.inspect`, or static tool mapping;
- no new ledger, mutable progress score, persisted owner, queue, or schema;
- no Goal event/checkpoint rewrite and no new Goal;
- no broad cognition, verifier, capability, context, or CLI refactor.

- Dependencies/blockers/cross-repository links: no dependency or
  cross-repository change; live acceptance depends on exact integration and
  deployment before continuing the unchanged Feishu Goal.
- Architecture impact: GoalRuntime remains the sole owner of lifecycle and
  blocker acceptance. The invariant derives only from canonical action and
  observation history and adds no second state owner.
- External effects and sensitive-data gate: implementation/tests are local.
  GitHub and local deployment effects are covered by operator authorization;
  the live Feishu command remains the exact pre-authorized same-Goal Continue.

## Design, Reuse, Evidence, And Recovery

- Reuse the existing post-boundary observation obligation and canonical event
  projections introduced by the evidence-freshness tranche.
- Build a deterministic GoalRuntime regression with two blocked Continue
  tranches using one identical successful action/result. It must fail on the
  repeated blocker, not merely inspect prompt wording.
- Derive non-progress from existing events in bounded recent history. Do not
  persist a digest ledger or require a specific alternative capability.
- Preserve the valid cases where the repeated action returns changed evidence,
  the model chooses a different action, or a verifier-supported outcome exists.
- Rollback is a normal revert and exact-commit redeploy. No state migration or
  compatibility layer is required.

## Verification And Budgets

- Context budget: GoalRuntime blocker/freshness code, its adapter contract, the
  focused tests, Issue #116, Task268, and the exact live events 221-226 only.
- Time/retry budget: at most three focused red/green correction cycles and one
  full repository gate per accepted source head.
- Tool/delegation budget: one implementation owner; two read-only independent
  Spec/Standards reviewers after the source head is fixed; no competing edits.
- Phase-1 feedback loop: one focused `node --import tsx --test
  --test-name-pattern=non-progress tests/goal_runtime.test.ts` regression that
  deterministically reproduces the repeated blocker.
- Targeted checks: focused GoalRuntime test, related adapter/freshness tests,
  TypeScript build, and `git diff --check`.
- Repository gate: `pnpm run check`.
- Integration gate: exact reviewed PR head, exact merge deployment, controller
  handoff, healthy/current and connected Feishu checks, then unchanged-Goal
  terminal acceptance.

## Activation Evidence

- Canonical sequences 221-223: first current deployment observation at
  `43dd4ec`, followed by the unresolved blocker.
- Canonical sequences 224-226: identical `runtime.inspect`, equivalent current
  deployment evidence, and the repeated unresolved blocker.
- Issue #116 records the public acceptance and explicit dynamic-routing
  non-goals.

## Integration Checkpoint

- Red evidence: the focused non-progress test failed twice because the second
  Continue executed only the repeated `runtime.inspect`; the expected dynamic
  alternative action was never requested.
- Diagnosis: canonical history already retained the repeated action digest,
  both observations, and the prior blocker. The freshness gate checked only
  that a post-boundary observation existed, and the blocker branch returned
  immediately without comparing progress or returning rejection feedback to
  cognition.
- Implemented source checkpoint: derive equivalent action/observation loops
  from existing events, reject the repeated blocker inside the remaining
  tranche, carry exact usage until the next canonical event, and expose only
  ephemeral decision feedback. A changed observation remains a valid blocker;
  the same action digest cannot be redispatched while that feedback is active;
  budget exhaustion uses the existing blocked-event schema and does not create
  another observation obligation or mask the original model blocker.
- Green evidence: focused non-progress tests 4/4; full GoalRuntime and cognition
  adapter files passed; direct TypeScript build passed; `git diff --check`
  passed.
- Pending: independent review, full repository gate, PR/merge/deploy, and
  same-Goal live acceptance.
