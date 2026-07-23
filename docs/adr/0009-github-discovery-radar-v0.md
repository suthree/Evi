# ADR 0009: GitHub-only proposal-only discovery before capability assimilation

- Status: Accepted
- Date: 2026-07-21
- Decision owner: Operator

## Context

Evi needs a supervised way to notice potentially relevant external projects
without converting trending content into runtime instruction, a Tool Contract,
a capability, a skill, or an activation. GitHub trends are discovery signals,
not product requirements or evidence that an external project is safe or useful
for Evi's local self-growing mission.

## Decision

Provide one manually invoked, GitHub-only Discovery Radar v0. It reads the
fixed public GitHub Trending weekly page without authentication and requires an
explicit business-need label. It writes a bounded state-only report containing
repository identifiers, fixed source provenance, timestamps, de-duplication
counts, and the `external_untrusted` classification. It suppresses duplicates
within one page and against the latest successful report.

The report is proposal-only and stays outside default context, the Opportunity
Backlog, Capability Portfolio, active vault, SOP/skill promotion paths, and
LuBan. It retains no raw page text, project specification, description, README,
repository file, credential, or remote instruction. It has no scheduler and
does not browse X or another source, clone or download repository contents,
authenticate, install, execute, activate a capability, promote a learning
asset, or produce an external Git effect.

Any follow-on work starts as a separately governed Capability Candidate. It
must name the business linkage, bounded probe, risk, budget, verification, and
retirement path. Tool Contract, Tool Operation Protocol, Capability Profile,
and Skill remain distinct artifacts; none is created from a discovery signal by
implication.

## Consequences

- Discovery can create an inspectable queue of small, untrusted references
  without making external content resident prompt context or runtime authority.
- A public scan proves only that GitHub returned identifiers at one point in
  time; it is not capability competence, safety, usefulness, or a causal
  outcome claim.
- The initial surface is deliberately narrow. Expanding sources, adding a
  scheduler, adding authentication, or introducing any activation path requires
  a new Direction Proposal and Decision Owner acceptance.

## Re-evaluation

Re-evaluate after two weeks of manual reports and explicit candidate reviews,
or earlier if a report cannot remain bounded, unauthenticated, and outside
default context. Evaluate false-positive rate, business-linkage quality,
operator review burden, and whether any observed need justifies a separately
governed capability assimilation slice.
