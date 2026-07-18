# Task 258: Goal Dynamic Capability Selection

Status: active

## Identity And Ownership

- Issue: GitHub Issue #95, `refactor(runtime): make capability selection
  first-class in GoalRuntime`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: the operator, through explicit approval in
  the 2026-07-18 Codex discussion that Evi is an outcome-owning dynamic
  capability orchestrator rather than a default task executor.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Capability layer: core GoalRuntime cognition and execution selection.
- Base: `dc8208d590305cd0428a33ad3c7612bd87be99fa` on `develop`.
- Branch/worktree: `codex/issue-95-goal-capability-selection` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/95-goal-capability-selection`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Desired Outcome

A live Feishu Goal, `goal_20260718095412_0225d325`, received a read-only source
architecture audit that explicitly disabled `codex.run`. GoalRuntime exposed a
flat list of core tool shapes and prior tool competence but no selected skills,
capability readiness, or required selection record. It consumed 24 cognition
rounds and 24 tool calls without a terminal receipt and proposed one invalid
`file.read max_lines=420` request because the model-visible contract showed a
default but not the accepted maximum.

The desired outcome is one deep Capability Portfolio Module. Its small
Interface resolves bounded current candidates, selected skills, model-visible
constraints, competence, and authority-derived readiness. The existing
cognition call chooses dynamically from that portfolio and records its choice
with the proposed action. GoalRuntime validates that choice before EffectPolicy
or dispatch. Evi remains owner of the Goal, choice, evidence, verification,
acceptance, and later learning; executors own specialist production.

## Scope And Acceptance

- Reuse `coreToolContracts`, `recallSkills`, canonical Goal tool competence,
  current repository authority, GoalRuntime cognition, EffectPolicy, and the
  existing event stream.
- Define one bounded capability-portfolio Interface with a production adapter
  and a materially different in-memory test adapter. It must hide registry
  scanning, bounded skill-body reads, candidate shaping, constraints, and
  authority-derived readiness from GoalRuntime callers.
- Inject bounded selected skill metadata/body and capability candidates into
  each cognition input. Unselected skill bodies must remain absent.
- Require each new action cognition result to include a typed selection naming
  its chosen capability, execution purpose, selected skill refs, rationale,
  verification plan, and fallback.
- Validate before EffectPolicy or dispatch that the capability exists, is
  currently available, matches the actual action tool, and cites only selected
  skills.
- Direct execution purposes are limited to `orientation`, `verification`,
  `recovery`, or `atomic_task`; delegated specialist execution uses
  `specialist_execution`. This is a role contract, not a task-keyword router.
- Persist bounded selection metadata on new canonical action-planned events and
  include it in later cognition evidence. Historical schema-v2 events without
  this optional metadata must remain replayable.
- Expose real model-visible tool constraints, including
  `file.read max_lines <= 400`, rather than relying on prose outside the live
  capability input.
- Keep the existing one-cognition-turn/one-action loop. Add no model call,
  alternate planner, queue, database, state owner, scorecard, or automatic
  learning write.
- Targeted tests cover portfolio depth, skill recall/body bounds, unselected
  skill exclusion, authority-derived unavailable delegation, action-selection
  validation, cognition rendering, event persistence, historical replay, and
  rejection before effect dispatch.

## Architecture, Reuse, And Complexity

- The external seam is one `GoalCapabilityPortfolioProvider.resolve` method.
  GoalRuntime knows only its bounded result. The configured adapter reuses the
  current skill registry and tool contracts; tests inject a deterministic
  in-memory adapter through the same Interface.
- The intelligent choice stays with the existing cognition provider. The
  portfolio supplies current facts and the harness validates consistency; no
  static map from coding/search/browser task words to named executors is added.
- Capability kinds describe execution roles, not task ownership. Current
  `codex.run` is a delegated executor; other core primitives are direct tools.
  The model still weighs objective, current evidence, competence, authority,
  risk, cost, and verifiability for each Goal.
- This is the smallest coherent replacement because it changes the existing
  action seam directly. It does not add a second route phase, second model
  call, command registry, compatibility facade, or broad context assembler.
- The architecture document keeps only owner and role invariants. Concrete
  candidate status and selection belong to the runtime portfolio and canonical
  Goal evidence.

## Data, Effects, Compatibility, And Recovery

- Authoritative capability inputs are tracked tool contracts, current selected
  skill registry entries, canonical terminal Goal competence, and immutable
  Goal repository authority. Skill bodies are bounded and selected by current
  recall only.
- Portfolio resolution is read-only. It reads no secrets, invokes no model,
  executes no tool, writes no state, and owns no completion decision.
- New action-planned events record bounded selection metadata. Existing events
  without the optional field remain valid; no event migration or dual write is
  required.
- A malformed, mismatched, unavailable, or unselected choice is rejected before
  EffectPolicy and tool dispatch and becomes a same-Goal blocked checkpoint.
- Rollback is a normal revert PR and exact-commit redeploy. Canonical historical
  events and receipts require no migration.

## Non-Goals And Budgets

- No `apps/cli/src/main.ts` decomposition, Feishu `/new` or continuation
  commands, automatic worktree/session creation, multi-agent scheduler, static
  task router, new dependency, SOP/skill promotion, LuBan work, or application
  feature.
- Do not alter deployment, service, daemon, effect authority, verifier, or
  OutcomeReceipt ownership except normal integration deployment evidence.
- One repository, one Issue, one task, one branch/worktree, and one PR. No
  subagents. Read only task-relevant source/tests/docs. Retry only a concrete
  failed check, integration, or deployment step.
- Portfolio limits: at most eight capabilities, two selected skills, 2,400
  characters per selected skill body, and short selection fields enforced by
  schemas.

## Verification Plan

- New Module tests: real tool candidates, bounded selected skills, unselected
  body exclusion, file-read constraint visibility, and main-checkout
  `codex.run` unavailability without a task-to-tool mapping.
- GoalRuntime tests: valid selection persists and dispatches; mismatched,
  unavailable, unknown, or unselected-skill choices block before policy/tool;
  historical events replay; later cognition sees prior bounded selection.
- Cognition adapter tests: portfolio and decision contract render once in the
  existing model input; invalid JSON selection shapes fail closed.
- Regression: focused TypeScript tests, `pnpm run build`, `git diff --check`,
  full `pnpm run check`, final diff review, commit/push/PR to `develop`, exact
  merge-commit resident deployment, health, rollback receipt, Issue/task
  closure, and worktree cleanup.

## Completion Evidence

- Pending implementation, verification, integration, deployment, and live
  acceptance.
