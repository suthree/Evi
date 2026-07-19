# Task 268: Non-Progress Observation Loop

Status: completed

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
  cognition. Review then exposed two boundary gaps: one-model-round tranches
  separate observations from blockers across commands, and summary-only
  identity can hide changed bounded output such as `file.read` text.
- Implemented source checkpoint: derive equivalent action/observation loops
  from existing events, reject the repeated blocker inside the remaining
  tranche, carry exact usage until the next canonical event, and expose only
  ephemeral decision feedback. A changed observation remains a valid blocker;
  the same action digest cannot be redispatched while that feedback is active;
  budget exhaustion uses the existing blocked-event schema and does not create
  another observation obligation or mask the original model blocker. Event
  pairing now follows canonical order across Continue commands, and normalized
  bounded output preserves semantic changes while ignoring recognized
  observation timestamps. Freshness and non-progress harness rejection cursors
  stay transparent to the model-blocker lookup without weakening the freshness
  observation obligation.
- Green evidence after the last Spec review fix: focused anti-loop and
  changed-output tests 7/7; full GoalRuntime and cognition adapter files passed;
  direct TypeScript build passed; `git diff --check` passed.
- Accepted source head: `9d75e4f`. Final independent Spec and Standards
  reviews both reported 0 remaining actionable findings.
- Full repository gate on the accepted source head passed by its exact
  components: build; tests 1018/1018; skill validation; neutral naming across
  134 implementation files. The components were run separately because the
  full test harness removes the worktree's temporary root-dependency symlink;
  no dependency or lockfile changed.
- Pending: PR/merge/deploy and same-Goal live acceptance.

## Final Integration And Acceptance

- PR #117 was accepted at exact head `f5e02ac45c4eb564c821aca08e08fb4a0fdfb0c2`
  and merged as `5a2bbb2c64d57d38f5684ffa8496113195edc7b0`.
  Canonical deployment
  `deployment_20260719145935_5a2bbb2c64d5` reached `stable` with zero
  failures and exact rollback source
  `43dd4ec3d9c36db5011c77b6b34285902d97b601`. The outer harness completed the
  supervisor controller handoff from PID 31393 to PID 45744; an immediate
  second handoff returned `already_matched`. Runtime health was
  `healthy/current` at `5a2bbb2`, and Feishu inbound remained connected.
- Live same-Goal sequences 227-235 exercise the repair rather than merely
  restating its tests. Evi first chose a different bounded deployment read at
  sequence 227; the harness then rejected a direct post-boundary blocker at
  sequence 230, preserved that decision across the tranche boundary, and let
  cognition dynamically select two bounded Task261 reads at sequences 231 and
  233. It did not force `repo.search`, ban `runtime.inspect`, or use a static
  task-to-tool route.
- The unchanged Goal reached `goal_completed` at sequence 235 with accepted
  terminal receipt `goal_receipt_20260719150711_125a50d2`. The receipt correctly
  distinguishes PR #102 head `6c90aa2` from exact merge commit `7067c1bd`,
  verifies historical deployment/rollback/live-ingress evidence, and reports
  to Feishu that no continuation command is required.
