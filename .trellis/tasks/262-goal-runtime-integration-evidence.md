# Task 262: Goal Runtime Integration Evidence

Status: implementation ready for review; PR integration, exact deployment,
controller handoff, and same-Goal live acceptance pending

## Identity And Ownership

- Issue: [#103 feat(goal): expose bounded runtime integration evidence](https://github.com/suthree/Evi/issues/103).
- Milestone / target version: the operator-authorized real self-evolution
  closure; no separate GitHub milestone is assigned.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Decision Owner / authority basis: the operator-authorized persistent Codex
  Goal and Issue #103. Evi remains the target outcome owner for the later live
  same-Goal acceptance.
- Capability layer: core/boundary.
- Base: `7067c1bd97ff48389e20d713101cb89fbdaf9710` on `develop`.
- Branch/worktree: `codex/issue-103-runtime-integration-evidence` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/issue-103-runtime-integration-evidence`.

## Problem, Outcome, And Boundaries

Real Feishu Goal `goal_20260718155814_357c4361` independently accepted the
Issue #101 source change, but blocked at sequence 200 because its bound
execution worktree could not safely discover the integration evidence already
owned by the outer harness. PR #102 was merged at exact commit
`7067c1bd97ff48389e20d713101cb89fbdaf9710`; that commit was deployed, the
controller handoff completed, service health was `healthy/current`, and Feishu
inbound was connected. The Goal instead inferred that a separate target
production deployment surface was missing.

The desired outcome is one small read-only Goal tool Interface that derives a
compact runtime integration snapshot from existing canonical owners on every
call. Goal cognition may select it dynamically for bounded verification. The
tool supplies evidence only; GoalRuntime remains the sole acceptance and
completion owner.

Acceptance criteria:

1. Register one control-plane `runtime.inspect` capability with no side effect.
2. Return typed current evidence for control repository HEAD, canonical local
   deployment identity/status, installed controller readiness, service health
   and runtime/repository deployment relationship, Feishu inbound liveness,
   and bounded rollback refs.
3. Reuse existing repository, deployment, service, selector, and controller
   read models. Read the current owners directly rather than copying their
   state into a new ledger or Goal event.
4. Preserve exact commits and evidence refs. Missing, unreadable, stale, or
   mismatched inputs remain explicit and never become success by inference.
5. Route the tool to the Goal control store even after an execution workspace
   is bound. Keep tool selection dynamic and validate it through the ordinary
   capability-selection and effect-policy paths.
6. Add focused contract, executor, portfolio, effect-policy, and read-model
   tests, then pass the full repository gate.
7. After review/integration, deploy the exact accepted merge commit, complete
   controller handoff, and let the same real Feishu Goal select the capability
   and produce a terminal evidence-backed OutcomeReceipt.

Explicit non-goals:

- no task keyword routing, hard-coded task-to-tool map, automatic tool choice,
  or cognition bypass;
- no generic deployment framework, remote production, multi-machine
  semantics, GitHub write/publish operation, or arbitrary file access;
- no new evidence ledger, cache, acceptance record, competing state owner, or
  external claim-ingestion path;
- no state/repository mutation, deployment, restart, model invocation,
  external fetch, Goal lifecycle mutation, or completion authority;
- no broad competence-learning redesign or unrelated CLI/document refactor.

## Design Discipline

- Reuse inspected: `getServiceHealth`, `getLocalDeploymentStatus`,
  `inspectDeploymentControllerReadiness`, service selector/definition
  resolution, `AgentStore`, Goal tool contracts, capability portfolio,
  `RuntimeGoalToolExecutor`, and EffectPolicy.
- `verifyBasicEntrypoints` was rejected as the Interface because it probes Web,
  runs doctor, and writes a durable acceptance record. Its read path also
  validates a prior record instead of deriving a fresh compact Goal snapshot.
- Low-level `file.read scope=state` remains valid for targeted evidence but is
  not a coherent discovery Interface: it requires the model to know several
  owner-specific paths and reconstruct relationships across them. The proposed
  module deepens that composition behind one typed bounded read.
- Complexity is bounded to one tool contract, one deep read-only module, one
  executor branch, and the existing policy/portfolio paths. The portfolio cap
  may increase only enough to retain every registered core capability; no
  ranking or routing layer is introduced.
- Authoritative inputs are the control store repository identity, service
  state root, local deployment ledger, installed supervisor manifest and
  controller artifact, runtime heartbeat/service health, and Feishu inbound
  health. Freshness and mismatches come from those owners at call time.
- Fixtures in tests are synthetic and must be labelled by test setup. Live
  acceptance after deployment is separate evidence.
- No migration or compatibility layer is required. Removal is a normal source
  revert; no new durable state needs retirement.

## Authority, Effects, And Recovery

- The source implementation changes only the isolated worktree. No secret or
  private message body is read or returned; channel evidence is bounded to
  health/liveness metadata.
- The read tool is inside the standing local-read envelope. PR publication,
  merge, exact deployment, controller handoff, and live Feishu commands remain
  separately governed integration effects.
- Rollback is a normal PR revert followed by deployment of the prior stable
  exact commit. Existing deployment history, previous runtime bundle, and
  supervisor backup refs remain authoritative recovery evidence.

## Execution And Evidence

- One main implementation owner; no subagents or parallel workstreams. Context
  is limited to the named runtime/tool/health modules and focused tests.
- Retry budget: at most one implementation correction per failed focused gate
  before re-diagnosing the design. No blind retries.
- Time/tool budget: bounded local inspection and edits, focused tests,
  TypeScript build, `git diff --check`, full `pnpm run check`, and one review /
  integration path.
- Targeted checks must prove the fresh snapshot schema and fail-closed states,
  control-store placement with a bound execution workspace, no-effect policy,
  portfolio visibility, and existing tool behavior preservation.
- Completion evidence must link Issue #103, this task, implementation commit,
  PR/reviews/checks, exact merge/deployment/controller handoff receipts, live
  `healthy/current` plus connected Feishu ingress, and the terminal receipt of
  the same real Goal.
- This activation record does not claim implementation, integration, runtime,
  or same-Goal acceptance.

## Pre-Commit Implementation Evidence

- Added one `runtime.inspect` core tool contract with control-store placement,
  ordinary dynamic Portfolio selection, EffectPolicy local-read
  classification, and strict no-argument execution. No task router or automatic
  selection path was added.
- `packages/runtime/src/runtime_integration_inspection.ts` reads the existing
  service-health, deployment, installed-controller, previous-runtime, and
  repository owners at call time. It returns `consistent`, `inconsistent`, or
  `incomplete` evidence plus exact commits and bounded refs, but writes no
  acceptance record and owns no lifecycle decision.
- The tool loads the integration module only when invoked. A first focused run
  exposed an ESM initialization cycle through deployment -> service -> Feishu
  -> GoalRuntime -> tools; on-demand loading removed that cycle without moving
  ownership or adding a compatibility facade.
- Focused TypeScript and 48 tool/portfolio/policy/executor/read-model tests
  passed. The read-model tests cover a synthetic consistent snapshot, a
  controller-source failure plus commit drift, no state write, and
  control-store placement after execution-workspace binding.
- A real read-only probe against the resident control checkout returned
  `consistent` at `7067c1bd97ff48389e20d713101cb89fbdaf9710`, with stable
  deployment `deployment_20260718165413_7067c1bd97ff`, matched installed
  controller digest/source, healthy/current service, connected Feishu inbound,
  and prior commit/runtime rollback refs. This validates the unmerged reader;
  it does not claim the new tool is resident yet.
- The first full test run exposed that adding a capability exceeded the
  context-bundle bound by 43 characters and changed one acceptance-summary
  phrase. The capability descriptions were compacted without raising the
  budget, and the required acceptance wording was preserved. The focused
  context/acceptance regressions then passed.
- Final `git diff --check` and `pnpm run check` passed: TypeScript build,
  981/981 tests, active Skill validation, and neutral naming across 133
  implementation files.
- Stable docs were updated narrowly in English plus the existing Simplified
  Chinese architecture companion. Integration and live same-Goal evidence
  remain explicitly pending review, PR merge, exact deployment, controller
  handoff, and resident invocation.
