# v0.3 temporary freeze lineage inventory

Status: archived for Issue #160 on 2026-07-25.

This is a repository-lineage preservation record. The originally independent
Issue heads are retained as explicit no-fast-forward merge commits on the
freeze branch. This consolidation does not change the paused status or
authorize implementation, rehearsal, deployment, or runtime mutation.

## Freeze authority and branch

- Freeze task: [Issue #160](https://github.com/suthree/Evi/issues/160)
- Freeze branch: `codex/issue-160-v03-freeze`
- Base: `origin/develop` at `7061136`
- Direction record carried by this branch:
  `docs/research/2026-07-25-v03-intent-resolution-and-growth-rehearsal.md`

The branch is a durable entrypoint for the paused discussion and preserved
source lineage. Its conflict resolutions retain the later v0.3 contracts where
the historical branches overlap. It is a frozen aggregate, not a verified or
accepted integration into `develop`.

## Branch lifecycle rule

`main` and `develop` are the only long-lived repository branches. Every other
remote development branch must be owned by one real GitHub Issue and use the
form `codex/issue-<issue-number>-<slug>`. It targets `develop`; after a verified
merge into `develop`, its remote ref is deleted. A closed or merged PR alone is
not deletion evidence when the current branch tip is not reachable from
`develop`.

## Preservation invariant

The old local working refs were first pushed and independently verified. The
freeze cleanup first preserved every unmerged lineage under this Issue or a
retrospective Issue branch below; it then consolidated the latter heads into
this frozen Issue branch. The former local `main` had no
local-only commit and was advanced to the newer `origin/main`; local `develop`
was already equal to `origin/develop`.

This record does not replace Git refs. It makes the remote cleanup auditable
after historical, merged, and nonconforming names are removed.

## Consolidated Issue lineage

| Issue | Former canonical branch | Preserved head | Prior ref | Status |
| --- | --- | --- | --- | --- |
| [#160](https://github.com/suthree/Evi/issues/160) | `codex/issue-160-v03-freeze` | this branch | `codex/v03-growth-rehearsal-direction-proposal` | paused direction and freeze record |
| [#161](https://github.com/suthree/Evi/issues/161) | `codex/issue-161-baseline-failure-recovery` | `eba358d` | `codex/goal-20260721-baseline-failures` | merged into #160; paused; no PR |
| [#162](https://github.com/suthree/Evi/issues/162) | `codex/issue-162-harness-state-sop-proposal` | `02ff3fa` | `codex/goal-20260722-harness-state-sop-proposal` | merged into #160; paused; PR #131 needs later content audit |
| [#163](https://github.com/suthree/Evi/issues/163) | `codex/issue-163-environment-baseline` | `664e406` | `codex/issue-20260720-environment-baseline` | merged into #160; paused; date token was not an Issue number |
| [#164](https://github.com/suthree/Evi/issues/164) | `codex/issue-164-v03-english-default-route` | `f16b983` | `codex/v03-english-default-route` | merged into #160; paused |
| [#165](https://github.com/suthree/Evi/issues/165) | `codex/issue-165-legacy-config-pi-adapter` | `f738024` | `codex/v03-legacy-config-pi-adapter` | merged into #160; paused |
| [#166](https://github.com/suthree/Evi/issues/166) | `codex/issue-166-v03-active-context-route` | `d81ffd7` | `codex/v03-active-context-route` | merged into #160; paused |
| [#167](https://github.com/suthree/Evi/issues/167) | `codex/issue-167-v03-growth-lifecycle` | `ca1a61c` | `codex/v03-growth-lifecycle` | merged into #160; paused; fixed mechanism only |
| [#168](https://github.com/suthree/Evi/issues/168) | `codex/issue-168-reviewer-worker-follow-up` | `09a4dd5` | `codex/issue-150-vnext-reviewer-worker` | merged into #160; paused; seven commits remain after PR #151 |

The old `codex/v03-growth-rehearsal-direction-proposal` adds no unique source
after the #167 head; its direction document is byte-identical here. It is
therefore retired with the other noncanonical refs. The closed
`codex/issue-57-observation-only-rollback-drill` has no tree difference from
`develop` and is also retired.

## Cleanup result and resumption condition

Remote refs reachable from `develop` are removed after reachability
verification. The former #161–#168 refs are removed only after their exact
heads are verified reachable from this branch. Worktree directories remain
detached and are not deleted by this cleanup.

Development is paused. To resume, the operator selects the required slice from
this frozen aggregate (or opens a new Issue branch from `develop`) and
authorizes it; the implementer then establishes a new Environment Baseline and
reconfirms source, worktree, runtime, and evidence facts.
