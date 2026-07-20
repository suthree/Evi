# ADR 0003: Shared Evi control state and PR-only source delivery

- Status: Accepted
- Date: 2026-07-20
- Decision owner: Operator

## Context

Evi must coordinate multiple sessions and tools without making source checkout
paths its information bus. A Git branch alone does not isolate concurrent
source mutation; a linked worktree does. Conversely, a worktree-local runtime
root fragments Goal evidence, working context, and capability learning.

The previous project-local `.runtime/` layout also ties active state to a
checkout that may be replaced, branched, or removed. The existing
`~/.local-runtime/state/runtime` belongs to historical XingZhe runtime state
and must not be silently merged with Evi.

## Decision

1. Evi's shared control state is the absolute, checkout-independent root
   `~/.local-runtime/state/evi`. It holds Goal evidence, dispatch journals,
   session working context, verified memory, tool competence, SOP/skill gates,
   and service state.
2. A source-mutating Goal has one bound isolated worktree for its entire
   delivery lineage. Later Codex sessions and tools reuse that worktree; a new
   worktree is not created per session. Source authority is always recorded as
   Goal evidence and never inferred from the shared state root.
3. The root checkout stays clean on protected `develop`. Source enters
   `develop` only through a verified pull-request merge; direct commits and
   pushes to `develop` are forbidden.
4. Project-local `.runtime/`, `.runtime-*`, and `.runtime_*` directories are
   unsupported. Migration is a separate, recoverable cutover: capture an
   inventory and archive, transfer attributable Evi records into the new root,
   verify them, switch the installed service manifest, then remove the old
   checkout-local directory. Historical XingZhe state stays separate.
5. A shared root does not imply unconstrained concurrent mutation. Journals
   are partitioned by Goal/effect/session and require a durable cross-process
   ownership record before a child dispatch. Verified learning is promoted only
   through its existing gates.

## Consequences

- Worktree isolation protects source and PR lineage without losing shared
  context or harness evidence.
- Resident service migration needs an explicit cutover and health verification;
  changing source defaults does not move or restart an installed service.
- A child-owned durable Codex dispatch journal now reserves one
  `goals/dispatches/<goal>/<effect>.json` record before launch, stores no raw
  prompts, and accepts recovery only from its matching terminal record; active,
  malformed, or mismatched records leave `outcome_unknown` paused.

## Re-evaluation

Re-evaluate after the first state migration cutover, a real interrupted-child
recovery rehearsal, or if a future multi-machine boundary is accepted.
