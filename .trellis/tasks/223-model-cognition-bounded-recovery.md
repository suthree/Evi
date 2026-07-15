# Task 223: Model Cognition Bounded Recovery

Status: implemented

## Problem

A real basic task exposed two transient cognition failures: an upstream 408
stream timeout and a successful response whose action envelope failed schema
parsing. Both terminated the run immediately even though no tool action had
executed, making the resident loop unnecessarily brittle.

## Scope

- Apply the configured timeout to text-model requests.
- Retry one transient OpenAI-compatible HTTP or transport failure.
- Record bounded request-attempt metadata when the retry recovers.
- Permit one harness-owned format-repair model round after an invalid action
  envelope while preserving the failed diagnostic and blocked envelope.
- Require the repaired envelope to pass normal evidence and completion gates.

## Non-goals

- No model failover, fan-out, provider switching, unbounded retry, or retry of
  authentication, billing, tool, mutation, or external-write failures.
- No raw provider error, model output, or payload persistence.
- No authority gain from a diagnostic or failed envelope.

## Acceptance

- HTTP 408/409/429, 5xx, timeout, and bounded network failures receive at most
  one client retry; non-transient HTTP failures receive none.
- A successful retry records generic attempt and recovered-failure metadata.
- One invalid envelope may be followed by one explicit format-repair round.
- A recovered run preserves diagnostic lineage and can be verified only from a
  later valid envelope and ordinary harness evidence.
- A second invalid envelope remains `blocked_model_error`.

## Verification

- `node --import tsx --test tests/model_client.test.ts tests/context_harness.test.ts`
- `pnpm run check`
- A real read-only Git alignment task completes with tool evidence after the
  resident service is restarted on the merged commit.
