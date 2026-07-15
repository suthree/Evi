# Task 116: Context Health Operator Guidance

## Goal

Let operators and later agents inspect one context health issue and see bounded
decision guidance without granting context repair authority.

## Scope

- Allow `context health --context <ref-or-id>` to narrow diagnostics to one
  issue by issue id, manifest ref, context ref, basename, session id, or turn
  id.
- Add bounded operator guidance to each context health issue: inspect, defer,
  complete after external repair, and retire historical issue commands.
- Surface guidance through Opportunity Backlog, bounded context, and Feishu
  `/context health <ref-or-id>`.
- Keep Feishu context health list compact while showing full commands in issue
  detail.
- Update runtime contract, local runtime docs, Trellis spec, and decisions.

## Non-goals

- Do not read raw context Markdown.
- Do not repair, delete, compact, or rewrite context state.
- Do not request confirmations or execute follow-ups from health inspection.
- Do not run shell commands from read-only surfaces.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/context_health.test.ts tests/opportunity_backlog.test.ts tests/feishu_adapter.test.ts tests/cli.test.ts tests/background_review.test.ts tests/context_harness.test.ts`
- `pnpm run check`
