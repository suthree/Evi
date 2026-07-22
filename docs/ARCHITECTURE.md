# Evi Architecture

Status: current v0.2 module ownership plus the accepted vNext replacement
target, updated on 2026-07-22 after ADR 0012. Source, tests, and live evidence
decide current implementation; the vNext section is not a deployment claim.

The Simplified Chinese companion is
[`docs/ARCHITECTURE.cn.md`](ARCHITECTURE.cn.md).

## Purpose And Authority

Evi is one persistent, local-first, self-growing agent. Its differentiator is
not that it reimplements every executor. Evi owns continuity, judgment,
evidence, learning, and result acceptance; it delegates specialist execution
through bounded adapters.

This document owns current module placement, own-versus-delegate decisions,
architectural pressure evidence, and the order in which later implementation
may replace shallow paths. It does not own:

- identity or learning values: `core/soul.md` and `core/memory.md`;
- implemented runtime behavior: source, tests, `docs/RUNTIME_CONTRACT.md`;
- commands, service operation, and recovery: `docs/LOCAL_RUNTIME.md`;
- SOP, skill, vault, promotion, and retirement policy:
  `docs/LOCAL_LEARNING.md`;
- long-term product direction: `docs/PRODUCT_VISION.md`;
- durable architecture and evolution decisions: stable docs and accepted ADRs;
  ADR 0001 records the current v0.2 owner model and ADR 0012 owns the vNext
  replacement target;
- current deployment truth: Git, installed artifacts, and live health.

When this document differs from source or live evidence about implemented
behavior, source and live evidence win. When a later task changes a stable seam
or owner, update this document and its Chinese companion in the same delivery.

## Architecture Principles

1. **Keep the loop small.** Follow GenericAgent's useful restraint: a bounded
   observe-decide-act-verify-learn loop plus a small bootstrap tool surface.
   Do not copy its unrestricted `code_run` authority or promote every task into
   a skill.
2. **Own outcomes, select execution dynamically.** Evi owns why, when, under
   which authority, how results are checked, and whether they are accepted. It
   is the capability orchestrator, not the default specialist worker.
3. **Build deep modules.** A module earns its place when a small interface hides
   substantial behavior and gives callers leverage and maintainers locality.
4. **Use real seams.** Do not add an adapter interface for hypothetical
   variation. A seam is justified by at least two real adapters, normally
   production and a materially different test/local implementation or two
   execution hosts.
5. **Replace, do not layer.** A migration cuts over one complete vertical path,
   adds interface-level tests, and deletes the superseded path and shallow
   tests. No indefinite dual-write, forwarding facade, or compatibility stack.
6. **Keep one state authority.** SQLite is the canonical structured runtime
   state. Large immutable evidence may live in content-addressed artifacts;
   checkpoints, context views, scorecards, JSONL exports, and dashboards are
   derived and rebuildable rather than competing owners.
7. **Context is selected, not accumulated.** Indexes and manifests route to
   evidence. Raw logs, tool bodies, task history, and long documents remain
   cold until selected.
8. **Learning is outcome-based.** A valid package or one successful run is not
   tool competence. Promotion requires reusable scope, verified outcomes,
   failure/fallback knowledge, and revision or retirement evidence.

## Accepted vNext Runtime Shape

ADR 0012 replaces the v0.2 owner model after a verified cutover. The target is:

```text
CLI / Web / IM / API
          |
          v
   Evi Runtime Kernel ---- inspect / control
          |
          +---- SQLite canonical state
          |
          v
 Pi AgentHarness (only Agent Loop owner)
          |
          v
    Action Gateway
          |
          +---- typed tools / delegated surfaces
          +---- reservation / evidence / reconciliation

optional Goal -------- links objectives and budgets to Runs
Adaptation Engine ---- evaluates and activates learning or evolution candidates
```

| Concern | vNext owner | Boundary |
| --- | --- | --- |
| Ordinary work | Turn inside a Run | No Goal is required |
| Model/tool loop, session tree, steering, compaction | Pi `AgentHarness` behind one adapter | Evi has no second execution loop |
| Structured state | SQLite runtime store | JSONL and directory scans are projections, fixtures, or archives |
| Tool and durable effects | Action Gateway | Typed policy, containment, reservation, evidence, reconciliation |
| Long-lived intent | Optional Goal extension | Objective, acceptance, budget, continuation, Run links only |
| Durable growth | Adaptation Engine | Candidate, evaluation, activation, rollback or retirement |
| Completion evidence | Specialized outcomes and receipts | Run, effect, evaluation, activation, and deployment remain distinct |

The first implementation slice is intentionally smaller than this table: it
proves a Goal-free Turn, the Pi loop adapter, and SQLite state without tools,
learning, subagents, ingress cutover, migration, or deployment. v0.2 remains
the current rollback runtime until later slices satisfy their own gates.

## Current v0.2 Runtime Shape

```text
CLI / Web / IM
      |
      v
Goal ingress -> GoalRuntime
                    |
                    v
           Capability Portfolio
                    |
                    v
           cognition selection
                    |
                    v
GoalRuntime validation -> EffectPolicy -> selected execution
                                                |
                                                v
                                   canonical observations
                                   |             |
                         execution workspace    action evidence
                         (when selected once)          |
                                                |
                                                v
                                     verification / receipt
                                         |             |
                                   operator result  bounded competence
                                                       |
                                                later Goal cognition
```

The flow is intentionally one-way in ownership: entry adapters submit work;
GoalRuntime owns lifecycle; EffectPolicy decides permitted impact; tool
execution performs effects; canonical observations support verification and
learning. Entry adapters, cognition providers, and delegated executors do not
own the Self or completion.

## Current Owner Modules

| Concern | Current owner | Interface and invariant | Does not own |
| --- | --- | --- | --- |
| Stable Self | `core/soul.md`, `core/memory.md`, `core/runtimes.md` | Identity, memory policy, reference/runtime ontology | Task progress or execution state |
| Goal lifecycle | `packages/runtime/src/goal_runtime.ts`, `goal_workspace_baseline.ts` | `GoalRuntimePort`, Harness-owned start baseline, commands, canonical event stream, checkpoints, verification, one receipt | Channel transport, task routing, or executor internals |
| Goal interaction | `packages/runtime/src/goal_ingress.ts`, entry adapters | Translate one accepted submission or one explicitly named interaction into canonical GoalRuntime commands | Goal state, latest-Goal inference, or independent task/session truth |
| Context compilation | `packages/core/src/context.ts`, `context_budget.ts`, runtime context manifest | Bounded rendered snapshot plus provenance and omissions | Raw archive ownership or ambient full recall |
| Effect decision | `packages/runtime/src/effect_policy.ts` | Typed `allow | confirm | deny` decision over semantic intent | Correctness proof or process confinement |
| Tool contracts | `packages/core/src/tool_contracts.ts` | Model-visible names, schemas, and bounded contract metadata | Runtime dispatch and host execution |
| Capability portfolio | `packages/runtime/src/goal_capability_portfolio.ts` | Read-only bounded default candidates, readiness, `inspect | act | delegate` operation roles, selected skills, competence, and selection validation | Task routing, effect authority, execution, persistence, or completion |
| Specialist executor adapter | `packages/runtime/src/goal_specialist_executor.ts` | Convert bounded specialist intent into a complete typed invocation from Goal authority and retained evidence | Model-authored worktree/model/thread/authority protocol fields or completion authority |
| Goal execution workspace | `packages/runtime/src/goal_execution_workspace.ts` | Prepare and live-validate one Goal-bound isolated linked worktree from the immutable control authority | Task classification, workspace registry, lifecycle scheduling, state-root movement, or completion |
| Tool execution | `packages/runtime/src/tools.ts` | Validate, execute, capture bounded output and change evidence | Goal lifecycle, learning judgment, or a true OS sandbox |
| Tool competence | `packages/runtime/src/goal_tool_competence.ts`, GoalRuntime cognition input | Pure bounded projection from terminal Goal observations/receipts into later selection guidance | Persistence, causal attribution, Goal acceptance, or automatic promotion |
| GitHub discovery radar | `packages/runtime/src/github_discovery_radar.ts`, `apps/cli/src/github_discovery_command.ts` | Manually scan the fixed public GitHub Trending weekly page into bounded, untrusted state-only signals for an explicit business need | Default context, Opportunity Backlog, capability portfolio, repository fetch/clone, installation, activation, SOP/skill promotion, active-vault writes, or LuBan |
| Evidence and state | `packages/core/src/store.ts`, `memory_store.ts`, typed event/artifact writers | Append-only or durable facts in the shared checkout-independent Evi state root; derived projections remain rebuildable | Product direction, source authority, or automatic truth promotion |
| Learning | `packages/runtime/src/background_review.ts`, core SOP/skill/memory modules | Evidence to candidate, audit, promotion, reuse, revision/retirement | Foreground completion or identity changes by implication |
| Entrypoints | CLI, Web, Feishu, Telegram, Discord adapters | Parse, bind channel context, submit, deliver, record provider evidence | A second GoalRuntime, memory store, or execution owner |
| Deployment | service/deployment/supervisor modules | Commit-bound artifact activation, health, rollback and controller handoff | Source integration or product release authority |

Some legacy queue, runner, project-design, scorecard, iteration, and historical
state code remains. It is on-demand compatibility/history, not resident
context, capability-selection authority, or another current execution owner.
Removal requires a later bounded issue with caller and operator-need evidence.

## Dynamic Capability Selection

Architecture owns the decision boundary, not a task-to-tool routing table. On
each cognition turn, GoalRuntime supplies a bounded Capability Portfolio built
from current tool contracts and constraints, readiness under the bound
authority, selected skills, and evidence-derived competence. It presents
default candidates as `inspect`, `act`, or `delegate`; this is a decision aid,
not task routing or effect authority. Bounded implementation helpers such as
`code.execute_node` remain registered under their own contract and dispatch
validation, but do not occupy a default Goal candidate. Cognition chooses one capability and
states its purpose, rationale, verification plan, fallback, and any selected
skill refs. A delegated selection additionally records a
Capability Fit Assessment covering exactly the current capability ids and
selected skill refs, with a bounded conclusion. GoalRuntime validates that
selection before EffectPolicy or dispatch.

Direct tools and delegated executors describe execution roles, not fixed task
categories. Direct action remains appropriate for bounded orientation,
verification, recovery, or a genuinely atomic task. Specialist production is
normally delegated when a suitable executor is available. Readiness, evidence,
risk, cost, reversibility, and verifiability may change the choice; no keyword
map decides it. If no credible capability is available, Evi blocks or chooses
an explicit verifiable fallback instead of silently becoming the worker.

The independent-verification bridge is a narrow exception for a successful
no-change delegated coding result: Evi does not accept the specialist's own
test report or repeat the same delegation. GoalRuntime derives a temporary
evidence obligation, and cognition selects one bounded `command.run`
verification from the Portfolio. Harness owns containment, observation, and
receipt acceptance. This preserves Evi as a learning orchestrator rather than
a generic command worker, while keeping verification independent and
reproducible.

Goal start also captures a Harness-owned, read-only workspace baseline: Git
HEAD plus normalized tracked and untracked status paths only. A non-empty
baseline remains explicit inherited lineage on the terminal receipt and needs a
later successful Harness-owned local verification before acceptance. It does
not classify the objective, choose a capability or test command, route a task,
or create an automatic test pipeline; an empty baseline adds no synthetic
verification obligation.

Constraints are classified by what they protect. Canonical evidence, repository
containment, secret/private-data boundaries, irreversible external effects, and
completion ownership are hard invariants. Effect confirmation is a hard gate
only for its exact effect. Capability choice, whether a new workspace is needed,
and the order of an SOP draft versus implementation are adaptive defaults:
current readiness and authority may override the default path with recorded
evidence. Advice from a skill is guidance, not authority. A workflow rule must
not remain mandatory when it conflicts with an already-satisfied invariant; for
example, an already-linked control worktree may be the bounded Codex target
when `codex.run` is ready, without nesting `workspace.prepare`.

The same boundary applies to local reading. Within an already-authorized
repository or state root, `file.read` and `repo.search` may select a relevant,
bounded path dynamically when the Goal has no `read_policy`. A Start command
may instead carry an explicit structured `read_policy`; only then does the
Harness fail closed for a nonmatching file or tree reference. Objective prose,
checkpoint `selected_refs`, and model summaries never become authorization.
Each allowed read remains a canonical, untrusted observation. The read-only CLI
`goal inspect` exposes bounded observation metadata and terminal-Goal tool
competence without observation bodies, persistent Capability Profiles, default
context injection, or new authority. A read never grants write, effect,
capability, Skill, or completion authority; private paths, cross-root access,
external effects, and writes remain hard boundaries.

Repository placement follows the same dynamic boundary. Every source-mutating
Goal has one immutable, linked execution worktree for its full delivery
lineage; later sessions and tools reuse it. A Goal may derive that worktree by
`workspace.prepare` or bind an already-linked worktree, but never creates one
per session. The clean root checkout on protected `develop` is control and PR
integration only. Repo-scoped tools and `codex.run` use the live-validated
worktree, while state-scoped tools use the shared absolute Evi state root.
Preparation remains evidence-gated rather than an ingress side effect,
keyword route, or automatic per-task scheduler.

`codex.run` has a deliberately narrower Goal-facing surface than its standalone
typed tool protocol. Goal cognition may supply only `task` and `task_shape`,
while its Capability Selection carries fit, verification, and fallback. The
specialist-executor adapter derives `new` versus `resume`, worktree, branch,
base commit, profile/model selection, authority handle, delegation plan, and
budgets from bound Goal authority and retained canonical evidence. The typed
tool still re-validates the derived authority before dispatch. This makes tool
discovery and selection a core capability without turning provider-specific
Codex invocation details into model-internal skill or authority.

Protected local-learning locations (`sop/`, `skills/`, and `vault/`) are not
direct Goal file-write targets. A verified Goal may provide evidence to the
existing background-review and promotion path, which decides whether a local
candidate is warranted. This preserves the learning gate without making a
particular code-first or SOP-first sequence mandatory.

The core tool contract also owns each tool's Goal store-placement metadata.
The execution adapter resolves dynamic `scope`/`cwd` placement from that shared
contract instead of maintaining another tool-name routing list. This metadata
selects only control versus execution storage; it does not classify tasks or
grant effect authority.

`runtime.inspect` is the narrow control-plane exception for a Goal that has
already bound an execution worktree but must verify integration performed by
the harness. It derives one fresh, typed snapshot from the existing control
repository and local Git provenance, current and exact prior deployment
records, installed controller, resident service health, previous runtime, and
channel-liveness owners. Prior lineage is accepted only from one validated
exact-commit history record plus bounded local Git parents and ancestry. It
creates no evidence ledger, does not choose itself through task routing, and
cannot deploy, restart, fetch remote claims, or accept the Goal.

The stable ownership split is:

| Decision concern | Owner |
| --- | --- |
| Goal, authority, evidence requirement, and acceptance | Evi / GoalRuntime |
| Candidate discovery and bounded decision context | Capability Portfolio |
| Capability choice and declared purpose | Goal cognition, validated by GoalRuntime |
| Specialist execution internals | The selected tool, host, adapter, or delegated surface |

## Reference Audit

References are pinned local evidence, not dependencies or compatibility
targets. `Common/github_evi/codex` was dirty in a generated model file and 330
commits behind its `origin/main` during this audit, so its row is explicitly a
local snapshot rather than a current-upstream claim.

| Reference snapshot | Take | Reject or adapt |
| --- | --- | --- |
| GenericAgent `804155475a4a` | Minimal loop, layered memory, small atomic bootstrap tools, call/rewrite/discard mindset | Unrestricted arbitrary code and automatic per-task skill crystallization need hard effect and quality gates |
| Codex `db887d03e1f9` | Tool specification/execution separation, approvals, process/sandbox protocol, incremental extraction | Codex remains a coding adapter; do not move Evi identity, Goal, or learning ownership into it |
| pi `2be9efa19cd6` | Small event loop, tool hooks, session tree, extension seam | Extensions need explicit trust and confinement; minimality does not prove safety |
| OpenCode `c69abee0c732` | Small tool definition, shared output truncation/spill, permissions, snapshots | Use as executor/harness evidence, not as Evi memory or Self owner |
| OpenClaw `76a236da5fa6` | Context-engine lifecycle, layered memory/search, opt-in Dream, skill loading controls | Avoid broad plugin/product surface and noisy bootstrap context |
| Hermes `e0240d7bf7ce` | Context and memory provider lifecycle, deterministic session recovery | Bound provider count and schema growth; do not inject stale session snapshots as current truth |
| learn-claude-code `a9cafe953aa7` | Cheap-first context reduction, raw transcript retention, reactive compaction and circuit breakers | Teaching code is a test corpus and design aid, not a production dependency |

The adoption rule is: first call an existing tool; if that is insufficient,
wrap it in a narrow adapter; rewrite only the Evi-specific judgment or evidence
part; discard patterns that add surface area without verified leverage.

## 2026-07-18 Pressure Audit

The stabilization baseline contained 78,704 TypeScript/MJS source lines under `apps/`
and `packages/`, plus 66,535 test lines and 12,024 top-level documentation
lines. Thirty-six source/test files exceed 1,000 lines, twenty exceed 2,000,
and eleven exceed 3,000. Since the accepted product-vision commit `1fc29f7`,
`develop` accumulated 112 commits and a net change of 21,585 insertions and
2,000 deletions across 113 files.

Primary attention points:

- `tests/context_harness.test.ts` was 11,810 lines and tested through many
  internal details rather than one small external interface;
- `packages/runtime/src/channels/feishu/adapter.ts` (5,554 lines) combines
  provider transport, operator commands, history, evidence, and ingress;
- `apps/cli/src/main.ts` (3,697 lines) is a wide composition/command surface;
- `packages/core/src/context.ts` was 3,520 lines and knew many content-specific
  sections while exporting many compaction helpers;
- `packages/runtime/src/tools.ts` (2,653 lines) combines dispatch, validation,
  process policy, output capture, repository evidence, and Codex adaptation;
- `docs/RUNTIME_CONTRACT.md` and historical Trellis records are valuable
  evidence stores but too large to preload as orientation context;
- Issue, task, PR, worktree, and live-runtime status had drifted, proving that
  duplicated progress state is not self-reconciling.
- generated `.trellis/agents/AGENTS.md` still advertises `status`, `log`, and
  `seed` commands that the installed Trellis 0.6.7 CLI does not expose. It is
  generated onboarding context, not a current-state or workflow authority.

Line count is an attention signal, not an acceptance metric. Mechanical file
splitting can create more shallow modules. A later refactor must reduce caller
knowledge, eliminate a state owner or duplicated path, and survive internal
change through interface-level tests.

The first consolidation removed the three proof-oriented resident context
sections, their project-plan compaction helpers, and implementation-shaped
tests. `context.ts` is now 3,022 lines and `context_harness.test.ts` is 10,950
lines. More importantly, later Goal cognition now receives a bounded projection
from terminal Goal outcomes without a new state owner. Remaining size is still
architecture pressure; this change is a replacement checkpoint, not a claim
that context or harness decomposition is finished.

## Staged Replacement Order

Each stage requires one bounded active Goal, a named Decision Owner, explicit
acceptance evidence, and verification or recovery criteria. More than one Goal
may exist only when their effect boundaries and ownership do not conflict.

The outcome-learning consolidation completed the first narrow part of stages 4
and 5: canonical Goal evidence now drives bounded tool selection guidance, and
proof-only resident projections were deleted. Legacy diagnostic command/source
retirement and broader LearningRuntime curation remain later measured work.

1. **Capability execution seam.** Replace one complete `tools.ts` vertical path
   with a small definition/execution interface shared by at least two real
   adapters. Centralize bounded output spill and canonical evidence. Delete the
   old dispatcher branch and its internal tests after interface tests pass.
2. **Context compilation seam.** Separate content selection providers from the
   deterministic budget compiler. Preserve raw evidence and manifests; apply
   cheap-first output/body reduction before model summary. Do not add an
   alternate engine until a second real behavior is required.
3. **Execution-host confinement.** Model the difference between process bounds
   and real confinement. Dynamic code either runs through a verified
   OS/container sandbox adapter or remains confirmation-gated/disabled for the
   relevant task class.
4. **Evidence and read-model consolidation.** Keep one canonical event/evidence
   ledger per fact. Rebuild or delete projections that duplicate outcome,
   progress, or completion ownership.
5. **Capability learning quality.** Require repeated verified reuse or an
   explicit high-value exception, human-readable stable names, bounded
   triggers, failure/fallback notes, freshness, regression, and retirement.
   Dream proposes candidates; it never becomes a fact or promotion authority.

No stage may hide feature expansion inside refactoring. Net deletion is useful
evidence but not mandatory; reduced interface knowledge and removed duplicate
ownership are the completion criteria.

## Feature Activation Gate

The 2026-07-18 stabilization pause was satisfied for the single bounded Issue
#93 child after the operator explicitly resumed Issue #56. Every later feature
child must repeat the same gate:

- the stabilization Goal has a verified `OutcomeReceipt`, and root/worktree,
  optional GitHub delivery evidence, and live runtime state are reconciled;
- the operator explicitly resumes Issue #56 or accepts a successor program;
- exactly one bounded child Issue names its owner module, interface, non-goals,
  replacement/deletion path, verification, and rollback;
- current sandbox limits and context pressure are stated rather than inferred
  away;
- the child starts from fresh source, test, and live-runtime evidence;
- no parallel feature slice or automatic SOP/skill promotion is activated;
- completion is judged by interface behavior, independent evidence, and
  reduced ownership ambiguity, not file count, tool count, or model confidence.

Ordinary operation and bug repair may continue between children, but no second
autonomous feature-growth chain is activated in parallel or from a derived
scorecard suggestion.
