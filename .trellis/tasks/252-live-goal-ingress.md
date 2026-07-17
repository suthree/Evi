# Task 252: Live Goal Ingress

Status: verified; integration and live acceptance pending

## Identity And Ownership

- Issue: GitHub Issue #82, `refactor(cli): cut over live tasks to one
  GoalRuntime identity`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth.
  Codex selects and supervises this whole-ingress boundary; Evi owns cognition,
  action proposals, and outcome acceptance inside each Goal.
- Owner repository / implementation owner: Evi / current Codex supervisor.
- Capability layer: basic-entrypoint over the core GoalRuntime control plane.
- Base: `b47681a2c131c59767ba3973b50a791d6394d44f` on `develop`.
- Branch/worktree: `codex/issue-82-live-goal-ingress` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/82-live-goal-ingress`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Evidence

The explicit `goal` CLI is already a thin GoalRuntime ingress. The standalone
`live` command at `apps/cli/src/main.ts:1822-1837` still constructs
`LiveAgentRunner`, which writes legacy opportunity, episode/context, working,
completion, and learning-adjacent state before returning a legacy `RunResult`.

Web, IM, daemon, and the resident worker additionally depend on runtime task
queue, session/run, and channel-outbox state. Cutting them over now would mix
goal ownership with transport/session migration. A supervised read-only Goal
`goal_20260717224249_d6cabfe9` safely located the current goal, service, and
daemon owners, but the Codex supervisor explicitly abandoned it after 19 model
rounds and 18 reads because the multi-ingress objective was too broad for the
four-tool tranche. Its receipt is
`goal_receipt_20260717224642_f8b162c2`; no repository change occurred.

Tasks249–251 were already merged, deployed, and accepted by the original live
Goal, but their checked-in status still advertised active/pending work. This
transition task records those exact existing PR, deployment, event, and receipt
identities so the next active child does not inherit false governance state.
Following the established predecessor-transition pattern, this is included
here instead of creating an evidence-only Issue and PR with no runtime change.

## Architectural Outcome

- `live --task` becomes a whole-goal convenience ingress: issue one Start and
  exactly one bounded Continue to the same GoalRuntime and return its canonical
  `GoalView`.
- Active, blocked, verification-failed, soft-budget, paused, and confirmation
  outcomes keep the same `goal_id`; later work uses `goal continue|resume`.
- The ingress owns no lifecycle, retry, evidence, completion, learning, or
  compatibility state. It reuses the existing local GoalRuntime factory and
  public `handle(command)` boundary.
- Query/todo discipline cannot be translated without dual-writing legacy
  orchestration. Explicit `--query-todo` or `--discipline query_todo` on
  `live` therefore fails before GoalRuntime construction with migration
  guidance.
- `LiveAgentRunner` remains only for the deferred Web/IM/daemon/resident-queue
  surfaces. No `RunResult` compatibility mapper or automatic multi-tranche
  loop is added.

## Scope And Stable Owners

- `apps/cli/src/goal.ts`: own the stateless Start-plus-one-Continue ingress
  translation over an injected GoalRuntime port.
- `apps/cli/src/main.ts`: route `live` through that ingress and reject legacy
  discipline before runtime construction.
- `tests/goal_cli.test.ts` and focused CLI tests: protect identity reuse,
  bounded dispatch, lifecycle result, no legacy state, and early rejection.
- `docs/RUNTIME_CONTRACT.md`, `docs/LOCAL_RUNTIME.md`, and
  `docs/README.cn.md`: advertise the cutover and remaining legacy surfaces.
- `package.json`: keep the named smoke command consistent with the supported
  live command surface without claiming synchronous SOP/skill promotion.
- `.trellis/decisions.md`: record the durable whole-live-ingress decision.
- `.trellis/tasks/249-delegated-workspace-attribution.md`,
  `.trellis/tasks/250-codex-auto-selection.md`, and
  `.trellis/tasks/251-verification-evidence-role.md`: close already-delivered
  predecessor records from their existing PR/deployment/original-Goal evidence;
  make no new implementation claim for those slices.

## Acceptance

- One live request emits exactly one Start and one Continue command with the
  second command bound to the first returned `goal_id`.
- The returned value is the exact canonical `GoalView`, including status,
  continuation reasons, pending effect, and receipt.
- A deterministic temporary-state fixture proves no legacy opportunity,
  runtime queue, episode, working checkpoint, completion, iteration, SOP,
  skill, deployment, service, or channel path is written.
- Query/todo live invocation fails before GoalRuntime construction or dispatch
  and tells the operator to use the Goal lifecycle.
- Explicit Goal CLI lifecycle behavior remains unchanged.
- Predecessor Tasks249–251 stop advertising stale active/pending state and cite
  only their already-observed PR, stable deployment, canonical event, and
  accepted receipt identities.
- Focused tests, TypeScript build, `git diff --check`, full `pnpm run check`,
  independent Spec/Standards reviews, PR integration, exact-commit deployment,
  runtime health, controller identity, and one real live acceptance pass.

## Reuse, Complexity, Data, And Compatibility

- Reuse the existing `createLocalGoalRuntime`, `GoalRuntimePort`, Goal commands,
  cognition, EffectPolicy, verifier, and tool executor. Add no service, queue,
  database, dependency, receipt mapper, or compatibility state.
- The stateless ingress helper is the smallest coherent seam: it is testable
  without CLI process or model access and can later inform channel ingress,
  while not prematurely abstracting Web/IM transport behavior.
- Authoritative data is the injected GoalRuntime command/result sequence and a
  bounded temporary AgentStore state root. Unit fixtures and cognition/tool
  doubles are labeled deterministic or synthetic; live acceptance uses the
  installed local config and real state root.
- Historical legacy live state remains readable. New standalone live tasks
  never enter legacy orchestration. Web/IM/daemon/queue compatibility remains
  explicitly deferred rather than hidden behind a mapper.

## Effects, Non-Goals, Budgets, And Rollback

- No new effect authority. GoalRuntime and EffectPolicy retain all existing
  allow/confirm/deny, repository, confirmation, and verification boundaries.
- No Web, IM/Feishu, daemon, resident queue, runtime session, channel outbox,
  pipeline, adoption, LearningRuntime, broad `LiveAgentRunner` deletion,
  automatic multi-tranche loop, main merge, tag, release, publication, secret
  export, destructive remote action, or historical rewrite.
- One bounded implementation path; no new subagents. Retry only concrete test,
  review, integration, deployment, or live-acceptance failures. Existing
  independent reviewers may re-check the final diff.
- Rollback is a normal revert PR and exact-commit redeploy. New canonical Goal
  events remain append-only and readable after rollback.

## Verification Evidence

- Stateless live ingress, CLI routing, query/todo rejection, runtime/docs, and
  transition-governance updates are implemented in the isolated worktree.
- Focused Goal CLI/ingress suite: 9/9 tests passed. Two real CLI subprocess
  fixtures prove query/todo fails before repository/config construction and a
  missing-model Continue returns one canonical blocked Goal view; the latter's
  temporary state root contained only canonical `goals/` files.
- TypeScript build and `git diff --check` passed.
- Full repository check passed: 954/954 tests, skill validation, and neutral
  naming across 129 implementation files.
- Independent Spec review: PASS after correcting the Chinese current-cutover
  statement and replacing stale pending verification text.
- Independent Standards review: PASS after adding real CLI subprocess coverage,
  separating legacy LiveAgentRunner context docs, and explicitly bounding the
  predecessor-task transition closure in this task.
- Integration, exact-commit deployment, controller health, and real live
  acceptance remain pending.
