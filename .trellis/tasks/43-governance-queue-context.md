# Governance Queue Context

## Status

Done

## Goal

Expose pending local self-evolution work inside the live context bundle as a
bounded read-only section, so the harness can reason about governance backlog
without executing confirmations or reading raw artifacts.

## Acceptance Criteria

- Context bundles include a `Governance Queue` section when pending governance
  state exists.
- The section summarizes memory candidates, pending memory confirmations,
  active review inbox items, pending review follow-up confirmations, and active
  autonomy pause state by id/status/title/summary/ref only.
- The section does not inject raw review Markdown, memory candidate content,
  confirmation safety boundaries, or command strings.
- The context manifest records the selected governance refs and item count.
- Context assembly remains read-only and does not request or execute
  confirmations, run review, run review tick, write the active vault, invoke the
  model recursively, or run shell commands.

## Verification

```bash
node --import tsx --test tests/context_harness.test.ts tests/context_manifest.test.ts
pnpm run check
```
