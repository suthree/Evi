# Evi Product and Runtime Vision

Status: accepted long-term direction; not an implemented runtime contract or
an authorization to start every surface described here.

This document defines what Evi should grow into after its self-evolution and
self-iteration foundation is proven. It aligns one persistent self, many entry
surfaces, context-placed execution, multi-session semantics, harness, memory,
delegation, tool competence, and the Evi/LuBan boundary without turning them
into a speculative backlog.

The Simplified Chinese companion is
[`docs/PRODUCT_VISION.cn.md`](PRODUCT_VISION.cn.md).

## Authority and Precedence

When this vision differs from current implementation, use this order:

1. Current code, [`docs/RUNTIME_CONTRACT.md`](RUNTIME_CONTRACT.md), and
   [`docs/LOCAL_RUNTIME.md`](LOCAL_RUNTIME.md) describe implemented behavior.
2. [`docs/V0.2_MULTI_NODE_EVOLUTION.md`](V0.2_MULTI_NODE_EVOLUTION.md) and the
   matching Trellis spec describe the accepted current delivery target.
3. This document describes the long-term product and runtime north star.
4. GitHub direction and one bounded Trellis task activate actual work.

This vision alone does not prove completion, open an implementation slice, or
override a narrower acceptance, verification, privacy, or external-effect
gate.

## North Star

Evi should become a local-first general-agent brain: one durable, self-growing
Evi that can understand goals, operate across workspaces, learn how to use
tools and specialist agents well, choose an execution environment that matches
the task context, preserve continuity, and explain what happened with evidence.

The product shape is **one brain, many doors, and many execution
environments**. Evi may be invoked from a central console, IM mention, IDE,
browser, CLI, API, connector, or another host tool. Those surfaces bind context
to the same self; they do not create independent Evi personalities or state
owners.

It is not a separate personality for every workspace. Workspaces, goals,
sessions, and runs are scoped operating contexts around one persistent self.
It is also not another coding CLI, an uncontrolled agent-team chat room, or a
hosted multi-user control plane.

The product promise is:

> Give one trusted Evi durable goals, explicit context, verifiable execution,
> recoverable continuity, and a governed path to learn when, where, and how to
> use tools and specialist agents better.

## Product Principles

1. **One self, many scoped contexts.** Identity is stable; workspace, goal,
   session, and node overlays are explicit and inspectable.
2. **One logical brain, many physical doors.** Web, Desktop, IM mentions, IDEs,
   browsers, connectors, CLI, and APIs are bindings into the same Evi.
3. **Local self, context-placed execution.** The trusted local home is the
   default owner of self, goals, raw memory, and learning judgment. Work may run
   locally, near remote data, in a hosted agent, or inside a specialist SaaS.
4. **The runtime owns truth.** Every UI and host binding is a client of the
   resident runtime, never a second state owner.
5. **Context is compiled, not accumulated.** A model turn receives a bounded,
   immutable context snapshot selected for the current purpose.
6. **The harness is an operating and learning record.** Even under broad trusted
   local authority it freezes the task, context, environment, selected tools,
   budgets, outcome contract, evidence, and recovery expectations.
7. **Communication is typed.** Sessions exchange tasks, results, events, and
   artifact references instead of copying entire prompts or memory stores.
8. **Memory is not a message bus.** Operational coordination, historical
   recall, stable documentation, and reusable capability assets have different
   owners.
9. **Evi decides; LuBan preserves accepted assets.** Lifecycle judgment stays
   with Evi. LuBan provides canonical Git identity and history.
10. **Evidence before surface area.** More sessions, skills, connectors, and
    screens are not progress unless completion, recovery, and outcomes improve.

## Product Surfaces

All surfaces use one headless Evi Daemon/Gateway and its versioned contracts.

| Surface | Role | Boundary |
| --- | --- | --- |
| Evi Daemon/Gateway | Own sessions, runs, queue, context assembly, harness, evidence, memory selection, and capability activation | The only active runtime-state owner |
| Web Console/PWA | Primary operator workspace for goals, sessions, evidence, capabilities, nodes, and approvals | Does not implement a parallel runtime or planning database |
| Thin Desktop shell | Add tray presence, notifications, keychain, file pickers, OS permissions, and local computer-use integration | Reuses the daemon and Web UI; no second execution engine |
| IM adapters and mentions | Contextual invocation, conversation continuity, progress, and result delivery in the current work surface | Rich host context but no independent runtime state or control plane |
| Host bindings, connectors, and MCP-style adapters | Bring referenced host context and actions to Evi, or return artifacts to the host | Integration and execution surfaces; never a second self or memory owner |
| CLI/API | Diagnosis, automation, recovery, scripting, and contract-level access | Remains stable even when GUI surfaces change |

The Web Console should be the primary control and inspection surface because it
can express long-running goals, parallel sessions, evidence, capability growth,
and execution placement without duplicating operating-system integration. It is
not the sole task-entry surface. IM and host bindings may be deep contextual
doors into Evi as long as the runtime remains the state owner. A desktop shell
should be added only when native integration creates concrete value.

## Entry, Context, and Execution Placement

Product design must keep four questions separate:

1. where the operator invokes Evi;
2. where Evi's self, durable goals, memory, and learning judgment live;
3. where the task's authoritative context and credentials live;
4. where the work should execute.

Local-first means self sovereignty and a trusted default home, not forced
all-local computation. File organization and desktop use naturally execute on
the local machine. Remote development may execute next to the server checkout.
Long-running or webhook-driven work may continue on a resident remote node.
Connector and specialist-SaaS work may execute against cloud-owned data. A
mixed task may be planned and accepted by the home Evi while a remote or hosted
worker performs the bounded run.

Remote nodes, hosted agents, and specialist SaaS products are execution
environments or cognitive workers. They may hold a bounded checkpoint and task
context, but they do not become another Evi self. The parent Evi retains goal
continuity, result acceptance, outcome attribution, and capability learning.

## Runtime Domain Model

```mermaid
flowchart TD
  Self["Evi Self"] --> Workspace["Workspace"]
  Workspace --> Goal["Goal"]
  Goal --> Ledger["Shared Goal Ledger and Artifacts"]
  Goal --> Session["Conversation Session"]
  Session --> Run["Task Run"]
  Run --> Turn["Model Turn"]
  Run --> Target["Execution Target"]
  Target --> Local["Local Machine"]
  Target --> Remote["Remote Node"]
  Target --> Hosted["Hosted Agent or Specialist SaaS"]
  Session --> Worker["Child Worker Session"]
  Worker --> ChildRun["Child Task Run"]
```

### Evi Self

The stable identity, values, learning stance, and global policy baseline. It is
not copied or forked when a workspace or session is created.

### Workspace

A persistent project or life-domain overlay. It binds repositories, local
paths, project instructions, policies, default capability sets, and semantic
memory scope. A workspace does not own Evi's identity.

### Goal

A durable objective that may span conversations and machines. It owns the
accepted objective, success criteria, current owner session, dependencies,
decisions, checkpoints, artifact references, and terminal outcome.

### Conversation Session

The continuity boundary between a person and Evi. Web, Desktop, IM, or API
bindings may point to the same session. A session owns recent conversation,
its checkpoint, selected working context, and its run history.

### Task Run

A durable execution attempt with explicit states such as `queued`, `running`,
`waiting`, `blocked`, `done`, `failed`, and `cancelled`. A run binds one context
snapshot, one harness lock, attempts, execution target, node,
workspace/worktree, results, and completion evidence.

### Model Turn

One model interaction inside a run. It is not the unit of durable ownership and
must not silently change the session's harness or goal.

### Worker Session

A parent-linked, isolated execution context for delegated work. It may use a
local worker, remote node, hosted agent, or specialist cognitive runtime. It has
a bounded task, context, harness, workspace/worktree or host binding, and result
contract. Its output is advisory until the parent run verifies and accepts it.

## Context Architecture

Every model turn receives an immutable Context Manifest. It is compiled from
references and policy, then stored with provenance, budget, selection reasons,
and omissions.

```text
Self Core
+ node and runtime identity
+ workspace overlay
+ goal ledger
+ session checkpoint and recent conversation
+ selected episodic or semantic recall
+ selected capabilities and asset locks
+ explicit inter-session handoff
+ referenced artifacts
+ tool contract and output contract
= immutable context snapshot for one model turn
```

The context assembler shares definitions and references selectively. It must
not copy a sender's full raw prompt, transcript, tool output, or memory database
into another session.

| Context class | Default scope | Sharing rule |
| --- | --- | --- |
| Self core and global policy | Global | Read-only baseline, governed changes only |
| Workspace instructions and stable project docs | Workspace | Share by pinned reference within that workspace |
| Goal ledger and accepted decisions | Goal | Share with sessions attached to the goal |
| Session checkpoint and recent transcript | Session | Session-local unless explicitly summarized into a handoff |
| Working memory and raw tool output | Session or run | Never ambient cross-session context |
| Episodic and semantic memory | Global or workspace store | Retrieve on demand with source, scope, and confidence |
| Skill, prompt, SOP, and policy bodies | Capability selection | Load only selected, pinned versions |
| Artifacts | Referenced scope | Share immutable ref, hash, or commit before body materialization |

The current single working-checkpoint shape may eventually become a
session-scoped store plus a goal-level summary. That migration must preserve
existing evidence and recovery semantics; this document does not choose its
schema.

## Harness Architecture

The harness is not only a permission boundary. Under broad trusted local
authority, its primary product value is repeatability, outcome attribution,
completion truth, and recovery. Permission breadth is not evidence that Evi has
learned or that a task succeeded.

Every Task Run freezes an immutable Harness Lock. At minimum it records:

- session, run, goal, node, model, and provider identity;
- tool allowlist and permission profile;
- selected capability versions and asset lock;
- workspace, repository, worktree, and path policy;
- context, time, token, cost, retry, and output budgets;
- approval and external-effect gates;
- completion claims, verification contract, and rollback expectations.

Harness policy narrows through inheritance:

```text
Global baseline
  -> Workspace policy
    -> Session profile
      -> Run-specific clamp
```

A child session may only preserve or narrow parent authority. It cannot expand
permissions, install capabilities, change credentials, rewrite the receiver's
harness, or claim parent completion.

Live terminal handles, browser sessions, credentials, and mutable worktrees
must not be shared as raw objects between sessions. If concurrent work needs a
scarce resource, the runtime should issue a bounded, revocable resource lease
with owner, scope, expiry, and recovery behavior.

## Inter-Session Coordination

Multi-session operation is necessary, but the default topology is a controlled
parent-child tree or task dependency graph, not a free peer-to-peer chat mesh.

Operational coordination uses a durable queue and typed state events, including
progress, pause, resume, cancel, `needs_input`, dependency completion, and
terminal state changes.

A parent sends a `TaskEnvelope` containing:

- goal and task identity;
- bounded objective and expected result;
- context and artifact references;
- constraints and harness profile;
- workspace/worktree binding;
- verification requirements and deadline or budget.

A worker returns a `ResultEnvelope` containing:

- terminal or waiting status;
- summary and structured findings;
- artifact and changed-reference identities;
- verification evidence references;
- unresolved questions and proposed next step.

Inter-session messages must be marked as such, cannot impersonate the user,
cannot mutate the receiver's harness, and must carry state versioning. The
runtime should bound ping-pong depth, visibility, retries, and total budget.

## Memory, Documents, Events, and Artifacts

Memory or documents are not the primary mechanism for sessions to communicate.
Use the owner that matches the information's lifetime and effect:

| Information | Canonical mechanism |
| --- | --- |
| Progress, cancel, wait, completion, dependency change | Queue and state event |
| Subtask input and output | `TaskEnvelope` and `ResultEnvelope` |
| Current objective, decisions, and progress | Goal Ledger and Session Checkpoint |
| Code, reports, images, datasets, generated files | Artifact ref plus hash or commit |
| Stable project rules and decisions | Project docs, GitHub Issue, and Trellis |
| Long-term personal or workspace facts | Semantic memory with provenance |
| Raw conversations and tool history | Session archive with on-demand search |
| Reusable way of working | Evi Capability Manager and LuBan asset |
| Cross-node accepted knowledge | Redacted, scoped LuBan knowledge pack |

The future memory model should preserve separate layers:

1. per-session working memory and checkpoint;
2. per-session episodic archive;
3. global or workspace semantic memory;
4. procedural capability assets managed by Evi and published through LuBan;
5. raw archive plus a separate search/index layer.

Recall remains selective. A memory's existence does not authorize automatic
injection into every session or model turn.

## Capability Manager and LuBan

Evi owns the full capability lifecycle:

```text
observe -> curate -> deduplicate -> audit -> test -> propose/publish
        -> select -> activate -> evaluate -> revise or retire -> rollback
```

The Capability Manager has two distinct responsibilities that must not be
confused.

### Capability infrastructure

Inventory, source discovery, import, sync, conflict detection, backup, safe
projection, validation, activation receipts, and recovery make capabilities
portable and operable. These are capabilities inside Evi, not a separate
authority beside it. Completing this infrastructure does not by itself prove
that Evi has learned.

### Capability intelligence and tool competence

Evi must learn not only a procedure, but also when, where, and under which
conditions to use it. For each important tool, connector, specialist agent, or
execution environment, Evi should be able to accumulate evidence about:

- suitable task classes and required context;
- local, remote, hosted-agent, or SaaS placement;
- input preparation and output/verification contracts;
- observed quality, latency, cost, and failure modes;
- recovery, fallback, and tool-composition patterns;
- operator corrections and stable preferences;
- confidence, freshness, regression, revision, and retirement conditions.

Memory answers what Evi knows. A Skill or SOP describes how to perform a
repeatable procedure. A Tool Competence Model helps Evi decide when, where, and
with which tool or specialist agent to perform it. Capability growth requires
all three plus verified outcomes.

LuBan remains a private, Git-backed registry for accepted reusable assets. It
stores typed bodies, manifests, provenance, immutable history, and release
identity. It does not decide whether an asset should be used, install it on a
node, manage sessions, or own runtime state.

The sources of truth are deliberately different:

| Lifecycle state | Source of truth |
| --- | --- |
| Local observation, draft, or candidate | Evi node-local state and active vault |
| Accepted reusable version | Pinned LuBan commit and content hash |
| Selected and active version on a node | Evi asset lock and activation receipt |
| Actual quality and effect | Node-local outcome and verification evidence |

## State and Portability Direction

When the foundation is ready, the preferred ownership model is:

- SQLite with WAL for operational objects such as goals, sessions, runs,
  bindings, queue entries, dependencies, events, leases, approvals, and search
  metadata;
- filesystem JSON, JSONL, and immutable files for context snapshots, evidence,
  artifacts, and receipts;
- Markdown and Git for stable project knowledge and decisions;
- LuBan for accepted reusable capability assets.

This is a direction, not a mandate for a database rewrite. Each future slice
must migrate the smallest coherent owner and retain compatibility, export,
recovery, and rollback evidence.

Evi's trusted local home is the default canonical owner of self identity,
durable goals, raw memory, and capability judgment. This does not require every
run to execute there. A session has one home node while active, while an
individual run may target a local environment, remote node, hosted agent, or
specialist SaaS. Cross-node session movement happens through pause, checkpoint,
export, handoff, and resume. Raw runtime databases and live handles are not
shared, and active-active execution of one session is not a goal.

## Operator Experience

The primary Web Console should eventually expose:

- Home: current attention, resident health, active goals, and waiting actions;
- Workspaces: project bindings, policies, memory scope, and defaults;
- Goals: objective, criteria, ledger, dependencies, and outcomes;
- Sessions: status, channel bindings, parent/child topology, and recovery;
- Session Detail: Timeline, Goal/Checkpoint, Context Inspector, Harness
  Inspector, Artifacts, Delegation, and Evidence;
- Capability Manager: candidates, installed/active sets, LuBan proposals,
  conflicts, receipts, outcomes, and retirement;
- Memory and Knowledge: scoped recall, provenance, contradictions, and promoted
  knowledge packs;
- Automations, Nodes, Approvals, and Settings.

The UI follows runtime contracts. A new read model may be exposed as soon as
its owner and evidence are stable, but the UI must not invent write semantics
that the CLI/API and harness do not have.

## Gated Evolution Policy

### Foundation gate: first priority

Do not start a broad Session Runtime, Capability Manager, Desktop, or new GUI
program until Evi proves its basic self-evolution and self-iteration loop:

1. select one bounded core/basic capability slice from an accepted goal;
2. compile bounded context with provenance, budget, and omission evidence;
3. execute only harness-authorized actions with explicit failure semantics;
4. bind completion claims to independent verification evidence;
5. persist outcome, checkpoint, rollback path, and the next decision point;
6. recover or restart the resident runtime with deployment identity and health
   aligned;
7. repeat the loop without unintended SOP, skill, memory, permission, or
   external-effect expansion.

Existing accepted v0.2 work continues until its own acceptance gate passes.
This vision must not leapfrog open v0.2 evidence, deployment, or knowledge-pack
gates.

### Goal selection after the gate

After the foundation and current target gates pass, choose exactly one bounded
goal at a time. The default dependency order is:

1. **Session Runtime Foundation**: durable goal/session/run ledger, context
   snapshot identity, channel/host bindings, harness lock, state transitions,
   restart, and recovery.
2. **Cognitive Continuity and Outcome Attribution**: session-scoped
   working/episodic state, selective semantic recall, goal handoff, archive
   search, context inspection, and attribution of results to context, model,
   tool, environment, procedure, and execution strategy.
3. **Capability Intelligence and Tool Mastery**: tool competence records,
   candidate generation, outcome-based evaluation, confidence, reuse,
   regression, revision, retirement, and fallback. Capability infrastructure
   such as inventory, source identity, conflict checks, LuBan
   publish/select/activate receipts, and rollback may arrive earlier when an
   accepted current-version gate requires it, but infrastructure completion is
   not a learning claim.
4. **Multi-Environment Delegated Execution**: typed parent-child sessions,
   local/remote/hosted execution targets, queue/dependency control, resource
   leases, result acceptance, and budget limits. The parent Evi retains goal and
   completion authority.
5. **Presence and Product Expansion**: progressively complete Web control and
   inspection views, deepen selected IM/host entry bindings, then add a thin
   Desktop shell only for proven native integration needs. Thin real-world
   entry surfaces may remain active in earlier phases to generate learning
   evidence; this step governs broad surface expansion.

This order is not a release promise or fixed backlog. After each goal, Evi must
use measured evidence to keep, reorder, narrow, or retire the next candidate.
The active goal belongs in GitHub and one bounded Trellis task, not in this
document.

## Success Measures

Progress is measured by:

- verified goal completion and false-completion rate;
- context provenance, selectivity, and budget compliance;
- restart, recovery, rollback, and session handoff success;
- correct execution-target and tool selection, including successful fallback;
- outcome attribution quality across context, tool, environment, and procedure;
- harness violations prevented and external effects correctly gated;
- capability reuse outcomes, confidence calibration, regressions, and
  retirement quality;
- continuity when one task moves between central, IM, and host entry surfaces;
- cross-session result acceptance based on evidence rather than self-report;
- operator ability to understand current state and the next decision.

Counts of sessions, agents, skills, memory entries, screens, or tokens are not
success measures by themselves.

## Explicit Non-Goals Until the Gates Pass

- hosted multi-user control plane;
- public capability marketplace;
- raw memory or runtime-database synchronization;
- an independent Evi self for each surface, workspace, or execution node;
- forced all-local execution when context, availability, or data gravity favors
  a remote or hosted worker;
- free peer-to-peer session chat or autonomous ping-pong;
- active-active cross-node execution of one session;
- broad autonomous agent teams;
- a desktop monolith or separate desktop runtime;
- a shallow model/agent aggregator measured by provider, connector, or skill
  count;
- rebuilding every specialist editor or vertical SaaS inside Evi;
- GUI-first implementation that outruns runtime ownership and evidence;
- automatic global activation of LuBan assets;
- treating planning text as proof that a capability exists.

## Accepted Direction Summary

Evi grows as one persistent local-first self with many physical doors and
multiple execution environments. Its resident runtime owns goals, sessions,
context, harness, evidence, memory selection, result acceptance, and capability
learning. Central, IM, CLI, API, connector, and host-tool surfaces bind context
to that same self. Local, remote, hosted-agent, and specialist-SaaS workers may
execute a run without becoming another Evi. Memory preserves facts, Skills and
SOPs preserve procedures, Tool Competence guides when and where to use them,
and LuBan preserves accepted reusable assets in Git.

The immediate product decision is restraint: finish and prove the current
self-evolution foundation, close the accepted current target, then activate one
bounded goal at a time.
