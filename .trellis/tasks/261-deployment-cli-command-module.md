# Task 261: Deployment CLI Command Module

Status: active

## Identity And Ownership

- Issue: GitHub Issue #101, deployment CLI command module.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Decision Owner / authority basis: Issue #101 and the operator-authorized
  bounded engineering execution.
- Capability layer: basic-entrypoint.
- Base: `a0f5ce17195c5d884606c29ea8be90a751cc9a17` on `develop`.
- Branch/worktree: `codex/issue-101-deployment-cli-module` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/issue-101-deployment-cli-module`.

## Problem, Outcome, And Boundaries

`apps/cli/src/main.ts` directly owns the full deployment execution branch,
mixing command dispatch with service selector/definition resolution, typed
controller-handoff recovery, deployment mutation, and output rendering. The
outcome is one small deployment-command Interface with a deep module that owns
that complete vertical path. `main.ts` retains only its existing top-level
command dispatch and delegates the deployment command once.

- Reuse the existing deployment and service APIs and preserve observable CLI
  actions: request, reconcile, controller-handoff, status, fail, and history.
- Remove the replaced deployment branch from `main.ts`; do not leave a second
  owner, compatibility dispatcher, command registry, framework, or facade.
- Do not broadly alter `parseArgs`, `CliOptions`, `printUsage`, governance,
  scorecard, iteration, or retirement surfaces.
- The bounded Codex source-edit tranche performs no deployment, restart,
  external action, state migration, dependency change, or public API
  expansion. This does not remove the Issue-level integration and exact
  deployment acceptance owned by Evi and the task harness after source review.

## Design, Data, And Recovery

- The module receives only deployment-relevant CLI options through its small
  Interface. It remains the sole CLI owner for deployment execution; runtime
  deployment APIs remain the owner of ledger state and transitions.
- Authoritative inputs are parsed CLI options and existing local service
  selectors/definitions. Command output remains derived from those APIs.
- Existing CLI parser, controller-handoff, and deployment-supervisor tests are
  supporting regression evidence, but they do not exercise the new CLI module
  boundary. Add a focused `tests/deployment_command.test.ts` (or an equally
  narrow replacement) that invokes the public deployment command Interface and
  asserts CLI-visible JSON/exit or error behavior for safe representative
  paths. Do not copy the module's internal forwarding sequence into tests.
- Rollback is a normal revert of the source commit; no runtime state is
  touched by this work.

## Verification And Budgets

- Run the new deployment-command boundary test plus targeted CLI/controller/
  deployment tests, TypeScript build, `git diff --check`, and full
  `pnpm run check`.
- Inspect the final diff for one deployment execution owner and no accidental
  change outside the stated scope.
- The bounded Codex implementation tranche has one main owner and no
  subagents, retries, deployment, push, PR, merge, or external mutation. It may
  hand off one local implementation commit only after the source evidence
  passes.
- After source acceptance, Evi remains the outcome owner for the separately
  evidenced integration tranche: publish the isolated branch, open and review
  the PR, merge only the accepted head, deploy the exact merge commit, verify
  healthy/current runtime and live Feishu ingress, and preserve rollback refs.
  External effects remain subject to the GoalRuntime effect policy and exact
  operator confirmation where required.
- Completion requires a separately evidenced implementation commit; this
  activation commit does not claim Issue #101 acceptance.

## Activation Evidence

- Issue #101 scope was supplied to this bounded execution as replacing the
  deployment path with a small-Interface, deep command module.
- Prior Task260 has merged/deployed/live closure evidence at exact `develop`
  commit `a0f5ce17195c5d884606c29ea8be90a751cc9a17` before this activation.
- This task file and Task260 status closure are the only activation changes.

## Pre-Commit Verification Evidence

- Real Feishu Goal `goal_20260718155814_357c4361` dynamically bound this
  worktree and delegated the source implementation to Codex. GoalRuntime later
  read the new module and test, inspected the `main.ts` diff and full Git
  status, and independently verified the owner boundary rather than accepting
  the delegated result as completion.
- `tests/deployment_command.test.ts` passed 2/2 and exercises the public module
  Interface for default status, read-only history JSON/exit behavior, and the
  existing missing-reason error.
- Existing CLI parsing tests passed 78/78 and deployment supervisor tests passed
  15/15 through canonical Goal command observations with unchanged Git
  snapshots.
- After adding the boundary test, `pnpm run check` passed on 2026-07-18:
  TypeScript build, 978/978 tests, active Skill validation, and neutral naming
  across 132 implementation files. `git diff --check` also passed.
- Codex's linked-worktree sandbox could modify source but could not write the
  shared Git metadata needed for a commit. The main harness therefore owns the
  exact local commit handoff; this does not widen Codex sandbox authority or
  change the four-file implementation scope.
