# SOP Layer

The SOP layer is the fast-moving procedure layer between raw experience and durable skills.

## Purpose

The agent should not promote every successful task directly into a skill. It should first capture a reusable procedure as an SOP, then revise that SOP as more evidence appears.

An SOP is allowed to be rougher, narrower, and more experimental than a skill. A skill is what remains after autonomous audit decides the procedure is reusable enough.

## SOP Lifecycle

```text
episode evidence
  -> SOP draft
  -> repeated use or active learning signal
  -> SOP revision
  -> autonomous audit
  -> vault skill promotion or retirement
```

## SOP Entry Shape

```md
# SOP Title

## Trigger

When this SOP should be considered.

## Procedure

Steps that worked.

## Evidence

Episodes, reports, tool results, or delegated agent outcomes that support it.

## Verification

How the agent checks whether the SOP worked.

## Failure Modes

Known ways this SOP can fail.

## Promotion Notes

What must be true before this SOP becomes a skill.
```

## Fast Evolution

SOPs may change quickly when:

- new evidence contradicts a step
- verification fails
- a delegated agent surface behaves differently than expected
- a repeated demand reveals a missing trigger
- an autonomous report identifies a better procedure

SOP changes still need evidence, but they do not require the same threshold as skill or audit-standard changes.

## Retirement

Retire an SOP when:

- it never recurs
- it is replaced by a skill
- it repeatedly fails audit
- it depends on unavailable tools
- it conflicts with seed policy

## Storage

During a live run, the harness writes SOP drafts to both places:

- state root `sop/drafts/<sop-id>.md` for run evidence
- local active vault `sop/drafts/<sop-id>.md` for capability evolution

When autonomous audit promotes the SOP, the harness writes:

- active vault `sop/promoted/<sop-id>.md`
- active vault `skill-candidates/<sop-id>-<skill-name>/SKILL.md`
- active vault `skills/<skill-name>/SKILL.md`
- registry entries in the active vault `registry/`
