# ADR 0014: Run continuation after Action reconciliation

- Status: Accepted
- Date: 2026-07-22
- Decision owner: Operator
- Scope: third vNext source slice; not a deployment or ingress cutover

## Context

ADR 0013 pauses a Run instead of completing it when an Action outcome remains
unknown. The Action Gateway can later reconcile that reservation into a
terminal Effect Receipt, including after SQLite is reopened, but the second
slice intentionally stops there. A caller would otherwise have to coordinate
Gateway reconciliation, Run state transitions, Pi session recovery, and final
settlement itself.

Pi persists the failed tool execution as an immutable error `toolResult` and
may persist a later assistant response in the same session. `AgentHarness` does
not expose an Interface for replacing that historical result and continuing
from its exact internal loop position. Rewriting the Pi session branch would
couple Evi recovery to Pi internals and would erase evidence that the outcome
was originally unknown.

## Decision

1. `KernelRuntime.continueRun(runId)` is the sole caller-facing continuation
   Interface. The Kernel Module hides Action reconciliation, evidence
   selection, the paused-to-running transition, Pi session reconstruction, and
   final completion/pause/failure settlement.
2. The Kernel first asks its one Action Gateway to reconcile all unresolved
   reservations. The same Gateway instance is passed into every Agent Loop, so
   Pi cannot be composed with a different action authority. If any reservation
   remains unresolved, the Run stays `paused` and no provider/model call occurs.
3. Continuation is allowed only for the current paused Run and Turn, with zero
   unresolved reservations and at least one reconciled Effect Receipt observed
   after the latest canonical pause event. SQLite rechecks those exact receipt
   IDs and atomically changes the Run and Turn back to `running`. A concurrent
   or repeated continuation cannot start a second loop from the same paused state.
4. The original Pi transcript remains immutable. Evi starts one continuation
   turn in the same Run, Turn, and session. Its protocol-level user message is
   explicitly marked as Evi-generated recovery evidence, not operator-authored
   instructions. It carries the exact invocation, contract version, digest,
   receipt, outcome, summary, and bounded output for each reconciled Action.
5. Recovery evidence is serialized as escaped JSON and limited to 128 KiB in
   aggregate before the Run resumes. Oversized or missing evidence leaves the
   Run paused. The canonical `run_continued` event stores only ordered receipt
   IDs and the SHA-256 evidence digest, not the rendered evidence body.
6. The continuation uses the same loop construction and settlement path as an
   initial submission. A new unknown Action pauses the Run again; a terminal
   model failure with no unresolved Action fails it; a non-empty text answer and
   zero unresolved reservations complete it.
7. Run continuation is runtime control state, not a new universal receipt and
   not an Adaptation. `RunInspection.continuation_count` is derived from
   canonical `run_continued` events.

## Consequences

- Recovery does not forge a replacement tool result, delete the original error,
  or depend on Pi tree-navigation internals. The model sees both the historical
  uncertainty and the later authoritative terminal evidence.
- This slice resumes one paused Run only when explicitly called. It adds no
  scheduler, automatic retry, new Goal, new Turn, or external communication.
- It does not make provider/model dispatch exactly-once. ADR 0015 later adds a
  leased recovery attempt when the process disappears before settlement; the
  old provider dispatch remains explicitly uncertain.
- `none` and `local_read` remain the only permitted Action effect classes.
  Write/external policy, containment, ingress, migration, and deployment remain
  separate slices. The current v0.2 runtime and state are unchanged.
