# ADR 0001: Native evolution control plane and Trellis retirement

- Status: Superseded for vNext by ADR 0012; remains the implemented v0.2 record until cutover
- Date: 2026-07-20
- Decision owner: Operator
- Authority basis: the accepted self-evolution boundary review

## Context

Evi needs a closed, evidence-backed path for self-growth, self-evolution, and
self-supervision. Trellis previously supplied project task context and delivery
governance, but its fixed workflow has become a constraint on the model rather
than a native capability. The runtime already establishes the intended core
seams: `GoalRuntime` owns the Goal lifecycle, `Harness` bounds actions and
effects, and `OutcomeReceipt` records verified terminal outcomes.

The current implementation does not yet implement every part of this decision.
In particular, a persistent `direction_pending` Goal state and a Goal-derived
workspace branch format are future runtime slices. Documentation must distinguish
this accepted direction from implemented behavior.

## Decision

1. Evi's active self-evolution control plane is `GoalRuntime` + `Harness` +
   canonical evidence + `OutcomeReceipt`. Stable project direction lives in
   repository docs and accepted ADRs.
2. Delivery controls are dynamic rather than a mandatory Issue -> Trellis task
   sequence. The applicable Decision Owner evaluates scope, evidence, risk,
   verification, recovery, reversibility, and current operator intent. Durable
   code, dependency, deployment, or external effects require explicit scope,
   evidence, verification, and rollback or retirement; they do not require
   Trellis as a default gate.
3. `grill-me` is the reflection gate for ambiguity, cross-layer changes,
   context/harness/memory/dream changes, repeated failures, or work without a
   measurable capability gain. It asks focused questions and produces only a
   `Direction Proposal`.
4. A `Direction Proposal` is attached to the current Goal as a bounded
   checkpoint or event. It creates no new persistent state owner and grants no
   authority to mutate source, promote learning, deploy, or communicate
   externally. Until the Decision Owner accepts a direction, the Goal is to
   pause with `direction_pending`; that runtime state is an accepted target, not
   an implemented claim.
5. After acceptance, `grill-with-docs` may consolidate the decision into the
   glossary and, for a durable or surprising tradeoff, an ADR. It must not store
   hidden chain-of-thought; only the bounded decision artifact and evidence
   belong in durable records.
6. `.trellis/` is logically retired now. It remains a frozen historical archive
   and valid evidence source, but is not an active task source, default context
   route, generated-agent-context surface, or source of truth for new work. A
   later, separately approved decision may decide physical removal.
7. Core self-growth learns to discover, compare, select, invoke, verify, and
   recover tools and delegated surfaces. Domain procedures and provider-specific
   usage remain skills or adapters. In particular, Goal cognition supplies only
   bounded specialist intent for `codex.run`; GoalRuntime derives the actual
   invocation authority from bound state and canonical evidence, and requires
   explicit capability-fit assessment before specialist dispatch.
8. Controls are classified as hard invariants, exact-effect gates, adaptive
   defaults, or advisory guidance. Only the first two are mandatory. A workflow
   default yields when current canonical evidence shows its protected invariant
   is already satisfied; an already-isolated linked worktree, for example, is a
   valid bounded Codex target without a nested workspace-preparation step.

## Consequences

- New work starts from a Goal and the native harness rather than from Trellis.
  GitHub Issues, pull requests, branches, and worktrees remain useful external
  collaboration and isolation mechanisms when their risk or delivery context
  calls for them; they are not the native owner of Evi's evolution loop.
- Existing historical `.trellis` references remain readable so prior evidence
  and fixtures retain their meaning. New active documentation must point here
  and to the runtime contract instead.
- `GoalExecutionWorkspace` currently accepts the legacy branch format
  `codex/issue-N-slug`. This is implementation compatibility, not proof that a
  live GitHub Issue is required. A future native-control-plane Goal must replace
  it with a Goal-derived format, migrate tests, and provide verification and
  recovery evidence.
- The decision deliberately does not claim that self-achievement or the full
  self-supervision loop is complete. It establishes the operating boundary for
  completing those capabilities with measurable evidence.
- The current specialist-executor adapter is an implemented bootstrap repair.
  It removes low-level Codex protocol composition from Goal cognition; durable
  child-owned dispatch journaling remains a separate later slice.
- Protected local-learning paths remain outside direct Goal file writes. A
  verified outcome feeds the existing background-review and promotion gates;
  this is a sequencing boundary, not a requirement to write an SOP before a
  bounded implementation.

## Re-evaluation

Re-evaluate this decision when native reflection checkpoints, `direction_pending`,
or Goal-derived workspaces are implemented; when a new external collaboration
need appears; or before any physical deletion of the Trellis archive.
