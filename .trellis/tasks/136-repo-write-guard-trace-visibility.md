# Repo Write Guard Trace Visibility

Status: done

## Problem

`file.write_repo` records bounded pre/post workspace guard evidence, but
operators and later context bundles still need a way to see the guard without
opening raw ToolResult JSON.

## Scope

- Add a parseable bounded workspace guard clause to `file.write_repo` tool
  result summaries.
- Extend the `Live Run Trace` read model with repo-write guard summaries parsed
  from `tool_result` episode event metadata.
- Render guard counts and bounded guard details in live context and Feishu
  `/review traces` / `/review trace <ref-or-id>`.
- Update runtime docs, Trellis decisions, and focused tests.

## Non-Goals

- Do not read raw ToolResult JSON for trace visibility.
- Do not read file bodies, raw command output, model responses, context
  Markdown, or final responses.
- Do not block writes, mutate git state, request confirmations, execute
  follow-ups, or roll back.

## Verification

```bash
pnpm exec tsx --test tests/runtime_tools.test.ts tests/context_harness.test.ts tests/feishu_adapter.test.ts
pnpm run check
```

## Result

Implemented bounded repo-write guard visibility in trace read models, context,
and Feishu operator views.
