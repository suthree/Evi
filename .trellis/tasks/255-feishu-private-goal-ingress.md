# Task 255: Feishu Private-Chat Goal Ingress

Status: active

## Identity And Ownership

- Issue: GitHub Issue #89, `refactor(feishu): make private-chat tasks canonical
  Goals`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`; dependency Issue #86 is closed.
- Decision Owner / authority basis: operator-authorized local self-growth.
  Evi owns cognition, the bounded implementation effect proposal, and Goal
  outcome acceptance. Codex owns the architectural boundary, exact effect
  confirmation, attributable-diff recovery, final verification, integration,
  deployment, and the completion claim.
- Owner repository / implementation owner: Evi / Evi-controlled Codex work in
  this isolated worktree.
- Capability layer: basic-entrypoint over the core GoalRuntime control plane.
- Base: `146c38a3807f3dc748a4dbd3eb1653d6eeff5669` on `develop`.
- Branch/worktree: `codex/issue-89-feishu-p2p-goals` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/89-feishu-p2p-goals`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Architecture

Feishu p2p/private chat is the last interactive IM task ingress owned by
`LiveAgentRunner`. Ordinary allowed messages load bounded provider history,
write provider inbound evidence, invoke `TaskRunner`, map `RunResult` to text,
write provider-neutral outbox and episode evidence, and serialize same-sender
follow-ups in memory. The resident daemon therefore still constructs a second
execution owner and Feishu scenario/service/doctor readiness still depends on
legacy private model and query/todo fields.

The coherent boundary is an ordinary allowed p2p message, including its
bounded same-chat history, becoming one Goal objective. The existing
`GoalIngressPort` owns Start plus one Continue; the adapter retains allowlist,
deduplication, history selection, same-open-id serialization, transport sends,
provider evidence, read-only operator commands, and operator notifications.
There is no p2p runtime-session identity or compatibility `RunResult`.

## Scope And Acceptance

- Require `GoalIngressPort` in the Feishu adapter and use it for every ordinary
  allowed p2p task as well as existing group/session work.
- Preserve bounded conversation history and render it into the p2p Goal
  objective before recording the current inbound provider artifact.
- Preserve ack, busy/error behavior, direct sends, deduplication, allowlist,
  and bounded same-open-id in-memory follow-up serialization. Queued artifacts
  remain observability-only and are not replayed after restart.
- Record p2p final-delivery evidence with `goal_id`, Goal status, receipt id,
  inbound ref, text, and provider message ids. Goal failures stay in
  provider-specific error evidence.
- New p2p Goals append no legacy run/task queue/provider-neutral outbox,
  completion, episode, query/todo, iteration, SOP, skill, or deployment state.
- Keep read-only Feishu operator commands and operator-notification delivery
  outside model and Goal execution.
- Remove Feishu adapter/factory/daemon `TaskRunner` or `LiveAgentRunner`
  construction. Remove current Feishu scenario/service/doctor ownership of
  legacy private model/discipline/reply/concurrency fields; stale scenario
  fields may parse as ignored input but must not gate current readiness.
- Delete p2p-only RunResult mapping/evidence helpers when their last caller is
  removed; preserve memory read-model operator commands that still use
  `MemoryStore` and episode types.
- Update current-fact capabilities and stable English/Chinese operator docs.
- Focused p2p/follow-up/daemon/config/service/doctor/Goal tests, TypeScript,
  `git diff --check`, full `pnpm run check`, independent Spec/Standards review,
  PR integration, exact-commit deployment, controller handoff,
  installed-artifact synthetic p2p acceptance, and live service health pass.

## Reuse, Complexity, Data, Compatibility, And Rollback

- Reuse `GoalIngressPort`, `renderGoalIngressPresentation`, `renderAgentTask`,
  existing bounded history loading, follow-up queue, direct transport, and
  provider evidence. Add no queue, scheduler, result mapper, database,
  dependency, service, or new provider abstraction.
- Authoritative inputs are the normalized allowed p2p message, same-chat
  bounded provider history, canonical Goal view/receipt, and transport result.
  Unit transports and installed-artifact probes are labeled synthetic; Codex
  sends no real Feishu message.
- Compatibility is per new message identity: historical runs/outbox/episodes
  remain readable and operator commands remain stable, but every new ordinary
  p2p task is Goal-owned. Stale `scenario.model_id`/discipline input may be
  ignored rather than rewritten.
- Rollback is a normal revert PR and exact-commit redeploy. Provider evidence,
  canonical Goal events/receipts, and historical legacy records remain
  append-only/readable.

## Effects, Non-Goals, And Budgets

- No new effect authority. The direct Feishu reply is the requested response
  flow; GoalRuntime and EffectPolicy retain repo, confirmation, secret,
  private-egress, destructive, and irreversible-effect boundaries.
- No real provider injection by Codex, operator-command migration, durable
  follow-up replay, automatic multi-tranche scheduler, p2p runtime sessions,
  historical rewrite, provider SDK change, learning promotion, new service or
  dependency, `main` merge, tag, release, public publication, or secret export.
- One Evi Goal may read this task and propose at most one exact bounded
  `codex.run` implementation effect in this worktree. Codex confirms only after
  checking goal, target, base, branch, scope, and effect. If observation fails
  after attributable writes, Codex inspects and recovers that diff; it does not
  start a replacement coding Goal. Retry only a concrete failed verification
  or integration step.
- Codex intervenes immediately for owner-boundary drift, compatibility layers,
  hidden legacy writes, misleading evidence, unscoped external effects, or
  verification/integration/deployment. Evi resolves local implementation
  choices and bounded test failures that remain inside this contract.

## Verification Evidence

- Task254 closed Issue #86 at develop `146c38a3807f`; deployment
  `deployment_20260718004251_146c38a3807f` is stable and healthy, proving the
  shared Goal ingress and retired resident queue boundary before this slice.
- Source inspection identifies the remaining execution seam at
  `FeishuPrivateChatAdapter.runSingleMessage`, `legacyPrivateRunner`,
  `runtime_daemon` runner construction, and Feishu-only legacy scenario fields.
  Conversation history, follow-up serialization, operator commands, and
  notification delivery are adapter-owned and remain in scope only as
  preserved behavior.
- Activation, Evi Goal/effect, implementation, review, verification,
  integration, deployment, and installed-artifact evidence remain pending.
