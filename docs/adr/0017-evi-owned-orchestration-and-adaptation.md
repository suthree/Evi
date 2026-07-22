# ADR 0017: Evi-owned orchestration and adaptation

- Status: Accepted
- Date: 2026-07-22
- Decision owner: Operator
- Builds on: ADR 0012 through ADR 0016

## Context

The vNext Kernel foundation established Goal-free Runs, Pi `AgentHarness` as the
only model/tool loop, canonical SQLite state, reservation-first Actions, and
bounded recovery. The remaining design question was whether Evi should become a
plugin inside a full agent product such as OpenClaw, rebuild a complete runtime
around Pi, or add orchestration and growth by extending the old v0.2
`GoalRuntime` and Harness.

A full host would also define Goal, Memory, Context, Skill, task, and permission
semantics, leaving Evi subordinate or forcing two competing control planes. Pi
provides execution leverage without claiming those semantics. The old v0.2
owner model proved continuity and evidence but accumulated ordinary execution,
effects, completion, delegation, and learning under one Goal owner.

## Decision

1. Evi is the sole definition owner for Self, optional Goal, Run Outcome,
   effects, parent-child orchestration, and Adaptation. Host runtimes, models,
   tools, and workers never become another Evi self or completion authority.
2. The final target has four Evi-owned deep modules: Runtime Kernel, Action
   Gateway, Orchestration Engine, and Adaptation Engine. Context compilation,
   model-role selection, storage codecs, and concrete adapters remain internal
   seams until real variation justifies an external interface.
3. Pi `AgentHarness`, behind the existing Evi-owned adapter, remains the only
   Agent Loop. Evi owns the SQLite session adapter, immutable Execution Lock,
   Action contracts, evidence, and final outcome. Pi session history is not
   Evi Goal, Memory, Self, or canonical completion state.
4. A Goal is an optional long-lived intent containing objective, acceptance,
   budget, continuation policy, linked Runs, and a terminal Goal outcome. It
   does not own the Agent Loop, Session, worker graph, tools, worktree, Memory,
   or Adaptation. Ordinary work enters as a Goal-free Run.
5. A Supervisor Run owns decomposition, typed worker dispatch, integration,
   independent verification, and final acceptance. It persists and returns
   between events rather than holding one planner-model request open. The
   Orchestration Engine owns Task and Result Envelopes, dependencies, worker
   leases, hierarchical budgets, cancellation, `needs_input`, stale recovery,
   and result delivery, but it neither plans tasks nor owns an Agent Loop.
6. Model selection is a recorded role policy, not domain vocabulary. Planning,
   integration, review, and deep discussion may prefer a stronger reasoning
   model; execution may prefer a faster model. The actual model, effort,
   provider, profile, and fallback rationale are frozen in the Execution Lock
   and dispatch evidence.
7. Source mutation is isolated by Delivery Lineage, not Goal. One
   source-mutating work item owns one baseline-to-integration branch/worktree
   lineage with at most one active writer. A Goal may link multiple independent
   lineages; parallel source work converges through an exclusive Integration
   Run. Child Goals are not created merely to obtain worktrees.
8. Worker dispatch and adaptation activation are effects and cross the Action
   Gateway. Child authority may only preserve or narrow the parent Execution
   Lock. A Result Envelope or worker self-report is advisory until the
   Supervisor Run verifies and accepts it.
9. Self-learning and self-evolution share one Adaptation lifecycle: evidence,
   candidate, evaluation, activation, observation, and revision, retirement, or
   rollback. A versioned Self Registry records active and retired artifacts.
   Capability inventory and competence remain rebuildable views rather than a
   separate broad Capability Manager state owner.
10. Structured state remains in one SQLite authority. Large immutable bodies
    may be content-addressed artifacts; JSONL, directories, dashboards, and
    indexes are projections or archives. Completion evidence stays specialized:
    Run Outcome, Effect Receipt, Worker Dispatch Receipt, Evaluation Receipt,
    Activation Receipt, and Deployment Receipt are not collapsed into one
    universal receipt.
11. OpenClaw, Hermes, GenericAgent, Codex, and pi-subagents remain reference
    architectures or bounded execution surfaces. None defines Evi state or
    runtime semantics. No generic multi-host interface is added before a second
    real host adapter exists.

## Consequences

- The current v0.2 runtime remains the deployed rollback implementation until a
  separately verified vNext cutover. Its `GoalRuntime`, per-Goal worktree, and
  universal `OutcomeReceipt` remain factual v0.2 behavior, not vNext targets.
- The immediate next slice is the explicit read-only ingress canary. It does not
  enable workers, learning, state migration, write/external Actions, or a
  deployment switch.
- Later delivery order is basic ingress and continuity, parent-child
  orchestration, supervised self-learning, active discovery and assimilation,
  then self-evolution. Passing one gate does not automatically start the next.
- Existing `delegate_agent`, `codex.run`, and host-specific delegation paths may
  remain during migration, but the target exposes one worker-dispatch semantic
  through the Orchestration Engine and Action Gateway. Superseded paths are
  deleted after cutover rather than retained as peer control planes.
- If the Pi adapter reaches ADR 0012's fork-shaped exit condition, Evi replaces
  the loop implementation without changing the four-module ownership model.
