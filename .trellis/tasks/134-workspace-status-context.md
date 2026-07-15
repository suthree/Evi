# Workspace Status Context

Status: done

## Problem

`workspace status` and Feishu `/workspace` make the checkout visible to the
operator, but normal live runs still lack direct context about whether the repo
is clean before suggesting or performing repo edits.

## Scope

- Add a bounded `Workspace Status` context section sourced from the shared
  workspace status read model.
- Render branch, upstream, ahead/behind, dirty counts, conflict count, command,
  boundary, and bounded changed path/status entries.
- Include the read model source and bounded changed paths in the context
  manifest refs.
- Update runtime contract, local runtime docs, Trellis decisions, and context
  tests.

## Non-Goals

- Do not block `file.write_repo`.
- Do not stage, commit, reset, checkout, clean, or manage git state.
- Do not read file bodies or raw diffs.
- Do not infer resident service deployment from a clean workspace.

## Verification

```bash
pnpm exec tsx --test tests/context_harness.test.ts tests/workspace_status.test.ts
pnpm run check
```

## Result

Implemented in the workspace-status-context slice.
