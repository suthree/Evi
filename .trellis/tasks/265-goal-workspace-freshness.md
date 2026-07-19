# Task 265: Goal Workspace Freshness

Status: active

## Identity And Ownership

- Issue: GitHub Issue #110, unobserved Goal workspace advancement.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Decision Owner / authority basis: the accepted self-evolution mission and
  the operator's continued execution authority.
- Capability layer: harness-context.
- Base: `a53ceccf788467f02cde11fed2aa0a9ed71b41a3` on `develop`.
- Branch/worktree: `codex/issue-110-workspace-freshness` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/issue-110-workspace-freshness`.

## Problem And Outcome

The real Feishu Goal refreshed current deployment evidence after a blocker but
could not see that its already-bound worktree had advanced beyond the latest
canonical workspace observation. It therefore repeated the same runtime read
and blocker instead of dynamically refreshing the changed Task261 reference.

Expose one bounded derived workspace-freshness view to Goal cognition. Compare
the live bound-worktree HEAD with the latest HEAD already supported by
canonical Goal observations. The view is an anti-drift hint only: cognition
still chooses the capability, and only a later tool observation becomes
canonical evidence.

## Design And Boundaries

- Preserve the persisted `GoalExecutionWorkspace` authority as immutable
  preparation evidence. Do not overwrite its start commit or add runtime state.
- Derive the last observed HEAD from workspace authority and later canonical
  tool observations that contain harness-owned Git snapshots or `git_commit`
  change identities.
- Inspect the live path through the existing repository-authority boundary and
  require the same repo root, Git common directory, and branch before exposing
  a live HEAD.
- Distinguish `unbound`, `aligned`, `changed_unobserved`, and `unavailable`.
  Keep reasons bounded and avoid declaring ancestry or acceptance from a HEAD
  mismatch alone.
- Render the view separately from canonical evidence. Tell cognition to use it
  only when relevant and to choose a bounded refresh dynamically; do not route
  a status to `file.read`, `repo.git_status`, `command.run`, or Codex.
- Do not add an event, receipt field, ledger, cache, watcher, TTL, poller, Goal
  command, user evidence injection path, or completion authority.

## Verification And Recovery

- Use TDD for the derived view and rendered cognition contract.
- Cover no workspace, aligned live HEAD, externally advanced live HEAD, latest
  canonical Git snapshot precedence, and unavailable or foreign ownership.
- Confirm the hint cannot enter candidate evidence or receipt schemas and does
  not relax observation freshness or the verifier.
- Run focused GoalRuntime and adapter tests, TypeScript build,
  `git diff --check`, and full `pnpm run check`.
- Rollback is a source revert and exact-commit redeploy of a53. No runtime state
  migration is required.

## Activation Evidence

- Real Goal sequences 206-207 proved Issue #107 correctly forced a fresh
  post-blocker `runtime.inspect` at a53.
- After Task261 advanced from 6c90 to evidence commit 381033c, sequences
  209-211 again selected `runtime.inspect` and repeated the blocker without
  reading the changed selected ref.
- The Task261 evidence itself is valid: PR #102 merged as 7067c1b, that exact
  release reached stable with zero failures, and real Feishu ingress was
  accepted while it remained resident. Task265 does not change that evidence
  or its acceptance semantics.

## Implementation Evidence

- The derived view has no persisted owner and distinguishes `unbound`,
  `aligned`, `changed_unobserved`, and `unavailable`. Live inspection reuses
  repository authority and requires the same worktree, Git common directory,
  and branch.
- Execution-scoped tool observations receive a harness-owned post-tool HEAD
  marker. Control-scoped `runtime.inspect` does not receive one, so it cannot
  accidentally clear an unobserved worktree advance.
- GoalRuntime derives the most recent observed HEAD from existing canonical Git
  changes, verification snapshots, and the new post-tool marker. The view is
  rendered outside Canonical Evidence and is absent from terminal receipts.
- Focused GoalRuntime, cognition-adapter, and freshness tests passed 38/38
  before the full run. `pnpm run check` then passed on 2026-07-19: TypeScript
  build, 1008/1008 tests, active Skill validation, and neutral naming across
  134 implementation files. `git diff --check` also passed.
- Independent review of `f6b06de` found two P2 freshness-loss paths: a failed
  execution-scoped tool result did not advance the observed HEAD, and an
  output larger than the canonical 80,000-character bound dropped the
  workspace marker. Regression tests reproduced both failures before the fix.
- Workspace observations and harness verification snapshots now remain usable
  for freshness even when the tool's domain result fails. Oversized canonical
  results preserve only a strictly parsed harness-owned marker; a forged
  authority marker remains ignored. The post-review focused suite passed, and
  the final `pnpm run check` again passed 1008/1008 tests plus build, active
  Skill validation, and neutral naming across 134 implementation files.
- A second independent review of `5454f05` found no remaining actionable
  defect in behavior or the freshness-routing contract; its reviewer also ran
  the relevant GoalRuntime tests and TypeScript build successfully.
