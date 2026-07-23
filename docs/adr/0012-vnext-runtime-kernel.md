# ADR 0012: vNext runtime kernel

- Status: Accepted
- Date: 2026-07-22
- Decision owner: Operator
- Supersedes: ADR 0001 for the vNext target; ADR 0001 remains the v0.2 implementation record until cutover

## Context

Evi v0.2 proved durable Goal continuity, bounded effects, evidence capture, and
local recovery, but accumulated those responsibilities inside `GoalRuntime` and
its Harness. Ordinary work became a Goal, the execution loop and governance
state shared one owner, and later learning features had to attach to that owner.
This made the control plane larger while making routine execution less direct.

The accepted redesign favors a small runtime foundation over runtime
compatibility. GenericAgent remains a useful product-flow reference, while Pi,
OpenCode, OpenClaw, Hermes, Codex, and pi-subagents contribute narrower patterns;
none of them is Evi's architecture by itself.

## Decision

1. A `Turn` is the ordinary unit of submitted work. A `Run` contains one or
   more Turns. Neither requires a Goal.
2. Pi `AgentHarness`, accessed only through an Evi-owned adapter, is the sole
   owner of the model/tool execution loop, session tree, steering, follow-up,
   and context-compaction lifecycle. Evi must not retain a second execution
   loop beside it.
3. One SQLite database is the canonical structured runtime state for Runs,
   Turns, session entries, action reservations, receipts, and adaptation
   records. Large immutable bodies may live in content-addressed artifacts, but
   JSONL files and directory scans are not a second state authority.
4. Every tool or durable effect crosses an Evi-owned `Action Gateway`. The
   gateway owns typed action contracts, policy decisions, containment,
   reservation-before-dispatch, evidence capture, and reconciliation. Tool
   visibility to Pi is never an authority grant.
5. A `Goal` is an optional long-lived intent extension. It owns an objective,
   acceptance criteria, budget, continuation policy, and links to Runs; it does
   not own the agent loop, tools, session persistence, or ordinary task ingress.
6. Self-learning and self-evolution share one `Adaptation` lifecycle: evidence
   creates a candidate, evaluation tests it, activation makes it current, and
   rollback or retirement removes it. They differ by target and risk.
   Self-learning changes retained knowledge or procedure; self-evolution changes
   tools, policy, dependencies, source, runtime, or deployment. A source change
   is an `Evolution Attempt`, not an automatically accepted improvement.
7. Receipts are specialized. Every Run has a `Run Outcome`; only actions,
   evaluations, activations, or deployments that occur produce their matching
   receipt. One universal completion receipt must not become a second workflow
   engine.
8. vNext has no runtime compatibility layer and no long-lived dual write. v0.2
   stays intact as the rollback runtime until a separately verified cutover;
   after cutover, superseded owners are deleted rather than wrapped indefinitely.

## Consequences

- The first executable slice proves one Goal-free Turn, Pi as the only loop
  owner, and SQLite as the only persisted state authority. It has no production
  ingress, tools, learning, subagents, or deployment switch.
- The second source slice implements the reservation-first Action Gateway and
  one bounded `local_read` action under ADR 0013. It still has no production
  ingress, write/external action authority, learning, subagents, or deployment
  switch.
- The third source slice implements explicit same-Run continuation after
  terminal Action reconciliation under ADR 0014. It does not claim recovery
  from a crash during the continuation provider dispatch.
- The fourth source slice implements leased Run Execution ownership and
  bounded recovery of unsettled model dispatches under ADR 0015. It does not
  claim provider exactly-once or recovery of an incomplete tool-call protocol.
- The fifth source slice implements persisted Pi tool-call protocol recovery
  and the Kernel-foundation exit gate under ADR 0016. It does not grant
  write/external authority or constitute an ingress canary.
- Pi is pinned to an exact version and imported only by the adapter. If keeping
  that adapter requires copying or patching roughly a thousand lines of Pi
  internals, or two upgrades require semantic rewrites, Evi will own a smaller
  loop instead of maintaining a fork-shaped compatibility layer.
- The first slice uses the analyzed `@earendil-works/pi-agent-core` and
  `@earendil-works/pi-ai` packages at `0.81.1`, because that line exposes the
  `AgentHarness` and storage seams being evaluated. This is a replaceable
  dependency choice, not an architectural transfer of state or effect ownership.
- The current v0.2 runtime contract remains factual until cutover. Stable docs
  must label vNext as accepted target or implemented slice rather than claiming
  deployment.
- Deployment, state migration, ingress replacement, write/external Action
  Gateway authority, read-only canary operation, learning, and subagent
  execution remain separate verified slices.
