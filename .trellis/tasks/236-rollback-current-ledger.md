# Task 236: Rollback recovery canonical current ledger

## Status

Implementation and focused regression evidence are ready for main-harness review. Evi retains completion, commit, push, PR, merge, and deployment authority.

## Issue

GitHub Issue #38: Fix rollback recovery canonical current deployment ledger.

## Problem

Following an automatic deployment rollback, `completeRecovery` currently leaves the failed candidate as `deployments/current.json` with `status=recovered`. Although the stable deployment has been restored, the next verified deployment is refused until a manual reconcile.

## Required behavior

Within the rollback transaction, make the restored stable deployment the canonical `deployments/current.json`. Preserve the failed candidate in recovery evidence and history, rather than as the canonical current deployment.

## Acceptance criteria

1. An automatic rollback restores the prior stable deployment as canonical current.
2. Recovery evidence/history retains the failed deployment candidate and recovery context.
3. A subsequent verified deployment proceeds without manual reconcile solely due to the completed automatic rollback.
4. Focused deployment-supervisor regression coverage proves the behavior.
5. Existing deployment-supervisor semantics remain intact.

## Constraints

- Restrict implementation to this deployment-supervisor defect and associated focused tests.
- Do not alter unrelated lifecycle, GitHub, service, or deployment behavior.
- Do not create worktrees, commit, push, open/merge PRs, deploy, or claim final completion from Codex.

## Implementation evidence

- `completeRecovery` archives the failed candidate as `recovered`, including its failure context, evidence refs, and repair task id.
- The restored prior stable deployment becomes the atomic `deployments/current.json` record; when no earlier stable ledger exists, recovery derives a distinct stable record from the verified restored bundle.
- The failed candidate remains excluded from redeployment through its `recovered` history record, while the restored stable current record supplies commit-bound known-good evidence for the next deployment request.

## Focused verification evidence

- Passed `node --import tsx --test tests/deployment_supervisor.test.ts` (8 tests).
- Passed `pnpm exec tsc -p tsconfig.json --noEmit`.
- Passed `git diff --check`.
