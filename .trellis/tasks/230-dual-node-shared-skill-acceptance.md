# Task 230: Dual-Node Shared Skill Acceptance Drill

Status: completed; operator checkpoint

## Owner And Linkage

- Owner repository: Evi.
- Linked issue: Evi #13.
- Registry owner: LuBan Issue #1.
- Accepted LuBan PR: `https://github.com/suthree/LuBan/pull/4`.
- Pinned LuBan commit:
  `e7243257db6f95ec8d23fc154f1597fda8cc5a4a`.
- Evi runtime commit used for the drill:
  `65cfc2dadc0a015b1627d7a6f8e6f84a6153093c`.

## Acceptance

- Fetch one exact LuBan commit into a detached, clean, push-disabled checkout.
- Resolve the accepted Evi candidate from that checkout and verify all catalog
  and content hashes.
- Use two independent node roots and profiles while pinning the same LuBan
  commit; require different deterministic asset locks.
- Stage immutable projections and complete activation/probation receipts on
  both nodes.
- Prove incompatible runtime and ambiguous identity cases fail closed.
- Force a successor probation failure on one node and prove the previous
  verified projection is restored.
- Confirm LuBan contains no raw episodes, conversations, runtime databases,
  logs, or session artifacts.
- Record which global v0.2 gates are still unsatisfied instead of claiming full
  multi-node completion.

## Non-Goals

- No shared knowledge-pack implementation/import, SSR/SST deployment change,
  service-health or Web Console change, credential provisioning, persistent
  node installation, raw memory synchronization, `main` merge, tag, or release.
- This acceptance drill does not expand the earlier authorized shared-skill
  integration into deployment or memory workstreams.

## Verification And Evidence

- Read-only fetch result: exact commit, GitHub origin, detached checkout, clean
  status, and disabled push URL passed.
- Catalog skills at the pinned commit: `caveman`, `grilling`, `ponytail`, and
  `verify-local-vault-promotion-loop-from-docs`.
- Node A profile `evi-learning`: candidate skill, Evi project, internal
  sensitivity, `file.read` and `file.write_state`; lock/release
  `2a67d1a5e4d88c0eb32fded6f730d7316debb5392c384a4e231aa445b127ceb0`.
- Node B profile `codex-minimal`: `ponytail`; lock/release
  `6e7f7c27b3836daf8f516dc5aa3c7b3f4a13bc2abcf2092016763c775e31f985`.
- Both activation receipts and probation-pass receipts bound Evi commit, LuBan
  commit, profile, asset lock, release, result, and evidence refs.
- Node A forced successor failure returned `rolled_back` and restored release
  `2a67d1a5e4d88c0eb32fded6f730d7316debb5392c384a4e231aa445b127ceb0`.
- Runtime-incompatible and ambiguous-identity selections both failed closed.
- LuBan `scripts/doctor --scope repo`, `--scope secrets`, and a bounded filename
  scan for episodes, conversations, databases, logs, and sessions passed.
- Targeted TypeScript compilation plus catalog, projection, activation,
  handoff, and conflict tests passed: 32 tests.
- Full `pnpm run check` passed: TypeScript build, 848 tests, active/seed skill
  validation, and neutral naming validation across 123 implementation files.
- Evidence commit: `c13668c2039c83c45df98544043176901ad175b2`.
- Review handoff: `https://github.com/suthree/Evi/pull/21`.

## External Effects And Rollback

- External effects: temporary read-only LuBan fetch; disposable local node
  roots; one Evi feature branch/PR and autonomous `develop` merge after all
  gates pass.
- No LuBan mutation occurred during this drill; LuBan PR #4 was separately
  owned, verified, and merged before consumption.
- Rollback: delete disposable roots and revert this evidence commit. Runtime
  production state was not touched.

## Global V0.2 Gate Result

- Passed in this drill: sanitized candidate handoff and deterministic LuBan
  acceptance; same pinned commit with independent profiles; incompatible and
  ambiguous fail-closed behavior; complete node activation receipt; failed
  probation rollback; absence of raw episodic assets in LuBan; traceable
  Evi/LuBan issue, task, PR, commit, lock, and receipt chain.
- Still open by explicit task boundary: one promoted knowledge pack imported as
  bounded read-only context, and SSR health bound to Evi/LuBan/profile/lock
  deployment identities. Therefore v0.2 remains partially delivered.

## Operator Checkpoint

Stop after targeted/full verification, evidence commit, Evi PR, and autonomous
`develop` merge. Report the completed shared-skill chain and the two remaining
global v0.2 dependencies. Do not start knowledge-pack or SSR work automatically.
