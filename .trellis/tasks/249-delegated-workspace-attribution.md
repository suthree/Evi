# Task 249: Delegated Workspace Attribution

Status: active

## Identity And Ownership

- Issue: GitHub Issue #76, `feat(goals): bind delegated workspace changes to
  one repo authority`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth under
  the persistent GoalRuntime direction. Codex intervenes because repository
  authority, delegated-change attribution, and outcome acceptance are control-
  plane boundaries Evi must not self-approve before the seam exists.
- Owner repository and implementation owner: Evi repository; the current Codex
  supervisor owns this bounded core repair and its completion claim.
- Capability layer: core runtime delegation and outcome attribution.
- Base: `f8eb089527564815da8f92cb33e20cbae58575df` on `develop`.
- Branch/worktree: `codex/issue-76-delegated-workspace-attribution` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/76-delegated-workspace-attribution`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Evidence

Task248's live continuation completed with accepted receipt
`goal_receipt_20260717202714_913dc41e`. The receipt found that `codex.run`
already fixes its linked-worktree authority, independently inspects Git status,
and returns `workspace_changes.introduced_changed_paths`. Existing tests also
prove those actual paths can differ from the model-authored
`result.changed_files` claim.

GoalRuntime still projects only an optional singular `result.output.change`.
It neither consumes actual plural Codex paths nor binds the Goal identity to the
repository/worktree in which mutation and verification occur. Because each CLI
command constructs a runtime from its current `--repo-root`, the same Goal can
otherwise be continued under another checkout and attach a successful local
verification to path identities from a different worktree.

## Architectural Outcome

Make repository placement part of Goal identity and make delegated mutation a
canonical, plural, verification-gated observation:

- Newly started Goals persist an immutable bounded Git repository authority
  derived from the configured real worktree. Later Continue and exact-effect
  confirmation validate it before cognition or dispatch.
- Historical starts without authority remain parseable and readable. They are
  not silently rebound; mutating continuation fails closed with an explicit
  legacy-authority reason. Completed/abandoned history remains inspectable.
- `codex.run` emits canonical plural changes only from fixed live Git
  `introduced_changed_paths`. It records comparison diagnostics against
  structured `changed_files`; self-report never grants change authority.
- GoalRuntime consumes plural changes into evidence, candidate lineage, and the
  receipt while retaining singular `output.change` compatibility for existing
  tools and historical observations.
- Completion involving delegated workspace changes requires a later successful
  local verification observation under the same Goal authority.

Repository authority, path attribution, and later verification are one
contract: splitting them would allow an apparently verified receipt whose
commands and mutations belong to different worktrees.

## Scope And Stable Owners

- `packages/runtime/src/goal_runtime.ts` owns persisted Goal repository
  authority, command validation, plural evidence lineage, and the completion
  gate.
- `packages/runtime/src/tools.ts` owns authoritative Codex workspace difference
  output and untrusted self-report comparison.
- Existing AgentStore `repoRoot`, Node Git process helpers, `ToolResult`, raw
  Goal events, verifier, and receipt projections are reused.
- Focused GoalRuntime/tool tests and paired runtime docs change only where the
  observable contract requires it.
- Task248 completion is recorded in this transition commit; no evidence-only
  PR is created.

## Acceptance

- New isolated-worktree Goals persist and expose one real Git authority and can
  continue from that exact worktree.
- Continuing or confirming an effect from another worktree/common root/branch
  fails before cognition or effect execution.
- Legacy Goal history parses and reads; its no-silent-rebind continuation policy
  is explicit and deterministic.
- Actual introduced Codex paths become canonical plural changes when the model
  claims no files or wrong files, with deterministic missing/extra diagnostics.
- Existing singular tool changes continue to work.
- Delegated workspace changes fail outcome verification without a later
  successful local verification observation and pass that gate when the later
  observation is present under the bound authority.
- Targeted tests, `pnpm run check`, diff audit, independent Spec/Standards
  reviews, PR integration, exact-commit deployment, health, and controller
  identity pass.
- A fresh Goal bound to a new isolated worktree reaches confirmed `codex.run`,
  observes canonical introduced paths, and uses later local verification in its
  own completion trajectory.

## Reuse, Complexity, And Data Contract

- Reuse the Codex authority and Git-status inspection semantics already in
  `tools.ts`; extract only a small shared repository-authority seam if direct
  reuse would otherwise duplicate Git truth.
- The smallest coherent identity is the real worktree root, Git common dir,
  branch, and start HEAD. Later dirty paths may change; the bound repository
  placement must not. Start HEAD is provenance and the delegated base, not a
  permanent prohibition on an explicitly supervised later commit.
- Canonical delegated changes are repository-relative paths from bounded live
  `git status --porcelain=v1 -z` before/after snapshots. They do not read file
  bodies and retain the existing 200-path observation bound.
- Model `changed_files` is untrusted diagnostic input. Fixture and mock Git
  responses in tests are labeled synthetic; live acceptance uses a real linked
  worktree.
- No second repository registry, event store, evidence graph, or verification
  service is introduced.

## Migration, Compatibility, And Retirement

- Additive optional parsing keeps version-2 historical `goal_started` events
  readable; new starts always write authority.
- No historical event, checkpoint, or receipt is rewritten.
- Singular `change` remains accepted until existing tools are migrated through
  measured child work; plural changes are canonical when present.
- The legacy continuation exception is not a permanent compatibility mode. It
  allows read/terminal inspection only and must not fabricate authority.

## Authority, Effects, And Non-Goals

- This task does not widen `codex.run` authority. Its exact local-write effect
  remains confirmation-gated, and Codex remains an implementation worker rather
  than completion owner.
- No IM/Web/daemon cutover, adoption, LearningRuntime, PR automation, new
  planner, broad Git framework, raw evidence window expansion, main merge, tag,
  release, publication, secret export, or destructive remote effect.

## Budgets, Verification, And Rollback

- Execution budget: one bounded implementation path, no new subagents, and only
  concrete test/review repair retries.
- Red loop: focused tests first fail for cross-worktree continuation, legacy
  continuation, introduced-path/self-report divergence, plural lineage, and
  missing post-change verification.
- Full verification: typecheck, `git diff --check`, `pnpm run check`, final diff
  audit, and independent Spec/Standards reviews.
- Live verification: deploy the exact merged commit, prove healthy resident and
  controller identity, then run a fresh Goal against a fresh linked worktree.
- Rollback: revert through a normal PR and redeploy the previous stable commit.
  Additive events remain readable, and no history or worktree is deleted.
