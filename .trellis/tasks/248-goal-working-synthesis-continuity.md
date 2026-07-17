# Task 248: Goal Working Synthesis Continuity

Status: active

## Identity And Ownership

- Issue: GitHub Issue #74, `fix(goals): preserve bounded working synthesis
  across Continue tranches`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth under
  the persistent GoalRuntime direction. Codex intervenes because repeated Evi
  execution proved the defect lies in GoalRuntime cognition context and
  checkpoint projection; Evi cannot repair that control plane from inside its
  read-only Goal.
- Owner repository and implementation owner: Evi repository; current Codex
  supervisor implements and verifies this bounded core repair.
- Capability layer: core runtime cognition continuity.
- Base: `27d210efd1010f4345530223c18c78c59efff48c` on `develop`.
- Branch/worktree: `codex/issue-74-goal-working-synthesis` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/74-goal-working-synthesis`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Evidence

After Task 247 deployment, installed Goal
`goal_20260717190203_ec82a197` advanced from sequence 47 to 110 and from 21/19
to 48/46 cumulative cognition/tool usage. It successfully inspected deep
`codex.run`, EffectPolicy, and GoalRuntime implementation windows. It then
began rereading those modules instead of synthesizing an outcome.

The event chain shows the loss directly: EffectPolicy was read at sequences
73/76, but sequence 94 again claimed its evidence was missing; after `tools.ts`
was read through its end, later tranches returned to earlier `tools.ts`
windows. There was no budget failure, tool failure, or missing access.

The confirmed control-plane cause is twofold:

- `buildCognitionEvidence` retains only the latest 16 non-terminal events;
- each `goal_action_observed` checkpoint replaces its summary and refs with
  only the latest tool result, while the already-canonical action
  `model_summary` is instructed as a local rationale and is not carried forward.

## Architectural Outcome

Reuse the existing action summary, action event, checkpoint, and canonical
observation surfaces as one bounded working-memory loop:

- An action cognition `summary` is a compact cumulative working synthesis:
  confirmed facts, unresolved question, and why the one proposed action is next.
- `goal_action_planned.model_summary` remains canonical and schema-compatible.
- After the effect is observed, the checkpoint retains that planned working
  synthesis. The complete current result remains canonical in the observation
  event and recent cognition evidence, so the next model round can incorporate
  it into the next synthesis.
- Checkpoint refs merge stable prior refs with current tool refs, deduplicate,
  and retain only the existing maximum of 32.
- The prompt names the checkpoint summary as fallible working memory. It is not
  evidence, authority, completion proof, a citation requirement, or a reason to
  ignore contradictory canonical observations.

No raw event-window expansion is the primary fix. No event schema, event type,
store, counter, checkpoint file, or second evidence system is added.

## Outcome And Acceptance

- Deterministic tests prove a cumulative action summary survives successful and
  failed observations and a later soft-budget checkpoint.
- Canonical tool result details remain present in cognition evidence and drive
  recovery when a tool fails; working memory cannot turn failure into success.
- Checkpoint refs merge in stable order, deduplicate, and remain within 32.
- Legacy Goal histories parse and continue because no persisted schema changes.
- Model adapter tests prove the action summary instruction and the explicit
  working-memory-versus-canonical-evidence boundary.
- Targeted checks, `pnpm run check`, diff audit, independent reviews, PR merge,
  commit-bound deployment, health, and controller identity pass.
- Continue installed Goal `goal_20260717190203_ec82a197` under the same identity.
  It must stop rereading identical windows merely because earlier facts left the
  recent event horizon, then produce its architecture outcome or a different
  measured blocker. No successor Goal can satisfy acceptance.

## Scope And Stable Owners

- `packages/runtime/src/goal_execution_adapters.ts` owns the cognition
  instruction and rendered working-memory boundary.
- `packages/runtime/src/goal_runtime.ts` owns action/observation checkpoint
  continuity and bounded stable ref merging.
- Focused GoalRuntime/adapter tests and paired runtime docs change only where
  required by the observable contract.
- Task 247 completion is recorded in this transition commit so no separate
  evidence-only PR is created.

## Reuse, Complexity, And Data Contract

- Reuse `cognition.summary`, `goal_action_planned.model_summary`,
  `GoalCheckpoint`, canonical observation events, `toolResultRefs`, and the
  existing 32-ref bound.
- The action summary remains at the existing 2,000-character bound. It contains
  synthesis, not raw tool output or required evidence ids.
- The latest observation remains the source of truth. On conflict, canonical
  evidence overrides fallible working memory.
- Historical events need no migration and checkpoint projections remain
  rebuildable from canonical events.

## Authority, Effects, And Non-Goals

- This repair changes cognition context/projection only. It grants no new tool,
  write, model, secret, repository, network, publication, or external authority.
- No larger raw-event window as the main fix, planner, no-progress detector,
  automatic stop judge, model fan-out, citation matrix, evidence graph,
  per-step verifier, `codex.run` engineering authorization, IM/Web/daemon
  cutover, LearningRuntime, adoption, legacy deletion, main merge, tag, release,
  publication, secret export, or destructive remote action.

## Budgets, Verification, And Rollback

- Execution budget: one bounded implementation path, no new subagents, and no
  retries beyond fixing concrete test or review findings.
- Red loop: GoalRuntime and adapter tests must first fail on overwritten working
  synthesis, replaced refs, and old action-summary wording.
- Full verification: typecheck, `git diff --check`, `pnpm run check`, and
  independent Spec/Standards reviews.
- Live verification: deploy the exact merged commit, prove healthy resident and
  controller identity, then continue the same Goal for only evidence-backed
  progress. Codex stops the loop and opens a distinct issue if identical
  evidence is reread because continuity still fails.
- Rollback: revert the source/test/doc change through a normal PR and redeploy
  the previous stable commit. No persisted schema or event type changes, so
  current Goal history remains valid.
