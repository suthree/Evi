# Task 260: Feishu Same-Goal Control And Exact Confirmation

Status: active

## Identity And Ownership

- Issue: GitHub Issue #99, `feat(feishu): continue and confirm the same
  canonical Goal`.
- Parent outcome: GitHub Issue #56 and the operator-approved persistent Goal
  for a real Feishu-to-Codex self-evolution OutcomeReceipt.
- Dependency: Issue #97 / Task 259 is completed, merged, deployed, live-probed,
  and cleaned. Its execution-workspace owner is reused rather than changed.
- Decision Owner / authority basis: the operator explicitly approved the
  end-to-end Goal and local development, integration, Issue, and deployment
  authority on 2026-07-18.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree. Evi remains the later cognition and outcome owner.
- Capability layer: Feishu basic-entrypoint over the canonical GoalRuntime
  control plane.
- Base: `20bac86a7cedfd247ee080bd500a71f7f4d4254a` on `develop`.
- Branch/worktree: `codex/issue-99-feishu-goal-control` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/99-feishu-goal-control`.
- Milestone/version: parent #56 foundation program; no release claim.

## Observed Problem And Desired Outcome

The exact resident artifact accepted a real Feishu private message, created
Goal `goal_20260718150351_75e190af`, dynamically prepared its isolated
workspace, completed with receipt `goal_receipt_20260718150421_6f25c942`, and
made `codex.run` ready. Feishu nevertheless exposes only Start plus one bounded
Continue. Its result tells the operator to switch to local CLI for later
Continue, manual Resume, or exact-effect confirmation. Later ordinary private
prose creates another Goal and reloads bounded history instead of continuing
the named Goal.

`codex.run` is correctly classified as `delegate_local_code` and therefore
pauses for exact confirmation. Without a provider control path, the real
Feishu-to-Codex loop cannot cross that intentional harness gate.

The live probe also showed a presentation contradiction: canonical provider
status was `completed`, but model-authored receipt prose said `status=active`.
GoalRuntime owns lifecycle; provider output must make that source of truth
unambiguous and cognition must not be asked to author lifecycle fields inside
outcome prose.

The desired outcome is one small interactive Goal port over the existing
GoalRuntime plus strict Feishu private commands for Read, Continue, manual
Resume, and exact Confirm. The port translates operator intent and creates
command ids; canonical events remain the only lifecycle and confirmation
truth.

## Scope And Acceptance

- Reuse GoalRuntime commands and events, `GoalInteractionError` recovery,
  `renderGoalIngressPresentation`, provider allowlisting, deduplication,
  evidence writes, and the existing same-open-id execution lane.
- Deepen or replace the Start-only Goal ingress Interface with one small
  interaction Interface that supports new submission, Read, Continue, Resume,
  and exact-effect confirmation. It owns no persisted mapping or Goal state.
- Add strict Feishu private syntax:
  `/goal read goal_...`, `/goal continue goal_...`,
  `/goal resume goal_...`, and
  `/goal confirm goal_... goal_effect_...`.
- Reject missing, malformed, or extra identifiers as bounded command errors.
  They must never fall through into ordinary task prose or create a Goal.
- Continue emits exactly one bounded canonical Continue command for the named
  Goal. Resume without an effect id relies on GoalRuntime to accept only a
  manual pause. Confirm emits one Resume with the exact named effect id.
- Mismatched confirmation, terminal Goal, `outcome_unknown`, missing pending
  effect, or authority drift fails closed through canonical GoalRuntime.
- Mutating Goal control cannot bypass the private same-sender execution lane.
  Concurrent input is serialized or explicitly rejected and is never
  reinterpreted as a new Goal.
- Provider evidence records source message id, operation, named Goal id,
  canonical resulting status, receipt id, pending effect id where applicable,
  and outbound refs. It is evidence, not a lifecycle owner.
- Feishu presentation renders runtime-owned canonical lifecycle status and
  provider-native next commands. Supported provider control must not direct
  the operator to CLI.
- Completion-candidate instructions exclude Goal lifecycle status claims;
  runtime and provider presentation own that field. Receipt outcome prose
  remains non-authoritative for lifecycle.
- Preserve ordinary Feishu task history bounds and new-Goal semantics, group
  dispatch, Web and CLI behavior, Telegram/Discord ingress, and the absence of
  legacy task/queue/outbox/episode writes.

## Architecture, Reuse, And Complexity

- The one authoritative runtime remains GoalRuntime. The interaction port is a
  command translator and generated-command-id boundary, not a facade over a
  second owner.
- Explicit control syntax is a provider protocol, not static task routing.
  Ordinary goals still choose tools and Skills dynamically from the live
  Capability Portfolio.
- The Feishu adapter retains provider parsing, authorization, concurrency,
  sends, and provider evidence. It does not inspect or mutate Goal event files
  directly.
- Reuse the current in-process follow-up lane. Do not add a durable queue,
  latest-Goal registry, provider session owner, database, or generic command
  framework.
- A local Computer Use probe exposed Feishu rich-text paragraph submission and
  produced one explicitly excluded partial-message Goal. The repository change
  addresses canonical Goal control, not desktop UI automation or rich-text
  editor behavior.

## Data, Effects, Compatibility, And Recovery

- Authoritative input is the explicit provider command plus named Goal/effect
  identifiers. Canonical state is read and changed only through GoalRuntime.
- Feishu open id and chat/message ids stay provider-local. No secret or private
  message body is added to durable learning by this task.
- Read is read-only. Continue and manual Resume may invoke the model and bounded
  tools. Confirm is a consequential exact-effect action already governed by
  the pending canonical action digest and EffectPolicy decision.
- Historical Goals and receipts remain readable. Existing submit-only test
  doubles may be updated to the new Interface; no compatibility runtime or
  dual write is introduced.
- Source rollback is a normal revert PR and exact-commit redeploy. A live
  codex-confirmation probe uses an isolated worktree and is cleaned only after
  terminal or explicit abandonment with preserved evidence.

## Non-Goals And Budgets

- No implicit latest-Goal mapping, plain-language `continue`/`yes` inference,
  Feishu `/new`, task keyword map, alternate planner, second model call, or
  alternate confirmation owner.
- No automatic Issue/PR/merge/deployment or LearningRuntime promotion.
- No `main.ts` decomposition, generic CLI/IM command registry, Telegram or
  Discord control syntax expansion, public release, `main` merge, tag, or
  publication.
- One Issue, one task, one branch/worktree, and one PR. No implementation
  subagents. Independent Standards/Spec reviewers are permitted only at the
  review gate and own no code or integration.
- Retry only a concrete failing test, review finding, integration step,
  deployment step, or live provider failure. Preserve the persistent parent
  Goal and never resume stopped Goal `goal_20260718095412_0225d325`.

## Verification And Completion

- Add parser and adapter contract tests for Read, Continue, manual Resume,
  exact Confirm, malformed/extra ids, mismatch, terminal and unknown-outcome
  failures, concurrency, provider evidence, and no replacement Goal.
- Add interaction-port and presentation tests proving canonical command
  translation, command-id uniqueness, provider-native continuation guidance,
  and runtime-owned lifecycle labeling.
- Run focused Feishu, Goal ingress/runtime, Web, CLI, daemon, Telegram, and
  Discord tests; run `git diff --check`, TypeScript build, and full
  `pnpm run check`.
- Inspect the final owner surface, update paired architecture/runtime/local
  docs only where observable contracts change, and remove replaced paths
  rather than leaving compatibility dispatchers.
- Commit, push, open a PR to `develop`, perform independent Standards/Spec
  review, merge, exact-commit deploy, complete probation/controller handoff,
  and verify healthy/current runtime with connected Feishu inbound.
- Live acceptance creates one new Feishu engineering Goal, prepares its
  isolated workspace, reaches an exact `codex.run` pending effect, confirms the
  named effect through Feishu, and proves the same Goal id continues without a
  replacement Goal. This child stops after bounded delegation/confirmation
  evidence; Evi verification, PR delivery, deploy, learning, and the final
  OutcomeReceipt remain later parent-Goal work.

## Activation Evidence

- Issue #99 accepted the bounded same-Goal provider-control seam.
- Root `develop` was clean at exact base
  `20bac86a7cedfd247ee080bd500a71f7f4d4254a` with no other registered
  worktree before this isolated branch/worktree was created.
- Task 259 closure and Task 260 activation are the only changes in the
  activation commit; implementation follows only after this contract is
  committed and linked to the Issue.

## Pre-Merge Verification Evidence

- The Goal interaction edge translates one submission, Read, Continue,
  manual Resume, or exact-effect Confirm into the existing GoalRuntime. It
  owns generated command ids and error recovery only; no latest-Goal mapping,
  provider lifecycle store, or alternate planner was added.
- Feishu strict parsing, same-sender serialization, provider evidence,
  canonical lifecycle presentation, terminal/outcome-unknown failure, and
  conversation-history exclusion are covered by adapter tests. Web, CLI,
  Telegram, Discord, group-session, and legacy-state boundaries remain on
  their existing ingress paths.
- Focused regression on 2026-07-18 passed 186/186 tests across Goal runtime,
  Feishu, Web, IM adapter seam, Telegram, Discord, CLI, and capability catalog.
- `pnpm run check` passed on 2026-07-18: TypeScript build; 976/976 tests; active
  Skill validation; neutral naming across 131 implementation files.
- `git diff --check` passed. The source candidate still requires merge, exact
  deployment, connected Feishu inbound, and the named-Goal live confirmation
  probe before this task can complete.
- Independent Standards review reported no actionable findings after checking
  owner boundaries, same-sender serialization, provider-local evidence,
  history exclusion, dynamic routing, compatibility, and paired docs; it also
  reran `pnpm run check` successfully at 976/976 tests.
- Independent Spec review reported no actionable findings against Issue #99
  and this task after checking exact Goal/effect identity, no replacement Goal,
  canonical fail-closed behavior, provider evidence, Feishu-native guidance,
  and lifecycle/outcome separation; its focused read-only regression passed
  130/130 tests and `git diff --check`.
