# Feishu Same-Sender Follow-Up Queue

Status: done

## Problem

Feishu private-chat intake rejected a second normal message from the same
sender while the first run was still active. That protected the local runner
from concurrent same-sender runs, but it dropped useful follow-up intent during
ordinary chat use.

## Scope

- Add bounded per-`open_id` in-memory queues for normal Feishu private-chat
  tasks.
- Send a configured queued response when a same-sender follow-up is accepted.
- Keep the configured busy response for queue-full cases.
- Write queued trace artifacts under `channels/feishu/queued/` for
  observability.
- Drain queued messages after the active run reaches its local boundary,
  reusing the ordinary task runner and same-chat history context.
- Expose the non-secret follow-up queue size through runtime config summaries.
- Update config parsing, runtime docs, capability catalog, Trellis spec, and
  focused Feishu adapter coverage.

## Non-Goals

- Do not add remote Feishu queueing, remote history fetch, or group-chat
  behavior.
- Do not add cross-process durable replay or service-restart recovery for queued
  items.
- Do not add steering, cancel, pause, or resume semantics.
- Do not route read-only operator commands through the follow-up queue.
- Do not execute self-evolution confirmations or active-vault mutations from IM.

## Verification

```bash
pnpm exec tsx --test tests/feishu_adapter.test.ts
pnpm run check
```

## Result

Implemented a local bounded same-sender follow-up queue for Feishu private chat
and documented its process-local scheduling boundary.
