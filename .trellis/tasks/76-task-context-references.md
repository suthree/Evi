# Task Context References

## Goal

Expose explicit repo-local task references as bounded context so live and IM
tasks can point the agent at relevant files without dumping broad workspace
state or granting new tool authority.

## Scope

- Parse `@file:<repo-ref>` and `@folder:<repo-ref>` from the accepted goal.
- Support optional line ranges for file refs.
- Add a `Task References` context section only when refs are present.
- Record selected refs in the context manifest section refs.
- Keep folder refs to bounded file listings only.

## Non-Goals

- No absolute paths, parent traversal, state-root files, home files, URLs, git
  diff/log expansion, shell command execution, model calls, writes, or
  active-vault mutation.
- No general attachment system.
- No proof-of-completion semantics for referenced content.
- No context-engine plugin architecture.

## Acceptance

- Context assembly renders bounded `@file` line ranges and `@folder` file
  listings.
- Unsafe refs become warnings and do not read outside the repo.
- Live runner model input includes the `Task References` section when a task
  contains selected refs.
- Focused and full test suites pass.
