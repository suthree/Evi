# ADR 0013: Reservation-first Action Gateway

- Status: Accepted
- Date: 2026-07-22
- Decision owner: Operator
- Scope: second vNext source slice; not a deployment or ingress cutover

## Context

ADR 0012 made Pi the only Agent Loop owner while keeping effect authority and
evidence inside Evi. The first vNext slice proved a Goal-free Turn, a narrow Pi
adapter, and one SQLite state authority, but deliberately exposed no tools. The
next slice must prove that a Pi tool call cannot bypass Evi or become an unsafe
replay after a process or provider failure.

This decision needs one useful end-to-end action without prematurely claiming
general write authority, external-effect containment, Run continuation, or
production readiness.

## Decision

1. `ActionGateway` is one deep Evi-owned module. Its caller-facing interface is
   limited to listing typed contracts, invoking one action, and reconciling the
   unresolved actions of one Run. Pi sees only contracts projected by its Evi
   adapter; it never receives an action handler or SQLite access.
2. Every Tool Contract has an exact version, parameter schema, and effect
   class. A handler's `prepare` step must convert model input into bounded,
   JSON-safe, persistence-safe arguments before reservation. Future credentials
   must be represented by resolvable references, never raw secret values in a
   reservation.
3. Before handler dispatch, SQLite commits one Action Reservation bound to
   `run_id`, `turn_id`, Pi `toolCallId`, action name, contract version, effect
   class, canonical arguments, and a SHA-256 action digest. The durable record
   contains no raw prompt.
4. One `(run_id, toolCallId)` identifies one invocation. Reusing that identity
   with a different Turn, contract version, effect class, or digest fails
   closed. A matching terminal receipt is reused; a matching unresolved action
   enters reconciliation. It is never blindly dispatched again.
5. Reservations progress through `reserved`, `dispatching`,
   `outcome_unknown`, and `terminal`. Once dispatch begins, a thrown handler or
   missing terminal observation means unknown outcome, not failure. Only a
   matching handler and reconciliation observation may create the terminal
   Effect Receipt.
6. An Effect Receipt records the exact reservation identity, contract version,
   digest, observed success or failure, bounded summary/output, and whether the
   observation came from reconciliation. It is action evidence, not a Run
   Outcome, capability proof, or universal completion receipt.
7. A Run with any non-terminal reservation cannot complete. The current Kernel
   records that Run and Turn as `paused`; it does not report success or replay
   the action.
8. This slice's source-owned policy permits only `none` and `local_read` effect
   classes. `local_write`, `external_read`, and `external_write` are denied
   before preparation, reservation, or dispatch. The sole production action is
   `runtime_inspect`, a bounded SQLite read of the current Run.
9. The vNext SQLite schema advances from the pre-gateway spike version `1` to
   version `2`. Because vNext has not cut over, version `1` and unknown schemas
   fail closed rather than acquiring a compatibility migration or dual-write
   path. The deployed v0.2 state and service are unchanged.

## Consequences

- The Pi adapter is the only Pi-dependent module and maps Gateway contracts to
  sequential Pi tools. Production and synthetic test handlers are the real
  internal variation seam; there is no speculative policy-provider interface.
- Reservation, state transitions, event evidence, and receipt creation are
  transactionally local to the SQLite store. Argument and observation bodies
  are size-bounded, but this is not an OS or filesystem sandbox.
- Reconciliation can terminalize an action after restart, but this slice does
  not resume the paused Pi/model loop. Run continuation and recovery is the
  next separate runtime slice.
- Write and external actions require a later accepted policy, containment,
  credential-reference, verification, and recovery design. Registering a
  handler alone cannot make those effect classes executable.
- No CLI, Web, IM, or API ingress uses vNext yet. No service was restarted or
  deployed, and v0.2 remains the current rollback runtime.
