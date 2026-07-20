# ADR 0004: Node-local active vault and Evi-controlled LuBan promotion

- Status: Accepted
- Date: 2026-07-20
- Decision owner: Operator

## Context

Evi's active vault formerly resolved from one user-wide path while production
discovery also loaded repository `vault/` and `skills/` seed roots. That lets
historical development fixtures shape later cognition and ties a node's active
procedural memory to whichever checkout happens to run the process. Separately,
LuBan needs to distribute accepted reusable assets without becoming shared
runtime state or a substitute decision engine.

## Decision

1. The default active vault is the node-local, Evi-namespaced path
   `~/.local-runtime/vault/evi`. It holds only current-node SOPs, skills,
   registry data, and lifecycle metadata; it is neither repository source nor
   Git-synchronized runtime state.
2. Production discovery has no implicit repository seed roots. Repository
   `vault/` and `skills/` directories are explicit development/test fixtures.
   A read-only projection must be named in node configuration before discovery
   may use it. A LuBan checkout is never a direct discovery root.
3. `runtime.promotion_enabled` defaults to false for a clean node baseline.
   It may be enabled only after a verified local promotion/reuse loop records
   its evidence and recovery path.
4. Shared Asset Promotion is an Evi capability. After evidence, audit,
   sanitization, compatibility, verification, and retirement checks, Evi may
   create a LuBan proposal branch, commit, and pull request when repository
   policy permits. Raw state, episodes, credentials, and private host facts are
   forbidden from the proposal.
5. LuBan merge/acceptance remains a repository-policy Decision Owner effect.
   Each consuming node independently selects, validates, activates, observes,
   and rolls back a pinned accepted commit. A local proposal or local promotion
   never authorizes merge or cross-node activation.

## Consequences

- A fresh Evi node begins with no historical local skill or SOP selected by
  default; archives remain recoverable only by explicit historical retrieval.
- Worktree source isolation no longer changes the node's default procedural
  memory or makes repository fixtures active context.
- The next implementation slice for LuBan is typed selection lock and atomic
  node projection, not direct checkout discovery or automatic merge.

## Re-evaluation

Re-evaluate after the first verified clean-vault promotion/reuse loop, or when
typed LuBan catalog selection and transactional projection are implemented.
