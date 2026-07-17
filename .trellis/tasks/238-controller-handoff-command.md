# Task238: verified deployment controller handoff

- **Issue:** [#46 feat(runtime): add verified deployment controller handoff](https://github.com/suthree/Evi/issues/46)
- **Owner:** Evi
- **Base commit:** `9a2fa013ed41b6d9eda1b2298acd680b5f3e9e24`
- **Branch:** `codex/issue-46-controller-handoff-command`
- **Worktree:** `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/46-controller-handoff-command`
- **Authority:** Codex has implementation-only authority inside this exact isolated worktree. Evi remains task owner and final reviewer.

## Observed evidence

- Current resident runtime is stable at `1571967500fcb6df4fcaeb808b7095974e0c9caa`.
- The independent controller source was verified at base `9a2fa013ed41b6d9eda1b2298acd680b5f3e9e24`.
- Existing controller and manifest backups are available.
- Manual `cp`, manifest commit update, and supervisor kickstart succeeded.
- This command is allowed only after a candidate deployment is canonical stable.

## Delivery goal

Implement the smallest architecture-consistent explicit local `deployment controller-handoff` command that replaces the proven manual controller bootstrap. It must never silently succeed and must return typed evidence.

## Required behavior

1. Require canonical stable current deployment and no pending deployment transaction.
2. Require a clean current runtime build that matches the stable ledger and repository boundary.
3. Require the controller source inside the canonical current runtime bundle and a currently installed supervisor.
4. Verify stable ledger, runtime, and controller identities before mutation.
5. Create versioned backups for both installed supervisor controller and manifest.
6. Install the controller from the canonical current runtime bundle into the stable supervisor location.
7. Atomically update `controller_source_commit` in the manifest.
8. Restart only the supervisor; do not restart the runtime.
9. Verify the replacement supervisor has a new PID and expected process/controller identity.
10. On any install, manifest-update, supervisor-restart, or identity-verification failure, restore both backups and restore the prior supervisor state before returning failure evidence.
11. Treat an already-matched controller/manifest state as a safe idempotent no-op with typed evidence.

## Strict exclusions

Do not build, swap deployment slots, mutate slots, restart runtime, invoke models, perform remote deployment, or create resources. Do not commit, push, create a PR, merge, deploy, close the Issue, modify root `develop`, use `main`, create tags/releases, publish, alter global Codex configuration, or access secrets/private data.

## Changed-path scope

Change only the smallest relevant command/service/deployment implementation paths, focused tests, and paired operator documentation if command documentation materially changes. Do not make unrelated refactors.

## Required reading

Read `AGENTS.md`, compact indexes, the engineering delivery contract, this Task238, and only relevant service, deployment, CLI, test, and operator-documentation sections.

## Checks and budgets

- Run focused tests for the changed command/deployment paths.
- Run `git diff --check`.
- Run `pnpm run check` only if budget remains.
- Codex execution budget: `timeout_ms=300000`, `max_output_chars=160000`, `max_context_chars=50000`, `max_tool_calls=24`, `max_retries=0`.
- Codex must report changed files, exact checks and outcomes, residual risks, and its updated same-thread authority handle for any permitted later resume.

## Deployment/live acceptance

The implementation must make the controller handoff locally usable only after canonical stabilization. It must demonstrate or test precondition rejection, backup creation, atomic manifest source-commit recording, supervisor-only restart, post-restart PID/identity verification, rollback restoration, and idempotent already-matched behavior. No live deployment is authorized in this task.

## Rollback postcondition

For every failed handoff stage, the installed controller and manifest are restored from their versioned backups and the old supervisor state is re-established. The result includes typed failure/rollback evidence; silent partial success is forbidden.

## Controller handoff postcondition

On success, the stable supervisor controller is byte/identity consistent with the controller in the canonical current runtime bundle, the stable manifest atomically records the matching `controller_source_commit`, only the supervisor was restarted, and the verified replacement process has the expected identity. On idempotent success, no controller, manifest, runtime, slot, or process mutation occurs.
