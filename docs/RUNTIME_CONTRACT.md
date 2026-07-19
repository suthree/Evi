# Runtime Contract

This document defines the implemented first-version local agent runtime
contract.

The contract is local-first and single-machine. It intentionally rejects
compatibility design for open-source distribution, multi-user hosting,
multi-machine skill sharing, public marketplaces, hosted GUI surfaces, hosted
daemons, and production deployment. It includes a single-user local service
runtime for resident channel intake and a localhost operator web console.

The approved v0.2 target is specified separately in
`docs/V0.2_MULTI_NODE_EVOLUTION.md`. That target adds private Git-backed asset
distribution and per-node activation while preserving node-local execution,
raw memory, state, and failure isolation. Until a v0.2 Trellis task is
implemented and verified, this document remains the authority for current
runtime behavior and the v0.2 document must not be used to claim that a
multi-node capability already exists.

## Scope

The first-version local agent is one local TypeScript/Node runtime that can:

- accept a CLI task or local IM message
- run as a foreground command or local single-user service process
- expose a localhost web console for runtime sessions, inbox review, profile
  binding, and explicit task runs
- expose bounded resident runtime health through `service health`
- expose a read-only local capability catalog through CLI and IM
- expose a read-only next-version capability acceptance audit through CLI and
  IM
- expose read-only project-design artifacts derived from verified
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
- `docs/AGENTS.cn.md` and `core/soul.cn.md` are Chinese companion files for
  local operators. `AGENTS.md` and `core/soul.md` remain the default
  model-facing sources. When either side of a stable pair changes materially,
  update the companion in the same work item unless the operator explicitly
  narrows the language scope.
- Preserve code blocks, command examples, JSON fields, protocol literals, API
  names, and quoted evidence in their original language.

- `README.md` is the compact English entrypoint for models, tools, and external
  references.
- `docs/README.cn.md` is the compact Simplified Chinese entrypoint for local
  operators.
- `docs/ARCHITECTURE.md` and `docs/ARCHITECTURE.cn.md` own current module
  placement, own/delegate seams, architecture pressure, and staged replacement
  order. They do not prove that a proposed migration is implemented.
- `docs/RUNTIME_CONTRACT.md` is the runtime authority.
- `docs/LOCAL_RUNTIME.md` is command and local service guidance.
- `docs/LOCAL_LEARNING.md` is SOP, skill, and active-vault guidance.
- `docs/ACTIVE_EXPLORATION.md` is opt-in design and acceptance material for
  content/publishing/image-generation work only.
- `.trellis/spec/` and `.trellis/tasks/` are repo-local governance records, not
  runtime state or durable memory.
- Trellis-generated agent context is tool-owned project governance context. It
  should be refreshed through Trellis commands instead of hand-owned as the
  runtime contract.

## Reference Stance

External agent implementations are references only. They are not standards or
compatibility targets, and their project names must not become runtime
identifiers, configuration keys, capability IDs, or persisted state fields.

The agent may borrow a pattern only when it strengthens this local contract. A
reference project never overrides the local first-version boundary.

Reusable takeaways include provider-neutral model selection, bounded gateway
entrypoints, explicit harness phases, durable local evidence, recovery
boundaries, atomic tools, and audited skill promotion. These patterns enter the
runtime only under neutral local contracts and verification gates.

## Capability Layers

The model is the base intelligence provider, but it is a black box. This
runtime cannot guarantee model quality by assertion; it must engineer the
surrounding loop so model output becomes bounded, inspectable, standardized,
and efficient enough to trust.

The capability boundary stack is:

1. Model substrate: model reasoning and generation. Delivery standard: every
   important output is constrained by prompts, context, schemas, checks, or
   review evidence instead of relying on model confidence alone.
2. Basic operations: read, write, search, fetch, and execute. Delivery
   standard: operations are bounded by path policy, side-effect labels,
   timeouts, output limits, and evidence records.
3. Agent engineering core: prompt, context, harness, loop, evidence,
   completion verification, and output-standardization contracts. Delivery
   standard: the agent can turn an operator goal into standardized actions,
   claims, verification commands, and reviewable outcomes.
4. Procedure and protocol layer: SOPs, skills, MCP-style adapters, and other
   reusable tool protocols. Delivery standard: they improve repeatability and
   efficiency, but do not override core judgment or completion gates.
5. Tool extension layer: GitHub CLI, Lark/Feishu, browser tools, content
   adapters, and similar integrations. Delivery standard: each tool remains an
   application or adapter slice unless it proves a reusable runtime contract.
6. General-agent baseline: one local agent can plan, act, verify, and learn
   through the layers above. Delivery standard: the baseline is stable before
   expert specialization is treated as durable progress.
7. Expert-agent specialization: domain agents receive specific skills,
   prompts, tools, and SOPs after the general baseline is reliable. Delivery
   standard: specialization is evidence-backed packaging of capabilities, not
   a substitute for the basic/core substrate.
8. Multi-agent orchestration: coordination across multiple expert agents.
   Delivery standard: orchestration is introduced only after single-agent
   capability, expert packaging, advisory boundaries, and main-thread
   verification authority are stable.

### Capability Growth Boundary

Self-iteration and self-growth are separate loops.

Self-iteration means active, evidence-backed improvement of the core and basic
runtime substrate: context assembly, harness validation, bounded tool execution,
evidence capture, completion verification, recovery, and operator inspection.
The accepted local self-growing mission grants standing authority to modify
repository source, tests, docs, local configuration, runtime state, the active
vault, scripts, local dependencies, and governed identity without per-change
operator confirmation.

Local self-iteration may use these evidence modes:

1. **Proposal or read-only audit**: identify the gap, owner surface, evidence,
   expected benefit, verification command, and rollback story without changing
   runtime behavior.
2. **State-only rehearsal**: exercise the candidate path in local state or a
   sandboxed rehearsal surface without changing the default runtime path.
3. **Gated write**: implement locally when evidence, checks, and rollback notes
   are explicit. The gate is harness/governance validation, not a mandatory
   human confirmation.
4. **Default adoption**: make the behavior part of the normal runtime after
   targeted verification shows core and basic capabilities were not weakened.

These modes are not a mandatory linear approval ladder. Under the standing
local authority, the agent may move directly to a local write or default
adoption when the evidence and verification path are already clear. Read-only
surfaces remain read-only by their own contracts, and public publishing,
private-data disclosure, and destructive remote operations remain separate
external-effect gates.

No self-iteration stage may trade away existing core/basic capability,
completion verification, evidence capture, or operator inspection in order to
ship faster.

Self-growth means preserving reusable procedures through SOPs and skills. When
`runtime.promotion_enabled` is true, draft, audit, promotion, revision, and
retirement are autonomous local harness decisions rather than per-item operator
confirmations. Durable procedures still require repeated or high-value evidence,
a clear trigger, bounded procedure, verification command, failure mode, and
rollback or retirement rule.

Existing commands, adapters, delegated agent surfaces, SOPs, skills, and local
runtime capabilities should be reused before new mechanisms are introduced. If
an existing surface almost covers the need, improve its invocation, docs, or
validation before creating a parallel path.

`context` and `harness` are anti-drift infrastructure. They constrain what the
model sees, validate what the model asks to do, preserve evidence, and decide
whether completion claims are acceptable.

Trellis is the project self-iteration maintenance tool for bounded tasks,
specs, decisions, and command-maintained agent context. It is not runtime
state, durable memory, the active vault, the skill promotion gate, or the
authority for current runtime behavior.

### Dynamic Authority And Decision Ownership

Runtime boundaries are context-sensitive decisions, not a frozen permission
matrix. Before a material boundary change, the responsible Decision Owner must
resolve the accepted mission, the latest operator intent, stable core and
repository contracts, the current task contract, live evidence, risk, and
reversibility. Depending on scope, the owner may be the operator, a named
harness or governance gate, or a stable runtime contract. A model proposal,
successful tool call, or verified completion is decision evidence; none of
them is an authority decision by itself.

The allowed decision outcomes are `allow`, `defer`, `ask`, `deny`, and
`override`. A material `override` must preserve enough bounded provenance to
answer all of the following:

- `decision_owner`: who owns this decision for the affected scope
- `authority_basis`: which mission, operator instruction, contract, or gate
  authorizes the owner
- `supersedes`: which earlier rule or task constraint is being replaced
- `scope`: which actions, artifacts, runtime, task, and time window are covered
- `evidence_refs` and risk: what changed and why the override is justified
- verification and rollback or retirement: how the effect is checked and
  safely reversed
- re-evaluation or expiry: which condition makes the decision stale

Local, reversible effects may be decided autonomously by their current owner.
Mission changes, unresolved operator ownership, secret or private-data
egress, public communication outside the requested flow, and destructive
remote or otherwise irreversible external effects remain operator-owned.
Earlier local rules may evolve, but no boundary is silently widened because a
model was confident, a task succeeded, or standing local authority exists.

Authority must be re-evaluated when the task changes, new evidence invalidates
an assumption, risk or reversibility changes, a newer operator instruction
arrives, or the recorded expiry condition is reached. Until the runtime
persists a first-class Decision Owner record for every material override, the
episode/action/evidence lineage is the minimum audit trail; missing lineage
means the override is unproven, not automatically accepted or permanently
forbidden.

### Core Execution

Core execution is the tool layer:

- `file.read`
- `file.write_state`
- `file.write_repo`
- `repo.search`
- `http.fetch`
- `command.run`
- `workspace.prepare`
- `codex.run`
- `code.execute_node`

Current implementation status: the first-version core execution surface is
implemented and covered by local capability tests. Core tool results must keep
bounded audit metadata such as status, side-effect level, scope or cwd, output
budget, observed/returned size, and truncation state where the tool can produce
large output.

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

### GoalRuntime Local Control Plane

New goals created through the local `goal` CLI are owned by `GoalRuntime` from
their first intent event through one terminal `OutcomeReceipt`. The public
runtime boundary remains `handle(command)` and `read(goalId)`. A Continue
command runs a bounded internal execution tranche: cognition proposes one
action or outcome at a time, `EffectPolicy` decides the semantic effect, the
runtime records the action intent before dispatch, the tool observation returns
to the same canonical event stream, and the verifier alone may accept the
outcome. The model does not author evidence-id matrices or parallel completion
documents.

Each new Goal persists its real control checkout, Git common directory, branch,
and start HEAD as immutable repository authority. Continue validates this
control authority before cognition; exact-effect Resume validates it before
dispatch. Its HEAD may advance only through descendants. Historical starts
without the field remain readable, pausable, and abandonable, but cannot
Continue or dispatch. Use the same control `--repo-root` throughout.

A Goal may later derive one isolated execution workspace from one successful
canonical `workspace.prepare` observation. Preparation requires a fresh
`codex/issue-N-slug` branch, the exact control start HEAD as base, a clean and
unchanged main control checkout, the same Git common directory, and a derived
ignored `.worktrees/<branch-basename>` path. The observation is the only source
of the execution-workspace projection; there is no registry, second state
owner, or ingress-time creation. Repo-scoped tools then use this workspace,
while state-scoped tools keep the original state root. Continue, Resume, and
immediate pre-dispatch checks live-validate the derived authority.

For `codex.run`, GoalRuntime resolves the proposed new target or persisted
resume handle against the execution workspace when one is bound, otherwise the
control authority. It requires actual worktree, common directory, branch, and
delegated base equality before recording a pending effect. The tool rechecks
the same effective authority immediately before spawn.

Goal lifecycle and cognition readiness are deliberately separate. Start, Read,
Pause, Resume, and Abandon construct the local control plane without resolving
a model. Continue lazily resolves exactly one `goal_cognition` provider from
layered runtime configuration. `active_model` uses the selected
OpenAI-compatible model; `codex_cli` uses an Evi-owned isolated Codex contract
with the `fast` service tier and an explicit local credential-store selector.
It does not load the user's Codex config or profile. Provider selection never
falls back silently. For either provider, Config reports exact selector/model
gaps or `runtime_check_required`; it does not inspect login material, execute a
provider, or turn config presence into a live-availability claim. A bootstrap
or model failure is recorded as a blocked observation on the same Goal and may
be repaired before a later Continue.

The Codex cognition adapter is not a second agent or an effect executor. Each
turn runs ephemerally in an empty temporary directory with user config and
rules ignored, a minimal process environment, Web disabled, bounded capture
and time, and a strict output schema. The invocation disables shell/unified
exec, apps/plugins, browser/computer, image, multi-agent, hooks, and related
tool features. Its custom permission profile also denies the filesystem root
and tool network access. JSONL inspection terminates any forbidden item as a
second line of defense. GoalRuntime alone executes the proposed normalized
action and owns effect authority, evidence, verification, and the receipt.

The stored soft budget applies to one Continue command, not to the Goal's
lifetime. A later Continue opens another bounded tranche under the same
identity; cumulative `usage` may therefore exceed the numeric tranche budget.
Views and checkpoint projections expose `budget_scope: "per_continue_command"`
so this continuation behavior cannot be mistaken for a lifetime cap.
The action `summary` is the existing bounded cross-tranche working synthesis:
confirmed facts, the unresolved question, and why the proposed action is next.
After the action is observed, GoalRuntime carries that summary into the
checkpoint and stably merges newly observed refs with prior refs, deduplicating
and retaining the newest 32. The complete tool result remains a canonical
observation in the event stream, including failures; its summary does not
replace the working synthesis. A checkpoint is fallible, rebuildable working
memory, not proof, authority, or a second evidence store. Canonical observations
win any conflict. When rendered into recent evidence, a soft-budget event
exposes only the neutral pause fact; its working synthesis and selected refs
remain on the separate Goal checkpoint surface. This continuity mechanism does not enlarge the recent
canonical-evidence window or add event schemas, planners, citation matrices, or
parallel completion state.
Before each cognition call, the model input names the Goal-wide counter
`lifetime_usage` and separately supplies the current `execution_budget` with
`scope`, `limit`, `used`, and non-negative `remaining` values. That current
tranche is derived from canonical events for the active Continue command and is
not another persisted budget store. Only its `used` value is compared with the
tranche limit; a later Continue begins at zero while lifetime usage remains
cumulative.

Every canonical evidence view supplied to Goal cognition or outcome
verification also carries `continue_scope: current_continue | prior_continue`
relative to the active Continue command. `prior_continue` remains canonical
proof of the historical event; it is not by itself proof that mutable state is
still current. Cognition must acquire a fresh bounded observation before it
repeats a drift-sensitive blocker or proposes a drift-sensitive outcome, while
choosing the capability dynamically from the current Portfolio. The harness is
the fail-closed backstop after `goal_blocked` or `goal_verification_failed`:
the most recent such boundary creates an observation obligation. Pause,
resume, denied planning, soft-budget checkpoints, and other neutral lifecycle
events do not erase it; only a later canonical `goal_action_observed` event
satisfies it. A model-authored blocker or outcome is rejected while the
obligation remains. Rejected blockers receive the
`post_boundary_observation_required` checkpoint; rejected outcomes receive a
failed `post_boundary_observation` verification check. The satisfying
observation can precede a later soft-budget checkpoint, so it need not belong
to the Continue command that finally proposes the outcome. Goal cognition sees
the same ordering as a derived `observation_obligation` status: `none`,
`required`, or `satisfied`. `satisfied` tells cognition that a
post-boundary observation cleared the harness obligation even when that
observation is now `prior_continue`; it must not reacquire the observation
solely because of that scope change. Cognition still evaluates whether the
canonical observation supports the next decision and refreshes when evidence
indicates material drift or the decision requires a different fact. This
temporal projection writes no new event, ledger, cache, state owner, task
router, or tool-specific refresh rule. A soft-budget boundary alone does not
create the hard obligation; otherwise a one-model-round tranche could never
accept the observation it was forced to checkpoint immediately after
recording.

A fresh observation is not automatically progress. After a model-authored
blocker, GoalRuntime compares the first observation in the next Continue with
the last observation that preceded that blocker. If the canonical action
digest and the observation's decision-facing identity are equivalent and
cognition proposes another blocker, the proposal is rejected inside the
remaining tranche rather than ending the Continue. The decision-facing
identity uses the tool result's bounded semantic summary plus its success,
effect, refs, typed changes, failure, verification, and workspace control
markers; transport ids and timestamps do not manufacture progress. Cognition
then receives ephemeral `repeated_non_progress_observation` decision feedback
and must dynamically choose a materially different evidence path or propose a
supported outcome. While that feedback is active, the same action digest is
not dispatched again. The feedback is not canonical evidence and names no
mandatory fallback tool. If no model round remains, the existing blocked event
shape records a `non_progress_replan_required` checkpoint and the rejected
round's usage; this harness checkpoint does not create a new observation
obligation. The projection is derived from existing events and adds no event
schema, progress ledger, mutable score, task router, or second lifecycle owner.

Before the same cognition call, GoalRuntime resolves one bounded Capability
Portfolio. `packages/runtime/src/goal_capability_portfolio.ts` combines current
tool contracts and their model-visible constraints, readiness under the Goal's
control and any derived execution authority, at most two recalled skill bodies,
and bounded capability competence. It is a read-only decision context: it
invokes no model, executes no tool, writes no state, grants no effect authority,
and cannot accept completion.
There is no keyword task router. The existing cognition call chooses from the
current candidates using the Goal, evidence, readiness, competence, authority,
cost, risk, reversibility, and verifiability.

The same input carries a derived execution-workspace freshness view comparing
the live bound-worktree HEAD with the latest harness-owned workspace
observation. For a bound workspace, only `aligned` permits a model blocker or
outcome; both `changed_unobserved` and `unavailable` fail closed. A workspace
observation counts only when its canonical planned action resolves to execution
placement and its branch and worktree match the bound authority. A
control-scoped observation may satisfy an independent temporal observation
obligation, but it cannot clear this workspace-specific condition even if its
result contains a workspace-shaped marker. Capability candidates expose their
existing workspace-placement contract so cognition can choose a relevant
execution-scoped action dynamically; GoalRuntime does not prescribe a tool or
persist another freshness owner. Outcome verification rechecks the same derived
condition after the verifier returns and before a receipt is appended, so an
external worktree advance during verification fails closed.

Every new cognition action must include a typed `capability_selection` with
`capability_id`, `execution_purpose`, `skill_refs`, `rationale`,
`verification_plan`, and `fallback`. GoalRuntime validates before EffectPolicy
or dispatch that the capability exists, is currently available, matches the
action tool and execution role, and cites only skills present in the Portfolio.
Invalid selection becomes a same-Goal blocked checkpoint without planning or
executing the effect. Direct tools may support bounded orientation,
verification, recovery, or an atomic task; delegated executors represent
specialist execution. These are role semantics, not a task-to-tool map.
Historical `goal_action_planned` events without selection metadata remain
readable; new planned events retain the validated selection as evidence of the
decision, not as a second authority.

When integration was performed outside a Goal's bound execution worktree, the
control-placed `runtime.inspect` tool may supply one fresh bounded snapshot of
the current control repository and local Git provenance, current and exact
prior deployment, installed controller, service-health, previous-runtime, and
channel-liveness owners. Prior deployment lineage requires one validated
exact-commit history record and bounded local Git parents/ancestry; missing,
corrupt, ambiguous, or unreadable input remains explicit and fails closed. The
snapshot is derived on demand and persists nothing. Its `consistent`,
`inconsistent`, or `incomplete` evidence state is verification input only: it
neither routes a task nor grants effect or completion authority.

Capability competence is derived from action observations belonging only to
previously terminal Goals with current OutcomeReceipts.
`packages/runtime/src/goal_tool_competence.ts` limits the recent signal window,
number of tools, and failure-summary length. Direct `ok`/failure counts are
execution observations; accepted/abandoned Goal counts are association only,
never causal attribution. Sparse history remains `emerging`; repeated recent
failures become `degraded` fallback guidance; repeated successful history may
become `reliable`. The projection writes no state, invokes no model, promotes
no learning artifact, and never overrides current canonical evidence,
EffectPolicy, or verification.

`EffectPolicy` classifies operation, target, data exposure, and reversibility.
It does not trust a model-provided `side_effect_level` to grant authority. Safe
bounded local reads, query-free public reads whose resolved public address is
pinned to the actual connection, and reversible repo/state writes may run under
standing local-evolution authority. Query-bearing public requests and
repo-controlled verification commands require exact-effect confirmation because
they can transmit local data or execute mutable code. Secrets and private
egress, destructive local effects, unknown tools, and
foreground writes into GoalRuntime, queue, episode, working-memory, SOP, skill,
deployment, service, channel, or governance-owned state fail closed. External,
irreversible, runtime-mutating, dynamic-code, and nested coding effects require
confirmation of the exact effect identity and digest.

An allowed effect is written as an intent before dispatch and as an observation
after dispatch. If the process stops between them, the same goal is exposed as
`effect_outcome_unknown`; command replay never guesses that the effect is safe
to repeat. A confirmation decision pauses the same goal with one pending effect
whose view exposes the complete proposed action together with its digest, so
confirmation is informed rather than blind. It does not create a separate
confirmation-document chain. Local `goal resume
--confirm-effect <effect-id>` authorizes only that stored action. Manual pause,
resume, abandon, soft-budget continuation, verification failure, and later
repair retain the original goal identity.

Denied actions are redacted before canonical persistence. A secret-bearing or
private URL is classified with a query-free target; only a non-sensitive query
that can legitimately reach `confirm` is exposed in the pending proposed
action.

Canonical state is `goals/events.jsonl`; `goals/checkpoints/<goal-id>.json` and
`goals/receipts/<goal-id>.json` are rebuildable projections. Intended tool
effects may change authorized repo or task state, but the foreground control
path writes no legacy queue, opportunity, episode, working-checkpoint,
completion, iteration, SOP, skill, deployment, or learning-promotion state.
GoalRuntime derives the accepted receipt's complete, ordered, deduplicated
`changes[]` from typed canonical tool observations; the model neither declares
nor copies change identities. Existing singular `change` fields count only on a
successful observation. Harness-authored plural changes remain canonical even
when a delegated worker fails after mutation, so partial effects cannot vanish.
An empty set therefore means that no typed canonical change observation exists.
This complete change lineage is independent from the recent
model-evidence window and is also retained by an abandonment receipt, so partial
effects remain visible after a direction is retired. Receipt capacity is
402 canonical identities: one 201-identity execution envelope plus one
201-identity verification recovery envelope. One atomic `codex.run` reserves
201 slots before dispatch: at most 200 status paths plus one post-run HEAD identity. A
verification-purpose `command.run` reserves the same recovery envelope because
a command that violates its unchanged-workspace contract may expose those
typed paths and commit while failing verification. A
potentially mutating effect that would cross the remaining capacity is blocked before
dispatch, leaving the existing Goal completeable or abandonable instead of
dropping early observations. Every Git commit and delegated `workspace_path`
additionally requires a later successful local-verification observation. That
satisfying observation is pinned with the change lineage and cannot age out of
the recent evidence window. Effect classification does not define this
correctness role: EffectPolicy still decides whether the actual action is
allowed, confirmed, or denied, while GoalRuntime consumes a harness-authored
`local_verification` observation role. For `command.run`, verification purpose
alone is not proof. The process must succeed and fixed pre/post Git HEAD plus
bounded semantic-index and Git-visible content fingerprints must remain
identical. The content snapshot includes tracked and untracked files, so
rewriting an already-dirty path is detected even when porcelain status is
unchanged. Snapshot inspection is bounded to 10,000 files, 1,000 changed paths,
and 64 MiB of content; unavailable, unsupported, or over-limit snapshots fail
closed. Dynamic code keeps
its exact-effect confirmation even when the resulting unchanged observation is
eligible as verification evidence. New observations carry
`verification_role_v1` semantics whether or not a role is granted, so a new
execute-purpose known verification command cannot inherit correctness from its
safety classification. Historical known `run_local_verification` observations
without that marker remain compatible. Diagnostic tool output may be truncated, but typed
control fields such as `change`, plural `changes`,
failure kind, and bounded refs survive truncation. Free-text substring matches and a model proposal
without decisive observation or fail-closed policy evidence cannot create an
accepted receipt.

Current cutover includes the explicit local `goal` lifecycle, the standalone
`live` convenience ingress, and the local Web ingress:

```bash
pnpm run runtime -- goal start --task "..." [--repo-root /absolute/worktree]
pnpm run runtime -- goal continue --goal goal_... [--repo-root /same/absolute/worktree]
pnpm run runtime -- goal read --goal goal_...
pnpm run runtime -- goal pause --goal goal_... --reason "..."
pnpm run runtime -- goal resume --goal goal_... [--confirm-effect goal_effect_...]
pnpm run runtime -- goal abandon --goal goal_... --reason "..."
pnpm run runtime -- live --task "..." [--repo-root /absolute/worktree]
```

`live` issues one Start and exactly one bounded Continue to the same GoalRuntime
identity, then returns the canonical Goal view. An active or paused result is
continued through `goal continue` or `goal resume` with the returned `goal_id`.
It does not translate the Goal into a legacy `RunResult`, automatically run
additional tranches, or write query/todo discipline; `live --query-todo` fails
before GoalRuntime construction instead of silently dual-writing old state.

`POST /api/runs` in both standalone `web` and daemon-hosted Web uses that same
canonical Goal ingress: it issues exactly one Start and one Continue, returns
the canonical `GoalView`, and renders the returned `goal_id` with an explicit
`goal continue`/`goal resume` instruction. New Web submissions write no legacy
task queue, task-run, channel-outbox, completion, episode, iteration, SOP,
skill, or deployment state. Session, inbox, and historical run/queue read
surfaces remain readable; the Web request does not bind a new Goal to a session.
Legacy `runtime_session_id` and `execution_contract` request fields fail closed
instead of being ignored or translated into Goal authority.

Ordinary allowed Feishu p2p tasks and bound Feishu, Telegram, and Discord
runtime-session `/run` or accepted-mention tasks use the same canonical Goal
ingress. Each task starts one Goal and
executes one bounded Continue, then replies with Goal status, receipt summary
when terminal, and status-aware continuation guidance. These new interactive
Goals
write no legacy queue, task-run, provider-neutral outbox, completion, episode,
iteration, SOP, skill, or deployment state. Provider adapters retain direct
delivery and provider-specific evidence containing `goal_id`, Goal status, and
receipt id. For p2p, bounded same-chat history is rendered into the Goal objective
before inbound evidence is recorded. The Feishu adapter retains allowlisting,
deduplication, in-memory follow-up queuing, transport sends, and read-only
operator commands, but it does not own a legacy runner or compatibility result.
Foreground learning remains deferred to a receipt-driven asynchronous
`LearningRuntime`.

Allowed Feishu p2p operators may address that same canonical control plane with
strict `/goal read goal_...`, `/goal continue goal_...`, `/goal resume
goal_...`, and `/goal confirm goal_... goal_effect_...` commands. These commands
name the Goal and, for confirmation, the exact pending effect; there is no
latest-Goal lookup or conversational `yes` inference. Read is read-only;
Continue, Resume, and Confirm translate to one canonical GoalRuntime command.
Malformed or mismatched identifiers fail closed and never become new task
prose. The interaction edge owns generated command ids and provider evidence,
not Goal state. Feishu renders canonical lifecycle status separately from
receipt outcome prose and returns provider-native next commands.

### Basic Entrypoints

The local CLI is the primary foreground entrypoint.

IM is also a first-version channel capability. The project command surface is
provider-neutral where possible: `doctor` checks IM by default, `daemon serve`
starts the unified local runtime daemon, and `service --target runtime` manages
the resident daemon through launchd.

The resident daemon owns a `MessageGateway` seam. Web, Feishu, Telegram, and
Discord are channel adapters behind the same lifecycle interface. Discord is
implemented as a first bot adapter using Gateway events plus REST message
sends; slash commands, full Gateway resume/sharding, and rich interactions
remain out of scope. Provider-specific IDs such as Feishu `chat_id`, Telegram
`chat_id`, or Discord `channel_id` must stay inside adapters or local
session-source mappings.

IM channel configuration is provider-neutral at the selector layer. Channel
records use `kind: "feishu" | "telegram" | "discord"`, and the CLI accepts
`--provider` for daemon, doctor, and runtime service checks. The runtime currently
starts Feishu, Telegram, and Discord adapters.
Provider startability and concrete adapter construction live in
`packages/runtime/src/im_adapters.ts`; the config loader only resolves the
provider-neutral scenario.
IM Goal execution is owned exclusively by `goal_cognition`; stale scenario
`model_id`/discipline fields are ignored input and do not gate daemon, service,
or doctor readiness.
The resident heartbeat carries the MessageGateway state and per-channel health
for operator diagnostics. `service health --target runtime` renders the
heartbeat-carried gateway summary, but it must not read provider logs, provider
secrets, or provider SDK state. The Feishu adapter may project its non-sensitive
inbound connection lifecycle into the structured `inbound.connection_state`
field. A `failed` lifecycle makes the channel `error`; `idle`, `connecting`, and
`reconnecting` keep the process running but make bounded service health report
`gateway_inbound_not_ready` attention until the field becomes `connected`.
Legacy channel health without the optional field is not inferred from display
text. If an adapter fails during daemon startup, the daemon must write an
`error` heartbeat with the failed MessageGateway channel before the foreground
process or resident service exits.

Runtime channel messages use a provider-neutral source envelope before they are
bound to sessions. The stable source shape is channel kind, configured channel
id, conversation type, conversation id, optional thread id, optional actor id,
and optional profile. Route/source keys are derived from that envelope, so
Feishu groups, Telegram chats, and Discord conversations can share the same
runtime session and inbox machinery without making the runtime core depend on a
provider SDK.

Inbound channel messages then pass through the runtime channel dispatcher. The
dispatcher owns session binding, pending-session bootstrap, inbox append, and
`/run`/mention trigger classification. Adapters keep provider normalization and
reply transport logic, but must not reimplement session-routing rules.

The local web console is also a first-version basic entrypoint. `web` starts a
localhost-only operator surface over runtime sessions, channel inbox entries,
profile binding, task-run history, and canonical Goal submission. It submits a
new Goal through one Start plus one Continue and returns its `GoalView`; it does
not invoke the live runner or write a new task-run row. Profile binding must use the same
provider-neutral route key shape as Feishu, Telegram, and Discord channel
sources. Under `daemon serve`, the same console is a Web channel adapter
managed by the `MessageGateway`. It is not a hosted, multi-user, authenticated,
or desktop GUI.

Runtime sessions are local state, not model memory and not a hosted session
database. A channel source can map to one runtime session through a source
route key. Unknown Feishu groups can be bootstrapped only by an authorized
operator and start as pending/unassigned. A profile can be bound through
`/session use <profile>` in the group or through the web console. Ordinary
bound group messages append session inbox entries; `/run <task>` and accepted
mentions submit one canonical Goal through the shared Goal ingress. Adapters
send the returned presentation directly and persist only provider-specific
delivery evidence. No IM adapter receives a `TaskRunner`; Feishu p2p and group
execution both receive Goal ingress.

The resident daemon does not start a runtime task-queue worker for current
session work. Existing queue, task-run, and provider-neutral outbox ledgers
remain readable, and adapters may drain already-queued provider rows for
delivery compatibility. The queue implementation remains a historical/manual
compatibility surface; it is not an ingress owner, resident scheduler, remote
broker, cancellation system, or multi-process scheduler. New Goal failures
also stay out of the provider-neutral outbox and are recorded only in the
provider adapter's error evidence. Current service manifests and `service status`
do not expose the retired queue worker; an old
`services/runtime/task_queue.json` file may remain as historical evidence but
is not current component state.

Historical legacy queue rows may retain an explicit `execution_contract` for
one operator-confirmed task. The append-only queue read model preserves that
stored contract when a historical/manual recovery path reads it. This is compatibility for existing
rows, not a current Web or IM ingress capability. The contract names the
operator as Decision Owner, records the
authority basis, allowed and forbidden effects, an external-command allowlist,
forbidden arguments for every direct command, model-round and tool-call budgets, and a side-
effect ceiling. It must state `operator_confirmed=true` and
`expires_with_task=true`; external-write authority is invalid without at least
one allowlisted external command. The runtime computes and persists an
`authority_digest`; a stored digest mismatch fails closed by removing authority
from the normalized read model. Free-form task text never creates this authority.

When present, the live runner exposes the same structured snapshot in the turn
context, uses its model-round/tool budgets, and rejects a tool before execution
when the requested effect exceeds the ceiling, the total tool-call budget is
exhausted, an external command is not allowlisted, or a forbidden command
argument is present. When the ceiling is `external_write`, it also rejects
shells, general interpreters, `code.execute_node`, and package-manager exec/dlx
indirection so external tools cannot be hidden inside script text instead of
direct binary argv. A rejection is a failed harness tool result and therefore
cannot support a false `done` claim. The outer task contract does not weaken the
narrower immutable `codex.run` authority snapshot or move completion authority
away from `main_harness`. Current Web and runtime-session IM ingress never
enqueue this object; they reject legacy authority fields and use GoalRuntime
effect confirmation instead. Feishu p2p/private chat also does not create
external-write authority from task prose.

The retained historical/manual queue worker's own shutdown clears future
ticks, rejects new runs, waits for its startup/current run and every accepted
status write, then persists `stopped` before its stop promise resolves. The
resident daemon no longer constructs or awaits this worker. Heartbeat shutdown
still drains an already-started heartbeat write before
the daemon writes its final `stopping` and `stopped` states, so these components
do not append or replace state after daemon stop returns.

Queue completion is derived only from the structured live-run
`completion_status` and `verification_status`; verdict prose never changes a
task to `done`, `blocked`, or `failed`. A verified structured `done` completes
the task, a structured `done` with failed or skipped verification fails it,
and `not_done` or `blocked` remains unfinished. An unfinished historical/manual queue run
retains the same task id, runtime session id, worktree, first live session id,
working-checkpoint ref, and latest concrete `next_action`. It requeues that same
entry for a later stale-queue resume and stops after at most three claimed
attempts; it never enqueues a replacement continuation task. A resumed runner
prompt names those stable fields and the attempt bound. When the selected
checkpoint carries a non-empty actual `worktree`, settlement updates the queue
to that path before resume; when it is absent, including for legacy checkpoints,
the existing queue worktree is retained. Terminal or exhausted
entries are not recoverable, so repeated worker ticks do not execute them
again.

For a live engineering run whose structured completion is `not_done` or
`blocked`, a valid checkpoint emitted through `update_working_state` remains
the current checkpoint, including its model- or harness-authored
`next_action`. Post-run selected-skill telemetry is recorded separately and
must not overwrite that engineering continuation. If the unfinished run did
not emit a valid checkpoint, the harness writes a bounded resume fallback
instead of a skill-telemetry next action. `RunResult` carries the structured
completion and verification statuses plus the selected checkpoint ref and
next action, and the checkpoint's optional actual worktree, so the local queue
can persist continuity without reading verdict text.

Historical/manual queue recovery has a provider-neutral local ledger under
`channels/outbox.jsonl`. Queue-worker final/error outcomes append rows with
source kind, source route/source key when available, runtime session id, task
run id, reply purpose, text, and status. Feishu/Telegram/Discord-sourced
historical recovery rows are queued for adapter replay; rows without a
deliverable provider source remain skipped. New Feishu p2p Goal final/error
delivery writes provider-specific evidence and does not append this ledger.
The outbox is a compatibility communication read model, not a current Goal
ingress owner. Provider adapters must mark
rows that match their provider but not their configured channel as skipped
instead of leaving them queued forever. It is not a retry broker, provider SDK
wrapper, or hosted messaging system.

The CLI also exposes `capabilities` as a read-only local capability catalog.
Feishu mirrors it through `/capabilities`, `/abilities`, and `/ability`. The
catalog is a repo-owned read model over implemented core tools, harness
actions, context/read-model surfaces, memory/local-learning gates, service
runtime, entrypoints, and explicit boundaries. It must not infer capabilities
from the current model response or from transient runtime state.

The CLI also exposes `capabilities acceptance` as a read-only next-version
acceptance audit. Feishu mirrors it through `/capabilities acceptance` and
`/capabilities audit`. The audit is a repo-owned checklist over current core
execution, entrypoints, harness, context runtime, and service posture. It lists
verification commands and next feature slices for operators, but it does not
run those commands. Its
`default_next_slice` must stay on the core/basic path. Application slices and
local-learning items may remain visible as `follow_up_slices`, but default
consumers must not treat external adapters, publishing work, or SOP growth as
the core capability direction. When core execution, Harness, and context gates
are ready while basic entrypoints still require `operator_check`, the default
slice is derived from that basic-entrypoint gate and remains verification-only;
the audit does not claim that doctor, service health, Web, or IM checks ran.

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
repo root with `LANG=C` and `LC_ALL=C`. A failed spawn is retried exactly once
only when its resource error is `EAGAIN`, `EMFILE`, or `ENFILE`; ordinary git
failures and every other spawn error are returned without retry or relabeling.
It summarizes branch, upstream, ahead/behind, dirty-file counts, and bounded
path/status entries. It must not accept shell text, read file bodies,
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
When a category groups mixed surfaces, the capability-level `layer` is the
authority; category layer is only navigation. For example,
`goal.tool_competence` is a `core_runtime` cognition feedback surface even
though it is grouped near local-learning evidence.
Catalog entries must expose both `category_layer` and `effective_layer`.
`category_layer` is the owning category's default layer, `layer` is only a
capability-level override, and `effective_layer` is the resolved layer that
consumers should use for scoring, rendering, and core/basic selection.

`capabilities` and Feishu `/capabilities` must not read auth records, API keys,
app secrets, launchd state, service logs, raw context Markdown, review/SOP/skill
bodies, or arbitrary state artifacts. They must not invoke the model, execute
tools, request confirmations, execute follow-up actions, restart services,
mutate state, write the repo, or write the active vault.

### Legacy Self-Evolution Diagnostics

`governance scorecard`, `governance project-design`, and `governance
iterations` remain readable for historical state inspection and migration
diagnostics. They are not resident context sections, capability-selection
authority, active-work owners, or completion truth. New engineering delivery
is activated through one GitHub Issue and one Trellis task; new runtime
learning derives from canonical Goal events and one OutcomeReceipt.

These legacy commands may read their existing bounded state and may preserve
historical write commands for compatibility during staged retirement. They
must not invoke a model, execute tools, create a current Goal, promote an SOP
or skill, change Goal acceptance, or make their projections authoritative.
No new runtime path should depend on them. A later bounded replacement task
may delete each command after remaining callers and historical operator needs
are measured.

### Capability Acceptance Audit Rules

The capability acceptance audit is a local read model for deciding whether the
current runtime is ready for the next feature slice. It is implemented from the
repo-owned acceptance definition in `packages/core/src/capabilities.ts`.

Required policy:

- the audit gates acceptance evidence by core execution, basic entrypoints,
  agent harness, and context runtime; SOP/local-learning evidence remains
  follow-up guidance unless a later local-learning iteration explicitly selects
  it
- each gate lists source refs, verification commands, and boundaries
- the audit lists one `default_next_slice` for the next core/basic handoff and
  keeps application or local-learning work in `follow_up_slices`
- next and follow-up slices are planning guidance only
- CLI `capabilities acceptance` and Feishu `/capabilities acceptance` render
  the same acceptance baseline
- explicit CLI `capabilities verify-entrypoints` runs the bounded local checks:
  doctor without credential requirements, localhost `/api/sessions`, resident
  service health and deployment identity, running Web and connected Feishu
  channels, and a clean workspace
- successful verification writes
  `governance/capability-acceptance/basic-entrypoints.json`; acceptance reads
  this record as ready only while its source commit still matches both the
  resident runtime and repo HEAD and the live health/workspace checks remain
  current
- a missing, failed, malformed, or stale record leaves `basic_entrypoints` at
  `operator_check`; a current verified record closes the current core/basic
  baseline and leaves `default_next_slice` empty

Forbidden behavior:

- no test execution, shell command execution, model invocation, service
  restart, launchd inspection, or Feishu mutation
- no auth record, API key, app secret, service log, raw context Markdown,
  review/SOP/skill body, or arbitrary state artifact reads
- the acceptance read model performs no state, repository, or active-vault
  writes; the explicit verifier writes only its bounded acceptance state record
- the verifier does not invoke the model, run arbitrary tools, read secrets,
  publish externally, mutate repository files, or write the active vault

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

Service lifecycle and service health commands resolve state root with one
ordered contract: explicit `--state-root`, then the valid absolute `state_root`
in the installed `<LOCAL_RUNTIME_HOME>/service/runtime.json` manifest, then
`<LOCAL_RUNTIME_HOME>/state/runtime` as the safe fallback. A missing, malformed,
wrong-target, wrong-home, or relative-root manifest must not redirect the
command. This rule is limited to the resident service harness and does not
change ordinary interactive runtime state selection for live, pipeline,
memory, context, or review commands.

Local service runtime must not introduce hosted service design, multi-user
queues, remote deployment, cross-machine state, or production daemon
governance.

The resident service may install one stable local deployment supervisor outside
the replaceable runtime bundle. This supervisor may stage and atomically switch
the local `next`, `current`, and `previous` slots; enforce bounded
commit/heartbeat/Web/IM startup readiness and local probation; accept an
explicit evidence-bound failure signal; roll back hard local failures; preserve
bounded deployment evidence; and emit one typed failure/recovery observation
after the previous build recovers. A deployment request must first verify that
the installed copied controller matches the canonical stable runtime controller;
a mismatch returns `controller_handoff_required` before candidate build or slot
mutation. The supervisor must not create, enqueue, resume, or select a repair
goal. It must not invoke a model, edit repository source, infer semantic failure
from ordinary log text,
publish or communicate externally, perform remote deployment, coordinate other
machines, or accept an incompatible state-schema migration. A failed commit is
not eligible for redeployment. An operator or the future GoalRuntime may later
choose a distinct verified fix-forward deployment linked through `repair_of`,
but controller recovery itself has no authority to make that goal decision.

Repository source reaches the installed runtime through one commit-bound
transaction. A deployment request must freshly build one unchanged clean commit
before staging it. Ordinary service install/start/restart actions preserve an
existing usable `current` bundle and own only installed service and launchd
lifecycle; first-install bootstrap is allowed only when `current` is absent.
An explicit evidence-bound reconciliation may adopt an already running clean,
ready bundle when recovering legacy ledger drift, while preserving superseded
history. Reconciliation must not build, activate, restart, weaken failed-commit
exclusion, or become the normal deployment path.

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

Every rendered bundle is subject to a hard character budget before it is
persisted or sent to the model. The limit comes from the active model's derived
`total_hard_limit_chars` when available; otherwise the runtime uses a
64,000-character fallback. Before hard-budget enforcement, the assembler uses
the task-bound `focused`, `governance`, or `recovery` attention profile and
records its included and intentionally omitted sections in
`attention_selection`. If the selected
bundle exceeds the limit, assembly deterministically bounds oversized sections,
then reduces non-critical diagnostic/history sections before critical task,
runtime, recall, selected-skill, discipline, and output-contract sections. Each
truncation preserves a bounded head and tail so a long accepted task keeps both
its opening scope and latest instruction. An implausibly small declared limit
fails closed before model invocation.

The context manifest records `budget_enforcement` with the limit source,
original and rendered totals, truncated sections, omitted section titles, and
the enforcement boundary. Context list/show and Feishu operator views expose
this metadata without reading raw context Markdown. Enforcement does not fetch
extra artifacts, infer a larger provider window, mutate source/state, or claim
that omitted evidence was shown to the model.

When rendered, `Attention Plan` is a short read-only routing hint over the
accepted goal, non-secret model context budget, latest context-pressure
manifest metadata, and current working checkpoint metadata. It must not read
raw context Markdown, raw skill/SOP/review artifacts, compact context, invoke
tools, authorize mutation, or appear when no attention signal exists.
Self-Evolution Scorecard, Project Design Plan, and Self-Evolution Iteration
are not resident context sections. Their historical commands are on-demand
diagnostics only. Active context keeps current Goal evidence, bounded
attention signals, selected capability contracts, and working continuity
instead of a recursive planning/proof packet.

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
After parsing, the harness assigns every action id; model-provided ids are not
persisted or used for dispatch lineage. If a model-action artifact later cannot
be read or no longer satisfies the envelope schema, Live Run Trace preserves
only its ref and replay marks it attention; it does not render the body or
parser details. The same rule applies to unreadable model-diagnostic artifacts:
trace and replay retain only their refs and explicit attention, never the
diagnostic body or read error.
`completion_claim.verification_refs` may cite only harness-known tool result ids
or tool artifact refs from the current run. Unknown or model-invented refs fail
completion verification and do not count as independent proof. When a run has
delegated context, unknown refs are persisted only as ordered `unbound_claim_ref_N`
markers, so the same failure remains replayable without retaining untrusted text.
Exact duplicate known refs are compacted in first-seen order before the delegated
model-action envelope and completion report are persisted, so one claimed identity
cannot inflate completion-check or replay lineage cardinality.
The envelope schema accepts at most 32 non-blank verification refs, each at most
512 characters; whitespace-only or padded refs are rejected rather than
normalizing ref identities, so model-provided completion metadata stays bounded before it can
reach completion reports, trace, or replay. The project-design general
delegation loop and delegation implementation contract expose the same shared
limits, including the non-empty requirement, so future slices do not need to infer
the runtime acceptance standard from schema code.
For a `done` claim, every harness tool result must also be successful: a failed
read-only, reversible, write, or run result is a failed `tool_result_outcomes`
check even when the model omits its ref. Replay recomputes this gate from bounded
tool-result event metadata; an event with unknown `ok` remains replay attention
rather than silently passing. Replay does not open tool-result artifact bodies.

`delegate_agent` is a bounded structured self-report path. The delegated model
has no tools or memory in the current runtime. The action payload must provide
non-empty `task` and `context` strings before the delegated model is called, and
`task` is capped at 1000 chars while `context` is capped at 12000 chars. The
shared literal contract lives in `packages/core/src/action_contracts.ts`; the
pure contract parser lives in `packages/core/src/delegate_agent_contract.ts`;
the pure delegated completion-gate checks live in
`packages/core/src/delegate_agent_completion_gate.ts`; the schemas, live runner,
Live Run Trace, harness replay checks, capability
catalog, context read models, and project-design read model derive their
limits, task/context authoring rules, failure-kind values, and delegated
completion-gate check ids from those sources instead of redeclaring them.
The model-facing Output Contract also renders its compact `delegate_agent`
payload example from the shared action contract and limits, so the example
cannot silently drift back to an under-specified task or context placeholder.
Completion verification report schema accepts only the shared harness check ids
plus those delegated completion-gate check ids, so drifted spellings are rejected
before they can enter history or trace read models.
`task` itself must explicitly request bounded analysis, critique, review,
inspection, comparison, summarization, or evaluation work: it cannot be a vague
task handoff. One concrete question requires a question mark, an English
interrogative such as `whether`, `what`, or `how`, or a supported Chinese
interrogative expression; incidental words such as `if`, `is`, or `do` do not
satisfy that boundary. The task cannot combine analysis with direct
fix/repair/update/edit/patch, imperative `write/create a patch`, commit/delete/remove/erase/unlink/drop/destroy/
push/merge/deploy/publish/release, Git push/merge/rebase/cherry-pick/reset/tag,
or pull-request creation intent even across sentence boundaries. Neither
`task` nor `context` can hide those boundary terms with Unicode format controls
or compatibility forms: the parser first applies NFKC normalization and removes
invisible format characters before the shared authority and mutation checks, so
obfuscated `f\u200bix` and `ｆｉｘ` are still rejected before delegated dispatch. Neither
`task` nor `context` may contain a control-plane instruction override or role
change such as ignoring or forgetting prior instructions or acting as the system/developer
role; this is rejected before dispatch even when the surrounding payload names
the normal bounded-analysis and no-authority constraints. A task cannot ask the delegated
subagent to run commands (including `git status`, `git log`, or `git diff`),
tests, builds, package-manager scripts, read files, search the repo, fetch
URLs, browse the web, or execute
tools, write or mutate state, decide completion, or schedule
expert/multi-agent work. A task may analyze whether explicit payload context or named
evidence shows a command, test, build, or script was already run; direct
requests include bare execution verbs such as `test the project`, `check the
build`, `lint the repository`, `read files`, `search the repo`, or `验证测试`,
and imperative patch-authoring or implementation requests such as `Write a
patch`, `Implement the fix`, or `实施修复`; all are rejected before dispatch,
in delegated context authority grants, and in delegated output. Conditional
implementation recommendations remain read-only advisory analysis.
The context must also
explicitly state that the delegated subagent has no tool, write, or mutation
authority, that completion remains with the main harness, and that the expected
delegated output shape is `summary` plus `findings_text`. It must also state
that delegated analysis may use only explicit payload context or named evidence
refs. Tasks or contexts
that omit, violate, or contradict those authority and output-shape boundaries
are rejected before any delegated model call; a context that says no delegated
authority and also grants destructive delete/remove/erase/unlink/drop/destroy,
Git commands (including read-only status/log/diff), pull-request creation,
tool/write/mutation, completion, expert scheduling,
multi-agent orchestration, model fan-out, hidden memory, raw delegated artifact,
unstated repo state, context expansion, or invented evidence-ref authority is
invalid. Concrete command or tool-surface grants such as `tsc`, `pnpm`,
`repo.search`, `command.run`, file reads, repo search, URL fetches, or web
browsing are rejected as command/tool authority grants even when the same
context also states a no-tool boundary. American and British
`authorized/authorised to` wording is normalized to the existing `allowed to`
boundary and rejected in both request context and delegated output before
persistence. The delegated
model must return a JSON object with non-empty `summary` and `findings_text`;
`summary` is capped at 240 chars and `findings_text` is
capped at 2000 chars. The fixed delegated-model instructions also repeat that
the subagent may use only the Task and Context text provided in the delegated
request, including named evidence refs already present there, and must return
exactly one strict JSON object with only `summary` and `findings_text`, with no
Markdown, code fence, wrapper prose, or extra keys. The payload is strict: `delegate_agent.payload` may contain only
`task` and `context`, so expert persona, model, tool, schedule, or authority
fields are rejected before any delegated model call. The harness validates those
contracts, rejects successful-looking outputs that echo raw delegated
`task`/`context` or claim delegated tool/write/mutation, destructive
delete/remove/erase/unlink/drop/destroy execution, Git command execution,
pull-request creation, completion, expert,
multi-agent, model fan-out, hidden memory, raw delegated artifact, unstated repo
state, context expansion, or invented evidence-ref authority.
Raw echo comparison applies Unicode NFKC and case normalization, removes
invisible format controls, and recognizes both ASCII and Chinese sentence
boundaries before matching. Compatibility characters, case changes,
zero-width separators, or copying one long Chinese sentence therefore cannot
disguise raw task/context text.
Natural-language delegated output execution assertions in active, third-person,
passive, or terse form that state was deleted, removed, erased, unlinked,
dropped, or destroyed,
tests, builds, commands, or checks were run or executed, or files were read,
the repo was searched, URLs were fetched, or the web was browsed, are treated
as delegated tool authority claims. Imperative execution, mutation, or read
directives such as `Run git push origin main now` or `Use repo.search now` are
also rejected before they reach the main-model observation; a conditional analysis recommendation that
leaves the decision with the main harness remains advisory. The harness sanitizes
successful delegated `summary` and `findings_text`, then persists only their
canonical JSON preview. Delegated task text is likewise omitted from result
artifacts: no `task` field is persisted, while `task_chars` and `input_digest`
preserve bounded lineage. Legacy artifacts with that field remain readable.
Model-response artifacts retain only bounded response metadata. Any model-action
envelope in a delegated run replaces action rationale and payload with fixed
markers, retaining only a `use_tool` name for trace matching, while
`delegated_action_inputs` records input validity, lengths, digest, action id,
and sequence. Live trace prefers that metadata and falls back to legacy payload
parsing only for historical envelopes. For modern metadata, replay requires
exactly one entry for each declared delegated action id and sequence; duplicate
or unpaired entries remain attention rather than being silently collapsed.
Replay likewise requires each declared delegated action to have exactly one
same-round dispatch; missing, unexpected, or duplicate dispatches remain
attention even when another dispatch check also observes the anomaly. Duplicate
declared delegated action ids are also attention: they make the persisted
action-id-to-sequence map ambiguous rather than silently satisfying coverage.
It never persists the original
delegated model text. Any delegated output contract failure records a safe suppression marker
rather than a raw-output fallback. The live runner allows at most one
`delegate_agent` action per model
round; extra delegate actions are recorded as failed delegated results without
calling the delegated model. Invalid payloads, delegated model request
failures, malformed delegated output, over-limit delegated output, raw
task/context echoes, delegated output authority/source claims, or over-limit
delegate action counts are recorded as
`ok=false`; delegated model request failure messages and contract-failure
previews are sanitized before they are persisted or returned as observations.
Full delegated outputs are scanned before strict full JSON-object parsing;
wrapper prose or code fences around otherwise valid JSON remain malformed
delegated output, delegated output may only include `summary` and
`findings_text`, and every delegated output contract failure records a safe
suppression marker rather than raw delegated model text. Delegated
dispatch metadata also records the model-action `envelope_ref` that declared
the delegated action, and
Live Run Trace exposes the declaring round's safe `delegate_agent` action ids
plus an `action_id -> sequence` map, so trace and replay can audit lineage from
the model round, action id, and declared delegate order to the delegated result
without reading delegated artifact bodies or granting delegated completion
authority. Missing or mismatched envelope refs, dispatch action ids not declared
by the round envelope, or dispatch sequences that do not match the declared
delegate action order are replay warnings, not permission to infer hidden
context. A delegated dispatch records the exact delegated result id beside its
persisted JSON artifact ref. Missing or duplicate result ids or refs
are replay warnings;
replay may cite the bounded event id, but
it must not infer or reconstruct the missing delegated artifact body. Live Run
Trace exposes missing-result-id and missing-result-ref counts as bounded metadata
so context surfaces can show the evidence gap without reading the artifact body. Replay
also requires `ok=true` to pair with `contract_status=passed` and `ok=false` to
pair with `contract_status=failed`; either contradictory tuple is a metadata
warning, while runner-authored failed-delegation recovery semantics remain
derived from `ok`. Replay compares `claimed_verification_refs` with event-owned
delegated result ids and refs; a verified trace that claims either exact
identity as completion proof fails `verification_evidence_lineage` even if the
delegated completion-gate check was omitted or drifted. Report-declared refs
remain coverage metadata, not replay identity authority. Replay also compares
the `delegated_results` check refs with event-owned result ids and independently
bound failed-delegation recovery refs; any extra ref is bounded replay attention
instead of accepted recovery evidence.
Dispatch-layer rejects also carry a safe
`dispatch_failure_kind` such as `dispatch_limit_exceeded`,
`input_contract_failed`, `terminal_completion_claim`, or `terminal_response_action`; successful dispatches or delegated-model contract
failures record `dispatch_failure_kind=none` explicitly. This means no
dispatch-layer failure, not delegated success, so trace/replay read models can
distinguish a real none value from an older or malformed summary that omitted
the field. Delegated dispatch metadata also records `model_invoked`: input
contract, terminal-completion, terminal-response, and per-round-limit rejects must keep `model_invoked=false`, while
post-dispatch results, including delegated output contract failures and
delegated model request failures, must keep `model_invoked=true`. Replay warns
when that boundary is missing or contradicted. It also requires
`terminal_completion_claim` to refer to a terminal round and a valid in-limit
delegated action in that round to carry that failure kind. Likewise,
`terminal_response_action` must refer to a non-terminal round containing
`respond`, and a valid in-limit delegated action in that round must carry that
failure kind, without reading delegated artifact bodies. New dispatches
additionally persist the shared parse-derived input
validity, normalized task/context character counts, and a SHA-256 input digest.
Live Run Trace re-derives that bounded tuple from the declaring envelope; replay
warns when modern event metadata mismatches it and keeps historical missing input
metadata unknown. It never renders raw task/context text, and incomplete input
lineage cannot satisfy a delegated completion gate. Every failed delegated result also carries a
safe `result_failure_kind`: dispatch rejects mirror the dispatch failure kind,
delegated output contract failures record `delegated_output_contract_failed`,
and delegated model request failures record `delegated_model_request_failed`.
The sanitized observation fed back to the main harness preserves the bounded
typed result summary instead of rewriting every failure as contract validation;
raw task, context, output text, preview, and artifact bodies remain excluded.
Pre-dispatch rejects use fixed bounded summaries for
`dispatch_limit_exceeded`, `input_contract_failed`,
`terminal_completion_claim`, and `terminal_response_action`; detailed
validation text remains separate in the sanitized error field and cannot make
the summary exceed its limit or misstate the typed failure kind.
Passed delegated results record `result_failure_kind=none`; persisted delegated
results and model observations use explicit `none` values instead of `null` for
no-failure kinds. New runner result and observation records reject contradictory
`ok`, `contract_status`, `model_invoked`, and failure-kind tuples at the schema
boundary. The same schemas reuse the shared output contract and reject blank or
over-limit summaries and over-limit non-null findings before persistence or
main-model observation; replay remains able to warn on malformed historical
event metadata.
Replay audit treats the pair as a semantic contract too:
dispatch-layer result failures must mirror `dispatch_failure_kind`, delegated
output/model failures must keep `dispatch_failure_kind=none`, and passed
delegated results must use explicit `none` for both layers. A later `done` claim
fails completion verification when any delegated result failed and no later
main-harness write/run recovery evidence exists. Even when later main-harness
recovery evidence exists, the failed delegated result remains a warning and the
done claim still needs a bound non-delegated verification ref as independent
completion proof. A passed delegated result
remains an advisory self-report: it can inform the next model round, but its
exact result id or persisted delegated result state ref must not be used as
`completion_claim.verification_refs` proof. Substring lookalikes are treated as
unbound claimed refs, not delegated proof. If a `done` claim follows any
delegated result, completion verification also requires later independent
evidence recorded after the latest delegated result: at least one harness-known
non-delegated verification ref bound through `completion_claim.verification_refs`;
a successful write/run tool result is completion proof only when the done claim
cites its harness-known ref. If any delegated result failed, completion requires
both later successful write/run recovery evidence cited by the done claim as a
tool result id or tool artifact ref and a bound non-delegated verification ref
after the failed delegated result; an uncited write/run result and later
read-only refs are context only. Completion-gate helper outputs compact exact
duplicate ref identities while preserving first-seen order, so one delegated,
independent, or recovery evidence identity cannot inflate check cardinality.
Every sanitized failed-delegation observation
tells the main model these exact recovery prerequisites or to report blocked;
no failure kind may imply that read-only verification alone recovers it. The
shared `delegate_agent` payload instruction states the same prerequisites
before the main model proposes a delegated action.
Delegated dispatch metadata records only
`recovery_guidance=main_harness_recovery` for a failed result (or `none` for a
passed result), never the recovery-hint text; replay warns when a failed
dispatch lacks that safe marker or records an inconsistent value.
When a later main-model request occurs, its model-action event records only the
prior delegated result ids and the subset requiring recovery guidance. Trace
and replay compare those safe ids with earlier dispatches; they never retain or
read model input, delegated task/context, output, or recovery-hint text.
Each model-action envelope must have exactly one model-action event, and that
event may reference only that envelope, before its input metadata is trusted;
replay warns on duplicate or multi-envelope bindings rather than silently
selecting one event. New model-action events also retain only that envelope ref
and a SHA-256 digest of its persisted JSON; replay warns if the ref or digest
does not match the selected envelope, without reading or rendering its action
payload.
The trace inventories persisted envelopes for the current session as well as
event refs, so an interrupted write-to-event handoff remains visible as a
zero-event round instead of being omitted from replay.
Cross-session action-envelope refs are excluded from the current trace and
reported as bounded replay attention; replay also records when another session's
model-action event binds a current-session envelope, and that foreign binding
cannot hide an interrupted current-session zero-event round or make input
metadata trusted.
Cross-session delegated-result refs are likewise excluded from current-turn
result references and cannot become completion evidence. Both cross-session
signals remain in the check-specific and report-wide safe ref inventories, so
later bounded context can retain the identity alert without reading artifact
bodies.
The reusable project-design delegation contract projects that same shared
requirement unchanged for later core-runtime planning.
The core capability catalog carries it unchanged for bounded operator context.
The final response artifact alone is not independent completion proof. The live
runner rejects model envelopes with more than one `respond` action, so
new final-response evidence events bind that artifact to the only `respond`
action through optional structured metadata: stable
`response_ref`, action id, final envelope ref, round, and sequence among
`respond` actions. For a final `done` envelope, Live Run Trace derives the same
respond-action expectation from the parsed envelope and exposes only identity,
event ordering, artifact membership, file presence, and completion-check
metadata. Replay is clean only when exactly one modern event matches the final
envelope/action, the stable `memory/episodes/<session_id>-final-response.md`
file exists, and exactly one passing `final_response` check cites that ref.
Legacy response events without structured metadata remain attention; partial,
duplicate, missing, or mismatched modern lineage fails a verified done claim.
No final-response body, payload, or content hash is read, and no historical
migration or response regeneration is implied.
Non-`done` runs still record a bounded
`delegated_results` warning when any delegated result failed, so Live Run Trace
and replay audit can show the failure without changing skipped completion
verification into a completed claim. Delegated results are recorded with action id, round, sequence, task/context character
counts, dispatch failure kind, and result failure kind so later traces can
verify bounded dispatch and failure recovery inputs from harness-owned
delegated event summaries without reading raw delegated context or delegated
result bodies. New delegated dispatch metadata carries the exact `result_id`
and persisted `result_ref` explicitly; trace and replay keep the older
delegated-result artifact fallback only for historical evidence compatibility,
and historical events without `result_id` remain readable with replay attention. Trace and replay
audit JSON preserve the complete delegated dispatch metadata set for counting
and coverage. They also preserve bounded delegated completion-gate check
metadata from the completion report:
check id, status, summary, and refs across pass/warning/fail outcomes, without
treating delegated output as completion proof. Operator Markdown/context
views may cap the rendered lists and show an omitted count. Failed delegated
results can only guide a later main-harness model round as sanitized
observation; recovery still requires later main-harness write/run evidence and
independent verification evidence. State-only harness/governance actions,
including `record_evidence`, `update_working_state`, `not_done` `propose_sop`,
`propose_memory`, `request_audit`, and `pause_autonomy`, do not count as
failed-delegation recovery evidence. Bound read-only tool refs can be
independent context for a done claim, but they do not recover the failed
delegation; only later successful write/run tool results do. Recovery must not
add automatic retry, model fan-out, expert scheduling, delegated completion, or
raw delegated artifact reads.
Replay treats the final model-action envelope's `completion_claim.status` as
the authority for the completion tuple and every done-only delegated gate.
Live Run Trace exposes the report status, final envelope status, final-status
presence, and their match as bounded metadata. A final non-`done` status that
contradicts a verified report is definitive replay drift; a conservative report
downgrade remains attention, and a missing final status remains unknown rather
than falling back to a clean report claim.
Completion verification reports preserve bounded `verification_evidence_refs`
for harness-known successful tool result ids and tool artifact refs. Each entry
records only lineage metadata: source, tool result id, artifact ref, event id,
round, tool name, side-effect level, write/run flag, claimed flag, and whether
the ref counted as post-delegation independent evidence or failed-delegation
recovery evidence. Only a claimed successful write/run tool result id or tool
artifact ref can carry the failed-delegation recovery marker. State-only harness
actions and delegated result refs are not written into this proof lineage. Live
Run Trace and harness replay can audit this metadata without opening raw tool
bodies, delegated artifacts, or final responses. Replay first binds each entry
identity to its declared source: a `tool_result` entry ref must equal
`tool_result_id`, and a `tool_artifact` entry ref must equal `artifact_ref`.
Each `(tool_result_id, artifact_ref)` pair must contain exactly one entry from
each source, and both entries must agree on event, round, tool, result status,
side-effect level, write/run status, and delegation-relative position. Replay
also requires the pair's event id to bind exactly one same-run bounded
`tool_result` event, requires that event to carry the pair's artifact ref, and
requires the persisted evidence round to match the event's model-action round.
The trace exposes only the tool-result event id, derived round, and artifact
refs for this check, never the raw tool body.
Modern tool-result event metadata also records the declaring action id,
envelope ref, round, and sequence among `use_tool` actions. The trace derives
the same bounded expectations from parsed envelopes, and replay requires one
unique match with the same tool before evidence can satisfy completion or
failed-delegation recovery. Missing legacy action lineage remains unknown and
attention; partial, mismatched, or duplicate modern lineage cannot replay
clean. No payload, result body, or artifact body is read for this check.
Replay then recomputes each
delegation-relative flag from the event-bound evidence round and the latest
delegated or failed delegated dispatch round rather than trusting the persisted
booleans. It also requires every lineage `claimed` flag to agree with
exact membership in the top-level `claimed_verification_refs` set. It then recomputes the
independent marker invariant and reports lineage attention when a marked ref is
unclaimed, absent from the done claim, failed, or not after the latest
delegation. It separately recomputes the recovery marker invariant and reports
attention when a marked ref also is not write/run, not after the latest failed
delegation, or is present without a failed delegated result.
If a delegated result failed and the run does not reach verified `done`
completion, any `propose_sop` action remains state-only and must not enter live
SOP audit, SOP promotion, skill promotion, or active-vault writes.
The project-design read model mirrors this same runner/replay boundary in
`next_core_basic_plan.general_delegation_loop`: `lifecycle_steps` names the
harness-owned flow from `validate_task_context` through
`verify_main_harness_completion`, `runner_enforcement_contract`
names the live runner instruction, input, result, and completion-gate rules,
`result_failure_kind_contract` and `recovery_contract` name the bounded failure
and recovery rules, while `replay_audit_contract` names the safe metadata
source, required dispatch fields, audit checks, lineage checks, and proof
boundary. Those fields are read-only planning context; they do not spawn
subagents, grant tool access, schedule experts, or prove completion.
Replay ref coverage is bidirectional: dispatch result refs missing from the
completion report and completion-report `delegated_result_refs` missing from
delegated dispatch metadata both remain attention items, without opening raw
delegated artifacts.
The main-model observation also excludes raw
delegated task/context, raw output preview, and persisted artifact bodies. They
are not tool evidence, final success proof, mutation authority,
retry/failover authority, or a second autonomous agent runtime.

Every live run writes a harness-owned completion verification report beside the
episode context and model artifacts:

```text
memory/episodes/<session>-completion-verification.json
memory/episodes/<session>-completion-verification.md
```

The report records the model `completion_claim`, final response ref, claimed
verification refs, selected observation refs, structured verification evidence
lineage, and per-check pass/fail/warning status. A final response artifact is
written only from a non-empty `respond.payload.markdown` or
`respond.payload.text`; an empty, whitespace-only, or structured-only payload
does not become a fake response artifact. A `done` claim fails verification
when required final response or
write/run/delegation evidence is missing or failed, or when delegated self-report
refs are used as verification proof. A `done` claim also fails when claimed refs
are not bound to harness-known tool result ids or tool artifact refs from the
current run. `not_done` and `blocked` claims are recorded as skipped completion
verification, not as completed work, while still surfacing delegated-result
warnings for trace and replay visibility.
Later context may summarize recent reports, but must not read the referenced
raw response/tool artifacts or treat prior verification as proof for the current
task.
When model cognition fails before a valid action envelope exists, the harness
writes `memory/episodes/<session>-model-diagnostic-r<round>.json` and appends a
`model_diagnostic` evidence event. The diagnostic records only failure stage,
failure kind, sanitized previews, model/config metadata, context refs, response
ref when one exists, and input size metadata. It is observability for operators
and later SOP/backlog work; the diagnostic itself is not retry authority,
failover policy, or completion proof.

The OpenAI-compatible model client may retry one request that fails with HTTP
408, 409, 429, a 5xx response, a transport timeout, or a bounded network error.
The text-model `timeout_ms` defaults to 120000. A recovered response records
`request_attempts` and generic `recovered_request_failures` in bounded response
metadata; raw provider errors remain unpersisted. Authentication, billing,
schema, and other non-transient failures are not retried. Separately, the main
live harness may run one additional model round after an invalid
`ModelActionEnvelope`. The failed round persists its diagnostic and blocked
envelope, executes no proposed action, and adds only harness-owned format
guidance to the next input. A later valid envelope must still satisfy ordinary
tool-evidence and completion verification gates; recovery never turns the
failed output itself into evidence or grants tool, write, publication, or
completion authority.

New `model_diagnostic` events retain only the diagnostic ref and a SHA-256
digest of its persisted JSON. Live Run Trace and replay compare those values
without rendering the diagnostic body; a partial modern migration or a ref/hash
mismatch remains attention, while fully historical events without this metadata
remain unknown rather than becoming a new warning.
Diagnostic refs from another session are excluded from the current trace and
reported as bounded replay attention; their bodies are never read as current
run evidence.
Tool-result artifact refs from another session are likewise excluded from
current-run evidence and reported as bounded replay attention without reading
their bodies.
Prompt context refs from another session are not selected as the current
trace context and are reported as bounded replay attention without reading
their bodies.
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
harness state-action counts, safe delegated dispatch metadata including
`model_invoked` and `dispatch_failure_kind`, model diagnostic
failure kind/stage/refs, repo-write workspace guard summaries from bounded
tool-result event summaries, bounded tool-result event/result ids, tool,
success state, side-effect class, write/run flag, round, and artifact refs,
and envelope refs. It must not read raw model
responses, action payloads, tool result bodies, delegated task, context,
findings, output, raw preview, final response Markdown, context Markdown, or
harness artifact bodies, and it must not rerun actions, invoke the model,
request confirmations, execute follow-ups, mutate state, write the repo, or
write the active vault.

Operators may turn one bounded live run trace into a state-only harness replay
audit with `review replay-audit --trace <ref-or-id>`. If no trace is selected,
the command chooses the latest bounded live run trace. The command writes
`governance/replays/<id>.json`, `governance/replays/<id>.md`, and one
`audit_result` evidence event that cites the replay report and source trace.
The audit records only replay metadata: source trace refs, completion/session/
turn ids, per-round action counts, safe delegated action ids, safe delegated
dispatch metadata, check statuses, report-declared delegated result refs,
`delegated_result_event_fallback_refs`, and the fixed replay boundary.
Unreadable or schema-invalid model-action artifacts remain visible through their
refs as replay attention rather than being silently treated as absent rounds;
their raw bodies and parser details remain out of the read model.
Unreadable model-diagnostic artifacts follow the same safe-ref rule and are not
silently rendered as an `unknown` diagnostic.
Replay recomputes the expected `verification_status` and `verified` tuple from
the final model-action envelope's `completion_claim.status` plus the bounded
failed-check ids: non-`done` completion
must be `skipped/false`, `done` with any failed check must be `failed/false`,
and `done` without failed checks must be `passed/true`. A report that claims a
passed or verified completion while contradicting those inputs fails replay;
consistent failed or skipped completion remains attention rather than clean.
Replay also independently derives the expected `delegated_results` gate status
from bounded delegated result counts, `ok=false` dispatch rounds, final-envelope
completion status, and later claimed successful write/run evidence uniquely
bound to its tool-result event, artifact, and round. Incomplete dispatch metadata remains
attention instead of being guessed as pass. An independently expected failure
always remains a replay failure; a report-declared pass that hides an expected
warning also fails, while other status mismatches remain attention. Replay also
derives the expected done-only `delegated_self_report_refs` status from exact
event-owned result ids and refs. Exact claims fail even when the completion report says
pass; substring lookalikes do not count as delegated identity claims, and
historical dispatches with missing or duplicate result ids remain unknown/attention. This
aggregate parity check does not read delegated artifact bodies or trust
report-owned delegated refs as its identity authority.
For `done`, replay also derives the expected `claimed_refs_bound_to_evidence`
status instead of treating the reported per-check status as authority. It
removes exact event-owned delegated result identities, then accepts a remaining
claimed ref only when its result/artifact lineage pair has matching bounded
metadata and uniquely binds the same-run tool-result event, event-owned result
identity, success state, tool, side-effect class, artifact, and round. Any
unbound non-delegated claim is an expected failure, a non-empty fully
bound set passes, and no non-delegated claim is skipped. Missing legacy
`verification_evidence_refs` metadata, historical tool-result events without
the bounded identity/success metadata, incomplete delegated identity metadata,
or duplicate/missing reported checks remain unknown/attention rather than being
guessed clean. A forged report pass cannot hide an independently expected fail;
other parity drift remains attention. Replay does not read tool artifact bodies
or migrate historical reports.
Replay also derives the expected `delegated_independent_evidence` status from
the same event-bound lineage instead of trusting its reported status or
report-owned delegation-relative flags. A `done` trace without delegation is
`skipped`. A passed delegation requires at least one claimed ordinary evidence
ref whose successful tool-result event round is strictly after the latest
delegated dispatch. A failed delegation additionally requires both later
ordinary verification and a claimed successful write/run recovery ref whose
event round is strictly after the latest failed dispatch. Pre-delegation,
unclaimed, unbound, failed, or read-only recovery refs cannot satisfy the gate.
An independently expected failure remains a replay failure even if the report
forges `pass`; a report downgrade of a valid expected pass remains attention.
Relevant legacy traces without the bounded event metadata remain
unknown/attention, and non-`done` completion must contain no instance of this
check. This parity check reads bounded metadata only and performs no migration.
The persisted final model-action envelope, not the completion report, is the
authority for `completion_claim.verification_refs`. Trace exposes those refs as
bounded metadata and replay compares the report copy against them. Replay then
recomputes the expected independent marker for every claimed, event-bound
successful ref after the latest delegation (or every claimed event-bound ref
when no delegation exists), and the expected recovery marker for claimed
event-bound write/run refs after the latest failed delegation. Report-owned
claim refs, gate statuses, and `counts_as_independent_evidence` /
`counts_as_failed_delegation_recovery` only participate in parity checks. A
forged positive marker is definitive drift and fails a verified trace; a
conservative false marker remains attention. Non-`done` reports still receive
marker parity checks because marker metadata is written independently of the
completion gate, but they do not require a done-only independent gate or
recovery. Missing final-envelope or relevant historical event metadata remains
unknown/attention. No raw envelope response, tool body, or artifact body is
rendered, and no historical state is migrated.
It also checks whether
per-round `delegate_agent` action counts are covered by delegated result events,
whether delegated dispatch result refs are explicitly carried by the completion
report `delegated_result_refs` field instead of only recovered from event
fallback, whether delegated result events have matching dispatch metadata and
action ids declared by their round envelope, whether dispatch metadata points
to a missing model-action round or to a round without `delegate_agent` actions,
whether completion proof claims cite report-declared delegated refs or
event-fallback delegated refs, and whether
over-limit delegated dispatches carry bounded `dispatch_failure_kind` coverage such as
`dispatch_limit_exceeded`; it also warns when a delegated dispatch summary
omits the field instead of explicitly recording `none`. Replay also checks
`model_invoked` coverage, warning when pre-model rejects claim model invocation
or post-dispatch results claim no model invocation. It also checks
`result_failure_kind` coverage for every delegated result summary, including
passed results that should record `result_failure_kind=none`, and warns when a
trace carries legal but semantically mismatched dispatch/result failure kinds,
or shows more than one active-looking delegate dispatch in the same model
round. Delegated completion-gate checks preserve failed completion checks as
`fail` in replay audit checks, while the top-level replay report remains
`attention` for any non-pass check. It must not invoke the model, execute tools, rerun
actions, read raw model responses, read raw action payloads, read raw
tool/delegation bodies, read raw final responses, read context Markdown, write
the repo, write the active vault, manage services, or mutate
SOP/skill/semantic-memory artifacts.

Operators may inspect replay audit history with `review replays` and
`review replays --replay <ref-or-id>`. Feishu mirrors this read-only surface
through `/review replays` and `/review replay <ref-or-id>`. Context and
aggregate governance status may render bounded replay summaries and latest refs
only. `governance act-next` may record a bounded replay action with replay refs
plus fail/warning check counts, but not raw artifact bodies. These read models
must not rerun traces, invoke the model, execute tools, write state, write the
repo, or write the active vault.

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
promotion path applies. Skipped, blocked, or otherwise unverified completion
reports, including reports that carry failed delegated result warnings, do not
enter SOP audit, SOP promotion, skill promotion, or active-vault writes.

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

The runtime meaning of dream is a versioned, same-state-root direction
projection. It converts accepted facts and verified iteration outcomes into
bounded axes, horizons, non-goals, source refs, and next-move candidates. It is
not raw recall, durable identity, procedural memory, a hidden reasoning trace,
or an execution scheduler. The newest dream is current only when its embedded
verified outcome ref, status, and `recorded_at` match the latest verified
iteration outcome available in the same state root. Otherwise read models must
report stale or missing lineage and render the explicit `memory dream` refresh
command; they must not silently refresh, reconcile state roots, or claim the
snapshot contains the latest verified direction.

Its design goal is to compress verified runtime evidence into traceable,
comparable, and rejectable long-horizon direction candidates: what capability
to deepen, what risk to hold, and what work to defer. External implementations
may inform mechanisms, but they are references, not the acceptance standard.
The runtime accepts a dream direction only by local
evidence lineage, measurable core/basic capability value, reversibility, and
operator-owned authority boundaries. Dream therefore proposes future focus; it
does not acquire background execution, permission expansion, publication,
identity mutation, or promotion authority.

`memory archives` is a read-only view over `memory/archives/*.json`. It may
list daily episode archive summaries or inspect one archive by date or state
ref. It must not generate archive files, rebuild MemoryStore indexes, read raw
episode artifacts, write durable memory, write state, write the active vault,
or invoke the model. `memory archive` remains the explicit CLI command that
scans `memory/episodes/events.jsonl` and writes daily archive summaries.

`memory archive-health` is a read-only archive readiness view. It may compare
`memory/episodes/events.jsonl` row metadata with `memory/archives/*.json`
summary metadata and report missing, stale, invalid, or orphan summaries. It
reports the current UTC date as an open day: missing or lagging derived archive
metadata stays visible through `open_day`, but does not become a freshness issue
until that UTC day closes. Invalid event or archive metadata remains an error.
It must not read raw episode artifacts, generate archive files, rebuild
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
Memory-layer health, current selected-skill backlog items, and drift summaries
must distinguish current unresolved attention from retained history. The newest
outcome for each skill owns current health: a verified done/passed outcome
closes older attention, while a newest attention outcome remains active.
Repeated drift counts only the consecutive attention streak after the most
recent verified pass. Recovery never deletes or rewrites historical telemetry.

## Tool Contracts

Common result audit policy:

- every core tool call returns a bounded `tool_result` object
- failed core tool calls include a bounded `output.failure_kind` such as
  `invalid_request`, `runtime_state_path`, `protected_path`, `http_status`,
  `fetch_error`, `search_error`, `timeout`, `spawn_error`, `nonzero_exit`, or
  `unsupported_tool`
- StageRunner synthetic blocked tool observations also include
  `output.failure_kind`, such as `tool_not_allowed` or
  `tool_call_limit_exceeded`, and are persisted as bounded `tool_result`
  evidence without executing the blocked tool
- result metadata must make output budgets and truncation visible where output
  can be large
- command-like tools must expose effective timeout, output cap, cwd boundary,
  exit status, and side-effect level
- HTTP/search/read-like tools must expose bounded status, scope, count, size, or
  truncation metadata appropriate to the tool
- audit metadata is evidence substrate only; it must not render unbounded raw
  output, expose secrets, rerun tools, or prove completion without verification
  claim coverage

### `file.read`

Reads text from repo or state scope by relative path. The default remains a
bounded prefix read from line 1. Callers may provide a one-based `start_line`
and bounded `max_lines` to read a deep source window directly after a
`repo.search` hit.

Required policy:

- reject absolute paths
- reject `..`
- for `repo` scope, reject repo-local runtime state paths such as `.runtime/`,
  `.runtime-*`, `.runtime_*`, and `.local-runtime*`; use `state` scope for the
  selected state root instead
- accept only positive integer `start_line <= 1000000`,
  `max_lines <= 400`, and `max_chars <= 50000`; defaults are line 1, 200
  lines, and 12000 characters
- stream the selected file and stop at the first line or character bound rather
  than loading an arbitrarily large file into memory
- stop with `scan_limit_exceeded` after 4 MiB of decoded-window scanning, even
  when the requested `start_line` has not been reached
- count complete Unicode code points; treat CRLF as one logical newline token,
  and never return a split code point or a dangling carriage return
- preserve full-line continuation when a later line would cross the character
  bound; if the first selected line alone crosses it, return the bounded prefix
  and mark `line_truncated=true`, `has_more=true`, and
  `next_start_line=null` because a line-only cursor cannot recover its tail
- return `start_line`, nullable `end_line`, `truncated`, nullable
  `truncation_reason`, `line_truncated`, `has_more`, nullable
  `next_start_line`, `chars_returned`, `scanned_bytes`, and
  `max_scan_bytes` beside the bounded text
- fail explicitly for a missing or non-file path instead of reporting an empty
  successful read
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
- block repo-local runtime state paths such as `.runtime/`, `.runtime-*`,
  `.runtime_*`, and `.local-runtime*`; runtime artifacts must go through
  `file.write_state` or explicit state-root commands
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
- when `rg` is unavailable, fail closed with typed `search_error` evidence
  rather than emulate a second glob/search engine inside the runtime
- reject searches rooted inside repo-local runtime state paths such as
  `.runtime/`, `.runtime-*`, `.runtime_*`, and `.local-runtime*`
- exclude repo-local runtime state paths from broad repo searches
- cap result count and output chars
- allow include/exclude globs
- side effect: `none`

### `http.fetch`

Fetches HTTP(S) content.

Required policy:

- require `http://` or `https://`
- cap response size
- timeout
- record status and URL
- return bounded timeout or fetch-failure metadata instead of throwing through
  the harness
- side effect: `none`

### `command.run`

Runs bounded local commands.

Required policy:

- explicit cwd: repo root or state root
- timeout
- max output chars
- environment allowlist
- side-effect label declared before execution
- bounded purpose: ordinary execution or verification. Purpose never grants
  execution authority and cannot override EffectPolicy
- verification purpose requires the repo cwd, process success, and unchanged
  harness-owned pre/post Git HEAD plus bounded semantic-index and
  tracked/untracked content fingerprints. Missing, unsupported, over-limit, or
  changed snapshots fail the verification and expose newly observed typed
  paths/commit where available. The strict snapshots survive diagnostic output
  truncation and are rechecked during event replay
- command and exit code recorded as evidence

`command.run` is how the agent should run `pnpm run check`, `rg`, `git diff
--check`, and local scripts.

### `workspace.prepare`

Prepares one lazy Goal-bound isolated linked worktree for later repo-scoped
actions and delegated execution. It is a placement capability, not a task
router, VCS control plane, or delivery workflow.

Required policy:

- require GoalRuntime execution context; standalone calls fail closed
- accept only the strict `branch` and `base_commit` fields; unknown fields are
  denied before dispatch
- accept only a fresh `codex/issue-N-slug` branch and the exact immutable
  control-authority start HEAD as `base_commit`; current control HEAD must still
  equal that start HEAD at preparation time
- require the control authority to be a clean, unchanged main checkout and the
  target `.worktrees/<branch-basename>` path to be Git-ignored and absent
- atomically acquire the fresh branch, reserve the derived path, create the
  registered linked worktree, then live-validate repository root, exact derived
  worktree path, Git common directory, branch, and base
- return one typed `execution_workspace`; GoalRuntime derives it only from the
  successful canonical observation and rejects a second preparation
- on preparation failure, remove only a path and branch whose ownership was
  acquired by that attempt; preserve concurrent artifacts and report incomplete
  rollback instead of swallowing cleanup errors
- do not mutate the state root, create a workspace registry, choose a task
  class, run Codex, commit, push, merge, deploy, or claim completion
- semantic effect: reversible `prepare_local_workspace`; malformed shapes are
  denied before dispatch

### `codex.run`

Runs one typed Codex CLI coding execution as an independent core tool above
generic `command.run`; it is not an arbitrary command or argument passthrough.

Required policy:

- require every new request to record model and reasoning selection. Ordinary
  GoalRuntime delegation uses explicit `auto` for both, which delegates
  provider-specific resolution to the named Codex profile and omits the model
  and reasoning CLI overrides. The Goal-owned authority seam rejects a pinned
  new request or persisted pinned resume before action planning or dispatch;
  it must start a new auto-selected thread. Evidence-backed standalone
  harnesses may still pin a safe model token and one bounded reasoning effort
  (`minimal|low|medium|high|xhigh`). Keep profile `fast`, service tier `fast`,
  sandbox `read-only` or `workspace-write`, and approval `never` explicit or
  allowlisted
- require bounded `selection_rationale`, `task_shape`, and an immutable
  delegation strategy: `single` with zero subagents and no workstreams, or
  `parallel` with two to three subagents, two to the declared maximum unique
  independent workstreams, and `main_codex_thread` as integration owner
- live-validate a registered sibling isolated worktree under the configured Git
  common directory, together with its repository root, base, branch, and cwd;
  reject non-repositories, other common directories, unregistered worktrees,
  main checkouts, and drift
- bind execution authority, selection, delegation strategy, mode, thread
  handle, original-user/effective-prompt digests, output-schema digest, and
  timeout/output-capture/context/tool/retry budgets in an immutable v2 digest
- construct allowlisted argv without shell concatenation; prohibit
  danger-full-access, bypass flags, add-dir, and search
- support one bounded `new` execution or `resume <thread-id>` bound to the same
  authority snapshot, without another worktree, scheduler, or automatic retry;
  standalone resume inherits recorded `auto` or explicit selection and
  strategy and rejects any re-submitted drift; GoalRuntime resumes only an
  auto-selected thread
- for a parallel strategy, inject a bounded supervision block naming the
  subagent maximum, independent workstreams, exclusive integration owner, and
  evidence boundary; count one slot for the first `started` or `completed` JSONL
  observation of each unique attributable `spawn_agent` `item_id`; a later
  `completed` observation for that same item replaces its `started` evidence
  without increasing the count; stop only when unique item IDs exceed immutable
  `max_subagents`
- continue consuming and validating JSONL after the output-capture retention
  limit is reached; retain only bounded event-summary/redacted-diagnostic
  prefix and suffix evidence, and record observed, retained, truncated, and
  effective-limit metadata
- parse the terminal strict structured `done|blocked|failed` output separately
  from diagnostic retention; spawn, nonzero exit, timeout, tool-call budget,
  invalid JSONL, missing or mismatched thread authority, invalid schema, or
  absent/invalid structured output failures cannot claim completion
- on POSIX, run in an independent process group and clean up the whole group
  with TERM followed by bounded KILL
- derive tracked and untracked changed paths from fixed live pre/post Git
  status evidence and derive commit identity from fixed pre/post HEAD evidence;
  fail the execution result when the post-run snapshot is
  unavailable; expose those paths as canonical plural `workspace_path` changes
  even when Codex fails after mutation, and expose the post-run `git_commit`
  identity when HEAD changed even if both status snapshots are clean
- compare the observed introduced paths with structured `changed_files` and
  retain matched, missing, and unobserved-claim diagnostics; the structured
  list is model self-report and never grants change authority
- reuse tool-result/episode metadata to record selection, requested plan,
  capture, tool-call and timeout facts, structured result, both prompt digests,
  and authority verifiability; requested workstreams and model self-report are
  not subagent evidence, so record subagent facts only from attributable Codex
  JSONL `collab_tool_call` events
- side effect: `local_write`

`codex.run` returns execution evidence only. Review, independent diff and test
verification, permissions, commit, pull request, merge, deploy, and completion
authority remain exclusively with `main_harness`. The tool is strictly separate
from advisory-only `delegate_agent` and does not change its payload, result,
tool, write, or completion authority.

`max_output_chars` is an evidence/diagnostic retention limit, not a process
termination budget. An explicit caller value wins. When omitted for a new run,
the runtime derives it from the active model's configured `max_output_tokens`
through the typed tool-execution context; direct callers without model config
use the existing context-budget fallback. For output-capture migration,
`process.output_budget_exceeded` remains present as `false`; consumers should
use `process.output_capture.truncated` and its observed/retained/effective-limit
fields instead. Version-1 thread snapshots predate immutable selection,
strategy, and dual prompt digests, so resume rejects them fail-closed and the
caller must start a new bounded request. The one-time verified selection
`gpt-5.6-sol` / `xhigh` / `fast` profile and tier is current compatibility
evidence, not a compile-time singleton or future default. `auto` does not read
or snapshot a Desktop-owned model cache, retry another model, or weaken
selection provenance: the immutable authority records that the named Codex
profile owns resolution for the thread.
Historical explicit v2 thread records remain parseable and resumable through
the standalone harness. GoalRuntime does not inherit their provider pin; it
starts a new auto-selected thread under the same Goal repository authority.

### `code.execute_node`

Runs bounded JavaScript snippets in the state root.

Required policy:

- timeout
- max output chars
- state-root cwd
- minimal runtime environment only; no arbitrary parent environment passthrough
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
- read-only resident service runtime status from `services/runtime/heartbeat.json`
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

Self-Evolution Scorecard, Project Design Plan, and Self-Evolution Iteration are
not resident context sections. Their legacy diagnostics remain explicit,
on-demand commands only while staged retirement is measured. Active Goal
evidence and the bounded Prior Tool Experience projection affect current
cognition without injecting those proof-oriented read models.

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
agent-runtime-style L4 archive orientation layer and an OpenClaw-style bounded context
summary without model compaction. Context assembly may read only
`memory/archives/*.json` archive summaries. It must not read raw episode
artifacts, rebuild the SQLite index, write archives, invoke the model
recursively, or treat an archive summary as durable semantic memory.

Archive freshness diagnostics are separate from archive generation.
`memory archive-health`, Feishu `/memory archive health`, context, governance
status, and Opportunity Backlog may expose bounded archive-health issues, but
the current UTC day remains an explicitly reported open day so resident writes
cannot make a same-day snapshot permanently unhealthy. After UTC rollover, the
same missing or stale metadata becomes an actionable historical issue. These
views only read event/archive metadata and render next-step commands. They must
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
`services/runtime/heartbeat.json` plus the current repo git identity from
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
local-only boundaries. If a sampled capability has a layer that differs from
its category grouping, compact context may render the explicit child layer so
models do not inherit broader authority from the category. The compact sample
may include `expert.orchestration_contract[boundary]`; that is advisory,
read-only boundary context, not permission to schedule expert agents, perform
model fan-out, or claim completion. It must not read secrets, auth records,
launchd state, service logs, raw context Markdown, review/SOP/skill bodies,
arbitrary state artifacts, or full operator detail; it must not invoke the
model, execute tools, request confirmations, execute follow-ups, manage
services, mutate state, write the repo, or write the active vault. Full
operator detail remains available through CLI `capabilities` and Feishu
`/capabilities`.

The Live Run Trace context section is bounded read-only orientation over recent
live harness runs. It may include completion report refs, context refs, final
response refs, event kind counts, observation counts, per-round action counts,
completion statuses, delegated result pass/fail counts, safe delegated dispatch
metadata, and model action envelope refs. Delegated result failure counts are
derived from the completion verification `delegated_results` check plus episode
event metadata; delegated dispatch metadata is parsed only from harness-owned
`delegated_result` event summaries. It reads completion verification reports,
model action envelope metadata, model diagnostic summaries, and episode event
metadata only. It must not inspect delegated artifact bodies or render raw
model responses, tool result bodies, delegated task/context/findings/output/raw
preview, action payloads, final response Markdown, context Markdown, harness
artifact bodies, request confirmations, rerun actions, invoke the model, or
mutate state.

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
`governance act-next` defaults to the auto-executable lane when no opportunity
is selected. Manual local actions, external adapter probes, application slices,
and local-learning follow-ups require an explicit `--opportunity` selection.
This keeps the default next-action path aligned with core/basic automation
instead of treating follow-up backlog items as the default capability outlet.
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
show only bounded health status, resident runtime state, heartbeat freshness and
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
unverified latest selected-skill outcomes may appear as `selected_skill_outcome`
items. These items are derived only from `memory/skills/usage/*.json` outcome
artifacts and may show skill refs, context manifest refs, completion report
refs, final response refs, completion status, verification status, verified
flag, final verdict, and use count. A newest verified pass suppresses older
attention outcomes for that skill without deleting them. When the same selected
skill has a consecutive unresolved streak of failed, skipped, blocked,
unfinished, or unverified outcomes after its last pass, the backlog may collapse
those current items into one `selected_skill_drift` summary. That summary
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
  query/todo refs, bounded blocked-tool diagnostic metadata, and update time
- bounded blocked-tool diagnostic metadata is limited to `tool`,
  `failure_kind`, `evidence_ref`, and a bounded `summary`
- StageRunner persists bounded response metadata and sanitized action-envelope
  metadata; the explicit stage response under `pipelines/*/artifacts/*.md` is
  the only model-authored stage body retained for downstream stages
- StageRunner model request or parse failures persist generic bounded failure
  metadata, never raw model output or provider payloads
- a StageRunner stage advances as `done` only when its final envelope declares
  `completion_claim.status=done`; `not_done` remains blocked (or skipped only
  for an optional stage), even if it produced a response artifact
- a `done` StageRunner stage also requires a non-empty `respond.payload.markdown`
  or `respond.payload.text` artifact; an empty or structured-only payload does
  not satisfy a stage's expected output
- blocked or failed runs may appear as read-only `pipeline_run` items in the
  Opportunity Backlog, with checkpoint/pipeline refs and stage status metadata
  only
- no pipeline execution
- no model invocation
- no tool execution
- no raw stage output Markdown, prompt, model response, model action envelope,
  tool result body, or pipeline todo body reads
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
- writes status under `services/runtime/review_tick.json`
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
- writes status under `services/runtime/content_feedback_refresh.json`
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
- writes status under `services/runtime/content_daily.json`, including recent
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
  state-action counts, delegated result pass/fail counts, safe delegated
  dispatch metadata, per-round action counts, action types, model diagnostic
  failure kind/stage/refs, and envelope refs
- delegated completion-gate check summaries may include check id, status,
  summary, and refs copied from the completion report; they must not treat
  delegated output as completion proof
- Live Run Trace and Harness Replay may also expose delegated completion-gate
  status counts for operator inspection; the counts are derived from the same
  completion report checks and do not create a second completion decision
- per-round action counts and envelope refs must come from the current
  completion turn's `model_action` evidence refs, not from every model-action
  file under the same session id
- repo-write guard summaries may include path, before/after workspace status,
  changed-file counts, dirty flag, target-changed flag, and event id parsed
  from bounded `tool_result` event summaries
- delegated result failure counts are derived from the completion verification
  `delegated_results` check and episode event metadata
- delegated dispatch summaries may include action id, round, sequence,
  task/context character counts, contract status, ok flag, event id, and result
  artifact ref parsed from harness-owned `delegated_result` event summaries;
  they must not read delegated result artifact bodies or render delegated task,
  context, findings, output, or raw output preview
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

IM is a local foreground or single-user service entrypoint. Feishu, Telegram,
and Discord are the implemented external providers.

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
- explicit Feishu p2p Goal interaction commands: `/goal read <goal-id>`,
  `/goal continue <goal-id>`, `/goal resume <goal-id>`, and
  `/goal confirm <goal-id> <effect-id>`
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
Service health commands may read only the selected target's
`services/<target>/heartbeat.json`,
`services/<target>/review_tick.json`,
`services/<target>/content_daily.json`,
`services/<target>/content_feedback_refresh.json`,
`services/<target>/content_creator_metrics.json`, and
`autonomy/runs/pause_signal.json` under the selected state root, plus bounded
repo git identity from `.git/HEAD`, loose refs, and `packed-refs`. They derive
heartbeat freshness, MessageGateway channel health, runtime-build summary, repo HEAD summary, resident
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
`action=health` and `target=runtime`; it is intentionally separate from
`service status`, which may inspect launchd and service log locations.
Lifecycle command results must include a `health_command` for the same target so
operator surfaces can guide follow-up bounded health inspection without merging
launchd/service-control state into the health read model.
Opportunity Backlog may use the same bounded service health read model to
create a `service_health` attention item when the resident deployment is stale
against repo HEAD, but it inherits the same read-only boundary and
service-control prohibition. Its inspect and restart guidance should use the
default service commands without a `--state-root <state-root>` placeholder
unless an explicit alternate service state root is in scope.
Service log commands may read only `<LOCAL_RUNTIME_HOME>/logs/runtime.out.log` and
`<LOCAL_RUNTIME_HOME>/logs/runtime.err.log`, tail bounded lines, and accept no
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
to read-only operator commands, cross users, group chats, remote Feishu state,
service restart recovery, multi-process coordination, durable replay, or
implicit conversational steering. Explicit `/goal` interactions share this
same-sender lane and are reparsed when dequeued, so Continue, Resume, and exact
Confirm cannot race a current task or become replacement Goal prose. Goal
control messages are excluded from later ordinary-task conversation history.

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
  `autonomy/inbox/`, `autonomy/followups/`, `services/runtime/`,
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
packages/runtime/src/goal_runtime.ts    # canonical Goal lifecycle and receipt
packages/runtime/src/goal_tool_competence.ts # bounded terminal-Goal experience projection
packages/runtime/src/tools.ts         # core tool execution
packages/runtime/src/runner.ts        # live local run
packages/runtime/src/stage_runner.ts  # short local stages
packages/runtime/src/service.ts       # local service install/status/logs
packages/runtime/src/channels/feishu/ # first IM provider
```

## Command Contract

Target first-version commands:
The list includes available inspection, application, local-learning, and
legacy diagnostic surfaces. It does not select active work. Engineering
activation belongs to GitHub Issues and Trellis tasks; runtime continuity and
outcomes belong to GoalRuntime and OutcomeReceipt.

```bash
pnpm run runtime -- doctor
pnpm run runtime -- doctor --no-auth
pnpm run runtime -- doctor --no-im
pnpm run runtime -- config --state-root .runtime/state
pnpm run runtime -- live --task "..." --state-root .runtime/state
pnpm run runtime -- pipeline --query-todo --task "..." --stages intake,tool_check,final --state-root .runtime/stage
pnpm run runtime -- pipeline resume --pipeline pipeline_run_... --from-stage tool_check --state-root .runtime/state
pnpm run runtime -- pipeline runs --state-root .runtime/state
pnpm run runtime -- pipeline runs --pipeline pipeline_run_... --state-root .runtime/state
pnpm run runtime -- web --host 127.0.0.1 --port 8765 --state-root .runtime/state
pnpm run runtime -- daemon serve --provider feishu --scenario im-default --state-root .runtime/state
pnpm run runtime -- service install|start|stop|restart|rollback|status|logs|uninstall --target runtime
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
- no hosted, multi-user, authenticated, or desktop GUI
- no hosted or multi-user daemon
- no Docker or Kubernetes deployment
- no broad external agent team runtime
- no automatic core self-rewrite
