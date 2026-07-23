# Engineering Standards

Status: repository-wide maintainability contract. This document owns source,
directory, dependency, test, and documentation structure. It does not decide
product priority, self-evolution permission, runtime behavior, or task process.

The Simplified Chinese companion is
[`docs/ENGINEERING.cn.md`](ENGINEERING.cn.md).

## Design For Understanding

- A maintainer should be able to find the owner from the directory and module
  name, then understand its public contract before reading implementation.
- Prefer one deep module with a small interface over several forwarding files.
  Create an interface only for a real variation point, normally production and
  a materially different test/local adapter or two execution hosts.
- Keep composition roots thin. CLI, Web, IM, and daemon entrypoints translate
  inputs and assemble owners; they do not own parallel Goal, memory, evidence,
  or learning state.
- Replace complete vertical paths. Once interface-level coverage protects the
  new path, delete superseded code, compatibility writes, and tests that assert
  only old choreography.

## Repository Placement

```text
apps/              thin executable and composition entrypoints
packages/core/     host-independent contracts, pure policy, state/read models
packages/runtime/  Goal execution, adapters, services, providers, host effects
packages/kernel/   vNext Turn/Run kernel, SQLite state, Action Gateway, Pi adapter
core/              stable Self and memory policy text
docs/              stable architecture, behavior, operations, and learning docs
.trellis/          frozen historical task specs, decisions, and delivery evidence
tests/              interface, integration, and acceptance protection
```

- Add a directory only when it has a named owner and at least one real module;
  do not create speculative folder hierarchies.
- Put provider, channel, application, and external-project behavior near its
  adapter. Move it inward only after repeated evidence proves a reusable
  runtime contract.
- Runtime state, secrets, logs, installed artifacts, and active-vault material
  remain ignored/local. Tracked fixtures must be synthetic and labeled.
- A large file is an attention signal, not an automatic split command. Existing
  large files are grandfathered under a no-unrelated-growth rule: touch the
  relevant seam, reduce caller knowledge, and extract only a coherent owner.

## Dependency Direction

```text
apps -> runtime -> core
apps -> kernel (only after a verified vNext ingress slice)
kernel -> Pi (only through the Pi adapter)
docs/tests may inspect any public surface
core -X-> runtime/apps
runtime -X-> apps
kernel -X-> v0.2 GoalRuntime/runtime owners
```

- `packages/core` must not import runtime or app implementation.
- `packages/runtime` may implement core contracts and own host effects, but it
  must not depend on an app composition root.
- `packages/kernel` owns the vNext foundation and must not import v0.2 runtime
  owners. Only its Pi adapter may import Pi packages; the rest of the kernel
  depends on local contracts. Action handlers do not import Pi; the adapter
  projects Gateway contracts into Pi tools.
- Cross-package cycles, hidden global singletons, and a second state owner are
  architecture failures, even when tests pass.
- Reuse platform libraries and mature tools behind narrow Evi-owned contracts;
  do not copy an external framework into the core to avoid one adapter.

## Source And Interface Rules

- Use capability-oriented names. Avoid task numbers, temporary migration names,
  provider brands, or reference-project identities in stable interfaces.
- Keep persisted schemas strict, versioned, bounded, and provenance-aware.
  Canonical event/evidence records own facts; projections must be rebuildable.
- Separate direct observations from inference and association. A Goal result
  associated with a tool use is not proof that the tool caused the result.
- Every mutation path names authority, target, evidence, verification, and a
  recovery or retirement path. Process limits are not described as a sandbox.
- New dependencies require a concrete owner and need; prefer the lockfile-pinned
  repository toolchain and existing adapters.

## Test Structure

- Test the smallest stable interface that protects operator-visible behavior.
  Pure projections get table-like unit tests; host effects get injected adapter
  tests; full flows get integration or acceptance tests.
- Keep fixtures local to the behavior, synthetic, bounded, and explicit about
  what they do not prove.
- Do not mirror an implementation graph in tests. When a replacement interface
  covers the same risk, delete internal-choreography tests with the old path.
- A regression test must fail for the named defect and remain valuable after
  internal refactoring. Test count and coverage percentage are not growth
  metrics by themselves.

## Documentation Ownership

- `README.md` and `docs/INDEX*` route; they do not duplicate contracts.
- `docs/ARCHITECTURE*` owns module placement and staged replacement.
- `docs/ENGINEERING*` owns maintainable project structure.
- `docs/RUNTIME_CONTRACT.md` owns implemented runtime behavior;
  `docs/LOCAL_RUNTIME.md` owns commands and operations;
  `docs/LOCAL_LEARNING.md` owns SOP/skill/memory promotion.
- Until cutover, `GoalRuntime`, its Harness, canonical evidence, and
  `OutcomeReceipt` own v0.2 delivery. ADR 0012 defines the accepted vNext owner
  model; source and live health decide which one is implemented or deployed.
  GitHub can carry optional external collaboration or release evidence;
  `.trellis/` preserves history only. Stable docs must not copy transient
  progress, proof matrices, or Goal-specific completion state.
- Material edits to a stable English/Chinese pair update both sides together.

## Change Standard

A maintainable change has one owner, one bounded reason, a smaller or unchanged
authority surface, interface-level verification, and an explicit deletion or
retirement result. Add automated checks only when they prevent a demonstrated
structural drift; do not create report-only gates to prove that development is
disciplined.
