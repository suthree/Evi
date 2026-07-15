# Pause-Aware Review Tick Loop

## Goal

Make the resident review tick loop honor active autonomy pause signals.

## Scope

- Read `autonomy/runs/pause_signal.json` before an enabled resident tick.
- When the signal has `status=active`, write review tick status with
  `state=paused`.
- Include the pause signal ref and reason in service status.
- Skip background review and inbox materialization while paused.

## Non-Goals

- No change to explicit CLI `review tick`.
- No service stop or launchd unload.
- No runtime config edits.
- No confirmation execution.
- No active-vault, SOP, or skill mutation.

## Acceptance

- A review tick service test proves an enabled loop pauses when the signal is
  active.
- The test proves no tick artifact is produced while paused.
- `pnpm run check` passes.
