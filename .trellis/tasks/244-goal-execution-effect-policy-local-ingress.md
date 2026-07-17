# Task 244: GoalRuntime Execution, EffectPolicy, And Local Ingress

Status: active

## Identity And Ownership

- Issue: GitHub Issue #65, `refactor(goals): route local execution through
  GoalRuntime and semantic EffectPolicy`.
- Parent architecture: GitHub Issue #56, `.trellis/decisions.md`, and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: the operator accepted the persistent
  GoalRuntime control-plane migration and instructed Codex to execute it on
  2026-07-17.
- Owner repository: Evi.
- Capability layer: core runtime.
- Base: `a32d08fbf73af18705ce155a160fea1938dc0fe7` on `develop`.
- Branch/worktree: `codex/issue-65-goal-execution-effect-policy` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/65-goal-execution-effect-policy`.
- The stopped legacy Evi goal remains stopped and is never resumed.

## Architectural Outcome

Deepen `GoalRuntime` into the owner of one complete local execution trajectory:

```text
local intent
  -> GoalRuntime model turn
  -> semantic EffectPolicy decision
  -> allowed tool observation
  -> GoalRuntime verification
  -> one OutcomeReceipt
```

The local CLI submits intent through `handle(command)` and inspects state
through `read(goalId)`. It owns no goal state, retry loop, evidence mapping,
effect decision, verification, or receipt.

## Execution And Effect Contract

- One model turn proposes at most one tool action, one completion outcome, or a
  blocked result. It cannot synchronously propose learning or adoption work.
- GoalRuntime records raw model action, EffectPolicy decision, and bounded tool
  observation in its canonical event stream. The outcome candidate is bound to
  relevant same-goal event identities by the runtime; the model does not copy
  reference matrices through intermediate artifacts.
- EffectPolicy derives a semantic intent from the actual operation and target.
  Model-provided side-effect labels are advisory input at most and never grant
  authority.
- Standing local-evolution authority permits bounded local reads, public reads,
  and reversible local repo/state effects that stay inside existing tool
  guards. Secret access, private egress, public/external writes, destructive or
  irreversible effects, and writes to GoalRuntime-owned state are never
  silently allowed.
- `allow` dispatches the action. `confirm` pauses the same goal with one exact
  pending-effect identity, digest, and visible proposed action. `deny` records
  the refusal without dispatch. This task adds no separate confirmation
  request/report chain.
- Soft budget exhaustion returns the same active goal with a compact execution
  checkpoint. A later Continue command retains identity and history.
- Production execution does not accept caller-authored observations or outcome
  candidates. Test doubles may inject cognition, tool, clock, id, and verifier
  behavior through private construction seams without becoming state owners.

## Cutover Unit

- Add one explicit local `goal` CLI surface for start, continue, read, pause,
  resume, and abandon.
- Every goal created by this surface is GoalRuntime-owned from its first event
  to its receipt. It never enters the legacy runtime task queue or
  `LiveAgentRunner`.
- Existing `live`, Web, IM, daemon, and recovered queue work remain legacy in
  this child and cannot address or dual-write a GoalRuntime goal.
- Intended tool effects may change authorized repo or local state. Such effects
  are evidence inside the Goal event stream, not parallel orchestration state.

## Acceptance

- Interface tests cover safe action-to-observation-to-receipt execution,
  semantic read/write/unknown effect decisions, confirmation pause, denial,
  soft-budget continuation, manual pause/resume, verification failure followed
  by later success, and exact command replay without duplicate tool dispatch.
- A state-diff regression proves the Goal control path does not write legacy
  queue, opportunity, episode, working-checkpoint, completion, iteration, SOP,
  skill, deployment, or learning-promotion stores.
- CLI parsing and execution tests prove that all local goal operations delegate
  to GoalRuntime and do not instantiate `LiveAgentRunner`.
- Focused tests, `git diff --check`, and `pnpm run check` pass.
- Standards and Spec review confirm the deep-module boundary and Issue #65
  contract before PR integration to `develop`.
- The merged commit is deployed through the existing commit-bound controller;
  installed-artifact local-goal smoke and resident runtime, Web, Feishu,
  heartbeat, and controller health pass.

## Non-Goals

No IM/Web/daemon or runtime-task-queue cutover, confirmed-effect execution from
an authenticated remote ingress, deployment-controller changes, LearningRuntime,
legacy deletion, cross-process lock service, raw-history migration, LuBan
change, unrelated application workflow, `main`, tag, release, publication,
destructive remote action, or stopped-goal resumption.

## Rollback And Completion

- Source rollback is a bounded PR revert. Goal state remains additive and
  isolated from legacy orchestration state.
- A confirmation-required or ambiguous effect stays paused; rollback never
  guesses that an unobserved effect is safe to repeat.
- Completion requires implementation, interface/state tests, repository checks,
  dual review, PR merge, commit-bound deployment, installed-artifact smoke, live
  health, and this task checkpoint. Planning or a CLI shell alone is not
  completion evidence.

## 2026-07-17 Implementation Checkpoint

- `GoalRuntime` now owns a bounded Continue tranche. Cognition returns one
  action, outcome, or blocked result; the runtime records a durable semantic
  action intent, dispatches only an allowed or exact-confirmed effect, records
  the bounded observation, binds same-goal evidence automatically, invokes the
  verifier, and emits one receipt.
- Effect intents are persisted before dispatch. An unmatched allowed or
  confirmed intent replays as `effect_outcome_unknown` and is never repeated.
  `confirm` pauses the same goal with one effect id/digest; local Resume executes
  only the stored action after exact identity matching. Denied action arguments
  are redacted before canonical persistence.
- `EffectPolicy` derives operation, target, reversibility, and data exposure.
  It ignores model side-effect labels for authority, and the production tool
  adapter replaces `command.run` labels with the policy-derived value before
  dispatch. Secret/private egress, private-network fetch, destructive effects,
  unknown effects, and writes into foreground orchestration/learning state fail
  closed.
- Public-read auto-allow is limited to query-free URLs. Goal execution resolves
  the hostname once, rejects any private/special-use result, and connects to a
  selected validated address with the original HTTP Host/TLS server name, so a
  later DNS answer cannot redirect the connection. Redirects fail closed.
- Repo-controlled verification commands are semantic verification effects but
  require exact confirmation because mutable tests/scripts can execute arbitrary
  code. The model never declares a change identity; GoalRuntime derives the
  receipt's complete ordered and deduplicated `changes[]` from typed successful
  observations across the complete Goal history, independently of the recent
  cognition window. Abandonment receipts retain partial observed changes, and
  a capacity-breaking mutating effect is blocked before dispatch, so the Goal
  remains completeable or abandonable instead of sliding away old observations.
  Diagnostic output truncation preserves typed control fields. Free-text
  substrings cannot support a receipt, and every Git commit requires a later
  successful verification observation that is pinned with its change lineage
  rather than aging out of the recent context window.
- Denied secret/private query actions persist only a query-free intent target;
  the exact query payload is visible only for non-sensitive actions that can
  legitimately reach confirmation.
- `goal start|continue|read|pause|resume|abandon` is a thin local CLI ingress.
  It constructs no `LiveAgentRunner`, task queue, episode, working checkpoint,
  completion graph, iteration, SOP, skill, deployment, or learning state.
  Resident Web/IM/daemon paths remain explicitly legacy.
- Twenty-four focused GoalRuntime, EffectPolicy, production-adapter, and CLI tests
  pass. They cover safe execution, automatic evidence binding, exact replay,
  non-contiguous replay refusal, soft continuation, manual pause/resume,
  verification repair, observed change-identity binding, confirmation, denial,
  crash-gap ambiguity, redaction, projection recovery, state isolation, command
  label normalization, and thin CLI translation.
- The first repository-wide run passed all 909 tests and skill validation. Its
  only failure was neutral naming in one production cognition string; that
  wording was corrected and the neutral naming check then passed across 127
  implementation files. A final full check follows this checkpoint.
- A source CLI smoke in an isolated temporary state root created and read one
  GoalRuntime goal, wrote only `goals/events.jsonl` and its checkpoint
  projection, and then moved the temporary root to the system trash.
- The authoritative live Evi state root contained no GoalRuntime canonical
  events before this schema deepening, so no real v1 GoalRuntime history needs
  migration in this child. Historical legacy stores remain untouched.
