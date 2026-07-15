# Task 125: Delegated Result Contract

## Goal

Make `delegate_agent` output harness-validated before it can feed back into the
main model round or completion verification.

## Scope

- Require delegated subcalls to return JSON with non-empty `summary` and
  `findings_text`.
- Record `contract_status`, bounded findings, bounded raw preview, error, and
  explicit self-report boundary on delegated result artifacts.
- Treat malformed delegated output as `ok=false`.
- Preserve existing completion verification behavior so failed delegated
  results fail a later `done` claim.
- Update capability catalog wording, stable docs, Trellis spec, and decisions.

## Non-goals

- No separate autonomous subagent runtime.
- No delegated tools, memory, repo writes, state writes, active-vault writes, or
  external side effects.
- No retry/repair loop for malformed delegated output.
- No promotion of delegated output into durable semantic memory or SOP evidence
  without normal harness evidence.

## Verification

- `node --import tsx --test tests/context_harness.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
