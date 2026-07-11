# Evi

## Documentation Languages

This English README is the default entrypoint for models, tools, and external
references. The Simplified Chinese companion is
[`docs/README.cn.md`](docs/README.cn.md), which is the fast operator-facing
entrypoint for local reading. Keep commands, code
identifiers, JSON fields, protocol literals, API names, and quoted evidence in
their original language unless translation is explicitly requested.

This repository contains a local-first, single-machine runtime for a
self-growing agent.

The first version is intentionally narrow. It exists to prove that one local
runtime process can read context, write bounded state or repo changes, run
local commands, search the repo, call a model, preserve evidence, and expose a
basic IM entrypoint. It can run a single-user local service process for IM
intake, but it does not design for open-source distribution, multi-user service
hosting, multi-machine skill sharing, marketplace behavior, or compatibility
across future runtimes.

## First Version Goal

The first version should make this local loop reliable:

```text
task or IM message
  -> bounded context
  -> model action envelope
  -> harness validation
  -> local tools
  -> evidence
  -> verification
  -> response
```

Local learning through SOPs and skills remains available, but it is not the
main success criterion for every run. The main criterion is whether the local
runtime can perform and verify work through concrete core capabilities.

## Capability Layers

### Core Execution

Core execution is the ability to act on this machine:

- `file.read`: read repo or state files.
- `file.write_state`: write runtime artifacts under the selected state root.
- `file.write_repo`: write repo files under harness path policy.
- `repo.search`: search repository text, preferably through `rg`.
- `http.fetch`: fetch HTTP(S) content.
- `command.run`: run bounded local commands with timeout, output limits, cwd,
  side-effect labels, and an environment allowlist.
- `code.execute_node`: execute bounded JavaScript snippets when that is simpler
  than a command.

The current code implements this first-version core tool surface and covers it
with local capability tests.

### Runtime Control

Runtime control is the minimum control plane that keeps core execution honest:

- context assembly
- turn snapshots
- tool contracts
- harness path boundaries
- side-effect labels
- timeout and output limits
- evidence events
- completion verification

`context` and `harness` are first-version infrastructure, not future product
features. They must stay small and local.

### Basic Entrypoints

The first version has these basic entrypoints:

- CLI for local foreground operation.
- Provider-neutral channel intake through the local daemon.
- Local web console for localhost session/task inspection and operator actions.
- Unified local runtime daemon for resident channel adapters.

IM is a local runtime channel capability, not a separate optional product. The
first-version command surface is `doctor` for baseline checks, `daemon serve`
for the unified foreground runtime daemon, and `service --target runtime` for
the local resident daemon.
Feishu, Telegram, and Discord channel sources can map to local runtime sessions
and start as pending/unassigned until an authorized operator binds a profile.

### Local Learning

Local learning means SOP drafting, autonomous audit, local skill promotion,
recall, and duplicate-skill avoidance on this one machine.

The live harness can preserve `not_done` `propose_sop` actions as state-only SOP
drafts. Audit, promotion, and skill creation remain explicit later gates.

Episode memory also has a deterministic daily archive layer. `memory archive`
writes bounded summaries, while `memory archives`, `memory archive-health`, and
the matching Feishu operator commands are read-only views over archive metadata
and freshness. Archive health reports the current UTC date as an open day, then
enforces missing or stale daily summaries after UTC rollover.

Dream snapshots are explicit, versioned long-horizon direction projections over
accepted memory and verified iteration outcomes. They preserve axes, horizons,
non-goals, and source lineage across sessions, but never execute work or prove
completion; stale lineage remains visible until an operator refreshes it.

This layer is useful, but first-version local runtime does not solve skill sync,
shared vaults, public skill repositories, multi-user provenance, or cross-node
conflict resolution.

## Reference Projects

GenericAgent, Hermes, OpenClaw, pi, Codex, and Claude Code are architecture
references. They are not standards, source-of-truth specifications, or
compatibility targets.

Patterns from those projects can be absorbed only when they improve the local
first-version layers above. The runtime should not copy a reference project just
because it exists.

## Repository Map

```text
repo/
├── .trellis/
│   ├── config.json           # TrellisVCS 3.2.4 minimal metadata
│   ├── ops.json              # TrellisVCS branch/operation log
│   ├── agents/               # thin Trellis agent context, no workspace index
│   ├── spec/                 # current first-version scope
│   ├── tasks/                # bounded local implementation tasks
│   └── decisions.md          # decision log from scope grilling
├── apps/cli/                 # TypeScript CLI entrypoint
├── packages/core/            # schemas, store, context, audit, skills
├── packages/runtime/         # config, model, runner, tools, channels
├── config/                   # tracked defaults plus ignored local overlays
├── core/                     # stable identity and memory policy text
├── context/                  # context assembly notes
├── harness/                  # runtime enforcement notes
├── docs/
│   ├── RUNTIME_CONTRACT.md   # first-version local runtime contract
│   ├── LOCAL_RUNTIME.md      # local startup and command boundaries
│   ├── LOCAL_LEARNING.md     # local SOP/skill experiment layer
│   └── ACTIVE_EXPLORATION.md # opt-in active-exploration examples
├── vault/                    # repo seed/dev skill material
├── skills/                   # repo seed/dev skill material
├── README.md                 # English default entrypoint for models/tools
└── docs/README.cn.md         # Simplified Chinese quick entrypoint
```

## Local Commands

Install dependencies:

```bash
pnpm install
```

Validate the current code:

```bash
pnpm run check
```

Run the complete local readiness check when model and IM credentials are
configured:

```bash
pnpm run runtime -- doctor
```

Run a structural readiness check without model or IM credentials:

```bash
pnpm run runtime -- doctor --no-auth --no-im
```

Run one live task after model auth is configured in either ignored repo-local
`config/auth.local.jsonl` or `<LOCAL_RUNTIME_HOME>/config/auth.jsonl`:

```bash
pnpm run runtime -- live --query-todo --task "Verify the local agent runtime." --state-root .runtime/state
```

Repo-local runtime artifacts are grouped under `.runtime/`: `.runtime/state`
for default interactive state, `.runtime/stage` for pipeline experiments, and
`.runtime/smoke/<name>` for one-off smoke runs. Top-level `.runtime-*` or
`.runtime_*` directories are unsupported and should be deleted or moved into
the supported `.runtime/` layout.

Inspect current repo-local runtime workspace hygiene:

```bash
pnpm run runtime -- workspace runtime --state-root .runtime/state
```

Inspect which memory and learning layers currently feed context or remain
on-demand diagnostics:

```bash
pnpm run runtime -- memory layers --state-root .runtime/state
pnpm run runtime -- memory dream --state-root .runtime/state
pnpm run runtime -- memory dreams --state-root .runtime/state
pnpm run runtime -- governance scorecard --state-root .runtime/state
pnpm run runtime -- governance project-design --state-root .runtime/state
pnpm run runtime -- governance iterations --state-root .runtime/state
```

Live task text may include bounded repo references such as
`@file:docs/RUNTIME_CONTRACT.md:120-160` or `@folder:docs`. These become a
`Task References` context section and stay repo-local/read-only.

Manage the unified local resident runtime daemon:

```bash
pnpm run runtime -- service status --target runtime
pnpm run runtime -- service start --target runtime --host 127.0.0.1 --port 8765
pnpm run runtime -- service health --target runtime
pnpm run runtime -- service logs --target runtime --limit 40
```

When model and channel credentials are configured, the runtime target can start
Feishu intake alongside the web console:

```bash
pnpm run runtime -- service status --target runtime
pnpm run runtime -- service health --target runtime
pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main
pnpm run runtime -- service logs --target runtime --limit 40
```

Start the localhost web console:

```bash
pnpm run runtime -- web --host 127.0.0.1 --port 8765 --state-root .runtime/state
```

The web console lists runtime sessions, channel inbox entries, and task runs. It
can bind a pending channel-backed session to a profile and submit an explicit
local task run. Profile binding uses the same provider-neutral route key shape
for Feishu, Telegram, and Discord channel sources. It is a local operator
surface, not a hosted multi-user GUI.
Under `daemon serve`, the same console runs as the Web channel adapter managed
by the runtime MessageGateway.
IM channel config is selected through a provider-neutral loader:
`kind: "feishu" | "telegram" | "discord"` plus CLI `--provider`. Feishu,
Telegram, and Discord start through the same adapter seam.
Provider startability lives in `packages/runtime/src/im_adapters.ts`; config
loading only resolves the provider-neutral scenario. Use
`config/settings.example.jsonl` as a non-loaded template for Feishu, Telegram,
and Discord channel/scenario rows.
Channel sources normalize into provider-neutral route/source keys before they
touch runtime sessions, so Telegram and Discord adapters can reuse the
same session and inbox state path without leaking provider SDK details into the
runtime core. Inbound channel messages then pass through the shared runtime
channel dispatcher for session binding, inbox append, and `/run` or mention
trigger classification. Explicit task runs first append to the local runtime
task queue, then append `queued`, `running`, and final task-run rows with the
same id for GUI/history visibility. The queue can surface queued or stale
running tasks for recovery inspection. The resident daemon has a bounded queue
worker that consumes stale queued/running entries and records final task-run
status. Feishu/Telegram/Discord-sourced recovery results append queued provider-neutral
outbound rows to `channels/outbox.jsonl`, and the matching adapter drains those
rows back to the originating conversation. Web and direct adapter replies record
local sent rows; adapters still own real delivery and provider SDK details.
Rows that match a provider but not the running adapter channel are marked
skipped instead of being retried forever.

In Feishu private chat, these read-only local operator commands are available
without invoking the model: `/status`, `/health`, `/logs [lines]`, `/help`,
`/governance`, `/evolution`, `/opportunities`, `/context`, `/memory search <query>`,
`/memory session <session-id>`, `/recap`, `/recap <session-id>`, `/review reports`,
`/review report <ref-or-id>`, `/review completions`,
`/review completion <ref-or-id>`, `/review ticks`,
`/review tick <ref-or-id>`, `/review inbox`, `/review inbox all`,
`/review inbox executed`, `/skills`, and `/skill <name-or-ref>`.

Normal Feishu private-chat tasks also include a bounded local history window
from the same private chat, using only truncated inbound/outbound state that
the local runtime has already recorded locally.

In Feishu groups, an unknown group can only be bootstrapped by an authorized
operator. The first accepted group message creates a pending/unassigned runtime
session. Send `/session use <profile>` in that group, or bind the profile from
the web console, to activate the mapping. Ordinary bound group messages append
to that session inbox; `/run <task>` or an explicit `@bot` mention requests a
task run.

Operator progress notifications use a state-first outbox. `notify queue`
writes `operator/notifications/outbox/*.json`; it does not call Feishu directly.
The resident Feishu service drains queued notifications through the same
allowlist, chunking, and event-recording path, then marks each request `sent` or
`failed`.

Inspect the local learning seed packages:

```bash
pnpm run runtime -- skills
pnpm run runtime -- skills --skill-name skill-name
pnpm run runtime -- skills --action validate
```

Search local episode evidence:

```bash
pnpm run runtime -- memory search --query "feishu" --state-root .runtime/state
pnpm run runtime -- memory recap --session session_... --state-root .runtime/state
```

Inspect context assembly manifests:

```bash
pnpm run runtime -- context list --state-root .runtime/state
pnpm run runtime -- context show --context memory/episodes/session_...-context.json --state-root .runtime/state
```

Inspect the SOP and skill evolution ledger:

```bash
pnpm run runtime -- governance evolution --state-root .runtime/state
```

Open draft and promote-ready SOP chains include structured next-command
guidance, but these read models never execute the command.

Request a confirmation for the current SOP chain next command:

```bash
pnpm run runtime -- review request-sop-confirmation --sop sop_... --state-root .runtime/state
```

SOP-chain confirmations show `source=sop_evolution_chain` and the SOP id/ref in
review confirmation read models and bounded context, but execution still
requires the explicit CLI confirmation gate.
Pending SOP-chain confirmations also expose a read-only `sop_evolution_gate`
value. `current` means the pending action still matches the ledger;
`stale` means request a fresh confirmation before executing.
Filter review confirmations by SOP-chain gate when clearing stale operator
queues:

```bash
pnpm run runtime -- review confirmations --gate stale --state-root .runtime/state
```

`--gate current|stale|executed|all` is read-only visibility. It does not mutate
confirmation artifacts, refresh stale requests, or execute follow-up actions.
Stale SOP-chain confirmation summaries/details also include
`sop_evolution_recovery.request_command`, the explicit CLI command for
requesting a fresh confirmation.
Gate read models expose stable `reason_code` values and list responses include
`sop_evolution_gate_summary` so stale queues can be triaged without parsing
free-text reasons.
Stale recovery also includes a reason-coded `playbook` with a read-only
`governance evolution` inspect command and next steps. The playbook is guidance
only; it does not request, refresh, or execute confirmations.
Operators may record how a stale recovery was handled through an explicit
append-only CLI decision:

```bash
pnpm run runtime -- review decide-sop-recovery --confirmation follow_up_confirmation_... --status deferred --reason "..." --state-root .runtime/state
```

The command writes only to `autonomy/sop-recovery-decisions.jsonl`. Later stale
confirmation read models and Feishu views merge the latest decision for
visibility.
The Opportunity Backlog also merges the latest recovery decision. `open` and
`deferred` stale gates remain visible with the decision reason; `deferred` lowers
attention score, while `historical` and `fresh_requested` remove the old stale
gate from the active attention queue.

Open SOP evolution chains also appear in the ranked Opportunity Backlog:

```bash
pnpm run runtime -- governance opportunities --state-root .runtime/state
```

Inspect the self-evolution scorecard for current core/basic/SOP-memory/dream
maturity and advisory expert lenses:

```bash
pnpm run runtime -- governance scorecard --state-root .runtime/state
pnpm run runtime -- governance project-design --state-root .runtime/state
pnpm run runtime -- governance experts --state-root .runtime/state
pnpm run runtime -- governance experts --gate core_boundary_review --state-root .runtime/state
pnpm run runtime -- governance record-iteration --summary "Core runtime iteration" --layer core_runtime --owner-surface runtime_contract --proposed-slice self_evolution_iteration_contract --state-root .runtime/state
pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_... --outcome-status verified --summary "Verified core runtime iteration" --state-root .runtime/state
```

`governance project-design` is the read-only core GA project design contract:
goal intake, capability layering, contract design, execution planning,
verification review, and learning persistence. It is a design source of truth,
not a scheduler or external-tool execution surface.
It also derives read-only `artifacts` from verified self-evolution iteration
outcomes that include outcome evidence refs and verification commands, so prior
GA project-design lessons can be reused without writing memory, drafting SOPs,
promoting skills, or proving future completion. Historical completed-source
non-goals are collapsed during successor planning, so the next seed stays
focused on the current source slice. Historical iteration evidence refs are
also collapsed during successor planning, so plan refs stay bounded to the
current source artifact and direct evidence. `artifact_count` is the total
reusable artifact count; `listed_artifact_count` is the current limited response
size.
The scorecard also emits read-only `next_slices` ordered by stage, score, and
layer, so the next bounded iteration is explicit without writing backlog state
or executing the recommendation.
The plan includes a read-only `iteration_focus` so the next model turn sees the
core/basic direction, next steps, and anti-drift checks instead of inferring
purpose from the opaque slice id alone.
Its `implementation_contract` states the allowed reusable contract/read-model
change, deferred scopes, and delivery standard before implementation. It is
pre-execution boundary guidance, not an execution plan or completion proof.
For `general_agent_delegation`, the shared contract for hard limits,
payload/output keys, task/context authoring rules, failure kind values,
lifecycle steps, and completion-gate check ids is sourced from
`packages/core/src/action_contracts.ts`. `packages/core/src/delegate_agent_contract.ts`
hosts the pure task/context and delegated-output parser, and
`packages/core/src/delegate_agent_completion_gate.ts` hosts the pure
delegated-completion evidence checks. Schemas, the runner, replay checks,
capability summaries, context read models, and project-design read models consume
the relevant fields from that contract.
The lifecycle names the harness-owned flow from `validate_task_context` through
`verify_main_harness_completion`; it is planning metadata, not delegated
scheduling or completion authority.
New delegated dispatch events persist exact `result_id` and `result_ref`
identities. Replay derives the done-only `delegated_self_report_refs` gate from
those event-owned identities rather than trusting completion-report refs:
exact claims fail, substring lookalikes do not match, duplicate or missing ids
or refs remain attention, and historical events stay readable without artifact-body
inspection.
Each `result_ref` must also name the persisted JSON artifact attached to that
same delegated event and its `session_id`/`result_id` identity. A completion
report or event metadata that points at a missing or unrelated artifact remains
attention; replay checks only identity, artifact membership, and file presence,
never delegated artifact contents.
New dispatches also persist shared parsed input validity, normalized task/context
character counts, and a SHA-256 input digest. Trace derives the same bounded
expectation from the declaring envelope; replay warns on missing legacy metadata
or any action, validity, length, or digest mismatch. It never renders raw
delegated task/context text, and incomplete input lineage cannot upgrade a
delegated completion gate to clean.
For `done`, replay also derives `claimed_refs_bound_to_evidence` from exact
delegated identities plus bounded result/artifact lineage and its unique
tool-result event-owned identity, success state, artifact, and round binding.
The event-owned tool artifact must also exist at the stable
`memory/episodes/<session_id>-<tool_result_id>.json` identity; jointly swapping
report metadata and the event artifact list to an unrelated file remains
attention.
The tool-result event round must come from a successfully parsed, same-session
`model-action-rN.json` envelope at its stable identity; inserting a missing or
foreign round marker and changing report metadata to match cannot replay clean.
Modern tool-result events also persist the declaring action id, envelope ref,
round, and tool-action sequence. Replay requires one unique matching `use_tool`
action with the same tool before that result can count as completion or recovery
evidence; missing legacy lineage remains attention without a state migration.
Modern final-response events likewise persist the stable response ref, declaring
`respond` action id, final envelope ref, round, and respond-action sequence.
For `done`, replay requires exactly one such event after the final envelope, one
matching `respond` action, the stable session-owned response file, and exactly
one passing `final_response` completion check with the same ref. Missing legacy
metadata remains attention; missing files or mismatched modern lineage cannot
replay a verified completion clean. Response bodies are never opened.
Unbound claims remain failures
even if the completion report says pass; valid report downgrades and missing
legacy lineage remain attention, and no artifact body or historical migration
is involved.
Replay also independently derives `delegated_independent_evidence` for `done`.
Without delegation it is skipped; a passed delegation requires a claimed,
event-bound ordinary evidence ref after the latest dispatch, while a failed
delegation additionally requires later claimed write/run recovery plus later
ordinary verification. Forged report passes cannot hide a failure, report
downgrades remain attention, relevant legacy metadata stays unknown, and
non-`done` completion must omit this check.
Replay takes claimed verification refs from the persisted final model-action
envelope, then compares the completion report against that source. It derives
expected independent and recovery markers from those claims plus uniquely
bound tool-result events; report-owned claim refs, gate statuses, and
`counts_as_*` flags are parity metadata only. Forged positive markers fail a
verified trace, conservative marker downgrades remain attention, and relevant
legacy metadata remains unknown.
The final model-action envelope's `completion_claim.status` is also the replay
authority for the completion tuple and every done-only delegated gate. A final
non-`done` status contradicting a verified report is a definitive replay
failure; a conservative report downgrade remains attention, and a missing
final status stays unknown instead of falling back to a clean report claim.
Trace exposes reported/final status, presence, and match metadata without
reading raw model artifacts.
Replay also enforces exact delegated completion-gate cardinality: modern
reports contain one `delegated_results` check; `done` reports contain exactly
one self-report, claimed-binding, and independent-evidence check, while
non-`done` reports contain none of those done-only checks. Missing, duplicate,
or unexpected checks remain attention, and a missing historical final status
stays unknown rather than being inferred clean.
Completion audit seeds and acceptance trace require the later outcome to show
that the delivered change stayed inside that contract and did not enter
deferred tool, learning, expert-specialization, or multi-agent scheduling scope.
Plan-derived iteration records persist that implementation contract, so later
inspection does not have to infer the boundary from the source artifact alone.
Iteration completion audit also checks contract coverage: it compares the
current plan when it still targets the audited iteration, and otherwise checks
the audited iteration's persisted contract for self-consistency.
Phase gates carry their `forbidden_shortcuts`, so anti-drift constraints stay
visible with the phase contract.
It also includes `capability_stage_plan`, a read-only split of current core
capability stages and basic capability stages plus the next iteration plan.
Each stage carries `exit_criteria` so stage movement has evidence standards and
does not rely on intent or application-tool progress.
The next iteration plan is layer and audit-seed labeled so core-runtime
hardening, basic entrypoint verification, deferred local-learning reuse, and
completion review stay tied together.
Acceptance criteria use the same audit-seed labels, keeping goal scope, current
state, verification scope, and learning persistence review aligned.
The matching `acceptance_trace` maps each criterion to required verification
entrypoints and outcome claim prefixes, so outcome writeback can stay tied to
direct evidence without making the trace itself completion proof.
The basic runtime observability stage may be `attention_guard`; that means it
must keep service-health attention visible, not that the resident service is
healthy.

When an active dream exists, low-maturity scorecard dimensions may appear as
proposal-only self-evolution gaps. General-agent delegation now has a bounded
`delegate_agent` harness action, so the scorecard-derived delegation gap is
suppressed; future low-maturity dimensions still use the normal Opportunity
Backlog and SOP-candidate gates.
Verified iteration outcomes may also appear as SOP-candidate gaps when no
state-only SOP draft cites the iteration yet. They still require review tick,
draft-sop, audit-sop, and promote-sop gates before any active-vault skill write.
The expert contract includes read-only delegation gates for core-boundary,
runtime-health, learning-persistence, and delegation-budget reviews. Gates name
trigger, inputs, output, rejection cases, and main-runtime completion authority;
`governance experts --gate <gate-id>` renders one selected gate as an advisory
plan packet. They do not spawn agents or schedule model calls.
Iteration contracts are the lightweight state record for the first scorecard
next move: declare whether major work is core runtime, basic entrypoint, local
learning, application slice, or boundary work before treating it as progress.
Iteration outcomes close that loop with verification status, cited evidence,
commands run, and next moves before the next core/basic slice is chosen.

`governance status` and Feishu `/governance` also include the active backlog
count and top bounded attention item, so the aggregate local operator view shows
what deserves self-evolution attention without running a mutation path. Eligible
top/backlog items may include the matching `governance decide-opportunity`
command as copyable guidance; read-only views do not append the decision.

Run a proposal-only background review:

```bash
pnpm run runtime -- review background --query "skill promotion" --state-root .runtime/state
```

Inspect recent background review reports without rerunning background review:

```bash
pnpm run runtime -- review reports --state-root .runtime/state
pnpm run runtime -- review reports --review background_review_... --state-root .runtime/state
```

Inspect completion verification reports without reading raw final responses or
tool artifacts:

```bash
pnpm run runtime -- review completions --state-root .runtime/state
pnpm run runtime -- review completions --completion completion_verification_... --state-root .runtime/state
```

Inspect recent review tick history without rerunning review tick:

```bash
pnpm run runtime -- review ticks --state-root .runtime/state
pnpm run runtime -- review ticks --tick review_tick_... --state-root .runtime/state
```

Feishu also supports `/review ticks` and `/review tick <ref-or-id>` as
read-only operator views.

Background review includes SOP chain summaries when reviewed episode evidence
references a state SOP draft.

Run one self-evolution review tick and materialize an operator inbox:

```bash
pnpm run runtime -- review tick --query "skill promotion" --state-root .runtime/state
```

The tick runs background review, plans follow-up actions for each proposal, and
writes stable inbox items under `autonomy/inbox/`. It writes a tick report under
`autonomy/ticks/` and appends evidence, but it does not request confirmation,
execute actions, or write the active vault.

The resident runtime service can also run this tick on a timer when
`runtime.review_tick_enabled=true`. It is disabled by default. When configured,
the service writes tick-loop status to `<state_root>/services/runtime/review_tick.json`
and includes it in `service status`; Feishu `/governance` also shows the latest
tick ref and focus summary as read-only observability. A tick without explicit
`--query` or `--session` records a bounded focus from the ranked Opportunity Backlog; open
SOP evolution chains and open operator opportunities may become the review
query, while already-actionable confirmations or inbox items remain behind
operator gates.

Inspect or gate an inbox item:

```bash
pnpm run runtime -- review inbox --state-root .runtime/state
pnpm run runtime -- review inbox --status all --state-root .runtime/state
pnpm run runtime -- review inbox --item review_inbox_... --state-root .runtime/state
pnpm run runtime -- review decide-inbox --item review_inbox_... --status deferred --reason "..." --state-root .runtime/state
pnpm run runtime -- review request-inbox-confirmation --item review_inbox_... --state-root .runtime/state
```

Inbox confirmation requests reuse the same follow-up confirmation envelope as
manual proposal follow-ups. They update the inbox item status and write a
pending confirmation, but they do not execute the selected action.

`review decide-inbox` appends an operator decision to
`autonomy/review-inbox-decisions.jsonl` without mutating the inbox item.
Supported statuses are `open`, `deferred`, `completed`, and `retired`.
`completed` and `retired` hide the item from active backlog/context attention;
`deferred` keeps it visible with lower priority and blocks confirmation until it
is reopened.

Active review inbox read models also collapse duplicate suggestions with the
same action, command, refs, and write boundary. The canonical item shows the
duplicate refs; `--status all` still exposes every raw inbox artifact for audit
history.

After the referenced confirmation is executed through
`review execute-confirmed-follow-up`, any linked inbox item is updated to
`executed`. The default inbox list shows only active items; use `--status all`
or `--status executed` for audit history.

Plan follow-up actions for one review proposal without executing them:

```bash
pnpm run runtime -- review plan-follow-up --review background_review_... --proposal review_proposal_... --state-root .runtime/state
```

The plan is a dry run. It can suggest later commands such as draft, audit,
promote, chain inspection, or skill revision, but it does not write state,
append episode evidence, or write the active vault. Follow-up action ids are
stable for the same review/proposal pair so a later operator gate can refer to
the same action.

Execute a read-only follow-up action:

```bash
pnpm run runtime -- review execute-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime/state
```

This gate currently executes only `inspect_chain`. It rejects actions that
would write state or the active vault.

Request confirmation for a mutation follow-up action:

```bash
pnpm run runtime -- review request-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime/state
```

This writes a pending confirmation envelope under `autonomy/followups/` and
appends evidence. It does not execute the selected action.

Execute a confirmed mutation follow-up:

```bash
pnpm run runtime -- review execute-confirmed-follow-up --confirmation follow_up_confirmation_... --state-root .runtime/state
```

This currently supports `collect_evidence`, `narrow_review`, `draft_sop`,
`audit_sop`, `promote_sop`, and `revise_skill`. It updates the confirmation
request and writes evidence for the selected action. It uses the configured
active vault only for confirmed `promote_sop` actions and confirmed
`revise_skill` validation events; `revise_skill` does not rewrite `SKILL.md`.

Create a state-only SOP draft from an eligible review proposal:

```bash
pnpm run runtime -- review draft-sop --review background_review_... --proposal review_proposal_... --state-root .runtime/state
```

Audit a state-only SOP draft:

```bash
pnpm run runtime -- review audit-sop --sop sop_... --state-root .runtime/state
```

Promote an audited SOP draft into the local active vault:

```bash
pnpm run runtime -- review promote-sop --sop sop_... --audit audit_... --state-root .runtime/state
```

Inspect the SOP self-evolution chain:

```bash
pnpm run runtime -- review chain --sop sop_... --state-root .runtime/state
```

## Current Boundaries

Current first-version scope:

- local single-machine runtime
- one repo checkout
- local JSONL config
- local state root
- local active vault under `LOCAL_RUNTIME_HOME`
- CLI foreground runs
- local web console for runtime sessions, channel inbox, profile binding, and
  explicit local task runs
- unified runtime daemon with MessageGateway channel adapter lifecycle for Web,
  Feishu, Telegram, and Discord
- provider-neutral daemon intake for Feishu, Telegram, Discord, and Web
- Feishu group to runtime-session binding with pending/unassigned bootstrap
- Feishu read-only local operator commands for status, service health, service
  logs, governance, Opportunity Backlog, SOP Evolution Ledger, memory, context,
  background review history, review tick history, and review inbox
- local review inbox operator decision log consumed by backlog, context, and
  Feishu read models
- Feishu bounded local private-chat history in task context
- Feishu operator notification outbox drained by the resident runtime when
  Feishu is enabled
- single-user local service runtime for channel adapters
- state-only `service health` CLI read model for resident runtime diagnostics,
  including runtime-substrate versus application-slice reason codes
- core tool capability tests
- minimal context and harness control plane
- harness-owned completion verification reports
- failed/skipped completion verification reports in Opportunity Backlog
- service-health attention in Opportunity Backlog
- active-vault skill registry health diagnostics in CLI/Feishu/backlog/context
- context assembly manifest sidecars for live runs
- bounded task references in live context
- local context manifest inspection
- searchable local episode memory
- bounded episode-memory recall injected into live context
- live state-only SOP draft proposals from `not_done` model actions
- proposal-only background review
- chain-aware background review proposals
- background review history read model
- completion verification history read model
- review tick materialization into a state-only self-evolution inbox
- Opportunity Backlog focus for unscoped review ticks
- completion verification focus for unscoped review ticks
- configurable resident service review tick loop, disabled by default
- self-evolution inbox inspection and confirmation requests
- executed confirmation read-model updates for self-evolution inbox items
- duplicate self-evolution inbox collapse in active backlog/context/Feishu read
  models
- dry-run review proposal follow-up planning
- stable review follow-up action identities
- read-only review follow-up execution gate
- mutation follow-up confirmation requests
- confirmed evidence-collection, narrow-review, draft, audit, promotion, and
  skill-revision validation follow-up execution
- explicit state-only SOP draft candidates
- explicit state-only SOP draft audits
- explicit audited SOP promotion into the local active vault
- read-only SOP self-evolution chain inspection
- open SOP Evolution Ledger chains in the ranked Opportunity Backlog
- read-only self-evolution scorecard for core/basic learning maturity,
  current general-agent delegation, and advisory review lenses
- read-only expert orchestration contract for future-only advisory roles,
  scheduling boundaries, and main-thread verification authority
- bounded self-evolution iteration contracts for layer, owner, evidence,
  verification, non-goal, and advisory-role declarations
- bounded self-evolution iteration outcomes for verification status, cited
  evidence, commands run, and next moves
- dream snapshots that absorb accepted semantic memory, recent self-evolution
  iteration contracts, and latest verified outcomes as long-horizon planning
  context
- structured SOP evolution next commands in ledger, backlog, and Feishu views
- SOP evolution next-command confirmation requests with stale-chain revalidation
- optional local SOP/skill learning experiment

Explicitly out of scope:

- open-source package compatibility
- multi-user service design
- multi-machine skill sharing
- public skill marketplace
- cross-node vault conflict handling
- hosted, multi-user, or desktop GUI dashboard
- hosted or multi-user daemon/service operation
- production deployment
- Docker or Kubernetes packaging
- broad external agent team orchestration
- automatic core self-rewrite

## Documentation

Default context should stay small. Read these files in order when changing
project direction:

1. `.trellis/spec/local-single-machine-mvp.md`
2. `.trellis/decisions.md`
3. `docs/RUNTIME_CONTRACT.md`
4. `docs/LOCAL_RUNTIME.md`
5. `docs/LOCAL_LEARNING.md`

Read `.trellis/agents/AGENTS.md` only when changing Trellis integration. Read
`docs/ACTIVE_EXPLORATION.md` only for content, publishing, image-generation, or
active-exploration work.

Long future roadmaps should live in Trellis tasks only when they become local,
bounded implementation work. Stable docs should describe the current
first-version contract, not a catalog of future products.
