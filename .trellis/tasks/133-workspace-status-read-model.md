# Workspace Status Read Model

Status: done

## Problem

Before adding stronger repo-write or self-evolution behavior, local runtime needs a
bounded operator-visible view of the current local checkout. Service health can
show the copied runtime's dirty flag, but it does not answer whether the active
repo worktree is currently clean.

## Scope

- Add a shared core read model for fixed local git status diagnostics.
- Add CLI `workspace status`.
- Add Feishu `/workspace` and `/workspace status`.
- Add capability catalog, runtime-contract, local-runtime, and decision docs.
- Cover clean, dirty, non-git, CLI parse, capability, and Feishu operator
  behavior with tests.

## Acceptance

- The read model runs only fixed `git status --porcelain=v1 -b` argv.
- The result includes branch/upstream/ahead/behind where available.
- The result includes staged, unstaged, untracked, conflict, and total counts.
- File path summaries are bounded by limit and do not include file bodies.
- Non-git repos return `not_git_repo` rather than throwing.
- Feishu `/workspace` does not invoke the agent runner.
- The surface does not stage, commit, reset, checkout, mutate state, invoke the
  model, write the repo, or write the active vault.

## Verification

```bash
pnpm exec tsx --test tests/workspace_status.test.ts tests/cli.test.ts tests/feishu_adapter.test.ts tests/capabilities.test.ts
pnpm run check
```

## Result

Implemented in the workspace-status-read-model slice.
