# Task 257: Goal Outcome-Driven Tool Competence

Status: completed

## Identity And Ownership

- Issue: GitHub Issue #93, `refactor(learning): derive tool competence from
  Goal outcomes`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`; stabilization Issue #91 is
  closed and the operator explicitly resumed this one bounded child.
- Decision Owner / authority basis: the operator, through explicit approval in
  the 2026-07-18 Codex discussion. Evi owns durable Goal evidence and future
  capability selection. Codex owns the bounded architecture change,
  verification, integration, deployment, and completion claim.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Capability layer: core GoalRuntime cognition plus local-learning boundary.
- Base: `bc66085fb3e99d7e1f66f668db55f2444588bcbe` on `develop`.
- Branch/worktree: `codex/issue-93-goal-tool-competence` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/93-goal-tool-competence`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Desired Outcome

GoalRuntime already owns canonical action observations and one terminal
OutcomeReceipt, but later Goal cognition receives no cross-Goal tool-use
experience. Its current evidence window is limited to the active Goal. The
legacy selected-skill outcome path does affect recall, proving the useful
pattern, but it is owned by the superseded runner rather than GoalRuntime.

Resident context also loads Self-Evolution Scorecard, Project Design Plan, and
Self-Evolution Iteration sections. Their source and dedicated tests form a
large recursive proof surface, while their contents do not change the next
Goal action. This is context pressure and a self-proof loop, not capability
growth.

The desired outcome is a small derived tool-competence Module: previously
terminal Goal events become bounded decision support for later Goal cognition.
The same slice removes proof-only resident sections and documents project
engineering boundaries so future changes remain understandable without
governing self-evolution through line-count or report gates.

## Scope And Acceptance

- Derive tool experience only from action observations belonging to terminal
  Goals with current OutcomeReceipts. Do not create a new persisted ledger.
- Summarize direct execution successes/failures separately from accepted or
  abandoned Goal association. Never claim that one tool caused the Goal
  result.
- Bound tools, observations, summaries, failure text, and prompt material.
  Repeated or recent failures must advise a verified fallback; sparse history
  stays provisional.
- Inject the derived summary into later Goal cognition as historical decision
  support. Current Goal evidence, EffectPolicy, and verification remain
  authoritative.
- Remove Self-Evolution Scorecard, Project Design Plan, and Self-Evolution
  Iteration from all resident context profiles and render paths. Remove dead
  compaction helpers and implementation-shaped tests when their last resident
  caller disappears.
- Leave remaining legacy read-model commands on-demand in this slice and mark
  their staged retirement. They do not own active work or learning truth.
- Add concise paired engineering standards for module ownership, dependency
  direction, testing seams, documentation ownership, and gradual decomposition.
- Update `CONTEXT.md`, architecture/runtime docs, routers, and paired English /
  Chinese companions where the stable contract changes.
- Targeted tests cover summarization, terminal-only filtering, bounds,
  degraded guidance, cognition injection, and resident-context removal.
  TypeScript, `git diff --check`, full `pnpm run check`, final diff review, PR
  integration, exact-commit deployment, and live health must pass.

## Architecture, Reuse, And Complexity

- Reuse GoalRuntime canonical events, current OutcomeReceipt decisions, the
  existing bounded cognition adapter, and the outcome-aware recall principle.
  Reuse the Context Manifest/profile seam to delete resident sections.
- The new Module is a pure projection with a small summarize interface. It
  neither owns persistence nor exposes GoalRuntime's event schema. GoalRuntime
  maps canonical internal events into the projection input and remains the
  lifecycle owner.
- This is the smallest coherent change because it makes completed experience
  affect a later decision and deletes a resident proof path in one vertical
  slice. It adds no model call, queue, cache, service, database, promotion
  engine, scorecard, dashboard, compatibility layer, or background scheduler.
- GenericAgent and other pinned projects remain architecture references from
  the completed audit; no external source or dependency is copied into this
  task.

## Data, Effects, Compatibility, And Recovery

- Authoritative inputs are canonical `goal_action_observed` events and terminal
  Goal receipts. Tool `ok` is direct execution evidence. Receipt decision is
  Goal-result association only. Timestamps and summaries retain event
  provenance and are truncated before cognition injection.
- Historical legacy stores remain readable and are not rewritten. New Goals
  continue to write only GoalRuntime state. Removing resident sections changes
  context composition, not historical records or on-demand CLI diagnostics.
- No secret, raw tool output, private content, or unbounded history is copied
  into the derived summary. Existing effect, repository, confirmation, and
  egress authority is unchanged.
- Rollback is a normal revert PR and exact-commit redeploy. Canonical events and
  receipts are untouched, so the projection can be removed without migration.

## Non-Goals And Budgets

- No LuBan/multi-node work, automatic SOP/skill promotion, full LearningRuntime
  implementation, broad package movement, sandbox redesign, new dependency,
  public communication beyond Issue/PR records, `main` merge, tag, or release.
- No full deletion of every legacy project-design/scorecard/iteration command
  in this first replacement slice; follow-up removal must be justified by
  remaining callers after this diff.
- One repository, one Issue, one task, one branch/worktree, and one PR. No
  subagents. Read only task-relevant source, tests, and stable docs. Retry only
  a concrete failed check, integration, or deployment step.
- Cognition input is bounded to at most eight tools, recent terminal experience
  only, and short diagnostic summaries; implementation tests own exact limits.

## Verification Plan

- Unit projection tests: terminal inputs, direct outcome counts, receipt
  association, sparse/reliable/degraded status, recent-failure guidance,
  deterministic ordering, truncation, and limits.
- GoalRuntime/cognition tests: only prior terminal Goals contribute; unfinished
  and current Goal events do not; bounded experience appears in the next model
  input without adding another model call or state write.
- Context tests: the three proof sections and their source reads are absent
  from every resident profile; remaining context manifest behavior is stable.
- Documentation/domain checks: paired links and owners agree; engineering
  guidance remains structural and does not add self-proof iteration rules.
- Repository/integration: targeted tests, TypeScript build, `git diff --check`,
  full `pnpm run check`, final diff and line-count inspection, commit/push/PR to
  `develop`, merge, root fast-forward, exact-commit local deployment, health,
  rollback receipt, Issue/task closure, and worktree cleanup.

## Completion Evidence

- Activation commit `5ac0758` created this task from exact `develop` base
  `bc66085fb3e99d7e1f66f668db55f2444588bcbe` and was pushed before
  implementation. GitHub Issue #93 and parent Issue #56 record the operator's
  explicit decision to resume this one bounded outcome-learning child after
  stabilization.
- Implementation commit `7af40e539db4e5441cffcbba3359f049369a6c44`
  adds a pure `goal_tool_competence` projection over canonical terminal Goal
  history. It writes no state, adds no model call or dependency, separates
  direct tool execution results from accepted/abandoned Goal association, and
  injects at most eight bounded historical summaries into later Goal cognition
  as non-authoritative decision support.
- GoalRuntime integration tests prove that action observations from an
  unfinished Goal are absent and that a later Goal receives experience only
  after the earlier Goal has a terminal OutcomeReceipt. Projection tests cover
  sparse, reliable, and degraded histories; recent-failure fallback guidance;
  deterministic ordering; hard history/tool limits; and failure-text
  truncation.
- Resident context no longer imports or renders Self-Evolution Scorecard,
  Project Design Plan, or Self-Evolution Iteration. Their capability-catalog
  advertisements, dead compaction helpers, and implementation-shaped resident
  context tests were removed. The remaining legacy commands are explicit
  on-demand diagnostics pending caller-based retirement.
- Paired `docs/ENGINEERING.md` and `docs/ENGINEERING.cn.md` now own source,
  directory, dependency, test, and documentation structure without defining
  self-evolution authority. Domain and architecture docs distinguish direct
  observation, Goal association, and causal attribution and record the staged
  replacement boundary.
- The focused seven-file command passed 227/227 tests. A local Markdown-link
  check passed for all 15 changed/new Markdown files. `git diff --check`
  passed. Full `pnpm run check` passed TypeScript build, 941/941 tests,
  active-vault skill validation, and neutral naming across 129 implementation
  files.
- Final review recorded 896 insertions and 3,269 deletions across 27 files.
  The change adds no dependency, lockfile, persisted schema, service, queue,
  database, compatibility layer, or runtime-state artifact. `context.ts` was
  reduced to 3,022 lines, `docs/RUNTIME_CONTRACT.md` to 3,919,
  `docs/LOCAL_RUNTIME.md` to 1,854, and `tests/context_harness.test.ts` to
  10,950; the remaining large files stay under the documented
  no-unrelated-growth rule rather than a line-count gate.
- GitHub Issue #93 owns final external receipts that cannot be embedded in the
  pre-merge task commit: PR identity, merge commit, exact-commit resident
  deployment and health, parent reconciliation, branch/worktree cleanup, and
  Issue closure. Those effects remain part of the same supervised delivery and
  must complete before reporting the overall task done to the operator.
