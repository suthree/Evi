# Task 243: GoalRuntime Lifecycle And OutcomeReceipt

Status: active; delivery child of GitHub Issue #56 through Issue #62

## Identity And Ownership

- Issue: GitHub Issue #62, `refactor(goals): add persistent GoalRuntime lifecycle and OutcomeReceipt`.
- Parent architecture: GitHub Issue #56, `.trellis/decisions.md`, and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Owner repository: Evi.
- Implementation owner: the external Codex Goal that completed Task 242; the
  stopped legacy Evi goal remains stopped and is never resumed.
- Decision Owner / authority basis: the operator accepted the persistent
  control-plane direction and instructed Codex to execute it on 2026-07-17.
- Capability layer: core runtime.
- Base: `c9a1c2b678c41224f4444cf2e2ce97ab22cc0e0f` on `develop`.
- Branch/worktree: `codex/issue-62-goal-runtime-lifecycle` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/62-goal-runtime-lifecycle`.

## Architectural Outcome

Add one deep `GoalRuntime` module with this public boundary:

```ts
goalRuntime.handle(command): Promise<GoalView>
goalRuntime.read(goalId): Promise<GoalView>
```

The module owns identity, lifecycle, compact checkpoints, cumulative usage,
soft-budget continuation, pause/resume, outcome verification, and one canonical
`OutcomeReceipt`. Callers express intent; they do not choreograph event writes,
verification references, projections, or completion artifacts.

## State And Transition Contract

- `goals/events.jsonl` is the only canonical writable lifecycle and observation
  store for new GoalRuntime goals.
- `goals/checkpoints/<goal_id>.json` and `goals/receipts/<goal_id>.json` are
  bounded, rebuildable projections. `read()` derives authority from canonical
  events and fails closed on malformed or non-contiguous history.
- `Start` creates one goal identity. `Continue` updates its cursor, compact
  checkpoint, usage, and bounded observations.
- Reaching a soft budget keeps the goal active with the same identity and marks
  `continuation_required`; it never terminates, forks, or creates a successor.
- `Pause` blocks further continuation. `Resume` restores the same identity and
  checkpoint. `Abandon` is an explicit terminal decision.
- An outcome candidate is verified only through an injected verifier owned by
  GoalRuntime. Failed verification appends a failure event, keeps the goal
  active, emits a next action, and creates no receipt. A later candidate may
  complete the same goal.
- Successful verification creates one immutable receipt binding the goal,
  accepted change identity, checks, runtime result, residual risks, and
  canonical event identities. Terminal mutation and a second receipt fail
  closed.
- Every command has a caller-supplied command id. Replaying it returns the same
  view without duplicate events, state changes, or receipts.
- Candidate evidence ids must belong to the same goal. Foreign, missing,
  malformed, or out-of-order evidence fails closed.

## Acceptance

- Interface tests demonstrate start/continue, cumulative soft budget, pause,
  resume, verification failure followed by success on the same identity,
  abandon, command idempotency, and terminal-transition rejection.
- Receipt assertions cover change identity, verifier checks, runtime result,
  residual risks, and canonical event linkage without duplicating intermediate
  claim maps.
- A state-diff regression proves a new goal writes only the GoalRuntime event,
  checkpoint, and receipt surfaces and leaves legacy queue, working checkpoint,
  completion, iteration, SOP, skill, deployment, and adoption stores unchanged.
- Focused tests, `git diff --check`, and `pnpm run check` pass.
- Standards and Spec review confirm the deep-module boundary and Issue #62
  contract before PR integration to `develop`.
- The merged commit is deployed through the existing commit-bound controller;
  live runtime, Web, Feishu, heartbeat, and controller identity remain healthy.

## Design Discipline

- Use the existing `AgentStore` and local-first filesystem boundary. Add no
  database, broker, hosted service, dependency, or compatibility framework.
- Inject clock, id generation, and verifier behavior so interface tests remain
  deterministic without exposing internal choreography.
- Keep module-owned schemas next to the module unless another accepted owner
  genuinely consumes them. Avoid expanding the global core schema catalog.
- Raw events are evidence; checkpoint and receipt files are read models. A
  damaged projection must not become a second source of truth.
- Prefer one command event carrying bounded observations over a chain of
  separately cross-referenced planning, execution, scorecard, and completion
  documents.
- Do not wrap or modify the legacy runner in this slice. Whole-goal cutover is
  owned by the later ingress slice; historical legacy data remains readable.

## Scope And Non-Goals

Expected owner surfaces:

- a new GoalRuntime module and its exported runtime interface;
- minimal AgentStore layout support for GoalRuntime-owned state;
- focused interface and state-boundary tests;
- this task checkpoint and narrowly matching indexes if required.

Non-goals: no CLI, daemon, Web, Feishu, Telegram, Discord, deployment, adoption,
EffectPolicy, LearningRuntime, task-queue, old runner, SOP, skill, memory-working,
completion-report, or iteration integration; no legacy data rewrite; no
cross-process scheduler or lock service; no `main`, tag, release, remote
deployment, publication, or stopped-goal resumption.

## Budgets And Workstreams

- One Codex Goal retains ownership through implementation, PR, deployment, and
  live verification.
- Tool, token, and elapsed-time limits are soft checkpoints. Exhaustion records
  continuation on the same Goal instead of creating a replacement.
- Review may use independent read-only agents. Overlapping implementation edits
  are not delegated.
- Evidence is recorded at meaningful boundaries: canonical events during
  execution, test results at verification, and one completion receipt. No
  per-step reference matrix is required.

## Rollback And Completion

- Source rollback is a bounded PR revert. GoalRuntime state is additive and
  isolated, so rollback does not rewrite legacy stores.
- Projection repair rebuilds from canonical events; it never edits event
  history to match a projection.
- Completion requires implementation, interface/state tests, repository checks,
  dual review, PR merge, commit-bound deployment, live health, and a Task 243
  checkpoint. Planning artifacts alone are not completion evidence.

## 2026-07-17 Implementation Checkpoint

- `GoalRuntime` now exposes only `handle(command)` and `read(goalId)`. It owns
  canonical event append, lifecycle replay, soft-budget signals, pause/resume,
  injected verification, abandonment, and the single terminal receipt.
- Command ids are bound to canonical command digests. In-process mutations are
  serialized; exact replay returns the original command view without appending
  another event, while conflicting reuse fails closed.
- Canonical replay validates contiguous transitions, same-goal evidence,
  verifier decision consistency, receipt-to-goal/candidate/event binding, and
  duplicate event, command, or receipt ids. Projections are ignored for
  authority and can be rebuilt by idempotent command handling.
- Seven focused interface tests pass, including failed verification followed by
  success on the same goal, soft-budget continuation, pause/resume, concurrent
  calls, foreign evidence, semantic receipt corruption, and an exact state diff
  proving legacy stores unchanged.
- Repository-wide `pnpm run check` passes with 898 tests, skill validation, and
  neutral naming validation. `git diff --check` also passes.
- Standards/Spec review, PR integration, commit-bound deployment, and live
  runtime/channel health remain pending and are not claimed here.
