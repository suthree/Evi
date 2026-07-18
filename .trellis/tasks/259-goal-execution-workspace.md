# Task 259: Goal Execution Workspace Binding

Status: active

## Identity And Ownership

- Issue: GitHub Issue #97, `feat(goals): bind a lazy isolated execution
  workspace to one Goal`.
- Parent outcome: GitHub Issue #56 and the operator-approved persistent Goal to
  reach a real Feishu-to-Codex self-evolution OutcomeReceipt.
- Decision Owner / authority basis: the operator explicitly approved the
  end-to-end Goal on 2026-07-18. Evi owns later capability choice and outcome
  acceptance; the current Codex supervisor owns this prerequisite delivery and
  its completion evidence.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Capability layer: core GoalRuntime execution placement.
- Base: `47b0cef581470730f28d0fff580d3e2c151c9765` on `develop`.
- Branch/worktree: `codex/issue-97-goal-execution-workspace` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/97-goal-execution-workspace`.
- Milestone/version: parent #56 foundation program; no release claim.

## Observed Problem And Desired Outcome

Resident Feishu ingress constructs GoalRuntime with the main checkout as its
repository root. New Goals therefore persist the main checkout as immutable
`repository_authority`, while the existing `codex.run` contract correctly
rejects main checkouts and requires a registered sibling linked worktree. The
Capability Portfolio now reports this accurately, but Evi has no Goal-owned
action that can prepare and bind the missing execution workspace. The stopped
Goal `goal_20260718095412_0225d325` consequently used 24 direct reads and
reached no receipt; it must remain untouched.

The desired outcome is one deep execution-workspace Module plus one atomic
`workspace.prepare` capability. The Goal retains its original main checkout as
control-plane authority for Continue and Resume. A successful canonical tool
observation derives and binds exactly one isolated execution workspace for
later repo tools and `codex.run`. Capability choice remains dynamic and no
ingress classifier or second Goal is introduced.

## Scope And Acceptance

- Reuse `GoalRepositoryAuthority`, AgentStore, core tool contracts, Capability
  Portfolio, EffectPolicy, canonical Goal events, existing Git/Codex authority
  checks, and temporary real-Git fixtures.
- Add one execution-workspace Module whose small prepare Interface hides Git
  inspection, derived path, branch/base checks, worktree creation,
  failure-recovery cleanup, and returned authority.
- Add one strict `workspace.prepare` direct atomic capability. It accepts no
  arbitrary path, derives a sibling under `.worktrees/`, requires a clean main
  control checkout, a fresh `codex/issue-N-slug` branch, and the Goal start HEAD
  as base.
- Persist no registry. The successful canonical observation is the fact;
  `GoalView.execution_workspace` and checkpoint projections are rebuildable.
- Permit at most one matching binding. Reject a duplicate or mismatch before
  mutation.
- Continue and Resume validate the original `repository_authority`. After
  binding, repo-scoped tools and `codex.run` use the execution workspace while
  state-scoped tools retain the canonical state root.
- Portfolio readiness renders `workspace.prepare` only when meaningful and
  changes `codex.run` to available after binding, without task keywords or an
  extra model call.
- Historical Goal events without workspace evidence remain replayable.
- Tests cover success, invalid branch/base, dirty control checkout, duplicate
  binding, failed-prepare recovery, canonical replay, repo/state scoping, and
  post-bind Codex readiness.

## Architecture, Reuse, And Complexity

- The external seam is one prepare operation with a bounded input and typed
  result. Its implementation uses local Git as a substitutable dependency;
  interface tests use temporary real repositories rather than introducing a
  hypothetical Git adapter.
- GoalRuntime continues to own lifecycle and canonical evidence. The Module
  owns only the local preparation transaction; it owns no Goal state,
  completion, cleanup scheduler, or capability choice.
- The existing `repository_authority` remains the control checkout provenance.
  The derived execution workspace is separate, additive, and immutable after
  its first successful observation. This avoids silently rebinding command
  authority while allowing later tools to use the selected execution target.
- Goal tool execution receives a bounded execution context and chooses a
  repo-scoped AgentStore only after binding. State root identity never moves.
- This is a replacement of the current all-tools-use-construction-store
  assumption, not a forwarding facade. No second dispatcher or duplicate
  event ledger is added.

## Data, Effects, Compatibility, And Recovery

- Canonical inputs are the Goal id, original control repository authority,
  requested fresh branch, requested exact base, live clean Git status, and
  live Git worktree registration.
- The worktree directory is derived under the control checkout `.worktrees/`
  root. Fixtures are synthetic temporary Git repositories.
- Preparation is a bounded reversible local mutation. EffectPolicy names it
  separately from destructive cleanup; the tool cannot remove existing
  worktrees or branches.
- The strict argument schema rejects unknown fields before dispatch. Branch
  ownership and the derived directory are acquired before checkout. A failed
  creation removes only artifacts owned by that attempt when their identity is
  still provable; concurrent, pre-existing, or uncertain artifacts are
  preserved and incomplete rollback is reported.
- Event parsing is additive. No historical event or receipt migration and no
  dual write are allowed.
- Source rollback is a normal revert PR and exact-commit redeploy. A live
  acceptance worktree is cleaned only after the Goal is terminal or abandoned
  and its evidence is preserved.

## Non-Goals And Budgets

- No GitHub Issue creation, commit, push, PR, merge, deployment, worktree
  release, branch deletion, Feishu continuation/confirmation command,
  `main.ts` split, LearningRuntime promotion, LuBan change, `main` merge, tag,
  release, or publication.
- No task classifier, ingress-time preparation, second cognition call,
  planner, queue, scheduler, database, workspace registry, or alternate Goal
  owner.
- Do not resume, rewrite, or complete the stopped historical Goal.
- One Issue, one task, one branch/worktree, one PR, and no implementation
  subagents. Independent read-only Standards/Spec reviewers are permitted by
  the repository review Skill; they own no code or integration. Retry only a
  concrete failing check, review finding, integration, or deployment step.

## Verification And Completion

- Add interface and GoalRuntime integration tests before claiming the seam.
- Run the focused execution-workspace, GoalRuntime, capability-portfolio,
  cognition, tool, ingress, and replay tests affected by the change.
- Run TypeScript build, `git diff --check`, and full `pnpm run check`.
- Audit the final owner surface and ensure paired English/Chinese docs change
  only if observable architecture or runtime behavior changes.
- Commit, push, open a PR to `develop`, review, merge, exact-commit deploy,
  complete probation/controller handoff, and verify healthy/current runtime.
- Live acceptance starts a fresh Goal through resident Feishu ingress, proves
  one successful execution-workspace binding and post-bind Codex readiness,
  then leaves later delegation/continuation work to the next child.
- Close Issue #97 and this task only from linked source, test, GitHub, live
  runtime, and cleanup evidence.

## Implementation Evidence

Pre-live implementation checkpoint on 2026-07-18:

- `packages/runtime/src/goal_execution_workspace.ts` owns the one-operation
  prepare Interface, strict branch/base/control checks, ignored derived path,
  real Git creation, returned authority, and identity-safe failed-attempt
  rollback.
- GoalRuntime derives `execution_workspace` only from a successful canonical
  observation, keeps the original control authority and state root, rejects a
  second selection, and live-validates both authorities before later execution.
- Capability Portfolio exposes `workspace.prepare` only while meaningful,
  flips `codex.run` readiness after binding, keeps the candidate set bounded
  without displacing an existing core tool, and adds no keyword mapping or
  persisted owner.
- Focused real-Git, Portfolio, and GoalRuntime suite: 49 tests passed.
- Full `pnpm run check`: build passed; 969 tests passed; 0 failed; active Skill
  validation passed; neutral naming passed across 131 implementation files.
- The first independent Standards/Spec review found canonical isolation,
  strict-argument, concurrent rollback-ownership, duplicated branch rule, and
  store-placement drift risks. The implementation now uses one strict shared
  schema, observation/action/derived-path/live-authority checks, atomic branch
  plus path ownership with explicit cleanup failure, and contract-owned store
  placement; focused probes cover each regression before re-review.
- Standards re-review then found one retained moved-branch path that was safe but
  under-reported. A real failing post-checkout hook now proves the moved branch
  is preserved and the incomplete rollback is explicit in tool evidence.
- `git diff --check` passed. No live-runtime or Feishu acceptance claim has yet
  been made; Issue #97 and Task 259 remain active until merged exact-commit
  deployment and the fresh resident Goal probe succeed.
