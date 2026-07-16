# Task 226: Pinned Local LuBan Catalog Reader

Status: implemented; operator checkpoint pending publication

## Owner And Linkage

- Owner repository: Evi
- Linked issue: Evi #13
- Registry issue: LuBan #1
- Accepted LuBan baseline: `09b0627cc812bc168cfebb0d1fef6ce37de674b4`
- Approved specification: `.trellis/spec/v0.2-multi-node-evolution.md`

## Problem

Evi can now detect conflicts across local active, seed, and project skill roots,
while LuBan has an accepted typed registry. Evi still lacks a bounded read-only
consumer that can open one explicitly pinned local LuBan checkout, validate the
accepted skill records and their declared content hashes, and return stable
metadata without treating the whole repository as a project skill root.

## Scope

- Add a read-only LuBan catalog reader with explicit checkout root and pinned
  commit inputs.
- Verify the local checkout commit without fetching or changing Git state.
- Read the LuBan registry contract and accepted asset catalog from that pinned
  checkout.
- Select only `skill` assets whose lifecycle is `accepted` and whose retirement
  status is `active`.
- Validate typed identity uniqueness, canonical owned/vendor roots, declared
  files, safe path containment, no symlinked canonical content, per-file
  SHA-256, and LuBan's deterministic tree hash.
- Return deterministically sorted, typed skill descriptors with LuBan commit,
  content hash, source path, compatibility, dependencies, sensitivity, and
  provenance metadata.
- Fail closed with bounded diagnostics when the pin, catalog shape, identity,
  path, or hash contract is invalid.

## Acceptance

- A valid pinned local LuBan checkout returns only accepted, active skill
  assets in deterministic typed-identity order.
- Inbox, retired, non-skill, and unregistered repository content is never
  exposed as an accepted skill.
- A checkout whose actual commit differs from the requested pin fails closed.
- Duplicate or ambiguous skill identities fail closed.
- Missing, escaping, symlinked, undeclared, or hash-mismatched canonical
  content fails closed with identity, path, and expected/actual evidence where
  applicable.
- The reader performs no writes, fetches, installs, projection switches,
  activation, or active-vault mutation.
- Existing active/seed/project skill discovery and the node-local learning flow
  remain unchanged.
- Targeted tests and `pnpm run check` pass.

## Non-Goals

- No Git or network fetch and no credential management.
- No runtime projection, install, selection lock, profile resolution, node
  activation, probation, receipt, or rollback implementation.
- No Evi candidate export or LuBan pull-request flow.
- No memory or knowledge-pack synchronization.
- No SSR/SST deployment change and no Web Console change.
- No mutation of the LuBan worktree.
- No merge of the Evi pull request in this task.

## Verification

- Run targeted reader tests for a valid catalog, commit mismatch, duplicate or
  ambiguous identity, lifecycle/kind filtering, path escape, symlink, missing
  or undeclared file, file hash mismatch, tree hash mismatch, stable ordering,
  and read-only behavior.
- Run a read-only integration check against local LuBan commit
  `09b0627cc812bc168cfebb0d1fef6ce37de674b4` without mutating its worktree.
- Run `pnpm run check`.
- Inspect both repository worktrees and confirm only Evi changed.

## External Effects

- Push one Evi feature branch and open one Evi pull request after verification.
- Do not publish assets, modify LuBan, fetch runtime assets, deploy services, or
  merge the pull request.

## Rollback

- Revert this task's Evi commit to remove the catalog reader.
- No vault, projection, activation, runtime-state, or LuBan rollback is expected
  because the slice is read-only.

## Evidence Refs

- Evi issue: `https://github.com/suthree/Evi/issues/13`
- LuBan issue: `https://github.com/suthree/LuBan/issues/1`
- LuBan typed registry PR: `https://github.com/suthree/LuBan/pull/2`
- LuBan functional merge commit:
  `db336e36a4d8c768d4655b22ffd5c4dff57ea882`
- LuBan accepted baseline including Trellis closeout:
  `09b0627cc812bc168cfebb0d1fef6ce37de674b4`
- Evi conflict guard PR: `https://github.com/suthree/Evi/pull/16`
- Implementation: `packages/core/src/luban_catalog.ts`
- Targeted tests: `tests/luban_catalog.test.ts` and
  `tests/skill_source_conflict.test.ts`; 16 tests passed.
- Type check: `pnpm exec tsc -p tsconfig.json --noEmit` passed.
- Full verification: `pnpm run check` passed: TypeScript build, 832 tests,
  active/seed skill validation, and neutral naming validation across 120
  implementation files.
- Real LuBan read-only integration: a temporary local clone at accepted commit
  `09b0627cc812bc168cfebb0d1fef6ce37de674b4` resolved `caveman`, `grilling`,
  and `ponytail` with the catalog-declared tree hashes and vendor provenance.
- Repository isolation: the source LuBan worktree remained clean on its
  existing branch and HEAD `9b374a119c794c67ceb690da223b416c6c749155`.
- Evi implementation commit and pull request: pending publication.

## Result

- Evi now opens only an explicitly supplied local LuBan checkout whose HEAD
  exactly matches a lowercase 40-character pinned commit.
- Registry contract files and every accepted skill file must match their Git
  blobs at that commit before metadata is returned.
- Only typed `skill` assets with `accepted` lifecycle and active retirement
  status are returned; repository inbox, retired, non-skill, and unregistered
  content is not scanned into the result.
- Duplicate or ambiguous identities, unsafe paths or symlinks, declared/actual
  file-set drift, executable-mode drift, per-file hash drift, tree-hash drift,
  and dirty catalog/content fail closed with bounded diagnostics.
- Results use stable typed-identity ordering and preserve compatibility,
  dependency, sensitivity, verification, provenance, commit, path, and content
  hash metadata without writing either repository or the active vault.

## Operator Checkpoint

Stop after implementation, tests, Trellis evidence, commit, push, and Evi pull
request creation. Report the branch, commit, pull request, verification results,
and remaining v0.2 dependencies. Do not start projection, selection-lock,
activation, or another v0.2 slice automatically.
