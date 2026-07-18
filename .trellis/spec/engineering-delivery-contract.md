# Engineering Delivery Contract

Status: accepted repository governance. This specification applies to new
material engineering work and to existing work when it is materially revised.
It is not evidence that any planned capability has been implemented.

## Purpose

Keep Evi's self-iteration traceable, minimal, evidence-backed, and recoverable
without turning the core runtime or Trellis into a broad project-management
system. This contract defines how accepted direction becomes one bounded
repository change and how that change proves completion.

## Ownership And Sources Of Truth

There is no global document that overrides every subject. Use the owner for the
question being answered:

| Subject | Canonical owner | Boundary |
| --- | --- | --- |
| Mission and long-term product north star | Accepted stable product-vision documents and explicit operator decisions | Direction, not implementation proof or a fixed backlog |
| Version capability sequence and milestone priority | Accepted version specs plus GitHub Milestones, Issues, and Projects | What is accepted and when; not current runtime fact |
| Durable architecture and governance choices | `.trellis/decisions.md` | Decisions and supersession lineage; not live progress |
| Current module placement and delegated capability seams | `docs/ARCHITECTURE.md` plus source/tests | Current owner map and staged replacement direction; not implementation proof or an active task |
| Activated implementation constraints | `.trellis/spec/` | Cross-task delivery and version boundaries; not runtime state |
| One bounded repository delivery | One linked `.trellis/tasks/` record | Scope, checkpoints, acceptance, and evidence for that task |
| Integration state | Git branch, pull request, checks, commits, and reviews | Delivery evidence; not product vision |
| Current implemented behavior | Source, tests, built artifacts, and live runtime evidence | Current fact; must not be inferred from plans |
| Advertised runtime/operator behavior | Stable `docs/` contracts | Must be reconciled with verified implementation before release |

When sources appear to conflict, first determine whether they own the same
subject. Current code and live evidence decide whether something is implemented;
accepted product/version direction decides whether it should be built. A newer
explicit Decision Owner ruling may change a boundary, but the durable override
must record its authority and supersession lineage before completion is claimed.

## Work Activation

Material work normally requires both:

1. an accepted GitHub Issue naming the problem, target version or milestone,
   acceptance, non-goals, dependencies, and owner; and
2. one Trellis task per repository that translates the Issue into a bounded
   implementation and verification contract.

An Issue is required for product/runtime capability work, architecture changes,
version or milestone work, cross-repository delivery, new dependencies, public
or external effects, and changes that need a pull request or release record.

A task may use `Issue: none` only for an explicitly operator-directed governance
bootstrap, an urgent repair, or a truly small maintenance change. It must record
the Decision Owner, the reason no Issue exists, and why the work does not create
new product direction. This exception is a proportionality rule, not a way to
avoid traceability.

Do not turn unaccepted roadmap ideas into Trellis tasks. Keep speculative
direction in product/version planning until it is accepted and bounded.

## Required Trellis Task Contract

Every material task records the fields below before implementation. Use
`not applicable` with a reason rather than silently omitting a field.

### Identity And Ownership

- status and task title;
- linked Issue, milestone, and target version;
- owner repository and implementation owner;
- Decision Owner and authority basis;
- capability layer: `core`, `basic-entrypoint`, `local-learning`,
  `application-slice`, `governance`, or `boundary`;
- base commit, branch, and isolated worktree.

### Problem And Boundaries

- observed problem and cited evidence;
- desired outcome and acceptance criteria;
- scope and explicit non-goals;
- dependencies, blockers, and cross-repository links;
- architecture impact and stable owner surfaces affected;
- external effects, sensitive-data implications, and authority gates.

### Design Discipline

- reuse assessment: existing code, tools, adapters, SOPs, skills, libraries,
  and reference implementations inspected;
- complexity assessment: why the chosen design is the smallest coherent one;
- data/source contract: authoritative inputs, freshness, provenance, and any
  fixture, mock, synthetic, or inferred data labels;
- migration, compatibility, and retirement implications;
- rollback or recovery path.

### Execution And Evidence

- context and token budget appropriate to the task;
- retry, time, delegated-tool, and subagent budgets;
- independent parallel workstreams and exclusive file owners, if any;
- targeted verification commands and the claim each command supports;
- completion evidence, commit and pull-request refs;
- deploy, restart, live smoke, probation, and rollback evidence when runtime
  behavior changes.

Budgets may be qualitative when exact numbers are not useful, but they must
still bound behavior. Multiple subagents are justified only by independent,
non-overlapping workstreams. The main owner integrates results, resolves
conflicts, runs final verification, and owns the completion claim.

## Engineering Principles

### Facts Before Claims

- Inspect current source, configuration, Git state, dependencies, and live
  runtime state relevant to the claim.
- Search repository documents and evidence before asking the operator; ask when
  an undiscoverable choice would materially change scope or risk.
- Never invent repository state, external data, test evidence, API behavior, or
  completion. Label fixtures, mocks, synthetic data, estimates, and inference.
- A successful model response, delegated result, or command exit code proves
  only the claim that its evidence actually covers.

### Minimal Core And Reuse

- Prefer the smallest architecture-consistent design that satisfies the
  accepted contract and leaves a clear removal or extension path.
- Reuse existing commands, libraries, tools, adapters, SOPs, skills, and
  delegated implementation surfaces before creating a new mechanism.
- Keep provider, channel, workflow, and product-specific behavior at adapters
  or application slices unless repeated evidence justifies a general core
  abstraction.
- Do not add a framework, service, dependency, cache, queue, database, or
  compatibility layer without a concrete owner, need, lifecycle, and proof that
  the existing surface cannot satisfy the task.
- Remove accidental duplication when the bounded task can do so safely; do not
  hide broad cleanup inside an unrelated feature.

### References Are Evidence, Not Standards

GenericAgent, Codex, Hermes, OpenClaw, pi, Claude Code, LuBan, and projects under
`Common/github_evi` may inform a design. Record the inspected version or commit,
the reusable idea, Evi-specific differences, and the verification required.
Do not copy identity, architecture, token limits, or tool contracts solely
because a reference project uses them.

### Context And Token Economy

- Start from compact routers and load only task-relevant sections and evidence.
- Keep the active goal, checkpoint, acceptance, selected refs, and verification
  hotter than historical bodies or raw logs.
- Prefer bounded tool output, targeted searches, resumable checkpoints, and
  explicit retry limits over repeatedly reloading large context.
- Delegate specialist implementation when it reduces total complexity, but
  keep authority, acceptance, evidence review, and final verification with the
  task owner.

## Gates

### 1. Readiness Gate

Pass only when the owner, source of direction, problem evidence, scope,
non-goals, dependencies, authority, and acceptance are explicit. Otherwise
narrow the task or record the unresolved decision.

### 2. Architecture And Reuse Gate

Pass only when stable owner surfaces are identified, existing mechanisms and
references have been inspected, and the proposal is the simplest coherent
design. A new mechanism requires an explicit reason and retirement owner.

### 3. Execution Gate

Use a clean control-plane checkout and an isolated feature branch/worktree.
Preserve unrelated changes. One task owns one bounded repository diff; cross-
repository work uses linked Issues/tasks, separate diffs, and separate evidence.

For an Issue-backed task, prefer `codex/issue-<number>-<slug>`. For an allowed
Issue-less task, use `codex/<bounded-slug>`. Record the base commit. Do not make
feature changes directly in the root `develop` checkout.

### 4. Verification Gate

Run targeted checks for the changed contract, then the repository-wide gate in
proportion to risk. Inspect the final diff and bind each completion claim to
command, test, review, or live evidence. Missing, stale, synthetic, or unrelated
evidence cannot be upgraded by model confidence.

### 5. Integration And Runtime Gate

Before completion, connect task -> Issue -> branch/worktree -> commit/PR ->
checks. When behavior or deployment changes, also connect release identity ->
restart/deploy receipt -> live smoke/probation -> rollback evidence. Update the
Issue/Trellis status from observed evidence; do not duplicate GitHub status in
stable docs.

## Delivery Lifecycle

```text
accepted direction
  -> GitHub Issue / milestone
  -> one Trellis task per repo
  -> readiness + architecture/reuse gates
  -> isolated branch/worktree
  -> implementation or specialist delegation
  -> targeted + repository verification
  -> commit / pull request / develop integration
  -> restart or deployment when required
  -> live verification and rollback proof
  -> Issue and task closure with evidence
```

`develop` is the pull-request integration branch under the authority recorded
in `.trellis/decisions.md`. `main` remains the operator-gated release branch.
Branch authority never removes scope, verification, or completion gates.

## Definition Of Done

A task is complete only when:

- acceptance is satisfied and every non-goal remains out of scope;
- the final diff is architecture-consistent and contains no unexplained
  duplication or unrelated user changes;
- targeted and repository-required checks pass, with limitations recorded;
- docs and paired language companions are updated when their contract changed;
- migration, rollback, deployment, restart, and live validation are completed
  when applicable;
- Issue, Trellis task, commits, pull request, checks, and runtime evidence are
  linked as applicable;
- blockers and follow-up work are explicit rather than hidden in a completion
  claim.

## What Does Not Belong Here

This specification does not own Evi's identity, full product vision, runtime
behavior details, local-learning promotion logic, skill bodies, raw memory,
episodes, service state, secrets, or active-vault contents. Those remain with
their canonical owners.

Codex and other development skills should reference this specification for
project policy, then add only tool-specific execution guidance such as model or
profile selection, sandboxing, resumability, and evidence capture. A skill must
not fork or silently weaken this contract.
