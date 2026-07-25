# Agent Context

This glossary defines the language for one continuous, local-first,
self-growing agent. It intentionally describes domain concepts rather than
current files, commands, or implementation classes.

## Identity and placement

**Self-Growing Agent Core**:
The long-lived self of the agent across projects, entry surfaces, models, and execution environments. It owns the seed mission, durable values, operating boundaries, and continuity of growth.
_Avoid_: Personal assistant, workspace persona, per-repo agent, split identity

**Agent Continuity**:
The ability of the **Self-Growing Agent Core** to preserve bounded identity, active intent, selected context, evidence status, and recoverable work across session or process boundaries.
_Avoid_: Transcript retention, shared global session, one mandatory Goal

**Project Overlay**:
A temporary context layer for a repository, organization, or task domain. It constrains and informs the same agent but does not create another self.
_Avoid_: Project personality, workspace self

**Host Runtime**:
A concrete environment that can host or execute agent behavior and expose its own tools, context, and lifecycle.
_Avoid_: Tool protocol, project overlay, agent identity

**Delegated Agent Surface**:
A **Host Runtime** asked to perform bounded specialist work whose result remains subject to Evi-owned evidence and acceptance.
_Avoid_: Tool protocol, separate self, completion authority

**Host Instruction File**:
A file that adapts behavior for one **Host Runtime** or project without becoming durable agent identity or runtime enforcement.
_Avoid_: Self-Growing Agent Core, hard policy, durable memory

## Work and execution

**V0.3 Operational Baseline**:
The current architecture and planning route: Evi is a thin local control plane
that uses verified tool execution and experience before expanding delegation.
_Avoid_: Runtime-cutover claim, version-number proof, replacement product plan

**Pi Execution Surface**:
A bounded Pi-backed execution environment. A future Pi subagent is the same
kind of delegated surface, never an Evi state or acceptance owner.
_Avoid_: Separate Evi self, acceptance authority, self-report as proof

**Turn**:
One bounded response-and-action cycle started by a submitted request or continuation. A Turn does not require a Goal.
_Avoid_: Goal, entire session, model call

**Run**:
One execution lineage containing one or more Turns, their selected context, actions, evidence, and terminal outcome.
_Avoid_: Goal, process, transcript

**Supervisor Run**:
A parent Run that retains task decomposition, worker dispatch, integration, independent verification, and final acceptance authority without remaining as one continuously active model request.
_Avoid_: Always-running model call, worker, scheduler

**Goal**:
An optional durable intent that links multiple Runs through an objective, acceptance criteria, budget, and continuation policy.
_Avoid_: Ordinary task, agent loop, session store, mandatory ingress

**Worker Session**:
A parent-linked durable context for one bounded delegated task. Its result remains advisory until the parent Supervisor Run verifies and accepts it.
_Avoid_: Separate Evi self, peer agent, completion authority

**Task Envelope**:
The typed, versioned assignment from a parent Run to a Worker Session, containing bounded purpose, context and artifact references, authority, budget, and verification expectations.
_Avoid_: Raw prompt copy, shared transcript, permission grant

**Result Envelope**:
The typed, versioned worker result containing status, structured findings, artifact and evidence references, unresolved questions, and no parent-completion authority.
_Avoid_: Worker self-report as proof, chat message, Run Outcome

**Agent Loop**:
The ordered model-and-tool cycle that advances a Turn until it answers, blocks, fails, or stops. Exactly one owner controls this cycle for a Run.
_Avoid_: Goal lifecycle, task queue, effect policy

**Runtime Kernel**:
The compact runtime boundary that accepts work, binds canonical state and context, delegates the **Agent Loop**, and exposes control and inspection without implementing a second loop.
_Avoid_: Monolithic workflow engine, channel adapter, model provider

**Orchestration Engine**:
The Evi-owned runtime module that validates and advances parent-child task graphs, worker leases, dependency state, bounded budgets, cancellation, and result delivery without planning tasks or owning an Agent Loop.
_Avoid_: Agent team chat, second Runtime Kernel, model planner

**Execution Lock**:
The immutable authority and reproducibility snapshot for one Run Execution, including selected model, context, actions, budgets, execution placement, verification, and recovery expectations. A child lock may only preserve or narrow its parent lock.
_Avoid_: Pi AgentHarness, permission prompt, mutable session settings

**Delivery Lineage**:
The isolated source-delivery history for one source-mutating work item, from a named baseline through one branch or worktree, verification, integration, and retirement. It has at most one active writer and is not owned by a Goal.
_Avoid_: Goal workspace, shared writable checkout, session directory

**Turn Snapshot**:
The immutable input selected for one model step, including current request, bounded context, available actions, budgets, and output expectations.
_Avoid_: Live mutable state, full archive, raw transcript

**Context Bundle**:
The bounded prompt-facing view rendered from a **Turn Snapshot**.
_Avoid_: Full memory dump, default archive preload

**Run Outcome**:
The terminal record of a Run's status, answer or failure, and evidence references. It does not imply learning, evolution, or deployment occurred.
_Avoid_: Universal receipt, model self-report, capability proof

**Run Continuation**:
The explicit transition that resumes one paused Run in its existing Turn and session only after unresolved Actions or an interrupted Run Execution have bounded terminal recovery evidence. It preserves the original uncertainty and records the evidence identity used to continue.
_Avoid_: Blind retry, new Run, transcript rewrite, automatic scheduler

**Run Execution**:
The durable, leased ownership attempt for one invocation of the Agent Loop. It is created atomically with a new or resumed Run state and must settle before that owner can complete, pause, or fail the Run.
_Avoid_: Run, provider request, worker process, task queue item

**Model Dispatch**:
The bounded lifecycle evidence for one logical provider/model request inside a Run Execution, from dispatch start through response observation and persisted assistant settlement, or to an explicit unknown outcome after owner loss.
_Avoid_: Effect Receipt, model answer, provider exactly-once guarantee, raw payload log

**Tool-Call Protocol**:
The ordered session invariant that binds one persisted assistant tool-call identity to exactly one matching tool-result message, with Action Gateway reservation and receipt evidence deciding whether recovery may dispatch, reconcile, or only reuse a terminal outcome.
_Avoid_: Tool Protocol, Tool Operation Protocol, Action Gateway, tool implementation

## Actions and evidence

**Tool Protocol**:
A transport or interface through which the agent can act or communicate, such as shell, MCP, browser, IM, or an API.
_Avoid_: Tool Contract, agent architecture, skill

**Tool Contract**:
The typed declaration of one callable tool's inputs, outputs, effect class, and invariants.
_Avoid_: Vendor specification, Tool Operation Protocol, permission grant

**Harness-State Capability**:
A named, Goal-start-opted-in Harness action that writes one tightly bounded local
state artifact under canonical evidence checks. It is neither a **Tool
Contract** nor a general file-write surface: its state effect, verification, and
retirement boundary remain owned by the **Harness Kernel**. The first instance,
`harness.propose_sop`, creates only an unaudited, inactive SOP draft from
same-Goal nondelegated observations; a later ordinary Goal outcome may describe
verified draft delivery but never promotion.
_Avoid_: Tool Contract, file.write_state alias, SOP promotion, active-vault write, Skill, completion authority

**Tool Operation Protocol**:
The bounded procedure for using a known tool: allowed scope, preconditions, evidence, verification, fallback, and retirement condition.
_Avoid_: Tool Contract, raw documentation, credential bundle, skill

**Tool-First Capability**:
The preference to use an existing tool or adapter through a bounded contract
and operation protocol before creating an Evi-owned workflow surface.
_Avoid_: Rebuilding specialist products, tool visibility as capability proof

**Action Gateway**:
The mandatory Evi-owned boundary that exposes typed action contracts, applies the current authority and policy, commits a reservation before dispatch, and records bounded evidence for reconciliation. Containment strength depends on the selected handler and effect class; it is not implied by tool visibility.
_Avoid_: Tool catalog, agent loop, prompt-only safety

**Action Reservation**:
A durable pre-dispatch record binding one Run invocation, exact contract version, effect class, persistence-safe arguments, and action digest so an uncertain outcome cannot authorize blind replay.
_Avoid_: Queue item, permission token, raw prompt log

**Effect Receipt**:
The terminal evidence for one reserved effect, including its exact identity, observed outcome, bounded output, and reconciliation status. It may reference separate verification when that effect requires it.
_Avoid_: Run Outcome, model claim, generic completion receipt

**Worker Dispatch Receipt**:
The terminal or reconciled evidence for one reserved worker dispatch, binding parent and child identity, task and lock digests, selected execution adapter, budget, and result reference.
_Avoid_: Result Envelope, worker self-report, Run Outcome

**Evaluation Receipt**:
The evidence produced by testing one Adaptation Candidate against named baselines, cases, and guardrails.
_Avoid_: Activation Receipt, test log alone, model confidence

**Deployment Receipt**:
The evidence that an exact source or asset identity was installed, became healthy for a named target, was observed during probation, and retained a rollback path.
_Avoid_: Git merge, build result, Activation Receipt

**Evidence Event**:
An append-only observation of something that occurred, with provenance and references sufficient for later verification or learning.
_Avoid_: Curated fact, summary without source, hidden reasoning

**Canonical Runtime State**:
The single authoritative structured state from which active Runs, Turns, reservations, receipts, Goals, and adaptations are read and recovered.
_Avoid_: Cache, projection, directory scan, dual-write peer

## Capability

**Capability**:
A bounded outcome the agent can currently attempt through one or more tools, procedures, or delegated surfaces.
_Avoid_: Tool, permission, feature count

**Capability Portfolio**:
The bounded decision view of available capabilities, their contracts, readiness, competence, cost, risk, and fallback for a Turn.
_Avoid_: Static router, permission grant, execution owner

**Capability Selection**:
The evidence-linked choice of a capability for one purpose, together with verification and fallback expectations.
_Avoid_: Keyword routing, tool call alone, completion claim

**Capability Experience**:
One evidence-linked observation of attempting a capability inside a Run and its relation to the observed outcome.
_Avoid_: Causal proof, raw tool output, mastery

**Experience Record**:
A provenance-linked record of an observed tool or delegated outcome, including
cost and failure where known, used as evidence for later procedure candidates.
_Avoid_: Success claim, automatic learning, acceptance authority

**Canary Experience Record**:
A bounded, append-only projection of terminal protocol evidence from an isolated canary Run. It preserves lineage and explicitly unavailable cost for later inspection, without carrying prompts, messages, output bodies, acceptance, competence, Skill, or business-correctness claims.
_Avoid_: Experience Record, Skill, capability maturity, acceptance evidence

**Capability Competence**:
Revisable decision knowledge derived from repeated **Capability Experience**, including observed scope, reliability, failure modes, freshness, and fallback.
_Avoid_: One successful run, self-reported mastery, authorization

**Capability Profile**:
A scoped operating view combining declared contracts with evidence-derived competence, cost, risk, readiness, and retirement data.
_Avoid_: Permission grant, Tool Operation Protocol, skill, provider config

**Discovery Signal**:
Untrusted provenance naming a possible external capability reference for later bounded review.
_Avoid_: Imported specification, installation authority, capability

**Capability Candidate**:
A proposal linking one or more **Discovery Signals** to a real need, probe plan, risk, verification, and retirement path.
_Avoid_: Trending project, installed tool, active capability

## Adaptation and growth

**Self-Iteration**:
One observe, try, verify, and adjust cycle. It may end without any durable change.
_Avoid_: Self-learning, self-evolution, automatic improvement

**Adaptation**:
The shared evidence-to-activation lifecycle for a proposed durable change, regardless of whether its target is knowledge, procedure, policy, tooling, or source.
_Avoid_: Reflection alone, direct mutation, generic workflow

**Self Registry**:
The versioned record of Evi's current and retired identity, memory, procedure, capability, prompt, policy, tool, and source artifacts, including provenance, scope, active mapping, and recovery identity.
_Avoid_: Runtime database as a whole, asset marketplace, default context dump

**Adaptation Engine**:
The Evi-owned module that turns evidence into candidates, evaluations, activations, observation, retirement, or rollback while leaving action dispatch to the Action Gateway.
_Avoid_: Background reviewer, direct self-write, second workflow engine

**Adaptation Candidate**:
An inactive proposed change with a target, evidence, scope, evaluation plan, risk, and rollback or retirement path.
_Avoid_: Active memory, merged source, accepted skill

**Evaluation**:
A bounded test of an **Adaptation Candidate** against explicit cases, baselines, and guardrails.
_Avoid_: Model confidence, implementation activity, activation

**Activation**:
The explicit transition that makes an evaluated adaptation current for a named scope and records how to reverse or retire it.
_Avoid_: Candidate creation, merge alone, global latest

**Self-Learning**:
An **Adaptation** whose durable target is retained knowledge, a procedure, a skill, or evidence-backed tool-use competence.
_Avoid_: Self-iteration, source change, transcript accumulation

**Self-Evolution**:
An **Adaptation** whose durable target changes tools, policy, dependencies, source, runtime, or deployment.
_Avoid_: Self-learning, any code edit, unverified mutation

**Evolution Attempt**:
A source- or runtime-changing candidate carried through isolation, evaluation, and possible activation. It is not an improvement until evidence supports acceptance.
_Avoid_: Self-evolution success, patch, automatic upgrade

**Procedural Memory**:
Reusable operating knowledge expressed as SOPs, skills, scripts, templates, and evaluation cases.
_Avoid_: Semantic fact, raw transcript, runtime policy

**SOP**:
A revisable reusable procedure that may be drafted and tested before it is stable enough to become a Skill.
_Avoid_: Raw episode, Tool Operation Protocol, promoted skill

**Skill**:
A deliberately activated package of reusable procedural guidance and supporting assets for a recognizable class of work.
_Avoid_: Tool, capability, SOP draft, default context dump

**Promotion Gate**:
The decision boundary that permits an evaluated candidate to become active memory, procedure, skill, capability profile, policy, or runtime behavior.
_Avoid_: Human approval by default, casual remembering, test pass alone

**Retirement**:
The explicit removal of an active adaptation from current use while preserving enough evidence and recovery information to explain and reverse the decision.
_Avoid_: Silent deletion, forgetting, rollback without record

## Governance and history

**Decision Owner**:
The actor or accepted contract authorized to decide one material boundary change for a named scope.
_Avoid_: Model confidence, task success, blanket permission

**Direction Proposal**:
A bounded, evidence-linked recommendation that records an unresolved need, assumptions, alternatives, risks, verification, and a preferred direction before a material change.
_Avoid_: Hidden reasoning, execution authority, persistent task owner

**Environment Baseline**:
The observable and recoverable condition before source mutation: inherited work has an owner and disposition, current changes are isolated, Git state is known, and runtime health and identity are checked.
_Avoid_: Clean status alone, state wipe, blanket deletion

**Historical Archive**:
Dated recoverable evidence excluded from default context and retrieved only with origin and historical status preserved.
_Avoid_: Resident prompt, active instruction source, undocumented deletion

**Historical v0.2 Archive**:
The dated v0.2 design, task, ADR, and runtime evidence retained for explicit
historical retrieval and rollback, but excluded from the default v0.3 route.
_Avoid_: Current owner, default roadmap, erased evidence

**Exploration Budget**:
The finite allowance for autonomous discovery or experimentation, expressed in time, turns, calls, cost, effects, or candidate count.
_Avoid_: Unlimited autonomy, curiosity score

**Stop Exploration Signal**:
An explicit operator or policy signal that prevents new autonomous exploration while preserving evidence and safe shutdown work.
_Avoid_: Identity change, memory deletion, permanent retirement

**Agent Asset Registry**:
A versioned source for accepted reusable agent assets and their identity, provenance, compatibility, and retirement metadata.
_Avoid_: Runtime state, task router, marketplace, global activation

**Activation Receipt**:
Node- and scope-specific evidence that an asset or adaptation was staged, validated, activated, observed, and left with a rollback path.
_Avoid_: Registry acceptance, global deployment status, model confidence
