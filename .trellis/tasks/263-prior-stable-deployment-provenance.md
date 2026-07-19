# Task 263: Prior Stable Deployment Provenance

Status: active; implementation, review, integration, deployment, and same-Goal
acceptance pending

## Identity And Ownership

- Issue: [#105 fix(goal): expose prior stable deployment provenance](https://github.com/suthree/Evi/issues/105).
- Milestone / target version: operator-authorized real self-evolution closure;
  no separate GitHub milestone is assigned.
- Owner repository / implementation owner: Evi / Codex in this isolated
  worktree.
- Decision Owner / authority basis: the operator-authorized persistent Codex
  Goal, Issue #105, and the measured live blocker from the same real Feishu
  Goal. Evi remains the outcome and acceptance owner.
- Capability layer: core/boundary.
- Base: `90a785879c56c61170457a7919fff5b514cedc1d` on `develop`.
- Branch/worktree: `codex/issue-105-prior-deployment-provenance` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/issue-105-prior-deployment-provenance`.

## Problem, Outcome, And Boundaries

After PR #104 integration and exact deployment, real Feishu Goal
`goal_20260718155814_357c4361` dynamically selected resident
`runtime.inspect` at sequence 202. Sequence 203 observed `consistent` evidence
at `90a785879c56c61170457a7919fff5b514cedc1d`, including a stable/current
service, connected Feishu inbound, and previous runtime commit
`7067c1bd97ff48389e20d713101cb89fbdaf9710`. Sequence 204 still blocked
correctly because the compact evidence did not prove that Issue #101's accepted
head `6c90aa2e76109efc0f2af3480ffcc51b79ff4e6d` had entered and passed the prior
stable deployment before the later evidence repair.

Canonical local evidence already exists: deployment history records
`7067c1bd97ff48389e20d713101cb89fbdaf9710` as stable, and the local Git graph
records accepted head `6c90aa2e76109efc0f2af3480ffcc51b79ff4e6d` as its second parent. The desired
outcome is to compose those two existing owners into the same bounded read-only
integration snapshot. This proves lineage without accepting a later commit as
an unexplained substitution.

Acceptance criteria:

1. For the current deployment's exact `previous_source_commit`, locate one
   matching, validated historical deployment record and expose its identity,
   status, stable timestamp, and precise history ref.
2. Reuse the repository-authority Git seam to expose bounded commit provenance
   for that exact historical deployment: validated commit, bounded parents,
   control HEAD, and ancestor relationship.
3. Missing, corrupt, ambiguous, invalid, or unreadable history/Git inputs stay
   explicit and make the integration snapshot incomplete; no evidence is
   inferred from filenames, summaries, or model claims.
4. Keep every external string/list bounded and retain explicit truncation or
   source-read metadata where applicable.
5. Preserve the existing `runtime.inspect` control placement, dynamic
   selection, EffectPolicy path, and GoalRuntime completion ownership.
6. Add focused history lookup, Git provenance, composition, corrupt-input, and
   live-shape regression tests; pass `git diff --check` and full
   `pnpm run check`.
7. Integrate through review/PR, deploy the exact accepted merge commit, complete
   controller handoff, and let the same Feishu Goal produce a terminal
   evidence-backed OutcomeReceipt.

Explicit non-goals:

- no GitHub API, network fetch, external claim ingestion, PR mapping service,
  arbitrary commit argument, task keyword routing, or automatic tool choice;
- no new ledger, cache, deployment record, Goal event kind, acceptance record,
  or competing repository/deployment state owner;
- no repository/state mutation, deployment, restart, model invocation, Goal
  lifecycle mutation, or completion authority inside the evidence reader;
- no generic Git history browser, deployment-history CLI redesign, competence
  redesign, or unrelated cleanup.

## Design Discipline

- Reuse inspected: `getLocalDeploymentStatus`, deployment history records and
  validators, `repository_authority.ts` Git command boundary,
  `inspectRuntimeIntegration`, the existing `previous_source_commit`, and the
  current output-bound/truncation model.
- The smallest coherent design is one exact-commit history lookup owned by the
  deployment module plus one exact-commit provenance read owned by repository
  authority, composed by the existing deep `runtime.inspect` module. It does
  not widen the public Goal tool arguments or candidate routing surface.
- Inputs are the current validated deployment ledger, bounded history directory
  names and records, the current control Git checkout, and the previous runtime
  build. Freshness is evaluated on every invocation. Tests use labelled
  synthetic repositories and deployment records; live acceptance is separate.
- History lookup validates record content and exact commit equality rather
  than trusting a filename. Multiple exact matches, scan overflow, invalid
  target records, and Git lookup failures fail closed.
- No dependency, state-schema, migration, or compatibility layer is required.
  Removal is a normal focused revert; existing history and Git objects remain
  canonical.

## Authority, Effects, Recovery, And Evidence

- Source changes are confined to this worktree. No secret, private message
  body, or remote state is read or returned.
- Local Git and deployment-history reads are inside the accepted local-read
  envelope. PR publication, merge, exact deployment, controller handoff, and
  Feishu control commands remain separately governed integration effects.
- Rollback is a normal PR revert followed by exact deployment of the prior
  stable commit. Existing current/previous runtime slots, deployment history,
  and controller backup refs remain the recovery owners.
- One implementation owner; no parallel implementation workstreams. Use one
  correction per failed focused gate before re-diagnosing. Independent Spec
  and Standards reviews run only after focused and full checks pass.
- Completion evidence must link Issue #105, this task, source commits, PR
  reviews/checks, merge/deployment/controller receipts, resident
  `healthy/current` plus connected inbound, the live `runtime.inspect`
  observation, and the terminal receipt from the unchanged real Goal.

## Activation Evidence

- Root `develop` was clean and aligned with `origin/develop` at
  `90a785879c56c61170457a7919fff5b514cedc1d` before this worktree was created.
- Local read-only checks confirmed historical deployment
  `deployment_20260718165413_7067c1bd97ff` is stable at `7067c1b`, and `git
  show -s --format=%H\ %P 7067c1b` has parents `a0f5ce1` and accepted Issue #101
  head `6c90aa2`.
- This activation record does not claim implementation, review, integration,
  deployment, or same-Goal acceptance.

## Pre-Review Implementation Evidence

- The bounded deployment owner now performs an exact 40-character source
  commit lookup against canonical history entries, validates both record
  content and record-id/file ownership, and rejects missing, corrupt,
  ambiguous, over-limit, or unreadable candidates without mutation.
- Repository authority now exposes one validated local commit plus at most 16
  parent commits, current control HEAD, and the local ancestor relationship.
  It performs no fetch, checkout, ref mutation, or repository write.
- `runtime.inspect` composes those owners only for the current deployment's
  `previous_source_commit`, bounds every returned string/list, and treats
  missing or unreadable sources as incomplete rather than inferred evidence.
- Focused tests passed 53/53 across the changed inspection, tool-contract,
  portfolio, EffectPolicy, adapter, and runtime-tool seams. The new direct
  history/Git/composition suite passed 12/12, including synthetic corrupt,
  ambiguous, identity-mismatch, unmerged-commit, missing-source, and output
  truncation cases.
- Full `pnpm run check` passed: TypeScript build, 992/992 tests, skill
  validation, and neutral naming validation across 133 implementation files.
  `git diff --check` also passed.
- A read-only live-shape probe against the control repository and runtime state
  returned `consistent` with no reasons, source errors, or truncation. It
  resolved prior stable deployment
  `deployment_20260718165413_7067c1bd97ff`, commit `7067c1b`, and local parents
  `a0f5ce1` plus accepted Issue #101 head `6c90aa2`; the commit is an ancestor
  of current control HEAD `90a7858`. Resident health remained
  `healthy/current` and Feishu inbound remained `connected`.
- These are implementation and pre-integration checks only. Independent
  reviews, PR merge, exact deployment, controller handoff, and same-Goal
  terminal acceptance remain pending.
