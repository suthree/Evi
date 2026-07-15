# Autonomy Pause Operator Status

Surface the active autonomy pause signal in local operator status views.

## Scope

- Add the stable pause signal path to the local IM service definition.
- Include `autonomy_pause` in `service status` when
  `autonomy/runs/pause_signal.json` exists.
- Render active pause state, reason, resume hint, and signal ref in Feishu
  `/status`.
- Keep the surface read-only: no clear, resume, review tick execution,
  confirmation request, model invocation, active-vault write, or SOP/skill
  mutation.

## Acceptance

- `service status` returns the active pause signal as `autonomy_pause`.
- Feishu `/status` shows the active autonomy pause without running the agent.
- Missing pause signal still reports the service status view normally.
- Docs identify this as operator visibility, not a mutation command.

## Verification

- `node --import tsx --test tests/service.test.ts tests/feishu_adapter.test.ts`
