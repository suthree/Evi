# ADR 0005: Typed cognition envelope for Goal decisions

- Status: Accepted
- Date: 2026-07-20
- Decision owner: Operator

## Context

Goal cognition used a strict outer Codex schema whose only required field was
`decision_json: string`. A malformed decision could therefore satisfy the
provider-facing schema and fail only when Evi parsed that inner string. The
failure remained fail-closed, but the model boundary did not express the
actual `action`, `outcome`, or `blocked` contract.

## Decision

1. The Codex output schema contains one typed `decision` envelope whose
   `action`, `outcome`, or `blocked` branch is complete and schema-bound. The
   provider's strict-schema mode requires every declared property of an object
   to be required, so the envelope holds the mutually exclusive direct
   variants. Action arguments use a typed key/value array and are projected
   deterministically to the runtime tool contract; the decision is never
   encoded as JSON inside a string.
2. Model output must parse as one exact JSON object before GoalRuntime runs its
   existing semantic validation. Evi does not strip prose, repair JSON, coerce
   fields, or automatically retry malformed cognition output.
3. Schema validation never grants execution authority. GoalRuntime, effect
   policy, canonical evidence, verification, and OutcomeReceipt remain the
   separate owners of execution and completion.
4. Malformed output remains a bounded fail-closed observation. It may justify
   a later evidence-backed repair Goal, but it cannot select a tool, create an
   effect, or claim completion.
5. A nonzero Codex CLI exit preserves only a bounded, redacted `error` or
   `turn.failed` JSONL diagnostic when stderr is insufficient. It is failure
   evidence, never a cognition decision or retry instruction.

## Consequences

- The provider-facing contract now rejects structural errors at the boundary
  closest to their source.
- The typed JSON schema and GoalRuntime semantic schema are deliberately
  layered: the former bounds transport shape; the latter enforces current
  capability, authority, and domain rules.
- Typed argument entries preserve strings, safe integers, booleans, and string
  arrays without open JSON objects. Duplicate keys, unknown variants, and
  malformed entries fail closed before the semantic tool contract is applied.
- No automatic repair loop is introduced, so malformed responses retain a
  visible recovery cost and cannot silently alter a proposed decision.

## Re-evaluation

Re-evaluate if the configured cognition provider changes its structured-output
guarantees, or if a code-first shared schema source can replace the maintained
transport-schema projection without weakening fail-closed behavior.
