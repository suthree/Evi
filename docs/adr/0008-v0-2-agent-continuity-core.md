# ADR 0008: v0.2 durable agent-runtime core before capability expansion

- Status: Accepted
- Date: 2026-07-21
- Decision owner: Operator

## Context

v0.2 can appear to be a registry, synchronization, or tool-growth project.
That would let new skills and Tool Protocols outpace the runtime's ability to
preserve one Goal, compile authoritative context, verify effects, recover from
failure, or explain the identity of an active node. The resulting system would
grow surfaces without becoming a durable self-growing agent.

## Decision

v0.2 first establishes six domain-independent core capabilities: Goal
continuity; context compilation; evidence-directed self-supervision; runtime
self-observation and recovery; an evidence-derived capability and boundary
self-model; and pinned asset identity with node-local projection, receipt,
probation, and rollback.

Learning, SOP/skill promotion, and Tool Protocol growth are extensions of this
core. The first four capabilities take delivery priority over additional asset
classes or workflow surfaces. LuBan distributes accepted immutable assets only;
it does not own Goal continuity, runtime state, raw memory, task routing,
installation authority, or node activation. Dream Consolidation remains
proposal-only. A shared MemoryStore, generic multi-agent scheduler, automatic
asset promotion, and hosted control plane are not v0.2 core.

## Consequences

- A feature counts as core only when it makes the same agent more continuous,
  bounded, inspectable, recoverable, or provenance-preserving across projects
  and nodes; a provider-specific workflow remains an Application Slice or
  procedural asset.
- A node may activate a different compatible asset set, but must expose its
  exact Evi build, LuBan source, selection lock, and activation result.
- New learning and tool surfaces must use the existing Goal, context, harness,
  evidence, and rollback boundaries rather than creating a parallel control
  plane.

## Re-evaluation

Re-evaluate after one end-to-end multi-node acceptance drill proves all six
capabilities, or if a proposed core addition cannot be expressed through the
same Goal, context, evidence, and recovery ownership.
