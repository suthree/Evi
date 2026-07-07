# Runtime Contract

This document defines the first-version local agent runtime contract.

The contract is local-first and single-machine. It intentionally rejects
compatibility design for open-source distribution, multi-user hosting,
multi-machine skill sharing, public marketplaces, GUI surfaces, hosted
daemons, and production deployment. It includes a single-user local service
runtime for resident IM intake.

## Scope

The first-version local agent is one local TypeScript/Node runtime that can:

- accept a CLI task or local IM message
- run as a foreground command or local single-user service process
- expose bounded resident IM health through `service health`
- expose a read-only local capability catalog through CLI and IM
- expose a read-only next-version capability acceptance audit through CLI and
  IM
- expose read-only GA project-design artifacts derived from verified
  self-evolution iterations with outcome evidence refs and verification commands
  while collapsing historical completed-source non-goals during successor
  planning
- expose a fixed read-only workspace status diagnostic through CLI and IM
- run a bounded staged pipeline for short harness workflows
- explicitly resume a blocked or failed staged pipeline from a checkpoint
- create local content dry-run publish-plan artifacts for active exploration
- assemble bounded context
- call a real model
- parse a model action envelope
- validate requested actions through the harness
- execute local core tools
- preserve evidence
- record fixed pre/post workspace status evidence for repo writes
- rebuild and search local episode memory
- recap local sessions from episode and harness metadata
- archive daily episode-memory summaries
- produce proposal-only background reviews
- draft state-only SOP candidates from explicit review proposals
- draft state-only SOP candidates from live `not_done` model proposals
- rehearse the SOP promotion/reuse loop in a state-scoped sandbox
- verify completion claims
- optionally draft and audit local learning artifacts
- return a response

## Documentation Boundary

Stable docs describe current runtime facts. They should not carry broad future
roadmaps, speculative product design, or Trellis agent onboarding text.

- Operator-facing discussion and final responses default to Simplified Chinese.
- Keep model-facing default entrypoints and instruction files in English when
  that keeps the runtime contract clearer: `README.md`, `AGENTS.md`,
  `.trellis/agents/AGENTS.md`, `core/soul.md`, and related prompt/context files.
- Use paired docs for important human-facing entrypoints. The first pair is
  `README.md` for models/tools and `docs/README.cn.md` for local Simplified
  Chinese reading. Root README files stay thin and link into Chinese companions
  under `docs/`. Extend the `.cn.md` companion pattern to other stable docs
  when the Chinese view needs to stay easy to scan.
- Preserve code blocks, command examples, JSON fields, protocol literals, API
  names, and quoted evidence in their original language.

- `README.md` is the compact English entrypoint for models, tools, and external
  references.
- `docs/README.cn.md` is the compact Simplified Chinese entrypoint for local
  operators.
- `docs/RUNTIME_CONTRACT.md` is the runtime authority.
- `docs/LOCAL_RUNTIME.md` is command and local service guidance.
- `docs/LOCAL_LEARNING.md` is SOP, skill, and active-vault guidance.
- `docs/ACTIVE_EXPLORATION.md` is opt-in design and acceptance material for
  content/publishing/image-generation work only.
- `.trellis/spec/` and `.trellis/tasks/` are repo-local governance records, not
  runtime state or durable memory.

## Reference Stance

GenericAgent, Hermes, OpenClaw, pi, Codex, and Claude Code are reference
projects. They are not standards or compatibility targets.

The agent may borrow a pattern only when it strengthens this local contract. A
reference project never overrides the local first-version boundary.

## Capability Layers

### Core Execution

Core execution is the tool layer:

- `file.read`
- `file.write_state`
- `file.write_repo`
- `repo.search`
- `http.fetch`
- `command.run`
- `code.execute_node`

Current implementation status: the first-version core execution surface is
implemented and covered by local capability tests.

`code.execute_node` is a convenience tool for bounded JavaScript snippets. It is
not the general run capability. General run belongs to `command.run`.

### Runtime Control

Runtime control is the minimal control plane:

- context assembly
- turn snapshot
- tool contracts
- path boundary checks
- side-effect labels
- timeout limits
- output limits
- environment allowlists
- evidence events
- episode MemoryStore
- proposal-only background review
- explicit SOP draft candidate creation
- completion verification

Runtime control is first-version infrastructure. It must not grow into a broad
agent framework before core execution is reliable.

### Basic Entrypoints

The local CLI is the primary foreground entrypoint.

IM is also a first-version basic capability. Feishu is the first provider, but
the project command surface should be provider-neutral: `doctor` checks IM by
default, `im serve` starts the local foreground IM process, and `service`
manages the local resident IM process.

The CLI also exposes `capabilities` as a read-only local capability catalog.
Feishu mirrors it through `/capabilities`, `/abilities`, and `/ability`. The
catalog is a repo-owned read model over implemented core tools, harness
actions, context/read-model surfaces, memory/local-learning gates, service
runtime, entrypoints, and explicit boundaries. It must not infer capabilities
from the current model response or from transient runtime state.

The CLI also exposes `capabilities acceptance` as a read-only next-version
acceptance audit. Feishu mirrors it through `/capabilities acceptance` and
`/capabilities audit`. The audit is a repo-owned checklist over current core
execution, entrypoints, harness, context runtime, service posture, and SOP
self-evolution evidence. It lists verification commands and next feature
slices for operators, but it does not run those commands.

The CLI also exposes `governance scorecard` as a read-only self-evolution
maturity view. It tracks current core GA design, basic runtime substrate,
SOP/skill/memory loop, memory/dream direction, and multi-expert
orchestration readiness from local metadata. Its expert lenses are advisory
context only and cannot close work or grant execution authority.
The scorecard may show an active multi-expert orchestration contract, but its
next-slice reason must keep execution deferred until core/basic and
learning-persistence gates are stable.
`governance experts` exposes the corresponding read-only expert orchestration
contract. It defines advisory expert roles, scheduling boundaries, and
main-thread verification authority; it does not invoke models, spawn agents,
execute tools, mutate state, or prove completion.
`governance experts --gate <gate-id>` renders the selected gate as an advisory
delegation plan with role set, required inputs, expected output, rejection
cases, and main-runtime verification surface. It is still read-only and does
not call expert agents, schedule model work, execute recommendations, or prove
completion.
`governance record-iteration` writes one bounded self-evolution iteration
contract under local state. It records the declared capability layer, owner
surface, proposed slice, evidence refs, verification commands, non-goals, and
advisory expert roles before major work is treated as core/basic/local-learning
or application progress. `governance iterations` lists or inspects those
records. `governance record-iteration-outcome` updates an existing iteration
record with operator-supplied verification status, evidence refs, verification
commands that were run, verification claims, and next moves. Use repeated
`--verification-claim "<entrypoint>: <claim>"` values to bind required
entrypoints such as `project-design`, `scorecard`, `iterations`,
`service-health`, and `check` to the completion claim they support. It does not
run those commands or prove global completion. When the CLI is invoked with a
current state root,
record-iteration and record-iteration-outcome response packets bind their
`inspect_command` to that root so the returned inspection command is directly
executable.
When `governance iterations --iteration <id>` inspects one concrete iteration,
the CLI may add `runtime_verification_commands` by binding the current state
root and iteration id into the stored verification command templates. This is
presentation-only guidance for the current runtime; it does not mutate the
stored iteration record or prove that any verification command has run.
`governance iterations --iteration <id> --audit-seed <seed-id>` narrows one
project-design completion seed against one concrete iteration's declared and
outcome evidence. It is a read-only basic entrypoint; it must not run
verification, write outcomes, mutate state, or prove completion. Its
`seed_evidence_status` may summarize whether declared evidence, outcome
evidence, and verification command refs are present, but that status is not a
semantic proof that the seed is satisfied. Audit evidence may include
`runtime_iteration_verification_commands`, which binds the current state root
and iteration id into the stored iteration command templates for the current
CLI run only; the stored `iteration_verification_commands` remain unchanged.
`seed_evidence_status.evidence_counts` may count both stored and runtime-bound
verification command views, but those counts remain evidence presence
diagnostics, not completion proof. For the `verification_scope` seed,
`seed_evidence_status` must also respect outcome verification claim coverage, so
claim refs that omit a required entrypoint still keep the seed out of
`ready_for_manual_review`.
The audit packet's `iteration` summary keeps `source_ref` when present so GA
project-design completion review can trace the planned slice back to its source
iteration without reading the full record.
The packet also includes `plan_ref_coverage`, a read-only comparison between
the GA project-design plan `refs` and the audited iteration/source/outcome refs;
missing refs are diagnostics, not completion proof.
Its top-level `refs` list should cite the same audited surfaces: iteration ref,
source ref, iteration evidence refs, outcome evidence refs, and plan refs.
`verification_command_coverage` compares selected required commands with
runtime-bound iteration commands and outcome verification command refs; it is
declaration coverage only and must not imply execution success. For the matching
open iteration, selected commands come from the current GA project-design plan.
For a source or historical iteration, selected commands come from that audited
iteration's own runtime-bound verification commands, so later successor plans do
not move the completion-audit target.
`outcome_verification_command_coverage` compares that same selected command set
with outcome verification command refs only, so a completion audit can show
when an outcome has not recorded the commands required for the audited
iteration. It is still a coverage diagnostic, not proof that those commands
passed.
`outcome_verification_claim_coverage` compares required verification entrypoints
with outcome verification claims, so the audit can show whether each entrypoint
maps to a completion claim.
`runtime_attention_outcome_coverage` reads bounded service health during the
iteration audit. When `service-health` is a required entrypoint and current
service health has non-healthy reasons, the `service-health:` outcome
verification claim must include `status=<status>`, the current reason codes,
`classification=acceptable|repair_needed|verification_blocker`, and
`handling=<policy>`; `repair_needed` claims must also include `follow_up=...`,
`follow-up=...`, `followup=...`, or `no_follow_up=...`. This is read-only claim
coverage, not a service repair or proof of health.
`workspace_outcome_coverage` reads the bounded fixed `git status` workspace
diagnostic during the iteration audit. When the worktree is dirty, the
`workspace:` outcome verification claim must include `status=dirty` and each
reported changed path. Truncated workspace diagnostics remain blocked until the
change list is not truncated. This is read-only current-state coverage; it does
not read file bodies, stage, commit, reset, or prove completion.
`completion_gate` summarizes the structural blockers before an iteration can be
treated as ready for manual completion review: verified outcome record, outcome
evidence refs, plan ref coverage, outcome verification command coverage, and
outcome verification claim coverage, runtime attention outcome coverage, and
workspace outcome coverage. A partial or failed outcome remains blocked by
`verified_outcome`. It is a read-only gate and does not approve seeds, execute
checks, or prove completion.
`governance iterations --iteration <id> --audit-seed all` aggregates every
project-design completion seed against the same iteration evidence in one
read-only packet, including per-seed evidence status and bounded
`audit_guidance` copied from the GA project-design plan: core identity,
application boundary, verification entrypoints, and required commands before
an outcome is recorded. The guidance must name whether it applies to the
matching open iteration, the source iteration for the current plan, or only the
current plan context, so successor status is not mistaken for the audited
iteration's status. When an audited iteration is selected, guidance commands
must bind `<iteration-ref>` to that iteration id and bind `<state-root>` to the
current runtime state root; the packet's top-level `next_command` must bind the
same current state root. For open iterations, `next_command` must keep
repeatable evidence-ref, verification-command, verification-claim, and next-move
placeholders visible so the suggested writeback can satisfy the completion
gate. It must not run checks, write outcomes, mutate state, or approve
completion.

Current acceptance guidance tracks proposal-only and explicit gated slices:

- `active_exploration_publish_plan`: daily research, Xiaohongshu drafting,
  configured Image API generation, publish preflight, and external-write
  evidence planning without publishing; the local dry-run command writes state
  artifacts under `content/runs/` and may fetch bounded public source evidence
  only when `--live-sources` is explicit
- `active_exploration_daily_job`: one local date-keyed job under
  `content/daily/YYYY-MM-DD.json` or `content/daily/<track>/YYYY-MM-DD.json`
  that fetches bounded public sources, drafts Xiaohongshu copy, optionally
  generates the configured image, and optionally records preflight evidence
  without publishing externally
- `active_exploration_daily_advance`: manual promotion of an existing
  date-keyed daily job through image generation and optional read-only
  Xiaohongshu preflight while keeping `external_write=false`
- `active_exploration_daily_operator_view`: Feishu `/content` read-only status
  for daily jobs, linked content run evidence, and local next commands without
  reading draft bodies or executing any step
- `active_exploration_source_quality_gate`: per-source quality metadata and
  aggregate source-index health for live-source runs; source evidence includes
  freshness metadata and watchlist-local market hotness ranking; draft selection
  prefers usable, fresh, de-duplicated news and market evidence; weak source
  coverage can surface as a proposal-only self-evolution gap, but one
  non-critical stale source is not an active gap when fresh usable news and
  market quote coverage exists; market quote items expose both quote-specific
  freshness fields and the generic `latest_published_at`/`source_age_hours`
  aliases used by shared source-health readers
- `external_publish_evidence_contract`: typed image-generation and
  external-publish evidence records under the content run; evidence commands
  validate local image existence and require explicit external-write operator
  confirmation plus platform id, URL, or screenshot ref before a run can be
  marked `published`
- `active_exploration_adapter_execution`: explicit `xiaohongshu-mcp`
  publish execution after generated image evidence and `preflight_ok`
  readiness evidence; execution requires `--external-write --confirmed` and
  records typed external-publish evidence from platform proof
- `self_evolution_gap_intake`: evidence-backed local gap reports that map
  observed runtime shortcomings and verified iteration outcomes to bounded
  implementation or SOP-candidate slices, surface in `governance gaps` and
  Opportunity Backlog, suppress superseded older publish and source-quality gaps
  when a later equivalent content run records stronger proof, and support
  append-only decisions without mutating repository files or the active vault

The CLI exposes `workspace status` as a fixed read-only workspace diagnostic.
Feishu mirrors it through `/workspace` and `/workspace status`. This surface
may run only fixed `git status --porcelain=v1 -b` argv against the configured
repo root. It summarizes branch, upstream, ahead/behind, dirty-file counts, and
bounded path/status entries. It must not accept shell text, read file bodies,
stage, commit, reset, checkout, mutate state, invoke the model, write the repo,
or write the active vault.

The CLI also exposes `workspace runtime` as a read-only repo-local runtime
workspace diagnostic. It may scan only top-level directory names under the
configured repo root and report unsupported `.runtime-*` and `.runtime_*`
directories. The only supported repo-local runtime layout is `.runtime/state`,
`.runtime/stage`, and `.runtime/smoke/<name>`. It must not read file bodies,
move, delete, migrate, mutate state, accept shell text, invoke the model, write
the repo, or write the active vault.

### Capability Catalog Read Model

The capability catalog is a local truth source for answering what this runtime
can currently do. It is implemented in `packages/core/src/capabilities.ts` and
must derive core tools from `coreToolContracts` and harness actions from the
runtime action list so it cannot drift from the execution contract.

`capabilities` and Feishu `/capabilities` must not read auth records, API keys,
app secrets, launchd state, service logs, raw context Markdown, review/SOP/skill
bodies, or arbitrary state artifacts. They must not invoke the model, execute
tools, request confirmations, execute follow-up actions, restart services,
mutate state, write the repo, or write the active vault.

### Self-Evolution Scorecard Rules

The self-evolution scorecard is a local truth source for answering how the
runtime is progressing against its own core/basic learning standards. It is
implemented in `packages/core/src/self_evolution_scorecard.ts`.
Live context must keep the core GA design stage and the basic runtime substrate
stage visible together, so future core/basic slices are chosen from both design
progress and local runtime health. This summary is context only; it does not
prove completion.

`governance project-design` exposes the core GA project design contract from
`packages/core/src/ga_project_design.ts`. The contract defines the reusable
goal intake -> capability layering -> contract design -> execution planning ->
verification review -> learning persistence loop. It is a read-only source of
truth for project design, not a scheduler or execution engine.
The same read model also derives project-design `artifacts` from verified
self-evolution iteration outcomes. These artifacts make accumulated GA project
design lessons visible for reuse, but they do not write state, mutate memory,
draft SOPs, promote skills, or prove future completion. `artifact_count` is the
total reusable artifact count; `listed_artifact_count` is the current limited
response size. Historical iteration evidence refs must be collapsed during
successor planning so plan refs stay bounded to the current source artifact and
direct evidence.
`governance project-design --artifact <artifact-or-iteration-ref>` narrows that
view to one derived artifact by artifact id, source iteration id, source state
ref, or source filename. The packet may show whether the artifact is the source
for the current `next_core_basic_plan`; it is still read-only reuse guidance and
must not derive new artifacts, record iterations, execute tools, mutate state,
or prove completion.
If the artifact is the current plan source, the packet may include the plan's
`iteration_focus` summary so artifact-scoped review still sees the intended
core/basic direction.
That embedded `next_core_basic_plan` is the same full read-only planning packet
exposed by the project-design read model, not a narrower hand-maintained
projection, so future plan fields stay aligned across both entrypoints.
It may include plan identity and authority fields such as `schema_version`,
`action`, `status`, `title`, target ids, `layer`, `owner_surface`, `refs`, and
`boundary`, so the artifact-scoped plan keeps its versioned read-only advisory
status visible.
It may include `source_artifact_id`, `source_iteration_ref`,
`source_proposed_slice`, `planning_basis`, `next_iteration_seed`, and
`non_goals`, so source-artifact review can distinguish evidence source from
fresh successor target.
It may also include `capability_stage_plan`; this does not add execution or
completion authority.
It may include `scorecard_basis`, `selection_reasons`, `selection_checks`, and
`layer_decision`, so source-artifact review can inspect why the successor is
core GA design work instead of an external-tool application slice.
It may include `phase_gates` with their `forbidden_shortcuts`, so source-artifact
review sees the same phase-level anti-drift constraints as the full plan.
It may include `completion_audit_seeds` and `verification_commands`, so
source-artifact review sees the required completion evidence and basic runtime
checks before outcome claims.
It may include audit-seed-labeled `acceptance_criteria` for the same read-only
review target exposed by the full project-design view.
When a derived artifact belongs to `core_runtime` or `basic_entrypoint`, the
read model may expose `next_core_basic_plan`: a read-only planning packet with
phase gates, acceptance criteria, verification commands, non-goals, and a
record-iteration command template. The packet may include a read-only
`next_iteration_seed` containing the summary, layer, owner surface, proposed
slice, source ref, evidence refs, verification commands, and non-goals needed
to open the next iteration. This packet is advisory context only; it does not
execute the slice, write backlog state, or prove completion. Its
phase gates must carry their `forbidden_shortcuts`, so phase-level anti-drift
rules remain visible in the planning packet. Its
source artifact is evidence, not the next target: the plan must name a fresh
core/basic target slice and preserve the completed source slice only as
`source_proposed_slice`. It also exposes bounded `scorecard_basis` entries for
the current scorecard `next_core_basic_slice`, target dimension, target layer,
and scorecard command, plus short read-only `selection_checks` that show
whether the source artifact is verified, the successor slice is fresh, the
target layer/owner are core/basic, and the verification entrypoints are present.
Core/basic plan verification commands must include bounded resident service
health, so basic runtime state stays visible before a core design outcome is
claimed.
`selection_status` and `selection_reasons` summarize the same planning readiness
for context handoff. These fields are planning quality hints, not completion
proof.
`iteration_focus` must keep the next core/basic direction, immediate next
steps, and anti-drift checks explicit, so the runtime does not infer purpose
from an opaque successor slice id or application-tool pressure.
`capability_stage_plan` must split current core capability stages from basic
capability stages and name the next iteration plan as read-only planning
context.
Every listed stage must carry `exit_criteria` so progress is judged by evidence
standards, not intent, labels, or application-tool pressure.
The next iteration plan must use layer and audit-seed labeled steps so
core-runtime hardening, basic entrypoint verification, deferred local-learning
reuse, and completion review stay separate.
Acceptance criteria must use the same audit-seed labels so review can map each
criterion to goal scope, current state, verification scope, or learning
persistence without inference.
The basic `runtime_observability` stage may be `attention_guard`; this is a
guard role that keeps service-health attention visible and must not be treated
as a healthy service claim.
`layer_decision` makes the capability classification explicit for the next
slice: recurring GA project design is the core identity, external tools and
adapters remain application slices by default, and SOP/skill/memory/dream
promotion follows only after core/basic evidence supports reuse.
`iteration_record_status` reports whether a matching open iteration already
exists for the proposed layer, owner surface, slice, and source ref. If it
exists, `next_command` may point to the existing iteration inspection command
instead of another record command. This is duplicate-avoidance context only; it
must not write state or prove completion. When the CLI is invoked with a
current state root, `next_core_basic_plan.next_command`,
`iteration_record_status` command fields, `scorecard_basis` command entries,
and `next_iteration_seed` command fields bind that root so the surfaced
runtime commands are directly executable; unresolved `<iteration-ref>`
placeholders may remain only where no concrete iteration has been selected.
The packet also exposes `completion_audit_seeds` for goal scope, current state,
verification scope, and learning persistence. These seeds name evidence to
inspect before a completion claim; they do not execute checks or approve the
slice.
`governance project-design --audit-seed <seed-id>` returns one seed as a small
read-only packet with plan and source refs. It is a basic entrypoint for
completion review only; it must not execute audits, write outcomes, mutate
state, or prove completion.
`governance record-iteration --from-project-design-plan` copies the current
read-only `next_iteration_seed` into one self-evolution iteration contract. It
is a bounded local state write only. If the same layer, owner surface, proposed
slice, and source ref already have an open iteration, it must return that
existing record instead of writing a duplicate. It must not execute the planned
slice, run verification commands, mutate repo files, promote learning
artifacts, or prove completion.

Required policy:

- GA project design must keep the original operator objective intact while
  deriving concrete success criteria and evidence requirements
- dimensions must distinguish core runtime, basic entrypoint, local learning,
  and orchestration readiness
- scorecard output must include structure sufficient to choose a next bounded
  slice without treating application-tool pressure as core identity
- application adapters and external tools may appear only as evidence pressure,
  not as core capability identity
- major self-evolution work should have a self-evolution iteration contract
  declaring the capability layer, owner surface, proposed slice, verification
  commands, and non-goals
- completed self-evolution work should record an iteration outcome with
  verification status, cited evidence, commands run, and next moves before it
  drives the next scorecard slice
- verified iteration outcomes with outcome evidence refs and verification
  commands may appear as derived project-design artifacts inside `governance
  project-design`; artifacts are reuse guidance only
- `governance project-design --artifact <artifact-or-iteration-ref>` may inspect
  exactly one derived artifact as reuse evidence, without deriving new artifacts
  or granting completion authority
- `next_core_basic_plan` must not copy the source artifact's completed
  `proposed_slice` as the next work target; it must use the artifact as
  evidence for selecting a fresh core/basic slice
- `next_core_basic_plan.goal_scope` must restate the operator objective,
  owner surface, source of truth, and success evidence before the next slice is
  reused; it is read-only orientation, not execution authority or completion
  proof
- The `goal_scope` completion audit seed must require that structured
  `goal_scope` evidence and reject outcomes whose success evidence does not
  distinguish the completed source slice from the successor slice
- `next_core_basic_plan.scorecard_basis` must keep the scorecard
  `next_core_basic_slice`, target dimension, target layer, and scorecard command
  visible as read-only planning evidence
- `next_core_basic_plan.selection_checks` must remain bounded strings derived
  from the same read-only metadata, including source artifact evidence and
  verification-command counts, and must not execute verification
- `next_core_basic_plan.selection_checks` may include bounded
  `source_artifact_warning` entries when evidence refs or verification commands
  are too thin; these warnings are plan-quality hints only and must not execute
  verification or prove failure
- `next_core_basic_plan.selection_checks` must keep the
  `source_artifact_warning_thresholds` visible beside source artifact counts, so
  threshold tuning does not require reading source code
- The compact GA Project Design Plan context must preserve that threshold check
  beside the source verification and count checks using stable check-prefix
  priority rather than raw array position
- The compact GA Project Design Plan context must also surface the
  `fresh_successor_slice` check separately, so repeated completed slices are
  visible during handoff
- The compact GA Project Design Plan context must also surface the
  `target_layer` and `owner_surface` check separately, so application slices are
  not mistaken for core GA design work during handoff
- When a matching open iteration exists, the compact GA Project Design Plan
  context may surface a bounded `review_gate` line with the missing outcome
  record, outcome verification command coverage, outcome verification claim
  coverage, and required verification entrypoints; this is handoff guidance, not
  the authoritative completion audit
- The same compact context may surface a bounded `after_verify` outcome-record
  command template for the matching open iteration; it is only used after the
  required verification commands have run, must keep repeatable evidence-ref and
  verification-command and verification-claim placeholders plus a next-move
  placeholder visible, and does not replace audit review
- The compact context may also render bounded `evidence_basis` refs from the
  plan so outcome writeback can cite concrete refs without dumping full
  artifacts; these refs are candidates, not completion proof
- When `evidence_basis` appears for a matching open iteration, compact context
  may also render `proof_boundary`; it must keep the requirement for a verified
  outcome, outcome evidence refs, plan ref coverage, and outcome verification
  command coverage explicit
- Compact `acceptance` must preserve at least one criterion for each audit-seed
  label (`goal_scope`, `current_state`, `verification_scope`, and
  `learning_persistence`) using stable prefix priority rather than raw array
  position
- `next_core_basic_plan.verification_commands` and
  `next_iteration_seed.verification_commands` must stay aligned as the same
  slice-scoped command list, including bounded service health for the resident
  IM target before `pnpm run check`
- Compact `verify_commands` may render a short identity summary of that command
  list, including the project-design artifact id, matching iteration id, service
  health target, and broad check; it is handoff guidance only and does not
  replace outcome verification command refs
- `next_core_basic_plan.selection_status` and `selection_reasons` must describe
  plan readiness only; they must not claim execution or completion
- `next_core_basic_plan.selection_reasons` must include
  `source_artifact_quality=ok|attention` derived from source artifact warnings,
  without turning advisory warnings into completion gates
- The compact GA Project Design Plan context must preserve `source_status` and
  `source_artifact_quality` using stable reason-prefix priority rather than raw
  array position
- Compact `source_truth` must preserve the source artifact id, source iteration
  ref, completed source slice, target successor slice, source status, source
  quality, and fresh-successor flag in one bounded handoff line; it is source
  orientation only and does not prove completion
- `next_core_basic_plan.iteration_focus` must explain the next core/basic
  direction and anti-drift checks without authorizing execution
- Compact GA Project Design Plan context must preserve bounded anti-drift checks
  from `iteration_focus`, so external-adapter pressure, premature SOP/skill/
  memory/dream promotion, and unverified completion claims stay visible during
  handoff
- Compact `non_goals` must preserve the critical local-learning and application
  boundaries from the plan, including no SOP/skill/memory/dream promotion, no
  external-tool execution, and no completion proof without executed
  verification; this is handoff guidance only, not an audit runner
- Compact `layer_guard` must preserve the layer-decision stage plus source and
  selected layer/owner continuity, so core/basic successor handoff does not rely
  on a target slice id alone
- Compact `phase_forbid` must preserve one forbidden shortcut for every phase
  gate, rather than only the capability-layering adapter boundary
- `next_core_basic_plan.capability_stage_plan` must list core capability stages,
  basic capability stages, and the next iteration plan without scheduling work
- Compact `runtime_guard` may preserve the `runtime_observability`
  `attention_guard` current state, next iteration, and outcome naming exit
  criterion, so runtime attention reasons are not hidden behind application
  progress; it does not prove resident service health
- The `current_state` completion audit seed must require service-health status
  and reasons when resident runtime behavior changed, and must reject verified
  outcomes that omit runtime attention reasons while service health is not
  healthy
- When service health is in the required verification command list, the
  `current_state` completion audit seed must require the outcome to cite
  service-health status and reasons even for read-only GA design slices
- When service health is not healthy, the `current_state` completion audit seed
  must require runtime attention to be classified as `acceptable`,
  `repair_needed`, or `verification_blocker`; naming the reason without a
  classification is not sufficient
- Classified runtime attention must also name a handling policy: why
  `acceptable` is safe for the claim, what `repair_needed` follows up, or why
  `verification_blocker` stops the verified outcome
- A `repair_needed` handling policy must name a follow-up action or explain why
  no follow-up is required; classification alone does not make the attention
  item traceable
- The `verification_scope` completion audit seed must require the outcome to
  explain which completion claim each verification command supports; a command
  list without claim coverage is not sufficient verification evidence
- The same seed must require every required verification entrypoint to map to a
  completion claim, and reject outcomes that omit an entrypoint from claim
  coverage
- `capability_stage_plan.next_iteration_plan` must keep layer and audit-seed
  labeled steps so core/basic work is not confused with deferred local-learning
  reuse or completion review
- `next_core_basic_plan.acceptance_criteria` must keep audit-seed labels that
  match the completion audit seed vocabulary
- Compact `audit_require` must preserve the requirement for every completion
  audit seed, so seed ids are not mistaken for sufficient review evidence
- Compact `audit_evidence` must preserve one evidence-needed item for every
  completion audit seed, so handoff shows what a later outcome must cite
  without replacing the authoritative audit
- For `current_state`, compact `audit_evidence` should prefer the service-health
  status/reasons item when service health is a required verification command
- For `verification_scope`, compact `audit_evidence` should prefer the
  required verification-entrypoint claim-coverage evidence when present
- Compact `audit_reject` must preserve one reject condition for every
  completion audit seed, so false-completion failure modes stay visible during
  handoff without replacing the authoritative iteration audit
- For `current_state`, compact `audit_reject` should prefer the service-health
  missing-status/reasons reject when service health is a required verification
  command
- For `verification_scope`, compact `audit_reject` should prefer the required
  verification-entrypoint claim-coverage reject when present, so handoff keeps
  the strongest missing-entrypoint failure visible
- Compact `acceptance` must keep one criterion for every audit-seed label plus
  the fresh-successor and external-adapter boundary criteria, so core GA design
  handoff cannot hide copied slices or application-slice drift
- every `capability_stage_plan` stage must include exit criteria without
  granting automatic approval
- Compact `stage_exit` must preserve one exit criterion for every listed core
  and basic capability stage, rather than only the currently hardened stage
- `runtime_observability:attention_guard` must keep service-health attention
  visible rather than claiming resident runtime health
- `next_core_basic_plan.next_iteration_seed` may feed
  `governance record-iteration --from-project-design-plan`, but the seed itself
  must remain read-only
- `governance record-iteration --from-project-design-plan` may write one
  iteration contract from the current seed, or reuse a matching open iteration,
  without executing or verifying the planned slice
- `next_core_basic_plan.completion_audit_seeds` must preserve goal scope,
  current-state evidence, verification scope, and learning-persistence checks
  as advisory requirements only
- `governance project-design --audit-seed <seed-id>` may narrow inspection to
  one seed, but it must remain read-only and advisory
- `governance iterations --iteration <id> --audit-seed all` may aggregate every
  completion audit seed for one iteration, but it must remain read-only and
  advisory
- expert lenses are advisory review perspectives, not autonomous expert agents
- multi-expert orchestration is a later scheduling layer after core/basic
  stability and learning-persistence gates, not a current peer of core/basic
  iteration work
- expert orchestration contracts must keep scheduling advisory and completion
  authority in the main runtime
- expert delegation gates must define trigger, required inputs, expected
  output, rejection cases, and main-runtime completion authority before advice
  can influence a slice
- selected expert delegation plans may format one gate into a review packet,
  but they must remain read-only advisory context
- scorecard output may guide the next iteration but does not prove completion
- scorecard `next_slices` are read-only prioritization hints derived from
  dimension stage, score, and layer; they must not execute or mutate backlog
- active dream-backed low-maturity dimensions may enter `governance gaps` as
  proposal-only self-evolution gaps using existing Opportunity Backlog and SOP
  gates; resolved contract gaps must be suppressed by capability presence
- verified self-evolution iteration outcomes may enter `governance gaps` as
  SOP-candidate items when no state-only SOP draft cites the iteration yet; they
  must still pass through review tick, draft-sop, audit-sop, and promote-sop
  gates before any active-vault skill write

Forbidden behavior:

- no model invocation, tool execution, service restart, state mutation, SOP
  promotion, skill promotion, repo writes, active-vault writes, or completion
  proof
- project-design output must not create projects, spawn experts, execute
  external adapters, mutate memory, or prove completion
- expert delegation gates must not spawn agents, schedule model calls, execute
  recommendations, restart services, write memory, or approve completion
- expert delegation plans must not call expert agents, execute the selected
  advice, mutate state, or bypass the gate rejection rules
- iteration contracts and outcomes do not execute work or prove more than their
  cited evidence supports

### Capability Acceptance Audit Rules

The capability acceptance audit is a local read model for deciding whether the
current runtime is ready for the next feature slice. It is implemented from the
repo-owned acceptance definition in `packages/core/src/capabilities.ts`.

Required policy:

- the audit groups acceptance evidence by core execution, basic entrypoints,
  agent harness, context runtime, and SOP self-evolution
- each gate lists source refs, verification commands, and boundaries
- the audit may list next candidate slices, but those slices are planning
  guidance only
- CLI `capabilities acceptance` and Feishu `/capabilities acceptance` render
  the same acceptance baseline

Forbidden behavior:

- no test execution, shell command execution, model invocation, service
  restart, launchd inspection, or Feishu mutation
- no auth record, API key, app secret, service log, raw context Markdown,
  review/SOP/skill body, or arbitrary state artifact reads
- no state, repository, or active-vault writes

### Local Auth Records

Model and Feishu credentials are resolved from local JSONL auth records. The
machine-local source of truth is `<LOCAL_RUNTIME_HOME>/config/auth.jsonl`; repository
`config/auth.jsonl` is a blank template. Direct secret fields and explicit
env-backed fields are the only supported forms; direct fields win when both are
present:

```jsonl
{"type":"api_key","id":"cpa","key":"..."}
{"type":"app_secret","id":"feishu-main","app_id":"...","app_secret":"..."}
```

An auth record may explicitly name an env variable through `env`,
`app_id_env`, or `app_secret_env`; there is no implicit `API_KEY`,
`FEISHU_APP_ID`, or `FEISHU_APP_SECRET` fallback. Runtime config summaries,
context config summaries, Feishu `/config`, and capability catalog reads must
not read `auth.jsonl` or render secret values. `doctor`, `live`, `pipeline`,
foreground IM, and resident service validation may resolve the active auth
records because they need real local credentials to run.

`doctor` may also render non-secret auth source diagnostics for those active
records: auth id, source ref, direct/env/missing mode, env name, and whether an
explicitly named env value is present. It must never render the direct secret
field, API key, app id, app secret, or env value.

### Local Service Runtime

Local service runtime is a resident mode for one user on this machine. It may:

- install a macOS `launchd` job
- sync a built runtime snapshot under `LOCAL_RUNTIME_HOME`
- write copied-runtime build metadata under `LOCAL_RUNTIME_HOME`
- write stdout and stderr logs under `LOCAL_RUNTIME_HOME`
- write heartbeat state under the configured state root
- optionally run a configured review tick loop
- optionally run a configured daily active-exploration content loop
- surface active autonomy pause signals as read-only status
- restart after local development changes

When `--state-root` is omitted, service lifecycle and service health commands
use `<LOCAL_RUNTIME_HOME>/state/runtime` as the service-scoped state root. Explicit
`--state-root` still overrides that default. This rule is limited to the
resident service harness and does not change ordinary interactive runtime state
selection for live, pipeline, memory, context, or review commands.

Local service runtime must not introduce hosted service design, multi-user
queues, remote deployment, cross-machine state, or production daemon
governance.

### Local Learning

SOP and skill promotion are local learning experiments. They operate on local
state and the local active vault only.

Local learning must not drive compatibility, sharing, marketplace, or
multi-machine design in the first version.

## Runtime Objects

### Turn Snapshot

A turn snapshot is the immutable input to one model call:

```yaml
id: turn_...
session_id: session_...
accepted_goal: string
context_refs: []
selected_skill_refs: []
working_checkpoint_ref: string | null
available_tools: []
expected_output_schema: ModelActionEnvelope
created_at: iso8601
```

Runtime changes apply to later snapshots, not the in-flight call.

### Context Bundle

The context bundle is the prompt-facing view of the snapshot. First version
includes only:

1. accepted task
2. selected project docs
3. query/todo files when discipline mode is active
4. bounded task references from the accepted goal
5. optional bounded attention plan when prior pressure, model budget, or a
   working checkpoint exists
6. bounded accepted semantic memory
7. bounded background review history
8. bounded workspace status
9. bounded pipeline history
10. bounded governance queue visibility
11. bounded governance outcome visibility
12. bounded episode-memory recall
13. bounded daily episode archive summaries
14. selected local skills with recall metadata and bounded instructions
15. current working checkpoint
16. bounded local capability catalog
17. allowed tool contract
18. output schema

The context bundle must not dump all docs, all sessions, all skills, or all
future roadmap material.

When rendered, `Attention Plan` is a short read-only routing hint over the
accepted goal, non-secret model context budget, latest context-pressure
manifest metadata, and current working checkpoint metadata. It must not read
raw context Markdown, raw skill/SOP/review artifacts, compact context, invoke
tools, authorize mutation, or appear when no attention signal exists.
When rendered, `GA Project Design Plan` must keep the verification entrypoint
summary visible when present, including `service-health` for core/basic plans,
without rendering full artifacts or executing the checks.

When rendered, `GA Project Design Plan` is a short read-only context section
over `governance project-design.next_core_basic_plan`. It may show the plan id,
target layer, owner surface, proposed slice, source artifact, acceptance
summary, planning basis, iteration focus, capability-stage summary, phase
forbidden-shortcut summary, layer-decision summary, selection-check summary,
`iteration_record_status`, and the current next command. The planning basis names the verified artifact and
completed source slice so the next model turn does not infer purpose from an
opaque slice id alone. A compact `anti_drift` line may preserve the bounded
checks that keep external-adapter pressure, premature SOP/skill/memory/dream
promotion, and unverified completion claims visible during handoff. The
layer-decision summary keeps recurring GA project design as the core identity
and keeps external tools or adapters as application slices unless they name a
reusable runtime contract. A compact `layer_guard` line may keep the
layer-decision stage plus source and selected layer/owner continuity visible
without proving completion. When a matching open
iteration exists, the next command may be the existing iteration inspection
command rather than the record-iteration command, and the section may show the
matching `--audit-seed all` audit command as operator guidance. It may also show
a compact `review_gate` line when the matching open iteration still lacks an
outcome record, outcome verification command coverage, and outcome verification
claim coverage. The line may include the required verification entrypoints from
the plan, while the full `governance iterations --audit-seed all` packet remains
the authoritative completion-audit view. The section may also include
`after_verify` with a bounded
`record-iteration-outcome` template for the matching open iteration, but only as
post-verification writeback guidance. The template must keep repeatable
evidence-ref, verification-command, and verification-claim placeholders, plus a
next-move placeholder, visible so an outcome record is not mistaken for
completion evidence by itself or a terminal stop. The section may also include a
short `evidence_basis` line from the plan refs; it is citation guidance only and
does not read or prove those refs. When present, `proof_boundary` keeps that same
  distinction explicit by requiring a verified outcome with outcome evidence refs
  and outcome verification command coverage. The source artifact is
only the evidence basis; the
rendered proposed slice must not be a blind repeat of a completed source slice.
The audit-seed summary should name goal scope, current state, verification
scope, and learning persistence so completion review does not skip verification
or outcome reuse evidence. A compact `audit_require` line should preserve the
requirement for each seed, so a seed id is not mistaken for enough completion
review evidence. A compact `audit_reject` line should preserve one reject
condition for each seed, so copied success criteria, stale memory, narrow
verification, and premature SOP/skill/memory/dream promotion stay visible as
failure cases. The compact `acceptance` line should keep one
criterion for each of those audit-seed labels, plus the fresh-successor and
external-adapter boundary criteria, so repeated `goal_scope` or `current_state`
criteria cannot hide copied slices, application-slice drift, verification-scope,
or learning-persistence review. The compact `stage_exit` line should keep one exit criterion for every
listed core and basic capability stage, so capability-stage labels are not
mistaken for progress without their evidence standard. The compact
`phase_forbid` line should keep one forbidden shortcut for each phase gate, so
goal intake, contract design, execution planning, verification review, and
learning persistence do not disappear behind the adapter-boundary warning. The selection checks are
quality hints only. It must not dump full
project-design artifacts, record iterations, execute commands, schedule
experts, write state, or prove completion.

Verified iteration outcomes from `core_runtime` or `basic_entrypoint` remain
visible as self-evolution follow-ups, but Opportunity Backlog ranks their SOP
candidate review behind real local-learning SOP work. The canonical next move
for those layers is the GA project-design plan, not immediate SOP churn.

The `Workspace Status` context section uses the same fixed
`workspace status` read model. It is pre-write orientation only: it may show
branch, upstream, ahead/behind, dirty counts, and bounded changed paths, but it
must not read file bodies, stage, commit, reset, checkout, mutate state, invoke
the model, write the repo, or write the active vault. Clean workspace status
does not prove current repo edits are deployed into the resident service.

Every live context bundle must have a JSON manifest sidecar. The manifest
records section names, character counts, selected refs, recall counts, skill
counts, and whether query/todo discipline was active. It is harness evidence
for context assembly, not a telemetry backend or a UI context explorer.

The `context list` and `context show` commands may read these manifest
sidecars. They must not read raw context Markdown unless the operator uses a
normal file read path, and they must not create or modify runtime state.

### Task Reference Context

Accepted goals may include bounded local task references:

```text
@file:docs/RUNTIME_CONTRACT.md
@file:docs/RUNTIME_CONTRACT.md:120-160
@file:"docs/release notes.md":1-20
@folder:docs
```

The context builder may render a `Task References` section for those refs.
This is a local context assembly feature, not a general attachment system.

Required policy:

- supports only repo-local `@file:` and `@folder:` refs
- file refs may include an optional line range
- folder refs list bounded repo file paths only; they do not read file bodies
- selected refs appear in the context manifest section refs
- no absolute paths, parent traversal, home files, state files, URL fetches,
  git diff/log expansion, shell commands, model calls, writes, or active-vault
  mutation
- task references are input context only and must not be treated as proof of
  completion

### Model Action Envelope

The model returns proposed actions:

```yaml
summary: string
actions:
  - type: respond | use_tool | delegate_agent | update_working_state | record_evidence | propose_sop | propose_memory | request_audit | pause_autonomy
    id: action_...
    rationale: string
    payload: {}
completion_claim:
  status: not_done | done | blocked
  verification_refs: []
```

The model proposes. The harness decides what runs and what counts as complete.

`delegate_agent` is a bounded structured self-report path. The delegated model
has no tools or memory in the current runtime and must return a JSON object
with non-empty `summary` and `findings_text`. The harness validates that
contract before returning the result as a `Delegated Observations` item. Invalid
or malformed delegated output is recorded as `ok=false`, and a later `done`
claim fails completion verification when any delegated result failed. Delegated
results are not tool evidence, final success proof, mutation authority, or a
second autonomous agent runtime.

Every live run writes a harness-owned completion verification report beside the
episode context and model artifacts:

```text
memory/episodes/<session>-completion-verification.json
memory/episodes/<session>-completion-verification.md
```

The report records the model `completion_claim`, final response ref, claimed
verification refs, selected observation refs, and per-check pass/fail/warning
status. A `done` claim fails verification when required final response or
write/run/delegation evidence is missing or failed. `not_done` and `blocked`
claims are recorded as skipped completion verification, not as completed work.
Later context may summarize recent reports, but must not read the referenced
raw response/tool artifacts or treat prior verification as proof for the current
task.
When model cognition fails before a valid action envelope exists, the harness
writes `memory/episodes/<session>-model-diagnostic-r<round>.json` and appends a
`model_diagnostic` evidence event. The diagnostic records only failure stage,
failure kind, sanitized previews, model/config metadata, context refs, response
ref when one exists, and input size metadata. It is observability for operators
and later SOP/backlog work; it is not retry authority, failover policy, or
completion proof.
Failed or skipped reports also appear as read-only `completion_verification`
items in the Opportunity Backlog. Passed reports are suppressed. The backlog
item and any review tick focus may include only structured report fields such
as status, summary, failed check ids, and refs; it must not read or embed raw
response, tool result, or delegation artifacts.
Operators may inspect recent completion verification reports through a
read-only history model. `review completions` lists structured JSON report
summaries from `memory/episodes/*-completion-verification.json`; `review
completions --completion <ref-or-id>` inspects one structured report. Feishu
`/review completions` and `/review completion <ref-or-id>` expose the same
bounded data. These commands must not run review, run review tick, read
completion Markdown, read raw final responses, read tool/delegation artifacts,
request confirmations, execute follow-ups, invoke the model, mutate state,
write the repo, or write the active vault.

Operators may also inspect the bounded live run trace read model through
`review traces` and `review traces --trace <ref-or-id>`, or through Feishu
`/review traces` and `/review trace <ref-or-id>`. This uses the same trace
summaries as context: completion report refs, completion ids, session/turn ids,
context refs, event kind counts, observation counts, per-round action counts,
harness state-action counts, model diagnostic failure kind/stage/refs,
repo-write workspace guard summaries from bounded tool-result event summaries,
and envelope refs. It must not read raw model responses, action payloads, tool
result bodies, final response Markdown, context Markdown, or harness artifact
bodies, and it must not rerun actions, invoke the model, request confirmations,
execute follow-ups, mutate state, write the repo, or write the active vault.

Operators may turn one bounded live run trace into a state-only harness replay
audit with `review replay-audit --trace <ref-or-id>`. If no trace is selected,
the command chooses the latest bounded live run trace. The command writes
`governance/replays/<id>.json`, `governance/replays/<id>.md`, and one
`audit_result` evidence event that cites the replay report and source trace.
The audit records only replay metadata: source trace refs, completion/session/
turn ids, counts, check statuses, report refs, and the fixed replay boundary.
It must not invoke the model, execute tools, rerun actions, read raw model
responses, read raw action payloads, read raw tool/delegation bodies, read raw
final responses, read context Markdown, write the repo, write the active vault,
manage services, or mutate SOP/skill/semantic-memory artifacts.

Operators may inspect replay audit history with `review replays` and
`review replays --replay <ref-or-id>`. Feishu mirrors this read-only surface
through `/review replays` and `/review replay <ref-or-id>`. Context and
aggregate governance status may render bounded replay summaries and latest refs
only. These read models must not rerun traces, invoke the model, execute tools,
write state, write the repo, or write the active vault.

`record_evidence` and `update_working_state` are implemented as state-only
harness actions. `record_evidence` writes a bounded Markdown note under
`memory/episodes/` and appends a `report` evidence event. `update_working_state`
writes a structured checkpoint under `memory/working/` and appends a `report`
evidence event. Their results are returned to the next model round as harness
state observations when another round is needed. Later context snapshots select
the latest bounded working checkpoint, preferring `memory/working/current.json`.

These actions must not write repository files, write the active vault, publish
externally, execute shell commands, request confirmations, audit, promote, or
make a `done` completion claim verified by themselves.

Working checkpoint status is a read-only operator read model over
`memory/working/*.json`. `memory working`, `memory working --checkpoint
<ref-or-id>`, Feishu `/working`, Feishu `/working <ref-or-id>`, and aggregate
governance status may render checkpoint goal, current step, next action,
counts, bounded open questions, recent evidence refs, and episode event refs
that cite the checkpoint. These surfaces must not read referenced evidence
artifacts, execute the next action, resume a goal loop, run review tick, invoke
the model, mutate memory/SOP/skill state, write the active vault, write the
repo, or run shell commands.
Aggregate governance status treats current checkpoints without open questions
or blocked, failed, unfinished, resume, stale, or gap signals as status history
only, so ordinary quiet save points do not ask the operator to resume stale
work.

`propose_sop` has two runtime paths. When the envelope has
`completion_claim.status=not_done`, it is a state-only harness action. The
harness writes `sop/drafts/*.json` and `sop/drafts/*.md` under the selected
state root, appends a `report` evidence event, and returns the draft refs to the
next model round as Harness State Observations. This path does not audit,
promote, write skills, write the repository, or write the active vault.

When a final verified envelope uses `respond + propose_sop` with
`completion_claim.status=done`, the existing completion-time SOP audit and
promotion path applies.

`propose_memory` and `request_audit` are implemented as state-only governance
actions. `propose_memory` writes a candidate under
`memory/semantic/candidates/` and appends a `report` evidence event.
`request_audit` writes a requested audit artifact under `governance/audits/`
and appends a `report` evidence event. Their results are returned to the next
model round as harness state observations when another round is needed.
The explicit CLI form, `memory propose-candidate`, uses the same state-only
boundary: it writes a memory candidate plus evidence, but does not accept the
candidate into durable semantic memory.

These actions must not update durable memory, edit core files, mutate SOP
status, write skills, write the active vault, execute confirmations, run
commands, publish externally, or make a `done` completion claim verified by
themselves.

`memory candidates` is a read-only governance view over
`memory/semantic/candidates/*.json`. It may list candidate summaries or inspect
one candidate by stable ref or candidate id. It must not rebuild MemoryStore
indexes, update durable memory, request confirmations, draft, audit, promote,
revise skills, write the active vault, or invoke the model.

`memory accepted` is a read-only governance view over
`memory/semantic/accepted/*.json`. It may list accepted semantic memory
summaries or inspect one accepted record by stable ref or semantic memory id. It
must not accept candidates, request confirmations, rebuild MemoryStore indexes,
write state, write the active vault, or invoke the model.

`memory layers` is a read-only memory and local-learning layer diagnostic. It
may report counts, state refs, context roles, attention signals, and next
inspection commands for episode recall, accepted semantic memory, memory
governance queue, dream snapshots, working checkpoints, episode archives, and
selected-skill outcomes. It must not rebuild MemoryStore indexes, read raw episode artifacts,
render semantic memory or candidate content, write state, write the active
vault, execute confirmations, run shell commands, or invoke the model.

`memory dream` writes a deterministic long-horizon dream snapshot under
`memory/dreams/` from accepted semantic memory, recent self-evolution iteration
contracts, the latest verified iteration outcome, bounded capability catalog
metadata, and current Opportunity Backlog pressure. `memory dreams` lists or
inspects those snapshots. Dream snapshots are planning context only: their
`latest_iteration_outcome` field preserves verification context, but they do
not execute backlog work, call models, publish externally, promote SOPs, write
skills, write the active vault, or prove completion.

`memory archives` is a read-only view over `memory/archives/*.json`. It may
list daily episode archive summaries or inspect one archive by date or state
ref. It must not generate archive files, rebuild MemoryStore indexes, read raw
episode artifacts, write durable memory, write state, write the active vault,
or invoke the model. `memory archive` remains the explicit CLI command that
scans `memory/episodes/events.jsonl` and writes daily archive summaries.

`memory archive-health` is a read-only archive readiness view. It may compare
`memory/episodes/events.jsonl` row metadata with `memory/archives/*.json`
summary metadata and report missing, stale, invalid, or orphan summaries. It
must not read raw episode artifacts, generate archive files, rebuild
MemoryStore indexes, write state, write the active vault, or invoke the model.
Any repair remains an explicit operator action through `memory archive` or an
external state correction.

`memory confirmations` is a read-only governance view over
`memory/semantic/confirmations/*.json`. It may list memory candidate
confirmation summaries or inspect one confirmation by stable ref or confirmation
id. It must not request confirmations, execute confirmations, accept candidates,
rebuild MemoryStore indexes, write state, write the active vault, or invoke the
model.

`memory request-candidate-confirmation` and
`memory execute-candidate-confirmation` are the explicit gate for accepting one
candidate into local semantic memory. The request command writes a pending
confirmation under `memory/semantic/confirmations/`, marks the candidate as
`confirmation_requested`, and appends evidence. The execute command requires a
pending confirmation, re-reads the linked candidate, writes accepted semantic
memory under `memory/semantic/accepted/`, marks the candidate as `accepted`,
marks the confirmation as `executed`, and appends evidence. This path writes
only local state. It must not rebuild MemoryStore indexes, write repository
files, write the active vault, revise skills, run shell commands, invoke the
model, or publish externally.

`pause_autonomy` is implemented as a state-only stop signal. It writes a stable
`autonomy/runs/pause_signal.json`, a per-run pause request under
`autonomy/runs/`, and a `report` evidence event. Later context assembly reads
the stable signal and sets `task_context.stop_signal_active=true`.

This action must not stop the current explicit task, stop the resident service,
disable the IM channel, edit runtime config, execute confirmations, run
commands, publish externally, or make a `done` completion claim verified by
itself.

`governance resume-autonomy` is the explicit operator gate for clearing an
active autonomy pause. It requires a non-empty reason, reads the stable pause
signal, rejects missing or non-active signals, marks
`autonomy/runs/pause_signal.json` as `inactive`, writes a resume artifact under
`autonomy/runs/`, and appends a `report` evidence event. This command must not
run review tick, invoke the model, execute confirmations, request
confirmations, write the active vault, or mutate SOP/skill/memory state.

### Evidence Event

Every meaningful runtime action should leave append-only evidence:

```yaml
id: evidence_...
session_id: session_...
turn_id: turn_...
kind: prompt | model_action | tool_result | delegated_result | file_diff | test_result | report | user_correction | audit_result | skill_usage | channel_event
summary: string
artifact_refs: []
created_at: iso8601
```

Evidence is the base for verification and optional local learning.

When a selected local skill is injected into live context, the runner writes
post-run `skill_usage` evidence after completion verification and final verdict
selection. The active-vault registry keeps aggregate usage counters only. The
per-run outcome belongs under `memory/skills/usage/` and includes skill ref,
context refs, completion status, verification status, final verdict, completion
report ref, final response ref, and registry update status. This artifact
records that the skill was selected and what the harness observed; it is not
causal proof that the skill made the run succeed. Operator history views may
list and inspect this JSON metadata, but must not read the raw selected skill
body, context Markdown, final response, or completion Markdown.

Skill recall may use recent selected-skill outcome summaries as bounded ranking
signals. Verified passed outcomes can add a small capped score bonus. Failed,
skipped, blocked, unfinished, or unverified outcomes can apply a capped score
penalty. This feedback changes only recall ordering and optional selection; it
must not revise skills, retire skills, rewrite registry metadata, confirm
governance actions, or read raw selected skill bodies, raw context Markdown,
final responses, completion Markdown, model prompts, or tool results. Context
may render only the final score, base score, aggregate quality counts,
adjustment, and latest outcome ref before the selected `SKILL.md` body.

## Tool Contracts

### `file.read`

Reads text from repo or state scope by relative path.

Required policy:

- reject absolute paths
- reject `..`
- enforce max chars
- side effect: `none`

### `file.write_state`

Writes runtime artifacts under the selected state root.

Required policy:

- reject absolute paths
- reject `..`
- write only under state root
- side effect: `local_write`

### `file.write_repo`

Writes repository files under repo root.

Required policy:

- reject absolute paths
- reject `..`
- block `.git/`, `node_modules/`, secrets, generated dependency folders, and
  configured protected paths
- capture bounded fixed `workspace status` snapshots before and after the write
- include only status, branch, ahead/behind, dirty counts, and bounded changed
  path/status entries in the tool result
- record evidence for every write
- side effect: `local_write`

The workspace guard is evidence only. It must not read file bodies, block an
otherwise valid write because the workspace is dirty, stage, commit, reset,
checkout, clean, invoke the model, write separate guard state artifacts, or
roll back a write.

### `repo.search`

Searches repository text.

Required policy:

- use `rg` when available
- cap result count and output chars
- allow include/exclude globs
- side effect: `none`

### `http.fetch`

Fetches HTTP(S) content.

Required policy:

- require `http://` or `https://`
- cap response size
- record status and URL
- side effect: `none`

### `command.run`

Runs bounded local commands.

Required policy:

- explicit cwd: repo root or state root
- timeout
- max output chars
- environment allowlist
- side-effect label declared before execution
- command and exit code recorded as evidence

`command.run` is how the agent should run `pnpm run check`, `rg`, `git diff
--check`, and local scripts.

### `code.execute_node`

Runs bounded JavaScript snippets in the state root.

Required policy:

- timeout
- max output chars
- state-root cwd
- side effect: `local_reversible`

This remains useful for small transformations, but it should not replace
`command.run`.

## Harness Rules

The first-version harness validates:

- action type is allowed
- tool is known
- path stays inside its allowed root
- requested side effect is declared
- timeout and output limits exist
- state writes and repo writes are recorded
- completion has evidence when the task requires verification
- completion verification is persisted as a JSON/Markdown sidecar

No complex plugin permission framework is required in the first version.

## Context Rules

The first-version context layer selects only what the run needs:

- current task
- local project docs
- query/todo discipline files
- bounded episode-memory recall from the local MemoryStore
- bounded daily episode archive summaries from `memory/archives/`
- bounded recent completion verification report summaries
- bounded recent live run trace summaries from completion reports, model action
  envelope metadata, and episode event metadata
- bounded harness replay audit summaries from `governance/replays/`
- read-only resident service runtime status from `services/im/heartbeat.json`
- accepted local semantic memory from `memory/semantic/accepted/`
- pending governance queue summaries from memory candidates, memory
  confirmations, review inbox, review follow-up confirmations, and active
  autonomy pause state
- executed governance outcome summaries from memory confirmations and review
  follow-up confirmations
- bounded pipeline history summaries from StageRunner checkpoint and stage run
  metadata
- selected local skills with recall score/source/metadata refs before the
  bounded `SKILL.md` instructions
- post-run selected-skill usage outcomes from `skill_usage` evidence events and
  `memory/skills/usage/` artifacts
- SOP and skill evolution ledger summaries from state SOP drafts, audits,
  review follow-up confirmations, episode event refs, and active-vault skill
  registry events
- background review SOP chain summaries that consume the same lifecycle refs
  as the SOP evolution ledger instead of widening ownership through cited
  evidence refs
- selected local skills
- tool contracts
- working checkpoint

The live runner writes `memory/episodes/<session>-context.md` and
`memory/episodes/<session>-context.json`. The Markdown file is the model-facing
context. The JSON file is the context manifest and must stay small, structured,
and evidence-oriented.

Episode recall must inject summaries and refs only. It reads the append-only
episode event log through a bounded local scan so service hot paths do not
rebuild the SQLite index. It must not dump raw session artifacts or entire
transcripts into the live prompt. No vector store, selector DSL, cross-project
merge, or multi-backend recall is required. The first local MemoryStore is a
rebuildable SQLite FTS index over episode evidence, not a semantic vector
memory.

Daily episode archives are deterministic state summaries generated from
`memory/episodes/events.jsonl` through `memory archive`. They provide a
GA-style L4 archive orientation layer and an OpenClaw-style bounded context
summary without model compaction. Context assembly may read only
`memory/archives/*.json` archive summaries. It must not read raw episode
artifacts, rebuild the SQLite index, write archives, invoke the model
recursively, or treat an archive summary as durable semantic memory.

Archive freshness diagnostics are separate from archive generation.
`memory archive-health`, Feishu `/memory archive health`, context, governance
status, and Opportunity Backlog may expose bounded archive-health issues, but
they only read event/archive metadata and render next-step commands. They must
not refresh archives automatically or treat a health issue as proof that raw
episode evidence has been inspected. `governance decide-opportunity` may append
decisions for `archive_health` backlog items after an operator handles, defers,
or retires the diagnostic outside the read model.

Accepted semantic memory is separate local state. The context bundle may include
a bounded section of accepted summaries and content from
`memory/semantic/accepted/*.json`. It must not read candidate drafts as durable
memory, rebuild the MemoryStore index, fetch remote memory, or write state while
assembling context.

The Service Runtime context section is bounded read-only orientation from
`services/im/heartbeat.json` plus the current repo git identity from
`.git/HEAD` and refs. It may include IM state, pid, channel, scenario,
heartbeat update time, copied-runtime build metadata carried by the heartbeat
(runtime commit, branch, dirty flag, and build time), repo HEAD commit/branch,
whether the resident build is current, stale, or unknown against repo HEAD,
service-health reason codes, and bounded read-only follow-up guidance derived
from those reasons.
It must not read `LOCAL_RUNTIME_HOME/service/runtime/current/build.json`, run `git`,
run shell commands, call `launchctl`, restart services, invoke the model
recursively, mutate state, read source file bodies, or treat the comparison as
proof of external delivery.

The Runtime Config context section is bounded read-only orientation from the
same non-secret runtime config summary used by CLI `config` and Feishu
`/config`. It may include active model/channel/scenario selectors, non-secret
model metadata, optional model context budget metadata derived from
`context_window_tokens` and `max_output_tokens`, runtime promotion and review
tick flags, source refs, defaulted runtime fields, vault roots, and restart
guidance. It must not read `auth.jsonl`, API keys, app secrets, non-config
runtime state artifacts, launchd, service logs, raw context, review, episode,
SOP, or skill bodies; it must not mutate config, write state, restart services,
invoke the model recursively, run review tick, request confirmations, execute
follow-ups, or run shell commands.

The Capability Catalog context section is bounded read-only orientation from
the repo-owned local capability catalog. It may render the catalog id, catalog
version, count, category titles, capability ids, source refs, and explicit
local-only boundaries. It must not read secrets, auth records, launchd state,
service logs, raw context Markdown, review/SOP/skill bodies, arbitrary state
artifacts, or full operator detail; it must not invoke the model, execute tools,
request confirmations, execute follow-ups, manage services, mutate state, write
the repo, or write the active vault. Full operator detail remains available
through CLI `capabilities` and Feishu `/capabilities`.

The Live Run Trace context section is bounded read-only orientation over recent
live harness runs. It may include completion report refs, context refs, final
response refs, event kind counts, observation counts, per-round action counts,
completion statuses, delegated result pass/fail counts, and model action
envelope refs. Delegated result failure counts are derived from the completion
verification `delegated_results` check plus episode event metadata; the read
model does not inspect delegated artifact bodies. It reads completion
verification reports, model action envelope metadata, and episode event
metadata only. It must not render raw model responses, tool result bodies,
delegation result bodies, action payloads, final response Markdown, context
Markdown, harness artifact bodies, request confirmations, rerun actions, invoke
the model, or mutate state.

The Governance Queue context section is a bounded read-only prompt summary of
pending local self-evolution work. It may include ids, statuses, summaries,
titles, action kinds, source refs, and state refs from
`memory/semantic/candidates/`, `memory/semantic/confirmations/`,
`autonomy/inbox/`, `autonomy/followups/`, and
`autonomy/runs/pause_signal.json`. For `revise_skill` items it may include a
derived `reused_skill_coverage` summary with SOP id/ref, coverage status,
current duplicate skill ref, recorded duplicate refs, missing refs, and
next-step guidance. Open inbox `revise_skill` items whose coverage is currently
`covered` should be treated as low-priority cleanup with complete/retire
guidance rather than a mutation-confirmation request; pending confirmations keep
their explicit gate. For `draft_sop` items it may include a derived
`draft_sop_readiness` summary with review/proposal refs, evidence ref count,
failure/SOP signal counts, related SOP refs, related skill refs, and next-step
guidance. The readiness summary may classify an item as
`covered_by_existing_sop` when the selected review already has a same-title or
evidence-linked SOP chain, so duplicate drafts can be completed or retired
instead of confirmed. It must not read raw review Markdown, memory
candidate content, confirmation safety boundaries, command strings, or execute
any confirmation. It is not durable memory and must not request confirmations,
run review, run review tick, mutate SOP/skill/memory state, write the active
vault, invoke the model recursively, or run shell commands during context
assembly.

The Opportunity Backlog context section is a deterministic read-only ranking of
local self-evolution attention. It may summarize the same governance sources as
the Governance Queue plus open records from `autonomy/opportunities.jsonl`,
open SOP evolution chains from the SOP Evolution Ledger, and eligible derived
attention items merged with append-only decisions from
`autonomy/opportunity-decisions.jsonl`. Items include id, kind, status, score,
score reasons, title/summary, action kind, budget hint, source ref, state ref,
an operator next step, and an optional structured next command for
deterministic SOP evolution gates. `revise_skill` items may include the same
bounded `reused_skill_coverage` summary used by the Governance Queue.
Covered open inbox `revise_skill` items may be down-ranked because the read
model already proves the duplicate skill still covers the SOP.
`draft_sop` items may include the same bounded `draft_sop_readiness` summary
used by the Governance Queue. The readiness summary is derived from background
review JSON metadata, chain summaries, and proposal refs only; it must not read
raw review Markdown or episode artifacts.
Completion verification items may include a bounded
`completion_verification` summary with report/session/turn ids, failed and
warning check ids, model diagnostic count, model diagnostic kind/stage/refs,
sanitized diagnostic error preview, and read-only inspect/trace commands. This
summary is derived from completion report JSON and model diagnostic JSON only;
it must not render raw model response bodies, final responses, tool outputs, or
completion Markdown.
Repo writes that happened on a preexisting dirty workspace may appear as
`repo_write_guard` items. These items are derived from bounded live run trace
guard summaries only and may include trace ref, completion id, event id, path,
before/after workspace status, changed-file counts, dirty flag, target-changed
flag, and an inspect command.
Items with an append-only Opportunity Backlog decision may include a bounded
`opportunity_decision` summary with status, reason, JSONL row ref, and an
optional `action_chain_snapshot` so later agents can read decision state
without parsing prose. The snapshot may include only action-chain label,
effect, and optional reason metadata captured at decision time; it must not
copy command strings or become execution evidence.
Opportunity Backlog items may also expose an `action_chain`: a bounded ordered
list of existing operator guidance steps with `label`, `command`, `effect`, and
optional `reason`. The chain is derived only from command fields already present
on the item, such as inspect commands, SOP next commands, restart guidance,
pipeline resume guidance, archive/skill repair guidance, and
`decision_command`. It is a read model for operator sequencing in context,
governance status, and Feishu; rendering an action chain must not execute a
command, append a decision, request confirmations, mutate state, restart
services, write the repo, write the active vault, invoke the model, or run
shell commands.
Abnormal service health may appear as `service_health` items. These items may
show only bounded health status, resident IM state, heartbeat freshness and
age, runtime commit/branch/dirty state, repo HEAD commit/branch, resident
deployment status, review tick state, active pause state, a read-only inspect
command, and explicit restart guidance for the operator. They must not inspect
launchd, read service logs, restart services, invoke the model, mutate state,
read source file bodies, or run shell commands.
Because service lifecycle and service health share the
`<LOCAL_RUNTIME_HOME>/state/runtime` default, generated `service_health` inspect and
restart guidance should omit `--state-root <state-root>` by default. Explicit
state-root guidance is reserved for an operator-selected alternate service
state root.
Failed, skipped, blocked, unfinished, or
unverified selected-skill outcomes may appear as `selected_skill_outcome`
items. These items are derived only from `memory/skills/usage/*.json` outcome
artifacts and may show skill refs, context manifest refs, completion report
refs, final response refs, completion status, verification status, verified
flag, final verdict, and use count. Passed selected-skill outcomes are
suppressed from the backlog. When the same selected skill has repeated failed,
skipped, blocked, unfinished, or unverified outcomes, the backlog may collapse
those single outcome items into one `selected_skill_drift` summary. That summary
may show only bounded aggregate counts, latest outcome refs, latest attention
outcome ref, latest completion report ref, latest final response ref, verdicts,
and registry use count. It is diagnostic attention only and must not revise,
retire, or mutate the skill automatically.
Blocked or failed StageRunner runs may appear as `pipeline_run` items. These
items may show only bounded pipeline metadata, stage status counts,
failed/blocked stage ids, checkpoint/pipeline/query/todo/final-response refs,
evidence counts, an inspect command, and an explicit `pipeline resume` command
for the operator to run from CLI. The command text is guidance only; Backlog,
context, governance status, Feishu, review tick, and the resident service must
not execute it.
Attention-worthy working checkpoints may appear as `working_checkpoint` items.
These items may show only bounded checkpoint metadata, open question counts,
evidence counts, event refs, and an inspect command. The next action is
operator guidance only; Backlog, context, governance status, Feishu, review
tick, and the resident service must not execute it or resume the goal loop.
The score is a local attention heuristic over growth value and budget, not
execution authority.
Completed and retired opportunity records or eligible derived attention items
must not remain visible in the backlog. Deferred derived attention items remain
visible at lower priority with the latest operator reason. SOP chains whose
latest decision is `drafted`, `audited`,
`revision_needed`, or `unknown` may appear as `sop_evolution_chain` items, but
chains with an existing pending follow-up confirmation must not be duplicated
because the confirmation is already the actionable item. Context assembly must
not request confirmations, execute confirmations, append coverage validation
evidence, read raw selected skill bodies, read raw context/final-response
artifacts, run review tick, mutate SOP/skill/memory state, write the active
vault, invoke the model recursively, or run shell commands while building this
section.

`governance decide-opportunity` may append one decision event for an open or
deferred `autonomy/opportunities.jsonl` record, or for an eligible derived
read-only attention item currently visible in the Opportunity Backlog. Required
policy:

- requires an opportunity id/ref or `autonomy/opportunities.jsonl#<line>` ref
- requires a target status: `open`, `deferred`, `completed`, or `retired`
- requires a non-empty reason
- writes only to `autonomy/opportunity-decisions.jsonl`
- merges by latest decision when rendering the Opportunity Backlog
- exposes the latest visible decision as structured `opportunity_decision`
  metadata in Opportunity Backlog, context, governance status, and Feishu read
  models
- records `opportunity_kind` for new decisions so ids and refs do not collide
  across backlog kinds
- supports only manually recorded opportunities and read-only attention kinds:
  `service_health`, `completion_verification`, `context_health`, `context_pressure`,
  `archive_health`, `skill_registry_health`, `working_checkpoint`, `pipeline_run`,
  `repo_write_guard`, `selected_skill_outcome`, and `selected_skill_drift`
- eligible backlog items may expose a bounded `decision_command` in context,
  governance status, and Feishu read models; this command is operator guidance
  only and those surfaces must not execute it or append the decision
- `deferred` lowers a derived item priority while keeping it visible;
  `completed` and `retired` hide it; `open` reopens a previously hidden derived
  item when its source artifact still exists
- rejects selected live-run opportunities because they are run provenance, not
  backlog items
- rejects pending confirmations, review inbox items, memory confirmations,
  memory candidates, autonomy pause signals, and SOP mutation gates because
  those have explicit gates or lifecycle commands
- no confirmation request creation, confirmation execution, review tick, model
  invocation, SOP/skill/memory mutation, active-vault write, or shell command
  execution

`review request-follow-up` and `review request-inbox-confirmation` must gate
`draft_sop` actions with the same `draft_sop_readiness` read model. If the
selected background review/proposal is missing, weak, or already covered by an
existing SOP chain, the confirmation request must fail without writing a pending
confirmation. If readiness is `ready`, the confirmation may store the bounded
readiness snapshot and render it in the confirmation Markdown. `review
execute-confirmed-follow-up` must re-read the current background review/proposal
and reject a pending `draft_sop` confirmation if readiness is no longer `ready`.
Feishu may display stored readiness on confirmation list/detail views, but
remains read-only and must not request or execute confirmations.

The Governance Outcomes context section is a bounded read-only prompt summary
of recently executed local self-evolution decisions. It may include executed
memory acceptance confirmations and executed review follow-up confirmations by
id, action kind, result kind, produced refs, evidence id, and execution time. It
must not read raw SOP drafts, audits, promoted skills, memory acceptance
Markdown, confirmation safety boundaries, or command strings. It is feedback
for later reasoning only; it must not replay an execution, request another
confirmation, mutate SOP/skill/memory state, write the active vault, invoke the
model recursively, or run shell commands during context assembly.

The Working Checkpoint context section is bounded continuity state from
`memory/working/current.json` or the latest valid `memory/working/*.json`
checkpoint. It may include goal, current step, known constraints, recent
evidence refs, open questions, and next action. It must not read the referenced
evidence artifacts, infer completion, mutate working state, invoke the model
recursively, or run shell commands during context assembly.

Working checkpoint status uses the same source records for operator
observability. It may also read `memory/episodes/events.jsonl` metadata to find
event refs that cited a checkpoint, but it must not read raw event artifacts,
completion Markdown, model responses, tool results, or evidence bodies.
Attention-worthy working checkpoints may also appear as read-only
`working_checkpoint` Opportunity Backlog items when they include open questions
or blocked/failed/unfinished/resume/stale/gap signals. Ordinary quiet save
points remain status history only. These backlog items may include a checkpoint
ref, current step, next action, bounded open questions, evidence counts, event
refs, and an inspect command, but they must not execute the next action or
resume the goal loop.

## MemoryStore Rules

Episode evidence is append-only JSONL under the selected state root. The
MemoryStore may build a local SQLite FTS index from that log for search and
session replay.

Required policy:

- JSONL remains the source of truth
- SQLite index is rebuildable and local-only
- search reads episode summaries, kinds, session ids, and artifact refs
- session replay is bounded by caller-provided limit
- daily archive generation scans JSONL and writes bounded summary artifacts
  under `memory/archives/`; it must not rebuild the SQLite index or read raw
  episode artifacts
- live context recall is bounded, summary-only, and must not rebuild the SQLite
  index on the service hot path
- IM operator episode search and session views may scan the append-only JSONL
  event log directly; they must not rebuild the SQLite index, read raw episode
  artifacts, or invoke the model
- vector or hybrid search is out of scope for the first version

## Background Review Rules

Background review turns episode memory into evidence-backed proposals. Recent
background reviews may also read the latest bounded working checkpoint as
continuity intake, but the checkpoint is not completion proof.

Required policy:

- review reads episode memory, and for recent reviews may read the latest
  bounded working checkpoint
- review output is proposal-only
- proposals cite episode evidence
- working-checkpoint proposals cite the checkpoint ref and evidence refs only;
  they must not read referenced evidence artifacts
- reviewed SOP references may be summarized through read-only chain inspection
- SOP chain summaries must use the SOP evolution ledger as the lifecycle
  source of truth; cited older SOPs, audits, and skills remain evidence
  provenance and must not be promoted into the reviewed chain's lifecycle refs
- no repository writes
- no active-vault writes
- no SOP or skill promotion
- empty episode evidence produces a memory-gap proposal rather than a fake
  improvement, even when a working checkpoint also produces a runtime proposal

## Background Review History Read Model Rules

Operators and later context assembly may inspect recent background review
reports without rerunning background review.

Required policy:

- `review reports` lists summaries from `autonomy/reviews/*.json`
- `review reports --review <ref-or-id>` inspects one review JSON report
- Feishu `/review reports` and `/review report <ref-or-id>` render the same
  bounded summaries as local operator commands
- context assembly may include a bounded `Background Review History` section
- summaries may include review id, mode, query, session, selected review ref,
  events reviewed, sessions seen, signal counts, proposal counts, proposal
  types, proposal ids/titles/next actions, chain summary counts, working
  checkpoint ref, and evidence id
- no background review execution
- no review tick execution
- no confirmation request creation
- no follow-up execution
- no raw review Markdown, tick Markdown, SOP, skill, memory candidate, context,
  or episode body reads
- no model invocation, shell command execution, active-vault writes, repo
  writes, or SOP/skill/memory mutation

## Pipeline History Read Model Rules

Operators and later context assembly may inspect recent StageRunner pipeline
runs without rerunning the pipeline.

Required policy:

- `pipeline runs` lists summaries from `pipelines/*/checkpoint.json`
- `pipeline runs --pipeline <ref-or-id>` inspects one pipeline run
- Feishu `/pipeline runs` and `/pipeline run <ref-or-id>` render the same
  bounded summaries as local operator commands
- context assembly may include a bounded `Pipeline History` section
- summaries may include run id, pipeline id, task summary, status, verdict,
  pipeline ref, checkpoint ref, stage run refs, stage status counts, failed or
  blocked stage ids, stage attempts, evidence ref counts, final response ref,
  query/todo refs, and update time
- blocked or failed runs may appear as read-only `pipeline_run` items in the
  Opportunity Backlog, with checkpoint/pipeline refs and stage status metadata
  only
- no pipeline execution
- no model invocation
- no tool execution
- no raw stage output Markdown, prompt, model response, model action envelope,
  tool result, or pipeline todo body reads
- no state writes, repo writes, active-vault writes, review tick execution, or
  SOP/skill/memory mutation

## Pipeline Resume Gate Rules

An operator may explicitly resume one blocked or failed StageRunner pipeline
checkpoint from the blocked stage or a selected stage. This is a foreground CLI
execution path, not a read-only history view and not a service scheduler.

Required policy:

- `pipeline resume --pipeline <ref-or-id>` resolves an existing pipeline run by
  run id, pipeline id, pipeline ref, checkpoint ref, or pipeline root
- `--from-stage <stage-id>` may override the blocked stage when the operator
  intentionally wants to rerun from an earlier or selected stage
- the selected pipeline must have a readable `pipeline.json` and a blocked or
  failed checkpoint
- prior stages before the resume point must already be terminal (`done` or
  `skipped`)
- resumed stages write new attempt refs instead of overwriting the failed
  attempt artifact
- the checkpoint is updated to the current resumed path, evidence refs, final
  response ref, status, blocked stage, and update time
- the latest working checkpoint records the resume start stage and next action
- `pipeline runs` may show stage attempt metadata after resume

Forbidden behavior:

- no automatic resume from Opportunity Backlog, review tick, Feishu, or service
  heartbeat
- no silent repair, stage skipping, confirmation request creation, SOP/skill
  mutation, active-vault write, or repo write
- no deletion or overwrite of prior failed stage attempt artifacts

## Pipeline Resume Operator Visibility Rules

Read-only operator surfaces may render explicit guidance for blocked or failed
pipeline runs after the resume gate exists.

Required policy:

- `pipeline_run` Opportunity Backlog items include a bounded `pipeline_run`
  summary with run id, pipeline id, status, checkpoint/pipeline refs,
  failed/blocked stage ids, query/todo refs, final response ref, evidence
  count, inspect command, and resume command
- bounded context renders the same inspect and resume commands in the
  Opportunity Backlog section
- Feishu `/opportunities` renders the same inspect and resume commands without
  running the agent
- aggregate governance status may include the same summary for the top
  opportunity

Forbidden behavior:

- no pipeline resume execution from Backlog, context assembly, governance
  status, Feishu, review tick, or resident service
- no raw pipeline query/todo bodies, stage output Markdown, prompt, model
  response, model action envelope, or tool result reads
- no confirmation request creation, SOP/skill/memory mutation, active-vault
  write, or repo write

## Review Follow-Up Planning Rules

An operator may plan follow-up actions for one selected review proposal without
executing them.

Required policy:

- requires a review id or review JSON ref
- requires a proposal id
- reads the review report and selected proposal
- may use review `chain_summaries` to classify SOP follow-up
- returns `dry_run: true`, structured actions, optional suggested commands, and
  the write surfaces those actions would touch if executed later
- action ids are deterministic for the same review ref, proposal id, action
  kind, and action target
- action ids are selectors, not execution evidence
- no state writes
- no episode evidence append
- no active-vault writes
- no draft, audit, promotion, skill package creation, command execution, or
  chain repair

## Review Tick Inbox Rules

A review tick may run background review and materialize the resulting follow-up
actions as a state-only self-evolution inbox.

Required policy:

- accepts the same scope controls as background review: recent, query, or
  session
- when no explicit query or session is supplied, reads the ranked Opportunity
  Backlog and records a bounded `focus`
- focus summaries may include a compact `action_chain` copied from the
  selected backlog item as label/effect/reason metadata only; review tick
  focus must not copy action command strings
- may turn only open exploration or bounded diagnostic items, currently
  `sop_evolution_chain`, `open_opportunity`, `completion_verification`,
  `archive_health`, `skill_registry_health`, `context_health`, `pipeline_run`,
  `selected_skill_outcome`, and `selected_skill_drift`, into a review query
- when an `archive_health` or `skill_registry_health` item is the selected
  focus, may materialize a bounded `runtime_gap` proposal whose follow-up is a
  gated `narrow_review`; if background review produced only an empty generic
  memory-gap proposal, the health focus proposal may replace it
- when a `context_health` focus has no matching episode events, may replace the
  generic memory-gap proposal with a bounded `runtime_gap` proposal whose
  follow-up is a gated `narrow_review`
- when a `completion_verification` focus includes bounded model diagnostics,
  may replace the generic memory-gap proposal with a bounded `runtime_gap`
  proposal for inspecting provider, config, context, or SOP gaps without
  retrying or switching models
- `archive_health` focus must not refresh archives from review tick, and
  `skill_registry_health` focus must not sync registry metadata or write the
  active vault from review tick
- when the top backlog item is `working_checkpoint`, records it as
  `opportunity_backlog` focus but keeps recent review scope so background
  review can consume the bounded latest checkpoint intake and emit a
  `runtime_gap` proposal
- if higher-ranked backlog items are already actionable, such as pending
  confirmations, review inbox items, or service controls, skips them when a
  lower-ranked scoped review item is available; if no scoped review item exists,
  records the first action-only item as focus and keeps recent review scope
  instead of re-querying it
- runs one background review and writes the normal review artifacts and evidence
- plans follow-up actions for every review proposal
- materializes working-checkpoint runtime proposals through the same inbox and
  confirmation gate as other review proposals
- writes stable inbox item JSON artifacts under `autonomy/inbox/`
- writes a tick JSON/Markdown report under `autonomy/ticks/`
- uses stable inbox ids that exclude per-run review artifact refs
- updates existing inbox items by increasing `seen_count` and preserving
  `first_review_ref`
- appends episode evidence for the tick report
- no confirmation request creation
- no follow-up action execution
- no execution of action-chain commands
- no active-vault writes
- no SOP draft, audit, promotion, skill revision, shell command execution, or
  chain repair

## Service Review Tick Loop Rules

The resident local service may periodically run `review tick` as a bounded
local learning task.

Required policy:

- disabled by default
- enabled only by explicit JSONL runtime config; operators should prefer
  `config set-runtime` so the update is append-only and guarded
- reads `runtime.review_tick_enabled`, `runtime.review_tick_interval_ms`, and
  `runtime.review_tick_limit`
- uses the configured service state root
- runs the same state-only `review tick` path as the CLI command
- skips the tick and writes `state=paused` when
  `autonomy/runs/pause_signal.json` is active
- writes status under `services/im/review_tick.json`
- includes the latest tick-loop status, latest review focus, and active
  autonomy pause signal in `service status`
- aggregate governance status and Feishu `/governance` may render the latest
  tick ref and bounded focus summary as operator observability only
- preserves the review tick rules: no confirmation request creation, no
  follow-up execution, no active-vault writes, no SOP draft, audit, promotion,
  skill revision, shell command execution, or chain repair

## Service Content Feedback Refresh Loop Rules

The resident local service may periodically refresh post-publish Xiaohongshu
feedback for content runs that already have typed publish completion proof.

Required policy:

- disabled by default
- enabled only by explicit JSONL runtime config; operators should prefer
  `config set-runtime` so the update is append-only
- reads `runtime.content_feedback_refresh_enabled`,
  `runtime.content_feedback_refresh_interval_ms`,
  `runtime.content_feedback_refresh_limit`,
  `runtime.content_feedback_refresh_min_follow_up_age_ms`, and
  `runtime.content_feedback_refresh_server_url`
- uses the configured service state root
- reads the typed `feedback-needed` queue to respect the latest feedback evidence
  from any capture source, while new captures still use the configured
  `xiaohongshu-mcp` current-user feed path
- may capture missing first snapshots and failed-capture retries immediately
- must wait for `content_feedback_refresh_min_follow_up_age_ms` before
  follow-up snapshots after early feedback
- when status includes `next_due_at`, the resident scheduler may wake at that
  due time if it is sooner than `content_feedback_refresh_interval_ms`
- after scheduling, status records `next_wake_at`, `next_wake_delay_ms`, and
  `next_wake_reason` (`next_due_at` or `interval`) so operator health views can
  distinguish an actively waiting timer from a skipped run
- writes status under `services/im/content_feedback_refresh.json`
- writes a bounded feedback strategy summary to the same status file after each
  refresh attempt, including posture counts, the top run ref/title, and a next
  command shape for health views; context may render a compact posture summary
- appends typed local feedback evidence through the existing
  `xiaohongshu-mcp` current-user feed capture path
- when latest feedback evidence already failed with a `/api/v1/user/me`
  timeout, backlog and strategy repair commands must route to creator metrics
  capture instead of repeating the same timed-out feed request
- when latest feedback evidence came from `agent-browser-cli` and still needs a
  later follow-up snapshot, queue and strategy command shapes must continue
  through `content creator-metrics-capture` instead of falling back to manual
  `feedback-evidence`
- due items routed to creator metrics must be skipped by resident feedback
  refresh and reported through skipped counts/refs instead of being retried via
  the MCP feed path
- no `publish_content`, no browser automation, no cookie reads, no model calls,
  no repo writes, no active-vault writes, and no draft/body/image/cookie payloads
  in service status
- failure is reported as service status and must not crash the IM listener

## Service Daily Content Loop Rules

The resident local service may periodically run `content daily` as a bounded
active-exploration task.

Required policy:

- disabled by default
- enabled only by explicit JSONL runtime config
- reads `runtime.content_daily_enabled`, `runtime.content_daily_interval_ms`,
  `runtime.content_daily_dry_run`, `runtime.content_daily_preflight`,
  daily topic/source/ticker/image fields, and the daily Xiaohongshu publish
  gate fields
- uses the configured service state root
- runs the same local `content daily` path as the CLI command
- when no explicit source URLs are configured, uses the default public AI source
  bundle: OpenAI News RSS, Anthropic News, Google AI RSS, NVIDIA Deep Learning
  RSS, and Hacker News Algolia AI query
- when no explicit tickers are configured, uses `NVDA`, `AMD`, and `MSFT` for
  public market quote evidence; market-hotspot ranking is limited to this
  configured watchlist and is not investment advice
- publish preflight requires fresh daily source coverage before a non-dry-run
  daily job can publish externally
- skips duplicate same-date track jobs instead of forcing replacement
- when the default topic/source/ticker config is active, runs the built-in
  `ai_applications` and `ai_compute_market` tracks so the resident loop can
  produce separate AI application and AI compute/stock drafts for the same date
- skips the job and writes `state=paused` when
  `autonomy/runs/pause_signal.json` is active
- writes status under `services/im/content_daily.json`, including recent
  track/job refs when multiple tracks run
- includes the latest daily content-loop status in `service status`
- with `content_daily_dry_run=true`, does not call the model or Image API
- with `content_daily_dry_run=false`, may call only the configured
  OpenAI-compatible Image API
- manual `content daily-advance` may call only the configured
  OpenAI-compatible Image API and read-only Xiaohongshu MCP preflight methods
  for an existing daily job; it must keep `external_write=false`
- Feishu `/content` may read only daily job JSON, linked content run metadata,
  service content-daily status, and bounded next commands; it must not read
  draft bodies or image bytes, invoke the model, call MCP, or mutate state
- may call `publish_content` through `xiaohongshu-mcp` only when
  `content_daily_preflight=true`, `content_daily_publish_enabled=true`, and
  `content_daily_external_write_confirmed=true` are all configured and the run
  records `preflight_ok` evidence
- runtime config writes must refuse resident daily external-write fields unless
  the operator supplies `--external-write --confirmed`
- never bypasses explicit external-write confirmation, never stores cookies,
  and never uses browser automation from the resident loop
- failure is reported as service status and must not crash the IM listener

## Review Tick History Read Model Rules

Operators and later context assembly may inspect recent review tick reports
without rerunning autonomous review.

Required policy:

- `review ticks` lists summaries from `autonomy/ticks/*.json`
- `review ticks --tick <ref-or-id>` inspects one tick JSON report
- Feishu `/review ticks` and `/review tick <ref-or-id>` render the same
  bounded summaries as local operator commands
- context assembly may include a bounded `Review Tick History` section
- summaries may include tick id, mode, query, session, focus, selected
  opportunity, review refs, proposal count, inbox count, inbox refs, stats, and
  evidence id
- no review tick execution
- no background review execution
- no confirmation request creation
- no follow-up execution
- no raw tick Markdown, review Markdown, SOP, skill, memory candidate, context,
  or episode body reads
- no model invocation, shell command execution, active-vault writes, repo
  writes, or SOP/skill/memory mutation

## Completion Verification History Read Model Rules

Operators and later context assembly may inspect recent completion verification
reports without reading raw completion artifacts.

Required policy:

- `review completions` lists summaries from
  `memory/episodes/*-completion-verification.json`
- `review completions --completion <ref-or-id>` inspects one completion
  verification JSON report
- Feishu `/review completions` and `/review completion <ref-or-id>` render the
  same bounded summaries as local operator commands
- context assembly uses the shared read model for bounded recent completion
  verification summaries
- summaries may include report id/ref, session, turn, completion status,
  verification status, verified flag, summary, envelope/final-response refs,
  ref counts, failed check ids, warning check ids, and boundary

Forbidden behavior:

- no raw final response, tool result, delegation result, or completion Markdown
  reads
- no background review or review tick execution
- no confirmation request creation
- no follow-up execution
- no model invocation
- no state mutation beyond the preexisting report writes

## Live Run Trace Read Model Rules

Operators and later context assembly may inspect recent live harness run shape
without reading raw execution artifacts.

Required policy:

- `review traces` lists summaries derived from recent completion verification
  reports, model action envelope metadata, and episode event metadata
- `review traces --trace <ref-or-id>` inspects one bounded trace by report ref,
  completion id, session id, or report filename
- Feishu `/review traces` and `/review trace <ref-or-id>` render the same
  bounded summaries as local operator commands
- context assembly uses the shared read model for bounded recent live run trace
  summaries
- summaries may include report refs, completion ids, session/turn ids,
  completion status, verification status, verified flag, context refs,
  final-response refs, event kind counts, observation counts, harness
  state-action counts, delegated result pass/fail counts, per-round action
  counts, action types, model diagnostic failure kind/stage/refs, and envelope
  refs
- repo-write guard summaries may include path, before/after workspace status,
  changed-file counts, dirty flag, target-changed flag, and event id parsed
  from bounded `tool_result` event summaries
- delegated result failure counts are derived from the completion verification
  `delegated_results` check and episode event metadata without reading
  delegated result artifact bodies
- model diagnostic summaries are derived from `model_diagnostic` events and
  bounded diagnostic JSON; they may show sanitized error previews but not raw
  model response bodies

Forbidden behavior:

- no raw model response, action payload, tool result, delegation result, final
  response, context Markdown, harness artifact body, or completion Markdown
  reads
- no replay, confirmation request creation, follow-up execution, model
  invocation, shell command execution, active-vault writes, repo writes, or
  SOP/skill/memory mutation

## Skill Catalog Read Model Rules

Operators and later agents may inspect local skill catalog metadata without
opening raw skill instruction bodies.

Required policy:

- `skills` lists bounded skill summaries from skill frontmatter and registry
  metadata
- `skills --skill-name <name-or-ref>` inspects one skill metadata entry by
  skill name, metadata ref, or `SKILL.md` ref
- Feishu `/skills` and `/skill <name-or-ref>` render the same bounded metadata
  summaries for operators
- summaries may include skill name, description, status, source, trust level,
  instruction ref, metadata ref, origin ref, source SOP ref, version, use count,
  last-used time, patch count, updated time, and bounded reference counts

Forbidden behavior:

- no raw skill body, raw SOP draft, audit Markdown, context Markdown, final
  response, model response, prompt, tool result, or completion Markdown reads
- no registry metadata rewrite or skill instruction rewrite
- no background review or review tick execution
- no confirmation request creation
- no follow-up execution or skill revision
- no model invocation
- no active-vault, repo, or state mutation
- no shell command execution

## Skill Registry Health Read Model Rules

Operators and later agents may inspect active-vault skill registry consistency
without opening raw skill instruction bodies or repairing registry state.

Required policy:

- `skills health` lists bounded registry-health issues from the configured
  active vault
- `skills health --skill-name <name>` narrows diagnostics to one skill, ref, or
  issue selector
- Feishu `/skill health` and `/skill health <name>` render the same bounded
  diagnostics for operators
- diagnostics may include invalid registry rows, missing `SKILL.md` packages,
  invalid frontmatter, registry metadata/hash drift, orphan active-vault
  packages, invalid skill event rows, and orphan skill events
- Opportunity Backlog, context, governance status, and Feishu may surface
  bounded `skill_registry_health` items with inspect, explicit sync guidance,
  and explicit orphan-event retirement guidance

Forbidden behavior:

- no raw skill body, raw SOP draft, audit Markdown, context Markdown, final
  response, model response, prompt, tool result, or completion Markdown reads
- no registry JSONL rewrite, skill instruction rewrite, active-vault write,
  repo write, or state mutation
- no SOP draft, audit, promotion, skill revision, confirmation request, or
  follow-up execution
- no background review or review tick execution
- no model invocation
- no shell command execution

## Skill Registry Sync Provenance Rules

`skills --action sync` is the explicit operator mutation gate for refreshing
the active-vault skill registry snapshot from current `SKILL.md` frontmatter.
It may rewrite `registry/skills.jsonl` and append bounded `synced` events to
`registry/skill-events.jsonl` for entries that were created or changed by the
sync.

Required policy:

- sync returns the registry ref, synced event refs, entry count, changed-entry
  count, and refreshed entries
- unchanged repeat syncs must not append duplicate `synced` events
- sync events cite the skill instruction ref and registry ref, but do not copy
  raw skill bodies
- `skills events`, SOP Evolution Ledger, and later operator views may read the
  `synced` events as provenance metadata

Forbidden behavior:

- no raw skill body rendering, SOP promotion, skill revision, confirmation
  request, follow-up execution, model invocation, shell command, remote publish,
  multi-machine sharing, or public marketplace sync
- no automatic execution from Feishu, context, Opportunity Backlog, health read
  models, review tick, or the resident service

## Skill Registry Event Retirement Rules

`skills retire-event --event <ref-or-id> --reason "..."` is the explicit
operator mutation gate for closing historical orphan skill registry events. It
does not erase event history. It appends one bounded `retired` event for the
same skill name and instructions ref, citing the target event ref as evidence.

Required policy:

- the target event must be selected by event id or bounded event ref
- retirement returns the target event ref, appended retirement event ref, skill
  name, instructions ref, summary, status, and boundary
- if the latest event for the same skill/instructions ref is already
  `retired`, the command is idempotent and appends no duplicate event
- `skills health` treats the latest `retired` event for the same
  skill/instructions ref as the close signal for an orphan skill event chain
- read-only surfaces may show the command as action-chain guidance, but must
  not execute it

Forbidden behavior:

- no event deletion or historical JSONL rewrite
- no registry snapshot rewrite
- no skill package rewrite, restoration, or deletion
- no raw skill body, SOP draft, audit Markdown, context Markdown, final
  response, model response, prompt, tool result, or completion Markdown reads
- no model invocation, shell command execution, SOP promotion, skill revision,
  confirmation request, or follow-up execution

## Selected Skill Outcome History Read Model Rules

Operators and later agents may inspect recent selected-skill outcome telemetry
without reading raw skill or run artifacts.

Required policy:

- `skills outcomes` lists summaries from `memory/skills/usage/*.json`
- `skills outcomes --outcome <ref-or-id>` inspects one selected-skill outcome
  JSON artifact
- `skills drifts [--skill-name <name>]` lists repeated selected-skill attention
  summaries grouped by skill
- Feishu `/skill outcomes` and `/skill outcome <ref-or-id>` render the same
  bounded summaries as local operator commands
- Feishu `/skill drifts` and `/skill drift <skill-name>` render the same
  grouped drift summaries as local operator commands
- summaries may include outcome id/ref, session, turn, selected skill name/ref,
  source, score, completion status, verification status, verified flag, verdict,
  context manifest ref, completion report ref, final response ref, envelope ref,
  registry update status, use count, and boundary
- drift summaries may include skill name/ref, status, outcome/attention counts,
  failed/skipped/not-done/blocked/unverified/passed counts, latest refs,
  bounded outcome refs, verdicts, first/latest seen times, and registry use
  count

Forbidden behavior:

- no raw selected skill body, context Markdown, final response, completion
  Markdown, tool result, or model prompt reads
- no background review or review tick execution
- no confirmation request creation
- no follow-up execution or skill revision
- no model invocation
- no skill metadata, active-vault, repo, or state mutation

## Selected Skill Drift Review Proposal Rules

Selected-skill outcome telemetry can become a self-evolution proposal only
through the same review/inbox/confirmation gate used by other local learning
actions.

Required policy:

- review tick may focus `selected_skill_outcome` or `selected_skill_drift`
  backlog items as bounded review queries
- background review may convert matching `skill_usage` events into
  `skill_revision` proposals
- follow-up planning for those proposals may create a `revise_skill` action
  whose required refs include selected-skill outcome refs and skill refs
- confirmation next steps must point operators at
  `skills outcomes --outcome ...` before execution
- confirmed execution appends active-vault `validated` registry events only
- no raw skill bodies, raw context Markdown, final responses, completion
  Markdown, model responses, prompts, or tool results are read or rendered
- no skill instruction rewrite, registry metadata rewrite, SOP mutation, shell
  command execution, model invocation, or automatic confirmation execution

## Review Inbox Gate Rules

An operator may inspect review tick inbox items and request mutation
confirmation from one selected inbox item.

Required policy:

- `review inbox` lists `autonomy/inbox/*.json` items or reads one selected item
- default `review inbox` list is an active view: `open` and
  `confirmation_requested`; `--status all` or `--status executed` exposes
  terminal history
- `review request-inbox-confirmation` requires an inbox item id or inbox item
  JSON ref
- `review decide-inbox` appends an operator decision to
  `autonomy/review-inbox-decisions.jsonl` and does not mutate the inbox item
- supported review inbox decisions are `open`, `deferred`, `completed`, and
  `retired`
- selected inbox item must exist and come from `review_tick`
- selected inbox item must not already have `confirmation_requested` status
- selected inbox item must not already have `executed` status
- selected inbox item must not have a latest non-`open` operator decision when
  requesting confirmation
- read-only inbox items are rejected because they do not require mutation
  confirmation
- recomputes the referenced follow-up plan through the existing confirmation
  path using the inbox item's latest review, proposal, and action refs
- writes a pending confirmation JSON/Markdown pair under `autonomy/followups/`
- updates the inbox item status to `confirmation_requested`
- preserves the inbox item's stable id and first review ref
- appends episode evidence for the inbox confirmation request
- when `review execute-confirmed-follow-up` executes a linked confirmation, the
  inbox item is updated to `executed` with confirmation, execution result, and
  execution evidence refs
- no follow-up action execution
- no active-vault writes
- no SOP draft, audit, promotion, skill revision, shell command execution, or
  chain repair

Backlog and context read models must read the latest review inbox decision
before surfacing inbox items. `completed` and `retired` remove an item from
active attention; `deferred` keeps it visible with the decision reason and a
bounded reopen command.

Active review inbox read models must collapse duplicate suggestions before
ranking or rendering active attention. The duplicate key is derived from the
suggested action kind, title, rationale, command, required refs, and write
boundary. The canonical item may expose duplicate ids/refs. `review inbox
--status all` and stored `autonomy/inbox/*.json` artifacts remain uncollapsed
audit history. Duplicate groups must use the latest review inbox decision from
any group member: `completed` and `retired` suppress the entire group, while
`open` and `deferred` reopen or downgrade the canonical active view. Duplicate
collapse must not delete inbox artifacts, append
decisions, request confirmations, execute follow-ups, invoke the model, write
the repo, or write the active vault. Requesting confirmation for a non-canonical
duplicate item must be rejected with the canonical ref.

Feishu `/review inbox <ref-or-id>` may render the matching CLI
`review request-inbox-confirmation --item <item>` command or the matching
`review decide-inbox --item <item>` command as operator guidance. Rendering
these commands is not confirmation, execution, decision writing, or shell
command authority.

## Review Follow-Up Execution Rules

An operator may execute one selected follow-up action only when the action is
read-only.

Required policy:

- requires a review id or review JSON ref
- requires a proposal id
- requires a stable follow-up action id
- recomputes the dry-run plan and selects the action by id
- executes only `inspect_chain`
- returns a read-only result with the selected action and SOP provenance chain
- rejects actions that would write state or the active vault
- no state writes
- no episode evidence append
- no active-vault writes
- no draft, audit, promotion, skill revision, evidence collection, narrowed
  background review, shell command execution, or chain repair

## Review Follow-Up Confirmation Rules

An operator may request confirmation for one selected mutation follow-up action.

Required policy:

- requires a review id or review JSON ref
- requires a proposal id
- requires a stable follow-up action id
- recomputes the dry-run plan and selects the action by id
- selected action must have at least one expected write surface
- writes a pending confirmation JSON artifact under `autonomy/followups/`
- writes a Markdown companion under `autonomy/followups/`
- appends episode evidence for the confirmation request
- records selected action, required refs, expected write surfaces, safety
  boundary, and next step
- no active-vault writes
- no SOP draft, SOP audit, SOP promotion, skill revision, narrowed background
  review, shell command execution, or chain repair
- read-only actions are rejected because they do not require mutation
  confirmation

## Review Follow-Up Confirmation Read Model Rules

An operator may inspect follow-up confirmation requests without executing them.

Required policy:

- `review confirmations` lists `autonomy/followups/*.json` summaries or reads
  one selected confirmation
- default list includes pending and executed confirmations
- `review confirmations --gate current|stale|executed|all` may filter by
  derived SOP-chain gate state; non-`all` filters exclude ordinary
  review-proposal confirmations because they have no SOP evolution gate
- selected confirmation may be addressed by confirmation id or state JSON ref
- list summaries expose status, selected action, expected write surfaces,
  selected refs, and execution summary refs without safety-boundary detail
- inspect returns the full confirmation artifact, including safety boundary,
  next step, and execution result when present
- no confirmation request creation
- no follow-up action execution
- no state mutation, no active-vault writes, no model invocation, no shell
  command execution, no draft, audit, promotion, skill revision, narrowed
  review, evidence collection, or chain repair

## Review Confirmed Follow-Up Execution Rules

An operator may execute one confirmed mutation follow-up only through a pending
confirmation request.

Required policy:

- requires a confirmation id or state confirmation JSON ref
- reads `autonomy/followups/*.json`
- confirmation status must be `pending`
- recomputes the dry-run plan from the confirmation review and proposal refs
- selected action must still exist and match the confirmation action id
- executes only `collect_evidence`, `narrow_review`, `draft_sop`, `audit_sop`,
  `promote_sop`, or `revise_skill`
- writes state SOP draft artifacts under `sop/drafts/` or a state audit
  artifact under `governance/audits/`, writes a narrowed state review artifact
  under `autonomy/reviews/`, writes an evidence collection report under
  `autonomy/reports/`, or runs the explicit active-vault promotion path for
  `promote_sop`, or appends active-vault skill validation events for
  `revise_skill`
- appends evidence-collection, narrowed review, draft, audit, promotion, or
  skill-validation evidence
- updates the confirmation artifact to `executed`
- appends confirmed-execution evidence
- rejects already executed confirmations
- rejects unsupported action kinds
- `promote_sop` requires injected vault config and
  `runtime.promotion_enabled=true`
- no active-vault writes except confirmed `promote_sop` and confirmed
  `revise_skill` validation events
- no `SKILL.md` rewriting, shell command execution, or chain repair
- `collect_evidence` records the memory gap and recommended intake steps; it
  must not claim new external evidence was collected
- `revise_skill` requires injected vault config, appends `validated` registry
  events only, and must not edit skill instructions or registry metadata rows

## Review-To-SOP Draft Rules

An operator may explicitly turn an eligible review proposal into an SOP draft.

Required policy:

- requires a review id or review JSON ref
- requires a proposal id
- proposal must have evidence refs
- memory-gap and runtime-gap proposals are not eligible
- output is `sop/drafts/*.json` and `sop/drafts/*.md` under the selected state root
- append episode evidence for the draft
- no repository writes
- no active-vault writes
- no audit, promotion, or skill package creation

## Review SOP Audit Rules

An operator may explicitly audit a state-only SOP draft before any future
promotion step.

Required policy:

- requires a SOP draft id or state draft ref
- reads `sop/drafts/*.json` under the selected state root
- output is `governance/audits/*.json` under the selected state root
- append episode evidence for the audit
- no repository writes
- no active-vault writes
- no SOP status mutation, promotion, or skill package creation

## Review SOP Promotion Rules

An operator may explicitly promote an audited state-only SOP draft into the
configured local active vault.

Required policy:

- requires a SOP draft id or state draft ref
- requires an audit id or state audit ref
- audit target must match the SOP draft id
- audit verdict must be `promote`
- runtime promotion must be enabled
- duplicate recalled-skill detection runs before writing a new skill
- duplicate coverage skips promotion and appends episode evidence
- successful promotion may write active-vault SOP, skill candidate, active skill,
  registry snapshot, skill event, and episode evidence
- no repository seed-vault writes
- no external publishing or shared vault sync
- no automatic background promotion

## Review SOP Loop Rehearsal Rules

An operator may explicitly rehearse the SOP promotion/reuse loop through
`review rehearse-sop-loop`. This is a local development and acceptance gate,
not ordinary self-evolution.

Required policy:

- runs through the real `LiveAgentRunner`, local audit, active-vault promotion,
  recall, registry usage, and duplicate-skill reuse path
- uses an internal deterministic model and must not call an external model
- creates a sandbox repo, sandbox state roots, and sandbox active vault under
  `governance/rehearsals/<id>/sandbox/` in the selected state root
- writes a bounded JSON and Markdown report under
  `governance/rehearsals/<id>/`
- appends one episode evidence event to the selected state root
- verifies that the sandbox skill exists, no sandbox repo seed skill was
  written, the second run selected the recalled skill, and registry usage was
  recorded

Forbidden behavior:

- no real active-vault writes
- no working repository writes
- no Feishu execution path
- no auth record, API key, app secret, service log, raw review/SOP/skill body,
  or arbitrary external state reads
- no service management, shell command execution, external publishing, or
  shared vault sync

## Review Chain Rules

An operator may inspect the provenance chain for a state SOP draft.

Required policy:

- requires a SOP draft id or state draft ref
- reads `sop/drafts/*.json` under the selected state root
- reads `memory/episodes/events.jsonl` as the event source of truth
- returns related review refs, audit refs, skill refs, duplicate skill refs,
  artifact refs, episode events, and aggregate status
- no state writes
- no active-vault writes
- no audit, promotion, skill package creation, or automatic repair

An operator or context assembler may inspect the aggregate SOP Evolution Ledger.

Required policy:

- reads `sop/drafts/*.json`, `governance/audits/*.json`,
  `autonomy/followups/*.json`, `memory/episodes/events.jsonl`, and
  active-vault `registry/skill-events.jsonl`
- returns counts, chain decisions, related refs, latest follow-ups, latest skill
  events, bounded next-step guidance, and optional structured next commands for
  deterministic audit or promotion gates
- distinguishes lifecycle refs from cited evidence refs: executed `draft_sop`
  follow-ups relate to the SOP they produced, and draft episode events must not
  promote historical cited audit/skill refs into the new chain's lifecycle
  `audit_refs` or `skill_refs`
- applies the same boundary to `audit_sop`: confirmation events relate through
  their own confirmation session/turn ids and execution result refs, and
  `audit_result` events expose only the audit ref matching their own `turn_id`
- structured next commands may include a request-confirmation CLI command
- tolerates malformed historical state files by skipping them
- no raw SOP body or skill body rendering
- no state writes beyond pre-existing layout creation behavior
- no active-vault writes
- no model invocation, review tick, confirmation request, confirmation
  execution, audit, promotion, skill revision, shell command execution, or chain
  repair

An operator or read model may inspect context manifest sidecar health through
`context health`.

Required policy:

- reads only `memory/episodes/*-context.json` manifest JSON and
  `memory/episodes/*-context.md` file refs
- returns invalid manifest, missing context Markdown, and orphan context
  Markdown issues with bounded refs, reasons, next-step guidance, issue-specific
  inspect commands, and operator guidance for explicit repair, defer,
  completed-after-external-repair, or historical-retirement decisions
- `context health --context <ref-or-id>` may narrow diagnostics to one issue
  by issue id, manifest ref, context ref, basename, session id, or turn id
- context, governance status, Opportunity Backlog, Feishu `/context health`,
  and Feishu `/opportunities` may render bounded health issue metadata
- Feishu `/context health <ref-or-id>` may render full operator guidance for
  one issue, while list views should stay compact
- `governance decide-opportunity` may append decisions for `context_health`
  backlog items
- `context repair --context <*-context.md>` may explicitly read one selected
  context Markdown artifact and write the missing `*-context.json` sidecar with
  conservative recovered metadata
- no raw context Markdown rendering
- no prompt/model/tool artifact reads
- no automatic context repair, compaction, transcript rewriting, context
  assembly rewrite, state repair from read-only surfaces, or automatic rerun

The explicit `context repair` command is a local state repair command, not a
read-only diagnostic. It must be selected by the operator through CLI, target
one `*-context.md` or matching `*-context.json` ref, refuse to overwrite an
existing manifest, and write only the missing manifest sidecar. The recovered
manifest may use conservative metadata derived from headings and character
counts; it must not claim original recall refs, skill refs, opportunity refs, or
model budget metadata that cannot be recovered from the Markdown itself.
Feishu, context assembly, Opportunity Backlog, governance status, and review
tick may show the command as guidance only and must not execute it.
- no state writes beyond explicit opportunity decisions; the completed and
  retired guidance commands are acknowledgements after an operator has handled
  the issue outside this read model
- no model invocation, review tick, confirmation request, confirmation
  execution, SOP/skill/memory mutation, active-vault write, repo write, or
  shell command execution

An operator or read model may inspect context usage through
`context usage`.

Required policy:

- `context usage` summarizes recent context usage from
  `memory/episodes/*-context.json` manifest metadata
- if the active model record declares `context_window_tokens`, CLI/Feishu
  usage diagnostics may derive estimated input budget chars from
  `context_window_tokens - max_output_tokens` and use that budget for
  watch/over-budget status
- live context manifests may store the same bounded budget metadata for later
  diagnostics
- Feishu `/context usage` and `/usage` render the same bounded routine usage
  view for operators
- summaries may include analyzed manifest counts, total/average/max chars,
  pressure status counts, top section titles with aggregate sizes, recent
  manifest refs, session/turn ids, section counts, largest section metadata,
  recall counts, skill counts, archive counts, and boundary
- no raw context Markdown rendering
- no prompt/model/tool artifact reads
- no context compaction, transcript rewriting, context assembly rewrite, state
  repair, Opportunity Backlog mutation, or automatic rerun
- no model invocation, review tick, confirmation request, confirmation
  execution, SOP/skill/memory mutation, active-vault write, repo write, or
  shell command execution

An operator or read model may inspect context pressure through
`context pressure`.

Required policy:

- reads only `memory/episodes/*-context.json` manifest metadata
- if model budget metadata is provided by current config or the manifest,
  pressure thresholds may use it instead of static defaults
- returns context manifest ref, context Markdown ref, session/turn, total
  chars, limits, largest section, pressure sections, top sections, reasons,
  next-step guidance, and operator guidance
- operator guidance includes bounded inspect, defer, complete-after-external-
  mitigation, and retire-historical decision commands
- operator guidance may identify a suggested mitigation kind such as reducing
  episode recall, narrowing selected skills, or rebalancing context sections,
  but the read-only pressure command must not execute that mitigation
- the live runner may consume the latest non-ok `reduce_episode_recall`
  guidance as a fixed attention guard by lowering the next episode recall cap
  from 4 hits to 1 hit and recording bounded evidence
- other mitigation commands must be introduced as explicit CLI commands with
  focused tests before they can change context assembly
- context, governance status, Opportunity Backlog, Feishu `/context pressure`,
  and Feishu `/opportunities` may render bounded pressure metadata
- `governance decide-opportunity` may append decisions for
  `context_pressure` backlog items
- no raw context Markdown rendering
- no prompt/model/tool artifact reads
- no context compaction, transcript rewriting, broad context assembly rewrite,
  state repair, or automatic rerun
- no state writes beyond explicit opportunity decisions; completed or retired
  context pressure means the operator has verified an external mitigation or
  historical status, not that this read model changed context artifacts
- no model invocation, review tick, confirmation request, confirmation
  execution, SOP/skill/memory mutation, active-vault write, repo write, or
  shell command execution

An operator may inspect active-vault skill registry event history through
`skills events [--event <ref-or-id>]`.

Required policy:

- reads the configured active-vault `registry/skill-events.jsonl`
- lists recent events and inspects one event by id or listed ref
- may filter list output by skill name
- returns event id/ref, kind, skill name, instructions ref, SOP/audit refs,
  evidence refs, artifact refs, summary, created time, and the read-only
  boundary
- tolerates malformed historical JSONL rows by skipping them
- no raw skill body rendering
- no registry metadata rewrite
- no state writes beyond pre-existing layout creation behavior
- no active-vault writes
- no model invocation, review tick, confirmation request, confirmation
  execution, audit, promotion, skill revision, shell command execution, or chain
  repair

An operator may inspect reused-skill coverage for one SOP through
`review coverage --sop <sop>`.

Required policy:

- requires a SOP draft id or state draft ref
- reads the selected state SOP draft
- reads the SOP Evolution Ledger for recorded duplicate skill refs and evidence
  refs
- reads active-vault skill registry metadata and current recall hit metadata
- returns `covered`, `drifted`, `missing_skill`, or `no_reuse_evidence`
- returns recorded duplicate skill refs, current duplicate skill ref, bounded
  recall hit metadata, missing refs, evidence refs, and next-step guidance
- Opportunity Backlog, Governance Queue context, governance status, and Feishu
  opportunity rendering may embed a bounded summary for `revise_skill` items
  when the SOP chain can be resolved
- missing coverage evidence must not hide the underlying inbox or confirmation
  item from read models
- no raw skill body rendering
- no state writes beyond pre-existing layout creation behavior
- no active-vault writes
- no validation event append
- no model invocation, review tick, confirmation request, confirmation
  execution, audit, promotion, skill revision, shell command execution, or chain
  repair

An operator may request confirmation for a structured SOP evolution next command
through `review request-sop-confirmation --sop <sop>`.

Required policy:

- reads the current SOP Evolution Ledger
- requires the target chain to expose a structured `next_command`
- writes a pending `autonomy/followups/*.json` confirmation with
  `source=sop_evolution_chain`
- writes a Markdown confirmation and episode evidence
- does not execute the command, audit, promote, write the active vault, invoke
  the model, run shell commands, or read raw SOP/skill bodies
- review confirmation summary/detail read models expose the confirmation source
  and SOP id/ref for operator visibility only
- bounded Governance Queue context may include the same source/SOP refs without
  raw SOP body, skill body, command, or safety-boundary content
- read models may expose derived `sop_evolution_gate=current|stale|executed`
  readiness with a stable `reason_code` by re-reading the current SOP Evolution
  Ledger and comparing action id, kind, required refs, and write boundary
- read models may filter confirmation summaries by that derived gate state for
  operator triage, but the filter must not persist the derived status
- list read models may expose `sop_evolution_gate_summary` counts by gate status
  and reason code for operator diagnostics
- stale SOP-chain confirmation read models may expose
  `sop_evolution_recovery` with a fresh confirmation request command for
  operator guidance only
- stale recovery may include a reason-coded `playbook` with a summary, a
  read-only `governance evolution` inspect command, and next steps
- `review decide-sop-recovery` may append an operator decision to
  `autonomy/sop-recovery-decisions.jsonl` only after revalidating that the target
  confirmation is still a stale SOP-chain gate
- stale recovery read models may merge the latest recovery decision for
  visibility, but that decision is not execution authority
- Opportunity Backlog may use the latest recovery decision to rank or hide stale
  SOP-chain confirmations; `historical` and `fresh_requested` suppress the old
  stale gate, while `open` and `deferred` remain visible for operator attention
- stale readiness must not mutate confirmation artifacts, execute confirmations,
  automatically request replacements, or replace execution-time revalidation
- `review execute-confirmed-follow-up` must re-read the current SOP Evolution
  Ledger and verify action id, kind, required refs, and write boundary still
  match before executing an SOP-chain confirmation

## Local IM Rules

IM is a local foreground or single-user service entrypoint. Feishu is the first
provider.

First-version IM supports:

- private text messages
- optional allowlist
- inbound evidence
- ack response
- final response
- duplicate message-id suppression
- error evidence and fixed error response
- local service status, bounded health, logs, heartbeat, and copied-runtime
  build metadata when service mode is enabled
- bounded local conversation history for normal private-chat task context
- bounded same-sender in-memory follow-up queue for normal private-chat tasks
- state-only operator notification outbox drained by the resident Feishu
  service
- read-only local operator commands in private chat:
  `/status`, `/config`, `/runtime config`, `/service config`, `/health`,
  `/service health`, `/logs [lines]`, `/service logs [lines]`,
  `/governance`, `/evolution`,
  `/governance evolution`, `/help`, `/context`,
  `/context <ref-or-id>`, `/memory search <query>`,
  `/memory session <session-id>`, `/recap`, `/recap <session-id>`,
  `/memory recap`, `/memory recap <session-id>`, `/memory candidates`,
  `/memory candidate <ref-or-id>`, `/memory confirmations`,
  `/memory confirmation <ref-or-id>`, `/memory accepted`,
  `/memory accepted <ref-or-id>`, `/review reports`,
  `/review report <ref-or-id>`, `/review completions`,
  `/review completion <ref-or-id>`, `/review inbox`, `/review inbox all`,
  `/review inbox executed`, `/review inbox <ref-or-id>`,
  `/review confirmations`, `/review confirmation <ref-or-id>`,
  `/review traces`, and `/review trace <ref-or-id>`

Read-only IM operator commands may read bounded service health, service
heartbeat, copied-runtime build metadata exposed by the heartbeat, fixed-path
service log tails, review tick status, active autonomy pause status, context
manifest read models, memory candidate read models, memory confirmation read
models, accepted semantic memory read models, bounded episode-memory read
models, review inbox read models, review tick history read models, background
review history read models, completion verification read models, live run trace
read models, review follow-up confirmation read models, SOP evolution ledger
read models, safe runtime config summaries, and aggregate governance status.
They may render explicit CLI next-step commands for the operator. They must not
invoke the model, request confirmations, execute follow-up actions, build new
context, read raw review Markdown, read raw context Markdown, read raw episode
artifacts, draft, audit, promote, revise skills, write the active vault, or run
shell commands.
Service health commands may read only `services/im/heartbeat.json`,
`services/im/review_tick.json`, `services/im/content_daily.json`,
`services/im/content_feedback_refresh.json`,
`services/im/content_creator_metrics.json`, and
`autonomy/runs/pause_signal.json` under the selected state root, plus bounded
repo git identity from `.git/HEAD`, loose refs, and `packed-refs`. They derive
heartbeat freshness, runtime-build summary, repo HEAD summary, resident
deployment status, review tick focus, content daily status, feedback refresh
status, pause status, and layered `runtime_substrate` versus
`application_slices` reason codes, but they must not inspect launchd, read logs,
run shell commands, invoke the model, restart services, read source file bodies,
fetch platform state, publish externally, or mutate state.
When service health reports `status_reasons`, it may also return
`attention_followups`: structured, read-only operator guidance derived from
those reason codes. These follow-ups may name bounded inspect, workspace-status,
resume, or restart commands, but service health must not execute them or treat
the guidance as proof that the issue was repaired.
The CLI `service health` command returns this same read model with
`action=health` and `target=im`; it is intentionally separate from
`service status`, which may inspect launchd and service log locations.
Opportunity Backlog may use the same bounded service health read model to
create a `service_health` attention item when the resident deployment is stale
against repo HEAD, but it inherits the same read-only boundary and
service-control prohibition. Its inspect and restart guidance should use the
default service commands without a `--state-root <state-root>` placeholder
unless an explicit alternate service state root is in scope.
Service log commands may read only `<LOCAL_RUNTIME_HOME>/logs/im.out.log` and
`<LOCAL_RUNTIME_HOME>/logs/im.err.log`, tail bounded lines, and accept no
operator-provided filesystem path.

Runtime config summary commands may read only `config.jsonl`, `models.jsonl`,
and `settings.jsonl` from the configured repo, home, and state config layers.
They may show active model/channel/scenario selectors, non-secret text and
image model metadata such as base URL, auth id, max output tokens, optional
`context_window_tokens`, and derived context budget thresholds, Feishu
follow-up queue size, runtime promotion and review tick flags, runtime source
refs, defaulted runtime fields, vault roots, and restart guidance. They must
not read `auth.jsonl`, API keys, app secrets, state runtime artifacts outside
config layers, launchd, service logs, raw context, review, episode, SOP, or
skill bodies; they must not mutate config, write state, restart services,
invoke the model, run review tick, request confirmations, execute follow-ups,
or run shell commands.

`config set-runtime` is the scoped local runtime config mutation path. It may
append one non-secret `runtime` record to `<LOCAL_RUNTIME_HOME>/config/config.jsonl`
after validating the requested runtime fields. It may report the appended ref,
changed fields, before/after non-secret runtime summaries, and restart
guidance. It must not read or write `auth.jsonl`, print secrets, restart
services, invoke the model, fetch sources, publish externally, mutate repo
files, write the active vault, or bypass the resident daily external-write
confirmation guard.

Feishu `/memory search <query>` and `/memory session <session-id>` may render
bounded episode-memory summaries from `memory/episodes/events.jsonl`. Feishu
`/recap` and `/recap <session-id>` may summarize one local session from episode
event metadata, completion report metadata, context manifest metadata, and
bounded working checkpoint metadata. These are operator inspection views only.
They must not rebuild the SQLite MemoryStore index, read raw episode artifacts,
read raw context Markdown, read raw model/tool/final-response artifacts, invoke
the model, request or execute confirmations, write durable memory, write the
active vault, or run shell commands.

Feishu `/memory candidate <ref-or-id>` may render the matching CLI
`memory request-candidate-confirmation --candidate <candidate>` command as
operator guidance for eligible candidates. For candidates that already have a
pending confirmation or accepted memory, it may render the matching read-only
inspection command instead. Feishu must not request the confirmation, execute
the confirmation, accept memory, rebuild the MemoryStore index, invoke the
model, write the active vault, or run shell commands.

Feishu `/review confirmation <ref-or-id>` may render the matching CLI
`review execute-confirmed-follow-up --confirmation <confirmation>` command as
operator guidance for pending follow-up confirmations. For confirmations that
have already executed, it must not render a new execution command. Feishu must
not execute follow-up actions, draft, audit, promote, revise skills, collect
evidence, run narrowed background review, invoke the model, write the active
vault, or run shell commands.

Feishu `/memory confirmation <ref-or-id>` may render the matching CLI
`memory execute-candidate-confirmation --confirmation <confirmation>` command
as operator guidance for pending memory candidate confirmations. For
confirmations that have already executed, it must not render a new execution
command. Feishu must not execute memory confirmations, accept memory, rebuild
the MemoryStore index, invoke the model, write the active vault, or run shell
commands.

Normal private-chat tasks may read recent local channel state for the same
private chat and include a small truncated history window in the accepted task.
The history window may contain prior inbound text and prior outbound final
replies only when both sides match the same `open_id` and `chat_id`. Outbound
records without a `chat_id` are not eligible for history injection because the
runtime cannot prove they belong to the same private chat. It must not fetch
remote chat history, include raw event payloads, dump unbounded transcripts, mix
other open ids or chats, rebuild MemoryStore indexes, or act as a second
long-term memory source.

Normal private-chat messages from an `open_id` that already has an active run
may enter a bounded in-memory follow-up queue for that same `open_id`. The
adapter sends the configured queued response, records a queued trace artifact
under `channels/feishu/queued/`, and drains queued messages after the current
run reaches its local boundary. Queue-full messages may receive the configured
busy response. This queue is process-local scheduling only. It must not apply
to operator commands, cross users, group chats, remote Feishu state, service
restart recovery, multi-process coordination, durable replay, steering,
cancel/resume semantics, model invocation outside the normal task runner, or
self-evolution confirmation execution.

Operator progress notifications are not Feishu operator commands and are not a
general send API. `notify queue` writes a local request under
`operator/notifications/outbox/`; the CLI must not call Feishu directly. The
resident Feishu service may poll queued requests, apply the same `open_id`
allowlist as inbound private chat, send text through the configured Feishu
transport, record bounded channel events, and mark each request `sent` or
`failed`. Failed or denied requests must remain visible in state for operator
inspection.

First-version IM does not support:

- group chat
- attachments
- interactive cards
- multi-user service behavior
- hosted daemon behavior
- hosted deployment

## Governance Status Read Model Rules

An operator may inspect aggregate governance status without triggering any
follow-up path.

Required policy:

- `governance status` returns memory candidate counts, memory confirmation
  counts, accepted semantic memory count, review inbox counts, review
  confirmation counts, ranked Opportunity Backlog counts and top bounded
  attention item, optional top `reused_skill_coverage` summary, optional top
  `service_health` summary, optional top `working_checkpoint` summary,
  optional top `selected_skill_drift` summary,
  optional top `selected_skill_outcome` summary, latest refs, service
  heartbeat with copied-runtime build metadata, review tick status, and active
  autonomy pause status
- Feishu `/governance` and `/governance status` render the same state as a
  concise local operator view
- counts are derived from existing state artifacts under `memory/semantic/`,
  `autonomy/inbox/`, `autonomy/followups/`, `services/im/`,
  `autonomy/opportunities.jsonl`, SOP evolution state, and
  `autonomy/runs/pause_signal.json`
- no confirmation request creation
- no confirmation execution
- no background review, review tick, or follow-up execution
- no MemoryStore rebuild
- no state mutation beyond normal operator channel artifacts
- no active-vault writes
- no raw selected skill body, raw context Markdown, or raw final-response
  artifact rendering
- no model invocation or shell command execution

## Local Learning Rules

SOPs and skills are optional local learning artifacts.

The harness may promote a local skill only when evidence, trigger, verification,
failure mode, and rollback or retirement text are present. A recalled skill that
already covers a new SOP candidate should block duplicate promotion.

Normal task success does not require a new skill.

## Implementation Shape

```text
apps/cli/src/main.ts                  # local CLI surface
packages/core/src/schemas.ts          # runtime schemas
packages/core/src/context.ts          # bounded context assembly
packages/core/src/pipeline_history.ts # pipeline history read model
packages/core/src/task_context_references.ts # bounded @file/@folder task refs
packages/core/src/tool_contracts.ts   # core tool descriptions
packages/core/src/audit.ts            # local SOP audit
packages/core/src/skill_resolver.ts   # local active vault and seed roots
packages/core/src/skill_registry.ts   # local skill validation and registry
packages/core/src/memory_store.ts     # episode memory FTS index
packages/runtime/src/config.ts        # JSONL config loader
packages/runtime/src/model.ts         # model adapter
packages/runtime/src/background_review.ts # proposal-only background review
packages/runtime/src/tools.ts         # core tool execution
packages/runtime/src/runner.ts        # live local run
packages/runtime/src/stage_runner.ts  # short local stages
packages/runtime/src/service.ts       # local service install/status/logs
packages/runtime/src/channels/feishu/ # first IM provider
```

## Command Contract

Target first-version commands:

```bash
pnpm run runtime -- doctor
pnpm run runtime -- doctor --no-auth
pnpm run runtime -- doctor --no-im
pnpm run runtime -- config --state-root .runtime/state
pnpm run runtime -- live --query-todo --task "..." --state-root .runtime/state
pnpm run runtime -- pipeline --query-todo --task "..." --stages intake,tool_check,final --state-root .runtime/stage
pnpm run runtime -- pipeline resume --pipeline pipeline_run_... --from-stage tool_check --state-root .runtime/state
pnpm run runtime -- pipeline runs --state-root .runtime/state
pnpm run runtime -- pipeline runs --pipeline pipeline_run_... --state-root .runtime/state
pnpm run runtime -- im serve --scenario im-default --state-root .runtime/state
pnpm run runtime -- service install|start|stop|restart|status|logs|uninstall --target im
pnpm run runtime -- workspace status --state-root .runtime/state
pnpm run runtime -- workspace runtime --state-root .runtime/state
pnpm run runtime -- skills [--skill-name skill-name|vault/skills/name/SKILL.md]
pnpm run runtime -- skills --action validate
pnpm run runtime -- skills retire-event --event skill_event_... --reason "..." --state-root .runtime/state
pnpm run runtime -- memory status|sync|search|session|archive|archives|archive-health|layers|working|dream|dreams|propose-candidate|candidates|confirmations|accepted --state-root .runtime/state
pnpm run runtime -- memory archive-health --archive 2026-06-30 --state-root .runtime/state
pnpm run runtime -- memory layers --state-root .runtime/state
pnpm run runtime -- memory working --checkpoint memory/working/current.json --state-root .runtime/state
pnpm run runtime -- memory dream --state-root .runtime/state
pnpm run runtime -- memory dreams --dream memory/dreams/... --state-root .runtime/state
pnpm run runtime -- memory propose-candidate --summary "..." --content "..." --state-root .runtime/state
pnpm run runtime -- memory candidates --candidate memory/semantic/candidates/... --state-root .runtime/state
pnpm run runtime -- memory confirmations --confirmation memory/semantic/confirmations/... --state-root .runtime/state
pnpm run runtime -- memory accepted --semantic memory/semantic/accepted/... --state-root .runtime/state
pnpm run runtime -- memory request-candidate-confirmation --candidate memory/semantic/candidates/... --state-root .runtime/state
pnpm run runtime -- memory execute-candidate-confirmation --confirmation memory/semantic/confirmations/... --state-root .runtime/state
pnpm run runtime -- governance status|opportunities|evolution|gaps|scorecard|project-design|experts|iterations --state-root .runtime/state
pnpm run runtime -- governance project-design --artifact ga_design_artifact_iteration_contract_... --state-root .runtime/state
pnpm run runtime -- governance project-design --audit-seed verification_scope --state-root .runtime/state
pnpm run runtime -- governance experts --gate core_boundary_review --state-root .runtime/state
pnpm run runtime -- governance record-iteration --summary "..." --layer core_runtime --owner-surface runtime_contract --proposed-slice self_evolution_iteration_contract --state-root .runtime/state
pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root .runtime/state
pnpm run runtime -- governance iterations --iteration iteration_contract_... --audit-seed all --state-root .runtime/state
pnpm run runtime -- governance iterations --iteration iteration_contract_... --audit-seed verification_scope --state-root .runtime/state
pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_... --outcome-status verified --summary "..." --state-root .runtime/state
pnpm run runtime -- context list|show|usage|pressure|health|repair [--context <ref-or-id>] --state-root .runtime/state
pnpm run runtime -- review background --state-root .runtime/state
pnpm run runtime -- review reports --state-root .runtime/state
pnpm run runtime -- review reports --review background_review_... --state-root .runtime/state
pnpm run runtime -- review completions --state-root .runtime/state
pnpm run runtime -- review completions --completion completion_verification_... --state-root .runtime/state
pnpm run runtime -- review traces --state-root .runtime/state
pnpm run runtime -- review traces --trace completion_verification_... --state-root .runtime/state
pnpm run runtime -- review tick --state-root .runtime/state
pnpm run runtime -- review ticks --state-root .runtime/state
pnpm run runtime -- review ticks --tick review_tick_... --state-root .runtime/state
pnpm run runtime -- review inbox --status active|all|open|confirmation_requested|executed --state-root .runtime/state
pnpm run runtime -- review confirmations --gate all|current|stale|executed --state-root .runtime/state
pnpm run runtime -- review confirmations --confirmation follow_up_confirmation_... --state-root .runtime/state
pnpm run runtime -- review request-inbox-confirmation --item review_inbox_... --state-root .runtime/state
pnpm run runtime -- review decide-inbox --item review_inbox_... --status open|deferred|completed|retired --reason "..." --state-root .runtime/state
pnpm run runtime -- review plan-follow-up --review background_review_... --proposal review_proposal_... --state-root .runtime/state
pnpm run runtime -- review execute-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime/state
pnpm run runtime -- review request-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime/state
pnpm run runtime -- review execute-confirmed-follow-up --confirmation follow_up_confirmation_... --state-root .runtime/state
pnpm run runtime -- review request-sop-confirmation --sop sop_... --state-root .runtime/state
pnpm run runtime -- review draft-sop --review background_review_... --proposal review_proposal_... --state-root .runtime/state
pnpm run runtime -- review audit-sop --sop sop_... --state-root .runtime/state
pnpm run runtime -- review promote-sop --sop sop_... --audit audit_... --state-root .runtime/state
pnpm run runtime -- review chain --sop sop_... --state-root .runtime/state
pnpm run runtime -- review coverage --sop sop_... --state-root .runtime/state
pnpm run runtime -- show-events --state-root .runtime/state
```

Implementation note: the core-tool surface and IM command surface match this
first-version command contract.

Repo-local runtime artifacts should stay under `.runtime/`: `.runtime/state`
for default interactive state, `.runtime/stage` for pipeline experiments, and
`.runtime/smoke/<name>` for one-off smoke runs. Top-level `.runtime-*` and
`.runtime_*` directories are unsupported and should be deleted or moved into
the supported `.runtime/` layout. Resident service state keeps its existing
checkout-independent default under `<LOCAL_RUNTIME_HOME>/state/runtime` unless
an operator explicitly passes `--state-root`.

## Explicit Non-Goals

- no open-source compatibility design
- no multi-user service design
- no multi-machine local learning sharing
- no public skill marketplace
- no GUI
- no hosted or multi-user daemon
- no Docker or Kubernetes deployment
- no broad external agent team runtime
- no automatic core self-rewrite
