# Dynamic Authority And Decision Owner Guideline

- Owner: Evi core governance
- Base: `dfdebf0326310bb177e11c4098e7b7e7ed136ce1`
- Capability layer: core identity, runtime contract, and local-learning governance
- Scope: establish dynamic boundary resolution, named Decision Owner ownership,
  explicit override provenance, rollback/retirement, and re-evaluation rules.
- Non-goals: no runtime schema or harness implementation, no permission
  blacklist, no new SOP/skill, no service deployment, no push or merge.

## Acceptance

- Stable English and Chinese identity/instruction pairs state that boundaries
  are dynamic and decision-owned.
- The runtime contract defines owner resolution and the minimum provenance for
  `allow`, `defer`, `ask`, `deny`, and `override` decisions.
- Local-learning guidance distinguishes a model proposal or successful task
  from an authority decision and describes bounded recovery for unproven
  promotion.
- Trellis records the accepted direction without claiming first-class runtime
  enforcement already exists.
- Documentation and repository validation pass, and the change remains a
  standalone governance commit after the continuity implementation commit.

## Rollback

Revert the standalone governance commit. Do not rewrite the prior continuity
commit, runtime episode evidence, active-vault history, or operator decisions.

## Verification

- Passed `git diff --check`.
- Passed `pnpm run check`: TypeScript build, 857 tests, skill validation, and
  neutral naming validation.
