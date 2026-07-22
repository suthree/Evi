# ADR 0015: Run Execution lease and model-dispatch recovery

- Status: Accepted
- Date: 2026-07-22
- Decision owner: Operator
- Scope: fourth vNext source slice; not a deployment or ingress cutover

## Context

ADR 0014 can atomically return a paused Run and Turn to `running`, then ask the
same Pi session to continue from reconciled Action evidence. A process exit
after that transition but before the Agent Loop settles leaves canonical Run
state at `running`. No durable record identifies the loop owner, distinguishes
an active process from an abandoned execution, or shows whether a provider
request may already have started.

A blind retry would hide the uncertain provider call, may incur duplicate cost,
and could run beside a delayed old process. Making ingress or a supervisor own
this recovery would spread Pi, SQLite, and settlement knowledge across callers.

## Decision

1. A `Run Execution` is the durable ownership attempt for one invocation of the
   Agent Loop. SQLite creates the first Execution in the same transaction as a
   new Run, and creates each later Execution in the same transaction that
   resumes a paused Run. A `running` Run therefore has exactly one active
   Execution in schema version 3.
2. An active Execution carries a random capability token whose SHA-256 digest,
   not the raw token, is persisted. Its renewable lease defaults to 30 seconds;
   configured lease windows are bounded from 100 milliseconds to five minutes.
   Renewal extends ownership, so the window is a crash-detection delay rather
   than a task-duration limit.
3. The Kernel renews the lease while the Agent Loop runs. If renewal fails, it
   aborts the Pi Adapter and does not let that owner settle the Run. Completion,
   pause, and failure are one SQLite transaction that verifies the current
   lease, requires no active model dispatch, settles the Execution, and settles
   the Run and Turn.
4. The Evi Pi Adapter uses Pi's existing lifecycle hooks; it does not copy or
   patch the Pi loop. Before each logical provider request it records one model
   dispatch bound to the current Execution. Provider response observations may
   update that same dispatch more than once during provider-internal retries.
   Only an assistant `message_end`, after Pi has persisted the message, settles
   the dispatch with its stop reason and message digest.
5. `KernelRuntime.continueRun(runId)` remains the sole recovery Interface. For
   a `running` Run, it refuses recovery while the lease is current. After expiry
   SQLite atomically marks the old Execution `interrupted`, marks its active
   dispatches `outcome_unknown`, and pauses the Run and Turn. The normal
   continuation path then reconciles any unresolved Actions before deciding
   whether Action or execution-recovery evidence can resume the Run.
6. Dispatch recovery preserves the Run, Turn, and Pi session. Evi appends one
   protocol-level recovery message containing only the interrupted Execution
   identity, input digest, bounded provider/model dispatch metadata, and whether
   a response was observed. It is escaped JSON, shares ADR 0014's 128 KiB cap,
   and is explicitly not operator-authored instruction.
7. Dispatch resumption requires at least one exact `outcome_unknown` model
   dispatch, rechecks its interrupted Execution and dispatch IDs, and atomically
   creates a new `dispatch_recovery` Execution. An interrupted Execution with no
   unknown dispatch remains paused for a later protocol-specific recovery path.
   Canonical events contain evidence identities and digests, not prompts,
   payloads, provider headers, credentials, or response bodies.
8. The integration test starts a real child process, lets it enter a faux
   provider with an unsettled dispatch, kills it with `SIGKILL`, waits for lease
   expiry, and proves that a new process completes the same Run and session
   through a second evidenced Execution.

## Consequences

- Model dispatch is not exactly-once. A provider may have generated or billed a
  response that Evi never received; the old dispatch remains
  `outcome_unknown`, and recovery performs a new explicit attempt.
- Recovery remains caller-triggered. This slice adds no scheduler, resident
  scanner, ingress, or automatic retry policy.
- ADR 0016 later adds a Pi-protocol recovery path for the interval after a
  tool-call assistant message is persisted but before matching tool results are
  persisted. It keeps the same read-only Action authority.
- This slice advanced the vNext SQLite schema from 2 to 3. ADR 0016 later
  advances it to 4; since vNext has not cut over, older and unknown versions
  fail closed rather than being migrated.
- `none` and `local_read` remain the only allowed Action effect classes. The
  current v0.2 runtime, ingress, deployment, and state are unchanged.
