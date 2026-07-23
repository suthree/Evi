# Task 256: Stabilization And Architecture Audit

Status: completed

## Identity And Ownership

- Issue: GitHub Issue #91, `chore(architecture): stabilize Evi and audit core
  capability boundaries`.
- Paused program: GitHub Issue #56. Completed child Issue #89 and Task 255
  are reconciled from PR #90 and deployed runtime evidence in this task.
- Decision Owner / authority basis: explicit operator approval on 2026-07-18
  to pause new Codex-supervised Evi self-evolution feature slices and complete
  this stabilization and architecture-audit delivery with local and GitHub
  integration authority.
- Owner repository / implementation owner: Evi / Codex.
- Capability layer: governance and architecture boundary; no runtime capability
  change.
- Base: `396fd193b35332581503b10818d1883959610c41` on `develop`.
- Branch/worktree: `codex/issue-91-stabilization-architecture-audit` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/91-stabilization-architecture-audit`.
- Milestone/version: pre-feature foundation stabilization; no release claim.

## Observed Problem And Evidence

- The root `develop` checkout is clean and synchronized with
  `origin/develop`; full verification passed 966 tests and the resident runtime
  is healthy/current at the base commit.
- Git has 37 registered worktrees, 36 live worktrees, two dirty worktrees, one
  prunable record, seven local branches without upstream, and many merged
  historical feature worktrees.
- Issue #89 and PR #90 are integrated and deployed, but Issue #89 and Task 255
  remain open/active. Parent Issue #56 still advertises continuing feature
  slices despite the operator pause.
- The current runtime contract and operator entrypoint duplicate substantial
  detail. Core/runtime implementations and tests contain multiple files above
  2,000 lines, while architecture ownership and delegated capability seams are
  spread across product vision, runtime contract, soul, runtimes, decisions,
  and task history.
- Current process controls and effect classification are valuable, but they do
  not constitute a true OS/filesystem sandbox. Active-vault packaging validity
  also does not prove reusable tool competence.

## Desired Outcome And Acceptance

- Preserve or deliberately retire the two dirty worktree artifacts, remove
  merged historical worktrees, and prune stale worktree metadata without
  losing unique commits or operator work.
- Reconcile Issue #89 and Task 255 with PR #90 and live deployment evidence;
  record Issue #56 as paused and link Issue #91.
- Add paired English/Chinese architecture documents that name the current
  owner modules, stable interfaces, seams, adapters, state owners, reference
  reuse choices, do-not-build list, pressure evidence, migration order, and
  resumption gates.
- Make the architecture document the owner of current module placement and
  delegated-capability strategy; keep product vision, runtime behavior,
  learning policy, and Trellis governance with their existing owners.
- Replace the oversized Chinese operator entrypoint with a concise companion
  to the thin root README, preserving current commands and links through
  canonical owners rather than copying their bodies.
- Record the pause and architecture-restraint decision in
  `.trellis/decisions.md` with authority, superseded activation, scope,
  verification, recovery, and re-evaluation conditions.
- Keep runtime behavior, dependencies, schemas, and deployment implementation
  unchanged. A normal exact-commit post-merge deployment is permitted only to
  align resident source identity with `develop`. Pass link/document checks,
  `git diff --check`, focused
  documentation validation, full `pnpm run check`, PR integration, and
  post-merge root/runtime verification.

## Scope And Non-Goals

- In scope: Git/worktree hygiene, Issue/Trellis reconciliation, architecture
  audit, paired architecture docs, documentation routing/ownership, concise
  Chinese operator entrypoint, and completion evidence.
- Non-goals: new product capability, GoalRuntime behavior, tool/harness/context
  implementation, sandbox implementation, memory schema migration, provider
  or entrypoint work, broad monolith extraction, dependency, database, queue,
  service or deployment implementation, compatibility layer, main merge, tag,
  release, public publication, or secret movement.
- This task names future seams and retirement order. It does not create
  hypothetical interfaces with only one adapter and does not introduce a
  facade over existing shallow modules.

## Architecture, Reuse, And Complexity

- Reuse the existing persistent-Self, GoalRuntime, Context Manifest, Harness
  Lock, EffectPolicy, evidence, memory, and active-vault concepts. Clarify
  ownership instead of adding runtime abstraction.
- Inspect pinned local snapshots of GenericAgent, Codex, pi, OpenCode,
  OpenClaw, Hermes, and learn-claude-code. Record exact commits, the borrowed
  idea, Evi-specific difference, and later verification implication.
- Use the deep-module discipline: small interfaces, real seams only where at
  least production and test or multiple execution adapters exist, and future
  replacement rather than layered compatibility. Current oversized files are
  audit evidence, not authorization for mechanical line-count splitting.
- The smallest coherent change is documentation/governance plus environment
  cleanup. Runtime extraction is deferred until a later Issue can replace one
  complete vertical path with interface-level tests.

## Data, Effects, Compatibility, And Recovery

- Authoritative inputs are Git refs/status, GitHub Issue/PR state, Trellis task
  records, current source/docs, local reference repository commits, full test
  output, and resident service health. Counts and architectural judgments are
  labeled as current measurements or proposals.
- No runtime data migration or secret access is required. GitHub Issue/PR
  comments, closure, push, and merge are operator-authorized external effects.
- Historical task/decision evidence remains readable. Documentation links are
  migrated in the same change; no compatibility file or redirect layer is
  added.
- Dirty worktree artifacts are inspected before removal. A uniquely valuable
  verification case is migrated into this branch and tested; a duplicate or
  temporary probe is explicitly retired. All feature branch commits are
  checked for remote reachability before worktree removal.
- Rollback is a normal revert of the documentation/governance commit. GitHub
  Issues can be reopened and Issue #56 resumed. Removed worktrees are
  reconstructable from merged branch commits; no unique commit may be removed.

## Budgets And Execution Discipline

- One repository, one Issue, one task, one isolated worktree, one PR.
- No subagents. Reference inspection is bounded to the named local snapshots
  and files that define their relevant interface.
- No repeated feature implementation loop. Retry only a concrete failed
  command, document link, test, PR integration, or runtime verification step.
- Keep the final tracked diff documentation/governance-only unless the dirty
  regression test is proven non-duplicate and still valuable on current
  develop.

## Verification Plan

- Git inventory: root/worktree status, remote reachability, merged-head checks,
  stale metadata pruning, and final registered-worktree count.
- Documentation: paired owner links, heading/router checks, local Markdown-link
  validation, no broken references, and concise entrypoint size.
- Architecture: owner/source-of-truth table, reference commit matrix,
  own/delegate/do-not-build table, pressure inventory, staged replacement plan,
  and explicit resume gates reviewed against Issue #91.
- Repository: `git diff --check`, focused documentation tests if present,
  `pnpm run check`, and final diff inspection.
- Integration: commit, push, PR to `develop`, merge, fetch/fast-forward root,
  clean root/worktrees, Issue/task closure, and resident health showing
  `healthy`, `deployment: current`, and `source_commit == develop HEAD` because
  runtime behavior/build inputs do not change.

## Completion Evidence

- Activation commit `d00fd5ed1936a2f233fbbfaa8e58846a204b4498`
  created this task on the named branch and was pushed before implementation.
- Issue #56 records the operator pause and links Issue #91. Issue #89 was
  closed after PR #90 merge and exact-commit resident health evidence; Task 255
  is reconciled to `completed` in this diff.
- Stale completed bootstrap Issues #30, #32, #34, #43, #46, #48, #50, and #54
  were closed with their merged PR lineage and current full-check/live-health
  evidence. The remaining open Issues are v0.2 target #13, paused GoalRuntime
  program #56, and this stabilization Issue #91.
- Git worktree cleanup first proved every retired worktree HEAD was an ancestor
  of `origin/develop`. It then removed 35 merged historical feature worktrees,
  pruned the missing `/private/tmp/evi-issue-13-branch-authority` record, and
  retained only root `develop` plus this task worktree.
- The uncommitted Issue #34 output-capture test was retired because current
  `develop` already contains the stricter regression `codex.run truncates
  diagnostic retention without terminating valid JSONL or the final structured
  result`. The Issue #76 one-line live-growth probe was temporary acceptance
  evidence and was also retired. Neither artifact contained a unique commit.
- Merged local `codex/*` branches were removed. The unmerged rollback-drill
  branch was removed locally only after confirming its commit remains on its
  upstream remote branch. The active Issue #91 branch and long-lived release /
  integration branches remain.
- The installed Trellis 0.6.7 CLI does not expose the `status`, `log`, or
  `seed` commands advertised by generated `.trellis/agents/AGENTS.md`. This
  task records the drift but does not manually edit generated Trellis context
  or expand scope into a Trellis upgrade.
- `docs/ARCHITECTURE.md` and `docs/ARCHITECTURE.cn.md` now own the current
  module map, own/delegate decision, reference snapshot audit, pressure
  evidence, staged replacement order, and resume gates. Routers, instruction
  ownership, product precedence, runtime documentation ownership, and the
  engineering delivery contract point to that owner.
- `docs/README.cn.md` was reduced from 742 lines to a 116-line operator router.
  Runtime, operations, learning, product, and historical details remain behind
  their canonical documents rather than being copied into the entrypoint.
- A local Markdown-link check passed for all 16 changed/new Markdown files;
  `git diff --check` passed; `docs/README.cn.md` is below 150 lines and
  `memory/index.md` remains below its 30-line resident budget.
- The first `pnpm run check` attempt stopped before compilation because this
  isolated worktree had no `node_modules`. `pnpm install --frozen-lockfile`
  restored the lockfile-pinned local environment. The second full check passed:
  TypeScript build, 966/966 tests, active-vault skill validation, and neutral
  naming across 128 implementation files.
- Final review confirmed that all 16 tracked paths are Markdown governance or
  documentation; no source, config, dependency, schema, or runtime state path
  is in the diff. Commit `a15ae6ed8c253a2cb7281da1d5a6d90cb47bec7b`
  contains the architecture and documentation change.
- Draft PR #92 targets `develop` from the named branch, is clean/mergeable, and
  reports no repository-hosted checks; the executed local verification above
  is therefore the repository gate. PR #92 is the integration record and its
  final head carries this completed task state.
- GitHub Issue #91 owns the final external receipts that cannot be known inside
  the pre-merge task commit: merge commit, exact-commit resident deployment and
  health, branch/worktree cleanup, and Issue closure. Those effects must occur
  in the same supervised delivery before completion is reported to the
  operator.
