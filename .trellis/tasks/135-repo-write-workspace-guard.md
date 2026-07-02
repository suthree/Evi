# Repo Write Workspace Guard

Status: done

## Problem

`workspace status` is visible to operators and live context, but `file.write_repo`
tool artifacts still only record path and byte count. Later verification cannot
tell whether a repo write happened on top of a clean or already-dirty checkout.

## Scope

- Capture bounded fixed workspace status before and after each valid
  `file.write_repo` execution.
- Store the snapshots in the `ToolResult` output so existing episode and
  pipeline evidence persistence records them.
- Include only status, branch/upstream/ahead/behind, dirty counts, conflict
  count, bounded path/status entries, command, and boundary.
- Update tool contract, capability catalog, runtime docs, Trellis decision, and
  tests.

## Non-Goals

- Do not block repo writes because the workspace is dirty.
- Do not read file bodies or raw diffs.
- Do not stage, commit, reset, checkout, clean, or roll back writes.
- Do not write separate state artifacts for the guard.

## Verification

```bash
pnpm exec tsx --test tests/runtime_tools.test.ts tests/capabilities.test.ts tests/workspace_status.test.ts
pnpm run check
```

## Result

Implemented as bounded workspace guard evidence inside `file.write_repo`
tool results.
