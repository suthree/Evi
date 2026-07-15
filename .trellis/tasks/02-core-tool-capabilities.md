# Task 02: Core Tool Capabilities

## Goal

Complete the first-version core execution tool surface.

## Required Tools

- `file.write_repo`
- `repo.search`
- `command.run`

## Constraints

- Keep `file.read`, `file.write_state`, `http.fetch`, and `code.execute_node`.
- Treat `code.execute_node` as a snippet tool, not the generic run tool.
- Enforce path boundaries.
- Require timeout and output caps for `command.run`.
- Record evidence for repo writes and commands.
- Add capability tests.

## Verification

- Tool contract rendering includes the new tools.
- Tests cover repo write safety, repo search, bounded command execution, and
  blocked unsafe paths.
- `pnpm run check` passes.

## Status

Completed.
