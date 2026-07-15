# Working Checkpoint Review Intake

## Status

Done

## Goal

Let background review and review tick see the latest bounded working checkpoint
as continuity intake, so unfinished local harness work can enter the existing
self-evolution inbox without a separate execution path.

## Acceptance Criteria

- Recent background review selects the latest valid working checkpoint using
  the same `memory/working/current.json` preference as context assembly.
- Background review records the selected checkpoint ref in the report source.
- The selected checkpoint can create a `runtime_gap` proposal that cites the
  checkpoint ref and evidence refs without reading raw evidence artifacts.
- Empty episode evidence still creates a memory-gap proposal; checkpoint intake
  must not fake evidence-backed completion.
- Review tick materializes the checkpoint proposal through the existing inbox
  and confirmation gate as a state-writing `narrow_review` follow-up.
- No repository writes, active-vault writes, confirmation requests, follow-up
  execution, model calls, or shell commands happen during review intake.

## Verification

```bash
node --import tsx --test tests/background_review.test.ts
pnpm run check
```
