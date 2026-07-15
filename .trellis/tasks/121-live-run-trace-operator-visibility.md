# Task 121: Live Run Trace Operator Visibility

## Goal

Expose the bounded live run trace read model to local operators through CLI and
Feishu so recent harness run shape can be inspected without opening raw
execution artifacts.

## Scope

- Add a `getLiveRunTrace` core lookup that reuses the same bounded trace
  summaries as context.
- Support lookup by completion report ref, completion id, session id, or report
  filename.
- Add CLI `review traces` and `review traces --trace <ref-or-id>`.
- Add Feishu `/review traces` and `/review trace <ref-or-id>`.
- Render bounded trace metadata only: completion ids, session/turn ids,
  context refs, event kind counts, observation counts, harness state-action
  counts, per-round action counts, action types, envelope refs, and boundary.
- Update stable docs, Trellis spec, and decisions.

## Non-goals

- Do not read or render raw model responses, action payloads, tool result
  bodies, delegation result bodies, final response Markdown, context Markdown,
  completion Markdown, or harness artifact bodies.
- Do not replay actions, run review tick, request confirmations, execute
  follow-ups, invoke the model, mutate SOP/skill/memory state, write the active
  vault, write the repo, or run shell commands from the read model.
- Do not repair historical context health sidecars.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/cli.test.ts tests/feishu_adapter.test.ts tests/context_harness.test.ts`
- `pnpm run check`
