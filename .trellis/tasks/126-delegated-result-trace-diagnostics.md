# Task 126: Delegated Result Trace Diagnostics

## Goal

Expose bounded delegated result contract status in live run trace context and
operator views without reading delegated result artifact bodies.

## Scope

- Add delegated result total, passed, and failed counts to live run trace
  summaries.
- Derive failed counts from the completion verification `delegated_results`
  check and total counts from episode `delegated_result` event metadata.
- Render delegated result pass/fail counts in bounded context and Feishu live
  trace views.
- Update stable docs, Trellis spec, and decisions.

## Non-goals

- No delegated result body reads in context or operator views.
- No retry, repair, or revalidation of delegated result artifacts.
- No promotion of delegated output into durable memory, SOP evidence, or
  completion proof.
- No service action, model invocation, confirmation request, or state mutation
  from trace inspection.

## Verification

- `node --import tsx --test tests/context_harness.test.ts tests/feishu_adapter.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run check`
