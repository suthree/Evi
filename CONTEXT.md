# Agent Context

The agent is a context for designing one continuous autonomous self-growing agent. The language here defines the domain concepts, not implementation details.

## Language

**Self-Growing Agent Core**:
The long-lived self of the agent: one stable autonomous agent across repositories, interfaces, models, and runtimes. It owns the seed mission, durable values, operating boundaries, learning policy, and continuity of growth.
_Avoid_: Personal assistant, workspace persona, per-repo agent, split identity

**Learning Orchestrator**:
The **Self-Growing Agent Core** in its operating role: it discovers, compares, selects, combines, and evaluates tools, skills, and **Delegated Agent Surfaces** to expand capability. It need not internalize every tool protocol or become the default worker; bounded direct execution remains an evidence and recovery surface while specialists perform suitable production work.
_Avoid_: Generic command agent, fixed workflow router, tool wrapper

**Project Overlay**:
A temporary context layer applied to the **Self-Growing Agent Core** for a specific repository, task domain, organization, or collaboration setting. It may constrain behavior and recall project knowledge, but it does not create a separate self.
_Avoid_: Project personality, workspace self

**Agent Architecture Reference**:
A full agent design used as a source of patterns, such as Codex, Hermes, OpenClaw, GenericAgent, or pi. These are reference organisms for architecture learning, not ordinary tools.
_Avoid_: Tool, protocol, plugin

**Host Runtime**:
A concrete agent surface that can run or host agent behavior, such as Codex, Claude Code, Hermes, OpenClaw, GenericAgent, or pi. A host runtime may have its own preload files and extension points.
_Avoid_: Tool protocol, project overlay

**Delegated Agent Surface**:
A specialized **Host Runtime** that the agent can ask to perform bounded work, then inspect and verify, such as delegating a coding task to Codex. It is more capable than a **Tool Protocol**, but it still does not become the **Self-Growing Agent Core**.
_Avoid_: Tool protocol, separate self

**Capability Portfolio**:
The bounded, current decision context for one Goal cognition turn: available direct tools and delegated executors, their contracts and readiness, selected skills, and evidence-derived **Capability Competence**. It informs a dynamic choice but does not route tasks, execute effects, persist a second state, or accept outcomes.
_Avoid_: Static task router, capability catalog, permission grant, planner

**Capability Selection**:
The model-proposed choice of one candidate from the current **Capability Portfolio**, including its execution purpose, selected skill refs, rationale, verification plan, and fallback. The **Harness Kernel** validates it before effect policy or execution; Evi still owns evidence and acceptance.
_Avoid_: Keyword mapping, tool call alone, delegated completion claim

**Capability Fit Assessment**:
For a delegated executor, the bounded comparison record within a **Capability Selection**: exactly the current capability ids and selected-skill refs considered, plus the conclusion for choosing that executor. It is selection evidence, not a permission grant, execution request, or proof of outcome.
_Avoid_: Static router, authority token, delegated completion claim

**Typed Cognition Envelope**:
The schema-bound `decision` envelope from model cognition to **GoalRuntime**. It declares exactly one complete `action`, `outcome`, or `blocked` shape before the runtime performs its separate semantic validation and effect-policy checks.
_Avoid_: JSON-in-a-string, repairable model prose, authority grant

**Evolution Constraint**:
A rule classified by the boundary it protects. Canonical evidence, containment, sensitive data, irreversible external effects, and completion ownership are hard invariants; an exact-effect confirmation is a hard gate; workflow sequence is an adaptive default; a skill is advisory guidance. A default yields to current evidence when the protected invariant is already satisfied.
_Avoid_: Universal workflow mandate, capability router, silent override

**Specialist Executor Intent**:
The narrow, model-authored request to a **Delegated Agent Surface**: a bounded `task` and `task_shape`. The **GoalRuntime** adapter derives protocol details such as new/resume mode, worktree, profile, model, authority handle, and budgets from bound state and canonical evidence before the typed tool validates them again.
_Avoid_: Raw Codex invocation envelope, provider pin, worktree authority, completion claim

**Goal Execution Workspace**:
The one optional isolated linked worktree derived for a Goal from a successful canonical placement observation. The Goal's original repository authority remains its control anchor; repo-scoped execution may move to this live-validated workspace, while runtime state and completion ownership do not move.
_Avoid_: Second Goal, workspace registry, ingress side effect, task router, state root

**Capability Experience**:
One evidence-linked observation of using a tool or **Delegated Agent Surface** inside a terminal Goal. It records the direct execution outcome and may record association with the Goal's accepted or abandoned result, but it does not claim that the capability caused that result.
_Avoid_: Causal proof, raw tool output, progress score

**Capability Competence**:
Bounded decision knowledge derived from repeated **Capability Experience**: observed scope, reliability, failures, fallback guidance, and freshness that changes later capability selection. Sparse evidence remains provisional, current evidence wins conflicts, and competence is revised or retired as outcomes change.
_Avoid_: Capability catalog entry, one successful run, self-reported mastery, scorecard

**Capability Profile**:
A scoped, evidence-derived operating description of one direct tool or **Delegated Agent Surface**. It combines the capability's declared contract and readiness with observed scope, competence, cost, risk, failure modes, fallback guidance, and freshness to inform later selection. It neither grants authority nor proves that the capability caused a Goal outcome, and it is not a semantic fact or a procedural skill.
_Avoid_: Permission grant, causal claim, capability catalog, SOP, skill, static provider configuration

**Expert Orchestration Contract**:
The **Core Runtime Capability** boundary that defines advisory expert roles, when they may be consulted, and why the main runtime still owns verification and completion. It is not an autonomous scheduler or a new agent identity.
_Avoid_: Multi-agent daemon, parallel model fan-out, expert persona, external tool workflow

**Host Instruction File**:
A file read by a specific host runtime to preload behavior or project guidance, such as Codex `AGENTS.md`, Claude Code `CLAUDE.md`, Hermes `.hermes.md`, or OpenClaw bootstrap files. It adapts the agent to a host and is not the agent core by itself.
_Avoid_: Self-Growing Agent Core, durable memory

**Tool Protocol**:
A way for the agent to act or communicate, such as IM, CLI, MCP, shell, browser, GitHub API, or skill invocation. Tool protocols are interfaces for action, not independent agent selves.
_Avoid_: Agent architecture

**Textual Constitution**:
The prompt-readable text layer that gives a model background context, such as `core/soul.md`, `core/memory.md`, host instruction files, or SOP files. It describes norms and context, but it is not sufficient by itself to guarantee behavior.
_Avoid_: Hard runtime, kernel

**Harness Kernel**:
The runtime layer that enforces behavior the model should not merely be asked to remember: tool permissions, approval gates, session locks, turn snapshots, save points, verification, and write policy.
_Avoid_: Prompt file, SOP text

**Runtime Contract**:
The agreement that defines which state enters a model call, what action shape the model may return, how the harness validates and executes it, and how evidence is persisted afterward.
_Avoid_: README, conceptual overview

**Core Runtime Capability**:
A domain-independent ability the local runtime must have to perform and verify work: bounded execution, context control, action validation, evidence capture, completion verification, recall, and explicit self-evolution gates. Core capabilities are stable only when they survive different projects, tools, and application examples.
_Avoid_: Adapter feature, content workflow, provider-specific tool, demo scenario

**Basic Entrypoint Capability**:
A local surface through which work enters or observes the runtime, such as CLI, IM, or a single-user resident service. It supports the **Core Runtime Capability** layer but does not define the agent's growth loop by itself.
_Avoid_: Hosted service product, optional plugin, external platform integration

**Application Slice**:
A bounded scenario that uses core and entrypoint capabilities to prove a workflow, gather evidence, and expose gaps. Active exploration, content publishing plans, image generation, market-source probes, browser automation, and platform MCP adapters belong here unless the pattern generalizes back into the runtime contract.
_Avoid_: Core Runtime Capability, agent identity, architecture reference

**Turn Snapshot**:
The immutable state used for one model call: trigger, goal, selected context, available actions, budget, and output expectations. Runtime changes apply to later snapshots, not the in-flight call.
_Avoid_: Live mutable state, transcript

**Context Bundle**:
The bounded prompt-facing view rendered from a **Turn Snapshot**. It contains selected stable context, task context, overlays, recall, working checkpoint, and output schema.
_Avoid_: Full memory dump, raw archive

**Model Action Envelope**:
The structured action proposal returned by the model. For Goal execution it includes a **Capability Selection** beside the proposed effect; the harness decides what actually executes.
_Avoid_: Final authority, unstructured answer

**Evidence Event**:
An append-only record of something that happened, such as a prompt, tool result, delegated result, diff, test, report, correction, or audit. Evidence events are the source material for memory, SOP, and skill promotion.
_Avoid_: Curated memory, summary-only note

**Promotion Gate**:
The self-governed boundary that decides whether raw experience can become durable memory, a reusable skill, or a core identity change. Promotion requires evidence, scope, autonomous validation, and rollback awareness; it does not require human review by default.
_Avoid_: Human approval step, casual remembering

**SOP Layer**:
The intermediate reusable-procedure layer between raw experience and durable skill. SOPs may evolve quickly from new evidence, but they are not treated as stable skills until audited.
_Avoid_: Final skill, raw transcript

**Autonomous Audit**:
The machine-run review process that checks whether an SOP, memory update, tool workflow, or governance change is valid enough to promote. Audit standards are themselves evolvable, but changes to audit standards require a higher promotion threshold than ordinary skills.
_Avoid_: Human review, unchecked self-approval

**Capability Flywheel**:
The core growth loop of the agent: use tools or delegated agent surfaces, record evidence, extract reusable experience into SOPs, audit them, promote valid SOPs into skills, recall them later, and revise them from outcomes.
_Avoid_: Feature list, broad assistant coverage

**Independent Verification Bridge**:
The bounded transition from a successful **Delegated Agent Surface** result to harness-owned evidence sufficient for outcome verification. Delegated self-reports remain execution evidence only; when an unresolved verification obligation exists, the **Learning Orchestrator** selects a bounded non-delegated verification action and the **Harness Kernel** validates its result.
_Avoid_: Delegated self-certification, automatic test pipeline, generic command work

**Dream Consolidation**:
An idle-time, proposal-only learning mode that reviews bounded conversation and episodic evidence together with semantic memory, procedural memory, and capability experience. It may compress, classify, connect, or challenge prior experience and propose memory, SOP, skill, capability-profile, or exploration candidates. It never converts reflection into fact, executes work, or promotes a candidate by itself.
_Avoid_: Autonomous executor, hidden chain of thought, completion authority, automatic memory write

**Direction Proposal**:
A bounded, evidence-linked recommendation that names an unresolved need, assumptions, candidate directions, risk, verification, and a recommendation before a material self-evolution decision. It is a Goal checkpoint or event, not a hidden reasoning trace, task queue, persistent state owner, or authority to act.
_Avoid_: Autonomous execution plan, persistent reflection ledger, completion proof, implicit approval

**Environment Baseline**:
The observable, recoverable condition required before a new self-evolution Goal may mutate source: active work has an owner and disposition, historical state is classified and archived, current changes are assigned and isolated or committed, and runtime identity and health are checked. It preserves evidence rather than erasing history.
_Avoid_: Git status clean alone, state wipe, blanket deletion, abstract IDE workspace

**Historical Archive**:
Recoverable, dated evidence retained outside an active Goal's default context. It is available only through explicit retrieval with origin and status preserved; current accepted ADRs, active-Goal evidence, and verified runtime facts take precedence. A conflict makes the archive superseded or excluded from active context, not silently deleted.
_Avoid_: Resident prompt, active instruction source, undocumented memory deletion

**Active Learning Signal**:
A recurring demand, repeated failure, repeated correction, repeated successful workflow, or environmental opportunity that should trigger autonomous skill drafting. Three independent occurrences is the default threshold for repeated demand.
_Avoid_: One-off request, idle curiosity

**Autonomous Operation**:
A mode where the agent selects and performs valuable work without a fresh external request, usually from idle time, discovered TODOs, repeated demand, or reflection output. It is bounded by seed policy, tool permissions, evidence capture, and rollback rules.
_Avoid_: User-requested task only, unchecked free run

**Opportunity Backlog**:
The ordered set of possible work the agent can choose from, including explicit tasks, unfinished tasks, repeated demands, failed workflows, stale skills, tool gaps, and autonomous discoveries.
_Avoid_: Random idea list, one-off brainstorm

**Growth Value Function**:
The scoring rule the agent uses to rank autonomous work by durable capability gain, evidence availability, urgency, repeat demand, risk, and cost. It exists to prevent autonomous operation from becoming unbounded wandering.
_Avoid_: Curiosity, novelty, generic productivity

**Exploration Budget**:
The bounded allowance for autonomous work in a cycle, such as turns, wall time, tool calls, side-effect level, or number of tasks. It keeps exploration useful and finite.
_Avoid_: Unlimited autonomous run

**Stop Exploration Signal**:
An explicit operator or policy signal that pauses or disables autonomous exploration. It may stop new autonomous task selection while preserving evidence, reports, and already-safe shutdown work.
_Avoid_: Permanent identity change, memory deletion

**Episodic Archive**:
The raw or near-raw record of sessions, tool calls, tests, outputs, corrections, and decisions. It is evidence for learning, not itself curated long-term memory.
_Avoid_: Durable memory, resident prompt

**Procedural Memory**:
Reusable operating knowledge such as SOPs, skills, scripts, templates, and evaluation cases. It captures how to do work, while semantic memory captures stable facts.
_Avoid_: Preference memory, raw transcript

**Agent Home**:
The user or profile directory for local agent increments, defaulting to `~/.local-runtime` and overrideable with `LOCAL_RUNTIME_HOME`. It stores active vault material, local config, state, logs, and future plugins without mutating repository seeds.
_Avoid_: Repository checkout, bundled seed directory

**Skill Seed**:
Procedural capability material that ships with the agent or a fork as a starting point for installation, examples, or broadly useful defaults. A seed may be copied, installed, upgraded, or ignored; it is not the user's active learning store by itself.
_Avoid_: User-owned skill vault, live procedural memory

**Skill Vault**:
The active procedural memory store for a specific user, machine, project, or team. It contains installed public skills, user-created skills, project skills, registry metadata, usage telemetry, and lifecycle events.
_Avoid_: Bundled seed directory, marketplace catalog

**Active Skill Vault**:
The Skill Vault selected for the current run. In installed mode it normally lives under `LOCAL_RUNTIME_HOME/vault/evi`; repository fixtures may be selected only by an explicit development configuration.
_Avoid_: Every configured seed root, all available skills

**Shared Asset Promotion**:
The evidence-gated external Git effect by which Evi decides that a sanitized, reusable node-local asset should be proposed to LuBan. Evi may create the proposal branch, commit, and pull request when policy permits; LuBan acceptance and each node's activation remain separate decisions with separate receipts.
_Avoid_: Runtime-state sync, automatic merge, global activation, local promotion alone

**Skill Resolver**:
The selection layer that chooses which skills from seeds, installed public sources, personal vaults, and project overlays enter a run. It preserves provenance and avoids treating every available skill as prompt context.
_Avoid_: Loading all skills, single flat skill folder

**Agent Asset Registry**:
A private, Git-backed canonical source for accepted reusable agent assets and
their typed metadata, provenance, version, and retirement history. LuBan fills
this role in v0.2. It does not select assets for a task, install them, or own
runtime state.
_Avoid_: Shared runtime home, installer daemon, marketplace, orchestration service

**Asset Selection Lock**:
The node-local record that binds a selected asset set to an Agent Asset
Registry commit, typed asset identities, content hashes, profile, and
compatibility result. It makes activation reproducible without turning the
registry into mutable runtime state.
_Avoid_: Mutable branch name, global latest version, catalog recommendation

**Activation Receipt**:
A node-local evidence record for staging, validation, atomic activation,
probation, and rollback of one asset selection. It proves only the named node's
result.
_Avoid_: Global deployment status, model confidence, registry acceptance

**Shared Knowledge Pack**:
A scoped, redacted, versioned semantic-memory summary deliberately promoted for
cross-node reuse. It enters context read-only and never merges raw episode or
MemoryStore state.
_Avoid_: Raw memory sync, conversation archive, project documentation copy

## Example Dialogue

Dev: Is Codex a tool inside the agent?

Domain expert: No. Codex is an **Agent Architecture Reference**. MCP and shell are **Tool Protocols** that the agent may use.

Dev: Can the agent ask Codex to do coding work?

Domain expert: Yes. In that case Codex is a **Delegated Agent Surface**: the agent delegates bounded work to it, then checks the result and records learning signals.

Dev: Should Codex `AGENTS.md` live in the agent core?

Domain expert: No. `AGENTS.md` is a **Host Instruction File** for Codex. It can adapt agent guidance into Codex, but it is not the **Self-Growing Agent Core**.

Dev: Does each repository get its own agent personality?

Domain expert: No. Each repository gets a **Project Overlay** on the same **Self-Growing Agent Core**.

Dev: Does skill promotion wait for a human reviewer?

Domain expert: No. The agent uses **Autonomous Audit** at the **Promotion Gate**. Humans may inspect reports later, but they are not part of the default growth loop.

Dev: Does the model directly update memory when it decides something matters?

Domain expert: No. The model returns a **Model Action Envelope**. The **Harness Kernel** validates it, then records **Evidence Events** before anything is promoted.

Dev: Can the agent choose work outside narrow capability-maintenance tasks?

Domain expert: Yes. The agent can choose from an **Opportunity Backlog**, but it must rank work with the **Growth Value Function**, obey an **Exploration Budget**, and stop when a **Stop Exploration Signal** applies.

Dev: If a user forks the agent, are the skills in that fork the user's active skill memory?

Domain expert: No. Forked skills are **Skill Seeds** unless the user installs or promotes them into a **Skill Vault**. The **Skill Resolver** decides what active skills are available for a run.
