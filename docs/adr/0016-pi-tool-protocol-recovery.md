# ADR 0016: Pi tool-protocol recovery and Kernel foundation exit

- Status: Accepted
- Date: 2026-07-22
- Decision owner: Operator
- Scope: fifth vNext source slice; not a deployment or ingress cutover

## Context

ADR 0015 recovers an expired Run Execution when a provider dispatch remains
unsettled, but deliberately leaves one interval fail-closed: Pi may persist an
assistant tool-call message, Action Gateway may reserve or finish its effect,
and the process may exit before Pi persists the matching tool-result message.
Blindly prompting again can present an invalid provider transcript or execute a
terminal Action twice.

The installed Pi 0.81.1 implementation gives Evi usable ordering evidence
without copying the loop. `AgentHarness` persists assistant `message_end` before
tool execution. Action Gateway commits reservation and terminal receipt before
returning to Pi. Pi then persists each `toolResult` before it starts the next
provider dispatch. Those facts make recovery derivable from existing canonical
state: the active Pi session branch, Action reservations and receipts, and Run
Execution lineage.

## Decision

1. Evi does not add a parallel tool-protocol ledger or a second Agent Loop. A
   Pi protocol step is closed when every persisted assistant `toolCall` on the
   current session branch has exactly one later matching `toolResult` before a
   new user or assistant message.
2. Before a recovery Execution calls Pi, the Pi Adapter scans the current
   session context. For each unmatched tool call it invokes Action Gateway with
   the exact Run, Turn, tool-call ID, tool name, and arguments already persisted
   by Pi. It never invokes a tool directly.
3. Action Gateway resolves that exact invocation by durable state:
   - no reservation: apply current policy, reserve, then dispatch once;
   - `reserved`: the effect has not entered dispatch and may be dispatched once;
   - `dispatching` or `outcome_unknown`: reconcile only, never replay;
   - terminal receipt: reuse the receipt and do not execute or reconcile again.
4. The Adapter appends one Pi-compatible `toolResult` from the exact Gateway
   result. A terminal success retains the receipt identity and bounded output.
   A terminal failure uses Pi's bounded error form containing the receipt
   identity; the canonical receipt retains its output. Denial or unknown
   outcome becomes the same bounded error result Pi would have emitted. An
   unknown Action then pauses the Run before a new provider request.
5. SQLite schema version 4 records each Execution's `session_start_seq` and
   optional `recovery_of_execution_id`. Recovery follows that lineage
   transitively, rejects cycles or identity drift, and can distinguish messages
   written by the interrupted lineage from older session history.
6. A persisted terminal assistant answer written by the interrupted lineage is
   authoritative Run evidence. The Adapter returns it without another provider
   request. A closed tool-result tail receives one bounded recovery prompt and
   proceeds to the next provider dispatch.
7. `KernelRuntime.continueRun(runId)` remains the sole recovery Interface. It
   still prefers terminal Action evidence, uses dispatch recovery when an
   unknown dispatch exists, and creates a `protocol_recovery` Execution when an
   interrupted Execution has no unknown dispatch. The caller does not learn Pi
   message shapes or protocol-repair steps.
8. Recovery fails closed for reused or mismatched tool-call identities, a user
   or assistant message before prior tool calls close, invalid recovery lineage,
   missing handlers, or Action evidence that remains non-terminal.
9. Integration tests use real child processes and `SIGKILL` at five durable
   windows: assistant persisted before reservation, reservation before
   dispatch, receipt before tool result, tool result before next dispatch, and
   terminal assistant answer before Run settlement. Every recoverable path must
   keep the same Run, Turn, and session and produce at most one Action receipt
   and one matching tool result.
10. Passing this slice is the planned Kernel-foundation exit gate. Unless a new
    correctness defect is evidenced, the next vNext phase is a separately
    accepted read-only ingress canary, not another generalized lease, harness,
    or recovery layer.

## Consequences

- Action execution is still not universally exactly-once. Safety comes from
  reservation-before-dispatch, state-specific replay rules, handler-specific
  reconciliation, and exact session repair.
- Protocol repair is caller-triggered through `continueRun`; there is still no
  scheduler, resident scanner, automatic retry policy, migration, or ingress.
- Schema versions 1 through 3 and unknown versions fail closed because vNext
  has not cut over and owns no migration obligation yet.
- `none` and `local_read` remain the only permitted Action effect classes.
  Write/external authority needs its own policy, containment, credential,
  verification, and canary evidence; protocol recovery alone does not grant it.
- Current v0.2 source, state, service, Feishu/Web ingress, and rollback identity
  remain unchanged.
