# Task 235: Operator authority task execution contract

- Status: active
- Linked Issue: #34 — https://github.com/suthree/Evi/issues/34
- Milestone / target version: local v0.1 self-evolution foundation; no milestone
- Owner repository: suthree/Evi
- Implementation owner: supervisor Codex under the bounded bootstrap override below
- Decision Owner: operator, through the current instruction and pasted self-evolution experiment contract
- Capability layer: core harness
- Base commit: 4d9db925cd57c896ea9639f8dc9179bb4d898724
- Branch: codex/issue-34-task-authority-contract
- Worktree: /Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/34-task-authority-contract

## Observed problem and evidence

The localhost Web/API entry accepts a task string and optional runtime session
id, but it does not accept or persist a structured execution authority or task
budget. `LiveAgentRunner` therefore constructs every explicit task opportunity
with the schema defaults `max_turns=1`, `max_tool_calls=3`, and
`side_effect_level=local_write` even when the operator explicitly authorizes a
bounded GitHub Issue/PR/merge workflow.

The newly deployed runtime at
`4d9db925cd57c896ea9639f8dc9179bb4d898724` accepted real Web task
`runtime_task_20260717025223_5898ff83`. All three attempts stopped before task
setup or typed `codex.run`; the final queue state is `blocked`. The attempt
contexts record the default budget and the responses state that GitHub Issue
creation was unavailable. Root `develop` remained clean and no replacement
Issue/worktree was created by Evi.

## Desired outcome and acceptance

1. A localhost Web/API run may carry one explicit structured task execution
   contract containing Decision Owner, authority basis, allowed and forbidden
   effects, expiry, model-round/tool-call budgets, and a side-effect ceiling.
2. The accepted contract is normalized, immutable in the append-only queue
   record, and preserved across direct execution plus daemon recovery/resume.
3. `LiveAgentRunner` uses the accepted budgets for its opportunity/context and
   enforces model-round and tool-call limits.
4. The harness rejects a tool action before execution when its declared effect
   exceeds the accepted ceiling; rejected attempts remain evidence and block a
   false done claim.
5. Context exposes the structured authority snapshot as data, not as inferred
   prompt prose. Default requests retain current local-write/default-budget
   behavior.
6. Focused runtime queue, worker, Web, context/runner, and tool tests plus the
   full repository gate pass.
7. PR integration and transactional deployment are followed by a new real-entry
   run of the previously blocked Evi-owned smaller iteration.

## Scope and non-goals

Scope is the core queue entry contract, Web request validation, runner option
propagation, context rendering, budget/effect enforcement, tests, and paired
runtime documentation where the operator contract changes.

Non-goals: no `main` merge, tag, release, LuBan change, public publication,
hosted identity/auth system, multi-user control plane, broad tool redesign,
global Codex configuration change, danger-full-access, bypass of typed
`codex.run` authority/worktree validation, or implementation of the later
rollback-ledger defect itself.

## Architecture and reuse assessment

- Reuse the append-only `RuntimeTaskQueueEntry`, `budgetHintSchema`,
  `sideEffectLevelSchema`, `LiveRunOptions`, `TurnSnapshot.task_context`, and
  existing tool result/evidence flow.
- Keep authorization bound to one task entry. Do not create a global role,
  policy service, database, or long-lived permission grant.
- The Web console is localhost-only; explicit external authority must still be
  supplied structurally and is never inferred from free-form task text.
- The typed Codex adapter retains its own narrower immutable authority snapshot.
  Outer task authority permits Evi to call the adapter and GitHub commands; it
  does not weaken adapter validation or confer completion authority.
- Tests use synthetic temporary stores and action envelopes. Live GitHub and
  deployment evidence remains separate from deterministic test evidence.

## Compatibility, recovery, and retirement

- Queue schema is additive. Old rows normalize to the existing default contract.
- Existing Web clients that submit only `task` continue to work unchanged.
- Invalid or over-broad request fields fail before a task is queued.
- A rejected over-ceiling tool action is evidence only and performs no effect.
- Code rollback is a single-PR revert; runtime rollback uses the existing
  current/previous deployment transaction.
- Re-evaluate or retire this bootstrap-specific request surface when a durable
  authenticated operator/session authority owner replaces localhost explicit
  confirmation. Until then, contracts expire with the task and are not reusable
  grants.

## Authority and budgets

- External effects authorized for this task: Issue #34, feature branch,
  worktree, commit, push, ready PR, verified merge to `develop`, and local
  transactional deploy/restart/rollback.
- Prohibited: `main`, tags, releases, public communication, secret/private-data
  egress, force push, direct push to protected branches, branch deletion, LuBan,
  or unrelated repository mutation.
- Context budget: compact routers, selected queue/Web/runner/context/tool source,
  focused tests, and cited runtime episode evidence only.
- Execution budget: one branch/worktree, no subagents, at most five model rounds
  per task execution contract, at most sixteen outer harness tool calls, three
  queue attempts, and one full repository gate after focused verification.
- Bounded command output and timeouts use current repository defaults; live
  deployment retains the existing readiness and probation windows.

## Recorded minimal bootstrap override

- Decision Owner: operator.
- Authority basis: the pasted experiment permits supervisor implementation only
  when Evi cannot progress through its foundational Codex path. The deployed
  Evi exhausted all three real-entry attempts of
  `runtime_task_20260717025223_5898ff83` with `completion_status=not_done` and
  final queue `status=blocked` before Issue/worktree creation or `codex.run`.
- Superseded constraint: supervisor Codex may implement only this authority and
  budget propagation slice in the recorded worktree. It may perform the normal
  Issue/PR/develop/deploy closure for the bootstrap.
- Scope: files named by the final Issue #34 diff. This bootstrap does not count
  as the required Evi-owned self-iteration.
- Evidence/risk: widening from local-write to external-write without an
  enforceable per-task snapshot could allow accidental effects. The design must
  therefore require explicit structured input, enforce a ceiling before tool
  execution, preserve allowed/forbidden effects in context, and expire with the
  task.
- Verification: focused tests, full `pnpm run check`, PR review, transactional
  deployment, live authority snapshot inspection, and a repeated true-entry
  Evi-owned iteration.
- Rollback/retirement: revert the PR and activate the previous runtime bundle.
  The override expires when the new runtime either completes the Evi-owned
  second iteration or produces a new evidence-backed blocker at its operator
  checkpoint.

## Verification and completion evidence

Planned focused checks:

- `pnpm exec tsx --test tests/runtime_task_queue.test.ts tests/runtime_task_queue_worker.test.ts tests/web_console.test.ts`
- selected `tests/context_harness.test.ts` / runner tests for context and
  pre-execution budget/ceiling enforcement;
- `git diff --check`;
- `pnpm run check`.

Completion also requires Issue/branch/worktree/commit/PR/merge refs, a
transactional deployment receipt, stable resident identity and Web/IM health,
and a fresh real-entry Evi iteration whose outer authority snapshot is visible
and whose own delivery evidence is independently verified.

## Pre-PR evidence

- `pnpm run build` passed after the final implementation review.
- Focused queue/worker/Web/context/runner checks passed 141/141. They prove
  explicit contract validation, append-only persistence, recovery propagation,
  legacy compatibility, context visibility, model-round/tool-call enforcement,
  side-effect ceiling rejection, external-command allowlisting, forbidden
  arguments, and failed-tool completion blocking.
- `pnpm run check` passed on 2026-07-17: TypeScript build, 873/873 tests,
  active-vault skill validation, and neutral naming across 123 implementation
  files.
- `git diff --check` passed. The final diff is limited to Task 235, the queue/
  Web/runner/context propagation surfaces, paired runtime documentation, and
  their tests.
