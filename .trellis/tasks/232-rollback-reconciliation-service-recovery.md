# Task 232: Rollback reconciliation service recovery

- Status: active
- Checkpoint: Evi independent review complete — commit decision approved
- Linked Issue: #27 — https://github.com/suthree/Evi/issues/27
- Milestone / target version: not applicable — Issue #27 has no milestone; second-round bounded recovery
- Owner: Evi
- Implementation owner: new Evi resident runtime
- Decision Owner: operator + accepted Issue #27
- Capability layer: core
- Base: 9deb980bd3e34070a51b3ca8ac5ea77d3f60a543
- Branch: codex/issue-27-rollback-recovery
- Worktree: /Users/agi00079/Documents/GitHub/suthree/Evi-issue-27-rollback-recovery

## Observed problem

Issue #27 records that a rollback reconciliation rejection stops the runtime
launchd and deployment supervisor, swaps runtime identities back in the catch
path, and rethrows the original error without restarting either service. The Web
service consequently remains down and needs manual `service start` recovery.

## Desired outcome and acceptance

After a reconciliation failure and successful catch-path swap-back, attempt
restart of the runtime/launchd and, when its manifest applies, the deployment
supervisor before preserving and rethrowing the original reconciliation error.
Tests must demonstrate restored bundle identities, both applicable restart
attempts, caller visibility of the original error, and unchanged successful
rollback behavior.

## Scope and non-goals

Scope is the minimal rollback reconciliation catch-path recovery: after
swap-back, restart the runtime and supervisor while preserving the original
reconciliation error. Do not bypass the deployment ledger; do not alter the
successful rollback path; do not change `delegate_agent`; do not change LuBan;
do not redesign the broader service lifecycle.

## Dependencies, architecture, and gates

Depends on Issue #27 and this registered isolated worktree. The stable owner
surface is the runtime service rollback flow. Inspect and reuse its existing
restart helpers; no new framework, service, dependency, scheduler, or ledger
semantics are authorized. No external or sensitive-data effects are authorized.

## Delivery contract

- Reuse and complexity: choose the smallest coherent catch-path addition using
  existing runtime and supervisor restart mechanisms.
- Data/source contract: current service source, existing tests, Issue #27, and
  local Git evidence are authoritative; no synthetic runtime-success claim.
- Compatibility: retain ledger mismatch rejection, identity restoration, and
  normal successful rollback semantics.
- Verification: run focused rollback/service tests, the proportionate full
  repository check, and `git diff --check`; inspect the final diff independently.
- Rollback: use one single-commit revert of only this bounded recovery change;
  retain the ledger rejection and pre-existing swap-back behavior.
- Completion evidence: bind task, Issue, branch/worktree, one commit, focused
  checks, full check, diff check, and independent review before claiming done.

## Execution authority and budgets

The implementation surface is a single new Evi resident execution through typed
`codex.run`, using `gpt-5.6-sol`, profile `fast`, reasoning `xhigh`, service
tier `fast`, sandbox `workspace-write`, and approval `never`. Codex has no
completion, commit, push, PR, merge, deploy, publication, or authority beyond
the bounded workspace write. Evi remains the owner of review, verification,
commit decision, and completion. No `delegate_agent` use is in scope.

## Second-round operator checkpoint

This task is active/activated as the second-round operator checkpoint. Before
implementation, re-confirm this task's branch/worktree/base identity and inspect
current source/tests. Before integration, require the focused checks, full
check, diff check, final-diff review, a single bounded commit, and the evidence
links required by the engineering delivery contract.

## Bounded execution evidence

- Codex thread: `019f6b9d-d1a4-7591-baff-5e1042b440ee`; the bounded
  continuation resumed this recorded thread rather than starting another.
- Authority digests: new-run handle
  `f06345d8bce7a893237d5801da606f4f65445c5995e16daafeb2569e3869d589`;
  latest resumed handle
  `5b4a532c2774bc47741aeddfcb6f0d2ab19366657b888dc0f100cacc73aed164`.
- Effective authority: workspace-write implementation and local verification in
  the recorded worktree only; no completion, commit, push, PR, merge, deploy,
  publication, dependency installation, or additional-worktree authority. Evi
  independently owns review, commit decision, and completion.
- Identity check: worktree root
  `/Users/agi00079/Documents/GitHub/suthree/Evi-issue-27-rollback-recovery`,
  branch `codex/issue-27-rollback-recovery`, base/HEAD
  `9deb980bd3e34070a51b3ca8ac5ea77d3f60a543`.
- Implementation: the reconciliation catch path swaps the bundle back, attempts
  runtime launchd recovery, conditionally attempts deployment-supervisor
  recovery when its manifest exists, and rethrows the original reconciliation
  error. The normal success path and deployment-ledger default remain intact.
- Regression coverage added for restored current/previous identities, runtime
  and supervisor bootstrap attempts (including continued supervisor recovery
  after a runtime recovery failure), original error identity, and the existing
  successful rollback path.
- Focused check: after Evi restored the dependency projection offline,
  `pnpm exec tsx --test tests/service.test.ts` passed all 15 tests with 0
  failures, including rollback success and reconciliation-failure recovery;
  the resumed bounded execution repeated the same focused check with the same
  15/15 result.
- Diff check: `git diff --check` passed after the implementation and task
  evidence updates.
- Evi independent review: session `session_20260716155716_9646cdfe` executed the
  bounded review script with exit 0 and terminal marker
  `ISSUE27_INDEPENDENT_REVIEW_PASS`; focused tests passed 15/15 and full
  `pnpm run check` passed 865/865. Root remained clean `develop@d6e8f2e`, LuBan
  remained clean at `e7243257`, and `delegate_agent` owner paths had zero diff.
