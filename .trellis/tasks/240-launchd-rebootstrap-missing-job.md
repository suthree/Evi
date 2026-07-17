# Launchd Missing-Job Re-bootstrap During Candidate Activation

Status: review / integration requested; the rebased implementation and review evidence are recorded, but completion is not claimed

## Identity And Ownership

- Issue: [GitHub Issue #50, `Re-bootstrap missing launchd job during candidate activation`](https://github.com/suthree/Evi/issues/50).
- Milestone / target version: Issue #50 runtime activation repair; no release or deployment claim in this task.
- Owner repository: Evi.
- Implementation owner: bounded Codex CLI execution under the main harness.
- Decision Owner / authority basis: the operator-approved Issue #50 contract supplied by the main harness.
- Capability layer: basic-entrypoint.
- Original base (historical): `690c2e8f50c72146650fb043fb8937f7191565ff`.
- Integration baseline: `a373c4f99e48634c63055866910efcc4532419b0`.
- Rebased implementation commit: `9d253842bed0b42ee3737ffa40630f854fefc970`.
- Branch: `codex/issue-50-launchd-rebootstrap-missing-job`.
- Isolated worktree: `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/50-launchd-rebootstrap-missing-job`.

## Problem And Evidence

- Candidate activation bootstraps the runtime plist once and then retries `launchctl kickstart`.
- After a failed kickstart, `launchctl print gui/891670677/local.runtime.runtime` can report that the job is missing.
- The current retry loop delays and retries kickstart without restoring that missing launchd registration, so the remaining bounded attempts cannot recover it.
- Authoritative evidence for this repair is Issue #50 plus the checked-in supervisor source and focused injected-launchctl tests. Test launchctl responses, delays, bundles, and ledgers are synthetic fixtures and do not claim live runtime evidence.

## Outcome, Scope, And Acceptance

- After each failed kickstart that still has a remaining attempt, inspect the job with `launchctl print`.
- When the print reports the job missing, boundedly bootstrap the existing runtime plist before the next kickstart.
- Preserve the existing total kickstart-attempt limit, startup deadline, exponential kickstart delay, and activation rollback behavior.
- Emit typed start evidence that distinguishes re-bootstrap activity from kickstart failures.
- Add only the requested injected-launchctl/injected-delay regressions: one re-bootstrap success path and one exhaustion path.
- Scope: `packages/runtime/src/service_supervisor.ts`, `tests/deployment_supervisor.test.ts`, and this task record.
- Non-goals: no new launchd service or dependency, no broad lifecycle refactor, no manifest/schema migration, no root-checkout mutation, tag, or release. Push, pull request, merge, deployment, probation, controller update, and live rollback proof remain separate pending integration/runtime work.

## Design Discipline

- Reuse: the existing `startRuntime` kickstart loop, injected launchctl/delay dependencies, bounded bootstrap helper, start evidence, activation recovery, and focused deployment-supervisor fixtures.
- Complexity: one optional typed re-bootstrap evidence list and one missing-job branch inside the existing retry loop is the smallest coherent repair.
- Architecture impact: strengthens only the existing launchd adapter path inside the independent deployment supervisor.
- Dependencies / blockers / cross-repository links: Issue #50; no cross-repository work and no known implementation blocker.
- External effects / sensitive data / authority gates: repository-local source, test, and task-record writes only; no secrets, private-data egress, resident-runtime mutation, or external communication.
- Compatibility / migration: new evidence is optional so existing schema-version-1 deployment records remain readable; no persisted-state migration.
- Rollback path: revert this bounded diff; existing manifests, bundles, and deployment ledgers require no migration.

## Rebaseline

- The original base `690c2e8f50c72146650fb043fb8937f7191565ff` is retained as historical implementation context.
- The integration baseline is `a373c4f99e48634c63055866910efcc4532419b0`.
- The implementation was rebased and committed as `9d253842bed0b42ee3737ffa40630f854fefc970`.
- Decision: **RETAIN** the three-file Issue #50 repair because it remains independently scoped and required.
- Evidence separation: the post-rebase checks below support review of the unchanged rebased implementation commit only; they do not prove deployment, probation, controller update, or live rollback behavior.

## Review And Verification Evidence

- Evi completed a pre-rebase review of the bounded implementation; the focused deployment-supervisor suite passed `15/15`.
- Supervisor post-rebase checks ran outside the resident runtime:
  - `node --import tsx --test tests/deployment_supervisor.test.ts`: `15/15`, exit `0`.
  - `pnpm run check`: exit `0`, including build, `884/884` tests, skills validation, and neutral-runtime-naming validation.
  - `git diff --check`: exit `0`.
- Evi's review acceptance applies only while commit `9d253842bed0b42ee3737ffa40630f854fefc970` remains unchanged. Any implementation change requires renewed review and verification.

## Resident Containment Evidence

- Long resident verification exposed old-controller heartbeat/slot coupling.
- The official rollback path restored stable live runtime commit `1571967`.
- This is containment evidence only. It is not proof that Issue #50 was deployed, completed probation, updated the controller, or produced live rollback proof for the Issue #50 implementation.

## Pending Integration And Runtime Evidence

- Push, pull request, merge, deployment, probation, controller update, and live rollback proof remain pending.
- Issue #50 completion is not claimed.

## Budgets And Verification

- Main harness record-update budget: `timeout_ms=180000`, `max_output_chars=100000`, `max_context_chars=20000`, `max_tool_calls=8`, `max_retries=0`.
- Runtime retry budget: retain the configured total kickstart-attempt cap and existing five-attempt bounded bootstrap helper; add no unbounded loop.
- Delegation / subagents: zero.
- Workstreams / exclusive owners: one implementation stream owns only the three scoped files.
- Focused verification: `node --import tsx --test tests/deployment_supervisor.test.ts` supports activation, re-bootstrap, exhaustion, and rollback regression claims.
- Repository verification: `pnpm run check` supports build, full-suite, skills, and neutral-naming integrity claims.
- Patch integrity: `git diff --check` supports whitespace integrity.
- The implementation commit is recorded above. Push, pull request, merge, deployment, probation, controller update, and live rollback proof remain pending.
