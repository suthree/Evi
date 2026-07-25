# v0.3 temporary freeze lineage inventory

Status: archived for Issue #160 on 2026-07-25.

This is a repository-lineage preservation record. It does not merge unrelated
implementation slices into one executable source tree, and it does not change
the paused status or authorize implementation, rehearsal, deployment, or
runtime mutation.

## Freeze authority and branch

- Freeze task: [Issue #160](https://github.com/suthree/Evi/issues/160)
- Freeze branch: `codex/issue-160-v03-freeze`
- Base: `origin/main` at `3723264` (`release: v0.3.0 (#156)`)
- Direction record carried by this branch:
  `docs/research/2026-07-25-v03-intent-resolution-and-growth-rehearsal.md`

The branch is a durable entrypoint for the paused discussion and for the exact
remote refs that preserve every local working lineage. It intentionally does
not manufacture a combined implementation from independent branches: doing so
would silently choose conflict resolutions and could falsely imply an accepted
integration.

## Preservation invariant

Before local branch cleanup, every non-default local work branch below has an
exactly matching `origin/<branch>` ref. The former local `main` was an ancestor
of the newer `origin/main`, with no local-only commit; the freeze branch uses
that newer remote head. `develop` was already equal to `origin/develop`.

This record does not replace Git refs. Its purpose is to make the cleanup
auditable after local feature refs are removed.

## Remote working-lineage snapshot

- `codex/environment-baseline-governance` at `c9dc243`
- `codex/evi-vnext-action-gateway` at `275badc`
- `codex/evi-vnext-dispatch-recovery` at `f0157e9`
- `codex/evi-vnext-run-continuation` at `ec95095`
- `codex/goal-20260721-baseline-failures` at `eba358d`
- `codex/issue-152-vnext-worker-groups` at `4d8c24c`
- `codex/issue-20260720-central-state-journal` at `c498db6`
- `codex/issue-20260720-confirmed-effect-recovery` at `c9dc243`
- `codex/issue-20260720-durable-effect-journal` at `c9dc243`
- `codex/issue-20260720-environment-baseline` at `664e406`
- `codex/issue-20260720-resume-intent-live` at `0aea22a`
- `codex/specialist-executor-intent` at `0aea22a`
- `codex/v03-active-context-route` at `d81ffd7`
- `codex/v03-canary-experience-record` at `c1e55c7`
- `codex/v03-canary-experience-review` at `0b831f6`
- `codex/v03-canary-experience-review-2` at `c1e55c7`
- `codex/v03-doc-baseline` at `4ad1a6c`
- `codex/v03-doc-baseline-review` at `9a783de`
- `codex/v03-english-default-route` at `f16b983`
- `codex/v03-growth-lifecycle` at `ca1a61c`
- `codex/v03-growth-rehearsal-direction-proposal` at `6def0ce`
- `codex/v03-legacy-config-pi-adapter` at `f738024`
- `codex/v03-product-vision-precedence` at `9a783de`
- `f1/init` at `9dfdbcd`
- `f1/transactional-runtime-deploy` at `f9bdf94`

## Local cleanup policy

After this branch is pushed and the ref snapshot is independently verified:

1. update local `main` and `develop` to their remote-tracking heads without a
   force push;
2. detach non-default worktrees so deleting their branch refs cannot alter or
   erase their files;
3. delete local branch refs other than `main` and `develop` only;
4. retain all worktree directories and all remote branches unless a later,
   separate cleanup instruction authorizes their removal.

The local repository then retains only `main` and `develop` branch refs. The
remote freeze branch and the enumerated remote work branches remain the source
of recovery and later selective resumption.
