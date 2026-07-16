# Task 228: Atomic Projection Activation And Rollback

Status: completed

## Owner And Linkage

- Owner repository: Evi
- Linked issue: Evi #13
- Depends on: Evi PR #18 / merge commit
  `cf3872450aacd3eb3afca2a659069809063b0310`
- Approved specification: `.trellis/spec/v0.2-multi-node-evolution.md`

## Scope And Acceptance

- Verify a staged content-addressed release before activation.
- Atomically replace a node-local `active.json` pointer without symlinks.
- Preserve only a previously verified active release as `previous.json`.
- Record immutable receipts binding Evi commit, LuBan commit, profile, asset
  lock, release, result, evidence refs, and predecessor.
- Keep a new activation in probation until explicit bounded evidence passes.
- On failed probation, atomically restore the previous verified release; an
  initial activation with no predecessor becomes inactive.
- Reject concurrent probation, stale receipt completion, release drift, and
  rollback to an unverified predecessor.
- Targeted tests and `pnpm run check` pass.

## Non-Goals

- No Git/network fetch, credentials, service restart, model/IM smoke, remote
  node mutation, candidate proposal, SSR/SST deployment, or Web Console.

## Verification

- Test first activation, verified promotion, second activation, successful
  probation, failed probation rollback, initial failure deactivation, stale
  receipt/concurrent activation, and release drift.
- Run a disposable real-LuBan activation/probation/rollback drill.
- Run `pnpm run check`; confirm LuBan remains unchanged.

## External Effects And Rollback

- Changes write only to an explicitly supplied node-local projection root.
- Publish and merge one Evi PR under the approved develop autonomy rule.
- Reverting the commit removes the mechanism; test/drill state is disposable.

## Evidence Refs

- Evi issue: `https://github.com/suthree/Evi/issues/13`
- Selection/projection: `https://github.com/suthree/Evi/pull/18`
- Implementation: `packages/core/src/projection_activation.ts`
- Targeted tests: activation plus selection, reader, and conflict suites; 29
  tests passed.
- Full verification: `pnpm run check` passed after the final neutral naming
  correction: TypeScript build, 845 tests, skill validation, and neutral naming
  across 122 implementation files.
- Real LuBan disposable drill: release
  `5908b5729b52930303ee1535c3790481fa06e1f9649dc386e1085d4334816d85`
  passed probation; failed successor
  `aeb5c2bf6d1f8849ab6b37ee7053bbd982261fffce561b9fcf6cbe9608e4f186`
  rolled back to the verified predecessor.
- Persisted runtime protocol uses neutral `runtime_commit`; it binds the Evi
  build commit without embedding the repository name in runtime identifiers.
- Commit and PR: pending publication.
