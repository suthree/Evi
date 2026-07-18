# Task 254: Runtime-Session Goal Ingress

Status: complete

## Identity And Ownership

- Issue: GitHub Issue #86, `refactor(im): make runtime-session tasks canonical
  Goals`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth.
  Codex supervises the complete ingress boundary; Evi owns cognition, action
  proposals, and outcome acceptance inside each Goal.
- Owner repository / implementation owner: Evi / Evi-controlled Codex work in
  this isolated worktree.
- Capability layer: basic-entrypoint over the core GoalRuntime control plane.
- Base: `f3c919a28ab271619936d583984d65e9dc41333e` on `develop`.
- Branch/worktree: `codex/issue-86-runtime-session-goals` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/86-runtime-session-goals`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Architecture

Provider-neutral runtime-session execution still has multiple legacy owners.
Telegram and Discord use `runtime_channel_task.ts`, which writes queue and
task-run state around `TaskRunner`. Feishu group execution duplicates the same
queue/task-run/runner/outbox choreography inside its adapter. The daemon
constructs `LiveAgentRunner` and a resident task-queue worker for every enabled
IM scenario.

The complete bounded ingress is a bound runtime session receiving `/run` or an
accepted mention. All three providers already share session resolution, inbox,
and trigger classification; they will now also share the existing
Start-plus-one-Continue Goal ingress. GoalRuntime owns task execution and
receipt, while adapters retain only transport delivery and provider-specific
evidence. This is complete per task identity and creates no compatibility
projection.

Feishu p2p/private chat is a different ingress: it owns conversation history,
follow-up queuing, and many operator commands and does not currently use the
runtime task queue. It remains explicitly legacy rather than being half-moved
inside this provider-neutral slice.

## Scope And Acceptance

- Move status-aware Goal continuation presentation from Web-only code to one
  runtime-owned reusable function used by Web and IM replies.
- Replace session-backed `TaskRunner -> RunResult` execution in Feishu,
  Telegram, and Discord with injected `GoalIngressPort -> GoalView` execution.
- Preserve session binding, inbox append, trigger classification, concurrency
  guards, ack/busy/error behavior, and direct provider sends.
- Record provider-specific final-delivery evidence using `goal_id`, Goal status,
  and receipt id. New session Goals append no runtime queue, task-run,
  provider-neutral outbox, completion, episode, iteration, SOP, skill, or
  deployment state.
- Retire `runtime_channel_task.ts` and its implementation-shaped tests when its
  last current caller is removed.
- Stop constructing a daemon queue worker for current session work. Historical
  queue/task-run/outbox data remains readable; queued outbox delivery
  compatibility may remain independent of Goal ownership.
- Telegram and Discord receive no `TaskRunner`. Feishu receives Goal ingress
  for group/session work and a clearly named legacy private runner only for its
  p2p path.
- Preserve current Feishu p2p/follow-up/operator behavior and tests without
  representing it as Goal-owned.
- Update current-fact capability and paired English/Chinese docs.
- Focused adapter/daemon/Goal ingress tests, TypeScript, `git diff --check`, full
  `pnpm run check`, independent Spec/Standards review, PR integration,
  exact-commit deployment, controller handoff, installed-artifact synthetic
  adapter acceptance, and live service health pass.

## Reuse, Complexity, Data, Compatibility, And Rollback

- Reuse `GoalIngressPort`, `createConfiguredGoalIngress`, canonical
  `GoalView`/receipt state, existing session dispatcher, provider transports,
  and direct-send evidence files. Add no queue, scheduler, result mapper,
  database, dependency, service, or provider abstraction.
- The provider-neutral seam is session task execution and Goal presentation;
  provider parsing, sending, history, and operator commands remain at adapters.
- Authoritative inputs are the current inbound normalized message, bound
  runtime session, canonical Goal events/view/receipt, and provider send result.
  Unit transports and installed-artifact adapter probes are labeled synthetic;
  no real provider message is sent by Codex.
- Activation inventory: 181 historical queue tasks, zero queued/running; 245
  historical outbox rows, zero queued. Historical state is not rewritten.
- Compatibility is per new task identity: new session tasks are Goal-owned;
  Feishu p2p stays legacy. Rollback is a normal revert PR and exact-commit
  redeploy; both canonical events and provider-specific evidence remain
  append-only/readable.

## Effects, Non-Goals, And Budgets

- No new effect authority. Direct provider reply is the already-requested IM
  response flow; GoalRuntime and EffectPolicy retain repository, confirmation,
  secret, private-egress, destructive, and irreversible-effect boundaries.
- No Feishu p2p/follow-up migration, real provider injection by Codex,
  automatic multi-tranche scheduler, channel-session-to-Goal persistence
  mapping, queue-backed Goal, historical rewrite, provider SDK change,
  LearningRuntime, broad LiveAgentRunner deletion outside this daemon/session
  seam, `main` merge, tag, release, public publication, or secret export.
- One Evi Goal may propose at most one bounded Codex implementation delegation
  in this worktree. Codex reviews its exact target, branch, base, effect, and
  scope before confirmation, then owns diff review, verification, integration,
  deployment, and live acceptance. Retry only a concrete failed step; do not
  restart a replacement Goal for navigation inefficiency.

## Verification Evidence

- Task253 / Issue #84 closed the Web ingress at merge
  `f3c919a28ab271619936d583984d65e9dc41333e`, stable deployment
  `deployment_20260717235106_f3c919a28ab2`, and accepted real Web receipt
  `goal_receipt_20260717235516_6c88af85` without legacy ledger drift.
- Read-only architecture Goal `goal_20260717235745_73943bd5` confirmed the
  GoalRuntime owner contract, daemon runner construction, shared IM factory,
  and legacy `runtime_channel_task` writes, but did not reach the requested A/B
  decision after three tranches. Codex explicitly abandoned it with receipt
  `goal_receipt_20260717235938_6620d143`; no change is attributed to it.
- Direct source inspection separated provider-neutral runtime-session execution
  from Feishu p2p history/follow-up execution. Codex selected the smaller
  complete runtime-session boundary rather than a provider-wide partial rewrite.
- Live inventory before activation: 181 historical queue tasks with no
  queued/running entry; 245 outbox rows with no queued entry.
- Implementation Goal `goal_20260718000336_3423dbb2` read this task once,
  proposed the exact bounded `codex.run` effect, and Codex confirmed that
  effect in the bound worktree at start HEAD `2a609492`. The delegated Codex
  observation then failed after 265 seconds but left 14 attributable changed
  paths. Task254 allowed only one coding delegation, so Codex did not permit a
  replacement delegation.
- Codex supervisor inspected the entire residual diff, removed session error
  writes to the provider-neutral outbox, added terminal receipt presentation,
  made Telegram/Discord Goal ingress mandatory, removed the Feishu `runner`
  compatibility alias, kept only `legacyPrivateRunner` for p2p, updated current
  capability/docs facts, and added success/failure/no-dual-write evidence for
  all three providers.
- Standards review found that generic scenario `model_id` still gated
  Telegram/Discord even though session execution had moved to independently
  configured `goal_cognition`. Codex fixed the owner, not the adapters:
  `ImScenarioBase` no longer exposes a generic execution model or discipline;
  only Feishu carries explicit `legacyPrivate*` execution fields for p2p, and
  CLI/service/doctor no longer consume unused Telegram/Discord scenario model
  auth. Config, doctor, and service tests prove an absent unused scenario model
  does not block Goal-backed providers.
- Evi's implementation Goal was explicitly abandoned rather than allowed to
  claim supervisor-owned recovery. Receipt
  `goal_receipt_20260718001958_88003f55` records the failed observation,
  attributable paths, and `verification.status=not_run`; this is an honest
  orchestration receipt, not an implementation acceptance receipt.
- Targeted adapter/daemon/Web/Goal tests passed 84/84, capability contract
  tests passed 6/6, TypeScript and `git diff --check` passed. Full
  `pnpm run check` after the final owner fix passed build, 962/962 tests, active-vault skill validation,
  and neutral naming across 129 implementation files.
- Independent Spec and Standards reviews both returned PASS after their
  document and model-owner findings were repaired.
- PR integration, exact-commit deployment, controller handoff,
  installed-artifact synthetic adapter acceptance, and live service health
  remain pending.
- Post-merge deployment inspection found one observability drift before rollout:
  `service status` still projected the retired queue worker from a stale
  `services/runtime/task_queue.json`. Codex owns this correction because it is
  a current runtime-boundary contract, not an Evi task-level recovery. A
  follow-up branch removes the retired worker from the service definition,
  manifest, and result while preserving the historical status file and manual
  recovery implementation as readable evidence.
- The follow-up regression leaves a deliberately stale `task_queue.json` in
  the service-status fixture and proves the result omits `task_queue`.
  Service/capability focused tests passed 25/25, TypeScript and
  `git diff --check` passed, and full `pnpm run check` again passed build,
  962/962 tests, active-vault skill validation, and neutral naming across 129
  implementation files.
- Independent follow-up Spec and Standards reviews both returned PASS. The
  Standards review specifically confirmed that the owner-layer removal leaves
  no renamed or filtered compatibility projection and that the deliberate
  stale-file fixture matches the documented historical-evidence boundary.
- PR #87 merged the canonical session ingress at `b520f406`; PR #88 merged the
  stale service-projection retirement at final develop commit `146c38a3807f`.
  Issue #86 is closed. Deployment
  `deployment_20260718004251_146c38a3807f` reached stable, controller handoff
  returned `already_matched`, and live service health was healthy with Feishu
  connected, Web running, and resident/repo commits both `146c38a3807f`.
- Installed-artifact synthetic Telegram acceptance produced completed Goal
  `goal_installed_adapter_acceptance` and receipt
  `goal_receipt_installed_adapter`; task-run, task-queue, and
  provider-neutral outbox counts remained zero. The installed service manifest
  and current status omit the retired queue worker while the historical status
  file remains readable.
