# Task 04: IM Baseline

## Goal

Make IM a first-version local agent basic entrypoint with Feishu as the first
provider.

## Scope

- Replace provider-first command wording with project-level IM commands.
- Make `doctor` check IM by default.
- Add `--no-im` as the explicit downgrade.
- Add `im serve` as the local foreground IM entrypoint.
- Keep Feishu private text, allowlist, ack, final response, dedup, and error
  evidence.

## Non-Goals

- No group chat.
- No attachments.
- No interactive cards.
- No multi-user service mode.
- No hosted or multi-user daemon. Local single-user service runtime is handled
  separately by Task 05.
- No hosted deployment.

## Verification

- Existing Feishu adapter tests still pass.
- New CLI tests cover `doctor` IM checking semantics and `im serve` routing.
- `pnpm run check` passes.

## Status

Completed.
