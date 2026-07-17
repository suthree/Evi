# Launchd Missing-Job Re-bootstrap During Candidate Activation

Status: in progress under the bounded main-harness execution; implementation and focused verification pending

## Identity And Ownership

- Issue: [GitHub Issue #50, `Re-bootstrap missing launchd job during candidate activation`](https://github.com/suthree/Evi/issues/50).
- Milestone / target version: Issue #50 runtime activation repair; no release or deployment claim in this task.
- Owner repository: Evi.
- Implementation owner: bounded Codex CLI execution under the main harness.
- Decision Owner / authority basis: the operator-approved Issue #50 contract supplied by the main harness.
- Capability layer: basic-entrypoint.
- Base commit: `690c2e8f50c72146650fb043fb8937f7191565ff`.
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
- Non-goals: no new launchd service or dependency, no broad lifecycle refactor, no manifest/schema migration, no root-checkout mutation, commit, push, pull request, merge, deployment, restart, controller handoff, tag, or release.

## Design Discipline

- Reuse: the existing `startRuntime` kickstart loop, injected launchctl/delay dependencies, bounded bootstrap helper, start evidence, activation recovery, and focused deployment-supervisor fixtures.
- Complexity: one optional typed re-bootstrap evidence list and one missing-job branch inside the existing retry loop is the smallest coherent repair.
- Architecture impact: strengthens only the existing launchd adapter path inside the independent deployment supervisor.
- Dependencies / blockers / cross-repository links: Issue #50; no cross-repository work and no known implementation blocker.
- External effects / sensitive data / authority gates: repository-local source, test, and task-record writes only; no secrets, private-data egress, resident-runtime mutation, or external communication.
- Compatibility / migration: new evidence is optional so existing schema-version-1 deployment records remain readable; no persisted-state migration.
- Rollback path: revert this bounded diff; existing manifests, bundles, and deployment ledgers require no migration.

## Rebaseline

- Integration baseline: `a373c4f`; this worktree intentionally remains on its recorded Issue #50 base during the bounded execution.
- Decision: **RETAIN** the three-file Issue #50 repair because it remains independently scoped and required.
- Evidence separation: checks in this worktree prove only the retained Issue #50 diff against its recorded base; they do not prove compatibility with `a373c4f` or integration readiness.
- Before integration, rebase this branch onto `a373c4f`, resolve only genuine overlap, and rerun the focused test, build, and patch-integrity checks. Rebase is explicitly prohibited in the current execution.

## Budgets And Verification

- Main harness budget: `timeout_ms=300000`, `max_output_chars=200000`, `max_context_chars=40000`, `max_tool_calls=32`, `max_retries=0`.
- Runtime retry budget: retain the configured total kickstart-attempt cap and existing five-attempt bounded bootstrap helper; add no unbounded loop.
- Delegation / subagents: zero.
- Workstreams / exclusive owners: one implementation stream owns only the three scoped files.
- Focused verification: `node --import tsx --test tests/deployment_supervisor.test.ts` supports activation, re-bootstrap, exhaustion, and rollback regression claims.
- Build verification if needed: `pnpm run build` supports TypeScript contract integrity.
- Patch integrity: `git diff --check` supports whitespace integrity.
- Completion evidence, commit, PR, deploy, restart, live smoke, probation, and rollback evidence: pending; commit/PR/runtime actions are prohibited in this execution.
