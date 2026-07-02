# Harness Replay Acceptance

Status: Done

## Goal

Let operators replay-audit a selected recent live run from bounded metadata and
surface the result as governance evidence only.

## Scope

- Add a state-only harness replay audit report under `governance/replays/`
- Add CLI creation and history/detail inspection commands
- Expose replay audit history in context, aggregate governance status, and
  Feishu read-only operator views
- Update capability acceptance so this is no longer a next slice
- Update docs, spec, decisions, and focused tests

## Non-Goals

- No agent rerun
- No model calls
- No tool execution
- No raw model/tool/delegation/final/context artifact reads
- No repo writes, active-vault writes, service management, or SOP/skill/
  semantic-memory mutation

## Acceptance

- `review replay-audit --trace <ref-or-id>` writes a bounded replay report and
  one evidence event
- `review replays` and Feishu `/review replays` inspect replay reports without
  rerunning traces
- Context and governance status include bounded replay summaries and refs
- Capability acceptance has no remaining `harness_replay_acceptance` next slice
- Focused and full repository checks pass
