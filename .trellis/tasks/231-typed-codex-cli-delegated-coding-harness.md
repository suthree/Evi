# Task 231: Typed Codex CLI delegated coding harness

- Status: review
- Checkpoint: verified
- Linked Issue: #25 — https://github.com/suthree/Evi/issues/25
- Milestone / target version: local v0.1 core/basic self-evolution follow-up (not v0.2)
- Owner: Evi
- Implementation owner: Evi resident runtime
- Decision Owner: operator + accepted goal
- Capability layer: core
- Base: d994c3b944d425be557f8c4fd4f86e1d25263dd5
- Branch: codex/issue-25-typed-codex-cli
- Worktree: /Users/agi00079/Documents/GitHub/suthree/Evi-issue-25-typed-codex-cli
- Gate 0 thread: 019f6b2b-689d-75d0-a64c-b61d82994411
- Coding thread: 019f6b2e-6db5-7dd2-a363-348eba271a91

## Observed problem
Issue #25 requires a typed Codex CLI coding execution harness with explicit
engineering delivery controls, independent verification, and no transfer of
completion authority to Codex.

## Acceptance
The verified slice provides a typed `codex.run` core tool above `command.run`,
bounded new/resume execution, strict structured evidence, live Git isolation
and change evidence, process-group cleanup, focused/full verification, and a
recorded rollback path.

## Scope and non-goals
Scope is one main-harness-to-single-Codex-CLI implementation path in the core
execution layer. Non-goals are a second worktree, model fan-out, a scheduler,
changes to LuBan, changes to `delegate_agent`, commit, PR, merge, deploy, or
external publication.

## Dependencies and blockers
Depends on Issue #25 and this registered isolated worktree. Runtime execution
is rejected if the Git common directory, registered worktree identity, base,
branch, repository root, or cwd no longer matches the bound authority snapshot.
No B6 blocker remains.

## Architecture impact
Core execution/tool layer only. `codex.run` is an independent typed coding
execution tool above generic `command.run`; its runtime contract remains
project-neutral. This project assigns the `main_harness` role to Evi.
`main_harness` exclusively owns review, independent diff/test verification,
permissions, commit, PR, merge, deploy, and completion. `delegate_agent`
remains advisory-only and completely separate; its payload, result, tool,
write, and completion authority are unchanged. LuBan is a no-op boundary.

## External and sensitive gates
The verified execution selection was `gpt-5.6-sol` / profile `fast` / reasoning
`xhigh` / service tier `fast` / sandbox `workspace-write` / approval `never`.
The contract also permits `read-only` sandbox and no other model, profile,
reasoning, tier, or approval values. No commit, push, PR, merge, deploy,
publication, or other external write is authorized by this checkpoint.

## Delivery contract
- Reuse: implement as a core runtime capability above existing `command.run`.
- Occam: one main-harness-to-single-Codex-CLI path; no subagents, second
  worktree, fan-out, scheduler, or automatic retry.
- Data source: repository source, Issue #25 metadata, and local runtime evidence.
- Migration compatibility: preserve existing delegate_agent advisory-only semantics and existing callers.
- Retirement: retire or roll back the implementation path if typed boundaries, authorization, or verification cannot be maintained.
- Budgets: timeout, output, context, tool, and retry budgets are explicit and
  bound into the immutable execution authority digest.
- Verification: focused contract/runtime tests, build, full check, diff check,
  and Evi-owned independent review are required completion evidence.
- Rollback: before integration, reverse only the bounded `codex.run` contract,
  runtime routing, tests, and companion documentation changes listed below;
  preserve unrelated work and the existing worktree. After integration, revert
  the bounded integration change through the normal main-harness review path.

## B6 verified checkpoint

Changed paths:

- `packages/core/src/codex_run_contract.ts`
- `packages/core/src/tool_contracts.ts`
- `packages/runtime/src/tools.ts`
- `tests/codex_run_contract.test.ts`
- `tests/runtime_tools.test.ts`
- `docs/RUNTIME_CONTRACT.md`
- `docs/README.cn.md`
- `.trellis/tasks/231-typed-codex-cli-delegated-coding-harness.md`

Recorded evidence:

- Gate 0 thread `019f6b2b-689d-75d0-a64c-b61d82994411`: PASS.
- Coding thread `019f6b2e-6db5-7dd2-a363-348eba271a91`: PASS.
- `node --import tsx --test tests/codex_run_contract.test.ts tests/runtime_tools.test.ts`: PASS, 25/25.
- `pnpm run build`: PASS.
- `pnpm run check`: PASS.
- `git diff --check`: PASS.
- Evi independent review: PASS; live isolation, bounded process execution,
  structured failure behavior, live tracked/untracked evidence, and exclusive
  main-harness completion authority were reviewed independently from Codex
  self-report.

Boundary evidence: `delegate_agent` source and contracts are unchanged; LuBan
is unchanged; no commit, push, PR, merge, deploy, publication, or new worktree
is part of this checkpoint.
