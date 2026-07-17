# Task 251: Verification Evidence Role

Status: verified; integration and live acceptance pending

## Identity And Ownership

- Issue: GitHub Issue #80, `fix(goals): separate verification evidence from
  effect safety`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth.
  Codex intervenes because Evi produced correct execution evidence but the
  deterministic GoalRuntime verifier cannot accept it under the current owner
  coupling.
- Owner repository / implementation owner: Evi / current Codex supervisor.
- Capability layer: core GoalRuntime verification.
- Base: `41ed360ccaa57c9492383e09b704a004e88d0929` on `develop`.
- Branch/worktree: `codex/issue-80-verification-evidence-role` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/80-verification-evidence-role`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Evidence

The original Issue #76 live Goal recovered after Issue #78. Evi selected the
profile-owned Codex execution path, Codex created exactly one canonical
`workspace_path`, and Evi later obtained `verification passed` from a corrected
bounded `command.run` in event `goal_event_20260717215025_2c240a7a`.

Outcome event `goal_event_20260717215037_7b97f664` still failed
`post_change_verification`. GoalRuntime currently recognizes verification only
when the EffectPolicy operation is `run_local_verification`; the bounded shell
assertion is correctly classified as `execute_dynamic_code` for safety. A
safety classification therefore incorrectly owns correctness evidence.

## Architectural Outcome

Separate the two decisions while retaining one canonical observation:

- EffectPolicy continues to classify the actual command for execution
  authority. Model purpose and side-effect labels never widen authority, and a
  dynamic shell remains exact-effect confirmation gated.
- `command.run` accepts `purpose=execute|verification`. Verification purpose is
  intent, not proof. The tool harness captures fixed pre/post Git HEAD plus
  bounded semantic-index and Git-visible content fingerprints in the bound
  repo before issuing a passed verification marker.
- A process exit of zero plus unchanged harness snapshots creates one
  harness-authored `local_verification` evidence role. The snapshot covers the
  semantic Git index and bounded tracked/untracked file content, not only path
  status. Failed execution, missing snapshots, HEAD drift, or content drift
  cannot create it.
- Verification-purpose dispatch reserves the existing 200-path-plus-one-commit
  atomic recovery envelope so a command that violates the no-mutation contract
  cannot overflow or erase canonical lineage.
- Receipt capacity is two atomic envelopes (402 identities), so one maximum
  delegated result still has room for one maximum verification recovery result.
- GoalRuntime uses the evidence role for later-verification acceptance and
  evidence pinning. New observations carry an evidence-semantics version even
  when no role is granted; only historical observations without that version
  retain the `run_local_verification` compatibility fallback.

## Scope And Stable Owners

- `packages/core/src/tool_contracts.ts`: expose the bounded command purpose.
- `packages/runtime/src/tools.ts`: parse purpose and own command verification
  snapshots/result marker.
- `packages/runtime/src/goal_runtime.ts`: own canonical observation role,
  replay consistency, evidence projection, and outcome acceptance.
- `packages/runtime/src/goal_execution_adapters.ts`: tell Goal cognition when
  to request verification purpose without changing EffectPolicy authority.
- `.trellis/spec/goal-runtime-control-plane.md`: keep the bounded receipt
  capacity consistent with the execution-plus-recovery invariant.
- Focused tests, paired runtime docs, and `.trellis/decisions.md` only where the
  observable owner boundary changes.

## Acceptance

- A successful purpose-bound command with unchanged Git snapshots is canonical
  local-verification evidence even when EffectPolicy classifies it as dynamic
  code.
- Safety approval remains derived only from the actual command and arguments.
- Failed, unavailable, or workspace-mutating verification cannot satisfy the
  post-change gate.
- Historical `run_local_verification` events remain readable and accepted,
  while a new execute-purpose known verification command cannot gain the role.
- Focused tests, build, `git diff --check`, `pnpm run check`, independent
  Spec/Standards review, PR integration, exact-commit deployment, health, and
  controller identity pass.
- The original Goal resumes under the same identity, emits a new purpose-bound
  verification observation, and reaches one accepted healthy receipt without
  deleting its earlier failures.

## Reuse, Complexity, Data, And Compatibility

- Reuse `command.run`, EffectPolicy, Goal raw events, existing Git process
  helpers, and the canonical verifier. Add no tool, service, registry, evidence
  graph, shell parser, dependency, or writable proof artifact.
- The new purpose is a bounded semantic role, not a permission or claim. The
  smallest sufficient proof is process success plus unchanged harness-owned
  Git fingerprints; raw command output remains ordinary bounded evidence.
- Authoritative data is the fixed Goal repository authority, command process
  result, Git HEAD, semantic index, status, and bounded Git-visible content
  fingerprints. The snapshot hashes up to 10,000 tracked/untracked files and
  64 MiB of content; unsupported or over-limit snapshots fail closed.
  Tests use labeled temporary Git fixtures; live acceptance uses the existing
  real linked worktree.
- New event fields are optional for historical parsing but generated for new
  qualifying observations. Existing recognized `run_local_verification`
  semantics remain a compatibility input, not a second writable store.

## Effects, Non-Goals, Budgets, And Rollback

- No command gains authority. Dynamic code, external effects, secrets,
  destructive actions, and irreversible actions retain their current policy.
- No automatic confirmation bypass, broad command allowlist, verification
  service, LearningRuntime, IM/Web/daemon cutover, adoption, main merge, tag,
  release, publication, secret export, destructive remote action, or history
  rewrite.
- One bounded implementation path; no new subagents. Retry only concrete test
  or review failures. Existing independent reviewers may re-check the final
  diff.
- Red/green tests cover unchanged verification, mutation fail-closed, evidence
  role projection, replay consistency, current verifier compatibility, and
  the dynamic-code owner separation.
- Rollback is a normal revert PR and exact-commit redeploy. Historical Goal
  events remain canonical and the live Goal stays resumable.

## Verification Evidence

- Focused GoalRuntime, command harness, EffectPolicy, and cognition-adapter
  suites: 70 tests passed.
- Full repository check: build passed, 949 tests passed, skills validation
  passed, and neutral naming passed across 129 files.
- Regression cases cover already-dirty tracked and untracked content rewrites,
  index flags that hide a tracked mutation from porcelain status,
  missing/mismatched strict snapshots, truncated-event replay downgrade
  tampering, execute-purpose safety/correctness separation,
  known-verification capacity, and maximum 200-path delegation followed by
  verification.
- Context-budget tests pass without widening a threshold. TypeScript and
  `git diff --check` pass.
- Independent Spec review: PASS; Task251's owner split, fail-closed snapshot,
  historical compatibility, replay boundary, and 402-identity capacity match
  the implementation.
- Independent Standards review: PASS after four P1 fixes; no remaining
  actionable finding across security, replay, compatibility, capacity,
  context, or mechanism complexity.
- PR integration, exact-commit deployment, controller health, and
  original-Goal live acceptance remain intentionally pending.
