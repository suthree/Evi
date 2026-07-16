# Task 229: Read-Only Fetch And Candidate Export

Status: verifying

## Owner And Linkage

- Owner repository: Evi
- Linked issue: Evi #13
- Depends on: Evi PR #19 / merge commit
  `17df770040e8971b0dc5c2b651ff338e097aef4c`
- Registry owner for later acceptance: LuBan Issue #1

## Scope And Acceptance

- Prepare a pinned LuBan checkout in a caller-owned staging root using
  non-interactive Git with preconfigured read-only credentials; never accept,
  render, log, or persist credential values.
- Verify remote origin, exact fetched commit, detached HEAD, clean checkout, and
  absence of writable push configuration before catalog consumption.
- Export one explicit local skill candidate as a sanitized portable proposal
  bundle containing typed metadata, body, content hashes, provenance, bounded
  evidence summaries, compatibility assumptions, verification, and retirement
  notes.
- Reject secrets, raw conversations/runtime state, absolute host paths,
  symlinks, binaries, undeclared files, and mutable source identities.
- Do not mutate LuBan or open its PR from Evi code; the resulting bundle is the
  handoff to a separate LuBan-owned task.
- Targeted tests and `pnpm run check` pass.

## Non-Goals

- No credential provisioning, automatic global activation, memory sync,
  service deployment, Web Console, or direct LuBan write from runtime code.

## Verification And Effects

- Test local bare-remote fetch, wrong pin, dirty checkout, credential-safe
  diagnostics, deterministic sanitized bundle, and secret/raw-state rejection.
- Export the repository skill
  `verify-local-vault-promotion-loop-from-docs` into a disposable bundle and
  inspect it before LuBan handoff.
- Publish and merge one Evi PR; then create a separate LuBan Trellis task/PR.
- Rollback by reverting the commit and deleting caller-owned staging bundles.

## Evidence Refs

- Evi issue: `https://github.com/suthree/Evi/issues/13`
- Activation slice: `https://github.com/suthree/Evi/pull/19`
- Targeted verification: TypeScript compile plus three handoff tests passed;
  coverage includes detached/clean/push-disabled checkout, dirty checkout,
  wrong pin, embedded credential rejection, deterministic export, and secret
  rejection.
- Full verification: `pnpm run check` passed with 848 tests, skill validation,
  and neutral naming validation across 123 implementation files.
- Real candidate export: content tree SHA-256
  `1ce23009341d3973c79e8b9c3fc4336239aa841a04d6f7a81f33c980259d1a8e`;
  disposable bundle contained exactly `SKILL.md` and `candidate.yaml`, and the
  bounded sensitive-material scan returned no matches.
- Operator checkpoint: publish/merge the Evi PR, then continue only through a
  separately owned LuBan acceptance task/PR using the exported candidate.
- Implementation commit and PR: pending.
