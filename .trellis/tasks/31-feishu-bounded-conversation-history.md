# Task 31: Feishu Bounded Conversation History

## Goal

Give normal Feishu private-chat tasks bounded local conversational continuity
without turning channel logs into a second memory system.

## Scope

- Read prior local inbound records for the same `open_id` and `chat_id`.
- Read prior local outbound records for the same `open_id`.
- Require outbound records to match the same `chat_id`; legacy outbound records
  without `chat_id` are not injected.
- Sort history by local `created_at`.
- Inject only a small recent window into the task passed to the live runner.
- Truncate history row text before injection.
- Keep operator commands on the read-only local command path.

## Non-Goals

- No remote Feishu history fetch.
- No raw event payload injection.
- No unbounded transcript dump.
- No mixing messages from other users or chats.
- No injecting outbound replies when same-chat provenance is missing.
- No MemoryStore rebuild or new long-term memory source.
- No change to confirmation or follow-up execution gates.

## Acceptance

- A normal private message includes prior same-chat inbound/outbound text in
  the runner task.
- Prior messages from another `open_id` or chat are excluded.
- The current message is still passed as the active user message.
- Operator commands still avoid the live runner.
- `pnpm run check` passes.
