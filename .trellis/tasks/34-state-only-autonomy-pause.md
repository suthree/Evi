# State-Only Autonomy Pause

## Goal

Make `pause_autonomy` a real runtime action that future context assembly can
see, without treating it as a process-control or configuration mutation command.

## Scope

- Execute `pause_autonomy` as a state-only stop signal.
- Write a stable signal at `autonomy/runs/pause_signal.json`.
- Write a per-run pause request artifact under `autonomy/runs/`.
- Append episode evidence for the pause request.
- Load active pause signals into later turn snapshots as
  `task_context.stop_signal_active=true`.

## Non-Goals

- No resident service stop or launchd unload.
- No IM channel disablement.
- No runtime config edits.
- No confirmation execution.
- No shell command execution.
- No SOP, skill, or active-vault mutation.

## Acceptance

- A live runner test proves `pause_autonomy` writes state artifacts and evidence.
- A later context snapshot includes the active stop signal.
- The artifacts are not written into the repository or active vault.
- `pnpm run check` passes.
