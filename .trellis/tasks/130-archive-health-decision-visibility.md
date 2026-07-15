# Task 130: Archive Health Decision Visibility

## Status

Done

## Goal

Keep archive-health attention aligned across Opportunity Backlog decisions,
governance status, Feishu views, and stable documentation.

## Scope

- Confirm `archive_health` is an eligible derived Opportunity Backlog decision
  kind.
- Expose bounded archive-health summary fields when it is the top governance
  status item.
- Update runtime contract and Trellis decision text so decision guidance,
  governance visibility, and archive-health boundaries match the code.
- Add targeted governance status test coverage.

## Non-Goals

- No automatic archive generation or repair.
- No raw episode artifact reads.
- No review tick query focus for archive maintenance.
- No model invocation, confirmation request, follow-up execution,
  active-vault write, repo write, or shell command execution through read
  models.

## Acceptance

- `governance status` can expose a top `archive_health` item with bounded
  issue kind, date, archive ref, inspect command, refresh command, and decision
  command.
- Documentation names `archive_health` in the eligible derived decision kinds.
- Focused and full validation pass.
