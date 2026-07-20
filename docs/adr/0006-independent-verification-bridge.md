# ADR 0006: Independent verification after delegated execution

- Status: Accepted
- Date: 2026-07-20
- Decision owner: Operator

## Context

Evi is a learning orchestrator, not a generic agent whose main capability is
calling files and shell commands. A delegated coding surface can report that it
ran tests, but that report is still delegated execution evidence. Treating it
as canonical verification would let one executor select, perform, and certify
its own work. Repeating the same successful no-change delegation does not
create independent evidence and can trap a Goal in an apparent-progress loop.

## Decision

1. `codex.run` self-reported tests, checks, changed-files, and completion
   claims remain non-canonical diagnostics. They never satisfy a Goal's
   independent verification requirement or justify an `OutcomeReceipt`.
2. After a successful no-change delegated observation leaves a Goal with an
   unresolved independent-verification obligation, GoalRuntime exposes derived
   feedback that rejects another matching delegated verification action. The
   next admissible evidence path is a bounded, non-delegated `command.run`
   action with `purpose="verification"`; if it is unavailable or cannot be
   proposed safely, the Goal blocks rather than treating delegation as proof.
3. This is a selection constraint, not an automatic test pipeline. Goal
   cognition remains responsible for choosing the narrow verification command
   from the current Capability Portfolio and evidence. Harness remains
   responsible for command containment, unchanged-workspace snapshots,
   canonical observation, and receipt acceptance.
4. Direct commands are therefore a narrow verification/recovery substrate,
   not Evi's default production behavior. Specialist production is delegated
   when fit, and tool protocols or domain procedures become skills only when
   reusable evidence justifies them.

## Consequences

- A successful no-change delegation cannot be repeated to manufacture
  confidence; the Goal either obtains independent evidence or remains
  incomplete.
- The new feedback is derived from canonical events and has no durable state,
  authority, task router, or automatic command owner.
- Capability selection retains dynamic tool choice for ordinary work. The
  narrow bridge applies only to the unresolved evidence role created by the
  delegated no-change result.

## Re-evaluation

Re-evaluate if a future delegated surface can provide independently attested
test evidence with a verified trust boundary, or if the Goal model gains a
typed reusable verification-plan contract that can preserve the same ownership
split without a fixed command path.
