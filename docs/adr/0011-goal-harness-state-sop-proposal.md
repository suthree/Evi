# ADR 0011: Goal-scoped Harness-state SOP proposal

- Status: Accepted
- Date: 2026-07-22
- Decision owner: Operator

## Context

The supervised HN synthesis Goal could read its exact receipt set but could not
turn verified same-Goal observations into a bounded draft: live-runner
`propose_sop` is a Harness action, while GoalRuntime exposed only Tool Contract
capabilities and EffectPolicy actions. Mapping that action to `file.write_state`
would falsely make a protected learning effect look like a general write tool.
Keeping it outside GoalRuntime would leave the supervised learning loop unable
to test its intended draft-delivery boundary.

The desired result is deliberately smaller than general learning automation:
one explicit SOP draft action, only when the operator or calling harness puts it
on a Goal Start, backed only by same-Goal nondelegated canonical observations,
and never able to audit, promote, write the active vault, create a Skill, or
claim Goal completion.

## Decision

1. Goal Start may carry `learning_effects: ["propose_sop"]`; omission remains
   the default and creates no extra capability. The current Capability
   Portfolio then exposes only `harness.propose_sop` with kind `harness_state`.
   It is neither a Tool Contract nor a `file.write_state` alias, and does not
   flow through EffectPolicy.
2. Goal cognition gains one typed `harness_state_action` shape for that exact
   capability. It requires `atomic_task`, no selected Skill refs, a
   `completion_claim.status` of `not_done`, one new SOP id, and a bounded SOP
   body. Its `evidence_event_ids` must be unique prior successful same-Goal
   nondelegated canonical tool observations; planned, failed, foreign, and
   `codex.run` observations are rejected before writing.
3. GoalRuntime alone writes the draft JSON/Markdown pair under
   `stateRoot/sop/drafts/`, records a distinct
   `goal_harness_state_observed` canonical event, and derives its two
   `state_change` identities. The action stays active/nonterminal and creates
   no episode event, audit, promotion, repository write, active-vault artifact,
   Skill, activation, external effect, or completion authority.
4. Before a later ordinary outcome may complete, GoalRuntime independently
   re-reads every unverified Harness-state draft, validates its draft status,
   exact evidence refs, and Goal provenance, and rejects related audit,
   promoted-state, or configured active-vault SOP artifacts. Only a passing
   check appends `goal_harness_state_verified`; a failed check becomes normal
   Goal verification failure. A receipt may report verified draft delivery, not
   SOP/capability/Skill promotion.
5. CLI transport is `goal start --learning-effect propose_sop`. The configured
   ingress resolves the active vault root for the independent check. Direct
   test construction defaults the protected root to the repository `vault/`
   fixture only; production ingress must supply the configured node-local root.

## Consequences

- Supervised self-learning can exercise the handoff from exact Goal evidence to
  a state-only SOP draft without granting generic protected-state writes.
- The resulting capability has an intentionally narrow name, payload, evidence
  source, and lifecycle. Adding `propose_memory`, other Harness actions,
  inferred opt-ins, wider references, or auto-promotion requires a new
  Direction Proposal.
- This introduces two new canonical Goal event kinds and treats the draft files
  as typed state changes, so a receipt exposes delivery honestly while keeping
  audit/promotion lifecycle separate.
- A process interruption after draft-file write but before canonical event
  append can leave an inactive orphan draft. It cannot be promoted or complete
  a Goal through this path; it is handled by the existing retirement/governance
  path rather than replaying the action.

## Alternatives considered

- Model the action as `file.write_state`: rejected because a path argument and
  general Tool Contract would make protected learning authority look reusable.
- Reuse live-runner `propose_sop` unchanged: rejected because it records
  episode-oriented evidence and has no same-Goal canonical ref or OutcomeReceipt
  verification semantics.
- Draft and promote in one Goal action: rejected because it collapses evidence,
  audit, activation, and completion ownership into model-directed execution.

## Re-evaluation

After the next supervised HN synthesis retry, inspect the canonical Goal event
stream, created state draft, independent delivery verification, receipt wording,
and absence of audit/promotion/active-vault artifacts. Re-evaluate whether this
single action is useful and recoverable; do not widen the action family or make
it default context without a new accepted Direction Proposal.
