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
- No deployment, restart, external action, state migration, new dependency,
  or public API expansion.

## Design, Data, And Recovery

- The module receives only deployment-relevant CLI options through its small
  Interface. It remains the sole CLI owner for deployment execution; runtime
  deployment APIs remain the owner of ledger state and transitions.
- Authoritative inputs are parsed CLI options and existing local service
  selectors/definitions. Command output remains derived from those APIs.
- Existing CLI parser tests and deployment-supervisor tests are regression
  evidence; any added tests target observable module behavior, not an internal
  forwarding sequence.
- Rollback is a normal revert of the source commit; no runtime state is
  touched by this work.

## Verification And Budgets

- Run targeted CLI/deployment tests, TypeScript build, `git diff --check`, and
  full `pnpm run check`.
- Inspect the final diff for one deployment execution owner and no accidental
  change outside the stated scope.
- One main owner; no subagents, retries, deployment, push, PR, merge, or
  external mutation. Commit locally only after the evidence passes.
- Completion requires a separately evidenced implementation commit; this
  activation commit does not claim Issue #101 acceptance.

## Activation Evidence

- Issue #101 scope was supplied to this bounded execution as replacing the
  deployment path with a small-Interface, deep command module.
- Prior Task260 has merged/deployed/live closure evidence at exact `develop`
  commit `a0f5ce17195c5d884606c29ea8be90a751cc9a17` before this activation.
- This task file and Task260 status closure are the only activation changes.
