# Task 233: Commit-bound build and deployment transaction

- Status: active
- Linked Issue: #30 — https://github.com/suthree/Evi/issues/30
- Milestone / target version: local v0.1 core runtime delivery contract; no milestone
- Owner repository: suthree/Evi
- Implementation owner: Evi; supervisor Codex owns only the recorded minimal bootstrap override below
- Decision Owner: operator direction in Issue #30; applied by Evi except for the recorded supervisor bootstrap override
- Capability layer: core
- Base commit: 571b3757031b72e39e069ce1231379bd0151f816
- Branch: codex/issue-30-commit-bound-deployment
- Worktree: /Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/30-commit-bound-deployment

## Observed problem and evidence

The installed runtime, deployment ledger, and repository can name three different
commits after a manual bootstrap. At activation the live facts were repository
`develop@571b375`, resident `current@d6e8f2e`, `previous@9deb980`, and deployment
ledger `current@8812570` with status `recovered`. The ledger mismatch caused the
Issue #27 rollback drill to fail closed and currently prevents a transactional
deployment request from recognizing the healthy resident as known-good.

Two source-level ownership overlaps enable the drift:

- `service install/start/restart` call `writeServiceFiles()`, which stages repo
  `dist` and activates it as `current`, bypassing the deployment request and
  supervisor transaction.
- `deployment request` stages whatever repo `dist` already contains, then writes
  build metadata from the current Git identity. A stale `dist` can therefore be
  labeled as a newer clean commit; that occurred during the preceding bootstrap.

## Desired outcome and acceptance

One local delivery contract owns the route from source commit to live bundle:

1. A deployment request performs a fresh bounded build while the repository
   remains on the same clean commit, then stages that output.
2. Service install/start/restart preserve an already usable `current` bundle;
   they manage launchd and installed service files but do not deploy repo source.
3. First installation may build and bootstrap only when no usable `current`
   bundle exists.
4. `deployment reconcile` explicitly adopts the actually running bundle as a
   stable baseline only with a non-empty reason, verification refs, commit-bound
   clean build metadata, matching fresh heartbeat, and configured Web/IM
   readiness. It retains the superseded deployment history.
5. Existing next/current/previous activation, probation, automatic rollback,
   operator rollback, evidence capture, and repair-chain limits remain intact.
6. Focused service/deployment/CLI tests and the full repository gate pass.
7. PR integration to `develop`, live transactional deployment, stable health,
   rollback proof, and one smaller post-deploy iteration are linked before the
   task is complete.

## Scope and non-goals

Scope is the service/deployment ownership split, fresh-build gate, explicit live
baseline reconciliation, CLI contract, tests, and paired operator documentation.
The task may make additive deployment-record fields needed for adoption evidence.

Non-goals: no `main` merge, tag, release, remote deployment, hosted control
plane, containerization, incompatible state migration, LuBan change,
`delegate_agent` expansion, public communication, global Codex configuration
change, or unrelated cleanup. The independent supervisor remains the bounded
local activation/rollback controller; this task does not create a second
supervisor framework.

## Architecture and reuse assessment

- Stable owner surfaces: `packages/runtime/src/service.ts` owns installed bundle
  and launchd lifecycle; `packages/runtime/src/deployment.ts` owns candidate
  build/staging and deployment records; `service_supervisor.ts` continues to own
  activation, readiness, probation, and rollback.
- Reuse the existing `stageServiceRuntimeBundle`, next/current/previous slots,
  `ServiceRuntimeBuild`, heartbeat, supervisor manifest, JSON deployment ledger,
  and existing service/deployment CLI. Do not introduce a package, daemon,
  database, queue, or release framework.
- The smallest coherent design moves implicit repo-to-current mutation out of
  ordinary lifecycle restart, adds one fresh-build preparation helper, and adds
  one explicit reconciliation command rather than weakening known-good checks.
- Source facts are current Git identity, compiled output created in the same
  command, installed build metadata, heartbeat, supervisor manifest, and local
  deployment records. Tests use temporary synthetic repos/bundles and must be
  labeled as deterministic test evidence rather than live deployment proof.

## Compatibility, recovery, and retirement

- State schema remains version 1. Reconciliation fields are additive.
- Existing installed bundles without new fields remain readable.
- A failed fresh build or changed/dirty source commit leaves the running bundle
  untouched and creates no pending deployment request.
- A failed reconciliation leaves the ledger unchanged.
- Code rollback is a single-PR revert. Runtime rollback remains the existing
  current/previous supervisor path; live deployment must preserve the previous
  known-good bundle.
- The reconciliation escape hatch is retained only for explicit recovery from
  verified ledger drift. Normal delivery uses `deployment request`; repeated
  reconciliation in ordinary delivery is a defect signal, not a shortcut.

## Authority and budgets

- Evi owns scope, review, verification, commit, PR, merge to `develop`, deploy,
  rollback, and completion. Codex CLI may analyze/implement only inside this
  recorded worktree and cannot claim completion or perform GitHub/deployment
  effects.
- External effects authorized by the operator: GitHub Issue/branch/push/PR/
  merge for this bounded change and local resident deployment/restart/rollback.
  `main`, tags, releases, public publication, and secret transmission remain
  prohibited.
- Context budget: compact docs plus selected service/deployment source and tests;
  do not load unrelated archives.
- Execution budget: one worktree, one primary implementation thread, at most
  three bounded correction resumes, no subagents, no parallel file owners.
- Command budget: focused tests first, one full `pnpm run check` before commit,
  repeat relevant checks after correction, and bounded polling during live
  activation/probation.
- Timeouts/output: build/check commands use repository defaults with bounded
  captured output; live deployment uses the existing 90-second readiness and
  60-second probation windows.

## Recorded minimal bootstrap override

- Decision Owner: the operator, through the pasted experiment contract and the
  follow-up instruction to continue through PR, merge, deployment, and
  iteration.
- Authority basis: the experiment contract permits the supervisor to implement
  a minimal bootstrap only when Evi cannot make progress with its foundational
  Codex execution path. Evi accepted the real Web task
  `runtime_task_20260717013817_10f48a18`, selected typed `codex.run` with
  `gpt-5.6-sol`, profile `fast`, reasoning `xhigh`, sandbox `workspace-write`,
  and approval policy `never`, but two bounded delegated runs exhausted their
  output budget without changing the worktree. The queue then exhausted its
  three attempts because the working checkpoint did not retain the returned
  typed Codex resume handle.
- Superseded constraint: only for this bootstrap slice, supervisor Codex may
  implement the already accepted Issue #30 service/deployment transaction in
  the assigned worktree. This does not count as an Evi self-iteration or as
  satisfying the pasted goal's first or second self-evolution loop.
- Scope: the Issue #30 files listed by the final diff, paired runtime docs, and
  tests. No LuBan, `main`, global Codex config, public communication, unrelated
  cleanup, or delegation redesign is authorized here.
- Evidence and risk: delegated sessions
  `session_20260717013818_8566395b` / Codex thread
  `019f6dba-1e2a-7441-954c-2f230a5ac6cc` / result digest
  `b8958094f18c110987cde703722d93e0d67eefd41f4f220849b7dae3c2c42027`
  and `session_20260717014105_b6fc4344` / Codex thread
  `019f6dbd-d8b0-7a82-84db-c5f3d776b149` / result digest
  `b47aaa8e1eddb87b4966d5503bbfdcd3443eb79f152e3d0950c649602acf3bf2`
  both produced no repository diff. Direct implementation risks confusing
  bootstrap evidence with Evi-owned completion, so final reporting must keep
  them separate.
- Verification: focused service/deployment/CLI tests, full `pnpm run check`, PR
  review, clean-root merge, live reconciliation, transaction deployment,
  health/readiness evidence, and a real rollback/redeploy drill.
- Rollback/retirement: revert the bounded PR and use the existing
  current/previous service rollback. This override expires when the deployed
  runtime completes a smaller Evi-owned Codex iteration; if that cannot be
  proved, the experiment remains incomplete at the operator checkpoint.

## Verification and completion evidence

Targeted checks:

- `pnpm exec tsx --test tests/service.test.ts tests/deployment_supervisor.test.ts tests/cli.test.ts`
  passed 102/102 on 2026-07-17 and proves lifecycle ownership,
  fresh-build/reconciliation behavior, and CLI shape.
- `git diff --check` proves patch hygiene.
- `pnpm run check` passed on 2026-07-17: TypeScript build, 868/868 tests,
  active-vault skill validation, and neutral naming validation across 123
  implementation files.

Live completion requires:

- Issue #30, this task, branch/worktree, commit, PR, review, and merge refs;
- an explicit reconciliation receipt for the verified current baseline;
- a new deployment request whose build and source commit match;
- supervisor activation, readiness, probation, stable record, fresh heartbeat,
  running Web and connected IM, and `service health` reporting deployment current;
- rollback evidence through a live bounded drill or a clearly identified
  deterministic proof if a destructive live failure signal is not justified;
- one smaller follow-up iteration performed by the newly deployed runtime.
