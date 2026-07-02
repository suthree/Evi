# Skills

Skills are agent procedural memory: reusable ways of doing work.

This directory documents the skill model. Active skills live under the local
active vault selected by `LOCAL_RUNTIME_HOME`; repository `vault/skills/` and
`vault/registry/` are seed/dev fixtures.

## What Counts as a Skill

A skill should have:

- a clear trigger
- required inputs
- expected outputs
- step-by-step procedure
- tool requirements
- safety and permission notes
- examples or tests
- known failure modes
- revision history or evidence of use

A one-off instruction is not a skill. A repeated workflow with evidence is a skill signal.

## Active Learning Signals

The agent should draft and validate a skill when it sees:

- the same demand appear three separate times
- the same task pattern recur across sessions
- the same failure or correction recur
- a workflow succeed after nontrivial exploration
- a delegated agent surface produce a result that the agent can verify and reuse

The signal triggers autonomous drafting and validation. Promotion to a durable skill happens automatically when the promotion criteria pass.

## Skill Lifecycle

1. **Experience**: the agent completes a task and records the raw episode.
2. **Pattern**: reflection notices the task or error pattern may recur.
3. **SOP draft**: a concise procedure is proposed in `sop/`.
4. **SOP iteration**: the SOP changes quickly as new evidence arrives.
5. **Autonomous audit**: the SOP is checked against evidence, trigger clarity, verification, failure modes, and rollback rules.
6. **Skill promotion**: the audited SOP is moved into a skill with references or scripts when the promotion gate passes.
7. **Use**: future tasks invoke the skill when its trigger matches.
8. **Telemetry**: outcomes are recorded.
9. **Curate**: revise, split, merge, archive, or retire the skill.

## Skill Package

```md
---
name: skill-name
description: When this skill should trigger and when it should not.
---

# Skill Name

## Procedure

## Verification

## Failure Modes

## Evidence
```

Only `name` and `description` belong in the frontmatter. Source SOP refs, audit
refs, content hash, status, usage counters, and version information belong in
the local active vault registry. Repository `vault/registry/` may carry
seed/dev snapshots only.

## Promotion Rules

Promote an SOP into a skill when:

- it solved a real problem
- it is likely to recur
- it can be described without relying on hidden context
- it has clear boundaries
- it can be verified by autonomous audit
- autonomous audit passes

Do not promote:

- temporary task plans
- project-specific rules that belong in project docs
- fragile hacks without known limits
- workflows that include secrets or unsafe assumptions

## Relationship to Memory

Memory may point to a skill, but the full procedure should live in the skill package. This keeps durable memory compact and makes procedures easier to test and revise.

Host-specific exports such as `.agents/skills` symlinks can be generated later. They are not the the agent source of truth.

## Audit Standards

Audit standards are also part of the growth system. They may be improved when repeated bad promotions, missed promotions, or weak verification patterns are observed.

Changing audit standards is a governance change, not an ordinary skill change. It requires a stronger signal than changing an ordinary SOP:

- multiple evidence examples
- comparison against previous outcomes
- rollback plan
- monitoring after the change

See `governance/README.md` for the self-modification tiers.
