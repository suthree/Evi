# Task 256: Stabilization And Architecture Audit

Status: active

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
- Keep runtime behavior, dependencies, schemas, state, and deployment
  unchanged. Pass link/document checks, `git diff --check`, focused
  documentation validation, full `pnpm run check`, PR integration, and
  post-merge root/runtime verification.

## Scope And Non-Goals

- In scope: Git/worktree hygiene, Issue/Trellis reconciliation, architecture
  audit, paired architecture docs, documentation routing/ownership, concise
  Chinese operator entrypoint, and completion evidence.
- Non-goals: new product capability, GoalRuntime behavior, tool/harness/context
  implementation, sandbox implementation, memory schema migration, provider
  or entrypoint work, broad monolith extraction, dependency, database, queue,
  service, compatibility layer, main merge, tag, release, public publication,
  or secret movement.
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

- Pending implementation, verification, commit, PR, merge, cleanup, and live
  post-merge evidence.
