# 109 Feishu Service Logs Operator View

## Intent

Expose bounded resident IM service log tails from Feishu so the local operator
can inspect service health from the same IM surface without invoking the model
or running service-control commands.

## Scope

- Add Feishu `/logs [lines]` and `/service logs [lines]` operator commands.
- Read only `<LOCAL_RUNTIME_HOME>/logs/im.out.log` and
  `<LOCAL_RUNTIME_HOME>/logs/im.err.log`.
- Render bounded stdout and stderr tails with a capped line count and output
  size.
- Update operator help, stable docs, and Feishu adapter tests.

## Safety Boundary

- Do not call `service logs`, `launchctl`, shell commands, or the model from
  the Feishu command handler.
- Do not accept operator-provided filesystem paths.
- Do not read raw context, review, episode, SOP, or skill bodies.
- Do not mutate state, memory, SOP, skills, the active vault, repo files, or
  service state.

## Verification

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsx --test tests/feishu_adapter.test.ts
pnpm run check
```

## Status

Implemented in the feishu-service-logs-operator-view slice.
