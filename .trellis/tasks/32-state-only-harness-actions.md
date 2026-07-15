# State-Only Harness Actions

## Goal

Make `record_evidence` and `update_working_state` real runtime actions instead
of prompt-only vocabulary.

## Scope

- Execute `record_evidence` as a state-only Markdown report under
  `memory/episodes/`.
- Execute `update_working_state` as a state-only checkpoint under
  `memory/working/`.
- Append episode evidence for both action types.
- Feed executed harness state observations back into later model rounds.
- Keep completion verification harness-owned.

## Non-Goals

- No repo writes.
- No active-vault writes.
- No shell command execution.
- No confirmation request execution.
- No implementation for `propose_memory`, `request_audit`, or
  `pause_autonomy`.

## Acceptance

- A live runner test proves both action types write state artifacts and evidence.
- The next model round receives harness state observations.
- Query/todo supervisor checks accept harness state observations as valid
  executed observations.
- `pnpm run check` passes.
