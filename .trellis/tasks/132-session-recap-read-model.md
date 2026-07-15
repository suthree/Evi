# Session Recap Read Model

## Goal

Add a metadata-only local session recap so operators can re-orient around the
latest or selected session before resuming local development or resident IM
iteration.

## References

- Hermes `session_recap.py`: cheap local recap without an LLM call.
- GenericAgent memory management SOP: durable memory must be tied to verified
  action evidence.
- local runtime boundary: local-only, single-machine, read-only operator surfaces.

## Scope

- Add a core read model over `memory/episodes/events.jsonl`, completion
  verification report metadata, context manifest metadata, and bounded working
  checkpoint metadata.
- Add CLI `memory recap [--session <session-id>]`.
- Add Feishu `/recap`, `/recap <session-id>`, `/memory recap`, and
  `/memory recap <session-id>`.
- Add Capability Catalog, stable docs, Trellis spec, and decision updates.

## Boundaries

- No raw context Markdown, model response, tool output, final response, episode
  artifact, SOP, or skill body rendering.
- No MemoryStore index rebuild.
- No model invocation, shell command execution, state mutation, repo write, or
  active-vault write.

## Acceptance

- Recap defaults to the latest session when no session is provided.
- Missing sessions return a stable empty recap.
- Recap includes event counts, kind counts, latest task, completion status,
  context metadata, working checkpoint metadata, recent event summaries, refs,
  and next inspection commands.
- CLI parsing accepts `memory recap --session <session-id>`.
- Feishu `/recap` returns a local operator summary without running the agent.
- Tests prove raw artifact content is not rendered.

## Verification

```bash
node --import tsx --test tests/session_recap.test.ts tests/cli.test.ts tests/feishu_adapter.test.ts tests/capabilities.test.ts
pnpm exec tsc --noEmit
pnpm run check
```
