# Feishu Context Manifest Operator View

## Status

Done

## Goal

Expose context manifest list and detail views through Feishu as read-only
operator commands, so local context assembly can be inspected from IM without
opening raw prompt Markdown or invoking the agent.

## Acceptance Criteria

- `/context` and `/context list` list recent context manifest summaries.
- `/context <ref-or-id>` and `/context show <ref-or-id>` inspect one context
  manifest by state ref, Markdown ref, manifest filename, or session id.
- The detail reply includes session, turn, refs, character counts, section
  counts, recall counts, discipline state, and selected section refs.
- The command does not run the agent model, read raw context Markdown, build new
  context, sync memory indexes, request confirmations, execute follow-up
  actions, write the active vault, or run shell commands.
- The help and docs list the context operator commands.

## Verification

```bash
node --import tsx --test tests/feishu_adapter.test.ts tests/context_manifest.test.ts tests/cli.test.ts
pnpm run check
```
