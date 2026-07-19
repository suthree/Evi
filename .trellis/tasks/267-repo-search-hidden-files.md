# Task 267: Repository Search Hidden Files

Status: active

## Identity And Ownership

- Issue: GitHub Issue #114, repository-owned hidden files in `repo.search`.
- Milestone: not assigned; this is an urgent live-acceptance repair inside the
  current stabilization tranche, not a new roadmap item.
- Target version: not applicable; the repair preserves the existing tool API
  and requires no version or state-schema change.
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

- Dependencies/blockers/cross-repository links: no code dependency and no
  cross-repository work; terminal validation depends only on integrating and
  locally deploying this Evi commit before continuing the existing Goal.
- Architecture impact: the existing `packages/runtime/src/tools.ts`
  repo-search adapter remains the sole owner. Capability Portfolio, GoalRuntime,
  state, context, and CLI ownership do not change.
- External effects and sensitive-data gate: source/tests have no external
  effect. GitHub Issue/PR updates and the local runtime deployment are covered
  by the operator's explicit authorization. The broader hidden search surface
  must still exclude Git metadata, repo-local runtime state, dependencies, and
  generated output so their contents are not exposed to cognition.

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

- Context budget: Issue #114, Task267, the repo-search adapter, its focused test,
  and the relevant engineering/runtime-contract sections only; no raw Goal log
  bodies are resident implementation context.
- Time/retry budget: at most three focused red/green correction cycles and one
  full repository gate per accepted corrected head. A repeated unexplained
  failure stops integration rather than expanding scope.
- Tool/delegation budget: one implementation owner, no implementation
  subagents, and two read-only independent review agents for Spec and Standards;
  no delegated mutation or competing file owner.
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
- The Node fallback continues to walk repository-owned hidden paths and now
  applies the same protected-component exclusions as ripgrep; no second search
  contract or compatibility path was added.
- TDD green: the focused runtime-tools suite passed 33/33, including the exact
  real-Goal query/glob shape and an adjacent `.git` exclusion fixture.
- The first `pnpm run check` attempt stopped before compilation because this
  new worktree had no installed dependencies (`tsc: command not found`).
  `pnpm install --offline --frozen-lockfile` reused 55 packages from the local
  pnpm store without changing the lockfile or dependency declarations.
- The repeated full `pnpm run check` passed on exact corrected head `78ced61`:
  TypeScript build, 1012/1012 tests, active Skill validation, and neutral naming
  across 134 implementation files.
- `git diff --check` passed. The corrected source/test diff is 180 insertions
  and 18
  deletions across `packages/runtime/src/tools.ts` and
  `tests/runtime_tools.test.ts`; Task267 remains the only governance artifact.

## Integration Checkpoint

- Pending: independent standards/spec review, accepted commit, PR, exact merge
  deployment, controller handoff, healthy/current and connected Feishu checks,
  then same-Goal live acceptance.

## Review Cycle 1

- Spec review found one P1: `!.git/**` excludes a Git directory subtree but
  not the root `.git` file used by linked worktrees. A caller glob of `.git`
  could therefore return the `gitdir:` pointer. The Node fallback had the same
  exact-root omission, and the first test incorrectly modeled `.git` only as a
  directory.
- The corrected public-tool test now writes a root `.git` file and explicitly
  includes `.git` in caller globs. TDD red returned both `.git` and the intended
  `.trellis` evidence.
- Ripgrep now appends both `!.git` and `!.git/**` after caller globs. The Node
  fallback rejects both `path === ".git"` and `.git/` descendants. The repeated
  focused suite passed 33/33.
- Pending: full repository gate and independent cycle-2 re-review against the
  corrected diff.

## Review Cycle 1 Standards Follow-Up

- Standards review found one P1 engine mismatch: after `--hidden`, root files
  matching `.runtime-*`, `.runtime_*`, or `.local-runtime*` escaped ripgrep's
  subtree-only globs even though the Node fallback excluded them. The wider
  audit also found exact root files named `.runtime`, `node_modules`, and `dist`
  had the same shape.
- The public-tool fixture now includes exact protected roots and root prefix
  files, with caller globs that would re-include them. TDD red returned all six
  protected entries in addition to `.trellis`.
- Ripgrep now appends exact-root, root-prefix, and subtree exclusions after all
  caller globs. The fallback explicitly excludes exact `node_modules` and
  `dist`, joining its existing exact `.git`/`.runtime` and prefix rules.
- Standards review also found missing required governance fields. Milestone,
  target-version rationale, dependencies, architecture impact, external and
  sensitive-data gates, plus context/time/retry/tool/delegation budgets are now
  explicit above.

## Review Cycle 2

- Spec review returned zero findings on corrected head `e75242e` and confirmed
  both engines excluded a linked-worktree root `.git` file through the public
  `repo.search` contract.
- Standards review found one remaining P1 engine mismatch: ripgrep's basename
  exclusions protect matching directories at any depth, while the Node
  fallback checked only repository-root prefixes. A forced fallback public-tool
  reproduction returned nested `.git`, `node_modules`, `dist`, `.runtime-*`,
  `.runtime_*`, and `.local-runtime*` paths. It also identified the stale
  source/test diff count above.
- The forced-fallback regression first failed 32/33 with every nested protected
  path in its result. The fallback now evaluates every path component and
  prunes protected directory traversal; both ripgrep and Node public-tool calls
  return only the allowed nested `.trellis` evidence. The focused suite then
  passed 33/33, TypeScript build passed, and `git diff --check` passed.
- Pending: full repository gate and independent cycle-3 review of this final
  corrected diff.

## Review Cycle 3

- Spec review returned zero findings on exact head `78ced61` and independently
  passed the focused 33/33 suite, the full 1012/1012 repository gate, build,
  and diff check. It found no Goal specialization, static routing, new owner,
  dependency, or scope expansion.
- Standards review confirmed the protected-path, traversal-pruning, PATH
  restoration, and prior evidence findings were closed, then found one P2
  engine mismatch: caller include/exclude globs were sent only to ripgrep and
  silently ignored by the Node fallback.
- The public-tool regression first failed 32/33: with ripgrep unavailable,
  `globs: ["*.ts"]` returned a Markdown file that ripgrep excluded. The fallback
  now receives the bounded caller glob list and applies the same ordered
  basename/path include-exclude selection before reading file bodies. Public
  tests cover positive include and later exclude globs in both engines; the
  focused suite then passed 33/33, build passed, and `git diff --check` passed.
- Pending: full repository gate and independent cycle-4 review of the final
  corrected head.
