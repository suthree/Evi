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

## Post-deployment guard audit

Deployment `deployment_20260717032938_6b11163f3483` reached `stable` with
healthy Web/Feishu entrypoints, but a supervisor audit found that the direct
external-command guard recognized only `git push` with `push` as argv[0]. The
isolated-worktree flow normally uses `git -C <worktree> push`, so the same Issue
and task received a bounded fix-forward on branch
`codex/issue-34-git-option-external-guard`.

The fix extracts the Git subcommand after bounded global options and proves
that `git -C <worktree> push` cannot execute under a false `local_write`
declaration. Focused context/runner checks passed 126/126; the full repository
gate again passed 873/873, active-vault skill validation, neutral naming across
123 implementation files, and `git diff --check`.

A subsequent real Evi task exhausted three attempts without creating an Issue
or worktree and emitted `sh -lc` as a read-only Git wrapper. The observed call
did not perform an external effect, but it proved direct external-command policy
could be bypassed through script/interpreter indirection. The same Issue and
task therefore receive one more fail-closed fix-forward on branch
`codex/issue-34-command-indirection-guard`: external-write task contracts reject
shells, general interpreters, `code.execute_node`, and package-manager exec/dlx
carriers before execution, while direct fixed commands such as `git`, `gh`, and
`pnpm run check` remain available.

That runtime then proved one more replay boundary: the forbidden-argument guard
was evaluated only for commands declaring `external_write`, so a recovery
attempt could repeat local `git worktree add` even when `worktree` was listed as
forbidden. The same Issue and task receive a final fail-closed fix-forward on
branch `codex/issue-34-forbidden-command-scope`: forbidden arguments apply to
every direct `command.run`, while the binary allowlist remains specific to
external writes. This lets a continuation contract hard-block both another
`gh issue` operation and another local worktree setup.

Focused context/runner checks passed 126/126. The full repository gate passed
873/873 tests, active-vault skill validation, neutral naming across 123
implementation files, and `git diff --check`.

## Codex output-capture fix-forward evidence

Issue #34 later exposed a narrower typed-runner defect on branch
`codex/issue-34-codex-output-capture-20260717`: the persisted
`max_output_chars` authority budget was enforced by terminating the Codex
process as soon as accumulated stdout/stderr crossed the limit. That made a
valid terminal `agent_message` unreachable even though output capture is only
diagnostic evidence retention.

The bounded fix keeps timeout, tool-call, spawn/nonzero-exit, JSONL, thread,
authority, and structured-result failures unchanged while continuing to parse
JSONL beyond the capture limit. It retains only bounded event-summary and
redacted-stderr prefix/suffix evidence and records observed, retained,
truncated, and effective-limit metadata. Explicit request budgets win; omitted
new-run capture limits derive from active model `max_output_tokens` through the
tool context, with the existing context-budget fallback for direct callers.
Version-1 authority snapshots and resumes retain their persisted budget, and
the legacy `output_budget_exceeded` metadata field remains present as `false`
for compatible migration. `delegate_agent` remains unchanged and advisory
only.

The two focused files first passed 27/27 with `pnpm exec tsx --test
tests/codex_run_contract.test.ts tests/runtime_tools.test.ts`. After the final
contract-exemplar edit, the strictly scoped rerun passed 10/10 with `node
--import tsx --test --test-name-pattern='codex\.run|tool contract renderer'
tests/codex_run_contract.test.ts tests/runtime_tools.test.ts`. This includes
synthetic JSONL whose total observed output exceeds the explicit capture limit
before a valid final structured result. `pnpm exec tsc -p tsconfig.json --noEmit
--pretty false` and `git diff --check` also passed. No live Codex, deployment,
commit, push, PR, merge, or LuBan action is part of this fix-forward evidence.
