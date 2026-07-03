# Task 215: Runtime Workspace Hygiene Diagnostic

Status: implemented

## Problem

New repo-local runtime examples now use `.runtime/`, but existing checkouts can
still contain ignored top-level `.runtime-*` or `.runtime_*` directories. That
makes it hard to tell whether the project is actually following the simpler
runtime workspace structure.

## Scope

- Add a read-only `workspace runtime` CLI action.
- Scan top-level directory names under the configured repo root.
- Report whether `.runtime/` exists.
- Report legacy `.runtime-*` and `.runtime_*` directories.
- Recommend `.runtime/state`, `.runtime/stage`, `.runtime/smoke/<name>`, or
  `.runtime/legacy/<name>` targets.
- Document the command and boundary.

## Non-Goals

- No automatic migration.
- No deletion or movement of local runtime artifacts.
- No recursive file inspection.
- No file body reads.
- No state, repo, active-vault, or service mutation.

## Verification

- `node --import tsx --test tests/runtime_workspace.test.ts tests/cli.test.ts`
- `pnpm --silent exec tsc --noEmit`
