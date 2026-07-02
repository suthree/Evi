# Task 128: Skill Catalog Operator Visibility

## Status

Done

## Goal

Expose current local skill catalog metadata to operators without opening raw
skill instruction bodies.

## Scope

- Add a core read model over skill frontmatter and registry metadata.
- Add CLI skill catalog detail selection by name or ref.
- Add Feishu `/skills` and `/skill <name-or-ref>` operator commands.
- Add capability catalog, contract, runtime docs, and tests.

## Non-Goals

- No raw skill body rendering.
- No registry metadata rewrite.
- No skill instruction rewrite.
- No SOP draft, audit, promotion, or repair through this path.
- No model invocation, review tick execution, confirmation request, follow-up
  execution, active-vault write, repo write, or shell command execution.

## Acceptance

- Operators can list bounded skill catalog metadata from CLI and Feishu.
- Operators can inspect one skill metadata entry by name or ref.
- Feishu catalog commands do not invoke the agent runner.
- Tests prove raw SKILL body content is not sent or returned.
- Focused and full validation pass.
