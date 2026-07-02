# Task 30: Feishu Read-Only Operator Commands

## Goal

Let the local Feishu private-chat entrypoint expose minimal operator visibility
without invoking the model.

## Scope

- Add local handling for `/help`.
- Add local handling for `/status`.
- Add local handling for `/review inbox`.
- Add local handling for `/review inbox all`.
- Add local handling for `/review inbox executed`.
- Keep `/inbox` aliases for the review inbox views.
- Record inbound and operator-command artifacts under channel state.
- Keep ordinary private messages routed through the live agent runner.

## Non-Goals

- No confirmation request creation from IM.
- No follow-up execution from IM.
- No SOP draft, audit, promotion, or skill revision from IM.
- No active-vault writes.
- No shell command execution.
- No group chat, card, attachment, or hosted service behavior.
- No provider-specific project CLI command surface.

## Acceptance

- `/status` replies with local service/review tick status and does not call the
  runner.
- `/review inbox` lists active review inbox items and does not call the runner.
- `/review inbox all` can include executed inbox items.
- Ordinary private text still runs through the agent.
- Unauthorized users cannot access operator commands.
- `pnpm run check` passes.
