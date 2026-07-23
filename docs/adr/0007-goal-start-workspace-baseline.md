# ADR 0007: Harness-owned Goal-start workspace baseline

- Status: Accepted
- Date: 2026-07-20
- Decision owner: Operator

## Context

A Goal may start in a dirty worktree. Existing receipt lineage correctly shows
typed changes observed during that Goal, but did not distinguish paths inherited
at start from changes made after the Goal began. A clean status alone must not
erase this provenance, nor turn every clean Goal into a synthetic verification
workflow.

## Decision

1. At Goal start, the Harness records only the bound Git HEAD and sorted,
   normalized repository-relative tracked and untracked porcelain-status paths.
   It records no diff body, content, hash, objective interpretation, or command.
2. Non-empty baseline paths are exposed as `OutcomeReceipt.inherited_changes[]`
   using `workspace_path` identities. They remain separate from `changes[]`,
   which contains only canonical Goal-observed effects.
3. A non-empty baseline requires a later successful Harness-owned local
   verification before an accepted outcome. The obligation is evidence-based
   and fail-closed; it does not prescribe a command or capability. A clean
   baseline records empty path sets and creates no synthetic check.
4. This adds no goal-text parsing, task routing, fixed test command, or
   automatic test pipeline. Capability selection remains dynamic.

## Consequences

- Receipts preserve inherited workspace provenance without misattributing it to
  the current Goal.
- Dirty-start Goals require independent local evidence before acceptance, while
  clean-start Goals retain the existing acceptance path.
- The baseline is canonical start evidence owned by the Harness, not a new
  workspace registry, task owner, or completion authority.

## Re-evaluation

Re-evaluate if Git status-path provenance becomes insufficient for a supported
repository model, or if a future typed verification attestation can preserve
the same ownership and no-routing boundary.
