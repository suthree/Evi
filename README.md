# Local Runtime

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

The first version has two basic entrypoints:

- CLI for local foreground operation.
- IM for local foreground or single-user local service chat intake.

Feishu is the first IM provider. It is a local runtime basic capability, not a
separate optional product. The first-version command surface is `doctor` for
baseline checks, `im serve` for the local foreground IM process, and `service`
for the local resident IM process.

### Local Learning

Local learning means SOP drafting, autonomous audit, local skill promotion,
recall, and duplicate-skill avoidance on this one machine.

The live harness can preserve `not_done` `propose_sop` actions as state-only SOP
drafts. Audit, promotion, and skill creation remain explicit later gates.

Episode memory also has a deterministic daily archive layer. `memory archive`
writes bounded summaries, while `memory archives`, `memory archive-health`, and
the matching Feishu operator commands are read-only views over archive metadata
and freshness.

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
pnpm run runtime -- live --query-todo --task "Verify the local agent runtime." --state-root .runtime-state
```

Live task text may include bounded repo references such as
`@file:docs/RUNTIME_CONTRACT.md:120-160` or `@folder:docs`. These become a
`Task References` context section and stay repo-local/read-only.

Manage the local resident IM service when model and IM credentials are
configured:

```bash
pnpm run runtime -- service status --target im
pnpm run runtime -- service health --target im
pnpm run runtime -- service restart --target im --scenario im-default --channel feishu-main
pnpm run runtime -- service logs --target im --limit 40
```

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

Inspect the local learning seed packages:

```bash
pnpm run runtime -- skills
pnpm run runtime -- skills --skill-name skill-name
pnpm run runtime -- skills --action validate
```

Search local episode evidence:

```bash
pnpm run runtime -- memory search --query "feishu" --state-root .runtime-state
pnpm run runtime -- memory recap --session session_... --state-root .runtime-state
```

Inspect context assembly manifests:

```bash
pnpm run runtime -- context list --state-root .runtime-state
pnpm run runtime -- context show --context memory/episodes/session_...-context.json --state-root .runtime-state
```

Inspect the SOP and skill evolution ledger:

```bash
pnpm run runtime -- governance evolution --state-root .runtime-state
```

Open draft and promote-ready SOP chains include structured next-command
guidance, but these read models never execute the command.

Request a confirmation for the current SOP chain next command:

```bash
pnpm run runtime -- review request-sop-confirmation --sop sop_... --state-root .runtime-state
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
pnpm run runtime -- review confirmations --gate stale --state-root .runtime-state
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
pnpm run runtime -- review decide-sop-recovery --confirmation follow_up_confirmation_... --status deferred --reason "..." --state-root .runtime-state
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
pnpm run runtime -- governance opportunities --state-root .runtime-state
```

`governance status` and Feishu `/governance` also include the active backlog
count and top bounded attention item, so the aggregate local operator view shows
what deserves self-evolution attention without running a mutation path. Eligible
top/backlog items may include the matching `governance decide-opportunity`
command as copyable guidance; read-only views do not append the decision.

Run a proposal-only background review:

```bash
pnpm run runtime -- review background --query "skill promotion" --state-root .runtime-state
```

Inspect recent background review reports without rerunning background review:

```bash
pnpm run runtime -- review reports --state-root .runtime-state
pnpm run runtime -- review reports --review background_review_... --state-root .runtime-state
```

Inspect completion verification reports without reading raw final responses or
tool artifacts:

```bash
pnpm run runtime -- review completions --state-root .runtime-state
pnpm run runtime -- review completions --completion completion_verification_... --state-root .runtime-state
```

Inspect recent review tick history without rerunning review tick:

```bash
pnpm run runtime -- review ticks --state-root .runtime-state
pnpm run runtime -- review ticks --tick review_tick_... --state-root .runtime-state
```

Feishu also supports `/review ticks` and `/review tick <ref-or-id>` as
read-only operator views.

Background review includes SOP chain summaries when reviewed episode evidence
references a state SOP draft.

Run one self-evolution review tick and materialize an operator inbox:

```bash
pnpm run runtime -- review tick --query "skill promotion" --state-root .runtime-state
```

The tick runs background review, plans follow-up actions for each proposal, and
writes stable inbox items under `autonomy/inbox/`. It writes a tick report under
`autonomy/ticks/` and appends evidence, but it does not request confirmation,
execute actions, or write the active vault.

The resident IM service can also run this tick on a timer when
`runtime.review_tick_enabled=true`. It is disabled by default. When configured,
the service writes tick-loop status to `<state_root>/services/im/review_tick.json`
and includes it in `service status`; Feishu `/governance` also shows the latest
tick ref and focus summary as read-only observability. A tick without explicit
`--query` or `--session` records a bounded focus from the ranked Opportunity Backlog; open
SOP evolution chains and open operator opportunities may become the review
query, while already-actionable confirmations or inbox items remain behind
operator gates.

Inspect or gate an inbox item:

```bash
pnpm run runtime -- review inbox --state-root .runtime-state
pnpm run runtime -- review inbox --status all --state-root .runtime-state
pnpm run runtime -- review inbox --item review_inbox_... --state-root .runtime-state
pnpm run runtime -- review decide-inbox --item review_inbox_... --status deferred --reason "..." --state-root .runtime-state
pnpm run runtime -- review request-inbox-confirmation --item review_inbox_... --state-root .runtime-state
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
pnpm run runtime -- review plan-follow-up --review background_review_... --proposal review_proposal_... --state-root .runtime-state
```

The plan is a dry run. It can suggest later commands such as draft, audit,
promote, chain inspection, or skill revision, but it does not write state,
append episode evidence, or write the active vault. Follow-up action ids are
stable for the same review/proposal pair so a later operator gate can refer to
the same action.

Execute a read-only follow-up action:

```bash
pnpm run runtime -- review execute-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime-state
```

This gate currently executes only `inspect_chain`. It rejects actions that
would write state or the active vault.

Request confirmation for a mutation follow-up action:

```bash
pnpm run runtime -- review request-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime-state
```

This writes a pending confirmation envelope under `autonomy/followups/` and
appends evidence. It does not execute the selected action.

Execute a confirmed mutation follow-up:

```bash
pnpm run runtime -- review execute-confirmed-follow-up --confirmation follow_up_confirmation_... --state-root .runtime-state
```

This currently supports `collect_evidence`, `narrow_review`, `draft_sop`,
`audit_sop`, `promote_sop`, and `revise_skill`. It updates the confirmation
request and writes evidence for the selected action. It uses the configured
active vault only for confirmed `promote_sop` actions and confirmed
`revise_skill` validation events; `revise_skill` does not rewrite `SKILL.md`.

Create a state-only SOP draft from an eligible review proposal:

```bash
pnpm run runtime -- review draft-sop --review background_review_... --proposal review_proposal_... --state-root .runtime-state
```

Audit a state-only SOP draft:

```bash
pnpm run runtime -- review audit-sop --sop sop_... --state-root .runtime-state
```

Promote an audited SOP draft into the local active vault:

```bash
pnpm run runtime -- review promote-sop --sop sop_... --audit audit_... --state-root .runtime-state
```

Inspect the SOP self-evolution chain:

```bash
pnpm run runtime -- review chain --sop sop_... --state-root .runtime-state
```

## Current Boundaries

Current first-version scope:

- local single-machine runtime
- one repo checkout
- local JSONL config
- local state root
- local active vault under `LOCAL_RUNTIME_HOME`
- CLI foreground runs
- Feishu-backed IM foreground entrypoint
- Feishu read-only local operator commands for status, service health, service
  logs, governance, Opportunity Backlog, SOP Evolution Ledger, memory, context,
  background review history, review tick history, and review inbox
- local review inbox operator decision log consumed by backlog, context, and
  Feishu read models
- Feishu bounded local private-chat history in task context
- single-user local service runtime for Feishu IM
- state-only `service health` CLI read model for resident IM diagnostics
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
- structured SOP evolution next commands in ledger, backlog, and Feishu views
- SOP evolution next-command confirmation requests with stale-chain revalidation
- optional local SOP/skill learning experiment

Explicitly out of scope:

- open-source package compatibility
- multi-user service design
- multi-machine skill sharing
- public skill marketplace
- cross-node vault conflict handling
- GUI dashboard
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
