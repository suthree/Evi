# Decisions

## 2026-06-29 Scope Grilling

1. The first version is local-only and single-machine.
2. No compatibility design is allowed in the first version.
3. Core execution capabilities are the priority: read, write, run, search, and
   fetch.
4. Context and harness are runtime-control capabilities. They are first-version
   infrastructure, but only as a minimal control plane.
5. Feishu IM is an agent basic entrypoint capability, not an optional external
   plugin.
6. Feishu-specific CLI commands are not part of the first-version command
   surface. The unified surface is `doctor` and `im serve`.
7. `doctor` should check IM by default. `--no-im` is the explicit downgrade.
8. SOP and skill promotion are downgraded to local learning experiments.
9. Local learning does not include skill sync, shared vaults, marketplaces, or
   cross-machine conflict handling.
10. GenericAgent, Hermes, OpenClaw, pi, Codex, and Claude Code are references,
    not standards.
11. Trellis is introduced only as repo-local project governance. It is not part
    of the runtime, memory store, skill registry, or promotion gate.
12. Long roadmaps should be removed from stable docs and represented as Trellis
    tasks only when they become local bounded work.
13. The docs reset and the core-tool implementation should be separate commits.
14. Project command examples should use `pnpm`.

## Consequence

Stable docs describe the local first-version contract. `.trellis/` carries the
current implementation plan and decision log. Runtime code remains the source of
truth for what is currently implemented.

## 2026-07-02 TrellisVCS Context Hygiene

TrellisVCS is initialized with latest minimal no-index metadata so the repo is
recognized by the current Trellis CLI without indexing source files.

The Trellis agent context must remain a thin router back to local runtime source
docs. It must not replace `README.md`, `docs/RUNTIME_CONTRACT.md`,
`docs/LOCAL_RUNTIME.md`, or `docs/LOCAL_LEARNING.md`; it must not become runtime
state, durable memory, active-vault registry, skill promotion gate, or broad
roadmap store.

Generated Trellis local state, backups, blobs, worktrees, and logs are ignored.
Portable metadata, decisions, specs, task records, and thin agent context remain
trackable.

## 2026-07-01 Active Exploration Boundary

Daily research-to-content workflows should enter the runtime as publish plans
before they become executable external-write tools. A plan may cite sources,
draft Xiaohongshu content, request an OpenAI-compatible image generation step,
and describe a `xiaohongshu-mcp` or `agent-browser-cli` publish adapter.

Publishing remains an explicit external-write gate. Feishu operator views may
show status and guidance only. Browser sessions, platform cookies, Xiaohongshu
account state, and image model credentials remain local runtime/auth concerns,
not repository artifacts.

For the current local implementation, `xiaohongshu-mcp` is the preferred
Xiaohongshu execution channel because it can publish through the resident local
MCP service and return or recover platform proof. `agent-browser-cli` remains a
fallback only after its Chrome extension bridge reports connected tabs; if that
bridge is unstable, active exploration should not wait on it.

## 2026-07-01 Self-Evolution Gap Intake

Self-evolution should discover implementation gaps from completion
verification, harness replay, context pressure, archive health, skill
telemetry, active-exploration rehearsals, and operator corrections.

Gap reports are proposal-only. Each report must cite evidence refs, name one
owner surface, propose one bounded implementation slice, and include
verification commands. A gap report must not mutate SOP, skill, memory,
service, repository, active-vault, or external publishing state by itself.

## 2026-07-01 External Publish Evidence Contract

Active-exploration publication status must be driven by typed evidence, not by
adapter logs or model text. Image evidence records local file existence and
metadata. Publish evidence records the adapter, tool, operator confirmation,
external-write flag, login status, and platform proof.

A run can be marked `published` only when the external-write result is
operator-confirmed and includes at least one platform id, URL, or screenshot
ref. Real `gpt-image-2`, `xiaohongshu-mcp`, and `agent-browser-cli` execution
remain later adapter slices that must write this evidence shape.

## 2026-07-03 Memory Layer Attention Diagnostic

Memory and local-learning state should be visible by context role before it is
used as prompt context. The runtime exposes `memory layers` as a read-only
diagnostic that classifies accepted semantic memory, working checkpoints,
governance queue items, episode recall, episode archives, and selected-skill
outcome telemetry.

This diagnostic may report counts, refs, context roles, attention signals, and
next inspection commands. It must not rebuild indexes, render semantic memory
or candidate content, read raw episode artifacts, execute confirmations, mutate
state, write the active vault, or invoke the model.

## 2026-06-29 IM Baseline

Provider-first Feishu CLI commands are not retained as a compatibility surface
for the first version. IM is exposed through the project-level `doctor` baseline
check and `im serve` foreground command. `--no-im` is the only explicit downgrade
from the default IM readiness check.

## 2026-06-29 Naming Boundary

The repository name is only an external handle, not the domain name for runtime
abstractions. Runtime classes, interfaces, prompts, user-facing IM defaults, and
core agent docs should use generic terms such as local agent, runtime, store,
runner, and task runner. Project commands, package metadata, README naming, and
explicit config paths or env vars should stay descriptive rather than branded.

## 2026-06-29 Local Service Runtime

The current MVP includes a single-user local service runtime. It is allowed to
use macOS `launchd`, maintain a local runtime snapshot under `LOCAL_RUNTIME_HOME`, and
keep Feishu IM intake resident between local development cycles.

This does not reopen hosted service, multi-user bot, production daemon,
Docker/Kubernetes, remote deployment, or cross-machine state design. Those
remain out of scope.

Service state belongs under local home/state roots. Repository files remain the
source of truth for code and stable docs; service manifests, logs, runtime
snapshots, and heartbeat files are local runtime artifacts.

## 2026-06-29 MemoryStore FTS

Episode JSONL remains the append-only source of truth for runtime evidence.
The first MemoryStore version builds a local SQLite FTS index under the selected
state root so episode events can be searched and session windows can be
replayed.

Vector or hybrid search is not part of this task. The index is rebuildable from
`memory/episodes/events.jsonl`, and future vector recall must attach behind the
MemoryStore API rather than replacing the evidence log.

## 2026-06-29 Background Review Boundary

Background review is the first bridge from searchable episode memory to
self-evolution. It may inspect recent, query-scoped, or session-scoped episode
events and write proposal artifacts under the selected state root.

It must remain proposal-only in this version. It does not edit repository files,
does not write to the active vault, and does not promote SOPs or skills. Any
proposal must cite episode evidence and require a later explicit implementation
or promotion step.

## 2026-06-29 Review Proposal To SOP Draft

An eligible background-review proposal may become a state-only SOP draft through
an explicit `review draft-sop` command. This is a manual harness action, not an
automatic background mutation.

The command may write `sop/drafts/*.json` plus `sop/drafts/*.md` under the
selected state root and append episode evidence. It must not write the
repository, write the active vault, audit the SOP, promote the SOP, or create a
skill package.

## 2026-06-29 Review SOP Audit Boundary

An operator may explicitly audit a state-only SOP draft through
`review audit-sop`. The draft remains a state artifact and the audit output is
written under `governance/audits/*.json`.

The command may read `sop/drafts/*.json` and append episode evidence. It must
not write the repository, write the active vault, mutate SOP status, promote the
SOP, or create a skill package.

## 2026-06-30 Live Propose SOP State Boundary

A live model round may use `propose_sop` as a state-only harness action only
when `completion_claim.status=not_done`. The harness writes a local SOP draft
under `sop/drafts/*.json` and `sop/drafts/*.md`, appends evidence, and returns
the draft refs as Harness State Observations.

This path must not write the repository, write the active vault, audit the SOP,
promote the SOP, create a skill package, request confirmations, or execute
follow-up actions. A final `done` envelope with `respond + propose_sop` remains
on the existing completion verification, audit, and promotion path.

## 2026-06-29 Review SOP Promotion Gate

An audited state-only SOP draft may be promoted through `review promote-sop`.
This is an explicit operator action and is the first review harness command
allowed to write the configured local active vault.

The command must require both the SOP draft and audit artifact, require an audit
verdict of `promote`, and run duplicate recalled-skill detection before writing
a new skill. Duplicate coverage records evidence and skips promotion. Successful
promotion may write active-vault SOP, candidate skill, active skill, registry,
skill event, and episode evidence. It must not write repository seed vaults,
publish externally, or run as an automatic background mutation.

## 2026-06-29 Review Chain Provenance

The review harness needs a read-only provenance view for SOP self-evolution
chains. `review chain` may read a state SOP draft and the append-only episode
event log to reconstruct related review, audit, promotion, and reuse evidence.

The command must not write state, write the active vault, audit, promote, or
repair broken chains. `memory/episodes/events.jsonl` remains the source of truth
for the event sequence; the chain command is an observability surface only.

## 2026-06-29 Chain-Aware Background Review

Background review may reconstruct SOP chain summaries for reviewed episode
events that cite state SOP drafts. These summaries help proposals distinguish
between reused-skill coverage, audited-but-undecided SOPs, and already promoted
chains.

This remains proposal-only. Chain-aware review may write review report
artifacts, but it must not create SOP drafts, audit, promote, write the active
vault, repair chains, or mutate existing state artifacts.

## 2026-06-29 Review Follow-Up Dry Run

An operator may ask the review harness to plan follow-up actions for one
selected background-review proposal through `review plan-follow-up`.

The command is a dry run. It may read the review report, proposal, and
available chain summaries, then return structured actions with suggested
commands and expected write surfaces. It must not write state, append episode
evidence, write the active vault, draft, audit, promote, repair chains, or
execute the suggested commands.

## 2026-06-29 Stable Review Follow-Up Actions

Review follow-up action ids are deterministic within a review/proposal pair.
They are derived from the review ref, proposal id, action kind, and action
target.

The id is a selector for later operator decisions, not proof that the action
ran. Replanning must not create new action identities for the same target, and
stable ids must not weaken the dry-run boundary.

## 2026-06-29 Read-Only Review Follow-Up Execution

`review execute-follow-up` is allowed only for read-only follow-up actions. The
first executable action kind is `inspect_chain`, which recomputes the plan,
selects a stable action id, and returns the same provenance chain that
`review chain` would return.

The command must reject any action that would write state, write the active
vault, draft, audit, promote, revise a skill, collect evidence, or narrow and
rerun background review. This keeps the executor gate separate from mutation
commands.

## 2026-06-29 Follow-Up Confirmation Request

Mutation follow-up actions require an auditable confirmation request before any
future executor may run them. `review request-follow-up` may write a pending
confirmation envelope under `autonomy/followups/` and append episode evidence.

The request records operator intent, selected action id, required refs, expected
write surfaces, safety boundary, and next step. It must not execute the action,
draft, audit, promote, revise skills, write the active vault, or mutate any SOP
or skill artifact.

## 2026-06-30 Review Follow-Up Confirmation Read Model

Follow-up confirmation artifacts need operator-visible review surfaces before
and after execution. `review confirmations` lists summaries from
`autonomy/followups/*.json`, and `review confirmations --confirmation
<ref-or-id>` inspects one confirmation. Feishu private chat mirrors this with
`/review confirmations` and `/review confirmation <ref-or-id>`.

This is read-only governance visibility. It must not create confirmation
requests, execute follow-up actions, draft, audit, promote, revise skills,
collect evidence, run narrowed background review, invoke the model, write the
active vault, or run shell commands.

Feishu review confirmation detail may show the exact CLI command for executing
a pending follow-up confirmation:
`pnpm run runtime -- review execute-confirmed-follow-up --confirmation <confirmation>`.
If the confirmation has already executed, the detail view should point to the
execution result instead of rendering a new execution command.

These commands are rendered as text only. Feishu must not execute follow-up
actions, draft, audit, promote, revise skills, collect evidence, run narrowed
background review, invoke the model, write the active vault, or run shell
commands.

## 2026-06-29 Confirmed Audit Follow-Up Execution

The first mutation follow-up executor is limited to confirmed `audit_sop`
actions. `review execute-confirmed-follow-up` must read a pending confirmation
request, recompute the dry-run plan, verify the selected action still exists,
and only then run the state-only SOP audit path.

The command may write the audit artifact, append audit evidence, update the
confirmation artifact to `executed`, and append confirmed-execution evidence.
It must not draft, promote, revise skills, write the active vault, execute shell
commands, or run a confirmation more than once.

## 2026-06-29 Confirmed Draft Follow-Up Execution

Confirmed follow-up execution may also run `draft_sop` actions. The command must
still read a pending confirmation request, recompute the dry-run plan, and
verify the selected action still exists and still has kind `draft_sop` before it
creates any SOP draft.

The command may write state SOP draft JSON/Markdown, append draft evidence,
update the confirmation artifact to `executed`, and append confirmed-execution
evidence. It must not audit through a draft confirmation, promote, revise
skills, write the active vault, execute shell commands, rerun background review,
or run a confirmation more than once.

## 2026-06-29 Confirmed Promotion Follow-Up Execution

Confirmed follow-up execution may also run `promote_sop` actions, but only when
the caller injects the current runtime vault config and `runtime.promotion_enabled`
is true. The command must still read a pending confirmation request, recompute
the dry-run plan, and verify the selected action still exists and still has kind
`promote_sop`.

The command may run the existing explicit SOP promotion path, including duplicate
skill protection, state SOP status updates, active-vault SOP/skill/registry
writes, confirmation execution updates, and confirmed-execution evidence. It
must not revise skills, execute shell commands, rerun background review, repair
chains, bypass the promotion gate, or run a confirmation more than once.

## 2026-06-29 Confirmed Narrow Review Follow-Up Execution

Confirmed follow-up execution may also run `narrow_review` actions for
`runtime_gap` proposals. The command must read a pending confirmation request,
recompute the dry-run plan, verify the selected action still exists and still
has kind `narrow_review`, and then run one query-scoped background review using
the original proposal title as the query.

The command may write a new state background-review JSON/Markdown pair, append
background-review evidence, update the confirmation artifact to `executed`, and
append confirmed-execution evidence. It must not draft, audit, promote, revise
skills, write the active vault, execute shell commands, repair chains, or run a
confirmation more than once.

## 2026-06-29 Confirmed Evidence Collection Follow-Up Execution

Confirmed follow-up execution may also run `collect_evidence` actions for
`memory_gap` proposals. The command must read a pending confirmation request,
recompute the dry-run plan, verify the selected action still exists and still
has kind `collect_evidence`, and then write a state-only evidence collection
report summarizing current episode-memory sync and stats.

The report records the gap, current memory counts, cited refs, and recommended
intake steps. It must not claim that new external evidence was collected, draft,
audit, promote, revise skills, write the active vault, execute shell commands,
repair chains, or run a confirmation more than once.

## 2026-06-29 Confirmed Skill Revision Validation Follow-Up

Confirmed follow-up execution may also run `revise_skill` actions for
`skill_revision` proposals, but the first supported mutation is a validation
event, not an automatic skill rewrite. The command must read a pending
confirmation request, recompute the dry-run plan, verify the selected action
still exists and still has kind `revise_skill`, require injected vault config,
and then append `validated` events to the active vault skill registry event log.

The command may append active-vault `registry/skill-events.jsonl` validation
events, append state evidence, update the confirmation artifact to `executed`,
and append confirmed-execution evidence. It must not rewrite `SKILL.md`, edit
registry metadata rows, draft, audit, promote, execute shell commands, repair
chains, bypass the vault config boundary, or run a confirmation more than once.

## 2026-06-29 Review Tick Self-Evolution Inbox

The first service-shaped self-evolution loop is `review tick`: one bounded
background-review run followed by state-only inbox materialization. This mirrors
the mature scheduler pattern from GA and Hermes, but keeps local runtime mutations
behind the existing operator gates.

The command may run background review, plan follow-up actions for every
proposal, write stable inbox items under `autonomy/inbox/`, write a tick report
under `autonomy/ticks/`, update existing inbox items by `seen_count`, and append
tick evidence. It must not create confirmation requests, execute follow-up
actions, write the active vault, draft, audit, promote, revise skills, execute
shell commands, or repair chains.

## 2026-06-29 Review Inbox Confirmation Gate

Review tick inbox items need an operator-facing bridge into the existing
confirmation envelope. `review inbox` may list or read state-only inbox items,
and `review request-inbox-confirmation` may turn one mutation inbox item into a
pending confirmation.

The request command must recompute the referenced follow-up plan using the
inbox item's latest review, proposal, and action refs, then write the same
pending confirmation artifacts as manual proposal follow-ups. It may update the
inbox item status to `confirmation_requested` and append evidence. It must not
execute the follow-up action, write the active vault, draft, audit, promote,
revise skills, execute shell commands, or repair chains.

## 2026-06-29 Review Inbox Execution Read Model

Review inbox items should not remain operator-active after their linked
confirmation has executed. `review execute-confirmed-follow-up` may update any
inbox item linked by `confirmation_ref` to terminal status `executed`, recording
the confirmation refs, execution result summary, and execution evidence ref.

`review inbox` is an active read model by default: it lists `open` and
`confirmation_requested` items and omits `executed` items. Operators may still
inspect terminal history with `--status all` or `--status executed`. This does
not grant the inbox a new execution path, bypass confirmation, rerun actions,
write the active vault beyond the confirmed executor's existing boundary, or
delete historical inbox artifacts.

## 2026-06-29 Service Review Tick Loop

The resident IM service may attach a local review tick loop, but it is not a
new mutation authority. It uses explicit JSONL runtime config and is disabled
by default.

When enabled, the loop runs the same state-only `review tick` path on a timer,
writes status under `services/im/review_tick.json`, and reports that status
through `service status`. Failures are status artifacts, not process crashes.
It must not request confirmations, execute follow-up actions, write the active
vault, draft, audit, promote, revise skills, execute shell commands, or repair
chains.

## 2026-06-29 Feishu Read-Only Operator Commands

Feishu private chat may expose a narrow local operator command surface for
status and review inbox visibility. This follows the mature agent pattern of
handling control/status commands locally instead of sending every message to the
model, while keeping local runtime provider-neutral at the project CLI boundary.

Supported commands are `/help`, `/status`, `/memory candidates`,
`/memory candidate <ref-or-id>`, `/memory confirmations`,
`/memory confirmation <ref-or-id>`, `/memory accepted`,
`/memory accepted <ref-or-id>`, `/review inbox`, `/review inbox all`,
`/review inbox executed`, `/review confirmations`, and
`/review confirmation <ref-or-id>` plus `/inbox` aliases. These commands may
read service heartbeat, review tick status, memory candidate read models, memory
confirmation read models, accepted semantic memory read models, review inbox
read models, and review follow-up confirmation read models, then write channel
inbound/outbound/operator-command artifacts.
They must not invoke the model, request confirmations, execute follow-up
actions, draft, audit, promote, revise skills, rebuild MemoryStore indexes,
write the active vault, run shell commands, or become a general Feishu-specific
CLI surface.

## 2026-06-29 Feishu Conversation History Context

Feishu private-chat tasks need bounded conversational continuity. Before a
normal private message is passed into the live runner, the adapter may read
local channel state for the same `open_id` and `chat_id`, select recent inbound
and outbound text rows, truncate them, and include them in the task context.

This is a local context feature only. It must not fetch remote chat history,
dump raw Feishu event payloads, include messages from other users or chats,
rebuild MemoryStore indexes, create a second long-term memory source, invoke
the model for operator commands, or change the confirmation/execution gates for
self-evolution.

## 2026-06-29 Episode Recall In Live Context

Live runs may use the local MemoryStore to search prior episode evidence with
the current task before building the model context. This moves local runtime closer
to the Hermes/OpenClaw pattern of searchable session memory while preserving
the first-version local boundary.

The recall payload is summary-only: event id, session id, kind, summary,
artifact refs, score, and created time. Live recall reads append-only episode
events through a bounded scan so the service message hot path does not rebuild
the SQLite index. It must not dump raw session artifacts, entire transcripts,
vector-memory payloads, or cross-machine memory into the prompt. Recall
injection is evidence for context assembly only; it does not draft, audit,
promote, revise skills, execute actions, or write the active vault.

## 2026-06-29 Context Assembly Manifest

Each live run should persist a structured context manifest sidecar next to the
model-facing context Markdown. This follows the OpenClaw context breakdown
pattern at local runtime scale: the harness can inspect what was assembled without
dumping every context source again.

The manifest records section names, character counts, selected refs, recall
counts, skill counts, and query/todo discipline state. It is evidence for the
current context assembly only. It must not become a GUI feature, telemetry
backend, remote trace export, model prompt replacement, or a second memory
source of truth.

## 2026-06-29 Context Manifest Inspection

Operators need a local way to inspect context assembly without opening raw
prompt Markdown. `context list` and `context show` may read context manifest
sidecars under the selected state root and report section sizes, refs, recall
counts, skill counts, and discipline state.

This command surface is read-only. It must not read raw context Markdown, build
new context, sync memory indexes, invoke models, write state, write the active
vault, or become a GUI/telemetry replacement.

## 2026-06-30 Feishu Context Manifest Operator View

Feishu private chat may mirror the local `context list` and `context show`
inspection surface through `/context` and `/context <ref-or-id>`. This gives the
operator a quick IM view of what context was assembled without opening
model-facing prompt Markdown.

The command may read only context manifest sidecars under
`memory/episodes/*-context.json`. It must not read raw context Markdown, build a
new context bundle, sync memory indexes, invoke the model, write state, write
the active vault, request confirmations, execute follow-up actions, or run shell
commands.

## 2026-06-29 State-Only Harness Model Actions

The live model action contract may expose `record_evidence` and
`update_working_state` as first-class harness actions, but only as local state
operations. This reduces drift between the context contract and runtime loop
without turning model proposals into a broader mutation authority.

`record_evidence` writes a bounded state note and appends episode evidence.
`update_working_state` writes a bounded working checkpoint and appends episode
evidence. Their results may be shown to the next model round as harness state
observations. They must not write the repository, write the active vault, run
commands, publish externally, request confirmations, audit, promote, or verify a
done completion claim by themselves.

## 2026-06-30 Working Checkpoint In Context

Working checkpoints are short-lived continuity state, not durable memory or
completion proof. Later context assembly should select the latest bounded
checkpoint, preferring `memory/working/current.json`, and render it as a
dedicated "Working Checkpoint" section.

The section may show goal, current step, known constraints, recent evidence
refs, open questions, and next action. It must not read the referenced evidence
artifacts, infer that the previous task is complete, write state, invoke the
model recursively, or run shell commands during context assembly.

## 2026-06-30 Working Checkpoint Review Intake

Recent background review may read the latest bounded working checkpoint and
turn it into a `runtime_gap` proposal. This lets review tick surface unfinished
continuity work through the existing inbox and confirmation gate instead of
creating a separate execution path.

Checkpoint intake must preserve the no-proof boundary: the proposal may cite
the checkpoint ref and its evidence refs, but must not read referenced evidence
artifacts, infer completion, draft an SOP directly, request confirmation by
itself, execute the next action, write the active vault, invoke the model, or
run shell commands. Empty episode evidence must still produce a memory-gap
proposal even when a checkpoint proposal is present.

## 2026-06-30 Feishu Review Inbox Detail

Feishu private chat should mirror the existing CLI `review inbox --item`
read-only view through `/review inbox <ref-or-id>`. This gives the operator a
direct way to inspect checkpoint-derived or review-tick inbox items from the IM
surface without leaving the confirmation gate.

The command may read one `autonomy/inbox/*.json` item and render its status,
action, refs, write surfaces, confirmation ref, and execution summary. It must
not read raw review artifacts, request confirmations, execute follow-up
actions, draft, audit, promote, revise skills, write the active vault, invoke
the model, or run shell commands.

## 2026-06-30 Feishu Review Inbox Gate Guide

Feishu review inbox detail may show the exact CLI command for requesting
confirmation of an open mutation inbox item:
`pnpm run runtime -- review request-inbox-confirmation --item <item>`.

This is an operator guide, not IM authority. The IM adapter must not run the
command, write confirmation artifacts, update inbox status, execute follow-up
actions, write the active vault, invoke the model, or run shell commands. The
actual gate remains the CLI review confirmation path.

## 2026-06-29 State-Only Governance Model Actions

The live model action contract may expose `propose_memory` and `request_audit`
as first-class harness actions, but only as local candidate/request records.
This follows the Hermes/OpenClaw curator pattern at local runtime scale: the model can
surface what should be reviewed, while the harness keeps durable memory and
promotion gates separate.

`propose_memory` writes a candidate under `memory/semantic/candidates/` and
appends episode evidence. `request_audit` writes an audit request under
`governance/audits/` and appends episode evidence. Their results may be shown to
the next model round as harness state observations. They must not update durable
memory, edit core files, mutate SOP status, write skills, write the active
vault, execute confirmations, run commands, publish externally, or verify a done
completion claim by themselves.

## 2026-06-29 State-Only Autonomy Pause Signal

The live model action contract may expose `pause_autonomy` as a first-class
harness action, but only as a local stop signal for future autonomous
exploration. This matches the Self-Growing Agent Core boundary: an explicit
operator task can continue while the future autonomy selector sees that
exploration should pause.

`pause_autonomy` writes `autonomy/runs/pause_signal.json`, a per-run pause
request artifact, and episode evidence. Later context assembly reads the stable
signal and sets `task_context.stop_signal_active=true`. It must not stop the
resident service, disable IM, edit runtime config, execute confirmations, run
commands, publish externally, mutate SOP/skill state, or verify a done
completion claim by itself.

## 2026-06-29 Pause-Aware Review Tick Loop

The resident review tick loop is autonomous exploration and must honor the
active stop signal. When `autonomy/runs/pause_signal.json` has
`status=active`, the resident loop writes `services/im/review_tick.json` with
`state=paused` and skips background review plus inbox materialization.

This applies to the resident service loop only. Explicit operator commands such
as CLI `review tick` remain available because they are not autonomous selection.
The pause state must not unload launchd, stop IM, edit runtime config, execute
confirmations, write the active vault, or mutate SOP/skill state.

## 2026-06-30 Autonomy Pause Operator Status

The active autonomy pause signal is an operator read model. `service status`
returns the current `autonomy/runs/pause_signal.json` record as
`autonomy_pause`, and Feishu `/status` renders the paused state, reason, resume
hint, and stable signal ref when `status=active`.

This is visibility only. Status commands must not clear the signal, resume
autonomy, run background review, request confirmations, invoke the model, write
the active vault, or mutate SOP/skill state.

## 2026-06-30 Autonomy Resume Operator Gate

local runtime needs an explicit local operator gate to clear an active pause once the
self-evolution queue has been reviewed. The gate is CLI-only:
`governance resume-autonomy --reason <text>`.

The command marks the stable `autonomy/runs/pause_signal.json` inactive, writes
a resume artifact under `autonomy/runs/`, and appends episode evidence. It must
reject missing or already inactive pause signals. Feishu `/status` may render
the CLI command as guidance, but remains read-only and must not resume
autonomy, run review tick, request confirmations, invoke the model, write the
active vault, or mutate SOP/skill state.

## 2026-06-30 Memory Candidate Operator Read Model

State-only `propose_memory` candidates, their confirmation artifacts, and
accepted semantic memories need operator-visible review surfaces. `memory
candidates` lists candidate summaries from `memory/semantic/candidates/*.json`,
and `memory candidates --candidate <ref-or-id>` inspects one candidate.
`memory confirmations` lists confirmation summaries from
`memory/semantic/confirmations/*.json`, and `memory confirmations
--confirmation <ref-or-id>` inspects one confirmation. `memory accepted` lists
accepted semantic memory summaries from `memory/semantic/accepted/*.json`, and
`memory accepted --semantic <ref-or-id>` inspects one accepted record. Feishu
private chat mirrors this with `/memory candidates`, `/memory candidate
<ref-or-id>`, `/memory confirmations`, `/memory confirmation <ref-or-id>`,
`/memory accepted`, and `/memory accepted <ref-or-id>`.

This is read-only governance visibility. Read commands must not rebuild
MemoryStore indexes, update durable memory, accept candidates, request
confirmations, execute confirmations, draft, audit, promote, revise skills,
invoke the model, write the active vault, or run shell commands.

Feishu memory candidate detail may show the exact CLI command for requesting a
candidate confirmation:
`pnpm run runtime -- memory request-candidate-confirmation --candidate <candidate>`.
If a candidate already has a pending confirmation, the detail view should point
to `memory confirmations --confirmation <confirmation>` instead. If a candidate
has already been accepted, it should point to `memory accepted --semantic
<accepted>`.

These commands are rendered as text only. Feishu must not request or execute
memory confirmations, accept memory, rebuild MemoryStore indexes, invoke the
model, write the active vault, or run shell commands.

Feishu memory confirmation detail may show the exact CLI command for executing
a pending memory candidate confirmation:
`pnpm run runtime -- memory execute-candidate-confirmation --confirmation <confirmation>`.
If the confirmation has already executed, the detail view should point to the
accepted-memory execution result instead of rendering a new execution command.

These commands are rendered as text only. Feishu must not execute memory
confirmations, accept memory, rebuild MemoryStore indexes, invoke the model,
write the active vault, or run shell commands.

## 2026-06-30 Memory Candidate Confirmation Gate

Durable semantic memory acceptance requires an explicit local confirmation gate.
`memory request-candidate-confirmation` writes a pending confirmation under
`memory/semantic/confirmations/`, marks the candidate as
`confirmation_requested`, and appends evidence. `memory
execute-candidate-confirmation` requires that pending confirmation, re-reads the
linked candidate, writes accepted local semantic memory under
`memory/semantic/accepted/`, marks the confirmation as `executed`, marks the
candidate as `accepted`, and appends evidence.

Accepted semantic memory is local state, not the episode MemoryStore index.
Later context bundles may include a bounded read-only "Semantic Memory" section
from accepted records. The confirmation path must not rebuild MemoryStore
indexes, write repository files, write the active vault, revise skills, invoke
the model, run shell commands, or publish externally.

## 2026-06-30 Governance Status Read Model

Operators need one local triage surface across memory proposals, confirmation
queues, review inbox items, service status, review tick status, and autonomy
pause state. `governance status` is a read-only CLI aggregate, and Feishu
private chat mirrors it through `/governance` and `/governance status`.

The aggregate may read existing state artifacts only. It must not request
confirmations, execute confirmations, run review, run review tick, rebuild
MemoryStore indexes, mutate governance state, write the active vault, invoke
the model, or run shell commands.

## 2026-06-30 Governance Queue In Context

The live context bundle should expose the current local self-evolution backlog
as a bounded read-only "Governance Queue" section. This moves local runtime closer to
the Hermes/OpenClaw-style split between archival evidence, durable memory, and
operator/governance state: the model can see that work is pending without being
granted execution authority.

The section may summarize pending memory candidates, pending memory
confirmations, active review inbox items, pending review follow-up
confirmations, and active autonomy pause state by id, status, title/summary,
action kind, and refs. It must not include raw review artifacts, memory
candidate content, confirmation safety boundaries, command strings, or execute
any confirmation. Context assembly must remain read-only and bounded.

## 2026-06-30 Opportunity Backlog Read Model

local runtime should expose a deterministic Opportunity Backlog as a ranked read
model over pending local self-evolution state. Governance Queue remains the
bounded factual queue in context; Opportunity Backlog adds a local attention
ranking using growth value, evidence, urgency, risk, and cost so the next turn
can see which pending work is likely to matter first.

The read model may draw from active autonomy pause state, pending review
follow-up confirmations, pending memory confirmations, active review inbox
items, memory proposal candidates, and open `autonomy/opportunities.jsonl`
records. It may show scores, score reasons, budget hints, refs, and operator
next steps. It must not execute confirmations, request confirmations, run
review tick, mutate SOP/skill/memory state, write the active vault, invoke the
model recursively, or run shell commands.

## 2026-06-30 Opportunity Decision Log

Opportunity Backlog needs an operator lifecycle without rewriting the source
JSONL. local runtime should append explicit decisions to
`autonomy/opportunity-decisions.jsonl` and merge the latest decision when
rendering open backlog items.

The first decision writer is CLI-only:
`governance decide-opportunity --opportunity <id-or-ref> --status <open|deferred|completed|retired> --reason <text>`.
It may only target `open` or `deferred` opportunity records from
`autonomy/opportunities.jsonl`; live-run `selected` records are provenance, not
backlog items. Completed and retired items should disappear from Opportunity
Backlog. Feishu may render the CLI command as operator guidance, but must not
append decision events.

## 2026-06-30 Governance Outcomes In Context

Executed self-evolution decisions should also be visible to later runs as
bounded feedback. The live context bundle may include a "Governance Outcomes"
section summarizing recently executed memory acceptance confirmations and
review follow-up confirmations.

The section may show confirmation ids, result kinds, action kinds, produced
refs, evidence ids, and execution times. It must not read raw SOP drafts,
audits, promoted skills, accepted-memory Markdown, safety boundaries, or command
strings. Outcome visibility is not replay authority; context assembly must not
request confirmations, execute confirmations, write the active vault, invoke the
model recursively, or run shell commands.

## 2026-06-30 Feishu Episode Memory Operator Search

Feishu private chat may expose bounded episode-memory inspection through
`/memory search <query>` and `/memory session <session-id>`. This gives the
operator a quick Hermes/OpenClaw-style archive lookup from IM while keeping the
episode log as the source of truth.

The commands scan `memory/episodes/events.jsonl` directly and render only
summary metadata: event id, session id, kind, score when available, timestamp,
summary, and bounded artifact refs. They must not rebuild the SQLite
MemoryStore index, read raw episode artifacts, invoke the model, request or
execute confirmations, accept semantic memory, write durable memory, write the
active vault, or run shell commands.

## 2026-06-30 Daily Episode Archive Context

local runtime should add a deterministic daily archive layer over append-only episode
events before attempting model-driven compaction. This borrows the useful shape
of GA's L4 session archive and OpenClaw's bounded compaction summaries while
staying inside the local first-version contract.

`memory archive` scans `memory/episodes/events.jsonl` directly and writes
`memory/archives/<date>.json` plus `.md` summary artifacts. It groups by day,
counts events, sessions, and kinds, records bounded session summaries and recent
event summaries, and preserves artifact refs as refs only. It must not rebuild
the SQLite MemoryStore index, read raw episode artifacts, invoke the model,
write durable semantic memory, write the active vault, or run shell commands.

Later context assembly may include the latest bounded archive summaries from
`memory/archives/*.json`. Those summaries are orientation only: they are not raw
evidence, not durable semantic memory, not confirmation authority, and not a
trigger for SOP/skill mutation.

## 2026-06-30 Episode Archive Operator Read Model

After daily archive summaries enter context, the resident operator surface also
needs a bounded way to inspect what archive state exists. Feishu private chat
may expose `/memory archives` and `/memory archive <date-or-ref>` as read-only
views over `memory/archives/*.json`.

These commands list or inspect deterministic archive summaries only. They must
not generate archive files, rebuild the SQLite MemoryStore index, read raw
episode artifacts, invoke the model, write durable semantic memory, request or
execute confirmations, write the active vault, or run shell commands.
`memory archive` remains the explicit local CLI write command.

## 2026-06-30 SOP Evolution Ledger

local runtime needs a cross-chain SOP/skill evolution view before adding more
mutation paths. Single-chain `review chain` remains useful for a selected SOP,
but future context and operators need to see which drafts are open, audited,
promoted, reused, or revision-needed without scanning raw drafts, audits,
follow-up confirmations, and active-vault registry logs by hand.

`governance evolution` and Feishu `/evolution` may read state SOP drafts, SOP
audits, review follow-up confirmations, append-only episode event refs, and
active-vault skill registry events, then render a bounded SOP Evolution Ledger.
The context bundle may include the same ledger as orientation for later runs.
It may show ids, decisions, refs, counts, latest follow-ups, latest skill
events, and explicit next-step guidance. It must not read raw SOP bodies or
skill bodies into the rendered view, request confirmations, execute
confirmations, run review tick, audit, promote, revise skills, write the active
vault, invoke the model, run shell commands, or repair chains.

## 2026-06-30 SOP Evolution Chains In Opportunity Backlog

The SOP Evolution Ledger should also feed the ranked local self-evolution
attention queue. This mirrors the useful part of GA Goal Mode/Goal Hive and
Hermes scheduler behavior: keep actionable improvement candidates visible in a
bounded queue, while execution remains behind explicit operator gates.

Opportunity Backlog may include `sop_evolution_chain` items for ledger entries
whose latest decision is `drafted`, `audited`, `revision_needed`, or `unknown`.
The item may show score, action kind, state ref, source ref, and next-step
guidance. If the chain already has a pending follow-up confirmation, the
confirmation remains the actionable backlog item and the chain-level item must
not be duplicated. This read model must not request confirmations, execute
confirmations, run review tick, audit, promote, revise skills, write the active
vault, invoke the model, run shell commands, or read raw SOP/skill bodies.

## 2026-06-30 SOP Evolution Structured Next Commands

Open SOP evolution chains may expose a structured `next_command` in read models
when the next safe operator gate is deterministic. Drafted chains may expose an
`audit_sop` command. Audited chains with a `promote` audit verdict may expose a
`promote_sop` command.

The structured command may include action kind, exact CLI command, required
refs, write surfaces, and safety boundary text. SOP Evolution Ledger,
Opportunity Backlog, and Feishu `/opportunities` may render this as operator
guidance only. These surfaces must not execute the command, request
confirmations, audit, promote, write the active vault, invoke the model, run
shell commands, or read raw SOP/skill bodies.

## 2026-06-30 SOP Evolution Confirmation Gate

An operator may request confirmation for the current structured SOP evolution
next command through `review request-sop-confirmation --sop <sop>`. This reuses
the existing `autonomy/followups/*.json` confirmation model with
`source=sop_evolution_chain` instead of creating a parallel queue.

The request command writes only a pending confirmation and episode evidence. It
must not audit, promote, write the active vault, invoke the model, run shell
commands, or read raw SOP/skill bodies. `review execute-confirmed-follow-up`
may execute such a confirmation only after re-reading the SOP Evolution Ledger
and verifying the action id, kind, required refs, and write boundary still
match the pending request.

## 2026-06-30 SOP Confirmation Operator Visibility

Review confirmation read models should distinguish ordinary review-proposal
confirmations from SOP Evolution Ledger confirmations. List and detail surfaces
may expose `source=sop_evolution_chain`, `sop_id`, and `sop_ref`, and bounded
context may include those same refs in the Governance Queue.

This is read-only operator visibility. It must not read raw SOP or skill bodies,
request confirmations, execute confirmations, invoke the model, run shell
commands, or change the stale-ledger revalidation gate.

## 2026-06-30 SOP Confirmation Stale Readiness

Pending SOP Evolution Ledger confirmations should expose a derived
`sop_evolution_gate` readiness in review confirmation read models, Opportunity
Backlog, Feishu views, and bounded context. The readiness is computed by
re-reading the current SOP Evolution Ledger and comparing the pending action id,
kind, required refs, and write boundary.

`sop_evolution_gate=stale` is operator visibility only. It must not mutate the
confirmation artifact, execute the confirmation, request a replacement
confirmation automatically, read raw SOP/skill bodies into context, or replace
the final execution-time stale-ledger revalidation gate.

## 2026-06-30 SOP Confirmation Gate Filter

Operators may filter review confirmation summaries by derived SOP Evolution
Ledger gate state: `review confirmations --gate current|stale|executed|all`.
Feishu mirrors this as `/review confirmations current|stale|executed|all`.

The filter is read-only triage. Non-`all` filters include only confirmations
with `source=sop_evolution_chain` and a derived gate. They must not persist the
derived status, mutate confirmation artifacts, request replacements, execute
follow-up actions, invoke the model, run shell commands, or weaken the final
execution-time revalidation.

## 2026-06-30 SOP Confirmation Recovery Guidance

Stale SOP-chain confirmation read models may expose
`sop_evolution_recovery` with the stale reason, target SOP, and exact
`review request-sop-confirmation` command needed to request a fresh
confirmation.

This is operator guidance only. It must not mutate the stale artifact, create a
replacement confirmation, execute follow-up actions, invoke the model, run shell
commands, or weaken the final execution-time revalidation gate.

## 2026-06-30 SOP Confirmation Reason Codes

SOP confirmation gate readiness exposes a stable `reason_code` alongside the
human-readable reason. Review confirmation list read models may include
`sop_evolution_gate_summary` counts by status and reason code so stale queues
can be triaged without parsing free text.

Reason codes are diagnostics only. They must not be persisted as authority,
grant execution permission, replace execution-time ledger revalidation, mutate
confirmation artifacts, request fresh confirmations, invoke the model, run shell
commands, or write the active vault.

## 2026-06-30 SOP Confirmation Recovery Playbooks

Stale SOP-chain confirmation recovery may include a `playbook` derived from the
gate `reason_code`. The playbook contains a compact summary, a read-only
`governance evolution` inspect command, and next steps for the operator.

The playbook is a read model only. It must not mutate confirmation artifacts,
request replacement confirmations, execute follow-up actions, invoke the model,
run shell commands, write SOP/skill state, or weaken execution-time ledger
revalidation.

## 2026-06-30 SOP Confirmation Recovery Decision Log

Operators may record how they handled a stale SOP-chain confirmation recovery by
running `review decide-sop-recovery --confirmation <ref> --status
<open|deferred|fresh_requested|historical> --reason <text>`.

The command appends one event to `autonomy/sop-recovery-decisions.jsonl` after
revalidating that the target confirmation is still a stale SOP-chain gate. The
latest decision may be merged into stale recovery read models and Feishu
operator views for context.

Recovery decisions are audit context only. They must not mutate confirmation
artifacts, create replacement confirmations, execute follow-up actions, invoke
the model, run shell commands, write SOP/skill state, or bypass execution-time
ledger revalidation.

## 2026-06-30 Recovery-Aware Opportunity Backlog

Opportunity Backlog should read `autonomy/sop-recovery-decisions.jsonl` when it
ranks stale SOP-chain confirmations. If the latest recovery decision is `open` or
`deferred`, the stale gate remains visible with the decision reason. Deferred
items receive lower attention score. If the latest decision is `historical` or
`fresh_requested`, the old stale gate is suppressed from the active backlog.

This is read-model attention management only. It must not mutate confirmation
artifacts, create fresh confirmations, execute follow-up actions, invoke the
model, run shell commands, write SOP/skill state, or replace execution-time
ledger revalidation.

## 2026-06-30 Review Tick Opportunity Backlog Focus

Unscoped review tick should use the ranked Opportunity Backlog as a bounded
focus selector before falling back to recent evidence. This brings the first
useful part of GA Goal Mode and scheduler-style prioritization into local runtime
without granting autonomous execution authority.

When `review tick` has no explicit `--query` or `--session`, it may read the
top Opportunity Backlog item and write a `focus` object into the tick report.
Only open exploration items, currently `sop_evolution_chain` and
`open_opportunity`, plus bounded diagnostic items such as
`completion_verification`, `context_health`, `pipeline_run`,
`selected_skill_outcome`, and `selected_skill_drift`, may become the review
query. If the top backlog item is already actionable, such as a pending
confirmation or review inbox item, the tick records that item as focus and
keeps recent review scope so it does not feed an existing operator gate back
into another review loop.

The resident service status may persist the latest focus under
`services/im/review_tick.json`, and Feishu `/status` may render it. Focus is
selection metadata only. It must not request confirmations, execute follow-up
actions, run review tick recursively, draft, audit, promote, revise skills,
write the active vault, invoke the model outside the normal background review
path, run shell commands, or read raw SOP/skill bodies.

## 2026-06-30 Governance Status Opportunity Focus

Aggregate governance status should include the ranked Opportunity Backlog count
and top bounded attention item. This makes `governance status` and Feishu
`/governance` a single operator triage surface for the current resident runtime:
memory, confirmations, review inbox, service state, pause state, and the next
self-evolution item that deserves attention.

The top item summary is read-only attention metadata. It may include kind, id,
ref, score, title, action kind, source ref, and next step. It must not request
confirmations, execute follow-up actions, run review or review tick, invoke the
model, read raw SOP/skill/memory/review/context/episode bodies, mutate
SOP/skill/memory state, write the active vault, write the repo, or run shell
commands.

## 2026-06-30 Context Health Review Tick Focus

Context manifest sidecar health should participate in the same gated
self-evolution intake as completion verification and pipeline failures. When a
`context_health` item is the top Opportunity Backlog item, unscoped
`review tick` may record it as `focus.source=opportunity_backlog` and turn the
bounded issue summary into a review query.

This focus path is intake only. It may generate review proposals through the
existing background review flow, but it must not read raw context Markdown,
repair or delete sidecars, compact transcripts, request confirmations, execute
follow-ups, invoke the model outside the existing review tick path, mutate
SOP/skill/memory state, write the active vault, write the repo, or run shell
commands.

## 2026-06-30 Context Health Focus Proposal

Context-health review tick focus must not collapse into a generic
`memory_gap` when the issue is visible only through sidecar metadata rather than
episode events. When `context_health` is the selected backlog focus, review tick
may inject a bounded `runtime_gap` proposal from the focus metadata. If ordinary
background review found no matching episode evidence, this focus proposal
replaces the generic memory-gap proposal and materializes a gated
`narrow_review` inbox item.

The proposal may cite only structured refs and focus/query metadata. It must
not read raw context Markdown, repair or delete sidecars, compact transcripts,
request confirmations automatically, execute follow-ups, invoke the model
outside the existing review tick path, mutate SOP/skill/memory state, write the
active vault, write the repo, or run shell commands.

## 2026-06-30 Review Tick History Read Model

Recent review tick reports should be inspectable as bounded runtime history.
This brings the useful part of Hermes/OpenClaw background review archives into
local runtime: operators and later agents can see what the background loop focused on,
which review report it produced, and which inbox items were materialized without
rerunning the loop.

The read model may read `autonomy/ticks/*.json` and expose id, mode, query,
session, focus, review refs, proposal counts, inbox refs, stats, and evidence
ids. It must not read raw tick Markdown, raw review Markdown, raw SOP/skill or
memory bodies, run review tick, run background review, request confirmations,
execute follow-up actions, invoke the model, mutate state, write the active
vault, write the repo, or run shell commands.

## 2026-06-30 Background Review History Read Model

Recent background review reports should be inspectable as bounded runtime
history. This brings the useful part of Hermes/OpenClaw background review
archives into local runtime: operators and later agents can see which review reports
exist, what proposal summaries they produced, and which SOP chains they touched
without rerunning background review.

The read model may read `autonomy/reviews/*.json` and expose id, mode, query,
session, review refs, events reviewed, sessions seen, signal counts, proposal
counts and summaries, chain summary counts, working checkpoint refs, and
evidence ids. Proposal summaries may include compact action-chain labels/effects
so later context can preserve the next operator sequence without copying action
commands or detailed reasons. It must not read raw review Markdown, raw tick
Markdown, raw SOP/skill or memory bodies, run background review, run review tick,
request confirmations, execute follow-up actions, invoke the model, mutate
state, write the active vault, write the repo, or run shell commands.

## 2026-06-30 Task Context References

Accepted task text may carry explicit repo-local references using `@file:` and
`@folder:`. local runtime should parse those refs during context assembly and render a
bounded `Task References` section. This absorbs the useful, operator-friendly
part of Hermes-style context references and OpenClaw-style context assembly
diagnostics without adopting a full plugin context engine.

The first version may read repo-local file refs with optional line ranges and
list bounded repo-local folder contents. It must not read absolute paths,
parent traversal, state-root files, home files, URLs, git diff/log refs, shell
output, or active-vault internals. Folder refs must list file paths only and not
read every file body. Referenced content is task input only; it is not
completion evidence and does not authorize mutation.

## 2026-06-30 Completion Verification Reports

Live completion verification should become a persisted harness artifact instead
of only an append-only event summary. This mirrors the useful part of
GenericAgent's completion interception and Hermes/OpenClaw report-first review
style: the runtime records why a `done`, `not_done`, or `blocked` claim was
accepted, failed, or skipped before later agents use the run as evidence.

Each live run may write
`memory/episodes/<session>-completion-verification.json` and `.md`. The report
may include the final envelope ref, final response ref, claimed verification
refs, selected observation refs, and bounded per-check statuses. Later context
may summarize recent reports. It must not read raw response/tool artifacts,
rerun tools, invoke the model, infer current-task completion, mutate state,
write the repo, or write the active vault.

## 2026-06-30 Completion Verification Backlog Focus

Failed or skipped completion verification reports should become visible
Opportunity Backlog items instead of staying only in recent context summaries.
This keeps failed `done` claims, blocked runs, and unfinished `not_done` runs in
the self-evolution attention loop until an operator or later agent explicitly
decides how to resume or repair them.

Only the structured completion report is used. Passed reports are suppressed.
Backlog items may expose the report ref, final response ref, summary, status,
failed check ids, and a bounded next step, but must not read or embed raw final
response, tool result, or delegation artifacts. Unscoped `review tick` may use a
`completion_verification` item as a bounded query focus; this is still read-only
review intake and does not resume the task, rerun tools, request confirmations,
execute follow-ups, invoke the model, mutate state beyond normal review/tick
reports, write the repo, or write the active vault.

## 2026-06-30 Completion Verification History Read Model

Completion verification reports should have the same read-only history surface
as background review and review tick reports. This brings the useful
Hermes/OpenClaw report-archive pattern into the harness layer: operators and
later agents can inspect why a prior `done`, `not_done`, or `blocked` claim was
accepted, failed, or skipped without opening raw artifacts.

The shared read model reads only
`memory/episodes/*-completion-verification.json`. CLI `review completions`,
CLI `review completions --completion <ref-or-id>`, Feishu
`/review completions`, and Feishu `/review completion <ref-or-id>` may render
report id/ref, session, turn, status, verified flag, summary, final-response
ref, observation/claimed ref counts, failed check ids, warning check ids, and
boundary. They must not read completion Markdown, raw final responses, tool
results, delegation results, invoke the model, run review, run review tick,
request confirmations, execute follow-ups, mutate state, write the repo, or
write the active vault.

## 2026-06-30 Review Inbox Decision Log

Review tick inbox suggestions need an explicit operator decision surface before
they become stale noise in self-evolution attention. local runtime should mirror the
SOP recovery decision pattern for `autonomy/inbox/*.json`: append local
decisions to `autonomy/review-inbox-decisions.jsonl`, merge the latest decision
into review inbox read models, and let backlog/context/Feishu consume the same
state without mutating the original inbox item.

CLI `review decide-inbox --item <ref-or-id> --status
open|deferred|completed|retired --reason "..."` writes the decision log only.
`completed` and `retired` remove old inbox suggestions from active backlog and
context attention. `deferred` keeps the item visible with lower priority and
blocks confirmation until a later `open` decision reopens it. Feishu may render
the matching CLI command as guidance, but it must remain read-only and must not
append decisions, request confirmations, execute follow-ups, invoke the model,
write the repo, or write the active vault.

Append-only decision commands must return refs derived from the actual written
JSONL row, not from a pre-append row count. Operators may issue more than one
local decision close together, so `review decide-inbox`, `review
decide-sop-recovery`, and `governance decide-opportunity` should append first
and then re-read by the decision id to report the stable `<log>#<row>` ref.

## 2026-06-30 Review Inbox Duplicate Collapse

Review tick can legitimately produce multiple inbox artifacts that point at the
same operator work, especially when different proposals converge on one
inspect-chain or reused-skill action. local runtime should keep those raw artifacts as
audit history, but active attention views should collapse duplicates so the
self-evolution loop does not spend multiple backlog slots on one action.

The duplicate key is derived from action kind, title, rationale, command,
required refs, and write boundary. Active `review inbox`, Opportunity Backlog,
context governance queue, governance status, and Feishu active inbox lists may
surface only the canonical item and expose duplicate refs on that item.
`review inbox --status all` remains an uncollapsed history view. Requesting
confirmation for a non-canonical duplicate must be rejected with the canonical
ref. This collapse is read-model-only: it must not delete inbox artifacts,
append operator decisions, request confirmations, execute follow-ups, invoke the
model, write the repo, or write the active vault.

## 2026-06-30 Reused Skill Coverage Read Model

Before executing a `revise_skill` confirmation, operators need a separate
read-only check that the reused skill still covers the SOP chain. The coverage
view compares SOP Evolution Ledger duplicate-skill refs with the current local
skill registry and current recall duplicate for one SOP.

CLI `review coverage --sop <sop>` and Feishu `/review coverage <sop>` may
render coverage status, recorded duplicate refs, current duplicate ref, bounded
recall hit metadata, missing refs, evidence refs, and next-step guidance.
Open `revise_skill` inbox items, pending `revise_skill` confirmations, and
Opportunity Backlog next steps should point at this read model before execution.
The view must not render raw `SKILL.md` bodies, append validation events,
request or execute confirmations, mutate SOP/skill state, write the active
vault, invoke the model, or run shell commands.

## 2026-06-30 Coverage-Aware Backlog Context

The coverage read model should also be visible where self-evolution attention
is already selected. Open `revise_skill` inbox items and pending
`revise_skill` confirmations may carry a bounded `reused_skill_coverage`
summary in Opportunity Backlog, Governance Queue context, aggregate governance
status, and Feishu opportunity rendering.

The summary may include SOP id/ref, coverage status, current duplicate skill
ref, recorded duplicate refs, missing refs, and next-step guidance. It remains
derived visibility only. Missing or stale coverage evidence must not hide the
underlying inbox or confirmation item, and the read models must not render raw
skill bodies, append validation events, execute confirmations, mutate
SOP/skill state, write the active vault, invoke the model, or run shell
commands.

## 2026-06-30 Draft SOP Readiness Read Model

Before requesting or executing a `draft_sop` confirmation, operators need a
bounded evidence-readiness view for the selected background-review proposal.
The read model should derive status from the review JSON metadata and proposal
refs only: `ready`, `weak_evidence`, `missing_review`, or
`missing_proposal`.

Opportunity Backlog, bounded Governance Queue context, aggregate governance
status, and Feishu `/governance opportunities` may embed a
`draft_sop_readiness` summary for `draft_sop` inbox items and pending
confirmations. The summary may include review/proposal refs, evidence ref
count, failure/SOP signal counts, related SOP refs, related skill refs, and
next-step guidance. It must not render raw review Markdown, read raw episode
artifacts, request confirmations, execute confirmations, mutate
SOP/skill/memory state, write the active vault, invoke the model, or run shell
commands.

## 2026-06-30 Draft SOP Confirmation Readiness Gate

The `draft_sop_readiness` read model should also gate state-only SOP draft
confirmations. Creating a `draft_sop` confirmation must re-read the background
review JSON and selected proposal, require readiness `ready`, and store the
bounded readiness snapshot on the confirmation. Executing a pending
`draft_sop` confirmation must re-read the current review/proposal again and
reject execution if readiness is no longer `ready`.

Confirmation Markdown and Feishu review-confirmation views may render the
stored readiness snapshot: status, review/proposal refs, evidence ref count,
failure/SOP signal counts, and related SOP/skill refs. They must not render raw
review Markdown or episode bodies. The gate does not grant execution authority
by itself; it only narrows when the existing explicit confirmation request and
execute commands are allowed to write state.

## 2026-06-30 SOP Ledger Cited Evidence Boundary

`draft_sop` execution can cite older SOPs, audits, and skills as evidence for a
new draft. The SOP Evolution Ledger must not treat those cited refs as
lifecycle refs for the new chain, and it must not attach the new draft
confirmation or draft episode event to the older cited chain.

For executed `draft_sop` follow-ups, the lifecycle relationship is the produced
SOP result refs. Required refs remain provenance, not target ownership. For
`Drafted state-only SOP candidate ...` episode events, the lifecycle event
belongs to the newly drafted SOP named in the event summary. Historical audit
or skill refs cited by that event may remain evidence provenance, but they must
not populate the new chain's `audit_refs`, `skill_refs`, latest audit verdict,
or source ref used by Opportunity Backlog.

The same boundary applies after the draft is audited. `audit_sop` follow-up
events relate through their own confirmation session/turn ids and result refs,
not through every artifact cited by the audit evidence. `audit_result` episode
events may expose only the audit ref matching their own `turn_id`; cited older
SOPs, audits, pending follow-ups, or skills do not become lifecycle refs for
either chain.

Background review chain summaries must consume this same SOP Evolution Ledger
boundary. They may report lifecycle review, audit, skill, duplicate-skill, and
event refs from the ledger, but they must not rebuild a broader relationship
from all cited `artifact_refs`. This keeps `review chain`, `governance
evolution`, and background review `chain_summaries` aligned on chain ownership.

## 2026-06-30 Pipeline History Read Model

StageRunner pipeline artifacts are harness evidence, not hidden scratch state.
Later context and operators need to see whether staged harness work completed,
blocked, or failed without rerunning the pipeline or opening raw stage outputs.

`pipeline runs` is a read-only history view over `pipelines/*/checkpoint.json`,
the pipeline spec, and stage run metadata. It may render ids, refs, status,
stage status counts, evidence counts, failure metadata, and final response
refs. It must not invoke the model, execute tools, rerun stages, read raw stage
output Markdown, read prompt/model/tool artifacts, write state, write the repo,
write the active vault, or mutate SOP/skill/memory state.

Live context may include a bounded `Pipeline History` section with the same
metadata-only boundary so GA-style staged harness work becomes durable context
without expanding execution authority.

## 2026-06-30 Pipeline Run Backlog Focus

Blocked or failed StageRunner runs should feed self-evolution attention instead
of staying visible only in the pipeline history read model. The Opportunity
Backlog may create `pipeline_run` items from recent pipeline history summaries,
using checkpoint refs, pipeline refs, stage status counts, failed/blocked stage
ids, evidence counts, and next-step command text. Completed pipeline runs are
suppressed.

Unscoped review tick may select a `pipeline_run` item as
`focus.source=opportunity_backlog` and turn the bounded metadata summary into a
query. This still does not rerun the pipeline, repair a failed stage, request a
confirmation, execute a follow-up, read raw stage outputs, read prompt/model or
tool artifacts, write state, write the repo, write the active vault, or mutate
SOP/skill/memory state.

## 2026-06-30 Pipeline History Context Metadata

The live context `Pipeline History` section should expose enough structured
metadata for a later agent to understand blocked staged work: failed/blocked
stage ids, query refs, todo refs, checkpoint refs, pipeline refs, and stage run
refs. Query/todo refs belong in the context manifest when present because they
are durable harness artifacts, but their bodies remain outside the pipeline
history section.

This keeps StageRunner context aligned with the Opportunity Backlog
`pipeline_run` focus path: context may show the same blocked run as both recent
pipeline history and self-evolution attention, while still not rerunning the
pipeline, reading raw stage output, reading prompt/model/tool artifacts, reading
query/todo bodies, invoking the model, writing state, writing the repo, writing
the active vault, or mutating SOP/skill/memory state.

## 2026-06-30 Selected Skill Context Metadata

Selected skills should be explainable in the prompt-facing context. When recall
injects a local skill, the `Selected Skills` section may render the skill name,
instructions ref, metadata ref, source, and recall score before the bounded
`SKILL.md` instructions. This keeps pi/OpenClaw-style progressive disclosure
visible: the model sees both the selected procedure and why the harness selected
it.

Context assembly must not rewrite the registry, write usage telemetry, sync
skills, or mutate the active vault. Usage metadata remains a post-run harness
write after the model has actually received the selected skill. Unselected skill
bodies must remain out of context.

## 2026-06-30 Selected Skill Outcome Telemetry

Selected-skill learning should be outcome-aware. After a live run finishes
completion verification and final verdict selection, the runner may append a
`skill_usage` episode event and write a bounded state artifact under
`memory/skills/usage/` for each recalled skill injected into context.

The active-vault registry remains aggregate metadata: `use_count` and
`last_used_at` show that the skill was used. Per-run outcome belongs in state
episode memory and may cite skill refs, context refs, completion report refs,
final response refs, completion status, verification status, and verdict. The
telemetry must not claim causal effectiveness; later review or backlog logic
can decide whether repeated outcomes justify keeping, revising, or retiring a
skill.

## 2026-06-30 Selected Skill Outcome Backlog Focus

Selected-skill outcome telemetry should feed self-evolution attention only when
the run outcome needs review. The Opportunity Backlog may create
`selected_skill_outcome` items from `memory/skills/usage/*.json` when the
completion status is not `done`, verification status is not `passed`, or
`verified=false`. Passed outcomes remain episode evidence only.

Backlog, context, and unscoped review tick may render bounded fields from the
outcome artifact: skill name/ref, context manifest ref, completion report ref,
final response ref, completion status, verification status, verified flag,
verdict, and use count. They must not read raw selected skill bodies, raw
context Markdown, raw final-response artifacts, mutate skill metadata, request
confirmations, run review tick recursively, write state, write the repo, or
write the active vault from this read path.

## 2026-06-30 Selected Skill Outcome Operator Visibility

Selected-skill outcome attention should be visible in operator read models, not
only in context assembly and review tick focus. Aggregate governance status may
carry the top backlog item's bounded `selected_skill_outcome` summary, and
Feishu `/governance` plus `/governance opportunities` may render verification
status, skill name/ref, completion report ref, and verdict.

These views remain read-only. They must not render raw selected skill bodies,
raw context Markdown, or raw final-response artifacts, and they must not request
confirmations, execute follow-ups, revise skills, mutate the active vault,
invoke the model, or run shell commands.

## 2026-06-30 Selected Skill Outcome History Read Model

Selected-skill outcome telemetry should have a direct operator history surface
like completion verification and pipeline history. CLI `skills outcomes`, CLI
`skills outcomes --outcome <ref-or-id>`, Feishu `/skill outcomes`, and Feishu
`/skill outcome <ref-or-id>` may read `memory/skills/usage/*.json` and render
bounded metadata: outcome id/ref, session/turn, skill name/ref, source/score,
completion status, verification status, verified flag, verdict, context
manifest ref, completion report ref, final response ref, envelope ref, registry
update status, use count, and boundary.

This read model does not score causal skill effectiveness. It must not read raw
selected skill bodies, raw context Markdown, raw final responses, completion
Markdown, tool results, or prompts, and it must not request confirmations,
execute follow-ups, revise skills, mutate the registry or active vault, invoke
the model, or run shell commands.

## 2026-06-30 Selected Skill Drift Summary

Repeated selected-skill attention should be summarized by skill before it
becomes a self-evolution focus. When a skill has at least two failed, skipped,
blocked, unfinished, or unverified selected-skill outcomes, the read model may
emit a `selected_skill_drift_<skill>` summary with aggregate counts, latest
outcome refs, latest attention outcome ref, latest completion report ref,
latest final response ref, verdicts, and registry use count.

Opportunity Backlog may render this as `selected_skill_drift` and suppress the
individual `selected_skill_outcome` items for that same skill, so one repeated
signal consumes one backlog slot. Context, governance status, review tick
backlog focus, CLI `skills drifts`, Feishu `/skill drifts`, and Feishu
`/skill drift <skill-name>` may consume the same bounded summary.

This remains diagnosis only. It must not read raw selected skill bodies, raw
context Markdown, raw final responses, completion Markdown, prompts, tool
results, or model responses, and it must not request confirmations, execute
follow-ups, revise skills, mutate registries, write the active vault, invoke
the model, or run shell commands.

## 2026-06-30 Derived Backlog Decision Log

Derived Opportunity Backlog attention can become noisy just like manually
recorded opportunities. The existing `autonomy/opportunity-decisions.jsonl`
should therefore support eligible read-only attention items, while still
leaving source artifacts immutable. New decisions record `opportunity_kind` so
ids and refs are scoped to the backlog item kind.

The supported derived kinds are limited to `service_health`,
`completion_verification`, `context_health`, `context_pressure`, `working_checkpoint`,
`archive_health`, `skill_registry_health`, `pipeline_run`, `repo_write_guard`,
`selected_skill_outcome`, and `selected_skill_drift`.
`deferred` keeps the item visible at lower priority with the operator reason;
`completed` and `retired` hide it; `open` reopens it if the source artifact is
still present.

This is scheduler attention lifecycle only. It must not target pending
confirmations, review inbox items, memory confirmations, memory candidates,
autonomy pause signals, or SOP mutation gates, and it must not request
confirmations, execute follow-ups, invoke the model, mutate SOP/skill/memory
state, write the active vault, write the repo, or run shell commands.

## 2026-06-30 Pipeline Resume Gate

StageRunner blocked and failed checkpoints should be recoverable, otherwise
`pipeline_run` Opportunity Backlog items can only diagnose work and cannot close
the harness loop. The recovery path is an explicit foreground CLI gate:
`pipeline resume --pipeline <ref-or-id> [--from-stage <stage-id>]`.

Resume re-reads the existing pipeline spec and checkpoint, starts at the
blocked stage by default, requires prior stages before the resume point to be
terminal, writes new attempt artifacts for resumed stages, and updates the
checkpoint to the current resumed path. Prior failed attempt artifacts remain
in state for evidence and history; the active checkpoint simply stops pointing
at them once a newer attempt succeeds.

This follows the useful part of GA/Hermes-style resumable workflows while
preserving local runtime's local safety boundary. Opportunity Backlog, review tick,
Feishu, and the resident service may surface or discuss blocked pipelines, but
they must not automatically resume them. Resume may call the model and execute
stage-allowed tools, but it must not create confirmations, silently repair or
skip stages, mutate SOP/skill/memory state, write the active vault, or write the
repo outside stage tool authority.

## 2026-06-30 Pipeline Resume Operator Visibility

Blocked or failed `pipeline_run` Opportunity Backlog items should not stop at a
diagnostic hint once an explicit resume gate exists. The backlog item may carry
a bounded `pipeline_run` summary with pipeline/run ids, checkpoint refs,
blocked or failed stage ids, stage status counts, evidence counts, source refs,
and the exact CLI inspect and resume commands.

Context assembly, aggregate governance status, and Feishu operator opportunity
views may render those commands so an operator can copy the foreground action
without rediscovering the checkpoint. These surfaces remain read-only guidance:
they must not execute `pipeline resume`, invoke the model, read raw pipeline
artifacts, request confirmations, mutate SOP/skill/memory state, write the
active vault, write the repo, or run shell commands.

## 2026-06-30 Selected Skill Drift Review Proposal

Selected-skill drift should be more than a dashboard signal, but it must not
become automatic skill rewriting. When review tick focuses a
`selected_skill_outcome` or `selected_skill_drift` backlog item, background
review may convert matching `skill_usage` episode events into a
`skill_revision` proposal. Follow-up planning may create a gated
`revise_skill` inbox item whose refs include the selected-skill outcome
artifacts and skill refs.

The confirmation path remains the mutation boundary. Operators should inspect
`skills outcomes --outcome ...` before execution, and confirmed execution may
append active-vault `validated` registry events only. It must not read raw
skill bodies or context Markdown, rewrite `SKILL.md`, change registry metadata,
mutate SOPs, execute shell commands, invoke the model, or auto-execute from
Feishu, review tick, or the resident service.

## 2026-06-30 Skill Registry Event History

Active-vault skill registry events need a standalone operator read model in
addition to the SOP Evolution Ledger. The ledger remains SOP-chain orientation;
`skills events` and Feishu `/skill events` provide direct event history for
promoted and validated skill events, including validation events that do not
belong to a full SOP chain.

The read model may consume the configured active-vault
`registry/skill-events.jsonl`, list or inspect event metadata, and filter by
skill name. It must not read raw skill bodies, rewrite `SKILL.md`, change
registry metadata, request confirmations, execute follow-ups, invoke the model,
write the active vault, or run shell commands.

## 2026-06-30 Context Pressure Diagnostics

local runtime should take the useful part of context-engine maintenance from
OpenClaw/Hermes as observability before mutation. Recent context manifests can
be scanned for oversized total context or dominant sections and surfaced as
`context_pressure` diagnostics in CLI, Feishu, context, governance status, and
Opportunity Backlog.

This is not automatic compaction. The read model may read
`memory/episodes/*-context.json` metadata and render manifest refs, section
sizes, reasons, and inspect commands. It must not read raw context Markdown,
rewrite transcripts, change context assembly, run review tick, invoke the
model, mutate SOP/skill/memory state, write the active vault, or run shell
commands.

## 2026-06-30 Working Checkpoint Status

GA goal mode and Hermes/OpenClaw goal tooling treat objective progress as a
durable harness signal, not only as conversational text. local runtime already writes
bounded working checkpoints for context and background review; operators also
need a direct read-only status view before resuming local work.

`memory working`, Feishu `/working`, and aggregate governance status may read
`memory/working/*.json` plus episode event metadata that cites checkpoint refs.
They may render goal, current step, next action, bounded open questions,
evidence ref counts, and event refs. They must not read raw evidence artifacts,
execute the checkpoint next action, resume a goal loop, run review tick, invoke
the model, mutate SOP/skill/memory state, write the active vault, write the
repo, or run shell commands.

## 2026-06-30 Working Checkpoint Backlog

Working checkpoint status should also feed the local attention queue, but only
when it carries an actual interruption or unresolved decision. Opportunity
Backlog may derive `working_checkpoint` items from `memory/working/*.json` when
a checkpoint has open questions or current-step/next-action signals such as
blocked, failed, not done, unfinished, resume, stale, or gap. Ordinary quiet
save points remain status history and do not become backlog items.

The derived item may carry checkpoint ref, current step, next action, bounded
open questions, evidence counts, episode event refs, and a CLI inspect command.
Context, aggregate governance status, and Feishu operator opportunity views may
render that bounded summary. `governance decide-opportunity` may record
append-only decisions for the derived item. None of these surfaces may read raw
evidence artifacts, execute `next_action`, resume the goal loop, run review
tick, invoke the model, mutate SOP/skill/memory state, write the active vault,
write the repo, or run shell commands.

## 2026-06-30 Working Checkpoint Review Tick Focus

When the top Opportunity Backlog item is a `working_checkpoint`, unscoped
`review tick` should record it as the selected backlog focus instead of
treating it like an already-actionable mutation gate. The review itself should
remain in recent mode, because the recent background-review path is the one
that reads the bounded latest working checkpoint intake and can emit a
`runtime_gap` proposal.

This creates a path from interrupted goal-loop continuity to a state-only
`narrow_review` inbox item, while preserving the gate boundaries. Focus
selection must not execute `next_action`, resume the goal loop, read raw
checkpoint evidence, request confirmations, execute follow-ups, mutate
SOP/skill/memory state, write the active vault, write the repo, invoke the
model, or run shell commands.

## 2026-06-30 Opportunity Decision Command Guidance

Eligible Opportunity Backlog items should expose the matching append-only
decision command wherever an operator is already reading the backlog. The
read-model command is copyable guidance for
`governance decide-opportunity --opportunity <id> --status ... --reason ...`;
the actual write remains only in the explicit CLI command.

Context, aggregate governance status, and Feishu opportunity views may render
this bounded `decision_command` for open operator opportunities and derived
read-only attention kinds: `service_health`, `completion_verification`,
`context_health`, `context_pressure`, `working_checkpoint`, `pipeline_run`,
`archive_health`, `skill_registry_health`, `repo_write_guard`,
`selected_skill_outcome`, and `selected_skill_drift`. They
must not render it for pending confirmations,
review inbox items, memory confirmations, memory candidates, autonomy pause
signals, or SOP mutation gates. Rendering the command must not append the
decision, execute follow-ups, mutate SOP/skill/memory state, write the active
vault, write the repo, invoke the model, or run shell commands.

## 2026-06-30 Review Tick Focus Governance Visibility

The resident review tick loop already persists status and `last_focus` under
`services/im/review_tick.json`; aggregate governance views should explain that
latest focus because operators use `/governance` as the main self-evolution
dashboard. Feishu `/governance` may render the last tick ref, focus source,
focused opportunity ref, optional action kind, query, and reason from the
governance status read model.

This is observability only. Rendering the focus must not enable review tick,
rerun review tick, request confirmations, execute follow-ups, mutate
SOP/skill/memory state, write the active vault, write the repo, invoke the
model, run shell commands, or read raw tick/review/episode/SOP/skill artifacts.

## 2026-06-30 Service Health Read Model

OpenClaw-style runtime observability and Hermes-style durable state diagnostics
should be available from the local agent surface, but service health must stay
separate from service control. local runtime may derive a bounded service health read
model from `services/im/heartbeat.json`, `services/im/review_tick.json`,
`autonomy/runs/pause_signal.json`, and bounded repo git identity.

Context, aggregate governance status, and Feishu `/health` may render service
health, heartbeat freshness, runtime-build summary, resident review tick
status/focus, and active autonomy pause status. This read model must not inspect
launchd, read service logs, restart services, invoke the model, request or
execute confirmations, mutate SOP/skill/memory state, write the active vault,
write the repo, or run shell commands.

## 2026-06-30 Service Health CLI Read Model

The bounded service health model needs a direct CLI operator surface so
agents and humans can inspect resident IM health without using the broader
`service status` command. local runtime exposes this as
`service health --target im`, returning the same bounded health model used by
context, governance status, Feishu `/health`, and service-health backlog items.

This command reads only `services/im/heartbeat.json`,
`services/im/review_tick.json`, and `autonomy/runs/pause_signal.json` under the
selected state root plus bounded repo git identity from `.git/HEAD` and refs.
It must not inspect launchd, read service logs, restart services, invoke the
model, request or execute confirmations, mutate SOP/skill/memory state, write
the active vault, write the repo, read source file bodies, or run shell
commands.

## 2026-06-30 Service Health Backlog Attention

Service health should not live only in `/health` once it indicates abnormal
resident runtime state. The ranked Opportunity Backlog may derive a
`service_health` item from the same bounded health read model when resident IM
is not running, heartbeat freshness is stale or invalid, the copied runtime was
built from a dirty source tree, resident deployment is stale against repo HEAD,
review tick reports error/failed/stale, or health is unknown while heartbeat
evidence exists. Ordinary review tick status without a resident IM heartbeat
must not create service-health backlog noise.

Context, aggregate governance status, and Feishu opportunity views may render a
bounded service-health summary and an inspect command that points back to the
state-only `service health` surface. `governance decide-opportunity` may record
append-only decisions for the derived `service_health` item. This is attention
lifecycle only: the backlog must not inspect launchd, read service logs,
restart services, invoke the model, request or execute confirmations, mutate
SOP/skill/memory state, write the active vault, write the repo, or run shell
commands.

## 2026-06-30 Service Runtime Skew Health

Hermes-style code skew checks are useful for a local resident service, but
local runtime keeps them inside the read-only health model instead of adding service
control. `service health` may compare the resident runtime build commit carried
by `services/im/heartbeat.json` with the current repo HEAD read from
`.git/HEAD`, loose refs, or `packed-refs`.

If both commits are known and differ, service health becomes attention-worthy
and the read model reports `deployment.status=stale`, bounded runtime/repo
commit summaries, the reason, and explicit restart guidance for the operator.
If either side cannot be read, deployment status is `unknown` and must not be
treated as proof of freshness or staleness.

This comparison must not run `git`, run shell commands, inspect launchd, read
service logs, restart services, read source file bodies, mutate state, write the
repo, invoke the model, or execute confirmations. Context, governance status,
Opportunity Backlog, and Feishu may render the deployment status and restart
guidance, but they inherit the same read-only boundary.

## 2026-06-30 Context Health Read Model

local runtime context manifests are now durable enough that corrupt or drifting
sidecars should be visible as local health, not silently skipped or mixed into
context pressure. A `context health` read model may inspect
`memory/episodes/*-context.json` manifest JSON and `*-context.md` file refs to
report invalid manifests, missing context Markdown sidecars, and orphan context
Markdown files.

CLI `context health`, Feishu `/context health`, context, aggregate governance
status, and Feishu opportunity views may render bounded `context_health`
metadata and an inspect command. Opportunity Backlog may derive
`context_health` items and `governance decide-opportunity` may append explicit
decisions for them. This read model must not read raw context Markdown, repair
state, compact transcripts, rewrite context assembly, invoke the model, mutate
SOP/skill/memory state, write the active vault, write the repo, or run shell
commands.

## 2026-06-30 Context Health Operator Guidance

Context health should be actionable without granting the read model repair
authority. `context health --context <ref-or-id>` and Feishu
`/context health <ref-or-id>` may narrow diagnostics to one issue by issue id,
manifest ref, context ref, basename, session id, or turn id.

Each issue may expose bounded operator guidance: an issue-specific inspect
command, a defer decision command, a completed-after-external-repair decision
command, and a historical-retirement decision command. These commands are
append-only Opportunity Backlog decisions after an operator handles the sidecar
outside the read model; they must not restore, delete, compact, rewrite, rerun,
invoke the model, mutate SOP/skill/memory state, write the active vault, write
the repo, or run shell commands.

## 2026-06-30 Opportunity Decision Structured Visibility

Opportunity Backlog decisions should remain append-only, but later agents should
not have to parse prose summaries to know whether an item was deferred or
reopened. Backlog items whose latest visible decision is `open` or `deferred`
may expose a structured `opportunity_decision` summary with status, reason, and
JSONL row ref.

Context, aggregate governance status, and Feishu opportunity views may render
this structured decision metadata alongside the existing guidance command. They
must not append decisions, hide completed/retired items differently from the
current decision log semantics, request confirmations, execute follow-ups,
invoke the model, mutate SOP/skill/memory state, write the active vault, write
the repo, or run shell commands.

## 2026-06-30 Runtime Config Summary

Operators and later agents need to distinguish effective runtime config from
resident service state before changing self-evolution settings such as review
tick enablement. local runtime should expose a read-only runtime config summary via
CLI `config` and Feishu `/config`.

The summary may read `config.jsonl`, `models.jsonl`, and `settings.jsonl` from
the configured repo, ignored local, home, and state layers. It may render active
model/channel/scenario selectors, non-secret model metadata, runtime promotion
and review tick flags, source row refs, defaulted runtime fields, vault roots,
and restart guidance. It must not read `auth.jsonl`, API keys, app secrets,
non-config runtime state artifacts, launchd, service logs, raw context, review,
episode, SOP, or skill bodies; it must not mutate config, write state, restart
services, invoke the model, run review tick, request confirmations, execute
follow-ups, or run shell commands.

## 2026-06-30 Runtime Config Context

The prompt-facing context should carry the same non-secret runtime config
orientation as the CLI/Feishu config summary so later model turns can see
whether self-evolution settings such as review tick are defaulted or explicitly
enabled. The live runner may load the runtime config summary from its configured
config dir and pass it into context assembly as a bounded `Runtime Config`
section.

This section may render active model/channel/scenario selectors, non-secret
model metadata, runtime promotion and review tick flags, source row refs,
defaulted runtime fields, vault roots, and restart guidance. It must not read
`auth.jsonl`, API keys, app secrets, non-config runtime state artifacts,
launchd, service logs, raw context, review, episode, SOP, or skill bodies; it
must not mutate config, write state, restart services, invoke the model
recursively, run review tick, request confirmations, execute follow-ups, or run
shell commands.

## 2026-06-30 Live Run Trace Context

Later live context should expose a bounded trace of recent live harness run
shape so the agent can understand previous rounds, observations, and evidence
refs without opening raw artifacts. This follows the mature agent pattern of
keeping execution diagnostics visible while keeping authority in the harness.

The trace may read completion verification reports, model action envelope
metadata, and episode event metadata. It may render completion status,
verification status, context refs, final response refs, event kind counts,
observation counts, per-round action counts, and envelope refs. It must not
render raw model responses, action payloads, tool result bodies, final response
Markdown, context Markdown, harness artifact bodies, request confirmations,
rerun actions, invoke the model, or mutate state.

## 2026-06-30 Live Run Trace Operator Visibility

Operators need the same bounded live run trace outside model context so they can
diagnose recent harness behavior from CLI or Feishu before changing SOPs,
context rules, or runtime config.

CLI `review traces` and `review traces --trace <ref-or-id>` may list and
inspect recent live run trace summaries. Feishu `/review traces` and
`/review trace <ref-or-id>` may render the same bounded read model. The lookup
may accept a completion report ref, completion id, session id, or report
filename. These views may show completion ids, session/turn ids, completion and
verification status, context refs, final response refs, event kind counts,
observation counts, harness state-action counts, per-round action counts,
action types, and envelope refs.

They must not read raw model responses, action payloads, tool result bodies,
delegation result bodies, final response Markdown, context Markdown, harness
artifact bodies, or completion Markdown. They also must not replay actions,
run review tick, request confirmations, execute follow-ups, invoke the model,
mutate SOP/skill/memory state, write the active vault, write the repo, or run
shell commands.

## 2026-06-30 Capability Catalog Read Model

Operators need a stable answer to "what can the runtime currently do" that does
not depend on the model improvising from partial context. local runtime should expose
a repo-owned local capability catalog through CLI `capabilities` and Feishu
`/capabilities`, `/abilities`, and `/ability`.

The catalog may summarize implemented core tools, harness actions,
context/read-model surfaces, memory and local-learning gates, resident service
surfaces, entrypoints, and explicit non-goals. Core tools should be derived
from `coreToolContracts`, and harness actions should be derived from the
runtime action list so the catalog cannot drift from the execution contract.

This is read-only operator visibility. It must not read auth records, API keys,
app secrets, launchd state, service logs, raw context Markdown, review/SOP/skill
bodies, or arbitrary state artifacts. It must not invoke the model, execute
tools, request confirmations, execute follow-up actions, restart services,
mutate state, write the repo, or write the active vault.

## 2026-06-30 Capability Catalog Context

Normal live tasks need the same repo-owned capability truth as the operator
surface so the model can answer "what can you do" from a bounded local index
instead of improvising from partial prompt context.

The live context may render a compact `Capability Catalog` section from
`getCapabilityCatalog`. It may show the catalog id, catalog version, count,
category titles, capability ids, source refs, and explicit local-only
boundaries. The section is a navigation index, not the full operator detail
JSON, and it does not grant authority beyond the allowed tool contract.

It must not read secrets, auth records, launchd state, service logs, raw context
Markdown, review/SOP/skill bodies, arbitrary state artifacts, or full operator
detail; it must not invoke the model, execute tools, request confirmations,
execute follow-ups, manage services, mutate state, write the repo, or write the
active vault.

## 2026-06-30 Feishu Outbound History Chat Boundary

Normal Feishu private-chat context may include prior assistant replies only when
those outbound records prove the same `open_id` and `chat_id` as the current
message. The adapter should write `chat_id` onto new outbound final-reply
records and skip outbound records that do not carry a chat id.

This keeps the same-chat history window from mixing contexts for the same user.
It must not fetch remote Feishu history, infer chat identity from text,
backfill invalid state, read raw event payloads into the prompt, rebuild memory
indexes, or turn channel logs into durable semantic memory.

## 2026-06-30 Delegated Result Contract

`delegate_agent` is useful for bounded critique and analysis, but delegated
output must not become trusted evidence merely because the subcall returned
text. The live runner should treat delegated output as a structured self-report
contract.

The delegated model must return a JSON object with non-empty `summary` and
`findings_text`. The harness validates this shape, records
`contract_status=passed` or `contract_status=failed`, and returns only bounded
summary/findings plus a limited raw preview as the next-round observation.
Malformed delegated output records `ok=false`; any later `done` claim fails
completion verification while a delegated result failed.

Delegated results remain self-reports. They must not execute tools, read memory,
write state, write the repo, mutate the active vault, bypass completion
verification, or prove final success without main-harness evidence.

## 2026-06-30 Delegated Result Trace Diagnostics

After delegated result contracts exist, later agents and operators need to see
whether failed delegated contracts shaped a live run without opening delegated
artifact bodies. Live run trace summaries should expose delegated result total,
passed, and failed counts in bounded context and Feishu operator views.

The failed count is derived from the completion verification
`delegated_results` check, while the total count comes from episode
`delegated_result` event metadata. The passed count is a bounded derived value:
total minus failed, never below zero. This keeps trace diagnostics aligned with
the harness verification result without promoting delegated self-reports into
evidence.

These diagnostics must not read or render raw delegated result artifacts, model
responses, tool payloads, final responses, context Markdown, or completion
Markdown, and must not rerun actions, invoke the model, request confirmations,
or mutate state.

## 2026-06-30 Context Usage Read Model

Hermes and OpenClaw both make context usage visible before attempting memory or
context maintenance. local runtime should expose the same useful observability without
adding automatic compaction or a new context engine.

`context usage`, Feishu `/context usage`, and Feishu `/usage` may summarize
recent `memory/episodes/*-context.json` manifests. The read model may show the
number of manifests analyzed, total/average/max chars, pressure status counts,
top section aggregates, recent manifest refs, largest section metadata, and
bounded recall/skill/archive counts.

This is routine diagnostics, not a mutation gate. It must not read raw context
Markdown, prompt/model/tool artifacts, final responses, or episode bodies. It
must not compact context, rewrite context assembly, create Opportunity Backlog
decisions, invoke the model, run review tick, request confirmations, execute
follow-ups, write the active vault, write the repo, or run shell commands.

## 2026-06-30 Skill Catalog Operator Visibility

Hermes and OpenClaw make the current ability surface inspectable before asking
an agent to apply or evolve a skill. local runtime should expose the same operator
visibility for local skills, but only as bounded metadata.

`skills`, `skills --skill-name <name-or-ref>`, Feishu `/skills`, and Feishu
`/skill <name-or-ref>` may summarize skill frontmatter and registry metadata:
name, description, status, source, trust level, refs, version, use count,
last-used time, patch count, updated time, and bounded reference counts.

This is a catalog read model, not a skill editor. It must not read or render raw
skill bodies, raw SOP drafts, audits, context Markdown, model responses, tool
results, final responses, or completion Markdown. It must not rewrite registry
metadata, rewrite skill instructions, invoke the model, run review tick, request
confirmations, execute follow-ups, write the active vault, write the repo, or
run shell commands.

## 2026-06-30 Archive Health Read Model

Daily episode archives are useful only if the operator and later agents can see
whether archive summaries are current relative to the append-only episode log.
local runtime should add an archive-health readiness layer before adding more
automatic archive maintenance.

`memory archive-health`, Feishu `/memory archive health`, context, governance
status, and Opportunity Backlog may compare `memory/episodes/events.jsonl`
metadata with `memory/archives/*.json` metadata. They may report missing,
stale, invalid, and orphan archive summaries and render explicit inspection or
refresh commands.

`governance decide-opportunity` may append decisions for `archive_health`
backlog items after an operator handles, defers, or retires the diagnostic
outside the read model. Context, governance status, and Feishu opportunity
views may render the matching decision command as guidance only.

This is a read model, not an archive repair loop. It must not read raw episode
artifacts, generate archives, rebuild the SQLite MemoryStore index, invoke the
model, request confirmations, execute follow-ups, write state, write the active
vault, or write the repo. Refreshing summaries remains the explicit local
`memory archive` operator action.

## 2026-06-30 Skill Registry Health Read Model

Hermes and OpenClaw-style agents need the current ability surface to be
inspectable before skill evolution can be trusted. Skill catalog visibility
shows what is currently discoverable; local runtime also needs a bounded health layer
that explains when active-vault registry metadata, skill packages, and registry
events disagree.

`skills health`, Feishu `/skill health`, context, governance status, and
Opportunity Backlog may compare existing active-vault `registry/skills.jsonl`
rows, current `SKILL.md` frontmatter and hashes, and
`registry/skill-events.jsonl` metadata. They may report invalid registry rows,
missing packages, invalid frontmatter, metadata/hash drift, orphan active-vault
packages when a registry snapshot exists, invalid event rows, and orphan skill
events. They may render bounded inspect commands and explicit registry sync
guidance.

`governance decide-opportunity` may append decisions for
`skill_registry_health` backlog items after an operator handles, defers, or
retires the diagnostic outside the read model. Context, governance status, and
Feishu opportunity views may render the matching decision command as guidance
only.

This is a read model, not a skill repair loop. It must not read or render raw
skill bodies, rewrite registry JSONL, rewrite skill instructions, write the
active vault, promote SOPs, request confirmations, execute follow-ups, invoke
the model, or run shell commands. Registry repair remains an explicit operator
action such as inspecting the package and then running `skills --action sync`.

## 2026-06-30 Skill Registry Sync Provenance

Hermes separates skill write origin/provenance, and OpenClaw keeps skill
changes behind explicit operator lifecycle commands. local runtime already has an
explicit `skills --action sync` gate for active-vault registry repair, so that
gate should also leave bounded provenance in the active-vault skill event log.

`skills --action sync` may rebuild `registry/skills.jsonl` from current
`SKILL.md` frontmatter and append `synced` events to
`registry/skill-events.jsonl` only for entries that were created or changed by
the sync. Re-running sync with no entry changes must not append duplicate
events. The returned event refs should be resolvable by the existing
`skills events --event ...` read model.

This remains an explicit operator mutation gate, not a read-model side effect.
Feishu, context, Opportunity Backlog, skill health, review tick, and the
resident service may render sync guidance or later read the `synced` events,
but they must not execute sync. Sync must not render raw skill bodies, promote
SOPs, request or execute confirmations, invoke the model, run shell commands,
publish/share skills, or perform multi-machine registry synchronization.

## 2026-06-30 Session Recap Read Model

Hermes has a cheap local recap pattern for re-orienting a user without making
another model call. GenericAgent's memory rules also keep durable recall tied
to verified action evidence. local runtime should absorb that pattern as a local
session recap read model over existing harness evidence.

`memory recap`, `memory recap --session <session-id>`, Feishu `/recap`, and
Feishu `/recap <session-id>` may summarize one session from episode event
metadata, completion verification report metadata, context manifest metadata,
and bounded working checkpoint metadata. The summary may show event counts,
kind counts, latest task, completion status, context size and recall counts,
working checkpoint next action, recent event summaries, artifact refs, and
next inspection commands.

This is a recovery-orientation surface, not a compactor or memory writer. It
must not read raw context Markdown, raw model responses, raw tool outputs, raw
final responses, raw episode artifacts, SOP or skill bodies, rebuild the
MemoryStore index, invoke the model, run review tick, request confirmations,
execute follow-ups, mutate state, write the repo, or write the active vault.

## 2026-06-30 Workspace Status Read Model

Before local runtime grows more autonomous repo-write or self-evolution behavior,
operators need a cheap way to see whether the local checkout is clean. Hermes
and OpenClaw-style write gates rely on visible local state before mutation;
local runtime should start with a read model, not rollback automation.

`workspace status`, Feishu `/workspace`, and Feishu `/workspace status` may run
only fixed `git status --porcelain=v1 -b` argv against the configured repo
root. They may summarize branch, upstream, ahead/behind, dirty-file counts,
conflict counts, and bounded path/status entries.

This is a fixed workspace diagnostic, not a shell surface or VCS control plane.
It must not accept user-provided command text, read file bodies, stage, commit,
reset, checkout, clean, mutate state, invoke the model, write the repo, write
the active vault, or manage the resident service.

## 2026-06-30 Workspace Status Context

The fixed workspace diagnostic should also be visible inside live context so
normal agent runs can orient before proposing repo writes. This borrows the
Hermes/OpenClaw pattern of making local write state visible before mutation,
but still stops short of automatic checkout management or rollback.

The `Workspace Status` context section may use the shared `workspace status`
read model and render status, branch, upstream, ahead/behind, dirty counts,
conflict counts, and bounded changed paths. It may include changed paths in the
context manifest so later diagnostics can see which local files were dirty
when the turn began.

This is pre-write orientation only. It must not read file bodies, stage, commit,
reset, checkout, clean, mutate state, invoke the model, write the repo, write
the active vault, or claim that a clean workspace means the resident runtime is
deployed.

## 2026-06-30 Repo Write Workspace Guard

`file.write_repo` should preserve bounded workspace evidence around every repo
write. This is the next step after making workspace state visible in CLI,
Feishu, and context: mutation artifacts should say what the checkout looked
like immediately before and after the harness wrote a file.

The guard may reuse the fixed `workspace status` read model before and after a
valid repo write. Tool result artifacts may include status, branch,
upstream/ahead/behind, dirty counts, conflict counts, and bounded path/status
entries for both snapshots, plus a short guard summary such as whether the
workspace was already dirty and whether the target path appears after the
write.

This is evidence only. It must not read file bodies, reject an otherwise valid
write because the workspace was dirty, stage, commit, reset, checkout, clean,
write separate guard state artifacts, invoke the model, or roll back the write.

## 2026-06-30 Repo Write Guard Trace Visibility

Repo-write workspace guard evidence should be visible in operator trace views
without requiring the operator or a later context bundle to open raw ToolResult
JSON. The durable source remains the ordinary `tool_result` evidence event:
`file.write_repo` summaries may include a bounded, parseable guard clause with
before/after status, changed-file counts, dirty-state flag, and target-path
visibility.

The `Live Run Trace` read model, context section, and Feishu `/review traces`
views may parse this bounded event summary and render a small guard list. They
must not read raw tool result artifacts, raw command output, file bodies, raw
model responses, final responses, or context Markdown.

This is trace visibility only. It does not grant write permission, block repo
writes, replay tools, request confirmations, execute follow-ups, mutate state,
write the active vault, or repair git state.

## 2026-06-30 Repo Write Guard Backlog Attention

Repo-write guard trace visibility should also feed the local self-evolution
attention loop when a write happened on top of a preexisting dirty workspace.
local runtime may derive `repo_write_guard` Opportunity Backlog items from bounded
live run trace guard summaries. The item carries only trace ref, completion id,
event id, path, before/after workspace status, changed-file counts,
preexisting-dirty flag, target-changed flag, and an inspect command.

This gives the operator and later context a clear follow-up point before more
repo writes happen, while preserving the original write policy. It must not
read raw ToolResult JSON, file bodies, raw command output, model responses,
final responses, or context Markdown. It must not block writes, roll back,
stage, commit, reset, repair git state, request confirmations, run review tick,
or mutate SOP/skill/memory state. The item is eligible for append-only
Opportunity Backlog decisions so inspected guards can be deferred, completed,
retired, or reopened without editing the source trace.

## 2026-06-30 Model-Aware Context Budget Diagnostics

Hermes exposes context-window guardrails when model selection changes, and
OpenClaw treats context assembly as a lifecycle with diagnostics rather than a
black box. local runtime should keep the first-version implementation smaller: a
local, read-only budget signal derived from current model config, not a
pluggable context engine or automatic compactor.

`models.jsonl` model records may declare `context_window_tokens`. The runtime
config summary may expose that non-secret field, `max_output_tokens`, and a
derived input-budget estimate. Live context manifests may store the derived
budget metadata so later context usage and pressure diagnostics can explain the
budget they used.

`context usage`, `context pressure`, Feishu `/context usage`, Feishu `/usage`,
and Feishu `/context pressure` may use the active model budget when present, or
fall back to static thresholds when it is absent. This must not call the model
provider, infer remote model limits, read `auth.jsonl`, compact transcripts,
rewrite context assembly, mutate state, or execute any recovery action. It is
operator observability only.

## 2026-06-30 Feishu Same-Sender Follow-Up Queue

OpenClaw-style queue steering and GenericAgent's task queue show that a chat
entrypoint should not drop ordinary follow-up messages merely because the
current run is still active. local runtime should absorb the useful local scheduling
part without adopting remote steering, cancellation, or multi-process queues.

Normal Feishu private-chat messages from the same `open_id` may enter a
bounded in-memory follow-up queue while that `open_id` has an active run. The
adapter may send a configured queued response, write queued trace artifacts
under `channels/feishu/queued/`, and drain queued items after each run boundary
by invoking the ordinary task runner with the same local context rules.

This remains local process scheduling. It must not apply to operator commands,
unauthorized senders, group chats, cross-user ordering, durable restart replay,
remote Feishu history, remote queues, steering, cancel/resume semantics,
self-evolution confirmation execution, active-vault writes, service management,
or multi-machine coordination. Queue-full messages may use the configured busy
response.

## 2026-06-30 Model Failure Diagnostics

OpenClaw keeps model diagnostic events separate from retry and failover policy.
local runtime should adopt that separation for the local harness: when model
cognition fails before a valid `ModelActionEnvelope`, the harness records a
bounded diagnostic rather than only collapsing the run into a generic blocked
response.

Live runs may write
`memory/episodes/<session>-model-diagnostic-r<round>.json` for model request
failures and action-envelope parse failures. The diagnostic may classify the
failure as auth, rate limit, billing, context window, timeout, server, network,
format, empty response, or unknown. It may include sanitized previews,
model/config metadata, context refs, response ref when one exists, and input
size metadata. Completion reports, bounded live run trace context, and Feishu
operator views may show the diagnostic kind/stage/refs.

This is observability only. It must not retry requests, switch models, infer
provider limits remotely, expose raw auth values, render raw model response
bodies into context or Feishu, write the repo, write the active vault, claim
completion, or mutate SOP/skill/memory state.

## 2026-06-30 Model Diagnostic Backlog Attention

Model failure diagnostics should feed local self-evolution attention without
becoming an automatic recovery system. local runtime may enrich existing
`completion_verification` Opportunity Backlog items with bounded model
diagnostic summaries: failure kind, failure stage, round, diagnostic ref,
response ref, sanitized preview, and read-only inspect/trace commands.

Unscoped review tick may include those diagnostic fields in its bounded focus
query. If the focused completion report has model diagnostics and no matching
episode evidence, review tick may replace the generic memory-gap proposal with
a `runtime_gap` proposal that asks the operator to inspect provider, config,
context, or SOP gaps.

This remains proposal-only attention. It must not retry model calls, switch
models, infer remote provider limits, read raw model response bodies, read raw
final responses or tool outputs, request confirmations, execute follow-ups,
write the repo, write the active vault, or mutate SOP/skill/memory state.

## 2026-06-30 Durable Health Review Tick Focus

Durable local health issues should not block the self-evolution loop merely
because their repair commands are operator-maintenance actions. When an
`archive_health` or `skill_registry_health` item is the top Opportunity Backlog
item, unscoped `review tick` may record it as
`focus.source=opportunity_backlog`, include bounded issue fields in the review
query, and materialize a proposal-only `runtime_gap` follow-up. If background
review produced only an empty generic memory-gap proposal, the health focus
proposal may replace it; if other evidence-backed proposals exist, it may be
appended as another gated follow-up.

The focus query may include issue kind/status, archive date/count/ref metadata,
skill name, registry/event/instructions refs, and whether an explicit repair
command exists. It must be derived only from the existing Opportunity Backlog
summary and read-model metadata.

This is analysis and routing only. It must not refresh archives, sync registry
metadata, restore skill packages, write the active vault, read raw skill bodies,
read raw episode artifacts, request confirmations, execute follow-ups, mutate
SOP/skill/memory state, invoke the model outside the normal review tick path,
or run shell commands.

## 2026-06-30 Local Auth File Priority

local runtime should not require `.env` or process environment secrets for the local
first-version model and Feishu baseline. The repo-level `config/auth.example.jsonl`
remains a template, ignored `config/auth.local.jsonl` may hold repo-local
machine secrets, and `<LOCAL_RUNTIME_HOME>/config/auth.jsonl` is the expected
home source for API keys,
OpenAI-compatible model auth, Feishu app ids, and Feishu app secrets.

Direct auth fields and explicit env-backed fields are the only supported auth
forms; direct fields win when both are present. The runtime does not infer
`API_KEY`, `FEISHU_APP_ID`, or `FEISHU_APP_SECRET` from process env unless an
auth record names that exact env field. This lets the resident launchd service
run from copied repo config plus home-layer secrets without carrying implicit
secret defaults in its environment.

Feishu channel shape belongs in `settings.jsonl`; when no channel record is
configured, the runtime should report missing local config instead of
constructing a channel from `FEISHU_*` process env values.

Non-secret config summaries remain unchanged: CLI `config`, Feishu `/config`,
live Runtime Config context, and capability catalog reads must not read
`auth.jsonl` or render secret values. Only readiness or execution paths that
need credentials, such as `doctor`, `live`, `pipeline`, foreground IM, and
service validation, may resolve auth records.

## 2026-06-30 Doctor Auth Source Diagnostics

File-first auth is only useful if local readiness output can explain which
auth source is active without leaking secrets. `doctor` may read active
`auth.jsonl` records and report bounded metadata: auth id, source ref,
direct/env/missing mode, explicitly named env var, and whether the env value is
present. For Feishu app-secret auth, app id and app secret fields are reported
separately so operators can see partial config errors.

This diagnostic is readiness-only. It must not render direct secret fields,
API keys, Feishu app ids, Feishu app secrets, or env values. It must not make
CLI `config`, Feishu `/config`, Runtime Config context, or the capability
catalog read `auth.jsonl`. It does not mutate config, state, services, repo
files, active-vault files, or opportunity decisions.

## 2026-06-30 Service Health State Root Alignment

The resident IM service uses a service-scoped default state root under
`<LOCAL_RUNTIME_HOME>/state/runtime` when operators do not pass `--state-root`.
`service health` must use that same default so the common local diagnostic
reads the actual resident heartbeat after `service restart`.

Explicit `--state-root` remains an override for tests and intentionally
separate local runs. The rule is scoped to service lifecycle and service health
commands; ordinary interactive commands such as `live`, `pipeline`, `memory`,
`context`, and `review` keep their normal runtime state selection.

This keeps the health surface read-only: it reads heartbeat, review tick,
pause signal, and bounded repo git identity only. It still must not inspect
launchd, read logs, run shell commands, invoke the model, restart services,
read source bodies, mutate state, or write the active vault.

## 2026-06-30 Service Guidance Default Commands

Service-health guidance rendered in context, governance, Opportunity Backlog,
and Feishu should use the service default commands:
`pnpm run runtime -- service health --target im` and
`pnpm run runtime -- service restart --target im ...`.

These guidance strings should not force `--state-root <state-root>` because the
service harness already defaults to `<LOCAL_RUNTIME_HOME>/state/runtime`. Explicit
state-root guidance is reserved for tests or intentional alternate local
service roots. This rule applies only to service health/lifecycle guidance;
ordinary memory, review, pipeline, context, and governance state commands keep
their explicit `<state-root>` placeholders.

## 2026-06-30 Opportunity Backlog Action Chains

The ranked Opportunity Backlog should expose a compact action-chain read model
so the local operator can see the intended inspect, action, and decision order
without inferring it from prose. Each step carries a label, command, effect
class, and optional reason, and must be derived only from command fields already
present on the backlog item.

Context may render selected step commands because it is the prompt-facing
operator work surface. Aggregate governance status and Feishu may render the
same chain as bounded summary metadata, with Feishu staying compact enough to
avoid unnecessary message splitting.

This is guidance only. It must not execute commands, restart services, append
opportunity decisions, request or execute confirmations, mutate SOP/skill/memory
state, write the active vault, write the repo, invoke the model, or run shell
commands from read-only surfaces.

## 2026-06-30 Review Tick Action-Chain Focus

Unscoped review tick should preserve the selected Opportunity Backlog item's
action-chain shape in its bounded focus metadata. The focus stores only labels,
effect classes, and optional reasons so later tick history, service health,
governance status, and Feishu views can explain the intended operator sequence.
When that focus materializes a bounded `runtime_gap` proposal and review inbox
item, the same summary may be copied into those read models and their report
views.

The review query may include a compact labels/effects representation after the
stable refs and diagnostics. It must not copy action command strings into the
tick focus, and it must not execute or schedule any action-chain step.
Proposal and inbox propagation must follow the same rule: preserve labels,
effect classes, and optional reasons, but not command strings.

This keeps the GenericAgent-style continuation loop and OpenClaw/Hermes-style
status surfaces aligned with local runtime's local read-only boundary: review tick can
observe the next operator sequence, but mutation still requires the explicit
CLI command or confirmation gate.

## 2026-07-01 Opportunity Decision Action-Chain Snapshot

Append-only Opportunity Backlog decisions for eligible derived items may capture
the bounded action-chain shape that was visible when the operator recorded the
decision. The snapshot stores labels, effect classes, and optional reasons only.
It must not copy command strings, raw artifacts, service logs, model responses,
or follow-up bodies.

The snapshot is decision provenance for later context, governance status, CLI
JSON, and Feishu views. It is not execution evidence: it does not prove that an
inspect, restart, local write, runtime command, confirmation request, or
decision command was run. Reopened historical decisions without a current
backlog item may omit the snapshot rather than inventing one.

## 2026-07-01 Context Manifest Repair Gate

`context health` remains a read-only diagnostic over manifest JSON refs and
context Markdown file refs. It must not read raw context Markdown or repair
sidecars while listing health issues for context, governance status, Feishu,
review tick, or Opportunity Backlog.

The explicit `context repair --context <*-context.md>` command is the local
write gate for orphan context Markdown files. It may read exactly the selected
context Markdown and write exactly the missing manifest sidecar with conservative
recovered metadata. It must not overwrite an existing manifest, reconstruct
unrecoverable recall refs, invoke the model, rewrite context Markdown, mutate
repo files, write the active vault, or run shell commands.

Read-only surfaces may show the repair command as action-chain guidance. They
must not execute it. Feishu only renders the full command in one-issue context
health detail; broader governance/backlog views should stay compact.

## 2026-07-01 Skill Registry Event Retirement Gate

`skills health` remains a read-only diagnostic over active-vault registry rows,
skill frontmatter metadata, and skill registry event metadata. It may identify
orphan skill events, but it must not delete events, restore packages, rewrite
registry snapshots, read raw skill bodies, invoke the model, or run shell
commands.

The explicit `skills retire-event --event <ref-or-id> --reason "..."` command
is the local write gate for historical orphan skill registry events. It appends
one bounded `retired` event for the same skill name and instructions ref,
citing the target event as evidence. It must not overwrite or remove earlier
events, rewrite `registry/skills.jsonl`, mutate skill packages, promote SOPs,
request confirmations, invoke the model, or run shell commands.

`skills health` treats the latest `retired` event for the same
skill/instructions ref as the close signal for that orphan event chain.
Read-only surfaces may show the retire command as action-chain guidance, but
must not execute it.

## 2026-07-01 Capability Acceptance Audit

`capabilities acceptance` is the read-only acceptance baseline for deciding
whether the current local runtime is ready for the next feature slice. It
gates current evidence by core execution, basic entrypoints, agent harness, and
context runtime, then lists the verification commands and next candidate slices
an operator should consider. SOP, skill, application, and other local-learning
work remains visible only as follow-up guidance unless a later local-learning
iteration explicitly selects it.

This intentionally follows the useful part of GA/Hermes/OpenClaw maturity
patterns: make readiness and next work explicit before adding another runtime
mutation. It is not a runner. It must not execute tests, invoke the model,
inspect secrets, read raw context/review/SOP/skill bodies, restart services,
mutate state, write the repo, or write the active vault. Feishu may render the
same baseline as `/capabilities acceptance`, but it must stay read-only.

## 2026-07-01 SOP Loop Rehearsal Gate

`review rehearse-sop-loop` is the explicit local acceptance gate for proving
the SOP promotion/reuse path without using the real active vault. It creates a
state-scoped sandbox repo, sandbox state roots, and sandbox active vault, then
runs the real live runner twice with an internal deterministic model: first to
promote a sandbox skill, then to recall and reuse it.

The command writes a bounded rehearsal report and one episode evidence event
under the selected state root. It must not call external models, read secrets,
write the working repository, write the real active vault, manage services, run
shell commands, or execute from Feishu. This gives local runtime the useful GA/Hermes/
OpenClaw pattern of an operator-visible rehearsal, while preserving the
single-machine local boundary and keeping read-only surfaces as observers.

## 2026-07-01 Context Pressure Action Gate

`context pressure` now returns operator guidance for oversized context
manifests. The guidance provides stable inspect, defer, complete-after-external-
mitigation, and retire-historical decision commands for the matching
`context_pressure` Opportunity Backlog item.

This gate intentionally does not add automatic compaction, transcript
rewriting, context assembly rewriting, or raw context Markdown reads. A pressure
item can be decisioned only through append-only Opportunity Backlog decisions.
Marking it completed means the operator verified an external mitigation or
assembly change outside this read model; marking it retired means the pressure
is historical. Any future mitigation command must be introduced as its own
explicit CLI command with focused tests before it can change context assembly.

## 2026-07-01 Harness Replay Acceptance

`review replay-audit --trace <ref-or-id>` is the explicit local gate for
turning an existing bounded live run trace into replayable governance evidence.
It does not replay the agent. It reads live trace metadata, completion
verification metadata, and bounded event summaries, then writes
`governance/replays/<id>.json`, `governance/replays/<id>.md`, and one
`audit_result` evidence event.

This keeps the useful GA/Hermes/OpenClaw pattern of replayable evidence while
preserving local runtime's local-only runtime boundary. Replay audit must not invoke
the model, execute tools, read raw model/tool/delegation/final/context
artifacts, write the repo, write the active vault, manage services, or mutate
SOP/skill/semantic-memory state. Context, aggregate governance status, CLI
`review replays`, and Feishu `/review replays` may render bounded replay
summaries and refs as evidence only.

## 2026-07-02 Context Attention Plan

GA/avatar and Hermes both reduce model distraction by making the active task,
summary state, and context pressure explicit before the next model step.
XingZhe should borrow that attention-routing pattern without adopting Hermes
automatic compaction in the first-version local runtime.

Live context may therefore render an optional bounded `Attention Plan` section
only when there is an actual attention signal: model context budget metadata,
prior context-pressure manifest metadata, or a current working checkpoint. The
section keeps focus order, pressure mitigation kind, and checkpoint next action
visible to the model while remaining read-only.

`Attention Plan` must not read raw context Markdown, raw skill/SOP/review
artifacts, run tools, invoke the model, compact context, rewrite context
assembly, write state, write the repo, or write the active vault. Quiet first
turns with no pressure, budget, or checkpoint do not render the section, so the
hint does not become a new default token tax.

## 2026-07-03 Repo-Local Runtime Workspace

Repo-local state and smoke artifacts should use one ignored `.runtime/`
workspace instead of creating many top-level `.runtime-*` directories.
Interactive local runs use `.runtime/state`, explicit pipeline experiments may
use `.runtime/stage`, and one-off smoke runs use `.runtime/smoke/<name>`.

Top-level `.runtime-*` and `.runtime_*` directories are unsupported. They
should not be ignored as a compatibility surface, and they should be deleted or
moved into the supported `.runtime/` layout when discovered.

This rule is scoped to repo-local foreground work. The resident IM service keeps
its checkout-independent default under `<LOCAL_RUNTIME_HOME>/state/runtime`
when no explicit `--state-root` is passed, preserving the service health and
restart behavior already established for long-lived local operation.

## 2026-07-03 Feishu Operator Notification Outbox

Progress notifications should be state-first so local agents can request an
operator update without owning Feishu credentials or a live transport. The CLI
therefore exposes provider-neutral `notify queue` and `notify list` commands
over `operator/notifications/outbox/`.

Only the resident Feishu service may drain queued Feishu notifications. The
drain path reuses the configured `open_id` allowlist, text chunking, Feishu
transport, and `channels/feishu/events.jsonl` audit stream, then marks each
request `sent` or `failed`.

This does not introduce provider-first `feishu` CLI commands, group chat sends,
interactive cards, remote Feishu queueing, direct CLI sends, or a general
external notification API.

## 2026-07-03 Pressure-Aware Episode Recall Limit

GA-style attention control should feed back into the next model step, not only
appear as diagnostics. When the latest context pressure metadata says the
largest pressure is episode recall, the live runner may reduce the next episode
recall injection cap from four hits to one hit.

This is a narrow attention guard. It reads only context manifest metadata via
the existing context-pressure read model, records a bounded evidence event, and
does not compact context, rewrite previous artifacts, delete memory, rebuild the
episode index, change selected-skill recall, or introduce a general context
rewriter.

## 2026-07-03 Outcome-Aware Skill Recall

Selected-skill outcome telemetry should improve the next skill selection
without becoming automatic skill editing. Skill recall may read recent bounded
`memory/skills/usage/*.json` summaries and apply small capped score adjustments:
verified passed outcomes can raise a candidate, while failed, skipped, blocked,
unfinished, or unverified outcomes can lower it.

The live context may render final score, base score, aggregate outcome-quality
counts, score adjustment, and latest outcome ref before the selected skill
body. This keeps GA-style attention focused on higher-confidence procedures
while preserving local runtime's audit boundary.

This ranking feedback must not read raw prior context Markdown, final
responses, completion Markdown, model prompts, tool results, or unselected
skill bodies. It must not revise, retire, or rewrite skills, mutate registry
metadata, execute governance actions, or create confirmations.

## 2026-07-03 Runtime Workspace Hygiene Diagnostic

Repo-local runtime state should be discoverable without preserving unsupported
historical layout. `workspace runtime` reports top-level `.runtime-*` and
`.runtime_*` directories as invalid layout and names the supported `.runtime/`
workspace shape.

This diagnostic is intentionally read-only. It scans directory names only and
does not read file bodies, move or delete local state, mutate state, invoke the
model, write the repo, or write the active vault. Cleanup remains an operator
action because unsupported runtime directories can contain local evidence or
smoke artifacts that should be inspected before deletion.

## 2026-07-07 Local Web Console And Runtime Sessions

The first GUI surface should be a localhost web console, not a desktop app or
hosted multi-user dashboard. This keeps the operator surface close to the local
state root and existing CLI/runtime contracts while still making sessions,
inbox entries, profile binding, and task-run history visible.

Runtime sessions are local control-plane state. Feishu groups map to runtime
sessions through source route keys; unknown groups can only be bootstrapped by
authorized operators and start as pending/unassigned. A profile is bound by
`/session use <profile>` or by the web console. Ordinary bound group messages
append inbox entries; only explicit `/run`, explicit bot mention, authorized
private/direct tasks, or web-console Run actions may invoke the live runner.

This does not introduce hosted auth, multi-user tenancy, desktop packaging,
remote session databases, durable cross-process queues, or automatic
LLM-inferred role assignment. Project-scheduled or local tasks may record task
runs without any Feishu source mapping.

## 2026-07-07 Runtime Daemon And MessageGateway

The resident process should be a unified local runtime daemon rather than a
Feishu-specific process with GUI bolted on. `im serve` remains a compatibility
entrypoint, while `daemon serve` and `service --target runtime` are the
provider-neutral resident surfaces.

Web, Feishu, Telegram, and Discord are channel adapters behind a MessageGateway
lifecycle interface. Provider-specific route identifiers stay inside adapters
and runtime session source mappings. Discord is a first bot adapter using
Gateway events plus REST message sends; slash commands, full resume/sharding,
and rich interactions remain out of scope.

IM channel configuration uses a provider-neutral loader. Channel records can
declare `kind: feishu`, `kind: telegram`, or `kind: discord`, and resident CLI
surfaces accept `--provider` as a selector guard. Feishu, Telegram, and Discord
are startable in this slice. Config resolution stays in
`im_config.ts`; provider startability and concrete adapter construction live in
`im_adapters.ts`.

Channel messages normalize into a provider-neutral source envelope before
runtime session binding. The source envelope carries channel kind, configured
channel id, conversation type, conversation id, optional thread id, optional
actor id, and optional profile. Route keys, source keys, inbox entries, and task
run source refs are derived from that envelope rather than from Feishu-specific
fields.

Inbound channel messages go through a shared runtime channel dispatcher after
provider normalization. The dispatcher owns `/session use`, pending bootstrap,
inbox append, and `/run`/mention trigger classification; adapters keep SDK and
reply transport logic.

Explicit runtime-session runs write to a local append-only task queue before
invoking the runner. Feishu group runs and web-console runs synchronously claim
their own queued task, while the task-run read model mirrors `queued`,
`running`, and final rows with the same id for GUI/history visibility. The
queue read model can surface queued or stale running tasks for recovery, and
the resident daemon owns a bounded queue worker that consumes stale
queued/running tasks and writes `services/<target>/task_queue.json` status.
This recovers self-contained runner work without introducing a remote broker,
or cross-process scheduling.

Outbound communication gets the same local-first treatment. Task final/error
results from Feishu, Web, and daemon recovery append provider-neutral rows to
`channels/outbox.jsonl`; provider-specific delivery refs stay optional metadata
owned by adapters. Feishu/Telegram/Discord recovery rows can be queued and drained by
the matching adapter back to the original conversation. This gives GUI/diagnostics a stable
outbox read model without turning the runtime core into a Telegram/Discord/Feishu
send adapter or retry broker.

This slice standardizes channel lifecycle and resident service composition. It
does not add hosted service governance, durable cross-process task scheduling,
multi-user auth, desktop packaging, a generic retry broker, Telegram adapter
features beyond the long-polling Bot API adapter, or Discord features beyond
the Gateway/REST bot adapter.
