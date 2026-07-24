# ADR 0018: v0.3 tool-first Pi and learning baseline

- Status: Accepted
- Date: 2026-07-24
- Decision owner: Operator

## Context

Earlier v0.2 and vNext records preserve useful implementation, rollback, and
research evidence, but they are no longer the default architecture or planning
route. Evi needs a compact current baseline that increases execution leverage
without turning Evi into a replacement browser, publisher, search engine, or
workflow platform.

## Decision

v0.3 is the current architecture and planning baseline. Evi is a minimal,
local control plane: it owns task and Run boundaries, tool authorization,
context selection, evidence, experience, the Skill/Adaptation lifecycle, and
final acceptance. Pi is the execution surface; a future Pi subagent is only a
bounded execution surface. Neither transfers Evi action authority, durable
state ownership, evidence ownership, or acceptance authority, and a subagent
self-report is never completion evidence.

Existing tools and adapters perform their specialist functions. Evi supplies a
thin Tool Contract and Tool Operation Protocol layer, rather than rebuilding
specialist products. A Skill is a verifiable reusable tool-use procedure.
Experience records preserve actual outcome, cost, failure, and provenance;
they can produce candidates for SOPs or Skills, which require evaluation,
activation, revision, and retirement evidence.

GenericAgent/GA L0--L4, compact indexes, and experience-to-SOP patterns are
references only. They are not Evi state, runtime, or implementation standards.
v0.2 records, including its ADRs, documents, task records, and runtime
evidence, remain a dated Historical Archive and rollback evidence. They are
retrieved only through an explicit historical route and are not an active
owner.

## Implementation status and sequence

This ADR is a documentation and planning baseline, not a runtime cutover. It
does not claim that Pi subagents, fully autonomous Skill promotion, or every
v0.3 ingress are implemented. Source, tests, and verified runtime evidence
remain the authority for implemented behavior.

The next evidence order is: first obtain verified Pi tool-execution evidence;
then evaluate experience-to-Skill candidates; only then consider a controlled
Pi subagent. Do not expand broad orchestration ahead of those gates.

## Consequences

- Current entrypoints route to this ADR and v0.3 first; v0.2 is explicitly
  historical and recoverable rather than deleted or rewritten.
- A tool or Pi result is input to Evi verification, not an acceptance fact.
- Any source, runtime, deployment, or external effect remains separately
  decision-owned and must retain its evidence and recovery path.
