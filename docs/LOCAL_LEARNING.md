# Local Learning

Local learning is the experimental first-version layer that turns local evidence
into reusable local procedures. It is useful, but it is not the center of the
first-version product boundary.

## Boundary

The first version supports learning on one machine:

- evidence captured in the selected state root
- searchable episode evidence through the local MemoryStore
- SOP drafts produced from local runs
- autonomous audit of SOP candidates
- optional promotion into the local active vault
- recall of local skills in later runs
- duplicate-skill avoidance when recall already covers the candidate
- proposal-only background review over episode memory

The first version does not support:

- shared skill repositories
- public skill marketplaces
- multi-user skill ownership
- multi-machine vault sharing
- cross-node conflict handling
- compatibility promises for external runtimes

## Local Active Vault

The active local vault lives under `LOCAL_RUNTIME_HOME`:

```text
<LOCAL_RUNTIME_HOME>/vault/
├── sop/
│   ├── drafts/
│   └── promoted/
├── skill-candidates/
├── skills/
└── registry/
    ├── skills.jsonl
    └── skill-events.jsonl
```

Repository `vault/` and `skills/` are seed/dev fixtures. They can provide sample
skills and test fixtures, but the local active vault is the runtime write target
for promoted procedures.

## Skill Package Shape

An active skill lives at:

```text
<active-vault>/skills/<skill-name>/SKILL.md
```

The package shape is:

```text
skill-name/
├── SKILL.md
├── scripts/
├── references/
└── assets/
```

Only `SKILL.md` is required. Its frontmatter stays portable:

```yaml
---
name: lower-case-hyphen-name
description: Clear trigger and scope.
---
```

Agent-owned metadata belongs in the local registry files, not in portable
skill frontmatter.

## Promotion Flow

The model may propose an SOP. The harness owns the decision.

```text
model proposes SOP
  -> harness writes state SOP draft
  -> harness writes local active-vault SOP draft
  -> autonomous SOP audit runs
  -> duplicate recalled-skill check runs
  -> if accepted, harness writes promoted SOP
  -> harness writes local skill candidate
  -> harness validates frontmatter
  -> harness writes active-vault skill
  -> harness updates local registry and event log
  -> later runs may recall the skill
```

The model must not claim that a skill has been promoted. Promotion is a harness
result backed by local evidence.

## Reuse Before Promotion

Local learning is self-growth. It preserves useful procedures; it is not the
primary loop for changing the runtime core.

Before proposing or promoting a new SOP or skill, check whether an existing
runtime command, adapter, delegated agent surface, SOP, skill, or documented
workflow already covers the need. If an existing surface nearly covers it,
prefer improving invocation guidance, verification, or examples before creating
a duplicate procedure.

A task being successful, long, or interesting is not enough to create durable
learning. A candidate needs a reusable trigger, bounded steps, concrete
evidence, verification commands, failure modes, and rollback or retirement
notes.

Reject SOP or skill promotion when any of these are true:

- an existing command, adapter, delegated surface, SOP, skill, or documented
  workflow already covers the need
- the task was one-off, exploratory, or mainly project-specific
- the candidate has no clear future trigger
- the candidate cannot name bounded steps and required inputs
- the candidate has no verification command or acceptance evidence
- the candidate has no known failure mode, rollback, or retirement rule
- promotion would bypass context, harness, completion, or operator-inspection
  gates

Self-iteration work that improves context assembly, harness validation, tool
boundaries, evidence capture, completion checks, recovery, or operator
inspection belongs in the runtime contract and Trellis task governance before it
becomes a local-learning artifact.

## CLI

Validate local seed and active skill packages:

```bash
pnpm run runtime -- skills --action validate
```

List resolver entries:

```bash
pnpm run runtime -- skills --action list
pnpm run runtime -- skills --skill-name skill-name
```

Rebuild the local registry snapshot:

```bash
pnpm run runtime -- skills --action sync
```

The `sync` action name means local registry rebuild only. It is not
multi-machine skill sharing. Sync appends bounded `synced` skill registry
events for entries that were created or changed by the rebuild, and appends no
events when the registry snapshot is already current.

Rebuild and query episode evidence:

```bash
pnpm run runtime -- memory sync --state-root .runtime/state
pnpm run runtime -- memory search --query "feishu" --state-root .runtime/state
pnpm run runtime -- memory session --session session_... --state-root .runtime/state
pnpm run runtime -- memory recap --session session_... --state-root .runtime/state
pnpm run runtime -- memory archive --state-root .runtime/state
pnpm run runtime -- memory archives --state-root .runtime/state
pnpm run runtime -- memory archive-health --state-root .runtime/state
pnpm run runtime -- memory layers --state-root .runtime/state
pnpm run runtime -- memory dream --state-root .runtime/state
pnpm run runtime -- memory dreams --state-root .runtime/state
```

The MemoryStore index is local and rebuildable. It does not replace the episode
JSONL log, and it is not vector or hybrid search.

`memory layers` is a read-only diagnostic for the attention budget. It reports
which memory and local-learning layers feed selected context, on-demand recall,
bounded governance context, selected-skill recall quality, or diagnostics only.
It does not rebuild the MemoryStore index, render semantic memory content, read
raw episode artifacts, execute confirmations, mutate state, or invoke the
model.

`memory dream` records a deterministic long-horizon dream snapshot under
`memory/dreams/` from accepted semantic memory, recent self-evolution iteration
contracts, the latest verified iteration outcome, the bounded capability
catalog, and current Opportunity Backlog pressure. `memory dreams` lists or
inspects those snapshots. Dreams are planning context only; their
`latest_iteration_outcome` field preserves verification context but does not
execute backlog items, call models, promote SOPs, write skills, publish
externally, or prove that a goal is complete.

Daily episode archives are deterministic bounded summaries generated from the
append-only episode JSONL. `memory archive-health` compares event metadata with
archive metadata and can surface missing or stale archive summaries in the
Opportunity Backlog. The current UTC day is reported separately as `open_day`:
its archive may be missing or lagging while events are still arriving, and only
becomes a missing/stale issue after UTC rollover. It does not read raw episode artifacts, generate archives,
or invoke the model; refreshing archives remains the explicit `memory archive`
operator action.

Session recap is another read-only view over the same append-only episode
evidence. `memory recap`, Feishu `/recap`, and their session-scoped variants
summarize event kind counts, latest task, completion status, context manifest
metadata, working checkpoint metadata, recent event summaries, refs, and next
inspection commands. They do not read raw context Markdown, raw model/tool
artifacts, final responses, or skill bodies, and they do not rebuild indexes or
mutate learning state.

When skill recall selects a local skill for live context, the `Selected Skills`
section shows the recall metadata first: skill name, instructions ref,
metadata ref, source, score, and any bounded outcome-quality adjustment. The
selected `SKILL.md` instructions then follow as bounded procedure context.
Usage telemetry is still written after the run by the harness; the context
section only explains why the skill was injected.

Skill recall is outcome-aware but not self-editing. Before selecting skills for
live context, recall reads recent selected-skill outcome summaries from
`memory/skills/usage/*.json`, applies a small bonus for verified passed runs,
and applies a capped penalty for failed, skipped, blocked, unfinished, or
unverified runs. The model sees only aggregate counts, adjustment, and latest
outcome ref; raw prior contexts, final responses, completion Markdown, and
skill bodies are not read for this scoring step.

Operators can inspect current skill catalog metadata without reading raw skill
bodies through `skills`, `skills --skill-name <name-or-ref>`, Feishu `/skills`,
and Feishu `/skill <name-or-ref>`. These views show bounded frontmatter and
registry fields such as source, status, trust level, refs, version, and usage
counters. They do not rewrite registry metadata, mutate skill files, write the
active vault, invoke the model, or run shell commands.

Operators can inspect self-evolution maturity through
`governance scorecard`. The scorecard reads only capability catalog metadata,
memory-layer diagnostics, accepted dream snapshots, the SOP evolution ledger,
and the Opportunity Backlog. It classifies current progress across core GA
design, basic runtime substrate, general-agent delegation, SOP/skill/memory
loop, and memory/dream direction. Its review lenses are advisory context, not
delegated agents, and the command never promotes SOPs, writes skills, invokes
models, or proves completion.
The scorecard also emits `default_next_slice`, `next_core_basic_slice`, and
`next_slices`. `default_next_slice` is the bounded core/basic planning outlet by
default. `next_slices` stays read-only, all-dimension prioritization context
derived from dimension stage, score, and layer; it may surface local-learning
SOP follow-ups first, but those hints must not redefine the agent's core
capability direction or execute the slice.
`governance project-design` exposes the core GA project design contract. It
keeps goal intake, capability layering, contract design, execution planning,
verification review, and learning persistence as the reusable loop before a
project slice is treated as durable progress. It is read-only and does not
execute tools, create projects, spawn experts, promote memories, or prove
completion.
Verified self-evolution iteration outcomes can also appear there as read-only
project-design artifacts. They are reusable GA design lessons, not state
writes, SOP drafts, skill promotion, or future completion proof.
If the latest reusable artifact is core/basic, `project-design` also emits
`next_core_basic_plan`, an advisory planning packet with phase gates,
acceptance criteria, verification commands, non-goals, selection readiness, and
completion-audit seeds. It is not an execution plan, backlog write, SOP draft,
or completion claim. Its `acceptance_trace` can map each criterion to required
verification entrypoints and outcome claim prefixes, but that trace is review
guidance only and does not promote SOPs, skills, memory, or dreams.
Operators can record the layer discipline for a major iteration through
`governance record-iteration`. The record declares whether the work is
`core_runtime`, `basic_entrypoint`, `local_learning`, `application_slice`, or
`boundary`, plus owner surface, proposed slice, evidence refs, verification
commands, non-goals, and advisory expert roles. `governance iterations` lists
or inspects these records. They are context and governance evidence only; they
do not execute work, write repo files, write the active vault, promote SOPs, or
prove completion.
`governance experts` exposes the matching read-only expert orchestration
contract. It defines advisory roles, scheduling boundaries, and main-thread
verification authority; it does not spawn expert agents, call multiple models,
execute tools, mutate state, or prove completion.
The same contract includes delegation gates for core-boundary, runtime-health,
learning-persistence, and delegation-budget reviews. Each gate names trigger,
required inputs, expected output, rejection cases, and main-runtime completion
authority before advice can affect an iteration.
`governance experts --gate <gate-id>` turns one gate into a read-only advisory
plan packet. The packet can guide a review, but it cannot call experts, execute
recommendations, promote memory/SOP/skills, or prove completion.
If an active dream snapshot exists, low-maturity scorecard dimensions can become
proposal-only `governance gaps` items. The general-agent delegation gap is
suppressed once `delegate_agent` exists in the harness action catalog; any
future durable SOP or skill still moves through the normal review, audit, and
promotion gates.
Verified self-evolution iteration outcomes can also become SOP-candidate gaps
when no state-only SOP draft cites the iteration yet. This preserves reusable
learning pressure without auto-drafting, auditing, promoting, accepting memory,
or writing the active vault.

Operators can also inspect active-vault skill registry health through
`skills health`, `skills health --skill-name <name>`, Feishu `/skill health`,
and Feishu `/skill health <name>`. This read model compares registry JSONL,
current skill frontmatter, hashes, and skill registry event metadata. It can
surface missing packages, invalid frontmatter, metadata drift, orphan packages,
invalid event rows, and orphan events in the Opportunity Backlog as
`skill_registry_health`; it never reads raw skill bodies, rewrites the registry,
promotes SOPs, invokes the model, or runs shell commands.

Historical orphan skill registry events are closed through
`skills retire-event --event <ref-or-id> --reason "..."`. The command appends
one bounded `retired` event to `registry/skill-events.jsonl`; it does not
delete old events, rewrite `registry/skills.jsonl`, restore or delete skill
packages, read raw skill bodies, invoke the model, or run shell commands.
`skills health` treats the latest `retired` event for the same skill and
instructions ref as the close signal for that orphan event chain.

After the run finishes, selected-skill usage is recorded in two layers. The
active-vault registry keeps aggregate `use_count` and `last_used_at`. The
state root keeps per-run outcome artifacts under `memory/skills/usage/`, linked
from `skill_usage` episode events. Those artifacts cite the selected skill,
context manifest, completion verification report, final response, completion
status, verification status, and final verdict. They describe observed outcome,
not causal effectiveness.

Failed, skipped, blocked, unfinished, or unverified selected-skill outcomes also
feed the ranked Opportunity Backlog as `selected_skill_outcome` items. Passed
outcomes remain evidence only. This lets context assembly and unscoped review
tick notice skill drift signals without reading raw skill bodies, context
Markdown, or final-response artifacts. Governance status and Feishu operator
views can show the top bounded selected-skill outcome summary so the operator
sees the skill ref, verification status, completion report ref, and verdict
before choosing whether any skill revision work is warranted. Operators can
inspect the selected-skill outcome history with `skills outcomes` or Feishu
`/skill outcomes`; those views read only the outcome JSON metadata and linked
refs.
When the same selected skill repeatedly produces attention outcomes, the
read-only drift summary groups those outcomes by skill. `skills drifts`,
`skills drifts --skill-name <name>`, Feishu `/skill drifts`, and Feishu
`/skill drift <skill-name>` show aggregate counts and latest refs only. The
summary is a diagnosis input for later review; it does not prove causal skill
effectiveness and it never revises, retires, or mutates the skill by itself.
When review tick focuses selected-skill outcome or drift telemetry, background
review may turn matching `skill_usage` events into a `skill_revision` proposal
and a gated `revise_skill` inbox item. The confirmation next step points at
`skills outcomes --outcome ...`; confirmed execution still appends only
`validated` skill registry events and never rewrites `SKILL.md`.

Live runs use the same append-only episode evidence for bounded recall without
rebuilding the SQLite index on the service hot path. The context bundle
receives only matching event summaries, session ids, kinds, scores, and
artifact refs. It does not inject raw session artifacts or entire transcripts.

Live tasks may also include explicit bounded repo references in the accepted
goal:

```text
@file:docs/RUNTIME_CONTRACT.md
@file:docs/RUNTIME_CONTRACT.md:120-160
@file:"docs/release notes.md":1-20
@folder:docs
```

When present, later context includes a `Task References` section. File refs are
repo-local and line-bounded; folder refs list bounded file paths only and do not
read folder file bodies. The feature does not read state files, home files,
absolute paths, parent traversal, URLs, git diffs, or shell output, and it does
not treat referenced content as completion evidence.

Live model actions may also record governance candidates without promotion.
`propose_memory` writes a candidate under `memory/semantic/candidates/` and
appends episode evidence. `request_audit` writes a requested audit artifact
under `governance/audits/` and appends episode evidence. These actions do not
update durable memory, core files, SOP status, skills, confirmations, or the
active vault.

`update_working_state` writes bounded checkpoints under `memory/working/`. Later
live context selects the latest working checkpoint, preferring
`memory/working/current.json`, and injects only its structured fields and
evidence refs. It does not read the referenced evidence artifacts or treat the
checkpoint as proof of completion.

Operators can inspect the same bounded progress state with `memory working`,
`memory working --checkpoint <ref-or-id>`, Feishu `/working`, and Feishu
`/working <ref-or-id>`. Governance status also includes the current checkpoint
summary. These views are continuity signals for a later run; they do not resume
the goal loop, execute the next action, invoke the model, read raw evidence
artifacts, or mutate state.

Each live run also writes a completion verification report under
`memory/episodes/<session>-completion-verification.{json,md}`. This is the
harness-owned audit of the final `completion_claim`: final response presence,
claimed verification refs, write/run tool results, delegation results, and
selected observation refs. Later context includes bounded summaries of recent
reports so an agent can see whether prior completion claims passed, failed, or
were skipped. The summary is orientation only; it does not replay evidence or
prove the current task is done.
Failed or skipped reports also appear as read-only Opportunity Backlog items so
unscoped review tick can focus the structured report without reading raw
response/tool artifacts or resuming the task.
Operators can inspect the same structured reports through `review completions`
and `review completions --completion <ref-or-id>`, or through Feishu
`/review completions` and `/review completion <ref-or-id>`. These views read
the report JSON only; they do not read raw final responses, tool results, or
completion Markdown.

Operators can also inspect recent live run shape through `review traces` and
`review traces --trace <ref-or-id>`, or through Feishu `/review traces` and
`/review trace <ref-or-id>`. These views reuse the bounded trace read model
from context: completion report refs, completion ids, session/turn ids, event
kind counts, observation counts, per-round action counts, harness state-action
counts, and envelope refs. They do not read raw model responses, action
payloads, tool result bodies, final responses, context Markdown, or harness
artifact bodies, and they do not replay actions or mutate learning state.

Operators can convert one bounded trace into a local replay audit with
`review replay-audit --trace <ref-or-id>`. This is a metadata replay only: it
writes replay reports under `governance/replays/` plus one `audit_result`
episode event, then later context, governance status, and Feishu can cite the
bounded report. It does not call a model, execute tools, read raw run artifacts,
write the repo, write the active vault, or mutate SOP/skill/semantic-memory
state.
Replay history is inspectable with `review replays`,
`review replays --replay <ref-or-id>`, Feishu `/review replays`, and Feishu
`/review replay <ref-or-id>`.

Recent background review also reads the latest bounded working checkpoint as
continuity intake. It may create a `runtime_gap` proposal that cites the
checkpoint ref and evidence refs only, while still producing a memory-gap
proposal when episode evidence is empty. Review tick materializes that proposal
through the existing inbox and confirmation gate; it does not execute the
checkpoint next action or read raw evidence artifacts.

StageRunner pipeline runs are also durable local harness evidence. Later
context and Feishu operator views may summarize recent pipeline run status,
stage status counts, failed or blocked stage ids, checkpoint refs, query/todo
refs, evidence counts, and final response refs. Those summaries do not read raw
stage output Markdown, prompt/model/tool artifacts, query bodies, or pipeline
todo bodies, and they do not prove the current task is complete. Any reusable
procedure found in staged work still needs the explicit SOP or skill
confirmation path.
Blocked or failed StageRunner runs also feed the Opportunity Backlog as
`pipeline_run` items. An unscoped review tick may use one as a bounded focus
query, but it still reads only metadata and does not rerun the pipeline or
repair it automatically. Backlog, context, governance status, and Feishu may
render the explicit inspect and resume CLI commands as operator guidance.
When an operator is ready to continue a blocked staged run, `pipeline resume
--pipeline <ref-or-id>` is the explicit local gate. It may call the model and
stage-allowed tools, writes new attempt refs instead of overwriting failed
attempts, and updates the checkpoint for later context.

Live context also includes a bounded read-only `Service Runtime` section when
the resident runtime heartbeat exists. It summarizes only the heartbeat state and the
copied-runtime build metadata already carried by
`services/runtime/heartbeat.json`, plus service-health reason codes and read-only
follow-up guidance when runtime attention exists. This is runtime orientation
for the model; it does not restart services, read copied-runtime files, run
shell commands, or prove that current repo edits have been deployed.

Live context also includes a bounded read-only `Runtime Config` section when
the runner has an effective config summary. It mirrors the non-secret CLI
`config` surface: active model/channel/scenario selectors, runtime promotion and
review tick flags, source refs, defaulted runtime fields, vault roots, and
restart guidance. It never reads `auth.jsonl`, API keys, app secrets,
non-config runtime state artifacts, logs, raw memory, context, review, SOP, or
skill bodies, and it does not mutate config, restart services, or run review
tick.

Live context also includes a bounded read-only `Live Run Trace` section when
recent live harness runs exist. It summarizes run shape for later SOP and
context review: completion report refs, context refs, event kind counts,
observation counts, per-round action counts, and action envelope refs. It never
renders raw model responses, action payloads, tool result bodies, final response
Markdown, context Markdown, or harness artifact bodies, and it does not rerun
actions or mutate state.

Live context also includes a bounded read-only `Governance Queue` section when
pending local self-evolution work exists. It summarizes memory candidates,
pending memory confirmations, active review inbox items, pending review
follow-up confirmations, and active autonomy pause state by id/status/title/ref
only. It does not inject raw review artifacts, memory candidate content,
confirmation safety boundaries, or command strings, and it does not request or
execute confirmations.

When confirmed self-evolution actions have executed, live context also includes
a bounded read-only `Governance Outcomes` section. It summarizes executed memory
acceptances and review follow-up executions by confirmation id, result kind,
produced refs, evidence id, and execution time. It does not inject raw SOP
drafts, audits, promoted skills, accepted-memory Markdown, safety boundaries,
or command strings, and it does not replay or authorize another execution.

Record and inspect memory proposal candidates without promotion:

```bash
pnpm run runtime -- memory propose-candidate --summary "..." --content "..." --scope local --artifact-ref memory/episodes/events.jsonl --state-root .runtime/state
pnpm run runtime -- memory candidates --state-root .runtime/state
pnpm run runtime -- memory candidates --candidate memory/semantic/candidates/session_...-memory-proposal-r1-0.json --state-root .runtime/state
```

Feishu private chat also supports read-only `/memory candidates` and
`/memory candidate <ref-or-id>`. These commands list or inspect candidates
only; they do not rebuild MemoryStore indexes, promote memory, edit SOPs,
request confirmations, or write the active vault.

Accept a reviewed memory candidate through an explicit local confirmation gate:

```bash
pnpm run runtime -- memory request-candidate-confirmation --candidate memory/semantic/candidates/session_...-memory-proposal-r1-0.json --state-root .runtime/state
pnpm run runtime -- memory execute-candidate-confirmation --confirmation memory/semantic/confirmations/memory_confirmation_123.json --state-root .runtime/state
```

The request step writes a pending confirmation and marks the candidate as
`confirmation_requested`. The execute step re-reads that pending confirmation,
writes accepted local semantic memory under `memory/semantic/accepted/`, marks
the candidate and confirmation as executed/accepted, and appends episode
evidence. Accepted semantic memory is included as a bounded read-only context
section in later live runs. This path writes only local state; it does not
rebuild MemoryStore indexes, write the repository, write the active vault,
revise skills, call the model, or publish externally.

Inspect memory candidate confirmations:

```bash
pnpm run runtime -- memory confirmations --state-root .runtime/state
pnpm run runtime -- memory confirmations --confirmation memory/semantic/confirmations/memory_confirmation_123.json --state-root .runtime/state
```

Feishu private chat also supports read-only `/memory confirmations` and
`/memory confirmation <ref-or-id>`. These commands inspect pending or executed
local confirmation artifacts only; they do not request confirmations, execute
confirmations, accept candidates, rebuild MemoryStore indexes, write
memory/governance mutation state, or call the model. Feishu still records normal
channel operator artifacts.

Inspect accepted semantic memory:

```bash
pnpm run runtime -- memory accepted --state-root .runtime/state
pnpm run runtime -- memory accepted --semantic memory/semantic/accepted/semantic_memory_123.json --state-root .runtime/state
```

Feishu private chat also supports read-only `/memory accepted` and
`/memory accepted <ref-or-id>`. These commands inspect accepted local semantic
memory only; they do not accept candidates, request confirmations, rebuild
MemoryStore indexes, write state, or call the model.

Inspect aggregate governance status:

```bash
pnpm run runtime -- governance status --state-root .runtime/state
```

Feishu private chat also supports read-only `/governance` and
`/governance status`. This view aggregates memory candidates, memory
confirmations, accepted semantic memory, review inbox items, review follow-up
confirmations, the ranked Opportunity Backlog attention summary, service
heartbeat with copied-runtime build metadata, review tick status, and the active
autonomy pause signal. When the top attention item is a selected-skill outcome,
the view may show only bounded refs and status fields. It is for operator triage
only; it does not request confirmations, execute confirmations, run review, run
review tick, rebuild MemoryStore indexes, write state, write the active vault,
render raw artifacts, run shell commands, or call the model.

Inspect effective runtime config without reading secrets:

```bash
pnpm run runtime -- config --state-root .runtime/state
```

Feishu private chat also supports read-only `/config`, `/runtime config`, and
`/service config`. This view shows active model/channel/scenario selectors,
non-secret model metadata, promotion and review tick runtime flags, source row
refs, defaulted runtime fields, vault roots, and restart guidance. It reads only
`config.jsonl`, `models.jsonl`, and `settings.jsonl`; it never reads
`auth.jsonl`, API keys, app secrets, non-config runtime state artifacts, logs,
raw memory, context, review, SOP, or skill bodies, and it does not mutate config
or restart the service.

Inspect SOP and skill evolution across local state and the active vault:

```bash
pnpm run runtime -- governance evolution --state-root .runtime/state
```

Feishu private chat also supports read-only `/evolution` and
`/governance evolution`. This view summarizes state SOP drafts, SOP audits,
review follow-up confirmations, related episode event ids, and active-vault
skill registry events into a compact SOP Evolution Ledger. It does not request
confirmations, execute confirmations, run review tick, read raw SOP or skill
bodies, mutate memory/SOP/skill state, write the active vault, or call the
model.

Open SOP Evolution Ledger chains also feed the ranked Opportunity Backlog. A
draft, audited, revision-needed, or unknown chain can appear as a
`sop_evolution_chain` item with score, action kind, source ref, and bounded
next-step guidance. Chains with an existing pending follow-up confirmation are
not duplicated in the chain-level backlog view because the confirmation itself
is already the actionable item.
`governance act-next` can advance draft or audited `sop_evolution_chain` items
only by requesting the existing SOP next-command confirmation gate. That creates
a pending `autonomy/followups/*.json` request and an
`autonomy/opportunity-actions/*.json` audit record, but it does not execute
`audit_sop` or `promote_sop`, write the active vault, call the model, or run
shell commands.

`pause_autonomy` records a state-only stop signal at
`autonomy/runs/pause_signal.json`. Later context assembly exposes this as
`task_context.stop_signal_active=true` so autonomous exploration can see the
pause. It does not stop the current explicit task, resident service, IM channel,
or local operator commands.

Run a proposal-only background review:

```bash
pnpm run runtime -- review background --state-root .runtime/state
pnpm run runtime -- review background --query "skill promotion" --state-root .runtime/state
pnpm run runtime -- review background --session session_... --state-root .runtime/state
```

Background review writes `autonomy/reviews/*.json` and `autonomy/reviews/*.md`
under the selected state root. It does not create SOP drafts, promote skills,
or write the active vault.

When reviewed episode evidence references state SOP drafts, background review
also includes `chain_summaries`. Chain-aware proposals can distinguish a reused
skill from an audited SOP that still needs an explicit promotion or revision
decision.

Inspect recent background review reports without rerunning background review:

```bash
pnpm run runtime -- review reports --state-root .runtime/state
pnpm run runtime -- review reports --review background_review_... --state-root .runtime/state
```

Feishu private chat also supports read-only `/review reports` and
`/review report <ref-or-id>`. Later context bundles include a bounded
`Background Review History` section. These views read review JSON reports only;
they do not run background review, run review tick, request confirmations,
execute follow-ups, read raw review Markdown, write state, write the active
vault, or call the model.

Plan follow-up actions for one review proposal without executing them:

```bash
pnpm run runtime -- review plan-follow-up --review background_review_... --proposal review_proposal_... --state-root .runtime/state
```

This command returns a dry-run plan with suggested actions, optional commands,
and the write surfaces those actions would touch if executed later. It reads the
review report and selected proposal, uses `chain_summaries` when available, and
does not write state, append episode evidence, write the active vault, draft,
audit, or promote. Follow-up action ids are deterministic for the same
review/proposal pair and action target; they are selectors, not execution
evidence.

Execute a read-only follow-up action:

```bash
pnpm run runtime -- review execute-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime/state
```

This command recomputes the dry-run plan and executes only a selected
`inspect_chain` action by stable id. It returns the SOP provenance chain and
does not write state, append episode evidence, write the active vault, draft,
audit, promote, revise a skill, collect evidence, or rerun background review.

Run one self-evolution review tick:

```bash
pnpm run runtime -- review tick --query "skill promotion" --state-root .runtime/state
```

This command runs background review, plans follow-up actions for each proposal,
and materializes stable state-only inbox items under `autonomy/inbox/`. It also
writes a tick report under `autonomy/ticks/` and appends episode evidence. It
does not request confirmation, execute follow-up actions, draft, audit, promote,
revise a skill, or write the active vault.

When `review tick` runs without an explicit `--query` or `--session`, it also
reads the ranked Opportunity Backlog and records a bounded review focus. Open
SOP evolution chains, open operator opportunities, failed/skipped completion
verification reports, blocked/failed pipeline runs, and failed selected-skill
outcomes may become the tick query. The focus can carry the backlog
`action_chain` as label/effect/reason metadata so later review artifacts show
the intended operator sequence without copying command strings or running them.
When the top item is an attention-worthy `working_checkpoint`, the tick records
that backlog item as focus but keeps recent review scope so background review
can read the bounded latest checkpoint and materialize a `runtime_gap`
`narrow_review` inbox item. It still does not execute the checkpoint next
action or read raw checkpoint evidence.
Active-exploration content runs can also appear as `self_evolution_gap` backlog
items. Missing publication proof, weak source quality, missing post-publish
feedback, and missing creator-backend `view_count` are converted into bounded
proposal items with evidence refs and verification commands. For creator metric
gaps, the action chain can show `content creator-metrics-needed` and
`content channel-readiness --browser-launch-check` as copyable guidance; the
gap also points at `content creator-metrics-capture` for the controlled write
path. The backlog and review tick do not open browsers, read cookies, publish,
or record feedback by themselves.
Pending confirmations and inbox items are already actionable, so the tick
records them as focus and keeps the recent review scope instead of feeding them
back into another query.

Inspect completion verification history without reading raw completion
artifacts:

```bash
pnpm run runtime -- review completions --state-root .runtime/state
pnpm run runtime -- review completions --completion completion_verification_... --state-root .runtime/state
pnpm run runtime -- review traces --state-root .runtime/state
pnpm run runtime -- review traces --trace completion_verification_... --state-root .runtime/state
pnpm run runtime -- review replay-audit --trace completion_verification_... --state-root .runtime/state
pnpm run runtime -- review replays --state-root .runtime/state
pnpm run runtime -- review replays --replay harness_replay_... --state-root .runtime/state
```

Inspect selected-skill outcome history without reading raw skill or run
artifacts:

```bash
pnpm run runtime -- skills outcomes --state-root .runtime/state
pnpm run runtime -- skills outcomes --outcome skill_usage_... --state-root .runtime/state
pnpm run runtime -- skills health --state-root .runtime/state
pnpm run runtime -- skills health --skill-name skill-name --state-root .runtime/state
pnpm run runtime -- skills drifts --state-root .runtime/state
pnpm run runtime -- skills drifts --skill-name skill-name --state-root .runtime/state
pnpm run runtime -- skills retire-event --event skill_event_... --reason "..." --state-root .runtime/state
```

Feishu private chat also supports read-only `/skills` and
`/skill <name-or-ref>`, plus `/skill outcomes`,
`/skill outcome <ref-or-id>`, `/skill drifts`, and
`/skill drift <skill-name>`, plus `/skill health` and
`/skill health <skill-name>`. These commands do not revise skills, mutate the
registry, write the active vault, run review, or render raw artifacts.

Inspect recent review tick history without rerunning autonomous review:

```bash
pnpm run runtime -- review ticks --state-root .runtime/state
pnpm run runtime -- review ticks --tick review_tick_... --state-root .runtime/state
```

Feishu private chat also supports read-only `/review ticks` and
`/review tick <ref-or-id>`. Later context bundles include a bounded
`Review Tick History` section. These views read tick JSON reports only; they do
not run review tick, run background review, request confirmations, execute
follow-ups, read raw tick/review Markdown, write state, write the active vault,
or call the model.

The resident runtime service can run this same tick path on a timer when
`runtime.review_tick_enabled=true`. The service loop is disabled by default,
uses `runtime.review_tick_interval_ms` and `runtime.review_tick_limit`, writes
status plus the latest focus to `services/runtime/review_tick.json`, and keeps the
same state-only boundaries as the CLI tick. If
`autonomy/runs/pause_signal.json` is active, the resident loop writes
`state=paused` and skips the automatic tick.
Feishu `/governance` also renders the latest tick ref and bounded focus summary
from this status file as read-only observability; it does not rerun review tick
or execute the focused follow-up.

Inspect or gate an inbox item:

```bash
pnpm run runtime -- review inbox --state-root .runtime/state
pnpm run runtime -- review inbox --item review_inbox_... --state-root .runtime/state
pnpm run runtime -- review decide-inbox --item review_inbox_... --status deferred --reason "..." --state-root .runtime/state
pnpm run runtime -- review request-inbox-confirmation --item review_inbox_... --state-root .runtime/state
```

The inbox request path reads the current inbox item, recomputes the referenced
follow-up plan through the same confirmation gate, writes a pending
confirmation, marks the inbox item as `confirmation_requested`, and appends
evidence. It does not execute the follow-up action.

If an operator has already handled, deferred, or retired an inbox suggestion,
`review decide-inbox` appends the decision to
`autonomy/review-inbox-decisions.jsonl`. The latest decision is merged into
review inbox read models, Opportunity Backlog ranking, context governance
queue, and Feishu inbox views. `completed` and `retired` remove the item from
active attention; `deferred` keeps it visible at lower priority and blocks
confirmation until an explicit `open` decision reopens it.

Active review inbox views collapse duplicate suggestions before feeding
Opportunity Backlog, context governance queue, governance status, or Feishu
lists. The canonical item carries duplicate refs so the operator can inspect
history, while `/review inbox all` still exposes every raw
`autonomy/inbox/*.json` artifact. Non-canonical duplicates cannot request
confirmation directly.

Feishu private chat also supports read-only `/review inbox`,
`/review inbox all`, `/review inbox executed`, and
`/review inbox <ref-or-id>`. These commands list or inspect review inbox items
without reading raw review artifacts, requesting confirmations, executing
follow-up actions, writing the active vault, or calling the model. The single
item view may show the matching CLI confirmation-request command as operator
guidance, plus the matching CLI decision command; it does not run either
command.

Request confirmation for a mutation follow-up action:

```bash
pnpm run runtime -- review request-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime/state
```

This command recomputes the dry-run plan, selects a mutation action by stable
id, writes `autonomy/followups/*.json` and `autonomy/followups/*.md`, and
appends episode evidence. It records operator intent and expected write
surfaces, but it does not draft, audit, promote, revise a skill, write the
active vault, or execute the selected action.

Inspect follow-up confirmations:

```bash
pnpm run runtime -- review confirmations --state-root .runtime/state
pnpm run runtime -- review confirmations --gate stale --state-root .runtime/state
pnpm run runtime -- review confirmations --confirmation follow_up_confirmation_... --state-root .runtime/state
```

Feishu private chat also supports read-only `/review confirmations` and
`/review confirmations stale|current|executed|all` plus
`/review confirmation <ref-or-id>`. These commands inspect pending or executed
review follow-up confirmations only; they do not request confirmations, execute
follow-up actions, draft, audit, promote, revise a skill, write the active
vault, or call the model. Feishu still records normal channel operator
artifacts.

Execute a confirmed mutation follow-up:

```bash
pnpm run runtime -- review execute-confirmed-follow-up --confirmation follow_up_confirmation_... --state-root .runtime/state
```

This command reads a pending confirmation request, recomputes the follow-up
plan, verifies the selected action still exists, and executes only
`collect_evidence`, `narrow_review`, `draft_sop`, `audit_sop`, `promote_sop`,
or `revise_skill`. It writes evidence-collection,
narrowed-review, draft, audit, promotion, or skill-validation evidence, marks
the confirmation request as `executed`, and appends confirmed-execution
evidence. `collect_evidence` writes a state evidence collection report; it does
not invent missing evidence. `narrow_review` writes a new state review artifact.
`promote_sop` uses the configured local active vault and requires the runtime
promotion gate to be enabled. `revise_skill` uses the configured local active
vault to append `validated` skill registry events; it does not rewrite
`SKILL.md`, repair chains, or execute shell commands. `revise_skill` may be
created from reused-skill SOP chain evidence or selected-skill outcome
telemetry, but both paths stay validation-only.

Create a state-only SOP draft from an eligible proposal:

```bash
pnpm run runtime -- review draft-sop --review background_review_... --proposal review_proposal_... --state-root .runtime/state
```

This command writes `sop/drafts/*.json` and `sop/drafts/*.md` under the selected
state root and appends episode evidence. It does not audit, promote, write the
repository, write the active vault, or create a skill package.

A live model round may also preserve a reusable procedure candidate by emitting
`propose_sop` while `completion_claim.status=not_done`. That harness action
writes the same state-only SOP draft artifacts and returns their refs as Harness
State Observations for the next model round. It does not audit, promote, request
confirmations, write the active vault, or create a skill package.

`governance evolution`, `governance opportunities`, and Feishu
`/opportunities` may render a structured next command for draft or promote-ready
SOP chains. This is copyable operator guidance only; the read surfaces do not
run the command.

Request a confirmation for the current SOP chain next command:

```bash
pnpm run runtime -- review request-sop-confirmation --sop sop_... --state-root .runtime/state
```

The request writes a pending confirmation under `autonomy/followups/` and
records episode evidence. It does not run the command. `review
execute-confirmed-follow-up` revalidates the current SOP Evolution Ledger before
executing the audit or promotion action.

Review confirmation list/detail views and the bounded Governance Queue context
render the confirmation source and SOP id/ref for SOP evolution confirmations.
This is visibility only; those views do not read raw SOP bodies, request
confirmations, execute confirmations, or write the active vault.
The same views expose read-only `sop_evolution_gate` readiness. Stale gates
show a bounded reason and point operators back to `review
request-sop-confirmation`; execution still performs its own ledger revalidation.
The list view can be filtered by `--gate current|stale|executed|all` to isolate
SOP-chain confirmation readiness without changing any stored artifact.
When a gate is stale, the summary/detail read model includes
`sop_evolution_recovery.request_command` so the operator can request a fresh
confirmation explicitly through CLI. Feishu may render that command, but it
still must not request or execute the confirmation itself.
Gate read models also include a stable `reason_code`; list responses summarize
reason distribution under `sop_evolution_gate_summary`. This lets an operator
distinguish retired chains, missing chains, changed refs, and changed write
boundaries without parsing free-text reasons.
For stale SOP confirmations, `sop_evolution_recovery.playbook` maps the
`reason_code` to a compact recovery summary, a read-only `governance evolution`
inspect command, and next steps. It is operator guidance only; Feishu and read
models still must not request fresh confirmations, execute stale confirmations,
or write SOP/skill state.
When an operator has handled or deferred the recovery, `review
decide-sop-recovery` can append an explicit decision to
`autonomy/sop-recovery-decisions.jsonl`. The latest decision is merged back into
stale confirmation read models so later agents can see whether the stale gate was
left open, deferred, marked fresh-requested, or kept as historical evidence.
The Opportunity Backlog uses the same latest decision to avoid repeatedly
surfacing stale gates that were already resolved by the operator. `historical`
and `fresh_requested` hide the old stale gate from active attention;
`open`/`deferred` keep it visible with the decision reason so later agents can
continue from the operator's last choice.
Review inbox decisions follow the same local append-only pattern through
`review decide-inbox`, but they target `autonomy/inbox/*.json` items and write to
`autonomy/review-inbox-decisions.jsonl`.
Eligible Opportunity Backlog items expose the matching `governance
decide-opportunity` CLI command in context, governance status, and Feishu read
models as operator guidance only. Those surfaces do not run the command or append
the decision.

Audit a state-only SOP draft:

```bash
pnpm run runtime -- review audit-sop --sop sop_... --state-root .runtime/state
```

This command reads `sop/drafts/*.json`, writes `governance/audits/*.json`, and
appends episode evidence. It does not mutate SOP status, promote, write the
repository, write the active vault, or create a skill package.

Promote an audited state-only SOP draft into the local active vault:

```bash
pnpm run runtime -- review promote-sop --sop sop_... --audit audit_... --state-root .runtime/state
```

This command requires a matching `promote` audit verdict and checks recalled
skills before writing a new skill. A duplicate skill records evidence and
skips promotion. A successful promotion writes the local active vault SOP,
candidate skill, active skill, registry snapshot, skill event, and episode
evidence. It does not write repository seed vaults or publish externally.

Rehearse the full SOP promotion/reuse path in a sandbox:

```bash
pnpm run runtime -- review rehearse-sop-loop --state-root .runtime/state
```

This command is an explicit local acceptance gate. It creates a sandbox repo,
sandbox state roots, and sandbox active vault under
`governance/rehearsals/<id>/sandbox/`, runs the real live runner with a
deterministic local model, promotes one sandbox skill, then runs a second
sandbox task that must recall and reuse that skill. The report is written under
`governance/rehearsals/<id>/` and the selected state root receives one bounded
episode evidence event. It does not call external models, read secrets, write
the real active vault, write the working repository, manage services, run shell
commands, or execute from Feishu.

Inspect active-vault skill registry events directly:

```bash
pnpm run runtime -- skills events --state-root .runtime/state
pnpm run runtime -- skills events --event skill_event_... --state-root .runtime/state
```

This command reads the configured active-vault
`registry/skill-events.jsonl` and returns bounded event metadata. It is useful
for validated skill-revision events and explicit registry `synced` events that
do not correspond to a skill package rewrite.

Close a historical orphan skill registry event explicitly:

```bash
pnpm run runtime -- skills retire-event --event skill_event_... --reason "..." --state-root .runtime/state
```

This command appends a bounded `retired` event to
`registry/skill-events.jsonl`. It is useful for historical events that
may not belong to a full SOP chain. It does not read raw skill bodies, mutate
skill packages, rewrite registry metadata, write outside the bounded retired
event, invoke the model, or run shell commands.

Inspect a SOP self-evolution chain:

```bash
pnpm run runtime -- review chain --sop sop_... --state-root .runtime/state
```

This command reads the state SOP draft and append-only episode event log, then
returns related review refs, audit refs, skill refs, duplicate skill refs,
artifact refs, events, and aggregate chain status. It does not write state,
write the active vault, audit, promote, or repair broken chains.

Later context assembly also includes a bounded `SOP Evolution Ledger` section.
It is cross-chain orientation only: it may show ids, decisions, refs, counts,
and next-step guidance, but explicit review or confirmation commands remain
required before any SOP or skill mutation.

## Current Test Value

Local learning is useful when it proves:

- a promoted skill is written to the local active vault
- repository seed fixtures are not mutated by ordinary promotion
- a later similar task recalls the existing skill
- duplicate promotion is skipped when recall already covers the SOP candidate
- `review rehearse-sop-loop` can prove the promotion/reuse path in a bounded
  sandbox without touching the real active vault

It is acceptable for normal runs to finish without a new SOP or skill. Core
execution and verification matter more than promoting a skill every time.
