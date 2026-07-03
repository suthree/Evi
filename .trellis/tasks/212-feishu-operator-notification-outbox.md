# Task 212: Feishu Operator Notification Outbox

Status: implemented

## Problem

The operator wanted Codex to be able to proactively send progress updates via
Feishu, but the runtime boundary should not let ordinary CLI/model contexts own
Feishu credentials, transports, or arbitrary external-send authority.

## Scope

- Add a provider-neutral `notify queue` CLI command that writes local operator
  notification requests.
- Add `notify list` for queued/sent/failed notification inspection.
- Store notification requests under `operator/notifications/outbox/`.
- Let the resident Feishu adapter drain queued Feishu notifications.
- Reuse the existing Feishu `open_id` allowlist, text chunking, transport, and
  channel event ledger.
- Mark each request `sent` or `failed` with bounded send/error evidence.

## Non-Goals

- No direct Feishu send from CLI.
- No provider-first `feishu notify` command.
- No group chat, cards, attachments, remote Feishu queueing, or hosted
  notification service.
- No automatic notification generation from model output.

## Verification

- `node --import tsx --test tests/operator_notifications.test.ts tests/feishu_adapter.test.ts tests/cli.test.ts`
- `pnpm run build`
- `pnpm run runtime -- notify queue --open-id ou_allowed --text "progress smoke" --source codex --state-root <tmp-state>`
- `pnpm run runtime -- notify list --status queued --state-root <tmp-state>`
