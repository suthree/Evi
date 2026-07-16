# Task 225: Deterministic Skill Source Conflict Guard

Status: implemented; pull request checkpoint pending

## Owner And Linkage

- Owner repository: Evi
- Linked issue: Evi #13
- Approved specification: `.trellis/spec/v0.2-multi-node-evolution.md`

## Problem

Skill discovery can read node-local active-vault, repository seed, and project
skill roots, but same-name resolution must not depend on `updated_at` values or
filesystem scan order. Ambiguous same-name assets need deterministic,
operator-inspectable failure before any candidate is selected for recall.

## Scope

- Inspect same-name skills across active, seed, and project skill roots.
- Compute a deterministic content hash for each discovered skill asset.
- Merge same-name, same-hash assets into one deterministic candidate while
  retaining provenance for every source and path.
- Fail closed on same-name, different-hash assets.
- Include skill name, source, path, and content hash in conflict diagnostics.
- Preserve the node-local active vault as the only local-learning write target
  and keep the existing single-node learning flow unchanged.

## Acceptance

- Discovery checks active, seed, and project skill roots for duplicate names.
- Same-name assets with identical content hashes resolve deterministically and
  retain all provenance entries.
- Same-name assets with different content hashes return a fail-closed conflict.
- Every conflict entry reports skill name, source, path, and content hash.
- Resolution does not use `updated_at` or filesystem scan order as precedence.
- Existing local active-vault writes and single-node promotion behavior remain
  unchanged.
- Targeted tests and `pnpm run check` pass.

## Non-Goals

- No LuBan typed manifest implementation.
- No Git or network fetch.
- No Evi candidate-to-LuBan pull request flow.
- No asset-selection lock or node activation.
- No memory or knowledge-pack synchronization.
- No SSR or SST deployment changes.
- No Web Console changes.
- No mutation of the LuBan worktree.
- No pull request merge.

## Verification

- Run focused skill resolver tests covering identical-content provenance merge,
  conflicting-content fail-closed diagnostics, root-order independence, and
  unchanged active-vault behavior.
- Run `pnpm run check`.
- Inspect the final diff for excluded surfaces and timestamp/order precedence.
- If the implementation consumes the LuBan project-skill contract, inspect the
  LuBan implementation read-only and record whether the Evi/LuBan boundary is
  compatible; do not modify LuBan in this task.

## External Effects

- Push one Evi feature branch and open one Evi pull request after verification.
- Do not publish assets, modify LuBan, fetch runtime assets, deploy services, or
  merge the pull request.

## Rollback

- Revert this task's Evi commit to restore the previous resolver behavior.
- No active-vault migration or runtime-state rollback is expected because this
  slice does not write or migrate local skill state.

## Evidence Refs

- Evi issue: `https://github.com/suthree/Evi/issues/13`
- Architecture merge: Evi PR #14 / merge commit `7f24c578018a4816f700fe474c31f532dc0d0447`
- Specification: `.trellis/spec/v0.2-multi-node-evolution.md`
- Implementation: `packages/core/src/skill_resolver.ts`,
  `packages/core/src/skill_registry.ts`
- Targeted tests: `tests/skill_source_conflict.test.ts` plus existing skill
  promotion, registry sync, catalog, and live SOP-flow coverage; 10 tests
  passed.
- Type check: `pnpm exec tsc -p tsconfig.json --noEmit` passed.
- Full verification: `pnpm run check` passed after the final implementation
  change: TypeScript build, 819 tests, active/seed skill validation, and neutral
  naming validation across 119 implementation files.
- LuBan read-only audit: its typed registry declares accepted lifecycle paths,
  complete file/tree SHA-256 values, duplicate identity/alias rejection, and
  immutable vendor provenance. `python3 -m unittest discover -s tests -v`
  passed 11 tests and `scripts/doctor --scope repo` passed.
- Cross-repo boundary: Evi must consume a selected read-only skill projection,
  not the LuBan repository root, until a later typed catalog/selection slice can
  exclude inbox and retired content and verify catalog hashes.
- Evi commit and pull request refs: pending

## Result

- Same-name resolution groups all discovered active, seed, and project skill
  packages before selection.
- Identical raw `SKILL.md` SHA-256 values produce one stable entry with sorted,
  complete provenance; conflicting hashes throw `SkillSourceConflictError`
  before recall or catalog selection.
- Canonical selection uses explicit source rank and lexical path ordering, not
  `updated_at` or filesystem enumeration order.
- Local promotion continues to write only to the configured active vault.
- LuBan's typed registry implementation passes its repository gates, but direct
  consumption of the LuBan repository root remains unsafe until the later
  typed catalog/selection slice supplies an accepted-only projection.

## Operator Checkpoint

Stop after implementation, tests, Trellis evidence, commit, push, and pull
request creation. Report the branch, commit, pull request, verification results,
and remaining dependencies. Do not start the next v0.2 slice automatically.
