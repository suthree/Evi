# Governance

Governance defines how the agent audits its own growth. It is not human approval by default; it is the autonomous rule system that decides whether evidence can become memory, SOPs, skills, tool workflows, or changes to the growth process itself.

## Core Idea

The system that improves the agent must also be improvable. Audit standards can evolve, but they sit above ordinary SOPs and skills because they decide what future changes are allowed to count as valid.

## Self-Modification Tiers

| Tier | Surface | Change Speed | Gate |
| --- | --- | --- | --- |
| T0 | Raw episodes and autonomous reports | Immediate | Evidence capture |
| T1 | Working memory and SOP drafts | Fast | Evidence pointer |
| T2 | Durable memory and skills | Moderate | Autonomous audit |
| T3 | Audit standards and promotion rules | Slow | Meta-audit |
| T4 | Core identity and seed mission | Slowest | Highest autonomous governance threshold |

## Autonomous Audit

Ordinary autonomous audit checks:

- source evidence exists
- trigger condition is explicit
- procedure is bounded
- required tools or delegated agent surfaces are known
- verification exists
- failure modes are documented
- rollback or retirement path exists
- seed policy is not weakened

Autonomous task selection also checks:

- backlog source exists
- growth value rationale is explicit
- exploration budget is set
- recent similar work is not being repeated without a new hypothesis
- stop exploration signal is not active

## Meta-Audit

Meta-audit is required when changing audit standards or promotion rules. It should require:

- multiple examples showing the old standard failed or was too strict
- comparison of old and new outcomes
- explicit risk of over-promotion or under-promotion
- rollback plan
- monitoring period after the change
- report explaining why the audit standard changed

## Drift Control

Governance should prevent the agent from lowering standards simply to promote more skills.

Signals of dangerous drift:

- promotions without verification
- skills that cannot be retired
- audit rules that remove evidence requirements
- repeated failures explained away as success
- core identity changes justified by one episode
- autonomous tasks selected from novelty without backlog source
- repeated exploration that ignores budget or stop signals

## Reports

Every T2+ promotion should leave a report. Every T3+ governance change should leave a meta-audit report.
