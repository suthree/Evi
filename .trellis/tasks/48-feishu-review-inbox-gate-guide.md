# Feishu Review Inbox Gate Guide

## Status

Done

## Goal

Show the explicit CLI confirmation-request command in Feishu review inbox item
details, so the operator can move an inspected self-evolution inbox item to the
existing confirmation gate without giving IM mutation authority.

## Acceptance Criteria

- `/review inbox <ref-or-id>` includes a `Confirmation gate` section.
- Open mutation inbox items show
  `pnpm run runtime -- review request-inbox-confirmation --item <item>`.
- Items with an existing confirmation show the confirmation inspection command.
- Executed or read-only items do not suggest a new mutation confirmation request.
- The command is rendered only as text; Feishu does not request confirmations,
  execute follow-up actions, write the active vault, invoke the model, or run
  shell commands.

## Verification

```bash
node --import tsx --test tests/feishu_adapter.test.ts tests/cli.test.ts
pnpm run check
```
