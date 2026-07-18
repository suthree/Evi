# Task 255: Feishu Private-Chat Goal Ingress

Status: completed

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
- Activation commit `1484988aae64b2b6fe998e93c0920e6082598f06` binds this
  task to the named branch and worktree. Evi Goal
  `goal_20260718005140_7c628eb6` read this task as its complete contract. Its
  first proposed `cwd=in-worktree` was rejected by immutable repository
  authority before any write; the same Goal corrected the location and Codex
  confirmed the one permitted implementation effect
  `goal_effect_20260718005237_f031a560` against that commit, branch, and
  worktree.
- The confirmed effect reached its 300-second observation budget after
  introducing 17 attributable paths. It returned no valid terminal claim, so
  Codex did not resume or replace the coding delegation. Under the task's
  recovery rule, Codex inspected those exact paths, removed the proposed
  compatibility alias and residual `TaskRunner` surface, repaired stale tests
  and docs, and added explicit p2p failure plus stale-scenario service
  regressions. This is supervisor recovery from observed local writes, not an
  Evi completion claim.
- Initial independent Spec/Standards reviews rejected missing Goal identity in
  p2p error evidence, post-history objective materialization order, stale
  current-fact outbox/operator-command wording, and two Feishu-only facades
  with no production caller. Codex added typed `GoalIngressError` provenance,
  materializes the objective before inbound persistence, completed provider
  failure evidence, corrected stable docs, deleted the dead scenario/service
  facades, and removed their stale capability refs. Standards re-review then
  rejected using the Start view as failure status; the ingress now reads the
  canonical latest Goal after a Continue exception and records unknown status
  rather than stale state if that read also fails.
- Post-fix focused verification passes across Goal ingress,
  Feishu adapter, Web, IM adapter/config, runtime daemon, doctor, service, and
  capabilities; the TypeScript build and `git diff --check` also pass. Full
  `pnpm run check` passes 966/966 tests plus skill and neutral-naming
  validation. Independent Spec and Standards/architecture re-reviews both
  report PASS with no remaining blocker. Integration, exact-commit deployment,
  controller handoff, installed-artifact acceptance, and live health remain
  pending.
- Codex offered the same Goal one bounded outcome-acceptance continuation after
  recording the verified recovery. The first invocation used the isolated
  worktree's tracked config and correctly failed because ignored local config
  is root-checkout state; retrying with the canonical root config reached
  cognition, which attempted a second malformed `codex.run` instead of
  accepting the evidence. Codex confirmed no effect, abandoned the Goal under
  the one-delegation contract, and preserved receipt
  `goal_receipt_20260718011328_f2ea39c7`. Task completion therefore remains a
  supervisor claim backed by independent checks, not an Evi Goal success.
- PR #90 merged the reviewed task diff into `develop` at
  `396fd193b35332581503b10818d1883959610c41`. Full `pnpm run check` passes
  966/966 tests; the installed runtime reports `healthy`, `deployment: current`,
  the same source commit, Feishu inbound connected, and Web running. Issue #89
  was closed from this integration and live evidence during Issue #91
  stabilization.
