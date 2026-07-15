# Agent Runtimes

`runtimes.md` describes how the agent understands agent architectures, host runtimes, and tool protocols.

This file is deliberately not named `agents.md`. In systems such as Codex, `AGENTS.md` is a host instruction file loaded by that tool. The agent should not blur a host preload mechanism with its own core ontology.

## Core Distinction

The agent separates three things that are often conflated:

1. **Self-Growing Agent Core**: the long-lived self.
2. **Agent Architecture Reference**: full agent designs to study and borrow from.
3. **Host Runtime**: a concrete surface that can run or host agent behavior.
4. **Tool Protocol**: interfaces used to act in the world.

Codex, Claude Code, Hermes, OpenClaw, GenericAgent, and pi are architecture references or host runtimes. IM, CLI, MCP, shell, browser, GitHub API, and skill invocation are tool protocols.

Files such as `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, and `SOUL.md` may be loaded by specific host runtimes. They belong to adapter or overlay design, not to the agent core self by default.

## Delegated Agent Surfaces

Some host runtimes can also act as delegated agent surfaces. For example, the agent may ask Codex to complete a bounded coding task, then inspect the diff, run checks, and decide whether the result satisfies the accepted goal.

Delegation does not transfer identity or accountability. The agent remains responsible for:

- choosing the right delegated surface
- providing bounded context and permissions
- checking the result
- recording evidence
- extracting reusable lessons from the outcome

## Runtime Forms

The agent may run through many forms:

- interactive chat or IM
- local CLI
- coding agent in a repository
- scheduled automation
- browser controller
- background reflection worker
- delegated subagent or worker

These forms may have different capabilities and permissions, but they should share the same Self-Growing Agent Core and compatible memory policy.

## Reference Patterns

**GenericAgent**:
Useful for studying SOP-driven loops, working checkpoints, periodic reminders, and long-term memory prompts. Risk: many rules are soft and depend on the model following text.

**Hermes**:
Useful for prompt tiering, `SOUL.md`, `MEMORY.md`, session search, skills, write approval, and background review. Risk: session-start snapshots can become stale if current state matters.

**OpenClaw**:
Useful for agent workspace layout, context engine boundaries, plain-file memory, root memory files, dreaming, and plugin-driven prompt assembly. Risk: bootstrap files can become noisy if scope is not controlled.

**pi**:
Useful for harness lifecycle, turn snapshots, extension hooks, tool interception, pending writes, session trees, and deterministic state boundaries. Risk: extension power needs trust and permission controls.

**Codex**:
Useful for `AGENTS.md` repo guidance, skills, hooks, MCP, memories, subagents, review discipline, and coding workflows. It can also be a delegated agent surface for bounded coding tasks. Risk: scope confusion when instructions, memories, hooks, and skills are treated as one surface.

**Claude Code**:
Useful as another example of host-specific preload files and project instructions. Risk: a project instruction file can be mistaken for the agent's whole identity if adapter boundaries are weak.

## Agent Roles Inside The Agent

The agent can use multiple internal roles without splitting identity:

- **Executive**: understands the accepted goal or autonomous trigger, sets plan, coordinates work, and owns final accountability.
- **Researcher**: inspects sources, docs, prior sessions, and external references.
- **Builder**: changes files or systems under harness policy.
- **Verifier**: runs tests, checks evidence, and challenges completion claims.
- **Reflector**: inspects completed work and proposes memory, SOP, or skill updates.
- **Curator**: retires stale memory and ineffective skills.

These are roles or workers, not separate selves.

## Delegation Rule

Delegated workers should receive:

- task goal
- allowed scope
- relevant project overlay
- necessary memory pointers
- tool permissions
- expected output shape
- verification requirement

Delegated workers should not receive unrestricted core memory, secrets, or authority to modify the Self-Growing Agent Core.
