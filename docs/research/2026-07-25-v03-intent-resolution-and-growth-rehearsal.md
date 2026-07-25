# v0.3 Intent Resolution direction and Growth Rehearsal proposal

Status: proposed and paused on 2026-07-25. This is an on-demand discussion
record, not an implemented runtime contract, acceptance decision, deployment
request, or authorization for a model call.

Decision owner: Operator.

## Purpose

This record preserves the v0.3 discussion that combines two deliberately
separate concerns:

1. Evi's product north star is **Intent Resolution**: understand the
   operator's real task from sparse input, use the operator's capabilities
   appropriately, and deliver verified results.
2. The immediate technical prerequisite is a narrow **Growth Rehearsal control
   plane**. It can collect the first real A-to-B evidence for the already
   implemented, fixed `procedure.runtime-inspection` lifecycle.

Growth Rehearsal is a low-risk mechanism experiment. It must not be presented
as general Skill routing, user understanding, efficacy proof, or a v0.3
runtime cutover.

## Evidence and current state

The source baseline for the proposed mechanism is
`codex/v03-growth-lifecycle` at `ca1a61c`:

- `packages/kernel/src/adaptation_engine.ts` contains the Growth lifecycle
  facade.
- `packages/kernel/src/sqlite_runtime_store.ts` owns candidate, evaluation,
  activation, selection, terminal observation, retirement, and
  `growth_observation_unverified` facts.
- `packages/kernel/src/kernel_runtime.ts` binds an active procedure before the
  first loop and reads the persisted binding on continuation.
- `apps/cli/src/vnext_adaptation.ts` currently exposes proposal, evaluation,
  and candidate/evaluation inspection, but not activation or Run lifecycle
  inspection.
- `apps/cli/src/vnext_run.ts` creates the normal supervisor composition on
  submit; its continuation composition already recognizes an exact
  `runtime_inspect` lock.

The relevant v0.3 direction is ADR 0018. ADR 0001 defines a Direction Proposal
as a bounded checkpoint without authority; ADR 0002 requires an Environment
Baseline before a source-mutating evolution slice.

As of this record, no real v0.3 A-to-B-to-C evidence exists. Previous test
fixtures, historical SQLite files, candidate evaluations, and model
self-reports are not evidence of actual growth. The default `stable_cli` root
was reported absent in the handoff audit, the resident service is an older
build, and the delivery branch has not been merged or deployed. These are
handoff facts, not a replacement for a fresh live preflight.

## Product north star: Intent Resolution

The future product loop is ordered as follows:

```text
User Signal
  -> scoped Recall
  -> Intent Hypothesis
  -> material clarification when needed
  -> Intent Frame
  -> plan / execute / verify
  -> Outcome Attribution
  -> capability lifecycle
```

### Intent Resolution Interface

Intent Resolution should eventually emit one bounded `Intent Frame` containing:

- objective;
- success criteria;
- constraints;
- non-goals;
- assumptions; and
- unresolved material uncertainty.

The Frame owns neither action authority nor a completion claim. Current user
input and a later user correction always outrank recalled memory and a Skill
match. Memory and Skills can support a bounded, sourced hypothesis; they cannot
decide intent, grant permission, or substitute for verification.

`grill-me` remains a clarification Skill, not a default planner or an
open-ended conversation loop. It asks at most one highest-information question
only when ambiguity would materially change the outcome, permission, cost, or
reversibility.

A Skill remains a portable, verifiable standard-solution package: a trigger,
input/output Interface, procedure/tool/template Implementation, verification,
versioning, and lifecycle. It is not task authority, delivery ownership, or
final acceptance.

## Immediate enabling slice: Growth Rehearsal

The immediate slice keeps one `EvolutionRuntime` and adds no peer runtime. It
uses the existing SQLite-owned lifecycle for exactly one target:

- target slot: `procedure.runtime-inspection`;
- action evidence: `runtime_inspect@1`;
- effect class: `local_read`.

Candidate evaluation is readiness evidence only. A real successful use is an
observation, not comparative efficacy proof. Automatic retirement is valid
only after a later real Run naturally fails after one canonical successful
receipt; a fixture, direct SQLite manipulation, fault injector, or model claim
cannot manufacture that evidence.

### Proposed small control-plane Interface

1. `vnext run submit --action-profile runtime-inspection`

   This is an explicit fixed profile, not an arbitrary action list. It creates
   a normal isolated `stable_cli` Run with only
   `runtime_inspect@1/local_read` in the immutable Execution Lock. It creates
   no worker, external read, local write, source, vault, Web/IM, or resident
   service operation. Continuation must derive its gateway only from that
   persisted lock.

2. `vnext adaptation activate --candidate-id <id>`

   This calls the existing Kernel activation path. It fails closed unless the
   candidate has a passed evaluation, targets exactly
   `procedure.runtime-inspection`, and still matches its required baseline and
   identity facts.

3. `vnext adaptation inspect --run-id <id>`

   This returns one read-only `GrowthRunInspection` rather than asking callers
   to query SQLite tables.

`GrowthRunInspection` is a narrow allowlist DTO. It contains only the Run ID,
status, terminal marker, Execution Lock digest; selection identity and digests;
the unique canonical receipt ID/digest when present; observation and retirement
identity/digests; and a restricted unverified reason when one exists. It must
not return a request, answer, error body, procedure text, growth context,
Execution Lock JSON, Pi messages, action parameters/output, event payloads,
environment values, or credentials. Inspection never creates, settles, or
repairs lifecycle state.

## Seam and ordering

```text
Future Intent Resolution                  Immediate Growth Rehearsal
-------------------------                 --------------------------
User Signal                               fixed foreground CLI command
  -> scoped recall                          -> immutable action profile lock
  -> hypotheses                             -> existing GrowthLifecycle
  -> one necessary clarification            -> canonical receipt observation
  -> Intent Frame                           -> bounded inspection evidence
  -> later plan/execute/verify
```

The two seams connect only through future verified Run and Outcome Attribution
evidence. An Intent Frame does not select the fixed profile, and the fixed
profile does not inspect user intent, recall memory, form hypotheses, ask
questions, or select a generic Skill. A failed Run cannot automatically retire
a general Skill: attribution must first distinguish intent, missing input,
tool/environment, procedure, and verification failure.

This ordering prevents an implementation convenience from becoming product
architecture: the fixed `runtime-inspection` experiment is not a generic Skill
router.

## Proposed source-delivery plan

The project is paused before this plan starts. If the operator later accepts
and resumes this specific slice, execute the following in order.

1. Establish a fresh Environment Baseline in the bound isolated delivery
   worktree: worktree/branch/stash/HEAD, inherited-change ownership, and
   relevant runtime identity and health. Preserve unrelated changes.
2. Add failing tests for the fixed profile, exact immutable lock actions,
   lock-driven read-only continuation, activation rejection cases, bounded Run
   inspection, absence of raw/sensitive fields, unchanged default run behavior,
   and corrected CLI help/documentation.
3. Add the closed `runtime-inspection` profile to the vNext run CLI. Reuse the
   existing read-only gateway and the existing lock-derived continuation seam;
   do not introduce configurable profiles or action lists.
4. Add activation and `--run-id` inspection to the adaptation CLI. Add one
   Kernel/store read projection for `GrowthRunInspection`, reusing existing
   canonical lifecycle facts. Do not add a new state owner or schema merely for
   the read model unless a verified compatibility requirement makes it
   necessary.
5. Correct English CLI help, `docs/LOCAL_RUNTIME.md`, and
   `docs/RUNTIME_CONTRACT.md` from `procedure.runtime-recovery` to
   `procedure.runtime-inspection`, and accurately describe activation and
   observation scope. Do not add localized companions in this narrow slice.
6. Run focused tests, `pnpm run check`, and an independent review against
   `ca1a61c`. Commit focused local slices only. Do not push, merge, deploy, or
   restart.

## Separate future real rehearsal

Source acceptance does not authorize a model call. A later operator decision
must authorize a real rehearsal using a brand-new absolute `stable_cli` state
root. Before any call, verify realpath and inode separation from v0.2, default
vNext, canary, and resident roots; run doctor; and never copy credentials.

The evidence criteria are:

- **A:** real Pi dispatch (`model_dispatch_count > 0`), exactly one successful
  canonical receipt, a completed Run, and no active procedure.
- **activate:** an immutable activation receipt binds the passed evaluation,
  baseline, candidate, version, and digests.
- **B:** a new real Run receives selection before loop creation, has exactly
  one canonical receipt, completes observation, and has no unverified event.
- **C:** only a later natural failure after the canonical receipt may produce a
  failed observation and matching `observed_failure` retirement. Otherwise,
  retain the active procedure and report C as unobserved.

Persist only an evidence summary with IDs, digests, statuses, and timestamps.
Never persist raw prompts, credentials, or model output in the summary. Retain
the isolated state root as evidence; do not promote it into a default root.

## Explicit non-goals

- Intent Resolution implementation in the Growth Rehearsal slice;
- generic Skill routing, automatic Skill creation, or general Skill retirement;
- arbitrary action profiles, manual retirement, or a second runtime;
- active-vault writes, source mutation by the Runtime, v0.2 migration/deletion,
  default-route change, or rollback-path removal;
- Feishu/Web/resident-service routing, restart, deployment, or external
  publication;
- direct SQLite manipulation or synthetic evidence presented as natural growth;
- changes to frozen `.trellis/` historical material.

## Pause and resumption condition

Development is paused by operator instruction on 2026-07-25. No part of the
source-delivery plan or real rehearsal may proceed solely because this document
exists or is committed.

To resume, the operator must select the intended slice and authorize it. The
implementer must then establish a new Environment Baseline and reconfirm the
source, worktree, runtime, and evidence facts that may have changed while the
project was paused.
