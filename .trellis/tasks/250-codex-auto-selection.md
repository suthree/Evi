# Task 250: Codex Auto Selection

Status: verified; integration and live acceptance pending

## Identity And Ownership

- Issue: GitHub Issue #78, `fix(goals): ground Codex execution selection in the
  runtime profile`.
- Parent architecture: GitHub Issue #56 and
  `.trellis/spec/goal-runtime-control-plane.md`.
- Decision Owner / authority basis: operator-authorized local self-growth. The
  Codex supervisor intervenes after two identical zero-side-effect delegated
  failures because provider selection is a runtime seam, not a completion
  judgment Evi can make from model confidence.
- Owner repository / implementation owner: Evi / current Codex supervisor.
- Capability layer: core delegated execution.
- Base: `177eafdfe15ce1273fe32c5cf778ce2beceaad20` on `develop`.
- Branch/worktree: `codex/issue-78-codex-auto-selection` at
  `/Users/agi00079/Documents/GitHub/suthree/Evi/.worktrees/78-codex-auto-selection`.
- Milestone/version: parent #56 migration program; no release claim.

## Observed Problem And Evidence

Fresh Goal `goal_20260717211903_81851fca` twice selected nonexistent model
`gpt-5` with unsupported `minimal` reasoning. Canonical observations
`goal_event_20260717211942_a7bae587` and
`goal_event_20260717212030_f4e6bdef` show exit 1, zero tool calls, unchanged
HEAD, and no workspace paths. The Goal was paused after the one permitted
same-authority recovery retry.

The local Desktop-owned model cache uses a newer schema than installed
`codex-cli 0.144.1`, so parsing it would add an unstable cross-version
dependency. A live read-only ephemeral probe using profile `fast` without
model or reasoning overrides completed successfully. The existing Codex
profile/default resolver is therefore the narrowest current capability owner.

## Architectural Outcome

Evi selects task intent, repository authority, sandbox, budget, and delegation
shape. The Codex execution profile resolves provider-specific model and
reasoning defaults unless an external main harness or explicit operator
contract intentionally pins them.

- New `codex.run` requests accept explicit `auto` for model and reasoning.
  `auto` is immutable recorded authority and omits the corresponding CLI
  override; it is not an unrecorded default or fallback chain.
- Goal cognition sees only the required `auto` path for ordinary Goal-owned
  delegation, and the Goal authority seam rejects pinned new or persisted
  resume requests before planning or dispatch.
- Standalone/evidence-backed callers retain explicit safe model and bounded
  reasoning selection. Resume inherits either selection and cannot drift.
- Existing v2 authority, worktree isolation, effect confirmation, structured
  result, Git attribution, later verification, and main-harness completion
  ownership remain intact.

This measured evidence supersedes Task241's assumption that every Goal-owned
new request must explicitly name a concrete provider model and reasoning
effort. It does not weaken immutable selection evidence.

## Scope And Stable Owners

- `packages/core/src/codex_run_contract.ts`: request, persisted selection, and
  argv semantics.
- `packages/core/src/tool_contracts.ts`: Goal-visible typed capability surface.
- `packages/runtime/src/goal_execution_adapters.ts`: bounded cognition owner
  guidance.
- `packages/runtime/src/tools.ts`: Goal-owned selection enforcement while the
  standalone execution seam keeps explicit compatibility.
- Focused tests plus paired runtime docs and `.trellis/decisions.md` where the
  observable owner boundary changes.
- Reuse the existing profile, v2 authority digest, new/resume parser, argv
  builder, JSONL evidence, and thread record. Add no registry or storage.

## Acceptance

- Parsing accepts `model=auto` and `reasoning_effort=auto` while retaining
  explicit safe tokens/efforts for non-Goal callers.
- An auto authority omits `--model` and `model_reasoning_effort` but keeps
  profile, service tier, sandbox, approval, cwd, schema, and budgets explicit.
- Explicit requests and persisted v2 resume remain compatible and immutable
  through the standalone harness; GoalRuntime starts a new auto-selected
  thread instead of inheriting a provider pin.
- Goal cognition receives a contract that defaults ordinary delegation to
  auto and tells Evi not to invent provider tokens.
- Focused tests, build, `git diff --check`, `pnpm run check`, diff audit,
  independent Spec/Standards review, PR integration, exact-commit deployment,
  health, and controller identity pass.
- The paused live Goal resumes under its original repository authority,
  delegates through auto, observes its requested canonical path, performs a
  later local verification, and reaches a verified healthy receipt.

## Data, Compatibility, Effects, And Non-Goals

- Authoritative inputs are the typed request, persisted authority, existing
  Codex profile/config resolution, JSONL process evidence, and fixed Git
  snapshots. The Desktop model cache is diagnostic only and never parsed.
- `auto` means omit model/effort CLI overrides. It does not mean fallback,
  retry, or trust a model-authored completion claim.
- Historical explicit v2 thread records remain parseable and resumable through
  standalone execution. GoalRuntime refuses their provider pin without
  rewriting any event or thread record.
- No capability-discovery API, model-cache reader, provider allowlist,
  scheduler, automatic model fallback, retry framework, IM/Web/daemon cutover,
  LearningRuntime, main merge, release, publication, secret export, or
  destructive remote action.

## Budgets, Verification, And Rollback

- One bounded implementation path; no new subagents. Retry only concrete test
  or review failures.
- Red/green tests cover parser, argv omission, explicit compatibility, resume
  inheritance, and Goal-visible guidance.
- Runtime live acceptance reuses the already paused Goal and its clean linked
  worktree; it does not manufacture a replacement success trajectory.
- Rollback is a normal revert PR and redeploy to the prior stable commit. The
  paused Goal and failed Codex threads remain readable and no canonical state
  is deleted.

## Verification Evidence

- Focused contract/runtime suites: 71 tests passed.
- Full repository check: build passed, 945 tests passed, skills validation
  passed, and neutral naming passed across 129 files.
- Context-budget regression was resolved by compacting the Goal-visible tool
  shape; no budget threshold was widened.
- `git diff --check` passed.
- Independent Spec review: PASS; the execution-profile owner boundary and
  required Goal-visible `auto` contract are behaviorally enforced.
- Independent Standards review: PASS; GoalRuntime rejects provider pins at the
  authority seam while standalone explicit v2 new/resume remains compatible.
- PR integration, exact-commit deployment, controller health, and the original
  paused Goal's live acceptance remain intentionally pending.
