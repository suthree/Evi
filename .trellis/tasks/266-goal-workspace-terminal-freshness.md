# Task 266: Goal Workspace Terminal Freshness

Status: active; implementation, review, integration, exact deployment, and
same-Goal live acceptance pending

## Identity And Ownership

- Issue: [#112 bind workspace freshness to terminal observation gate](https://github.com/suthree/Evi/issues/112).
- Milestone / target version: operator-authorized real self-evolution closure;
  no separate GitHub milestone is assigned.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree. Evi remains the real Goal outcome and acceptance owner.
- Decision Owner / authority basis: the accepted self-evolution mission, the
  operator's continued execution authority, and live sequences 212-214 of
  `goal_20260718155814_357c4361`.
- Capability layer: core/harness-context.
- Base: `ac399a08d3630d61b8f3d7201d0c776496afc758` on `develop`.
- Branch/worktree: `codex/issue-112-workspace-terminal-freshness` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/issue-112-workspace-terminal-freshness`.

## Problem And Outcome

PR #111 made an externally advanced Goal-bound worktree visible as
`changed_unobserved`, but the real Goal then selected control-scoped
`runtime.inspect`. That observation satisfied the generic post-blocker
obligation even though it carried no execution-workspace marker, after which
the model repeated its stale blocker. The derived hint reached cognition but
did not act as a harness terminal backstop.

The desired outcome is one fail-closed, workspace-specific terminal freshness
condition derived from the existing live workspace view. While the live bound
HEAD remains unobserved, GoalRuntime rejects a model blocker or outcome. Any
execution-scoped capability may align it through the existing harness-owned
post-tool marker; capability choice remains dynamic.

## Design And Boundaries

- Reuse `goalWorkspaceFreshness`, `latestObservedWorkspaceHead`, the existing
  tool-placement contract, and the canonical `workspace_observation` marker.
- Evaluate the derived freshness immediately before cognition and reuse that
  same view for terminal decisions in the loop. Do not persist it.
- Keep the generic cross-Continue `observation_obligation` unchanged. A
  control-scoped observation may satisfy that temporal obligation but cannot
  satisfy an unrelated execution-workspace freshness condition.
- Do not route `changed_unobserved` to `file.read`, `repo.search`,
  `command.run`, or `codex.run`. Cognition selects the capability based on the
  fact it needs; the harness checks only whether canonical execution-workspace
  observation now aligns the HEAD.
- No new event kind, receipt field, ledger, cache, state owner, watcher, TTL,
  polling loop, user evidence injection, deployment semantic, or GitHub tool.
- No dependency or migration is required. Stable runtime contract text changes
  only if implemented behavior needs a concise owner-level clarification.

## TDD And Verification

- First reproduce `changed_unobserved -> runtime.inspect -> blocker` and prove
  the blocker is rejected because the worktree remains unobserved.
- Prove liveness through a later execution-scoped observation followed by an
  accepted blocker or outcome according to existing semantics.
- Cover an outcome proposal as well as a blocker, plus aligned and unbound
  behavior so the new gate cannot broaden accidentally.
- Run focused GoalRuntime and cognition-adapter tests, TypeScript build,
  `git diff --check`, and full `pnpm run check`.
- Independent review covers both Issue acceptance and repository standards.

## Effects, Budgets, And Recovery

- Source changes stay in this worktree. GitHub PR/merge, deployment, and
  Feishu continue commands are separately observed integration effects already
  authorized by the operator.
- One implementation owner; no parallel implementation workstreams. Keep the
  diff bounded to GoalRuntime, focused tests, and the stable contract if needed.
- Use short red/green cycles, no automatic retries, and one independent final
  review after all local checks pass.
- Rollback is a normal source revert and exact-commit redeploy of `ac399a0`.
  Canonical Goal events are never edited.

## Activation Evidence

- PR #111 merge `ac399a0` was exact-deployed stable/current; resident runtime
  was healthy and Feishu inbound connected.
- Same Goal sequence 212 explicitly reported changed execution-workspace HEAD
  and `observation_obligation=required`, yet selected `runtime.inspect`.
- Sequence 213 observed only control/runtime evidence at `ac399a0` and carried
  no execution-workspace observation for Issue #101.
- Sequence 214 accepted another stale blocker although the bound Issue #101
  worktree still had live HEAD `381033c` and the Goal's latest observed HEAD
  remained `6c90aa2`.
- This activation record claims no implementation, review, integration,
  deployment, or live acceptance.

## Pre-Review Implementation Evidence

- Two red behavioral regressions reproduced the live defect: after an external
  worktree advance, a successful control-scoped `runtime.inspect` allowed both
  a stale blocker (`blocked` instead of `workspace_observation_required`) and a
  stale outcome (`completed` instead of `verification_failed`).
- GoalRuntime now re-inspects the derived execution-workspace freshness before
  either terminal proposal. `changed_unobserved` rejects a blocker through a
  bounded checkpoint and rejects an outcome through the existing verification
  failure path. The condition is not persisted and changes no event or receipt
  schema.
- The existing ToolContract placement is exposed in the bounded Capability
  Portfolio as `workspace_placement`. Cognition can therefore select any action
  whose effective placement resolves to the execution workspace; no tool or
  task keyword is routed by the harness.
- Green regressions prove that control-only observations cannot align the
  worktree and that later execution-scoped `file.read` or `repo.search`
  observations align it through the existing harness marker, after which the
  same Goal can complete normally.
- Focused GoalRuntime, adapter, and portfolio tests passed. TypeScript build and
  `git diff --check` passed. Full `pnpm run check` passed on 2026-07-19,
  including the complete test suite, active Skill validation, and neutral
  naming validation.
- These are pre-review checks only. Independent review, PR integration, exact
  deployment/controller handoff, and unchanged-Goal live acceptance remain
  pending.

## Review Cycle 1 Corrections

- Spec review reported 0 findings and independently passed 60/60 related tests,
  TypeScript no-emit, and fixed-base `git diff --check` at `0618cdb`.
- Standards review found two P1 terminal-authority gaps and one P2 verifier
  race. A bound workspace in `unavailable` state was not fail-closed; canonical
  result fields were scanned without pairing the observation to an
  execution-placed planned action; and a verifier could pass before an external
  HEAD advance that occurred during verification.
- Red adversarial regressions reproduced all three paths. A control-scoped
  `runtime.inspect` result carrying an otherwise matching workspace marker
  incorrectly aligned the HEAD; branch drift during cognition allowed a model
  blocker; and a verifier-time commit still produced a completed receipt.
- Workspace HEAD projection now pairs every canonical observation with its
  planned action and accepts only effective execution placement. The result
  must also carry the existing harness-owned marker with the exact bound branch
  and worktree; untrusted `change`, `changes`, or verification fields no longer
  advance this freshness owner by themselves.
- For a bound workspace, only `aligned` permits a model blocker or outcome.
  `changed_unobserved` requires a matching execution observation, while
  `unavailable` requires recovery of the exact canonical worktree authority.
  Unbound Goals retain their prior behavior.
- A passed verifier is followed by one final derived freshness read before the
  terminal event is appended. Drift during verification becomes the existing
  `goal_verification_failed` path and no receipt is written.
- The corrected adversarial and focused suites passed, TypeScript build and
  `git diff --check` passed, and the full `pnpm run check` passed again on
  2026-07-19. Review cycle 2, PR integration, exact deployment/controller
  handoff, and unchanged-Goal live acceptance remain pending.
