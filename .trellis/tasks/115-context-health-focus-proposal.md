# Task 115: Context Health Focus Proposal

## Goal

Turn a selected `context_health` review tick focus into a concrete gated runtime
proposal instead of falling back to a generic memory-gap proposal.

## Scope

- Build a bounded `runtime_gap` proposal from `context_health` focus metadata.
- Replace generic no-evidence `memory_gap` proposals when a focus-derived
  proposal exists.
- Materialize the normal gated `narrow_review` inbox item from that proposal.
- Preserve JSON and Markdown review tick focus metadata.
- Update runtime contract, local runtime docs, Trellis spec, and decisions.

## Non-goals

- Do not read raw context Markdown.
- Do not repair, delete, compact, or rewrite context state.
- Do not request confirmations or execute follow-ups from focus selection.
- Do not run shell commands from read-only surfaces.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/background_review.test.ts tests/opportunity_backlog.test.ts tests/context_health.test.ts`
- `pnpm run check`
