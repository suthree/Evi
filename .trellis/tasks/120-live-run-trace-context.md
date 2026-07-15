# Task 120: Live Run Trace Context

## Goal

Expose recent live harness run shape inside bounded context so later agent
turns can understand prior rounds, observations, and evidence refs without
opening raw execution artifacts.

## Scope

- Add a core read model for recent live run traces anchored by completion
  verification reports.
- Summarize model action envelope metadata by round, including action counts
  and completion status.
- Summarize episode event kind counts, observation counts, harness state-action
  counts, context refs, final response refs, and completion status.
- Add a bounded `Live Run Trace` context section.
- Verify the section with both hand-built state artifacts and real
  `LiveAgentRunner` artifacts.
- Update stable docs, Trellis spec, and decisions.

## Non-goals

- Do not read or render raw model responses, action payloads, tool result
  bodies, final response Markdown, context Markdown, or harness artifact bodies.
- Do not add a new CLI or Feishu command surface in this slice.
- Do not request confirmations, rerun actions, invoke the model during context
  assembly, mutate state, write the active vault, or repair historical context
  health issues.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/context_harness.test.ts`
- `pnpm run check`
