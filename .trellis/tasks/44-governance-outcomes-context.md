# Governance Outcomes Context

## Status

Done

## Goal

Expose recently executed local self-evolution decisions inside the live context
bundle as bounded read-only feedback, so later runs can see what already landed
without replaying confirmations or reading raw artifacts.

## Acceptance Criteria

- Context bundles include a `Governance Outcomes` section when executed
  governance confirmations exist.
- The section summarizes executed memory acceptances and review follow-up
  executions by confirmation id, action/result kind, produced refs, evidence
  id, and execution time.
- The section does not inject raw SOP drafts, audits, promoted skills,
  accepted-memory Markdown, confirmation safety boundaries, or command strings.
- The context manifest records selected outcome confirmation refs and produced
  result refs.
- Context assembly remains read-only and does not request or execute
  confirmations, run review, run review tick, write the active vault, invoke the
  model recursively, or run shell commands.

## Verification

```bash
node --import tsx --test tests/context_harness.test.ts tests/context_manifest.test.ts
pnpm run check
```
