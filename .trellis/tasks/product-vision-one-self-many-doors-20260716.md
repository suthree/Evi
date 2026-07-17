# Product Vision: One Persistent Self, Many Doors, Context-Placed Execution

Status: completed; operator checkpoint

## Identity And Ownership

- Issue: none. This is an explicit operator-directed product-direction and
  governance documentation update. It does not activate a runtime capability,
  milestone implementation, external publication, or release.
- Milestone / target version: accepted long-term product vision; no version
  delivery claim.
- Owner repository: Evi.
- Implementation owner: Codex under the current operator request.
- Decision Owner / authority: the operator explicitly accepted the preceding
  product discussion and requested that it be persisted in product documents
  and the related evolution plan.
- Capability layer: boundary.
- Base: `d994c3b` on `develop`.
- Branch: `codex/product-vision-one-self-many-doors-20260716`.
- Worktree: `.worktrees/product-vision-one-self-many-doors-20260716`.

## Problem And Evidence

The accepted Product Vision already defines one persistent self, a local-first
runtime, multiple sessions, a Capability Manager, and gated evolution. It does
not yet preserve the newly accepted distinctions between invocation surface,
self/state ownership, context location, and execution location. It also places
the full Capability Manager before Cognitive Continuity, which can make asset
distribution appear equivalent to learning.

The operator clarified that Evi should remain a GA-like general-agent brain:
it grows through core and basic capabilities, learns how to use tools and
specialist agents efficiently, remains local-first, and chooses local or remote
execution according to the task and its context. Claude-style contextual
mentions and Codex-style central control are complementary product surfaces,
not mutually exclusive identities.

## Architecture And Reuse Assessment

- Reuse `docs/PRODUCT_VISION.md` and its Chinese companion as the only stable
  long-term product owner.
- Reuse the current Self/Workspace/Goal/Session/Run model, Harness Lock,
  Capability Lifecycle, Node, Handoff, and LuBan ownership boundaries.
- Reuse the existing Web, IM, CLI/API, connector, worker-session, and execution
  concepts rather than creating a new UI, protocol, service, or database.
- Record the accepted supersession in `.trellis/decisions.md`; do not alter
  implemented v0.1 facts or broaden the accepted v0.2 specification.
- Keep the design minimal by defining product semantics and dependency order,
  not implementation schemas or a speculative fixed backlog.

## Scope

- Update paired English/Chinese Product Vision documents with one brain, many
  doors, and context-placed execution.
- Clarify local-first as canonical self ownership rather than forced all-local
  computation.
- Define IM/host surfaces as rich-context bindings with thin state.
- Reframe the harness as an operating, attribution, verification, and recovery
  record even under broad trusted local authority.
- Split Capability Infrastructure from Capability Intelligence and define Tool
  Competence relative to Memory and Skill/SOP.
- Reorder the post-gate long-term goals around continuity, attribution,
  learning, multi-environment execution, and product presence.
- Update paired compact documentation entrypoints and record the accepted
  direction in Trellis.

## Non-Goals

- No runtime code, schema, migration, service, UI, connector, MCP, IM, Desktop,
  cloud worker, or remote execution implementation.
- No change to current v0.1 implemented behavior or v0.2 acceptance scope.
- No new fixed version roadmap, GitHub milestone, Issue, dependency, package,
  public statement, push, pull request, merge, deploy, restart, or release.
- No claim that tool competence, multi-environment execution, or deep host
  bindings already exist.
- No broad competitor catalog in stable product documents.

## Dependencies, Effects, And Data Contract

- Inputs: the current paired Product Vision, Runtime Contract, v0.2 design/spec,
  engineering delivery contract, current Trellis decisions, and the operator's
  accepted product discussion.
- Source freshness: repository files and `develop` base were inspected in the
  current task; competitor products are used only as discussion-derived design
  patterns and are not asserted as current implementation facts.
- Architecture impact: long-term product semantics and goal dependency order
  only.
- External and sensitive-data effects: none.
- Compatibility/migration: not applicable; documentation does not change
  persisted runtime behavior.
- Rollback: revert this bounded documentation diff.

## Budgets

- Context: compact product, v0.2, runtime, and Trellis owner documents only.
- Output: paired Product Vision, paired compact entrypoints, one Trellis
  decision, and this task record.
- Retry/time: one focused consistency correction after inspection.
- Delegation/subagents: zero; all files express one overlapping product
  decision.
- Parallel workstreams: none.

## Acceptance

- Product identity clearly states one persistent local-first self, many
  contextual entry surfaces, and multiple execution environments.
- Central control and contextual mentions are complementary without creating
  multiple state owners.
- Local-first ownership is separated from execution placement.
- Harness value remains explicit under broad trusted local authority.
- Capability Infrastructure is not treated as proof of learning; Tool
  Competence, Memory, and Skill/SOP have distinct roles.
- The post-gate sequence places Cognitive Continuity and Outcome Attribution
  before full Capability Intelligence and Tool Mastery.
- Existing v0.1/v0.2 authority and non-implementation boundaries remain clear.
- English and Chinese companion changes remain materially aligned.

## Verification

- Inspect paired headings and key product terms for structural parity.
- `git diff --check` to verify patch integrity.
- `pnpm run check` to verify repository build, tests, skill validation, and
  naming validation remain green.
- Final diff/status audit to prove that only the bounded documentation and
  governance files changed.

## Completion Evidence

- Paired heading and key-term inspection passed for North Star, product
  surfaces, entry/context/execution placement, Harness, Capability
  Infrastructure, Capability Intelligence and Tool Competence, post-gate
  ordering, success measures, non-goals, and accepted-direction summary.
- The first `pnpm run check` stopped before compilation because the isolated
  worktree had no `node_modules` and therefore no `tsc`; this was an environment
  preparation gap, not a repository failure.
- `pnpm install --frozen-lockfile` installed the lockfile-pinned dependency set
  without changing the lockfile.
- The repeated `pnpm run check` passed: TypeScript build, `857` tests, active
  and seed skill validation, and neutral naming validation across `122`
  implementation files.
- `git diff --check` passed before and after the full repository gate.
- Final scope audit shows only the paired Product Vision, paired compact
  entrypoints, one Trellis decision, and this task record changed. Runtime code,
  v0.1 contract, v0.2 design/spec, dependencies, service state, and deployment
  state remain unchanged.
- No commit, push, pull request, merge, deploy, restart, or external publication
  was requested or performed. The bounded branch remains at an operator
  checkpoint for review.
