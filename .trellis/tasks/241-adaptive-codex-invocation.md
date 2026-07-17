# Task 241: Adaptive Codex invocation

- Status: verified in isolated worktree; integration pending
- Linked Issue: #54 — https://github.com/suthree/Evi/issues/54
- Milestone / target version: Issue #54 accepted core/basic follow-up; no release claim
- Owner repository: Evi
- Implementation owner: current main Codex thread under `main_harness`
- Decision Owner / authority: accepted Issue #54 and bounded operator execution request
- Capability layer: core
- Base commit: `1c22979d4d4feb0cb4f2bed86e062fd58ab759d3`
- Branch: `codex/issue-54-adaptive-codex-invocation`
- Isolated worktree: `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/54-adaptive-codex-invocation`

## Problem and evidence

At the base commit, `packages/core/src/codex_run_contract.ts` has a compile-time
singleton model (`gpt-5.6-sol`), singleton reasoning (`xhigh`), hidden defaults
for both, and a v1 authority with one prompt digest and no selection rationale,
task shape, or delegation strategy. `packages/runtime/src/tools.ts` does not
inject parallel supervision or separate requested delegation from attributable
subagent tool evidence.

The one-time bootstrap selected `gpt-5.6-sol`, `xhigh`, profile and service tier
`fast`, `workspace-write`, and approval `never` under a verified live contract.
This is current compatibility evidence, not a future default.

## Outcome and acceptance

- Every new request explicitly supplies a safe model token and bounded
  `minimal|low|medium|high|xhigh` reasoning effort.
- New request and immutable v2 authority carry `selection_rationale`,
  `task_shape`, and bounded `single|parallel` delegation with unique independent
  workstreams and `main_codex_thread` integration ownership.
- Resume uses only handle/digest, inherits selection and strategy, rejects
  re-submitted drift, and rejects v1 snapshots fail-closed.
- Parallel execution receives bounded supervision. Authority and metadata
  persist original-user/effective-prompt digests and verifiability.
- Existing tool-result/episode metadata records selection, plan, capture,
  tool-call, timeout/limit and structured-result facts; only explicit JSONL
  `collab_tool_call/spawn_agent` items count as subagent evidence.
- Existing Git/worktree/cwd/thread/sandbox/approval/output-capture safety and
  advisory-only `delegate_agent` behavior remain unchanged.
- Focused tests cover multiple safe models, reasoning bounds, parallel prompt
  and metadata, duplicate JSONL spawn events, resume drift, malformed v2
  authority, and v1 fail-closed behavior.

## Scope

- `packages/core/src/codex_run_contract.ts`
- `packages/core/src/tool_contracts.ts`
- `packages/runtime/src/tools.ts`
- `tests/codex_run_contract.test.ts`
- `tests/runtime_tools.test.ts`
- `docs/RUNTIME_CONTRACT.md`
- `docs/README.cn.md`
- this task record

## Non-goals and authority gates

- No service, database, scheduler, queue, dependency, worktree, branch, Issue,
  Codex thread, SOP, or skill.
- No change to `delegate_agent` payload, permissions, write boundary, result, or
  completion authority.
- No commit, push, PR, merge, deploy, restart, release, publication, web search,
  secret movement, or additional writable sandbox root.
- Requested workstreams and model self-report do not prove subagent use or
  completion.

## Architecture, reuse, and data contract

The implementation reuses the typed request parser, immutable authority digest,
thread JSON record, prompt builder, JSONL consumer, bounded output capture,
tool-result metadata, and existing episode persistence. It adds no storage
surface. Selection and strategy remain input authority, supervision remains
prompt policy, and observed delegation remains process evidence.

Authoritative sources are Issue #54, current source, live Git authority checks,
the typed request, Codex JSONL, fixed Git status snapshots, and the terminal
structured result. Tests use labelled synthetic fake-Codex JSONL and make no
live external-execution claim. V1 thread authority lacks immutable selection,
strategy and dual digests; resume returns `codex_authority_mismatch` instead of
guessing. Rollback reverses only the eight scoped paths and leaves runtime state
and unrelated work unchanged.

## Budgets and parallel ownership

- Main execution: timeout 300000 ms, output capture 9600 chars, context 40000
  chars, 32 tool calls, zero retries.
- Delegation: parallel, at most three subagents.
- `/root/contract_authority`: the two `packages/core` files.
- `/root/runtime_evidence`: `packages/runtime/src/tools.ts`.
- `/root/tests_docs`: the two focused tests, paired docs, and this task file.
- Main thread: integration, conflict resolution, corrections and final checks.

No files were assigned to more than one subagent workstream.

## Attributable subagent evidence

- `/root/contract_authority`: `spawn_agent` returned this canonical path. The
  agent sent its safe-model/reasoning/strategy/v2 proposal, and its core patch
  is present in the shared diff. No final result survived the operator steer.
- `/root/runtime_evidence`: `spawn_agent` returned this canonical path. The
  agent sent an in-progress metadata-gap report, and its runtime patch is
  present in the shared diff. No final result survived the operator steer.
- `/root/tests_docs`: `spawn_agent` returned this canonical path and exchanged
  an exclusive-ownership clarification, but changed no owned file before the
  steer. The main thread completed that workstream as authorized.

The collaboration tool returns exposed these `agent_path` values but no child
thread ids. No unavailable thread id or completion result is invented.

## Verification plan

- `node --import tsx --test tests/codex_run_contract.test.ts tests/runtime_tools.test.ts`
- `pnpm run build`
- `git diff --check`
- final `git status --short` and scoped diff audit

## Completion evidence

- Evi focused Codex contract/runtime tests: exit 0.
- `context_harness`: exit 0; the prior bounded-context failure is closed.
- `tsc`: exit 0.
- `pnpm run check`: exit 0.
- Full-check stdout observed 207641 bytes; retained 12004 bytes with `truncated=true`. This cap limits retained evidence only and does not block verification.
- `git diff --check`: exit 0.
- Exactly eight authorized paths: seven tracked paths plus untracked Task 241.
- “No commit” describes only the Codex implementation stage; it does not represent the final Evi delivery state.
