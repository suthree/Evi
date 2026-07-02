# State-Only Governance Actions

## Goal

Make `propose_memory` and `request_audit` real runtime actions without granting
the model direct mutation authority over durable memory or self-evolution gates.

## Scope

- Execute `propose_memory` as a state-only candidate under
  `memory/semantic/candidates/`.
- Execute `request_audit` as a state-only audit request under
  `governance/audits/`.
- Append episode evidence for both action types.
- Feed executed governance observations back into later model rounds.
- Keep durable memory promotion, SOP mutation, skill writes, and completion
  verification harness-owned.

## Non-Goals

- No durable memory writes.
- No core file edits.
- No SOP status mutation.
- No active-vault or skill writes.
- No confirmation execution.
- No shell command execution.
- No implementation for `pause_autonomy`.

## Acceptance

- A live runner test proves both action types write state artifacts and evidence.
- The next model round receives harness governance observations.
- The artifacts are not written into the repository or active vault.
- `pnpm run check` passes.
