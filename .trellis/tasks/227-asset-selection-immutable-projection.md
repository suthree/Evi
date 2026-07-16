# Task 227: Asset Selection Lock And Immutable Projection

Status: implemented; publication pending

## Owner And Linkage

- Owner repository: Evi
- Linked issue: Evi #13
- Registry issue: LuBan #1
- Depends on: Evi PR #17 / merge commit
  `391a17c49afe1a7e4cf1d529a5e0d47f3ef76762`
- Approved specification: `.trellis/spec/v0.2-multi-node-evolution.md`

## Problem

Evi can validate one pinned LuBan catalog but cannot yet turn an explicit
node-local profile into a deterministic skill selection, bind it to a portable
asset lock, or stage a content-addressed projection without touching the active
skill roots.

## Scope

- Resolve one explicit node-local profile against the validated LuBan skill
  descriptors by canonical id or unambiguous alias.
- Enforce runtime, platform, project, sensitivity, capability, command,
  environment, and typed skill-dependency constraints.
- Produce a deterministic portable asset lock bound to profile id, LuBan
  commit, typed identities, canonical content roots, declared files, and
  content hashes.
- Compute a deterministic lock hash without timestamps, host paths, scan order,
  or mutable branch identity.
- Stage selected skill bodies into a content-addressed immutable release under
  a caller-owned node-local projection root.
- Reverify source and staged file hashes, reject symlinks and undeclared files,
  and make an existing matching release idempotent while failing closed on
  drift.
- Upgrade the YAML parser dependency within the compatible major version and
  verify the full repository after the upgrade.

## Acceptance

- Profile resolution is explicit and deterministic; aliases never create
  ambiguous or order-dependent selection.
- Compatibility, sensitivity, dependency, and node-capability failures are
  bounded and fail closed before projection writes.
- The asset lock contains no timestamps, credentials, checkout paths, runtime
  state, or active-vault refs.
- Equivalent selections produce byte-identical lock JSON and the same lock
  hash regardless of request or catalog order.
- Projection releases are addressed by lock hash, contain only selected
  declared files plus bounded manifests, and never symlink to the LuBan
  checkout.
- Source/staged hash drift, symlinks, path escape, and pre-existing release
  mismatch fail closed.
- No active projection pointer, active vault, LuBan checkout, or runtime service
  is mutated.
- Targeted tests and `pnpm run check` pass.

## Non-Goals

- No Git/network fetch or credential management.
- No active switch, activation receipt, probation, rollback, or service reload.
- No candidate export or LuBan pull request.
- No memory/knowledge-pack synchronization, SSR/SST deployment, or Web Console.

## Verification

- Targeted tests cover deterministic profile/alias resolution, compatibility
  and sensitivity rejection, dependency closure, stable lock hashing, clean
  staging, idempotent restaging, source drift, symlink rejection, undeclared
  files, and existing-release drift.
- Run a read-only local LuBan integration that stages selected accepted skills
  into a disposable node-local projection root.
- Run `pnpm run check` and inspect both repository worktrees.

## External Effects

- Push one Evi feature branch, open a pull request, and merge it into `develop`
  after verification under the approved develop autonomy rule.
- Do not publish assets, modify LuBan, deploy services, or activate a projection.

## Rollback

- Revert the Evi implementation commit.
- Delete only disposable or explicitly caller-owned staged projection releases;
  no active pointer or runtime state requires rollback in this slice.

## Evidence Refs

- Evi issue: `https://github.com/suthree/Evi/issues/13`
- LuBan typed registry: `https://github.com/suthree/LuBan/pull/2`
- Pinned reader: `https://github.com/suthree/Evi/pull/17`
- Implementation: `packages/core/src/asset_projection.ts`
- Targeted tests: `tests/asset_projection.test.ts` plus pinned reader and
  conflict-guard suites; 24 tests passed.
- Full verification: `pnpm run check` passed: TypeScript build, 840 tests,
  active/seed skill validation, and neutral naming across 121 implementation
  files.
- Dependency upgrade: `yaml` 2.8.1 -> 2.9.0; full verification passed.
- Real LuBan integration: accepted skills `caveman`, `grilling`, and `ponytail`
  produced lock hash
  `ba83ac6c86c6cd8f42320b011d599577f3926e7bcd10ada2f83f7a5e8fe1659f`
  and staged into a disposable projection with no `current` pointer.
- LuBan source worktree remained clean and unchanged.
- Evi commit and pull request: pending publication.

## Result

- Explicit node profiles resolve canonical skill ids or aliases without scan
  order or timestamps.
- Runtime, platform, project, sensitivity, capability, command, environment,
  and typed skill dependencies fail closed before writes.
- Portable deterministic asset locks bind profile, LuBan commit, selected
  identities, file manifests, and content hashes without host paths.
- Releases stage atomically under `releases/<lock-hash>`, copy rather than
  symlink accepted bodies, reverify hashes, and reuse only byte-identical
  existing releases.
- This slice does not create or change an active projection pointer.
