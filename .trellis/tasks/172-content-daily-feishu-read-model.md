# Task 172: Content Daily Feishu Read Model

Status: implemented

## Problem

The resident daily content loop can create a date-keyed job and the CLI can
advance it, but the operator could not inspect the daily content status from the
same Feishu control surface used for service and governance status.

## Scope

- Add `/content`, `/content daily`, `/daily`, and `/content <date-or-ref>` as
  read-only Feishu operator commands.
- Render service content-daily status, selected daily job metadata, job steps,
  linked content run evidence status, refs, and bounded local next commands.
- Support direct content run inspection through `/content run <ref>`.
- Keep output bounded and omit draft bodies, source bodies, image bytes, raw
  model responses, cookies, and secrets.
- Update docs, capability catalog, and tests.

## Non-goals

- No Feishu-triggered image generation.
- No Feishu-triggered MCP calls, preflight, or publishing.
- No confirmation requests or external-write execution.
- No source refetching, draft replacement, or resident auto-advance.

## Acceptance

- `/content` shows the latest daily job and linked content run without invoking
  the agent.
- `/content run <ref>` shows bounded run metadata only.
- The command displays the local `content daily-advance` next step when the job
  is drafted.
- Raw fetched source text, draft bodies, and image bytes are not sent.

## Verification

- `pnpm exec tsx --test tests/feishu_adapter.test.ts tests/content_pipeline.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- Send `/content` to the local Feishu private chat service and verify the reply
  is read-only status.
