# Task 58: Autonomy Resume Operator Gate

## Status

Done

## Goal

Add an explicit local operator command to resume autonomous exploration after an
active `pause_autonomy` signal has been reviewed.

## Scope

- Add CLI `governance resume-autonomy --reason <text>`.
- Mark `autonomy/runs/pause_signal.json` inactive without deleting the stable
  signal.
- Write a resume artifact under `autonomy/runs/`.
- Append episode evidence for the resume decision.
- Render the CLI resume command as Feishu `/status` guidance while keeping
  Feishu read-only.

## Boundaries

- Reject missing or inactive pause signals.
- No review tick execution.
- No confirmation request or execution.
- No model invocation.
- No active-vault, SOP, skill, or memory mutation.
- No launchd, service, channel, or runtime config mutation.

## Acceptance

- CLI parsing recognizes `governance resume-autonomy`.
- Resume writes the stable inactive signal, a resume artifact, and evidence.
- Feishu `/status` shows the resume command but does not execute it.
- Pause-aware review tick tests still pass.

## Verification

```bash
node --import tsx --test tests/autonomy_pause.test.ts tests/cli.test.ts tests/feishu_adapter.test.ts tests/governance_status.test.ts tests/review_tick_service.test.ts
pnpm run check
```
