# Feishu Review Inbox Detail

## Status

Done

## Goal

Expose one review tick inbox item through Feishu as a read-only operator view,
so checkpoint-derived and other self-evolution candidates can be inspected from
the IM surface without bypassing the existing confirmation gate.

## Acceptance Criteria

- `/review inbox <ref-or-id>` resolves one `autonomy/inbox/*.json` item using
  the existing review inbox read model.
- `/inbox <ref-or-id>` is accepted as the same local alias.
- The detail reply includes status, refs, proposal/action ids, write surfaces,
  required refs, confirmation ref, and execution summary when present.
- The command does not run the agent model, read raw review artifacts, request
  confirmations, execute follow-up actions, write the active vault, or run
  shell commands.
- The help and docs list the single-item command.

## Verification

```bash
node --import tsx --test tests/feishu_adapter.test.ts tests/cli.test.ts
pnpm run check
```
