# Task 267: Repository Search Hidden Files

Status: active

## Identity And Ownership

- Issue: GitHub Issue #114, repository-owned hidden files in `repo.search`.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Decision Owner / authority basis: Issue #114 and the operator-authorized
  self-evolution acceptance Goal.
- Capability layer: basic-entrypoint.
- Base: `00ab868a4ba0c22ba1d92d947b5d61126e68e6db` on `develop`.
- Branch/worktree: `codex/issue-114-repo-search-hidden-files` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/issue-114-repo-search-hidden-files`.

## Problem, Outcome, And Boundaries

Real Feishu Goal `goal_20260718155814_357c4361` selected `repo.search` with
query `6c90aa2`, path `.`, and Markdown/JSON/TypeScript globs in the bound Issue
#101 worktree. Sequence 216 returned zero results even though the exact value is
present in tracked `.trellis/tasks/261-deployment-cli-command-module.md`. The
ripgrep adapter omitted repository-owned hidden paths, creating a false-negative
observation and a repeated external-harness blocker.

The outcome is one coherent repo-search contract: repository-owned hidden files
such as `.trellis` are searchable, while `.git`, `.runtime`, dependency trees,
and generated output remain excluded. Existing path validation, globs, result
bounds, truncation, and runtime-state guards remain unchanged.

Non-goals:

- no Goal-, Task261-, commit-, or task-to-tool-specific routing;
- no prompt injection of the desired acceptance conclusion;
- no new search engine, dependency, cache, watcher, registry, or state owner;
- no Goal event/checkpoint rewrite and no new Goal;
- no broad file-reading, context, or CLI refactor.

## Design, Evidence, And Recovery

- Reuse the existing `runRipgrep` and Node fallback implementations. Inspect
  both so their hidden-path semantics remain aligned.
- Add a focused failing regression proving a root-scoped search finds a value
  under `.trellis`, while `.git` and `.runtime` remain absent.
- Prefer the smallest flag/filter change that makes the public tool contract
  true; retain current output and execution limits.
- Rollback is a normal revert and exact-commit redeploy. No state migration or
  compatibility layer is required.

## Verification And Budgets

- One implementation owner; no subagents or independent file owners.
- Targeted loop: `tests/runtime_tools.test.ts`, TypeScript build/no-emit, and
  `git diff --check`.
- Repository gate: `pnpm run check`.
- Review the final diff against Issue #114 and repository engineering standards.
- After PR acceptance, merge only the reviewed head, deploy the exact merge
  commit, complete controller handoff, and verify healthy/current plus Feishu
  inbound connected.
- Resume only the same real Goal and require it to observe Task261 evidence and
  form a trustworthy terminal receipt before closing Issue #114.

## Activation Evidence

- Goal sequences 215-217 prove correct dynamic selection of execution-scoped
  `repo.search`, a matching bound-worktree marker at `381033c`, and the false
  zero-result observation.
- Local read-only `rg` proves the exact query appears in tracked Task261 lines
  104-108 and that Task261 distinguishes accepted PR head `6c90aa2` from merge
  and deployed commit `7067c1b`.
- Root `develop` contains unrelated, concurrent Dream/identity/memory changes;
  they remain preserved outside this worktree and this task.

## Implementation And Verification Evidence

- TDD red: `node --import tsx --test tests/runtime_tools.test.ts` failed only
  the new hidden-evidence assertion because `repo.search` returned `[]` for a
  value under `.trellis/tasks`.
- The ripgrep adapter now opts into hidden repository paths. Protected
  exclusions are appended after caller globs, so a broad or matching caller
  glob cannot re-include `.git`, `node_modules`, `dist`, `.runtime*`, or the
  local-runtime surfaces.
- The existing Node fallback already walks hidden paths and applies the same
  protected-prefix exclusions; no second search contract or compatibility path
  was added.
- TDD green: the focused runtime-tools suite passed 33/33, including the exact
  real-Goal query/glob shape and an adjacent `.git` exclusion fixture.
- The first `pnpm run check` attempt stopped before compilation because this
  new worktree had no installed dependencies (`tsc: command not found`).
  `pnpm install --offline --frozen-lockfile` reused 55 packages from the local
  pnpm store without changing the lockfile or dependency declarations.
- The repeated full `pnpm run check` passed: TypeScript build, 1012/1012 tests,
  active Skill validation, and neutral naming across 134 implementation files.
- `git diff --check` passed. The source/test diff is 31 insertions and 6
  deletions across `packages/runtime/src/tools.ts` and
  `tests/runtime_tools.test.ts`; Task267 remains the only governance artifact.

## Integration Checkpoint

- Pending: independent standards/spec review, accepted commit, PR, exact merge
  deployment, controller handoff, healthy/current and connected Feishu checks,
  then same-Goal live acceptance.
