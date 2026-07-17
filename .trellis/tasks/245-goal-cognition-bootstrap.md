# Task 245: Goal Cognition Bootstrap

Status: active

## Identity And Ownership

- Issue: GitHub Issue #68, `feat(goals): decouple lifecycle control and add
  explicit Codex cognition bootstrap`.
- Parent architecture: GitHub Issue #56, `.trellis/decisions.md`, and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: the operator reaffirmed on 2026-07-18 that
  Codex should repair Evi core foundations first, then supervise Evi-owned
  self-growth and decide when Evi may delegate bounded engineering back to
  Codex.
- Owner repository: Evi.
- Capability layer: core runtime.
- Base: `5b3d90424ee7eb8518c5a02e441fe513da9eb1c0` on `develop`.
- Branch/worktree: `codex/issue-68-goal-cognition-bootstrap` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/68-goal-cognition-bootstrap`.
- The stopped legacy self-evolution goal remains stopped and is never resumed.

## Measured Trigger

Issue #65 installed-artifact acceptance proved the compiled GoalRuntime path,
but the ordinary machine configuration fails before `goal start` because the
ignored `active_model` selector names missing model id `primary-model`. A
deterministic fixture could prove code wiring but could not prove real cognition
readiness. Moving IM/Web/daemon ingress now would widen an unavailable surface.

## Architectural Outcome

Model readiness is not allowed to own goal lifecycle. The local ingress builds
GoalRuntime from state/config selectors without resolving a model. Start, read,
pause, resume, and abandon remain available during provider failure. Continue
uses one lazy `GoalCognition` adapter; a bootstrap or cognition failure is
recorded as a bounded same-goal blocked observation and can be repaired before
continuing the same identity.

Configuration selects exactly one provider:

```text
goal_cognition.provider = active_model | codex_cli
```

`active_model` preserves the existing OpenAI-compatible path. `codex_cli` is an
explicit local operator choice, never a fallback. It invokes one stateless
`codex exec` turn with saved local authentication, an ephemeral session,
read-only sandbox, empty temporary working directory, strict cognition output
schema, bounded process/output budget, and JSONL inspection. If Codex attempts
command execution, file mutation, MCP, Web search, or another tool action, the
cognition call fails closed. Codex only proposes one normalized decision;
GoalRuntime still owns action dispatch, effects, evidence, verification, and
receipt.

## Acceptance

- Missing active-model configuration cannot prevent lifecycle-only commands.
- Continue records provider failure through GoalRuntime and retains the goal;
  explicit provider repair can continue that same identity.
- Provider selection and non-secret readiness are visible without reading or
  persisting authentication material.
- Codex CLI adapter tests prove exact argv/isolation, strict output, forbidden
  event rejection, timeout, nonzero exit, malformed JSON, bounded capture, and
  cleanup.
- A real installed bundle with explicit `codex_cli` configuration completes one
  safe read-only goal and accepted receipt without legacy state writes.
- Focused tests, `git diff --check`, `pnpm run check`, independent Standards and
  Spec review, PR merge, commit-bound deployment, resident health, and
  controller identity pass.

## Non-Goals

No IM/Web/daemon cutover, `codex.run` engineering-effect authorization,
adoption, LearningRuntime, legacy deletion, provider failover, model fan-out,
implicit example-model fallback, `main`, tag, release, publication, secret
export, destructive remote action, or stopped-goal resumption.

## Rollback And Completion

- Source rollback is a bounded PR revert. The local ignored provider selector
  is restored independently from repository history.
- Provider failure never discards or replaces the current GoalRuntime identity.
- Completion requires real installed Codex cognition, not only a fixture, plus
  merged source, stable deployment, live health, and this evidence checkpoint.

## Implementation Checkpoint

- Goal lifecycle construction now loads selectors and store only; cognition is
  selected lazily for Continue and re-resolved on each later Continue.
- `codex_cli` uses the authenticated `fast` profile, an ephemeral empty
  workspace, read-only sandbox, disabled Web config, strict wrapped output,
  bounded process capture, and fail-closed JSONL item inspection.
- Focused typecheck and 21 tests pass for config/readiness, lifecycle without a
  model, same-identity provider repair, Codex isolation, and process failure
  modes.
- Source smoke Goal `goal_20260717175555_bcf6f624` retained one identity across
  an auth bootstrap failure and a deprecated Codex feature-flag warning, then
  read `package.json` and completed with accepted receipt
  `goal_receipt_20260717180701_7f21d9b4`; `changes[]` is empty.
- The apparent cumulative budget excess is intentional soft-tranche behavior,
  not a lifetime-cap bypass. Goal views now expose
  `budget_scope: per_continue_command` so operator output names that boundary.
- Installed-bundle acceptance, repository-wide checks, independent review,
  merge, deployment, and resident handoff remain pending.
