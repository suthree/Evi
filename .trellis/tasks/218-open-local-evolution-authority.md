# Task 218: Open Local Evolution Authority

Status: implemented

## Problem

The runtime already supports repository writes, state writes, local commands,
SOP audit, and active-vault skill promotion, but stable project guidance still
described self-iteration as slow and treated durable mutation or promotion as a
reason to seek operator confirmation. That contract conflicts with the
operator's goal of observing how Evi develops under different self-iteration
and self-growth conditions.

## Scope

- Record standing local authority for repository, state, vault, SOP, skill,
  script, dependency, governed-identity, and local Git mutation.
- Make autonomous local-learning promotion the default when the runtime gate is
  enabled.
- Preserve evidence, harness verification, rollback/retirement, read-only
  command contracts, and unrelated worktree protection.
- Keep secrets, public publishing, private-data transmission, and destructive
  remote operations behind separate external-effect gates.
- Update paired English/Chinese identity and operator guidance together.

## Non-goals

- No automatic public publishing or secret disclosure.
- No weakening of completion verification or evidence lineage.
- No conversion of read-only operator commands into write surfaces.
- No compatibility, multi-user, or multi-machine expansion.

## Acceptance

- Stable docs no longer treat ordinary local file mutation, persistence, or
  promotion as a reason to pause.
- `core/soul.md` and `core/soul.cn.md` describe active local evolution with
  autonomous harness gates.
- Repository agent guidance allows local code/state/vault/skill/dependency
  changes without per-change confirmation.
- Runtime and local-learning contracts preserve verification and external-effect
  boundaries.
- The next real IM task can use local mutation and learning surfaces without a
  false no-write failure.

## Verification

- `git diff --check`
- `pnpm run check` (`788` tests passed after the follow-up collision fix)
- `pnpm run runtime -- service health --target runtime --state-root .runtime/state`
- real Feishu IM session `session_20260713100521_1869d462` completed with
  verified `file.read`, `file.write_state`, final response, SOP audit, active-vault
  promotion, and outbound delivery evidence
- the first broader attempt, `session_20260713100213_291baa4a`, correctly
  recorded an upstream model `524` timeout as blocked without claiming writes or
  promotion
