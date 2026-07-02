# Task 124: Feishu Outbound History Chat Boundary

## Goal

Prevent Feishu same-chat context from injecting prior outbound assistant replies
that cannot prove they belong to the current private chat.

## Scope

- Persist `chat_id` on new `channels/feishu/outbound/*.json` final-reply
  records.
- Require outbound history rows to match the current `open_id` and `chat_id`.
- Skip legacy outbound records that do not carry `chat_id`.
- Add regression coverage for same-chat inclusion, wrong-chat exclusion, and
  missing-chat-id exclusion.
- Update stable docs, Trellis spec, and decisions.

## Non-goals

- No remote Feishu history fetch.
- No state migration or legacy outbound backfill.
- No raw Feishu event payload injection.
- No MemoryStore rebuild or new long-term memory source.
- No changes to operator command, confirmation, or follow-up execution gates.

## Verification

- `node --import tsx --test tests/feishu_adapter.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
