# Task 210: Context Attention Plan

Status: implemented

## Problem

The runtime had context usage and pressure diagnostics, but live context did not
surface a compact attention-routing hint for the next model call. GA/avatar
folds old turns and forces working summaries, while Hermes uses context budget,
tail protection, and compaction summaries. XingZhe should borrow the attention
focus pattern without adding automatic compaction or broad prompt tax.

## Scope

- Render an optional bounded `Attention Plan` context section when model budget,
  prior context pressure, or a working checkpoint exists.
- Include only accepted-goal, selected recall/skill counts, focus order, model
  budget metadata, latest pressure manifest metadata, and checkpoint metadata.
- Keep quiet first turns free of the extra section when no attention signal
  exists.
- Preserve existing context pressure diagnostics and Opportunity Backlog
  guidance.
- Update Runtime Contract, Local Runtime docs, Trellis spec, and decisions.

## Non-goals

- No automatic context compaction.
- No context assembly rewrite or mitigation command.
- No raw context Markdown, skill body, SOP body, review body, tool artifact, or
  final response reads.
- No model calls, shell commands, service control, repo writes, active-vault
  writes, or state mutation.

## Acceptance

- Context bundles with pressure metadata include `Attention Plan`.
- The section cites context manifest metadata and does not include raw context
  Markdown or raw artifact bodies.
- Context bundles without budget, pressure, or checkpoint do not pay the extra
  section cost.
- Existing context bundle size guard remains under budget.

## Verification

- `node --import tsx --test tests/context_harness.test.ts tests/context_pressure.test.ts`
- `pnpm run check`
