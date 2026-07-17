# Task 247: Bounded File Read Window

Status: complete; Issue #72 closed after same-identity installed-runtime acceptance

## Identity And Ownership

- Issue: GitHub Issue #72, `feat(tools): add bounded line-window reads for Goal
  cognition`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth under
  the accepted persistent GoalRuntime direction. Codex intervenes because the
  measured defect is in Evi's basic repository-read capability; Evi remains
  responsible for the architecture diagnosis after that capability is repaired.
- Owner repository and implementation owner: Evi repository; current Codex
  supervisor implements and verifies this bounded repair.
- Capability layer: basic tool capability used by the core runtime.
- Base: `ff1849e101bba0766f2e0b141d3e61e5e7b90ef6` on `develop`.
- Branch/worktree: `codex/issue-72-bounded-file-read-window` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/72-bounded-file-read-window`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Evidence

After Task 246 was deployed, installed Goal
`goal_20260717190203_ec82a197` advanced under the same identity through 21
cognition rounds and 19 tool calls without a false budget block. It still did
not finish its bounded architecture diagnosis. The trace repeatedly found deep
symbols through `repo.search`, whose result already includes exact line numbers,
then called `file.read`, which accepted only `scope`, `path`, and `max_chars`
and returned only the file prefix. The Goal reread prefixes and eventually
drifted into legacy `stage_runner.ts` instead of inspecting the matched
GoalRuntime implementation.

This is a basic access-shape defect. It is not evidence for a larger prompt, a
new planner, another checkpoint store, or stronger per-step governance.

## Outcome And Acceptance

- `file.read` accepts an optional positive one-based start line and a bounded
  maximum line count while preserving its existing bounded character ceiling.
- The result reports the actual returned line range, whether unread content
  remains, and the next start line when continuation is possible.
- Existing callers that omit window arguments retain bounded prefix-read
  behavior.
- Invalid, non-integer, non-positive, or over-limit window arguments fail
  closed before the file is read. Existing repository/state path validation
  and EffectPolicy authorization remain authoritative.
- Deterministic tests cover default compatibility, deep reads, final and
  truncated windows, character-bound truncation, invalid arguments, missing
  paths, and protected-path behavior.
- Targeted checks, `pnpm run check`, diff audit, independent review, PR merge to
  `develop`, commit-bound deployment, health, and controller identity pass.
- After deployment, continue the existing Goal
  `goal_20260717190203_ec82a197`. It must use search-location evidence plus a
  bounded deep read and either finish its architecture diagnosis or expose a
  distinct, measured blocker. No successor Goal can satisfy this acceptance.

## Scope And Stable Owners

- `packages/core/src/tool_contracts.ts` owns the model-visible `file.read`
  argument contract.
- `packages/runtime/src/tools.ts` owns validated bounded file-window execution
  and result metadata.
- Focused tests and paired runtime docs change only where required by the
  observable contract.
- Task 246 completion is recorded in this transition commit so no separate
  evidence-only pull request is created.

## Reuse, Complexity, And Data Contract

- Reuse the existing `file.read` tool, state/repository path resolvers,
  character cap, tool observation flow, and EffectPolicy. Do not add a second
  read tool, file index, retrieval store, event type, or planning mechanism.
- Inputs are one validated local path, optional `start_line`, optional
  `max_lines`, and the existing `max_chars`. Output is text plus explicit
  one-based progress metadata.
- Reading and output must remain bounded in memory and time. The implementation
  may stream lines and stop once either bound is reached; it must not load an
  arbitrarily large file merely to serve a small window.
- Tests use repository/state fixtures. Only the post-deployment continuation of
  the named installed Goal is live model evidence.

## Authority, Effects, And Non-Goals

- The repair changes an existing local read capability only. It does not widen
  path authority, expose secrets, authorize writes, or perform an external
  effect.
- No cognition checkpoint redesign, no-progress detector, automatic planner,
  `codex.run` engineering authorization, IM/Web/daemon cutover, adoption,
  LearningRuntime, legacy deletion, main merge, tag, release, publication,
  secret export, or destructive remote action.

## Budgets, Verification, And Rollback

- Execution budget: one bounded implementation path, no new subagents, and no
  retry loop beyond fixing observed test or review findings.
- Red loop: focused tool-contract/runtime tests must first fail on the missing
  window and progress contract, then pass without weakening existing tests.
- Full verification: typecheck, `git diff --check`, `pnpm run check`, and two
  independent reviews against Issue #72 and repository standards.
- Live verification: deploy the exact merged commit, prove healthy resident and
  controller identity, then continue the same Goal until it completes or
  reports a new evidence-backed blocker.
- Rollback: revert the bounded source/test/doc change through a normal PR and
  redeploy the previous stable commit. No persisted Goal schema or canonical
  event changes, so existing Goal history remains valid.

## Implementation Checkpoint

- The red loop was `node --import tsx --test tests/runtime_tools.test.ts`.
  Before the repair it failed five assertions across default progress metadata,
  deep windows, character-bound continuation, invalid arguments, and the
  model-visible tool contract.
- `file.read` now validates one-based `start_line`, bounded `max_lines`, and
  bounded `max_chars`, then streams the validated repository or state file.
  Successful results expose actual line range, character and scan counts,
  truncation reason, lossless-continuation availability, and the next line only
  when that cursor can preserve the unread text.
- The stream counts complete Unicode code points, treats CRLF as one logical
  newline token, never emits a split surrogate or dangling carriage return, and
  stops deep-start scanning at a fixed 4 MiB decoded-byte ceiling with typed
  `scan_limit_exceeded` evidence.
- Missing files and non-file paths fail explicitly. Existing repo-local runtime
  path rejection and EffectPolicy authority are unchanged; no write, event,
  checkpoint, model, or persistence surface was added.
- The first independent reviews found an unbounded deep-start scan, lossy
  long-line continuation, Unicode/CRLF boundary corruption, and a newline-token
  continuation edge. Each finding was reproduced, repaired, and covered by a
  deterministic regression test. Final independent Standards and Spec reviews
  both return PASS with no remaining actionable finding.
- The focused tool suite passes 29/29. TypeScript build and `git diff --check`
  pass. `pnpm run check` passes with 934/934 tests plus skill validation and
  neutral-naming validation.
- PR #73 merged to `develop` at
  `27d210efd1010f4345530223c18c78c59efff48c`. Deployment
  `deployment_20260717195443_27d210efd101` reached stable at the same commit;
  controller handoff returned `updated` and then `already_matched`, and resident
  health is `healthy` with installed build equal to repository HEAD.
- The existing installed Goal `goal_20260717190203_ec82a197` continued from
  sequence 47 and used deep line windows across `tools.ts`, `effect_policy.ts`,
  and `goal_runtime.ts`, proving the capability without a successor Goal.
- At sequence 110 the same trace exposed a distinct cross-tranche working-
  synthesis continuity defect, now owned by Issue #74 and Task 248. Issue #72
  is closed; the new control-plane gap does not reopen this completed read tool.
