# GoalRuntime Control Plane

Status: accepted architecture contract under GitHub parent Issue #56. This
specification defines cross-task owner surfaces and migration invariants. It is
not evidence that GoalRuntime or any child slice has been implemented.

## Purpose

Replace a fragmented self-evolution path with one persistent goal trajectory:

```text
intent
  -> GoalRuntime execution and checkpoints
  -> outcome verification
  -> one OutcomeReceipt
  -> adoption
  -> asynchronous learning signal
```

The design uses optimistic execution inside a bounded change envelope and
conservative verification at effect, adoption, and learning-promotion seams.
It does not require every intermediate artifact to restate the same evidence.

## Owner Surfaces

### GoalRuntime

GoalRuntime is the only state owner for:

- goal identity and lifecycle;
- current execution cursor and compact checkpoint;
- pause, resume, abandon, stuck, and completion transitions;
- model and tool observations associated with the goal;
- soft-budget continuation and no-progress detection;
- outcome verification and the canonical OutcomeReceipt;
- interpretation of deployment and other execution observations.

For executable local Goals, repository placement is part of the goal identity,
not caller ambience. A new start records the real Git worktree, common
directory, branch, and start HEAD. Continue and exact-effect dispatch validate
that authority before execution. Historical starts without it remain readable
but cannot be silently rebound for mutation.
Nested `codex.run` is narrower than shared-common-root isolation: its resolved
new target or persisted resume authority must equal the Goal worktree, common
directory, branch, and start-HEAD base before a pending effect exists, and the
tool rechecks immediately before spawn. Canonical receipt capacity is 402
identities: one 201-identity delegated envelope plus one 201-identity
verification recovery envelope. This lets the largest accepted delegated
change set still enter fail-closed post-change verification without dropping
recovery attribution.

Its external interface is intentionally small:

```ts
goalRuntime.handle(command): Promise<GoalView>
goalRuntime.read(goalId): Promise<GoalView>
```

Start, Continue, Pause, and Abandon are intent commands. Tool dispatch,
evidence storage, verification, retry strategy, and projections remain internal
implementation. CLI, IM, Web, and daemon entrypoints are ingress adapters and
do not own parallel goal state.

### EffectPolicy

EffectPolicy decides the actual impact of a proposed action:

```ts
effectPolicy.decide(action, envelope): "allow" | "confirm" | "deny"
```

It classifies semantic action and target effects, not executable names. It
does not own goal completion, retries, budgets, evidence, or learning. Read-only
and mutating invocations of the same executable may produce different results.

### LearningRuntime

LearningRuntime accepts completed receipts or bounded experience signals and
runs outside the foreground goal:

```ts
learningRuntime.ingest(receipt): Promise<void>
learningRuntime.tick(): Promise<LearningView>
```

It clusters, deduplicates, patches, evaluates, activates, revises, and archives
learning artifacts. It cannot block a goal, change goal acceptance, or turn an
unfinished attempt directly into an SOP or skill.

## Evidence And Receipt Contract

Raw action and observation events are the canonical evidence. GoalRuntime
creates at most one current OutcomeReceipt for a terminal or adoption decision.
The receipt binds the goal, change identity, checks, runtime result, decision,
and residual risks to event identities.

Project-design, iteration, operator, scorecard, and learning views may derive
from the receipt. They must not require callers to duplicate claim mappings,
verification references, plan-reference coverage, or outcome-reference
coverage into independent writable truth stores.

Delegated workspace attribution comes only from harness-observed pre/post Git
status. Model-authored changed-file lists are diagnostics, not change authority.
Observed repository-relative paths are plural typed changes, remain visible
when a delegated worker fails after mutation, and require a later successful
local verification observation before acceptance.

## Deployment Adapter Contract

Deployment is an execution adapter, not a goal owner.

- The installed independent controller must match the canonical stable runtime
  controller before a new candidate is staged. A mismatch returns a typed
  `controller_handoff_required` result without mutating candidate slots.
- Candidate activation, probation, rollback, and stable-ledger recovery remain
  transactionally owned by the Deployment Controller.
- Failure and recovery produce typed observations containing deployment,
  source, stable runtime, controller identities, failure details, and evidence
  references.
- Deployment recovery never enqueues or resumes a runtime repair task.
- GoalRuntime may later consume the observation and decide continue, repair,
  pause, stuck, or abandon. Until GoalRuntime exists, the observation remains
  operator-visible and no automatic goal action occurs.
- Operator pause is authoritative and cannot be bypassed by controllers,
  schedulers, or background learning.

## Migration Contract

Cutover happens by complete goal identity:

- stopped and historical legacy goals remain readable through a legacy view;
- historical queue, episode, completion, iteration, deployment, and SOP data is
  not rewritten merely to fit the new schema;
- a new GoalRuntime goal writes only its canonical events, checkpoint, and
  receipt;
- no goal may dual-write old and new orchestration stores;
- controllers may temporarily support both legacy observation readers and the
  new GoalRuntime consumer, but an individual goal has exactly one owner;
- compatibility adapters are retired after all new ingress uses GoalRuntime and
  legacy active work is drained or explicitly stopped.

## Delivery Sequence

1. Issue #57: require stable controller handoff before candidate staging and
   make deployment recovery observation-only.
2. Add the minimal GoalRuntime vertical slice: identity, execution cursor,
   soft-budget checkpoint, pause/resume, verification, and receipt.
3. Route local, IM, CLI, and adoption transitions through GoalRuntime and
   EffectPolicy.
4. Move learning to receipt-driven asynchronous curation.
5. Delete the superseded orchestration and implementation-shaped tests.

Only the current child is an active delivery contract. Later children are
created after inspecting measured evidence and may be reordered, narrowed, or
retired without rewriting this owner model.

## Verification Strategy

The interface is the test surface. New tests assert observable GoalRuntime,
EffectPolicy, LearningRuntime, and Deployment Controller results through their
interfaces. Internal seams may use temporary filesystems, deterministic model
and tool adapters, and injected launchd adapters.

Once an interface test replaces equivalent protection, delete tests that only
assert choreography across the superseded queue, completion-reference, or
synchronous-learning implementation. Do not maintain both semantics
indefinitely.

## Program Acceptance

- one engineering goal retains one identity through execution, PR, deployment,
  rollback, and repair;
- budget exhaustion and verification failure continue the same goal;
- pause is a first-class state respected by every adapter;
- deployment failure emits evidence and never manufactures a repair goal;
- one OutcomeReceipt supports completion, inspection, and learning attribution;
- ordinary foreground goals produce no synchronous SOP draft;
- action-effect decisions distinguish read-only and mutating behavior;
- new goals never write legacy orchestration stores;
- superseded code and tests are removed after live cutover;
- targeted and repository checks, PR integration to `develop`, deployment,
  live health, rollback, and recovery evidence pass for applicable children.

## Non-Goals

No hosted or multi-user control plane, public marketplace, raw-memory migration,
LuBan change, unrelated application workflow, broad compatibility framework,
`main` merge, release, tag, public publication, or weakening of secret and
irreversible-effect protections.
