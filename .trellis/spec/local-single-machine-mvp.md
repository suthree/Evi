# Local Single-Machine MVP

## Purpose

The first version is a local single-machine self-growing agent runtime. It
must prove local execution and verification before any broader product surface
or compatibility story.

## Trellis Boundary

This repo uses TrellisVCS 3.2.4 with minimal no-index metadata. Trellis records
repo-local governance, decisions, and bounded implementation tasks. It is not
runtime state, durable memory, an active-vault registry, or a promotion gate.

Agent-facing Trellis context must stay thin. Do not run Trellis seeding,
seasoning, workspace indexing, semantic indexing, or broad regeneration unless
the operator explicitly asks for that workflow.

## Hard Boundary

The first version does not design for:

- open-source package compatibility
- multi-user service operation
- multi-machine skill sharing
- public skill marketplaces
- hosted or multi-user daemon operation
- hosted, multi-user, or desktop GUI dashboards
- Docker or Kubernetes deployment
- broad external agent team orchestration

If a future idea does not improve the local first-version runtime, it does not
belong in this spec.

## Capability Layers

### Core Execution

Core execution is the first priority:

- read files
- write state
- write repo files
- run bounded local commands
- search the repo
- fetch HTTP(S) content

Current implementation has the first-version core tool surface:
`file.read`, `file.write_state`, `file.write_repo`, `repo.search`,
`http.fetch`, `command.run`, and `code.execute_node`.

### Runtime Control

Runtime control keeps core execution bounded:

- context assembly
- turn snapshots
- grouped repo-local runtime workspace under `.runtime/` for interactive,
  pipeline, and smoke state roots
- tool contracts
- path boundaries
- side-effect labels
- timeout and output limits
- evidence events
- harness-owned completion verification reports
- harness-validated delegated result contracts for `delegate_agent`
- failed/skipped completion verification reports in the ranked Opportunity Backlog
- context assembly manifest sidecars
- bounded task reference context for repo-local `@file` and `@folder` refs
- local context manifest inspection
- fixed pre/post workspace status evidence for repo writes
- episode memory search and session replay
- bounded episode-memory recall in live context
- proposal-only background review
- chain-aware background review proposals
- read-only background review history for recent background reports, including
  compact proposal action-chain labels/effects without command strings
- read-only completion verification history for recent completion reports
- bounded live run trace context for recent live harness run shape and refs
- read-only live run trace history for recent live harness run shape and refs
- delegated result pass/fail diagnostics in bounded live run trace context and
  operator views without reading delegated artifact bodies
- model failure diagnostics for request and action-envelope parse failures in
  completion reports, bounded live run trace context, and operator views
  without rendering raw model response bodies
- model diagnostic completion-verification attention in Opportunity Backlog,
  bounded context, governance status, Feishu operator views, and review tick
  runtime-gap proposals
- read-only local skill catalog metadata for current skill frontmatter,
  registry refs, source, status, and usage counters without reading raw skill
  bodies
- read-only context manifest sidecar health diagnostics
- read-only context usage diagnostics for recent context manifest size and
  section distribution
- optional model-aware context budget metadata derived from non-secret
  `models.jsonl` fields
- read-only local session recap from episode event metadata, completion report
  metadata, context manifest metadata, and bounded working checkpoint metadata
- read-only context pressure diagnostics for oversized context manifests
- explicit context pressure operator guidance for bounded inspect and
  append-only decisioning without context artifact mutation
- optional bounded Attention Plan context section when model budget, prior
  context pressure, or a working checkpoint exists, keeping attention routing
  visible without reading raw artifacts or compacting context
- read-only local capability catalog over implemented tools, harness actions,
  read models, local-learning gates, service runtime, entrypoints, and
  boundaries
- read-only next-version capability acceptance audit over current gates,
  verification commands, and next candidate slices
- bounded Capability Catalog context for prompt-facing local ability
  orientation without expanding model authority
- read-only service health diagnostics for heartbeat freshness, runtime-build
  summary, repo HEAD identity, resident deployment status, review tick status,
  and autonomy pause status
- `service health` CLI command for the bounded resident IM health read model
- service-health attention in the ranked Opportunity Backlog when resident IM
  state, heartbeat, runtime build, or review tick status needs operator review
- explicit StageRunner pipeline resume gate for blocked or failed checkpoints
- pipeline resume command guidance in read-only backlog/context/operator views
- local content dry-run publish plans for active exploration, writing only
  state artifacts under `content/runs/`
- local web console for runtime sessions, Feishu inbox review, profile binding,
  and explicit local task runs
- Feishu group source binding to local runtime sessions with
  pending/unassigned bootstrap
- bounded same-sender in-memory follow-up queue for normal Feishu private-chat
  tasks
- review tick materialization into a state-only self-evolution inbox
- read-only review tick history for recent autonomous review focus
- explicit local operator resume gate for active autonomy pause
- self-evolution inbox inspection and confirmation requests
- executed confirmation read-model updates for self-evolution inbox items
- ranked Opportunity Backlog read model for local self-evolution attention
- append-only Opportunity Backlog decision log for open/deferred opportunities
  and eligible read-only attention items
- dry-run review proposal follow-up planning
- stable review follow-up action identities
- read-only review follow-up execution gate
- mutation follow-up confirmation requests
- confirmed evidence-collection, narrow-review, draft, audit, promotion, and
  skill-revision validation follow-up execution
- explicit review proposal to state-only SOP draft
- explicit state-only SOP draft audit
- explicit audited SOP draft promotion gate
- read-only SOP self-evolution provenance chain
- read-only SOP Evolution Ledger across drafts, audits, follow-ups, episode
  refs, and active-vault skill registry events
- SOP Evolution Ledger provenance boundaries that keep cited draft evidence
  separate from lifecycle audit, skill, and follow-up refs
- read-only reused-skill coverage check for one SOP chain
- coverage-aware `revise_skill` summaries in Opportunity Backlog, Governance
  Queue context, aggregate governance status, and Feishu opportunity views
- read-only active-vault skill registry event history for promoted and
  validated skill events
- explicit active-vault skill registry sync provenance events for changed
  registry entries
- read-only `draft_sop` evidence-readiness summaries in Opportunity Backlog,
  Governance Queue context, aggregate governance status, and Feishu opportunity
  views
- readiness-gated `draft_sop` confirmation requests and execution-time
  revalidation before writing state-only SOP drafts
- SOP Evolution Ledger open-chain items in the ranked Opportunity Backlog
- structured SOP Evolution Ledger next commands in ledger, backlog, and Feishu
  read-only operator views
- SOP evolution next-command confirmation requests with stale-chain
  revalidation before execution
- SOP evolution confirmation source/SOP refs in review confirmation read models
  and bounded Governance Queue context
- read-only stale/current readiness for pending SOP evolution confirmations
- read-only review confirmation filtering by SOP evolution gate
- read-only stale SOP confirmation recovery guidance
- read-only SOP confirmation reason codes and gate summary diagnostics
- read-only reason-coded stale SOP confirmation recovery playbooks
- append-only stale SOP confirmation recovery decision log
- recovery-decision-aware Opportunity Backlog attention for stale SOP gates
- Opportunity Backlog focus summary in aggregate governance status
- Opportunity Backlog focus selection for unscoped review ticks
- Opportunity Backlog action-chain summaries in unscoped review tick focus
  metadata without copying command strings or executing commands
- completion verification focus selection for unscoped review ticks
- context-health focus selection for unscoped review ticks
- archive-health and skill-registry-health focus selection for unscoped review
  ticks
- attention-worthy working checkpoint focus selection for unscoped review ticks
- selected-skill outcome and drift focus selection can create gated
  `skill_revision` review proposals
- explicit SOP loop rehearsal can run the live promotion/reuse path in a
  state-scoped sandbox without touching the real active vault
- completion verification

Context and harness are first-version infrastructure, but only as a minimal
control plane.

### Basic Entrypoints

CLI, local web console, and IM are first-version basic entrypoints.

Feishu is the first IM provider. It should be exposed as an agent IM capability,
not as a separate optional Feishu subsystem.

The local web console is a localhost operator surface. It can inspect runtime
sessions, Feishu inbox entries, and task-run history, bind a pending
Feishu-backed session to a profile, and submit an explicit local task run. It
is not a hosted, multi-user, authenticated, or desktop GUI.

Feishu private chat may expose read-only local operator commands for service,
context manifest, memory, background review history, review tick history,
review inbox, live run trace history, Opportunity Backlog, SOP Evolution
Ledger, and confirmation visibility. These commands do not invoke the model
and do not request or execute self-evolution follow-up actions.

CLI `capabilities` and Feishu `/capabilities` expose the same repo-owned local
capability catalog. This is a read-only operator surface and a stable answer to
"what can the runtime currently do"; it is not inferred from the model and does
not widen runtime authority.

CLI `capabilities acceptance` and Feishu `/capabilities acceptance` expose the
same repo-owned acceptance baseline for deciding whether the current runtime is
ready for the next feature slice. This is a read-only operator surface; it
lists gates, evidence refs, verification commands, and next candidate slices
without running tests, invoking the model, managing services, or mutating
state.

The active exploration and self-evolution gap slices are local planning and
read-model surfaces: they may define publish plans, bounded source evidence,
browser/MCP adapter boundaries, image-generation requests, and gap-intake
reports. They must not publish externally, invoke browser automation, generate
images, or mutate repository/vault artifacts from read-only operator surfaces.
`publish-preflight` may use read-only Xiaohongshu MCP readiness probes
(`initialize`, `notifications/initialized`, `tools/list`, and login status)
when an operator supplies a server URL, but it must not call `publish_content`
or claim publication.

Normal Feishu private-chat tasks may include a bounded local history window
from the same private chat. This uses only truncated channel state already
recorded locally and is not remote history fetch or long-term memory.

Normal Feishu private-chat tasks from the same sender may be serialized through
a bounded in-memory follow-up queue while one run is active for that `open_id`.
The queue writes local trace artifacts for observability, but it is not durable
restart recovery, cross-process coordination, steering, cancel/resume, or a
self-evolution execution lane.

Feishu groups may map to local runtime sessions. Unknown groups are ignored
unless the sender is an authorized operator; authorized bootstrap creates a
pending/unassigned session. `/session use <profile>` or the local web console
binds the profile. Ordinary bound group messages append inbox entries only;
`/run <task>` or an explicit bot mention requests execution.

### Local Service Runtime

The first version may run a single-user local service process for IM intake.
This is a local runtime mode, not hosted service design. Later local-only
background learning tasks may attach to this mode only if they preserve the
same boundary.

The local service runtime may use macOS `launchd`, write heartbeat state under
the local home/state roots, and be restarted after local development changes.
It must not introduce remote deployment, multi-user queueing, cross-machine
state, or production service governance.

The service may attach a configurable local review tick loop for self-evolution
inbox materialization. It is disabled by default, reports status under the
state root, and must preserve the same no-execution/no-active-vault boundary as
manual `review tick`.

The service may also attach a configurable local daily content loop for active
exploration. It is disabled by default, reports status under the state root,
runs at most one `content daily` job per UTC date, honors autonomy pause
signals, and may call `publish_content` through `xiaohongshu-mcp` only when
non-dry-run image generation succeeds, publish preflight records `preflight_ok`,
and explicit daily publish plus external-write confirmation runtime gates are
enabled.

### Local Learning

SOP and skill promotion are local learning experiments. They use local state and
the local active vault only. They are not a sync, sharing, marketplace, or
compatibility layer.

## Reference Projects

GenericAgent, Hermes, OpenClaw, pi, Codex, and Claude Code are references only.
They can inspire local agent decisions, but they are not standards.

## Success Criteria

The MVP is healthy when:

- `pnpm run check` passes
- local doctor checks the complete first-version baseline by default
- `pnpm run runtime -- capabilities` returns the local capability catalog
  without reading secrets, invoking the model, or mutating state
- `pnpm run runtime -- capabilities acceptance` returns the next-version
  acceptance gates and verification commands without running tests, executing
  tools, reading secrets, invoking the model, managing services, or mutating
  state
- `pnpm run runtime -- review rehearse-sop-loop` verifies sandbox SOP
  promotion, sandbox skill recall/reuse, and registry usage without external
  model calls, working repository writes, real active-vault writes, service
  management, or Feishu execution
- `pnpm run runtime -- context pressure` returns bounded operator guidance for
  oversized context manifests, and `governance decide-opportunity` can decision
  that guidance without reading raw context Markdown, compacting transcripts,
  rewriting context assembly, or mutating context artifacts
- `pnpm run runtime -- review replay-audit --trace <trace-ref>` writes a
  bounded harness replay report from existing live trace metadata only, and
  `review replays` can inspect it without rerunning the agent
- live context bundles include bounded local capability summaries without
  reading secrets, invoking the model recursively, executing tools, managing
  services, or mutating state
- IM can be checked and served through project-level commands
- local web console can list runtime sessions, bind pending profiles, inspect
  session inbox entries, and record explicit local task runs without becoming a
  hosted or multi-user GUI
- Feishu private chat can answer read-only local `/capabilities` without
  invoking the model, reading secrets, executing tools, or mutating state
- Feishu private chat can answer read-only local `/capabilities acceptance`
  without running tests, invoking the model, reading secrets, executing tools,
  managing services, or mutating state
- Feishu private chat can answer read-only local `/status`,
  `/health`, `/governance`, `/memory candidates`, `/memory confirmations`,
  `/memory accepted`, `/review reports`, `/review traces`, `/review replays`,
  `/review ticks`, and `/review inbox` operator commands without invoking the
  model
- Feishu private chat can answer read-only local `/review coverage <sop>`
  operator commands without rendering raw skill bodies or invoking the model
- Feishu private chat can answer read-only local `/skills` and
  `/skill <name-or-ref>` operator commands without rendering raw skill bodies,
  mutating registries, or invoking the model
- Feishu private chat can answer read-only local `/skill events` and
  `/skill event <ref-or-id>` operator commands without rendering raw skill
  bodies, mutating registries, or invoking the model
- Feishu private chat can answer read-only local `/memory search <query>` and
  `/memory session <session-id>` operator commands without rebuilding the
  MemoryStore index, reading raw episode artifacts, or invoking the model
- Feishu private chat can answer read-only local `/recap` and
  `/recap <session-id>` operator commands without reading raw context Markdown,
  raw model/tool/final-response artifacts, rebuilding the MemoryStore index, or
  invoking the model
- Feishu private chat can answer read-only local `/memory archives` and
  `/memory archive <date-or-ref>` operator commands without generating archive
  files, rebuilding the MemoryStore index, reading raw episode artifacts, or
  invoking the model
- Feishu private chat can answer read-only local `/memory archive health` and
  `/memory archive health <date-or-ref>` operator commands that diagnose
  missing, stale, invalid, and orphan daily archive summaries without
  generating archives, rebuilding the MemoryStore index, reading raw episode
  artifacts, or invoking the model
- Feishu private-chat tasks can include bounded same-chat local history without
  mixing other users/chats or dumping raw event payloads
- Feishu private-chat tasks from the same sender can queue bounded follow-ups
  while one run is active, then drain them locally without remote queues,
  restart replay, or applying the queue to operator commands
- Feishu groups can be mapped to runtime sessions, with unknown groups requiring
  authorized bootstrap and bound group messages remaining inbox-only unless
  explicitly triggered
- local service status reports a running IM process and heartbeat when enabled
- local `service health` returns bounded resident IM health and resident
  deployment status without inspecting launchd, reading logs, restarting
  services, invoking the model, reading source bodies, running shell commands,
  or mutating state
- core tools cover read, write, run, search, and fetch
- harness records evidence for local writes and command execution
- repo writes record bounded fixed workspace status before and after the write
  without reading file bodies, mutating git state, blocking valid writes, or
  rolling back
- live harness validates delegated result JSON contracts before treating
  `delegate_agent` output as a bounded observation
- live harness executes state-only evidence and working-state model actions
  without granting repo, active-vault, command, or external-write authority
- live harness records memory proposals and audit requests as state-only
  governance candidates without promoting memory or mutating SOP/skill state
- live harness records `not_done` `propose_sop` actions as state-only SOP draft
  candidates without auditing, promoting, or writing the active vault
- memory proposal candidates can be listed and inspected through CLI and
  Feishu read-only operator commands without promotion or MemoryStore rebuild
- Feishu memory candidate detail shows the explicit CLI confirmation-request
  command for eligible candidates without running it from IM
- memory proposal candidates can be accepted through explicit CLI confirmation,
  producing local accepted semantic memory without repo, active-vault, model, or
  MemoryStore-index writes
- memory candidate confirmations can be listed and inspected through CLI and
  Feishu read-only operator commands without request or execution
- Feishu memory confirmation detail shows the explicit CLI execution command
  for pending confirmations without running it from IM
- accepted semantic memory can be listed and inspected through CLI and Feishu
  read-only operator commands without mutation
- accepted semantic memory appears in later bounded context bundles
- pending governance queue items appear in later bounded context bundles as
  read-only summaries without raw artifacts or mutation authority
- executed governance outcomes appear in later bounded context bundles as
  read-only result summaries without raw artifacts or replay authority
- live harness records autonomy pause requests as state-only stop signals that
  appear in later context snapshots without stopping the resident service
- latest working checkpoints appear in later bounded context bundles without
  reading raw evidence artifacts or proving completion
- current and recent working checkpoints can be inspected through CLI,
  governance status, and Feishu as read-only progress snapshots without
  reading raw evidence artifacts, resuming work, or executing next actions
- attention-worthy working checkpoints appear as read-only Opportunity Backlog
  items in context, governance status, and Feishu without reading raw evidence
  artifacts, resuming work, or executing next actions
- live runs write completion verification reports, and later context includes
  bounded report summaries without reading raw response/tool artifacts or
  proving the current task is done
- failed/skipped completion verification reports appear as read-only
  Opportunity Backlog items, and unscoped review tick can focus them without
  reading raw response/tool artifacts or resuming the task
- blocked or failed StageRunner pipeline checkpoints can be resumed explicitly
  from CLI without overwriting failed attempt artifacts or running from Feishu,
  review tick, or the resident service
- content dry-runs can create Xiaohongshu-ready local publish-plan artifacts
  without live source fetches, model calls, image generation, browser
  automation, MCP calls, external publishing, repository writes, or
  active-vault writes
- `content image-evidence` and `content publish-evidence` can record typed
  image-generation and external publish evidence, require local image existence
  and explicit operator external-write confirmation before `published`, and
  still do not invoke image models, browser automation, MCP tools, repository
  writes, or active-vault writes by themselves
- content publish preflight can record typed readiness evidence and may perform
  read-only Xiaohongshu MCP `initialize`, `notifications/initialized`,
  `tools/list`, and login-status probes when configured; it still cannot call
  `publish_content`, publish externally, drive a browser, write the repository,
  or write the active vault
- `content daily` and the resident daily content loop can execute
  `xiaohongshu-mcp` publication only after generated image evidence,
  `preflight_ok`, explicit external-write confirmation, and disabled dry-run;
  default runtime config keeps resident publishing off
- blocked or failed `pipeline_run` backlog items expose bounded inspect/resume
  commands in context, governance status, and Feishu without reading raw
  pipeline artifacts or executing the resume command
- recent completion verification history can be inspected through CLI, Feishu,
  and bounded context without reading raw final responses, tool results, or
  completion Markdown
- later context bundles include bounded recent live run trace summaries from
  completion reports, model action envelope metadata, and episode event
  metadata without rendering raw model responses, action payloads, tool result
  bodies, final response Markdown, context Markdown, or harness artifact bodies
- later context bundles can include repo-write workspace guard summaries parsed
  from bounded tool-result event metadata without opening raw ToolResult JSON
- recent live run trace history can be inspected through CLI and Feishu without
  reading raw model responses, action payloads, tool result bodies, final
  response Markdown, context Markdown, or harness artifact bodies
- recent live run trace history can show repo-write workspace guard summaries
  in CLI/Feishu operator views without reading raw ToolResult JSON
- a selected recent live run trace can be replay-audited from bounded metadata
  into `governance/replays/` without invoking the model, executing tools,
  writing the repo, writing the active vault, or reading raw run artifacts
- harness replay audit history appears in bounded context, aggregate governance
  status, and Feishu operator views as evidence only
- repo writes on preexisting dirty workspaces appear as read-only
  `repo_write_guard` Opportunity Backlog items in context/governance/Feishu and
  can be decisioned without reading raw ToolResult JSON or mutating git state
- live run trace context and Feishu operator views expose delegated result
  pass/fail counts derived from completion verification and event metadata
  without reading delegated result artifact bodies
- model request and action-envelope parse failures write a bounded diagnostic
  artifact, enter completion report observations, and appear in live run trace
  context and Feishu operator views as failure kind/stage/refs without
  rendering raw model response bodies
- completion reports with model diagnostics surface bounded kind/stage/refs in
  Opportunity Backlog and can become review tick `runtime_gap` proposals without
  retrying requests, switching models, or rendering raw model response bodies
- recent background review can turn the latest working checkpoint into a gated
  runtime proposal without reading raw evidence artifacts or executing it
- unscoped review tick can select a top `working_checkpoint` backlog item as
  recent bounded focus and materialize a gated runtime follow-up without
  reading raw checkpoint evidence or executing the checkpoint next action
- unscoped review tick focus carries bounded action-chain labels/effects into
  tick history, focus-created runtime-gap proposals, review inbox items, service
  health, governance, and Feishu without exposing command strings as execution
  authority
- recent background review history can be inspected through CLI, Feishu, and
  bounded context without rerunning background review or reading raw review
  Markdown
- resident review tick loop honors active autonomy pause signals by reporting
  paused and skipping automatic self-evolution ticks
- service status and Feishu `/status` surface active autonomy pause signals as
  read-only operator status without clearing or resuming autonomy
- Feishu `/governance` renders the latest resident review tick ref and bounded
  focus summary without rerunning review tick or executing follow-ups
- governance status aggregates memory, review, service, and autonomy pause
  read models plus Opportunity Backlog attention through CLI and Feishu without
  requesting or executing mutations
- Feishu can inspect one review inbox item by ref or id as a read-only operator
  view without reading raw review artifacts or executing mutations
- Feishu review inbox detail shows the explicit CLI confirmation-request
  command for open mutation items without running it from IM
- CLI can append review inbox operator decisions to
  `autonomy/review-inbox-decisions.jsonl` without mutating inbox artifacts
- Opportunity Backlog, context, and Feishu merge the latest review inbox
  decision so completed/retired suggestions leave active attention and deferred
  suggestions stay visible but gated
- eligible Opportunity Backlog items expose a bounded `governance
  decide-opportunity` command in context, governance status, and Feishu as
  operator guidance without appending decisions from read-only surfaces
- eligible Opportunity Backlog items expose bounded action-chain summaries in
  context, governance status, and Feishu without granting execution authority
- Opportunity Backlog, context, governance status, and Feishu expose latest
  append-only Opportunity Backlog decisions as structured status/reason/ref
  metadata instead of only prose summaries
- Active review inbox, Opportunity Backlog, context, governance status, and
  Feishu collapse duplicate inbox suggestions without deleting raw
  `autonomy/inbox/*.json` history
- live runs write a context manifest with section sizes and selected refs
- context manifests can be listed and inspected without reading raw context
  Markdown
- context manifest sidecar health can be listed from manifest JSON/file refs,
  surfaced in Opportunity Backlog, rendered in context/governance/Feishu, and
  decisioned without reading raw context Markdown or repairing state
- orphan context Markdown issues can expose an explicit `context repair`
  local-write command that rebuilds one missing manifest sidecar from the
  selected Markdown, while all read-only surfaces show it as guidance only
- recent context manifest usage can be summarized through CLI and Feishu
  with optional model-aware budget status, without reading raw context
  Markdown, compacting transcripts, invoking the model, or mutating state
- context health issues can be narrowed by issue/ref/session through CLI and
  Feishu, and can show bounded operator guidance for defer, completed-after-
  external-repair, or historical-retirement decisions without repairing state
- unscoped review tick can select a top `context_health` backlog item as a
  bounded query focus without reading raw context Markdown or repairing state
- context-health review tick focus can replace a generic memory-gap proposal
  with a bounded `runtime_gap` proposal and gated `narrow_review` inbox item
- Feishu can list and inspect context manifests and inspect one context health
  issue as a read-only operator view
  without reading raw context Markdown or invoking the model
- episode events can be rebuilt into a local searchable MemoryStore
- episode events can be archived into deterministic daily summary artifacts
  without rebuilding the SQLite index or reading raw episode artifacts
- archive freshness diagnostics can surface missing, stale, invalid, and orphan
  archive summaries into context and Opportunity Backlog without mutating
  archive state
- later context bundles include bounded daily archive summaries without treating
  them as durable semantic memory
- episode memory can be searched and replayed from Feishu as bounded read-only
  JSONL summaries without SQLite rebuild or raw artifact reads
- live context can include bounded episode recall without dumping raw session
  artifacts
- live context can include bounded repo-local task references without reading
  state/home files, absolute paths, URLs, git diffs, or shell output
- background review can propose self-evolution actions without changing SOPs or skills
- background review can use SOP chain state to classify proposal follow-up
- review tick can materialize stable state-only inbox items without executing
  follow-up actions
- service status reports the configured resident review tick loop status
  without requiring it to be enabled by default
- service health diagnostics appear in context, governance status, and Feishu
  with resident deployment status against repo HEAD, without inspecting
  launchd, reading logs, invoking the model, restarting services, reading
  source bodies, running shell commands, or mutating state
- `service health --target im` without `--state-root` reads the same
  `<LOCAL_RUNTIME_HOME>/state/runtime` service-scoped state root used by service
  lifecycle commands; explicit `--state-root` remains an override
- effective runtime config can be inspected through CLI and Feishu as a
  non-secret summary of selectors, model metadata, optional context budget,
  runtime flags, source refs, defaulted fields, vault roots, and restart
  guidance without reading `auth.jsonl` or mutating config/service state
- model and Feishu auth can be resolved from direct local
  `<LOCAL_RUNTIME_HOME>/config/auth.jsonl` records without process env secrets;
  direct auth fields win over explicitly named env-backed fields when both are
  present
- `doctor` can report non-secret active model and Feishu auth source
  diagnostics without rendering API keys, app ids, app secrets, or env values
- live context can include the same bounded non-secret runtime config summary
  so later model turns can see active selectors and review tick settings
  plus optional context budget metadata without reading `auth.jsonl`, mutating
  config, restarting services, or running review tick
- abnormal service health appears as a read-only `service_health` Opportunity
  Backlog item in context, governance status, and Feishu; operators can record
  append-only backlog decisions for it without granting service control
- resident runtime commit mismatches against repo HEAD appear as
  `service_health` attention with explicit restart guidance for the operator
- service-health inspect and restart guidance in context, governance, and
  Feishu uses the default service commands without forcing a
  `--state-root <state-root>` placeholder
- Opportunity Backlog items expose a bounded `action_chain` read model derived
  from existing inspect/action/decision guidance so context, governance status,
  and Feishu can show the operator sequence without executing commands
- append-only Opportunity Backlog decisions may preserve a bounded
  action-chain snapshot as label/effect/reason metadata without command strings
  so later read models can explain the operator sequence considered at decision
  time
- recent review tick history can be inspected through CLI, Feishu, and bounded
  context without rerunning review tick or reading raw tick/review Markdown
- inbox items can be listed, inspected, and turned into pending confirmation
  requests without executing follow-up actions
- review follow-up confirmations can be listed and inspected through CLI and
  Feishu read-only operator commands without request or execution
- Feishu review confirmation detail shows the explicit CLI execution command
  for pending confirmations without running it from IM
- executed follow-up confirmations update linked inbox items to `executed`,
  while the default inbox list remains an active operator view
- selected review proposals can produce dry-run follow-up plans without appending evidence
- repeated follow-up planning for the same review proposal returns stable action ids
- selected read-only follow-up actions can execute chain inspection without appending evidence
- selected mutation follow-up actions can record pending confirmation without executing mutation
- confirmed collect-evidence follow-up requests can write state evidence
  collection reports without claiming missing external evidence
- confirmed narrow-review follow-up requests can execute a state-only scoped
  background review once
- confirmed draft follow-up requests can execute state-only SOP draft creation once
- confirmed audit follow-up requests can execute state-only SOP audit once
- confirmed promotion follow-up requests can execute the active-vault SOP
  promotion path once when runtime promotion is enabled
- confirmed skill-revision follow-up requests can append active-vault
  validation events once without rewriting skill instructions
- live state-only SOP draft proposals appear in the SOP Evolution Ledger and
  ranked Opportunity Backlog
- draft and promote-ready SOP evolution chains expose structured next commands
  without executing them from read-only surfaces
- newly drafted SOP chains that cite older audits or skills remain `drafted`
  until their own explicit audit runs; cited evidence does not become lifecycle
  audit or skill refs
- SOP evolution next-command confirmations can be requested and later executed
  only after the current ledger command still matches
- SOP evolution confirmations are visibly linked to their source and SOP ref in
  review confirmation read models and bounded context
- reused-skill coverage for one SOP can be inspected through CLI and Feishu
  before executing a `revise_skill` confirmation
- `revise_skill` backlog/context/status/Feishu read models expose bounded
  `covered`/`drifted`/`missing_skill`/`no_reuse_evidence` coverage summaries
  without raw skill bodies or execution authority
- selected-skill outcome/drift review tick focus can produce a gated
  `revise_skill` inbox item whose confirmed execution only appends validation
  events and does not rewrite skill instructions
- active-vault skill registry events can be listed and inspected through CLI
  and Feishu without reading raw skill bodies or mutating the active vault
- `skills --action sync` appends bounded `synced` registry events only for
  created or changed entries, and repeat sync without changes appends no
  duplicate events
- local skill catalog metadata can be listed and inspected through CLI and
  Feishu without reading raw skill bodies or mutating the active vault
- active-vault skill registry health can be inspected through CLI and Feishu,
  surfaced in Opportunity Backlog/context/governance/Feishu, and decisioned
  without reading raw skill bodies or automatically repairing registry state
- historical orphan skill registry events can expose an explicit
  `skills retire-event` local-write command that appends a bounded `retired`
  event, while all read-only surfaces show it as guidance only
- top `archive_health` and `skill_registry_health` backlog items can become
  review tick `runtime_gap` proposals without refreshing archives, syncing
  registry metadata, writing the active vault, or executing recovery
- oversized context manifests can be listed, surfaced in Opportunity Backlog,
  rendered in context/governance/Feishu, and decisioned without reading raw
  context Markdown or rewriting context assembly
- `draft_sop` backlog/context/status/Feishu read models expose bounded
  `ready`/`weak_evidence`/`missing_review`/`missing_proposal` readiness
  summaries without raw review Markdown or execution authority
- `draft_sop` confirmation requests fail on weak or missing readiness, store a
  bounded readiness snapshot when ready, and revalidate readiness before
  execution writes a state-only SOP draft
- stale SOP evolution confirmations are surfaced before execution as read-only
  gate state without mutating confirmation artifacts
- review confirmations can be filtered by derived SOP evolution gate without
  creating, refreshing, or executing confirmations
- stale SOP confirmations include an explicit fresh-request command in read
  models without automatically creating the replacement confirmation
- SOP confirmation gate read models expose stable reason codes and list-level
  reason summaries without changing execution authorization
- stale SOP confirmation recovery includes reason-coded playbooks with read-only
  ledger inspection commands and next steps, without requesting or executing
  confirmations
- stale SOP confirmation recovery decisions can be appended explicitly through
  CLI and merged into read models without mutating confirmation artifacts
- Opportunity Backlog uses recovery decisions to keep unresolved stale gates
  visible and suppress historical or already-refreshed stale confirmations
- eligible review proposals can become state-only SOP drafts through an explicit command
- state-only SOP drafts can be audited explicitly without repository or active-vault writes
- audited state-only SOP drafts can be promoted explicitly into the local active vault with duplicate-skill protection
- SOP self-evolution chains can be inspected from append-only episode evidence
- context stays bounded to the current run
- documentation no longer presents non-local future work as current scope
