# ADR 0010: Goal-scoped structured read policy

- Status: Accepted
- Date: 2026-07-21
- Decision owner: Operator

## Context

Evi needs dynamic same-authority local reads for ordinary bounded exploration,
but a supervised evaluation may require exact input confinement. Treating every
named path in an objective or checkpoint as a global restriction would make the
harness brittle and turn working context into authority. Treating such prose as
a hard gate without a typed runtime representation would make the claimed
boundary unenforceable.

## Decision

1. A Goal Start command may optionally carry `read_policy.references`. Each
   reference has a canonical relative `scope` (`repo` or `state`), `kind`
   (`file` or `tree`), and `path`. The policy is absent for normal dynamic
   reading; it is never inferred from objective prose, selected refs, a model
   summary, competence, a Tool Operation Protocol, or a Skill.
2. When present, GoalRuntime checks `file.read` and `repo.search` after typed
   action normalization and before tool execution. A nonmatching action is
   recorded as a redacted policy denial and never reaches the tool adapter.
   Existing private-data, root, and EffectPolicy checks remain independently
   authoritative.
3. A file reference allows only that exact file. A tree reference allows that
   normalized path and its descendants; `repo.search` needs a repo-scoped tree
   reference. Repository-local runtime state is never a valid policy target.
4. The policy is canonical start evidence and appears in the Goal view supplied
   to cognition. It creates no new ledger, Tool Contract, capability,
   permission, default-context body, SOP, Skill, scheduler, or external effect.

## Consequences

- Explicit supervised evaluations can test exact input boundaries without
  imposing a universal path allowlist on ordinary Goals.
- A natural-language request alone cannot silently convert an operator hint
  into enforceable authority; the explicit Start transport owns that decision.
- Denial evidence remains inspectable and does not execute the rejected read,
  so it can distinguish a policy violation from tool failure.

## Re-evaluation

Re-evaluate after three supervised Goals cover dynamic reading, rejected
out-of-policy reading, and allowed tree/file reading. Consider only whether the
reference shape is sufficient; do not add inferred policies, wider tool routing,
or promotion behavior without a new Direction Proposal.
