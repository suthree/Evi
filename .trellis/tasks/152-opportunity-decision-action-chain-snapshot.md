# Opportunity Decision Action-Chain Snapshot

## Status

Done

## Goal

Preserve bounded action-chain provenance on append-only Opportunity Backlog
decisions so later agent turns can see which operator sequence was considered
when a derived backlog item was deferred, reopened, completed, or retired.

## Scope

- Store an optional `action_chain_snapshot` on eligible derived opportunity
  decisions.
- Keep only step label, effect, and optional reason metadata in the snapshot.
- Parse historical decision snapshots back into the backlog read model.
- Render the snapshot in context, governance status JSON, and Feishu operator
  views.
- Update local runtime and Trellis documentation.

## Non-Goals

- No command strings in decision snapshots.
- No command execution, service restart, confirmation request, follow-up
  execution, repo write, active-vault write, model call, or shell command from
  decision logging or read-only renderers.
- No synthetic snapshot for reopened historical decisions when the current
  backlog item is unavailable.

## Acceptance

- A derived backlog item decision writes bounded action-chain snapshot metadata.
- The decision JSONL omits action-chain command strings.
- Re-read backlog/context/governance/Feishu views expose the compact snapshot.
- Focused and full validation pass.
