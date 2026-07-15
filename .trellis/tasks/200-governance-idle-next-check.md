# Task 200: Governance Idle Next Check

Status: implemented

## Problem

When the opportunity backlog was empty, governance status only said that no
active opportunity existed. That was technically correct, but weak for an
autonomous local loop: the operator could not tell whether the system was
healthy-idle, waiting for a resident loop timer, or simply missing its next
self-evolution seed.

## Scope

- Add a bounded `opportunity_backlog.next_check` summary to governance status.
- Derive the next check from resident feedback refresh and creator metrics
  `service health` next-wake fields.
- Prefer the earliest valid enabled resident loop wake.
- Include the next resident check in Feishu `/governance`.
- Keep the signal read-only and observability-only.

## Non-goals

- No new opportunity kind, scoring rule, model call, browser automation,
  publishing, content capture, active-vault write, or service scheduling change.
- No change to health severity; an idle next check is not an error.
- No repo/Trellis task scanning at runtime.

## Acceptance

- Governance status includes `next_check` when there is no immediate backlog
  item but an enabled resident feedback loop has a scheduled wake.
- The idle attention hint names the next resident loop and wake time.
- Feishu `/governance` renders the same next resident check.
- Existing opportunity backlog behavior remains unchanged.

## Verification

- `pnpm exec tsx --test tests/governance_status.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
