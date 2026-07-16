# Trellis Engineering Governance Extraction

Status: implemented

## Identity And Ownership

- Issue: none; this is an operator-directed governance bootstrap that records
  accepted development principles and does not activate a product capability.
- Milestone / target version: repository-wide governance for v0.2 and later
  iteration; no version-delivery claim.
- Owner repository: Evi.
- Implementation owner: Codex under the current operator request.
- Decision Owner / authority: operator acceptance of the proposed Trellis
  extraction in the current session; repository governance owns persistence.
- Capability layer: governance.
- Base: `65c3052d8311238196c6b1564b6256c74a36fb7a`.
- Branch: `codex/trellis-engineering-governance-20260716`.
- Worktree: isolated feature worktree; root `develop` remains untouched.

## Problem And Evidence

Development principles are distributed across repository instructions,
individual version specs, task records, and operator discussion. GitHub Issues,
Trellis tasks, implementation facts, dynamic Decision Owner boundaries, reuse,
Occam's razor, evidence integrity, context budgets, verification, and rollback
need one durable ownership model without moving runtime or product truth into
Trellis.

Observed repository evidence:

- `.trellis/decisions.md` already assigns GitHub direction and bounded Trellis
  implementation ownership but lacks a repository-wide delivery contract.
- `.trellis/spec/v0.2-multi-node-evolution.md` requires per-repository tasks and
  evidence lineage, but the rule should apply beyond v0.2 multi-node work.
- Trellis CLI `0.6.7` has no repository task subcommand, and this repository has
  no task template; existing tasks are checked-in Markdown records.
- `.trellis/agents/skills/` and `.trellis/agents/workflows/` explicitly reject
  broad duplicate workflow surfaces.

## Architecture And Reuse Assessment

- Reuse the existing decision log, versioned `.trellis/spec/` owner, Markdown
  task records, paired repository instructions, and GitHub Issue Forms.
- Do not add a workflow engine, task generator, custom Trellis command, runtime
  feature, or duplicate Codex policy skill.
- Keep the reusable contract in one Trellis spec; keep `AGENTS.md` and the Issue
  form as thin activation and routing surfaces.
- Reference projects may inform engineering choices but remain non-authoritative.

This is the smallest coherent change because it codifies owners and gates using
surfaces the repository already tracks.

## Scope

- Add the durable source-of-truth and engineering-governance decision.
- Add a reusable engineering delivery contract and task field definition.
- Add a GitHub engineering-change Issue Form mapped to the contract.
- Add concise routing and default work-discipline rules to paired Agent docs.
- Record and verify this bootstrap task using the new contract.

## Non-Goals

- No product roadmap or v0.3-v0.6 capability design.
- No modification of another session's Product Vision work.
- No Codex CLI skill creation or model/profile configuration.
- No Trellis-generated agent-context regeneration.
- No runtime code, dependency, service, deploy, restart, push, merge, or release.

## Dependencies And Effects

- Dependency: dynamic Decision Owner governance at commit `65c3052`.
- Cross-repository dependencies/blockers: none.
- Architecture impact: repository development governance only; runtime,
  product-vision, local-learning, and Trellis-generated context owners remain
  unchanged.
- External effects: none; local Git metadata and repository documents only.
- Data/source contract: current repository files and local CLI output are the
  sources; no synthetic product facts or external project claims.
- Migration/compatibility: new material tasks adopt the contract; existing task
  history is not rewritten.
- Rollback: revert the resulting documentation commit.
- Deploy/restart/live smoke: not applicable because runtime behavior and
  deployment artifacts do not change.

## Budgets

- Context: compact entry docs plus task-relevant Trellis decisions/specs/tasks.
- Output: one decision, one spec, one task record, one Issue Form, and paired
  Agent routing changes.
- Retry/time: one focused correction cycle after validation; no unbounded retry.
- Delegation/subagents: zero; this is one overlapping governance/document slice.
- Parallel workstreams / exclusive owners: one workstream; this branch owns only
  the files named in Scope.

## Acceptance

- Source-of-truth ownership distinguishes product direction, version planning,
  bounded delivery, integration evidence, runtime fact, and stable docs.
- Required task fields cover Issue, owner, Decision Owner, scope/non-goals,
  dependencies, architecture/reuse, data provenance, budgets, worktree,
  verification, rollback, deploy/restart, and completion evidence.
- Occam, reuse, minimal core, reference-not-standard, fact integrity, and
  context/token economy are durable defaults.
- GitHub Issue fields activate work without duplicating the Trellis spec.
- Paired Agent docs route material engineering work to the contract.
- Root `develop` and unrelated worktrees retain their pre-existing state.

## Verification

- `git diff --check` -> proves patch whitespace integrity.
- parse `.github/ISSUE_TEMPLATE/engineering-change.yml` as YAML -> proves the
  form is syntactically readable.
- inspect required Issue Form IDs and Trellis-contract headings -> proves the
  activation form and canonical spec contain the required contract surfaces.
- `pnpm run check` -> proves repository build, tests, skill validation, and
  naming validation remain green.
- final Git/worktree/root-state audit -> proves scope isolation and unrelated
  work preservation.

## Completion Evidence

- Trellis CLI: `0.6.7`; no native task subcommand or repository task template
  was assumed or invented.
- Issue Form YAML/schema smoke: passed with all required contract field IDs,
  unique valid IDs, supported block types, and readable attributes.
- Contract heading and Issue Form field inspection: passed.
- `git diff --check`: passed.
- `pnpm run check`: passed after installing the lockfile-pinned dependencies in
  this new worktree; build, `857` tests, skill validation, and neutral naming
  validation all passed.
- Deploy/restart/live smoke: not applicable; no runtime behavior changed.
- Commit/PR: this branch's final governance commit; no push or pull request is
  authorized by this bounded task.
